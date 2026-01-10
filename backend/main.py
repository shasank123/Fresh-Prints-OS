import json
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware 
from pydantic import BaseModel
from agents.scout_agent import run_dynamic_scout, agent_executor
from database import log_agent_step

app = FastAPI(title="Fresh Prints OS Brain")

# 1. Enable CORS (So Next.js on localhost:3000 can talk to Python)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow your Frontend
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
        
        # Check if the agent is trying to call a tool
        if hasattr(last_message, 'additional_kwargs') and "tool_calls" in last_message.additional_kwargs:
            tool_calls = last_message.additional_kwargs['tool_calls']
            if tool_calls:
                # Extract arguments safely
                raw_args = tool_calls[0]['function']['arguments']
                try:
                    args = json.loads(raw_args) # <--- SAFER than eval()
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)