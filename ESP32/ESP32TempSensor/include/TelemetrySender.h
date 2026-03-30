#pragma once

#include <Arduino.h>

class Logger;

// Decides when data should be sent and handles HTTPS upload.
class TelemetrySender {
 public:
  TelemetrySender(float tempThreshold,
                  float humidityThreshold,
                  unsigned long forceSendIntervalMs);

  bool shouldSend(float averageTemperature,
                  float averageHumidity,
                  unsigned long nowMs,
                  bool& tempChanged,
                  bool& humidityChanged,
                  bool& forceSendDue) const;

  void send(float temperature, float humidity, Logger& logger);

  unsigned long lastSendTimeMs() const;

 private:
  float tempThreshold_;
  float humidityThreshold_;
  unsigned long forceSendIntervalMs_;

  float lastSentTemperature_ = NAN;
  float lastSentHumidity_ = NAN;
  unsigned long lastSendTimeMs_ = 0;

  static bool hasChangedEnough(float currentValue, float lastValue, float threshold);
};
