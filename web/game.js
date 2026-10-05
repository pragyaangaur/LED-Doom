// Doom on one LED. The whole game state reduces to one RGB colour per frame,
// and the whole input reduces to one button: down or up.
//
// This file is the reference implementation. arduino/doom_led/doom_led.ino is a
// hand port of it, and test/parity.test.js checks the two agree on the data.
(function (root) {
  'use strict';

  const COLOR = {
    BLUE: [0, 90, 255],
    RED: [255, 0, 0],
    GREEN: [0, 255, 40],
    YELLOW: [255, 180, 0],
    PURPLE: [190, 0, 255],
    WHITE: [255, 255, 255],
    OFF: [0, 0, 0],
  };

  // hp is shots to kill. Every `every` ms the enemy attacks for `dmg`.
  // `glow` is how bright its red is: the spectre is a demon you can barely see.
  const ENEMIES = {
    z: { name: 'zombieman', hp: 1, dmg: 6, every: 1500, glow: 1.0 },
    s: { name: 'shotgun guy', hp: 2, dmg: 10, every: 1300, glow: 1.0 },
    i: { name: 'imp', hp: 3, dmg: 10, every: 1200, glow: 1.0 },
    d: { name: 'demon', hp: 6, dmg: 12, every: 900, glow: 1.0 },
    p: { name: 'spectre', hp: 6, dmg: 12, every: 900, glow: 0.22 },
    B: { name: 'baron of hell', hp: 16, dmg: 20, every: 1400, glow: 1.0 },
  };

  const ITEMS = {
    h: { name: 'stimpack', heal: 10 },
    m: { name: 'medikit', heal: 25 },
  };

  // Knee Deep in the Dead, flattened to one dimension.
  // .  corridor, hold to walk through it
  // D  door, tap to open
  // X  exit switch, the level ends
  const LEVELS = [
    { name: 'E1M1 Hangar', map: '..z...h..z.D.z..s...m..X' },
    { name: 'E1M2 Nuclear Plant', map: '..z.s..D.i...h.z.z..D.s.i..m...X' },
    { name: 'E1M3 Toxin Refinery', map: '.s..i.D..i.h..z.s.s..m.D.i.d...X' },
    { name: 'E1M4 Command Control', map: '..i.i..D.d..h.s.i..m..D.d.i.s..h..X' },
    { name: 'E1M5 Phobos Lab', map: '.d..i.D.p..h.i.i.s..m.D.d.p..h..i.d..X' },
    { name: 'E1M6 Central Processing', map: '..s.s.i..D.p.d..m.i.i..D.d.p.h..i.s.i..m..X' },
    { name: 'E1M7 Computer Station', map: '.i.d.D.p.p..m.i.i.s..D.d.d..h.p.i..m.i.d.p..X' },
    { name: 'E1M8 Phobos Anomaly', map: '..i.i..m...D...B...m.m...B...X' },
  ];

  const T = {
    STEP: 700, // ms of holding to cross one corridor segment
    SHOT_COOLDOWN: 110, // a press faster than this is a dry click
    SHOT_FLASH: 90,
    KILL_FLASH: 260,
    PAIN: 200,
    ITEM_WINDOW: 2500, // the pickup fades out and you walk past it
    PICKUP_FLASH: 220,
    DOOR_OPEN: 600,
    DYING: 1200,
    RESTART_HOLD: 1000,
    NOTICE: 300, // ms before an enemy starts winding up, so you can react
    ATTACK_START: 0.35, // red brightness at the start of an attack wind-up
  };

  const MAX_HP = 100;

  function Game(opts) {
    opts = opts || {};
    this.onEvent = opts.onEvent || function () {};
    this.levels = opts.levels || LEVELS;
    this.reset(0);
  }

  Game.prototype.reset = function (level) {
    this.level = level;
    this.pos = 0;
    this.hp = MAX_HP;
    this.kills = 0;
    this.down = false;
    this.downFor = 0;
    this.clock = 0;
    this.enter('intermission');
  };

  Game.prototype.enter = function (state, extra) {
    this.state = state;
    this.t = 0; // ms in this state
    Object.assign(this, extra || {});
    if (state === 'intermission') this.emit('level', this.levels[this.level].name);
  };

  Game.prototype.emit = function (type, detail) {
    this.onEvent({ type: type, detail: detail, level: this.level, hp: this.hp });
  };

  Game.prototype.map = function () {
    return this.levels[this.level].map;
  };

  // Look at the next cell of the map and switch into whatever it holds.
  Game.prototype.arrive = function () {
    const c = this.map()[this.pos];
    if (c === undefined || c === 'X') {
      this.enter('exit');
      this.emit('exit');
    } else if (c === '.') {
      this.enter('walk', { progress: 0 });
    } else if (ENEMIES[c]) {
      const e = ENEMIES[c];
      this.enter('enemy', { foe: Object.assign({ key: c }, e), foeHp: e.hp, windup: -T.NOTICE, cooldown: 0, flash: 0, pain: 0 });
      this.emit('enemy', e.name);
    } else if (ITEMS[c]) {
      this.enter('item', { item: ITEMS[c] });
    } else if (c === 'D') {
      this.enter('door');
    } else {
      throw new Error('unknown map cell ' + JSON.stringify(c));
    }
  };

  Game.prototype.advance = function () {
    this.pos += 1;
    this.arrive();
  };

  // dt in ms, down is the raw button state.
  Game.prototype.update = function (dt, down) {
    const pressed = down && !this.down;
    this.down = down;
    this.downFor = down ? this.downFor + dt : 0;
    this.clock += dt;
    this.t += dt;

    switch (this.state) {
      case 'intermission': {
        // white flash, then one white blink per map number, then go
        const n = this.level + 1;
        if (this.t >= 1100 + n * 450 + 500) {
          this.pos = 0;
          this.arrive();
        }
        break;
      }
      case 'walk':
        if (down) {
          this.progress += dt;
          if (this.progress >= T.STEP) this.advance();
        }
        break;
      case 'enemy': {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.flash = Math.max(0, this.flash - dt);
        this.pain = Math.max(0, this.pain - dt);
        if (this.foeHp <= 0) {
          if (this.flash === 0) this.advance();
          break;
        }
        if (pressed && this.cooldown === 0) {
          this.cooldown = T.SHOT_COOLDOWN;
          this.foeHp -= 1;
          this.emit('shot');
          if (this.foeHp <= 0) {
            this.kills += 1;
            this.flash = T.KILL_FLASH;
            this.emit('kill', this.foe.name);
            break;
          }
          this.flash = T.SHOT_FLASH;
        }
        this.windup += dt;
        if (this.windup >= this.foe.every) {
          this.windup -= this.foe.every;
          this.hurt(this.foe.dmg);
        }
        break;
      }
      case 'item':
        if (this.picked) {
          if (this.t >= T.PICKUP_FLASH) {
            this.picked = false;
            this.advance();
          }
        } else if (pressed) {
          this.hp = Math.min(MAX_HP, this.hp + this.item.heal);
          this.picked = true;
          this.t = 0;
          this.emit('pickup', this.item.name);
        } else if (this.t >= T.ITEM_WINDOW) {
          this.emit('missed', this.item.name);
          this.advance();
        }
        break;
      case 'door':
        if (this.opening) {
          if (this.t >= T.DOOR_OPEN) {
            this.opening = false;
            this.advance();
          }
        } else if (pressed) {
          this.opening = true;
          this.t = 0;
          this.emit('door');
        }
        break;
      case 'exit':
        if (this.t >= 900) {
          if (this.level + 1 >= this.levels.length) {
            this.enter('victory');
            this.emit('victory');
          } else {
            this.level += 1;
            this.enter('intermission');
          }
        }
        break;
      case 'dying':
        if (this.t >= T.DYING) this.enter('dead');
        break;
      case 'dead':
        // the hold has to start after death, so a held shot never restarts
        if (pressed) this.restartArmed = true;
        if (!down) this.restartArmed = false;
        if (this.restartArmed && this.downFor >= T.RESTART_HOLD) {
          this.restartArmed = false;
          this.emit('restart');
          this.reset(this.level);
        }
        break;
      case 'victory':
        if (pressed) this.restartArmed = true;
        if (!down) this.restartArmed = false;
        if (this.t > 2000 && this.restartArmed && this.downFor >= T.RESTART_HOLD) {
          this.restartArmed = false;
          this.reset(0);
        }
        break;
    }
  };

  Game.prototype.hurt = function (dmg) {
    this.hp -= dmg;
    this.pain = T.PAIN;
    this.emit('pain', dmg);
    if (this.hp <= 0) {
      this.hp = 0;
      this.enter('dying');
      this.emit('death');
    }
  };

  function scale(c, k) {
    return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
  }

  // The only output. Returns [r, g, b], each 0..255.
  Game.prototype.color = function () {
    const t = this.t;
    const health = 0.2 + 0.8 * (this.hp / MAX_HP); // blue gets dimmer as you get hurt
    switch (this.state) {
      case 'intermission': {
        if (t < 600) return scale(COLOR.WHITE, 1 - t / 600);
        const k = t - 1100;
        if (k < 0) return COLOR.OFF;
        const blink = Math.floor(k / 450);
        if (blink < this.level + 1 && k % 450 < 200) return COLOR.WHITE;
        return COLOR.OFF;
      }
      case 'walk': {
        if (!this.down) return scale(COLOR.BLUE, health);
        // footsteps: a 3 Hz shimmer while you move
        const s = 0.82 + 0.18 * Math.sin(this.clock / 1000 * Math.PI * 2 * 3);
        return scale(COLOR.BLUE, health * s);
      }
      case 'enemy': {
        if (this.flash > 0) return COLOR.GREEN;
        if (this.pain > 0) return Math.floor(this.pain / 40) % 2 ? COLOR.RED : COLOR.OFF;
        // the red swells as the enemy winds up its attack
        const w = Math.max(0, this.windup) / this.foe.every;
        return scale(COLOR.RED, this.foe.glow * (T.ATTACK_START + (1 - T.ATTACK_START) * w * w));
      }
      case 'item': {
        if (this.picked) return COLOR.YELLOW;
        return scale(COLOR.YELLOW, 0.25 + 0.75 * (1 - t / T.ITEM_WINDOW));
      }
      case 'door': {
        if (this.opening) return scale(COLOR.PURPLE, 1 - t / T.DOOR_OPEN);
        return scale(COLOR.PURPLE, 0.75 + 0.25 * Math.sin(this.clock / 1000 * Math.PI * 2));
      }
      case 'exit':
        return COLOR.WHITE;
      case 'dying':
        return scale(COLOR.RED, 1 - t / T.DYING);
      case 'dead':
        // a faint ember shows the restart hold filling up
        if (this.restartArmed) return scale(COLOR.BLUE, 0.25 * Math.min(1, this.downFor / T.RESTART_HOLD));
        return COLOR.OFF;
      case 'victory': {
        const order = [COLOR.BLUE, COLOR.RED, COLOR.GREEN, COLOR.YELLOW, COLOR.PURPLE, COLOR.WHITE];
        return order[Math.floor(this.clock / 300) % order.length];
      }
    }
    return COLOR.OFF;
  };

  const api = { Game: Game, COLOR: COLOR, ENEMIES: ENEMIES, ITEMS: ITEMS, LEVELS: LEVELS, T: T, MAX_HP: MAX_HP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DoomLED = api;
})(this);
