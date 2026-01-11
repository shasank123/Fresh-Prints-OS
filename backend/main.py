import json
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware 
from pydantic import BaseModel
from agents.scout_agent import run_dynamic_scout, agent_executor
from agents.designer_agent import run_designer_agent, agent_executor as designer_executor
from database import log_agent_step

# Track active thread per lead (for rejection flow)
lead_thread_map: dict[int, str] = {}

app = FastAPI(title="Fresh Prints OS Brain")

# 1. Enable CORS (So Next.js on localhost:3000 or 3001 can talk to Python)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Allow your Frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LeadPayload(BaseModel):
    lead_id: int
    title: str

# --- 1. TRIGGER THE AGENT ---
@app.post("/run-scout")
async def trigger_scout(payload: LeadPayload, background_tasks: BackgroundTasks):
    """
    Kicks off the autonomous research process in the background.
    """
    # Run in background so API returns instantly (Async Architecture)
    background_tasks.add_task(run_dynamic_scout, payload.lead_id, payload.title)
    return {"status": "Scout Agent started", "lead_id": payload.lead_id}

# --- 2. GET LIVE THINKING LOGS ---
@app.get("/logs/{lead_id}")
def get_agent_logs(lead_id: int):
    """
    Returns the thinking history. Polled by UI every 2s.
    """
    import sqlite3
    conn = sqlite3.connect("fresh_prints.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM agent_logs WHERE lead_id = ? ORDER BY id ASC", (lead_id,))
    logs = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return {"logs": logs}

# --- 3. PEEK AT THE PENDING DRAFT (Before Approval) ---
@app.get("/lead-pending-draft/{lead_id}")
async def get_pending_draft(lead_id: int):
    """
    UI calls this to see WHAT the agent wants to save.
    """
    config = {"configurable": {"thread_id": str(lead_id)}}
    
    # Get the frozen state from LangGraph
    state = agent_executor.get_state(config)
    
    if state.next:
        # Dig into the last message to find the tool call
        last_message = state.values["messages"][-1]
        
        # Try to get tool_calls from either location (newer LangChain uses direct attribute)
        tool_calls = []
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            tool_calls = last_message.tool_calls
        elif hasattr(last_message, 'additional_kwargs') and "tool_calls" in last_message.additional_kwargs:
            tool_calls = last_message.additional_kwargs['tool_calls']
        
        if tool_calls:
            # Handle both dict format (additional_kwargs) and object format (tool_calls attr)
            first_call = tool_calls[0]
            if isinstance(first_call, dict):
                tool_name = first_call.get('function', {}).get('name') or first_call.get('name', '')
                raw_args = first_call.get('function', {}).get('arguments') or json.dumps(first_call.get('args', {}))
            else:
                # Object format
                tool_name = getattr(first_call, 'name', '')
                raw_args = json.dumps(getattr(first_call, 'args', {}))
            
            # Check if it's the save_lead_strategy tool (the one requiring approval)
            if tool_name == "save_lead_strategy":
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    return {
                        "status": "waiting_for_approval",
                        "pending_draft": args.get('email_draft'),
                        "strategy": args.get('strategy')
                    }
                except json.JSONDecodeError:
                    return {"status": "error", "detail": "Could not parse agent arguments"}
            
    return {"status": "no_pending_action"}

# --- 4. APPROVE AND EXECUTE ---
@app.post("/approve-lead/{lead_id}")
async def approve_lead(lead_id: int):
    """
    Human clicks 'Approve'. We resume the Agent.
    """
    print(f"👍 Human Approved Lead {lead_id}. Resuming Agent...")
    
    config = {"configurable": {"thread_id": str(lead_id)}}
    
    # Resume the graph (Input None tells it to just proceed with the pending action)
    async for event in agent_executor.astream(None, config=config):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "tool":
                     # Log the tool output
                     log_agent_step(lead_id, "TOOL_RESULT", f"Output: {last_msg.content}")

    log_agent_step(lead_id, "SYSTEM", "✅ Draft Saved to CRM after Human Approval.")
    
    return {"status": "Agent Resumed and Finished"}

class DesignPayload(BaseModel):
    lead_id: int
    vibe: str

# 1. TRIGGER
@app.post("/run-designer")
async def trigger_designer(payload: DesignPayload, background_tasks: BackgroundTasks):
    import asyncio
    
    # Track thread for this lead (initial run uses lead_id as thread)
    lead_thread_map[payload.lead_id] = str(payload.lead_id)
    
    def run_async_agent(lead_id, vibe):
        """Wrapper to run async agent in background thread"""
        asyncio.run(run_designer_agent(lead_id, vibe))
    
    background_tasks.add_task(run_async_agent, payload.lead_id, payload.vibe)
    return {"status": "Designer Started"}

# 2. GET PENDING DESIGN (For UI)
@app.get("/design-pending-review/{lead_id}")
async def get_pending_design(lead_id: int):
    # Use the tracked thread (handles rejection with new thread)
    thread_id = lead_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    state = designer_executor.get_state(config)
    
    if state.next:
        last_message = state.values["messages"][-1]
        
        # Try to get tool_calls from either location
        tool_calls = []
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            tool_calls = last_message.tool_calls
        elif hasattr(last_message, 'additional_kwargs') and "tool_calls" in last_message.additional_kwargs:
            tool_calls = last_message.additional_kwargs['tool_calls']
        
        if tool_calls:
            first_call = tool_calls[0]
            # Handle both dict and object formats
            if isinstance(first_call, dict):
                tool_name = first_call.get('function', {}).get('name') or first_call.get('name', '')
                raw_args = first_call.get('function', {}).get('arguments') or json.dumps(first_call.get('args', {}))
            else:
                tool_name = getattr(first_call, 'name', '')
                raw_args = json.dumps(getattr(first_call, 'args', {}))
            
            if tool_name == "save_final_design":
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    return {
                        "status": "waiting_for_approval",
                        "image_url": args.get('image_url'),
                        "cost_report": args.get('cost_report')
                    }
                except json.JSONDecodeError:
                    return {"status": "error", "detail": "Could not parse arguments"}
                    
    return {"status": "no_pending_action"}

# 3. REJECT (Feedback Loop)
class RejectionPayload(BaseModel):
    feedback: str

@app.post("/reject-design/{lead_id}")
async def reject_design(lead_id: int, payload: RejectionPayload, background_tasks: BackgroundTasks):
    """
    User hates the design. We inject the feedback and restart the agent.
    """
    import asyncio
    import time
    
    # Generate new thread ID for this rejection attempt
    new_thread_id = f"{lead_id}_v{int(time.time())}"
    lead_thread_map[lead_id] = new_thread_id
    
    print(f"X Design Rejected for {lead_id}: {payload.feedback} -> New Thread: {new_thread_id}")
    
    def run_async_agent_with_feedback(lead_id, feedback, thread_id):
        """Wrapper to run async agent with feedback in background thread"""
        asyncio.run(run_designer_agent(lead_id, "", feedback, thread_id))
    
    background_tasks.add_task(run_async_agent_with_feedback, lead_id, payload.feedback, new_thread_id)
    
    return {"status": "Feedback sent to Agent. Regenerating..."}

# 4. APPROVE
@app.post("/approve-design/{lead_id}")
async def approve_design(lead_id: int):
    """
    User loves it. Resume the 'save_final_design' tool call.
    """
    print(f"✅ Design Approved for {lead_id}")
    config = {"configurable": {"thread_id": str(lead_id)}}
    
    async for event in designer_executor.astream(None, config=config):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "tool":
                     log_agent_step(lead_id, "TOOL_RESULT", f"Output: {last_msg.content}")

    log_agent_step(lead_id, "SYSTEM", "✅ Final Design Saved to Database.")
    return {"status": "Design Saved"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)