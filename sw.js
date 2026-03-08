const CACHE_NAME = 'falah-v100';
const QURAN_AUDIO_CACHE = 'crown-quran-audio-v1';
const QURAN_AUDIO_RUNTIME_META_CACHE = 'crown-quran-audio-meta-v1';
const QURAN_AUDIO_RUNTIME_META_URL = '/__quran-audio-runtime-meta__';
const QURAN_AUDIO_MAX_BYTES = 200 * 1024 * 1024;
const QURAN_AUDIO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_PAGE = './offline.html';
const PRAYER_REMINDER_STATE_CACHE = 'falah-prayer-reminder-state-v1';
const PRAYER_REMINDER_STATE_URL = '/__prayer-reminder-state__';
const PRAYER_REMINDER_DUE_WINDOW_MS = 2 * 60 * 1000;
const PRAYER_REMINDER_GRACE_MS = 3 * 60 * 60 * 1000;
const NETWORK_FETCH_TIMEOUT_MS = 12000;

let prayerReminderState = {
  generatedAt: 0,
  timezoneOffsetMinutes: null,
  reminders: []
};
const firedReminderMap = new Map();

async function fetchWithTimeout(request, options = {}, timeoutMs = NETWORK_FETCH_TIMEOUT_MS) {
  const timeout = Math.max(1000, Number(timeoutMs) || NETWORK_FETCH_TIMEOUT_MS);
  if (typeof AbortController === 'undefined') {
    return fetch(request, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(request, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readQuranAudioRuntimeMeta() {
  const cache = await caches.open(QURAN_AUDIO_RUNTIME_META_CACHE);
  const response = await cache.match(QURAN_AUDIO_RUNTIME_META_URL);
  if (!response) return { entries: {} };

  try {
    const data = await response.json();
    return {
      entries: data && typeof data.entries === 'object' && data.entries ? data.entries : {}
    };
  } catch (_) {
    return { entries: {} };
  }
}

async function writeQuranAudioRuntimeMeta(meta) {
  const cache = await caches.open(QURAN_AUDIO_RUNTIME_META_CACHE);
  const response = new Response(JSON.stringify(meta || { entries: {} }), {
    headers: { 'Content-Type': 'application/json' }
  });
  await cache.put(QURAN_AUDIO_RUNTIME_META_URL, response);
}

async function responseSizeBytes(response) {
  const rawLength = response.headers && response.headers.get ? response.headers.get('content-length') : null;
  const parsedLength = Number(rawLength);
  if (Number.isFinite(parsedLength) && parsedLength > 0) return parsedLength;
  const blob = await response.clone().blob();
  return Number(blob.size) || 0;
}

function isPashtoRuntimeAudioRequest(requestUrl) {
  return requestUrl.pathname.includes('/audio/quran-pashto-soundcloud-normalized/') && /\.mp3$/i.test(requestUrl.pathname);
}

async function enforceQuranAudioRuntimeLimits(audioCache, meta) {
  const now = Date.now();
  const entries = (meta && meta.entries) || {};

  Object.keys(entries).forEach((key) => {
    const entry = entries[key];
    if (!entry || typeof entry.cachedAt !== 'number') {
      delete entries[key];
      return;
    }
    if (now - entry.cachedAt > QURAN_AUDIO_MAX_AGE_MS) {
      delete entries[key];
      audioCache.delete(key).catch(() => {});
    }
  });

  let totalBytes = Object.values(entries).reduce((sum, item) => sum + (Number(item?.size) || 0), 0);
  if (totalBytes <= QURAN_AUDIO_MAX_BYTES) {
    meta.entries = entries;
    return;
  }

  const sorted = Object.entries(entries)
    .sort((a, b) => {
      const timeA = Number(a[1]?.cachedAt) || 0;
      const timeB = Number(b[1]?.cachedAt) || 0;
      return timeA - timeB;
    });

  for (const [url, item] of sorted) {
    if (totalBytes <= QURAN_AUDIO_MAX_BYTES) break;
    totalBytes -= Number(item?.size) || 0;
    delete entries[url];
    await audioCache.delete(url).catch(() => {});
  }

  meta.entries = entries;
}

async function putPashtoRuntimeAudio(eventRequest, response, audioCache) {
  const meta = await readQuranAudioRuntimeMeta();
  const requestUrl = new URL(eventRequest.url);
  const normalizedUrl = requestUrl.origin + requestUrl.pathname;
  const size = await responseSizeBytes(response);

  meta.entries[normalizedUrl] = {
    size: Number(size) || 0,
    cachedAt: Date.now()
  };

  await audioCache.put(eventRequest, response);
  await enforceQuranAudioRuntimeLimits(audioCache, meta);
  await writeQuranAudioRuntimeMeta(meta);
}

async function touchPashtoRuntimeAudio(eventRequest) {
  const meta = await readQuranAudioRuntimeMeta();
  const requestUrl = new URL(eventRequest.url);
  const normalizedUrl = requestUrl.origin + requestUrl.pathname;
  const entry = meta.entries[normalizedUrl];
  if (!entry) return;
  entry.cachedAt = Date.now();
  await writeQuranAudioRuntimeMeta(meta);
}

async function persistPrayerReminderState() {
  const cache = await caches.open(PRAYER_REMINDER_STATE_CACHE);
  const response = new Response(JSON.stringify(prayerReminderState), {
    headers: { 'Content-Type': 'application/json' }
  });
  await cache.put(PRAYER_REMINDER_STATE_URL, response);
}

async function restorePrayerReminderState() {
  const cache = await caches.open(PRAYER_REMINDER_STATE_CACHE);
  const response = await cache.match(PRAYER_REMINDER_STATE_URL);
  if (!response) return prayerReminderState;

  try {
    const data = await response.json();
    prayerReminderState = {
      generatedAt: Number(data?.generatedAt) || 0,
      timezoneOffsetMinutes: typeof data?.timezoneOffsetMinutes === 'number' ? data.timezoneOffsetMinutes : null,
      reminders: Array.isArray(data?.reminders) ? data.reminders : []
    };
  } catch (_) {}

  return prayerReminderState;
}

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
  if (!Array.isArray(prayerReminderState.reminders) || !prayerReminderState.reminders.length) {
    await restorePrayerReminderState();
  }

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
      requireInteraction: true,
      vibrate: [200, 100, 200],
      silent: false,
      data: {
        prayer: entry.prayerName,
        triggerAt: entry.triggerAt,
        reason,
        url: '/'
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
  './pashto-translation-player.js',
  './audio/pashto_local_mapping.json',
  './audio/pashto_audit/pashto_soundcloud_mapping_114.json',
  './audio/pashto_audit/pashto_archive_mapping_114.json',
  './audio/pashto_audit/pashto_archive_mapping_juz30.json',
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
        keys.filter(k => k !== CACHE_NAME && k !== PRAYER_REMINDER_STATE_CACHE && k !== QURAN_AUDIO_RUNTIME_META_CACHE).map(k => caches.delete(k))
      );
    }).then(async () => {
      await restorePrayerReminderState();
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
    event.waitUntil((async () => {
      await persistPrayerReminderState();
      await checkDuePrayerReminders(data.reason || 'sync-message');
    })());
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
        const shouldUseRuntimeLimit = isPashtoRuntimeAudioRequest(requestUrl);

        const cachedAudio = await audioCache.match(event.request, { ignoreSearch: true });
        if (cachedAudio) {
          if (shouldUseRuntimeLimit) {
            touchPashtoRuntimeAudio(event.request).catch(() => {});
          }
          return cachedAudio;
        }

        const cachedApp = await appCache.match(event.request, { ignoreSearch: true });
        if (cachedApp) return cachedApp;

        try {
          const response = await fetchWithTimeout(event.request);
          if (response && response.ok) {
            const forAudio = response.clone();
            if (shouldUseRuntimeLimit) {
              await putPashtoRuntimeAudio(event.request, forAudio, audioCache);
            } else {
              audioCache.put(event.request, forAudio).catch(() => {});
            }
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
      fetchWithTimeout(event.request)
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
    fetchWithTimeout(event.request)
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
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        const matched = clientList.find((client) => {
            try {
              return new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname;
            } catch (_) {
              return false;
            }
        }) || clientList[0];
        return matched.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
