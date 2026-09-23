/* Wall and ceiling devices: the things that stand ON a square rather than
 * being the square.
 *
 * `printedIn` is provenance, the same as on an element: it says which printing
 * prints the thing, not which board may carry it. A board is just a board.
 *
 * The split was reached empirically, one board at a time, and each of these is
 * a case no single cell could ever have carried:
 *
 *   - a pusher is bolted to a WALL, and board H prints a conveyor beneath one
 *   - a crusher comes down from ABOVE, and every one on Cannery Row stands on a belt
 *   - a flame jet plays over the floor in front of its nozzle, and one on board G
 *     reaches two squares
 *   - a crusher comes down from above and FACES NOWHERE, which is why no ceiling
 *     device has a `face` field for a transcriber to fill in wrongly
 */

const BOTH = ["classic", "modern"];
const CLASSIC = ["classic"];
const MODERN = ["modern"];

/* `printedIn` IS PROVENANCE AND NEVER MOVES: it says which box prints the
 * thing, and it is transcription. It is not a verdict on who may play it.
 * Every board plays under either book (issue #14), and a device the other
 * box printed works as its own book says it does -- a swing door shuts in
 * the registers printed on it under the 2016 rules too. (There was once a
 * second field, `playsIn`, and a board was offered to a book only when
 * every device on it declared that book. Gone.)
 *
 * One reading is shared, DECLARED HERE AND OURS, not either book's: the
 * flame jet and the flamer. Both are fire over a square and both do one
 * point of damage to a robot in it. They stay two device kinds because the
 * pictures differ in a way a transcriber has to record -- the jet is bolted to
 * a wall, faces, and reaches one square or two; the flamer hangs over a single
 * square and faces nowhere -- but neither rulebook says anything about the
 * other's, so three shipped boards would otherwise be refused to the edition
 * that did not print their fire.
 *
 * So each edition resolves WHATEVER FIRE THE BOARD CARRIES, by its own timing:
 * classic burns a robot that passes through, again for not leaving, and again
 * at the burner's own step after the lasers; the 2016 game burns a robot that
 * enters and once more at the end of the register. The engine asks one
 * question, `fireAt` (game/engine/course.js); the timing stays each book's.
 *
 * This is the press and the crusher's conclusion one step further on. There
 * two names turned out to be one device. Here two devices turn out to be one
 * thing happening, which is a weaker claim and so is declared rather than
 * merged -- the boards still print what they print. A device widened this way
 * must say why in `substitute`, and check-lib.js asserts it. */

/** How a kind may spell its register list. */
export const REGS_NONE = "none";          // the field may not appear at all
export const REGS_OPTIONAL = "optional";  // absent means every register
export const REGS_REQUIRED = "required";  // must be present and a proper subset

export const DEVICE_KINDS = {
  /* --- wall layer ------------------------------------------------------- */

  laser: {
    layer: "wall", name: "Board laser", faced: true, needsWall: true,
    regs: REGS_NONE, fields: { damage: { min: 1, max: 3, required: true } },
    printedIn: BOTH,
    source: "Both rulebooks. Fires every register; one to three barrels."
  },

  pusher: {
    layer: "wall", name: "Pusher", faced: true, needsWall: true,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: BOTH,
    source: "Classic; the modern push panel, printed with its register set the same way."
  },

  jet: {
    layer: "wall", name: "Flame jet", faced: true, needsWall: true,
    regs: REGS_OPTIONAL, fields: { reach: { min: 1, max: 2, default: 1 } },
    printedIn: CLASSIC,
    substitute: "The 2016 game prints no flame jet and reads this one as a flamer: " +
                "fire over a square, on the 2016 timing. Ours, not the book's.",
    source: "Crash and Burn. Board G prints one that reaches two squares."
  },

  door: {
    layer: "wall", name: "Swing door", faced: false, needsWall: false, needsDoor: true,
    regs: REGS_REQUIRED, fields: {},
    printedIn: CLASSIC,
    source: "Crash and Burn. The register list is the registers it stands OPEN in."
  },

  /* --- ceiling layer ---------------------------------------------------- */

  /* THE PRESS AND THE CRUSHER ARE ONE DEVICE, and were two here until the
   * evidence was read rather than the names. Both are a numbered disc overhead
   * that comes down in the registers printed on it and wrecks what is under it.
   * Classic calls it a press, the 2016 game calls it a crusher, and each
   * ruleset's order table says so in its own words -- but both put that beat in
   * the SAME slot, after the gears and before the board lasers.
   *
   * The outcome differs and needs nothing here. The old engine already routes
   * it: `wreck()` destroys under classic and reboots under modern, and pits and
   * the board edge go through the same door. A second device kind would record
   * a difference the engine explicitly refuses to read off the square.
   *
   * The art differs between the boxes, nineteen years apart, and that is not a
   * tile type -- the same conclusion the reference sheets reached about deep
   * pits, which "act like pits in every way" and differ only in how they are
   * drawn. */
  crusher: {
    layer: "ceiling", name: "Crusher", faced: false,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: BOTH,
    source: "Crash and Burn (as a press, over a conveyor on every Cannery Row square); " +
            "Wet and Wild and Chaos and Carnage (as a crusher, a dark dotted disc with a " +
            "register number). Acts after gears and before board lasers in both."
  },

  flamer: {
    layer: "ceiling", name: "Flamer", faced: false,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: MODERN,
    substitute: "The classic game prints no flamer and reads this one as a flame jet: " +
                "fire over a square, on the classic timing. Ours, not the book's.",
    source: "Thrills and Spills. Damages rather than destroys, which is why it is not a crusher."
  }
};

export const WALL_KINDS = Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].layer === "wall");
export const CEILING_KINDS = Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].layer === "ceiling");

export function kindOf(kind) {
  return DEVICE_KINDS[kind];
}

