from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver 
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from tools.mcp_bridge import scout_tools
from database import log_agent_step
import os
from dotenv import load_dotenv
import traceback
import logging

# Configure logging to file for debugging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('agent_debug.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)
memory = MemorySaver()

# Create agent with interrupt_before for human approval workflow
agent_executor = create_react_agent(
    llm, 
    scout_tools, 
    checkpointer=memory,
    interrupt_before=["tools"] 
)

async def run_dynamic_scout(lead_id: int, event_title: str):
    log_agent_step(lead_id, "SYSTEM", f"🚀 Agent started for: {event_title}")
    logger.info(f"Starting scout agent for lead {lead_id}: {event_title}")
    
    config = {"configurable": {"thread_id": str(lead_id)}}

    query = f"""
    You are a Senior Sales Scout at Fresh Prints, a custom apparel company. 
    
    Your current task is to research and draft an outreach email for this lead:
    Lead: '{event_title}' (ID: {lead_id})
    
    You MUST follow these steps in order:
    
    STEP 1: Call the search_university_news tool to find recent news about this organization.
    STEP 2: Call the analyze_visual_vibe tool to understand their visual style.
    STEP 3: Call the save_lead_strategy tool with your email_draft and strategy.
    
    Do NOT skip any steps. Begin with Step 1 now.
    """
    
    try:
        # First run: Start the agent
        logger.info("Starting initial agent execution...")
        async for event in agent_executor.astream(
            {"messages": [HumanMessage(content=query)]}, 
            config=config
        ):
            logger.debug(f"Event received: {event}")
            for node, values in event.items():
                if "messages" in values:
                    last_msg = values["messages"][-1]
                    logger.debug(f"Message type: {last_msg.type}, content: {last_msg.content[:100] if last_msg.content else 'None'}...")
                    if last_msg.type == "ai":
                        content = last_msg.content if last_msg.content else "(Agent is thinking...)"
                        log_agent_step(lead_id, "THOUGHT", content)
        
        # Check state after initial run
        state = agent_executor.get_state(config)
        logger.info(f"After initial run - state.next: {state.next}")
        
        # If no interrupt (no tool calls), agent just finished
        if not state.next:
            logger.warning("Agent finished without any tool calls!")
            log_agent_step(lead_id, "SYSTEM", "✅ Agent finished.")
            return "Done"
        
        # Auto-resume loop for non-save tools
        max_iterations = 10
        for iteration in range(max_iterations):
            logger.info(f"Iteration {iteration + 1}/{max_iterations}")
            
            state = agent_executor.get_state(config)
            logger.info(f"Current state.next: {state.next}")
            
            if not state.next:
                log_agent_step(lead_id, "SYSTEM", "✅ Agent finished.")
                return "Done"
            
            # Get pending tool calls
            last_message = state.values["messages"][-1]
            logger.debug(f"Last message: {type(last_message)}")
            
            tool_calls = []
            # Try different ways to get tool_calls
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                tool_calls = last_message.tool_calls
                logger.debug(f"Found tool_calls attribute: {tool_calls}")
            elif hasattr(last_message, 'additional_kwargs'):
                tool_calls = last_message.additional_kwargs.get('tool_calls', [])
                logger.debug(f"Found tool_calls in additional_kwargs: {tool_calls}")
            
            if not tool_calls:
                logger.warning("No tool calls found in pending state")
                break
            
            # Extract tool name (handle both dict and object formats)
            first_call = tool_calls[0]
            if isinstance(first_call, dict):
                tool_name = first_call.get('function', {}).get('name') or first_call.get('name', 'unknown')
            else:
                tool_name = getattr(first_call, 'name', 'unknown')
            
            logger.info(f"Pending tool: {tool_name}")
            
            # PAUSE for save_lead_strategy (requires human approval)
            if tool_name == "save_lead_strategy":
                log_agent_step(lead_id, "SYSTEM", "⚠️ PAUSED: Waiting for Human Approval to Save.")
                logger.info("Paused for human approval on save_lead_strategy")
                return "Waiting for Human"
            
            # AUTO-RESUME for other tools
            log_agent_step(lead_id, "TOOL", f"🔧 Executing: {tool_name}")
            logger.info(f"Auto-resuming for tool: {tool_name}")
            
            async for event in agent_executor.astream(None, config=config):
                logger.debug(f"Resume event: {event}")
                for node, values in event.items():
                    if "messages" in values:
                        last_msg = values["messages"][-1]
                        if last_msg.type == "ai" and last_msg.content:
                            log_agent_step(lead_id, "THOUGHT", last_msg.content)
                        elif last_msg.type == "tool":
                            result = str(last_msg.content)[:200] + "..." if len(str(last_msg.content)) > 200 else str(last_msg.content)
                            log_agent_step(lead_id, "TOOL_RESULT", f"Result: {result}")
        
        log_agent_step(lead_id, "SYSTEM", "✅ Agent finished.")
        return "Done"
        
    except Exception as e:
        error_msg = f"❌ Error: {str(e)}"
        logger.error(f"Agent error: {traceback.format_exc()}")
        log_agent_step(lead_id, "SYSTEM", error_msg)
        return "Error"