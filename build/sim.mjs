// AI vs AI balance check: node build/sim.mjs [gamesPerMode]
import fs from 'fs';
import * as E from '../src/engine.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url)));
const N = +(process.argv[2] || 40);
const MAX_TURNS = 300;

for (const mode of Object.keys(E.MODES)) {
  const wins = { R: 0, D: 0, none: 0 }, turns = [];
  let firstIncome;
  for (let n = 0; n < N; n++) {
    const g = E.newGame(data, mode, { rng: E.mulberry32(1000 + n), first: n % 2 ? 'D' : 'R' });
    if (!firstIncome) firstIncome = { R: E.income(g, 'R').total, D: E.income(g, 'D').total };
    while (!g.winner && g.turn <= MAX_TURNS) E.aiTurn(g);
    if (g.winner) { wins[g.winner]++; turns.push(g.turn); } else wins.none++;
  }
  turns.sort((a, b) => a - b);
  console.log(`${mode.padEnd(8)} income R${firstIncome.R}/D${firstIncome.D}  wins R ${wins.R}  D ${wins.D}  unfinished ${wins.none}  median turns ${turns[turns.length >> 1] ?? '-'}`);
}
