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
    
    2. RISK ASSESSMENT:
       - Call `check_weather_risk` for warehouses with stock (use their ZIP codes: NJ=07001, TX=78701, CA=90001).
       - If CRITICAL weather, flag that warehouse as HIGH RISK.
    
    3. CAPACITY ANALYSIS:
       - Call `check_factory_load` for factories: FACTORY_TX, FACTORY_NJ, FACTORY_CA.
       - If >3 days backlog, consider alternative factories.
    
    4. SHIPPING OPTIMIZATION:
       - Call `optimize_split_shipment` to calculate the best split across warehouses.
    
    5. CARRIER COMPARISON (IMPORTANT for cost savings):
       - Call `get_live_shipping_rates` from the best warehouse(s) to customer {customer_zip}.
       - Compare USPS, FedEx, and UPS options. Choose best value (cost vs. speed).
    
    6. SUSTAINABILITY CALCULATION:
       - Call `calculate_carbon_footprint` with origin/dest and total weight.
       - Include the carbon_kg in your final plan for ESG reporting.
    
    7. FINAL DECISION:
       - Call `save_logistics_plan` with:
         * plan_details: warehouse sources, carrier chosen, ETAs
         * total_cost: sum of all shipping costs
         * carbon_kg: environmental impact
    
    Always explain your reasoning for carrier selection and warehouse prioritization.
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

async def run_logistics_agent_with_feedback(lead_id: int, feedback: str, thread_id: str):
    """Runs the logistics agent with rejection feedback for regeneration."""
    config = {"configurable": {"thread_id": thread_id}}
    
    log_agent_step(lead_id, "SYSTEM", f"🔄 Regenerating Plan with Feedback...")

    query = f"""
    You are a Supply Chain Commander. The previous logistics plan was REJECTED.
    
    FEEDBACK FROM HUMAN: "{feedback}"
    
    Please reconsider the logistics strategy based on this feedback.
    
    RECALCULATE:
    1. STOCK: Call `scrape_supplier_inventory` again if needed.
    2. RISK: Re-check `check_weather_risk` if weather was a concern.
    3. CAPACITY: Re-check `check_factory_load` if capacity was mentioned.
    4. OPTIMIZE: Call `optimize_split_shipment` with adjusted parameters.
    5. FINAL: Call `save_logistics_plan` with your improved decision.
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