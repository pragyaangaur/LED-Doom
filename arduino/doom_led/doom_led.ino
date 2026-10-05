// Doom on one LED, for a real RGB LED and one push button.
//
// Wiring (Arduino Uno or Nano):
//   RGB LED red   -> 220 ohm -> pin 9
//   RGB LED green -> 220 ohm -> pin 10
//   RGB LED blue  -> 220 ohm -> pin 11
//   RGB LED common leg -> GND (common cathode) or 5V (set COMMON_ANODE to 1)
//   Button between pin 2 and GND. The internal pull-up is used, no resistor needed.
//
// Wiring (ESP32 dev board). GPIO 6 to 11 belong to the board's flash chip, so the
// ESP32 uses different pins, chosen automatically below:
//   RGB LED red -> GPIO 25, green -> GPIO 26, blue -> GPIO 27, common leg -> GND
//   Button between GPIO 14 and GND
//
// Plug it into a computer and open web/index.html in Chrome or Edge, press
// Connect Arduino, and the screen shows a Doom view of the game the LED is playing.
// The sketch reports its state over USB serial at 115200 baud, 50 times a second.
// It plays exactly the same with nothing connected.
//
// This is a port of web/game.js. Keep the numbers in step with it;
// test/arduino.test.js compares the two files.

#include <Arduino.h>
#include <math.h>

#define COMMON_ANODE 0

#if defined(ESP32)
const uint8_t PIN_R = 25, PIN_G = 26, PIN_B = 27, PIN_BUTTON = 14;
#else
const uint8_t PIN_R = 9, PIN_G = 10, PIN_B = 11, PIN_BUTTON = 2;
#endif

struct Rgb { uint8_t r, g, b; };
const Rgb BLUE = {0, 90, 255}, RED = {255, 0, 0}, GREEN = {0, 255, 40}, YELLOW = {255, 180, 0},
          PURPLE = {190, 0, 255}, WHITE = {255, 255, 255}, OFF = {0, 0, 0};

struct Enemy { char key; uint8_t hp; uint8_t dmg; uint16_t every; float glow; };
const Enemy ENEMIES[] = {
  {'z', 1, 6, 1500, 1.0},   // zombieman
  {'s', 2, 10, 1300, 1.0},  // shotgun guy
  {'i', 3, 10, 1200, 1.0},  // imp
  {'d', 6, 12, 900, 1.0},   // demon
  {'p', 6, 12, 900, 0.22},  // spectre
  {'B', 16, 20, 1400, 1.0}, // baron of hell
};
const uint8_t N_ENEMIES = sizeof(ENEMIES) / sizeof(ENEMIES[0]);

struct Item { char key; uint8_t heal; };
const Item ITEMS[] = {{'h', 10}, {'m', 25}};

const char *const LEVELS[] = {
  "..z...h..z.D.z..s...m..X",                       // E1M1 Hangar
  "..z.s..D.i...h.z.z..D.s.i..m...X",               // E1M2 Nuclear Plant
  ".s..i.D..i.h..z.s.s..m.D.i.d...X",               // E1M3 Toxin Refinery
  "..i.i..D.d..h.s.i..m..D.d.i.s..h..X",            // E1M4 Command Control
  ".d..i.D.p..h.i.i.s..m.D.d.p..h..i.d..X",         // E1M5 Phobos Lab
  "..s.s.i..D.p.d..m.i.i..D.d.p.h..i.s.i..m..X",    // E1M6 Central Processing
  ".i.d.D.p.p..m.i.i.s..D.d.d..h.p.i..m.i.d.p..X",  // E1M7 Computer Station
  "..i.i..m...D...B...m.m...B...X",                 // E1M8 Phobos Anomaly
};
const uint8_t N_LEVELS = sizeof(LEVELS) / sizeof(LEVELS[0]);

const uint16_t STEP = 700;
const uint16_t SHOT_COOLDOWN = 110;
const uint16_t SHOT_FLASH = 90;
const uint16_t KILL_FLASH = 260;
const uint16_t PAIN = 200;
const uint16_t ITEM_WINDOW = 2500;
const uint16_t PICKUP_FLASH = 220;
const uint16_t DOOR_OPEN = 600;
const uint16_t DYING = 1200;
const uint16_t RESTART_HOLD = 1000;
const uint16_t NOTICE = 300;
const float ATTACK_START = 0.35;
const int MAX_HP = 100;

enum State { INTERMISSION, WALK, ENEMY, ITEM, DOOR, EXIT, DYING_S, DEAD, VICTORY };

State state;
uint8_t level, pos;
int hp, kills;
long t, clockMs, downFor;
bool down, armed, busy; // busy: a pickup flashing or a door opening
long progress, windup, cooldown, flash, pain;
const Enemy *foe;
int foeHp;
const Item *item;
Rgb frame; // what the LED shows this tick, before gamma

void enter(State s) { state = s; t = 0; busy = false; }

void reset(uint8_t lvl) {
  level = lvl; pos = 0; hp = MAX_HP; kills = 0; downFor = 0; armed = false;
  enter(INTERMISSION);
}

void arrive() {
  char c = LEVELS[level][pos];
  if (c == '\0' || c == 'X') { enter(EXIT); return; }
  if (c == '.') { enter(WALK); progress = 0; return; }
  if (c == 'D') { enter(DOOR); return; }
  for (uint8_t i = 0; i < N_ENEMIES; i++) if (ENEMIES[i].key == c) {
    enter(ENEMY); foe = &ENEMIES[i]; foeHp = foe->hp;
    windup = -(long)NOTICE; cooldown = flash = pain = 0;
    return;
  }
  for (uint8_t i = 0; i < 2; i++) if (ITEMS[i].key == c) { enter(ITEM); item = &ITEMS[i]; return; }
}

void advance() { pos++; arrive(); }

void hurt(int dmg) {
  hp -= dmg;
  pain = PAIN;
  if (hp <= 0) { hp = 0; enter(DYING_S); }
}

long dec(long v, long dt) { return v > dt ? v - dt : 0; }

void update(long dt, bool nowDown) {
  bool pressed = nowDown && !down;
  down = nowDown;
  downFor = down ? downFor + dt : 0;
  clockMs += dt;
  t += dt;

  switch (state) {
    case INTERMISSION:
      if (t >= 1100 + (level + 1) * 450L + 500) { pos = 0; arrive(); }
      break;
    case WALK:
      if (down) { progress += dt; if (progress >= STEP) advance(); }
      break;
    case ENEMY:
      cooldown = dec(cooldown, dt); flash = dec(flash, dt); pain = dec(pain, dt);
      if (foeHp <= 0) { if (flash == 0) advance(); break; }
      if (pressed && cooldown == 0) {
        cooldown = SHOT_COOLDOWN;
        foeHp--;
        if (foeHp <= 0) { kills++; flash = KILL_FLASH; break; }
        flash = SHOT_FLASH;
      }
      windup += dt;
      if (windup >= foe->every) { windup -= foe->every; hurt(foe->dmg); }
      break;
    case ITEM:
      if (busy) { if (t >= PICKUP_FLASH) advance(); }
      else if (pressed) { hp = min(MAX_HP, hp + item->heal); busy = true; t = 0; }
      else if (t >= ITEM_WINDOW) advance();
      break;
    case DOOR:
      if (busy) { if (t >= DOOR_OPEN) advance(); }
      else if (pressed) { busy = true; t = 0; }
      break;
    case EXIT:
      if (t >= 900) {
        if (level + 1 >= N_LEVELS) enter(VICTORY);
        else { level++; enter(INTERMISSION); }
      }
      break;
    case DYING_S:
      if (t >= DYING) enter(DEAD);
      break;
    case DEAD:
    case VICTORY:
      // the hold has to start after the game ends, so a held shot never restarts
      if (pressed) armed = true;
      if (!down) armed = false;
      if (armed && downFor >= RESTART_HOLD && (state == DEAD || t > 2000)) {
        armed = false;
        reset(state == DEAD ? level : 0);
      }
      break;
  }
}

Rgb scale(Rgb c, float k) {
  if (k < 0) k = 0;
  if (k > 1) k = 1;
  return {(uint8_t)lround(c.r * k), (uint8_t)lround(c.g * k), (uint8_t)lround(c.b * k)};
}

Rgb color() {
  float health = 0.2 + 0.8 * hp / (float)MAX_HP;
  switch (state) {
    case INTERMISSION: {
      if (t < 600) return scale(WHITE, 1 - t / 600.0);
      long k = t - 1100;
      if (k < 0) return OFF;
      if (k / 450 < level + 1 && k % 450 < 200) return WHITE;
      return OFF;
    }
    case WALK:
      if (!down) return scale(BLUE, health);
      return scale(BLUE, health * (0.82 + 0.18 * sin(clockMs / 1000.0 * PI * 2 * 3)));
    case ENEMY: {
      if (flash > 0) return GREEN;
      if (pain > 0) return (pain / 40) % 2 ? RED : OFF;
      float w = max(0L, windup) / (float)foe->every;
      return scale(RED, foe->glow * (ATTACK_START + (1 - ATTACK_START) * w * w));
    }
    case ITEM:
      if (busy) return YELLOW;
      return scale(YELLOW, 0.25 + 0.75 * (1 - t / (float)ITEM_WINDOW));
    case DOOR:
      if (busy) return scale(PURPLE, 1 - t / (float)DOOR_OPEN);
      return scale(PURPLE, 0.75 + 0.25 * sin(clockMs / 1000.0 * PI * 2));
    case EXIT: return WHITE;
    case DYING_S: return scale(RED, 1 - t / (float)DYING);
    case DEAD: return armed ? scale(BLUE, 0.25 * min(1.0f, downFor / (float)RESTART_HOLD)) : OFF;
    case VICTORY: {
      const Rgb order[] = {BLUE, RED, GREEN, YELLOW, PURPLE, WHITE};
      return order[(clockMs / 300) % 6];
    }
  }
  return OFF;
}

// PWM is linear in power and the eye is not, so square the value to keep dim colours dim.
uint8_t gamma8(uint8_t v) {
  uint8_t out = (uint16_t)v * v / 255;
  return COMMON_ANODE ? 255 - out : out;
}

void show(Rgb c) {
  frame = c;
  analogWrite(PIN_R, gamma8(c.r));
  analogWrite(PIN_G, gamma8(c.g));
  analogWrite(PIN_B, gamma8(c.b));
}

// One line per report, read by web/serial.js:
// D,state,level,pos,hp,kills,t,clock,progress,foeHp,windup,cooldown,flash,pain,busy,down,armed,downFor
void report() {
  long v[] = {state, level, pos, hp, kills, t, clockMs, progress, foeHp, windup, cooldown, flash, pain, busy, down, armed, downFor};
  Serial.print('D');
  for (uint8_t i = 0; i < sizeof(v) / sizeof(v[0]); i++) { Serial.print(','); Serial.print(v[i]); }
  Serial.print('\n');
}

unsigned long last;
uint8_t ticks;
bool stable, raw;
unsigned long rawSince;

void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  Serial.begin(115200);
  Serial.print("DOOMLED 1\n");
  reset(0);
  last = millis();
}

void loop() {
  unsigned long now = millis();
  // debounce: the button has to read the same for 15 ms before it counts
  bool r = digitalRead(PIN_BUTTON) == LOW;
  if (r != raw) { raw = r; rawSince = now; }
  if (now - rawSince >= 15) stable = raw;

  long dt = now - last;
  if (dt < 10) return;
  last = now;
  update(dt, stable);
  show(color());
  // a report is about 70 characters, roughly 6 ms of the 20 ms between reports at 115200 baud
  if (++ticks % 2 == 0) report();
}
