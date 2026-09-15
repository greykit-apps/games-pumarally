/* A bot is a function from a request to an answer. So is a random policy,
 * which is what drives "human" seats in the simulations -- the same door a
 * person's clicks go through, so the human path is exercised by every sim.
 *
 * Bots consume no shared randomness: a seeded replay must not drift because
 * a bot evaluated a different number of candidates. Their variety comes from
 * hashing the position.
 */
import { step as stepCell, rot, opposite } from "../../editor/lib/dir.js";
import { courseOf, isHole, inGrid, beltAt, beltExit, beltTurnFor, gearAt, pusherAt, wallBlocks, oilAt, portalTwin } from "./course.js";
import { card, planOf, isDamage, isModern, UPGRADE_DRAW_COST } from "./cards.js";
import { hash32 } from "./rng.js";
import { botTrimPick, botCardPick, OPTION_DEFS } from "./options.js";
import { UPGRADE_DEFS, canInstall } from "./upgrades.js";
import { heldDamage } from "./rules.js";

/* --- distance fields ----------------------------------------------------------
 * For each flag, a breadth-first distance over the course under a movement
 * model that knows walls, pits and the void. Cached per course and flag, and
 * never on the state: a derived index in the save is how saves go stale. */
const fields = new Map();

export function distField(C, flagIdx) {
  const key = C.key + ":" + flagIdx;
  let d = fields.get(key);
  if (d) return d;
  const n = C.w * C.h;
  d = new Int16Array(n).fill(32000);
  const F = C.flags[flagIdx];
  if (F) {
    const queue = [F.r * C.w + F.c];
    d[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head], c = at % C.w, r = (at - c) / C.w;
      for (let dir = 0; dir < 4; dir++) {
        /* walking backwards from the flag: walls are symmetric, so a step in
         * from the neighbour is legal exactly when a step out to it is */
        if (wallBlocks(C, c, r, dir, 0)) continue;
        const [nc, nr] = stepCell(c, r, dir);
        if (!inGrid(C, nc, nr) || isHole(C, nc, nr)) continue;
        const ni = nr * C.w + nc;
        if (d[ni] <= d[at] + 1) continue;
        d[ni] = d[at] + 1;
        queue.push(ni);
      }
    }
  }
  fields.set(key, d);
  return d;
}

/* --- the ghost: one robot run through the floor with the others frozen ------ */

function railed(st, C, c, r, d) {
  if (!st.house.bumpers) return false;
  const [nc, nr] = stepCell(c, r, d);
  return !inGrid(C, nc, nr);
}

function ghostMove(st, C, g, dir) {
  if (g.dead) return;
  if (wallBlocks(C, g.c, g.r, dir, g.reg) || railed(st, C, g.c, g.r, dir)) return;
  const [nc, nr] = stepCell(g.c, g.r, dir);
  g.c = nc; g.r = nr;
  if (!inGrid(C, nc, nr) || isHole(C, nc, nr)) { g.dead = true; return; }
  /* the ghost ignores other robots, so a portal always fires for it */
  const twin = portalTwin(C, nc, nr);
  if (twin) { g.c = twin[0]; g.r = twin[1]; }
}

/* the ghost skids the way the rules do, minus the robots it does not model */
function ghostSlide(st, C, g, dir) {
  for (let guard = 0; guard < 64 && !g.dead && oilAt(C, g.c, g.r); guard++) {
    if (wallBlocks(C, g.c, g.r, dir, g.reg) || railed(st, C, g.c, g.r, dir)) return;
    ghostMove(st, C, g, dir);
  }
}

function ghostCard(st, C, g, cd) {
  const plan = planOf(cd);
  if (plan.kind === "turn") { g.face = rot(g.face, plan.turn); return; }
  if (plan.kind === "energy") { g.energy = (g.energy || 0) + 1; return; }
  /* Again repeats the card before it; SPAM is a blind draw, which the ghost
   * plays as standing still (its average over the deck is close to that) */
  if (plan.kind === "again") { if (g.last) ghostCard(st, C, g, g.last); return; }
  if (plan.kind !== "move") return;
  const dir = plan.dist > 0 ? g.face : opposite(g.face);
  let n = Math.abs(plan.dist);
  if (n > 0 && oilAt(C, g.c, g.r)) n--;
  let moved = 0;
  for (let i = 0; i < n && !g.dead; i++) { ghostMove(st, C, g, dir); moved++; }
  if (moved > 0 && !g.dead && oilAt(C, g.c, g.r)) ghostSlide(st, C, g, dir);
}

function ghostBelt(st, C, g, lo, hi) {
  if (g.dead) return;
  const sp = beltAt(C, g.c, g.r);
  if (!sp || sp < lo || sp > hi) return;
  const d = beltExit(C, g.c, g.r);
  if (wallBlocks(C, g.c, g.r, d, g.reg) || railed(st, C, g.c, g.r, d)) return;
  const [nc, nr] = stepCell(g.c, g.r, d);
  g.c = nc; g.r = nr;
  if (!inGrid(C, nc, nr) || isHole(C, nc, nr)) { g.dead = true; return; }
  if (beltAt(C, nc, nr)) {
    const t = beltTurnFor(C, nc, nr, d);
    if (t === 1 || t === -1) g.face = rot(g.face, t);
  }
}

function ghostBoard(st, C, g) {
  if (isModern(st)) { ghostBelt(st, C, g, 2, 2); ghostBelt(st, C, g, 2, 2); ghostBelt(st, C, g, 1, 1); }
  else { ghostBelt(st, C, g, 2, 2); ghostBelt(st, C, g, 1, 2); }
  if (g.dead) return;
  const pu = pusherAt(C, g.c, g.r, g.reg);
  if (pu) ghostMove(st, C, g, pu.dir);
  if (g.dead) return;
  const t = gearAt(C, g.c, g.r);
  if (t) g.face = rot(g.face, t);
}

/* flags touched along the way count, so a program that clips flag N on
 * register 2 and ends elsewhere still scores */
function ghostTouch(C, g) {
  for (const F of C.flags) if (F.c === g.c && F.r === g.r && F.n === g.flags + 1) g.flags++;
}

const W_FLAG = 400, W_DIST = 12, W_DEATH = 260, W_FACE = 6, W_PIT = 9, W_ENERGY = 5, W_SPAM = 4;

function scoreGhost(C, g, startFlags) {
  if (g.dead) return -W_DEATH * 4;
  const idx = g.flags >= C.flags.length ? -1 : g.flags;
  let s = W_FLAG * (g.flags - startFlags) + W_ENERGY * (g.energy || 0) + W_SPAM * (g.spam || 0);
  if (idx >= 0) {
    const d = distField(C, idx)[g.r * C.w + g.c];
    s -= W_DIST * Math.min(d, 200);
    const [ac, ar] = stepCell(g.c, g.r, g.face);
    if (inGrid(C, ac, ar) && !isHole(C, ac, ar) && distField(C, idx)[ar * C.w + ac] < d) s += W_FACE;
  } else s += W_FLAG;
  for (let dir = 0; dir < 4; dir++) {
    const [nc, nr] = stepCell(g.c, g.r, dir);
    if (!inGrid(C, nc, nr) || isHole(C, nc, nr)) s -= W_PIT;
  }
  return s;
}

/** Beam search over the hand, register by register. Returns hand indices. */
export function botProgram(st, C, p, count) {
  const skill = p.skill === undefined ? 1 : p.skill;
  const width = skill <= 0 ? 3 : skill === 1 ? 10 : 24;
  /* a rebooting robot programs from off the board: it will land at its archive first */
  const at = p.alive || !p.archive ? { c: p.c, r: p.r, face: p.face } : { c: p.archive.c, r: p.archive.r, face: bestFacing(st, C, p) };
  let beam = [{ picks: [], used: 0, g: { c: at.c, r: at.r, face: at.face, dead: false, flags: p.flags, reg: 0, energy: 0, spam: 0, last: null } }];
  for (let reg = 0; reg < count && p.hand.length; reg++) {
    const next = [];
    for (const node of beam) {
      for (let h = 0; h < p.hand.length; h++) {
        if (node.used & (1 << h)) continue;
        const g = { ...node.g, reg };
        const cd = card(st, p.hand[h]);
        /* programming a SPAM is how you get rid of one: a small credit, and
         * the ghost stands still for the blind draw */
        if (isDamage(st, p.hand[h])) g.spam++; else { ghostCard(st, C, g, cd); if (cd.kind !== "again") g.last = cd; }
        ghostBoard(st, C, g);
        if (!g.dead) ghostTouch(C, g);
        next.push({ picks: node.picks.concat([h]), used: node.used | (1 << h), g, score: scoreGhost(C, g, p.flags) });
      }
    }
    if (!next.length) break;
    next.forEach((n, i) => {
      const noise = hash32(st.turn * 131 + p.id * 17 + reg * 7919 + i) / 4294967296 - 0.5;
      n.score += noise * (skill >= 2 ? 2 : 14);
    });
    next.sort((x, y) => y.score - x.score);
    beam = next.slice(0, width);
  }
  return beam.length ? beam[0].picks : [];
}

/** The bay nearest the first flag, ties broken on the printed number. */
export function botBay(C, free) {
  const d = distField(C, 0);
  let best = free[0], bestV = Infinity;
  for (const n of free) {
    const dock = C.docks.find(x => x.n === n);
    const v = d[dock.r * C.w + dock.c];
    if (v < bestV || (v === bestV && n < best)) { bestV = v; best = n; }
  }
  return best;
}

export function botWantsPowerDown(p) {
  if (p.skill <= 0) return false;
  return p.damage >= (p.skill >= 2 ? 6 : 8);
}

/** 2016: shut down for the damage a shutdown can reach (hand and discard), never the deck; the lowest tier never does. */
export function botWantsShutdown(st, p) {
  if (p.skill <= 0) return false;
  return heldDamage(st, p) >= 6;
}

/** The facing whose neighbour is nearest the flag the robot is going for. */
export function bestFacing(st, C, p) {
  const idx = p.flags >= C.flags.length ? C.flags.length - 1 : p.flags;
  if (idx < 0) return 0;
  const d = distField(C, idx);
  const at = p.alive ? [p.c, p.r] : [p.archive.c, p.archive.r];
  let best = 0, bestV = Infinity;
  for (let dir = 0; dir < 4; dir++) {
    const [nc, nr] = stepCell(at[0], at[1], dir);
    if (!inGrid(C, nc, nr) || isHole(C, nc, nr) || wallBlocks(C, at[0], at[1], dir, 0)) continue;
    const v = d[nr * C.w + nc];
    if (v < bestV) { bestV = v; best = dir; }
  }
  return best;
}

/**
 * Temporary upgrades: the ones with an obvious moment. Recharge at once,
 * Re-initialize only to take the token, Calibration when holding SPAM,
 * Overclocked before the card when the two squares ahead are floor. The
 * rest wait for a person.
 */
export function botTemp(st, C, p, req) {
  const opts = req.options.filter(o => o !== null);
  const by = id => opts.filter(o => o.id === id);
  if (by("recharge").length) return by("recharge")[0];
  const re = by("reInitialize").find(o => o.seat === p.id);
  if (re && st.priority !== p.id) return re;
  if (by("calibrationProtocol").length && p.hand.filter(i => isDamage(st, i)).length >= 2) return by("calibrationProtocol")[0];
  if (req.moment === "before" && by("overclocked").length) {
    let ok = true, c = p.c, r = p.r;
    for (let k = 0; k < 2 && ok; k++) {
      if (wallBlocks(C, c, r, p.face, st.register)) { ok = false; break; }
      [c, r] = stepCell(c, r, p.face);
      if (!inGrid(C, c, r) || isHole(C, c, r)) ok = false;
    }
    const idx = p.flags >= C.flags.length ? -1 : p.flags;
    if (ok && idx >= 0 && distField(C, idx)[r * C.w + c] < distField(C, idx)[p.r * C.w + p.c]) return by("overclocked")[0];
  }
  return null;
}

/** Which cards go back: Memory Swap puts the last of the hand back; Memory Cards parks nothing. */
export function botStack(st, p, req) {
  if (req.count === null || req.count === undefined) return [];
  return req.options.slice(-req.count);
}

/**
 * The shop: fit what it owns before buying more, cheapest built card first,
 * keeping a cube back for the deflector shield; buy a card only with Energy
 * to spare. The lowest tier fits what it has and never buys.
 */
export function botUpgrade(st, p, req) {
  const o = req.options;
  const fit = o.install.filter(id => id !== null && canInstall(p, id) && p.energy - UPGRADE_DEFS[id].cost >= 1)
    .sort((a, b) => (UPGRADE_DEFS[b].built ? 1 : 0) - (UPGRADE_DEFS[a].built ? 1 : 0) || UPGRADE_DEFS[a].cost - UPGRADE_DEFS[b].cost);
  if (fit.length) return { buy: false, install: fit[0], uninstall: [] };
  if (p.skill >= 1 && o.buy.includes(true) && p.energy >= UPGRADE_DRAW_COST + 2) return { buy: true, install: null, uninstall: [] };
  return { buy: false, install: null, uninstall: [] };
}

/** The bot policy: a request in, an answer out. */
export function botAnswer(st, library, req) {
  const p = st.players[req.player];
  const C = courseOf(st, library);
  switch (req.kind) {
    case "livery": return req.options.includes(p.livery) ? p.livery : req.options[0];
    case "bay": return botBay(C, req.options);
    case "program": return botProgram(st, C, p, req.count);
    case "powerDown": return botWantsPowerDown(p);
    case "stayDown": return botWantsPowerDown(p);
    case "cardChoice": {
      /* Self-Diagnostics: tear out a SPAM if one is on offer, else keep them all */
      if (req.card === "selfDiagnostics") { const i = req.labels.findIndex(l => /^SPAM/.test(l)); return i > 0 ? req.options[i] : 0; }
      if (!req.exchange) return botCardPick(req);
      /* a card is worth a point only when the point would be the tenth */
      if (p.damage + (req.incoming || 1) < 10) return 0;
      const keep = i => OPTION_DEFS[p.options[i].id].hooks.onRespawn;
      const give = req.options.slice(1).find(o => !keep(o - 1));
      return give === undefined ? req.options[req.options.length - 1] : give;
    }
    case "siteChoice": return p.damage >= 2 ? "repair" : "card";
    case "dropOption": return botTrimPick(p);
    case "upgrade": return botUpgrade(st, p, req);
    case "shutdown": return botWantsShutdown(st, p);
    case "rebootFacing": return bestFacing(st, C, p);
    case "useTemp": return botTemp(st, C, p, req);
    case "stack": return botStack(st, p, req);
    default: throw new Error("no bot answer for request kind " + req.kind);
  }
}

/** A random legal answer, from a hash of the position so replays hold. Drives "human" seats in sims. */
export function randomAnswer(st, library, req, salt = 0) {
  const p = st.players[req.player];
  const n = hash32(st.turn * 977 + st.register * 31 + p.id * 7 + (req.kind.length * 131) + salt);
  switch (req.kind) {
    case "program": {
      const idx = req.options.slice();
      for (let i = idx.length - 1; i > 0; i--) { const j = hash32(n + i) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      return idx.slice(0, req.count);
    }
    case "powerDown": case "stayDown": case "shutdown": return (n % 7) === 0;
    case "useTemp": return req.options[n % req.options.length];
    case "stack": {
      const idx = req.options.slice();
      for (let i = idx.length - 1; i > 0; i--) { const j = hash32(n + i) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const k = req.count === null || req.count === undefined ? n % (idx.length + 1) : req.count;
      return idx.slice(0, k);
    }
    case "upgrade": {
      const o = req.options;
      const buy = o.buy[n % o.buy.length];
      const install = o.install[hash32(n + 1) % o.install.length];
      const uninstall = o.uninstall.filter((_, i) => hash32(n + 2 + i) % 5 === 0);
      return { buy, install, uninstall };
    }
    default: return req.options[n % req.options.length];
  }
}
