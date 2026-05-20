/**
 * Data Table Module  (data.html)
 * --------------------------------
 * Provides the `DataTable` class — a paginated, sortable, filterable table of
 * indoor sensor readings.  Only the rows for the current page are fetched from
 * the backend (/data/list) so the query is always efficient regardless of the
 * total number of stored rows.
 *
 * Dependencies:
 *   - window.configPromise  — resolved by getValues.js after config is loaded
 *   - DOM elements defined in data.html
 */


/* ======================================================================
 * Utility
 * ====================================================================== */

/**
 * Return a debounced version of `fn` that fires after `delay` ms of silence.
 * @param {Function} fn
 * @param {number}   delay  milliseconds
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}


/* ======================================================================
 * DataTable
 * ====================================================================== */

/**
 * Renders a paginated, sortable, filterable table of indoor sensor readings.
 *
 * All state (current page, sort column, filter values) is held in the
 * instance so each user interaction results in a fresh, minimal API call.
 */
class DataTable {
    /**
     * @param {Object} config  Application configuration (from window.configPromise)
     */
    constructor(config) {
        this.config = config;

        /** @private */
        this._page     = 1;
        /** @private */
        this._pageSize = 25;
        /** @private */
        this._sortBy   = 'date';
        /** @private */
        this._sortDir  = 'desc';
        /** @private */
        this._total    = 0;
        /** @private */
        this._pages    = 0;
        /** @private */
        this._loading  = false;

        this._cacheElements();
        this._setDefaultDateRange();
        this._bindEvents();
        this._updateSortIcons();
        this.loadData();
    }

    /* ------------------------------------------------------------------
     * Initialisation helpers
     * ------------------------------------------------------------------ */

    /**
     * Store references to all relevant DOM elements.
     * @private
     */
    _cacheElements() {
        this._tableBody     = document.getElementById('sensorDataTableBody');
        this._filterFrom    = document.getElementById('filterFrom');
        this._filterTo      = document.getElementById('filterTo');
        this._filterSearch  = document.getElementById('filterSearch');
        this._pageSizeSelect= document.getElementById('pageSizeSelect');
        this._prevPageBtn   = document.getElementById('prevPage');
        this._nextPageBtn   = document.getElementById('nextPage');
        this._pageInfo      = document.getElementById('pageInfo');
        this._totalInfo     = document.getElementById('totalInfo');
        this._tableHeaders  = document.querySelectorAll('#sensorDataTable th[data-col]');
    }

    /**
     * Pre-fill the date range to the last 24 hours.
     * @private
     */
    _setDefaultDateRange() {
        const now        = new Date();
        const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        this._filterFrom.value = this._toDatetimeLocal(oneDayAgo);
        this._filterTo.value   = this._toDatetimeLocal(now);
    }

    /**
     * Format a Date object to the value string expected by datetime-local
     * inputs: "YYYY-MM-DDTHH:MM".
     * @private
     * @param {Date} date
     * @returns {string}
     */
    _toDatetimeLocal(date) {
        const p = n => String(n).padStart(2, '0');
        return (
            `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
            `T${p(date.getHours())}:${p(date.getMinutes())}`
        );
    }

    /**
     * Attach all event listeners.
     * @private
     */
    _bindEvents() {
        // Date/time filter changes → reset to page 1 and reload
        this._filterFrom.addEventListener('change', () => this._onFilterChange());
        this._filterTo.addEventListener('change',   () => this._onFilterChange());

        // Search input: debounced so we don't fire on every keystroke
        this._filterSearch.addEventListener(
            'input',
            debounce(() => this._onFilterChange(), 400)
        );

        // Page-size selector
        this._pageSizeSelect.addEventListener('change', () => {
            this._pageSize = parseInt(this._pageSizeSelect.value, 10);
            this._page     = 1;
            this.loadData();
        });

        // Pagination buttons
        this._prevPageBtn.addEventListener('click', () => {
            if (this._page > 1) { this._page--; this.loadData(); }
        });
        this._nextPageBtn.addEventListener('click', () => {
            if (this._page < this._pages) { this._page++; this.loadData(); }
        });

        // Column-header sort (click cycles asc ↔ desc; new column starts desc)
        this._tableHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (this._sortBy === col) {
                    this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this._sortBy  = col;
                    this._sortDir = 'desc';
                }
                this._page = 1;
                this._updateSortIcons();
                this.loadData();
            });
        });
    }

    /* ------------------------------------------------------------------
     * Data fetching
     * ------------------------------------------------------------------ */

    /** Reset to page 1 and reload whenever a filter changes. @private */
    _onFilterChange() {
        this._page = 1;
        this.loadData();
    }

    /**
     * Build the full URL for /data/list with all current parameters.
     * @private
     * @returns {string}
     */
    _buildUrl() {
        const params = new URLSearchParams();

        if (this._filterFrom.value) {
            params.set('start', new Date(this._filterFrom.value).toISOString());
        }
        if (this._filterTo.value) {
            params.set('end', new Date(this._filterTo.value).toISOString());
        }

        const search = this._filterSearch.value.trim();
        if (search) params.set('search', search);

        params.set('sort_by',   this._sortBy);
        params.set('sort_dir',  this._sortDir);
        params.set('page',      String(this._page));
        params.set('page_size', String(this._pageSize));

        return `${this.config.indoorApiAddress}data/list?${params.toString()}`;
    }

    /**
     * Fetch the current page from the API, then render table and pagination.
     * Concurrent calls are dropped — only the most recently triggered request
     * will process its result.
     */
    async loadData() {
        if (this._loading) return;
        this._loading = true;
        this._showLoading();

        try {
            const response = await fetch(this._buildUrl());
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            this._total = result.total;
            this._pages = result.pages;

            this._renderRows(result.data);
            this._renderPagination();
        } catch (err) {
            console.error('DataTable: failed to load data:', err);
            this._showError();
        } finally {
            this._loading = false;
        }
    }

    /* ------------------------------------------------------------------
     * Rendering
     * ------------------------------------------------------------------ */

    /**
     * Replace the table body with freshly rendered rows.
     * @private
     * @param {Array<{temperature: number, humidity: number, date: string}>} data
     */
    _renderRows(data) {
        this._tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            this._tableBody.innerHTML =
                '<tr><td colspan="3" class="table-empty">Žádná data nenalezena.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.forEach(row => {
            const tr  = document.createElement('tr');
            const td1 = document.createElement('td');
            const td2 = document.createElement('td');
            const td3 = document.createElement('td');

            td1.textContent = this._formatDate(row.date);
            td2.textContent = `${parseFloat(row.temperature).toFixed(1)} °C`;
            td3.textContent = `${parseFloat(row.humidity).toFixed(1)} %`;

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);
            fragment.appendChild(tr);
        });
        this._tableBody.appendChild(fragment);
    }

    /**
     * Update the pagination controls and info text.
     * @private
     */
    _renderPagination() {
        this._prevPageBtn.disabled = this._page <= 1;
        this._nextPageBtn.disabled = this._page >= this._pages;

        this._pageInfo.textContent  = this._pages > 0
            ? `Strana ${this._page} z ${this._pages}`
            : 'Strana 0 z 0';
        this._totalInfo.textContent = `${this._total} záznamů celkem`;
    }

    /**
     * Refresh sort arrows in column headers to reflect current sort state.
     * @private
     */
    _updateSortIcons() {
        this._tableHeaders.forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;

            if (th.dataset.col === this._sortBy) {
                icon.textContent = this._sortDir === 'asc' ? ' ↑' : ' ↓';
                th.classList.add('active-sort');
            } else {
                icon.textContent = '';
                th.classList.remove('active-sort');
            }
        });
    }

    /* ------------------------------------------------------------------
     * State cells
     * ------------------------------------------------------------------ */

    /** @private */
    _showLoading() {
        if (this._tableBody) {
            this._tableBody.innerHTML =
                '<tr><td colspan="3" class="table-loading">Načítání dat…</td></tr>';
        }
    }

    /** @private */
    _showError() {
        if (this._tableBody) {
            this._tableBody.innerHTML =
                '<tr><td colspan="3" class="table-error">Chyba při načítání dat. Zkontrolujte připojení k API.</td></tr>';
        }
    }

    /* ------------------------------------------------------------------
     * Helpers
     * ------------------------------------------------------------------ */

    /**
     * Format an ISO date string using Czech locale.
     * Falls back to the raw string when parsing fails.
     * @private
     * @param {string} isoString
     * @returns {string}
     */
    _formatDate(isoString) {
        try {
            return new Date(isoString).toLocaleString('cs-CZ', {
                year:   'numeric',
                month:  '2-digit',
                day:    '2-digit',
                hour:   '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            return isoString;
        }
    }
}


/* ======================================================================
 * Bootstrap
 * ====================================================================== */

// Initialise the data table as soon as the DOM is ready and config is loaded.
// data.html is a standalone page so there is no tab-switching needed.
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('sensorDataTableBody')) return;

    window.configPromise
        .then(config => { window.dataTable = new DataTable(config); })
        .catch(err => { console.error('DataTable: config unavailable:', err); });
});
