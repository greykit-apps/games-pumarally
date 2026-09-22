/* Elevation: levels, derived ledges, and ramp geometry.
 *
 * A LEDGE IS NOT STORED. Any edge whose two squares differ in level IS a ledge,
 * which is what the printed board draws and leaves exactly one source of truth.
 * Storing ledges separately would mean a board could carry a ledge between two
 * squares at the same level, or a level change with no ledge drawn across it,
 * and no reading of the photograph could say which of the two was meant.
 *
 * A RAMP IS AN EDGE that may be crossed either way -- Wet and Wild's rule is
 * that ramps are the only way between levels, and that you cannot cross a
 * ledge upward at all. It lives on its own lattice beside the walls
 * (edges.js), and WHICH WAY IS UP IS DERIVED FROM THE LEVELS exactly as a
 * ledge is: the higher of the two squares is the top, the lower is the foot,
 * and the foot is the square the board prints the ramp on. A square may carry
 * ramps on more than one side; that is two marked edges and nothing more.
 */

import { levelAt, inBoard, isVoid } from "./board.js";
import { DC, DR, N, E, S, W, opposite } from "./dir.js";
import { rampOn, hIndex, vIndex } from "./edges.js";

/**
 * Is the edge on side `d` of (c,r) a ledge? True when the two squares differ in
 * level. A square off the board or void is not a ledge -- the rim of a board is
 * not a cliff, it is the end of the data.
 */
export function isLedge(board, c, r, d) {
  if (!inBoard(board, c, r) || isVoid(board, c, r)) return false;
  const nc = c + DC[d], nr = r + DR[d];
  if (!inBoard(board, nc, nr) || isVoid(board, nc, nr)) return false;
  return levelAt(board, c, r) !== levelAt(board, nc, nr);
}

/** Levels down (negative) or up (positive) when stepping from (c,r) in direction d. */
export function levelStep(board, c, r, d) {
  const nc = c + DC[d], nr = r + DR[d];
  if (!inBoard(board, nc, nr)) return 0;
  return levelAt(board, nc, nr) - levelAt(board, c, r);
}

/**
 * Is this level change crossed by a ramp? This is the exemption that makes a
 * ramp legal where every other way across a level change is not.
 */
export function rampCrosses(board, c, r, d) {
  return rampOn(board, c, r, d);
}

/** Does a robot on (c,r) stepping `d` climb a ramp across that edge? */
export function rampUp(board, c, r, d) {
  return rampOn(board, c, r, d) && levelStep(board, c, r, d) > 0;
}

/** Does a robot on (c,r) stepping `d` come down a ramp across that edge? */
export function rampDown(board, c, r, d) {
  return rampOn(board, c, r, d) && levelStep(board, c, r, d) < 0;
}

/** The sides of (c,r) that carry a ramp, each with the level change across it. */
export function rampsAt(board, c, r) {
  return [N, E, S, W].filter(d => rampOn(board, c, r, d)).map(d => ({ dir: d, step: levelStep(board, c, r, d) }));
}

/** Every level the board actually uses, ascending. */
export function levelsUsed(board) {
  const seen = new Set();
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      if (!isVoid(board, c, r)) seen.add(levelAt(board, c, r));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Every ramp edge on the board, each once, with the two squares it joins.
 * `foot` and `top` are set when both squares are floor at different levels,
 * with `dir` the way up from the foot and `behind` the level of the square the
 * foot is approached from (null off the board). `off` marks an edge with no
 * floor on one side; `flat` one whose squares are level.
 */
export function rampsOf(board) {
  const out = [];
  const one = (edge, ac, ar, bc, br, dAtoB) => {
    const on = (c, r) => inBoard(board, c, r) && !isVoid(board, c, r);
    const a = { c: ac, r: ar, level: levelAt(board, ac, ar) };
    const b = { c: bc, r: br, level: levelAt(board, bc, br) };
    const rec = { edge, a, b, off: !on(ac, ar) || !on(bc, br), flat: false, foot: null, top: null, dir: undefined, behind: null };
    if (!rec.off) {
      if (a.level < b.level) { rec.foot = a; rec.top = b; rec.dir = dAtoB; }
      else if (b.level < a.level) { rec.foot = b; rec.top = a; rec.dir = opposite(dAtoB); }
      else rec.flat = true;
      if (rec.foot) {
        const bc2 = rec.foot.c - DC[rec.dir], br2 = rec.foot.r - DR[rec.dir];
        rec.behind = on(bc2, br2) ? levelAt(board, bc2, br2) : null;
      }
    }
    out.push(rec);
  };
  for (let r = 0; r <= board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      if (board.rampH[hIndex(board, c, r)]) one({ kind: "h", c, r }, c, r - 1, c, r, S);
    }
  }
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c <= board.w; c++) {
      if (board.rampV[vIndex(board, c, r)]) one({ kind: "v", c, r }, c - 1, r, c, r, E);
    }
  }
  return out;
}
