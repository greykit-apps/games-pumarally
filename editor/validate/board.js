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
import { isLedge, rampsOf, levelsUsed, rampDir } from "../lib/levels.js";
import { SITES, EXCLUSIVE, checkSites } from "../rulesets/sites.js";
import { DC, DR, N, E, S, W, opposite, dirLetter } from "../lib/dir.js";
import { REGISTER_COUNT } from "../lib/registers.js";

const at = (c, r) => "(" + c + "," + r + ")";
const DIRS = [N, E, S, W];

/**
 * Register list, with a code per failure mode rather than one code for "bad
 * registers". The selftest needs to provoke each separately, and a single code
 * would let one test satisfy five.
 */
function checkRegs(d, regs, mode, what, ptr) {
  if (regs === undefined) {
    if (mode === REGS_REQUIRED) {
      d.error("regs.missing", what + " must name the registers it stands open in: " +
        "open in every register is not a door, and open in none is a wall.", null, ptr);
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
      what + " lists all five registers. Omit `regs` instead.", null, ptr);
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

/* Exported so a course can run it over the ASSEMBLED grid. A conveyor running
 * off one board into a wall on the next is the same fault as one doing it
 * inside a board, and it is worth having exactly one implementation of. */
export /* A site sits ON plain floor. Every one of them is somewhere a robot comes to
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
    const def = elementAt(board, s.c, s.r);
    if (!def || def.key !== "floor") {
      d.error("site.notFloor", where + " is " + (def ? def.name.toLowerCase() : "not floor") +
        ", and a site marks plain floor -- it is somewhere a robot comes to rest.", where, ptr);
    }
  }
}

export function checkBelts(board, d) {
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const speed = tokenBeltSpeed(cellAt(board, c, r));
      if (!speed) continue;
      const dir = beltDir(board, c, r);
      if (dir === undefined) continue;                 // bad argument, already reported
      const ptr = "/ground/rows/" + r;
      if (wallAt(board, c, r, dir) === EDGE_WALL) {
        d.error("belt.intoWall", "The conveyor at " + at(c, r) + " runs " + dirLetter(dir) +
          " into a wall.", at(c, r), ptr);
        continue;
      }
      const nc = c + DC[dir], nr = r + DR[dir];
      if (!inBoard(board, nc, nr) || isVoid(board, nc, nr)) continue;
      if (isLedge(board, c, r, dir)) {
        d.error("belt.acrossLedge", "The conveyor at " + at(c, r) + " runs " + dirLetter(dir) +
          " across a level change. A belt cannot climb, and a ramp is the only way between levels.",
          at(c, r), ptr);
      }
      const nextSpeed = tokenBeltSpeed(cellAt(board, nc, nr));
      if (nextSpeed) {
        const nextDir = beltDir(board, nc, nr);
        if (nextDir !== undefined && nextDir === opposite(dir) && (c < nc || (c === nc && r < nr))) {
          d.error("belt.headOn", "The conveyors at " + at(c, r) + " and " + at(nc, nr) +
            " run into each other.", at(c, r), ptr);
        }
        if (speed === 2 && nextSpeed === 1) {
          d.warn("belt.expressFeedsNormal", "The express conveyor at " + at(c, r) +
            " feeds the normal conveyor at " + at(nc, nr) + ".", at(c, r), ptr);
        }
      }
    }
  }
}

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
  const pusherCells = new Map();
  const jetCover = new Map();

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
    checkRegs(d, dev.regs, def.regs, label, ptr);

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

    if (dev.kind === "pusher" && cell) {
      const key = cell.join(",");
      if (pusherCells.has(key)) {
        d.error("device.duplicatePusher", "Two pushers stand in " + at(cell[0], cell[1]) + ".",
          at(cell[0], cell[1]), ptr);
      }
      pusherCells.set(key, dev);
    }

    if (dev.kind === "laser" && cell) {
      const path = laserPath(board, dev);
      if (path.length <= 1) {
        d.warn("laser.ownSquareOnly", "The laser at " + at(cell[0], cell[1]) + " faces " +
          dirLetter(dev.face) + " into a wall, so its beam lights only the square it stands in.",
          at(cell[0], cell[1]), ptr);
      }
    }

    if (dev.kind === "jet" && cell) {
      const reach = dev.reach === undefined ? 1 : dev.reach;
      const covered = [];
      let [cc, rr] = cell;
      for (let i = 0; i < reach; i++) {
        if (!inBoard(board, cc, rr) || isVoid(board, cc, rr)) {
          d.error("jet.blockedReach", label + " reaches " + reach + " squares but square " + (i + 1) +
            " is off the board.", at(cell[0], cell[1]), ptr);
          break;
        }
        covered.push(cc + "," + rr);
        if (i + 1 < reach && blockedAt(board, cc, rr, dev.face, 1)) {
          d.error("jet.blockedReach", label + " at " + at(cell[0], cell[1]) + " reaches " + reach +
            " squares but a wall stops the flame after " + (i + 1) + ".", at(cell[0], cell[1]), ptr);
          break;
        }
        cc += DC[dev.face]; rr += DR[dev.face];
      }
      for (const key of covered) {
        if (jetCover.has(key)) {
          const [x, y] = key.split(",");
          d.error("jet.overlap", "Two flame jets play over " + at(+x, +y) + ".", at(+x, +y), ptr);
        }
        jetCover.set(key, dev);
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
    checkRegs(d, dev.regs, def.regs, def.name + " at " + at(dev.c, dev.r), ptr);
    if (propAt(board, dev.c, dev.r, "pit")) {
      d.error("ceiling.overPit", def.name + " at " + at(dev.c, dev.r) +
        " hangs over a pit, and there is nothing under it to come down on.", at(dev.c, dev.r), ptr);
    }
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
  /* THE RAMPS ARE CHECKED WHATEVER THE LEVELS SAY. This used to return here on
   * a flat board, before the ramps were looked at -- so a ramp with nothing
   * uphill of it, or pointing off the board, passed clean precisely on the
   * boards where it is most obviously wrong. Reachable from the tool: lay a
   * ramp, then lower its uphill square, or turn the ramp toward the rim. */
  const flat = used.length <= 1;
  for (let i = 0; !flat && i < used.length; i++) {
    if (used[i] !== i) {
      d.error("level.notContiguous", "This board uses level " + used[i] +
        " with no level " + i + " on it. Levels count up from 0 with no gaps.", null, "/ground/levels");
      break;
    }
  }
  const reached = new Set([used[0]]);
  for (const ramp of rampsOf(board)) {
    const ptr = "/ground/rows/" + ramp.r;
    if (ramp.top === null) {
      d.error("level.rampGradient", "The ramp at " + at(ramp.c, ramp.r) + " points off the board.",
        at(ramp.c, ramp.r), ptr);
      continue;
    }
    if (ramp.top !== ramp.foot + 1) {
      d.error("level.rampGradient", "The ramp at " + at(ramp.c, ramp.r) + " stands at level " +
        ramp.foot + " and points uphill at level " + ramp.top +
        ". A ramp climbs exactly one level; its own square is the lower one.", at(ramp.c, ramp.r), ptr);
      continue;
    }
    if (ramp.behind !== null && ramp.behind !== ramp.foot) {
      d.error("level.rampFoot", "The ramp at " + at(ramp.c, ramp.r) + " stands at level " +
        ramp.foot + " but the square behind it is at level " + ramp.behind +
        ". A ramp's foot is level with the floor it is approached from.", at(ramp.c, ramp.r), ptr);
      continue;
    }
    reached.add(ramp.top);
  }
  if (flat) return;
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
  checkBelts(board, d);
  checkWallLattice(board, d);
  checkWallDevices(board, d);
  checkCeiling(board, d);
  checkLevels(board, d);
  return d;
}
