/* Radioactive (1998), reprinted for the 2016 game as Contamination: one-way
 * walls, radiation and radioactive waste.
 *
 * No publisher's rulebook for either box is in the archive. The rules are the
 * Ultimate RoboRally Collection's (Justin Alexander, a fan compilation of the
 * classic game and its expansions), whose own list of departures from the originals names none of
 * these elements. Where the 2016 reading is ours rather than a book's, the
 * test says so.
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, give, runRegister, E, W, N } from "./harness.js";
import { stepRobot, firstRobotAlong, wastePass, radiationPass, WASTE_CHOICES } from "../../engine/rules.js";
import { tick, CLASSIC_ORDER, MODERN_ORDER } from "../../engine/machine.js";
import { isDamage, START_ENERGY } from "../../engine/cards.js";
import { EDGE_WALL } from "../../../editor/lib/edges.js";
import { toPicture, fromPicture } from "../../../editor/lib/picture.js";
import { validateBoard } from "../../../editor/validate/board.js";
import { sink } from "../../../editor/validate/diagnostic.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

/* a one-way wall on the east edge of (c,r), red toward (c,r): it stops a
 * robot leaving (c,r) eastward and lets one in from (c+1,r) */
function oneWay(b, t, c, r) {
  t.wall(c, r, E);
  b.wallDevices.push({ kind: "oneWay", edge: { kind: "v", c: c + 1, r }, face: W });
}
const plain = edit => courseOn(board(8, 8, edit));

export const TESTS = [
  /* --- one-way walls ------------------------------------------------------ */
  ["a one-way wall stops a robot on its red side and lets one through from its green side", () => {
    for (const ruleset of ["classic", "modern"]) {
      const co = plain((b, t) => oneWay(b, t, 2, 3));
      const st = game(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 5, face: W }], { ruleset });
      assert(!stepRobot(st, co.C, st.players[0], E, "card"), ruleset + ": from the red side it is a wall");
      eq(st.players[0].c, 2, ruleset + ": the robot on the red side stays put");
      st.players[0].r = 6;                                   // clear the red square
      st.players[1].r = 3;                                   // and stand the other robot on the green side
      assert(stepRobot(st, co.C, st.players[1], W, "card"), ruleset + ": from the green side there is nothing there");
      eq([st.players[1].c, st.players[1].r], [2, 3], ruleset + ": through, onto the red square");
    }
  }],
  ["a robot pushed at a one-way wall's red side is stopped, and so is its pusher", () => {
    const co = plain((b, t) => oneWay(b, t, 2, 3));
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 2, r: 3, face: E }]);
    assert(!stepRobot(st, co.C, st.players[0], E, "card"), "the pushed robot has a wall in front of it");
    eq([st.players[0].c, st.players[1].c], [1, 2], "neither moves, exactly as against a wall");
  }],
  ["a robot on the green side pushes one through a one-way wall", () => {
    const co = plain((b, t) => oneWay(b, t, 2, 3));
    const st = game(co, [{ c: 4, r: 3, face: W }, { c: 3, r: 3, face: W }]);
    assert(stepRobot(st, co.C, st.players[0], W, "card"), "the push goes through from the green side");
    eq([st.players[0].c, st.players[1].c], [3, 2], "the pushed robot crosses onto the red square");
  }],
  ["a one-way wall stops a laser from its red side and lets one through from its green side", () => {
    const co = plain((b, t) => oneWay(b, t, 2, 3));
    const st = game(co, [{ c: 0, r: 3, face: E }, { c: 5, r: 3, face: W }]);
    eq(firstRobotAlong(st, co.C, 0, 3, E, true), null, "fired from the red side, the beam stops at the wall");
    assert(firstRobotAlong(st, co.C, 5, 3, W, true) === st.players[0], "fired from the green side, it goes straight through");
  }],
  ["a one-way wall round-trips through the picture and keeps its red side", () => {
    const b = board(4, 2, (bb, t) => oneWay(bb, t, 1, 0));
    const text = toPicture(b);
    assert(/oneWay v:2,0 W/.test(text), "the wall tail names it, its edge and its red side");
    const back = fromPicture(text, { id: b.id, name: b.name, set: b.set, origin: b.origin });
    eq(toPicture(back), text, "written back out unchanged");
    eq(back.wallV[0 * (back.w + 1) + 2], EDGE_WALL, "the plain wall under it came back too");
  }],

  /* --- radioactive waste -------------------------------------------------- */
  ["radioactive waste hurts a robot every register it ends there, and hands it an option card", () => {
    const co = plain((b, t) => t.sites(2, 3, ["waste"]));
    const st = game(co, [{ c: 2, r: 3, face: N }]);
    const p = st.players[0];
    give(st, p, 0, "left");
    runRegister(st, co.library);
    eq(p.damage, 1, "one damage in register 1");
    eq(p.options.length, 1, "and one option card");
    give(st, p, 1, "right");
    runRegister(st, co.library);
    eq([p.damage, p.options.length], [2, 2], "and again in register 2 -- every register, not once a turn");
  }],
  ["waste acts after the fire and before the flags, in both books", () => {
    for (const [book, order] of [["classic", CLASSIC_ORDER], ["modern", MODERN_ORDER]]) {
      const names = order.map(x => x[0]);
      const fire = book === "classic" ? "burners" : "flamers";
      eq(names.indexOf("waste"), names.indexOf(fire) + 1, book + ": straight after the fire");
      assert(names.indexOf("waste") < names.indexOf("touch"), book + ": before the checkpoints");
    }
  }],
  ["a powered-down robot takes the waste's damage but no option card", () => {
    const co = plain((b, t) => t.sites(2, 3, ["waste"]));
    const st = game(co, [{ c: 2, r: 3, face: N, poweredDown: true }]);
    const p = st.players[0];
    eq(wastePass(st, co.C), null, "nothing to ask");
    eq([p.damage, p.options.length], [1, 0], "it is still standing in it, but touches no checkpoint");
  }],
  ["a robot beside the waste is not touched by it", () => {
    const co = plain((b, t) => t.sites(2, 3, ["waste"]));
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    wastePass(st, co.C);
    eq([st.players[0].damage, st.players[0].options.length], [0, 0], "one square over, nothing");
  }],
  ["2016 waste deals a damage card, then asks: an Energy or the top upgrade free", () => {
    /* ours: the classic timing in the 2016 currency, after a review of Contamination */
    const co = plain((b, t) => t.sites(2, 3, ["waste"]));
    for (const pick of [0, 1]) {
      const st = game(co, [{ c: 2, r: 3, face: N }], { ruleset: "modern" });
      const p = st.players[0];
      const cards0 = p.installed.length + p.shelf.length, fitted0 = p.installed.length;
      const ask = wastePass(st, co.C);
      assert(ask && ask.kind === "cardChoice" && ask.card === "waste", "it asks");
      eq(ask.labels, WASTE_CHOICES, "the two things on offer");
      eq(p.pile.filter(i => isDamage(st, i)).length, 1, "and the damage card has already landed");
      st.answers[ask.key] = pick;
      eq(wastePass(st, co.C), null, "the answer is found on the re-run");
      eq(p.pile.filter(i => isDamage(st, i)).length, 1, "and the re-run does not hurt it twice");
      if (pick === 0) eq(p.energy, START_ENERGY + 1, "an Energy");
      else {
        eq(p.energy, START_ENERGY, "no Energy spent");
        eq(p.installed.length + p.shelf.length, cards0 + 1, "one more upgrade card");
        eq(p.installed.length, fitted0 + 1, "and it is on the mat, installed free, with slots to spare");
      }
      eq(wastePass(st, co.C), null, "and a third run, the same register, gives nothing more");
      eq(p.energy, START_ENERGY + (pick === 0 ? 1 : 0), "still just the one");
    }
  }],

  /* --- radiation ---------------------------------------------------------- */
  ["radiation hurts once, at the end of the turn, and not every register", () => {
    const co = plain((b, t) => t.sites(2, 3, ["radiation"]));
    const st = game(co, [{ c: 2, r: 3, face: N }]);
    const p = st.players[0];
    give(st, p, 0, "left");
    runRegister(st, co.library);
    eq(p.damage, 0, "nothing during a register");
    st.register = 4;
    give(st, p, 4, "right");
    runRegister(st, co.library);
    eq([st.phase, st.step], ["cleanup", "radiation"], "the turn's clean-up opens with radiation");
    tick(st, co.library);
    eq(p.damage, 1, "one damage, at the end of the turn");
    eq(st.step, "repair", "and only then the repairs");
  }],
  ["radiation reaches a powered-down robot, and 2016 pays it in a damage card", () => {
    const co = plain((b, t) => t.sites(2, 3, ["radiation"]));
    const down = game(co, [{ c: 2, r: 3, face: N, poweredDown: true }]);
    radiationPass(down, co.C);
    eq(down.players[0].damage, 1, "powered down, it is still standing in it");
    const st = game(co, [{ c: 2, r: 3, face: N }], { ruleset: "modern" });
    radiationPass(st, co.C);
    eq(st.players[0].pile.filter(i => isDamage(st, i)).length, 1, "a damage card, under the 2016 rules");
  }],
  ["a square is radiation or waste, never both", () => {
    const b = board(3, 3, (bb, t) => t.sites(1, 1, ["radiation", "waste"]));
    const bad = checkBoardCodes(b);
    assert(bad.includes("site.exclusive"), "the validator refuses the pair -- got " + bad.join(", "));
  }]
];

function checkBoardCodes(b) {
  const d = sink();
  validateBoard(b, d);
  return d.errors.map(e => e.code);
}
