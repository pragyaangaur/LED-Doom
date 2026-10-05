// Just enough of the Arduino API to run doom_led.ino on a laptop.
#pragma once
#include <cstdint>
#include <cmath>
#include <string>
#include <algorithm>
using std::min; using std::max;
#define PI 3.14159265358979323846
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LOW 0
#define HIGH 1
unsigned long millis();
int digitalRead(uint8_t pin);
inline void pinMode(uint8_t, uint8_t) {}
inline void analogWrite(uint8_t, int) {}

// Serial output is collected so the harness can print it alongside the LED colour.
struct FakeSerial {
  std::string out;
  void begin(long) {}
  void print(char c) { out += c; }
  void print(const char *s) { out += s; }
  void print(long v) { out += std::to_string(v); }
};
extern FakeSerial Serial;
