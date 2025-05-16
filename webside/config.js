// Inline configuration for the weather and sensor dashboard
window.inlineConfig = {
  // Temperature thresholds for color coding
  temperatureThresholds: {
    cold:   { value: 15, color: "#0000CC" },   // ≤ 15°C: blue
    cool:   { value: 20, color: "#00CCCC" },   // ≤ 20°C: cyan
    normal: { value: 25, color: "#00CC00" },   // ≤ 25°C: green
    warm:   { value: 30, color: "#CCCC00" }    // ≤ 30°C: yellow
  },

  // API endpoint for outdoor weather data
  apiAddress: "https://api.open-meteo.com/v1/forecast",

  // API endpoint for indoor sensor data
  indoorApiAddress: "API address for indoor sensors",

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
  position: { latitude: 50.0000, longitude: 15.00000 },

  refreshInterval: 15000 // Data refresh interval in milliseconds (15 seconds)
};
