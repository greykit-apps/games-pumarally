/* Wall, floor and ceiling devices: the things a square's one ground character
 * cannot carry.
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
 *   - a trap door IS its square, but prints the registers it is a pit in, and a
 *     ground token has room for none of them: a floor device, on plain floor
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
    regsWhy: "open in every register is not a door, and open in none is a wall.",
    source: "Crash and Burn. The register list is the registers it stands OPEN in."
  },

  /* A ONE-WAY WALL IS A WALL THAT KNOWS WHICH SIDE IT IS ON. The lattice
   * carries an ordinary `#` -- it IS a wall, to everything that only asks
   * whether an edge is walled -- and this device, bolted to it, says which
   * side is red. `face` points INTO the red square, the one it is placed in,
   * exactly as a pusher faces into the square it shoves: from there the edge
   * is a wall; from the green side beyond it there is nothing there at all.
   * `blockedAt` (lib/board.js) is the one place that reads it, so a mover, a
   * laser and the validator cannot disagree about which way it lets through. */
  oneWay: {
    layer: "wall", name: "One-way wall", faced: true, needsWall: true,
    regs: REGS_NONE, fields: {},
    printedIn: BOTH,
    source: "Radioactive (1998) and its 2016 reprint Contamination. A wall from the red side, " +
            "nothing from the green: robots and lasers both. Rule from the Ultimate RoboRally " +
            "Collection (Justin Alexander, a fan compilation), " +
            "its rulebook p.12; a review of Contamination says the same."
  },

  /* --- floor layer ------------------------------------------------------ */

  /* A TRAP DOOR IS THE FLOOR OF ITS SQUARE, and was a ceiling device until
   * Turn & Burn's own reference sheet was in hand
   * (2026-09-27). It is the square: open floor when it is not active and a pit
   * when it is, so nothing else can be printed there. It is still a device
   * rather than a ground character because it carries a register list, and
   * a ground token has one character for its argument. The validator holds
   * the square under it to plain floor.
   *
   * WHEN IT IS A PIT is the sheet's, not ours: it activates only during the
   * registers printed on the doors, and it activates at the START of the
   * register. A robot still on it then is lost before it can move, and a
   * robot that enters it while it is active falls, as into any pit. Only
   * while active is it a pit to an upgrade. (The author's reading of
   * 2026-09-23 -- opening at the END of the register -- is gone; the sheet
   * contradicts it with a worked example.) The same timing under the classic
   * book: the author's ruling, 2026-09-27, as no Grand Prix sheet is in hand. */
  trapDoor: {
    layer: "floor", name: "Trap door pit", faced: false, ownsSquare: true,
    regs: REGS_REQUIRED, fields: {},
    printedIn: BOTH,
    regsWhy: "active in every register is a pit, and active in none is floor.",
    source: "Turn & Burn (2023), reprinting Grand Prix (1997); also the 30th Anniversary boards. " +
            "Turn & Burn Factory Floor Guide: a pit during the registers " +
            "printed on it, from the start of each, and open floor otherwise."
  },

  /* A REPULSOR FIELD IS AN ITEM IN ITS SQUARE, WITH A FACING -- not a wall,
   * and not bolted to one. It was a wall device standing on a `#` until
   * Bounce House showed otherwise (the author, 2026-09-27): that board prints
   * a field along one side of an edge and a plain wall along the other, where
   * a laser stops. A robot coming at that edge from the wall's side is
   * stopped by the wall and nothing more -- two squares on a Move 3 -- which
   * is a different outcome from being thrown back, so the field belongs to
   * the square it is printed in and faces the edge it lies along.
   *
   * The rule is Turn & Burn's own sheet: a robot that runs
   * into the field on a Move card is pushed straight away from it as many
   * spaces as the card, and loses the rest of its move; one pushed into it
   * goes back as far as the pusher's card, and the pusher's move ends. It
   * stops weapons and laser fire like a wall, and a laser may be mounted on
   * it (Back Stretch). From OUTSIDE its square, crossing the field into it
   * throws a robot back too -- the author's ruling -- unless a wall is printed
   * on that outside, which is then what the robot meets. Anything that is
   * not a Move card -- a belt, a push panel -- meets the field as a wall.
   *
   * ALWAYS ON: no capsule prints register numbers. `face` points at the edge
   * the field lies along. A square may carry two, at a corner. */
  repulsor: {
    layer: "floor", name: "Repulsor field", faced: true, needsWall: false,
    regs: REGS_NONE, fields: {},
    printedIn: BOTH,
    source: "Turn & Burn (2023), reprinting Grand Prix (1997); also the 30th Anniversary boards. " +
            "Turn & Burn Factory Floor Guide: a robot running into it on a Move " +
            "card is pushed straight back that card's value and loses the rest of its move; one pushed " +
            "into it goes back the pusher's card, and the pusher's move ends; a wall to lasers."
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
export const FLOOR_KINDS = Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].layer === "floor");

export function kindOf(kind) {
  return DEVICE_KINDS[kind];
}

