// Global Application State
let inventory = [];
let selectedRackId = null;
let currentFilter = 'all';
let currentZone = 'all';

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
        row.innerHTML = `
            <span class="terminal-time">[${log.timestamp.split(' ')[1]}]</span>
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

    // Filter and display inventory according to selected Zone and Filter buttons
    const filteredInventory = inventory.filter(item => {
        const zoneMatch = (currentZone === 'all' || item.zone === currentZone);
        const filterMatch = (currentFilter === 'all' || 
                             (currentFilter === 'Empty' && item.status === 'Empty') ||
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
        
        // Expiry date summary text
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
    
    // Highlight selected tile
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
    
    // Set Badge Class
    detailsBadge.className = `status-badge ${item.status.toLowerCase()}`;
    detailsBadge.innerText = item.status === 'Empty' ? 'VACANT' : item.status.toUpperCase();

    // Set Text Fields
    detailsLocation.innerText = `Zone ${item.zone} // Rack ${item.rack_number}`;
    
    if (item.status === 'Empty') {
        detailsProduct.innerText = 'Open Bay - Available';
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

    try {
        const response = await fetch('/api/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedRackId })
        });
        
        if (response.ok) {
            const res = await response.json();
            if (res.success) {
                // Clear selection and refresh
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
    
    try {
        const response = await fetch('/api/sim_scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode })
        });

        if (response.ok) {
            simBarcodeInput.value = '';
            // Immediate update
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
    
    // Check if library loaded
    if (typeof Html5QrcodeScanner === 'undefined') {
        document.getElementById('scanner-reader').innerText = "Scanner library failed to load. Check your internet connection.";
        return;
    }

    if (html5QrcodeScanner) return; // already initialized

    // Explicitly enable EAN-13 and other common formats to speed up 1D barcode detection
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
            qrbox: { width: 300, height: 120 }, // Viewport optimized for 1D barcodes
            rememberLastUsedCamera: true,
            ...(formatsToSupport.length > 0 ? { formatsToSupport: formatsToSupport } : {})
        },
        /* verbose= */ false
    );

    html5QrcodeScanner.render(
        (decodedText) => {
            // Successful scan
            handleSimScan(decodedText);
            closeWebcamScanner();
        },
        (err) => {
            // Error callback for frame match failure (frequent, ignore)
        }
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
