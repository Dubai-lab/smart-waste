#pragma once
// Shared measuring code for the bin sensor (used by main.cpp and sensor_test.cpp).
#include <Arduino.h>

const int PIN_TRIG = 5;    // IO5  -> sensor TRIG (blue)
const int PIN_ECHO = 18;   // IO18 <- sensor ECHO through R1 1k / R2 2k (purple)
const int PIN_BATT = 34;   // IO34 <- battery through R3/R4, equal values (green)

inline void sensorBegin() {
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  analogSetPinAttenuation(PIN_BATT, ADC_11db);
}

// One distance reading in cm, or -1 if no echo came back.
inline float readDistanceOnce() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(5);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(20);   // AJ-SR04M / JSN-SR04T want a trigger longer than 10 us
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 30000UL);  // 30 ms = about 5 m
  if (us == 0) return -1;
  return us / 58.0f;
}

// Median of n readings (n <= 15), ignoring missed echoes. -1 if none came back.
inline float readDistance(int n) {
  float v[15];
  int got = 0;
  for (int i = 0; i < n && i < 15; i++) {
    float d = readDistanceOnce();
    if (d > 0) v[got++] = d;
    delay(60);  // let the echo die down between pings
  }
  if (got == 0) return -1;
  for (int i = 1; i < got; i++)
    for (int j = i; j > 0 && v[j] < v[j - 1]; j--) { float t = v[j]; v[j] = v[j - 1]; v[j - 1] = t; }
  return v[got / 2];
}

// Battery voltage: R3/R4 halve it, so multiply by 2.
inline float readBattery() {
  uint32_t mv = 0;
  for (int i = 0; i < 16; i++) mv += analogReadMilliVolts(PIN_BATT);
  return (mv / 16.0f) * 2.0f / 1000.0f;
}
