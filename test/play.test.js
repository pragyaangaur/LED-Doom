// A bot that sees only the LED colour and presses only the one button.
// If it can finish the episode, the game is playable from the LED alone.
const test = require('node:test');
const assert = require('node:assert');
const { Game, LEVELS } = require('../web/game.js');
const { makeBot } = require('./bot.js');

function run(bot, ms) {
  const events = [];
  const g = new Game({ onEvent: (e) => events.push(e) });
  const dt = 10;
  for (let t = 0; t < ms; t += dt) {
    g.update(dt, bot(g.color(), dt));
    if (g.state === 'victory') break;
  }
  return { g, events };
}

test('every map cell is known to the game', () => {
  for (const l of LEVELS) assert.match(l.map, /^[.zsidpBhmDX]+X$/, l.name);
});

test('a bot watching only the LED clears all eight maps', () => {
  const { g, events } = run(makeBot(), 15 * 60 * 1000);
  const deaths = events.filter((e) => e.type === 'death').length;
  assert.strictEqual(g.state, 'victory', 'stuck in ' + g.state + ' on ' + LEVELS[g.level].name);
  assert.strictEqual(deaths, 0);
  const pains = events.filter((e) => e.type === 'pain');
  console.log(`  cleared in ${(g.clock / 1000).toFixed(0)} s, ${g.kills} kills, ${pains.length} hits taken, ${g.hp} hp left`);
});

test('a slow bot (350 ms reaction) still gets through E1M1', () => {
  const { events } = run(makeBot({ reaction: 350 }), 5 * 60 * 1000);
  assert.ok(events.some((e) => e.type === 'exit' && e.level === 0));
});

test('standing still in front of an enemy kills you, and a hold restarts', () => {
  const g = new Game({ levels: [{ name: 'test', map: 'z.X' }] });
  for (let t = 0; t < 3000; t += 10) g.update(10, false); // intermission
  assert.strictEqual(g.state, 'enemy');
  for (let t = 0; t < 60000 && g.state === 'enemy'; t += 10) g.update(10, false);
  assert.strictEqual(g.state, 'dying');
  for (let t = 0; t < 1300; t += 10) g.update(10, false);
  assert.deepStrictEqual(g.color(), [0, 0, 0]);
  for (let t = 0; t < 1100; t += 10) g.update(10, true);
  assert.strictEqual(g.state, 'intermission');
  assert.strictEqual(g.hp, 100);
});

test('holding the button does not fire', () => {
  const g = new Game({ levels: [{ name: 'test', map: 'z.X' }] });
  for (let t = 0; t < 3000; t += 10) g.update(10, true);
  assert.strictEqual(g.state, 'enemy');
  const hp = g.foeHp;
  for (let t = 0; t < 500; t += 10) g.update(10, true);
  assert.strictEqual(g.foeHp, hp);
});

test('a pickup you ignore fades and is lost', () => {
  const g = new Game({ levels: [{ name: 'test', map: 'm.X' }] });
  for (let t = 0; t < 3000; t += 10) g.update(10, false);
  assert.strictEqual(g.state, 'item');
  for (let t = 0; t < 2600; t += 10) g.update(10, false);
  assert.strictEqual(g.state, 'walk');
});
