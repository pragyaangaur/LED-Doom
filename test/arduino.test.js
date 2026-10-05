// Checks the Arduino sketch three ways. Its levels and enemy numbers must match
// web/game.js. It is compiled for the laptop against a fake Arduino API and the same
// LED-watching bot from play.test.js plays it to the end. And every serial report it
// sends on the way, read back through web/serial.js, has to give the browser the
// same LED colour the board is showing, which is what keeps the screen honest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { LEVELS, ENEMIES, ITEMS, T } = require('../web/game.js');
const { makeBot } = require('./bot.js');
const Serial = require('../web/serial.js');
const { Game } = require('../web/game.js');

const root = path.join(__dirname, '..');
const ino = fs.readFileSync(path.join(root, 'arduino/doom_led/doom_led.ino'), 'utf8');

test('the sketch has the same maps', () => {
  const block = ino.match(/LEVELS\[\] = \{([\s\S]*?)\};/)[1];
  const maps = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(maps, LEVELS.map((l) => l.map));
});

test('the sketch has the same enemies, items and timings', () => {
  for (const [key, e] of Object.entries(ENEMIES)) {
    const m = ino.match(new RegExp(`\\{'${key}', (\\d+), (\\d+), (\\d+), ([\\d.]+)\\}`));
    assert.ok(m, 'missing enemy ' + key);
    assert.deepStrictEqual(m.slice(1).map(Number), [e.hp, e.dmg, e.every, e.glow], e.name);
  }
  for (const [key, it] of Object.entries(ITEMS)) assert.match(ino, new RegExp(`\\{'${key}', ${it.heal}\\}`));
  for (const [name, v] of Object.entries(T)) {
    const m = ino.match(new RegExp(`const (?:uint16_t|float) ${name} = ([\\d.]+);`));
    assert.ok(m, 'missing timing ' + name);
    assert.strictEqual(Number(m[1]), v, name);
  }
});

test('a bot watching only the LED beats the compiled sketch', async (t) => {
  const bin = path.join(os.tmpdir(), 'doom_led_host');
  try {
    execFileSync('c++', ['-std=c++17', '-O1', '-I', path.join(__dirname, 'host'), '-o', bin, path.join(__dirname, 'host/main.cpp')]);
  } catch (err) {
    t.skip('no C++ compiler: ' + err.message);
    return;
  }
  const VICTORY = 8;
  const child = spawn(bin);
  const bot = makeBot();
  let buf = '';
  let ticks = 0;
  let lastState = -1;
  const mirror = new Game();
  let reports = 0;
  let worst = 0;
  let prevSnap = null;
  const seen = new Set();
  const result = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const [r, g, b, s] = line.split(' ').map(Number);
        for (const part of (line.split(' ')[4] || '').split('|')) {
          const snap = Serial.parseLine(part);
          if (!snap) continue;
          reports++;
          Serial.applySnapshot(mirror, snap);
          const c = mirror.color();
          worst = Math.max(worst, Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b));
          for (const e of Serial.snapshotEvents(prevSnap, snap)) seen.add(e.type);
          prevSnap = snap;
        }
        lastState = s;
        ticks++;
        if (s === VICTORY || ticks > 15 * 60 * 100) { child.stdin.end(); resolve({ s, ticks }); return; }
        child.stdin.write(bot([r, g, b], 10) ? '1' : '0');
      }
    });
    child.stdin.write('0');
  });
  child.kill();
  assert.strictEqual(result.s, VICTORY, 'ended in state ' + lastState);
  assert.ok(reports > result.ticks / 2 - 5, 'only ' + reports + ' serial reports');
  assert.ok(worst <= 2, 'browser colour from serial differs from the LED by ' + worst);
  for (const e of ['enemy', 'shot', 'kill', 'pickup', 'door', 'exit', 'victory']) assert.ok(seen.has(e), 'serial never showed ' + e);
  console.log(`  sketch cleared in ${(result.ticks / 100).toFixed(0)} s of game time`);
});
