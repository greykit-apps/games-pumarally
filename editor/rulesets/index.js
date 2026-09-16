/* Rulesets are a LENS, not a filter.
 *
 * A board does not belong to a ruleset. It is a board: it can carry batteries
 * and wrenches at once, and deciding which of them matter is the engine's
 * business at play time, under whichever ruleset the game is being played by.
 * Nothing here refuses anything.
 *
 * What a ruleset is FOR, in the editor, is answering "what would a robot
 * standing on this square meet, and in what order" -- which is a question with
 * two different answers, so the editor lets you look through either.
 */

import classic from "./classic.js";
import modern from "./modern.js";
import { EDITIONS } from "./sets.js";
import { ELEMENTS } from "./elements.js";
import { DEVICE_KINDS } from "./devices.js";

export const RULESETS = { classic, modern };

export function rulesetFor(id) {
  return RULESETS[id] || RULESETS.classic;
}

/** Every ruleset, as ids. The editor offers these as a viewing lens. */
export function rulesetIds() {
  return Object.keys(RULESETS);
}

/**
 * Which printings the things on this board come from, as ids, ascending.
 * INFORMATION, not a verdict: a board carrying both is perfectly ordinary and
 * is exactly what a mixed course is made of. The inspector shows it so a
 * transcriber can see at a glance that a square they just laid came out of a
 * different box from the rest -- which is usually worth a second look at the
 * photograph, and is never an error.
 */
export function printingsOn(board) {
  const seen = new Set();
  for (const tok of board.cells) {
    const def = ELEMENTS[tok.charAt(0)];
    if (def && def.printedIn.length === 1) seen.add(def.printedIn[0]);
  }
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) {
    const def = DEVICE_KINDS[dev.kind];
    if (def && def.printedIn.length === 1) seen.add(def.printedIn[0]);
  }
  return [...seen].sort();
}

/**
 * The editions whose RULES can resolve everything on this board, ascending.
 *
 * NOT `printingsOn`. That one is provenance -- which box printed the things on
 * the board -- and is shown to a transcriber. This is the question the game
 * asks before it offers a board: is there anything here the edition in force
 * has no rule for? The two answers differ wherever a device declares a
 * `playsIn` wider than its `printedIn`, which today is the fire substitute
 * (see devices.js). Empty means no book can play it.
 */
export function playableIn(board) {
  let out = rulesetIds();
  const narrow = def => { if (def) out = out.filter(id => (def.playsIn || def.printedIn).indexOf(id) >= 0); };
  for (const tok of board.cells) narrow(ELEMENTS[tok.charAt(0)]);
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) narrow(DEVICE_KINDS[dev.kind]);
  return out.sort();
}

/**
 * The first thing on the board that only the OTHER printing prints, as a short
 * phrase, or null. Used to name an example in the inspector's note, never to
 * refuse anything.
 */
export function firstPrintedOnlyIn(board, edition) {
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const def = ELEMENTS[board.cells[r * board.w + c].charAt(0)];
      if (def && def.printedIn.length === 1 && def.printedIn[0] === edition) {
        return { what: def.name, where: "(" + c + "," + r + ")" };
      }
    }
  }
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) {
    const def = DEVICE_KINDS[dev.kind];
    if (def && def.printedIn.length === 1 && def.printedIn[0] === edition) {
      return { what: def.name, where: null };
    }
  }
  return null;
}

/* Every ruleset must name a real printing and every printing must have a
 * ruleset. A ruleset nobody can print a board for and a printing nobody can
 * play are the same bug from two ends, and this is still worth asserting even
 * though neither now constrains a board. */
for (const id of Object.keys(RULESETS)) {
  if (!EDITIONS[id]) throw new Error("ruleset " + id + " names no printing");
}
for (const id of Object.keys(EDITIONS)) {
  if (!RULESETS[id]) throw new Error("printing " + id + " has no ruleset");
}
