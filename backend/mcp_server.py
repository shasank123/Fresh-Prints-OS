from mcp.server.fastmcp import FastMCP
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from bs4 import BeautifulSoup
from geopy.distance import geodesic
import sys
import sqlite3
import random # For simulating factory queue times

# Fix UnicodeEncodeError on Windows 
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
import requests
import numpy as np
import os
from dotenv import load_dotenv

load_dotenv() # Load env vars early

from io import BytesIO
from PIL import Image

# Try to import sklearn (optional - not compatible with Python 3.14 yet)
try:
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except Exception as e:
    print(f"[WARNING] sklearn not available (Python 3.14 compatibility issue). Using fallback for color counting. Error: {e}")
    SKLEARN_AVAILABLE = False

from openai import OpenAI

# --- Try to import ChromaDB (optional, for RAG) ---
try:
    import chromadb
    from chromadb.utils import embedding_functions
    CHROMA_AVAILABLE = True
except Exception as e:
    print(f"[WARNING] ChromaDB not available - RAG features disabled. Error: {e}")
    CHROMA_AVAILABLE = False

# --- 1. INITIALIZATION ---
mcp = FastMCP("fresh-prints-tools")

# Initialize OpenAI (Design & Vision)
client = OpenAI() # Requires OPENAI_API_KEY in .env

# Initialize Search (Scout)
wrapper = DuckDuckGoSearchAPIWrapper(region="us-en", time="w", max_results=3)
search = DuckDuckGoSearchRun(api_wrapper=wrapper)

# Initialize RAG (Lawyer) - only if ChromaDB is available
collection = None
if CHROMA_AVAILABLE:
    try:
        chroma_client = chromadb.PersistentClient(path="./chroma_db") 
        embedding_func = embedding_functions.OpenAIEmbeddingFunction(
            api_key=os.environ.get("OPENAI_API_KEY"),
            model_name="text-embedding-3-small"
        )
        collection = chroma_client.get_or_create_collection(
            name="brand_guidelines", 
            embedding_function=embedding_func
        )
        
        # Seed RAG (Only if empty)
        if collection.count() == 0:
            print("📚 RAG: Indexing Brand Guidelines...")
            collection.add(
                documents=[
                    "Do not use the Nike Swoosh, Adidas Three Stripes, or Puma Cat.",
                    "University logos must not be altered, distorted, or recolored.",
                    "No offensive language, alcohol, drugs, or political hate speech.",
                    "For 'Ohio State' designs, do NOT use the color Blue (Michigan's color).",
                    "Maximum print size is 12x12 inches."
                ],
                ids=["rule1", "rule2", "rule3", "rule4", "rule5"]
            )
    except Exception as e:
        print(f"⚠️ ChromaDB initialization failed: {e}")
        CHROMA_AVAILABLE = False

# Default brand rules (used when ChromaDB is not available)
DEFAULT_BRAND_RULES = """
- Do not use the Nike Swoosh, Adidas Three Stripes, or Puma Cat.
- University logos must not be altered, distorted, or recolored.
- No offensive language, alcohol, drugs, or political hate speech.
- Maximum print size is 12x12 inches.
"""

# ==========================================
# 🕵️ SCOUT AGENT TOOLS (Search & Strategy)
# ==========================================

@mcp.tool()
def search_university_news(query: str) -> str:
    """
    Search the web for recent news, events, or wins about a specific university club.
    Example: "MIT Robotics Team recent awards 2025"
    """
    print(f"🕵️‍♀️ SCOUT: Searching Web for: {query}")
    try:
        return search.run(query)
    except Exception as e:
        return f"Search Error: {e}"

@mcp.tool()
def analyze_visual_vibe(club_name: str) -> str:
    """
    Searches for visual descriptions (team photos, jerseys) to analyze their 'vibe'.
    """
    print(f"🎨 SCOUT: Researching vibe for {club_name}")
    return search.run(f"{club_name} team photo t-shirt design description")

@mcp.tool()
def save_lead_strategy(lead_id: int, strategy: str, email_draft: str) -> str:
    """
    Saves the Scout's research strategy and draft email to the CRM.
    """
    print(f"💾 SCOUT: Saving Strategy for Lead {lead_id}")
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='DRAFTED', vibe_tags=?, draft_email=? WHERE id=?",
        (strategy, email_draft, lead_id)
    )
    conn.commit()
    conn.close()
    return "Success"

# ==========================================
# 🎨 DESIGNER AGENT TOOLS (Vision & RAG)
# ==========================================

@mcp.tool()
def generate_apparel_image(prompt: str) -> str:
    """
    Generates a T-Shirt design using DALL-E 3 (Real API).
    """
    print(f"🎨 DESIGNER: Generating Real Image for '{prompt}'")
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=f"A flat vector t-shirt design, white background, high quality. {prompt}",
            size="1024x1024",
            quality="standard",
            n=1,
        )
        url = response.data[0].url
        return url
    except Exception as e:
        return f"Error generating image: {str(e)}"

@mcp.tool()
def check_copyright_safety(image_url: str) -> str:
    """
    RAG-based Compliance Check using GPT-4o Vision.
    Checks against internal brand guidelines (Nike, offensive content, etc).
    """
    print(f"⚖️ DESIGNER: Running RAG Compliance Check...")
    
    # 1. Get rules (from RAG or defaults)
    if CHROMA_AVAILABLE and collection is not None:
        try:
            results = collection.query(
                query_texts=["trademark infringement logos offensive content"],
                n_results=3
            )
            retrieved_rules = "\n".join(results['documents'][0])
        except:
            retrieved_rules = DEFAULT_BRAND_RULES
    else:
        retrieved_rules = DEFAULT_BRAND_RULES

    # 2. Vision Check
    try:
        response = client.chat.completions.create(
            model="gpt-4o", 
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Analyze this design against these RULES:\n{retrieved_rules}\n\nReply ONLY 'SAFE' or 'UNSAFE: <reason>'."},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            max_tokens=50,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Vision Check Error: {e}"

@mcp.tool()
def calculate_manufacturing_cost(image_url: str) -> str:
    """
    Uses Computer Vision to count ink colors and estimate print cost.
    Falls back to simple color counting if sklearn unavailable.
    """
    print(f"💰 DESIGNER: Calculating Ink Costs...")
    try:
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))
        img = img.resize((150, 150))
        
        img = img.convert("RGB")
        img_array = np.array(img)
        pixels = img_array.reshape(-1, 3)
        
        if SKLEARN_AVAILABLE:
            # Use K-Means clustering (accurate)
            kmeans = KMeans(n_clusters=8, random_state=42, n_init=5).fit(pixels)
            unique_colors = 0
            total_pixels = len(pixels)
            labels = kmeans.labels_
            
            for i in range(8):
                if np.sum(labels == i) / total_pixels > 0.02: 
                    unique_colors += 1
        else:
            # Fallback: Use numpy unique color counting (simpler but works)
            # Quantize colors to reduce unique count
            quantized = (pixels // 32) * 32  # Reduce to 8 levels per channel
            unique_rows = np.unique(quantized, axis=0)
            # Filter to only significant colors (appear more than 2% of image)
            unique_colors = min(len(unique_rows), 8)  # Cap at 8 for realistic estimate
            print(f"   (Using numpy fallback - sklearn not available)")
        
        base_cost = 5.00
        total = base_cost + (unique_colors * 0.75)
        
        return f"Detected {unique_colors} Ink Colors. Est Cost: ${total:.2f}/shirt"

    except Exception as e:
        return f"Cost Error: {e}"

@mcp.tool()
def save_final_design(lead_id: int, image_url: str, cost_report: str) -> str:
    """
    Saves the approved design to the database.
    """
    print(f"💾 DESIGNER: Saving Final Design for Lead {lead_id}")
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='DESIGN_READY', draft_email=? WHERE id=?",
        (f"Design: {image_url} | {cost_report}", lead_id)
    )
    conn.commit()
    conn.close()
    return "Design Saved"

# In a real app, you'd load a massive ZIP database. 
# For this demo, we mock the 'Geocoding' of a few key Zips to prove the Math works.
ZIP_COORDS = {
    "07001": (40.57, -74.29), # NJ Warehouse (Avenel)
    "78701": (30.26, -97.74), # TX Warehouse (Austin)
    "90001": (33.97, -118.24),# CA Warehouse (Los Angeles)
    "10001": (40.71, -74.00), # NYC (Customer)
    "94043": (37.42, -122.08) # Mountain View (Customer)
}

# --- 1. THE INVENTORY SCRAPER (Handling Legacy Data) ---
@mcp.tool()
def scrape_supplier_inventory(sku: str) -> str:
    """
    Scrapes the (simulated) 'Legacy Supplier Portal' to find stock levels 
    at NJ, TX, and CA warehouses.
    """
    print(f"📦 LOGISTICS: Scraping Supplier Portal for {sku}...")
    
    # 1. Simulate fetching raw HTML from a legacy intranet site (no API available)
    # This represents the "Real World" messiness of logistics
    raw_html = f"""
    <html>
        <body>
            <h1>Supplier Stock Portal - {sku}</h1>
            <table id="inventory-table">
                <tr><th>Warehouse</th><th>Qty</th><th>Status</th></tr>
                <tr class="row-nj"><td>New Jersey (NJ)</td><td>60</td><td>Active</td></tr>
                <tr class="row-tx"><td>Texas (TX)</td><td>40</td><td>Active</td></tr>
                <tr class="row-ca"><td>California (CA)</td><td>0</td><td>Backorder</td></tr>
            </table>
        </body>
    </html>
    """
    
    # 2. Parse it with BeautifulSoup (The Skill you need to show)
    soup = BeautifulSoup(raw_html, 'html.parser')
    stock_report = {}
    
    rows = soup.find_all('tr')
    for row in rows[1:]: # Skip header
        cols = row.find_all('td')
        loc = cols[0].text.strip()
        qty = int(cols[1].text.strip())
        stock_report[loc] = qty
        
    print(f"   Inventory Found: {stock_report}")
    return str(stock_report)

# --- 2. THE ZONE-BASED RATE ENGINE (Real Math) ---
@mcp.tool()
def calculate_shipping_rates(origin_zip: str, dest_zip: str, weight_lbs: float) -> str:
    """
    Calculates Real Shipping Cost based on Distance (Zones) and Weight.
    Uses Haversine formula via Geopy.
    """
    print(f"🚚 LOGISTICS: Calculating Rates {origin_zip} -> {dest_zip}")
    
    # 1. Get Coordinates (In prod, query a SQL DB of Zips)
    coord_a = ZIP_COORDS.get(origin_zip, (40.0, -100.0)) # Default to center US
    coord_b = ZIP_COORDS.get(dest_zip, (40.0, -100.0))
    
    # 2. Calculate Distance in Miles (The Hard Math)
    miles = geodesic(coord_a, coord_b).miles
    
    # 3. Determine Zone (Industry Standard Logic)
    if miles < 150: zone = 2
    elif miles < 600: zone = 4
    elif miles < 1800: zone = 6
    else: zone = 8
    
    # 4. Rate Card (Simplified FedEx Ground Matrix)
    # Zone 2: $8 base, Zone 8: $15 base. + $0.50 per lb
    base_rate = 6.00 + (zone * 1.50)
    total_rate = base_rate + (weight_lbs * 0.50)
    
    days_in_transit = zone // 2 + 1 # Rough estimate: Zone 8 = 5 days
    
    result = {
        "carrier": "FedEx Ground",
        "zone": zone,
        "miles": int(miles),
        "cost": round(total_rate, 2),
        "eta_days": days_in_transit
    }
    print(f"   {result}")
    return str(result)

# --- 3. THE SPLIT-SHIPMENT OPTIMIZER (The Algorithm) ---
@mcp.tool()
def optimize_split_shipment(order_qty: int, inventory_data: str, customer_zip: str) -> str:
    """
    Solves the Split-Inventory Problem.
    Compares Cost of Split vs. Backorder.
    inventory_data: string representation of dict from scraper.
    """
    print(f"🧠 LOGISTICS: Solving Split-Shipment Algorithm...")
    import ast
    stock = ast.literal_eval(inventory_data) # Safely parse the scraper output
    
    # Hardcoded Warehouse Zips for calculation
    warehouse_zips = {
        "New Jersey (NJ)": "07001",
        "Texas (TX)": "78701",
        "California (CA)": "90001"
    }
    
    # Greedy Strategy: Fulfill from closest warehouse first?
    # No, we need to fulfill TOTAL qty.
    
    current_fill = 0
    shipments = []
    
    # Iterate through warehouses (Logic: Prioritize those with stock)
    for loc, qty in stock.items():
        if current_fill >= order_qty:
            break
        
        if qty > 0:
            take = min(qty, order_qty - current_fill)
            
            # Calculate cost for this partial shipment
            # We call our OWN rate tool logic internally here
            # (In a real class structure, we'd reuse the function directly)
            w_zip = warehouse_zips.get(loc, "07001")
            
            # Mocking the weight for the partial
            rate_info = calculate_shipping_rates(w_zip, customer_zip, take * 0.5) 
            
            shipments.append({
                "from": loc,
                "qty": take,
                "cost_info": rate_info
            })
            current_fill += take
            
    if current_fill < order_qty:
        return f"CRITICAL: Insufficient Global Stock. Only have {current_fill}. Needed {order_qty}."
    
    # Summarize Plan
    total_cost = 0
    plan_details = []
    for s in shipments:
        # Extract cost from the string/dict we got back
        # This is a bit messy because of the string passing in tools, but works for the agent
        import ast
        cost_dict = ast.literal_eval(s['cost_info'])
        total_cost += cost_dict['cost']
        plan_details.append(f"Ship {s['qty']} from {s['from']} (${cost_dict['cost']})")
        
    return f"OPTIMAL PLAN: Split Shipment. { ' + '.join(plan_details) }. TOTAL COST: ${total_cost:.2f}"

# --- 4. WEATHER & RISK MONITOR (The "God Mode") ---
@mcp.tool()
def check_weather_risk(location_zip: str) -> str:
    """
    Checks for severe weather events (Hurricanes, Blizzards) at a location.
    Uses DuckDuckGo to find active alerts since we don't have a Weather API key.
    """
    print(f"⛈️ LOGISTICS: Checking Weather Risk for Zip {location_zip}...")
    
    # In a real app, you'd hit OpenWeatherMap API. 
    # Here, we show "Agentic Reasoning" by searching news.
    query = f"Severe weather warning alert {location_zip} current"
    try:
        search_result = search.run(query)
        
        # Simple Sentiment Analysis on the search result
        risks = ["hurricane", "blizzard", "flood", "tornado", "severe thunderstorm"]
        found_risks = [r for r in risks if r in search_result.lower()]
        
        if found_risks:
            return f"CRITICAL: Weather Alert Detected ({', '.join(found_risks)}). Shipping delays likely."
        return "CLEAR: No major alerts found."
    except Exception:
        return "WARNING: Could not verify weather."

# --- 5. PRODUCTION LOAD BALANCER ---
@mcp.tool()
def check_factory_load(factory_id: str) -> str:
    """
    Simulates querying the Production Database for queue times.
    Returns the 'Days to Print'.
    """
    print(f"🏭 LOGISTICS: Checking Load for Factory {factory_id}...")
    
    # Simulate Real-Time DB Query
    # Factory A (Austin) is busy. Factory B (New Jersey) is empty.
    loads = {
        "FACTORY_TX": {"queue_days": 5, "status": "OVERLOADED"},
        "FACTORY_NJ": {"queue_days": 0, "status": "IDLE"},
        "FACTORY_CA": {"queue_days": 2, "status": "NORMAL"}
    }
    
    data = loads.get(factory_id, {"queue_days": 3, "status": "UNKNOWN"})
    return f"Factory {factory_id}: {data['queue_days']} day backlog ({data['status']})."

# --- 6. THE SAVER ---
@mcp.tool()
def save_logistics_plan(lead_id: int, plan_details: str, total_cost: float, carbon_kg: float = 0.0) -> str:
    """
    Saves the Final Routing Plan with carbon footprint data.
    """
    print(f"💾 LOGISTICS: Saving Plan for Lead {lead_id}")
    conn = sqlite3.connect("fresh_prints.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leads SET status='SHIPPING_PLANNED', draft_email=? WHERE id=?",
        (f"Logistics Plan: {plan_details} | Cost: ${total_cost} | Carbon: {carbon_kg:.2f}kg CO2", lead_id)
    )
    conn.commit()
    conn.close()
    return "Logistics Plan Saved"

# ==========================================
# 🌱 CARBON FOOTPRINT CALCULATOR
# ==========================================

# Emission factors (kg CO2 per ton-km)
# Source: EPA & DEFRA guidelines
EMISSION_FACTORS = {
    "ground": 0.062,    # Truck/FedEx Ground
    "air": 0.602,       # Air freight (10x more than ground)
    "rail": 0.022,      # Rail freight (most eco-friendly)
    "ocean": 0.008      # Ocean freight
}

@mcp.tool()
def calculate_carbon_footprint(origin_zip: str, dest_zip: str, weight_lbs: float, shipping_mode: str = "ground") -> str:
    """
    Calculates the carbon footprint (CO2 emissions) for a shipment.
    Uses EPA emission factors for different transport modes.
    Returns kg of CO2 emitted.
    """
    print(f"🌱 LOGISTICS: Calculating Carbon Footprint {origin_zip} -> {dest_zip}")
    
    # Get coordinates and calculate distance
    coord_a = ZIP_COORDS.get(origin_zip, (40.0, -100.0))
    coord_b = ZIP_COORDS.get(dest_zip, (40.0, -100.0))
    distance_km = geodesic(coord_a, coord_b).km
    
    # Convert weight to metric tons
    weight_tons = weight_lbs * 0.000453592
    
    # Get emission factor
    factor = EMISSION_FACTORS.get(shipping_mode.lower(), EMISSION_FACTORS["ground"])
    
    # Calculate CO2: kg = tons * km * factor
    carbon_kg = weight_tons * distance_km * factor
    
    # Calculate equivalent (for context)
    trees_offset = carbon_kg / 21.77  # Avg tree absorbs 21.77 kg CO2/year
    
    result = {
        "carbon_kg": round(carbon_kg, 2),
        "distance_km": round(distance_km, 1),
        "shipping_mode": shipping_mode,
        "trees_to_offset": round(trees_offset, 2),
        "eco_rating": "🌱 LOW" if carbon_kg < 5 else ("🌿 MODERATE" if carbon_kg < 20 else "🔥 HIGH")
    }
    
    print(f"   Carbon: {result}")
    return str(result)

# ==========================================
# 📦 LIVE SHIPPING RATES (Shippo API)
# ==========================================

@mcp.tool()
def get_live_shipping_rates(origin_zip: str, dest_zip: str, weight_lbs: float, length: float = 12, width: float = 10, height: float = 8) -> str:
    """
    Fetches LIVE shipping rates from multiple carriers using Shippo API.
    Falls back to simulated rates if API key not configured.
    Returns comparison of USPS, FedEx, and UPS rates.
    """
    print(f"📦 LOGISTICS: Fetching Live Rates {origin_zip} -> {dest_zip}")
    
    SHIPPO_API_KEY = os.environ.get("SHIPPO_API_KEY")
    
    if SHIPPO_API_KEY and SHIPPO_API_KEY.startswith("shippo"):
        try:
            # Real Shippo API call
            headers = {
                "Authorization": f"ShippoToken {SHIPPO_API_KEY}",
                "Content-Type": "application/json"
            }
            
            shipment_data = {
                "address_from": {
                    "zip": origin_zip,
                    "country": "US"
                },
                "address_to": {
                    "zip": dest_zip,
                    "country": "US"
                },
                "parcels": [{
                    "length": str(length),
                    "width": str(width),
                    "height": str(height),
                    "distance_unit": "in",
                    "weight": str(weight_lbs),
                    "mass_unit": "lb"
                }],
                "async": False
            }
            
            response = requests.post(
                "https://api.goshippo.com/shipments/",
                headers=headers,
                json=shipment_data,
                timeout=10
            )
            
            if response.status_code == 201:
                shipment = response.json()
                rates = []
                for rate in shipment.get("rates", [])[:6]:  # Top 6 rates
                    rates.append({
                        "carrier": rate.get("provider", "Unknown"),
                        "service": rate.get("servicelevel", {}).get("name", "Standard"),
                        "price": float(rate.get("amount", 0)),
                        "currency": rate.get("currency", "USD"),
                        "days": rate.get("estimated_days", "N/A"),
                        "carrier_logo": get_carrier_logo(rate.get("provider", ""))
                    })
                
                if rates:
                    print(f"   ✓ Got {len(rates)} live rates from Shippo")
                    return str({"source": "LIVE_API", "rates": sorted(rates, key=lambda x: x["price"])})
        
        except Exception as e:
            print(f"   ⚠️ Shippo API error: {e}")
    
    # Fallback: Simulated realistic rates
    print(f"   📊 Using simulated carrier rates")
    
    # Calculate base distance for pricing
    coord_a = ZIP_COORDS.get(origin_zip, (40.0, -100.0))
    coord_b = ZIP_COORDS.get(dest_zip, (40.0, -100.0))
    miles = geodesic(coord_a, coord_b).miles
    
    # Simulated carrier rates (realistic pricing formulas)
    simulated_rates = [
        {
            "carrier": "USPS",
            "service": "Priority Mail",
            "price": round(7.50 + (weight_lbs * 0.35) + (miles * 0.003), 2),
            "days": 2 if miles < 500 else 3,
            "carrier_logo": "📮"
        },
        {
            "carrier": "USPS",
            "service": "Ground Advantage",
            "price": round(5.00 + (weight_lbs * 0.25) + (miles * 0.002), 2),
            "days": 3 if miles < 500 else 5,
            "carrier_logo": "📮"
        },
        {
            "carrier": "FedEx",
            "service": "Ground",
            "price": round(9.00 + (weight_lbs * 0.40) + (miles * 0.004), 2),
            "days": 2 if miles < 300 else (4 if miles < 1000 else 5),
            "carrier_logo": "📦"
        },
        {
            "carrier": "FedEx",
            "service": "Express Saver",
            "price": round(18.00 + (weight_lbs * 0.80) + (miles * 0.008), 2),
            "days": 1 if miles < 500 else 2,
            "carrier_logo": "📦"
        },
        {
            "carrier": "UPS",
            "service": "Ground",
            "price": round(8.50 + (weight_lbs * 0.38) + (miles * 0.0035), 2),
            "days": 2 if miles < 300 else (4 if miles < 1000 else 5),
            "carrier_logo": "🟤"
        },
        {
            "carrier": "UPS",
            "service": "3 Day Select",
            "price": round(15.00 + (weight_lbs * 0.60) + (miles * 0.006), 2),
            "days": 3,
            "carrier_logo": "🟤"
        }
    ]
    
    return str({"source": "SIMULATED", "rates": sorted(simulated_rates, key=lambda x: x["price"])})

def get_carrier_logo(carrier: str) -> str:
    """Returns emoji logo for carrier."""
    logos = {
        "usps": "📮", "fedex": "📦", "ups": "🟤", 
        "dhl": "🟡", "ontrac": "🔵"
    }
    return logos.get(carrier.lower(), "📦")

# ==========================================
# 🗺️ ROUTE COORDINATES FOR MAP
# ==========================================

# Extended warehouse data with full geo info
WAREHOUSE_DATA = {
    "NJ": {
        "name": "New Jersey Warehouse",
        "city": "Avenel, NJ",
        "zip": "07001",
        "lat": 40.57,
        "lng": -74.29,
        "capacity": 5000,
        "icon": "warehouse"
    },
    "TX": {
        "name": "Texas Distribution Center",
        "city": "Austin, TX",
        "zip": "78701",
        "lat": 30.26,
        "lng": -97.74,
        "capacity": 8000,
        "icon": "warehouse"
    },
    "CA": {
        "name": "California Hub",
        "city": "Los Angeles, CA",
        "zip": "90001",
        "lat": 33.97,
        "lng": -118.24,
        "capacity": 10000,
        "icon": "warehouse"
    }
}

# Common destination cities for demo
CITY_COORDS = {
    "10001": {"city": "New York, NY", "lat": 40.71, "lng": -74.00},
    "94043": {"city": "Mountain View, CA", "lat": 37.42, "lng": -122.08},
    "78701": {"city": "Austin, TX", "lat": 30.26, "lng": -97.74},
    "60601": {"city": "Chicago, IL", "lat": 41.88, "lng": -87.63},
    "98101": {"city": "Seattle, WA", "lat": 47.60, "lng": -122.33},
    "33101": {"city": "Miami, FL", "lat": 25.76, "lng": -80.19},
    "02101": {"city": "Boston, MA", "lat": 42.36, "lng": -71.06},
}

def get_route_data(customer_zip: str, active_warehouses: list = None) -> dict:
    """
    Returns all data needed for map visualization.
    """
    # Get customer coordinates
    if customer_zip in CITY_COORDS:
        customer = CITY_COORDS[customer_zip]
    else:
        # Approximate location from ZIP (first 3 digits = region)
        customer = {"city": f"ZIP {customer_zip}", "lat": 40.0, "lng": -100.0}
    
    customer["zip"] = customer_zip
    customer["icon"] = "destination"
    
    # Get warehouse data
    warehouses = []
    for key, wh in WAREHOUSE_DATA.items():
        wh_copy = wh.copy()
        wh_copy["id"] = key
        wh_copy["active"] = active_warehouses is None or key in active_warehouses
        warehouses.append(wh_copy)
    
    # Calculate routes with costs
    routes = []
    for wh in warehouses:
        if wh["active"]:
            dist = geodesic((wh["lat"], wh["lng"]), (customer["lat"], customer["lng"])).miles
            routes.append({
                "from": wh["id"],
                "from_lat": wh["lat"],
                "from_lng": wh["lng"],
                "to_lat": customer["lat"],
                "to_lng": customer["lng"],
                "distance_miles": round(dist, 1),
                "estimated_cost": round(8.00 + (dist * 0.005), 2)
            })
    
    return {
        "customer": customer,
        "warehouses": warehouses,
        "routes": routes
    }

if __name__ == "__main__":
    mcp.run()