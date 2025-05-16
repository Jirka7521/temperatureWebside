/**
 * Weather Dashboard Main Logic
 * Manages configuration, temperature panels, and update timers
 * Uses OOP principles for modularity and maintainability
 */

/**
 * Configuration Manager - handles application settings
 */
class ConfigManager {
    constructor() {
        this.config = {};
        // Promise to signal when config is loaded
        window.configPromise = new Promise((resolve, reject) => {
            this._resolveConfigPromise = resolve;
            this._rejectConfigPromise = reject;
        });
        this.loadConfig();
    }

    /**
     * Load configuration from inline JS or config.json
     */
    async loadConfig() {
        // 1) Inline JS config (config.js) has highest priority
        if (window.inlineConfig) {
            this.config = window.inlineConfig;
            window.configData = this.config;
            this._resolveConfigPromise(this.config);
            return;
        }

        // 2) Otherwise fetch config.json over HTTP
        try {
            const response = await fetch('./config.json');
            if (!response.ok) {
                throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
            }
            this.config = await response.json();
            window.configData = this.config;
            this._resolveConfigPromise(this.config);
        } catch (error) {
            console.error('Error loading configuration. Application cannot start without a valid config.json:', error);
            this._rejectConfigPromise(error);
            // Display a user-friendly error message on the page
            try {
                document.body.innerHTML = `<div style="color: red; text-align: center; padding: 20px; font-family: sans-serif;">
                                               <h1>Configuration Error</h1>
                                               <p>Could not load config.json. Application cannot start.</p>
                                               <p>Details: ${error.message}</p>
                                           </div>`;
            } catch (displayError) {
                console.error("Failed to display configuration error on page:", displayError);
            }
        }
    }

    /**
     * Get configuration value by key
     * @param {string} key
     * @param {*} defaultValue
     * @returns {*}
     */
    get(key, defaultValue) {
        return key in this.config ? this.config[key] : defaultValue;
    }
}

/**
 * Abstract Panel class for shared logic
 */
class Panel {
    constructor(config) {
        this.config = config;
    }
}

/**
 * Indoor Temperature Panel Controller
 */
class IndoorTemperaturePanel extends Panel {
    /**
     * @param {string} tempId - Temperature element ID
     * @param {string} humidityId - Humidity element ID
     * @param {Object} config - Application configuration
     */
    constructor(tempId, humidityId, config) {
        super(config);
        this.tempElement = document.getElementById(tempId);
        this.humidityElement = document.getElementById(humidityId);
        this.headingElement = document.querySelector('.panel-heading');
    }

    /**
     * Update panel with current indoor data
     */
    async update() {
        try {
            const apiUrl = this.config.indoorApiAddress + this.config.indoorApiEndpointCurrent;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data && data.length > 0) {
                const indoorData = data[0];
                const temp = parseFloat(indoorData.temperature);
                const roundedTemp = Math.round(temp * 10) / 10;
                this.tempElement.textContent = `${roundedTemp}°C`;
                this.tempElement.className = 'responsive-value';
                this._applyTemperatureClass(temp);

                const humidity = parseFloat(indoorData.humidity);
                const roundedHumidity = Math.round(humidity * 10) / 10;
                this.humidityElement.textContent = `${roundedHumidity}%`;
                this.humidityElement.className = 'responsive-value';

                this._checkDataFreshness(new Date(indoorData.date));
                window.secondsSinceDataRefresh = 0;
            } else {
                throw new Error("No data received");
            }
        } catch (e) {
            console.error("Error fetching indoor temperature data:", e);
            this.tempElement.textContent = '--°C';
            this.humidityElement.textContent = '--%';
        }
    }

    /**
     * Check if data is fresh and apply UI indicators if not
     * @private
     * @param {Date} dataTimestamp
     */
    _checkDataFreshness(dataTimestamp) {
        if (!dataTimestamp || isNaN(dataTimestamp.getTime())) return;
        const now = new Date();
        const diffSeconds = Math.floor((now - dataTimestamp) / 1000);
        const maxAge = this.config.indoorDataMaxAge;
        if (diffSeconds > maxAge) {
            if (this.headingElement) {
                this.headingElement.classList.add('stale-data');
            }
        } else {
            if (this.headingElement) {
                this.headingElement.classList.remove('stale-data');
            }
        }
    }

    /**
     * Apply appropriate text color based on temperature
     * @private
     * @param {number} temp
     */
    _applyTemperatureClass(temp) {
        if (this.config && this.config.temperatureThresholds) {
            const thresholds = this.config.temperatureThresholds;
            let color;
            if (temp < thresholds.cold.value) {
                color = thresholds.cold.color;
            } else if (temp < thresholds.cool.value) {
                color = thresholds.cool.color;
            } else if (temp < thresholds.normal.value) {
                color = thresholds.normal.color;
            } else if (temp < thresholds.warm.value) {
                color = thresholds.warm.color;
            } else {
                color = "#FF0000";
            }
            this.tempElement.style.color = color;
        }
    }

    /**
     * Fetch historical range data
     * @param {string} start - ISO date string
     * @param {string} end - ISO date string
     * @param {number} interval - seconds between samples
     * @returns {Promise<Array>} time‐series data
     */
    async fetchRange(start, end, interval) {
        const base = this.config.indoorApiAddress + this.config.indoorApiEndpointRange;
        const params = this.config.indoorApiParams;
        const url = `${base}?${params.start}=${encodeURIComponent(start)}&${params.end}=${encodeURIComponent(end)}&${params.interval}=${interval}`;
        const resp = await fetch(url);
        return resp.json();
    }
}

/**
 * Outdoor Temperature Panel Controller
 */
class OutdoorTemperaturePanel extends Panel {
    /**
     * @param {string} tempId - Temperature element ID
     * @param {string} rainId - Rain forecast element ID 
     * @param {Object} config - Application configuration
     */
    constructor(tempId, rainId, config) {
        super(config);
        this.tempElement = document.getElementById(tempId);
        this.rainElement = document.getElementById(rainId);
    }

    /**
     * Fetch current weather data from API
     * @returns {Promise<Object>} Weather data
     */
    async fetchWeather() {
        const baseUrl = this.config.apiAddress;
        const lat = this.config.position.latitude;
        const lon = this.config.position.longitude;
        const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();

        let currentIndex = 0;
        if (Array.isArray(data.hourly?.time)) {
            const now = new Date();
            const matchIndex = data.hourly.time.findIndex(t => {
                const dt = new Date(t);
                return dt.getHours() === now.getHours() && dt.getDate() === now.getDate();
            });
            if (matchIndex >= 0) {
                currentIndex = matchIndex;
            }
        }

        return {
            temperature: data.current?.temperature_2m,
            precipitation: data.current?.precipitation,
            rainProbability: data.hourly?.precipitation_probability?.[currentIndex] ?? null
        };
    }

    /**
     * Update panel with current weather data
     */
    async update() {
        try {
            const outdoor = await this.fetchWeather();
            if (typeof outdoor.temperature === 'number') {
                this.tempElement.textContent = `${outdoor.temperature}°C`;
                this.tempElement.className = 'responsive-value';
                this._applyTemperatureClass(outdoor.temperature);
            } else {
                this.tempElement.textContent = '--°C';
            }
            this._updateRainDisplay(outdoor);
        } catch (e) {
            this.tempElement.textContent = '--°C';
            this.rainElement.textContent = 'Žádná data o srážkách';
        }
    }

    /**
     * Apply appropriate text color based on temperature
     * @private
     * @param {number} temp
     */
    _applyTemperatureClass(temp) {
        if (this.config && this.config.temperatureThresholds) {
            const thresholds = this.config.temperatureThresholds;
            let color;
            if (temp < thresholds.cold.value) {
                color = thresholds.cold.color;
            } else if (temp < thresholds.cool.value) {
                color = thresholds.cool.color;
            } else if (temp < thresholds.normal.value) {
                color = thresholds.normal.color;
            } else if (temp < thresholds.warm.value) {
                color = thresholds.warm.color;
            } else {
                color = "#FF0000";
            }
            this.tempElement.style.color = color;
        }
    }

    /**
     * Update rain/precipitation information
     * @private
     * @param {Object} outdoor - Weather data
     */
    _updateRainDisplay(outdoor) {
        if (typeof outdoor.rainProbability === 'number') {
            this.rainElement.textContent = `Pravděpodobnost deště: ${outdoor.rainProbability}%`;
        } else if (typeof outdoor.precipitation === 'number') {
            this.rainElement.textContent = `Srážky: ${outdoor.precipitation} mm`;
        } else {
            this.rainElement.textContent = 'Žádná data o srážkách';
        }
    }
}

/**
 * Dashboard Controller - orchestrates UI updates and timers
 */
class DashboardController {
    constructor() {
        // Initialize config manager
        this.configManager = new ConfigManager();
        window.secondsSinceDataRefresh = 0;
        // Wait for configuration to load before initializing panels
        this.initialize();
        // Setup event listeners for responsive text
        window.addEventListener('resize', this.resizeValueText);
        window.addEventListener('DOMContentLoaded', this.resizeValueText);
    }

    /**
     * Initialize panels and timers after configuration is loaded
     */
    async initialize() {
        try {
            // Wait for config to be available
            const config = await window.configPromise;
            this.config = config;
            // Initialize panels
            this.indoorPanel = new IndoorTemperaturePanel('temperature', 'humidity', this.config);
            this.outdoorPanel = new OutdoorTemperaturePanel('outdoor-temperature', 'rain-forecast', this.config);
            // Setup timers
            this._setupTimers();
            // Initial updates
            this.updatePanels();
            this.updateCurrentTime();
            this.loadHistoricalData();
        } catch (error) {
            console.error("Failed to initialize dashboard:", error);
        }
    }

    /**
     * Setup all timer-based functions
     * @private
     */
    _setupTimers() {
        setInterval(() => this.updateCurrentTime(), 1000);
        setInterval(() => this.updateTimeSinceRefresh(), 1000);
        const refreshInterval = this.config.refreshInterval;
        setInterval(() => this.updatePanels(), refreshInterval);
    }

    /**
     * Update all panels with current data
     */
    async updatePanels() {
        if (this.indoorPanel) await this.indoorPanel.update();
        if (this.outdoorPanel) await this.outdoorPanel.update();
    }

    /**
     * Update the current time display
     */
    updateCurrentTime() {
        const now = new Date();
        document.getElementById('current-time').textContent =
            `Aktuální čas: ${now.toLocaleTimeString('cs-CZ')}`;
    }

    /**
     * Update the time-since-refresh display
     */
    updateTimeSinceRefresh() {
        window.secondsSinceDataRefresh++;
        const e = document.getElementById('time-since');
        if (window.secondsSinceDataRefresh < 60) {
            e.textContent = 'Čas od aktualizace: méně než minuta';
            e.classList.remove('time-expired');
        } else {
            e.textContent = `Čas od aktualizace: ${Math.floor(window.secondsSinceDataRefresh / 60)} min`;
            e.classList.add('time-expired');
        }
    }

    /**
     * Resize text elements to fit container (CSS handles actual sizing)
     */
    resizeValueText() {
        const elements = document.querySelectorAll('.responsive-value');
        elements.forEach(el => {
            if (!el) return;
            // Responsive sizing handled by CSS
        });
    }

    /**
     * Load and display historical data for indoor (and outdoor) on the chart
     */
    async loadHistoricalData() {
        const now = new Date();
        const past = new Date(now.getTime() - 24 * 3600 * 1000); // last 24 h
        const interval = this.config.refreshInterval / 1000; // in seconds
        const startIso = past.toISOString();
        const endIso = now.toISOString();
        // fetch indoor time-series
        const indoorSeries = await this.indoorPanel.fetchRange(startIso, endIso, interval);
        // TODO: pass indoorSeries to your charting logic alongside outdoor data
        // e.g. this.chart.updateIndoor(indoorSeries);
    }
}

// Initialize the dashboard when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
});
