from langchain_core.tools import StructuredTool
# Import ALL functions from the unified server
from mcp_server import (
    search_university_news, 
    analyze_visual_vibe, 
    save_lead_strategy,
    # New Scout tools
    find_organization_socials,
    get_email_template,
    analyze_news_sentiment,
    check_existing_apparel,
    # Designer tools (base)
    generate_apparel_image,
    check_copyright_safety,
    calculate_manufacturing_cost,
    save_final_design,
    # New Designer tools
    generate_design_variations,
    render_on_mockup,
    extract_color_palette,
    apply_style_reference,
    calculate_profitability,
    suggest_ab_test,
    recommend_print_technique,
    # Logistics tools
    scrape_supplier_inventory,
    calculate_shipping_rates,
    optimize_split_shipment,
    check_weather_risk,     
    check_factory_load,     
    save_logistics_plan,
    # New advanced logistics tools
    calculate_carbon_footprint,
    get_live_shipping_rates,
    get_demand_forecast  # NEW: Demand forecasting
)

# Scout gets these (enhanced with 4 new tools)
scout_tools = [
    StructuredTool.from_function(search_university_news),
    StructuredTool.from_function(analyze_visual_vibe),
    StructuredTool.from_function(find_organization_socials),
    StructuredTool.from_function(get_email_template),
    StructuredTool.from_function(analyze_news_sentiment),
    StructuredTool.from_function(check_existing_apparel),
    StructuredTool.from_function(save_lead_strategy)
]

# Designer gets these (enhanced with 7 new tools)
designer_tools = [
    StructuredTool.from_function(generate_apparel_image),
    StructuredTool.from_function(generate_design_variations),
    StructuredTool.from_function(render_on_mockup),
    StructuredTool.from_function(extract_color_palette),
    StructuredTool.from_function(apply_style_reference),
    StructuredTool.from_function(check_copyright_safety),
    StructuredTool.from_function(calculate_manufacturing_cost),
    StructuredTool.from_function(calculate_profitability),
    StructuredTool.from_function(suggest_ab_test),
    StructuredTool.from_function(recommend_print_technique),
    StructuredTool.from_function(save_final_design)
]

# Logistics Tools (Enhanced with carbon, live rates & forecasting)
logistics_tools = [
    StructuredTool.from_function(scrape_supplier_inventory),
    StructuredTool.from_function(calculate_shipping_rates),
    StructuredTool.from_function(optimize_split_shipment),
    StructuredTool.from_function(check_weather_risk),
    StructuredTool.from_function(check_factory_load),
    StructuredTool.from_function(calculate_carbon_footprint),
    StructuredTool.from_function(get_live_shipping_rates),
    StructuredTool.from_function(get_demand_forecast),  # NEW
    StructuredTool.from_function(save_logistics_plan)
]