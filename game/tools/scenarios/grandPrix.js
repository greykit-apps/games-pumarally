/* Grand Prix (1997), reprinted for the 2016 game as Turn & Burn: trap doors,
 * repulsor fields and chop shops. The 30th Anniversary boards print them too.
 *
 * No publisher's rulebook for either box is in the archive. The rules are the
 * Ultimate RoboRally Collection's (Justin Alexander, a fan compilation of the
 * classic game and its expansions), manual1/roborally-ultimate-collection-
 * rulebook.pdf. Where a test holds the engine to the author's reading rather
 * than a book's, it says so.
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, give, runRegister, E, W, N } from "./harness.js";
import { trapDoorsActivate, firstRobotAlong, beltPass, stepRobot } from "../../engine/rules.js";
import { rulesetFor } from "../../../editor/rulesets/index.js";
import { CLASSIC_ORDER, MODERN_ORDER } from "../../engine/machine.js";
import { card } from "../../engine/cards.js";
import { validateBoard } from "../../../editor/validate/board.js";
import { sink } from "../../../editor/validate/diagnostic.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };
const codes = b => { const d = sink(); validateBoard(b, d); return d.errors.map(e => e.code); };

/* a trap door pit at (c,r), active in `regs` */
function trapDoor(b, c, r, regs) {
  const dev = { kind: "trapDoor", c, r };
  if (regs) dev.regs = regs;
  b.floorDevices.push(dev);
}
/* a card into a register, under either book */
function put(st, p, reg, kind) {
  if (st.ruleset !== "modern") return give(st, p, reg, kind);
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " in the deck");
  p.registers[reg] = p.deck.splice(i, 1)[0];
}
const plain = edit => courseOn(board(8, 8, edit));
/* a repulsor field on the east edge of (c,r), its capsule printed in (c,r) */
function repulsor(b, t, c, r) {
  t.wall(c, r, E);
  b.wallDevices.push({ kind: "repulsor", edge: { kind: "v", c: c + 1, r }, face: W });
}

export const TESTS = [
  /* --- trap door pits ------------------------------------------------------
   * Turn & Burn's Factory Floor Guide (manual1/IMG_1464-1465): a pit during
   * the registers printed on it, from the START of each, and open floor
   * otherwise. The same under the classic book, by the author's ruling. */
  ["a trap door pit activates at the start of a register it lists, and a robot on it is lost before it can move", () => {
    /* the sheet's own example: a robot ends register 3 on a door marked 4 */
    for (const ruleset of ["classic", "modern"]) {
      const co = plain(b => trapDoor(b, 3, 3, [2]));
      const st = game(co, [{ c: 2, r: 3, face: E }], { ruleset });
      const p = st.players[0];
      const lives = p.lives;
      put(st, p, 0, "move1"); put(st, p, 1, "move1");
      runRegister(st, co.library);
      eq([p.c, p.alive], [3, true], ruleset + ": register 1, onto the door, which is floor then");
      st.register = 1;
      runRegister(st, co.library);
      assert(!p.alive || p.rebooting, ruleset + ": register 2, lost as the door activates");
      assert(!st.events.some(e => e.type === "moved" && e.player === p.id), ruleset + ": before its card could move it");
      if (ruleset === "classic") eq(p.lives, lives - 1, "classic: a life, as into a pit");
      else assert(p.rebooting, "modern: it must reboot");
    }
  }],
  ["a robot lost to a trap door pit at the start of register 1 does not land again that round", () => {
    const co = plain(b => trapDoor(b, 3, 3, [1]));
    const st = game(co, [{ c: 3, r: 3, face: N }], { ruleset: "modern" });
    const p = st.players[0];
    put(st, p, 0, "move1");
    runRegister(st, co.library);
    assert(p.rebooting && !p.alive, "still off the board, rebooting, after register 1");
  }],
  ["a robot cannot cross a trap door pit in a register it is active", () => {
    for (const ruleset of ["classic", "modern"]) {
      const co = plain(b => trapDoor(b, 3, 3, [1]));
      const st = game(co, [{ c: 2, r: 3, face: E }], { ruleset });
      const p = st.players[0];
      put(st, p, 0, "move2");
      runRegister(st, co.library);
      assert(!p.alive || p.rebooting, ruleset + ": it fell in on the first square, as into a pit");
    }
  }],
  ["a trap door pit is open floor in the registers it does not list", () => {
    const co = plain(b => trapDoor(b, 3, 3, [2, 4]));
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    for (const reg of [0, 2, 4]) {
      st.register = reg;
      trapDoorsActivate(st, co.C);
      assert(st.players[0].alive, "register " + (reg + 1) + ": it stays shut");
    }
    st.register = 1;
    trapDoorsActivate(st, co.C);
    assert(!st.players[0].alive, "register 2: it activates");
    /* and crossing it while it is shut is crossing floor */
    const co2 = plain(b => trapDoor(b, 3, 3, [2]));
    const st2 = game(co2, [{ c: 2, r: 3, face: E }]);
    put(st2, st2.players[0], 0, "move2");
    runRegister(st2, co2.library);
    eq([st2.players[0].c, st2.players[0].alive], [4, true], "over it in register 1, when it is floor");
  }],
  ["a conveyor that carries a robot onto an active trap door pit drops it", () => {
    const co = plain((b, t) => { t.setCell(2, 3, "b>."); trapDoor(b, 3, 3, [1]); });
    const st = game(co, [{ c: 2, r: 3, face: N }]);
    put(st, st.players[0], 0, "left");
    runRegister(st, co.library);
    assert(!st.players[0].alive, "the belt carried it into the pit");
  }],
  ["a robot pushed onto an active trap door pit falls", () => {
    const co = plain(b => trapDoor(b, 4, 3, [1]));
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    put(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    assert(!st.players[1].alive, "shoved into the open pit");
    assert(st.players[0].alive, "and the pusher stops short of it");
  }],
  ["trap door pits are not a step of the board's turn, in either book", () => {
    for (const order of [CLASSIC_ORDER, MODERN_ORDER]) assert(!order.some(x => /trap/i.test(x[0])), "no end-of-register trap door pass");
    for (const id of ["classic", "modern"]) assert(!rulesetFor(id).order.some(x => /trap/i.test(x.step)), id + ": no trap door step in the printed order");
  }],
  ["a trap door pit must name the registers it is active in", () => {
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0))).includes("regs.missing"), true, "active in every register is a pit");
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0, [1, 2, 3, 4, 5]))).includes("regs.missing"), true, "and all five spelled out is the same pit");
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0, [3]))), [], "one register is a trap door");
  }],
  ["a trap door pit is the floor of its square", () => {
    eq(codes(board(4, 2, (b, t) => { t.setCell(1, 0, "b>."); trapDoor(b, 1, 0, [3]); })), ["floor.notFloor"], "not a door over a belt");
  }],

  /* --- repulsor fields ------------------------------------------------------ */
  ["a robot that drives into a repulsor field is thrown back as far as its card moves", () => {
    for (const ruleset of ["classic", "modern"]) {
      const co = plain((b, t) => repulsor(b, t, 4, 3));
      const st = game(co, [{ c: 3, r: 3, face: E }], { ruleset });
      const p = st.players[0];
      if (ruleset === "classic") give(st, p, 0, "move3");
      else p.registers[0] = p.deck.splice(p.deck.findIndex(ci => card(st, ci).kind === "move3"), 1)[0];
      runRegister(st, co.library);
      eq([p.c, p.r, p.face], [1, 3, E], ruleset + ": one square to the field, then three back, still facing it");
    }
  }],
  ["a Move 1 into a repulsor field throws the robot one square back", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 4, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 3, "straight back one");
  }],
  ["a repulsor field throws back from either side", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 5, r: 3, face: W }]);
    give(st, st.players[0], 0, "move2");
    runRegister(st, co.library);
    eq(st.players[0].c, 7, "from the far side too: the capsule's square is only where it is printed");
  }],
  ["a robot pushed into a repulsor field goes back as far as the pusher's card, and the pusher's move ends", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    give(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    /* one square: the pusher to 3, the pushed robot to 4, against the field;
     * then the pushed robot goes three back, and shoves its pusher before it */
    eq([st.players[1].c, st.players[0].c], [1, 0], "the pushed robot three back, and the pusher shoved back ahead of it");
  }],
  ["a repulsor field stops a laser like a wall", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 6, r: 3, face: W }]);
    eq(firstRobotAlong(st, co.C, 2, 3, E, true), null, "the beam stops at the field");
    eq(firstRobotAlong(st, co.C, 6, 3, W, true), null, "from the other side as well");
  }],
  ["a belt that carries a robot into a repulsor field meets a wall and nothing more", () => {
    /* ours: the rule is for a robot's own card and a push by another's card */
    const co = plain((b, t) => { repulsor(b, t, 4, 3); t.setCell(4, 3, "b>."); });
    const st = game(co, [{ c: 4, r: 3, face: N }]);
    beltPass(st, co.C, 1, 2);
    eq(st.players[0].c, 4, "the belt could not carry it through, and it was not thrown");
  }],
  ["a robot cannot phase through a repulsor field", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 4, r: 3, face: E }]);
    st.players[0].phasing = 1;
    assert(!stepRobot(st, co.C, st.players[0], E, "card"), "a field, not a wall to pass through");
    eq(st.players[0].phasing, 1, "and the phasing is not spent on it");
  }],
  ["a laser may be mounted on a repulsor field's edge", () => {
    /* Back Stretch: a double beam fired along a row from the capsules at its two ends */
    const b = board(6, 2, (bb, t) => {
      repulsor(bb, t, 0, 0);
      bb.wallDevices.push({ kind: "laser", edge: { kind: "v", c: 1, r: 0 }, face: E, damage: 1 });
    });
    eq(codes(b), [], "the validator takes the repulsor's edge as the wall the laser needs");
  }],

  /* --- chop shops ----------------------------------------------------------- */
  ["a chop shop is marked on the board and does nothing in play yet", () => {
    /* the author's decision: it waits for the Armed and Dangerous ammunition
     * cards its refill needs; until then it is the floor it sits on */
    for (const ruleset of ["classic", "modern"]) {
      const co = plain((b, t) => t.sites(3, 3, ["chopShop"]));
      const st = game(co, [{ c: 3, r: 3, face: N, damage: 2 }], { ruleset });
      const p = st.players[0];
      const before = JSON.stringify([p.damage, p.options, p.energy, p.installed, p.shelf, p.archive]);
      if (ruleset === "classic") give(st, p, 0, "left");
      else p.registers[0] = p.deck.splice(p.deck.findIndex(ci => card(st, ci).kind === "left"), 1)[0];
      runRegister(st, co.library);
      eq(JSON.stringify([p.damage, p.options, p.energy, p.installed, p.shelf, p.archive]), before, ruleset + ": nothing changed");
    }
  }]
];
