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
 *   - a press comes down from ABOVE, and every one on Cannery Row stands on a belt
 *   - a flame jet plays over the floor in front of its nozzle, and one on board G
 *     reaches two squares
 *   - a crusher comes down from above and FACES NOWHERE, which is why no ceiling
 *     device has a `face` field for a transcriber to fill in wrongly
 */

const BOTH = ["classic", "modern"];
const CLASSIC = ["classic"];
const MODERN = ["modern"];

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
    source: "Crash and Burn. Board G prints one that reaches two squares."
  },

  door: {
    layer: "wall", name: "Swing door", faced: false, needsWall: false, needsDoor: true,
    regs: REGS_REQUIRED, fields: {},
    printedIn: CLASSIC,
    source: "Crash and Burn. The register list is the registers it stands OPEN in."
  },

  /* --- ceiling layer ---------------------------------------------------- */

  press: {
    layer: "ceiling", name: "Press", faced: false,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: CLASSIC,
    source: "Crash and Burn. Cannery Row's discs, every one over a conveyor."
  },

  crusher: {
    layer: "ceiling", name: "Crusher", faced: false,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: MODERN,
    source: "Wet and Wild / Chaos and Carnage. Destroys; acts after gears, before lasers."
  },

  flamer: {
    layer: "ceiling", name: "Flamer", faced: false,
    regs: REGS_OPTIONAL, fields: {},
    printedIn: MODERN,
    source: "Thrills and Spills. Damages rather than destroys, which is why it is not a crusher."
  }
};

export const WALL_KINDS = Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].layer === "wall");
export const CEILING_KINDS = Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].layer === "ceiling");

export function kindOf(kind) {
  return DEVICE_KINDS[kind];
}

