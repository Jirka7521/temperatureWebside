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

## Directory Structure

```
.
├── esp32code.ino      # ESP32 firmware for indoor sensor
├── index.html         # Main dashboard HTML
├── style.css          # Dashboard styles (responsive, Bootstrap-based)
├── config.js          # Dashboard configuration (API endpoints, thresholds)
├── getValues.js       # JS logic for fetching/updating panel data
├── chartSetup.js      # JS logic for Chart.js temperature chart
├── README.md          # Project documentation
```

## ESP32 Firmware

- Reads temperature and humidity every second.
- Maintains a rolling average and only sends data if a threshold is exceeded or every 15 minutes.
- Sends data via HTTPS POST to a configurable API endpoint.
- WiFi credentials and API URL are set in the source.

## Web Dashboard

- **index.html:** Responsive layout with Bootstrap, two main panels (indoor, outdoor), and a 24-hour temperature chart.
- **style.css:** Custom styles for layout, cards, responsive text, and chart sizing.
- **config.js:** Central configuration for API endpoints, temperature thresholds, and refresh intervals.
- **getValues.js:** Handles fetching indoor/outdoor data, updating UI, and managing timers.
- **chartSetup.js:** Fetches and displays 24-hour temperature data for both indoor and outdoor sources using Chart.js.

## Running the Project

1. **ESP32 Setup:**
     - Flash `esp32code.ino` to your ESP32.
     - Set your WiFi credentials and API endpoint in the code.
     - Deploy a compatible API server to receive and store sensor data.

2. **Dashboard:**
     - Place all web files (`index.html`, `style.css`, `config.js`, `getValues.js`, `chartSetup.js`) in a directory.
     - Serve the directory with a static file server, or deploy to a static web hosting service.
     - Open `index.html` in your browser or access your deployed web app URL.

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

Edit `config.js` to set:
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
