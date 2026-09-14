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
