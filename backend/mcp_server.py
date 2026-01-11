from mcp.server.fastmcp import FastMCP
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
import sys
import sqlite3

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
from sklearn.cluster import KMeans
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
    Uses Computer Vision (K-Means) to count ink colors and estimate print cost.
    """
    print(f"💰 DESIGNER: Calculating Ink Costs...")
    try:
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))
        img = img.resize((150, 150))
        
        img = img.convert("RGB")
        img_array = np.array(img)
        pixels = img_array.reshape(-1, 3)
        
        # The Math: Count dominant color clusters
        kmeans = KMeans(n_clusters=8, random_state=42, n_init=5).fit(pixels)
        unique_colors = 0
        total_pixels = len(pixels)
        labels = kmeans.labels_
        
        for i in range(8):
            if np.sum(labels == i) / total_pixels > 0.02: 
                unique_colors += 1
        
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

if __name__ == "__main__":
    mcp.run()