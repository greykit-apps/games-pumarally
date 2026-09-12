#!/usr/bin/env node
/*
 * Negative tests for the board validator.
 *
 *   node tools/validator-selftest.js
 *
 * Every check in validateGrid/parsePic/validateCourse is deliberately broken
 * here and asserted to go red. This exists because a check nobody has watched
 * fail is indistinguishable from one that cannot fail -- and a board validator
 * that silently passes everything is strictly worse than none, since it buys
 * false confidence in exactly the data we cannot eyeball.
 *
 * Each case mutates a deep clone, so the real board data is never touched.
 */
const path = require("path");
const B = require(path.join(__dirname, "..", "pumarally-boards.js"));

const clone = o => JSON.parse(JSON.stringify(o));
let pass = 0;
const failures = [];

/* Board-level: mutate a copy of the spec, expect parse+validate to throw. */
function board(label, mutate, want) {
  const spec = clone(B.BOARD_SPECS.provingGround);
  mutate(spec);
  let msg = null;
  try {
    B.validateGrid("test", B.parsePic("test", spec), () => {});
  } catch (e) { msg = e.message; }
  record(label, msg, want);
}

/* Course-level: swap in mutated tables, restore whatever happens. */
function course(label, mutate, want) {
  const keepC = clone(B.COURSES.provingRun);
  const keepB = clone(B.BOARD_SPECS.provingGround);
  let msg = null;
  try {
    mutate(B.COURSES.provingRun, B.BOARD_SPECS.provingGround);
    B.validateCourse("provingRun", () => {});
  } catch (e) { msg = e.message; }
  finally {
    Object.assign(B.COURSES.provingRun, keepC);
    Object.assign(B.BOARD_SPECS.provingGround, keepB);
  }
  record(label, msg, want);
}

function record(label, msg, want) {
  if (msg === null) failures.push(`${label}: validator did NOT throw`);
  else if (!msg.includes(want)) failures.push(`${label}: threw "${msg}", expected to mention "${want}"`);
  else pass++;
}

// ---- picture geometry ----------------------------------------------------
board("row count",        s => s.pic.pop(),                              "picture rows, expected 25");
board("row width",        s => { s.pic[1] = s.pic[1].slice(0, -1); },    "chars, expected 37");
board("lattice corner",   s => { s.pic[0] = "x" + s.pic[0].slice(1); },  "lattice corner must be '+'");
board("horizontal wall",  s => { s.pic[0] = s.pic[0].slice(0, 1) + "-x" + s.pic[0].slice(3); }, "must be '--' or two spaces");
board("vertical wall",    s => { s.pic[1] = "x" + s.pic[1].slice(1); },  "must be '|' or a space");

// ---- legend --------------------------------------------------------------
board("unknown element",  s => { s.pic[1] = s.pic[1].slice(0, 1) + "z." + s.pic[1].slice(3); }, "not in the legend");
board("missing direction",s => { s.pic[1] = s.pic[1].slice(0, 4) + "b." + s.pic[1].slice(6); }, "needs a direction");
board("spurious argument",s => { s.pic[1] = s.pic[1].slice(0, 1) + ".>" + s.pic[1].slice(3); }, "takes no argument");
board("bad bay number",   s => { s.pic[1] = s.pic[1].slice(0, 1) + "s9" + s.pic[1].slice(3); }, "needs a position 1-8");

// ---- conveyors -----------------------------------------------------------
// (1,0) runs east; wall its east edge and it is stranded.
board("belt into wall",   s => { s.pic[1] = s.pic[1].slice(0, 6) + "|" + s.pic[1].slice(7); }, "into a wall");
board("belts head-on",    s => { s.pic[1] = s.pic[1].slice(0, 7) + "b<" + s.pic[1].slice(9); }, "head-on");

// ---- pushers and lasers --------------------------------------------------
board("pusher unmounted", s => { s.pic[6] = s.pic[6].slice(0, 25) + "  " + s.pic[6].slice(27); }, "no wall behind it to mount on");
board("laser damage",     s => { s.lasers[0].n = 4; },                   "the box prints 1, 2 and 3");
board("laser unmounted",  s => { s.pic[0] = s.pic[0].slice(0, 10) + "  " + s.pic[0].slice(12); }, "no wall behind it to mount on");
board("duplicate bay",    s => { s.pic[1] = s.pic[1].slice(0, 1) + "s1" + s.pic[1].slice(3);
                                 s.pic[3] = s.pic[3].slice(0, 1) + "s1" + s.pic[3].slice(3); }, "two docking bays numbered 1");

// ---- editions ------------------------------------------------------------
board("unknown edition",  s => { s.edition = "gritty reboot"; },        "which is not a thing");
board("repair site on a modern board",
      s => { s.edition = "modern"; },
      "which the Modern edition does not print");

// A modern board and a classic one cannot share a course.
{
  const keepB = clone(B.BOARD_SPECS.dockingBay);
  let msg = null;
  try {
    B.BOARD_SPECS.dockingBay.edition = "modern";
    B.validateCourse("provingRun", () => {});
  } catch (e) { msg = e.message; }
  finally { Object.assign(B.BOARD_SPECS.dockingBay, keepB); }
  record("mixed-edition course", msg, "a course is one game or the other");
}

// ---- courses -------------------------------------------------------------
course("unknown board",   c => { c.boards[0].id = "nope"; },             "which is not defined");
course("no flags",        c => { c.flags = []; },                        "can never be won");
course("duplicate flags", c => { c.flags = [[9, 2], [9, 2]]; },          "two flags on");
course("flag off course", c => { c.flags = [[50, 50]]; },                "is off the course");
course("flag in a pit",   c => { c.flags = [[9, 0]]; },                  "sits in a pit");
course("too few bays",    c => { c.maxPlayers = 9; },                    "but seats 9");

// ---- warnings are warnings, not errors -----------------------------------
{
  const spec = clone(B.BOARD_SPECS.provingGround);
  // Make the express run at (0,5) feed the normal belt path instead.
  spec.pic[11] = spec.pic[11].slice(0, 4) + "b>" + spec.pic[11].slice(6);
  const warns = [];
  try {
    B.validateGrid("test", B.parsePic("test", spec), (id, m) => warns.push(m));
    if (warns.some(w => w.includes("express conveyor feeds a normal conveyor"))) pass++;
    else failures.push("express-feeds-normal: expected a warning, got none");
  } catch (e) { failures.push(`express-feeds-normal: threw instead of warning -- ${e.message}`); }
}

// ---- rotation round-trips ------------------------------------------------
{
  const g = B.parsePic("provingGround", B.BOARD_SPECS.provingGround);
  const four = B.rotateGrid(g, 4);
  const same = g.w === four.w && g.h === four.h &&
    g.cell.every((v, i) => v === four.cell[i]) &&
    g.wallN.every((v, i) => v === four.wallN[i]) &&
    g.wallW.every((v, i) => v === four.wallW[i]) &&
    g.lasers.every((L, i) => L.c === four.lasers[i].c && L.r === four.lasers[i].r && L.d === four.lasers[i].d);
  if (same) pass++; else failures.push("rotation: four quarter-turns did not return the original board");
  // A single turn must actually change something, or the test above is vacuous.
  const one = B.rotateGrid(g, 1);
  if (one.cell.some((v, i) => v !== g.cell[i])) pass++;
  else failures.push("rotation: one quarter-turn changed nothing, so the round-trip test proves nothing");
}

console.log(`validator self-test: ${pass} check(s) confirmed to fail on bad data`);
if (failures.length) {
  failures.forEach(f => console.error(`  error:   ${f}`));
  console.error(`\n${failures.length} validator check(s) are not doing their job`);
  process.exit(1);
}
