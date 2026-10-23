/* The expansion upgrade cards (Chaos and Carnage, Thrills and Spills, Wet
 * and Wild) and Master Builder's five, one scenario each. Same contract:
 * every name is "ported" in scenarios.js. The four that decide something where no question can be
 * asked (Repulsion Field, Anchor, Bunny Hop, Calculated Odds) are tested to
 * the reading declared on their rows.
 */
import { board, courseOn, game, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, laserPass, damage } from "../../engine/rules.js";
import { step, tick, applyAnswer } from "../../engine/machine.js";
import { card, isDamage } from "../../engine/cards.js";
import { UPGRADE_DEFS, canInstall, costOf, newInstalled } from "../../engine/upgrades.js";
import { assertInvariants } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

const far = edit => courseOn(board(8, 8, edit), [[7, 0]]);
const mgame = (co, places, opts) => game(co, places, { ...(opts || {}), ruleset: "modern" });
function own(st, p, kind) {
  const i = p.deck.findIndex(ci => card(st, ci).kind === kind);
  if (i < 0) throw new Error("no " + kind + " left in the deck");
  return p.deck.splice(i, 1)[0];
}
/* the fixture deals SPAM first: the top of the damage deck is SPAM, the bottom Haywire */
const spam = st => { const i = st.damageDeck.pop(); if (i === undefined) throw new Error("no damage card left"); return i; };
const hw = st => { const k = st.damageDeck.findIndex(i => card(st, i).kind === "haywire"); if (k < 0) throw new Error("no Haywire left"); return st.damageDeck.splice(k, 1)[0]; };
function fit(st, p, id) {
  const i = st.upgradeDeck.indexOf(id);
  if (i >= 0) st.upgradeDeck.splice(i, 1);
  else {
    const holder = st.players.find(q => q.shelf.includes(id));
    if (!holder) throw new Error(id + " is nowhere to be found");
    holder.shelf.splice(holder.shelf.indexOf(id), 1);
  }
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
      if (!applyAnswer(st, library, a === undefined ? botAnswer(st, library, w) : a)) throw new Error("the answer to " + w.kind + " was refused: " + JSON.stringify(a));
    } else tick(st, library);
  }
}
const useOffer = (w, id, match) => { const o = w.options.find(o => o && o.id === id && (!match || match(o))); return o === undefined ? null : o; };
/** Fire the lasers to completion, answering a named card's question with `a` and everything else "no". */
function volley(st, co, cardId, a) {
  for (let g = 0; g < 20; g++) {
    const ask = laserPass(st, co.C);
    if (!ask) return;
    st.answers[ask.key] = ask.card === cardId ? a : 0;
  }
  throw new Error("the volley never finished");
}
const dmg = (st, p) => p.pile.filter(i => isDamage(st, i)).length;

export const TESTS = [
  ["Indirect Fire pays an Energy to hit a robot within three squares, off the laser line", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 1, r: 6, face: E }]);
    const [p, q] = st.players;
    fit(st, p, "indirectFire");
    const ask = laserPass(st, co.C);
    assert(ask && ask.card === "indirectFire", "offered: a robot three squares south, where the laser cannot reach");
    st.answers[ask.key] = 1;
    volley(st, co, "indirectFire", 1);
    eq([dmg(st, q), p.energy], [1, 2], "the target took one, and the Energy was paid");
  }],
  ["Mirror sends the first robot damage of a round back to the shooter", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: N }]);
    const [p, q] = st.players;
    fit(st, q, "mirror");
    volley(st, co, null, 0);
    eq([dmg(st, q), dmg(st, p)], [1, 1], "both took one");
    st.register = 1;
    volley(st, co, null, 0);
    eq([dmg(st, q), dmg(st, p)], [2, 1], "the mirror works once a round");
  }],
  ["Controlled Chaos moves a face-down Haywire to the register of your choice", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, face: E, seat: "human" }]);
    const p = st.players[0];
    fit(st, p, "controlledChaos");
    p.haywire[2] = hw(st);
    st.phase = "turn"; st.step = "dealModern";
    let r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "controlledChaos", "asked before programming");
    r = step(st, co.library, 1);
    assert(r.waiting && r.waiting.kind === "program", "then the registers");
    eq([p.haywire[0] !== null, p.haywire[2]], [true, null], "the Haywire went under register 1");
    assertInvariants(st, co.library);
  }],
  ["Stun empties the target's next register instead of shooting it", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: N }]);
    const [p, q] = st.players;
    fit(st, p, "stun");
    q.registers[1] = own(st, q, "move1"); q.haywire[1] = hw(st);
    volley(st, co, "stun", 1);
    eq([q.registers[1], q.haywire[1], dmg(st, q)], [null, null, 0], "register 2 is empty and no damage landed");
    assert(!p.installed.some(u => u.id === "stun"), "the temporary is spent");
    assertInvariants(st, co.library);
  }],
  ["Stun cannot be used in register 5", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: N }]);
    fit(st, st.players[0], "stun");
    st.register = 4;
    eq(laserPass(st, co.C), null, "nothing is offered");
    eq(dmg(st, st.players[1]), 1, "the laser fired");
  }],
  ["Memory Transfer hands a damage card in hand to a neighbour's discard", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, seat: "human" }, { c: 4, r: 3 }]);
    const [p, q] = st.players;
    fit(st, p, "memoryTransfer");
    p.hand.push(spam(st));
    st.phase = "cleanup"; st.step = "endRound";
    let r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "memoryTransfer", "asked at the round's end");
    step(st, co.library, 1);
    eq([p.hand.filter(i => isDamage(st, i)).length, dmg(st, q)], [0, 1], "the SPAM is in the neighbour's discard");
    assertInvariants(st, co.library);
  }],
  ["Phasing carries a robot through one wall on its own move", () => {
    const co = far((b, t) => { t.wall(3, 3, N); t.wall(3, 2, N); });
    const st = mgame(co, [{ c: 3, r: 3, face: N }]);
    const p = st.players[0];
    fit(st, p, "phasing");
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "phasing") : undefined);
    eq(p.r, 2, "through the first wall, stopped by the second");
  }],
  ["Splash Damage hurts every robot beside the target", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: N }, { c: 4, r: 4, face: S }, { c: 5, r: 3, face: E }]);
    const [p, q, a, b] = st.players;
    fit(st, p, "splashDamage");
    volley(st, co, null, 0);
    eq([dmg(st, q), dmg(st, a), dmg(st, b)], [1, 1, 1], "the target and both neighbours");
    eq(costOf(UPGRADE_DEFS.splashDamage, 4), 3, "and it costs X, the number of foes");
  }],
  ["SPAM-Powered Rocket burns SPAM from the discard for squares", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 5, face: N }]);
    const p = st.players[0];
    fit(st, p, "spamRocket");
    p.pile.push(spam(st), spam(st));
    p.registers[0] = own(st, p, "left");
    const before = st.damageDiscard.length;
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "spamRocket", o => o.n === 2) : undefined);
    eq([p.r, dmg(st, p), st.damageDiscard.length - before], [3, 0, 2], "two squares for two SPAM");
    assertInvariants(st, co.library);
  }],
  ["Diffuser turns every damage after the first of a register into Energy", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3 }]);
    const p = st.players[0];
    fit(st, p, "diffuser");
    damage(st, co.C, p, 3, "burner");
    eq([dmg(st, p), p.energy], [1, 5], "one card drawn, two Energy");
  }],
  ["Calculated Odds draws two and keeps the SPAM", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3 }]);
    const p = st.players[0];
    fit(st, p, "calculatedOdds");
    const h = hw(st), s = spam(st);
    st.damageDeck.push(s, h);                       // Haywire on top, drawn first
    damage(st, co.C, p, 1, "burner");
    eq([dmg(st, p), st.damageDiscard.includes(h), p.haywire.every(x => x === null)], [1, true, true], "kept the SPAM, discarded the Haywire");
    assertInvariants(st, co.library);
  }],
  ["Repulsion Field throws the pusher back for an Energy", () => {
    const co = far();
    const st = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    const [p, q] = st.players;
    fit(st, q, "repulsionField");
    eq(stepRobot(st, co.C, p, E, "card"), false, "the push does not happen");
    eq([[q.c, q.r], [p.c, p.r], q.energy], [[3, 3], [1, 3], 2], "the pusher is thrown back a square, the Energy paid");
  }],
  ["Bunny Hop hops over the robot it would have pushed", () => {
    const co = far();
    const st = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    const [p, q] = st.players;
    fit(st, p, "bunnyHop");
    assert(stepRobot(st, co.C, p, E, "card"), "the move happened");
    eq([[p.c, p.r], [q.c, q.r]], [[4, 3], [3, 3]], "over it, and the other robot did not move");
    /* not when the square beyond is taken */
    const st2 = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3 }, { c: 4, r: 3 }]);
    fit(st2, st2.players[0], "bunnyHop");
    stepRobot(st2, co.C, st2.players[0], E, "card");
    eq([st2.players[0].c, st2.players[1].c, st2.players[2].c], [3, 4, 5], "a plain push instead");
  }],
  ["Turbo pays an Energy for one more square", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 5, face: N, seat: "human" }]);
    const p = st.players[0];
    fit(st, p, "turbo");
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.card === "turbo" ? 1 : undefined);
    eq([p.r, p.energy], [3, 2], "two squares, one Energy");
  }],
  ["The Oppositron does the opposite of the card", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, face: N }]);
    const p = st.players[0];
    fit(st, p, "oppositron");
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "oppositron") : undefined);
    eq([p.c, p.r, p.face], [3, 5, N], "a Move 2 backed up two");
    const st2 = mgame(co, [{ c: 3, r: 3, face: N }]);
    fit(st2, st2.players[0], "oppositron");
    st2.players[0].registers[0] = own(st2, st2.players[0], "uturn");
    driveRegister(st2, co.library, w => w.kind === "useTemp" ? useOffer(w, "oppositron") : undefined);
    eq(st2.players[0].face, N, "a U-Turn is no turn");
  }],
  ["Master Builder's Overclocked runs an earlier register's card and takes a SPAM", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 5, face: N }]);
    const p = st.players[0];
    fit(st, p, "overclockedMB");
    p.registers[0] = own(st, p, "move1"); p.registers[1] = own(st, p, "uturn");
    st.register = 1;
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "overclockedMB", o => o.reg === 0) : undefined);
    eq([p.r, p.face, dmg(st, p)], [4, N, 1], "moved 1 instead of turning, and holds a SPAM");
    assertInvariants(st, co.library);
  }],
  ["Moon Walk runs the belts backwards for the robot", () => {
    const co = far((b, t) => { t.setCell(3, 3, "b>."); t.setCell(2, 3, "b>."); });
    const st = mgame(co, [{ c: 3, r: 3, face: N }]);
    const p = st.players[0];
    fit(st, p, "moonWalk");
    p.moonwalk = st.turn;
    beltPass(st, co.C, 1, 1);
    eq([p.c, p.r], [2, 3], "carried west on an eastbound belt");
    /* not into another robot */
    const st2 = mgame(co, [{ c: 3, r: 3, face: N }, { c: 2, r: 3 }]);
    st2.players[0].moonwalk = st2.turn;
    beltPass(st2, co.C, 1, 1);
    eq([st2.players[0].c, st2.players[1].c], [4, 3], "the belt runs the printed way instead");
  }],
  ["Top Heavy steps off the belt sideways instead of riding it", () => {
    const co = far((b, t) => { t.setCell(3, 3, "b>."); });
    const st = mgame(co, [{ c: 3, r: 3, face: N }]);
    const p = st.players[0];
    fit(st, p, "topHeavy");
    const ask = beltPass(st, co.C, 1, 1);
    assert(ask && ask.kind === "cardChoice" && ask.card === "topHeavy", "asked before the belt moves");
    st.answers[ask.key] = 2;
    eq(beltPass(st, co.C, 1, 1), null, "answered, the pass completes");
    eq([p.c, p.r, p.face], [4, 3, N], "stepped right, facing unchanged");
  }],
  ["Anchor spends an Energy to refuse a push", () => {
    const co = far();
    const st = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    const [p, q] = st.players;
    fit(st, q, "anchor");
    q.energy = 1;
    eq(stepRobot(st, co.C, p, E, "card"), false, "the push fails");
    eq([[p.c, p.r], [q.c, q.r], q.energy], [[2, 3], [3, 3], 0], "nobody moved, the Energy is spent");
    assert(stepRobot(st, co.C, p, E, "card"), "with no Energy left the next push lands");
    eq([q.c], [4], "");
  }],
  ["a card that costs X is priced by the table", () => {
    const co = far();
    const st = mgame(co, [{ c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }, { c: 4, r: 1 }]);
    const p = st.players[0];
    const i = st.upgradeDeck.indexOf("splashDamage");
    if (i >= 0) st.upgradeDeck.splice(i, 1); else { const h = st.players.find(q => q.shelf.includes("splashDamage")); h.shelf.splice(h.shelf.indexOf("splashDamage"), 1); }
    p.shelf.push("splashDamage");
    p.energy = 2;
    assert(!canInstall(p, "splashDamage", 4), "three foes: it costs 3, and 2 Energy is not enough");
    p.energy = 3;
    assert(canInstall(p, "splashDamage", 4), "3 is");
    eq(costOf(UPGRADE_DEFS.splashDamage, 8), 4, "capped at 4");
  }]
];
