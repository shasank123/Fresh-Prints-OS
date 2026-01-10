from mcp.server.fastmcp import FastMCP
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
import sqlite3

# 1. Initialize the MCP Server
mcp = FastMCP("fresh-prints-tools")

# 2. Setup Search Engine (The Logic)
wrapper = DuckDuckGoSearchAPIWrapper(region="us-en", time="w", max_results=3)
search = DuckDuckGoSearchRun(api_wrapper=wrapper)

# --- Define Tools using MCP Decorators ---

@mcp.tool()
def search_university_news(query: str) -> str:
    """
    Search the web for recent news, events, or wins about a specific university club.
    Example: "MIT Robotics Team recent awards 2025"
    """
    print(f"🕵️‍♀️ MCP SERVER: Executing Search for '{query}'")
    try:
        return search.run(query)
    except Exception as e:
        return f"Search Error: {str(e)}"

@mcp.tool()
def analyze_visual_vibe(club_name: str) -> str:
    """
    Searches for visual descriptions of a club to analyze their 'vibe'.
    """
    print(f"🎨 MCP SERVER: analyzing vibe for '{club_name}'")
    query = f"{club_name} team photo t-shirt design description"
    return search.run(query)

@mcp.tool()
def save_lead_strategy(lead_id: int, strategy: str, email_draft: str) -> str:
    """
    Saves the final strategy and email draft to the CRM database.
    """
    print(f"💾 MCP SERVER: Saving to CRM for Lead {lead_id}")
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='DRAFTED', vibe_tags=?, draft_email=? WHERE id=?",
        (strategy, email_draft, lead_id)
    )
    conn.commit()
    conn.close()
    return "Success"

if __name__ == "__main__":
    # This allows you to run "python mcp_server.py" to start the tool server independently
    mcp.run()