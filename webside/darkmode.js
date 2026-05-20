/**
 * Dark-mode manager
 * -----------------
 * Applies a `dark` class to <body> and persists the user's preference in
 * localStorage so the theme is consistent across page loads.
 *
 * Two toggle buttons are supported:
 *   #themeButton        — shown on mobile (inside the status card)
 *   #themeButtonDesktop — shown on desktop (inside the top nav bar)
 *
 * Both buttons are kept in sync so toggling one reflects on the other.
 */
(function () {
    const STORAGE_KEY = 'tempweb:darkmode';

    const SVG_SUN  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V2M12 22v-2M4.93 4.93L3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2m20 0h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const SVG_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /**
     * Apply or remove the dark theme and update both toggle buttons.
     * @param {boolean} isDark
     */
    function applyDark(isDark) {
        // Toggle theme class on body (used by CSS custom properties)
        if (isDark) {
            document.body.classList.add('dark');
            document.body.classList.remove('bg-light');
            document.body.classList.add('bg-dark');
        } else {
            document.body.classList.remove('dark');
            document.body.classList.remove('bg-dark');
            document.body.classList.add('bg-light');
        }

        // Sync all toggle buttons (mobile + desktop)
        syncButton('themeButton',        'themeIcon',        isDark);
        syncButton('themeButtonDesktop', 'themeIconDesktop', isDark);
    }

    /**
     * Update a single toggle button's icon and ARIA state.
     * @param {string} btnId
     * @param {string} iconId
     * @param {boolean} isDark
     */
    function syncButton(btnId, iconId, isDark) {
        const btn  = document.getElementById(btnId);
        const icon = document.getElementById(iconId);
        if (icon) icon.innerHTML = isDark ? SVG_SUN : SVG_MOON;
        if (btn)  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }

    /**
     * Persist the current theme preference.
     * @param {boolean} isDark
     */
    function save(isDark) {
        try { localStorage.setItem(STORAGE_KEY, isDark ? '1' : '0'); } catch (e) {}
    }

    /**
     * Read the stored preference; returns null when none is set.
     * @returns {string|null}
     */
    function loadStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    /** Attach a click handler to one toggle button. */
    function bindButton(btnId) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', function () {
            const newState = !document.body.classList.contains('dark');
            applyDark(newState);
            save(newState);
        });
    }

    function init() {
        // Determine initial state from storage; default is light mode
        const stored = loadStored();
        const isDark = stored === '1';

        applyDark(isDark);

        // Bind both buttons
        bindButton('themeButton');
        bindButton('themeButtonDesktop');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
