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
    '<circle class="pr-hub" cx="50" cy="50" r="26"/>' +
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
  return svg(
    '<rect class="pr-plate" x="12" y="12" width="76" height="76" rx="4"/>' +
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
  for (y = 0; y < 3; y++) {
    out += '<path class="pr-wave" d="M12 ' + (32 + y * 18) + 'q10-9 20 0t20 0 20 0 16 0"/>';
  }
  return svg(out, "pr-water");
}

export function drainSvg() {
  return svg('<circle class="pr-drain-hole" cx="50" cy="50" r="30"/>' +
             '<circle class="pr-drain-rim" cx="50" cy="50" r="30"/>' +
             '<path class="pr-wave" d="M14 28q9-8 18 0t18 0 18 0 18 0"/>' +
             '<path class="pr-wave" d="M14 76q9-8 18 0t18 0 18 0 18 0"/>', "pr-drain");
}

export function rampSvg(dir) {
  let out = '<path class="pr-ramp-deck" d="M16 78h68l-14-56H30z"/>';
  for (let i = 0; i < 3; i++) {
    out += '<path class="pr-ramp-step" d="M' + (28 + i * 3) + " " + (66 - i * 16) +
           "h" + (44 - i * 6) + '"/>';
  }
  return svg('<g transform="rotate(' + (dir * 90) + ' 50 50)">' + out + "</g>", "pr-ramp");
}

export function randomizerSvg() {
  let out = '<rect class="pr-rand-face" x="20" y="20" width="60" height="60" rx="8"/>';
  const pips = [[35, 35], [65, 35], [50, 50], [35, 65], [65, 65]];
  for (let i = 0; i < pips.length; i++) {
    out += '<circle class="pr-rand-pip" cx="' + pips[i][0] + '" cy="' + pips[i][1] + '" r="6"/>';
  }
  return svg(out, "pr-rand");
}

export function teleporterSvg(n) {
  const hue = portalHue(n);
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

export function oilSvg() {
  return svg('<path class="pr-oil" d="M22 46C22 32 34 22 50 22C68 22 80 30 80 44C80 58 72 74 52 76C32 78 22 62 22 46Z"/>' +
             '<path class="pr-oil-sheen" d="M36 40C38 34 45 30 53 31C46 34 42 38 40 44C38 50 35 46 36 40Z"/>',
             "pr-oil");
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
