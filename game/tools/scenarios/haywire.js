/* Haywire, the 2016 game's other damage card: the rule on p.18 of the
 * rulebook (manual1/IMG_1263) and the seventeen faces off the deck laid out
 * (IMG_1343 to IMG_1348). Same contract as the other files: every name is
 * "ported" in scenarios.js.
 */
import { board, courseOn, game, N, E, S, W } from "./harness.js";
import { stepRobot, damage, drawDamageCards, computeLaserHits } from "../../engine/rules.js";
import { step, tick, applyAnswer, shutdown } from "../../engine/machine.js";
import { card, isDamage, MODERN_CARDS, MODERN_DAMAGE_FIRST, HAYWIRE_FACES, KINDS } from "../../engine/cards.js";
import { HAYWIRE_STEPS, isHaywire } from "../../engine/haywire.js";
import { newInstalled, temporaryOffers, useTemporary, UPGRADE_DEFS } from "../../engine/upgrades.js";
import { assertInvariants } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";
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
/** The Haywire with this face, taken out of the damage deck. */
function hw(st, face) {
  const i = st.damageDeck.findIndex(ci => MODERN_CARDS[ci].face === face);
  if (i < 0) throw new Error("no Haywire " + face + " in the damage deck");
  return st.damageDeck.splice(i, 1)[0];
}
const spam = st => { const i = st.damageDeck.findLastIndex(ci => MODERN_CARDS[ci].kind === "spam"); return st.damageDeck.splice(i, 1)[0]; };
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
      if (!applyAnswer(st, library, a === undefined ? botAnswer(st, library, w) : a)) throw new Error("refused: " + w.kind + " " + JSON.stringify(a));
    } else tick(st, library);
  }
}
/** Run a whole round from the upgrade phase, answering as a bot except where `decide` says. */
function driveRound(st, library, decide) {
  st.phase = "turn"; st.step = "upgrade"; st.events = [];
  const turn = st.turn;
  for (let g = 0; g < 4000 && !st.over && st.turn === turn; g++) {
    if (st.waiting) {
      const w = st.waiting;
      const a = decide ? decide(w) : undefined;
      if (!applyAnswer(st, library, a === undefined ? botAnswer(st, library, w) : a)) throw new Error("refused: " + w.kind + " " + JSON.stringify(a));
    } else tick(st, library);
  }
}
/** Put a face-down Haywire under a register the way the rule does. */
function under(st, p, reg, face) { p.haywire[reg] = hw(st, face); }

export const TESTS = [
  ["the damage deck is twenty-three SPAM and seventeen Haywire, every face once and each with its steps", () => {
    eq(HAYWIRE_FACES.length, 17, "seventeen faces");
    eq(new Set(HAYWIRE_FACES.map(h => h.id)).size, 17, "all different");
    for (const h of HAYWIRE_FACES) { assert(h.text, h.id + " has its printed text"); assert(HAYWIRE_STEPS[h.id] && HAYWIRE_STEPS[h.id].length, h.id + " has steps"); }
    eq(Object.keys(HAYWIRE_STEPS).length, 17, "and no steps for a face that is not printed");
    eq(MODERN_CARDS.filter(c => c.kind === "spam").length, 23, "twenty-three SPAM");
    assert(KINDS.haywire && KINDS.haywire.damage, "a damage kind");
  }],
  ["a Haywire slides face down under the register it was taken in, one per register, the rest to the discard", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7 }, { c: 1, r: 7 }]);
    const p = st.players[0];
    st.register = 2; st.phase = "exec";
    const a = hw(st, "hwBack3"), b = hw(st, "hwMove2Left");
    st.damageDeck.push(b); st.damageDeck.push(a);   // a on top
    drawDamageCards(st, p, 2, "laser");
    eq(p.haywire[2], a, "the first slides under register 3");
    assert(st.damageDiscard.includes(b), "the second goes face up to the damage discard");
    eq(p.pile.length, 0, "neither is in the robot's discard");
    assertInvariants(st, co.library);
    /* a Haywire taken outside a register cannot be held: the discard */
    st.phase = "turn";
    st.damageDeck.push(hw(st, "hwBack1Uturn"));
    drawDamageCards(st, p, 1, "test");
    eq(st.damageDiscard.length, 2, "outside a register, to the discard");
  }],
  ["next round the Haywire's register is not programmed, and the card resolves there face up", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 0, r: 7, face: S }]);   // the bot far from the flag, so the round runs its length
    const p = st.players[0];
    under(st, p, 2, "hwMove2Left");
    let req = null;
    driveRound(st, co.library, w => {
      if (w.kind === "program" && w.player === 0) { req = w; return w.options.slice(0, w.count); }
      return w.kind === "useTemp" || w.kind === "shutdown" ? (w.kind === "shutdown" ? false : null) : undefined;
    });
    assert(req, "the person programmed");
    eq(req.count, 4, "four cards, not five");
    eq(req.held, [2], "and the request says register 3 is held by a Haywire");
    /* the Haywire resolved in register 3: Move 2 then rotate left, from wherever the first two cards left it */
    assert(st.log.some(l => /goes haywire: Move 2, rotate left/.test(l.msg)), "the card came up and resolved");
    eq(p.haywire[2], null, "the slot is clear again");
    assert(!p.registers.some(i => i !== null && isHaywire(st, i)), "and at the end of the round the face-up Haywire was discarded");
    assertInvariants(st, co.library);
  }],
  ["a Haywire's moves and turns resolve as printed", () => {
    const co = far();
    const run = (face, place, decide) => {
      const st = mgame(co, [{ ...place, seat: "human" }, { c: 7, r: 7 }]);
      const p = st.players[0];
      under(st, p, 0, face);
      driveRegister(st, co.library, w => w.kind === "useTemp" ? null : decide ? decide(w, st, p) : undefined);
      return [st, p];
    };
    let [st, p] = run("hwMove2Left", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [3, 3, W], "Move 2, rotate left");
    [st, p] = run("hwBack3", { c: 3, r: 2, face: N });
    eq([p.c, p.r, p.face], [3, 5, N], "Move back 3");
    [st, p] = run("hwMove3Uturn", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [3, 2, S], "Move 3, U-turn");
    [st, p] = run("hwMove1RightMove1", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [4, 4, E], "Move 1, rotate right, move 1");
    [st, p] = run("hwMove1LeftMove1", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [2, 4, W], "Move 1, rotate left, move 1");
    [st, p] = run("hwMove2Right", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [3, 3, E], "Move 2, rotate right");
    [st, p] = run("hwBack1Uturn", { c: 3, r: 5, face: N });
    eq([p.c, p.r, p.face], [3, 6, S], "Move back 1, U-turn");
    [st, p] = run("hwRotateEither", { c: 3, r: 5, face: N }, w => w.kind === "cardChoice" && w.tag === "rotate" ? 1 : undefined);
    eq(p.face, W, "Rotate right or left: left chosen");
    [st, p] = run("hwAnyFacingMove1", { c: 3, r: 5, face: N }, w => w.kind === "cardChoice" && w.tag === "facing" ? E : undefined);
    eq([p.c, p.r, p.face], [4, 5, E], "Rotate to any facing, move 1");
    [st, p] = run("hwSidestep2", { c: 3, r: 5, face: N }, w => w.kind === "cardChoice" && w.tag === "side" ? 1 : undefined);
    eq([p.c, p.r, p.face], [5, 5, N], "Move 2 right without changing facing");
    /* Move 5 hits a wall: one damage */
    const walled = far(b => setWall(b, 3, 3, N, 1));
    st = mgame(walled, [{ c: 3, r: 5, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    under(st, p, 0, "hwMove5Wall");
    driveRegister(st, walled.library, w => w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r], [3, 3], "stopped by the wall");
    eq(p.pile.filter(i => isDamage(st, i)).length, 1, "and took one for hitting it");
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    under(st, p, 0, "hwMove5Wall");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r], [3, 2], "five clear squares, no wall, no damage");
    eq(p.pile.filter(i => isDamage(st, i)).length, 0, "none");
  }],
  ["a Haywire's tricks resolve as printed: the token, Energy, the laser, the free upgrade, the discard, the two cards", () => {
    const co = far();
    /* the Priority Token, and it stays at the end of the round */
    let st = mgame(co, [{ c: 3, r: 7, face: S }, { c: 0, r: 7, face: S }, { c: 6, r: 7, face: N }]);   // the taker faces the floor, not the edge
    let p = st.players[2];
    st.priority = 0;
    under(st, p, 0, "hwMove1Token");
    driveRound(st, co.library);
    eq(st.priority, 2, "took the token, and it did not pass at the end of the round");
    /* Energy for distance */
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    p.energy = 3;
    under(st, p, 0, "hwPayEnergy");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.tag === "pay" ? 2 : w.kind === "useTemp" ? null : undefined);
    eq([p.energy, p.c, p.r], [1, 3, 3], "paid two, moved four");
    /* the charged laser */
    st = mgame(co, [{ c: 3, r: 5, face: N, seat: "human" }, { c: 3, r: 2, face: S }]); p = st.players[0];
    under(st, p, 0, "hwMove1Laser");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? null : undefined);
    eq(st.players[1].pile.filter(i => isDamage(st, i)).length, 2, "the main laser dealt two this register");
    eq(p.laserBonus, 0, "charged for register 1 only");
    st.phase = "cleanup"; st.step = "endRound"; tick(st, co.library);
    eq(p.laserBonus, -1, "and not after the round");
    /* the free upgrade, back at the end of the round */
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    for (const q of st.players) q.shelf = [];
    st.upgradeDeck = Object.keys(UPGRADE_DEFS);
    st.upgradeDeck.splice(st.upgradeDeck.indexOf("railGun"), 1); p.shelf.push("railGun");
    st.upgradeDeck.splice(st.upgradeDeck.indexOf("zoop"), 1); p.shelf.push("zoop");
    p.energy = 0;
    under(st, p, 0, "hwInstall");
    let labels = null;
    driveRound(st, co.library, w => {
      if (w.kind === "cardChoice" && w.tag === "install") { labels = w.labels; assert(p.installed.some(u => u.id === "railGun") === false, "not yet"); return 0; }
      return w.kind === "useTemp" ? null : w.kind === "shutdown" ? false : w.kind === "upgrade" ? { buy: false, install: null, uninstall: [] } : w.kind === "program" ? w.options.slice(0, w.count) : undefined;
    });
    eq(labels, ["Rail Gun"], "only the permanent one is offered");
    assert(st.upgradeDiscard.includes("railGun") && !p.installed.some(u => u.id === "railGun"), "installed free for the round and discarded at its end");
    eq(p.energy, 0, "for nothing");
    /* removing a card from the discard */
    st = mgame(co, [{ c: 3, r: 5, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    p.pile = [own(st, p, "move1"), spam(st)];
    under(st, p, 0, "hwBack1Remove");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.tag === "remove" ? 1 : w.kind === "useTemp" ? null : undefined);
    eq([p.r, p.removed.length], [6, 1], "moved back one and removed a card");
    assert(isDamage(st, p.removed[0]), "the SPAM");
    assertInvariants(st, co.library);
    /* the two revealed cards, in the chosen order */
    st = mgame(co, [{ c: 3, r: 5, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    p.deck.push(own(st, p, "move1")); p.deck.push(own(st, p, "right"));   // the top two: Rotate Right, then Move 1
    under(st, p, 0, "hwDrawTwo");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.tag === "order" ? 1 : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r, p.face], [3, 4, E], "Move 1 first, then Rotate Right: forward one, then facing east");
    assertInvariants(st, co.library);
  }],
  ["Again after a Haywire resolves it again", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const p = st.players[0];
    under(st, p, 0, "hwMove2Left");
    p.registers[1] = own(st, p, "again");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? null : undefined);
    driveRegister(st, co.library, w => w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r, p.face], [1, 5, S], "twice: up two and left, then west two and left again");
  }],
  ["Rewire puts the face-down Haywires in the hand, and they must be programmed", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "rewire");
    under(st, p, 2, "hwBack3");
    const hwi = p.haywire[2];
    let program = null, offered = false;
    driveRound(st, co.library, w => {
      if (w.kind === "useTemp" && w.moment === "dealt") { const o = w.options.find(o => o && o.id === "rewire"); if (o) { offered = true; return o; } return null; }
      if (w.kind === "useTemp") return null;
      if (w.kind === "program" && w.player === 0) {
        program = w;
        const idx = p.hand.indexOf(hwi);
        const rest = w.options.filter(i => i !== idx).slice(0, 4);
        return [rest[0], idx, rest[1], rest[2], rest[3]];   // the Haywire wherever you wish: register 2
      }
      return w.kind === "shutdown" ? false : undefined;
    });
    assert(offered, "Rewire was offered before programming");
    assert(program && program.must.includes(p.hand.indexOf(hwi)) === false && program.count === 5, "five registers open again");
    assert(st.log.some(l => /goes haywire: Move back 3/.test(l.msg)), "the Haywire resolved from the register it was programmed into");
    assertInvariants(st, co.library);
    /* leaving it in hand is refused */
    const st2 = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const q = st2.players[0];
    const h2 = hw(st2, "hwBack3");
    q.hand = [h2].concat(q.deck.splice(0, 6));
    st2.phase = "turn"; st2.step = "program";
    const r = step(st2, co.library);
    assert(r.waiting.kind === "program" && r.waiting.must.includes(0), "the request names the Haywire as one that must be programmed");
    assert(step(st2, co.library, [1, 2, 3, 4, 5]).refused, "a programme that leaves it in hand is refused");
    assert(!step(st2, co.library, [1, 0, 2, 3, 4]).refused, "one that includes it is not");
  }],
  ["Lucky Booster digs a Haywire out of the deck and plays it, or bins it", () => {
    const co = far();
    let st = mgame(co, [{ c: 3, r: 3, face: N, seat: "human" }, { c: 7, r: 7 }]);
    let p = st.players[0];
    fit(st, p, "luckyBooster");
    const face = hw(st, "hwBack3");
    const sA = spam(st), sB = spam(st);
    st.damageDeck.push(face); st.damageDeck.push(sA); st.damageDeck.push(sB);   // two SPAM over the Haywire
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? (w.options.find(o => o && o.id === "luckyBooster" && o.take) || null) : undefined);
    eq([p.c, p.r], [3, 6], "Move back 3 played instead of the Move 1");
    assert(st.log.some(l => /digs up a Haywire and plays it/.test(l.msg)), "dug through two SPAM to it");
    eq(st.damageDiscard.filter(i => card(st, i).kind === "spam").length >= 2, true, "the SPAM it passed are on the discard");
    assertInvariants(st, co.library);
    st = mgame(co, [{ c: 3, r: 3, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    fit(st, p, "luckyBooster");
    const f2 = hw(st, "hwBack3");
    st.damageDeck.push(f2);
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? (w.options.find(o => o && o.id === "luckyBooster" && !o.take) || null) : undefined);
    eq([p.c, p.r], [3, 2], "binned it and played the Move 1");
    assert(st.damageDiscard.includes(f2), "the Haywire on the discard");
  }],
  ["shutdown scraps face-down Haywires; a reboot sends them to the table and keeps the first new one under the register", () => {
    const co = far((b, t) => t.setCell(4, 5, "o.."));
    let st = mgame(co, [{ c: 3, r: 5, face: E }, { c: 7, r: 7 }]);
    let p = st.players[0];
    under(st, p, 1, "hwBack3"); under(st, p, 3, "hwMove2Left");
    const before = st.damageDiscard.length;
    shutdown(st, p);
    eq(st.damageDiscard.length - before, 2, "both went back to the table");
    eq(p.haywire.filter(h => h !== null).length, 0, "and the slots are clear");
    assertInvariants(st, co.library);
    /* a reboot: the held Haywires to the table; of the two drawn, a Haywire goes under the current register */
    st = mgame(co, [{ c: 3, r: 5, face: E }, { c: 7, r: 7 }]); p = st.players[0];
    under(st, p, 4, "hwMove2Right");
    const newHw = hw(st, "hwBack3");
    st.damageDeck.push(spam(st)); st.damageDeck.push(newHw);   // the Haywire is drawn first
    st.register = 2; st.phase = "exec";
    stepRobot(st, co.C, p, E, "card");
    assert(p.rebooting, "in the pit");
    eq(p.haywire[4], null, "the Haywire it held went to the table");
    eq(p.haywire[2], newHw, "the one it drew slid under register 3, where it fell");
    eq(p.pile.filter(i => isDamage(st, i)).length, 1, "the other, a SPAM, to its own discard");
    assertInvariants(st, co.library);
  }]
];
