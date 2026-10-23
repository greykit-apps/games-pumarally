/* Turn & Burn (Renegade), reprinting Grand Prix (1997): trap door pits,
 * repulsor fields and chop shops. The 30th Anniversary boards print them too.
 *
 * The rules are Turn & Burn's own Factory Floor Guide, photographed by the
 * author. The classic book has no Grand Prix sheet in
 * the archive; the author ruled the same rules hold under it (2026-09-27).
 * Where a test holds the engine to a reading of ours rather than the sheet's,
 * it says so.
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, give, runRegister, E, W, N, S } from "./harness.js";
import { trapDoorsActivate, chopShopPass, firstRobotAlong, beltPass, stepRobot } from "../../engine/rules.js";
import { UPGRADE_DEFS, UPGRADE_IDS, newInstalled, installUpgrade, installedOfType, removable } from "../../engine/upgrades.js";
import { shutdown } from "../../engine/machine.js";
import { newHeld } from "../../engine/options.js";
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
/* a card another robot installed onto `to`, as installUpgrade leaves it */
function onto(st, id, from, to) {
  const held = newInstalled(take(st, id)[0]);
  held.st.from = from;
  st.players[to].installed.push(held);
}
/* a card out of the upgrade deck, so the count of cards holds */
function take(st, id) {
  const i = st.upgradeDeck.indexOf(id);
  if (i >= 0) return st.upgradeDeck.splice(i, 1);
  for (const q of st.players) { const k = q.shelf.indexOf(id); if (k >= 0) return q.shelf.splice(k, 1); }
  throw new Error(id + " is nowhere to take from");
}
const carries = (p, id) => p.installed.some(u => u.id === id);
/* a classic robot on a chop shop at (3,3), holding `held`, with its answer already given */
function classicChop(answer, held) {
  const co = plain((b, t) => t.sites(3, 3, ["chopShop"]));
  const st = game(co, [{ c: 3, r: 3, face: N }]);
  const p = st.players[0];
  for (const id of held) { st.optionDeck.splice(st.optionDeck.indexOf(id), 1); p.options.push(newHeld(id)); }
  give(st, p, 0, "left");
  if (answer !== undefined) st.answers[st.turn + ":0:chop:" + p.id] = answer;
  return { st, co, p };
}
/* a 2016 robot on a chop shop at (3,3) with its answer already given */
function chop(answer, setup) {
  const co = plain((b, t) => t.sites(3, 3, ["chopShop"]));
  const st = game(co, [{ c: 3, r: 3, face: N }], { ruleset: "modern" });
  const p = st.players[0];
  if (setup) setup(p);
  put(st, p, 0, "left");
  st.answers[st.turn + ":0:chop:" + p.id] = answer;
  return { st, co, p };
}
/* a card into a register, under either book */
function put(st, p, reg, kind) {
  if (st.ruleset !== "modern") return give(st, p, reg, kind);
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " in the deck");
  p.registers[reg] = p.deck.splice(i, 1)[0];
}
const plain = edit => courseOn(board(8, 8, edit));
/* a repulsor field in (c,r), along its east edge: an item in the square, facing that edge */
function repulsor(b, t, c, r) {
  b.floorDevices.push({ kind: "repulsor", c, r, face: E });
}

export const TESTS = [
  /* --- trap door pits ------------------------------------------------------
   * Turn & Burn's Factory Floor Guide: a pit during
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
  ["a wall printed behind a repulsor field stops a robot from that side, and nothing throws it back", () => {
    /* Bounce House: a field along one side of an edge and a plain wall along
     * the other. From the wall's side, a Move 3 goes two and stops. */
    const co = plain((b, t) => { repulsor(b, t, 4, 3); t.wall(5, 3, W); });
    const st = game(co, [{ c: 7, r: 3, face: W }]);
    give(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    eq(st.players[0].c, 5, "two squares, to the wall, and it stays there");
    const st2 = game(co, [{ c: 3, r: 3, face: E }]);
    give(st2, st2.players[0], 0, "move3");
    runRegister(st2, co.library);
    eq(st2.players[0].c, 1, "from the field's own side it is still thrown back three");
  }],
  ["a repulsor field is an item in its square, facing the edge it lies along", () => {
    eq(codes(board(4, 2, (b, t) => repulsor(b, t, 1, 0))), [], "a field needs no wall to stand on");
    eq(codes(board(4, 2, b => b.floorDevices.push({ kind: "repulsor", c: 1, r: 0 }))).includes("device.badFace"), true, "and must say which edge it lies along");
    eq(codes(board(4, 2, (b, t) => { repulsor(b, t, 1, 0); repulsor(b, t, 1, 0); })), ["floor.duplicate"], "two along one edge is one too many");
    eq(codes(board(4, 2, (b, t) => { repulsor(b, t, 1, 0); b.floorDevices.push({ kind: "repulsor", c: 1, r: 0, face: S }); })), [], "two at a corner is how a board prints one");
    eq(codes(board(4, 2, (b, t) => { t.setCell(1, 0, "b>."); repulsor(b, t, 1, 0); })), [], "and it may lie over a belt");
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

  /* --- chop shops -----------------------------------------------------------
   * Turn & Burn under the 2016 book; nothing yet under the
   * classic one, whose chop shop needs ammunition cards that are not built. */
  ["a classic robot with no option card is given one at a chop shop", () => {
    const co = plain((b, t) => t.sites(3, 3, ["chopShop"]));
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    const p = st.players[0];
    give(st, p, 0, "left");
    runRegister(st, co.library);
    eq(p.options.length, 1, "one option card, free");
  }],
  ["a classic robot at a chop shop may scrap an option card for another", () => {
    const { st, co, p } = classicChop(1, ["brakes"]);
    runRegister(st, co.library);
    eq(p.options.length, 1, "still one card");
    assert(p.options[0].id !== "brakes" && st.optionDiscard.includes("brakes"), "Brakes scrapped, another drawn");
  }],
  ["a classic robot at a chop shop may refill an option card's payload", () => {
    const { st, co, p } = classicChop(2, ["turboBlaster"]);
    p.options[0].st.charges = 1;
    runRegister(st, co.library);
    eq(p.options[0].st.charges, 5, "the Turbo Blaster is full again");
  }],
  ["a classic chop shop offers no refill when nothing is short of payload", () => {
    const { st, co, p } = classicChop(undefined, ["turboBlaster", "brakes"]);
    st.phase = "exec"; st.register = 0;
    eq(chopShopPass(st, co.C).options, [0, 1], "leave it, or scrap: the Turbo Blaster is full");
    p.options[0].st.charges = 0;
    eq(chopShopPass(st, co.C).options, [0, 1, 2], "empty, it may be refilled");
  }],
  ["a classic robot may leave a chop shop alone", () => {
    const { st, co, p } = classicChop(0, ["brakes"]);
    runRegister(st, co.library);
    eq(p.options.map(o => o.id), ["brakes"], "nothing changed");
  }],
  ["a 2016 robot that ends a register on a chop shop may take an Energy", () => {
    const { st, co, p } = chop(0);
    const e = p.energy;
    runRegister(st, co.library);
    eq(p.energy, e + 1, "one Energy");
  }],
  ["a 2016 robot that ends a register on a chop shop may draw an upgrade card", () => {
    const { st, co, p } = chop(1);
    const top = st.upgradeDeck[st.upgradeDeck.length - 1], shelf = p.shelf.length, e = p.energy;
    runRegister(st, co.library);
    eq([p.shelf.length, p.shelf[p.shelf.length - 1], p.energy], [shelf + 1, top, e], "the top card, uninstalled, and nothing paid for it");
  }],
  ["a 2016 robot on a chop shop may scrap a permanent upgrade and install the top card free", () => {
    const perm = Object.keys(UPGRADE_DEFS).find(id => UPGRADE_DEFS[id].type === "permanent");
    const { st, co, p } = chop(2, q => q.installed.push(newInstalled(perm)));
    st.upgradeDeck = st.upgradeDeck.filter(id => id !== perm);
    const top = st.upgradeDeck[st.upgradeDeck.length - 1], e = p.energy;
    runRegister(st, co.library);
    assert(!p.installed.some(u => u.id === perm), "the old card is gone");
    assert(st.upgradeDiscard.includes(perm), "to the upgrade discard");
    assert(p.installed.some(u => u.id === top) || p.shelf.includes(top), "and the top card is its own");
    if (UPGRADE_DEFS[top].type === "permanent") assert(p.installed.some(u => u.id === top), "a permanent goes into the slot just freed");
    eq(p.energy, e, "at no cost");
  }],
  ["a chop shop offers no scrap to a robot with no permanent upgrade", () => {
    const co = plain((b, t) => t.sites(3, 3, ["chopShop"]));
    const st = game(co, [{ c: 3, r: 3, face: N }], { ruleset: "modern" });
    const p = st.players[0];
    p.installed = p.installed.filter(u => UPGRADE_DEFS[u.id].type !== "permanent");
    st.register = 0; st.phase = "exec";
    const ask = chopShopPass(st, co.C);
    eq(ask && ask.options, [0, 1], "an Energy or a draw, and nothing to scrap");
  }],
  ["a shut-down robot on a chop shop takes nothing", () => {
    const { st, co, p } = chop(0);
    p.poweredDown = true;
    const e = p.energy;
    st.phase = "exec"; chopShopPass(st, co.C);
    eq(p.energy, e, "down, it collects nothing");
  }],

  /* --- Turn & Burn's upgrades ------------------------ */
  ["Slow Processor: a robot carrying it moves one square fewer on a Move 2 or a Move 3", () => {
    for (const [kind, want] of [["move1", 3], ["move2", 3], ["move3", 4]]) {
      const co = plain();
      const st = game(co, [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
      const p = st.players[0];
      onto(st, "slowProcessor", 1, 0);
      put(st, p, 0, kind);
      runRegister(st, co.library);
      eq(p.c, want, kind + ": to column " + want);
    }
  }],
  ["Slow Processor comes off when its robot reboots, reaches a checkpoint or shuts down", () => {
    /* a reboot, into a pit */
    let co = plain((b, t) => t.setCell(3, 3, "o.."));
    let st = game(co, [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    onto(st, "slowProcessor", 1, 0);
    put(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    assert(!carries(st.players[0], "slowProcessor") && st.upgradeDiscard.includes("slowProcessor"), "gone at the reboot");
    /* a checkpoint */
    co = courseOn(board(8, 8), [[4, 3], [7, 7]]);
    st = game(co, [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    onto(st, "slowProcessor", 1, 0);
    put(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].flags], [4, 1], "slowed to the checkpoint, and it counts");
    assert(!carries(st.players[0], "slowProcessor"), "gone at the checkpoint");
    /* a shutdown */
    st = game(plain(), [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    onto(st, "slowProcessor", 1, 0);
    shutdown(st, st.players[0]);
    assert(!carries(st.players[0], "slowProcessor"), "gone at the shutdown");
  }],
  ["a card installed onto another robot takes no slot there, and that robot cannot take it off", () => {
    const st = game(plain(), [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    const [p, q] = st.players;
    const before = installedOfType(q, "permanent");
    p.shelf.push(...take(st, "slowProcessor")); p.energy = 5;
    assert(installUpgrade(st, p, "slowProcessor", q.id), "installed");
    assert(carries(q, "slowProcessor") && !carries(p, "slowProcessor"), "on the other robot's mat");
    eq([installedOfType(q, "permanent"), p.energy], [before, 2], "no slot taken, and the installer paid");
    assert(!removable(q).includes("slowProcessor"), "not the carrier's to take off");
  }],
  ["Bad Scanner: the next checkpoint its robot would reach, it does not, and the card comes off", () => {
    const co = courseOn(board(8, 8), [[3, 3], [7, 7]]);
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    const p = st.players[0];
    onto(st, "badScanner", 1, 0);
    put(st, p, 0, "move1"); put(st, p, 1, "left");
    runRegister(st, co.library);
    eq([p.c, p.flags], [3, 0], "on the checkpoint, and not reached");
    assert(!carries(p, "badScanner"), "the card is off");
    st.register = 1;
    runRegister(st, co.library);
    eq(p.flags, 1, "reached at the next register's end");
  }],
  ["Field Stabilizer: a repulsor field throws its robot one square less", () => {
    const co = plain((b, t) => repulsor(b, t, 4, 3));
    const st = game(co, [{ c: 3, r: 3, face: E }], { ruleset: "modern" });
    const p = st.players[0];
    p.installed.push(newInstalled(take(st, "fieldStabilizer")[0]));
    put(st, p, 0, "move3");
    runRegister(st, co.library);
    eq(p.c, 2, "to the field, then two back rather than three");
  }],
  ["Pit Trap Dance: a robot holding it crosses a pit in the register it would fall, and spends the card", () => {
    const co = plain((b, t) => t.setCell(3, 3, "o.."));
    const st = game(co, [{ c: 2, r: 3, face: E }], { ruleset: "modern" });
    const p = st.players[0];
    p.installed.push(newInstalled(take(st, "pitTrapDance")[0]));
    put(st, p, 0, "move2");
    runRegister(st, co.library);
    eq([p.c, p.alive], [4, true], "over the pit and beyond");
    assert(!carries(p, "pitTrapDance"), "and the card is spent");
  }],
  ["Pit Trap Dance lasts the register: a robot it leaves standing over a pit falls as the register ends", () => {
    const co = plain((b, t) => t.setCell(3, 3, "o.."));
    const st = game(co, [{ c: 2, r: 3, face: E }], { ruleset: "modern" });
    const p = st.players[0];
    p.installed.push(newInstalled(take(st, "pitTrapDance")[0]));
    put(st, p, 0, "move1");
    runRegister(st, co.library);
    assert(!p.alive && p.rebooting, "the dance over, it falls");
  }],
  ["Pit Trap Dance spares a robot on a trap door pit that activates", () => {
    const co = plain(b => trapDoor(b, 3, 3, [1]));
    const st = game(co, [{ c: 3, r: 3, face: E }], { ruleset: "modern" });
    const p = st.players[0];
    p.installed.push(newInstalled(take(st, "pitTrapDance")[0]));
    put(st, p, 0, "move1");
    runRegister(st, co.library);
    eq([p.c, p.alive], [4, true], "it danced off the open door");
  }],
  ["Fireworks: the first time in a round, 1 Energy makes any robot draw a damage card", () => {
    /* a chop shop somewhere on the course, or Fireworks is not in the deck */
    const co = courseOn(board(8, 8, (b, t) => t.sites(7, 0, ["chopShop"])), [[3, 3], [7, 7]]);
    const st = game(co, [{ c: 3, r: 3, face: N }, { c: 0, r: 0, face: S }], { ruleset: "modern" });
    const [p, q] = st.players;
    p.installed.push(newInstalled(take(st, "fireworks")[0]));
    p.flags = 1;                                        // an old checkpoint still counts for the fireworks
    put(st, p, 0, "left"); put(st, p, 1, "left");
    const e = p.energy, hurt = q.pile.length;
    st.answers[st.turn + ":fireworks:" + p.id] = 2;     // the second robot on the list: q
    runRegister(st, co.library);
    eq([p.energy, q.pile.length], [e - 1, hurt + 1], "one Energy, one damage card for the other robot");
    st.register = 1;
    runRegister(st, co.library);
    eq(q.pile.length, hurt + 1, "once a round: register 2 on the same checkpoint sets off nothing");
  }],
  ["an upgrade about a chop shop is only in the deck on a course that prints one", () => {
    const on = st => st.upgradeRoster.includes("fireworks") && st.upgradeDeck.concat(...st.players.map(p => p.shelf)).includes("fireworks");
    const bare = courseOn(board(8, 8));
    eq(on(game(bare, [{ c: 0, r: 0 }], { ruleset: "modern" })), false, "no chop shop: no Fireworks, in the deck or dealt");
    const shop = courseOn(board(8, 8, (b, t) => t.sites(5, 5, ["chopShop"])));
    eq(on(game(shop, [{ c: 0, r: 0 }], { ruleset: "modern" })), true, "one chop shop: Fireworks is in the game");
    const st = game(bare, [{ c: 0, r: 0 }], { ruleset: "modern" });
    eq(st.upgradeRoster.length, UPGRADE_IDS.length - 1, "every other card is still dealt");
  }]
];



