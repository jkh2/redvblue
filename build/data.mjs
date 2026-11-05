// Builds data/regions.json: same-party county regions per state, with
// adjacency, values (counties, land area, ballots cast) and SVG paths.
// Sources: us-atlas (Census cartographic boundaries) and 2024 presidential
// county results (github.com/tonmcg/US_County_Level_Election_Results_08-24).
import fs from 'fs';
import * as topo from 'topojson-client';
import { geoArea, geoPath, geoCentroid } from 'd3-geo';

const ROOT = new URL('..', import.meta.url).pathname;
const albers = JSON.parse(fs.readFileSync(ROOT + 'node_modules/us-atlas/counties-albers-10m.json'));
const lonlat = JSON.parse(fs.readFileSync(ROOT + 'node_modules/us-atlas/counties-10m.json'));
const rows = fs.readFileSync(ROOT + 'data/county2024.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(','));

const ST = {'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'};
const STNAME = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};

const res = new Map(rows.map(r => [r[1], { gop: +r[3], dem: +r[4], total: +r[5] }]));
const stateTotal = fips2 => rows.filter(r => r[1].startsWith(fips2))
  .reduce((a, r) => ({ gop: a.gop + +r[3], dem: a.dem + +r[4], total: a.total + +r[5] }), { gop: 0, dem: 0, total: 0 });
// Alaska reports by state-house district and Connecticut by planning region, so
// neither lines up with the county shapes: each becomes one statewide region.
const WHOLE_STATE = { '02': stateTotal('02'), '09': stateTotal('09') };

const geoms = albers.objects.counties.geometries;
const llById = new Map(topo.feature(lonlat, lonlat.objects.counties).features.map(f => [f.id, f]));
const nb = topo.neighbors(geoms);
const R_KM = 6371.0088;

const county = geoms.map((g, i) => {
  const f2 = g.id.slice(0, 2);
  const whole = WHOLE_STATE[f2];
  let r = whole ? null : res.get(g.id);
  if (!whole && !r) {
    // Kalawao (HI) is reported with Maui County.
    if (g.id === '15005') r = { gop: 0, dem: 1, total: 0 };
    else throw new Error('no result for ' + g.id + ' ' + g.properties.name);
  }
  const ll = llById.get(g.id);
  return {
    i, id: g.id, name: g.properties.name, st: ST[f2],
    party: whole ? (whole.gop > whole.dem ? 'R' : 'D') : (r.gop > r.dem ? 'R' : 'D'),
    ballots: r ? r.total : 0,
    areaKm2: ll ? geoArea(ll) * R_KM * R_KM : 0,
  };
});

// Union counties into regions: same state, same party, sharing a border.
const comp = new Array(geoms.length).fill(-1);
const regions = [];
for (const c of county) {
  if (comp[c.i] >= 0) continue;
  const id = regions.length, members = [], q = [c.i];
  comp[c.i] = id;
  const whole = !!WHOLE_STATE[c.id.slice(0, 2)];
  while (q.length) {
    const k = q.pop(); members.push(k);
    const next = whole ? county.filter(o => o.st === c.st).map(o => o.i) : nb[k];
    for (const j of next) {
      if (comp[j] < 0 && county[j].st === c.st && county[j].party === c.party) { comp[j] = id; q.push(j); }
    }
  }
  regions.push({ id, st: c.st, party: c.party, members });
}

const path = geoPath(); // albers file is already projected (975x610 canvas)
const out = regions.map(r => {
  const geom = topo.merge(albers, r.members.map(k => geoms[k]));
  const feature = { type: 'Feature', geometry: geom };
  // label at centroid of the largest polygon piece
  let best = null, bestA = -1;
  for (const poly of geom.coordinates) {
    const f = { type: 'Polygon', coordinates: poly };
    const a = path.area(f);
    if (a > bestA) { bestA = a; best = f; }
  }
  const [lx, ly] = path.centroid(best);
  const mem = r.members.map(k => county[k]);
  const big = mem.slice().sort((a, b) => b.ballots - a.ballots || b.areaKm2 - a.areaKm2)[0];
  const whole = !!WHOLE_STATE[geoms[r.members[0]].id.slice(0, 2)];
  const totalInState = county.filter(c => c.st === r.st).length;
  let name;
  if (whole || mem.length === totalInState) name = STNAME[r.st];
  else if (mem.length === 1) name = `${big.name}, ${r.st}`;
  else name = `${big.name} region, ${r.st}`;
  return {
    id: r.id, name, st: r.st, party: r.party,
    counties: whole ? stateRowsCount(r.st) : mem.length,
    areaKm2: Math.round(mem.reduce((s, c) => s + c.areaKm2, 0)),
    ballots: whole ? WHOLE_STATE[geoms[r.members[0]].id.slice(0, 2)].total : mem.reduce((s, c) => s + c.ballots, 0),
    d: roundPath(path(feature)),
    lx: +lx.toFixed(1), ly: +ly.toFixed(1),
    screenArea: +path.area(feature).toFixed(2),
    cx: path.centroid(feature),
  };
});
function stateRowsCount(st) {
  const f2 = Object.keys(ST).find(k => ST[k] === st);
  return county.filter(c => c.id.startsWith(f2)).length;
}
function roundPath(d) { return d.replace(/-?\d+\.\d+/g, n => (+n).toFixed(1)); }

// Land adjacency between regions.
const adj = out.map(() => new Set());
geoms.forEach((g, i) => nb[i].forEach(j => { if (comp[i] !== comp[j]) { adj[comp[i]].add(comp[j]); } }));

// Sea links: Alaska to western Washington, Hawaii to Los Angeles, and any
// region with no land neighbor to its nearest region (prefer same state).
const sea = [];
const regionOf = fips => comp[geoms.findIndex(g => g.id === fips)];
const link = (a, b) => { if (a === b || adj[a].has(b)) return; adj[a].add(b); adj[b].add(a); sea.push([a, b]); };
link(regionOf('02020'), regionOf('53033'));
link(regionOf('15003'), regionOf('06037'));
const dist = (a, b) => Math.hypot(out[a].cx[0] - out[b].cx[0], out[a].cx[1] - out[b].cx[1]);
// Hawaii islands chain together
const hi = out.filter(r => r.st === 'HI').map(r => r.id);
for (const a of hi) { const b = hi.filter(x => x !== a).sort((x, y) => dist(a, x) - dist(a, y))[0]; if (b !== undefined) link(a, b); }
for (const r of out) {
  if (adj[r.id].size > 0) continue;
  const same = out.filter(o => o.id !== r.id && o.st === r.st);
  const pool = same.length ? same : out.filter(o => o.id !== r.id);
  const b = pool.sort((x, y) => dist(r.id, x.id) - dist(r.id, y.id))[0];
  link(r.id, b.id);
}
// make sure the graph is connected
const seen = new Set([0]); const q = [0];
while (q.length) { const k = q.pop(); for (const j of adj[k]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
if (seen.size !== out.length) throw new Error(`graph not connected: ${seen.size}/${out.length}`);

const states = {};
for (const r of out) (states[r.st] ||= []).push(r.id);

const data = {
  source: {
    results: '2024 U.S. presidential results by county, compiled at github.com/tonmcg/US_County_Level_Election_Results_08-24',
    shapes: 'U.S. Census Bureau cartographic boundaries via the us-atlas package',
    notes: 'Alaska and Connecticut do not report by county, so each is one statewide region. Kalawao County, HI is reported with Maui.',
  },
  width: 975, height: 610,
  regions: out.map(({ cx, ...r }) => ({ ...r, adj: [...adj[r.id]].sort((a, b) => a - b) })),
  sea, states,
  stateNames: STNAME,
  stateLines: roundPath(path(topo.mesh(albers, albers.objects.states, (a, b) => a !== b))),
  nation: roundPath(path(topo.mesh(albers, albers.objects.nation))),
};
fs.writeFileSync(ROOT + 'data/regions.json', JSON.stringify(data));

// Report
const sum = (p, k) => out.filter(r => !p || r.party === p).reduce((s, r) => s + r[k], 0);
const pct = (p, k) => (100 * sum(p, k) / sum(null, k)).toFixed(1) + '%';
console.log('regions', out.length, 'R', out.filter(r => r.party === 'R').length, 'D', out.filter(r => r.party === 'D').length);
for (const k of ['counties', 'areaKm2', 'ballots']) console.log(k.padEnd(9), 'R', pct('R', k), ' D', pct('D', k));
console.log('sea links', sea.length, 'bytes', JSON.stringify(data).length);
const wholeStates = Object.entries(states).filter(([st, ids]) => ids.length === 1).map(([st, ids]) => st + out[ids[0]].party);
console.log('one-region states', wholeStates.join(' '));
