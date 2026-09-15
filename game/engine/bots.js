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
import { card, planOf } from "./cards.js";
import { hash32 } from "./rng.js";
import { botTrimPick, botCardPick, OPTION_DEFS } from "./options.js";

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
  ghostBelt(st, C, g, 2, 2);
  ghostBelt(st, C, g, 1, 2);
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

const W_FLAG = 400, W_DIST = 12, W_DEATH = 260, W_FACE = 6, W_PIT = 9;

function scoreGhost(C, g, startFlags) {
  if (g.dead) return -W_DEATH * 4;
  const idx = g.flags >= C.flags.length ? -1 : g.flags;
  let s = W_FLAG * (g.flags - startFlags);
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
  let beam = [{ picks: [], used: 0, g: { c: p.c, r: p.r, face: p.face, dead: false, flags: p.flags, reg: 0 } }];
  for (let reg = 0; reg < count && p.hand.length; reg++) {
    const next = [];
    for (const node of beam) {
      for (let h = 0; h < p.hand.length; h++) {
        if (node.used & (1 << h)) continue;
        const g = { ...node.g, reg };
        ghostCard(st, C, g, card(st, p.hand[h]));
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
      if (!req.exchange) return botCardPick(req);
      /* a card is worth a point only when the point would be the tenth */
      if (p.damage + (req.incoming || 1) < 10) return 0;
      const keep = i => OPTION_DEFS[p.options[i].id].hooks.onRespawn;
      const give = req.options.slice(1).find(o => !keep(o - 1));
      return give === undefined ? req.options[req.options.length - 1] : give;
    }
    case "siteChoice": return p.damage >= 2 ? "repair" : "card";
    case "dropOption": return botTrimPick(p);
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
    case "powerDown": case "stayDown": return (n % 7) === 0;
    default: return req.options[n % req.options.length];
  }
}
