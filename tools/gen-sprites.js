#!/usr/bin/env node
/*
 * Sprite generator for PumaRally.
 *
 *   node tools/gen-sprites.js          # redraw and write the block into pumarally.js
 *   node tools/gen-sprites.js --check  # fail if the shipped grids are stale
 *
 * The shipped art is still a character grid -- that is what check-rules and the
 * table self-check validate, and what you read when you want to know what a
 * tile looks like. But a 32x32 tile is 1024 hand-typed characters, and there
 * are fifteen of them, so the grids are DRAWN here with primitives and emitted
 * rather than typed. Same split Retro Surfer uses.
 *
 * Everything is parametric in TILE, so the resolution is one constant. Note
 * that raising it does not by itself buy detail: each sprite is drawn at real
 * proportions, so the art gets finer, not merely bigger.
 */
const fs = require("fs");
const path = require("path");

const TILE = 32;

/* ---- palette -------------------------------------------------------------
   Kept in step with TOKENS in pumarally.js by hand rather than imported,
   because this file rewrites that one and must not depend on it parsing. */
const T = {
  bg: "#05070f",
  accent: "#54f2ff",
  plate: "#1a2338",
  plateDark: "#151c2e",
  rivet: "#223052",
  rivetLit: "#2e4172",
  rust: "#c25a2b",
  warn: "#ffb000",
  danger: "#ff3333",
  steel: "#8b93b5"
};

/* ---- a character grid with just enough drawing to place a pixel ---------- */
class Grid {
  constructor(n, fill) {
    this.n = n;
    this.d = Array.from({ length: n }, () => Array(n).fill(fill === undefined ? "." : fill));
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    this.d[y][x] = c;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  frame(x, y, w, h, t, c) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c);
      }
  }
  ring(cx, cy, r, t, c) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d >= r - t) this.set(x, y, c);
      }
  }
  /* A solid arrowhead pointing north: apex at (cx, y), widening downward. */
  head(cx, y, h, c) {
    for (let i = 0; i < h; i++) for (let x = cx - i; x <= cx + i; x++) this.set(x, y + i, c);
  }
  rows() { return this.d.map(r => r.join("")); }
}

/* ---- conveyors -----------------------------------------------------------
   Authored pointing NORTH and rotated at draw time. The slats are what sell
   the direction at a glance once the tile is big enough to show them, and the
   chevron count is what separates a conveyor from an express: speed has to be
   readable without reading the colour. */
function beltBody(g, express) {
  const L = 3, R = TILE - 3;               // rails
  g.rect(L, 0, R - L, TILE, "u");          // belt surface
  g.rect(L, 0, 2, TILE, "v");              // left rail
  g.rect(R - 2, 0, 2, TILE, "v");          // right rail
  for (let y = 2; y < TILE; y += 6) g.rect(L + 2, y, R - L - 4, 2, "s");  // slats
}

function beltArrows(g, express) {
  const cx = TILE / 2 - 1;
  if (express) {
    g.head(cx, 4, 7, "a"); g.rect(cx - 1, 11, 3, 3, "a");
    g.head(cx, 17, 7, "a"); g.rect(cx - 1, 24, 3, 3, "a");
  } else {
    g.head(cx, 7, 9, "a");
    g.rect(cx - 1, 16, 3, 10, "a");
  }
}

function belt(express) {
  const g = new Grid(TILE);
  beltBody(g, express);
  beltArrows(g, express);
  return g;
}

/* Fed from the WEST, exits NORTH -- a left turn. The right-turn curve is this
   mirrored at bake time, so a corner is authored once. */
function beltCurve(express) {
  const g = new Grid(TILE);
  const L = 3, R = TILE - 3;
  g.rect(L, 0, R - L, R, "u");             // vertical arm
  g.rect(0, L, R, R - L, "u");             // horizontal arm
  g.rect(L, 0, 2, R - 2, "v");             // outer rail, left of the vertical arm
  g.rect(R - 2, 0, 2, R, "v");             // inner rail
  g.rect(0, L, R - 2, 2, "v");             // outer rail, top of the horizontal arm
  g.rect(0, R - 2, R, 2, "v");
  for (let y = 6; y < R - 3; y += 6) g.rect(L + 2, y, R - L - 4, 2, "s");
  const cx = TILE / 2 - 1;
  if (express) { g.head(cx, 5, 6, "a"); g.head(cx, 13, 6, "a"); }
  else g.head(cx, 7, 8, "a");
  return g;
}

/* ---- gears ---------------------------------------------------------------
   Eight teeth, a hub, and an offset notch. Colour alone carried the direction
   at 16 pixels; at 32 the notch does, and colour is the redundancy. */
function gear(cw) {
  const g = new Grid(TILE);
  const c = TILE / 2 - 0.5, R = 13;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.disc(c + Math.cos(a) * (R + 1.5), c + Math.sin(a) * (R + 1.5), 3.2, "g");
  }
  g.disc(c, c, R, "g");
  g.ring(c, c, R, 2, "h");
  g.disc(c, c, 6, "h");
  g.disc(c, c, 4, "a");
  // The notch: a tooth-shaped bite that tells you which way it turns.
  const na = cw ? -Math.PI / 2 : -Math.PI / 2;
  const nx = c + Math.cos(na) * 8.5, ny = c + Math.sin(na) * 8.5;
  g.disc(nx + (cw ? 3 : -3), ny, 2.4, "a");
  return g;
}

/* ---- pushers -------------------------------------------------------------
   Authored pushing NORTH: the housing sits on the south edge where its wall
   is, and the ram points the way it shoves. */
function pusher() {
  const g = new Grid(TILE);
  g.rect(4, 20, TILE - 8, 12, "n");
  g.rect(6, 22, TILE - 12, 8, "m");
  for (const x of [7, TILE - 10]) { g.rect(x, 23, 3, 3, "n"); g.rect(x, 27, 3, 3, "n"); }
  g.rect(TILE / 2 - 3, 12, 6, 9, "m");     // ram
  g.rect(TILE / 2 - 3, 12, 6, 2, "n");
  g.head(TILE / 2 - 1, 3, 8, "a");         // arrowhead
  g.rect(TILE / 2 - 2, 11, 4, 2, "a");
  return g;
}

/* ---- repair sites -------------------------------------------------------- */
function wrench(g, col, hi) {
  const cx = 13;
  g.rect(cx, 4, 3, 5, col); g.rect(cx + 5, 4, 3, 5, col);   // open jaw
  g.rect(cx, 9, 8, 4, col);
  g.rect(cx + 2, 10, 4, 2, hi);
  g.rect(cx + 2, 13, 4, 12, col);                            // shaft
  g.rect(cx + 1, 25, 6, 4, col);                             // butt
  g.rect(cx + 3, 14, 1, 10, hi);
}

function repair() {
  const g = new Grid(TILE);
  wrench(g, "s", "h");
  return g;
}

function upgrade() {
  const g = new Grid(TILE);
  wrench(g, "s", "h");
  // The extra that makes it an upgrade rather than a repair: a small gear.
  const c = 24.5;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.disc(c + Math.cos(a) * 5.5, c + Math.sin(a) * 5.5, 1.6, "a");
  }
  g.disc(c, c, 5, "a");
  g.disc(c, c, 2, "k");
  return g;
}

/* ---- flags and docking bays --------------------------------------------- */
function flag() {
  const g = new Grid(TILE);
  g.rect(9, 4, 3, 25, "s");                 // pole
  g.rect(6, 27, 9, 4, "s");                 // base
  g.rect(12, 5, 15, 11, "a");               // pennant
  for (let i = 0; i < 5; i++) g.rect(27 - i, 5 + i, 1, 11 - i * 2, "a");
  g.rect(13, 7, 11, 2, "h");
  return g;
}

function dock() {
  const g = new Grid(TILE);
  const t = 3, L = 9;
  for (const [x, y, dx, dy] of [[2, 2, 1, 1], [TILE - 3, 2, -1, 1], [2, TILE - 3, 1, -1], [TILE - 3, TILE - 3, -1, -1]]) {
    for (let i = 0; i < L; i++) { g.set(x + dx * i, y, "h"); g.set(x, y + dy * i, "h"); }
    for (let i = 0; i < L - 3; i++) { g.set(x + dx * i, y + dy, "h"); g.set(x + dx, y + dy * i, "h"); }
  }
  void t;
  return g;
}

/* ---- the robot -----------------------------------------------------------
   One sprite, eight palette maps. The nose is the facing tell: a rotated body
   alone is ambiguous, and which way a robot points is the single most
   important fact on the board. */
function robot() {
  const g = new Grid(TILE);
  // treads
  for (const x of [2, TILE - 8]) {
    g.rect(x, 11, 6, 19, "d");
    for (let y = 13; y < 28; y += 4) g.rect(x + 1, y, 4, 1, "t");
  }
  // chassis
  g.rect(7, 9, TILE - 14, 19, "d");
  g.rect(9, 11, TILE - 18, 15, "a");
  // visor
  g.rect(10, 13, TILE - 20, 6, "k");
  g.rect(11, 14, TILE - 22, 3, "e");
  // panel line and shoulder highlight
  g.rect(11, 21, TILE - 22, 2, "d");
  g.rect(9, 11, TILE - 18, 1, "h");
  // nose: a wedge that reads as "this end forward"
  g.head(TILE / 2 - 1, 2, 6, "d");
  g.rect(TILE / 2 - 3, 7, 6, 3, "a");
  g.rect(TILE / 2 - 1, 4, 2, 3, "e");
  return g;
}

/* ---- floor and pit ------------------------------------------------------- */
function floor() {
  const g = new Grid(TILE, "p");
  g.frame(0, 0, TILE, TILE, 2, "q");
  for (const [x, y] of [[4, 4], [TILE - 6, 4], [4, TILE - 6], [TILE - 6, TILE - 6]]) {
    g.rect(x, y, 2, 2, "d");
    g.set(x, y, "h");
  }
  g.rect(2, TILE / 2 - 1, TILE - 4, 1, "q");   // a faint panel seam
  return g;
}

function pit() {
  const g = new Grid(TILE, "q");
  g.disc(TILE / 2 - 0.5, TILE / 2 - 0.5, 14, "m");
  g.disc(TILE / 2 - 0.5, TILE / 2 - 0.5, 12.5, "k");
  g.ring(TILE / 2 - 0.5, TILE / 2 - 0.5, 13.5, 1, "d");
  return g;
}

/* ---- the sprite table ---------------------------------------------------- */
const BELT_PAL = { v: "#241a11", u: "#3d2c1c", s: "#70512f", a: T.rust };
const EXPRESS_PAL = { v: "#0e2233", u: "#163449", s: "#2b6e93", a: T.accent };

const SPRITES = [
  { name: "floor", grid: floor(), palette: { q: T.plateDark, p: T.plate, d: T.rivet, h: T.rivetLit },
    note: null },
  { name: "pit", grid: pit(), palette: { q: T.plateDark, m: "#0d1322", k: T.bg, d: "#1d2740" },
    note: null },
  { name: "belt", grid: belt(false), palette: BELT_PAL, transparent: ".",
    note: ["Conveyors are authored pointing NORTH and rotated to suit. One",
           "chevron for a conveyor, two for an express -- the speed has to be",
           "readable without reading the colour, because the two belts are the",
           "commonest thing to misjudge. The slats sell the direction."] },
  { name: "express", grid: belt(true), palette: EXPRESS_PAL, transparent: "." },
  { name: "beltCurve", grid: beltCurve(false), palette: BELT_PAL, transparent: ".",
    note: ["A curve authored as fed-from-the-west, exits-north -- a LEFT turn.",
           "The right-turn curve is this mirrored at bake time, so the corner",
           "art is authored once."] },
  { name: "expressCurve", grid: beltCurve(true), palette: EXPRESS_PAL, transparent: "." },
  { name: "gearCW", grid: gear(true), palette: { g: "#4a5578", h: "#6b7aa8", a: T.warn }, transparent: ".",
    note: ["Eight teeth, a hub and an offset notch. Colour alone carried the",
           "turn direction at 16 pixels; at 32 the notch does the work and the",
           "colour is redundancy rather than the only cue."] },
  { name: "gearCCW", grid: gear(false), palette: { g: "#4a5578", h: "#6b7aa8", a: T.accent }, transparent: "." },
  { name: "pusherOdd", grid: pusher(), palette: { n: "#a86a28", m: "#7a4a1a", a: T.warn }, transparent: ".",
    note: ["Pushers are authored pushing NORTH: the housing sits on the south",
           "edge, where its wall is, and the ram points the way it shoves. The",
           "renderer stamps the register numbers on top."] },
  { name: "pusherEven", grid: pusher(), palette: { n: "#2c6a7f", m: "#194a5c", a: T.accent }, transparent: "." },
  { name: "repair", grid: repair(), palette: { s: T.steel, h: "#c9d2f0" }, transparent: "." },
  { name: "upgrade", grid: upgrade(), palette: { s: T.warn, h: "#ffd98a", a: T.warn, k: "#4a3000" }, transparent: "." },
  { name: "flag", grid: flag(), palette: { s: T.steel, a: T.warn, h: "#ffd98a" }, transparent: "." },
  { name: "dock", grid: dock(), palette: { h: T.accent }, transparent: "." },
  { name: "robot", grid: robot(), palette: { a: "#ffb000", d: "#8a5c00", e: T.accent, h: "#e8ecff", t: "#7d86a8", k: "#2a1c00" },
    transparent: ".",
    note: ["One robot, authored facing north, with eight palette maps. That is",
           "the difference between 40 lines of art and 320."] }
];

/* ---- emit ---------------------------------------------------------------- */
function emit() {
  const out = ["  var SPRITES = {"];
  SPRITES.forEach((s, i) => {
    if (s.note) {
      out.push("    /* " + s.note[0]);
      for (let n = 1; n < s.note.length; n++) out.push("       " + s.note[n]);
      out[out.length - 1] += " */";
    }
    out.push("    " + s.name + ": {");
    const pal = Object.keys(s.palette).map(k => k + ': "' + s.palette[k] + '"').join(", ");
    out.push("      palette: { " + pal + " },");
    if (s.transparent) out.push('      transparent: "' + s.transparent + '",');
    out.push("      rows: [");
    const rows = s.grid.rows();
    rows.forEach((r, j) => out.push('        "' + r + '"' + (j === rows.length - 1 ? "" : ",")));
    out.push("      ]");
    out.push("    }" + (i === SPRITES.length - 1 ? "" : ","));
  });
  out.push("  };");
  return out.join("\n") + "\n";
}

const target = path.join(__dirname, "..", "pumarally.js");
const src = fs.readFileSync(target, "utf8");
const BEGIN = "  /* @gen-sprites-begin */\n";
const END = "  /* @gen-sprites-end */";
const i = src.indexOf(BEGIN), j = src.indexOf(END);
if (i < 0 || j < 0) {
  console.error("  error:   sprite sentinels not found in pumarally.js");
  process.exit(1);
}
const next = src.slice(0, i + BEGIN.length) + emit() + src.slice(j);

if (process.argv.includes("--check")) {
  if (next !== src) {
    console.error("  error:   sprite grids are stale -- run node tools/gen-sprites.js");
    process.exit(1);
  }
  console.log(`sprite grids match the generator (${SPRITES.length} sprites at ${TILE}x${TILE})`);
} else {
  fs.writeFileSync(target, next);
  console.log(`wrote ${SPRITES.length} sprites at ${TILE}x${TILE} into pumarally.js`);
}
