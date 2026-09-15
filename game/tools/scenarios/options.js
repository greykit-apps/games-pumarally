/* The option cards, one scenario each, named as the old suite named them. */
import { board, courseOn, game, give, runRegister, N, E, S, W } from "./harness.js";
import { stepRobot, beltPass, gearPass, laserPass, checkpointPass, damage, destroy } from "../../engine/rules.js";
import { step, tick } from "../../engine/machine.js";
import { newGame } from "../../engine/state.js";
import { runGame } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";
import * as OPTS from "../../engine/options.js";
import { OPTION_DEFS, OPTION_IDS, HOOKS, OPTION_LIMIT, fire } from "../../engine/options.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };
const plain = edit => courseOn(board(8, 8, edit));
/* a robot at (3,3) walled in on all four sides: it can run any dealt program without leaving the square */
const penned = () => plain((b, t) => { t.wall(3, 3, N); t.wall(3, 3, E); t.wall(3, 3, S); t.wall(3, 3, W); });

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
  }],
  ["a card dealt at the start carries its state, so a coat wears out", () => {
    /* the starting-options house rule handed cards out without their state:
     * an Ablative Coat with no charges absorbed forever and turned damage
     * into NaN, which every range check waved through. Seen on screen. */
    const co = plain();
    const st = newGame({ seed: 7, course: co.doc, seats: new Array(8).fill(0).map(() => ({ seat: "bot" })), house: { startOptions: 3 } });
    let coats = 0;
    for (const p of st.players) for (const o of p.options) {
      const def = OPTION_DEFS[o.id];
      if (!def.init) continue;
      coats++;
      eq(o.st, def.init(), p.name + "'s " + def.name + " starts with its state");
    }
    assert(coats >= 1, "three cards to eight seats deals twenty-four of the twenty-seven: at least one of the three cards with state is in a hand");
    /* the coat itself may be among the three left in the deck: then it is dealt by hand, through the same door */
    if (!st.players.some(p => p.options.some(o => o.id === "ablativeCoat"))) hold(st, st.players[0], "ablativeCoat");
    /* and it wears out: three absorbed, the fourth lands, the coat is gone */
    const holder = st.players.find(p => p.options.some(o => o.id === "ablativeCoat"));
    holder.placed = true; holder.c = 2; holder.r = 2;
    for (let k = 0; k < 4; k++) damage(st, co.C, holder, 1, "burner");
    eq(holder.damage, 1, "three points absorbed, the fourth landed");
    assert(!holder.options.some(o => o.id === "ablativeCoat"), "the coat burnt out");
    assert(st.optionDiscard.indexOf("ablativeCoat") >= 0, "and is on the discard");
  }],
  /* --- the AMIGO box's eleven ------------------------------------------------ */

  ["Reverse Gear may back up two", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 4, face: N, seat: "human" }]);
    hold(st, st.players[0], "reverseGear");
    give(st, st.players[0], 0, "back");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "reverseGear", "asked before moving");
    step(st, co.library, 1);
    eq([st.players[0].c, st.players[0].r, st.players[0].face], [3, 6, N], "two squares back, still facing north");
  }],
  ["Fourth Gear may move four", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 6, face: N, seat: "human" }]);
    hold(st, st.players[0], "fourthGear");
    give(st, st.players[0], 0, "move3");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "fourthGear", "asked before moving");
    step(st, co.library, 1);
    eq(st.players[0].r, 2, "four squares north");
  }],
  ["the gears leave every other move alone", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 5, face: N, seat: "human" }]);
    hold(st, st.players[0], "fourthGear"); hold(st, st.players[0], "reverseGear");
    give(st, st.players[0], 0, "move2");
    runRegister(st, co.library);
    eq(st.players[0].r, 3, "a Move 2 is a Move 2, and nothing was asked");
  }],
  ["Turbo Blaster hits for one and shoves, and is spent after five shots", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "turboBlaster");
    for (let k = 0; k < 5; k++) {
      st.register = k;
      const ask = laserPass(st, co.C);
      assert(ask && ask.kind === "cardChoice" && ask.card === "turboBlaster" && ask.player === 0, "shot " + (k + 1) + ": the shooter is offered the blaster");
      st.answers[ask.key] = 1;
      eq(laserPass(st, co.C), null, "answered, the pass completes");
      eq([target.c, target.damage], [5, k + 1], "shot " + (k + 1) + ": one damage and a shove east");
      target.c = 4;
    }
    eq(shooter.options.length, 0, "five shots and the blaster is spent");
    assert(st.optionDiscard.includes("turboBlaster"), "on the discard");
    st.register = 0; st.turn++;
    eq(laserPass(st, co.C), null, "the sixth register asks nothing");
    eq([target.c, target.damage], [4, 6], "the main laser, unshoved");
  }],
  ["Turbo Blaster's point goes through the target's coat", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "turboBlaster"); hold(st, target, "ablativeCoat");
    const ask = laserPass(st, co.C);
    st.answers[ask.key] = 1;
    laserPass(st, co.C);
    eq([target.c, target.damage, target.options[0].st.charges], [5, 0, 2], "shoved, the point absorbed, a charge spent");
  }],
  ["Shield stops one point from the front each register, not from the side", () => {
    const co = plain();
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: W }]);
    const target = st.players[1];
    hold(st, target, "shield");
    fireLasers(st, co);
    eq(target.damage, 0, "a shot into the front bounces off");
    fireLasers(st, co);
    eq(target.damage, 1, "the second shot in the same register lands");
    st.register = 1;
    target.face = N;
    fireLasers(st, co);
    eq(target.damage, 2, "a shot into the side lands");
    st.register = 2;
    target.face = W;
    fireLasers(st, co);
    eq(target.damage, 2, "and the next register the front is covered again");
  }],
  ["Shield takes one point off a double-barreled shot", () => {
    const co = plain();
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: W }]);
    hold(st, st.players[0], "doubleBarreledLaser"); hold(st, st.players[1], "shield");
    fireLasers(st, co);
    eq(st.players[1].damage, 1, "two less one");
  }],
  ["Remote Control runs the controller's program on the target for the rest of the turn", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "remoteControl");
    give(st, shooter, 1, "uturn"); give(st, target, 1, "move1");
    const ask = laserPass(st, co.C);
    assert(ask && ask.kind === "cardChoice" && ask.card === "remoteControl", "offered instead of the shot");
    st.answers[ask.key] = 1;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([target.damage, target.controlledBy], [0, 0], "undamaged, and under control");
    st.register = 1;
    runRegister(st, co.library);
    eq([target.face, target.c, target.r], [S, 4, 3], "the target u-turned as the controller did, instead of its own Move 1");
    st.phase = "cleanup"; st.step = "endTurn";
    tick(st, co.library);
    eq(target.controlledBy, null, "released at the end of the turn");
  }],
  ["Remote Control reaches six squares and no further", () => {
    const co = plain();
    const st = game(co, [{ c: 0, r: 3, face: E }, { c: 7, r: 3, face: N }]);
    hold(st, st.players[0], "remoteControl");
    eq(laserPass(st, co.C), null, "seven squares away: nothing is offered");
    eq(st.players[1].damage, 1, "the laser fires as usual");
    st.register = 1; st.players[1].c = 6;
    const ask = laserPass(st, co.C);
    assert(ask && ask.card === "remoteControl", "six squares away: offered");
  }],
  ["Turret aims the laser at a robot beside you", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N }, { c: 6, r: 3, face: N }]);
    hold(st, st.players[0], "turret");
    const ask = laserPass(st, co.C);
    assert(ask && ask.kind === "cardChoice" && ask.card === "turret", "asked where to aim");
    assert(/east/.test(ask.labels[0]) && /Straight ahead/.test(ask.labels[1]), "east, at the robot, or straight ahead at nothing: " + ask.labels.join(" / "));
    st.answers[ask.key] = 0;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([st.players[1].damage, st.players[0].face], [1, N], "hit to the east without turning");
  }],
  ["Turret carries the optional weapons round with it", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N }, { c: 6, r: 3, face: N }]);
    hold(st, st.players[0], "turret"); hold(st, st.players[0], "pressorBeam");
    let ask = laserPass(st, co.C);
    st.answers[ask.key] = 0;
    ask = laserPass(st, co.C);
    assert(ask && ask.card === "pressorBeam", "the pressor beam is offered along the turret's line");
    st.answers[ask.key] = 1;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([st.players[1].c, st.players[1].damage], [7, 0], "shoved east, the way the turret was aimed");
  }],
  ["two robots with optional weapons both get their choice in one volley", () => {
    /* the pass re-runs from the top for each question; the first robot's
     * answer was applied once and then reported as used, so its choice fell
     * back to the main laser while the second was being asked */
    const co = plain();
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 1, r: 5, face: E }, { c: 3, r: 3, face: E }, { c: 3, r: 5, face: E }]);
    hold(st, st.players[0], "pressorBeam"); hold(st, st.players[1], "tractorBeam");
    let ask = laserPass(st, co.C);
    assert(ask && ask.card === "pressorBeam" && ask.player === 0, "the first shooter is asked");
    st.answers[ask.key] = 1;
    ask = laserPass(st, co.C);
    assert(ask && ask.card === "tractorBeam" && ask.player === 1, "then the second");
    st.answers[ask.key] = 1;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([st.players[2].c, st.players[2].damage], [4, 0], "the first target was shoved, not shot");
    eq([st.players[3].c, st.players[3].damage], [2, 0], "the second was pulled, not shot");
  }],
  ["Fire Control locks a register through the next turn", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "fireControl");
    const held = give(st, target, 2, "move3");
    const ask = laserPass(st, co.C);
    assert(ask && ask.kind === "cardChoice" && ask.card === "fireControl" && ask.player === 0, "the shooter must choose");
    eq(ask.labels, ["Lock its register 3"], "the one register holding a card is the only thing to lock");
    st.answers[ask.key] = 0;
    eq(laserPass(st, co.C), null, "answered, the pass completes");
    eq([target.damage, target.locks[2]], [1, st.turn], "the damage lands and the register is locked");
    st.phase = "cleanup"; st.step = "discard";
    tick(st, co.library);
    eq(target.registers[2], held, "the card stays through the cleanup");
    st.turn++;
    st.phase = "cleanup"; st.step = "discard";
    tick(st, co.library);
    eq([target.registers[2], st.discard.includes(held)], [null, true], "and goes at the end of the next turn");
  }],
  ["Fire Control may destroy an option card instead", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "fireControl"); hold(st, target, "brakes");
    give(st, target, 0, "move1");
    const ask = laserPass(st, co.C);
    const i = ask.labels.indexOf("Destroy its Brakes");
    assert(i > 0, "the target's card is on the list: " + ask.labels.join(" / "));
    st.answers[ask.key] = i;
    fireLasers(st, co);
    eq([target.damage, target.options.length, st.optionDiscard.includes("brakes")], [1, 0, true], "damaged, and the Brakes are gone");
  }],
  ["Fire Control lands only with the damage", () => {
    const { co, st, shooter, target } = range();
    hold(st, shooter, "fireControl"); hold(st, target, "ablativeCoat");
    give(st, target, 0, "move1");
    const ask = laserPass(st, co.C);
    st.answers[ask.key] = 0;
    laserPass(st, co.C);
    eq([target.damage, target.locks[0]], [0, null], "the coat ate the point, and no register was locked");
  }],
  ["Circuit Breaker forces a power down at three damage", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human", damage: 3 }, { c: 5, r: 3, seat: "human", damage: 3 }]);
    hold(st, st.players[0], "circuitBreaker");
    st.phase = "cleanup"; st.step = "endTurn";
    tick(st, co.library);
    eq([st.players[0].poweredDown, st.players[1].poweredDown], [true, false], "three damage trips the breaker; the robot without one runs on");
    st.players[0].poweredDown = false; st.players[0].damage = 2;
    st.phase = "cleanup"; st.step = "endTurn";
    tick(st, co.library);
    eq(st.players[0].poweredDown, false, "two damage does not");
  }],
  ["Emergency Switch replaces the register and every one after it from the deck", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    hold(st, st.players[0], "emergencySwitch");
    give(st, st.players[0], 0, "uturn"); give(st, st.players[0], 1, "uturn"); give(st, st.players[0], 2, "uturn");
    st.phase = "exec"; st.step = "reveal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "emergencySwitch", "asked as the first card is about to be revealed");
    step(st, co.library, 1);
    eq(st.log.filter(l => /hits the emergency switch/.test(l.msg)).length, 1, "thrown once");
    eq(st.log.filter(l => /is replaced from the deck/.test(l.msg)).length, 3, "and every card after it was replaced without asking");
  }],
  ["Emergency Switch leaves a locked register alone", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human", damage: 5 }]);
    hold(st, st.players[0], "emergencySwitch");
    give(st, st.players[0], 0, "move1"); give(st, st.players[0], 4, "uturn");
    st.phase = "exec"; st.step = "reveal";
    step(st, co.library);
    step(st, co.library, 1);
    eq(st.log.filter(l => /is replaced from the deck/.test(l.msg)).length, 1, "the open register was replaced, the locked one kept its card");
  }],
  ["Command in Reserve holds a sixth card and swaps it in for a register", () => {
    const co = penned();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    const p = st.players[0];
    hold(st, p, "commandInReserve");
    st.phase = "turn"; st.step = "deal";
    let r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "program", "dealt and asked to program");
    r = step(st, co.library, [0, 1, 2, 3, 4]);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "commandInReserve", "then asked what to keep in reserve");
    eq(r.waiting.labels.length, 5, "none, or one of the four left in hand");
    r = step(st, co.library, 1);
    assert(Number.isInteger(p.reserve) && p.hand.length === 3, "one card lies on the option card, three stay in hand");
    const reserve = p.reserve, first = p.registers[0];
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "commandInReserve" && st.register === 0, "register 1: asked whether to swap");
    st.answers[r.waiting.key] = 1; st.waiting = null;
    tick(st, co.library);
    eq([p.registers[0], st.discard.includes(first), p.reserve], [reserve, true, null], "the reserve is in the register and the card it replaced on the discard");
    r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "program" && st.turn === 2, "no further question this turn: the reserve was spent");
  }],
  ["Flywheel carries a card past the reshuffle into next turn's hand", () => {
    const co = penned();
    const st = game(co, [{ c: 3, r: 3, face: N, seat: "human" }]);
    const p = st.players[0];
    hold(st, p, "flywheel");
    st.phase = "turn"; st.step = "deal";
    step(st, co.library);
    let r = step(st, co.library, [0, 1, 2, 3, 4]);
    assert(r.waiting && r.waiting.kind === "cardChoice" && r.waiting.card === "flywheel", "asked what to spin on");
    st.answers[r.waiting.key] = 1; st.waiting = null;
    tick(st, co.library);
    const spun = p.flywheel;
    assert(Number.isInteger(spun) && p.hand.length === 3, "a card is on the flywheel, three stay in hand");
    r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "program" && st.turn === 2, "the turn ran through to the next deal");
    assert(p.hand.includes(spun) && p.hand.length === 10 && p.flywheel === null, "and the card is in the new hand, on top of the nine");
  }],
  ["a wreck sends the reserve and flywheel cards back to the table", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human" }]);
    const p = st.players[0];
    hold(st, p, "commandInReserve"); hold(st, p, "flywheel");
    p.reserve = st.deck.pop(); p.flywheel = st.deck.pop();
    const a = p.reserve, b = p.flywheel;
    destroy(st, co.C, p, "in a test");
    eq([p.reserve, p.flywheel, st.discard.includes(a), st.discard.includes(b)], [null, null, true, true], "both on the discard");
  }],
  ["losing the option card sends the program card on it back too", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human" }]);
    const p = st.players[0];
    hold(st, p, "flywheel");
    p.flywheel = st.deck.pop();
    const b = p.flywheel;
    p.options = []; st.optionDiscard.push("flywheel");
    p.options.push({ id: "flywheel", st: {} }); st.optionDiscard.pop();
    const { dropOptionAt } = OPTS;
    dropOptionAt(st, p, 0, "gives up");
    eq([p.flywheel, st.discard.includes(b)], [null, true], "the card went with it");
  }]
];
