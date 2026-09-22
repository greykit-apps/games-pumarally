/* The three 2016 expansions' floor, one scenario each, read off the Factory
 * Floor Guides photographed into manual1/: Wet and Wild (IMG_1236 to
 * IMG_1239), Chaos and Carnage (IMG_1243), Thrills and Spills (IMG_1248 to
 * IMG_1251). Portals and oil were built with Crash and Burn; the rest is
 * here, on authored boards, since no shipped board prints any of it yet.
 */
import { board, courseOn, game, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, laserPass, firstRobotAlong, flamerPass, ledgeUp } from "../../engine/rules.js";
import { step, tick, applyAnswer, MODERN_ORDER } from "../../engine/machine.js";
import { card, isDamage } from "../../engine/cards.js";
import { newInstalled, temporaryOffers } from "../../engine/upgrades.js";
import { assertInvariants } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";
import { rulesetsFor } from "../../engine/library.js";
import { setLevel } from "../../../editor/lib/board.js";
import { setRamp } from "../../../editor/lib/edges.js";
import { setWall } from "../../../editor/lib/edges.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

const far = edit => courseOn(board(8, 8, edit), [[7, 0]]);
const mgame = (co, places, opts) => game(co, places, { ...(opts || {}), ruleset: "modern" });
function own(st, p, kind) {
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " left in the deck");
  return p.deck.splice(i, 1)[0];
}
const dmg = (st, p) => p.pile.filter(i => isDamage(st, i)).length;
function fit(st, p, id) {
  const i = st.upgradeDeck.indexOf(id);
  if (i >= 0) st.upgradeDeck.splice(i, 1);
  else { const h = st.players.find(q => q.shelf.includes(id)); h.shelf.splice(h.shelf.indexOf(id), 1); }
  p.installed.push(newInstalled(id));
}
function driveRegister(st, library, decide) {
  st.phase = "exec"; st.step = "reveal"; st.events = [];
  const want = st.register;
  for (let g = 0; g < 2000 && !st.over; g++) {
    if (!(st.phase === "exec" && st.register === want)) break;
    if (st.waiting) {
      const w = st.waiting;
      const a = decide ? decide(w) : undefined;
      if (!applyAnswer(st, library, a === undefined ? botAnswer(st, library, w) : a)) throw new Error("refused: " + w.kind);
    } else tick(st, library);
  }
}
/** A board with the top three rows one level up, and a ramp on the north edge of (3,3) climbing into them. */
const terraced = edit => far((b, t) => {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) setLevel(b, c, r, 1);
  setRamp(b, 3, 3, N, true);
  if (edit) edit(b, t);
});

export const TESTS = [
  /* --- Wet and Wild ------------------------------------------------------------ */
  ["water costs a space of movement on the way out, once per card, and only on your own card", () => {
    const co = far((b, t) => { t.setCell(2, 5, "~.."); t.setCell(3, 5, "~.."); });
    let st = mgame(co, [{ c: 2, r: 5, face: E }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq(p.c, 2, "Example 1: a Move 1 from water stands still");
    st.register = 0; p.registers[0] = own(st, p, "back");
    driveRegister(st, co.library);
    eq(p.c, 2, "and so does a Move Back");
    st.register = 0; p.registers[0] = own(st, p, "move3");
    driveRegister(st, co.library);
    eq(p.c, 4, "Example 3: a Move 3 from water goes two, whether into water or onto floor");
    st = mgame(co, [{ c: 1, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    eq(p.c, 3, "Example 2: a Move 2 into water is not slowed on the way in");
    /* pushes are unaffected */
    st = mgame(co, [{ c: 1, r: 5, face: E }, { c: 2, r: 5, face: N }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    eq(st.players[1].c, 3, "a robot shoved out of water goes the whole way");
    /* and the classic game knows nothing of it */
    const cst = game(co, [{ c: 2, r: 5, face: E }]);
    stepRobot(cst, co.C, cst.players[0], E, "card");
    eq(cst.players[0].c, 3, "classic: water is floor");
  }],
  ["drains are pits, in every way", () => {
    const co = far((b, t) => t.setCell(2, 5, "D.."));
    const st = mgame(co, [{ c: 1, r: 5, face: E }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    assert(st.players[0].rebooting, "into the drain, and rebooting");
    eq(dmg(st, st.players[0]), 2, "two damage cards, as for a pit");
    const fw = mgame(co, [{ c: 1, r: 5, face: E }]);
    fit(fw, fw.players[0], "firewall");
    stepRobot(fw, co.C, fw.players[0], E, "card");
    eq(dmg(fw, fw.players[0]), 0, "and Firewall counts it as a pit");
  }],
  ["a ledge cannot be climbed, and the drop off one costs two damage, or one into water", () => {
    const co = terraced((b, t) => t.setCell(5, 3, "~.."));
    let st = mgame(co, [{ c: 1, r: 3, face: N }]);
    let p = st.players[0];
    assert(ledgeUp(co.C, 1, 3, N), "the edge north of (1,3) is a ledge going up");
    assert(!stepRobot(st, co.C, p, N, "card"), "a robot cannot move up across a ledge");
    eq([p.c, p.r], [1, 3], "it stays put");
    st = mgame(co, [{ c: 1, r: 2, face: S }]); p = st.players[0];
    assert(stepRobot(st, co.C, p, S, "card"), "down is allowed");
    eq(dmg(st, p), 2, "and draws two damage");
    st = mgame(co, [{ c: 5, r: 2, face: S }]); p = st.players[0];
    stepRobot(st, co.C, p, S, "card");
    eq(dmg(st, p), 1, "one when falling into water");
    /* pushed off a ledge is a drop too */
    st = mgame(co, [{ c: 1, r: 1, face: S }, { c: 1, r: 2, face: E }]);
    stepRobot(st, co.C, st.players[0], S, "card");
    eq([st.players[1].r, dmg(st, st.players[1])], [3, 2], "the shoved robot drops and pays");
    assertInvariants(st, co.library);
  }],
  ["weapons and board lasers cannot hit a target on another level", () => {
    const co = terraced(b => { setWall(b, 1, 7, S, 1); b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 1, r: 8 }, face: N, damage: 1 }); });
    const st = mgame(co, [{ c: 1, r: 5, face: N }, { c: 1, r: 1, face: S }]);
    const low = st.players[0], high = st.players[1];
    eq(firstRobotAlong(st, co.C, low.c, low.r, N, true), null, "the robot's laser stops at the ledge");
    eq(firstRobotAlong(st, co.C, high.c, high.r, S, true), null, "and so does the one firing down");
    st.register = 0;
    laserPass(st, co.C);
    eq([dmg(st, low), dmg(st, high)], [1, 0], "the board laser from the south hits the low robot and not the high one beyond the ledge");
  }],
  ["a ramp is an extra space on the way up, and is ignored on the way down", () => {
    const co = terraced();
    let st = mgame(co, [{ c: 3, r: 4, face: N }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    eq([p.c, p.r], [3, 2], "Move 2: onto the ramp, then up onto the terrace, no damage");
    eq(dmg(st, p), 0, "safely");
    st = mgame(co, [{ c: 3, r: 2, face: S }]); p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq([p.c, p.r], [3, 4], "Move 1 down: the ramp does not act as a space, so it lands below it");
    eq(dmg(st, p), 0, "no damage is taken");
  }],
  ["stopping on the way up a ramp slides you back down, pushing whoever is there", () => {
    const co = terraced();
    /* a Move 2 that shoves a robot up the ramp ahead of it: the shoved robot
     * reaches the terrace, the mover stops on the ramp and slides back */
    let st = mgame(co, [{ c: 3, r: 5, face: N }, { c: 3, r: 4, face: E }]);
    let p = st.players[0], q = st.players[1];
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    eq([q.c, q.r], [3, 2], "the shoved robot went up the ramp onto the terrace, by any means and without damage");
    eq(dmg(st, q), 0, "safely");
    eq([p.c, p.r], [3, 4], "the mover stopped on the ramp and slid back to the lower level");
    /* the slide is a shove: whoever stands on the square below goes with it */
    st = mgame(co, [{ c: 3, r: 3, face: N }, { c: 3, r: 4, face: E }]); p = st.players[0]; q = st.players[1];
    stepRobot(st, co.C, p, S, "ramp");
    eq([[p.c, p.r], [q.c, q.r]], [[3, 4], [3, 5]], "the robot below the ramp is pushed along");
  }],
  ["currents convey at their own step, and are water", () => {
    const co = far((b, t) => { t.setCell(2, 5, "C>."); t.setCell(3, 5, "C>."); t.setCell(2, 3, "b>."); });
    const st = mgame(co, [{ c: 2, r: 5, face: N }, { c: 2, r: 3, face: N }]);
    const inCurrent = st.players[0], onGreen = st.players[1];
    eq(MODERN_ORDER.map(x => x[0]).indexOf("currents"), 3, "step three of the board, after the green belts");
    for (const p of st.players) p.registers[0] = own(st, p, "powerUp");
    let seen = [];
    driveRegister(st, co.library);
    eq([inCurrent.c, onGreen.c], [3, 3], "each conveyed one square by its own step");
    /* green does not move a current's robot, nor the other way round */
    const st2 = mgame(co, [{ c: 2, r: 5, face: N }, { c: 2, r: 3, face: N }]);
    beltPass(st2, co.C, 1, 1, null, (C, c, r) => !C.grid || true);
    seen = [st2.players[0].c, st2.players[1].c];
    eq(seen, [3, 3], "an unfiltered pass moves both, which is why the filter exists");
    /* a current is water: leaving it costs a space */
    const st3 = mgame(co, [{ c: 3, r: 5, face: N }]);
    st3.players[0].registers[0] = own(st3, st3.players[0], "move1");
    driveRegister(st3, co.library);
    eq([st3.players[0].c, st3.players[0].r], [4, 5], "a Move 1 out of a current goes nowhere, and then the current carries the robot one east");
  }],

  /* --- Chaos and Carnage -------------------------------------------------------- */
  ["a randomizer replaces the card you reveal with the top of your deck", () => {
    /* ON A CONVEYOR, because that is the case the site layer exists for: Pushy
     * prints randomizers on belt squares, and while the randomizer was the
     * ground element `z` the square could be one or the other and not both.
     * The belt runs east and the robot is carried off it after the card, so
     * this also proves the two resolve independently on the one square. */
    const co = far((b, t) => { t.setCell(2, 5, "b>."); t.sites(2, 5, ["randomizer"]); });
    const st = mgame(co, [{ c: 2, r: 5, face: E }]);
    const p = st.players[0];
    const planned = own(st, p, "move3"), top = own(st, p, "left");
    p.registers[0] = planned; p.deck.push(top);
    driveRegister(st, co.library);
    /* (3,5) not (2,5): the Rotate Left turned the robot on the spot and THEN the
     * belt under it carried it one east. A Move 3 would have left it at (5,5)
     * still facing east, so the position and the facing each rule one out. The
     * two effects on the one square resolve independently, which is the thing
     * the ground layer could not express while a randomizer was an element. */
    eq([p.c, p.r, p.face], [3, 5, N], "the Rotate Left from the deck played, not the Move 3");
    assert(p.pile.includes(planned), "the planned card went to the robot's discard");
    eq(p.registers[0], top, "the register holds the replacement");
    /* a replaced SPAM goes to the damage discard */
    const st2 = mgame(co, [{ c: 2, r: 5, face: E }]);
    const q = st2.players[0];
    const sp = st2.damageDeck.pop();
    q.registers[0] = sp; q.deck.push(own(st2, q, "move1"));
    driveRegister(st2, co.library);
    assert(st2.damageDiscard.includes(sp), "SPAM to the table's discard");
    eq(q.c, 3, "and the Move 1 played");
    assertInvariants(st2, co.library);
  }],
  ["a teleporter throws a Move card two further forward, unless the arrival square is taken", () => {
    const co = far((b, t) => { t.setCell(1, 5, "T1."); t.setCell(6, 5, "T1."); setWall(b, 2, 5, E, 1); t.setCell(3, 5, "o.."); });
    let st = mgame(co, [{ c: 1, r: 5, face: E }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq([p.c, p.r], [4, 5], "Move 1: teleport forward 3, past a wall and over a pit");
    eq(dmg(st, p), 0, "ignoring everything between");
    st = mgame(co, [{ c: 1, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "back");
    driveRegister(st, co.library);
    eq([p.c, p.r], [3, 5], "Move Back: teleport forward 2, and no backward move at all");
    assert(p.rebooting, "which lands it in the pit: the arrival square is what it is");
    /* occupied arrival: the teleporter does not operate */
    st = mgame(co, [{ c: 1, r: 5, face: E }, { c: 4, r: 5, face: N }]); p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq([p.c, p.r], [2, 5], "the Move 1 played normally instead");
    /* rotates are unaffected, and movement upgrades do not function on it */
    st = mgame(co, [{ c: 1, r: 5, face: E }]); p = st.players[0];
    fit(st, p, "overclocked");
    eq(temporaryOffers(st, co.C, p, "before").filter(o => o.id === "overclocked").length, 0, "Overclocked is not offered on the teleporter");
    p.registers[0] = own(st, p, "right");
    driveRegister(st, co.library);
    eq([p.c, p.r, p.face], [1, 5, S], "a rotate stays put");
  }],

  /* --- Thrills and Spills ---------------------------------------------------------- */
  ["a flamer burns on the way in and at the end of the register, not at the start", () => {
    const co = far(b => { b.ceilingDevices.push({ kind: "flamer", c: 3, r: 5, regs: [1] }); b.ceilingDevices.push({ kind: "flamer", c: 4, r: 5, regs: [2] }); });
    /* entering an active space: one; ending the register in it: one more */
    let st = mgame(co, [{ c: 2, r: 5, face: E }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    eq(dmg(st, p), 2, "entered the flame and ended the register in it");
    /* passing through: one, and none at the end */
    st = mgame(co, [{ c: 2, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move3");
    driveRegister(st, co.library);
    eq(dmg(st, p), 1, "passed through the '1' space; the '2' space is not active in register 1");
    /* starting in it and leaving: nothing */
    st = mgame(co, [{ c: 3, r: 5, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    eq(dmg(st, p), 0, "Example 2: you can outrun a fireball");
    /* pushed into it: one */
    st = mgame(co, [{ c: 1, r: 5, face: E }, { c: 2, r: 5, face: N }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    eq(dmg(st, st.players[1]), 1, "pushed into the flame");
    /* the end-of-register point is its own pass, after the lasers */
    const names = MODERN_ORDER.map(x => x[0]);
    assert(names.indexOf("flamers") === names.indexOf("lasers") + 1, "flamers act after the lasers");
    st = mgame(co, [{ c: 4, r: 5, face: E }]); p = st.players[0];
    st.register = 1; flamerPass(st, co.C);
    eq(dmg(st, p), 1, "standing in the '2' space when register 2 ends");
    st.register = 0; flamerPass(st, co.C);
    eq(dmg(st, p), 1, "and not when register 1 does");
  }],
  ["a board printing the expansion floor is a 2016 board", () => {
    for (const tok of ["~..", "D..", "C>."]) {
      const co = courseOn(board(6, 6, (b, t) => t.setCell(2, 2, tok)));
      eq(rulesetsFor(co.doc, co.library), ["modern"], tok + " is read by the 2016 book alone");
    }
    /* levels and ramps are not elements: a level is a property of the floor and
     * a ramp an edge, and either alone makes the board Wet and Wild's */
    const lv = courseOn(board(6, 6, b => setLevel(b, 2, 2, 1)));
    eq(rulesetsFor(lv.doc, lv.library), ["modern"], "a raised square is read by the 2016 book alone");
    const rp = courseOn(board(6, 6, b => { setRamp(b, 2, 2, N, true); setLevel(b, 2, 1, 1); }));
    eq(rulesetsFor(rp.doc, rp.library), ["modern"], "a ramp is read by the 2016 book alone");
    /* A MARKING NARROWS A BOARD TOO. The randomizer is a site now, and sites
     * were excluded from this question on the grounds that a wrench and a
     * battery on one square is just the swap rule -- true of those four, and
     * not of this one: the classic book has no randomizer rule at all. The
     * four collection markings declare playsIn: both so they go on not
     * narrowing, which is what keeps the swap rule working. */
    {
      const co = courseOn(board(6, 6, (b, t) => t.sites(2, 2, ["randomizer"])));
      eq(rulesetsFor(co.doc, co.library), ["modern"], "a randomizer is read by the 2016 book alone");
    }
    for (const mark of ["repair", "upgrade", "battery", "flagspot"]) {
      const co = courseOn(board(6, 6, (b, t) => t.sites(2, 2, [mark])));
      eq(rulesetsFor(co.doc, co.library), ["classic", "modern"],
        "a " + mark + " narrows nothing -- the other book has no use for it, which is not the same as no rule");
    }
    /* the FLAMER is the exception, and not because it is expansion floor: it
     * stands in for a classic flame jet, so both books play a board with one.
     * scenarios/fire.js holds that substitute to what it claims. */
    const fl = courseOn(board(6, 6, b => b.ceilingDevices.push({ kind: "flamer", c: 2, r: 2, regs: [1] })));
    eq(rulesetsFor(fl.doc, fl.library), ["classic", "modern"], "a flamer is the one piece of expansion floor both books play");
  }]
];
