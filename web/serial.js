// The link from a real Arduino to the screen. The sketch prints one line of state
// every 20 ms over USB; this turns each line back into a Game object, so the same
// color() and the same screen drawing work for both the board and the browser game.
(function (root) {
  'use strict';
  const DoomLED = root.DoomLED || require('./game.js');
  const { Game, ENEMIES, ITEMS } = DoomLED;

  // the sketch's enum State, in order
  const STATES = ['intermission', 'walk', 'enemy', 'item', 'door', 'exit', 'dying', 'dead', 'victory'];
  const FIELDS = ['state', 'level', 'pos', 'hp', 'kills', 't', 'clock', 'progress', 'foeHp', 'windup',
    'cooldown', 'flash', 'pain', 'busy', 'down', 'armed', 'downFor'];

  function parseLine(line) {
    line = line.trim();
    if (!line.startsWith('D,')) return null;
    const parts = line.slice(2).split(',').map(Number);
    if (parts.length !== FIELDS.length || parts.some((n) => !Number.isFinite(n))) return null;
    const snap = {};
    FIELDS.forEach((f, i) => { snap[f] = parts[i]; });
    snap.state = STATES[snap.state];
    return snap.state ? snap : null;
  }

  // Copy a report onto a Game so that its color() and the screen read it like a local game.
  function applySnapshot(game, s) {
    const map = game.levels[s.level] ? game.levels[s.level].map : '';
    const cell = map[s.pos];
    Object.assign(game, {
      state: s.state, level: s.level, pos: s.pos, hp: s.hp, kills: s.kills, t: s.t, clock: s.clock,
      progress: s.progress, foeHp: s.foeHp, windup: s.windup, cooldown: s.cooldown, flash: s.flash,
      pain: s.pain, down: !!s.down, restartArmed: !!s.armed, downFor: s.downFor,
      picked: s.state === 'item' && !!s.busy,
      opening: s.state === 'door' && !!s.busy,
    });
    if (s.state === 'enemy' && ENEMIES[cell]) game.foe = Object.assign({ key: cell }, ENEMIES[cell]);
    if (s.state === 'item' && ITEMS[cell]) game.item = ITEMS[cell];
    return game;
  }

  // The board does not send events, so work them out from two reports in a row.
  function snapshotEvents(prev, cur) {
    const out = [];
    if (!prev) return out;
    const name = (s) => (ENEMIES[mapCell(s)] || ITEMS[mapCell(s)] || {}).name;
    if (cur.state !== prev.state || cur.pos !== prev.pos || cur.level !== prev.level) {
      if (cur.state === 'enemy') out.push({ type: 'enemy', detail: name(cur) });
      if (cur.state === 'exit') out.push({ type: 'exit' });
      if (cur.state === 'dying') out.push({ type: 'death' });
      if (cur.state === 'victory') out.push({ type: 'victory' });
      if (cur.state === 'intermission' && prev.state !== 'exit') out.push({ type: 'restart' });
      if (prev.state === 'item' && !prev.busy && cur.state !== 'item') out.push({ type: 'missed', detail: name(prev) });
    }
    if (cur.state === 'enemy' && prev.state === 'enemy' && cur.pos === prev.pos && cur.foeHp < prev.foeHp) {
      out.push({ type: 'shot' });
      if (cur.foeHp <= 0) out.push({ type: 'kill', detail: name(cur) });
    }
    if (cur.state === 'item' && cur.busy && !(prev.state === 'item' && prev.busy)) out.push({ type: 'pickup', detail: name(cur) });
    if (cur.state === 'door' && cur.busy && !(prev.state === 'door' && prev.busy)) out.push({ type: 'door' });
    if (cur.hp < prev.hp && cur.level === prev.level) out.push({ type: 'pain', detail: prev.hp - cur.hp });
    return out;
  }
  function mapCell(s) {
    const l = DoomLED.LEVELS[s.level];
    return l ? l.map[s.pos] : undefined;
  }

  // Browser only. Opens the port the user picks and calls onSnapshot for each report.
  // Chrome and Edge have Web Serial; Safari and Firefox do not.
  async function connect({ onSnapshot, onStatus }) {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    onStatus('connected');
    const decoder = new TextDecoderStream();
    const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    let buf = '';
    let alive = true;
    (async () => {
      try {
        while (alive) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (line.startsWith('DOOMLED')) onStatus('board says hello');
            const snap = parseLine(line);
            if (snap) onSnapshot(snap);
          }
        }
      } catch (e) {
        onStatus('lost: ' + e.message);
      }
      onStatus('disconnected');
    })();
    return {
      async close() {
        alive = false;
        try { await reader.cancel(); } catch (e) {}
        await closed;
        try { await port.close(); } catch (e) {}
      },
    };
  }

  const api = { parseLine, applySnapshot, snapshotEvents, connect, STATES, FIELDS, mirror: () => new Game() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DoomSerial = api;
})(this);
