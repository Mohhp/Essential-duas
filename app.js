    // ===== STATE MANAGEMENT =====
    const STATE = {
        bookmarks: JSON.parse(localStorage.getItem('crown_bookmarks')) || [],
        read: JSON.parse(localStorage.getItem('crown_read')) || [],
        streak: parseInt(localStorage.getItem('crown_streak')) || 0,
        lastVisit: localStorage.getItem('crown_last_visit') || null,
        fontSize: parseFloat(localStorage.getItem('crown_font_size')) || 1
    };

    function getPreferredLang() {
        if (typeof getCurrentLang === 'function') return getCurrentLang();
        return localStorage.getItem('crown_lang') || 'ps';
    }

    function isPashtoMode() {
        return getPreferredLang() === 'ps';
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
                setTimeout(() => splash.remove(), 1000);
            }, 1200);
        }

        updateStats();
        checkStreak();
        loadDailyDua();
        applyFontSize(STATE.fontSize);
        applyTheme();
        injectShareImageButtons();
        injectAudioButtons();
        renderTimeBanner();
        trackDailyActivity();
        renderBookmarksPanel();
        wrapArabicWords();
        initDailyReminderPrompt();

        // Apply saved language preference first (defaults to Pashto on first run)
        if (typeof applyLanguage === 'function') applyLanguage();

        showOnboardingIfFirstTime();
        enhanceAccessibility();
        setBottomNavActive('home');

        // Search listener
        if (els.searchInput) {
            els.searchInput.addEventListener('input', (e) => filterDuas(e.target.value));
        }

        // Scroll listener
        window.addEventListener('scroll', () => {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            if (els.progressBar) els.progressBar.style.width = scrolled + "%";

            const backBtn = document.querySelector('.back-to-top');
            if (backBtn) backBtn.classList.toggle('visible', winScroll > 500);

            if (els.nav) {
                if (winScroll > 50) els.nav.classList.add('scrolled');
                else els.nav.classList.remove('scrolled');
            }
        });

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
            window.location.hash = '';
        }, 1500); // After splash screen
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
                const label = 'Scroll to top';
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
            if (!header.hasAttribute('aria-label')) header.setAttribute('aria-label', `Toggle dua: ${title}`);
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

        document.querySelectorAll('.tasbeeh-panel, .etiquette-panel, .routine-panel, .prayer-panel, .progress-panel, .side-panel').forEach(panel => {
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
        });
    }

    function runTabFadeTransition(target) {
        if (!target) return;
        target.classList.add('tab-fade-target');
        target.classList.add('is-fading');
        setTimeout(() => target.classList.remove('is-fading'), 300);
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
                { title: 'Welcome', body: 'Welcome to Essential Duas — your curated collection of verified duas from Quran and Sunnah.' },
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
        const card = header.closest('.dua-card');
        const isExpanded = card.classList.toggle('expanded');
        header.setAttribute('aria-expanded', isExpanded);
        if (isExpanded) wrapArabicWords();
    };

    window.toggleAllCards = function(expand) {
        els.cards.forEach(card => {
            if (expand) card.classList.add('expanded');
            else card.classList.remove('expanded');
            const header = card.querySelector('.card-header');
            if (header) header.setAttribute('aria-expanded', expand);
        });
        showToast(expand ? 'All Expanded' : 'All Collapsed');
    };

    // ===== FONT SIZE =====
    window.adjustFontSize = function(delta) {
        let newSize = Math.max(0.8, Math.min(1.6, STATE.fontSize + delta));
        STATE.fontSize = newSize;
        localStorage.setItem('crown_font_size', newSize);
        applyFontSize(newSize);
    };

    function applyFontSize(size) {
        document.documentElement.style.setProperty('--font-scale', size);
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

    // ===== BOOKMARKING =====
    window.toggleBookmark = function(id) {
        const index = STATE.bookmarks.indexOf(id);
        const btn = document.querySelector(`.dua-card[data-id="${id}"] .bookmark-btn`);
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

    window.openCategory = function(cat, opts) {
        opts = opts || {};
        const grid = document.getElementById('categoryGrid');
        const duaList = document.getElementById('duaListSection');
        const detailHeader = document.getElementById('categoryDetailHeader');
        const meta = CATEGORY_META[cat] || { icon: '📿', title: cat, subtitle: '' };

        // Hide the grid and hero, show dua list
        grid.classList.add('hidden-grid');
        duaList.classList.remove('hidden-list');
        const hero = document.querySelector('.hero');
        if (hero) hero.style.display = 'none';

        // Set detail header (language-aware)
        document.getElementById('cdhIcon').textContent = meta.icon;
        const isPashto = typeof getCurrentLang === 'function' && getCurrentLang() === 'ps';
        const psUI = typeof PS_UI !== 'undefined' ? PS_UI : null;
        document.getElementById('cdhTitle').textContent = (isPashto && psUI && psUI.catCardTitles[cat]) ? psUI.catCardTitles[cat] : meta.title;
        document.getElementById('cdhSubtitle').textContent = (isPashto && psUI && psUI.catCardSubtitles[cat]) ? psUI.catCardSubtitles[cat] : meta.subtitle;
        detailHeader.classList.add('visible');

        // Hide category pills — the user already chose a category
        const pillsRow = document.getElementById('categoryPills');
        if (pillsRow) pillsRow.style.display = 'none';

        // Filter cards to this category
        const pill = document.querySelector(`.pill[data-category="${cat}"]`);
        filterCategory(cat, pill);

        // Scroll to the dua list so user sees cards immediately
        if (!opts.skipScroll) {
            duaList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Save state
        localStorage.setItem('crown_active_category', cat);
    };

    window.backToCategories = function() {
        const grid = document.getElementById('categoryGrid');
        const duaList = document.getElementById('duaListSection');
        const detailHeader = document.getElementById('categoryDetailHeader');

        // Show grid and hero, hide dua list
        grid.classList.remove('hidden-grid');
        duaList.classList.add('hidden-list');
        detailHeader.classList.remove('visible');
        const hero = document.querySelector('.hero');
        if (hero) hero.style.display = '';

        // Restore category pills
        const pillsRow = document.getElementById('categoryPills');
        if (pillsRow) pillsRow.style.display = '';

        // Reset all card visibility
        els.cards.forEach(card => {
            card.classList.remove('hidden-card');
            card.style.display = '';
        });

        // Restore all section headers
        document.querySelectorAll('.section-header').forEach(sh => {
            sh.style.display = '';
        });

        // Reset pills
        if (els.pills) els.pills.forEach(p => p.classList.remove('active'));
        const allPill = document.querySelector('.pill[data-category="all"]');
        if (allPill) allPill.classList.add('active');

        // Clear search
        if (els.searchInput) els.searchInput.value = '';
        if (els.searchClear) els.searchClear.classList.remove('visible');

        // Drop saved state
        localStorage.removeItem('crown_active_category');
    };

    // Search should auto-open the dua list if grid is visible
    (function patchSearchForGrid() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('focus', function() {
                const grid = document.getElementById('categoryGrid');
                if (grid && !grid.classList.contains('hidden-grid')) {
                    openCategory('all', { skipScroll: true });
                    // Scroll to search bar so it stays visible with results below
                    const searchContainer = document.querySelector('.search-container');
                    if (searchContainer) {
                        searchContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        }
    })();

    // Restore last category on page load if saved
    (function restoreGridState() {
        const savedCat = localStorage.getItem('crown_active_category');
        if (savedCat) {
            // User was viewing a category — restore it
            openCategory(savedCat);
        }
    })();

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
                    <button class="panel-close" onclick="toggleBookmarksPanel()">✕</button>
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
            setBottomNavActive('saved');
        } else {
            unlockScroll();
            setBottomNavActive('home');
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
        // If we're in grid view, switch to All category first
        const grid = document.getElementById('categoryGrid');
        if (grid && !grid.classList.contains('hidden-grid')) {
            openCategory('all');
        }
        const card = document.querySelector(`.dua-card[data-id="${id}"]`);
        if (card) {
            card.classList.remove('hidden-card');
            card.style.display = '';
            card.classList.add('expanded');
            const header = card.querySelector('.card-header');
            if (header) header.setAttribute('aria-expanded', 'true');
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            card.style.borderColor = 'var(--emerald-light)';
            card.style.boxShadow = '0 0 20px rgba(46, 196, 122, 0.15)';
            setTimeout(() => {
                card.style.borderColor = '';
                card.style.boxShadow = '';
            }, 2500);
        }
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
        if (arEl) arEl.textContent = d.ar;
        if (virtueEl) virtueEl.textContent = d.virtue;
        if (lifetimeEl) lifetimeEl.innerHTML = `TOTAL: <span>${getOverallTotal().toLocaleString()}</span>`;
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

    function triggerTasbeehCelebration() {
        const panel = document.querySelector('.tasbeeh-panel');
        if (panel) {
            panel.classList.add('celebrate');
            setTimeout(() => panel.classList.remove('celebrate'), 780);
        }
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
        if (display) display.textContent = '0';
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = `TARGET: ${tasbeehTarget}`;
        // Update preset active states
        document.querySelectorAll('.tasbeeh-preset').forEach(p => p.classList.remove('active'));
        updateTasbeehUI();
        renderDhikrSelector();
        localStorage.setItem('crown_dhikr_selected', index);
    };

    window.openTasbeeh = function() {
        const tp = document.querySelector('.tasbeeh-panel');
        if (tp) tp.classList.add('active');
        lockScroll();
        setBottomNavActive('tasbeeh');
        // Restore last selected dhikr
        const saved = parseInt(localStorage.getItem('crown_dhikr_selected') || '0', 10);
        currentDhikrIndex = (saved >= 0 && saved < DHIKR_LIST.length) ? saved : 0;
        tasbeehTarget = DHIKR_LIST[currentDhikrIndex].defaultTarget;
        resetTasbeeh();
        renderDhikrSelector();
        updateTasbeehUI();
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = `TARGET: ${tasbeehTarget}`;
        updateTasbeehSoundToggle();
        const closeBtn = document.querySelector('.tasbeeh-close');
        if (closeBtn) closeBtn.focus();
    };

    window.openTasbeehWith = function(target) {
        openTasbeeh();
        tasbeehTarget = (target === 36) ? 100 : 33;
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = `TARGET: ${tasbeehTarget}`;
    };

    window.closeTasbeeh = function() {
        // Save session count on close
        if (tasbeehCount > 0) {
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
            tasbeehCount = 0;
        }
        const tp = document.querySelector('.tasbeeh-panel');
        if (tp) tp.classList.remove('active');
        unlockScroll();
        setBottomNavActive('home');
    };

    window.tapTasbeeh = function(event) {
        tasbeehCount++;
        const display = document.getElementById('tasbeehDisplay');
        const btn = document.querySelector('.tasbeeh-tap-btn');
        if (display) {
            display.textContent = tasbeehCount;
            display.classList.remove('bump');
            requestAnimationFrame(() => display.classList.add('bump'));
        }
        if (btn) {
            btn.classList.add('pulse');
            setTimeout(() => btn.classList.remove('pulse'), 100);

            if (event) {
                const rect = btn.getBoundingClientRect();
                const ripple = document.createElement('span');
                ripple.className = 'tasbeeh-ripple';
                ripple.style.left = `${event.clientX - rect.left}px`;
                ripple.style.top = `${event.clientY - rect.top}px`;
                btn.appendChild(ripple);
                setTimeout(() => ripple.remove(), 700);
            }
        }
        if (navigator.vibrate) navigator.vibrate(50);
        playTasbeehClick();

        if (tasbeehCount === tasbeehTarget && tasbeehTarget !== 0) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            saveDhikrTotal(DHIKR_LIST[currentDhikrIndex].id, tasbeehCount);
            triggerTasbeehCelebration();
            tasbeehCount = 0;
            showToast('Target reached! ✨ Count saved.');
            // Auto-advance to next dhikr if user reached target
            setTimeout(() => {
                const display2 = document.getElementById('tasbeehDisplay');
                if (display2) display2.textContent = '0';
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
        if (display) display.textContent = '0';
        updateTasbeehUI();
    };

    window.setTasbeehTarget = function(t) {
        tasbeehTarget = t;
        const tt = document.getElementById('tasbeehTargetLabel');
        if (tt) tt.textContent = t === 0 ? 'OPEN COUNT' : `TARGET: ${t}`;
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
    window.openEtiquette = function() {
        const ep = document.querySelector('.etiquette-panel');
        if (!ep) return;
        if (!ep.querySelector('.etiquette-content').innerHTML.trim()) {
            ep.querySelector('.etiquette-content').innerHTML = `
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
        ep.classList.add('active');
        lockScroll();
        const closeBtn = ep.querySelector('.etiquette-close');
        if (closeBtn) closeBtn.focus();
    };

    window.closeEtiquette = function() {
        const ep = document.querySelector('.etiquette-panel');
        if (ep) ep.classList.remove('active');
        unlockScroll();
    };

    // ===== ROUTINE PANEL =====
    window.openRoutine = function() {
        const rp = document.querySelector('.routine-panel');
        if (!rp) return;
        if (!rp.querySelector('.routine-content').innerHTML.trim()) {
            rp.querySelector('.routine-content').innerHTML = `
                <h2>Recommended Daily Routine</h2>
                <div class="progress-stat-card daily-dua-progress" style="flex-direction:column;text-align:center;cursor:pointer;border-color:rgba(201,168,76,0.15);" onclick="toggleRoutineDailyDua(event);">
                    <div style="font-family:var(--font-title);font-size:0.7rem;letter-spacing:2.5px;text-transform:uppercase;color:rgba(201,168,76,0.8);margin-bottom:0.5rem;"><span class="sparkle">✦</span> Dua of the Day <span class="sparkle">✦</span></div>
                    <div id="routineDailyArabic" style="font-family:var(--font-arabic);font-size:calc(1.3rem * var(--font-scale));color:var(--gold-light);direction:rtl;line-height:2.2;margin:0.4rem 0;"></div>
                    <div id="routineDailyTranslation" style="font-family:var(--font-text);font-size:0.88rem;color:var(--text-muted);font-style:italic;line-height:1.6;"></div>
                    <div id="routineDailyPrompt" style="margin-top:10px;font-size:0.7rem;color:var(--text-subtle);letter-spacing:1px;text-transform:uppercase;">Tap to expand translation &amp; references ↓</div>
                </div>
                <div id="routineDailyExtra" style="display:none;margin-top:10px;padding:12px;background:rgba(46,196,122,0.08);border:1px solid rgba(46,196,122,0.18);border-radius:var(--radius-md);"></div>
                <div class="routine-item">
                    <div class="routine-time">🌅 MORNING (After Fajr)</div>
                    <div class="routine-desc">
                        1. <span class="dua-ref" onclick="scrollToDua(2);closeRoutine()">Ayatul Kursi</span><br>
                        2. <span class="dua-ref" onclick="scrollToDua(6);closeRoutine()">3 Quls (3x each)</span><br>
                        3. <span class="dua-ref" onclick="scrollToDua(12);closeRoutine()">Bismillah Protection (3x)</span><br>
                        4. <span class="dua-ref" onclick="scrollToDua(16);closeRoutine()">Sayyid al-Istighfar</span><br>
                        5. <span class="dua-ref" onclick="scrollToDua(14);closeRoutine()">Contentment with Allah (3x)</span><br>
                        6. <span class="dua-ref" onclick="scrollToDua(35);closeRoutine()">Hasbiyallah (7x)</span><br>
                        7. <span class="dua-ref" onclick="scrollToDua(38);closeRoutine()">Beneficial Knowledge</span><br>
                        8. <span class="dua-ref" onclick="scrollToDua(34);closeRoutine()">Morning Remembrance</span>
                    </div>
                </div>
                <div class="routine-item">
                    <div class="routine-time">🌇 EVENING (After Asr/Maghrib)</div>
                    <div class="routine-desc">
                        Same as morning adhkar, plus:<br>
                        • <span class="dua-ref" onclick="scrollToDua(23);closeRoutine()">Asking for 'Afiyah</span><br>
                        • <span class="dua-ref" onclick="scrollToDua(48);closeRoutine()">Protection from Four Evils</span>
                    </div>
                </div>
                <div class="routine-item">
                    <div class="routine-time">🕌 IN EVERY PRAYER</div>
                    <div class="routine-desc">
                        • <span class="dua-ref" onclick="scrollToDua(1);closeRoutine()">Al-Fatiha</span><br>
                        • <span class="dua-ref" onclick="scrollToDua(13);closeRoutine()">Four Refuges (before salam)</span><br>
                        • <span class="dua-ref" onclick="scrollToDua(7);closeRoutine()">Rabbana Atina</span><br>
                        • <span class="dua-ref" onclick="scrollToDua(46);closeRoutine()">Ibrahimic Salawat</span>
                    </div>
                </div>
                <div class="routine-item">
                    <div class="routine-time">🌙 BEFORE SLEEP</div>
                    <div class="routine-desc">
                        1. <span class="dua-ref" onclick="scrollToDua(2);closeRoutine()">Ayatul Kursi</span><br>
                        2. <span class="dua-ref" onclick="scrollToDua(6);closeRoutine()">3 Quls (Blow & Wipe 3x)</span><br>
                        3. <span class="dua-ref" onclick="scrollToDua(5);closeRoutine()">Last 2 Verses of Al-Baqarah</span><br>
                        4. <span class="dua-ref" onclick="scrollToDua(49);closeRoutine()">Sleep Dua</span><br>
                        5. <span class="dua-ref" onclick="scrollToDua(36);closeRoutine()">Tahlil (before sleeping)</span>
                    </div>
                </div>
                <div class="routine-item">
                    <div class="routine-time">📿 DAILY DHIKR</div>
                    <div class="routine-desc">
                        • <span class="dua-ref" onclick="scrollToDua(36);closeRoutine()">Tahlil 100x</span> — Use the Tasbeeh counter<br>
                        • SubhanAllah 33x, Alhamdulillah 33x, Allahu Akbar 34x after each prayer<br>
                        • <span class="dua-ref" onclick="scrollToDua(19);closeRoutine()">Ya Muqallibal Qulub</span> — as often as possible
                    </div>
                </div>`;
        }
        // clear any previously shown extra details
        const extra = rp.querySelector('#routineDailyExtra');
        const prompt = rp.querySelector('#routineDailyPrompt');
        if (extra) {
            extra.innerHTML = '';
            extra.style.display = 'none';
        }
        if (prompt) {
            prompt.textContent = 'Tap to expand translation & references ↓';
        }

        rp.classList.add('active');
        lockScroll();
        setBottomNavActive('routine');
        loadRoutineDailyDua();
        const closeBtn = rp.querySelector('.etiquette-close');
        if (closeBtn) closeBtn.focus();
    };

    window.closeRoutine = function() {
        const rp = document.querySelector('.routine-panel');
        if (rp) rp.classList.remove('active');
        unlockScroll();
        setBottomNavActive('home');
    };

    // ===== SHARE =====
    window.sharePage = function() {
        if (navigator.share) {
            navigator.share({
                title: 'Essential Duas by فلاح',
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
        const text = `${title}\n\n${arabic}\n\nFrom: Essential Duas by فلاح\n${window.location.href}`;
        if (navigator.share) {
            navigator.share({ title: title, text: text });
        } else {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Dua copied to clipboard');
            }).catch(() => showToast('Failed to copy'));
        }
    };

    // ===== UTILITIES =====
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
    }
    window.updateStats = updateStats;

    function showToast(msg) {
        // toast lives after the <script> tag, so cache it lazily on first use
        if (!els.toast) els.toast = document.getElementById('toast');
        if (!els.toast) return;
        els.toast.innerText = msg;
        els.toast.classList.add('show');
        setTimeout(() => els.toast.classList.remove('show'), 3000);
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
        if (card && arabicEl) {
            arabicEl.innerText = card.querySelector('.arabic-text').innerText;
            transEl.innerText = card.querySelector('.translation').innerText.substring(0, 80) + '...';
        }
    }

        // ===== RANDOM DUA =====
    window.showRandomDua = function() {
        const visibleCards = Array.from(els.cards).filter(c => 
            !c.classList.contains('hidden-card') && c.style.display !== 'none'
        );
        if (visibleCards.length === 0) {
            showToast('No duas available');
            return;
        }

        const randomCard = visibleCards[Math.floor(Math.random() * visibleCards.length)];

        // Collapse all first
        els.cards.forEach(card => {
            card.classList.remove('expanded');
            const header = card.querySelector('.card-header');
            if (header) header.setAttribute('aria-expanded', 'false');
        });

        // Expand random card
        randomCard.classList.add('expanded');
        const header = randomCard.querySelector('.card-header');
        if (header) header.setAttribute('aria-expanded', 'true');

        setTimeout(() => {
            randomCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

        randomCard.classList.add('random-glow');
        randomCard.style.borderColor = 'var(--emerald-light)';
        randomCard.style.boxShadow = '0 0 25px rgba(46, 196, 122, 0.2)';

        setTimeout(() => {
            randomCard.classList.remove('random-glow');
            randomCard.style.borderColor = '';
            randomCard.style.boxShadow = '';
        }, 3000);

        const duaNum = randomCard.querySelector('.dua-number').textContent;
        const duaTitle = randomCard.querySelector('.dua-title').textContent.substring(0, 40);
        showToast(`🎲 Dua #${duaNum}: ${duaTitle}...`);
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
        runTabFadeTransition(document.getElementById('mainContainer'));

        // Update active state
        document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Close all panels first
        const tp = document.querySelector('.tasbeeh-panel.active');
        if (tp) { tp.classList.remove('active'); unlockScroll(); }

        const ep = document.querySelector('.etiquette-panel.active');
        if (ep) { ep.classList.remove('active'); unlockScroll(); }

        const rp = document.querySelector('.routine-panel.active');
        if (rp) { rp.classList.remove('active'); unlockScroll(); }

        const pp = document.querySelector('.prayer-panel.active');
        if (pp) { pp.classList.remove('active'); unlockScroll(); }

        const bp = document.getElementById('bookmarksPanel');
        const ov = document.querySelector('.overlay');
        if (bp && bp.classList.contains('active')) {
            bp.classList.remove('active');
            if (ov) ov.classList.remove('active');
            unlockScroll();
        }

        // Now open the requested panel
        switch (action) {
                      case 'home':
                backToCategories();
                break;
            case 'routine':
                setTimeout(() => openRoutine(), 50);
                break;
            case 'tasbeeh':
                setTimeout(() => openTasbeeh(), 50);
                break;
            case 'saved':
                setTimeout(() => {
                    // Force open bookmarks (not toggle)
                    let panel = document.getElementById('bookmarksPanel');
                    if (!panel) {
                        const div = document.createElement('div');
                        div.id = 'bookmarksPanel';
                        div.className = 'side-panel';
                        div.innerHTML = `
                            <div class="panel-header">
                                <div class="panel-title">Your Saved Duas</div>
                                <button class="panel-close" onclick="toggleBookmarksPanel()">✕</button>
                            </div>
                            <div id="bookmarkListContainer"></div>`;
                        document.body.appendChild(div);
                    }
                    renderBookmarksPanel();
                    document.getElementById('bookmarksPanel').classList.add('active');
                    let overlay = document.querySelector('.overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.className = 'overlay';
                        overlay.onclick = toggleBookmarksPanel;
                        document.body.appendChild(overlay);
                    }
                    overlay.classList.add('active');
                    lockScroll();
                }, 50);
                break;
            case 'prayer':
                setTimeout(() => openPrayer(), 50);
                break;
        }
    };

    // ===== PROGRESS PANEL =====
    window.openProgress = function() {
        let pp = document.querySelector('.progress-panel');
        if (!pp) {
            pp = document.createElement('div');
            pp.className = 'progress-panel';
            pp.setAttribute('onclick', 'if(event.target===this) closeProgress()');
            pp.innerHTML = `
                <button class="etiquette-close" onclick="closeProgress()">✕</button>
                <div class="progress-panel-content" id="progressPanelContent"></div>`;
            document.body.appendChild(pp);
        }
        enhanceAccessibility();
        renderProgressPanel();
        pp.classList.add('active');
        lockScroll();
    };

    window.closeProgress = function() {
        const pp = document.querySelector('.progress-panel');
        if (pp) pp.classList.remove('active');
        unlockScroll();
    };

    function renderProgressPanel() {
        const container = document.getElementById('progressPanelContent');
        if (!container) return;

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
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
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
            const label = cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ');
            catBarsHTML += `<div class="progress-category-bar">
                <div class="progress-cat-label">${label}</div>
                <div class="progress-cat-bar"><div class="progress-cat-fill" style="width:${pct}%;background:${catColors[cat] || '#2ec47a'}"></div></div>
                <div class="progress-cat-count">${count}/${catTotal}</div>
            </div>`;
        });

        // Achievements
        const achievements = [
            { icon: '🌱', name: 'First Step', earned: readCount >= 1, desc: 'Read your first dua' },
            { icon: '📖', name: 'Bookworm', earned: bookmarkCount >= 5, desc: 'Bookmark 5 duas' },
            { icon: '🔥', name: 'On Fire', earned: STATE.streak >= 3, desc: '3-day streak' },
            { icon: '⭐', name: 'Dedicated', earned: STATE.streak >= 7, desc: '7-day streak' },
            { icon: '🌍', name: 'Explorer', earned: catSet.size >= 7, desc: 'Explore 7 categories' },
            { icon: '💪', name: 'Halfway', earned: readCount >= 32, desc: 'Read 32+ duas' },
            { icon: '🏆', name: 'Crown Master', earned: readCount >= 63, desc: 'All 63 duas' },
            { icon: '🔮', name: 'Scholar', earned: catSet.size >= 14, desc: 'All 14 categories' },
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
        if (readCount >= 55) milestone = '🏆 Completed the entire Crown Collection!';
        else if (readCount >= 40) milestone = '⭐ Almost there \u2014 a true seeker of knowledge!';
        else if (readCount >= 25) milestone = '💪 Halfway champion \u2014 keep going!';
        else if (readCount >= 10) milestone = '🌱 Growing beautifully \u2014 10+ duas learned!';
        else if (readCount >= 1) milestone = '✨ The journey of a thousand miles begins with one step.';
        else milestone = '📖 Start your journey \u2014 tap "Mark Read" on any dua!';

        container.innerHTML = `
            <h2>Your Journey</h2>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">📖</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">Duas Read</div>
                    <div class="progress-stat-value">${readCount} / ${total}</div>
                    <div class="progress-bar-visual">
                        <div class="progress-bar-fill" style="width:${readPct}%"></div>
                    </div>
                    <div class="progress-stat-sub">${readPct}% complete</div>
                </div>
            </div>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">🔥</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">Current Streak</div>
                    <div class="progress-stat-value">${STATE.streak} days</div>
                    <div class="progress-stat-sub">Total days active: ${totalDays}</div>
                </div>
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">This Week</div>
                <div class="progress-week-grid">${weekHTML}</div>
            </div>

            <div class="progress-stat-card">
                <div class="progress-stat-icon">\u2b50</div>
                <div class="progress-stat-info">
                    <div class="progress-stat-label">Bookmarked</div>
                    <div class="progress-stat-value">${bookmarkCount}</div>
                    <div class="progress-stat-sub">Your favourite duas saved for quick access</div>
                </div>
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">Category Breakdown</div>
                ${catBarsHTML}
            </div>

            <div class="progress-stat-card" style="flex-direction:column;">
                <div class="progress-stat-label" style="margin-bottom:8px;">Achievements (${earnedCount}/${achievements.length})</div>
                <div class="progress-achievements">${achieveHTML}</div>
            </div>

            <div class="progress-stat-card" style="text-align:center;justify-content:center;flex-direction:column;">
                <div style="font-size:1.2rem;margin-bottom:8px;">${milestone}</div>
            </div>
            <button class="progress-reset-btn" onclick="if(confirm('Reset all reading progress? Bookmarks will be kept.')) { STATE.read=[]; localStorage.setItem('crown_read',JSON.stringify([])); document.querySelectorAll('.dua-card').forEach(c=>{c.classList.remove('read-card');const b=c.querySelector('.action-btn[onclick*=markRead]');if(b){b.classList.remove('read');b.innerHTML='\u2713 Mark Read';}}); updateStats(); renderProgressPanel(); showToast('Progress reset'); }">\u26a0 Reset Reading Progress</button>

            <button class="progress-share-btn" onclick="shareProgress()">📤 Share Your Progress</button>
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
                <div style="font-family:'Playfair Display',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#2ec47a;margin-bottom:6px;">Essential Duas by فلاح</div>
                <div style="font-family:'Playfair Display',serif;font-size:16px;letter-spacing:2px;text-transform:uppercase;color:#e0eccc;font-weight:600;">My Journey</div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:16px;">
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${readCount}<span style="font-size:14px;color:rgba(224,238,210,0.5);">/${total}</span></div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(224,238,210,0.5);margin-top:4px;">Duas Read</div>
                </div>
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${streak}</div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(224,238,210,0.5);margin-top:4px;">Day Streak</div>
                </div>
                <div style="flex:1;background:rgba(46,196,122,0.06);border:1px solid rgba(46,196,122,0.12);border-radius:14px;padding:16px;text-align:center;">
                    <div style="font-family:'Playfair Display',serif;font-size:24px;color:#d4af37;">${bookmarkCount}</div>
                    <div style="font-family:'Playfair Display',serif;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(224,238,210,0.5);margin-top:4px;">Saved</div>
                </div>
            </div>
            ${earned ? `<div style="text-align:center;font-size:1.4rem;margin-bottom:12px;letter-spacing:4px;">${earned}</div>` : ''}
            <div style="text-align:center;font-family:'Playfair Display',serif;font-size:14px;color:rgba(224,238,210,0.85);margin-bottom:16px;">${milestone}</div>
            <div style="display:flex;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(46,196,122,0.1);">
                <span style="font-family:'Playfair Display',serif;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(160,210,180,0.55);">${readPct}% Complete</span>
                <span style="font-family:'Playfair Display',serif;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(160,210,180,0.35);">فلاح · mohhp.github.io/Essential-duas</span>
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
                            text: 'From Essential Duas by فلاح'
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
        1: { ayahs: ['1:1-7'] },
        2: { ayahs: ['2:255'] },
        3: { ayahs: ['21:87'] },
        4: { ayahs: ['17:24'] },
        5: { ayahs: ['2:285-286'] },
        6: { ayahs: ['112:1-4', '113:1-5', '114:1-6'] },
        7: { ayahs: ['2:201'] },
        8: { ayahs: ['3:8'] },
        9: { ayahs: ['7:23'] },
        10: { ayahs: ['20:114'] },
        29: { ayahs: ['20:25-28'] },
        30: { ayahs: ['14:40'] },
        31: { ayahs: ['27:19'] },
        32: { ayahs: ['21:83'] },
        33: { ayahs: ['3:38'] },
        35: { ayahs: ['9:129'] },
        40: { ayahs: ['14:41'] },
        50: { ayahs: ['43:13-14'] },
        52: { ayahs: ['3:147'] },
        62: { ayahs: ['113:1-5'] },
        63: { ayahs: ['18:39'] }
    };

    const AYAH_AUDIO_CACHE = new Map();
    let activeAudioSession = null;

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
        const resp = await fetch(`https://api.alquran.cloud/v1/ayah/${ayahKey}/ar.alafasy`);
        if (!resp.ok) throw new Error('Audio lookup failed');
        const json = await resp.json();
        const url = json?.data?.audio;
        if (!url) throw new Error('Audio URL missing');
        AYAH_AUDIO_CACHE.set(ayahKey, url);
        return url;
    }

    async function getPlaylistForDua(id) {
        const source = DUA_AUDIO_SOURCES[id];
        if (!source) return [];
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
        const btn = player?.querySelector('.audio-btn');
        if (!btn) return;

        if (activeAudioSession && activeAudioSession.duaId === duaId && activeAudioSession.player === player) {
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
            const playlist = await getPlaylistForDua(duaId);
            if (!playlist.length) {
                player.remove();
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
                duaId,
                player,
                get audio() { return audio; },
                get preloadedAudio() { return preloadedAudio; }
            };
            loadTrack(0);
        } catch (error) {
            setAudioPlayerState(player, 'idle');
            player.remove();
        }
    }

    function injectAudioButtons() {
        document.querySelectorAll('.copy-row').forEach(row => {
            const card = row.closest('.dua-card');
            if (!card) return;
            const id = parseInt(card.getAttribute('data-id'), 10);
            if (!DUA_AUDIO_SOURCES[id]) return;
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
            btn.addEventListener('click', () => playDuaAudio(id, player));
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
        if (!extra || !card) return;
        if (extra.innerHTML.trim()) {
            extra.innerHTML = '';
            extra.style.display = 'none';
            if (prompt) prompt.textContent = 'Tap to expand translation & references ↓';
        } else {
            // Extract plain text to avoid copying structural HTML that may render differently
            const transText = card.querySelector('.translation')?.textContent?.trim() || '';
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
            if (prompt) prompt.textContent = 'Tap to hide details ↑';
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
        showToast(isLight ? 'Dark Mode' : 'Light Mode');
    };

    // ===== NAV OVERFLOW MENU =====
    function positionNavOverflowMenu() {
        const menu = document.getElementById('navOverflowMenu');
        if (!menu || !menu.classList.contains('open')) return;

        menu.style.left = '';
        menu.style.right = '';

        const viewportPadding = 4;
        let rect = menu.getBoundingClientRect();

        if (rect.right > (window.innerWidth - viewportPadding)) {
            menu.style.right = 'auto';
            menu.style.left = '0';
            rect = menu.getBoundingClientRect();
        }

        if (rect.left < viewportPadding) {
            menu.style.left = `${viewportPadding}px`;
        }
    }

    window.toggleNavOverflow = function(e) {
        e.stopPropagation();
        const menu = document.getElementById('navOverflowMenu');
        const btn = document.getElementById('navOverflowBtn');
        const isOpen = menu.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
        if (isOpen) {
            requestAnimationFrame(positionNavOverflowMenu);
        } else {
            menu.style.left = '';
            menu.style.right = '';
        }
    };
    window.closeNavOverflow = function() {
        const menu = document.getElementById('navOverflowMenu');
        const btn = document.getElementById('navOverflowBtn');
        if (menu) {
            menu.classList.remove('open');
            menu.style.left = '';
            menu.style.right = '';
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
    };

    window.addEventListener('resize', positionNavOverflowMenu);
    window.addEventListener('orientationchange', positionNavOverflowMenu);

    document.addEventListener('click', function(e) {
        const menu = document.getElementById('navOverflowMenu');
        const btn = document.getElementById('navOverflowBtn');
        if (menu && !menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('open');
            menu.style.left = '';
            menu.style.right = '';
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    });

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
                : `Card ${currentNum} of ${totalNum}`;
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
        renderFlashcard();
        showToast(isPashtoMode() ? 'د حفظ فلشکارډ حالت فعال شو' : 'Flashcard memorization mode enabled');
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
            btn.textContent = due > 0 ? `🧠 Memorize (${due} due)` : '🧠 Memorize';
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
                    badge.textContent = 'Review Due';
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
        if (brandName) brandName.textContent = isPS ? 'لازمي دعاګانې' : 'Essential Duas';

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
                            text: isPS ? 'له لازمي دعاګانو څخه' : 'From Essential Duas'
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
            <div class="word-popup-root-label">ROOT LETTERS</div>
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
    const REMINDER_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const REMINDER_AUDIO_FILES = {
        adhan: 'audio/adhan-alert.wav',
        tone: 'audio/notification-tone.wav'
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

    let prayerTimesData = null;
    let countdownInterval = null;
    let compassWatchId = null;
    let userQibla = null;
    let reminderSettings = null;
    let reminderAudio = { adhan: null, tone: null };
    let reminderMidnightTimer = null;
    let dailyReminderRescheduleTimeout = null;
    let isGpsResolving = false;
    let detectedGpsCityKey = null;
    let compassEventTimer = null;
    let latestCompassHeading = null;
    let currentNeedleRotation = 0;

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
        const fallback = { provinceEn: city.en, provincePs: city.ps || city.en, regionEn: 'Afghanistan', regionPs: 'افغانستان' };
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
        if (!q) return AFGHAN_CITIES.slice();

        return AFGHAN_CITIES
            .map((city) => {
                const meta = getCityMeta(city);
                const searchFields = [
                    normalizeCityText(city.en),
                    normalizeCityText(city.ps),
                    normalizeCityText(city.key),
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
            .sort((a, b) => a.score - b.score)
            .map(entry => entry.city);
    }

    function preloadPrayerReminderAudio() {
        Object.entries(REMINDER_AUDIO_FILES).forEach(([key, src]) => {
            if (reminderAudio[key]) return;
            const audio = new Audio(src);
            audio.preload = 'metadata';
            reminderAudio[key] = audio;
        });
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
            searchPlaceholder: isPS ? 'د افغانستان ښار ولټوئ...' : 'Search Afghan city...',
            searchPlaceholderDual: isPS ? 'ښار ولټوئ... / Search city...' : 'Search city... / ښار ولټوئ...',
            countryLabel: isPS ? '🇦🇫 افغانستان' : '🇦🇫 Afghanistan',
            gpsOption: isPS ? '📍 زما موقعیت وکاروئ' : '📍 Use My Location',
            gpsDetecting: isPS ? 'ستاسې موقعیت معلومېږي...' : 'Detecting your location...',
            gpsDetected: isPS ? 'GPS وموندل شو' : 'GPS detected',
            noMatches: isPS ? 'برابر ښار ونه موندل شو' : 'No matches',
            now: isPS ? (psUI?.now || 'اوس') : 'NOW',
            next: isPS ? (psUI?.next || 'بل') : 'NEXT',
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
            testReminder: isPS ? (psUI?.testReminder || 'د یادونې ازمويښت') : 'Test Reminder',
            testReminderBody: isPS ? (psUI?.testReminderBody || 'دا د {prayer} لپاره ازمویښتي یادونه ده') : 'This is a sample reminder for {prayer}',
            preReminderBody: isPS ? (psUI?.preReminderBody || 'د {prayer} لمونځ به په {minutes} دقیقو کې وي') : '{minutes} min until {prayer} prayer',
            atTimeBody: isPS ? (psUI?.atTimeBody || 'د {prayer} لمانځه وخت شو') : "It's time for {prayer} prayer",
            alertsEnabled: isPS ? (psUI?.alertsEnabled || 'د لمونځ خبرتیاوې فعالې شوې') : 'Prayer alerts enabled',
            alertsDisabled: isPS ? (psUI?.alertsDisabled || 'د لمونځ خبرتیاوې غیر فعالې شوې') : 'Prayer alerts disabled',
            alertsPermissionDenied: isPS ? (psUI?.alertsPermissionDenied || 'د خبرتیا اجازه رد شوه') : 'Notification permission denied',
            alertsUnsupported: isPS ? (psUI?.alertsUnsupported || 'خبرتیاوې نه ملاتړ کوي') : 'Notifications not supported',
            reminderSet: isPS ? 'یادونه وټاکل شوه: {prayer} {time}' : 'Reminder set for {prayer} at {time}',
            reminderSaved: isPS ? 'د یادونې تنظیمات خوندي شول' : 'Reminder settings saved',
            inAppPrayerAlert: isPS ? 'د {prayer} لمانځه وخت شو' : 'It is time for {prayer}',
            qiblaFacing: isPS ? 'ماشاءالله! تاسو قبلې ته برابر یاست.' : 'MashaAllah! You are facing Qibla.',
            qiblaAlmost: isPS ? 'نږدې یاست — {delta}° توپیر' : 'Almost there — {delta}° off',
            qiblaRotateHint: isPS ? 'موبایل وڅرخوئ — ستنه د قبلې نښې ته برابره کړئ' : 'Rotate phone until needle aligns with Qibla marker',
            qiblaNeedleHint: isPS ? 'موبایل مو هوار ونیسئ او ورو یې وڅرخوئ' : 'Hold your phone flat and rotate gently',
            change: isPS ? 'بدل' : 'Change',
            noCitySelected: isPS ? 'ښار نه دی ټاکل شوی' : 'No city selected'
        };
    }

    function localizeDigits(value) {
        const raw = String(value);
        if (!isPashtoMode()) return raw;
        if (typeof toPashtoDigits === 'function') return toPashtoDigits(raw);
        return raw;
    }

    function getReminderDefaults() {
        return {
            enabled: false,
            mode: 'tone',
            offsetMinutes: 0,
            prayers: {
                fajr: true,
                dhuhr: true,
                asr: true,
                maghrib: true,
                isha: true
            }
        };
    }

    function loadReminderSettings() {
        if (reminderSettings) return reminderSettings;
        const defaults = getReminderDefaults();
        try {
            const raw = JSON.parse(localStorage.getItem('crown_prayer_reminders') || 'null');
            reminderSettings = {
                enabled: !!raw?.enabled,
                mode: ['adhan', 'tone', 'silent'].includes(raw?.mode) ? raw.mode : defaults.mode,
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

        const modeSelect = document.getElementById('reminderSoundMode');
        if (modeSelect) modeSelect.value = settings.mode;

        const beforeSelect = document.getElementById('reminderBefore');
        if (beforeSelect) beforeSelect.value = String(settings.offsetMinutes);
    }

    function refreshReminderControlLanguage() {
        const uiText = getPrayerUiText();
        const sectionTitle = document.getElementById('reminderSettingsTitle');
        const masterLabel = document.getElementById('reminderMasterLabel');
        const soundLabel = document.getElementById('reminderSoundLabel');
        const beforeLabel = document.getElementById('reminderBeforeLabel');
        const testBtn = document.getElementById('reminderTestBtn');

        if (sectionTitle) sectionTitle.textContent = uiText.reminderSettingsTitle;
        if (masterLabel) masterLabel.textContent = uiText.reminderMaster;
        if (soundLabel) soundLabel.textContent = uiText.reminderSound;
        if (beforeLabel) beforeLabel.textContent = uiText.reminderBefore;
        if (testBtn) testBtn.textContent = uiText.testReminder;

        const modeSelect = document.getElementById('reminderSoundMode');
        if (modeSelect) {
            const adhanOpt = modeSelect.querySelector('option[value="adhan"]');
            const toneOpt = modeSelect.querySelector('option[value="tone"]');
            const silentOpt = modeSelect.querySelector('option[value="silent"]');
            if (adhanOpt) adhanOpt.textContent = uiText.soundAdhan;
            if (toneOpt) toneOpt.textContent = uiText.soundTone;
            if (silentOpt) silentOpt.textContent = uiText.soundSilent;
        }

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
            if (label) label.textContent = getPrayerLabel(name);
        });

        const instruction = document.getElementById('qiblaInstruction');
        if (instruction) {
            instruction.textContent = getPrayerUiText().qiblaNeedleHint;
        }

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
                settings.prayers[name] = input.checked;
                saveReminderSettings();
                if (input.checked) requestNotificationPermissionIfNeeded();
                if (settings.enabled) {
                    requestNotificationPermissionIfNeeded().then((granted) => {
                        if (granted) {
                            schedulePrayerNotifications();
                            showReminderSetConfirmation(name);
                        }
                    });
                } else {
                    showToast(getPrayerUiText().reminderSaved);
                }
                syncReminderUi();
            });
        });

        const modeSelect = document.getElementById('reminderSoundMode');
        if (modeSelect) {
            modeSelect.addEventListener('change', () => {
                const settings = loadReminderSettings();
                settings.mode = modeSelect.value;
                saveReminderSettings();
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

        const testBtn = document.getElementById('reminderTestBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                runReminderTest();
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
            const match = AFGHAN_CITIES.find(c => c.key === loc.cityKey);
            if (match) {
                input.value = getCityDisplayName(match);
                const meta = getCityMeta(match);
                const province = isPashtoMode() ? meta.provincePs : meta.provinceEn;
                const cityText = `${getCityDisplayName(match)} · ${province}`;
                setSelectedCityChip(cityText);
                input.title = uiText.changeLocationTitle;
                return;
            }
        }
        const fallback = loc?.city || (typeof loc?.lat === 'number' && typeof loc?.lng === 'number' ? `${loc.lat.toFixed(2)}°, ${loc.lng.toFixed(2)}°` : uiText.noCitySelected);
        input.value = fallback;
        setSelectedCityChip(fallback);
        input.title = uiText.changeLocationTitle;
    }

    function renderCityDropdown(query = '') {
        const dropdown = document.getElementById('cityDropdown');
        const shell = document.getElementById('citySearchShell');
        if (!dropdown) return;

        const list = findCityMatches(query);
        if (shell) shell.setAttribute('aria-expanded', 'true');

        const uiText = getPrayerUiText();

        const grouped = new Map();
        list.forEach((city) => {
            const meta = getCityMeta(city);
            const groupLabel = isPashtoMode() ? meta.regionPs : meta.regionEn;
            if (!grouped.has(groupLabel)) grouped.set(groupLabel, []);
            grouped.get(groupLabel).push(city);
        });

        const groupedRows = Array.from(grouped.entries()).map(([groupName, cities]) => {
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

            return `
                <div class="city-region-head">${escapeHtml(groupName)}</div>
                ${cityRows}
            `;
        }).join('');

        const gpsStatusText = isGpsResolving
            ? `<span class="gps-loading" aria-hidden="true"></span><span>${uiText.gpsDetecting}</span>`
            : `<span>📍</span><span>${uiText.gpsOption}</span>`;

        const detectedLabel = detectedGpsCityKey
            ? (() => {
                const city = AFGHAN_CITIES.find(item => item.key === detectedGpsCityKey);
                if (!city) return '';
                return `<div class="city-country-head">✅ ${uiText.gpsDetected}: ${escapeHtml(getCityDisplayName(city))}</div>`;
            })()
            : '';

        dropdown.innerHTML = `
            <button class="city-option gps-option" type="button" data-city-key="__gps__" role="option">${gpsStatusText}</button>
            <div class="city-country-head">${uiText.countryLabel}</div>
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

    function selectAfghanCity(city) {
        if (!city) return;
        const loc = {
            lat: city.lat,
            lng: city.lng,
            city: city.en,
            cityKey: city.key,
            country: 'Afghanistan'
        };
        localStorage.setItem('crown_location', JSON.stringify(loc));
        closeCityDropdown();
        onLocationReady(loc.lat, loc.lng, loc.city);
    }

    function initCitySelector() {
        const input = document.getElementById('citySearchInput');
        const dropdown = document.getElementById('cityDropdown');
        const changeBtn = document.getElementById('selectedCityChange');
        if (!input || !dropdown || input.dataset.boundCitySelector === '1') return;

        const uiText = getPrayerUiText();
        input.placeholder = uiText.searchPlaceholderDual;

        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                input.focus();
                renderCityDropdown(input.value || '');
                openCityDropdown();
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
            const city = AFGHAN_CITIES.find(c => c.key === cityKey);
            if (city) selectAfghanCity(city);
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
        }

        const cached = localStorage.getItem('crown_location');
        if (cached) {
            const loc = JSON.parse(cached);
            updateCityInputFromLocation(loc);
        }
        if (document.getElementById('cityDropdown')?.classList.contains('open')) {
            renderCityDropdown(input.value || '');
        }
    };

    window.refreshPrayerLanguage = function() {
        const uiText = getPrayerUiText();
        const label = document.querySelector('.prayer-countdown-label');
        if (label) label.textContent = uiText.nextPrayer;

        const title = document.querySelector('.prayer-panel-content h2');
        if (title) title.textContent = isPashtoMode() ? ((typeof PS_UI !== 'undefined' && PS_UI.prayerTimesTitle) ? PS_UI.prayerTimesTitle : 'د لمونځ وختونه') : 'Prayer Times';

        renderPrayerGrid();
        updateCountdown();
        refreshReminderControlLanguage();
        syncReminderUi();
        const ring = document.getElementById('qiblaDegreeRing');
        if (ring) ring.dataset.built = '0';
        buildQiblaDegreeRing();
        if (typeof window.refreshCitySelectorLanguage === 'function') window.refreshCitySelectorLanguage();
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
        if (pp) pp.classList.add('active');
        lockScroll();
        setBottomNavActive('prayer');
        const closeBtn = pp?.querySelector('.etiquette-close');
        if (closeBtn) closeBtn.focus();
        initReminderControls();
        initCitySelector();
        preloadPrayerReminderAudio();
        if (typeof window.refreshPrayerLanguage === 'function') window.refreshPrayerLanguage();
        renderPrayerSkeleton();
        // Auto-detect location if not cached
        const cached = localStorage.getItem('crown_location');
        if (cached) {
            const loc = JSON.parse(cached);
            onLocationReady(loc.lat, loc.lng, loc.city || '');
        } else {
            setSelectedCityChip(getPrayerUiText().noCitySelected);
            requestLocation();
        }
    };

    window.closePrayer = function() {
        const pp = document.querySelector('.prayer-panel');
        if (pp) pp.classList.remove('active');
        unlockScroll();
        setBottomNavActive('home');
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
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
                    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`);
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
                onLocationReady(lat, lng, city);
                if (document.getElementById('cityDropdown')?.classList.contains('open')) {
                    renderCityDropdown(cityInput?.value || '');
                }
            },
            (err) => {
                isGpsResolving = false;
                clearPrayerSkeleton();
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
        isGpsResolving = false;

        calculateAndRenderPrayers(lat, lng);
        calculateQibla(lat, lng);
        initCompass();
        loadReminderSettings();
        syncReminderUi();
        if (loadReminderSettings().enabled) schedulePrayerNotifications();
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
    }

    function renderPrayerGrid() {
        const grid = document.getElementById('prayerTimesGrid');
        if (!grid || !prayerTimesData) return;

        const now = new Date();
        const current = getCurrentPrayer(now);
        const next = getNextPrayer(now);

        grid.innerHTML = PRAYER_NAMES.map(name => {
            const time = prayerTimesData[name];
            const timeStr = formatTime(time);
            const isCurrent = current === name;
            const isNext = next === name;
            const cls = isCurrent ? ' current-prayer' : isNext ? ' next-prayer' : '';
            const uiText = getPrayerUiText();
            return `<div class="prayer-time-row${cls}">
                <span class="prayer-time-icon">${PRAYER_ICONS[name]}</span>
                <span class="prayer-time-name">${getPrayerLabel(name)}</span>
                <span class="prayer-time-value">${timeStr}</span>
                ${isCurrent ? `<span class="prayer-now-badge">${uiText.now}</span>` : ''}
                ${isNext ? `<span class="prayer-next-badge">${uiText.next}</span>` : ''}
            </div>`;
        }).join('');
    }

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
        }
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
        return `${hText}:${mText} ${ampm}`;
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
        buildQiblaDegreeRing();

        const degEl = document.getElementById('qiblaDegree');
        const statusEl = document.getElementById('qiblaStatus');
        const qiblaRounded = Math.round(qibla);
        const uiText = getPrayerUiText();
        if (degEl) {
            degEl.textContent = isPashtoMode()
                ? `${localizeDigits(qiblaRounded)}° له شماله د قبلې لوری`
                : `Qibla bearing: ${qiblaRounded}° from North`;
        }
        if (statusEl) {
            statusEl.textContent = uiText.qiblaRotateHint;
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
                statusEl.innerHTML = '<button class="selected-city-change" onclick="requestCompassPermission()">Enable Compass</button>';
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

    function requestNotificationPermissionIfNeeded() {
        const uiText = getPrayerUiText();
        if (!('Notification' in window)) {
            showToast(uiText.alertsUnsupported);
            return Promise.resolve(false);
        }

        if (Notification.permission === 'granted') return Promise.resolve(true);
        if (Notification.permission === 'denied') {
            showToast(uiText.alertsPermissionDenied);
            return Promise.resolve(false);
        }

        return Notification.requestPermission()
            .then((permission) => {
                if (permission === 'granted') return true;
                showToast(uiText.alertsPermissionDenied);
                return false;
            })
            .catch(() => {
                showToast(uiText.alertsPermissionDenied);
                return false;
            });
    }

    function sendSystemNotification(title, options) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.ready
                .then((registration) => {
                    if (registration && typeof registration.showNotification === 'function') {
                        return registration.showNotification(title, options);
                    }
                    return new Notification(title, options);
                })
                .catch(() => {
                    new Notification(title, options);
                });
            return;
        }

        new Notification(title, options);
    }

    function playReminderSound(mode) {
        if (mode === 'silent') return;
        const selectedMode = mode === 'adhan' ? 'adhan' : 'tone';
        const src = REMINDER_AUDIO_FILES[selectedMode];
        if (!src) return;

        if (!reminderAudio[selectedMode]) {
            reminderAudio[selectedMode] = new Audio(src);
            reminderAudio[selectedMode].preload = 'auto';
        }

        const audio = reminderAudio[selectedMode];
        try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (error) { /* ignore playback issues */ }
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
        return pt[prayerName] || null;
    }

    function getNextReminderDate(prayerName, offsetMinutes, now) {
        const todayPrayer = prayerTimesData?.[prayerName] || getPrayerTimeForDate(prayerName, now);
        if (todayPrayer) {
            const candidate = new Date(todayPrayer);
            candidate.setMinutes(candidate.getMinutes() - offsetMinutes);
            if (candidate > now) return candidate;
        }

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowPrayer = getPrayerTimeForDate(prayerName, tomorrow);
        if (!tomorrowPrayer) return null;
        const nextCandidate = new Date(tomorrowPrayer);
        nextCandidate.setMinutes(nextCandidate.getMinutes() - offsetMinutes);
        return nextCandidate > now ? nextCandidate : null;
    }

    function showReminderSetConfirmation(prayerName) {
        const settings = loadReminderSettings();
        if (!settings.enabled || !settings.prayers[prayerName]) return;
        const when = getNextReminderDate(prayerName, settings.offsetMinutes, new Date());
        if (!when) return;
        const uiText = getPrayerUiText();
        const message = uiText.reminderSet
            .replace('{prayer}', getPrayerLabel(prayerName))
            .replace('{time}', formatTime(when));
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

    function firePrayerReminder(prayerName, isPreReminder, minutesBefore) {
        console.log('[PrayerReminder] Timer fired', { prayerName, isPreReminder, minutesBefore, at: new Date().toISOString() });
        const uiText = getPrayerUiText();
        const localizedPrayer = getPrayerLabel(prayerName);
        const body = isPreReminder
            ? uiText.preReminderBody
                .replace('{prayer}', localizedPrayer)
                .replace('{minutes}', localizeDigits(minutesBefore))
            : uiText.atTimeBody.replace('{prayer}', localizedPrayer);

        sendSystemNotification(`${PRAYER_ICONS[prayerName]} ${localizedPrayer}`, {
            body,
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: `prayer-${prayerName}-${isPreReminder ? 'before' : 'now'}`,
            renotify: true,
            requireInteraction: false
        });

        const settings = loadReminderSettings();
        playReminderSound(settings.mode);

        if (!document.hidden) {
            showToast(uiText.inAppPrayerAlert.replace('{prayer}', localizedPrayer));
        }
    }

    function runReminderTest() {
        const uiText = getPrayerUiText();
        const settings = loadReminderSettings();
        const samplePrayer = getNextPrayer(new Date()) || 'fajr';
        const localizedPrayer = getPrayerLabel(samplePrayer);
        const body = uiText.testReminderBody.replace('{prayer}', localizedPrayer);

        playReminderSound(settings.mode);

        requestNotificationPermissionIfNeeded().then((granted) => {
            if (!granted) return;
            sendSystemNotification(`${PRAYER_ICONS[samplePrayer]} ${uiText.testReminder}`, {
                body,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                tag: 'prayer-test-reminder',
                renotify: true
            });
        });
    }

    window.togglePrayerNotifications = function(enabled) {
        const settings = loadReminderSettings();
        settings.enabled = !!enabled;
        localStorage.setItem('crown_notifications', settings.enabled ? 'true' : 'false');
        saveReminderSettings();
        syncReminderUi();

        const uiText = getPrayerUiText();
        if (enabled) {
            requestNotificationPermissionIfNeeded().then((granted) => {
                if (!granted) {
                    settings.enabled = false;
                    localStorage.setItem('crown_notifications', 'false');
                    saveReminderSettings();
                    syncReminderUi();
                    clearPrayerNotifications();
                    clearDailyDuaReminder();
                    return;
                }
                schedulePrayerNotifications();
                scheduleDailyDuaReminder();
                showToast(uiText.alertsEnabled);
                showFirstEnabledReminderConfirmation();
            });
        } else {
            clearPrayerNotifications();
            clearDailyDuaReminder();
            showToast(uiText.alertsDisabled);
        }
        initDailyReminderPrompt();
    };

    function scheduleReminderMidnightRefresh() {
        if (reminderMidnightTimer) {
            clearTimeout(reminderMidnightTimer);
            reminderMidnightTimer = null;
        }

        const settings = loadReminderSettings();
        if (!settings.enabled) return;

        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 2, 0);
        const delay = Math.max(1000, nextMidnight - now);
        reminderMidnightTimer = setTimeout(() => {
            const coords = getPrayerCoordinates();
            if (coords) calculateAndRenderPrayers(coords.lat, coords.lng);
            schedulePrayerNotifications();
        }, delay);
    }

    function schedulePrayerNotifications() {
        clearPrayerNotifications();
        const settings = loadReminderSettings();
        if (!settings.enabled) return;

        const now = new Date();
        console.log('[PrayerReminder] Scheduling start', { now: now.toISOString(), offset: settings.offsetMinutes, mode: settings.mode });

        REMINDER_PRAYERS.forEach(name => {
            if (!settings.prayers[name]) return;
            const reminderTime = getNextReminderDate(name, settings.offsetMinutes, now);
            if (!reminderTime) return;

            const delay = reminderTime.getTime() - now.getTime();
            if (delay <= 0 || delay > 172800000) return;

            console.log('[PrayerReminder] Scheduled', {
                prayer: name,
                reminderAt: reminderTime.toISOString(),
                delayMs: delay
            });

            const tid = setTimeout(() => {
                firePrayerReminder(name, settings.offsetMinutes > 0, settings.offsetMinutes);
                schedulePrayerNotifications();
            }, delay);
            notificationTimeouts.push(tid);
        });

        scheduleReminderMidnightRefresh();
    }

    function clearPrayerNotifications() {
        notificationTimeouts.forEach(tid => clearTimeout(tid));
        notificationTimeouts = [];
        if (reminderMidnightTimer) {
            clearTimeout(reminderMidnightTimer);
            reminderMidnightTimer = null;
        }
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
            new Notification('📖 Daily Dua Reminder', {
                body: `Today’s focus: ${title}`,
                icon: 'icon-192.png',
                tag: 'daily-dua-reminder',
                renotify: false
            });
            scheduleDailyDuaReminder();
        }, delay);
    }

    // Re-schedule notifications on visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && localStorage.getItem('crown_notifications') === 'true' && prayerTimesData) {
            loadReminderSettings();
            syncReminderUi();
            schedulePrayerNotifications();
            scheduleDailyDuaReminder();
        }
    });

    // Auto-calculate prayer times on load if location is cached (for time banner enhancement)
    document.addEventListener('DOMContentLoaded', function() {
        const cached = localStorage.getItem('crown_location');
        if (cached && typeof adhan !== 'undefined') {
            const loc = JSON.parse(cached);
            const coordinates = new adhan.Coordinates(loc.lat, loc.lng);
            const params = adhan.CalculationMethod.MuslimWorldLeague();
            params.madhab = adhan.Madhab.Hanafi;
            const pt = new adhan.PrayerTimes(coordinates, new Date(), params);
            prayerTimesData = {
                fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr,
                asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha
            };
            // Schedule notifications if enabled
            if (localStorage.getItem('crown_notifications') === 'true') {
                loadReminderSettings();
                schedulePrayerNotifications();
                scheduleDailyDuaReminder();
            }
        }
    });

    // ===== REGISTER SERVICE WORKER =====
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                showToast('App updated! Refresh for the latest version.');
            }
        });
    }

    // ===== START =====
    document.addEventListener('DOMContentLoaded', init);
