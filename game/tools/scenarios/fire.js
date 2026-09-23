/* The fire substitute: a flame jet and a flamer standing in for each other.
 *
 * Crash and Burn prints a flame jet, Thrills and Spills prints a flamer, and
 * neither rulebook says a word about the other's. Both are fire over a square
 * and both do one point of damage, so rather than refuse three shipped boards
 * to the edition that did not print their fire, EACH EDITION RESOLVES WHATEVER
 * FIRE THE BOARD CARRIES BY ITS OWN TIMING. That is ours and not either
 * book's; it is declared in editor/rulesets/devices.js and these hold it to
 * what it claims -- in particular that the TIMINGS did not merge along with
 * the reading, and that fire is the only such widening.
 */
import { board, courseOn, game, give, runRegister, N, E, S, W } from "./harness.js";
import { jetPass, flamerPass } from "../../engine/rules.js";
import { card, isDamage } from "../../engine/cards.js";
import { step, tick, applyAnswer } from "../../engine/machine.js";
import { botAnswer } from "../../engine/bots.js";
import { DEVICE_KINDS } from "../../../editor/rulesets/devices.js";
import { setWall, EDGE_WALL, EDGE_DOOR } from "../../../editor/lib/edges.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

/* a flame jet on the north wall of (c,r), playing south over its own square */
function jet(b, c, r, regs, reach = 1) {
  setWall(b, c, r, N, EDGE_WALL);
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c, r }, face: S, reach, regs });
}
/* a flamer hanging over (c,r) */
function flamer(b, c, r, regs) { b.ceilingDevices.push({ kind: "flamer", c, r, regs }); }
/* a swing door on the east edge of (c,r): the one thing left that only one book has */
function door(b, c, r, regs) {
  setWall(b, c, r, E, EDGE_DOOR);
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: c + 1, r }, regs });
}

const far = edit => courseOn(board(8, 8, edit), [[7, 0]]);
const mgame = (co, places) => game(co, places, { ruleset: "modern" });
const dmg = (st, p) => p.pile.filter(i => isDamage(st, i)).length;
function own(st, p, kind) {
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " left in the deck");
  return p.deck.splice(i, 1)[0];
}
function driveRegister(st, library) {
  st.phase = "exec"; st.step = "reveal"; st.events = [];
  const want = st.register;
  for (let g = 0; g < 2000 && !st.over; g++) {
    if (!(st.phase === "exec" && st.register === want)) break;
    if (st.waiting) {
      const w = st.waiting;
      if (!applyAnswer(st, library, botAnswer(st, library, w))) throw new Error("refused: " + w.kind);
    } else tick(st, library);
  }
}

export const TESTS = [
  ["a flame jet burns under the 2016 rules, on the 2016 timing", () => {
    const co = far(b => { jet(b, 3, 5, [1]); jet(b, 4, 5, [2]); });
    /* the same four cases the flamer's own scenario asserts, on a jet */
    let st = mgame(co, [{ c: 2, r: 5, face: E }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq(dmg(st, p), 2, "entered the flame and ended the register in it");

    st = mgame(co, [{ c: 2, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move3");
    driveRegister(st, co.library);
    eq(dmg(st, p), 1, "passed through the '1' jet; the '2' jet is not active in register 1");

    st = mgame(co, [{ c: 3, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    eq(dmg(st, p), 0, "started in it and drove out: nothing, as with a flamer");

    /* THE TIMING IS THE BOOK'S, NOT THE DEVICE'S. The classic rule burns a
     * robot that does not LEAVE the flame; the 2016 book has no such point,
     * so a rotate in a jet costs the end-of-register point alone. */
    st = mgame(co, [{ c: 3, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "right");
    driveRegister(st, co.library);
    eq([p.c, p.r], [3, 5], "the rotate stayed put in the flame");
    eq(dmg(st, p), 1, "the end-of-register point alone: the 2016 book does not burn a robot for staying");
  }],

  ["a flamer burns under the classic rules, on the classic timing", () => {
    const co = courseOn(board(8, 8, b => { flamer(b, 3, 5, [1]); flamer(b, 4, 5, [3]); }));
    /* the burner's own step, after the lasers, in its registers only */
    let st = game(co, [{ c: 3, r: 5, face: E }]);
    st.register = 0; jetPass(st, co.C);
    eq(st.players[0].damage, 1, "the classic burner step scorches a robot standing in a flamer");
    st = game(co, [{ c: 4, r: 5, face: E }]);
    st.register = 0; jetPass(st, co.C);
    eq(st.players[0].damage, 0, "and not in a register the flamer is quiet in");

    /* THE CLASSIC EXTRA POINT, which the 2016 book does not have: a robot
     * that does not leave the flame is burnt for staying, and burnt again
     * when the burner takes its turn. */
    st = game(co, [{ c: 3, r: 5, face: E }]);
    give(st, st.players[0], 0, "right");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].r], [3, 5], "the rotate stayed put in the flame");
    eq(st.players[0].damage, 2, "one for not leaving it, one for the burner's own step");

    /* and passing through burns once, with nothing left to collect at the end */
    st = game(co, [{ c: 2, r: 5, face: E }]);
    give(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].damage], [5, 1], "drove through the flame and out the far side");
  }],

  ["a flame jet and a flamer each stand in for the other, and the table says so", () => {
    /* the substitute is declared in the data, not inferred from the behaviour,
     * and it is the only one: everything else on a board works as its own
     * book says under either set of rules (issue #14) */
    for (const k of ["jet", "flamer"]) assert(DEVICE_KINDS[k].substitute, k + ": says, in the table, that this is a substitute of ours");
    eq(Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].substitute).sort(), ["flamer", "jet"], "and nothing else claims to stand in for anything");
    for (const k of Object.keys(DEVICE_KINDS)) assert(DEVICE_KINDS[k].playsIn === undefined, k + ": the old playsIn field is gone");
  }]
];
