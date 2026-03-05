(function () {
  const DEFAULT_MAPPING_URLS = [
    "/audio/pashto_audit/pashto_soundcloud_mapping_114.json",
    "/audio/pashto_audit/pashto_archive_mapping_114.json",
    "/audio/pashto_audit/pashto_archive_mapping_juz30.json",
  ];
  const LOAD_TIMEOUT_MS = 20000;

  let mappingUrl = DEFAULT_MAPPING_URLS[0];
  const mappingPromiseByUrl = new Map();
  let playerAudio = null;
  let preloadAudio = null;
  let activePlay = null;

  function emitState(state, detail) {
    window.dispatchEvent(
      new CustomEvent("pashto-translation-state", {
        detail: Object.assign({ state: state }, detail || {}),
      })
    );
  }

  function normalizeRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.rows)) return payload.rows;
    return [];
  }

  function mappingCandidates() {
    return [mappingUrl].concat(
      DEFAULT_MAPPING_URLS.filter(function (url) {
        return url !== mappingUrl;
      })
    );
  }

  async function loadMappingByUrl(url) {
    if (mappingPromiseByUrl.has(url)) {
      return mappingPromiseByUrl.get(url);
    }

    const p = (async function () {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const payload = await res.json();
      const rows = normalizeRows(payload);
      if (!rows.length) throw new Error("No rows in mapping " + url);
      const bySurah = new Map();
      rows.forEach(function (row) {
        bySurah.set(Number(row.surah), row);
      });
      return bySurah;
    })();

    mappingPromiseByUrl.set(url, p);
    return p;
  }

  async function getPashtoTranslationUrls(surahNumber) {
    const surah = Number(surahNumber);
    const urls = [];
    const seen = new Set();

    for (const candidate of mappingCandidates()) {
      try {
        const map = await loadMappingByUrl(candidate);
        const row = map.get(surah);
        const url = row && row.pashto_audio_url ? String(row.pashto_audio_url) : "";
        if (url && !seen.has(url)) {
          seen.add(url);
          urls.push(url);
          // Keep track of the latest working mapping file for future priority.
          mappingUrl = candidate;
        }
      } catch (error) {
        // try next mapping source
      }
    }

    if (!urls.length) {
      throw new Error("No Pashto translation URL for surah " + surahNumber);
    }
    return urls;
  }

  async function getPashtoTranslationUrl(surahNumber) {
    const urls = await getPashtoTranslationUrls(surahNumber);
    return urls[0];
  }

  function ensurePlayerAudio() {
    if (!playerAudio) {
      playerAudio = new Audio();
      playerAudio.preload = "auto";
    }
    return playerAudio;
  }

  function ensurePreloadAudio() {
    if (!preloadAudio) {
      preloadAudio = new Audio();
      preloadAudio.preload = "auto";
      preloadAudio.muted = true;
    }
    return preloadAudio;
  }

  function stopPashtoTranslation() {
    if (!playerAudio) return;
    playerAudio.pause();
    playerAudio.currentTime = 0;
    if (activePlay && typeof activePlay.reject === "function") {
      activePlay.reject(new Error("Playback stopped"));
      activePlay = null;
    }
    emitState("stopped", {});
  }

  function pausePashtoTranslation() {
    if (!playerAudio) return;
    playerAudio.pause();
    emitState("paused", {});
  }

  async function resumePashtoTranslation() {
    if (!playerAudio) return;
    await playerAudio.play();
    emitState("playing", {});
  }

  async function preloadPashtoTranslation(surahNumber) {
    const url = await getPashtoTranslationUrl(surahNumber);
    const audio = ensurePreloadAudio();

    return new Promise(function (resolve, reject) {
      let done = false;
      const timeoutId = window.setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("Preload timeout for surah " + surahNumber));
      }, LOAD_TIMEOUT_MS);

      function cleanup() {
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("error", onError);
        window.clearTimeout(timeoutId);
      }

      function onReady() {
        if (done) return;
        done = true;
        cleanup();
        emitState("preloaded", { surahNumber: Number(surahNumber), url: url });
        resolve(url);
      }

      function onError() {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("Failed to preload surah " + surahNumber));
      }

      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = url;
      audio.load();
      emitState("preloading", { surahNumber: Number(surahNumber), url: url });
    });
  }

  async function playPashtoTranslation(surahNumber) {
    const surah = Number(surahNumber);
    if (!Number.isFinite(surah)) {
      throw new Error("Invalid surah number");
    }

    const urls = await getPashtoTranslationUrls(surah);
    const audio = ensurePlayerAudio();

    if (activePlay) {
      stopPashtoTranslation();
    }

    const playOnce = function (url) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        const timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanup();
          emitState("error", { surahNumber: surah, url: url, error: "load-timeout" });
          reject(new Error("Audio load timeout for surah " + surah));
        }, LOAD_TIMEOUT_MS);

        function cleanup() {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          window.clearTimeout(timeoutId);
        }

        function onCanPlay() {
          emitState("ready", { surahNumber: surah, url: url });
        }

        function onEnded() {
          if (settled) return;
          settled = true;
          cleanup();
          activePlay = null;
          emitState("ended", { surahNumber: surah, url: url });
          resolve();
        }

        function onError() {
          if (settled) return;
          settled = true;
          cleanup();
          activePlay = null;
          emitState("error", { surahNumber: surah, url: url, error: "media-error" });
          reject(new Error("Audio playback failed for surah " + surah));
        }

        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onError, { once: true });

        audio.src = url;
        audio.load();
        emitState("buffering", { surahNumber: surah, url: url });

        audio
          .play()
          .then(function () {
            emitState("playing", { surahNumber: surah, url: url });
          })
          .catch(function (err) {
            if (settled) return;
            settled = true;
            cleanup();
            activePlay = null;
            emitState("error", { surahNumber: surah, url: url, error: String(err && err.message) });
            reject(err);
          });

        activePlay = { reject: reject };
      });
    };

    let lastError = null;
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      try {
        await playOnce(url);
        return;
      } catch (err) {
        lastError = err;
        if (i < urls.length - 1) {
          emitState("fallback", {
            surahNumber: surah,
            failedUrl: url,
            nextUrl: urls[i + 1],
          });
        }
      }
    }

    throw lastError || new Error("Audio playback failed for surah " + surah);
  }

  window.setPashtoMappingUrl = function (url) {
    mappingUrl = String(url || DEFAULT_MAPPING_URLS[0]);
    mappingPromiseByUrl.clear();
  };

  window.getPashtoTranslationUrl = getPashtoTranslationUrl;
  window.preloadPashtoTranslation = preloadPashtoTranslation;
  window.playPashtoTranslation = playPashtoTranslation;
  window.pausePashtoTranslation = pausePashtoTranslation;
  window.resumePashtoTranslation = resumePashtoTranslation;
  window.stopPashtoTranslation = stopPashtoTranslation;
})();
