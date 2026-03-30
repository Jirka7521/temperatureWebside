#pragma once

#include <Arduino.h>
#include "DHT.h"

// Copy this file to include/config.h and fill in your real values.
// include/config.h is ignored by Git to keep credentials private.

// WiFi credentials
constexpr char ssid[] = "YOUR_WIFI_SSID";
constexpr char password[] = "YOUR_WIFI_PASSWORD";

// API endpoint used for sending averaged sensor data
constexpr char API_URL[] = "https://your-api-endpoint/upload";

// Serial monitor speed (must match your serial monitor setting)
constexpr unsigned long SERIAL_BAUD_RATE = 9600UL;

// How long to wait for WiFi before rebooting (in milliseconds)
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000UL;

// Delay before reboot to allow logs to flush (in milliseconds)
constexpr unsigned long RESTART_DELAY_MS = 2000UL;

// DHT sensor pin and model
constexpr uint8_t DHT_SENSOR_PIN = 13;
constexpr uint8_t DHT_SENSOR_TYPE = DHT11;

// Read one measurement every this many milliseconds
constexpr unsigned long MEASUREMENT_INTERVAL_MS = 1000UL;

// Rolling average size (number of samples kept in memory)
constexpr int SAMPLE_COUNT = 10;

// Force upload if no threshold-triggered change happens within this time
constexpr unsigned long FORCE_SEND_INTERVAL_MS = 300000UL;

// Upload thresholds based on averaged values
constexpr float TEMP_THRESHOLD_C = 0.2f;
constexpr float HUMIDITY_THRESHOLD_PERCENT = 1.0f;
