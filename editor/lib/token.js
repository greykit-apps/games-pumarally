/* The ground token: three characters, [element][argument][arms].
 *
 * Fixed width is the whole point. A row is `w` tokens joined by single spaces,
 * so it is exactly 4w-1 characters and every index 4k-1 is a space. A row that
 * loses a character then fails at a named column instead of only "this row is
 * the wrong length", which is the difference between a diagnostic that finds
 * the typo and one that tells you a board has one.
 *
 * ARMS ARE RELATIVE TO THE BELT'S OWN EXIT, and that is load-bearing.
 *
 * The old format kept them in a separate `merges: [{c, r, in: "WS"}]` list
 * naming ABSOLUTE compass sides. Three things went wrong with that, and all
 * three are gone rather than checked:
 *
 *   - Rotation had to remap every arm letter on every quarter-turn. Relative
 *     arms are rotation-invariant: the exit rotates and the arms follow free.
 *   - Course assembly copied the picture and forgot the sparse list, and 243
 *     belt arms silently became plain straights. Arms now live in the cell that
 *     assembly copies.
 *   - An arm on the side the belt RUNS OUT OF was writable, so the validator
 *     needed a check for it. There is now no code point for it.
 *
 * Arms are printed data and are NEVER derived from neighbours. A belt at a
 * board's rim is printed straight, or printed as a merge, and stays that way
 * whatever board is laid beside it -- the printing cannot know. Deriving it
 * made the same board turn a robot on one course and not on another.
 */

import { rot, opposite, turnBetween } from "./dir.js";
import { ELEMENTS, VOID_TOKEN } from "../rulesets/elements.js";

/* A docking bay's number lives in one character: 1-9, then a, b, c for 10, 11
 * and 12. The 2016 Docking Bay has twelve bays in a row; the token has one
 * character for its argument. */
export function bayNumberOf(ch) {
  if (ch >= "1" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "c") return ch.charCodeAt(0) - 96 + 9;
  return NaN;
}
export function bayCharOf(n) {
  return n <= 9 ? String(n) : String.fromCharCode(96 + n - 9);
}

export const TOKEN_WIDTH = 3;

/**
 * Arms character -> which relative arms show an incoming path.
 * There is no code point for "no arms at all": a square with nothing to turn a
 * robot behaves exactly as a plain straight does, so it is spelled as one.
 */
export const ARM_CODES = {
  ".": { back: true,  left: false, right: false },  // plain straight
  "l": { back: false, left: true,  right: false },  // curve, fed from the left
  "r": { back: false, left: false, right: true  },  // curve, fed from the right
  "L": { back: true,  left: true,  right: false },  // T-merge, side feed left
  "R": { back: true,  left: false, right: true  },  // T-merge, side feed right
  "x": { back: false, left: true,  right: true  },  // crossing, no rear feed
  "X": { back: true,  left: true,  right: true  }   // full crossing
};

export const ARM_CHARS = Object.keys(ARM_CODES);

/** Human wording for the inspector and for diagnostics. */
export const ARM_NAMES = {
  ".": "plain straight",
  "l": "curve, fed from the left",
  "r": "curve, fed from the right",
  "L": "T-merge, joined from the left",
  "R": "T-merge, joined from the right",
  "x": "crossing, no rear feed",
  "X": "full crossing"
};

/** The three relative arm slots, in a fixed order so output is canonical. */
export const ARM_SLOTS = ["back", "left", "right"];

/** Is this the void token? Legal only on an assembled course picture. */
export function isVoidToken(tok) {
  return tok === VOID_TOKEN;
}

/**
 * Split a 3-character token. Returns null when it is not three characters, so
 * the caller reports a shape error rather than reading past the end of a row.
 */
export function readToken(tok) {
  if (typeof tok !== "string" || tok.length !== TOKEN_WIDTH) return null;
  return { ch: tok.charAt(0), arg: tok.charAt(1), arms: tok.charAt(2) };
}

/** Build a token. Callers pass "." for an absent argument or absent arms. */
export function writeToken(ch, arg = ".", arms = ".") {
  return ch + arg + arms;
}

/** The element definition for a token, or undefined when it is not in the legend. */
export function tokenElement(tok) {
  const t = readToken(tok);
  return t ? ELEMENTS[t.ch] : undefined;
}

/** Belt speed (1 or 2) for a token, or 0 when it is not a belt. */
export function tokenBeltSpeed(tok) {
  const def = tokenElement(tok);
  return (def && def.props.belt) || 0;
}

/**
 * The relative arm slots that show an incoming path, as {back,left,right}.
 * Returns null for a non-belt or an arms character not in the table.
 */
export function armsOf(tok) {
  if (!tokenBeltSpeed(tok)) return null;
  const t = readToken(tok);
  return ARM_CODES[t.arms] || null;
}

/**
 * The relative side (back/left/right) of an absolute direction, as seen by a
 * belt running out along `exit`. Returns null when `side` is the exit itself,
 * which is the case that has no code point.
 */
export function relativeSide(exit, side) {
  switch (turnBetween(exit, side)) {
    case 2:  return "back";
    case -1: return "left";
    case 1:  return "right";
    default: return null;          // `side` is the exit direction
  }
}

/** The absolute compass direction of a relative arm slot, for a belt exiting `exit`. */
export function absoluteSide(exit, slot) {
  if (slot === "back") return opposite(exit);
  if (slot === "left") return rot(exit, -1);
  if (slot === "right") return rot(exit, 1);
  return undefined;
}

/**
 * The absolute sides showing an incoming path, ascending, for comparison with
 * the old format's `in:"WS"` lists. Returns null for a non-belt.
 */
export function absoluteArms(tok, exit) {
  const a = armsOf(tok);
  if (!a) return null;
  const out = [];
  for (const slot of ARM_SLOTS) if (a[slot]) out.push(absoluteSide(exit, slot));
  return out.sort((x, y) => x - y);
}

/**
 * The arms character for a set of ABSOLUTE incoming sides on a belt exiting
 * `exit`. Used only by the converter reading old data; the editor writes arms
 * relatively and never goes through here. A side equal to the exit has no code
 * point and is dropped, which is the conversion the old data can require.
 */
export function armsFromAbsolute(exit, sides) {
  const want = { back: false, left: false, right: false };
  for (const s of sides) {
    const slot = relativeSide(exit, s);
    if (slot) want[slot] = true;
  }
  if (!want.back && !want.left && !want.right) return ".";
  for (const ch of ARM_CHARS) {
    const a = ARM_CODES[ch];
    if (a.back === want.back && a.left === want.left && a.right === want.right) return ch;
  }
  return null;   // unreachable: the seven codes cover every non-empty subset
}

/**
 * The quarter-turn a robot makes when a belt exiting `exit` carries it in
 * through the arm on absolute side `from`: -1 left, 0 none, +1 right.
 * Returns null when there is no arm on that side, meaning no turn and no claim
 * that the belt is shaped to receive it.
 *
 * Derived, never stored, so the drawn arc and the turn cannot disagree.
 */
export function beltTurn(tok, exit, from) {
  const a = armsOf(tok);
  if (!a) return null;
  const slot = relativeSide(exit, from);
  if (!slot || !a[slot]) return null;
  return turnBetween(opposite(from), exit);
}
