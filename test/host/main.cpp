// Runs the sketch on a fake clock. Reads one character per 10 ms tick from stdin,
// '1' for button down and '0' for up. After each tick it prints the LED colour,
// the state number, and anything the sketch wrote to serial, with newlines as '|'.
#include <cstdio>
#include "Arduino.h"
#include "../../arduino/doom_led/doom_led.ino"

FakeSerial Serial;
static unsigned long fakeMs = 0;
static bool button = false;
unsigned long millis() { return fakeMs; }
int digitalRead(uint8_t) { return button ? LOW : HIGH; }

int main() {
  setup();
  int ch;
  while ((ch = getchar()) != EOF) {
    if (ch != '0' && ch != '1') continue;
    button = ch == '1';
    fakeMs += 10;
    loop();
    for (char &c : Serial.out) if (c == '\n') c = '|';
    printf("%d %d %d %d %s\n", frame.r, frame.g, frame.b, (int)state, Serial.out.c_str());
    Serial.out.clear();
    fflush(stdout);
  }
}
