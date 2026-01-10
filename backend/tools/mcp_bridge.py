from langchain_core.tools import StructuredTool
from mcp_server import search_university_news, analyze_visual_vibe, save_lead_strategy

# We wrap the MCP functions as LangChain StructuredTools so the Agent can understand the schema
scout_tools = [
    StructuredTool.from_function(search_university_news),
    StructuredTool.from_function(analyze_visual_vibe),
    StructuredTool.from_function(save_lead_strategy)
]