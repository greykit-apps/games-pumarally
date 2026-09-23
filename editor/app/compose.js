/* The course workshop: laying boards out, turning them, and putting the flags on.
 *
 * A COURSE IS A LIST OF PLACEMENTS, never a saved grid. The grid is assembled
 * from the boards every time, so a board corrected later corrects every course
 * it appears in -- which is the whole reason one board serves many courses, and
 * exactly how it works in the box.
 *
 * BOARDS MAY OVERLAP (issue #13), and the order of the list is the stacking
 * order: the last laid is on top, and the squares under it are out of play.
 * Master Builder lays its small boards over the big ones this way, and with
 * arbitrary placement there is no reason a full-size board may not do the
 * same. A board moved is a board laid again, so it comes to the top.
 *
 * Placement is free integer positioning with SNAPPING IN THE POINTER HANDLING
 * ONLY. Boards of any dimensions compose; nothing here knows the number twelve.
 * The snap offers positions edge-adjacent to something already down, which
 * reproduces a 12-lattice for 12x12 boards without encoding one.
 */

import { assemble, courseBounds, stampFootprint, stampDims, dockStamp, COURSE_FORMAT, COURSE_VERSION } from "../lib/course.js";
import { rotateBoard } from "../lib/rotate.js";
import { inBoard, isVoid, elementAt } from "../lib/board.js";

/** A fresh, empty course. */
export function newCourse(id = "untitled") {
  return {
    format: COURSE_FORMAT, version: COURSE_VERSION,
    id, name: "Untitled course", kind: "track", blurb: "",
    stamps: [], flags: [], reboots: [], starts: [], rebootDamage: null, minPlayers: 2, maxPlayers: 8
  };
}

/**
 * Shift every stamp so the top-left of the course is (0,0), moving the flags
 * with them. Placement is allowed to go negative while somebody is dragging;
 * this is what puts it back before anything is validated or saved, and it is
 * the only place flag coordinates are ever rewritten.
 */
export function normalise(course, library) {
  if (!course.stamps.length) return course;
  let x0 = Infinity, y0 = Infinity;
  for (const s of course.stamps) {
    x0 = Math.min(x0, s.at[0]);
    y0 = Math.min(y0, s.at[1]);
  }
  if (x0 === 0 && y0 === 0) return course;
  for (const s of course.stamps) { s.at[0] -= x0; s.at[1] -= y0; }
  /* Flags are in assembled-grid coordinates, relative to the bounding box,
   * and the box moves with the stamps -- so a pure shift of every stamp leaves
   * every flag on the same square of the same board. What DOES move a flag is
   * the box changing shape, and that is `keepFlags`'s job below. */
  return course;
}

/**
 * Run an edit that moves boards, and keep every flag on the square of the
 * board it was on.
 *
 * FLAGS ARE STORED RELATIVE TO THE BOUNDING BOX, and the box is the top-left
 * of the stamps. Laying a board to the left of or above the layout, taking off
 * the board that WAS the leftmost or topmost, moving a board, or turning one:
 * each changes where a flag's square is in the grid, and until this existed
 * the flags stayed at their old numbers -- so flag 1 on Exchange at (2,2)
 * became flag 1 on whatever board now covered (2,2). Silently, unless the new
 * square happened not to be floor.
 *
 * The invariant is per flag: the same square of the same board, tracked by the
 * stamp object and a board-local offset, measured before the edit and
 * reapplied after it. A flag on a board that the edit took off keeps its
 * absolute position. `rotate` names a stamp turned by `quarters` clockwise, so
 * the offset turns with it.
 */
function keepFlags(course, library, fn, rotate) {
  const b0 = courseBounds(course, library);
  if (!course.reboots) course.reboots = [];
  if (!course.starts) course.starts = [];
  /* the reboot tokens and the starting squares are squares of boards too, and turn with them */
  const marks = course.flags.concat(course.reboots, course.starts);
  const owners = marks.map(f => {
    const abs = [f[0] + b0.x0, f[1] + b0.y0];
    for (let i = course.stamps.length - 1; i >= 0; i--) {   // same precedence as stampAt
      const stamp = course.stamps[i];
      const src = library.get(stamp.board);
      if (!src) continue;
      const fp = stampFootprint(stamp, src);
      if (abs[0] >= fp.x0 && abs[0] <= fp.x1 && abs[1] >= fp.y0 && abs[1] <= fp.y1) {
        return { abs, stamp, lc: abs[0] - fp.x0, lr: abs[1] - fp.y0, w: fp.x1 - fp.x0 + 1, h: fp.y1 - fp.y0 + 1 };
      }
    }
    return { abs };
  });

  const result = fn();

  const b1 = courseBounds(course, library);
  marks.forEach((f, i) => {
    const o = owners[i];
    let abs = o.abs;
    let turned = 0;
    if (o.stamp && course.stamps.indexOf(o.stamp) >= 0) {
      let { lc, lr, w, h } = o;
      if (rotate && rotate.stamp === o.stamp) {
        /* a quarter-turn clockwise sends (c,r) on a w x h board to (h-1-r, c) */
        const n = (((rotate.quarters | 0) % 4) + 4) % 4;
        turned = n;
        for (let q = 0; q < n; q++) { [lc, lr] = [h - 1 - lr, lc]; [w, h] = [h, w]; }
      }
      abs = [o.stamp.at[0] + lc, o.stamp.at[1] + lr];
    }
    f[0] = abs[0] - b1.x0;
    f[1] = abs[1] - b1.y0;
    if (f.length === 3 && turned) f[2] = (f[2] + turned) % 4;      // a token's arrow turns with its board
  });
  normalise(course, library);
  return result;
}

/** Positions where `boardId` at `rot` would sit edge-adjacent to what is down. */
export function snapTargets(course, library, boardId, rot) {
  const b = library.get(boardId);
  if (!b) return [];
  const [w, h] = stampDims(b, rot);
  if (!course.stamps.length) return [{ at: [0, 0] }];
  const out = [];
  const seen = new Set();
  for (const s of course.stamps) {
    const src = library.get(s.board);
    if (!src) continue;
    const f = stampFootprint(s, src);
    const cands = [
      [f.x1 + 1, f.y0], [f.x0 - w, f.y0],
      [f.x0, f.y1 + 1], [f.x0, f.y0 - h],
      [f.x1 + 1, f.y1 - h + 1], [f.x0 - w, f.y1 - h + 1],
      [f.x1 - w + 1, f.y1 + 1], [f.x1 - w + 1, f.y0 - h]
    ];
    for (const at of cands) {
      const key = at[0] + "," + at[1];
      if (seen.has(key)) continue;
      seen.add(key);
      if (overlapsAny(course, library, at, w, h, -1)) continue;
      out.push({ at });
    }
  }
  return out;
}

export function overlapsAny(course, library, at, w, h, ignoreIndex) {
  const box = { x0: at[0], y0: at[1], x1: at[0] + w - 1, y1: at[1] + h - 1 };
  return course.stamps.some((s, i) => {
    if (i === ignoreIndex) return false;
    const src = library.get(s.board);
    if (!src) return false;
    const f = stampFootprint(s, src);
    return box.x0 <= f.x1 && f.x0 <= box.x1 && box.y0 <= f.y1 && f.y0 <= box.y1;
  });
}

/** The snap target nearest a point, in course squares. */
export function nearestSnap(course, library, boardId, rot, cx, cy) {
  const targets = snapTargets(course, library, boardId, rot);
  if (!targets.length) return null;
  let best = null, bestD = Infinity;
  for (const t of targets) {
    const d = Math.abs(t.at[0] - cx) + Math.abs(t.at[1] - cy);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/** Add a board, on top of whatever it covers. Returns the stamp index, or -1 for a second docking bay. */
export function place(course, library, boardId, rot, at, role = "board") {
  const b = library.get(boardId);
  if (!b) return -1;
  if (role === "dock" && dockStamp(course)) return -1;
  return keepFlags(course, library, () => {
    course.stamps.push({ role, board: boardId, rot, at: [at[0], at[1]] });
    return course.stamps.length - 1;
  });
}

/** Which stamp covers a course square, or -1. */
export function stampAt(course, library, c, r) {
  for (let i = course.stamps.length - 1; i >= 0; i--) {
    const s = course.stamps[i];
    const src = library.get(s.board);
    if (!src) continue;
    const f = stampFootprint(s, src);
    if (c >= f.x0 && c <= f.x1 && r >= f.y0 && r <= f.y1) return i;
  }
  return -1;
}

/** Turn a placed board a quarter, in place, keeping its top-left corner and its place in the stack. */
export function turn(course, library, index, quarters = 1) {
  const s = course.stamps[index];
  if (!s) return false;
  const src = library.get(s.board);
  if (!src) return false;
  const next = (((s.rot + quarters) % 4) + 4) % 4;
  /* the flags on it turn with it: a flag is a square of a board, not a place
   * in the grid the board happens to be covering */
  return keepFlags(course, library, () => { s.rot = next; return true; }, { stamp: s, quarters });
}

export function remove(course, library, index) {
  if (index < 0 || index >= course.stamps.length) return false;
  return keepFlags(course, library, () => { course.stamps.splice(index, 1); return true; });
}

/** Move a placed board. It is laid again, so it comes to the top of the stack; returns its new index, or -1. */
export function moveStamp(course, library, index, at) {
  const s = course.stamps[index];
  if (!s) return -1;
  return keepFlags(course, library, () => {
    s.at = [at[0], at[1]];
    course.stamps.splice(index, 1);
    course.stamps.push(s);
    return course.stamps.length - 1;
  });
}

/* --- flags -------------------------------------------------------------------
 * The array index IS the flag number, so inserting at a position renumbers
 * everything after it -- which is what "this one goes second" means and is why
 * the order is an array rather than a number on each flag.
 */

/* --- reboot tokens: one per board, facing somewhere, placed like flags --------- */

export function rebootAt(course, c, r) {
  return (course.reboots || []).findIndex(t => t[0] === c && t[1] === r);
}
export function addReboot(course, c, r, face) {
  if (!course.reboots) course.reboots = [];
  if (rebootAt(course, c, r) >= 0) return false;
  course.reboots.push([c, r, face | 0]);
  return true;
}
export function removeReboot(course, index) {
  if (!course.reboots || index < 0 || index >= course.reboots.length) return false;
  course.reboots.splice(index, 1);
  return true;
}
export function turnReboot(course, index, quarters) {
  const t = course.reboots && course.reboots[index];
  if (!t) return false;
  t[2] = (((t[2] + quarters) % 4) + 4) % 4;
  return true;
}

/* --- the course's own starting squares: numbered by their order, placed like flags --- */

export function startAt(course, c, r) {
  return (course.starts || []).findIndex(s => s[0] === c && s[1] === r);
}
export function addStart(course, c, r) {
  if (!course.starts) course.starts = [];
  if (startAt(course, c, r) >= 0) return false;
  course.starts.push([c, r]);
  return true;
}
export function removeStart(course, index) {
  if (!course.starts || index < 0 || index >= course.starts.length) return false;
  course.starts.splice(index, 1);
  return true;
}
export function moveStart(course, index, to) {
  if (!course.starts || index < 0 || index >= course.starts.length) return false;
  const [s] = course.starts.splice(index, 1);
  course.starts.splice(Math.max(0, Math.min(course.starts.length, to)), 0, s);
  return true;
}

export function flagAt(course, c, r) {
  return course.flags.findIndex(f => f[0] === c && f[1] === r);
}

export function addFlag(course, c, r, position) {
  const i = flagAt(course, c, r);
  if (i >= 0) return false;
  if (position === undefined || position >= course.flags.length) course.flags.push([c, r]);
  else course.flags.splice(position, 0, [c, r]);
  return true;
}

export function removeFlag(course, index) {
  if (index < 0 || index >= course.flags.length) return false;
  course.flags.splice(index, 1);
  return true;
}

export function moveFlag(course, index, to) {
  if (index < 0 || index >= course.flags.length) return false;
  const [f] = course.flags.splice(index, 1);
  course.flags.splice(Math.max(0, Math.min(course.flags.length, to)), 0, f);
  return true;
}

/** Is this square somewhere a flag could stand? Cheap pre-check for the ghost. */
export function flagWouldFit(grid, c, r) {
  if (!inBoard(grid, c, r) || isVoid(grid, c, r)) return false;
  const def = elementAt(grid, c, r);
  return !!def && !def.props.pit;
}

/** The course as a document, ready to validate or save. */
export function toDocument(course) {
  const doc = {
    format: COURSE_FORMAT, version: COURSE_VERSION,
    id: course.id, name: course.name, kind: course.kind
  };
  if (course.blurb) doc.blurb = course.blurb;
  doc.stamps = course.stamps.map(s => ({ role: s.role, board: s.board, rot: s.rot, at: [s.at[0], s.at[1]] }));
  doc.flags = course.flags.map(f => [f[0], f[1]]);
  if (course.reboots && course.reboots.length) doc.reboots = course.reboots.map(t => [t[0], t[1], t[2]]);
  if (course.starts && course.starts.length) doc.starts = course.starts.map(s => [s[0], s[1]]);
  if (Number.isInteger(course.rebootDamage)) doc.rebootDamage = course.rebootDamage;
  if (course.minPlayers !== undefined) doc.minPlayers = course.minPlayers;
  if (course.maxPlayers !== undefined) doc.maxPlayers = course.maxPlayers;
  return doc;
}
