// County war. The board is the 2026 governor map. The pieces are columns.
// Only a column can attack, and only the county next door.

export const RULES = {
  columns: 8,
  startStack: 8,
  militia: 1,
  battles: 2,
  march: 6,
  recruit: 8,
  maxTurns: 12,
  statePrize: 2,
};

export const other = (p) => (p === "R" ? "D" : "R");

function dist(board, a, b) {
  return Math.hypot(board.cx[a] - board.cx[b], board.cy[a] - board.cy[b]);
}

export function deploy(board) {
  const chosen = { R: [], D: [] };
  const { adj, party } = board;
  for (const side of ["R", "D"]) {
    const cands = [];
    for (let i = 0; i < party.length; i++) {
      if (party[i] !== side) continue;
      let enemy = 0;
      for (const j of adj[i]) if (party[j] !== side) enemy++;
      if (enemy) cands.push([enemy, i]);
    }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const min of [12, 8, 5, 3, 1.5, 0]) {
      for (const [, i] of cands) {
        if (chosen[side].length >= RULES.columns) break;
        if (chosen[side].some((k) => dist(board, k, i) < min)) continue;
        chosen[side].push(i);
      }
    }
  }
  return chosen;
}

function rollDice(rng, n) {
  const d = [];
  for (let k = 0; k < n; k++) d.push(1 + Math.floor(rng() * 6));
  d.sort((a, b) => b - a);
  return d;
}

const CHANCE = new Map();

export function chance(atk, def) {
  const a = Math.max(1, Math.min(36, atk | 0));
  const d = Math.max(1, Math.min(36, def | 0));
  const key = a * 40 + d;
  const hit = CHANCE.get(key);
  if (hit != null) return hit;
  let wins = 0;
  const trials = 80;
  for (let t = 0; t < trials; t++) {
    let aa = a;
    let dd = d;
    let seed = (key * 997 + t * 131) >>> 0;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    while (aa >= 2 && dd > 0) {
      const ad = rollDice(rng, Math.min(3, aa - 1));
      const ddice = rollDice(rng, Math.min(2, dd));
      const n = Math.min(ad.length, ddice.length);
      for (let k = 0; k < n; k++) {
        if (ad[k] > ddice[k]) dd--;
        else aa--;
      }
    }
    if (dd <= 0) wins++;
  }
  const rate = wins / trials;
  CHANCE.set(key, rate);
  return rate;
}

export function newGame(board, human) {
  const n = board.party.length;
  const owner = board.party.slice();
  const armies = new Array(n).fill(RULES.militia);
  const dudeAt = new Array(n).fill(null);
  const posts = deploy(board);
  let nextId = 1;
  for (const side of ["R", "D"]) {
    for (const i of posts[side]) {
      dudeAt[i] = { id: nextId++, side, battles: RULES.battles, marched: false };
      armies[i] = RULES.startStack;
    }
  }
  const g = {
    board,
    owner,
    armies,
    dudeAt,
    human,
    turn: 1,
    player: human,
    phase: "raise",
    reserve: RULES.recruit,
    taken: { R: 0, D: 0 },
    winner: null,
    reason: "",
    log: [],
    rng: Math.random,
  };
  note(g, "The columns are on the front.");
  return g;
}

function note(g, text) {
  g.log.unshift(text);
  if (g.log.length > 8) g.log.pop();
}

export function columnsOf(g, side) {
  let n = 0;
  for (const d of g.dudeAt) if (d && d.side === side) n++;
  return n;
}

export function wholeStates(g) {
  const bag = new Map();
  const st = g.board.st;
  for (let i = 0; i < st.length; i++) {
    const code = st[i];
    let row = bag.get(code);
    if (!row) {
      row = { n: 0, R: 0, D: 0 };
      bag.set(code, row);
    }
    row.n++;
    row[g.owner[i]]++;
  }
  let R = 0;
  let D = 0;
  for (const row of bag.values()) {
    if (row.R === row.n) R++;
    else if (row.D === row.n) D++;
  }
  return { R, D };
}

const STATE = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "the District", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

function stateName(code) {
  return STATE[code] || code;
}

function stateSwept(g, code, side) {
  const st = g.board.st;
  for (let i = 0; i < st.length; i++) {
    if (st[i] === code && g.owner[i] !== side) return false;
  }
  return true;
}

export function place(g, i, n) {
  if (g.phase !== "raise" || g.winner) return 0;
  const dude = g.dudeAt[i];
  if (!dude || dude.side !== g.player) return 0;
  n = Math.max(0, Math.min(n | 0, g.reserve));
  if (!n) return 0;
  g.armies[i] += n;
  g.reserve -= n;
  return n;
}

export function dumpReserve(g) {
  if (g.phase !== "raise") return;
  if (g.reserve) {
    let best = -1;
    for (let i = 0; i < g.dudeAt.length; i++) {
      const d = g.dudeAt[i];
      if (!d || d.side !== g.player) continue;
      if (best < 0 || g.armies[i] > g.armies[best]) best = i;
    }
    if (best >= 0) place(g, best, g.reserve);
  }
  g.phase = "fight";
}

export function canFight(g, from, to) {
  const dude = g.dudeAt[from];
  if (!dude || g.phase !== "fight" || g.winner) return false;
  if (dude.side !== g.player || dude.battles <= 0) return false;
  if (g.armies[from] < 2) return false;
  if (g.owner[to] === g.player) return false;
  return g.board.adj[from].includes(to);
}

export function fight(g, from, to) {
  if (!canFight(g, from, to)) return null;
  const dude = g.dudeAt[from];
  const startA = g.armies[from];
  const startD = g.armies[to];
  const enemyDude = g.dudeAt[to];
  while (g.armies[from] >= 2 && g.armies[to] > 0) {
    const a = rollDice(g.rng, Math.min(3, g.armies[from] - 1));
    const d = rollDice(g.rng, Math.min(2, g.armies[to]));
    const n = Math.min(a.length, d.length);
    for (let k = 0; k < n; k++) {
      if (a[k] > d[k]) g.armies[to]--;
      else g.armies[from]--;
    }
  }
  dude.battles -= 1;
  const name = g.board.names[to];
  const code = g.board.st[to];
  if (g.armies[to] > 0) {
    note(g, `Held at ${name}, ${code}. ${startA} against ${startD}.`);
    return { captured: false, from, to };
  }
  g.owner[to] = g.player;
  g.taken[g.player] += 1;
  const moved = g.armies[from] - 1;
  g.armies[from] = RULES.militia;
  g.armies[to] = moved;
  g.dudeAt[from] = null;
  g.dudeAt[to] = dude;
  if (enemyDude) note(g, `Column broken at ${name}, ${code}.`);
  else note(g, `Took ${name}, ${code}.`);
  if (stateSwept(g, code, g.player)) {
    g.armies[to] += RULES.statePrize;
    note(g, `${stateName(code)} is yours. The column is reinforced.`);
  }
  if (columnsOf(g, other(g.player)) === 0) {
    g.winner = g.player;
    g.reason = "Every enemy column is broken.";
    g.phase = "over";
  }
  return { captured: true, from, to };
}

export function reach(g, from) {
  const dude = g.dudeAt[from];
  const out = new Map();
  if (!dude || dude.side !== g.player || dude.marched || g.phase !== "march") return out;
  const side = g.player;
  let edge = [from];
  const seen = new Set([from]);
  for (let depth = 1; depth <= RULES.march; depth++) {
    const next = [];
    for (const i of edge) {
      for (const j of g.board.adj[i]) {
        if (seen.has(j) || g.owner[j] !== side) continue;
        seen.add(j);
        if (!g.dudeAt[j]) out.set(j, depth);
        next.push(j);
      }
    }
    edge = next;
  }
  return out;
}

export function march(g, from, to) {
  if (g.phase !== "march" || g.winner) return false;
  const dude = g.dudeAt[from];
  if (!dude || dude.side !== g.player || dude.marched) return false;
  if (g.armies[from] < 2) return false;
  if (!reach(g, from).has(to)) return false;
  const n = g.armies[from] - 1;
  g.armies[from] = RULES.militia;
  g.armies[to] += n;
  dude.marched = true;
  g.dudeAt[from] = null;
  g.dudeAt[to] = dude;
  note(g, `Marched to ${g.board.names[to]}, ${g.board.st[to]}.`);
  return true;
}

function judge(g) {
  if (g.taken.R !== g.taken.D) return g.taken.R > g.taken.D ? "R" : "D";
  const cR = columnsOf(g, "R");
  const cD = columnsOf(g, "D");
  if (cR !== cD) return cR > cD ? "R" : "D";
  return g.human;
}

export function endPhase(g) {
  if (g.winner) return;
  if (g.phase === "raise") {
    dumpReserve(g);
    return;
  }
  if (g.phase === "fight") {
    g.phase = "march";
    return;
  }
  if (g.phase === "march") endTurn(g);
}

function refresh(g, side) {
  for (const dude of g.dudeAt) {
    if (!dude || dude.side !== side) continue;
    dude.battles = RULES.battles;
    dude.marched = false;
  }
}

export function endTurn(g) {
  if (g.winner) return;
  const nxt = other(g.player);
  if (nxt === g.human && g.turn >= RULES.maxTurns) {
    g.winner = judge(g);
    g.reason = "Twelve turns. The side that took more counties.";
    g.phase = "over";
    return;
  }
  if (nxt === g.human) g.turn += 1;
  g.player = nxt;
  g.phase = "raise";
  g.reserve = RULES.recruit;
  refresh(g, nxt);
}

function bestColumn(g, scoreFn) {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < g.dudeAt.length; i++) {
    const d = g.dudeAt[i];
    if (!d || d.side !== g.player) continue;
    const s = scoreFn(i, d);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

function enemyTouch(g, i) {
  const side = g.owner[i];
  let militia = 0;
  let dudes = 0;
  for (const j of g.board.adj[i]) {
    if (g.owner[j] === side) continue;
    if (g.dudeAt[j]) dudes++;
    else militia++;
  }
  return { militia, dudes };
}

function enemyColumnDist(g) {
  const dist = new Array(g.owner.length).fill(99);
  let edge = [];
  for (let i = 0; i < g.dudeAt.length; i++) {
    const d = g.dudeAt[i];
    if (d && d.side !== g.player) {
      dist[i] = 0;
      edge.push(i);
    }
  }
  for (let depth = 1; edge.length && depth < 8; depth++) {
    const next = [];
    for (const i of edge) {
      for (const j of g.board.adj[i]) {
        if (dist[j] <= depth) continue;
        dist[j] = depth;
        next.push(j);
      }
    }
    edge = next;
  }
  return dist;
}

export function aiStep(g) {
  if (g.winner) return "over";
  const heat = enemyColumnDist(g);
  if (g.phase === "raise") {
    const i = bestColumn(g, (idx) => {
      const t = enemyTouch(g, idx);
      return t.dudes * 8 + t.militia + (12 - Math.min(12, heat[idx])) * 2;
    });
    if (i >= 0) place(g, i, g.reserve);
    g.phase = "fight";
    return "raise";
  }
  if (g.phase === "fight") {
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < g.dudeAt.length; i++) {
      const d = g.dudeAt[i];
      if (!d || d.side !== g.player || d.battles <= 0 || g.armies[i] < 2) continue;
      for (const j of g.board.adj[i]) {
        if (g.owner[j] === g.player) continue;
        const odds = chance(g.armies[i], g.armies[j]);
        const kills = g.dudeAt[j] ? 1 : 0;
        if (kills && odds < 0.55) continue;
        if (!kills && odds < 0.7) continue;
        const close = Math.max(0, 6 - heat[j]);
        const score = odds * (1 + kills * 8 + close);
        if (score > bestScore) {
          bestScore = score;
          best = [i, j];
        }
      }
    }
    if (!best) {
      g.phase = "march";
      return "hold";
    }
    fight(g, best[0], best[1]);
    return "fight";
  }
  let marched = false;
  for (let i = 0; i < g.dudeAt.length; i++) {
    const d = g.dudeAt[i];
    if (!d || d.side !== g.player || d.marched || g.armies[i] < 2) continue;
    if (heat[i] <= 1) continue;
    const spots = reach(g, i);
    let dest = -1;
    let destHeat = heat[i];
    for (const [j] of spots) {
      if (heat[j] < destHeat) {
        destHeat = heat[j];
        dest = j;
      }
    }
    if (dest >= 0) {
      march(g, i, dest);
      marched = true;
      break;
    }
  }
  if (!marched) {
    endTurn(g);
    return "end";
  }
  return "march";
}

export function fightTargets(g, from) {
  if (g.phase !== "fight") return [];
  const dude = g.dudeAt[from];
  if (!dude || dude.side !== g.player || dude.battles <= 0 || g.armies[from] < 2) return [];
  return g.board.adj[from].filter((j) => g.owner[j] !== g.player);
}
