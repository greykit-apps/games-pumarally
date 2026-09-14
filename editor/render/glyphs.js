/* Every drawable thing, in both modes, side by side.
 *
 * ONE TABLE RATHER THAN TWO FILES. Two glyph sets is the drift risk this
 * project keeps warning about, and a missing markup glyph draws NOTHING, over a
 * photograph, at exactly the moment nobody is looking at the play art. Putting
 * `art` and `mark` in the same entry means you see both when you edit either,
 * and render-snapshot.js asserts every element key and device kind has both.
 *
 * Every glyph draws in a 0..100 box, and a DIRECTIONAL glyph draws pointing
 * NORTH. The caller rotates. That is what lets a conveyor's relative arms be
 * drawn literally: exit at the top, back arm at the bottom, left arm on the
 * left. No glyph does direction arithmetic.
 */

import { ART, MARK, markStroke, haloStroke, esc } from "./theme.js";
import { ARM_CODES } from "../lib/token.js";
import { beltPaths } from "./belt.js";
import { cogPath, turnPath, HUB_R } from "./gear.js";
import { N } from "../lib/dir.js";

const p = (...parts) => parts.join(" ");

/** A markup shape: painted twice, dark and fat underneath, bright and thin on top. */
function mk(d, colour, width) {
  return '<path d="' + d + '" ' + haloStroke() + "/>" +
         '<path d="' + d + '" ' + markStroke(colour, width) + "/>";
}

function mkText(s, x, y, colour, size = 26) {
  return '<text x="' + x + '" y="' + y + '" font-size="' + size +
    '" font-family="ui-monospace,Menlo,Consolas,monospace" text-anchor="middle"' +
    ' dominant-baseline="central" stroke="' + MARK.halo + '" stroke-width="3.5"' +
    ' paint-order="stroke" fill="' + colour + '">' + esc(s) + "</text>";
}

function artText(s, x, y, colour, size = 30) {
  return '<text x="' + x + '" y="' + y + '" font-size="' + size +
    '" font-family="ui-monospace,Menlo,Consolas,monospace" text-anchor="middle"' +
    ' dominant-baseline="central" fill="' + colour + '">' + esc(s) + "</text>";
}

const plate = (fill = ART.floor, edge = ART.floorEdge) =>
  '<rect x="1" y="1" width="98" height="98" rx="4" fill="' + fill + '" stroke="' + edge + '" stroke-width="2"/>';

const rivets = () => [[12, 12], [88, 12], [12, 88], [88, 88]]
  .map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="3" fill="' + ART.rivet + '"/>').join("");

/* --- conveyors -------------------------------------------------------------
 * Drawn exiting NORTH; the caller rotates. The arms character says which edges
 * show an incoming path relative to that exit, and EACH ARM IS ITS OWN RUN,
 * arcing from its entry edge to the shared exit edge. That is what makes a
 * corner look like a corner and a merge look like a junction -- draw the arms
 * as straight spokes meeting in the middle and every shape becomes the same
 * asterisk, which is what the first version of this file did.
 *
 * Beds first and rails after, ALL of them: at a junction the rails have to be
 * able to cross a neighbouring bed, which is what a junction looks like.
 *
 * The geometry is in render/belt.js, ported from the prototype's tile art along
 * with the reasoning that produced it. */

function beltArt(arms, express) {
  const p = beltPaths(arms, N, express ? 2 : 1);
  const rail = express ? ART.expressRail : ART.beltRail;
  const bed = express ? ART.express : ART.belt;
  const arrow = express ? ART.expressArrow : ART.beltArrow;
  const join = (list, attrs) => list.map(d => '<path d="' + d + '" ' + attrs + "/>").join("");
  return plate() +
    join(p.beds, 'fill="none" stroke="' + bed + '" stroke-width="68" stroke-linecap="butt" stroke-linejoin="round"') +
    join(p.rails, 'fill="none" stroke="' + rail + '" stroke-width="7" stroke-linecap="butt"') +
    join(p.marks, 'fill="none" stroke="' + arrow + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"') +
    join(p.chevrons, 'fill="none" stroke="' + arrow + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"');
}

function beltMark(arms, express) {
  const colour = express ? MARK.express : MARK.belt;
  const p = beltPaths(arms, N, express ? 2 : 1);
  /* The painted line and the chevron, and no bed: over a photograph the shape
   * has to sit on the printed belt rather than cover it. The line follows the
   * run, so a curve reads as a curve at a glance. */
  const d = p.marks.concat(p.chevrons).join(" ");
  return mk(d, colour, express ? 1.8 : 1.4);
}

/* --- the table -------------------------------------------------------------- */

export const GLYPHS = {
  floor: {
    art: () => plate() + rivets(),
    markup: () => ""                         // an unmarked square IS floor
  },

  pit: {
    art: () => plate(ART.pit, ART.pitEdge) +
      '<path d="M 10 10 L 30 10 L 10 30 Z M 90 90 L 70 90 L 90 70 Z" fill="' + ART.pitEdge + '" opacity="0.7"/>' +
      '<ellipse cx="50" cy="52" rx="30" ry="28" fill="#000"/>',
    markup: () => mk("M 16 16 L 84 84 M 84 16 L 16 84 M 8 8 L 92 8 L 92 92 L 8 92 Z", MARK.hazard, 1.6)
  },

  conveyor: {
    art: ctx => beltArt(ctx.arms, false),
    markup: ctx => beltMark(ctx.arms, false)
  },

  expressConveyor: {
    art: ctx => beltArt(ctx.arms, true),
    markup: ctx => beltMark(ctx.arms, true)
  },

  gearCW: {
    art: () => gearArt(1),
    markup: () => gearMark(1)
  },

  gearCCW: {
    art: () => gearArt(-1),
    markup: () => gearMark(-1)
  },

  dockingBay: {
    art: ctx => plate(ART.dock) + rivets() + artText(ctx.arg, 50, 52, ART.dockText, 40),
    markup: ctx => mk("M 20 20 L 80 20 L 80 80 L 20 80 Z", MARK.ground, 1.4) +
      mkText(ctx.arg, 50, 52, MARK.ground, 30)
  },

  repairSite: {
    art: () => plate(ART.repair) + rivets() + wrench(50),
    markup: () => mk(wrenchPath(50), MARK.ground, 1.5)
  },

  upgradeSite: {
    art: () => plate(ART.upgrade) + rivets() + wrench(34) + wrench(66),
    markup: () => mk(wrenchPath(34) + " " + wrenchPath(66), MARK.ground, 1.5)
  },

  oilClassic: { art: () => oilArt(), markup: () => oilMark() },
  oilModern: { art: () => oilArt(), markup: () => oilMark() },

  portalClassic: { art: ctx => ringArt(ctx, ART.portal), markup: ctx => ringMark(ctx) },
  portalModern: { art: ctx => ringArt(ctx, ART.portal), markup: ctx => ringMark(ctx) },
  teleporter: { art: ctx => ringArt(ctx, ART.teleport), markup: ctx => ringMark(ctx) },

  energySpace: {
    art: () => plate(ART.energy) + rivets() +
      '<path d="M 56 16 L 34 54 L 48 54 L 42 84 L 66 44 L 52 44 Z" fill="' + ART.spark + '"/>',
    markup: () => mk("M 56 16 L 34 54 L 48 54 L 42 84 L 66 44 L 52 44 Z", MARK.ground, 1.5)
  },

  water: { art: () => waterArt(), markup: () => waterMark() },

  drain: {
    art: () => waterArt() + '<circle cx="50" cy="52" r="22" fill="#000" stroke="' + ART.pitEdge + '" stroke-width="3"/>',
    markup: () => waterMark() + mk("M 30 52 A 20 20 0 1 1 70 52 A 20 20 0 1 1 30 52 M 36 38 L 64 66 M 64 38 L 36 66", MARK.hazard, 1.6)
  },

  current: {
    /* a belt that is also water: the water plate, then the belt over it */
    art: ctx => waterArt() + beltArt(ctx.arms, false).replace(plate(), ""),
    markup: ctx => waterMark() + beltMark(ctx.arms, false)
  },

  ramp: {
    /* Drawn pointing north, which is uphill. The wedge is thickest at the top. */
    art: () => plate("#2f3b32", "#4d6b52") + rivets() +
      '<path d="M 20 86 L 80 86 L 50 14 Z" fill="#3f5a46" stroke="#7fd39a" stroke-width="3"/>' +
      '<path d="M 36 70 L 50 54 L 64 70 M 40 84 L 50 72 L 60 84" fill="none" stroke="#7fd39a" stroke-width="5" stroke-linecap="round"/>',
    markup: () => mk("M 20 86 L 80 86 L 50 14 Z M 36 70 L 50 54 L 64 70", MARK.level, 1.5)
  },

  randomizer: {
    art: () => plate("#3a2d3f") + rivets() +
      '<rect x="24" y="26" width="52" height="52" rx="10" fill="#54405c" stroke="#c79ad8" stroke-width="3"/>' +
      [[38, 40], [62, 40], [50, 52], [38, 64], [62, 64]]
        .map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#e9d2f4"/>').join(""),
    markup: () => mk("M 24 26 L 76 26 L 76 78 L 24 78 Z", MARK.ground, 1.4) +
      mkText("?", 50, 53, MARK.ground, 34)
  },

  priorityAntenna: {
    art: () => plate("#2a3346") + rivets() +
      '<path d="M 50 84 L 50 24 M 30 40 L 50 24 L 70 40" fill="none" stroke="#9fd8ff" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M 26 62 A 34 34 0 0 1 74 62" fill="none" stroke="#9fd8ff" stroke-width="4" opacity="0.7"/>',
    markup: () => mk("M 50 84 L 50 24 M 30 40 L 50 24 L 70 40 M 26 62 A 34 34 0 0 1 74 62", MARK.ground, 1.5)
  },

  rebootToken: {
    /* Directional: the arrow shoves an obstructing robot. Drawn pointing north. */
    art: () => plate("#3b2a2a", "#6b4444") + rivets() +
      '<rect x="24" y="30" width="52" height="52" rx="8" fill="none" stroke="#ff9a9a" stroke-width="4"/>' +
      '<path d="M 50 74 L 50 18 M 34 34 L 50 18 L 66 34" fill="none" stroke="#ff9a9a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    markup: () => mk("M 24 30 L 76 30 L 76 82 L 24 82 Z M 50 74 L 50 14 M 34 30 L 50 14 L 66 30", MARK.hazard, 1.5)
  }
};

/* A cog, and the arrow that says which way it turns.
 *
 * The arrow is ONE path -- arc and head in a single `d` -- so the two cannot
 * drift apart. The first version of this glyph wrote them as separate subpaths
 * with the head's vertex two units off the arc's end, and it read as a
 * disconnected tick. See render/gear.js for why the tangent is what connects
 * them, and why the sweep is 250 degrees rather than a token arc. */
function gearArt(turn) {
  return plate("#39304a", "#5a4c70") +
    '<path d="' + cogPath() + '" fill="' + ART.gearTeeth + '" opacity="0.55"/>' +
    '<circle cx="50" cy="50" r="' + HUB_R + '" fill="' + ART.gear + '"/>' +
    '<path d="' + turnPath(turn) + '" fill="none" stroke="' + ART.gearArrow +
    '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>';
}

function gearMark(turn) {
  /* The rim reads as a gear; the long sweep and its head read as the direction,
   * which is the part that is a rule. */
  return mk("M 18 50 A 32 32 0 1 1 82 50 A 32 32 0 1 1 18 50", MARK.ground, 1.2) +
    mk(turnPath(turn), MARK.ground, 1.8);
}

function wrenchPath(cx) {
  return "M " + cx + " 24 L " + cx + " 76 M " + (cx - 10) + " 24 A 10 10 0 0 0 " + (cx + 10) + " 24";
}
function wrench(cx) {
  return '<path d="' + wrenchPath(cx) + '" fill="none" stroke="' + ART.tool +
    '" stroke-width="8" stroke-linecap="round"/>';
}

const OIL_BLOB = "M 22 56 C 22 34 44 24 58 30 C 76 38 82 60 68 72 C 54 84 26 78 22 56 Z";
function oilArt() {
  return plate(ART.oil, "#2a2438") +
    '<path d="' + OIL_BLOB + '" fill="#0d0b14"/>' +
    '<path d="M 36 50 C 42 42 54 40 62 46" fill="none" stroke="' + ART.oilSheen + '" stroke-width="5" stroke-linecap="round"/>';
}
function oilMark() { return mk(OIL_BLOB, MARK.hazard, 1.5); }

const WAVES = "M 10 36 q 13 -10 20 0 t 20 0 t 20 0 t 20 0 " +
              "M 10 56 q 13 -10 20 0 t 20 0 t 20 0 t 20 0 " +
              "M 10 76 q 13 -10 20 0 t 20 0 t 20 0 t 20 0";
function waterArt() {
  return plate(ART.water, "#27567a") +
    '<path d="' + WAVES + '" fill="none" stroke="' + ART.wave + '" stroke-width="5" stroke-linecap="round"/>';
}
function waterMark() { return mk(WAVES, MARK.ground, 1.3); }

function ringArt(ctx, fill) {
  return plate(fill, "#6b4a7a") +
    '<circle cx="50" cy="52" r="30" fill="none" stroke="' + ART.ring + '" stroke-width="6"/>' +
    '<circle cx="50" cy="52" r="16" fill="none" stroke="' + ART.ring + '" stroke-width="4" opacity="0.7"/>' +
    artText(ctx.arg, 50, 52, "#ffffff", 22);
}
function ringMark(ctx) {
  return mk("M 20 52 A 30 30 0 1 1 80 52 A 30 30 0 1 1 20 52", MARK.ground, 1.5) +
    mkText(ctx.arg, 50, 52, MARK.ground, 26);
}

/* --- devices ---------------------------------------------------------------
 * A wall device is drawn at the edge it is bolted to, pointing the way it
 * faces. Like the ground glyphs these draw pointing NORTH -- meaning mounted on
 * the SOUTH edge of their square, firing north -- and the caller rotates. */

export const DEVICE_GLYPHS = {
  laser: {
    art: ctx => '<path d="M 40 96 L 40 74 M 60 96 L 60 74" fill="none" stroke="' + ART.laser +
      '" stroke-width="7" stroke-linecap="round"/>' +
      '<rect x="32" y="86" width="36" height="12" rx="3" fill="#5a3030" stroke="' + ART.laser + '" stroke-width="2"/>' +
      (ctx.damage > 1 ? artText(ctx.damage, 50, 68, ART.laser, 22) : ""),
    markup: ctx => mk("M 34 96 L 34 78 M 50 96 L 50 74 M 66 96 L 66 78 M 28 96 L 72 96",
      MARK.device, 1.5) + (ctx.damage > 1 ? mkText(ctx.damage, 50, 66, MARK.device, 22) : "")
  },

  pusher: {
    art: ctx => '<path d="M 26 92 L 50 68 L 74 92" fill="none" stroke="' + ART.pusher +
      '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M 26 100 L 74 100" stroke="' + ART.pusher + '" stroke-width="8" stroke-linecap="round"/>' +
      regsArt(ctx.regs, ART.pusher),
    markup: ctx => mk("M 26 92 L 50 70 L 74 92 M 24 99 L 76 99", MARK.device, 1.6) +
      regsMark(ctx.regs, MARK.device)
  },

  jet: {
    art: ctx => '<path d="M 40 98 L 40 88 L 60 88 L 60 98 Z" fill="' + ART.jet + '"/>' +
      '<path d="M 44 84 q 6 -14 -2 -22 q 14 8 14 22" fill="none" stroke="' + ART.jet +
      '" stroke-width="5" stroke-linecap="round"/>' +
      (ctx.reach > 1 ? artText("2", 68, 84, ART.jet, 20) : "") + regsArt(ctx.regs, ART.jet),
    markup: ctx => mk("M 40 98 L 40 88 L 60 88 L 60 98 M 44 84 q 6 -14 -2 -22 q 14 8 14 22",
      MARK.device, 1.5) + (ctx.reach > 1 ? mkText("2", 70, 84, MARK.device, 20) : "") +
      regsMark(ctx.regs, MARK.device)
  },

  door: {
    /* Symmetric: no facing. Drawn along the edge it stands on. */
    art: ctx => '<path d="M 14 98 L 86 98" stroke="' + ART.door +
      '" stroke-width="8" stroke-linecap="round" stroke-dasharray="14 8"/>' + regsArt(ctx.regs, ART.door),
    markup: ctx => mk("M 12 98 L 88 98", MARK.door, 2.2) + regsMark(ctx.regs, MARK.door)
  },

  press: {
    art: ctx => ceilingArt(ART.press, ctx),
    markup: ctx => ceilingMark(ctx)
  },
  crusher: {
    art: ctx => ceilingArt(ART.crusher, ctx),
    markup: ctx => ceilingMark(ctx)
  },
  flamer: {
    art: ctx => '<circle cx="50" cy="52" r="26" fill="none" stroke="' + ART.flamer +
      '" stroke-width="5" stroke-dasharray="7 6"/>' +
      '<path d="M 44 62 q 8 -18 -2 -28 q 18 10 18 28" fill="none" stroke="' + ART.flamer +
      '" stroke-width="5" stroke-linecap="round"/>' + regsArt(ctx.regs, ART.flamer, 22),
    markup: ctx => mk("M 24 52 A 26 26 0 1 1 76 52 A 26 26 0 1 1 24 52 " +
      "M 44 62 q 8 -18 -2 -28 q 18 10 18 28", MARK.ceiling, 1.5) + regsMark(ctx.regs, MARK.ceiling, 22)
  }
};

function ceilingArt(colour, ctx) {
  return '<rect x="18" y="20" width="64" height="64" rx="6" fill="none" stroke="' + colour +
    '" stroke-width="5" stroke-dasharray="10 7"/>' +
    '<path d="M 30 32 L 50 52 L 70 32 M 30 72 L 50 52 L 70 72" fill="none" stroke="' + colour +
    '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' + regsArt(ctx.regs, colour, 22);
}
function ceilingMark(ctx) {
  return mk("M 18 20 L 82 20 L 82 84 L 18 84 Z M 30 32 L 50 52 L 70 32 M 30 72 L 50 52 L 70 72",
    MARK.ceiling, 1.5) + regsMark(ctx.regs, MARK.ceiling, 22);
}

/** The register set, printed small. "" means every register, which is what the
 *  board prints when it prints no number at all. */
function regsLabel(regs) { return regs && regs.length ? regs.join("") : "*"; }
function regsArt(regs, colour, y = 78) { return artText(regsLabel(regs), 50, y, colour, 18); }
function regsMark(regs, colour, y = 78) { return mkText(regsLabel(regs), 50, y, colour, 18); }
