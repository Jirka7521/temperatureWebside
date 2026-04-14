#include "../include/WifiHelper.h"

#include "../include/Logger.h"
#include "../include/config.h"
#include <WiFi.h>

bool connectToWifi(Logger& logger, unsigned long timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  const unsigned long startedAt = millis();
  WiFi.begin(ssid, password);
  logger.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedAt >= timeoutMs) {
      logger.println("\nWiFi connection timeout.");
      return false;
    }
    delay(500);
    logger.print(".");
  }

  logger.println("\nConnected to WiFi.");
  logger.print("IP Address: ");
  logger.println(WiFi.localIP());
  return true;
}

bool ensureWifiConnected(Logger& logger, unsigned long timeoutMs) {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  logger.println("WiFi disconnected. Attempting reconnect...");
  return connectToWifi(logger, timeoutMs);
}
