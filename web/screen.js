// The screen: a 320x200 first-person view of whatever the LED is showing.
// It only reads a Game (local, or mirrored from the Arduino) and never changes it,
// so the LED stays the real game and this is what it looks like from inside.
// All the art is drawn here from small bitmaps. None of it is id Software's.
(function (root) {
  'use strict';
  const DoomLED = root.DoomLED || require('./game.js');
  const { T, ENEMIES, ITEMS } = DoomLED;

  const W = 320, H = 200, VH = 168; // view height; the status bar takes the rest
  const CX = 160, CY = 84, F = 160;
  const HALF_W = 1.25, CEIL = -0.65, FLOOR = 0.55;
  const SEG = 0.5; // wall panel depth
  const Z0 = 2.0, CELL = 1.1; // depth of the thing you are facing, and of each map cell after it

  // walls, floor, ceiling per map
  const THEMES = [
    { wall: [120, 100, 80], floor: [90, 80, 70], ceil: [70, 70, 75] }, // Hangar
    { wall: [110, 110, 115], floor: [40, 110, 30], ceil: [60, 60, 66] }, // Nuclear Plant, nukage floor
    { wall: [100, 90, 70], floor: [50, 120, 40], ceil: [64, 58, 50] }, // Toxin Refinery
    { wall: [90, 100, 120], floor: [80, 80, 85], ceil: [55, 60, 70] }, // Command Control
    { wall: [130, 120, 100], floor: [100, 60, 50], ceil: [72, 66, 60] }, // Phobos Lab
    { wall: [95, 95, 100], floor: [70, 60, 55], ceil: [55, 55, 60] }, // Central Processing
    { wall: [70, 90, 80], floor: [60, 60, 60], ceil: [45, 55, 50] }, // Computer Station
    { wall: [110, 60, 50], floor: [80, 40, 35], ceil: [50, 30, 28] }, // Phobos Anomaly
  ];

  const SPRITES = {
    zombie: { h: 0.95, rows: [
      '....hhhh....', '...hffffh...', '...fEffEf...', '...ffffff...', '....fmmf....', '..ssssssss..',
      '.ssssssssss.', '.ssbssssbss.', '.ff.ssss.ff.', '.ff.bbbb.ff.', '....pppp....', '....pppp....',
      '...pp..pp...', '...pp..pp...', '...pp..pp...', '...pp..pp...', '..kkk..kkk..', '..kkk..kkk..'] },
    imp: { h: 0.95, rows: [
      '..w......w..', '..bbbbbbbb..', '.bbObbbbObb.', '.bbbbbbbbbb.', '..bbmmmmbb..', 'w.bbbbbbbb.w',
      'bbbbbwwbbbbb', 'bb.bbbbbb.bb', 'bb.bbbbbb.bb', 'ww.bbbbbb.ww', '...bbbbbb...', '...bb..bb...',
      '...bb..bb...', '...bb..bb...', '..bbb..bbb..', '..ww....ww..'] },
    demon: { h: 0.75, rows: [
      '....pppppppp....', '...pppppppppp...', '..ppEppppppEpp..', '..pppppppppppp..', '.ppmmmmmmmmmmpp.',
      '.pmwmwmwmwmwmmp.', '.pmmmmmmmmmmmmp.', '.pmwmwmwmwmwmmp.', '.ppmmmmmmmmmmpp.', 'pppppppppppppppp',
      'pp.pppppppppp.pp', '...ppp....ppp...', '...ppp....ppp...', '..pppp....pppp..'] },
    baron: { h: 1.15, rows: [
      '.H..........H.', '.HH........HH.', '..HttttttttH..', '...tEttttEt...', '...tttttttt...', '....tmmmmt....',
      '..tttttttttt..', '.tttttttttttt.', 'tttttttttttttt', 'tt.tttttttt.tt', 'tt.tttttttt.tt', 'tt.tttttttt.tt',
      'GG.tttttttt.GG', 'GG..tttttt..GG', '....gggggg....', '...gggggggg...', '...ggg..ggg...', '...ggg..ggg...',
      '...ggg..ggg...', '...ggg..ggg...', '...ggg..ggg...', '...ggg..ggg...', '..kkkk..kkkk..', '..kkkk..kkkk..'] },
    medikit: { h: 0.22, rows: ['wwwwwwwwww', 'wwwwrrwwww', 'wwwwrrwwww', 'wrrrrrrrrw', 'wwwwrrwwww', 'wwwwrrwwww', 'wwwwwwwwww'] },
    stimpack: { h: 0.16, rows: ['wwwwww', 'wwrrww', 'wrrrrw', 'wwrrww', 'wwwwww'] },
  };

  // which bitmap and colours each map character uses
  const LOOKS = {
    z: { sprite: 'zombie', pal: { h: [60, 40, 25], f: [150, 140, 110], E: [220, 30, 20], m: [60, 20, 20], s: [90, 100, 60], b: [50, 40, 30], p: [80, 70, 50], k: [40, 30, 20] } },
    s: { sprite: 'zombie', pal: { h: [20, 20, 20], f: [170, 120, 100], E: [220, 30, 20], m: [70, 20, 20], s: [40, 40, 45], b: [90, 70, 40], p: [60, 60, 60], k: [30, 25, 20] } },
    i: { sprite: 'imp', pal: { b: [110, 70, 40], w: [230, 220, 190], O: [255, 160, 0], m: [60, 10, 10] }, ball: [255, 130, 20] },
    d: { sprite: 'demon', pal: { p: [200, 110, 120], E: [255, 220, 0], m: [90, 20, 30], w: [240, 240, 220] }, lunge: true },
    p: { sprite: 'demon', pal: { p: [200, 110, 120], E: [255, 220, 0], m: [90, 20, 30], w: [240, 240, 220] }, lunge: true, fuzz: true },
    B: { sprite: 'baron', pal: { H: [230, 220, 200], t: [210, 170, 150], E: [255, 60, 0], m: [80, 20, 20], G: [60, 160, 60], g: [110, 80, 60], k: [50, 40, 30] }, ball: [80, 255, 80] },
    m: { sprite: 'medikit', pal: { w: [230, 230, 230], r: [200, 20, 20] } },
    h: { sprite: 'stimpack', pal: { w: [230, 230, 230], r: [200, 20, 20] } },
  };

  const FONT = "'Big Shoulders Display', Impact, 'Arial Narrow', sans-serif";

  function rgb(c, k) {
    k = k === undefined ? 1 : k;
    return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
  }
  const fog = (z) => Math.max(0.1, Math.min(1, 1.25 - 0.11 * z));
  const proj = (x, y, z) => [CX + (x * F) / z, CY + (y * F) / z];
  // a stable pseudo random number for a pixel, so fuzz and blood do not need state
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function quad(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function text(ctx, str, x, y, size, color, align) {
    ctx.font = '800 ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function corridor(ctx, theme, walked) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, VH);
    const shift = walked * CELL;
    const first = Math.floor(shift / SEG) - 1;
    for (let j = first + 22; j >= first; j--) {
      let z0 = 0.9 + j * SEG - shift;
      const z1 = z0 + SEG;
      if (z1 <= 0.35) continue;
      z0 = Math.max(0.35, z0);
      const k = fog((z0 + z1) / 2) * (j % 2 ? 0.88 : 1);
      quad(ctx, [proj(-HALF_W, CEIL, z0), proj(-HALF_W, CEIL, z1), proj(-HALF_W, FLOOR, z1), proj(-HALF_W, FLOOR, z0)], rgb(theme.wall, k));
      quad(ctx, [proj(HALF_W, CEIL, z0), proj(HALF_W, CEIL, z1), proj(HALF_W, FLOOR, z1), proj(HALF_W, FLOOR, z0)], rgb(theme.wall, k * 0.92));
      quad(ctx, [proj(-HALF_W, FLOOR, z0), proj(HALF_W, FLOOR, z0), proj(HALF_W, FLOOR, z1), proj(-HALF_W, FLOOR, z1)], rgb(theme.floor, k));
      quad(ctx, [proj(-HALF_W, CEIL, z0), proj(HALF_W, CEIL, z0), proj(HALF_W, CEIL, z1), proj(-HALF_W, CEIL, z1)], rgb(theme.ceil, k));
      // a dark trim line along both walls at waist height
      quad(ctx, [proj(-HALF_W, -0.05, z0), proj(-HALF_W, -0.05, z1), proj(-HALF_W, 0.02, z1), proj(-HALF_W, 0.02, z0)], rgb(theme.wall, k * 0.55));
      quad(ctx, [proj(HALF_W, -0.05, z0), proj(HALF_W, -0.05, z1), proj(HALF_W, 0.02, z1), proj(HALF_W, 0.02, z0)], rgb(theme.wall, k * 0.5));
      // ceiling lights every fourth panel
      if (((j % 4) + 4) % 4 === 0) {
        quad(ctx, [proj(-0.3, CEIL, z0), proj(0.3, CEIL, z0), proj(0.3, CEIL, z0 + SEG * 0.5), proj(-0.3, CEIL, z0 + SEG * 0.5)], rgb([255, 245, 210], fog(z0)));
      }
      // now and then a computer panel with blinking lights
      if (hash(j, 7) < 0.18) {
        const zA = z0 + SEG * 0.15, zB = z0 + SEG * 0.85;
        const side = hash(j, 3) < 0.5 ? -HALF_W : HALF_W;
        quad(ctx, [proj(side, -0.4, zA), proj(side, -0.4, zB), proj(side, -0.12, zB), proj(side, -0.12, zA)], rgb([30, 40, 35], k));
        const [lx, ly] = proj(side, -0.3, (zA + zB) / 2);
        ctx.fillStyle = rgb(hash(j, Math.floor(walked * 3)) < 0.5 ? [255, 60, 40] : [60, 255, 90], k);
        ctx.fillRect(lx - 1, ly - 1, Math.max(1, 6 / z0), Math.max(1, 4 / z0));
      }
    }
  }

  function wallAcross(ctx, z, color, k) {
    const [x0, y0] = proj(-HALF_W, CEIL, z);
    const [x1, y1] = proj(HALF_W, FLOOR, z);
    ctx.fillStyle = rgb(color, k);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    return [x0, y0, x1, y1];
  }

  function door(ctx, z, open) {
    const k = fog(z);
    const [x0, y0, x1, y1] = wallAcross(ctx, z, [70, 66, 72], k); // the door frame
    const h = (y1 - y0) * (1 - open);
    const dx0 = x0 + (x1 - x0) * 0.12, dx1 = x1 - (x1 - x0) * 0.12;
    ctx.fillStyle = '#000';
    ctx.fillRect(dx0, y0, dx1 - dx0, y1 - y0); // dark doorway behind the door
    ctx.fillStyle = rgb([120, 120, 128], k);
    ctx.fillRect(dx0, y0, dx1 - dx0, h);
    ctx.fillStyle = rgb([80, 80, 88], k);
    for (let i = 1; i < 6; i++) ctx.fillRect(dx0, y0 + h - (h * i) / 6, dx1 - dx0, Math.max(1, 3 / z));
    // purple lights either side, the colour the LED shows for a door
    ctx.fillStyle = rgb([190, 0, 255], Math.max(0.35, k));
    ctx.fillRect(x0 + (x1 - x0) * 0.04, y0 + (y1 - y0) * 0.2, Math.max(1, (x1 - x0) * 0.04), (y1 - y0) * 0.6);
    ctx.fillRect(x1 - (x1 - x0) * 0.08, y0 + (y1 - y0) * 0.2, Math.max(1, (x1 - x0) * 0.04), (y1 - y0) * 0.6);
  }

  function exitWall(ctx, z, clock) {
    const k = fog(z);
    const [x0, y0, x1, y1] = wallAcross(ctx, z, [90, 80, 60], k);
    const w = x1 - x0, h = y1 - y0;
    ctx.fillStyle = rgb([50, 50, 55], k);
    ctx.fillRect(x0 + w * 0.38, y0 + h * 0.35, w * 0.24, h * 0.4); // the switch panel
    ctx.fillStyle = rgb(Math.floor(clock / 400) % 2 ? [255, 255, 255] : [160, 160, 160], k);
    ctx.fillRect(x0 + w * 0.46, y0 + h * 0.45, w * 0.08, h * 0.2);
    ctx.fillStyle = rgb([200, 0, 0], Math.max(0.4, k));
    ctx.fillRect(x0 + w * 0.36, y0 + h * 0.1, w * 0.28, h * 0.14);
    if (h > 18) text(ctx, 'EXIT', CX, y0 + h * 0.22, Math.round(h * 0.13), '#fff');
  }

  // draw a bitmap standing on the floor at depth z
  function sprite(ctx, look, z, opt) {
    opt = opt || {};
    const sp = SPRITES[look.sprite];
    const rows = sp.rows;
    const k = fog(z);
    const grow = opt.grow || 1;
    const hPx = (sp.h * F * grow) / z;
    const px = hPx / rows.length;
    const wPx = px * rows[0].length;
    const baseY = CY + (FLOOR * F) / z;
    const squash = opt.squash === undefined ? 1 : opt.squash;
    const left = CX - wPx / 2;
    const top = baseY - hPx * squash;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        let col = look.pal[ch];
        if (look.fuzz) {
          // the spectre: a shimmer of dark pixels you can only just make out
          if (hash(r * 31 + c, Math.floor(opt.clock / 60)) < 0.45) continue;
          col = [40, 20, 35];
        }
        if (opt.hit && hash(r, c + Math.floor(opt.clock / 50)) < 0.32) col = [210, 0, 0];
        ctx.fillStyle = rgb(col, k);
        ctx.fillRect(Math.floor(left + c * px), Math.floor(top + r * px * squash), Math.ceil(px), Math.ceil(px * squash));
      }
    }
    return { left, top, w: wPx, h: hPx, baseY };
  }

  function enemy(ctx, g, look, z) {
    const foe = g.foe;
    const dying = g.foeHp <= 0;
    const w = foe ? Math.max(0, g.windup) / foe.every : 0;
    const opt = { clock: g.clock, hit: g.flash > 0 && !dying };
    if (dying) opt.squash = Math.max(0.08, g.flash / T.KILL_FLASH);
    if (look.lunge && !dying) opt.grow = 1 + 0.18 * w * w;
    const box = sprite(ctx, look, z, opt);
    if (dying) {
      ctx.fillStyle = 'rgb(130,0,0)';
      const pw = box.w * (1.2 - opt.squash * 0.6);
      ctx.beginPath();
      ctx.ellipse(CX, box.baseY, pw / 2, Math.max(1, pw / 8), 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // the attack wind-up: a fireball growing in the hand, or a gun flash when it hits you
    if (look.ball && w > 0.6) {
      const r = (box.w * 0.16 * (w - 0.6)) / 0.4 + 1;
      ctx.fillStyle = rgb(look.ball);
      ctx.beginPath();
      ctx.arc(box.left + box.w * 0.9, box.top + box.h * 0.42, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!look.ball && !look.lunge && g.pain > T.PAIN - 80) {
      ctx.fillStyle = 'rgb(255,230,120)';
      ctx.fillRect(box.left + box.w * 0.82, box.top + box.h * 0.5, box.w * 0.18, box.w * 0.18);
    }
  }

  function shotgun(ctx, g) {
    const walking = g.state === 'walk' && g.down;
    const bob = walking ? Math.sin(g.clock / 160) : 0;
    let dy = walking ? Math.abs(bob) * 6 : 0;
    if (g.state === 'enemy') dy += (g.cooldown / T.SHOT_COOLDOWN) * 10; // the pump after each shot
    if (g.state === 'dying') dy += (g.t / T.DYING) * 60;
    const x = CX + bob * 8;
    const y = 130 + dy;
    const fired = g.state === 'enemy' && g.flash > 0 && (g.foeHp > 0 ? g.flash > T.SHOT_FLASH - 50 : g.flash > T.KILL_FLASH - 50);
    if (fired) {
      ctx.fillStyle = 'rgba(255,240,180,0.12)';
      ctx.fillRect(0, 0, W, VH);
      ctx.fillStyle = 'rgb(255,200,60)';
      ctx.beginPath();
      ctx.moveTo(x, y - 34); ctx.lineTo(x + 20, y - 8); ctx.lineTo(x + 6, y - 12); ctx.lineTo(x, y - 2); ctx.lineTo(x - 6, y - 12); ctx.lineTo(x - 20, y - 8);
      ctx.fill();
      ctx.fillStyle = 'rgb(255,255,225)';
      ctx.fillRect(x - 6, y - 16, 12, 10);
    }
    ctx.fillStyle = '#2b2b2f'; ctx.fillRect(x - 7, y - 4, 14, 44); // barrels
    ctx.fillStyle = '#4a4a52'; ctx.fillRect(x - 6, y - 4, 5, 44); ctx.fillRect(x + 1, y - 4, 5, 44);
    ctx.fillStyle = '#111'; ctx.fillRect(x - 5, y - 4, 3, 2); ctx.fillRect(x + 2, y - 4, 3, 2);
    ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 11, y + 14, 22, 16); // pump
    ctx.fillStyle = '#583818'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 11, y + 17 + i * 4, 22, 1);
    ctx.fillStyle = '#c99a78'; ctx.fillRect(x - 15, y + 24, 10, 16); ctx.fillRect(x + 6, y + 28, 12, 12); // hands
  }

  function face(ctx, g, x, y) {
    const hurt = 1 - g.hp / 100;
    const dead = g.state === 'dying' || g.state === 'dead';
    ctx.fillStyle = dead ? '#8a2a20' : '#c08a62';
    ctx.fillRect(x - 10, y - 12, 20, 24);
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 10, y - 12, 20, 5); // hair
    const look = Math.sin(g.clock / 900) > 0.4 ? 2 : Math.sin(g.clock / 900) < -0.4 ? -2 : 0;
    const pain = g.pain > 0;
    const grin = g.state === 'enemy' && g.foeHp <= 0;
    ctx.fillStyle = '#fff';
    if (dead) {
      ctx.fillStyle = '#300';
      ctx.fillRect(x - 7, y - 3, 5, 1); ctx.fillRect(x + 2, y - 3, 5, 1);
    } else if (pain) {
      ctx.fillStyle = '#300';
      ctx.fillRect(x - 7, y - 3, 5, 2); ctx.fillRect(x + 2, y - 3, 5, 2);
    } else {
      ctx.fillRect(x - 7, y - 4, 5, 4); ctx.fillRect(x + 2, y - 4, 5, 4);
      ctx.fillStyle = '#245';
      ctx.fillRect(x - 6 + look, y - 3, 2, 2); ctx.fillRect(x + 3 + look, y - 3, 2, 2);
    }
    ctx.fillStyle = '#6a3a2a';
    if (grin) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y + 5, 12, 3); ctx.fillStyle = '#6a3a2a'; ctx.fillRect(x - 6, y + 5, 12, 1); }
    else if (pain || dead) ctx.fillRect(x - 3, y + 4, 6, 5);
    else ctx.fillRect(x - 4, y + 6, 8, 2);
    // more blood the less health you have
    ctx.fillStyle = '#a00';
    for (let i = 0; i < Math.round(hurt * 10); i++) ctx.fillRect(x - 9 + Math.floor(hash(i, 1) * 17), y - 8 + Math.floor(hash(i, 2) * 19), 2, 2);
  }

  function statusBar(ctx, g, led) {
    ctx.fillStyle = '#4b4a46';
    ctx.fillRect(0, VH, W, H - VH);
    ctx.fillStyle = '#6b6a64'; ctx.fillRect(0, VH, W, 1);
    ctx.fillStyle = '#2c2b28';
    for (const x of [96, 134, 186, 262]) ctx.fillRect(x, VH + 2, 1, H - VH - 4);
    text(ctx, g.hp + '%', 48, VH + 22, 20, '#e2241c');
    text(ctx, 'HEALTH', 48, VH + 30, 8, '#c8c2b0');
    text(ctx, String(g.kills), 115, VH + 22, 20, '#e2241c');
    text(ctx, 'KILLS', 115, VH + 30, 8, '#c8c2b0');
    ctx.fillStyle = '#222'; ctx.fillRect(CX - 13, VH + 2, 26, H - VH - 4);
    face(ctx, g, CX, VH + 16);
    const name = g.levels[g.level].name.split(' ');
    text(ctx, name[0], 224, VH + 16, 14, '#e6c25a');
    text(ctx, name.slice(1).join(' ').toUpperCase(), 224, VH + 28, 8, '#c8c2b0');
    // the LED itself, so you can match what you see to what the board shows
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(291, VH + 14, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(' + led.join(',') + ')';
    ctx.beginPath(); ctx.arc(291, VH + 14, 7, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'LED', 291, VH + 30, 8, '#c8c2b0');
  }

  function prompt(g) {
    switch (g.state) {
      case 'walk': return g.down ? '' : 'HOLD TO WALK';
      case 'enemy': return g.foeHp > 0 ? 'TAP TO SHOOT ' + g.foe.name.toUpperCase() : '';
      case 'item': return g.picked ? '' : 'TAP TO PICK UP ' + g.item.name.toUpperCase();
      case 'door': return g.opening ? '' : 'TAP TO OPEN';
    }
    return '';
  }

  function intermission(ctx, g) {
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#2a0c06'); grad.addColorStop(1, '#0b0302');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, VH);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(255,120,60,' + (0.1 + hash(i, 9) * 0.3) + ')';
      ctx.fillRect(hash(i, 4) * W, hash(i, 5) * VH, 1, 1);
    }
    const [code, ...rest] = g.levels[g.level].name.split(' ');
    text(ctx, 'ENTERING', CX, 52, 12, '#c8c2b0');
    text(ctx, code, CX, 98, 44, '#e2241c');
    text(ctx, rest.join(' ').toUpperCase(), CX, 122, 18, '#e6c25a');
    if (g.t < 600) {
      ctx.fillStyle = 'rgba(255,255,255,' + (1 - g.t / 600) + ')';
      ctx.fillRect(0, 0, W, VH);
    }
  }

  // What the player can see from where they stand: the next few map cells.
  function things(g) {
    const map = g.levels[g.level].map;
    const frac = g.state === 'walk' ? Math.min(1, g.progress / T.STEP) : 0;
    const out = [];
    for (let i = g.pos; i < map.length && i <= g.pos + 8; i++) {
      const c = map[i];
      const d = i - g.pos - frac;
      if (c === '.' || d < -0.01) continue;
      const here = i === g.pos;
      if (here && g.state === 'item' && g.picked) continue;
      out.push({ c, z: Z0 + d * CELL, here });
      if (c === 'X') break;
    }
    return { list: out.reverse(), walked: g.pos + frac };
  }

  function draw(ctx, g, led) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (g.state === 'intermission') {
      intermission(ctx, g);
      statusBar(ctx, g, led);
      ctx.restore();
      return;
    }
    const theme = THEMES[g.level % THEMES.length];
    const { list, walked } = things(g);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, VH); ctx.clip();
    if (g.state === 'dying' || g.state === 'dead') {
      // you fall over
      const k = g.state === 'dead' ? 1 : g.t / T.DYING;
      ctx.translate(CX, CY); ctx.rotate(0.35 * k); ctx.translate(-CX, -CY + 40 * k);
    }
    corridor(ctx, theme, walked);
    for (const th of list) {
      if (th.c === 'D') door(ctx, th.z, th.here && g.opening ? g.t / T.DOOR_OPEN : 0);
      else if (th.c === 'X') exitWall(ctx, th.z, g.clock);
      else if (ENEMIES[th.c]) {
        if (th.here && g.state === 'enemy') enemy(ctx, g, LOOKS[th.c], th.z);
        else sprite(ctx, LOOKS[th.c], th.z, { clock: g.clock });
      } else if (ITEMS[th.c]) sprite(ctx, LOOKS[th.c], th.z, { clock: g.clock });
    }
    ctx.restore();
    if (g.state !== 'dead' && g.state !== 'victory') shotgun(ctx, g);

    // full-screen tints, the way Doom flashes red when you are hit and gold on a pickup
    if (g.pain > 0) { ctx.fillStyle = 'rgba(255,0,0,' + (0.4 * g.pain) / T.PAIN + ')'; ctx.fillRect(0, 0, W, VH); }
    if (g.state === 'item' && g.picked) { ctx.fillStyle = 'rgba(255,200,60,0.28)'; ctx.fillRect(0, 0, W, VH); }
    if (g.state === 'dying') { ctx.fillStyle = 'rgba(120,0,0,' + (0.5 * g.t) / T.DYING + ')'; ctx.fillRect(0, 0, W, VH); }
    if (g.state === 'exit') {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, g.t / 500) + ')';
      ctx.fillRect(0, 0, W, VH);
      text(ctx, 'LEVEL COMPLETE', CX, 92, 26, '#2a0c06');
    }
    if (g.state === 'dead') {
      ctx.fillStyle = 'rgba(90,0,0,0.6)'; ctx.fillRect(0, 0, W, VH);
      text(ctx, 'YOU DIED', CX, 80, 34, '#e2241c');
      text(ctx, 'HOLD THE BUTTON TO TRY AGAIN', CX, 102, 11, '#e8ddd0');
      if (g.restartArmed) {
        ctx.fillStyle = '#300'; ctx.fillRect(CX - 50, 112, 100, 5);
        ctx.fillStyle = '#e2241c'; ctx.fillRect(CX - 50, 112, Math.min(1, g.downFor / T.RESTART_HOLD) * 100, 5);
      }
    }
    if (g.state === 'victory') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, VH);
      const hue = Math.floor(g.clock / 300) % 6;
      const cols = ['#3a6bff', '#ff3a2a', '#3aff5a', '#ffc23a', '#c23aff', '#ffffff'];
      text(ctx, 'PHOBOS ANOMALY', CX, 72, 28, cols[hue]);
      text(ctx, 'CLEARED', CX, 98, 22, '#e8ddd0');
      text(ctx, g.kills + ' KILLS. HOLD TO PLAY AGAIN.', CX, 120, 10, '#c8c2b0');
    }
    const p = prompt(g);
    if (p) text(ctx, p, 8, 14, 10, 'rgba(240,232,220,0.85)', 'left');
    statusBar(ctx, g, led);
    ctx.restore();
  }

  // shown before the first press
  function title(ctx, clock) {
    ctx.fillStyle = '#0b0302';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = 'rgba(255,120,60,' + (0.08 + hash(i, 9) * 0.3) + ')';
      ctx.fillRect(hash(i, 4) * W, hash(i, 5) * H, 1, 1);
    }
    const g = ctx.createLinearGradient(0, 50, 0, 110);
    g.addColorStop(0, '#ffd23a'); g.addColorStop(0.5, '#e2541c'); g.addColorStop(1, '#7a0c06');
    ctx.font = '900 76px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000'; ctx.fillText('DOOM', CX + 2, 112);
    ctx.fillStyle = g; ctx.fillText('DOOM', CX, 110);
    text(ctx, 'ON ONE LED', CX, 134, 16, '#e8ddd0');
    if (Math.floor(clock / 600) % 2 === 0) text(ctx, 'PRESS THE BUTTON', CX, 170, 12, '#c8c2b0');
  }

  const api = { draw, title, W, H, SPRITES, LOOKS, THEMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DoomScreen = api;
})(this);
