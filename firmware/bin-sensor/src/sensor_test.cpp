// Wiring check: prints distance and battery voltage about 3 times a second.
// No WiFi. Watch with: pio device monitor -b 115200
#include <Arduino.h>
#include "sensor.h"

void setup() {
  Serial.begin(115200);
  sensorBegin();
  delay(500);
  Serial.println("\nBin sensor test: distance + battery");
}

void loop() {
  float d = readDistance(3);
  float b = readBattery();
  if (d < 0) { Serial.printf("Distance:  NO ECHO   Battery: %.2f V\n", b); delay(200); return; }
  char bar[41]; int n = constrain((int)(d / 5), 0, 40);   // one # per 5 cm
  for (int i = 0; i < 40; i++) bar[i] = i < n ? '#' : ' ';
  bar[40] = 0;
  Serial.printf("Distance: %6.1f cm |%s| Battery: %.2f V\n", d, bar, b);
  delay(200);
}
