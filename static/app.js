// Global Application State
let inventory = [];
let selectedRackId = null;
let currentFilter = 'all';
let currentZone = 'all';

// Detect if running on GitHub Pages (static environment)
const isStaticPages = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';

// Mock catalogs for static fallback mode
const MOCK_PRODUCTS = {
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
};

const SHELF_LIFE_DAYS = {
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
};

function getShelfLifeDays(productName) {
    if (!productName) return 30;
    const nameLower = productName.toLowerCase();
    if (SHELF_LIFE_DAYS[productName]) {
        return SHELF_LIFE_DAYS[productName];
    }
    if (nameLower.includes("milk") || nameLower.includes("dairy") || nameLower.includes("yogurt")) {
        return 7;
    }
    if (nameLower.includes("bread") || nameLower.includes("bun") || nameLower.includes("bakery")) {
        return 5;
    }
    if (nameLower.includes("coca-cola") || nameLower.includes("coke") || nameLower.includes("sprite") || nameLower.includes("soda") || nameLower.includes("beverage") || nameLower.includes("juice")) {
        return 90;
    }
    if (nameLower.includes("cookie") || nameLower.includes("biscuit") || nameLower.includes("chip") || nameLower.includes("snack")) {
        return 120;
    }
    if (nameLower.includes("flour") || nameLower.includes("spaghetti") || nameLower.includes("pasta") || nameLower.includes("rice") || nameLower.includes("grain") || nameLower.includes("tea") || nameLower.includes("coffee")) {
        return 365;
    }
    if (nameLower.includes("face wash") || nameLower.includes("shampoo") || nameLower.includes("soap") || nameLower.includes("cream") || nameLower.includes("cosmetic") || nameLower.includes("lotion")) {
        return 730;
    }
    if (nameLower.includes("canned") || nameLower.includes("tomato") || nameLower.includes("soup")) {
        return 730;
    }
    return 30;
}

// Initialize LocalStorage data structures if running in static mode
function initLocalStorageData() {
    if (!localStorage.getItem('warehouse_inventory')) {
        const initialInventory = [];
        const zones = ['A', 'B', 'C'];
        let id = 1;
        zones.forEach(zone => {
            for (let num = 1; num <= 10; num++) {
                initialInventory.push({
                    id: id++,
                    zone: zone,
                    rack_number: num,
                    product_name: null,
                    box_id: null,
                    expiry_date: null,
                    status: 'Empty'
                });
            }
        });
        // Private Zone P (Racks P1 and P2) -> IDs 31 and 32
        initialInventory.push({
            id: 31,
            zone: 'P',
            rack_number: 1,
            product_name: null,
            box_id: null,
            expiry_date: null,
            status: 'Empty'
        });
        initialInventory.push({
            id: 32,
            zone: 'P',
            rack_number: 2,
            product_name: null,
            box_id: null,
            expiry_date: null,
            status: 'Empty'
        });
        localStorage.setItem('warehouse_inventory', JSON.stringify(initialInventory));
    }
    if (!localStorage.getItem('warehouse_logs')) {
        const initialLogs = [{
            timestamp: new Date().toLocaleTimeString(),
            message: "Static local storage inventory initialized.",
            type: "info"
        }];
        localStorage.setItem('warehouse_logs', JSON.stringify(initialLogs));
    }
}

if (isStaticPages) {
    initLocalStorageData();
    // Update the system status label to indicate browser sandbox mode
    document.addEventListener('DOMContentLoaded', () => {
        const label = document.getElementById('status-daemon-label');
        if (label) {
            label.innerText = "LOCALSTORAGE ACTIVE (DEMO)";
            label.style.color = "#8b5cf6";
            const pulseDot = document.querySelector('.status-pulse-dot');
            if (pulseDot) {
                pulseDot.style.backgroundColor = "#8b5cf6";
                pulseDot.style.boxShadow = "0 0 8px #8b5cf6";
            }
        }
    });
}

// DOM Elements
const gridMap = document.getElementById('warehouse-grid-map');
const detailsCard = document.getElementById('rack-details-card');
const detailsEmptyState = document.getElementById('details-empty-state');
const detailsActiveState = document.getElementById('details-active-state');
const detailsBadge = document.getElementById('details-badge');
const detailsLocation = document.getElementById('details-location');
const detailsProduct = document.getElementById('details-product');
const detailsBarcode = document.getElementById('details-barcode');
const detailsExpiry = document.getElementById('details-expiry');
const detailsDaysLeft = document.getElementById('details-days-left');
const dispatchActionBtn = document.getElementById('dispatch-action-btn');

const kpiValTotal = document.getElementById('kpi-val-total');
const kpiValFilled = document.getElementById('kpi-val-filled');
const kpiValExpiring = document.getElementById('kpi-val-expiring');
const kpiValEmpty = document.getElementById('kpi-val-empty');

const terminalLogsList = document.getElementById('terminal-events-list');
const simScanForm = document.getElementById('sim-scan-form');
const simBarcodeInput = document.getElementById('sim-barcode-input');
const liveTimeEl = document.getElementById('live-time');
const scannerModal = document.getElementById('scanner-modal');
const scannerCloseBtn = document.getElementById('scanner-close-btn');
const webcamScanBtn = document.getElementById('webcam-scan-btn');
let html5QrcodeScanner = null;

// Update Clock Live
function updateClock() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    liveTimeEl.innerText = `${timeStr} // ${dateStr}`;
}
setInterval(updateClock, 1000);
updateClock();

// Fetch Latest Inventory Data
async function fetchInventory() {
    if (isStaticPages) {
        const data = JSON.parse(localStorage.getItem('warehouse_inventory') || '[]');
        const today = new Date();
        today.setHours(0,0,0,0);
        
        inventory = data.map(item => {
            const newItem = { ...item };
            if (newItem.product_name && newItem.expiry_date) {
                const expiryDt = new Date(newItem.expiry_date);
                expiryDt.setHours(0,0,0,0);
                const diffTime = expiryDt - today;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (daysLeft <= 7) {
                    newItem.status = 'Expiring';
                } else {
                    newItem.status = 'Safe';
                }
                newItem.days_remaining = daysLeft;

                if (newItem.zone === 'P') {
                    newItem.display_name = `[Private] ${newItem.product_name}`;
                } else {
                    newItem.display_name = newItem.product_name;
                }
            } else {
                newItem.days_remaining = null;
                if (newItem.zone === 'P') {
                    newItem.status = 'Private';
                    newItem.display_name = newItem.rack_number === 1 ? "Pinky's Private Locker" : "Vinod's Private Locker";
                } else {
                    newItem.status = 'Empty';
                    newItem.display_name = 'Open Bay';
                }
            }
            return newItem;
        });

        renderGrid();
        updateKPIs();
        updateDetailsPanelIfSelectedChanged();
        return;
    }

    try {
        const response = await fetch('/api/inventory');
        if (response.ok) {
            inventory = await response.json();
            renderGrid();
            updateKPIs();
            updateDetailsPanelIfSelectedChanged();
        }
    } catch (error) {
        console.error("Error fetching inventory data:", error);
    }
}

// Fetch Latest System Terminal Logs
async function fetchLogs() {
    if (isStaticPages) {
        const logs = JSON.parse(localStorage.getItem('warehouse_logs') || '[]');
        renderLogs(logs);
        return;
    }

    try {
        const response = await fetch('/api/system_log');
        if (response.ok) {
            const logs = await response.json();
            renderLogs(logs);
        }
    } catch (error) {
        console.error("Error fetching system logs:", error);
    }
}

// Render System Logs in the Terminal Window
function renderLogs(logs) {
    terminalLogsList.innerHTML = '';
    if (logs.length === 0) {
        terminalLogsList.innerHTML = `<div class="placeholder-text" style="padding:10px;font-size:0.65rem;">No terminal logs available.</div>`;
        return;
    }
    logs.forEach(log => {
        const row = document.createElement('div');
        row.className = `terminal-row ${log.type}`;
        
        // Extract time for display
        let timeDisplay = log.timestamp;
        if (log.timestamp.includes(' ')) {
            timeDisplay = log.timestamp.split(' ')[1];
        }
        
        row.innerHTML = `
            <span class="terminal-time">[${timeDisplay}]</span>
            <span class="terminal-msg">${log.message}</span>
        `;
        terminalLogsList.appendChild(row);
    });
}

// Update KPI Metric Cards
function updateKPIs() {
    const total = inventory.length;
    const filled = inventory.filter(item => item.product_name !== null).length;
    const expiring = inventory.filter(item => item.status === 'Expiring').length;
    const empty = total - filled;

    kpiValTotal.innerText = total;
    kpiValFilled.innerText = filled;
    kpiValExpiring.innerText = expiring;
    kpiValEmpty.innerText = empty;
}

// Render the Interactive Grid Map
function renderGrid() {
    gridMap.innerHTML = '';

    const filteredInventory = inventory.filter(item => {
        const zoneMatch = (currentZone === 'all' || item.zone === currentZone);
        const filterMatch = (currentFilter === 'all' || 
                             (currentFilter === 'Empty' && (item.status === 'Empty' || item.status === 'Private')) ||
                             (currentFilter === 'Safe' && item.status === 'Safe') ||
                             (currentFilter === 'Expiring' && item.status === 'Expiring'));
        return zoneMatch && filterMatch;
    });

    if (filteredInventory.length === 0) {
        gridMap.innerHTML = `<div class="placeholder-text" style="grid-column: span 5; padding: 2.5rem 0;">No racks match the active filters.</div>`;
        return;
    }

    filteredInventory.forEach(item => {
        const tile = document.createElement('div');
        const stateClass = `state-${item.status.toLowerCase()}`;
        const selectedClass = (selectedRackId === item.id) ? 'selected' : '';
        tile.className = `rack-tile ${stateClass} ${selectedClass}`;
        tile.setAttribute('data-id', item.id);

        const badgeLabel = item.status === 'Empty' ? 'VACANT' : (item.status === 'Private' ? 'PRIVATE' : item.status.toUpperCase());
        
        let footerText = 'VACANT';
        if (item.status === 'Private') {
            footerText = 'PRIVATE';
        } else if (item.status !== 'Empty') {
            footerText = `${item.days_remaining}d left`;
        }

        tile.innerHTML = `
            <div class="rack-header">
                <span class="rack-label">${item.zone}${item.rack_number}</span>
                <span class="status-indicator">${badgeLabel}</span>
            </div>
            <div class="rack-content">${item.display_name}</div>
            <div class="rack-footer">
                <span>${item.box_id ? 'ID: ' + item.box_id.slice(-6) : ''}</span>
                <span>${footerText}</span>
            </div>
        `;

        tile.addEventListener('click', () => selectRack(item.id));
        gridMap.appendChild(tile);
    });
}

// Select a Rack Tile
function selectRack(id) {
    selectedRackId = id;
    
    document.querySelectorAll('.rack-tile').forEach(tile => {
        if (parseInt(tile.getAttribute('data-id')) === id) {
            tile.classList.add('selected');
        } else {
            tile.classList.remove('selected');
        }
    });

    updateDetailsPanel();
}

// Update Details Panel UI
function updateDetailsPanel() {
    const item = inventory.find(i => i.id === selectedRackId);
    
    if (!item) {
        selectedRackId = null;
        detailsActiveState.classList.add('hidden');
        detailsEmptyState.classList.remove('hidden');
        detailsBadge.className = 'status-badge vacant';
        detailsBadge.innerText = 'VACANT';
        return;
    }

    detailsEmptyState.classList.add('hidden');
    detailsActiveState.classList.remove('hidden');
    
    detailsBadge.className = `status-badge ${item.status.toLowerCase()}`;
    detailsBadge.innerText = item.status === 'Empty' ? 'VACANT' : item.status.toUpperCase();

    detailsLocation.innerText = `Zone ${item.zone} // Rack ${item.rack_number}`;
    
    if (item.status === 'Empty' || item.status === 'Private') {
        detailsProduct.innerText = item.status === 'Private' ? 'Private Storage Locker' : 'Open Bay - Available';
        detailsBarcode.innerText = 'N/A';
        detailsExpiry.innerText = 'N/A';
        detailsDaysLeft.innerText = 'N/A';
        dispatchActionBtn.classList.add('hidden');
    } else {
        detailsProduct.innerText = item.product_name;
        detailsBarcode.innerText = item.box_id;
        detailsExpiry.innerText = item.expiry_date;
        detailsDaysLeft.innerText = `${item.days_remaining} Days Remaining`;
        dispatchActionBtn.classList.remove('hidden');
    }
}

// Refresh details panel if selected rack was updated by background polling
function updateDetailsPanelIfSelectedChanged() {
    if (selectedRackId !== null) {
        updateDetailsPanel();
    }
}

// Dispatch Item (Mark empty again)
async function dispatchItem() {
    if (!selectedRackId) return;
    
    const confirmDispatch = confirm("Are you sure you want to DISPATCH and remove this item from the warehouse registry?");
    if (!confirmDispatch) return;

    if (isStaticPages) {
        const data = JSON.parse(localStorage.getItem('warehouse_inventory') || '[]');
        const idx = data.findIndex(item => item.id === selectedRackId);
        if (idx !== -1) {
            const item = data[idx];
            const pName = item.product_name;
            item.product_name = null;
            item.box_id = null;
            item.expiry_date = null;
            item.status = item.zone === 'P' ? 'Private' : 'Empty';
            localStorage.setItem('warehouse_inventory', JSON.stringify(data));
            
            const logs = JSON.parse(localStorage.getItem('warehouse_logs') || '[]');
            const timestamp = new Date().toLocaleTimeString();
            logs.unshift({
                timestamp: timestamp,
                message: `Dispatched '${pName}' from Rack ${item.zone}${item.rack_number}. Rack is now vacant.`,
                type: "info"
            });
            localStorage.setItem('warehouse_logs', JSON.stringify(logs));
            
            selectedRackId = null;
            await fetchInventory();
            await fetchLogs();
            updateDetailsPanel();
        }
        return;
    }

    try {
        const response = await fetch('/api/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedRackId })
        });
        
        if (response.ok) {
            const res = await response.json();
            if (res.success) {
                selectedRackId = null;
                await fetchInventory();
                await fetchLogs();
                updateDetailsPanel();
            } else {
                alert(`Dispatch failed: ${res.error}`);
            }
        }
    } catch (error) {
        console.error("Error sending dispatch request:", error);
    }
}

// Handle Simulated Scan Submission
async function handleSimScan(barcode) {
    if (!barcode) return;
    
    if (isStaticPages) {
        const data = JSON.parse(localStorage.getItem('warehouse_inventory') || '[]');
        const emptyRack = data.find(item => (item.status === 'Empty' || item.status === 'Private') && item.zone !== 'P');
        
        if (emptyRack) {
            let productName = MOCK_PRODUCTS[barcode];
            let isResolvedLocally = true;
            if (!productName) {
                productName = `Generic Item (${barcode.slice(-6)})`;
                isResolvedLocally = false;
            }
            
            const shelfLife = getShelfLifeDays(productName);
            const today = new Date();
            today.setDate(today.getDate() + shelfLife);
            const expiryStr = today.toISOString().split('T')[0];
            
            emptyRack.product_name = productName;
            emptyRack.box_id = barcode;
            emptyRack.expiry_date = expiryStr;
            emptyRack.status = 'Safe';
            
            localStorage.setItem('warehouse_inventory', JSON.stringify(data));
            
            const logs = JSON.parse(localStorage.getItem('warehouse_logs') || '[]');
            const timestamp = new Date().toLocaleTimeString();
            
            if (isResolvedLocally) {
                logs.unshift({
                    timestamp: timestamp,
                    message: `Resolved barcode ${barcode} locally from system catalog.`,
                    type: "success"
                });
            }
            logs.unshift({
                timestamp: timestamp,
                message: `Placed '${productName}' (Box: ${barcode}) into Rack ${emptyRack.zone}${emptyRack.rack_number}.`,
                type: "success"
            });
            localStorage.setItem('warehouse_logs', JSON.stringify(logs));
            
            simBarcodeInput.value = '';
            await fetchInventory();
            await fetchLogs();
        } else {
            const logs = JSON.parse(localStorage.getItem('warehouse_logs') || '[]');
            const timestamp = new Date().toLocaleTimeString();
            logs.unshift({
                timestamp: timestamp,
                message: `CAPACITY ALERT: Barcode ${barcode} scanned, but all warehouse racks are FULL!`,
                type: "danger"
            });
            localStorage.setItem('warehouse_logs', JSON.stringify(logs));
            await fetchLogs();
        }
        return;
    }

    try {
        const response = await fetch('/api/sim_scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode })
        });

        if (response.ok) {
            simBarcodeInput.value = '';
            await fetchInventory();
            await fetchLogs();
        }
    } catch (error) {
        console.error("Error sending simulation scan request:", error);
    }
}

// --- Wire Event Listeners ---

// Setup Filter Buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        renderGrid();
    });
});

// Setup Zone Navigation Tabs
document.querySelectorAll('.zone-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.zone-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentZone = btn.getAttribute('data-zone');
        renderGrid();
    });
});

// Setup Dispatch Button Action
dispatchActionBtn.addEventListener('click', dispatchItem);

// Quick Scan Simulator Buttons
document.querySelectorAll('.quick-scan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const barcode = btn.getAttribute('data-barcode');
        handleSimScan(barcode);
    });
});

// Custom Scan Input Form
simScanForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const barcode = simBarcodeInput.value.trim();
    handleSimScan(barcode);
});

// Webcam Camera Scanner Logic
function openWebcamScanner() {
    scannerModal.classList.remove('hidden');
    
    if (typeof Html5QrcodeScanner === 'undefined') {
        document.getElementById('scanner-reader').innerText = "Scanner library failed to load. Check your internet connection.";
        return;
    }

    if (html5QrcodeScanner) return; // already initialized

    let formatsToSupport = [];
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
        formatsToSupport = [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
        ];
    }

    html5QrcodeScanner = new Html5QrcodeScanner(
        "scanner-reader",
        {
            fps: 20,
            qrbox: { width: 300, height: 120 },
            rememberLastUsedCamera: true,
            ...(formatsToSupport.length > 0 ? { formatsToSupport: formatsToSupport } : {})
        },
        /* verbose= */ false
    );

    html5QrcodeScanner.render(
        (decodedText) => {
            handleSimScan(decodedText);
            closeWebcamScanner();
        },
        (err) => {}
    );
}

function closeWebcamScanner() {
    scannerModal.classList.add('hidden');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error("Error clearing html5QrcodeScanner:", err);
            html5QrcodeScanner = null;
        });
    }
}

webcamScanBtn.addEventListener('click', openWebcamScanner);
scannerCloseBtn.addEventListener('click', closeWebcamScanner);
scannerModal.addEventListener('click', (e) => {
    if (e.target === scannerModal) closeWebcamScanner();
});

// Initial Load & Start Polling
fetchInventory();
fetchLogs();
setInterval(fetchInventory, 2000);
setInterval(fetchLogs, 2000);
