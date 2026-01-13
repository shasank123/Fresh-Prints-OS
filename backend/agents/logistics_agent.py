from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from tools.mcp_bridge import logistics_tools
from database import log_agent_step
import os
from dotenv import load_dotenv

load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)
memory = MemorySaver()

# HITL: Interrupt before executing tools to allow human review
# Must use node name "tools", not specific tool name
agent_executor = create_react_agent(
    llm, 
    logistics_tools, 
    checkpointer=memory,
    interrupt_before=["tools"]
)

async def run_logistics_agent(lead_id: int, customer_zip: str, order_qty: int, sku: str):
    config = {"configurable": {"thread_id": str(lead_id)}}
    
    log_agent_step(lead_id, "SYSTEM", f"🚚 Logistics Agent Started. SKU: {sku}")

    query = f"""
    You are a Supply Chain Commander - an advanced logistics AI. 
    Goal: Route {order_qty} units of '{sku}' to Customer ZIP {customer_zip}.
    
    EXECUTE THIS MULTI-STEP ANALYSIS:
    
    1. INVENTORY CHECK: 
       - Call `scrape_supplier_inventory` to find stock levels at warehouses (NJ, TX, CA).
       - IMPORTANT: If total inventory is less than {order_qty}, you MUST still proceed to step 7 and save a plan with status "INSUFFICIENT_STOCK".
    
    2. RISK ASSESSMENT:
       - Call `check_weather_risk` for warehouses with stock (use their ZIP codes: NJ=07001, TX=78701, CA=90001).
       - If CRITICAL weather, flag that warehouse as HIGH RISK.
    
    3. CAPACITY ANALYSIS:
       - Call `check_factory_load` for factories: FACTORY_TX, FACTORY_NJ, FACTORY_CA.
       - If >3 days backlog, consider alternative factories.
    
    4. SHIPPING OPTIMIZATION:
       - Call `optimize_split_shipment` to calculate the best split across warehouses.
       - If it returns "CRITICAL: Insufficient Stock", STILL PROCEED to step 7.
    
    5. CARRIER COMPARISON (IMPORTANT for cost savings):
       - Call `get_live_shipping_rates` from the best warehouse(s) to customer {customer_zip}.
       - Compare USPS, FedEx, and UPS options. Choose best value (cost vs. speed).
       - Skip this step if inventory was insufficient.
    
    6. SUSTAINABILITY CALCULATION:
       - Call `calculate_carbon_footprint` with origin/dest and total weight.
       - Include the carbon_kg in your final plan for ESG reporting.
       - Skip this step if inventory was insufficient.
    
    7. FINAL DECISION (ALWAYS REQUIRED):
       - You MUST ALWAYS call `save_logistics_plan` at the end, even if:
         * Inventory is insufficient (save plan_details="INSUFFICIENT STOCK: Need {order_qty}, only X available. Recommend backorder or production run.")
         * Weather is critical (save with warning note)
         * Any other issue occurs
       - Include: warehouse sources, carrier chosen, ETAs, or failure reason
       - total_cost: sum of shipping costs (or 0.0 if failed)
       - carbon_kg: environmental impact (or 0.0 if failed)
    
    CRITICAL: Never stop without saving a plan. Always complete step 7.
    """
    
    async for event in agent_executor.astream(
        {"messages": [HumanMessage(content=query)]}, 
        config=config
    ):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "ai":
                     log_agent_step(lead_id, "THOUGHT", last_msg.content)
    
    # Check for Pause (HITL)
    state = agent_executor.get_state(config)
    if state.next:
        log_agent_step(lead_id, "SYSTEM", "⚠️ PAUSED: High-Stakes Plan needs Approval.")
        return "Waiting for Approval"

    return "Done"

async def run_logistics_agent_with_feedback(lead_id: int, feedback: str, thread_id: str, context: dict = None):
    """Runs the logistics agent with rejection feedback for regeneration."""
    config = {"configurable": {"thread_id": thread_id}}
    
    log_agent_step(lead_id, "SYSTEM", f"🔄 Regenerating Plan with Feedback...")
    
    # Get order context
    sku = context.get("sku", "UNKNOWN") if context else "UNKNOWN"
    order_qty = context.get("order_qty", 0) if context else 0
    customer_zip = context.get("customer_zip", "UNKNOWN") if context else "UNKNOWN"

    query = f"""
    You are a Supply Chain Commander. The previous logistics plan was REJECTED.
    
    ORIGINAL ORDER DETAILS:
    - SKU: {sku}
    - Quantity: {order_qty} units
    - Customer ZIP: {customer_zip}
    
    FEEDBACK FROM HUMAN: "{feedback}"
    
    The human has overridden the previous decision. Based on their feedback, proceed accordingly.
    
    If they say "approve for now" or similar, save a plan that acknowledges the stock issue but proceeds with available stock.
    If they request changes, recalculate as needed.
    
    FINAL STEP (REQUIRED): Call `save_logistics_plan` with your decision.
    - plan_details: Include what stock is available and the human's feedback
    - total_cost: Estimated cost (or 0.0)
    - carbon_kg: Estimated carbon (or 0.0)
    """
    
    async for event in agent_executor.astream(
        {"messages": [HumanMessage(content=query)]}, 
        config=config
    ):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "ai":
                     log_agent_step(lead_id, "THOUGHT", last_msg.content)
    
    # Check for Pause (HITL)
    state = agent_executor.get_state(config)
    if state.next:
        log_agent_step(lead_id, "SYSTEM", "⚠️ PAUSED: Revised Plan needs Approval.")
        return "Waiting for Approval"

    return "Done"
