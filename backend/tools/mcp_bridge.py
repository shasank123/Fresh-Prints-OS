from langchain_core.tools import StructuredTool
# Import ALL functions from the unified server
from mcp_server import (
    search_university_news, 
    analyze_visual_vibe, 
    save_lead_strategy,
    generate_apparel_image,
    check_copyright_safety,
    calculate_manufacturing_cost,
    save_final_design
)

# Scout gets these
scout_tools = [
    StructuredTool.from_function(search_university_news),
    StructuredTool.from_function(analyze_visual_vibe),
    StructuredTool.from_function(save_lead_strategy)
]

# Designer gets these
designer_tools = [
    StructuredTool.from_function(generate_apparel_image),
    StructuredTool.from_function(check_copyright_safety),
    StructuredTool.from_function(calculate_manufacturing_cost),
    StructuredTool.from_function(save_final_design)
]