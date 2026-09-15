/* Conveyor geometry: one RUN per arm, drawn as an arc.
 *
 * Ported from the prototype's tile art, which got this right and got it right
 * for a stated reason. The painted arrow follows the RUN, not the exit axis --
 * and that distinction is the whole point. A curve rotates the robot on it and
 * a straight one does not, so a board that draws both with a straight arrow is
 * hiding a rule. It did, until somebody looked at a board authored to contain
 * one of everything, five curves and a merge among them, and could not find a
 * single turn on it.
 *
 * So: a belt with three arms is three runs, each arcing from its own entry edge
 * to the shared exit edge. A corner visibly bends. A merge visibly converges.
 * Draw the arms as straight spokes meeting in the middle -- which is what the
 * first version of this editor did -- and every shape looks like the same
 * asterisk.
 *
 * Everything here is pure path arithmetic in a 0..100 box and returns strings,
 * so it runs in Node for the snapshot check.
 */

import { DC, DR, opposite, N, E, S, W } from "../lib/dir.js";
import { ARM_CODES, ARM_SLOTS } from "../lib/token.js";

/** Edge midpoints, indexed by direction. */
export const EDGE = [[50, 0], [100, 50], [50, 100], [0, 50]];

export const BELT_HALF = 31;   // rail centre, either side of the run
export const TURN_R = 50;      // a quarter turn through the edge midpoints
export const HEAD_BACK = 24;   // how far short of the exit edge the head sits
export const TAIL_IN = 12;     // how far past the entry edge the shaft starts

/**
 * The absolute directions a robot TRAVELS IN as it enters, one per arm.
 * An arm sits on a side; a robot coming through it travels the opposite way.
 * `arms` is the relative {back,left,right} set and `exit` the belt's direction.
 */
export function runsOf(arms, exit) {
  const a = arms || ARM_CODES["."];
  const sideOf = { back: opposite(exit), left: (exit + 3) % 4, right: (exit + 1) % 4 };
  const out = [];
  for (const slot of ARM_SLOTS) if (a[slot]) out.push(opposite(sideOf[slot]));
  return out.length ? out : [exit];
}

/** Geometry for one run: entering travelling `inDir`, leaving along `exit`. */
export function runGeom(inDir, exit) {
  const entry = opposite(inDir);
  const a = EDGE[entry], b = EDGE[exit];
  if (inDir === exit) return { straight: true, a, b, dir: exit, inDir, exit };
  const vert = (entry === E || entry === W) ? entry : exit;
  const horiz = (entry === N || entry === S) ? entry : exit;
  const cx = (vert === W) ? 0 : 100, cy = (horiz === N) ? 0 : 100;
  const t1 = Math.atan2(a[1] - cy, a[0] - cx);
  const t2 = Math.atan2(b[1] - cy, b[0] - cx);
  let d = t2 - t1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return { straight: false, a, b, inDir, exit, cx, cy, t1, t2, sweep: d > 0 ? 1 : 0 };
}

function arcOf(g, rad) {
  const x1 = g.cx + Math.cos(g.t1) * rad, y1 = g.cy + Math.sin(g.t1) * rad;
  const x2 = g.cx + Math.cos(g.t2) * rad, y2 = g.cy + Math.sin(g.t2) * rad;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) +
    "A" + rad.toFixed(1) + " " + rad.toFixed(1) + " 0 0 " + g.sweep + " " +
    x2.toFixed(1) + " " + y2.toFixed(1);
}

function lineOf(g, off) {
  const px = -DR[g.dir] * off, py = DC[g.dir] * off;
  return "M" + (g.a[0] + px) + " " + (g.a[1] + py) + "L" + (g.b[0] + px) + " " + (g.b[1] + py);
}

export function bedPath(g) { return g.straight ? lineOf(g, 0) : arcOf(g, TURN_R); }

export function railPaths(g) {
  if (g.straight) return [lineOf(g, BELT_HALF), lineOf(g, -BELT_HALF)];
  return [arcOf({ ...g }, TURN_R + BELT_HALF), arcOf({ ...g }, TURN_R - BELT_HALF)];
}

/** Every feed converges on one head, so its place depends on the exit alone. */
export function headPoint(exit) {
  return [EDGE[exit][0] - DC[exit] * HEAD_BACK, EDGE[exit][1] - DR[exit] * HEAD_BACK];
}

/**
 * A run carries a head only when the whole tile is a plain straight. On a turn
 * or a merge the painted line curves or converges, which already says rotation
 * and junction; a head there would be decoration competing with the one thing
 * the tile has to say.
 */
export function headed(arms, exit) {
  const runs = runsOf(arms, exit);
  return runs.length === 1 && runs[0] === exit;
}

/**
 * The painted arrow. A headless run is drawn edge to edge, so consecutive tiles
 * join into one continuous line you can follow across the board -- that
 * continuity is what replaces the arrowhead.
 *
 * The bed and rails are arcs, because concentric arcs keep their spacing round
 * a bend. The ARROW is a quadratic, because what matters about it is its two
 * tangents: it has to leave the entry edge the way you arrived and reach the
 * head pointing exactly the way you leave. An arc trimmed back far enough to
 * make room for the head arrives about thirty degrees off, and meets the
 * chevron at a visible kink.
 */
export function markPath(g, isHeaded) {
  if (!isHeaded) return g.straight ? lineOf(g, 0) : arcOf(g, TURN_R);
  if (g.straight) {
    const d = g.dir;
    return "M" + (g.a[0] + DC[d] * TAIL_IN) + " " + (g.a[1] + DR[d] * TAIL_IN) +
      "L" + (g.b[0] - DC[d] * HEAD_BACK) + " " + (g.b[1] - DR[d] * HEAD_BACK);
  }
  const s = [g.a[0] + DC[g.inDir] * TAIL_IN, g.a[1] + DR[g.inDir] * TAIL_IN];
  const h = headPoint(g.exit);
  const horizIn = (g.inDir === E || g.inDir === W);
  const cx = horizIn ? h[0] : s[0], cy = horizIn ? s[1] : h[1];
  return "M" + s[0].toFixed(1) + " " + s[1].toFixed(1) +
    "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + h[0].toFixed(1) + " " + h[1].toFixed(1);
}

/** A chevron pointing along (hx,hy) with its point at (x,y). */
export function chevPath(x, y, hx, hy, size) {
  const bx = x - hx * size, by = y - hy * size;
  const px = -hy * size * 0.78, py = hx * size * 0.78;
  return "M" + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
    "L" + x.toFixed(1) + " " + y.toFixed(1) +
    "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1);
}

/**
 * Everything one belt tile needs drawn, as path strings.
 * Beds first and rails after, ALL of them: at a junction the rails have to be
 * able to cross a neighbouring bed, which is what a junction looks like.
 */
export function beltPaths(arms, exit, speed) {
  const runs = runsOf(arms, exit);
  const isHeaded = headed(arms, exit);
  const beds = [], rails = [], marks = [];
  for (const inDir of runs) {
    const g = runGeom(inDir, exit);
    beds.push(bedPath(g));
    for (const rp of railPaths(g)) rails.push(rp);
    marks.push(markPath(g, isHeaded));
  }
  const chevrons = [];
  if (isHeaded) {
    const h = headPoint(exit);
    chevrons.push(chevPath(h[0], h[1], DC[exit], DR[exit], 14));
    if (speed === 2) {
      chevrons.push(chevPath(h[0] - DC[exit] * 19, h[1] - DR[exit] * 19, DC[exit], DR[exit], 14));
    }
  } else {
    /* A headless tile still has to say which way it runs, and the one place a
     * turning belt is momentarily straight is where it crosses an edge -- a run
     * crosses every edge at right angles to it. So the marker goes ON the exit
     * edge, where it lies along the line instead of cutting across a curve. */
    const e = EDGE[exit];
    chevrons.push(chevPath(e[0] - DC[exit] * 6, e[1] - DR[exit] * 6, DC[exit], DR[exit], 12));
  }
  return { beds, rails, marks, chevrons, headed: isHeaded };
}
