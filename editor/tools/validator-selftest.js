/* Proving every check can fail.
 *
 * A CHECK NOBODY HAS WATCHED FAIL IS INDISTINGUISHABLE FROM ONE THAT CANNOT.
 * Every vacuous pass this project has found was found by watching a check go
 * red, never by reading it. So each code in the table gets a mutation that
 * provokes it, and the mutation is asserted to provoke THAT code -- not merely
 * "something", which is what message matching degrades into as soon as two
 * checks share a phrase.
 *
 * ASSERTION ZERO runs first: the pristine fixtures produce no diagnostics at
 * all. Without it a validator that rejected everything would pass every
 * negative case in this file.
 *
 * THE COVERAGE ASSERTION runs last: the set of codes provoked here must EQUAL
 * the code table. Adding a check without a negative test then fails CI, rather
 * than quietly adding coverage nobody has seen work.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CODES } from "../validate/diagnostic.js";
import { checkBoardDocument } from "../validate/index.js";
import { validateLibrary } from "../validate/library.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { blankBoard } from "../lib/board.js";
import { sink } from "../validate/diagnostic.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "tests", "fixtures");
const raw = id => readFileSync(join(FIX, id + ".json"), "utf8");

const CLASSIC = "provingGroundClassic";
const MODERN = "provingGroundModern";

let passed = 0, failed = 0;
const fail = m => { failed++; console.error("FAIL " + m); };
const pass = () => { passed++; };

/* --- assertion zero -------------------------------------------------------- */
for (const id of [CLASSIC, MODERN]) {
  const { diagnostics } = checkBoardDocument(JSON.parse(raw(id)), id);
  if (diagnostics.length) {
    fail("assertion zero: the pristine fixture " + id + " is not clean:\n    " +
      diagnostics.map(x => x.code + " " + x.message).join("\n    "));
  } else pass();
}

/* --- helpers for the mutations --------------------------------------------- */
const wallDev = (doc, kind) => doc.wall.devices.find(x => x.kind === kind);
const setCh = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
/** Token index c of a ground row starts at 4c. */
const setTok = (doc, c, r, tok) => {
  const row = doc.ground.rows[r];
  doc.ground.rows[r] = row.slice(0, c * 4) + tok + row.slice(c * 4 + 3);
};
const setEdgeGlyph = (doc, which, c, r, ch) => {
  const key = which === "h" ? "hRows" : "vRows";
  doc.wall[key][r] = setCh(doc.wall[key][r], c, ch);
};

/* --- the table ------------------------------------------------------------- */
const CASES = [
  /* document shape */
  ["doc.notObject", CLASSIC, () => ["not", "an", "object"]],
  ["doc.format", CLASSIC, d => { d.format = "PRSomethingElse"; }],
  ["doc.version", CLASSIC, d => { d.version = 99; }],
  ["doc.unknownKey", CLASSIC, d => { d.flags = [[1, 1]]; }],
  ["doc.id", CLASSIC, d => { d.id = "somethingElse"; }],
  ["doc.dimensions", CLASSIC, d => { d.w = 0; }],
  ["doc.meta", CLASSIC, d => { d.name = 42; }],
  ["doc.allowVoid", CLASSIC, d => { d.allowVoid = true; }],

  /* layer shape */
  ["shape.groundRows", CLASSIC, d => { d.ground.rows.pop(); }],
  ["shape.groundWidth", CLASSIC, d => { d.ground.rows[0] += "x"; }],
  ["shape.groundSeparator", CLASSIC, d => { d.ground.rows[0] = setCh(d.ground.rows[0], 3, "x"); }],
  ["shape.levelRows", MODERN, d => { d.ground.levels.pop(); }],
  ["shape.levelChar", MODERN, d => { d.ground.levels[0] = setCh(d.ground.levels[0], 0, "x"); }],
  ["shape.hRows", CLASSIC, d => { d.wall.hRows.pop(); }],
  ["shape.vRows", CLASSIC, d => { d.wall.vRows.pop(); }],
  ["shape.edgeGlyph", CLASSIC, d => { setEdgeGlyph(d, "h", 0, 0, "Z"); }],

  /* ground legend */
  ["ground.unknownElement", CLASSIC, d => { setTok(d, 0, 0, "Q.."); }],
  ["ground.badArgument", CLASSIC, d => { setTok(d, 1, 1, "b.."); }],
  ["ground.wrongEdition", CLASSIC, d => { setTok(d, 0, 0, "E.."); }],
  ["ground.badArms", CLASSIC, d => { setTok(d, 1, 1, "b>q"); }],
  ["ground.armsOnNonBelt", CLASSIC, d => { setTok(d, 0, 0, "..l"); }],
  ["ground.pairCount", CLASSIC, d => { setTok(d, 9, 3, "..."); }],
  ["ground.voidNotAllowed", CLASSIC, d => { setTok(d, 0, 0, "   "); }],

  /* ground geometry */
  ["belt.intoWall", CLASSIC, d => { setEdgeGlyph(d, "v", 2, 1, "#"); }],
  ["belt.headOn", CLASSIC, d => { setTok(d, 9, 1, "b<."); setTok(d, 8, 1, "b>."); }],
  ["belt.expressFeedsNormal", CLASSIC, d => { setTok(d, 9, 1, "b>."); }],
  ["belt.acrossLedge", MODERN, d => { setTok(d, 5, 8, "b^."); }],

  /* wall lattice */
  ["wall.doorGlyphNoDevice", CLASSIC, d => {
    d.wall.devices = d.wall.devices.filter(x => x.kind !== "door");
  }],
  ["wall.doorDeviceNoGlyph", CLASSIC, d => { setEdgeGlyph(d, "v", 6, 6, " "); }],
  ["wall.duplicateDevice", CLASSIC, d => { d.wall.devices.push({ ...wallDev(d, "laser") }); }],

  /* wall devices */
  ["device.unknownKind", CLASSIC, d => { wallDev(d, "laser").kind = "trebuchet"; }],
  ["device.wrongLayer", CLASSIC, d => { wallDev(d, "laser").kind = "press"; }],
  ["device.badEdge", CLASSIC, d => { wallDev(d, "laser").edge = "h:99,0"; }],
  ["device.badFace", CLASSIC, d => { wallDev(d, "laser").face = "E"; }],
  ["device.faceNotAllowed", CLASSIC, d => { wallDev(d, "door").face = "N"; }],
  ["device.offBoard", CLASSIC, d => { wallDev(d, "laser").face = "N"; }],
  ["device.noMount", CLASSIC, d => { setEdgeGlyph(d, "h", 5, 0, " "); }],
  ["device.duplicatePusher", CLASSIC, d => {
    setEdgeGlyph(d, "h", 2, 5, "#");
    d.wall.devices.push({ kind: "pusher", edge: "h:2,5", face: "S", regs: [2, 4] });
  }],
  ["device.badField", CLASSIC, d => { wallDev(d, "laser").damage = 9; }],
  ["device.wrongEdition", MODERN, d => {
    setEdgeGlyph(d, "h", 7, 8, "#");
    d.wall.devices.push({ kind: "jet", edge: "h:7,8", face: "S", regs: [2, 4] });
  }],
  ["device.unknownKey", CLASSIC, d => { wallDev(d, "laser").colour = "red"; }],

  /* lasers and jets */
  ["laser.ownSquareOnly", CLASSIC, d => { setEdgeGlyph(d, "h", 5, 1, "#"); }],
  ["jet.blockedReach", CLASSIC, d => { setEdgeGlyph(d, "h", 8, 9, "#"); }],
  ["jet.overlap", CLASSIC, d => {
    setEdgeGlyph(d, "h", 8, 10, "#");
    d.wall.devices.push({ kind: "jet", edge: "h:8,10", face: "N", regs: [1] });
  }],
  ["jet.boxedIn", CLASSIC, d => { setEdgeGlyph(d, "v", 8, 8, "#"); }],

  /* registers */
  ["regs.notArray", CLASSIC, d => { wallDev(d, "pusher").regs = "odd"; }],
  ["regs.badNumber", CLASSIC, d => { wallDev(d, "pusher").regs = [9]; }],
  ["regs.unordered", CLASSIC, d => { wallDev(d, "pusher").regs = [3, 1]; }],
  ["regs.empty", CLASSIC, d => { wallDev(d, "pusher").regs = []; }],
  ["regs.all", CLASSIC, d => { wallDev(d, "pusher").regs = [1, 2, 3, 4, 5]; }],
  ["regs.missing", CLASSIC, d => { delete wallDev(d, "door").regs; }],
  ["regs.notAllowed", CLASSIC, d => { wallDev(d, "laser").regs = [1, 3]; }],

  /* ceiling */
  ["ceiling.offBoard", CLASSIC, d => { d.ceiling.devices[0].at = [99, 0]; }],
  ["ceiling.overPit", CLASSIC, d => { d.ceiling.devices[0].at = [1, 3]; }],
  ["ceiling.duplicate", CLASSIC, d => { d.ceiling.devices.push({ ...d.ceiling.devices[0] }); }],

  /* elevation */
  ["level.notContiguous", MODERN, d => { d.ground.levels[9] = setCh(d.ground.levels[9], 0, "3"); }],
  ["level.rampGradient", MODERN, d => { d.ground.levels[7] = setCh(d.ground.levels[7], 5, "2"); }],
  ["level.rampFoot", MODERN, d => { d.ground.levels[9] = setCh(d.ground.levels[9], 5, "1"); }],
  ["level.unreachable", MODERN, d => { setTok(d, 5, 8, "..."); }],

  /* provenance */
  ["meta.unknownEdition", CLASSIC, d => { d.edition = "ancient"; }],
  ["meta.unknownSet", CLASSIC, d => { d.set = "noSuchBox"; }],
  ["meta.setEdition", MODERN, d => { d.set = "base"; }]
];

const provoked = new Set();

for (const [code, fixture, mutate] of CASES) {
  const doc = JSON.parse(raw(fixture));
  const mutated = mutate(doc);
  const { diagnostics } = checkBoardDocument(mutated === undefined ? doc : mutated, fixture);
  if (diagnostics.some(x => x.code === code)) {
    provoked.add(code);
    pass();
  } else {
    fail(code + ": the mutation did not provoke it. Got: " +
      (diagnostics.map(x => x.code).join(", ") || "nothing at all"));
  }
}

/* --- library cases, which need more than one board ------------------------- */
{
  const a = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  const b = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  const d = sink();
  validateLibrary([{ id: "a", board: a }, { id: "a", board: b }], d);
  if (d.items.some(x => x.code === "library.duplicateId")) { provoked.add("library.duplicateId"); pass(); }
  else fail("library.duplicateId: two boards with one id were not refused");
}
{
  const a = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  const b = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  const d = sink();
  validateLibrary([{ id: "island", board: a }, { id: "boardE", board: b }], d);
  if (d.items.some(x => x.code === "library.duplicateBoard")) { provoked.add("library.duplicateBoard"); pass(); }
  else fail("library.duplicateBoard: a reprint under a second name was not refused");
}
{
  /* and the other way: two genuinely different boards must NOT be refused,
   * or the check above is satisfied by a validator that refuses every pair. */
  const a = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  const b = checkBoardDocument(JSON.parse(raw(MODERN)), MODERN).board;
  const d = sink();
  validateLibrary([{ id: "one", board: a }, { id: "two", board: b }], d);
  if (d.items.length) fail("library: two different boards were wrongly refused");
  else pass();
}

/* --- course cases ----------------------------------------------------------
 * Built from scratch rather than by mutating a shipped course and restoring it
 * in a `finally`. The old self-test swapped tables in and out of the live
 * COURSES object; nothing leaks between cases here because there is nothing to
 * put back. */
const LIB = new Map();
for (const id of [CLASSIC, MODERN]) {
  LIB.set(id, checkBoardDocument(JSON.parse(raw(id)), id).board);
}
/* A tiny docking bay of its own, so a dock case does not depend on any shipped
 * board being 12x4 or on the fixtures carrying bays in a particular place. */
{
  const bay = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  LIB.set("bay", bay);
}

/* A SIX BY SIX, and it is not decoration.
 *
 * Every other board in this file is twelve square, and on a twelve-square board
 * `c % 12` and a board-local coordinate give the same answer for "is this the
 * corner" -- so reverting the corner rule to a modulus passed this whole suite.
 * On a 6x6 laid at [12,0] the far corner is course (17,5), which `% 12` does
 * not think is a corner at all. That is the case that tells the two rules
 * apart, and it is the shape Master Builder actually ships. */
{
  const small = blankBoard({ id: "small", name: "Small", w: 6, h: 6, edition: "classic", set: "authored", origin: "authored" });
  LIB.set("small", small);
}

function baseCourse() {
  return {
    format: "PRCourse", version: 1, id: "selftest", name: "Self test", kind: "track",
    stamps: [
      { role: "board", board: CLASSIC, rot: 0, at: [0, 0] },
      { role: "dock", board: "bay", rot: 0, at: [0, 12] }
    ],
    /* (4,6) and (5,6) are plain floor on the classic fixture, off the dock,
     * not in a corner, and within twelve of each other. */
    flags: [[4, 6], [5, 6]],
    minPlayers: 2, maxPlayers: 2
  };
}

const COURSE_CASES = [
  ["course.unknownBoard", c => { c.stamps[0].board = "noSuchBoard"; }],
  ["course.badRotation", c => { c.stamps[0].rot = 7; }],
  ["course.badPlacement", c => { c.stamps[0].at = [-1, 0]; }],
  ["course.badRole", c => { c.stamps[0].role = "scenery"; }],
  ["course.overlap", c => { c.stamps[1].at = [0, 6]; }],
  ["course.disconnected", c => { c.stamps[1].at = [0, 20]; }],
  ["course.mixedEditions", c => { c.stamps.push({ role: "board", board: MODERN, rot: 0, at: [12, 0] }); }],
  ["course.twoDocks", c => { c.stamps.push({ role: "dock", board: "bay", rot: 0, at: [12, 0] }); }],
  ["course.noDock", c => { c.stamps = [c.stamps[0]]; }],
  ["course.bayNumbering", c => { c.stamps[1].board = "bayGap"; }],
  ["course.bayCount", c => { c.maxPlayers = 8; }],
  ["course.bayTrapped", c => { c.stamps[1].board = "bayWalled"; }],
  ["course.noFlags", c => { c.flags = []; }],
  ["course.flagOffCourse", c => { c.flags[0] = [99, 99]; }],
  ["course.flagNotFloor", c => { c.flags[0] = [1, 3]; }],           // the fixture's pit
  ["course.flagInDock", c => { c.flags[0] = [4, 13]; }],
  ["course.flagUnderDevice", c => { c.flags[0] = [2, 5]; }],        // the fixture's pusher
  ["course.flagInCorner", c => {
    c.stamps.push({ role: "board", board: "small", rot: 0, at: [12, 0] });
    c.flags = [[4, 6], [17, 5]];           // the 6x6's own (5,5); `% 12` says (5,5) is not a corner
  }],
  /* two boards meeting only at a corner: 4-adjacency says that is two areas,
   * and nothing can drive between them. An 8-adjacent flood fill would call it
   * one course and be wrong. */
  ["course.disconnected", c => {
    /* the 12x12 covers (0..11, 0..11) and the bay (0..11, 12..23), so a 6x6 at
     * [12,24] touches the bay at one corner and nothing else */
    c.stamps.push({ role: "board", board: "small", rot: 0, at: [12, 24] });
  }],
  /* A single 12x12 board cannot hold two squares more than twelve apart in one
   * direction, so this case has to lay a second board down to make the gap
   * reachable at all. */
  ["course.flagGap", c => {
    c.stamps.push({ role: "board", board: CLASSIC, rot: 0, at: [12, 0] });
    c.flags = [[4, 6], [20, 6]];
  }],
  ["course.flagDuplicate", c => { c.flags = [[4, 6], [4, 6]]; }]
];

/* two dock variants the cases above need */
{
  const gap = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  gap.cells[11 * gap.w + 1] = "s3.";          // bays 1 and 3, no 2
  LIB.set("bayGap", gap);

  const walled = checkBoardDocument(JSON.parse(raw(CLASSIC)), CLASSIC).board;
  /* wall bay 1 in on all four sides */
  walled.wallH[11 * walled.w + 0] = 1;
  walled.wallH[12 * walled.w + 0] = 1;
  walled.wallV[11 * (walled.w + 1) + 0] = 1;
  walled.wallV[11 * (walled.w + 1) + 1] = 1;
  LIB.set("bayWalled", walled);
}

for (const [code, mutate] of COURSE_CASES) {
  const c = baseCourse();
  mutate(c);
  const d = sink();
  const course = courseFromDocument(JSON.parse(JSON.stringify(c)), d, "selftest");
  if (course) validateCourse(course, LIB, d);
  if (d.items.some(x => x.code === code)) { provoked.add(code); pass(); }
  else fail(code + ": the mutation did not provoke it. Got: " +
    (d.items.map(x => x.code).join(", ") || "nothing at all"));
}

/* and the pristine course must be clean, or every case above passes for free */
{
  const d = sink();
  const course = courseFromDocument(JSON.parse(JSON.stringify(baseCourse())), d, "selftest");
  if (course) validateCourse(course, LIB, d);
  const errs = d.items.filter(x => x.severity === "error");
  if (errs.length) fail("assertion zero: the pristine self-test course is not clean:\n    " +
    errs.map(x => x.code + " " + x.message).join("\n    "));
  else pass();
}

/* --- the coverage assertion ------------------------------------------------ */
const uncovered = ALL_CODES.filter(c => !provoked.has(c));
if (uncovered.length) {
  fail("these codes have no negative test, so nothing has ever watched them fail:\n    " +
    uncovered.join("\n    "));
}
const unknown = [...provoked].filter(c => !ALL_CODES.includes(c));
if (unknown.length) fail("provoked codes that are not in the table: " + unknown.join(", "));

console.log((failed ? "FAILED " : "ok ") + passed + " passed, " + failed + " failed; " +
  provoked.size + "/" + ALL_CODES.length + " codes proven able to fail");
process.exit(failed ? 1 : 0);
