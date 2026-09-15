/* The wall layer's edge lattice.
 *
 * ONE STORAGE SLOT PER EDGE. There is no "east wall of (3,4)" to drift apart
 * from "west wall of (4,4)", because both name the same slot and there is only
 * one. The perimeter has real storage too, so a board's rim is data rather than
 * an absence that every reader has to remember to special-case.
 *
 *   h:c,r   the horizontal edge between (c, r-1) and (c, r).  r in 0..h, c in 0..w-1
 *   v:c,r   the vertical   edge between (c-1, r) and (c, r).  c in 0..w, r in 0..h-1
 *
 * Stored as `wallH` of w*(h+1) and `wallV` of (w+1)*h, serialized as `hRows`
 * (h+1 rows of w chars) and `vRows` (h rows of w+1 chars).
 *
 * EDGE IDS ARE DERIVED STRINGS, NOT STORED STRUCTURE, because rotation is then
 * two closed-form lines instead of a table. A quarter-turn clockwise sends cell
 * (c,r) to (h-1-r, c) and every direction to rot(d,1), from which:
 *
 *     h:(c,r)  ->  v:(h-r,   c)
 *     v:(c,r)  ->  h:(h-1-r, c)
 *
 * Both stay in range at the rim, which is the part worth checking rather than
 * assuming: h:(c,h) is a board's bottom edge and maps to v:(0,c), the left edge
 * of the rotated board, which is where the bottom edge goes.
 */

import { N, E, S, W, rot } from "./dir.js";

/** Lattice glyphs, and the byte stored for each. */
export const EDGE_NONE = 0;
export const EDGE_WALL = 1;
export const EDGE_DOOR = 2;

export const EDGE_GLYPHS = [" ", "#", "D"];

/** Glyph character to stored byte, or undefined when the character is not legal. */
export function edgeCodeOf(ch) {
  const i = EDGE_GLYPHS.indexOf(ch);
  return i < 0 ? undefined : i;
}

export function edgeGlyph(code) {
  return EDGE_GLYPHS[code];
}

/** Canonical id string for an edge. */
export function edgeId(kind, c, r) {
  return kind + ":" + c + "," + r;
}

/** "h:3,0" -> {kind,c,r}. Returns null for anything malformed. */
export function parseEdge(id) {
  if (typeof id !== "string") return null;
  const m = /^([hv]):(\d+),(\d+)$/.exec(id);
  if (!m) return null;
  return { kind: m[1], c: +m[2], r: +m[3] };
}

/** The edge on side `d` of cell (c,r). */
export function edgeOf(c, r, d) {
  switch (d) {
    case N: return { kind: "h", c: c,     r: r     };
    case S: return { kind: "h", c: c,     r: r + 1 };
    case W: return { kind: "v", c: c,     r: r     };
    case E: return { kind: "v", c: c + 1, r: r     };
    default: return null;
  }
}

/** The id of the edge on side `d` of cell (c,r). */
export function edgeIdOf(c, r, d) {
  const e = edgeOf(c, r, d);
  return e && edgeId(e.kind, e.c, e.r);
}

/** The two directions an edge of this kind can face. */
export function normalsOf(kind) {
  return kind === "h" ? [N, S] : [E, W];
}

/** Is `d` one of the two normals of an edge of this kind? */
export function isNormalOf(kind, d) {
  return kind === "h" ? (d === N || d === S) : (d === E || d === W);
}

/**
 * The cell a device standing on `edge` and facing `face` occupies.
 * DERIVED, NEVER STORED. The old format kept {c, r, d} together, so a device
 * could name a cell whose wall was on the wrong side of it; with one anchor and
 * one derivation that is unrepresentable.
 */
export function faceCell(edge, face) {
  if (edge.kind === "h") {
    if (face === S) return [edge.c, edge.r];
    if (face === N) return [edge.c, edge.r - 1];
  } else {
    if (face === E) return [edge.c, edge.r];
    if (face === W) return [edge.c - 1, edge.r];
  }
  return null;
}

/** Is this edge within the lattice of a w x h board? */
export function edgeInBounds(edge, w, h) {
  if (edge.kind === "h") return edge.c >= 0 && edge.c < w && edge.r >= 0 && edge.r <= h;
  return edge.c >= 0 && edge.c <= w && edge.r >= 0 && edge.r < h;
}

/**
 * One quarter-turn clockwise, for a board that was w x h BEFORE the turn.
 * `w` is unused and accepted only so callers do not have to remember which of
 * the two dimensions this needs; getting that wrong is silent.
 */
export function rotateEdge(edge, w, h) {
  return edge.kind === "h"
    ? { kind: "v", c: h - edge.r,     r: edge.c }
    : { kind: "h", c: h - 1 - edge.r, r: edge.c };
}

/** The face a device keeps after one quarter-turn clockwise. */
export function rotateFace(face) {
  return rot(face, 1);
}

/* --- lattice access on a board -------------------------------------------- */

export function hIndex(board, c, r) { return r * board.w + c; }
export function vIndex(board, c, r) { return r * (board.w + 1) + c; }

/** The stored glyph code at an edge, or EDGE_NONE when it is off the lattice. */
export function edgeCodeAt(board, edge) {
  if (!edgeInBounds(edge, board.w, board.h)) return EDGE_NONE;
  return edge.kind === "h"
    ? board.wallH[hIndex(board, edge.c, edge.r)]
    : board.wallV[vIndex(board, edge.c, edge.r)];
}

export function setEdgeCode(board, edge, code) {
  if (!edgeInBounds(edge, board.w, board.h)) return false;
  if (edge.kind === "h") board.wallH[hIndex(board, edge.c, edge.r)] = code;
  else board.wallV[vIndex(board, edge.c, edge.r)] = code;
  return true;
}

/** The glyph code on side `d` of cell (c,r). */
export function wallAt(board, c, r, d) {
  return edgeCodeAt(board, edgeOf(c, r, d));
}

/** Set the glyph code on side `d` of cell (c,r). Symmetric by construction. */
export function setWall(board, c, r, d, code) {
  return setEdgeCode(board, edgeOf(c, r, d), code);
}

/** Is there a wall proper (not a door, not nothing) on side `d` of (c,r)? */
export function isWall(board, c, r, d) {
  return wallAt(board, c, r, d) === EDGE_WALL;
}
