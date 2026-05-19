// =============================================================================
// darkmode.js  —  Dark / light theme toggle
// =============================================================================
//
// Responsibilities
// ─────────────────
//  • Toggle the `dark` class on <body>, which switches all CSS custom-property
//    colour values (see :root / body.dark blocks in style.css).
//  • Persist the user's preference in localStorage so the choice survives
//    page reloads and navigation between pages.
//  • Sync the icon on EVERY element that carries the `theme-btn` class.
//    This supports multiple toggle buttons on the same page at the same time
//    (e.g. one in the desktop top-navbar, another in the mobile status bar,
//    or a third on the data table page header).
//
// Conventions used throughout the codebase
// ──────────────────────────────────────────
//  class="theme-btn"  →  any clickable element that should toggle the theme
//  class="theme-icon" →  any element that should display the sun / moon SVG
//
// No element IDs are used here so the same script works on every page without
// modification, and dynamically inserted buttons are handled automatically via
// event delegation on `document`.
//
(function () {

    // ── Storage key ──────────────────────────────────────────────────────────
    var STORAGE_KEY = 'tempweb:darkmode';

    // ── SVG icons ────────────────────────────────────────────────────────────
    // Sun  → shown when dark mode is ON  (clicking returns to light mode)
    var SVG_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" '
        + 'xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M12 4V2M12 22v-2M4.93 4.93L3.51 3.51M20.49 20.49l-1.42-1.42'
        + 'M4 12H2m20 0h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42" '
        + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
        + 'stroke-linejoin="round"/>'
        + '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" '
        + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // Moon → shown when light mode is ON (clicking switches to dark mode)
    var SVG_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" '
        + 'xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" '
        + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
        + 'stroke-linejoin="round"/></svg>';

    // ── Core logic ───────────────────────────────────────────────────────────

    /**
     * Apply or remove dark mode and sync all theme buttons and icons on the page.
     *
     * @param {boolean} isDark  true = switch to dark mode, false = light mode.
     */
    function applyDark(isDark) {
        // Toggle the CSS class that switches all --variable values in style.css
        document.body.classList.toggle('dark',     isDark);
        // Keep Bootstrap bg utility classes consistent with the active theme
        document.body.classList.toggle('bg-dark',  isDark);
        document.body.classList.toggle('bg-light', !isDark);

        // Update aria-pressed on every toggle button so assistive technology
        // and CSS :not([aria-pressed="true"]) selectors stay accurate.
        document.querySelectorAll('.theme-btn').forEach(function (btn) {
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        });

        // Swap the icon inside every icon placeholder element.
        // Convention: sun ⇒ "I am in dark mode, click to go light",
        //             moon ⇒ "I am in light mode, click to go dark".
        var icon = isDark ? SVG_SUN : SVG_MOON;
        document.querySelectorAll('.theme-icon').forEach(function (el) {
            el.innerHTML = icon;
        });
    }

    /**
     * Persist the user's preference; silently swallows errors that occur in
     * private-browsing modes where localStorage is unavailable.
     *
     * @param {boolean} isDark
     */
    function save(isDark) {
        try { localStorage.setItem(STORAGE_KEY, isDark ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    /**
     * Read the stored preference.
     *
     * @returns {string|null}  '1', '0', or null when nothing is stored.
     */
    function loadStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    // ── Initialisation ───────────────────────────────────────────────────────

    function init() {
        // Resolve initial state: stored value wins; default is light mode.
        var stored = loadStored();
        var isDark = (stored === '1');
        applyDark(isDark);

        // Use event delegation on the document root so that:
        //  a) buttons added after this script runs (dynamic DOM) still work, and
        //  b) the same handler covers buttons on every part of the page.
        document.addEventListener('click', function (e) {
            // Walk up the DOM from the clicked target to find the nearest .theme-btn
            var btn = e.target.closest('.theme-btn');
            if (!btn) return; // click was not on or inside a theme button

            var newState = !document.body.classList.contains('dark');
            applyDark(newState);
            save(newState);
        });
    }

    // Run after the DOM is available so querySelectorAll finds all icons.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
