/* The board art, ported from the game.
 *
 * These are the game's own drawings, moved across with their class names and
 * their reasoning intact, because re-deriving them would have been a
 * transcription job with nothing checking it -- and because the art carries
 * rules. A pusher is a striped plate on a scissor rather than an arrow,
 * "because every other arrow on this board means a conveyor, so an arrow here
 * said 'you will be carried' when it means 'you will be shoved, on these
 * registers and not the others'". A pit's hazard frame is dimmed, because "at
 * full strength a course of pits reads as a warning label rather than as a
 * floor with holes in it". A gear's arrow sweeps 250 degrees, because a short
 * one made clockwise and anticlockwise indistinguishable at tile size, "which
 * is a rules bug wearing an art bug's clothes".
 *
 * Each returns a <g> in a 100x100 box, classed so render/palette.js can colour
 * it. The game wrapped each in its own nested <svg>; the editor composes one
 * SVG for the whole board, so these are groups instead. Nothing else changed:
 * the shapes, the numbers and the class names are the game's.
 */

import { DC, DR, opposite } from "../lib/dir.js";
import { esc } from "./theme.js";

/** Edge midpoints, indexed by direction. */
export const EDGE = [[50, 0], [100, 50], [50, 100], [0, 50]];

/** The game wrapped each drawing in a nested <svg>; one board, one SVG here. */
function svg(inner, cls) {
  return '<g class="pr-art ' + cls + '">' + inner + "</g>";
}

const PORTAL_HUES = ["#a06cff", "#3fd67a", "#4aa8ff", "#ff7ad1", "#ffd166",
                     "#ff8a5c", "#7ce0d3", "#c0c6e0", "#ff5f6d"];

/* The teleporter's one hue. It is not drawn from PORTAL_HUES because it is not
 * a member of a pair -- and what actually separates the two on the board is the
 * SHAPE, a hexagon against the portal's concentric rings, which holds even when
 * a portal's colour happens to land near this one. */
const TELEPORT_HUE = "#e07ad8";

function polar(a, rad) {
  return (50 + Math.cos(a) * rad).toFixed(1) + " " + (50 + Math.sin(a) * rad).toFixed(1);
}

export function gearSvg(dir) {
  let cw = dir > 0, i, pts = [], TEETH = 8;
  for (i = 0; i < TEETH * 2; i++) {
    let a0 = (i - 0.34) * Math.PI / TEETH, a1 = (i + 0.34) * Math.PI / TEETH;
    let rad = (i % 2) ? 30 : 42;
    pts.push(polar(a0, rad), polar(a1, rad));
  }
  let RAD = 20, SWEEP = 250 * Math.PI / 180;
  let s0 = (cw ? 60 : 120) * Math.PI / 180;
  let s1 = cw ? s0 + SWEEP : s0 - SWEEP;
  let hx = cw ? -Math.sin(s1) : Math.sin(s1);
  let hy = cw ? Math.cos(s1) : -Math.cos(s1);
  return svg(
    '<path class="pr-cog" d="M' + pts.join("L") + 'Z"/>' +
    /* the root circle, dark, so the teeth read as teeth rather than as a
       scalloped disc -- and the hub gets a lit rim off the same light */
    '<circle class="pr-cog-root" cx="50" cy="50" r="30"/>' +
    '<circle class="pr-hub" cx="50" cy="50" r="26"/>' +
    '<path class="pr-hub-lip" d="M28 58A26 26 0 0 1 64 27"/>' +
    '<path class="pr-turn" d="M' + polar(s0, RAD) + "A" + RAD + " " + RAD + " 0 1 " +
      (cw ? 1 : 0) + " " + polar(s1, RAD) + '"/>' +
    turnHead(50 + Math.cos(s1) * RAD, 50 + Math.sin(s1) * RAD, hx, hy, 13),
    cw ? "pr-gear pr-cw" : "pr-gear pr-ccw");
}

function turnHead(x, y, hx, hy, size) {
  let bx = x - hx * size, by = y - hy * size;
  let px = -hy * size * 0.72, py = hx * size * 0.72;
  return '<path class="pr-turn" d="M' + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
         "L" + x.toFixed(1) + " " + y.toFixed(1) +
         "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1) + '"/>';
}

export function pusherSvg(dir, odd) {
  const mount = opposite(dir), m = EDGE[mount];
  const ux = DC[dir], uy = DR[dir];            // out from the wall
  const vx = -uy, vy = ux;                     // along the wall
  const HALF = 33, FACE = 52, PLATE = 13, SPREAD = 17;
  const hinge = 5, cross = (hinge + (FACE - PLATE)) / 2;
  function pt(u, v) {
    return (m[0] + ux * u + vx * v).toFixed(1) + " " +
           (m[1] + uy * u + vy * v).toFixed(1);
  }
  function bar(u0, u1, v) {
    return "M" + pt(u0, -v) + "L" + pt(u0, v) + "L" + pt(u1, v) + "L" + pt(u1, -v) + "Z";
  }
  function pivot(u, v) {
    const xy = pt(u, v).split(" ");
    return '<circle class="pr-push-pin" cx="' + xy[0] + '" cy="' + xy[1] + '" r="3.4"/>';
  }
  return svg(
    /* the slot in the wall it emerges from */
    '<path class="pr-push-slot" d="' + bar(-3, hinge, HALF - 4) + '"/>' +
    /* the scissor: two arms crossing at a centre pivot */
    '<path class="pr-push-arm" d="M' + pt(hinge, -SPREAD) + "L" + pt(cross, 0) +
      "L" + pt(FACE - PLATE, -SPREAD) + '"/>' +
    '<path class="pr-push-arm" d="M' + pt(hinge, SPREAD) + "L" + pt(cross, 0) +
      "L" + pt(FACE - PLATE, SPREAD) + '"/>' +
    pivot(hinge, -SPREAD) + pivot(hinge, SPREAD) + pivot(cross, 0) +
    pivot(FACE - PLATE, -SPREAD) + pivot(FACE - PLATE, SPREAD) +
    /* the face: broad, striped, and the only part that touches a robot */
    '<path class="pr-push-face" d="' + bar(FACE - PLATE, FACE, HALF) + '"/>',
    "pr-pusher" + (odd ? " pr-odd" : " pr-even"));
}

export function repairSvg(upgrade) {
  /* The plate was --pr-plate on a floor five per cent away from it, which is
     to say invisible: a repair site read as a green cross floating on bare
     deck. It is a bolted-down plate, so it is lit like one. */
  return svg(
    '<rect class="pr-plate" x="12" y="12" width="76" height="76" rx="4"/>' +
    '<path class="pr-plate-lip" d="M13 80 V16 A3 3 0 0 1 16 13 H80"/>' +
    '<path class="pr-tool" d="M50 24L50 76M24 50L76 50"/>' +
    (upgrade ? '<rect class="pr-tool-ring" x="22" y="22" width="56" height="56" rx="3"/>' : ""),
    upgrade ? "pr-upgrade" : "pr-repair");
}

export function pitSvg() {
  return svg('<rect class="pr-hazard-frame" x="5" y="5" width="90" height="90" rx="3"/>' +
             '<rect class="pr-shaft" x="16" y="16" width="68" height="68" rx="2"/>' +
             '<path class="pr-shaft-2" d="M16 16L84 16L64 36L36 36Z"/>' +
             '<rect class="pr-void-floor" x="36" y="36" width="28" height="38" rx="1"/>', "pr-pit");
}

export function batterySvg() {
  return svg('<rect class="pr-batt-cell" x="20" y="26" width="26" height="48" rx="3"/>' +
             '<rect class="pr-batt-cell" x="54" y="26" width="26" height="48" rx="3"/>' +
             '<path class="pr-batt-bolt" d="M36 36l-9 18h7l-3 12 11-19h-7z"/>' +
             '<path class="pr-batt-bolt" d="M70 36l-9 18h7l-3 12 11-19h-7z"/>', "pr-batt");
}

export function waterSvg() {
  let out = "", y;
  /* Each crest is drawn twice: a dark trough a shade below it, then the lit
   * crest. Two lines is what makes a wave a surface rather than a squiggle,
   * and it costs one extra path. */
  for (y = 0; y < 3; y++) {
    const d = 'M12 ' + (32 + y * 18) + 'q10-9 20 0t20 0 20 0 16 0';
    out += '<path d="' + d + '" fill="none" stroke="#04131f" stroke-opacity=".55"' +
           ' stroke-width="5" stroke-linecap="round" transform="translate(0 2.6)"/>' +
           '<path class="pr-wave" d="' + d + '"/>';
  }
  return svg(out, "pr-water");
}

export function drainSvg() {
  /* A hole in water, lit like a hole: the far wall of the shaft catches what
   * light there is and the near side is black. The rim stays hazard yellow,
   * because a drain is a pit in every respect the rules care about. */
  return svg('<circle class="pr-drain-hole" cx="50" cy="50" r="30"/>' +
             '<path d="M22 58A30 30 0 0 1 76 34" fill="none" stroke="#12283a"' +
             ' stroke-width="9" stroke-linecap="round"/>' +
             '<circle class="pr-drain-rim" cx="50" cy="50" r="30"/>' +
             '<path class="pr-wave" d="M14 28q9-8 18 0t18 0 18 0 18 0"/>' +
             '<path class="pr-wave" d="M14 76q9-8 18 0t18 0 18 0 18 0"/>', "pr-drain");
}

/* A ramp is drawn on the FOOT square as a TRAPEZOID: its wide edge lies along
 * the edge it climbs and its sides run in along the square's diagonals toward
 * the centre. The diagonals are the point. Four ramps on one square are four
 * trapezoids meeting at the middle like the faces of a pyramid, none of them
 * overlapping, and two on neighbouring sides share a diagonal and read as one
 * corner. It is kept shallow. The treads run across it, so the eye reads "up" toward the edge
 * without an arrow, which the belts own. Authored for north; `dir` turns it. */
export function rampEdgeSvg(dir) {
  /* shallow: it reaches 28 in from the edge and stays 44 wide at the top, so
   * it reads as a ramp against the wall of the square rather than filling it */
  let out = '<path class="pr-ramp-deck" d="M1 1h98L72 28H28z"/>';
  for (const y of [9, 18]) out += '<path class="pr-ramp-step" d="M' + (y + 5) + " " + y + "h" + (90 - 2 * y) + '"/>';
  return svg('<g transform="rotate(' + (dir * 90) + ' 50 50)">' + out + "</g>", "pr-ramp");
}

export function rampSvg(dir) {
  let out = '<path class="pr-ramp-deck" d="M16 78h68l-14-56H30z"/>';
  for (let i = 0; i < 3; i++) {
    out += '<path class="pr-ramp-step" d="M' + (28 + i * 3) + " " + (66 - i * 16) +
           "h" + (44 - i * 6) + '"/>';
  }
  return svg('<g transform="rotate(' + (dir * 90) + ' 50 50)">' + out + "</g>", "pr-ramp");
}

/* THE PRINT: an eight-point star, silver-edged and black, nearly the whole
 * square, with a red jagged burst inside it and the belt's arrow drawn over
 * the lot. It is the loudest thing on a Chaos and Carnage board, which is
 * right for what it does to your register. This is drawn UNDER the square's
 * element (svg.js puts it between the floor and the belt), so the arrow
 * stays legible over it exactly as printed. */
export function randomizerSvg() {
  return svg('<path class="pr-rand-star" d="M 50.0 2.0 L 61.5 22.3 L 83.9 16.1 L 77.7 38.5 L 98.0 50.0 L 77.7 61.5 L 83.9 83.9 L 61.5 77.7 L 50.0 98.0 L 38.5 77.7 L 16.1 83.9 L 22.3 61.5 L 2.0 50.0 L 22.3 38.5 L 16.1 16.1 L 38.5 22.3 Z"/>' +
             '<path class="pr-rand-burst" d="M 59.6 14.3 L 61.0 30.9 L 76.2 23.8 L 69.1 39.0 L 85.7 40.4 L 72.0 50.0 L 85.7 59.6 L 69.1 61.0 L 76.2 76.2 L 61.0 69.1 L 59.6 85.7 L 50.0 72.0 L 40.4 85.7 L 39.0 69.1 L 23.8 76.2 L 30.9 61.0 L 14.3 59.6 L 28.0 50.0 L 14.3 40.4 L 30.9 39.0 L 23.8 23.8 L 39.0 30.9 L 40.4 14.3 L 50.0 28.0 Z"/>', "pr-rand");
}

/* ONE HUE, because a teleporter has no colour to match. The portal below takes
 * its hue from the pair it belongs to; this one belongs to nothing, so a
 * per-instance colour would be inventing a distinction the print does not make.
 * Nine identical rings on Labyrinth are nine identical rings. */
export function teleporterSvg() {
  const hue = TELEPORT_HUE;
  return svg('<path d="M50 14l31 18v36L50 86 19 68V32z" fill="none" stroke="' + hue + '" stroke-width="5"/>' +
             '<path d="M50 30l17 10v20L50 70 33 60V40z" fill="' + hue + '" opacity=".55"/>' +
             '<circle cx="50" cy="50" r="7" fill="var(--pr-bg)"/>', "pr-teleport");
}

export function portalSvg(n) {
  const hue = portalHue(n);
  return svg('<circle cx="50" cy="50" r="36" fill="none" stroke="' + hue + '" stroke-width="5"/>' +
             '<circle cx="50" cy="50" r="25" fill="none" stroke="' + hue + '" stroke-width="3" opacity=".65"/>' +
             '<circle cx="50" cy="50" r="13" fill="' + hue + '" opacity=".9"/>' +
             '<circle cx="50" cy="50" r="6" fill="var(--pr-bg)"/>', "pr-portal");
}

/* OIL IS A RULE, AND IT WAS INVISIBLE. The film was #0a0d16 on a deck five per
 * cent lighter, inside a hairline rim: on a board you had to already know the
 * square was there. It stays black -- it is oil -- and is found by its sheen
 * instead, which is how you find real oil: the film is iridescent, so it gets
 * a raking band of violet through teal to amber and a bright meniscus. Still
 * the darkest square on the board, and now the one with the only rainbow on it.
 *
 * THE PUDDLE IS BUILT FROM ITS NEIGHBOURS. `open` says which sides meet more
 * oil: on those the edge runs out to the square's boundary, on the others it
 * pulls in, and a corner is rounded only where both of its sides pull in. Put
 * the puddles of a run of squares side by side and they make one slick with a
 * single outline -- svg.js draws them as one path so the film and the rim are
 * one surface -- while a lone square is a lone puddle. The radii and insets
 * vary a little with where the square is, because a spill is not a stamp and
 * twelve identical puddles in a row read as tiling. */
function oilVar(c, r, k) {
  /* a small stable wobble in [0,1): the same square always gets the same puddle */
  const n = ((c * 73856093) ^ (r * 19349663) ^ (k * 83492791)) >>> 0;
  return ((n * 2654435761) >>> 0) / 4294967296;
}

export function oilBlobPath(open, c, r, ox = 0, oy = 0) {
  /* HOW FAR A CLOSED SIDE PULLS IN IS A PROPERTY OF THE EDGE LINE, not of the
   * square: the west side of every square in column c pulls in by the same
   * amount, the north side of every square in row r likewise. Two oil squares
   * in a run then agree exactly where their outlines meet, so the slick's edge
   * is continuous across them instead of stepping at every square boundary.
   * The bow along each side is per square, which is what keeps it organic. */
  const ins = (line, axis, k) => 9 + oilVar(line, axis, k) * 7;
  const rad = k => 24 + oilVar(c, r, k) * 12;
  const N = open.n ? 0 : ins(r, 0, 1), S = open.s ? 100 : 100 - ins(r + 1, 0, 1);
  const W = open.w ? 0 : ins(c, 1, 2), E = open.e ? 100 : 100 - ins(c + 1, 1, 2);
  const f = v => (v + 0).toFixed(1);
  const P = (x, y) => f(ox + x) + " " + f(oy + y);
  /* corners clockwise from top-left; each is rounded only if both its sides pull in */
  const rTL = (!open.n && !open.w) ? rad(5) : 0, rTR = (!open.n && !open.e) ? rad(6) : 0;
  const rBR = (!open.s && !open.e) ? rad(7) : 0, rBL = (!open.s && !open.w) ? rad(8) : 0;
  const arc = (rr, x, y) => (rr ? "A" + f(rr) + " " + f(rr) + " 0 0 1 " + P(x, y) : "L" + P(x, y));
  /* A side that meets floor BOWS, a few units in or out, through a quadratic
   * whose control point sits off its midpoint. A side that meets more oil stays
   * dead straight, because it has to land exactly on the neighbour's edge or
   * the two puddles show a notch where they join. */
  const bow = (k, x0, y0, x1, y1, nx, ny) => {
    const a = (oilVar(c, r, k) - 0.5) * 11;
    return "Q" + P((x0 + x1) / 2 + nx * a, (y0 + y1) / 2 + ny * a) + " " + P(x1, y1);
  };
  /* Built as segments, so the RIM can be a second path holding only the
   * segments that face floor. Stroking the whole outline would draw a line
   * along every boundary between two oil squares -- which is exactly the seam
   * the layer exists to get rid of. */
  const segs = [
    { closed: !open.n, from: [W + rTL, N], d: bow(11, W + rTL, N, E - rTR, N, 0, 1), to: [E - rTR, N] },
    { closed: !open.n && !open.e, d: arc(rTR, E, N + rTR), to: [E, N + rTR] },
    { closed: !open.e, from: [E, N + rTR], d: bow(12, E, N + rTR, E, S - rBR, -1, 0), to: [E, S - rBR] },
    { closed: !open.s && !open.e, d: arc(rBR, E - rBR, S), to: [E - rBR, S] },
    { closed: !open.s, from: [E - rBR, S], d: bow(13, E - rBR, S, W + rBL, S, 0, -1), to: [W + rBL, S] },
    { closed: !open.s && !open.w, d: arc(rBL, W, S - rBL), to: [W, S - rBL] },
    { closed: !open.w, from: [W, S - rBL], d: bow(14, W, S - rBL, W, N + rTL, 1, 0), to: [W, N + rTL] },
    { closed: !open.n && !open.w, d: arc(rTL, W + rTL, N), to: [W + rTL, N] }
  ];
  /* the fill: every segment, closed; open sides are straight lines to the boundary */
  let fill = "M" + P(W + rTL, N);
  for (const g of segs) fill += g.closed ? g.d : "L" + P(g.to[0], g.to[1]);
  fill += "Z";
  /* the rim: only what faces floor, each run started where it starts */
  let rim = "", pen = null;
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  for (const g of segs) {
    if (!g.closed) { pen = null; continue; }
    const start = g.from || pen;
    if (!same(pen, start)) rim += "M" + P(start[0], start[1]);
    rim += g.d;
    pen = g.to;
  }
  return { fill, rim };
}

/* THE SHEEN IS IN STREAKS. Oil on a floor is black with iridescence running
 * through it in bands that follow how it flowed, not a rainbow laid flat over
 * the lot: two or three curved strokes per square, each its own hue from the
 * film's range, each set a little differently by where the square is, and one
 * small hard specular where the light actually hits. The film underneath is
 * kept faint enough that the streaks are the colour you notice. */
const SWIRL_HUES = ["#8b79ff", "#3fd8cc", "#e0a94a", "#c56cff"];
export function oilSheen(c, r) {
  let out = "";
  const n = 2 + (oilVar(c, r, 15) > 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const v = k => oilVar(c, r, 20 + i * 4 + k);
    const x0 = 14 + v(0) * 30, y0 = 22 + v(1) * 56;
    const dx = 26 + v(2) * 34, dy = (v(3) - 0.5) * 30;
    const cx = x0 + dx * 0.5 + (v(1) - 0.5) * 24, cy = y0 + dy * 0.5 - (v(2) - 0.5) * 26;
    const hue = SWIRL_HUES[(c + r * 3 + i) % SWIRL_HUES.length];
    out += '<path class="pr-oil-swirl" stroke="' + hue + '" d="M' + x0.toFixed(1) + " " + y0.toFixed(1) +
      "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + (x0 + dx).toFixed(1) + " " + (y0 + dy).toFixed(1) + '"/>';
  }
  const sx = 28 + oilVar(c, r, 16) * 30, sy = 28 + oilVar(c, r, 17) * 24;
  out += '<path class="pr-oil-sheen" transform="translate(' + (sx - 42).toFixed(1) + " " + (sy - 38).toFixed(1) + ')"' +
    ' d="M36 40C38 34 45 30 53 31C46 34 42 38 40 44C38 50 35 46 36 40Z"/>';
  return out;
}

/** One puddle with floor on every side: the rail's swatch. On a board the
 *  spill is a layer (svg.js, oilLayer) drawn from the same shape. */
export function oilSvg() {
  const { fill, rim } = oilBlobPath({ n: false, e: false, s: false, w: false }, 0, 0);
  return svg('<path class="pr-oil" d="' + fill + '"/>' +
             '<path class="pr-oil-film" d="' + fill + '"/>' +
             '<path class="pr-oil-rim" d="' + rim + '"/>' +
             '<g filter="url(#pr-oilsoft)">' + oilSheen(0, 0) + "</g>", "pr-oil");
}

export function pressSvg() {
  return svg('<circle class="pr-shaft" cx="50" cy="50" r="37"/>' +
             '<circle class="pr-press-ram" cx="50" cy="50" r="26"/>' +
             '<circle class="pr-press-bolt" cx="50" cy="50" r="9"/>', "pr-press");
}

export function burnerSvg(dir, nozzle) {
  const deg = (dir - 2) * 90;
  let art = "";
  if (nozzle) {
    art += '<rect class="pr-jet-mount" x="26" y="2" width="48" height="13" rx="3"/>' +
           '<rect class="pr-jet-neck" x="38" y="13" width="9" height="10"/>' +
           '<rect class="pr-jet-neck" x="53" y="13" width="9" height="10"/>';
  }
  /* Two cones and a body, widening away from the wall: the fire is
     thrown, and a symmetrical blob would read as a puddle. */
  art += '<path class="pr-flame" d="M42 20C30 44 22 56 22 68C22 84 34 94 50 94C66 94 78 84 78 68C78 56 70 44 58 20C56 40 44 40 42 20Z"/>' +
         '<path class="pr-flame-core" d="M50 46C58 60 62 66 62 72C62 81 57 87 50 87C43 87 38 81 38 72C38 66 42 60 50 46Z"/>';
  return svg('<g transform="rotate(' + deg + ' 50 50)">' + art + "</g>", "pr-burner");
}

export function dockSvg(n) {
  return svg('<rect class="pr-plate" x="16" y="16" width="68" height="68" rx="4"/>' +
             '<path class="pr-plate-lip" d="M17 80 V20 A3 3 0 0 1 20 17 H80"/>' +
             '<text x="50" y="52" class="pr-num">' + esc(n) + "</text>", "pr-dock");
}

export function flagSvg(n) {
  return svg('<rect class="pr-pole" x="17" y="10" width="8" height="82" rx="3"/>' +
             '<path class="pr-banner" d="M25 14H92L79 40L92 66H25Z"/>' +
             '<text x="56" y="41" class="pr-num">' + esc(String(n)) + "</text>", "pr-flag");
}

export function emitterSvg(d) {
  const mount = opposite(d), m = EDGE[mount];
  const px = -DR[mount] * 20, py = DC[mount] * 20;
  const qx = DC[d] * 18, qy = DR[d] * 18;
  return svg('<path class="pr-mount" d="M' + (m[0] + px) + " " + (m[1] + py) +
             "L" + (m[0] - px) + " " + (m[1] - py) +
             "L" + (m[0] - px * 0.5 + qx) + " " + (m[1] - py * 0.5 + qy) +
             "L" + (m[0] + px * 0.5 + qx) + " " + (m[1] + py * 0.5 + qy) + 'Z"/>', "pr-emitter");
}

function portalHue(n) { return PORTAL_HUES[(parseInt(n, 10) - 1) % PORTAL_HUES.length]; }

/* ------------------------------------------------------------
   THE 2016 SQUARES. Drawn in the same vocabulary as the rest --
   one 100x100 box, classes rather than inline colour -- so that a
   modern board reads as the same game in different paint.
   ------------------------------------------------------------ */
