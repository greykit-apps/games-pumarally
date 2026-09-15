/* Colour and metric tokens for both render modes.
 *
 * The play art is SOLID on purpose -- a belt is a bed with rails and a painted
 * arrow, a wall is a raised bar with a shadow. A player picking a route reads
 * depth as much as symbol, and outlines read as a diagram.
 *
 * Markup is the exact inverse, and it is a different glyph set rather than the
 * same one unfilled: unfilling a belt bed still leaves a bed. Over a photograph
 * you want a thin bright mark that sits on top of the printed square instead of
 * covering it, so a whole board can be laid down in one pass and read against
 * the print at the same time.
 *
 * ONE HUE PER LAYER in markup, so ground, wall and ceiling separate at a glance
 * and a device reads as belonging to its layer rather than to the square it
 * happens to stand on.
 */

export const CELL = 100;          // the drawing box every glyph works in

export const ART = {
  floor: "#2a2f3d", floorEdge: "#3b4254", rivet: "#4a5266",
  pit: "#05070f", pitEdge: "#f2b632",
  belt: "#3f4759", beltRail: "#59637c", beltArrow: "#9fb0d0",
  express: "#3a4a63", expressRail: "#5a7096", expressArrow: "#b9d2f2",
  gear: "#4a4054", gearTeeth: "#6b5c7a", gearArrow: "#d7c2ee",
  repair: "#20463a", upgrade: "#1f4b52", tool: "#8ff0c4",
  oil: "#171a24", oilSheen: "#4b3f6b",
  water: "#16324a", wave: "#5fa8d8",
  energy: "#4a4420", spark: "#ffd84d",
  portal: "#3a2145", teleport: "#213a45", ring: "#e07ad8",
  hazard: "#f2b632", danger: "#ff5f56",
  dock: "#233045", dockText: "#c8d4ea",
  wall: "#d8a52c", wallTop: "#f6cf6a", wallShadow: "#11141d",
  door: "#8fd0f0",
  laser: "#ff5f56", pusher: "#e8873c", jet: "#ff8a3c",
  crusher: "#c0c6d6", flamer: "#ff9a4a",
  text: "#c8d4ea", dim: "#8b8fa8"
};

/* Markup: bright, saturated, and distinct at one screen pixel over a photo.
 * Every stroke is painted over a dark halo -- see markStroke below.
 *
 * THE PALETTE IS CHOSEN AGAINST WHAT IS PRINTED ON THE BOARDS, not for its own
 * harmony. A printed RoboRally board is yellow hazard stripes, grey plate, dark
 * pits and a brown frame, so the one colour markup must NOT use is yellow --
 * and the first version of this table used it for walls, which are the single
 * thing most worth being sure you have transcribed. Laid over a printed wall
 * the mark vanished into it, and the mode's whole claim is that you can see
 * what you have marked without flipping layers.
 *
 * Green is the safe hue here: nothing on these boards is green. */
export const MARK = {
  ground: "#35e0ff",       // cyan: the ground layer
  belt: "#35e0ff",
  express: "#7cf3ff",
  hazard: "#ff4fa3",       // magenta: anything that hurts
  wall: "#39ff88",         // green: the wall layer -- see the note above
  door: "#ffffff",
  device: "#ff8a1f",       // orange: things bolted to a wall
  ceiling: "#c07bff",      // violet: things above
  level: "#ffe14d",        // elevation, which appears only on boards with no
                           // printed yellow of their own
  halo: "#0b0d14",
  text: "#ffffff"
};

export const HALO_WIDTH = 3.2;
export const MARK_WIDTH = 1.4;

/**
 * Stroke attributes shared by every markup glyph.
 *
 * `paint-order: stroke` draws the stroke under the fill, so painting the same
 * path twice -- once fat and dark, once thin and bright -- gives a halo that
 * keeps one colour legible over printed yellow AND over shadow. Without it a
 * single bright hue is unreadable across half of any real photograph.
 *
 * `vector-effect: non-scaling-stroke` keeps lines at one screen pixel across
 * the whole 0.4x-4x zoom range. Without it a line drawn thin enough to see past
 * at 1x becomes a solid block at 4x, which is the failure the mode exists to
 * avoid.
 */
export function markStroke(colour, width = MARK_WIDTH) {
  return 'fill="none" stroke="' + colour + '" stroke-width="' + width +
    '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
}

export function haloStroke() {
  return 'fill="none" stroke="' + MARK.halo + '" stroke-width="' + HALO_WIDTH +
    '" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.85"' +
    ' vector-effect="non-scaling-stroke"';
}

/** Escape text for an SVG text node or attribute. */
export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
