const CACHE_NAME = 'essential-duas-v74';
const QURAN_AUDIO_CACHE = 'crown-quran-audio-v1';
const OFFLINE_PAGE = './offline.html';
const PRAYER_REMINDER_DUE_WINDOW_MS = 2 * 60 * 1000;
const PRAYER_REMINDER_GRACE_MS = 3 * 60 * 60 * 1000;

let prayerReminderState = {
  generatedAt: 0,
  timezoneOffsetMinutes: null,
  reminders: []
};
const firedReminderMap = new Map();

function cleanupFiredReminderMap(nowTs) {
  for (const [key, firedAt] of firedReminderMap.entries()) {
    if (nowTs - firedAt > 24 * 60 * 60 * 1000) firedReminderMap.delete(key);
  }
}

async function broadcastReminderDue(payload) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(payload));
}

async function checkDuePrayerReminders(reason = 'manual') {
  const nowTs = Date.now();
  cleanupFiredReminderMap(nowTs);

  const reminders = Array.isArray(prayerReminderState.reminders) ? prayerReminderState.reminders : [];
  const dueReminders = reminders.filter((entry) => {
    if (!entry || typeof entry.triggerAt !== 'number' || !entry.prayerName) return false;
    const diff = entry.triggerAt - nowTs;
    return diff <= PRAYER_REMINDER_DUE_WINDOW_MS && diff >= -PRAYER_REMINDER_GRACE_MS;
  });

  await Promise.all(dueReminders.map(async (entry) => {
    const reminderKey = `${entry.prayerName}-${entry.triggerAt}`;
    if (firedReminderMap.has(reminderKey)) return;
    firedReminderMap.set(reminderKey, nowTs);

    const title = `${entry.icon || '🕌'} Prayer reminder`;
    const body = entry.offsetMinutes > 0
      ? `${entry.label || entry.prayerName} in ${entry.offsetMinutes} minutes.`
      : `${entry.label || entry.prayerName} time is now.`;

    await self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: `prayer-reminder-${entry.prayerName}-${entry.triggerAt}`,
      renotify: false,
      data: {
        prayerName: entry.prayerName,
        triggerAt: entry.triggerAt,
        reason
      }
    });

    await broadcastReminderDue({
      type: 'SW_PRAYER_REMINDER_DUE',
      prayerName: entry.prayerName,
      triggerAt: entry.triggerAt,
      reason
    });
  }));
}

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
  './pashto.js',
  './audio/reminders/adhan-alafasy.mp3',
  './audio/reminders/adhan-abdulbasit.mp3',
  './audio/reminders/adhan-short.mp3',
  './audio/reminders/takbeer.mp3',
  './audio/reminders/nasheed-tone.mp3',
  './audio/reminders/bell-chime.mp3',
  './audio/reminders/soft-ding.mp3',
  './audio/duas/dua-11.mp3',
  './audio/duas/dua-12.mp3',
  './audio/duas/dua-13.mp3',
  './audio/duas/dua-14.mp3',
  './audio/duas/dua-15.mp3',
  './audio/duas/dua-16.mp3',
  './audio/duas/dua-17.mp3',
  './audio/duas/dua-21.mp3',
  './audio/duas/dua-23.mp3',
  './audio/duas/dua-24.mp3',
  './audio/duas/dua-25.mp3',
  './audio/duas/dua-26.mp3',
  './audio/duas/dua-27.mp3',
  './audio/duas/dua-34.mp3',
  './audio/duas/dua-36.mp3',
  './audio/duas/dua-37.mp3',
  './audio/duas/dua-38.mp3',
  './audio/duas/dua-39.mp3',
  './audio/duas/dua-41.mp3',
  './audio/duas/dua-42.mp3',
  './audio/duas/dua-46.mp3',
  './audio/duas/dua-47.mp3',
  './audio/duas/dua-49.mp3',
  './audio/duas/dua-51.mp3',
  './audio/duas/dua-56.mp3',
  './audio/duas/dua-57.mp3',
  './audio/duas/dua-58.mp3',
  './audio/duas/dua-59.mp3',
  './audio/duas/dua-60.mp3'
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

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SYNC_PRAYER_REMINDERS') {
    prayerReminderState = {
      generatedAt: data.generatedAt || Date.now(),
      timezoneOffsetMinutes: data.timezoneOffsetMinutes,
      reminders: Array.isArray(data.reminders) ? data.reminders : []
    };
    event.waitUntil(checkDuePrayerReminders(data.reason || 'sync-message'));
  }
  if (data.type === 'FORCE_PRAYER_REMINDER_CHECK') {
    event.waitUntil(checkDuePrayerReminders('forced-message'));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'prayer-reminder-check') {
    event.waitUntil(checkDuePrayerReminders('background-sync'));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'prayer-reminder-check') {
    event.waitUntil(checkDuePrayerReminders('periodic-sync'));
  }
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
