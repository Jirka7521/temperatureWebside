/**
 * Temperature Chart Module
 * Handles chart initialization, data loading, and display.
 */

class TemperatureChart {
    /**
     * Initialize chart controller.
     * Sets up chart, loads data, and configures refresh.
     */
    constructor() {
        // Chart.js chart instance
        this.chart = null;
        // Canvas element for rendering the chart
        this.chartCanvas = document.getElementById('weatherChart');

        // Ensure the canvas element exists and set a default height if needed
        if (!this.chartCanvas) {
            console.error('Canvas element with id "weatherChart" not found.');
            return;
        }
        if (!this.chartCanvas.style.height) {
            this.chartCanvas.style.height = '300px';
        }

        // Data structures for storing chart data
        this.temperatureData = { labels: [], values: [] };
        this.indoorData = [];

        // Initialize chart, load data, and set up refresh timers
        this._initChart();
        this._loadData();
        this._setupRefreshTimers();

        // UI: Mark day view as active and hide week view button if present
        this._setupUI();
    }

    /**
     * Set up UI elements for day/week view.
     * @private
     */
    _setupUI() {
        const dayViewButton = document.getElementById('dayView');
        if (dayViewButton) {
            dayViewButton.classList.add('active');
        }
        const weekViewButton = document.getElementById('weekView');
        if (weekViewButton) {
            weekViewButton.style.display = 'none';
        }
    }

    /**
     * Initialize the Chart.js chart.
     * @private
     */
    _initChart() {
        // Ensure canvas has a height for Chart.js rendering
        if (!this.chartCanvas.height) {
            this.chartCanvas.height = this.chartCanvas.clientHeight || 300;
        }

        this.chart = new Chart(this.chartCanvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Venkovní teplota (°C)',
                        data: [],
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.2,
                        borderWidth: 2,
                        pointRadius: 3
                    },
                    {
                        label: 'Vnitřní teplota (°C)',
                        data: [],
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: true,
                        tension: 0.2,
                        borderWidth: 2,
                        pointRadius: 3
                    }
                ]
            },
            options: this._getChartOptions()
        });
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
            aspectRatio: 3, // More horizontally oriented chart
            layout: {
                padding: { top: 0, right: 4, bottom: 0, left: 4 }
            },
            scales: {
                x: {
                    type: 'category',
                    title: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 25 // Show more time labels
                    }
                },
                y: {
                    title: { display: false },
                    beginAtZero: false,
                    ticks: { maxTicksLimit: 5 }
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
     * Load temperature and indoor data for the day view.
     * @private
     */
    async _loadData() {
        await this._fetchDayData();
        await this._fetchIndoorDayData();
        this._updateChart();
    }

    /**
     * Fetch temperature data for the past 24 hours.
     * Supports multiple response formats.
     * @private
     * @returns {Promise<Object>} Temperature data in the format { times: [], temps: [] }
     */
    async _fetchTemperatureData() {
        await configPromise;
        const baseUrl = configData?.apiAddress || 'https://api.open-meteo.com/v1/forecast';
        const lat = configData?.position?.latitude || 50.0755;
        const lon = configData?.position?.longitude || 14.4378;

        const now = new Date();
        const past = new Date(now.getTime() - 24 * 3600 * 1000);
        const start_date = past.toISOString().split('T')[0];
        const end_date = now.toISOString().split('T')[0];

        const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&start_date=${start_date}&end_date=${end_date}&timezone=UTC`;
        const response = await fetch(url);
        const data = await response.json();

        // Handle array or object response
        if (Array.isArray(data)) {
            const times = data.map(item => item.date);
            const temps = data.map(item => item.temperature);
            return { times, temps };
        }
        return {
            times: data.hourly.time,
            temps: data.hourly.temperature_2m
        };
    }

    /**
     * Fetch and process temperature data for the past 24 hours.
     * Interpolates values for 15-minute intervals.
     * @private
     */
    async _fetchDayData() {
        try {
            const data = await this._fetchTemperatureData();
            if (!data) return;

            const { times, temps } = data;
            this.temperatureData.labels = [];
            this.temperatureData.values = [];

            const now = new Date();
            const past24 = new Date(now.getTime() - 24 * 3600 * 1000);

            // Filter times and temps to only include those within the last 24 hours
            let filteredTimes = [];
            let filteredTemps = [];
            for (let i = 0; i < times.length; i++) {
                const time = new Date(times[i] + 'Z'); // Parse API time as UTC
                if (time >= past24 && time <= now) {
                    filteredTimes.push(time);
                    filteredTemps.push(temps[i]);
                }
            }

            // Add actual readings and interpolate between them
            for (let i = 0; i < filteredTimes.length; i++) {
                const time = filteredTimes[i];
                // Add actual reading
                this.temperatureData.labels.push(
                    time.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
                );
                this.temperatureData.values.push(filteredTemps[i]);

                // Interpolate between current and next point if available
                if (i < filteredTimes.length - 1) {
                    const currentTemp = filteredTemps[i];
                    const nextTemp = filteredTemps[i + 1];
                    const interpolatedPoints = this._interpolateTemperaturePoints(
                        time,
                        filteredTimes[i + 1],
                        currentTemp,
                        nextTemp,
                        3 // 3 intervals (15, 30, 45 min)
                    );
                    for (const point of interpolatedPoints) {
                        this.temperatureData.labels.push(
                            point.time.toLocaleTimeString('cs-CZ', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                            })
                        );
                        this.temperatureData.values.push(point.temp);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching day temperature data:', error);
        }
    }

    /**
     * Interpolate temperature values between two time points.
     * @private
     * @param {Date} startTime - Start time
     * @param {Date} endTime - End time
     * @param {number} startTemp - Temperature at start
     * @param {number} endTemp - Temperature at end
     * @param {number} intervals - Number of intervals (e.g., 3 for 15, 30, 45 min)
     * @returns {Array<{time: Date, temp: number}>}
     */
    _interpolateTemperaturePoints(startTime, endTime, startTemp, endTemp, intervals) {
        const points = [];
        const diff = endTemp - startTemp;
        const intervalMinutes = 15;
        for (let j = 1; j <= intervals; j++) {
            const interpolatedTime = new Date(startTime);
            interpolatedTime.setMinutes(startTime.getMinutes() + j * intervalMinutes);
            // Only add if before next full data point
            if (interpolatedTime.getTime() >= endTime.getTime()) break;
            // Linear interpolation
            const temp = parseFloat((startTemp + (diff * j / (intervals + 1))).toFixed(1));
            points.push({ time: interpolatedTime, temp });
        }
        return points;
    }

    /**
     * (Unused) Add interpolated temperature values between hourly measurements.
     * @private
     */
    _addInterpolatedValues(index, times, temps) {
        // ...existing code...
    }

    /**
     * Fetch indoor temperature data for the past day and align with chart labels.
     * @private
     */
    async _fetchIndoorDayData() {
        try {
            await window.configPromise;
            const cfg = window.configData;
            const now = new Date();
            const past24 = new Date(now.getTime() - 24 * 3600 * 1000);
            // Request data in UTC from the API
            const start = past24.toISOString();
            const end = now.toISOString();
            const interval = 15 * 60; // 15-minute samples
            const base = cfg.indoorApiAddress + cfg.indoorApiEndpointRange;
            const p = cfg.indoorApiParams;
            const url = `${base}?${p.start}=${start}&${p.end}=${end}&${p.interval}=${interval}`;
            const res = await fetch(url);
            const series = await res.json();

            if (!series || !series.length) return;

            // Reset indoor data array to match the length of temperatureData labels
            this.indoorData = Array(this.temperatureData.labels.length).fill(null);

            // Create array of time points from labels (as Date objects)
            const chartTimePoints = this.temperatureData.labels.map(timeStr => {
                return this._parseTimeLabel(timeStr);
            });

            // Convert temperature series to array of {time, temp} objects
            const indoorDataPoints = [];
            for (let i = 0; i < series.length; i++) {
                const item = series[i];
                // Convert UTC time to local
                const utcTime = new Date(item.date || item.timestamp);
                const localTime = new Date(utcTime.getTime() - utcTime.getTimezoneOffset() * 60000);

                // Skip data outside our 24-hour window
                if (localTime < past24 || localTime > now) continue;

                indoorDataPoints.push({
                    time: localTime,
                    temp: parseFloat(item.temperature)
                });
            }

            // Sort by time to ensure chronological order
            indoorDataPoints.sort((a, b) => a.time - b.time);
            if (!indoorDataPoints.length) return;

            // For each chart time point, pick the nearest data point
            for (let i = 0; i < chartTimePoints.length; i++) {
                const chartTime = chartTimePoints[i];
                let nearestIndex = -1;
                let minDiff = Infinity;

                // Find the data point whose timestamp is closest to chartTime
                for (let j = 0; j < indoorDataPoints.length; j++) {
                    const diff = Math.abs(indoorDataPoints[j].time.getTime() - chartTime.getTime());
                    if (diff < minDiff) {
                        minDiff = diff;
                        nearestIndex = j;
                    }
                }

                if (nearestIndex !== -1) {
                    this.indoorData[i] = indoorDataPoints[nearestIndex].temp;
                }
            }

            // Fill any remaining null values with nearest values (forward and backward fill)
            this._fillMissingIndoorData();
        } catch (error) {
            console.error('Error fetching indoor temperature data:', error);
            this.indoorData = Array(this.temperatureData.labels.length).fill(null);
        }
    }

    /**
     * Fill missing indoor data values by forward and backward filling.
     * @private
     */
    _fillMissingIndoorData() {
        let lastValidValue = null;
        // Forward fill
        for (let i = 0; i < this.indoorData.length; i++) {
            if (this.indoorData[i] !== null) {
                lastValidValue = this.indoorData[i];
            } else if (lastValidValue !== null) {
                this.indoorData[i] = lastValidValue;
            }
        }
        // Backward fill if needed
        lastValidValue = null;
        for (let i = this.indoorData.length - 1; i >= 0; i--) {
            if (this.indoorData[i] !== null) {
                lastValidValue = this.indoorData[i];
            } else if (lastValidValue !== null) {
                this.indoorData[i] = lastValidValue;
            }
        }
    }

    /**
     * Helper method to parse time labels back to Date objects.
     * @private
     * @param {string} timeStr - Time string in "HH:mm" format
     * @returns {Date}
     */
    _parseTimeLabel(timeStr) {
        const today = new Date();
        const [hours, minutes] = timeStr.split(':').map(Number);
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
    }

    /**
     * Update chart with current data.
     * @private
     */
    _updateChart() {
        // Update chart data directly using simplified structures
        this.chart.data.labels = this.temperatureData.labels;
        this.chart.data.datasets[0].data = this.temperatureData.values;
        this.chart.data.datasets[1].data = this.indoorData;

        this.chart.options.plugins.title = {
            display: true,
            text: 'Teploty (posledních 24 hodin)'
        };

        this.chart.update();
    }

    /**
     * Set up timers for auto-refreshing chart data.
     * @private
     */
    _setupRefreshTimers() {
        // Refresh day data every 15 minutes, including indoor
        setInterval(() =>
            Promise.all([this._fetchDayData(), this._fetchIndoorDayData()])
                .then(() => {
                    this._updateChart();
                }),
            15 * 60 * 1000
        );
    }
}

// Initialize chart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded! Please include the Chart.js library.');
        return;
    }
    // Delay initialization slightly to ensure config is loaded
    setTimeout(() => new TemperatureChart(), 100);
});