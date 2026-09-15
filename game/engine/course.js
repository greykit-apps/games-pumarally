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
import { beltTurn, tokenBeltSpeed } from "../../editor/lib/token.js";
import { firesIn } from "../../editor/lib/registers.js";
import { DC, DR, opposite } from "../../editor/lib/dir.js";

const cache = new Map();

/** Build (or fetch from the cache) the course a state plays on. */
export function courseOf(st, library) {
  const key = JSON.stringify(st.course);
  let C = cache.get(key);
  if (C) return C;
  C = buildCourse(st.course, library);
  cache.set(key, C);
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
  return { id: doc.id, w: grid.w, h: grid.h, grid, from, bounds, flags, docks, lasers, jets, key: JSON.stringify(doc) };
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
