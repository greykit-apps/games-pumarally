/* Picking a ruleset, and asking what a board can be played under.
 *
 * A ruleset nobody can print a board for and a board nobody can read are the
 * same bug seen from two ends, so the editions table and the ruleset table are
 * asserted to agree rather than being kept in step by hand.
 */

import classic from "./classic.js";
import modern from "./modern.js";
import { EDITIONS } from "./sets.js";
import { ELEMENTS } from "./elements.js";
import { DEVICE_KINDS } from "./devices.js";

export const RULESETS = { classic, modern };

export function rulesetFor(edition) {
  return RULESETS[edition];
}

/** Every edition, as ids. "both" is not one -- it is a claim about an element. */
export function editionIds() {
  return Object.keys(EDITIONS);
}

/**
 * Which editions could read this board, from the elements and devices actually
 * on it. Derived, never stored: a stored edition and a board full of batteries
 * can disagree, and the one that is wrong is always the stored one.
 */
export function playableEditions(board) {
  let out = editionIds();
  const narrow = defs => {
    for (const def of defs) out = out.filter(e => def.editions.indexOf(e) >= 0);
  };
  const seen = new Set();
  for (const tok of board.cells) {
    const ch = tok.charAt(0);
    if (ch === " " || seen.has(ch)) continue;
    seen.add(ch);
    if (ELEMENTS[ch]) narrow([ELEMENTS[ch]]);
  }
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) {
    if (DEVICE_KINDS[dev.kind]) narrow([DEVICE_KINDS[dev.kind]]);
  }
  return out;
}

/**
 * The first thing on the board that stops `edition` reading it, as a short
 * phrase, or null when nothing does. Names the offender rather than reporting
 * that one exists.
 */
export function editionBlocker(board, edition) {
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const def = ELEMENTS[board.cells[r * board.w + c].charAt(0)];
      if (def && def.editions.indexOf(edition) < 0) {
        return { what: def.name, where: "(" + c + "," + r + ")" };
      }
    }
  }
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) {
    const def = DEVICE_KINDS[dev.kind];
    if (def && def.editions.indexOf(edition) < 0) return { what: def.name, where: null };
  }
  return null;
}

/* Every ruleset must name a real edition, and every edition must have one.
 * Checked at load rather than by a test, because a mismatch here makes every
 * board unreadable under one of the two games and nothing downstream would say
 * which half was missing. */
for (const id of Object.keys(RULESETS)) {
  if (!EDITIONS[id]) throw new Error("ruleset " + id + " names no edition");
}
for (const id of Object.keys(EDITIONS)) {
  if (!RULESETS[id]) throw new Error("edition " + id + " has no ruleset");
}
