/* The classic rules, one scenario each, named as the old suite named them.
 *
 * Each entry's `name` must appear in scenarios.js with status "ported"; the
 * runner asserts the two lists agree in both directions, so a scenario cannot
 * be marked ported without a test and a test cannot exist without its name
 * on the list.
 */
import { board, courseOn, game, give, runRegister, drive, N, E, S, W } from "./harness.js";
import {
  stepRobot, beltPass, gearPass, pusherPass, laserPass, checkpointPass, computeLaserHits, damage
} from "../../engine/rules.js";
import { openRegisters, cardsDealt, CLASSIC_DECK } from "../../engine/cards.js";
import { newGame, LIVERIES } from "../../engine/state.js";
import { step, tick } from "../../engine/machine.js";
import { runGame } from "../../engine/sim.js";
import { botAnswer } from "../../engine/bots.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

/* a plain floor with a wall drawn where the test says */
const plain = edit => courseOn(board(8, 8, edit));

export const TESTS = [
  ["a robot pushes the robot in front of it", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 4, face: E }, { c: 3, r: 4, face: N }]);
    assert(stepRobot(st, co.C, st.players[0], E, "card"), "the step happened");
    eq([st.players[0].c, st.players[1].c], [3, 4], "both moved one east");
  }],
  ["a wall stops the whole push chain, pusher included", () => {
    const co = plain((b, t) => t.wall(4, 4, E));
    const st = game(co, [{ c: 2, r: 4, face: E }, { c: 3, r: 4 }, { c: 4, r: 4 }]);
    assert(!stepRobot(st, co.C, st.players[0], E, "card"), "nothing moved");
    eq(st.players.map(p => p.c), [2, 3, 4], "everyone where they were");
  }],
  ["pushing a robot off the edge destroys only it", () => {
    const co = plain();
    const st = game(co, [{ c: 6, r: 3, face: E }, { c: 7, r: 3 }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    assert(st.players[0].alive && st.players[0].c === 7, "the pusher stands on the edge square");
    assert(!st.players[1].alive && st.players[1].lives === 2, "the pushed robot went over and lost a life");
  }],
  ["a wall cancels the rest of a multi-square move", () => {
    const co = plain((b, t) => t.wall(3, 4, E));
    const st = game(co, [{ c: 1, r: 4, face: E }]);
    give(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    eq(st.players[0].c, 3, "stopped at the wall, the third square lost");
  }],
  ["Back Up moves backwards without turning", () => {
    const co = plain();
    const st = game(co, [{ c: 4, r: 4, face: N }]);
    give(st, st.players[0], 0, "back");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].r, st.players[0].face], [4, 5, N], "one south, still facing north");
  }],
  ["U-Turn reverses facing", () => {
    const co = plain();
    const st = game(co, [{ c: 4, r: 4, face: E }]);
    give(st, st.players[0], 0, "uturn");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].face], [4, W], "turned about, in place");
  }],
  ["a conveyor carries a robot one square", () => {
    const co = plain((b, t) => { t.setCell(3, 3, "b>."); t.setCell(4, 3, "b>."); });
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    beltPass(st, co.C, 1, 2);
    eq([st.players[0].c, st.players[0].face], [4, N], "one east, facing unchanged on a straight");
  }],
  ["an express conveyor moves on both passes, a normal one only on the second", () => {
    const co = plain((b, t) => { for (let c = 1; c < 7; c++) t.setCell(c, 3, "B>."); for (let c = 1; c < 7; c++) t.setCell(c, 5, "b>."); });
    const st = game(co, [{ c: 1, r: 3 }, { c: 1, r: 5 }]);
    beltPass(st, co.C, 2, 2);
    eq([st.players[0].c, st.players[1].c], [2, 1], "express pass moved the express robot only");
    beltPass(st, co.C, 1, 2);
    eq([st.players[0].c, st.players[1].c], [3, 2], "the second pass moved both");
  }],
  ["a curve rotates a robot the conveyor carried onto it", () => {
    /* a belt east into a curve that exits south. Arms are RELATIVE to the
     * exit: facing south, the west side is the belt's right, so the printed
     * shape that receives a robot from the west is `r`. */
    const co = plain((b, t) => { t.setCell(3, 3, "b>."); t.setCell(4, 3, "bvr"); t.setCell(4, 4, "bv."); });
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    beltPass(st, co.C, 1, 2);
    eq([st.players[0].c, st.players[0].r, st.players[0].face], [4, 3, E], "carried east onto the curve and turned right, north to east");
  }],
  ["a curve does NOT rotate a robot that was pushed onto it", () => {
    const co = plain((b, t) => { t.setCell(4, 3, "bvr"); t.setCell(4, 4, "bv."); });
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    eq([st.players[1].c, st.players[1].face], [4, N], "pushed onto the curve, facing unchanged");
  }],
  ["two conveyors converging on one square move neither robot", () => {
    const co = plain((b, t) => { t.setCell(3, 3, "b>."); t.setCell(5, 3, "b<."); });
    const st = game(co, [{ c: 3, r: 3 }, { c: 5, r: 3 }]);
    beltPass(st, co.C, 1, 2);
    eq([st.players[0].c, st.players[1].c], [3, 5], "neither moved");
  }],
  ["a conveyor does not push a robot standing off the belt", () => {
    const co = plain((b, t) => t.setCell(3, 3, "b>."));
    const st = game(co, [{ c: 3, r: 3 }, { c: 4, r: 3 }]);
    beltPass(st, co.C, 1, 2);
    eq([st.players[0].c, st.players[1].c], [3, 4], "the belt robot waits; the floor robot is not shoved");
  }],
  ["a conveyor carries a robot into a pit and destroys it", () => {
    const co = plain((b, t) => { t.setCell(3, 3, "b>."); t.setCell(4, 3, "o.."); });
    const st = game(co, [{ c: 3, r: 3 }]);
    beltPass(st, co.C, 1, 2);
    assert(!st.players[0].alive && st.players[0].lives === 2, "destroyed in the pit");
  }],
  ["gears turn a robot 90 degrees the printed way", () => {
    const co = plain((b, t) => { t.setCell(2, 2, "r.."); t.setCell(5, 5, "l.."); });
    const st = game(co, [{ c: 2, r: 2, face: N }, { c: 5, r: 5, face: N }]);
    gearPass(st, co.C);
    eq([st.players[0].face, st.players[1].face], [E, W], "clockwise gear turns right, anticlockwise left");
  }],
  ["a pusher fires only on its own registers", () => {
    const co = plain((b, t) => { t.wall(3, 3, W); b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 3, r: 3 }, face: E, regs: [2, 4] }); });
    const st = game(co, [{ c: 3, r: 3 }]);
    st.register = 0; pusherPass(st, co.C);
    eq(st.players[0].c, 3, "register 1: not printed on it, no shove");
    st.register = 1; pusherPass(st, co.C);
    eq(st.players[0].c, 4, "register 2: shoved east");
  }],
  ["a board laser damages the first robot in the beam only", () => {
    const co = plain((b, t) => { t.wall(1, 3, W); b.wallDevices.push({ kind: "laser", edge: { kind: "v", c: 1, r: 3 }, face: E, damage: 1 }); });
    const st = game(co, [{ c: 3, r: 3, face: N }, { c: 5, r: 3, face: N }]);
    laserPass(st, co.C);
    eq([st.players[0].damage, st.players[1].damage], [1, 0], "the nearer robot took the hit, the one behind none");
  }],
  ["a wall blocks a laser", () => {
    const co = plain((b, t) => { t.wall(1, 3, W); b.wallDevices.push({ kind: "laser", edge: { kind: "v", c: 1, r: 3 }, face: E, damage: 1 }); t.wall(2, 3, E); });
    const st = game(co, [{ c: 3, r: 3, face: N }]);
    laserPass(st, co.C);
    eq(st.players[0].damage, 0, "the wall between stopped the beam");
  }],
  ["robot lasers fire forwards and skip their own square", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 5, r: 3, face: N }]);
    laserPass(st, co.C);
    eq([st.players[0].damage, st.players[1].damage], [0, 1], "the facing robot shot the other");
  }],
  ["a powered-down robot does not fire but is still hit", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 3, face: E, poweredDown: true }, { c: 5, r: 3, face: W }]);
    laserPass(st, co.C);
    eq([st.players[0].damage, st.players[1].damage], [1, 0], "the powered-down robot was hit and did not shoot");
  }],
  ["a beam stops at the first robot, not the one behind it", () => {
    const co = plain();
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 3, r: 3, face: N }, { c: 6, r: 3, face: N }]);
    const hits = computeLaserHits(st, co.C).hits;
    eq(hits.map(h => h.target.id), [1], "one hit, on the nearer robot");
  }],
  ["lasers are simultaneous: a robot destroyed this register still fires", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 3, face: E, damage: 9 }, { c: 5, r: 3, face: W }]);
    laserPass(st, co.C);
    assert(!st.players[0].alive, "the nine-damage robot took its tenth");
    eq(st.players[1].damage, 1, "and still fired before it fell");
  }],
  ["ten damage destroys a robot and costs a life", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 3, damage: 8 }]);
    damage(st, co.C, st.players[0], 2, "laser");
    assert(!st.players[0].alive && st.players[0].lives === 2 && st.players[0].damage === 0, "destroyed, one life gone, damage cleared");
  }],
  ["registers lock from the right as damage mounts", () => {
    eq([0, 4, 5, 6, 7, 8, 9].map(openRegisters), [5, 5, 4, 3, 2, 1, 0], "five open at four or less, one fewer per point after");
    eq([0, 3, 9].map(cardsDealt), [9, 6, 0], "nine minus damage");
  }],
  ["a destroyed robot returns to its archive with two damage", () => {
    const co = plain();
    const st = game(co, [{ c: 5, r: 5, face: E, archive: { c: 2, r: 2, face: S } }]);
    st.players[0].alive = false; st.players[0].lives = 2;
    st.phase = "turn"; st.step = "respawn";
    const r = step(st, co.library);
    const p = st.players[0];
    assert(p.alive && p.c === 2 && p.r === 2 && p.face === S && p.damage === 2, "back at the archive, facing as archived, with two damage");
    assert(r.waiting && r.waiting.kind === "program", "and the turn went on to programming");
  }],
  ["a robot returning to an occupied archive comes back virtual, on the square", () => {
    const co = plain();
    const st = game(co, [{ c: 5, r: 5, archive: { c: 2, r: 2, face: N } }, { c: 2, r: 2 }]);
    st.players[0].alive = false; st.players[0].lives = 2;
    st.phase = "turn"; st.step = "respawn";
    step(st, co.library);
    const p = st.players[0];
    eq([p.alive, p.c, p.r, p.virtual, st.players[1].virtual], [true, 2, 2, true, false], "on the archive square, sharing it, virtual");
  }],
  ["two robots re-entering on one square are both virtual", () => {
    const co = plain();
    const st = game(co, [{ c: 5, r: 5, archive: { c: 2, r: 2, face: N } }, { c: 6, r: 6, archive: { c: 2, r: 2, face: E } }]);
    for (const p of st.players) { p.alive = false; p.lives = 2; }
    st.phase = "turn"; st.step = "respawn";
    step(st, co.library);
    eq(st.players.map(p => [p.c, p.r, p.virtual]), [[2, 2, false], [2, 2, true]], "the first back is alone and real, the second shares and is virtual");
  }],
  ["a virtual robot pushes nobody and is pushed by nobody", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 3, face: E }, { c: 3, r: 3, face: N }, { c: 4, r: 3, face: W }]);
    const [v, q, w] = st.players;
    v.virtual = true;
    stepRobot(st, co.C, v, E, "card");
    eq([[v.c, v.r], [q.c, q.r]], [[3, 3], [3, 3]], "it walked onto the other robot's square without shoving it");
    stepRobot(st, co.C, w, W, "card");
    eq([[w.c, w.r], [q.c, q.r], [v.c, v.r]], [[3, 3], [2, 3], [3, 3]], "a real robot shoving into the pair shoves the real one and leaves the virtual one where it stands");
    stepRobot(st, co.C, q, E, "card");
    eq([[q.c, q.r], [w.c, w.r], [v.c, v.r]], [[3, 3], [4, 3], [3, 3]], "and back: the real robot is shoved, the virtual one is not");
  }],
  ["a virtual robot is not shot by robots, and shoots none, but a board laser hits it", () => {
    const co = plain((b, t) => { t.wall(0, 6, W); b.wallDevices.push({ kind: "laser", edge: { kind: "v", c: 0, r: 6 }, face: E, damage: 1 }); });
    const st = game(co, [{ c: 1, r: 3, face: E }, { c: 4, r: 3, face: W }, { c: 3, r: 6, face: N }]);
    const [p, v, b] = st.players;
    v.virtual = true; b.virtual = true;
    laserPass(st, co.C);
    eq([p.damage, v.damage, b.damage], [0, 0, 1], "the two robots facing each other exchanged nothing; the board laser found the virtual robot in its beam");
  }],
  ["a virtual robot becomes real at the end of a turn alone on its square", () => {
    const co = plain();
    const st = game(co, [{ c: 2, r: 2 }, { c: 2, r: 2 }, { c: 5, r: 5 }]);
    st.players[0].virtual = true; st.players[2].virtual = true;
    st.phase = "cleanup"; st.step = "endTurn";
    tick(st, co.library);
    eq(st.players.map(p => p.virtual), [true, false, false], "the one still sharing stays virtual; the one alone is real");
  }],
  ["flags must be touched in order", () => {
    const co = courseOn(board(8, 8), [[1, 1], [5, 5]]);
    const st = game(co, [{ c: 5, r: 5 }]);
    checkpointPass(st, co.C);
    eq(st.players[0].flags, 0, "standing on flag 2 first scores nothing");
  }],
  ["an out-of-order flag still updates the archive", () => {
    const co = courseOn(board(8, 8), [[1, 1], [5, 5]]);
    const st = game(co, [{ c: 5, r: 5, face: E, archive: { c: 0, r: 7, face: N } }]);
    checkpointPass(st, co.C);
    eq(st.players[0].archive, { c: 5, r: 5, face: E }, "archived on flag 2 all the same");
  }],
  ["a repair site updates the archive", () => {
    const co = courseOn(board(8, 8, b => b.sites.set("3,3", ["repair"])), [[1, 1]]);
    const st = game(co, [{ c: 3, r: 3, face: W, archive: { c: 0, r: 7, face: N } }]);
    checkpointPass(st, co.C);
    eq(st.players[0].archive, { c: 3, r: 3, face: W }, "the wrench is an archive point");
  }],
  ["touching every flag in order wins the game", () => {
    const co = courseOn(board(8, 8), [[1, 1], [5, 5]]);
    const st = game(co, [{ c: 1, r: 1 }]);
    checkpointPass(st, co.C);
    eq([st.players[0].flags, st.over], [1, false], "flag 1 taken, race on");
    st.players[0].c = 5; st.players[0].r = 5;
    checkpointPass(st, co.C);
    eq([st.players[0].flags, st.over, st.winner], [2, true, 0], "flag 2 taken, race won");
  }],
  ["repairs happen in cleanup, not when the flag is touched", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = game(co, [{ c: 1, r: 1, damage: 3 }]);
    checkpointPass(st, co.C);
    eq(st.players[0].damage, 3, "touching repairs nothing");
    st.players[0].flags = 0; st.over = false;
    st.phase = "cleanup"; st.step = "repair";
    step(st, co.library);
    eq(st.players[0].damage, 2, "cleanup repaired one");
  }],
  ["power down clears damage at the start of the powered-down turn, not on announcing", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, damage: 4 }]);
    st.players[0].announceDown = true;
    st.phase = "cleanup"; st.step = "discard";
    step(st, co.library);
    eq([st.players[0].damage, st.players[0].poweredDown], [0, true], "cleared at the top of the next turn, and powered down");
  }],
  ["a powered-down human is asked whether to stay down", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human", poweredDown: true }]);
    st.phase = "cleanup"; st.step = "repair";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "stayDown" && r.waiting.player === 0, "asked to stay down");
    step(st, co.library, true);
    assert(st.players[0].poweredDown, "and stayed down");
  }],
  ["a human with every register locked still reaches the announce", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 3, seat: "human", damage: 9 }]);
    st.phase = "turn"; st.step = "deal";
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "program" && r.waiting.count === 0, "asked to program nothing");
    const r2 = step(st, co.library, []);
    assert(r2.waiting && r2.waiting.kind === "powerDown", "and then asked about powering down");
  }],
  ["a powered-down robot does not tag a checkpoint", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = game(co, [{ c: 1, r: 1, poweredDown: true }]);
    checkpointPass(st, co.C);
    eq(st.players[0].flags, 0, "no score while powered down");
  }],
  ["a powered-down robot does not update its archive", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = game(co, [{ c: 1, r: 1, poweredDown: true, archive: { c: 0, r: 7, face: N } }]);
    checkpointPass(st, co.C);
    eq(st.players[0].archive, { c: 0, r: 7, face: N }, "archive untouched");
  }],
  ["the draft seats everyone, once each, on a real bay", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "bot" }, { seat: "bot" }, { seat: "bot" }] });
    let r = step(st, co.library);
    while (r.waiting && r.waiting.kind === "bay") r = step(st, co.library, botAnswer(st, co.library, r.waiting));
    const bays = st.players.map(p => co.C.docks.find(d => d.c === p.c && d.r === p.r));
    assert(bays.every(Boolean), "every robot stands on a bay");
    eq(new Set(bays.map(b => b.n)).size, 3, "three different bays");
  }],
  ["the fastest priority drafts first", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "human" }, { seat: "human" }] });
    let r = step(st, co.library);
    while (r.waiting && r.waiting.kind === "livery") r = step(st, co.library, r.waiting.options[0]);
    assert(r.waiting.kind === "bay", "the bay is asked");
    const first = r.waiting.player, cards = st.draft.cards;
    assert(cards[first] > cards[1 - first], "the higher priority picks first");
  }],
  ["human privilege jumps the bots and nothing else", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    for (let seed = 1; seed < 6; seed++) {
      const st = newGame({ seed, course: co.doc, seats: [{ seat: "bot" }, { seat: "bot" }, { seat: "human" }], house: { humanPrivilege: true } });
      let r = step(st, co.library);
      while (r.waiting && r.waiting.kind === "livery") r = step(st, co.library, r.waiting.options[0]);
      eq(r.waiting.player, 2, "the human picks a bay first whatever it drew (seed " + seed + ")");
    }
  }],
  ["no two robots share a colour, whatever you pick", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "human", livery: 3 }, { seat: "human", livery: 3 }, { seat: "bot", livery: 3 }] });
    eq(new Set(st.players.map(p => p.livery)).size, 3, "three seats, three liveries at the start");
    let r = step(st, co.library);
    assert(r.waiting.kind === "livery" && r.waiting.player === 0, "seat 0 picks first");
    r = step(st, co.library, 5);
    assert(r.waiting.kind === "livery" && r.waiting.player === 1, "seat 1 next");
    assert(!r.waiting.options.includes(5), "and cannot take seat 0's colour");
    r = step(st, co.library, r.waiting.options[0]);
    eq(new Set(st.players.map(p => p.livery)).size, 3, "still three distinct liveries");
  }],
  ["a new game starts in the draft, at the colours", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "human" }, { seat: "bot" }] });
    eq([st.phase, st.step], ["draft", "livery"], "opens at the colour pick");
    const r = step(st, co.library);
    eq([r.waiting.kind, r.waiting.player], ["livery", 0], "and asks the human first");
  }],
  ["a table of bots stops at nothing before the first program", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "bot" }, { seat: "bot" }] });
    const r = step(st, co.library);
    assert(r.waiting && r.waiting.kind === "bay", "bots are asked nothing until the bay, which is a request like any other");
  }],
  ["a seat is any mix: solo, eight, bots only", () => {
    const co = courseOn(board(8, 8), [[1, 1], [6, 2]]);
    const solo = runGame({ seed: 3, course: co.doc, seats: [{ seat: "human" }], library: co.library });
    assert(solo.state.over, "a solo human's game ends");
    const eight = runGame({ seed: 4, course: co.doc, seats: Array.from({ length: 8 }, (_, i) => ({ seat: i % 2 ? "bot" : "human" })), library: co.library });
    assert(eight.state.over && eight.state.players.length === 8, "eight seats play out");
    const bots = runGame({ seed: 6, course: co.doc, seats: [{ seat: "bot" }, { seat: "bot" }], library: co.library });
    assert(bots.state.over && bots.requests.program > 0, "bots answer requests too");
  }],
  ["an illegal answer is refused and the same question stands", () => {
    const co = courseOn(board(8, 8), [[1, 1]]);
    const st = newGame({ seed: 5, course: co.doc, seats: [{ seat: "human" }] });
    let r = step(st, co.library);
    const kind = r.waiting.kind;
    r = step(st, co.library, 99);
    assert(r.refused && r.waiting.kind === kind, "refused, question unchanged");
    r = step(st, co.library, r.waiting.options[0]);
    assert(!r.refused, "a legal answer moves on");
  }],
  ["a seed replays identically", () => {
    const co = courseOn(board(8, 8), [[1, 1], [6, 2]]);
    const a = runGame({ seed: 42, course: co.doc, seats: [{ seat: "human" }, { seat: "bot" }], library: co.library });
    const b = runGame({ seed: 42, course: co.doc, seats: [{ seat: "human" }, { seat: "bot" }], library: co.library });
    eq(a.state.log, b.state.log, "same seed, same game");
  }],
  ["cards are conserved: 84 across deck, discard, hands and registers", () => {
    const co = courseOn(board(8, 8), [[1, 1], [6, 2]]);
    const r = runGame({ seed: 8, course: co.doc, seats: [{ seat: "bot" }, { seat: "bot" }, { seat: "human" }], library: co.library });
    let n = r.state.deck.length + r.state.discard.length;
    for (const p of r.state.players) { n += p.hand.length; for (const x of p.registers) if (x !== null) n++; }
    eq(n, CLASSIC_DECK.length, "eighty-four at the end");
  }],
  ["a locked register keeps its card and re-executes it", () => {
    const co = plain();
    const st = game(co, [{ c: 3, r: 5, face: N, damage: 5 }]);
    const ci = give(st, st.players[0], 4, "move1");
    st.phase = "cleanup"; st.step = "discard";
    step(st, co.library);
    eq(st.players[0].registers[4], ci, "register 5 is locked at five damage and kept its card");
  }],
  ["the bumpers house rule keeps a robot on the course", () => {
    const co = plain();
    const st = game(co, [{ c: 7, r: 3, face: E }], { house: { bumpers: true } });
    assert(!stepRobot(st, co.C, st.players[0], E, "card"), "the rail stops it");
    assert(st.players[0].alive && st.players[0].c === 7, "and it is still there");
  }],
  ["crossing a flag counts under the flag-touch house rule, and only then", () => {
    const co = courseOn(board(8, 8), [[3, 3]]);
    const off = game(co, [{ c: 1, r: 3, face: E }]);
    give(off, off.players[0], 0, "move3");
    runRegister(off, co.library);
    eq([off.players[0].c, off.players[0].flags], [4, 0], "drove over it and scored nothing by the book");
    const on = game(co, [{ c: 1, r: 3, face: E }], { house: { flagTouch: true } });
    give(on, on.players[0], 0, "move3");
    runRegister(on, co.library);
    eq([on.players[0].c, on.players[0].flags], [4, 1], "under the Euro rule the crossing scored");
  }]
];
