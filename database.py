import sqlite3
import os

DB_PATH = 'warehouse.db'

def init_db():
    # If database file already exists, remove it to start clean
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"Removed existing database: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create racks table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS racks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone TEXT NOT NULL,
            rack_number INTEGER NOT NULL,
            product_name TEXT,
            box_id TEXT,
            expiry_date TEXT,
            status TEXT NOT NULL DEFAULT 'Empty'
        )
    ''')

    # Insert 10 racks per Zone (A, B, C) -> Total 30 racks
    zones = ['A', 'B', 'C']
    for zone in zones:
        for num in range(1, 11):
            cursor.execute('''
                INSERT INTO racks (zone, rack_number, product_name, box_id, expiry_date, status)
                VALUES (?, ?, NULL, NULL, NULL, 'Empty')
            ''', (zone, num))

    # Insert Zone P (Private Locker) racks for Pinky and Vinod
    cursor.execute('''
        INSERT INTO racks (zone, rack_number, product_name, box_id, expiry_date, status)
        VALUES ('P', 1, NULL, NULL, NULL, 'Empty')
    ''')
    cursor.execute('''
        INSERT INTO racks (zone, rack_number, product_name, box_id, expiry_date, status)
        VALUES ('P', 2, NULL, NULL, NULL, 'Empty')
    ''')

    conn.commit()
    conn.close()
    print("Database initialized successfully with 30 vacant racks and 2 private lockers.")

if __name__ == '__main__':
    init_db()
