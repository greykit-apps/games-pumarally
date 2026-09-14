/* The course workshop: laying boards out, turning them, and putting the flags on.
 *
 * A COURSE IS A LIST OF PLACEMENTS, never a saved grid. The grid is assembled
 * from the boards every time, so a board corrected later corrects every course
 * it appears in -- which is the whole reason one board serves many courses, and
 * exactly how it works in the box.
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
    stamps: [], flags: [], minPlayers: 2, maxPlayers: 8
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
  /* flags are in assembled-grid coordinates, which are relative to the same
   * origin, so they do NOT move: the grid origin moved with them. */
  return course;
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

function overlapsAny(course, library, at, w, h, ignoreIndex) {
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

/** Add a board. Returns the stamp index, or -1 when it would overlap. */
export function place(course, library, boardId, rot, at, role = "board") {
  const b = library.get(boardId);
  if (!b) return -1;
  const [w, h] = stampDims(b, rot);
  if (overlapsAny(course, library, at, w, h, -1)) return -1;
  if (role === "dock" && dockStamp(course)) return -1;
  course.stamps.push({ role, board: boardId, rot, at: [at[0], at[1]] });
  normalise(course, library);
  return course.stamps.length - 1;
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

/** Turn a placed board a quarter, in place, keeping its top-left corner. */
export function turn(course, library, index, quarters = 1) {
  const s = course.stamps[index];
  if (!s) return false;
  const src = library.get(s.board);
  if (!src) return false;
  const next = (((s.rot + quarters) % 4) + 4) % 4;
  const [w, h] = stampDims(src, next);
  if (overlapsAny(course, library, s.at, w, h, index)) return false;
  s.rot = next;
  return true;
}

export function remove(course, library, index) {
  if (index < 0 || index >= course.stamps.length) return false;
  course.stamps.splice(index, 1);
  normalise(course, library);
  return true;
}

/** Move a placed board. Refuses an overlap rather than shuffling things aside. */
export function moveStamp(course, library, index, at) {
  const s = course.stamps[index];
  if (!s) return false;
  const src = library.get(s.board);
  const [w, h] = stampDims(src, s.rot);
  if (overlapsAny(course, library, at, w, h, index)) return false;
  s.at = [at[0], at[1]];
  normalise(course, library);
  return true;
}

/* --- flags -------------------------------------------------------------------
 * The array index IS the flag number, so inserting at a position renumbers
 * everything after it -- which is what "this one goes second" means and is why
 * the order is an array rather than a number on each flag.
 */

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
  return !!def && def.key === "floor";
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
  if (course.minPlayers !== undefined) doc.minPlayers = course.minPlayers;
  if (course.maxPlayers !== undefined) doc.maxPlayers = course.maxPlayers;
  return doc;
}
