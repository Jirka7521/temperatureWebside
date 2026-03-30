#include "../include/TelemetrySender.h"

#include "../include/Logger.h"
#include "../include/config.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

TelemetrySender::TelemetrySender(float tempThreshold,
                                 float humidityThreshold,
                                 unsigned long forceSendIntervalMs)
    : tempThreshold_(tempThreshold),
      humidityThreshold_(humidityThreshold),
      forceSendIntervalMs_(forceSendIntervalMs) {}

bool TelemetrySender::hasChangedEnough(float currentValue, float lastValue, float threshold) {
  if (isnan(lastValue)) {
    return true;
  }
  return abs(currentValue - lastValue) >= threshold;
}

bool TelemetrySender::shouldSend(float averageTemperature,
                                 float averageHumidity,
                                 unsigned long nowMs,
                                 bool& tempChanged,
                                 bool& humidityChanged,
                                 bool& forceSendDue) const {
  tempChanged = hasChangedEnough(averageTemperature, lastSentTemperature_, tempThreshold_);
  humidityChanged = hasChangedEnough(averageHumidity, lastSentHumidity_, humidityThreshold_);
  forceSendDue = (nowMs - lastSendTimeMs_) >= forceSendIntervalMs_;

  return tempChanged || humidityChanged || forceSendDue;
}

void TelemetrySender::send(float temperature, float humidity, Logger& logger) {
  if (WiFi.status() != WL_CONNECTED) {
    logger.println("WiFi Disconnected. Cannot send data.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  const String url = String(API_URL) + "?temperature=" + String(temperature, 2) +
                     "&humidity=" + String(humidity, 2);

  logger.print("Sending POST to: ");
  logger.println(url);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  const int httpResponseCode = http.POST("");
  if (httpResponseCode > 0) {
    const String response = http.getString();
    logger.print("HTTP Response code: ");
    logger.println(httpResponseCode);
    logger.print("Response: ");
    logger.println(response);

    lastSentTemperature_ = temperature;
    lastSentHumidity_ = humidity;
    lastSendTimeMs_ = millis();
  } else {
    logger.print("Error on sending POST: ");
    logger.println(httpResponseCode);
    logger.printf("HTTP POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

unsigned long TelemetrySender::lastSendTimeMs() const {
  return lastSendTimeMs_;
}
