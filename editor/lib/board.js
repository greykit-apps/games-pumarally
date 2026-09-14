/* The PRBoard model, and the conversion to and from a document.
 *
 * THE WORKING MODEL IS FLAT ARRAYS; the rows of characters exist only in the
 * file. Painting a square is an array store, undo is the three characters that
 * were there, and nothing in the editor ever re-slices a string.
 *
 * THE SCHEMA IS CLOSED. An unknown key is an error rather than being ignored,
 * which is what catches a `flags` array written into a board -- the old ASCII
 * format got that for free because there was no legend character for a flag,
 * and JSON would simply carry it and drop it.
 *
 * Shape checking lives HERE rather than in a separate pass because only the
 * parser can do it safely: a row that lost a character cannot be read for
 * meaning first and measured afterwards.
 */

import { VOID_TOKEN } from "../rulesets/elements.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { TOKEN_WIDTH, isVoidToken, tokenElement, tokenBeltSpeed } from "./token.js";
import { dirOfLetter, dirLetter, dirOfChar, N, E, S, W, DC, DR } from "./dir.js";
import {
  EDGE_NONE, EDGE_WALL, EDGE_DOOR, edgeCodeOf, edgeGlyph,
  edgeId, parseEdge, edgeOf, edgeIdOf, wallAt, isNormalOf, faceCell, edgeCodeAt
} from "./edges.js";

export const BOARD_FORMAT = "PRBoard";
export const BOARD_VERSION = 1;

/** The complete set of top-level keys. Anything else is an error. */
const BOARD_KEYS = new Set([
  "format", "version", "id", "name", "w", "h",
  "edition", "set", "origin", "unverified", "allowVoid", "notes",
  "ground", "wall", "ceiling"
]);

const WALL_DEVICE_KEYS = new Set(["kind", "edge", "face", "damage", "reach", "regs", "note"]);
const CEILING_DEVICE_KEYS = new Set(["kind", "at", "regs", "note"]);

export function idx(board, c, r) { return r * board.w + c; }

export function inBoard(board, c, r) {
  return c >= 0 && r >= 0 && c < board.w && r < board.h;
}

/** The 3-character token at a square, or the void token when off the board. */
export function cellAt(board, c, r) {
  return inBoard(board, c, r) ? board.cells[idx(board, c, r)] : VOID_TOKEN;
}

export function setCell(board, c, r, tok) {
  if (!inBoard(board, c, r)) return false;
  board.cells[idx(board, c, r)] = tok;
  return true;
}

export function isVoid(board, c, r) {
  return isVoidToken(cellAt(board, c, r));
}

/** Element definition at a square, or undefined for a void or unknown character. */
export function elementAt(board, c, r) {
  return tokenElement(cellAt(board, c, r));
}

/** A named behaviour property at a square, or undefined. */
export function propAt(board, c, r, name) {
  const def = elementAt(board, c, r);
  return def && def.props[name];
}

/** The exit direction of a belt at a square, or undefined when it is not a belt. */
export function beltDir(board, c, r) {
  const tok = cellAt(board, c, r);
  if (!tokenBeltSpeed(tok)) return undefined;
  return dirOfChar(tok.charAt(1));
}

/** The level of a square; 0 everywhere on a board that declares none. */
export function levelAt(board, c, r) {
  if (!board.levels || !inBoard(board, c, r)) return 0;
  return board.levels[idx(board, c, r)];
}

export function setLevel(board, c, r, n) {
  if (!inBoard(board, c, r)) return false;
  if (!board.levels) board.levels = new Uint8Array(board.w * board.h);
  board.levels[idx(board, c, r)] = n;
  return true;
}

/** Does this board use any level other than 0? Decides whether `levels` is written. */
export function hasLevels(board) {
  if (!board.levels) return false;
  for (let i = 0; i < board.levels.length; i++) if (board.levels[i]) return true;
  return false;
}

/* --- devices -------------------------------------------------------------- */

/** The square a wall device stands in. */
export function deviceCell(dev) {
  return faceCell(dev.edge, dev.face);
}

/** Wall devices standing in a square, optionally of one kind. */
export function wallDevicesAt(board, c, r, kind) {
  return board.wallDevices.filter(d => {
    if (kind && d.kind !== kind) return false;
    const cell = deviceCell(d);
    return cell && cell[0] === c && cell[1] === r;
  });
}

/** The door device on an edge, or undefined. */
export function doorOn(board, edge) {
  const id = edgeId(edge.kind, edge.c, edge.r);
  return board.wallDevices.find(d =>
    d.kind === "door" && edgeId(d.edge.kind, d.edge.c, d.edge.r) === id);
}

export function ceilingAt(board, c, r, kind) {
  return board.ceilingDevices.filter(d =>
    d.c === c && d.r === r && (!kind || d.kind === kind));
}

/**
 * Is movement out of (c,r) in direction d blocked in this register?
 * A wall always blocks. A door blocks unless it stands open in that register.
 * One function, so a mover and the validator cannot disagree about a door.
 */
export function blockedAt(board, c, r, d, register) {
  const edge = edgeOf(c, r, d);
  const code = edgeCodeAt(board, edge);
  if (code === EDGE_WALL) return true;
  if (code !== EDGE_DOOR) return false;
  const door = doorOn(board, edge);
  if (!door) return true;               // a 'D' with no device is refused by the validator
  return !(door.regs && door.regs.indexOf(register) >= 0);
}

/**
 * The squares a laser lights, nearest first. Shared with the renderer so the
 * drawn beam and the damaging beam are one list and cannot drift.
 *
 * Stops at a wall or a shut door, at the board edge, and AT A LEVEL CHANGE --
 * weapons and board lasers cannot hit a target on a different level.
 * `limit` guards a malformed board rather than a real one.
 */
export function laserPath(board, dev, register = 1) {
  const start = deviceCell(dev);
  if (!start) return [];
  const out = [];
  let [c, r] = start;
  const level0 = levelAt(board, c, r);
  const limit = board.w + board.h;
  for (let i = 0; i < limit; i++) {
    if (!inBoard(board, c, r) || isVoid(board, c, r)) break;
    if (levelAt(board, c, r) !== level0) break;
    out.push([c, r]);
    if (blockedAt(board, c, r, dev.face, register)) break;
    c += DC[dev.face];
    r += DR[dev.face];
  }
  return out;
}

/** Numbered docking bays, ascending. Derived from the `s` cells, never stored. */
export function docksOf(board) {
  const out = [];
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const tok = cellAt(board, c, r);
      const def = tokenElement(tok);
      if (def && def.props.dock) out.push({ c, r, n: +tok.charAt(1) });
    }
  }
  return out.sort((a, b) => a.n - b.n);
}

/* --- construction --------------------------------------------------------- */

export function blankBoard(meta = {}) {
  const w = meta.w || 12, h = meta.h || 12;
  return {
    format: BOARD_FORMAT, version: BOARD_VERSION,
    id: meta.id || "untitled",
    name: meta.name || "Untitled",
    w, h,
    edition: meta.edition || "classic",
    set: meta.set || "authored",
    origin: meta.origin || "authored",
    unverified: !!meta.unverified,
    allowVoid: !!meta.allowVoid,
    notes: meta.notes || "",
    cells: new Array(w * h).fill("..."),
    levels: null,
    wallH: new Uint8Array(w * (h + 1)),
    wallV: new Uint8Array((w + 1) * h),
    wallDevices: [],
    ceilingDevices: []
  };
}

/**
 * A deep copy. The undo stack keeps these rather than serialized documents,
 * because a board mid-edit is often one the serializer would have to be asked
 * politely about -- undo has to work on a board that does not validate yet,
 * which is most of them while somebody is drawing.
 */
export function cloneBoard(board) {
  return {
    ...board,
    cells: board.cells.slice(),
    levels: board.levels ? board.levels.slice() : null,
    wallH: board.wallH.slice(),
    wallV: board.wallV.slice(),
    wallDevices: board.wallDevices.map(d => ({ ...d, edge: { ...d.edge } })),
    ceilingDevices: board.ceilingDevices.map(d => ({ ...d }))
  };
}

/* --- document -> board ----------------------------------------------------- */

const isInt = n => Number.isInteger(n);

/**
 * Read a document into a board. Emits SHAPE diagnostics into `d` and returns
 * null when the document cannot be read at all; semantic checks are the
 * validator's job and run against the board this returns.
 *
 * `expectId` is the filename stem, when there is one.
 */
export function boardFromDocument(doc, d, expectId) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    d.error("doc.notObject", "The file is not a JSON object.");
    return null;
  }
  if (doc.format !== BOARD_FORMAT) {
    d.error("doc.format", "`format` is " + JSON.stringify(doc.format) +
      ", expected " + JSON.stringify(BOARD_FORMAT) + ".", null, "/format");
    return null;
  }
  if (doc.version !== BOARD_VERSION) {
    d.error("doc.version", "`version` is " + JSON.stringify(doc.version) +
      "; this build reads version " + BOARD_VERSION + ".", null, "/version");
    return null;
  }
  for (const k of Object.keys(doc)) {
    if (!BOARD_KEYS.has(k)) {
      d.error("doc.unknownKey", "`" + k + "` is not part of a board. " +
        (k === "flags" ? "Flags are placed by the course, not printed on the board." : ""),
        null, "/" + k);
    }
  }
  if (typeof doc.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(doc.id)) {
    d.error("doc.id", "`id` must be a bare identifier.", null, "/id");
    return null;
  }
  if (expectId && doc.id !== expectId) {
    d.error("doc.id", "`id` is " + JSON.stringify(doc.id) +
      " but the file is named " + JSON.stringify(expectId) + ".", null, "/id");
  }
  if (!isInt(doc.w) || doc.w < 1 || !isInt(doc.h) || doc.h < 1) {
    d.error("doc.dimensions", "`w` and `h` must be positive integers.", null, "/w");
    return null;
  }

  const board = blankBoard({ id: doc.id, w: doc.w, h: doc.h });
  board.name = typeof doc.name === "string" ? doc.name : "";
  if (typeof doc.name !== "string" || !doc.name) {
    d.error("doc.meta", "`name` must be a non-empty string.", null, "/name");
  }
  for (const [k, ptr] of [["edition", "/edition"], ["set", "/set"], ["origin", "/origin"]]) {
    if (typeof doc[k] !== "string") {
      d.error("doc.meta", "`" + k + "` must be a string.", null, ptr);
    } else board[k] = doc[k];
  }
  if (doc.notes !== undefined) {
    if (typeof doc.notes !== "string") d.error("doc.meta", "`notes` must be a string.", null, "/notes");
    else board.notes = doc.notes;
  }
  for (const k of ["unverified", "allowVoid"]) {
    if (doc[k] !== undefined) {
      if (typeof doc[k] !== "boolean") d.error("doc.meta", "`" + k + "` must be true or false.", null, "/" + k);
      else board[k] = doc[k];
    }
  }
  if (board.allowVoid) {
    d.error("doc.allowVoid", "`allowVoid` belongs to an assembled course picture, not to a board.",
      null, "/allowVoid");
  }

  readGround(doc, board, d);
  readWall(doc, board, d);
  readCeiling(doc, board, d);
  return board;
}

function readGround(doc, board, d) {
  const g = doc.ground;
  if (!g || typeof g !== "object" || !Array.isArray(g.rows)) {
    d.error("shape.groundRows", "`ground.rows` is missing or not an array.", null, "/ground/rows");
    return;
  }
  if (g.rows.length !== board.h) {
    d.error("shape.groundRows", "`ground.rows` has " + g.rows.length +
      " rows, expected " + board.h + ".", null, "/ground/rows");
  }
  const want = board.w * (TOKEN_WIDTH + 1) - 1;
  for (let r = 0; r < board.h; r++) {
    const row = g.rows[r];
    const ptr = "/ground/rows/" + r;
    if (typeof row !== "string") {
      d.error("shape.groundWidth", "Row " + r + " is not a string.", null, ptr);
      continue;
    }
    if (row.length !== want) {
      d.error("shape.groundWidth", "Row " + r + " is " + row.length +
        " characters, expected " + want + " for a board " + board.w + " wide.", null, ptr);
      continue;
    }
    let bad = false;
    for (let c = 1; c < board.w; c++) {
      if (row.charAt(c * (TOKEN_WIDTH + 1) - 1) !== " ") {
        d.error("shape.groundSeparator", "Row " + r + " has something other than a space " +
          "before the token at column " + c + "; the row has lost or gained a character there.",
          "(" + c + "," + r + ")", ptr);
        bad = true;
        break;
      }
    }
    if (bad) continue;
    for (let c = 0; c < board.w; c++) {
      board.cells[idx(board, c, r)] = row.substr(c * (TOKEN_WIDTH + 1), TOKEN_WIDTH);
    }
  }
  if (g.levels !== undefined && g.levels !== null) readLevels(g.levels, board, d);
  for (const k of Object.keys(g)) {
    if (k !== "rows" && k !== "levels") {
      d.error("doc.unknownKey", "`ground." + k + "` is not part of the ground layer.", null, "/ground/" + k);
    }
  }
}

function readLevels(rows, board, d) {
  if (!Array.isArray(rows) || rows.length !== board.h) {
    d.error("shape.levelRows", "`ground.levels` must be " + board.h + " rows.", null, "/ground/levels");
    return;
  }
  board.levels = new Uint8Array(board.w * board.h);
  for (let r = 0; r < board.h; r++) {
    const row = rows[r];
    const ptr = "/ground/levels/" + r;
    if (typeof row !== "string" || row.length !== board.w) {
      d.error("shape.levelRows", "Level row " + r + " must be " + board.w + " characters.", null, ptr);
      continue;
    }
    for (let c = 0; c < board.w; c++) {
      const ch = row.charAt(c);
      if (ch < "0" || ch > "9") {
        d.error("shape.levelChar", "Level " + JSON.stringify(ch) + " is not a digit.",
          "(" + c + "," + r + ")", ptr);
        continue;
      }
      board.levels[idx(board, c, r)] = +ch;
    }
  }
}

function readLattice(rows, expectRows, expectWidth, board, arr, label, ptrBase, d, code) {
  if (!Array.isArray(rows) || rows.length !== expectRows) {
    d.error(code, "`wall." + label + "` must be " + expectRows + " rows.", null, ptrBase);
    return;
  }
  for (let r = 0; r < expectRows; r++) {
    const row = rows[r];
    const ptr = ptrBase + "/" + r;
    if (typeof row !== "string" || row.length !== expectWidth) {
      d.error(code, label + " row " + r + " must be " + expectWidth + " characters.", null, ptr);
      continue;
    }
    for (let c = 0; c < expectWidth; c++) {
      const code2 = edgeCodeOf(row.charAt(c));
      if (code2 === undefined) {
        d.error("shape.edgeGlyph", "Lattice character " + JSON.stringify(row.charAt(c)) +
          " is not one of ' ', '#' or 'D'.", label + " " + c + "," + r, ptr);
        continue;
      }
      arr[r * expectWidth + c] = code2;
    }
  }
}

function readWall(doc, board, d) {
  const wl = doc.wall;
  if (!wl || typeof wl !== "object") {
    d.error("shape.hRows", "`wall` is missing.", null, "/wall");
    return;
  }
  readLattice(wl.hRows, board.h + 1, board.w, board, board.wallH, "hRows", "/wall/hRows", d, "shape.hRows");
  readLattice(wl.vRows, board.h, board.w + 1, board, board.wallV, "vRows", "/wall/vRows", d, "shape.vRows");
  for (const k of Object.keys(wl)) {
    if (k !== "hRows" && k !== "vRows" && k !== "devices") {
      d.error("doc.unknownKey", "`wall." + k + "` is not part of the wall layer.", null, "/wall/" + k);
    }
  }
  const list = wl.devices === undefined ? [] : wl.devices;
  if (!Array.isArray(list)) {
    d.error("device.unknownKind", "`wall.devices` must be an array.", null, "/wall/devices");
    return;
  }
  list.forEach((raw, i) => {
    const ptr = "/wall/devices/" + i;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      d.error("device.unknownKind", "Wall device " + i + " is not an object.", null, ptr);
      return;
    }
    for (const k of Object.keys(raw)) {
      if (!WALL_DEVICE_KEYS.has(k)) {
        d.error("device.unknownKey", "`" + k + "` is not part of a wall device.", null, ptr + "/" + k);
      }
    }
    const def = DEVICE_KINDS[raw.kind];
    if (!def) {
      d.error("device.unknownKind", "Wall device " + i + " has kind " +
        JSON.stringify(raw.kind) + ", which is not a device.", null, ptr);
      return;
    }
    if (def.layer !== "wall") {
      d.error("device.wrongLayer", "`" + raw.kind + "` is a ceiling device and cannot be bolted to a wall.",
        null, ptr);
      return;
    }
    const edge = parseEdge(raw.edge);
    if (!edge) {
      d.error("device.badEdge", "Wall device " + i + " has edge " +
        JSON.stringify(raw.edge) + ", which is not an edge id like \"h:3,0\".", null, ptr);
      return;
    }
    /* NO `_raw` ON THE DEVICE. The validator used to read `dev._raw.regs`, which
     * meant it only worked on boards that came from a document -- and the
     * editor validates on every edit, against boards it built itself. It threw
     * a TypeError the first time one reached it. Everything the validator needs
     * is on the device now: `regs` absent means every register, and `face`
     * present on an unfaced kind is the error it looks for. */
    const dev = { kind: raw.kind, edge, face: null, _ptr: ptr };
    if (def.faced) {
      const f = dirOfLetter(raw.face);
      dev.face = f === undefined ? null : f;
    } else if (raw.face !== undefined) {
      const f = dirOfLetter(raw.face);
      dev.face = f === undefined ? raw.face : f;
    }
    if (raw.damage !== undefined) dev.damage = raw.damage;
    if (raw.reach !== undefined) dev.reach = raw.reach;
    if (raw.regs !== undefined) dev.regs = raw.regs;
    if (raw.note !== undefined) dev.note = raw.note;
    board.wallDevices.push(dev);
  });
}

function readCeiling(doc, board, d) {
  const cl = doc.ceiling === undefined ? { devices: [] } : doc.ceiling;
  if (!cl || typeof cl !== "object") {
    d.error("device.unknownKind", "`ceiling` must be an object.", null, "/ceiling");
    return;
  }
  for (const k of Object.keys(cl)) {
    if (k !== "devices") {
      d.error("doc.unknownKey", "`ceiling." + k + "` is not part of the ceiling layer.", null, "/ceiling/" + k);
    }
  }
  const list = cl.devices === undefined ? [] : cl.devices;
  if (!Array.isArray(list)) {
    d.error("device.unknownKind", "`ceiling.devices` must be an array.", null, "/ceiling/devices");
    return;
  }
  list.forEach((raw, i) => {
    const ptr = "/ceiling/devices/" + i;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      d.error("device.unknownKind", "Ceiling device " + i + " is not an object.", null, ptr);
      return;
    }
    for (const k of Object.keys(raw)) {
      if (!CEILING_DEVICE_KEYS.has(k)) {
        d.error("device.unknownKey", "`" + k + "` is not part of a ceiling device." +
          (k === "face" ? " A crusher comes down from above and faces nowhere." : ""),
          null, ptr + "/" + k);
      }
    }
    const def = DEVICE_KINDS[raw.kind];
    if (!def) {
      d.error("device.unknownKind", "Ceiling device " + i + " has kind " +
        JSON.stringify(raw.kind) + ", which is not a device.", null, ptr);
      return;
    }
    if (def.layer !== "ceiling") {
      d.error("device.wrongLayer", "`" + raw.kind + "` is bolted to a wall and cannot hang from the ceiling.",
        null, ptr);
      return;
    }
    if (!Array.isArray(raw.at) || raw.at.length !== 2 || !isInt(raw.at[0]) || !isInt(raw.at[1])) {
      d.error("ceiling.offBoard", "Ceiling device " + i + " has no `at: [c, r]`.", null, ptr);
      return;
    }
    const dev = { kind: raw.kind, c: raw.at[0], r: raw.at[1], _ptr: ptr };
    if (raw.regs !== undefined) dev.regs = raw.regs;
    if (raw.note !== undefined) dev.note = raw.note;
    board.ceilingDevices.push(dev);
  });
}
