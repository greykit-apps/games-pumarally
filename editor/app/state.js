/* Editor state, undo, and the local library.
 *
 * Undo keeps CLONED BOARDS rather than serialized documents, because a board
 * mid-edit is usually one that does not validate yet -- that is what being
 * mid-edit means -- and undo has to work on those most of all.
 *
 * A mark is DROPPED when nothing actually changed, so a click that a tool
 * refused does not cost an undo step. Otherwise Ctrl-Z becomes a count of how
 * many times you clicked rather than of how many things you did.
 */

import { cloneBoard, blankBoard } from "../lib/board.js";
import { boardJSON } from "../lib/canon.js";
import { checkBoard } from "../validate/index.js";
import { blankToolState } from "./tools.js";

export const UNDO_DEPTH = 80;
const KEY = "pumarally_editor_v2";

export function newState(board) {
  return {
    board: board || blankBoard({ id: "untitled", name: "Untitled" }),
    mode: "art",
    hand: blankToolState(),
    hover: null,
    sel: null,            // the square being edited, if any
    undo: [],
    redo: [],
    dirty: false,
    diagnostics: [],
    zoom: 1, offX: 0, offY: 0,
    photo: null,          // { url, opacity, scale, dx, dy, solo }
    status: "",
    statusKind: ""
  };
}

/** Take a snapshot before an edit. Returns a token to keep or drop. */
export function mark(st) {
  return { before: cloneBoard(st.board) };
}

/** Keep the snapshot, but only if the board actually moved. */
export function keep(st, token) {
  if (!token) return false;
  if (same(token.before, st.board)) return false;
  st.undo.push(token.before);
  if (st.undo.length > UNDO_DEPTH) st.undo.shift();
  st.redo.length = 0;
  st.dirty = true;
  return true;
}

function same(a, b) {
  if (a.w !== b.w || a.h !== b.h) return false;
  /* Metadata counts. Switching the edition changes which elements are legal and
   * which the rail offers, so it is exactly the kind of edit somebody wants
   * back -- and while this compared only the grid, Ctrl-Z could not reach it. */
  for (const k of ["name", "id", "set", "origin", "notes"]) {
    if ((a[k] || "") !== (b[k] || "")) return false;
  }
  if (!!a.unverified !== !!b.unverified) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) return false;
  for (let i = 0; i < a.wallH.length; i++) if (a.wallH[i] !== b.wallH[i]) return false;
  for (let i = 0; i < a.wallV.length; i++) if (a.wallV[i] !== b.wallV[i]) return false;
  /* THE RAMP LATTICE COUNTS. The first ramp laid on a flat board raised a
   * square, which this saw; a second ramp against that raised square changed
   * only the lattice, which it did not -- so the ramp sat in the model with no
   * redraw, no undo step and no autosave, the sites bug below over again. */
  for (let i = 0; i < a.rampH.length; i++) if (a.rampH[i] !== b.rampH[i]) return false;
  for (let i = 0; i < a.rampV.length; i++) if (a.rampV[i] !== b.rampV[i]) return false;
  const al = a.levels, bl = b.levels;
  if (!!al !== !!bl) return false;
  if (al && bl) for (let i = 0; i < al.length; i++) if (al[i] !== bl[i]) return false;
  /* SITES COUNT TOO. This compared everything but the markings, so a wrench, a
   * battery or a flag location laid on a square was "no change": no undo step,
   * no redraw, no revalidation, no autosave. The marking sat in the model with
   * nothing on screen to show for it, which is exactly what the flag-location
   * workflow looked like from the outside -- a tool that did nothing. */
  if (a.sites.size !== b.sites.size) return false;
  for (const [k, v] of a.sites) {
    const w = b.sites.get(k);
    if (!w || v.length !== w.length || v.some((x, i) => x !== w[i])) return false;
  }
  const an = a.siteNotes || new Map(), bn = b.siteNotes || new Map();
  if (an.size !== bn.size) return false;
  for (const [k, v] of an) if (bn.get(k) !== v) return false;
  if (a.wallDevices.length !== b.wallDevices.length) return false;
  if (a.ceilingDevices.length !== b.ceilingDevices.length) return false;
  return JSON.stringify(a.wallDevices) === JSON.stringify(b.wallDevices) &&
         JSON.stringify(a.ceilingDevices) === JSON.stringify(b.ceilingDevices);
}

export function undo(st) {
  if (!st.undo.length) return false;
  st.redo.push(cloneBoard(st.board));
  st.board = st.undo.pop();
  st.dirty = true;
  return true;
}

export function redo(st) {
  if (!st.redo.length) return false;
  st.undo.push(cloneBoard(st.board));
  st.board = st.redo.pop();
  st.dirty = true;
  return true;
}

export function revalidate(st) {
  st.diagnostics = checkBoard(st.board).diagnostics;
  return st.diagnostics;
}

/* --- the local library ------------------------------------------------------
 * localStorage, one entry per named board. It can throw or come back empty in
 * a private window or with site data cleared, so every read and write is
 * wrapped and the editor works without it -- a transcription in progress is
 * worth autosaving, but losing the autosave must not lose the editor.
 */

function store() {
  try { return window.localStorage; } catch (e) { return null; }
}

export function saveLocal(id, board, extra = {}) {
  const s = store();
  if (!s) return false;
  try {
    const all = readAll();
    all[id] = { json: boardJSON(board), saved: Date.now(), ...extra };
    s.setItem(KEY, JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}

export function readAll() {
  const s = store();
  if (!s) return {};
  try { return JSON.parse(s.getItem(KEY) || "{}") || {}; }
  catch (e) { return {}; }
}

/* --- the course library ------------------------------------------------------
 * Separate from the board store, because a course is not a board and saving one
 * under a board's name would be an easy thing to do by accident. A saved course
 * is a LIST OF PLACEMENTS, never a built grid -- so a board corrected later
 * corrects every saved course it appears in, which is the point.
 */

const COURSE_KEY = "pumarally_courses_v1";

/** `extra` rides along with the document: a flattened course keeps its one board here as `board` (JSON text). */
export function saveCourse(id, doc, extra = {}) {
  const s = store();
  if (!s) return false;
  try {
    const all = readCourses();
    all[id] = { doc, saved: Date.now(), ...extra };
    s.setItem(COURSE_KEY, JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}

export function readCourses() {
  const s = store();
  if (!s) return {};
  try { return JSON.parse(s.getItem(COURSE_KEY) || "{}") || {}; }
  catch (e) { return {}; }
}

export function removeCourse(id) {
  const s = store();
  if (!s) return false;
  try {
    const all = readCourses();
    delete all[id];
    s.setItem(COURSE_KEY, JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}

export function removeLocal(id) {
  const s = store();
  if (!s) return false;
  try {
    const all = readAll();
    delete all[id];
    s.setItem(KEY, JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}
