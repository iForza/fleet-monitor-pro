// Global Variables
let client = null;
let map = null;
let mapMarkers = {};
let modules = {};
let moduleDataHistory = {};
let currentUserId = 'user_123';
let currentCloudServer = null;
let messageCount = 0;
let deferredPrompt = null;
let currentMapLayer = null;
let mapLayers = {};
let isAuthenticated = false;
let currentUser = null;
let inactivityTimer = null;
let charts = {};

// Demo Credentials
const DEMO_CREDENTIALS = {
    username: 'admin',
    password: 'fleet2025'
};

// Cloud Servers Configuration
const cloudServers = {
    hivemq: {
        name: 'HiveMQ Public',
        host: 'broker.hivemq.com',
        port: 8000,
        ws: 'wss://broker.hivemq.com:8884/mqtt'
    },
    mosquitto: {
        name: 'Eclipse Mosquitto',
        host: 'test.mosquitto.org',
        port: 8080,
        ws: 'wss://test.mosquitto.org:8081'
    },
    emqx: {
        name: 'EMQX Public',
        host: 'broker.emqx.io',
        port: 8083,
        ws: 'wss://broker.emqx.io:8084/mqtt'
    },
    shiftr: {
        name: 'Shiftr.io Public',
        host: 'public.cloud.shiftr.io',
        port: 8080,
        ws: 'wss://public.cloud.shiftr.io:8080'
    }
};

// Chart.js default configuration
Chart.defaults.color = '#a0a0a0';
Chart.defaults.backgroundColor = 'rgba(64, 224, 208, 0.1)';
Chart.defaults.borderColor = '#40e0d0';

// Initialization
window.addEventListener('load', function() {
    hideLoadingScreen();
    checkAuthentication();
    setupEventListeners();
    setupPWAInstallPrompt();
    resetInactivityTimer();
});

// Authentication Functions
function checkAuthentication() {
    const savedAuth = localStorage.getItem('fleet_auth');
    if (savedAuth) {
        const authData = JSON.parse(savedAuth);
        if (authData.timestamp && Date.now() - authData.timestamp < 30 * 60 * 1000) { // 30 minutes
            isAuthenticated = true;
            currentUser = authData.username;
            showMainApp();
            return;
        }
    }
    showLoginScreen();
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    document.getElementById('currentUser').textContent = currentUser;
    
    // Initialize app components
    initMap();
    selectServer('hivemq');
    updateModulesList();
    initializeCharts();
}

function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginBtn = document.querySelector('.login-btn');
    const btnText = document.querySelector('.login-btn-text');
    const btnSpinner = document.querySelector('.login-btn-spinner');
    
    if (!username || !password) {
        showNotification('Please enter both username and password', 'error');
        return;
    }
    
    // Show loading state
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline';
    loginBtn.disabled = true;
    
    // Simulate API call delay
    setTimeout(() => {
        if (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) {
            // Success
            isAuthenticated = true;
            currentUser = username;
            
            // Save authentication state
            localStorage.setItem('fleet_auth', JSON.stringify({
                username: username,
                timestamp: Date.now()
            }));
            
            showNotification('Login successful!', 'success');
            showMainApp();
        } else {
            // Failure
            showNotification('Invalid credentials. Please try demo credentials.', 'error');
        }
        
        // Reset button state
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        loginBtn.disabled = false;
    }, 1500);
}

function handleLogout() {
    localStorage.removeItem('fleet_auth');
    isAuthenticated = false;
    currentUser = null;
    
    // Disconnect MQTT
    if (client && client.connected) {
        client.end();
    }
    
    // Clear data
    modules = {};
    moduleDataHistory = {};
    
    showNotification('Logged out successfully', 'success');
    showLoginScreen();
}

// Inactivity Management
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    const autoLogoutMinutes = parseInt(document.getElementById('autoLogout')?.value || '30');
    
    if (autoLogoutMinutes > 0) {
        inactivityTimer = setTimeout(() => {
            showNotification('Session expired due to inactivity', 'error');
            handleLogout();
        }, autoLogoutMinutes * 60 * 1000);
    }
}

function setupEventListeners() {
    // Inactivity tracking
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer, true);
    });
    
    // Enter key for login
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
            handleLogin();
        }
    });
}

// Loading Screen
function hideLoadingScreen() {
    setTimeout(() => {
        document.getElementById('app-loading').style.display = 'none';
    }, 2000);
}

// Tab System
function switchTab(tabName) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Special handling for analytics tab
    if (tabName === 'analytics') {
        updateCharts();
    }
}

// PWA Installation
function setupPWAInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });
}

function showInstallPrompt() {
    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt && !localStorage.getItem('installDismissed')) {
        installPrompt.style.display = 'block';
    }
}

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA installed');
                showNotification('Fleet Monitor Pro installed successfully!', 'success');
            }
            deferredPrompt = null;
            dismissInstall();
        });
    }
}

function dismissInstall() {
    document.getElementById('installPrompt').style.display = 'none';
    localStorage.setItem('installDismissed', 'true');
}

// Map Functions
function initMap() {
    map = L.map('map', {
        center: [55.7558, 37.6173], // Moscow
        zoom: 10,
        zoomControl: false,
        attributionControl: false
    });

    initMapLayers();
    
    // Set default layer based on settings
    const defaultLayer = document.getElementById('defaultLayer')?.value || 'esri-satellite';
    changeMapLayer(defaultLayer);

    // Add zoom control to bottom right
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Hide loader
    document.getElementById('mapLoader').style.display = 'none';

    map.on('click', function(e) {
        console.log('Clicked at:', e.latlng);
    });
}

function initMapLayers() {
    mapLayers = {
        'osm-dark': {
            name: 'OpenStreetMap Dark',
            layer: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CartoDB',
                subdomains: 'abcd',
                maxZoom: 19
            })
        },
        'osm-light': {
            name: 'OpenStreetMap Light',
            layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            })
        },
        'esri-satellite': {
            name: 'Esri World Imagery',
            layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
                maxZoom: 18
            })
        },
        'esri-hybrid': {
            name: 'Esri Hybrid',
            layer: L.layerGroup([
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
                    maxZoom: 18
                }),
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 18
                })
            ])
        }
    };
}

function changeMapLayer(layerKey = null) {
    if (!layerKey) {
        layerKey = document.getElementById('layerSelector').value;
    }

    if (currentMapLayer) {
        map.removeLayer(currentMapLayer);
    }

    if (mapLayers[layerKey]) {
        currentMapLayer = mapLayers[layerKey].layer;
        currentMapLayer.addTo(map);
        
        const selector = document.getElementById('layerSelector');
        if (selector) selector.value = layerKey;
        
        showNotification(`Switched to ${mapLayers[layerKey].name}`, 'success');
        console.log(`Map layer changed to: ${mapLayers[layerKey].name}`);
    }
}

function addOrUpdateMarker(deviceId, data) {
    if (!data.latitude || !data.longitude) return;

    const markerId = data.device_id || deviceId;
    
    if (mapMarkers[markerId]) {
        map.removeLayer(mapMarkers[markerId]);
    }

    const markerElement = document.createElement('div');
    markerElement.className = 'custom-marker online';
    
    const markerIcon = L.divIcon({
        html: markerElement.outerHTML,
        className: 'custom-marker-container',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([data.latitude, data.longitude], { icon: markerIcon })
        .addTo(map)
        .bindPopup(`
            <div style="color: var(--text-primary); font-size: 13px;">
                <strong>🚗 ${markerId}</strong><br>
                <strong>Location:</strong> ${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}<br>
                <strong>Speed:</strong> ${data.speed || 0} km/h<br>
                <strong>Battery:</strong> ${data.battery || 'N/A'}%<br>
                <strong>Last Update:</strong> ${new Date().toLocaleTimeString('ru-RU')}
            </div>
        `);

    mapMarkers[markerId] = marker;
}

function centerMap() {
    const markers = Object.values(mapMarkers);
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
        showNotification('Map centered on vehicles', 'success');
    } else {
        map.setView([55.7558, 37.6173], 10);
        showNotification('No vehicles to center on', 'error');
    }
}

function fullscreenMap() {
    if (!document.fullscreenElement) {
        document.getElementById('map').requestFullscreen().catch(err => {
            console.log('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// MQTT Functions
function connectToCloud() {
    if (!currentCloudServer) {
        showNotification('Please select a server first', 'error');
        return;
    }

    if (client && client.connected) {
        client.end();
    }

    updateConnectionStatus('connecting', 'Connecting...');
    
    try {
        const clientId = `fleet_monitor_pro_${currentUserId}_${Math.random().toString(16).substr(2, 8)}`;
        
        client = mqtt.connect(currentCloudServer.ws, {
            clientId: clientId,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
            keepalive: 30
        });

        client.on('connect', function() {
            console.log('Connected to', currentCloudServer.name);
            updateConnectionStatus('connected', `Connected to ${currentCloudServer.name}`);
            
            const topics = [
                `car/+/data`,
                `car/+/status`,
                `car/+/location`,
                `${currentUserId}/+/data`,
                `${currentUserId}/+/status`,
                `${currentUserId}/+/location`
            ];
            
            topics.forEach(topic => {
                client.subscribe(topic, { qos: 1 });
            });
            
            showNotification(`Connected to ${currentCloudServer.name}`, 'success');
        });

        client.on('message', function(topic, message) {
            handleCloudMessage(topic, message);
        });

        client.on('error', function(error) {
            console.error('Cloud MQTT error:', error);
            updateConnectionStatus('error', 'Connection failed');
            showNotification('MQTT connection failed', 'error');
        });

        client.on('offline', function() {
            updateConnectionStatus('offline', 'Offline');
            showNotification('MQTT connection lost', 'error');
        });

    } catch (error) {
        console.error('Error creating cloud client:', error);
        updateConnectionStatus('error', 'Connection failed');
        showNotification('Failed to connect to server', 'error');
    }
}

function handleCloudMessage(topic, message) {
    try {
        const data = JSON.parse(message.toString());
        const deviceId = extractDeviceIdFromTopic(topic);
        
        if (deviceId) {
            updateModuleData(deviceId, data);
            
            // Store data for analytics
            if (!moduleDataHistory[deviceId]) {
                moduleDataHistory[deviceId] = [];
            }
            
            const timestamp = Date.now();
            moduleDataHistory[deviceId].push({
                timestamp: timestamp,
                data: { ...data }
            });
            
            // Keep only last hour of data
            const oneHourAgo = timestamp - (60 * 60 * 1000);
            moduleDataHistory[deviceId] = moduleDataHistory[deviceId].filter(
                entry => entry.timestamp > oneHourAgo
            );
            
            messageCount++;
            console.log(`Message ${messageCount} from ${deviceId}:`, data);
        }
    } catch (error) {
        console.error('JSON parsing error:', error);
    }
}

function extractDeviceIdFromTopic(topic) {
    const parts = topic.split('/');
    return parts[1] || parts[2] || null;
}

function updateModuleData(deviceId, data) {
    if (!modules[deviceId]) {
        modules[deviceId] = {
            id: deviceId,
            status: 'online',
            lastSeen: new Date(),
            cloudServer: currentCloudServer?.name || 'Unknown',
            location: null
        };
    }

    modules[deviceId].lastSeen = new Date();
    modules[deviceId].status = 'online';

    if (data.latitude && data.longitude) {
        modules[deviceId].location = {
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude),
            speed: data.speed || 0,
            lastUpdate: new Date()
        };
        
        addOrUpdateMarker(deviceId, modules[deviceId].location);
    }

    // Update additional sensor data
    Object.assign(modules[deviceId], data);

    updateModulesList();
    updateMapInfo();
}

function sendModuleCommand(moduleId, command) {
    if (!client || !client.connected) {
        showNotification('Not connected to server', 'error');
        return;
    }

    const topic = `car/${moduleId}/commands`;
    const payload = JSON.stringify({
        command: command,
        timestamp: Date.now(),
        user: currentUser
    });

    client.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
            showNotification(`Failed to send ${command} command`, 'error');
        } else {
            showNotification(`${command} command sent to ${moduleId}`, 'success');
        }
    });
}

// Analytics Functions
function initializeCharts() {
    createEngineChart();
    createSpeedChart();
    createSystemChart();
    createGPSChart();
}

function createEngineChart() {
    const ctx = document.getElementById('engineChart');
    if (!ctx) return;
    
    charts.engine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'RPM',
                data: [],
                borderColor: '#30d158',
                backgroundColor: 'rgba(48, 209, 88, 0.1)',
                tension: 0.4
            }, {
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ff9500',
                backgroundColor: 'rgba(255, 149, 0, 0.1)',
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0' }
                }
            }
        }
    });
}

function createSpeedChart() {
    const ctx = document.getElementById('speedChart');
    if (!ctx) return;
    
    charts.speed = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Speed (km/h)',
                data: [],
                borderColor: '#007aff',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0' }
                }
            }
        }
    });
}

function createSystemChart() {
    const ctx = document.getElementById('systemChart');
    if (!ctx) return;
    
    charts.system = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Battery', 'CPU', 'Memory', 'Storage'],
            datasets: [{
                data: [85, 45, 67, 32],
                backgroundColor: [
                    '#30d158',
                    '#ff9500',
                    '#af52de',
                    '#40e0d0'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a0a0a0' }
                }
            }
        }
    });
}

function createGPSChart() {
    const ctx = document.getElementById('gpsChart');
    if (!ctx) return;
    
    charts.gps = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'GPS Accuracy (%)',
                data: [],
                backgroundColor: '#40e0d0',
                borderColor: '#40e0d0',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0' }
                }
            }
        }
    });
}

function updateCharts() {
    const timeRange = document.getElementById('timeRange')?.value || '24h';
    const timeRangeMs = getTimeRangeMs(timeRange);
    const cutoffTime = Date.now() - timeRangeMs;
    
    // Get aggregated data for all modules
    const aggregatedData = aggregateModuleData(cutoffTime);
    
    // Update each chart
    updateEngineChart(aggregatedData);
    updateSpeedChart(aggregatedData);
    updateSystemChart(aggregatedData);
    updateGPSChart(aggregatedData);
}

function getTimeRangeMs(timeRange) {
    const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['24h'];
}

function aggregateModuleData(cutoffTime) {
    const aggregated = {
        timestamps: [],
        rpm: [],
        temperature: [],
        speed: [],
        battery: [],
        gpsAccuracy: []
    };
    
    // Collect all data points from all modules
    Object.values(moduleDataHistory).forEach(moduleHistory => {
        moduleHistory.forEach(entry => {
            if (entry.timestamp > cutoffTime) {
                const time = new Date(entry.timestamp).toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                aggregated.timestamps.push(time);
                aggregated.rpm.push(entry.data.rpm || 0);
                aggregated.temperature.push(entry.data.temperature || 0);
                aggregated.speed.push(entry.data.speed || 0);
                aggregated.battery.push(entry.data.battery || 0);
                aggregated.gpsAccuracy.push(entry.data.gps_accuracy || Math.random() * 100);
            }
        });
    });
    
    return aggregated;
}

function updateEngineChart(data) {
    if (!charts.engine) return;
    
    charts.engine.data.labels = data.timestamps.slice(-20); // Last 20 points
    charts.engine.data.datasets[0].data = data.rpm.slice(-20);
    charts.engine.data.datasets[1].data = data.temperature.slice(-20);
    charts.engine.update('none');
}

function updateSpeedChart(data) {
    if (!charts.speed) return;
    
    charts.speed.data.labels = data.timestamps.slice(-20);
    charts.speed.data.datasets[0].data = data.speed.slice(-20);
    charts.speed.update('none');
}

function updateSystemChart(data) {
    if (!charts.system) return;
    
    // Calculate averages for system metrics
    const avgBattery = data.battery.length > 0 ? 
        data.battery.reduce((a, b) => a + b, 0) / data.battery.length : 0;
    
    charts.system.data.datasets[0].data = [
        avgBattery,
        Math.random() * 100, // CPU usage (simulated)
        Math.random() * 100, // Memory usage (simulated)
        Math.random() * 100  // Storage usage (simulated)
    ];
    charts.system.update('none');
}

function updateGPSChart(data) {
    if (!charts.gps) return;
    
    const moduleNames = Object.keys(modules).slice(0, 6); // Show max 6 modules
    const gpsData = moduleNames.map(() => Math.random() * 100);
    
    charts.gps.data.labels = moduleNames;
    charts.gps.data.datasets[0].data = gpsData;
    charts.gps.update('none');
}

function expandChart(chartId) {
    const modal = document.getElementById('chartModal');
    const modalTitle = document.getElementById('chartModalTitle');
    const expandedCanvas = document.getElementById('expandedChart');
    
    // Set title
    const titles = {
        engineChart: 'Engine Metrics - Detailed View',
        speedChart: 'Speed & Movement - Detailed View',
        systemChart: 'System Health - Detailed View',
        gpsChart: 'GPS Accuracy - Detailed View'
    };
    
    modalTitle.textContent = titles[chartId] || 'Chart Details';
    
    // Clone chart configuration and create expanded version
    if (charts[chartId.replace('Chart', '')]) {
        const originalChart = charts[chartId.replace('Chart', '')];
        
        // Destroy existing expanded chart if any
        if (window.expandedChartInstance) {
            window.expandedChartInstance.destroy();
        }
        
        // Create new chart with same configuration
        window.expandedChartInstance = new Chart(expandedCanvas, {
            type: originalChart.config.type,
            data: JSON.parse(JSON.stringify(originalChart.data)),
            options: {
                ...originalChart.config.options,
                maintainAspectRatio: false,
                responsive: true
            }
        });
    }
    
    modal.classList.add('show');
}

function closeChartModal() {
    document.getElementById('chartModal').classList.remove('show');
    
    if (window.expandedChartInstance) {
        window.expandedChartInstance.destroy();
        window.expandedChartInstance = null;
    }
}

function showModuleChart(moduleId) {
    const modal = document.getElementById('moduleChartModal');
    const title = document.getElementById('moduleChartTitle');
    const canvas = document.getElementById('moduleChart');
    
    title.textContent = `Analytics - ${moduleId}`;
    
    // Get module-specific data
    const moduleData = moduleDataHistory[moduleId] || [];
    const last20Points = moduleData.slice(-20);
    
    const labels = last20Points.map(entry => 
        new Date(entry.timestamp).toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })
    );
    
    // Destroy existing chart
    if (window.moduleChartInstance) {
        window.moduleChartInstance.destroy();
    }
    
    // Create module-specific chart
    window.moduleChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Speed (km/h)',
                data: last20Points.map(entry => entry.data.speed || 0),
                borderColor: '#007aff',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                tension: 0.4
            }, {
                label: 'Battery (%)',
                data: last20Points.map(entry => entry.data.battery || 0),
                borderColor: '#30d158',
                backgroundColor: 'rgba(48, 209, 88, 0.1)',
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Speed (km/h)', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Battery (%)', color: '#a0a0a0' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0' }
                }
            }
        }
    });
    
    modal.classList.add('show');
}

function closeModuleChartModal() {
    document.getElementById('moduleChartModal').classList.remove('show');
    
    if (window.moduleChartInstance) {
        window.moduleChartInstance.destroy();
        window.moduleChartInstance = null;
    }
}

// UI Functions
function updateConnectionStatus(status, text) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (indicator) {
        indicator.className = 'status-indicator';
        if (status === 'connected') {
            indicator.classList.add('connected');
        }
    }
    
    if (statusText) {
        statusText.textContent = text;
    }
}

function updateModulesList() {
    const container = document.getElementById('modulesList');
    const moduleCount = document.getElementById('moduleCount');
    
    if (!container) return;
    
    const moduleList = Object.values(modules);
    moduleCount.textContent = moduleList.length;
    
    container.innerHTML = '';

    if (moduleList.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
                <div style="font-size: 2rem; margin-bottom: 16px;">🚛</div>
                <div style="font-size: 14px; margin-bottom: 8px;">No vehicles connected</div>
                <div style="font-size: 12px;">Connect your ESP32 modules to see them here</div>
            </div>
        `;
        return;
    }

    moduleList.forEach(module => {
        const moduleCard = document.createElement('div');
        moduleCard.className = `module-card ${module.status}`;
        moduleCard.setAttribute('data-module-id', module.id);
        
        const timeSinceLastSeen = Math.floor((new Date() - module.lastSeen) / 1000);
        const isOnline = timeSinceLastSeen < 60;

        moduleCard.innerHTML = `
            <div class="module-header">
                <div>
                    <div class="module-name">🚛 Vehicle ${module.id.replace('ESP32_Car_', '')}</div>
                    <div class="module-id">${module.id}</div>
                </div>
                <div class="module-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="module-metrics">
                <div class="metric-row">
                    <span class="metric-label">Status:</span>
                    <span class="metric-value ${isOnline ? 'accent' : ''}">${isOnline ? 'Online' : 'Offline'}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Server:</span>
                    <span class="metric-value">${module.cloudServer || 'Unknown'}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Last seen:</span>
                    <span class="metric-value">${timeSinceLastSeen}s ago</span>
                </div>
                ${module.battery ? `
                <div class="metric-row">
                    <span class="metric-label">Battery:</span>
                    <span class="metric-value">${module.battery}%</span>
                </div>
                ` : ''}
            </div>
            ${module.location ? `
                <div class="location-preview">
                    <div class="location-coords">📍 ${module.location.latitude.toFixed(4)}, ${module.location.longitude.toFixed(4)}</div>
                    <div class="location-time">Updated: ${module.location.lastUpdate.toLocaleTimeString('ru-RU')}</div>
                </div>
            ` : ''}
            <div class="module-commands">
                <div class="module-command-grid">
                    <button class="module-command-btn" onclick="sendModuleCommand('${module.id}', 'status')">📊 Status</button>
                    <button class="module-command-btn" onclick="sendModuleCommand('${module.id}', 'location')">📍 GPS</button>
                    <button class="module-command-btn chart" onclick="showModuleChart('${module.id}')">📈 Chart</button>
                    <button class="module-command-btn danger" onclick="sendModuleCommand('${module.id}', 'restart')">🔄 Restart</button>
                </div>
            </div>
        `;

        // Click handler for module card
        moduleCard.addEventListener('click', (e) => {
            if (!e.target.classList.contains('module-command-btn')) {
                if (module.location) {
                    map.setView([module.location.latitude, module.location.longitude], 15);
                    if (mapMarkers[module.id]) {
                        mapMarkers[module.id].openPopup();
                    }
                }
            }
        });

        container.appendChild(moduleCard);
    });
}

function updateMapInfo() {
    const totalModules = Object.keys(modules).length;
    const onlineModules = Object.values(modules).filter(m => {
        const timeSinceLastSeen = Math.floor((new Date() - m.lastSeen) / 1000);
        return timeSinceLastSeen < 60;
    }).length;
    
    const speeds = Object.values(modules)
        .filter(m => m.location && m.location.speed)
        .map(m => m.location.speed);
    
    const avgSpeed = speeds.length > 0 ? 
        Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;

    const elements = {
        totalModules: document.getElementById('totalModules'),
        onlineModules: document.getElementById('onlineModules'),
        avgSpeed: document.getElementById('avgSpeed'),
        lastUpdate: document.getElementById('lastUpdate')
    };

    if (elements.totalModules) elements.totalModules.textContent = totalModules;
    if (elements.onlineModules) elements.onlineModules.textContent = onlineModules;
    if (elements.avgSpeed) elements.avgSpeed.textContent = avgSpeed;
    if (elements.lastUpdate) elements.lastUpdate.textContent = new Date().toLocaleTimeString('ru-RU');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Modal Functions
function openServerModal() {
    document.getElementById('serverModal').classList.add('show');
}

function closeServerModal() {
    document.getElementById('serverModal').classList.remove('show');
}

function selectServer(serverKey) {
    document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
    const selectedBtn = document.querySelector(`[data-server="${serverKey}"]`);
    if (selectedBtn) selectedBtn.classList.add('active');
    
    currentCloudServer = cloudServers[serverKey];
    
    const serverNameElement = document.getElementById('currentServerName');
    if (serverNameElement) {
        serverNameElement.textContent = currentCloudServer.name;
    }
    
    if (client && client.connected) {
        client.end();
    }
    
    setTimeout(() => connectToCloud(), 1000);
    closeServerModal();
}

function updateUserId() {
    const newUserId = document.getElementById('userIdInput').value.trim();
    if (newUserId && newUserId !== currentUserId) {
        currentUserId = newUserId;
        showNotification(`User ID changed to: ${currentUserId}`, 'success');
        
        if (client && client.connected) {
            client.end();
            setTimeout(() => connectToCloud(), 1000);
        }
    }
}

// Settings Management
function saveSettings() {
    const settings = {
        autoLogout: document.getElementById('autoLogout')?.value,
        defaultLayer: document.getElementById('defaultLayer')?.value,
        dataRetention: document.getElementById('dataRetention')?.value
    };
    
    localStorage.setItem('fleet_settings', JSON.stringify(settings));
    showNotification('Settings saved', 'success');
}

function loadSettings() {
    const savedSettings = localStorage.getItem('fleet_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        
        if (settings.autoLogout && document.getElementById('autoLogout')) {
            document.getElementById('autoLogout').value = settings.autoLogout;
        }
        if (settings.defaultLayer && document.getElementById('defaultLayer')) {
            document.getElementById('defaultLayer').value = settings.defaultLayer;
        }
        if (settings.dataRetention && document.getElementById('dataRetention')) {
            document.getElementById('dataRetention').value = settings.dataRetention;
        }
    }
}

// Auto-update interface
setInterval(() => {
    if (isAuthenticated) {
        updateModulesList();
        updateMapInfo();
        
        // Update charts if analytics tab is active
        if (document.getElementById('analyticsTab').classList.contains('active')) {
            updateCharts();
        }
    }
}, 30000);

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error || e.message || 'Unknown error');
    showNotification('An error occurred. Check console for details.', 'error');
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (!isAuthenticated) return;
    
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'm':
                e.preventDefault();
                centerMap();
                break;
            case 's':
                e.preventDefault();
                openServerModal();
                break;
            case '1':
                e.preventDefault();
                switchTab('dashboard');
                break;
            case '2':
                e.preventDefault();
                switchTab('analytics');
                break;
            case '3':
                e.preventDefault();
                switchTab('settings');
                break;
        }
    }
});

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = ['serverModal', 'moduleChartModal', 'chartModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// Load settings on startup
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    
    // Add change listeners to settings
    ['autoLogout', 'defaultLayer', 'dataRetention'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', saveSettings);
        }
    });
});

console.log('🚛 Fleet Monitor Pro v2.1 loaded successfully!'); 