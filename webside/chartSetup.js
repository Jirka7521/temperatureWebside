/**
 * Temperature Chart Module
 * ------------------------
 * Responsibilities:
 * - Initialize Chart.js instance used by the dashboard
 * - Load outdoor temperature series from the configured weather API
 * - Load indoor sensor series from the local backend and align it
 *   with the outdoor time axis
 * - Support switching between 24-hour (day) and 7-day (week) views
 *
 * Notes:
 * - This module expects `configData` to be available via
 *   `window.configPromise` / `window.configData` (see `getValues.js`).
 * - Chart.js must be loaded before this script runs.
 */

class TemperatureChart {
    constructor() {
        this.chart = null;
        this.chartCanvas = document.getElementById('weatherChart');
        this.currentMode = 'day'; // 'day' | 'week'

        if (!this.chartCanvas) {
            console.error('Canvas element with id "weatherChart" not found.');
            return;
        }
        this.chartCanvas.style.width = '100%';
        if (!this.chartCanvas.style.height) {
            this.chartCanvas.style.height = '100%';
        }

        this.temperatureData = { labels: [], values: [], times: [] };
        this.indoorData = [];
        this.indoorHumidityData = [];

        this._initChart();
        this._loadData();
        this._setupRefreshTimers();
        this._setupModeToggle();
    }

    /**
     * Bind chart mode toggle buttons (24h / 7d).
     * @private
     */
    _setupModeToggle() {
        const dayBtn = document.getElementById('chartDay');
        const weekBtn = document.getElementById('chartWeek');
        if (!dayBtn || !weekBtn) return;

        dayBtn.addEventListener('click', () => {
            if (this.currentMode === 'day') return;
            this.currentMode = 'day';
            dayBtn.classList.add('active');
            dayBtn.setAttribute('aria-pressed', 'true');
            weekBtn.classList.remove('active');
            weekBtn.setAttribute('aria-pressed', 'false');
            this._loadData();
        });

        weekBtn.addEventListener('click', () => {
            if (this.currentMode === 'week') return;
            this.currentMode = 'week';
            weekBtn.classList.add('active');
            weekBtn.setAttribute('aria-pressed', 'true');
            dayBtn.classList.remove('active');
            dayBtn.setAttribute('aria-pressed', 'false');
            this._loadData();
        });
    }

    /**
     * Initialize the Chart.js chart.
     * @private
     */
    _initChart() {
        this.chart = new Chart(this.chartCanvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Venkovní teplota (°C)',
                        data: [],
                        borderColor: 'rgba(255, 193, 7, 1)',
                        backgroundColor: 'rgba(255, 193, 7, 0.2)',
                        fill: true,
                        tension: 0.2,
                        borderWidth: 2,
                        pointRadius: 3
                    },
                    {
                        label: 'Vnitřní teplota (°C)',
                        data: [],
                        borderColor: 'rgba(220, 53, 69, 1)',
                        backgroundColor: 'rgba(220, 53, 69, 0.2)',
                        fill: true,
                        spanGaps: true,
                        tension: 0.2,
                        borderWidth: 2,
                        pointRadius: 3
                    },
                    {
                        label: 'Vnitřní vlhkost (%)',
                        data: [],
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: false,
                        spanGaps: true,
                        tension: 0.2,
                        borderWidth: 2,
                        pointRadius: 2,
                        yAxisID: 'yHumidity'
                    }
                ]
            },
            options: this._getChartOptions()
        });

        const container = this.chartCanvas.parentElement || this.chartCanvas;
        try {
            this._resizeObserver = new ResizeObserver(() => {
                try { this.chart.resize(); } catch (e) {}
            });
            this._resizeObserver.observe(container);
        } catch (e) {
            window.addEventListener('resize', () => {
                try { this.chart.resize(); } catch (e) {}
            });
        }

        const fsHandler = () => {
            try { this.chart.resize(); } catch (e) {}
            setTimeout(() => { try { this.chart.resize(); } catch (e) {} }, 150);
            setTimeout(() => { try { this.chart.resize(); } catch (e) {} }, 400);
        };
        document.addEventListener('fullscreenchange', fsHandler);
        this._fullscreenHandler = fsHandler;

        this._cleanup = () => {
            try { if (this._resizeObserver) this._resizeObserver.disconnect(); } catch (e) {}
            try { if (this._fullscreenHandler) document.removeEventListener('fullscreenchange', this._fullscreenHandler); } catch (e) {}
        };
        window.addEventListener('unload', this._cleanup);

        setTimeout(() => { try { this.chart.resize(); } catch (e) {} }, 50);
    }

    /**
     * Get chart configuration options.
     * @private
     * @returns {Object} Chart.js options
     */
    _getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 8, right: 16, bottom: 8, left: 10 }
            },
            scales: {
                x: {
                    type: 'category',
                    title: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 25
                    }
                },
                y: {
                    title: { display: false },
                    beginAtZero: false,
                    ticks: { maxTicksLimit: 5 }
                },
                yHumidity: {
                    type: 'linear',
                    position: 'right',
                    title: { display: false },
                    ticks: { callback: v => `${v}%`, maxTicksLimit: 5 },
                    min: 0,
                    max: 100,
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: (context) => `Teplota: ${context.parsed.y}°C`
                    }
                },
                title: {
                    font: { size: 11 }
                }
            }
        };
    }

    /**
     * Load data and refresh chart for the active mode.
     * @private
     */
    async _loadData() {
        if (this.currentMode === 'day') {
            await this._fetchDayData();
            await this._fetchIndoorDayData();
        } else {
            await this._fetchWeekData();
            await this._fetchIndoorWeekData();
        }
        this._updateChart();
    }

    /**
     * Fetch hourly outdoor temperature for the past 24 hours.
     * @private
     */
    async _fetchTemperatureData() {
        await window.configPromise;
        const baseUrl = window.configData?.archiveApiAddress || 'https://archive-api.open-meteo.com/v1/archive';
        const lat = window.configData?.position?.latitude || 50.0755;
        const lon = window.configData?.position?.longitude || 14.4378;

        const now = new Date();
        const past = new Date(now.getTime() - 24 * 3600 * 1000);
        const start_date = past.toISOString().split('T')[0];
        const end_date = now.toISOString().split('T')[0];

        const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&start_date=${start_date}&end_date=${end_date}&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();

        if (Array.isArray(data)) {
            return { times: data.map(item => item.date), temps: data.map(item => item.temperature) };
        }
        return { times: data.hourly.time, temps: data.hourly.temperature_2m };
    }

    /**
     * Build 15-minute outdoor grid for the past 24 hours.
     * @private
     */
    async _fetchDayData() {
        try {
            const data = await this._fetchTemperatureData();

            const now = new Date();
            const past24 = new Date(now.getTime() - 24 * 3600 * 1000);

            const grid = [];
            for (let t = new Date(past24); t <= now; t = new Date(t.getTime() + 15 * 60 * 1000)) {
                grid.push(new Date(t));
            }

            this.temperatureData.labels = grid.map(t =>
                t.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
            );
            this.temperatureData.times = grid;
            this.temperatureData.values = Array(grid.length).fill(null);

            if (!data) return;

            const hourly = [];
            for (let i = 0; i < data.times.length; i++) {
                const t = new Date(data.times[i]);
                if (!isNaN(t) && data.temps[i] !== null) {
                    hourly.push({ time: t, temp: data.temps[i] });
                }
            }
            hourly.sort((a, b) => a.time - b.time);
            if (!hourly.length) return;

            this._interpolateOntoGrid(grid, hourly, this.temperatureData.values);
        } catch (error) {
            console.error('Error fetching day temperature data:', error);
        }
    }

    /**
     * Build 2-hour outdoor grid for the past 7 days (~84 points, same density as 24h view).
     * @private
     */
    async _fetchWeekData() {
        try {
            await window.configPromise;
            const baseUrl = window.configData?.archiveApiAddress || 'https://archive-api.open-meteo.com/v1/archive';
            const lat = window.configData?.position?.latitude || 50.0755;
            const lon = window.configData?.position?.longitude || 14.4378;

            const now = new Date();
            const past7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
            past7.setHours(0, 0, 0, 0); // snap to midnight so grid always lands on 00:00
            const start_date = past7.toISOString().split('T')[0];
            const end_date = now.toISOString().split('T')[0];

            const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&start_date=${start_date}&end_date=${end_date}&timezone=auto`;
            const response = await fetch(url);
            const data = await response.json();

            const hourly = [];
            if (Array.isArray(data)) {
                for (const item of data) {
                    const t = new Date(item.date);
                    if (!isNaN(t) && item.temperature !== null) hourly.push({ time: t, temp: item.temperature });
                }
            } else {
                for (let i = 0; i < data.hourly.time.length; i++) {
                    const t = new Date(data.hourly.time[i]);
                    if (!isNaN(t) && data.hourly.temperature_2m[i] !== null) {
                        hourly.push({ time: t, temp: data.hourly.temperature_2m[i] });
                    }
                }
            }
            hourly.sort((a, b) => a.time - b.time);

            // 2-hour step → ~84 points over 7 days (matches 96 points over 24h at 15 min)
            const stepMs = 2 * 60 * 60 * 1000;
            const grid = [];
            for (let t = new Date(past7); t <= now; t = new Date(t.getTime() + stepMs)) {
                grid.push(new Date(t));
            }

            this.temperatureData.labels = grid.map(t =>
                t.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }) + ' ' +
                t.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
            );
            this.temperatureData.times = grid;
            this.temperatureData.values = Array(grid.length).fill(null);

            if (!hourly.length) return;

            this._interpolateOntoGrid(grid, hourly, this.temperatureData.values);
        } catch (error) {
            console.error('Error fetching week temperature data:', error);
        }
    }

    /**
     * Linear interpolation from hourly data onto an arbitrary time grid.
     * Mutates the provided `output` array in place.
     * @private
     */
    _interpolateOntoGrid(grid, hourly, output) {
        for (let i = 0; i < grid.length; i++) {
            const gt = grid[i];
            let before = null, after = null;
            for (const pt of hourly) {
                if (pt.time <= gt) before = pt;
                else if (!after) { after = pt; break; }
            }
            if (before && after) {
                const ratio = (gt - before.time) / (after.time - before.time);
                output[i] = parseFloat((before.temp + ratio * (after.temp - before.temp)).toFixed(1));
            } else if (before) {
                output[i] = before.temp;
            } else if (after) {
                output[i] = after.temp;
            }
        }
    }

    /**
     * Shared indoor fetch used by both day and week modes.
     * Aligns sensor readings onto the current `temperatureData` time grid.
     * @private
     * @param {number} windowMs - Time window in milliseconds
     * @param {number} interval - Sample interval in seconds
     */
    async _fetchIndoorSeriesData(windowMs, interval) {
        await window.configPromise;
        const cfg = window.configData;
        const now = new Date();
        const pastWindow = new Date(now.getTime() - windowMs);
        const start = pastWindow.toISOString();
        const end = now.toISOString();
        const base = cfg.indoorApiAddress + cfg.indoorApiEndpointRange;
        const p = cfg.indoorApiParams;
        const url = `${base}?${p.start}=${start}&${p.end}=${end}&${p.interval}=${interval}`;
        const res = await fetch(url);
        const series = await res.json();

        if (!series || !series.length) return;

        this.indoorData = Array(this.temperatureData.labels.length).fill(null);
        this.indoorHumidityData = Array(this.temperatureData.labels.length).fill(null);

        const chartTimePoints = this.temperatureData.times;

        const indoorDataPoints = [];
        for (let i = 0; i < series.length; i++) {
            const item = series[i];
            const raw = item.date || item.timestamp;
            const timeStr = (typeof raw === 'string' && !raw.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(raw))
                ? raw + 'Z'
                : raw;
            const time = new Date(timeStr);
            if (isNaN(time) || time < pastWindow || time > now) continue;
            indoorDataPoints.push({
                time,
                temp: parseFloat(item.temperature),
                humidity: item.humidity !== undefined ? parseFloat(item.humidity) : null
            });
        }

        indoorDataPoints.sort((a, b) => a.time - b.time);
        if (!indoorDataPoints.length) return;

        // Average all raw readings that fall within ±half the grid interval around each grid point.
        // Leaves null (no point plotted) when no readings exist in that window.
        const halfWindowMs = (interval * 1000) / 2;
        for (let i = 0; i < chartTimePoints.length; i++) {
            const center = chartTimePoints[i].getTime();
            const inWindow = indoorDataPoints.filter(
                p => p.time.getTime() >= center - halfWindowMs && p.time.getTime() <= center + halfWindowMs
            );
            if (inWindow.length === 0) continue; // leave null — no point plotted

            const avgTemp = inWindow.reduce((s, p) => s + p.temp, 0) / inWindow.length;
            this.indoorData[i] = parseFloat(avgTemp.toFixed(1));

            const withHumidity = inWindow.filter(p => p.humidity !== null);
            if (withHumidity.length > 0) {
                const avgHum = withHumidity.reduce((s, p) => s + p.humidity, 0) / withHumidity.length;
                this.indoorHumidityData[i] = parseFloat(avgHum.toFixed(1));
            }
        }

        // Always extend the indoor line to the rightmost chart point using the latest reading.
        // This prevents the line from stopping short of the right edge when the newest reading
        // falls outside the last bin window.
        const lastIdx = chartTimePoints.length - 1;
        if (this.indoorData[lastIdx] === null) {
            const latest = indoorDataPoints[indoorDataPoints.length - 1];
            this.indoorData[lastIdx] = parseFloat(latest.temp.toFixed(1));
            if (latest.humidity !== null) {
                this.indoorHumidityData[lastIdx] = parseFloat(latest.humidity.toFixed(1));
            }
        }
    }

    /** @private */
    async _fetchIndoorDayData() {
        try {
            await this._fetchIndoorSeriesData(24 * 3600 * 1000, 15 * 60);
        } catch (error) {
            console.error('Error fetching indoor temperature data:', error);
            this.indoorData = Array(this.temperatureData.labels.length).fill(null);
            this.indoorHumidityData = Array(this.temperatureData.labels.length).fill(null);
        }
    }

    /** @private */
    async _fetchIndoorWeekData() {
        try {
            await this._fetchIndoorSeriesData(7 * 24 * 3600 * 1000, 2 * 60 * 60);
        } catch (error) {
            console.error('Error fetching indoor week temperature data:', error);
            this.indoorData = Array(this.temperatureData.labels.length).fill(null);
            this.indoorHumidityData = Array(this.temperatureData.labels.length).fill(null);
        }
    }

    /**
     * Update chart with current data and mode-specific settings.
     * @private
     */
    _updateChart() {
        this.chart.data.labels = this.temperatureData.labels;
        this.chart.data.datasets[0].data = this.temperatureData.values;

        const hasIndoor = Array.isArray(this.indoorData) && this.indoorData.some(v => v !== null && v !== undefined);
        if (hasIndoor) {
            this.chart.data.datasets[1].data = this.indoorData;
            this.chart.data.datasets[1].hidden = false;
        } else {
            this.chart.data.datasets[1].data = [];
            this.chart.data.datasets[1].hidden = true;
        }

        if (this.chart.data.datasets[2]) {
            const hasHumidity = Array.isArray(this.indoorHumidityData) && this.indoorHumidityData.some(v => v !== null && v !== undefined);
            if (hasHumidity) {
                this.chart.data.datasets[2].data = this.indoorHumidityData;
                this.chart.data.datasets[2].hidden = false;
            } else {
                this.chart.data.datasets[2].data = [];
                this.chart.data.datasets[2].hidden = true;
            }
        }

        this.chart.options.plugins.title = {
            display: true,
            text: this.currentMode === 'day' ? 'Teploty (posledních 24 hodin)' : 'Teploty (posledních 7 dní)',
            font: { size: 11 }
        };

        if (this.currentMode === 'week') {
            // Show exactly one label per day at midnight, formatted as "10.5."
            const times = this.temperatureData.times;
            this.chart.options.scales.x.ticks = {
                maxRotation: 0,
                autoSkip: false,
                callback: function(value, index) {
                    const t = times[index];
                    if (!t) return null;
                    return (t.getHours() === 0 && t.getMinutes() === 0)
                        ? `${t.getDate()}.${t.getMonth() + 1}.`
                        : null;
                }
            };
        } else {
            this.chart.options.scales.x.ticks = {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 25
            };
        }

        this.chart.update();
    }

    /**
     * Set up timers for auto-refreshing chart data.
     * @private
     */
    _setupRefreshTimers() {
        setInterval(() => {
            const fetchOutdoor = this.currentMode === 'day' ? this._fetchDayData() : this._fetchWeekData();
            const fetchIndoor = this.currentMode === 'day' ? this._fetchIndoorDayData() : this._fetchIndoorWeekData();
            Promise.all([fetchOutdoor, fetchIndoor]).then(() => this._updateChart());
        }, 15 * 60 * 1000);
    }
}

// Initialize chart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded! Please include the Chart.js library.');
        return;
    }
    setTimeout(() => new TemperatureChart(), 100);
});
