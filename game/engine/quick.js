/* A quick game: one board, turned to a random facing, three flags drawn at
 * random from the squares it marks as flag locations -- or several boards,
 * laid as the box stacks them, with a route of flags through them (below).
 *
 * There is no course file for it. The board says where a flag MAY go
 * (editor/rulesets/sites.js), and this makes the course a race actually
 * uses out of that: the document it returns is an ordinary PRCourse, laid
 * over the docking bay, so the save carries it and a resumed game plays
 * the same layout. Every shipped board with three marked locations is a
 * quick game under whichever rulesets read its squares.
 */
import { stampDims, usableFlagSpots } from "../../editor/lib/course.js";
import { docksOf, hasLevels, hasRamps } from "../../editor/lib/board.js";

export const QUICK_FLAGS = 3;
export const DOCK_BOARD = "dockingBay";
export const FACINGS = ["as printed", "a quarter turn clockwise", "upside down", "a quarter turn anticlockwise"];

/** The board over the docking bay, at a facing, with no flags yet. */
function layout(board, rot, dock) {
  const [w, h] = stampDims(board, rot);
  /* the narrower of the two sits centred on the wider; a stamp cannot start
   * left of zero, so it is the wider one that stands at zero */
  const bx = Math.max(0, Math.floor((dock.w - w) / 2)), dx = Math.max(0, Math.floor((w - dock.w) / 2));
  return {
    format: "PRCourse", version: 1,
    id: "quick_" + board.id, name: board.name, kind: "quick",
    blurb: "A quick game on " + board.name + ", laid " + FACINGS[rot] + ", with " + QUICK_FLAGS + " flags drawn from where it marks.",
    stamps: [
      { role: "board", board: board.id, rot, at: [bx, 0] },
      { role: "dock", board: dock.id, rot: 0, at: [dx, h] }
    ],
    flags: [],
    minPlayers: 1, maxPlayers: 8
  };
}

/** The flag locations a quick game on this board could draw from, at its printed facing. */
export function quickSpots(board, library) {
  const dock = library.get(DOCK_BOARD);
  if (!dock || board.id === dock.id || docksOf(board).length) return [];
  return usableFlagSpots(layout(board, 0, dock), library);
}

/** Does the board make a quick game: not a docking bay, and enough marked locations for the flags? */
export function canQuick(board, library) {
  return quickSpots(board, library).length >= QUICK_FLAGS;
}

/**
 * A blank board: open floor and nothing else -- no walls, no devices, no
 * levels or ramps. Markings do not count, since a template board prints
 * flag locations and a wrench or two precisely so that a course can be
 * built on it. Master Builder's Blueprint and Tabula Rasa are the two
 * shipped, and they are for building courses with, not for racing on bare:
 * the setup screen leaves them off the quick-game shelf and out of the
 * draw (issue #11), and the sim skips them for the same reason. That is
 * the OFFER's rule, not the engine's -- a bare floor with three marks is a
 * quick game to quickCourse, and the tests build their fixtures that way.
 */
export function isBlank(board) {
  if (board.cells.some(t => t !== "...")) return false;
  if (board.wallH.some(x => x) || board.wallV.some(x => x)) return false;
  if (board.wallDevices.length || board.ceilingDevices.length) return false;
  if (hasLevels(board) || hasRamps(board)) return false;
  return true;
}

/**
 * The course for a quick game on `board`. `rnd` is a function returning a
 * float in [0, 1); the setup screen passes none and gets Math.random, the
 * simulator passes a seeded one so a run repeats. `rot` pins the facing.
 */
export function quickCourse(board, library, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const flags = opts.flags === undefined ? QUICK_FLAGS : opts.flags;
  const dock = library.get(DOCK_BOARD);
  if (!dock) throw new Error("a quick game needs the " + DOCK_BOARD + " board");
  const rot = opts.rot === undefined ? Math.floor(rnd() * 4) & 3 : opts.rot & 3;
  const doc = layout(board, rot, dock);
  const spots = usableFlagSpots(doc, library);
  if (spots.length < flags) throw new Error(board.id + " marks " + spots.length + " usable flag location(s); this quick game draws " + flags);
  /* Fisher-Yates, then the first few: a random set in a random order */
  shuffle(spots, rnd);
  doc.flags = spots.slice(0, flags).map(s => [s.c, s.r]);
  if (flags !== QUICK_FLAGS) doc.blurb = doc.blurb.replace("with " + QUICK_FLAGS + " flags", "with " + flags + " flag" + (flags === 1 ? "" : "s"));
  return doc;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* --- a quick game on several boards ------------------------------------------
 *
 * N boards and F flags, drawn and laid rather than chosen. The boards come
 * out of a pool the caller has already filtered (12x12, verified, readable by
 * the ruleset in force), each at a random facing, and are laid the way the
 * box's own courses stack: the docking bay at the bottom, board 1 above it,
 * boards 2 and 3 up the column, and any more to either side, each where it
 * touches the most boards already down, never beyond three by three. The
 * flags then make one route through it: every board gets at least one, the
 * extras are handed out one per board in turn, a board's flags come in a
 * row before the race moves on, and consecutive flags keep to the classic
 * book's twelve squares wherever the boards they stand on touch. Turning F
 * up makes the same course a denser race; there are no race types, because
 * anything else is a custom course, which the workshop makes easy.
 */
const TILE = 12;
export const QUICK_MAX_BOARDS = 9;
/* each board a quick game draws marks at least three usable locations (canQuick), so three a board is always fillable */
export const QUICK_FLAGS_PER_BOARD = 3;
const FLAG_GAP = 12;

/** The flag counts a quick game on `n` boards may ask for: [least, most]. */
export function quickFlagRange(n) { return [n, QUICK_FLAGS_PER_BOARD * n]; }
/** The count the setup screen starts a quick game on `n` boards with. */
export function quickDefaultFlags(n) { return n === 1 ? QUICK_FLAGS : n + 2; }

/** Where boards 1..n go on the 3x3 lattice above the dock: the column first, then the sides. */
export function quickCells(n, rnd) {
  const cells = [{ gx: 0, gy: 0 }, { gx: 0, gy: 1 }, { gx: 0, gy: 2 }].slice(0, n);
  const key = c => c.gx + "," + c.gy;
  for (let i = 3; i < n; i++) {
    const taken = new Set(cells.map(key));
    let best = [], bestScore = -1;
    for (const gx of [-1, 1]) {
      for (let gy = 0; gy < 3; gy++) {
        const c = { gx, gy };
        if (taken.has(key(c))) continue;
        const score = neighboursOf(c, cells).length;
        if (score > bestScore) { bestScore = score; best = [c]; }
        else if (score === bestScore) best.push(c);
      }
    }
    /* among the cells touching the most boards, one that keeps a route from
     * board 1 over every board, if any does -- a course the race can run
     * through board by board beats one it has to jump across */
    const routable = best.filter(c => !routeOf(cells.concat([c]), rnd).jumps.some(j => j));
    const pick = (routable.length ? routable : best);
    cells.push(pick[Math.floor(rnd() * pick.length)]);
  }
  return cells;
}

function neighboursOf(c, cells) {
  return cells.filter(o => Math.abs(o.gx - c.gx) + Math.abs(o.gy - c.gy) === 1);
}

/**
 * The order the race visits the boards in: from board 1, over every board,
 * with as few steps as possible between boards that do not touch. Exhaustive,
 * since there are at most nine boards; ties broken at random.
 */
export function routeOf(cells, rnd) {
  const n = cells.length;
  const adj = (a, b) => Math.abs(cells[a].gx - cells[b].gx) + Math.abs(cells[a].gy - cells[b].gy) === 1;
  let best = null;          // { order, jumps, score }: the fewest jumps found so far
  const walk = (order, used, jumps) => {
    if (best && jumps >= best.score) return;                 // cannot beat it
    if (order.length === n) {
      const js = order.slice(1).map((b, i) => !adj(order[i], b));
      best = { order: order.slice(), jumps: js, score: jumps };
      return;
    }
    const last = order[order.length - 1];
    const next = [];
    for (let i = 0; i < n; i++) if (!used.has(i)) next.push(i);
    shuffle(next, rnd);
    /* the boards that touch first, so the first full route found is a good one */
    next.sort((a, b) => (adj(last, a) ? 0 : 1) - (adj(last, b) ? 0 : 1));
    for (const i of next) {
      used.add(i); order.push(i);
      walk(order, used, jumps + (adj(last, i) ? 0 : 1));
      order.pop(); used.delete(i);
    }
  };
  walk([0], new Set([0]), 0);
  return { order: best.order, jumps: best.jumps };
}

/** The course document for boards at facings on cells, with no flags yet. */
function multiLayout(boards, rots, cells, dock) {
  const stamps = boards.map((b, i) => ({ role: "board", board: b.id, rot: rots[i], at: [(cells[i].gx + 1) * TILE, (2 - cells[i].gy) * TILE] }));
  stamps.push({ role: "dock", board: dock.id, rot: 0, at: [TILE, 3 * TILE] });
  return {
    format: "PRCourse", version: 1,
    id: "quick_" + boards.map(b => b.id).join("_"),
    name: boards.length === 1 ? boards[0].name : boards.length + " boards: " + boards.map(b => b.name).join(", "),
    kind: "quick",
    blurb: "A quick game on " + boards.map((b, i) => b.name + " (" + FACINGS[rots[i]] + ")").join(", ") + ", drawn fresh.",
    stamps, flags: [], minPlayers: 1, maxPlayers: 8
  };
}

/** How many flags each board along the route gets: one each, then one more per board in turn. */
export function quickFlagCounts(n, f, order) {
  const counts = new Array(n).fill(1);
  for (let k = 0; k < f - n; k++) counts[order[k % n]]++;
  return counts;
}

/* One route of flags through the laid course, or null when these facings
 * cannot give one: a board's flags in a row, in route order, each pair of
 * consecutive flags within the gap where their boards touch. A bounded
 * depth-first search over the marked spots, candidates in random order. */
function drawFlags(doc, library, route, counts, rnd) {
  const spots = usableFlagSpots(doc, library);
  const byStamp = new Map();
  for (const s of spots) { if (!byStamp.has(s.stamp)) byStamp.set(s.stamp, []); byStamp.get(s.stamp).push(s); }
  const seq = [];      // per flag: its board, and whether it must be within the gap of the flag before
  for (let k = 0; k < route.order.length; k++) {
    const si = route.order[k];
    if ((byStamp.get(si) || []).length < counts[si]) return null;      // this facing left the board too few usable spots
    for (let j = 0; j < counts[si]; j++) seq.push({ stamp: si, near: j > 0 || (k > 0 && !route.jumps[k - 1]) });
  }
  const chosen = [];
  let budget = 4000;
  const near = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r)) <= FLAG_GAP;
  const pick = i => {
    if (i === seq.length) return true;
    if (--budget < 0) return false;
    const prev = chosen[chosen.length - 1];
    const cands = shuffle(byStamp.get(seq[i].stamp).filter(s => !chosen.includes(s) && (!seq[i].near || !prev || near(prev, s))), rnd);
    for (const s of cands) {
      chosen.push(s);
      if (pick(i + 1)) return true;
      chosen.pop();
      if (budget < 0) return false;
    }
    return false;
  };
  return pick(0) ? chosen.map(s => [s.c, s.r]) : null;
}

/**
 * A quick game on `n` boards drawn from `pool` with `f` flags. `pool` is the
 * boards eligible for a random draw, already filtered by the caller. `rnd`
 * as for quickCourse. Throws when the ask cannot be met.
 */
export function quickMulti(pool, n, f, library, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const dock = library.get(DOCK_BOARD);
  if (!dock) throw new Error("a quick game needs the " + DOCK_BOARD + " board");
  if (!Number.isInteger(n) || n < 1 || n > QUICK_MAX_BOARDS) throw new Error("a quick game is on 1 to " + QUICK_MAX_BOARDS + " boards, not " + n);
  const [lo, hi] = quickFlagRange(n);
  if (!Number.isInteger(f) || f < lo || f > hi) throw new Error("a quick game on " + n + " board" + (n === 1 ? "" : "s") + " has " + lo + " to " + hi + " flags, not " + f);
  if (pool.length < n) throw new Error("only " + pool.length + " board" + (pool.length === 1 ? "" : "s") + " to draw from; a quick game on " + n + " needs " + n);
  for (const b of pool) if (b.w !== TILE || b.h !== TILE) throw new Error(b.id + " is " + b.w + "x" + b.h + "; a quick game on several boards lays " + TILE + "x" + TILE + " boards");
  for (let draw = 0; draw < 12; draw++) {
    const boards = shuffle(pool.slice(), rnd).slice(0, n);
    const cells = quickCells(n, rnd);
    const route = routeOf(cells, rnd);
    const counts = quickFlagCounts(n, f, route.order);
    for (let facing = 0; facing < 6; facing++) {
      const rots = boards.map(() => Math.floor(rnd() * 4) & 3);
      const doc = multiLayout(boards, rots, cells, dock);
      const flags = drawFlags(doc, library, route, counts, rnd);
      if (flags) { doc.flags = flags; return doc; }
    }
  }
  throw new Error("could not draw a quick game on " + n + " boards with " + f + " flags from this pool");
}

/** A seeded generator for the tools, so a quick game in a check is the same quick game every run. */
export function seeded(seed) {
  let s = seed | 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; };
  /* neighbouring seeds start a step apart and their first draws sit within
   * a thousandth of each other; a few steps in they have spread out */
  next(); next(); next();
  return next;
}
