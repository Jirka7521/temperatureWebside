#include "DHT.h"
#include "../include/config.h"
#include <WiFi.h>
#include <HTTPClient.h> // Required for making HTTP requests
#include <WiFiClientSecure.h> // Required for HTTPS connections
#include <stdarg.h> // for variadic logging
#include <stdio.h>
#include <string.h>

// Sensor Configuration
#define DHT_SENSOR_PIN 13      // Digital pin connected to the DHT11 temperature/humidity sensor
#define DHT_SENSOR_TYPE DHT11  // Sensor model (DHT11, DHT22, etc.)
#define MEASUREMENT_INTERVAL 1000 // Sampling interval in milliseconds (1 second)
#define SAMPLE_COUNT 10        // Number of readings to store for calculating rolling average

// Data Transmission Parameters
#define FORCE_SEND_INTERVAL 300000 // Maximum time between transmissions (15 minutes in milliseconds)

// Change Detection Thresholds
#define TEMP_THRESHOLD 0.2     // Temperature change threshold in Celsius to trigger data transmission
#define HUMIDITY_THRESHOLD 1.0 // Humidity change threshold in percent to trigger data transmission

// Initialize DHT sensor
DHT dhtSensor(DHT_SENSOR_PIN, DHT_SENSOR_TYPE);

// Circular buffers for rolling average calculation
float temperatureReadings[SAMPLE_COUNT]; // Buffer for temperature readings
float humidityReadings[SAMPLE_COUNT];    // Buffer for humidity readings
int currentReadingIndex = 0;             // Current position in the circular buffer
bool bufferFilled = false;               // Flag indicating if buffer has been filled at least once

// State tracking variables
float lastSentTemperature = NAN;         // Last temperature value sent to server (start as NAN so first send occurs)
float lastSentHumidity = NAN;            // Last humidity value sent to server (start as NAN so first send occurs)
unsigned long lastSendTime = 0;         // Timestamp of last data transmission (in milliseconds)

// ---- Timestamped Serial logging helpers ----
// Ensures every line starts with a runtime prefix like [hh:mm:ss.mmm]
bool _logAtLineStart = true;

void _logPrefixIfNeeded() {
  if (_logAtLineStart) {
    unsigned long ms = millis();
    unsigned long s = ms / 1000UL;
    unsigned long m = s / 60UL;
    unsigned long h = m / 60UL;
    s %= 60UL;
    m %= 60UL;
    char buf[32];
    snprintf(buf, sizeof(buf), "[%02lu:%02lu:%02lu.%03lu] ", h, m, s, ms % 1000UL);
    Serial.print(buf);
    _logAtLineStart = false;
  }
}

// Generic print/println that handle different types and keep correct prefixing
template <typename T>
void logPrint(const T &value) {
  _logPrefixIfNeeded();
  Serial.print(value);
  _logAtLineStart = false;
}

template <typename T>
void logPrintln(const T &value) {
  _logPrefixIfNeeded();
  Serial.println(value);
  _logAtLineStart = true;
}

// Handle C-strings that may contain leading or embedded newlines
void logPrint(const char *msg) {
  if (!msg) return;
  // Print while respecting embedded newlines and keeping prefixes at line starts
  const char *p = msg;
  while (*p) {
    // If a newline is next, emit newline and mark next as line start
    if (*p == '\n') {
      // Ensure even empty lines get a prefix
      _logPrefixIfNeeded();
      Serial.println();
      _logAtLineStart = true;
      ++p;
      continue;
    }
    _logPrefixIfNeeded();
    // Print until next newline or end
    const char *start = p;
    while (*p && *p != '\n') ++p;
    while (start < p) {
      Serial.print(*start++);
    }
    _logAtLineStart = false;
  }
}

void logPrintln(const char *msg) {
  if (!msg) msg = "";
  // Use newline-aware print to prefix each line, then terminate with newline
  logPrint(msg);
  Serial.println();
  _logAtLineStart = true;
}

// Arduino String overloads to ensure embedded newlines are handled per-line
void logPrint(const String &s) {
  logPrint(s.c_str());
}
void logPrintln(const String &s) {
  logPrintln(s.c_str());
}

// printf-style helper
void logPrintf(const char *fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  // Reuse newline-aware print to ensure all lines are prefixed
  logPrint(buf);
}

void setup() {
  Serial.begin(115200);
  dhtSensor.begin();

  // Initialize WiFi with DHCP
  WiFi.begin(ssid, password);
  logPrint("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    logPrint(".");
  }
  logPrintln("\nConnected to WiFi.");
  logPrint("IP Address: ");
  logPrintln(WiFi.localIP());
  // Initialize lastSendTime when we have a clock reference after connecting
  lastSendTime = millis();
}

float getAverage(float arr[], int size) {
  float sum = 0;
  int count = bufferFilled ? SAMPLE_COUNT : currentReadingIndex;

  // It's crucial that count is not 0 when sum/count is calculated.
  // The logic in loop() will now prevent calling this for POST if count would be 0.
  for(int i = 0; i < count; i++) {
    sum += arr[i];
  }
  if (count == 0) { // Defensive check, though loop logic should prevent this for POSTs
    return 0.0f; // Or handle as an error/NaN if preferred, but loop will skip POST
  }
  return sum / count;
}

// Function to send data to API
void sendDataToAPI(float temp, float humidity) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    HTTPClient http;

    // Skip certificate validation - needed for HTTPS on ESP32
    client.setInsecure();

    // Format data as URL query parameters
    String url = String(API_URL) + "?temperature=" + String(temp, 2) +
           "&humidity=" + String(humidity, 2);

    logPrint("Sending POST to: ");
    logPrintln(url);

    http.begin(client, url);
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");

    int httpResponseCode = http.POST("");

    if (httpResponseCode > 0) {
      String response = http.getString();
      logPrint("HTTP Response code: ");
      logPrintln(httpResponseCode);
      logPrint("Response: ");
      logPrintln(response);
    } else {
      logPrint("Error on sending POST: ");
      logPrintln(httpResponseCode);
      logPrintf("HTTP POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
    }

    http.end();

    // Update tracking variables
    lastSentTemperature = temp;
    lastSentHumidity = humidity;
    lastSendTime = millis(); // Update the last send time
  } else {
    logPrintln("WiFi Disconnected. Cannot send data.");
  }
}

void loop() {
  // Read sensors
  float h = dhtSensor.readHumidity();
  float t = dhtSensor.readTemperature();

  // Update arrays if readings are valid
  if (!isnan(h) && !isnan(t)) {
    temperatureReadings[currentReadingIndex] = t;
    humidityReadings[currentReadingIndex] = h;

    currentReadingIndex++;
    if (currentReadingIndex >= SAMPLE_COUNT) {
      currentReadingIndex = 0;
      bufferFilled = true;
    }

    // Only calculate averages if there's at least one measurement
    if (bufferFilled || currentReadingIndex > 0) {
      // Calculate averages
      float avgTemp = getAverage(temperatureReadings, SAMPLE_COUNT);
      float avgHum = getAverage(humidityReadings, SAMPLE_COUNT);

      // Check if we should send data:
      // 1. If temperature has changed by threshold amount
      // 2. If humidity has changed by threshold amount
      // 3. If it's been FORCE_SEND_COUNT measurement cycles
      unsigned long currentTime = millis();
      bool tempChanged = !isnan(lastSentTemperature) ? (abs(avgTemp - lastSentTemperature) >= TEMP_THRESHOLD) : true;
      bool humChanged = !isnan(lastSentHumidity) ? (abs(avgHum - lastSentHumidity) >= HUMIDITY_THRESHOLD) : true;
      bool timeToForceSend = (currentTime - lastSendTime) >= FORCE_SEND_INTERVAL;

      // If buffer isn't filled yet we still may want to force send when interval reached.
      if (tempChanged || humChanged || timeToForceSend) {
        // Log reason for sending
        if (tempChanged) {
          logPrintln("Sending data: Temperature change threshold exceeded");
        }
        if (humChanged) {
          logPrintln("Sending data: Humidity change threshold exceeded");
        }
        if (timeToForceSend) {
          logPrintln("Sending data: Force send interval reached");
        }

        // For forced send when averages are not available, prefer the latest instant reading
        float sendTemp = avgTemp;
        float sendHum = avgHum;

        // If there are no averaged samples yet (count == 0), fall back to latest instant measurements
        int sampleCount = bufferFilled ? SAMPLE_COUNT : currentReadingIndex;
        if (sampleCount == 0) {
          // Use most recent raw readings t and h
          sendTemp = t;
          sendHum = h;
        }

        // Send data to API
        sendDataToAPI(sendTemp, sendHum);
      } else {
        logPrintln("No significant changes, not sending data");
      }
    } else {
      logPrintln("No valid measurements accumulated yet. Waiting for data...");
    }
  } else {
    logPrintln("Failed to read from DHT sensor!");
  }

  delay(MEASUREMENT_INTERVAL);  // Wait before taking next measurement
}