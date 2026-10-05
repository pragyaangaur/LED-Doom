// A player that sees only the LED colour and presses only the one button.

function classify([r, g, b]) {
  const m = Math.max(r, g, b);
  if (m < 8) return 'off';
  const n = [r / m, g / m, b / m];
  if (n[0] > 0.8 && n[1] > 0.8 && n[2] > 0.8) return 'white';
  if (n[0] > 0.8 && n[1] > 0.5 && n[2] < 0.3) return 'yellow';
  if (n[0] > 0.5 && n[1] < 0.2 && n[2] > 0.8) return 'purple';
  if (n[0] > 0.8 && n[1] < 0.2 && n[2] < 0.2) return 'red';
  if (n[1] > 0.8 && n[0] < 0.3) return 'green';
  if (n[2] > 0.8 && n[0] < 0.2) return 'blue';
  return 'unknown';
}

// reaction: ms between seeing a colour and acting on it. tap: ms the button stays down.
function makeBot({ reaction = 180, tap = 60, idle = false } = {}) {
  let seen = null;
  let seenFor = 0;
  let tapLeft = 0;
  let gap = 0;
  let last = false;
  let dark = 0;
  return function (color, dt) {
    last = decide(color, dt);
    return last;
  };
  function decide(color, dt) {
    let c = classify(color);
    if (c === 'unknown') throw new Error('unclassifiable colour ' + color);
    // a fight is red with green shot flashes and dark pain flickers in it,
    // and a person keeps hammering through those instead of reacting afresh
    if (c === 'green' && seen === 'red') c = 'red';
    if (c === 'off' && seen === 'red') { dark += dt; if (dark < 400) c = 'red'; } else dark = 0;
    if (c !== seen) { seen = c; seenFor = 0; } else seenFor += dt;
    if (idle) return false;
    const ready = seenFor >= reaction;
    if (c === 'blue') return ready || last; // keep holding through the restart ember
    if (c === 'off') return ready && seenFor > 2500; // a long dark is death, hold to restart
    if (c === 'red' || c === 'yellow' || c === 'purple') {
      if (!ready) return false;
      if (tapLeft > 0) { tapLeft -= dt; return true; }
      if (gap > 0) { gap -= dt; return false; }
      tapLeft = tap; gap = tap;
      return true;
    }
    tapLeft = 0;
    return false;
  }
}

module.exports = { classify, makeBot };
