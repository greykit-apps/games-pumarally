/* The 2016 rules, one scenario each, named as the old suite named them. Read
 * off the 2023-printing rulebook (manual1/IMG_1254 to IMG_1269) and its
 * reference card (IMG_1252, IMG_1253); the deck composition off IMG_1308.
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, give, runRegister, drive, rebuild, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, damage, destroy, heldDamage, checkpointPass } from "../../engine/rules.js";
import { CLASSIC_ORDER, MODERN_ORDER, tick, step, shutdown } from "../../engine/machine.js";
import { newGame, MODERN_REBOOT_POINT, MODERN_FIRST_PRIORITY, priorityOrder } from "../../engine/state.js";
import {
  MODERN_DECK, MODERN_DAMAGE, MODERN_CARDS, MODERN_DECK_SIZE, MODERN_DAMAGE_SIZE, MODERN_DAMAGE_FIRST,
  CARDS, KINDS, card, isDamage, START_ENERGY, MAX_ENERGY, HAND
} from "../../engine/cards.js";
import { UPGRADE_DEFS, UPGRADE_IDS, UPGRADE_ROSTER, drawUpgrade, buyUpgrade, canInstall, installUpgrade, uninstallUpgrade, newInstalled } from "../../engine/upgrades.js";
import { fire } from "../../engine/options.js";
import { assertInvariants, runGame } from "../../engine/sim.js";
import { botWantsShutdown, bestFacing, botUpgrade, botAnswer, randomAnswer } from "../../engine/bots.js";
import { rulesetsFor } from "../../engine/library.js";
import { rulesetFor } from "../../../editor/rulesets/index.js";
import { setWall } from "../../../editor/lib/edges.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };
const throws = (fn, re, msg) => { let m = null; try { fn(); } catch (e) { m = e.message; } assert(m !== null && (!re || re.test(m)), msg + (m === null ? " (nothing was thrown)" : " (threw: " + m + ")")); };

const plain = edit => courseOn(board(8, 8, edit));
/* the same floor with the flag in the far corner, for tests that run whole rounds */
const far = edit => courseOn(board(8, 8, edit), [[7, 0]]);
/** A 2016 game, parked at the top of register 1. */
const mgame = (co, places, opts) => game(co, places, { ...(opts || {}), ruleset: "modern" });
/** Take a card of `kind` out of a robot's own deck: the caller now holds it, so the twenty still balance. */
function own(st, p, kind) {
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " left in the deck");
  return p.deck.splice(i, 1)[0];
}
const spam = st => { const i = st.damageDeck.pop(); if (i === undefined) throw new Error("no damage card left"); return i; };
const shelve = (st, p, id) => {
  const i = st.upgradeDeck.indexOf(id);
  if (i >= 0) st.upgradeDeck.splice(i, 1);
  else {
    const holder = st.players.find(q => q.shelf.includes(id));       // dealt to a shelf at setup
    if (!holder) throw new Error(id + " is nowhere to be found");
    holder.shelf.splice(holder.shelf.indexOf(id), 1);
  }
  p.shelf.push(id);
};
/** Drive until a given seat is asked something, answering everyone else as a bot; returns the request. */
function until(st, library, who, kinds, answer) {
  let r = step(st, library, answer);
  for (let guard = 0; guard < 500 && !st.over; guard++) {
    const w = r.waiting;
    if (!w) return null;
    if (w.player === who && (!kinds || kinds.includes(w.kind))) return w;
    r = step(st, library, botAnswer(st, library, w));
  }
  return null;
}

export const TESTS = [
  /* --- the cards ------------------------------------------------------------ */
  ["a robot's deck is the twenty cards printed for it", () => {
    const want = { move1: 4, move2: 3, move3: 1, back: 1, left: 4, right: 4, uturn: 1, powerUp: 1, again: 1 };
    const got = {};
    for (const cd of MODERN_DECK) { got[cd.kind] = (got[cd.kind] || 0) + 1; assert(!cd.pri, "a 2016 card carries a priority number"); }
    eq(got, want, "the twenty, as laid out in the photograph");
    eq(MODERN_DECK.length, MODERN_DECK_SIZE, "twenty cards");
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }]);
    for (const p of st.players) {
      eq(p.deck.length, MODERN_DECK_SIZE, p.name + " was dealt its own twenty");
      eq(new Set(p.deck).size, MODERN_DECK_SIZE, "all different");
    }
    eq(st.deck.length + st.discard.length, 0, "the shared pile is empty in a 2016 game");
    assertInvariants(st, co.library);
  }],
  ["Power Up takes a cube, and Again repeats the register before it", () => {
    const co = plain();
    let st = mgame(co, [{ c: 0, r: 3, face: E }]);
    let p = st.players[0];
    p.registers[0] = own(st, p, "powerUp");
    runRegister(st, co.library);
    eq([p.energy, p.c], [START_ENERGY + 1, 0], "Power Up takes one cube and the robot stays put");
    p.energy = MAX_ENERGY;
    st.register = 0;                                   // the Power Up is still in register 1
    runRegister(st, co.library);
    eq(p.energy, MAX_ENERGY, "never past the end of the track");

    /* Again repeats the register before it */
    st = mgame(co, [{ c: 0, r: 3, face: E }]); p = st.players[0];
    p.registers[0] = own(st, p, "move2"); p.registers[1] = own(st, p, "again");
    runRegister(st, co.library); runRegister(st, co.library);
    eq(p.c, 4, "a Move 2 and then Again again: four squares");

    /* the deck prints one Again, so two in a row cannot happen; what can is
     * an Again after a SPAM, which repeats the card the SPAM drew */
    st = mgame(co, [{ c: 0, r: 3, face: E }]); p = st.players[0];
    p.registers[0] = spam(st); p.registers[1] = own(st, p, "again");
    p.deck.push(own(st, p, "move2"));
    runRegister(st, co.library); runRegister(st, co.library);
    eq(p.c, 4, "SPAM drew a Move 2, and Again repeated the Move 2");

    /* "An Again card in Register 1 acts like SPAM": discarded to your own
     * pile and replaced with the top card of your deck */
    st = mgame(co, [{ c: 0, r: 3, face: E }]); p = st.players[0];
    const again = own(st, p, "again"), top = own(st, p, "left");
    p.registers[0] = again; p.deck.push(top);
    runRegister(st, co.library);
    eq(p.face, N, "the top of the deck, a Rotate Left, was played instead");
    assert(p.pile.includes(again), "the Again went to the robot's own discard");
    assert(!st.damageDiscard.includes(again), "and not to the table's");
  }],
  ["the Priority Token decides who acts, and moves one seat a round", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }]);
    for (const p of st.players) { p.registers[0] = own(st, p, "move1"); p.registers[3] = own(st, p, "move1"); }
    st.priority = 2; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library);
    eq(st.queue, [2, 3, 0, 1], "the order starts at the token and goes one seat at a time");
    st.register = 3; st.step = "reveal";
    tick(st, co.library);
    eq(st.queue, [2, 3, 0, 1], "the same order in every register: it comes from the token, not the cards");
    st.phase = "cleanup"; st.step = "endRound"; tick(st, co.library);
    eq(st.priority, 3, "the token moved one seat");
    st.phase = "cleanup"; st.step = "endRound"; tick(st, co.library);
    st.phase = "cleanup"; st.step = "endRound"; tick(st, co.library);
    eq(st.priority, 1, "and wraps round the table");
    eq(priorityOrder(st).map(p => p.id), [1, 2, 3, 0], "the order round the table from the token");
    /* the classic game still reads the cards */
    const cst = game(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    give(cst, cst.players[0], 0, "uturn", 10); give(cst, cst.players[1], 0, "move3", 840);
    cst.step = "reveal"; tick(cst, co.library);
    eq(cst.queue, [1, 0], "the classic order comes from the printed priority");
  }],
  ["the Priority Token starts with seat 1, a declared substitute for the youngest player", () => {
    eq(MODERN_FIRST_PRIORITY, "seat 1", "the substitute is named");
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }]);
    eq(st.priority, 0, "the token starts with the first seat");
    /* and the draft places bays in that order, no priority cards drawn */
    st.phase = "draft"; st.step = "draw"; tick(st, co.library);
    eq(st.draft.order, [0, 1, 2], "bays are chosen from the token round the table");
    eq(st.deck.length, 0, "no priority card was drawn");
  }],

  /* --- shutting down ---------------------------------------------------------- */
  ["shutting down scraps the damage you are holding, and not the damage in your deck", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    p.registers = [own(st, p, "move1"), spam(st), null, null, null];
    p.hand = [own(st, p, "left"), spam(st), spam(st)];
    p.pile = [own(st, p, "right"), spam(st)];
    const inDeck = spam(st);
    p.deck.push(inDeck);
    const before = st.damageDiscard.length;
    shutdown(st, p);
    assert(p.poweredDown, "the robot shut down");
    eq(st.damageDiscard.length - before, 4, "four damage cards were held and went back to the table");
    eq(p.hand.length, 0, "the hand was put down");
    for (let i = 0; i < 5; i++) eq(p.registers[i], null, "register " + (i + 1) + " emptied");
    eq(p.pile.length, 3, "the three real cards are in its own discard, and nothing else");
    for (const i of p.pile) assert(!isDamage(st, i), "no damage card was left in the robot's discard");
    assert(p.deck.includes(inDeck), "the deck is untouched: SPAM already shuffled in is still coming round");
    assertInvariants(st, co.library);
  }],
  ["a bot shuts down for the damage it is holding, not the damage in its deck", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3, skill: 2 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    assert(!botWantsShutdown(st, p), "a bot holding nothing wanted to shut down");
    for (let i = 0; i < 5; i++) p.pile.push(spam(st));
    assert(!botWantsShutdown(st, p), "five is not enough; six is the threshold");
    p.hand.push(spam(st));
    assert(botWantsShutdown(st, p), "six in hand and discard together");
    eq(heldDamage(st, p), 6, "counted where a shutdown can reach");
    /* the same six moved into the deck are no reason to spend a round */
    p.deck = p.deck.concat(p.hand, p.pile.filter(i => isDamage(st, i)));
    p.pile = p.pile.filter(i => !isDamage(st, i)); p.hand = [];
    assert(!botWantsShutdown(st, p), "a shutdown cannot reach the deck");
    /* the lowest tier never does, however convincing the hand */
    while (p.hand.length < 12) p.hand.push(spam(st));
    p.skill = 1; assert(botWantsShutdown(st, p), "twelve convinces the middle tier");
    p.skill = 0; assert(!botWantsShutdown(st, p), "the lowest tier never shuts down");
  }],
  ["a 2016 shutdown is declared for the round you are in, and lasts one round", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human", face: E }, { c: 1, r: 7, face: N }]);
    const me = st.players[0];
    st.phase = "turn"; st.step = "upgrade";
    /* through the door: shop (nothing), program, then the question */
    let w = until(st, co.library, 0, ["upgrade"]);
    if (w) w = until(st, co.library, 0, ["program"], { buy: false, install: null, uninstall: [] });
    else w = until(st, co.library, 0, ["program"]);
    assert(w && w.kind === "program", "the person is asked to program");
    w = until(st, co.library, 0, ["shutdown"], w.options.slice(0, w.count));
    assert(w && w.kind === "shutdown", "asked after programming, before any reveal");
    const kinds = [];
    let r = step(st, co.library, true);
    assert(me.poweredDown, "the declaration took effect this round");
    eq(me.hand.length + me.registers.filter(x => x !== null).length, 0, "a shut-down robot put its programme down");
    const c0 = me.c;
    const turn = st.turn;
    for (let guard = 0; guard < 300 && st.turn === turn && !st.over; guard++) {
      if (!r.waiting) break;
      kinds.push(r.waiting.kind);
      r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    }
    eq(me.c, c0, "the robot resolved no cards this round");
    assert(!kinds.includes("stayDown"), "nobody is asked whether to stay down: there is no repair to stay down for");
    assert(!me.poweredDown, "the shutdown outlasted its round");
  }],
  ["shutting down is the other way to be rid of SPAM", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    const sp = spam(st), mine = own(st, p, "move1");
    p.hand = [sp, mine];
    shutdown(st, p);
    assert(st.damageDiscard.includes(sp), "the shed SPAM reached the damage discard");
    assert(p.pile.includes(mine), "the robot's own card reached its own discard");
    assertInvariants(st, co.library);
  }],

  /* --- rebooting -------------------------------------------------------------- */
  ["a 2016 robot does not die, it reboots", () => {
    const co = plain((b, t) => t.setCell(1, 3, "o.."));
    const st = mgame(co, [{ c: 0, r: 3, face: E }, { c: 5, r: 5 }]);
    const p = st.players[0];
    shelve(st, p, "firewall");
    p.registers = [own(st, p, "move1"), own(st, p, "left"), own(st, p, "right"), null, null];
    p.hand = [own(st, p, "move2")];
    const lives = p.lives, dmgBefore = st.damageDeck.length;
    stepRobot(st, co.C, p, E, "card");
    assert(!p.alive, "the robot is off the board");
    assert(p.rebooting, "and marked as coming back");
    assert(!p.out, "a 2016 robot is never out of the race");
    eq(p.lives, lives, "no life was spent: this edition has none to spend");
    eq(p.shelf.length, 4, "every upgrade stays, uninstalled ones included");
    for (let r = 0; r < 5; r++) eq(p.registers[r], null, "register " + (r + 1) + " was cancelled");
    eq(p.hand.length, 0, "the hand was cancelled");
    let mine = 0, sp = 0;
    for (const i of p.pile) (isDamage(st, i) ? sp++ : mine++);
    eq(mine, 4, "the four cancelled cards are in its own discard");
    eq(sp, 2, "and so are the two SPAM the reboot drew");
    eq(st.damageDeck.length, dmgBefore - 2, "two damage cards, one at a time");
    assertInvariants(st, co.library);
    /* the classic game still destroys, and still spends a life */
    const cst = game(co, [{ c: 0, r: 3, face: E }, { c: 5, r: 5 }]);
    stepRobot(cst, co.C, cst.players[0], E, "card");
    assert(!cst.players[0].alive && !cst.players[0].rebooting && cst.players[0].lives === 2, "a classic wreck costs a life");
  }],
  ["a rebooting robot's SPAM stays with it, in its own discard", () => {
    /* p.19: "SPAM cards in your registers are discarded to your discard
     * pile" -- not the table's. The old engine sent them back to the table. */
    const co = plain((b, t) => t.setCell(1, 3, "o.."));
    const st = mgame(co, [{ c: 0, r: 3, face: E }, { c: 5, r: 5 }]);
    const p = st.players[0];
    const inReg = spam(st), inHand = spam(st);
    p.registers = [own(st, p, "move1"), inReg, null, null, null];
    p.hand = [inHand];
    const tableBefore = st.damageDiscard.length;
    stepRobot(st, co.C, p, E, "card");
    assert(p.pile.includes(inReg) && p.pile.includes(inHand), "both SPAM are in the robot's own discard");
    eq(st.damageDiscard.length, tableBefore, "nothing went back to the table");
    assertInvariants(st, co.library);
  }],
  ["a rebooting robot is dealt a hand and programs from off the board", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3, seat: "human" }, { c: 1, r: 3 }]);
    const p = st.players[0];
    p.alive = false; p.rebooting = true;
    st.phase = "turn"; st.step = "upgrade";
    let w = until(st, co.library, 0, ["upgrade", "program"]);
    if (w.kind === "upgrade") w = until(st, co.library, 0, ["program"], { buy: false, install: null, uninstall: [] });
    assert(w && w.kind === "program", "a rebooting robot is asked to program");
    eq(p.hand.length, HAND, "it was dealt a full hand");
    assert(!p.alive, "the deal did not put it back on the board");
    step(st, co.library, w.options.slice(0, w.count));
    eq(p.registers.filter(x => x !== null).length, 5, "and it filled its registers");
    assert(!p.alive, "programming did not put it back either");
  }],
  ["a rebooting robot walks back on at register 1 and then plays it", () => {
    const co = plain();
    const st = mgame(co, [{ c: 3, r: 3 }, { c: 3, r: 5 }]);
    const p = st.players[0];
    p.archive = { c: 0, r: 3, face: E };
    p.alive = false; p.rebooting = true;
    p.registers[0] = own(st, p, "move1");
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library);
    assert(st.queue.includes(0), "a rebooting robot is in the register 1 order, so it has a moment to return in");
    tick(st, co.library);
    assert(st.waiting && st.waiting.kind === "rebootFacing" && st.waiting.player === 0, "it is asked which way to face");
    const r = step(st, co.library, E);
    assert(p.alive && !p.rebooting, "the robot came back");
    eq([p.c, p.r, p.face], [1, 3, E], "landed at its reboot point facing east, then played its Move 1");
    assert(r.events.some(e => e.type === "rebooted"), "the return is an event");
  }],
  /* --- reboot tokens (pp.15, 20, 30) -------------------------------------------- */
  ["a robot reboots on the Reboot Token of the board it fell from", () => {
    const co = plain();
    co.doc.reboots = [[6, 6, N]];
    rebuild(co);
    const st = mgame(co, [{ c: 3, r: 0, face: N }, { c: 1, r: 5 }]);
    const p = st.players[0];
    p.archive = { c: 0, r: 7, face: E };
    stepRobot(st, co.C, p, N, "card");
    assert(!p.alive && p.rebooting, "over the north edge");
    eq(p.fellFrom, 0, "it remembers the board it fell from");
    p.registers[0] = own(st, p, "move1");
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    assert(st.waiting && st.waiting.kind === "rebootFacing", "asked which way to face");
    step(st, co.library, N);
    eq([p.c, p.r, p.face], [6, 5, N], "landed on the token at (6,6) facing north, then played its Move 1");
  }],
  ["a robot with no token on its board reboots at its archive", () => {
    const co = plain();
    co.doc.reboots = [[6, 6, N]];
    rebuild(co);
    const st = mgame(co, [{ c: 3, r: 3 }, { c: 1, r: 5 }]);
    const p = st.players[0];
    p.archive = { c: 0, r: 7, face: E };
    p.alive = false; p.rebooting = true; p.fellFrom = 1;        // the docking bay, say: no token there
    p.registers[0] = own(st, p, "left");
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    step(st, co.library, E);
    eq([p.c, p.r], [0, 7], "back at its archive");
  }],
  ["a robot standing on the Reboot Token is moved along its arrow", () => {
    const co = plain();
    co.doc.reboots = [[4, 4, E]];
    rebuild(co);
    const st = mgame(co, [{ c: 3, r: 0 }, { c: 4, r: 4, face: N }]);
    const p = st.players[0], q = st.players[1];
    p.alive = false; p.rebooting = true; p.fellFrom = 0;
    p.registers[0] = own(st, p, "left");
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    step(st, co.library, S);
    eq([p.c, p.r], [4, 4], "the returning robot has the token");
    eq([q.c, q.r, q.face], [5, 4, N], "the occupant was moved one square east, the arrow's way, without turning");
  }],
  ["a course with tokens keeps the 2016 archive on the docking bay", () => {
    const co = courseOn(board(8, 8), [[3, 3]]);
    co.doc.reboots = [[6, 6, N]];
    rebuild(co);
    const st = mgame(co, [{ c: 3, r: 3 }]);
    const p = st.players[0];
    p.archive = { c: 0, r: 7, face: N };
    checkpointPass(st, co.C);
    eq(p.flags, 1, "the checkpoint was reached");
    eq([p.archive.c, p.archive.r], [0, 7], "and the archive did not move: a faller reboots on a token, not here");
    /* without tokens the substitute still follows the checkpoints */
    const co2 = courseOn(board(8, 8), [[3, 3]]);
    const st2 = mgame(co2, [{ c: 3, r: 3 }]);
    st2.players[0].archive = { c: 0, r: 7, face: N };
    checkpointPass(st2, co2.C);
    eq([st2.players[0].archive.c, st2.players[0].archive.r], [3, 3], "the substitute archives at the checkpoint");
  }],
  ["Cry Havoc: a reboot draws three damage cards instead of two", () => {
    const co = plain((b, t) => t.setCell(1, 3, "o.."));
    co.doc.rebootDamage = 3;
    rebuild(co);
    const st = mgame(co, [{ c: 0, r: 3, face: E }, { c: 5, r: 5 }]);
    const p = st.players[0];
    const before = st.damageDeck.length;
    stepRobot(st, co.C, p, E, "card");
    assert(!p.alive && p.rebooting, "into the pit");
    eq(st.damageDeck.length, before - 3, "three damage cards drawn");
  }],
  ["a rebooting player can still work their own controls", () => {
    /* the lock-up the old game had: a person whose robot was off the board
     * had live buttons that answered nothing. Here the machine asks that
     * person through the same door as everyone, and waits. */
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human" }, { c: 1, r: 7 }]);
    const me = st.players[0];
    me.alive = false; me.rebooting = true; me.archive = { c: 0, r: 7, face: E };
    st.phase = "turn"; st.step = "upgrade";
    shelve(st, me, "firewall"); me.energy = 3;
    const asked = [];
    let w = until(st, co.library, 0);
    for (let guard = 0; guard < 20 && w && !me.alive; guard++) {
      asked.push(w.kind);
      const a = w.kind === "upgrade" ? { buy: false, install: "firewall", uninstall: [] } : w.kind === "program" ? w.options.slice(0, w.count) : botAnswer(st, co.library, w);
      w = until(st, co.library, 0, null, a);
    }
    assert(asked.includes("upgrade"), "asked to shop: " + asked.join(","));
    assert(asked.includes("program"), "asked to program: " + asked.join(","));
    assert(asked.includes("rebootFacing"), "asked which way to face: " + asked.join(","));
    assert(me.installed.some(u => u.id === "firewall"), "the shop worked from off the board");
    assert(me.alive, "and the robot is back");
  }],
  ["the person whose robot is rebooting is the one who picks its facing", () => {
    const co = plain();
    const st = mgame(co, [{ c: 3, r: 3 }, { c: 3, r: 5, seat: "human" }]);
    const p = st.players[1];
    p.archive = { c: 0, r: 3, face: E }; p.alive = false; p.rebooting = true;
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    const w = until(st, co.library, 1, ["rebootFacing"]);
    assert(w && w.player === 1, "the question goes to the rebooting robot's seat");
    eq(w.options, [0, 1, 2, 3], "any of the four ways");
    step(st, co.library, W);
    eq(p.face, W, "and the answer is the facing it lands with");
  }],
  ["a bot comes back facing the way the flag is", () => {
    let co = courseOn(board(6, 6), [[5, 0]]);
    let st = mgame(co, [{ c: 0, r: 0 }]);
    let p = st.players[0]; p.archive = { c: 0, r: 0, face: N }; p.alive = false; p.rebooting = true; p.flags = 0;
    eq(bestFacing(st, co.C, p), E, "the flag is due east");
    eq(botAnswer(st, co.library, { player: 0, kind: "rebootFacing", options: [0, 1, 2, 3] }), E, "and the bot answers the question with it");
    co = courseOn(board(6, 6), [[0, 4]]);
    st = mgame(co, [{ c: 0, r: 0 }]); p = st.players[0]; p.archive = { c: 0, r: 0, face: N }; p.alive = false; p.rebooting = true;
    eq(bestFacing(st, co.C, p), S, "the flag is due south");
    /* the flag it is going for, not the first one */
    co = courseOn(board(6, 6), [[0, 4], [4, 0]]);
    st = mgame(co, [{ c: 4, r: 4 }]); p = st.players[0]; p.archive = { c: 4, r: 4, face: S }; p.alive = false; p.rebooting = true; p.flags = 1;
    eq(bestFacing(st, co.C, p), N, "with flag 1 taken it faces flag 2");
  }],
  ["a robot standing on the reboot square is shoved aside, and that is not a push", () => {
    const co = plain();
    const st = mgame(co, [{ c: 5, r: 5 }, { c: 0, r: 3 }]);
    const p = st.players[0], sitting = st.players[1];
    p.archive = { c: 0, r: 3, face: E }; p.alive = false; p.rebooting = true;
    p.installed.push(newInstalled("rammingGear")); st.upgradeDeck.splice(st.upgradeDeck.indexOf("rammingGear"), 1);
    const pileBefore = sitting.pile.length;
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    const r = step(st, co.library, N);
    eq([sitting.c, sitting.r], [1, 3], "the occupant was moved one square along the arrow");
    eq([p.c, p.r], [0, 3], "and the returning robot stands on the square");
    eq(sitting.pile.length, pileBefore, "Ramming Gear did not fire: moving the occupant is not a push");
    assert(r.events.some(e => e.type === "shoved" && e.cause === "reboot"), "an event of its own");
  }],
  ["making room for a returning robot never puts the occupant in a hole", () => {
    const co = plain((b, t) => t.setCell(1, 3, "o.."));
    const st = mgame(co, [{ c: 5, r: 5 }, { c: 0, r: 3 }]);
    const p = st.players[0], sitting = st.players[1];
    p.archive = { c: 0, r: 3, face: E }; p.alive = false; p.rebooting = true;
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    step(st, co.library, N);
    assert(sitting.alive, "the occupant survived");
    assert(!(sitting.c === 1 && sitting.r === 3), "and was not moved onto the pit");
    assert(p.alive && p.c === 0 && p.r === 3, "the returning robot is on its square");
    assert(!(p.c === sitting.c && p.r === sitting.r), "two robots are not on one square");
    assertInvariants(st, co.library);
  }],
  ["the 2016 reboot point is a declared substitute, not a silent one", () => {
    eq(MODERN_REBOOT_POINT, "archive", "the reboot point is the archive: if reboot tokens have been transcribed, landReboot and the README both need to follow");
    const co = plain();
    const st = mgame(co, [{ c: 5, r: 5 }]);
    const p = st.players[0];
    p.archive = { c: 2, r: 2, face: E }; p.alive = false; p.rebooting = true;
    st.priority = 0; st.register = 0; st.phase = "exec"; st.step = "reveal";
    tick(st, co.library); tick(st, co.library);
    step(st, co.library, N);
    eq([p.c, p.r], [2, 2], "the robot re-entered at its archive, which is the substitute this constant declares");
  }],

  /* --- upgrades ---------------------------------------------------------------- */
  ["the upgrade deck is forty cards, all of them written down", () => {
    eq(UPGRADE_IDS.length, 58, "the base forty and eighteen more: thirteen expansion cards and Master Builder's five");
    eq([UPGRADE_ROSTER.printed, UPGRADE_ROSTER.transcribed, UPGRADE_ROSTER.built], [58, 58, 58], "the roster: all of them, since the Haywire faces were photographed");
    let built = 0;
    for (const id of UPGRADE_IDS) {
      const d = UPGRADE_DEFS[id];
      assert(d.name && d.text && Number.isInteger(d.cost) && /^(permanent|temporary)$/.test(d.type), id + " has name, text, cost and type");
      if (d.built) { built++; assert(Object.keys(d.hooks).length || d.use || d.ruled, id + " is built and binds a hook or a use, or the rules read it by name"); }
      else { eq(Object.keys(d.hooks), [], id + " is inert and binds nothing"); assert(d.inert, id + " says why"); }
    }
    eq(built, 58, "all built");
  }],
  ["three upgrades are dealt at setup, and the forty are conserved", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }]);
    for (const p of st.players) eq(p.shelf.length, 3, p.name + " holds three, uninstalled");
    eq(st.upgradeDeck.length, UPGRADE_IDS.length - 9, "the rest are the deck");
    assertInvariants(st, co.library);
  }],
  ["fitting an upgrade costs its printed Energy and takes a slot", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    p.shelf = []; st.upgradeDeck = UPGRADE_IDS.slice(); st.upgradeDiscard = [];
    for (const q of st.players) q.shelf = [];
    shelve(st, p, "firewall"); shelve(st, p, "crabLegs");
    p.energy = 3;
    assert(!installUpgrade(st, p, "hoverUnit"), "a card that was never on the shelf cannot be fitted");
    assert(!canInstall(p, "crabLegs"), "five Energy is more than it has");
    assert(installUpgrade(st, p, "firewall"), "the cheap card fits");
    assert(!p.shelf.includes("firewall") && p.installed.some(u => u.id === "firewall"), "off the shelf, onto the mat");
    eq(p.energy, 2, "the price was its printed one");
    assertInvariants(st, co.library);
    const before = st.upgradeDiscard.length;
    assert(uninstallUpgrade(st, p, "firewall"), "it comes out");
    eq(p.installed.length, 0, "off the mat");
    assert(!p.shelf.includes("firewall") && st.upgradeDiscard.length === before + 1, "to the discard, not the shelf, and no refund");
    eq(p.energy, 2, "no Energy back");
    assert(!uninstallUpgrade(st, p, "firewall"), "not twice");
    assertInvariants(st, co.library);
  }],
  ["the mat holds three of each kind and no more", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    for (const q of st.players) q.shelf = [];
    st.upgradeDeck = UPGRADE_IDS.slice();
    const perms = ["firewall", "laserKata", "hoverUnit", "brakes"], temps = ["recharge", "zoop", "boink", "magnetic"];
    for (const id of perms.concat(temps)) shelve(st, p, id);
    p.energy = MAX_ENERGY;
    for (let i = 0; i < 3; i++) { assert(installUpgrade(st, p, perms[i]), "permanent " + i + " fits"); p.energy = MAX_ENERGY; }
    assert(!canInstall(p, perms[3]) && !installUpgrade(st, p, perms[3]), "a fourth permanent does not");
    for (let i = 0; i < 3; i++) { assert(installUpgrade(st, p, temps[i]), "temporary " + i + " fits: its own three"); p.energy = MAX_ENERGY; }
    assert(!installUpgrade(st, p, temps[3]), "a fourth temporary does not");
    eq(p.installed.length, 6, "three and three");
    uninstallUpgrade(st, p, perms[0]);
    assert(installUpgrade(st, p, perms[3]), "taking one out makes room");
    assertInvariants(st, co.library);
  }],
  ["an installed upgrade fires through the same hooks an option card does", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    eq(fire(st, p, "modifyDealt", { count: 9 }).count, 9, "nothing fitted, nothing changed");
    shelve(st, p, "flashDrive"); p.energy = 9;
    installUpgrade(st, p, "flashDrive");
    eq(fire(st, p, "modifyDealt", { count: 9 }).count, 10, "the fitted upgrade reaches the hook it binds");
    st.phase = "turn"; st.step = "dealModern"; tick(st, co.library);
    eq(p.hand.length, HAND + 1, "and the real deal");
    uninstallUpgrade(st, p, "flashDrive");
    eq(fire(st, p, "modifyDealt", { count: 9 }).count, 9, "taken off the mat, it stops");
  }],
  ["a person shops for themselves, and the phase waits while they do", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human" }, { c: 1, r: 7 }]);
    const me = st.players[0];
    me.energy = 5;
    st.phase = "turn"; st.step = "upgrade";
    let w = until(st, co.library, 0, ["upgrade"]);
    assert(w && w.kind === "upgrade", "the person is asked");
    eq(w.options.buy, [false, true], "with a cube to spend, buying is on offer");
    const shelfBefore = me.shelf.length;
    w = until(st, co.library, 0, null, { buy: true, install: null, uninstall: [] });
    assert(w && w.kind === "upgrade", "having bought, the person is asked again so the new card can be fitted");
    eq(me.shelf.length, shelfBefore + 1, "the card is on the shelf");
    eq(me.energy, 4, "and paid for");
    eq(w.options.buy, [false], "but not a second draw");
    const fit = w.options.install.find(id => id !== null);
    if (fit) {
      w = until(st, co.library, 0, null, { buy: false, install: fit, uninstall: [] });
      assert(me.installed.some(u => u.id === fit), "fitted");
    } else w = until(st, co.library, 0, null, { buy: false, install: null, uninstall: [] });
    assert(!w || w.kind !== "upgrade", "then the phase moves on");
  }],
  ["a bot fits what it owns before it buys more, and keeps a cube back", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3, skill: 2 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    for (const q of st.players) q.shelf = [];
    st.upgradeDeck = UPGRADE_IDS.slice();
    shelve(st, p, "firewall");
    const req = () => ({ player: 0, kind: "upgrade", options: { buy: p.energy >= 1 ? [false, true] : [false], install: [null].concat(p.shelf.filter(id => canInstall(p, id))), uninstall: [] } });
    p.energy = 2;
    eq(botUpgrade(st, p, req()), { buy: false, install: "firewall", uninstall: [] }, "with two it fits the one-cost card and keeps a cube");
    p.energy = 1;
    eq(botUpgrade(st, p, req()), { buy: false, install: null, uninstall: [] }, "with one it neither fits (that would leave none) nor buys");
    p.shelf = []; p.energy = 5;
    eq(botUpgrade(st, p, req()), { buy: true, install: null, uninstall: [] }, "with nothing to fit and cubes to spare it buys");
    p.skill = 0;
    eq(botUpgrade(st, p, req()), { buy: false, install: null, uninstall: [] }, "the lowest tier never buys");
  }],
  ["the upgrade deck reshuffles, and runs out honestly", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    st.upgradeDiscard = st.upgradeDeck.splice(0, 3);
    const rest = st.upgradeDeck.splice(0);
    for (const q of st.players) q.shelf = q.shelf.concat(rest.splice(0, 0));
    st.upgradeDeck = [];
    p.shelf = p.shelf.concat(rest);                   // parked with a robot, so the forty balance
    const got = drawUpgrade(st);
    assert(got !== null && st.upgradeDiscard.length === 0, "the discard became the deck");
    st.upgradeDeck.push(got);
    while (st.upgradeDeck.length) p.shelf.push(st.upgradeDeck.pop());
    eq(drawUpgrade(st), null, "both empty: nothing to draw");
    p.energy = 3;
    assert(!buyUpgrade(st, p), "and buying is refused");
    eq(p.energy, 3, "for no charge");
    assertInvariants(st, co.library);
  }],

  /* --- damage ------------------------------------------------------------------ */
  ["the damage deck is forty cards, and what is on them is a declared gap", () => {
    /* the gap closed on 2026-09-15: the deck laid out (manual1/IMG_1343) is
     * twenty-three SPAM and seventeen Haywire, every face once */
    eq(MODERN_DAMAGE.length, MODERN_DAMAGE_SIZE, "forty");
    eq(MODERN_DAMAGE_SIZE, 40, "the printed forty");
    eq(CARDS.modern.damageCounts, { spam: 23, haywire: 17 }, "counted off the photograph");
    eq(new Set(MODERN_DAMAGE.filter(c => c.kind === "haywire").map(c => c.face)).size, 17, "seventeen different faces");
    for (const cd of MODERN_DAMAGE) assert(KINDS[cd.kind] && KINDS[cd.kind].damage, "every damage card is a damage kind");
    eq(MODERN_CARDS.length, MODERN_DECK_SIZE + MODERN_DAMAGE_SIZE, "one index space for both");
    const m = { ruleset: "modern" }, c = { ruleset: "classic" };
    assert(!isDamage(m, MODERN_DAMAGE_FIRST - 1) && isDamage(m, MODERN_DAMAGE_FIRST), "the boundary is where the deck ends");
    assert(!isDamage(c, MODERN_DAMAGE_FIRST), "the classic game has no damage cards");
  }],
  ["a 2016 hit hands you cards instead of ticking a track", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0], before = st.damageDeck.length;
    damage(st, co.C, p, 2, "laser");
    eq(p.damage, 0, "no track ticked");
    eq(p.pile.filter(i => isDamage(st, i)).length, 2, "two SPAM in the robot's own discard");
    eq(st.damageDeck.length, before - 2, "off the table's deck");
    eq(p.hand.length, 0, "not into the hand: you suffer SPAM when it comes round");
    assertInvariants(st, co.library);
    const cst = game(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    damage(cst, co.C, cst.players[0], 2, "laser");
    eq(cst.players[0].damage, 2, "the classic track still counts");
    eq(cst.damageDeck.length + cst.damageDiscard.length, 0, "and a classic game builds no damage deck");
  }],
  ["the damage deck reshuffles, and when it cannot you take no damage", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    /* the SPAM alone go through the reshuffle; the Haywires sit out of the game for this fixture */
    const all = st.damageDeck.splice(0);
    p.removed = all.filter(i => card(st, i).kind === "haywire");
    st.damageDiscard = all.filter(i => card(st, i).kind !== "haywire");
    damage(st, co.C, p, 3, "laser");
    eq(p.pile.length, 3, "the reshuffle produced cards");
    eq(st.damageDeck.length, 20, "the reshuffled deck: twenty-three SPAM less three");
    eq(st.damageDiscard.length, 0, "the discard emptied into it");
    /* both empty is a printed outcome, not a fault */
    p.pile = p.pile.concat(st.damageDeck.splice(0));   // every card sits with a robot
    const held = p.pile.length, said = st.log.length;
    damage(st, co.C, p, 2, "laser");
    eq(p.pile.length, held, "nothing dealt from an empty table");
    assert(st.log.length > said, "and it says so");
    /* a partial hit lands as far as it goes */
    st.damageDeck = [p.pile.pop()];
    damage(st, co.C, p, 3, "laser");
    eq(p.pile.length, held, "the one card left was dealt, the rest was not");
    assertInvariants(st, co.library);
  }],
  ["SPAM in a register throws itself away and plays your next card", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3, face: E }]);
    const p = st.players[0];
    const sp = spam(st), top = own(st, p, "move1");
    p.registers[0] = sp; p.deck.push(top);
    runRegister(st, co.library);
    eq(p.c, 1, "the replacement moved the robot");
    eq(st.damageDiscard, [sp], "the SPAM went face up onto the damage discard");
    assert(!p.pile.includes(sp) && !p.deck.includes(sp), "and not back into the robot's own deck");
    eq(card(st, p.registers[0]).kind, "move1", "the register shows the card that was drawn");
    assertInvariants(st, co.library);
  }],
  ["SPAM that turns up more SPAM keeps going until it finds a card", () => {
    const co = plain();
    let st = mgame(co, [{ c: 0, r: 3, face: E }]);
    let p = st.players[0];
    p.registers[0] = spam(st);
    const top = own(st, p, "move1");
    const rest = p.deck.splice(0);
    p.pile = p.pile.concat(rest);                      // the rest of its own cards sit in the discard
    p.deck = [top, spam(st), spam(st)];                // drawn from the end: a Move 1 under two more SPAM
    runRegister(st, co.library);
    eq(p.c, 1, "it kept going until it found a real card");
    eq(st.damageDiscard.length, 3, "all three SPAM are out");
    assert(!p.deck.some(i => isDamage(st, i)), "none left in the deck");
    assertInvariants(st, co.library);
    /* a robot that runs out entirely does nothing, rather than throwing */
    st = mgame(co, [{ c: 0, r: 3, face: E }]); p = st.players[0];
    p.registers[0] = spam(st);
    p.deck = []; p.pile = []; p.hand = [];
    runRegister(st, co.library);
    eq(p.c, 0, "a robot with no card left moved nowhere");
    eq(p.registers[0], null, "and the register is empty");
  }],
  ["SPAM is the one card you do not discard at the end of programming", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    p.hand = [own(st, p, "move1"), spam(st), own(st, p, "left"), spam(st)];
    st.phase = "turn"; st.step = "leftovers"; tick(st, co.library);
    eq(p.hand.length, 2, "the two SPAM stay");
    for (const i of p.hand) assert(isDamage(st, i), "and only SPAM");
    eq(p.pile.filter(i => !isDamage(st, i)).length, 2, "the two real cards went to the robot's own discard");
    assert(!p.pile.some(i => isDamage(st, i)), "no SPAM went into the deck by the back door");
    assertInvariants(st, co.library);
  }],
  ["next round's deal lands on top of the SPAM you are still holding", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    const sp = spam(st);
    p.hand = [sp];
    const table = st.damageDeck.length + st.damageDiscard.length;
    st.phase = "turn"; st.step = "dealModern"; tick(st, co.library);
    assert(p.hand.includes(sp), "the SPAM survived the deal");
    eq(p.hand.length, HAND, "drawn up to nine, the SPAM counted");
    eq(p.dealtCount, HAND - 1, "so eight were drawn");
    eq(st.damageDeck.length + st.damageDiscard.length, table, "no damage card left the table");
    assertInvariants(st, co.library);
  }],
  ["a SPAM card in the hand names itself and says what it does", () => {
    eq(KINDS.spam.label, "SPAM", "the label");
    assert(KINDS.spam.damage, "marked as damage");
    assert(/thrown away/.test(KINDS.spam.note) && /top card of your deck/.test(KINDS.spam.note), "and the note says what happens when it is programmed");
  }],

  /* --- the laws ----------------------------------------------------------------- */
  ["a broken conservation law stops the game out loud, not silently", () => {
    const co = plain();
    const st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    assertInvariants(st, co.library);
    st.damageDeck.pop();
    throws(() => assertInvariants(st, co.library), /damage card conservation/, "a damage card falling off the table is refused");
  }],
  ["the table's forty are counted apart from each robot's twenty", () => {
    const co = plain();
    const fresh = () => mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    let st = fresh();
    st.damageDiscard.push(MODERN_DAMAGE_FIRST);
    throws(() => assertInvariants(st, co.library), /damage card/, "a damage card appearing from nowhere is refused");
    st = fresh();
    st.players[0].pile.push(st.damageDeck.pop());      // legal so far: the robot took a hit
    st.players[0].pile[0] = st.players[0].deck[0];      // and then it was not SPAM any more
    throws(() => assertInvariants(st, co.library), /own deck|damage card/, "a SPAM turning into a programming card is refused, though the total is unchanged");
    st = fresh();
    st.players[0].deck.pop();
    throws(() => assertInvariants(st, co.library), /own deck/, "a robot's own card going missing is refused");
  }],
  ["a hand that does not add up to the deal is refused, in both editions", () => {
    const co = plain();
    let st = game(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    assertInvariants(st, co.library);
    st.players[0].hand.push(st.deck[0]);
    throws(() => assertInvariants(st, co.library), /conservation/, "classic: a card in the hand and in the deck at once");
    st = mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    st.players[0].hand.push(st.players[0].deck[0]);
    throws(() => assertInvariants(st, co.library), /own deck/, "2016: a card in the hand and in the deck at once");
  }],
  ["a 2016 game played from a human seat, with the invariants armed", () => {
    const co = courseOn(board(10, 8, (b, t) => { t.setCell(3, 2, "o.."); t.setCell(6, 4, "b>."); t.setCell(7, 4, "b>."); }), [[8, 1], [1, 5]]);
    let sawSpamInHand = false, programmed = 0, shopped = 0;
    const human = (st, library, req, refusals) => {
      if (req.kind === "program") { programmed++; if (st.players[req.player].hand.some(i => isDamage(st, i))) sawSpamInHand = true; }
      if (req.kind === "upgrade") shopped++;
      return randomAnswer(st, library, req, refusals);
    };
    const r = runGame({ seed: 4242, course: co.doc, seats: [{ seat: "human" }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 2 }], library: co.library, ruleset: "modern", human, maxTurns: 40 });
    assert(programmed >= 3, "the person programmed " + programmed + " rounds");
    assert(shopped >= 1, "and was asked to shop");
    assert(sawSpamInHand, "a hand with SPAM in it was programmed, the case that once threw");
    assert(r.winner !== null || r.unfinished, "the game ended");
  }],

  /* --- the floor and the table ------------------------------------------------- */
  ["a modern robot starts on three Energy and a classic one on none", () => {
    const co = plain();
    for (const p of mgame(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]).players) eq(p.energy, START_ENERGY, p.name + " starts on three");
    for (const p of game(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]).players) eq(p.energy, 0, "a classic robot has nothing to spend");
    eq(START_ENERGY, 3, "three");
  }],
  ["the 2016 floor acts in its own order, which is not the classic one", () => {
    eq(MODERN_ORDER.map(x => x[0]), ["blue1", "blue2", "green", "currents", "pushers", "gears", "crushers", "lasers", "flamers", "batteries", "touch"],
      "the reference card's order, with Wet and Wild's currents at step 3 and Thrills and Spills' flamers at the end of the register");
    assert(MODERN_ORDER.map(x => x[0]).join() !== CLASSIC_ORDER.map(x => x[0]).join(), "not the classic order");
    for (const n of ["presses", "burners"]) assert(!MODERN_ORDER.some(x => x[0] === n), "no " + n + " on the 2016 floor");
    /* every settled step of the ruleset's table has a pass, except the one
     * no shipped board prints: a current, which is declared here */
    const passOf = { expressConveyor: ["blue1", "blue2"], conveyor: ["green"], current: ["currents"], pusher: ["pushers"], gear: ["gears"], crusher: ["crushers"],
      boardLaser: ["lasers"], robotLaser: ["lasers"], flamer: ["flamers"], checkpoint: ["batteries", "touch"] };
    const missing = [];
    const ordered = [];
    for (const s of rulesetFor("modern").order) {
      if (!s.settled) continue;
      if (!passOf[s.step]) { missing.push(s.step); continue; }
      for (const n of passOf[s.step]) { assert(MODERN_ORDER.some(x => x[0] === n), s.step + " runs as " + n); ordered.push(n); }
    }
    eq(missing, [], "every settled step of the ruleset's table has a pass");
    const engine = MODERN_ORDER.map(x => x[0]).filter(n => ordered.includes(n));
    eq(engine, ordered.filter((n, i) => ordered.indexOf(n) === i), "and the engine walks them in the table's order");
  }],
  ["a blue belt conveys twice and a green belt only once", () => {
    let co = plain((b, t) => { for (let c = 0; c < 4; c++) t.setCell(c, 3, "B>."); });
    let st = mgame(co, [{ c: 0, r: 3 }]);
    beltPass(st, co.C, 2, 2); beltPass(st, co.C, 2, 2);
    eq(st.players[0].c, 2, "blue conveys twice");
    /* green conveys once, and the blue passes must not touch it */
    co = plain((b, t) => { t.setCell(0, 3, "b>."); t.setCell(2, 3, "B>."); t.setCell(3, 3, "B>."); });
    st = mgame(co, [{ c: 0, r: 3 }, { c: 2, r: 3 }]);
    const onGreen = st.players[0], onBlue = st.players[1];
    beltPass(st, co.C, 2, 2);
    eq([onGreen.c, onBlue.c], [0, 3], "the blue pass moved only the robot on blue");
    beltPass(st, co.C, 1, 1);
    eq([onGreen.c, onBlue.c], [1, 3], "the green pass moved only the robot on green");
    /* and through the machine, a robot riding blue onto green does not get the green move */
    co = plain((b, t) => { t.setCell(0, 3, "B>."); t.setCell(1, 3, "B>."); t.setCell(2, 3, "b>."); });
    st = mgame(co, [{ c: 0, r: 3, face: N }]);
    st.players[0].registers[0] = own(st, st.players[0], "powerUp");
    runRegister(st, co.library);
    eq(st.players[0].c, 3, "two on blue and one on green: three squares for free");
    co = plain((b, t) => { t.setCell(0, 3, "b>."); t.setCell(1, 3, "B>."); t.setCell(2, 3, "B>."); });
    st = mgame(co, [{ c: 0, r: 3, face: N }]);
    st.players[0].registers[0] = own(st, st.players[0], "powerUp");
    runRegister(st, co.library);
    eq(st.players[0].c, 1, "green onto blue: the blue has already had its turn, so one square");
  }],
  ["a course's rulebooks come from its squares, not from its box", () => {
    const both = courseOn(board(6, 6));
    eq(rulesetsFor(both.doc, both.library), ["classic", "modern"], "plain floor plays under either");
    const jet = courseOn(board(6, 6, b => { setWall(b, 2, 2, N, 1); b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 2, r: 2 }, face: S, reach: 1, regs: [1] }); }));
    eq(rulesetsFor(jet.doc, jet.library), ["classic"], "a flame jet is printed only in the classic box");
    const water = courseOn(board(6, 6, (b, t) => t.setCell(2, 2, "~..")));
    eq(rulesetsFor(water.doc, water.library), ["modern"], "water is printed only in the 2016 boxes");
    const mixed = courseOn(board(6, 6, (b, t) => { t.setCell(2, 2, "~.."); setWall(b, 4, 4, N, 1); b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 4, r: 4 }, face: S, reach: 1, regs: [1] }); }));
    eq(rulesetsFor(mixed.doc, mixed.library), [], "and a board carrying both is readable by neither");
  }],
  ["the docking bay belongs to both games, and a real mix is still refused", () => {
    const b = board(6, 4);
    const dock = courseOn(b);
    eq(rulesetsFor(dock.doc, dock.library), ["classic", "modern"], "the bays are printed in both boxes");
    const a = board(6, 6, (bb, t) => t.setCell(2, 2, "~..")); a.id = "wet";
    const z = board(6, 6, bb => { setWall(bb, 2, 2, N, 1); bb.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 2, r: 2 }, face: S, reach: 1, regs: [1] }); }); z.id = "hot";
    const library = new Map([[a.id, a], [z.id, z]]);
    const doc = { format: "PRCourse", version: 1, id: "mix", name: "Mix", kind: "quick", flags: [[0, 0]], minPlayers: 1, maxPlayers: 8,
      stamps: [{ role: "board", board: "wet", rot: 0, at: [0, 0] }, { role: "board", board: "hot", rot: 0, at: [6, 0] }] };
    eq(rulesetsFor(doc, library), [], "a 2016 board beside a Crash and Burn board is a course nobody's book reads");
  }],
  ["destroying a robot returns all of its cards to the discard", () => {
    const co = plain();
    const st = game(co, [{ c: 0, r: 3 }, { c: 1, r: 3 }]);
    const p = st.players[0];
    give(st, p, 0, "move1"); give(st, p, 1, "left");
    p.hand = st.deck.splice(st.deck.length - 3, 3);
    const held = p.registers.filter(x => x !== null).concat(p.hand);
    destroy(st, co.C, p, "for the test");
    for (const i of held) assert(st.discard.includes(i), "card " + i + " reached the discard");
    eq(p.hand.length + p.registers.filter(x => x !== null).length, 0, "and the robot holds nothing");
    assertInvariants(st, co.library);
  }]
];
