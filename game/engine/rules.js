/* The classic rules: pure functions over the state and the built course.
 *
 * Nothing here knows about the screen, the bots or the simulation. Every
 * change to the state pushes an event, and the events are the only record a
 * screen gets: there is no board signature to diff and nothing to animate
 * from except what is written here.
 */
import { step as stepCell, rot, opposite, DC, DR, N, E, S, W } from "../../editor/lib/dir.js";
import { inBoard } from "../../editor/lib/board.js";
import {
  isHole, inGrid, beltAt, beltExit, beltTurnFor, gearAt, repairAt, wallBlocks,
  pusherAt, crusherFires, fireAt, laserSquares, flagAt, oilAt, portalTwin, energyAt, waterAt,
  currentAt, levelStepAt, rampBetween, rampUpAt, rampDownAt, radiationAt, wasteAt, chopShopAt, trapDoorActive, repulsorAt, fieldHit
} from "./course.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { card, planOf, isDamage, isModern, MAX_DAMAGE, REGISTERS, INSTALL_LIMIT } from "./cards.js";
import { alive, log } from "./state.js";
import { fire, OPTION_DEFS, discardOption, drawOption, dropOptionAt, payloadOf } from "./options.js";
import { gainEnergy, bindRuleHooks, drawUpgrade, newInstalled, installedOfType, uninstallUpgrade, shed, UPGRADE_DEFS } from "./upgrades.js";
import { receiveHaywire } from "./haywire.js";
import { stampAt as stampOf, rebootTokenOn } from "./course.js";

/** Where a robot re-enters, 2016: the token of the board it fell from, or its archive (a token-less course, or a fall off the docking bay). */
export function rebootPoint(C, p) {
  const tok = C.reboots && C.reboots.length ? rebootTokenOn(C, p.fellFrom) : null;
  return tok ? { c: tok.c, r: tok.r, face: tok.face, token: true } : { ...(p.archive || { c: p.c, r: p.r, face: 0 }), token: false };
}
/** The square a robot last stood on the course: where it is, or the last square of its trail that is on the floor. */
function lastOnCourse(C, p) {
  if (inGrid(C, p.c, p.r)) return [p.c, p.r];
  for (let i = p.trail.length - 1; i >= 0; i--) if (inGrid(C, p.trail[i][0], p.trail[i][1])) return p.trail[i];
  return null;
}

const DIR_NAMES = ["north", "east", "south", "west"];

/* What the two editions do differently with the same printed tile is read
 * from the ruleset in play and nowhere else, so the 2016 game is a change of
 * table, not of code. */
export function rulesOf(st) { return rulesetFor(st.ruleset); }

export function robotAt(st, c, r) {
  for (const p of st.players) if (p.alive && p.c === c && p.r === r) return p;
  return null;
}

/* VIRTUAL ROBOTS (classic p.8, p.15): a robot re-entering the race on a
 * square another robot is on comes back "virtual". "A virtual robot doesn't
 * interact with other robots. It doesn't shoot other robots, and other
 * robots don't shoot it; virtual robots aren't pushed by other robots, and
 * other robots don't push virtual robots. However, virtual robots are
 * affected by all board elements; they are blocked by walls, can fall into
 * pits, can be shot by board-mounted lasers, and are affected by conveyor
 * belts, gears, etc." It becomes real at the end of a turn alone on its
 * square. So every robot-to-robot question goes through solidAt: the robot
 * `mover` would meet at (c,r), which is nobody when either is virtual. */
export function solidAt(st, c, r, mover) {
  if (mover && mover.virtual) return null;
  for (const p of st.players) if (p.alive && !p.virtual && p.c === c && p.r === r) return p;
  return null;
}

/* THE BUMPERS HOUSE RULE: a rail round the play area, so nothing can be
 * driven, shoved or carried off it. Kept apart from wallBlocks() because a
 * laser beam asks that one, and a beam leaving the course hits nothing
 * whether or not there is a rail there. */
function railed(st, C, c, r, d) {
  if (!st.house.bumpers) return false;
  const [nc, nr] = stepCell(c, r, d);
  return !inGrid(C, nc, nr);
}

export function blockedMove(st, C, c, r, d) {
  return wallBlocks(C, c, r, d, st.register) || railed(st, C, c, r, d) || ledgeUp(C, c, r, d);
}

/** Wet and Wild: "Robots cannot move across a ledge space from the lower level to the upper level. Use a ramp instead." */
export function ledgeUp(C, c, r, d) {
  return levelStepAt(C, c, r, d) > 0 && !rampBetween(C, c, r, d);
}

function tread(p) {
  const last = p.trail[p.trail.length - 1];
  if (last && last[0] === p.c && last[1] === p.r) return;
  p.trail.push([p.c, p.r]);
}

/**
 * One square. A robot moving into another pushes it, and that one pushes the
 * next. A wall anywhere in the chain stops EVERYTHING, including the robot
 * that started the push. Returns false when nothing moved.
 */
const has = (p, id) => !!(p.installed && p.installed.some(u => u.id === id));

/* Where the last refused step was stopped: the square at the head of the chain
 * whose edge refused it. Read by playCard straight after, to tell a repulsor
 * field from a plain wall; transient, and never part of the state. */
let lastBlock = null;

export function stepRobot(st, C, p, dir, cause) {
  const chain = [p];
  let c = p.c, r = p.r;
  let blocked = false;
  lastBlock = null;
  for (let guard = 0; guard < 10; guard++) {
    if (blockedMove(st, C, c, r, dir)) {
      /* Phasing: "During your movement this register, you may pass through exactly 1 wall." Its own move, and a wall, not a ledge -- nor a repulsor field, which is a field and not a wall to phase through (ours) */
      if (chain.length === 1 && cause === "card" && p.phasing > 0 && wallBlocks(C, c, r, dir, st.register) && !ledgeUp(C, c, r, dir) && !railed(st, C, c, r, dir) && !repulsorAt(C, c, r, dir)) {
        p.phasing = 0;
        log(st, p.name + " phases through the wall");
      } else { blocked = true; lastBlock = { c, r, head: chain[chain.length - 1] }; break; }
    }
    const [nc, nr] = stepCell(c, r, dir);
    if (!inGrid(C, nc, nr)) break;                    // the head walks off the edge
    const occ = solidAt(st, nc, nr, p);
    if (!occ) break;
    chain.push(occ); c = nc; r = nr;
  }
  const hurt = [];
  /* the robot about to be pushed has a say, and the pusher a way round */
  if (!blocked && chain.length > 1) {
    const first = chain[1];
    /* Bunny Hop: "you may hop over it to the next adjacent empty space if possible instead" -- its own card, one robot, the square beyond free */
    if (cause === "card" && chain.length === 2 && has(p, "bunnyHop")) {
      const [hc, hr] = stepCell(first.c, first.r, dir);
      if (inGrid(C, hc, hr) && !holeNow(st, C, hc, hr) && !solidAt(st, hc, hr, p) && !blockedMove(st, C, first.c, first.r, dir)) {
        const from = [p.c, p.r];
        p.c = hc; p.r = hr;
        tread(p);
        st.events.push({ type: "moved", player: p.id, from, to: [hc, hr], dir, cause: "hop" });
        log(st, p.name + " bunny-hops over " + first.name);
        throughPortal(st, C, p);
        /* a hop lands ON a square, and both books burn a robot for entering fire */
        const hopped = fireAt(C, p.c, p.r, st.register);
        if (hopped) damage(st, C, p, 1, hopped);
        return true;
      }
    }
    /* Anchor: "Spend 1 Energy when your robot would be pushed: Your robot is not pushed." */
    if (has(first, "anchor") && first.energy >= 1) {
      first.energy -= 1;
      st.events.push({ type: "energy", player: first.id, amount: -1, energy: first.energy, why: "anchor" });
      log(st, first.name + " drops anchor and is not pushed");
      pushHooks(st, p, first, dir, cause, true, hurt);
      for (const h of hurt) if (h.who.alive) { log(st, h.who.name + " takes " + h.n + " from " + h.why); damage(st, C, h.who, h.n, h.source); }
      return false;
    }
    /* Repulsion Field: "Pay X Energy when a robot would push your robot: Push them X spaces away from your robot instead." X is 1 here */
    if (has(first, "repulsionField") && first.energy >= 1) {
      first.energy -= 1;
      st.events.push({ type: "energy", player: first.id, amount: -1, energy: first.energy, why: "repulsion" });
      log(st, first.name + "'s repulsion field throws " + p.name + " back");
      pushHooks(st, p, first, dir, cause, true, hurt);
      for (const h of hurt) if (h.who.alive) { log(st, h.who.name + " takes " + h.n + " from " + h.why); damage(st, C, h.who, h.n, h.source); }
      if (p.alive) stepRobot(st, C, p, opposite(dir), "beam");
      return false;
    }
  }
  /* "if your robot pushes (or attempts to push) an adjacent robot": a push
   * that a wall stops is still a push for Ramming Gear and for Spiky */
  if (blocked) {
    for (let i = 1; i < chain.length; i++) pushHooks(st, chain[i - 1], chain[i], dir, cause, true, hurt);
    for (const h of hurt) if (h.who.alive) { log(st, h.who.name + " takes " + h.n + " from " + h.why); damage(st, C, h.who, h.n, h.source); }
    return false;
  }
  /* far end first, so nobody is ever asked to land on an occupied square */
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    let [tc, tr] = stepCell(m.c, m.r, dir);
    const from = [m.c, m.r];
    /* "When a robot crosses over a ledge from an upper level to a lower level,
     * draw 2 damage. Draw only 1 damage if falling into a water space." */
    const drop = levelStepAt(C, m.c, m.r, dir) < 0 && !rampBetween(C, m.c, m.r, dir);
    /* "When a robot is moving down a ramp, the ramp is ignored. The ramp does
     * not act as an extra space." A lone robot coming down across a ramp edge
     * passes over the ramp's square, the foot, and lands on the square below
     * it, when that square is free floor. */
    if (chain.length === 1 && rampDownAt(C, m.c, m.r, dir)) {
      const [bc, br] = stepCell(tc, tr, dir);
      if (inGrid(C, bc, br) && !holeNow(st, C, bc, br) && !solidAt(st, bc, br, m) && !wallBlocks(C, tc, tr, dir, st.register)) { tc = bc; tr = br; }
    }
    m.c = tc; m.r = tr;
    tread(m);
    st.events.push({ type: i > 0 ? "pushed" : "moved", player: m.id, from, to: [tc, tr], dir, cause, by: i > 0 ? chain[i - 1].id : undefined });
    if (drop) { const n = waterAt(C, tc, tr) ? 1 : 2; hurt.push({ who: m, n, source: "ledge", why: "the drop off the ledge" }); }
    /* Thrills and Spills: "A robot takes 1 damage each time it enters, passes through, or is pushed into or through an active flamer space." */
    const entered = isModern(st) && inGrid(C, tc, tr) ? fireAt(C, tc, tr, st.register) : null;
    if (entered) hurt.push({ who: m, n: 1, source: entered, why: entered === "flamer" ? "the flamer" : "the flame" });
    if (i > 0) {
      log(st, chain[i - 1].name + " shoves " + m.name + " " + DIR_NAMES[dir]);
      pushHooks(st, chain[i - 1], m, dir, cause, false, hurt);
      if (cause === "card") { if (!p.pushed) p.pushed = []; if (!p.pushed.includes(m.id)) p.pushed.push(m.id); }
    }
    if (holeNow(st, C, m.c, m.r)) {
      /* a hovering robot passes over a pit, and falls in only where its move ends */
      if (i === 0 && m.hoverSteps > 0 && inGrid(C, m.c, m.r)) { log(st, m.name + " hovers over the pit"); }
      else if (!dances(st, C, m)) { destroy(st, C, m, inGrid(C, m.c, m.r) ? "into a pit" : "over the edge"); continue; }
    }
    throughPortal(st, C, m);
    /* a jet burns what passes through it, not only what stops in it. The 2016
     * book's own wording took its point above, before the pit; this is the
     * classic one, which reads the square the robot came to rest on. */
    const through = isModern(st) ? null : fireAt(C, m.c, m.r, st.register);
    if (through) hurt.push({ who: m, n: 1, source: through, why: "the flame" });
  }
  /* damage lands after the whole chain has moved: applying it mid-loop can
   * destroy a robot the robots behind it are still being pushed into */
  for (const h of hurt) if (h.who.alive) { log(st, h.who.name + " takes " + h.n + " from " + h.why); damage(st, C, h.who, h.n, h.source); }
  /* a shoved robot that came to rest on oil skids on, where the edition says so */
  if (rulesOf(st).oilSlideAfter.indexOf("push") >= 0) {
    for (let i = 1; i < chain.length; i++) if (chain[i].alive && oilAt(C, chain[i].c, chain[i].r)) oilSlide(st, C, chain[i], dir);
  }
  return true;
}

/** The pusher's hooks (Ramming Gear, Piercing Drill) and the pushed robot's (Spiky), for one link of a chain. */
function pushHooks(st, pusher, pushed, dir, cause, failed, hurt) {
  const pctx = fire(st, pusher, "onPush", { pushed, dir, cause, failed, pushDamage: 0 });
  if (pctx.pushDamage > 0) hurt.push({ who: pushed, n: pctx.pushDamage, source: "ram", why: pusher.name + "'s " + (pctx.why || "ramming gear") });
  const dctx = fire(st, pushed, "onPushed", { pusher, dir, cause, failed, pusherDamage: 0 });
  if (dctx.pusherDamage > 0) hurt.push({ who: pusher, n: dctx.pusherDamage, source: "spiky", why: pushed.name + "'s spikes" });
}

/* --- Crash and Burn: portals and oil ------------------------------------------
 *
 * Read off the AMIGO Spielanleitung, pp.7-8 (manual1/IMG_1227, IMG_1228), and
 * the reference card (IMG_1232). Both rulesets carry the edition's reading in
 * `oilSlideAfter` and `portalBlockedBy`; see editor/rulesets/classic.js. */

/**
 * "Sobald ein Roboter ein Portalfeld betritt, wechselt er sofort auf das
 * andere Portalfeld gleicher Farbe." Called wherever a robot's square changes,
 * so it comes out of the twin whether it drove, was shoved, was carried by a
 * belt or skidded there. "Beide Portalfelder gelten als ein Feld": the hop
 * spends no movement and nothing on the way is triggered twice.
 *
 * A robot standing on either end switches the pair off, and a switched-off
 * portal is ordinary floor. The robot that has just arrived is standing on the
 * far end, so the pair is dead behind it and it cannot bounce back; a robot
 * already on the far end means the entering robot simply stands where it is.
 */
export function throughPortal(st, C, p) {
  const twin = portalTwin(C, p.c, p.r);
  if (!twin) return false;
  if (robotAt(st, twin[0], twin[1])) return false;
  const from = [p.c, p.r];
  p.c = twin[0]; p.r = twin[1];
  tread(p);
  st.events.push({ type: "portal", player: p.id, from, to: [p.c, p.r] });
  log(st, p.name + " drops through a portal");
  return true;
}

/**
 * The skid. "Er rutscht solange, bis er ein Feld ohne Öl erreicht oder vor
 * einer Wand beziehungsweise vor einem anderen Roboter, der sich nicht auf
 * einer Öllache befindet, stehen bleibt." A robot on the same slick is shoved
 * along and both slide until the front one finds grip, a wall, or a further
 * robot -- the book has the pair stop before a third robot, wherever it stands.
 * Not a move: no card, no oil discount, and it is never re-entered.
 */
export function oilSlide(st, C, p, dir) {
  let skidded = false;
  for (let guard = 0; guard < 64; guard++) {
    if (!p.alive || !oilAt(C, p.c, p.r)) break;
    /* walk the chain the way stepRobot will, but stop before a robot with grip */
    let c = p.c, r = p.r, stopped = false, shoving = 0;
    for (let g = 0; g < 10; g++) {
      if (blockedMove(st, C, c, r, dir)) { stopped = true; break; }
      const [nc, nr] = stepCell(c, r, dir);
      if (!inGrid(C, nc, nr)) break;                  // the head goes over the edge: that is a slide too
      const occ = solidAt(st, nc, nr, p);
      if (!occ) break;
      if (!oilAt(C, nc, nr) || shoving) { stopped = true; break; }
      shoving++; c = nc; r = nr;
    }
    if (stopped) break;
    if (!skidded) { log(st, p.name + " skids on the oil"); skidded = true; }
    if (!stepRobot(st, C, p, dir, "oil")) break;
  }
  return skidded;
}

/**
 * A card becomes a plan before it becomes movement, so a card's modifyMove
 * hook has something to rewrite -- and can ask a question before anything has
 * moved. Returns the ctx; `pending` means the step must ask and come back.
 */
export function planCard(st, p, cd, again) {
  const plan = planOf(cd);
  /* The Oppositron: "Do the opposite of what your programming card says" -- a Move n backs up n,
   * Back Up moves 1, a rotate turns the other way, a U-Turn is no turn; Again and Power Up have no opposite */
  if (p.opposite === st.register && !again) {
    if (plan.kind === "move") plan.dist = plan.dist === -1 ? 1 : -plan.dist;
    else if (plan.kind === "turn") plan.turn = plan.turn === 2 ? 0 : -plan.turn;
    plan.opposite = true;
  }
  plan.lateral = 0;
  plan.again = !!again;                                // Brakes does not apply to a repeated Move 1
  return fire(st, p, "modifyMove", plan);
}

function describePlan(cd, plan) {
  const base = planOf(cd);
  const label = (plan.again ? "again: " : "") + cd.kind.replace(/^(move1|move2|move3|back|left|right|uturn|powerUp|again)$/, m => ({
    move1: "move 1", move2: "move 2", move3: "move 3", back: "backs up", left: "rotates left", right: "rotates right", uturn: "u-turns",
    powerUp: "powers up", again: "again" })[m] || m);
  if (plan.opposite) return label + ", through the Oppositron: " + (plan.kind === "turn" ? (plan.turn === 0 ? "no turn" : plan.turn > 0 ? "rotates right" : "rotates left") : plan.dist > 0 ? "move " + plan.dist : "back " + (-plan.dist));
  if (plan.kind !== "move") return label;
  if (plan.lateral) return label + ", sidestepping " + (plan.lateral < 0 ? "left" : "right");
  if (plan.dist === 0 && base.dist !== 0) return label + ", but brakes and holds still";
  if (plan.turbo) return label + ", one more with Turbo: " + Math.abs(plan.dist);
  if (Math.abs(plan.dist) > Math.abs(base.dist)) return label + ", in " + (plan.dist < 0 ? "reverse" : "fourth") + " gear: " + Math.abs(plan.dist);
  return label;
}

/** Play one register's card for one robot, as planned. */
export function playCard(st, C, p, cd, plan) {
  plan = plan || planOf(cd);
  log(st, p.name + " " + describePlan(cd, plan));
  st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register });
  const start = [p.c, p.r];
  p.pushed = []; p.lastMove = null;
  if (plan.kind === "turn") {
    p.face = rot(p.face, plan.turn);
    st.events.push({ type: "turned", player: p.id, turn: plan.turn, face: p.face, cause: "card" });
    stayedInFlame(st, C, p, start);
    return;
  }
  /* "Power Up: advance your Energy Tracking Cube 1 space on your Energy Track." */
  if (plan.kind === "energy") { gainEnergy(st, p, plan.gain || 1, "powerUp"); stayedInFlame(st, C, p, start); return; }
  if (plan.kind !== "move") { stayedInFlame(st, C, p, start); return; }
  const dir = plan.lateral ? rot(p.face, plan.lateral) : plan.dist > 0 ? p.face : opposite(p.face);
  let n = Math.abs(plan.dist);
  /* Slow Processor, installed onto this robot: one square fewer on a Move 2 or a Move 3 */
  if (has(p, "slowProcessor") && plan.dist >= 2 && (cd.kind === "move2" || cd.kind === "move3")) { n--; log(st, p.name + "'s slow processor holds it back a square"); }
  if (n > 0 && oilAt(C, p.c, p.r)) n--;               // wheels spin on oil: one square less
  if (n > 0 && waterAt(C, p.c, p.r)) n--;               // Wet and Wild: leaving water costs a space, once per Move card -- under either book (issue #14)
  let moved = 0;
  const hover = fire(st, p, "modifyMove", { kind: "hover", hover: false }).hover;
  for (let i = 0; i < n; i++) {
    /* a robot destroyed mid-move leaves no hover behind: the counter outlived
     * the move once, and a Haywire sidestep after the reboot floated on it */
    if (!p.alive) { p.hoverSteps = 0; return; }
    p.hoverSteps = hover ? n - i - 1 : 0;
    if (!stepRobot(st, C, p, dir, "card")) {                                // a wall: the rest of the move is lost
      p.hoverSteps = 0;
      const blk = lastBlock;
      /* a field, not a wall: thrown back (a wall printed behind a field is just a wall from that side) */
      if (blk && fieldHit(C, blk.c, blk.r, dir)) repulse(st, C, p, blk.head, dir, Math.abs(plan.dist));
      break;
    }
    moved++;
  }
  p.hoverSteps = 0;
  /* Hover Unit: "falls in if it ends its move on one" -- including a move a wall cut short over a pit */
  if (hover && p.alive && fallsHere(st, C, p)) destroy(st, C, p, "into a pit");
  p.lastMove = moved > 0 ? { dir, n: moved } : null;
  /* "If a robot stops on this virtual ramp space, the robot slides back to the
   * lower level, which will push a robot occupying that space." The ramp space
   * is the foot square with the climb ahead of it: stopped there, heading up. */
  if (moved > 0 && p.alive && rampUpAt(C, p.c, p.r, dir)) {
    log(st, p.name + " stops on the ramp and slides back down");
    stepRobot(st, C, p, opposite(dir), "ramp");
  }
  /* "Erst wenn er seine Bewegung beendet (bremst), gerät er auf einer Öllache
   * ins Rutschen": once, after the card, and only if it actually travelled --
   * momentum it never had cannot carry it */
  if (moved > 0 && p.alive && oilAt(C, p.c, p.r)) oilSlide(st, C, p, dir);
  stayedInFlame(st, C, p, start);
}

/**
 * A repulsor field throws back what its card drove into it (Turn & Burn's
 * Factory Floor Guide, manual1/IMG_1466): a robot moving into it is pushed
 * straight away from it as many spaces as the Move card that caused the move,
 * and loses the rest of that move; a robot pushed into it goes back as many
 * as the pusher's Move card, and the pusher loses the rest of its move.
 *
 * `head` is the robot that met the field: the mover itself, or the far end of
 * the chain it was pushing. It goes back one square at a time, and each square
 * is an ordinary push -- so a robot bounced back through its pusher shoves the
 * pusher back too, and a pit, a wall or the board's edge behind does what it
 * always does. `n` is the card's printed distance, not what oil or water left
 * of it: the book counts the card.
 */
function repulse(st, C, p, head, dir, n) {
  const back = opposite(dir);
  /* Field Stabilizer: one square less, always (declared, upgrades.js) */
  if (has(head, "fieldStabilizer") && n > 0) { n--; log(st, head.name + "'s field stabilizer takes a square off the throw"); }
  log(st, head.name + " is thrown back by the repulsor field");
  st.events.push({ type: "repulsed", player: head.id, dir: back, n });
  for (let k = 0; k < n && head.alive; k++) if (!stepRobot(st, C, head, back, "repulsor")) break;
}

/**
 * "Ein Roboter erhält auch einen Schaden, wenn er ein Feld eines aktiven
 * Brenners nicht verlässt" (p.8, with a rotate as the example). Leaving one at
 * the start of a move costs nothing; ending the card where it began, in an
 * active flame, costs one. The burner's own turn later in the register is a
 * second point, which is the two-in-one-register the book warns about.
 *
 * CLASSIC ONLY, and now explicitly so. The 2016 book burns a robot for
 * ENTERING fire and once more at the end of the register; a robot that turns
 * on the spot in a flamer has entered nothing and takes the end-of-register
 * point alone. Reading the square is shared, the timing is not.
 */
function stayedInFlame(st, C, p, start) {
  if (!p.alive || isModern(st) || p.c !== start[0] || p.r !== start[1]) return;
  const burn = fireAt(C, p.c, p.r, st.register);
  if (!burn) return;
  log(st, p.name + " sits in the flame and takes 1");
  damage(st, C, p, 1, burn);
}

/* --- the floor --------------------------------------------------------------- */

/**
 * Conveyors move simultaneously with a vacancy test: two robots converging on
 * one square move neither; a robot on a belt does not push one standing off
 * it. `lo..hi` is the speed range that moves this pass: express alone (2,2),
 * then everything (1,2).
 */
export function beltPass(st, C, lo, hi, only, squares) {
  const movers = new Map();
  const sidesteps = [];
  for (const p of alive(st)) {
    if (only && p.id !== only.id) continue;
    const sp = beltAt(C, p.c, p.r);
    if (!sp || sp < lo || sp > hi) continue;
    if (squares && !squares(C, p.c, p.r)) continue;
    /* Top Heavy took it off the belts for this register */
    if (p.beltFree && p.beltFree.turn === st.turn && p.beltFree.register === st.register) continue;
    let d = beltExit(C, p.c, p.r);
    /* Moon Walk: the belts run backwards for it, "only if this would not stop/push another robot" */
    if (p.moonwalk === st.turn) {
      const rd = opposite(d);
      const [rc, rr] = stepCell(p.c, p.r, rd);
      if (!blockedMove(st, C, p.c, p.r, rd) && !(inGrid(C, rc, rr) && solidAt(st, rc, rr, p))) d = rd;
    }
    if (blockedMove(st, C, p.c, p.r, d)) continue;
    /* Top Heavy: "If your robot is about to be moved by a conveyor belt, it may ignore all conveyor
     * belts this register and move 1 space to the left or right" -- asked before anything moves */
    const bctx = fire(st, p, "onBoardElement", { kind: "belt", dir: d, veto: false, side: 0 });
    if (bctx.pending) return bctx.ask;
    if (bctx.veto) { p.beltFree = { turn: st.turn, register: st.register }; sidesteps.push({ p, side: bctx.side }); continue; }
    const [tc, tr] = stepCell(p.c, p.r, d);
    movers.set(p.id, { dir: d, to: [tc, tr] });
  }
  for (const s of sidesteps) {
    log(st, s.p.name + " is top-heavy and steps off the belt " + (s.side < 0 ? "left" : "right"));
    stepRobot(st, C, s.p, rot(s.p.face, s.side), "upgrade");
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, m] of movers) {
      const mover = st.players[id];
      const occ = solidAt(st, m.to[0], m.to[1], mover);
      if (occ && occ.id !== id && !movers.has(occ.id)) { movers.delete(id); changed = true; break; }
      for (const [id2, m2] of movers) {
        if (id2 === id || mover.virtual || st.players[id2].virtual) continue;     // a virtual robot meets nobody
        if (m2.to[0] === m.to[0] && m2.to[1] === m.to[1]) { movers.delete(id); movers.delete(id2); changed = true; break; }
      }
      if (changed) break;
    }
  }
  /* every robot lands before any of them reacts to where it landed: the
   * vacancy test above cleared each target on the board as the pass began,
   * and a skid or a portal hop taken before the rest have moved can land on
   * a square a belt is about to deliver someone else to (Sampler's quick
   * course did exactly this, two robots on one square) */
  const landed = [];
  for (const [id, m] of movers) {
    const b = st.players[id];
    const from = [b.c, b.r];
    b.c = m.to[0]; b.r = m.to[1];
    tread(b);
    st.events.push({ type: "conveyed", player: b.id, from, to: m.to, dir: m.dir });
    landed.push({ b, from, m });
  }
  const skids = [];
  for (const { b, from, m } of landed) {
    if (fallsHere(st, C, b)) { destroy(st, C, b, inGrid(C, b.c, b.r) ? "into a pit" : "over the edge"); continue; }
    /* "When a robot crosses over a ledge from an upper level to a lower level,
     * draw 2 damage" -- a belt carrying it over is a crossing like any other */
    if (levelStepAt(C, from[0], from[1], m.dir) < 0 && !rampBetween(C, from[0], from[1], m.dir)) {
      const n = waterAt(C, b.c, b.r) ? 1 : 2;
      log(st, b.name + " is carried off the ledge and takes " + n);
      damage(st, C, b, n, "ledge");
      if (!b.alive) continue;
    }
    throughPortal(st, C, b);
    /* rotate ONLY because a belt carried the robot onto a curve, and only
     * where the board prints an arm on the side it came in by */
    if (beltAt(C, b.c, b.r)) {
      const t = beltTurnFor(C, b.c, b.r, m.dir);
      if (t === 1 || t === -1) {
        const bctx = fire(st, b, "onBoardElement", { kind: "beltCurve", turn: t, veto: false });
        if (!bctx.veto) {
          b.face = rot(b.face, bctx.turn);
          st.events.push({ type: "turned", player: b.id, turn: bctx.turn, face: b.face, cause: "belt" });
          log(st, b.name + " is carried round a curve");
        }
      }
    }
    skids.push({ b, m });
  }
  /* and the skids last, since a skid shoves: every robot has landed, hopped
   * and turned, so each slide meets the board as the belts left it */
  if (rulesOf(st).oilSlideAfter.indexOf("belt") >= 0) {
    for (const { b, m } of skids) if (b.alive && oilAt(C, b.c, b.r)) oilSlide(st, C, b, m.dir);
  }
  return null;
}

export function gearPass(st, C) {
  for (const p of alive(st)) {
    const t = gearAt(C, p.c, p.r);
    if (!t) continue;
    const gctx = fire(st, p, "onBoardElement", { kind: "gear", turn: t, veto: false });
    if (gctx.veto) { log(st, p.name + " is held steady by its gyroscope"); continue; }
    p.face = rot(p.face, gctx.turn);
    st.events.push({ type: "turned", player: p.id, turn: gctx.turn, face: p.face, cause: "gear" });
    log(st, p.name + " is turned by a gear");
  }
}

export function pusherPass(st, C) {
  for (const p of alive(st)) {
    const pu = pusherAt(C, p.c, p.r, st.register);
    if (!pu) continue;
    log(st, p.name + " is shoved by a pusher");
    stepRobot(st, C, p, pu.dir, "pusher");
  }
}

/**
 * A hole right now: a pit, the void, or a trap door active in the register
 * being run. Outside the registers a trap door is floor. One question for
 * every mover, so a card, a push, a belt and a hover cannot disagree about it.
 */
export function holeNow(st, C, c, r) {
  return isHole(C, c, r, st.phase === "exec" ? st.register : undefined);
}

/**
 * Pit Trap Dance (Turn & Burn): a robot holding it that would fall into a pit
 * or an active trap door pit during a register discards it there and then,
 * and falls into none for the rest of that register. Not the board's edge,
 * which is no pit. True when the robot is spared.
 */
export function dances(st, C, p) {
  if (st.phase !== "exec" || !inGrid(C, p.c, p.r)) return false;
  const mark = st.turn + ":" + st.register;
  if (p.danced === mark) return true;
  if (!(p.installed || []).some(u => u.id === "pitTrapDance")) return false;
  uninstallUpgrade(st, p, "pitTrapDance", "uses up");
  p.danced = mark;
  log(st, p.name + " dances over the pit: no pit takes it this register");
  return true;
}

/** Would a robot standing where it is fall now: a hole this moment, and no dance to save it. */
export function fallsHere(st, C, p) {
  return holeNow(st, C, p.c, p.r) && !dances(st, C, p);
}

/**
 * Turn & Burn's trap door pits, at the START of each register printed on them
 * (manual1/IMG_1465): a robot in the space when the door activates is lost,
 * and cannot escape it. The sheet's own example is a robot that ends
 * register 3 on a door marked 4: it is lost at the start of register 4,
 * before it can move away. Through the rest of the register the door is a pit
 * to anything that enters it, which `holeNow` answers. The same timing under
 * the classic book, by the author's ruling (2026-09-27).
 */
export function trapDoorsActivate(st, C) {
  const fell = [];
  for (const p of alive(st)) {
    if (!trapDoorActive(C, p.c, p.r, st.register) || dances(st, C, p)) continue;
    log(st, p.name + " is standing on a trap door pit as it opens");
    destroy(st, C, p, "through a trap door");
    fell.push(p.id);
  }
  return fell;
}

export function crusherPass(st, C) {
  for (const p of alive(st)) {
    if (!crusherFires(C, p.c, p.r, st.register)) continue;
    log(st, p.name + " is crushed by a press");
    destroy(st, C, p, "under a press");
  }
}

/** The classic order's burner step: after the lasers, whatever fire the board carries. */
export function jetPass(st, C) {
  for (const p of alive(st)) {
    const burn = fireAt(C, p.c, p.r, st.register);
    if (!burn) continue;
    log(st, p.name + " is scorched by a burner");
    damage(st, C, p, 1, burn);
  }
}

/** The first robot a beam meets from (c,r) heading `dir`, or null. Robot lasers skip their own square; `pierce` walls may be shot through. */
export function firstRobotAlong(st, C, c, r, dir, skipOrigin, pierce = 0, shooter) {
  const at = (cc, rr) => shooter ? solidAt(st, cc, rr, shooter) : robotAt(st, cc, rr);
  if (!skipOrigin) { const h = at(c, r); if (h) return h; }
  for (let guard = 0; guard < C.w + C.h + 2; guard++) {
    if (wallBlocks(C, c, r, dir, st.register)) { if (pierce <= 0) return null; pierce--; }
    if (levelStepAt(C, c, r, dir) !== 0) return null;   // "cannot hit targets that are not on their same level"
    const [nc, nr] = stepCell(c, r, dir);
    if (!inGrid(C, nc, nr)) return null;
    c = nc; r = nr;
    const h = at(c, r);
    if (h) return h;
  }
  return null;
}

/**
 * Board lasers and robot lasers fire at the same instant. Every shot is
 * resolved against one frozen board, and only then is any damage applied --
 * so a robot taking its tenth damage from a board laser still fires its own
 * laser this register.
 */
export function computeLaserHits(st, C, cache) {
  const hits = [];
  for (const L of C.lasers) {
    const path = laserSquares(C, L, st.register);
    let target = null;
    for (const [c, r] of path) { target = robotAt(st, c, r); if (target) break; }
    if (target) hits.push({ target, damage: L.damage, from: "a board laser", shooter: null, dir: L.dir, at: [L.c, L.r] });
  }
  for (const p of alive(st)) {
    if (p.poweredDown) continue;                       // a powered-down or shut-down robot does not shoot
    if (p.virtual) continue;                           // a virtual robot shoots nobody
    /* the main laser is marked as such: a main-laser mod applies to it and
     * not to an additional weapon like the rear laser; the register's card
     * is named so a card that fires on a manoeuvre (Laser Kata) can see it */
    const ri = p.registers[st.register];
    const cardKind = ri === null || ri === undefined ? null : card(st, ri).kind;
    /* a Haywire can charge the main laser for the register it was revealed in */
    /* a resolved volley is kept while the pass asks its questions, so a
     * Turret's aim is not asked twice and not lost on the re-run */
    let shots = cache && cache[p.id];
    if (!shots) {
      const ctx = fire(st, p, "laserShots", { shots: [{ main: true, dir: p.face, damage: p.laserBonus === st.register ? 2 : 1, pierce: 0 }], cardKind,
        sees: d => firstRobotAlong(st, C, p.c, p.r, d, true, 0, p) });
      if (ctx.pending) return { ask: ctx.ask };
      shots = ctx.shots;
      if (cache) cache[p.id] = shots;
    }
    for (const sh of shots) {
      if (sh.damage <= 0) continue;
      /* a rail gun's beam goes on through every robot and wall to the edge */
      /* a shot with a named target (Indirect Fire) hits it whatever lies between */
      const victims = sh.target !== undefined ? [st.players[sh.target]].filter(v => v && v.alive && !v.virtual)
        : sh.through ? everyRobotAlong(st, C, p.c, p.r, sh.dir, p) : [firstRobotAlong(st, C, p.c, p.r, sh.dir, true, sh.pierce || 0, p)].filter(Boolean);
      for (const v of victims) {
        hits.push({ target: v, damage: sh.damage, from: p.name + "'s laser", shooter: p, dir: sh.dir, at: [p.c, p.r], main: sh.main,
          distance: Math.abs(v.c - p.c) + Math.abs(v.r - p.r) });
      }
    }
  }
  return { hits };
}

/** Every robot on the line from (c,r) heading `dir`, walls or not, nearest first. */
export function everyRobotAlong(st, C, c, r, dir, shooter) {
  const out = [];
  for (let guard = 0; guard < C.w + C.h + 2; guard++) {
    if (levelStepAt(C, c, r, dir) !== 0) break;
    const [nc, nr] = stepCell(c, r, dir);
    if (!inGrid(C, nc, nr)) break;
    c = nc; r = nr;
    const h = shooter ? solidAt(st, c, r, shooter) : robotAt(st, c, r);
    if (h) out.push(h);
  }
  return out;
}

/**
 * Every shot this register, resolved against one frozen board, then applied.
 *
 * Two kinds of question can come up. A shooter's optional weapon (shove, pull
 * or scramble instead of damage) is asked before anything is touched, so the
 * re-run recomputes the identical hits. The target's option exchange -- a card
 * sacrificed to absorb a point as it lands -- is asked AFTER the automatic
 * absorbers (Ablative Coat, Power Down Shield) have taken their share, since
 * a player should not be asked to pay for a point a coat was about to eat.
 * Absorbers mutate card state, so from that moment the resolved hits are
 * parked on the state (`st.laser`) and a re-run applies them rather than
 * recomputing. Returns a request to raise, or null when the pass completed.
 */
export function laserPass(st, C) {
  if (!st.laser) {
    /* every shooter's decisions are kept as they are made: a pass that asks
     * twice (two robots with optional weapons) re-runs from the top, and a
     * card's answer is applied once, so the first robot's choice would be
     * lost -- or its charge spent again -- if its hook were fired again */
    if (!st.laserSeen) st.laserSeen = { shots: {}, hits: {} };
    const res = computeLaserHits(st, C, st.laserSeen.shots);
    if (res.ask) return res.ask;
    const hits = res.hits;
    for (const h of hits) {
      if (!h.shooter || !h.main) continue;
      const k = h.shooter.id + ":" + h.target.id;
      const seen = st.laserSeen.hits[k];
      if (seen) { h.damage = seen.damage; h.replaceWith = seen.replaceWith; h.fireControl = seen.fireControl; continue; }
      const seenFirst = st.laserSeen.hits[k];
      const hctx = fire(st, h.shooter, "onLaserHit", { targetName: h.target.name, target: h.target, damage: h.damage, shotDir: h.dir, replaceWith: null, fireControl: null, splash: false,
        distance: h.distance, lastRegister: st.register >= REGISTERS - 1 });
      if (hctx.pending) return hctx.ask;
      h.damage = hctx.damage; h.replaceWith = hctx.replaceWith; h.fireControl = hctx.fireControl || null; h.splash = !!hctx.splash;
      st.laserSeen.hits[k] = { damage: h.damage, replaceWith: h.replaceWith, fireControl: h.fireControl, splash: h.splash };
      void seenFirst;
    }
    st.laserSeen = null;
    for (const h of hits) {
      if (h.replaceWith || h.damage <= 0 || !h.target.alive) continue;
      const ctx = fire(st, h.target, "onDamage", { amount: h.damage, source: "laser", absorbed: 0, dir: h.dir, by: h.shooter || null, reflect: 0 });
      if (ctx.absorbed > 0) log(st, h.target.name + " absorbs " + ctx.absorbed + " damage");
      h.damage = ctx.amount; h.reflect = ctx.reflect || 0;
    }
    st.laser = hits.map(h => ({ target: h.target.id, shooter: h.shooter ? h.shooter.id : null, damage: h.damage, dir: h.dir, at: h.at, from: h.from, replaceWith: h.replaceWith, distance: h.distance,
      fireControl: h.fireControl || null, splash: !!h.splash, reflect: h.reflect || 0 }));
  }
  const hits = st.laser.map(h => ({ ...h, target: st.players[h.target], shooter: h.shooter === null ? null : st.players[h.shooter] }));

  /* "A robot with option cards may choose to sacrifice an option card to avoid
   * receiving a point of damage. Any number may be discarded, but the player
   * must decide at the time the damage is received." One question per point,
   * per target, keyed so a re-run finds every answer already given; the cards
   * go and the hits shrink BEFORE anything is applied, so a sacrifice can keep
   * a robot off its tenth point. */
  const incoming = new Map();
  for (const h of hits) { if (h.splash === undefined) h.splash = false; if (h.damage > 0 && !h.replaceWith && h.target.alive) incoming.set(h.target.id, (incoming.get(h.target.id) || 0) + h.damage); }
  const sacrifice = new Map();
  for (const [id, n] of incoming) {
    const t = st.players[id];
    const chosen = [];
    for (let k = 0; k < n; k++) {
      const avail = t.options.map((o, i) => i).filter(i => !chosen.includes(i));
      if (!avail.length) break;
      const key = st.turn + ":" + st.register + ":exchange:" + id + ":" + k;
      const have = st.answers[key];
      if (have === undefined) {
        const from = hits.find(h => h.target.id === id && h.damage > 0 && !h.replaceWith).from;
        return { player: id, kind: "cardChoice", key, card: null, exchange: true, incoming: n - chosen.length,
          prompt: t.name + " is about to take " + (n - chosen.length) + " damage from " + from + ". Sacrifice a card to absorb a point of it?",
          labels: ["Take the damage"].concat(avail.map(i => OPTION_DEFS[t.options[i].id].name)),
          options: [0].concat(avail.map(i => i + 1)) };
      }
      if (have === 0) break;
      const idx = have - 1;
      if (!avail.includes(idx)) break;
      chosen.push(idx);
    }
    if (chosen.length) sacrifice.set(id, chosen);
  }
  for (const [id, idxs] of sacrifice) {
    const t = st.players[id];
    const ids = idxs.map(i => t.options[i].id);
    for (const cid of ids) discardOption(st, t, cid, "sacrifices");
    let absorb = ids.length;
    for (const h of hits) {
      if (h.target.id !== id || h.replaceWith || absorb <= 0) continue;
      const take = Math.min(h.damage, absorb);
      h.damage -= take; absorb -= take;
    }
    log(st, t.name + " absorbs " + ids.length + " damage with " + (ids.length === 1 ? "a card" : ids.length + " cards"));
  }

  if (!st.laserAfter) {
    const boardHit = [];
    for (const h of hits) {
      if (!h.target.alive) continue;
      if (h.replaceWith) {
        st.events.push({ type: "shot", from: h.at, dir: h.dir, target: h.target.id, shooter: h.shooter.id, damage: 0, effect: h.replaceWith.kind });
        const rw = h.replaceWith;
        if (rw.kind === "push") { log(st, h.target.name + " is shoved by a beam"); stepRobot(st, C, h.target, rw.dir, "beam"); }
        else if (rw.kind === "scramble") scrambleRegister(st, h.target);
        /* Mini Howitzer: two damage, then a shove in the direction of fire;
         * the Turbo Blaster's one point goes through the target's absorbers */
        else if (rw.kind === "blast") {
          log(st, h.target.name + " takes " + rw.damage + " from " + h.shooter.name + "'s " + (rw.absorb ? "blaster" : "howitzer"));
          if (rw.absorb) damage(st, C, h.target, rw.damage, "laser", rw.dir); else landDamage(st, C, h.target, rw.damage, "laser");
          if (h.target.alive) stepRobot(st, C, h.target, rw.dir, "beam");
        }
        /* Remote Control: from the next register on, the target runs the controller's cards */
        else if (rw.kind === "radio") {
          h.target.controlledBy = h.shooter.id;
          st.events.push({ type: "controlled", player: h.target.id, by: h.shooter.id });
          log(st, h.target.name + " is under " + h.shooter.name + "'s remote control for the rest of the turn");
        }
        /* Displacing Blast: to the reboot point of the board it stands on, facing unchanged */
        else if (rw.kind === "displace") displaceTo(st, C, h.target, h.shooter);
        /* Stun: "the target discards all face-down cards in their next register" */
        else if (rw.kind === "stun") stunRegister(st, h.target, h.shooter);
        continue;
      }
      if (h.damage <= 0) continue;
      st.events.push({ type: "shot", from: h.at, dir: h.dir, target: h.target.id, shooter: h.shooter ? h.shooter.id : null, damage: h.damage });
      log(st, h.target.name + " takes " + h.damage + " from " + h.from);
      /* Fire Control lands with the damage: a register locked for next turn, or an option card gone */
      if (h.fireControl && h.shooter) {
        const fc = h.fireControl;
        if (fc.lock !== undefined) { h.target.locks[fc.lock] = st.turn; st.events.push({ type: "locked", player: h.target.id, register: fc.lock, by: h.shooter.id }); log(st, h.shooter.name + "'s fire control locks " + h.target.name + "'s register " + (fc.lock + 1)); }
        else if (fc.destroy) discardOption(st, h.target, fc.destroy, "loses to fire control");
      }
      landDamage(st, C, h.target, h.damage, "laser");
      /* Mirror: the shooter takes the same back, the first time each round */
      if (h.reflect > 0 && h.shooter && h.shooter.alive) { log(st, h.shooter.name + " takes " + h.reflect + " back off " + h.target.name + "'s mirror"); landDamage(st, C, h.shooter, h.reflect, "laser"); }
      /* Splash Damage: one to each robot adjacent to the target */
      if (h.splash && h.shooter) {
        for (const q of alive(st)) {
          if (q.id === h.target.id || q.id === h.shooter.id || Math.abs(q.c - h.target.c) + Math.abs(q.r - h.target.r) !== 1) continue;
          log(st, q.name + " takes 1 from the splash");
          damage(st, C, q, 1, "laser");
        }
      }
      if (!h.shooter && !boardHit.includes(h.target.id)) boardHit.push(h.target.id);
    }
    st.laserAfter = boardHit;
  }
  /* "After your robot takes damage from a board laser, you may move 1 space
   * forward or backward" -- asked once the volley has landed */
  while (st.laserAfter.length) {
    const t = st.players[st.laserAfter[0]];
    if (t.alive) {
      const ctx = fire(st, t, "afterBoardLaser", { move: 0 });
      if (ctx.pending) return ctx.ask;
      if (ctx.move) { log(st, t.name + " converts the hit into a move"); stepRobot(st, C, t, ctx.move > 0 ? t.face : opposite(t.face), "upgrade"); }
    }
    st.laserAfter.shift();
  }
  st.laser = null;
  st.laserAfter = null;
  return null;
}

/** Displacing Blast: "the Reboot token on the board they occupy" -- or the archive on a course without tokens. Facing is kept; an occupant moves to the nearest free floor. */
export function displaceTo(st, C, p, by) {
  const tok = C.reboots && C.reboots.length ? rebootTokenOn(C, stampOf(C, p.c, p.r)) : null;
  const at = tok || p.archive || { c: p.c, r: p.r };
  const occ = robotAt(st, at.c, at.r);
  if (occ && occ.id !== p.id) {
    const spot = freeSpotNear(st, C, at.c, at.r);
    if (spot) { const from = [occ.c, occ.r]; occ.c = spot[0]; occ.r = spot[1]; st.events.push({ type: "shoved", player: occ.id, from, to: spot, cause: "displace" }); }
  }
  const from = [p.c, p.r];
  p.c = at.c; p.r = at.r;
  tread(p);
  st.events.push({ type: "moved", player: p.id, from, to: [p.c, p.r], dir: p.face, cause: "displace" });
  log(st, p.name + " is blasted back to its reboot point by " + (by ? by.name : "a beam"));
}

/** Stun: the target's next register loses its face-down cards: the programmed card to its own discard, a Haywire to the damage discard. */
export function stunRegister(st, t, by) {
  const next = st.register + 1;
  if (next >= REGISTERS) return;
  let n = 0;
  if (t.registers[next] !== null) { putAway(st, t, t.registers[next], true); t.registers[next] = null; n++; }
  if (t.crab && t.crab[next] !== null) { putAway(st, t, t.crab[next], true); t.crab[next] = null; n++; }
  if (t.haywire && t.haywire[next] !== null) { st.damageDiscard.push(t.haywire[next]); t.haywire[next] = null; n++; }
  st.events.push({ type: "stunned", player: t.id, register: next, by: by ? by.id : null });
  log(st, t.name + " is stunned: " + n + " card" + (n === 1 ? "" : "s") + " out of register " + (next + 1));
}

/** Scrambler: the target's next register is replaced with the top card of the deck (classic: the shared one; 2016: the target's own). */
export function scrambleRegister(st, p) {
  const next = st.register + 1;
  if (next >= REGISTERS) return;
  if (isModern(st)) {
    const drawn = drawOwn(st, p);
    if (drawn === null) return;
    if (p.registers[next] !== null) putAway(st, p, p.registers[next]);
    p.registers[next] = drawn;
  } else {
    if (!st.deck.length) st.deck = st.discard.splice(0);          // never leave a register empty
    if (!st.deck.length) return;
    const drawn = st.deck.pop();
    if (p.registers[next] !== null) st.discard.push(p.registers[next]);
    p.registers[next] = drawn;
  }
  st.events.push({ type: "scrambled", player: p.id, register: next });
  log(st, p.name + "'s register " + (next + 1) + " is scrambled");
}

/* --- the 2016 piles ---------------------------------------------------------- */

/** The top card of a robot's own deck, reshuffling its discard when the deck runs out; null when it owns nothing else. */
export function drawOwn(st, p) {
  if (!p.deck.length && p.pile.length) {
    p.deck = p.pile.splice(0);
    /* shuffled with the game's generator, so a replay holds */
    for (let i = p.deck.length - 1; i > 0; i--) {
      st.rng = (Math.imul(st.rng | 0, 1664525) + 1013904223) | 0;
      const j = ((st.rng >>> 8) & 0xffffff) % (i + 1);
      [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
    }
    log(st, p.name + " shuffles its discard into a new deck");
  }
  if (!p.deck.length) return null;
  return p.deck.pop();
}

/** A card a robot is done with: its own discard, or -- for a damage card leaving it -- the table's. */
export function putAway(st, p, i, toTable) {
  if (isDamage(st, i) && (toTable || card(st, i).kind === "haywire")) st.damageDiscard.push(i);
  else p.pile.push(i);
}

/** The top of the damage deck, reshuffling its discard; null when the table has none left to give. */
/** A SPAM out of the damage deck (or, failing that, the discard) for a card that says "gain 1 SPAM"; null when there is none. */
export function drawSpam(st) {
  for (const pile of [st.damageDeck, st.damageDiscard]) {
    for (let k = pile.length - 1; k >= 0; k--) if (card(st, pile[k]).kind === "spam") return pile.splice(k, 1)[0];
  }
  return null;
}

export function drawDamage(st) {
  if (!st.damageDeck.length && st.damageDiscard.length) {
    st.damageDeck = st.damageDiscard.splice(0);
    for (let i = st.damageDeck.length - 1; i > 0; i--) {
      st.rng = (Math.imul(st.rng | 0, 1664525) + 1013904223) | 0;
      const j = ((st.rng >>> 8) & 0xffffff) % (i + 1);
      [st.damageDeck[i], st.damageDeck[j]] = [st.damageDeck[j], st.damageDeck[i]];
    }
    log(st, "the damage deck is reshuffled");
  }
  if (!st.damageDeck.length) return null;
  return st.damageDeck.pop();
}

/**
 * "When you take damage, draw that many cards from the top of the damage
 * deck, 1 at a time ... place it into your discard pile." A deck that runs
 * out between two cards of one hit deals as far as it goes, and a table with
 * nothing left deals nothing: "you take no damage during this register".
 */
export function drawDamageCards(st, p, n, source) {
  let got = 0;
  const diffuser = has(p, "diffuser"), odds = has(p, "calculatedOdds");
  for (let k = 0; k < n; k++) {
    /* Diffuser: after the first damage of a register, each further card is an Energy instead */
    if (diffuser && p.dmgReg && p.dmgReg.turn === st.turn && p.dmgReg.register === st.register) {
      if (gainEnergy(st, p, 1, "diffuser")) log(st, p.name + "'s diffuser turns the damage into Energy");
      else log(st, p.name + "'s diffuser has nowhere to put the Energy");
      continue;
    }
    let i = drawDamage(st);
    if (i === null) { log(st, "the table has no damage cards left, and " + p.name + " takes no more"); break; }
    /* Calculated Odds: two drawn, one kept -- the SPAM when they differ, declared */
    if (odds) {
      const j = drawDamage(st);
      if (j !== null) {
        const keepFirst = card(st, i).kind === "spam" || card(st, j).kind !== "spam";
        const other = keepFirst ? j : i;
        i = keepFirst ? i : j;
        st.damageDiscard.push(other);
        log(st, p.name + " draws two and keeps the " + (card(st, i).kind === "spam" ? "SPAM" : "Haywire"));
      }
    }
    if (card(st, i).kind === "haywire") receiveHaywire(st, p, i);
    else p.pile.push(i);
    p.dmgReg = { turn: st.turn, register: st.register };
    got++;
  }
  if (got) st.events.push({ type: "damaged", player: p.id, amount: got, damage: 0, source, cards: true });
  return got;
}

/** Damage cards a robot is holding where a shutdown can reach them: hand, discard and the face-down Haywires, not the deck. */
export function heldDamage(st, p) {
  let n = 0;
  for (const i of p.hand) if (isDamage(st, i)) n++;
  for (const i of p.pile) if (isDamage(st, i)) n++;
  for (const i of p.haywire || []) if (i !== null) n++;
  return n;
}
export const oilAtCourse = oilAt;
export const waterAtCourse = waterAt;

/* --- damage and destruction --------------------------------------------- */

/** Damage from anything but a laser: the absorbers get their say, then it lands. */
export function damage(st, C, p, n, source, dir) {
  if (n <= 0 || !p.alive) return;
  const ctx = fire(st, p, "onDamage", { amount: n, source: source || "laser", absorbed: 0, dir: dir === undefined ? null : dir });
  if (ctx.absorbed > 0) log(st, p.name + " absorbs " + ctx.absorbed + " damage");
  landDamage(st, C, p, ctx.amount, source);
}

/** Damage that has already been through the absorbers. Classic ticks the track; 2016 hands out cards. */
export function landDamage(st, C, p, n, source) {
  if (n <= 0 || !p.alive) return;
  if (isModern(st)) { drawDamageCards(st, p, n, source); return; }
  p.damage += n;
  st.events.push({ type: "damaged", player: p.id, amount: n, damage: p.damage, source });
  if (p.damage >= MAX_DAMAGE) destroy(st, C, p, "shot to pieces");
}

export function destroy(st, C, p, how) {
  if (!p.alive) return;
  if (isModern(st)) { reboot(st, C, p, how); return; }
  p.alive = false;
  p.virtual = false;
  p.lives--;
  for (const i of p.hand) st.discard.push(i);
  p.hand = [];
  for (let i = 0; i < REGISTERS; i++) if (p.registers[i] !== null) { st.discard.push(p.registers[i]); p.registers[i] = null; }
  /* what lay on its option cards goes back too, and nothing it was running or holding survives the wreck */
  if (Number.isInteger(p.reserve)) { st.discard.push(p.reserve); p.reserve = null; }
  if (Number.isInteger(p.flywheel)) { st.discard.push(p.flywheel); p.flywheel = null; }
  p.locks.fill(null); p.controlledBy = null; p.aborted = false;
  p.damage = 0;
  p.poweredDown = false;
  p.announceDown = false;
  /* "A destroyed robot immediately loses an option card of the player's
   * choice." Destruction happens deep inside a move, where no question can be
   * asked, so the choice is raised at the end of the register -- the robot
   * is off the board until next turn and the card cannot act meanwhile. */
  if (p.options.length) p.mustDrop = true;
  st.events.push({ type: "destroyed", player: p.id, at: [p.c, p.r], how, lives: p.lives });
  if (p.lives <= 0) { p.out = true; log(st, p.name + " is destroyed " + how + " and is out of the race"); }
  else log(st, p.name + " is destroyed " + how + " (" + p.lives + " left)");
}

/**
 * "Robots don't die from taking too much damage ... when your robot falls off
 * the board or into a pit, you must Reboot your robot" (p.19). Off the board
 * onto its mat until register 1 of the next round; the programme is cancelled
 * and every card in its remaining registers and its hand goes to its own
 * discard, SPAM included ("SPAM cards in your registers are discarded to your
 * discard pile"); then two damage cards, one at a time. Upgrades stay.
 */
export function reboot(st, C, p, how) {
  p.alive = false;
  p.rebooting = true;
  shed(st, p, "slowProcessor", "reboots");
  /* "the Reboot Token that is on the same board where your robot fell into a pit or fell off the board" */
  const last = lastOnCourse(C, p);
  p.fellFrom = last ? stampOf(C, last[0], last[1]) : -1;
  for (let i = 0; i < REGISTERS; i++) {
    if (p.registers[i] !== null) { putAway(st, p, p.registers[i], false); p.registers[i] = null; }
    if (p.crab && p.crab[i] !== null) { p.pile.push(p.crab[i]); p.crab[i] = null; }
    /* "Haywire cards in your registers are discarded to the damage discard pile" */
    if (p.haywire && p.haywire[i] !== null) { st.damageDiscard.push(p.haywire[i]); p.haywire[i] = null; }
  }
  for (const i of p.hand) p.pile.push(i);
  p.hand = [];
  p.poweredDown = false;
  p.announceDown = false;
  st.events.push({ type: "destroyed", player: p.id, at: [p.c, p.r], how, rebooting: true });
  log(st, p.name + " goes " + how + " and must reboot");
  /* two damage cards, or what the course says (Cry Havoc: "you must draw 3 damage cards instead of the normal 2") */
  const rctx = fire(st, p, "onReboot", { how, cards: C.rebootDamage === undefined ? 2 : C.rebootDamage });
  if (rctx.cards > 0) drawDamageCards(st, p, rctx.cards, "reboot");
  else log(st, p.name + " draws no damage for it");
}

/** Thrills and Spills: "End of Register -- A robot in an active flamer space takes 1 damage." */
/** The 2016 order's end-of-register point, on whatever fire the board carries. */
export function flamerPass(st, C) {
  for (const p of alive(st)) {
    const burn = fireAt(C, p.c, p.r, st.register);
    if (!burn) continue;
    log(st, p.name + " ends the register in the flames");
    damage(st, C, p, 1, burn);
  }
}

/** "If your robot ends a register on a battery space, you gain 1 Energy." Not while shut down. */
export function batteryPass(st, C) {
  for (const p of alive(st)) {
    if (p.poweredDown) continue;
    const n = energyAt(C, p.c, p.r);
    if (!n) continue;
    if (gainEnergy(st, p, n, "battery")) log(st, p.name + " charges " + n + " Energy");
  }
}

/* --- Turn & Burn: chop shops ------------------------------------------------ */

export const CHOP_CHOICES = ["Gain 1 Energy", "Draw 1 upgrade", "Scrap a permanent upgrade and install the top card free"];

/**
 * Turn & Burn's chop shop (manual1/IMG_1464): a robot that ends a register on
 * one may gain 1 Energy, draw 1 upgrade, or scrap 1 permanent upgrade to
 * install the top card of the upgrade deck at no cost -- one of the three.
 * With the batteries, at the end of the register.
 *
 * Drawn is what the Upgrade Phase's paid draw does: the card goes to the
 * robot's uninstalled upgrades, to be installed at its price. The scrapped
 * card goes to the upgrade discard. The free card is installed if a slot for
 * its type is free -- always so for a permanent, since one was just scrapped
 * -- and otherwise joins the uninstalled ones (ours, as for the waste).
 *
 * 2016 ONLY. The classic chop shop trades in Armed and Dangerous's ammunition
 * cards, none of which is built, so under the classic book it is still the
 * floor it sits on (the author's decision, 2026-09-23). Not for a robot that
 * is shut down or rebooting, as for a battery.
 */
export function chopShopPass(st, C) {
  if (!isModern(st)) return classicChopShopPass(st, C);
  for (const p of alive(st)) {
    if (p.poweredDown || p.rebooting || !chopShopAt(C, p.c, p.r)) continue;
    const key = st.turn + ":" + st.register + ":chop:" + p.id;
    if (st.answers[key + ":paid"]) continue;
    const perms = p.installed.filter(u => UPGRADE_DEFS[u.id].type === "permanent").map(u => u.id);
    const a = st.answers[key];
    if (a === undefined) {
      const options = perms.length ? [0, 1, 2] : [0, 1];
      return { player: p.id, kind: "cardChoice", key, card: "chopShop", labels: CHOP_CHOICES.slice(0, options.length), options,
        prompt: p.name + " ends the register on a chop shop. Which will it take?" };
    }
    if (a === 2) {
      const which = st.answers[key + ":scrap"];
      if (perms.length > 1 && which === undefined) {
        return { player: p.id, kind: "cardChoice", key: key + ":scrap", card: "chopShop", tag: "scrap",
          labels: perms.map(id => UPGRADE_DEFS[id].name), options: perms.map((_, i) => i),
          prompt: p.name + " scraps which permanent upgrade?" };
      }
      st.answers[key + ":paid"] = true;
      uninstallUpgrade(st, p, perms[perms.length > 1 ? which : 0], "scraps");
      const id = drawUpgrade(st);
      if (id === null) { log(st, p.name + " finds the upgrade deck empty"); continue; }
      const def = UPGRADE_DEFS[id];
      if (installedOfType(p, def.type) < INSTALL_LIMIT[def.type]) {
        p.installed.push(newInstalled(id));
        st.events.push({ type: "upgrade", player: p.id, card: id, how: "installed" });
        log(st, p.name + " installs " + def.name + " from the chop shop, free" + (def.built ? "" : " (its effect is not built)"));
      } else {
        p.shelf.push(id);
        st.events.push({ type: "upgrade", player: p.id, card: id, how: "drawn" });
        log(st, p.name + " takes " + def.name + " from the chop shop, with no slot free for it");
      }
      continue;
    }
    st.answers[key + ":paid"] = true;
    if (a === 1) {
      const id = drawUpgrade(st);
      if (id !== null) {
        p.shelf.push(id);
        st.events.push({ type: "upgrade", player: p.id, card: id, how: "drawn" });
        log(st, p.name + " draws " + UPGRADE_DEFS[id].name + " at the chop shop");
        continue;
      }
      log(st, p.name + " finds the upgrade deck empty");
      continue;
    }
    if (gainEnergy(st, p, 1, "chopShop")) log(st, p.name + " takes an Energy at the chop shop");
  }
  return null;
}

export const CLASSIC_CHOP_CHOICES = ["Leave it", "Scrap an option card and draw another", "Refill an option card's payload"];

/**
 * The classic chop shop (Ultimate RoboRally Collection p.6, a fan
 * compilation; no Grand Prix sheet is in the archive). A robot that ends a
 * register on one may scrap an option card it holds and draw a replacement,
 * or replenish the payload of one it holds -- or, holding none, draw one at
 * no cost. With the flags, at the end of the register, as that book puts it.
 *
 * Payload is a card's ammunition, charges or fuel: of the cards built,
 * Ablative Coat (3) and Turbo Blaster (5). A spent card stays on the robot,
 * empty, until something like this refills it. The choice is the robot's;
 * a robot with no card is simply given one, since that is never worse.
 * Not while powered down, and not for a wreck.
 */
function classicChopShopPass(st, C) {
  for (const p of alive(st)) {
    if (p.poweredDown || !chopShopAt(C, p.c, p.r)) continue;
    const key = st.turn + ":" + st.register + ":chop:" + p.id;
    if (st.answers[key + ":paid"]) continue;
    if (!p.options.length) {
      st.answers[key + ":paid"] = true;
      log(st, p.name + " draws an option card at the chop shop");
      drawOption(st, p);
      continue;
    }
    const low = p.options.map((o, i) => ({ o, i })).filter(({ o }) => payloadOf(o.id) > 0 && (o.st.charges | 0) < payloadOf(o.id));
    const a = st.answers[key];
    if (a === undefined) {
      const options = low.length ? [0, 1, 2] : [0, 1];
      return { player: p.id, kind: "cardChoice", key, card: "chopShop", tag: "classic", labels: CLASSIC_CHOP_CHOICES.slice(0, options.length), options,
        prompt: p.name + " ends the register on a chop shop. Scrap a card for another" + (low.length ? ", refill one's payload," : "") + " or leave it?" };
    }
    /* which card, when there is more than one to choose from */
    const list = a === 1 ? p.options.map((o, i) => ({ o, i })) : a === 2 ? low : [];
    let pick = 0;
    if (list.length > 1) {
      const which = st.answers[key + ":which"];
      if (which === undefined) {
        return { player: p.id, kind: "cardChoice", key: key + ":which", card: "chopShop", tag: a === 1 ? "scrap" : "refill",
          labels: list.map(({ o }) => OPTION_DEFS[o.id].name + (payloadOf(o.id) ? " (" + (o.st.charges | 0) + " of " + payloadOf(o.id) + ")" : "")),
          options: list.map((_, k) => k), prompt: p.name + (a === 1 ? " scraps which option card?" : " refills which option card?") };
      }
      pick = which;
    }
    st.answers[key + ":paid"] = true;
    if (a === 1) {
      dropOptionAt(st, p, list[pick].i, "scraps");
      drawOption(st, p);
    } else if (a === 2) {
      const o = list[pick].o;
      o.st.charges = payloadOf(o.id);
      st.events.push({ type: "option", player: p.id, card: o.id, how: "refilled" });
      log(st, p.name + " refills " + OPTION_DEFS[o.id].name + " at the chop shop");
    }
  }
  return null;
}

/* --- Radioactive: waste and radiation ----------------------------------------
 *
 * No publisher's rulebook for Radioactive or its 2016 reprint, Contamination,
 * is in the archive. The classic rule is the Ultimate RoboRally Collection's
 * (Justin Alexander, a fan compilation; manual1/roborally-ultimate-collection-
 * rulebook.pdf pp.4 and 6); the 2016 reading is ours, decided 2026-09-23 --
 * the classic timing, paid in the 2016 game's currency. */

export const WASTE_CHOICES = ["Gain an Energy", "Install the top upgrade card free"];

/**
 * "A robot on radioactive waste receives 1 point of damage" with the laser fire,
 * "and may draw an option card" at the checkpoints (p.6). One pass, after the
 * lasers and the fire and before the flags, so it lands where both halves do.
 *
 * Classic: the draw is taken. The book says MAY, and a free option card is never
 * worse than none -- the hand limit is trimmed at the end of the turn, as for any
 * draw -- so asking every register a robot stands in the waste would be a
 * question with one sensible answer. Ours.
 * 2016 (ours, after a review of Contamination): an Energy, or the top upgrade
 * card installed free. Asked, keyed, so the pass can re-run for the answer
 * without hurting anybody twice.
 *
 * Not while powered down or shut down: the reward is a checkpoint's, and a
 * robot that is down touches no checkpoint. The damage lands regardless -- the
 * waste is under it either way.
 */
export function wastePass(st, C) {
  for (const p of alive(st)) {
    if (!wasteAt(C, p.c, p.r)) continue;
    const key = st.turn + ":" + st.register + ":waste:" + p.id;
    if (!st.answers[key + ":hurt"]) {
      st.answers[key + ":hurt"] = true;
      log(st, p.name + " is standing in radioactive waste");
      damage(st, C, p, 1, "waste");
    }
    if (!p.alive || p.poweredDown || p.rebooting || st.answers[key + ":paid"]) continue;
    if (!isModern(st)) {
      st.answers[key + ":paid"] = true;
      drawOption(st, p);
      continue;
    }
    const a = st.answers[key];
    if (a === undefined) {
      return { player: p.id, kind: "cardChoice", key, card: "waste", labels: WASTE_CHOICES.slice(), options: [0, 1],
        prompt: p.name + " ends the register in radioactive waste. Gain an Energy, or install the top upgrade card free?" };
    }
    st.answers[key + ":paid"] = true;
    if (a === 1 && wasteUpgrade(st, p)) continue;
    if (gainEnergy(st, p, 1, "waste")) log(st, p.name + " charges an Energy from the waste");
  }
  return null;
}

/* The top upgrade card, installed at no Energy cost when a slot for its type is
 * free; otherwise it goes to the robot's shelf, to be installed later at its
 * price. Whether a full mat refuses the card or takes it anyway is not in
 * anything we have; the shelf is ours. False when the deck is empty. */
function wasteUpgrade(st, p) {
  const id = drawUpgrade(st);
  if (id === null) return false;
  const def = UPGRADE_DEFS[id];
  if (installedOfType(p, def.type) < INSTALL_LIMIT[def.type]) {
    p.installed.push(newInstalled(id));
    st.events.push({ type: "upgrade", player: p.id, card: id, how: "installed" });
    log(st, p.name + " installs " + def.name + " from the waste, free" + (def.built ? "" : " (its effect is not built)"));
  } else {
    p.shelf.push(id);
    st.events.push({ type: "upgrade", player: p.id, card: id, how: "drawn" });
    log(st, p.name + " draws " + def.name + " from the waste, with no slot free for it");
  }
  return true;
}

/**
 * "A robot on a radiation square receives 1 point of damage" at the end of the
 * turn (p.4), before any repair. The 2016 game has no end of turn; the end of
 * the round stands in for it (ours). A shut-down or powered-down robot is still
 * standing in it, and Power Down Shield does not keep it out (p.17 of the same
 * book: the shield "does not block against Radiation"), which the shield's
 * hook already honours by absorbing lasers only.
 */
export function radiationPass(st, C) {
  for (const p of alive(st)) {
    if (p.rebooting || !radiationAt(C, p.c, p.r)) continue;
    log(st, p.name + " is standing in radiation");
    damage(st, C, p, 1, "radiation");
  }
}

/** The nearest free, non-hole square to (c,r), searched outward so the answer does not depend on player order. */
export function freeSpotNear(st, C, c, r) {
  if (inGrid(C, c, r) && !holeNow(st, C, c, r) && !robotAt(st, c, r)) return [c, r];
  for (let rad = 1; rad <= 4; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const nc = c + dc, nr = r + dr;
      if (!inGrid(C, nc, nr) || holeNow(st, C, nc, nr) || robotAt(st, nc, nr)) continue;
      return [nc, nr];
    }
  }
  return null;
}

/* --- checkpoints ----------------------------------------------------------- */

/**
 * "To touch a flag, a robot must end a register phase on the same square as
 * the flag." Standing on ANY flag re-archives; only the next one in sequence
 * scores. A repair site is always an archive point. A powered-down robot
 * tags nothing and archives nothing.
 */
export function checkpointPass(st, C) {
  for (const p of alive(st)) {
    if (p.poweredDown) continue;
    let spots = [[p.c, p.r]];
    /* "crossing it counts", the Euro house rule: every square walked through
     * this register, with the square the robot stopped on last */
    if (st.house.flagTouch && p.trail.length > 1) spots = p.trail.slice(1).concat([[p.c, p.r]]);
    /* a mechanical arm reaches the neighbouring squares as well */
    const reach = fire(st, p, "onTouchCheckpoint", { reach: 0 }).reach;
    if (reach > 0) for (let d = 0; d < 4; d++) { const [nc, nr] = stepCell(p.c, p.r, d); if (inGrid(C, nc, nr)) spots.push([nc, nr]); }
    for (const [c, r] of spots) {
      if (!isModern(st) && repairAt(C, c, r)) p.archive = { c, r, face: p.face };
      const F = flagAt(C, c, r);
      if (!F) continue;
      /* the classic archive follows the flags; the 2016 Archive Token stays on the docking bay
       * when the course places Reboot Tokens, and follows the checkpoints only under the substitute */
      if (!isModern(st) || !(C.reboots && C.reboots.length)) p.archive = { c: F.c, r: F.r, face: p.face };
      if (F.n === p.flags + 1) {
        /* Bad Scanner, installed onto this robot: it does not reach this one,
         * this register, and the card comes off */
        const scanned = st.turn + ":" + st.register + ":" + F.n;
        if (p.scanned === scanned) continue;
        if (shed(st, p, "badScanner", "would reach a checkpoint, and does not")) { p.scanned = scanned; continue; }
        shed(st, p, "slowProcessor", "reaches a checkpoint");
        p.flags++;
        st.events.push({ type: "flag", player: p.id, flag: F.n, at: [F.c, F.r] });
        log(st, p.name + " touches flag " + F.n);
        if (p.flags === C.flags.length) { win(st, C, p); return; }
        if (isModern(st)) p.newCheckpoint = true;      // Self-Diagnostics asks afterwards, so a question cannot stop the pass halfway
      }
    }
  }
  /* "When your robot reaches a new Checkpoint, you may remove a card in your
   * hand or discard pile from the game." Asked here, after every robot has
   * been scored, keyed so a re-run finds the answer. */
  for (const p of alive(st)) {
    if (!p.newCheckpoint) continue;
    const cards = p.hand.map(i => ({ from: "hand", i })).concat(p.pile.map(i => ({ from: "pile", i })));
    const ctx = fire(st, p, "onCheckpoint", { cards, remove: null });
    if (ctx.pending) return ctx.ask;
    if (ctx.remove !== null && ctx.remove !== undefined && cards[ctx.remove]) {
      const pick = cards[ctx.remove];
      const list = pick.from === "hand" ? p.hand : p.pile;
      list.splice(list.indexOf(pick.i), 1);
      p.removed.push(pick.i);
      st.events.push({ type: "removed", player: p.id, card: pick.i });
      log(st, p.name + " removes a " + card(st, pick.i).kind + " from the game");
    }
    p.newCheckpoint = false;
  }
  /* Fireworks (Turn & Burn): the first time in a round a robot holding it
   * ends a register on a checkpoint or a chop shop, it may pay 1 Energy for
   * any robot to draw a damage card. The first time is the only time, paid
   * or not. */
  if (isModern(st)) {
    for (const p of alive(st)) {
      if (p.poweredDown || !has(p, "fireworks")) continue;
      if (!flagAt(C, p.c, p.r) && !chopShopAt(C, p.c, p.r)) continue;
      const key = st.turn + ":fireworks:" + p.id;
      if (st.answers[key + ":done"]) continue;
      const targets = alive(st);
      if (p.energy < 1) { st.answers[key + ":done"] = true; continue; }
      const a = st.answers[key];
      if (a === undefined) {
        return { player: p.id, kind: "cardChoice", key, card: "fireworks", targets: targets.map(t => t.id),
          labels: ["No fireworks"].concat(targets.map(t => "1 Energy: " + t.name + " draws a damage card")),
          options: [0].concat(targets.map((_, i) => i + 1)),
          prompt: p.name + " ends the register on a " + (flagAt(C, p.c, p.r) ? "checkpoint" : "chop shop") + ". Set off the fireworks?" };
      }
      st.answers[key + ":done"] = true;
      const t = a > 0 ? targets[a - 1] : null;
      if (!t || !t.alive) continue;
      p.energy -= 1;
      st.events.push({ type: "energy", player: p.id, amount: -1, energy: p.energy, why: "fireworks" });
      log(st, p.name + " sets off fireworks at " + t.name);
      damage(st, C, t, 1, "fireworks");
    }
  }
  return null;
}

export function win(st, C, p) {
  st.over = true;
  st.winner = p.id;
  st.events.push({ type: "won", player: p.id });
  log(st, p.name + " has all " + C.flags.length + " flags and wins");
}

/** A robot that arrived somewhere without stepping (Boink, a switch of places): the square it landed on still counts. */
export function arrived(st, C, p) {
  if (!p.alive) return;
  if (fallsHere(st, C, p)) { destroy(st, C, p, inGrid(C, p.c, p.r) ? "into a pit" : "over the edge"); return; }
  throughPortal(st, C, p);
}

/** All Aboard: the belts for one robot alone, blue twice then green, the normal rules applying. */
export function beltsFor(st, C, p) {
  beltPass(st, C, 2, 2, p); beltPass(st, C, 2, 2, p); beltPass(st, C, 1, 1, p);
}

bindRuleHooks({ drawOwn, putAway, stepRobot, robotAt, beltsFor, arrived, drawDamage, drawSpam });
