from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from tools.mcp_bridge import designer_tools
from database import log_agent_step
import os
from dotenv import load_dotenv
import traceback
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
memory = MemorySaver()

# HITL Logic: Stop BEFORE any tool execution (we'll auto-resume non-save tools)
agent_executor = create_react_agent(
    llm, 
    designer_tools, 
    checkpointer=memory,
    interrupt_before=["tools"]  # Must use node name, not tool name
)

async def run_designer_agent(lead_id: int, vibe: str, feedback: str = None, thread_id: str = None):
    """
    vibe: The initial style (e.g., 'Retro 80s')
    feedback: If the user rejected the previous design, this contains their critique.
    thread_id: Optional thread ID (used when caller wants to specify the thread, e.g., for rejection)
    """
    
    # Use provided thread_id, or generate one
    if thread_id:
        pass  # Use the provided thread_id
    elif feedback:
        import time
        thread_id = f"{lead_id}_v{int(time.time())}"
    else:
        thread_id = str(lead_id)
    
    config = {"configurable": {"thread_id": thread_id}}
    
    if feedback:
        # REJECTION PATH: Fresh start with user's feedback incorporated
        log_agent_step(lead_id, "SYSTEM", f"🔄 User Rejected. Feedback: {feedback}")
        query = f"""
        You are a Senior T-Shirt Designer at Fresh Prints. Lead ID: {lead_id}.
        
        The previous design was REJECTED with this feedback: '{feedback}'
        
        Please generate a COMPLETELY NEW design that addresses this feedback.
        
        Follow this EXACT process:
        1. Call `generate_apparel_image` with a NEW creative prompt that addresses the feedback.
        2. Call `check_copyright_safety` with the generated image URL.
        3. If UNSAFE, generate a new image. If SAFE, continue.
        4. Call `calculate_manufacturing_cost` with the image URL.
        5. Finally, call `save_final_design` with the image_url and cost_report.
        
        Begin now with step 1.
        """
    else:
        # FRESH START
        log_agent_step(lead_id, "SYSTEM", f"🎨 Designer started. Vibe: {vibe}")
        query = f"""
        You are a Senior T-Shirt Designer at Fresh Prints. Lead ID: {lead_id}. Design Vibe: '{vibe}'.
        
        Follow this EXACT process:
        1. Call `generate_apparel_image` with a creative prompt based on the vibe.
        2. Call `check_copyright_safety` with the generated image URL.
        3. If UNSAFE, generate a new image. If SAFE, continue.
        4. Call `calculate_manufacturing_cost` with the image URL.
        5. Finally, call `save_final_design` with the image_url and cost_report.
        
        Begin now with step 1.
        """

    try:
        # Run the Agent
        logger.info(f"Starting designer for lead {lead_id}, thread {thread_id}")
        
        async for event in agent_executor.astream(
            {"messages": [HumanMessage(content=query)]}, 
            config=config
        ):
            for node, values in event.items():
                if "messages" in values:
                    last_msg = values["messages"][-1]
                    if last_msg.type == "ai" and last_msg.content:
                        log_agent_step(lead_id, "THOUGHT", last_msg.content)
        
        # Auto-resume loop for non-save tools
        max_iterations = 15
        for iteration in range(max_iterations):
            state = agent_executor.get_state(config)
            logger.info(f"Iteration {iteration + 1}, state.next: {state.next}")
            
            if not state.next:
                log_agent_step(lead_id, "SYSTEM", "✅ Designer finished.")
                return "Done"
            
            # Get pending tool calls
            last_message = state.values["messages"][-1]
            
            tool_calls = []
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                tool_calls = last_message.tool_calls
            elif hasattr(last_message, 'additional_kwargs'):
                tool_calls = last_message.additional_kwargs.get('tool_calls', [])
            
            if not tool_calls:
                break
            
            # Extract tool name
            first_call = tool_calls[0]
            if isinstance(first_call, dict):
                tool_name = first_call.get('function', {}).get('name') or first_call.get('name', 'unknown')
            else:
                tool_name = getattr(first_call, 'name', 'unknown')
            
            logger.info(f"Pending tool: {tool_name}")
            
            # PAUSE for save_final_design (requires human approval)
            if tool_name == "save_final_design":
                log_agent_step(lead_id, "SYSTEM", "⚠️ PAUSED: Design waiting for Human Approval.")
                return "Waiting for Approval"
            
            # AUTO-RESUME for other tools
            log_agent_step(lead_id, "TOOL", f"🔧 Executing: {tool_name}")
            async for event in agent_executor.astream(None, config=config):
                for node, values in event.items():
                    if "messages" in values:
                        last_msg = values["messages"][-1]
                        if last_msg.type == "ai" and last_msg.content:
                            log_agent_step(lead_id, "THOUGHT", last_msg.content)
                        elif last_msg.type == "tool":
                            result = str(last_msg.content)[:300] + "..." if len(str(last_msg.content)) > 300 else str(last_msg.content)
                            log_agent_step(lead_id, "TOOL_RESULT", f"Result: {result}")
        
        log_agent_step(lead_id, "SYSTEM", "✅ Designer finished.")
        return "Done"
        
    except Exception as e:
        error_msg = f"❌ Error: {str(e)}"
        logger.error(f"Designer error: {traceback.format_exc()}")
        log_agent_step(lead_id, "SYSTEM", error_msg)
        return "Error"