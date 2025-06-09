// Mobile optimization and timeout handling
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isSlowConnection = navigator.connection && (navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g');

// Global Variables
let client = null;
let map = null;
let mapMarkers = {};
let modules = {};
let selectedModules = new Set(); // Выбранные модули для отображения в Analytics
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
let moduleRealTimeData = {}; // Хранилище реальных данных модулей для графиков

// Demo Credentials
const DEMO_CREDENTIALS = {
    username: 'admin',
    password: 'fleet2025'
};

// Module color palette for charts
const MODULE_COLORS = [
    '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', 
    '#ff9f40', '#ff6384', '#c9cbcf', '#ff9800', '#607d8b',
    '#795548', '#009688', '#8bc34a', '#cddc39', '#ffc107'
];

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
    console.log('🚀 Fleet Monitor Pro v2.3.1 loading...');
    console.log('📱 Mobile device:', isMobile);
    console.log('🐌 Slow connection:', isSlowConnection);
    
    // Mobile optimizations
    if (isMobile) {
        document.body.classList.add('mobile-device');
        // Reduce animation duration on mobile
        document.documentElement.style.setProperty('--animation-duration', '0.2s');
    }
    
    if (isSlowConnection) {
        document.body.classList.add('slow-connection');
        console.log('⚠️ Slow connection detected, enabling optimizations');
    }
    
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
    
    // Отображаем существующие маркеры (если есть сохраненные модули с GPS)
    displayExistingMarkers();
}

// Новая функция для отображения существующих модулей на карте
function displayExistingMarkers() {
    console.log('🗺️ Checking for existing modules with GPS data...');
    
    // Проверяем все сохраненные модули
    Object.keys(modules).forEach(deviceId => {
        const module = modules[deviceId];
        if (module && module.location && module.location.latitude && module.location.longitude) {
            console.log(`📍 Found existing GPS data for ${deviceId}, adding to map...`);
            addOrUpdateMarker(deviceId, module.location);
        }
    });
    
    // Центрируем карту если есть маркеры
    setTimeout(() => {
        if (Object.keys(mapMarkers).length > 0) {
            centerMap();
            console.log(`✅ Centered map on ${Object.keys(mapMarkers).length} existing markers`);
        } else {
            console.log('ℹ️ No existing modules with GPS data found');
        }
    }, 500);
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
    selectedModules.clear();
    
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
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const activeContent = document.getElementById(`${tabName}Tab`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
    
    // Tab-specific initialization
    if (tabName === 'analytics') {
        // Initialize charts if not already done
        if (Object.keys(charts).length === 0) {
            initializeCharts();
        }
        updateModulesCheckboxes();
        updateCharts();
    } else if (tabName === 'dashboard') {
        // Refresh map and modules
        updateModulesList();
        updateMapInfo();
    }
}

// Analytics Functions - NEW IMPLEMENTATION
function updateModulesCheckboxes() {
    const container = document.getElementById('modulesCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Define colors for modules
    const moduleColors = ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40', '#ff6384', '#c9cbcf'];
    
    Object.keys(modules).forEach((moduleId, index) => {
        const color = moduleColors[index % moduleColors.length];
        
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'module-checkbox';
        checkboxDiv.onclick = () => toggleModule(moduleId);
        
        // If this is a new module, automatically select it
        if (!selectedModules.has(moduleId)) {
            selectedModules.add(moduleId);
        }
        
        if (selectedModules.has(moduleId)) {
            checkboxDiv.classList.add('active');
        }
        
        checkboxDiv.innerHTML = `
            <div class="module-color-indicator" style="background-color: ${color}"></div>
            <input type="checkbox" ${selectedModules.has(moduleId) ? 'checked' : ''} onchange="event.stopPropagation()">
            <span class="module-checkbox-label">${moduleId}</span>
        `;
        
        container.appendChild(checkboxDiv);
    });
}

function toggleModule(moduleId) {
    if (selectedModules.has(moduleId)) {
        selectedModules.delete(moduleId);
        console.log(`🔴 Module ${moduleId} removed from chart display`);
    } else {
        selectedModules.add(moduleId);
        console.log(`🟢 Module ${moduleId} added to chart display`);
    }
    
    updateModulesCheckboxes();
    updateChartsDisplay(); // Обновляем только отображение графиков без генерации новых данных
}

function refreshAnalytics() {
    showNotification('Refreshing analytics data...', 'info');
    updateCharts();
    
    // Simulate refresh delay
    setTimeout(() => {
        showNotification('Analytics data refreshed', 'success');
    }, 1000);
}

// PWA Install Prompt
function setupPWAInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });
}

function showInstallPrompt() {
    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt) {
        installPrompt.style.display = 'block';
    }
}

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showNotification('Fleet Monitor Pro installed successfully!', 'success');
            }
            deferredPrompt = null;
            dismissInstall();
        });
    }
}

function dismissInstall() {
    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt) {
        installPrompt.style.display = 'none';
    }
}

// Map Functions
function initMap() {
    // Initialize map centered on Moscow
    map = L.map('map').setView([55.7558, 37.6173], 10);
    
    // Create persistent marker layer group (will survive layer changes)
    if (!window.markersLayerGroup) {
        window.markersLayerGroup = L.featureGroup();
        console.log('🗂️ Created persistent markers layer group');
    }
    
    // Add markers group to map
    window.markersLayerGroup.addTo(map);
    
    // Initialize map layers
    initMapLayers();
    
    // Set default layer
    changeMapLayer('osm-dark');
    
    // Add map event listeners
    map.on('moveend', updateMapInfo);
    map.on('zoomend', updateMapInfo);
    
    console.log('🗺️ Map initialized with persistent marker layer');
}

function initMapLayers() {
    mapLayers = {
        'osm-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }),
        'osm-light': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
        }),
        'esri-hybrid': L.layerGroup([
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }),
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Labels © Esri'
            })
        ])
    };
}

function changeMapLayer(layerKey = null) {
    if (!layerKey) {
        layerKey = document.getElementById('layerSelector').value;
    }
    
    const markersBefore = getMarkersCount();
    console.log(`🗺️ Changing map layer to ${layerKey}, markers before: ${markersBefore}`);
    
    // Remove current layer
    if (currentMapLayer && map.hasLayer(currentMapLayer)) {
        map.removeLayer(currentMapLayer);
    }
    
    // Add new layer
    if (mapLayers[layerKey]) {
        currentMapLayer = mapLayers[layerKey];
        currentMapLayer.addTo(map);
        
        // Update selector
        document.getElementById('layerSelector').value = layerKey;
        
        // Ensure markers layer group is still on top
        if (window.markersLayerGroup && map.hasLayer(window.markersLayerGroup)) {
            window.markersLayerGroup.bringToFront();
        }
        
        const markersAfter = getMarkersCount();
        console.log(`✅ Map layer changed to ${layerKey}, markers after: ${markersAfter}`);
        
        if (markersBefore !== markersAfter) {
            console.warn(`⚠️ Marker count changed during layer switch! Before: ${markersBefore}, After: ${markersAfter}`);
        }
    }
}

function addOrUpdateMarker(deviceId, data) {
    console.log(`🔄 TOOLTIP addOrUpdateMarker called for ${deviceId}:`, data);
    
    const lat = parseFloat(data.latitude || data.lat);
    const lng = parseFloat(data.longitude || data.lng || data.lon);
    
    if (isNaN(lat) || isNaN(lng)) {
        console.warn(`❌ Invalid coordinates for ${deviceId}: lat=${lat}, lng=${lng}`);
        return;
    }
    
    console.log(`✅ Valid coordinates for ${deviceId}: lat=${lat}, lng=${lng}`);
    
    // Remove existing marker from persistent group
    if (mapMarkers[deviceId]) {
        window.markersLayerGroup.removeLayer(mapMarkers[deviceId]);
        console.log(`🔄 Removed existing marker for ${deviceId} from persistent group`);
    }
    
    // Create custom marker
    const isOnline = modules[deviceId]?.status === 'online';
    const markerClass = isOnline ? 'custom-marker online' : 'custom-marker';
    
    const customIcon = L.divIcon({
        className: markerClass,
        html: `<div class="${markerClass}">${deviceId.slice(-2)}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    
    // Create marker with TOOLTIP instead of popup
    const marker = L.marker([lat, lng], { icon: customIcon });
    
    // Add unique deviceId to marker for identification
    marker._deviceId = deviceId;
    
    // Create PERMANENT TOOLTIP content (instead of popup)
    const vehicleName = modules[deviceId]?.name || `Vehicle ${deviceId.replace('ESP32_', '').replace('Car_', '').replace('Tractor_', '')}`;
    const tooltipContent = `
        <div class="marker-tooltip-content">
            <div class="tooltip-header">
                <strong>🚛 ${vehicleName}</strong>
                <span class="status-badge ${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢 Online' : '🔴 Offline'}</span>
            </div>
            <div class="tooltip-info">
                <div class="info-line">🏎️ ${data.speed !== undefined && data.speed !== null ? data.speed : '--'} km/h | 🔋 ${data.battery !== undefined && data.battery !== null ? data.battery : '--'}% ${data.temperature ? '| 🌡️ ' + data.temperature + '°C' : ''}</div>
                <div class="info-line">📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
                <div class="info-line">⏰ ${new Date(data.timestamp || Date.now()).toLocaleString('ru-RU')}</div>
            </div>
        </div>
    `;
    
    // Bind PERMANENT tooltip (always visible)
    marker.bindTooltip(tooltipContent, {
        permanent: true,
        direction: 'top',
        offset: [0, -35],
        className: 'custom-marker-tooltip',
        opacity: 0.95
    });
    
    // Create detailed info panel that appears on click
    const detailsContent = `
        <div class="marker-details-panel" id="details-${deviceId}">
            <div class="details-header">
                <h4>🚛 ${vehicleName}</h4>
                <button class="details-close" onclick="closeDetailsPanel('${deviceId}')">✕</button>
            </div>
            <div class="details-body">
                <div class="detail-section">
                    <h5>📊 Status Information</h5>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value ${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢 Online' : '🔴 Offline'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Speed:</span>
                        <span class="detail-value">🏎️ ${data.speed !== undefined && data.speed !== null ? data.speed : '--'} km/h</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Battery:</span>
                        <span class="detail-value">🔋 ${data.battery !== undefined && data.battery !== null ? data.battery : '--'}%</span>
                    </div>
                    ${data.temperature ? `
                    <div class="detail-row">
                        <span class="detail-label">Temperature:</span>
                        <span class="detail-value">🌡️ ${data.temperature}°C</span>
                    </div>` : ''}
                    ${data.rpm ? `
                    <div class="detail-row">
                        <span class="detail-label">Engine RPM:</span>
                        <span class="detail-value">⚡ ${data.rpm}</span>
                    </div>` : ''}
                </div>
                <div class="detail-section">
                    <h5>📍 Location Information</h5>
                    <div class="detail-row">
                        <span class="detail-label">Coordinates:</span>
                        <span class="detail-value">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Update:</span>
                        <span class="detail-value">⏰ ${new Date(data.timestamp || Date.now()).toLocaleString('ru-RU')}</span>
                    </div>
                </div>
                <div class="detail-section">
                    <h5>🎮 Controls</h5>
                    <div class="detail-controls">
                        <button class="detail-btn" onclick="sendModuleCommand('${deviceId}', 'status')">📊 Status</button>
                        <button class="detail-btn" onclick="sendModuleCommand('${deviceId}', 'location')">📍 GPS</button>
                        <button class="detail-btn" onclick="centerMapOnDevice('${deviceId}')">🎯 Center</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add click event to show detailed panel
    marker.on('click', function() {
        showDetailsPanel(deviceId, detailsContent);
    });
    
    // Add marker to PERSISTENT layer group instead of directly to map
    window.markersLayerGroup.addLayer(marker);
    mapMarkers[deviceId] = marker;
    
    console.log(`✅ TOOLTIP Marker added to PERSISTENT layer group for ${deviceId} at [${lat}, ${lng}]`);
    
    // Show notification for new device
    if (!modules[deviceId]?.markerNotified) {
        showNotification(`📍 Vehicle ${deviceId.replace('ESP32_', '').replace('Car_', '').replace('Tractor_', '')} appeared on map`, 'success');
        if (modules[deviceId]) {
            modules[deviceId].markerNotified = true;
        }
    }
}

function centerMap() {
    const markers = Object.values(mapMarkers);
    if (markers.length === 0) {
        // Default to Moscow if no markers
        map.setView([55.7558, 37.6173], 10);
        return;
    }
    
    if (markers.length === 1) {
        map.setView(markers[0].getLatLng(), 15);
    } else {
        // Use the existing persistent markers layer group for bounds
        if (window.markersLayerGroup && window.markersLayerGroup.getLayers().length > 0) {
            map.fitBounds(window.markersLayerGroup.getBounds().pad(0.1));
        } else {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

// Function to clear all markers from persistent layer
function clearAllMarkers() {
    console.log('🧹 Clearing all markers from persistent layer');
    if (window.markersLayerGroup) {
        window.markersLayerGroup.clearLayers();
    }
    mapMarkers = {};
    showNotification('🧹 All vehicle markers cleared', 'info');
}

// Function to get markers count
function getMarkersCount() {
    return window.markersLayerGroup ? window.markersLayerGroup.getLayers().length : 0;
}

// Function to list all markers on map
function listMarkersOnMap() {
    const markersInfo = [];
    if (window.markersLayerGroup) {
        window.markersLayerGroup.eachLayer(function(layer) {
            if (layer._deviceId) {
                const latlng = layer.getLatLng();
                markersInfo.push({
                    deviceId: layer._deviceId,
                    lat: latlng.lat.toFixed(6),
                    lng: latlng.lng.toFixed(6),
                    isOnline: modules[layer._deviceId]?.status === 'online'
                });
            }
        });
    }
    console.log('📍 Current markers on map:', markersInfo);
    return markersInfo;
}

function fullscreenMap() {
    const mapContainer = document.getElementById('map');
    if (mapContainer.requestFullscreen) {
        mapContainer.requestFullscreen();
    } else if (mapContainer.webkitRequestFullscreen) {
        mapContainer.webkitRequestFullscreen();
    } else if (mapContainer.msRequestFullscreen) {
        mapContainer.msRequestFullscreen();
    }
    
    setTimeout(() => {
        map.invalidateSize();
    }, 1000);
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

// Обновляем функцию handleCloudMessage для лучшей поддержки подключения новых модулей
function handleCloudMessage(topic, message) {
    try {
        const data = JSON.parse(message.toString());
        const deviceId = extractDeviceIdFromTopic(topic);
        
        if (deviceId) {
            // ДЕТАЛЬНЫЙ ЛОГ для отслеживания нулевых значений
            const hasZeroValues = (data.speed === 0 || data.temperature === 0 || data.rpm === 0 || data.battery === 0);
            if (hasZeroValues) {
                console.warn(`⚠️ ESP32 ${deviceId} отправил НУЛЕВЫЕ значения:`, data);
            } else {
                console.log(`📨 Received MQTT message for ${deviceId}:`, data);
            }
            updateModuleData(deviceId, data);
            
            // Если это новый модуль с GPS данными, показываем уведомление
            if (data.latitude || data.lat) {
                const isNewModule = !modules[deviceId]?.markerNotified;
                if (isNewModule) {
                    showNotification(`🎯 Новый модуль ${deviceId} подключился с GPS координатами!`, 'success');
                }
            }
        }
    } catch (error) {
        console.error('Error parsing MQTT message:', error);
    }
}

function extractDeviceIdFromTopic(topic) {
    const parts = topic.split('/');
    return parts[1] || parts[2] || null;
}

function updateModuleData(deviceId, data) {
    console.log(`📊 updateModuleData called for ${deviceId}:`, data);
    
    if (!modules[deviceId]) {
        modules[deviceId] = {
            id: deviceId,
            status: 'online',
            lastSeen: new Date(),
            cloudServer: currentCloudServer?.name || 'Unknown',
            location: null
        };
        console.log(`✨ Created new module entry for ${deviceId}`);
    }

    modules[deviceId].lastSeen = new Date();
    modules[deviceId].status = 'online';

    // Check for location data in multiple formats
    const hasLatitude = data.latitude || data.lat;
    const hasLongitude = data.longitude || data.lng || data.lon;
    
    console.log(`🌍 Location check for ${deviceId}: lat=${hasLatitude}, lng=${hasLongitude}`);

    if (hasLatitude && hasLongitude) {
        modules[deviceId].location = {
            latitude: parseFloat(hasLatitude),
            longitude: parseFloat(hasLongitude),
            speed: (data.speed !== undefined && data.speed !== null) ? parseFloat(data.speed) : null,
            battery: (data.battery !== undefined && data.battery !== null) ? parseFloat(data.battery) : null,
            timestamp: data.timestamp || Date.now(),
            lastUpdate: new Date()
        };
        
        console.log(`📍 Location updated for ${deviceId}:`, modules[deviceId].location);
        
        // Call addOrUpdateMarker with location data including additional info
        addOrUpdateMarker(deviceId, {
            ...modules[deviceId].location,
            ...data // Include all other data like speed, battery, etc.
        });
    } else {
        console.warn(`⚠️ No valid GPS location data found for ${deviceId} - module will not be displayed on map`);
        // Модули без GPS данных не отображаются на карте
        modules[deviceId].location = null;
    }

    // Update additional sensor data
    Object.assign(modules[deviceId], data);

    // Сохраняем реальные данные для графиков
    if (!moduleRealTimeData[deviceId]) {
        moduleRealTimeData[deviceId] = {
            speed: [],
            temperature: [],
            rpm: [],
            battery: [],
            timestamps: []
        };
    }
    
    const currentTime = new Date().toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    // ВАЛИДИРУЕМ И ДОБАВЛЯЕМ ТОЛЬКО КОРРЕКТНЫЕ ДАННЫЕ (НЕ СОХРАНЯЕМ НУЛИ!)
    const maxDataPoints = 20;
    
    // СТРОГАЯ ВАЛИДАЦИЯ: проверяем что поля являются корректными числами
    const validSpeed = data.speed !== undefined && data.speed !== null && !isNaN(parseFloat(data.speed)) && parseFloat(data.speed) >= 0; // скорость может быть 0 (машина стоит)
    const validTemperature = data.temperature !== undefined && data.temperature !== null && !isNaN(parseFloat(data.temperature)) && parseFloat(data.temperature) > 0; // температура должна быть > 0
    const validRpm = data.rpm !== undefined && data.rpm !== null && !isNaN(parseFloat(data.rpm)) && parseFloat(data.rpm) > 0; // обороты должны быть > 0 (двигатель работает)
    const validBattery = data.battery !== undefined && data.battery !== null && !isNaN(parseFloat(data.battery)) && parseFloat(data.battery) > 0 && parseFloat(data.battery) <= 100; // батарея 0-100%
    
    // Добавляем данные ТОЛЬКО если они корректные
    if (validSpeed || validTemperature || validRpm || validBattery) {
        moduleRealTimeData[deviceId].timestamps.push(currentTime);
        
        // Добавляем только те поля, которые корректны, остальные берем предыдущие значения
        const lastIndex = moduleRealTimeData[deviceId].speed.length - 1;
        
        moduleRealTimeData[deviceId].speed.push(validSpeed ? parseFloat(data.speed) : 
            (lastIndex >= 0 ? moduleRealTimeData[deviceId].speed[lastIndex] : 0));
        moduleRealTimeData[deviceId].temperature.push(validTemperature ? parseFloat(data.temperature) : 
            (lastIndex >= 0 ? moduleRealTimeData[deviceId].temperature[lastIndex] : 0));
        moduleRealTimeData[deviceId].rpm.push(validRpm ? parseFloat(data.rpm) : 
            (lastIndex >= 0 ? moduleRealTimeData[deviceId].rpm[lastIndex] : 0));
        moduleRealTimeData[deviceId].battery.push(validBattery ? parseFloat(data.battery) : 
            (lastIndex >= 0 ? moduleRealTimeData[deviceId].battery[lastIndex] : 0));
            
        console.log(`✅ Valid data saved for ${deviceId}: speed=${validSpeed ? data.speed : 'kept'}, temp=${validTemperature ? data.temperature : 'kept'}, rpm=${validRpm ? data.rpm : 'kept'}, battery=${validBattery ? data.battery : 'kept'}`);
    } else {
        console.warn(`⚠️ Skipping invalid data for ${deviceId} - no valid numeric fields found:`, data);
        return; // Не обновляем графики если данные невалидны
    }
    
    // Обрезаем массивы если превышен лимит
    Object.keys(moduleRealTimeData[deviceId]).forEach(key => {
        if (moduleRealTimeData[deviceId][key].length > maxDataPoints) {
            moduleRealTimeData[deviceId][key] = moduleRealTimeData[deviceId][key].slice(-maxDataPoints);
        }
    });
    
    console.log(`📊 Real-time data saved for ${deviceId}:`, {
        speed: data.speed,
        temperature: data.temperature,
        rpm: data.rpm,
        battery: data.battery
    });

    updateModulesList();
    updateMapInfo();
    
    // Обновляем список модулей для Analytics
    updateModulesCheckboxes();
    
    // Обновляем графики реальными данными
    updateChartsDisplay();
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

// Analytics Functions - NEW 2x2 LAYOUT
function initializeCharts() {
    console.log('📊 Initializing all charts...');
    
    // Регистрируем плагин zoom
    Chart.register(window.zoomPlugin);
    
    createSpeedChart();
    createTemperatureChart();
    createRpmChart();
    createBatteryChart();
}

function createTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    charts.temperature = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 },
                        pinch: { enabled: true },
                        drag: { enabled: true, backgroundColor: 'rgba(128, 128, 128, 0.3)' },
                        mode: 'x'
                    },
                    pan: { enabled: true, mode: 'x', threshold: 10 },
                    limits: { y: {min: 0, max: 'original'}, x: {min: 'original', max: 'original'} }
                },
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'Temperature (°C) - Wheel to zoom, drag to pan, double-click to reset' }
            },
            scales: {
                x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: 'Temperature (°C)' }, min: 0 }
            }
        }
    });
    
    document.getElementById('temperatureChart').addEventListener('dblclick', function() {
        charts.temperature.resetZoom();
    });
}

function createRpmChart() {
    const ctx = document.getElementById('rpmChart').getContext('2d');
    charts.rpm = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 },
                        pinch: { enabled: true },
                        drag: { enabled: true, backgroundColor: 'rgba(128, 128, 128, 0.3)' },
                        mode: 'x'
                    },
                    pan: { enabled: true, mode: 'x', threshold: 10 },
                    limits: { y: {min: 0, max: 'original'}, x: {min: 'original', max: 'original'} }
                },
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'RPM - Wheel to zoom, drag to pan, double-click to reset' }
            },
            scales: {
                x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: 'RPM' }, min: 0 }
            }
        }
    });
    
    document.getElementById('rpmChart').addEventListener('dblclick', function() {
        charts.rpm.resetZoom();
    });
}

function createBatteryChart() {
    const ctx = document.getElementById('batteryChart').getContext('2d');
    charts.battery = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 },
                        pinch: { enabled: true },
                        drag: { enabled: true, backgroundColor: 'rgba(128, 128, 128, 0.3)' },
                        mode: 'x'
                    },
                    pan: { enabled: true, mode: 'x', threshold: 10 },
                    limits: { y: {min: 0, max: 100}, x: {min: 'original', max: 'original'} }
                },
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'Battery (%) - Wheel to zoom, drag to pan, double-click to reset' }
            },
            scales: {
                x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: 'Battery (%)' }, min: 0, max: 100 }
            }
        }
    });
    
    document.getElementById('batteryChart').addEventListener('dblclick', function() {
        charts.battery.resetZoom();
    });
}

function createSpeedChart() {
    const ctx = document.getElementById('speedChart').getContext('2d');
    charts.speed = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1
                        },
                        pinch: {
                            enabled: true
                        },
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(128, 128, 128, 0.3)'
                        },
                        mode: 'x',
                        onZoomComplete: function({chart}) {
                            console.log('📊 Speed chart zoomed');
                        }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 10,
                        onPanComplete: function({chart}) {
                            console.log('📊 Speed chart panned');
                        }
                    },
                    limits: {
                        y: {min: 0, max: 'original'},
                        x: {min: 'original', max: 'original'}
                    }
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Speed (km/h) - Wheel to zoom, drag to pan, double-click to reset'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute'
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Speed (km/h)'
                    },
                    min: 0
                }
            }
        }
    });
    
    // Добавляем событие двойного клика для сброса зума
    document.getElementById('speedChart').addEventListener('dblclick', function() {
        charts.speed.resetZoom();
        console.log('📊 Speed chart zoom reset');
    });
}

function updateChartsDisplay() {
    console.log('📊 Updating charts display with real data...');
    console.log('Selected modules:', Array.from(selectedModules));
    
    // Обновляем каждый график только с выбранными модулями
    updateSpeedChartReal();
    updateTemperatureChartReal();
    updateRpmChartReal();
    updateBatteryChartReal();
}

// Устаревшая функция для демонстрации (оставляем для совместимости)
function updateCharts() {
    console.log('📊 Updating charts with time range filter...');
    
    // Получаем выбранный временной диапазон
    const timeRangeElement = document.getElementById('timeRange');
    const timeRange = timeRangeElement ? timeRangeElement.value : '24h';
    
    console.log(`⏰ Selected time range: ${timeRange}`);
    
    // Применяем фильтр времени к данным
    applyTimeRangeFilter(timeRange);
    
    // Обновляем отображение графиков
    updateChartsDisplay();
}

// Новая функция для применения временного фильтра
function applyTimeRangeFilter(timeRange) {
    console.log(`🕒 Applying time range filter: ${timeRange}`);
    
    const now = new Date();
    let startTime;
    
    // Определяем начальное время на основе выбранного диапазона
    switch(timeRange) {
        case '1h':
            startTime = new Date(now.getTime() - (1 * 60 * 60 * 1000)); // 1 час назад
            break;
        case '6h':
            startTime = new Date(now.getTime() - (6 * 60 * 60 * 1000)); // 6 часов назад
            break;
        case '12h':
            startTime = new Date(now.getTime() - (12 * 60 * 60 * 1000)); // 12 часов назад
            break;
        case '24h':
        default:
            startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 часа назад
            break;
        case '7d':
            startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 дней назад
            break;
        case '30d':
            startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 дней назад
            break;
    }
    
    console.log(`📅 Filtering data from ${startTime.toISOString()} to ${now.toISOString()}`);
    
    // Фильтруем данные для каждого модуля
    Object.keys(moduleRealTimeData).forEach(moduleId => {
        const moduleData = moduleRealTimeData[moduleId];
        
        // Фильтруем массивы данных по времени
        const filteredIndices = [];
        moduleData.timestamps.forEach((timestamp, index) => {
            const dataTime = new Date(timestamp);
            if (dataTime >= startTime && dataTime <= now) {
                filteredIndices.push(index);
            }
        });
        
        // Создаем отфильтрованные массивы
        moduleData.filteredSpeed = filteredIndices.map(i => moduleData.speed[i]);
        moduleData.filteredTemperature = filteredIndices.map(i => moduleData.temperature[i]);
        moduleData.filteredRpm = filteredIndices.map(i => moduleData.rpm[i]);
        moduleData.filteredBattery = filteredIndices.map(i => moduleData.battery[i]);
        moduleData.filteredTimestamps = filteredIndices.map(i => moduleData.timestamps[i]);
        
        console.log(`📊 Module ${moduleId}: ${filteredIndices.length} data points after filtering`);
    });
}

function updateSpeedChartReal() {
    if (!charts.speed) return;
    
    const datasets = [];
    let commonTimestamps = [];
    
    // Добавляем данные для каждого выбранного модуля
    Array.from(selectedModules).forEach((moduleId, index) => {
        const color = MODULE_COLORS[index % MODULE_COLORS.length];
        const moduleData = moduleRealTimeData[moduleId];
        
        if (moduleData) {
            // Используем отфильтрованные данные если они есть, иначе все данные
            const speedData = moduleData.filteredSpeed || moduleData.speed || [];
            const timestamps = moduleData.filteredTimestamps || moduleData.timestamps || [];
            
            if (speedData.length > 0) {
                datasets.push({
                    label: `${moduleId} Speed`,
                    data: speedData,
                    borderColor: color,
                    backgroundColor: color + '20',
                    tension: 0.4,
                    pointRadius: 2
                });
                
                // Используем timestamps от модуля с наибольшим количеством данных
                if (timestamps.length > commonTimestamps.length) {
                    commonTimestamps = timestamps;
                }
            }
        }
    });
    
    // Если нет реальных данных, показываем пустой график
    if (datasets.length === 0) {
        datasets.push({
            label: 'No data available',
            data: [],
            borderColor: '#666',
            backgroundColor: '#66620',
        });
        commonTimestamps = ['No data'];
    }
    
    charts.speed.data.labels = commonTimestamps;
    charts.speed.data.datasets = datasets;
    charts.speed.update('none');
    console.log(`📈 Speed chart updated with ${datasets.length} modules, ${commonTimestamps.length} data points`);
}

// Устаревшая функция
function updateSpeedChart(timestamps) {
    console.log('⚠️ Using deprecated updateSpeedChart() - switching to real data');
    updateSpeedChartReal();
}

function updateTemperatureChartReal() {
    if (!charts.temperature) return;
    
    const datasets = [];
    let commonTimestamps = [];
    
    // Добавляем данные для каждого выбранного модуля
    Array.from(selectedModules).forEach((moduleId, index) => {
        const color = MODULE_COLORS[index % MODULE_COLORS.length];
        const moduleData = moduleRealTimeData[moduleId];
        
        if (moduleData) {
            // Используем отфильтрованные данные если они есть, иначе все данные
            const tempData = moduleData.filteredTemperature || moduleData.temperature || [];
            const timestamps = moduleData.filteredTimestamps || moduleData.timestamps || [];
            
            if (tempData.length > 0) {
                datasets.push({
                    label: `${moduleId} Temperature`,
                    data: tempData,
                    borderColor: color,
                    backgroundColor: color + '20',
                    tension: 0.4,
                    pointRadius: 2
                });
                
                if (timestamps.length > commonTimestamps.length) {
                    commonTimestamps = timestamps;
                }
            }
        }
    });
    
    if (datasets.length === 0) {
        datasets.push({
            label: 'No data available',
            data: [],
            borderColor: '#666',
            backgroundColor: '#66620',
        });
        commonTimestamps = ['No data'];
    }
    
    charts.temperature.data.labels = commonTimestamps;
    charts.temperature.data.datasets = datasets;
    charts.temperature.update('none');
    console.log(`🌡️ Temperature chart updated with ${datasets.length} modules, ${commonTimestamps.length} data points`);
}

function updateTemperatureChart(timestamps) {
    console.log('⚠️ Using deprecated updateTemperatureChart() - switching to real data');
    updateTemperatureChartReal();
}

function updateRpmChartReal() {
    if (!charts.rpm) return;
    
    const datasets = [];
    let commonTimestamps = [];
    
    // Добавляем данные для каждого выбранного модуля
    Array.from(selectedModules).forEach((moduleId, index) => {
        const color = MODULE_COLORS[index % MODULE_COLORS.length];
        const moduleData = moduleRealTimeData[moduleId];
        
        if (moduleData) {
            // Используем отфильтрованные данные если они есть, иначе все данные
            const rpmData = moduleData.filteredRpm || moduleData.rpm || [];
            const timestamps = moduleData.filteredTimestamps || moduleData.timestamps || [];
            
            if (rpmData.length > 0) {
                datasets.push({
                    label: `${moduleId} RPM`,
                    data: rpmData,
                    borderColor: color,
                    backgroundColor: color + '20',
                    tension: 0.4,
                    pointRadius: 2
                });
                
                if (timestamps.length > commonTimestamps.length) {
                    commonTimestamps = timestamps;
                }
            }
        }
    });
    
    if (datasets.length === 0) {
        datasets.push({
            label: 'No data available',
            data: [],
            borderColor: '#666',
            backgroundColor: '#66620',
        });
        commonTimestamps = ['No data'];
    }
    
    charts.rpm.data.labels = commonTimestamps;
    charts.rpm.data.datasets = datasets;
    charts.rpm.update('none');
    console.log(`⚡ RPM chart updated with ${datasets.length} modules, ${commonTimestamps.length} data points`);
}

function updateRpmChart(timestamps) {
    console.log('⚠️ Using deprecated updateRpmChart() - switching to real data');
    updateRpmChartReal();
}

function updateBatteryChartReal() {
    if (!charts.battery) return;
    
    const datasets = [];
    let commonTimestamps = [];
    
    // Добавляем данные для каждого выбранного модуля
    Array.from(selectedModules).forEach((moduleId, index) => {
        const color = MODULE_COLORS[index % MODULE_COLORS.length];
        const moduleData = moduleRealTimeData[moduleId];
        
        if (moduleData) {
            // Используем отфильтрованные данные если они есть, иначе все данные
            const batteryData = moduleData.filteredBattery || moduleData.battery || [];
            const timestamps = moduleData.filteredTimestamps || moduleData.timestamps || [];
            
            if (batteryData.length > 0) {
                datasets.push({
                    label: `${moduleId} Battery`,
                    data: batteryData,
                    borderColor: color,
                    backgroundColor: color + '20',
                    tension: 0.4,
                    pointRadius: 2
                });
                
                if (timestamps.length > commonTimestamps.length) {
                    commonTimestamps = timestamps;
                }
            }
        }
    });
    
    if (datasets.length === 0) {
        datasets.push({
            label: 'No data available',
            data: [],
            borderColor: '#666',
            backgroundColor: '#66620',
        });
        commonTimestamps = ['No data'];
    }
    
    charts.battery.data.labels = commonTimestamps;
    charts.battery.data.datasets = datasets;
    charts.battery.update('none');
    console.log(`🔋 Battery chart updated with ${datasets.length} modules, ${commonTimestamps.length} data points`);
}

function updateBatteryChart(timestamps) {
    console.log('⚠️ Using deprecated updateBatteryChart() - switching to real data');
    updateBatteryChartReal();
}

function expandChart(chartId) {
    const modal = document.getElementById('chartModal');
    const modalTitle = document.getElementById('chartModalTitle');
    const expandedCanvas = document.getElementById('expandedChart');
    
    // Set title
    const titles = {
        speedChart: '🏎️ Speed - Detailed View',
        temperatureChart: '🌡️ Temperature - Detailed View',
        rpmChart: '⚡ RPM - Detailed View',
        batteryChart: '🔋 Battery - Detailed View'
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
    
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    
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
    
    // Generate sample data for demonstration
    const now = Date.now();
    const labels = [];
    const speedData = [];
    const batteryData = [];
    
    for (let i = 19; i >= 0; i--) {
        const time = new Date(now - i * 60000);
        labels.push(time.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }));
        speedData.push(Math.random() * 80);
        batteryData.push(60 + Math.random() * 40);
    }
    
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
                data: speedData,
                borderColor: '#007aff',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                tension: 0.4
            }, {
                label: 'Battery (%)',
                data: batteryData,
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
    
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function closeModuleChartModal() {
    const modal = document.getElementById('moduleChartModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    
    if (window.moduleChartInstance) {
        window.moduleChartInstance.destroy();
        window.moduleChartInstance = null;
    }
}

// UI Functions
function updateConnectionStatus(status, text) {
    // Update main status indicator in sidebar
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    // Update compact status indicator in top nav
    const statusIndicatorTop = document.getElementById('statusIndicatorTop');
    const statusTextTop = document.getElementById('statusTextTop');
    
    [indicator, statusIndicatorTop].forEach(indicatorEl => {
        if (indicatorEl) {
            indicatorEl.className = 'status-indicator';
            if (status === 'connected') {
                indicatorEl.classList.add('connected');
            }
        }
    });
    
    [statusText, statusTextTop].forEach(textEl => {
        if (textEl) {
            textEl.textContent = text;
        }
    });
}

function updateModulesList() {
    const container = document.getElementById('modulesList');
    const totalModulesSidebar = document.getElementById('totalModulesSidebar');
    const onlineModulesSidebar = document.getElementById('onlineModulesSidebar');
    
    if (!container) return;
    
    const moduleList = Object.values(modules);
    
    // Update module counts in sidebar
    if (totalModulesSidebar) {
        totalModulesSidebar.textContent = moduleList.length;
    }
    
    // Calculate online modules
    const onlineModules = moduleList.filter(module => {
        const timeSinceLastSeen = Math.floor((new Date() - module.lastSeen) / 1000);
        return timeSinceLastSeen < 60;
    }).length;
    
    if (onlineModulesSidebar) {
        onlineModulesSidebar.textContent = onlineModules;
    }
    
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
                    <div class="module-name">🚛 Vehicle ${module.id.replace('ESP32_Car_', '').replace('ESP32_Tractor_', '')}</div>
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

    // Update sidebar stats
    const sidebarElements = {
        totalModulesSidebar: document.getElementById('totalModulesSidebar'),
        onlineModulesSidebar: document.getElementById('onlineModulesSidebar')
    };

    if (sidebarElements.totalModulesSidebar) sidebarElements.totalModulesSidebar.textContent = totalModules;
    if (sidebarElements.onlineModulesSidebar) sidebarElements.onlineModulesSidebar.textContent = onlineModules;

    // Update map header stats
    const mapElements = {
        avgSpeedMap: document.getElementById('avgSpeedMap'),
        lastUpdateMap: document.getElementById('lastUpdateMap')
    };

    if (mapElements.avgSpeedMap) mapElements.avgSpeedMap.textContent = avgSpeed;
    if (mapElements.lastUpdateMap) mapElements.lastUpdateMap.textContent = new Date().toLocaleTimeString('ru-RU');

    // Legacy support for old element IDs
    const legacyElements = {
        totalModules: document.getElementById('totalModules'),
        onlineModules: document.getElementById('onlineModules'),
        avgSpeed: document.getElementById('avgSpeed'),
        lastUpdate: document.getElementById('lastUpdate')
    };

    if (legacyElements.totalModules) legacyElements.totalModules.textContent = totalModules;
    if (legacyElements.onlineModules) legacyElements.onlineModules.textContent = onlineModules;
    if (legacyElements.avgSpeed) legacyElements.avgSpeed.textContent = avgSpeed;
    if (legacyElements.lastUpdate) legacyElements.lastUpdate.textContent = new Date().toLocaleTimeString('ru-RU');
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
    const modal = document.getElementById('serverModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function closeServerModal() {
    const modal = document.getElementById('serverModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
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
    const modals = ['serverModal', 'moduleChartModal', 'chartModal', 'customServerModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
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

console.log('🚛 Fleet Monitor Pro v2.1.6 loaded successfully!');

// TEST FUNCTION: Add sample markers for testing
// Make functions available globally for debugging
window.clearAllMarkers = clearAllMarkers;
window.getMarkersCount = getMarkersCount;
window.listMarkersOnMap = listMarkersOnMap;

console.log('💡 Available debugging functions:');
console.log('   - clearAllMarkers() - remove all markers from map');
console.log('   - getMarkersCount() - get number of markers on map');
console.log('   - listMarkersOnMap() - list all current markers with details');

// ========================= CUSTOM MQTT FUNCTIONS =========================

let customServerConfig = {
    url: 'wss://broker.emqx.io:8084/mqtt',
    port: 8084,
    protocol: 'wss',
    username: '',
    password: '',
    topicPrefix: 'car',
    clientId: ''
};

function openCustomServerModal() {
    const modal = document.getElementById('customServerModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    loadCustomServerConfig();
}

function closeCustomServerModal() {
    const modal = document.getElementById('customServerModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function loadCustomServerConfig() {
    const saved = localStorage.getItem('customMqttConfig');
    if (saved) {
        customServerConfig = { ...customServerConfig, ...JSON.parse(saved) };
    }
    
    // Populate form fields
    document.getElementById('customServerUrl').value = customServerConfig.url;
    document.getElementById('customServerPort').value = customServerConfig.port;
    document.getElementById('customProtocol').value = customServerConfig.protocol;
    document.getElementById('customUsername').value = customServerConfig.username;
    document.getElementById('customPassword').value = customServerConfig.password;
    document.getElementById('customTopicPrefix').value = customServerConfig.topicPrefix;
    document.getElementById('customClientId').value = customServerConfig.clientId;
}

function testCustomConnection() {
    const testStatus = document.getElementById('connectionTestStatus');
    const testBtn = document.querySelector('.test-btn');
    
    testStatus.textContent = 'Testing connection...';
    testStatus.className = 'test-status testing';
    testBtn.disabled = true;
    
    // Get form values
    const testConfig = {
        url: document.getElementById('customServerUrl').value,
        username: document.getElementById('customUsername').value,
        password: document.getElementById('customPassword').value,
        clientId: document.getElementById('customClientId').value || `test_${Date.now()}`
    };
    
    try {
        const testClient = mqtt.connect(testConfig.url, {
            clientId: testConfig.clientId,
            username: testConfig.username || undefined,
            password: testConfig.password || undefined,
            clean: true,
            connectTimeout: 10000,
            keepalive: 30
        });

        const timeoutId = setTimeout(() => {
            testClient.end();
            testStatus.textContent = 'Connection timeout - please check your settings';
            testStatus.className = 'test-status error';
            testBtn.disabled = false;
        }, 10000);

        testClient.on('connect', function() {
            clearTimeout(timeoutId);
            testStatus.textContent = '✅ Connection successful!';
            testStatus.className = 'test-status success';
            testBtn.disabled = false;
            testClient.end();
        });

        testClient.on('error', function(error) {
            clearTimeout(timeoutId);
            testStatus.textContent = `❌ Connection failed: ${error.message}`;
            testStatus.className = 'test-status error';
            testBtn.disabled = false;
            testClient.end();
        });

    } catch (error) {
        testStatus.textContent = `❌ Error: ${error.message}`;
        testStatus.className = 'test-status error';
        testBtn.disabled = false;
    }
}

function saveCustomServer() {
    // Get form values
    customServerConfig = {
        url: document.getElementById('customServerUrl').value,
        port: parseInt(document.getElementById('customServerPort').value) || 8084,
        protocol: document.getElementById('customProtocol').value,
        username: document.getElementById('customUsername').value,
        password: document.getElementById('customPassword').value,
        topicPrefix: document.getElementById('customTopicPrefix').value || 'car',
        clientId: document.getElementById('customClientId').value
    };
    
    // Validate URL
    if (!customServerConfig.url) {
        showNotification('Please enter a server URL', 'error');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('customMqttConfig', JSON.stringify(customServerConfig));
    
    // Connect to custom server
    connectToCustomServer();
    
    closeCustomServerModal();
    showNotification('Custom server configured successfully', 'success');
}

function resetCustomServer() {
    localStorage.removeItem('customMqttConfig');
    customServerConfig = {
        url: 'wss://broker.emqx.io:8084/mqtt',
        port: 8084,
        protocol: 'wss',
        username: '',
        password: '',
        topicPrefix: 'car',
        clientId: ''
    };
    loadCustomServerConfig();
    showNotification('Settings reset to default', 'info');
}

function connectToCustomServer() {
    if (client && client.connected) {
        client.end();
    }

    updateConnectionStatus('connecting', 'Connecting to custom server...');
    
    try {
        const clientId = customServerConfig.clientId || 
                        `fleet_monitor_custom_${Math.random().toString(16).substr(2, 8)}`;
        
        const connectOptions = {
            clientId: clientId,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
            keepalive: 30
        };
        
        if (customServerConfig.username) {
            connectOptions.username = customServerConfig.username;
        }
        if (customServerConfig.password) {
            connectOptions.password = customServerConfig.password;
        }
        
        client = mqtt.connect(customServerConfig.url, connectOptions);

        client.on('connect', function() {
            console.log('Connected to custom MQTT server');
            updateConnectionStatus('connected', 'Connected to Custom Server');
            
            // Subscribe to topics using custom prefix
            const topics = [
                `${customServerConfig.topicPrefix}/+/data`,
                `${customServerConfig.topicPrefix}/+/status`,
                `${customServerConfig.topicPrefix}/+/location`,
                `${customServerConfig.topicPrefix}/+/commands`,
                `${currentUserId}/+/data`,
                `${currentUserId}/+/status`,
                `${currentUserId}/+/location`
            ];
            
            topics.forEach(topic => {
                client.subscribe(topic, { qos: 1 });
            });
            
            showNotification('Connected to custom MQTT server', 'success');
            
            // Update current server display
            currentCloudServer = {
                name: 'Custom Server',
                ws: customServerConfig.url
            };
            
            document.getElementById('currentServerName').textContent = 'Custom Server';
        });

        client.on('message', function(topic, message) {
            handleCloudMessage(topic, message);
        });

        client.on('error', function(error) {
            console.error('Custom MQTT error:', error);
            updateConnectionStatus('error', 'Custom server connection failed');
            showNotification(`Custom server error: ${error.message}`, 'error');
        });

        client.on('offline', function() {
            updateConnectionStatus('offline', 'Custom server offline');
            showNotification('Custom server connection lost', 'error');
        });

    } catch (error) {
        console.error('Error connecting to custom server:', error);
        updateConnectionStatus('error', 'Custom server connection failed');
        showNotification(`Failed to connect to custom server: ${error.message}`, 'error');
    }
}

function centerMapOnDevice(deviceId) {
    if (mapMarkers[deviceId]) {
        const marker = mapMarkers[deviceId];
        const latLng = marker.getLatLng();
        map.setView(latLng, 15);
        console.log(`🎯 Centered map on device ${deviceId} at ${latLng.lat}, ${latLng.lng}`);
    }
}

// NEW: Function to show detailed panel for marker
function showDetailsPanel(deviceId, content) {
    // Remove any existing details panel
    const existingPanel = document.querySelector('.marker-details-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // Create new details panel
    const panel = document.createElement('div');
    panel.innerHTML = content;
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        right: 20px;
        transform: translateY(-50%);
        z-index: 10000;
        background: var(--bg-secondary);
        border: 2px solid var(--accent-color);
        border-radius: var(--radius-lg);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        max-width: 350px;
        max-height: 80vh;
        overflow-y: auto;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(panel);
    console.log(`📋 Opened details panel for ${deviceId}`);
}

// NEW: Function to close details panel
function closeDetailsPanel(deviceId) {
    const panel = document.querySelector('.marker-details-panel');
    if (panel) {
        panel.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (panel.parentNode) {
                panel.parentNode.removeChild(panel);
            }
        }, 300);
        console.log(`❌ Closed details panel for ${deviceId}`);
    }
}

// Make functions globally available
window.showDetailsPanel = showDetailsPanel;
window.closeDetailsPanel = closeDetailsPanel;

// Auto-load custom server config on startup and add to existing DOMContentLoaded event
document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem('customMqttConfig');
    if (saved) {
        customServerConfig = { ...customServerConfig, ...JSON.parse(saved) };
        console.log('Custom MQTT config loaded:', customServerConfig);
    }
    
    // Close modals when clicking outside
    window.onclick = function(event) {
        const modals = ['serverModal', 'moduleChartModal', 'chartModal', 'customServerModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (event.target === modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        });
        
        // Close details panel when clicking outside
        if (event.target.closest && !event.target.closest('.marker-details-panel') && 
            !event.target.closest('.custom-marker')) {
            const panel = document.querySelector('.marker-details-panel');
            if (panel) {
                closeDetailsPanel('');
            }
        }
    }
}); 