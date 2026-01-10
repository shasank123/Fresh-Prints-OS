from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver 
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from tools.mcp_bridge import scout_tools
from database import log_agent_step
import os
from dotenv import load_dotenv

load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)
memory = MemorySaver() # <--- NEW: Stores the "Frozen" Agent

# We tell LangGraph to STOP before executing the 'save_lead_strategy' tool
# This effectively pauses the agent right after it decides to save, but before it actually writes to the DB.
agent_executor = create_react_agent(
    llm, 
    scout_tools, 
    checkpointer=memory,
    interrupt_before=["save_lead_strategy"] 
)

async def run_dynamic_scout(lead_id: int, event_title: str):
    log_agent_step(lead_id, "SYSTEM", f"🚀 Agent started for: {event_title}")
    
    # We use the lead_id as the unique "Thread ID" for memory
    config = {"configurable": {"thread_id": str(lead_id)}}

    query = f"""
    You are a Senior Sales Scout. Lead: '{event_title}' (ID: {lead_id}).
    GOAL: Draft email.
    PROCESS:
    1. Research event & vibe.
    2. CALL 'save_lead_strategy' to save the draft.
    """
    
    # Run the Agent
    async for event in agent_executor.astream(
        {"messages": [HumanMessage(content=query)]}, 
        config=config
    ):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "ai":
                     log_agent_step(lead_id, "THOUGHT", last_msg.content)
    
    # Check if we paused
    state = agent_executor.get_state(config)
    if state.next:
        log_agent_step(lead_id, "SYSTEM", "⚠️ PAUSED: Waiting for Human Approval to Save.")
        return "Waiting for Human"
        
    log_agent_step(lead_id, "SYSTEM", "✅ Agent finished.")
    return "Done"