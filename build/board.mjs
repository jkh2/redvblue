// Build data/board.json from the census county topojson and the 2026 governor map.
// Counties are the pieces. Color is who holds the governor's office after the
// November 2026 midterm (called races, plus the leader where a race was not called).

import { readFileSync, writeFileSync } from "node:fs";
import { neighbors } from "topojson-client";

const AFTER = {
  "01": "R", "02": "D", "04": "D", "05": "R", "06": "D", "08": "D", "09": "D",
  "10": "D", "11": "D", "12": "R", "13": "D", "15": "D", "16": "R", "17": "D",
  "18": "R", "19": "D", "20": "D", "21": "D", "22": "R", "23": "D", "24": "D",
  "25": "D", "26": "D", "27": "D", "28": "R", "29": "R", "30": "R", "31": "R",
  "32": "D", "33": "R", "34": "D", "35": "D", "36": "D", "37": "D", "38": "R",
  "39": "D", "40": "R", "41": "D", "42": "D", "44": "D", "45": "R", "46": "R",
  "47": "R", "48": "D", "49": "R", "50": "R", "51": "D", "53": "D", "54": "R",
  "55": "D", "56": "R",
};

const topo = JSON.parse(readFileSync(new URL("../data/counties.json", import.meta.url), "utf8"));
const returnsText = readFileSync("/workspace/src/data/returns.ts", "utf8");
const marker = "export const RETURNS";
const start = returnsText.indexOf("{", returnsText.indexOf(marker));
const returns = JSON.parse(returnsText.slice(start, returnsText.lastIndexOf("};") + 1));

const geom = topo.objects.cb_2023_us_county_5m.geometries;
const neigh = neighbors(geom);
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function centroid(g) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const idx of ring) {
        const arc = idx < 0 ? arcs[~idx] : arcs[idx];
        const step = Math.max(1, Math.floor(arc.length / 8));
        for (let k = 0; k < arc.length; k += step) {
          sx += arc[k][0];
          sy += arc[k][1];
          n++;
        }
      }
    }
  }
  return n ? [sx / n, sy / n] : [0, 0];
}

const ids = [];
const names = [];
const st = [];
const party = [];
const cx = [];
const cy = [];
const adj = neigh.map((row) => row.slice());

geom.forEach((g, i) => {
  const id = String(g.id).padStart(5, "0");
  const row = returns[id];
  ids.push(id);
  names.push(row ? row.name.replace(/ County$/, "").replace(/ Parish$/, "") : id);
  st.push(row ? row.st : "??");
  const fp = id.slice(0, 2);
  if (!AFTER[fp]) throw new Error(`no 2026 side for ${id}`);
  party.push(AFTER[fp]);
  const [x, y] = centroid(g);
  cx.push(Math.round(x * 100) / 100);
  cy.push(Math.round(y * 100) / 100);
});

// Stitch islands to the nearest county in the same state so a column is never stranded.
const byState = new Map();
st.forEach((code, i) => {
  if (!byState.has(code)) byState.set(code, []);
  byState.get(code).push(i);
});
for (const indexes of byState.values()) {
  const guard = indexes.length;
  for (let pass = 0; pass < guard; pass++) {
    const lone = indexes.filter((i) => !adj[i].some((j) => st[j] === st[i]));
    if (!lone.length) break;
    for (const i of lone) {
      let best = -1;
      let bestD = Infinity;
      for (const j of indexes) {
        if (j === i) continue;
        const d = (cx[i] - cx[j]) ** 2 + (cy[i] - cy[j]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0 && !adj[i].includes(best)) {
        adj[i].push(best);
        adj[best].push(i);
      }
    }
  }
}

let borderR = 0;
let borderD = 0;
let r = 0;
let d = 0;
party.forEach((p, i) => {
  if (p === "R") r++;
  else d++;
  if (adj[i].some((j) => party[j] !== p)) {
    if (p === "R") borderR++;
    else borderD++;
  }
});
console.log(`counties R ${r} D ${d}  border R ${borderR} D ${borderD}  stranded ${adj.filter((a) => !a.length).length}`);

const board = { ids, names, st, party, cx, cy, adj };
writeFileSync(new URL("../data/board.json", import.meta.url), JSON.stringify(board));
console.log("wrote data/board.json", Buffer.byteLength(JSON.stringify(board)));
