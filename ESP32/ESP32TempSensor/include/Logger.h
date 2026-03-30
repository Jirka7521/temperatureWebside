#pragma once

#include <Arduino.h>
#include <stdarg.h>

// Logger prints every line with a [hh:mm:ss.mmm] runtime prefix.
class Logger {
 public:
  void begin(unsigned long baudRate);

  template <typename T>
  void print(const T& value) {
    prefixIfNeeded();
    Serial.print(value);
    atLineStart_ = false;
  }

  template <typename T>
  void println(const T& value) {
    prefixIfNeeded();
    Serial.println(value);
    atLineStart_ = true;
  }

  void print(const char* msg);
  void println(const char* msg);
  void print(const String& value);
  void println(const String& value);
  void printf(const char* fmt, ...);

 private:
  bool atLineStart_ = true;
  void prefixIfNeeded();
};
