#pragma once

class Logger;

// Connects to WiFi and prints status through Logger.
// Returns true when connected, false when timeout is reached.
bool connectToWifi(Logger& logger, unsigned long timeoutMs);

// Ensures WiFi is connected. If disconnected, it tries to reconnect.
// Returns true if connected after the check, false otherwise.
bool ensureWifiConnected(Logger& logger, unsigned long timeoutMs);
