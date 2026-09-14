/* The canonical writer.
 *
 * Serialize . parse must be BYTE-EXACT, and CI asserts it for every shipped
 * board. If it ever stops being true the editor's export becomes something a
 * person has to hand-correct, and hand-correcting an export is exactly where
 * transcription errors get in.
 *
 * So there is one way to write every document: fixed key order, fields omitted
 * when they carry their default, device lists sorted, one ground row per line
 * and one device per line. A diff then shows the edit and nothing else.
 *
 * Emitting by hand rather than with JSON.stringify buys two things: a device
 * stays on one line (stringify would spread it over six), and the emitter can
 * record a JSON Pointer for every line as it goes, so a diagnostic pointing at
 * `/ground/rows/3` maps to a line number exactly rather than by searching.
 */

import { hasLevels, idx, BOARD_FORMAT, BOARD_VERSION } from "./board.js";
import { edgeId } from "./edges.js";
import { dirLetter } from "./dir.js";
import { edgeGlyph } from "./edges.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { TOKEN_WIDTH } from "./token.js";
import { canonRegs } from "./registers.js";

const q = s => JSON.stringify(s);

/** Ground rows as they are written: w tokens joined by single spaces. */
export function groundRows(board) {
  const rows = [];
  for (let r = 0; r < board.h; r++) {
    const toks = [];
    for (let c = 0; c < board.w; c++) toks.push(board.cells[idx(board, c, r)]);
    rows.push(toks.join(" "));
  }
  return rows;
}

export function levelRows(board) {
  if (!hasLevels(board)) return null;
  const rows = [];
  for (let r = 0; r < board.h; r++) {
    let s = "";
    for (let c = 0; c < board.w; c++) s += String(board.levels[idx(board, c, r)]);
    rows.push(s);
  }
  return rows;
}

export function latticeRows(board, which) {
  const rows = [];
  if (which === "h") {
    for (let r = 0; r <= board.h; r++) {
      let s = "";
      for (let c = 0; c < board.w; c++) s += edgeGlyph(board.wallH[r * board.w + c]);
      rows.push(s);
    }
  } else {
    for (let r = 0; r < board.h; r++) {
      let s = "";
      for (let c = 0; c <= board.w; c++) s += edgeGlyph(board.wallV[r * (board.w + 1) + c]);
      rows.push(s);
    }
  }
  return rows;
}

/** Wall devices in canonical order: by edge kind, then column, then row, then face. */
export function sortWallDevices(list) {
  return [...list].sort((a, b) =>
    (a.edge.kind < b.edge.kind ? -1 : a.edge.kind > b.edge.kind ? 1 : 0) ||
    a.edge.c - b.edge.c || a.edge.r - b.edge.r ||
    (a.face ?? -1) - (b.face ?? -1) ||
    (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** Ceiling devices in canonical order: row-major, then kind alphabetically. */
export function sortCeilingDevices(list) {
  return [...list].sort((a, b) =>
    a.r - b.r || a.c - b.c || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

function wallDeviceLine(dev) {
  const parts = ['"kind": ' + q(dev.kind), '"edge": ' + q(edgeId(dev.edge.kind, dev.edge.c, dev.edge.r))];
  const def = DEVICE_KINDS[dev.kind];
  if (def && def.faced && dev.face !== null && dev.face !== undefined) {
    parts.push('"face": ' + q(dirLetter(dev.face)));
  }
  if (dev.damage !== undefined) parts.push('"damage": ' + JSON.stringify(dev.damage));
  /* reach 1 is the default and is not written, so a plain jet formats the way
   * it did before reach existed. */
  if (dev.reach !== undefined && dev.reach !== 1) parts.push('"reach": ' + JSON.stringify(dev.reach));
  const regs = canonRegs(dev.regs);
  if (regs) parts.push('"regs": [' + regs.join(", ") + "]");
  if (dev.note) parts.push('"note": ' + q(dev.note));
  return "{ " + parts.join(", ") + " }";
}

function ceilingDeviceLine(dev) {
  const parts = ['"kind": ' + q(dev.kind), '"at": [' + dev.c + ", " + dev.r + "]"];
  const regs = canonRegs(dev.regs);
  if (regs) parts.push('"regs": [' + regs.join(", ") + "]");
  if (dev.note) parts.push('"note": ' + q(dev.note));
  return "{ " + parts.join(", ") + " }";
}

/**
 * Canonical JSON for a board. Returns the text and a pointer -> line index map,
 * so `diagnostics.js` can highlight the line a diagnostic names.
 */
export function stringifyBoard(board) {
  const lines = [];
  const at = {};
  const put = (text, pointer) => {
    if (pointer) at[pointer] = lines.length;
    lines.push(text);
  };

  put("{");
  put('  "format": ' + q(BOARD_FORMAT), "/format");
  put('  "version": ' + BOARD_VERSION + ",", "/version");
  lines[lines.length - 2] += ",";
  put('  "id": ' + q(board.id) + ",", "/id");
  put('  "name": ' + q(board.name) + ",", "/name");
  put('  "w": ' + board.w + ",", "/w");
  put('  "h": ' + board.h + ",", "/h");
  put('  "set": ' + q(board.set) + ",", "/set");
  put('  "origin": ' + q(board.origin) + ",", "/origin");
  if (board.unverified) put('  "unverified": true,', "/unverified");
  if (board.allowVoid) put('  "allowVoid": true,', "/allowVoid");
  if (board.notes) put('  "notes": ' + q(board.notes) + ",", "/notes");

  const levels = levelRows(board);
  put('  "ground": {', "/ground");
  put('    "rows": [', "/ground/rows");
  const rows = groundRows(board);
  rows.forEach((row, i) =>
    put('      ' + q(row) + (i < rows.length - 1 ? "," : ""), "/ground/rows/" + i));
  put("    ]" + (levels ? "," : ""));
  if (levels) {
    put('    "levels": [', "/ground/levels");
    levels.forEach((row, i) =>
      put('      ' + q(row) + (i < levels.length - 1 ? "," : ""), "/ground/levels/" + i));
    put("    ]");
  }
  put("  },");

  put('  "wall": {', "/wall");
  for (const [key, which] of [["hRows", "h"], ["vRows", "v"]]) {
    const rs = latticeRows(board, which);
    put('    "' + key + '": [', "/wall/" + key);
    rs.forEach((row, i) =>
      put('      ' + q(row) + (i < rs.length - 1 ? "," : ""), "/wall/" + key + "/" + i));
    put("    ],");
  }
  const wd = sortWallDevices(board.wallDevices);
  if (!wd.length) put('    "devices": []', "/wall/devices");
  else {
    put('    "devices": [', "/wall/devices");
    wd.forEach((dev, i) =>
      put("      " + wallDeviceLine(dev) + (i < wd.length - 1 ? "," : ""), "/wall/devices/" + i));
    put("    ]");
  }
  put("  },");

  const cd = sortCeilingDevices(board.ceilingDevices);
  if (!cd.length) put('  "ceiling": { "devices": [] }', "/ceiling");
  else {
    put('  "ceiling": {', "/ceiling");
    put('    "devices": [', "/ceiling/devices");
    cd.forEach((dev, i) =>
      put("      " + ceilingDeviceLine(dev) + (i < cd.length - 1 ? "," : ""), "/ceiling/devices/" + i));
    put("    ]");
    put("  }");
  }
  put("}");

  return { text: lines.join("\n") + "\n", at };
}

/** The text alone, which is what almost every caller wants. */
export function boardJSON(board) {
  return stringifyBoard(board).text;
}

/** The line a JSON Pointer lands on in text produced by stringifyBoard. */
export function pointerToLine(at, pointer) {
  return pointer && at[pointer] !== undefined ? at[pointer] : null;
}
