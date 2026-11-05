// Builds index.html: inlines the engine, the region data and the
// computer-vs-computer results.   node build/build.mjs [gamesPerMode]
import fs from 'fs';
import * as E from '../src/engine.js';

const ROOT = new URL('..', import.meta.url).pathname;
const data = JSON.parse(fs.readFileSync(ROOT + 'data/regions.json'));
const GAMES = +(process.argv[2] || 60);

const sim = {};
for (const mode of Object.keys(E.MODES)) {
  const w = { R: 0, D: 0 };
  for (let n = 0; n < GAMES; n++) {
    const g = E.newGame(data, mode, { rng: E.mulberry32(1000 + n), first: n % 2 ? 'D' : 'R' });
    while (!g.winner && g.turn <= 400) E.aiTurn(g);
    if (g.winner) w[g.winner]++;
  }
  sim[mode] = w;
}
console.log('sim', JSON.stringify(sim));

const src = fs.readFileSync(ROOT + 'src/engine.js', 'utf8');
const names = [...src.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m => m[1]);
const engine = `const E = (() => {\n${src.replace(/^export\s+/gm, '')}\nreturn { ${names.join(', ')} };\n})();`;

// region data without build-only fields
const slim = { ...data, regions: data.regions.map(({ screenArea, ...r }) => r) };

let html = fs.readFileSync(ROOT + 'src/index.template.html', 'utf8');
html = html.replace('/*DATA*/null', () => JSON.stringify(slim))
           .replace('/*SIM*/null', () => JSON.stringify(sim))
           .replace('/*ENGINE*/', () => engine);
fs.writeFileSync(ROOT + 'index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
