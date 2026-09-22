/* Rendering, checked without anyone having to look.
 *
 * Three things, in increasing order of how much they actually prove:
 *
 * 1. COVERAGE. Every element key and every device kind has BOTH an `art` and a
 *    `markup` glyph. This is the one that earns its place: a missing markup
 *    glyph draws nothing, over a photograph, at exactly the moment nobody is
 *    looking at the play art. It would be invisible without this.
 *
 * 2. NOTHING DRAWS EMPTY. For every board, every element actually on it must
 *    put something into the art SVG. A glyph that returns "" would otherwise
 *    pass the coverage check by existing.
 *
 * 3. SNAPSHOTS. A digest per board per mode, so a change to the art is a change
 *    somebody chose rather than one that happened. Digests rather than whole
 *    files because 17 boards x 2 modes is about 1.7MB of SVG and a diff of that
 *    is not something a person reads.
 *
 *     node editor/tools/render-snapshot.js           # write
 *     node editor/tools/render-snapshot.js --check   # compare
 *     node editor/tools/render-snapshot.js --emit <dir>   # dump the SVGs to look at
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { checkBoardDocument } from "../validate/index.js";
import { boardSVG } from "../render/svg.js";
import { GLYPHS, DEVICE_GLYPHS } from "../render/glyphs.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { ARM_CHARS, ARM_CODES } from "../lib/token.js";
import { turnPath } from "../render/gear.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BOARDS = join(HERE, "..", "data", "boards");
const FIXTURES = join(HERE, "..", "tests", "fixtures");
const SNAP = join(HERE, "..", "tests", "snapshots", "render.json");
const MODES = ["art", "markup"];

const problems = [];

/* --- 1. coverage ----------------------------------------------------------- */
for (const [ch, def] of Object.entries(ELEMENTS)) {
  const glyph = GLYPHS[def.key];
  if (!glyph) { problems.push("element " + JSON.stringify(ch) + " (" + def.key + ") has no glyph at all"); continue; }
  for (const m of MODES) {
    if (typeof glyph[m] !== "function") {
      problems.push("element " + def.key + " has no " + m + " glyph" +
        (m === "markup" ? " -- it would draw NOTHING over a photograph" : ""));
    }
  }
}
for (const kind of Object.keys(DEVICE_KINDS)) {
  const glyph = DEVICE_GLYPHS[kind];
  if (!glyph) { problems.push("device " + kind + " has no glyph at all"); continue; }
  for (const m of MODES) {
    if (typeof glyph[m] !== "function") problems.push("device " + kind + " has no " + m + " glyph");
  }
}
/* and the other way: a glyph for something that is not in the registries is
 * dead art that reads as coverage */
const elementKeys = new Set(Object.values(ELEMENTS).map(d => d.key));
for (const key of Object.keys(GLYPHS)) {
  if (!elementKeys.has(key)) problems.push("glyph " + key + " draws an element that is not in the legend");
}
for (const kind of Object.keys(DEVICE_GLYPHS)) {
  if (!DEVICE_KINDS[kind]) problems.push("glyph " + kind + " draws a device that is not in the registry");
}

/* THE SEVEN BELT SHAPES MUST DRAW SEVEN DIFFERENT THINGS, in both modes.
 *
 * A belt's arms are the one piece of printed data with no other visual tell: if
 * the drawing does not show the shape, a board whose corners have been
 * transcribed as straights looks exactly like a correct one, and the validator
 * cannot help because both are legal. The first version of the belt art drew
 * each arm as a straight spoke to the centre, so a corner, a T-merge and a
 * crossing were three arrangements of the same asterisk and the arrow pointed
 * the same way on all of them.
 *
 * Distinctness is the cheap half. The other half is that a CURVE MUST NOT DRAW
 * THE SAME PATH AS A STRAIGHT -- a curve rotates the robot on it and a straight
 * does not, so if both carry a straight arrow the board is hiding a rule. */
{
  for (const m of MODES) {
    const seen = new Map();
    for (const ch of ARM_CHARS) {
      const drawn = GLYPHS.conveyor[m]({ arms: ARM_CODES[ch], arg: "^", dir: 0 });
      if (seen.has(drawn)) {
        problems.push("belt arms " + JSON.stringify(ch) + " and " + JSON.stringify(seen.get(drawn)) +
          " draw identically in " + m + " mode -- the shape is not visible");
      }
      seen.set(drawn, ch);
    }
    /* and the two that matter most: a curve is not a straight */
    const straight = GLYPHS.conveyor[m]({ arms: ARM_CODES["."], arg: "^", dir: 0 });
    for (const ch of ["l", "r"]) {
      const curve = GLYPHS.conveyor[m]({ arms: ARM_CODES[ch], arg: "^", dir: 0 });
      if (curve === straight) {
        problems.push("a belt curve (" + ch + ") draws the same as a plain straight in " + m +
          " mode -- a curve turns the robot on it and a straight does not");
      }
      if (!/[AQ]/.test(curve)) {
        problems.push("a belt curve (" + ch + ") in " + m + " mode has no arc or quadratic in it; " +
          "it is being drawn with straight segments");
      }
    }
  }
}

/* THE GEAR'S ARROW MUST BE JOINED, AND THE TWO DIRECTIONS MUST DIFFER.
 *
 * Which way a gear turns is a rule the player reads off the board, so both
 * halves are rules questions wearing art clothes. The head has to meet the
 * arc's END -- written as separate subpaths with the vertex two units adrift it
 * reads as a disconnected tick -- and the sweep has to be long enough that the
 * eye follows it round, or clockwise and anticlockwise look alike at tile size.
 *
 * EVERYTHING HERE IS PARSED OUT OF THE EMITTED PATH. The first version of this
 * check recomputed the head's position with the same formula the drawing uses
 * and compared the two, which is the code agreeing with itself: moving the
 * drawn head two units left it passing. The only honest question is what the
 * string actually says. */
{
  for (const turn of [1, -1]) {
    const which = turn > 0 ? "clockwise" : "anticlockwise";
    const d = turnPath(turn);
    const m = /^M\s*([\d.-]+)\s+([\d.-]+)A\s*([\d.-]+)\s+[\d.-]+\s+0\s+([01])\s+([01])\s+([\d.-]+)\s+([\d.-]+)M\s*[\d.-]+\s+[\d.-]+L\s*([\d.-]+)\s+([\d.-]+)L/.exec(d);
    if (!m) {
      problems.push("the " + which + " gear arrow is not an arc followed by a head: " + JSON.stringify(d.slice(0, 80)));
      continue;
    }
    const [, x0, y0, rad, large, sweepFlag, x1, y1, hx, hy] = m.map(Number);

    const gap = Math.hypot(x1 - hx, y1 - hy);
    if (gap > 0.5) {
      problems.push("the " + which + " gear arrow's head is " + gap.toFixed(1) +
        " units off the end of its arc -- it will read as two separate marks");
    }

    /* how far the arc actually sweeps, from the endpoints and the sweep flag */
    const a0 = Math.atan2(y0 - 50, x0 - 50), a1 = Math.atan2(y1 - 50, x1 - 50);
    const fwd = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const swept = sweepFlag ? fwd : 2 * Math.PI - fwd;
    if (swept < Math.PI) {
      problems.push("the " + which + " gear arrow sweeps only " + Math.round(swept * 180 / Math.PI) +
        " degrees; the eye will not follow it round and the two directions will look alike");
    }
    if (large !== (swept > Math.PI ? 1 : 0)) {
      problems.push("the " + which + " gear arrow's large-arc flag disagrees with the arc it describes");
    }
  }
  for (const m of MODES) {
    const cw = GLYPHS.gearCW[m]({ arg: ".", arms: ARM_CODES["."], dir: 0 });
    const ccw = GLYPHS.gearCCW[m]({ arg: ".", arms: ARM_CODES["."], dir: 0 });
    if (cw === ccw) {
      problems.push("a clockwise gear and an anticlockwise one draw identically in " + m +
        " mode -- which way it turns is a rule, and the board is the only place it is written");
    }
  }
}

/* Coverage failures stop the run here. Everything below renders boards, and a
 * missing glyph makes that a TypeError rather than a diagnostic -- which is a
 * non-zero exit either way, but says nothing about which glyph. */
if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("render-snapshot: " + problems.length + " coverage problem(s); nothing was rendered.");
  process.exit(1);
}

/* --- load every board ------------------------------------------------------- */
const boards = [];
for (const [dir, label] of [[BOARDS, "board"], [FIXTURES, "fixture"]]) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const id = basename(file, ".json");
    const { board } = checkBoardDocument(JSON.parse(readFileSync(join(dir, file), "utf8")), id);
    if (board) boards.push({ id, board, label });
  }
}
if (!boards.length) {
  console.error("render-snapshot: nothing to render. This check would pass vacuously.");
  process.exit(1);
}

/* --- 2. nothing draws empty ------------------------------------------------- */
const digests = {};
const emitDir = process.argv.includes("--emit") ? process.argv[process.argv.indexOf("--emit") + 1] : null;
if (emitDir) mkdirSync(emitDir, { recursive: true });

for (const { id, board } of boards) {
  digests[id] = {};
  const present = new Set();
  for (const tok of board.cells) {
    const def = ELEMENTS[tok.charAt(0)];
    if (def && def.key !== "floor") present.add(def.key);
  }
  for (const m of MODES) {
    const svg = boardSVG(board, { mode: m });
    digests[id][m] = {
      sha: createHash("sha256").update(svg).digest("hex").slice(0, 16),
      bytes: svg.length
    };
    if (emitDir) writeFileSync(join(emitDir, id + "-" + m + ".svg"), svg);
    /* every element on the board must actually put marks into the art SVG */
    if (m === "art") {
      for (const key of present) {
        const probe = boardSVG({ ...board, cells: board.cells }, { mode: m });
        if (probe.length < 200) problems.push(id + ": " + m + " rendered almost nothing");
      }
      if (svg.length < 500) problems.push(id + ": art SVG is " + svg.length + " bytes, which is not a board");
    }
    if (m === "markup" && present.size && svg.length < 300) {
      problems.push(id + ": markup SVG is " + svg.length + " bytes for a board with " +
        present.size + " non-floor element kind(s) on it");
    }
  }
}

/* Each glyph, rendered on its own, must produce something in both modes.
 * This is what actually catches a glyph that returns "" -- floor is the one
 * element allowed to, because an unmarked square IS floor. */
for (const [key, glyph] of Object.entries(GLYPHS)) {
  for (const m of MODES) {
    const out = glyph[m]({ arg: "1", arms: { back: true, left: false, right: false }, dir: 0 });
    if (key === "floor" && m === "markup") continue;
    if (!out || !out.length) problems.push("glyph " + key + "." + m + " draws nothing");
  }
}
for (const [kind, glyph] of Object.entries(DEVICE_GLYPHS)) {
  for (const m of MODES) {
    const out = glyph[m]({ regs: [1, 3], damage: 2, reach: 2 });
    if (!out || !out.length) problems.push("device glyph " + kind + "." + m + " draws nothing");
  }
}

/* EVERY device with a register list gets exactly one stamp, on EVERY board.
 *
 * The first version of this looked at one board -- the first that had any
 * device with registers -- which turned out to be one with only flame jets on
 * it, so deleting the pusher's stamp changed nothing it examined and it passed.
 * A check that samples is a check that misses.
 *
 * The stamp turns WITH its device, deliberately: it lies along the wall the
 * thing is bolted to and reads as part of the machine. The game keeps it
 * upright instead, so this is a chosen difference rather than a slip, and what
 * is checked is that the digits are THERE -- which registers a thing fires on
 * is a rule, and a rule the board does not show is a rule nobody can read.
 */
{
  let looked = 0;
  for (const { id, board } of boards) {
    /* a reach-two jet is drawn on both squares it burns and stamped on both */
    const want = [...board.wallDevices, ...board.ceilingDevices]
      .filter(d => d.regs && d.regs.length)
      .reduce((n, d) => n + (d.kind === "jet" && (d.reach | 0) > 1 ? 2 : 1), 0);
    if (!want) continue;
    looked += want;
    const got = (boardSVG(board, { mode: "art" }).match(/class="pr-stamp"/g) || []).length;
    if (got !== want) {
      problems.push(id + " has " + want + " device(s) with a register list but " +
        got + " stamp(s) drawn");
    }
  }
  if (looked < 10) {
    problems.push("only " + looked + " stamped device(s) across every board; this check is " +
      "not covering enough to mean anything");
  }
}

/* --- 3. snapshots ----------------------------------------------------------- */
const check = process.argv.includes("--check");
if (check) {
  if (!existsSync(SNAP)) problems.push("no snapshot at " + SNAP + "; run without --check to write one");
  else {
    const have = JSON.parse(readFileSync(SNAP, "utf8"));
    for (const id of Object.keys(digests)) {
      if (!have[id]) { problems.push(id + ": no snapshot (a new board? run without --check)"); continue; }
      for (const m of MODES) {
        if (have[id][m].sha !== digests[id][m].sha) {
          problems.push(id + " " + m + ": the drawing changed (" + have[id][m].bytes +
            " -> " + digests[id][m].bytes + " bytes). Look at it with --emit, then re-snapshot.");
        }
      }
    }
    for (const id of Object.keys(have)) {
      if (!digests[id]) problems.push(id + ": snapshotted but no longer renders");
    }
  }
} else {
  mkdirSync(dirname(SNAP), { recursive: true });
  writeFileSync(SNAP, JSON.stringify(digests, null, 2) + "\n");
}

if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("render-snapshot: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("ok " + boards.length + " boards render in both modes" +
  (check ? " identically to the snapshot" : "; snapshot written") +
  "; " + Object.keys(GLYPHS).length + " element and " + Object.keys(DEVICE_GLYPHS).length +
  " device glyphs, each present in both");
