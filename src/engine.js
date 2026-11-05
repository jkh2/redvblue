// Red v Blue game engine. Pure logic, no DOM. The build inlines this file
// into index.html (dropping the `export` keywords); the simulator imports it.

export const MODES = {
  land:     { key: 'areaKm2',  label: 'Land',     blurb: 'Income follows square miles held.' },
  counties: { key: 'counties', label: 'Counties', blurb: 'Income follows counties held.' },
  ballots:  { key: 'ballots',  label: 'Voters',   blurb: 'Income follows 2024 ballots cast in the counties held.' },
};

export const RULES = {
  startArmies: 3,     // every region starts with this many
  baseIncome: 3,      // every side gets this each turn
  pool: 30,           // armies split each turn by share of the mode's value
  stateBonus: 1,      // per whole state held
};

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const other = p => (p === 'R' ? 'D' : 'R');

// A side collapses when it holds fewer than this many regions (10% of the map).
export const collapseAt = g => Math.ceil(g.owner.length * 0.1);

export function newGame(data, mode = 'land', opts = {}) {
  const rng = opts.rng || Math.random;
  const g = {
    data, mode, rng,
    owner: data.regions.map(r => r.party),
    armies: data.regions.map(() => RULES.startArmies),
    turn: 1,
    player: opts.first || 'R',
    phase: 'reinforce',
    reserve: 0,
    fortified: false,
    winner: null,
    log: [],
    total: data.regions.reduce((s, r) => s + r[MODES[mode].key], 0),
  };
  g.reserve = income(g, g.player).total;
  return g;
}

export function valueOf(g, i) { return g.data.regions[i][MODES[g.mode].key]; }

export function share(g, p) {
  let s = 0;
  for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === p) s += valueOf(g, i);
  return s / g.total;
}

export function wholeStates(g, p) {
  const out = [];
  for (const [st, ids] of Object.entries(g.data.states)) if (ids.every(i => g.owner[i] === p)) out.push(st);
  return out;
}

export function income(g, p) {
  const sh = share(g, p);
  const fromShare = Math.round(RULES.pool * sh);
  const states = wholeStates(g, p);
  const bonus = states.length * RULES.stateBonus;
  return { base: RULES.baseIncome, fromShare, bonus, states, share: sh, total: RULES.baseIncome + fromShare + bonus };
}

export function counts(g) {
  const c = { R: { regions: 0, armies: 0 }, D: { regions: 0, armies: 0 } };
  g.owner.forEach((p, i) => { c[p].regions++; c[p].armies += g.armies[i]; });
  return c;
}

export function adj(g, i) { return g.data.regions[i].adj; }

export function place(g, i, n) {
  if (g.phase !== 'reinforce' || g.owner[i] !== g.player) return 0;
  n = Math.min(n, g.reserve);
  g.armies[i] += n; g.reserve -= n;
  if (g.reserve === 0) g.phase = 'attack';
  return n;
}

export function canAttack(g, from, to) {
  return g.phase === 'attack' && g.owner[from] === g.player && g.owner[to] !== g.player &&
    g.armies[from] >= 2 && adj(g, from).includes(to);
}

function rollDice(rng, n) {
  const d = [];
  for (let k = 0; k < n; k++) d.push(1 + Math.floor(rng() * 6));
  return d.sort((a, b) => b - a);
}

// One Risk-style exchange: attacker rolls up to 3, defender up to 2,
// highest dice compared pairwise, ties go to the defender.
export function roll(g, from, to) {
  const a = rollDice(g.rng, Math.min(3, g.armies[from] - 1));
  const d = rollDice(g.rng, Math.min(2, g.armies[to]));
  let lostA = 0, lostD = 0;
  for (let k = 0; k < Math.min(a.length, d.length); k++) (a[k] > d[k] ? lostD++ : lostA++);
  g.armies[from] -= lostA; g.armies[to] -= lostD;
  return { a, d, lostA, lostD };
}

// Keep rolling until the defender falls or the attacker is down to one.
export function blitz(g, from, to) {
  if (!canAttack(g, from, to)) return null;
  const startA = g.armies[from], startD = g.armies[to];
  const rolls = [];
  while (g.armies[from] >= 2 && g.armies[to] > 0) rolls.push(roll(g, from, to));
  const result = { from, to, rolls, startA, startD, lostA: startA - g.armies[from], lostD: startD, captured: false };
  result.lostD = startD - g.armies[to];
  if (g.armies[to] === 0) {
    const loser = g.owner[to];
    g.owner[to] = g.player;
    const move = g.armies[from] - 1;            // march everyone but one in
    g.armies[to] = move; g.armies[from] = 1;
    result.captured = true; result.moved = move;
    const left = g.owner.reduce((n, p) => n + (p === loser), 0);
    if (left < collapseAt(g)) { g.winner = g.player; g.phase = 'over'; }
  }
  g.log.push(result);
  return result;
}

export function endAttacks(g) { if (g.phase === 'attack') g.phase = 'fortify'; }

// Fortify: once per turn, along a chain of your own regions.
export function ownPath(g, from, to) {
  if (g.owner[from] !== g.owner[to]) return false;
  const p = g.owner[from], seen = new Set([from]), q = [from];
  while (q.length) {
    const k = q.pop(); if (k === to) return true;
    for (const j of adj(g, k)) if (!seen.has(j) && g.owner[j] === p) { seen.add(j); q.push(j); }
  }
  return false;
}

export function fortify(g, from, to, n) {
  if (g.phase !== 'fortify' && g.phase !== 'attack') return false;
  if (from === to || g.owner[from] !== g.player || !ownPath(g, from, to)) return false;
  n = Math.max(0, Math.min(n, g.armies[from] - 1));
  if (!n) return false;
  g.armies[from] -= n; g.armies[to] += n; g.fortified = true;
  endTurn(g);
  return true;
}

export function endTurn(g) {
  if (g.phase === 'over') return;
  g.player = other(g.player);
  if (g.player === 'R') g.turn++;
  g.phase = 'reinforce'; g.fortified = false;
  g.reserve = income(g, g.player).total;
}

// ---------------------------------------------------------------- AI ----

export function isBorder(g, i) { return adj(g, i).some(j => g.owner[j] !== g.owner[i]); }

// How much an AI wants region j: its value plus a nudge for finishing a state.
function targetWorth(g, j) {
  const meanVal = g.total / g.owner.length;
  let w = valueOf(g, j) / meanVal;
  const st = g.data.regions[j].st, ids = g.data.states[st];
  const missing = ids.filter(k => g.owner[k] !== g.player).length;
  if (missing === 1 && ids.length > 1) w += 2.5;           // completes a state
  if (ids.length > 1 && missing === ids.length) w += 0;    // no bonus yet
  // breaking the enemy's whole state is worth something too
  if (ids.every(k => g.owner[k] === other(g.player))) w += 1;
  return Math.min(w, 6) + 0.5;
}

export function aiReinforce(g) {
  const me = g.player;
  while (g.reserve > 0) {
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < g.owner.length; i++) {
      if (g.owner[i] !== me || !isBorder(g, i)) continue;
      let s = -Infinity;
      for (const j of adj(g, i)) {
        if (g.owner[j] === me) continue;
        // favor stacks that can take a valuable neighbor soon
        const need = g.armies[j] + 2 - g.armies[i];
        s = Math.max(s, targetWorth(g, j) * 3 - Math.max(0, need) * 0.25);
      }
      const threat = adj(g, i).reduce((t, j) => t + (g.owner[j] !== me ? g.armies[j] : 0), 0) - g.armies[i];
      s += Math.max(0, threat) * 0.05 + g.rng() * 0.3;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) best = g.owner.indexOf(me);
    place(g, best, Math.min(g.reserve, Math.max(1, Math.ceil(g.reserve / 3))));
  }
}

export function aiAttackStep(g) {
  // returns the blitz result, or null when the AI is done attacking
  let best = null, bestScore = 0;
  for (let i = 0; i < g.owner.length; i++) {
    if (g.owner[i] !== g.player || g.armies[i] < 3) continue;
    for (const j of adj(g, i)) {
      if (g.owner[j] === g.player) continue;
      const ratio = (g.armies[i] - 1) / (g.armies[j] + 1);
      if (ratio < 1.1) continue;
      const score = ratio * targetWorth(g, j);
      if (score > bestScore) { bestScore = score; best = [i, j]; }
    }
  }
  return best ? blitz(g, best[0], best[1]) : null;
}

export function aiFortify(g) {
  const me = g.player;
  // biggest stack with no enemy neighbors walks to the nearest border region
  let src = -1;
  for (let i = 0; i < g.owner.length; i++)
    if (g.owner[i] === me && g.armies[i] > 1 && !isBorder(g, i) && (src < 0 || g.armies[i] > g.armies[src])) src = i;
  if (src < 0) { endTurn(g); return; }
  const prev = new Map([[src, -1]]), q = [src];
  let dest = -1;
  while (q.length && dest < 0) {
    const k = q.shift();
    for (const j of adj(g, k)) {
      if (prev.has(j) || g.owner[j] !== me) continue;
      prev.set(j, k);
      if (isBorder(g, j)) { dest = j; break; }
      q.push(j);
    }
  }
  if (dest < 0) { endTurn(g); return; }
  fortify(g, src, dest, g.armies[src] - 1);
}

export function aiTurn(g, maxAttacks = 400) {
  aiReinforce(g);
  for (let k = 0; k < maxAttacks && g.phase === 'attack'; k++) if (!aiAttackStep(g)) break;
  if (g.phase === 'over') return;
  endAttacks(g);
  aiFortify(g);
}
