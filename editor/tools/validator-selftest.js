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

const FIXTURE = "provingGround";

let passed = 0, failed = 0;
const fail = m => { failed++; console.error("FAIL " + m); };
const pass = () => { passed++; };

/* --- assertion zero -------------------------------------------------------- */
{
  const { diagnostics } = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE);
  if (diagnostics.length) {
    fail("assertion zero: the pristine fixture is not clean:\n    " +
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
  ["doc.notObject", FIXTURE, () => ["not", "an", "object"]],
  ["doc.format", FIXTURE, d => { d.format = "PRSomethingElse"; }],
  ["doc.version", FIXTURE, d => { d.version = 99; }],
  ["doc.unknownKey", FIXTURE, d => { d.flags = [[1, 1]]; }],
  ["doc.id", FIXTURE, d => { d.id = "somethingElse"; }],
  ["doc.dimensions", FIXTURE, d => { d.w = 0; }],
  ["doc.meta", FIXTURE, d => { d.name = 42; }],
  ["doc.allowVoid", FIXTURE, d => { d.allowVoid = true; }],

  /* layer shape */
  ["shape.groundRows", FIXTURE, d => { d.ground.rows.pop(); }],
  ["shape.groundWidth", FIXTURE, d => { d.ground.rows[0] += "x"; }],
  ["shape.groundSeparator", FIXTURE, d => { d.ground.rows[0] = setCh(d.ground.rows[0], 3, "x"); }],
  ["shape.levelRows", FIXTURE, d => { d.ground.levels.pop(); }],
  ["shape.levelChar", FIXTURE, d => { d.ground.levels[0] = setCh(d.ground.levels[0], 0, "x"); }],
  ["shape.hRows", FIXTURE, d => { d.wall.hRows.pop(); }],
  ["shape.vRows", FIXTURE, d => { d.wall.vRows.pop(); }],
  ["shape.edgeGlyph", FIXTURE, d => { setEdgeGlyph(d, "h", 0, 0, "Z"); }],

  /* ground legend */
  ["ground.unknownElement", FIXTURE, d => { setTok(d, 0, 0, "Q.."); }],
  ["ground.badArgument", FIXTURE, d => { setTok(d, 1, 1, "b.."); }],
  ["ground.badArms", FIXTURE, d => { setTok(d, 1, 1, "b>q"); }],
  ["ground.armsOnNonBelt", FIXTURE, d => { setTok(d, 0, 0, "..l"); }],
  ["ground.pairCount", FIXTURE, d => { setTok(d, 9, 5, "..."); }],
  ["ground.voidNotAllowed", FIXTURE, d => { setTok(d, 0, 0, "   "); }],

  /* ground geometry */
  ["belt.intoWall", FIXTURE, d => { setEdgeGlyph(d, "v", 2, 1, "#"); }],
  ["belt.acrossLedge", FIXTURE, d => { setTok(d, 5, 8, "b^."); }],

  /* wall lattice */
  ["wall.doorGlyphNoDevice", FIXTURE, d => {
    d.wall.devices = d.wall.devices.filter(x => x.kind !== "door");
  }],
  ["wall.doorDeviceNoGlyph", FIXTURE, d => { setEdgeGlyph(d, "v", 6, 6, " "); }],
  ["wall.duplicateDevice", FIXTURE, d => { d.wall.devices.push({ ...wallDev(d, "laser") }); }],

  /* wall devices */
  ["device.unknownKind", FIXTURE, d => { wallDev(d, "laser").kind = "trebuchet"; }],
  ["device.wrongLayer", FIXTURE, d => { wallDev(d, "laser").kind = "crusher"; }],
  ["device.badEdge", FIXTURE, d => { wallDev(d, "laser").edge = "h:99,0"; }],
  ["device.badFace", FIXTURE, d => { wallDev(d, "laser").face = "E"; }],
  ["device.faceNotAllowed", FIXTURE, d => { wallDev(d, "door").face = "N"; }],
  ["device.offBoard", FIXTURE, d => { wallDev(d, "laser").face = "N"; }],
  ["device.noMount", FIXTURE, d => { setEdgeGlyph(d, "h", 5, 0, " "); }],
  ["device.duplicatePusher", FIXTURE, d => {
    setEdgeGlyph(d, "h", 2, 9, "#");
    d.wall.devices.push({ kind: "pusher", edge: "h:2,9", face: "S", regs: [2, 4] });
  }],
  ["device.badField", FIXTURE, d => { wallDev(d, "laser").damage = 9; }],
  ["device.unknownKey", FIXTURE, d => { wallDev(d, "laser").colour = "red"; }],

  /* lasers and jets */
  ["laser.ownSquareOnly", FIXTURE, d => { setEdgeGlyph(d, "h", 5, 1, "#"); }],
  ["jet.blockedReach", FIXTURE, d => { setEdgeGlyph(d, "h", 8, 9, "#"); }],
  ["jet.overlap", FIXTURE, d => {
    setEdgeGlyph(d, "h", 8, 10, "#");
    d.wall.devices.push({ kind: "jet", edge: "h:8,10", face: "N", regs: [1] });
  }],
  ["jet.boxedIn", FIXTURE, d => { setEdgeGlyph(d, "v", 8, 8, "#"); }],

  /* registers */
  ["regs.notArray", FIXTURE, d => { wallDev(d, "pusher").regs = "odd"; }],
  ["regs.badNumber", FIXTURE, d => { wallDev(d, "pusher").regs = [9]; }],
  ["regs.unordered", FIXTURE, d => { wallDev(d, "pusher").regs = [3, 1]; }],
  ["regs.empty", FIXTURE, d => { wallDev(d, "pusher").regs = []; }],
  ["regs.all", FIXTURE, d => { wallDev(d, "pusher").regs = [1, 2, 3, 4, 5]; }],
  ["regs.missing", FIXTURE, d => { delete wallDev(d, "door").regs; }],
  ["regs.notAllowed", FIXTURE, d => { wallDev(d, "laser").regs = [1, 3]; }],

  /* sites -- markings a square carries in addition to what it is */
  ["site.badEntry", FIXTURE, d => { d.ground.sites[0] = { has: ["repair"] }; }],
  ["site.duplicate", FIXTURE, d => { d.ground.sites.push({ at: [4, 3], has: ["battery"] }); }],
  ["site.unknown", FIXTURE, d => { d.ground.sites[0].has = ["trapdoor"]; }],
  ["site.repeated", FIXTURE, d => { d.ground.sites[0].has = ["repair", "repair"]; }],
  ["site.exclusive", FIXTURE, d => { d.ground.sites[0].has = ["repair", "upgrade"]; }],
  ["site.empty", FIXTURE, d => { d.ground.sites[0].has = []; }],
  /* a marking sits on plain floor: the pit at (1,3) is not somewhere a robot rests */
  ["site.notFloor", FIXTURE, d => { d.ground.sites[0].at = [1, 3]; }],

  /* ceiling */
  ["ceiling.offBoard", FIXTURE, d => { d.ceiling.devices[0].at = [99, 0]; }],
  ["ceiling.overPit", FIXTURE, d => { d.ceiling.devices[0].at = [1, 3]; }],
  ["ceiling.duplicate", FIXTURE, d => { d.ceiling.devices.push({ ...d.ceiling.devices[0] }); }],

  /* elevation. The fixture's ramps: h:5,8 climbs from (5,8) at 0 up to (5,7)
   * at 1, and v:3,8 climbs from (2,8) in the channel at -1 up to (3,8) at 0. */
  ["shape.rampRows", FIXTURE, d => { d.ground.rampH.pop(); }],
  ["shape.rampGlyph", FIXTURE, d => { d.ground.rampH[8] = setCh(d.ground.rampH[8], 5, "Z"); }],
  ["ramp.walled", FIXTURE, d => { setEdgeGlyph(d, "h", 5, 8, "#"); }],
  ["ramp.flat", FIXTURE, d => { d.ground.levels[7] = setCh(d.ground.levels[7], 5, "0"); }],
  ["level.rampGradient", FIXTURE, d => { d.ground.levels[7] = setCh(d.ground.levels[7], 5, "2"); }],
  ["level.rampFoot", FIXTURE, d => { d.ground.levels[9] = setCh(d.ground.levels[9], 5, "1"); }],
  ["level.unreachable", FIXTURE, d => { d.ground.rampH[8] = setCh(d.ground.rampH[8], 5, " "); }],

  /* provenance */
  ["meta.unknownSet", FIXTURE, d => { d.set = "noSuchBox"; }],
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
  const a = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  const b = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  const d = sink();
  validateLibrary([{ id: "a", board: a }, { id: "a", board: b }], d);
  if (d.items.some(x => x.code === "library.duplicateId")) { provoked.add("library.duplicateId"); pass(); }
  else fail("library.duplicateId: two boards with one id were not refused");
}
{
  const a = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  const b = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  const d = sink();
  validateLibrary([{ id: "island", board: a }, { id: "boardE", board: b }], d);
  if (d.items.some(x => x.code === "library.duplicateBoard")) { provoked.add("library.duplicateBoard"); pass(); }
  else fail("library.duplicateBoard: a reprint under a second name was not refused");
}
{
  /* and the other way: two genuinely different boards must NOT be refused,
   * or the check above is satisfied by a validator that refuses every pair. */
  const a = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  const b = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  b.cells[0] = "o..";                       // one square different is enough
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
LIB.set(FIXTURE, checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board);
/* A tiny docking bay of its own, so a dock case does not depend on any shipped
 * board being 12x4 or on the fixtures carrying bays in a particular place. */
{
  const bay = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
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
      { role: "board", board: FIXTURE, rot: 0, at: [0, 0] },
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
  ["course.twoDocks", c => { c.stamps.push({ role: "dock", board: "bay", rot: 0, at: [12, 0] }); }],
  ["course.noDock", c => { c.stamps = [c.stamps[0]]; }],
  ["course.bayNumbering", c => { c.stamps[1].board = "bayGap"; }],
  ["course.bayCount", c => { c.maxPlayers = 8; }],
  ["course.bayTrapped", c => { c.stamps[1].board = "bayWalled"; }],
  ["course.noFlags", c => { c.flags = []; }],
  ["course.flagOffCourse", c => { c.flags[0] = [99, 99]; }],
  ["course.flagNotFloor", c => { c.flags[0] = [1, 3]; }],           // the fixture's pit
  ["course.flagInDock", c => { c.flags[0] = [0, 13]; }],   // floor, and inside the block
  ["course.flagUnderDevice", c => { c.flags[0] = [2, 9]; }],   // the pusher stands there        // the fixture's pusher
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
    c.stamps.push({ role: "board", board: FIXTURE, rot: 0, at: [12, 0] });
    c.flags = [[4, 6], [20, 6]];
  }],
  ["course.flagDuplicate", c => { c.flags = [[4, 6], [4, 6]]; }],
  /* the 2016 Reboot Tokens, placed like flags */
  ["course.rebootOffCourse", c => { c.reboots = [[99, 99, 0]]; }],
  ["course.rebootNotFloor", c => { c.reboots = [[1, 3, 0]]; }],             // the fixture's pit
  ["course.rebootInDock", c => { c.reboots = [[0, 13, 0]]; }],             // floor, and inside the block
  ["course.rebootTwice", c => { c.reboots = [[4, 6, 1], [5, 6, 1]]; }],
  ["course.rebootArrow", c => { c.reboots = [[0, 0, 0]]; }],                // its arrow points north, off the course
  ["course.rebootMissing", c => {
    c.stamps.push({ role: "board", board: FIXTURE, rot: 0, at: [12, 0] });
    c.reboots = [[4, 6, 1]];
  }],
  /* the rulebook's corner is walls, not cardboard: (4,6) walled on two sides */
  ["course.flagWallCorner", c => { c.stamps[0].board = "cornered"; }],
  ["course.unverifiedBoard", c => { c.stamps[0].board = "unchecked"; }],
  /* The fixture marks three flag locations, so the base course -- which lays
   * two boards -- has six and clears the guideline. One board alone has three,
   * which does not. (noDock fires too; the case only needs its own code to be
   * among what comes back.) */
  ["course.fewFlagSpots", c => { c.stamps = [c.stamps[0]]; }]
];

/* two dock variants the cases above need */
{
  const gap = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  gap.cells[11 * gap.w + 1] = "s3.";          // bays 1 and 3, no 2
  LIB.set("bayGap", gap);

  const walled = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  /* wall bay 1 in on all four sides */
  walled.wallH[11 * walled.w + 0] = 1;
  walled.wallH[12 * walled.w + 0] = 1;
  walled.wallV[11 * (walled.w + 1) + 0] = 1;
  walled.wallV[11 * (walled.w + 1) + 1] = 1;
  LIB.set("bayWalled", walled);

  const cornered = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  cornered.wallH[6 * cornered.w + 4] = 1;            // N of (4,6)
  cornered.wallV[6 * (cornered.w + 1) + 4] = 1;      // W of (4,6)
  LIB.set("cornered", cornered);

  const unchecked = checkBoardDocument(JSON.parse(raw(FIXTURE)), FIXTURE).board;
  unchecked.unverified = true;
  LIB.set("unchecked", unchecked);
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
