from langchain_core.tools import StructuredTool
# Import ALL functions from the unified server
from mcp_server import (
    search_university_news, 
    analyze_visual_vibe, 
    save_lead_strategy,
    generate_apparel_image,
    check_copyright_safety,
    calculate_manufacturing_cost,
    save_final_design,
    scrape_supplier_inventory,
    calculate_shipping_rates,
    optimize_split_shipment,
    check_weather_risk,     
    check_factory_load,     
    save_logistics_plan,
    # New advanced logistics tools
    calculate_carbon_footprint,
    get_live_shipping_rates
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

# Logistics Tools (Enhanced with carbon & live rates)
logistics_tools = [
    StructuredTool.from_function(scrape_supplier_inventory),
    StructuredTool.from_function(calculate_shipping_rates),
    StructuredTool.from_function(optimize_split_shipment),
    StructuredTool.from_function(check_weather_risk),
    StructuredTool.from_function(check_factory_load),
    StructuredTool.from_function(calculate_carbon_footprint),
    StructuredTool.from_function(get_live_shipping_rates),
    StructuredTool.from_function(save_logistics_plan)
]