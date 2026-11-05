import { geoAlbersUsa, geoPath } from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { feature, mesh } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
import {
  RULES,
  newGame,
  place,
  endPhase,
  fight,
  march,
  reach,
  fightTargets,
  chance,
  aiStep,
  columnsOf,
  wholeStates,
} from "./engine.js";

const RED = "#e23c3c";
const BLUE = "#3454d1";
const sideName = (p) => (p === "R" ? "Republican" : "Democratic");
const sideColor = (p) => (p === "R" ? RED : BLUE);

const stage = document.getElementById("stage");
const svg = document.getElementById("map");
const tip = document.getElementById("tip");
const gate = document.getElementById("gate");
const hud = document.getElementById("hud");
const phaseEl = document.getElementById("phase");
const statsEl = document.getElementById("stats");
const actionsEl = document.getElementById("actions");
const logEl = document.getElementById("log");

const view = { x: 0, y: 0, k: 1 };
let board;
let features;
let path;
let world;
let countyPaths;
let borderPath;
let dudeLayer;
let game;
let selected = null;
let drag = null;
let moved = false;
let aiLock = false;

const [boardData, topo] = await Promise.all([
  fetch("./data/board.json").then((r) => r.json()),
  fetch("./data/counties.json").then((r) => r.json()),
]);
board = boardData;
const collection = feature(topo, topo.objects.cb_2023_us_county_5m);
features = collection.features;
if (features.length !== board.party.length) {
  throw new Error("County file does not match the board.");
}

function fit() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w < 40 || h < 40) return;
  const projection = geoAlbersUsa().fitExtent(
    [
      [12, 12],
      [w - 12, h - 12],
    ],
    collection,
  );
  path = geoPath(projection);
  drawCounties();
  drawDudes();
}

function drawCounties() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  world = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(world);
  countyPaths = features.map((feat, i) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", path(feat) || "");
    el.setAttribute("class", "county");
    el.dataset.i = String(i);
    el.setAttribute("fill", sideColor(ownerAt(i)));
    world.append(el);
    return el;
  });
  const line = mesh(topo, topo.objects.cb_2023_us_county_5m, (a, b) => String(a.id).slice(0, 2) !== String(b.id).slice(0, 2));
  borderPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  borderPath.setAttribute("class", "border");
  borderPath.setAttribute("d", path(line) || "");
  world.append(borderPath);
  dudeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  world.append(dudeLayer);
  applyView();
}

function ownerAt(i) {
  return game ? game.owner[i] : board.party[i];
}

function applyView() {
  if (world) world.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
}

function paint(i) {
  const el = countyPaths[i];
  if (!el) return;
  el.setAttribute("fill", sideColor(ownerAt(i)));
  el.classList.remove("target");
}

function paintAll() {
  for (let i = 0; i < countyPaths.length; i++) paint(i);
  markTargets();
}

function markTargets() {
  for (const el of countyPaths) el.classList.remove("target");
  if (!game || game.player !== game.human || selected == null) return;
  const ids =
    game.phase === "fight"
      ? fightTargets(game, selected)
      : game.phase === "march"
        ? [...reach(game, selected).keys()]
        : [];
  for (const i of ids) countyPaths[i].classList.add("target");
}

function drawDudes() {
  if (!dudeLayer) return;
  dudeLayer.replaceChildren();
  if (!game) return;
  game.dudeAt.forEach((dude, i) => {
    if (!dude) return;
    const [x, y] = path.centroid(features[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 11);
    circle.setAttribute("class", `dude${dude.side === game.human ? " mine" : ""}${selected === i ? " on" : ""}`);
    circle.setAttribute("fill", sideColor(dude.side));
    circle.dataset.i = String(i);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "stack");
    label.setAttribute("x", x);
    label.setAttribute("y", y);
    label.textContent = String(game.armies[i]);
    dudeLayer.append(circle, label);
  });
}

function oddsWord(p) {
  if (p >= 0.85) return "very likely";
  if (p >= 0.65) return "likely";
  if (p >= 0.45) return "a toss-up";
  if (p >= 0.25) return "unlikely";
  return "a bad fight";
}

function renderHud() {
  if (!game) return;
  const you = game.human;
  const mine = you === "R" ? "Republican" : "Democrat";
  const phase =
    game.winner != null
      ? `${sideName(game.winner)}`
      : game.player !== you
        ? "Their turn"
        : game.phase === "raise"
          ? "Raise"
          : game.phase === "fight"
            ? "Fight"
            : "March";
  phaseEl.textContent = game.winner ? `${phase} takes it` : phase;
  const states = wholeStates(game);
  const rows = [
    ["Turn", `${Math.min(game.turn, RULES.maxTurns)} of ${RULES.maxTurns}`],
    ["To place", game.player === you && game.phase === "raise" ? String(game.reserve) : "—"],
    ["You took", String(game.taken[you])],
    ["They took", String(game.taken[you === "R" ? "D" : "R"])],
    ["Your columns", String(columnsOf(game, you))],
    ["Their columns", String(columnsOf(game, you === "R" ? "D" : "R"]))],
    ["Whole states", `${states.R} red · ${states.D} blue`],
  ];
  if (selected != null && game.dudeAt[selected] && game.phase === "fight") {
    rows.splice(2, 0, ["Fights left", String(game.dudeAt[selected].battles)]);
  }
  statsEl.replaceChildren();
  for (const [k, v] of rows) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    wrap.append(dt, dd);
    statsEl.append(wrap);
  }
  actionsEl.replaceChildren();
  document.getElementById("over")?.remove();
  if (game.winner) {
    const again = button("Play again", () => {
      gate.hidden = false;
      hud.hidden = true;
      game = null;
      selected = null;
      paintAll();
      drawDudes();
    });
    actionsEl.append(again);
    const over = document.createElement("div");
    over.id = "over";
    const who = document.createElement("h2");
    who.textContent = sideName(game.winner);
    const why = document.createElement("p");
    why.textContent = `${game.reason} You fought as ${mine}.`;
    over.append(who, why);
    actionsEl.after(over);
  } else if (game.player === you) {
    if (game.phase === "raise") {
      actionsEl.append(
        button("All on this column", () => {
          if (selected == null) return;
          place(game, selected, game.reserve);
          if (game.reserve === 0) game.phase = "fight";
          refresh();
        }),
        button("Done raising", () => {
          endPhase(game);
          refresh();
        }, true),
      );
    } else if (game.phase === "fight") {
      actionsEl.append(button("Done fighting", () => { endPhase(game); refresh(); }, true));
    } else {
      actionsEl.append(button("End turn", () => { endPhase(game); refresh(); void runAi(); }, true));
    }
  } else {
    hud.querySelector("#over")?.remove();
  }
  logEl.replaceChildren();
  for (const line of game.log) {
    const li = document.createElement("li");
    li.textContent = line;
    logEl.append(li);
  }
}

function button(label, onClick, primary) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  if (primary) el.className = "primary";
  el.addEventListener("click", onClick);
  return el;
}

function refresh() {
  paintAll();
  drawDudes();
  renderHud();
}

function start(side) {
  game = newGame(board, side);
  selected = null;
  view.x = 0;
  view.y = 0;
  view.k = 1;
  gate.hidden = true;
  hud.hidden = false;
  document.getElementById("dek").textContent =
    side === "R"
      ? "You are red. Eight armies a turn. Put them on a column, then take the county next to it."
      : "You are blue. Eight armies a turn. Put them on a column, then take the county next to it.";
  refresh();
}

document.getElementById("as-r").addEventListener("click", () => start("R"));
document.getElementById("as-d").addEventListener("click", () => start("D"));

function indexFrom(event) {
  const el = event.target;
  if (!el || !el.dataset) return null;
  if (el.dataset.i == null || el.dataset.i === "") return null;
  return Number(el.dataset.i);
}

function onPick(i) {
  if (!game || game.winner || game.player !== game.human || aiLock) return;
  const dude = game.dudeAt[i];
  if (game.phase === "raise") {
    if (dude && dude.side === game.human) {
      selected = i;
      place(game, i, 1);
      if (game.reserve === 0) game.phase = "fight";
      refresh();
    }
    return;
  }
  if (game.phase === "fight") {
    if (dude && dude.side === game.human) {
      selected = i;
      refresh();
      return;
    }
    if (selected != null && fightTargets(game, selected).includes(i)) {
      const from = selected;
      const result = fight(game, from, i);
      selected = result && result.captured ? i : from;
      if (game.dudeAt[selected]?.side !== game.human) selected = null;
      refresh();
    }
    return;
  }
  if (game.phase === "march") {
    if (dude && dude.side === game.human && !dude.marched) {
      selected = i;
      refresh();
      return;
    }
    if (selected != null && reach(game, selected).has(i)) {
      march(game, selected, i);
      selected = i;
      refresh();
    }
  }
}

async function runAi() {
  if (!game || game.winner || game.player === game.human) return;
  aiLock = true;
  let guard = 0;
  while (game && !game.winner && game.player !== game.human && guard++ < 80) {
    aiStep(game);
    refresh();
    await new Promise((r) => setTimeout(r, 140));
  }
  aiLock = false;
  refresh();
}

function showTip(i, clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const name = `${board.names[i]}, ${board.st[i]}`;
  const held = sideName(ownerAt(i));
  let extra = "";
  if (game && selected != null && game.phase === "fight" && fightTargets(game, selected).includes(i)) {
    const p = chance(game.armies[selected], game.armies[i]);
    extra = `${game.armies[selected]} against ${game.armies[i]} · ${oddsWord(p)}`;
  } else if (game && game.dudeAt[i]) {
    const d = game.dudeAt[i];
    extra = `Column of ${game.armies[i]} · ${d.battles} fights left`;
  }
  tip.hidden = false;
  tip.innerHTML = `<strong>${name}</strong><p>${held}</p>${extra ? `<p>${extra}</p>` : ""}`;
  const x = Math.min(clientX - rect.left + 14, rect.width - 180);
  const y = Math.min(clientY - rect.top + 14, rect.height - 80);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

svg.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  moved = false;
  drag = { px: event.clientX, py: event.clientY, x: view.x, y: view.y };
  svg.setPointerCapture(event.pointerId);
});

svg.addEventListener("pointermove", (event) => {
  if (drag) {
    const dx = event.clientX - drag.px;
    const dy = event.clientY - drag.py;
    if (Math.hypot(dx, dy) > 5) moved = true;
    view.x = drag.x + dx;
    view.y = drag.y + dy;
    applyView();
    return;
  }
  const i = indexFrom(event);
  if (i == null) {
    tip.hidden = true;
    return;
  }
  showTip(i, event.clientX, event.clientY);
});

svg.addEventListener("pointerup", () => {
  drag = null;
});

svg.addEventListener("pointerleave", () => {
  if (!drag) tip.hidden = true;
});

svg.addEventListener("click", (event) => {
  if (moved) return;
  const i = indexFrom(event);
  if (i == null) return;
  onPick(i);
});

svg.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.min(8, Math.max(1, view.k * factor));
    const scale = next / view.k;
    view.x = mx - (mx - view.x) * scale;
    view.y = my - (my - view.y) * scale;
    view.k = next;
    applyView();
  },
  { passive: false },
);

new ResizeObserver(() => {
  view.x = 0;
  view.y = 0;
  view.k = 1;
  fit();
}).observe(stage);

fit();
