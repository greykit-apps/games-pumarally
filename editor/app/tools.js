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
import { SITES, SITE_ORDER, EXCLUSIVE } from "../rulesets/sites.js";
import { DEVICE_KINDS, WALL_KINDS, CEILING_KINDS } from "../rulesets/devices.js";
import { writeToken, ARM_CHARS, ARM_CODES, ARM_NAMES, tokenBeltSpeed, readToken, bayCharOf } from "../lib/token.js";
import { describeRegs } from "../lib/registers.js";
import { dirChar, dirLetter, dirOfChar, opposite, rot, DC, DR, N, E, S, W } from "../lib/dir.js";
import {
  idx, inBoard, cellAt, setCell, isVoid, elementAt, propAt, levelAt, setLevel,
  deviceCell, wallDevicesAt, ceilingAt, doorOn, sitesAt, setSites, toggleSite, doorsAt, deviceOnEdge } from "../lib/board.js";
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
    group: "Floor", arg: def.arg, printedIn: def.printedIn
  })),
  { key: "level", label: "Level", kind: "level", group: "Floor" },

  /* Sites TOGGLE rather than replace. A square is floor that also carries a
   * wrench, or a battery, or a flag location, or several of those -- clicking
   * one adds or removes that marking and leaves everything else alone. */
  ...SITE_ORDER.map(k => ({
    key: "site:" + k, label: SITES[k].name, kind: "site", site: k,
    group: "Sites", printedIn: SITES[k].printedIn
  })),

  { key: "wall", label: "Wall", kind: "wall", hot: "b", group: "Walls" },
  ...WALL_KINDS.map(k => ({
    key: "dev:" + k, label: DEVICE_KINDS[k].name, kind: "device", device: k,
    group: "Walls", printedIn: DEVICE_KINDS[k].printedIn
  })),
  ...CEILING_KINDS.map(k => ({
    key: "dev:" + k, label: DEVICE_KINDS[k].name, kind: "ceiling", device: k,
    group: "Ceiling", printedIn: DEVICE_KINDS[k].printedIn
  }))
];

export const GROUPS = ["Hand", "Floor", "Sites", "Walls", "Ceiling"];

/* THE RAIL OFFERS EVERYTHING. It used to filter by a board's declared edition,
 * and a board started classic -- so nine elements and the whole of elevation
 * had no route to a square at all. The answer is not a better filter: a board
 * is just a board, and which of its squares matter is decided at play time by
 * the engine under whichever ruleset is in force. check-app.js asserts that
 * every element and every device in the registries is on the rail. */

export function toolByKey(key) {
  return TOOLS.find(t => t.key === key);
}

/** The tools offered. The only thing hidden is the flag tool outside a course. */
export function toolsFor(isCourse) {
  return TOOLS.filter(t => !t.courseOnly || isCourse);
}

/** Fresh tool state. `dir`, `regs` and the rest are what the hand is holding. */
export function blankToolState() {
  return {
    tool: "el:conveyor",
    dir: N, digit: 1, pair: 1, damage: 1, reach: 1, level: 1,
    regs: { pusher: [1, 3, 5], jet: [2, 4], door: [1, 3, 5], crusher: [2, 5], flamer: null },
    arms: "."
  };
}

/* ONE PRESS-AND-DRAG, and each square acted on ONCE within it.
 *
 * Holding the button down and moving fires `pointermove` continuously, and the
 * editor paints on every one of them so that a drag lays a run of belt. For
 * every tool that writes a value that is harmless: laying the same conveyor on
 * the same square twice is a no-op and reports `changed: false`.
 *
 * SITES ARE THE ONE TOOL THAT TOGGLES. The same printed square is a wrench in
 * one game and a battery in the other and a flag location can sit on either, so
 * clicking adds or removes a marking rather than replacing the square -- and
 * under a repainting drag that meant the mark flipped on and off once per
 * pointer event. The square you pressed on ended up in whatever state the
 * PARITY of your hand tremor left it in, so "place a flag location" mostly did
 * nothing at all, which is exactly what it looked like from the outside.
 *
 * A Set rather than just the previous cell: dragging away from a square and
 * back over it inside one stroke should not toggle it a second time either.
 *
 * `byFace` IS THE TOOL'S QUESTION, NOT THE POINTER'S, and getting that wrong
 * was the first fix's own bug. `hit()` reports a face whenever the pointer is
 * within EDGE_BAND of an edge, for every tool, because the caller decides
 * whether that matters. So a stroke that always keyed on the face saw a square
 * entered near its rim as `3,0,W` and the same square at its centre as `3,0,-`
 * -- two keys, one square, painted twice, and a site toggled straight back off
 * again. A wall tool DOES want the face in the key, so that running along a
 * line marks each edge it crosses. Hence the flag, set from the held tool when
 * the stroke begins.
 */
export function newStroke(byFace) {
  const done = new Set();
  return {
    /** True the first time this stroke reaches this square (or this edge). */
    wants(h) {
      if (!h || !h.inside) return false;
      const key = byFace
        ? h.c + "," + h.r + "," + (h.face === null || h.face === undefined ? "-" : h.face)
        : h.c + "," + h.r;
      if (done.has(key)) return false;
      done.add(key);
      return true;
    },
    get size() { return done.size; }
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
    case "site": return applySite(board, st, tool, c, r, opts);
    case "wall": return applyWall(board, st, c, r, opts);
    case "device": return applyDevice(board, st, tool, c, r, opts);
    case "ceiling": return applyCeiling(board, st, tool, c, r);
    default: return { ok: false, why: "That tool does not lay anything." };
  }
}

function applyGround(board, st, tool, c, r) {
  const ch = tool.element;
  const def = ELEMENTS[ch];
  let arg = ".";
  if (def.arg === ARG_DIR) arg = dirChar(st.dir);
  else if (def.arg === ARG_DIGIT) arg = bayCharOf(st.digit);
  else if (def.arg === ARG_PAIR) arg = String(st.pair);

  /* A ceiling device has to have something to come down ON. */
  if (def.props.pit && ceilingAt(board, c, r).length) {
    return { ok: false, why: "Something hangs over " + at(c, r) + "; a pit has nothing under it to come down on." };
  }
  /* A site marks plain floor, so turning the square into anything else has to
   * take the markings with it -- silently leaving a wrench under a pit is how a
   * board ends up carrying data nothing can see. */
  const marks = sitesAt(board, c, r);
  if (marks.length && def.key !== "floor") {
    return { ok: false, why: at(c, r) + " is marked with " +
      marks.map(k => SITES[k].short).join(" and ") +
      ", and a marking sits on plain floor. Take it off first." };
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

/**
 * Add or remove one marking. The square keeps whatever else it has -- that is
 * the point of the layer: the same printed floor is a wrench in one game and a
 * battery in the other, and a flag location can sit on either.
 */
function applySite(board, st, tool, c, r, opts) {
  const key = tool.site;
  const def = SITES[key];
  const now = sitesAt(board, c, r);
  const had = now.indexOf(key) >= 0;

  if (opts.erase || had) {
    if (!had) return { ok: true, changed: false };
    setSites(board, c, r, now.filter(k => k !== key));
    return { ok: true, changed: true, note: def.name + " taken off " + at(c, r) + "." };
  }

  const el = elementAt(board, c, r);
  if (!el || el.key !== "floor") {
    return { ok: false, why: "A " + def.name.toLowerCase() + " marks plain floor. " +
      at(c, r) + " is " + (el ? el.name.toLowerCase() : "not floor") + "." };
  }
  for (const pair of EXCLUSIVE) {
    if (pair.indexOf(key) >= 0) {
      const other = pair.find(k => k !== key);
      if (now.indexOf(other) >= 0) {
        return { ok: false, why: at(c, r) + " is already marked with " + SITES[other].short +
          ". A square is printed with one or the other." };
      }
    }
  }
  const next = toggleSite(board, c, r, key);
  return { ok: true, changed: true,
    note: def.name + " at " + at(c, r) +
      (next.length > 1 ? ", with " + next.filter(k => k !== key).map(k => SITES[k].short).join(" and ") : "") + "." };
}

function applyLevel(board, st, c, r, opts) {
  const want = opts.erase ? 0 : st.level;
  if (levelAt(board, c, r) === want) return { ok: true, changed: false };
  setLevel(board, c, r, want);
  return { ok: true, changed: true, note: "Level " + want + " at " + at(c, r) };
}

function applyWall(board, st, c, r, opts) {
  const face = opts.face === undefined || opts.face === null ? st.dir : opts.face;
  const edge = edgeOf(c, r, face);
  const now = edgeCodeAt(board, edge);
  /* A door on the edge is a device, and the wall tool does not write over a
   * device: it used to turn the D into a #, leaving a door standing on a wall
   * with no glyph, which the validator reports and nothing could then fix. */
  if (now === EDGE_DOOR && !opts.erase) {
    return { ok: false, why: "A swing door stands on that edge. Take it off first." };
  }
  /* `opts.set` is the stroke's LATCHED intent: a click toggles, but a drag
   * that toggles inverts every segment it re-crosses, so a stroke decides on
   * its first edge whether it is laying or clearing and keeps to it. */
  const want = opts.erase ? EDGE_NONE
    : opts.set === "wall" ? EDGE_WALL
    : opts.set === "none" ? EDGE_NONE
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

function applyDevice(board, st, tool, c, r, opts = {}) {
  const kind = tool.device;
  const def = DEVICE_KINDS[kind];

  if (kind === "door") {
    /* A door IS the edge, so it goes on the edge under the pointer when the
     * pointer is on one -- which is what the ghost highlights -- and on the face
     * the hand is pointing at otherwise. It used to ignore the pointer's edge
     * and go on the hand's facing every time, so the highlighted edge and the
     * laid edge disagreed. */
    const face = opts.face === undefined || opts.face === null ? st.dir : opts.face;
    const edge = edgeOf(c, r, face);
    const already = whatNeedsEdge(board, edge);
    if (already) return { ok: false, why: already.name + " is already on that edge." };
    const regs = st.regs.door;
    if (!regs || !regs.length || regs.length >= 5) {
      return { ok: false, why: "A door open in every register is not a door. Pick the registers it stands open in." };
    }
    setEdgeCode(board, edge, EDGE_DOOR);
    board.wallDevices.push({ kind, edge, face: null, regs: [...regs] });  // face null, not a direction: a door is symmetric
    return { ok: true, changed: true, note: "Swing door on the " + dirLetter(face) + " side of " + at(c, r) };
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

  /* A door on the edge under the pointer comes off first, glyph and device
   * together. Doors have no face and so no square, which is why the device
   * pass below never found one -- and the wall pass then refused with advice
   * nothing in the editor could follow. */
  if (opts.face !== undefined && opts.face !== null) {
    const edge = edgeOf(c, r, opts.face);
    const door = doorOn(board, edge);
    if (door) return takeOffDoor(board, door, "Took the swing door off the " + dirLetter(opts.face) + " side of " + at(c, r));
  }

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
  const marks = sitesAt(board, c, r);
  if (marks.length) {
    const last = marks[marks.length - 1];
    setSites(board, c, r, marks.slice(0, -1));
    return { ok: true, changed: true, note: SITES[last].name + " taken off " + at(c, r) + "." };
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

/** Remove a door device and the glyph that is the door. */
export function takeOffDoor(board, door, note) {
  const i = board.wallDevices.indexOf(door);
  if (i < 0) return { ok: false, why: "That door is not on this board." };
  board.wallDevices.splice(i, 1);
  setEdgeCode(board, door.edge, EDGE_NONE);
  return { ok: true, changed: true, note: note || "Swing door taken off." };
}

/**
 * The squares a stroke crosses between two pointer samples, end included and
 * start excluded, as [c, r] pairs. A pointer moved fast reports squares with
 * gaps between them, and a belt run with a gap in it is a rules error -- so the
 * stroke walks every square the segment passes through rather than only the
 * ones the pointer happened to be sampled in. Supercover: a diagonal step
 * visits the two squares it cuts between, so a run is 4-connected.
 */
export function cellsBetween(c0, r0, c1, r1) {
  const out = [];
  let c = c0, r = r0;
  const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
  const nc = Math.abs(c1 - c0), nr = Math.abs(r1 - r0);
  let ic = 0, ir = 0;
  while (ic < nc || ir < nr) {
    /* step along whichever axis is further behind its share of the segment */
    if (ir >= nr || (ic < nc && (ic + 0.5) / nc < (ir + 0.5) / nr)) { c += dc; ic++; }
    else { r += dr; ir++; }
    out.push([c, r]);
  }
  return out;
}

/* --- editing what is already down -------------------------------------------
 * The rail sets what goes DOWN. These change what is already there, which is a
 * different job: a belt whose arms are wrong has to be fixable without laying
 * it again, because re-laying it loses everything else on the square.
 */

/** Set a placed belt's arms. Returns {ok, why} like the laying tools. */
export function setArms(board, c, r, arms) {
  const tok = cellAt(board, c, r);
  if (!tokenBeltSpeed(tok)) return { ok: false, why: "Only a conveyor has arms." };
  if (!ARM_CODES[arms]) return { ok: false, why: "That is not one of the seven shapes." };
  if (tok.charAt(2) === arms) return { ok: true, changed: false };
  setCell(board, c, r, tok.charAt(0) + tok.charAt(1) + arms);
  return { ok: true, changed: true, note: "The conveyor at " + at(c, r) + " is a " + ARM_NAMES[arms] + "." };
}

/**
 * Toggle one arm of a placed belt, by its RELATIVE slot.
 * The set can never be emptied: a belt with no arms behaves exactly as a plain
 * straight does -- arms only decide turning, and a square with nothing to turn
 * you is the same square either way -- so there is no code point for it and
 * clearing the last arm puts the rear one back.
 */
export function toggleArm(board, c, r, slot) {
  const tok = cellAt(board, c, r);
  if (!tokenBeltSpeed(tok)) return { ok: false, why: "Only a conveyor has arms." };
  const now = ARM_CODES[tok.charAt(2)];
  if (!now) return { ok: false, why: "That conveyor's shape is unreadable." };
  const want = { ...now, [slot]: !now[slot] };
  if (!want.back && !want.left && !want.right) want.back = true;
  for (const ch of ARM_CHARS) {
    const a = ARM_CODES[ch];
    if (a.back === want.back && a.left === want.left && a.right === want.right) {
      return setArms(board, c, r, ch);
    }
  }
  return { ok: false, why: "No printed shape has those arms." };
}

/** Turn a placed thing: the square's own element, or a device standing on it. */
export function turnHere(board, c, r, quarters, which) {
  if (which && which.kind) {
    const def = DEVICE_KINDS[which.kind];
    if (!def || !def.faced) return { ok: false, why: DEVICE_KINDS[which.kind].name + " faces nowhere." };
    const face = rot(which.face, quarters);
    const edge = mountEdge(c, r, face);
    /* the raw device, not whatNeedsEdge's copy -- a copy is never === which */
    const blocking = deviceOnEdge(board, edge);
    if (blocking && blocking !== which) {
      const bdef = DEVICE_KINDS[blocking.kind];
      return { ok: false, why: bdef.name + " is already on the wall it would turn onto." };
    }
    /* the mount moves with it, and raises the wall it lands on */
    which.edge = edge;
    which.face = face;
    setEdgeCode(board, edge, EDGE_WALL);
    return { ok: true, changed: true, note: def.name + " at " + at(c, r) + " now faces " + dirLetter(face) + "." };
  }
  const tok = cellAt(board, c, r);
  const def = ELEMENTS[tok.charAt(0)];
  if (!def || def.arg !== ARG_DIR) return { ok: false, why: (def ? def.name : "That square") + " has no facing." };
  const d = dirOfChar(tok.charAt(1));
  if (d === undefined) return { ok: false, why: "That square's facing is unreadable." };
  setCell(board, c, r, tok.charAt(0) + dirChar(rot(d, quarters)) + tok.charAt(2));
  return { ok: true, changed: true, note: def.name + " at " + at(c, r) + " now runs " + dirLetter(rot(d, quarters)) + "." };
}

/** Set a placed device's register list. `regs` empty means every register. */
export function setDeviceRegs(dev, regs) {
  const def = DEVICE_KINDS[dev.kind];
  if (!def || def.regs === "none") return { ok: false, why: def.name + " fires every register." };
  const next = regs && regs.length && regs.length < 5 ? [...regs].sort((a, b) => a - b) : null;
  if (def.regs === "required" && !next) {
    return { ok: false, why: "A swing door must stand open in some registers and not others." };
  }
  if (next) dev.regs = next; else delete dev.regs;
  return { ok: true, changed: true, note: def.name + " fires in " + describeRegs(next) + "." };
}

/** Set a placed device's numeric field (a laser's damage, a jet's reach). */
export function setDeviceField(dev, key, value) {
  const def = DEVICE_KINDS[dev.kind];
  const spec = def && def.fields[key];
  if (!spec) return { ok: false, why: def.name + " has no " + key + "." };
  if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
    return { ok: false, why: key + " is " + spec.min + " to " + spec.max + "." };
  }
  if (spec.default !== undefined && value === spec.default) delete dev[key];
  else dev[key] = value;
  return { ok: true, changed: true, note: def.name + "'s " + key + " is " + value + "." };
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
    sites: sitesAt(board, c, r),
    walls: [N, E, S, W].filter(d => wallAt(board, c, r, d) === EDGE_WALL).map(dirLetter),
    doors: [N, E, S, W].filter(d => wallAt(board, c, r, d) === EDGE_DOOR).map(dirLetter),
    wallDevices: wallDevicesAt(board, c, r),
    /* the doors on this square's edges, each with the side it is on; a door
     * belongs to both squares beside it and is listed by both */
    doorDevices: doorsAt(board, c, r),
    ceiling: ceilingAt(board, c, r)
  };
  return out;
}

function at(c, r) { return "(" + c + "," + r + ")"; }
