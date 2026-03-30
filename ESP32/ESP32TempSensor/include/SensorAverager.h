#pragma once

#include <math.h>

// Stores the last N measurements and computes rolling averages.
template <int SampleSize>
class SensorAverager {
 public:
  void addReading(float temperature, float humidity) {
    temperatureReadings_[index_] = temperature;
    humidityReadings_[index_] = humidity;

    index_++;
    if (index_ >= SampleSize) {
      index_ = 0;
      bufferFilled_ = true;
    }
  }

  int sampleCount() const {
    return bufferFilled_ ? SampleSize : index_;
  }

  float averageTemperature() const {
    return average(temperatureReadings_);
  }

  float averageHumidity() const {
    return average(humidityReadings_);
  }

 private:
  float temperatureReadings_[SampleSize] = {0.0f};
  float humidityReadings_[SampleSize] = {0.0f};
  int index_ = 0;
  bool bufferFilled_ = false;

  float average(const float readings[SampleSize]) const {
    const int count = sampleCount();
    if (count <= 0) {
      return 0.0f;
    }

    float sum = 0.0f;
    for (int i = 0; i < count; i++) {
      sum += readings[i];
    }
    return sum / count;
  }
};
