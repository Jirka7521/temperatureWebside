#include "../include/Logger.h"

#include <stdio.h>

void Logger::begin(unsigned long baudRate) {
  Serial.begin(baudRate);
}

void Logger::prefixIfNeeded() {
  if (!atLineStart_) {
    return;
  }

  const unsigned long ms = millis();
  unsigned long seconds = ms / 1000UL;
  unsigned long minutes = seconds / 60UL;
  const unsigned long hours = minutes / 60UL;

  seconds %= 60UL;
  minutes %= 60UL;

  char timestamp[32];
  snprintf(timestamp, sizeof(timestamp), "[%02lu:%02lu:%02lu.%03lu] ", hours, minutes, seconds, ms % 1000UL);
  Serial.print(timestamp);
  atLineStart_ = false;
}

void Logger::print(const char* msg) {
  if (!msg) {
    return;
  }

  const char* p = msg;
  while (*p) {
    if (*p == '\n') {
      prefixIfNeeded();
      Serial.println();
      atLineStart_ = true;
      ++p;
      continue;
    }

    prefixIfNeeded();
    const char* start = p;
    while (*p && *p != '\n') {
      ++p;
    }
    while (start < p) {
      Serial.print(*start++);
    }
    atLineStart_ = false;
  }
}

void Logger::println(const char* msg) {
  if (!msg) {
    msg = "";
  }

  print(msg);
  Serial.println();
  atLineStart_ = true;
}

void Logger::print(const String& value) {
  print(value.c_str());
}

void Logger::println(const String& value) {
  println(value.c_str());
}

void Logger::printf(const char* fmt, ...) {
  char buffer[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buffer, sizeof(buffer), fmt, args);
  va_end(args);

  print(buffer);
}
