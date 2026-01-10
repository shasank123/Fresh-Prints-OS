import sqlite3
import os

DB_NAME = "fresh_prints.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    # 1. Reset DB for the Demo
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 2. Create Leads Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT UNIQUE,
        title TEXT,
        organization TEXT,
        status TEXT DEFAULT 'NEW',
        vibe_tags TEXT,
        draft_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Create Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        agent_type TEXT,
        log_message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()
    print("✅ Database Initialized")

def log_agent_step(lead_id: int, step_type: str, message: str):
    """
    Saves an agent's thought or action to the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # We let SQLite handle the timestamp automatically
    cursor.execute("""
        INSERT INTO agent_logs (lead_id, agent_type, log_message)
        VALUES (?, ?, ?)
    """, (lead_id, step_type, message))
    
    conn.commit()
    conn.close()
    # print(f"📝 DB LOG [{step_type}]: {message[:50]}...") # Optional: Keep for debugging

if __name__ == "__main__":
    init_db()