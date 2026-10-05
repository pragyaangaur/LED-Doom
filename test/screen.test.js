// The screen only reads the game, so the check here is that it can draw every
// frame of a full playthrough, deaths included, without throwing.
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../web/game.js');
const Screen = require('../web/screen.js');
const { makeBot } = require('./bot.js');

// a 2D context that accepts every call and counts them
function fakeContext() {
  const calls = { n: 0 };
  const gradient = { addColorStop() {} };
  return new Proxy(calls, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return () => gradient;
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${String(key)} got ${a}`);
        target.n++;
      };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('every sprite is a clean rectangle with a colour for every pixel', () => {
  for (const [key, look] of Object.entries(Screen.LOOKS)) {
    const rows = Screen.SPRITES[look.sprite].rows;
    for (const r of rows) {
      assert.strictEqual(r.length, rows[0].length, `${look.sprite} row "${r}"`);
      for (const ch of r) if (ch !== '.') assert.ok(look.pal[ch], `${key} has no colour for ${ch}`);
    }
  }
});

test('the screen draws every frame of a full game, a death and a restart', () => {
  const ctx = fakeContext();
  const states = new Set();
  const g = new Game();
  const bot = makeBot();
  for (let t = 0; t < 15 * 60 * 1000 && g.state !== 'victory'; t += 10) {
    g.update(10, bot(g.color(), 10));
    if (t % 50 === 0) { Screen.draw(ctx, g, g.color()); states.add(g.state); }
  }
  for (let t = 0; t < 3000; t += 50) { g.update(50, false); Screen.draw(ctx, g, g.color()); states.add(g.state); }
  // and a death, which the good bot never shows
  const d = new Game({ levels: [{ name: 'E1M1 Hangar', map: 'B.X' }] });
  for (let t = 0; t < 40000 && d.state !== 'dead'; t += 50) { d.update(50, false); Screen.draw(ctx, d, d.color()); states.add(d.state); }
  for (let t = 0; t < 1500; t += 50) { d.update(50, true); Screen.draw(ctx, d, d.color()); }
  Screen.title(ctx, 0);
  for (const s of ['intermission', 'walk', 'enemy', 'item', 'door', 'exit', 'victory', 'dying', 'dead']) assert.ok(states.has(s), 'never drew ' + s);
  assert.ok(ctx.n > 100000);
});
