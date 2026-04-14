#include "DHT.h"
#include "../include/config.h"
#include "../include/Logger.h"
#include "../include/SensorAverager.h"
#include "../include/TelemetrySender.h"
#include "../include/WifiHelper.h"

// Global application components used by Arduino setup()/loop().
Logger logger;
DHT dhtSensor(DHT_SENSOR_PIN, DHT_SENSOR_TYPE);
SensorAverager<SAMPLE_COUNT> sensorAverager;
TelemetrySender telemetrySender(TEMP_THRESHOLD_C,
                                HUMIDITY_THRESHOLD_PERCENT,
                                FORCE_SEND_INTERVAL_MS);

// Triggers a controlled restart after printing the reason.
void rebootWithReason(const char* reason) {
  logger.println(reason);
  logger.printf("Rebooting in %lu ms...\n", RESTART_DELAY_MS);
  delay(RESTART_DELAY_MS);
  ESP.restart();
}

void setup() {
  // Initialize serial logs, sensor, and WiFi connection.
  logger.begin(SERIAL_BAUD_RATE);
  dhtSensor.begin();

  if (!connectToWifi(logger, WIFI_CONNECT_TIMEOUT_MS)) {
    rebootWithReason("WiFi connect failed.");
  }
}

void loop() {
  // Recover WiFi in-loop instead of rebooting on transient drops.
  if (!ensureWifiConnected(logger, WIFI_CONNECT_TIMEOUT_MS)) {
    logger.println("WiFi still unavailable. Will retry next cycle.");
    delay(MEASUREMENT_INTERVAL_MS);
    return;
  }

  // Read current sensor values.
  const float humidity = dhtSensor.readHumidity();
  const float temperature = dhtSensor.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    logger.println("Failed to read from DHT sensor!");
    delay(MEASUREMENT_INTERVAL_MS);
    return;
  }

  sensorAverager.addReading(temperature, humidity);

  if (sensorAverager.sampleCount() == 0) {
    logger.println("No valid measurements accumulated yet. Waiting for data...");
    delay(MEASUREMENT_INTERVAL_MS);
    return;
  }

  const float avgTemperature = sensorAverager.averageTemperature();
  const float avgHumidity = sensorAverager.averageHumidity();

  bool tempChanged = false;
  bool humidityChanged = false;
  bool forceSendDue = false;
  const bool shouldSend = telemetrySender.shouldSend(avgTemperature,
                                                     avgHumidity,
                                                     millis(),
                                                     tempChanged,
                                                     humidityChanged,
                                                     forceSendDue);

  if (shouldSend) {
    if (tempChanged) {
      logger.println("Sending data: Temperature change threshold exceeded");
    }
    if (humidityChanged) {
      logger.println("Sending data: Humidity change threshold exceeded");
    }
    if (forceSendDue) {
      logger.println("Sending data: Force send interval reached");
    }

    const bool sent = telemetrySender.send(avgTemperature, avgHumidity, logger);
    if (!sent) {
      logger.println("Telemetry send failed. Will retry next cycle.");
    }
  } else {
    logger.println("No significant changes, not sending data");
  }

  // Keep a fixed sampling rhythm.
  delay(MEASUREMENT_INTERVAL_MS);
}