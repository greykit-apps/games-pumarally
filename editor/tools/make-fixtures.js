/* Builds the validator self-test's fixtures.
 *
 * THE SELF-TEST OWNS ITS FIXTURES, and this is why: the old repo's self-test
 * was pinned to a shipped board, that board was later deleted, and half its
 * cases went from checking the validator to throwing on `undefined` -- while
 * still reading as a passing suite. Nothing in the shipped set can move these.
 *
 * There are TWO because there has to be. An element belongs to one edition or
 * both, and a board declares one edition, so no single board can carry a repair
 * site and a battery. Between them these two carry every element in the legend,
 * every device kind, and all seven belt-arm shapes.
 *
 *     node editor/tools/make-fixtures.js            # write them
 *     node editor/tools/make-fixtures.js --check    # fail if they have drifted
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blankBoard, setCell, setLevel } from "../lib/board.js";
import { setWall, EDGE_WALL, EDGE_DOOR } from "../lib/edges.js";
import { boardJSON } from "../lib/canon.js";
import { N, E, S, W } from "../lib/dir.js";
import { ARM_CHARS } from "../lib/token.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "tests", "fixtures");

/** A row of belts running east, one per arm shape, so all seven are on a board. */
function armRow(b, r, ch, startC) {
  ARM_CHARS.forEach((arm, i) => setCell(b, startC + i, r, ch + ">" + arm));
}

function classic() {
  const b = blankBoard({
    id: "provingGroundClassic", name: "Proving Ground (Classic)", w: 12, h: 12,
    edition: "classic", set: "authored", origin: "authored",
    notes: "The validator self-test's fixture. Carries one of every classic element, " +
           "all seven belt-arm shapes, and one of every classic device."
  });

  armRow(b, 1, "b", 1);                       // (1..7, 1): . l r L R x X
  setCell(b, 8, 1, "B>.");                    // a normal belt feeding an express is fine
  setCell(b, 1, 3, "o..");
  setCell(b, 2, 3, "l..");
  setCell(b, 3, 3, "r..");
  setCell(b, 4, 3, "w..");
  setCell(b, 5, 3, "W..");
  setCell(b, 6, 3, "L..");
  setCell(b, 7, 3, "t1.");
  setCell(b, 9, 3, "t1.");                    // the other half of the pair
  setCell(b, 0, 11, "s1.");
  setCell(b, 1, 11, "s2.");

  setWall(b, 5, 0, N, EDGE_WALL);             // laser mount
  setWall(b, 2, 5, W, EDGE_WALL);             // pusher mount
  setWall(b, 8, 8, N, EDGE_WALL);             // jet mount
  setWall(b, 6, 6, W, EDGE_DOOR);             // the swing door's lattice glyph

  b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 5, r: 0 }, face: S, damage: 2 });
  b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 2, r: 5 }, face: E, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 8, r: 8 }, face: S, reach: 2, regs: [2, 4] });
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: 6, r: 6 }, regs: [1, 3, 5] });
  b.ceilingDevices.push({ kind: "press", c: 10, r: 10, regs: [2, 4] });
  return b;
}

function modern() {
  const b = blankBoard({
    id: "provingGroundModern", name: "Proving Ground (Modern)", w: 12, h: 12,
    edition: "modern", set: "authored", origin: "authored",
    notes: "The validator self-test's fixture. Carries one of every modern element, " +
           "two levels joined by a ramp, and both ceiling traps the 2016 game prints."
  });

  armRow(b, 1, "b", 1);
  setCell(b, 8, 1, "B>.");
  setCell(b, 1, 3, "o..");
  setCell(b, 2, 3, "l..");
  setCell(b, 3, 3, "r..");
  setCell(b, 4, 3, "E..");
  setCell(b, 5, 3, "~..");
  setCell(b, 6, 3, "D..");
  setCell(b, 7, 3, "z..");
  setCell(b, 8, 3, "A..");
  setCell(b, 9, 3, "%..");
  setCell(b, 10, 3, "@^.");
  setCell(b, 1, 5, "C>.");                    // a current: a belt that is also water
  setCell(b, 3, 5, "T1.");
  setCell(b, 5, 5, "T1.");
  setCell(b, 7, 5, "P1.");
  setCell(b, 9, 5, "P1.");
  setCell(b, 0, 11, "s1.");
  setCell(b, 1, 11, "s2.");

  /* Two levels, joined by the only thing that may join them. The ramp stands on
   * the LOWER level and points uphill, so its own square is level 0 and the
   * square it points at is level 1. */
  setCell(b, 5, 8, "R^.");
  for (const c of [4, 5, 6]) setLevel(b, c, 7, 1);

  setWall(b, 1, 0, N, EDGE_WALL);
  setWall(b, 9, 2, W, EDGE_WALL);
  b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 1, r: 0 }, face: S, damage: 3 });
  b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 9, r: 2 }, face: E, regs: [2, 4] });
  b.ceilingDevices.push({ kind: "crusher", c: 3, r: 10, regs: [1, 5] });
  b.ceilingDevices.push({ kind: "flamer", c: 4, r: 10 });   // no regs: every register
  return b;
}

const FIXTURES = { provingGroundClassic: classic(), provingGroundModern: modern() };

/* Between them the fixtures must carry EVERY element and EVERY device kind.
 * Without this, adding an element to the legend and forgetting to put it on a
 * fixture leaves it with no negative tests and no positive one either. */
const covered = new Set();
for (const b of Object.values(FIXTURES)) {
  for (const tok of b.cells) covered.add(tok.charAt(0));
  for (const dev of [...b.wallDevices, ...b.ceilingDevices]) covered.add("dev:" + dev.kind);
}
const missing = [
  ...Object.keys(ELEMENTS).filter(ch => !covered.has(ch)).map(ch => "element " + JSON.stringify(ch)),
  ...Object.keys(DEVICE_KINDS).filter(k => !covered.has("dev:" + k)).map(k => "device " + k)
];
if (missing.length) {
  console.error("The fixtures do not carry:\n  " + missing.join("\n  "));
  process.exit(1);
}

const check = process.argv.includes("--check");
let drift = 0;
for (const [id, board] of Object.entries(FIXTURES)) {
  const path = join(OUT, id + ".json");
  const text = boardJSON(board);
  if (check) {
    const have = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (have !== text) { console.error(path + " has drifted from make-fixtures.js"); drift++; }
  } else {
    writeFileSync(path, text);
    console.log("wrote " + path);
  }
}
if (drift) process.exit(1);
console.log("ok fixtures carry every element and every device kind");
