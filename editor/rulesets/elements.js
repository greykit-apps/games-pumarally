/* The ground legend: every element either printing prints, as documented by the
 * rulebook and expansion sheets photographed in `rules/` and `manual1/`.
 *
 * `printedIn` IS PROVENANCE, NOT A CONSTRAINT. It records which printing puts
 * this element on a board, because that is worth knowing; it does not say a
 * board may not carry it. A BOARD IS JUST A BOARD. It can have batteries and
 * wrenches on it at once, and which of them matter is the engine's business at
 * play time, under whichever ruleset the game is being played by. Nothing in
 * this editor refuses an element for belonging to the other game.
 *
 * An element is asked about by its PROPERTIES, never by its character. A drain
 * and a deep pit and a plain pit are all `pit: true`, so a rule that asks "is
 * this a pit" needs no list of which characters count. The character exists to
 * be typed and diffed; the properties exist to be reasoned about.
 *
 * TWO EDITIONS PRINTING THE SAME TILE GET ONE ENTRY, and this was got wrong
 * once. Oil slicks, portals and the overhead disc each had two entries here,
 * one per edition, on the reasoning that the two games resolve them
 * differently. They do -- and that is not a fact about the tile.
 *
 * A BOARD DECLARES NO EDITION. So an element character was the only place an
 * edition claim could still hide, and it was the worst place for it: written
 * per SQUARE rather than per board, so a board could carry a classic oil next
 * to a modern one and mean nothing at all. The two characters were never read
 * off a photograph either. `convert-boards.js` minted them from the old data's
 * `edition` field -- the very field we had just decided was not a fact about
 * the board -- so boardG's oil became `L` and oRing's became `%` because of a
 * metadata string, not because the print differs. The renderer then drew both
 * with the same glyph, and the editor's rail listed "Oil slick" twice with
 * nothing to tell them apart.
 *
 * WHERE THE DIFFERENCE WENT. Into the rulesets, which is where a difference of
 * resolution belongs: `oilSlideAfter` and `portalBlockedBy` in classic.js and
 * modern.js, each carrying the rulebook's own wording. check-lib.js asserts
 * both rulesets define them AND that they disagree, so merging the tiles
 * cannot quietly become forgetting the rule.
 *
 * The test is what the PRINT SHOWS, not what the rule does. Deep pits and
 * drains are `pit` for exactly this reason -- "deep pits act like pits in every
 * way", only the art differs. Conveyors are one element for it too, though the
 * editions run them in a different order and only one of them pushes.
 *
 * REPAIR SITES, UPGRADE SITES AND ENERGY SPACES ARE NOT HERE. They are not one
 * to a square -- the same printed square carries a wrench for one game and a
 * battery for the other -- so they are SITES, markings a square carries in
 * addition to what it is. See rulesets/sites.js. A flag location is the same
 * kind of thing, which is the reason that layer exists at all.
 *
 */

import { dirOfChar } from "../lib/dir.js";

/** Argument kinds a legend character may take in the token's second position. */
export const ARG_NONE = "none";
export const ARG_DIR = "dir";
export const ARG_DIGIT = "digit";
export const ARG_PAIR = "pair";

const BOTH = ["classic", "modern"];
const MODERN = ["modern"];

/**
 * char -> definition. `key` is the stable identifier used by diagnostics, the
 * renderer and the editor rail; the character may in principle be re-spelled,
 * the key may not. `printedIn` is provenance -- see the note above.
 */
export const ELEMENTS = {
  ".": { key: "floor", name: "Floor", arg: ARG_NONE, printedIn: BOTH,
         props: { floor: true },
         source: "Both rulebooks." },

  "o": { key: "pit", name: "Pit", arg: ARG_NONE, printedIn: BOTH,
         props: { pit: true },
         source: "Both rulebooks. Chaos and Carnage's deep pits are pits in every respect." },

  "b": { key: "conveyor", name: "Conveyor", arg: ARG_DIR, printedIn: BOTH,
         props: { belt: 1 },
         source: "Both rulebooks. One space; the ruleset decides when it runs." },

  "B": { key: "expressConveyor", name: "Express conveyor", arg: ARG_DIR, printedIn: BOTH,
         props: { belt: 2 },
         source: "Both rulebooks. Two spaces; the modern double-arrow belt." },

  "l": { key: "gearCCW", name: "Gear, anticlockwise", arg: ARG_NONE, printedIn: BOTH,
         props: { gear: -1 },
         source: "Both rulebooks. The modern board Gear Box prints them." },

  "r": { key: "gearCW", name: "Gear, clockwise", arg: ARG_NONE, printedIn: BOTH,
         props: { gear: 1 },
         source: "Both rulebooks." },

  "s": { key: "dockingBay", name: "Docking bay", arg: ARG_DIGIT, printedIn: BOTH,
         props: { dock: true },
         source: "Both games ship a docking bay board." },

  /* Both games print an oil slick and both print a portal, and each prints ONE
   * of them -- there is no classic oil and modern oil to tell apart on a board.
   * What differs is the resolution, and that lives in the rulesets: see
   * `oilSlideAfter` and `portalBlockedBy`. */

  "L": { key: "oil", name: "Oil slick", arg: ARG_NONE, printedIn: BOTH,
         props: { oil: true },
         source: "Crash and Burn (AMIGO Spielanleitung) and Thrills and Spills. " +
                 "Start on it and a Move card is a space shorter, once; end on it and you slide." },

  "t": { key: "portal", name: "Portal", arg: ARG_PAIR, printedIn: BOTH,
         props: { portal: true },
         source: "Crash and Burn and Thrills and Spills. Steps you to the matching colour " +
                 "keeping your facing, spending no movement. The 2016 hex is a flat orange " +
                 "tile with coloured balls at its corners -- not the round vortex, which is " +
                 "a teleporter and a different element." },

  /* --- Modern only ------------------------------------------------------- */

  "~": { key: "water", name: "Water", arg: ARG_NONE, printedIn: MODERN,
         props: { water: true },
         source: "Wet and Wild. Leaving costs a space of movement, once per Move card." },

  "D": { key: "drain", name: "Drain", arg: ARG_NONE, printedIn: MODERN,
         props: { pit: true, water: true },
         source: "Wet and Wild. A pit that sits in water, and a pit in every respect." },

  /* NO RAMP HERE. A ramp is an EDGE -- the way across one level change -- and
   * lives on its own lattice beside the walls (`ground.rampH`/`rampV`, see
   * lib/edges.js). It was a ground element once, `R` with an uphill arrow, and
   * that could not spell a square with ramps on two sides, which the printed
   * boards have. Which way is up is read off the levels, as a ledge is. */

  "C": { key: "current", name: "Current", arg: ARG_DIR, printedIn: MODERN,
         props: { belt: 1, water: true, current: true },
         source: "Wet and Wild. A belt running through water; also a water space." },

  /* THE RANDOMIZER IS NOT HERE. It was `z`, a ground element, and one ground
   * token holds one element -- so a square could be a conveyor or a randomizer
   * and not both. Pushy prints them directly on belt squares, which made that
   * board unrepresentable. It is a marking a square carries in addition to what
   * it is, exactly like a wrench, so it lives in rulesets/sites.js. Leaving `z`
   * here as well would give one thing two spellings, and `propAt` merges both
   * layers, so nothing could tell which the board meant. */

  /* THE TELEPORTER DOES NOT PAIR, and modelling it as a pair was wrong. The
   * portal (`t`) steps you to a matching colour and therefore needs a twin;
   * the teleporter has no destination at all. It MODIFIES the card you just
   * revealed -- a Move throws you two squares further forward than it says --
   * so there is nothing for a second one to be the other end of. A board may
   * print one of them or nine, and Labyrinth prints nine identical ones. */
  "T": { key: "teleporter", name: "Teleporter", arg: ARG_NONE, printedIn: MODERN,
         props: { teleport: true },
         source: "Chaos and Carnage. Adds two forward to a revealed Move card. " +
                 "Unpaired: it has no destination, so it is not a portal and takes no colour." },

  "A": { key: "priorityAntenna", name: "Priority antenna", arg: ARG_NONE, printedIn: MODERN,
         props: { antenna: true },
         source: "Modern Game Guide box contents. The variant printing uses a token instead." },

  "@": { key: "rebootToken", name: "Reboot token", arg: ARG_DIR, printedIn: MODERN,
         props: { reboot: true },
         source: "Modern rulebook. One per board; the arrow shoves an obstructing robot." }
};

/** key -> char, built once. Diagnostics and the editor rail address by key. */
export const CHAR_OF_KEY = Object.freeze(Object.fromEntries(
  Object.entries(ELEMENTS).map(([ch, def]) => [def.key, ch])
));

/** The void token's element character has no entry; this is the test for it. */
export const VOID_TOKEN = "   ";

/** Definition for a character, or undefined when it is not in the legend. */
export function elemOf(ch) {
  return ELEMENTS[ch];
}

/** Every character in the legend, in declaration order. */
export function elementChars() {
  return Object.keys(ELEMENTS);
}

/**
 * Check a token's argument character against its element's `arg` kind.
 * Returns a short reason, or null when it is acceptable. Pulled out of the
 * parser so the editor's rail can ask before it writes a square rather than
 * writing one and reading the complaint back.
 */
export function checkArg(def, ch) {
  switch (def.arg) {
    case ARG_NONE:
      return ch === "." ? null : "takes no argument, so it needs a '.'";
    case ARG_DIR:
      return dirOfChar(ch) === undefined ? "needs a direction, one of ^ > v <" : null;
    case ARG_DIGIT:
      return (ch >= "1" && ch <= "9") || (ch >= "a" && ch <= "c") ? null : "needs a bay number: 1-9, then a b c for 10-12";
    case ARG_PAIR:
      return ch >= "1" && ch <= "9" ? null : "needs a pair colour 1-9";
    default:
      return "has an unknown argument kind " + JSON.stringify(def.arg);
  }
}
