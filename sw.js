const CACHE_NAME = 'essential-duas-v28';
const QURAN_AUDIO_CACHE = 'crown-quran-audio-v1';
const OFFLINE_PAGE = './offline.html';

const ASSETS = [
  './',
  './index.html',
  './styles.min.css',
  './app.min.js',
  './styles.css',
  './app.js',
  './offline.html',
  './privacy.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.svg',
  './pashto.js'
];

// Install — pre-cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Always cache the offline page first
      return cache.addAll([OFFLINE_PAGE, './index.html', './manifest.json', './favicon.svg', './icon-192.png', './icon-512.png'])
        .then(() => {
          // Then try to cache everything else (fonts may fail, that's OK)
          return cache.addAll(ASSETS).catch(() => {});
        });
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches and notify clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => {
      // Notify all open clients that a new version is active
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback, offline page as last resort
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isAudioRequest = event.request.destination === 'audio'
    || requestUrl.pathname.includes('/audio/')
    || /\.mp3$/i.test(requestUrl.pathname)
    || requestUrl.hostname.includes('islamic.network')
    || requestUrl.hostname.includes('alquran.cloud');

  if (isAudioRequest) {
    event.respondWith(
      (async () => {
        const audioCache = await caches.open(QURAN_AUDIO_CACHE);
        const appCache = await caches.open(CACHE_NAME);

        const cachedAudio = await audioCache.match(event.request, { ignoreSearch: true });
        if (cachedAudio) return cachedAudio;

        const cachedApp = await appCache.match(event.request, { ignoreSearch: true });
        if (cachedApp) return cachedApp;

        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            const forAudio = response.clone();
            const forApp = response.clone();
            audioCache.put(event.request, forAudio).catch(() => {});
            appCache.put(event.request, forApp).catch(() => {});
          }
          return response;
        } catch (error) {
          const fallback = await caches.match(event.request, { ignoreSearch: true });
          if (fallback) return fallback;
          throw error;
        }
      })()
    );
    return;
  }

  // For navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((cached) => cached || caches.match('./index.html'))
            .then((cached) => cached || caches.match(OFFLINE_PAGE));
        })
    );
    return;
  }

  // For all other assets (CSS, JS, images, fonts)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./');
    })
  );
});
