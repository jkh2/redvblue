import { readFileSync } from "node:fs";
import { newGame, aiStep, columnsOf, deploy } from "../src/engine.js";

const board = JSON.parse(readFileSync(new URL("../data/board.json", import.meta.url), "utf8"));
const posts = deploy(board);
for (const side of ["R", "D"]) {
  console.log(
    side,
    posts[side].map((i) => `${board.names[i]}, ${board.st[i]}`).join(" · "),
  );
}

function play(first) {
  const g = newGame(board, first);
  let guard = 0;
  while (!g.winner && guard++ < 4000) aiStep(g);
  return g;
}

const wins = { R: 0, D: 0 };
let turns = 0;
let takenR = 0;
let takenD = 0;
const N = 40;
for (let i = 0; i < N; i++) {
  const g = play(i % 2 ? "R" : "D");
  wins[g.winner]++;
  turns += g.turn;
  takenR += g.taken.R;
  takenD += g.taken.D;
  if (i < 3) {
    console.log(
      "sample",
      g.winner,
      g.reason,
      "turn",
      g.turn,
      "taken",
      g.taken,
      "columns",
      columnsOf(g, "R"),
      columnsOf(g, "D"),
    );
  }
}
console.log("wins", wins, "avg turn", (turns / N).toFixed(1), "avg taken", (takenR / N).toFixed(1), (takenD / N).toFixed(1));
