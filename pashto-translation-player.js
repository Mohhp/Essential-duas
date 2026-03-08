(function () {
  const DEFAULT_MAPPING_URLS = [
    "/audio/pashto_local_mapping.json",
    "/audio/pashto_audit/pashto_soundcloud_mapping_114.json",
    "/audio/pashto_audit/pashto_archive_mapping_114.json",
    "/audio/pashto_audit/pashto_archive_mapping_juz30.json",
  ];
  const LOAD_TIMEOUT_MS = 20000;
  const APP_BASE_PATH = (function () {
    try {
      const currentScript = document.currentScript;
      if (currentScript && currentScript.src) {
        const scriptUrl = new URL(currentScript.src, window.location.href);
        return scriptUrl.pathname.replace(/\/[^/]*$/, "");
      }
    } catch (error) {}

    const path = String(window.location.pathname || "/");
    if (path === "/") return "";
    return path.replace(/\/[^/]*$/, "");
  })();

  let mappingUrl = DEFAULT_MAPPING_URLS[0];
  const mappingPromiseByUrl = new Map();
  let pashtoAudioBaseUrl = "";
  let playerAudio = null;
  let preloadAudio = null;
  let activePlay = null;
  let recoveryTimer = null;

  function clearRecoveryTimer() {
    if (recoveryTimer) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  }

  function resolveAppUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^(https?:|blob:|data:)/i.test(raw)) return raw;

    const origin = String(window.location.origin || "").replace(/\/+$/, "");
    const base = String(APP_BASE_PATH || "").replace(/\/+$/, "");

    if (raw.startsWith("/")) {
      return origin + base + raw;
    }

    return origin + base + "/" + raw.replace(/^\/+/, "");
  }

  function normalizeAudioUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
    if (!pashtoAudioBaseUrl) return resolveAppUrl(raw);

    const base = pashtoAudioBaseUrl.replace(/\/+$/, "");
    const rel = raw.replace(/^\/+/, "");
    return base + "/" + rel;
  }

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
      const resolvedUrl = resolveAppUrl(url);
      const res = await fetch(resolvedUrl, { cache: "no-cache" });
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
        const url = row && row.pashto_audio_url ? normalizeAudioUrl(row.pashto_audio_url) : "";
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

  function normalizeSegmentOptions(options) {
    const startRatio = Number(options && options.startRatio);
    const endRatio = Number(options && options.endRatio);
    const startTime = Number(options && options.startTime);
    const endTime = Number(options && options.endTime);

    return {
      startRatio: Number.isFinite(startRatio) ? Math.max(0, Math.min(1, startRatio)) : null,
      endRatio: Number.isFinite(endRatio) ? Math.max(0, Math.min(1, endRatio)) : null,
      startTime: Number.isFinite(startTime) ? Math.max(0, startTime) : null,
      endTime: Number.isFinite(endTime) ? Math.max(0, endTime) : null,
    };
  }

  function ensurePlayerAudio() {
    if (!playerAudio) {
      playerAudio = new Audio();
      playerAudio.preload = "auto";
      playerAudio.setAttribute("playsinline", "");
      playerAudio.setAttribute("webkit-playsinline", "");
    }
    return playerAudio;
  }

  function ensurePreloadAudio() {
    if (!preloadAudio) {
      preloadAudio = new Audio();
      preloadAudio.preload = "auto";
      preloadAudio.muted = true;
      preloadAudio.setAttribute("playsinline", "");
      preloadAudio.setAttribute("webkit-playsinline", "");
    }
    return preloadAudio;
  }

  function stopPashtoTranslation() {
    if (!playerAudio) return;
    clearRecoveryTimer();
    playerAudio.pause();
    playerAudio.currentTime = 0;
    playerAudio.src = "";
    if (activePlay && typeof activePlay.reject === "function") {
      activePlay.reject(new Error("Playback stopped"));
      activePlay = null;
    }
    emitState("stopped", {});
  }

  function pausePashtoTranslation() {
    if (!playerAudio) return;
    clearRecoveryTimer();
    playerAudio.pause();
    emitState("paused", {});
  }

  async function resumePashtoTranslation() {
    if (!playerAudio) return;
    clearRecoveryTimer();
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
        emitState("preloaded", { surahNumber: Number(surahNumber), url: url, preload: true });
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
      emitState("preloading", { surahNumber: Number(surahNumber), url: url, preload: true });
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

    function onTimeUpdate() {
      if (
        typeof window.syncContinuousSurahAyahFromProgress === "function" &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        window.syncContinuousSurahAyahFromProgress(audio.currentTime, audio.duration, surah);
      }
    }

    const playOnce = function (url) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        let loadTimerId = null;
        const timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanup();
          emitState("error", { surahNumber: surah, url: url, error: "load-timeout" });
          reject(new Error("Audio load timeout for surah " + surah));
        }, LOAD_TIMEOUT_MS);

        function cleanup() {
          clearRecoveryTimer();
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("playing", onPlaying);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("waiting", onWaiting);
          audio.removeEventListener("stalled", onWaiting);
          audio.removeEventListener("timeupdate", onTimeUpdate);
          window.clearTimeout(timeoutId);
          if (loadTimerId) {
            window.clearTimeout(loadTimerId);
            loadTimerId = null;
          }
        }

        function clearLoadTimeout() {
          window.clearTimeout(timeoutId);
        }

        function onCanPlay() {
          clearLoadTimeout();
          emitState("ready", { surahNumber: surah, url: url });
        }

        function onPlaying() {
          clearLoadTimeout();
          emitState("playing", { surahNumber: surah, url: url });
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

        function onWaiting() {
          emitState("buffering", { surahNumber: surah, url: url });
          clearRecoveryTimer();
          recoveryTimer = window.setTimeout(function () {
            recoveryTimer = null;
            if (settled || audio.ended) return;
            audio.play().catch(function () {});
          }, 4000);
        }

        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onError, { once: true });
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("stalled", onWaiting);
        audio.addEventListener("timeupdate", onTimeUpdate);

        if ((audio.currentSrc || audio.src || "") !== url || audio.readyState < 3) {
          audio.src = url;
          audio.load();
          emitState("buffering", { surahNumber: surah, url: url });
        }

        audio.currentTime = 0;

        audio
          .play()
          .then(function () {
            clearLoadTimeout();
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

  async function playPashtoTranslationSegment(surahNumber, options) {
    const surah = Number(surahNumber);
    if (!Number.isFinite(surah)) {
      throw new Error("Invalid surah number");
    }

    const segment = normalizeSegmentOptions(options);
    const urls = await getPashtoTranslationUrls(surah);
    const audio = ensurePlayerAudio();

    if (activePlay) {
      stopPashtoTranslation();
    }

    const playOnce = function (url) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        let segmentEndTime = null;
        const timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanup();
          emitState("error", { surahNumber: surah, url: url, error: "load-timeout", segment: true });
          reject(new Error("Audio load timeout for surah segment " + surah));
        }, LOAD_TIMEOUT_MS);

        function cleanup() {
          clearRecoveryTimer();
          audio.removeEventListener("loadedmetadata", onReady);
          audio.removeEventListener("canplay", onReady);
          audio.removeEventListener("playing", onPlaying);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("waiting", onWaiting);
          audio.removeEventListener("stalled", onWaiting);
          audio.removeEventListener("timeupdate", onTimeUpdate);
          window.clearTimeout(timeoutId);
        }

        function finish(ok, error) {
          if (settled) return;
          settled = true;
          cleanup();
          activePlay = null;
          if (ok) {
            emitState("ended", { surahNumber: surah, url: url, segment: true });
            resolve();
          } else {
            emitState("error", { surahNumber: surah, url: url, error: error || "media-error", segment: true });
            reject(new Error(error || ("Audio playback failed for surah segment " + surah)));
          }
        }

        function onReady() {
          window.clearTimeout(timeoutId);
          const duration = Number(audio.duration) || 0;
          if (!duration) {
            finish(false, "missing-duration");
            return;
          }

          const resolvedStartTime = segment.startTime != null
            ? segment.startTime
            : ((segment.startRatio || 0) * duration);
          const resolvedEndTime = segment.endTime != null
            ? segment.endTime
            : (segment.endRatio != null ? segment.endRatio * duration : duration);

          if (!Number.isFinite(resolvedEndTime) || resolvedEndTime <= resolvedStartTime) {
            finish(false, "invalid-segment-window");
            return;
          }

          segmentEndTime = Math.min(duration, resolvedEndTime);

          try {
            audio.currentTime = Math.max(0, Math.min(duration, resolvedStartTime));
          } catch (error) {}

          emitState("ready", {
            surahNumber: surah,
            url: url,
            segment: true,
            startTime: audio.currentTime,
            endTime: segmentEndTime,
          });
        }

        function onPlaying() {
          window.clearTimeout(timeoutId);
          emitState("playing", {
            surahNumber: surah,
            url: url,
            segment: true,
            startTime: audio.currentTime,
            endTime: segmentEndTime,
          });
        }

        function onEnded() {
          finish(true);
        }

        function onError() {
          finish(false, "media-error");
        }

        function onWaiting() {
          emitState("buffering", { surahNumber: surah, url: url, segment: true });
          clearRecoveryTimer();
          recoveryTimer = window.setTimeout(function () {
            recoveryTimer = null;
            if (settled || audio.ended) return;
            audio.play().catch(function () {});
          }, 4000);
        }

        function onTimeUpdate() {
          if (!Number.isFinite(segmentEndTime) || segmentEndTime == null) return;
          if (audio.currentTime + 0.05 < segmentEndTime) return;
          audio.pause();
          finish(true);
        }

        audio.addEventListener("loadedmetadata", onReady, { once: true });
        audio.addEventListener("canplay", onReady, { once: true });
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onError, { once: true });
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("stalled", onWaiting);
        audio.addEventListener("timeupdate", onTimeUpdate);

        if ((audio.currentSrc || audio.src || "") !== url || audio.readyState < 1) {
          audio.src = url;
          audio.load();
          emitState("buffering", { surahNumber: surah, url: url, segment: true });
        } else {
          onReady();
        }

        audio
          .play()
          .then(function () {
            window.clearTimeout(timeoutId);
            emitState("playing", { surahNumber: surah, url: url, segment: true });
          })
          .catch(function (err) {
            if (settled) return;
            finish(false, String(err && err.message));
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
            segment: true,
          });
        }
      }
    }

    throw lastError || new Error("Audio playback failed for surah segment " + surah);
  }

  window.setPashtoMappingUrl = function (url) {
    mappingUrl = String(url || DEFAULT_MAPPING_URLS[0]);
    mappingPromiseByUrl.clear();
  };

  window.setPashtoAudioBaseUrl = function (url) {
    pashtoAudioBaseUrl = String(url || "").trim();
    mappingPromiseByUrl.clear();
  };

  window.getPashtoTranslationUrl = getPashtoTranslationUrl;
  window.getPashtoTranslationUrls = getPashtoTranslationUrls;
  window.preloadPashtoTranslation = preloadPashtoTranslation;
  window.playPashtoTranslation = playPashtoTranslation;
  window.playPashtoTranslationSegment = playPashtoTranslationSegment;
  window.pausePashtoTranslation = pausePashtoTranslation;
  window.resumePashtoTranslation = resumePashtoTranslation;
  window.stopPashtoTranslation = stopPashtoTranslation;
})();
