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
  pusherAt, crusherFires, jetFires, laserSquares, flagAt, oilAt, portalTwin
} from "./course.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { card, planOf, MAX_DAMAGE, REGISTERS } from "./cards.js";
import { alive, log } from "./state.js";
import { fire, OPTION_DEFS, discardOption } from "./options.js";

const DIR_NAMES = ["north", "east", "south", "west"];

/* The classic engine, until M4 hands the ruleset in with the state. What the
 * two editions do differently with the same printed tile is read from here
 * and nowhere else, so the modern game is a change of table, not of code. */
const RULES = rulesetFor("classic");

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
  const hurt = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    const [tc, tr] = stepCell(m.c, m.r, dir);
    const from = [m.c, m.r];
    m.c = tc; m.r = tr;
    tread(m);
    st.events.push({ type: i > 0 ? "pushed" : "moved", player: m.id, from, to: [tc, tr], dir, cause, by: i > 0 ? chain[i - 1].id : undefined });
    if (i > 0) {
      log(st, chain[i - 1].name + " shoves " + m.name + " " + DIR_NAMES[dir]);
      const pctx = fire(st, chain[i - 1], "onPush", { pushed: m, dir, pushDamage: 0 });
      if (pctx.pushDamage > 0) hurt.push({ who: m, n: pctx.pushDamage, source: "ram", why: "ramming gear" });
    }
    if (isHole(C, m.c, m.r)) { destroy(st, C, m, inGrid(C, m.c, m.r) ? "into a pit" : "over the edge"); continue; }
    throughPortal(st, C, m);
    /* a jet burns what passes through it, not only what stops in it */
    if (jetFires(C, m.c, m.r, st.register)) hurt.push({ who: m, n: 1, source: "burner", why: "the flame" });
  }
  /* damage lands after the whole chain has moved: applying it mid-loop can
   * destroy a robot the robots behind it are still being pushed into */
  for (const h of hurt) if (h.who.alive) { log(st, h.who.name + " takes " + h.n + " from " + h.why); damage(st, C, h.who, h.n, h.source); }
  /* a shoved robot that came to rest on oil skids on, where the edition says so */
  if (RULES.oilSlideAfter.indexOf("push") >= 0) {
    for (let i = 1; i < chain.length; i++) if (chain[i].alive && oilAt(C, chain[i].c, chain[i].r)) oilSlide(st, C, chain[i], dir);
  }
  return true;
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
      const occ = robotAt(st, nc, nr);
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
export function planCard(st, p, cd) {
  const plan = planOf(cd);
  plan.lateral = 0;
  return fire(st, p, "modifyMove", plan);
}

function describePlan(cd, plan) {
  const base = planOf(cd);
  const label = cd.kind.replace(/^(move1|move2|move3|back|left|right|uturn)$/, m => ({
    move1: "move 1", move2: "move 2", move3: "move 3", back: "backs up", left: "rotates left", right: "rotates right", uturn: "u-turns" })[m] || m);
  if (plan.kind !== "move") return label;
  if (plan.lateral) return label + ", sidestepping " + (plan.lateral < 0 ? "left" : "right");
  if (plan.dist === 0 && base.dist !== 0) return label + ", but brakes and holds still";
  return label;
}

/** Play one register's card for one robot, as planned. */
export function playCard(st, C, p, cd, plan) {
  plan = plan || planOf(cd);
  log(st, p.name + " " + describePlan(cd, plan));
  st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register });
  const start = [p.c, p.r];
  if (plan.kind === "turn") {
    p.face = rot(p.face, plan.turn);
    st.events.push({ type: "turned", player: p.id, turn: plan.turn, face: p.face, cause: "card" });
    stayedInFlame(st, C, p, start);
    return;
  }
  if (plan.kind !== "move") { stayedInFlame(st, C, p, start); return; }
  const dir = plan.lateral ? rot(p.face, plan.lateral) : plan.dist > 0 ? p.face : opposite(p.face);
  let n = Math.abs(plan.dist);
  if (n > 0 && oilAt(C, p.c, p.r)) n--;               // wheels spin on oil: one square less
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (!stepRobot(st, C, p, dir, "card")) break;      // a wall: the rest of the move is lost
    moved++;
  }
  /* "Erst wenn er seine Bewegung beendet (bremst), gerät er auf einer Öllache
   * ins Rutschen": once, after the card, and only if it actually travelled --
   * momentum it never had cannot carry it */
  if (moved > 0 && p.alive && oilAt(C, p.c, p.r)) oilSlide(st, C, p, dir);
  stayedInFlame(st, C, p, start);
}

/**
 * "Ein Roboter erhält auch einen Schaden, wenn er ein Feld eines aktiven
 * Brenners nicht verlässt" (p.8, with a rotate as the example). Leaving one at
 * the start of a move costs nothing; ending the card where it began, in an
 * active flame, costs one. The burner's own turn later in the register is a
 * second point, which is the two-in-one-register the book warns about.
 */
function stayedInFlame(st, C, p, start) {
  if (!p.alive || p.c !== start[0] || p.r !== start[1]) return;
  if (!jetFires(C, p.c, p.r, st.register)) return;
  log(st, p.name + " sits in the flame and takes 1");
  damage(st, C, p, 1, "burner");
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
    if (RULES.oilSlideAfter.indexOf("belt") >= 0 && oilAt(C, b.c, b.r)) oilSlide(st, C, b, m.dir);
  }
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

/** The first robot a beam meets from (c,r) heading `dir`, or null. Robot lasers skip their own square; `pierce` walls may be shot through. */
export function firstRobotAlong(st, C, c, r, dir, skipOrigin, pierce = 0) {
  if (!skipOrigin) { const h = robotAt(st, c, r); if (h) return h; }
  for (let guard = 0; guard < C.w + C.h + 2; guard++) {
    if (wallBlocks(C, c, r, dir, st.register)) { if (pierce <= 0) return null; pierce--; }
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
    /* the main laser is marked as such: a main-laser mod applies to it and
     * not to an additional weapon like the rear laser */
    const ctx = fire(st, p, "laserShots", { shots: [{ main: true, dir: p.face, damage: 1, pierce: 0 }] });
    for (const sh of ctx.shots) {
      if (sh.damage <= 0) continue;
      const v = firstRobotAlong(st, C, p.c, p.r, sh.dir, true, sh.pierce || 0);
      if (v) hits.push({ target: v, damage: sh.damage, from: p.name + "'s laser", shooter: p, dir: sh.dir, at: [p.c, p.r], main: sh.main });
    }
  }
  return hits;
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
    const hits = computeLaserHits(st, C);
    for (const h of hits) {
      if (!h.shooter || !h.main) continue;
      const hctx = fire(st, h.shooter, "onLaserHit", { targetName: h.target.name, target: h.target, damage: h.damage, shotDir: h.dir, replaceWith: null });
      if (hctx.pending) return hctx.ask;
      h.damage = hctx.damage; h.replaceWith = hctx.replaceWith;
    }
    for (const h of hits) {
      if (h.replaceWith || h.damage <= 0 || !h.target.alive) continue;
      const ctx = fire(st, h.target, "onDamage", { amount: h.damage, source: "laser", absorbed: 0 });
      if (ctx.absorbed > 0) log(st, h.target.name + " absorbs " + ctx.absorbed + " damage");
      h.damage = ctx.amount;
    }
    st.laser = hits.map(h => ({ target: h.target.id, shooter: h.shooter ? h.shooter.id : null, damage: h.damage, dir: h.dir, at: h.at, from: h.from, replaceWith: h.replaceWith }));
  }
  const hits = st.laser.map(h => ({ ...h, target: st.players[h.target], shooter: h.shooter === null ? null : st.players[h.shooter] }));

  /* "A robot with option cards may choose to sacrifice an option card to avoid
   * receiving a point of damage. Any number may be discarded, but the player
   * must decide at the time the damage is received." One question per point,
   * per target, keyed so a re-run finds every answer already given; the cards
   * go and the hits shrink BEFORE anything is applied, so a sacrifice can keep
   * a robot off its tenth point. */
  const incoming = new Map();
  for (const h of hits) if (h.damage > 0 && !h.replaceWith && h.target.alive) incoming.set(h.target.id, (incoming.get(h.target.id) || 0) + h.damage);
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

  for (const h of hits) {
    if (!h.target.alive) continue;
    if (h.replaceWith) {
      st.events.push({ type: "shot", from: h.at, dir: h.dir, target: h.target.id, shooter: h.shooter.id, damage: 0, effect: h.replaceWith.kind });
      if (h.replaceWith.kind === "push") { log(st, h.target.name + " is shoved by a beam"); stepRobot(st, C, h.target, h.replaceWith.dir, "beam"); }
      else if (h.replaceWith.kind === "scramble") scrambleRegister(st, h.target);
      continue;
    }
    if (h.damage <= 0) continue;
    st.events.push({ type: "shot", from: h.at, dir: h.dir, target: h.target.id, shooter: h.shooter ? h.shooter.id : null, damage: h.damage });
    log(st, h.target.name + " takes " + h.damage + " from " + h.from);
    landDamage(st, C, h.target, h.damage, "laser");
  }
  st.laser = null;
  return null;
}

/** Scrambler: the target's next register is replaced with the top card of the deck. */
export function scrambleRegister(st, p) {
  const next = st.register + 1;
  if (next >= REGISTERS) return;
  if (!st.deck.length) st.deck = st.discard.splice(0);          // never leave a register empty
  if (!st.deck.length) return;
  const drawn = st.deck.pop();
  if (p.registers[next] !== null) st.discard.push(p.registers[next]);
  p.registers[next] = drawn;
  st.events.push({ type: "scrambled", player: p.id, register: next });
  log(st, p.name + "'s register " + (next + 1) + " is scrambled");
}

/* --- damage and destruction --------------------------------------------- */

/** Damage from anything but a laser: the absorbers get their say, then it lands. */
export function damage(st, C, p, n, source) {
  if (n <= 0 || !p.alive) return;
  const ctx = fire(st, p, "onDamage", { amount: n, source: source || "laser", absorbed: 0 });
  if (ctx.absorbed > 0) log(st, p.name + " absorbs " + ctx.absorbed + " damage");
  landDamage(st, C, p, ctx.amount, source);
}

/** Damage that has already been through the absorbers. */
export function landDamage(st, C, p, n, source) {
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
  /* "A destroyed robot immediately loses an option card of the player's
   * choice." Destruction happens deep inside a move, where no question can be
   * asked, so the choice is raised at the end of the register -- the robot
   * is off the board until next turn and the card cannot act meanwhile. */
  if (p.options.length) p.mustDrop = true;
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
    /* a mechanical arm reaches the neighbouring squares as well */
    const reach = fire(st, p, "onTouchCheckpoint", { reach: 0 }).reach;
    if (reach > 0) for (let d = 0; d < 4; d++) { const [nc, nr] = stepCell(p.c, p.r, d); if (inGrid(C, nc, nr)) spots.push([nc, nr]); }
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
