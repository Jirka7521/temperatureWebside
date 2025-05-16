// =======================
//      Include Files
// =======================
#include "DHT.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// =======================
//   Sensor Configuration
// =======================
#define DHT_SENSOR_PIN 13          // Digital pin connected to the DHT11 sensor
#define DHT_SENSOR_TYPE DHT11      // Sensor model (DHT11, DHT22, etc.)
#define MEASUREMENT_INTERVAL 1000  // Sampling interval in ms (1 second)
#define SAMPLE_COUNT 10            // Number of readings for rolling average

// =======================
// Data Transmission Config
// =======================
#define FORCE_SEND_INTERVAL 900000 // Max time between transmissions (15 min in ms)

// =======================
// Change Detection Thresholds
// =======================
#define TEMP_THRESHOLD 0.2         // Temperature threshold (°C) to trigger send
#define HUMIDITY_THRESHOLD 0.5     // Humidity threshold (%) to trigger send

// =======================
//      API Configuration
// =======================
const char* API_URL = "API address with endpoint"; // <-- Replace with your API endpoint

// =======================
//   WiFi Credentials
// =======================
const char* ssid = "SSID";         // <-- Replace with your WiFi SSID
const char* password = "Password"; // <-- Replace with your WiFi password

// =======================
//   Global Variables
// =======================
DHT dhtSensor(DHT_SENSOR_PIN, DHT_SENSOR_TYPE); // DHT sensor instance

float temperatureReadings[SAMPLE_COUNT]; // Circular buffer for temperature
float humidityReadings[SAMPLE_COUNT];    // Circular buffer for humidity
int currentReadingIndex = 0;             // Current index in buffer
bool bufferFilled = false;               // True if buffer has wrapped at least once

float lastSentTemperature = 0;           // Last sent temperature
float lastSentHumidity = 0;              // Last sent humidity
unsigned long lastSendTime = 0;          // Last send timestamp (ms)

// =======================
//        Setup
// =======================
void setup() {
    Serial.begin(115200);
    dhtSensor.begin();

    // Connect to WiFi
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected to WiFi.");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
}

// =======================
//   Rolling Average Helper
// =======================
float getAverage(float arr[], int size) {
    float sum = 0;
    int count = bufferFilled ? SAMPLE_COUNT : currentReadingIndex;
    for (int i = 0; i < count; i++) {
        sum += arr[i];
    }
    if (count == 0) return 0.0f; // Defensive: avoid division by zero
    return sum / count;
}

// =======================
//   Send Data to API
// =======================
void sendDataToAPI(float temp, float humidity) {
    if (WiFi.status() == WL_CONNECTED) {
        WiFiClientSecure client;
        HTTPClient http;

        client.setInsecure(); // Skip certificate validation (for HTTPS)

        // Format URL with query parameters
        String url = String(API_URL) + "?temperature=" + String(temp, 2) +
                     "&humidity=" + String(humidity, 2);

        Serial.print("Sending POST to: ");
        Serial.println(url);

        http.begin(client, url);
        http.addHeader("Content-Type", "application/x-www-form-urlencoded");

        int httpResponseCode = http.POST(""); // Empty body, data in URL

        if (httpResponseCode > 0) {
            String response = http.getString();
            Serial.print("HTTP Response code: ");
            Serial.println(httpResponseCode);
            Serial.print("Response: ");
            Serial.println(response);
        } else {
            Serial.print("Error on sending POST: ");
            Serial.println(httpResponseCode);
            Serial.printf("HTTP POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
        }

        http.end();

        // Update last sent values and timestamp
        lastSentTemperature = temp;
        lastSentHumidity = humidity;
        lastSendTime = millis();
    } else {
        Serial.println("WiFi Disconnected. Cannot send data.");
    }
}

// =======================
//         Loop
// =======================
void loop() {
    // Read humidity and temperature from DHT sensor
    float h = dhtSensor.readHumidity();
    float t = dhtSensor.readTemperature();

    if (!isnan(h) && !isnan(t)) {
        // Store readings in circular buffer
        temperatureReadings[currentReadingIndex] = t;
        humidityReadings[currentReadingIndex] = h;

        currentReadingIndex++;
        if (currentReadingIndex >= SAMPLE_COUNT) {
            currentReadingIndex = 0;
            bufferFilled = true;
        }

        // Only calculate averages if at least one measurement exists
        if (bufferFilled || currentReadingIndex > 0) {
            float avgTemp = getAverage(temperatureReadings, SAMPLE_COUNT);
            float avgHum = getAverage(humidityReadings, SAMPLE_COUNT);

            // Check if data should be sent
            unsigned long currentTime = millis();
            bool tempChanged = abs(avgTemp - lastSentTemperature) >= TEMP_THRESHOLD;
            bool humChanged = abs(avgHum - lastSentHumidity) >= HUMIDITY_THRESHOLD;
            bool timeToForceSend = (currentTime - lastSendTime) >= FORCE_SEND_INTERVAL;

            if (tempChanged || humChanged || timeToForceSend) {
                // Log reason for sending
                if (tempChanged) Serial.println("Sending data: Temperature change threshold exceeded");
                if (humChanged) Serial.println("Sending data: Humidity change threshold exceeded");
                if (timeToForceSend) Serial.println("Sending data: Force send interval reached");

                sendDataToAPI(avgTemp, avgHum);
            } else {
                Serial.println("No significant changes, not sending data");
            }
        } else {
            Serial.println("No valid measurements accumulated yet. Waiting for data...");
        }
    } else {
        Serial.println("Failed to read from DHT sensor!");
    }

    delay(MEASUREMENT_INTERVAL); // Wait before next measurement
}
