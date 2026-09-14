/* Drawing the board, and turning a pointer into a square.
 *
 * The board is rendered to a STRING and injected, and the whole thing is drawn
 * at one size and then CSS-transformed for zoom. Hit testing reads
 * getBoundingClientRect, which is post-transform, so nothing that aims at a
 * square has to know what the zoom is.
 *
 * WYSIWYG: this calls the same boardSVG the snapshot check and any future game
 * call. There is no second renderer to drift.
 */

import { boardSVG } from "../render/svg.js";
import { CELL } from "../render/theme.js";
import { inBoard } from "../lib/board.js";
import { N, E, S, W } from "../lib/dir.js";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;

/** How close to an edge a click has to be to mean that edge rather than the square. */
export const EDGE_BAND = 0.22;

export function makeView(root) {
  const viewport = root.querySelector(".viewport");
  const world = root.querySelector(".world");
  const boardEl = root.querySelector(".board");
  const photoEl = root.querySelector(".photo");
  const ghost = root.querySelector(".ghost");
  return { root, viewport, world, boardEl, photoEl, ghost };
}

/** Redraw the board. Called on every settled edit, not on every pointer move. */
export function draw(view, st) {
  const { board } = st;
  const w = board.w * CELL, h = board.h * CELL;
  view.boardEl.style.width = w + "px";
  view.boardEl.style.height = h + "px";
  view.boardEl.innerHTML = boardSVG(board, { mode: st.mode, background: st.mode === "art" && !st.photo });
  layout(view, st);
}

/** Position the world and the reference photograph. */
export function layout(view, st) {
  view.world.style.transform =
    "translate(" + st.offX + "px," + st.offY + "px) scale(" + st.zoom + ")";
  const p = st.photo;
  if (!p) {
    view.photoEl.style.display = "none";
    view.boardEl.style.opacity = "1";
    return;
  }
  view.photoEl.style.display = "";
  view.photoEl.src = p.url;
  view.photoEl.style.opacity = String(p.solo ? 1 : p.opacity);
  view.photoEl.style.width = (st.board.w * CELL * p.scale) + "px";
  view.photoEl.style.transform = "translate(" + p.dx + "px," + p.dy + "px)";
  /* Photo-only is a FLIP, not a fade to nothing: a 50/50 blend is the hardest
   * way to compare two pictures, and the useful question is almost always
   * "what does the print say here", asked for a second. */
  view.boardEl.style.opacity = p.solo ? "0" : "1";
}

/** Fit the board to the viewport. */
export function fit(view, st) {
  const r = view.viewport.getBoundingClientRect();
  const w = st.board.w * CELL, h = st.board.h * CELL;
  if (!r.width || !r.height) return;
  const pad = 24;
  st.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
    Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h)));
  st.offX = (r.width - w * st.zoom) / 2;
  st.offY = (r.height - h * st.zoom) / 2;
  layout(view, st);
}

/** Zoom about a point in viewport coordinates, keeping that point still. */
export function zoomAbout(view, st, factor, px, py) {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, st.zoom * factor));
  if (next === st.zoom) return;
  st.offX = px - (px - st.offX) * (next / st.zoom);
  st.offY = py - (py - st.offY) * (next / st.zoom);
  st.zoom = next;
  layout(view, st);
}

/**
 * Which square, and which of its edges, the pointer is over.
 * Returns {c, r, face, onEdge, inside} -- `face` is the nearest edge when the
 * pointer is in the band around one, so a run of walls can be laid by tracing
 * the seams; away from a seam `face` is null and the hand's own facing is used.
 */
export function hit(view, st, ev) {
  const r = view.boardEl.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const fx = (ev.clientX - r.left) / r.width * st.board.w;
  const fy = (ev.clientY - r.top) / r.height * st.board.h;
  const c = Math.floor(fx), rr = Math.floor(fy);
  const dx = fx - c, dy = fy - rr;

  let face = null, best = EDGE_BAND;
  if (dy < best) { best = dy; face = N; }
  if (1 - dy < best) { best = 1 - dy; face = S; }
  if (dx < best) { best = dx; face = W; }
  if (1 - dx < best) { best = 1 - dx; face = E; }

  return { c, r: rr, face, inside: inBoard(st.board, c, rr), fx, fy };
}

/** Where a square sits in viewport pixels, for the ghost and the error marks. */
export function cellRect(view, st, c, r) {
  const b = view.boardEl.getBoundingClientRect();
  const v = view.viewport.getBoundingClientRect();
  const s = b.width / st.board.w;
  return { x: b.left - v.left + c * s, y: b.top - v.top + r * s, size: s };
}

/** Move the hover ghost. Cheap: it is a div, not a re-render. */
export function showGhost(view, st, h, refused) {
  if (!h || !h.inside) { view.ghost.style.display = "none"; return; }
  const { x, y, size } = cellRect(view, st, h.c, h.r);
  const g = view.ghost;
  g.style.display = "";
  g.className = "ghost" + (refused ? " bad" : "") + (h.face !== null && st.edgeTool ? " edge" : "");
  if (h.face !== null && st.edgeTool) {
    const t = Math.max(2, size * 0.12);
    if (h.face === N) Object.assign(g.style, { left: x + "px", top: (y - t / 2) + "px", width: size + "px", height: t + "px" });
    else if (h.face === S) Object.assign(g.style, { left: x + "px", top: (y + size - t / 2) + "px", width: size + "px", height: t + "px" });
    else if (h.face === W) Object.assign(g.style, { left: (x - t / 2) + "px", top: y + "px", width: t + "px", height: size + "px" });
    else Object.assign(g.style, { left: (x + size - t / 2) + "px", top: y + "px", width: t + "px", height: size + "px" });
  } else {
    Object.assign(g.style, { left: x + "px", top: y + "px", width: size + "px", height: size + "px" });
  }
}

/** Highlight the squares diagnostics name. */
export function showMarks(view, st) {
  for (const el of view.viewport.querySelectorAll(".mark")) el.remove();
  const seen = new Set();
  for (const d of st.diagnostics) {
    const m = d.where && /^\((\d+),(\d+)\)$/.exec(d.where);
    if (!m) continue;
    const key = d.severity + m[1] + "," + m[2];
    if (seen.has(key)) continue;
    seen.add(key);
    const { x, y, size } = cellRect(view, st, +m[1], +m[2]);
    const el = document.createElement("div");
    el.className = "mark" + (d.severity === "warning" ? " warn" : "");
    Object.assign(el.style, { left: x + "px", top: y + "px", width: size + "px", height: size + "px" });
    view.viewport.appendChild(el);
  }
}
