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

/* THE FIXTURE IS OURS, and lives here rather than in the shipped set.

   Nearly every check below mutates one exact character of a picture --
   "(1,0) runs east; wall its east edge and it is stranded" -- so it was
   pinned to a particular board's exact layout while looking like it was
   pinned to nothing. When that board was removed, half of these went
   from checking the validator to throwing on undefined, and the two that
   did not went quietly vacuous instead: the round-trip check next door
   had been passing for a year only because the board it borrowed and a
   bare re-parse both defaulted to the same box.

   So the validator's self-test owns its own board. It is authored, from
   no box, and carries one of everything so that every refusal below has
   something real to break. Nothing in the shipped set can move it. */
const FIXTURE = {
  name: "Proving Ground", w: 12, h: 12, edition: "classic", set: "authored", origin: "authored",
  notes: "Authored for PumaRally. Every element type appears at least once.",
  pic: [
    "+  +  +  +--+  +  +  +  +  +  +  +  +",
    " .. b> b> b> b> bv .. .. .. o. .. .. ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " .. b^ .. .. .. bv .. l. .. o. .. w. ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " .. b^ .. r. .. bv .. .. .. .. .. .. ",
    "+  +  +  +  +  +  +  +  +--+  +  +  +",
    " .. b^ b< b< b< b< .. .. .. .. .. .. ",
    "+  +  +  +--+  +  +  +  +  +  +  +  +",
    " .. .. .. .. .. ..|.. .. .. ..|.. W. ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " B> B> B> B> B> B> B> B> B> B> B> Bv ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " .. .. .. .. .. .. bv .. .. .. .. Bv ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " .. .. o. .. .. .. bv b< .. .. .. Bv ",
    "+  +  +  +  +  +  +  +  +  +  +--+  +",
    "|.. .. o. o. ..|.. .. .. .. .. ..|Bv ",
    "+  +  +  +  +  +  +  +  +  +  +--+  +",
    " .. .. .. o.|.. .. .. .. .. .. .. Bv ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " w. .. .. .. .. .. .. .. .. .. .. Bv ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +",
    " .. .. .. .. .. .. .. .. .. .. .. .. ",
    "+  +  +  +  +  +  +  +  +  +  +  +  +"
  ],
  lasers: [
    { c: 3, r: 0, d: "S", n: 1 },
    { c: 9, r: 4, d: "W", n: 2 },
    { c: 0, r: 8, d: "E", n: 3 }
  ]
  ,
  pushers: [
    { c: 8, r: 3, d: "S", regs: [2, 4] },
    { c: 4, r: 9, d: "E", regs: [1, 3, 5] }
  ]
};

const clone = o => JSON.parse(JSON.stringify(o));

/* A square that really is a pit on the course being mutated. Asked of
   the data rather than remembered: a remembered square stops being a
   pit the moment the course lays out a different board. */
function pitOn(courseSpec) {
  const g = B.buildCourse(courseSpec);
  for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) {
    if (!B.isVoid(g, c, r) && B.isPit(B.codeAt(g, c, r))) return [c, r];
  }
  throw new Error("no pit on this course; the flag-in-a-pit check proves nothing");
}
let pass = 0;
const failures = [];

/* Board-level: mutate a copy of the spec, expect parse+validate to throw. */
function board(label, mutate, want) {
  const spec = clone(FIXTURE);
  /* The sparse layers are optional in a spec -- a board with no rams
     simply omits `pushers` -- and half the checks below mutate one. So
     the fixture supplies all four rather than depending on whichever
     board it is built from happening to carry them, which is how this
     came to be pinned to a board that has since been removed. */
  for (const k of ["lasers", "pushers", "burners", "timers"]) spec[k] = spec[k] || [];
  mutate(spec);
  let msg = null;
  try {
    B.validateGrid("test", B.parsePic("test", spec), () => {});
  } catch (e) { msg = e.message; }
  record(label, msg, want);
}

/* Course-level: swap in mutated tables, restore whatever happens. */
function course(label, mutate, want) {
  const keepC = clone(B.COURSES.exchangeRun);
  const keepB = clone(B.BOARD_SPECS.exchange);
  let msg = null;
  try {
    mutate(B.COURSES.exchangeRun, B.BOARD_SPECS.exchange);
    B.validateCourse("exchangeRun", () => {});
  } catch (e) { msg = e.message; }
  finally {
    Object.assign(B.COURSES.exchangeRun, keepC);
    Object.assign(B.BOARD_SPECS.exchange, keepB);
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
board("horizontal wall",  s => { s.pic[0] = s.pic[0].slice(0, 1) + "-x" + s.pic[0].slice(3); }, "horizontal wall must be");
board("vertical wall",    s => { s.pic[1] = "x" + s.pic[1].slice(1); },  "vertical wall must be");

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
// Pushers moved out of the picture and into a sparse list, so every way
// that list can be wrong needs its own refusal -- a picture character
// could only ever be malformed, a list entry can be absent, doubled or
// nonsense, and none of those show up when you look at the board.
board("pusher off the board", s => { s.pushers.push({ c: 99, r: 0, d: "E", regs: [1] }); }, "is off the board");
board("pusher bad direction", s => { s.pushers[0].d = "up"; },           "which is not a direction");
// An EMPTY list is the always-on ram and is legal; spelling out all five
// says the same thing the long way and is what has to be refused, so that
// there is exactly one way to write it.
board("pusher listing all five registers",
      s => { s.pushers[0].regs = [1, 2, 3, 4, 5]; },                     "leave the list empty");
board("pusher register out of range", s => { s.pushers[0].regs = [6]; }, "registers run 1-5");
board("two pushers on one square",
      s => { s.pushers.push({ c: s.pushers[0].c, r: s.pushers[0].r, d: "E", regs: [1] }); },
      "two pushers at");
board("laser damage",     s => { s.lasers[0].n = 4; },                   "the box prints 1, 2 and 3");
board("laser unmounted",  s => { s.pic[0] = s.pic[0].slice(0, 10) + "  " + s.pic[0].slice(12); }, "no wall behind it to mount on");
board("duplicate bay",    s => { s.pic[1] = s.pic[1].slice(0, 1) + "s1" + s.pic[1].slice(3);
                                 s.pic[3] = s.pic[3].slice(0, 1) + "s1" + s.pic[3].slice(3); }, "two docking bays numbered 1");

// A burner is wall-mounted like a pusher, and the sparse list that holds one
// can be wrong in all the same ways -- plus two of its own, because a jet has
// a REACH and the far end of it can land on nothing.
{
  const withJet = (mutate, want) => {
    const spec = clone(B.BOARD_SPECS.boardH);
    mutate(spec);
    let msg = null;
    try { B.validateGrid("test", B.parsePic("test", spec), () => {}); }
    catch (e) { msg = e.message; }
    record("burner: " + want, msg, want);
  };
  withJet(s => { s.burners.push({ c: 99, r: 0, d: "E", regs: [1] }); }, "is off the board");
  withJet(s => { s.burners[0].d = "sideways"; },      "which is not a direction");
  withJet(s => { s.burners[0].regs = [1, 2, 3, 4, 5]; }, "leave the list empty");
  withJet(s => { s.burners[0].regs = [9]; },          "registers run 1-5");
  withJet(s => { s.burners[0].len = 4; },             "reach 1 or 2");
  withJet(s => { s.burners.push({ c: s.burners[0].c, r: s.burners[0].r, d: "E", regs: [1] }); },
          "two burners cover");
  // (5,0) throws west off its east mount; take the mount away
  withJet(s => { s.pic[1] = s.pic[1].slice(0, 18) + " " + s.pic[1].slice(19); },
          "no wall behind it to mount on");
  // make it reach two, into the wall on its own far side
  withJet(s => { s.burners[0].len = 2; s.pic[1] = s.pic[1].slice(0, 15) + "|" + s.pic[1].slice(16); },
          "a wall stops it at one");
}

// ---- editions ------------------------------------------------------------
board("unknown edition",  s => { s.edition = "gritty reboot"; },        "which is not a thing");
board("repair site on a modern board",
      s => { s.edition = "modern"; s.set = "modernBase"; },
      "which the Modern edition does not print");

// A modern board and a classic one cannot share a course.
{
  const keepB = clone(B.BOARD_SPECS.dockingBay);
  let msg = null;
  try {
    B.BOARD_SPECS.dockingBay.edition = "modern";
    B.BOARD_SPECS.dockingBay.set = "modernBase";
    // strip the elements the modern edition does not print, so the
    // course check is what fires rather than the element check
    B.BOARD_SPECS.dockingBay.pic = B.BOARD_SPECS.dockingBay.pic.map(r => r.replace(/[wW]\./g, ".."));
    B.validateCourse("exchangeRun", () => {});
  } catch (e) { msg = e.message; }
  finally { Object.assign(B.BOARD_SPECS.dockingBay, keepB); }
  record("mixed-edition course", msg, "a course is one game or the other");
}

board("unknown set",      s => { s.set = "kickstarter"; },             "not a box that exists");
board("set from the wrong edition",
      s => { s.set = "wetAndWild"; },
      "but declares itself Classic");

// ---- courses -------------------------------------------------------------
course("unknown board",   c => { c.boards[0].id = "nope"; },             "which is not defined");
course("no flags",        c => { c.flags = []; },                        "can never be won");
course("duplicate flags", c => { c.flags = [[9, 2], [9, 2]]; },          "two flags on");
course("flag off course", c => { c.flags = [[50, 50]]; },                "is off the course");
/* (1,9) is a pit on the board this course lays out. Found from the
   data rather than remembered, because the last remembered square
   stopped being a pit when the course changed under it. */
course("flag in a pit",   c => { c.flags = [pitOn(c)]; },                "sits in a pit");
course("too few bays",    c => { c.maxPlayers = 9; },                    "but seats 9");

// ---- warnings are warnings, not errors -----------------------------------
{
  const spec = clone(B.BOARD_SPECS.exchange);
  /* Downgrade the square an express belt RUNS INTO, so the one behind
     it is left feeding a normal belt. Found from the data: the offsets
     this used to carry were a particular board's, and when the board
     changed the mutation made two belts meet head-on instead, which
     the validator refuses outright -- so the check reported the
     warning machinery broken when nothing was.  */
  const g0 = B.parsePic("x", spec);
  let at = null;
  for (let r = 0; r < g0.h && !at; r++) for (let c = 0; c < g0.w && !at; c++) {
    const code = B.codeAt(g0, c, r);
    if (B.beltSpeed(code) !== 2) continue;
    const nx = B.step(c, r, B.dirOf(code));
    if (!B.inGrid(g0, nx.c, nx.r)) continue;
    const nc = B.codeAt(g0, nx.c, nx.r);
    if (B.beltSpeed(nc) === 2 && B.dirOf(nc) === B.dirOf(code)) at = { c: nx.c, r: nx.r, d: nc.charAt(1) };
  }
  if (!at) throw new Error("no express run to downgrade; this check proves nothing");
  const row = 2 * at.r + 1, col = 3 * at.c + 1;
  spec.pic[row] = spec.pic[row].slice(0, col) + "b" + at.d + spec.pic[row].slice(col + 2);
  const warns = [];
  try {
    B.validateGrid("test", B.parsePic("test", spec), (id, m) => warns.push(m));
    if (warns.some(w => w.includes("express conveyor feeds a normal conveyor"))) pass++;
    else failures.push("express-feeds-normal: expected a warning, got none");
  } catch (e) { failures.push(`express-feeds-normal: threw instead of warning -- ${e.message}`); }
}

// ---- rotation round-trips ------------------------------------------------
{
  const g = B.parsePic("exchange", B.BOARD_SPECS.exchange);
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
