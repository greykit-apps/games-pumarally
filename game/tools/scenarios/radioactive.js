/* Radioactive (1998), reprinted for the 2016 game as Contamination: one-way
 * walls, radiation and radioactive waste.
 *
 * No publisher's rulebook for either box is in the archive. The rules are the
 * Ultimate RoboRally Collection's (Justin Alexander, a fan compilation of the
 * classic game and its expansions), manual1/roborally-ultimate-collection-
 * rulebook.pdf, whose own list of departures from the originals names none of
 * these elements. Where the 2016 reading is ours rather than a book's, the
 * test says so.
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, E, W } from "./harness.js";
import { stepRobot, firstRobotAlong } from "../../engine/rules.js";
import { EDGE_WALL } from "../../../editor/lib/edges.js";
import { toPicture, fromPicture } from "../../../editor/lib/picture.js";

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
  }]
];
