/* Purpose-built boards for rule tests.
 *
 * A scenario lays a small authored board, stands robots on it, gives them
 * cards and runs one pass or one register through the real engine. The board
 * is a PRBoard built with the workshop's own library, so what a test says
 * about a square is what the validator and the renderer say about it.
 */
import { blankBoard, setCell } from "../../../editor/lib/board.js";
import { setWall, EDGE_WALL } from "../../../editor/lib/edges.js";
import { N, E, S, W } from "../../../editor/lib/dir.js";
import { newGame } from "../../engine/state.js";
import { buildCourse } from "../../engine/course.js";
import { CLASSIC_DECK } from "../../engine/cards.js";
import { step, tick } from "../../engine/machine.js";

export { N, E, S, W };

/** A w x h board with docking bays 1..8 along the bottom row, and `edit(b)` applied. */
export function board(w = 8, h = 8, edit) {
  const b = blankBoard({ id: "t", name: "T", w, h, set: "authored", origin: "authored" });
  for (let i = 0; i < Math.min(8, w); i++) setCell(b, i, h - 1, "s" + (i + 1) + ".");
  if (edit) edit(b, { setCell: (c, r, tok) => setCell(b, c, r, tok), wall: (c, r, d) => setWall(b, c, r, d, EDGE_WALL) });
  return b;
}

/** A one-board course document over `b`, with the given flags. */
export function courseOn(b, flags = [[0, 0]]) {
  const library = new Map([[b.id, b]]);
  const doc = { format: "PRCourse", version: 1, id: "tc", name: "Test course", kind: "quick",
    stamps: [{ role: "board", board: b.id, rot: 0, at: [0, 0] }], flags, minPlayers: 1, maxPlayers: 8 };
  return { doc, library, C: buildCourse(doc, library) };
}

/**
 * A game on the course, past the draft: every seat placed where `places`
 * says, facing as given, with the machine parked at the top of register 1.
 * places: [{ c, r, face, seat?, damage?, lives? }]
 */
export function game(course, places, opts = {}) {
  const st = newGame({ seed: opts.seed || 1, course: course.doc, seats: places.map(p => ({ seat: p.seat || "bot", skill: 1 })), house: opts.house });
  places.forEach((pl, i) => {
    const p = st.players[i];
    p.placed = true; p.liveryPicked = true;
    p.c = pl.c; p.r = pl.r; p.face = pl.face === undefined ? N : pl.face;
    p.archive = pl.archive || { c: pl.c, r: pl.r, face: p.face };
    if (pl.damage) p.damage = pl.damage;
    if (pl.lives) p.lives = pl.lives;
    if (pl.poweredDown) p.poweredDown = true;
    p.trail = [[p.c, p.r]];
  });
  st.phase = "exec"; st.step = "reveal"; st.register = 0;
  return st;
}

/** Take a card of `kind` (and optionally `pri`) out of the deck into a register. Conservation holds. */
export function give(st, p, reg, kind, pri) {
  const i = st.deck.findIndex(ci => CLASSIC_DECK[ci].kind === kind && (pri === undefined || CLASSIC_DECK[ci].pri === pri));
  if (i < 0) throw new Error("no " + kind + (pri ? " " + pri : "") + " left in the deck");
  const ci = st.deck.splice(i, 1)[0];
  p.registers[reg] = ci;
  return ci;
}

/** Run the machine through exactly one register (reveal, move, board, endReg). */
export function runRegister(st, library) {
  st.phase = "exec"; st.step = "reveal";
  st.events = [];
  const want = st.register;
  let guard = 0;
  while (!st.over && st.phase === "exec" && st.register === want && ++guard < 100) {
    tick(st, library);
    if (st.waiting) throw new Error("a register asked a question: " + st.waiting.kind);
  }
  return st.events;
}

/** Drive the machine until it asks something or the game ends; returns the last result. */
export function drive(st, library, answer) {
  return step(st, library, answer);
}
