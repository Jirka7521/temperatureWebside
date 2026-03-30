# Meteorological Dashboard (PPC Semestral Project)

This repository contains a complete solution for a meteorological dashboard, developed as a semestral project for the B2B99PPC (Praktické programování v C/C++) course. The project features an ESP32-based indoor sensor, a web dashboard for real-time and historical data visualization, and integration with an external weather API.

## Project Overview

- **Indoor Sensing:** An ESP32 microcontroller with a DHT11 sensor measures temperature and humidity, sending data to a REST API when significant changes occur or at regular intervals.
- **Web Dashboard:** A responsive web application displays indoor and outdoor weather data, including real-time values and 24-hour charts for both.
- **Data Sources:** 
    - Indoor data is collected from the ESP32 and stored via a custom API.
    - Outdoor data is fetched from an external weather API.
- **Visualization:** Uses Chart.js for interactive temperature charts, with color-coded values and responsive design.

## Requirements

- ESP32 development board
- DHT11 (or compatible) temperature/humidity sensor
- WiFi network for ESP32
- Node.js or any static file server for the dashboard
- Modern web browser
- Chart.js (loaded via CDN)
- Bootstrap 5 (loaded via CDN)

## Repository Structure

```
.
├── ESP32/
│   └── ESP32TempSensor/           # PlatformIO ESP32 firmware project
├── webside/                       # Static frontend dashboard
├── API/                           # .NET backend API and web projects
└── README.md                      # Project documentation
```

## ESP32 Firmware

- Built with PlatformIO in [ESP32/ESP32TempSensor](ESP32/ESP32TempSensor).
- Reads temperature and humidity every second.
- Maintains a rolling average and sends data when thresholds are exceeded or after a max interval.
- Sends data via HTTPS POST to a configurable API endpoint.
- Uses modular classes for logging, averaging, WiFi connection, and telemetry sending.
- Automatically reboots and retries if WiFi connection fails (timeout) or HTTP send fails.

### ESP32 Project Layout

```text
ESP32/ESP32TempSensor/
├── include/
│   ├── config.example.h      # Git-tracked template with all settings
│   ├── config.h              # Local real config (ignored by Git)
│   ├── Logger.h
│   ├── SensorAverager.h
│   ├── TelemetrySender.h
│   ├── WifiHelper.h
│   └── AppConstants.h        # Compatibility wrapper
├── src/
│   ├── main.cpp
│   ├── Logger.cpp
│   ├── TelemetrySender.cpp
│   └── WifiHelper.cpp
└── platformio.ini
```

### ESP32 Configuration

1. Copy [ESP32/ESP32TempSensor/include/config.example.h](ESP32/ESP32TempSensor/include/config.example.h) to [ESP32/ESP32TempSensor/include/config.h](ESP32/ESP32TempSensor/include/config.h).
2. Fill in your real WiFi and API values.
3. Tune runtime settings in config:
   - serial baud rate
   - DHT pin/type
   - sample count
   - measurement interval
   - temperature/humidity thresholds
   - max send interval
   - WiFi timeout and reboot delay

Note: [ESP32/ESP32TempSensor/include/config.h](ESP32/ESP32TempSensor/include/config.h) is ignored by Git; [ESP32/ESP32TempSensor/include/config.example.h](ESP32/ESP32TempSensor/include/config.example.h) is committed.

## Web Dashboard

- Frontend files are in [webside](webside).
- [webside/index.html](webside/index.html): Responsive layout with Bootstrap, indoor/outdoor panels, and a 24-hour chart.
- [webside/style.css](webside/style.css): Responsive styles and card/chart layout.
- [webside/config.js](webside/config.js): Central endpoints and refresh/threshold settings.
- [webside/getValues.js](webside/getValues.js): Periodic data fetch and UI updates.
- [webside/chartSetup.js](webside/chartSetup.js): Chart.js setup for indoor/outdoor history.

## Running the Project

1. **ESP32 Setup:**
    - Open [ESP32/ESP32TempSensor](ESP32/ESP32TempSensor) in PlatformIO.
    - Create [ESP32/ESP32TempSensor/include/config.h](ESP32/ESP32TempSensor/include/config.h) from the example template.
    - Build and upload firmware to ESP32.
    - Run serial monitor with the configured baud rate from config.
    - Deploy a compatible API server to receive/store sensor data.

2. **Dashboard:**
    - Use files from [webside](webside).
    - Serve the directory with a static file server, or deploy to a static web hosting service.
    - Open [webside/index.html](webside/index.html) in your browser or access your deployed web app URL.

### Deploying to Static Web Hosting

To deploy the dashboard to a static web hosting service:

1. Push your project to a repository.
2. In your hosting provider's portal, create a new static web app and link it to your repository.
3. Set the app location to the root folder (where `index.html` is located).
4. The service will automatically build and deploy your site.
5. Access your dashboard via the provided web app URL.

## Hosting & API Backend

- The dashboard frontend is hosted on a static web app service.
- The backend REST API is deployed separately and provides endpoints for storing and retrieving indoor sensor data.
- The frontend communicates with the backend API using HTTPS.

## Database Structure

The backend uses a SQL database with a single table for sensor readings:

```sql
CREATE TABLE SensorTable (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Temperature FLOAT NOT NULL,
    Humidity FLOAT NOT NULL,
    Date DATETIME2 NOT NULL
);
```

- **Id**: Auto-increment primary key
- **Temperature**: Measured temperature (°C)
- **Humidity**: Measured humidity (%)
- **Date**: UTC timestamp of the reading

## Configuration

Edit [webside/config.js](webside/config.js) to set:
- API endpoints for indoor and outdoor data
- Temperature thresholds for color coding
- Location coordinates for outdoor weather
- Data refresh intervals

## Authors

- Jiří Majer

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Note
Development was in GitLab under CTU
