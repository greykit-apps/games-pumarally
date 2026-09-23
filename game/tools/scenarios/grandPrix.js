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
import { trapDoorPass, firstRobotAlong, beltPass, stepRobot } from "../../engine/rules.js";
import { CLASSIC_ORDER, MODERN_ORDER } from "../../engine/machine.js";
import { card } from "../../engine/cards.js";
import { validateBoard } from "../../../editor/validate/board.js";
import { sink } from "../../../editor/validate/diagnostic.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };
const codes = b => { const d = sink(); validateBoard(b, d); return d.errors.map(e => e.code); };

/* a trap door at (c,r) that opens at the end of `regs` */
function trapDoor(b, c, r, regs) {
  const dev = { kind: "trapDoor", c, r };
  if (regs) dev.regs = regs;
  b.ceilingDevices.push(dev);
}
const plain = edit => courseOn(board(8, 8, edit));
/* a repulsor field on the east edge of (c,r), its capsule printed in (c,r) */
function repulsor(b, t, c, r) {
  t.wall(c, r, E);
  b.wallDevices.push({ kind: "repulsor", edge: { kind: "v", c: c + 1, r }, face: W });
}

export const TESTS = [
  /* --- trap doors ---------------------------------------------------------- */
  ["a trap door opens at the end of a register it lists, and a robot still on it falls", () => {
    for (const ruleset of ["classic", "modern"]) {
      const co = plain(b => trapDoor(b, 3, 3, [1]));
      const st = game(co, [{ c: 3, r: 3, face: N }], { ruleset });
      const p = st.players[0];
      const lives = p.lives;
      if (ruleset === "classic") give(st, p, 0, "left");
      runRegister(st, co.library);
      assert(!p.alive || p.rebooting, ruleset + ": it fell through");
      if (ruleset === "classic") eq(p.lives, lives - 1, "classic: a life, as into a pit");
    }
  }],
  ["a robot may step onto a trap door in the register before it opens, and off it in the register it opens", () => {
    /* the author's reading: the door changes state at the END of a register */
    const co = plain(b => trapDoor(b, 3, 3, [2]));
    const st = game(co, [{ c: 2, r: 3, face: E }]);
    const p = st.players[0];
    give(st, p, 0, "move1");
    runRegister(st, co.library);
    eq([p.c, p.alive], [3, true], "register 1: onto the door, which is shut, and safe");
    give(st, p, 1, "move1");
    runRegister(st, co.library);
    eq([p.c, p.alive], [4, true], "register 2: off it before it opens at the end of the register");
  }],
  ["a robot may cross a trap door in the very register it opens", () => {
    const co = plain(b => trapDoor(b, 3, 3, [1]));
    const st = game(co, [{ c: 2, r: 3, face: E }]);
    const p = st.players[0];
    give(st, p, 0, "move2");
    runRegister(st, co.library);
    eq([p.c, p.alive], [4, true], "over it and beyond: it is floor until the register ends");
  }],
  ["a trap door is floor in the registers it does not list", () => {
    const co = plain(b => trapDoor(b, 3, 3, [2, 4]));
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    for (const reg of [0, 2, 4]) {
      st.register = reg;
      trapDoorPass(st, co.C);
      assert(st.players[0].alive, "register " + (reg + 1) + ": it stays shut");
    }
    st.register = 1;
    trapDoorPass(st, co.C);
    assert(!st.players[0].alive, "register 2: it opens");
  }],
  ["a conveyor that leaves a robot on an opening trap door drops it", () => {
    const co = plain((b, t) => { t.setCell(2, 3, "b>."); trapDoor(b, 3, 3, [1]); });
    const st = game(co, [{ c: 2, r: 3, face: N }]);
    give(st, st.players[0], 0, "left");
    runRegister(st, co.library);
    assert(!st.players[0].alive, "the belt carried it on, and the door opened under it");
  }],
  ["the trap doors are the board's last act, before the checkpoints, in both books", () => {
    const c = CLASSIC_ORDER.map(x => x[0]), m = MODERN_ORDER.map(x => x[0]);
    eq(c.slice(c.indexOf("trapDoors")), ["trapDoors", "touch"], "classic: then only the flags");
    eq(m.slice(m.indexOf("trapDoors")), ["trapDoors", "batteries", "touch"], "2016: then the batteries and the checkpoints");
  }],
  ["a trap door must name the registers it opens in", () => {
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0))).includes("regs.missing"), true, "open in every register is a pit");
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0, [1, 2, 3, 4, 5]))).includes("regs.missing"), true, "and all five spelled out is the same pit");
    eq(codes(board(4, 2, b => trapDoor(b, 1, 0, [3]))), [], "one register is a trap door");
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
  }]
];
