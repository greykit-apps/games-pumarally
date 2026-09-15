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
  pusherAt, crusherFires, jetFires, laserSquares, flagAt, oilAt
} from "./course.js";
import { card, planOf, MAX_DAMAGE, REGISTERS } from "./cards.js";
import { alive, log } from "./state.js";

const DIR_NAMES = ["north", "east", "south", "west"];

export function robotAt(st, c, r) {
  for (const p of st.players) if (p.alive && p.c === c && p.r === r) return p;
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
  return wallBlocks(C, c, r, d, st.register) || railed(st, C, c, r, d);
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
export function stepRobot(st, C, p, dir, cause) {
  const chain = [p];
  let c = p.c, r = p.r;
  for (let guard = 0; guard < 10; guard++) {
    if (blockedMove(st, C, c, r, dir)) return false;
    const [nc, nr] = stepCell(c, r, dir);
    if (!inGrid(C, nc, nr)) break;                    // the head walks off the edge
    const occ = robotAt(st, nc, nr);
    if (!occ) break;
    chain.push(occ); c = nc; r = nr;
  }
  /* far end first, so nobody is ever asked to land on an occupied square */
  const burned = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    const [tc, tr] = stepCell(m.c, m.r, dir);
    const from = [m.c, m.r];
    m.c = tc; m.r = tr;
    tread(m);
    st.events.push({ type: i > 0 ? "pushed" : "moved", player: m.id, from, to: [tc, tr], dir, cause, by: i > 0 ? chain[i - 1].id : undefined });
    if (i > 0) log(st, chain[i - 1].name + " shoves " + m.name + " " + DIR_NAMES[dir]);
    if (isHole(C, m.c, m.r)) destroy(st, C, m, inGrid(C, m.c, m.r) ? "into a pit" : "over the edge");
    /* a jet burns what passes through it, not only what stops in it */
    else if (jetFires(C, m.c, m.r, st.register)) burned.push(m);
  }
  for (const m of burned) if (m.alive) { log(st, m.name + " takes 1 from the flame"); damage(st, C, m, 1, "burner"); }
  return true;
}

/** Play one register's card for one robot. */
export function playCard(st, C, p, cd) {
  const plan = planOf(cd);
  log(st, p.name + " " + cd.kind.replace(/^(move|back|left|right|uturn)$/, m => ({ back: "backs up", left: "rotates left", right: "rotates right", uturn: "u-turns" })[m] || m) + (plan.kind === "move" && plan.dist > 0 ? " " + plan.dist : ""));
  st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register });
  if (plan.kind === "turn") {
    p.face = rot(p.face, plan.turn);
    st.events.push({ type: "turned", player: p.id, turn: plan.turn, face: p.face, cause: "card" });
    return;
  }
  if (plan.kind !== "move") return;
  const dir = plan.dist > 0 ? p.face : opposite(p.face);
  let n = Math.abs(plan.dist);
  if (n > 0 && oilAt(C, p.c, p.r)) n--;               // wheels spin on oil: one square less
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (!stepRobot(st, C, p, dir, "card")) break;      // a wall: the rest of the move is lost
  }
}

/* --- the floor --------------------------------------------------------------- */

/**
 * Conveyors move simultaneously with a vacancy test: two robots converging on
 * one square move neither; a robot on a belt does not push one standing off
 * it. `lo..hi` is the speed range that moves this pass: express alone (2,2),
 * then everything (1,2).
 */
export function beltPass(st, C, lo, hi) {
  const movers = new Map();
  for (const p of alive(st)) {
    const sp = beltAt(C, p.c, p.r);
    if (!sp || sp < lo || sp > hi) continue;
    const d = beltExit(C, p.c, p.r);
    if (blockedMove(st, C, p.c, p.r, d)) continue;
    const [tc, tr] = stepCell(p.c, p.r, d);
    movers.set(p.id, { dir: d, to: [tc, tr] });
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, m] of movers) {
      const occ = robotAt(st, m.to[0], m.to[1]);
      if (occ && occ.id !== id && !movers.has(occ.id)) { movers.delete(id); changed = true; break; }
      for (const [id2, m2] of movers) {
        if (id2 === id) continue;
        if (m2.to[0] === m.to[0] && m2.to[1] === m.to[1]) { movers.delete(id); movers.delete(id2); changed = true; break; }
      }
      if (changed) break;
    }
  }
  for (const [id, m] of movers) {
    const b = st.players[id];
    const from = [b.c, b.r];
    b.c = m.to[0]; b.r = m.to[1];
    tread(b);
    st.events.push({ type: "conveyed", player: b.id, from, to: m.to, dir: m.dir });
    if (isHole(C, b.c, b.r)) { destroy(st, C, b, inGrid(C, b.c, b.r) ? "into a pit" : "over the edge"); continue; }
    /* rotate ONLY because a belt carried the robot onto a curve, and only
     * where the board prints an arm on the side it came in by */
    if (beltAt(C, b.c, b.r)) {
      const t = beltTurnFor(C, b.c, b.r, m.dir);
      if (t === 1 || t === -1) {
        b.face = rot(b.face, t);
        st.events.push({ type: "turned", player: b.id, turn: t, face: b.face, cause: "belt" });
        log(st, b.name + " is carried round a curve");
      }
    }
  }
}

export function gearPass(st, C) {
  for (const p of alive(st)) {
    const t = gearAt(C, p.c, p.r);
    if (!t) continue;
    p.face = rot(p.face, t);
    st.events.push({ type: "turned", player: p.id, turn: t, face: p.face, cause: "gear" });
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

export function crusherPass(st, C) {
  for (const p of alive(st)) {
    if (!crusherFires(C, p.c, p.r, st.register)) continue;
    log(st, p.name + " is crushed by a press");
    destroy(st, C, p, "under a press");
  }
}

export function jetPass(st, C) {
  for (const p of alive(st)) {
    if (!jetFires(C, p.c, p.r, st.register)) continue;
    log(st, p.name + " is scorched by a burner");
    damage(st, C, p, 1, "burner");
  }
}

/** The first robot a beam meets from (c,r) heading `dir`, or null. Robot lasers skip their own square. */
export function firstRobotAlong(st, C, c, r, dir, skipOrigin) {
  if (!skipOrigin) { const h = robotAt(st, c, r); if (h) return h; }
  for (let guard = 0; guard < C.w + C.h + 2; guard++) {
    if (wallBlocks(C, c, r, dir, st.register)) return null;
    const [nc, nr] = stepCell(c, r, dir);
    if (!inGrid(C, nc, nr)) return null;
    c = nc; r = nr;
    const h = robotAt(st, c, r);
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
export function computeLaserHits(st, C) {
  const hits = [];
  for (const L of C.lasers) {
    const path = laserSquares(C, L, st.register);
    let target = null;
    for (const [c, r] of path) { target = robotAt(st, c, r); if (target) break; }
    if (target) hits.push({ target, damage: L.damage, from: "a board laser", shooter: null, dir: L.dir, at: [L.c, L.r] });
  }
  for (const p of alive(st)) {
    if (p.poweredDown) continue;                       // a powered-down robot does not shoot
    const v = firstRobotAlong(st, C, p.c, p.r, p.face, true);
    if (v) hits.push({ target: v, damage: 1, from: p.name + "'s laser", shooter: p, dir: p.face, at: [p.c, p.r] });
  }
  return hits;
}

export function laserPass(st, C) {
  const hits = computeLaserHits(st, C);
  for (const h of hits) {
    if (!h.target.alive) continue;
    st.events.push({ type: "shot", from: h.at, dir: h.dir, target: h.target.id, shooter: h.shooter ? h.shooter.id : null, damage: h.damage });
    log(st, h.target.name + " takes " + h.damage + " from " + h.from);
    damage(st, C, h.target, h.damage, "laser");
  }
}

/* --- damage and destruction --------------------------------------------- */

export function damage(st, C, p, n, source) {
  if (n <= 0 || !p.alive) return;
  p.damage += n;
  st.events.push({ type: "damaged", player: p.id, amount: n, damage: p.damage, source });
  if (p.damage >= MAX_DAMAGE) destroy(st, C, p, "shot to pieces");
}

export function destroy(st, C, p, how) {
  if (!p.alive) return;
  p.alive = false;
  p.lives--;
  for (const i of p.hand) st.discard.push(i);
  p.hand = [];
  for (let i = 0; i < REGISTERS; i++) if (p.registers[i] !== null) { st.discard.push(p.registers[i]); p.registers[i] = null; }
  p.damage = 0;
  p.poweredDown = false;
  p.announceDown = false;
  st.events.push({ type: "destroyed", player: p.id, at: [p.c, p.r], how, lives: p.lives });
  if (p.lives <= 0) { p.out = true; log(st, p.name + " is destroyed " + how + " and is out of the race"); }
  else log(st, p.name + " is destroyed " + how + " (" + p.lives + " left)");
}

/** The nearest free, non-hole square to (c,r), searched outward so the answer does not depend on player order. */
export function freeSpotNear(st, C, c, r) {
  if (inGrid(C, c, r) && !isHole(C, c, r) && !robotAt(st, c, r)) return [c, r];
  for (let rad = 1; rad <= 4; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const nc = c + dc, nr = r + dr;
      if (!inGrid(C, nc, nr) || isHole(C, nc, nr) || robotAt(st, nc, nr)) continue;
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
    for (const [c, r] of spots) {
      if (repairAt(C, c, r)) p.archive = { c, r, face: p.face };
      const F = flagAt(C, c, r);
      if (!F) continue;
      p.archive = { c: F.c, r: F.r, face: p.face };
      if (F.n === p.flags + 1) {
        p.flags++;
        st.events.push({ type: "flag", player: p.id, flag: F.n, at: [F.c, F.r] });
        log(st, p.name + " touches flag " + F.n);
        if (p.flags === C.flags.length) { win(st, C, p); return; }
      }
    }
  }
}

export function win(st, C, p) {
  st.over = true;
  st.winner = p.id;
  st.events.push({ type: "won", player: p.id });
  log(st, p.name + " has all " + C.flags.length + " flags and wins");
}
