import sqlite3
import os

DB_NAME = "fresh_prints.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME) # Clean start for the demo
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. CRM Leads (The Sales Target)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT UNIQUE,  -- RSS Link or Reddit ID
        title TEXT,
        organization TEXT,
        status TEXT DEFAULT 'NEW', -- NEW, DRAFTED, CONTACTED
        vibe_tags TEXT,
        draft_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Agent Logs (The "Brain" Memory)
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

if __name__ == "__main__":
    init_db()