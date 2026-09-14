/* Direction math.
 *
 * The one place in the tree that knows "+1 is a right turn". Every rotation,
 * every belt turn, every device facing goes through these, because four
 * hand-written quarter-turns are four chances to be wrong and only one of them
 * has to be for a board to play differently from the way it is printed.
 *
 * N/E/S/W are 0/1/2/3 in that order precisely so that a right turn is +1 and a
 * left turn is -1. Nothing may depend on the numbers beyond that.
 */

export const N = 0, E = 1, S = 2, W = 3;

/** Index by direction. The order is the N/E/S/W numbering above. */
export const DIR_LETTERS = ["N", "E", "S", "W"];

/** Arrow glyphs as they appear in a ground token's argument character. */
export const DIR_CHARS = "^>v<";

/** Column delta per direction. */
export const DC = [0, 1, 0, -1];

/** Row delta per direction. Row 0 is the top, so north is -1. */
export const DR = [-1, 0, 1, 0];

/** Letter ("N") to direction (0). Returns undefined for anything else. */
export function dirOfLetter(ch) {
  const i = DIR_LETTERS.indexOf(ch);
  return i < 0 ? undefined : i;
}

/** Arrow glyph ("^") to direction (0). Returns undefined for anything else. */
export function dirOfChar(ch) {
  const i = DIR_CHARS.indexOf(ch);
  return i < 0 ? undefined : i;
}

/** Direction (0) to letter ("N"). */
export function dirLetter(d) {
  return DIR_LETTERS[d];
}

/** Direction (0) to arrow glyph ("^"). */
export function dirChar(d) {
  return DIR_CHARS.charAt(d);
}

/** True for 0..3. Used by the validator before anything indexes on a direction. */
export function isDir(d) {
  return d === 0 || d === 1 || d === 2 || d === 3;
}

/** Turn `d` by `turn` quarters clockwise. `turn` may be negative. */
export function rot(d, turn) {
  return (((d + turn) % 4) + 4) % 4;
}

/** The direction facing back the way `d` came. */
export function opposite(d) {
  return (d + 2) % 4;
}

/**
 * The quarter-turn that takes `a` to `b`, as 0, +1 (right), -1 (left) or 2
 * (about face). Note -1 rather than 3: a turn is a signed quantity here, so
 * that a belt arm on the left produces a negative turn and reads as one.
 */
export function turnBetween(a, b) {
  const t = (((b - a) % 4) + 4) % 4;
  return t === 3 ? -1 : t;
}

/** The cell one step from (c,r) in direction d, as a plain pair. */
export function step(c, r, d) {
  return [c + DC[d], r + DR[d]];
}
