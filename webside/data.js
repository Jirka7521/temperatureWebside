// =============================================================================
// data.js  —  Sensor data table controller  (data.html)
// =============================================================================
//
// Architecture overview
// ─────────────────────
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  TableState          Immutable description of the current query         │
//  │                      (page, sort, filters, search).  Never mutated      │
//  │                      directly — always replaced via helper methods.     │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  DataTableController  Orchestrates everything:                          │
//  │    • bindEvents()        wires DOM → state changes                      │
//  │    • fetchData()         talks to the backend /getData endpoint         │
//  │    • _renderTable()      builds DOM rows from the API response           │
//  │    • _renderPagination() updates prev/next/first/last buttons           │
//  │    • _updateSortIcons()  reflects sort state in column headers          │
//  │    • startAutoRefresh()  sets up the periodic silent re-fetch           │
//  └─────────────────────────────────────────────────────────────────────────┘
//
// Key design decisions
// ────────────────────
//  • Server-side pagination: only the current page is fetched from the DB.
//  • Auto-refresh is "silent" (no loading overlay; filter/sort/page preserved).
//  • All dates are stored as UTC and converted to the browser's local timezone
//    for display using the Intl API (toLocaleString).
//  • Temperature values are colour-coded using the same threshold config as the
//    main dashboard (window.inlineConfig.temperatureThresholds).
//  • The search input is debounced (400 ms) to avoid a fetch on every keystroke.
//
// =============================================================================

'use strict';

// ─── Module-level constants ────────────────────────────────────────────────────

/** Default number of records shown per page. */
var DEFAULT_PAGE_SIZE = 50;

/** Default column to sort by (matches a backend `sortBy` value). */
var DEFAULT_SORT_BY = 'date';

/** Default sort direction. */
var DEFAULT_SORT_ORDER = 'desc';

/** Milliseconds to wait after the last keystroke before firing a search fetch. */
var SEARCH_DEBOUNCE_MS = 400;


// ─── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format a UTC ISO-8601 string into the browser's local timezone using the
 * browser's own locale (falls back to 'cs-CZ').
 *
 * Examples (for a browser set to Europe/Prague, UTC+2 in summer):
 *   "2026-05-19T10:30:00Z"  →  "19. 5. 2026 12:30:05"
 *   "2026-01-01T00:00:00Z"  →  "1. 1. 2026 01:00:00"
 *
 * @param   {string} isoString  UTC timestamp as returned by the backend.
 * @returns {string}            Human-readable local date-time string.
 */
function formatLocalDate(isoString) {
    if (!isoString) return '—';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString; // fall back to raw string on parse error
    return d.toLocaleString(navigator.language || 'cs-CZ', {
        year:   'numeric',
        month:  'numeric',
        day:    'numeric',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/**
 * Resolve the CSS colour string for a temperature value based on the
 * temperature threshold configuration from config.js.
 *
 * @param   {number}      temp        Temperature in °C.
 * @param   {object|null} thresholds  config.temperatureThresholds object.
 * @returns {string|null}             A CSS colour string, or null when config
 *                                    is unavailable (caller falls back to
 *                                    inherited text colour).
 */
function tempColour(temp, thresholds) {
    if (!thresholds || temp === null || temp === undefined) return null;
    if (temp < thresholds.cold.value)   return thresholds.cold.color;
    if (temp < thresholds.cool.value)   return thresholds.cool.color;
    if (temp < thresholds.normal.value) return thresholds.normal.color;
    if (temp < thresholds.warm.value)   return thresholds.warm.color;
    return '#FF0000'; // above warm threshold
}

/**
 * Convert a UTC ISO string to the value expected by a <input type="datetime-local">.
 * The input expects "YYYY-MM-DDTHH:MM" in the browser's local timezone.
 *
 * @param   {string} isoString  UTC ISO timestamp, or empty string.
 * @returns {string}            "YYYY-MM-DDTHH:MM" in local time, or ''.
 */
function isoToLocalInputValue(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return (
        d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
}


// ─── TableState ────────────────────────────────────────────────────────────────

/**
 * Holds all mutable query parameters that describe the current view.
 * Having them in one object makes it easy to:
 *  • Pass the full state to fetchData() without argument lists.
 *  • Snapshot and restore state (e.g. auto-refresh that preserves user choices).
 *  • Convert to URL query params via toQueryParams().
 */
function TableState() {
    // Pagination
    this.page     = 1;
    this.pageSize = DEFAULT_PAGE_SIZE;
    // Sorting
    this.sortBy    = DEFAULT_SORT_BY;
    this.sortOrder = DEFAULT_SORT_ORDER;
    // Filters
    this.search    = '';   // free-text search term
    this.startDate = '';   // UTC ISO string, or '' = no lower bound
    this.endDate   = '';   // UTC ISO string, or '' = no upper bound
}

/**
 * Serialise the current state as a URLSearchParams object ready to append to
 * the /getData endpoint URL.  Empty optional fields are omitted.
 *
 * @returns {URLSearchParams}
 */
TableState.prototype.toQueryParams = function () {
    var p = new URLSearchParams({
        page:      this.page,
        pageSize:  this.pageSize,
        sortBy:    this.sortBy,
        sortOrder: this.sortOrder,
    });
    if (this.search)    p.set('search',    this.search);
    if (this.startDate) p.set('startDate', this.startDate);
    if (this.endDate)   p.set('endDate',   this.endDate);
    return p;
};

/**
 * Reset all filter fields to their defaults while keeping the user's
 * preferred page size.
 */
TableState.prototype.resetFilters = function () {
    var savedPageSize = this.pageSize;
    // Re-apply defaults (re-use constructor logic)
    TableState.call(this);
    this.pageSize = savedPageSize;
};


// ─── DataTableController ───────────────────────────────────────────────────────

/**
 * Main controller for the sensor data table page.
 *
 * Responsibilities
 * ─────────────────
 *  • Owns the TableState and is the single source of truth for what is
 *    currently shown.
 *  • Binds all DOM events and translates them into state mutations + re-fetches.
 *  • Calls the backend /getData endpoint and renders the result.
 *  • Manages the auto-refresh interval (same cadence as the main dashboard).
 *
 * @param {object} config  window.inlineConfig loaded by config.js.
 */
function DataTableController(config) {
    this.config = config;

    // ── Query state ────────────────────────────────────────────────────────
    this.state      = new TableState();
    this.totalRows  = 0;
    this.totalPages = 1;

    // ── Internal flags ─────────────────────────────────────────────────────
    this._loading        = false;  // prevents concurrent fetches
    this._refreshTimer   = null;   // setInterval handle
    this._badgeInterval  = null;   // setInterval handle for "updated X ago" badge
    this._lastRefreshTime = 0;

    // ── DOM element cache ──────────────────────────────────────────────────
    // Caching references avoids repeated getElementById calls on every render.
    this._el = {
        tableBody:      document.getElementById('tableBody'),
        recordCount:    document.getElementById('recordCount'),
        pageInfo:       document.getElementById('pageInfo'),
        firstPage:      document.getElementById('firstPage'),
        prevPage:       document.getElementById('prevPage'),
        nextPage:       document.getElementById('nextPage'),
        lastPage:       document.getElementById('lastPage'),
        pageSizeSelect: document.getElementById('pageSizeSelect'),
        searchInput:    document.getElementById('searchInput'),
        filterStart:    document.getElementById('filterStart'),
        filterEnd:      document.getElementById('filterEnd'),
        applyFilters:   document.getElementById('applyFilters'),
        resetFilters:   document.getElementById('resetFilters'),
        loadingOverlay: document.getElementById('loadingIndicator'),
        refreshBadge:   document.getElementById('lastRefreshBadge'),
        autoRefreshLabel: document.getElementById('autoRefreshLabel'),
    };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Initialise the controller: populate the page-size selector, wire events,
 * perform the first data fetch, and start the auto-refresh timer.
 * Call this once after the DOM and config are ready.
 */
DataTableController.prototype.init = function () {
    // Sync the page-size selector to the current state
    if (this._el.pageSizeSelect) {
        this._el.pageSizeSelect.value = String(this.state.pageSize);
    }
    this.bindEvents();
    this.fetchData();          // initial (non-silent) load
    this.startAutoRefresh();
};

// ── Event binding ─────────────────────────────────────────────────────────────

/**
 * Attach all DOM event listeners.
 * Called once during init(); should not be called again.
 */
DataTableController.prototype.bindEvents = function () {
    var self = this;

    // ── Pagination buttons ──────────────────────────────────────────────────
    if (this._el.firstPage) {
        this._el.firstPage.addEventListener('click', function () {
            self._goToPage(1);
        });
    }
    if (this._el.prevPage) {
        this._el.prevPage.addEventListener('click', function () {
            self._goToPage(self.state.page - 1);
        });
    }
    if (this._el.nextPage) {
        this._el.nextPage.addEventListener('click', function () {
            self._goToPage(self.state.page + 1);
        });
    }
    if (this._el.lastPage) {
        this._el.lastPage.addEventListener('click', function () {
            self._goToPage(self.totalPages);
        });
    }

    // ── Page-size selector ──────────────────────────────────────────────────
    if (this._el.pageSizeSelect) {
        this._el.pageSizeSelect.addEventListener('change', function (e) {
            self.state.pageSize = parseInt(e.target.value, 10);
            self.state.page     = 1; // reset to first page after size change
            self.fetchData();
        });
    }

    // ── Search input (debounced) ────────────────────────────────────────────
    // Debouncing avoids a backend call for every single keystroke while still
    // giving responsive feel.
    var searchDebounceTimer = null;
    if (this._el.searchInput) {
        this._el.searchInput.addEventListener('input', function (e) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function () {
                self.state.search = e.target.value.trim();
                self.state.page   = 1;
                self.fetchData();
            }, SEARCH_DEBOUNCE_MS);
        });

        // Allow pressing Enter to fire immediately (bypasses debounce)
        this._el.searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounceTimer);
                self.state.search = e.target.value.trim();
                self.state.page   = 1;
                self.fetchData();
            }
        });
    }

    // ── Filter buttons ──────────────────────────────────────────────────────
    if (this._el.applyFilters) {
        this._el.applyFilters.addEventListener('click', function () {
            self._applyDateFilters();
        });
    }
    if (this._el.resetFilters) {
        this._el.resetFilters.addEventListener('click', function () {
            self.state.resetFilters();
            self._syncFilterUI(); // push cleared state back to DOM inputs
            self.fetchData();
        });
    }

    // Allow pressing Enter inside either date input to apply the filter
    [this._el.filterStart, this._el.filterEnd].forEach(function (el) {
        if (!el) return;
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') self._applyDateFilters();
        });
    });

    // ── Column sort (event delegation on thead) ─────────────────────────────
    // Event delegation means we only need one listener even if columns change.
    var thead = document.querySelector('#sensorTable thead');
    if (thead) {
        thead.addEventListener('click', function (e) {
            var th = e.target.closest('th.sortable');
            if (!th) return; // click was not on a sortable header

            var col = th.dataset.col;
            if (self.state.sortBy === col) {
                // Toggle direction when clicking the same column again
                self.state.sortOrder = (self.state.sortOrder === 'asc') ? 'desc' : 'asc';
            } else {
                // Switch to new column; default direction depends on type:
                //   dates → newest first (desc), numbers → lowest first (asc)
                self.state.sortBy    = col;
                self.state.sortOrder = (col === 'date') ? 'desc' : 'asc';
            }
            self.state.page = 1; // always start at page 1 after sort change
            self.fetchData();
        });
    }
};

// ── Auto-refresh ──────────────────────────────────────────────────────────────

/**
 * Start the periodic background refresh.
 * Uses the same interval as the main dashboard (config.refreshInterval).
 * The refresh is "silent": it does NOT reset state or show the loading overlay,
 * so the user's current filters, sort order, page, and search are all preserved.
 */
DataTableController.prototype.startAutoRefresh = function () {
    var self     = this;
    var interval = (this.config && this.config.refreshInterval) ? this.config.refreshInterval : 15000;

    this._refreshTimer = setInterval(function () {
        // Pass silent:true so the loading overlay is suppressed and state is
        // not reset.  The table rows update in-place.
        self.fetchData({ silent: true });
    }, interval);

    // Update the desktop auto-refresh label
    if (this._el.autoRefreshLabel) {
        var secs = Math.round(interval / 1000);
        this._el.autoRefreshLabel.textContent = 'Automatická aktualizace každých ' + secs + ' s';
    }
};

/** Stop the auto-refresh timer (e.g. when navigating away). */
DataTableController.prototype.stopAutoRefresh = function () {
    if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
    }
};

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch one page of sensor data from the backend.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.silent=false]  When true the loading overlay is NOT
 *                                       shown and the current state is not
 *                                       reset.  Used for auto-refreshes.
 */
DataTableController.prototype.fetchData = function (opts) {
    var silent = opts && opts.silent;
    var self   = this;

    // Guard against concurrent requests — if a fetch is already in flight,
    // skip.  This can happen if the user changes filters while auto-refresh
    // is mid-flight.
    if (this._loading) return;
    this._loading = true;

    // Show the loading overlay only for user-initiated loads
    if (!silent) this._setLoading(true);

    // Build the request URL from the current TableState
    var baseUrl = (this.config.indoorApiAddress || '').replace(/\/$/, '');
    var url     = baseUrl + '/getData?' + this.state.toQueryParams().toString();

    fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
            return response.json();
        })
        .then(function (result) {
            // result: { data, total, page, pageSize, totalPages }
            self.totalRows  = result.total      || 0;
            self.totalPages = result.totalPages || 1;

            self._renderTable(result.data || []);
            self._renderPagination();
            self._updateRefreshBadge();
        })
        .catch(function (err) {
            console.error('[DataTable] fetchData failed:', err);
            // On silent refresh failures, keep existing rows; just log.
            // On user-triggered loads, show the error in the table body.
            if (!silent) self._renderError(err.message);
        })
        .finally(function () {
            self._loading = false;
            if (!silent) self._setLoading(false);
        });
};

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Build and inject table rows for the given data slice.
 * Uses a DocumentFragment to minimise reflows.
 *
 * @param {Array<{temperature:number, humidity:number, date:string}>} rows
 */
DataTableController.prototype._renderTable = function (rows) {
    var thresholds = this.config && this.config.temperatureThresholds;
    var frag = document.createDocumentFragment();

    if (!rows || rows.length === 0) {
        // Show a centred "no records" message spanning all columns
        var emptyRow = document.createElement('tr');
        emptyRow.className = 'table-empty-msg';
        emptyRow.innerHTML = '<td colspan="3">Žádné záznamy neodpovídají zadaným filtrům.</td>';
        frag.appendChild(emptyRow);
    } else {
        rows.forEach(function (row) {
            var tr = document.createElement('tr');

            // ── Date / time cell ────────────────────────────────────────────
            // Dates arrive as UTC from the backend; formatLocalDate converts
            // them to the user's local timezone automatically.
            var tdDate = document.createElement('td');
            tdDate.className = 'data-cell-date';
            tdDate.textContent = formatLocalDate(row.date);

            // ── Temperature cell ────────────────────────────────────────────
            var tdTemp = document.createElement('td');
            tdTemp.className = 'data-cell-temp';
            if (row.temperature !== null && row.temperature !== undefined) {
                // Round to one decimal place (matches the main dashboard display)
                tdTemp.textContent = (Math.round(row.temperature * 10) / 10).toFixed(1) + ' °C';
                var colour = tempColour(row.temperature, thresholds);
                if (colour) tdTemp.style.color = colour;
            } else {
                tdTemp.textContent = '—';
            }

            // ── Humidity cell ───────────────────────────────────────────────
            var tdHum = document.createElement('td');
            tdHum.className = 'data-cell-hum';
            if (row.humidity !== null && row.humidity !== undefined) {
                tdHum.textContent = (Math.round(row.humidity * 10) / 10).toFixed(1) + ' %';
            } else {
                tdHum.textContent = '—';
            }

            tr.appendChild(tdDate);
            tr.appendChild(tdTemp);
            tr.appendChild(tdHum);
            frag.appendChild(tr);
        });
    }

    // Replace all existing rows in one operation (single reflow)
    this._el.tableBody.innerHTML = '';
    this._el.tableBody.appendChild(frag);

    // Update sort icons to reflect the current sort state
    this._updateSortIcons();

    // Update the "Záznamy X–Y z Z" label
    this._updateRecordCountLabel();
};

/**
 * Update the ▲ / ▼ / ⇅ icons in the column headers to reflect the current
 * sort state held in this.state.
 */
DataTableController.prototype._updateSortIcons = function () {
    var state = this.state;
    document.querySelectorAll('#sensorTable thead th.sortable').forEach(function (th) {
        var icon = th.querySelector('.sort-icon');
        if (!icon) return;

        if (th.dataset.col === state.sortBy) {
            // This column is the active sort column
            icon.textContent = state.sortOrder === 'asc' ? ' ▲' : ' ▼';
            th.classList.add('sort-active');
        } else {
            // Unsorted column — show the neutral bidirectional indicator
            icon.textContent = ' ⇅';
            th.classList.remove('sort-active');
        }
    });
};

/**
 * Update all pagination controls to match the current page and totalPages.
 * Disables First/Prev on page 1 and Next/Last on the final page.
 */
DataTableController.prototype._renderPagination = function () {
    var p    = this.state.page;
    var last = this.totalPages;

    if (this._el.pageInfo) {
        this._el.pageInfo.textContent = 'Stránka ' + p + ' z ' + last;
    }

    // Disable buttons at boundaries
    if (this._el.firstPage) this._el.firstPage.disabled = (p <= 1);
    if (this._el.prevPage)  this._el.prevPage.disabled  = (p <= 1);
    if (this._el.nextPage)  this._el.nextPage.disabled  = (p >= last);
    if (this._el.lastPage)  this._el.lastPage.disabled  = (p >= last);
};

/**
 * Update the record-count toolbar label ("Záznamy 1–50 z 1 234").
 */
DataTableController.prototype._updateRecordCountLabel = function () {
    if (!this._el.recordCount) return;

    if (this.totalRows === 0) {
        this._el.recordCount.textContent = 'Žádné záznamy';
        return;
    }

    var start = (this.state.page - 1) * this.state.pageSize + 1;
    var end   = Math.min(this.state.page * this.state.pageSize, this.totalRows);
    // toLocaleString adds thousands separators (e.g. "1 234")
    this._el.recordCount.textContent =
        'Záznamy ' + start.toLocaleString() + '–' + end.toLocaleString() +
        ' z ' + this.totalRows.toLocaleString();
};

/**
 * Display an error message inside the table body.
 *
 * @param {string} message  Human-readable error description.
 */
DataTableController.prototype._renderError = function (message) {
    if (!this._el.tableBody) return;
    this._el.tableBody.innerHTML =
        '<tr class="table-empty-msg"><td colspan="3" class="text-danger">'
        + 'Chyba při načítání dat: ' + message
        + '</td></tr>';
    if (this._el.recordCount) {
        this._el.recordCount.textContent = 'Chyba';
    }
};

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Show or hide the full-card loading overlay.
 *
 * @param {boolean} on  true = show overlay, false = hide overlay.
 */
DataTableController.prototype._setLoading = function (on) {
    if (this._el.loadingOverlay) {
        this._el.loadingOverlay.style.display = on ? 'flex' : 'none';
    }
};

/**
 * Navigate to a specific page number.  Ignores out-of-range requests.
 *
 * @param {number} pageNumber  Target page (1-based).
 */
DataTableController.prototype._goToPage = function (pageNumber) {
    if (pageNumber < 1 || pageNumber > this.totalPages) return;
    this.state.page = pageNumber;
    this.fetchData();
};

/**
 * Read the date filter inputs, convert their local-timezone values to UTC ISO
 * strings, update the state, and trigger a re-fetch.
 */
DataTableController.prototype._applyDateFilters = function () {
    // datetime-local values are in the browser's local timezone.
    // new Date(localIso).toISOString() converts to UTC automatically.
    var startVal = this._el.filterStart ? this._el.filterStart.value : '';
    var endVal   = this._el.filterEnd   ? this._el.filterEnd.value   : '';

    this.state.startDate = startVal ? new Date(startVal).toISOString() : '';
    this.state.endDate   = endVal   ? new Date(endVal).toISOString()   : '';
    this.state.page = 1;
    this.fetchData();
};

/**
 * Push the current TableState back into the filter input DOM elements.
 * Called after a state reset so inputs visually reflect the new defaults.
 */
DataTableController.prototype._syncFilterUI = function () {
    if (this._el.searchInput)   this._el.searchInput.value   = this.state.search;
    if (this._el.filterStart)   this._el.filterStart.value   = isoToLocalInputValue(this.state.startDate);
    if (this._el.filterEnd)     this._el.filterEnd.value     = isoToLocalInputValue(this.state.endDate);
    if (this._el.pageSizeSelect) this._el.pageSizeSelect.value = String(this.state.pageSize);
};

/**
 * Record the current timestamp as the last successful refresh time and start
 * (or restart) a 1-second ticker that updates the "updated X ago" badge.
 */
DataTableController.prototype._updateRefreshBadge = function () {
    var self = this;
    this._lastRefreshTime = Date.now();

    // Update immediately (show "teď")
    this._tickRefreshBadge();

    // Clear any previous ticker and start a new one
    if (this._badgeInterval) clearInterval(this._badgeInterval);
    this._badgeInterval = setInterval(function () {
        self._tickRefreshBadge();
    }, 1000);
};

/**
 * Compute elapsed time since last refresh and write it to the badge element.
 */
DataTableController.prototype._tickRefreshBadge = function () {
    if (!this._el.refreshBadge) return;
    var seconds = Math.floor((Date.now() - this._lastRefreshTime) / 1000);
    var text;
    if (seconds < 5) {
        text = 'Aktualizováno: teď';
    } else if (seconds < 60) {
        text = 'Aktualizováno: před ' + seconds + ' s';
    } else {
        text = 'Aktualizováno: před ' + Math.floor(seconds / 60) + ' min';
    }
    this._el.refreshBadge.textContent = text;
};


// ─── Configuration loader ──────────────────────────────────────────────────────

/**
 * Load the application configuration.
 *
 * Priority:
 *  1. window.inlineConfig — set synchronously by config.js before this script
 *     runs, so it is always available inside DOMContentLoaded.
 *  2. fetch('./config.json') — fallback for deployments that serve a static
 *     config.json instead of using the Docker environment-variable injection.
 *
 * @returns {Promise<object>}  Resolves with the config object.
 */
function loadConfig() {
    if (window.inlineConfig) {
        return Promise.resolve(window.inlineConfig);
    }
    return fetch('./config.json')
        .then(function (r) {
            if (!r.ok) throw new Error('Config load failed: HTTP ' + r.status);
            return r.json();
        });
}

/**
 * Display a minimal error page when configuration cannot be loaded.
 * Mirrors the error display in getValues.js.
 *
 * @param {Error} err
 */
function showConfigError(err) {
    document.body.innerHTML =
        '<div style="color:red;text-align:center;padding:20px;font-family:sans-serif;">'
        + '<h1>Chyba konfigurace</h1>'
        + '<p>Nelze načíst konfiguraci.  Aplikace nelze spustit.</p>'
        + '<p>Detail: ' + err.message + '</p>'
        + '</div>';
}


// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    loadConfig()
        .then(function (config) {
            var controller = new DataTableController(config);
            controller.init();
        })
        .catch(function (err) {
            console.error('[data.js] Config load failed:', err);
            showConfigError(err);
        });
});
