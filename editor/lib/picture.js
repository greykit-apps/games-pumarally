/* The composite ASCII picture: out, and back in.
 *
 * THIS IS THE RECOVERY HATCH FOR WHAT JSON COST US.
 *
 * The old format was one interleaved maze picture -- tiles and walls in a
 * single grid -- chosen because a board DIFFS AGAINST A PHOTOGRAPH BY EYE, and
 * that is the actual transcription workflow. Three named JSON layers give that
 * up: a wall edit and a cell edit now land in different parts of the file.
 *
 * Two things pay it back. The editor's reference-photo underlay is a strictly
 * better comparison than reading text, and it is how the verified boards were
 * actually checked. And this: the whole board as one block of text, generated
 * from the JSON, for a code review or an issue or a quick look -- and read back
 * again, so a transcriber who has an old picture can still paste one in.
 *
 * `fromPicture(toPicture(b))` is asserted to be `b` for every shipped board, so
 * this is a lossless second spelling rather than a lossy report. That costs
 * three trailing sections for the things a 2h+1 x 3w+1 grid has nowhere to put:
 * levels, ceiling devices and the register sets of wall devices.
 */

import { blankBoard, idx, cellAt, setCell, levelAt, setLevel, hasLevels } from "./board.js";
import { edgeGlyph, edgeCodeOf, EDGE_NONE, EDGE_WALL, EDGE_DOOR, edgeId, parseEdge } from "./edges.js";
import { dirLetter, dirOfLetter } from "./dir.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { canonRegs } from "./registers.js";

const CORNER = "+";

/** A board as one block of text. */
export function toPicture(board) {
  const lines = [];
  for (let r = 0; r <= board.h; r++) {
    /* the horizontal lattice row: a corner at every column, and the edge
     * between them drawn three characters wide to sit over its token */
    let lat = "";
    for (let c = 0; c < board.w; c++) {
      const code = board.wallH[r * board.w + c];
      lat += CORNER + (code === EDGE_WALL ? "---" : code === EDGE_DOOR ? "DDD" : "   ");
    }
    lines.push(lat + CORNER);
    if (r === board.h) break;

    let row = "";
    for (let c = 0; c < board.w; c++) {
      const v = board.wallV[r * (board.w + 1) + c];
      row += v === EDGE_WALL ? "|" : v === EDGE_DOOR ? "D" : " ";
      row += cellAt(board, c, r);
    }
    const last = board.wallV[r * (board.w + 1) + board.w];
    lines.push(row + (last === EDGE_WALL ? "|" : last === EDGE_DOOR ? "D" : " "));
  }

  const tail = [];
  if (hasLevels(board)) {
    tail.push("levels:");
    for (let r = 0; r < board.h; r++) {
      let s = "";
      for (let c = 0; c < board.w; c++) s += String(levelAt(board, c, r));
      tail.push("  " + s);
    }
  }
  const wd = board.wallDevices.filter(d => needsTail(d));
  if (wd.length) {
    tail.push("wall:");
    for (const d of wd) tail.push("  " + wallLine(d));
  }
  if (board.ceilingDevices.length) {
    tail.push("ceiling:");
    for (const d of board.ceilingDevices) {
      tail.push("  " + d.kind + " " + d.c + "," + d.r + regsSuffix(d.regs));
    }
  }
  return lines.concat(tail).join("\n");
}

/* A wall device always needs a tail line: the picture can show that an edge is
 * a wall or a door, but not what is bolted to it, which way it faces, or which
 * registers it fires in. */
function needsTail() { return true; }

function wallLine(d) {
  const def = DEVICE_KINDS[d.kind];
  let s = d.kind + " " + edgeId(d.edge.kind, d.edge.c, d.edge.r);
  if (def && def.faced && d.face !== null && d.face !== undefined) s += " " + dirLetter(d.face);
  if (d.damage !== undefined) s += " dmg" + d.damage;
  if (d.reach !== undefined && d.reach !== 1) s += " reach" + d.reach;
  return s + regsSuffix(d.regs);
}

function regsSuffix(regs) {
  const r = canonRegs(regs);
  return r ? " [" + r.join("") + "]" : "";
}

/** The inverse. Returns a board, or throws with the line that would not read. */
export function fromPicture(text, meta = {}) {
  const all = text.replace(/\r/g, "").split("\n");
  let end = all.findIndex(l => /^(levels|wall|ceiling):\s*$/.test(l));
  if (end < 0) end = all.length;
  const grid = all.slice(0, end).filter(l => l.length);
  if (grid.length < 3 || grid.length % 2 !== 1) {
    throw new Error("a picture is 2h+1 rows; this one has " + grid.length);
  }
  const h = (grid.length - 1) / 2;
  const w = (grid[0].length - 1) / 4;
  if (!Number.isInteger(w) || w < 1) {
    throw new Error("a lattice row is 4w+1 characters; this one is " + grid[0].length);
  }

  const board = blankBoard({ ...meta, w, h });
  for (let r = 0; r <= h; r++) {
    const lat = grid[r * 2];
    if (lat.length !== w * 4 + 1) throw new Error("lattice row " + r + " is " + lat.length + " characters, expected " + (w * 4 + 1));
    for (let c = 0; c < w; c++) {
      if (lat.charAt(c * 4) !== CORNER) throw new Error("lattice row " + r + " has no corner at column " + c);
      const seg = lat.substr(c * 4 + 1, 3);
      board.wallH[r * w + c] = seg === "---" ? EDGE_WALL : seg === "DDD" ? EDGE_DOOR : EDGE_NONE;
    }
    if (r === h) break;
    const row = grid[r * 2 + 1];
    if (row.length !== w * 4 + 1) throw new Error("tile row " + r + " is " + row.length + " characters, expected " + (w * 4 + 1));
    for (let c = 0; c <= w; c++) {
      const ch = row.charAt(c * 4);
      board.wallV[r * (w + 1) + c] = ch === "|" ? EDGE_WALL : ch === "D" ? EDGE_DOOR : EDGE_NONE;
    }
    for (let c = 0; c < w; c++) setCell(board, c, r, row.substr(c * 4 + 1, 3));
  }

  let section = null;
  for (let i = end; i < all.length; i++) {
    const line = all[i];
    if (!line.trim()) continue;
    const head = /^(levels|wall|ceiling):\s*$/.exec(line);
    if (head) { section = head[1]; if (section === "levels") board.levels = new Uint8Array(w * h); continue; }
    const body = line.trim();
    if (section === "levels") {
      const r = countLevelRows(board, w, h);
      if (body.length !== w) throw new Error("level row " + r + " is " + body.length + " characters, expected " + w);
      for (let c = 0; c < w; c++) setLevel(board, c, r, +body.charAt(c));
    } else if (section === "wall") {
      board.wallDevices.push(readWallLine(body));
    } else if (section === "ceiling") {
      board.ceilingDevices.push(readCeilingLine(body));
    } else {
      throw new Error("line " + (i + 1) + " is outside any section: " + JSON.stringify(line));
    }
  }
  return board;
}

/* Level rows arrive in order and there is no row number on them, so the row
 * being filled is however many are already non-default. Tracked with a counter
 * on the board rather than a closure so fromPicture stays a plain loop. */
function countLevelRows(board, w, h) {
  if (board._levelRow === undefined) board._levelRow = 0;
  const r = board._levelRow++;
  if (r >= h) throw new Error("more level rows than the board is tall");
  return r;
}

function readWallLine(s) {
  const parts = s.split(/\s+/);
  const kind = parts.shift();
  const def = DEVICE_KINDS[kind];
  if (!def || def.layer !== "wall") throw new Error("not a wall device: " + JSON.stringify(kind));
  const edge = parseEdge(parts.shift());
  if (!edge) throw new Error("not an edge id in: " + JSON.stringify(s));
  const dev = { kind, edge, face: null };
  for (const p of parts) {
    if (/^[NESW]$/.test(p)) dev.face = dirOfLetter(p);
    else if (/^dmg(\d+)$/.test(p)) dev.damage = +/^dmg(\d+)$/.exec(p)[1];
    else if (/^reach(\d+)$/.test(p)) dev.reach = +/^reach(\d+)$/.exec(p)[1];
    else if (/^\[(\d+)\]$/.test(p)) dev.regs = /^\[(\d+)\]$/.exec(p)[1].split("").map(Number);
    else throw new Error("unreadable in " + JSON.stringify(s) + ": " + JSON.stringify(p));
  }
  return dev;
}

function readCeilingLine(s) {
  const parts = s.split(/\s+/);
  const kind = parts.shift();
  const def = DEVICE_KINDS[kind];
  if (!def || def.layer !== "ceiling") throw new Error("not a ceiling device: " + JSON.stringify(kind));
  const m = /^(\d+),(\d+)$/.exec(parts.shift() || "");
  if (!m) throw new Error("not a square in: " + JSON.stringify(s));
  const dev = { kind, c: +m[1], r: +m[2] };
  for (const p of parts) {
    const rm = /^\[(\d+)\]$/.exec(p);
    if (!rm) throw new Error("unreadable in " + JSON.stringify(s) + ": " + JSON.stringify(p));
    dev.regs = rm[1].split("").map(Number);
  }
  return dev;
}
