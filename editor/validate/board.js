/* What the validator refuses.
 *
 * Board data is typed by hand off photographs, so its failure modes are silent:
 * a row that lost a character, a conveyor pointing into a wall, a laser with
 * nothing to mount on. None of those throws on its own -- they render a board
 * that is plausible and wrong, which is the one failure a game promising
 * faithful layouts cannot survive. So they are fatal at load.
 *
 * Every code emitted here has a negative test in validator-selftest.js, and the
 * selftest asserts that the set of codes it provokes EQUALS the code table. A
 * check with no test behind it fails CI rather than quietly reading as coverage.
 */

import { ELEMENTS, checkArg, ARG_PAIR } from "../rulesets/elements.js";
import { DEVICE_KINDS, REGS_NONE, REGS_OPTIONAL, REGS_REQUIRED } from "../rulesets/devices.js";
import { SETS, EDITIONS } from "../rulesets/sets.js";
import { ARM_CODES, isVoidToken, readToken, tokenBeltSpeed } from "../lib/token.js";
import {
  idx, inBoard, isVoid, cellAt, elementAt, propAt, beltDir, levelAt,
  deviceCell, laserPath, blockedAt, doorOn, siteList
} from "../lib/board.js";
import {
  EDGE_NONE, EDGE_WALL, EDGE_DOOR, edgeId, edgeCodeAt, edgeInBounds,
  wallAt, isNormalOf, edgeOf
} from "../lib/edges.js";
import { rampsOf, levelsUsed } from "../lib/levels.js";
import { SITES, EXCLUSIVE, checkSites, restsOn } from "../rulesets/sites.js";
import { DC, DR, N, E, S, W, dirLetter } from "../lib/dir.js";
import { REGISTER_COUNT } from "../lib/registers.js";

const at = (c, r) => "(" + c + "," + r + ")";
const DIRS = [N, E, S, W];

/**
 * Register list, with a code per failure mode rather than one code for "bad
 * registers". The selftest needs to provoke each separately, and a single code
 * would let one test satisfy five.
 */
function checkRegs(d, regs, mode, what, ptr, why) {
  if (regs === undefined) {
    if (mode === REGS_REQUIRED) {
      d.error("regs.missing", what + " must name the registers it stands open in: " +
        (why || "it acts in some registers and not others."), null, ptr);
    }
    return;
  }
  if (mode === REGS_NONE) {
    d.error("regs.notAllowed", what + " fires every register and may not carry a register list.", null, ptr);
    return;
  }
  if (!Array.isArray(regs)) {
    d.error("regs.notArray", what + " has a register list that is not an array.", null, ptr);
    return;
  }
  let bad = false;
  for (const n of regs) {
    if (!Number.isInteger(n) || n < 1 || n > REGISTER_COUNT) {
      d.error("regs.badNumber", what + " lists " + JSON.stringify(n) +
        ", which is not a register 1-" + REGISTER_COUNT + ".", null, ptr);
      bad = true;
    }
  }
  if (bad) return;
  if (!regs.length) {
    d.error("regs.empty", what + " has an empty register list. Omit `regs` instead -- " +
      "that is the one spelling of firing in every register.", null, ptr);
    return;
  }
  for (let i = 1; i < regs.length; i++) {
    if (regs[i] <= regs[i - 1]) {
      d.error("regs.unordered", what + " has a register list that is not ascending with no repeats.", null, ptr);
      return;
    }
  }
  if (regs.length === REGISTER_COUNT) {
    d.error(mode === REGS_REQUIRED ? "regs.missing" : "regs.all",
      what + " lists all five registers. " +
      (mode === REGS_REQUIRED ? (why ? "But " + why : "It must act in some and not others.") : "Omit `regs` instead."), null, ptr);
  }
}

/* Provenance only. There is nothing here about which game the board is "for",
 * because a board is not for a game. */
function checkMeta(board, d) {
  if (!SETS[board.set]) {
    d.error("meta.unknownSet", "Set " + JSON.stringify(board.set) + " is not in the set table.", null, "/set");
  }
}

function checkGround(board, d) {
  const pairs = new Map();
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const tok = cellAt(board, c, r);
      const ptr = "/ground/rows/" + r;
      if (isVoidToken(tok)) {
        if (!board.allowVoid) {
          d.error("ground.voidNotAllowed", "A hole at " + at(c, r) +
            ". A printed board has a square everywhere; only an assembled course has holes.", at(c, r), ptr);
        }
        continue;
      }
      const t = readToken(tok);
      if (!t) continue;                              // the parser already said so
      const def = ELEMENTS[t.ch];
      if (!def) {
        d.error("ground.unknownElement", "Element " + JSON.stringify(t.ch) + " at " + at(c, r) +
          " is not in the legend.", at(c, r), ptr);
        continue;
      }
      const argBad = checkArg(def, t.arg);
      if (argBad) {
        d.error("ground.badArgument", def.name + " at " + at(c, r) + " " + argBad + ".", at(c, r), ptr);
      }
      if (!ARM_CODES[t.arms]) {
        d.error("ground.badArms", "Arms character " + JSON.stringify(t.arms) + " at " + at(c, r) +
          " is not one of . l r L R x X.", at(c, r), ptr);
      } else if (t.arms !== "." && !def.props.belt) {
        d.error("ground.armsOnNonBelt", def.name + " at " + at(c, r) +
          " carries belt arms, and only a conveyor has arms.", at(c, r), ptr);
      }
      if (def.arg === ARG_PAIR && !argBad) {
        const key = t.ch + t.arg;
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push(at(c, r));
      }
    }
  }
  for (const [key, places] of pairs) {
    if (places.length !== 2) {
      d.error("ground.pairCount", ELEMENTS[key.charAt(0)].name + " colour " + key.charAt(1) +
        " appears " + places.length + " time(s) (" + places.join(" ") + "); a pair is exactly two.",
        places[0], "/ground/rows");
    }
  }
}

/* A site sits ON plain floor. Every one of them is somewhere a robot comes to
 * rest to collect something, and a belt, a gear or a pit is not somewhere a
 * robot rests. What is NOT refused is more than one on a square: that is the
 * whole point of the layer. */
function checkSquareSites(board, d) {
  for (const s of siteList(board)) {
    const ptr = "/ground/sites";
    const where = at(s.c, s.r);
    if (!inBoard(board, s.c, s.r)) {
      d.error("site.badEntry", "A site is marked at " + where + ", which is off a " +
        board.w + "x" + board.h + " board.", where, ptr);
      continue;
    }
    if (!Array.isArray(s.has) || !s.has.length) {
      d.error("site.empty", where + " is listed in the sites but carries none. " +
        "Leave the square out instead.", where, ptr);
      continue;
    }
    const seen = new Set();
    for (const k of s.has) {
      if (!SITES[k]) {
        d.error("site.unknown", JSON.stringify(k) + " at " + where + " is not a site.", where, ptr);
      } else if (seen.has(k)) {
        d.error("site.repeated", SITES[k].name + " is listed twice at " + where + ".", where, ptr);
      }
      seen.add(k);
    }
    for (const pair of EXCLUSIVE) {
      if (pair.every(k => seen.has(k))) {
        d.error("site.exclusive", where + " is marked with both " +
          pair.map(k => SITES[k].short).join(" and ") +
          ". A square is printed with one or the other, not both.", where, ptr);
      }
    }
    /* WHERE a marking may be printed is a fact about the marking. A collection
     * marking needs floor or still water because a robot has to come to rest on it; a
     * randomizer fires on the card reveal instead, so it needs only a square a
     * robot can be standing on -- which is how Pushy prints them on belts. */
    const def = elementAt(board, s.c, s.r);
    const kinds = [...seen].filter(k => SITES[k]);
    const resting = kinds.filter(k => SITES[k].place === "rest");
    if (resting.length && !restsOn(def)) {
      d.error("site.notFloor", where + " is " + (def ? def.name.toLowerCase() : "not floor") +
        ", and " + resting.map(k => SITES[k].short).join(" and ") +
        " marks floor or water -- somewhere a robot comes to rest.", where, ptr);
    }
    const standable = kinds.filter(k => SITES[k].place === "standable");
    if (standable.length && (!def || def.props.pit)) {
      d.error("site.notStandable", where + " is " + (def ? def.name.toLowerCase() : "not a square") +
        ", and " + standable.map(k => SITES[k].short).join(" and ") +
        " has to be somewhere a robot can be standing.", where, ptr);
    }
  }
}

/* THERE IS NO CONVEYOR GEOMETRY CHECK, and the three that used to be here
 * were each invented. A conveyor running into a wall is what the printed
 * boards do -- the robot rides to the wall and stops there, and the engine
 * resolves that at play time -- so `belt.intoWall` was refusing real boards
 * (gone 2026-09-23). Two conveyors head-on into each other are rare but
 * printed, and the engine resolves the contention (`belt.headOn`, gone). A
 * conveyor across a level change is allowed by everything Wet and Wild says:
 * it carries a robot down off a ledge at the drop's cost, up one over a ramp,
 * and off the board's edge (`belt.acrossLedge`, gone). What remains of a belt
 * is its spelling, checked in checkGround. */

function checkWallLattice(board, d) {
  /* The door glyph and the door's register set are no longer the same
   * character, which is the one drift the layered model introduces. So the
   * pairing is asserted in BOTH directions -- a 'D' with no device, and a
   * device with no 'D'. Either alone would let half the cases through. */
  const doors = new Map();
  for (const dev of board.wallDevices) {
    if (dev.kind !== "door") continue;
    doors.set(edgeId(dev.edge.kind, dev.edge.c, dev.edge.r), dev);
  }
  const seen = new Set();
  for (const kind of ["h", "v"]) {
    const rows = kind === "h" ? board.h + 1 : board.h;
    const cols = kind === "h" ? board.w : board.w + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const edge = { kind, c, r };
        const id = edgeId(kind, c, r);
        if (edgeCodeAt(board, edge) !== EDGE_DOOR) continue;
        seen.add(id);
        if (!doors.has(id)) {
          d.error("wall.doorGlyphNoDevice", "The lattice has a door at " + id +
            " but no door device names that edge, so nothing says which registers it stands open in.",
            id, "/wall/" + (kind === "h" ? "hRows" : "vRows") + "/" + r);
        }
      }
    }
  }
  for (const [id, dev] of doors) {
    if (!seen.has(id)) {
      d.error("wall.doorDeviceNoGlyph", "A door device names edge " + id +
        " but the lattice there is not 'D'.", id, dev._ptr);
    }
  }
  const pairsSeen = new Set();
  for (const dev of board.wallDevices) {
    const key = dev.kind + "|" + edgeId(dev.edge.kind, dev.edge.c, dev.edge.r) + "|" + dev.face;
    if (pairsSeen.has(key)) {
      d.error("wall.duplicateDevice", "Two " + dev.kind + "s on the same edge and face (" +
        edgeId(dev.edge.kind, dev.edge.c, dev.edge.r) + ").", null, dev._ptr);
    }
    pairsSeen.add(key);
  }
}

function checkWallDevices(board, d) {

  for (const dev of board.wallDevices) {
    const def = DEVICE_KINDS[dev.kind];
    const ptr = dev._ptr;
    const label = def.name;

    if (!edgeInBounds(dev.edge, board.w, board.h)) {
      d.error("device.badEdge", label + " is on edge " +
        edgeId(dev.edge.kind, dev.edge.c, dev.edge.r) + ", which is off the lattice of a " +
        board.w + "x" + board.h + " board.", null, ptr);
      continue;
    }
    checkRegs(d, dev.regs, def.regs, label, ptr, def.regsWhy);

    /* fields */
    for (const [key, spec] of Object.entries(def.fields)) {
      const v = dev[key];
      if (v === undefined) {
        if (spec.required) d.error("device.badField", label + " has no `" + key + "`.", null, ptr);
        continue;
      }
      if (!Number.isInteger(v) || v < spec.min || v > spec.max) {
        d.error("device.badField", label + " has " + key + " " + JSON.stringify(v) +
          ", outside " + spec.min + "-" + spec.max + ".", null, ptr);
      }
    }
    for (const key of ["damage", "reach"]) {
      if (dev[key] !== undefined && !(key in def.fields)) {
        d.error("device.badField", label + " carries `" + key + "`, which it has no use for.", null, ptr);
      }
    }

    /* facing */
    /* `dev.face` rather than a parse-only field: the editor validates boards it
     * built itself, and the validator must not need a document to have existed. */
    if (!def.faced) {
      if (dev.face !== null && dev.face !== undefined) {
        d.error("device.faceNotAllowed", label + " is symmetric and takes no face.", null, ptr);
      }
    } else if (dev.face === null || dev.face === undefined) {
      d.error("device.badFace", label + " has no face, or a face that is not N, E, S or W.", null, ptr);
      continue;
    } else if (!isNormalOf(dev.edge.kind, dev.face)) {
      d.error("device.badFace", label + " on " + (dev.edge.kind === "h" ? "a horizontal" : "a vertical") +
        " edge faces " + dirLetter(dev.face) + ", which is along the wall rather than away from it. " +
        "It must face " + (dev.edge.kind === "h" ? "N or S" : "E or W") + ".", null, ptr);
      continue;
    }

    /* the square it stands in, derived from the anchor */
    const cell = def.faced ? deviceCell(dev) : null;
    if (def.faced) {
      if (!cell || !inBoard(board, cell[0], cell[1])) {
        d.error("device.offBoard", label + " on " + edgeId(dev.edge.kind, dev.edge.c, dev.edge.r) +
          " facing " + dirLetter(dev.face) + " stands off the board.", null, ptr);
        continue;
      }
    }

    /* something to bolt to */
    const code = edgeCodeAt(board, dev.edge);
    if (def.needsWall && code !== EDGE_WALL) {
      d.error("device.noMount", label + " at " + at(cell[0], cell[1]) + " has no wall behind it " +
        "to mount on -- the lattice at " + edgeId(dev.edge.kind, dev.edge.c, dev.edge.r) +
        " is " + (code === EDGE_DOOR ? "a door" : "empty") + ".", cell ? at(cell[0], cell[1]) : null, ptr);
    }

    /* Two pushers into one square, and two flame jets over one square, were
     * each refused here. Neither is in a book, and both are things a board
     * could print; gone 2026-09-23. */

    /* A laser walled in on its firing side lights only the square it stands
     * in. That used to draw a warning; it is not one. The printed boards do
     * it on purpose -- nineteen of them across the shipped set -- and a beam
     * that covers one square is a rule the board states, not a slip a
     * transcriber made. */

    if (dev.kind === "jet" && cell) {
      const reach = dev.reach === undefined ? 1 : dev.reach;
      let [cc, rr] = cell;
      for (let i = 0; i < reach; i++) {
        if (!inBoard(board, cc, rr) || isVoid(board, cc, rr)) {
          d.error("jet.blockedReach", label + " reaches " + reach + " squares but square " + (i + 1) +
            " is off the board.", at(cell[0], cell[1]), ptr);
          break;
        }
        if (i + 1 < reach && blockedAt(board, cc, rr, dev.face, 1)) {
          d.error("jet.blockedReach", label + " at " + at(cell[0], cell[1]) + " reaches " + reach +
            " squares but a wall stops the flame after " + (i + 1) + ".", at(cell[0], cell[1]), ptr);
          break;
        }
        cc += DC[dev.face]; rr += DR[dev.face];
      }
      let walls = 0;
      for (const dd of DIRS) if (wallAt(board, cell[0], cell[1], dd) === EDGE_WALL) walls++;
      if (walls > 1) {
        d.warn("jet.boxedIn", "The flame jet at " + at(cell[0], cell[1]) + " has walls on " + walls +
          " sides. A printed flame reads as wall-yellow, so check the photograph for one wall too many.",
          at(cell[0], cell[1]), ptr);
      }
    }
  }
}

function checkCeiling(board, d) {
  const seen = new Map();
  for (const dev of board.ceilingDevices) {
    const def = DEVICE_KINDS[dev.kind];
    const ptr = dev._ptr;
    if (!inBoard(board, dev.c, dev.r)) {
      d.error("ceiling.offBoard", def.name + " at " + at(dev.c, dev.r) + " is off a " +
        board.w + "x" + board.h + " board.", at(dev.c, dev.r), ptr);
      continue;
    }
    checkRegs(d, dev.regs, def.regs, def.name + " at " + at(dev.c, dev.r), ptr, def.regsWhy);
    /* a press over a pit used to be refused; no book says so, and it harms nothing (gone 2026-09-23) */
    const key = dev.kind + "|" + dev.c + "," + dev.r;
    if (seen.has(key)) {
      d.error("ceiling.duplicate", "Two " + def.name.toLowerCase() + "s over " + at(dev.c, dev.r) + ".",
        at(dev.c, dev.r), ptr);
    }
    seen.set(key, dev);
  }
}

function checkLevels(board, d) {
  const used = levelsUsed(board);

  /* THERE IS NO CONTIGUITY RULE, and the one that used to be here was invented.
   * "Levels count up from 0 with no gaps" appears in no rulebook. Wet and Wild
   * prints ledges, and a ledge says only that two squares are on different
   * levels -- never how far apart, and never which of them is the ground. The
   * rule refused Water Park, whose floor drops below the level you walk in on,
   * and it could only be satisfied by re-describing the board: call the channel
   * 0 and lift everything else to 1. A level is a signed offset from the base
   * floor, so a board says what it is instead. */

  /* Reachability is worth a warning, and the seed is the BASE FLOOR rather than
   * the lowest level on the board -- 0 is where a robot walks in. A ledge may
   * always be crossed downward, at two damage, so anything below the base is
   * reachable; upward needs a ramp, and a ramp is only usable if its own foot
   * can be got to, which is why this runs to a fixpoint. */
  const reached = new Set([0]);
  for (const lvl of used) if (lvl < 0) reached.add(lvl);
  const climbs = [];
  for (const ramp of rampsOf(board)) {
    const e = ramp.edge;
    const ptr = "/ground/" + (e.kind === "h" ? "rampH" : "rampV") + "/" + e.r;
    const where = edgeId(e.kind, e.c, e.r);
    const between = "between " + at(ramp.a.c, ramp.a.r) + " and " + at(ramp.b.c, ramp.b.r);
    /* A ramp on the RIM is left alone: boards compose, and it climbs onto or
     * down from whatever board is laid beside this one, which this board
     * cannot know -- as a belt at the rim runs onto the next board. What it
     * does is settled on the course. The two below are ERRORS, and they are
     * not claims about the game: each says the data contradicts itself. A
     * ramp under a wall could never be crossed; a ramp between two squares at
     * one level joins nothing, and a ramp is the way between levels. */
    if (ramp.off) continue;
    if (edgeCodeAt(board, e) !== EDGE_NONE) {
      d.error("ramp.walled", "The ramp " + between + " lies under a wall, so nothing could ever cross it.", where, ptr);
      continue;
    }
    if (ramp.flat) {
      d.error("ramp.flat", "The ramp " + between + " joins two squares at level " + ramp.a.level +
        ". A ramp is the way between levels; raise one side, or take the ramp off.", where, ptr);
      continue;
    }
    /* HOW FAR A RAMP CLIMBS IS NOT CHECKED. `rules/MANIFEST.md` quotes Wet
     * and Wild on ramps -- "the only way between levels", an extra space of
     * floor going up, slide back if you stop on one, ignored entirely going
     * down -- and says nothing about how far one climbs. `level.rampGradient`
     * warned when it was not exactly one level, admitting it was uncited, and
     * is gone (2026-09-23); `level.rampFoot` went before it (2026-09-22), and
     * `level.notContiguous` before that. An uncited rule enforced against the
     * boards it describes is what each of them was. */
    climbs.push(ramp);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const ramp of climbs) {
      if (reached.has(ramp.foot.level) && !reached.has(ramp.top.level)) { reached.add(ramp.top.level); grew = true; }
    }
  }
  if (used.length <= 1) return;
  for (const lvl of used) {
    if (!reached.has(lvl)) {
      d.warn("level.unreachable", "Level " + lvl + " is on this board and no ramp reaches it. " +
        "A ledge cannot be crossed upward, so nothing can get there.", null, "/ground/levels");
    }
  }
}

/** Every board check, in the order they run. */
export function validateBoard(board, d) {
  checkMeta(board, d);
  checkGround(board, d);
  checkSquareSites(board, d);
  checkWallLattice(board, d);
  checkWallDevices(board, d);
  checkCeiling(board, d);
  checkLevels(board, d);
  return d;
}
