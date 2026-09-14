/* A cog: eight teeth as one filled path, a hub over them, and the direction
 * arrow on top.
 *
 * WHICH WAY IT TURNS IS A RULE THE PLAYER READS OFF THE BOARD, so the arrow is
 * the loudest thing on the tile. Ported from the prototype, along with the note
 * that earned it: an earlier pass there drew a short arc inside a ring of ticks
 * and the two directions were indistinguishable at tile size, which is a rules
 * bug wearing an art bug's clothes. The arc sweeps 250 degrees, far enough that
 * the eye follows it round.
 *
 * THE HEAD SITS EXACTLY ON THE ARC'S END POINT, and its direction is the
 * tangent there -- the radius at that angle, turned a quarter the way the gear
 * turns. Compute the head's position independently of the arc and it lands near
 * the end rather than on it, and the arrow reads as two disconnected marks.
 * That is what was wrong with the first version of this glyph: the arc finished
 * at (28,62) and the chevron's vertex was written at (28,64), two units adrift
 * and drawn as a separate subpath.
 */

export const TEETH = 8;
export const TOOTH_IN = 30;    // root radius
export const TOOTH_OUT = 42;   // tip radius
export const HUB_R = 26;
export const ARROW_R = 20;
export const SWEEP = 250 * Math.PI / 180;
export const HEAD = 13;

function polar(a, rad) {
  return (50 + Math.cos(a) * rad).toFixed(1) + " " + (50 + Math.sin(a) * rad).toFixed(1);
}

/** The cog's teeth, as one closed filled path. */
export function cogPath() {
  const pts = [];
  for (let i = 0; i < TEETH * 2; i++) {
    const a0 = (i - 0.34) * Math.PI / TEETH, a1 = (i + 0.34) * Math.PI / TEETH;
    const rad = (i % 2) ? TOOTH_IN : TOOTH_OUT;
    pts.push(polar(a0, rad), polar(a1, rad));
  }
  return "M" + pts.join("L") + "Z";
}

/**
 * The turn arrow, as ONE path: the arc and the head in a single `d`, so they
 * cannot drift apart and are stroked with the same join.
 * `turn` is +1 clockwise, -1 anticlockwise.
 */
export function turnPath(turn) {
  const cw = turn > 0;
  const s0 = (cw ? 60 : 120) * Math.PI / 180;
  const s1 = cw ? s0 + SWEEP : s0 - SWEEP;

  /* The tangent at the arc's end: the radius there, turned a quarter the way
   * the gear turns. This is the whole reason the head meets the arc. */
  const hx = cw ? -Math.sin(s1) : Math.sin(s1);
  const hy = cw ? Math.cos(s1) : -Math.cos(s1);

  const x = 50 + Math.cos(s1) * ARROW_R, y = 50 + Math.sin(s1) * ARROW_R;
  const bx = x - hx * HEAD, by = y - hy * HEAD;
  const px = -hy * HEAD * 0.72, py = hx * HEAD * 0.72;

  return "M" + polar(s0, ARROW_R) +
    "A" + ARROW_R + " " + ARROW_R + " 0 1 " + (cw ? 1 : 0) + " " + polar(s1, ARROW_R) +
    "M" + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
    "L" + x.toFixed(1) + " " + y.toFixed(1) +
    "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1);
}

/** Where the arrow's head sits, so a test can check the arc actually reaches it. */
export function headAnchor(turn) {
  const cw = turn > 0;
  const s1 = cw ? (60 * Math.PI / 180) + SWEEP : (120 * Math.PI / 180) - SWEEP;
  return [50 + Math.cos(s1) * ARROW_R, 50 + Math.sin(s1) * ARROW_R];
}
