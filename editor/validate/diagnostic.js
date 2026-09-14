/* Diagnostics are CODED OBJECTS, never thrown strings.
 *
 * The old validator threw a string and its self-test matched substrings of the
 * message. That works until two checks share a phrase, at which point a test
 * proving check A can fail is quietly satisfied by check B firing instead --
 * and a check nobody has watched fail is indistinguishable from one that
 * cannot. A code is exact, and it makes the coverage assertion below possible.
 *
 * EVERY CODE IN THIS TABLE MUST HAVE A NEGATIVE TEST that provokes it.
 * `validator-selftest.js` asserts the set of codes it exercises equals the keys
 * of CODES, so adding a check without a test for it fails CI rather than
 * quietly adding coverage nobody has seen work.
 */

export const ERROR = "error";
export const WARNING = "warning";

/**
 * code -> one-line description of what it means. The message a diagnostic
 * carries is written at the call site, because it names the square; this table
 * is the enumeration, not the wording.
 */
export const CODES = Object.freeze({
  /* --- document shape --------------------------------------------------- */
  "doc.notObject":        "the file is not a JSON object",
  "doc.format":           "`format` is missing or not PRBoard/PRCourse",
  "doc.version":          "`version` is missing or not a version this build reads",
  "doc.unknownKey":       "a top-level key the schema does not define",
  "doc.id":               "`id` is missing, malformed, or disagrees with the filename",
  "doc.dimensions":       "`w` or `h` is missing or not a positive integer",
  "doc.meta":             "a metadata field has the wrong type or an unknown value",
  "doc.allowVoid":        "`allowVoid` is true on a board rather than on a course picture",

  /* --- layer shape ------------------------------------------------------ */
  "shape.groundRows":     "`ground.rows` is not h rows",
  "shape.groundWidth":    "a ground row is not 4w-1 characters",
  "shape.groundSeparator":"a ground row has something other than a space between two tokens",
  "shape.levelRows":      "`ground.levels` is not h rows of w characters",
  "shape.levelChar":      "a level character is not a digit",
  "shape.hRows":          "`wall.hRows` is not h+1 rows of w characters",
  "shape.vRows":          "`wall.vRows` is not h rows of w+1 characters",
  "shape.edgeGlyph":      "a wall lattice character is not one of ' ', '#' or 'D'",

  /* --- ground legend ---------------------------------------------------- */
  "ground.unknownElement":"an element character that is not in the legend",
  "ground.badArgument":   "an element's argument character is wrong for its kind",
  "ground.badArms":       "an arms character that is not one of . l r L R x X",
  "ground.armsOnNonBelt": "an arms character other than '.' on something that is not a belt",
  "ground.pairCount":     "a paired element's colour does not appear exactly twice",
  "ground.voidNotAllowed":"a void token on a board that does not allow them",

  /* --- ground geometry -------------------------------------------------- */
  "belt.intoWall":        "a conveyor runs out into a wall",
  "belt.headOn":          "two conveyors run into each other",
  "belt.expressFeedsNormal": "an express conveyor feeds a normal one",
  "belt.acrossLedge":     "a conveyor runs across a level change",

  /* --- wall lattice ----------------------------------------------------- */
  "wall.doorGlyphNoDevice":"a 'D' in the lattice with no door device on that edge",
  "wall.doorDeviceNoGlyph":"a door device on an edge whose lattice character is not 'D'",
  "wall.duplicateDevice": "two devices of one kind on the same edge and face",

  /* --- wall devices ----------------------------------------------------- */
  "device.unknownKind":   "a device kind that is not in the registry",
  "device.wrongLayer":    "a ceiling kind in the wall layer, or the reverse",
  "device.badEdge":       "a device's edge id is malformed or off the lattice",
  "device.badFace":       "a device's face is missing, or is not a normal of its edge",
  "device.faceNotAllowed":"a face on a kind that takes none",
  "device.offBoard":      "the cell a device stands in is off the board",
  "device.noMount":       "a wall device on an edge with no wall behind it to mount on",
  "device.duplicatePusher":"two pushers standing in one square",
  "device.badField":      "a device field is missing, out of range, or not allowed for its kind",
  "device.unknownKey":    "a key the device schema does not define",

  /* --- lasers ----------------------------------------------------------- */
  "laser.ownSquareOnly":   "a laser walled in on its firing side, lighting only the square it stands in",

  /* --- flame jets ------------------------------------------------------- */
  "jet.blockedReach":     "a reach-two jet whose second square is off the board or behind a wall",
  "jet.overlap":          "two flame jets covering one square",
  "jet.boxedIn":          "a flame jet with walls on more than one side",

  /* --- registers -------------------------------------------------------- */
  "regs.notArray":        "a register list that is not an array",
  "regs.badNumber":       "a register number outside 1-5",
  "regs.unordered":       "a register list that is not ascending with no repeats",
  "regs.empty":           "an empty register list, which must be written by omitting the key",
  "regs.all":             "a register list of all five, which must be written by omitting the key",
  "regs.missing":         "a kind that must name its registers and does not",
  "regs.notAllowed":      "a register list on a kind that takes none",

  /* --- ceiling ---------------------------------------------------------- */
  "ceiling.offBoard":     "a ceiling device off the board",
  "ceiling.overPit":      "a ceiling device over a pit",
  "ceiling.duplicate":    "two ceiling devices of one kind on one square",

  /* --- elevation -------------------------------------------------------- */
  "level.notContiguous":  "a board using a level with no level below it in use",
  "level.rampGradient":   "a ramp whose uphill square is not exactly one level up",
  "level.rampFoot":       "a ramp whose downhill square is not level with it",
  "level.unreachable":    "a level no ramp reaches",

  /* --- provenance ---------------------------------------------------------
   * There is no code for "an element this edition never printed", and there
   * must not be. A board is just a board: it can carry batteries and wrenches
   * at once, and which of them matter is decided at play time by the engine,
   * under whichever ruleset is in force. Refusing here would be this editor
   * taking a decision that is not its to take. */
  "meta.unknownSet":      "a set that is not in the set table",

  /* --- library ---------------------------------------------------------- */
  "library.duplicateId":  "two boards with the same id",
  "library.duplicateBoard":"two boards with identical ground and wall layers",

  /* --- course -------------------------------------------------------------
   * There is deliberately NO code for conveyors meeting head-on across a seam.
   * The belt geometry checks are run over the ASSEMBLED grid, so belt.headOn
   * and belt.intoWall fire at a seam the same way they fire inside a board,
   * from the same code. A second code for the same fault would be a check that
   * can never be the one that fires. */
  "course.unknownBoard":  "a stamp naming a board that is not in the library",
  "course.badRotation":   "a stamp rotation that is not 0-3",
  "course.badPlacement":  "a stamp position that is missing or negative",
  "course.badRole":       "a stamp role that is not board or dock",
  "course.overlap":       "two stamps covering the same square",
  "course.disconnected":  "the course is not one connected area",
  "course.twoDocks":      "more than one docking bay",
  "course.noDock":        "a course with no docking bay",
  "course.bayNumbering":  "docking bays not numbered 1..n with no gaps",
  "course.bayCount":      "fewer docking bays than the course seats",
  "course.bayTrapped":    "a docking bay with no unblocked way out of the dock",
  "course.noFlags":       "a course with no flags",
  "course.flagOffCourse": "a flag off the course or on a void square",
  "course.flagNotFloor":  "a flag on something other than plain floor",
  "course.flagInDock":    "a flag inside the docking bay's footprint",
  "course.flagUnderDevice":"a flag on a square a wall device stands in",
  "course.flagInCorner":  "a flag in the very corner of the board that wrote it",
  "course.flagGap":       "a flag further from the previous one than the ruleset allows",
  "course.flagDuplicate": "two flags on one square"
});

export const ALL_CODES = Object.freeze(Object.keys(CODES));

function make(severity, code, message, where, pointer) {
  if (!CODES[code]) throw new Error("diagnostic uses an unregistered code: " + code);
  return { severity, code, message, where: where || null, pointer: pointer || null };
}

/** A fatal problem. The board may not be loaded, saved or played. */
export function error(code, message, where, pointer) {
  return make(ERROR, code, message, where, pointer);
}

/** Legal, but probably not what the printed board says. */
export function warn(code, message, where, pointer) {
  return make(WARNING, code, message, where, pointer);
}

/** "(3,4)" -- the wording every diagnostic uses for a square. */
export function at(c, r) {
  return "(" + c + "," + r + ")";
}

/** Collects diagnostics and answers whether anything fatal has landed. */
export function sink() {
  const items = [];
  return {
    items,
    push(d) { items.push(d); return d; },
    error(code, message, where, pointer) { return this.push(error(code, message, where, pointer)); },
    warn(code, message, where, pointer) { return this.push(warn(code, message, where, pointer)); },
    get errors() { return items.filter(d => d.severity === ERROR); },
    get warnings() { return items.filter(d => d.severity === WARNING); },
    get ok() { return !items.some(d => d.severity === ERROR); }
  };
}
