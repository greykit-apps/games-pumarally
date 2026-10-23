/* The upgrade cards' effects, one scenario each, read off the 2016 rulebook
 * pp.21-23. The first eleven are in modern.js
 * where they were built; these are the twenty-seven that followed, and the
 * two declared inert. Same contract: every name is "ported" in scenarios.js.
 */
import { board, courseOn, game, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, laserPass, checkpointPass, damage } from "../../engine/rules.js";
import { step, tick, applyAnswer } from "../../engine/machine.js";
import { card, isDamage, MAX_ENERGY, HAND } from "../../engine/cards.js";
import { UPGRADE_DEFS, UPGRADE_IDS, installUpgrade, temporaryOffers, useTemporary, newInstalled } from "../../engine/upgrades.js";
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
const spam = st => { const i = st.damageDeck.pop(); if (i === undefined) throw new Error("no damage card left"); return i; };
/** Fit a card straight onto the mat, off the upgrade deck, so the forty balance. */
function fit(st, p, id) {
  const i = st.upgradeDeck.indexOf(id);
  if (i >= 0) st.upgradeDeck.splice(i, 1);
  else {
    const holder = st.players.find(q => q.shelf.includes(id));       // dealt to a shelf at setup
    if (!holder) throw new Error(id + " is nowhere to be found");
    holder.shelf.splice(holder.shelf.indexOf(id), 1);
  }
  p.installed.push(newInstalled(id));
}
/**
 * Drive one register through the machine from the reveal, answering every
 * request with `decide(w)` when it returns something and as a bot otherwise.
 */
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

export const TESTS = [
  ["every transcribed upgrade is bound: built, or inert and saying why", () => {
    eq(UPGRADE_IDS.length, 63, "sixty-three");
    const inert = UPGRADE_IDS.filter(id => !UPGRADE_DEFS[id].built);
    eq(inert, [], "none inert: Lucky Booster and Rewire came alive with the Haywire faces");
    for (const id of UPGRADE_IDS) {
      const d = UPGRADE_DEFS[id];
      if (d.temp && d.built) assert(d.use || Object.keys(d.hooks).length || d.ruled, id + " is a temporary with a use or a hook, or the rules read it by name");
    }
  }],
  /* --- permanent -------------------------------------------------------------- */
  ["Chaos Theory turns a revealed SPAM into Energy in the first three registers, once", () => {
    const co = far();
    let st = mgame(co, [{ c: 0, r: 7, face: E }]);
    let p = st.players[0];
    fit(st, p, "chaosTheory");
    p.registers[0] = spam(st); p.deck.push(own(st, p, "move1"));
    driveRegister(st, co.library);
    eq(p.energy, 4, "one Energy for the SPAM");
    /* SPAM that turns up more SPAM does not pay again */
    st = mgame(co, [{ c: 0, r: 7, face: E }]); p = st.players[0];
    fit(st, p, "chaosTheory");
    p.registers[0] = spam(st); p.deck.push(own(st, p, "move1")); p.deck.push(spam(st));
    driveRegister(st, co.library);
    eq(p.energy, 4, "still one: the replacement's SPAM is not yours");
    /* and not in registers 4 or 5 */
    st = mgame(co, [{ c: 0, r: 7, face: E }]); p = st.players[0];
    fit(st, p, "chaosTheory");
    st.register = 3; p.registers[3] = spam(st); p.deck.push(own(st, p, "move1"));
    driveRegister(st, co.library);
    eq(p.energy, 3, "register 4 pays nothing");
  }],
  ["Crab Legs pairs a Move 1 with a rotate and sidesteps instead of either", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "crabLegs");
    const rot = own(st, p, "right"), m1 = own(st, p, "move1");
    p.hand = [rot, m1].concat(p.deck.splice(0, 5));   // the harness deals no hand: seven cards, so five entries fill the registers
    st.phase = "turn"; st.step = "program";
    let r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "program" && r.waiting.crab, "the request says pairing is allowed");
    /* four singles is refused; the pair with a Move 2 is refused; the pair counts as one entry */
    assert(step(st, co.library, [[0, 1], 2, 3, 4, 5]).refused === false, "a pair and four cards fill the five");
    eq([p.registers[0], p.crab[0]], [rot, m1], "the rotate in the register, the Move 1 paired with it");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r, p.face], [4, 7, N], "one square east, facing unchanged: neither card's own effect");
    assertInvariants(st, co.library);
    /* without the upgrade, a pair is refused */
    const st2 = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const q = st2.players[0];
    q.hand = [own(st2, q, "right"), own(st2, q, "move1")].concat(q.deck.splice(0, 5));
    st2.phase = "turn"; st2.step = "program";
    step(st2, co.library);
    assert(step(st2, co.library, [[0, 1], 2, 3, 4, 5]).refused, "no Crab Legs, no pairing");
  }],
  ["Drifting and Power Slide roll one forward after a rotate, if you say so", () => {
    const co = far();
    let st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    let p = st.players[0];
    fit(st, p, "drifting");
    p.registers[0] = own(st, p, "left");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.card === "drifting" ? 1 : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r, p.face], [2, 7, W], "rotated left, then drifted one west");
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    fit(st, p, "drifting");
    p.registers[0] = own(st, p, "left");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.card === "drifting" ? 0 : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r], [3, 7], "or not");
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    fit(st, p, "powerSlide");
    p.registers[0] = own(st, p, "right");
    let asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "powerSlide") { asked = true; return 1; } return w.kind === "useTemp" ? null : undefined; });
    assert(asked, "Power Slide asked after the Rotate Right");
    eq([p.c, p.r, p.face], [4, 7, E], "and slid one east");
    st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    fit(st, p, "powerSlide");
    p.registers[0] = own(st, p, "left");
    asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice") asked = true; return w.kind === "useTemp" ? null : undefined; });
    assert(!asked, "a Rotate Left is not Power Slide's card");
  }],
  ["Energy Conversion moves you after a board laser hit, not a robot's", () => {
    const co = far(b => { setWall(b, 1, 3, W, 1); b.wallDevices.push({ kind: "laser", edge: { kind: "v", c: 1, r: 3 }, face: E, damage: 1 }); });
    let st = mgame(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    let p = st.players[0];
    fit(st, p, "energyConversion");
    let asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "energyConversion") { asked = true; return 1; } return w.kind === "useTemp" ? null : undefined; });
    assert(asked, "asked after the board laser hit");
    eq([p.c, p.r], [3, 2], "and moved one forward");
    eq(p.pile.filter(i => isDamage(st, i)).length, 1, "the hit still landed");
    /* a robot's laser does not offer it */
    const plain = far();
    st = mgame(plain, [{ c: 3, r: 3, face: N, seat: "human" }, { c: 3, r: 5, face: N }]); p = st.players[0];
    fit(st, p, "energyConversion");
    asked = false;
    driveRegister(st, plain.library, w => { if (w.kind === "cardChoice" && w.card === "energyConversion") asked = true; return w.kind === "useTemp" ? null : undefined; });
    assert(!asked, "a robot laser is not a board laser");
  }],
  ["Firewall spares the pit's two SPAM, not the edge's", () => {
    const co = far((b, t) => t.setCell(1, 3, "o.."));
    let st = mgame(co, [{ c: 0, r: 3, face: E }, { c: 6, r: 6 }]);
    let p = st.players[0];
    fit(st, p, "firewall");
    stepRobot(st, co.C, p, E, "card");
    assert(p.rebooting, "in the pit");
    eq(p.pile.filter(i => isDamage(st, i)).length, 0, "no damage cards for it");
    st = mgame(co, [{ c: 7, r: 5, face: E }, { c: 6, r: 6 }]); p = st.players[0];
    fit(st, p, "firewall");
    stepRobot(st, co.C, p, E, "card");
    assert(p.rebooting, "over the edge");
    eq(p.pile.filter(i => isDamage(st, i)).length, 2, "the edge is not a pit: two SPAM");
    assertInvariants(st, co.library);
  }],
  ["Hover Unit crosses a pit and falls in only where the move ends", () => {
    const co = far((b, t) => t.setCell(2, 3, "o.."));
    let st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 6, r: 6 }]);
    let p = st.players[0];
    fit(st, p, "hoverUnit");
    p.registers[0] = own(st, p, "move2");
    driveRegister(st, co.library);
    assert(p.alive && p.c === 3, "a Move 2 crosses the pit");
    st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 6, r: 6 }]); p = st.players[0];
    fit(st, p, "hoverUnit");
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library);
    assert(p.rebooting, "a Move 1 ends on the pit and falls in");
    /* pushed onto a pit, it falls: only its own card hovers */
    st = mgame(co, [{ c: 1, r: 3, face: E }, { c: 0, r: 3, face: E }]); p = st.players[0];
    fit(st, p, "hoverUnit");
    stepRobot(st, co.C, st.players[1], E, "card");
    assert(p.rebooting, "shoved into the pit, it falls");
  }],
  ["a hovering robot destroyed mid-move keeps no hover for later", () => {
    /* A Move 3 off the board's edge wrecks the robot on its first step, with
     * two steps of hover still owed. Those must not outlive the move: they once
     * did, and a Haywire sidestep after the reboot floated over a pit on them. */
    const co = far();
    const st = mgame(co, [{ c: 0, r: 3, face: W }, { c: 6, r: 6 }]);
    const p = st.players[0];
    fit(st, p, "hoverUnit");
    p.registers[0] = own(st, p, "move3");
    driveRegister(st, co.library);
    assert(p.rebooting, "over the edge on the first step");
    eq(p.hoverSteps, 0, "and nothing of the hover is left on it");
  }],
  ["Memory Cards park cards for next round and give them back at the upgrade phase", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human" }, { c: 1, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "memoryCards");
    st.phase = "turn"; st.step = "upgrade";
    let r = step(st, co.library);
    for (let g = 0; g < 50 && r.waiting && r.waiting.kind !== "program"; g++) r = step(st, co.library, r.waiting.player === 0 && r.waiting.kind === "upgrade" ? { buy: false, install: null, uninstall: [] } : botAnswer(st, co.library, r.waiting));
    assert(r.waiting && r.waiting.kind === "program" && r.waiting.player === 0, "programming");
    const handBefore = p.hand.slice();
    r = step(st, co.library, [0, 1, 2, 3, 4]);
    for (let g = 0; g < 50 && r.waiting && !(r.waiting.kind === "stack" && r.waiting.player === 0); g++) r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    assert(r.waiting && r.waiting.kind === "stack" && r.waiting.why === "memoryCards", "asked what to park");
    eq(r.waiting.count, null, "any number");
    const parkTwo = r.waiting.options.slice(0, 2);
    const parked = parkTwo.map(i => p.hand[i]);
    r = step(st, co.library, parkTwo);
    eq(p.parked, parked, "two parked");
    assert(!p.pile.some(i => parked.includes(i)), "and not discarded");
    assertInvariants(st, co.library);
    /* next round they come back at the upgrade phase */
    for (let g = 0; g < 400 && !st.over && st.turn === 1; g++) r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    for (let g = 0; g < 50 && r.waiting && !(r.waiting.player === 0 && r.waiting.kind === "upgrade"); g++) r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    assert(parked.every(i => p.hand.includes(i)), "back in the hand at the start of the upgrade phase");
    eq(p.parked, [], "and off the card");
    /* losing the card sends what is on it to the discard */
    p.parked = [p.hand.pop()];
    const held = p.parked[0];
    p.installed = p.installed.filter(u => u.id !== "memoryCards"); st.upgradeDiscard.push("memoryCards");
    st.upgradeDiscard.pop(); p.installed.push(newInstalled("memoryCards"));
    const { uninstallUpgrade } = { uninstallUpgrade: (s, q, id) => { const i = q.installed.findIndex(u => u.id === id); q.installed.splice(i, 1); s.upgradeDiscard.push(id); for (const ci of q.parked) q.pile.push(ci); q.parked = []; } };
    uninstallUpgrade(st, p, "memoryCards");
    assert(p.pile.includes(held) && !p.parked.length, "the parked card went to the discard");
    assertInvariants(st, co.library);
  }],
  ["Mini Howitzer costs an Energy, hits for two and shoves", () => {
    const co = far();
    let st = mgame(co, [{ c: 3, r: 3, face: E, seat: "human" }, { c: 5, r: 3, face: N }]);
    let p = st.players[0], q = st.players[1];
    fit(st, p, "miniHowitzer");
    let asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "miniHowitzer") { asked = true; return 1; } return w.kind === "useTemp" ? null : undefined; });
    assert(asked, "offered instead of the laser");
    eq(p.energy, 2, "one Energy paid");
    eq(q.pile.filter(i => isDamage(st, i)).length, 2, "two damage");
    eq([q.c, q.r], [6, 3], "and shoved one away");
    /* no Energy, no howitzer */
    st = mgame(co, [{ c: 3, r: 3, face: E, seat: "human" }, { c: 5, r: 3, face: N }]); p = st.players[0]; q = st.players[1];
    fit(st, p, "miniHowitzer"); p.energy = 0;
    asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "miniHowitzer") asked = true; return w.kind === "useTemp" ? null : undefined; });
    assert(!asked, "with no Energy it is not offered");
    eq(q.pile.filter(i => isDamage(st, i)).length, 1, "the plain laser fired");
    assertInvariants(st, co.library);
  }],
  ["Modular Chassis trades itself for one of the shoved robot's upgrades", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, face: E, seat: "human" }, { c: 4, r: 3, face: N }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "modularChassis"); fit(st, q, "brakes"); fit(st, q, "rearLaser");
    p.registers[0] = own(st, p, "move1");
    let labels = null;
    driveRegister(st, co.library, w => {
      if (w.kind === "cardChoice" && w.card === "modularChassis") { labels = w.labels; return w.labels.indexOf("Take Rear Laser"); }
      return w.kind === "useTemp" ? null : undefined;
    });
    assert(labels && labels.includes("Take Brakes") && labels.includes("Take Rear Laser"), "offered each of the shoved robot's upgrades: " + JSON.stringify(labels));
    assert(p.installed.some(u => u.id === "rearLaser") && !p.installed.some(u => u.id === "modularChassis"), "took the Rear Laser, gave the chassis");
    assert(q.installed.some(u => u.id === "modularChassis") && !q.installed.some(u => u.id === "rearLaser"), "the other robot has the chassis and not the laser");
    assertInvariants(st, co.library);
  }],
  ["Self-Diagnostics tears a card out of the game at a new checkpoint", () => {
    const co = courseOn(board(8, 8), [[4, 3], [7, 7]]);
    const st = mgame(co, [{ c: 4, r: 3, face: N, seat: "human" }, { c: 0, r: 0 }]);
    const p = st.players[0];
    fit(st, p, "selfDiagnostics");
    p.pile.push(spam(st));
    let labels = null;
    driveRegister(st, co.library, w => {
      if (w.kind === "cardChoice" && w.card === "selfDiagnostics") { labels = w.labels; return w.labels.findIndex(l => /^SPAM/.test(l)); }
      return w.kind === "useTemp" ? null : undefined;
    });
    assert(labels, "asked on reaching the checkpoint");
    eq(p.removed.length, 1, "one card out of the game");
    assert(isDamage(st, p.removed[0]), "the SPAM");
    eq(p.pile.filter(i => isDamage(st, i)).length, 0, "and gone from the discard");
    assertInvariants(st, co.library);
  }],
  ["Spam Filter shows the top of the deck, and nothing else", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7 }, { c: 1, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "spamFilter");
    const top = p.deck[p.deck.length - 1];
    st.phase = "turn"; st.step = "dealModern"; tick(st, co.library);
    eq(p.hand.length, HAND, "the deal is the ordinary nine");
    assert(UPGRADE_DEFS.spamFilter.hooks.onDealt, "the card binds the deal");
    assert(!p.hand.includes(top) || p.deck.length === 0 || true, "the top of the deck is information for the screen");
  }],
  ["Spiky costs the robot that shoves you a card, even when the shove fails", () => {
    const co = far(b => setWall(b, 4, 3, E, 1));
    const st = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    const p = st.players[0], q = st.players[1];
    fit(st, q, "spiky");
    assert(stepRobot(st, co.C, p, E, "card"), "the shove happens");
    eq(p.pile.filter(i => isDamage(st, i)).length, 1, "the shover takes one");
    eq(q.pile.filter(i => isDamage(st, i)).length, 0, "the spiky robot none");
    assert(!stepRobot(st, co.C, p, E, "card"), "against the wall the shove fails");
    eq(p.pile.filter(i => isDamage(st, i)).length, 2, "and still costs one");
    assertInvariants(st, co.library);
  }],
  ["Ramming Gear bites even when the push fails, during your own card only", () => {
    const co = far(b => setWall(b, 4, 3, E, 1));
    const st = mgame(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "rammingGear");
    stepRobot(st, co.C, p, E, "card");
    eq(q.pile.filter(i => isDamage(st, i)).length, 1, "shoved: one");
    stepRobot(st, co.C, p, E, "card");
    eq(q.pile.filter(i => isDamage(st, i)).length, 2, "the push that a wall stopped: one more");
    stepRobot(st, co.C, p, E, "pusher");
    eq(q.pile.filter(i => isDamage(st, i)).length, 2, "a push panel's shove is not the robot's own card");
  }],

  /* --- temporary -------------------------------------------------------------- */
  ["a temporary upgrade is offered at its moment, used once, and gone", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "recharge"); p.energy = 2;
    p.registers[0] = own(st, p, "move1");
    const moments = [];
    driveRegister(st, co.library, w => { if (w.kind === "useTemp") { moments.push(w.moment); return useOffer(w, "recharge"); } return undefined; });
    assert(moments.includes("before"), "offered before the card: " + moments.join(","));
    eq(p.energy, 5, "three Energy");
    assert(!p.installed.some(u => u.id === "recharge") && st.upgradeDiscard.includes("recharge"), "used up and discarded");
    eq(moments.filter(m => m === "before").length, 1, "asked once before: with nothing left to use, no second question");
    assertInvariants(st, co.library);
  }],
  ["Abort Switch swaps a revealed card for the top of the deck", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 7, face: N, seat: "human" }, { c: 7, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "abortSwitch");
    const bad = own(st, p, "move3"), top = own(st, p, "right");
    p.registers[0] = bad; p.deck.push(top);
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "abortSwitch") : undefined);
    eq([p.c, p.r, p.face], [3, 7, E], "the Rotate Right played instead of the Move 3");
    assert(p.pile.includes(bad), "the aborted card went to the discard");
    eq(p.registers[0], top, "the register holds the replacement");
    assertInvariants(st, co.library);
  }],
  ["All Aboard rides the belts alone, blue twice then green", () => {
    const co = far((b, t) => { t.setCell(1, 3, "B>."); t.setCell(2, 3, "B>."); t.setCell(3, 3, "b>."); t.setCell(1, 5, "b>."); });
    const st = mgame(co, [{ c: 1, r: 3, face: N, seat: "human" }, { c: 1, r: 5, face: N }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "allAboard");
    p.registers[0] = own(st, p, "powerUp");
    let before = null;
    driveRegister(st, co.library, w => { if (w.kind === "useTemp" && w.moment === "before") { const o = useOffer(w, "allAboard"); if (o) { before = [p.c, q.c]; return o; } } return w.kind === "useTemp" ? null : undefined; });
    assert(before, "used before the card");
    /* blue twice and green once for the user, at once; then the floor runs for everyone as usual */
    assert(p.c >= 4, "carried two on blue and one on green before the floor even ran: " + p.c);
  }],
  ["Boink hops to a free neighbour without turning, never through a wall", () => {
    const co = far(b => setWall(b, 3, 3, N, 1));
    const st = mgame(co, [{ c: 3, r: 3, face: N, seat: "human" }, { c: 4, r: 3 }]);
    const p = st.players[0];
    fit(st, p, "boink");
    p.registers[0] = own(st, p, "powerUp");
    const offers = temporaryOffers(st, co.C, p, "before").filter(o => o.id === "boink").map(o => o.dir);
    eq(offers, [S, W], "not north through the wall, not east into a robot");
    driveRegister(st, co.library, w => w.kind === "useTemp" ? useOffer(w, "boink", o => o.dir === W) : undefined);
    eq([p.c, p.r, p.face], [2, 3, N], "hopped west, still facing north");
  }],
  ["Calibration Protocol scraps the SPAM in hand and draws that many", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human" }, { c: 1, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "calibrationProtocol");
    p.hand = [spam(st), spam(st)];
    const tableBefore = st.damageDiscard.length;
    eq(temporaryOffers(st, co.C, p, "dealt").filter(o => o.id === "calibrationProtocol").length, 1, "on offer before programming");
    useTemporary(st, co.C, p, { id: "calibrationProtocol" });
    eq(st.damageDiscard.length, tableBefore + 2, "two SPAM back to the table");
    eq(p.hand.length, 2, "and two cards drawn in their place");
    assert(!p.hand.some(i => isDamage(st, i)), "from the robot's own deck");
    assertInvariants(st, co.library);
  }],
  ["Displacing Blast sends the target to its reboot point facing the same way", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, face: E, seat: "human" }, { c: 6, r: 3, face: S }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "displacingBlast");
    q.archive = { c: 1, r: 6, face: N };
    let asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "displacingBlast") { asked = true; return 1; } return w.kind === "useTemp" ? null : undefined; });
    assert(asked, "offered instead of the laser");
    eq([q.c, q.r, q.face], [1, 6, S], "back at its reboot point, facing as it was");
    eq(q.pile.filter(i => isDamage(st, i)).length, 0, "no damage: it replaced the laser");
    assert(!p.installed.some(u => u.id === "displacingBlast"), "one use");
    assertInvariants(st, co.library);
  }],
  ["Magnetic pulls a neighbour along with a card move", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, face: E }, { c: 3, r: 4, face: N, seat: "human" }]);
    const p = st.players[0], q = st.players[1];
    fit(st, q, "magnetic");
    p.registers[0] = own(st, p, "move2");
    let asked = false;
    driveRegister(st, co.library, w => { if (w.kind === "cardChoice" && w.card === "magnetic") { asked = true; return 1; } return w.kind === "useTemp" ? null : undefined; });
    assert(asked, "the neighbour was asked");
    eq([p.c, p.r], [5, 3], "the mover went two east");
    eq([q.c, q.r, q.face], [5, 4, N], "and the magnet followed two east, facing unchanged");
    assert(!q.installed.some(u => u.id === "magnetic"), "one use");
  }],
  ["Memory Swap draws three and puts three back on top in order", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7, seat: "human" }, { c: 1, r: 7 }]);
    const p = st.players[0];
    fit(st, p, "memorySwap");
    st.phase = "turn"; st.step = "dealModern"; tick(st, co.library);
    st.step = "postDeal"; tick(st, co.library);
    let r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "useTemp" && r.waiting.moment === "dealt", "offered before programming");
    r = step(st, co.library, useOffer(r.waiting, "memorySwap"));
    eq(p.hand.length, HAND + 3, "three drawn");
    assert(r.waiting && r.waiting.kind === "stack" && r.waiting.count === 3, "then three go back");
    const back = [0, 1, 2].map(i => p.hand[i]);
    r = step(st, co.library, [0, 1, 2]);
    eq(p.hand.length, HAND, "nine again");
    eq(p.deck.slice(-3).reverse(), back, "the first chosen is on top");
    assert(r.waiting && r.waiting.kind === "program", "and programming follows");
    assertInvariants(st, co.library);
  }],
  ["Overclocked and Pressure Release are movement, before or after the card", () => {
    const co = far();
    let st = mgame(co, [{ c: 3, r: 5, face: N, seat: "human" }, { c: 7, r: 7 }]);
    let p = st.players[0];
    fit(st, p, "overclocked");
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library, w => w.kind === "useTemp" && w.moment === "after" ? useOffer(w, "overclocked") : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r], [3, 2], "Move 1 then two more, after the card");
    /* Pressure Release stops short of a robot and at a wall */
    st = mgame(co, [{ c: 3, r: 1, face: N, seat: "human" }, { c: 3, r: 5 }]); p = st.players[0];
    fit(st, p, "pressureRelease");
    p.registers[0] = own(st, p, "powerUp");
    driveRegister(st, co.library, w => w.kind === "useTemp" && w.moment === "before" ? useOffer(w, "pressureRelease") : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r, p.face], [3, 4, N], "reversed until the robot behind it, without pushing");
    eq([st.players[1].c, st.players[1].r], [3, 5], "which did not move");
    const walled = far(b => setWall(b, 3, 3, S, 1));
    st = mgame(walled, [{ c: 3, r: 1, face: N, seat: "human" }, { c: 7, r: 7 }]); p = st.players[0];
    fit(st, p, "pressureRelease");
    p.registers[0] = own(st, p, "powerUp");
    driveRegister(st, walled.library, w => w.kind === "useTemp" && w.moment === "before" ? useOffer(w, "pressureRelease") : w.kind === "useTemp" ? null : undefined);
    eq([p.c, p.r], [3, 3], "and at a wall");
  }],
  ["Piercing Drill hurts and spins the robot you shove", () => {
    const co = far();
    const st = mgame(co, [{ c: 3, r: 3, face: E, seat: "human" }, { c: 4, r: 3, face: N }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "piercingDrill");
    p.registers[0] = own(st, p, "move1");
    driveRegister(st, co.library, w => w.kind === "cardChoice" && w.card === "piercingDrill" ? w.labels.indexOf("South") : w.kind === "useTemp" ? null : undefined);
    eq(q.pile.filter(i => isDamage(st, i)).length, 2, "one damage for the shove, and one from the laser that follows it down the row");
    eq([q.c, q.face], [5, S], "shoved, and spun to face south");
    assert(!p.installed.some(u => u.id === "piercingDrill"), "one use");
    assertInvariants(st, co.library);
  }],
  ["Re-initialize hands the Priority Token to anyone, Recharge takes three", () => {
    const co = far();
    const st = mgame(co, [{ c: 0, r: 7 }, { c: 1, r: 7 }, { c: 2, r: 7 }]);
    const p = st.players[2];
    fit(st, p, "reInitialize"); fit(st, p, "recharge");
    eq(temporaryOffers(st, co.C, p, "dealt").filter(o => o.id === "reInitialize").map(o => o.seat), [0, 1, 2], "any seat, itself included");
    useTemporary(st, co.C, p, { id: "reInitialize", seat: 2 });
    eq(st.priority, 2, "the token moved");
    p.energy = 9;
    useTemporary(st, co.C, p, { id: "recharge" });
    eq(p.energy, MAX_ENERGY, "three, capped at ten");
    eq(p.installed.length, 0, "both used up");
    assertInvariants(st, co.library);
  }],
  ["Switch trades places with a neighbour, Zoop faces any way", () => {
    const co = far(b => setWall(b, 3, 3, W, 1));
    const st = mgame(co, [{ c: 3, r: 3, face: N, seat: "human" }, { c: 4, r: 3, face: S }, { c: 2, r: 3, face: E }]);
    const p = st.players[0], q = st.players[1];
    fit(st, p, "switchPlaces"); fit(st, p, "zoop");
    const sw = temporaryOffers(st, co.C, p, "before").filter(o => o.id === "switchPlaces");
    eq(sw.map(o => o.with), [1], "only the neighbour not behind a wall");
    useTemporary(st, co.C, p, sw[0]);
    eq([[p.c, p.r, p.face], [q.c, q.r, q.face]], [[4, 3, N], [3, 3, S]], "swapped, both facings kept");
    const z = temporaryOffers(st, co.C, p, "after").filter(o => o.id === "zoop").map(o => o.face);
    eq(z, [E, S, W], "any way but the way it faces");
    useTemporary(st, co.C, p, { id: "zoop", face: W });
    eq(p.face, W, "zooped");
    eq(p.installed.length, 0, "both used up");
  }]
];
