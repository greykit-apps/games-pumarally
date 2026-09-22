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
import { ART_DEFS, PALETTE_CSS, ART_CSS, STAMP_CSS, SPOT_CSS, TOKENS } from "./palette.js";
import { GLYPHS, DEVICE_GLYPHS, siteOverlay, floorArt, stampArt } from "./glyphs.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { SITES } from "../rulesets/sites.js";
import { ARM_CODES } from "../lib/token.js";
import {
  idx, inBoard, isVoid, cellAt, elementAt, levelAt, deviceCell, laserPath, siteList
} from "../lib/board.js";
import { EDGE_WALL, EDGE_DOOR, edgeId } from "../lib/edges.js";
import { isLedge, levelStep, rampsOf } from "../lib/levels.js";
import { rampOn, wallAt, EDGE_NONE } from "../lib/edges.js";
import { rampEdgeSvg } from "./art.js";
import { dirOfChar, DC, DR, N, E, S, W } from "../lib/dir.js";
import { ARG_DIR } from "../rulesets/elements.js";

/* `sites`: which edition's markings to draw -- "all" for the workshop, where
 * a square shows everything printed on it, or a ruleset id for play, where
 * the wrench a 2016 game never reads and the battery a classic one never
 * reads are left off. `flagspots`: whether to draw where a flag MAY go; the
 * game hides them, since the course has already said where the flags ARE. */
const DEFAULTS = { mode: "art", pad: 0, coords: false, background: true, sites: "all", flagspots: true };

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
      /* pits are drawn as one layer, so neighbouring pits become one hole */
      if (mode === "art" && def.key === "pit") continue;
      const body = glyph[mode](ctx);
      if (!body) continue;
      /* the floor first, unrotated, then the element standing on it */
      if (mode === "art" && def.key !== "floor") out += g(at(c, r), floorArt());
      out += g(at(c, r) + spin(d), body);
    }
  }
  return out;
}

/* PITS ARE HOLES IN THE FLOOR, and a run of them is one hole. Each pit square
 * is painted black edge to edge, and the barricade rim -- the printed board's
 * dimmed hazard stripe -- runs only along the sides that meet floor, so two
 * pits side by side share one open hole with a rim round the outside. A
 * lighter band under the northern rim gives the hole its far wall. */
const RIM = 9;
function pitLayer(board) {
  const isPit = (c, r) => inBoard(board, c, r) && !isVoid(board, c, r) &&
    (elementAt(board, c, r) || {}).key === "pit";
  let holes = "", rims = "", walls = "";
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      if (!isPit(c, r)) continue;
      const x = c * CELL, y = r * CELL;
      holes += '<rect x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + CELL + '"/>';
      const open = { n: isPit(c, r - 1), e: isPit(c + 1, r), s: isPit(c, r + 1), w: isPit(c - 1, r) };
      if (!open.n) { rims += '<rect x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + RIM + '"/>';
                     walls += '<rect x="' + (x + (open.w ? 0 : RIM)) + '" y="' + (y + RIM) + '" width="' + (CELL - (open.w ? 0 : RIM) - (open.e ? 0 : RIM)) + '" height="14"/>'; }
      if (!open.s) rims += '<rect x="' + x + '" y="' + (y + CELL - RIM) + '" width="' + CELL + '" height="' + RIM + '"/>';
      if (!open.w) rims += '<rect x="' + x + '" y="' + y + '" width="' + RIM + '" height="' + CELL + '"/>';
      if (!open.e) rims += '<rect x="' + (x + CELL - RIM) + '" y="' + y + '" width="' + RIM + '" height="' + CELL + '"/>';
    }
  }
  if (!holes) return "";
  return '<g class="pr-art pr-pits"><g fill="' + ART.pit + '">' + holes + "</g>" +
    '<g fill="#1a2030" opacity="0.55">' + walls + "</g>" +
    '<g fill="url(#pr-hz)" opacity="0.42">' + rims + "</g></g>";
}

/* Site markings, drawn over the squares they mark. Their own layer rather than
 * part of the ground glyph, because a square's markings are not what the square
 * IS -- and because more than one can sit on a square, which a single glyph
 * lookup has nowhere to put. */
function siteLayer(board, mode, o) {
  let out = "";
  for (const s of siteList(board)) {
    if (!inBoard(board, s.c, s.r)) continue;
    const body = siteOverlay(sitesShown(s.has, o), mode);
    if (body) out += g(at(s.c, s.r), body);
  }
  return out;
}

/** The markings of a square that the drawing's options let through. */
export function sitesShown(has, o) {
  return (has || []).filter(k => {
    if (k === "flagspot") return o.flagspots !== false;
    const def = SITES[k];
    return !o.sites || o.sites === "all" || !def || def.printedIn.includes(o.sites);
  });
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
        /* SIGNED, and always with its sign. A bare "1" cannot say whether the
         * square is a level up or a level down, and a board may now be both --
         * the base floor is 0 and a sunken channel is negative. Two characters
         * wide either way, so the corner does not jump about. */
        const label = (lvl > 0 ? "+" : "\u2212") + Math.abs(lvl);
        const x = c * CELL + 17, y = r * CELL + 14;
        marks += '<text x="' + x + '" y="' + y + '" font-size="20" font-family="ui-monospace,monospace"' +
          ' text-anchor="middle" dominant-baseline="central" stroke="' + MARK.halo +
          '" stroke-width="3.5" paint-order="stroke" fill="' + MARK.level + '">' + label + "</text>";
      }
      /* Only the north and west edges, so each ledge is drawn once. A ramp
       * across the edge is drawn as a ramp instead, below. */
      if (isLedge(board, c, r, N) && !rampOn(board, c, r, N)) ledges.push("M " + c * CELL + " " + r * CELL + " l " + CELL + " 0");
      if (isLedge(board, c, r, W) && !rampOn(board, c, r, W)) ledges.push("M " + c * CELL + " " + r * CELL + " l 0 " + CELL);
    }
  }
  if (mode === "art") return ledgeArt(board) + marks;
  if (!ledges.length) return marks;
  const d = ledges.join(" ");
  return '<path d="' + d + '" ' + haloStroke() + "/>" +
         '<path d="' + d + '" ' + markStroke(MARK.level, 2.4) + ' stroke-dasharray="9 5"/>' + marks;
}

/* THE PLAY ART DRAWS A LEDGE AS A WALL WITH A FACE UNDER IT. The rim of a
 * block of squares at one level is a lip of the same concrete the walls are
 * made of, a little thinner, and on the LOWER side of it a shaded trapezoid
 * runs along the edge: the face of the step, its ends cut at the diagonals so
 * the faces round a block meet at the corners. Drawing the face on the lower
 * side is what makes the same rule read both ways -- a raised block wears its
 * faces outside itself and stands up off the floor, a sunken one wears them
 * inside and drops into it. A ramp edge and a walled edge are left to the ramp
 * and the wall; the markup view keeps its dashed line, which sits better over
 * a photograph. */
const LIP = CELL * 0.12;
function ledgeArt(board) {
  let lips = "", faces = "";
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      if (isVoid(board, c, r)) continue;
      for (const d of [N, E, S, W]) {
        /* once per edge, from its lower square */
        const step = levelStep(board, c, r, d);
        if (step <= 0 || !isLedge(board, c, r, d) || rampOn(board, c, r, d) || wallAt(board, c, r, d) !== EDGE_NONE) continue;
        const depth = Math.min(26, 14 + 6 * (step - 1));
        /* lit concrete fading into the floor: a face catching the light,
         * which on this dark floor reads better than a shadow would */
        faces += g(at(c, r) + spin(d), '<path d="M 0 0 H ' + CELL + " L " + (CELL - depth) + " " + depth + " H " + depth + ' Z" fill="url(#pr-ledgeface)"/>');
        const x = c * CELL + (d === E ? CELL : 0), y = r * CELL + (d === S ? CELL : 0);
        lips += d === N || d === S
          ? '<rect class="pr-ledge" x="' + c * CELL + '" y="' + (y - LIP / 2) + '" width="' + CELL + '" height="' + LIP + '" fill="url(#pr-concrete-h)" filter="url(#pr-wallshadow)"/>'
          : '<rect class="pr-ledge" x="' + (x - LIP / 2) + '" y="' + r * CELL + '" width="' + LIP + '" height="' + CELL + '" fill="url(#pr-concrete-v)" filter="url(#pr-wallshadow)"/>';
      }
    }
  }
  return faces + lips;
}

/** Ramps: drawn on the foot square of each ramp edge, climbing toward the
 *  edge. A ramp between two squares at one level has no foot and is left to
 *  the validator, which refuses it. */
function rampLayer(board, mode) {
  let out = "";
  for (const ramp of rampsOf(board)) {
    if (!ramp.foot) continue;
    const { c, r } = ramp.foot;
    if (mode === "art") { out += g(at(c, r), rampEdgeSvg(ramp.dir)); continue; }
    /* markup: the same trapezoid as the art, outlined, with a chevron in it
     * pointing up the ramp -- the ledge's dash is left off that edge, and
     * two ramps on neighbouring sides meet along the diagonal as a corner */
    const d = "M 1 1 L 99 1 L 72 28 L 28 28 Z M 41 22 L 50 8 L 59 22";
    const body = '<g transform="rotate(' + (ramp.dir * 90) + ' 50 50)">' +
      '<path d="' + d + '" ' + haloStroke() + "/>" +
      '<path d="' + d + '" ' + markStroke(MARK.level, 2) + "/></g>";
    out += g(at(c, r), body);
  }
  return out;
}

/* WALLS ARE CONCRETE, and the thickness is the game's: 0.19 of a tile, centred
 * on the edge so half lies in each square. A wall is not a property of a square,
 * it is the edge between two of them, and it exists equally from both sides.
 *
 * The game draws these as absolutely-positioned divs with CSS gradients; an SVG
 * cannot take a gradient the same way, so they are bars filled from a linear
 * gradient of the same stops, with the shadow as a filter. A wall you can see
 * standing up is a wall you do not try to drive through -- the depth is the
 * whole reason for the shadow.
 *
 * NOT hazard striped, deliberately: in this art language stripes mean "this
 * will move or swallow you", and a wall is the one thing that will not.
 */
const WT = CELL * 0.19;

function wallLayer(board, mode) {
  const bars = [], doors = [];
  const push = (list, x, y, w, h, vertical) => list.push({ x, y, w, h, vertical });
  for (let r = 0; r <= board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const code = board.wallH[r * board.w + c];
      if (!code) continue;
      push(code === EDGE_DOOR ? doors : bars, c * CELL, r * CELL - WT / 2, CELL, WT, false);
    }
  }
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c <= board.w; c++) {
      const code = board.wallV[r * (board.w + 1) + c];
      if (!code) continue;
      push(code === EDGE_DOOR ? doors : bars, c * CELL - WT / 2, r * CELL, WT, CELL, true);
    }
  }

  if (mode !== "art") {
    const path = b => "M " + b.x + " " + (b.y + b.h / 2) + " l " + (b.vertical ? 0 : b.w) + " " + (b.vertical ? b.h : 0);
    const wall = bars.map(b => "M " + (b.vertical ? b.x + b.w / 2 : b.x) + " " +
      (b.vertical ? b.y : b.y + b.h / 2) + " l " + (b.vertical ? 0 : b.w) + " " + (b.vertical ? b.h : 0)).join(" ");
    const door = doors.map(b => "M " + (b.vertical ? b.x + b.w / 2 : b.x) + " " +
      (b.vertical ? b.y : b.y + b.h / 2) + " l " + (b.vertical ? 0 : b.w) + " " + (b.vertical ? b.h : 0)).join(" ");
    let out = "";
    if (wall) out += '<path d="' + wall + '" ' + haloStroke() + "/>" +
      '<path d="' + wall + '" ' + markStroke(MARK.wall, 2.6) + "/>";
    if (door) out += '<path d="' + door + '" ' + haloStroke() + "/>" +
      '<path d="' + door + '" ' + markStroke(MARK.door, 2.6) + ' stroke-dasharray="10 7"/>';
    return out;
  }

  let out = "";
  for (const b of bars) {
    out += '<rect class="pr-wall" x="' + b.x + '" y="' + b.y + '" width="' + b.w +
      '" height="' + b.h + '" fill="url(#pr-concrete-' + (b.vertical ? "v" : "h") +
      ')" filter="url(#pr-wallshadow)"/>';
  }
  for (const b of doors) {
    out += '<rect class="pr-doorbar" x="' + b.x + '" y="' + b.y + '" width="' + b.w +
      '" height="' + b.h + '"/>';
  }
  return out;
}

/* A beam runs from the emitter on its wall to the far side of the last square
 * it lights: the whole way across every square it covers, never centre to
 * centre, and a laser walled in on its firing side still shows a beam across
 * its own square. Lasers are always on, and the beam is what says so. */
function beamLayer(board, mode) {
  let out = "";
  for (const dev of board.wallDevices) {
    if (dev.kind !== "laser") continue;
    const path = laserPath(board, dev);
    if (!path.length) continue;
    const a = path[0], b = path[path.length - 1];
    const dx = DC[dev.face] * 50, dy = DR[dev.face] * 50;
    const x0 = a[0] * CELL + 50 - dx, y0 = a[1] * CELL + 50 - dy;      // the emitter's wall
    const x1 = b[0] * CELL + 50 + dx, y1 = b[1] * CELL + 50 + dy;      // the far side of the last square
    const d = "M " + x0 + " " + y0 + " L " + x1 + " " + y1;
    if (mode === "art") {
      /* a soft glow under a thin bright core, one core per point of damage */
      out += '<path d="' + d + '" stroke="' + ART.laser + '" stroke-width="' + (8 + dev.damage * 3) +
        '" stroke-linecap="butt" opacity="0.14"/>';
      const n = Math.max(1, Math.min(3, dev.damage | 0));
      const dir = dev.face, across = (dir === N || dir === S) ? [1, 0] : [0, 1];
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 5;
        const ox = across[0] * off, oy = across[1] * off;
        out += '<path d="M ' + (x0 + ox) + " " + (y0 + oy) + " L " + (x1 + ox) + " " + (y1 + oy) + '" stroke="' + ART.laser +
          '" stroke-width="2.2" stroke-linecap="butt" opacity="0.8"/>';
      }
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
      /* the register stamp stays upright in the square's corner, whichever way the device points */
      if (mode === "art") out += g(at(cell[0], cell[1]), stampArt(dev.regs));
    } else {
      /* A door has no face, so it is drawn along the edge it stands on: the
       * glyph draws along its own southern edge, so a horizontal edge is the
       * square above it and a vertical edge is a quarter-turn. */
      const e = dev.edge;
      /* A door on the top or left rim has no square above or left of it, so it
       * is drawn in the square below or right, turned to sit on the far side;
       * otherwise the glyph landed at row -1 and fell off the canvas. */
      let sc, sr;
      if (e.kind === "h") {
        const c = e.c, r = e.r - 1;
        out += r < 0 ? g(at(c, 0) + " rotate(180 50 50)", glyph[mode](ctx))
                     : g(at(c, r), glyph[mode](ctx));
        sc = c; sr = r < 0 ? 0 : r;
      } else {
        const c = e.c - 1, r = e.r;
        out += c < 0 ? g(at(0, r) + " rotate(90 50 50)", glyph[mode](ctx))
                     : g(at(c, r) + " rotate(-90 50 50)", glyph[mode](ctx));
        sc = c < 0 ? 0 : c; sr = r;
      }
      if (mode === "art") out += g(at(sc, sr), stampArt(dev.regs));
    }
  }
  for (const dev of board.ceilingDevices) {
    const glyph = DEVICE_GLYPHS[dev.kind];
    if (!inBoard(board, dev.c, dev.r)) continue;
    if (!glyph || typeof glyph[mode] !== "function") {
      throw new Error("no " + mode + " glyph for ceiling device " + dev.kind);
    }
    out += g(at(dev.c, dev.r), glyph[mode]({ regs: dev.regs }));
    if (mode === "art") out += g(at(dev.c, dev.r), stampArt(dev.regs));
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
      ? '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + TOKENS.floor + '"/>' : "") +
    groundLayer(board, o.mode) +
    (o.mode === "art" ? pitLayer(board) : "") +
    siteLayer(board, o.mode, o) +
    wallLayer(board, o.mode) +
    beamLayer(board, o.mode) +
    deviceLayer(board, o.mode) +
    levelLayer(board, o.mode) +
    rampLayer(board, o.mode) +
    (o.coords ? coordLayer(board) : "");

  /* The palette and the art's stylesheet travel WITH the drawing. The art is
   * class-based and the palette drives it, so an SVG that carried the shapes
   * without the rules would come out as unfilled outlines -- and shipping them
   * together is what lets a board render identically in the editor, in a
   * snapshot, and anywhere else the string is dropped. */
  const style = "<style>" + PALETTE_CSS + ART_CSS + STAMP_CSS + SPOT_CSS +
    ".pr-doorbar{fill:none;stroke:var(--pr-warn);stroke-width:4;stroke-dasharray:14 9}" +
    "</style>";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-m) + " " + (-m) + " " +
    (w + m * 2) + " " + (h + m * 2) + '" width="100%" preserveAspectRatio="xMidYMid meet"' +
    ' data-board="' + esc(board.id) + '" data-mode="' + o.mode + '">' +
    style + ART_DEFS + body + "</svg>";
}
