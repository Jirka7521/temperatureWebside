#include "../include/WifiHelper.h"

#include "../include/Logger.h"
#include "../include/config.h"
#include <WiFi.h>

void connectToWifi(Logger& logger) {
  WiFi.begin(ssid, password);
  logger.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    logger.print(".");
  }

  logger.println("\nConnected to WiFi.");
  logger.print("IP Address: ");
  logger.println(WiFi.localIP());
}
