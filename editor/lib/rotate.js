/* One pure quarter-turn, and never four hand-rotated copies.
 *
 * A quarter-turn clockwise sends cell (c,r) to (h-1-r, c) and every direction
 * to rot(d,1). Walls go through the closed-form edge mapping in edges.js, so
 * the lattice rotates without anybody deciding which tile owns which wall.
 *
 * ARMS ARE NOT TOUCHED. They are relative to the belt's own exit, so the exit
 * rotates and the arms follow for free. The old code remapped every merge
 * letter on every turn -- four chances to be wrong, and only the round-trip
 * test standing between a wrong one and a board that turns robots the other
 * way on half the courses it appears in.
 */

import { rot, dirOfChar, dirChar } from "./dir.js";
import { ELEMENTS, ARG_DIR } from "../rulesets/elements.js";
import { rotateEdge, rotateFace } from "./edges.js";
import { blankBoard, idx, hasLevels } from "./board.js";

function rotateToken(tok) {
  const def = ELEMENTS[tok.charAt(0)];
  if (!def || def.arg !== ARG_DIR) return tok;
  const d = dirOfChar(tok.charAt(1));
  if (d === undefined) return tok;                 // malformed; the validator says so
  return tok.charAt(0) + dirChar(rot(d, 1)) + tok.charAt(2);
}

/** One quarter-turn clockwise. Returns a new board; the input is untouched. */
export function rotateOnce(board) {
  const out = blankBoard({
    id: board.id, name: board.name, w: board.h, h: board.w,
    set: board.set, origin: board.origin,
    unverified: board.unverified, allowVoid: board.allowVoid, notes: board.notes
  });

  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const nc = board.h - 1 - r, nr = c;
      out.cells[idx(out, nc, nr)] = rotateToken(board.cells[idx(board, c, r)]);
    }
  }

  /* A site is a marking ON a square, so it goes exactly where the square goes.
   * Nothing in it is directional -- a wrench does not face anywhere. */
  for (const [key, has] of board.sites) {
    const [c, r] = key.split(",").map(Number);
    out.sites.set((board.h - 1 - r) + "," + c, has.slice());
  }

  if (hasLevels(board)) {
    out.levels = new Int8Array(out.w * out.h);
    for (let r = 0; r < board.h; r++) {
      for (let c = 0; c < board.w; c++) {
        out.levels[idx(out, board.h - 1 - r, c)] = board.levels[idx(board, c, r)];
      }
    }
  }

  /* both lattices go through the one edge mapping: a ramp turns exactly as
   * the wall on the same edge would */
  for (const [srcH, srcV, dstH, dstV] of [[board.wallH, board.wallV, out.wallH, out.wallV], [board.rampH, board.rampV, out.rampH, out.rampV]]) {
    for (let r = 0; r <= board.h; r++) {
      for (let c = 0; c < board.w; c++) {
        const code = srcH[r * board.w + c];
        if (!code) continue;
        const e = rotateEdge({ kind: "h", c, r }, board.w, board.h);
        dstV[e.r * (out.w + 1) + e.c] = code;
      }
    }
    for (let r = 0; r < board.h; r++) {
      for (let c = 0; c <= board.w; c++) {
        const code = srcV[r * (board.w + 1) + c];
        if (!code) continue;
        const e = rotateEdge({ kind: "v", c, r }, board.w, board.h);
        dstH[e.r * out.w + e.c] = code;
      }
    }
  }

  out.wallDevices = board.wallDevices.map(dev => {
    const next = { ...dev, edge: rotateEdge(dev.edge, board.w, board.h) };
    if (dev.face !== null && dev.face !== undefined) next.face = rotateFace(dev.face);
    return next;
  });

  out.ceilingDevices = board.ceilingDevices.map(dev =>
    ({ ...dev, c: board.h - 1 - dev.r, r: dev.c }));
  out.floorDevices = board.floorDevices.map(dev =>
    ({ ...dev, c: board.h - 1 - dev.r, r: dev.c }));

  return out;
}

/** `q` quarter-turns clockwise. q is taken modulo 4, negatives included. */
export function rotateBoard(board, q) {
  let out = board;
  const n = (((q | 0) % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotateOnce(out);
  return out;
}

/** The dimensions a w x h board occupies after `q` quarter-turns. */
export function rotatedDims(w, h, q) {
  return ((((q | 0) % 4) + 4) % 4) % 2 ? [h, w] : [w, h];
}
