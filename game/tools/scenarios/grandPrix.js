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
import { trapDoorPass } from "../../engine/rules.js";
import { CLASSIC_ORDER, MODERN_ORDER } from "../../engine/machine.js";
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
  }]
];
