/* The board's palette and the CSS the tile art is drawn against.
 *
 * LIFTED FROM THE GAME, not re-derived. The art is class-based and the palette
 * drives it -- "a livery is a colour on an element, not eight pre-rendered
 * canvases" -- so porting the drawings without the stylesheet would have meant
 * re-typing every colour into every shape, which is a transcription job with no
 * check on it. The classes come across with the shapes and this is what makes
 * them mean anything.
 *
 * Two things had to change for an editor that emits ONE self-contained SVG
 * rather than a tree of positioned DOM:
 *
 *   - the wall art. The game draws walls as absolutely-positioned divs with CSS
 *     gradients for concrete; an SVG cannot use a gradient the same way, so
 *     walls are drawn here as a bar of the same width (0.19 of a tile, centred
 *     on the edge) in the same concrete greys, with the shadow as a filter.
 *   - the register stamp. The game overlays an HTML span; here it is SVG text
 *     in the same corner, the same hazard yellow on the same dark ground.
 */

export const TOKENS = {
  "bg": "#05070f",
  "panel": "#0a0e1a",
  "panelAlt": "#0d1424",
  "floor": "#0e1524",
  "border": "#1b2540",
  "borderLit": "#47609c",
  "line": "#141d33",
  "accent": "#54f2ff",
  "accentDim": "#2b7f92",
  "text": "#dbe4fb",
  "ink": "#8b96b8",
  "dim": "#7d8aa8",
  "rust": "#d2713f",
  "current": "#2a5fd4",
  "warn": "#ffb000",
  "danger": "#ff5266",
  "good": "#4ade6a",
  "violet": "#b47dff",
  "steel": "#94a0c4",
  "concrete": "#9aa1ae",
  "concreteEdge": "#4a5160",
  "hazard": "#f2c400",
  "hazardDark": "#14161c",
  "beltBed": "#2a1a0e",
  "expressBed": "#0b2028",
  "plate": "#273249"
};

/* Concrete, from the game's gradient stops. A wall is concrete and NOT hazard
 * striped -- in this art language stripes mean "this will move or swallow you",
 * and a wall is the one thing on the board that simply will not. */
export const CONCRETE = { lit: "#99a0ad", mid: "#7a818e", dark: "#5f6674", edge: "#3c424e" };

/* ONE LIGHT, AND IT COMES FROM THE TOP LEFT.
 *
 * The art was lit from nowhere: a wall's shadow was a symmetric blur at dx=0
 * dy=0, which is a glow rather than a shadow, and the floor plate was a flat
 * fill with a LIGHTER outline all the way round -- an outline that bright on
 * every side is the one thing that cannot describe a solid, and it is most of
 * why a board read as a diagram of itself. Everything below agrees on a single
 * light: what stands up (a wall, a ledge, a rivet, a plate) is lit along its
 * top and left and casts down and right, and what sinks (a pit, a drain, an
 * oil slick) is darkest where the light cannot reach it.
 *
 * It is a rendering decision, not a rules one. Nothing here changes what a
 * square means; a lit edge and a cast shadow only make the same square easier
 * to pick out of a grid of its neighbours.
 */

/* A DECK RATHER THAN A FILL. The floor is drawn under every square of every
 * board, so it is defined ONCE here and stamped with <use> -- which is both
 * how it can afford to be this detailed and why the SVG got smaller rather
 * than larger. Five of them, one per level band, because SHOWING elevation IS
 * THE LEGIBILITY FIX: a board like Water Park is most of a hundred squares
 * each carrying a tiny signed numeral, and reading the terrain off ninety
 * little "-1"s is not reading it at all. The numeral stays -- it is the exact
 * value and the shading is only a band -- but the eye now gets the shape of
 * the ground for free, and the digit confirms it.
 */
const DECKS = [
  ["dn2", "#14171f", "#0d1016"],
  ["dn1", "#1f232e", "#171a23"],
  ["0",   "#2f3545", "#242936"],
  ["up1", "#434c62", "#353d4f"],
  ["up2", "#57627e", "#464f66"]
];

const RIVETS = [[12, 12], [88, 12], [12, 88], [88, 88]];

function deckGroup([id, top, bot]) {
  const rivets = RIVETS.map(([x, y]) =>
    '<circle cx="' + x + '" cy="' + y + '" r="3.1" fill="#12151d" opacity=".75"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="url(#pr-rivet)"/>').join("");
  return '<g id="pr-deck-' + id + '">' +
    '<rect x="1" y="1" width="98" height="98" rx="4" fill="url(#pr-deck-' + id + '-g)"/>' +
    '<rect x="1" y="1" width="98" height="98" rx="4" fill="url(#pr-grit)"/>' +
    /* the bevel: lit along the top-left run, shadowed along the bottom-right */
    '<path d="M1.1 92 V5.1 A4 4 0 0 1 5.1 1.1 H92" fill="none" stroke="#aebad6"' +
      ' stroke-opacity=".13" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M8 98.9 H94.9 A4 4 0 0 0 98.9 94.9 V8" fill="none" stroke="#05070f"' +
      ' stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>' +
    rivets + "</g>";
}

function deckGradient([id, top, bot]) {
  return '<linearGradient id="pr-deck-' + id + '-g" x1="0" y1="0" x2="0.35" y2="1">' +
    '<stop offset="0" stop-color="' + top + '"/>' +
    '<stop offset="1" stop-color="' + bot + '"/>' +
    "</linearGradient>";
}

/** A level, as the deck band that draws it. Clamped: past two steps the shade
 *  stops carrying information and the numeral is doing the work anyway. */
export function deckId(level) {
  const n = Math.max(-2, Math.min(2, level | 0));
  return n === 0 ? "0" : (n < 0 ? "dn" : "up") + Math.abs(n);
}

/** The hazard stripe as an SVG pattern, and the wall's shadow. One definition,
 *  at the game's pitch, so a pit rim and a pusher deck are the same stripe. */
export const ART_DEFS =
  '<defs>' +
    '<pattern id="pr-hz" width="14" height="14" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(-45)">' +
      '<rect class="pr-hz-dark" width="14" height="14"/>' +
      '<rect class="pr-hz-lit" width="7" height="14"/>' +
    '</pattern>' +
    /* WEAR, NOT STRIPES. The first version of this was a two-line hatch, which
     * at board scale is a texture and at the editor's 4x is corduroy -- and a
     * texture that changes its mind about what it is between zoom levels is
     * worse than no texture. Short scratches and specks at a few angles read
     * as a used deck at both ends of the range, because there is no one
     * direction for the eye to lock onto. It lives INSIDE the deck group, so
     * its period is the square: a texture whose repeat is the tile has no
     * visible repeat. */
    '<pattern id="pr-grit" width="17" height="17" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(12)">' +
      '<g stroke="#05070f" stroke-opacity="0.16" stroke-width="1" stroke-linecap="round">' +
        '<path d="M1 3l5 1.6"/><path d="M9.5 8.5l4.6-2"/><path d="M3.6 12.4l3 3.4"/>' +
        '<path d="M13 14.2l2.6 1.1"/>' +
      '</g>' +
      '<g stroke="#e3ebff" stroke-opacity="0.05" stroke-width="1" stroke-linecap="round">' +
        '<path d="M1 3.9l5 1.6"/><path d="M9.7 9.4l4.6-2"/><path d="M2.9 12.9l3 3.4"/>' +
        '<path d="M6.4 1.6l1.8 2.4"/>' +
      '</g>' +
    '</pattern>' +
    '<radialGradient id="pr-rivet" cx="0.34" cy="0.3" r="0.8">' +
      '<stop offset="0" stop-color="#9fadc9"/>' +
      '<stop offset="0.55" stop-color="#5d6880"/>' +
      '<stop offset="1" stop-color="#363e50"/>' +
    '</radialGradient>' +
    DECKS.map(deckGradient).join("") +
    /* Water: a flooded deck, not a squiggle on a dry one. The waves alone left
     * a water square and a plain floor square telling each other apart by six
     * thin lines, which on a board that is half water is no distinction at
     * all -- and a current, a drain and open water all carry `water: true`, so
     * all three stand in the same bed. */
    '<linearGradient id="pr-water-g" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" stop-color="#1b4568"/>' +
      '<stop offset="1" stop-color="#0d2439"/>' +
    '</linearGradient>' +
    /* Oil is BLACK, and a black puddle on a dark deck is invisible -- which is
     * a rules problem, because an oil slick is a square you slide across. The
     * sheen is what makes it findable: real oil on water is iridescent, so the
     * film gets a raking band of violet through teal to amber. Dark, and still
     * the brightest thing on the square. */
    /* In user space and reflected, so the rainbow cycles once per square along
     * the diagonal: a slick that runs across six squares gets six bands of
     * colour, not one stretched one -- and a lone puddle gets a whole cycle. */
    '<linearGradient id="pr-oil-g" gradientUnits="userSpaceOnUse" spreadMethod="reflect" ' +
      'x1="10" y1="0" x2="90" y2="100">' +
      '<stop offset="0" stop-color="#7d6bff" stop-opacity="0.13"/>' +
      '<stop offset="0.38" stop-color="#3ad6c8" stop-opacity="0.1"/>' +
      '<stop offset="0.66" stop-color="#d8a13c" stop-opacity="0.07"/>' +
      '<stop offset="1" stop-color="#7d6bff" stop-opacity="0.03"/>' +
    '</linearGradient>' +
    '<linearGradient id="pr-steel-g" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" stop-color="#aab6d2"/>' +
      '<stop offset="0.5" stop-color="#7b86a4"/>' +
      '<stop offset="1" stop-color="#525b73"/>' +
    '</linearGradient>' +
    /* The far wall of a hole. A flat band said "there is a ledge here"; a band
     * that fades as it descends says how deep the hole is, which is the only
     * thing a pit has to communicate. */
    '<linearGradient id="pr-pitwall" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#39445c"/>' +
      '<stop offset="0.45" stop-color="#202940" stop-opacity="0.8"/>' +
      '<stop offset="1" stop-color="#05070f" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<radialGradient id="pr-hub-g" cx="0.34" cy="0.3" r="0.85">' +
      '<stop offset="0" stop-color="#3c4a68"/>' +
      '<stop offset="1" stop-color="#1c2437"/>' +
    '</radialGradient>' +
    '<linearGradient id="pr-concrete-h" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + CONCRETE.lit + '"/>' +
      '<stop offset="0.52" stop-color="' + CONCRETE.mid + '"/>' +
      '<stop offset="1" stop-color="' + CONCRETE.dark + '"/>' +
    '</linearGradient>' +
    /* the paint along a drop: dimmed factory yellow at the lip, darkening as
     * it falls away. The gradient runs down the band's own box, which the
     * edge's rotation turns with it, so "down" is always away from the lip. */
    '<linearGradient id="pr-paint-g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#cfa72c"/>' +
      '<stop offset="0.45" stop-color="#9a7a1c"/>' +
      '<stop offset="1" stop-color="#4d3c0e"/>' +
    '</linearGradient>' +
    '<linearGradient id="pr-concrete-v" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + CONCRETE.lit + '"/>' +
      '<stop offset="0.52" stop-color="' + CONCRETE.mid + '"/>' +
      '<stop offset="1" stop-color="' + CONCRETE.dark + '"/>' +
    '</linearGradient>' +
    /* A shadow that falls somewhere. dx/dy were both zero, which draws a halo
     * on all four sides and reads as a glowing bar rather than a raised one. */
    '<filter id="pr-wallshadow" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feDropShadow dx="1.8" dy="2.6" stdDeviation="2.4" flood-color="#000" flood-opacity="0.66"/>' +
    '</filter>' +
    /* The beam's bloom. A laser is always on and the beam is what says so, so
     * it gets to look like it is emitting rather than like a drawn line. */
    /* softens the oil's streaks from pen lines into sheen; one per layer */
    '<filter id="pr-oilsoft" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feGaussianBlur stdDeviation="1.1"/>' +
    '</filter>' +
    '<filter id="pr-beamglow" x="-25%" y="-25%" width="150%" height="150%">' +
      '<feGaussianBlur stdDeviation="4.5"/>' +
    '</filter>' +
    DECKS.map(deckGroup).join("") +
  '</defs>';

/** The palette, as custom properties the art CSS resolves against. */
export const PALETTE_CSS = ":root,.pr-art{--pr-bg:#05070f;--pr-panel:#0a0e1a;--pr-panel-alt:#0d1424;--pr-floor:#0e1524;--pr-border:#1b2540;--pr-border-lit:#47609c;--pr-line:#141d33;--pr-accent:#54f2ff;--pr-accent-dim:#2b7f92;--pr-text:#dbe4fb;--pr-ink:#8b96b8;--pr-dim:#7d8aa8;--pr-rust:#d2713f;--pr-current:#2a5fd4;--pr-warn:#ffb000;--pr-danger:#ff5266;--pr-good:#4ade6a;--pr-violet:#b47dff;--pr-steel:#94a0c4;--pr-concrete:#9aa1ae;--pr-concrete-edge:#4a5160;--pr-hazard:#f2c400;--pr-hazard-dark:#14161c;--pr-belt-bed:#2a1a0e;--pr-express-bed:#0b2028;--pr-plate:#273249}";

/** The game's tile-art rules, verbatim -- with one repair. The bed, rail and
 *  arrow classes set a stroke and never said `fill:none`, so every CURVED run
 *  also got SVG's default fill, black, over the segment between its arc and
 *  its chord. A straight is a line with no area and showed nothing; a curve
 *  painted a black wedge into the square's outer corner. It hid on the old
 *  flat floor and the textured deck showed it up. */
export const ART_CSS = ".pr-art .pr-num{fill:var(--pr-bg);stroke:none;font:700 34px ui-monospace,Menlo,Consolas,monospace;text-anchor:middle;dominant-baseline:middle}.pr-art .pr-bed{fill:none;stroke-width:68;stroke-linecap:butt;stroke-linejoin:round}.pr-art .pr-rail{fill:none;stroke-width:7;stroke-linecap:butt}.pr-art .pr-mark{fill:none;stroke-width:7;stroke-linecap:butt;stroke-linejoin:round}.pr-art .pr-head{stroke:#0b0d14;stroke-width:1.6;stroke-linejoin:round;paint-order:stroke}.pr-art .pr-tread{fill:none;stroke-width:58;stroke-linecap:butt}.pr-belt .pr-rail{stroke:var(--pr-rust)}.pr-belt .pr-bed{stroke:var(--pr-belt-bed)}.pr-belt .pr-tread{stroke:#3a2716;stroke-dasharray:3 12}.pr-belt .pr-mark{stroke:var(--pr-warn)}.pr-belt .pr-head{fill:var(--pr-warn)}.pr-express .pr-rail{stroke:var(--pr-steel)}.pr-express .pr-bed{stroke:var(--pr-express-bed)}.pr-express .pr-tread{stroke:#153444;stroke-dasharray:2.5 8}.pr-express .pr-mark{stroke:var(--pr-accent)}.pr-express .pr-head{fill:var(--pr-accent)}.pr-current .pr-flow{stroke:#071c33;stroke-width:15;stroke-linecap:round;stroke-linejoin:round;fill:none}.pr-current .pr-mark{stroke:var(--pr-current)}.pr-current .pr-head{fill:var(--pr-current)}.pr-gear .pr-cog{fill:url(#pr-steel-g);opacity:.82}.pr-gear .pr-cog-root{fill:none;stroke:#05070f;stroke-opacity:.5;stroke-width:3}.pr-gear .pr-hub{fill:url(#pr-hub-g)}.pr-gear .pr-hub-lip{fill:none;stroke:#93a2c4;stroke-opacity:.42;stroke-width:2}.pr-gear .pr-turn{stroke:var(--pr-accent);stroke-width:8;fill:none;stroke-linecap:round;stroke-linejoin:round}.pr-pusher .pr-push-slot{fill:var(--pr-bg);opacity:.9}.pr-pusher .pr-push-arm-edge{fill:none;stroke:#0b0d14;stroke-width:9.5;stroke-linecap:round;stroke-linejoin:round}.pr-pusher .pr-push-arm{fill:none;stroke:url(#pr-steel-g);stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round}.pr-pusher .pr-push-pin{fill:#1b1f2a;stroke:#8d98b3;stroke-width:1.4}.pr-pusher .pr-push-face{fill:url(#pr-hz);stroke:var(--pr-hazard-dark);stroke-width:2.5}.pr-repair .pr-plate,.pr-upgrade .pr-plate,.pr-dock .pr-plate{fill:var(--pr-plate)}.pr-repair .pr-plate,.pr-upgrade .pr-plate{stroke:#46557a;stroke-width:2.5}.pr-plate-lip{fill:none;stroke:#aebad6;stroke-opacity:.2;stroke-width:2.4;stroke-linecap:round}.pr-art .pr-tool-line{fill:none;stroke-width:9;stroke-linecap:round}.pr-art .pr-tool-fill{stroke:none}.pr-art .pr-tool-cut{fill:var(--pr-plate)}.pr-repair .pr-repair-tool{stroke:var(--pr-good);fill:var(--pr-good)}.pr-upgrade .pr-upgrade-tool{stroke:var(--pr-violet);fill:var(--pr-violet)}.pr-art .pr-tool-line.pr-repair-tool,.pr-art .pr-tool-line.pr-upgrade-tool{fill:none}.pr-dock .pr-plate{fill:#1d2333;stroke:#0b0d14;stroke-width:2}.pr-dock .pr-dock-bolt{fill:#1b1f2a;stroke:#8d98b3;stroke-width:1.2}.pr-dock .pr-dock-ring{fill:none;stroke:var(--pr-accent-dim);stroke-width:3.5}.pr-dock .pr-dock-ring-lit{fill:none;stroke:var(--pr-accent);stroke-width:3.5;stroke-linecap:round;opacity:.8}.pr-dock .pr-num{fill:var(--pr-text);stroke:#05070f;stroke-width:3;paint-order:stroke}.pr-pit .pr-hazard-frame{fill:none;stroke:url(#pr-hz);stroke-width:9;opacity:.42}.pr-pit .pr-shaft{fill:#161c2a}.pr-pit .pr-shaft-2{fill:#20283a}.pr-pit .pr-void-floor{fill:#000}.pr-paint{fill:url(#pr-paint-g)}.pr-paint-lip{fill:none;stroke:#e8c94a;stroke-opacity:.7;stroke-width:1.6;stroke-linecap:round}.pr-flag .pr-pole{fill:url(#pr-steel-g)}.pr-flag .pr-banner{fill:var(--pr-warn);stroke:var(--pr-bg);stroke-width:3}.pr-flag .pr-num{fill:#120c00;font-size:44px;font-weight:700}.pr-emitter .pr-mount{fill:var(--pr-danger)}.pr-laser .pr-las-bracket{fill:#3a4152;stroke:#0b0d14;stroke-width:1.6}.pr-laser .pr-las-bolt{fill:#1b1f2a;stroke:#8d98b3;stroke-width:1.2}.pr-laser .pr-las-body{fill:url(#pr-steel-g);stroke:#0b0d14;stroke-width:1.8}.pr-laser .pr-las-fin{fill:none;stroke:#0b0d14;stroke-opacity:.55;stroke-width:1.6}.pr-laser .pr-las-barrel{fill:#232838;stroke:#0b0d14;stroke-width:1.4}.pr-laser .pr-las-muzzle{fill:none;stroke:#aab6d2;stroke-opacity:.6;stroke-width:1.4}.pr-laser .pr-las-warn{fill:var(--pr-warn)}.pr-hz-dark{fill:var(--pr-hazard-dark)}.pr-hz-lit{fill:var(--pr-hazard)}.pr-batt .pr-batt-cell{fill:url(#pr-steel-g);stroke:var(--pr-bg);stroke-width:3}.pr-batt .pr-batt-bolt{fill:var(--pr-warn)}.pr-waterbed{fill:url(#pr-water-g)}.pr-waterlip{fill:none;stroke:#5fd4ff;stroke-opacity:.16;stroke-width:2.2;stroke-linecap:round}.pr-water .pr-wave,.pr-drain .pr-wave,.pr-current .pr-wave{fill:none;stroke:var(--pr-accent);stroke-width:5;stroke-linecap:round;opacity:.62}.pr-t-water,.pr-drain .pr-drain-hole{fill:var(--pr-bg)}.pr-drain .pr-drain-rim{fill:none;stroke:var(--pr-hazard);stroke-width:4;opacity:.8}.pr-ramp .pr-ramp-deck{fill:url(#pr-steel-g);stroke:var(--pr-bg);stroke-width:3}.pr-ramp .pr-ramp-step{fill:none;stroke:var(--pr-bg);stroke-width:4;stroke-linecap:round}.pr-rand .pr-rand-star{fill:#14161c;fill-opacity:.5;stroke:#d8dde8;stroke-width:3;stroke-linejoin:round}.pr-rand .pr-rand-burst{fill:var(--pr-danger);fill-opacity:.42;stroke:#ff9aa5;stroke-width:1.5;stroke-linejoin:round}.pr-oil .pr-oil{fill:#07090f;stroke:#05070f;stroke-width:3;opacity:.97}.pr-oil .pr-oil-rim{fill:none;stroke:#b9c6e6;stroke-opacity:.16;stroke-width:1.4;stroke-linejoin:round}.pr-oil .pr-oil-swirl{fill:none;stroke-width:3.8;stroke-linecap:round;opacity:.36}.pr-oil .pr-oil-film{fill:url(#pr-oil-g)}.pr-oil .pr-oil-sheen{fill:#dbe8ff;opacity:.26}.pr-press .pr-press-hz{fill:none;stroke:url(#pr-hz);stroke-width:6;opacity:.55}.pr-press .pr-shaft{fill:var(--pr-bg)}.pr-press .pr-press-shaftwall{fill:none;stroke:#2a3448;stroke-width:6;stroke-linecap:round;opacity:.8}.pr-press .pr-press-ram{fill:url(#pr-steel-g);stroke:#0b0d14;stroke-width:2}.pr-press .pr-press-boltlet{fill:#1b1f2a;stroke:#8d98b3;stroke-width:1.1}.pr-press .pr-press-bolt{fill:var(--pr-danger);stroke:#5a1420;stroke-width:1.5}.pr-press .pr-press-bolt-lit{fill:#ffb3ba;opacity:.8}.pr-burner .pr-flame{fill:#ff4a2e;opacity:.96}.pr-burner .pr-flame-mid{fill:#ff8a3c}.pr-burner .pr-flame-core{fill:var(--pr-warn)}.pr-burner .pr-flame-tip{fill:#fff3c4;opacity:.9}.pr-burner .pr-flame-glow{fill:#ff6a2a;opacity:.45}.pr-burner .pr-flame-glow path{fill:#ff6a2a}.pr-burner .pr-spark{fill:#ffc04d;opacity:.9}.pr-burner .pr-jet-mount{fill:url(#pr-steel-g);stroke:#0b0d14;stroke-width:1.4}.pr-burner .pr-jet-bolt{fill:#1b1f2a;stroke:#8d98b3;stroke-width:1}.pr-burner .pr-jet-barrel{fill:#232838;stroke:#0b0d14;stroke-width:1.4}.pr-burner .pr-jet-muzzle{fill:none;stroke:#aab6d2;stroke-opacity:.6;stroke-width:1.4}.pr-grill .pr-grate{fill:#12151f;stroke:#05070f;stroke-width:2}.pr-grill .pr-slat{fill:url(#pr-steel-g);stroke:#0b0d14;stroke-width:1}.pr-course{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 6px 5px}.pr-course[disabled]{opacity:.38}.pr-course .pr-course-name{font-size:11px;letter-spacing:.5px}.pr-thumb{position:relative;display:block;background:var(--pr-bg);border:1px solid var(--pr-border);overflow:hidden}.pr-thumb-grid{position:absolute;inset:0;display:grid}.pr-thumb-walls{position:absolute;inset:0;pointer-events:none}.pr-thumb-beams{position:absolute;inset:0;pointer-events:none}.pr-ed-item-icon{display:inline-block;width:20px;text-align:center;color:var(--pr-accent)}.pr-thumb .pr-cell{cursor:default}.pr-thumb-hits{position:absolute;inset:0;display:grid;grid-auto-rows:var(--tile)}.pr-no-hits{pointer-events:none}.pr-thumb-hit{padding:0;min-height:0!important;border:0!important;background:none;border-radius:0;cursor:crosshair;display:flex;align-items:center;justify-content:center;font:700 calc(var(--tile) * 0.62)/1 ui-monospace,Menlo,Consolas,monospace;color:transparent}.pr-thumb-hit:disabled{cursor:default}.pr-thumb-hit:not(:disabled):hover{background:color-mix(in srgb,var(--pr-accent) 35%,transparent)}.pr-thumb-hit:focus-visible{outline:2px solid var(--pr-accent);outline-offset:-2px}.pr-thumb-hit.mark{color:var(--pr-bg);background:var(--pr-accent);box-shadow:0 0 0 2px var(--pr-bg),0 0 0 3px var(--pr-accent),0 0 8px 2px rgba(0,0,0,.8);border-radius:50%;z-index:2}.pr-thumb-hit.mark:not(:disabled):hover{background:var(--pr-warn)}.pr-thumb-pick{cursor:crosshair}.pr-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:4px 0}.pr-lib-item{border:1px solid var(--pr-border);background:var(--pr-panel);padding:5px;display:flex;flex-direction:column;gap:3px}.pr-lib-thumb{display:flex;justify-content:center;align-items:center;min-height:52px;overflow:hidden;background:var(--pr-bg)}.pr-lib-name{font-size:11px;color:var(--pr-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr-lib-note{font-size:9px;color:var(--pr-dim)}.pr-lib-acts{display:flex;gap:3px;margin-top:auto}.pr-lib-acts button{padding:2px 6px;min-height:0!important;font-size:10px;flex:1 1 auto}.pr-lib-acts button:last-child{flex:0 0 auto;color:var(--pr-dim)}.pr-lib-acts button:last-child:hover:not(:disabled){color:var(--pr-danger);border-color:var(--pr-danger)}.pr-steps{display:flex;flex-wrap:wrap;gap:0;list-style:none;margin:0 0 10px;padding:0;counter-reset:pr-step;font-size:11px}.pr-steps li{display:flex;align-items:center}.pr-steps li+li::before{content:'\\\\2192';margin:0 6px;color:var(--pr-dim)}.pr-steps button,.pr-steps span{counter-increment:pr-step;padding:2px 6px;min-height:0!important;border:0!important;background:none;font:inherit}.pr-steps button::before,.pr-steps span::before{content:counter(pr-step) ' ';color:var(--pr-dim)}.pr-steps button{color:var(--pr-ink);text-decoration:underline;cursor:pointer}.pr-steps button:hover{color:var(--pr-accent)}.pr-steps .on{color:var(--pr-accent)}.pr-steps .on::before{color:var(--pr-accent)}.pr-steps .off{color:var(--pr-dim)}.pr-course-row{max-height:132px;overflow-y:auto}.pr-c-both{font-size:9px;letter-spacing:.5px;color:var(--pr-good);font-style:normal}.pr-c-no{font-size:9px;letter-spacing:.5px;color:var(--pr-dim);font-style:normal}.pr-c-note{display:block;font-size:9px;font-style:normal;color:var(--pr-dim)}.pr-rs-years{font-size:9px;color:var(--pr-dim);font-style:normal;margin-left:4px}.pr-rs-n{font-size:9px;color:var(--pr-good);font-style:normal;margin-left:4px}.pr-rs-no{font-size:9px;color:var(--pr-danger);font-style:normal;margin-left:4px}.pr-rule-group{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--pr-accent);font-weight:normal;margin:14px 0 2px;border-top:1px solid var(--pr-border);padding-top:10px}.pr-pushreg{position:absolute;left:2px;top:1px;font-size:9px;line-height:1;letter-spacing:.5px;color:var(--pr-hazard);background:var(--pr-bg);padding:1px 2px;pointer-events:none;z-index:2}";

/* The register stamp. In the game this is an HTML span over the tile; here it
 * is SVG text, because the editor emits one self-contained SVG. Same corner,
 * same hazard yellow on the same dark ground -- WHICH REGISTERS A THING FIRES
 * ON IS A RULE, not decoration, so it is stamped on the tile rather than left
 * to a legend. */
/* A flag LOCATION is not a flag. The game's flag is a filled banner on a pole,
 * because it is a thing standing on the square; a location is a question about
 * the square -- somewhere a flag MAY go -- so it is the same banner outlined. */
export const SPOT_CSS =
  ".pr-art .pr-spot{fill:none;stroke:var(--pr-warn);stroke-width:7;stroke-linejoin:round}" +
  ".pr-art .pr-spot-pole{fill:none;stroke:var(--pr-steel);stroke-width:8;stroke-linecap:round}";

export const STAMP_CSS =
  ".pr-art .pr-stamp{font:700 19px ui-monospace,Menlo,Consolas,monospace;" +
  "letter-spacing:1px;fill:var(--pr-hazard);stroke:none;dominant-baseline:hanging}" +
  ".pr-art .pr-stamp-bg{fill:var(--pr-bg);stroke:none}";
