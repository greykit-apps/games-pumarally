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
import { deckId } from "./palette.js";
import { bayNumberOf } from "../lib/token.js";
import { ARM_CODES } from "../lib/token.js";
import { beltPaths } from "./belt.js";
import * as A from "./art.js";
import { turnPath } from "./gear.js";
import { N } from "../lib/dir.js";

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

/* A PLATE IS LIT, NOT OUTLINED. The old one was a flat fill inside a stroke
 * BRIGHTER than the fill on all four sides, and nothing solid has ever looked
 * like that -- it is the outline of a shape rather than the edge of an object,
 * and the whole board inherited it. Here the top-left run catches the light and
 * the bottom-right run falls into shadow, against the one light source
 * render/palette.js sets up. */
const plate = (fill = ART.floor) =>
  '<rect x="1" y="1" width="98" height="98" rx="4" fill="' + fill + '"/>' + plateLip();

const plateLip = () =>
  '<path class="pr-plate-lip" d="M1.1 92 V5.1 A4 4 0 0 1 5.1 1.1 H92"/>' +
  '<path d="M8 98.9 H94.9 A4 4 0 0 0 98.9 94.9 V8" fill="none" stroke="#05070f"' +
  ' stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>';

const rivets = () => [[12, 12], [88, 12], [12, 88], [88, 88]]
  .map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="3.1" fill="#12151d" opacity=".75"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="url(#pr-rivet)"/>').join("");

/**
 * The floor itself: a riveted deck plate. Drawn under EVERY square in play art,
 * because a belt, a gear or a pit is a thing standing on the floor, not a
 * replacement for it -- which is exactly why it is a <use> of a shape defined
 * once in ART_DEFS rather than forty lines of geometry per square. A board is
 * a hundred and forty-four of these and a course is four boards.
 *
 * `level` picks the band it is stamped in, so elevation is something you SEE
 * rather than something you read off a hundred small numerals.
 */
export function floorArt(level = 0) {
  return '<use href="#pr-deck-' + deckId(level) + '"/>';
}

/* Water, and the three things that stand in it. A flooded deck: the bed goes
 * over the plate rather than instead of it, so the square is still a square of
 * the same floor -- with water on it. */
export function waterBed() {
  return '<rect class="pr-waterbed" x="1" y="1" width="98" height="98" rx="4"/>' +
    '<path class="pr-waterlip" d="M1.1 92 V5.1 A4 4 0 0 1 5.1 1.1 H92"/>';
}

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
  /* The game's own belt: rail, then bed over it so only the rail's edges show,
   * then the arrow painted on the bed. Classes rather than inline colour, so
   * the palette drives it -- a livery is a colour on an element. */
  const p = beltPaths(arms, N, express ? 2 : 1);
  const join = (list, cls) => list.map(d => '<path class="' + cls + '" d="' + d + '"/>').join("");
  return '<g class="pr-art ' + (express ? "pr-express" : "pr-belt") + '">' +
    join(p.beds, "pr-bed") + join(p.rails, "pr-rail") +
    join(p.marks, "pr-mark") + join(p.chevrons, "pr-mark") + "</g>";
}

/** What a belt paints ON its bed: the arrow and chevrons alone, for painting again over a randomizer. */
function beltOver(arms, express) {
  const p = beltPaths(arms, N, express ? 2 : 1);
  const join = (list, cls) => list.map(d => '<path class="' + cls + '" d="' + d + '"/>').join("");
  return '<g class="pr-art ' + (express ? "pr-express" : "pr-belt") + '">' + join(p.marks, "pr-mark") + join(p.chevrons, "pr-mark") + "</g>";
}

/* A CURRENT IS WATER THAT MOVES, not a belt in water. No bed and no rails --
 * the printed tile has no machinery, just a flow -- only the run's arrow in a
 * deep blue, with the water's own lines drawn over it, so it reads as water
 * first and as a conveyor second, which is the order the rules meet it in. */
function currentArt(arms) {
  const p = beltPaths(arms, N, 1);
  const join = (list, cls) => list.map(d => '<path class="' + cls + '" d="' + d + '"/>').join("");
  /* The flow runs in a CHANNEL: the same run painted once wide and near-black
   * under the blue. Still no bed and no rails -- it is a cut in the water, not
   * a machine in it -- but a mid-blue arrow on a blue bed had nothing to sit
   * against, and the direction a current carries you is a rule. */
  return '<g class="pr-art pr-current">' + join(p.marks, "pr-flow") +
    join(p.marks, "pr-mark") + join(p.chevrons, "pr-mark") + "</g>";
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
    /* ONE drawing of the floor, not two. This is the same <use> the renderer
     * stamps under every other square, so the rail's floor swatch and the
     * board's floor cannot drift apart. */
    art: ctx => floorArt(ctx && ctx.level),
    markup: () => ""                         // an unmarked square IS floor
  },

  pit: {
    /* one square of hole with the rim all round it; on a board, svg.js draws
     * pits as a layer so a run of them shares one rim -- this is the swatch */
    art: () => '<rect x="0" y="0" width="100" height="100" fill="' + ART.pit + '"/>' +
      '<rect x="9" y="9" width="82" height="26" fill="url(#pr-pitwall)" opacity="0.85"/>' +
      '<path d="M 0 0 H 100 V 100 H 0 Z M 9 9 V 91 H 91 V 9 Z" fill="url(#pr-hz)" fill-rule="evenodd" opacity="0.42"/>',
    markup: () => mk("M 16 16 L 84 84 M 84 16 L 16 84 M 8 8 L 92 8 L 92 92 L 8 92 Z", MARK.hazard, 1.6)
  },

  conveyor: {
    art: ctx => beltArt(ctx.arms, false),
    over: ctx => beltOver(ctx.arms, false),
    markup: ctx => beltMark(ctx.arms, false)
  },

  expressConveyor: {
    art: ctx => beltArt(ctx.arms, true),
    over: ctx => beltOver(ctx.arms, true),
    markup: ctx => beltMark(ctx.arms, true)
  },

  gearCW: {
    art: () => A.gearSvg(1),
    markup: () => gearMark(1)
  },

  gearCCW: {
    art: () => A.gearSvg(-1),
    markup: () => gearMark(-1)
  },

  dockingBay: {
    art: ctx => A.dockSvg(String(bayNumberOf(ctx.arg) || ctx.arg)),
    markup: ctx => mk("M 20 20 L 80 20 L 80 80 L 20 80 Z", MARK.ground, 1.4) +
      mkText(String(bayNumberOf(ctx.arg) || ctx.arg), 50, 52, MARK.ground, 30)
  },

  oil: { art: () => A.oilSvg(), markup: () => oilMark() },

  portal: { art: ctx => A.portalSvg(ctx.arg), markup: ctx => ringMark(ctx) },
  /* Its own markup, not the portal's. Both used to draw ringMark, telling each
   * other apart only by the pair digit printed inside -- and the teleporter no
   * longer has one, so sharing would now leave the two identical over a
   * photograph. The hexagon matches its art and the chevron says what it does:
   * it throws you forward along the way you are already facing. */
  teleporter: {
    art: () => A.teleporterSvg(),
    markup: () => mk("M 50 14 L 81 32 L 81 68 L 50 86 L 19 68 L 19 32 Z", MARK.ground, 1.5) +
      mk("M 36 58 L 50 40 L 64 58", MARK.ground, 1.5)
  },

  water: { art: () => waterBed() + A.waterSvg(), markup: () => waterMark() },

  drain: {
    art: () => waterBed() + A.drainSvg(),
    markup: () => waterMark() + mk("M 30 52 A 20 20 0 1 1 70 52 A 20 20 0 1 1 30 52 M 36 38 L 64 66 M 64 38 L 36 66", MARK.hazard, 1.6)
  },

  current: {
    /* water that moves: the bed, the arrow of the run, then the water's lines
     * over it. Still no machinery -- a current is not a belt that happens to
     * be wet -- but it IS water, and it now stands in the same bed open water
     * and a drain do, because all three carry `water: true` and the rules read
     * that off all three alike. */
    art: ctx => waterBed() + currentArt(ctx.arms) + A.waterSvg(),
    over: ctx => currentArt(ctx.arms) + A.waterSvg(),
    markup: ctx => waterMark() + beltMark(ctx.arms, false)
  },

  priorityAntenna: {
    art: () => plate("#2a3346") + rivets() +
      '<path d="M 50 84 L 50 24 M 30 40 L 50 24 L 70 40" fill="none" stroke="#9fd8ff" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M 26 62 A 34 34 0 0 1 74 62" fill="none" stroke="#9fd8ff" stroke-width="4" opacity="0.7"/>',
    markup: () => mk("M 50 84 L 50 24 M 30 40 L 50 24 L 70 40 M 26 62 A 34 34 0 0 1 74 62", MARK.ground, 1.5)
  },

  rebootToken: {
    /* Directional: the arrow shoves an obstructing robot. Drawn pointing north. */
    art: () => plate("#3b2a2a") + rivets() +
      '<rect x="24" y="30" width="52" height="52" rx="8" fill="none" stroke="#ff9a9a" stroke-width="4"/>' +
      '<path d="M 50 74 L 50 18 M 34 34 L 50 18 L 66 34" fill="none" stroke="#ff9a9a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    markup: () => mk("M 24 30 L 76 30 L 76 82 L 24 82 Z M 50 74 L 50 14 M 34 30 L 50 14 L 66 30", MARK.hazard, 1.5)
  }
};

/* SIX SECOND DRAWINGS DELETED HERE.
 *
 * `gearArt`, `waterArt`, `oilArt`, `ringArt`, `wrench` and `regsArt` were a
 * complete, unreferenced play-art set for the gear, water, the oil slick, the
 * portal, the wrench and the register stamp, sitting beside the ones the board
 * actually draws (render/art.js). Nothing called any of them. They are gone
 * rather than updated, because this file's own header names two glyph sets as
 * the drift risk the project keeps warning about -- and a second drawing that
 * nobody renders is the worst kind, since it can never be seen going wrong.
 * The markup halves of the same pairs are live and stay.
 *
 * The arrow on a gear is ONE path -- arc and head in a single `d` -- so the two
 * cannot drift apart. The first version of that glyph wrote them as separate
 * subpaths with the head's vertex two units off the arc's end, and it read as a
 * disconnected tick. See render/gear.js for why the tangent is what connects
 * them, and why the sweep is 250 degrees rather than a token arc. */

function gearMark(turn) {
  /* The rim reads as a gear; the long sweep and its head read as the direction,
   * which is the part that is a rule. */
  return mk("M 18 50 A 32 32 0 1 1 82 50 A 32 32 0 1 1 18 50", MARK.ground, 1.2) +
    mk(turnPath(turn), MARK.ground, 1.8);
}

function wrenchPath(cx) {
  return "M " + cx + " 24 L " + cx + " 76 M " + (cx - 10) + " 24 A 10 10 0 0 0 " + (cx + 10) + " 24";
}
const OIL_BLOB = "M 22 56 C 22 34 44 24 58 30 C 76 38 82 60 68 72 C 54 84 26 78 22 56 Z";
function oilMark() { return mk(OIL_BLOB, MARK.hazard, 1.5); }

const WAVES = "M 10 36 q 13 -10 20 0 t 20 0 t 20 0 t 20 0 " +
              "M 10 56 q 13 -10 20 0 t 20 0 t 20 0 t 20 0 " +
              "M 10 76 q 13 -10 20 0 t 20 0 t 20 0 t 20 0";
function waterMark() { return mk(WAVES, MARK.ground, 1.3); }

function ringMark(ctx) {
  return mk("M 20 52 A 30 30 0 1 1 80 52 A 30 30 0 1 1 20 52", MARK.ground, 1.5) +
    mkText(ctx.arg, 50, 52, MARK.ground, 26);
}

/* --- devices ---------------------------------------------------------------
 * A wall device is drawn at the edge it is bolted to, pointing the way it
 * faces. Like the ground glyphs these draw pointing NORTH -- meaning mounted on
 * the SOUTH edge of their square, firing north -- and the caller rotates. */

export const DEVICE_GLYPHS = {
  /* The game's drawings. Each is drawn as if mounted on the SOUTH edge firing
   * NORTH and the caller rotates, which is the convention the rest of this file
   * uses -- the game's own functions take a direction, so they are called with
   * the one that matches and turned from there. */
  /* A laser is a steel housing bolted to the wall with a lens for every beam
   * it fires -- one, two or three across, the way the printed board shows
   * them -- and the beam itself is another layer, since it crosses squares. */
  laser: {
    /* AN EMITTER, NOT A BOX. Bolted to the wall through a bracket, a finned
     * housing on top of that, and a barrel per point of damage -- one, two or
     * three across, as the printed boards show them -- each with a muzzle ring
     * and a lens that is lit, because the thing is firing and the beam layer
     * is about to say so. The warning lamp on the bracket is the one dot of
     * hazard yellow: in this art stripes mean "this will move or swallow you",
     * and a laser does neither, so it gets a lamp and not a stripe. */
    art: ctx => {
      const n = Math.max(1, Math.min(3, ctx.damage | 0));
      const w = 20 + n * 14, x0 = 50 - w / 2, x1 = 50 + w / 2;
      let out = '<g class="pr-laser">' +
        '<rect class="pr-las-bracket" x="' + (x0 - 7) + '" y="89" width="' + (w + 14) + '" height="10" rx="2"/>' +
        '<circle class="pr-las-bolt" cx="' + (x0 - 2.5) + '" cy="94" r="2.4"/>' +
        '<circle class="pr-las-bolt" cx="' + (x1 + 2.5) + '" cy="94" r="2.4"/>' +
        '<rect class="pr-las-body" x="' + x0 + '" y="70" width="' + w + '" height="21" rx="3"/>' +
        '<path class="pr-plate-lip" d="M' + (x0 + 2) + ' 71.2 H' + (x1 - 2) + '"/>' +
        '<path class="pr-las-fin" d="M' + (x0 + 3) + ' 77 H' + (x1 - 3) + ' M' + (x0 + 3) + ' 82 H' + (x1 - 3) + ' M' + (x0 + 3) + ' 87 H' + (x1 - 3) + '"/>' +
        '<circle class="pr-las-warn" cx="' + (x1 + 2.5) + '" cy="94" r="1.1"/>';
      for (let i = 0; i < n; i++) {
        const cx = 50 + (i - (n - 1) / 2) * 14;
        out += '<rect class="pr-las-barrel" x="' + (cx - 4.5) + '" y="58" width="9" height="14" rx="1.5"/>' +
          '<path class="pr-las-muzzle" d="M' + (cx - 4.5) + ' 61.5 H' + (cx + 4.5) + '"/>' +
          '<circle cx="' + cx + '" cy="58.5" r="7" fill="' + ART.laser + '" opacity="0.4" filter="url(#pr-beamglow)"/>' +
          '<circle cx="' + cx + '" cy="58.5" r="3.6" fill="' + ART.laser + '"/>' +
          '<circle cx="' + cx + '" cy="58.5" r="1.6" fill="#ffe6e3"/>';
      }
      return out + "</g>";
    },
    markup: ctx => mk("M 34 96 L 34 78 M 50 96 L 50 74 M 66 96 L 66 78 M 28 96 L 72 96",
      MARK.device, 1.5) + (ctx.damage > 1 ? mkText(ctx.damage, 50, 66, MARK.device, 22) : "")
  },

  pusher: {
    art: ctx => A.pusherSvg(N, true),
    markup: ctx => mk("M 26 92 L 50 70 L 74 92 M 24 99 L 76 99", MARK.device, 1.6) +
      regsMark(ctx.regs, MARK.device)
  },

  jet: {
    art: ctx => A.burnerSvg(N, true) +
      (ctx.reach > 1 ? artText("2", 82, 78, ART.jet, 20) : ""),
    markup: ctx => mk("M 40 98 L 40 88 L 60 88 L 60 98 M 44 84 q 6 -14 -2 -22 q 14 8 14 22",
      MARK.device, 1.5) + (ctx.reach > 1 ? mkText("2", 70, 84, MARK.device, 20) : "") +
      regsMark(ctx.regs, MARK.device)
  },

  door: {
    /* Symmetric: no facing. Drawn along the edge it stands on. */
    art: ctx => '<path d="M 14 98 L 86 98" stroke="' + ART.door +
      '" stroke-width="8" stroke-linecap="round" stroke-dasharray="14 8"/>',
    markup: ctx => mk("M 12 98 L 88 98", MARK.door, 2.2) + regsMark(ctx.regs, MARK.door)
  },

  crusher: {
    /* The game's own press drawing -- a ram on a shaft with a bolt through it,
     * which is what the printed disc is in either box. One device, so one
     * drawing; the name it goes by is the ruleset's business. */
    art: ctx => A.pressSvg(),
    markup: ctx => ceilingMark(ctx)
  },
  flamer: {
    /* the game's grate-and-tongues drawing; see art.js for why it is not the
       jet's plume with the nozzle left off */
    art: ctx => A.flamerSvg(),
    markup: ctx => mk("M 24 52 A 26 26 0 1 1 76 52 A 26 26 0 1 1 24 52 " +
      "M 44 62 q 8 -18 -2 -28 q 18 10 18 28", MARK.ceiling, 1.5) + regsMark(ctx.regs, MARK.ceiling, 22)
  }
};

/* THE REGISTER STAMP, in the game's place and the game's colours.
 *
 * Which registers a thing fires on is a RULE, not decoration, so the digits go
 * on the tile rather than into a legend. The game overlays an HTML span; this
 * is SVG text, since the editor emits one self-contained SVG.
 *
 * IT STAYS UPRIGHT, in the square's top-left corner whichever way the device
 * points, which is how the printed boards stamp theirs and how the old game
 * drew them: a rotated number is a number nobody reads. The renderer draws it
 * as its own unrotated group over the device (svg.js, deviceLayer).
 *
 * No list means every register, and the board prints nothing there -- so this
 * draws nothing either, rather than inventing a mark for the commonest case. */
export function stampArt(regs) {
  if (!regs || !regs.length) return "";
  const text = regs.join("");
  return '<g class="pr-art pr-stamp-g">' +
    '<rect class="pr-stamp-bg" x="1" y="1" width="' + (6 + text.length * 11) + '" height="21" rx="2"/>' +
    '<text class="pr-stamp" x="4" y="5">' + esc(text) + "</text></g>";
}

function ceilingMark(ctx) {
  return mk("M 18 20 L 82 20 L 82 84 L 18 84 Z M 30 32 L 50 52 L 70 32 M 30 72 L 50 52 L 70 72",
    MARK.ceiling, 1.5) + regsMark(ctx.regs, MARK.ceiling, 22);
}

/** The register set, printed small. "" means every register, which is what the
 *  board prints when it prints no number at all. */
function regsLabel(regs) { return regs && regs.length ? regs.join("") : "*"; }
function regsMark(regs, colour, y = 78) { return mkText(regsLabel(regs), 50, y, colour, 18); }


/* --- sites -----------------------------------------------------------------
 * Markings a square carries in addition to what it is, drawn OVER the square's
 * own glyph. More than one can be on a square -- the same printed floor is a
 * wrench in one game and a battery in the other -- so they have to share the
 * space rather than each assume they have it.
 *
 * The layout is the whole design here. A wrench and a battery split the square
 * left and right when both are present and take the middle when alone; a flag
 * location always goes in the top-right corner, small, so it never has to
 * negotiate with anything and reads the same on every square that has one.
 */

const BOLT = "M 56 16 L 34 54 L 48 54 L 42 84 L 66 44 L 52 44 Z";
const FLAGPOLE = "M 30 90 L 30 12 L 76 30 L 30 48";

function box(x, y, k, body) {
  return '<g transform="translate(' + x + " " + y + ") scale(" + k + ')">' + body + "</g>";
}

/** The site markings on a square, as one overlay. `has` is canonical. */
export function siteOverlay(has, mode) {
  if (!has || !has.length) return "";
  const wrenches = has.indexOf("upgrade") >= 0 ? 2 : has.indexOf("repair") >= 0 ? 1 : 0;
  const battery = has.indexOf("battery") >= 0;
  const flag = has.indexOf("flagspot") >= 0;
  const art = mode === "art";
  let out = "";

  /* the wrench and the battery share the square when both are printed on it */
  const both = wrenches && battery;
  const k = both ? 0.52 : 1;
  const wx = both ? -2 : 0, bx = both ? 46 : 0;
  const y = both ? 24 : 0;

  if (wrenches) {
    const body = art ? A.repairSvg(wrenches === 2)
      : mk(wrenches === 2 ? wrenchPath(34) + " " + wrenchPath(66) : wrenchPath(50), MARK.ground, 2.4);
    out += box(wx, y, k, body);
  }
  if (battery) {
    const body = art ? A.batterySvg() : mk(BOLT, MARK.ground, 2.4);
    out += box(bx, y, k, body);
  }
  if (has.indexOf("randomizer") >= 0 && !art) {
    /* In markup, the print's eight-point star at full size with a ? in it,
     * so it is as loud over a photograph as it is on the board. In the play
     * art the starburst is drawn by the ground layer instead, under the
     * square's element, so a belt's arrow lies over it exactly as printed. */
    out += mk("M 50.0 2.0 L 61.5 22.3 L 83.9 16.1 L 77.7 38.5 L 98.0 50.0 L 77.7 61.5 L 83.9 83.9 L 61.5 77.7 L 50.0 98.0 L 38.5 77.7 L 16.1 83.9 L 22.3 61.5 L 2.0 50.0 L 22.3 38.5 L 16.1 16.1 L 38.5 22.3 Z", MARK.hazard, 1.6) + mkText("?", 50, 52, MARK.hazard, 30);
  }
  if (flag) {
    /* Always the same corner at the same size. A flag LOCATION is a question
     * about the square -- somewhere a flag may go -- not a flag standing on it,
     * so it is drawn hollow: the game's banner outlined rather than filled, and
     * small enough to be counted at a glance across a whole board. */
    const body = art
      ? '<g class="pr-art pr-flagspot">' +
        '<path class="pr-spot" d="M25 14H92L79 40L92 66H25Z"/>' +
        '<path class="pr-spot-pole" d="M21 10L21 92"/></g>'
      : mk(FLAGPOLE, MARK.hazard, 4);
    out += box(58, 2, 0.4, body);
  }
  return out;
}

/**
 * A swatch for the rail: the marking alone, on a plain plate.
 *
 * The randomizer is the exception, and it was a BLANK BUTTON. On a board its
 * starburst is drawn by the ground layer, under the square's element, so that
 * a belt's arrow lies over it exactly as printed -- which means `siteOverlay`
 * draws nothing for it in art mode, and the rail faithfully showed nothing.
 * The swatch has no ground layer to defer to, so it draws the print itself.
 */
export function siteSwatch(key, mode) {
  if (key === "randomizer" && mode === "art") return A.randomizerSvg();
  return siteOverlay([key], mode);
}
