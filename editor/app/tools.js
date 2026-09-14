/* The tool rail, and what each tool does to a board.
 *
 * ONE FLAT LIST rather than a tile row plus separate mode buttons, because a
 * person picking things up does not care which layer the registry keeps them
 * in. The grouping is the three layers -- Floor, Walls, Ceiling -- which is the
 * same split the FORMAT uses, so the thing you pick up and the thing that gets
 * written are described the same way.
 *
 * Applying a tool is a pure function of (board, square, tool state). No DOM, so
 * the rules a tool follows can be tested without one -- and they need to be,
 * because most of them are refusals.
 */

import { ELEMENTS, CHAR_OF_KEY, ARG_DIR, ARG_DIGIT, ARG_PAIR, ARG_NONE } from "../rulesets/elements.js";
import { DEVICE_KINDS, WALL_KINDS, CEILING_KINDS } from "../rulesets/devices.js";
import { writeToken, ARM_CHARS, ARM_CODES, ARM_NAMES, tokenBeltSpeed, readToken } from "../lib/token.js";
import { dirChar, dirLetter, opposite, rot, DC, DR, N, E, S, W } from "../lib/dir.js";
import {
  idx, inBoard, cellAt, setCell, isVoid, elementAt, propAt, levelAt, setLevel,
  deviceCell, wallDevicesAt, ceilingAt, doorOn
} from "../lib/board.js";
import {
  edgeOf, edgeId, setWall, wallAt, edgeCodeAt, setEdgeCode,
  EDGE_NONE, EDGE_WALL, EDGE_DOOR, isNormalOf
} from "../lib/edges.js";

/* Keys reserved by steering and numbering, which no tool may claim. */
export const STEER_KEYS = "wasdqe";
export const RESERVED = STEER_KEYS + "1234567890";

export const TOOLS = [
  { key: "select", label: "Select", kind: "select", hot: "v", group: "Hand" },
  { key: "pan", label: "Hand", kind: "pan", hot: "h", group: "Hand" },
  { key: "flag", label: "Flag", kind: "flag", hot: "f", group: "Hand", courseOnly: true },

  ...Object.entries(ELEMENTS).map(([ch, def]) => ({
    key: "el:" + def.key, label: def.name, kind: "ground", element: ch,
    group: "Floor", arg: def.arg, editions: def.editions
  })),
  { key: "level", label: "Level", kind: "level", group: "Floor" },

  { key: "wall", label: "Wall", kind: "wall", hot: "b", group: "Walls" },
  ...WALL_KINDS.map(k => ({
    key: "dev:" + k, label: DEVICE_KINDS[k].name, kind: "device", device: k,
    group: "Walls", editions: DEVICE_KINDS[k].editions
  })),
  ...CEILING_KINDS.map(k => ({
    key: "dev:" + k, label: DEVICE_KINDS[k].name, kind: "ceiling", device: k,
    group: "Ceiling", editions: DEVICE_KINDS[k].editions
  }))
];

export const GROUPS = ["Hand", "Floor", "Walls", "Ceiling"];

export function toolByKey(key) {
  return TOOLS.find(t => t.key === key);
}

/** The tools offered for a board of this edition, in a course or not. */
export function toolsFor(edition, isCourse) {
  return TOOLS.filter(t => {
    if (t.courseOnly && !isCourse) return false;
    if (!t.editions) return true;
    return edition === "both" ? t.editions.length === 2 : t.editions.indexOf(edition) >= 0;
  });
}

/** Fresh tool state. `dir`, `regs` and the rest are what the hand is holding. */
export function blankToolState() {
  return {
    tool: "el:conveyor",
    dir: N, digit: 1, pair: 1, damage: 1, reach: 1, level: 1,
    regs: { pusher: [1, 3, 5], jet: [2, 4], door: [1, 3, 5], press: [1, 5], crusher: [2, 5], flamer: null },
    arms: "."
  };
}

/* --- what a tool refuses ---------------------------------------------------
 * Every refusal names the square and says why. A tool that simply does nothing
 * when clicked teaches nothing; the status line is where the rules get learned.
 */

/** The wall a device bolts to: behind it, opposite the way it faces. */
export function mountEdge(c, r, face) {
  return edgeOf(c, r, opposite(face));
}

/**
 * Try to lay the held tool at (c, r). Returns {ok:true, changed} or
 * {ok:false, why}. Mutates `board` only on success.
 */
export function apply(board, st, c, r, opts = {}) {
  const tool = toolByKey(st.tool);
  if (!tool) return { ok: false, why: "Nothing in hand." };
  if (!inBoard(board, c, r)) return { ok: false, why: "Off the board." };

  switch (tool.kind) {
    case "ground": return applyGround(board, st, tool, c, r);
    case "level": return applyLevel(board, st, c, r, opts);
    case "wall": return applyWall(board, st, c, r, opts);
    case "device": return applyDevice(board, st, tool, c, r);
    case "ceiling": return applyCeiling(board, st, tool, c, r);
    default: return { ok: false, why: "That tool does not lay anything." };
  }
}

function applyGround(board, st, tool, c, r) {
  const ch = tool.element;
  const def = ELEMENTS[ch];
  let arg = ".";
  if (def.arg === ARG_DIR) arg = dirChar(st.dir);
  else if (def.arg === ARG_DIGIT) arg = String(st.digit);
  else if (def.arg === ARG_PAIR) arg = String(st.pair);

  /* A ceiling device has to have something to come down ON. */
  if (def.props.pit && ceilingAt(board, c, r).length) {
    return { ok: false, why: "Something hangs over " + at(c, r) + "; a pit has nothing under it to come down on." };
  }
  const arms = def.props.belt ? st.arms : ".";
  const was = cellAt(board, c, r);
  const tok = writeToken(ch, arg, arms);

  /* A RAMP IS THE ONLY WAY BETWEEN LEVELS, so laying one on a flat board is
   * always half an edit: the square it points at has to be a level up or the
   * board is red the moment you put it down. The tool fills that in, but ONLY
   * when the uphill square is currently level with the ramp -- if it already
   * has a level of its own, that is data somebody entered and the tool does not
   * overwrite it, it explains the mismatch instead. */
  let raised = null;
  if (def.props.ramp) {
    const uc = c + DC[st.dir], ur = r + DR[st.dir];
    if (!inBoard(board, uc, ur)) {
      return { ok: false, why: "A ramp at " + at(c, r) + " facing " + dirLetter(st.dir) +
        " points off the board. Turn it with W A S D." };
    }
    const foot = levelAt(board, c, r), top = levelAt(board, uc, ur);
    if (top === foot) raised = [uc, ur, foot + 1];
    else if (top !== foot + 1) {
      return { ok: false, why: "The square uphill of " + at(c, r) + " is at level " + top +
        " and this ramp stands at " + foot + ". A ramp climbs exactly one level." };
    }
  }

  if (was === tok && !raised) return { ok: true, changed: false };
  setCell(board, c, r, tok);
  if (raised) setLevel(board, raised[0], raised[1], raised[2]);
  return { ok: true, changed: true, note: def.name + " at " + at(c, r) +
    (def.props.belt ? ", " + ARM_NAMES[arms] + ", running " + dirLetter(st.dir) : "") +
    (raised ? "; raised " + at(raised[0], raised[1]) + " to level " + raised[2] : "") };
}

function applyLevel(board, st, c, r, opts) {
  const want = opts.erase ? 0 : st.level;
  if (levelAt(board, c, r) === want) return { ok: true, changed: false };
  setLevel(board, c, r, want);
  return { ok: true, changed: true, note: "Level " + want + " at " + at(c, r) };
}

function applyWall(board, st, c, r, opts) {
  const face = opts.face === undefined ? st.dir : opts.face;
  const edge = edgeOf(c, r, face);
  const now = edgeCodeAt(board, edge);
  const want = opts.erase ? EDGE_NONE
    : now === EDGE_WALL ? EDGE_NONE
    : EDGE_WALL;

  if (want === EDGE_NONE && now !== EDGE_NONE) {
    const held = whatNeedsEdge(board, edge);
    if (held) {
      return { ok: false, why: held.name + " is bolted to that wall. Take it off first." };
    }
  }
  if (now === want) return { ok: true, changed: false };
  setEdgeCode(board, edge, want);
  return { ok: true, changed: true,
    note: (want ? "Wall on the " : "No wall on the ") + dirLetter(face) + " side of " + at(c, r) };
}

/** A device standing on this edge, or null. Doors count: the glyph IS the door. */
export function whatNeedsEdge(board, edge) {
  const id = edgeId(edge.kind, edge.c, edge.r);
  const dev = board.wallDevices.find(d => edgeId(d.edge.kind, d.edge.c, d.edge.r) === id);
  return dev ? { ...dev, name: DEVICE_KINDS[dev.kind].name } : null;
}

function applyDevice(board, st, tool, c, r) {
  const kind = tool.device;
  const def = DEVICE_KINDS[kind];

  if (kind === "door") {
    /* A door IS the edge, so it goes on the face the hand is pointing at. */
    const edge = edgeOf(c, r, st.dir);
    const already = whatNeedsEdge(board, edge);
    if (already) return { ok: false, why: already.name + " is already on that edge." };
    setEdgeCode(board, edge, EDGE_DOOR);
    board.wallDevices.push({ kind, edge, face: null, regs: st.regs.door ? [...st.regs.door] : [1, 3, 5] });  // face null, not a direction: a door is symmetric
    return { ok: true, changed: true, note: "Swing door on the " + dirLetter(st.dir) + " side of " + at(c, r) };
  }

  const face = st.dir;
  const edge = mountEdge(c, r, face);
  if (!isNormalOf(edge.kind, face)) return { ok: false, why: "That face does not point away from the wall." };

  const here = wallDevicesAt(board, c, r, kind);
  if (here.length) return { ok: false, why: "A " + def.name.toLowerCase() + " already stands in " + at(c, r) + "." };
  if (kind === "pusher" && wallDevicesAt(board, c, r, "pusher").length) {
    return { ok: false, why: "Only one pusher to a square." };
  }
  const existing = whatNeedsEdge(board, edge);
  if (existing && existing.kind === "door") {
    return { ok: false, why: "That edge is a swing door; nothing bolts to a door." };
  }

  /* A MOUNT PUTS ITS OWN WALL UP as it goes down. Otherwise the board goes red
   * the moment you place one and stays that way until you remember why. */
  setEdgeCode(board, edge, EDGE_WALL);

  const dev = { kind, edge, face };
  if ("damage" in def.fields) dev.damage = st.damage;
  if ("reach" in def.fields && st.reach !== 1) dev.reach = st.reach;
  const regs = st.regs[kind];
  if (def.regs !== "none" && regs && regs.length) dev.regs = [...regs];
  board.wallDevices.push(dev);
  return { ok: true, changed: true,
    note: def.name + " at " + at(c, r) + " facing " + dirLetter(face) + ", mounted on the " +
      dirLetter(opposite(face)) + " wall" };
}

function applyCeiling(board, st, tool, c, r) {
  const kind = tool.device;
  const def = DEVICE_KINDS[kind];
  if (propAt(board, c, r, "pit")) {
    return { ok: false, why: "A " + def.name.toLowerCase() + " over a pit has nothing to come down on." };
  }
  if (ceilingAt(board, c, r, kind).length) {
    return { ok: false, why: "A " + def.name.toLowerCase() + " already hangs over " + at(c, r) + "." };
  }
  const dev = { kind, c, r };
  const regs = st.regs[kind];
  if (regs && regs.length) dev.regs = [...regs];
  board.ceilingDevices.push(dev);
  return { ok: true, changed: true, note: def.name + " over " + at(c, r) };
}

/** Right-click: take whatever is topmost off this square. */
export function erase(board, st, c, r, opts = {}) {
  if (!inBoard(board, c, r)) return { ok: false, why: "Off the board." };

  const ceil = ceilingAt(board, c, r);
  if (ceil.length) {
    board.ceilingDevices.splice(board.ceilingDevices.indexOf(ceil[ceil.length - 1]), 1);
    return { ok: true, changed: true, note: "Took the " + DEVICE_KINDS[ceil[ceil.length - 1].kind].name.toLowerCase() + " off " + at(c, r) };
  }
  const devs = wallDevicesAt(board, c, r);
  if (devs.length) {
    const dev = devs[devs.length - 1];
    board.wallDevices.splice(board.wallDevices.indexOf(dev), 1);
    /* the wall it put up stays: it may be a printed wall too, and guessing
     * wrong in either direction loses data the photograph has */
    return { ok: true, changed: true, note: "Took the " + DEVICE_KINDS[dev.kind].name.toLowerCase() +
      " off " + at(c, r) + ". Its wall is still there." };
  }
  if (opts.face !== undefined && edgeCodeAt(board, edgeOf(c, r, opts.face)) !== EDGE_NONE) {
    return applyWall(board, st, c, r, { face: opts.face, erase: true });
  }
  if (levelAt(board, c, r)) return applyLevel(board, st, c, r, { erase: true });
  if (cellAt(board, c, r) !== "...") {
    setCell(board, c, r, "...");
    return { ok: true, changed: true, note: "Floor at " + at(c, r) };
  }
  return { ok: true, changed: false };
}

/** Everything standing on a square, for the inspector and the status line. */
export function describe(board, c, r) {
  if (!inBoard(board, c, r)) return null;
  const tok = cellAt(board, c, r);
  const def = elementAt(board, c, r);
  const t = readToken(tok);
  const out = {
    c, r, token: tok,
    element: def ? def.name : "unknown",
    key: def ? def.key : null,
    level: levelAt(board, c, r),
    arms: def && def.props.belt ? ARM_NAMES[t.arms] : null,
    dir: def && def.arg === ARG_DIR ? t.arg : null,
    walls: [N, E, S, W].filter(d => wallAt(board, c, r, d) === EDGE_WALL).map(dirLetter),
    doors: [N, E, S, W].filter(d => wallAt(board, c, r, d) === EDGE_DOOR).map(dirLetter),
    wallDevices: wallDevicesAt(board, c, r),
    ceiling: ceilingAt(board, c, r)
  };
  return out;
}

function at(c, r) { return "(" + c + "," + r + ")"; }
