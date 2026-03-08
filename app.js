    // ===== STATE MANAGEMENT =====
    const STATE = {
        bookmarks: JSON.parse(localStorage.getItem('crown_bookmarks')) || [],
        read: JSON.parse(localStorage.getItem('crown_read')) || [],
        streak: parseInt(localStorage.getItem('crown_streak')) || 0,
        lastVisit: localStorage.getItem('crown_last_visit') || null,
        fontSize: (() => {
            const raw = parseFloat(localStorage.getItem('fontSize') || localStorage.getItem('crown_font_size'));
            if (!Number.isFinite(raw)) return 16;
            if (raw > 3) return raw;
            return Math.round(raw * 16);
        })()
    };
    const QURAN_STREAK_KEY = 'crown_quran_streak';
    const QURAN_STREAK_LAST_DAY_KEY = 'crown_quran_streak_last_day';
    const CURRENT_APP_VERSION = 1;
    const VERSION_CHECK_CONFIG_URL = 'version.json';
    const DEFAULT_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.github.mohhp.essentialduas';
    const APP_UPDATE_DIALOG_ID = 'appUpdateOverlay';

    function getPreferredLang() {
        if (typeof getCurrentLang === 'function') return getCurrentLang();
        return localStorage.getItem('crown_lang') || 'ps';
    }

    function isPashtoMode() {
        return getPreferredLang() === 'ps';
    }

    const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const WESTERN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let digitLocalizationObserver = null;
    let digitLocalizationBusy = false;
    let digitLocalizationTimer = null;

    function getNumeralMode() {
        const lang = String(getPreferredLang() || '').toLowerCase();
        return (lang === 'ps' || lang === 'ar') ? 'arabic' : 'western';
    }

    function toArabicNumerals(str) {
        return String(str).replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
    }

    function toWesternNumerals(str) {
        return String(str).replace(/[٠-٩]/g, (d) => {
            const idx = ARABIC_INDIC_DIGITS.indexOf(d);
            return idx >= 0 ? WESTERN_DIGITS[idx] : d;
        });
    }

    function normalizeDigitsForCurrentLanguage(value) {
        const raw = String(value ?? '');
        return getNumeralMode() === 'arabic' ? toArabicNumerals(raw) : toWesternNumerals(raw);
    }

    function localizeDigitsInTextNode(node) {
        if (!node || !node.nodeValue) return;
        const parent = node.parentElement;
        if (!parent) return;
        if (parent.closest('script, style, noscript, textarea')) return;
        const normalized = normalizeDigitsForCurrentLanguage(node.nodeValue);
        if (normalized !== node.nodeValue) node.nodeValue = normalized;
    }

    function relocalizeAllVisibleNumbers(root = document.body) {
        if (!root || digitLocalizationBusy) return;
        digitLocalizationBusy = true;
        try {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                localizeDigitsInTextNode(node);
                node = walker.nextNode();
            }
        } finally {
            digitLocalizationBusy = false;
        }
    }

    function scheduleNumberRelocalization() {
        if (digitLocalizationTimer) clearTimeout(digitLocalizationTimer);
        digitLocalizationTimer = setTimeout(() => {
            digitLocalizationTimer = null;
            relocalizeAllVisibleNumbers(document.body);
        }, 0);
    }

    function initGlobalDigitLocalization() {
        if (digitLocalizationObserver || typeof MutationObserver === 'undefined') return;
        digitLocalizationObserver = new MutationObserver((mutations) => {
            if (digitLocalizationBusy) return;
            let shouldRelocalize = false;
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    localizeDigitsInTextNode(mutation.target);
                    continue;
                }
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    shouldRelocalize = true;
                }
            }
            if (shouldRelocalize) scheduleNumberRelocalization();
        });
        digitLocalizationObserver.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true
        });
        scheduleNumberRelocalization();
    }

    function refreshLanguageModeConsistency() {
        refreshHomeDashboard();
        renderDuasBookmarksSection();
        if (typeof refreshEtiquetteLanguage === 'function') refreshEtiquetteLanguage();
        if (typeof refreshRoutineLanguage === 'function') refreshRoutineLanguage();
        if (typeof refreshProgressLanguage === 'function') refreshProgressLanguage();
        if (typeof renderQuranContinueCard === 'function') renderQuranContinueCard();
        if (typeof updateQuranUiLanguage === 'function') updateQuranUiLanguage();
        if (typeof updateTasbeehUI === 'function') updateTasbeehUI();
        if (typeof resetTasbeeh === 'function') {
            const targetLabel = document.getElementById('tasbeehTargetLabel');
            if (targetLabel) targetLabel.textContent = formatTasbeehTargetLabel(tasbeehTarget);
        }
        scheduleNumberRelocalization();
    }

    function toIntegerVersion(value, fallback = 0) {
        const parsed = Number.parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function openAppStoreLink(rawUrl) {
        const url = String(rawUrl || DEFAULT_PLAY_STORE_URL).trim() || DEFAULT_PLAY_STORE_URL;
        const bridge = getAndroidReminderBridge();
        if (bridge && typeof bridge.openStoreUpdate === 'function') {
            try {
                const handled = bridge.openStoreUpdate(url);
                if (handled === true || handled === 'true' || handled === 1 || handled === '1' || handled == null) {
                    return;
                }
            } catch (_) {}
        }
        window.open(url, '_blank', 'noopener');
    }

    function ensureAppUpdateDialog() {
        let overlay = document.getElementById(APP_UPDATE_DIALOG_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = APP_UPDATE_DIALOG_ID;
        overlay.className = 'app-update-overlay';
        overlay.innerHTML = `
            <div class="app-update-card" role="dialog" aria-modal="true" aria-labelledby="appUpdateTitle" aria-describedby="appUpdateMessage">
                <img src="icon-192.png" alt="App icon" class="app-update-icon" width="64" height="64">
                <h2 id="appUpdateTitle" class="app-update-title">Update Available</h2>
                <p id="appUpdateMessage" class="app-update-message"></p>
                <div class="app-update-actions">
                    <button type="button" class="app-update-btn primary" id="appUpdateNowBtn">Update Now</button>
                    <button type="button" class="app-update-btn" id="appUpdateLaterBtn">Later</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        return overlay;
    }

    function showAppUpdateDialog({ force = false, message = '', updateUrl = DEFAULT_PLAY_STORE_URL } = {}) {
        const overlay = ensureAppUpdateDialog();
        const titleEl = document.getElementById('appUpdateTitle');
        const messageEl = document.getElementById('appUpdateMessage');
        const updateBtn = document.getElementById('appUpdateNowBtn');
        const laterBtn = document.getElementById('appUpdateLaterBtn');
        if (!titleEl || !messageEl || !updateBtn || !laterBtn) return;

        titleEl.textContent = force ? 'Update Required' : 'Update Available';
        messageEl.textContent = message || (force
            ? 'This version is no longer supported. Please update to continue.'
            : 'A new version is available with important fixes.');

        if (force) {
            overlay.classList.add('force');
            laterBtn.style.display = 'none';
        } else {
            overlay.classList.remove('force');
            laterBtn.style.display = '';
            laterBtn.onclick = () => {
                overlay.classList.remove('active');
                document.body.classList.remove('app-update-open');
            };
        }

        updateBtn.onclick = () => openAppStoreLink(updateUrl);
        overlay.classList.add('active');
        document.body.classList.add('app-update-open');
    }

    async function checkAppVersionOnStartup() {
        try {
            const response = await fetch(VERSION_CHECK_CONFIG_URL, {
                cache: 'no-store'
            });
            if (!response.ok) return;

            const data = await response.json();
            const latestVersion = toIntegerVersion(data?.latestVersion, CURRENT_APP_VERSION);
            const minRequiredVersion = toIntegerVersion(data?.minRequiredVersion, latestVersion);
            const updateUrl = String(data?.updateUrl || DEFAULT_PLAY_STORE_URL).trim() || DEFAULT_PLAY_STORE_URL;

            if (CURRENT_APP_VERSION < minRequiredVersion) {
                showAppUpdateDialog({
                    force: true,
                    updateUrl,
                    message: data?.forceUpdateMessage
                });
                return;
            }

            if (CURRENT_APP_VERSION < latestVersion) {
                showAppUpdateDialog({
                    force: false,
                    updateUrl,
                    message: data?.updateMessage
                });
            }
        } catch (_) {
            // Graceful fallback: if version metadata cannot be fetched, continue app startup.
        }
    }

    // ===== DOM ELEMENTS =====
    const els = {
        cards: document.querySelectorAll('.dua-card'),
        searchInput: document.getElementById('searchInput'),
        searchClear: document.getElementById('searchClear'),
        noResults: document.getElementById('noResults'),
        pills: document.querySelectorAll('.pill'),
        bookmarkCount: document.getElementById('bookmarkCount'),
        readCount: document.getElementById('readCount'),
        streakCount: document.getElementById('streakCount'),
        lastVisit: document.getElementById('lastVisit'),
        progressBar: document.getElementById('progressFill'),
        toast: document.getElementById('toast'),
        dailyArabic: document.getElementById('dailyArabic'),
        dailyTranslation: document.getElementById('dailyTranslation'),
        nav: document.getElementById('topNav')
    };

    // ===== INITIALIZATION =====
    function init() {
        // Dismiss splash screen
        const splash = document.getElementById('splashScreen');
        if (splash) {
            setTimeout(() => {
                splash.classList.add('hidden');
                setTimeout(() => splash.remove(), 700);
            }, 1500);
        }

        updateStats();
        checkStreak();
        loadDailyDua();
        applyFontSize(STATE.fontSize);
        applyTheme();
        checkAppVersionOnStartup();
        injectShareImageButtons();
        injectAudioButtons();
        renderTimeBanner();
        trackDailyActivity();
        renderBookmarksPanel();
        wrapArabicWords();
        injectDuaBismillahHeaders();
        syncCategoryWatermarks();
        syncHomeTileWatermarks();
        initDailyReminderPrompt();
        initHomeDashboard();
        initDuasTabSearch();
        renderDuasBookmarksSection();
        initFontSizeControls();

        // Apply saved language preference first (defaults to Pashto on first run)
        if (typeof applyLanguage === 'function') applyLanguage();
        if (typeof window.toggleLanguage === 'function' && !window.__wrappedToggleLanguageForDashboard) {
            const originalToggleLanguage = window.toggleLanguage;
            window.toggleLanguage = function(...args) {
                const result = originalToggleLanguage.apply(this, args);
                setTimeout(() => {
                    refreshLanguageModeConsistency();
                }, 0);
                return result;
            };
            window.__wrappedToggleLanguageForDashboard = true;
        }

        initGlobalDigitLocalization();
        scheduleNumberRelocalization();

        showOnboardingIfFirstTime();
        enhanceAccessibility();
        setBottomNavActive('home');
        initBottomNavTouchHandlers();
        initHomePullToRefresh();

        // Legacy search listener (kept for compatibility if input exists)
        if (els.searchInput) {
            els.searchInput.addEventListener('input', (e) => filterDuas(e.target.value));
        }

        // Scroll listener
        const onPrimaryScroll = () => {
            const homePanel = document.getElementById('mainContainer');
            const homeIsActive = !!homePanel?.classList.contains('active');
            const winScroll = homeIsActive
                ? (homePanel.scrollTop || 0)
                : (document.body.scrollTop || document.documentElement.scrollTop || 0);
            const height = homeIsActive
                ? Math.max(1, (homePanel.scrollHeight || 1) - (homePanel.clientHeight || 0))
                : Math.max(1, document.documentElement.scrollHeight - document.documentElement.clientHeight);
            const scrolled = (winScroll / height) * 100;
            if (els.progressBar) els.progressBar.style.width = scrolled + "%";

            const backBtn = document.querySelector('.back-to-top');
            if (backBtn) backBtn.classList.toggle('visible', winScroll > 500);

            if (els.nav) {
                if (winScroll > 50) els.nav.classList.add('scrolled');
                else els.nav.classList.remove('scrolled');
            }

            updateInAppFabVisibility();
        };

        window.addEventListener('scroll', onPrimaryScroll);
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.addEventListener('scroll', onPrimaryScroll, { passive: true });

        // Restore bookmarks UI
        STATE.bookmarks.forEach(id => {
            const btn = document.querySelector(`.dua-card[data-id="${id}"] .bookmark-btn`);
            if (btn) { btn.classList.add('bookmarked'); btn.innerHTML = '★'; }
        });

        // Restore read UI
        STATE.read.forEach(id => {
            const card = document.querySelector(`.dua-card[data-id="${id}"]`);
            if (card) {
                card.classList.add('read-card');
                const readBtn = card.querySelector('.action-btn[onclick*="markRead"]');
                if (readBtn) {
                    readBtn.classList.add('read');
                    readBtn.innerHTML = '✓ Read';
                }
            }
        });

        // Restore collapsed sections
        const collapsedSections = JSON.parse(localStorage.getItem('crown_collapsed_sections') || '[]');
        collapsedSections.forEach(sectionName => {
            const header = document.querySelector(`.section-header[data-section="${sectionName}"]`);
            if (header) {
                header.classList.add('collapsed');
                const hint = header.querySelector('.section-collapse-hint');
                if (hint) hint.textContent = 'tap to expand';

                let nextElement = header.nextElementSibling;
                while (nextElement) {
                    if (nextElement.classList.contains('section-header')) break;
                    if (nextElement.classList.contains('dua-card')) {
                        nextElement.style.display = 'none';
                    }
                    nextElement = nextElement.nextElementSibling;
                }
            }
        });

        // --- Intersection Observer for Card Animations ---
    
        if ('IntersectionObserver' in window) {
            const observerOptions = {
                root: null,
                rootMargin: '0px',
                threshold: 0.05
            };

            const cardObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        cardObserver.unobserve(entry.target);
                    }
                });
            }, observerOptions);

            els.cards.forEach(card => {
                cardObserver.observe(card);
            });
        }

        // --- Keyboard Accessibility ---
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const ap = document.querySelector('.about-panel.active');
                if (ap) { closeAboutPanel(); return; }

                const pp = document.querySelector('.progress-panel.active');
                if (pp) { closeProgress(); return; }

                const tp = document.querySelector('.tasbeeh-panel.active');
                if (tp) { closeTasbeeh(); return; }

                const ep = document.querySelector('.etiquette-panel.active');
                if (ep) { closeEtiquette(); return; }

                const rp = document.querySelector('.routine-panel.active');
                if (rp) { closeRoutine(); return; }

                const prayerp = document.querySelector('.prayer-panel.active');
                if (prayerp) { closePrayer(); return; }

                const qp = document.querySelector('.quran-panel.active');
                if (qp) { closeQuran(); return; }

                const mp = document.getElementById('memorizePanel');
                if (mp && mp.classList.contains('active')) { closeMemorizeSession(); return; }

                const bp = document.getElementById('bookmarksPanel');
                if (bp && bp.classList.contains('active')) { toggleBookmarksPanel(); return; }

                if (els.searchInput && els.searchInput.value) {
                    clearSearch();
                    els.searchInput.blur();
                    return;
                }
            }
        });

        // Keyboard support for card headers and section headers
        document.addEventListener('keydown', function(e) {
            const target = e.target;
            if (target.classList.contains('card-header')) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCard(target);
                }
            }
            if (target.classList.contains('section-header')) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSection(target);
                }
            }
        });

        // Add a11y attributes to section headers
        document.querySelectorAll('.section-header').forEach(header => {
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-expanded', String(!header.classList.contains('collapsed')));
        });

        // Handle hash-based deep links (manifest shortcuts)
        setTimeout(() => {
            const hash = window.location.hash;
            if (hash === '#daily') scrollToDailyDua();
            else if (hash === '#tasbeeh') openTasbeeh();
            else if (hash === '#routine') openRoutine();
            else if (hash === '#prayer') openPrayer();
            else if (hash === '#quran') openQuran();
            window.location.hash = '';
        }, 1600); // After splash screen

        initDuaSwipeViewer();
        initInAppNavigationUX();
        closeAllPanelsForStateApply();
        switchTab('home');
        setBottomNavActive('home');
        backToCategories();
        history.replaceState({ view: IN_APP_VIEWS.HOME }, '');
        inAppCurrentRoute = IN_APP_VIEWS.HOME;
        updateInAppFabVisibility();
    }

    function enhanceAccessibility() {
        document.querySelectorAll('.cat-card').forEach(card => {
            if (!card.hasAttribute('role')) card.setAttribute('role', 'button');
            if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
            if (!card.hasAttribute('aria-label')) {
                const name = card.querySelector('.cat-card-name')?.textContent?.trim() || 'Category';
                const count = card.querySelector('.cat-card-count')?.textContent?.trim() || '';
                card.setAttribute('aria-label', count ? `Open category: ${name}, ${count}` : `Open category: ${name}`);
            }
            if (!card.dataset.a11yBound) {
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        card.click();
                    }
                });
                card.dataset.a11yBound = '1';
            }
        });

        document.querySelectorAll('.lang-toggle').forEach(toggle => {
            if (!toggle.hasAttribute('tabindex')) toggle.setAttribute('tabindex', '0');
            if (!toggle.dataset.a11yBound) {
                toggle.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle.click();
                    }
                });
                toggle.dataset.a11yBound = '1';
            }
        });

        document.querySelectorAll('.fallah-logo').forEach(el => {
            if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            if (!el.hasAttribute('aria-label')) {
                const label = 'Go to Home';
                el.setAttribute('aria-label', label);
            }
            if (!el.dataset.a11yBound) {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        el.click();
                    }
                });
                el.dataset.a11yBound = '1';
            }
        });

        document.querySelectorAll('.card-header').forEach((header, index) => {
            const card = header.closest('.dua-card');
            const title = card?.querySelector('.dua-title')?.textContent?.trim() || `Dua ${index + 1}`;
            const body = card?.querySelector('.card-body');
            if (body && !body.id) body.id = `dua-body-${card?.getAttribute('data-id') || index + 1}`;
            if (body) header.setAttribute('aria-controls', body.id);
            if (!header.hasAttribute('aria-label')) header.setAttribute('aria-label', `Open dua: ${title}`);
        });

        document.querySelectorAll('.bookmark-btn').forEach(btn => {
            const title = btn.closest('.dua-card')?.querySelector('.dua-title')?.textContent?.trim();
            btn.setAttribute('aria-label', title ? `Bookmark dua: ${title}` : 'Bookmark dua');
        });

        document.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('aria-label')) return;
            const txt = (btn.textContent || '').trim();
            const hasReadableText = /[A-Za-z0-9\u0600-\u06FF]/.test(txt);
            if (!hasReadableText) {
                const title = btn.getAttribute('title') || 'Button';
                btn.setAttribute('aria-label', title);
            }
        });

        document.querySelectorAll('.tasbeeh-panel, .etiquette-panel, .routine-panel, .prayer-panel, .quran-panel, .more-panel, .about-panel, .progress-panel, .side-panel').forEach(panel => {
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
        });
    }

    function runTabFadeTransition(target) {
        if (!target) return;
        target.classList.add('tab-fade-target');
        target.classList.add('is-fading');
        setTimeout(() => target.classList.remove('is-fading'), 180);
    }

    function initBottomNavTouchHandlers() {
        document.querySelectorAll('.bottom-nav button').forEach((btn) => {
            if (btn.dataset.fastTouchBound === '1') return;
            btn.addEventListener('touchstart', function(e) {
                e.preventDefault();
                this.click();
            }, { passive: false });
            btn.dataset.fastTouchBound = '1';
        });
    }

    function setPanelLoading(panelKey, isLoading, label = null) {
        const overlayMap = {
            quran: document.getElementById('quranPanelLoading'),
            prayer: document.getElementById('prayerPanelLoading')
        };
        const overlay = overlayMap[panelKey];
        if (!overlay) return;
        if (label) overlay.textContent = label;
        overlay.classList.toggle('visible', !!isLoading);
        overlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
    }

    function initDailyReminderPrompt() {
        const prompt = document.getElementById('dailyReminderPrompt');
        if (!prompt) return;
        const dismissed = localStorage.getItem('crown_daily_dua_prompt_dismissed') === 'true';
        const enabled = localStorage.getItem('crown_notifications') === 'true';
        if (!dismissed && !enabled) prompt.classList.add('visible');
        else prompt.classList.remove('visible');
    }

    window.dismissDailyDuaPrompt = function() {
        localStorage.setItem('crown_daily_dua_prompt_dismissed', 'true');
        const prompt = document.getElementById('dailyReminderPrompt');
        if (prompt) prompt.classList.remove('visible');
    };

    window.enableDailyDuaReminders = function() {
        window.togglePrayerNotifications(true);
        dismissDailyDuaPrompt();
    };

    function showOnboardingIfFirstTime() {
        if (localStorage.getItem('crown_onboarding_done') === 'true') return;

        const isPS = isPashtoMode();

        const slides = isPS
            ? [
                { title: 'ښه راغلاست', body: 'اساسي دعاګانو ته ښه راغلاست — د قرآن او سنتو څخه تایید شوې غوره دعاګانې.' },
                { title: 'مهمې ځانګړنې', body: 'د کټګورۍ له مخې ولټوئ، خوښې خوندي کړئ، پرمختګ تعقیب کړئ، تسبیح وکاروئ، او د قبلې سره د لمانځه وختونه وګورئ.' },
                { title: 'د کارولو طریقه', body: 'کټګوري ټک کړئ، کارت خلاص کړئ، او د لړۍ جوړولو لپاره "لوستل شوی" وکاروئ.' },
                { title: 'پیل وکړئ', body: 'نن یوازې له یوې دعا پیل وکړئ. لږ دوام لوی برکت راولي.' }
            ]
            : [
                { title: 'Welcome', body: 'Welcome to Falah — your curated collection of verified duas from Quran and Sunnah.' },
                { title: 'Key Features', body: 'Browse by category, save favorites, track progress, use Tasbeeh, and view prayer times with Qibla.' },
                { title: 'How to Use', body: 'Tap a category to explore, expand a card to read details, and use Mark Read to build your streak.' },
                { title: 'Get Started', body: 'Begin with one dua today. Small consistency brings lasting barakah over time.' }
            ];

        let index = 0;
        const overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay';
        overlay.id = 'onboardingOverlay';
        let slideDirection = 'next';

        let touchStartX = 0;
        let touchStartY = 0;

        function goNext() {
            if (index >= slides.length - 1) {
                closeOnboarding();
                return;
            }
            slideDirection = 'next';
            index++;
            render();
        }

        function goPrev() {
            if (index <= 0) return;
            slideDirection = 'prev';
            index--;
            render();
        }

        function bindSwipeHandlers() {
            const card = overlay.querySelector('.onboarding-card');
            if (!card) return;

            card.addEventListener('touchstart', function(e) {
                if (!e.touches || !e.touches[0]) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }, { passive: true });

            card.addEventListener('touchend', function(e) {
                if (!e.changedTouches || !e.changedTouches[0]) return;

                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const deltaX = endX - touchStartX;
                const deltaY = endY - touchStartY;
                const absX = Math.abs(deltaX);
                const absY = Math.abs(deltaY);

                if (absX < 40 || absX <= absY * 1.2) return;

                if (deltaX < 0) goNext();
                else goPrev();
            }, { passive: true });
        }

        function closeOnboarding() {
            localStorage.setItem('crown_onboarding_done', 'true');
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            unlockScroll();
        }

        function render() {
            const slide = slides[index];
            const dots = slides.map((_, i) => `<span class="onboarding-dot ${i === index ? 'active' : ''}"></span>`).join('');
            const isLast = index === slides.length - 1;
            const directionClass = slideDirection === 'prev' ? 'slide-in-prev' : 'slide-in-next';
            overlay.innerHTML = `
                <div class="onboarding-card ${directionClass}" role="dialog" aria-modal="true" aria-label="App onboarding">
                    <div class="onboarding-step">${isPS ? 'ګام' : 'Step'} ${index + 1} ${isPS ? 'له' : 'of'} ${slides.length}</div>
                    <div class="onboarding-title">${slide.title}</div>
                    <div class="onboarding-body">${slide.body}</div>
                    <div class="onboarding-dots">${dots}</div>
                    <div class="onboarding-actions">
                        <button class="onboarding-btn" id="onboardingSkip">${isPS ? 'تېرول' : 'Skip'}</button>
                        <button class="onboarding-btn ${isLast ? 'primary' : ''}" id="onboardingNext">${isLast ? (isPS ? 'پیل' : 'Get Started') : (isPS ? 'بل' : 'Next')}</button>
                    </div>
                </div>`;

            const skip = overlay.querySelector('#onboardingSkip');
            const next = overlay.querySelector('#onboardingNext');
            if (skip) skip.onclick = closeOnboarding;
            if (next) {
                next.onclick = function() {
                    if (isLast) closeOnboarding();
                    else goNext();
                };
            }

            bindSwipeHandlers();
        }

        render();
        document.body.appendChild(overlay);
        lockScroll();
        requestAnimationFrame(() => overlay.classList.add('active'));
    }

    // ===== CARD TOGGLE =====
    window.toggleCard = function(header) {
        const card = header?.closest('.dua-card');
        const id = Number(card?.getAttribute('data-id')) || null;
        if (!id) return;
        const activeCategory = localStorage.getItem('crown_active_category') || 'all';
        openDuaViewerAtId(id, activeCategory, { pushHistory: true });
    };

    window.toggleAllCards = function() {
        showToast('Swipe left/right to navigate duas');
    };

    // ===== FONT SIZE =====
    window.adjustFontSize = function(delta) {
        const currentPx = getRootFontSizePx();
        const step = Number(delta) >= 0 ? 1 : -1;
        const nextPx = Math.max(12, Math.min(24, currentPx + step));
        STATE.fontSize = nextPx;
        localStorage.setItem('fontSize', String(nextPx));
        localStorage.setItem('crown_font_size', String(nextPx));
        applyFontSize(nextPx);
    };

    function getRootFontSizePx() {
        const computed = parseFloat(getComputedStyle(document.documentElement).fontSize);
        if (Number.isFinite(computed) && computed > 0) return computed;
        return 16;
    }

    function applyFontSize(sizePx) {
        const normalized = Math.max(12, Math.min(24, Number(sizePx) || 16));
        document.documentElement.style.fontSize = `${normalized}px`;
    }

    // ===== SCROLL LOCK =====
    let scrollPosition = 0;

    function lockScroll() {
        scrollPosition = window.pageYOffset;
        document.body.classList.add('panel-open');
        document.body.style.top = `-${scrollPosition}px`;
    }

    function unlockScroll() {
        document.body.classList.remove('panel-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollPosition);
    }

    // ===== BOTTOM NAV STATE =====
    function setBottomNavActive(navName) {
        document.querySelectorAll('.bottom-nav-item').forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('aria-current');
        });
        const target = document.querySelector(`.bottom-nav-item[data-nav="${navName}"]`);
        if (target) {
            target.classList.add('active');
            target.setAttribute('aria-current', 'page');
        }
    }

    const TAB_LAYER_SELECTORS = {
        home: '#mainContainer',
        duas: '#mainContainer',
        quran: '.quran-panel',
        more: '.more-panel'
    };

    function setMainContainerMode(mode = 'home') {
        const main = document.getElementById('mainContainer');
        if (!main) return;
        const nextMode = mode === 'duas' ? 'duas' : 'home';
        main.setAttribute('data-main-mode', nextMode);
    }

    function resetMainContainerScroll() {
        const main = document.getElementById('mainContainer');
        if (!main) return;
        try {
            main.scrollTo({ top: 0, behavior: 'auto' });
        } catch (_) {
            main.scrollTop = 0;
        }
    }

    function setActiveTabLayer(tabName = 'home') {
        const nextTab = TAB_LAYER_SELECTORS[tabName] ? tabName : 'home';
        const target = document.querySelector(TAB_LAYER_SELECTORS[nextTab]);
        const layers = Object.values(TAB_LAYER_SELECTORS)
            .map((selector) => document.querySelector(selector))
            .filter(Boolean);

        if (target) target.classList.add('active');
        layers.forEach((layer) => {
            if (layer !== target) layer.classList.remove('active');
        });

        if (nextTab === 'duas') setMainContainerMode('duas');
        if (nextTab === 'home') setMainContainerMode('home');
    }

    window.switchTab = function(tabName) {
        const nextTab = TAB_LAYER_SELECTORS[tabName] ? tabName : 'home';
        document.body.setAttribute('data-active-tab', nextTab);
        setActiveTabLayer(nextTab);
        setBottomNavActive(nextTab);
        const target = document.querySelector(TAB_LAYER_SELECTORS[nextTab]);
        runTabFadeTransition(target);
        if (nextTab === 'home' || nextTab === 'duas') {
            requestAnimationFrame(resetMainContainerScroll);
        }
        updateInAppFabVisibility();
    };

    let inAppCurrentRoute = 'home';
    const IN_APP_HISTORY_FLAG = '__essential_duas_in_app';
    let inAppHistorySuppressed = false;

    const IN_APP_VIEWS = {
        HOME: 'home',
        DUAS_TAB: 'duas_tab',
        CATEGORY_VIEW: 'category_view',
        DUA_DETAIL: 'dua_detail',
        QURAN_TAB: 'quran_panel',
        SURAH_READER: 'surah_reader',
        PANEL: 'panel'
    };

    const DUA_SWIPE_STATE = {
        active: false,
        category: 'all',
        ids: [],
        index: 0,
        axisLock: null,
        touchStartX: 0,
        touchStartY: 0,
        dragX: 0,
        isDragging: false,
        transitionLock: false
    };
    let swipeHintTimer = null;
    let duaViewerCloseTimer = null;
    let duaSwipeWheelLockUntil = 0;

    function showDuaSwipeHints(direction = 'both', durationMs = 3000) {
        const viewer = document.getElementById('duaSwipeViewer');
        if (!viewer) return;
        viewer.classList.remove('hint-left', 'hint-right');
        viewer.classList.add('show-swipe-hints');
        if (direction === 'left') viewer.classList.add('hint-left');
        if (direction === 'right') viewer.classList.add('hint-right');
        if (swipeHintTimer) clearTimeout(swipeHintTimer);
        swipeHintTimer = setTimeout(() => {
            viewer.classList.remove('show-swipe-hints', 'hint-left', 'hint-right');
            swipeHintTimer = null;
        }, Math.max(600, durationMs));
    }

    function isDuaSwipeViewerActive() {
        return DUA_SWIPE_STATE.active;
    }

    function getCurrentSwipeDuaId() {
        if (!DUA_SWIPE_STATE.active || !DUA_SWIPE_STATE.ids.length) return null;
        return DUA_SWIPE_STATE.ids[DUA_SWIPE_STATE.index] || null;
    }

    function isCategorySubViewActive() {
        const grid = document.getElementById('categoryGrid');
        return !!grid && grid.classList.contains('hidden-grid');
    }

    function getActivePanelElement() {
        return document.querySelector('.quran-panel.active')
            || document.querySelector('.prayer-panel.active')
            || document.querySelector('.routine-panel.active')
            || document.querySelector('.tasbeeh-panel.active')
            || document.querySelector('.about-panel.active')
            || document.querySelector('.more-panel.active')
            || document.querySelector('.etiquette-panel.active')
            || document.querySelector('.progress-panel.active')
            || document.querySelector('#bookmarksPanel.active');
    }

    function getExpandedDuaCard() {
        if (isDuaSwipeViewerActive()) {
            const currentId = getCurrentSwipeDuaId();
            if (!currentId) return null;
            return document.querySelector(`#duaListSection .dua-card[data-id="${currentId}"]`);
        }
        return document.querySelector('#duaListSection .dua-card.expanded:not(.hidden-card)');
    }

    function getInAppStateFromDom() {
        const quranPanel = document.querySelector('.quran-panel.active');
        const quranReader = document.getElementById('quranReaderScreen');
        if (quranPanel && quranReader?.classList.contains('active')) {
                return {
                    [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.SURAH_READER,
                surah: Number(quranState.currentSurah) || null,
                ayah: Number((quranState.audioAyah || '').split(':')[1]) || null,
                ts: Date.now()
            };
        }

        if (quranPanel) {
                return {
                    [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.QURAN_TAB,
                quranView: quranState.view || 'surah',
                ts: Date.now()
            };
        }

        const panelMap = [
            ['.prayer-panel.active', 'prayer'],
            ['.routine-panel.active', 'routine'],
            ['.tasbeeh-panel.active', 'tasbeeh'],
            ['.etiquette-panel.active', 'etiquette'],
            ['.progress-panel.active', 'progress'],
            ['#bookmarksPanel.active', 'bookmarks'],
            ['.about-panel.active', 'about'],
            ['.more-panel.active', 'more']
        ];

        for (const [selector, panelName] of panelMap) {
                if (document.querySelector(selector)) {
                    return {
                        [IN_APP_HISTORY_FLAG]: true,
                    view: IN_APP_VIEWS.PANEL,
                    panel: panelName,
                    ts: Date.now()
                };
            }
        }

        const mainMode = document.getElementById('mainContainer')?.getAttribute('data-main-mode') || 'home';
        if (mainMode === 'duas' && !isCategorySubViewActive()) {
            return {
                [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.DUAS_TAB,
                category: localStorage.getItem('crown_active_category') || 'all',
                ts: Date.now()
            };
        }

        if (isCategorySubViewActive()) {
            const expanded = getExpandedDuaCard();
            if (expanded) {
                return {
                    [IN_APP_HISTORY_FLAG]: true,
                    view: IN_APP_VIEWS.DUA_DETAIL,
                    category: localStorage.getItem('crown_active_category') || 'all',
                    duaId: Number(expanded.getAttribute('data-id')) || null,
                    ts: Date.now()
                };
            }

            return {
                [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.CATEGORY_VIEW,
                category: localStorage.getItem('crown_active_category') || 'all',
                ts: Date.now()
            };
        }

        return {
                [IN_APP_HISTORY_FLAG]: true,
            view: IN_APP_VIEWS.HOME,
            ts: Date.now()
        };
    }

    function getInAppRoute() {
        const state = getInAppStateFromDom();
        return state.view || IN_APP_VIEWS.HOME;
    }

    function sameInAppState(a, b) {
        if (!a || !b) return false;
        return a.view === b.view
            && a.panel === b.panel
            && a.category === b.category
            && a.duaId === b.duaId
            && a.surah === b.surah
            && a.quranView === b.quranView;
    }

    function getActiveScrollableElement() {
        if (isDuaSwipeViewerActive()) {
            return document.querySelector('.dua-swipe-slide.slot-current .dua-swipe-content') || window;
        }
        if (document.querySelector('.quran-panel.active')) {
            return document.querySelector('.quran-panel');
        }
        if (document.querySelector('.prayer-panel.active')) {
            return document.querySelector('.prayer-panel');
        }
        if (document.querySelector('.routine-panel.active')) {
            return document.querySelector('.routine-panel');
        }
        if (document.querySelector('.tasbeeh-panel.active')) {
            return document.querySelector('.tasbeeh-panel');
        }
        if (document.querySelector('.etiquette-panel.active')) {
            return document.querySelector('.etiquette-panel');
        }
        if (document.querySelector('.progress-panel.active')) {
            return document.querySelector('.progress-panel');
        }
        if (document.querySelector('.about-panel.active')) {
            return document.querySelector('.about-panel');
        }
        if (document.querySelector('.more-panel.active')) {
            return document.querySelector('.more-panel');
        }
        return document.scrollingElement || document.documentElement || document.body || window;
    }

    function shouldShowBackFab(route, state = null) {
        const effectiveState = state || getInAppStateFromDom();
        if (!route || route === IN_APP_VIEWS.HOME || route === IN_APP_VIEWS.DUAS_TAB || route === IN_APP_VIEWS.QURAN_TAB) return false;
        if (route === IN_APP_VIEWS.PANEL) {
            const panelName = effectiveState?.panel;
            return panelName === 'prayer'
                || panelName === 'routine'
                || panelName === 'tasbeeh'
                || panelName === 'about'
                || panelName === 'etiquette'
                || panelName === 'progress'
                || panelName === 'bookmarks';
        }
        return true;
    }

    function updateInAppFabVisibility() {
        const backBtn = document.getElementById('inAppBackBtn');
        const route = getInAppRoute();
        if (backBtn) backBtn.classList.toggle('visible', shouldShowBackFab(route));
    }

    function recordInAppRoute(push = false, forcedState = null) {
        if (inAppHistorySuppressed) {
            updateInAppFabVisibility();
            return;
        }

        const state = forcedState || getInAppStateFromDom();
        const current = history.state;

        if (!current || !current.view) {
            history.replaceState(state, '');
            console.log('[History] replaceState', state);
            inAppCurrentRoute = state.view || IN_APP_VIEWS.HOME;
            updateInAppFabVisibility();
            return;
        }

        if (push && !sameInAppState(state, current)) {
            history.pushState(state, '');
            console.log('[History] pushState', state);
        } else {
            history.replaceState(state, '');
            console.log('[History] replaceState', state);
        }

        inAppCurrentRoute = state.view || IN_APP_VIEWS.HOME;
        updateInAppFabVisibility();
    }

    function scrollActiveViewToTop() {
        const scroller = getActiveScrollableElement();
        if (scroller === window) window.scrollTo({ top: 0, behavior: 'smooth' });
        else scroller.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function closeAllPanelsForStateApply() {
        if (isDuaSwipeViewerActive()) closeDuaSwipeViewer({ skipRoute: true });

        closeQuranReader({ skipHistory: true });
        setPanelLoading('quran', false);
        setPanelLoading('prayer', false);

        document.querySelectorAll('.quran-panel, .prayer-panel, .routine-panel, .tasbeeh-panel, .etiquette-panel, .more-panel, .about-panel, .progress-panel').forEach((panel) => {
            panel.classList.remove('active');
        });

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        clearQuranAudioDotHoldTimer();
        closeQuranAudioPopup();
        updateQuranMiniPlayerVisibility();
        document.body.classList.remove('quran-reading-mode');
        unlockScroll();

        const bookmarksPanel = document.getElementById('bookmarksPanel');
        if (bookmarksPanel?.classList.contains('active')) toggleBookmarksPanel();
    }

    function collapseExpandedDuaCards() {
        if (isDuaSwipeViewerActive()) closeDuaSwipeViewer({ skipRoute: true });
        document.querySelectorAll('#duaListSection .dua-card.expanded').forEach((card) => {
            card.classList.remove('expanded');
            const header = card.querySelector('.card-header');
            if (header) header.setAttribute('aria-expanded', 'false');
        });
    }

    async function applyInAppState(state) {
        if (!state || !state.view) return;

        inAppHistorySuppressed = true;
        try {
            const view = state.view || IN_APP_VIEWS.HOME;

            closeAllPanelsForStateApply();

            if (view === IN_APP_VIEWS.HOME) {
                if (isCategorySubViewActive()) backToCategories();
                collapseExpandedDuaCards();
            } else if (view === IN_APP_VIEWS.DUAS_TAB) {
                switchTab('duas');
                backToCategories();
                collapseExpandedDuaCards();
            } else if (view === IN_APP_VIEWS.CATEGORY_VIEW) {
                openCategory(state.category || 'all', { skipScroll: true });
                collapseExpandedDuaCards();
            } else if (view === IN_APP_VIEWS.DUA_DETAIL) {
                const category = state.category || 'all';
                openCategory(category, { skipScroll: true, skipHistory: true, startId: state.duaId || null });
            } else if (view === IN_APP_VIEWS.QURAN_TAB) {
                await openQuran();
                closeQuranReader({ skipHistory: true });
                setQuranView('surah');
            } else if (view === IN_APP_VIEWS.SURAH_READER) {
                await openQuran();
                await openQuranSurah(Number(state.surah) || 1, Number(state.ayah) || 1);
            } else if (view === IN_APP_VIEWS.PANEL) {
                const panel = state.panel;
                if (panel === 'prayer') openPrayer();
                else if (panel === 'routine') openRoutine();
                else if (panel === 'tasbeeh') openTasbeeh();
                else if (panel === 'more') openMorePanel();
                else if (panel === 'about') openAboutPanel();
                else if (panel === 'etiquette') openEtiquette();
                else if (panel === 'progress') openProgress();
                else if (panel === 'bookmarks') toggleBookmarksPanel();
            }
        } finally {
            inAppHistorySuppressed = false;
            updateInAppFabVisibility();
        }
    }

    function triggerInAppBack() {
        const route = getInAppRoute();
        if (route === IN_APP_VIEWS.HOME) return;
        history.back();
    }

    function initInAppNavigationUX() {
        const backBtn = document.getElementById('inAppBackBtn');

        if (backBtn && backBtn.dataset.bound !== '1') {
            backBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                triggerInAppBack();
            }, { passive: false });
            backBtn.addEventListener('click', triggerInAppBack);
            backBtn.dataset.bound = '1';
        }

        window.addEventListener('popstate', (event) => {
            const state = event.state;
            console.log('[History] popstate', {
                incomingState: state,
                currentRoute: getInAppRoute(),
                quranPanelActive: !!document.querySelector('.quran-panel.active'),
                readerActive: !!document.getElementById('quranReaderScreen')?.classList.contains('active')
            });

            if (!state) {
                showToast(isPashtoMode() ? 'د وتلو لپاره بیا شاتګ کېکاږئ' : 'Press back again to exit');
                history.pushState(getInAppStateFromDom(), '');
                updateInAppFabVisibility();
                return;
            }

            const currentRoute = getInAppRoute();
            if (currentRoute === IN_APP_VIEWS.SURAH_READER && state.view === IN_APP_VIEWS.QURAN_TAB) {
                closeQuranReader({ skipHistory: true });
                updateInAppFabVisibility();
                return;
            }

            if (currentRoute === IN_APP_VIEWS.QURAN_TAB && state.view === IN_APP_VIEWS.HOME) {
                closeQuranPanel({ skipHistory: true });
                switchToHomeTab();
                updateInAppFabVisibility();
                return;
            }

            if (currentRoute === IN_APP_VIEWS.QURAN_TAB && state.view === IN_APP_VIEWS.QURAN_TAB) {
                closeQuranPanel({ skipHistory: true });
                switchToHomeTab();
                updateInAppFabVisibility();
                return;
            }

            if (state.view === IN_APP_VIEWS.HOME) {
                closeAllPanelsForStateApply();
                switchToHomeTab();
                updateInAppFabVisibility();
                return;
            }

            applyInAppState(state);
        });

        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeTracking = false;
        const swipeIndicator = document.getElementById('inAppSwipeIndicator');

        document.addEventListener('touchstart', (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            swipeTracking = touch.clientX <= 30;
            if (!swipeTracking) return;
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
        }, { passive: true });

        document.addEventListener('touchmove', (event) => {
            if (!swipeTracking) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            const dx = touch.clientX - swipeStartX;
            const dy = Math.abs(touch.clientY - swipeStartY);
            if (dy > 60) {
                swipeTracking = false;
                if (swipeIndicator) swipeIndicator.classList.remove('visible');
                return;
            }
            if (swipeIndicator) swipeIndicator.classList.toggle('visible', dx > 12 && shouldShowBackFab(getInAppRoute()));
        }, { passive: true });

        document.addEventListener('touchend', (event) => {
            if (!swipeTracking) return;
            const touch = event.changedTouches?.[0];
            swipeTracking = false;
            if (swipeIndicator) swipeIndicator.classList.remove('visible');
            if (!touch) return;
            const dx = touch.clientX - swipeStartX;
            if (dx >= 80 && shouldShowBackFab(getInAppRoute())) triggerInAppBack();
        }, { passive: true });

        window.addEventListener('scroll', updateInAppFabVisibility, { passive: true });
        document.addEventListener('scroll', updateInAppFabVisibility, { passive: true });
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.addEventListener('scroll', updateInAppFabVisibility, { passive: true });
        document.querySelectorAll('.quran-panel, .prayer-panel, .routine-panel, .tasbeeh-panel, .etiquette-panel, .more-panel').forEach((panel) => {
            panel.addEventListener('scroll', updateInAppFabVisibility, { passive: true });
        });

        const homeState = { view: IN_APP_VIEWS.HOME };
        history.replaceState(homeState, '');
        console.log('[History] replaceState home', homeState);
        updateInAppFabVisibility();
    }

    // ===== BOOKMARKING =====
    window.toggleBookmark = function(id) {
        const index = STATE.bookmarks.indexOf(id);
        const btn = document.querySelector(`.dua-card[data-id="${id}"] .bookmark-btn`);
        safeVibrate(15);
        if (index === -1) {
            STATE.bookmarks.push(id);
            if (btn) { btn.classList.add('bookmarked'); btn.innerHTML = '★'; }
            showToast('Added to Bookmarks');
        } else {
            STATE.bookmarks.splice(index, 1);
            if (btn) { btn.classList.remove('bookmarked'); btn.innerHTML = '☆'; }
            showToast('Removed from Bookmarks');
        }
        localStorage.setItem('crown_bookmarks', JSON.stringify(STATE.bookmarks));
        updateStats();
        renderBookmarksPanel();
        if (isDuaSwipeViewerActive() && getCurrentSwipeDuaId() === id) renderDuaSwipeViewer();
    };

    // ===== MARK READ =====
    window.markRead = function(btn, id) {
        if (!STATE.read.includes(id)) {
            STATE.read.push(id);
            localStorage.setItem('crown_read', JSON.stringify(STATE.read));
            const card = document.querySelector(`.dua-card[data-id="${id}"]`);
            if (card) card.classList.add('read-card');
            if (btn) { btn.classList.add('read'); btn.innerHTML = '✓ Read'; }
            updateStats();
            showToast(`Marked as Read (${STATE.read.length}/63)`);
            if (isDuaSwipeViewerActive() && getCurrentSwipeDuaId() === id) renderDuaSwipeViewer();
        } else {
            showToast('Already marked as read');
        }
    };

    // ===== COPY TEXT =====
    window.copyText = function(btn, text) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✓ Copied!';
                btn.classList.add('copied');
                setTimeout(() => { btn.innerHTML = originalText; btn.classList.remove('copied'); }, 2000);
            }
            showToast('Copied to clipboard');
        }).catch(() => showToast('Failed to copy'));
    };

    // ===== SEARCH & FILTER =====
    function filterDuas(query) {
        query = (query || '').toLowerCase();
        let visibleCount = 0;
        if (els.searchClear) els.searchClear.classList.toggle('visible', query.length > 0);
        els.cards.forEach(card => {
            const isMatch = card.textContent.toLowerCase().includes(query) ||
                           (card.getAttribute('data-keywords') || "").includes(query);
            card.classList.toggle('hidden-card', !isMatch);
            if (isMatch) visibleCount++;
        });
        if (els.noResults) els.noResults.classList.toggle('visible', visibleCount === 0);

        // Hide section headers with no visible cards beneath them
        document.querySelectorAll('.section-header').forEach(sh => {
            if (query) {
                let hasVisible = false;
                let next = sh.nextElementSibling;
                while (next && !next.classList.contains('section-header')) {
                    if (next.classList.contains('dua-card') && !next.classList.contains('hidden-card')) {
                        hasVisible = true;
                        break;
                    }
                    next = next.nextElementSibling;
                }
                sh.style.display = hasVisible ? '' : 'none';
            } else {
                sh.style.display = '';
            }
        });
    }

    window.clearSearch = function() {
        if (els.searchInput) els.searchInput.value = '';
        filterDuas('');
        if (els.searchClear) els.searchClear.classList.remove('visible');
    };

window.filterCategory = function(cat, btn) {
    runTabFadeTransition(document.getElementById('duaListSection'));

    if (els.pills) els.pills.forEach(p => p.classList.remove('active'));
    if (btn && btn.classList.contains('pill')) btn.classList.add('active');

    let visibleCount = 0;
    els.cards.forEach(card => {
        const cats = card.getAttribute('data-categories').split(',');
        const isMatch = cat === 'all' || cats.includes(cat);
        card.classList.toggle('hidden-card', !isMatch);
        card.style.display = '';  // ✅ always clear any stuck inline style
        if (isMatch) visibleCount++;
    });

    // Expand all collapsed sections when filtering
    document.querySelectorAll('.section-header.collapsed').forEach(sh => {
        sh.classList.remove('collapsed');
        const hint = sh.querySelector('.section-collapse-hint');
        if (hint) {
            const isPashto = typeof getCurrentLang === 'function' && getCurrentLang() === 'ps';
            hint.textContent = isPashto ? (typeof PS_UI !== 'undefined' ? PS_UI.tapCollapse : 'tap to collapse') : 'tap to collapse';
        }

        let next = sh.nextElementSibling;
        while (next && !next.classList.contains('section-header')) {
            if (next.classList.contains('dua-card')) {
                next.style.display = ''; 
            }
            next = next.nextElementSibling;
        }
    });

    // Hide section headers: hide ALL when filtering a specific category,
    // only hide empty ones when showing "all"
    document.querySelectorAll('.section-header').forEach(sh => {
        if (cat !== 'all') {
            sh.style.display = 'none';
        } else {
            let hasVisible = false;
            let next = sh.nextElementSibling;
            while (next && !next.classList.contains('section-header')) {
                if (next.classList.contains('dua-card') && !next.classList.contains('hidden-card')) {
                    hasVisible = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            sh.style.display = hasVisible ? '' : 'none';
        }
    });

    if (els.noResults) els.noResults.classList.toggle('visible', visibleCount === 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

    // ===== CATEGORY GRID NAVIGATION =====
    const CATEGORY_META = {
        'all':             { icon: '📿', title: 'All Duas',                subtitle: 'The complete collection of 63 essential supplications' },
        'quran':           { icon: '📖', title: 'The Quranic Foundation',  subtitle: 'The speech of Allah — the highest authority' },
        'protection':      { icon: '🛡️', title: 'Protection & Refuge',     subtitle: 'Shield yourself with the words of Allah and His Messenger ﷺ' },
        'forgiveness':     { icon: '🤲', title: 'Forgiveness',             subtitle: 'Turn back to Allah with these powerful supplications' },
        'guidance':        { icon: '🌟', title: 'Guidance & Faith',        subtitle: 'Ask Allah for direction and steadfastness' },
        'wellbeing':       { icon: '💚', title: 'Wellbeing & Relief',      subtitle: 'Healing, ease, and comfort from the Sunnah' },
        'prophets':        { icon: '🕌', title: "Prophets' Duas",          subtitle: 'Supplications of the Prophets عليهم السلام' },
        'morning-evening': { icon: '🌅', title: 'Morning & Evening',       subtitle: 'Daily adhkar for protection and blessings' },
        'provision':       { icon: '🌾', title: 'Provision',               subtitle: 'Ask Allah for sustenance and barakah' },
        'prayer':          { icon: '🕋', title: 'Prayer',                  subtitle: 'The greatest names and supplications in salah' },
        'family':          { icon: '👨‍👩‍👧', title: 'Family',                  subtitle: 'Duas for parents, spouse, and children' },
        'travel':          { icon: '✈️', title: 'Travel & Knowledge',      subtitle: 'Supplications for journeys and seeking knowledge' },
        'scholars':        { icon: '📚', title: 'Treasures of the Scholars', subtitle: 'Gems with honest transparent authentication' },
        'ramadan':         { icon: '🌙', title: 'Ramadan & Fasting',           subtitle: 'Supplications for the blessed month and the discipline of fasting' },
        'evil-eye':        { icon: '🧿', title: 'Evil Eye & Envy',             subtitle: 'Prophetic shields against hasad and al-\'ayn' }
    };

    const CATEGORY_WATERMARKS = {
        all: 'ادعوني أستجب لكم',
        quran: 'كتاب أنزلناه إليك مبارك',
        quranic: 'كتاب أنزلناه إليك مبارك',
        'morning-evening': 'أذكار الصباح والمساء',
        morning: 'أذكار الصباح والمساء',
        protection: 'أعوذ بالله من الشيطان الرجيم',
        forgiveness: 'أستغفر الله العظيم',
        guidance: 'اهدنا الصراط المستقيم',
        wellbeing: 'اللهم عافني في بدني',
        prophets: 'ربنا آتنا في الدنيا حسنة',
        prayer: 'أقم الصلاة لذكري',
        provision: 'إن الله هو الرزاق',
        family: 'ربنا هب لنا من أزواجنا',
        travel: 'سبحان الذي سخر لنا هذا',
        knowledge: 'رب زدني علما',
        scholars: 'لا حول ولا قوة إلا بالله',
        ramadan: 'شهر رمضان الذي أنزل فيه القرآن',
        'evil-eye': 'أعوذ بكلمات الله التامات'
    };

    const QUICK_TILE_WATERMARKS = {
        'quick-quran': 'بسم الله',
        'quick-duas': 'ادعوني',
        'quick-tasbeeh': 'سبحان الله',
        'quick-qibla': 'الله أكبر'
    };

    function syncCategoryWatermarks(root = document) {
        root.querySelectorAll('#categoryGrid .cat-card[data-cat], .dua-category-card[data-cat]').forEach((card) => {
            const categoryKey = card.getAttribute('data-cat') || '';
            const watermarkText = CATEGORY_WATERMARKS[categoryKey] || 'سبحان الله وبحمده';
            let watermark = card.querySelector('.category-watermark');
            if (!watermark) {
                watermark = document.createElement('span');
                watermark.className = 'category-watermark';
                watermark.setAttribute('aria-hidden', 'true');
                card.insertBefore(watermark, card.firstChild);
            }
            watermark.textContent = watermarkText;
        });
    }

    function syncHomeTileWatermarks(root = document) {
        Object.entries(QUICK_TILE_WATERMARKS).forEach(([tileClass, watermarkText]) => {
            const tile = root.querySelector(`.dashboard-quick-tile.${tileClass}`);
            if (!tile) return;
            let watermark = tile.querySelector('.tile-watermark');
            if (!watermark) {
                watermark = document.createElement('span');
                watermark.className = 'tile-watermark';
                watermark.setAttribute('aria-hidden', 'true');
                tile.insertBefore(watermark, tile.firstChild);
            }
            watermark.textContent = watermarkText;
        });
    }

    function getDuaIdsForCategory(cat) {
        const cards = Array.from(document.querySelectorAll('#duaListSection .dua-card'));
        return cards
            .filter((card) => {
                if (cat === 'all') return true;
                const cats = (card.getAttribute('data-categories') || '').split(',').map(c => c.trim());
                return cats.includes(cat);
            })
            .map(card => Number(card.getAttribute('data-id')))
            .filter(Boolean);
    }

    function getViewerTexts() {
        const isSmallPhone = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 480px)').matches;
        return isPashtoMode()
            ? {
                of: 'له',
                from: 'څخه',
                read: 'لوستل شوی ✓',
                markRead: '✓ ولولئ',
                list: 'لړلیک',
                listen: 'اورېدل',
                copy: 'کاپي',
                share: 'شريک',
                shareImage: isSmallPhone ? 'شریک' : 'انځور',
                bookmarkAdd: isSmallPhone ? 'ساتل' : 'نښه',
                bookmarkOn: isSmallPhone ? 'ساتل شوی' : 'په نښه شوی',
                backHint: 'کټګوریو ته ستنیدل'
            }
            : {
                of: 'of',
                from: '',
                read: 'Read ✓',
                markRead: '✓ Mark Read',
                list: 'List',
                listen: 'Listen',
                copy: 'Copy',
                share: 'Share',
                shareImage: isSmallPhone ? 'Share' : 'Share Image',
                bookmarkAdd: isSmallPhone ? 'Save' : 'Bookmark',
                bookmarkOn: isSmallPhone ? 'Saved' : 'Bookmarked',
                backHint: 'Back to categories'
            };
    }

    function ensureDuaBismillah(bodyInner) {
        if (!bodyInner || bodyInner.querySelector('.dua-bismillah')) return;

        const firstChild = bodyInner.firstElementChild;
        if (firstChild?.classList.contains('dua-title-arabic')) return;

        const bismillah = document.createElement('div');
        bismillah.className = 'dua-bismillah';
        bismillah.setAttribute('dir', 'rtl');
        bismillah.textContent = 'بسم الله الرحمن الرحيم';
        bodyInner.insertBefore(bismillah, bodyInner.firstChild);
    }

    function injectDuaBismillahHeaders(root = document) {
        root.querySelectorAll('#duaListSection .card-body-inner').forEach(ensureDuaBismillah);
    }

    function buildSwipeSlide(duaId, slotClass) {
        const card = document.querySelector(`#duaListSection .dua-card[data-id="${duaId}"]`);
        if (!card) {
            const fallback = document.createElement('div');
            fallback.className = `dua-swipe-slide ${slotClass || ''}`;
            fallback.innerHTML = '<div class="dua-swipe-card"><div class="dua-swipe-empty">Dua unavailable</div></div>';
            return fallback;
        }

        const titleEl = card.querySelector('.dua-title');
        const titleClone = titleEl ? titleEl.cloneNode(true) : null;
        const authBadge = titleClone?.querySelector('.auth-badge');
        const authText = authBadge ? authBadge.textContent.trim() : '';
        if (authBadge) authBadge.remove();

        const bodyClone = card.querySelector('.card-body-inner')?.cloneNode(true);
        if (bodyClone) bodyClone.querySelectorAll('.copy-row').forEach(row => row.remove());
        ensureDuaBismillah(bodyClone);

        const texts = getViewerTexts();
        const isBookmarked = STATE.bookmarks.includes(duaId);
        const isRead = STATE.read.includes(duaId);
        const indexDisplay = DUA_SWIPE_STATE.index + 1;
        const total = DUA_SWIPE_STATE.ids.length;
        const progressLabel = isPashtoMode()
            ? `${localizeDigits(indexDisplay)} از ${localizeDigits(total)}`
            : `${indexDisplay} ${texts.of} ${total}`;

        const slide = document.createElement('div');
        slide.className = `dua-swipe-slide ${slotClass || ''}`;
        slide.setAttribute('data-dua-id', String(duaId));

        const cardWrap = document.createElement('div');
        cardWrap.className = 'dua-swipe-card';

        const topMeta = document.createElement('div');
        topMeta.className = 'dua-swipe-meta';
        topMeta.innerHTML = `
            <div class="dua-swipe-count">${progressLabel}</div>
            <div class="dua-swipe-read ${isRead ? 'active' : ''}" data-role="read-indicator">${isRead ? texts.read : texts.markRead}</div>
        `;

        const titleRow = document.createElement('div');
        titleRow.className = 'dua-swipe-title-row';
        titleRow.innerHTML = `
            <div class="dua-swipe-title">${titleClone ? titleClone.innerHTML : `Dua ${duaId}`}</div>
            <div class="dua-swipe-auth">${authText}</div>
        `;

        const content = document.createElement('div');
        content.className = 'dua-swipe-content';
        if (bodyClone) content.appendChild(bodyClone);

        const mappedAudioId = resolveMappedDuaId(duaId);
        const hasMappedAudio = !!mappedAudioId;
        const actions = document.createElement('div');
        actions.className = 'dua-swipe-actions';
        const bookmarkAria = isBookmarked ? texts.bookmarkOn : texts.bookmarkAdd;
        actions.innerHTML = `
            ${hasMappedAudio ? `
            <div class="audio-player dua-swipe-audio" data-state="idle">
                <button class="action-btn action-btn-listen audio-btn" type="button" aria-label="${texts.listen}" title="${texts.listen}"><span class="action-btn-icon">▶</span><span class="action-btn-label">${texts.listen}</span></button>
                <div class="audio-progress"><span class="audio-progress-fill"></span></div>
            </div>
            ` : ''}
            <button class="action-btn action-btn-list" data-role="list" aria-label="${texts.list}" title="${texts.list}"><span class="action-btn-icon">☰</span><span class="action-btn-label">${texts.list}</span></button>
            <button class="action-btn action-btn-copy" data-role="copy" aria-label="${texts.copy}" title="${texts.copy}"><span class="action-btn-icon">⧉</span><span class="action-btn-label">${texts.copy}</span></button>
            <button class="action-btn action-btn-bookmark ${isBookmarked ? 'bookmarked-inline' : ''}" data-role="bookmark" aria-label="${bookmarkAria}" title="${bookmarkAria}"><span class="action-btn-icon">${isBookmarked ? '★' : '☆'}</span><span class="action-btn-label">${isBookmarked ? texts.bookmarkOn : texts.bookmarkAdd}</span></button>
            <button class="action-btn action-btn-image" data-role="image" aria-label="${texts.shareImage}" title="${texts.shareImage}"><span class="action-btn-icon">🖼</span><span class="action-btn-label">${texts.shareImage}</span></button>
        `;

        const listenBtn = actions.querySelector('.audio-btn');
        if (hasMappedAudio && listenBtn) {
            const player = actions.querySelector('.dua-swipe-audio');
            setAudioPlayerState(player, 'idle');
            listenBtn.addEventListener('click', () => {
                if (player) playDuaAudio(mappedAudioId, player);
            });
        }

        const firstArabic = card.querySelector('.arabic-text')?.textContent?.trim() || '';
        actions.querySelector('[data-role="copy"]')?.addEventListener('click', function() {
            copyText(this, firstArabic);
        });
        actions.querySelector('[data-role="list"]')?.addEventListener('click', () => backToCategories());
        actions.querySelector('[data-role="image"]')?.addEventListener('click', () => shareAsImage(duaId));
        actions.querySelector('[data-role="bookmark"]')?.addEventListener('click', () => {
            toggleBookmark(duaId);
            renderDuaSwipeViewer();
        });
        topMeta.querySelector('[data-role="read-indicator"]')?.addEventListener('click', () => {
            markRead(null, duaId);
            renderDuaSwipeViewer();
        });

        cardWrap.appendChild(topMeta);
        cardWrap.appendChild(titleRow);
        cardWrap.appendChild(content);
        cardWrap.appendChild(actions);
        slide.appendChild(cardWrap);
        return slide;
    }

    function updateSwipeViewerIndicators() {
        const total = DUA_SWIPE_STATE.ids.length;
        const index = DUA_SWIPE_STATE.index;
        const progress = document.getElementById('duaSwipeProgressFill');
        if (progress) {
            const pct = total ? ((index + 1) / total) * 100 : 0;
            progress.style.width = `${pct}%`;
        }

        const dotsWrap = document.getElementById('duaSwipeDots');
        if (!dotsWrap) return;
        if (total > 10) {
            dotsWrap.innerHTML = '';
            dotsWrap.classList.remove('visible');
            return;
        }
        dotsWrap.classList.add('visible');
        dotsWrap.innerHTML = DUA_SWIPE_STATE.ids.map((_, i) =>
            `<span class="dua-swipe-dot ${i === index ? 'active' : ''}"></span>`
        ).join('');
    }

    function getSwipeStep() {
        const track = document.getElementById('duaSwipeTrack');
        const firstSlide = track?.querySelector('.dua-swipe-slide');
        if (!track || !firstSlide) return 0;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
        return firstSlide.getBoundingClientRect().width + gap;
    }

    function setSwipeTrackPosition(baseIndex, extraX, animated) {
        const track = document.getElementById('duaSwipeTrack');
        if (!track) return false;
        const step = getSwipeStep();
        if (!step) return false;
        track.style.transition = animated ? 'transform 300ms ease-out' : 'none';
        track.style.transform = `translate3d(${(-step * baseIndex) + extraX}px, 0, 0)`;
        return true;
    }

    function renderDuaSwipeViewer() {
        const track = document.getElementById('duaSwipeTrack');
        if (!track || !DUA_SWIPE_STATE.ids.length) return;
        const index = DUA_SWIPE_STATE.index;
        const prevId = index > 0 ? DUA_SWIPE_STATE.ids[index - 1] : null;
        const currentId = DUA_SWIPE_STATE.ids[index];
        const nextId = index < DUA_SWIPE_STATE.ids.length - 1 ? DUA_SWIPE_STATE.ids[index + 1] : null;

        track.innerHTML = '';
        track.appendChild(buildSwipeSlide(prevId || currentId, 'slot-prev'));
        track.appendChild(buildSwipeSlide(currentId, 'slot-current'));
        track.appendChild(buildSwipeSlide(nextId || currentId, 'slot-next'));

        requestAnimationFrame(() => setSwipeTrackPosition(1, 0, false));
        updateSwipeViewerIndicators();
        wrapArabicWords();
    }

    function navigateSwipe(delta) {
        if (DUA_SWIPE_STATE.transitionLock) return;
        const targetIndex = DUA_SWIPE_STATE.index + delta;
        if (targetIndex < 0) {
            showToast(getViewerTexts().backHint);
            backToCategories();
            return;
        }
        if (targetIndex >= DUA_SWIPE_STATE.ids.length) {
            showToast(isPashtoMode() ? 'وروستۍ دعا' : 'Last dua in this category');
            return;
        }

        safeVibrate(5);
        DUA_SWIPE_STATE.transitionLock = true;
        showDuaSwipeHints(delta > 0 ? 'right' : 'left', 900);
        const moved = setSwipeTrackPosition(delta > 0 ? 2 : 0, 0, true);

        const track = document.getElementById('duaSwipeTrack');
        let completeTimer = null;
        const onDone = () => {
            if (completeTimer) {
                clearTimeout(completeTimer);
                completeTimer = null;
            }
            track?.removeEventListener('transitionend', onDone);
            DUA_SWIPE_STATE.index = targetIndex;
            DUA_SWIPE_STATE.transitionLock = false;
            renderDuaSwipeViewer();
            recordInAppRoute(false, {
                [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.DUA_DETAIL,
                category: DUA_SWIPE_STATE.category,
                duaId: getCurrentSwipeDuaId(),
                ts: Date.now()
            });
        };

        if (!moved || !track) {
            onDone();
            return;
        }

        track.addEventListener('transitionend', onDone);
        // Guard against missed transitionend on mobile browsers.
        completeTimer = setTimeout(onDone, 380);
    }

    function openDuaSwipeViewer(category, ids, startIndex, opts) {
        opts = opts || {};
        const grid = document.getElementById('categoryGrid');
        const duaList = document.getElementById('duaListSection');
        const detailHeader = document.getElementById('categoryDetailHeader');
        const hero = document.querySelector('.hero');
        const viewer = document.getElementById('duaSwipeViewer');

        DUA_SWIPE_STATE.active = true;
        DUA_SWIPE_STATE.category = category;
        DUA_SWIPE_STATE.ids = ids;
        DUA_SWIPE_STATE.index = Math.max(0, Math.min(startIndex, ids.length - 1));

        grid?.classList.add('hidden-grid');
        duaList?.classList.add('hidden-list');
        detailHeader?.classList.remove('visible');
        if (hero) hero.style.display = 'none';
        if (viewer) {
            if (duaViewerCloseTimer) {
                clearTimeout(duaViewerCloseTimer);
                duaViewerCloseTimer = null;
            }
            viewer.style.display = '';
            viewer.style.transition = '';
            viewer.style.opacity = '1';
            viewer.classList.remove('is-closing');
            viewer.classList.add('active');
            viewer.setAttribute('aria-hidden', 'false');
        }

        localStorage.setItem('crown_active_category', category);
        renderDuaSwipeViewer();
        showDuaSwipeHints('both', 3000);
        if (!opts.skipHistory) {
            recordInAppRoute(true, {
                [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.DUA_DETAIL,
                category,
                duaId: getCurrentSwipeDuaId(),
                ts: Date.now()
            });
        }
    }

    function openDuaViewerAtId(duaId, preferredCategory, opts) {
        const categories = (document.querySelector(`#duaListSection .dua-card[data-id="${duaId}"]`)?.getAttribute('data-categories') || '')
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);

        const category = (preferredCategory && (preferredCategory === 'all' || categories.includes(preferredCategory)))
            ? preferredCategory
            : (categories[0] || 'all');

        const ids = getDuaIdsForCategory(category);
        const idx = ids.indexOf(Number(duaId));
        const startIndex = idx >= 0 ? idx : 0;
        openDuaSwipeViewer(category, ids, startIndex, opts || {});
    }

    function closeDuaSwipeViewer(opts) {
        opts = opts || {};
        const viewer = document.getElementById('duaSwipeViewer');
        const afterClose = typeof opts.onAfterClose === 'function' ? opts.onAfterClose : null;
        if (viewer) {
            if (duaViewerCloseTimer) {
                clearTimeout(duaViewerCloseTimer);
                duaViewerCloseTimer = null;
            }
            viewer.classList.add('is-closing');
            viewer.setAttribute('aria-hidden', 'true');
            viewer.classList.remove('show-swipe-hints', 'hint-left', 'hint-right');
            viewer.style.transition = 'opacity 0.2s ease';
            viewer.style.opacity = '0';
            duaViewerCloseTimer = setTimeout(() => {
                viewer.classList.remove('active');
                viewer.classList.remove('is-closing');
                viewer.style.display = 'none';
                viewer.style.opacity = '1';
                viewer.style.transition = '';
                duaViewerCloseTimer = null;
                if (afterClose) afterClose();
            }, 200);
        } else if (afterClose) {
            afterClose();
        }
        DUA_SWIPE_STATE.active = false;
        DUA_SWIPE_STATE.ids = [];
        DUA_SWIPE_STATE.index = 0;
        DUA_SWIPE_STATE.transitionLock = false;
        if (swipeHintTimer) {
            clearTimeout(swipeHintTimer);
            swipeHintTimer = null;
        }
        if (!opts.skipRoute) {
            recordInAppRoute(false, {
                [IN_APP_HISTORY_FLAG]: true,
                view: IN_APP_VIEWS.HOME,
                ts: Date.now()
            });
        }
    }

    function initDuaSwipeViewer() {
        const prevBtn = document.getElementById('duaSwipePrev');
        const nextBtn = document.getElementById('duaSwipeNext');
        const backBtn = document.getElementById('duaSwipeBack');
        const shell = document.getElementById('duaSwipeShell');

        if (prevBtn && !prevBtn.dataset.bound) {
            prevBtn.addEventListener('click', () => navigateSwipe(-1));
            prevBtn.dataset.bound = '1';
        }
        if (nextBtn && !nextBtn.dataset.bound) {
            nextBtn.addEventListener('click', () => navigateSwipe(1));
            nextBtn.dataset.bound = '1';
        }
        if (backBtn && !backBtn.dataset.bound) {
            backBtn.addEventListener('click', () => backToCategories());
            backBtn.dataset.bound = '1';
        }

        if (shell && !shell.dataset.boundSwipe) {
            const startSwipeGesture = (x, y) => {
                if (!DUA_SWIPE_STATE.active) return;
                DUA_SWIPE_STATE.touchStartX = x;
                DUA_SWIPE_STATE.touchStartY = y;
                DUA_SWIPE_STATE.axisLock = null;
                DUA_SWIPE_STATE.dragX = 0;
                DUA_SWIPE_STATE.isDragging = true;
            };

            const moveSwipeGesture = (x, y, preventDefaultCb = null) => {
                if (!DUA_SWIPE_STATE.isDragging || !DUA_SWIPE_STATE.active) return;

                const dx = x - DUA_SWIPE_STATE.touchStartX;
                const dy = y - DUA_SWIPE_STATE.touchStartY;

                if (!DUA_SWIPE_STATE.axisLock) {
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                    DUA_SWIPE_STATE.axisLock = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
                }

                if (DUA_SWIPE_STATE.axisLock !== 'x') return;
                if (typeof preventDefaultCb === 'function') preventDefaultCb();
                DUA_SWIPE_STATE.dragX = Math.max(-180, Math.min(180, dx));
                setSwipeTrackPosition(1, DUA_SWIPE_STATE.dragX, false);
            };

            const endSwipeGesture = () => {
                if (!DUA_SWIPE_STATE.isDragging || !DUA_SWIPE_STATE.active) return;
                const dx = DUA_SWIPE_STATE.dragX;
                const axis = DUA_SWIPE_STATE.axisLock;
                DUA_SWIPE_STATE.isDragging = false;
                DUA_SWIPE_STATE.axisLock = null;
                DUA_SWIPE_STATE.dragX = 0;

                if (axis !== 'x') return;
                if (Math.abs(dx) >= 50) navigateSwipe(dx < 0 ? 1 : -1);
                else setSwipeTrackPosition(1, 0, true);
            };

            const cancelSwipeGesture = () => {
                DUA_SWIPE_STATE.isDragging = false;
                DUA_SWIPE_STATE.axisLock = null;
                DUA_SWIPE_STATE.dragX = 0;
                setSwipeTrackPosition(1, 0, true);
            };

            shell.addEventListener('touchstart', (e) => {
                const touch = e.touches?.[0];
                if (!touch) return;
                startSwipeGesture(touch.clientX, touch.clientY);
            }, { passive: true });

            shell.addEventListener('touchmove', (e) => {
                const touch = e.touches?.[0];
                if (!touch) return;
                moveSwipeGesture(touch.clientX, touch.clientY, () => e.preventDefault());
            }, { passive: false });

            shell.addEventListener('touchend', () => {
                endSwipeGesture();
            }, { passive: true });

            shell.addEventListener('touchcancel', () => {
                cancelSwipeGesture();
            }, { passive: true });

            // Support desktop/laptop drag gestures (mouse, trackpad, stylus).
            shell.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                startSwipeGesture(e.clientX, e.clientY);
            });

            shell.addEventListener('pointermove', (e) => {
                moveSwipeGesture(e.clientX, e.clientY, () => e.preventDefault());
            }, { passive: false });

            shell.addEventListener('pointerup', () => {
                endSwipeGesture();
            });

            shell.addEventListener('pointercancel', () => {
                cancelSwipeGesture();
            });

            shell.addEventListener('mouseleave', () => {
                if (DUA_SWIPE_STATE.isDragging) endSwipeGesture();
            });

            // Trackpads often emit wheel deltas instead of pointer drags on laptops.
            shell.addEventListener('wheel', (e) => {
                if (!DUA_SWIPE_STATE.active || DUA_SWIPE_STATE.transitionLock) return;

                const now = Date.now();
                if (now < duaSwipeWheelLockUntil) {
                    e.preventDefault();
                    return;
                }

                const absX = Math.abs(e.deltaX || 0);
                const absY = Math.abs(e.deltaY || 0);
                const horizontal = absX > absY * 1.1;
                if (!horizontal) return;

                if (absX < 24) return;
                e.preventDefault();
                duaSwipeWheelLockUntil = now + 420;
                navigateSwipe(e.deltaX > 0 ? 1 : -1);
            }, { passive: false });

            shell.dataset.boundSwipe = '1';
        }
    }

    window.refreshDuaSwipeViewerLanguage = function() {
        if (isDuaSwipeViewerActive()) renderDuaSwipeViewer();
    };

    window.openCategory = function(cat, opts) {
        opts = opts || {};
        const ids = getDuaIdsForCategory(cat);
        if (!ids.length) {
            showToast(isPashtoMode() ? 'دعاء ونه موندل شوه' : 'No duas found');
            return;
        }

        const startId = Number(opts.startId) || ids[0];
        const startIndex = Math.max(0, ids.indexOf(startId));
        openDuaSwipeViewer(cat, ids, startIndex, { skipHistory: !!opts.skipHistory });
    };

    window.backToCategories = function() {
        const grid = document.getElementById('categoryGrid');
        const duaList = document.getElementById('duaListSection');
        const detailHeader = document.getElementById('categoryDetailHeader');
        const hero = document.querySelector('.hero');
        const pillsRow = document.getElementById('categoryPills');

        closeDuaSwipeViewer({
            onAfterClose: () => {
                grid?.classList.remove('hidden-grid');
                duaList?.classList.add('hidden-list');
                detailHeader?.classList.remove('visible');
                if (hero) hero.style.display = '';
                if (pillsRow) pillsRow.style.display = '';

                if (els.searchInput) els.searchInput.value = '';
                if (els.searchClear) els.searchClear.classList.remove('visible');
                if (els.noResults) els.noResults.classList.remove('visible');

                localStorage.removeItem('crown_active_category');
            }
        });
    };

    // ===== BOOKMARKS PANEL =====
    window.toggleBookmarksPanel = function() {
        let panel = document.getElementById('bookmarksPanel');
        if (!panel) {
            const div = document.createElement('div');
            div.id = 'bookmarksPanel';
            div.className = 'side-panel';
            div.innerHTML = `
                <div class="panel-header">
                    <div class="panel-title">Your Saved Duas</div>
                    <button class="panel-close" onclick="toggleBookmarksPanel()">×</button>
                </div>
                <div id="bookmarkListContainer"></div>`;
            document.body.appendChild(div);
            if (!document.querySelector('.overlay')) {
                const ov = document.createElement('div');
                ov.className = 'overlay';
                ov.onclick = toggleBookmarksPanel;
                document.body.appendChild(ov);
            }
        }
        enhanceAccessibility();
        renderBookmarksPanel();
        const p = document.getElementById('bookmarksPanel');
        const overlay = document.querySelector('.overlay');
        const isOpening = !p.classList.contains('active');

        p.classList.toggle('active');
        overlay.classList.toggle('active');

        if (isOpening) {
            lockScroll();
            setBottomNavActive('duas');
            recordInAppRoute(true);
        } else {
            unlockScroll();
            setBottomNavActive('home');
            recordInAppRoute(false);
        }
    };

    function renderBookmarksPanel() {
        const container = document.getElementById('bookmarkListContainer');
        if (!container) return;
        if (STATE.bookmarks.length === 0) {
            container.innerHTML = '<div class="panel-empty">No bookmarks yet.<br>Tap the star icon to save duas here.</div>';
            return;
        }
        let html = '';
        STATE.bookmarks.forEach(id => {
            const card = document.querySelector(`.dua-card[data-id="${id}"]`);
            if (card) {
                const title = card.querySelector('.dua-title').textContent;
                const arabic = card.querySelector('.arabic-text').textContent;
                html += `<div class="panel-item" onclick="scrollToDua(${id}); toggleBookmarksPanel()">
                    <div class="panel-item-title">${title}</div>
                    <div class="panel-item-arabic">${arabic}</div>
                </div>`;
            }
        });
        container.innerHTML = html;
    }

    // ===== SCROLL TO DUA =====
    window.scrollToDua = function(id) {
        const preferredCategory = localStorage.getItem('crown_active_category') || 'all';
        openDuaViewerAtId(Number(id), preferredCategory, { pushHistory: true });
    };
    // ===== TASBEEH =====
    const DHIKR_LIST = [
        { id: 'subhanallah', ar: 'سُبْحَانَ ٱللَّهِ', en: 'Subhanallah', virtue: '33× after every salah', defaultTarget: 33 },
        { id: 'alhamdulillah', ar: 'ٱلْحَمْدُ لِلَّهِ', en: 'Alhamdulillah', virtue: '33× after every salah', defaultTarget: 33 },
        { id: 'allahuakbar', ar: 'ٱللَّهُ أَكْبَرُ', en: 'Allahu Akbar', virtue: '34× after every salah', defaultTarget: 34 },
        { id: 'lailaha', ar: 'لَا إِلَٰهَ إِلَّا ٱللَّهُ', en: 'La ilaha illallah', virtue: 'Best dhikr — Tirmidhi 3383', defaultTarget: 100 },
        { id: 'astaghfirullah', ar: 'أَسْتَغْفِرُ ٱللَّهَ', en: 'Astaghfirullah', virtue: '100× daily — Muslim 2702', defaultTarget: 100 },
        { id: 'subhanwabi', ar: 'سُبْحَانَ ٱللَّهِ وَبِحَمْدِهِ', en: 'Subhanallahi wa bihamdihi', virtue: 'Plants a tree in Jannah — Tirmidhi 3464', defaultTarget: 100 },
        { id: 'lahawla', ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّهِ', en: 'La hawla wala quwwata illa billah', virtue: 'A treasure of Jannah — Bukhari 6384', defaultTarget: 33 }
    ];

    let tasbeehCount = 0;
    let tasbeehTarget = 33;
    let currentDhikrIndex = 0;
    let tasbeehSoundEnabled = localStorage.getItem('crown_tasbeeh_sound') === 'true';
    let tasbeehAudioCtx = null;

    // Load saved totals
    function getDhikrTotals() {
        try { return JSON.parse(localStorage.getItem('crown_dhikr_totals') || '{}'); } catch { return {}; }
    }
    function saveDhikrTotal(id, count) {
        const totals = getDhikrTotals();
        totals[id] = (totals[id] || 0) + count;
        localStorage.setItem('crown_dhikr_totals', JSON.stringify(totals));
    }
    function getOverallTotal() {
        const totals = getDhikrTotals();
        return Object.values(totals).reduce((sum, v) => sum + v, 0);
    }

    function renderDhikrSelector() {
        const container = document.getElementById('dhikrSelector');
        if (!container) return;
        container.innerHTML = DHIKR_LIST.map((d, i) => `
            <div class="dhikr-option${i === currentDhikrIndex ? ' active' : ''}" onclick="selectDhikr(${i})">
                <div class="dhikr-option-ar">${d.ar}</div>
                <div class="dhikr-option-en">${d.en}</div>
            </div>
        `).join('');
        // Scroll active into view
        const active = container.querySelector('.dhikr-option.active');
        if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    function updateTasbeehUI() {
        const d = DHIKR_LIST[currentDhikrIndex];
        const arEl = document.getElementById('tasbeehArabic');
        const virtueEl = document.getElementById('tasbeehVirtue');
        const lifetimeEl = document.getElementById('tasbeehLifetime');
        const display = document.getElementById('tasbeehDisplay');
        if (arEl) arEl.textContent = d.ar;
        if (virtueEl) virtueEl.textContent = d.virtue;
        if (lifetimeEl) lifetimeEl.innerHTML = `${isPashtoMode() ? 'ټولټال' : 'Total'}: <span>${localizeDigits(getOverallTotal().toLocaleString())}</span>`;
        if (display) display.textContent = localizeDigits(tasbeehCount);
        const ringRatio = tasbeehTarget > 0 ? Math.max(0, Math.min(1, tasbeehCount / tasbeehTarget)) : 0;
        document.documentElement.style.setProperty('--tasbeeh-progress', `${Math.round(ringRatio * 100)}%`);
    }

    function formatTasbeehTargetLabel(target) {
        const value = Number(target) || 0;
        if (value === 0) {
            return isPashtoMode() && typeof PS_UI !== 'undefined'
                ? (PS_UI.openCount || 'خلاص شمېرنه')
                : 'Open count';
        }
        const label = isPashtoMode() && typeof PS_UI !== 'undefined'
            ? (PS_UI.target || 'هدف')
            : 'Target';
        return `${label}: ${localizeDigits(value)}`;
    }

    function updateTasbeehSoundToggle() {
        const toggleBtn = document.getElementById('tasbeehSoundToggle');
        if (!toggleBtn) return;
        toggleBtn.textContent = tasbeehSoundEnabled ? '🔊 Click Sound' : '🔇 Click Sound';
    }

    function playTasbeehClick() {
        if (!tasbeehSoundEnabled) return;
        try {
            if (!tasbeehAudioCtx) {
                const ACtx = window.AudioContext || window.webkitAudioContext;
                if (!ACtx) return;
                tasbeehAudioCtx = new ACtx();
            }
            if (tasbeehAudioCtx.state === 'suspended') tasbeehAudioCtx.resume();

            const osc = tasbeehAudioCtx.createOscillator();
            const gain = tasbeehAudioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = 760;
            gain.gain.setValueAtTime(0.0001, tasbeehAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.03, tasbeehAudioCtx.currentTime + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, tasbeehAudioCtx.currentTime + 0.045);
            osc.connect(gain);
            gain.connect(tasbeehAudioCtx.destination);
            osc.start();
            osc.stop(tasbeehAudioCtx.currentTime + 0.05);
        } catch (error) {
            // no-op
        }
    }

    function playTasbeehCompletionChime() {
        if (!tasbeehSoundEnabled) return;
        try {
            if (!tasbeehAudioCtx) {
                const ACtx = window.AudioContext || window.webkitAudioContext;
                if (!ACtx) return;
                tasbeehAudioCtx = new ACtx();
            }
            if (tasbeehAudioCtx.state === 'suspended') tasbeehAudioCtx.resume();

            const now = tasbeehAudioCtx.currentTime;
            const notes = [660, 880, 1046.5];
            notes.forEach((freq, index) => {
                const osc = tasbeehAudioCtx.createOscillator();
                const gain = tasbeehAudioCtx.createGain();
                const start = now + (index * 0.065);
                const end = start + 0.2;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.055, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, end);
                osc.connect(gain);
                gain.connect(tasbeehAudioCtx.destination);
                osc.start(start);
                osc.stop(end + 0.03);
            });
        } catch (error) {
            // no-op
        }
    }

    function triggerTasbeehCelebration() {
        const panel = document.querySelector('.tasbeeh-panel');
        if (panel) {
            panel.classList.add('celebrate');
            setTimeout(() => panel.classList.remove('celebrate'), 780);
        }
    }

    function showAuxPanel(selector, navName = 'more') {
        const target = document.querySelector(selector);
        if (!target) return;
        document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
        target.classList.add('active');
        setBottomNavActive(navName);
    }

    function ensureTasbeehTapBinding() {
        const tapBtn = document.getElementById('tasbeehTapBtn') || document.querySelector('.tasbeeh-tap-btn');
        if (!tapBtn || tapBtn.dataset.inputBound === '1') return;

        const triggerTap = (event) => {
            if (event) {
                if (event.type === 'pointerdown' && event.pointerType === 'mouse') return;
                event.preventDefault();
            }
            window.tapTasbeeh(event);
        };

        tapBtn.addEventListener('pointerdown', triggerTap, { passive: false });
        tapBtn.addEventListener('touchstart', triggerTap, { passive: false });
        tapBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.tapTasbeeh(event);
        }, { passive: false });
        tapBtn.dataset.inputBound = '1';
    }

    window.selectDhikr = function(index) {
        // Save current session count before switching
        if (tasbeehCount > 0) {
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
        }
        currentDhikrIndex = index;
        const d = DHIKR_LIST[index];
        tasbeehTarget = d.defaultTarget;
        tasbeehCount = 0;
        const display = document.getElementById('tasbeehDisplay');
        if (display) display.textContent = localizeDigits('0');
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = formatTasbeehTargetLabel(tasbeehTarget);
        // Update preset active states
        document.querySelectorAll('.tasbeeh-preset').forEach(p => p.classList.remove('active'));
        updateTasbeehUI();
        renderDhikrSelector();
        localStorage.setItem('crown_dhikr_selected', index);
    };

    window.openTasbeeh = function() {
        const tp = document.querySelector('.tasbeeh-panel');
        if (tp) showAuxPanel('.tasbeeh-panel');
        if (tp) tp.scrollTop = 0;
        // Restore last selected dhikr
        const saved = parseInt(localStorage.getItem('crown_dhikr_selected') || '0', 10);
        currentDhikrIndex = (saved >= 0 && saved < DHIKR_LIST.length) ? saved : 0;
        tasbeehTarget = DHIKR_LIST[currentDhikrIndex].defaultTarget;
        resetTasbeeh();
        renderDhikrSelector();
        updateTasbeehUI();
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = formatTasbeehTargetLabel(tasbeehTarget);
        updateTasbeehSoundToggle();
        ensureTasbeehTapBinding();
        const closeBtn = document.querySelector('.tasbeeh-panel .panel-back-btn');
        if (closeBtn) closeBtn.focus();
        recordInAppRoute(true);
    };

    window.openTasbeehWith = function(target) {
        openTasbeeh();
        tasbeehTarget = (target === 36) ? 100 : 33;
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = formatTasbeehTargetLabel(tasbeehTarget);
    };

    window.closeTasbeeh = function() {
        // Save session count on close
        if (tasbeehCount > 0) {
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
            tasbeehCount = 0;
        }
        openMorePanel();
        recordInAppRoute(false);
    };

    let lastTasbeehTapAt = 0;

    function getEventClientPoint(event, fallbackRect) {
        if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { x: event.clientX, y: event.clientY };
        }
        const touch = event?.touches?.[0] || event?.changedTouches?.[0];
        if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
            return { x: touch.clientX, y: touch.clientY };
        }
        if (fallbackRect) {
            return {
                x: fallbackRect.left + (fallbackRect.width / 2),
                y: fallbackRect.top + (fallbackRect.height / 2)
            };
        }
        return null;
    }

    window.tapTasbeeh = function(event) {
        const nowTap = Date.now();
        if (nowTap - lastTasbeehTapAt < 140) return;
        lastTasbeehTapAt = nowTap;

        tasbeehCount++;
        try {
            const key = new Date().toISOString().slice(0, 10);
            const counts = JSON.parse(localStorage.getItem('crown_tasbeeh_daily_counts') || '{}') || {};
            counts[key] = Number(counts[key] || 0) + 1;
            localStorage.setItem('crown_tasbeeh_daily_counts', JSON.stringify(counts));
        } catch (_) {}
        const display = document.getElementById('tasbeehDisplay');
        const btn = document.querySelector('.tasbeeh-tap-btn');
        if (display) {
            display.textContent = localizeDigits(tasbeehCount);
            display.classList.remove('bump');
            requestAnimationFrame(() => display.classList.add('bump'));
        }
        if (btn) {
            btn.classList.add('pulse');
            setTimeout(() => btn.classList.remove('pulse'), 100);
            btn.classList.add('tapped');
            setTimeout(() => btn.classList.remove('tapped'), 400);

            if (event) {
                const rect = btn.getBoundingClientRect();
                const point = getEventClientPoint(event, rect);
                const ripple = document.createElement('span');
                ripple.className = 'tasbeeh-ripple';
                ripple.style.left = `${(point ? point.x : rect.left + (rect.width / 2)) - rect.left}px`;
                ripple.style.top = `${(point ? point.y : rect.top + (rect.height / 2)) - rect.top}px`;
                btn.appendChild(ripple);
                setTimeout(() => ripple.remove(), 700);
            }
        }
        if (navigator.vibrate) navigator.vibrate(10);
        playTasbeehClick();
        refreshDashboardProgressSummaryCard();

        if (tasbeehCount >= tasbeehTarget && tasbeehTarget !== 0) {
            if (display) {
                display.classList.add('target-reached');
                setTimeout(() => display.classList.remove('target-reached'), 1000);
            }
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
            playTasbeehCompletionChime();
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
            triggerTasbeehCelebration();
            tasbeehCount = 0;
            showToast('Target reached! ✨ Count saved.');
            // Auto-advance to next dhikr if user reached target
            setTimeout(() => {
                const display2 = document.getElementById('tasbeehDisplay');
                if (display2) display2.textContent = localizeDigits('0');
                updateTasbeehUI();
            }, 300);
        }
    };

    window.resetTasbeeh = function() {
        // Save partial count before reset
        if (tasbeehCount > 0) {
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
        }
        tasbeehCount = 0;
        const display = document.getElementById('tasbeehDisplay');
        if (display) display.textContent = localizeDigits('0');
        updateTasbeehUI();
    };

    window.setTasbeehTarget = function(t) {
        tasbeehTarget = t;
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = formatTasbeehTargetLabel(t);
        resetTasbeeh();
        document.querySelectorAll('.tasbeeh-preset').forEach(p => p.classList.remove('active'));
        const activePreset = document.querySelector(`.tasbeeh-preset[onclick="setTasbeehTarget(${t})"]`);
        if (activePreset) activePreset.classList.add('active');
    };

    window.toggleTasbeehSound = function() {
        tasbeehSoundEnabled = !tasbeehSoundEnabled;
        localStorage.setItem('crown_tasbeeh_sound', tasbeehSoundEnabled ? 'true' : 'false');
        updateTasbeehSoundToggle();
        showToast(tasbeehSoundEnabled ? 'Tasbeeh click sound ON' : 'Tasbeeh click sound OFF');
    };

    // ===== ETIQUETTE PANEL =====
    function getEtiquetteTemplate() {
        if (isPashtoMode()) {
            return `
                <h2>د دعا آداب</h2>
                <div class="etiquette-item"><div class="etiquette-num">1</div><div class="etiquette-text"><strong>د الله تعالی ستاینه پیل کړئ</strong> او پر نبي ﷺ درود ووایئ. <span class="ref">(Tirmidhi 3477)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">2</div><div class="etiquette-text"><strong>بشپړ یقین ولرئ</strong> چې الله تعالی به ځواب درکړي. <span class="ref">(Tirmidhi 3479)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">3</div><div class="etiquette-text"><strong>په دعا کې دوام وکړئ</strong> او ناامیده مه کېږئ. <span class="ref">(Bukhari 6340)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">4</div><div class="etiquette-text"><strong>د زړه حضور وساتئ.</strong> له غافل زړه دعا نه قبلیږي. <span class="ref">(Tirmidhi 3479)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">5</div><div class="etiquette-text"><strong>قبلې ته مخ کړئ</strong> او لاسونه پورته کړئ. <span class="ref">(Abu Dawud 1488)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">6</div><div class="etiquette-text"><strong>د امکان په صورت کې په اوداسه کې اوسئ.</strong> پاکي دعا لوړوي.</div></div>
                <div class="etiquette-item"><div class="etiquette-num">7</div><div class="etiquette-text"><strong>د الله ښکلي نومونه وکاروئ</strong> چې غوښتنې سره مناسب وي. <span class="ref">(Quran 7:180)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">8</div><div class="etiquette-text"><strong>مبارک وختونه وټاکئ:</strong> د شپې وروستۍ برخه، د اذان او اقامت ترمنځ، سجده، روژه، سفر، او جمعه. <span class="ref">(Muslim 757, Abu Dawud 521)</span></div></div>
                <div class="etiquette-item"><div class="etiquette-num">9</div><div class="etiquette-text"><strong>خپل ګناهونه او اړتیا ومنئ</strong> او بیا غوښتنه وکړئ.</div></div>
                <div class="etiquette-item"><div class="etiquette-num">10</div><div class="etiquette-text"><strong>په پای کې پر نبي ﷺ درود ووایئ.</strong> <span class="ref">(Tirmidhi 486)</span></div></div>`;
        }

        return `
            <h2>The Etiquette of Dua</h2>
            <div class="etiquette-item"><div class="etiquette-num">1</div><div class="etiquette-text"><strong>Begin with praise of Allah</strong> and send Salawat upon the Prophet ﷺ. <span class="ref">(Tirmidhi 3477)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">2</div><div class="etiquette-text"><strong>Have absolute certainty (Yaqīn)</strong> that Allah will answer. The Prophet ﷺ said: "Call upon Allah with certainty that He will respond." <span class="ref">(Tirmidhi 3479)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">3</div><div class="etiquette-text"><strong>Be persistent — never give up.</strong> "Your dua is answered as long as you do not say: 'I prayed but was not answered.'" <span class="ref">(Bukhari 6340)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">4</div><div class="etiquette-text"><strong>Presence of heart.</strong> Allah does not accept dua from a heedless, distracted heart. <span class="ref">(Tirmidhi 3479)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">5</div><div class="etiquette-text"><strong>Face the Qiblah</strong> and raise your hands. The Prophet ﷺ was shy to return empty hands that were raised to Him. <span class="ref">(Abu Dawud 1488)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">6</div><div class="etiquette-text"><strong>Be in a state of wudu</strong> (ablution) when possible. Purity elevates the dua.</div></div>
            <div class="etiquette-item"><div class="etiquette-num">7</div><div class="etiquette-text"><strong>Use Allah's Beautiful Names</strong> that match your request. Asking for mercy? Use "Yā Raḥmān." Asking for provision? Use "Yā Razzāq." <span class="ref">(Quran 7:180)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">8</div><div class="etiquette-text"><strong>Seek the blessed times:</strong> Last third of the night, between Adhan and Iqamah, while prostrating, while fasting, while travelling, on Friday. <span class="ref">(Muslim 757, Abu Dawud 521)</span></div></div>
            <div class="etiquette-item"><div class="etiquette-num">9</div><div class="etiquette-text"><strong>Admit your sins and need</strong> before asking. Acknowledge your weakness — as in the Dua of Yunus and Adam عليهما السلام.</div></div>
            <div class="etiquette-item"><div class="etiquette-num">10</div><div class="etiquette-text"><strong>End with Salawat</strong> upon the Prophet ﷺ. "Every dua is suspended between heaven and earth until you send Salawat upon the Prophet ﷺ." <span class="ref">(Tirmidhi 486)</span></div></div>`;
    }

    window.openEtiquette = function() {
        const ep = document.querySelector('.etiquette-panel');
        if (!ep) return;
        ep.querySelector('.etiquette-content').innerHTML = getEtiquetteTemplate();
        showAuxPanel('.etiquette-panel');
        lockScroll();
        const closeBtn = ep.querySelector('.panel-back-btn');
        if (closeBtn) closeBtn.focus();
        recordInAppRoute(true);
    };

    window.refreshEtiquetteLanguage = function() {
        const ep = document.querySelector('.etiquette-panel');
        if (!ep) return;
        const content = ep.querySelector('.etiquette-content');
        if (!content || !content.innerHTML.trim()) return;
        content.innerHTML = getEtiquetteTemplate();
    };

    window.closeEtiquette = function() {
        const ep = document.querySelector('.etiquette-panel');
        if (ep) ep.classList.remove('active');
        openMorePanel();
        unlockScroll();
        recordInAppRoute(false);
    };

    function getRoutineUiText() {
        const isPS = isPashtoMode();
        const psUI = (typeof PS_UI !== 'undefined') ? PS_UI : null;
        return {
            title: isPS ? (psUI?.routineTitle || 'وړاندیز شوی ورځنی معمول') : 'Recommended Daily Routine',
            duaOfDay: isPS ? (psUI?.routineDuaOfDay || 'د ورځې دعا') : 'Dua of the Day',
            expandPrompt: isPS ? (psUI?.routineExpandPrompt || 'د ژباړې او حوالو د پراخولو لپاره ټک وکړئ') : 'Tap to expand translation & references',
            collapsePrompt: isPS ? (psUI?.routineHidePrompt || 'د جزئیاتو د پټولو لپاره ټک وکړئ ↑') : 'Tap to hide details ↑',
            morning: isPS ? (psUI?.routineMorning || '🌅 سهار (د فجر وروسته)') : '🌅 Morning (After Fajr)',
            evening: isPS ? (psUI?.routineEvening || '🌇 ماښام (د عصر/مغرب وروسته)') : '🌇 Evening (After Asr/Maghrib)',
            prayer: isPS ? (psUI?.routinePrayer || '🕌 په هر لمونځ کې') : '🕌 In Every Prayer',
            sleep: isPS ? (psUI?.routineSleep || '🌙 د ویده کېدو دمخه') : '🌙 Before Sleep',
            dhikr: isPS ? (psUI?.routineDhikr || '📿 ورځنی ذکر') : '📿 Daily Dhikr',
            eveningSame: isPS ? (psUI?.routineEveningSame || 'د سهار اذکار په شان، سربېره پر دې:') : 'Same as morning adhkar, plus:'
        };
    }

    function getRoutineDuaLabel(duaId, fallbackEn) {
        if (isPashtoMode() && typeof PS_UI !== 'undefined' && PS_UI.duaTitles && PS_UI.duaTitles[duaId]) {
            return PS_UI.duaTitles[duaId];
        }
        return fallbackEn;
    }

    function renderRoutinePanelContent(rp) {
        if (!rp) return;
        const ui = getRoutineUiText();
        rp.querySelector('.routine-content').innerHTML = `
            <h2>${ui.title}</h2>
            <div class="progress-stat-card daily-dua-progress" style="flex-direction:column;text-align:center;cursor:pointer;border-color:rgba(201,168,76,0.15);" onclick="toggleRoutineDailyDua(event);">
                <div style="font-family:var(--font-title);font-size:0.72rem;letter-spacing:0.5px;text-transform:none;color:rgba(201,168,76,0.8);margin-bottom:0.5rem;"><span class="sparkle">✦</span> ${ui.duaOfDay} <span class="sparkle">✦</span></div>
                <div id="routineDailyArabic" style="font-family:var(--font-arabic);font-size:calc(1.3rem * var(--font-scale));color:var(--gold-light);direction:rtl;line-height:2.2;margin:0.4rem 0;"></div>
                <div id="routineDailyTranslation" style="font-family:var(--font-text);font-size:0.88rem;color:var(--text-muted);font-style:italic;line-height:1.6;"></div>
                <div id="routineDailyPrompt" style="margin-top:10px;font-size:0.7rem;color:var(--text-faint);letter-spacing:0.2px;text-transform:none;">${ui.expandPrompt}</div>
            </div>
            <div id="routineDailyExtra" style="display:none;margin-top:10px;padding:12px;background:rgba(46,196,122,0.08);border:1px solid rgba(46,196,122,0.18);border-radius:var(--radius-md);"></div>

            <div class="routine-item">
                <div class="routine-time">${ui.morning}</div>
                <div class="routine-desc">
                    1. <span class="dua-ref" onclick="scrollToDua(2);closeRoutine()">${getRoutineDuaLabel(2, 'Ayatul Kursi')}</span><br>
                    2. <span class="dua-ref" onclick="scrollToDua(6);closeRoutine()">${getRoutineDuaLabel(6, '3 Quls (3x each)')}</span><br>
                    3. <span class="dua-ref" onclick="scrollToDua(12);closeRoutine()">${getRoutineDuaLabel(12, 'Bismillah Protection (3x)')}</span><br>
                    4. <span class="dua-ref" onclick="scrollToDua(16);closeRoutine()">${getRoutineDuaLabel(16, 'Sayyid al-Istighfar')}</span><br>
                    5. <span class="dua-ref" onclick="scrollToDua(14);closeRoutine()">${getRoutineDuaLabel(14, 'Contentment with Allah (3x)')}</span><br>
                    6. <span class="dua-ref" onclick="scrollToDua(35);closeRoutine()">${getRoutineDuaLabel(35, 'Hasbiyallah (7x)')}</span><br>
                    7. <span class="dua-ref" onclick="scrollToDua(38);closeRoutine()">${getRoutineDuaLabel(38, 'Beneficial Knowledge')}</span><br>
                    8. <span class="dua-ref" onclick="scrollToDua(34);closeRoutine()">${getRoutineDuaLabel(34, 'Morning Remembrance')}</span>
                </div>
            </div>

            <div class="routine-item">
                <div class="routine-time">${ui.evening}</div>
                <div class="routine-desc">
                    ${ui.eveningSame}<br>
                    • <span class="dua-ref" onclick="scrollToDua(23);closeRoutine()">${getRoutineDuaLabel(23, "Asking for 'Afiyah")}</span><br>
                    • <span class="dua-ref" onclick="scrollToDua(48);closeRoutine()">${getRoutineDuaLabel(48, 'Protection from Four Evils')}</span>
                </div>
            </div>

            <div class="routine-item">
                <div class="routine-time">${ui.prayer}</div>
                <div class="routine-desc">
                    • <span class="dua-ref" onclick="scrollToDua(1);closeRoutine()">${getRoutineDuaLabel(1, 'Al-Fatiha')}</span><br>
                    • <span class="dua-ref" onclick="scrollToDua(13);closeRoutine()">${getRoutineDuaLabel(13, 'Four Refuges (before salam)')}</span><br>
                    • <span class="dua-ref" onclick="scrollToDua(7);closeRoutine()">${getRoutineDuaLabel(7, 'Rabbana Atina')}</span><br>
                    • <span class="dua-ref" onclick="scrollToDua(46);closeRoutine()">${getRoutineDuaLabel(46, 'Ibrahimic Salawat')}</span>
                </div>
            </div>

            <div class="routine-item">
                <div class="routine-time">${ui.sleep}</div>
                <div class="routine-desc">
                    1. <span class="dua-ref" onclick="scrollToDua(2);closeRoutine()">${getRoutineDuaLabel(2, 'Ayatul Kursi')}</span><br>
                    2. <span class="dua-ref" onclick="scrollToDua(6);closeRoutine()">${getRoutineDuaLabel(6, '3 Quls (Blow & Wipe 3x)')}</span><br>
                    3. <span class="dua-ref" onclick="scrollToDua(5);closeRoutine()">${getRoutineDuaLabel(5, 'Last 2 Verses of Al-Baqarah')}</span><br>
                    4. <span class="dua-ref" onclick="scrollToDua(49);closeRoutine()">${getRoutineDuaLabel(49, 'Sleep Dua')}</span><br>
                    5. <span class="dua-ref" onclick="scrollToDua(36);closeRoutine()">${getRoutineDuaLabel(36, 'Tahlil (before sleeping)')}</span>
                </div>
            </div>

            <div class="routine-item">
                <div class="routine-time">${ui.dhikr}</div>
                <div class="routine-desc">
                    • <span class="dua-ref" onclick="scrollToDua(36);closeRoutine()">${getRoutineDuaLabel(36, 'Tahlil 100x')}</span> — ${isPashtoMode() && typeof PS_UI !== 'undefined' ? (PS_UI.routineUseTasbeeh || 'د تسبیح شمېرونکی وکاروئ') : 'Use the Tasbeeh counter'}<br>
                    • ${isPashtoMode() ? 'سبحان الله ۳۳ ځله، الحمدلله ۳۳ ځله، الله اکبر ۳۴ ځله له هر لمانځه وروسته' : 'SubhanAllah 33x, Alhamdulillah 33x, Allahu Akbar 34x after each prayer'}<br>
                    • <span class="dua-ref" onclick="scrollToDua(19);closeRoutine()">${getRoutineDuaLabel(19, 'Ya Muqallibal Qulub')}</span> — ${isPashtoMode() && typeof PS_UI !== 'undefined' ? (PS_UI.routineOften || 'هر څومره ډېر وي، هومره ښه') : 'as often as possible'}
                </div>
            </div>`;
    }

    // ===== ROUTINE PANEL =====
    window.openRoutine = function() {
        const rp = document.querySelector('.routine-panel');
        if (!rp) return;
        renderRoutinePanelContent(rp);
        // clear any previously shown extra details
        const extra = rp.querySelector('#routineDailyExtra');
        const prompt = rp.querySelector('#routineDailyPrompt');
        if (extra) {
            extra.innerHTML = '';
            extra.style.display = 'none';
        }
        if (prompt) {
            prompt.textContent = getRoutineUiText().expandPrompt;
        }

        showAuxPanel('.routine-panel');
        loadRoutineDailyDua();
        const closeBtn = rp.querySelector('.panel-back-btn');
        if (closeBtn) closeBtn.focus();
        recordInAppRoute(true);
    };

    window.refreshRoutineLanguage = function() {
        const rp = document.querySelector('.routine-panel');
        if (!rp) return;
        const hadContent = !!rp.querySelector('.routine-content')?.innerHTML?.trim();
        if (!hadContent) return;
        renderRoutinePanelContent(rp);
        loadRoutineDailyDua();
    };

    window.closeRoutine = function() {
        openMorePanel();
        recordInAppRoute(false);
    };

    // ===== SHARE =====
    window.sharePage = function() {
        if (navigator.share) {
            navigator.share({
                title: 'Falah — فلاح',
                text: '63 Essential Islamic Duas from Quran & Sunnah — by Engineer Mohammad Falah',
                url: window.location.href
            });
        } else {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showToast('Link copied to clipboard');
            }).catch(() => showToast('Failed to copy'));
        }
    };

    window.shareDua = function(id) {
        const card = document.querySelector(`.dua-card[data-id="${id}"]`);
        if (!card) return;
        const title = card.querySelector('.dua-title').textContent;
        const arabic = card.querySelector('.arabic-text').textContent;
        const text = `${title}\n\n${arabic}\n\nFrom: Falah — فلاح\n${window.location.href}`;
        if (navigator.share) {
            navigator.share({ title: title, text: text });
        } else {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Dua copied to clipboard');
            }).catch(() => showToast('Failed to copy'));
        }
    };

    // ===== UTILITIES =====
    function getLocalDateKey(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function parseDateKey(dateKey) {
        if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return null;
        const [yy, mm, dd] = String(dateKey).split('-').map(Number);
        const parsed = new Date(yy, mm - 1, dd);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function daysBetweenDateKeys(fromKey, toKey) {
        const from = parseDateKey(fromKey);
        const to = parseDateKey(toKey);
        if (!from || !to) return null;
        const ms = to.getTime() - from.getTime();
        return Math.floor(ms / 86400000);
    }

    function getQuranStreakForDisplay() {
        const streak = Math.max(0, Number(localStorage.getItem(QURAN_STREAK_KEY) || 0));
        const lastDay = localStorage.getItem(QURAN_STREAK_LAST_DAY_KEY);
        const today = getLocalDateKey(new Date());
        const gap = daysBetweenDateKeys(lastDay, today);
        if (gap === null || !lastDay) return 0;
        if (gap <= 1) return streak;
        return 0;
    }

    function registerQuranReadForStreak(atTs = Date.now()) {
        const today = getLocalDateKey(new Date(atTs));
        if (!today) return 0;

        const prevDay = localStorage.getItem(QURAN_STREAK_LAST_DAY_KEY);
        let streak = Math.max(0, Number(localStorage.getItem(QURAN_STREAK_KEY) || 0));
        const gap = daysBetweenDateKeys(prevDay, today);

        if (!prevDay || gap === null) {
            streak = 1;
        } else if (gap === 0) {
            // Keep streak unchanged when user reads multiple times on same day.
            streak = Math.max(streak, 1);
        } else if (gap === 1) {
            streak = Math.max(1, streak + 1);
        } else {
            streak = 1;
        }

        localStorage.setItem(QURAN_STREAK_KEY, String(streak));
        localStorage.setItem(QURAN_STREAK_LAST_DAY_KEY, today);
        return streak;
    }

    function updateStats() {
        if (els.bookmarkCount) {
            const saved = STATE.bookmarks.length;
            els.bookmarkCount.innerText = saved || '—';
            const savedLabel = els.bookmarkCount.closest('.stat-item')?.querySelector('.stat-label');
            const isPS = isPashtoMode();
            if (savedLabel) savedLabel.innerText = saved ? (isPS ? 'خوندي' : 'Saved') : (isPS ? 'خوندي کړئ' : 'Tap ♡');
        }
        if (els.readCount) {
            const read = STATE.read.length;
            els.readCount.innerText = read || '—';
            const readLabel = els.readCount.closest('.stat-item')?.querySelector('.stat-label');
            const isPS = isPashtoMode();
            if (readLabel) readLabel.innerText = read ? (isPS ? 'لوستل شوي' : 'Read') : (isPS ? 'پیل کړئ' : 'Start');
        }

        // Update progress ring
        const ring = document.getElementById('readProgressRing');
        if (ring) {
            const total = 63;
            const read = STATE.read.length;
            const circumference = 2 * Math.PI * 22;
            const offset = circumference - (read / total) * circumference;
            ring.style.strokeDashoffset = offset;
        }

        const summary = document.getElementById('homeProgressSummary');
        if (summary) {
            const isPS = isPashtoMode();
            const readToday = STATE.read.length;
            const quranLastRead = (() => {
                try { return JSON.parse(localStorage.getItem('crown_quran_last_read') || 'null'); }
                catch (_) { return null; }
            })();
            const quranStreak = getQuranStreakForDisplay();
            const quranLabel = quranLastRead?.surahName
                ? quranLastRead.surahName
                : (isPS ? 'نه شته' : 'None');

            summary.textContent = isPS
                ? `د نن لوستل شوې دعاګانې: ${localizeDigits(readToday)} · د قرآن لړۍ: ${localizeDigits(quranStreak)} · وروستی: ${quranLabel}`
                : `Duas read today: ${readToday} · Quran streak: ${quranStreak} · Last: ${quranLabel}`;
        }

            refreshHomeDashboardProgress();
            renderDuasBookmarksSection();
    }
    window.updateStats = updateStats;

    function getDashboardText() {
        if (isPashtoMode()) {
            return {
                appTitle: 'فلاح',
                warmGreeting: 'السلام عليكم',
                nextPrayer: 'راتلونکی لمونځ',
                nowPrefix: 'اوس',
                inPrefix: 'په',
                continue: 'دوام',
                continueKicker: 'لوستل دوام کړئ',
                todayPrayerTimes: 'د نن د لمانځه وختونه',
                duasToday: 'نن دعاګانې',
                streak: 'لړۍ',
                days: 'ورځې',
                quranStreakTitle: 'د قرآن لړۍ',
                quranStreakPrompt: 'نن یو آیت ولولئ او لړۍ پیل کړئ.',
                quranStreakKeepGoing: 'سبا هم ولولئ چې لړۍ ژوندۍ پاتې شي.',
                quran: 'قرآن',
                duas: 'دعاګانې',
                tasbeeh: 'تسبیح',
                qibla: 'قبله',
                bookmarked: 'خوندي دعاګانې',
                searchPlaceholder: 'دعا ولټوئ...',
                tabHome: 'کور',
                tabQuran: 'قرآن',
                tabDuas: 'دعاګانې',
                tabMore: 'نور',
                more: 'نور',
                features: 'ځانګړنې',
                preferences: 'تنظیمات',
                appSection: 'اپ',
                progress: 'زما پرمختګ',
                prayerTimes: 'د لمانځه وختونه',
                qiblaDirection: 'د قبلې لوری',
                tasbeehCounter: 'تسبیح شمېرونکی',
                etiquette: 'د دعا آداب',
                language: 'ژبه',
                theme: 'بڼه',
                font: 'د لیک کچه',
                about: 'په اړه',
                share: 'اپ شریکه کړئ',
                rate: 'اپ درجه بندي کړئ',
                tipLabel: 'لارښوونه ✨',
                hadithOfDay: 'د ورځې حدیث ✨',
                morningDuas: 'د سهار دعاګانې — خپله ورځ پیل کړئ',
                eveningDuas: 'د ماښام دعاګانې',
                fridayKahf: 'سورة الکهف ولولئ',
                continueQuran: 'د قرآن دوام',
                suggestedDua: 'وړاندیز شوې دعا',
                suggestedDuaKicker: 'د دې وخت لپاره',
                openDua: 'پرانیزه',
                duaOfDay: 'د ورځې دعا',
                progressHeading: 'زما پرمختګ',
                quranProgress: 'قرآن',
                ayahLabel: 'آیت',
                duasReadToday: 'نن لوستل شوې دعاګانې',
                tasbeehToday: 'د نن تسبیح',
                of: 'له'
            };
        }

        return {
            appTitle: 'Falah',
            warmGreeting: 'Assalamu Alaikum',
            nextPrayer: 'Next Prayer',
            nowPrefix: 'NOW',
            inPrefix: 'in',
            continue: 'Continue',
            continueKicker: 'CONTINUE READING',
            todayPrayerTimes: 'Today Prayer Times',
            duasToday: 'Duas today',
            streak: 'Streak',
            days: 'days',
            quranStreakTitle: 'Quran Streak',
            quranStreakPrompt: 'Read one ayah today to start.',
            quranStreakKeepGoing: 'Read again tomorrow to keep the streak alive.',
            quran: 'Quran',
            duas: 'Duas',
            tasbeeh: 'Tasbeeh',
            qibla: 'Qibla',
            bookmarked: 'Bookmarked Duas',
            searchPlaceholder: 'Search duas...',
            tabHome: 'Home',
            tabQuran: 'Quran',
            tabDuas: 'Duas',
            tabMore: 'More',
            more: 'More',
            features: 'Features',
            preferences: 'Preferences',
            appSection: 'App',
            progress: 'My Progress',
            prayerTimes: 'Prayer Times',
            qiblaDirection: 'Qibla Direction',
            tasbeehCounter: 'Tasbeeh Counter',
            etiquette: 'Etiquette of Dua',
            language: 'Language',
            theme: 'Theme',
            font: 'Font Size',
            about: 'About',
            share: 'Share App',
            rate: 'Rate App',
            tipLabel: 'Tip ✨',
            hadithOfDay: 'Hadith of the Day ✨',
            morningDuas: 'Morning Duas — Start your day',
            eveningDuas: 'Evening Duas',
            fridayKahf: 'Read Surah Al-Kahf',
            continueQuran: 'Continue Quran',
            suggestedDua: 'Suggested Dua',
            suggestedDuaKicker: 'FOR THIS MOMENT',
            openDua: 'Open',
            duaOfDay: 'Dua of the Day',
            progressHeading: 'My Progress',
            quranProgress: 'Quran',
            ayahLabel: 'Ayah',
            duasReadToday: 'Duas read today',
            tasbeehToday: 'Tasbeeh today',
            of: 'of'
        };
    }

    function refreshHomeDashboardProgress() {
        const ring = document.getElementById('dashboardRingFill');
        const ringText = document.getElementById('dashboardRingText');
        const progressSub = document.getElementById('dashboardProgressSub');
        const progressTitle = document.getElementById('dashboardProgressTitle');
        if (!ring || !ringText || !progressSub || !progressTitle) return;

        const ui = getDashboardText();
        const goal = 5;
        const readToday = Math.min(STATE.read.length, goal);
        const circumference = 2 * Math.PI * 16;
        const ratio = Math.max(0, Math.min(1, readToday / goal));
        ring.style.strokeDasharray = `${circumference}`;
        ring.style.strokeDashoffset = `${circumference - (circumference * ratio)}`;
        ringText.textContent = `${localizeDigits(readToday)}/${localizeDigits(goal)}`;
        progressTitle.textContent = ui.duasToday;
        progressSub.textContent = `${ui.streak}: ${localizeDigits(STATE.streak)} ${ui.days}`;
    }

    let dashboardTipInterval = null;
    let dashboardTipIndex = -1;

    function getDailyTips() {
        return isPashtoMode()
            ? [
                '✨ لارښوونه: د دعا پر مهال خپل لاسونه پورته کړئ',
                '✨ لارښوونه: لومړی د الله ستاینه وکړئ بیا غوښتنه وکړئ',
                '✨ لارښوونه: پر نبي ﷺ درود ووایئ',
                '✨ لارښوونه: د سحر او ماښام اذکار مه هېروئ',
                '✨ لارښوونه: د اړتیا تر څنګ د امت لپاره هم دعا وکړئ',
                '✨ لارښوونه: د قبلې خوا ته په سکون ناست دعا وکړئ',
                '✨ لارښوونه: دعا په یقین او عاجزۍ سره وکړئ'
            ]
            : [
                '✨ Tip: Raise your hands when making dua',
                '✨ Tip: Begin with praising Allah before asking',
                '✨ Tip: Send salawat upon the Prophet ﷺ',
                '✨ Tip: Keep your morning and evening adhkar consistent',
                '✨ Tip: Make dua for the Ummah along with your needs',
                '✨ Tip: Face the Qibla and ask with calmness',
                '✨ Tip: Ask with certainty that Allah responds'
            ];
    }

    function formatDashboardDate() {
        const isPS = isPashtoMode();
        const gregLocale = isPS ? 'ps-AF' : 'en-US';
        const now = new Date();
        try {
            const arabicMonthRaw = new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura', {
                month: 'long'
            }).format(now);
            const hijriDayRaw = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
                day: 'numeric'
            }).format(now);
            const hijriYearRaw = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
                year: 'numeric'
            }).format(now);

            const normalizeArabicMonthKey = (value) => String(value || '')
                .trim()
                .replace(/\u0640/g, '')
                .replace(/\s+/g, ' ')
                .replace(/أ/g, 'ا')
                .replace(/إ/g, 'ا')
                .replace(/آ/g, 'ا')
                .replace(/ى/g, 'ي');

            const monthMapEnglish = {
                'محرم': 'Muharram',
                'صفر': 'Safar',
                'ربيع الاول': 'Rabi al-Awwal',
                'ربيع الاخر': 'Rabi al-Thani',
                'جمادي الاولي': 'Jumada al-Ula',
                'جمادي الاخره': 'Jumada al-Thani',
                'رجب': 'Rajab',
                'شعبان': 'Sha\'ban',
                'رمضان': 'Ramadan',
                'شوال': 'Shawwal',
                'ذو القعده': 'Dhu al-Qi\'dah',
                'ذو الحجه': 'Dhu al-Hijjah'
            };

            const monthMapPashto = {
                'محرم': 'محرم',
                'صفر': 'صفر',
                'ربيع الاول': 'ربیع الاول',
                'ربيع الاخر': 'ربیع الثانی',
                'جمادي الاولي': 'جمادی الاولی',
                'جمادي الاخره': 'جمادی الثانی',
                'رجب': 'رجب',
                'شعبان': 'شعبان',
                'رمضان': 'رمضان',
                'شوال': 'شوال',
                'ذو القعده': 'ذوالقعده',
                'ذو الحجه': 'ذوالحجه'
            };

            const monthKey = normalizeArabicMonthKey(arabicMonthRaw);
            const monthName = isPS
                ? (monthMapPashto[monthKey] || arabicMonthRaw)
                : (monthMapEnglish[monthKey] || arabicMonthRaw);

            const hijriDay = String(hijriDayRaw || '').replace(/\D+/g, '') || hijriDayRaw;
            const hijriYear = String(hijriYearRaw || '').replace(/\s*(AH|BC|هـ)/gi, '').replace(/\D+/g, '') || hijriYearRaw;

            const greg = new Intl.DateTimeFormat(gregLocale, {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            }).format(now);

            const pashtoGregorianMonths = {
                january: 'جنوري',
                february: 'فبروري',
                march: 'مارچ',
                april: 'اپریل',
                may: 'مۍ',
                june: 'جون',
                july: 'جولای',
                august: 'اګست',
                september: 'سپتمبر',
                october: 'اکتوبر',
                november: 'نومبر',
                december: 'دسمبر'
            };

            const localizePashtoGregorian = (value) => {
                const cleaned = String(value || '').trim();
                const match = cleaned.match(/^([^\d\s,،]+)\s+([\d۰-۹]+)[,،]?\s*([\d۰-۹]+)$/u);
                if (!match) return localizeDigits(cleaned);
                const monthEn = match[1].toLowerCase();
                const day = localizeDigits(match[2]);
                const year = localizeDigits(match[3]);
                const monthPs = pashtoGregorianMonths[monthEn] || match[1];
                return `${monthPs} ${day}، ${year}`;
            };

            if (isPS) {
                const hijriPart = `${monthName} ${localizeDigits(hijriDay)}، ${localizeDigits(hijriYear)}`;
                const gregPart = localizePashtoGregorian(greg);
                return `<span dir="rtl">${hijriPart} · ${gregPart}</span>`;
            }
            return `${monthName} ${hijriDay}, ${hijriYear} · ${greg}`;
        } catch (_) {
            const hijriFallback = isPS ? 'هجري نېټه' : 'Hijri date';
            const gregFallback = new Date().toLocaleDateString(gregLocale, {
                month: 'long', day: 'numeric', year: 'numeric'
            });
            if (isPS) {
                return `<span dir="rtl">${hijriFallback} · ${localizeDigits(gregFallback)}</span>`;
            }
            return `${hijriFallback} · ${gregFallback}`;
        }
    }

    function refreshHomeDashboardGreeting() {
        const greeting = document.getElementById('dashboardGreeting');
        const dateEl = document.getElementById('dashboardDate');
        if (!greeting || !dateEl) return;

        const hour = new Date().getHours();
        const phase = hour < 5
            ? 'predawn'
            : (hour < 17 ? 'daytime' : (hour < 20 ? 'evening' : 'night'));
        if (document.body) {
            document.body.setAttribute('data-day-phase', phase);
        }
        const ui = getDashboardText();
        greeting.textContent = ui.warmGreeting;
        greeting.setAttribute('aria-hidden', 'false');
        greeting.classList.remove('dashboard-greeting-enter');
        // Reflow to restart animation when language/time segment changes.
        void greeting.offsetWidth;
        greeting.classList.add('dashboard-greeting-enter');

        const formattedDate = formatDashboardDate();
        if (isPashtoMode()) dateEl.innerHTML = formattedDate;
        else dateEl.textContent = formattedDate;
    }

    function getSmartSuggestion() {
        const ui = getDashboardText();
        const isPS = isPashtoMode();
        const lastRead = (() => {
            try { return JSON.parse(localStorage.getItem('crown_quran_last_read') || 'null'); }
            catch (_) { return null; }
        })();

        const resolveSurahNameForDashboard = (payload) => {
            const surahNo = Number(payload?.surahNumber || 0);
            const savedNameRaw = String(payload?.surahName || '').trim();
            const genericEnglish = /^surah\s*[\d۰-۹]+$/i.test(savedNameRaw);
            const genericPashto = /^سورت\s*[\d۰-۹]+$/u.test(savedNameRaw);
            const genericArabic = /^سورة\s*[\d۰-۹]+$/u.test(savedNameRaw);
            const hasSpecificSavedName = !!savedNameRaw && !genericEnglish && !genericPashto && !genericArabic;

            const meta = surahNo ? getCurrentSurahMetaByNumber(surahNo) : null;
            const metaName = meta
                ? (isPS ? cleanSurahArabicName(meta.name) : String(meta.englishName || '').trim())
                : '';

            const fallbackNames = {
                1: { en: 'Al-Faatiha', ar: 'الفاتحة' },
                2: { en: 'Al-Baqarah', ar: 'البقرة' },
                3: { en: 'Aal-i-Imraan', ar: 'آل عمران' },
                4: { en: 'An-Nisaa', ar: 'النساء' },
                36: { en: 'Ya-Sin', ar: 'يس' },
                55: { en: 'Ar-Rahman', ar: 'الرحمن' },
                67: { en: 'Al-Mulk', ar: 'الملك' },
                112: { en: 'Al-Ikhlaas', ar: 'الإخلاص' },
                113: { en: 'Al-Falaq', ar: 'الفلق' },
                114: { en: 'An-Naas', ar: 'الناس' }
            };

            const fallbackName = surahNo
                ? (isPS ? fallbackNames[surahNo]?.ar : fallbackNames[surahNo]?.en)
                : '';
            const resolvedName = hasSpecificSavedName
                ? savedNameRaw
                : (metaName || fallbackName || savedNameRaw);

            const surahPrefix = isPS ? 'سورت' : 'Surah';
            const genericLabel = surahNo ? `${surahPrefix} ${localizeDigits(surahNo)}` : '';
            const shouldShowNumberAndName = !hasSpecificSavedName && !!genericLabel && !!resolvedName && resolvedName !== genericLabel;

            return {
                resolvedName: resolvedName || genericLabel || (isPS ? 'سورت غوره کړئ' : 'Pick a Surah'),
                detailsPrefix: shouldShowNumberAndName
                    ? `${genericLabel} · ${resolvedName}`
                    : (resolvedName || genericLabel)
            };
        };

        if (lastRead?.surahNumber) {
            const ayah = Number(lastRead.ayahNumber || 1);
            const resolved = resolveSurahNameForDashboard(lastRead);
            return {
                kicker: ui.continueKicker,
                surah: resolved.resolvedName,
                ayah,
                ayahDisplay: `${resolved.detailsPrefix} · ${ui.ayahLabel} ${localizeDigits(ayah)}`,
                action: () => {
                    switchTab('quran');
                    openQuranSurah(lastRead.surahNumber, ayah);
                }
            };
        }
        return {
            kicker: ui.continueKicker,
            surah: isPashtoMode() ? 'سورت غوره کړئ' : 'Pick a Surah',
            ayah: 1,
            ayahDisplay: isPashtoMode() ? `د سورتونو لېست پرانیزئ · ${ui.ayahLabel} ${localizeDigits(1)}` : `Open the surah list · ${ui.ayahLabel} ${localizeDigits(1)}`,
            action: () => switchTab('quran')
        };
    }

    function refreshHomeNextPrayerCard() {
        const label = document.getElementById('dashboardPrayerLabel');
        const name = document.getElementById('dashboardPrayerName');
        const time = document.getElementById('dashboardPrayerTime');
        const countdown = document.getElementById('dashboardPrayerCountdown');
        const location = document.getElementById('dashboardPrayerLocation');
        const card = document.getElementById('dashboardNextPrayerCard');
        if (!label || !name || !time || !countdown || !location || !card) return;

        const ui = getDashboardText();
        label.textContent = ui.nextPrayer;
        const loc = (() => {
            try { return JSON.parse(localStorage.getItem('crown_location') || 'null'); }
            catch (_) { return null; }
        })();
        const cityText = loc?.city || (isPashtoMode() ? 'نامعلوم' : 'Unknown');
        location.textContent = cityText;

        if (!prayerTimesData) {
            name.textContent = '--';
            time.textContent = '--:--';
            countdown.textContent = '--';
            card.classList.remove('is-now');
            card.style.setProperty('--prayer-progress', '0%');
            return;
        }

        const now = new Date();
        const current = getCurrentPrayer(now);
        const next = getNextPrayer(now);
        const currentStart = current ? prayerTimesData[current] : null;
        const nextStart = next ? prayerTimesData[next] : null;
        const withinNow = currentStart && now >= currentStart && now - currentStart < 15 * 60 * 1000;

        if (withinNow && current) {
            name.textContent = getPrayerLabel(current);
            time.textContent = formatDisplayTime(currentStart, 'dashboard-now');
            countdown.textContent = `${ui.nowPrefix} — ${getPrayerLabel(current)}`;
            card.classList.add('is-now');
            card.style.setProperty('--prayer-progress', '100%');
            return;
        }

        let nextTarget = nextStart;
        if (next === 'fajr' && nextStart && now >= nextStart) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const cached = localStorage.getItem('crown_location');
            if (cached && typeof adhan !== 'undefined') {
                try {
                    const loc = JSON.parse(cached);
                    const coords = new adhan.Coordinates(loc.lat, loc.lng);
                    const params = adhan.CalculationMethod.MuslimWorldLeague();
                    params.madhab = adhan.Madhab.Hanafi;
                    const tomorrowTimes = new adhan.PrayerTimes(coords, tomorrow, params);
                    nextTarget = tomorrowTimes.fajr;
                } catch (_) {
                    nextTarget = new Date(nextStart.getTime() + 24 * 60 * 60 * 1000);
                }
            } else {
                nextTarget = new Date(nextStart.getTime() + 24 * 60 * 60 * 1000);
            }
        }

        while (nextTarget && nextTarget <= now) {
            nextTarget = new Date(nextTarget.getTime() + 24 * 60 * 60 * 1000);
        }

        card.classList.remove('is-now');
        name.textContent = getPrayerLabel(next);
        if (!nextTarget) {
            time.textContent = '--:--';
            countdown.textContent = '--';
            card.style.setProperty('--prayer-progress', '0%');
            return;
        }
        time.textContent = formatDisplayTime(nextTarget, 'dashboard-next');
        const diffMs = Math.max(0, nextTarget - now);
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        countdown.textContent = isPashtoMode()
            ? `په ${localizeDigits(h)} ساعته ${localizeDigits(m)} دقیقو کې`
            : `${ui.inPrefix} ${h}h ${m}m`;

        if (currentStart && nextTarget > currentStart) {
            const ratio = Math.max(0, Math.min(1, (now - currentStart) / (nextTarget - currentStart)));
            card.style.setProperty('--prayer-progress', `${Math.round(ratio * 100)}%`);
        } else {
            card.style.setProperty('--prayer-progress', '0%');
        }
    }

    function getPrayerStripLabel(prayerName) {
        const localized = getPrayerLabel(prayerName);
        if (isPashtoMode()) return localized;
        const map = {
            fajr: 'Fajr',
            dhuhr: 'Dhuhr',
            asr: 'Asr',
            maghrib: 'Maghrib',
            isha: 'Isha'
        };
        return map[prayerName] || localized;
    }

    function refreshHomePrayerStrip() {
        const card = document.getElementById('dashboardPrayerStripCard');
        if (!card) return;
        const ui = getDashboardText();
        const title = document.getElementById('dashboardPrayerStripTitle');
        if (title) title.textContent = ui.todayPrayerTimes;

        const names = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        const now = new Date();
        const current = prayerTimesData ? getCurrentPrayer(now) : null;
        const next = prayerTimesData ? getNextPrayer(now) : null;

        names.forEach((prayerName) => {
            const item = document.getElementById(`dashboardPrayerStrip-${prayerName}`);
            const labelEl = document.getElementById(`dashboardPrayerStripName-${prayerName}`);
            const timeEl = document.getElementById(`dashboardPrayerStripTime-${prayerName}`);
            if (!item || !labelEl || !timeEl) return;

            const at = prayerTimesData?.[prayerName] || null;
            labelEl.textContent = getPrayerStripLabel(prayerName);
            timeEl.textContent = at ? formatDisplayTime(at, 'dashboard-strip') : '--:--';

            item.classList.remove('is-current', 'is-next', 'is-past');
            if (prayerName === current) item.classList.add('is-current');
            else if (prayerName === next) item.classList.add('is-next');
            else if (at && now >= at && !(prayerName === 'fajr' && next === 'fajr')) item.classList.add('is-past');
        });
    }

    function refreshHomeSmartSuggestion() {
        const sub = document.getElementById('dashboardSuggestionSub');
        const ayah = document.getElementById('dashboardSuggestionAyah');
        const cta = document.getElementById('dashboardSuggestionCta');
        const kicker = document.getElementById('dashboardSuggestionKicker');
        if (!sub || !cta) return;
        const ui = getDashboardText();
        const suggestion = getSmartSuggestion();
        if (kicker) kicker.textContent = suggestion.kicker || ui.continueKicker;
        sub.textContent = suggestion.surah || '';
        if (ayah) ayah.textContent = suggestion.ayahDisplay || `${ui.ayahLabel} ${localizeDigits(suggestion.ayah || 1)}`;
        cta.textContent = ui.continue;
        window.__dashboardSuggestionAction = suggestion.action;
    }

    function resolveDashboardSuggestedDuaId(preferredId, category) {
        const preferred = Number(preferredId || 0);
        if (preferred && document.querySelector(`#duaListSection .dua-card[data-id="${preferred}"]`)) return preferred;
        const byCategory = category
            ? document.querySelector(`#duaListSection .dua-card[data-categories*="${category}"]`)
            : null;
        const resolved = Number(byCategory?.getAttribute('data-id') || 0);
        if (resolved) return resolved;
        return preferred || 1;
    }

    function getDashboardSuggestedDua() {
        const ui = getDashboardText();
        const period = getTimePeriodFromPrayers() || (() => {
            const hour = new Date().getHours();
            if (hour < 6) return 'latenight';
            if (hour < 12) return 'morning';
            if (hour < 17) return 'dhuhr';
            if (hour < 20) return 'maghrib';
            return 'isha';
        })();

        const options = {
            fajr: {
                category: 'morning-evening',
                preferredId: 34,
                title: isPashtoMode() ? 'د سهار اذکار' : 'Morning Adhkar',
                sub: isPashtoMode() ? 'ورځ د الله په یاد سره پیل کړئ.' : 'Start your day with remembrance.'
            },
            morning: {
                category: 'morning-evening',
                preferredId: 34,
                title: isPashtoMode() ? 'د سهار دعا' : 'Morning Protection Dua',
                sub: isPashtoMode() ? 'د نن ورځې لپاره خپل زړه پیاوړی کړئ.' : 'Ground your day with morning protection.'
            },
            dhuhr: {
                category: 'guidance',
                preferredId: 10,
                title: isPashtoMode() ? 'د علم دعا' : 'Dua for Beneficial Knowledge',
                sub: isPashtoMode() ? 'د ورځې په منځ کې نیت تازه کړئ.' : 'Reset your intention in the middle of the day.'
            },
            asr: {
                category: 'wellbeing',
                preferredId: 24,
                title: isPashtoMode() ? 'د زړه سکون دعا' : 'Dua for Ease and Relief',
                sub: isPashtoMode() ? 'ستړیا د دعا په برکت سپکه کړئ.' : 'Ease stress and fatigue before evening.'
            },
            maghrib: {
                category: 'morning-evening',
                preferredId: 35,
                title: isPashtoMode() ? 'د ماښام اذکار' : 'Evening Adhkar',
                sub: isPashtoMode() ? 'ماښام د توکل او ساتنې سره پای ته ورسوئ.' : 'Close the day with trust and protection.'
            },
            isha: {
                category: 'protection',
                preferredId: 6,
                title: isPashtoMode() ? 'د خوب مخکې ساتنه' : 'Before-Sleep Protection',
                sub: isPashtoMode() ? 'له ویده کېدو مخکې درې قلونه ولولئ.' : 'Read the three Quls before sleep.'
            },
            latenight: {
                category: 'forgiveness',
                preferredId: 16,
                title: isPashtoMode() ? 'د بخښنې دعا' : 'Night Forgiveness Dua',
                sub: isPashtoMode() ? 'د شپې د استغفار وخت دی.' : 'A quiet moment for istighfar.'
            }
        };

        const picked = options[period] || options.morning;
        const duaId = resolveDashboardSuggestedDuaId(picked.preferredId, picked.category);
        const cardTitle = document.querySelector(`#duaListSection .dua-card[data-id="${duaId}"] .dua-title`)?.textContent?.trim() || picked.title;

        return {
            kicker: ui.suggestedDuaKicker,
            title: cardTitle || ui.suggestedDua,
            sub: picked.sub,
            cta: ui.openDua,
            action: () => {
                switchTab('duas');
                openDuaViewerAtId(duaId, picked.category || 'all', { pushHistory: true });
            }
        };
    }

    function refreshHomeContextualDuaSuggestion() {
        const kicker = document.getElementById('dashboardDuaSuggestionKicker');
        const title = document.getElementById('dashboardDuaSuggestionTitle');
        const sub = document.getElementById('dashboardDuaSuggestionSub');
        const cta = document.getElementById('dashboardDuaSuggestionCta');
        if (!title || !sub || !cta) return;

        const ui = getDashboardText();
        const suggestion = getDashboardSuggestedDua();
        if (kicker) kicker.textContent = suggestion.kicker || ui.suggestedDuaKicker;
        title.textContent = suggestion.title || ui.suggestedDua;
        sub.textContent = suggestion.sub || '';
        cta.textContent = suggestion.cta || ui.openDua;
        window.__dashboardDuaSuggestionAction = suggestion.action;
    }

    function refreshHomeQuranStreakCard() {
        const title = document.getElementById('dashboardQuranStreakText');
        const sub = document.getElementById('dashboardQuranStreakSub');
        if (!title || !sub) return;

        const ui = getDashboardText();
        const streak = getQuranStreakForDisplay();
        const daysLabel = ui.days;
        title.textContent = `${ui.quranStreakTitle}: ${localizeDigits(streak)} ${daysLabel}`;

        const lastRead = (() => {
            try { return JSON.parse(localStorage.getItem('crown_quran_last_read') || 'null'); }
            catch (_) { return null; }
        })();
        const lastSurah = String(lastRead?.surahName || '').trim();

        if (streak > 0) {
            sub.textContent = lastSurah
                ? (isPashtoMode() ? `وروستی: ${lastSurah}` : `Last read: ${lastSurah}`)
                : ui.quranStreakKeepGoing;
            return;
        }
        sub.textContent = ui.quranStreakPrompt;
    }

    function refreshHomeDailyTip() {
        const tipEl = document.getElementById('dashboardTipCard');
        const tipText = document.getElementById('dashboardTipText');
        if (!tipEl) return;
        const tips = getDailyTips();
        if (!tips.length) return;

        if (dashboardTipIndex < 0 || dashboardTipIndex >= tips.length) {
            const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
            dashboardTipIndex = dayOfYear % tips.length;
        }

        tipEl.classList.add('tip-fade-out');
        setTimeout(() => {
            if (tipText) tipText.textContent = tips[dashboardTipIndex].replace(/^✨\s*/u, '');
            else tipEl.textContent = tips[dashboardTipIndex];
            tipEl.classList.remove('tip-fade-out');
            tipEl.classList.add('tip-fade-in');
            setTimeout(() => tipEl.classList.remove('tip-fade-in'), 280);
        }, 170);
    }

    function rotateHomeDailyTip() {
        const tips = getDailyTips();
        if (!tips.length) return;
        dashboardTipIndex = (dashboardTipIndex + 1) % tips.length;
        refreshHomeDailyTip();
    }

    function getDashboardHadiths() {
        return isPashtoMode()
            ? [
                { text: 'الله ته تر ټولو محبوب عمل هغه دی چې دوام ولري که لږ هم وي.', source: 'صحیح بخاري 6465' },
                { text: 'د خلکو له منځه غوره هغه څوک دی چې خلکو ته ډېر ګټور وي.', source: 'المعجم الاوسط 5787' },
                { text: 'پاکي د ایمان نیمایي برخه ده.', source: 'صحیح مسلم 223' },
                { text: 'نرمښت په هر څه کې ښکلا راولي.', source: 'صحیح مسلم 2594' },
                { text: 'تبسم دې د ورور په مخ کې صدقه ده.', source: 'جامع ترمذي 1956' },
                { text: 'رحم کوونکو باندې رحمن رحم کوي.', source: 'جامع ترمذي 1924' },
                { text: 'مؤمن مؤمن ته د ودانۍ په څېر دی؛ یو بل پیاوړی کوي.', source: 'صحیح بخاري 481' },
                { text: 'الله د بندګانو لپاره اساني غواړي، سختي نه غواړي.', source: 'صحیح بخاري 39' },
                { text: 'قوي مؤمن د الله په نزد محبوب او غوره دی.', source: 'صحیح مسلم 2664' },
                { text: 'دعا عبادت دی.', source: 'جامع ترمذي 2969' },
                { text: 'د الله په یاد سره زړونه ډاډمنېږي.', source: 'صحیح تفسیر معنا' },
                { text: 'چا چې پر ما یو ځل درود ووايه، الله پرې لس رحمتونه نازلوي.', source: 'صحیح مسلم 408' },
                { text: 'بهتره صدقه هغه ده چې خپلوانو ته وشي.', source: 'سنن نسائي 2582' },
                { text: 'له تاسو هېڅوک مؤمن نه شي کېدای تر څو خپل ورور ته هماغه خوښ نه کړي چې ځان ته یې خوښوي.', source: 'صحیح بخاري 13' },
                { text: 'حیا د ایمان څانګه ده.', source: 'صحیح مسلم 35' },
                { text: 'غوسه مه کوه.', source: 'صحیح بخاري 6116' },
                { text: 'الله ښکلی دی او ښکلا خوښوي.', source: 'صحیح مسلم 91' },
                { text: 'سحرۍ وکړئ؛ په سحرۍ کې برکت دی.', source: 'صحیح بخاري 1923' },
                { text: 'په جنت کې یوه دروازه د روژتیانو لپاره ده: الريان.', source: 'صحیح بخاري 1896' },
                { text: 'ښه خبره هم صدقه ده.', source: 'صحیح بخاري 2989' },
                { text: 'سلام خپور کړئ، یو بل سره مینه پیدا کېږي.', source: 'صحیح مسلم 54' },
                { text: 'نیتونه په عملونو کې بنسټ دي.', source: 'صحیح بخاري 1' },
                { text: 'د مور پلار رضایت کې د الله رضایت دی.', source: 'جامع ترمذي 1899' },
                { text: 'ریښتینولي نېکۍ ته بیایي.', source: 'صحیح بخاري 6094' },
                { text: 'امانت ادا کوه د هغه چا امانت چې تا ته یې سپارلی.', source: 'جامع ترمذي 1264' },
                { text: 'تر ټولو ښه خلک هغه دي چې قرآن زده کوي او ور زده کوي.', source: 'صحیح بخاري 5027' },
                { text: 'په دنیا کې زاهد اوسئ، الله به مو خوښ کړي.', source: 'سنن ابن ماجه 4102' },
                { text: 'دوه نعمتونه دي چې ډېری خلک پکې تاواني دي: روغتیا او فرصت.', source: 'صحیح بخاري 6412' },
                { text: 'د سهار او ماښام اذکار د زړه ساتنه کوي.', source: 'نبوي لارښوونې' },
                { text: 'د مسلمان ورور عیب مه لټوئ.', source: 'جامع ترمذي 2032' }
            ]
            : [
                { text: 'The most beloved deeds to Allah are those done consistently, even if they are small.', source: 'Sahih al-Bukhari 6465' },
                { text: 'The best of people are those most beneficial to others.', source: 'Al-Mu\'jam al-Awsat 5787' },
                { text: 'Purity is half of faith.', source: 'Sahih Muslim 223' },
                { text: 'Gentleness beautifies whatever it enters.', source: 'Sahih Muslim 2594' },
                { text: 'Your smile for your brother is charity.', source: 'Jami\' at-Tirmidhi 1956' },
                { text: 'The Merciful shows mercy to those who are merciful.', source: 'Jami\' at-Tirmidhi 1924' },
                { text: 'A believer to another believer is like a building, one part strengthening another.', source: 'Sahih al-Bukhari 481' },
                { text: 'Allah loves ease for this Ummah, not hardship.', source: 'Sahih al-Bukhari 39' },
                { text: 'The strong believer is more beloved to Allah than the weak believer.', source: 'Sahih Muslim 2664' },
                { text: 'Supplication is worship.', source: 'Jami\' at-Tirmidhi 2969' },
                { text: 'Whoever sends one prayer upon me, Allah sends ten upon him.', source: 'Sahih Muslim 408' },
                { text: 'The best charity is that given to relatives in need.', source: 'Sunan an-Nasa\'i 2582' },
                { text: 'None of you truly believes until he loves for his brother what he loves for himself.', source: 'Sahih al-Bukhari 13' },
                { text: 'Modesty is a branch of faith.', source: 'Sahih Muslim 35' },
                { text: 'Do not get angry.', source: 'Sahih al-Bukhari 6116' },
                { text: 'Allah is beautiful and loves beauty.', source: 'Sahih Muslim 91' },
                { text: 'Take suhoor, for in suhoor there is blessing.', source: 'Sahih al-Bukhari 1923' },
                { text: 'In Paradise there is a gate called Ar-Rayyan for those who fast.', source: 'Sahih al-Bukhari 1896' },
                { text: 'A good word is charity.', source: 'Sahih al-Bukhari 2989' },
                { text: 'Spread salam among yourselves.', source: 'Sahih Muslim 54' },
                { text: 'Actions are judged by intentions.', source: 'Sahih al-Bukhari 1' },
                { text: 'The pleasure of Allah lies in the pleasure of the parents.', source: 'Jami\' at-Tirmidhi 1899' },
                { text: 'Truthfulness leads to righteousness.', source: 'Sahih al-Bukhari 6094' },
                { text: 'Return the trust to the one who entrusted you.', source: 'Jami\' at-Tirmidhi 1264' },
                { text: 'The best among you are those who learn the Quran and teach it.', source: 'Sahih al-Bukhari 5027' },
                { text: 'Be detached from worldly excess, and Allah will love you.', source: 'Sunan Ibn Majah 4102' },
                { text: 'Two blessings many people lose: health and free time.', source: 'Sahih al-Bukhari 6412' },
                { text: 'Morning and evening remembrance protects the heart.', source: 'Prophetic guidance' },
                { text: 'Do not search for your Muslim brother\'s faults.', source: 'Jami\' at-Tirmidhi 2032' },
                { text: 'The believer is the mirror of his brother.', source: 'Abu Dawud 4918' }
            ];
    }

    function refreshDashboardHadithCard() {
        const textEl = document.getElementById('dashboardHadithText');
        const sourceEl = document.getElementById('dashboardHadithSource');
        if (!textEl || !sourceEl) return;
        const rows = getDashboardHadiths();
        if (!rows.length) return;
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        const current = rows[dayOfYear % rows.length];
        textEl.textContent = current.text;
        sourceEl.textContent = current.source;
    }

    function getTasbeehTodayCount() {
        const key = new Date().toISOString().slice(0, 10);
        let counts = {};
        try {
            counts = JSON.parse(localStorage.getItem('crown_tasbeeh_daily_counts') || '{}') || {};
        } catch (_) {
            counts = {};
        }
        return Number(counts[key] || 0);
    }

    function refreshDashboardProgressSummaryCard() {
        const ui = getDashboardText();
        const heading = document.getElementById('dashboardProgressHeading');
        const quranRow = document.getElementById('dashboardProgressQuran');
        const duasRow = document.getElementById('dashboardProgressDuas');
        const tasbeehRow = document.getElementById('dashboardProgressTasbeeh');
        const bar = document.getElementById('dashboardProgressBarFill');
        if (!heading || !quranRow || !duasRow || !tasbeehRow || !bar) return;

        heading.textContent = ui.progressHeading;

        const lastRead = (() => {
            try { return JSON.parse(localStorage.getItem('crown_quran_last_read') || 'null'); }
            catch (_) { return null; }
        })();
        const surah = lastRead?.surahName || (isPashtoMode() ? 'الفاتحه' : 'Al-Fatiha');
        const ayahNo = localizeDigits(lastRead?.ayahNumber || 1);
        quranRow.textContent = `${ui.quranProgress}: ${surah}, ${ui.ayahLabel} ${ayahNo}`;

        const readCount = Math.min(STATE.read.length, 63);
        duasRow.textContent = `${ui.duasReadToday}: ${localizeDigits(readCount)} ${ui.of} ${localizeDigits(63)}`;
        const totalLabel = isPashtoMode() ? 'ټول' : 'total';
        tasbeehRow.textContent = `${ui.tasbeehToday}: ${localizeDigits(getTasbeehTodayCount())} ${totalLabel}`;

        const quranProgress = Math.max(0, Math.min(1, Number(lastRead?.ayahNumber || 1) / 286));
        bar.style.width = `${Math.round(quranProgress * 100)}%`;
    }

    window.openDashboardSuggestion = function() {
        if (typeof window.__dashboardSuggestionAction === 'function') {
            window.__dashboardSuggestionAction();
        }
    };

    function bindIntentionalCardTap(card, onActivate, options = {}) {
        if (!card) return;
        const movementThreshold = Number(options.movementThreshold || 10);
        const interceptOnly = options.interceptOnly === true;

        let startX = 0;
        let startY = 0;
        let trackingTouch = false;
        let movedDuringTouch = false;

        card.addEventListener('touchstart', (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            trackingTouch = true;
            movedDuringTouch = false;
            startX = touch.clientX;
            startY = touch.clientY;
        }, { passive: true });

        card.addEventListener('touchmove', (event) => {
            if (!trackingTouch) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            const movedX = Math.abs(touch.clientX - startX);
            const movedY = Math.abs(touch.clientY - startY);
            if (movedX > movementThreshold || movedY > movementThreshold) {
                movedDuringTouch = true;
            }
        }, { passive: true });

        card.addEventListener('touchend', () => {
            card.dataset.ignoreNextTap = movedDuringTouch ? '1' : '0';
            trackingTouch = false;
        }, { passive: true });

        card.addEventListener('touchcancel', () => {
            trackingTouch = false;
            movedDuringTouch = false;
            card.dataset.ignoreNextTap = '0';
        }, { passive: true });

        card.addEventListener('click', (event) => {
            if (card.dataset.ignoreNextTap === '1') {
                card.dataset.ignoreNextTap = '0';
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (interceptOnly) return;

            event.preventDefault();
            event.stopPropagation();
            if (typeof onActivate === 'function') onActivate();
        }, true);
    }

    function bindDashboardSuggestionCard() {
        const card = document.getElementById('dashboardSuggestionCard');
        if (!card || card.dataset.bound === '1') return;

        const trigger = () => {
            card.classList.add('touch-feedback');
            setTimeout(() => card.classList.remove('touch-feedback'), 140);
            window.openDashboardSuggestion();
        };

        card.style.cursor = 'pointer';
        bindIntentionalCardTap(card, trigger);
        card.dataset.bound = '1';
    }

    function bindDashboardDuaSuggestionCard() {
        const card = document.getElementById('dashboardDuaSuggestionCard');
        if (!card || card.dataset.bound === '1') return;

        const trigger = () => {
            card.classList.add('touch-feedback');
            setTimeout(() => card.classList.remove('touch-feedback'), 140);
            if (typeof window.__dashboardDuaSuggestionAction === 'function') {
                window.__dashboardDuaSuggestionAction();
            }
        };

        card.style.cursor = 'pointer';
        bindIntentionalCardTap(card, trigger);
        card.dataset.bound = '1';
    }

    function bindDashboardQuranStreakCard() {
        const card = document.getElementById('dashboardQuranStreakCard');
        if (!card || card.dataset.scrollGuardBound === '1') return;

        // Keep the existing inline onclick navigation, but suppress it during vertical scrolling.
        bindIntentionalCardTap(card, null, { interceptOnly: true });
        card.dataset.scrollGuardBound = '1';
    }

    window.openPrayerFromDashboard = function() {
        openPrayer();
    };

    window.openPrayerQiblaFromDashboard = function() {
        openPrayer();
        setPrayerSubtab('qibla');
    };

    function refreshDashboardLabels() {
        const ui = getDashboardText();
        const ids = [
            ['topBrandText', ui.appTitle],
            ['quickQuranLabel', ui.quran],
            ['quickDuasLabel', ui.duas],
            ['quickTasbeehLabel', ui.tasbeeh],
            ['quickQiblaLabel', ui.qibla],
            ['duasBookmarksTitle', ui.bookmarked],
            ['tabHomeLabel', ui.tabHome],
            ['tabQuranLabel', ui.tabQuran],
            ['tabDuasLabel', ui.tabDuas],
            ['tabMoreLabel', ui.tabMore],
            ['moreFeaturesHeader', ui.features],
            ['morePreferencesHeader', ui.preferences],
            ['moreAppHeader', ui.appSection],
            ['morePrayerLabel', ui.prayerTimes],
            ['moreQiblaLabel', ui.qiblaDirection],
            ['moreTasbeehLabel', ui.tasbeehCounter],
            ['moreEtiquetteLabel', ui.etiquette],
            ['moreProgressLabel', ui.progress],
            ['moreThemeLabel', ui.theme],
            ['moreLanguageLabel', ui.language],
            ['moreFontLabel', ui.font],
            ['moreAboutLabel', ui.about],
            ['moreShareLabel', ui.share],
            ['moreRateLabel', ui.rate],
            ['dashboardTipLabel', ui.tipLabel],
            ['dashboardHadithLabel', ui.hadithOfDay],
            ['dashboardProgressHeading', ui.progressHeading],
            ['dashboardSuggestionKicker', ui.continueKicker],
            ['dashboardPrayerStripTitle', ui.todayPrayerTimes]
        ];
        ids.forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
        syncMorePreferenceControls();
        renderAboutPanelContent();
        const duasSearch = document.getElementById('duasSearchInput');
        if (duasSearch) duasSearch.placeholder = ui.searchPlaceholder;
    }

    function refreshHomeDashboard() {
        refreshDashboardLabels();
        refreshHomeDashboardGreeting();
        refreshHomeNextPrayerCard();
        refreshHomePrayerStrip();
        refreshHomeSmartSuggestion();
        refreshHomeQuranStreakCard();
        refreshHomeContextualDuaSuggestion();
        refreshHomeDailyTip();
        refreshDashboardHadithCard();
        refreshDashboardProgressSummaryCard();
        refreshHomeDashboardProgress();
    }
    window.refreshHomeDashboard = refreshHomeDashboard;

    function initHomeDashboard() {
        refreshHomeDashboard();
        bindDashboardSuggestionCard();
        bindDashboardDuaSuggestionCard();
        bindDashboardQuranStreakCard();
        if (!window.__dashboardRefreshTimer) {
            window.__dashboardRefreshTimer = setInterval(() => {
                refreshHomeNextPrayerCard();
                refreshHomePrayerStrip();
                refreshHomeContextualDuaSuggestion();
            }, 10000);
        }
        if (!dashboardTipInterval) {
            dashboardTipInterval = setInterval(rotateHomeDailyTip, 12000);
        }
    }

    function initDuasTabSearch() {
        const input = document.getElementById('duasSearchInput');
        if (!input || input.dataset.bound === '1') return;

        const getCategoryMatch = (query, category) => {
            if (!query) return true;
            const cards = document.querySelectorAll('#duaListSection .dua-card');
            const needle = query.toLowerCase();
            for (const card of cards) {
                const categories = (card.getAttribute('data-categories') || '').split(',').map(v => v.trim());
                if (category !== 'all' && !categories.includes(category)) continue;
                const haystack = `${card.textContent || ''} ${card.getAttribute('data-keywords') || ''}`.toLowerCase();
                if (haystack.includes(needle)) return true;
            }
            return false;
        };

        const filterCategoryGridByQuery = (query) => {
            const categoryCards = document.querySelectorAll('#categoryGrid .cat-card');
            categoryCards.forEach((card) => {
                const cat = card.getAttribute('data-cat') || 'all';
                const visible = getCategoryMatch(query, cat);
                card.style.display = visible ? '' : 'none';
            });
        };

        input.addEventListener('input', () => {
            const query = (input.value || '').trim();
            filterCategoryGridByQuery(query);
        });

        input.dataset.bound = '1';
    }

    function initFontSizeControls() {
        document.querySelectorAll('.font-increase').forEach((button) => {
            if (button.dataset.bound === '1') return;
            button.addEventListener('click', () => window.adjustFontSize(1));
            button.dataset.bound = '1';
        });
        document.querySelectorAll('.font-decrease').forEach((button) => {
            if (button.dataset.bound === '1') return;
            button.addEventListener('click', () => window.adjustFontSize(-1));
            button.dataset.bound = '1';
        });
    }

    function renderDuasBookmarksSection() {
        const section = document.getElementById('duasBookmarksSection');
        const list = document.getElementById('duasBookmarksList');
        if (!section || !list) return;

        if (!STATE.bookmarks.length) {
            section.hidden = true;
            list.innerHTML = '';
            return;
        }

        section.hidden = false;
        list.innerHTML = STATE.bookmarks.slice(0, 8).map((id) => {
            const title = document.querySelector(`.dua-card[data-id="${id}"] .dua-title`)?.textContent?.trim() || `Dua ${id}`;
            return `<button class="duas-bookmark-chip" onclick="scrollToDua(${id})">${escapeHtml(title)}</button>`;
        }).join('');
    }

    function showToast(msg) {
        // toast lives after the <script> tag, so cache it lazily on first use
        if (!els.toast) els.toast = document.getElementById('toast');
        if (!els.toast) return;
        els.toast.innerText = msg;
        els.toast.classList.add('show');
        setTimeout(() => els.toast.classList.remove('show'), 3000);
    }

    function safeVibrate(pattern) {
        try {
            if (navigator?.vibrate) navigator.vibrate(pattern);
        } catch (_) {}
    }

    function refreshHomeContentData() {
        loadDailyDua();
        updateStats();

        const cached = localStorage.getItem('crown_location');
        if (cached && typeof adhan !== 'undefined') {
            try {
                const loc = JSON.parse(cached);
                calculateAndRenderPrayers(loc.lat, loc.lng);
            } catch (_) {}
        }
    }

    function initHomePullToRefresh() {
        const homePanel = document.getElementById('mainContainer');
        const indicator = document.getElementById('pullRefreshIndicator');
        if (!homePanel || !indicator || homePanel.dataset.pullRefreshBound === '1') return;

        if (isNativeAndroidReminderMode()) {
            indicator.setAttribute('aria-hidden', 'true');
            indicator.style.display = 'none';
            homePanel.dataset.pullRefreshBound = '1';
            return;
        }

        let startY = 0;
        let pulling = false;
        let refreshTriggered = false;
        const threshold = 80;

        homePanel.addEventListener('touchstart', (event) => {
            if (!homePanel.classList.contains('active')) return;
            if (homePanel.scrollTop > 0) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            startY = touch.clientY;
            pulling = true;
            refreshTriggered = false;
            indicator.classList.remove('armed', 'refreshing');
            indicator.classList.add('visible');
        }, { passive: true });

        homePanel.addEventListener('touchmove', (event) => {
            if (!pulling) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            const deltaY = Math.max(0, touch.clientY - startY);
            const translateY = Math.min(80, deltaY * 0.5);
            indicator.style.transform = `translate(-50%, ${translateY}px)`;
            const isArmed = deltaY >= threshold;
            indicator.classList.toggle('armed', isArmed);
            if (isArmed && !refreshTriggered) {
                refreshTriggered = true;
                safeVibrate(10);
            }
        }, { passive: true });

        homePanel.addEventListener('touchend', () => {
            if (!pulling) return;
            pulling = false;
            indicator.style.transform = 'translate(-50%, -12px)';
            if (refreshTriggered) {
                indicator.classList.add('refreshing');
                // Browser/PWA fallback: perform a real reload so all dynamic state is recomputed.
                setTimeout(() => {
                    window.location.reload();
                }, 80);
            } else {
                indicator.classList.remove('visible', 'armed', 'refreshing');
            }
        }, { passive: true });

        homePanel.dataset.pullRefreshBound = '1';
    }

    function checkStreak() {
        const today = new Date().toDateString();
        if (STATE.lastVisit !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (STATE.lastVisit === yesterday.toDateString()) STATE.streak++;
            else STATE.streak = 1;
            STATE.lastVisit = today;
            localStorage.setItem('crown_streak', STATE.streak);
            localStorage.setItem('crown_last_visit', today);
        }
        if (els.streakCount) els.streakCount.innerText = STATE.streak;
        if (els.lastVisit) els.lastVisit.innerText = 'Today';
    }

    function loadDailyDua() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        setTimeout(() => {
            const card = document.querySelector(`.dua-card[data-id="${duaIndex}"]`);
            if (card && els.dailyArabic) {
                els.dailyArabic.innerText = card.querySelector('.arabic-text').innerText;
                els.dailyTranslation.innerText = card.querySelector('.translation').innerText.substring(0, 80) + '...';
                document.getElementById('dailyDua').onclick = function() { scrollToDua(duaIndex); };
            }
        }, 500);
    }

    function loadRoutineDailyDua() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        const card = document.querySelector(`.dua-card[data-id="${duaIndex}"]`);
        const arabicEl = document.getElementById('routineDailyArabic');
        const transEl = document.getElementById('routineDailyTranslation');
        if (card && arabicEl && transEl) {
            arabicEl.innerText = card.querySelector('.arabic-text').innerText;
            const isPS = isPashtoMode();
            let raw = '';
            if (isPS && typeof PS_DUAS !== 'undefined' && PS_DUAS[duaIndex]?.t) {
                raw = String(PS_DUAS[duaIndex].t || '').trim();
            }
            if (!raw) {
                const translationEl = isPS
                    ? (card.querySelector('.translation-ps') || card.querySelector('.translation'))
                    : card.querySelector('.translation');
                raw = translationEl?.innerText?.trim() || '';
            }
            transEl.innerText = raw ? `${raw.substring(0, 110)}...` : '';
        }
    }

        // ===== RANDOM DUA =====
    window.showRandomDua = function() {
        const allIds = getDuaIdsForCategory('all');
        if (!allIds.length) {
            showToast('No duas available');
            return;
        }
        const id = allIds[Math.floor(Math.random() * allIds.length)];
        openDuaViewerAtId(id, 'all', { pushHistory: true });
        showToast(isPashtoMode() ? 'تصادفي دعا' : `🎲 Random Dua #${id}`);
    };

    // ===== SECTION COLLAPSE/EXPAND =====
    window.toggleSection = function(sectionHeader) {
        const isCollapsed = sectionHeader.classList.toggle('collapsed');
        const sectionName = sectionHeader.getAttribute('data-section');
        sectionHeader.setAttribute('aria-expanded', String(!isCollapsed));

        // Update hint text
        const hint = sectionHeader.querySelector('.section-collapse-hint');
        if (hint) {
            hint.textContent = isCollapsed ? 'tap to expand' : 'tap to collapse';
        }

        // Find all cards that belong to this section
        // Walk through siblings until we hit the next section-header
        let nextElement = sectionHeader.nextElementSibling;
        while (nextElement) {
            // Stop if we hit another section header
            if (nextElement.classList.contains('section-header')) break;

            // Toggle dua cards
            if (nextElement.classList.contains('dua-card')) {
                if (isCollapsed) {
                    nextElement.style.display = 'none';
                } else {
                    nextElement.style.display = '';
                    // Re-trigger visibility animation
                    if (!nextElement.classList.contains('visible')) {
                        setTimeout(() => nextElement.classList.add('visible'), 50);
                    }
                }
            }

            nextElement = nextElement.nextElementSibling;
        }

        // Save state
        const collapsedSections = JSON.parse(localStorage.getItem('crown_collapsed_sections') || '[]');
        if (isCollapsed) {
            if (!collapsedSections.includes(sectionName)) {
                collapsedSections.push(sectionName);
            }
        } else {
            const idx = collapsedSections.indexOf(sectionName);
            if (idx !== -1) collapsedSections.splice(idx, 1);
        }
        localStorage.setItem('crown_collapsed_sections', JSON.stringify(collapsedSections));

        showToast(isCollapsed ? `${sectionHeader.querySelector('.section-title').textContent} — Collapsed` : `${sectionHeader.querySelector('.section-title').textContent} — Expanded`);
    };

    // ===== BOTTOM NAV HANDLER =====
        // ===== BOTTOM NAV HANDLER =====
    window.handleBottomNav = function(action, btn) {
        safeVibrate(10);
        scrollActiveViewToTop();

        switch (action) {
            case 'home':
                closeAllPanelsForStateApply();
                switchTab('home');
                backToCategories();
                scrollActiveViewToTop();
                recordInAppRoute(true, { view: IN_APP_VIEWS.HOME, ts: Date.now() });
                break;
            case 'duas':
                closeAllPanelsForStateApply();
                switchTab('duas');
                backToCategories();
                recordInAppRoute(true, { view: IN_APP_VIEWS.DUAS_TAB, ts: Date.now() });
                break;
            case 'quran':
                openQuran();
                break;
            case 'more':
                openMorePanel();
                break;
        }
    };

    window.openMorePanel = function() {
        switchTab('more');
        const morePanel = document.querySelector('.more-panel');
        if (morePanel) morePanel.scrollTop = 0;
        recordInAppRoute(true, {
            view: IN_APP_VIEWS.PANEL,
            panel: 'more'
        });
    };

    window.closeMorePanel = function() {
        switchTab('home');
        recordInAppRoute(false, {
            view: IN_APP_VIEWS.HOME
        });
    };

    window.openPrayerFromMore = function() {
        openPrayer();
    };

    window.openQiblaFromMore = function() {
        openPrayer();
        setPrayerSubtab('qibla');
    };

    window.openAboutFromMore = function() {
        openAboutPanel();
    };

    function syncMorePreferenceControls() {
        const themeSwitch = document.getElementById('moreThemeSwitch');
        if (themeSwitch) themeSwitch.checked = document.documentElement.getAttribute('data-theme') !== 'light';
        const languageSwitch = document.getElementById('moreLanguageSwitch');
        if (languageSwitch) languageSwitch.checked = isPashtoMode();
    }

    function renderAboutPanelContent() {
        const isPS = isPashtoMode();
        const map = {
            aboutAppName: 'Falah — فلاح',
            aboutDescription: 'Your complete Islamic companion app with authentic duas, full Quran with Pashto and English translations, prayer times, Qibla direction, tasbeeh counter, and more.',
            aboutDescriptionPs: 'ستاسو بشپړ اسلامي ملګری اپلیکیشن چې معتبرې دعاګانې، بشپړ قرآن د پښتو او انګلیسي ترجمو سره، د لمانځه وختونه، د قبلې سمت، تسبیح شمېرونکی او نور لري.',
            aboutTagline: 'حي على الفلاح — Come to Success',
            aboutVersion: 'Version: 2.0.17',
            aboutDeveloper: isPS ? 'پراختیاکوونکی: Falah' : 'Developer: Falah',
            aboutCopyright: '© 2026 Falah. All rights reserved.',
            aboutContactLabel: isPS ? 'اړیکه ونیسئ' : 'Contact Us',
            aboutPrivacyLink: isPS ? 'د محرمیت تګلاره' : 'Privacy Policy',
            aboutLicenses: isPS ? 'اوپن سورس لایسنسونه: Adhan.js او د وېب پلاتفورم API ګانې' : 'Open-source libraries: Adhan.js and web platform APIs'
        };
        Object.entries(map).forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
    }

    window.openAboutPanel = function() {
        const ap = document.querySelector('.about-panel');
        if (!ap) return;
        renderAboutPanelContent();
        showAuxPanel('.about-panel');
        ap.scrollTop = 0;
        recordInAppRoute(true, {
            view: IN_APP_VIEWS.PANEL,
            panel: 'about',
            ts: Date.now()
        });
    };

    window.closeAboutPanel = function() {
        openMorePanel();
        recordInAppRoute(false, {
            view: IN_APP_VIEWS.PANEL,
            panel: 'more',
            ts: Date.now()
        });
    };

    window.openContactEmail = function() {
        window.location.href = 'mailto:fallahapp16@gmail.com?subject=Falah App Feedback&body=Assalamu Alaikum,%0A%0A';
    };

    window.rateApp = function() {
        openAppStoreLink(DEFAULT_PLAY_STORE_URL);
    };

    // ===== PROGRESS PANEL =====
    window.openProgress = function() {
        let pp = document.querySelector('.progress-panel');
        if (!pp) {
            pp = document.createElement('div');
            pp.className = 'progress-panel';
            pp.setAttribute('onclick', 'if(event.target===this) closeProgress()');
            pp.innerHTML = `
                <button class="panel-back-btn" onclick="closeProgress()">← Back / ← بیرته</button>
                <div class="progress-panel-content" id="progressPanelContent"></div>`;
            document.body.appendChild(pp);
        }
        enhanceAccessibility();
        renderProgressPanel();
        showAuxPanel('.progress-panel');
        lockScroll();
        recordInAppRoute(true);
    };

    window.closeProgress = function() {
        const pp = document.querySelector('.progress-panel');
        if (pp) pp.classList.remove('active');
        openMorePanel();
        unlockScroll();
        recordInAppRoute(false);
    };

    window.refreshProgressLanguage = function() {
        const pp = document.querySelector('.progress-panel');
        if (!pp) return;
        const active = pp.classList.contains('active');
        const content = document.getElementById('progressPanelContent');
        if (active || (content && content.innerHTML.trim())) renderProgressPanel();
    };

    function renderProgressPanel() {
        const container = document.getElementById('progressPanelContent');
        if (!container) return;
        const isPS = isPashtoMode();
        const psUI = (typeof PS_UI !== 'undefined') ? PS_UI : null;

        const total = 63;
        const readCount = STATE.read.length;
        const bookmarkCount = STATE.bookmarks.length;
        const readPct = Math.round((readCount / total) * 100);

        // Calculate categories explored with counts
        const allCats = ['quran','protection','forgiveness','guidance','wellbeing','prophets','morning-evening','provision','prayer','family','travel','scholars','ramadan','evil-eye'];
        const catMap = {};
        allCats.forEach(c => catMap[c] = 0);
        STATE.read.forEach(id => {
            const card = document.querySelector(`.dua-card[data-id="${id}"]`);
            if (card) {
                (card.getAttribute('data-categories') || '').split(',').forEach(c => {
                    const key = c.trim();
                    if (key in catMap) catMap[key]++;
                });
            }
        });
        const catSet = new Set(Object.keys(catMap).filter(k => catMap[k] > 0));

        // Category totals
        const catTotals = {};
        allCats.forEach(c => catTotals[c] = 0);
        document.querySelectorAll('.dua-card').forEach(card => {
            (card.getAttribute('data-categories') || '').split(',').forEach(c => {
                const key = c.trim();
                if (key in catTotals) catTotals[key]++;
            });
        });

        // Weekly activity
        const activity = JSON.parse(localStorage.getItem('crown_activity') || '[]');
        const dayNames = isPS ? ['ی','د','س','چ','پ','ج','ش'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        let weekHTML = '';
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const isActive = activity.includes(dateStr);
            const isToday = i === 0;
            weekHTML += `<div class="progress-day-cell${isActive ? ' active' : ''}${isToday ? ' today' : ''}">
                <div>${dayNames[d.getDay()]}</div>
                <div style="font-size:0.8rem;margin-top:2px;">${isActive ? '\u2713' : '\u00b7'}</div>
            </div>`;
        }
        const totalDays = activity.length;

        // Category bars
        let catBarsHTML = '';
        const catColors = {
            quran: '#7e57c2',
            protection: '#2ec47a',
            forgiveness: '#c9a84c',
            guidance: '#64b5f6',
            wellbeing: '#4db6ac',
            prophets: '#ffb74d',
            'morning-evening': '#aed581',
            provision: '#ce93d8',
            prayer: '#81c784',
            family: '#f48fb1',
            travel: '#90caf9',
            scholars: '#b39ddb',
            ramadan: '#4db6ac',
            'evil-eye': '#9575cd'
        };

        allCats.forEach(cat => {
            const count = catMap[cat] || 0;
            const catTotal = catTotals[cat] || 1;
            const pct = Math.round((count / catTotal) * 100);
            const label = isPS && psUI?.cats?.[cat]
                ? psUI.cats[cat]
                : (cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' '));
            catBarsHTML += `<div class="progress-category-bar">
                <div class="progress-cat-label">${label}</div>
                <div class="progress-cat-bar"><div class="progress-cat-fill" style="width:${pct}%;background:${catColors[cat] || '#2ec47a'}"></div></div>
                <div class="progress-cat-count">${count}/${catTotal}</div>
            </div>`;
        });

        // Achievements
        const achievements = [
            { icon: '🌱', name: isPS && psUI?.achNames?.['First Step'] ? psUI.achNames['First Step'] : 'First Step', earned: readCount >= 1, desc: isPS ? 'لومړۍ دعا مو ولوستله' : 'Read your first dua' },
            { icon: '📖', name: isPS && psUI?.achNames?.['Bookworm'] ? psUI.achNames['Bookworm'] : 'Bookworm', earned: bookmarkCount >= 5, desc: isPS ? '۵ دعاګانې مو خوښې کړې' : 'Bookmark 5 duas' },
            { icon: '🔥', name: isPS && psUI?.achNames?.['On Fire'] ? psUI.achNames['On Fire'] : 'On Fire', earned: STATE.streak >= 3, desc: isPS ? '۳ ورځې پرله‌پسې' : '3-day streak' },
            { icon: '⭐', name: isPS && psUI?.achNames?.['Dedicated'] ? psUI.achNames['Dedicated'] : 'Dedicated', earned: STATE.streak >= 7, desc: isPS ? '۷ ورځې پرله‌پسې' : '7-day streak' },
            { icon: '🌍', name: isPS && psUI?.achNames?.['Explorer'] ? psUI.achNames['Explorer'] : 'Explorer', earned: catSet.size >= 7, desc: isPS ? '۷ کټګورۍ مو وکتلې' : 'Explore 7 categories' },
            { icon: '💪', name: isPS && psUI?.achNames?.['Halfway'] ? psUI.achNames['Halfway'] : 'Halfway', earned: readCount >= 32, desc: isPS ? '۳۲+ دعاګانې مو ولوستلې' : 'Read 32+ duas' },
            { icon: '🏆', name: isPS && psUI?.achNames?.['Crown Master'] ? psUI.achNames['Crown Master'] : 'Crown Master', earned: readCount >= 63, desc: isPS ? 'ټولې ۶۳ دعاګانې' : 'All 63 duas' },
            { icon: '🔮', name: isPS && psUI?.achNames?.['Scholar'] ? psUI.achNames['Scholar'] : 'Scholar', earned: catSet.size >= 14, desc: isPS ? 'ټولې ۱۴ کټګورۍ' : 'All 14 categories' },
        ];
        const earnedCount = achievements.filter(a => a.earned).length;
        let achieveHTML = achievements.map(a => `
            <div class="achievement-badge ${a.earned ? 'earned' : 'locked'}" title="${a.desc}">
                <div class="achievement-icon">${a.icon}</div>
                ${a.earned ? '' : '<div class="achievement-lock">🔒</div>'}
                <div class="achievement-name">${a.name}</div>
            </div>`).join('');

        // Milestone
        let milestone = '';
        if (readCount >= 55) milestone = isPS && psUI?.milestones?.all ? psUI.milestones.all : '🏆 Completed the entire Crown Collection!';
        else if (readCount >= 40) milestone = isPS && psUI?.milestones?.m40 ? psUI.milestones.m40 : '⭐ Almost there — a true seeker of knowledge!';
        else if (readCount >= 25) milestone = isPS && psUI?.milestones?.m25 ? psUI.milestones.m25 : '💪 Halfway champion — keep going!';
        else if (readCount >= 10) milestone = isPS && psUI?.milestones?.m10 ? psUI.milestones.m10 : '🌱 Growing beautifully — 10+ duas learned!';
        else if (readCount >= 1) milestone = isPS && psUI?.milestones?.m1 ? psUI.milestones.m1 : '✨ The journey of a thousand miles begins with one step.';
        else milestone = isPS && psUI?.milestones?.m0 ? psUI.milestones.m0 : '📖 Start your journey — tap "Mark Read" on any dua!';

        container.innerHTML = `
            <h2>${isPS && psUI?.yourJourney ? psUI.yourJourney : 'Your Journey'}</h2>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">📖</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">${isPS && psUI?.duasRead ? psUI.duasRead : 'Duas Read'}</div>
                    <div class="progress-stat-value">${readCount} / ${total}</div>
                    <div class="progress-bar-visual">
                        <div class="progress-bar-fill" style="width:${readPct}%"></div>
                    </div>
                    <div class="progress-stat-sub">${readPct}% ${isPS && psUI?.complete ? psUI.complete : 'complete'}</div>
                </div>
            </div>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">🔥</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">${isPS && psUI?.currentStreak ? psUI.currentStreak : 'Current Streak'}</div>
                    <div class="progress-stat-value">${STATE.streak} ${isPS && psUI?.streakDays ? psUI.streakDays : 'days'}</div>
                    <div class="progress-stat-sub">${isPS && psUI?.daysActive ? psUI.daysActive : 'Total days active'}: ${totalDays}</div>
                </div>
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">${isPS && psUI?.thisWeek ? psUI.thisWeek : 'This Week'}</div>
                <div class="progress-week-grid">${weekHTML}</div>
            </div>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">\u2b50</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">${isPS && psUI?.bookmarked ? psUI.bookmarked : 'Bookmarked'}</div>
                    <div class="progress-stat-value">${bookmarkCount}</div>
                    <div class="progress-stat-sub">${isPS && psUI?.favDuas ? psUI.favDuas : 'Your favourite duas saved for quick access'}</div>
                </div>
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">${isPS && psUI?.categoryBreakdown ? psUI.categoryBreakdown : 'Category Breakdown'}</div>
                ${catBarsHTML}
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">${isPS && psUI?.achievements ? psUI.achievements : 'Achievements'} (${earnedCount}/${achievements.length})</div>
                <div class="progress-achievements">${achieveHTML}</div>
            </div>

            <div class="progress-stat-card" style="text-align:center;justify-content:center;flex-direction:column;">
                <div style="font-size:1.2rem;margin-bottom:8px;">${milestone}</div>
            </div>
            <button class="progress-reset-btn" onclick="if(confirm(isPashtoMode() ? 'ټول د لوستلو پرمختګ بیا تنظیم شي؟ نښې به خوندي پاتې شي.' : 'Reset all reading progress? Bookmarks will be kept.')) { STATE.read=[]; localStorage.setItem('crown_read',JSON.stringify([])); document.querySelectorAll('.dua-card').forEach(c=>{c.classList.remove('read-card');const b=c.querySelector('.action-btn[onclick*=markRead]');if(b){b.classList.remove('read');b.innerHTML=isPashtoMode() ? '\u2713 لوستل شوی' : '\u2713 Mark Read';}}); updateStats(); renderProgressPanel(); showToast('Progress reset'); }">${isPS && psUI?.resetProgress ? psUI.resetProgress : '⚠ Reset Reading Progress'}</button>

            <button class="progress-share-btn" onclick="shareProgress()">${isPS && psUI?.shareProgress ? psUI.shareProgress : '📤 Share Your Progress'}</button>
        `;


    }

    window.shareProgress = async function() {
        showToast('Generating image...');

        const total = 63;
        const readCount = STATE.read.length;
        const readPct = Math.round((readCount / total) * 100);
        const bookmarkCount = STATE.bookmarks.length;
        const streak = parseInt(localStorage.getItem('crown_streak') || '0');
        const daysActive = JSON.parse(localStorage.getItem('crown_activity') || '[]').length;

        // Build achievements summary
        const achievements = [
            { name: 'First Step', icon: '🌱', req: 1 },
            { name: 'Bookworm', icon: '📖', req: 5 },
            { name: 'On Fire', icon: '🔥', req: 10 },
            { name: 'Dedicated', icon: '⭐', req: 20 },
            { name: 'Explorer', icon: '🌍', req: 30 },
            { name: 'Halfway', icon: '💪', req: 28 },
            { name: 'Crown Master', icon: '🏆', req: 63 },
            { name: 'Scholar', icon: '🔮', req: 63 }
        ];
        const earned = achievements.filter(a => readCount >= a.req).map(a => a.icon).join(' ');

        // Milestone text
        let milestone = '';
        if (readCount >= 63) milestone = '🏆 Completed the entire Crown Collection!';
        else if (readPct >= 40) milestone = '⭐ Nearly there — a true seeker of knowledge!';
        else if (readPct >= 25) milestone = '💪 Halfway hero — keep going!';
        else if (readPct >= 10) milestone = '🌱 Beautiful growth — 10+ duas learned!';
        else if (readCount >= 1) milestone = '✨ Every journey starts with a single step.';
        else milestone = '📖 Start your journey today!';

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            position:fixed; left:-9999px; top:0;
            width:500px; padding:40px 36px;
            background: linear-gradient(145deg, #0c1a13, #142a20);
            border-radius:24px; font-family:serif;
            border: 1px solid rgba(46,196,122,0.2);
        `;
        wrap.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-family:'Noto Naskh Arabic','Amiri',serif;font-size:16px;color:#2ec47a;margin-bottom:4px;">ف</div>
                <div style="font-family:'Playfair Display',serif;font-size:11px;letter-spacing:1px;text-transform:none;color:#2ec47a;margin-bottom:6px;">Falah — فلاح</div>
                <div style="font-family:'Playfair Display',serif;font-size:16px;letter-spacing:0.5px;text-transform:none;color:#e0eccc;font-weight:600;">My Journey</div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:16px;">
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${readCount}<span style="font-size:14px;color:rgba(224,238,210,0.5);">/${total}</span></div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:0.5px;text-transform:none;color:rgba(224,238,210,0.5);margin-top:4px;">Duas Read</div>
                </div>
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${streak}</div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:0.5px;text-transform:none;color:rgba(224,238,210,0.5);margin-top:4px;">Day Streak</div>
                </div>
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${bookmarkCount}</div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:0.5px;text-transform:none;color:rgba(224,238,210,0.5);margin-top:4px;">Saved</div>
                </div>
            </div>
            ${earned ? `<div style="text-align:center;font-size:1.4rem;margin-bottom:12px;letter-spacing:4px;">${earned}</div>` : ''}
            <div style="text-align:center;font-family:'Playfair Display',serif;font-size:14px;color:rgba(224,238,210,0.85);margin-bottom:16px;">${milestone}</div>
            <div style="display:flex;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(46,196,122,0.1);">
                <span style="font-family:'Playfair Display',serif;font-size:9px;letter-spacing:0.3px;text-transform:none;color:rgba(160,210,180,0.55);">${readPct}% Complete</span>
                <span style="font-family:'Playfair Display',serif;font-size:9px;letter-spacing:0.3px;text-transform:none;color:rgba(160,210,180,0.35);">فلاح · mohhp.github.io/Essential-duas</span>
            </div>
        `;
        document.body.appendChild(wrap);

        try {
            if (typeof html2canvas === 'undefined') {
                showToast('Image library loading, try again...');
                document.body.removeChild(wrap);
                return;
            }
            const canvas = await html2canvas(wrap, {
                backgroundColor: '#0c1a13',
                scale: 2,
                useCORS: true,
                logging: false
            });
            document.body.removeChild(wrap);

            canvas.toBlob(async (blob) => {
                if (!blob) { showToast('Failed to generate'); return; }
                if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'progress.png', { type: 'image/png' })] })) {
                    try {
                        await navigator.share({
                            files: [new File([blob], 'progress.png', { type: 'image/png' })],
                            title: 'My Dua Journey',
                            text: 'From Falah — فلاح'
                        });
                        showToast('Shared!');
                        return;
                    } catch(e) { /* fallthrough */ }
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'my-dua-journey.png';
                a.click(); URL.revokeObjectURL(url);
                showToast('Image downloaded!');
            }, 'image/png');
        } catch(e) {
            document.body.removeChild(wrap);
            showToast('Failed to generate image');
        }
    };

    // ===== AUDIO RECITATION (API-backed) =====
    const DUA_AUDIO_SOURCES = {
        1: { type: 'quran', ayahs: ['1:1-7'] },
        2: { type: 'quran', ayahs: ['2:255'] },
        3: { type: 'quran', ayahs: ['21:87'] },
        4: { type: 'quran', ayahs: ['17:24'] },
        5: { type: 'quran', ayahs: ['2:285-286'] },
        6: { type: 'quran', ayahs: ['112:1-4', '113:1-5', '114:1-6'] },
        7: { type: 'quran', ayahs: ['2:201'] },
        8: { type: 'quran', ayahs: ['3:8'] },
        9: { type: 'quran', ayahs: ['7:23'] },
        10: { type: 'quran', ayahs: ['20:114'] },
        11: { type: 'hosted', url: 'audio/duas/dua-11.mp3' },
        12: { type: 'hosted', url: 'audio/duas/dua-12.mp3' },
        13: { type: 'hosted', url: 'audio/duas/dua-13.mp3' },
        14: { type: 'hosted', url: 'audio/duas/dua-14.mp3' },
        15: { type: 'hosted', url: 'audio/duas/dua-15.mp3' },
        16: { type: 'hosted', url: 'audio/duas/dua-16.mp3' },
        17: { type: 'hosted', url: 'audio/duas/dua-17.mp3' },
        21: { type: 'hosted', url: 'audio/duas/dua-21.mp3' },
        23: { type: 'hosted', url: 'audio/duas/dua-23.mp3' },
        24: { type: 'hosted', url: 'audio/duas/dua-24.mp3' },
        25: { type: 'hosted', url: 'audio/duas/dua-25.mp3' },
        26: { type: 'hosted', url: 'audio/duas/dua-26.mp3' },
        27: { type: 'hosted', url: 'audio/duas/dua-27.mp3' },
        29: { type: 'quran', ayahs: ['20:25-28'] },
        30: { type: 'quran', ayahs: ['14:40'] },
        31: { type: 'quran', ayahs: ['27:19'] },
        32: { type: 'quran', ayahs: ['21:83'] },
        33: { type: 'quran', ayahs: ['3:38'] },
        34: { type: 'hosted', url: 'audio/duas/dua-34.mp3' },
        35: { type: 'quran', ayahs: ['9:129'] },
        36: { type: 'hosted', url: 'audio/duas/dua-36.mp3' },
        37: { type: 'hosted', url: 'audio/duas/dua-37.mp3' },
        38: { type: 'hosted', url: 'audio/duas/dua-38.mp3' },
        39: { type: 'hosted', url: 'audio/duas/dua-39.mp3' },
        40: { type: 'quran', ayahs: ['14:41'] },
        41: { type: 'hosted', url: 'audio/duas/dua-41.mp3' },
        42: { type: 'hosted', url: 'audio/duas/dua-42.mp3' },
        46: { type: 'hosted', url: 'audio/duas/dua-46.mp3' },
        47: { type: 'hosted', url: 'audio/duas/dua-47.mp3' },
        49: { type: 'hosted', url: 'audio/duas/dua-49.mp3' },
        50: { type: 'quran', ayahs: ['43:13-14'] },
        51: { type: 'hosted', url: 'audio/duas/dua-51.mp3' },
        52: { type: 'quran', ayahs: ['3:147'] },
        56: { type: 'hosted', url: 'audio/duas/dua-56.mp3' },
        57: { type: 'hosted', url: 'audio/duas/dua-57.mp3' },
        58: { type: 'hosted', url: 'audio/duas/dua-58.mp3' },
        59: { type: 'hosted', url: 'audio/duas/dua-59.mp3' },
        60: { type: 'hosted', url: 'audio/duas/dua-60.mp3' },
        62: { type: 'quran', ayahs: ['113:1-5'] },
        63: { type: 'quran', ayahs: ['18:39'] }
    };

    const AYAH_AUDIO_CACHE = new Map();
    let activeAudioSession = null;

    function resolveMappedDuaId(rawId) {
        const numeric = Number(rawId);
        if (!Number.isFinite(numeric)) return null;
        if (DUA_AUDIO_SOURCES[numeric]) return numeric;
        return null;
    }

    function getAudioUiText() {
        const isPS = isPashtoMode();
        return {
            listen: isPS ? '🔊 اورېدل' : '🔊 Listen',
            play: isPS ? '▶ غږول' : '▶ Play',
            pause: isPS ? '⏸ Pause' : '⏸ Pause',
            loading: isPS ? '⏳ چمتو کېږي...' : '⏳ Loading...'
        };
    }

    function setAudioPlayerState(player, state) {
        if (!player) return;
        const btn = player.querySelector('.audio-btn');
        if (!btn) return;
        const txt = getAudioUiText();
        player.dataset.state = state;
        btn.classList.remove('playing', 'loading');

        if (state === 'loading') {
            btn.classList.add('loading');
            btn.textContent = txt.loading;
        } else if (state === 'playing') {
            btn.classList.add('playing');
            btn.textContent = txt.pause;
        } else if (state === 'paused') {
            btn.textContent = txt.play;
        } else {
            btn.textContent = txt.listen;
        }
    }

    function updateAudioProgress(player, pct) {
        const fill = player?.querySelector('.audio-progress-fill');
        if (!fill) return;
        fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    function expandAyahSpecs(specs) {
        if (!Array.isArray(specs)) return [];
        const expanded = [];

        specs.forEach(spec => {
            if (typeof spec !== 'string') return;
            const trimmed = spec.trim();
            if (!trimmed) return;

            const rangeMatch = trimmed.match(/^(\d+):(\d+)-(\d+)$/);
            if (rangeMatch) {
                const surah = parseInt(rangeMatch[1], 10);
                const startAyah = parseInt(rangeMatch[2], 10);
                const endAyah = parseInt(rangeMatch[3], 10);
                if (!Number.isNaN(surah) && !Number.isNaN(startAyah) && !Number.isNaN(endAyah) && endAyah >= startAyah) {
                    for (let ayah = startAyah; ayah <= endAyah; ayah += 1) {
                        expanded.push(`${surah}:${ayah}`);
                    }
                }
                return;
            }

            const singleMatch = trimmed.match(/^\d+:\d+$/);
            if (singleMatch) expanded.push(trimmed);
        });

        return expanded;
    }

    async function resolveAyahAudioUrl(ayahKey) {
        if (AYAH_AUDIO_CACHE.has(ayahKey)) return AYAH_AUDIO_CACHE.get(ayahKey);
        const resp = await fetchWithTimeout(`https://api.alquran.cloud/v1/ayah/${ayahKey}/ar.alafasy`, {}, 12000);
        if (!resp.ok) throw new Error('Audio lookup failed');
        const json = await resp.json();
        const url = json?.data?.audio;
        if (!url) throw new Error('Audio URL missing');
        AYAH_AUDIO_CACHE.set(ayahKey, url);
        return url;
    }

    async function getPlaylistForDua(id) {
        const mappedId = resolveMappedDuaId(id);
        const source = mappedId ? DUA_AUDIO_SOURCES[mappedId] : null;
        if (!source) return [];

        if (source.type === 'hosted' && source.url) {
            return [source.url];
        }

        const ayahKeys = expandAyahSpecs(source.ayahs);
        if (!ayahKeys.length) return [];
        const urls = await Promise.all(ayahKeys.map(resolveAyahAudioUrl));
        return urls.filter(Boolean);
    }

    function stopActiveAudio() {
        if (!activeAudioSession) return;
        const { audio, preloadedAudio, player } = activeAudioSession;
        if (audio) {
            audio.pause();
            audio.src = '';
        }
        if (preloadedAudio) {
            preloadedAudio.pause();
            preloadedAudio.src = '';
        }
        updateAudioProgress(player, 0);
        setAudioPlayerState(player, 'idle');
        activeAudioSession = null;
    }

    async function playDuaAudio(duaId, player) {
        const mappedDuaId = resolveMappedDuaId(duaId);
        const btn = player?.querySelector('.audio-btn');
        if (!btn) return;
        if (!mappedDuaId) {
            setAudioPlayerState(player, 'idle');
            updateAudioProgress(player, 0);
            return;
        }

        if (activeAudioSession && activeAudioSession.duaId === mappedDuaId && activeAudioSession.player === player) {
            const { audio } = activeAudioSession;
            if (audio.paused) {
                await audio.play();
                setAudioPlayerState(player, 'playing');
            } else {
                audio.pause();
                setAudioPlayerState(player, 'paused');
            }
            return;
        }

        stopActiveAudio();
        setAudioPlayerState(player, 'loading');
        updateAudioProgress(player, 0);

        try {
            const playlist = await getPlaylistForDua(mappedDuaId);
            if (!playlist.length) {
                setAudioPlayerState(player, 'idle');
                updateAudioProgress(player, 0);
                showToast('Audio unavailable for this dua right now');
                return;
            }

            let audio = new Audio();
            let preloadedAudio = null;
            let index = 0;
            const total = playlist.length;

            const preloadNext = (currentIndex) => {
                const nextIndex = currentIndex + 1;
                if (nextIndex >= total) {
                    preloadedAudio = null;
                    return;
                }
                preloadedAudio = new Audio();
                preloadedAudio.preload = 'auto';
                preloadedAudio.src = playlist[nextIndex];
                preloadedAudio.load();
            };

            const loadTrack = (i) => {
                if (i >= total) {
                    setAudioPlayerState(player, 'idle');
                    updateAudioProgress(player, 100);
                    activeAudioSession = null;
                    return;
                }
                index = i;
                audio.src = playlist[index];
                audio.load();
                preloadNext(index);
                audio.play().then(() => {
                    setAudioPlayerState(player, 'playing');
                }).catch(() => {
                    setAudioPlayerState(player, 'idle');
                    showToast('Audio playback failed');
                });
            };

            audio.addEventListener('timeupdate', () => {
                const segProgress = audio.duration ? (audio.currentTime / audio.duration) : 0;
                const pct = ((index + segProgress) / total) * 100;
                updateAudioProgress(player, pct);
            });

            audio.addEventListener('ended', () => {
                const nextIndex = index + 1;
                if (nextIndex >= total) {
                    loadTrack(nextIndex);
                    return;
                }

                if (preloadedAudio && preloadedAudio.readyState >= 2) {
                    audio = preloadedAudio;
                    index = nextIndex;
                    preloadNext(index);

                    audio.addEventListener('timeupdate', () => {
                        const segProgress = audio.duration ? (audio.currentTime / audio.duration) : 0;
                        const pct = ((index + segProgress) / total) * 100;
                        updateAudioProgress(player, pct);
                    });

                    audio.addEventListener('ended', () => {
                        const chainedIndex = index + 1;
                        if (chainedIndex >= total) {
                            setAudioPlayerState(player, 'idle');
                            updateAudioProgress(player, 100);
                            activeAudioSession = null;
                            return;
                        }
                        loadTrack(chainedIndex);
                    });

                    audio.addEventListener('error', () => {
                        setAudioPlayerState(player, 'idle');
                        showToast('Audio playback failed');
                    });

                    audio.play().then(() => {
                        setAudioPlayerState(player, 'playing');
                    }).catch(() => {
                        loadTrack(nextIndex);
                    });
                    return;
                }

                loadTrack(nextIndex);
            });

            audio.addEventListener('error', () => {
                setAudioPlayerState(player, 'idle');
                showToast('Audio playback failed');
            });

            activeAudioSession = {
                duaId: mappedDuaId,
                player,
                get audio() { return audio; },
                get preloadedAudio() { return preloadedAudio; }
            };
            loadTrack(0);
        } catch (error) {
            setAudioPlayerState(player, 'idle');
            updateAudioProgress(player, 0);
            showToast('Audio playback failed');
        }
    }

    function injectAudioButtons() {
        document.querySelectorAll('.copy-row').forEach(row => {
            const card = row.closest('.dua-card');
            if (!card) return;
            const id = parseInt(card.getAttribute('data-id'), 10);
            const mappedId = resolveMappedDuaId(id);
            if (!mappedId) return;
            if (row.querySelector('.audio-player')) return;

            const player = document.createElement('div');
            player.className = 'audio-player';
            player.setAttribute('data-state', 'idle');
            player.innerHTML = `
                <button class="action-btn audio-btn" type="button"></button>
                <div class="audio-progress"><span class="audio-progress-fill"></span></div>
            `;

            const btn = player.querySelector('.audio-btn');
            setAudioPlayerState(player, 'idle');
            btn.addEventListener('click', () => playDuaAudio(mappedId, player));
            row.insertBefore(player, row.firstChild);
        });
    }

    window.refreshAudioButtonLanguage = function() {
        document.querySelectorAll('.audio-player').forEach(player => {
            const state = player.dataset.state || 'idle';
            setAudioPlayerState(player, state);
        });
    };

    // ===== TIME-BASED DUA SUGGESTIONS =====
    const TIME_DUA_MAP = {
        fajr:    { icon: '🌅', label: 'Fajr / Early Morning', period: 'Start your day with these blessed supplications', ids: [12, 14, 16, 23, 34, 35, 36, 38] },
        morning: { icon: '☀️', label: 'Morning Adhkar', period: 'The Prophet ﷺ never missed his morning remembrance', ids: [12, 14, 16, 23, 34, 35, 36] },
        dhuhr:   { icon: '🕐', label: 'Midday Remembrance', period: 'Take a moment to reconnect in the middle of your day', ids: [1, 7, 10, 19, 20, 41] },
        asr:     { icon: '🌤', label: 'Afternoon Reflection', period: 'The Prophet ﷺ sought refuge from the trials of the day', ids: [13, 25, 27, 29, 42] },
        maghrib: { icon: '🌆', label: 'Evening Adhkar', period: 'As the sun sets, renew your protection', ids: [12, 14, 16, 23, 34, 35, 36] },
        isha:    { icon: '🌙', label: 'Night Supplications', period: 'Prepare for sleep with these powerful duas', ids: [2, 5, 6, 11, 47, 18] },
        latenight: { icon: '🌌', label: 'Late Night / Tahajjud', period: 'The last third of the night — when duas are answered', ids: [9, 16, 17, 18, 24, 26, 3] }
    };

    function getTimePeriod() {
        const h = new Date().getHours();
        if (h >= 4 && h < 6) return 'fajr';
        if (h >= 6 && h < 11) return 'morning';
        if (h >= 11 && h < 14) return 'dhuhr';
        if (h >= 14 && h < 16) return 'asr';
        if (h >= 16 && h < 19) return 'maghrib';
        if (h >= 19 && h < 22) return 'isha';
        return 'latenight';
    }

    function renderTimeBanner() {
        const container = document.getElementById('timeBanner');
        if (!container) return;

        const period = getTimePeriod();
        const data = TIME_DUA_MAP[period];
        if (!data) return;

        const chips = data.ids.map(id => {
            const card = document.querySelector(`.dua-card[data-id="${id}"]`);
            if (!card) return '';
            const title = card.querySelector('.dua-title')?.textContent?.split('—')[0]?.trim() || `Dua #${id}`;
            const short = title.length > 30 ? title.substring(0, 28) + '…' : title;
            return `<span class="time-dua-chip" onclick="scrollToDua(${id})">#${id} ${short}</span>`;
        }).join('');

        container.innerHTML = `
            <div class="time-banner">
                <div class="time-banner-header">
                    <span class="time-banner-icon">${data.icon}</span>
                    <span class="time-banner-title">Suggested Now — ${data.label}</span>
                </div>
                <div class="time-banner-period">${data.period}</div>
                <div class="time-banner-duas">${chips}</div>
            </div>
        `;
    }

    // ===== DAILY ACTIVITY TRACKING =====
    function trackDailyActivity() {
        const today = new Date().toISOString().slice(0, 10);
        let activity = JSON.parse(localStorage.getItem('crown_activity') || '[]');
        if (!activity.includes(today)) {
            activity.push(today);
            if (activity.length > 90) activity = activity.slice(-90);
            localStorage.setItem('crown_activity', JSON.stringify(activity));
        }
    }

    // ===== SCROLL TO TOP =====
    window.scrollToTop = function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.handleLogoTap = function() {
        const homePanel = document.getElementById('mainContainer');
        const isHomeRoute = getInAppRoute() === IN_APP_VIEWS.HOME;

        closeAllPanelsForStateApply();
        switchTab('home');
        backToCategories();
        if (homePanel) {
            try {
                homePanel.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (_) {
                homePanel.scrollTop = 0;
            }
        }

        if (isHomeRoute) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        recordInAppRoute(false, {
            [IN_APP_HISTORY_FLAG]: true,
            view: IN_APP_VIEWS.HOME,
            ts: Date.now()
        });
    };

    // ===== SCROLL TO DAILY DUA =====
    window.scrollToDailyDua = function() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        scrollToDua(duaIndex);
    };

// show/hide detailed dua inside routine panel (translation + references only)
    window.toggleRoutineDailyDua = function(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        const card = document.querySelector(`.dua-card[data-id="${duaIndex}"]`);
        const extra = document.getElementById('routineDailyExtra');
        const prompt = document.getElementById('routineDailyPrompt');
        const ui = getRoutineUiText();
        if (!extra || !card) return;
        if (extra.innerHTML.trim()) {
            extra.innerHTML = '';
            extra.style.display = 'none';
            if (prompt) prompt.textContent = ui.expandPrompt;
        } else {
            // Extract plain text to avoid copying structural HTML that may render differently
            const translationEl = isPashtoMode()
                ? (card.querySelector('.translation-ps') || card.querySelector('.translation'))
                : card.querySelector('.translation');
            const transText = translationEl?.textContent?.trim() || '';
            const refText = card.querySelector('.reference .ref-text')?.textContent?.trim() || card.querySelector('.reference')?.textContent?.trim() || '';
            // Build safe DOM nodes into the extra container
            extra.innerHTML = '';
            const tdiv = document.createElement('div');
            tdiv.className = 'routine-extra-translation';
            tdiv.style.cssText = 'font-family:var(--font-text);font-size:0.95rem;color:var(--text-muted);line-height:1.6;margin-bottom:8px;';
            tdiv.textContent = transText;

            const rdiv = document.createElement('div');
            rdiv.className = 'routine-extra-reference';
            rdiv.style.cssText = 'font-size:0.85rem;color:var(--text-subtle);';
            rdiv.textContent = refText;

            extra.appendChild(tdiv);
            extra.appendChild(rdiv);
            extra.style.display = 'block';
            if (prompt) prompt.textContent = ui.collapsePrompt;
        }
    };

    window.shareDailyDua = function() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        shareAsImage(duaIndex);
    };

    // ===== THEME TOGGLE (LIGHT/DARK) =====
    function applyTheme() {
        const saved = localStorage.getItem('crown_theme') || 'dark';
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeMeta) themeMeta.setAttribute('content', '#faf7f2');
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeMeta) themeMeta.setAttribute('content', '#1e2a3a');
        }
        const btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = saved === 'light' ? '🌙' : '☀';
    }

    window.toggleTheme = function() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('crown_theme', 'dark');
            if (themeMeta) themeMeta.setAttribute('content', '#1e2a3a');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('crown_theme', 'light');
            if (themeMeta) themeMeta.setAttribute('content', '#faf7f2');
        }
        const btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = isLight ? '☀' : '🌙';
        syncMorePreferenceControls();
        showToast(isLight ? 'Dark Mode' : 'Light Mode');
    };

    // ===== MEMORIZATION MODE =====
    let flashcardQueue = [];
    let flashcardIndex = 0;
    let flashcardFlipped = false;

    function getFlashcardData(card) {
        return {
            id: parseInt(card.getAttribute('data-id'), 10),
            arabic: card.querySelector('.arabic-text')?.textContent?.trim() || '',
            transliteration: card.querySelector('.transliteration')?.textContent?.trim() || '',
            translation: card.querySelector('.translation')?.textContent?.trim() || '',
            reference: card.querySelector('.ref-text')?.textContent?.trim() || '',
            title: card.querySelector('.dua-title')?.textContent?.trim() || ''
        };
    }

    function normalizeFlashcardIndex(index) {
        if (!flashcardQueue.length) return 0;
        if (index < 0) return 0;
        if (index >= flashcardQueue.length) return flashcardQueue.length - 1;
        return index;
    }

    function getMemorizeUiText() {
        const psUI = (typeof PS_UI !== 'undefined') ? PS_UI : null;
        return {
            flip: isPashtoMode() ? (psUI?.memFlip || 'واړوئ') : 'Flip',
            prev: isPashtoMode() ? (psUI?.memPrev || '← شاته') : '← Prev',
            next: isPashtoMode() ? (psUI?.memNext || 'بل →') : 'Next →',
            easy: isPashtoMode() ? (psUI?.memEasy || 'اسانه') : 'Easy',
            good: isPashtoMode() ? (psUI?.memGood || 'ښه') : 'Good',
            hard: isPashtoMode() ? (psUI?.memHard || 'ستونزمنه') : 'Hard',
            cardOf: isPashtoMode() ? 'کارډ' : 'Card',
            due: isPashtoMode() ? 'باقي' : 'due',
            reviewDue: isPashtoMode() ? 'بیاکتنه پکار ده' : 'Review Due'
        };
    }

    function applyMemorizePanelTexts() {
        const panel = document.getElementById('memorizePanel');
        if (!panel) return;
        const ui = getMemorizeUiText();
        const actionBtns = panel.querySelectorAll('.flashcard-actions .flash-btn');
        if (actionBtns[0]) actionBtns[0].textContent = ui.flip;
        if (actionBtns[1]) actionBtns[1].textContent = ui.prev;
        if (actionBtns[2]) actionBtns[2].textContent = ui.next;
        const rateBtns = panel.querySelectorAll('.flashcard-rating-row .flash-rate');
        if (rateBtns[0]) rateBtns[0].textContent = isPashtoMode() ? 'اسانه' : 'Easy / اسانه';
        if (rateBtns[1]) rateBtns[1].textContent = isPashtoMode() ? 'ښه' : 'Good / ښه';
        if (rateBtns[2]) rateBtns[2].textContent = isPashtoMode() ? 'ستونزمنه' : 'Hard / ستونزمنه';
    }

    function renderFlashcard() {
        const card = flashcardQueue[flashcardIndex];
        if (!card) return;

        const arabic = document.getElementById('flashcardArabic');
        const translation = document.getElementById('flashcardTranslation');
        const transliteration = document.getElementById('flashcardTransliteration');
        const reference = document.getElementById('flashcardReference');
        const progressText = document.getElementById('memorizeProgressText');
        const progressFill = document.getElementById('memorizeProgressFill');
        const flash = document.getElementById('flashcard');
        const ratingRow = document.getElementById('flashcardRatingRow');

        if (arabic) arabic.textContent = card.arabic;
        if (translation) translation.textContent = card.translation;
        if (transliteration) transliteration.textContent = card.transliteration;
        if (reference) reference.textContent = card.reference || card.title;

        const isPS = isPashtoMode();
        const currentNum = flashcardIndex + 1;
        const totalNum = flashcardQueue.length;
        if (progressText) {
            progressText.textContent = isPS
                ? `${localizeDigits(currentNum)} له ${localizeDigits(totalNum)}`
                : `${getMemorizeUiText().cardOf} ${currentNum} of ${totalNum}`;
        }
        if (progressFill) progressFill.style.width = `${Math.round((currentNum / totalNum) * 100)}%`;

        flashcardFlipped = false;
        if (flash) flash.classList.remove('flipped');
        if (ratingRow) ratingRow.classList.remove('visible');
    }

    function bindFlashcardSwipe() {
        const wrap = document.getElementById('flashcardWrap');
        if (!wrap || wrap.dataset.boundSwipe === '1') return;

        let startX = 0;
        let startY = 0;
        wrap.addEventListener('touchstart', (e) => {
            if (!e.touches?.[0]) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        wrap.addEventListener('touchend', (e) => {
            if (!e.changedTouches?.[0]) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            const deltaY = e.changedTouches[0].clientY - startY;
            if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
            if (deltaX < 0) nextFlashcard();
            else prevFlashcard();
        }, { passive: true });

        wrap.dataset.boundSwipe = '1';
    }

    window.toggleMemorizeMode = function() {
        if (document.getElementById('memorizePanel')?.classList.contains('active')) {
            closeMemorizeSession();
            return;
        }
        openMemorizeSession();
    };

    window.openMemorizeSession = function() {
        const panel = document.getElementById('memorizePanel');
        const btn = document.getElementById('memorizeToggle');
        if (!panel || !btn) return;

        flashcardQueue = Array.from(document.querySelectorAll('.dua-card')).map(getFlashcardData).filter(item => item.arabic);
        flashcardIndex = 0;
        btn.classList.add('active');
        panel.classList.add('active');
        lockScroll();
        bindFlashcardSwipe();
        applyMemorizePanelTexts();
        renderFlashcard();
        showToast(isPashtoMode() ? 'د حفظ فلشکارډ حالت فعال شو' : 'Flashcard memorization mode enabled');
    };

    window.refreshMemorizeLanguage = function() {
        applyMemorizePanelTexts();
        if (document.getElementById('memorizePanel')?.classList.contains('active')) renderFlashcard();
    };

    window.closeMemorizeSession = function() {
        const panel = document.getElementById('memorizePanel');
        const btn = document.getElementById('memorizeToggle');
        if (panel) panel.classList.remove('active');
        if (btn) btn.classList.remove('active');
        unlockScroll();
    };

    window.flipFlashcard = function() {
        const flash = document.getElementById('flashcard');
        const ratingRow = document.getElementById('flashcardRatingRow');
        if (!flash || !ratingRow) return;
        flashcardFlipped = !flashcardFlipped;
        flash.classList.toggle('flipped', flashcardFlipped);
        ratingRow.classList.toggle('visible', flashcardFlipped);
    };

    window.nextFlashcard = function() {
        flashcardIndex = normalizeFlashcardIndex(flashcardIndex + 1);
        renderFlashcard();
    };

    window.prevFlashcard = function() {
        flashcardIndex = normalizeFlashcardIndex(flashcardIndex - 1);
        renderFlashcard();
    };

    window.rateCurrentFlashcard = function(rating) {
        const current = flashcardQueue[flashcardIndex];
        if (!current) return;
        rateSR(current.id, rating);
        if (flashcardIndex < flashcardQueue.length - 1) {
            flashcardIndex += 1;
            renderFlashcard();
        } else {
            closeMemorizeSession();
            showToast(isPashtoMode() ? 'د نن ورځې د تکرار سیشن بشپړ شو' : 'Review session complete');
        }
    };

    // ===== SPACED REPETITION SYSTEM =====
    function getSRData() {
        try { return JSON.parse(localStorage.getItem('crown_sr') || '{}'); } catch(e) { return {}; }
    }
    function saveSRData(data) {
        localStorage.setItem('crown_sr', JSON.stringify(data));
    }

    window.rateSR = function(duaId, rating, btn = null) {
        const sr = getSRData();
        const entry = sr[duaId] || { interval: 1, easeFactor: 2.0, nextReview: 0 };

        if (rating === 'easy') {
            entry.interval = Math.min(entry.interval * entry.easeFactor, 365);
            entry.easeFactor = Math.min(entry.easeFactor + 0.1, 3.0);
        } else if (rating === 'good') {
            entry.interval = Math.min(Math.max(2, entry.interval * (entry.easeFactor - 0.15)), 180);
            entry.easeFactor = Math.min(entry.easeFactor + 0.02, 2.8);
        } else {
            entry.interval = 1;
            entry.easeFactor = Math.max(entry.easeFactor - 0.2, 1.3);
        }
        entry.nextReview = Date.now() + (entry.interval * 86400000);
        sr[duaId] = entry;
        saveSRData(sr);

        // Remove rating row
        if (btn) {
            const row = btn.closest('.sr-rating-row');
            if (row) {
                row.classList.remove('visible');
                setTimeout(() => row.remove(), 300);
            }
        }

        const days = Math.round(entry.interval);
        if (rating === 'hard') showToast('Will review again tomorrow');
        else showToast(`Next review in ${days} day${days > 1 ? 's' : ''}`);
        updateSRBadges();
    };

    function getDueCount() {
        const sr = getSRData();
        const now = Date.now();
        return Object.values(sr).filter(e => e.nextReview <= now).length;
    }

    function updateSRBadges() {
        const sr = getSRData();
        const now = Date.now();

        // Update memorize button text with due count
        const btn = document.getElementById('memorizeToggle');
        if (btn) {
            const due = getDueCount();
            if (isPashtoMode()) {
                btn.textContent = due > 0 ? `🧠 حفظ (${localizeDigits(due)} پاتې)` : '🧠 حفظ';
            } else {
                btn.textContent = due > 0 ? `🧠 Memorize (${due} due)` : '🧠 Memorize';
            }
        }

        // Add/remove review badges on cards
        els.cards.forEach(card => {
            const id = parseInt(card.getAttribute('data-id'));
            const existing = card.querySelector('.sr-review-badge');
            if (existing) existing.remove();

            if (sr[id] && sr[id].nextReview <= now) {
                const titleEl = card.querySelector('.dua-title');
                if (titleEl) {
                    const badge = document.createElement('span');
                    badge.className = 'sr-review-badge';
                    badge.textContent = getMemorizeUiText().reviewDue;
                    titleEl.appendChild(badge);
                }
            }
        });
    }

    // Update SR badges on load
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(updateSRBadges, 1000);
    });

    // ===== SHARE AS IMAGE =====
    function injectShareImageButtons() {
        document.querySelectorAll('.copy-row').forEach(row => {
            const card = row.closest('.dua-card');
            if (!card) return;
            const id = card.getAttribute('data-id');
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = '🖼 Share Image';
            btn.onclick = function() { shareAsImage(id); };
            row.appendChild(btn);
        });
    }

    window.shareAsImage = async function(id) {
        const card = document.querySelector(`.dua-card[data-id="${id}"]`);
        if (!card) return;

        showToast('Generating image...');

        const title = (card.querySelector('.dua-title')?.textContent || '').replace(/\s+/g, ' ').trim();
        const arabic = (card.querySelector('.arabic-text')?.textContent || '').trim();
        const translation = (card.querySelector('.translation')?.textContent || '').trim();
        const ref = (card.querySelector('.ref-text')?.textContent || '').trim();
        const auth = (card.querySelector('.auth-badge')?.textContent || 'AUTHENTIC').replace(/\s+/g, ' ').trim();

        const template = document.getElementById('shareImageTemplate');
        const frame = document.getElementById('shareImageFrame');
        if (!template || !frame) {
            showToast('Share template unavailable');
            return;
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const isPS = isPashtoMode();

        frame.style.background = isLight
            ? 'linear-gradient(150deg, #f7ead0 0%, #f3ddaf 30%, #faefe0 100%)'
            : 'linear-gradient(155deg, #0f4b3a 0%, #1e2a3a 55%, #15283b 100%)';

        const authTag = document.getElementById('shareAuthTag');
        const arabicText = document.getElementById('shareArabicText');
        const translationText = document.getElementById('shareTranslationText');
        const referenceText = document.getElementById('shareReferenceText');
        const brandName = document.getElementById('shareBrandName');
        if (authTag) authTag.textContent = auth;
        if (arabicText) arabicText.textContent = arabic;
        if (translationText) translationText.textContent = translation;
        if (referenceText) referenceText.textContent = ref || title;
        if (brandName) brandName.textContent = isPS ? 'فلاح' : 'Falah';

        try {
            if (typeof html2canvas === 'undefined') {
                showToast('Image library loading, try again...');
                return;
            }

            template.style.opacity = '1';
            const canvas = await html2canvas(frame, {
                backgroundColor: null,
                scale: Math.max(2, window.devicePixelRatio || 2),
                useCORS: true,
                logging: false,
                width: 1080,
                windowWidth: 1200
            });
            template.style.opacity = '0';

            canvas.toBlob(async (blob) => {
                if (!blob) { showToast('Failed to generate'); return; }

                // Try native share first
                if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'dua.png', { type: 'image/png' })] })) {
                    try {
                        await navigator.share({
                            files: [new File([blob], 'dua.png', { type: 'image/png' })],
                            title: title,
                            text: isPS ? 'له فلاح څخه' : 'From Falah'
                        });
                        showToast('Shared!');
                        return;
                    } catch(e) { /* user cancelled or share failed, fall through to download */ }
                }

                // Fallback: download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `dua-${id}.png`;
                a.click(); URL.revokeObjectURL(url);
                showToast('Image downloaded!');
            }, 'image/png');
        } catch(e) {
            template.style.opacity = '0';
            showToast('Failed to generate image');
        }
    };

    // ===== ARABIC WORD POPUP =====
    const ARABIC_DICT = {
        // Helper: keys are diacritic-stripped Arabic. Values: [root, meaning]
        // ===== DIVINE NAMES & ATTRIBUTES =====
        'الله': ['أ ل ه', 'Allah — God'],
        'اللهم': ['أ ل ه', 'O Allah (invocation)'],
        'الرحمن': ['ر ح م', 'The Most Gracious'],
        'الرحيم': ['ر ح م', 'The Most Merciful'],
        'الصمد': ['ص م د', 'The Eternal Refuge'],
        'الاحد': ['و ح د', 'The One, Unique'],
        'احد': ['و ح د', 'one / anyone'],
        'الشافي': ['ش ف ي', 'The Healer'],
        'الحي': ['ح ي ي', 'The Ever-Living'],
        'القيوم': ['ق و م', 'The Sustainer of All'],
        'الحليم': ['ح ل م', 'The Forbearing'],
        'العظيم': ['ع ظ م', 'The Magnificent'],
        'العليم': ['ع ل م', 'The All-Knowing'],
        'العلي': ['ع ل و', 'The Most High'],
        'السميع': ['س م ع', 'The All-Hearing'],
        'الظاهر': ['ظ ه ر', 'The Manifest'],
        'الباطن': ['ب ط ن', 'The Hidden'],
        'الاخر': ['أ خ ر', 'The Last'],
        'الاول': ['أ و ل', 'The First'],
        'الوهاب': ['و ه ب', 'The Bestower'],
        'المنان': ['م ن ن', 'The Gracious Giver'],
        'المقدم': ['ق د م', 'The Expediter'],
        'المؤخر': ['أ خ ر', 'The Delayer'],
        'عفو': ['ع ف و', 'Pardoning; The Pardoner'],
        'حميد': ['ح م د', 'Praiseworthy'],
        'مجيد': ['م ج د', 'Glorious'],
        'قدير': ['ق د ر', 'All-Powerful'],
        'سميع': ['س م ع', 'All-Hearing'],
        'عدل': ['ع د ل', 'Just / Justice'],
        'الكريم': ['ك ر م', 'The Most Generous'],
        'بديع': ['ب د ع', 'Originator'],

        // ===== CORE ISLAMIC VOCABULARY =====
        'بسم': ['س م و', 'in the name of'],
        'الحمد': ['ح م د', 'all praise'],
        'حمدا': ['ح م د', 'praise (n.)'],
        'رب': ['ر ب ب', 'Lord / Sustainer'],
        'ربي': ['ر ب ب', 'my Lord'],
        'ربنا': ['ر ب ب', 'our Lord'],
        'ربه': ['ر ب ب', 'his Lord'],
        'ربك': ['ر ب ب', 'your Lord'],
        'ربا': ['ر ب ب', 'as a Lord'],
        'العالمين': ['ع ل م', 'the worlds / all creation'],
        'مالك': ['م ل ك', 'Master / Owner'],
        'ملك': ['م ل ك', 'King / Sovereign'],
        'الملك': ['م ل ك', 'the Dominion / Kingdom'],
        'يوم': ['ي و م', 'day'],
        'يوما': ['ي و م', 'a day'],
        'الدين': ['د ي ن', 'the religion / the Judgment'],
        'دينا': ['د ي ن', 'as a religion'],
        'ديني': ['د ي ن', 'my religion'],

        // ===== SURAH AL-FATIHA =====
        'اياك': ['إ ي ي', 'You alone'],
        'نعبد': ['ع ب د', 'we worship'],
        'نستعين': ['ع و ن', 'we seek help'],
        'اهدنا': ['ه د ي', 'guide us'],
        'الصراط': ['ص ر ط', 'the path'],
        'صراط': ['ص ر ط', 'path of'],
        'المستقيم': ['ق و م', 'the straight'],
        'الذين': ['—', 'those who'],
        'الذي': ['—', 'the one who / that which'],
        'انعمت': ['ن ع م', 'You have blessed'],
        'عليهم': ['ع ل و', 'upon them'],
        'غير': ['غ ي ر', 'other than / not'],
        'المغضوب': ['غ ض ب', 'those who earned wrath'],
        'الضالين': ['ض ل ل', 'those who went astray'],

        // ===== AYAT AL-KURSI =====
        'الاه': ['أ ل ه', 'god / deity'],
        'الا': ['—', 'except / but'],
        'هو': ['—', 'He'],
        'تاخذه': ['أ خ ذ', 'overtakes Him'],
        'سنه': ['و س ن', 'slumber / drowsiness'],
        'نوم': ['ن و م', 'sleep'],
        'السماوات': ['س م و', 'the heavens'],
        'السماء': ['س م و', 'the sky / heaven'],
        'الارض': ['أ ر ض', 'the earth'],
        'يشفع': ['ش ف ع', 'intercedes'],
        'عنده': ['ع ن د', 'with Him / in His presence'],
        'عندك': ['ع ن د', 'with You'],
        'باذنه': ['أ ذ ن', 'by His permission'],
        'يعلم': ['ع ل م', 'He knows'],
        'ايديهم': ['ي د ي', 'their hands / before them'],
        'خلفهم': ['خ ل ف', 'behind them'],
        'يحيطون': ['ح و ط', 'they encompass'],
        'بشيء': ['ش ي أ', 'anything / something'],
        'شيء': ['ش ي أ', 'a thing'],
        'علمه': ['ع ل م', 'His knowledge'],
        'شاء': ['ش ي أ', 'He willed'],
        'وسع': ['و س ع', 'encompasses / extends over'],
        'كرسيه': ['ك ر س', 'His Throne (Kursi)'],
        'يؤوده': ['أ و د', 'burdens / tires Him'],
        'حفظهما': ['ح ف ظ', 'preserving them both'],

        // ===== SURAHS AL-IKHLAS, AL-FALAQ, AN-NAS =====
        'قل': ['ق و ل', 'say'],
        'يلد': ['و ل د', 'He begets'],
        'يولد': ['و ل د', 'He was begotten'],
        'يكن': ['ك و ن', 'there is / was'],
        'كفوا': ['ك ف أ', 'equivalent / equal'],
        'اعوذ': ['ع و ذ', 'I seek refuge'],
        'برب': ['ر ب ب', 'in the Lord of'],
        'الفلق': ['ف ل ق', 'the daybreak'],
        'شر': ['ش ر ر', 'evil / harm'],
        'خلق': ['خ ل ق', 'He created / creation'],
        'غاسق': ['غ س ق', 'darkness'],
        'وقب': ['و ق ب', 'when it settles'],
        'النفاثات': ['ن ف ث', 'the ones who blow'],
        'العقد': ['ع ق د', 'the knots'],
        'حاسد': ['ح س د', 'an envier'],
        'حسد': ['ح س د', 'envies'],
        'الناس': ['ن و س', 'mankind / the people'],
        'الوسواس': ['و س و س', 'the whisperer'],
        'الخناس': ['خ ن س', 'the retreater (sneaky)'],
        'يوسوس': ['و س و س', 'whispers'],
        'صدور': ['ص د ر', 'chests / hearts'],
        'الجنه': ['ج ن ن', 'the jinn'],

        // ===== COMMON DUA VERBS =====
        'اسالك': ['س أ ل', 'I ask You'],
        'اغفر': ['غ ف ر', 'forgive'],
        'فاغفر': ['غ ف ر', 'so forgive'],
        'يغفر': ['غ ف ر', 'forgives'],
        'تغفر': ['غ ف ر', 'You forgive'],
        'غفرانك': ['غ ف ر', 'Your forgiveness'],
        'ارحمهما': ['ر ح م', 'have mercy on them both'],
        'ارحمنا': ['ر ح م', 'have mercy on us'],
        'رحمه': ['ر ح م', 'mercy / a mercy'],
        'رحمتك': ['ر ح م', 'Your mercy'],
        'برحمتك': ['ر ح م', 'by Your mercy'],
        'ارحم': ['ر ح م', 'most merciful'],
        'الراحمين': ['ر ح م', 'the most merciful ones'],
        'وقنا': ['و ق ي', 'and protect us'],
        'عذاب': ['ع ذ ب', 'punishment / torment'],
        'النار': ['ن و ر', 'the Fire'],
        'جهنم': ['ج ه ن م', 'Hell / Jahannam'],
        'اشف': ['ش ف ي', 'heal'],
        'شافي': ['ش ف ي', 'healer / curer'],
        'شفاء': ['ش ف ي', 'healing / cure'],
        'هب': ['و ه ب', 'grant / bestow'],
        'اشرح': ['ش ر ح', 'expand / open'],
        'يسر': ['ي س ر', 'ease / make easy'],
        'يسره': ['ي س ر', 'make it easy'],
        'بارك': ['ب ر ك', 'bless'],
        'باركت': ['ب ر ك', 'You have blessed'],
        'بركه': ['ب ر ك', 'blessing of'],
        'ثبت': ['ث ب ت', 'make firm / steady'],
        'افتح': ['ف ت ح', 'open'],
        'احلل': ['ح ل ل', 'untie / loosen'],
        'اجعلني': ['ج ع ل', 'make me'],
        'تجعل': ['ج ع ل', 'You make'],
        'جعلته': ['ج ع ل', 'You made it'],
        'اكفني': ['ك ف ي', 'suffice me'],
        'فاعف': ['ع ف و', 'so pardon'],
        'العفو': ['ع ف و', 'pardon / forgiveness'],
        'تحب': ['ح ب ب', 'You love'],
        'اقض': ['ق ض ي', 'settle / decree'],
        'فانصرنا': ['ن ص ر', 'so grant us victory'],
        'صل': ['ص ل و', 'send blessings upon'],
        'صلى': ['ص ل و', 'sent blessings'],
        'صليت': ['ص ل و', 'You sent blessings'],
        'سلم': ['س ل م', 'peace / bestow peace'],

        // ===== COMMON NOUNS =====
        'نفسا': ['ن ف س', 'a soul'],
        'نفسي': ['ن ف س', 'my soul / myself'],
        'انفسنا': ['ن ف س', 'ourselves'],
        'قلبي': ['ق ل ب', 'my heart'],
        'قلب': ['ق ل ب', 'a heart'],
        'قلوبنا': ['ق ل ب', 'our hearts'],
        'القلوب': ['ق ل ب', 'the hearts'],
        'مقلب': ['ق ل ب', 'Turner of'],
        'الابصار': ['ب ص ر', 'the eyes / sight'],
        'علما': ['ع ل م', 'knowledge'],
        'علم': ['ع ل م', 'knowledge'],
        'بعلمك': ['ع ل م', 'by Your knowledge'],
        'علام': ['ع ل م', 'Knower of'],
        'علمته': ['ع ل م', 'You taught someone'],
        'الغيوب': ['غ ي ب', 'the unseen things'],
        'الغيب': ['غ ي ب', 'the unseen'],
        'ذنبي': ['ذ ن ب', 'my sin'],
        'بذنبي': ['ذ ن ب', 'my sin'],
        'ذنوبنا': ['ذ ن ب', 'our sins'],
        'الذنوب': ['ذ ن ب', 'the sins'],
        'صدري': ['ص د ر', 'my chest / heart'],
        'لساني': ['ل س ن', 'my tongue'],
        'عقده': ['ع ق د', 'a knot'],
        'الصلاه': ['ص ل و', 'the prayer'],
        'الصلوه': ['ص ل و', 'the prayer'],
        'الدنيا': ['د ن و', 'this worldly life'],
        'الاخره': ['أ خ ر', 'the Hereafter'],
        'حسنه': ['ح س ن', 'goodness / a good deed'],
        'خيرا': ['خ ي ر', 'good / goodness'],
        'خير': ['خ ي ر', 'best / good'],
        'امري': ['أ م ر', 'my affair'],
        'الامر': ['أ م ر', 'the matter / affair'],
        'عبدك': ['ع ب د', 'Your servant'],
        'عبادك': ['ع ب د', 'Your servants'],
        'ابن': ['ب ن و', 'son of'],
        'امتك': ['أ م و', 'Your female servant'],
        'ناصيتي': ['ن ص ي', 'my forelock'],
        'بناصيته': ['ن ص ي', 'by his forelock'],
        'بيدك': ['ي د ي', 'in Your hand'],
        'الجنه': ['ج ن ن', 'Paradise'],
        'الجلال': ['ج ل ل', 'Majesty'],
        'الاكرام': ['ك ر م', 'Honor / Generosity'],
        'العرش': ['ع ر ش', 'the Throne'],
        'القران': ['ق ر أ', 'the Quran'],
        'ربيع': ['ر ب ع', 'spring / delight'],
        'نور': ['ن و ر', 'light'],
        'بنور': ['ن و ر', 'by the light of'],
        'ملاء': ['م ل أ', 'filling / fullness'],
        'دعاء': ['د ع و', 'supplication'],
        'دعوه': ['د ع و', 'a supplication'],
        'ذريه': ['ذ ر ر', 'offspring / progeny'],
        'ذريتي': ['ذ ر ر', 'my offspring'],
        'طيبه': ['ط ي ب', 'good / pure'],
        'والدي': ['و ل د', 'my parents'],
        'ربياني': ['ر ب و', 'they raised me'],
        'صغيرا': ['ص غ ر', 'when I was small'],

        // ===== COMMON PARTICLES & PREPOSITIONS =====
        'في': ['—', 'in / within'],
        'من': ['—', 'from / of'],
        'عن': ['—', 'from / about'],
        'على': ['—', 'upon / on'],
        'الى': ['—', 'to / toward'],
        'اليك': ['—', 'to You'],
        'اليه': ['—', 'to him / it'],
        'بين': ['—', 'between'],
        'بعد': ['—', 'after'],
        'قبل': ['—', 'before'],
        'عند': ['—', 'at / with'],
        'فوقك': ['—', 'above You'],
        'دونك': ['—', 'besides You'],
        'مع': ['—', 'with'],
        'بما': ['—', 'with what / by what'],
        'لها': ['—', 'for it (f.)'],
        'له': ['—', 'for him / to Him'],
        'لنا': ['—', 'for us'],
        'لي': ['—', 'for me'],
        'لك': ['—', 'for You / to You'],
        'بك': ['—', 'in You / by You'],
        'به': ['—', 'in it / by it'],
        'فيه': ['—', 'in it'],
        'في': ['—', 'in / concerning'],
        'عليها': ['—', 'upon it (f.)'],
        'علينا': ['—', 'upon us'],
        'علي': ['—', 'upon me'],
        'عنا': ['—', 'from us'],
        'عني': ['—', 'from me'],
        'عنه': ['—', 'from him / it'],
        'منه': ['—', 'from him / from it'],
        'بي': ['—', 'in me / with me'],

        // ===== CONJUNCTIONS & NEGATION =====
        'لا': ['—', 'no / not'],
        'لم': ['—', 'did not (past negation)'],
        'ان': ['—', 'that / indeed'],
        'انك': ['—', 'indeed You'],
        'اني': ['—', 'indeed I'],
        'انه': ['—', 'indeed it / he'],
        'بان': ['—', 'because / that'],
        'اذا': ['—', 'when / if'],
        'اذ': ['—', 'when (past)'],
        'كما': ['—', 'just as / as'],
        'او': ['—', 'or'],
        'ثم': ['—', 'then'],
        'ما': ['—', 'what / that which'],
        'من': ['—', 'who / whoever'],

        // ===== PRONOUNS =====
        'انت': ['—', 'You (God)'],
        'انا': ['—', 'I / me'],
        'هذا': ['—', 'this'],
        'كنت': ['ك و ن', 'I was / You were'],
        'كنا': ['ك و ن', 'we were'],

        // ===== MORE DUA VOCABULARY =====
        'الهم': ['ه م م', 'worry / anxiety'],
        'الحزن': ['ح ز ن', 'sadness / grief'],
        'حزني': ['ح ز ن', 'my grief'],
        'همي': ['ه م م', 'my worry'],
        'العجز': ['ع ج ز', 'inability'],
        'الكسل': ['ك س ل', 'laziness'],
        'البخل': ['ب خ ل', 'stinginess'],
        'الجبن': ['ج ب ن', 'cowardice'],
        'الدين': ['د ي ن', 'the debt / religion'],
        'ضلع': ['ض ل ع', 'burden of'],
        'غلبه': ['غ ل ب', 'domination of / being overcome by'],
        'الرجال': ['ر ج ل', 'men / people'],
        'الفقر': ['ف ق ر', 'poverty'],
        'طاعتك': ['ط و ع', 'Your obedience'],
        'المعاصي': ['ع ص ي', 'sins / disobedience'],
        'تقواها': ['و ق ي', 'its piety'],
        'زكها': ['ز ك و', 'purify it'],
        'زكاها': ['ز ك و', 'purified it'],
        'وليها': ['و ل ي', 'its Guardian'],
        'مولاها': ['و ل ي', 'its Protector'],
        'العافيه': ['ع ف و', 'wellbeing / safety'],
        'المعافاه': ['ع ف و', 'lasting wellbeing'],
        'الدائمه': ['د و م', 'the lasting / permanent'],
        'اصبحنا': ['ص ب ح', 'we have entered the morning'],
        'اصبح': ['ص ب ح', 'has entered the morning'],
        'حسبي': ['ح س ب', 'sufficient for me'],
        'توكلت': ['و ك ل', 'I have placed my trust'],
        'اسلمت': ['س ل م', 'I have submitted'],
        'امنت': ['أ م ن', 'I have believed'],
        'انبت': ['ن و ب', 'I have turned in repentance'],
        'خاصمت': ['خ ص م', 'I have disputed'],
        'حاكمت': ['ح ك م', 'I have sought judgment'],
        'رضيت': ['ر ض ي', 'I am pleased / I accept'],
        'بالاسلام': ['س ل م', 'with Islam'],
        'محمد': ['ح م د', 'Muhammad ﷺ'],
        'نبيا': ['ن ب أ', 'as a Prophet'],
        'ال': ['—', 'family of'],
        'ابراهيم': ['—', 'Ibrahim (Abraham)'],
        'الرسول': ['ر س ل', 'the Messenger'],
        'رسله': ['ر س ل', 'His messengers'],
        'المؤمنون': ['أ م ن', 'the believers'],
        'المؤمنين': ['أ م ن', 'the believers'],
        'سمعنا': ['س م ع', 'we hear / we heard'],
        'اطعنا': ['ط و ع', 'we obey / we obeyed'],
        'المصير': ['ص ي ر', 'the destination / return'],
        'يكلف': ['ك ل ف', 'burdens / charges'],
        'وسعها': ['و س ع', 'its capacity'],
        'كسبت': ['ك س ب', 'it earned'],
        'اكتسبت': ['ك س ب', 'it has earned'],
        'تؤاخذنا': ['أ خ ذ', 'hold us accountable'],
        'نسينا': ['ن س ي', 'we forgot'],
        'اخطانا': ['خ ط أ', 'we erred'],
        'تحمل': ['ح م ل', 'place / burden'],
        'اصرا': ['أ ص ر', 'a burden / hardship'],
        'حملته': ['ح م ل', 'You placed it'],
        'قبلنا': ['ق ب ل', 'before us'],
        'طاقه': ['ط و ق', 'power / ability'],

        // ===== ISTIKHARAH DUA =====
        'استخيرك': ['خ ي ر', 'I seek Your guidance'],
        'استقدرك': ['ق د ر', 'I seek Your power'],
        'بقدرتك': ['ق د ر', 'by Your power'],
        'فضلك': ['ف ض ل', 'Your bounty'],
        'تقدر': ['ق د ر', 'You have power'],
        'اقدر': ['ق د ر', 'I do not have power'],
        'تعلم': ['ع ل م', 'You know'],
        'اعلم': ['ع ل م', 'I know'],
        'معاشي': ['ع ي ش', 'my livelihood'],
        'عاقبه': ['ع ق ب', 'consequence / end'],
        'فاقدره': ['ق د ر', 'then decree it'],
        'فاصرفه': ['ص ر ف', 'then turn it away'],
        'اصرفني': ['ص ر ف', 'turn me away'],

        // ===== SAYYID AL-ISTIGHFAR =====
        'خلقتني': ['خ ل ق', 'You created me'],
        'عبدك': ['ع ب د', 'Your servant'],
        'عهدك': ['ع ه د', 'Your covenant'],
        'وعدك': ['و ع د', 'Your promise'],
        'استطعت': ['ط و ع', 'I am able'],
        'صنعت': ['ص ن ع', 'I have done'],
        'ابوء': ['ب و أ', 'I acknowledge'],
        'بنعمتك': ['ن ع م', 'Your favor / blessings'],

        // ===== PROTECTION DUAS =====
        'بكلمات': ['ك ل م', 'by the words of'],
        'التامات': ['ت م م', 'the perfect (words)'],
        'يضر': ['ض ر ر', 'harms'],
        'اسمه': ['س م و', 'His name'],
        'اسم': ['س م و', 'a name'],
        'سميت': ['س م و', 'You named'],
        'فتنه': ['ف ت ن', 'trial / tribulation'],
        'المحيا': ['ح ي ي', 'life'],
        'الممات': ['م و ت', 'death'],
        'المسيح': ['م س ح', 'the Messiah'],
        'الدجال': ['د ج ل', 'the Antichrist (Dajjal)'],
        'القبر': ['ق ب ر', 'the grave'],
        'الخبث': ['خ ب ث', 'male evil (jinn)'],
        'الخبائث': ['خ ب ث', 'female evil (jinn)'],

        // ===== IBRAHIMIC PRAYER =====
        'محمد': ['ح م د', 'Muhammad ﷺ'],
        'ابراهيم': ['—', 'Ibrahim (Abraham) ﷺ'],

        // ===== NATURE & COSMIC =====
        'السبع': ['س ب ع', 'the seven'],
        'التوراه': ['—', 'the Torah'],
        'الانجيل': ['—', 'the Gospel (Injeel)'],
        'الفرقان': ['ف ر ق', 'the Criterion (Quran)'],
        'فالق': ['ف ل ق', 'Splitter / Cleaver of'],
        'الحب': ['ح ب ب', 'the seed'],
        'النوى': ['ن و ي', 'the date-stone'],

        // ===== MISC IMPORTANT WORDS =====
        'سبحانك': ['س ب ح', 'Glory be to You'],
        'سبحان': ['س ب ح', 'Glory be to'],
        'الظالمين': ['ظ ل م', 'the wrongdoers'],
        'ظلمنا': ['ظ ل م', 'we have wronged'],
        'زدني': ['ز ي د', 'increase me'],
        'نافعا': ['ن ف ع', 'beneficial'],
        'ينفع': ['ن ف ع', 'benefits'],
        'يخشع': ['خ ش ع', 'is humbled'],
        'تشبع': ['ش ب ع', 'is satisfied'],
        'يستجاب': ['ج و ب', 'is answered'],
        'رزقا': ['ر ز ق', 'provision'],
        'طيبا': ['ط ي ب', 'good / pure'],
        'عملا': ['ع م ل', 'a deed'],
        'متقبلا': ['ق ب ل', 'accepted'],
        'مقيم': ['ق و م', 'establisher of'],
        'تقبل': ['ق ب ل', 'accept'],
        'صالحا': ['ص ل ح', 'righteous (deed)'],
        'الصالحين': ['ص ل ح', 'the righteous'],
        'ترضاه': ['ر ض ي', 'that pleases You'],
        'ادخلني': ['د خ ل', 'admit me'],
        'اوزعني': ['و ز ع', 'inspire me'],
        'اشكر': ['ش ك ر', 'to be grateful'],
        'نعمتك': ['ن ع م', 'Your blessing'],
        'الضر': ['ض ر ر', 'the affliction / harm'],
        'مسني': ['م س س', 'has afflicted me'],
        'سقما': ['س ق م', 'sickness'],
        'يغادر': ['غ د ر', 'leaves behind'],
        'مذهب': ['ذ ه ب', 'Remover of'],
        'الباس': ['ب أ س', 'the suffering / hardship'],
        'يفقهوا': ['ف ق ه', 'they understand'],
        'قولي': ['ق و ل', 'my speech'],
        'قول': ['ق و ل', 'a saying / word'],
        'عمل': ['ع م ل', 'a deed'],
        'حسنت': ['ح س ن', 'You have made good'],
        'خلقي': ['خ ل ق', 'my creation / form'],
        'فحسن': ['ح س ن', 'so make good'],
        'خلقي': ['خ ل ق', 'my character'],
        'بحلالك': ['ح ل ل', 'with Your lawful'],
        'حرامك': ['ح ر م', 'Your unlawful'],
        'اغنني': ['غ ن ي', 'enrich me / make me free of need'],
        'سواك': ['س و ي', 'other than You'],
        'سهلا': ['س ه ل', 'easy'],
        'سهل': ['س ه ل', 'easy / there is no ease'],
        'شئت': ['ش ي أ', 'You will / wish'],
        'وحده': ['و ح د', 'alone / uniquely'],
        'شريك': ['ش ر ك', 'partner'],
        'كل': ['ك ل ل', 'every / all'],
        'كله': ['ك ل ل', 'all of it'],
        'دقه': ['د ق ق', 'its minor'],
        'جله': ['ج ل ل', 'its major'],
        'اوله': ['أ و ل', 'its first'],
        'اخره': ['أ خ ر', 'its last'],
        'علانيته': ['ع ل ن', 'its open / public'],
        'سره': ['س ر ر', 'its secret'],
        'قدمت': ['ق د م', 'I have put forward'],
        'اخرت': ['أ خ ر', 'I delayed'],
        'اسررت': ['س ر ر', 'I concealed'],
        'اعلنت': ['ع ل ن', 'I declared'],
        'اشهد': ['ش ه د', 'I testify / bear witness'],
        'كتابك': ['ك ت ب', 'Your Book'],
        'كتبه': ['ك ت ب', 'His books'],
        'ملائكته': ['م ل ك', 'His angels'],
        'نفرق': ['ف ر ق', 'we differentiate'],
        'توفاها': ['و ف ي', 'You take its soul'],
        'احييتها': ['ح ي ي', 'You give it life'],
        'فاحفظها': ['ح ف ظ', 'then protect it'],
        'امتها': ['م و ت', 'You cause it to die'],
        'مماتها': ['م و ت', 'its death'],
        'محياها': ['ح ي ي', 'its life'],
        'خلقك': ['خ ل ق', 'Your creation'],
        'باقيتني': ['ب ق ي', 'You keep me alive'],
        'ابقيتني': ['ب ق ي', 'You keep me alive'],
        'حكمك': ['ح ك م', 'Your decree'],
        'قضاؤك': ['ق ض ي', 'Your judgment'],
        'ماض': ['م ض ي', 'executed / enacted'],
        'استاثرت': ['أ ث ر', 'You kept exclusively'],
        'انزلته': ['ن ز ل', 'You revealed it'],
        'انزل': ['ن ز ل', 'was revealed'],
        'جلاء': ['ج ل و', 'removal / departure of'],
        'ذهاب': ['ذ ه ب', 'going away of'],
        'مولانا': ['و ل ي', 'our Protector'],
        'اقدامنا': ['ق د م', 'our feet'],
        'الكافرين': ['ك ف ر', 'the disbelievers'],
        'القوم': ['ق و م', 'the people'],
        'المستضعفين': ['ض ع ف', 'the oppressed / weak'],
        'لمنقلبون': ['ق ل ب', 'surely returning'],
        'تكلني': ['و ك ل', 'leave me to'],
        'طرفه': ['ط ر ف', 'blink of'],
        'عين': ['ع ي ن', 'an eye'],
        'شاني': ['ش أ ن', 'my affairs / condition'],
        'اصلح': ['ص ل ح', 'rectify / set right'],
        'يعنيني': ['ع ن ي', 'concerns me'],
        'حسن': ['ح س ن', 'excellence / beauty of'],
        'سخطك': ['س خ ط', 'Your displeasure'],
        'غضبك': ['غ ض ب', 'Your anger'],
        'عافيتك': ['ع ف و', 'Your protection'],
        'عقوبتك': ['ع ق ب', 'Your punishment'],
        'العتبى': ['ع ت ب', 'appeasement / making amends'],
        'احصي': ['ح ص ي', 'enumerate / count'],
        'ثناء': ['ث ن ي', 'praise'],
        'اثني': ['ث ن ي', 'I praise'],

        // ===== Connector words appearing frequently =====
        'وهو': ['—', 'and He is'],
        'فانه': ['—', 'for indeed it'],
        'فانك': ['—', 'for indeed You'],
    };

    // Strip Arabic diacritics for dictionary lookup
    function stripDiacritics(text) {
        return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\uFE70-\uFE7F]/g, '')
                   .replace(/\u0671/g, '\u0627') // alef wasla → alef
                   .replace(/ٰ/g, '')            // superscript alef
                   .replace(/ى/g, 'ي')           // alef maqsura → ya
                   .replace(/ة/g, 'ه')           // ta marbuta → ha
                   .replace(/ؤ/g, 'و')           // hamza on waw
                   .replace(/ئ/g, 'ي')           // hamza on ya
                   .replace(/أ|إ|آ/g, 'ا')       // hamza forms → alef
                   .trim();
    }

    function lookupWord(rawWord) {
        const cleaned = rawWord.replace(/[۞ۚۖۗ،,\.]/g, '').trim();
        if (!cleaned) return null;
        const stripped = stripDiacritics(cleaned);
        // Try exact match first
        if (ARABIC_DICT[stripped]) {
            return { word: cleaned, root: ARABIC_DICT[stripped][0], meaning: ARABIC_DICT[stripped][1] };
        }
        // Try without leading و (conjunction)
        if (stripped.startsWith('و') && stripped.length > 2) {
            const withoutWaw = stripped.slice(1);
            if (ARABIC_DICT[withoutWaw]) {
                return { word: cleaned, root: ARABIC_DICT[withoutWaw][0], meaning: 'and ' + ARABIC_DICT[withoutWaw][1] };
            }
        }
        // Try without leading ف
        if (stripped.startsWith('ف') && stripped.length > 2) {
            const withoutFa = stripped.slice(1);
            if (ARABIC_DICT[withoutFa]) {
                return { word: cleaned, root: ARABIC_DICT[withoutFa][0], meaning: 'so ' + ARABIC_DICT[withoutFa][1] };
            }
        }
        // Try without leading بال / وال / لل / ال
        for (const prefix of ['بال', 'وال', 'لل', 'ال', 'ب', 'ل', 'ك']) {
            if (stripped.startsWith(prefix) && stripped.length > prefix.length + 1) {
                const base = stripped.slice(prefix.length);
                if (ARABIC_DICT[base]) {
                    let prefixMeaning = prefix === 'ب' ? 'by/with ' : prefix === 'ل' ? 'for/to ' : prefix === 'ك' ? 'like ' : '';
                    return { word: cleaned, root: ARABIC_DICT[base][0], meaning: prefixMeaning + ARABIC_DICT[base][1] };
                }
            }
        }
        return { word: cleaned, root: null, meaning: null };
    }

    // Word popup elements
    let wordPopup = null;
    let activeWordSpan = null;

    function createWordPopup() {
        wordPopup = document.createElement('div');
        wordPopup.className = 'word-popup';
        wordPopup.innerHTML = `
            <div class="word-popup-arrow arrow-bottom"></div>
            <div class="word-popup-arabic"></div>
            <div class="word-popup-divider"></div>
            <div class="word-popup-root-label">Root letters</div>
            <div class="word-popup-root"></div>
            <div class="word-popup-divider"></div>
            <div class="word-popup-meaning"></div>
        `;
        document.body.appendChild(wordPopup);
    }

    function showWordPopup(span, data) {
        if (!wordPopup) createWordPopup();
        if (activeWordSpan) activeWordSpan.classList.remove('active-word');
        activeWordSpan = span;
        span.classList.add('active-word');

        const arabicEl = wordPopup.querySelector('.word-popup-arabic');
        const rootEl = wordPopup.querySelector('.word-popup-root');
        const rootLabelEl = wordPopup.querySelector('.word-popup-root-label');
        const meaningEl = wordPopup.querySelector('.word-popup-meaning');
        const arrow = wordPopup.querySelector('.word-popup-arrow');

        arabicEl.textContent = data.word;
        if (data.root && data.root !== '—') {
            rootLabelEl.style.display = '';
            rootEl.style.display = '';
            rootEl.textContent = data.root;
            rootEl.previousElementSibling.style.display = '';
        } else {
            rootLabelEl.style.display = 'none';
            rootEl.style.display = 'none';
            rootEl.previousElementSibling.style.display = 'none';
        }
        if (data.meaning) {
            meaningEl.style.display = '';
            meaningEl.textContent = data.meaning;
            meaningEl.previousElementSibling.style.display = '';
        } else {
            meaningEl.style.display = 'none';
            meaningEl.previousElementSibling.style.display = 'none';
        }

        // Position popup above the word
        wordPopup.classList.remove('visible');
        wordPopup.style.left = '0';
        wordPopup.style.top = '0';
        wordPopup.style.display = 'block';

        requestAnimationFrame(() => {
            const rect = span.getBoundingClientRect();
            const popupRect = wordPopup.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let left = rect.left + rect.width / 2 - popupRect.width / 2;
            left = Math.max(8, Math.min(left, vw - popupRect.width - 8));

            let top = rect.top - popupRect.height - 10;
            let arrowOnTop = false;

            if (top < 8) {
                top = rect.bottom + 10;
                arrowOnTop = true;
            }

            arrow.className = arrowOnTop ? 'word-popup-arrow arrow-top' : 'word-popup-arrow arrow-bottom';

            // Adjust arrow horizontal position to point at word center
            const wordCenter = rect.left + rect.width / 2;
            const arrowLeft = wordCenter - left;
            arrow.style.left = Math.max(16, Math.min(arrowLeft, popupRect.width - 16)) + 'px';

            wordPopup.style.left = left + 'px';
            wordPopup.style.top = top + 'px';
            wordPopup.classList.add('visible');
        });
    }

    function dismissWordPopup() {
        if (wordPopup) wordPopup.classList.remove('visible');
        if (activeWordSpan) {
            activeWordSpan.classList.remove('active-word');
            activeWordSpan = null;
        }
    }

    function wrapArabicWords() {
        document.querySelectorAll('.arabic-text').forEach(el => {
            // Ensure proper lang/dir for Arabic content
            if (!el.hasAttribute('lang')) el.setAttribute('lang', 'ar');
            if (!el.hasAttribute('dir')) el.setAttribute('dir', 'rtl');

            if (el.dataset.wordsWrapped) return;
            const text = el.textContent;
            // Split on whitespace, preserving decorative symbols as separate tokens
            const tokens = text.split(/(\s+)/);
            el.innerHTML = '';
            tokens.forEach(token => {
                if (/^\s+$/.test(token)) {
                    el.appendChild(document.createTextNode(token));
                    return;
                }
                // Skip if it's only decorative symbols
                const cleaned = token.replace(/[۞ۚۖۗ]/g, '').trim();
                if (!cleaned) {
                    el.appendChild(document.createTextNode(token));
                    return;
                }
                const span = document.createElement('span');
                span.className = 'arabic-word';
                span.textContent = token;
                span.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const data = lookupWord(this.textContent);
                    if (data) showWordPopup(this, data);
                });
                el.appendChild(span);
            });
            el.dataset.wordsWrapped = '1';
        });
    }

    // Dismiss on tap outside or scroll
    document.addEventListener('click', function(e) {
        if (wordPopup && !wordPopup.contains(e.target) && !e.target.classList.contains('arabic-word')) {
            dismissWordPopup();
        }
    });
    window.addEventListener('scroll', dismissWordPopup, { passive: true });

    // ===== PRAYER TIMES & QIBLA =====
    const PRAYER_NAMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const REMINDER_PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const REMINDER_SOUND_OPTIONS = [
        {
            id: 'adhan-alafasy',
            labelEn: 'Full Adhan — Mishary Rashid Alafasy',
            labelPs: 'بشپړ اذان — مشاري راشد العفاسي',
            source: 'local',
            file: 'audio/reminders/adhan-alafasy.mp3',
            clipDuration: 40
        },
        {
            id: 'adhan-abdulbasit',
            labelEn: 'Full Adhan — Abdul Basit',
            labelPs: 'بشپړ اذان — عبدالباسط',
            source: 'local',
            file: 'audio/reminders/adhan-abdulbasit.mp3',
            clipDuration: 40
        },
        {
            id: 'adhan-short',
            labelEn: 'Short Adhan (Opening Takbeer)',
            labelPs: 'لنډ اذان (د تکبیر پیل)',
            source: 'local',
            file: 'audio/reminders/adhan-short.mp3',
            clipDuration: 10
        },
        {
            id: 'takbeer',
            labelEn: 'Takbeer Only',
            labelPs: 'یوازې تکبیر',
            source: 'local',
            file: 'audio/reminders/takbeer.mp3',
            clipDuration: 5
        },
        {
            id: 'nasheed',
            labelEn: 'Soft Islamic Nasheed',
            labelPs: 'نرم اسلامي نشید',
            source: 'local',
            file: 'audio/reminders/nasheed-tone.mp3',
            clipDuration: 8
        },
        {
            id: 'bell',
            labelEn: 'Simple Bell Chime',
            labelPs: 'ساده زنګ',
            source: 'local',
            file: 'audio/reminders/bell-chime.mp3',
            clipDuration: 5
        },
        {
            id: 'ding',
            labelEn: 'Soft Ding',
            labelPs: 'نرم ډینګ',
            source: 'local',
            file: 'audio/reminders/soft-ding.mp3',
            clipDuration: 2
        },
        {
            id: 'silent',
            labelEn: 'Silent (No Sound)',
            labelPs: 'بې غږه (هیڅ غږ نشته)',
            source: 'silent',
            clipDuration: 0
        }
    ];
    const LEGACY_REMINDER_SOUND_ID_MAP = {
        adhan_mishary: 'adhan-alafasy',
        adhan_abdulbasit: 'adhan-abdulbasit',
        adhan_short: 'adhan-short',
        takbeer: 'takbeer',
        nasheed_soft: 'nasheed',
        bell_chime: 'bell',
        soft_ding: 'ding'
    };
    const PRAYER_LABELS_EN = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    const PRAYER_LABELS_PS = { fajr: 'سهار', sunrise: 'لمر ختل', dhuhr: 'غرمه', asr: 'مازديګر', maghrib: 'ماښام', isha: 'ماخستن' };
    const PRAYER_ICONS = { fajr: '🌅', sunrise: '☀️', dhuhr: '🕛', asr: '🌤', maghrib: '🌇', isha: '🌙' };
    const KAABA_LAT = 21.4225;
    const KAABA_LNG = 39.8262;

    const AFGHAN_CITIES = [
        { key: 'kabul', en: 'Kabul', ps: 'کابل', lat: 34.5553, lng: 69.2075 },
        { key: 'kandahar', en: 'Kandahar', ps: 'کندهار', lat: 31.6133, lng: 65.7101 },
        { key: 'herat', en: 'Herat', ps: 'هرات', lat: 34.3529, lng: 62.2040 },
        { key: 'mazar-i-sharif', en: 'Mazar-i-Sharif', ps: 'مزار شریف', lat: 36.7069, lng: 67.1104 },
        { key: 'jalalabad', en: 'Jalalabad', ps: 'جلال آباد', lat: 34.4253, lng: 70.4528 },
        { key: 'kunduz', en: 'Kunduz', ps: 'کندز', lat: 36.7280, lng: 68.8680 },
        { key: 'lashkar-gah', en: 'Lashkar Gah', ps: 'لښکرګاه', lat: 31.5930, lng: 64.3700 },
        { key: 'ghazni', en: 'Ghazni', ps: 'غزني', lat: 33.5536, lng: 68.4270 },
        { key: 'khost', en: 'Khost', ps: 'خوست', lat: 33.3386, lng: 69.9203 },
        { key: 'gardez', en: 'Gardez', ps: 'ګردېز', lat: 33.5973, lng: 69.2215 },
        { key: 'faizabad', en: 'Faizabad', ps: 'فیض آباد', lat: 37.1164, lng: 70.5787 },
        { key: 'pul-e-khumri', en: 'Pul-e-Khumri', ps: 'پلخمري', lat: 35.9486, lng: 68.7139 },
        { key: 'sheberghan', en: 'Sheberghan', ps: 'شبرغان', lat: 36.6675, lng: 65.7541 },
        { key: 'taloqan', en: 'Taloqan', ps: 'تالقان', lat: 36.7360, lng: 69.5345 },
        { key: 'zaranj', en: 'Zaranj', ps: 'زرنج', lat: 30.9600, lng: 61.8610 },
        { key: 'bamyan', en: 'Bamyan', ps: 'بامیان', lat: 34.8210, lng: 67.8310 },
        { key: 'mehtarlam', en: 'Mehtarlam', ps: 'مهترلام', lat: 34.6531, lng: 70.2097 },
        { key: 'asadabad', en: 'Asadabad', ps: 'اسعد آباد', lat: 34.8660, lng: 71.1497 },
        { key: 'charikar', en: 'Charikar', ps: 'چاریکار', lat: 35.0146, lng: 69.1723 },
        { key: 'farah', en: 'Farah', ps: 'فراه', lat: 32.3735, lng: 62.1116 },
        { key: 'samangan', en: 'Samangan', ps: 'سمنگان', lat: 36.3165, lng: 68.0196 },
        { key: 'nili', en: 'Nili', ps: 'نیلي', lat: 33.7222, lng: 66.1308 },
        { key: 'tarinkot', en: 'Tarinkot', ps: 'ترینکوټ', lat: 32.6271, lng: 65.8783 },
        { key: 'maidan-wardak', en: 'Maidan Wardak', ps: 'ميدان وردګ', lat: 34.3955, lng: 68.3530 }
    ];

    const GLOBAL_CITY_GROUPS = [
        {
            key: 'afghanistan',
            countryEn: 'Afghanistan',
            countryPs: 'افغانستان',
            flag: '🇦🇫',
            cities: AFGHAN_CITIES
        },
        {
            key: 'pakistan',
            countryEn: 'Pakistan',
            countryPs: 'پاکستان',
            flag: '🇵🇰',
            cities: [
                { key: 'islamabad', en: 'Islamabad', ps: 'اسلام آباد', lat: 33.6844, lng: 73.0479 },
                { key: 'karachi', en: 'Karachi', ps: 'کراچۍ', lat: 24.8607, lng: 67.0011 },
                { key: 'lahore', en: 'Lahore', ps: 'لاهور', lat: 31.5204, lng: 74.3587 },
                { key: 'peshawar', en: 'Peshawar', ps: 'پېښور', lat: 34.0151, lng: 71.5249 },
                { key: 'quetta', en: 'Quetta', ps: 'کوټه', lat: 30.1798, lng: 66.9750 }
            ]
        },
        {
            key: 'uae',
            countryEn: 'United Arab Emirates',
            countryPs: 'متحده عربي امارات',
            flag: '🇦🇪',
            cities: [
                { key: 'dubai', en: 'Dubai', ps: 'دوبۍ', lat: 25.2048, lng: 55.2708 },
                { key: 'abu-dhabi', en: 'Abu Dhabi', ps: 'ابوظهبي', lat: 24.4539, lng: 54.3773 }
            ]
        },
        {
            key: 'saudi-arabia',
            countryEn: 'Saudi Arabia',
            countryPs: 'سعودي عربستان',
            flag: '🇸🇦',
            cities: [
                { key: 'riyadh', en: 'Riyadh', ps: 'ریاض', lat: 24.7136, lng: 46.6753 },
                { key: 'jeddah', en: 'Jeddah', ps: 'جده', lat: 21.4858, lng: 39.1925 },
                { key: 'mecca', en: 'Mecca', ps: 'مکه', lat: 21.3891, lng: 39.8579 },
                { key: 'medina', en: 'Medina', ps: 'مدینه', lat: 24.5247, lng: 39.5692 }
            ]
        },
        {
            key: 'turkey',
            countryEn: 'Turkey',
            countryPs: 'ترکیه',
            flag: '🇹🇷',
            cities: [
                { key: 'istanbul', en: 'Istanbul', ps: 'استانبول', lat: 41.0082, lng: 28.9784 },
                { key: 'ankara', en: 'Ankara', ps: 'انقره', lat: 39.9334, lng: 32.8597 }
            ]
        },
        {
            key: 'united-kingdom',
            countryEn: 'United Kingdom',
            countryPs: 'انګلستان',
            flag: '🇬🇧',
            cities: [
                { key: 'london', en: 'London', ps: 'لندن', lat: 51.5074, lng: -0.1278 },
                { key: 'birmingham', en: 'Birmingham', ps: 'برمنګهم', lat: 52.4862, lng: -1.8904 },
                { key: 'manchester', en: 'Manchester', ps: 'مانچسټر', lat: 53.4808, lng: -2.2426 },
                { key: 'bradford', en: 'Bradford', ps: 'براډفورډ', lat: 53.7960, lng: -1.7594 },
                { key: 'leeds', en: 'Leeds', ps: 'لېډز', lat: 53.8008, lng: -1.5491 },
                { key: 'glasgow', en: 'Glasgow', ps: 'ګلاسګو', lat: 55.8642, lng: -4.2518 },
                { key: 'edinburgh', en: 'Edinburgh', ps: 'اېډینبرګ', lat: 55.9533, lng: -3.1883 },
                { key: 'luton', en: 'Luton', ps: 'لوټن', lat: 51.8787, lng: -0.4200 },
                { key: 'slough', en: 'Slough', ps: 'سلاؤ', lat: 51.5105, lng: -0.5950 },
                { key: 'sheffield', en: 'Sheffield', ps: 'شفیلډ', lat: 53.3811, lng: -1.4701 }
            ]
        },
        {
            key: 'germany',
            countryEn: 'Germany',
            countryPs: 'جرمني',
            flag: '🇩🇪',
            cities: [
                { key: 'hamburg', en: 'Hamburg', ps: 'هامبورګ', lat: 53.5511, lng: 9.9937 },
                { key: 'berlin', en: 'Berlin', ps: 'برلین', lat: 52.5200, lng: 13.4050 },
                { key: 'munich', en: 'Munich', ps: 'میونخ', lat: 48.1351, lng: 11.5820 }
            ]
        },
        {
            key: 'france',
            countryEn: 'France',
            countryPs: 'فرانسه',
            flag: '🇫🇷',
            cities: [
                { key: 'paris', en: 'Paris', ps: 'پاریس', lat: 48.8566, lng: 2.3522 }
            ]
        },
        {
            key: 'canada',
            countryEn: 'Canada',
            countryPs: 'کاناډا',
            flag: '🇨🇦',
            cities: [
                { key: 'toronto', en: 'Toronto', ps: 'ټورنټو', lat: 43.6532, lng: -79.3832 },
                { key: 'vancouver', en: 'Vancouver', ps: 'وانکوور', lat: 49.2827, lng: -123.1207 },
                { key: 'montreal', en: 'Montreal', ps: 'مونتریال', lat: 45.5017, lng: -73.5673 },
                { key: 'calgary', en: 'Calgary', ps: 'کلګري', lat: 51.0447, lng: -114.0719 },
                { key: 'ottawa', en: 'Ottawa', ps: 'اوټاوا', lat: 45.4215, lng: -75.6972 },
                { key: 'edmonton', en: 'Edmonton', ps: 'اېډمونټن', lat: 53.5461, lng: -113.4938 },
                { key: 'winnipeg', en: 'Winnipeg', ps: 'وینیپګ', lat: 49.8951, lng: -97.1384 },
                { key: 'mississauga', en: 'Mississauga', ps: 'میسیساګا', lat: 43.5890, lng: -79.6441 }
            ]
        },
        {
            key: 'united-states',
            countryEn: 'United States',
            countryPs: 'متحده ایالات',
            flag: '🇺🇸',
            cities: [
                { key: 'new-york', en: 'New York', ps: 'نیویارک', lat: 40.7128, lng: -74.0060 },
                { key: 'los-angeles', en: 'Los Angeles', ps: 'لاس انجلس', lat: 34.0522, lng: -118.2437 },
                { key: 'chicago', en: 'Chicago', ps: 'شیکاګو', lat: 41.8781, lng: -87.6298 },
                { key: 'houston', en: 'Houston', ps: 'هوسټن', lat: 29.7604, lng: -95.3698 },
                { key: 'phoenix', en: 'Phoenix', ps: 'فینکس', lat: 33.4484, lng: -112.0740 },
                { key: 'san-francisco', en: 'San Francisco', ps: 'سان فرانسسکو', lat: 37.7749, lng: -122.4194 },
                { key: 'washington-dc', en: 'Washington DC', ps: 'واشنګټن ډي سي', lat: 38.9072, lng: -77.0369 },
                { key: 'dallas', en: 'Dallas', ps: 'ډالاس', lat: 32.7767, lng: -96.7970 },
                { key: 'atlanta', en: 'Atlanta', ps: 'اټلانټا', lat: 33.7490, lng: -84.3880 },
                { key: 'detroit', en: 'Detroit', ps: 'ډیټرایټ', lat: 42.3314, lng: -83.0458 },
                { key: 'seattle', en: 'Seattle', ps: 'سیټل', lat: 47.6062, lng: -122.3321 },
                { key: 'denver', en: 'Denver', ps: 'ډېنور', lat: 39.7392, lng: -104.9903 },
                { key: 'boston', en: 'Boston', ps: 'بوسټن', lat: 42.3601, lng: -71.0589 },
                { key: 'minneapolis', en: 'Minneapolis', ps: 'مینیاپولیس', lat: 44.9778, lng: -93.2650 },
                { key: 'miami', en: 'Miami', ps: 'میامي', lat: 25.7617, lng: -80.1918 }
            ]
        },
        {
            key: 'australia',
            countryEn: 'Australia',
            countryPs: 'استرالیا',
            flag: '🇦🇺',
            cities: [
                { key: 'sydney', en: 'Sydney', ps: 'سډني', lat: -33.8688, lng: 151.2093 },
                { key: 'melbourne', en: 'Melbourne', ps: 'ملبورن', lat: -37.8136, lng: 144.9631 },
                { key: 'brisbane', en: 'Brisbane', ps: 'بریزبېن', lat: -27.4698, lng: 153.0251 },
                { key: 'perth', en: 'Perth', ps: 'پرت', lat: -31.9505, lng: 115.8605 },
                { key: 'adelaide', en: 'Adelaide', ps: 'اډلېډ', lat: -34.9285, lng: 138.6007 },
                { key: 'canberra', en: 'Canberra', ps: 'کانبرا', lat: -35.2809, lng: 149.1300 }
            ]
        },
        {
            key: 'netherlands',
            countryEn: 'Netherlands',
            countryPs: 'هالېنډ',
            flag: '🇳🇱',
            cities: [
                { key: 'amsterdam', en: 'Amsterdam', ps: 'امسټرډم', lat: 52.3676, lng: 4.9041 }
            ]
        },
        {
            key: 'belgium',
            countryEn: 'Belgium',
            countryPs: 'بلجیم',
            flag: '🇧🇪',
            cities: [
                { key: 'brussels', en: 'Brussels', ps: 'بروکسل', lat: 50.8503, lng: 4.3517 }
            ]
        },
        {
            key: 'austria',
            countryEn: 'Austria',
            countryPs: 'اتریش',
            flag: '🇦🇹',
            cities: [
                { key: 'vienna', en: 'Vienna', ps: 'ویانا', lat: 48.2082, lng: 16.3738 }
            ]
        },
        {
            key: 'sweden',
            countryEn: 'Sweden',
            countryPs: 'سویډن',
            flag: '🇸🇪',
            cities: [
                { key: 'stockholm', en: 'Stockholm', ps: 'سټاکهولم', lat: 59.3293, lng: 18.0686 }
            ]
        },
        {
            key: 'norway',
            countryEn: 'Norway',
            countryPs: 'ناروې',
            flag: '🇳🇴',
            cities: [
                { key: 'oslo', en: 'Oslo', ps: 'اوسلو', lat: 59.9139, lng: 10.7522 }
            ]
        },
        {
            key: 'denmark',
            countryEn: 'Denmark',
            countryPs: 'ډنمارک',
            flag: '🇩🇰',
            cities: [
                { key: 'copenhagen', en: 'Copenhagen', ps: 'کوپنهاګن', lat: 55.6761, lng: 12.5683 }
            ]
        },
        {
            key: 'qatar',
            countryEn: 'Qatar',
            countryPs: 'قطر',
            flag: '🇶🇦',
            cities: [
                { key: 'doha', en: 'Doha', ps: 'دوحه', lat: 25.2854, lng: 51.5310 }
            ]
        },
        {
            key: 'kuwait',
            countryEn: 'Kuwait',
            countryPs: 'کویت',
            flag: '🇰🇼',
            cities: [
                { key: 'kuwait-city', en: 'Kuwait City', ps: 'کویت ښار', lat: 29.3759, lng: 47.9774 }
            ]
        }
    ];

    const ALL_CITIES = GLOBAL_CITY_GROUPS.flatMap((group) =>
        group.cities.map((city) => ({
            ...city,
            countryKey: group.key,
            countryEn: group.countryEn,
            countryPs: group.countryPs,
            countryFlag: group.flag
        }))
    );

    const CITY_META = {
        kabul: { provinceEn: 'Kabul', provincePs: 'کابل', regionEn: 'Central', regionPs: 'مرکزي' },
        kandahar: { provinceEn: 'Kandahar', provincePs: 'کندهار', regionEn: 'South', regionPs: 'سوېل' },
        herat: { provinceEn: 'Herat', provincePs: 'هرات', regionEn: 'West', regionPs: 'لوېدیځ' },
        'mazar-i-sharif': { provinceEn: 'Balkh', provincePs: 'بلخ', regionEn: 'North', regionPs: 'شمال' },
        jalalabad: { provinceEn: 'Nangarhar', provincePs: 'ننګرهار', regionEn: 'East', regionPs: 'ختیځ' },
        kunduz: { provinceEn: 'Kunduz', provincePs: 'کندز', regionEn: 'North', regionPs: 'شمال' },
        'lashkar-gah': { provinceEn: 'Helmand', provincePs: 'هلمند', regionEn: 'Southwest', regionPs: 'سوېل لوېدیځ' },
        ghazni: { provinceEn: 'Ghazni', provincePs: 'غزني', regionEn: 'Southeast', regionPs: 'سوېل ختیځ' },
        khost: { provinceEn: 'Khost', provincePs: 'خوست', regionEn: 'Southeast', regionPs: 'سوېل ختیځ' },
        gardez: { provinceEn: 'Paktia', provincePs: 'پکتیا', regionEn: 'Southeast', regionPs: 'سوېل ختیځ' },
        faizabad: { provinceEn: 'Badakhshan', provincePs: 'بدخشان', regionEn: 'Northeast', regionPs: 'شمال ختیځ' },
        'pul-e-khumri': { provinceEn: 'Baghlan', provincePs: 'بغلان', regionEn: 'North', regionPs: 'شمال' },
        sheberghan: { provinceEn: 'Jawzjan', provincePs: 'جوزجان', regionEn: 'Northwest', regionPs: 'شمال لوېدیځ' },
        taloqan: { provinceEn: 'Takhar', provincePs: 'تخار', regionEn: 'Northeast', regionPs: 'شمال ختیځ' },
        zaranj: { provinceEn: 'Nimruz', provincePs: 'نیمروز', regionEn: 'Southwest', regionPs: 'سوېل لوېدیځ' },
        bamyan: { provinceEn: 'Bamyan', provincePs: 'بامیان', regionEn: 'Central Highlands', regionPs: 'مرکزي لوړې سیمې' },
        mehtarlam: { provinceEn: 'Laghman', provincePs: 'لغمان', regionEn: 'East', regionPs: 'ختیځ' },
        asadabad: { provinceEn: 'Kunar', provincePs: 'کنړ', regionEn: 'East', regionPs: 'ختیځ' },
        charikar: { provinceEn: 'Parwan', provincePs: 'پروان', regionEn: 'Central', regionPs: 'مرکزي' },
        farah: { provinceEn: 'Farah', provincePs: 'فراه', regionEn: 'West', regionPs: 'لوېدیځ' },
        samangan: { provinceEn: 'Samangan', provincePs: 'سمنگان', regionEn: 'North', regionPs: 'شمال' },
        nili: { provinceEn: 'Daykundi', provincePs: 'دایکندي', regionEn: 'Central Highlands', regionPs: 'مرکزي لوړې سیمې' },
        tarinkot: { provinceEn: 'Uruzgan', provincePs: 'اروزګان', regionEn: 'South', regionPs: 'سوېل' },
        'maidan-wardak': { provinceEn: 'Maidan Wardak', provincePs: 'میدان وردګ', regionEn: 'Central', regionPs: 'مرکزي' }
    };

    const CITY_COUNTRY_ORDER = GLOBAL_CITY_GROUPS.map(group => group.key);

    let prayerTimesData = null;
    let countdownInterval = null;
    let compassWatchId = null;
    let userQibla = null;
    let reminderSettings = null;
    let reminderAudio = {};
    let reminderPreviewAudio = null;
    let reminderPreviewButton = null;
    let reminderPreviewStop = null;
    let reminderMidnightTimer = null;
    let dailyReminderRescheduleTimeout = null;
    let isGpsResolving = false;
    let detectedGpsCityKey = null;
    let compassEventTimer = null;
    let latestCompassHeading = null;
    let currentNeedleRotation = 0;
    let lastQiblaDistanceKm = null;
    let prayerPanelHydrated = false;
    const PRAYER_SUBTAB_STORAGE_KEY = 'crown_prayer_active_tab';
    let nativeAndroidReminderState = null;
    let nativeAndroidReminderBootstrapDone = false;
    let lastNativePermissionPromptKey = null;
    const ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE = 'Please grant notification and alarm permissions to enable reminders.';

    function getAndroidReminderBridge() {
        if (typeof window === 'undefined') return null;
        const bridge = window.AndroidPrayerBridge;
        if (!bridge || typeof bridge.isSupported !== 'function') return null;
        try {
            return bridge.isSupported() ? bridge : null;
        } catch (_) {
            return null;
        }
    }

    function isNativeAndroidReminderMode() {
        return !!getAndroidReminderBridge();
    }

    function postNativeReminderModeToServiceWorker(enabled, source = 'app') {
        if (!('serviceWorker' in navigator)) return;
        const payload = {
            type: 'SET_NATIVE_REMINDER_MODE',
            enabled: !!enabled,
            source,
            sentAt: Date.now()
        };

        navigator.serviceWorker.ready
            .then((registration) => {
                const active = registration?.active;
                if (active) active.postMessage(payload);
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage(payload);
                }
            })
            .catch(() => {});
    }

    function maybeSuggestNativeAppForReminders() {
        if (isNativeAndroidReminderMode()) return;
        if (typeof navigator.getInstalledRelatedApps !== 'function') return;
        const promptKey = 'crown_native_app_hint_shown';
        if (sessionStorage.getItem(promptKey) === '1') return;

        navigator.getInstalledRelatedApps()
            .then((apps) => {
                if (!Array.isArray(apps) || apps.length === 0) return;
                sessionStorage.setItem(promptKey, '1');
                showToast('Native app detected. For reliable background reminders, use the Android app.');
            })
            .catch(() => {});
    }

    function parseJsonSafely(raw, fallback = null) {
        if (raw == null || raw === '') return fallback;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function getStoredPrayerLocation() {
        return parseJsonSafely(localStorage.getItem('crown_location'), null);
    }

    function isForegroundOnlyReminderMode() {
        return !isNativeAndroidReminderMode();
    }

    function getStoredReminderSettingsSnapshot() {
        const raw = parseJsonSafely(localStorage.getItem('crown_prayer_reminders'), null);
        if (raw && typeof raw === 'object') return raw;
        return getReminderDefaults();
    }

    function applyNativeAndroidReminderState(state) {
        if (!state || !state.nativeReminderSupported) return null;
        nativeAndroidReminderState = state;

        if (state.settings && typeof state.settings === 'object') {
            localStorage.setItem('crown_prayer_reminders', JSON.stringify(state.settings));
            localStorage.setItem('crown_notifications', state.settings.enabled ? 'true' : 'false');
            reminderSettings = null;
        }

        if (state.location && typeof state.location === 'object') {
            localStorage.setItem('crown_location', JSON.stringify(state.location));
        }

        return nativeAndroidReminderState;
    }

    function ensureNativeAndroidReminderState() {
        if (!isNativeAndroidReminderMode()) return null;
        if (!nativeAndroidReminderBootstrapDone) {
            const bridge = getAndroidReminderBridge();
            nativeAndroidReminderBootstrapDone = true;
            applyNativeAndroidReminderState(parseJsonSafely(bridge?.getStateJson?.(), null));
        }
        return nativeAndroidReminderState;
    }

    function syncNativeAndroidReminderState(reason = 'schedule', locationOverride = undefined) {
        const bridge = getAndroidReminderBridge();
        if (!bridge) return null;

        const settings = reminderSettings || getStoredReminderSettingsSnapshot();
        const location = locationOverride === undefined ? getStoredPrayerLocation() : locationOverride;
        const response = parseJsonSafely(
            bridge.syncReminderState(
                JSON.stringify(settings),
                location ? JSON.stringify(location) : '',
                reason
            ),
            null
        );

        return applyNativeAndroidReminderState(response);
    }

    function requestNativeAndroidReminderPermissions(reason = 'permission-request') {
        const bridge = getAndroidReminderBridge();
        if (!bridge) return null;
        const response = parseJsonSafely(bridge.requestPermissions(reason), null);
        return applyNativeAndroidReminderState(response);
    }

    function ensureNativeAndroidPermissionsBeforeReminderEnable(reason = 'android-reminder-enable') {
        if (!isNativeAndroidReminderMode()) return true;
        const current = ensureNativeAndroidReminderState();
        if (current?.permissions?.ready) return true;
        requestNativeAndroidReminderPermissions(reason);
        showToast(ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE);
        return false;
    }

    window.addEventListener('android-prayer-reminder-state', (event) => {
        if (!isNativeAndroidReminderMode()) return;
        const detail = event.detail || null;
        applyNativeAndroidReminderState(detail);

        const permissionsReady = !!detail?.permissions?.ready;
        const reasonKey = `${detail?.reason || 'state'}:${permissionsReady ? 'ready' : 'missing'}`;
        if (!permissionsReady && lastNativePermissionPromptKey !== reasonKey && detail?.reason?.includes('permissions')) {
            lastNativePermissionPromptKey = reasonKey;
            showToast(ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE);
        }

        if (typeof syncReminderUi === 'function') syncReminderUi();
        if (typeof renderPrayerGrid === 'function') renderPrayerGrid();
        if (typeof renderPrayerReminderStatusLine === 'function') renderPrayerReminderStatusLine();
        if (typeof refreshHomeNextPrayerCard === 'function') refreshHomeNextPrayerCard();
    });

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeCityText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getCityMeta(city) {
        const fallback = {
            provinceEn: city.en,
            provincePs: city.ps || city.en,
            regionEn: city.countryEn || 'Global',
            regionPs: city.countryPs || 'نړیوال'
        };
        return CITY_META[city.key] || fallback;
    }

    function highlightMatch(value, query) {
        const base = String(value || '');
        const q = String(query || '').trim();
        if (!q) return escapeHtml(base);
        const lowerBase = base.toLowerCase();
        const lowerQuery = q.toLowerCase();
        const index = lowerBase.indexOf(lowerQuery);
        if (index === -1) return escapeHtml(base);
        const before = escapeHtml(base.slice(0, index));
        const mid = escapeHtml(base.slice(index, index + q.length));
        const after = escapeHtml(base.slice(index + q.length));
        return `${before}<mark class="city-match">${mid}</mark>${after}`;
    }

    function findCityMatches(query) {
        const q = normalizeCityText(query);
        if (!q) return ALL_CITIES.slice();

        return ALL_CITIES
            .map((city) => {
                const meta = getCityMeta(city);
                const searchFields = [
                    normalizeCityText(city.en),
                    normalizeCityText(city.ps),
                    normalizeCityText(city.key),
                    normalizeCityText(city.countryEn),
                    normalizeCityText(city.countryPs),
                    normalizeCityText(meta.provinceEn),
                    normalizeCityText(meta.provincePs),
                    normalizeCityText(meta.regionEn),
                    normalizeCityText(meta.regionPs)
                ];
                const scores = searchFields
                    .map((field) => {
                        if (field === q) return 0;
                        if (field.startsWith(q)) return 1;
                        const idx = field.indexOf(q);
                        if (idx >= 0) return 2 + (idx / 100);
                        return Number.POSITIVE_INFINITY;
                    })
                    .sort((a, b) => a - b);
                return { city, score: scores[0] };
            })
            .filter(entry => Number.isFinite(entry.score))
            .sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                const orderA = CITY_COUNTRY_ORDER.indexOf(a.city.countryKey);
                const orderB = CITY_COUNTRY_ORDER.indexOf(b.city.countryKey);
                if (orderA !== orderB) return orderA - orderB;
                return a.city.en.localeCompare(b.city.en);
            })
            .map(entry => entry.city);
    }

    function preloadPrayerReminderAudio() {
        REMINDER_SOUND_OPTIONS.forEach((option) => {
            if (option.id === 'silent' || !option.file || reminderAudio[option.id]) return;
            const audio = new Audio(option.file);
            audio.preload = 'auto';
            reminderAudio[option.id] = audio;
        });
        window.reminderAudio = reminderAudio;
    }

    function playSyntheticReminderTone(kind, durationSeconds = 5) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        const context = new AudioCtx();
        const master = context.createGain();
        const start = context.currentTime;
        const stopAt = start + Math.max(1, Number(durationSeconds) || 5);
        let endedCb = null;
        let stopped = false;

        master.gain.value = 0.0001;
        master.connect(context.destination);
        if (typeof context.resume === 'function') context.resume().catch(() => {});

        const addTone = (frequency, at, duration, gain = 0.16, type = 'sine') => {
            const osc = context.createOscillator();
            const amp = context.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, at);
            amp.gain.setValueAtTime(0.0001, at);
            amp.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), at + 0.02);
            amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
            osc.connect(amp);
            amp.connect(master);
            osc.start(at);
            osc.stop(at + duration + 0.05);
        };

        if (kind === 'nasheed') {
            const pattern = [392, 440, 523.25, 440, 392];
            pattern.forEach((freq, index) => {
                const at = start + (index * 0.45);
                if (at + 0.4 < stopAt) {
                    addTone(freq, at, 0.38, 0.1, 'sine');
                    addTone(freq * 2, at + 0.03, 0.3, 0.03, 'triangle');
                }
            });
        } else if (kind === 'bell') {
            addTone(1046.5, start + 0.02, 1.6, 0.2, 'triangle');
            addTone(1568, start + 0.03, 1.8, 0.09, 'sine');
        } else {
            addTone(880, start + 0.02, 0.9, 0.17, 'sine');
            addTone(1320, start + 0.04, 0.5, 0.06, 'triangle');
        }

        const finish = () => {
            if (stopped) return;
            stopped = true;
            try {
                master.gain.cancelScheduledValues(context.currentTime);
                master.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
            } catch (error) {}
            setTimeout(() => context.close().catch(() => {}), 120);
            if (typeof endedCb === 'function') endedCb();
        };

        const timer = setTimeout(finish, Math.max(150, Math.floor((stopAt - start) * 1000)));

        return {
            stop() {
                clearTimeout(timer);
                finish();
            },
            onEnded(callback) {
                endedCb = callback;
            }
        };
    }

    function playReminderAudioOption(soundId, { isPreview = false, maxDurationSeconds = null } = {}) {
        const option = getReminderSoundOption(soundId);
        if (!option || option.source === 'silent' || option.id === 'silent') return null;

        const maxDuration = Number(maxDurationSeconds);
        const durationSeconds = Number.isFinite(maxDuration) && maxDuration > 0
            ? maxDuration
            : Math.max(1, Number(option.clipDuration) || 8);

        const src = option.file;
        if (!src) return null;

        const audio = isPreview ? new Audio(src) : (reminderAudio[option.id] || new Audio(src));
        if (!isPreview && !reminderAudio[option.id]) reminderAudio[option.id] = audio;

        audio.preload = 'auto';
        const seekSeconds = Math.max(0, Number(option.clipStart) || 0);
        let timer = null;
        let endedCb = null;
        let finished = false;

        const finish = () => {
            if (finished) return;
            finished = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (typeof endedCb === 'function') endedCb();
        };

        const stop = () => {
            try {
                audio.pause();
            } catch (error) {}
            finish();
        };

        const begin = () => {
            try {
                audio.currentTime = seekSeconds;
            } catch (error) {}

            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.error('[ReminderAudio] play failed', { soundId: option.id, isPreview, error });
                    finish();
                });
            }

            timer = setTimeout(stop, Math.floor(durationSeconds * 1000));
        };

        if (audio.readyState >= 1) begin();
        else audio.addEventListener('loadedmetadata', begin, { once: true });

        audio.addEventListener('ended', finish, { once: true });

        return {
            stop,
            onEnded(callback) {
                endedCb = callback;
            }
        };
    }

    function getReminderSoundOption(soundId) {
        const normalized = LEGACY_REMINDER_SOUND_ID_MAP[soundId] || soundId;
        return REMINDER_SOUND_OPTIONS.find(option => option.id === normalized) || REMINDER_SOUND_OPTIONS[0];
    }

    function getReminderSoundLabel(soundId) {
        const option = getReminderSoundOption(soundId);
        return isPashtoMode() ? option.labelPs : option.labelEn;
    }

    function renderReminderSoundSelector() {
        const select = document.getElementById('reminderSoundSelect');
        const previewBtn = document.getElementById('reminderSoundPreviewBtn');
        if (!select) return;

        const settings = loadReminderSettings();
        select.innerHTML = REMINDER_SOUND_OPTIONS.map((option) => (`
            <option value="${option.id}">${escapeHtml(getReminderSoundLabel(option.id))}</option>
        `)).join('');
        select.value = settings.soundId || 'adhan-alafasy';

        if (previewBtn) {
            const selected = getReminderSoundOption(select.value);
            const muted = selected.id === 'silent' || selected.source === 'silent';
            previewBtn.disabled = muted;
            previewBtn.classList.remove('is-playing');
            previewBtn.textContent = '🔊';
        }
    }

    window.selectReminderSoundOption = function(soundId) {
        const settings = loadReminderSettings();
        settings.soundId = soundId;
        saveReminderSettings();
        renderReminderSoundSelector();
        renderPerPrayerSoundSelectors();
        showToast(getPrayerUiText().reminderSaved);
    };

    window.previewReminderSoundOption = function(soundId, triggerButton) {
        previewReminderSound(soundId, triggerButton || null);
    };

    function renderPerPrayerSoundSelectors() {
        const wrap = document.getElementById('perPrayerSoundWrap');
        if (!wrap) return;
        wrap.classList.remove('active');
        wrap.innerHTML = '';
    }

    function stopReminderPreview() {
        if (reminderPreviewStop) {
            reminderPreviewStop();
            reminderPreviewStop = null;
        }
        if (reminderPreviewAudio && typeof reminderPreviewAudio.pause === 'function') {
            try {
                reminderPreviewAudio.pause();
            } catch (error) {}
        }
        reminderPreviewAudio = null;
        window.reminderPreviewAudio = null;
        if (reminderPreviewButton) {
            reminderPreviewButton.classList.remove('is-playing');
            reminderPreviewButton.textContent = '🔊';
        }
        reminderPreviewButton = null;
    }

    function previewReminderSound(soundId, triggerButton) {
        const option = getReminderSoundOption(soundId);
        if (!option || option.id === 'silent' || option.source === 'silent') return;

        stopReminderPreview();

        if (triggerButton) {
            reminderPreviewButton = triggerButton;
            triggerButton.classList.add('is-playing');
            triggerButton.textContent = '⏸';
        }

        const controller = playReminderAudioOption(soundId, { isPreview: true, maxDurationSeconds: 5 });
        window.reminderPreviewAudio = controller;
        if (!controller) {
            stopReminderPreview();
            return;
        }

        reminderPreviewAudio = controller;
        reminderPreviewStop = typeof controller.stop === 'function' ? controller.stop : null;
        if (typeof controller.onEnded === 'function') {
            controller.onEnded(() => {
                stopReminderPreview();
            });
        }
    }

    function getPrayerLabel(name) {
        return isPashtoMode() ? (PRAYER_LABELS_PS[name] || PRAYER_LABELS_EN[name]) : (PRAYER_LABELS_EN[name] || name);
    }

    function getPrayerUiText() {
        const psUI = (typeof PS_UI !== 'undefined') ? PS_UI : null;
        const isPS = isPashtoMode();
        return {
            nextPrayer: isPS ? (psUI?.nextPrayer || 'راتلونکی لمونځ') : 'Next Prayer',
            detectingLocation: isPS ? (psUI?.detectingLocation || 'ځای پیژندل کېږي...') : 'Detecting location...',
            locationDenied: isPS ? (psUI?.locationDenied || 'ځای رد شو — د بیا هڅې لپاره ↻ ټک وکړئ') : 'Location denied — tap ↻ to retry',
            enableLocation: isPS ? 'د لمانځه وختونو لپاره ځای فعال کړئ.' : 'Enable location to load prayer times.',
            searchPlaceholder: isPS ? 'ښار ولټوئ...' : 'Search city...',
            searchPlaceholderDual: isPS ? 'ښار ولټوئ... / Search city...' : 'Search city... / ښار ولټوئ...',
            countryLabel: isPS ? 'هېوادونه' : 'Countries',
            gpsOption: isPS ? '📍 زما موقعیت وکاروئ' : '📍 Use My Location',
            gpsDetecting: isPS ? 'ستاسې موقعیت معلومېږي...' : 'Detecting your location...',
            gpsDetected: isPS ? 'GPS وموندل شو' : 'GPS detected',
            noMatches: isPS ? 'برابر ښار ونه موندل شو' : 'No matches',
            now: isPS ? (psUI?.now || 'اوس') : 'Now',
            next: isPS ? (psUI?.next || 'بل') : 'Next',
            changeLocationTitle: isPS ? 'د لمانځه ځای بدل کړئ' : 'Change prayer location',
            amToken: isPS ? (psUI?.amToken || 'غ.م') : 'AM',
            pmToken: isPS ? (psUI?.pmToken || 'غ.و') : 'PM',
            reminderSettingsTitle: isPS ? (psUI?.reminderSettingsTitle || 'د لمونځ یادونې') : 'Prayer reminders',
            reminderMaster: isPS ? (psUI?.reminderMaster || '🔔 د لمونځ خبرتیاوې') : '🔔 Prayer alerts',
            reminderSound: isPS ? (psUI?.reminderSound || 'غږ') : 'Sound',
            reminderBefore: isPS ? (psUI?.reminderBefore || 'له وخت مخکې') : 'Remind me',
            reminderAtTime: isPS ? (psUI?.reminderAtTime || 'پر وخت') : 'At time',
            reminder5: isPS ? (psUI?.reminder5 || '۵ دقیقې مخکې') : '5 min before',
            reminder10: isPS ? (psUI?.reminder10 || '۱۰ دقیقې مخکې') : '10 min before',
            reminder15: isPS ? (psUI?.reminder15 || '۱۵ دقیقې مخکې') : '15 min before',
            soundAdhan: isPS ? (psUI?.soundAdhan || 'بشپړ اذان') : 'Full Adhan',
            soundTone: isPS ? (psUI?.soundTone || 'لنډ زنګ') : 'Short tone',
            soundSilent: isPS ? (psUI?.soundSilent || 'بې غږه') : 'Silent',
            preReminderBody: isPS ? (psUI?.preReminderBody || 'د {prayer} لمونځ به په {minutes} دقیقو کې وي') : '{minutes} min until {prayer} prayer',
            atTimeBody: isPS ? (psUI?.atTimeBody || 'د {prayer} لمانځه وخت شو') : "It's time for {prayer} prayer",
            alertsEnabled: isPS ? (psUI?.alertsEnabled || 'د لمونځ خبرتیاوې فعالې شوې') : 'Prayer alerts enabled',
            alertsDisabled: isPS ? (psUI?.alertsDisabled || 'د لمونځ خبرتیاوې غیر فعالې شوې') : 'Prayer alerts disabled',
            alertsPermissionDenied: isPS ? (psUI?.alertsPermissionDenied || 'د خبرتیا اجازه رد شوه') : 'Notification permission denied',
            alertsUnsupported: isPS ? (psUI?.alertsUnsupported || 'خبرتیاوې نه ملاتړ کوي') : 'Notifications not supported',
            alertsForegroundOnly: isPS
                ? 'په براوزر او iPhone کې یادونې یوازې هغه وخت کار کوي چې اپ پرانیستی پاتې وي.'
                : 'On browsers and iPhone, reminders only work while the app stays open.',
            alertsNativePermissionPending: isPS
                ? 'تنظیمات خوندي شول، خو تر هغو به یادونې ونه چلېږي څو د Android خبرتیاوې او exact alarm اجازه فعاله نه شي.'
                : 'Reminder settings were saved, but Android notifications and exact alarms must be allowed before reminders can fire.',
            reminderSet: isPS ? 'یادونه وټاکل شوه: {prayer} {time}' : 'Reminder set for {prayer} at {time}',
            reminderSetForeground: isPS
                ? 'یادونه خوندي شوه: {prayer} {time} — اپ باید پرانیستی پاتې شي.'
                : 'Reminder saved for {prayer} at {time} — keep the app open.',
            reminderSaved: isPS ? 'د یادونې تنظیمات خوندي شول' : 'Reminder settings saved',
            inAppPrayerAlert: isPS ? 'د {prayer} لمانځه وخت شو' : 'It is time for {prayer}',
            remindersActiveNext: isPS ? 'یادونې فعاله دي — راتلونکې: {prayer} په {time}' : 'Reminders active — next: {prayer} at {time}',
            remindersForegroundNext: isPS
                ? 'یوازې د پرانیستي اپ لپاره — راتلونکې: {prayer} په {time}'
                : 'Foreground-only on this device — next: {prayer} at {time}',
            remindersForegroundIdle: isPS
                ? 'په براوزر او iPhone کې یادونې یوازې د پرانیستي اپ لپاره دي. شالیدي یادونې د Android اپ ته اړتیا لري.'
                : 'Browser and iPhone reminders are foreground-only. Exact background reminders require the Android app.',
            remindersInactive: isPS ? 'یادونې غیرفعاله دي' : 'Reminders inactive',
            qiblaFacing: isPS ? 'ماشاءالله! تاسو قبلې ته برابر یاست.' : 'MashaAllah! You are facing Qibla.',
            qiblaAlmost: isPS ? 'نږدې یاست — {delta}° توپیر' : 'Almost there — {delta}° off',
            qiblaRotateHint: isPS ? 'موبایل وڅرخوئ — ستنه د قبلې نښې ته برابره کړئ' : 'Rotate phone until the needle aligns with the highlighted direction',
            qiblaNeedleHint: isPS ? 'موبایل د روښانه شوي لوري پر خوا ونیسئ' : 'Point your phone toward the highlighted direction',
            change: isPS ? 'بدل' : 'Change',
            noCitySelected: isPS ? 'ښار نه دی ټاکل شوی' : 'No city selected',
            tabTimes: isPS ? 'وختونه' : 'Times',
            tabQibla: isPS ? 'قبله' : 'Qibla',
            tabReminders: isPS ? 'یادونې' : 'Reminders'
        };
    }

    function setQiblaLocationText(text) {
        const qiblaLoc = document.getElementById('qiblaLocation');
        if (!qiblaLoc) return;
        qiblaLoc.textContent = text || '--';
    }

    function formatQiblaDistance(distanceKm) {
        if (!Number.isFinite(distanceKm)) {
            return isPashtoMode() ? 'تر کعبې -- کیلومتره' : '-- km to the Kaaba';
        }
        const roundedKm = Math.round(distanceKm);
        const formatted = Intl.NumberFormat('en-US').format(roundedKm);
        const localized = localizeDigits(formatted);
        return isPashtoMode() ? `تر کعبې ${localized} کیلومتره` : `${localized} km to the Kaaba`;
    }

    function setQiblaDistanceText(distanceKm) {
        lastQiblaDistanceKm = Number.isFinite(distanceKm) ? distanceKm : null;
        const qiblaDistance = document.getElementById('qiblaDistance');
        if (!qiblaDistance) return;
        qiblaDistance.textContent = formatQiblaDistance(lastQiblaDistanceKm);
    }

    function getDistanceToKaabaKm(lat, lng) {
        const toRadians = (degrees) => degrees * Math.PI / 180;
        const earthRadiusKm = 6371;
        const deltaLat = toRadians(KAABA_LAT - lat);
        const deltaLng = toRadians(KAABA_LNG - lng);
        const lat1 = toRadians(lat);
        const lat2 = toRadians(KAABA_LAT);
        const a = Math.sin(deltaLat / 2) ** 2
            + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
        return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
    }

    function getSavedPrayerTab() {
        const raw = localStorage.getItem(PRAYER_SUBTAB_STORAGE_KEY) || 'times';
        return ['times', 'qibla', 'reminders'].includes(raw) ? raw : 'times';
    }

    function syncSegmentedTabThumb(containerSelector, tabSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;
        const tabs = Array.from(container.querySelectorAll(tabSelector));
        if (!tabs.length) return;

        const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true'));
        container.style.setProperty('--seg-count', String(tabs.length));
        container.style.setProperty('--seg-index', String(activeIndex));
    }

    function syncPrayerSegmentedThumb() {
        syncSegmentedTabThumb('#prayerSubtabs', '.prayer-subtab');
    }

    function syncQuranSegmentedThumb() {
        syncSegmentedTabThumb('#quranViewTabs', '.quran-view-tab[data-qview]');
    }

    function setPrayerSubtab(tabName, persist = true) {
        const active = ['times', 'qibla', 'reminders'].includes(tabName) ? tabName : 'times';
        document.querySelectorAll('.prayer-subtab').forEach((btn) => {
            const isActive = btn.dataset.prayerTab === active;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        const paneMap = {
            times: 'prayerTabTimes',
            qibla: 'prayerTabQibla',
            reminders: 'prayerTabReminders'
        };
        Object.values(paneMap).forEach((id) => {
            const pane = document.getElementById(id);
            if (pane) pane.classList.toggle('active', id === paneMap[active]);
        });

        if (active === 'qibla') {
            const cached = (() => {
                try { return JSON.parse(localStorage.getItem('crown_location') || 'null'); }
                catch (_) { return null; }
            })();
            const lat = Number(cached?.lat);
            const lng = Number(cached?.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                calculateQibla(lat, lng);
                initCompass();
            }
        }

        syncPrayerSegmentedThumb();
        if (persist) localStorage.setItem(PRAYER_SUBTAB_STORAGE_KEY, active);
    }

    function initPrayerSubtabs() {
        const root = document.getElementById('prayerSubtabs');
        if (!root) return;
        if (root.dataset.boundTabs !== '1') {
            root.querySelectorAll('.prayer-subtab').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setPrayerSubtab(btn.dataset.prayerTab || 'times', true);
                });
            });
            root.dataset.boundTabs = '1';
        }
        setPrayerSubtab(getSavedPrayerTab(), false);
    }

    function setCitySearchVisibility(visible) {
        const shell = document.getElementById('citySearchShell');
        if (!shell) return;
        shell.style.display = visible ? '' : 'none';
        if (!visible) closeCityDropdown();
    }

    function localizeDigits(value) {
        return normalizeDigitsForCurrentLanguage(value);
    }

    function getReminderDefaults() {
        return {
            enabled: false,
            mode: 'tone',
            soundId: 'ding',
            playAdhanSound: true,
            sameSoundForAll: true,
            prayerSounds: {
                fajr: 'bell',
                sunrise: 'ding',
                dhuhr: 'ding',
                asr: 'ding',
                maghrib: 'bell',
                isha: 'nasheed'
            },
            offsetMinutes: 0,
            prayers: {
                fajr: true,
                sunrise: true,
                dhuhr: true,
                asr: true,
                maghrib: true,
                isha: true
            }
        };
    }

    function loadReminderSettings() {
        if (isNativeAndroidReminderMode()) ensureNativeAndroidReminderState();
        if (reminderSettings) return reminderSettings;
        const defaults = getReminderDefaults();
        const validSoundIds = REMINDER_SOUND_OPTIONS.map(option => option.id);
        const normalizeSoundId = (soundId) => {
            const normalized = LEGACY_REMINDER_SOUND_ID_MAP[soundId] || soundId;
            return validSoundIds.includes(normalized) ? normalized : defaults.soundId;
        };
        try {
            const raw = JSON.parse(localStorage.getItem('crown_prayer_reminders') || 'null');
            reminderSettings = {
                enabled: !!raw?.enabled,
                mode: ['adhan', 'tone', 'silent'].includes(raw?.mode) ? raw.mode : defaults.mode,
                soundId: normalizeSoundId(raw?.soundId),
                playAdhanSound: typeof raw?.playAdhanSound === 'boolean' ? raw.playAdhanSound : defaults.playAdhanSound,
                sameSoundForAll: typeof raw?.sameSoundForAll === 'boolean' ? raw.sameSoundForAll : defaults.sameSoundForAll,
                prayerSounds: {
                    ...defaults.prayerSounds,
                    ...Object.fromEntries(
                        Object.entries(raw?.prayerSounds || {})
                            .filter(([name]) => REMINDER_PRAYERS.includes(name))
                            .map(([name, soundId]) => [name, normalizeSoundId(soundId)])
                    )
                },
                offsetMinutes: [0, 5, 10, 15].includes(Number(raw?.offsetMinutes)) ? Number(raw.offsetMinutes) : defaults.offsetMinutes,
                prayers: {
                    ...defaults.prayers,
                    ...(raw?.prayers || {})
                }
            };
        } catch (error) {
            reminderSettings = defaults;
        }
        return reminderSettings;
    }

    function saveReminderSettings() {
        if (!reminderSettings) return;
        localStorage.setItem('crown_prayer_reminders', JSON.stringify(reminderSettings));
    }

    function syncReminderUi() {
        const settings = loadReminderSettings();
        const master = document.getElementById('notifyToggle');
        if (master) master.checked = !!settings.enabled;

        REMINDER_PRAYERS.forEach(name => {
            const input = document.getElementById(`remPrayer-${name}`);
            const row = input?.closest('.prayer-reminder-item');
            if (input) input.checked = !!settings.prayers[name];
            if (row) row.classList.toggle('active', !!settings.enabled && !!settings.prayers[name]);
        });

        const sameSoundToggle = document.getElementById('sameSoundForAllToggle');
        if (sameSoundToggle) sameSoundToggle.checked = !!settings.sameSoundForAll;

        const playAdhanToggle = document.getElementById('playAdhanSoundToggle');
        if (playAdhanToggle) playAdhanToggle.checked = settings.playAdhanSound !== false;

        renderReminderSoundSelector();
        renderPerPrayerSoundSelectors();

        const beforeSelect = document.getElementById('reminderBefore');
        if (beforeSelect) beforeSelect.value = String(settings.offsetMinutes);

        renderPrayerReminderStatusLine();
        updateForegroundReminderBanner();
    }

    function refreshReminderControlLanguage() {
        const uiText = getPrayerUiText();
        const sectionTitle = document.getElementById('reminderSettingsTitle');
        const masterLabel = document.getElementById('reminderMasterLabel');
        const soundLabel = document.getElementById('reminderSoundLabel');
        const sameAllLabel = document.getElementById('sameSoundAllLabel');
        const playAdhanLabel = document.getElementById('playAdhanSoundLabel');
        const beforeLabel = document.getElementById('reminderBeforeLabel');

        if (sectionTitle) sectionTitle.textContent = uiText.reminderSettingsTitle;
        if (masterLabel) masterLabel.textContent = uiText.reminderMaster;
        if (soundLabel) soundLabel.textContent = 'Reminder Sound / د یادونې غږ';
        if (sameAllLabel) sameAllLabel.textContent = isPashtoMode() ? 'د ټولو لمونځونو لپاره یو غږ' : 'Same sound for all prayers';
        if (playAdhanLabel) playAdhanLabel.textContent = isPashtoMode() ? 'د اذان غږ فعال وساتئ (Android)' : 'Play adhan sound (Android app)';
        if (beforeLabel) beforeLabel.textContent = uiText.reminderBefore;

        const beforeSelect = document.getElementById('reminderBefore');
        if (beforeSelect) {
            const atOpt = beforeSelect.querySelector('option[value="0"]');
            const fiveOpt = beforeSelect.querySelector('option[value="5"]');
            const tenOpt = beforeSelect.querySelector('option[value="10"]');
            const fifteenOpt = beforeSelect.querySelector('option[value="15"]');
            if (atOpt) atOpt.textContent = uiText.reminderAtTime;
            if (fiveOpt) fiveOpt.textContent = uiText.reminder5;
            if (tenOpt) tenOpt.textContent = uiText.reminder10;
            if (fifteenOpt) fifteenOpt.textContent = uiText.reminder15;
        }

        REMINDER_PRAYERS.forEach(name => {
            const label = document.getElementById(`remPrayerLabel-${name}`);
            if (label) {
                const prayerLabel = getPrayerLabel(name);
                const prayerTime = prayerTimesData?.[name];
                const timeText = prayerTime ? formatDisplayTime(prayerTime, 'reminder-label') : '';
                label.textContent = timeText ? `${prayerLabel} · ${timeText}` : prayerLabel;
            }
        });

        renderReminderSoundSelector();
        renderPerPrayerSoundSelectors();

        const instruction = document.getElementById('qiblaInstruction');
        if (instruction) {
            instruction.textContent = getPrayerUiText().qiblaNeedleHint;
        }
        setQiblaDistanceText(lastQiblaDistanceKm);

        const labelMap = {
            n: { en: 'N', ps: 'ش' },
            s: { en: 'S', ps: 'ج' },
            e: { en: 'E', ps: 'خت' },
            w: { en: 'W', ps: 'لو' }
        };
        Object.entries(labelMap).forEach(([key, labels]) => {
            const el = document.querySelector(`.qibla-compass .compass-${key}`);
            if (!el) return;
            const span = el.querySelector('span');
            const small = el.querySelector('small');
            if (span) span.textContent = labels.en;
            if (small) small.textContent = labels.ps;
        });
    }

    function initReminderControls() {
        const root = document.getElementById('prayerReminderSettings');
        if (!root || root.dataset.boundReminder === '1') {
            refreshReminderControlLanguage();
            syncReminderUi();
            return;
        }

        const masterToggle = document.getElementById('notifyToggle');
        if (masterToggle) {
            masterToggle.addEventListener('change', () => {
                window.togglePrayerNotifications(masterToggle.checked);
            });
        }

        REMINDER_PRAYERS.forEach(name => {
            const input = document.getElementById(`remPrayer-${name}`);
            if (!input) return;
            input.addEventListener('change', () => {
                const settings = loadReminderSettings();
                const nativeMode = isNativeAndroidReminderMode();
                const previousPrayerEnabled = !!settings.prayers[name];
                const requestedEnabled = !!input.checked;

                if (requestedEnabled) {
                    console.log('[DEBUG] Native mode:', isNativeAndroidReminderMode());
                    console.log('[DEBUG] Bridge available:', !!getAndroidReminderBridge());
                }

                const applyPrayerSelection = (enabledValue) => {
                    settings.prayers[name] = enabledValue;
                    saveReminderSettings();
                    syncReminderUi();
                };

                const denyAndRevert = () => {
                    input.checked = previousPrayerEnabled;
                    syncReminderUi();
                    renderPrayerGrid();
                    if (nativeMode) showToast(ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE);
                };

                if (requestedEnabled && nativeMode && !ensureNativeAndroidPermissionsBeforeReminderEnable(`enable-prayer-${name}`)) {
                    denyAndRevert();
                    return;
                }

                if (!requestedEnabled) {
                    applyPrayerSelection(false);
                    if (settings.enabled) {
                        schedulePrayerNotifications();
                    } else {
                        showToast(getPrayerUiText().reminderSaved);
                    }
                    renderPrayerGrid();
                    return;
                }

                requestNotificationPermissionIfNeeded().then((granted) => {
                    if (!granted) {
                        denyAndRevert();
                        return;
                    }

                    applyPrayerSelection(true);
                    if (settings.enabled) {
                        schedulePrayerNotifications();
                        showReminderSetConfirmation(name);
                    } else {
                        showToast(getPrayerUiText().reminderSaved);
                    }
                    renderPrayerGrid();
                });
            });
        });

        const soundSelect = document.getElementById('reminderSoundSelect');
        if (soundSelect) {
            soundSelect.addEventListener('change', () => {
                stopReminderPreview();
                const settings = loadReminderSettings();
                settings.soundId = soundSelect.value;
                saveReminderSettings();
                renderReminderSoundSelector();
                showToast(getPrayerUiText().reminderSaved);
            });
        }

        const soundPreviewBtn = document.getElementById('reminderSoundPreviewBtn');
        if (soundPreviewBtn) {
            const runPreview = (event, isTouch = false) => {
                if (event) {
                    if (isTouch) event.preventDefault();
                    event.stopPropagation();
                }
                const selectedSound = document.getElementById('reminderSoundSelect')?.value || loadReminderSettings().soundId;
                previewReminderSound(selectedSound, soundPreviewBtn);
            };
            soundPreviewBtn.addEventListener('touchstart', (event) => runPreview(event, true), { passive: false });
            soundPreviewBtn.addEventListener('click', (event) => runPreview(event, false));
        }

        const sameSoundToggle = document.getElementById('sameSoundForAllToggle');
        if (sameSoundToggle) {
            sameSoundToggle.addEventListener('change', () => {
                const settings = loadReminderSettings();
                settings.sameSoundForAll = !!sameSoundToggle.checked;
                saveReminderSettings();
                showToast(getPrayerUiText().reminderSaved);
            });
        }

        const playAdhanToggle = document.getElementById('playAdhanSoundToggle');
        if (playAdhanToggle) {
            playAdhanToggle.addEventListener('change', () => {
                const settings = loadReminderSettings();
                settings.playAdhanSound = !!playAdhanToggle.checked;
                saveReminderSettings();
                if (settings.enabled && isNativeAndroidReminderMode()) {
                    syncNativeAndroidReminderState('adhan-toggle');
                }
                showToast(getPrayerUiText().reminderSaved);
            });
        }

        const beforeSelect = document.getElementById('reminderBefore');
        if (beforeSelect) {
            beforeSelect.addEventListener('change', () => {
                const settings = loadReminderSettings();
                settings.offsetMinutes = Number(beforeSelect.value) || 0;
                saveReminderSettings();
                if (settings.enabled) {
                    schedulePrayerNotifications();
                    showFirstEnabledReminderConfirmation();
                } else {
                    showToast(getPrayerUiText().reminderSaved);
                }
            });
        }

        root.dataset.boundReminder = '1';
        refreshReminderControlLanguage();
        syncReminderUi();
    }

    function getCityDisplayName(city) {
        if (!city) return '';
        return isPashtoMode() ? (city.ps || city.en) : city.en;
    }

    function getCitySecondaryName(city) {
        if (!city) return '';
        return isPashtoMode() ? city.en : (city.ps || city.en);
    }

    function setSelectedCityChip(content, isHtml = false) {
        const textEl = document.getElementById('selectedCityText');
        const changeBtn = document.getElementById('selectedCityChange');
        const uiText = getPrayerUiText();
        if (textEl) {
            if (isHtml) textEl.innerHTML = content;
            else textEl.textContent = content;
        }
        if (changeBtn) changeBtn.textContent = uiText.change;
    }

    function updateCityInputFromLocation(loc) {
        const input = document.getElementById('citySearchInput');
        if (!input) return;
        const uiText = getPrayerUiText();
        if (loc?.cityKey) {
            const match = ALL_CITIES.find(c => c.key === loc.cityKey);
            if (match) {
                input.value = getCityDisplayName(match);
                const meta = getCityMeta(match);
                const country = isPashtoMode() ? match.countryPs : match.countryEn;
                const cityText = `${getCityDisplayName(match)} · ${country}`;
                setSelectedCityChip(cityText);
                setQiblaLocationText(cityText);
                input.title = uiText.changeLocationTitle;
                setCitySearchVisibility(false);
                return;
            }
        }
        const fallback = loc?.city || (typeof loc?.lat === 'number' && typeof loc?.lng === 'number' ? `${loc.lat.toFixed(2)}°, ${loc.lng.toFixed(2)}°` : uiText.noCitySelected);
        input.value = fallback;
        setSelectedCityChip(fallback);
        setQiblaLocationText(fallback);
        input.title = uiText.changeLocationTitle;
        setCitySearchVisibility(!loc?.city && !loc?.cityKey);
    }

    function renderCityDropdown(query = '') {
        const dropdown = document.getElementById('cityDropdown');
        const shell = document.getElementById('citySearchShell');
        if (!dropdown) return;

        const list = findCityMatches(query);
        if (shell) shell.setAttribute('aria-expanded', 'true');

        const uiText = getPrayerUiText();

        const groupedRows = GLOBAL_CITY_GROUPS.map((group) => {
            const cities = list.filter(city => city.countryKey === group.key);
            if (!cities.length) return '';

            const cityRows = cities.map((city) => {
                const meta = getCityMeta(city);
                const primary = getCityDisplayName(city);
                const secondary = getCitySecondaryName(city);
                const province = isPashtoMode() ? meta.provincePs : meta.provinceEn;
                const provinceSecondary = isPashtoMode() ? meta.provinceEn : meta.provincePs;
                const highlightedPrimary = highlightMatch(primary, query);
                const highlightedSecondary = highlightMatch(secondary, query);

                return `
                    <button class="city-option" type="button" data-city-key="${city.key}" role="option">
                        <span>
                            <span class="city-name">${highlightedPrimary}</span>
                            <span class="city-subline">${highlightedSecondary}</span>
                        </span>
                        <span class="city-coords">${province} · ${provinceSecondary}</span>
                    </button>
                `;
            }).join('');

            const countryLabel = isPashtoMode() ? group.countryPs : group.countryEn;
            return `
                <div class="city-country-head">${group.flag} ${escapeHtml(countryLabel)}</div>
                ${cityRows}
            `;
        }).join('');

        const gpsStatusText = isGpsResolving
            ? `<span class="gps-loading" aria-hidden="true"></span><span>${uiText.gpsDetecting}</span>`
            : `<span>📍</span><span>${uiText.gpsOption}</span>`;

        const detectedLabel = detectedGpsCityKey
            ? (() => {
                const city = ALL_CITIES.find(item => item.key === detectedGpsCityKey);
                if (!city) return '';
                return `<div class="city-country-head">✅ ${uiText.gpsDetected}: ${escapeHtml(getCityDisplayName(city))}</div>`;
            })()
            : '';

        dropdown.innerHTML = `
            <button class="city-option gps-option" type="button" data-city-key="__gps__" role="option">${gpsStatusText}</button>
            ${detectedLabel}
            <div class="city-options-wrap" role="listbox">${groupedRows || `<div class="city-empty">${uiText.noMatches}</div>`}</div>
        `;
    }

    function openCityDropdown() {
        const dropdown = document.getElementById('cityDropdown');
        const shell = document.getElementById('citySearchShell');
        if (!dropdown) return;
        dropdown.classList.add('open');
        if (shell) shell.setAttribute('aria-expanded', 'true');
    }

    function closeCityDropdown() {
        const dropdown = document.getElementById('cityDropdown');
        const shell = document.getElementById('citySearchShell');
        if (!dropdown) return;
        dropdown.classList.remove('open');
        if (shell) shell.setAttribute('aria-expanded', 'false');
    }

    function selectPrayerCity(city) {
        if (!city) return;
        const loc = {
            lat: city.lat,
            lng: city.lng,
            city: city.en,
            cityKey: city.key,
            country: city.countryEn || 'Global'
        };
        localStorage.setItem('crown_location', JSON.stringify(loc));
        if (isNativeAndroidReminderMode()) syncNativeAndroidReminderState('city-selected', loc);
        closeCityDropdown();
        onLocationReady(loc.lat, loc.lng, loc.city);
    }

    window.showPrayerCitySearch = function() {
        const input = document.getElementById('citySearchInput');
        setCitySearchVisibility(true);
        if (!input) return;
        input.focus();
        renderCityDropdown(input.value || '');
        openCityDropdown();
    };

    function initCitySelector() {
        const input = document.getElementById('citySearchInput');
        const dropdown = document.getElementById('cityDropdown');
        const changeBtn = document.getElementById('selectedCityChange');
        if (!input || !dropdown || input.dataset.boundCitySelector === '1') return;

        const uiText = getPrayerUiText();
        input.placeholder = uiText.searchPlaceholderDual;

        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                window.showPrayerCitySearch();
            });
        }

        input.addEventListener('focus', () => {
            renderCityDropdown(input.value || '');
            openCityDropdown();
        });

        input.addEventListener('input', () => {
            renderCityDropdown(input.value || '');
            openCityDropdown();
        });

        input.addEventListener('blur', () => {
            setTimeout(closeCityDropdown, 130);
        });

        dropdown.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const btn = e.target.closest('.city-option');
            if (!btn) return;
            const cityKey = btn.getAttribute('data-city-key');
            if (cityKey === '__gps__') {
                closeCityDropdown();
                requestLocation();
                return;
            }
            const city = ALL_CITIES.find(c => c.key === cityKey);
            if (city) selectPrayerCity(city);
        });

        input.dataset.boundCitySelector = '1';
    }

    window.refreshCitySelectorLanguage = function() {
        const input = document.getElementById('citySearchInput');
        if (!input) return;
        const uiText = getPrayerUiText();
        input.placeholder = uiText.searchPlaceholderDual;

        if (!localStorage.getItem('crown_location')) {
            setSelectedCityChip(uiText.noCitySelected);
            setCitySearchVisibility(true);
        }

        const cached = localStorage.getItem('crown_location');
        if (cached) {
            const loc = JSON.parse(cached);
            updateCityInputFromLocation(loc);
        } else {
            setCitySearchVisibility(true);
        }
        if (document.getElementById('cityDropdown')?.classList.contains('open')) {
            renderCityDropdown(input.value || '');
        }
    };

    window.refreshPrayerLanguage = function() {
        const uiText = getPrayerUiText();
        const label = document.querySelector('.prayer-countdown-label');
        if (label) label.textContent = uiText.nextPrayer;

        const tabTimes = document.getElementById('prayerSubtabTimes');
        const tabQibla = document.getElementById('prayerSubtabQibla');
        const tabReminders = document.getElementById('prayerSubtabReminders');
        const tabIconClock = '<span class="prayer-subtab-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>';
        const tabIconCompass = '<span class="prayer-subtab-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M14.8 9.2l-4.6 1.8 1.8 4.6 2.8-6.4z"/></svg></span>';
        const tabIconBell = '<span class="prayer-subtab-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5"/><path d="M9 17a3 3 0 006 0"/></svg></span>';
        if (tabTimes) tabTimes.innerHTML = `${tabIconClock}<span class="prayer-subtab-label">${uiText.tabTimes}</span>`;
        if (tabQibla) tabQibla.innerHTML = `${tabIconCompass}<span class="prayer-subtab-label">${uiText.tabQibla}</span>`;
        if (tabReminders) tabReminders.innerHTML = `${tabIconBell}<span class="prayer-subtab-label">${uiText.tabReminders}</span>`;

        renderPrayerGrid();
        updateCountdown();
        refreshReminderControlLanguage();
        syncReminderUi();
        const ring = document.getElementById('qiblaDegreeRing');
        if (ring) ring.dataset.built = '0';
        buildQiblaDegreeRing();
        if (typeof window.refreshCitySelectorLanguage === 'function') window.refreshCitySelectorLanguage();
        initPrayerSubtabs();
        if (typeof window.refreshHomeDashboard === 'function') window.refreshHomeDashboard();
    };

    function renderPrayerSkeleton() {
        const grid = document.getElementById('prayerTimesGrid');
        const countdown = document.getElementById('prayerCountdown');
        const locBar = document.getElementById('prayerLocationBar');
        const cityInput = document.getElementById('citySearchInput');

        if (locBar) locBar.classList.add('loading');
        if (cityInput) cityInput.classList.add('skeleton');
        if (countdown) {
            countdown.classList.add('loading');
            const nameEl = document.getElementById('nextPrayerName');
            const timeEl = document.getElementById('nextPrayerCountdown');
            if (nameEl) nameEl.classList.add('skeleton');
            if (timeEl) timeEl.classList.add('skeleton');
        }
        if (grid) {
            grid.innerHTML = `
                <div class="prayer-skeleton-row skeleton"></div>
                <div class="prayer-skeleton-row skeleton"></div>
                <div class="prayer-skeleton-row skeleton"></div>
                <div class="prayer-skeleton-row skeleton"></div>
                <div class="prayer-skeleton-row skeleton"></div>`;
        }
    }

    function clearPrayerSkeleton() {
        const countdown = document.getElementById('prayerCountdown');
        const locBar = document.getElementById('prayerLocationBar');
        const cityInput = document.getElementById('citySearchInput');
        const nameEl = document.getElementById('nextPrayerName');
        const timeEl = document.getElementById('nextPrayerCountdown');

        if (locBar) locBar.classList.remove('loading');
        if (cityInput) cityInput.classList.remove('skeleton');
        if (countdown) countdown.classList.remove('loading');
        if (nameEl) nameEl.classList.remove('skeleton');
        if (timeEl) timeEl.classList.remove('skeleton');
    }

    window.openPrayer = function() {
        const pp = document.querySelector('.prayer-panel');
        if (pp) showAuxPanel('.prayer-panel');
        if (pp) pp.scrollTop = 0;
        const closeBtn = pp?.querySelector('.panel-back-btn');
        if (closeBtn) closeBtn.focus();
        initReminderControls();
        initPrayerGridBellActions();
        initCitySelector();
        initPrayerSubtabs();
        preloadPrayerReminderAudio();
        if (typeof window.refreshPrayerLanguage === 'function') window.refreshPrayerLanguage();

        const needsBootstrap = !prayerPanelHydrated || !prayerTimesData;
        if (needsBootstrap) {
            setPanelLoading('prayer', true, isPashtoMode() ? 'د لمانځه وختونه بارېږي…' : 'Loading Prayer…');
            renderPrayerSkeleton();
            const cached = localStorage.getItem('crown_location');
            if (cached) {
                const loc = JSON.parse(cached);
                onLocationReady(loc.lat, loc.lng, loc.city || '');
            } else {
                setSelectedCityChip(getPrayerUiText().noCitySelected);
                requestLocation();
            }
        } else {
            updateCountdown();
            startCountdown();
            setPanelLoading('prayer', false);
        }

        recordInAppRoute(true);
    };

    window.closePrayer = function() {
        setPanelLoading('prayer', false);
        openMorePanel();
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        recordInAppRoute(false);
    };

    window.requestLocation = function() {
        const cityInput = document.getElementById('citySearchInput');
        const uiText = getPrayerUiText();
        isGpsResolving = true;
        detectedGpsCityKey = null;
        if (cityInput) cityInput.value = uiText.detectingLocation;
        setSelectedCityChip(uiText.gpsDetecting);
        if (document.getElementById('cityDropdown')?.classList.contains('open')) {
            renderCityDropdown(cityInput?.value || '');
        }
        renderPrayerSkeleton();

        if (!navigator.geolocation) {
            if (cityInput) cityInput.value = 'Geolocation not supported';
            isGpsResolving = false;
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                let city = '';
                let geodata = null;
                // Reverse geocode for city name
                try {
                    const resp = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`, {}, 10000);
                    if (!resp.ok) throw new Error('Reverse geocoding failed');
                    geodata = await resp.json();
                    city = geodata.address?.city || geodata.address?.town || geodata.address?.village || geodata.address?.state || '';
                } catch(e) { /* offline — no city name */ }

                const nearestCity = AFGHAN_CITIES.reduce((best, current) => {
                    const bestDist = best ? Math.hypot(best.lat - lat, best.lng - lng) : Infinity;
                    const currentDist = Math.hypot(current.lat - lat, current.lng - lng);
                    return currentDist < bestDist ? current : best;
                }, null);

                const isAfghanistan = /(افغانستان|afghanistan)/i.test(geodata?.address?.country || '');
                const selectedCity = isAfghanistan && nearestCity ? nearestCity : null;
                const savedLoc = {
                    lat,
                    lng,
                    city: selectedCity ? selectedCity.en : city,
                    cityKey: selectedCity ? selectedCity.key : null,
                    country: geodata?.address?.country || ''
                };

                isGpsResolving = false;
                detectedGpsCityKey = selectedCity ? selectedCity.key : null;
                localStorage.setItem('crown_location', JSON.stringify(savedLoc));
                if (isNativeAndroidReminderMode()) syncNativeAndroidReminderState('gps-location-selected', savedLoc);
                onLocationReady(lat, lng, city);
                if (document.getElementById('cityDropdown')?.classList.contains('open')) {
                    renderCityDropdown(cityInput?.value || '');
                }
            },
            (err) => {
                isGpsResolving = false;
                clearPrayerSkeleton();
                setPanelLoading('prayer', false);
                if (cityInput) cityInput.value = uiText.locationDenied;
                setSelectedCityChip(uiText.locationDenied);
                const grid = document.getElementById('prayerTimesGrid');
                if (grid) grid.innerHTML = `<div style="text-align:center;padding:14px;opacity:0.7;">${uiText.enableLocation}</div>`;
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
        );
    };

    // Open searchable selector (replaces prompt flow)
    window.promptLocation = function() {
        const input = document.getElementById('citySearchInput');
        if (!input) return;
        input.focus();
        renderCityDropdown(input.value || '');
        openCityDropdown();
    };

    function onLocationReady(lat, lng, city) {
        clearPrayerSkeleton();

        const cached = localStorage.getItem('crown_location');
        if (cached) {
            updateCityInputFromLocation(JSON.parse(cached));
        } else {
            updateCityInputFromLocation({ lat, lng, city });
        }
        if (isNativeAndroidReminderMode()) syncNativeAndroidReminderState('location-ready');
        isGpsResolving = false;

        calculateAndRenderPrayers(lat, lng);
        calculateQibla(lat, lng);
        initCompass();
        loadReminderSettings();
        syncReminderUi();
        if (loadReminderSettings().enabled) schedulePrayerNotifications();
        prayerPanelHydrated = true;
        setPanelLoading('prayer', false);
        refreshHomeNextPrayerCard();
    }

    function calculateAndRenderPrayers(lat, lng) {
        if (typeof adhan === 'undefined') {
            if (!calculateAndRenderPrayers._retries) calculateAndRenderPrayers._retries = 0;
            if (calculateAndRenderPrayers._retries++ > 10) {
                const grid = document.getElementById('prayerTimesGrid');
                if (grid) grid.innerHTML = '<div style="text-align:center;padding:20px;opacity:0.6;">Prayer library failed to load. Please refresh.</div>';
                return;
            }
            renderPrayerSkeleton();
            setTimeout(() => calculateAndRenderPrayers(lat, lng), 500);
            return;
        }
        calculateAndRenderPrayers._retries = 0;

        const coordinates = new adhan.Coordinates(lat, lng);
        const params = adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = adhan.Madhab.Hanafi;
        const date = new Date();
        const pt = new adhan.PrayerTimes(coordinates, date, params);

        prayerTimesData = {
            fajr: pt.fajr,
            sunrise: pt.sunrise,
            dhuhr: pt.dhuhr,
            asr: pt.asr,
            maghrib: pt.maghrib,
            isha: pt.isha
        };

        clearPrayerSkeleton();
        renderPrayerGrid();
        startCountdown();
        prayerPanelHydrated = true;
        setPanelLoading('prayer', false);
        refreshHomeNextPrayerCard();
    }

    function renderPrayerGrid() {
        const grid = document.getElementById('prayerTimesGrid');
        if (!grid || !prayerTimesData) return;

        const now = new Date();
        const current = getCurrentPrayer(now);
        const next = getNextPrayer(now);
        const settings = loadReminderSettings();

        grid.innerHTML = PRAYER_NAMES.map(name => {
            const time = prayerTimesData[name];
            const timeStr = formatDisplayTime(time, `prayer-grid-${name}`);
            const isCurrent = current === name;
            const isNext = next === name;
            const canToggleReminder = REMINDER_PRAYERS.includes(name);
            const reminderEnabled = REMINDER_PRAYERS.includes(name) && settings.enabled && !!settings.prayers[name];
            const cls = isCurrent ? ' current-prayer' : isNext ? ' next-prayer' : '';
            const uiText = getPrayerUiText();
            const badge = isCurrent
                ? `<span class="prayer-badge">${uiText.now}</span>`
                : isNext
                    ? `<span class="prayer-badge">${uiText.next}</span>`
                    : '<span class="prayer-badge prayer-badge-empty" aria-hidden="true"></span>';
            const bellLabel = reminderEnabled ? (isPashtoMode() ? 'یادونه فعاله ده' : 'Reminder ON') : (isPashtoMode() ? 'یادونه بنده ده' : 'Reminder OFF');
            const bellControl = canToggleReminder
                ? `<button type="button" class="prayer-bell prayer-bell-toggle${reminderEnabled ? ' active' : ''}" data-prayer="${name}" aria-pressed="${reminderEnabled ? 'true' : 'false'}" title="${bellLabel}" aria-label="${getPrayerLabel(name)}: ${bellLabel}">${reminderEnabled ? '🔔' : '🔕'}</button>`
                : `<span class="prayer-bell prayer-bell-static" aria-hidden="true">—</span>`;

            return `<div class="prayer-row${cls}">
                <span class="prayer-name">${getPrayerLabel(name)}</span>
                ${badge}
                <span class="prayer-time">${timeStr}</span>
                ${bellControl}
            </div>`;
        }).join('');
    }

    function initPrayerGridBellActions() {
        const grid = document.getElementById('prayerTimesGrid');
        if (!grid || grid.dataset.boundReminderBells === '1') return;

        grid.addEventListener('click', (event) => {
            const bellBtn = event.target.closest('.prayer-bell-toggle[data-prayer]');
            if (!bellBtn) return;
            event.preventDefault();
            const prayerName = bellBtn.getAttribute('data-prayer');
            if (!prayerName) return;
            window.togglePrayerReminderFor(prayerName);
        });

        grid.dataset.boundReminderBells = '1';
    }

    window.togglePrayerReminderFor = function(prayerName) {
        if (!REMINDER_PRAYERS.includes(prayerName)) return;

        const settings = loadReminderSettings();
        const nativeMode = isNativeAndroidReminderMode();
        const previousPrayerEnabled = !!settings.prayers[prayerName];
        const previousMasterEnabled = !!settings.enabled;
        const nextEnabled = !previousPrayerEnabled;

        if (nextEnabled) {
            console.log('[DEBUG] Native mode:', isNativeAndroidReminderMode());
            console.log('[DEBUG] Bridge available:', !!getAndroidReminderBridge());
        }

        if (nextEnabled && nativeMode && !ensureNativeAndroidPermissionsBeforeReminderEnable(`toggle-prayer-${prayerName}`)) {
            syncReminderUi();
            renderPrayerGrid();
            return;
        }

        const commitAndRender = () => {
            const hasAnyEnabledPrayer = REMINDER_PRAYERS.some((name) => !!settings.prayers[name]);
            if (!hasAnyEnabledPrayer) settings.enabled = false;

            localStorage.setItem('crown_notifications', settings.enabled ? 'true' : 'false');
            saveReminderSettings();
            syncReminderUi();
            renderPrayerGrid();

            if (settings.enabled) {
                schedulePrayerNotifications();
                if (nextEnabled) showReminderSetConfirmation(prayerName);
                else showToast(getPrayerUiText().reminderSaved);
            } else {
                clearPrayerNotifications();
                showToast(getPrayerUiText().alertsDisabled);
            }

            initDailyReminderPrompt();
        };

        if (nextEnabled && !settings.enabled) {
            window.togglePrayerNotifications(true);
            renderPrayerGrid();
            return;
        }

        if (nextEnabled) {
            requestNotificationPermissionIfNeeded().then((granted) => {
                if (!granted) {
                    settings.prayers[prayerName] = previousPrayerEnabled;
                    settings.enabled = previousMasterEnabled;
                    syncReminderUi();
                    renderPrayerGrid();
                    if (nativeMode) showToast(ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE);
                    return;
                }
                settings.prayers[prayerName] = true;
                commitAndRender();
            });
            return;
        }

        settings.prayers[prayerName] = false;
        commitAndRender();
    };

    function getCurrentPrayer(now) {
        if (!prayerTimesData) return null;
        // Work backwards: if now >= isha, current is isha; if now >= maghrib, current is maghrib; etc.
        for (let i = PRAYER_NAMES.length - 1; i >= 0; i--) {
            if (now >= prayerTimesData[PRAYER_NAMES[i]]) return PRAYER_NAMES[i];
        }
        return null; // Before fajr
    }

    function getNextPrayer(now) {
        if (!prayerTimesData) return null;
        for (let i = 0; i < PRAYER_NAMES.length; i++) {
            if (now < prayerTimesData[PRAYER_NAMES[i]]) return PRAYER_NAMES[i];
        }
        return 'fajr'; // After isha — next is fajr tomorrow
    }

    function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    function updateCountdown() {
        if (!prayerTimesData) return;
        const now = new Date();
        const next = getNextPrayer(now);
        const nameEl = document.getElementById('nextPrayerName');
        const timeEl = document.getElementById('nextPrayerCountdown');
        const countdownCard = document.getElementById('prayerCountdown');
        if (!nameEl || !timeEl) return;

        nameEl.textContent = getPrayerLabel(next) || '--';

        let target = prayerTimesData[next];
        if (!target || now >= target) {
            // Next is tomorrow's fajr
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const cached = localStorage.getItem('crown_location');
            if (cached && typeof adhan !== 'undefined') {
                const loc = JSON.parse(cached);
                const coords = new adhan.Coordinates(loc.lat, loc.lng);
                const params = adhan.CalculationMethod.MuslimWorldLeague();
                params.madhab = adhan.Madhab.Hanafi;
                const tpt = new adhan.PrayerTimes(coords, tomorrow, params);
                target = tpt.fajr;
            } else {
                timeEl.textContent = '--:--:--';
                return;
            }
        }

        const diff = target - now;
        if (diff <= 0) {
            // Just passed — re-render grid and recalculate
            const cached = localStorage.getItem('crown_location');
            if (cached) {
                const loc = JSON.parse(cached);
                calculateAndRenderPrayers(loc.lat, loc.lng);
            }
            return;
        }

        const current = getCurrentPrayer(now);
        const currentStart = current ? prayerTimesData[current] : null;
        if (countdownCard) {
            if (currentStart && target > currentStart) {
                const ratio = Math.max(0, Math.min(1, (now - currentStart) / (target - currentStart)));
                countdownCard.style.setProperty('--countdown-ring-progress', `${Math.round(ratio * 100)}%`);
            } else {
                countdownCard.style.setProperty('--countdown-ring-progress', '0%');
            }
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const hTxt = localizeDigits(String(h).padStart(2, '0'));
        const mTxt = localizeDigits(String(m).padStart(2, '0'));
        const sTxt = localizeDigits(String(s).padStart(2, '0'));
        timeEl.textContent = `${hTxt}:${mTxt}:${sTxt}`;

        // Re-render grid only when current/next prayer changes
        const newCurrent = getCurrentPrayer(new Date());
        const newNext = getNextPrayer(new Date());
        if (newCurrent !== _lastCurrentPrayer || newNext !== _lastNextPrayer) {
            _lastCurrentPrayer = newCurrent;
            _lastNextPrayer = newNext;
            renderPrayerGrid();
            refreshHomeNextPrayerCard();
        }
    }

    function normalizeMeridiem(text) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw) return '';

        const tokenRegex = /(A\.?M\.?|P\.?M\.?|AM|PM|غ\.م|غ\.و)/gi;
        const matches = raw.match(tokenRegex) || [];
        if (!matches.length) return raw;

        const isPm = matches.some((token) => /p\.?m\.?|pm|غ\.و/i.test(token));
        const uiText = getPrayerUiText();
        const normalizedToken = isPm ? uiText.pmToken : uiText.amToken;
        const base = raw.replace(tokenRegex, '').replace(/\s+/g, ' ').trim();

        return base ? `${base} ${normalizedToken}` : normalizedToken;
    }

    function formatDisplayTime(date, context = 'general') {
        return normalizeMeridiem(formatTime(date));
    }

    function formatTime(date) {
        if (!date) return '--:--';
        let h = date.getHours();
        const m = String(date.getMinutes()).padStart(2, '0');
        const uiText = getPrayerUiText();
        const ampm = h >= 12 ? uiText.pmToken : uiText.amToken;
        h = h % 12 || 12;
        const hText = localizeDigits(h);
        const mText = localizeDigits(m);
        return normalizeMeridiem(`${hText}:${mText} ${ampm}`);
    }

    // Track current/next prayer for efficient re-render
    let _lastCurrentPrayer = null;
    let _lastNextPrayer = null;

    // --- Enhanced getTimePeriod using real prayer times ---
    function getTimePeriodFromPrayers() {
        if (!prayerTimesData) return null;
        const now = new Date();
        if (now < prayerTimesData.fajr) return 'latenight';
        if (now < prayerTimesData.sunrise) return 'fajr';
        if (now < prayerTimesData.dhuhr) return 'morning';
        if (now < prayerTimesData.asr) return 'dhuhr';
        if (now < prayerTimesData.maghrib) return 'asr';
        if (now < prayerTimesData.isha) return 'maghrib';
        const cutoff = new Date(prayerTimesData.isha);
        cutoff.setHours(cutoff.getHours() + 2);
        if (now < cutoff) return 'isha';
        return 'latenight';
    }

    // ===== QIBLA COMPASS =====
    function normalizeDegrees(angle) {
        let normalized = angle % 360;
        if (normalized < 0) normalized += 360;
        return normalized;
    }

    function shortestAngleDelta(from, to) {
        return ((to - from + 540) % 360) - 180;
    }

    function setNeedleRotation(targetAngle) {
        const arrow = document.getElementById('qiblaArrow');
        if (!arrow) return;
        const normalizedTarget = normalizeDegrees(targetAngle);
        const delta = shortestAngleDelta(currentNeedleRotation, normalizedTarget);
        currentNeedleRotation = normalizeDegrees(currentNeedleRotation + delta);
        arrow.style.transform = `rotate(${currentNeedleRotation}deg)`;
    }

    function buildQiblaDegreeRing() {
        const ring = document.getElementById('qiblaDegreeRing');
        if (!ring || ring.dataset.built === '1') return;
        const ticks = [];
        for (let deg = 0; deg < 360; deg += 30) {
            ticks.push(`<span class="qibla-tick" style="transform: rotate(${deg}deg) translate(-50%, -100%);"></span>`);
            ticks.push(`<span class="qibla-tick-label" style="transform: rotate(${deg}deg) translate(-50%, -100%);">${localizeDigits(deg)}</span>`);
        }
        ring.innerHTML = ticks.join('');
        ring.dataset.built = '1';
    }

    function calculateQibla(lat, lng) {
        const latR = lat * Math.PI / 180;
        const lngR = lng * Math.PI / 180;
        const kLatR = KAABA_LAT * Math.PI / 180;
        const kLngR = KAABA_LNG * Math.PI / 180;
        const dLng = kLngR - lngR;

        const x = Math.sin(dLng);
        const y = Math.cos(latR) * Math.tan(kLatR) - Math.sin(latR) * Math.cos(dLng);
        let qibla = Math.atan2(x, y) * 180 / Math.PI;
        if (qibla < 0) qibla += 360;

        userQibla = qibla;
        setQiblaDistanceText(getDistanceToKaabaKm(lat, lng));
        buildQiblaDegreeRing();

        const degEl = document.getElementById('qiblaDegree');
        const statusEl = document.getElementById('qiblaStatus');
        const qiblaRounded = Math.round(qibla);
        const uiText = getPrayerUiText();
        if (degEl) {
            degEl.textContent = `${localizeDigits(qiblaRounded)}°`;
        }

        const hasOrientationSupport = ('ondeviceorientationabsolute' in window)
            || ('ondeviceorientation' in window)
            || (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');

        if (statusEl) {
            statusEl.textContent = hasOrientationSupport
                ? uiText.qiblaRotateHint
                : (isPashtoMode()
                    ? `${localizeDigits(qiblaRounded)}° له شماله د قبلې لوری`
                    : `Qibla is ${qiblaRounded}° from North`);
        }

        const marker = document.getElementById('qiblaMarker');
        if (marker) marker.style.transform = `rotate(${qibla}deg)`;

        // Static fallback: rotate needle to Qibla if heading sensors unavailable
        setNeedleRotation(qibla);
    }

    function initCompass() {
        buildQiblaDegreeRing();
        window.removeEventListener('deviceorientationabsolute', handleCompass, true);
        window.removeEventListener('deviceorientation', handleCompass, true);

        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ — needs explicit permission
            const statusEl = document.getElementById('qiblaStatus');
            if (statusEl && !sessionStorage.getItem('compass_requested')) {
                statusEl.innerHTML = `<button class="selected-city-change" onclick="requestCompassPermission()">${isPashtoMode() ? 'د کمپاس اجازه' : 'Allow Compass'}</button>`;
            }
        } else if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleCompass, true);
        } else if ('ondeviceorientation' in window) {
            window.addEventListener('deviceorientation', handleCompass, true);
        }
    }

    window.requestCompassPermission = function() {
        sessionStorage.setItem('compass_requested', 'true');
        DeviceOrientationEvent.requestPermission().then(state => {
            if (state === 'granted') {
                window.addEventListener('deviceorientation', handleCompass, true);
                const statusEl = document.getElementById('qiblaStatus');
                if (statusEl) statusEl.textContent = getPrayerUiText().qiblaNeedleHint;
            }
        }).catch(() => {});
    };

    function processCompassHeading() {
        if (latestCompassHeading == null || userQibla == null) return;

        const section = document.getElementById('qiblaSection');
        const statusEl = document.getElementById('qiblaStatus');
        const uiText = getPrayerUiText();

        const needleTarget = normalizeDegrees(userQibla - latestCompassHeading);
        setNeedleRotation(needleTarget);

        const delta = Math.abs(shortestAngleDelta(latestCompassHeading, userQibla));
        const aligned = delta <= 5;
        if (section) section.classList.toggle('aligned', aligned);
        if (statusEl) {
            statusEl.textContent = aligned
                ? uiText.qiblaFacing
                : uiText.qiblaAlmost.replace('{delta}', localizeDigits(Math.round(delta)));
        }
    }

    function queueCompassUpdate(heading) {
        latestCompassHeading = normalizeDegrees(heading);
        if (compassEventTimer) return;
        compassEventTimer = setTimeout(() => {
            compassEventTimer = null;
            processCompassHeading();
        }, 80);
    }

    function handleCompass(e) {
        let heading = e.webkitCompassHeading || (e.alpha != null ? (360 - e.alpha) : null);
        if (heading == null || userQibla == null) return;
        queueCompassUpdate(heading);
    }

    // ===== PRAYER NOTIFICATIONS =====
    let notificationTimeouts = [];
    let dailyDuaReminderTimer = null;
    let activePrayerReminderSchedule = {};
    let prayerReminderPollInterval = null;
    let prayerBootstrapRetryTimer = null;
    let lastMissedReminderNoticeKey = null;
    const firedPrayerReminderKeys = new Set();
    const PRAYER_REMINDER_LATE_GRACE_MS = 90 * 60 * 1000;
    const FOREGROUND_REMINDER_BANNER_TEXT = 'Reminders require the app to stay open on this device. For reliable background reminders, use the Android app.';

    function clearPrayerBootstrapRetry() {
        if (prayerBootstrapRetryTimer) {
            clearTimeout(prayerBootstrapRetryTimer);
            prayerBootstrapRetryTimer = null;
        }
    }

    function updateForegroundReminderBanner() {
        const banner = document.getElementById('foregroundReminderBanner');
        if (!banner) return;

        const settings = loadReminderSettings();
        const shouldShow = !!settings.enabled && isForegroundOnlyReminderMode();
        banner.textContent = FOREGROUND_REMINDER_BANNER_TEXT;
        banner.classList.toggle('active', shouldShow);
        banner.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    function getNextScheduledReminderEntry(includePast = false, nowTs = Date.now()) {
        const entries = Object.entries(activePrayerReminderSchedule)
            .map(([name, details]) => ({ name, details }))
            .filter(({ details }) => details && typeof details.triggerAt === 'number')
            .filter(({ details }) => includePast || details.triggerAt > nowTs)
            .sort((a, b) => a.details.triggerAt - b.details.triggerAt);
        return entries[0] || null;
    }

    function notifyMissedReminderOnResume(nowTs = Date.now()) {
        if (isNativeAndroidReminderMode()) return;
        const settings = loadReminderSettings();
        if (!settings.enabled) return;

        const nextEntry = getNextScheduledReminderEntry(true, nowTs);
        if (!nextEntry) return;
        if (nextEntry.details.triggerAt > nowTs) return;

        const reminderKey = getReminderKey(nextEntry.name, nextEntry.details.triggerAt);
        if (lastMissedReminderNoticeKey === reminderKey) return;
        lastMissedReminderNoticeKey = reminderKey;

        showToast(`You may have missed your ${getPrayerLabel(nextEntry.name)} reminder while the app was in the background.`);
    }

    function bootstrapPrayerStateFromCache(retryCount = 0) {
        const cached = localStorage.getItem('crown_location');
        if (!cached) {
            clearPrayerBootstrapRetry();
            return;
        }

        let loc = null;
        try {
            loc = JSON.parse(cached);
        } catch (error) {
            clearPrayerBootstrapRetry();
            return;
        }

        if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
            clearPrayerBootstrapRetry();
            return;
        }

        if (typeof adhan === 'undefined') {
            if (retryCount >= 20) return;
            clearPrayerBootstrapRetry();
            prayerBootstrapRetryTimer = setTimeout(() => bootstrapPrayerStateFromCache(retryCount + 1), 500);
            return;
        }

        clearPrayerBootstrapRetry();

        const coordinates = new adhan.Coordinates(loc.lat, loc.lng);
        const params = adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = adhan.Madhab.Hanafi;
        const pt = new adhan.PrayerTimes(coordinates, new Date(), params);

        prayerTimesData = {
            fajr: pt.fajr,
            sunrise: pt.sunrise,
            dhuhr: pt.dhuhr,
            asr: pt.asr,
            maghrib: pt.maghrib,
            isha: pt.isha
        };

        if (prayerPanelHydrated) {
            renderPrayerGrid();
            updateCountdown();
            startCountdown();
            syncReminderUi();
        }

        refreshHomeNextPrayerCard();

        const settings = loadReminderSettings();
        if (settings.enabled) {
            schedulePrayerNotifications();
            scheduleDailyDuaReminder();
        }
    }

    function getReminderKey(prayerName, triggerAt) {
        return `${prayerName}:${Number(triggerAt) || 0}`;
    }

    function hasReminderFired(prayerName, triggerAt) {
        return firedPrayerReminderKeys.has(getReminderKey(prayerName, triggerAt));
    }

    function markReminderFired(prayerName, triggerAt) {
        firedPrayerReminderKeys.add(getReminderKey(prayerName, triggerAt));
    }

    function clearFiredReminderMarks() {
        firedPrayerReminderKeys.clear();
    }

    function renderPrayerReminderStatusLine() {
        const statusEl = document.getElementById('prayerReminderStatus');
        if (!statusEl) return;

        const uiText = getPrayerUiText();
        const settings = loadReminderSettings();
        if (!settings.enabled) {
            statusEl.textContent = uiText.remindersInactive;
            statusEl.classList.remove('active');
            updateForegroundReminderBanner();
            return;
        }

        if (isNativeAndroidReminderMode()) {
            const nativeState = ensureNativeAndroidReminderState();
            const permissions = nativeState?.permissions || {};
            if (!permissions.ready) {
                statusEl.textContent = uiText.alertsNativePermissionPending;
                statusEl.classList.add('active');
                updateForegroundReminderBanner();
                return;
            }

            const nextNativeReminder = nativeState?.nextReminder;
            if (!nextNativeReminder || typeof nextNativeReminder.triggerAt !== 'number' || !nextNativeReminder.prayerName) {
                statusEl.textContent = uiText.remindersInactive;
                statusEl.classList.remove('active');
                updateForegroundReminderBanner();
                return;
            }

            const timeText = formatDisplayTime(new Date(nextNativeReminder.triggerAt), `native-status-line-${nextNativeReminder.prayerName}`);
            statusEl.textContent = uiText.remindersActiveNext
                .replace('{prayer}', getPrayerLabel(nextNativeReminder.prayerName))
                .replace('{time}', timeText);
            statusEl.classList.add('active');
            updateForegroundReminderBanner();
            return;
        }

        const nowTs = Date.now();
        const nextEntry = getNextScheduledReminderEntry(false, nowTs);

        if (!nextEntry) {
            statusEl.textContent = uiText.remindersForegroundIdle;
            statusEl.classList.add('active');
            updateForegroundReminderBanner();
            return;
        }

        const timeText = formatDisplayTime(new Date(nextEntry.details.triggerAt), `status-line-${nextEntry.name}`);
        statusEl.textContent = uiText.remindersForegroundNext
            .replace('{prayer}', getPrayerLabel(nextEntry.name))
            .replace('{time}', timeText);
        statusEl.classList.add('active');
        updateForegroundReminderBanner();
    }

    function stopPrayerReminderPolling() {
        if (prayerReminderPollInterval) {
            clearInterval(prayerReminderPollInterval);
            prayerReminderPollInterval = null;
        }
    }

    function clearWebOnlyPrayerReminderState() {
        notificationTimeouts.forEach(tid => clearTimeout(tid));
        notificationTimeouts = [];
        activePrayerReminderSchedule = {};
        stopPrayerReminderPolling();
        if (reminderMidnightTimer) {
            clearTimeout(reminderMidnightTimer);
            reminderMidnightTimer = null;
        }
        clearFiredReminderMarks();
    }

    function runPrayerReminderPollingCheck(source = 'poll') {
        const now = Date.now();
        const due = [];

        Object.entries(activePrayerReminderSchedule).forEach(([prayerName, details]) => {
            if (!details || typeof details.triggerAt !== 'number') return;
            const diff = details.triggerAt - now;
            console.log(`[PrayerReminder Poll] Checking... current: ${new Date(now).toLocaleTimeString()}, next fire (${prayerName}): ${new Date(details.triggerAt).toLocaleTimeString()}, diff: ${diff}ms`);
        });

        Object.entries(activePrayerReminderSchedule).forEach(([prayerName, details]) => {
            if (!details || typeof details.triggerAt !== 'number') return;
            const lateByMs = now - details.triggerAt;
            if (lateByMs >= -30000 && lateByMs <= PRAYER_REMINDER_LATE_GRACE_MS && !hasReminderFired(prayerName, details.triggerAt)) {
                console.log(`Polling caught ${prayerName} — firing reminder`, {
                    source,
                    now: new Date(now).toString(),
                    fireAt: new Date(details.triggerAt).toString(),
                    lateByMs
                });
                due.push({ prayerName, details });
            }
        });

        due.forEach(({ prayerName, details }) => {
            markReminderFired(prayerName, details.triggerAt);
            firePrayerReminder(prayerName, details.offsetMinutes > 0, details.offsetMinutes, {
                triggerAt: details.triggerAt,
                source
            });
            delete activePrayerReminderSchedule[prayerName];
        });

        if (due.length) {
            syncPrayerReminderStateToServiceWorker('poll-fired');
            schedulePrayerNotifications();
        }
        refreshHomeNextPrayerCard();
    }

    function startPrayerReminderPolling() {
        stopPrayerReminderPolling();
        prayerReminderPollInterval = setInterval(() => {
            runPrayerReminderPollingCheck('interval');
        }, 30000);
        runPrayerReminderPollingCheck('initial');
    }

    function getReminderSchedulePayload() {
        return Object.entries(activePrayerReminderSchedule).map(([prayerName, details]) => ({
            prayerName,
            triggerAt: details.triggerAt,
            offsetMinutes: details.offsetMinutes,
            icon: PRAYER_ICONS[prayerName] || '🕌',
            label: getPrayerLabel(prayerName)
        }));
    }

    function syncPrayerReminderStateToServiceWorker(reasonOrReminders = 'schedule', remindersOverride = undefined) {
        if (!('serviceWorker' in navigator)) return;

        const reason = Array.isArray(reasonOrReminders) ? 'schedule' : (reasonOrReminders || 'schedule');
        const overrideReminders = Array.isArray(reasonOrReminders) ? reasonOrReminders : remindersOverride;

        const nativeMode = isNativeAndroidReminderMode();
        const reminders = nativeMode
            ? []
            : (Array.isArray(overrideReminders) ? overrideReminders : []);

        // Web reminders are intentionally foreground-only. Clear any old background
        // reminder state in the service worker so the app does not imply reliable
        // background firing on browsers/iPhone.
        const payload = {
            type: 'SYNC_PRAYER_REMINDERS',
            reason,
            generatedAt: Date.now(),
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            reminders
        };

        navigator.serviceWorker.ready
            .then((registration) => {
                if (registration?.active) registration.active.postMessage(payload);
                if (nativeMode) {
                    postNativeReminderModeToServiceWorker(true, `sync:${reason}`);
                }
            })
            .catch(() => {});
    }

    function requestNotificationPermissionIfNeeded() {
        const uiText = getPrayerUiText();
        if (isNativeAndroidReminderMode()) {
            const nativeState = requestNativeAndroidReminderPermissions('android-reminder-permissions');
            if (!nativeState?.permissions?.ready) {
                showToast(uiText.alertsNativePermissionPending);
            }
            return Promise.resolve(!!nativeState?.permissions?.ready);
        }
        console.log('=== REMINDER SETUP ===');
        console.log('Notification permission:', typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
        console.log('[PrayerReminder] Notification permission check', {
            supported: 'Notification' in window,
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
        });
        if (!('Notification' in window)) {
            showToast(uiText.alertsUnsupported);
            return Promise.resolve(false);
        }

        if (Notification.permission === 'granted') return Promise.resolve(true);
        if (Notification.permission === 'denied') {
            console.log('BLOCKED — cannot send notifications');
            showToast(uiText.alertsPermissionDenied);
            return Promise.resolve(false);
        }

        return Notification.requestPermission()
            .then((permission) => {
                console.log('Permission result:', permission);
                if (permission === 'granted') return true;
                console.log('BLOCKED — cannot send notifications');
                showToast(uiText.alertsPermissionDenied);
                return false;
            })
            .catch(() => {
                console.log('BLOCKED — cannot send notifications');
                showToast(uiText.alertsPermissionDenied);
                return false;
            });
    }

    function sendSystemNotification(title, options) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!('serviceWorker' in navigator)) return;

        return navigator.serviceWorker.ready
            .then((registration) => {
                if (registration && typeof registration.showNotification === 'function') {
                    return registration.showNotification(title, options);
                }
                return null;
            })
            .catch(() => null);
    }

    function resolveReminderSoundId(prayerName = null) {
        const settings = loadReminderSettings();
        if ((settings.soundId || '') === 'silent') return 'silent';
        if (settings.sameSoundForAll || !prayerName) return settings.soundId || 'adhan-alafasy';
        return settings.prayerSounds?.[prayerName] || settings.soundId || 'adhan-alafasy';
    }

    function playReminderSound(soundId) {
        playReminderAudioOption(soundId, { isPreview: false });
    }

    function getPrayerCoordinates() {
        try {
            const cached = JSON.parse(localStorage.getItem('crown_location') || 'null');
            if (!cached || typeof cached.lat !== 'number' || typeof cached.lng !== 'number') return null;
            return { lat: cached.lat, lng: cached.lng };
        } catch (error) {
            return null;
        }
    }

    function getPrayerTimeForDate(prayerName, date) {
        const coords = getPrayerCoordinates();
        if (!coords || typeof adhan === 'undefined') return null;

        const coordinates = new adhan.Coordinates(coords.lat, coords.lng);
        const params = adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = adhan.Madhab.Hanafi;
        const pt = new adhan.PrayerTimes(coordinates, date, params);
        console.log('[PrayerReminder] Prayer time parsed', {
            prayerName,
            localDate: date.toString(),
            timezoneOffsetMinutes: date.getTimezoneOffset(),
            parsedPrayerTime: pt[prayerName] ? new Date(pt[prayerName]).toString() : null
        });
        return pt[prayerName] || null;
    }

    function getNextReminderDate(prayerName, offsetMinutes, now) {
        const asValidDate = (value) => {
            if (!value) return null;
            const d = new Date(value);
            return Number.isFinite(d.getTime()) ? d : null;
        };

        const todayPrayer = asValidDate(prayerTimesData?.[prayerName] || getPrayerTimeForDate(prayerName, now));
        if (todayPrayer) {
            const candidate = new Date(todayPrayer);
            candidate.setMinutes(candidate.getMinutes() - offsetMinutes);
            console.log('[PrayerReminder] Candidate reminder (today)', {
                prayerName,
                prayerAt: todayPrayer.toString(),
                reminderAt: candidate.toString(),
                now: now.toString(),
                offsetMinutes
            });
            if (candidate > now) return candidate;
        }

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowPrayer = asValidDate(getPrayerTimeForDate(prayerName, tomorrow));
        if (!tomorrowPrayer) return null;
        const nextCandidate = new Date(tomorrowPrayer);
        nextCandidate.setMinutes(nextCandidate.getMinutes() - offsetMinutes);
        console.log('[PrayerReminder] Candidate reminder (tomorrow)', {
            prayerName,
            prayerAt: new Date(tomorrowPrayer).toString(),
            reminderAt: nextCandidate.toString(),
            now: now.toString(),
            offsetMinutes
        });
        return nextCandidate > now ? nextCandidate : null;
    }

    function showReminderSetConfirmation(prayerName) {
        const settings = loadReminderSettings();
        if (!settings.enabled || !settings.prayers[prayerName]) return;
        const when = getNextReminderDate(prayerName, settings.offsetMinutes, new Date());
        if (!when) return;
        const uiText = getPrayerUiText();
        const messageTemplate = isForegroundOnlyReminderMode()
            ? uiText.reminderSetForeground
            : uiText.reminderSet;
        const message = messageTemplate
            .replace('{prayer}', getPrayerLabel(prayerName))
            .replace('{time}', formatDisplayTime(when, `reminder-set-${prayerName}`));
        showToast(message);
    }

    function showFirstEnabledReminderConfirmation() {
        const settings = loadReminderSettings();
        const firstEnabled = REMINDER_PRAYERS.find(name => settings.prayers[name]);
        if (!firstEnabled) {
            showToast(getPrayerUiText().reminderSaved);
            return;
        }
        showReminderSetConfirmation(firstEnabled);
    }

    function firePrayerReminder(prayerName, isPreReminder, minutesBefore, meta = {}) {
        console.log('[PrayerReminder] Timer fired', {
            prayerName,
            isPreReminder,
            minutesBefore,
            triggerAt: meta.triggerAt || null,
            source: meta.source || 'timer',
            firedAtLocal: new Date().toString(),
            firedAtISO: new Date().toISOString()
        });
        const uiText = getPrayerUiText();
        const localizedPrayer = getPrayerLabel(prayerName);
        const triggerAt = Number(meta.triggerAt || 0);
        const body = isPreReminder
            ? uiText.preReminderBody
                .replace('{prayer}', localizedPrayer)
                .replace('{minutes}', localizeDigits(minutesBefore))
            : uiText.atTimeBody.replace('{prayer}', localizedPrayer);

        const title = isPreReminder
            ? `${PRAYER_ICONS[prayerName]} ${localizedPrayer} • ${localizeDigits(minutesBefore)}m`
            : `${PRAYER_ICONS[prayerName]} ${localizedPrayer}`;

        sendSystemNotification(title, {
            body,
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: `prayer-${prayerName}-${isPreReminder ? 'before' : 'now'}-${triggerAt || Date.now()}`,
            renotify: true,
            requireInteraction: true,
            vibrate: [200, 100, 200],
            silent: false,
            data: {
                prayer: prayerName,
                triggerAt: triggerAt || null,
                source: meta.source || 'timer',
                url: '/'
            }
        });

        playReminderSound(resolveReminderSoundId(prayerName));

        if (!document.hidden) {
            showToast(uiText.inAppPrayerAlert.replace('{prayer}', localizedPrayer));
        }
    }

    window.togglePrayerNotifications = function(enabled) {
        const settings = loadReminderSettings();
        const nativeMode = isNativeAndroidReminderMode();
        const uiText = getPrayerUiText();

        if (enabled) {
            console.log('[DEBUG] Native mode:', isNativeAndroidReminderMode());
            console.log('[DEBUG] Bridge available:', !!getAndroidReminderBridge());
        }

        if (enabled) {
            if (nativeMode && !ensureNativeAndroidPermissionsBeforeReminderEnable('enable-master-reminder')) {
                syncReminderUi();
                renderPrayerGrid();
                initDailyReminderPrompt();
                return;
            }

            requestNotificationPermissionIfNeeded().then((granted) => {
                if (!granted) {
                    syncReminderUi();
                    renderPrayerGrid();

                    if (nativeMode) showToast(ANDROID_REMINDER_PERMISSION_REQUIRED_MESSAGE);
                    return;
                }

                settings.enabled = true;
                localStorage.setItem('crown_notifications', 'true');
                saveReminderSettings();
                syncReminderUi();
                schedulePrayerNotifications();
                scheduleDailyDuaReminder();
                showToast(isForegroundOnlyReminderMode() ? uiText.alertsForegroundOnly : uiText.alertsEnabled);
                showFirstEnabledReminderConfirmation();
            });
        } else {
            settings.enabled = false;
            localStorage.setItem('crown_notifications', 'false');
            saveReminderSettings();
            syncReminderUi();
            clearPrayerNotifications();
            clearDailyDuaReminder();
            showToast(uiText.alertsDisabled);
        }
        initDailyReminderPrompt();
    };

    function scheduleReminderMidnightRefresh() {
        if (reminderMidnightTimer) {
            console.log('[PrayerReminder] Clearing previous midnight refresh timer');
            clearTimeout(reminderMidnightTimer);
            reminderMidnightTimer = null;
        }

        const settings = loadReminderSettings();
        if (!settings.enabled) return;

        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 2, 0);
        const delay = Math.max(1000, nextMidnight - now);
        console.log('[PrayerReminder] Scheduling midnight refresh', {
            now: now.toString(),
            nextMidnight: nextMidnight.toString(),
            delayMs: delay
        });
        reminderMidnightTimer = setTimeout(() => {
            console.log('[PrayerReminder] Midnight refresh fired', { firedAt: new Date().toString() });
            clearFiredReminderMarks();
            const coords = getPrayerCoordinates();
            if (coords) calculateAndRenderPrayers(coords.lat, coords.lng);
            schedulePrayerNotifications();
        }, delay);
    }

    function schedulePrayerNotifications() {
        if (isNativeAndroidReminderMode()) {
            clearWebOnlyPrayerReminderState();
            syncNativeAndroidReminderState('schedule');
            renderPrayerGrid();
            renderPrayerReminderStatusLine();
            refreshHomeNextPrayerCard();
            return;
        }

        clearPrayerNotifications();
        const settings = loadReminderSettings();
        if (!settings.enabled) return;

        const now = new Date();
        console.log('=== REMINDER SETUP ===');
        console.log('Current time:', now.toLocaleTimeString());
        console.log('Prayer times calculated:');
        REMINDER_PRAYERS.forEach((prayerName) => {
            const prayerAt = prayerTimesData?.[prayerName] || getPrayerTimeForDate(prayerName, now);
            console.log(`  ${getPrayerLabel(prayerName)}:`, prayerAt ? new Date(prayerAt).toLocaleTimeString() : 'N/A');
        });

        const enabledPrayers = REMINDER_PRAYERS.filter((name) => !!settings.prayers[name]);
        console.log('Enabled reminders:', enabledPrayers);
        console.log('Selected sound:', resolveReminderSoundId());
        console.log('Offset minutes:', settings.offsetMinutes);
        console.log('Notification permission:', typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

        console.log('[PrayerReminder] Scheduling start', {
            now: now.toString(),
            nowISO: now.toISOString(),
            timezoneOffsetMinutes: now.getTimezoneOffset(),
            offset: settings.offsetMinutes,
            mode: settings.mode,
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
        });

        REMINDER_PRAYERS.forEach(name => {
            if (!settings.prayers[name]) return;
            const prayerAt = prayerTimesData?.[name] || getPrayerTimeForDate(name, now);
            const reminderTime = getNextReminderDate(name, settings.offsetMinutes, now);
            if (!reminderTime) {
                console.log('[PrayerReminder] Skipping reminder (no valid next time)', {
                    prayer: name,
                    prayerTimeLocal: prayerAt ? new Date(prayerAt).toString() : null,
                    offsetMinutes: settings.offsetMinutes
                });
                return;
            }

            const delay = reminderTime.getTime() - now.getTime();
            if (delay <= 0 || delay > 172800000) {
                console.log(`${name} already passed — skip`);
                return;
            }

            console.log('[PrayerReminder] Scheduled', {
                prayer: name,
                prayerTimeLocal: prayerAt ? new Date(prayerAt).toString() : null,
                reminderOffsetMinutes: settings.offsetMinutes,
                reminderAtLocal: reminderTime.toString(),
                reminderAtISO: reminderTime.toISOString(),
                currentTimeLocal: now.toString(),
                delayMs: delay
            });

            console.log('[PrayerReminder Debug] prayer=%s prayerTime=%s offset=%s scheduled=%s',
                name,
                prayerAt ? new Date(prayerAt).toString() : 'N/A',
                settings.offsetMinutes,
                reminderTime.toString()
            );

            const triggerAt = reminderTime.getTime();
            activePrayerReminderSchedule[name] = {
                triggerAt,
                offsetMinutes: settings.offsetMinutes,
                createdAt: now.getTime()
            };

            console.log(`Timer set for ${name}:`);
            console.log(`  Fire at: ${new Date(triggerAt).toLocaleTimeString()}`);
            console.log(`  MS until fire: ${delay}`);

            const tid = setTimeout(() => {
                if (hasReminderFired(name, triggerAt)) return;
                markReminderFired(name, triggerAt);
                firePrayerReminder(name, settings.offsetMinutes > 0, settings.offsetMinutes, {
                    triggerAt,
                    source: 'timer'
                });
                delete activePrayerReminderSchedule[name];
                syncPrayerReminderStateToServiceWorker('timer-fired');
                schedulePrayerNotifications();
            }, delay);
            console.log(`  Timer ID: ${String(tid)}`);
            notificationTimeouts.push(tid);
        });

        startPrayerReminderPolling();
        renderPrayerGrid();
        renderPrayerReminderStatusLine();
        refreshHomeNextPrayerCard();
        syncPrayerReminderStateToServiceWorker('schedule');
        scheduleReminderMidnightRefresh();
    }

    function clearPrayerNotifications() {
        if (isNativeAndroidReminderMode()) {
            clearWebOnlyPrayerReminderState();
            syncNativeAndroidReminderState('clear');
            renderPrayerGrid();
            renderPrayerReminderStatusLine();
            refreshHomeNextPrayerCard();
            return;
        }

        console.log('[PrayerReminder] Clearing reminder timers', {
            timerCount: notificationTimeouts.length,
            hasMidnightTimer: !!reminderMidnightTimer
        });
        clearWebOnlyPrayerReminderState();
        renderPrayerGrid();
        renderPrayerReminderStatusLine();
        refreshHomeNextPrayerCard();
        syncPrayerReminderStateToServiceWorker('clear');
    }

    function getTodayDuaSummary() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const duaIndex = (dayOfYear % 63) + 1;
        const card = document.querySelector(`.dua-card[data-id="${duaIndex}"]`);
        const title = card?.querySelector('.dua-title')?.textContent?.trim() || `Dua #${duaIndex}`;
        return { title, duaIndex };
    }

    function clearDailyDuaReminder() {
        if (dailyDuaReminderTimer) {
            clearTimeout(dailyDuaReminderTimer);
            dailyDuaReminderTimer = null;
        }
    }

    function scheduleDailyDuaReminder() {
        if (isNativeAndroidReminderMode()) return;
        clearDailyDuaReminder();
        if (localStorage.getItem('crown_notifications') !== 'true') return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const now = new Date();
        const next = new Date(now);
        next.setHours(9, 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const delay = next - now;

        dailyDuaReminderTimer = setTimeout(() => {
            const { title } = getTodayDuaSummary();
            sendSystemNotification('📖 Daily Dua Reminder', {
                body: `Today’s focus: ${title}`,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                tag: 'daily-dua-reminder',
                renotify: false,
                requireInteraction: true,
                vibrate: [200, 100, 200],
                silent: false,
                data: {
                    prayer: 'daily-dua',
                    url: '/'
                }
            });
            scheduleDailyDuaReminder();
        }, delay);
    }

    // Re-schedule notifications on visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            bootstrapPrayerStateFromCache();
            if (prayerTimesData) {
                loadReminderSettings();
                syncReminderUi();
                notifyMissedReminderOnResume(Date.now());
                schedulePrayerNotifications();
                scheduleDailyDuaReminder();
            }
        }
    });

    // Auto-calculate prayer times on load if location is cached (for time banner enhancement)
    document.addEventListener('DOMContentLoaded', function() {
        const nativeMode = isNativeAndroidReminderMode();
        document.documentElement.classList.toggle('native-android-app', nativeMode);

        if (nativeMode) {
            ensureNativeAndroidReminderState();
            syncPrayerReminderStateToServiceWorker([]);
            postNativeReminderModeToServiceWorker(true, 'startup');
        } else {
            postNativeReminderModeToServiceWorker(false, 'startup');
            maybeSuggestNativeAppForReminders();
        }
        bootstrapPrayerStateFromCache();
        if (!nativeMode) syncPrayerReminderStateToServiceWorker('bootstrap-clear');
    });

    // ===== QURAN READING FEATURE =====
    const QURAN_API_BASE = 'https://api.alquran.cloud/v1';
    const DEFAULT_ANDROID_PASHTO_AUDIO_BASE_URL = window.location.host === 'appassets.androidplatform.net'
        ? 'https://mohhp.github.io/Essential-duas'
        : '';
    const PASHTO_AUDIO_BASE_URL = String(window.PASHTO_AUDIO_BASE_URL || DEFAULT_ANDROID_PASHTO_AUDIO_BASE_URL || '').trim();
    const QURAN_PASHTO_ZAKARIA_DATA_URL = '/audio/pashto_audit/quranenc_pashto_zakaria_114.json';
    const QURAN_CACHE_PREFIX = 'crown_quran_surah_';
    const QURAN_META_KEY = 'crown_quran_meta';
    const QURAN_LAST_READ_KEY = 'crown_quran_last_read';
    const QURAN_RECENT_KEY = 'crown_quran_recent';
    const QURAN_BOOKMARKS_KEY = 'crown_quran_bookmarks';
    const QURAN_OFFLINE_KEY = 'crown_quran_offline_surahs';
    const QURAN_ACTIVE_TAB_KEY = 'crown_quran_active_tab';
    const QURAN_PANEL_MODE_KEY = 'crown_quran_panel_mode';
    const QURAN_SETTINGS_KEY = 'crown_quran_settings';
    const QURAN_AUDIO_CACHE = 'crown-quran-audio-v1';
    const QURAN_FALLBACK_RECITER = 'ar.alafasy';
    const quranSavedPanelMode = localStorage.getItem(QURAN_PANEL_MODE_KEY);

    if (PASHTO_AUDIO_BASE_URL && typeof window.setPashtoAudioBaseUrl === 'function') {
        window.setPashtoAudioBaseUrl(PASHTO_AUDIO_BASE_URL);
    }

    const QURAN_RECITERS = [
        { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
        { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit Abdul Samad' },
        { id: 'ar.abdurrahmaansudais', name: 'Abdul Rahman Al-Sudais' },
        { id: 'ar.husary', name: 'Mahmoud Khalil Al-Hussary' },
        { id: 'ar.saoodshuraym', name: 'Saud Al-Shuraim' }
    ];

    const QURAN_TRANSLATION_MODES = ['all', 'ar-ps', 'ar-en', 'ar'];
    const QURAN_AUDIO_SPEEDS = [0.75, 1, 1.25];
    const QURAN_JUZ_STARTS = [
        { surah: 1, ayah: 1 }, { surah: 2, ayah: 142 }, { surah: 2, ayah: 253 }, { surah: 3, ayah: 93 },
        { surah: 4, ayah: 24 }, { surah: 4, ayah: 148 }, { surah: 5, ayah: 82 }, { surah: 6, ayah: 111 },
        { surah: 7, ayah: 88 }, { surah: 8, ayah: 41 }, { surah: 9, ayah: 93 }, { surah: 11, ayah: 6 },
        { surah: 12, ayah: 53 }, { surah: 15, ayah: 1 }, { surah: 17, ayah: 1 }, { surah: 18, ayah: 75 },
        { surah: 21, ayah: 1 }, { surah: 23, ayah: 1 }, { surah: 25, ayah: 21 }, { surah: 27, ayah: 56 },
        { surah: 29, ayah: 46 }, { surah: 33, ayah: 31 }, { surah: 36, ayah: 28 }, { surah: 39, ayah: 32 },
        { surah: 41, ayah: 47 }, { surah: 46, ayah: 1 }, { surah: 51, ayah: 31 }, { surah: 58, ayah: 1 },
        { surah: 67, ayah: 1 }, { surah: 78, ayah: 1 }
    ];
    const quranState = {
        initialized: false,
        meta: null,
        surahStartOffsets: null,
        view: localStorage.getItem(QURAN_ACTIVE_TAB_KEY) || 'surah',
        panelMode: quranSavedPanelMode || (isPashtoMode() ? 'pashto' : 'arabic'),
        search: '',
        currentSurah: null,
        currentSurahData: null,
        renderedAyahs: 0,
        chunkSize: 36,
        audio: null,
        audioObjectUrl: null,
        audioAyah: null,
        playerState: 'hidden',
        isChainedPlayback: false,
        lastPlayedSurah: null,
        lastPlayedAyah: null,
        audioRate: 1,
        audioPausedManually: false,
        audioFallbackAttempted: false,
        audioSwitchingSource: false,
        isContinuousSurahPlayback: false,
        audioSessionStartAyah: 1,
        forcePashtoAfterCurrentFlow: false,
        activeFlowMode: 'ar',
        translationAudio: null,
        translationOverlayMode: null,
        translationQueueToken: 0,
        lastPashtoUnavailableAyahKey: null,
        isPashtoTranslationActive: false,
        isPashtoAyahSegmentPlayback: false,
        isTransitioningToPashto: false,
        pashtoTranslationSurah: null,
        pashtoZakariaMap: null,
        pashtoZakariaPromise: null,
        loadingReader: false,
        loadingList: false,
        dropdownOpen: false
    };

    function normalizeQuranPanelMode(mode) {
        if (mode === 'pashto' || mode === 'english' || mode === 'arabic') return mode;
        return 'arabic';
    }

    function getFlowModeFromPanelMode(mode) {
        const panel = normalizeQuranPanelMode(mode);
        if (panel === 'pashto') return 'ar-ps';
        if (panel === 'english') return 'ar-en';
        return 'ar';
    }

    function getTranslationModeFromPanelMode(mode) {
        const panel = normalizeQuranPanelMode(mode);
        if (panel === 'pashto') return 'ar-ps';
        if (panel === 'english') return 'ar-en';
        // Arabic panel is always Arabic-only.
        return 'ar';
    }

    const QURAN_POPULAR_ITEMS = [
        { type: 'surah', number: 1, fallbackEn: 'Al-Fatiha' },
        { type: 'surah', number: 2, fallbackEn: 'Al-Baqarah' },
        { type: 'surah', number: 36, fallbackEn: 'Yasin' },
        { type: 'surah', number: 67, fallbackEn: 'Al-Mulk' },
        { type: 'surah', number: 55, fallbackEn: 'Ar-Rahman' },
        { type: 'surah', number: 18, fallbackEn: 'Al-Kahf' },
        { type: 'surah', number: 56, fallbackEn: "Al-Waqi'ah" },
        { type: 'juz', number: 30, fallbackEn: 'Juz Amma' }
    ];
    let quranDotLongPressTimer = null;
    let quranDotLongPressFired = false;
    let quranReaderControlsTimer = null;
    let quranAudioRecoveryTimer = null;
    const ENGLISH_AUDIO_CACHE = new Map();
    const PASHTO_AYAH_AUDIO_CACHE = new Map();
    const PASHTO_SURAH_AUDIO_AVAILABILITY = new Map();
    const PASHTO_SURAH_AUDIO_PROMISES = new Map();
    const PASHTO_SURAH_AUDIO_PRELOAD_PROMISES = new Map();
    const PASHTO_SURAH_AUDIO_PRELOADED = new Set();

    function getQuranDefaults() {
        return {
            reciter: 'ar.alafasy',
            translationMode: 'all',
            arabicSize: 2,
            autoScrollAudio: true,
            mushafMode: false,
            autoPashtoAfterArabic: false,
            pashtoEdition: 'ps.abdulwali'
        };
    }

    function getQuranUiText() {
        const isPS = isPashtoMode();
        return {
            panelTitle: isPS ? 'قرآن کریم' : 'Quran',
            readingMode: isPS ? 'د مطالعې حالت' : 'Reading Mode',
            readingModeOn: isPS ? 'د مطالعې حالت فعال شو' : 'Reading mode enabled',
            readingModeOff: isPS ? 'د مطالعې حالت بند شو' : 'Reading mode disabled',
            tabArabic: isPS ? 'عربي' : 'Arabic',
            tabPashto: isPS ? 'پښتو' : 'Pashto',
            tabEnglish: isPS ? 'انګلیسي' : 'English',
            searchPlaceholder: isPS ? 'سورت ولټوئ (شمېره، عربي، انګلیسي)...' : 'Search Surah (number, Arabic, English)...',
            continueReading: isPS ? 'مطالعه دوام ورکړئ' : 'Continue Reading',
            continue: isPS ? 'دوام' : 'Continue',
            recentlyRead: isPS ? 'وروستي لوستل شوي' : 'Recently Read',
            ayahs: isPS ? 'آیتونه' : 'Ayahs',
            makki: isPS ? 'مکي' : 'Makki',
            madani: isPS ? 'مدني' : 'Madani',
            meccan: isPS ? 'مکي' : 'Makki',
            medinan: isPS ? 'مدني' : 'Madani',
            open: isPS ? 'خلاص' : 'Open',
            downloadOffline: isPS ? 'آفلاین ته ښکته کړئ' : 'Download for Offline',
            downloading: isPS ? 'کښته کېږي...' : 'Downloading...',
            downloaded: isPS ? 'آفلاین خوندي شو' : 'Saved offline',
            noData: isPS ? 'معلومات ونه موندل شول' : 'No data found',
            noBookmarks: isPS ? 'تاسو تر اوسه هیڅ خوښونه نلرئ' : 'No bookmarks yet',
            noRecent: isPS ? 'تر اوسه هیڅ سورت نه دی لوستل شوی' : 'No surahs read yet',
            loading: isPS ? 'بارېږي...' : 'Loading...',
            bismillah: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
            arabicOnly: isPS ? 'یوازې عربي' : 'Arabic only',
            defaultReciter: isPS ? 'اصلي قاري' : 'Default reciter',
            reciterLabel: isPS ? 'قاري' : 'Reciter',
            translationMode: isPS ? 'د ژباړې حالت' : 'Translation display',
            arabicFontSize: isPS ? 'د عربي لیک کچه' : 'Arabic font size',
            autoScroll: isPS ? 'د غږ پر مهال اتومات سکرول' : 'Auto-scroll during audio',
            mushafMode: isPS ? 'مصحف حالت (یوازې عربي)' : 'Mushaf mode (Arabic only)',
            autoPashtoAfterArabic: isPS ? 'د عربي له بشپړېدو وروسته پښتو ژباړه' : 'Auto-play Pashto after Arabic',
            flowArabic: isPS ? 'عربي (پرله پسې تلاوت)' : 'Arabic (Continuous)',
            flowArabicPashto: isPS ? 'عربي بیا پښتو غږیزه ژباړه' : 'Arabic then Pashto audio translation',
            flowArabicEnglish: isPS ? 'عربي + انګلیسي (پرله پسې)' : 'Arabic + English (Sequential)',
            playPashtoAudio: isPS ? 'عربي بیا پښتو غږیزه ژباړه' : 'Arabic then Pashto audio translation',
            stopPashtoAudio: isPS ? 'د پښتو غږیزه ژباړه بنده کړئ' : 'Stop Pashto audio translation',
            pashtoAudioStatus: isPS ? 'پښتو غږیزه ژباړه' : 'Pashto audio translation',
            pashtoAudioHint: isPS ? 'پلې کېکاږئ: سورت به په عربي تلاوت شي، وروسته به د هماغه سورت پښتو غږیزه ژباړه چلېږي' : 'Press Play: the surah will recite in Arabic first, then the Pashto audio translation for that surah will play',
            pashtoAudioLoadingBanner: isPS ? 'د پښتو غږیزه ژباړه چمتو کېږي...' : 'Preparing Pashto audio translation...',
            pashtoAudioUnavailable: isPS ? 'د دې سورت لپاره د پښتو غږیزه ژباړه اوس نشته، خو عربي تلاوت به بیا هم وغږېږي' : 'Pashto audio is unavailable for this surah right now, but Arabic recitation will still play',
            openSurahFirst: isPS ? 'لومړی یو سورت پرانیزئ' : 'Open a surah first',
            saveSettings: isPS ? 'تنظیمات خوندي شول' : 'Settings saved',
            notPlaying: isPS ? 'اوس غږ نه شته' : 'Not playing',
            playAll: isPS ? 'ټول پلی' : 'Play All',
            pause: isPS ? 'درول' : 'Pause',
            play: isPS ? 'پلی' : 'Play',
            juzLabel: isPS ? 'جز' : 'Juz',
            openReader: isPS ? 'د سورت لوستونکی' : 'Surah Reader',
            cached: isPS ? 'آفلاین' : 'Cached',
            bookmark: isPS ? 'نښه' : 'Bookmark',
            bookmarked: isPS ? 'نښه شوی' : 'Bookmarked',
            removedBookmark: isPS ? 'نښه لرې شوه' : 'Bookmark removed',
            pashtoComingSoonBanner: isPS ? 'د دې سورت لپاره د پښتو غږ ژر راځي' : 'Pashto audio coming soon for this surah',
            noPashtoFound: isPS ? 'د پښتو ژباړې API ونه موندل شو' : 'Pashto translation API edition not found',
            pashtoEditionFound: isPS ? 'د پښتو ژباړه فعاله شوه' : 'Pashto translation enabled'
        };
    }

    function canUsePashtoSurahAudio(surahNumber) {
        const surah = Number(surahNumber);
        return Number.isFinite(surah)
            && surah >= 1
            && surah <= 114
            && typeof window.getPashtoTranslationUrl === 'function'
            && typeof window.playPashtoTranslation === 'function';
    }

    function getPashtoSurahAudioAvailability(surahNumber) {
        const surah = Number(surahNumber);
        if (!Number.isFinite(surah) || surah < 1 || surah > 114) return false;
        if (PASHTO_SURAH_AUDIO_AVAILABILITY.has(surah)) {
            return PASHTO_SURAH_AUDIO_AVAILABILITY.get(surah);
        }
        return null;
    }

    async function resolvePashtoSurahAudioAvailability(surahNumber) {
        const surah = Number(surahNumber);
        if (!Number.isFinite(surah) || surah < 1 || surah > 114) return false;
        if (!canUsePashtoSurahAudio(surah)) {
            PASHTO_SURAH_AUDIO_AVAILABILITY.set(surah, false);
            return false;
        }
        if (PASHTO_SURAH_AUDIO_AVAILABILITY.has(surah)) {
            return PASHTO_SURAH_AUDIO_AVAILABILITY.get(surah);
        }
        if (PASHTO_SURAH_AUDIO_PROMISES.has(surah)) {
            return PASHTO_SURAH_AUDIO_PROMISES.get(surah);
        }

        const pending = (async () => {
            try {
                const url = await window.getPashtoTranslationUrl(surah);
                const available = !!String(url || '').trim();
                PASHTO_SURAH_AUDIO_AVAILABILITY.set(surah, available);
                return available;
            } catch (error) {
                const isKnownMissing = /No Pashto translation URL/i.test(String(error?.message || ''));
                if (isKnownMissing) PASHTO_SURAH_AUDIO_AVAILABILITY.set(surah, false);
                return false;
            } finally {
                PASHTO_SURAH_AUDIO_PROMISES.delete(surah);
            }
        })();

        PASHTO_SURAH_AUDIO_PROMISES.set(surah, pending);
        return pending;
    }

    function hasPashtoSurahAudio(surahNumber) {
        return getPashtoSurahAudioAvailability(surahNumber) === true;
    }

    function refreshQuranPashtoAudioAvailability() {
        const surah = Number(quranState.currentSurah || 0);
        if (!canUsePashtoSurahAudio(surah)) {
            updateQuranPashtoAudioBanner();
            updateQuranFloatingAudioUi();
            return Promise.resolve(false);
        }

        const cached = getPashtoSurahAudioAvailability(surah);
        updateQuranPashtoAudioBanner();
        updateQuranFloatingAudioUi();
        if (cached !== null) return Promise.resolve(cached);

        return resolvePashtoSurahAudioAvailability(surah).then((available) => {
            if (Number(quranState.currentSurah || 0) === surah) {
                updateQuranPashtoAudioBanner();
                updateQuranFloatingAudioUi();
            }
            return available;
        });
    }

    async function warmPashtoSurahAudio(surahNumber, { force = false, waitTimeoutMs = 0, requirePreloadSuccess = false } = {}) {
        const surah = Number(surahNumber);
        if (!canUsePashtoSurahAudio(surah)) return false;

        let available = hasPashtoSurahAudio(surah);
        if (!available) {
            available = await resolvePashtoSurahAudioAvailability(surah);
        }
        if (!available) return false;
        if (typeof window.preloadPashtoTranslation !== 'function') return true;
        if (!force && PASHTO_SURAH_AUDIO_PRELOADED.has(surah)) return true;

        let pending = PASHTO_SURAH_AUDIO_PRELOAD_PROMISES.get(surah);
        if (!pending || force) {
            pending = (async () => {
                try {
                    await window.preloadPashtoTranslation(surah);
                    PASHTO_SURAH_AUDIO_PRELOADED.add(surah);
                    return true;
                } catch (error) {
                    PASHTO_SURAH_AUDIO_PRELOADED.delete(surah);
                    return requirePreloadSuccess ? false : available;
                } finally {
                    if (PASHTO_SURAH_AUDIO_PRELOAD_PROMISES.get(surah) === pending) {
                        PASHTO_SURAH_AUDIO_PRELOAD_PROMISES.delete(surah);
                    }
                }
            })();
            PASHTO_SURAH_AUDIO_PRELOAD_PROMISES.set(surah, pending);
        }

        if (waitTimeoutMs > 0) {
            return Promise.race([
                pending,
                new Promise((resolve) => setTimeout(() => resolve(false), waitTimeoutMs))
            ]);
        }

        return pending;
    }

    function updateQuranPashtoAudioBanner() {
        const banner = document.getElementById('quranPashtoAudioBanner');
        if (!banner) return;
        const ui = getQuranUiText();
        const isPashtoPanel = normalizeQuranPanelMode(quranState.panelMode) === 'pashto';
        const surahNo = Number(quranState.currentSurah || 0);
        const availability = getPashtoSurahAudioAvailability(surahNo);

        let text = '';
        let state = 'hidden';

        if (isPashtoPanel && surahNo > 0) {
            if (!canUsePashtoSurahAudio(surahNo)) {
                text = ui.pashtoAudioUnavailable;
                state = 'unavailable';
            } else if (availability === false) {
                text = ui.pashtoAudioUnavailable;
                state = 'unavailable';
            } else if (availability === null) {
                text = ui.pashtoAudioLoadingBanner;
                state = 'loading';
            } else {
                text = ui.pashtoAudioHint;
                state = 'ready';
            }
        }

        banner.textContent = text;
        banner.dataset.state = state;
        banner.classList.toggle('visible', !!text);
    }

    function renderQuranInlineReciterSelect() {
        const select = document.getElementById('quranInlineReciterSelect');
        const label = document.getElementById('quranInlineReciterLabel');
        if (!select) return;

        const ui = getQuranUiText();
        const settings = getQuranSettings();
        if (label) label.textContent = ui.reciterLabel;

        select.innerHTML = QURAN_RECITERS
            .map((reciter) => `<option value="${reciter.id}" ${settings.reciter === reciter.id ? 'selected' : ''}>${reciter.name}</option>`)
            .join('');

        if (select.dataset.bound === '1') return;

        select.addEventListener('change', () => {
            const next = getQuranSettings();
            next.reciter = select.value;
            saveQuranSettings(next);
            showToast(ui.saveSettings);

            const settingsSelect = document.getElementById('quranReciterSelect');
            if (settingsSelect) settingsSelect.value = next.reciter;

            if (isQuranAudioSessionActive() && quranState.currentSurah) {
                const ayahNo = quranState.audioAyah
                    ? Number((quranState.audioAyah.split(':')[1]))
                    : Number(quranState.lastPlayedAyah || 1);
                playQuranAyahInternal(Number(quranState.currentSurah), Math.max(1, ayahNo), 0, true);
            }
        });

        select.dataset.bound = '1';
    }

    function getQuranSettings() {
        const defaults = getQuranDefaults();
        try {
            const raw = JSON.parse(localStorage.getItem(QURAN_SETTINGS_KEY) || 'null');
            const settings = {
                ...defaults,
                ...(raw || {})
            };

            const legacyReciterMap = {
                'ar.abdurrahmansudais': 'ar.abdurrahmaansudais',
                'ar.shuraim': 'ar.saoodshuraym'
            };
            if (legacyReciterMap[settings.reciter]) settings.reciter = legacyReciterMap[settings.reciter];

            if (!QURAN_RECITERS.find(r => r.id === settings.reciter)) settings.reciter = defaults.reciter;
            if (!QURAN_TRANSLATION_MODES.includes(settings.translationMode)) settings.translationMode = defaults.translationMode;
            settings.arabicSize = Math.max(1.4, Math.min(2.8, Number(settings.arabicSize) || defaults.arabicSize));
            settings.autoScrollAudio = !!settings.autoScrollAudio;
            settings.mushafMode = !!settings.mushafMode;
            settings.autoPashtoAfterArabic = !!settings.autoPashtoAfterArabic;
            settings.pashtoEdition = settings.pashtoEdition || defaults.pashtoEdition;
            return settings;
        } catch (error) {
            return defaults;
        }
    }

    function saveQuranSettings(settings) {
        localStorage.setItem(QURAN_SETTINGS_KEY, JSON.stringify(settings));
    }

    function getQuranLastRead() {
        try { return JSON.parse(localStorage.getItem(QURAN_LAST_READ_KEY) || 'null'); } catch (error) { return null; }
    }

    function setQuranLastRead(payload) {
        const ts = Date.now();
        localStorage.setItem(QURAN_LAST_READ_KEY, JSON.stringify({ ...payload, ts }));
        registerQuranReadForStreak(ts);
        refreshHomeQuranStreakCard();
        refreshHomeDashboardProgress();
    }

    function getQuranRecent() {
        try { return JSON.parse(localStorage.getItem(QURAN_RECENT_KEY) || '[]'); } catch (error) { return []; }
    }

    function pushQuranRecent(entry) {
        const list = getQuranRecent().filter(item => item.surahNumber !== entry.surahNumber);
        list.unshift({ ...entry, ts: Date.now() });
        localStorage.setItem(QURAN_RECENT_KEY, JSON.stringify(list.slice(0, 5)));
    }

    function getQuranBookmarks() {
        try { return JSON.parse(localStorage.getItem(QURAN_BOOKMARKS_KEY) || '[]'); } catch (error) { return []; }
    }

    function saveQuranBookmarks(list) {
        localStorage.setItem(QURAN_BOOKMARKS_KEY, JSON.stringify(list));
    }

    function getOfflineSurahs() {
        try { return JSON.parse(localStorage.getItem(QURAN_OFFLINE_KEY) || '[]'); } catch (error) { return []; }
    }

    function markSurahOffline(surahNumber) {
        const set = new Set(getOfflineSurahs());
        set.add(Number(surahNumber));
        localStorage.setItem(QURAN_OFFLINE_KEY, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
    }

    function getSurahCacheKey(surahNumber) {
        return `${QURAN_CACHE_PREFIX}${surahNumber}`;
    }

    function getCachedSurahData(surahNumber) {
        try {
            const raw = localStorage.getItem(getSurahCacheKey(surahNumber));
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function saveCachedSurahData(surahNumber, data) {
        localStorage.setItem(getSurahCacheKey(surahNumber), JSON.stringify({
            savedAt: Date.now(),
            data
        }));
        markSurahOffline(surahNumber);
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
        const timeout = Math.max(1000, Number(timeoutMs) || 12000);
        if (typeof AbortController === 'undefined') {
            return fetch(url, options);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchQuranMeta() {
        if (quranState.meta) return quranState.meta;
        const cached = localStorage.getItem(QURAN_META_KEY);
        if (cached) {
            try {
                quranState.meta = JSON.parse(cached);
                buildSurahStartOffsets();
                return quranState.meta;
            } catch (error) {}
        }

        const response = await fetchWithTimeout(`${QURAN_API_BASE}/meta`, {}, 12000);
        if (!response.ok) throw new Error('Failed to load Quran metadata');
        const json = await response.json();
        if (json?.code !== 200 || !json?.data?.surahs?.references) throw new Error('Failed to load Quran metadata');
        quranState.meta = json.data;
        buildSurahStartOffsets();
        localStorage.setItem(QURAN_META_KEY, JSON.stringify(quranState.meta));
        return quranState.meta;
    }

    function buildSurahStartOffsets() {
        const refs = quranState.meta?.surahs?.references || [];
        if (!refs.length) return;

        const offsets = {};
        let runningTotal = 1;
        refs
            .slice()
            .sort((a, b) => Number(a.number) - Number(b.number))
            .forEach((surah) => {
                const surahNo = Number(surah.number);
                const ayahCount = Number(surah.numberOfAyahs) || 0;
                offsets[surahNo] = runningTotal;
                runningTotal += ayahCount;
            });

        quranState.surahStartOffsets = offsets;
    }

    function getSurahStartOffset(surahNumber) {
        const surahNo = Number(surahNumber);
        if (!surahNo) return null;
        if (!quranState.surahStartOffsets) buildSurahStartOffsets();
        return Number(quranState.surahStartOffsets?.[surahNo]) || null;
    }

    function localizeQuranNumber(value) {
        const lang = String(getPreferredLang() || '').toLowerCase();
        return (lang === 'ps' || lang === 'ar') ? localizeDigits(value) : String(value);
    }

    function cleanSurahArabicName(name) {
        return String(name || '').replace(/^سُورَةُ\s*/u, '').replace(/^سورة\s*/u, '').trim();
    }

    function normalizeLatinSearchText(value) {
        let text = String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/['’`\-_.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        text = text.replace(/^(al|as|ar|an)\s+/i, '');
        const compact = text.replace(/\s+/g, '');
        const slimVowels = compact.replace(/([aeiou])\1+/g, '$1');
        const consonantSkeleton = slimVowels.replace(/[aeiou]/g, '');
        return { compact, slimVowels, consonantSkeleton };
    }

    function normalizeArabicSearchText(value) {
        const normalized = String(value || '')
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
            .replace(/[\u0640]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/[\s\-ـ'’`_.]+/g, '')
            .trim();
        return {
            value: normalized,
            noArticle: normalized.replace(/^ال+/, '')
        };
    }

    function includesFuzzyLatin(haystackRaw, needleRaw) {
        const haystack = normalizeLatinSearchText(haystackRaw);
        const needle = normalizeLatinSearchText(needleRaw);
        if (!needle.compact) return true;
        if (haystack.compact.includes(needle.compact)) return true;
        if (haystack.slimVowels.includes(needle.slimVowels)) return true;
        return !!needle.consonantSkeleton && haystack.consonantSkeleton.includes(needle.consonantSkeleton);
    }

    function includesFuzzyArabic(haystackRaw, needleRaw) {
        const haystack = normalizeArabicSearchText(haystackRaw);
        const needle = normalizeArabicSearchText(needleRaw);
        if (!needle.value) return true;
        return haystack.value.includes(needle.value)
            || haystack.noArticle.includes(needle.value)
            || haystack.value.includes(needle.noArticle)
            || haystack.noArticle.includes(needle.noArticle);
    }

    function getRevelationMeta(typeRaw) {
        const ui = getQuranUiText();
        const type = String(typeRaw || '').toLowerCase();
        const meccan = type.includes('meccan') || type.includes('makki') || type.includes('makkah');
        return meccan
            ? { label: ui.makki, tone: 'makki' }
            : { label: ui.madani, tone: 'madani' };
    }

    function getCurrentSurahMetaByNumber(surahNumber) {
        let refs = quranState.meta?.surahs?.references || [];
        if (!refs.length) {
            try {
                const cachedMeta = JSON.parse(localStorage.getItem(QURAN_META_KEY) || 'null');
                refs = cachedMeta?.surahs?.references || [];
                if (refs.length && !quranState.meta) quranState.meta = cachedMeta;
            } catch (error) {}
        }
        return refs.find(ref => Number(ref.number) === Number(surahNumber)) || null;
    }

    async function loadPashtoZakariaMap() {
        if (quranState.pashtoZakariaMap) return quranState.pashtoZakariaMap;
        if (quranState.pashtoZakariaPromise) return quranState.pashtoZakariaPromise;

        quranState.pashtoZakariaPromise = fetchWithTimeout(QURAN_PASHTO_ZAKARIA_DATA_URL, { cache: 'no-cache' }, 12000)
            .then((response) => {
                if (!response.ok) throw new Error('Failed to load Pashto Zakaria dataset');
                return response.json();
            })
            .then((payload) => {
                const map = new Map();
                const rows = Array.isArray(payload?.surahs) ? payload.surahs : [];
                rows.forEach((surahRow) => {
                    const surahNo = Number(surahRow?.surah);
                    if (!surahNo) return;
                    const ayahRows = Array.isArray(surahRow?.ayahs) ? surahRow.ayahs : [];
                    const texts = ayahRows
                        .sort((a, b) => Number(a.ayah) - Number(b.ayah))
                        .map((ayahRow) => String(ayahRow?.text || '').trim());
                    map.set(surahNo, texts);
                });
                quranState.pashtoZakariaMap = map;
                return map;
            })
            .catch((error) => {
                quranState.pashtoZakariaMap = new Map();
                return quranState.pashtoZakariaMap;
            })
            .finally(() => {
                quranState.pashtoZakariaPromise = null;
            });

        return quranState.pashtoZakariaPromise;
    }

    function getPashtoZakariaAyahTexts(surahNumber, expectedAyahCount) {
        const surahNo = Number(surahNumber);
        const rows = quranState.pashtoZakariaMap?.get(surahNo) || [];
        if (!Number(expectedAyahCount) || rows.length >= Number(expectedAyahCount)) return rows;

        // Keep shape stable for rendering even if upstream translation is partially missing.
        const out = rows.slice();
        while (out.length < Number(expectedAyahCount)) out.push('');
        return out;
    }

    async function ensurePashtoEdition() {
        const settings = getQuranSettings();
        if (settings.pashtoEdition && settings.pashtoEdition.startsWith('ps.')) return settings.pashtoEdition;
        try {
            const response = await fetchWithTimeout(`${QURAN_API_BASE}/edition/language/ps`, {}, 12000);
            if (!response.ok) throw new Error('Failed to load Pashto edition list');
            const json = await response.json();
            if (json?.code === 200 && Array.isArray(json.data) && json.data[0]?.identifier) {
                settings.pashtoEdition = json.data[0].identifier;
                saveQuranSettings(settings);
                return settings.pashtoEdition;
            }
        } catch (error) {}
        return null;
    }

    function getTranslationModeEffective() {
        const panel = normalizeQuranPanelMode(quranState.panelMode);
        if (panel === 'pashto') return 'ar-ps';
        if (panel === 'english') return 'ar-en';
        return getQuranSettings().translationMode || 'ar';
    }

    function updateQuranPanelModeUi() {
        const activeMode = normalizeQuranPanelMode(quranState.panelMode);

        document.querySelectorAll('.quran-view-tab[data-qview]').forEach((tab) => {
            const isActive = tab.getAttribute('data-qview') === activeMode;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        document.querySelectorAll('.quran-mode-btn[data-qmode]').forEach((btn) => {
            const isActive = btn.getAttribute('data-qmode') === activeMode;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        syncQuranSegmentedThumb();
    }

    function setQuranPanelMode(mode, { restartAudio = true } = {}) {
        const nextMode = normalizeQuranPanelMode(mode);
        quranState.panelMode = nextMode;
        localStorage.setItem(QURAN_PANEL_MODE_KEY, nextMode);

        quranState.activeFlowMode = getFlowModeFromPanelMode(nextMode);
        updateQuranPanelModeUi();

        if (quranState.currentSurahData) {
            renderQuranAyahChunk(true);
            highlightPlayingAyah();
        }

        updateQuranPashtoAudioBanner();
        if (quranState.currentSurah) void refreshQuranPashtoAudioAvailability();

        if (restartAudio && quranState.currentSurah && isQuranAudioSessionActive()) {
            const ayahNo = quranState.audioAyah
                ? Number((quranState.audioAyah.split(':')[1]))
                : Number(quranState.lastPlayedAyah || 1);
            playQuranAyahInternal(Number(quranState.currentSurah), Math.max(1, ayahNo), 0, true);
        }
    }

    function applyQuranArabicFontSize() {
        const settings = getQuranSettings();
        document.documentElement.style.setProperty('--quran-ar-size', `${settings.arabicSize}rem`);
    }

    function buildQuranSurahList(search = '') {
        const refs = quranState.meta?.surahs?.references || [];
        const query = String(search || '').trim();
        if (!query) return refs;

        const hasArabic = /[\u0600-\u06FF]/.test(query);

        return refs.filter((surah) => {
            const number = String(surah.number);
            const ar = cleanSurahArabicName(surah.name);
            const en = String(surah.englishName || '');
            const enTranslation = String(surah.englishNameTranslation || '');
            if (number.includes(query)) return true;
            if (hasArabic) return includesFuzzyArabic(ar, query);
            return includesFuzzyLatin(en, query)
                || includesFuzzyLatin(enTranslation, query)
                || includesFuzzyArabic(ar, query);
        });
    }

    function getRelativeLastReadText(timestamp) {
        const ts = Number(timestamp || 0);
        if (!Number.isFinite(ts) || ts <= 0) {
            return isPashtoMode() ? 'وروستی لوستل: همدا اوس' : 'Last read just now';
        }
        const diffMs = Math.max(0, Date.now() - ts);
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return isPashtoMode()
                ? `وروستی لوستل: ${localizeQuranNumber(days)} ورځې مخکې`
                : `Last read ${days} day${days === 1 ? '' : 's'} ago`;
        }
        if (hours > 0) {
            return isPashtoMode()
                ? `وروستی لوستل: ${localizeQuranNumber(hours)} ساعت مخکې`
                : `Last read ${hours} hour${hours === 1 ? '' : 's'} ago`;
        }
        if (minutes > 0) {
            return isPashtoMode()
                ? `وروستی لوستل: ${localizeQuranNumber(minutes)} دقیقې مخکې`
                : `Last read ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        }
        return isPashtoMode() ? 'وروستی لوستل: همدا اوس' : 'Last read just now';
    }

    function renderQuranContinueCard() {
        const card = document.getElementById('quranContinueCard');
        if (!card) return;
        const ui = getQuranUiText();
        const last = getQuranLastRead();
        if (!last || !last.surahNumber) {
            card.innerHTML = '';
            return;
        }
        const meta = getCurrentSurahMetaByNumber(last.surahNumber);
        if (!meta) {
            card.innerHTML = '';
            return;
        }

        const surahName = isPashtoMode() ? cleanSurahArabicName(meta.name) : meta.englishName;
        const ayahLabel = isPashtoMode() ? 'آیت' : 'Ayah';
        const lastReadLabel = getRelativeLastReadText(last.timestamp);
        const continueIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" fill="currentColor" fill-opacity="0.15"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" fill="currentColor" fill-opacity="0.15"/><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        card.innerHTML = `
            <div class="quran-continue-inner">
                <div class="quran-continue-head">
                    <span class="quran-continue-icon" aria-hidden="true">${continueIcon}</span>
                    <span class="quran-continue-kicker">${ui.continueReading}</span>
                </div>
                <div class="quran-continue-main">
                    <div class="quran-continue-copy">
                        <div class="quran-continue-surah">${surahName}</div>
                        <div class="quran-continue-ayah">${ayahLabel} ${localizeQuranNumber(last.ayahNumber || 1)}</div>
                        <div class="quran-continue-lastread">${lastReadLabel}</div>
                    </div>
                    <button class="quran-row-btn quran-continue-btn" type="button" onclick="resumeQuranReading()">${ui.continue}</button>
                </div>
            </div>`;
    }

    function renderQuranRecentSection() {
        const wrap = document.getElementById('quranRecentWrap');
        if (wrap) wrap.innerHTML = '';
    }

    function getQuranPopularItemsResolved() {
        const refs = quranState.meta?.surahs?.references || [];
        const refByNo = new Map(refs.map((item) => [Number(item.number), item]));
        return QURAN_POPULAR_ITEMS.map((item) => {
            if (item.type === 'juz') {
                return {
                    ...item,
                    titleAr: 'الجزء الثلاثون',
                    titleEn: isPashtoMode() ? 'جز عم' : item.fallbackEn,
                    ayahCount: 564
                };
            }

            const meta = refByNo.get(Number(item.number));
            const titleAr = cleanSurahArabicName(meta?.name || item.fallbackEn);
            const titleEn = isPashtoMode()
                ? String(meta?.englishNameTranslation || meta?.englishName || item.fallbackEn)
                : String(meta?.englishName || item.fallbackEn);
            const ayahCount = Number(meta?.numberOfAyahs || 0);
            const revelation = getRevelationMeta(meta?.revelationType);
            return {
                ...item,
                titleAr,
                titleEn,
                ayahCount,
                revelationLabel: revelation.label,
                revelationTone: revelation.tone
            };
        });
    }

    function renderQuranPopularGrid() {
        const grid = document.getElementById('quranPopularGrid');
        const title = document.getElementById('quranPopularTitle');
        if (!grid) return;
        if (title) title.textContent = isPashtoMode() ? 'مشهور سورتونه' : 'Popular Surahs';

        const ui = getQuranUiText();
        const list = getQuranPopularItemsResolved();
        grid.innerHTML = list.map((item) => {
            const action = item.type === 'juz'
                ? `openQuranJuz(${Number(item.number)})`
                : `openQuranSurah(${Number(item.number)})`;

            return `
                <div class="quran-popular-card" onclick="${action}">
                    <div class="quran-popular-topline">
                        <span class="quran-popular-badge">${localizeQuranNumber(item.number || 0)}</span>
                        ${item.type === 'surah' ? `<span class="quran-popular-revelation ${item.revelationTone === 'makki' ? 'is-makki' : 'is-madani'}">${escapeHtml(item.revelationLabel || '')}</span>` : ''}
                    </div>
                    <div class="quran-popular-ar" dir="rtl">${escapeHtml(item.titleAr || '')}</div>
                    <div class="quran-popular-name">${escapeHtml(item.titleEn || '')}</div>
                    <div class="quran-popular-meta">${localizeQuranNumber(item.ayahCount || 0)} ${ui.ayahs}</div>
                </div>
            `;
        }).join('');
    }

    function updateQuranSurahSelectLabel() {
        const btn = document.getElementById('quranSurahSelectBtn');
        if (!btn) return;
        const currentMeta = getCurrentSurahMetaByNumber(quranState.currentSurah);
        if (!currentMeta) {
            btn.textContent = isPashtoMode() ? 'سوره وټاکئ' : 'Select Surah / سوره وټاکئ';
            return;
        }

        const ar = cleanSurahArabicName(currentMeta.name);
        const en = isPashtoMode()
            ? (currentMeta.englishNameTranslation || currentMeta.englishName)
            : currentMeta.englishName;
        btn.textContent = `${localizeQuranNumber(currentMeta.number)} • ${ar} • ${en}`;
    }

    function renderQuranJumpRail(rows) {
        const rail = document.getElementById('quranJumpRail');
        if (!rail) return;
        // Disabled to prevent broken numeric rail overlap on narrow screens.
        rail.innerHTML = '';
    }

    function closeQuranSurahDropdown() {
        const dropdown = document.getElementById('quranSurahDropdown');
        const btn = document.getElementById('quranSurahSelectBtn');
        if (!dropdown || !btn) return;
        dropdown.classList.remove('open');
        dropdown.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
        quranState.dropdownOpen = false;
    }

    function toggleQuranSurahDropdown(forceOpen = null) {
        const dropdown = document.getElementById('quranSurahDropdown');
        const btn = document.getElementById('quranSurahSelectBtn');
        if (!dropdown || !btn) return;
        const shouldOpen = forceOpen == null ? !quranState.dropdownOpen : !!forceOpen;
        quranState.dropdownOpen = shouldOpen;
        dropdown.classList.toggle('open', shouldOpen);
        dropdown.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
        btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        if (!shouldOpen) {
            const input = document.getElementById('quranSearchInput');
            if (input) input.blur();
        }
    }

    function getQuranPaneByView(view) {
        const map = {
            surah: document.getElementById('quranPaneSurah'),
            juz: document.getElementById('quranPaneJuz'),
            bookmarks: document.getElementById('quranPaneBookmarks'),
            settings: document.getElementById('quranPaneSettings')
        };
        return map[view] || map.surah;
    }

    function getQuranListContainerByView(view) {
        const map = {
            surah: document.getElementById('quranSurahList'),
            juz: document.getElementById('quranJuzList'),
            bookmarks: document.getElementById('quranBookmarksList'),
            settings: document.getElementById('quranSettingsList')
        };
        return map[view] || map.surah;
    }

    function setQuranView(view, { skipHistory = false } = {}) {
        const nextView = ['surah', 'juz', 'bookmarks', 'settings'].includes(view) ? view : 'surah';
        quranState.view = nextView;
        localStorage.setItem(QURAN_ACTIVE_TAB_KEY, nextView);

        document.querySelectorAll('.quran-subtab-pane').forEach(pane => pane.classList.remove('active'));
        const activePane = getQuranPaneByView(nextView);
        if (activePane) activePane.classList.add('active');

        const listScreen = document.getElementById('quranListScreen');
        const selector = document.getElementById('quranSurahSelector');
        const reader = document.getElementById('quranReaderScreen');
        const readerWasActive = !!(reader && reader.classList.contains('active'));

        if (readerWasActive && isQuranAudioSessionActive()) {
            stopQuranAudio({ resetTime: true, navigatedAway: true });
        }

        if (listScreen) listScreen.style.display = '';
        const activeList = getQuranListContainerByView(nextView);
        if (activeList) activeList.style.display = '';
        if (reader) reader.classList.remove('active');
        if (selector) selector.style.display = '';
        renderQuranContinueCard();
        renderQuranSurahRows();
        renderQuranPopularGrid();

        updateInAppFabVisibility();
        if (!skipHistory && document.querySelector('.quran-panel.active')) recordInAppRoute(false);
    }

    function renderQuranSurahRows() {
        const list = document.getElementById('quranSurahList');
        if (!list) return;
        const ui = getQuranUiText();
        const rows = buildQuranSurahList(quranState.search);
        const offlineSet = new Set(getOfflineSurahs().map(Number));
        const lastRead = getQuranLastRead();
        const recentlyReadSurah = Number(lastRead?.surahNumber || 0);

        list.innerHTML = rows.map((surah) => {
            const revelation = getRevelationMeta(surah.revelationType);
            const primary = isPashtoMode()
                ? (surah.englishNameTranslation || surah.englishName)
                : surah.englishName;
            const secondary = isPashtoMode()
                ? surah.englishName
                : (surah.englishNameTranslation || surah.englishName);
            const arabicName = cleanSurahArabicName(surah.name);
            const cached = offlineSet.has(Number(surah.number));
            const isRecentlyRead = recentlyReadSurah === Number(surah.number);
            const revRaw = String(surah.revelationType || '').toLowerCase();
            const revelationClass = revRaw.includes('mad') ? 'is-madani' : 'is-makki';

            return `
                <div class="quran-surah-row ${revelationClass} ${isRecentlyRead ? 'is-recently-read' : ''}" data-surah-no="${surah.number}" onclick="openQuranSurah(${surah.number})">
                    <div class="quran-surah-num">${localizeQuranNumber(surah.number)}</div>
                    <div class="quran-surah-main">
                        <div class="quran-surah-top-line">
                            <span class="quran-surah-name-secondary">${escapeHtml(primary)}${secondary ? ` • ${escapeHtml(secondary)}` : ''}</span>
                            <span class="quran-revelation-text ${revelation.tone === 'makki' ? 'is-makki' : 'is-madani'}">${revelation.label}</span>
                            <span class="quran-surah-name-primary" dir="rtl">${escapeHtml(arabicName)}</span>
                            <span class="quran-surah-inline-actions">
                                ${isRecentlyRead ? `<span class="quran-recent-dot" title="${ui.recentlyRead}" aria-hidden="true"></span>` : ''}
                                ${cached
                                    ? `<span class="quran-cached-icon" title="${ui.cached}">✓</span>`
                                    : `<button class="quran-download-icon" type="button" title="${ui.downloadOffline}" onclick="event.stopPropagation(); downloadQuranSurahOffline(${surah.number});">↓</button>`}
                            </span>
                        </div>
                        <div class="quran-surah-bottom-line">
                            <span class="quran-surah-ayahs">${localizeQuranNumber(surah.numberOfAyahs)} ${ui.ayahs}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || `
            <div class="quran-empty-state">
                <div class="quran-empty-icon" aria-hidden="true">📚</div>
                <div class="quran-empty-title">${ui.noData}</div>
                <div class="quran-empty-sub">${isPashtoMode() ? 'د لټون متن بدل کړئ یا ټول سورتونه وښایئ.' : 'Try a different search term or clear the filter.'}</div>
            </div>
        `;

        renderQuranJumpRail(rows);
        updateQuranSurahSelectLabel();
    }

    function renderQuranJuzRows() {
        const list = document.getElementById('quranJuzList');
        if (!list) return;
        const ui = getQuranUiText();

        list.innerHTML = Array.from({ length: 30 }).map((_, index) => {
            const juzNo = index + 1;
            const start = QURAN_JUZ_STARTS[index] || { surah: 1, ayah: 1 };
            const surahMeta = getCurrentSurahMetaByNumber(start.surah);
            const surahName = surahMeta
                ? (isPashtoMode() ? cleanSurahArabicName(surahMeta.name) : surahMeta.englishName)
                : `${isPashtoMode() ? 'سورت' : 'Surah'} ${localizeQuranNumber(start.surah)}`;
            return `
                <div class="quran-juz-item" onclick="openQuranJuz(${juzNo})" role="button">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <div>
                            <strong>${ui.juzLabel} ${localizeQuranNumber(juzNo)}</strong>
                            <div style="font-size:0.68rem;color:var(--text-subtle);margin-top:3px;">
                                ${surahName} • ${isPashtoMode() ? 'آیت' : 'Ayah'} ${localizeQuranNumber(start.ayah)}
                            </div>
                        </div>
                        <button class="quran-row-btn" type="button">${ui.open}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openQuranJuz(juzNumber) {
        const idx = Math.max(1, Math.min(30, Number(juzNumber))) - 1;
        const start = QURAN_JUZ_STARTS[idx] || { surah: 1, ayah: 1 };
        openQuranSurah(start.surah, start.ayah);
    }

    function renderQuranBookmarksSection() {
        const list = document.getElementById('quranBookmarksList');
        if (!list) return;
        const ui = getQuranUiText();
        const bookmarks = getQuranBookmarks();

        if (!bookmarks.length) {
            list.innerHTML = `
                <div class="quran-empty-state">
                    <div class="quran-empty-icon" aria-hidden="true">🔖</div>
                    <div class="quran-empty-title">${ui.noBookmarks}</div>
                    <div class="quran-empty-sub">${isPashtoMode() ? 'د آیت تر څنګ نښه کېکاږئ تر څو وروسته ورته ژر وګرځئ.' : 'Tap bookmark on any ayah to quickly return later.'}</div>
                    <button class="quran-row-btn quran-empty-cta" type="button" onclick="setQuranView('surah')">${isPashtoMode() ? 'سورتونه وګورئ' : 'Browse Surahs'}</button>
                </div>`;
            return;
        }

        list.innerHTML = bookmarks
            .sort((a, b) => b.ts - a.ts)
            .map((item) => `
                <div class="quran-bookmark-item">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <div>
                            <div style="font-size:0.82rem;color:var(--text-primary)">${escapeHtml(item.surahLabel || `${isPashtoMode() ? 'سورت' : 'Surah'} ${item.surahNumber}`)}</div>
                            <div style="font-size:0.66rem;color:var(--text-subtle)">${isPashtoMode() ? 'آیت' : 'Ayah'} ${localizeQuranNumber(item.ayahNumber)}</div>
                            <div style="font-size:0.76rem;color:var(--gold-light);margin-top:3px;direction:rtl;text-align:right;">${escapeHtml(item.preview || '')}</div>
                        </div>
                        <div style="display:flex;gap:6px;">
                            <button class="quran-row-btn" type="button" onclick="openQuranSurah(${item.surahNumber}, ${item.ayahNumber})">${ui.open}</button>
                            <button class="quran-row-btn" type="button" onclick="removeQuranBookmark(${item.surahNumber}, ${item.ayahNumber})">×</button>
                        </div>
                    </div>
                </div>
            `).join('');
    }

    function renderQuranSettingsSection() {
        const list = document.getElementById('quranSettingsList');
        if (!list) return;
        const ui = getQuranUiText();
        const settings = getQuranSettings();

        list.innerHTML = `
            <div class="quran-settings-card">
                <div class="quran-settings-grid">
                    <div>
                        <label for="quranReciterSelect">${ui.defaultReciter}</label>
                        <select id="quranReciterSelect" class="prayer-reminder-select">
                            ${QURAN_RECITERS.map(reciter => `<option value="${reciter.id}" ${settings.reciter === reciter.id ? 'selected' : ''}>${reciter.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="quranTranslationModeSelect">${ui.translationMode}</label>
                        <select id="quranTranslationModeSelect" class="prayer-reminder-select">
                            <option value="all" ${settings.translationMode === 'all' ? 'selected' : ''}>AR + PS + EN</option>
                            <option value="ar-ps" ${settings.translationMode === 'ar-ps' ? 'selected' : ''}>AR + PS</option>
                            <option value="ar-en" ${settings.translationMode === 'ar-en' ? 'selected' : ''}>AR + EN</option>
                            <option value="ar" ${settings.translationMode === 'ar' ? 'selected' : ''}>${ui.arabicOnly}</option>
                        </select>
                    </div>
                    <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span>${ui.autoScroll}</span>
                        <input id="quranAutoScrollToggle" type="checkbox" ${settings.autoScrollAudio ? 'checked' : ''}>
                    </label>
                    <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span>${ui.mushafMode}</span>
                        <input id="quranMushafToggle" type="checkbox" ${settings.mushafMode ? 'checked' : ''}>
                    </label>
                    <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span>${ui.autoPashtoAfterArabic}</span>
                        <input id="quranAutoPashtoToggle" type="checkbox" ${settings.autoPashtoAfterArabic ? 'checked' : ''}>
                    </label>
                </div>
            </div>
        `;

        const reciterSelect = document.getElementById('quranReciterSelect');
        const modeSelect = document.getElementById('quranTranslationModeSelect');
        const autoScrollToggle = document.getElementById('quranAutoScrollToggle');
        const mushafToggle = document.getElementById('quranMushafToggle');
        const autoPashtoToggle = document.getElementById('quranAutoPashtoToggle');

        const persist = () => {
            const current = getQuranSettings();
            if (reciterSelect) current.reciter = reciterSelect.value;
            if (modeSelect) current.translationMode = modeSelect.value;
            if (autoScrollToggle) current.autoScrollAudio = autoScrollToggle.checked;
            if (mushafToggle) current.mushafMode = mushafToggle.checked;
            if (autoPashtoToggle) current.autoPashtoAfterArabic = autoPashtoToggle.checked;
            saveQuranSettings(current);
            applyQuranArabicFontSize();
            refreshQuranTranslationModeButtons();
            const inlineReciter = document.getElementById('quranInlineReciterSelect');
            if (inlineReciter) inlineReciter.value = current.reciter;
            showToast(ui.saveSettings);
            if (quranState.currentSurahData) renderQuranAyahChunk(true);
        };

        if (reciterSelect) reciterSelect.addEventListener('change', persist);
        if (modeSelect) modeSelect.addEventListener('change', persist);
        if (autoScrollToggle) autoScrollToggle.addEventListener('change', persist);
        if (mushafToggle) mushafToggle.addEventListener('change', persist);
        if (autoPashtoToggle) autoPashtoToggle.addEventListener('change', persist);
    }

    function showQuranSkeleton(show) {
        const root = document.getElementById('quranSkeletonList');
        if (!root) return;
        if (show) {
            root.classList.add('visible');
            root.innerHTML = '<div class="quran-skeleton-item"></div><div class="quran-skeleton-item"></div><div class="quran-skeleton-item"></div>';
        } else {
            root.classList.remove('visible');
            root.innerHTML = '';
        }
    }

    async function fetchSurahBundle(surahNumber, forceRefresh = false) {
        if (!forceRefresh) {
            const cached = getCachedSurahData(surahNumber);
            if (cached?.data?.ayahs?.length) return cached.data;
        }

        if (!quranState.pashtoZakariaMap) {
            await loadPashtoZakariaMap();
        }

        const editionList = ['quran-uthmani', 'en.sahih'];
        const response = await fetchWithTimeout(`${QURAN_API_BASE}/surah/${surahNumber}/editions/${editionList.join(',')}`, {}, 15000);
        if (!response.ok) throw new Error('Failed to fetch surah data');
        const json = await response.json();
        const blocks = json?.data || [];
        if (!Array.isArray(blocks) || !blocks.length) throw new Error('Failed to fetch surah data');

        const arabic = blocks.find(b => b.edition?.identifier === 'quran-uthmani') || blocks[0];
        const english = blocks.find(b => b.edition?.identifier === 'en.sahih') || null;
        const pashtoAyahs = getPashtoZakariaAyahTexts(Number(surahNumber), arabic?.ayahs?.length || 0);

        const ayahs = (arabic.ayahs || []).map((ayah, index) => ({
            numberInSurah: ayah.numberInSurah,
            number: ayah.number,
            juz: ayah.juz,
            arabic: ayah.text,
            english: english?.ayahs?.[index]?.text || '',
            pashto: pashtoAyahs[index] || ''
        }));

        const data = {
            surahNumber,
            name: arabic.name,
            englishName: arabic.englishName,
            englishNameTranslation: arabic.englishNameTranslation,
            revelationType: arabic.revelationType,
            numberOfAyahs: arabic.numberOfAyahs,
            ayahs
        };

        saveCachedSurahData(surahNumber, data);
        return data;
    }

    function renderQuranReaderHeader(data) {
        const header = document.getElementById('quranReaderHeader');
        if (!header || !data) return;
        const ui = getQuranUiText();
        const rev = getRevelationMeta(data.revelationType);
        const showBismillah = Number(data.surahNumber) !== 9;
        const isOffline = getOfflineSurahs().map(Number).includes(Number(data.surahNumber));

        header.innerHTML = `
            <div class="quran-surah-frame mushaf-surah-head">
                <div class="mushaf-surah-ar">${escapeHtml(cleanSurahArabicName(data.name))}</div>
                <div class="mushaf-surah-meta">${escapeHtml(data.englishName)} • ${localizeQuranNumber(data.numberOfAyahs)} ${ui.ayahs}</div>
                <div class="mushaf-surah-meta mushaf-surah-meta-rev">
                    <span class="quran-revelation-text ${rev.tone === 'makki' ? 'is-makki' : 'is-madani'}">${rev.label}</span>
                </div>
            </div>
            <button class="quran-row-btn quran-reader-download-btn" type="button" onclick="downloadQuranSurahOffline(${Number(data.surahNumber)})" title="${ui.downloadOffline}" aria-label="${ui.downloadOffline}">${isOffline ? '✓' : '↓'}</button>
            ${showBismillah ? `
                <div class="mushaf-bismillah-wrap">
                    <div class="mushaf-ornament" aria-hidden="true"></div>
                    <div class="mushaf-bismillah">${ui.bismillah}</div>
                    <div class="mushaf-ornament" aria-hidden="true"></div>
                </div>
            ` : ''}
        `;

        requestAnimationFrame(() => syncQuranReaderStickyOffsets());
    }

    function syncQuranReaderStickyOffsets() {
        const reader = document.getElementById('quranReaderScreen');
        const list = document.getElementById('quranAyahList');
        if (!reader || !list) return;
        reader.style.setProperty('--quran-reader-offset', '28px');
    }

    function scheduleQuranReaderControlsHide(delayMs = 3000) {
        const reader = document.getElementById('quranReaderScreen');
        if (!reader || !reader.classList.contains('active')) return;

        if (quranReaderControlsTimer) {
            clearTimeout(quranReaderControlsTimer);
            quranReaderControlsTimer = null;
        }

        quranReaderControlsTimer = setTimeout(() => {
            const activeReader = document.getElementById('quranReaderScreen');
            if (!activeReader || !activeReader.classList.contains('active')) return;
            activeReader.classList.add('controls-hidden');
        }, Math.max(600, Number(delayMs) || 3000));
    }

    function showQuranReaderControls() {
        const reader = document.getElementById('quranReaderScreen');
        if (!reader || !reader.classList.contains('active')) return;
        reader.classList.remove('controls-hidden');
        scheduleQuranReaderControlsHide(3000);
    }

    function clearQuranReaderControlsHide() {
        if (quranReaderControlsTimer) {
            clearTimeout(quranReaderControlsTimer);
            quranReaderControlsTimer = null;
        }
        const reader = document.getElementById('quranReaderScreen');
        if (reader) reader.classList.remove('controls-hidden');
    }

    function isQuranAudioSessionActive() {
        return quranState.playerState === 'playing'
            || quranState.playerState === 'paused'
            || quranState.playerState === 'loading';
    }

    function getQuranCurrentAyahLabel() {
        if (quranState.isPashtoTranslationActive && quranState.pashtoTranslationSurah) {
            return isPashtoMode()
                ? `پښتو ژباړه · سورت ${localizeQuranNumber(quranState.pashtoTranslationSurah)}`
                : `Pashto Translation · Surah ${localizeQuranNumber(quranState.pashtoTranslationSurah)}`;
        }

        const key = quranState.audioAyah
            || (quranState.lastPlayedSurah && quranState.lastPlayedAyah ? `${quranState.lastPlayedSurah}:${quranState.lastPlayedAyah}` : null);
        if (!key) return isPashtoMode() ? 'آیت ۰/۰' : 'Ayah 0/0';
        const [surahNo, ayahNo] = key.split(':').map(Number);
        const total = (Number(quranState.currentSurah) === Number(surahNo) && quranState.currentSurahData?.ayahs?.length)
            ? quranState.currentSurahData.ayahs.length
            : (quranState.currentSurahData?.ayahs?.length || 0);
        return isPashtoMode()
            ? `آیت ${localizeQuranNumber(ayahNo)}/${localizeQuranNumber(total)}`
            : `Ayah ${localizeQuranNumber(ayahNo)}/${localizeQuranNumber(total)}`;
    }

    function closeQuranAudioPopup() {
        const popup = document.getElementById('quran-dot-popup');
        if (!popup) return;
        popup.style.display = 'none';
        popup.setAttribute('aria-hidden', 'true');
    }

    function openQuranAudioPopup() {
        if (!isQuranAudioSessionActive()) return;
        const popup = document.getElementById('quran-dot-popup');
        if (!popup) return;
        popup.style.display = 'block';
        popup.setAttribute('aria-hidden', 'false');
    }

    function toggleQuranAudioPopup() {
        const popup = document.getElementById('quran-dot-popup');
        if (!popup) return;
        if (popup.style.display === 'block') closeQuranAudioPopup();
        else openQuranAudioPopup();
    }

    function clearQuranAudioDotHoldTimer() {
        if (quranDotLongPressTimer) {
            clearTimeout(quranDotLongPressTimer);
            quranDotLongPressTimer = null;
        }
    }

    function updateQuranFloatingAudioUi() {
        const dot = document.getElementById('quran-floating-dot');
        const dotIcon = dot ? dot.querySelector('.dot-icon') : null;
        const label = document.getElementById('dot-ayah-info');
        const playPauseBtn = document.getElementById('quranPlayPauseBtn');
        const progressFill = document.getElementById('quranPlaybackProgressFill');
        const progressLabel = document.getElementById('quranPlaybackProgressLabel');
        if (label) label.textContent = getQuranCurrentAyahLabel();

        const active = isQuranAudioSessionActive() && !!(quranState.audioAyah || (quranState.lastPlayedSurah && quranState.lastPlayedAyah));
        const visualPlaying = quranState.playerState === 'playing' || quranState.playerState === 'loading';
        if (dot) {
            dot.classList.toggle('visible', active);
            dot.classList.toggle('playing', visualPlaying);
            dot.style.display = active ? 'flex' : 'none';
            if (dotIcon) dotIcon.textContent = visualPlaying ? '⏸' : '▶';
        }

        if (playPauseBtn) {
            const buttonLabel = visualPlaying
                ? (isPashtoMode() ? 'تم' : 'Pause')
                : (isPashtoMode() ? 'پلې' : 'Play');
            playPauseBtn.textContent = visualPlaying ? '⏸' : '▶';
            playPauseBtn.setAttribute('aria-label', buttonLabel);
            playPauseBtn.setAttribute('title', buttonLabel);
        }

        if (quranState.isPashtoTranslationActive && quranState.pashtoTranslationSurah) {
            if (progressFill) progressFill.style.width = quranState.playerState === 'hidden' ? '0%' : '100%';
            if (progressLabel) progressLabel.textContent = getQuranUiText().pashtoAudioStatus;
        } else {
            const currentAyah = quranState.audioAyah ? Number(quranState.audioAyah.split(':')[1]) : Number(quranState.lastPlayedAyah || 0);
            const totalAyahs = Number(quranState.currentSurahData?.ayahs?.length || 0);
            const percent = totalAyahs > 0 ? Math.max(0, Math.min(100, (currentAyah / totalAyahs) * 100)) : 0;
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressLabel) {
                progressLabel.textContent = isPashtoMode()
                    ? `آیت ${localizeQuranNumber(currentAyah)}/${localizeQuranNumber(totalAyahs)}`
                    : `Ayah ${localizeQuranNumber(currentAyah)}/${localizeQuranNumber(totalAyahs)}`;
            }
        }

        if (!active) closeQuranAudioPopup();
    }

    function markQuranControlsInteraction() {
        showQuranReaderControls();
        updateQuranFloatingAudioUi();
    }

    function stopPashtoTranslationSafe() {
        if (typeof window.stopPashtoTranslation !== 'function') return;
        try {
            window.stopPashtoTranslation();
        } catch (error) {}
    }

    function stopActivePashtoTranslationSession() {
        stopPashtoTranslationSafe();
        if (quranState.audio) {
            try {
                quranState.audio.pause();
                quranState.audio.currentTime = 0;
                quranState.audio.muted = false;
                quranState.audio.volume = 1;
            } catch (error) {}
        }
        quranState.isContinuousSurahPlayback = false;
        quranState.isPashtoTranslationActive = false;
        quranState.pashtoTranslationSurah = null;
        setQuranPlayerState('hidden');
        setQuranPlayButtonLoading(false);
        updateQuranFloatingAudioUi();
        highlightPlayingAyah();
    }

    function ensureQuranTranslationAudio() {
        if (!quranState.translationAudio) {
            quranState.translationAudio = new Audio();
            quranState.translationAudio.preload = 'auto';
            quranState.translationAudio.setAttribute('playsinline', '');
            quranState.translationAudio.setAttribute('webkit-playsinline', '');
            quranState.translationAudio.addEventListener('error', () => {
                console.warn('[QuranAudio] translation audio error');
            });
        }
        return quranState.translationAudio;
    }

    function stopTranslationOverlayAudio() {
        quranState.translationQueueToken += 1;
        quranState.translationOverlayMode = null;

        if (quranState.translationAudio) {
            try {
                quranState.translationAudio.pause();
                quranState.translationAudio.currentTime = 0;
                quranState.translationAudio.src = '';
            } catch (error) {}
        }
    }

    function pauseTranslationOverlayAudio() {
        if (!quranState.translationAudio) return;
        try { quranState.translationAudio.pause(); } catch (error) {}
    }

    async function resumeTranslationOverlayAudio() {
        if (!quranState.translationAudio || !quranState.translationAudio.src) return;
        try { await quranState.translationAudio.play(); } catch (error) {}
    }

    async function getPashtoTranslationAyahAudioUrl(surahNumber, ayahNumber) {
        const key = `${Number(surahNumber)}:${Number(ayahNumber)}`;
        if (PASHTO_AYAH_AUDIO_CACHE.has(key)) return PASHTO_AYAH_AUDIO_CACHE.get(key);

        try {
            const edition = getQuranSettings().pashtoEdition || 'ps.abdulwali';
            const response = await fetchWithTimeout(`${QURAN_API_BASE}/ayah/${Number(surahNumber)}:${Number(ayahNumber)}/${edition}`, {}, 12000);
            if (!response.ok) throw new Error('Failed to fetch Pashto ayah audio');
            const json = await response.json();
            const secondary = Array.isArray(json?.data?.audioSecondary) ? json.data.audioSecondary : [];
            const url = json?.data?.audio || secondary[0] || null;
            PASHTO_AYAH_AUDIO_CACHE.set(key, url);
            return url;
        } catch (error) {
            PASHTO_AYAH_AUDIO_CACHE.set(key, null);
            return null;
        }
    }

    async function getPashtoAyahSegmentPlayback(surahNumber, ayahNumber) {
        const surah = Number(surahNumber);
        const ayah = Number(ayahNumber);
        if (!Number.isFinite(surah) || !Number.isFinite(ayah) || ayah < 1) return null;
        if (typeof window.playPashtoTranslationSegment !== 'function') return null;

        let available = hasPashtoSurahAudio(surah);
        if (!available) available = await resolvePashtoSurahAudioAvailability(surah);
        if (!available) return null;

        const profile = getContinuousSurahTimingProfile('pashto');
        if (!profile?.totalWeight || !Array.isArray(profile.cumulativeWeights) || !profile.cumulativeWeights.length) {
            return null;
        }

        const index = Math.min(profile.cumulativeWeights.length - 1, Math.max(0, ayah - 1));
        const previousEndWeight = index > 0 ? Number(profile.cumulativeWeights[index - 1]?.endWeight || 0) : 0;
        const currentEndWeight = Number(profile.cumulativeWeights[index]?.endWeight || previousEndWeight);
        const startRatio = previousEndWeight / profile.totalWeight;
        const endRatio = currentEndWeight / profile.totalWeight;

        if (!Number.isFinite(endRatio) || endRatio <= startRatio) return null;

        return {
            startRatio: Math.max(0, startRatio),
            endRatio: Math.min(1, endRatio)
        };
    }

    async function playTranslationAfterAyah(surahNumber, ayahNumber, mode, token) {
        if (token !== quranState.translationQueueToken) return false;
        const audio = ensureQuranTranslationAudio();

        if (mode === 'ar-en') {
            const url = await getEnglishTranslationAyahAudioUrl(surahNumber, ayahNumber);
            if (!url) return false;
            return playOverlaySegment(audio, url, token);
        }

        if (mode === 'ar-ps') {
            const segment = await getPashtoAyahSegmentPlayback(surahNumber, ayahNumber);
            if (segment) {
                try {
                    quranState.isPashtoAyahSegmentPlayback = true;
                    quranState.isPashtoTranslationActive = true;
                    quranState.pashtoTranslationSurah = Number(surahNumber);
                    setQuranPlayerState('playing');
                    setQuranPlayButtonLoading(false);
                    updateQuranFloatingAudioUi();
                    await window.playPashtoTranslationSegment(Number(surahNumber), {
                        startRatio: segment.startRatio,
                        endRatio: segment.endRatio
                    });
                    return token === quranState.translationQueueToken;
                } catch (error) {
                    console.warn('[QuranAudio] Pashto segment playback failed', {
                        surahNumber: Number(surahNumber),
                        ayahNumber: Number(ayahNumber),
                        error: error?.message || error
                    });
                } finally {
                    quranState.isPashtoAyahSegmentPlayback = false;
                    quranState.isPashtoTranslationActive = false;
                    quranState.pashtoTranslationSurah = null;
                    updateQuranFloatingAudioUi();
                }
            }

            const url = await getPashtoTranslationAyahAudioUrl(surahNumber, ayahNumber);
            if (url) return playOverlaySegment(audio, url, token);
    quranState.isPashtoAyahSegmentPlayback = false;
            return false;
        }

        return false;
    }

    async function getEnglishTranslationAyahAudioUrl(surahNumber, ayahNumber) {
        const key = `${Number(surahNumber)}:${Number(ayahNumber)}`;
        if (ENGLISH_AUDIO_CACHE.has(key)) return ENGLISH_AUDIO_CACHE.get(key);

        try {
            const response = await fetchWithTimeout(`${QURAN_API_BASE}/ayah/${Number(surahNumber)}:${Number(ayahNumber)}/en.walk`, {}, 12000);
            if (!response.ok) throw new Error('Failed to fetch English ayah audio');
            const json = await response.json();
            const secondary = Array.isArray(json?.data?.audioSecondary) ? json.data.audioSecondary : [];
            const url = json?.data?.audio || secondary[0] || null;
            ENGLISH_AUDIO_CACHE.set(key, url);
            return url;
        } catch (error) {
            ENGLISH_AUDIO_CACHE.set(key, null);
            return null;
        }
    }

    function playOverlaySegment(audio, url, token, { startTime = 0, endTime = null } = {}) {
        return new Promise((resolve) => {
            if (!url || token !== quranState.translationQueueToken) {
                resolve(false);
                return;
            }

            let settled = false;
            const cleanup = () => {
                audio.removeEventListener('loadedmetadata', onReadyToSeek);
                audio.removeEventListener('canplay', onReadyToSeek);
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                audio.removeEventListener('timeupdate', onTimeUpdate);
            };
            const onEnded = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(true);
            };
            const onError = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(false);
            };
            const onTimeUpdate = () => {
                if (!Number.isFinite(endTime) || endTime == null) return;
                if (audio.currentTime + 0.05 < endTime) return;
                try { audio.pause(); } catch (error) {}
                onEnded();
            };
            const onReadyToSeek = () => {
                if (!Number.isFinite(startTime) || startTime <= 0) return;
                try { audio.currentTime = startTime; } catch (error) {}
            };

            audio.addEventListener('loadedmetadata', onReadyToSeek, { once: true });
            audio.addEventListener('canplay', onReadyToSeek, { once: true });
            audio.addEventListener('ended', onEnded, { once: true });
            audio.addEventListener('error', onError, { once: true });
            if (Number.isFinite(endTime) && endTime != null) {
                audio.addEventListener('timeupdate', onTimeUpdate);
            }

            const shouldReload = (audio.currentSrc || audio.src || '') !== url;
            if (shouldReload) {
                audio.src = url;
                audio.load();
            }

            if (!shouldReload) {
                if (Number.isFinite(startTime) && startTime > 0) {
                    try { audio.currentTime = startTime; } catch (error) {}
                } else {
                    audio.currentTime = 0;
                }
            }

            audio.play().catch(() => {
                onError();
            });
        });
    }

    async function startEnglishOverlayQueue(surahNumber) {
        const audio = ensureQuranTranslationAudio();
        quranState.translationOverlayMode = 'ar-en';
        const token = quranState.translationQueueToken;
        const total = quranState.currentSurahData?.ayahs?.length || 0;
        if (!total) return false;

        for (let ayah = 1; ayah <= total; ayah += 1) {
            if (token !== quranState.translationQueueToken) return false;
            const url = await getEnglishTranslationAyahAudioUrl(surahNumber, ayah);
            if (!url) continue;
            const ok = await playOverlaySegment(audio, url, token);
            if (!ok && token === quranState.translationQueueToken) break;
        }

        if (token === quranState.translationQueueToken) {
            quranState.translationOverlayMode = null;
        }
        return true;
    }

    async function startPashtoOverlayStream(surahNumber) {
        if (typeof window.getPashtoTranslationUrl !== 'function') return false;

        try {
            const url = await window.getPashtoTranslationUrl(Number(surahNumber));
            if (!url) return false;
            const audio = ensureQuranTranslationAudio();
            quranState.translationOverlayMode = 'ar-ps';
            audio.src = url;
            audio.currentTime = 0;
            await audio.play();
            return true;
        } catch (error) {
            console.warn('[QuranAudio] Pashto overlay unavailable', error?.message || error);
            return false;
        }
    }

    function startTranslationOverlayForFlowMode(surahNumber) {
        const mode = quranState.activeFlowMode || 'ar';
        stopTranslationOverlayAudio();
        quranState.translationQueueToken += 1;

        if (mode === 'ar-en' || mode === 'ar-ps') {
            quranState.translationOverlayMode = mode;
        }
    }

    function canAutoPlayPashtoTranslationForSurah(surahNumber, startedFromFirstAyah) {
        const surah = Number(surahNumber);
        if (!startedFromFirstAyah) return false;
        if (!hasPashtoSurahAudio(surah)) return false;
        if (typeof window.playPashtoTranslation !== 'function') return false;
        if ((quranState.activeFlowMode || 'ar') === 'ar-ps') return true;
        if (quranState.forcePashtoAfterCurrentFlow) return true;
        return !!getQuranSettings().autoPashtoAfterArabic;
    }

    async function playPashtoTranslationForCompletedSurah(surahNumber, startedFromFirstAyah) {
        const surah = Number(surahNumber);
        if (!startedFromFirstAyah) return false;
        if (typeof window.playPashtoTranslation !== 'function') return false;

        let available = hasPashtoSurahAudio(surah);
        if (!available) {
            available = await resolvePashtoSurahAudioAvailability(surah);
        }
        if (!available) return false;

        if ((quranState.activeFlowMode || 'ar') !== 'ar-ps' && !quranState.forcePashtoAfterCurrentFlow && !getQuranSettings().autoPashtoAfterArabic) {
            return false;
        }

        stopTranslationOverlayAudio();
        stopPashtoTranslationSafe();
        quranState.isTransitioningToPashto = true;

        quranState.isPashtoTranslationActive = true;
        quranState.pashtoTranslationSurah = surah;
        quranState.audioAyah = `${surah}:1`;
        quranState.lastPlayedSurah = surah;
        quranState.lastPlayedAyah = 1;
        setQuranPlayerState('loading');
        setQuranPlayButtonLoading(true);
        highlightPlayingAyah();

        try {
            void warmPashtoSurahAudio(surah, { waitTimeoutMs: 0 });

            setQuranPlayerState('playing');
            setQuranPlayButtonLoading(false);
            await window.playPashtoTranslation(surah);
            return true;
        } catch (error) {
            if (error?.message === 'Playback stopped') return true;
            console.warn('[QuranAudio] Pashto translation playback failed', { surahNumber: surah, error: error?.message || error });
            showToast(isPashtoMode() ? 'د پښتو ژباړې غږول ناکام شول' : 'Pashto translation playback failed');
            return false;
        } finally {
            quranState.isTransitioningToPashto = false;
            quranState.isPashtoTranslationActive = false;
            quranState.pashtoTranslationSurah = null;
            setQuranPlayButtonLoading(false);
            updateQuranFloatingAudioUi();
        }
    }

    function ensureQuranPrimaryAudio() {
        if (quranState.audio) return quranState.audio;

        quranState.audio = new Audio();
        quranState.audio.preload = 'auto';
        quranState.audio.setAttribute('playsinline', '');
        quranState.audio.setAttribute('webkit-playsinline', '');
        quranState.audio.addEventListener('timeupdate', () => {
            if (quranState.isContinuousSurahPlayback && quranState.currentSurahData?.ayahs?.length && quranState.audio?.duration) {
                syncContinuousSurahAyahFromProgress(quranState.audio.currentTime, quranState.audio.duration, quranState.currentSurah);
            }
            updateQuranFloatingAudioUi();
        });
        quranState.audio.addEventListener('waiting', () => {
            if (quranState.playerState === 'playing' || quranState.isChainedPlayback) setQuranPlayerState('loading');
            setQuranPlayButtonLoading(true);
            scheduleQuranAudioRecovery('waiting');
        });
        quranState.audio.addEventListener('stalled', () => {
            if (quranState.playerState === 'playing' || quranState.isChainedPlayback) setQuranPlayerState('loading');
            setQuranPlayButtonLoading(true);
            scheduleQuranAudioRecovery('stalled');
        });
        quranState.audio.addEventListener('canplay', () => {
            clearQuranAudioRecovery();
            setQuranPlayButtonLoading(false);
            if (!quranState.audio.paused && quranState.playerState !== 'paused') setQuranPlayerState('playing');
        });
        quranState.audio.addEventListener('playing', () => {
            clearQuranAudioRecovery();
            quranState.isChainedPlayback = false;
            setQuranPlayerState('playing');
            setQuranPlayButtonLoading(false);
            updateQuranMediaSession();
        });
        quranState.audio.addEventListener('ended', async () => {
            clearQuranAudioRecovery();
            if ((quranState.activeFlowMode || 'ar') === 'ps' && quranState.isPashtoTranslationActive) {
                quranState.isContinuousSurahPlayback = false;
                return;
            }
            if (!quranState.audioAyah) return;
            const [sNo, aNo] = quranState.audioAyah.split(':').map(Number);
            const mode = quranState.activeFlowMode || 'ar';
            const totalAyahs = quranState.currentSurahData?.ayahs?.length || 0;

            if (quranState.isContinuousSurahPlayback) {
                const surahNo = Number(sNo || quranState.lastPlayedSurah || quranState.currentSurah || 1);
                const startedFromFirstAyah = Number(quranState.audioSessionStartAyah || 1) === 1;
                if (quranState.activeFlowMode === 'ar') {
                    await playPashtoTranslationForCompletedSurah(surahNo, startedFromFirstAyah);
                }
                stopQuranAudio({ resetTime: true, surahCompleted: true });
            } else if (mode === 'ar-en' || mode === 'ar-ps') {
                quranState.translationQueueToken += 1;
                const token = quranState.translationQueueToken;
                const translationPlayed = await playTranslationAfterAyah(sNo, aNo, mode, token);

                if (quranState.audioAyah !== `${sNo}:${aNo}` || mode !== (quranState.activeFlowMode || 'ar')) {
                    return;
                }

                if (mode === 'ar-ps' && !translationPlayed) {
                    showToast(isPashtoMode() ? 'د دې آیت لپاره پښتو غږیزه ژباړه ونه غږېده' : 'Pashto audio translation could not be played for this ayah');
                    stopQuranAudio({ resetTime: false, explicitStop: true });
                    return;
                }

                if (aNo < totalAyahs) {
                    quranState.isChainedPlayback = true;
                    setQuranPlayerState('loading');
                    setQuranPlayButtonLoading(true);
                    playQuranAyahInternal(sNo, aNo + 1, 0, true);
                } else {
                    stopQuranAudio({ resetTime: true, surahCompleted: true });
                }
            } else if (quranState.currentSurahData && aNo < quranState.currentSurahData.ayahs.length) {
                quranState.isChainedPlayback = true;
                setQuranPlayerState('loading');
                setQuranPlayButtonLoading(true);
                playQuranAyahInternal(sNo, aNo + 1);
            } else {
                const startedFromFirstAyah = Number(quranState.audioSessionStartAyah || 1) === 1;
                await playPashtoTranslationForCompletedSurah(sNo, startedFromFirstAyah);
                stopQuranAudio({ resetTime: true, surahCompleted: true });
            }
        });
        quranState.audio.addEventListener('error', () => {
            clearQuranAudioRecovery();
            if ((quranState.activeFlowMode || 'ar') === 'ps' && quranState.isPashtoTranslationActive) {
                return;
            }
            if (quranState.audioSwitchingSource) return;
            quranState.isChainedPlayback = false;
            if (!quranState.audioAyah) {
                stopQuranAudio({ resetTime: true, explicitStop: true });
                return;
            }

            showToast('Audio playback failed');
            stopQuranAudio({ resetTime: true, explicitStop: true });
        });
        quranState.audio.addEventListener('pause', () => {
            updateQuranMediaSession();
            if (quranState.audioSwitchingSource || quranState.audioPausedManually || quranState.playerState === 'hidden' || quranState.isPashtoTranslationActive || quranState.isTransitioningToPashto) {
                clearQuranAudioRecovery();
                return;
            }
            const audio = quranState.audio;
            if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
                const remaining = audio.duration - audio.currentTime;
                if (remaining <= 0.35) {
                    clearQuranAudioRecovery();
                    return;
                }
            }
            if (!quranState.audioAyah || quranState.audio?.ended) {
                clearQuranAudioRecovery();
                return;
            }
            scheduleQuranAudioRecovery('pause');
        });

        return quranState.audio;
    }

    function countAyahTimingTokens(text) {
        return String(text || '')
            .replace(/[\u0640]/g, '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .length;
    }

    function countAyahTimingChars(text) {
        return String(text || '')
            .replace(/\s+/g, '')
            .replace(/[\u0640\u200c\u200d]/g, '')
            .length;
    }

    function estimateAyahTimingWeight(ayah, profileName) {
        const arabicTokens = countAyahTimingTokens(ayah?.arabic);
        const arabicChars = countAyahTimingChars(ayah?.arabic);
        const arabicWeight = 1.2 + arabicTokens + (arabicChars / 18);

        if (profileName === 'pashto') {
            const pashtoTokens = countAyahTimingTokens(ayah?.pashto);
            const pashtoChars = countAyahTimingChars(ayah?.pashto);
            const pashtoWeight = 1.6 + (pashtoTokens * 1.15) + (pashtoChars / 22);
            return Math.max(1, arabicWeight + pashtoWeight);
        }

        return Math.max(1, arabicWeight);
    }

    function getContinuousSurahTimingProfile(profileName = 'arabic') {
        const data = quranState.currentSurahData;
        if (!data?.ayahs?.length) return null;

        if (!data.__timingProfiles) data.__timingProfiles = {};
        if (data.__timingProfiles[profileName]) return data.__timingProfiles[profileName];

        let totalWeight = 0;
        const cumulativeWeights = data.ayahs.map((ayah, index) => {
            totalWeight += estimateAyahTimingWeight(ayah, profileName);
            return {
                ayahNo: Number(ayah.numberInSurah || index + 1),
                endWeight: totalWeight
            };
        });

        const profile = {
            totalWeight,
            cumulativeWeights
        };

        data.__timingProfiles[profileName] = profile;
        return profile;
    }

    function getAyahKeyFromContinuousSurahProgress(currentTime, duration, surahNumber) {
        if (!quranState.currentSurahData?.ayahs?.length) return null;
        if (!Number.isFinite(duration) || duration <= 0) return null;

        const resolvedSurah = Number(surahNumber || quranState.currentSurah || quranState.lastPlayedSurah || 0);
        if (!resolvedSurah) return null;
        if (Number(quranState.currentSurah || 0) !== resolvedSurah) return null;

        const profileName = quranState.isPashtoTranslationActive ? 'pashto' : 'arabic';
        const profile = getContinuousSurahTimingProfile(profileName);
        if (!profile?.totalWeight || !Array.isArray(profile.cumulativeWeights) || !profile.cumulativeWeights.length) {
            return null;
        }

        const progress = Math.max(0, Math.min(1, Number(currentTime || 0) / duration));
        const targetWeight = progress * profile.totalWeight;
        const active = profile.cumulativeWeights.find((entry) => targetWeight <= entry.endWeight) || profile.cumulativeWeights[profile.cumulativeWeights.length - 1];
        const ayahNo = Number(active?.ayahNo || 1);
        return `${resolvedSurah}:${ayahNo}`;
    }

    async function playPashtoCombinedSurahAudio(surahNumber) {
        const surah = Number(surahNumber);
        if (!Number.isFinite(surah) || surah < 1 || surah > 114) return false;
        if (typeof window.playPashtoTranslation !== 'function') return false;

        let available = hasPashtoSurahAudio(surah);
        if (!available) {
            available = await resolvePashtoSurahAudioAvailability(surah);
        }
        if (!available) {
            setQuranPlayerState('hidden');
            setQuranPlayButtonLoading(false);
            showToast(isPashtoMode() ? 'د دې سورت لپاره د پښتو غږیزه ژباړه نه موندل کېږي' : 'Pashto audio translation is unavailable for this surah');
            return false;
        }

        clearQuranAudioRecovery();
        stopTranslationOverlayAudio();
        stopPashtoTranslationSafe();
        if (quranState.audio) {
            try {
                quranState.audio.pause();
                quranState.audio.currentTime = 0;
                quranState.audio.muted = false;
                quranState.audio.volume = 1;
            } catch (error) {}
        }
        quranState.isPashtoTranslationActive = true;
        quranState.pashtoTranslationSurah = surah;
        quranState.audioAyah = `${surah}:1`;
        quranState.lastPlayedSurah = surah;
        quranState.lastPlayedAyah = 1;
        setQuranPlayerState('loading');
        setQuranPlayButtonLoading(true);
        highlightPlayingAyah();

        try {
            void warmPashtoSurahAudio(surah, { waitTimeoutMs: 0 });
            setQuranPlayerState('playing');
            setQuranPlayButtonLoading(false);
            await window.playPashtoTranslation(surah);
            return true;
        } catch (error) {
            if (error?.message === 'Playback stopped') return true;
            console.warn('[QuranAudio] Pashto combined surah playback failed', { surahNumber: surah, error: error?.message || error });
            showToast(isPashtoMode() ? 'د پښتو ژباړې غږول ناکام شول' : 'Pashto translation playback failed');
            return false;
        } finally {
            quranState.isContinuousSurahPlayback = false;
            quranState.isPashtoTranslationActive = false;
            quranState.pashtoTranslationSurah = null;
            setQuranPlayButtonLoading(false);
            setQuranPlayerState('hidden');
            updateQuranFloatingAudioUi();
        }
    }

    function shouldShowTranslationBlock(mode, type) {
        if (mode === 'ar') return false;
        if (type === 'ps') return mode === 'all' || mode === 'ar-ps';
        if (type === 'en') return mode === 'all' || mode === 'ar-en';
        return false;
    }

    function updateFlowModeButtons() {
        updateQuranPanelModeUi();
    }

    function renderQuranAyahChunk(reset = false) {
        if (!quranState.currentSurahData) return;
        const list = document.getElementById('quranAyahList');
        const loadMore = document.getElementById('quranLoadMore');
        if (!list) return;

        if (reset) {
            quranState.renderedAyahs = 0;
            list.innerHTML = '';
        }

        const settings = getQuranSettings();
        const mode = getTranslationModeEffective();
        const ui = getQuranUiText();
        const allAyahs = quranState.currentSurahData.ayahs;
        const nextEnd = Math.min(quranState.renderedAyahs + quranState.chunkSize, allAyahs.length);
        const chunk = allAyahs.slice(quranState.renderedAyahs, nextEnd);

        list.insertAdjacentHTML('beforeend', chunk.map((ayah) => {
            const cardKey = `${quranState.currentSurah}:${ayah.numberInSurah}`;
            const playing = quranState.audioAyah === cardKey;
            const bookmarked = getQuranBookmarks().some(item => Number(item.surahNumber) === Number(quranState.currentSurah) && Number(item.ayahNumber) === Number(ayah.numberInSurah));
            return `
                <div class="quran-ayah-card ${playing ? 'playing' : ''}" data-ayah-no="${ayah.numberInSurah}" aria-current="${playing ? 'true' : 'false'}" id="quranAyah-${cardKey}">
                    <div class="quran-ayah-head">
                        <span class="quran-ayah-num">﴾${localizeQuranNumber(ayah.numberInSurah)}﴿</span>
                    </div>
                    <div class="quran-ayah-ar">${escapeHtml(ayah.arabic)}</div>
                    ${shouldShowTranslationBlock(mode, 'ps') ? `<div class="quran-ayah-ps">${escapeHtml(ayah.pashto || '')}</div>` : ''}
                    ${shouldShowTranslationBlock(mode, 'en') ? `<div class="quran-ayah-en">${escapeHtml(ayah.english || '')}</div>` : ''}
                    <div class="quran-ayah-actions">
                        <button type="button" class="quran-ayah-btn" data-ayah-action="play" data-surah="${quranState.currentSurah}" data-ayah="${ayah.numberInSurah}" aria-label="Play ayah">${playing ? '⏸' : '▶'}</button>
                        <button type="button" class="quran-ayah-btn" data-ayah-action="bookmark" data-surah="${quranState.currentSurah}" data-ayah="${ayah.numberInSurah}" aria-label="Bookmark ayah">${bookmarked ? '★' : '☆'}</button>
                    </div>
                </div>
            `;
        }).join(''));

        quranState.renderedAyahs = nextEnd;
        if (loadMore) loadMore.classList.toggle('visible', quranState.renderedAyahs < allAyahs.length);
    }

    function updateQuranReaderProgress() {
        const panel = document.querySelector('.quran-panel');
        const reader = document.getElementById('quranReaderScreen');
        if (!panel || !reader || !reader.classList.contains('active') || !quranState.currentSurahData) return;

        const cards = Array.from(document.querySelectorAll('#quranAyahList .quran-ayah-card'));
        if (!cards.length) return;

        const anchorY = 150;
        let activeCard = cards[cards.length - 1];
        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            if (rect.top >= anchorY) {
                activeCard = card;
                break;
            }
        }

        const ayahNo = Number(activeCard.getAttribute('data-ayah-no') || 1);
        const total = quranState.currentSurahData.numberOfAyahs || quranState.currentSurahData.ayahs.length || 1;
        const percent = Math.max(0, Math.min(100, (ayahNo / total) * 100));
        const fill = document.getElementById('quranTopProgressFill');
        if (fill) fill.style.width = `${percent}%`;

        setQuranLastRead({ surahNumber: quranState.currentSurah, ayahNumber: ayahNo });
        renderQuranContinueCard();

        if (quranState.renderedAyahs < quranState.currentSurahData.ayahs.length) {
            const nearBottom = panel.scrollTop + panel.clientHeight > panel.scrollHeight - 260;
            if (nearBottom) renderQuranAyahChunk(false);
        }
    }

    function refreshQuranTranslationModeButtons() {
        updateQuranPanelModeUi();
    }

    async function openQuranSurah(surahNumber, ayahNumber = 1) {
        const reader = document.getElementById('quranReaderScreen');
        const activeList = getQuranListContainerByView(quranState.view) || document.getElementById('quranSurahList');
        const loadMore = document.getElementById('quranLoadMore');
        if (!reader || !activeList) return;

        closeQuranSurahDropdown();

        quranState.currentSurah = Number(surahNumber);
        quranState.loadingReader = true;
        showQuranSkeleton(true);
        activeList.style.display = 'none';
        reader.classList.add('active');
        if (loadMore) loadMore.classList.remove('visible');
        if (!isQuranAudioSessionActive() && normalizeQuranPanelMode(quranState.panelMode) === 'pashto' && Number(ayahNumber || 1) === 1) {
            void warmPashtoSurahAudio(quranState.currentSurah);
        }

        try {
            const data = await fetchSurahBundle(quranState.currentSurah);
            quranState.currentSurahData = data;
            renderQuranReaderHeader(data);
            renderQuranAyahChunk(true);
            refreshQuranTranslationModeButtons();

            const targetAyahNumber = Number(ayahNumber) || 1;

            const targetCard = document.getElementById(`quranAyah-${quranState.currentSurah}:${targetAyahNumber}`);
            if (!targetCard && targetAyahNumber > quranState.renderedAyahs) {
                while (quranState.renderedAyahs < targetAyahNumber && quranState.renderedAyahs < data.ayahs.length) {
                    renderQuranAyahChunk(false);
                }
            }
            const finalCard = document.getElementById(`quranAyah-${quranState.currentSurah}:${targetAyahNumber}`);
            if (finalCard) finalCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

            setQuranLastRead({ surahNumber: quranState.currentSurah, ayahNumber: Number(ayahNumber) || 1 });

            pushQuranRecent({ surahNumber: quranState.currentSurah, ayahNumber, surahLabel: isPashtoMode() ? cleanSurahArabicName(data.name) : data.englishName });
            markSurahOffline(quranState.currentSurah);
            renderQuranContinueCard();
            renderQuranRecentSection();
            syncQuranReaderStickyOffsets();
            updateQuranReaderProgress();
            void refreshQuranPashtoAudioAvailability();
            updateQuranPashtoAudioBanner();
            updateQuranFloatingAudioUi();
            showQuranReaderControls();
            recordInAppRoute(true, {
                view: IN_APP_VIEWS.SURAH_READER,
                surah: Number(quranState.currentSurah),
                ayah: Number(ayahNumber) || 1
            });
        } catch (error) {
            showToast(getQuranUiText().noData);
            reader.classList.remove('active');
            activeList.style.display = '';
        } finally {
            quranState.loadingReader = false;
            showQuranSkeleton(false);
        }
    }

    window.resumeQuranReading = function() {
        const last = getQuranLastRead();
        if (!last?.surahNumber) return;
        openQuranSurah(last.surahNumber, last.ayahNumber || 1);
    };

    function updateQuranMiniPlayerLabel() {
        updateQuranFloatingAudioUi();
    }

    function formatQuranTime(value) {
        const seconds = Math.max(0, Math.floor(Number(value) || 0));
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    function updateQuranMiniTime() {
        return;
    }

    function updateQuranPlayPauseIcon() {
        updateQuranFloatingAudioUi();
    }

    function setQuranPlayerState(nextState) {
        quranState.playerState = nextState;
        updateQuranPlayPauseIcon();
        highlightPlayingAyah();
        updateQuranMiniPlayerVisibility();
    }

    function updateQuranMiniPlayerVisibility() {
        updateQuranFloatingAudioUi();
        syncQuranReaderStickyOffsets();
    }

    function clearQuranAudioRecovery() {
        if (quranAudioRecoveryTimer) {
            clearTimeout(quranAudioRecoveryTimer);
            quranAudioRecoveryTimer = null;
        }
    }

    function scheduleQuranAudioRecovery(reason = 'buffering') {
        clearQuranAudioRecovery();

        if (!quranState.audioAyah || quranState.audioPausedManually || quranState.audioSwitchingSource || quranState.isPashtoTranslationActive || quranState.isTransitioningToPashto) {
            return;
        }

        quranAudioRecoveryTimer = setTimeout(() => {
            quranAudioRecoveryTimer = null;

            const audio = quranState.audio;
            if (!audio || !quranState.audioAyah || quranState.audioPausedManually || quranState.audioSwitchingSource || quranState.isPashtoTranslationActive || quranState.isTransitioningToPashto) {
                return;
            }

            if (audio.ended) return;

            setQuranPlayerState('loading');
            setQuranPlayButtonLoading(true);
            audio.play()
                .then(() => {
                    setQuranPlayButtonLoading(false);
                    setQuranPlayerState('playing');
                })
                .catch((error) => {
                    console.warn('[QuranAudio] recovery failed', { reason, error: error?.message || error });
                    setQuranPlayButtonLoading(false);
                    if (quranState.playerState === 'loading') setQuranPlayerState('paused');
                });
        }, 4000);
    }

    function cycleQuranSpeed() {
        const button = document.getElementById('quranSpeedCycle');
        const currentIndex = QURAN_AUDIO_SPEEDS.indexOf(Number(quranState.audioRate || 1));
        const next = QURAN_AUDIO_SPEEDS[(currentIndex + 1 + QURAN_AUDIO_SPEEDS.length) % QURAN_AUDIO_SPEEDS.length];
        quranState.audioRate = next;
        if (quranState.audio) quranState.audio.playbackRate = next;
        if (button) button.textContent = `${next}x`;
    }

    const quranTapLocks = new Map();

    function bindFastTap(element, key, handler) {
        if (!element || element.dataset.fastTapBound === '1') return;

        const runHandler = () => {
            const now = Date.now();
            const lockKey = key || element.id || 'fast-tap';
            const last = quranTapLocks.get(lockKey) || 0;
            if (now - last < 220) return;
            quranTapLocks.set(lockKey, now);
            markQuranControlsInteraction();
            handler();
        };

        element.addEventListener('touchstart', (event) => {
            event.preventDefault();
            element.classList.add('pressed');
            setTimeout(() => element.classList.remove('pressed'), 90);
            runHandler();
        }, { passive: false });

        element.addEventListener('click', () => {
            const last = quranTapLocks.get(key || element.id || 'fast-tap') || 0;
            if (Date.now() - last < 320) return;
            runHandler();
        });

        element.dataset.fastTapBound = '1';
    }

    function setQuranPlayButtonLoading(isLoading) {
        if (!isLoading) updateQuranPlayPauseIcon();
    }

    function getCurrentReciterName() {
        const settings = getQuranSettings();
        const id = getCanonicalReciterId(settings.reciter);
        const match = QURAN_RECITERS.find((reciter) => getCanonicalReciterId(reciter.id) === id);
        return match?.name || 'Quran Recitation';
    }

    function updateQuranMediaSession() {
        if (!('mediaSession' in navigator)) return;

        const playbackState = quranState.playerState === 'playing'
            ? 'playing'
            : (quranState.playerState === 'paused' ? 'paused' : 'none');
        navigator.mediaSession.playbackState = playbackState;

        const surah = Number(quranState.currentSurah || quranState.lastPlayedSurah || 0);
        const ayah = Number(quranState.lastPlayedAyah || (quranState.audioAyah ? quranState.audioAyah.split(':')[1] : 0) || 0);
        const data = quranState.currentSurahData;
        const surahLabel = data
            ? (isPashtoMode() ? cleanSurahArabicName(data.name) : data.englishName)
            : (surah ? `Surah ${surah}` : 'Quran');
        const reciterLabel = getCurrentReciterName();

        navigator.mediaSession.metadata = new MediaMetadata({
            title: ayah ? `${surahLabel} - Ayah ${ayah}` : surahLabel,
            artist: reciterLabel,
            album: 'Falah Quran',
            artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
        });

        const safeSet = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (_) {}
        };

        safeSet('play', () => toggleQuranPlayPause());
        safeSet('pause', () => toggleQuranPlayPause());
        safeSet('previoustrack', () => playRelativeAyah(-1));
        safeSet('nexttrack', () => playRelativeAyah(1));
    }

    function stopQuranAudio({ resetTime = true, explicitStop = false, fullyReset = false, surahCompleted = false, navigatedAway = false } = {}) {
        stopPashtoTranslationSafe();
        stopTranslationOverlayAudio();
        clearQuranAudioRecovery();

        if (quranState.audio) {
            quranState.audio.pause();
            if (resetTime) quranState.audio.currentTime = 0;
            quranState.audio.muted = false;
            quranState.audio.volume = 1;
        }

        const currentKey = quranState.audioAyah
            || (quranState.lastPlayedSurah && quranState.lastPlayedAyah ? `${quranState.lastPlayedSurah}:${quranState.lastPlayedAyah}` : null);

        if (currentKey) {
            const [lastSurah, lastAyah] = currentKey.split(':').map(Number);
            if (lastSurah && lastAyah) {
                quranState.lastPlayedSurah = Number(lastSurah);
                quranState.lastPlayedAyah = Number(lastAyah);
                quranState.audioAyah = `${Number(lastSurah)}:${Number(lastAyah)}`;
            }
        }

        quranState.isChainedPlayback = false;
        quranState.audioPausedManually = false;
        quranState.audioFallbackAttempted = false;
        quranState.audioSwitchingSource = false;
        quranState.isContinuousSurahPlayback = false;
        quranState.forcePashtoAfterCurrentFlow = false;
        quranState.activeFlowMode = getFlowModeFromPanelMode(quranState.panelMode);
        quranState.isPashtoTranslationActive = false;
        quranState.isPashtoAyahSegmentPlayback = false;
        quranState.isTransitioningToPashto = false;
        quranState.pashtoTranslationSurah = null;

        const shouldHide = explicitStop || fullyReset || surahCompleted || navigatedAway;
        if (shouldHide) {
            quranState.audioAyah = null;
            quranState.lastPlayedSurah = null;
            quranState.lastPlayedAyah = null;
            setQuranPlayerState('hidden');
        } else {
            setQuranPlayerState('paused');
        }
        closeQuranAudioPopup();

        highlightPlayingAyah();
        updateQuranMiniPlayerLabel();
        updateQuranMiniTime();
        updateFlowModeButtons();
        setQuranPlayButtonLoading(false);
        updateQuranMediaSession();
    }

    async function getAyahGlobalNumber(surahNumber, ayahNumber) {
        const surahStartOffset = getSurahStartOffset(surahNumber);
        if (surahStartOffset) {
            const localAyah = Number(ayahNumber);
            if (localAyah > 0) return surahStartOffset + localAyah - 1;
        }

        const stateData = quranState.currentSurahData;
        if (stateData && Number(quranState.currentSurah) === Number(surahNumber)) {
            const found = stateData.ayahs?.find(a => Number(a.numberInSurah) === Number(ayahNumber));
            if (found?.number) return Number(found.number);
        }

        try {
            const bundle = await fetchSurahBundle(Number(surahNumber));
            const found = bundle?.ayahs?.find(a => Number(a.numberInSurah) === Number(ayahNumber));
            if (found?.number) return Number(found.number);
        } catch (error) {}

        return null;
    }

    function getCanonicalReciterId(reciter) {
        const id = String(reciter || QURAN_FALLBACK_RECITER).trim();
        const canonical = {
            'ar.abdurrahmansudais': 'ar.abdurrahmaansudais',
            'ar.shuraim': 'ar.saoodshuraym'
        };
        return canonical[id] || id;
    }

    function getReciterAliasIds(reciter) {
        const selected = getCanonicalReciterId(reciter);
        const aliases = {
            'ar.alafasy': ['ar.alafasy'],
            'ar.abdulbasitmurattal': ['ar.abdulbasitmurattal', 'ar.abdulsamad'],
            'ar.abdurrahmaansudais': ['ar.abdurrahmaansudais', 'ar.abdurrahmansudais'],
            'ar.husary': ['ar.husary'],
            'ar.saoodshuraym': ['ar.saoodshuraym', 'ar.shuraim']
        };
        return aliases[selected] || [selected];
    }

    function formatSurahAyahCode(surahNumber, ayahNumber) {
        const s = String(Number(surahNumber) || 0).padStart(3, '0');
        const a = String(Number(ayahNumber) || 0).padStart(3, '0');
        return `${s}${a}`;
    }

    function getReciterSourceTemplates(reciter) {
        const canonical = getCanonicalReciterId(reciter);
        const templates = {
            'ar.alafasy': [
                { type: 'cdn', bitrate: 128, reciterId: 'ar.alafasy', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.alafasy', numbering: 'global' }
            ],
            'ar.abdulbasitmurattal': [
                { type: 'cdn', bitrate: 128, reciterId: 'ar.abdulbasitmurattal', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.abdulbasitmurattal', numbering: 'global' },
                { type: 'cdn-surah', bitrate: 128, reciterId: 'ar.abdulbasitmurattal', numbering: 'surahAyah' },
                { type: 'verses', basePath: 'AbdulBaset/Murattal', numbering: 'surahAyah' },
                { type: 'everyayah', basePath: 'Abdul_Basit_Murattal_64kbps', numbering: 'surahAyah' }
            ],
            'ar.abdurrahmaansudais': [
                { type: 'cdn', bitrate: 128, reciterId: 'ar.abdurrahmaansudais', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.abdurrahmaansudais', numbering: 'global' },
                { type: 'cdn', bitrate: 128, reciterId: 'ar.abdurrahmansudais', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.abdurrahmansudais', numbering: 'global' },
                { type: 'everyayah', basePath: 'Abdurrahmaan_As-Sudais_64kbps', numbering: 'surahAyah' }
            ],
            'ar.husary': [
                { type: 'cdn', bitrate: 128, reciterId: 'ar.husary', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.husary', numbering: 'global' }
            ],
            'ar.saoodshuraym': [
                { type: 'cdn', bitrate: 128, reciterId: 'ar.saoodshuraym', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.saoodshuraym', numbering: 'global' },
                { type: 'cdn', bitrate: 128, reciterId: 'ar.shuraim', numbering: 'global' },
                { type: 'cdn', bitrate: 64, reciterId: 'ar.shuraim', numbering: 'global' },
                { type: 'everyayah', basePath: 'Saood_ash-Shuraym_64kbps', numbering: 'surahAyah' }
            ]
        };

        return templates[canonical] || templates[QURAN_FALLBACK_RECITER] || [];
    }

    async function fetchAyahAudioCandidates(surahNumber, ayahNumber, reciter) {
        const globalAyahNo = await getAyahGlobalNumber(surahNumber, ayahNumber);
        const surahAyahCode = formatSurahAyahCode(surahNumber, ayahNumber);
        const templates = getReciterSourceTemplates(reciter);
        const aliasIds = getReciterAliasIds(reciter);
        const candidates = [];

        templates.forEach((entry) => {
            if (entry.numbering === 'global' && !globalAyahNo) return;

            if (entry.type === 'cdn') {
                const id = entry.reciterId || aliasIds[0];
                const ref = entry.numbering === 'global' ? globalAyahNo : surahAyahCode;
                if (id && ref) candidates.push(`https://cdn.islamic.network/quran/audio/${entry.bitrate}/${id}/${ref}.mp3`);
                return;
            }

            if (entry.type === 'cdn-surah') {
                if (entry.reciterId && surahAyahCode) candidates.push(`https://cdn.islamic.network/quran/audio-surah/${entry.bitrate}/${entry.reciterId}/${surahAyahCode}.mp3`);
                return;
            }

            if (entry.type === 'everyayah') {
                if (entry.basePath && surahAyahCode) candidates.push(`https://everyayah.com/data/${entry.basePath}/${surahAyahCode}.mp3`);
                return;
            }

            if (entry.type === 'verses') {
                if (entry.basePath && surahAyahCode) candidates.push(`https://verses.quran.com/${entry.basePath}/mp3/${surahAyahCode}.mp3`);
            }
        });

        return Array.from(new Set(candidates.filter(Boolean)));
    }

    async function fetchAyahAudioApiCandidates(surahNumber, ayahNumber, reciter) {
        const aliasIds = getReciterAliasIds(reciter);
        const candidates = [];
        try {
            for (const reciterId of aliasIds) {
                const response = await fetchWithTimeout(`${QURAN_API_BASE}/ayah/${surahNumber}:${ayahNumber}/${reciterId}`, {}, 12000);
                if (!response.ok) continue;
                const json = await response.json();
                if (json?.data?.audio) candidates.push(json.data.audio);
            }
        } catch (error) {}

        return Array.from(new Set(candidates.filter(Boolean)));
    }

    function fetchSurahAudioCandidates(surahNumber, reciter) {
        const surah = Number(surahNumber);
        if (!Number.isFinite(surah) || surah < 1 || surah > 114) return [];

        const aliasIds = getReciterAliasIds(reciter);
        const fallbackAliasIds = getReciterAliasIds(QURAN_FALLBACK_RECITER);
        const allIds = Array.from(new Set([].concat(aliasIds, fallbackAliasIds).filter(Boolean)));

        const candidates = [];
        allIds.forEach((id) => {
            candidates.push(`https://cdn.islamic.network/quran/audio-surah/128/${id}/${surah}.mp3`);
            candidates.push(`https://cdn.islamic.network/quran/audio-surah/128/${id}/${String(surah).padStart(3, '0')}.mp3`);
        });

        return Array.from(new Set(candidates));
    }

    async function getPlayableAudioSource(audioUrl) {
        if (!audioUrl || !('caches' in window)) return audioUrl;
        try {
            const cache = await caches.open(QURAN_AUDIO_CACHE);
            let match = await cache.match(audioUrl, { ignoreSearch: true });
            if (!match) {
                const response = await fetchWithTimeout(audioUrl, { mode: 'no-cors', cache: 'no-store' }, 12000);
                if (response && (response.ok || response.type === 'opaque')) {
                    await cache.put(audioUrl, response.clone());
                    match = response;
                }
            }
            if (match) {
                if (match.type === 'opaque') return audioUrl;
                const blob = await match.blob();
                if (!blob || !blob.size) return audioUrl;
                if (quranState.audioObjectUrl) URL.revokeObjectURL(quranState.audioObjectUrl);
                quranState.audioObjectUrl = URL.createObjectURL(blob);
                return quranState.audioObjectUrl;
            }
        } catch (error) {}
        return audioUrl;
    }

    function ensureQuranAyahCardRendered(targetAyahNumber) {
        const target = Number(targetAyahNumber);
        if (!Number.isFinite(target) || target <= 0) return;
        if (!quranState.currentSurahData?.ayahs?.length) return;

        // Lazily render additional chunks so auto-scroll can target the active ayah in long surahs.
        while (quranState.renderedAyahs < target && quranState.renderedAyahs < quranState.currentSurahData.ayahs.length) {
            renderQuranAyahChunk(false);
        }
    }

    function highlightPlayingAyah() {
        document.querySelectorAll('#quranAyahList .quran-ayah-card').forEach(card => {
            card.classList.remove('playing');
            card.setAttribute('aria-current', 'false');
        });
        document.querySelectorAll('#quranAyahList .quran-ayah-btn[data-ayah-action="play"]').forEach((btn) => {
            btn.textContent = '▶';
        });
        if (!quranState.audioAyah) return;

        const [, ayahNo] = quranState.audioAyah.split(':').map(Number);
        ensureQuranAyahCardRendered(ayahNo);

        const current = document.getElementById(`quranAyah-${quranState.audioAyah}`);
        if (current) {
            current.classList.add('playing');
            current.setAttribute('aria-current', 'true');
            const playBtn = current.querySelector('.quran-ayah-btn[data-ayah-action="play"]');
            if (playBtn) playBtn.textContent = (quranState.playerState === 'playing' || quranState.playerState === 'loading') ? '⏸' : '▶';
            const settings = getQuranSettings();
            if (settings.autoScrollAudio) current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function syncContinuousSurahAyahFromProgress(currentTime, duration, surahNumber) {
        const key = getAyahKeyFromContinuousSurahProgress(currentTime, duration, surahNumber);
        if (!key) return;
        if (quranState.audioAyah !== key) {
            quranState.audioAyah = key;
            quranState.lastPlayedAyah = Number(String(key).split(':')[1] || 0);
            highlightPlayingAyah();
            updateQuranMiniPlayerLabel();
        }
    }

    window.syncContinuousSurahAyahFromProgress = syncContinuousSurahAyahFromProgress;

    async function playQuranAyahInternal(surahNumber, ayahNumber, startTime = 0, forceReload = false) {
        console.log('[QuranAudio] play request', { surahNumber, ayahNumber, startTime, forceReload });
        clearQuranAudioRecovery();

        if (quranState.isPashtoTranslationActive) {
            stopActivePashtoTranslationSession();
        }

        if (!quranState.isChainedPlayback) {
            quranState.activeFlowMode = getFlowModeFromPanelMode(quranState.panelMode);
        }

        if ((quranState.activeFlowMode || 'ar') === 'ps') {
            if (!quranState.currentSurahData || Number(quranState.currentSurah) !== Number(surahNumber)) {
                await openQuranSurah(surahNumber, 1);
            }
            await playPashtoCombinedSurahAudio(surahNumber);
            return;
        }

        if ((quranState.activeFlowMode || 'ar') === 'ar-ps' && Number(ayahNumber) === 1 && Number(startTime) <= 0) {
            void resolvePashtoSurahAudioAvailability(surahNumber).then((pashtoAvailable) => {
                if (pashtoAvailable) void warmPashtoSurahAudio(surahNumber);
                if (Number(quranState.currentSurah || 0) === Number(surahNumber)) {
                    updateQuranPashtoAudioBanner();
                    updateQuranFloatingAudioUi();
                }
            });
        }

        if (!quranState.currentSurahData || Number(quranState.currentSurah) !== Number(surahNumber)) {
            await openQuranSurah(surahNumber, ayahNumber);
        }

        const requestedKey = `${Number(surahNumber)}:${Number(ayahNumber)}`;
        const sameAyahAsCurrent = quranState.audioAyah === requestedKey;

        if (!forceReload && sameAyahAsCurrent && quranState.audio) {
            if (quranState.playerState === 'playing') {
                quranState.audio.pause();
                pauseTranslationOverlayAudio();
                quranState.audioPausedManually = true;
                setQuranPlayerState('paused');
                return;
            }

            if (quranState.playerState === 'paused') {
                setQuranPlayButtonLoading(true);
                quranState.audio.play().then(() => {
                    resumeTranslationOverlayAudio();
                    quranState.audioPausedManually = false;
                    setQuranPlayerState('playing');
                    setQuranPlayButtonLoading(false);
                }).catch(() => {
                    setQuranPlayerState('paused');
                    setQuranPlayButtonLoading(false);
                });
                return;
            }
        }

        stopTranslationOverlayAudio();

        const settings = getQuranSettings();
        quranState.lastPlayedSurah = Number(surahNumber);
        quranState.lastPlayedAyah = Number(ayahNumber);
        if (!quranState.isChainedPlayback) quranState.audioSessionStartAyah = Number(ayahNumber) || 1;
        setQuranPlayerState('loading');
        setQuranPlayButtonLoading(true);

        ensureQuranPrimaryAudio();

        quranState.audioAyah = `${surahNumber}:${ayahNumber}`;
        quranState.audioFallbackAttempted = false;
        highlightPlayingAyah();
        updateQuranMiniPlayerLabel();

        const tryPlayWithCandidates = async (candidateUrls, seekFrom = 0) => {
            if (!candidateUrls.length) return { ok: false, usedUrl: null };

            for (const candidateUrl of candidateUrls) {
                try {
                    quranState.audioSwitchingSource = true;
                    const src = await getPlayableAudioSource(candidateUrl);

                    if (quranState.audio && !quranState.audio.paused && (forceReload || !sameAyahAsCurrent)) {
                        quranState.audio.pause();
                    }

                    quranState.audio.playbackRate = Number(quranState.audioRate || 1);
                    quranState.audio.src = src;
                    quranState.audio.currentTime = 0;

                    if (seekFrom > 0) {
                        await new Promise((resolve) => {
                            let settled = false;
                            const seekAndResolve = () => {
                                if (settled) return;
                                settled = true;
                                try { quranState.audio.currentTime = seekFrom; } catch (error) {}
                                resolve();
                            };

                            if (quranState.audio.readyState >= 1) {
                                seekAndResolve();
                                return;
                            }

                            quranState.audio.addEventListener('loadedmetadata', seekAndResolve, { once: true });
                            quranState.audio.addEventListener('canplay', seekAndResolve, { once: true });
                            setTimeout(seekAndResolve, 700);
                        });
                    }

                    await quranState.audio.play();
                    quranState.audioSwitchingSource = false;
                    return { ok: true, usedUrl: candidateUrl };
                } catch (error) {
                    quranState.audioSwitchingSource = false;
                    console.warn('[QuranAudio] candidate play failed', { candidateUrl, error: error?.message || error });
                }
            }

            return { ok: false, usedUrl: null };
        };

        const shouldTryContinuousSurah = quranState.activeFlowMode === 'ar'
            && Number(ayahNumber) === 1
            && Number(startTime) <= 0;
        let primaryCandidates = [];

        if (shouldTryContinuousSurah) {
            primaryCandidates = fetchSurahAudioCandidates(surahNumber, settings.reciter);
            quranState.isContinuousSurahPlayback = true;
        } else {
            quranState.isContinuousSurahPlayback = false;
            primaryCandidates = await fetchAyahAudioCandidates(surahNumber, ayahNumber, settings.reciter);
        }

        console.log('[QuranAudio] candidate URLs', { reciter: settings.reciter, count: primaryCandidates.length });

        if (!primaryCandidates.length) {
            primaryCandidates = await fetchAyahAudioApiCandidates(surahNumber, ayahNumber, settings.reciter);
        }

        let playResult = await tryPlayWithCandidates(primaryCandidates, startTime);

        if (!playResult.ok && !shouldTryContinuousSurah) {
            const selectedApiCandidates = await fetchAyahAudioApiCandidates(surahNumber, ayahNumber, settings.reciter);
            const remainingSelectedApiCandidates = selectedApiCandidates.filter((candidate) => !primaryCandidates.includes(candidate));
            if (remainingSelectedApiCandidates.length) {
                playResult = await tryPlayWithCandidates(remainingSelectedApiCandidates, startTime);
            }
        }

        if (!playResult.ok && getCanonicalReciterId(settings.reciter) !== QURAN_FALLBACK_RECITER) {
            quranState.audioFallbackAttempted = true;
            showToast('Audio not available for this reciter');
            const fallbackCandidates = shouldTryContinuousSurah
                ? fetchSurahAudioCandidates(surahNumber, QURAN_FALLBACK_RECITER)
                : await fetchAyahAudioCandidates(surahNumber, ayahNumber, QURAN_FALLBACK_RECITER);
            playResult = await tryPlayWithCandidates(fallbackCandidates, startTime);

            if (!playResult.ok && !shouldTryContinuousSurah) {
                const fallbackApiCandidates = await fetchAyahAudioApiCandidates(surahNumber, ayahNumber, QURAN_FALLBACK_RECITER);
                const remainingFallbackApiCandidates = fallbackApiCandidates.filter((candidate) => !fallbackCandidates.includes(candidate));
                if (remainingFallbackApiCandidates.length) {
                    playResult = await tryPlayWithCandidates(remainingFallbackApiCandidates, startTime);
                }
            }
        }

        if (!playResult.ok) {
            showToast('Audio playback failed');
            quranState.isChainedPlayback = false;
            quranState.isContinuousSurahPlayback = false;
            highlightPlayingAyah();
            updateQuranMiniPlayerLabel();
            setQuranPlayerState('hidden');
            setQuranPlayButtonLoading(false);
            return;
        }

        console.log('[QuranAudio] using audio source', { url: playResult.usedUrl, reciter: settings.reciter });
        if (shouldTryContinuousSurah) {
            startTranslationOverlayForFlowMode(Number(surahNumber));
        }
        setQuranPlayerState('playing');
        updateQuranMiniTime();
        setQuranPlayButtonLoading(false);
        updateQuranMediaSession();
    }

    window.playQuranAyah = function(surahNumber, ayahNumber, playAll = false, startTime = 0, forceReload = false) {
        playQuranAyahInternal(Number(surahNumber), Number(ayahNumber), Number(startTime) || 0, !!forceReload);
    };

    window.startQuranFlowRecitation = function(mode = 'ar') {
        const surah = Number(quranState.currentSurah || quranState.lastPlayedSurah || 0);
        if (!surah) {
            showToast(getQuranUiText().openSurahFirst);
            return;
        }

        let flowMode = 'ar';
        if (mode === 'pashto' || mode === 'ps' || mode === 'ar-ps') flowMode = 'ar-ps';
        else if (mode === 'english' || mode === 'ar-en') flowMode = 'ar-en';

        quranState.activeFlowMode = flowMode;
        quranState.panelMode = flowMode === 'ar-ps' ? 'pashto' : flowMode === 'ar-en' ? 'english' : 'arabic';
        localStorage.setItem(QURAN_PANEL_MODE_KEY, quranState.panelMode);
        quranState.forcePashtoAfterCurrentFlow = false;
        updateFlowModeButtons();
        // Force a clean restart so newly selected flow mode always initializes its translation overlay.
        playQuranAyahInternal(surah, 1, 0, true);
    };

    function toggleQuranPlayPause() {
        if (quranState.playerState === 'loading') {
            return;
        }

        if (quranState.isPashtoTranslationActive) {
            if (quranState.playerState === 'playing' && typeof window.pausePashtoTranslation === 'function') {
                window.pausePashtoTranslation();
                setQuranPlayerState('paused');
                return;
            }

            if (quranState.playerState === 'paused' && typeof window.resumePashtoTranslation === 'function') {
                setQuranPlayButtonLoading(true);
                window.resumePashtoTranslation().then(() => {
                    setQuranPlayButtonLoading(false);
                    setQuranPlayerState('playing');
                }).catch(() => {
                    setQuranPlayButtonLoading(false);
                    setQuranPlayerState('paused');
                });
                return;
            }
        }

        if (quranState.playerState === 'playing' && quranState.audio) {
            quranState.audio.pause();
            pauseTranslationOverlayAudio();
            quranState.audioPausedManually = true;
            setQuranPlayerState('paused');
            return;
        }

        if (quranState.playerState === 'paused' && quranState.audio) {
            setQuranPlayButtonLoading(true);
            quranState.audio.play().catch(() => {
                setQuranPlayerState('paused');
                setQuranPlayButtonLoading(false);
            });
            resumeTranslationOverlayAudio();
            quranState.audioPausedManually = false;
            return;
        }

        if (quranState.lastPlayedSurah && quranState.lastPlayedAyah) {
            playQuranAyahInternal(quranState.lastPlayedSurah, quranState.lastPlayedAyah);
        }
    }

    window.toggleQuranPlayPause = toggleQuranPlayPause;

    function handleQuranAyahActionEvent(event, isTouch = false) {
        const target = event.target && event.target.closest
            ? event.target.closest('.quran-ayah-btn[data-ayah-action]')
            : null;
        if (!target) return;

        if (isTouch) {
            event.preventDefault();
            target.classList.add('pressed');
            setTimeout(() => target.classList.remove('pressed'), 90);
        }

        const action = target.getAttribute('data-ayah-action');
        const surah = Number(target.getAttribute('data-surah'));
        const ayah = Number(target.getAttribute('data-ayah'));
        if (!action || !surah || !ayah) return;
        console.log('[QuranAudio] ayah action tapped', { action, surah, ayah, isTouch });

        const lockKey = `ayah-${action}-${surah}-${ayah}`;
        const now = Date.now();
        const last = quranTapLocks.get(lockKey) || 0;
        if (now - last < 220) return;
        quranTapLocks.set(lockKey, now);

        if (action === 'play') {
            quranState.activeFlowMode = getFlowModeFromPanelMode(quranState.panelMode);
            updateFlowModeButtons();
            playQuranAyahInternal(surah, ayah);
        }
        else if (action === 'bookmark') toggleQuranAyahBookmark(surah, ayah);
    }

    function playRelativeAyah(step) {
        if (!quranState.audioAyah && !(quranState.lastPlayedSurah && quranState.lastPlayedAyah)) return;
        const [surahNo, ayahNo] = quranState.audioAyah
            ? quranState.audioAyah.split(':').map(Number)
            : [Number(quranState.lastPlayedSurah), Number(quranState.lastPlayedAyah)];
        const nextNo = ayahNo + step;
        if (!quranState.currentSurahData) return;
        if (nextNo < 1 || nextNo > quranState.currentSurahData.ayahs.length) return;
        quranState.activeFlowMode = getFlowModeFromPanelMode(quranState.panelMode);
        playQuranAyahInternal(surahNo, nextNo);
    }

    window.toggleQuranAyahBookmark = function(surahNumber, ayahNumber) {
        const data = quranState.currentSurahData;
        if (!data) return;
        const ayah = data.ayahs.find(a => Number(a.numberInSurah) === Number(ayahNumber));
        if (!ayah) return;
        const list = getQuranBookmarks();
        const idx = list.findIndex(item => Number(item.surahNumber) === Number(surahNumber) && Number(item.ayahNumber) === Number(ayahNumber));
        if (idx >= 0) {
            list.splice(idx, 1);
            showToast(getQuranUiText().removedBookmark);
        } else {
            list.unshift({
                surahNumber: Number(surahNumber),
                ayahNumber: Number(ayahNumber),
                surahLabel: isPashtoMode() ? cleanSurahArabicName(data.name) : data.englishName,
                preview: ayah.arabic,
                ts: Date.now()
            });
            markSurahOffline(surahNumber);
            showToast(getQuranUiText().bookmarked);
        }
        saveQuranBookmarks(list.slice(0, 500));
        renderQuranAyahChunk(true);
    };

    window.removeQuranBookmark = function(surahNumber, ayahNumber) {
        const list = getQuranBookmarks().filter(item => !(Number(item.surahNumber) === Number(surahNumber) && Number(item.ayahNumber) === Number(ayahNumber)));
        saveQuranBookmarks(list);
        renderQuranBookmarksSection();
    };

    async function cacheSurahAudioByReciter(surahNumber, reciter) {
        const data = quranState.currentSurahData && Number(quranState.currentSurah) === Number(surahNumber)
            ? quranState.currentSurahData
            : await fetchSurahBundle(surahNumber);
        if (!data?.ayahs?.length) return;

        const cache = await caches.open(QURAN_AUDIO_CACHE);
        for (const ayah of data.ayahs) {
            const candidates = await fetchAyahAudioCandidates(surahNumber, ayah.numberInSurah, reciter);
            const audioUrl = candidates[0] || null;
            if (!audioUrl) continue;
            const exists = await cache.match(audioUrl, { ignoreSearch: true });
            if (exists) continue;
            try {
                const resp = await fetchWithTimeout(audioUrl, { mode: 'no-cors', cache: 'no-store' }, 12000);
                if (resp && (resp.ok || resp.type === 'opaque')) await cache.put(audioUrl, resp.clone());
            } catch (error) {}
        }
    }

    window.downloadQuranSurahOffline = async function(surahNumber) {
        const ui = getQuranUiText();
        showToast(ui.downloading);
        try {
            await fetchSurahBundle(Number(surahNumber), true);
            const reciter = getQuranSettings().reciter;
            await cacheSurahAudioByReciter(Number(surahNumber), reciter);
            markSurahOffline(Number(surahNumber));
            showToast(`${ui.downloaded}: ${isPashtoMode() ? 'سورت' : 'Surah'} ${localizeQuranNumber(surahNumber)}`);
            if (quranState.view === 'surah') renderQuranSurahRows();
            if (quranState.currentSurahData && Number(quranState.currentSurah) === Number(surahNumber)) {
                renderQuranReaderHeader(quranState.currentSurahData);
            }
        } catch (error) {
            showToast(ui.noData);
        }
    };

    function bindQuranEvents() {
        const searchInput = document.getElementById('quranSearchInput');
        const selectBtn = document.getElementById('quranSurahSelectBtn');
        const selectorWrap = document.getElementById('quranSurahSelector');
        if (searchInput && searchInput.dataset.bound !== '1') {
            searchInput.addEventListener('input', () => {
                quranState.search = searchInput.value || '';
                if (quranState.view === 'surah') renderQuranSurahRows();
            });
            searchInput.dataset.bound = '1';
        }

        if (selectBtn && selectBtn.dataset.bound !== '1') {
            selectBtn.addEventListener('click', () => toggleQuranSurahDropdown());
            selectBtn.dataset.bound = '1';
        }

        if (selectorWrap && selectorWrap.dataset.outsideBound !== '1') {
            document.addEventListener('click', (event) => {
                if (!quranState.dropdownOpen) return;
                if (!selectorWrap.contains(event.target)) closeQuranSurahDropdown();
            });
            selectorWrap.dataset.outsideBound = '1';
        }

        document.querySelectorAll('.quran-view-tab').forEach(tab => {
            if (tab.dataset.bound === '1') return;
            tab.addEventListener('click', () => {
                setQuranPanelMode(tab.getAttribute('data-qview'));
            });
            tab.dataset.bound = '1';
        });

        // Harden mode switching in case class-based tab binding is skipped in slower init paths.
        const viewTabsById = [
            { id: 'quranTabArabic', mode: 'arabic' },
            { id: 'quranTabPashto', mode: 'pashto' },
            { id: 'quranTabEnglish', mode: 'english' }
        ];
        viewTabsById.forEach(({ id, mode }) => {
            const tabEl = document.getElementById(id);
            if (!tabEl || tabEl.dataset.boundViewMode === '1') return;
            tabEl.addEventListener('click', () => setQuranPanelMode(mode));
            tabEl.dataset.boundViewMode = '1';
        });

        const loadMore = document.getElementById('quranLoadMore');
        if (loadMore && loadMore.dataset.bound !== '1') {
            loadMore.addEventListener('click', () => renderQuranAyahChunk(false));
            loadMore.dataset.bound = '1';
        }

        const panel = document.querySelector('.quran-panel');
        if (panel && panel.dataset.boundScroll !== '1') {
            panel.addEventListener('scroll', () => {
                updateQuranReaderProgress();
                scheduleQuranReaderControlsHide(900);
            }, { passive: true });
            panel.dataset.boundScroll = '1';
        }

        if (!window.__quranStickyOffsetResizeBound) {
            window.addEventListener('resize', () => syncQuranReaderStickyOffsets(), { passive: true });
            window.__quranStickyOffsetResizeBound = true;
        }

        const ayahList = document.getElementById('quranAyahList');
        const audioDot = document.getElementById('quran-floating-dot');
        const audioPrev = document.getElementById('dot-prev');
        const audioNext = document.getElementById('dot-next');
        const audioStop = document.getElementById('dot-stop');
        const audioPopupClose = document.getElementById('dot-close');
        const audioPopup = document.getElementById('quran-dot-popup');
        const reader = document.getElementById('quranReaderScreen');
        const modeArabicBtn = document.getElementById('quranModeArabicBtn');
        const modePashtoBtn = document.getElementById('quranModePashtoBtn');
        const modeEnglishBtn = document.getElementById('quranModeEnglishBtn');
        const prevSurahBtn = document.getElementById('quranPrevSurahBtn');
        const playPauseBtn = document.getElementById('quranPlayPauseBtn');
        const nextSurahBtn = document.getElementById('quranNextSurahBtn');
        const bookmarkCurrentBtn = document.getElementById('quranBookmarkCurrentBtn');
        const scrollContent = document.getElementById('quranScrollContent');

        if (window.__quranPashtoStateBound !== true) {
            window.addEventListener('pashto-translation-state', (event) => {
                const detail = event?.detail || {};
                const state = String(detail.state || '');
                const isPreloadEvent = detail.preload === true;
                const isSegmentEvent = detail.segment === true;
                const surah = Number(detail.surahNumber || quranState.pashtoTranslationSurah || quranState.currentSurah || 0);
                if (surah > 0 && !PASHTO_SURAH_AUDIO_AVAILABILITY.has(surah)) {
                    PASHTO_SURAH_AUDIO_AVAILABILITY.set(surah, true);
                }

                if (isPreloadEvent) {
                    updateQuranPashtoAudioBanner();
                    updateQuranFloatingAudioUi();
                    return;
                }

                if (isSegmentEvent) {
                    if (!quranState.isPashtoAyahSegmentPlayback || Number(quranState.pashtoTranslationSurah || surah) !== surah) {
                        return;
                    }

                    if (state === 'buffering') {
                        setQuranPlayerState('loading');
                        setQuranPlayButtonLoading(true);
                    } else if (state === 'playing') {
                        setQuranPlayerState('playing');
                        setQuranPlayButtonLoading(false);
                    } else if (state === 'paused') {
                        setQuranPlayerState('paused');
                        setQuranPlayButtonLoading(false);
                    } else if (state === 'error' || state === 'ended' || state === 'stopped') {
                        setQuranPlayButtonLoading(false);
                    }

                    updateQuranPashtoAudioBanner();
                    updateQuranFloatingAudioUi();
                    return;
                }

                if (state === 'preloading' || state === 'buffering') {
                    if (Number(quranState.pashtoTranslationSurah || surah) === surah) {
                        quranState.isPashtoTranslationActive = true;
                        quranState.pashtoTranslationSurah = surah;
                        setQuranPlayerState('loading');
                        setQuranPlayButtonLoading(true);
                    }
                } else if (state === 'playing') {
                    if (Number(quranState.pashtoTranslationSurah || surah) === surah) {
                        quranState.isPashtoTranslationActive = true;
                        quranState.pashtoTranslationSurah = surah;
                        setQuranPlayerState('playing');
                        setQuranPlayButtonLoading(false);
                    }
                } else if (state === 'paused') {
                    if (quranState.isPashtoTranslationActive) {
                        setQuranPlayerState('paused');
                        setQuranPlayButtonLoading(false);
                    }
                } else if (state === 'stopped' || state === 'ended') {
                    if (Number(quranState.pashtoTranslationSurah || surah) === surah) {
                        quranState.isPashtoTranslationActive = false;
                        quranState.pashtoTranslationSurah = null;
                        setQuranPlayButtonLoading(false);
                        setQuranPlayerState('hidden');
                    }
                } else if (state === 'error') {
                    if (Number(quranState.pashtoTranslationSurah || surah) === surah) {
                        quranState.isPashtoTranslationActive = false;
                        quranState.pashtoTranslationSurah = null;
                        setQuranPlayButtonLoading(false);
                        setQuranPlayerState('hidden');
                    }
                }

                updateQuranPashtoAudioBanner();
                updateQuranFloatingAudioUi();
            });
            window.__quranPashtoStateBound = true;
        }

        if (ayahList && ayahList.dataset.boundActions !== '1') {
            ayahList.addEventListener('touchstart', (event) => handleQuranAyahActionEvent(event, true), { passive: false });
            ayahList.addEventListener('click', (event) => handleQuranAyahActionEvent(event, false));
            ayahList.dataset.boundActions = '1';
        }

        if (modeArabicBtn && modeArabicBtn.dataset.bound !== '1') {
            modeArabicBtn.addEventListener('click', () => setQuranPanelMode('arabic'));
            modeArabicBtn.dataset.bound = '1';
        }

        if (modePashtoBtn && modePashtoBtn.dataset.bound !== '1') {
            modePashtoBtn.addEventListener('click', () => setQuranPanelMode('pashto'));
            modePashtoBtn.dataset.bound = '1';
        }

        if (modeEnglishBtn && modeEnglishBtn.dataset.bound !== '1') {
            modeEnglishBtn.addEventListener('click', () => setQuranPanelMode('english'));
            modeEnglishBtn.dataset.bound = '1';
        }

        if (playPauseBtn && playPauseBtn.dataset.bound !== '1') {
            playPauseBtn.addEventListener('click', async () => {
                if (!quranState.currentSurah) {
                    showToast(getQuranUiText().openSurahFirst);
                    return;
                }

                if (!isQuranAudioSessionActive()) {
                    quranState.activeFlowMode = getFlowModeFromPanelMode(quranState.panelMode);
                    const startAyah = Number(quranState.lastPlayedAyah || 1);
                    if ((quranState.activeFlowMode || 'ar') === 'ar-ps' && startAyah <= 1) {
                        await refreshQuranPashtoAudioAvailability();
                    }
                    playQuranAyahInternal(Number(quranState.currentSurah), startAyah, 0, true);
                    return;
                }

                toggleQuranPlayPause();
            });
            playPauseBtn.dataset.bound = '1';
        }

        if (bookmarkCurrentBtn && bookmarkCurrentBtn.dataset.bound !== '1') {
            bookmarkCurrentBtn.addEventListener('click', () => {
                if (!quranState.currentSurahData || !quranState.currentSurah) return;
                const cards = Array.from(document.querySelectorAll('#quranAyahList .quran-ayah-card'));
                if (!cards.length) return;

                const anchorY = 150;
                let activeCard = cards[cards.length - 1];
                for (const card of cards) {
                    const rect = card.getBoundingClientRect();
                    if (rect.top >= anchorY) {
                        activeCard = card;
                        break;
                    }
                }

                const ayahNo = Number(activeCard.getAttribute('data-ayah-no') || 1);
                toggleQuranAyahBookmark(Number(quranState.currentSurah), ayahNo);
            });
            bookmarkCurrentBtn.dataset.bound = '1';
        }

        if (prevSurahBtn && prevSurahBtn.dataset.bound !== '1') {
            prevSurahBtn.addEventListener('click', () => {
                const current = Number(quranState.currentSurah || 1);
                const target = Math.max(1, current - 1);
                openQuranSurah(target, 1).then(() => playQuranAyahInternal(target, 1, 0, true));
            });
            prevSurahBtn.dataset.bound = '1';
        }

        if (nextSurahBtn && nextSurahBtn.dataset.bound !== '1') {
            nextSurahBtn.addEventListener('click', () => {
                const current = Number(quranState.currentSurah || 1);
                const target = Math.min(114, current + 1);
                openQuranSurah(target, 1).then(() => playQuranAyahInternal(target, 1, 0, true));
            });
            nextSurahBtn.dataset.bound = '1';
        }

        if (audioDot && audioDot.dataset.bound !== '1') {
            audioDot.addEventListener('click', (event) => {
                if (quranDotLongPressFired) {
                    quranDotLongPressFired = false;
                    return;
                }
                event.preventDefault();
                toggleQuranPlayPause();
            });
            audioDot.addEventListener('dblclick', (event) => {
                event.preventDefault();
                toggleQuranAudioPopup();
            });
            const startHold = () => {
                clearQuranAudioDotHoldTimer();
                quranDotLongPressFired = false;
                quranDotLongPressTimer = setTimeout(() => {
                    quranDotLongPressFired = true;
                    openQuranAudioPopup();
                }, 450);
            };
            const endHold = () => {
                clearQuranAudioDotHoldTimer();
                setTimeout(() => { quranDotLongPressFired = false; }, 60);
            };
            audioDot.addEventListener('touchstart', startHold, { passive: true });
            audioDot.addEventListener('mousedown', startHold);
            audioDot.addEventListener('touchend', endHold);
            audioDot.addEventListener('touchcancel', endHold);
            audioDot.addEventListener('mouseup', endHold);
            audioDot.addEventListener('mouseleave', endHold);
            audioDot.dataset.bound = '1';
        }

        if (audioPrev && audioPrev.dataset.bound !== '1') {
            bindFastTap(audioPrev, 'quran-audio-prev', () => playRelativeAyah(-1));
            audioPrev.dataset.bound = '1';
        }
        if (audioNext && audioNext.dataset.bound !== '1') {
            bindFastTap(audioNext, 'quran-audio-next', () => playRelativeAyah(1));
            audioNext.dataset.bound = '1';
        }
        if (audioStop && audioStop.dataset.bound !== '1') {
            bindFastTap(audioStop, 'quran-audio-stop', () => stopQuranAudio({ resetTime: true, explicitStop: true }));
            audioStop.dataset.bound = '1';
        }
        if (audioPopupClose && audioPopupClose.dataset.bound !== '1') {
            bindFastTap(audioPopupClose, 'quran-audio-popup-close', () => stopQuranAudio({ resetTime: true, fullyReset: true }));
            audioPopupClose.dataset.bound = '1';
        }

        if (document.body.dataset.quranPopupOutsideBound !== '1') {
            document.addEventListener('click', (event) => {
                const popup = document.getElementById('quran-dot-popup');
                const dot = document.getElementById('quran-floating-dot');
                if (!popup || !dot || popup.style.display !== 'block') return;
                const insidePopup = event.target && popup.contains(event.target);
                const onDot = event.target && dot.contains(event.target);
                if (!insidePopup && !onDot) closeQuranAudioPopup();
            });
            document.body.dataset.quranPopupOutsideBound = '1';
        }

        if (audioPopup && audioPopup.dataset.bound !== '1') {
            audioPopup.addEventListener('click', (event) => event.stopPropagation());
            audioPopup.dataset.bound = '1';
        }

        if (reader && reader.dataset.popupDismissBound !== '1') {
            reader.addEventListener('scroll', () => {
                if (audioPopup?.style.display === 'block') closeQuranAudioPopup();
            }, { passive: true });
            reader.dataset.popupDismissBound = '1';
        }

        if (reader && reader.dataset.readerControlsBound !== '1') {
            reader.addEventListener('click', (event) => {
                const tools = document.querySelector('#quranReaderScreen .quran-reader-tools');
                if (tools && tools.contains(event.target)) return;
                showQuranReaderControls();
            });
            reader.addEventListener('touchstart', (event) => {
                const tools = document.querySelector('#quranReaderScreen .quran-reader-tools');
                if (tools && tools.contains(event.target)) return;
                showQuranReaderControls();
            }, { passive: true });
            reader.dataset.readerControlsBound = '1';
        }

        if (scrollContent && scrollContent.dataset.readerControlsBound !== '1') {
            scrollContent.addEventListener('scroll', () => scheduleQuranReaderControlsHide(700), { passive: true });
            scrollContent.dataset.readerControlsBound = '1';
        }

        updateQuranFloatingAudioUi();
    }

    function setQuranTabLabel(el, label, iconPath) {
        if (!el) return;
        el.innerHTML = `<span class="quran-tab-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${iconPath}</svg></span><span class="quran-tab-text">${label}</span>`;
    }

    function renderQuranTexts() {
        const ui = getQuranUiText();
        const title = document.getElementById('quranPanelTitle');
        const searchInput = document.getElementById('quranSearchInput');
        const tabArabic = document.getElementById('quranTabArabic');
        const tabPashto = document.getElementById('quranTabPashto');
        const tabEnglish = document.getElementById('quranTabEnglish');
        const popularTitle = document.getElementById('quranPopularTitle');
        if (title) title.textContent = ui.panelTitle;
        if (searchInput) searchInput.placeholder = ui.searchPlaceholder;
        if (tabArabic) tabArabic.querySelector('.quran-tab-text').textContent = ui.tabArabic;
        if (tabPashto) tabPashto.querySelector('.quran-tab-text').textContent = ui.tabPashto;
        if (tabEnglish) tabEnglish.querySelector('.quran-tab-text').textContent = ui.tabEnglish;
        if (popularTitle) popularTitle.textContent = isPashtoMode() ? 'مشهور سورتونه' : 'Popular Surahs';
        updateQuranSurahSelectLabel();

        const loadMore = document.getElementById('quranLoadMore');
        if (loadMore) loadMore.textContent = isPashtoMode() ? 'نور آیتونه ښکاره کړئ…' : 'Load more…';

        const dotPrev = document.getElementById('dot-prev');
        const dotNext = document.getElementById('dot-next');
        const dotStop = document.getElementById('dot-stop');
        const dotClose = document.getElementById('dot-close');
        const modeArabicBtn = document.getElementById('quranModeArabicBtn');
        const modePashtoBtn = document.getElementById('quranModePashtoBtn');
        const modeEnglishBtn = document.getElementById('quranModeEnglishBtn');
        const fontDownBtn = document.getElementById('quranFontDownBtn');
        const fontUpBtn = document.getElementById('quranFontUpBtn');
        const bookmarkCurrentBtn = document.getElementById('quranBookmarkCurrentBtn');
        if (dotPrev) dotPrev.setAttribute('aria-label', isPashtoMode() ? 'مخکینی آیت' : 'Previous ayah');
        if (dotNext) dotNext.setAttribute('aria-label', isPashtoMode() ? 'راتلونکی آیت' : 'Next ayah');
        if (dotStop) {
            dotStop.setAttribute('aria-label', isPashtoMode() ? 'غږ بند کړئ' : 'Stop audio');
            dotStop.textContent = isPashtoMode() ? '⏹ بند' : '⏹ Stop';
        }
        if (dotClose) {
            dotClose.setAttribute('aria-label', isPashtoMode() ? 'د غږ کړکۍ بنده کړئ' : 'Close audio popup');
            dotClose.textContent = isPashtoMode() ? '× بند' : '× Close';
        }
        if (modeArabicBtn) modeArabicBtn.textContent = isPashtoMode() ? 'عربي' : 'Arabic';
        if (modePashtoBtn) modePashtoBtn.textContent = isPashtoMode() ? 'پښتو' : 'Pashto';
        if (modeEnglishBtn) modeEnglishBtn.textContent = isPashtoMode() ? 'انګلیسي' : 'English';
        if (fontDownBtn) {
            fontDownBtn.setAttribute('aria-label', isPashtoMode() ? 'د عربي لیکنې اندازه کمه کړئ' : 'Decrease text size');
            fontDownBtn.setAttribute('title', isPashtoMode() ? 'اندازه کمه کړئ' : 'Decrease text size');
        }
        if (fontUpBtn) {
            fontUpBtn.setAttribute('aria-label', isPashtoMode() ? 'د عربي لیکنې اندازه زیاته کړئ' : 'Increase text size');
            fontUpBtn.setAttribute('title', isPashtoMode() ? 'اندازه زیاته کړئ' : 'Increase text size');
        }
        if (bookmarkCurrentBtn) {
            bookmarkCurrentBtn.setAttribute('aria-label', isPashtoMode() ? 'اوسنی آیت په نښه کړئ' : 'Bookmark current ayah');
            bookmarkCurrentBtn.setAttribute('title', isPashtoMode() ? 'اوسنی آیت په نښه کړئ' : 'Bookmark current ayah');
        }

        renderQuranInlineReciterSelect();
        updateQuranPashtoAudioBanner();

        updateFlowModeButtons();

        updateQuranFloatingAudioUi();
        updateQuranMiniTime();
    }

    async function initQuran() {
        if (quranState.initialized) return;
        await fetchQuranMeta();
        setQuranPanelMode(quranState.panelMode, { restartAudio: false });
        applyQuranArabicFontSize();
        bindQuranEvents();
        renderQuranTexts();
        renderQuranContinueCard();
        renderQuranRecentSection();
        setQuranView(quranState.view || 'surah', { skipHistory: true });
        await ensurePashtoEdition();
        quranState.initialized = true;
    }

    window.refreshQuranLanguage = function() {
        renderQuranTexts();
        setQuranPanelMode(quranState.panelMode, { restartAudio: false });
        renderQuranContinueCard();
        renderQuranRecentSection();
        renderQuranSurahRows();
        if (quranState.currentSurahData) {
            renderQuranReaderHeader(quranState.currentSurahData);
            renderQuranAyahChunk(true);
            syncQuranReaderStickyOffsets();
        }
        updateQuranPashtoAudioBanner();
    };

    window.openQuran = async function() {
        const panel = document.querySelector('.quran-panel');
        if (!panel) return;
        const needsInit = !quranState.initialized;
        if (needsInit) setPanelLoading('quran', true, isPashtoMode() ? 'قرآن بارېږي…' : 'Loading Quran…');
        switchTab('quran');
        await initQuran();
        renderQuranContinueCard();
        renderQuranRecentSection();
        if (needsInit) {
            setQuranView(quranState.view || localStorage.getItem(QURAN_ACTIVE_TAB_KEY) || 'surah', { skipHistory: true });
        }
        updateQuranFloatingAudioUi();
        recordInAppRoute(true, {
            view: IN_APP_VIEWS.QURAN_TAB
        });
        setPanelLoading('quran', false);
    };

    function closeQuranReader({ skipHistory = false } = {}) {
        const reader = document.getElementById('quranReaderScreen');
        const listScreen = document.getElementById('quranListScreen');
        const activeList = getQuranListContainerByView(quranState.view) || document.getElementById('quranSurahList');
        if (reader) reader.classList.remove('active');
        clearQuranReaderControlsHide();
        if (listScreen) listScreen.style.display = '';
        if (activeList) activeList.style.display = '';
        stopQuranAudio({ resetTime: true, navigatedAway: true });
        renderQuranContinueCard();
        updateQuranFloatingAudioUi();
        if (!skipHistory) {
            recordInAppRoute(false, {
                view: IN_APP_VIEWS.QURAN_TAB
            });
        }
    }

    function switchToHomeTab() {
        switchTab('home');
        backToCategories();
    }

    function closeQuranPanel({ skipHistory = false } = {}) {
        setPanelLoading('quran', false);
        closeQuranReader({ skipHistory: true });
        clearQuranAudioDotHoldTimer();
        closeQuranAudioPopup();
        updateQuranMiniPlayerVisibility();
        document.body.classList.remove('quran-reading-mode');
        switchTab('home');
        if (!skipHistory) {
            recordInAppRoute(false, {
                view: IN_APP_VIEWS.HOME
            });
        }
    }

    window.closeQuran = function() {
        closeQuranPanel();
        switchToHomeTab();
    };

    window.openQuranSurah = openQuranSurah;
    window.openQuranJuz = openQuranJuz;

    // ===== REGISTER SERVICE WORKER =====
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                showToast('App updated! Refresh for the latest version.');
            } else if (event.data && event.data.type === 'SW_PRAYER_REMINDER_DUE') {
                const { prayerName } = event.data;
                console.log('[PrayerReminder] Received due reminder from service worker', {
                    prayerName,
                    triggerAt: event.data.triggerAt,
                    reason: event.data.reason,
                    receivedAt: new Date().toString()
                });
                if (prayerName && activePrayerReminderSchedule[prayerName]) {
                    delete activePrayerReminderSchedule[prayerName];
                    renderPrayerGrid();
                }
            }
        });
    }

    // ===== START =====
    document.addEventListener('DOMContentLoaded', init);
