const CACHE_NAME = 'fleet-monitor-pro-v2.3.1';
const DYNAMIC_CACHE = 'fleet-monitor-dynamic-v2.3.1';

// Static files to cache
const STATIC_FILES = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://unpkg.com/mqtt/dist/mqtt.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Map tiles to cache (limited set for offline use)
const MAP_TILES_TO_CACHE = [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/1',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/2',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/2/1',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/2/2'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    console.log('SW: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('SW: Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('SW: Static files cached successfully');
                return self.skipWaiting(); // Activate immediately
            })
            .catch((error) => {
                console.error('SW: Failed to cache static files:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('SW: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
                            console.log('SW: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('SW: Activated successfully');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip WebSocket connections
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
        return;
    }
    
    // Handle different types of requests
    if (isStaticFile(request.url)) {
        event.respondWith(cacheFirstStrategy(request));
    } else if (isMapTile(request.url)) {
        event.respondWith(mapTileStrategy(request));
    } else if (isAPIRequest(request.url)) {
        event.respondWith(networkFirstStrategy(request));
    } else {
        event.respondWith(staleWhileRevalidateStrategy(request));
    }
});

// Message event - handle messages from client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        clearAllCaches().then(() => {
            event.ports[0].postMessage({ success: true });
        });
    }
});

// Background sync for offline MQTT messages
self.addEventListener('sync', (event) => {
    if (event.tag === 'mqtt-sync') {
        event.waitUntil(syncOfflineMQTTMessages());
    }
});

// Push notifications for fleet alerts
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Fleet Monitor notification',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            tag: 'fleet-notification',
            requireInteraction: true,
            actions: [
                {
                    action: 'view',
                    title: 'View Dashboard',
                    icon: '/icons/view-icon.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/icons/dismiss-icon.png'
                }
            ],
            data: {
                url: data.url || '/',
                timestamp: Date.now()
            }
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Fleet Monitor Pro', options)
        );
    }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'view' || !event.action) {
        const url = event.notification.data?.url || '/';
        
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then((clientList) => {
                    // If app is already open, focus it
                    for (const client of clientList) {
                        if (client.url === url && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    
                    // Otherwise open new window
                    if (clients.openWindow) {
                        return clients.openWindow(url);
                    }
                })
        );
    }
});

// Cache strategies with mobile timeout handling
function cacheFirstStrategy(request) {
    return caches.match(request)
        .then((response) => {
            if (response) {
                console.log('SW: Serving from cache:', request.url);
                return response;
            }
            
            // Add timeout for mobile connections
            return fetchWithTimeout(request, 10000) // 10 second timeout
                .then((networkResponse) => {
                    if (networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch((error) => {
                    console.warn('SW: Network request failed:', error);
                    // Return offline page for HTML requests
                    if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
                        return createOfflinePage();
                    }
                    throw new Error('Network request failed: ' + error.message);
                });
        });
}

function networkFirstStrategy(request) {
    return fetchWithTimeout(request, 8000) // 8 second timeout for API calls
        .then((response) => {
            if (response.ok) {
                const responseClone = response.clone();
                caches.open(DYNAMIC_CACHE)
                    .then((cache) => cache.put(request, responseClone));
            }
            return response;
        })
        .catch((error) => {
            console.warn('SW: Network first failed, trying cache:', error);
            return caches.match(request);
        });
}

function staleWhileRevalidateStrategy(request) {
    return caches.match(request)
        .then((cachedResponse) => {
            const fetchPromise = fetchWithTimeout(request, 6000) // 6 second timeout
                .then((networkResponse) => {
                    if (networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE)
                            .then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch((error) => {
                    console.warn('SW: Stale while revalidate failed:', error);
                    return cachedResponse;
                });
            
            return cachedResponse || fetchPromise;
        });
}

function mapTileStrategy(request) {
    return caches.match(request)
        .then((response) => {
            if (response) {
                return response;
            }
            
            return fetchWithTimeout(request, 5000) // 5 second timeout for map tiles
                .then((networkResponse) => {
                    if (networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE)
                            .then((cache) => {
                                // Limit map tile cache size
                                cache.keys().then((keys) => {
                                    if (keys.length > 100) {
                                        cache.delete(keys[0]); // Remove oldest
                                    }
                                    cache.put(request, responseClone);
                                });
                            });
                    }
                    return networkResponse;
                })
                .catch((error) => {
                    console.warn('SW: Map tile failed:', error);
                    // Return placeholder tile for offline
                    return createPlaceholderTile();
                });
        });
}

// Helper functions
function isStaticFile(url) {
    return STATIC_FILES.some(staticUrl => url.includes(staticUrl.split('/').pop()));
}

function isMapTile(url) {
    return url.includes('tile') || 
           url.includes('arcgisonline.com') || 
           url.includes('openstreetmap.org') ||
           url.includes('cartocdn.com');
}

function isAPIRequest(url) {
    return url.includes('/api/') || 
           url.includes('mqtt') ||
           url.includes('websocket');
}

function createOfflinePage() {
    const offlineHTML = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Fleet Monitor Pro - Offline</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', Arial, sans-serif;
                    background: #0a0a0a;
                    color: #ffffff;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    text-align: center;
                }
                .offline-container {
                    padding: 40px;
                    max-width: 400px;
                }
                .offline-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }
                .offline-title {
                    font-size: 2rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #30d158 0%, #40e0d0 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: 1rem;
                }
                .offline-message {
                    color: #a0a0a0;
                    margin-bottom: 2rem;
                    line-height: 1.5;
                }
                .retry-btn {
                    background: linear-gradient(135deg, #30d158 0%, #40e0d0 100%);
                    border: none;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: transform 0.2s ease;
                }
                .retry-btn:hover {
                    transform: translateY(-1px);
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📱</div>
                <h1 class="offline-title">Offline Mode</h1>
                <p class="offline-message">
                    You're currently offline. Some features may be limited until you reconnect to the internet.
                </p>
                <button class="retry-btn" onclick="window.location.reload()">
                    Try Again
                </button>
            </div>
        </body>
        </html>
    `;
    
    return new Response(offlineHTML, {
        headers: { 'Content-Type': 'text/html' }
    });
}

function createPlaceholderTile() {
    // Create a simple gray tile for offline mode
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
            <rect width="256" height="256" fill="#2a2a2a"/>
            <text x="128" y="128" text-anchor="middle" dominant-baseline="central" 
                  fill="#a0a0a0" font-family="Arial" font-size="14">Offline</text>
        </svg>
    `;
    
    return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml' }
    });
}

function clearAllCaches() {
    return caches.keys()
        .then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => caches.delete(cacheName))
            );
        });
}

function syncOfflineMQTTMessages() {
    // Get offline messages from IndexedDB and send them
    return new Promise((resolve) => {
        // Implementation would depend on how offline messages are stored
        console.log('SW: Syncing offline MQTT messages');
        resolve();
    });
}

// Performance monitoring
function trackPerformance(eventName, data) {
    // Send performance data to analytics
    console.log('SW Performance:', eventName, data);
}

// Cache management
setInterval(() => {
    // Clean up old dynamic cache entries
    caches.open(DYNAMIC_CACHE)
        .then((cache) => {
            cache.keys().then((keys) => {
                if (keys.length > 200) {
                    // Remove oldest 50 entries
                    const toDelete = keys.slice(0, 50);
                    toDelete.forEach((key) => cache.delete(key));
                }
            });
        });
}, 60000); // Run every minute

// Fetch with timeout for mobile connections
function fetchWithTimeout(request, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
        
        fetch(request)
            .then((response) => {
                clearTimeout(timeoutId);
                resolve(response);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

console.log('SW: Fleet Monitor Pro Service Worker loaded successfully'); 