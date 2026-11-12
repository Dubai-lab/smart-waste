// Bin fill sensor: wake → measure → send to the Smart Waste API → deep sleep.
// Setup: copy include/secrets.example.h to include/secrets.h and fill it in.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "sensor.h"
#include "root_cas.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing include/secrets.h: copy include/secrets.example.h to include/secrets.h and fill it in"
#endif

static const char *API_URL = "https://smart-waste-api-ycn6.onrender.com/iot/readings";

#ifndef SLEEP_MINUTES
#define SLEEP_MINUTES 30          // normal check-in interval
#endif
const int LOW_BATT_SLEEP_MINUTES = 120;  // stretch the interval when the battery is low
const float LOW_BATT_V = 3.4f;
const uint32_t WIFI_TIMEOUT_MS = 20000;
const uint16_t HTTP_TIMEOUT_MS = 65000;  // the free API server can take ~50 s to wake up (max 65535)

RTC_DATA_ATTR uint32_t bootCount = 0;    // survives deep sleep

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

// Returns the HTTP status code, or a negative error from HTTPClient.
int sendReading(float distance, float battery) {
  WiFiClientSecure tls;
  tls.setCACert(ROOT_CAS);
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(15000);
  if (!http.begin(tls, API_URL)) return -100;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  char body[96];
  if (distance < 0) snprintf(body, sizeof body, "{\"distance_cm\":null,\"battery_v\":%.2f,\"rssi\":%d}", battery, WiFi.RSSI());
  else snprintf(body, sizeof body, "{\"distance_cm\":%.1f,\"battery_v\":%.2f,\"rssi\":%d}", distance, battery, WiFi.RSSI());
  int code = http.POST(body);
  if (code > 0) Serial.printf("API %d: %s\n", code, http.getString().c_str());
  http.end();
  return code;
}

void goToSleep(int minutes) {
  Serial.printf("Sleeping %d min\n", minutes);
  Serial.flush();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  digitalWrite(PIN_TRIG, LOW);
  esp_sleep_enable_timer_wakeup((uint64_t)minutes * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  bootCount++;
  sensorBegin();

  float distance = readDistance(7);   // measure before the radio is on
  float battery = readBattery();
  Serial.printf("\nWake #%lu  distance: %.1f cm  battery: %.2f V\n", (unsigned long)bootCount, distance, battery);

  if (!connectWifi()) {
    Serial.printf("WiFi \"%s\" not found or wrong password\n", WIFI_SSID);
  } else {
    Serial.printf("WiFi OK (%d dBm), sending...\n", WiFi.RSSI());
    int code = sendReading(distance, battery);
    if (code <= 0) Serial.printf("Send failed (%d): %s\n", code, HTTPClient::errorToString(code).c_str());
  }
  // A battery reading under 1 V means no battery is connected (running on USB).
  bool lowBattery = battery > 1.0f && battery < LOW_BATT_V;
  goToSleep(lowBattery ? LOW_BATT_SLEEP_MINUTES : SLEEP_MINUTES);
}

void loop() {}
