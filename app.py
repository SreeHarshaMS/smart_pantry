import os
import time
import datetime
import sqlite3
import threading
import requests
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)
DB_PATH = 'warehouse.db'

# In-memory system events log
system_events = []

def add_event(message, type="info"):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    system_events.insert(0, {
        "timestamp": timestamp,
        "message": message,
        "type": type
    })
    # Keep only the last 50 events
    if len(system_events) > 50:
        system_events.pop()
    print(f"[{timestamp}] {message}")

# Mock local dictionary for quick offline fallback
MOCK_PRODUCTS = {
    "5449000000096": "Coca-Cola Classic (330ml)",
    "7622300440606": "Oreo Original Cookies",
    "0028400070560": "Lay's Classic Potato Chips",
    "5449000131806": "Sprite Lemon-Lime Soda",
    "3017620422003": "Nutella Hazelnut Spread",
    "0012044000302": "Lipton Yellow Label Tea",
    "7613034626844": "Nescafe Classic Coffee",
    "8000300181515": "Barilla Spaghetti No.5",
    "123456789012": "Instant Ramen Pack",
    "987654321098": "Organic Wheat Flour (1kg)",
    "8901138815431": "himalaya face wash"
}

def query_product_name(barcode):
    """
    Queries the Open Food Facts API for the barcode.
    Falls back to a mock dictionary or generic label if not found or offline.
    """
    # 1. Check local mock dictionary
    if barcode in MOCK_PRODUCTS:
        add_event(f"Resolved barcode {barcode} locally from system catalog.", "success")
        return MOCK_PRODUCTS[barcode]

    # 2. Query Open Food Facts API
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    headers = {
        "User-Agent": "SmartGodownInventorySystem/1.0 (sreeh@example.com)"
    }
    try:
        response = requests.get(url, headers=headers, timeout=3.0)
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == 1:
                product = data.get("product", {})
                # Try common name fields
                name = product.get("product_name") or product.get("product_name_en") or product.get("generic_name")
                if name:
                    add_event(f"Resolved barcode {barcode} via Open Food Facts API: {name}.", "success")
                    return name
    except Exception as e:
        add_event(f"Network error querying barcode {barcode}: {e}", "warning")

    # 3. Final fallback
    product_name = f"Generic Item ({barcode[-6:] if len(barcode) > 6 else barcode})"
    add_event(f"No database match for {barcode}. Logged as {product_name}.", "info")
    return product_name
SHELF_LIFE_DAYS = {
    "Coca-Cola Classic (330ml)": 90,
    "Oreo Original Cookies": 120,
    "Lay's Classic Potato Chips": 90,
    "Sprite Lemon-Lime Soda": 90,
    "Nutella Hazelnut Spread": 180,
    "Lipton Yellow Label Tea": 365,
    "Nescafe Classic Coffee": 365,
    "Barilla Spaghetti No.5": 365,
    "Instant Ramen Pack": 180,
    "Organic Wheat Flour (1kg)": 365,
    "himalaya face wash": 730
}

def get_shelf_life_days(product_name):
    """
    Returns the shelf life duration in days based on the product category or name.
    """
    if not product_name:
        return 30
        
    product_name_lower = product_name.lower()
    
    # Check exact dictionary match
    if product_name in SHELF_LIFE_DAYS:
        return SHELF_LIFE_DAYS[product_name]
        
    # Keyword-based classifications
    if "milk" in product_name_lower or "dairy" in product_name_lower or "yogurt" in product_name_lower:
        return 7  # Milk/Dairy expires very fast
    if "bread" in product_name_lower or "bun" in product_name_lower or "bakery" in product_name_lower:
        return 5  # Bread expires extremely fast
    if "coca-cola" in product_name_lower or "coke" in product_name_lower or "sprite" in product_name_lower or "soda" in product_name_lower or "beverage" in product_name_lower or "juice" in product_name_lower:
        return 90  # Soda/Beverages last about 3 months
    if "cookie" in product_name_lower or "biscuit" in product_name_lower or "chip" in product_name_lower or "snack" in product_name_lower:
        return 120  # Cookies & Snacks last about 4 months
    if "flour" in product_name_lower or "spaghetti" in product_name_lower or "pasta" in product_name_lower or "rice" in product_name_lower or "grain" in product_name_lower or "tea" in product_name_lower or "coffee" in product_name_lower:
        return 365  # Grains and dry items last 1 year
    if "face wash" in product_name_lower or "shampoo" in product_name_lower or "soap" in product_name_lower or "cream" in product_name_lower or "cosmetic" in product_name_lower or "lotion" in product_name_lower:
        return 730  # Cosmetics/Face wash last 2 years
    if "canned" in product_name_lower or "tomato" in product_name_lower or "soup" in product_name_lower:
        return 730  # Canned food lasts 2 years
        
    # Default fallback
    return 30

def process_scanned_barcode(barcode):
    """
    Core business logic: Resolves barcode, sets expiry dynamically based on product type,
    and updates the first 'Empty' rack in the database.
    """
    barcode = barcode.strip()
    if not barcode:
        return

    add_event(f"Barcode scanned: {barcode}", "info")
    product_name = query_product_name(barcode)

    # Get dynamic shelf life
    shelf_life = get_shelf_life_days(product_name)
    today = datetime.date.today()
    expiry_date = today + datetime.timedelta(days=shelf_life)
    expiry_str = expiry_date.strftime("%Y-%m-%d")

    # Update database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find the first empty slot (excluding private Zone P)
    cursor.execute("SELECT id, zone, rack_number FROM racks WHERE status = 'Empty' AND zone != 'P' LIMIT 1")
    empty_rack = cursor.fetchone()

    if empty_rack:
        rack_id, zone, rack_number = empty_rack
        # Calculate dynamic status
        status = 'Safe'
        cursor.execute("""
            UPDATE racks 
            SET product_name = ?, box_id = ?, expiry_date = ?, status = ?
            WHERE id = ?
        """, (product_name, barcode, expiry_str, status, rack_id))
        conn.commit()
        add_event(f"Placed '{product_name}' (Box: {barcode}) into Rack {zone}{rack_number}.", "success")
    else:
        add_event(f"CAPACITY ALERT: Barcode {barcode} scanned, but all warehouse racks are FULL!", "danger")

    conn.close()

# --- Keyboard listener using pynput ---
barcode_buffer = []
last_key_time = 0.0

def on_press(key):
    global barcode_buffer, last_key_time
    now = time.time()
    
    # Timing check to filter out manual typing (human typing vs hardware emulator)
    # Hardware scanners send keystrokes extremely rapidly (< 50ms gaps)
    # If the gap between keys is long, reset buffer.
    if barcode_buffer:
        gap = now - last_key_time
        if gap > 0.12:  # 120ms threshold
            barcode_buffer = []
            
    last_key_time = now

    try:
        # Detect enter key (terminates barcode scan)
        if key == keyboard.Key.enter:
            if barcode_buffer:
                barcode_str = "".join(barcode_buffer)
                barcode_buffer = []
                # Process scanned barcode
                process_scanned_barcode(barcode_str)
        # Capture printable characters
        elif hasattr(key, 'char') and key.char is not None:
            barcode_buffer.append(key.char)
        # Handle space key if scanner includes it
        elif key == keyboard.Key.space:
            barcode_buffer.append(' ')
    except Exception as e:
        print(f"Error in keyboard listener: {e}")

def start_keyboard_listener():
    # Delay slightly to allow the server to start first
    time.sleep(1.0)
    add_event("USB Keyboard Barcode Listener Daemon started.", "info")
    listener = keyboard.Listener(on_press=on_press)
    listener.daemon = True
    listener.start()

# --- Flask Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM racks ORDER BY zone, rack_number")
    rows = cursor.fetchall()
    conn.close()

    # Dynamically verify / update expiring status based on current date
    # In a production warehouse, items within 7 days of expiry are 'Expiring'
    today = datetime.date.today()
    inventory = []
    
    for row in rows:
        item = dict(row)
        if item['product_name'] and item['expiry_date']:
            try:
                expiry_dt = datetime.datetime.strptime(item['expiry_date'], "%Y-%m-%d").date()
                days_left = (expiry_dt - today).days
                if days_left <= 7:
                    item['status'] = 'Expiring'
                else:
                    item['status'] = 'Safe'
                item['days_remaining'] = days_left
            except Exception:
                item['days_remaining'] = 0
            
            # If it's a filled private locker
            if item['zone'] == 'P':
                owner = "Pinky" if item['rack_number'] == 1 else "Vinod"
                item['display_name'] = f"[Private] {item['product_name']}"
            else:
                item['display_name'] = item['product_name']
        else:
            item['days_remaining'] = None
            if item['zone'] == 'P':
                item['status'] = 'Private'
                item['display_name'] = "Pinky's Private Locker" if item['rack_number'] == 1 else "Vinod's Private Locker"
            else:
                item['status'] = 'Empty'
                item['display_name'] = 'Open Bay'
        inventory.append(item)

    return jsonify(inventory)

@app.route('/api/dispatch', methods=['POST'])
def dispatch_rack():
    data = request.get_json() or {}
    rack_id = data.get("id")
    
    if not rack_id:
        return jsonify({"success": False, "error": "Missing rack ID"}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get rack details for log
    cursor.execute("SELECT zone, rack_number, product_name FROM racks WHERE id = ?", (rack_id,))
    rack = cursor.fetchone()
    
    if rack:
        zone, rack_number, product_name = rack
        if product_name:
            cursor.execute("""
                UPDATE racks 
                SET product_name = NULL, box_id = NULL, expiry_date = NULL, status = 'Empty' 
                WHERE id = ?
            """, (rack_id,))
            conn.commit()
            add_event(f"Dispatched '{product_name}' from Rack {zone}{rack_number}. Rack is now vacant.", "info")
            success = True
            error = None
        else:
            success = False
            error = "Rack is already empty"
    else:
        success = False
        error = "Rack not found"
        
    conn.close()
    return jsonify({"success": success, "error": error})

@app.route('/api/sim_scan', methods=['POST'])
def simulate_scan():
    """
    Simulation endpoint to test the scanning logic from the frontend
    without needing a physical USB barcode scanner.
    """
    data = request.get_json() or {}
    barcode = data.get("barcode")
    if not barcode:
        return jsonify({"success": False, "error": "No barcode provided"}), 400
    
    # Process scanning logic synchronously
    process_scanned_barcode(barcode)
    return jsonify({"success": True})

@app.route('/api/system_log', methods=['GET'])
def get_logs():
    return jsonify(system_events)

if __name__ == '__main__':
    # Import pynput keyboard inside thread to avoid issues on headless servers
    try:
        from pynput import keyboard
        listener_thread = threading.Thread(target=start_keyboard_listener)
        listener_thread.daemon = True
        listener_thread.start()
    except Exception as e:
        print(f"Could not start keyboard listener thread: {e}")
        
    # Ensure database is present
    if not os.path.exists(DB_PATH):
        add_event("Database not found. Initializing...", "info")
        import database
        database.init_db()

    # Add initial start event
    add_event("Smart Godown Inventory Server started.", "info")
    
    # Run server
    app.run(host='0.0.0.0', port=5000, debug=False)
