/* Composing a board into an SVG string.
 *
 * EMITS A STRING, not DOM. That is what lets CI render every board in Node and
 * diff it against a checked-in snapshot -- a renderer nothing has ever looked
 * at is as untrustworthy as a check nothing has ever watched fail, and a
 * snapshot is the cheapest form of looking.
 *
 * The board is drawn in cell units of 100 and scaled by the viewBox, so nothing
 * in here does pixel arithmetic and the same string serves a thumbnail and a
 * full-screen editor.
 */

import { CELL, ART, MARK, markStroke, haloStroke, esc } from "./theme.js";
import { GLYPHS, DEVICE_GLYPHS, siteOverlay } from "./glyphs.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { ARM_CODES } from "../lib/token.js";
import {
  idx, inBoard, isVoid, cellAt, elementAt, levelAt, deviceCell, laserPath, siteList
} from "../lib/board.js";
import { EDGE_WALL, EDGE_DOOR, edgeId } from "../lib/edges.js";
import { isLedge } from "../lib/levels.js";
import { dirOfChar, N, E, S, W } from "../lib/dir.js";
import { ARG_DIR } from "../rulesets/elements.js";

const DEFAULTS = { mode: "art", pad: 0, coords: false, background: true };

const g = (transform, body) => '<g transform="' + transform + '">' + body + "</g>";
const at = (c, r) => "translate(" + c * CELL + "," + r * CELL + ")";
const spin = d => (d ? " rotate(" + d * 90 + " 50 50)" : "");

function groundLayer(board, mode) {
  let out = "";
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const tok = cellAt(board, c, r);
      if (tok === "   ") continue;
      const def = ELEMENTS[tok.charAt(0)];
      if (!def) continue;
      const glyph = GLYPHS[def.key];
      /* Naming the gap beats drawing nothing. A missing markup glyph is
       * invisible precisely when it matters -- over a photograph, with nobody
       * looking at the play art -- so it is loud here rather than absent. */
      if (!glyph || typeof glyph[mode] !== "function") {
        throw new Error("no " + mode + " glyph for element " + def.key + " at (" + c + "," + r + ")");
      }
      const d = def.arg === ARG_DIR ? (dirOfChar(tok.charAt(1)) || 0) : 0;
      const ctx = { arg: tok.charAt(1), arms: ARM_CODES[tok.charAt(2)] || ARM_CODES["."], dir: d, c, r };
      const body = glyph[mode](ctx);
      if (!body) continue;
      out += g(at(c, r) + spin(d), body);
    }
  }
  return out;
}

/* Site markings, drawn over the squares they mark. Their own layer rather than
 * part of the ground glyph, because a square's markings are not what the square
 * IS -- and because more than one can sit on a square, which a single glyph
 * lookup has nowhere to put. */
function siteLayer(board, mode) {
  let out = "";
  for (const s of siteList(board)) {
    if (!inBoard(board, s.c, s.r)) continue;
    const body = siteOverlay(s.has, mode);
    if (body) out += g(at(s.c, s.r), body);
  }
  return out;
}

/** Levels: a digit in the corner of every raised square, and a line on every
 *  derived ledge. The ledge is drawn from the level difference rather than from
 *  stored data, so what is drawn is exactly what the rules will read. */
function levelLayer(board, mode) {
  if (!board.levels) return "";
  let marks = "", ledges = [];
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      if (isVoid(board, c, r)) continue;
      const lvl = levelAt(board, c, r);
      if (lvl) {
        const x = c * CELL + 12, y = r * CELL + 14;
        marks += '<text x="' + x + '" y="' + y + '" font-size="20" font-family="ui-monospace,monospace"' +
          ' text-anchor="middle" dominant-baseline="central" stroke="' + MARK.halo +
          '" stroke-width="3.5" paint-order="stroke" fill="' + MARK.level + '">' + lvl + "</text>";
      }
      /* Only the north and west edges, so each ledge is drawn once. */
      if (isLedge(board, c, r, N)) ledges.push("M " + c * CELL + " " + r * CELL + " l " + CELL + " 0");
      if (isLedge(board, c, r, W)) ledges.push("M " + c * CELL + " " + r * CELL + " l 0 " + CELL);
    }
  }
  if (!ledges.length) return marks;
  const d = ledges.join(" ");
  return '<path d="' + d + '" ' + haloStroke() + "/>" +
         '<path d="' + d + '" ' + markStroke(MARK.level, 2.4) + ' stroke-dasharray="9 5"/>' + marks;
}

function wallLayer(board, mode) {
  const walls = [], doors = [];
  for (let r = 0; r <= board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const code = board.wallH[r * board.w + c];
      if (!code) continue;
      (code === EDGE_DOOR ? doors : walls).push("M " + c * CELL + " " + r * CELL + " l " + CELL + " 0");
    }
  }
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c <= board.w; c++) {
      const code = board.wallV[r * (board.w + 1) + c];
      if (!code) continue;
      (code === EDGE_DOOR ? doors : walls).push("M " + c * CELL + " " + r * CELL + " l 0 " + CELL);
    }
  }
  let out = "";
  if (mode === "art") {
    if (walls.length) {
      const d = walls.join(" ");
      out += '<path d="' + d + '" fill="none" stroke="' + ART.wallShadow +
        '" stroke-width="16" stroke-linecap="round" opacity="0.55" transform="translate(3,3)"/>';
      out += '<path d="' + d + '" fill="none" stroke="' + ART.wall + '" stroke-width="12" stroke-linecap="round"/>';
      out += '<path d="' + d + '" fill="none" stroke="' + ART.wallTop + '" stroke-width="4" stroke-linecap="round"/>';
    }
    if (doors.length) {
      out += '<path d="' + doors.join(" ") + '" fill="none" stroke="' + ART.door +
        '" stroke-width="10" stroke-linecap="round" stroke-dasharray="16 10"/>';
    }
  } else {
    if (walls.length) {
      const d = walls.join(" ");
      out += '<path d="' + d + '" ' + haloStroke() + "/>";
      out += '<path d="' + d + '" ' + markStroke(MARK.wall, 2.6) + "/>";
    }
    if (doors.length) {
      const d = doors.join(" ");
      out += '<path d="' + d + '" ' + haloStroke() + "/>";
      out += '<path d="' + d + '" ' + markStroke(MARK.door, 2.6) + ' stroke-dasharray="10 7"/>';
    }
  }
  return out;
}

function beamLayer(board, mode) {
  let out = "";
  for (const dev of board.wallDevices) {
    if (dev.kind !== "laser") continue;
    const path = laserPath(board, dev);
    if (path.length < 2) continue;
    const a = path[0], b = path[path.length - 1];
    const d = "M " + (a[0] * CELL + 50) + " " + (a[1] * CELL + 50) +
              " L " + (b[0] * CELL + 50) + " " + (b[1] * CELL + 50);
    if (mode === "art") {
      out += '<path d="' + d + '" stroke="' + ART.laser + '" stroke-width="' + (2 + dev.damage * 2) +
        '" stroke-linecap="round" opacity="0.45"/>';
    } else {
      out += '<path d="' + d + '" ' + markStroke(MARK.device, 1.0) + ' stroke-dasharray="5 6" opacity="0.9"/>';
    }
  }
  return out;
}

function deviceLayer(board, mode) {
  let out = "";
  for (const dev of board.wallDevices) {
    const def = DEVICE_KINDS[dev.kind];
    const glyph = DEVICE_GLYPHS[dev.kind];
    if (!def) continue;
    if (!glyph || typeof glyph[mode] !== "function") {
      throw new Error("no " + mode + " glyph for device " + dev.kind);
    }
    const ctx = { regs: dev.regs, damage: dev.damage, reach: dev.reach === undefined ? 1 : dev.reach };
    if (def.faced) {
      const cell = deviceCell(dev);
      if (!cell || !inBoard(board, cell[0], cell[1])) continue;
      out += g(at(cell[0], cell[1]) + spin(dev.face), glyph[mode](ctx));
    } else {
      /* A door has no face, so it is drawn along the edge it stands on: the
       * glyph draws along its own southern edge, so a horizontal edge is the
       * square above it and a vertical edge is a quarter-turn. */
      const e = dev.edge;
      if (e.kind === "h") {
        const c = e.c, r = e.r - 1;
        out += g(at(c, r), glyph[mode](ctx));
      } else {
        const c = e.c - 1, r = e.r;
        out += g(at(c, r) + " rotate(-90 50 50)", glyph[mode](ctx));
      }
    }
  }
  for (const dev of board.ceilingDevices) {
    const glyph = DEVICE_GLYPHS[dev.kind];
    if (!inBoard(board, dev.c, dev.r)) continue;
    if (!glyph || typeof glyph[mode] !== "function") {
      throw new Error("no " + mode + " glyph for ceiling device " + dev.kind);
    }
    out += g(at(dev.c, dev.r), glyph[mode]({ regs: dev.regs }));
  }
  return out;
}

function coordLayer(board) {
  let out = "";
  for (let c = 0; c < board.w; c++) {
    out += '<text x="' + (c * CELL + 50) + '" y="-14" font-size="26" fill="' + ART.dim +
      '" text-anchor="middle" font-family="ui-monospace,monospace">' + c + "</text>";
  }
  for (let r = 0; r < board.h; r++) {
    out += '<text x="-14" y="' + (r * CELL + 50) + '" font-size="26" fill="' + ART.dim +
      '" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace,monospace">' + r + "</text>";
  }
  return out;
}

/**
 * A board as an SVG string.
 * `mode` is "art" (solid, for play) or "markup" (thin bright line work, for
 * tracing over a photograph).
 */
export function boardSVG(board, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const m = o.coords ? 40 : o.pad;
  const w = board.w * CELL, h = board.h * CELL;
  const body =
    (o.background && o.mode === "art"
      ? '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#0b0d14"/>' : "") +
    groundLayer(board, o.mode) +
    siteLayer(board, o.mode) +
    wallLayer(board, o.mode) +
    beamLayer(board, o.mode) +
    deviceLayer(board, o.mode) +
    levelLayer(board, o.mode) +
    (o.coords ? coordLayer(board) : "");

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-m) + " " + (-m) + " " +
    (w + m * 2) + " " + (h + m * 2) + '" width="100%" preserveAspectRatio="xMidYMid meet"' +
    ' data-board="' + esc(board.id) + '" data-mode="' + o.mode + '">' + body + "</svg>";
}
