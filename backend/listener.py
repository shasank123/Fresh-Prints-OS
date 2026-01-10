import feedparser
import time
import sqlite3
import requests

# Real University News Feeds
FEEDS = [
    "https://news.mit.edu/rss/feed",
    "https://news.umich.edu/feed/", 
    "https://www.yale.edu/rss/current/news.xml"
]

KEYWORDS = ["win", "award", "competition", "championship", "hackathon", "robotics"]

def listen():
    print("📡 Listening for University Events...")
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()

    for url in FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:3]: # Check top 3
                title = entry.title
                link = entry.link
                
                # Filter for "Sellable" Events
                if any(k in title.lower() for k in KEYWORDS):
                    
                    # Deduplication
                    cursor.execute("SELECT id FROM leads WHERE source_id = ?", (link,))
                    if cursor.fetchone():
                        continue
                        
                    print(f"🚨 EVENT FOUND: {title}")
                    
                    # 1. Save to DB
                    cursor.execute(
                        "INSERT INTO leads (source_id, title, organization, status) VALUES (?, ?, ?, 'NEW')",
                        (link, title, "Unknown Club")
                    )
                    lead_id = cursor.lastrowid
                    conn.commit()
                    
                    # 2. Trigger The Sales Agent (The Brain)
                    # Updated endpoint and payload structure to match main.py
                    try:
                        requests.post("http://localhost:8000/run-scout", json={
                            "lead_id": lead_id,
                            "title": title
                        })
                        print(f"🚀 Sales Agent Triggered for Lead {lead_id}!")
                    except Exception as e:
                        print(f"⚠️ Brain is offline. Saved to DB only. Error: {e}")
                        
        except Exception as e:
            print(f"Error parsing {url}: {e}")

    conn.close()

if __name__ == "__main__":
    while True:
        listen()
        time.sleep(30) # Poll every 30 seconds