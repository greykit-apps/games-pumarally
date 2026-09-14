/* Elevation: levels, derived ledges, and ramp geometry.
 *
 * A LEDGE IS NOT STORED. Any edge whose two squares differ in level IS a ledge,
 * which is what the printed board draws and leaves exactly one source of truth.
 * Storing ledges separately would mean a board could carry a ledge between two
 * squares at the same level, or a level change with no ledge drawn across it,
 * and no reading of the photograph could say which of the two was meant.
 *
 * A RAMP is the one element that spans a level change -- Wet and Wild's rule is
 * that ramps are the only way between levels, and that you cannot cross a ledge
 * upward at all. Its stored level is the LOWER one and its direction points
 * UPHILL, so a ramp at level 0 facing north has level 1 to its north.
 */

import { levelAt, inBoard, isVoid, cellAt, propAt, idx } from "./board.js";
import { DC, DR, opposite, dirOfChar } from "./dir.js";
import { edgeOf } from "./edges.js";

/** The direction a ramp at (c,r) points uphill, or undefined when it is not a ramp. */
export function rampDir(board, c, r) {
  if (!propAt(board, c, r, "ramp")) return undefined;
  return dirOfChar(cellAt(board, c, r).charAt(1));
}

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
 * Is this level change crossed by a ramp? True when either square is a ramp
 * whose uphill direction runs along this edge. This is the exemption that makes
 * a ramp legal where every other element spanning a level change is not.
 */
export function rampCrosses(board, c, r, d) {
  const here = rampDir(board, c, r);
  if (here === d) return true;
  const nc = c + DC[d], nr = r + DR[d];
  const there = rampDir(board, nc, nr);
  return there === opposite(d);
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

/** Every ramp on the board, with the level it climbs from and to. */
export function rampsOf(board) {
  const out = [];
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const d = rampDir(board, c, r);
      if (d === undefined) continue;
      const uc = c + DC[d], ur = r + DR[d];
      const bc = c - DC[d], br = r - DR[d];
      out.push({
        c, r, dir: d,
        foot: levelAt(board, c, r),
        top: inBoard(board, uc, ur) ? levelAt(board, uc, ur) : null,
        behind: inBoard(board, bc, br) ? levelAt(board, bc, br) : null
      });
    }
  }
  return out;
}
