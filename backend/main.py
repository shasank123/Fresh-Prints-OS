import json
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware 
from pydantic import BaseModel
from agents.scout_agent import run_dynamic_scout, run_scout_with_feedback, agent_executor, scout_thread_map
from agents.designer_agent import run_designer_agent, agent_executor as designer_executor
from agents.logistics_agent import run_logistics_agent, run_logistics_agent_with_feedback, agent_executor as logistics_executor
from database import log_agent_step
from mcp_server import get_demand_forecast

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

# --- DEMAND FORECAST API ---
@app.get("/demand-forecast/{sku}")
def get_forecast(sku: str, days: int = 7):
    """
    Returns demand forecast for a SKU.
    """
    result = get_demand_forecast(sku, days)
    return json.loads(result)

# --- 3. PEEK AT THE PENDING DRAFT (Before Approval) ---
@app.get("/lead-pending-draft/{lead_id}")
async def get_pending_draft(lead_id: int):
    """
    UI calls this to see WHAT the agent wants to save.
    Enhanced to return sentiment and lead_score for display.
    """
    # Use tracked thread (handles rejection with new thread)
    thread_id = scout_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    
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
                        "strategy": args.get('strategy'),
                        "sentiment": args.get('sentiment', 'NEUTRAL'),
                        "lead_score": args.get('lead_score', 75)
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
    
    # Use tracked thread for consistency
    thread_id = scout_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    
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

# --- 5. REJECT LEAD AND REGENERATE ---
class ScoutRejectionPayload(BaseModel):
    feedback: str

@app.post("/reject-lead/{lead_id}")
async def reject_lead(lead_id: int, payload: ScoutRejectionPayload, background_tasks: BackgroundTasks):
    """
    Human rejects the draft. We inject feedback and restart the agent.
    """
    import asyncio
    import time
    
    # Generate new thread ID for this rejection attempt
    new_thread_id = f"{lead_id}_scout_v{int(time.time())}"
    scout_thread_map[lead_id] = new_thread_id
    
    print(f"❌ Scout Draft Rejected for {lead_id}: {payload.feedback} -> New Thread: {new_thread_id}")
    log_agent_step(lead_id, "SYSTEM", f"❌ Draft Rejected. Feedback: {payload.feedback}")
    
    def run_async_agent_with_feedback(lead_id, feedback, thread_id):
        """Wrapper to run async agent with feedback in background thread"""
        asyncio.run(run_scout_with_feedback(lead_id, feedback, thread_id))
    
    background_tasks.add_task(run_async_agent_with_feedback, lead_id, payload.feedback, new_thread_id)
    
    return {"status": "Feedback sent to Agent. Regenerating draft..."}

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

# 2. GET PENDING DESIGN (For UI) - Enhanced to return tool results
@app.get("/design-pending-review/{lead_id}")
async def get_pending_design(lead_id: int):
    # Use the tracked thread (handles rejection with new thread)
    thread_id = lead_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    state = designer_executor.get_state(config)
    
    # Helper to extract tool results from message history
    def extract_tool_results(messages):
        results = {
            "color_palette": None,
            "print_technique": None,
            "profitability": None
        }
        for msg in messages:
            if hasattr(msg, 'type') and msg.type == 'tool':
                content = str(msg.content)
                try:
                    # Try to parse as JSON
                    data = json.loads(content)
                    if 'palette' in data:
                        results['color_palette'] = data
                    elif 'recommended_technique' in data:
                        results['print_technique'] = data
                    elif 'margin_percent' in data:
                        results['profitability'] = data
                except:
                    pass
        return results
    
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
                    
                    # Extract tool results from message history
                    tool_results = extract_tool_results(state.values["messages"])
                    
                    return {
                        "status": "waiting_for_approval",
                        "image_url": args.get('image_url'),
                        "cost_report": args.get('cost_report'),
                        "color_count": args.get('color_count', 5),
                        "print_technique_name": args.get('print_technique', 'Screen Print'),
                        "profit_margin": args.get('profit_margin', 60.0),
                        # Include parsed tool results
                        "color_palette": tool_results.get('color_palette'),
                        "print_technique": tool_results.get('print_technique'),
                        "profitability": tool_results.get('profitability')
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

# 4. ART DIRECTOR APPROVES (Stage 1 - Internal)
@app.post("/approve-design/{lead_id}")
async def approve_design(lead_id: int):
    """
    Art Director approves. Design now awaits Apparel Chair (customer) approval.
    Does NOT save yet - just updates status.
    """
    print(f"✅ Art Director Approved Design for {lead_id}")
    
    # Update status to awaiting customer approval
    import sqlite3
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='PENDING_CUSTOMER_APPROVAL' WHERE id=?",
        (lead_id,)
    )
    conn.commit()
    conn.close()
    
    log_agent_step(lead_id, "SYSTEM", "✅ Art Director Approved. Awaiting Apparel Chair approval.")
    return {"status": "Pending Customer Approval", "message": "Ready to send to Apparel Chair"}

# Storage for customer approval tokens
customer_approval_tokens: dict[str, dict] = {}

# 5. SEND TO APPAREL CHAIR (Customer Email)
class CustomerEmailPayload(BaseModel):
    customer_email: str
    customer_name: str = "Apparel Chair"

@app.post("/send-to-customer/{lead_id}")
async def send_to_customer(lead_id: int, payload: CustomerEmailPayload):
    """
    Generates approval token and simulates sending email to Apparel Chair.
    In production, this would actually send email via SendGrid/SES.
    """
    import uuid
    import sqlite3
    
    # Generate unique approval token
    token = str(uuid.uuid4())[:8]
    
    # Try to get design details from agent_logs (more reliable for Designer)
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    
    # First try leads table
    cursor.execute("SELECT title, draft_email FROM leads WHERE id=?", (lead_id,))
    row = cursor.fetchone()
    
    if row:
        title = row[0] or f"Design #{lead_id}"
    else:
        # Fallback: Get info from agent_logs
        cursor.execute(
            "SELECT log_message FROM agent_logs WHERE lead_id = ? AND log_message LIKE '%Design%' LIMIT 1",
            (lead_id,)
        )
        log_row = cursor.fetchone()
        title = f"Design #{lead_id}" if not log_row else f"Fresh Prints Design #{lead_id}"
    
    conn.close()
    
    # Store token with lead info
    customer_approval_tokens[token] = {
        "lead_id": lead_id,
        "customer_email": payload.customer_email,
        "customer_name": payload.customer_name,
        "title": title,
        "created_at": str(datetime.now())
    }
    
    # Simulated email (in production, use SendGrid/SES)
    approval_url = f"http://localhost:8000/customer-approve/{token}"
    reject_url = f"http://localhost:8000/customer-reject/{token}"
    
    print(f"📧 SIMULATED EMAIL to {payload.customer_email}")
    print(f"   Subject: Fresh Prints Design Ready for Approval - {title}")
    print(f"   Approve: {approval_url}")
    print(f"   Reject: {reject_url}")
    
    log_agent_step(lead_id, "SYSTEM", f"📧 Email sent to {payload.customer_email}. Token: {token}")
    
    return {
        "status": "Email sent (simulated)",
        "token": token,
        "approval_url": approval_url,
        "reject_url": reject_url,
        "customer_email": payload.customer_email
    }

# 6. CUSTOMER APPROVES (Stage 2 - External/Final)
from datetime import datetime

@app.get("/customer-approve/{token}")
async def customer_approve(token: str):
    """
    Public endpoint - Apparel Chair clicks this link to approve.
    No auth required - token-based validation.
    """
    if token not in customer_approval_tokens:
        return {"error": "Invalid or expired token", "message": "This approval link has already been used or has expired."}
    
    token_data = customer_approval_tokens[token]
    lead_id = token_data["lead_id"]
    
    print(f"✅ Customer (Apparel Chair) Approved Design for Lead {lead_id}")
    
    # Try to resume the agent to save the final design
    try:
        config = {"configurable": {"thread_id": str(lead_id)}}
        
        async for event in designer_executor.astream(None, config=config):
            for node, values in event.items():
                if "messages" in values:
                    last_msg = values["messages"][-1]
                    if last_msg.type == "tool":
                         log_agent_step(lead_id, "TOOL_RESULT", f"Output: {last_msg.content}")
    except Exception as e:
        print(f"Agent resume error (may be expected if no pending action): {e}")
        # Continue anyway - the design was approved
    
    log_agent_step(lead_id, "SYSTEM", f"✅ Apparel Chair ({token_data['customer_name']}) Approved! Design Saved.")
    
    # Remove used token
    del customer_approval_tokens[token]
    
    # Return a nice HTML page for the customer
    from fastapi.responses import HTMLResponse
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Design Approved - Fresh Prints</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }}
            .container {{ text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; max-width: 500px; }}
            h1 {{ color: #4ade80; margin-bottom: 20px; }}
            p {{ color: #94a3b8; line-height: 1.6; }}
            .emoji {{ font-size: 64px; margin-bottom: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="emoji">✅</div>
            <h1>Design Approved!</h1>
            <p>Thank you, <strong>{token_data['customer_name']}</strong>!</p>
            <p>Your approval has been recorded and the design has been saved. The Fresh Prints team will begin production shortly.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #64748b;">You can close this tab now.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

# 7. CUSTOMER REJECTS
@app.get("/customer-reject/{token}")
async def customer_reject(token: str, feedback: str = "Customer requested changes"):
    """
    Public endpoint - Apparel Chair clicks this link to reject.
    """
    if token not in customer_approval_tokens:
        return {"error": "Invalid or expired token", "message": "This link has already been used or has expired."}
    
    token_data = customer_approval_tokens[token]
    lead_id = token_data["lead_id"]
    
    print(f"❌ Customer (Apparel Chair) Rejected Design for Lead {lead_id}")
    
    # Update status back to needs review
    import sqlite3
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='CUSTOMER_REJECTED' WHERE id=?",
        (lead_id,)
    )
    conn.commit()
    conn.close()
    
    log_agent_step(lead_id, "SYSTEM", f"❌ Apparel Chair Rejected: {feedback}")
    
    # Trigger designer agent to regenerate with feedback
    import time
    new_thread_id = f"{lead_id}_v{int(time.time())}"
    lead_thread_map[lead_id] = new_thread_id
    
    log_agent_step(lead_id, "SYSTEM", "🔄 Regenerating Design based on Apparel Chair feedback...")
    
    import asyncio
    def run_regeneration():
        asyncio.run(run_designer_agent_with_feedback(lead_id, f"Apparel Chair feedback: {feedback}", new_thread_id))
    
    from threading import Thread
    Thread(target=run_regeneration).start()
    
    # Remove used token
    del customer_approval_tokens[token]
    
    # Return a nice HTML page
    from fastapi.responses import HTMLResponse
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Changes Requested - Fresh Prints</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }}
            .container {{ text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; max-width: 500px; }}
            h1 {{ color: #f59e0b; margin-bottom: 20px; }}
            p {{ color: #94a3b8; line-height: 1.6; }}
            .emoji {{ font-size: 64px; margin-bottom: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="emoji">📝</div>
            <h1>Changes Requested</h1>
            <p>Thank you, <strong>{token_data['customer_name']}</strong>!</p>
            <p>Your feedback "<em>{feedback}</em>" has been sent to the design team.</p>
            <p>They are now generating a <strong>new design</strong> based on your input.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #64748b;">You will receive a new email when the updated design is ready.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

# 8. CHECK CUSTOMER APPROVAL STATUS
@app.get("/customer-approval-status/{lead_id}")
def get_customer_approval_status(lead_id: int):
    """
    Frontend polls this to check if customer has approved.
    """
    import sqlite3
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM leads WHERE id=?", (lead_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return {"status": "not_found"}
    
    return {"status": row[0]}

# 1. TRIGGER
class LogisticsPayload(BaseModel):
    lead_id: int
    customer_zip: str
    order_qty: int
    sku: str

# Track active thread per logistics lead (for rejection flow)
logistics_thread_map: dict[int, str] = {}

# Store original order context for rejection flow
logistics_order_context: dict[int, dict] = {}

@app.post("/run-logistics")
async def trigger_logistics(payload: LogisticsPayload, background_tasks: BackgroundTasks):
    import asyncio
    
    # Track thread for this lead (initial run uses lead_id as thread)
    logistics_thread_map[payload.lead_id] = str(payload.lead_id)
    
    # Store order context for rejection flow
    logistics_order_context[payload.lead_id] = {
        "customer_zip": payload.customer_zip,
        "order_qty": payload.order_qty,
        "sku": payload.sku
    }
    
    def run_async_agent(lead_id, customer_zip, order_qty, sku):
        """Wrapper to run async agent in background thread"""
        asyncio.run(run_logistics_agent(lead_id, customer_zip, order_qty, sku))
    
    background_tasks.add_task(
        run_async_agent, 
        payload.lead_id, 
        payload.customer_zip, 
        payload.order_qty, 
        payload.sku
    )
    return {"status": "Logistics Agent Started"}

# 2. REVIEW PENDING PLAN (The HITL Modal)
@app.get("/logistics-pending-plan/{lead_id}")
async def get_logistics_plan(lead_id: int):
    # Use the tracked thread (handles rejection with new thread)
    thread_id = logistics_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    state = logistics_executor.get_state(config)
    
    # Check if save_logistics_plan was already executed by scanning message history
    # This prevents the infinite "thinking" loop after approval
    if state.values and "messages" in state.values:
        for msg in state.values["messages"]:
            if hasattr(msg, 'type') and msg.type == 'tool':
                content = str(msg.content) if hasattr(msg, 'content') else ''
                if 'Logistics Plan Saved' in content:
                    # Plan was already saved, agent should stop
                    return {"status": "completed"}
    
    if state.next:
        last_message = state.values["messages"][-1]
        
        # Try to get tool_calls from either location (dual-check pattern)
        tool_calls = []
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            tool_calls = last_message.tool_calls
        elif hasattr(last_message, 'additional_kwargs') and "tool_calls" in last_message.additional_kwargs:
            tool_calls = last_message.additional_kwargs['tool_calls']
        
        if tool_calls:
            first_call = tool_calls[0]
            # Handle both dict format (additional_kwargs) and object format (tool_calls attr)
            if isinstance(first_call, dict):
                tool_name = first_call.get('function', {}).get('name') or first_call.get('name', '')
                raw_args = first_call.get('function', {}).get('arguments') or json.dumps(first_call.get('args', {}))
            else:
                # Object format
                tool_name = getattr(first_call, 'name', '')
                raw_args = json.dumps(getattr(first_call, 'args', {}))
            
            # Only pause for the final save_logistics_plan tool
            if tool_name == "save_logistics_plan":
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    return {
                        "status": "waiting_for_approval",
                        "plan_details": args.get('plan_details'),
                        "total_cost": args.get('total_cost')
                    }
                except json.JSONDecodeError:
                    return {"status": "error", "detail": "Could not parse arguments"}
            else:
                # AUTO-RESUME: For non-save tools, continue the agent automatically
                # This allows the agent to run through all analysis steps without user intervention
                print(f"🔄 Auto-resuming logistics agent for tool: {tool_name}")
                try:
                    async for event in logistics_executor.astream(None, config=config):
                        for node, values in event.items():
                            if "messages" in values:
                                last_msg = values["messages"][-1]
                                if last_msg.type == "tool":
                                    log_agent_step(lead_id, "TOOL_RESULT", f"{tool_name}: {last_msg.content[:200]}...")
                except Exception as e:
                    print(f"Auto-resume error: {e}")
                
                # Return processing status - frontend will poll again
                return {"status": "processing"}
                    
    return {"status": "no_pending_action"}

# 3. APPROVE PLAN
@app.post("/approve-logistics/{lead_id}")
async def approve_logistics(lead_id: int):
    print(f"✅ Logistics Plan Approved for {lead_id}")
    # Use tracked thread for consistency
    thread_id = logistics_thread_map.get(lead_id, str(lead_id))
    config = {"configurable": {"thread_id": thread_id}}
    
    # Check if this is an insufficient stock case before resuming
    state = logistics_executor.get_state(config)
    is_insufficient_stock = False
    
    if state.next:
        last_message = state.values["messages"][-1]
        tool_calls = []
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            tool_calls = last_message.tool_calls
        elif hasattr(last_message, 'additional_kwargs') and "tool_calls" in last_message.additional_kwargs:
            tool_calls = last_message.additional_kwargs['tool_calls']
        
        if tool_calls:
            first_call = tool_calls[0]
            if isinstance(first_call, dict):
                raw_args = first_call.get('function', {}).get('arguments') or json.dumps(first_call.get('args', {}))
            else:
                raw_args = json.dumps(getattr(first_call, 'args', {}))
            
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                plan_details = args.get('plan_details', '').lower()
                if 'insufficient' in plan_details:
                    is_insufficient_stock = True
            except:
                pass
    
    async for event in logistics_executor.astream(None, config=config):
        for node, values in event.items():
            if "messages" in values:
                last_msg = values["messages"][-1]
                if last_msg.type == "tool":
                     log_agent_step(lead_id, "TOOL_RESULT", f"Output: {last_msg.content}")

    # Log appropriate message based on stock status
    if is_insufficient_stock:
        log_agent_step(lead_id, "SYSTEM", "📧 Stock Shortage Notification sent to Apparel Chair.")
        return {"status": "Stock Shortage Notification Sent"}
    else:
        log_agent_step(lead_id, "SYSTEM", "✅ Order Routed & Saved.")
        return {"status": "Plan Executed"}


# 4. REJECT PLAN (Feedback Loop)
class LogisticsRejectionPayload(BaseModel):
    feedback: str

@app.post("/reject-logistics/{lead_id}")
async def reject_logistics(lead_id: int, payload: LogisticsRejectionPayload, background_tasks: BackgroundTasks):
    """
    User rejects the logistics plan. We inject the feedback and restart the agent.
    """
    import asyncio
    import time
    
    # Get original order context
    order_context = logistics_order_context.get(lead_id, {})
    
    # Generate new thread ID for this rejection attempt
    new_thread_id = f"{lead_id}_logistics_v{int(time.time())}"
    logistics_thread_map[lead_id] = new_thread_id
    
    print(f"❌ Logistics Plan Rejected for {lead_id}: {payload.feedback} -> New Thread: {new_thread_id}")
    log_agent_step(lead_id, "SYSTEM", f"❌ Plan Rejected. Feedback: {payload.feedback}")
    
    def run_async_agent_with_feedback(lead_id, feedback, thread_id, context):
        """Wrapper to run async agent with feedback in background thread"""
        asyncio.run(run_logistics_agent_with_feedback(lead_id, feedback, thread_id, context))
    
    background_tasks.add_task(run_async_agent_with_feedback, lead_id, payload.feedback, new_thread_id, order_context)
    
    return {"status": "Feedback sent to Agent. Regenerating plan..."}

# ==========================================
# 🗺️ ADVANCED LOGISTICS ENDPOINTS
# ==========================================

# Import the helper functions
from mcp_server import get_route_data, get_live_shipping_rates, calculate_carbon_footprint

class RouteDataPayload(BaseModel):
    customer_zip: str
    active_warehouses: list[str] | None = None

@app.post("/logistics-route-data")
async def get_logistics_route_data(payload: RouteDataPayload):
    """
    Returns all warehouse/route data for map visualization.
    """
    route_data = get_route_data(payload.customer_zip, payload.active_warehouses)
    return route_data

class RatesPayload(BaseModel):
    origin_zip: str
    dest_zip: str
    weight_lbs: float

@app.post("/logistics-rates")
async def get_logistics_rates(payload: RatesPayload):
    """
    Returns carrier rate comparison from Shippo (or simulated).
    """
    import ast
    rates_str = get_live_shipping_rates(payload.origin_zip, payload.dest_zip, payload.weight_lbs)
    rates_data = ast.literal_eval(rates_str)
    return rates_data

class CarbonPayload(BaseModel):
    origin_zip: str
    dest_zip: str
    weight_lbs: float
    shipping_mode: str = "ground"

@app.post("/logistics-carbon")
async def get_logistics_carbon(payload: CarbonPayload):
    """
    Returns carbon footprint calculation for a shipment.
    """
    import ast
    carbon_str = calculate_carbon_footprint(
        payload.origin_zip, 
        payload.dest_zip, 
        payload.weight_lbs, 
        payload.shipping_mode
    )
    carbon_data = ast.literal_eval(carbon_str)
    return carbon_data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)