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

# Track active thread per lead (for rejection flow)
scout_thread_map: dict[int, str] = {}

async def run_dynamic_scout(lead_id: int, event_title: str):
    """Main entry point for Scout Agent - fresh research."""
    log_agent_step(lead_id, "SYSTEM", f"🚀 Agent started for: {event_title}")
    logger.info(f"Starting scout agent for lead {lead_id}: {event_title}")
    
    # Track thread for this lead
    thread_id = str(lead_id)
    scout_thread_map[lead_id] = thread_id
    config = {"configurable": {"thread_id": thread_id}}

    query = f"""
    You are a Senior Sales Scout at Fresh Prints, a custom apparel company. 
    
    Your current task is to research and draft an outreach email for this lead:
    Lead: '{event_title}' (ID: {lead_id})
    
    You MUST follow these steps in order to gather comprehensive intelligence:
    
    STEP 1: RESEARCH - Call `search_university_news` to find recent news about this organization.
    
    STEP 2: SENTIMENT - Call `analyze_news_sentiment` with the news you found to understand if this is positive/negative news.
             Note the recommended tone for your email.
    
    STEP 3: SOCIAL PRESENCE - Call `find_organization_socials` to discover their LinkedIn/Instagram/Twitter presence.
    
    STEP 4: COMPETITIVE INTEL - Call `check_existing_apparel` to see if they have existing merch partnerships.
    
    STEP 5: VISUAL VIBE - Call `analyze_visual_vibe` to understand their brand aesthetic and colors.
    
    STEP 6: EMAIL TEMPLATE - Based on the sentiment analysis, call `get_email_template` with the recommended tone
             (formal, casual, congratulatory, or event_pitch).
    
    STEP 7: SAVE STRATEGY - Call `save_lead_strategy` with:
             - lead_id: {lead_id}
             - strategy: Your key findings summary
             - email_draft: A personalized email using the template, filled with your research
             - sentiment: The sentiment you detected (POSITIVE/NEUTRAL/NEGATIVE)
             - lead_score: A score from 1-100 based on how promising this lead is
    
    Do NOT skip any steps. Begin with Step 1 now.
    """
    
    return await _execute_scout_loop(lead_id, query, config)


async def run_scout_with_feedback(lead_id: int, feedback: str, thread_id: str):
    """Re-run Scout Agent with human feedback after rejection."""
    log_agent_step(lead_id, "SYSTEM", f"🔄 Regenerating with feedback: {feedback}")
    logger.info(f"Restarting scout for lead {lead_id} with feedback: {feedback}")
    
    # Update thread tracking
    scout_thread_map[lead_id] = thread_id
    config = {"configurable": {"thread_id": thread_id}}
    
    query = f"""
    You are a Senior Sales Scout at Fresh Prints. Lead ID: {lead_id}.
    
    The previous email draft was REJECTED with this feedback: '{feedback}'
    
    Please generate a COMPLETELY NEW draft that addresses this feedback.
    
    You may re-use some previous research, but focus on:
    1. Understanding what the human didn't like based on their feedback
    2. Adjusting the tone/style accordingly
    3. Perhaps trying a different email template type
    
    Steps:
    1. If feedback mentions tone, call `get_email_template` with a different type (formal/casual/congratulatory/event_pitch)
    2. If feedback mentions research, re-run relevant research tools
    3. Call `save_lead_strategy` with your improved draft
    
    Address the feedback: '{feedback}'
    Begin now.
    """
    
    return await _execute_scout_loop(lead_id, query, config)


async def _execute_scout_loop(lead_id: int, query: str, config: dict):
    """Internal execution loop shared by both entry points."""
    try:
        # First run: Start the agent
        logger.info("Starting agent execution...")
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
        max_iterations = 15  # Increased to handle more tools
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