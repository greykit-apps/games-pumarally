/* The option cards, one scenario each, named as the old suite named them. */
import { board, courseOn, game, give, runRegister, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, gearPass, laserPass, checkpointPass } from "../../engine/rules.js";
import { step } from "../../engine/machine.js";
import { runGame } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";
import { OPTION_DEFS, OPTION_IDS, HOOKS, OPTION_LIMIT, fire } from "../../engine/options.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };
const plain = edit => courseOn(board(8, 8, edit));

/** Hand a robot a card straight from the option deck, keeping the count honest. */
function hold(st, p, id) {
  const i = st.optionDeck.indexOf(id);
  if (i < 0) throw new Error(id + " is not in the option deck");
  st.optionDeck.splice(i, 1);
  const def = OPTION_DEFS[id];
  p.options.push({ id, st: def.init ? def.init() : {} });
}

/** Fire the lasers, answering every option-exchange question with "take the damage". */
function fireLasers(st, co) {
  for (let guard = 0; guard < 20; guard++) {
    const ask = laserPass(st, co.C);
    if (!ask) return;
    if (!(ask.kind === "cardChoice" && ask.exchange)) throw new Error("an unexpected question: " + ask.kind + " " + (ask.card || ""));
    st.answers[ask.key] = 0;
  }
}

/* a laser range: a shooter at (1,3) facing east, a target at (4,3) */
function range(extra) {
  const co = plain(extra);
  const st = game(co, [{ c: 1, r: 3, face: E, seat: "human" }, { c: 4, r: 3, face: N, seat: "human" }]);
  return { co, st, shooter: st.players[0], target: st.players[1] };
}

export const TESTS = [
  ["the table rejects a card bound to a hook that does not exist", () => {
    for (const id of OPTION_IDS) for (const h of Object.keys(OPTION_DEFS[id].hooks)) assert(HOOKS.includes(h), id + " binds " + h + ", which is not a hook");
  }],
  ["the table rejects a hook that no card uses", () => {
    for (const h of HOOKS) assert(OPTION_IDS.some(id => OPTION_DEFS[id].hooks[h]), "hook " + h + " is declared and no card uses it");
  }],
  ["Ablative Coat absorbs three damage and then burns off", () => {
    const { co, st, shooter, target } = range();
    hold(st, target, "ablativeCoat");
    fireLasers(st, co); fireLasers(st, co); fireLasers(st, co);
    eq(target.damage, 0, "three shots absorbed");
    eq(target.options.length, 0, "and the coat is gone");
    fireLasers(st, co);
    eq(target.damage, 1, "the fourth lands");
    assert(st.optionDiscard.includes("ablativeCoat"), "the coat went to the discard");
  }],
  ["Power Down Shield stops lasers only while powered down", () => {
    const { co, st, target } = range();
    hold(st, target, "powerDownShield");
    fireLasers(st, co);
    eq(target.damage, 1, "powered up: the shot lands");
    target.poweredDown = true;
    fireLasers(st, co);
    eq(target.damage, 1, "powered down: absorbed");
  }],
  ["Extra Memory deals one more card", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "bot" }]);
    hold(st, st.players[0], "extraMemory");
    st.phase = "turn"; st.step = "deal";
    step(st, co.library);
    eq(st.players[0].hand.length + st.players[0].registers.filter(x => x !== null).length, 10, "ten cards dealt at no damage");
  }],
  ["Gyroscopic Stabilizer ignores gears but not conveyor curves", () => {
    const co = plain((b, t) => { t.setCell(2, 2, "r.."); t.setCell(3, 5, "b>."); t.setCell(4, 5, "bvr"); t.setCell(4, 6, "bv."); });
    const st = game(co, [{ c: 2, r: 2, face: N }]);
    hold(st, st.players[0], "gyroscopicStabilizer");
    gearPass(st, co.C);
    eq(st.players[0].face, N, "the gear did not turn it");
    st.players[0].c = 3; st.players[0].r = 5;
    beltPass(st, co.C, 1, 2);
    eq(st.players[0].face, E, "the curve still did");
  }],
  ["Ramming Gear hurts the robot you shove", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 4, face: E }, { c: 3, r: 4 }]);
    hold(st, st.players[0], "rammingGear");
    stepRobot(st, co.C, st.players[0], E, "card");
    eq([st.players[0].damage, st.players[1].damage], [0, 1], "the shoved robot took one");
  }],
  ["Double-Barreled Laser does 2", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "doubleBarreledLaser");
    laserPass(st, co.C);
    eq(target.damage, 2, "two from one shot");
  }],
  ["Rear-Firing Laser shoots the robot behind you", () => {
    const co = plain();
    const st = game(co, [{ c: 4, r: 3, face: E }, { c: 1, r: 3, face: S }]);
    hold(st, st.players[0], "rearFiringLaser");
    laserPass(st, co.C);
    eq(st.players[1].damage, 1, "the robot behind was hit");
  }],
  ["High-Power Laser shoots through exactly one wall", () => {
    const co = plain((b, t) => { t.wall(2, 3, E); t.wall(3, 3, E); });
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 3, r: 3, face: N }, { c: 5, r: 3, face: N }]);
    hold(st, st.players[0], "highPowerLaser");
    laserPass(st, co.C);
    eq([st.players[1].damage, st.players[2].damage], [1, 0], "through one wall, not two");
  }],
  ["Pressor Beam shoves instead of damaging", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "pressorBeam");
    const ask = laserPass(st, co.C);
    assert(ask && ask.kind === "cardChoice" && ask.card === "pressorBeam" && ask.player === 0, "the shooter is asked");
    st.answers[ask.key] = 1;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([target.c, target.damage], [5, 0], "shoved one east, undamaged");
  }],
  ["Tractor Beam pulls instead of damaging", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "tractorBeam");
    const ask = laserPass(st, co.C);
    st.answers[ask.key] = 1;
    laserPass(st, co.C);
    eq([target.c, target.damage], [3, 0], "pulled one west, undamaged");
  }],
  ["Scrambler replaces the next register instead of damaging", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "scrambler");
    const before = give(st, target, 1, "move3");
    const ask = laserPass(st, co.C);
    st.answers[ask.key] = 1;
    laserPass(st, co.C);
    assert(target.registers[1] !== before && target.registers[1] !== null, "register 2 holds a different card");
    eq(target.damage, 0, "and no damage");
  }],
  ["an optional weapon left alone fires the main laser", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "tractorBeam");
    const ask = laserPass(st, co.C);
    st.answers[ask.key] = 0;
    laserPass(st, co.C);
    eq([target.c, target.damage], [4, 1], "damaged where it stood");
  }],
  ["Mechanical Arm touches a flag one square away", () => {
    const co = courseOn(board(8, 8), [[3, 3]]);
    const st = game(co, [{ c: 3, r: 4 }]);
    hold(st, st.players[0], "mechanicalArm");
    checkpointPass(st, co.C);
    eq(st.players[0].flags, 1, "touched from the square below");
  }],
  ["Superior Archive brings you back with 1 damage", () => {
    const co = plain();
    const st = game(co, [{ c: 5, r: 5, archive: { c: 2, r: 2, face: N } }]);
    hold(st, st.players[0], "superiorArchive");
    st.players[0].alive = false; st.players[0].lives = 2;
    st.phase = "turn"; st.step = "respawn";
    step(st, co.library);
    eq(st.players[0].damage, 1, "one damage on return");
  }],
  ["a wrecked robot loses one option card, not all of them", () => {
    const co = plain();
    const st = game(co, [{ c: 6, r: 3, face: E, seat: "bot" }, { c: 7, r: 3, seat: "bot" }]);
    hold(st, st.players[1], "brakes"); hold(st, st.players[1], "rammingGear");
    give(st, st.players[0], 0, "move1");
    st.phase = "exec"; st.step = "reveal";
    let r = step(st, co.library);
    assert(!st.players[1].alive, "pushed off the edge");
    /* a bot is asked through the same door as a person; the bot policy answers */
    assert(r.waiting && r.waiting.kind === "dropOption" && r.waiting.player === 1, "the wrecked robot is asked which card goes");
    r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    eq(st.players[1].options.length, 1, "one card lost, one kept");
  }],
  ["a wrecked human is asked which card to lose", () => {
    const co = plain();
    const st = game(co, [{ c: 6, r: 3, face: E, seat: "bot" }, { c: 7, r: 3, seat: "human" }]);
    hold(st, st.players[1], "brakes"); hold(st, st.players[1], "rammingGear");
    give(st, st.players[0], 0, "move1");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "dropOption" && r.waiting.player === 1 && r.waiting.why === "wrecked", "asked at the end of the register");
    step(st, co.library, 1);
    eq(st.players[1].options.map(o => o.id), ["brakes"], "kept the one not chosen");
  }],
  ["Superior Archive is still lost if it is your only card", () => {
    const co = plain();
    const st = game(co, [{ c: 6, r: 3, face: E, seat: "bot" }, { c: 7, r: 3, seat: "bot" }]);
    hold(st, st.players[1], "superiorArchive");
    give(st, st.players[0], 0, "move1");
    st.phase = "exec"; st.step = "reveal";
    step(st, co.library);
    eq(st.players[1].options.length, 0, "gone");
  }],
  ["a two-wrench site repairs 2 when the repair is chosen", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["upgrade"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, damage: 3, seat: "human" }]);
    st.phase = "cleanup"; st.step = "repair";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "siteChoice", "asked");
    step(st, co.library, "repair");
    eq([st.players[0].damage, st.players[0].options.length], [1, 0], "two repaired, no card");
  }],
  ["a two-wrench site gives a card instead of the repair", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["upgrade"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, damage: 3, seat: "human" }]);
    st.phase = "cleanup"; st.step = "repair";
    step(st, co.library);
    step(st, co.library, "card");
    eq([st.players[0].damage, st.players[0].options.length], [3, 1], "a card, no repair");
  }],
  ["a one-wrench site still repairs exactly 1 and asks nothing", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["repair"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, damage: 3, seat: "human" }]);
    st.phase = "cleanup"; st.step = "repair";
    const r = step(st, co.library);
    assert(!r.waiting || r.waiting.kind !== "siteChoice", "no question");
    eq(st.players[0].damage, 2, "one repaired");
  }],
  ["a powered-down robot does not acquire an option card", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["upgrade"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, damage: 0, seat: "human", poweredDown: true }]);
    st.phase = "cleanup"; st.step = "repair";
    const r = step(st, co.library);
    eq(st.players[0].options.length, 0, "nothing gained while powered down");
    assert(!r.waiting || r.waiting.kind !== "siteChoice", "and nothing asked");
  }],
  ["an option hand is capped at three, and the fourth forces one out", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["upgrade"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, damage: 0, seat: "human" }]);
    hold(st, st.players[0], "brakes"); hold(st, st.players[0], "crabLegs"); hold(st, st.players[0], "extraMemory");
    st.phase = "cleanup"; st.step = "repair";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "dropOption" && r.waiting.why === "limit", "the fourth forces a choice");
    step(st, co.library, 0);
    eq(st.players[0].options.length, OPTION_LIMIT, "back to three");
  }],
  ["a recompile throws away the hand, not the damage in it", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human", damage: 2 }]);
    hold(st, st.players[0], "recompile");
    st.phase = "turn"; st.step = "deal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "recompile", "asked after the deal");
    const before = st.players[0].hand.slice();
    step(st, co.library, 1);
    eq(st.players[0].hand.length, 7, "seven again, at two damage");
    assert(st.players[0].hand.some(i => !before.includes(i)), "and a different hand");
  }],
  ["Brakes may turn a Move 1 into standing still", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    hold(st, st.players[0], "brakes");
    give(st, st.players[0], 0, "move1");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "brakes", "asked before moving");
    step(st, co.library, 1);
    eq([st.players[0].c, st.players[0].r], [3, 3], "held still");
  }],
  ["Crab Legs sidesteps a Move 1 without turning", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    hold(st, st.players[0], "crabLegs");
    give(st, st.players[0], 0, "move1");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    step(st, co.library, 2);
    eq([st.players[0].c, st.players[0].r, st.players[0].face], [4, 3, N], "one east, still facing north");
  }],
  ["an option exchange sacrifices a card to absorb a point of damage", () => {
    const { co, st, shooter, target } = range();
    hold(st, target, "brakes"); hold(st, target, "extraMemory");
    target.damage = 9;
    const ask = laserPass(st, co.C);
    assert(ask && ask.kind === "cardChoice" && ask.exchange && ask.player === 1, "the target is asked as the damage lands");
    st.answers[ask.key] = 1;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    assert(target.alive && target.damage === 9, "the tenth point was absorbed");
    eq(target.options.length, 1, "at the cost of a card");
  }],
  ["option cards are conserved across a whole game", () => {
    const co = courseOn(board(8, 8, b => { b.sites.set("3,3", ["upgrade"]); b.sites.set("5,5", ["upgrade"]); }), [[1, 1], [6, 2]]);
    const r = runGame({ seed: 21, course: co.doc, seats: [{ seat: "human" }, { seat: "bot" }, { seat: "human" }], house: { startOptions: 3 }, library: co.library });
    assert(r.state.over, "the game ended");
    let n = r.state.optionDeck.length + r.state.optionDiscard.length;
    for (const p of r.state.players) n += p.options.length;
    eq(n, OPTION_IDS.length, "sixteen at the end");
  }]
];
