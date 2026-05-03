// Manage dark mode toggle and persistence
// This module applies a `dark` class on <body> and persists the user's
// preference in localStorage so the UI remains consistent between visits.
(function(){
    const KEY = 'tempweb:darkmode';
    const button = document.getElementById('themeButton');
    const iconWrap = document.getElementById('themeIcon');

    const SVG_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V2M12 22v-2M4.93 4.93L3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2m20 0h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const SVG_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function applyDark(isDark){
        // Toggle the `dark` class which is used by `style.css` to switch
        // theme variables and color palettes.
        if(isDark) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
        // update bootstrap bg-light compatibility
        if(document.body.classList.contains('dark')){
            document.body.classList.remove('bg-light');
            document.body.classList.add('bg-dark');
        } else {
            document.body.classList.remove('bg-dark');
            document.body.classList.add('bg-light');
        }
    // swap icon (show sun in dark mode, moon in light mode)
    if(iconWrap) iconWrap.innerHTML = isDark ? SVG_SUN : SVG_MOON;
        if(button) button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }

    function save(isDark){
        // Persist preference; localStorage may be unavailable in some
        // browsers or private modes so wrap in try/catch.
        try{ localStorage.setItem(KEY, isDark ? '1' : '0'); } catch(e){}
    }

    // initialize from storage; default to light when no stored preference
    function init(){
        const stored = (function(){ try{ return localStorage.getItem(KEY); }catch(e){return null;} })();
        let isDark = false; // default light
        if(stored === '1') isDark = true;
        else if(stored === '0') isDark = false;

        applyDark(isDark);

        if(button) {
            // Clicking the button toggles theme and saves the choice
            button.addEventListener('click', function(){
                const newState = !document.body.classList.contains('dark');
                applyDark(newState);
                save(newState);
            });
        }
    }

    // Wait for DOM
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
