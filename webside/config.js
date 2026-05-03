// Inline configuration for the weather and sensor dashboard
// This file is intended for quick local edits. In containerized
// deployments `config.template.js` is processed at startup to produce
// a concrete `config.js` with values taken from environment variables.
// See `docker-entrypoint.sh` for the substitution logic.
window.inlineConfig = {
  // Temperature thresholds for color coding
  temperatureThresholds: {
    cold:   { value: 15, color: "#0000CC" },   // ≤ 15°C: blue
    cool:   { value: 20, color: "#00CCCC" },   // ≤ 20°C: cyan
    normal: { value: 25, color: "#00CC00" },   // ≤ 25°C: green
    warm:   { value: 30, color: "#CCCC00" }    // ≤ 30°C: yellow
  },

  // API endpoint for outdoor weather data
  // Public weather API used for outdoor forecasts
  apiAddress: "https://api.open-meteo.com/v1/forecast",
  // Archive API for historical weather data (Open-Meteo archive)
  archiveApiAddress: "https://archive-api.open-meteo.com/v1/archive",

  // API endpoint for indoor sensor data
  // Use the server host reachable by clients. For local testing the backend
  // is usually available on the host at port 8000 (see docker-compose). If
  // you run the frontend in a browser on the same machine use localhost.
  indoorApiAddress: "http://localhost:8000/",

  // Indoor API endpoints for current and historical data
  indoorApiEndpointCurrent: "getCurrent",
  indoorApiEndpointRange:   "getPast",

  // Parameter names for indoor API requests
  indoorApiParams: {
    start:    "start",    // Start time parameter
    end:      "end",      // End time parameter
    interval: "interval"  // Interval parameter
  },

  indoorDataMaxAge: 60, // Maximum age (in seconds) for cached indoor data

  // Default position (latitude, longitude) for weather data
  position: { latitude: 50.0800175, longitude: 14.3939161 },

  refreshInterval: 15000 // Data refresh interval in milliseconds (15 seconds)
};
