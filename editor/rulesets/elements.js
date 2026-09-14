/* The ground legend: every element either edition prints, as documented by the
 * rulebook and expansion sheets photographed in `rules/` and `manual1/`.
 *
 * An element is asked about by its PROPERTIES, never by its character. A drain
 * and a deep pit and a plain pit are all `pit: true`, so a rule that asks "is
 * this a pit" needs no list of which characters count. The character exists to
 * be typed and diffed; the properties exist to be reasoned about.
 *
 * TWO ELEMENTS THAT SHARE A NAME ACROSS EDITIONS GET TWO ENTRIES.
 * Classic oil stops a sliding robot at the first robot it meets; modern oil
 * pushes that robot and both slide on. Classic portals switch off while a robot
 * stands on one; modern portals refuse only when the destination is occupied.
 * Same word, different element. One character carrying both is how a board
 * would quietly play the wrong game, so `oil` and `portal` each appear twice
 * with the edition in the key.
 *
 * CONVEYORS ARE DELIBERATELY *NOT* SPLIT that way, though both editions print
 * them and resolve them differently. The difference there is one of ORDER
 * (classic runs express alone then express-and-normal together; modern runs
 * double-arrow belts before single-arrow ones) and of whether a belt pushes.
 * Both are properties of the ruleset reading the board, not of the square, and
 * a board declares exactly one edition — so the ruleset is never in doubt.
 * Splitting them would double the legend and record no extra fact.
 */

import { dirOfChar } from "../lib/dir.js";

/** Argument kinds a legend character may take in the token's second position. */
export const ARG_NONE = "none";
export const ARG_DIR = "dir";
export const ARG_DIGIT = "digit";
export const ARG_PAIR = "pair";

const BOTH = ["classic", "modern"];
const CLASSIC = ["classic"];
const MODERN = ["modern"];

/**
 * char -> definition. `key` is the stable identifier used by diagnostics, the
 * renderer and the editor rail; the character may in principle be re-spelled,
 * the key may not.
 */
export const ELEMENTS = {
  ".": { key: "floor", name: "Floor", arg: ARG_NONE, editions: BOTH,
         props: { floor: true },
         source: "Both rulebooks." },

  "o": { key: "pit", name: "Pit", arg: ARG_NONE, editions: BOTH,
         props: { pit: true },
         source: "Both rulebooks. Chaos and Carnage's deep pits are pits in every respect." },

  "b": { key: "conveyor", name: "Conveyor", arg: ARG_DIR, editions: BOTH,
         props: { belt: 1 },
         source: "Both rulebooks. One space; the ruleset decides when it runs." },

  "B": { key: "expressConveyor", name: "Express conveyor", arg: ARG_DIR, editions: BOTH,
         props: { belt: 2 },
         source: "Both rulebooks. Two spaces; the modern double-arrow belt." },

  "l": { key: "gearCCW", name: "Gear, anticlockwise", arg: ARG_NONE, editions: BOTH,
         props: { gear: -1 },
         source: "Both rulebooks. The modern board Gear Box prints them." },

  "r": { key: "gearCW", name: "Gear, clockwise", arg: ARG_NONE, editions: BOTH,
         props: { gear: 1 },
         source: "Both rulebooks." },

  "s": { key: "dockingBay", name: "Docking bay", arg: ARG_DIGIT, editions: BOTH,
         props: { dock: true },
         source: "Both games ship a docking bay board." },

  /* --- Classic only ------------------------------------------------------ */

  "w": { key: "repairSite", name: "Repair site", arg: ARG_NONE, editions: CLASSIC,
         props: { repair: 1 },
         source: "Classic pp.28-29. Removed from the boards entirely in 2016." },

  "W": { key: "upgradeSite", name: "Upgrade site", arg: ARG_NONE, editions: CLASSIC,
         props: { repair: 2, option: true },
         source: "Classic p.36: two wrenches, repair 2 or take an option card." },

  "L": { key: "oilClassic", name: "Oil slick", arg: ARG_NONE, editions: CLASSIC,
         props: { oil: "classic" },
         source: "Crash and Burn (AMIGO Spielanleitung). Slides on; stops at a robot." },

  "t": { key: "portalClassic", name: "Portal", arg: ARG_PAIR, editions: CLASSIC,
         props: { portal: "classic" },
         source: "Crash and Burn. Switches off while a robot stands on one." },

  /* --- Modern only ------------------------------------------------------- */

  "E": { key: "energySpace", name: "Energy space", arg: ARG_NONE, editions: MODERN,
         props: { energy: 1 },
         source: "Modern Game Guide. Take an energy cube for ending a register on it." },

  "~": { key: "water", name: "Water", arg: ARG_NONE, editions: MODERN,
         props: { water: true },
         source: "Wet and Wild. Leaving costs a space of movement, once per Move card." },

  "D": { key: "drain", name: "Drain", arg: ARG_NONE, editions: MODERN,
         props: { pit: true, water: true },
         source: "Wet and Wild. A pit that sits in water, and a pit in every respect." },

  "R": { key: "ramp", name: "Ramp", arg: ARG_DIR, editions: MODERN,
         props: { ramp: true },
         source: "Wet and Wild. The only way between levels; the arrow points uphill." },

  "C": { key: "current", name: "Current", arg: ARG_DIR, editions: MODERN,
         props: { belt: 1, water: true, current: true },
         source: "Wet and Wild. A belt running through water; also a water space." },

  "z": { key: "randomizer", name: "Randomizer", arg: ARG_NONE, editions: MODERN,
         props: { randomize: true },
         source: "Chaos and Carnage. Replaces the register with the top card of your deck." },

  "T": { key: "teleporter", name: "Teleporter", arg: ARG_PAIR, editions: MODERN,
         props: { teleport: true },
         source: "Chaos and Carnage. Adds two forward to a revealed Move card." },

  "P": { key: "portalModern", name: "Portal", arg: ARG_PAIR, editions: MODERN,
         props: { portal: "modern" },
         source: "Thrills and Spills. Keeps your facing and does not consume movement." },

  "%": { key: "oilModern", name: "Oil slick", arg: ARG_NONE, editions: MODERN,
         props: { oil: "modern" },
         source: "Thrills and Spills. Pushes a robot it meets, and both slide on." },

  "A": { key: "priorityAntenna", name: "Priority antenna", arg: ARG_NONE, editions: MODERN,
         props: { antenna: true },
         source: "Modern Game Guide box contents. The variant printing uses a token instead." },

  "@": { key: "rebootToken", name: "Reboot token", arg: ARG_DIR, editions: MODERN,
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

/** Is this element legal on a board of this edition? */
export function elementAllowed(def, edition) {
  if (edition === "both") return def.editions.length === 2;
  return def.editions.indexOf(edition) >= 0;
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
      return ch >= "1" && ch <= "8" ? null : "needs a bay number 1-8";
    case ARG_PAIR:
      return ch >= "1" && ch <= "9" ? null : "needs a pair colour 1-9";
    default:
      return "has an unknown argument kind " + JSON.stringify(def.arg);
  }
}
