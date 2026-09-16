/* Crash and Burn: swing doors, portals, oil, presses and burners, and the
 * lives rule. Read off the AMIGO Spielanleitung photographed into manual1/
 * (IMG_1227 to IMG_1229, and the reference cards IMG_1231 and IMG_1232).
 *
 * Same contract as classic.js: every name here is marked "ported" in
 * scenarios.js, and the runner holds the two lists to each other.
 */
import { board, courseOn, game, give, runRegister, N, E, S, W } from "./harness.js";
import {
  stepRobot, beltPass, crusherPass, jetPass, firstRobotAlong, oilSlide, throughPortal
} from "../../engine/rules.js";
import { CLASSIC_ORDER } from "../../engine/machine.js";
import { newGame, livesFor } from "../../engine/state.js";
import { buildCourse, portalTwin } from "../../engine/course.js";
import { setWall, isWall, EDGE_DOOR } from "../../../editor/lib/edges.js";
import { blockedAt, doorsAt, cloneBoard } from "../../../editor/lib/board.js";
import { rotateBoard } from "../../../editor/lib/rotate.js";
import { toPicture, fromPicture } from "../../../editor/lib/picture.js";
import { validateBoard } from "../../../editor/validate/board.js";
import { sink } from "../../../editor/validate/diagnostic.js";
import { rulesetFor } from "../../../editor/rulesets/index.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

const plain = edit => courseOn(board(8, 8, edit));

/* a door on the east edge of (c,r), open in `regs` */
function door(b, c, r, regs) {
  setWall(b, c, r, E, EDGE_DOOR);
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: c + 1, r }, regs });
}
/* a press over (c,r); regs undefined means the unnumbered, always-on press */
function press(b, c, r, regs) {
  const dev = { kind: "crusher", c, r };
  if (regs) dev.regs = regs;
  b.ceilingDevices.push(dev);
}
/* a flame jet on the north wall of (c,r), playing south over `reach` squares */
function jet(b, c, r, regs, reach = 1) {
  setWall(b, c, r, N, 1);
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c, r }, face: S, reach, regs });
}
const codes = b => { const d = sink(); validateBoard(b, d); return d.errors.map(e => e.code); };

/* a course of two copies of one board, side by side */
function twoOf(b) {
  const library = new Map([[b.id, b]]);
  const doc = { format: "PRCourse", version: 1, id: "tc2", name: "Two boards", kind: "quick",
    stamps: [{ role: "board", board: b.id, rot: 0, at: [0, 0] }, { role: "board", board: b.id, rot: 0, at: [b.w, 0] }],
    flags: [[0, 0]], minPlayers: 1, maxPlayers: 8 };
  return { doc, library, C: buildCourse(doc, library) };
}

export const TESTS = [
  /* --- swing doors --------------------------------------------------------- */
  ["a swing door blocks when shut and lets you through when open", () => {
    const co = plain(b => door(b, 0, 3, [3]));
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    st.register = 0;
    assert(!stepRobot(st, co.C, st.players[0], E, "card"), "register 1: shut, so it behaves as a wall");
    eq(st.players[0].c, 0, "still behind it");
    st.register = 2;
    assert(stepRobot(st, co.C, st.players[0], E, "card"), "register 3: open");
    eq(st.players[0].c, 1, "through it");
  }],
  ["a shut door stops a laser, an open one does not", () => {
    const co = plain(b => door(b, 0, 3, [3]));
    const st = game(co, [{ c: 0, r: 3, face: E }, { c: 1, r: 3, face: E }]);
    st.register = 0;
    eq(firstRobotAlong(st, co.C, 0, 3, E, true), null, "a shut door stops the beam");
    st.register = 2;
    assert(firstRobotAlong(st, co.C, 0, 3, E, true) === st.players[1], "an open door lets it through -- the book says beams use them too");
  }],
  ["a door round-trips through the picture byte for byte", () => {
    const b = board(3, 2, bb => door(bb, 0, 0, [2, 4]));
    const text = toPicture(b);
    assert(/D/.test(text), "the door is drawn in the lattice");
    const back = fromPicture(text, { id: b.id, name: b.name, set: b.set, origin: b.origin });
    eq(toPicture(back), text, "written back out unchanged");
    const d = doorsAt(back, 0, 0);
    eq(d.length, 1, "one door on (0,0)");
    eq(d[0].dev.regs, [2, 4], "with its registers");
  }],
  ["a door survives board rotation", () => {
    const b = board(3, 2, bb => door(bb, 0, 0, [3]));
    const n = rotateBoard(cloneBoard(b), 1);
    const found = [];
    for (let c = 0; c < n.w; c++) for (let r = 0; r < n.h; r++) if (doorsAt(n, c, r).length) found.push(c + "," + r);
    eq(found.length, 2, "one door, reported from both sides, survives a quarter turn -- " + found.join(" "));
  }],
  ["a door is not a wall, and a wall is not a door", () => {
    const b = board(3, 2, bb => { door(bb, 0, 0, [3]); setWall(bb, 1, 0, E, 1); });
    assert(!isWall(b, 0, 0, E), "a door must not report as a wall -- pushers mount on walls");
    assert(blockedAt(b, 0, 0, E, 1), "but it does block in register 1");
    assert(!blockedAt(b, 0, 0, E, 3), "and not in register 3");
    assert(isWall(b, 1, 0, E) && blockedAt(b, 1, 0, E, 3), "a wall is a wall in every register");
    eq(doorsAt(b, 2, 0).length, 0, "and is not listed as a door");
  }],

  /* --- portals ------------------------------------------------------------ */
  ["a portal drops you out of its twin and you carry on", () => {
    const co = plain((b, t) => { t.setCell(1, 3, "t1."); t.setCell(3, 3, "t1."); });
    eq(portalTwin(co.C, 1, 3), [3, 3], "the course pairs the colour");
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move2");
    const ev = runRegister(st, co.library);
    eq(st.players[0].c, 4, "into the portal at c1, out at c3, then one more square");
    assert(ev.some(e => e.type === "portal"), "the hop is an event of its own");
  }],
  ["the pair counts as one square, so a robot cannot bounce back", () => {
    const co = plain((b, t) => { t.setCell(1, 3, "t1."); t.setCell(3, 3, "t1."); });
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 3, "one square in, straight out the other side, and it stays there");
  }],
  ["a robot standing on a portal switches the colour off", () => {
    const co = plain((b, t) => { t.setCell(1, 3, "t1."); t.setCell(3, 3, "t1."); });
    const st = game(co, [{ c: 0, r: 3, face: E }, { c: 3, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 1, "the far end is occupied, so the colour is dead and this is ordinary floor");
    eq(st.players[1].c, 3, "and the robot standing there is not disturbed");
    /* and the twin can be driven over as plain floor while it is off */
    assert(!throughPortal(st, co.C, st.players[1]), "the robot standing on it does not fall through");
  }],
  ["a lone portal is refused as a transcription error", () => {
    const b = board(4, 2, (bb, t) => t.setCell(1, 0, "t1."));
    assert(codes(b).indexOf("ground.pairCount") >= 0, "a portal colour appearing once must not validate");
    const pair = board(4, 2, (bb, t) => { t.setCell(1, 0, "t1."); t.setCell(3, 0, "t1."); });
    assert(codes(pair).indexOf("ground.pairCount") < 0, "and a pair does");
    const three = board(4, 2, (bb, t) => { t.setCell(1, 0, "t1."); t.setCell(2, 0, "t1."); t.setCell(3, 0, "t1."); });
    assert(codes(three).indexOf("ground.pairCount") >= 0, "three of a colour is not a pair either");
  }],
  ["a portal fires however you arrive: shoved, conveyed or skidding", () => {
    /* shoved through */
    let co = plain((b, t) => { t.setCell(2, 3, "t1."); t.setCell(5, 3, "t1."); });
    let st = game(co, [{ c: 0, r: 3, face: E }, { c: 1, r: 3, face: N }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    eq([st.players[0].c, st.players[1].c], [1, 5], "the shoved robot comes out of the twin");
    /* conveyed through */
    co = plain((b, t) => { t.setCell(1, 3, "b>."); t.setCell(2, 3, "t1."); t.setCell(5, 3, "t1."); });
    st = game(co, [{ c: 1, r: 3, face: N }]);
    beltPass(st, co.C, 1, 2);
    eq(st.players[0].c, 5, "the belt delivers it into the portal and it comes out of the twin");
    /* skidded through */
    co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); t.setCell(3, 3, "t1."); t.setCell(6, 3, "t1."); });
    st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 6, "a Move 1 onto the oil skids into the portal and out of the twin");
  }],
  ["a portal pair belongs to its own board", () => {
    const b = board(6, 2, (bb, t) => { t.setCell(1, 0, "t1."); t.setCell(3, 0, "t1."); });
    const co = twoOf(b);
    eq(portalTwin(co.C, 1, 0), [3, 0], "the left board's pair");
    eq(portalTwin(co.C, 7, 0), [9, 0], "the right board's pair, offset by the stamp");
    eq(portalTwin(co.C, 9, 0), [7, 0], "and back");
    const st = game(co, [{ c: 6, r: 0, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 9, "in on the right board, out on the right board");
  }],

  /* --- oil ---------------------------------------------------------------- */
  ["ending a move on oil slides you off it", () => {
    const co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); });
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    const ev = runRegister(st, co.library);
    eq(st.players[0].c, 3, "it should slide across both oil squares and stop on the first dry one");
    eq(st.players[0].damage, 0, "oil does no damage");
    eq(ev.filter(e => e.type === "moved" && e.cause === "oil").length, 2, "two squares of skid, each an event");
  }],
  ["starting a move on oil costs a square", () => {
    const co = plain((b, t) => t.setCell(0, 3, "L.."));
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move3");
    runRegister(st, co.library);
    eq(st.players[0].c, 2, "a Move 3 off oil carries two");
  }],
  ["a Move 1 that starts on oil goes nowhere, and does not then skid", () => {
    const co = plain((b, t) => { t.setCell(0, 3, "L.."); t.setCell(1, 3, "L.."); });
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 0, "the move is cancelled outright, and momentum it never had cannot carry it");
    st.register = 0;
    give(st, st.players[0], 0, "back");
    runRegister(st, co.library);
    eq(st.players[0].c, 0, "Back Up from oil is a 1 as well, and goes nowhere");
  }],
  ["a slide stops against a robot with grip, and shoves one without", () => {
    /* the blocker is on dry floor: the slide stops short of it */
    let co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); });
    let st = game(co, [{ c: 0, r: 3, face: E }, { c: 3, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[1].c], [2, 3], "a robot off the oil is not shoved");
    /* the blocker is on the same slick: it gets shoved along, and both slide */
    co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); t.setCell(3, 3, "L.."); });
    st = game(co, [{ c: 0, r: 3, face: E }, { c: 2, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[1].c], [3, 4], "both should slide, front one first");
    /* and the front one stops before a further robot */
    co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); t.setCell(3, 3, "L.."); t.setCell(4, 3, "L.."); });
    st = game(co, [{ c: 0, r: 3, face: E }, { c: 2, r: 3, face: E }, { c: 4, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players.map(p => p.c), [2, 3, 4], "the pair slides one square and stops before the third robot");
  }],
  ["oil does not touch rotation", () => {
    const co = plain((b, t) => t.setCell(4, 3, "L.."));
    const st = game(co, [{ c: 4, r: 3, face: N }]);
    give(st, st.players[0], 0, "right");
    runRegister(st, co.library);
    eq([st.players[0].face, st.players[0].c, st.players[0].r], [E, 4, 3], "a rotate on oil turns and stays put");
  }],
  ["a slide stops before a wall, and a slide is not a move", () => {
    const co = plain((b, t) => { t.setCell(1, 3, "L.."); t.setCell(2, 3, "L.."); t.setCell(3, 3, "L.."); t.wall(2, 3, E); });
    const st = game(co, [{ c: 0, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 2, "the wall stops the skid, still on the oil");
    /* the robot now stands on oil having stopped: a further call skids nothing */
    assert(!oilSlide(st, co.C, st.players[0], E), "a robot that has stopped does not skid again");
    /* and the next register's Move 1 from that oil square goes nowhere */
    st.register = 0;
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq(st.players[0].c, 2, "starting on oil, a Move 1 is spent on spinning wheels");
  }],
  ["a slide is set off by what the edition says", () => {
    /* the classic book states the slide for the robot's own movement and
     * shows only card moves; the 2016 sheet adds belts and pushes. Both
     * agree a card move sets it off, and the engine reads the list. */
    eq(rulesetFor("classic").oilSlideAfter, ["card"], "classic: after a card");
    eq(rulesetFor("modern").oilSlideAfter, ["card", "belt", "push"], "modern: after a card, a belt or a push");
    /* under classic, a shove that ends on oil does not skid */
    const co = plain((b, t) => { t.setCell(2, 3, "L.."); t.setCell(3, 3, "L.."); });
    const st = game(co, [{ c: 0, r: 3, face: E }, { c: 1, r: 3, face: N }]);
    stepRobot(st, co.C, st.players[0], E, "card");
    eq(st.players[1].c, 2, "shoved onto the oil and left there");
  }],

  /* --- presses ------------------------------------------------------------ */
  ["a press flattens what stands on it, but only in its registers", () => {
    const co = plain(b => press(b, 2, 3, [3]));
    const st = game(co, [{ c: 2, r: 3 }]);
    st.register = 0; crusherPass(st, co.C);
    assert(st.players[0].alive, "register 1 is not register 3 -- it should still be standing");
    st.register = 2; crusherPass(st, co.C);
    assert(!st.players[0].alive, "register 3 is printed on it, so this should have flattened it");
  }],
  ["a press fires on every register it lists, and no others", () => {
    const co = plain(b => press(b, 2, 3, [1, 2, 4]));
    const st = game(co, [{ c: 2, r: 3 }]);
    st.register = 2; crusherPass(st, co.C);
    assert(st.players[0].alive, "register 3 is not in {1,2,4}");
    st.register = 3; crusherPass(st, co.C);
    assert(!st.players[0].alive, "register 4 is -- the printed sets are arbitrary subsets, not odd/even");
  }],
  ["a press with no number printed on it comes down every register", () => {
    /* "Ist auf der Presse keine Zahl angegeben, ist die Presse immer aktiv." */
    const b = board(8, 8, bb => press(bb, 2, 3));
    eq(codes(b), [], "the unnumbered press validates");
    const co = courseOn(b);
    for (let reg = 0; reg < 5; reg++) {
      const st = game(co, [{ c: 2, r: 3 }]);
      st.register = reg; crusherPass(st, co.C);
      assert(!st.players[0].alive, "an unnumbered press is active in register " + (reg + 1));
    }
  }],
  ["a crusher destroys, and only where and when it is printed", () => {
    const co = plain(b => press(b, 2, 3, [2, 4]));
    const st = game(co, [{ c: 2, r: 3 }, { c: 3, r: 3 }]);
    const under = st.players[0], beside = st.players[1];
    const lives = under.lives;
    st.register = 0; crusherPass(st, co.C);
    assert(under.alive, "register 1 is not in {2,4}");
    st.register = 1; crusherPass(st, co.C);
    assert(!under.alive, "register 2 is printed on it");
    eq(under.damage, 0, "a crusher destroys rather than damaging");
    eq(under.lives, lives - 1, "being crushed costs a life");
    assert(beside.alive, "the robot on the next square was crushed by a press that is not there");
  }],
  ["a press is a thing ON a square, and knows which squares it may not be on", () => {
    /* a press sits over a belt on every Cannery Row square, so it is a
     * ceiling device and not a cell. What is left to refuse: off the board,
     * over a pit, twice on one square, and the long way of saying always. */
    assert(codes(board(4, 2, b => press(b, 6, 0, [1]))).indexOf("ceiling.offBoard") >= 0, "a press outside the grid must be refused");
    assert(codes(board(4, 2, (b, t) => { t.setCell(0, 0, "o.."); press(b, 0, 0, [1]); })).indexOf("ceiling.overPit") >= 0,
      "a press over a pit must be refused -- there is no floor to flatten anything against");
    assert(codes(board(4, 2, b => { press(b, 0, 0, [1]); press(b, 0, 0, [2]); })).indexOf("ceiling.duplicate") >= 0,
      "two presses on one square must be refused");
    assert(codes(board(4, 2, b => press(b, 0, 0, [1, 2, 3, 4, 5]))).some(c => /^regs\./.test(c)),
      "all five spelled out must be refused, so there is one way to say always");
    assert(codes(board(4, 2, b => press(b, 0, 0, [7]))).some(c => /^regs\./.test(c)), "a press firing in register 7 must be refused");
    /* and the case the whole arrangement exists for: a press on a belt */
    const onBelt = board(4, 2, (b, t) => { t.setCell(0, 0, "b>."); press(b, 0, 0, [1, 5]); });
    eq(codes(onBelt), [], "a press over a conveyor is fine");
    const co = courseOn(onBelt, [[3, 1]]);           // the flag off the belt: a flag switches off what is under it
    const st = game(co, [{ c: 0, r: 0 }]);
    st.register = 0; beltPass(st, co.C, 1, 2);
    eq(st.players[0].c, 1, "the conveyor under the press still carries");
  }],
  ["the board takes its turn in the printed order, presses between the gears and the lasers", () => {
    /* the ruleset's order is the source; the engine's table is what runs.
     * Board lasers and robot lasers fire at one instant, so the two ruleset
     * steps are one pass. */
    const printed = rulesetFor("classic").order.map(s => s.step);
    eq(printed, ["expressConveyor", "conveyor", "pusher", "gear", "crusher", "boardLaser", "robotLaser", "jet", "checkpoint"], "the printed order");
    const pass = { expressConveyor: "express", conveyor: "belts", pusher: "pushers", gear: "gears", crusher: "presses",
      boardLaser: "lasers", robotLaser: "lasers", jet: "burners", checkpoint: "touch" };
    const want = []; for (const s of printed) if (want[want.length - 1] !== pass[s]) want.push(pass[s]);
    eq(CLASSIC_ORDER.map(x => x[0]), want, "the engine walks the printed order");
    /* the interaction the order exists for: a belt carries a robot onto a
     * crusher, and the crusher comes down the same register */
    const co = plain((b, t) => { t.setCell(1, 3, "b>."); press(b, 2, 3, [1]); });
    const st = game(co, [{ c: 1, r: 3, face: N }]);
    const ev = runRegister(st, co.library);
    assert(!st.players[0].alive, "the belt delivered it under an active crusher and it survived");
    const names = ev.filter(e => e.type === "element").map(e => e.name);
    assert(names.indexOf("belts") < names.indexOf("presses"), "the belt ran before the press");
  }],

  /* --- burners ------------------------------------------------------------ */
  ["a burner scorches for one, in its registers only", () => {
    const co = plain(b => jet(b, 2, 3, [2, 3, 5]));
    const st = game(co, [{ c: 2, r: 3 }]);
    st.register = 0; jetPass(st, co.C);
    eq(st.players[0].damage, 0, "register 1 is not one of {2,3,5}");
    st.register = 2; jetPass(st, co.C);
    eq(st.players[0].damage, 1, "register 3 is, so one point");
  }],
  ["burners fire after the lasers, not with the other elements", () => {
    const names = CLASSIC_ORDER.map(x => x[0]);
    assert(names.indexOf("burners") === names.indexOf("lasers") + 1, "directly after the lasers");
    assert(names.indexOf("burners") === names.length - 2, "and after every other element, before the flags are touched");
    const co = plain(b => jet(b, 2, 3, [1]));
    const st = game(co, [{ c: 2, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    const ev = runRegister(st, co.library);
    const el = ev.filter(e => e.type === "element").map(e => e.name);
    assert(el.indexOf("lasers") < el.indexOf("burners"), "lasers, then burners");
  }],
  ["a burner scorches a robot that drives through it, and again when the burners act", () => {
    /* p.8: damage during the robot's movement AND in the element phase --
     * "ein Brenner kann einem Roboter in einem Programmschritt zwei Schäden
     * zufügen". A robot passing through takes the first and not the second. */
    const co = plain(b => jet(b, 2, 3, [1]));
    let st = game(co, [{ c: 1, r: 3, face: E }]);
    give(st, st.players[0], 0, "move2");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].damage], [3, 1], "passed through the flame: one point, and not standing in it after");
    st = game(co, [{ c: 1, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].damage], [2, 2], "stopped in the flame: one on the way in, one when the burners act");
    /* and a two-square jet burns both squares in front of it: this one is on
     * the west wall of (2,3) playing east over (2,3) and (3,3), and the robot
     * backs into it from the far side, since the wall it hangs on blocks */
    const long = plain(b => { setWall(b, 2, 3, W, 1); b.wallDevices.push({ kind: "jet", edge: { kind: "v", c: 2, r: 3 }, face: E, reach: 2, regs: [1] }); });
    st = game(long, [{ c: 4, r: 3, face: W }]);
    give(st, st.players[0], 0, "move2");
    runRegister(st, long.library);
    eq([st.players[0].c, st.players[0].damage], [2, 3], "two squares of flame on the way in, then the burners act: three");
  }],
  ["a robot that stays in an active burner is scorched, and one that leaves is not", () => {
    /* p.8: "Ein Roboter erhält auch einen Schaden, wenn er ein Feld eines
     * aktiven Brenners nicht verlässt" -- the example is a rotate. The
     * reference card: leaving one at the start of a move costs nothing. */
    const co = plain(b => jet(b, 2, 3, [1]));
    let st = game(co, [{ c: 2, r: 3, face: E }]);
    give(st, st.players[0], 0, "right");
    runRegister(st, co.library);
    eq(st.players[0].damage, 2, "rotated in the flame: one during the move, one when the burners act");
    st = game(co, [{ c: 2, r: 3, face: E }]);
    give(st, st.players[0], 0, "move1");
    runRegister(st, co.library);
    eq([st.players[0].c, st.players[0].damage], [3, 0], "drove out of it at the start of the move: nothing");
    /* inactive this register: nothing either way */
    const off = plain(b => jet(b, 2, 3, [2]));
    st = game(off, [{ c: 2, r: 3, face: E }]);
    give(st, st.players[0], 0, "right");
    runRegister(st, off.library);
    eq(st.players[0].damage, 0, "a burner that is not active this register is cold floor");
  }],

  /* --- lives -------------------------------------------------------------- */
  ["lives scale with the number of robots and the number of boards", () => {
    eq(livesFor(2, 1), 3, "a small race starts on three");
    eq(livesFor(4, 4), 3, "four robots on four boards is still three");
    eq(livesFor(5, 1), 4, "the fifth robot is worth a life");
    eq(livesFor(8, 4), 4, "and only one, however many more join");
    eq(livesFor(2, 5), 4, "the fifth board is worth a life on its own");
    eq(livesFor(6, 6), 5, "both together is five");
    /* and a real game deals them out */
    const b = board(4, 4);
    const one = courseOn(b);
    const seats = n => new Array(n).fill(0).map(() => ({ seat: "bot", skill: 1 }));
    eq(newGame({ seed: 1, course: one.doc, seats: seats(3) }).players.map(p => p.lives), [3, 3, 3], "three robots on one board start on three");
    eq(newGame({ seed: 1, course: one.doc, seats: seats(5) }).players.every(p => p.lives === 4), true, "five robots on one board start on four");
    const five = { ...one.doc, stamps: [0, 1, 2, 3, 4].map(i => ({ role: "board", board: b.id, rot: 0, at: [i * b.w, 0] })) };
    eq(newGame({ seed: 1, course: five, seats: seats(2) }).players.map(p => p.lives), [4, 4], "two robots on five boards start on four");
  }]
];
