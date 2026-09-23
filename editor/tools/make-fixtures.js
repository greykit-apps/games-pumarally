/* Builds the validator self-test's fixture.
 *
 * THE SELF-TEST OWNS ITS FIXTURE, and this is why: the old repo's self-test was
 * pinned to a shipped board, that board was later deleted, and half its cases
 * went from checking the validator to throwing on `undefined` -- while still
 * reading as a passing suite. Nothing in the shipped set can move this.
 *
 * THERE IS ONE, and there used to be two. The split existed because a board
 * declared an edition and an element belonged to one, so no single board could
 * carry a repair site and a battery. A board declares no edition now -- it is
 * just a board, and the engine decides at play time which squares matter under
 * the ruleset in force -- so one fixture holds the whole catalogue, which is
 * what a fixture is for.
 *
 *     node editor/tools/make-fixtures.js            # write it
 *     node editor/tools/make-fixtures.js --check    # fail if it has drifted
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blankBoard, setCell, setLevel, setSites } from "../lib/board.js";
import { setWall, setRamp, EDGE_WALL, EDGE_DOOR } from "../lib/edges.js";
import { boardJSON } from "../lib/canon.js";
import { N, E, S, W } from "../lib/dir.js";
import { ARM_CHARS } from "../lib/token.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { SITES, SITE_ORDER } from "../rulesets/sites.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "tests", "fixtures");
const ID = "provingGround";

function build() {
  const b = blankBoard({
    id: ID, name: "Proving Ground", w: 12, h: 12,
    set: "authored", origin: "authored",
    notes: "The validator self-test's fixture. One of every element in the legend, " +
           "all seven belt-arm shapes, one of every device kind, and three levels joined by two ramps."
  });

  /* row 1: a belt per arm shape, then an express for the two-speed case */
  ARM_CHARS.forEach((arm, i) => setCell(b, 1 + i, 1, "b>" + arm));
  setCell(b, 8, 1, "B>.");

  /* row 3 and row 5: one of everything else, from both printings at once --
   * which is the point of the fixture and no longer a contradiction.
   *
   * ONE oil and ONE portal, where there used to be an edition-classic and an
   * edition-modern of each. The `t1` pair spans the two rows so that the
   * paired-colour check has a pair to break; the two teleporters are NOT a pair
   * and never were -- they are here precisely because a board may carry any
   * number of them, which is what `ground.pairCount` must not complain about. */
  setCell(b, 1, 3, "o..");   setCell(b, 2, 3, "l..");   setCell(b, 3, 3, "r..");
  setCell(b, 6, 3, "L..");   setCell(b, 7, 3, "t1.");    setCell(b, 9, 3, "~..");
  setCell(b, 10, 3, "D..");

  /* THE MARKINGS, including the combinations that are the reason the layer
   * exists: the same printed floor is a wrench in one game and a battery in the
   * other, and a flag location can sit on either. One of each alone, one of
   * each stacked, so a mutation has both cases to break. */
  setSites(b, 4, 3, ["repair"]);
  setSites(b, 5, 3, ["upgrade"]);
  setSites(b, 8, 3, ["battery"]);
  setSites(b, 4, 9, ["flagspot"]);
  setSites(b, 5, 9, ["repair", "battery", "flagspot"]);
  setSites(b, 6, 9, ["upgrade", "battery"]);
  setSites(b, 7, 9, ["battery", "flagspot"]);

  /* (2,5) is A CONVEYOR CARRYING A RANDOMIZER, which is the whole point of
   * moving the randomizer into the site layer: Pushy prints them on belt
   * squares, and while it was the ground element `z` the square could be one or
   * the other and not both. (4,5) is a standalone one on plain floor, so the
   * fixture carries the marking in each of the two ways a board prints it. */
  setCell(b, 1, 5, "C>.");   setCell(b, 2, 5, "b>.");   setCell(b, 3, 5, "A..");
  setSites(b, 2, 5, ["randomizer"]);
  setSites(b, 4, 5, ["randomizer"]);
  setCell(b, 5, 5, "@^.");   setCell(b, 6, 5, "T..");
  setCell(b, 8, 5, "T..");   setCell(b, 9, 5, "t1.");

  /* THREE levels, one of them BELOW the floor you walk in on, joined by the
   * only thing that may join them -- a ramp, which is an EDGE. The board's base is 0, so a fixture with
   * levels 0 and 1 alone exercises only half the format -- and the half it
   * left out is the half Water Park needs. Two ramps: one climbing out of the
   * channel to the base, one climbing from the base to the shelf. */
  setRamp(b, 5, 8, N, true);
  setLevel(b, 5, 7, 1);

  setRamp(b, 2, 8, E, true);
  setLevel(b, 1, 8, -1);
  setLevel(b, 2, 8, -1);

  setCell(b, 0, 11, "s1.");  setCell(b, 1, 11, "s2.");

  setWall(b, 5, 0, N, EDGE_WALL);   // laser mount
  setWall(b, 2, 9, W, EDGE_WALL);   // pusher mount
  setWall(b, 8, 8, N, EDGE_WALL);   // jet mount
  /* A door on EACH lattice orientation. One alone tests only half the picture
   * parser: a version that read a horizontal door as a plain wall passed the
   * entire suite when the only door in the fixture was vertical. */
  setWall(b, 6, 6, W, EDGE_DOOR);
  setWall(b, 3, 7, N, EDGE_DOOR);

  b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 5, r: 0 }, face: S, damage: 2 });
  b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 2, r: 9 }, face: E, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 8, r: 8 }, face: S, reach: 2, regs: [2, 4] });
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: 6, r: 6 }, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "door", edge: { kind: "h", c: 3, r: 7 }, regs: [2, 4] });
  /* A one-way wall between (10,7) and (11,7), red toward (10,7): it stops a
   * robot going east and lets one coming west through. It stands on a plain
   * `#`, which is what the lattice says a one-way wall is. */
  setWall(b, 10, 7, E, EDGE_WALL);
  b.wallDevices.push({ kind: "oneWay", edge: { kind: "v", c: 11, r: 7 }, face: W });
  /* Both ceiling kinds there are: the disc (a press in one game and a crusher
   * in the other, one device either way) and the flamer, which is a different
   * printed thing and stays its own kind. Two discs on ONE square is what the
   * validator refuses, so they sit on two. */
  b.ceilingDevices.push({ kind: "crusher", c: 10, r: 10, regs: [2, 4] });
  b.ceilingDevices.push({ kind: "crusher", c: 3, r: 10, regs: [1, 5] });
  b.ceilingDevices.push({ kind: "flamer", c: 4, r: 10 });   // no regs: every register
  return b;
}

const board = build();

/* The fixture must carry EVERY element and EVERY device kind. Without this,
 * adding an element to the legend and forgetting to put it on the fixture
 * leaves it with no negative tests and no positive one either. */
const covered = new Set();
for (const tok of board.cells) covered.add(tok.charAt(0));
for (const dev of [...board.wallDevices, ...board.ceilingDevices]) covered.add("dev:" + dev.kind);
for (const has of board.sites.values()) for (const k of has) covered.add("site:" + k);
const missing = [
  ...Object.keys(ELEMENTS).filter(ch => !covered.has(ch)).map(ch => "element " + JSON.stringify(ch)),
  ...Object.keys(DEVICE_KINDS).filter(k => !covered.has("dev:" + k)).map(k => "device " + k),
  ...SITE_ORDER.filter(k => !covered.has("site:" + k)).map(k => "site " + k)
];
if (missing.length) {
  console.error("The fixture does not carry:\n  " + missing.join("\n  "));
  process.exit(1);
}

const check = process.argv.includes("--check");
const path = join(OUT, ID + ".json");
const text = boardJSON(board);
if (check) {
  const have = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (have !== text) { console.error(path + " has drifted from make-fixtures.js"); process.exit(1); }
} else {
  writeFileSync(path, text);
  /* the two edition-split fixtures are gone; clear them out rather than leaving
   * files nothing reads */
  for (const f of readdirSync(OUT)) {
    if (f.endsWith(".json") && f !== ID + ".json") { unlinkSync(join(OUT, f)); console.log("removed " + f); }
  }
  console.log("wrote " + path);
}
console.log("ok the fixture carries every element, every device kind and every site");
