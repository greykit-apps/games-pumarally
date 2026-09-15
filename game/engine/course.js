/* The built course: the assembled grid plus the lists the rules walk.
 *
 * DERIVED, NEVER STORED. The save carries the PRCourse document and nothing
 * else about the course; this is rebuilt from it on demand and cached by its
 * text, so a board corrected later corrects every saved game that lays it.
 * The old game kept a built grid on a UI object, which is how a save could
 * only be resumed by the process that made it.
 */
import { assemble } from "../../editor/lib/course.js";
import {
  inBoard, isVoid, propAt, cellAt, beltDir, docksOf, wallDevicesAt, ceilingAt,
  deviceCell, blockedAt, laserPath
} from "../../editor/lib/board.js";
import { beltTurn, tokenBeltSpeed, tokenElement } from "../../editor/lib/token.js";
import { firesIn } from "../../editor/lib/registers.js";
import { levelAt } from "../../editor/lib/board.js";
import { rampDir, rampCrosses } from "../../editor/lib/levels.js";
import { DC, DR, opposite } from "../../editor/lib/dir.js";

/* keyed on the LIBRARY as well as the document: two courses with the same
 * placements over different boards are different courses, and a cache that
 * read only the document handed one test's board to the next */
const cache = new WeakMap();

/** Build (or fetch from the cache) the course a state plays on. */
export function courseOf(st, library) {
  let byDoc = cache.get(library);
  if (!byDoc) { byDoc = new Map(); cache.set(library, byDoc); }
  const key = JSON.stringify(st.course);
  let C = byDoc.get(key);
  if (C) return C;
  C = buildCourse(st.course, library);
  byDoc.set(key, C);
  return C;
}

export function buildCourse(doc, library) {
  const { grid, from, bounds } = assemble(doc, library);
  const flags = (doc.flags || []).map(([c, r], i) => ({ c, r, n: i + 1 }));
  const docks = docksOf(grid).sort((a, b) => a.n - b.n);
  const lasers = grid.wallDevices.filter(d => d.kind === "laser").map(d => {
    const cell = deviceCell(d);
    return { c: cell[0], r: cell[1], dir: d.face, damage: d.damage || 1, dev: d };
  });
  const jets = grid.wallDevices.filter(d => d.kind === "jet").map(d => {
    const cell = deviceCell(d);
    const squares = [];
    for (let i = 0; i < (d.reach || 1); i++) squares.push([cell[0] + DC[d.face] * i, cell[1] + DR[d.face] * i]);
    return { squares, regs: d.regs || null };
  });
  /* Portals pair by colour WITHIN A BOARD: a course stamped from two copies
   * of board G carries two violet pairs, and each robot comes out on the
   * board it went in on. The validator has already refused a colour that is
   * not exactly two on its board, so anything unpaired here is left dead. */
  const portals = new Map();
  const byColour = new Map();
  for (let r = 0; r < grid.h; r++) {
    for (let c = 0; c < grid.w; c++) {
      const tok = cellAt(grid, c, r);
      const def = tokenElement(tok);
      if (!def || !def.props.portal) continue;
      const key = from[r * grid.w + c] + ":" + tok.charAt(1);
      if (!byColour.has(key)) byColour.set(key, []);
      byColour.get(key).push([c, r]);
    }
  }
  for (const ends of byColour.values()) {
    if (ends.length !== 2) continue;
    portals.set(ends[0].join(","), ends[1]);
    portals.set(ends[1].join(","), ends[0]);
  }
  return { id: doc.id, w: grid.w, h: grid.h, grid, from, bounds, flags, docks, lasers, jets, portals, key: JSON.stringify(doc) };
}

/* --- square questions ------------------------------------------------------- */

export function isHole(C, c, r) {
  return !inBoard(C.grid, c, r) || isVoid(C.grid, c, r) || !!propAt(C.grid, c, r, "pit");
}

export function inGrid(C, c, r) { return inBoard(C.grid, c, r) && !isVoid(C.grid, c, r); }

/** Belt speed at a square: 0, 1 or 2. */
export function beltAt(C, c, r) {
  if (!inBoard(C.grid, c, r)) return 0;
  return tokenBeltSpeed(cellAt(C.grid, c, r)) || 0;
}

export function beltExit(C, c, r) { return beltDir(C.grid, c, r); }

/** The quarter-turn a belt at (c,r) gives a robot carried in travelling `dir`. */
export function beltTurnFor(C, c, r, dir) {
  const tok = cellAt(C.grid, c, r);
  const exit = beltDir(C.grid, c, r);
  if (exit === undefined) return 0;
  const t = beltTurn(tok, exit, opposite(dir));
  return t === null ? 0 : t;
}

export function gearAt(C, c, r) { return propAt(C.grid, c, r, "gear") || 0; }
export function repairAt(C, c, r) { return propAt(C.grid, c, r, "repair") || 0; }
export function optionSiteAt(C, c, r) { return !!propAt(C.grid, c, r, "option"); }
export function energyAt(C, c, r) { return propAt(C.grid, c, r, "energy") || 0; }
export function oilAt(C, c, r) { return !!propAt(C.grid, c, r, "oil"); }
export function waterAt(C, c, r) { return !!propAt(C.grid, c, r, "water"); }
export function currentAt(C, c, r) { return !!propAt(C.grid, c, r, "current"); }
export function randomizerAt(C, c, r) { return !!propAt(C.grid, c, r, "randomize"); }
export function teleporterAt(C, c, r) { return !!propAt(C.grid, c, r, "teleport"); }

/* --- Wet and Wild's levels (manual1/IMG_1236): a ledge is any edge whose two
 * squares differ in level, and a ramp is the one square that spans one ------ */
export function levelOf(C, c, r) { return inBoard(C.grid, c, r) ? levelAt(C.grid, c, r) : 0; }
/** Levels climbed (positive) or dropped (negative) stepping from (c,r) in `dir`; 0 off the grid. */
export function levelStepAt(C, c, r, dir) {
  const [nc, nr] = [c + DC[dir], r + DR[dir]];
  if (!inBoard(C.grid, nc, nr)) return 0;
  return levelOf(C, nc, nr) - levelOf(C, c, r);
}
/** Is this level change crossed by a ramp, so it is a slope and not a cliff? */
export function rampBetween(C, c, r, dir) { return rampCrosses(C.grid, c, r, dir); }
/** The uphill direction of the ramp at (c,r), or undefined. */
export function rampAt(C, c, r) { return rampDir(C.grid, c, r); }

/** A Thrills and Spills flamer over (c,r), active this 0-based register. */
export function flamerFires(C, c, r, register) {
  return ceilingAt(C.grid, c, r, "flamer").some(d => firesIn(d.regs || null, (register | 0) + 1));
}

/** The other end of the portal at (c,r), as [c, r], or null when the square is not a paired portal. */
export function portalTwin(C, c, r) { return C.portals.get(c + "," + r) || null; }

/** A wall or a shut door between (c,r) and its neighbour in `dir`; register is 0-based. */
export function wallBlocks(C, c, r, dir, register) {
  return blockedAt(C.grid, c, r, dir, (register | 0) + 1);
}

/** The pusher standing in a square, with the direction it shoves, or null. */
export function pusherAt(C, c, r, register) {
  const devs = wallDevicesAt(C.grid, c, r, "pusher");
  if (!devs.length) return null;
  const d = devs[0];
  if (!firesIn(d.regs || null, (register | 0) + 1)) return null;
  return { dir: d.face };
}

export function crusherFires(C, c, r, register) {
  return ceilingAt(C.grid, c, r, "crusher").some(d => firesIn(d.regs || null, (register | 0) + 1));
}

export function jetFires(C, c, r, register) {
  return C.jets.some(j => firesIn(j.regs, (register | 0) + 1) && j.squares.some(([sc, sr]) => sc === c && sr === r));
}

/** The squares a board laser lights this register, nearest first (0-based register). */
export function laserSquares(C, L, register) {
  return laserPath(C.grid, L.dev, (register | 0) + 1);
}

export function flagAt(C, c, r) {
  return C.flags.find(f => f.c === c && f.r === r) || null;
}
