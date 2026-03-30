#pragma once

class Logger;

// Connects to WiFi and prints status through Logger.
// Returns true when connected, false when timeout is reached.
bool connectToWifi(Logger& logger, unsigned long timeoutMs);
