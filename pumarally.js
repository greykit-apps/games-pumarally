/* ============================================================
   PUMARALLY
   A faithful port of the RoboRally rules in original vector art.

   One script that injects its own CSS and mounts into any
   [data-pumarally] element, so index.html stays a shell. Board
   data and its validator live in pumarally-boards.js, which this
   file consumes and never duplicates.

   No build step, no dependencies, no network at play time.
   ============================================================ */
(function (root) {
  "use strict";

  /* The rules engine, its rule tests and the headless sim touch no
     DOM, so Node can load this file and run them in CI. Only mount()
     reaches for document, and it does not run until something asks
     for a screen. The tile art is markup rather than drawing calls,
     which is why even that is buildable without a canvas. */
  var B = root.PumaRallyBoards ||
    (typeof require === "function" ? require("./pumarally-boards.js") : null);
  if (!B) throw new Error("PumaRally: pumarally-boards.js must load first");

  var N = B.N, E = B.E, S = B.S, W = B.W;
  var DC = B.DC, DR = B.DR;   /* unit step per direction, for tile art geometry */

  /* ============================================================
     TOKENS — terminal, not pixels

     The style language is the one PumaTriage uses: monospace, a near
     black ground, hairline borders, uppercase letterspaced labels,
     and colour carrying meaning rather than decoration. The hues are
     PumaRally's own -- cyan and rust rather than PumaTriage's green
     and amber -- because a shared palette would make these the same
     game wearing two names, and a shared grammar is what actually
     makes them siblings.

     A RoboRally board asks a dozen functional tile types to be told
     apart at a glance, which is more than an accent and a dim accent
     can do. So each element owns a hue and keeps it everywhere it
     appears -- board, legend, help table -- and the floor stays out
     of the way so the robots read first.
     ============================================================ */
  var TOKENS = {
    bg: "#05070f",
    panel: "#0a0e1a",
    panelAlt: "#0d1424",
    floor: "#0e1524",
    border: "#1b2540",
    borderLit: "#2c3b60",     /* an empty slot: visible without competing */
    line: "#141d33",          /* the grid hairline, a shade under the border */
    accent: "#54f2ff",        /* express conveyors, headings, focus */
    accentDim: "#2b7f92",
    text: "#dbe4fb",
    ink: "#8b96b8",
    dim: "#5b6884",
    rust: "#d2713f",          /* conveyors */
    warn: "#ffb000",          /* pushers, flags */
    danger: "#ff5266",        /* lasers, pits */
    good: "#4ade6a",          /* repair */
    violet: "#b47dff",        /* upgrade */
    steel: "#94a0c4",         /* gears, walls */
    concrete: "#9aa1ae",      /* the poured edge of a wall, not its face */
    /* Hazard stripes: the yellow-and-black the printed board uses for
       anything that will hurt you -- wall faces, pit frames, rams. */
    hazard: "#f2c400",
    hazardDark: "#14161c",
    /* Belt beds are near-black so the painted arrow reads; the rails
       are the element's own hue, which is what tells a conveyor from
       an express conveyor at a glance without reading the arrow. */
    beltBed: "#2a1a0e",
    expressBed: "#0b2028",
    plate: "#273249"
  };

  /* The eight robot liveries. Colour is the only thing that tells
     robots apart, exactly as on the table, so these are chosen for
     separation at a glance rather than for prettiness. Each carries a
     bright tone for the outline and a dark one for the body, which is
     what lets one drawing serve all eight. */
  var LIVERIES = [
    { id: "amber",  name: "Hazard",   a: "#ffb000", d: "#8a5c00" },
    { id: "cyan",   name: "Coolant",  a: "#54f2ff", d: "#1d6a7a" },
    { id: "red",    name: "Rivet",    a: "#ff4d4d", d: "#8a1f1f" },
    { id: "green",  name: "Verdigris",a: "#4ade6a", d: "#1c6b31" },
    { id: "violet", name: "Solenoid", a: "#b47dff", d: "#54308f" },
    { id: "orange", name: "Ratchet",  a: "#ff8a3d", d: "#8a3f10" },
    { id: "pink",   name: "Gasket",   a: "#ff6fc4", d: "#8a2f63" },
    { id: "white",  name: "Chalkline",a: "#dfe6ff", d: "#6b7290" }
  ];

  /* ============================================================
     PROGRAM DECK
     The 84 cards, generated from the printed ranges rather than
     listed, so a typo is impossible and the counts are checkable
     arithmetic. Priorities are unique across the whole deck, which
     is what makes the register order total rather than a tie-break
     rule -- validateTables() asserts exactly that.
     ============================================================ */
  var CARD_KINDS = {
    uturn: { label: "U-Turn",   turn: 2,  glyph: "u" },
    left:  { label: "Rotate L", turn: -1, glyph: "l" },
    right: { label: "Rotate R", turn: 1,  glyph: "r" },
    back:  { label: "Back Up",  move: -1, glyph: "b" },
    move1: { label: "Move 1",   move: 1,  glyph: "1" },
    move2: { label: "Move 2",   move: 2,  glyph: "2" },
    move3: { label: "Move 3",   move: 3,  glyph: "3" }
  };

  var DECK_RANGES = [
    ["uturn",  10,  60, 10],
    ["left",   70, 410, 20],
    ["right",  80, 420, 20],
    ["back",  430, 480, 10],
    ["move1", 490, 660, 10],
    ["move2", 670, 780, 10],
    ["move3", 790, 840, 10]
  ];

  var PROGRAM_DECK = (function () {
    var out = [];
    for (var i = 0; i < DECK_RANGES.length; i++) {
      var kind = DECK_RANGES[i][0], lo = DECK_RANGES[i][1], hi = DECK_RANGES[i][2], stepBy = DECK_RANGES[i][3];
      for (var p = lo; p <= hi; p += stepBy) out.push({ kind: kind, pri: p });
    }
    return out;
  })();

  var DECK_COUNTS = { uturn: 6, left: 18, right: 18, back: 6, move1: 18, move2: 12, move3: 6 };

  /* Registers lock from the right as damage mounts: 5 damage locks
     register 5, 6 locks 4, and so on. Every published lock table is
     this one line of arithmetic, so it is derived and then checked
     rather than typed out and trusted. */
  function openRegisters(damage) { return Math.max(0, Math.min(5, 9 - damage)); }
  function cardsDealt(damage) { return Math.max(0, 9 - damage); }

  var MAX_DAMAGE = 10, START_LIVES = 3, REGISTERS = 5;

  /* The nominal tile edge in CSS pixels. It is a starting point, not
     a grid: the art is vector, so the board scales to whatever the
     column gives it and this only sets what 1x means -- the editor's
     zoom and the `data-scale` mount option are both multiples of it. */
  var TILE = 32;

  /* ============================================================
     TILE ART — vector, with body

     Every functional element is one <svg> of shapes in a 100x100 box,
     sized by CSS and coloured from the palette. Vector rather than
     the character-grid sprites this started with, which buys three
     things pixels could not.

     It is resolution-free, so the board takes whatever fraction of
     the column it is given instead of the largest whole multiple --
     the integer-scale rule existed only because pixel art smears at
     1.5x, and nothing here has a pixel grid to smear.

     Shapes compose without erasing. The old sprites were opaque
     tiles, so a merge drew the straight belt over the curve's centre
     and the curve came out looking like a stub; that was a real bug,
     found by reading canvas pixels.

     And the palette drives the art rather than being baked into it:
     a livery is a colour on an element, not eight pre-rendered
     canvases.

     The art is deliberately SOLID rather than line work. A conveyor
     is a belt bed with rails down both sides and an arrow painted on
     it, not an arrow floating on the floor; a wall is a raised
     hazard-striped bar with a shadow under it, not a line on an
     edge. Outlines read as a diagram. The printed board reads as a
     place with things bolted to it, and a player picking a route is
     reading depth as much as symbol -- a wall you can see standing
     up is a wall you do not try to drive through.
     ============================================================ */

  /* Edge midpoints and the tile centre, in viewBox units. Indexed by
     direction, so N/E/S/W is the array order the engine already uses. */
  var EDGE = [[50, 0], [100, 50], [50, 100], [0, 50]];

  function svg(inner, cls) {
    return '<svg class="pr-art' + (cls ? " " + cls : "") + '" viewBox="0 0 100 100" ' +
           'aria-hidden="true">' + inner + "</svg>";
  }

  function polar(a, rad) {
    return (50 + Math.cos(a) * rad).toFixed(1) + " " + (50 + Math.sin(a) * rad).toFixed(1);
  }

  /* ------------------------------------------------------------
     CONVEYORS

     A run is a straight line across the tile or a quarter turn about
     the corner its two edges share, and the bed, both rails and the
     painted arrow are all generated from that one piece of geometry.

     The rails are REAL OFFSET PATHS, not a fatter stroke of the same
     centreline with the bed laid over it. That trick is cheaper and
     it works perfectly on a straight, but it dies on a turn: a belt
     two thirds of a tile wide bending ninety degrees inside that tile
     has an inner radius of about a sixth of a tile, so the bed's
     inner edge swallows the inner rail completely. Every curve came
     out with one rail where a straight had two, which is exactly what
     made them look cramped -- not the tightness of the bend, the
     missing edge.

     Concentric arcs have no such problem. The inner rail of a tight
     turn is a tight little arc, which is what it should be, and both
     rails meet the neighbouring tile's at the same offsets -- so belt
     runs join across squares instead of merely abutting.
     ------------------------------------------------------------ */
  var BELT_HALF = 31;              // rail centre, either side of the run
  var TURN_R = 50;                 // a quarter turn through the edge midpoints

  /* Where a run enters and leaves, and -- for a turn -- the corner it
     pivots about and which way round it goes. */
  function runGeom(inDir, exit) {
    var entry = B.opposite(inDir);
    var a = EDGE[entry], b = EDGE[exit];
    if (inDir === exit) return { straight: true, a: a, b: b, dir: exit, inDir: inDir, exit: exit };
    var vert = (entry === E || entry === W) ? entry : exit;
    var horiz = (entry === N || entry === S) ? entry : exit;
    var cx = (vert === W) ? 0 : 100, cy = (horiz === N) ? 0 : 100;
    var t1 = Math.atan2(a[1] - cy, a[0] - cx);
    var t2 = Math.atan2(b[1] - cy, b[0] - cx);
    var d = t2 - t1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return { straight: false, a: a, b: b, inDir: inDir, exit: exit,
             cx: cx, cy: cy, t1: t1, t2: t2, sweep: d > 0 ? 1 : 0, turn: d > 0 ? 1 : -1 };
  }

  function arcOf(g, rad, f1, f2) {
    var x1 = g.cx + Math.cos(f1) * rad, y1 = g.cy + Math.sin(f1) * rad;
    var x2 = g.cx + Math.cos(f2) * rad, y2 = g.cy + Math.sin(f2) * rad;
    return "M" + x1.toFixed(1) + " " + y1.toFixed(1) +
           "A" + rad.toFixed(1) + " " + rad.toFixed(1) + " 0 0 " + g.sweep + " " +
           x2.toFixed(1) + " " + y2.toFixed(1);
  }

  function lineOf(g, off) {
    var px = -DR[g.dir] * off, py = DC[g.dir] * off;
    return "M" + (g.a[0] + px) + " " + (g.a[1] + py) + "L" + (g.b[0] + px) + " " + (g.b[1] + py);
  }

  function bedPath(g) { return g.straight ? lineOf(g, 0) : arcOf(g, TURN_R, g.t1, g.t2); }

  function railPaths(g) {
    if (g.straight) return [lineOf(g, BELT_HALF), lineOf(g, -BELT_HALF)];
    return [arcOf(g, TURN_R + BELT_HALF, g.t1, g.t2), arcOf(g, TURN_R - BELT_HALF, g.t1, g.t2)];
  }

  /* The painted arrow follows the RUN, not the exit axis.

     That distinction is the whole point: a conveyor curve rotates the
     robot on it and a straight one does not, so if both tiles carry a
     straight arrow the board is hiding a rule. It did, until someone
     looked at the Proving Ground -- authored to contain one of
     everything, five curves and a merge among them -- and could not
     find a single turn on it.

     Trimmed at both ends so the arrow sits ON the belt rather than
     running off it, and so several feeds converging on one head have
     somewhere to converge. */
  var HEAD_BACK = 24;              // how far short of the exit edge the head sits
  var TAIL_IN = 12;                // how far past the entry edge the shaft starts

  /* The bed and rails are arcs, because concentric arcs keep their
     spacing round a bend. The ARROW is a quadratic, because what
     matters about the arrow is its two tangents: it has to leave the
     entry edge along the way you arrived and reach the head pointing
     exactly the way you leave. An arc trimmed back far enough to make
     room for the head arrives thirty degrees off the exit direction,
     and the chevron -- which points along the exit -- meets it at a
     visible kink. That kink is most of what made a turn look cramped.
     The two curves differ by about two units at their furthest, which
     is less than the width of the line drawing them.

     The control point is where the entry and exit lines cross. For a
     quarter turn between perpendicular edges that is one coordinate
     from each end, which is why this is arithmetic and not algebra. */
  function markPath(g, headed) {
    /* A headless run is painted edge to edge, so consecutive tiles
       join into one continuous line you can follow across the board
       instead of a row of separate stamps. That continuity is what
       replaces the arrowhead: the line has to go somewhere, and where
       it goes is visible on the next square. */
    if (!headed) return g.straight ? lineOf(g, 0) : arcOf(g, TURN_R, g.t1, g.t2);
    if (g.straight) {
      var d = g.dir;
      var ax = g.a[0] + DC[d] * TAIL_IN, ay = g.a[1] + DR[d] * TAIL_IN;
      return "M" + ax + " " + ay + "L" + (g.b[0] - DC[d] * HEAD_BACK) + " " + (g.b[1] - DR[d] * HEAD_BACK);
    }
    var s = [g.a[0] + DC[g.inDir] * TAIL_IN, g.a[1] + DR[g.inDir] * TAIL_IN];
    var h = headPoint(g.exit);
    var horizIn = (g.inDir === E || g.inDir === W);
    var cx = horizIn ? h[0] : s[0], cy = horizIn ? s[1] : h[1];
    return "M" + s[0].toFixed(1) + " " + s[1].toFixed(1) +
           "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + h[0].toFixed(1) + " " + h[1].toFixed(1);
  }

  /* Every feed converges on one head, so its position is a property
     of the exit and nothing else. */
  function headPoint(exit) {
    return [EDGE[exit][0] - DC[exit] * HEAD_BACK, EDGE[exit][1] - DR[exit] * HEAD_BACK];
  }

  /* The arrowhead, as a stroked chevron rather than a filled triangle
     so it keeps the weight of the shaft it terminates. */
  function chev(x, y, hx, hy, size, cls) {
    var bx = x - hx * size, by = y - hy * size;
    var px = -hy * size * 0.78, py = hx * size * 0.78;
    return '<path class="' + (cls || "pr-mark") + '" d="M' + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
           "L" + x.toFixed(1) + " " + y.toFixed(1) +
           "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1) + '"/>';
  }

  /* Which way a conveyor's art bends. Mechanically the engine derives
     rotation from the direction a robot travelled, so the in-arrows
     exist only for art -- they are exactly "which adjacent belts of
     my speed point at me", computed here rather than stored, which is
     one fewer thing to transcribe and one fewer thing to get wrong. */
  function beltArt(C, c, r) {
    var code = B.codeAt(C, c, r);
    var speed = B.beltSpeed(code);
    if (!speed) return null;
    var exit = B.dirOf(code), ins = [];
    for (var d = 0; d < 4; d++) {
      if (d === exit) continue;
      var nb = B.step(c, r, d);
      if (B.isVoid(C, nb.c, nb.r)) continue;
      var ncode = B.codeAt(C, nb.c, nb.r);
      if (B.beltSpeed(ncode) !== speed) continue;
      if (B.dirOf(ncode) === B.opposite(d)) ins.push(B.opposite(d));  // travel direction into this tile
    }
    return { speed: speed, exit: exit, ins: ins };
  }

  /* A run carries a head only when it is a plain straight, so where
     two headless tiles meet -- curve into curve, or anything into a
     merge -- there is no head anywhere near the join and the
     direction across it goes unsaid. Those joins get a chevron, on
     the BOUNDARY rather than inside either bend: that is the one
     place a turning belt is momentarily straight, because a run
     crosses every edge at right angles to it, so a chevron there lies
     along the line instead of cutting across a curve.

     This started life as a special case for a run made ENTIRELY of
     turns -- a 2x2 loop is four turns and nothing else, so it has no
     head anywhere and its direction is unreadable. Stating the rule
     as "wherever two headless tiles meet" covers that loop (every
     join in it qualifies) and needs no graph walk to find it: the
     question is about a tile and its downstream neighbour, and
     nothing further. A local rule that subsumes a global one is worth
     taking. */
  function headedRun(art) {
    return !art.ins.length || (art.ins.length === 1 && art.ins[0] === art.exit);
  }

  function marksBoundary(C, c, r, art) {
    if (headedRun(art)) return false;
    var nb = B.step(c, r, art.exit);
    if (!B.inGrid(C, nb.c, nb.r) || B.isVoid(C, nb.c, nb.r)) return false;
    var na = beltArt(C, nb.c, nb.r);
    return !!na && na.speed === art.speed && !headedRun(na);
  }

  function beltSvg(art, boundary) {
    var runs = art.ins.length ? art.ins : [art.exit];
    /* Only a plain straight run carries an arrowhead. On a turn or a
       merge the painted line curves or converges, which already says
       rotation and junction, and the direction is carried by the run
       it came from -- so the head would be decoration competing with
       the one thing the tile has to say. */
    var headed = headedRun(art);
    var beds = "", rails = "", marks = "", i, j;
    /* Every bed first, then every rail: at a junction the rails have
       to be able to cross a neighbouring bed, which is what a
       junction looks like. */
    for (i = 0; i < runs.length; i++) {
      var g = runGeom(runs[i], art.exit);
      beds += '<path class="pr-bed" d="' + bedPath(g) + '"/>';
      var rp = railPaths(g);
      for (j = 0; j < rp.length; j++) rails += '<path class="pr-rail" d="' + rp[j] + '"/>';
      marks += '<path class="pr-mark" d="' + markPath(g, headed) + '"/>';
    }
    var dc = DC[art.exit], dr = DR[art.exit];
    if (headed) {
      var h = headPoint(art.exit);
      marks += chev(h[0], h[1], dc, dr, 14);
      if (art.speed === 2) marks += chev(h[0] - dc * 19, h[1] - dr * 19, dc, dr, 14);
    } else if (boundary) {
      /* One chevron, not the express pair: this is a direction marker
         on a join that would otherwise carry none, and speed is
         already said by the rails' colour. */
      var e = EDGE[art.exit];
      marks += chev(e[0] - dc * 5, e[1] - dr * 5, dc, dr, 12);
    }
    return svg(beds + rails + marks, art.speed === 2 ? "pr-express" : "pr-belt");
  }

  /* ------------------------------------------------------------
     THE REST OF THE FURNITURE
     ------------------------------------------------------------ */

  /* A cog: eight teeth as one filled path, a hub, and the direction
     arrow on top. WHICH WAY it turns is a rule the player reads off
     the board, so the arrow is the loudest thing on the tile.

     An earlier pass drew a short arc inside a ring of tick marks and
     the two directions were indistinguishable at tile size, which is
     a rules bug wearing an art bug's clothes. The arc now sweeps 250
     degrees, far enough that the eye follows it round. */
  function gearSvg(dir) {
    var cw = dir > 0, i, pts = [], TEETH = 8;
    for (i = 0; i < TEETH * 2; i++) {
      var a0 = (i - 0.34) * Math.PI / TEETH, a1 = (i + 0.34) * Math.PI / TEETH;
      var rad = (i % 2) ? 30 : 42;
      pts.push(polar(a0, rad), polar(a1, rad));
    }
    var RAD = 20, SWEEP = 250 * Math.PI / 180;
    var s0 = (cw ? 60 : 120) * Math.PI / 180;
    var s1 = cw ? s0 + SWEEP : s0 - SWEEP;
    var hx = cw ? -Math.sin(s1) : Math.sin(s1);
    var hy = cw ? Math.cos(s1) : -Math.cos(s1);
    return svg(
      '<path class="pr-cog" d="M' + pts.join("L") + 'Z"/>' +
      '<circle class="pr-hub" cx="50" cy="50" r="26"/>' +
      '<path class="pr-turn" d="M' + polar(s0, RAD) + "A" + RAD + " " + RAD + " 0 1 " +
        (cw ? 1 : 0) + " " + polar(s1, RAD) + '"/>' +
      turnHead(50 + Math.cos(s1) * RAD, 50 + Math.sin(s1) * RAD, hx, hy, 13),
      cw ? "pr-gear pr-cw" : "pr-gear pr-ccw");
  }

  function turnHead(x, y, hx, hy, size) {
    var bx = x - hx * size, by = y - hy * size;
    var px = -hy * size * 0.72, py = hx * size * 0.72;
    return '<path class="pr-turn" d="M' + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
           "L" + x.toFixed(1) + " " + y.toFixed(1) +
           "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1) + '"/>';
  }

  /* A pusher is a hazard-striped ram bolted to the wall behind it.
     Which registers it fires on is a rule, not decoration, so the
     digits are stamped on the tile rather than left to the legend --
     upright and in a fixed corner whichever way the ram points. */
  function pusherSvg(dir, odd) {
    var mount = B.opposite(dir), m = EDGE[mount];
    var px = -DR[mount] * 36, py = DC[mount] * 36;
    var qx = DC[dir] * 18, qy = DR[dir] * 18;
    var reach = 32;
    /* Ram first, plate over it: the plate stays one unbroken bar and
       the ram reads as coming OUT of it. Drawn the other way round the
       ram cuts the plate into two squares floating either side of it. */
    return svg(
      '<path class="pr-ram" d="M' + m[0] + " " + m[1] + "L" +
        (m[0] + DC[dir] * reach) + " " + (m[1] + DR[dir] * reach) + '"/>' +
      pushHead(m[0] + DC[dir] * (reach + 24), m[1] + DR[dir] * (reach + 24), DC[dir], DR[dir], 24) +
      '<path class="pr-ram-base" d="M' + (m[0] + px) + " " + (m[1] + py) +
        "L" + (m[0] - px) + " " + (m[1] - py) +
        "L" + (m[0] - px + qx) + " " + (m[1] - py + qy) +
        "L" + (m[0] + px + qx) + " " + (m[1] + py + qy) + 'Z"/>',
      "pr-pusher" + (odd ? " pr-odd" : " pr-even"));
  }

  function pushHead(x, y, hx, hy, size) {
    var bx = x - hx * size, by = y - hy * size;
    var px = -hy * size * 0.85, py = hx * size * 0.85;
    return '<path class="pr-ram-head" d="M' + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
           "L" + x.toFixed(1) + " " + y.toFixed(1) +
           "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1) + 'Z"/>';
  }

  /* Repair is a plate with a cross cut into it; upgrade is the same
     plate with a second bar, because an upgrade site repairs as well.
     Keeping the shared shape shared is what makes that readable. */
  function repairSvg(upgrade) {
    return svg(
      '<rect class="pr-plate" x="12" y="12" width="76" height="76" rx="4"/>' +
      '<path class="pr-tool" d="M50 24L50 76M24 50L76 50"/>' +
      (upgrade ? '<rect class="pr-tool-ring" x="22" y="22" width="56" height="56" rx="3"/>' : ""),
      upgrade ? "pr-upgrade" : "pr-repair");
  }

  /* A hole, drawn as a shaft rather than a symbol: the mouth, the
     four sides falling away from it, and the dark at the bottom.

     It used to carry a hazard-striped frame, copying the printed
     board. That was wrong HERE, because in this art language stripes
     are what a wall's face is made of -- so a pit read as a square
     with walls on all four sides, which is very nearly the opposite
     of what it is. A borrowed convention that contradicts your own is
     worse than no convention. */
  function pitSvg() {
    return svg('<rect class="pr-shaft" x="12" y="12" width="76" height="76" rx="2"/>' +
               '<path class="pr-shaft-2" d="M12 12L88 12L66 34L34 34Z"/>' +
               '<rect class="pr-void-floor" x="34" y="34" width="32" height="42" rx="1"/>', "pr-pit");
  }

  /* A press is a ram seen from underneath: a heavy plate ringed by the
     shaft it comes down in. A burner is the nozzle and its flame. Both
     are stamped with the registers they act in, the way a pusher is,
     because the timing is the whole of what makes them dangerous. */
  /* A spill: an irregular dark pool with a slick highlight, so it reads
     as a hazard without borrowing the pit's black hole or the danger
     red that already means damage. Oil does no damage at all. */
  /* A portal is a ring of teeth around a throat, and the COLOUR is the
     whole of what matters -- a robot needs to see at a glance which
     other square on the board this one is paired with, so the hue is
     driven off the colour digit rather than the palette. */
  var PORTAL_HUES = ["#a06cff", "#3fd67a", "#4aa8ff", "#ff7ad1", "#ffd166",
                     "#ff8a5c", "#7ce0d3", "#c0c6e0", "#ff5f6d"];
  function portalHue(n) { return PORTAL_HUES[(parseInt(n, 10) - 1) % PORTAL_HUES.length]; }

  function portalSvg(n) {
    var hue = portalHue(n);
    return svg('<circle cx="50" cy="50" r="36" fill="none" stroke="' + hue + '" stroke-width="5"/>' +
               '<circle cx="50" cy="50" r="25" fill="none" stroke="' + hue + '" stroke-width="3" opacity=".65"/>' +
               '<circle cx="50" cy="50" r="13" fill="' + hue + '" opacity=".9"/>' +
               '<circle cx="50" cy="50" r="6" fill="var(--pr-bg)"/>', "pr-portal");
  }

  function oilSvg() {
    return svg('<path class="pr-oil" d="M22 46C22 32 34 22 50 22C68 22 80 30 80 44C80 58 72 74 52 76C32 78 22 62 22 46Z"/>' +
               '<path class="pr-oil-sheen" d="M36 40C38 34 45 30 53 31C46 34 42 38 40 44C38 50 35 46 36 40Z"/>',
               "pr-oil");
  }

  function pressSvg() {
    return svg('<circle class="pr-shaft" cx="50" cy="50" r="37"/>' +
               '<circle class="pr-press-ram" cx="50" cy="50" r="26"/>' +
               '<circle class="pr-press-bolt" cx="50" cy="50" r="9"/>', "pr-press");
  }

  function burnerSvg() {
    return svg('<rect class="pr-plate" x="30" y="62" width="40" height="24" rx="3"/>' +
               '<path class="pr-flame" d="M50 14C62 32 70 42 70 54C70 66 61 74 50 74C39 74 30 66 30 54C30 42 38 32 50 14Z"/>' +
               '<path class="pr-flame-core" d="M50 34C57 45 60 50 60 56C60 63 55 68 50 68C45 68 40 63 40 56C40 50 43 45 50 34Z"/>',
               "pr-burner");
  }

  function dockSvg(n) {
    return svg('<rect class="pr-plate" x="16" y="16" width="68" height="68" rx="4"/>' +
               '<text x="50" y="52" class="pr-num">' + esc(n) + "</text>", "pr-dock");
  }

  /* WHICH flag this is matters more than that it is a flag.

     You are looking for number three, and there are up to eight of
     them on a course; a player scanning the board is reading digits,
     not bunting. So the banner is big enough to hold one at size and
     the numeral is the loudest thing on the square: near-black on
     amber, which is the strongest contrast this palette has.

     The first version drew a small pennant with the number BELOW it,
     dark on the dark floor -- invisible at any tile size, and worse
     the smaller the board got. */
  function flagSvg(n) {
    return svg('<rect class="pr-pole" x="17" y="10" width="8" height="82" rx="3"/>' +
               '<path class="pr-banner" d="M25 14H92L79 40L92 66H25Z"/>' +
               '<text x="56" y="41" class="pr-num">' + esc(String(n)) + "</text>", "pr-flag");
  }

  /* The emitter housing, on the wall the laser is mounted to. The
     beam itself is a separate layer: it crosses tiles, so it cannot
     be a property of one. */
  function emitterSvg(d) {
    var mount = B.opposite(d), m = EDGE[mount];
    var px = -DR[mount] * 20, py = DC[mount] * 20;
    var qx = DC[d] * 18, qy = DR[d] * 18;
    return svg('<path class="pr-mount" d="M' + (m[0] + px) + " " + (m[1] + py) +
               "L" + (m[0] - px) + " " + (m[1] - py) +
               "L" + (m[0] - px * 0.5 + qx) + " " + (m[1] - py * 0.5 + qy) +
               "L" + (m[0] + px * 0.5 + qx) + " " + (m[1] + py * 0.5 + qy) + 'Z"/>', "pr-emitter");
  }

  /* A one-square course holding a single element. The legend draws
     its swatches through it, and the table self-check walks every
     element through it looking for art that does not exist. */
  function probeTile(code) {
    return { w: 1, h: 1, cell: [code], wallN: {}, wallW: {}, lasers: [], flags: [], docks: [] };
  }

  function sampleCode(key, def) {
    return key + (def.arg === "dir" ? "^" : def.arg === "digit" ? "1" : ".");
  }

  /* ------------------------------------------------------------
     ONE TILE

     Returns the inner HTML of a .pr-cell. Everything the tile knows
     about itself is a class on the cell, so the CSS -- not this
     function -- decides what a wall or a pit looks like.
     ------------------------------------------------------------ */
  function tileClasses(C, c, r) {
    var cls = ["pr-cell"];
    if (B.isVoid(C, c, r)) return cls.concat("pr-void");
    var code = B.codeAt(C, c, r), def = B.elemOf(code);
    if (def && def.name !== "floor") cls.push("pr-has");
    if (B.beltSpeed(code)) cls.push(B.beltSpeed(code) === 2 ? "pr-t-express" : "pr-t-belt");
    else if (def.gear) cls.push("pr-t-gear");
    else if (def.push) cls.push("pr-t-pusher");
    else if (def.option) cls.push("pr-t-upgrade");
    else if (def.repair) cls.push("pr-t-repair");
    else if (code.charAt(0) === "o") cls.push("pr-t-pit");
    else if (code.charAt(0) === "s") cls.push("pr-t-dock");
    return cls;
  }

  function tileInner(C, c, r) {
    if (B.isVoid(C, c, r)) return "";
    var code = B.codeAt(C, c, r), def = B.elemOf(code), out = [];
    var art = beltArt(C, c, r);
    if (art) out.push(beltSvg(art, marksBoundary(C, c, r, art)));
    else if (def.gear) out.push(gearSvg(def.gear));
    else if (def.push) out.push(pusherSvg(B.dirOf(code), def.push === "odd"));
    else if (def.option) out.push(repairSvg(true));
    else if (def.repair) out.push(repairSvg(false));
    else if (def.oil) out.push(oilSvg());
    else if (def.portal) out.push(portalSvg(code.charAt(1)));
    else if (def.crush) out.push(pressSvg());
    else if (def.burn) out.push(burnerSvg());
    else if (code.charAt(0) === "o") out.push(pitSvg());
    else if (code.charAt(0) === "s") out.push(dockSvg(code.charAt(1)));

    if (def.push) out.push('<span class="pr-pushreg">' + (def.push === "odd" ? "135" : "24") + "</span>");
    if (def.crush || def.burn) {
      var when = code.charAt(1);
      out.push('<span class="pr-pushreg">' +
        (when === "." ? "*" : when === "o" ? "135" : when === "e" ? "24" : esc(when)) + "</span>");
    }

    for (var fi = 0; fi < C.flags.length; fi++) {
      if (C.flags[fi].c === c && C.flags[fi].r === r) out.push(flagSvg(C.flags[fi].n));
    }
    for (var li = 0; li < C.lasers.length; li++) {
      if (C.lasers[li].c === c && C.lasers[li].r === r) out.push(emitterSvg(C.lasers[li].d));
    }
    return out.join("");
  }

  /* aria-hidden because the name in the next cell already says what it
     is, and a pusher's stamped digits would otherwise be read twice. */
  function legendSwatch(art) {
    return '<span class="pr-leg-art" aria-hidden="true">' + art + "</span>";
  }

  /* WALLS SIT ON THE LATTICE, NOT IN A SQUARE.

     A wall is not a property of a square, it is the edge between two
     of them, and it exists equally from both sides -- so it is drawn
     once, straddling the line, half in each. Its own layer is what
     makes that possible: a bar inside a cell is clipped by that cell
     and can only ever be a wall that square has, which is not what a
     wall is.

     Drawing them per-cell was also quietly wrong twice over. wallAt
     is symmetric, so every interior wall was drawn TWICE, once inside
     each neighbour -- while a perimeter wall, having one neighbour,
     was drawn once. Interior walls came out at double the weight of
     perimeter ones, which is precisely backwards as a signal: the
     board's edge is the hardest boundary on it.

     Walls are stored on the N/W lattice, so emitting N and W for
     every square covers every interior edge exactly once. The far
     edges have no square past them to own their N or W, so the last
     row's S and the last column's E are emitted explicitly -- and so
     is any edge against the void, which on a multi-board course is an
     interior edge with nothing on the other side. */
  function wallSpans(C) {
    var out = [], c, r;
    function bar(c, r, vertical) {
      return '<i class="pr-wall' + (vertical ? " pr-v" : "") + '" style="--c:' + c + ";--r:" + r + '"></i>';
    }
    function edgeOfCourse(c, r) { return !B.inGrid(C, c, r) || B.isVoid(C, c, r); }
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        if (B.isVoid(C, c, r)) continue;
        if (B.wallAt(C, c, r, N)) out.push(bar(c, r, false));
        if (B.wallAt(C, c, r, W)) out.push(bar(c, r, true));
        if (edgeOfCourse(c, r + 1) && B.wallAt(C, c, r, S)) out.push(bar(c, r + 1, false));
        if (edgeOfCourse(c + 1, r) && B.wallAt(C, c, r, E)) out.push(bar(c + 1, r, true));
      }
    }
    return out.join("");
  }

  /* Laser beams cross tiles, so they are their own absolutely
     positioned layer rather than tile art. Drawn under the walls:
     a beam that appears to pass through its own mount reads as a
     bug even when the rules are right. */
  function beamSpans(C) {
    var out = [], li, pi, n;
    for (li = 0; li < C.lasers.length; li++) {
      var L = C.lasers[li], path = B.laserPath(C, L);
      var horiz = (L.d === E || L.d === W);
      for (pi = 0; pi < path.length; pi++) {
        for (n = 0; n < L.n; n++) {
          /* --off is a FRACTION of a tile, not a percentage: the CSS
             multiplies it by --tile, and a percentage there would
             resolve against the element rather than the square. */
          var off = (0.5 + (n - (L.n - 1) / 2) * 0.16).toFixed(3);
          out.push('<i class="pr-beam' + (horiz ? " pr-h" : "") + '"' +
            ' data-c="' + path[pi].c + '" data-r="' + path[pi].r + '" style="' +
            "--c:" + path[pi].c + ";--r:" + path[pi].r + ";--off:" + off + '"></i>');
        }
      }
    }
    return out.join("");
  }

  /* ============================================================
     TABLE SELF-CHECK — runs at load and THROWS.
     These are printed facts, so a violation means a table was
     mistyped, not that the game is unbalanced. Each assertion here
     has been watched to go red; see tools/validator-selftest.js
     for the board-data half of the same discipline.
     ============================================================ */
  function validateTables() {
    if (PROGRAM_DECK.length !== 84) throw new Error("program deck is " + PROGRAM_DECK.length + " cards, not 84");

    var seen = {}, k;
    for (var i = 0; i < PROGRAM_DECK.length; i++) {
      var p = PROGRAM_DECK[i].pri;
      if (seen[p]) throw new Error("two program cards share priority " + p + "; ties are impossible in the real deck");
      seen[p] = true;
      if (!CARD_KINDS[PROGRAM_DECK[i].kind]) throw new Error("card has unknown kind " + PROGRAM_DECK[i].kind);
    }

    var byKind = {};
    for (var n = 0; n < PROGRAM_DECK.length; n++) byKind[PROGRAM_DECK[n].kind] = (byKind[PROGRAM_DECK[n].kind] || 0) + 1;
    for (k in DECK_COUNTS) {
      if (byKind[k] !== DECK_COUNTS[k]) throw new Error("deck has " + (byKind[k] || 0) + " " + k + " cards, not " + DECK_COUNTS[k]);
    }

    for (var d = 0; d <= MAX_DAMAGE; d++) {
      if (openRegisters(d) !== Math.max(0, Math.min(5, 9 - d))) throw new Error("openRegisters(" + d + ") disagrees with the damage arithmetic");
      if (d <= 9 && cardsDealt(d) < openRegisters(d)) throw new Error("at " + d + " damage a robot is dealt fewer cards than it has open registers");
    }

    /* The roster is deliberately short of the printed deck, so the
       check is against the number we claim to have transcribed, not
       against 26. Both numbers live in OPTION_ROSTER; closing the gap
       is editing one of them. */
    var optionIds = Object.keys(OPTION_DEFS);
    if (optionIds.length !== OPTION_ROSTER.transcribed) {
      throw new Error("option roster declares " + OPTION_ROSTER.transcribed +
        " cards but the table has " + optionIds.length);
    }
    if (OPTION_ROSTER.transcribed > OPTION_ROSTER.printed) {
      throw new Error("more option cards transcribed than the deck prints");
    }

    /* Both directions of the hook binding. A card naming a hook that
       does not exist never fires; a hook no card uses is dead code
       that reads as coverage. */
    var used = {};
    for (var oi = 0; oi < optionIds.length; oi++) {
      var odef = OPTION_DEFS[optionIds[oi]];
      if (!odef.name || !odef.text) throw new Error("option " + optionIds[oi] + " has no name or text");
      for (var hk in odef.hooks) {
        if (HOOKS.indexOf(hk) < 0) throw new Error('option "' + optionIds[oi] + '" binds unknown hook "' + hk + '"');
        used[hk] = true;
      }
    }
    for (var hi = 0; hi < HOOKS.length; hi++) {
      if (!used[HOOKS[hi]]) throw new Error('hook "' + HOOKS[hi] + '" is declared but no option card uses it');
    }

    /* Every step the help describes has to be a step the machine
       actually runs. Rename a step and this is the only thing that
       will notice the help now lies. */
    for (var ts = 0; ts < TURN_STEPS.length; ts++) {
      var row = TURN_STEPS[ts];
      if (!STEP[row.phase] || !STEP[row.phase][row.step]) {
        throw new Error('the help describes step "' + row.phase + "." + row.step + '", which the phase machine does not have');
      }
    }

    for (var pk in DIFFICULTY_PRESETS) {
      for (var rk in DIFFICULTY_PRESETS[pk]) {
        if (!SLIDER_DEFS[rk]) throw new Error('preset "' + pk + '" sets unknown rule "' + rk + '"');
        var pv = DIFFICULTY_PRESETS[pk][rk];
        if (pv < SLIDER_DEFS[rk].min || pv > SLIDER_DEFS[rk].max) {
          throw new Error('preset "' + pk + '" sets ' + rk + " to " + pv + ", outside its range");
        }
      }
    }

    if (LIVERIES.length !== 8) throw new Error("there are " + LIVERIES.length + " liveries, but the game seats 8");
    var lid = {};
    for (var j = 0; j < LIVERIES.length; j++) {
      if (lid[LIVERIES[j].a]) throw new Error("two robots share the colour " + LIVERIES[j].a);
      lid[LIVERIES[j].a] = true;
    }

    /* Tile art: every element the boards can contain has to have a
       drawing. The old character-grid sprites got a geometry check
       here; vector art cannot be the wrong size, but it CAN be
       missing, which is the same data-shaped failure -- a board
       transcribes an element nobody drew and it renders as bare
       floor. That is silent and plausible, so it throws. */
    for (k in B.ELEMENT_DEFS) {
      var ed = B.ELEMENT_DEFS[k];
      if (ed.name === "floor") continue;
      if (!tileInner(probeTile(sampleCode(k, ed)), 0, 0)) {
        throw new Error("element \"" + ed.name + "\" (" + k + ") has no tile art, so it would render as bare floor");
      }
    }
  }

  /* ============================================================
     RNG & UTILS
     All rule randomness goes through rnd(), and its whole state is
     one integer inside G, so a seed replays a game exactly and a
     save resumes one. Nothing else in the file may call Math.random.
     ============================================================ */
  function rnd() {
    G.rngState = (G.rngState + 0x6D2B79F5) | 0;
    var t = G.rngState;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rndInt(n) { return Math.floor(rnd() * n); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = rndInt(i + 1), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Bot decisions must not consume rnd(), or a seeded replay drifts
     the moment a bot evaluates a different number of candidates.
     Their variety comes from hashing the position instead, which is
     deterministic without touching the shared stream. assertInvariants
     checks that the stream really did not move. */
  function hash32(x) {
    x |= 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return (x ^ (x >>> 16)) >>> 0;
  }

  /* ============================================================
     GAME STATE
     G is pure JSON and is saved verbatim: no Map, no Set, no class
     instance, no function. UI holds everything transient, including
     the built course -- storing that derived grid in G is how saves
     go stale the first time a board is corrected.
     ============================================================ */
  var WAIT = "wait", ANIM = "anim", NEXT = "next";
  var MAX_TURNS = 200;

  var G = null;
  var UI = {
    course: null,
    headless: false,
    autoHuman: false,
    mounted: false,
    rngBefore: undefined,
    rngAfter: undefined,
    /* Presentation only. None of this belongs in G: a save carries the
       game, not the animation that was mid-flight when it was written. */
    els: null,
    pieceEls: null,
    /* Per-robot render memory, so a change can be ANIMATED rather than
       just drawn: which way it was facing, how far it has wound, and
       how hurt it was last time we looked. */
    pieceFace: null, pieceDeg: null, pieceHurt: null,
    prevRects: null,
    queue: [],
    playing: false,
    timer: null,
    beams: null,
    drag: null,          /* what is in the hand mid-drag, if anything */
    speed: 1,
    opts: null,
    lastPhase: null,
    muted: false,
    curtainCleared: null,
    helpTab: "turn",
    prevFocus: null
  };

  function go(phase, step) { G.phase = phase; G.step = step; }
  function players() { return G.players; }
  function live() { return G.players.filter(function (p) { return p.alive; }); }
  function isHuman(p) { return !p.isBot && !UI.autoHuman; }

  function card(i) { return PROGRAM_DECK[i]; }
  function cardAt(p, reg) { var i = p.registers[reg]; return i === null || i === undefined ? null : card(i); }

  function log(msg) {
    G.log.push({ turn: G.turn, reg: G.register, msg: msg });
    if (G.log.length > 400) G.log.shift();
  }

  function newGame(seed, opts) {
    opts = opts || {};
    var courseId = opts.course || "provingRun";
    var C = B.buildCourse(courseId);
    UI.course = C;

    var seats = Math.max(2, Math.min(8, opts.players || 4));
    G = {
      v: SAVE_VERSION,
      seed: seed,
      rngState: seed | 0,
      courseId: courseId,
      /* House rules ride in the SAVE, not in localStorage, so a game
         replays under the rules it was started with even if the setup
         screen has been changed since. */
      flagTouch: opts.flagTouch ? 1 : 0,
      turn: 1,
      register: 0,
      phase: "turn",
      step: "respawn",
      players: [],
      deck: [],
      discard: [],
      optionDeck: [],
      optionDiscard: [],
      optionAnswers: {},
      gameOver: false,
      winner: null,
      unfinished: false,
      log: [],
      exec: { queue: [], resume: null, resumePhase: null },
      pendingChoices: []
    };

    for (var i = 0; i < seats; i++) {
      var dock = C.docks[i];
      G.players.push({
        id: i,
        name: LIVERIES[i].name,
        livery: i,
        isBot: opts.humans ? i >= opts.humans : i > 0,
        skill: opts.skill === undefined ? 1 : opts.skill,
        c: dock.c, r: dock.r,
        /* Robots start facing the course. The docking bay is stamped
           below the boards, so that is north; when bays move, this
           becomes a per-course field rather than a constant. */
        face: N,
        damage: 0,
        lives: START_LIVES,
        flags: 0,
        archive: { c: dock.c, r: dock.r, face: N },
        hand: [],
        dealtCount: 0,
        options: [],
        registers: [null, null, null, null, null],
        poweredDown: false,
        announceDown: false,
        alive: true,
        out: false
      });
    }

    for (var d = 0; d < PROGRAM_DECK.length; d++) G.deck.push(d);
    shuffle(G.deck);
    for (var o = 0; o < OPTION_IDS.length; o++) G.optionDeck.push(OPTION_IDS[o]);
    shuffle(G.optionDeck);
    /* A house rule for exercising the option hooks: without it a sim
       has to play until somebody reaches an upgrade site before a
       single card is ever fired. */
    var start = opts.startOptions || 0;
    for (var q = 0; q < start; q++) for (var pi = 0; pi < G.players.length; pi++) drawOption(G.players[pi]);
    return G;
  }

  /* ============================================================
     DECK
     84 cards conserved across deck, discard, hands and registers.
     assertInvariants checks that total on every settled step, which
     is what catches a card leaking out of a destroyed robot.
     ============================================================ */
  function draw(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      if (!G.deck.length) {
        if (!G.discard.length) break;          // everything is in hands; deal short
        G.deck = shuffle(G.discard);
        G.discard = [];
      }
      out.push(G.deck.pop());
    }
    return out;
  }

  function discardCards(list) {
    for (var i = 0; i < list.length; i++) if (list[i] !== null && list[i] !== undefined) G.discard.push(list[i]);
  }

  /* ============================================================
     OPTION CARDS — the hooks

     Twenty-six special cases would be twenty-six `if`s buried in the
     rules engine. Instead every card is a data row that binds to one
     of the moments below, and nothing outside this table may
     intercept the rules: a card that needs a new moment gets a new
     hook here, not a branch somewhere in playCard.

     Three rules keep it honest.

     Hooks mutate a ctx request object, never G. The engine applies
     the ctx, so determinism and replay survive.

     Hooks never prompt. A "you may" card calls ctx.pick(), which
     parks a descriptor on G.pendingChoices and reports the step as
     pending; one generic phase step drains that queue -- WAIT for a
     human, botPick for a bot -- and the step then RE-RUNS and finds
     the answer waiting. That is why twenty-six "you may" cards cost
     one UI flow instead of twenty-six, and why a save written
     mid-choice reloads: the queue is plain JSON with no closures in
     it.

     Hooks never touch the DOM, because the headless sim runs them.

     validateTables asserts both directions of the binding: no card
     may name a hook that is not declared, and no hook may be
     declared that no card uses. A hook nothing fires is dead code
     that looks like coverage.
     ============================================================ */
  var HOOKS = [
    "modifyDealt",        // how many program cards you are dealt
    "onDealt",            // after the deal, before programming
    "modifyMove",         // a card's movement, before it happens
    "onPush",             // you shoved somebody
    "onBoardElement",     // a belt, curve, gear or pusher is about to act on you
    "laserShots",         // what your robot fires this register
    "onLaserHit",         // a shot of yours connected
    "onDamage",           // damage is about to land on you
    "onTouchCheckpoint",  // how far you can reach for a flag or wrench
    "onRespawn"           // you are coming back from the scrap heap
  ];

  /* ------------------------------------------------------------
     THE ROSTER

     The printed base deck is 26 cards. Sixteen are transcribed here
     -- the ones whose effect is unambiguous. The rest are NOT
     guessed at: an option card that does nearly the right thing is
     worse than one that is missing, because a player cannot tell.
     They land the same way boards do, from the physical cards,
     against a hook system that is already finished.

     OPTION_ROSTER.printed vs .transcribed is what the validator
     checks, so the gap is a number in the source rather than a
     thing someone has to remember.
     ------------------------------------------------------------ */
  var OPTION_ROSTER = { printed: 26, transcribed: 16 };

  var OPTION_DEFS = {
    ablativeCoat: {
      name: "Ablative Coat",
      text: "Absorbs the next 3 damage, then burns off.",
      init: function () { return { charges: 3 }; },
      hooks: {
        onDamage: function (ctx, st) {
          if (st.charges <= 0 || ctx.amount <= 0) return;
          var take = Math.min(st.charges, ctx.amount);
          st.charges -= take;
          ctx.amount -= take;
          ctx.absorbed += take;
          if (st.charges <= 0) ctx.discard();
        }
      }
    },

    brakes: {
      name: "Brakes",
      text: "You may treat a Move 1 as a Move 0.",
      hooks: {
        modifyMove: function (ctx) {
          if (ctx.kind !== "move" || ctx.dist !== 1) return;
          var pick = ctx.pick("brakes", "hold still instead of moving 1?", ["Move 1", "Brake"]);
          if (pick === 1) ctx.dist = 0;
        }
      },
      botPrefers: 0
    },

    crabLegs: {
      name: "Crab Legs",
      text: "You may take a Move 1 sideways, without turning.",
      hooks: {
        modifyMove: function (ctx) {
          if (ctx.kind !== "move" || ctx.dist !== 1) return;
          var pick = ctx.pick("crabLegs", "sidestep instead of moving forward?",
            ["Forward", "Sidestep left", "Sidestep right"]);
          if (pick === 1) ctx.lateral = -1;
          else if (pick === 2) ctx.lateral = 1;
        }
      },
      botPrefers: 0
    },

    doubleBarreledLaser: {
      name: "Double-Barreled Laser",
      text: "Your robot's laser does 2 damage.",
      hooks: {
        laserShots: function (ctx) {
          for (var i = 0; i < ctx.shots.length; i++) if (ctx.shots[i].own) ctx.shots[i].damage += 1;
        }
      }
    },

    extraMemory: {
      name: "Extra Memory",
      text: "You are dealt one extra program card each turn.",
      hooks: { modifyDealt: function (ctx) { ctx.count += 1; } }
    },

    gyroscopicStabilizer: {
      name: "Gyroscopic Stabilizer",
      text: "Gears do not rotate your robot.",
      hooks: {
        onBoardElement: function (ctx) { if (ctx.kind === "gear") ctx.veto = true; }
      }
    },

    highPowerLaser: {
      name: "High-Power Laser",
      text: "Your laser shoots through one wall.",
      hooks: {
        laserShots: function (ctx) {
          for (var i = 0; i < ctx.shots.length; i++) if (ctx.shots[i].own) ctx.shots[i].pierce = 1;
        }
      }
    },

    mechanicalArm: {
      name: "Mechanical Arm",
      text: "You may touch a flag or repair site one square away.",
      hooks: { onTouchCheckpoint: function (ctx) { ctx.reach = Math.max(ctx.reach, 1); } }
    },

    powerDownShield: {
      name: "Power Down Shield",
      text: "While powered down, lasers do not damage you.",
      hooks: {
        onDamage: function (ctx) {
          if (ctx.source !== "laser" || !ctx.player.poweredDown) return;
          ctx.absorbed += ctx.amount;
          ctx.amount = 0;
        }
      }
    },

    pressorBeam: {
      name: "Pressor Beam",
      text: "Instead of damaging a target, you may push it one square away.",
      hooks: {
        onLaserHit: function (ctx) {
          if (ctx.damage <= 0) return;
          var pick = ctx.pick("pressorBeam", "shove " + ctx.target.name + " instead of damaging it?",
            ["Damage", "Shove away"]);
          if (pick !== 1) return;
          ctx.damage = 0;
          ctx.replaceWith = { kind: "push", dir: ctx.shotDir, n: 1 };
        }
      },
      botPrefers: 0
    },

    rammingGear: {
      name: "Ramming Gear",
      text: "A robot you push takes 1 damage.",
      hooks: { onPush: function (ctx) { ctx.pushDamage += 1; } }
    },

    rearFiringLaser: {
      name: "Rear-Firing Laser",
      text: "Your robot also fires a laser backwards.",
      hooks: {
        laserShots: function (ctx) {
          ctx.shots.push({ own: true, dir: B.opposite(ctx.player.face), damage: 1, pierce: 0 });
        }
      }
    },

    recompile: {
      name: "Recompile",
      text: "You may discard your hand and be dealt a new one.",
      hooks: {
        onDealt: function (ctx) {
          var pick = ctx.pick("recompile", "throw this hand away and draw a fresh one?",
            ["Keep", "Recompile"]);
          if (pick === 1) ctx.redraw = true;
        }
      },
      botPrefers: 0
    },

    scrambler: {
      name: "Scrambler",
      text: "Instead of damaging a target, you may replace its next register card with the top of the deck.",
      hooks: {
        onLaserHit: function (ctx) {
          if (ctx.damage <= 0) return;
          var pick = ctx.pick("scrambler", "scramble " + ctx.target.name + "'s next register instead?",
            ["Damage", "Scramble"]);
          if (pick !== 1) return;
          ctx.damage = 0;
          ctx.replaceWith = { kind: "scramble" };
        }
      },
      botPrefers: 0
    },

    superiorArchive: {
      name: "Superior Archive",
      text: "You return from the scrap heap with 1 damage instead of 2.",
      hooks: { onRespawn: function (ctx) { ctx.damage = 1; } }
    },

    tractorBeam: {
      name: "Tractor Beam",
      text: "Instead of damaging a target, you may pull it one square toward you.",
      hooks: {
        onLaserHit: function (ctx) {
          if (ctx.damage <= 0) return;
          var pick = ctx.pick("tractorBeam", "pull " + ctx.target.name + " toward you instead?",
            ["Damage", "Pull closer"]);
          if (pick !== 1) return;
          ctx.damage = 0;
          ctx.replaceWith = { kind: "push", dir: B.opposite(ctx.shotDir), n: 1 };
        }
      },
      botPrefers: 0
    }
  };

  var OPTION_IDS = Object.keys(OPTION_DEFS);

  /* ------------------------------------------------------------
     THE DISPATCHER
     ------------------------------------------------------------ */

  /* A choice has to be identified by something that survives the
     step re-running, a save, and a reload -- so it is derived from
     the position in the game, never from a counter or an object
     identity. */
  function choiceKey(player, hook, optionId, tag) {
    return G.turn + ":" + G.register + ":" + hook + ":" + optionId + ":" + player.id + ":" + (tag || "");
  }

  function fire(player, hook, ctx) {
    ctx = ctx || {};
    ctx.player = player;
    ctx.pending = false;
    var current = null;

    ctx.pick = function (optionId, prompt, labels, tag) {
      var key = choiceKey(player, hook, optionId, tag);
      var have = G.optionAnswers[key];
      if (have === undefined) {
        for (var i = 0; i < G.pendingChoices.length; i++) if (G.pendingChoices[i].key === key) { ctx.pending = true; return null; }
        G.pendingChoices.push({ key: key, owner: player.id, optionId: optionId, prompt: prompt, labels: labels });
        ctx.pending = true;
        return null;
      }
      if (have === "used") return 0;          // already applied; do not fire twice on a re-run
      G.optionAnswers[key] = "used";
      return have;
    };

    ctx.discard = function () { if (current) discardOption(player, current.id); };

    /* Iterate a snapshot: a hook may discard its own card mid-loop
       (Ablative Coat burning off is the ordinary case), and mutating
       the array being walked is how one of the others gets skipped. */
    var held = player.options.slice();
    for (var i = 0; i < held.length; i++) {
      var h = held[i];
      if (player.options.indexOf(h) < 0) continue;      // already gone
      var def = OPTION_DEFS[h.id];
      if (!def || !def.hooks[hook]) continue;
      if (!h.st) h.st = def.init ? def.init() : {};
      current = h;
      def.hooks[hook](ctx, h.st, h);
    }
    current = null;
    return ctx;
  }

  function discardOption(p, id) {
    for (var i = 0; i < p.options.length; i++) {
      if (p.options[i].id !== id) continue;
      G.optionDiscard.push(p.options.splice(i, 1)[0].id);
      log(p.name + " burns out " + OPTION_DEFS[id].name);
      return;
    }
  }

  function drawOption(p) {
    if (!G.optionDeck.length) {
      G.optionDeck = shuffle(G.optionDiscard);
      G.optionDiscard = [];
    }
    if (!G.optionDeck.length) return null;
    var id = G.optionDeck.pop();
    var def = OPTION_DEFS[id];
    p.options.push({ id: id, st: def.init ? def.init() : {} });
    log(p.name + " picks up " + def.name);
    return id;
  }

  /* Bots answer immediately and without consulting rnd(), same
     contract as botProgram: a seeded replay must not drift because a
     bot was offered a different number of choices. */
  /* Keyed on the descriptor's TAG, never on a function stored in it:
     G is pure JSON and pendingChoices goes into the save, so a closure
     parked here would not survive a reload -- the same reason the
     option-card queue stores ids and not callbacks. */
  function botBoardPick(p, choice) {
    if (choice.tag === "upgrade") return p.damage >= 2 ? 0 : 1;   // 0 repair 2, 1 take a card
    return 0;
  }

  function botPick(p, choice) {
    /* A board question has no card to carry a preference, so the
       preference lives with whatever asked. An upgrade site is the
       only one so far: take the repair while it is worth taking, and
       the card otherwise. */
    if (!choice.optionId) return botBoardPick(p, choice);
    var def = OPTION_DEFS[choice.optionId];
    var prefer = def && def.botPrefers !== undefined ? def.botPrefers : 1;
    if (prefer >= choice.labels.length) prefer = choice.labels.length - 1;
    return prefer;
  }

  /* ============================================================
     RULES ENGINE
     Pure functions over G and the course. Nothing here touches the
     DOM, so the same code drives the human, the bots and the
     headless sims -- there is exactly one definition of legal.
     ============================================================ */
  function robotAt(c, r) {
    for (var i = 0; i < G.players.length; i++) {
      var p = G.players[i];
      if (p.alive && p.c === c && p.r === r) return p;
    }
    return null;
  }

  function isHole(C, c, r) { return B.isVoid(C, c, r) || B.isPit(B.codeAt(C, c, r)); }

  /* One square. A robot moving into another pushes it, and that one
     pushes the next. A wall anywhere in the chain stops EVERYTHING,
     including the robot that started the push -- which is the part
     that is easy to get wrong and changes outcomes when it is. */
  /* Every square a robot passes THROUGH this register, not just the one
     it stops on. Only the "crossing counts" house rule reads it, but it
     is recorded either way: making the recording conditional on a rule
     would mean the rule could not be changed mid-game, and a saved game
     would carry a trail that silently depended on a setting. */
  function tread(p) {
    if (!p.trail) p.trail = [];
    var last = p.trail[p.trail.length - 1];
    if (last && last[0] === p.c && last[1] === p.r) return;
    p.trail.push([p.c, p.r]);
  }

  function stepRobot(p, dir, cause) {
    var C = UI.course, chain = [p], c = p.c, r = p.r, i;
    for (var guard = 0; guard < 10; guard++) {
      if (B.wallAt(C, c, r, dir)) return false;
      var nx = B.step(c, r, dir);
      if (B.isVoid(C, nx.c, nx.r)) break;            // the head walks off the edge
      var occ = robotAt(nx.c, nx.r);
      if (!occ) break;
      chain.push(occ); c = nx.c; r = nx.r;
    }
    // Far end first, so nobody is ever asked to land on an occupied square.
    var hurt = [];
    for (i = chain.length - 1; i >= 0; i--) {
      var m = chain[i];
      var to = B.step(m.c, m.r, dir);
      m.c = to.c; m.r = to.r;
      tread(m);
      throughPortal(m);
      if (i > 0) {
        log(chain[i - 1].name + " shoves " + m.name + " " + B.dirName(dir));
        var pctx = fire(chain[i - 1], "onPush", { pushed: m, dir: dir, pushDamage: 0 });
        if (pctx.pushDamage > 0) hurt.push({ who: m, n: pctx.pushDamage });
      }
      if (isHole(C, m.c, m.r)) destroy(m, B.isVoid(C, m.c, m.r) ? "over the edge" : "into a pit");
    }
    /* Push damage lands after the whole chain has moved: applying it
       mid-loop can destroy a robot the robots behind it are still
       being pushed into. */
    for (i = 0; i < hurt.length; i++) {
      if (!hurt[i].who.alive) continue;
      log(hurt[i].who.name + " takes " + hurt[i].n + " from ramming gear");
      damage(hurt[i].who, hurt[i].n, "ram");
    }
    return true;
  }

  /* A card becomes a plan before it becomes movement, so modifyMove
     has something to rewrite. Firing the hook from inside the walk
     would mean unwinding a half-finished move when a card asks the
     player a question. */
  function planFor(cd) {
    var k = CARD_KINDS[cd.kind];
    if (k.turn !== undefined) return { kind: "turn", turn: k.turn, dist: 0, lateral: 0 };
    return { kind: "move", turn: 0, dist: k.move, lateral: 0 };
  }

  /* CRASH AND BURN: portals.

     A robot entering a portal comes out of the other one of the same
     colour and carries on from there -- the pair counts as one square,
     so this is not a move and nothing on the way is triggered twice.

     What keeps it finite is the rule that a robot STANDING on a portal
     switches both off. The robot that just arrived is standing on the
     far one, so the pair is dead behind it and it cannot bounce back.
     The same sentence covers the occupied case for free: if anyone is
     already on either end, the colour is off and the entering robot
     simply stands on what is now an ordinary square. */
  function portalExit(p) {
    var C = UI.course;
    if (B.isVoid(C, p.c, p.r)) return null;
    var code = B.codeAt(C, p.c, p.r), el = B.elemOf(code);
    if (!el || !el.portal) return null;
    var colour = code.charAt(1), other = null;
    for (var r = 0; r < C.h && !other; r++) {
      for (var c = 0; c < C.w; c++) {
        if (c === p.c && r === p.r) continue;
        if (B.isVoid(C, c, r)) continue;
        var cd = B.codeAt(C, c, r);
        if (cd.charAt(0) === "t" && cd.charAt(1) === colour) { other = { c: c, r: r }; break; }
      }
    }
    if (!other) return null;
    if (occupiedBySomeoneElse(p, p.c, p.r) || occupiedBySomeoneElse(p, other.c, other.r)) return null;
    return other;
  }

  function occupiedBySomeoneElse(p, c, r) {
    var q = robotAt(c, r);
    return !!(q && q !== p);
  }

  /* Called wherever a robot's position changes, so a robot reaches a
     portal the same way whether it drove, was shoved, was carried by a
     belt or skidded there on oil. */
  function throughPortal(p) {
    var to = portalExit(p);
    if (!to) return;
    p.c = to.c; p.r = to.r;
    tread(p);
    log(p.name + " drops through a portal");
  }

  function onOil(p) {
    var C = UI.course;
    return !B.isVoid(C, p.c, p.r) && B.isOil(B.codeAt(C, p.c, p.r));
  }

  /* CRASH AND BURN: oil.

     Two separate effects, and they are easy to conflate. Starting a
     move on oil costs you a square, because the wheels spin -- a Move 3
     carries two and a Move 1 carries none at all. ENDING a move on oil
     makes you slide on, because you cannot stop.

     The slide is not a move, which is the part the rulebook is at pains
     about: "Ein Roboter rutscht nicht, solange er in Bewegung ist. Erst
     wenn er seine Bewegung beendet (bremst), gerät er auf einer Öllache
     ins Rutschen." So it happens once, after the card is finished, and
     a robot slides only if it actually travelled -- momentum it never
     had cannot carry it. A robot whose Move 1 was cancelled by the oil
     stays exactly where it is.

     It stops on the first square without oil, before a wall, or against
     a robot that is NOT itself on oil. A robot that IS on the same
     slick gets shoved along instead, which stepRobot's chain already
     does. */
  function oilSlide(p, dir) {
    var C = UI.course;
    for (var guard = 0; guard < 32; guard++) {
      if (!p.alive || !onOil(p)) return;
      if (B.wallAt(C, p.c, p.r, dir)) return;
      var nx = B.step(p.c, p.r, dir);
      var occ = B.isVoid(C, nx.c, nx.r) ? null : robotAt(nx.c, nx.r);
      if (occ && !onOil(occ)) return;                 // a robot with grip stops the slide
      if (!stepRobot(p, dir, "oil")) return;
    }
  }

  function runPlan(p, plan) {
    if (plan.kind === "turn") { p.face = B.rot(p.face, plan.turn); return; }
    var dir = plan.lateral ? B.rot(p.face, plan.lateral)
            : plan.dist > 0 ? p.face : B.opposite(p.face);
    var n = Math.abs(plan.dist);
    if (n > 0 && onOil(p)) n--;                       // wheels spin: one square less
    var moved = 0;
    for (var i = 0; i < n; i++) {
      if (!p.alive) return;
      if (!stepRobot(p, dir, "move")) break;          // walked into a wall; the rest of the move is lost
      moved++;
    }
    if (moved > 0 && p.alive && onOil(p)) {
      log(p.name + " skids on the oil");
      oilSlide(p, dir);
    }
  }

  function playCard(p, cd) {
    log(p.name + " " + CARD_KINDS[cd.kind].label.toLowerCase());
    runPlan(p, planFor(cd));
  }

  /* One conveyor pass. speed 2 moves express belts only; speed 1
     moves both, which is how an express ends up moving two squares.

     Belts move SIMULTANEOUSLY with a vacancy test, and that is the
     subtle part: a robot moves only if its destination will be
     empty, and two robots converging on one square means NEITHER
     moves. Assume everyone on a qualifying belt moves, then keep
     cancelling until nothing changes. */
  function beltPass(speed) {
    var C = UI.course, movers = {}, ids = [], i, j, p;
    var alive = live();
    for (i = 0; i < alive.length; i++) {
      p = alive[i];
      var code = B.codeAt(C, p.c, p.r), sp = B.beltSpeed(code);
      if (!sp) continue;
      if (speed === 2 && sp !== 2) continue;
      var d = B.dirOf(code);
      if (B.wallAt(C, p.c, p.r, d)) continue;         // the validator rejects these; belt and braces
      movers[p.id] = { dir: d, to: B.step(p.c, p.r, d) };
      ids.push(p.id);
    }

    for (var changed = true; changed;) {
      changed = false;
      for (i = 0; i < ids.length && !changed; i++) {
        var id = ids[i], m = movers[id];
        if (!m) continue;
        var occ = robotAt(m.to.c, m.to.r);
        if (occ && occ.id !== id && !movers[occ.id]) { delete movers[id]; changed = true; break; }
        for (j = 0; j < ids.length; j++) {
          var id2 = ids[j], m2 = movers[id2];
          if (!m2 || id2 === id) continue;
          if (m2.to.c === m.to.c && m2.to.r === m.to.r) {
            delete movers[id]; delete movers[id2]; changed = true; break;
          }
        }
      }
    }

    for (i = 0; i < ids.length; i++) {
      var mv = movers[ids[i]];
      if (!mv) continue;
      var b = G.players[ids[i]];
      b.c = mv.to.c; b.r = mv.to.r;
      tread(b);
      throughPortal(b);
      if (isHole(C, b.c, b.r)) { destroy(b, B.isVoid(C, b.c, b.r) ? "over the edge" : "into a pit"); continue; }
      /* Rotate ONLY because a belt carried the robot onto the curve.
         A robot that was already standing there, or was pushed on,
         does not turn. */
      var landed = B.codeAt(C, b.c, b.r);
      if (B.beltSpeed(landed)) {
        var turn = B.turnBetween(mv.dir, B.dirOf(landed));
        if (turn === 1 || turn === -1) {
          var bctx = fire(b, "onBoardElement", { kind: "beltCurve", turn: turn, veto: false });
          if (!bctx.veto) {
            b.face = B.rot(b.face, bctx.turn);
            log(b.name + " is carried round a curve");
          }
        }
      }
    }
  }

  function gearPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i], t = B.gearTurn(B.codeAt(C, p.c, p.r));
      if (!t) continue;
      var gctx = fire(p, "onBoardElement", { kind: "gear", turn: t, veto: false });
      if (gctx.veto) { log(p.name + " is held steady by its gyroscope"); continue; }
      p.face = B.rot(p.face, gctx.turn);
      log(p.name + " is turned by a gear");
    }
  }

  /* CRASH AND BURN.

     A press destroys whatever is standing on it in the registers
     printed on it, and a burner damages it. Both read their timing off
     the square rather than from a rule, because the boards print a
     different set of numbers on nearly every one.

     The burner's beat is the odd one. "Die Reihenfolge, in der
     Fabrikelemente in Aktion treten, bleibt bestehen. Mit einer
     Ausnahme: Brenner treten direkt nach den Lasern in Aktion." --
     every other element keeps its place and the burner alone moves to
     after the lasers. Put it with the rest and a robot shot down to its
     last point of damage burns before the shot that should have killed
     it, which is the wrong robot destroyed by the wrong thing. */
  function pressPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (!B.activeNow(B.codeAt(C, p.c, p.r), G.register)) continue;
      if (!B.elemOf(B.codeAt(C, p.c, p.r)).crush) continue;
      log(p.name + " is crushed by a press");
      destroy(p, "under a press");
    }
  }

  function burnerPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      var code = B.codeAt(C, p.c, p.r), el = B.elemOf(code);
      if (!el || !el.burn || !B.activeNow(code, G.register)) continue;
      log(p.name + " is scorched by a burner");
      damage(p, el.burn, "burner");
    }
  }

  function pusherPass() {
    var C = UI.course, alive = live();
    // G.register is 0-based, so index 0/2/4 are the printed registers 1/3/5.
    var wantOdd = (G.register % 2 === 0);
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i], el = B.elemOf(B.codeAt(C, p.c, p.r));
      if (!el || !el.push) continue;
      if ((el.push === "odd") !== wantOdd) continue;
      var d = B.dirOf(B.codeAt(C, p.c, p.r));
      var uctx = fire(p, "onBoardElement", { kind: "pusher", turn: 0, dir: d, veto: false });
      if (uctx.veto) continue;
      log(p.name + " is shoved by a pusher");
      stepRobot(p, uctx.dir, "pusher");
    }
  }

  /* The first robot a beam meets, or null. Robot lasers skip their
     own square; board lasers illuminate theirs. */
  function firstRobotAlong(c, r, dir, skipOrigin, pierce) {
    var C = UI.course, hit;
    pierce = pierce || 0;
    if (!skipOrigin) { hit = robotAt(c, r); if (hit) return hit; }
    for (var guard = 0; guard < C.w + C.h + 2; guard++) {
      if (B.wallAt(C, c, r, dir)) { if (pierce <= 0) return null; pierce--; }
      var nx = B.step(c, r, dir);
      if (B.isVoid(C, nx.c, nx.r)) return null;
      c = nx.c; r = nx.r;
      hit = robotAt(c, r);
      if (hit) return hit;
    }
    return null;
  }

  /* Board lasers and robot lasers fire at the SAME instant. That is
     not cosmetic: a robot taking its tenth damage token from a board
     laser still fires its own laser this register. So every shot is
     resolved against one frozen board, and only then is any damage
     applied. */
  /* Every shot fired this register, resolved against one frozen
     board. Nothing is applied here, which is what lets the step park
     for an option-card question and re-run without double-firing. */
  function computeLaserHits() {
    var C = UI.course, hits = [], i, s2;
    for (i = 0; i < C.lasers.length; i++) {
      var L = C.lasers[i];
      var t = firstRobotAlong(L.c, L.r, L.d, false, 0);
      if (t) hits.push({ target: t, damage: L.n, from: "a board laser", shooter: null, dir: L.d });
    }
    var alive = live();
    for (i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (p.poweredDown) continue;                    // a powered-down robot does not shoot
      var ctx = fire(p, "laserShots", { shots: [{ own: true, dir: p.face, damage: 1, pierce: 0 }] });
      for (s2 = 0; s2 < ctx.shots.length; s2++) {
        var sh = ctx.shots[s2];
        if (sh.damage <= 0) continue;
        var v = firstRobotAlong(p.c, p.r, sh.dir, true, sh.pierce || 0);
        if (v) hits.push({ target: v, damage: sh.damage, from: p.name + "'s laser", shooter: p, dir: sh.dir });
      }
    }
    return hits;
  }

  function applyLaserHits(hits) {
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!h.target.alive) continue;
      if (h.replaceWith) {
        if (h.replaceWith.kind === "push") {
          log(h.target.name + " is shoved by a beam");
          stepRobot(h.target, h.replaceWith.dir, "beam");
        } else if (h.replaceWith.kind === "scramble") {
          scrambleRegister(h.target);
        }
        continue;
      }
      if (h.damage <= 0) continue;
      log(h.target.name + " takes " + h.damage + " from " + h.from);
      damage(h.target, h.damage, "laser");
    }
  }

  function scrambleRegister(p) {
    var next = G.register + 1;
    if (next >= REGISTERS) return;
    var drawn = draw(1);
    if (!drawn.length) return;                        // never leave a locked register empty
    if (p.registers[next] !== null) G.discard.push(p.registers[next]);
    p.registers[next] = drawn[0];
    log(p.name + "'s register " + (next + 1) + " is scrambled");
  }

  /* Kept for the rule tests, which assert laser behaviour directly
     rather than through the phase machine. */
  function laserPass() { applyLaserHits(computeLaserHits()); }

  function damage(p, n, source) {
    var ctx = fire(p, "onDamage", { amount: n, source: source || "laser", absorbed: 0 });
    if (ctx.absorbed > 0) log(p.name + " absorbs " + ctx.absorbed + " damage");
    if (ctx.amount <= 0) return;
    p.damage += ctx.amount;
    if (p.damage >= MAX_DAMAGE) destroy(p, "shot to pieces");
  }

  function destroy(p, how) {
    if (!p.alive) return;
    p.alive = false;
    p.lives--;
    discardCards(p.hand); p.hand = [];
    discardCards(p.registers); p.registers = [null, null, null, null, null];
    /* A wrecked robot loses an option card. Which one is the player's
       choice at the table, and destruction happens deep inside a move
       -- far from anywhere a question can be parked -- so the choice
       is made here by a fixed preference instead.

       It cannot simply be the last card. A robot holding only
       Superior Archive would discard the one card whose entire
       purpose is the respawn that is about to happen, so the card
       could never once work. Anything that acts on coming back is
       kept until there is nothing else left. Marked as a
       simplification in the README. */
    if (p.options.length) {
      var drop = -1;
      for (var oi = 0; oi < p.options.length; oi++) {
        var odef = OPTION_DEFS[p.options[oi].id];
        if (odef && odef.hooks.onRespawn) continue;
        drop = oi;
      }
      if (drop < 0) drop = p.options.length - 1;
      G.optionDiscard.push(p.options.splice(drop, 1)[0].id);
    }
    p.damage = 0;
    p.poweredDown = false;
    p.announceDown = false;
    if (p.lives <= 0) { p.out = true; log(p.name + " is destroyed " + how + " and is out of the race"); }
    else log(p.name + " is destroyed " + how + " (" + p.lives + " left)");
  }

  /* A robot returns to its archive. If something is standing there,
     it takes the nearest free square instead -- searched outward so
     the result does not depend on player order. */
  function freeSpotNear(c, r) {
    var C = UI.course;
    if (!isHole(C, c, r) && !robotAt(c, r)) return { c: c, r: r };
    for (var rad = 1; rad <= 4; rad++) {
      for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        var nc = c + dc, nr = r + dr;
        if (isHole(C, nc, nr) || robotAt(nc, nr)) continue;
        return { c: nc, r: nr };
      }
    }
    return null;
  }

  function checkpointPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      /* "A powered-down robot is completely shut down -- it can't fire
         weapons, tag checkpoints, or update its archive location."
         A belt can still carry it across a flag, and it must come away
         with nothing: no score, and no new archive either. Scoring was
         the louder of the two, but the archive is the one that decides
         where a robot comes back, so a silent update moves a respawn
         the player never earned. */
      if (p.poweredDown) continue;
      var reach = fire(p, "onTouchCheckpoint", { reach: 0 }).reach;
      var spots = [{ c: p.c, r: p.r }];

      /* "Crossing it counts" (Euro): every square walked through this
         register is a candidate, in the order it was walked, with the
         square the robot actually stopped on considered last so the
         archive ends up where the robot is. Off by default -- the
         English manual wants a robot to END a register on the flag. */
      if (G.flagTouch && p.trail && p.trail.length > 1) {
        spots = [];
        for (var ti = 0; ti < p.trail.length; ti++) spots.push({ c: p.trail[ti][0], r: p.trail[ti][1] });
        spots.push({ c: p.c, r: p.r });
      }

      for (var d = 0; d < 4 && reach > 0; d++) {
        var nb = B.step(p.c, p.r, d);
        if (!B.isVoid(C, nb.c, nb.r)) spots.push(nb);
      }

      for (var sp = 0; sp < spots.length; sp++) {
      var code = B.codeAt(C, spots[sp].c, spots[sp].r), el = B.elemOf(code);

      // A repair site is always an archive point.
      if (el && el.repair) p.archive = { c: spots[sp].c, r: spots[sp].r, face: p.face };

      for (var f = 0; f < C.flags.length; f++) {
        var F = C.flags[f];
        if (F.c !== spots[sp].c || F.r !== spots[sp].r) continue;
        // Standing on ANY flag re-archives. Only the next one in
        // sequence scores; touching them out of order is a no-op.
        p.archive = { c: F.c, r: F.r, face: p.face };
        if (F.n === p.flags + 1) {
          p.flags++;
          log(p.name + " touches flag " + F.n);
          if (p.flags === C.flags.length) return win(p);
        }
      }
      }
    }
  }

  function win(p) {
    G.gameOver = true;
    G.winner = p.id;
    log(p.name + " has all " + UI.course.flags.length + " flags and wins");
  }

  /* ============================================================
     PHASE MACHINE
     STEP[phase][step]() mutates G, sets the next phase/step and
     returns WAIT (human input), ANIM (presentation queued) or NEXT
     (keep going). Bots never WAIT, so hot-seat, AI and the headless
     sims all fall out of one isHuman() branch.

     The register loop is nine sub-steps rather than one because each
     is a place the board queues animation and, from P4, a place an
     option card can ask a question. Collapsing them would force both
     concerns into a single function.
     ============================================================ */
  var STEP = {
    turn: {
      respawn: function () {
        var any = false;
        for (var i = 0; i < G.players.length; i++) {
          var p = G.players[i];
          if (p.alive || p.out) continue;
          var spot = freeSpotNear(p.archive.c, p.archive.r);
          if (!spot) { p.out = true; continue; }
          var rctx = fire(p, "onRespawn", { damage: 2, facing: p.archive.face });
          p.c = spot.c; p.r = spot.r;
          p.face = rctx.facing;
          p.damage = rctx.damage;                      // 2 by the book; Superior Archive makes it 1
          p.alive = true;
          any = true;
          log(p.name + " returns at (" + p.c + "," + p.r + ") with " + p.damage + " damage");
        }
        if (!live().length) { G.gameOver = true; log("Every robot is scrap. Nobody wins."); return NEXT; }
        go("turn", "powerStart");
        return any ? animate([{ type: "render" }]) : NEXT;
      },

      /* Damage clears at the START of a powered-down turn, not when
         it was announced. Announcing and repairing in one step would
         hand out a free repair on the announce turn. */
      powerStart: function () {
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          if (!alive[i].poweredDown) continue;
          alive[i].damage = 0;
          log(alive[i].name + " is powered down and fully repaired");
        }
        go("turn", "deal");
        return NEXT;
      },

      deal: function () {
        /* "Each turn begins by reshuffling the cards from the previous
           turn and then dealing a hand of program cards to each
           player." The deck is not a draw pile that persists across
           turns -- every card that is not sitting in a locked register
           is gathered and shuffled before each deal, so every turn is
           dealt from the whole 84 minus whatever damage has pinned
           down. Keeping a persistent pile instead quietly changed the
           odds: a card discarded this turn was unavailable next turn
           until the deck happened to run dry, which is not a rule
           anyone at the table would recognise.

           It also explains why draw()'s deal-short guard has never
           fired in any simulation. Eight robots at full health need 72
           of 84, so a deck reshuffled every turn cannot run out -- the
           guard is defending against a state the real rules make
           unreachable, and it stays only as a belt-and-braces. */
        G.deck = shuffle(G.deck.concat(G.discard));
        G.discard = [];
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown) { p.hand = []; p.dealtCount = 0; continue; }
          var dctx = fire(p, "modifyDealt", { count: cardsDealt(p.damage) });
          p.dealtCount = Math.max(0, dctx.count);
          p.hand = draw(p.dealtCount);
        }
        go("turn", "postDeal");
        return NEXT;
      },

      /* Cards that act on the hand you were dealt get their own step,
         because a step that can park for a question has to be safe to
         re-run, and the deal itself is not. */
      postDeal: function () {
        var alive = live(), pending = false;
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown) continue;
          var ctx = fire(p, "onDealt", { hand: p.hand, redraw: false });
          if (ctx.pending) { pending = true; continue; }
          if (ctx.redraw) {
            discardCards(p.hand);
            p.hand = draw(p.dealtCount);
            log(p.name + " recompiles");
          }
        }
        if (pending) return park("turn", "postDeal");
        go("turn", "program");
        return NEXT;
      },

      program: function () {
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown || programmed(p)) continue;
          if (isHuman(p)) { G.actor = p.id; return WAIT; }
          applyProgram(p, botProgram(p));
        }
        go("turn", "announce");
        return NEXT;
      },

      announce: function () {
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown) continue;                 // already down; decides again in cleanup
          if (!isHuman(p)) p.announceDown = botWantsPowerDown(p);
        }
        go("turn", "beginExec");
        /* Hold here while the registers turn over.
           Committing is the moment your program stops being yours to
           change and becomes something the floor will read back to
           you, and the cards going face down is how the board game
           says so. Returning NEXT would run straight into register 1,
           which reveals the first card again before the turn-over had
           a frame to happen in -- the state would be right and nobody
           would ever see it. */
        return animate([
          { type: "render" },
          { type: "sfx", name: "place" },
          { type: "wait", delay: 420 }     // the flip's own duration
        ]);
      },

      beginExec: function () { G.register = 0; go("exec", "reveal"); return NEXT; }
    },

    exec: {
      reveal: function () {
        var alive = live(), q = [];
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown) continue;
          var cd = cardAt(p, G.register);
          if (!cd) continue;
          q.push({ id: p.id, pri: cd.pri });
        }
        /* A new register, a new trail. It starts at where each robot
           stands, so a robot that does not move has a trail of one and
           behaves identically under either rule. */
        for (var ti = 0; ti < alive.length; ti++) alive[ti].trail = [[alive[ti].c, alive[ti].r]];
        q.sort(function (a, b) { return b.pri - a.pri; });   // highest priority first
        G.exec.queue = q.map(function (x) { return x.id; });
        go("exec", "move");
        return animate([
          { type: "log", msg: "-- register " + (G.register + 1) + " --" },
          { type: "sfx", name: "reveal" },
          { type: "render" },
          { type: "wait", delay: 320 }
        ]);
      },

      move: function () {
        if (!G.exec.queue.length) {
          go("exec", "express");
          /* Let the last robot finish. Everything before it waited only
             a gap, so the tail of the slowest motion is still running. */
          var m = motionOf("drive");
          return animate([{ type: "wait", delay: m.ms - m.gap }]);
        }
        /* Peek rather than shift: an option card can park this step
           for a question, and a shifted queue would lose the robot. */
        var p = G.players[G.exec.queue[0]];
        if (!p.alive) { G.exec.queue.shift(); return NEXT; }
        var cd = cardAt(p, G.register);
        if (!cd) { G.exec.queue.shift(); return NEXT; }

        var plan = planFor(cd);
        var ctx = fire(p, "modifyMove", plan);
        if (ctx.pending) return park("exec", "move");

        G.exec.queue.shift();
        log(p.name + " " + describePlan(cd, ctx));
        runPlan(p, ctx);
        /* Wait only the GAP, not the whole motion: this robot is still
           sliding when the next one sets off, which is what makes the
           priority order visible as a stagger instead of a queue. The
           last one still needs its full motion, so the step settles
           below once the queue is empty. */
        return animate([{ type: "motion", kind: "drive" }, { type: "sfx", name: "move" },
                        { type: "render" }, { type: "wait", delay: motionOf("drive").gap }]);
      },

      /* Each board element gets its own beat, but only if it actually
         moved somebody. A pause for a pusher nobody was standing on is
         five wasted seconds a turn, and the player learns to stop
         watching -- which is the opposite of what the beat is for. */
      express: function () { return boardBeat(beltPass, 2, "belts", 300, "belt", "belt"); },
      belts: function () { return boardBeat(beltPass, 1, "pushers", 300, "belt", "belt"); },
      pushers: function () { return boardBeat(pusherPass, null, "gears", 260, "shove", "shove"); },
      gears: function () { return boardBeat(gearPass, null, "presses", 260, "gear", "turn"); },
      presses: function () { return boardBeat(pressPass, null, "lasers", 300, "shove", "shove"); },

      lasers: function () {
        var before = boardSig();
        var beams = (UI.headless || !UI.mounted) ? null : collectBeams();

        /* Compute every shot first, ask whatever needs asking, and
           only then apply. Nothing has been mutated at the point this
           parks, so the re-run recomputes the identical hits. */
        var hits = computeLaserHits(), pending = false, i;
        for (i = 0; i < hits.length; i++) {
          if (!hits[i].shooter) continue;
          var hctx = fire(hits[i].shooter, "onLaserHit",
            { target: hits[i].target, damage: hits[i].damage, shotDir: hits[i].dir, replaceWith: null });
          if (hctx.pending) { pending = true; continue; }
          hits[i].damage = hctx.damage;
          hits[i].replaceWith = hctx.replaceWith;
        }
        if (pending) return park("exec", "lasers");
        applyLaserHits(hits);
        go("exec", "burners");
        if (UI.headless || !UI.mounted) return NEXT;
        var hit = boardSig() !== before;
        if (!beams.length) return NEXT;
        return animate([
          { type: "sfx", name: "laser" },
          { type: "beams", beams: beams },
          { type: "wait", delay: 240 },
          { type: "render" },
          { type: "beams", beams: [] },
          { type: "wait", delay: hit ? 200 : 40 }
        ]);
      },

      /* The one element that does not keep its place in the order:
         the rules move it to directly after the lasers. */
      burners: function () { return boardBeat(burnerPass, null, "touch", 300, "laser", "shove"); },

      touch: function () {
        var before = boardSig();
        checkpointPass();
        go("exec", "endReg");
        if (boardSig() === before) return NEXT;
        return animate([{ type: "sfx", name: "flag" }, { type: "render" }, { type: "wait", delay: 300 }]);
      },

      /* The whole of the option-card UI. Every "you may" card in the
         deck drains through here, which is why adding a card costs a
         data row and no interface at all. */
      optionChoice: function () {
        var q = G.pendingChoices;
        if (!q.length) {
          go(G.exec.resumePhase || "exec", G.exec.resume);
          return NEXT;
        }
        var ch = q[0], p = G.players[ch.owner];
        if (isHuman(p) && p.alive) { G.actor = p.id; return WAIT; }
        G.optionAnswers[ch.key] = botPick(p, ch);
        q.shift();
        return NEXT;
      },

      endReg: function () {
        if (G.gameOver) return NEXT;
        G.register++;
        if (G.register < REGISTERS) { go("exec", "reveal"); return NEXT; }
        go("cleanup", "askRepair");
        return NEXT;
      }
    },

    cleanup: {
      /* Repairs happen here and only here -- never at the touch step,
         where it is tempting to fold them in. */
      /* Asking is its own step, for the same reason the deal has one:
         a step that can park for a question has to be safe to re-run,
         and repairing is not -- coming back through it a second time
         would repair twice. So this step only ever ASKS, and never
         touches a robot; cleanup.repair then runs exactly once with
         every answer already in hand. */
      askRepair: function () {
        var C = UI.course, alive = live(), pending = false;
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (p.poweredDown) continue;
          if (!upgradeSite(C, p)) continue;
          if (askBoard(p, "upgrade", "Upgrade site",
                "Repair 2 points of damage, or take an option card?",
                ["Repair 2", "Option card"]) === null) pending = true;
        }
        if (pending) return park("cleanup", "repair");
        go("cleanup", "repair");
        return NEXT;
      },

      repair: function () {
        var C = UI.course, alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i], el = B.elemOf(B.codeAt(C, p.c, p.r)), onFlag = false;
          for (var f = 0; f < C.flags.length; f++) if (C.flags[f].c === p.c && C.flags[f].r === p.r) onFlag = true;

          /* "Robots on a repair site or checkpoint may now repair 1
             point of damage, and robots on a two-wrench repair site may
             either repair 2 points of damage or receive an option
             card." (p.14, and again on pp.28 and 36.) The either/or is
             the part this used to get wrong in both halves: it repaired
             one point rather than two, AND handed over the card as
             well. */
          if (upgradeSite(C, p) && !p.poweredDown) {
            var pick = answerFor(p, "upgrade");
            /* null means the answer has already been spent on an
               earlier pass, so this robot is done. Falling through on
               null treated "already handled" as "chose the repair" and
               repaired a second time. */
            if (pick === null) continue;
            if (pick === 1) {
              drawOption(p);
            } else {
              var n = Math.min(2, p.damage);
              if (n > 0) { p.damage -= n; log(p.name + " repairs " + n + " damage"); }
            }
            continue;
          }

          if ((el && el.repair) || onFlag) {
            if (p.damage > 0) { p.damage--; log(p.name + " repairs 1 damage"); }
          }
        }
        go("cleanup", "stayDown");
        return NEXT;
      },

      /* A robot that is ALREADY powered down decides now whether to
         stay down another turn. Distinct from announcing, which is a
         decision taken while programming. */
      stayDown: function () {
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          if (!p.poweredDown) continue;
          p.announceDown = isHuman(p) ? p.announceDown : botWantsPowerDown(p);
        }
        go("cleanup", "discard");
        return NEXT;
      },

      discard: function () {
        var alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i];
          discardCards(p.hand);
          p.hand = [];
          var open = openRegisters(p.damage);
          for (var reg = 0; reg < REGISTERS; reg++) {
            if (reg >= open) continue;                 // locked: the card stays put
            if (p.registers[reg] !== null) { G.discard.push(p.registers[reg]); p.registers[reg] = null; }
          }
        }
        go("cleanup", "endTurn");
        return NEXT;
      },

      endTurn: function () {
        for (var i = 0; i < G.players.length; i++) {
          var p = G.players[i];
          p.poweredDown = p.announceDown;
          p.announceDown = false;
        }
        /* Answers are keyed by turn and register, so last turn's can
           never match this turn's question -- but they would pile up
           in every save for the rest of the game. */
        G.optionAnswers = {};
        G.pendingChoices = [];
        G.turn++;
        if (G.turn > MAX_TURNS) {
          G.gameOver = true;
          G.unfinished = true;
          log("The race is called after " + MAX_TURNS + " turns with no winner.");
          return NEXT;
        }
        go("turn", "respawn");
        return NEXT;
      }
    }
  };

  /* Run one board element, and hand back a beat only if the board
     actually did something. */
  function boardBeat(fn, arg, nextStep, delay, sound, motion) {
    var before = boardSig();
    if (arg === null) fn(); else fn(arg);
    go("exec", nextStep);
    if (boardSig() === before) return NEXT;
    return animate([{ type: "motion", kind: motion }, { type: "sfx", name: sound },
                    { type: "render" }, { type: "wait", delay: delay }]);
  }

  /* Where every beam starts and stops this register, for the overlay.
     Board lasers illuminate their own square; a robot's starts one
     square in front, because a robot never shoots itself. */
  function collectBeams() {
    var C = UI.course, out = [], i;
    for (i = 0; i < C.lasers.length; i++) {
      var L = C.lasers[i];
      var t = firstRobotAlong(L.c, L.r, L.d, false);
      out.push({ c: L.c, r: L.r, dir: L.d, stopC: t ? t.c : -1, stopR: t ? t.r : -1 });
    }
    var alive = live();
    for (i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (p.poweredDown) continue;
      if (B.wallAt(C, p.c, p.r, p.face)) continue;
      var nx = B.step(p.c, p.r, p.face);
      if (B.isVoid(C, nx.c, nx.r)) continue;
      var v = firstRobotAlong(p.c, p.r, p.face, true);
      out.push({ c: nx.c, r: nx.r, dir: p.face, stopC: v ? v.c : -1, stopR: v ? v.r : -1 });
    }
    return out;
  }

  /* Hand control to the choice queue and remember where to come back
     to. The parked step re-runs from the top once the queue drains,
     so it must be free of side effects up to the question. */
  /* A QUESTION FROM THE BOARD, not from a card.
     Until now only an option card could stop and ask something, through
     ctx.pick inside fire(). But the printed rules have the factory floor
     asking too -- an upgrade site offers a repair or a card, and it is
     the player who chooses -- and several expansion elements ask as
     well. So the queue that already carries card questions carries
     board questions too, and there is one drain, one renderer and one
     saved-game format rather than two.

     Returns the answer index, or null when it has parked one. The key
     is derived the same way a card's is, so a reload mid-question
     lands on the same question. */
  function askBoard(player, tag, title, prompt, labels) {
    var key = choiceKey(player, "board", tag, "");
    var have = G.optionAnswers[key];
    if (have !== undefined && have !== "used") return have;
    if (have === "used") return null;
    for (var i = 0; i < G.pendingChoices.length; i++) if (G.pendingChoices[i].key === key) return null;
    G.pendingChoices.push({ key: key, owner: player.id, optionId: null,
      tag: tag, title: title, prompt: prompt, labels: labels });
    return null;
  }

  /* The answer to a board question, once it has been given. Marked
     used on the way out so a step that runs again cannot apply it
     twice -- the same guard ctx.pick uses for card questions. */
  function answerFor(player, tag) {
    var key = choiceKey(player, "board", tag, "");
    var have = G.optionAnswers[key];
    if (have === undefined || have === "used") return null;
    G.optionAnswers[key] = "used";
    return have;
  }

  /* A two-wrench site: the one board element that offers a choice.
     Asked in one place so the ask step and the apply step can never
     disagree about which squares are upgrade sites. */
  function upgradeSite(C, p) {
    var el = B.elemOf(B.codeAt(C, p.c, p.r));
    return !!(el && el.option);
  }

  function park(phase, step) {
    G.exec.resumePhase = phase;
    G.exec.resume = step;
    go("exec", "optionChoice");
    return NEXT;
  }

  /* An option card can turn a Move 1 into standing still, and a log
     line that still says "move 1" describes a move that did not
     happen -- which is exactly the register a player rewinds to when
     the board surprises them. */
  function describePlan(cd, plan) {
    var base = planFor(cd), label = CARD_KINDS[cd.kind].label.toLowerCase();
    if (plan.kind !== "move") return label;
    if (plan.lateral) return label + ", sidestepping " + (plan.lateral < 0 ? "left" : "right");
    if (plan.dist === 0 && base.dist !== 0) return label + ", but brakes and holds still";
    if (plan.dist !== base.dist) return label + ", modified to " + plan.dist;
    return label;
  }

  function programmed(p) {
    var open = openRegisters(p.damage);
    for (var i = 0; i < open; i++) if (p.registers[i] === null) return false;
    return true;
  }

  function applyProgram(p, picks) {
    var open = openRegisters(p.damage);
    for (var i = 0; i < open; i++) {
      var ci = picks[i];
      if (ci === undefined || ci === null) continue;
      p.registers[i] = ci;
      var at = p.hand.indexOf(ci);
      if (at >= 0) p.hand.splice(at, 1);
    }
  }

  function advance() {
    if (!G) return;
    var guard = 0;
    for (;;) {
      if (G.gameOver) { commit(); return; }
      if (++guard > 20000) { throw new Error("Phase machine runaway at " + G.phase + "." + G.step + " turn " + G.turn); }
      var fn = STEP[G.phase] && STEP[G.phase][G.step];
      if (!fn) throw new Error("Unknown step " + G.phase + "." + G.step);
      var r = fn();
      if (r === WAIT) break;
      if (r === ANIM) return;
    }
    commit();
  }

  function commit() {
    assertInvariants();
    if (UI.headless || !UI.mounted) return;
    saveGame();
    updateAll();
    if (G.gameOver) { clearSave(); renderGameOver(); sfx(G.winner !== null && isHuman(G.players[G.winner]) ? "win" : "lose"); }
  }

  /* ============================================================
     INVARIANTS
     Conservation laws, not unit tests, so they are cheap enough to
     run on every settled step. Each one has been watched to fail.
     ============================================================ */
  function assertInvariants() {
    var C = UI.course, i, p;

    // 1. The 84 program cards are conserved, always, everywhere.
    var n = G.deck.length + G.discard.length;
    for (i = 0; i < G.players.length; i++) {
      p = G.players[i];
      n += p.hand.length;
      for (var reg = 0; reg < REGISTERS; reg++) if (p.registers[reg] !== null) n++;
    }
    if (n !== 84) throw new Error("program card conservation broken: " + n + "/84 at " + G.phase + "." + G.step + " turn " + G.turn);

    // 1b. Option cards are conserved too.
    var o = G.optionDeck.length + G.optionDiscard.length;
    for (i = 0; i < G.players.length; i++) o += G.players[i].options.length;
    if (o !== OPTION_ROSTER.transcribed) {
      throw new Error("option card conservation broken: " + o + "/" + OPTION_ROSTER.transcribed +
        " at " + G.phase + "." + G.step + " turn " + G.turn);
    }

    var occupied = {};
    for (i = 0; i < G.players.length; i++) {
      p = G.players[i];

      // 2. Damage and lives stay in their printed ranges.
      if (p.damage < 0 || p.damage > MAX_DAMAGE) throw new Error(p.name + " has damage " + p.damage);
      if (p.alive && p.damage >= MAX_DAMAGE) throw new Error(p.name + " is at " + MAX_DAMAGE + " damage and still on the board");
      if (p.lives < 0 || p.lives > START_LIVES) throw new Error(p.name + " has " + p.lives + " lives");
      if (p.out && p.alive) throw new Error(p.name + " is out of the race and still on the board");

      // 3. Flags touched are a prefix: no gaps, ever.
      if (p.flags < 0 || p.flags > C.flags.length) throw new Error(p.name + " has touched " + p.flags + " of " + C.flags.length + " flags");

      /* 4. The deal arithmetic that drives the entire damage system.
         Checked against what was actually dealt rather than against
         9 - damage, because Extra Memory legitimately changes the
         second number and would turn this into a false alarm. The
         conservation property is the one that matters: every card
         dealt is either still in hand or sitting in a register. */
      if (G.phase === "turn" && G.step === "program" && p.alive && !p.poweredDown) {
        var placed = 0;
        for (var rq = 0; rq < REGISTERS; rq++) if (p.registers[rq] !== null && rq < openRegisters(p.damage)) placed++;
        if (p.hand.length + placed !== p.dealtCount && G.deck.length + G.discard.length > 0) {
          throw new Error(p.name + " holds " + p.hand.length + " cards and has placed " + placed +
            ", but was dealt " + p.dealtCount);
        }
        if (!p.options.length && p.dealtCount !== cardsDealt(p.damage) && G.deck.length + G.discard.length > 0) {
          throw new Error(p.name + " was dealt " + p.dealtCount + " at " + p.damage +
            " damage with no options, expected " + cardsDealt(p.damage));
        }
      }

      // 5. Locked registers hold a card and cannot be empty.
      var open = openRegisters(p.damage);
      if (p.alive && !p.poweredDown) {
        for (var k = open; k < REGISTERS; k++) {
          if (G.phase === "exec" && p.registers[k] === null) throw new Error(p.name + " register " + (k + 1) + " is locked but empty");
        }
      }

      if (!p.alive) continue;

      // 6. Nobody stands in a hole or off the course.
      if (B.isVoid(C, p.c, p.r)) throw new Error(p.name + " is off the course at (" + p.c + "," + p.r + ")");
      if (B.isPit(B.codeAt(C, p.c, p.r))) throw new Error(p.name + " is standing in a pit at (" + p.c + "," + p.r + ")");
      if (B.isVoid(C, p.archive.c, p.archive.r)) throw new Error(p.name + " has an archive off the course");

      // 7. One robot per square.
      var key = p.c + "," + p.r;
      if (occupied[key]) throw new Error("two robots on " + key + ": " + occupied[key] + " and " + p.name);
      occupied[key] = p.name;

      if (p.face < 0 || p.face > 3) throw new Error(p.name + " faces " + p.face);
    }

    // 8. Walls are symmetric. Cheap, and it catches a bad rotateBoard().
    if (!UI.wallsChecked) {
      for (var r2 = 0; r2 < C.h; r2++) for (var c2 = 0; c2 < C.w; c2++) {
        for (var d = 0; d < 4; d++) {
          var nb = B.step(c2, r2, d);
          if (B.isVoid(C, nb.c, nb.r)) continue;
          if (B.wallAt(C, c2, r2, d) !== B.wallAt(C, nb.c, nb.r, B.opposite(d))) {
            throw new Error("wall asymmetry between (" + c2 + "," + r2 + ") and (" + nb.c + "," + nb.r + ")");
          }
        }
      }
      UI.wallsChecked = true;
    }

    // 9. Bot thinking consumed no shared randomness, so a seed replays.
    if (UI.rngBefore !== undefined && UI.rngBefore !== UI.rngAfter) {
      throw new Error("a bot consumed rnd() while deciding; seeded replay is broken");
    }
  }

  /* ============================================================
     BOT: DISTANCE FIELDS
     For each flag, a breadth-first distance over the course under a
     movement model that knows walls, pits and the void. Computed
     once per course and cached on UI -- never in G, because a
     derived index in the save is how saves go stale.

     This, not the scoring weights, is the thing that makes a bot
     look like it has a plan. Without it a bot wanders, and with it
     even the crudest tier walks towards the flag.
     ============================================================ */
  function distField(C, flagIdx) {
    if (!UI.dist) UI.dist = {};
    var key = C.id + ":" + C.w + "x" + C.h + ":" + flagIdx;
    if (UI.dist[key]) return UI.dist[key];

    var n = C.w * C.h, d = new Int16Array(n);
    for (var i = 0; i < n; i++) d[i] = 32000;
    var F = C.flags[flagIdx];
    if (!F) { UI.dist[key] = d; return d; }

    var queue = [F.r * C.w + F.c];
    d[queue[0]] = 0;
    for (var head = 0; head < queue.length; head++) {
      var at = queue[head], c = at % C.w, r = (at - c) / C.w;
      for (var dir = 0; dir < 4; dir++) {
        /* Walking backwards from the flag: a step from the neighbour
           into here is legal exactly when a step from here to the
           neighbour is, because walls are symmetric. */
        if (B.wallAt(C, c, r, dir)) continue;
        var nb = B.step(c, r, dir);
        if (isHole(C, nb.c, nb.r)) continue;
        var ni = nb.r * C.w + nb.c;
        if (d[ni] <= d[at] + 1) continue;
        d[ni] = d[at] + 1;
        queue.push(ni);
      }
    }
    UI.dist[key] = d;
    return d;
  }

  /* ============================================================
     BOT: LOOKAHEAD
     A ghost robot run through the board elements with the other
     robots frozen. Their programs are unknowable and simulating
     them is a combinatorial explosion, but RoboRally movement is
     dominated by the board rather than by traffic, so freezing them
     is a good approximation and a cheap one.

     Deliberately ignores lasers: damage is survivable and a bot that
     flinches from every line of fire never reaches a flag.
     ============================================================ */
  function ghostMove(C, st, dir) {
    if (st.dead) return;
    if (B.wallAt(C, st.c, st.r, dir)) return;
    var nx = B.step(st.c, st.r, dir);
    st.c = nx.c; st.r = nx.r;
    if (isHole(C, st.c, st.r)) st.dead = true;
  }

  function ghostCard(C, st, cd) {
    var k = CARD_KINDS[cd.kind];
    if (k.turn !== undefined) { st.face = B.rot(st.face, k.turn); return; }
    var dir = k.move > 0 ? st.face : B.opposite(st.face);
    for (var i = 0; i < Math.abs(k.move) && !st.dead; i++) ghostMove(C, st, dir);
  }

  function ghostBelt(C, st, speed) {
    if (st.dead) return;
    var code = B.codeAt(C, st.c, st.r), sp = B.beltSpeed(code);
    if (!sp || (speed === 2 && sp !== 2)) return;
    var d = B.dirOf(code);
    if (B.wallAt(C, st.c, st.r, d)) return;
    var nx = B.step(st.c, st.r, d);
    st.c = nx.c; st.r = nx.r;
    if (isHole(C, st.c, st.r)) { st.dead = true; return; }
    var landed = B.codeAt(C, st.c, st.r);
    if (B.beltSpeed(landed)) {
      var t = B.turnBetween(d, B.dirOf(landed));
      if (t === 1 || t === -1) st.face = B.rot(st.face, t);
    }
  }

  function ghostBoard(C, st, register) {
    if (st.dead) return;
    ghostBelt(C, st, 2);
    ghostBelt(C, st, 1);
    if (st.dead) return;
    var el = B.elemOf(B.codeAt(C, st.c, st.r));
    if (el && el.push && ((el.push === "odd") === (register % 2 === 0))) {
      ghostMove(C, st, B.dirOf(B.codeAt(C, st.c, st.r)));
    }
    if (st.dead) return;
    var t = B.gearTurn(B.codeAt(C, st.c, st.r));
    if (t) st.face = B.rot(st.face, t);
  }

  /* Flags touched along the way count, so a program that clips flag
     N on register 2 and ends elsewhere still scores. Checking only
     the final square is the classic way to build a bot that walks
     over the win and keeps going. */
  function ghostTouch(C, st, flags) {
    for (var f = 0; f < C.flags.length; f++) {
      var F = C.flags[f];
      if (F.c === st.c && F.r === st.r && F.n === flags + 1) return flags + 1;
    }
    return flags;
  }

  var W_FLAG = 400, W_DIST = 12, W_DEATH = 260, W_FACE = 6, W_PIT = 9;

  function scoreGhost(C, st, p, startFlags) {
    if (st.dead) return -W_DEATH * 4;
    var idx = st.flags >= C.flags.length ? -1 : st.flags;
    var s = W_FLAG * (st.flags - startFlags);
    if (idx >= 0) {
      var d = distField(C, idx)[st.r * C.w + st.c];
      s -= W_DIST * Math.min(d, 200);
      // Facing the way the flag lies is worth a little: it saves a register.
      var ahead = B.step(st.c, st.r, st.face);
      if (!isHole(C, ahead.c, ahead.r)) {
        var da = distField(C, idx)[ahead.r * C.w + ahead.c];
        if (da < d) s += W_FACE;
      }
    } else {
      s += W_FLAG;                                   // already won in simulation
    }
    // Standing next to a hole is how a bot dies to a conveyor next turn.
    for (var dir = 0; dir < 4; dir++) {
      var nb = B.step(st.c, st.r, dir);
      if (isHole(C, nb.c, nb.r)) s -= W_PIT;
    }
    return s;
  }

  /* Beam search, register by register. P(9,5) is 15,120 orderings,
     which is affordable exhaustively, but the beam gets the same
     answer on these boards for a fraction of the work and degrades
     gracefully when a later wave adds option cards to the branching.

     botProgram must not touch rnd(): a seeded replay drifts the
     moment a bot evaluates a different number of candidates.
     Difficulty noise comes from hashing the position instead, and
     assertInvariants checks the stream really did not move. */
  function botProgram(p) {
    UI.rngBefore = G.rngState;
    var C = UI.course, open = openRegisters(p.damage), hand = p.hand;
    var skill = p.skill === undefined ? 1 : p.skill;
    var width = skill <= 0 ? 3 : skill === 1 ? 10 : 24;

    var beam = [{ picks: [], used: 0, st: { c: p.c, r: p.r, face: p.face, dead: false, flags: p.flags } }];

    for (var reg = 0; reg < open && hand.length; reg++) {
      var next = [];
      for (var b = 0; b < beam.length; b++) {
        var node = beam[b];
        for (var h = 0; h < hand.length; h++) {
          if (node.used & (1 << h)) continue;
          var st = { c: node.st.c, r: node.st.r, face: node.st.face, dead: node.st.dead, flags: node.st.flags };
          ghostCard(C, st, card(hand[h]));
          ghostBoard(C, st, reg);
          if (!st.dead) st.flags = ghostTouch(C, st, st.flags);
          next.push({
            picks: node.picks.concat([hand[h]]),
            used: node.used | (1 << h),
            st: st,
            score: scoreGhost(C, st, p, p.flags)
          });
        }
      }
      if (!next.length) break;
      // Deterministic jitter so equal-scoring lines differ between
      // robots and turns without consulting the shared RNG.
      for (var i = 0; i < next.length; i++) {
        var noise = (hash32(G.turn * 131 + p.id * 17 + reg * 7919 + i) / 4294967296 - 0.5);
        next[i].score += noise * (skill >= 2 ? 2 : 14);
      }
      next.sort(function (x, y) { return y.score - x.score; });
      beam = next.slice(0, width);
    }

    UI.rngAfter = G.rngState;
    return beam.length ? beam[0].picks : [];
  }

  function botWantsPowerDown(p) {
    if (p.skill <= 0) return false;
    return p.damage >= (p.skill >= 2 ? 6 : 8);
  }

  /* ============================================================
     RULE TESTS
     Scenario tests over the rules engine. These are not balance
     checks -- they are the printed rules, each set up on a small
     purpose-built board and asserted.

     They exist because the headless sim cannot tell "the bot plays
     badly" from "this rule is unreachable". A random bot touched 15
     flags in 200 games; only a test that puts a robot next to a flag
     proves the flag can be touched at all.

     Every test here has been watched to fail by inverting its
     assertion.
     ============================================================ */

  /* A tiny board built from a grid of cell codes plus wall edges
     written as "c,r,D". Walls go in from either side and land in the
     one lattice slot they share, which is the same guarantee the
     shipped picture format gives. */
  function benchPic(cells, walls) {
    var h = cells.length, w = cells[0].length, wl = {}, rows = [], y, c, r;
    for (var i = 0; i < (walls || []).length; i++) wl[walls[i]] = 1;
    function hasV(cc, rr) {   // wall on the west edge of (cc,rr)
      return wl[cc + "," + rr + ",W"] || (cc > 0 && wl[(cc - 1) + "," + rr + ",E"]);
    }
    function hasH(cc, rr) {   // wall on the north edge of (cc,rr)
      return wl[cc + "," + rr + ",N"] || (rr > 0 && wl[cc + "," + (rr - 1) + ",S"]);
    }
    for (y = 0; y <= 2 * h; y++) {
      r = y >> 1;
      var out = "";
      if (y % 2 === 0) {
        for (c = 0; c < w; c++) out += "+" + (hasH(c, r) ? "--" : "  ");
        out += "+";
      } else {
        for (c = 0; c < w; c++) out += (hasV(c, r) ? "|" : " ") + cells[r][c];
        out += (wl[(w - 1) + "," + r + ",E"] || wl[w + "," + r + ",W"]) ? "|" : " ";
      }
      rows.push(out);
    }
    return rows;
  }

  function bench(cells, walls, lasers) {
    var w = cells[0].length, h = cells.length;
    var g = B.parsePic("bench", { w: w, h: h, pic: benchPic(cells, walls), lasers: lasers || [] });
    g.id = "bench"; g.name = "Bench"; g.flags = [];
    return g;
  }

  function benchGame(grid, robots, flags) {
    UI.course = grid;
    grid.flags = flags || [];
    UI.wallsChecked = false;
    G = {
      v: 1, seed: 1, rngState: 1, courseId: "bench", turn: 1, register: 0,
      phase: "exec", step: "move", players: [], deck: [], discard: [],
      optionDeck: [], optionDiscard: [], optionAnswers: {},
      gameOver: false, winner: null, unfinished: false, log: [],
      exec: { queue: [], resume: null, resumePhase: null }, pendingChoices: []
    };
    for (var i = 0; i < robots.length; i++) {
      var rb = robots[i], face = rb.face === undefined ? N : rb.face;
      G.players.push({
        id: i, name: rb.name || LIVERIES[i].name, livery: i, isBot: true, skill: 1,
        c: rb.c, r: rb.r, face: face,
        damage: rb.damage || 0,
        lives: rb.lives === undefined ? START_LIVES : rb.lives,
        flags: rb.flags || 0,
        archive: rb.archive || { c: rb.c, r: rb.r, face: face },
        hand: [], dealtCount: 0, registers: [null, null, null, null, null],
        /* Options are opt-in per test: a card firing in a test that is
           not about that card would be a false pass or a false alarm. */
        options: (rb.options || []).map(function (id) {
          var def = OPTION_DEFS[id];
          if (!def) throw new Error("bench robot given unknown option " + id);
          return { id: id, st: def.init ? def.init() : {} };
        }),
        poweredDown: !!rb.poweredDown, announceDown: false,
        alive: rb.alive !== false, out: false
      });
    }
    for (var d = 0; d < PROGRAM_DECK.length; d++) G.deck.push(d);
    /* The bench holds whatever the robots were not given, so option
       conservation still balances if a test checks it. */
    var taken = {};
    for (var q = 0; q < G.players.length; q++) {
      for (var o = 0; o < G.players[q].options.length; o++) taken[G.players[q].options[o].id] = true;
    }
    for (var k = 0; k < OPTION_IDS.length; k++) if (!taken[OPTION_IDS[k]]) G.optionDeck.push(OPTION_IDS[k]);
    return G;
  }

  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  function at(p) { return "(" + p.c + "," + p.r + ")"; }
  function firstCard(kind) {
    for (var i = 0; i < PROGRAM_DECK.length; i++) if (PROGRAM_DECK[i].kind === kind) return PROGRAM_DECK[i];
    throw new Error("no " + kind + " card");
  }

  var RULE_TESTS = [

    // ---- movement and pushing ------------------------------------
    { name: "a robot pushes the robot in front of it", run: function () {
      benchGame(bench([["..", "..", "..", ".."]]), [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }]);
      stepRobot(G.players[0], E, "move");
      assert(G.players[0].c === 1, "pusher should be at 1, is " + at(G.players[0]));
      assert(G.players[1].c === 2, "pushed robot should be at 2, is " + at(G.players[1]));
    } },

    { name: "a wall stops the whole push chain, pusher included", run: function () {
      benchGame(bench([["..", "..", "..", ".."]], ["1,0,E"]), [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }]);
      stepRobot(G.players[0], E, "move");
      assert(G.players[0].c === 0, "pusher must not move when the chain is walled");
      assert(G.players[1].c === 1, "pushed robot must not move when the chain is walled");
    } },

    { name: "pushing a robot off the edge destroys only it", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 1, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      stepRobot(G.players[0], E, "move");
      assert(G.players[0].alive && G.players[0].c === 2, "pusher should survive at 2");
      assert(!G.players[1].alive, "the robot shoved off the edge should be destroyed");
      assert(G.players[1].lives === START_LIVES - 1, "it should have lost exactly one life");
    } },

    { name: "a wall cancels the rest of a multi-square move", run: function () {
      benchGame(bench([["..", "..", "..", ".."]], ["1,0,E"]), [{ c: 0, r: 0, face: E }]);
      playCard(G.players[0], firstCard("move3"));
      assert(G.players[0].c === 1, "should stop at the wall on 1, is " + at(G.players[0]));
    } },

    { name: "Back Up moves backwards without turning", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 2, r: 0, face: E }]);
      playCard(G.players[0], firstCard("back"));
      assert(G.players[0].c === 1, "should have moved west to 1, is " + at(G.players[0]));
      assert(G.players[0].face === E, "facing must be unchanged by Back Up");
    } },

    { name: "U-Turn reverses facing", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, face: N }]);
      playCard(G.players[0], firstCard("uturn"));
      assert(G.players[0].face === S, "north U-turned should face south, faces " + G.players[0].face);
    } },

    // ---- conveyors -----------------------------------------------
    { name: "a conveyor carries a robot one square", run: function () {
      benchGame(bench([["b>", "..", ".."]]), [{ c: 0, r: 0, face: N }]);
      beltPass(1);
      assert(G.players[0].c === 1, "should have been carried east, is " + at(G.players[0]));
    } },

    { name: "an express conveyor moves on both passes, a normal one only on the second", run: function () {
      benchGame(bench([["B>", "B>", "B>", ".."], ["b>", "b>", "b>", ".."]]),
        [{ c: 0, r: 0 }, { c: 0, r: 1 }]);
      beltPass(2); beltPass(1);
      assert(G.players[0].c === 2, "express robot should have moved 2, is at " + at(G.players[0]));
      assert(G.players[1].c === 1, "normal-belt robot should have moved 1, is at " + at(G.players[1]));
    } },

    { name: "a curve rotates a robot the conveyor carried onto it", run: function () {
      benchGame(bench([["b>", "bv"], ["..", ".."]]), [{ c: 0, r: 0, face: N }]);
      beltPass(1);
      assert(G.players[0].c === 1 && G.players[0].r === 0, "should be on the curve, is " + at(G.players[0]));
      assert(G.players[0].face === E, "travelling east onto a south-exiting curve is a right turn, so north becomes east");
    } },

    { name: "a curve does NOT rotate a robot that was pushed onto it", run: function () {
      benchGame(bench([["..", "bv"], ["..", ".."]]), [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: N }]);
      // Robot 1 already stands on the curve; shoving it does not turn it.
      var before = G.players[1].face;
      stepRobot(G.players[0], E, "move");
      assert(G.players[1].face === before || !G.players[1].alive, "a pushed robot must not be turned by the curve it lands on");
    } },

    { name: "two conveyors converging on one square move neither robot", run: function () {
      benchGame(bench([["b>", "..", "b<"]]), [{ c: 0, r: 0 }, { c: 2, r: 0 }]);
      beltPass(1);
      assert(G.players[0].c === 0, "west robot must not move into a contested square");
      assert(G.players[1].c === 2, "east robot must not move into a contested square");
    } },

    { name: "a conveyor does not push a robot standing off the belt", run: function () {
      benchGame(bench([["b>", "..", ".."]]), [{ c: 0, r: 0 }, { c: 1, r: 0 }]);
      beltPass(1);
      assert(G.players[0].c === 0, "conveyors never push; the robot should be stuck at 0");
      assert(G.players[1].c === 1, "the stationary robot should not have been pushed");
    } },

    { name: "a conveyor carries a robot into a pit and destroys it", run: function () {
      benchGame(bench([["b>", "o."]]), [{ c: 0, r: 0 }]);
      beltPass(1);
      assert(!G.players[0].alive, "should have been destroyed in the pit");
    } },

    // ---- gears and pushers ---------------------------------------
    { name: "gears turn a robot 90 degrees the printed way", run: function () {
      benchGame(bench([["r.", "l."]]), [{ c: 0, r: 0, face: N }, { c: 1, r: 0, face: N }]);
      gearPass();
      assert(G.players[0].face === E, "clockwise gear: north becomes east");
      assert(G.players[1].face === W, "counter-clockwise gear: north becomes west");
    } },

    { name: "a pusher fires only on its own registers", run: function () {
      var cells = [["p>", "..", ".."], ["P>", "..", ".."]];
      var walls = ["0,0,W", "0,1,W"];       // each pusher mounts on the wall behind it
      benchGame(bench(cells, walls), [{ c: 0, r: 0 }, { c: 0, r: 1 }]);
      G.register = 0;                       // printed register 1: odd pushers only
      pusherPass();
      assert(G.players[0].c === 1, "the 1/3/5 pusher should fire on register 1");
      assert(G.players[1].c === 0, "the 2/4 pusher must not fire on register 1");
      benchGame(bench(cells, walls), [{ c: 0, r: 0 }, { c: 0, r: 1 }]);
      G.register = 1;                       // printed register 2: even pushers only
      pusherPass();
      assert(G.players[0].c === 0, "the 1/3/5 pusher must not fire on register 2");
      assert(G.players[1].c === 1, "the 2/4 pusher should fire on register 2");
    } },

    // ---- lasers ---------------------------------------------------
    { name: "a board laser damages the first robot in the beam only", run: function () {
      benchGame(bench([["..", "..", "..", ".."]], ["0,0,W"], [{ c: 0, r: 0, d: "E", n: 2 }]),
        [{ c: 2, r: 0, face: N }, { c: 3, r: 0, face: N }]);
      laserPass();
      assert(G.players[0].damage === 2, "first robot in the beam takes 2, took " + G.players[0].damage);
      assert(G.players[1].damage === 0, "the robot behind it is shielded, took " + G.players[1].damage);
    } },

    { name: "a wall blocks a laser", run: function () {
      benchGame(bench([["..", "..", ".."]], ["0,0,W", "1,0,E"], [{ c: 0, r: 0, d: "E", n: 1 }]),
        [{ c: 2, r: 0, face: S }]);
      laserPass();
      assert(G.players[0].damage === 0, "the wall should have stopped the beam");
    } },

    { name: "robot lasers fire forwards and skip their own square", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      laserPass();
      assert(G.players[1].damage === 1, "the robot ahead should take 1, took " + G.players[1].damage);
      assert(G.players[0].damage === 0, "a robot never shoots itself");
    } },

    { name: "a powered-down robot does not fire but is still hit", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, poweredDown: true }, { c: 1, r: 0, face: W }]);
      laserPass();
      assert(G.players[0].damage === 1, "the powered-down robot should still be shot, took " + G.players[0].damage);
      assert(G.players[1].damage === 0, "a powered-down robot must not fire back");
    } },

    { name: "lasers are simultaneous: a robot destroyed this register still fires", run: function () {
      // Both face each other; the west one is one hit from destruction.
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0, face: E, damage: MAX_DAMAGE - 1 }, { c: 1, r: 0, face: W }]);
      laserPass();
      assert(!G.players[0].alive, "the robot on 9 damage should have been destroyed");
      assert(G.players[1].damage === 1, "its shot must still land; sequencing board-then-robot loses this");
    } },

    // ---- damage, locking, destruction -----------------------------
    { name: "ten damage destroys a robot and costs a life", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0 }]);
      damage(G.players[0], MAX_DAMAGE);
      assert(!G.players[0].alive, "should be destroyed at " + MAX_DAMAGE + " damage");
      assert(G.players[0].lives === START_LIVES - 1, "should have lost one life");
    } },

    { name: "registers lock from the right as damage mounts", run: function () {
      var expect = [5, 5, 5, 5, 5, 4, 3, 2, 1, 0];
      for (var d = 0; d <= 9; d++) {
        assert(openRegisters(d) === expect[d], "at " + d + " damage, " + expect[d] + " registers should be open, got " + openRegisters(d));
        assert(cardsDealt(d) === 9 - d, "at " + d + " damage a robot is dealt " + (9 - d) + " cards");
      }
    } },

    { name: "a destroyed robot returns to its archive with two damage", run: function () {
      benchGame(bench([["..", "..", "o."]]), [{ c: 2, r: 0, archive: { c: 0, r: 0, face: S } }]);
      G.players[0].damage = 4;
      destroy(G.players[0], "for the test");
      G.phase = "turn"; G.step = "respawn";
      STEP.turn.respawn();
      var p = G.players[0];
      assert(p.alive, "should be back on the board");
      assert(p.c === 0 && p.r === 0, "should return to the archive, is " + at(p));
      assert(p.damage === 2, "should return with 2 damage, has " + p.damage);
      assert(p.face === S, "should return facing the archived direction");
    } },

    { name: "a robot returning to an occupied archive takes the nearest free square", run: function () {
      benchGame(bench([["..", "..", ".."], ["..", "..", ".."]]),
        [{ c: 0, r: 0, archive: { c: 1, r: 0, face: N }, alive: false }, { c: 1, r: 0 }]);
      G.players[0].c = -1; G.players[0].r = -1;
      G.phase = "turn"; G.step = "respawn";
      STEP.turn.respawn();
      var p = G.players[0];
      assert(p.alive, "should have found a square");
      assert(!(p.c === 1 && p.r === 0), "must not be placed on top of the robot already there");
    } },

    // ---- checkpoints ----------------------------------------------
    { name: "flags must be touched in order", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 2, r: 0 }], [{ c: 1, r: 0, n: 1 }, { c: 2, r: 0, n: 2 }]);
      checkpointPass();
      assert(G.players[0].flags === 0, "touching flag 2 first must not score, scored " + G.players[0].flags);
    } },

    { name: "an out-of-order flag still updates the archive", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 2, r: 0, archive: { c: 0, r: 0, face: N } }],
        [{ c: 1, r: 0, n: 1 }, { c: 2, r: 0, n: 2 }]);
      checkpointPass();
      var a = G.players[0].archive;
      assert(a.c === 2 && a.r === 0, "the archive should move to the flag even though it did not score");
    } },

    { name: "a repair site updates the archive", run: function () {
      benchGame(bench([["..", "w."]]), [{ c: 1, r: 0, archive: { c: 0, r: 0, face: N } }]);
      checkpointPass();
      assert(G.players[0].archive.c === 1, "standing on a wrench should re-archive");
    } },

    { name: "touching every flag in order wins the game", run: function () {
      var flags = [{ c: 0, r: 0, n: 1 }, { c: 1, r: 0, n: 2 }, { c: 2, r: 0, n: 3 }];
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }], flags);
      var p = G.players[0];
      checkpointPass();
      assert(p.flags === 1, "flag 1 should score");
      stepRobot(p, E, "move"); checkpointPass();
      assert(p.flags === 2, "flag 2 should score");
      stepRobot(p, E, "move"); checkpointPass();
      assert(p.flags === 3, "flag 3 should score");
      assert(G.gameOver && G.winner === p.id, "touching the last flag must win the game");
    } },

    // ---- repairs and power down -----------------------------------
    { name: "repairs happen in cleanup, not when the flag is touched", run: function () {
      benchGame(bench([["w."]]), [{ c: 0, r: 0, damage: 3 }]);
      checkpointPass();
      assert(G.players[0].damage === 3, "the touch step must not repair");
      STEP.cleanup.repair();
      assert(G.players[0].damage === 2, "cleanup should repair 1, damage is " + G.players[0].damage);
    } },

    { name: "power down clears damage at the start of the powered-down turn, not on announcing", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, damage: 6 }]);
      var p = G.players[0];
      p.announceDown = true;
      STEP.cleanup.endTurn();
      assert(p.poweredDown === true, "the announcement should take effect at end of turn");
      assert(p.damage === 6, "announcing must not repair anything by itself");
      STEP.turn.powerStart();
      assert(p.damage === 0, "damage clears at the start of the powered-down turn");
    } },

    /* The powered-down shutdown rules. A belt can carry a shut-down
       robot anywhere, so each of these is reachable in ordinary play
       and none of them is visible when it goes wrong -- a flag scored
       by a robot that was switched off looks exactly like a flag
       scored by one that was not. */
    { name: "a powered-down robot does not tag a checkpoint", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, poweredDown: true }], [{ c: 0, r: 0, n: 1 }]);
      checkpointPass();
      assert(G.players[0].flags === 0,
        "manual p.29: a powered-down robot cannot tag checkpoints; it scored " + G.players[0].flags);
    } },

    { name: "a powered-down robot does not update its archive", run: function () {
      benchGame(bench([["w."]]), [{ c: 0, r: 0, poweredDown: true,
        archive: { c: 9, r: 9, face: 0 } }]);
      checkpointPass();
      assert(G.players[0].archive.c === 9,
        "manual p.29: a powered-down robot cannot update its archive location; it moved to " +
        G.players[0].archive.c + "," + G.players[0].archive.r);
    } },

    { name: "a powered-down robot does not acquire an option card", run: function () {
      benchGame(bench([["W."]]), [{ c: 0, r: 0, poweredDown: true }]);
      G.optionDeck = ["brakes"];
      G.phase = "cleanup"; G.step = "repair";
      STEP.cleanup.repair();
      assert(G.players[0].options.length === 0,
        "manual p.29: a powered-down robot cannot acquire option cards; it took " +
        G.players[0].options.length);
    } },

    /* The two-wrench site, manual pp.14, 28 and 36 -- three places say
       the same thing, and the engine disagreed with all three. It
       repaired one point instead of two AND dealt the card as well, so
       it was wrong in both halves and generous in both. */
    { name: "a two-wrench site repairs 2 when the repair is chosen", run: function () {
      benchGame(bench([["W."]]), [{ c: 0, r: 0, damage: 4 }]);
      var p = G.players[0];
      G.phase = "cleanup"; G.step = "askRepair";
      STEP.cleanup.askRepair();
      G.optionAnswers[G.pendingChoices[0].key] = 0;      // "Repair 2"
      G.pendingChoices.shift();
      STEP.cleanup.repair();
      assert(p.damage === 2, "two points, not one -- damage is " + p.damage);
      assert(p.options.length === 0, "and NOT the card as well -- it took " + p.options.length);
    } },

    { name: "a two-wrench site gives a card instead of the repair", run: function () {
      benchGame(bench([["W."]]), [{ c: 0, r: 0, damage: 4 }]);
      G.optionDeck = ["brakes"];
      var p = G.players[0];
      G.phase = "cleanup"; G.step = "askRepair";
      STEP.cleanup.askRepair();
      G.optionAnswers[G.pendingChoices[0].key] = 1;      // "Option card"
      G.pendingChoices.shift();
      STEP.cleanup.repair();
      assert(p.options.length === 1, "the card should have been dealt");
      assert(p.damage === 4, "and the damage must be UNTOUCHED, it is " + p.damage);
    } },

    { name: "a one-wrench site still repairs exactly 1 and asks nothing", run: function () {
      benchGame(bench([["w."]]), [{ c: 0, r: 0, damage: 4 }]);
      G.phase = "cleanup"; G.step = "askRepair";
      STEP.cleanup.askRepair();
      assert(G.pendingChoices.length === 0, "a single wrench is not a choice");
      STEP.cleanup.repair();
      assert(G.players[0].damage === 3, "one point off, got " + (4 - G.players[0].damage));
    } },

    { name: "a parked upgrade question survives a save and does not repair twice", run: function () {
      benchGame(bench([["W."]]), [{ c: 0, r: 0, damage: 6 }]);
      G.phase = "cleanup"; G.step = "askRepair";
      STEP.cleanup.askRepair();
      var key = G.pendingChoices[0].key;
      /* pendingChoices rides in the save, so anything parked on it has
         to be plain JSON -- a closure here would vanish on reload. */
      G = JSON.parse(JSON.stringify(G));
      assert(G.pendingChoices[0].key === key, "the same question must come back with the same key");
      G.optionAnswers[key] = 0;
      G.pendingChoices.shift();
      STEP.cleanup.repair();
      assert(G.players[0].damage === 4, "repaired 2, got " + (6 - G.players[0].damage));
      STEP.cleanup.repair();                              // a re-run must not apply it again
      assert(G.players[0].damage === 4, "a second pass repaired again: " + G.players[0].damage);
    } },

    // ---- house rule: what counts as touching a flag -------------------
    { name: "by default, crossing a flag does not touch it", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }], [{ c: 1, r: 0, n: 1 }]);
      G.flagTouch = 0;
      var p = G.players[0];
      p.trail = [[0, 0]];
      stepRobot(p, E, "move"); stepRobot(p, E, "move");
      checkpointPass();
      assert(p.c === 2, "the robot should have ended two squares along");
      assert(p.flags === 0, "the English manual wants it to STOP on the flag; it scored " + p.flags);
    } },

    { name: "Euro style: crossing a flag touches it", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }], [{ c: 1, r: 0, n: 1 }]);
      G.flagTouch = 1;
      var p = G.players[0];
      p.trail = [[0, 0]];
      stepRobot(p, E, "move"); stepRobot(p, E, "move");
      checkpointPass();
      assert(p.flags === 1, "crossing should count under the German reading; it scored " + p.flags);
    } },

    { name: "Euro style still refuses flags out of order", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }], [{ c: 2, r: 0, n: 1 }, { c: 1, r: 0, n: 2 }]);
      G.flagTouch = 1;
      var p = G.players[0];
      p.trail = [[0, 0]];
      stepRobot(p, E, "move");                     // crosses flag 2 with flag 1 untouched
      checkpointPass();
      assert(p.flags === 0, "flag 2 before flag 1 must score nothing; it scored " + p.flags);
    } },

    { name: "a robot that never moves behaves the same under either rule", run: function () {
      for (var mode = 0; mode < 2; mode++) {
        benchGame(bench([[".."]]), [{ c: 0, r: 0 }], [{ c: 0, r: 0, n: 1 }]);
        G.flagTouch = mode;
        G.players[0].trail = [[0, 0]];
        checkpointPass();
        assert(G.players[0].flags === 1, "standing on flag 1 scores it whatever the house rule (mode " + mode + ")");
      }
    } },

    // ---- Crash and Burn: portals -------------------------------------
    { name: "a portal drops you out of its twin and you carry on", run: function () {
      benchGame(bench([["..", "t1", "..", "t1", ".."]]), [{ c: 0, r: 0, face: E }]);
      var p = G.players[0];
      runPlan(p, { kind: "move", dist: 2 });
      /* Move 2: into the portal at c1, out at c3, then one more square. */
      assert(p.c === 4, "should come out of the far portal and finish the move, got c=" + p.c);
    } },

    { name: "the pair counts as one square, so a robot cannot bounce back", run: function () {
      benchGame(bench([["..", "t1", "..", "t1", ".."]]), [{ c: 0, r: 0, face: E }]);
      var p = G.players[0];
      runPlan(p, { kind: "move", dist: 1 });
      assert(p.c === 3, "one square in, straight out the other side, got c=" + p.c);
    } },

    { name: "a robot standing on a portal switches the colour off", run: function () {
      benchGame(bench([["..", "t1", "..", "t1", ".."]]),
        [{ c: 0, r: 0, face: E }, { c: 3, r: 0, face: E }]);
      var p = G.players[0];
      runPlan(p, { kind: "move", dist: 1 });
      assert(p.c === 1, "the far end is occupied, so the colour is dead and this is ordinary floor -- c=" + p.c);
      assert(G.players[1].c === 3, "and the robot standing there is not disturbed");
    } },

    { name: "a lone portal is refused as a transcription error", run: function () {
      var threw = false;
      try { bench([["..", "t1", ".."]]); } catch (e) { threw = /pairs/.test(e.message); }
      assert(threw, "a portal colour appearing once must not validate");
    } },

    // ---- Crash and Burn: oil -----------------------------------------
    { name: "ending a move on oil slides you off it", run: function () {
      benchGame(bench([["..", "L.", "L.", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      var p = G.players[0];
      runPlan(p, { kind: "move", dist: 1 });
      assert(p.c === 3, "it should slide across both oil squares and stop on the first dry one, got c=" + p.c);
      assert(p.damage === 0, "oil does no damage");
    } },

    { name: "starting a move on oil costs a square", run: function () {
      benchGame(bench([["L.", "..", "..", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      runPlan(G.players[0], { kind: "move", dist: 3 });
      assert(G.players[0].c === 2, "a Move 3 off oil carries two, got c=" + G.players[0].c);
    } },

    { name: "a Move 1 that starts on oil goes nowhere, and does not then skid", run: function () {
      benchGame(bench([["L.", "L.", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      runPlan(G.players[0], { kind: "move", dist: 1 });
      assert(G.players[0].c === 0,
        "the move is cancelled outright, and momentum it never had cannot carry it -- c=" + G.players[0].c);
    } },

    { name: "a slide stops against a robot with grip, and shoves one without", run: function () {
      // the blocker is on dry floor: the slide stops short of it
      benchGame(bench([["..", "L.", "L.", "..", ".."]]),
        [{ c: 0, r: 0, face: E }, { c: 3, r: 0, face: E }]);
      runPlan(G.players[0], { kind: "move", dist: 1 });
      assert(G.players[0].c === 2 && G.players[1].c === 3,
        "a robot off the oil is not shoved: " + G.players[0].c + "," + G.players[1].c);

      // the blocker is on the same slick: it gets shoved along
      benchGame(bench([["..", "L.", "L.", "L.", ".."]]),
        [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      runPlan(G.players[0], { kind: "move", dist: 1 });
      assert(G.players[1].c === 4 && G.players[0].c === 3,
        "both should slide, front one first: " + G.players[0].c + "," + G.players[1].c);
    } },

    { name: "oil does not touch rotation", run: function () {
      benchGame(bench([["L."]]), [{ c: 0, r: 0, face: N }]);
      var p = G.players[0];
      runPlan(p, { kind: "turn", turn: 1 });
      assert(p.face === E && p.c === 0 && p.r === 0, "a rotate on oil turns and stays put");
    } },

    // ---- Crash and Burn: presses and burners -------------------------
    { name: "a press flattens what stands on it, but only in its registers", run: function () {
      benchGame(bench([["X3"]]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 0;  pressPass();
      assert(p.alive, "register 1 is not register 3 -- it should still be standing");
      G.register = 2;  pressPass();
      assert(!p.alive, "register 3 is printed on it, so this should have flattened it");
    } },

    { name: "a press with no number is always active", run: function () {
      benchGame(bench([["X."]]), [{ c: 0, r: 0 }]);
      G.register = 1;  pressPass();
      assert(!G.players[0].alive, "no number means every register");
    } },

    { name: "a burner scorches for one, in its registers only", run: function () {
      benchGame(bench([["Fo"]]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 1;  burnerPass();
      assert(p.damage === 0, "register 2 is not one of 1/3/5");
      G.register = 2;  burnerPass();
      assert(p.damage === 1, "register 3 is, so one point -- got " + p.damage);
    } },

    /* The ordering rule, and the reason it is worth a test: put the
       burner back with the other elements and a robot on its last point
       of damage burns to death before the laser that should have
       killed it. Same robot destroyed, different cause, and the archive
       and the shooter's credit both follow the cause. */
    { name: "burners fire after the lasers, not with the other elements", run: function () {
      var order = [], seen = {};
      for (var k in STEP.exec) seen[k] = true;
      assert(seen.presses && seen.burners, "both steps must exist in the phase machine");
      /* Walk the machine from gears and record where each lands. */
      benchGame(bench([[".."]]), [{ c: 0, r: 0 }]);
      G.phase = "exec"; G.step = "gears";
      for (var guard = 0; guard < 8 && G.step && G.step !== "endReg"; guard++) {
        order.push(G.step);
        STEP.exec[G.step]();
      }
      var gi = order.indexOf("gears"), pi = order.indexOf("presses"),
          li = order.indexOf("lasers"), bi = order.indexOf("burners"),
          ti = order.indexOf("touch");
      assert(gi < pi && pi < li, "presses keep their place among the elements: " + order.join(" -> "));
      assert(li < bi, "the burner must come AFTER the lasers: " + order.join(" -> "));
      assert(bi < ti, "and before the flags are touched: " + order.join(" -> "));
    } },

    { name: "every turn is dealt from a reshuffled deck", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0 }]);
      G.deck = PROGRAM_DECK.map(function (c) { return c.id; });
      var parked = G.deck.splice(0, 40);        // last turn's cards, face down
      G.discard = parked;
      G.phase = "turn"; G.step = "deal";
      STEP.turn.deal();
      assert(G.discard.length === 0,
        "the previous turn's cards must be shuffled back before the deal, not left " +
        "in a pile until the deck runs dry -- " + G.discard.length + " were still parked");
      var pool = G.deck.length + G.players[0].hand.length;
      assert(pool === 84, "the whole deck should be in play, got " + pool);
    } },

    { name: "a powered-down robot is dealt no cards", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, poweredDown: true }]);
      G.phase = "turn"; G.step = "deal";
      STEP.turn.deal();
      assert(G.players[0].hand.length === 0, "a powered-down robot programs nothing");
    } },

    // ---- option cards: the dispatcher --------------------------------
    { name: "a 'you may' card parks a choice and applies the answer on the re-run", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, options: ["brakes"] }]);
      var p = G.players[0];
      var ctx = fire(p, "modifyMove", planFor(firstCard("move1")));
      assert(ctx.pending, "the card should have parked a question");
      assert(G.pendingChoices.length === 1, "exactly one choice should be queued, got " + G.pendingChoices.length);
      G.optionAnswers[G.pendingChoices[0].key] = 1;          // "Brake"
      G.pendingChoices.shift();
      var again = fire(p, "modifyMove", planFor(firstCard("move1")));
      assert(!again.pending, "the re-run must not ask the same question again");
      assert(again.dist === 0, "braking should turn a Move 1 into a Move 0, got " + again.dist);
    } },

    { name: "an answered choice fires once, not on every later re-run", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, options: ["brakes"] }]);
      var p = G.players[0];
      fire(p, "modifyMove", planFor(firstCard("move1")));
      G.optionAnswers[G.pendingChoices[0].key] = 1;
      G.pendingChoices.shift();
      fire(p, "modifyMove", planFor(firstCard("move1")));      // consumes it
      var third = fire(p, "modifyMove", planFor(firstCard("move1")));
      assert(third.dist === 1, "a spent choice must not keep applying, got dist " + third.dist);
    } },

    { name: "a robot without the card is never asked", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      var ctx = fire(G.players[0], "modifyMove", planFor(firstCard("move1")));
      assert(!ctx.pending && G.pendingChoices.length === 0, "no option, no question");
    } },

    { name: "a choice key is stable across a save and reload", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, options: ["brakes"] }]);
      fire(G.players[0], "modifyMove", planFor(firstCard("move1")));
      var key = G.pendingChoices[0].key;
      G = JSON.parse(JSON.stringify(G));                       // the save round-trip
      fire(G.players[0], "modifyMove", planFor(firstCard("move1")));
      assert(G.pendingChoices[0].key === key, "the same question must get the same key after a reload");
      assert(G.pendingChoices.length === 1, "and must not be queued twice");
    } },

    // ---- option cards: the effects -----------------------------------
    { name: "Ablative Coat absorbs three damage and then burns off", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, options: ["ablativeCoat"] }]);
      var p = G.players[0];
      damage(p, 2, "laser");
      assert(p.damage === 0, "the first 2 should be absorbed, damage is " + p.damage);
      damage(p, 2, "laser");
      assert(p.damage === 1, "the coat has 1 charge left, so 1 gets through; damage is " + p.damage);
      assert(p.options.length === 0, "the coat should have burned off");
      assert(G.optionDiscard.length === 1, "and gone to the discard");
    } },

    { name: "Power Down Shield stops lasers only while powered down", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, options: ["powerDownShield"] }]);
      var p = G.players[0];
      damage(p, 2, "laser");
      assert(p.damage === 2, "the shield does nothing while running, damage is " + p.damage);
      p.poweredDown = true;
      damage(p, 3, "laser");
      assert(p.damage === 2, "powered down, lasers should do nothing; damage is " + p.damage);
      damage(p, 1, "ram");
      assert(p.damage === 3, "but the shield is not armour against everything");
    } },

    { name: "Extra Memory deals one more card", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, options: ["extraMemory"] }, { c: 0, r: 0 }]);
      G.players[1].c = 1;                                      // keep one robot per square
      G.phase = "turn"; G.step = "deal";
      STEP.turn.deal();
      assert(G.players[0].dealtCount === 10, "9 + 1, got " + G.players[0].dealtCount);
      assert(G.players[1].dealtCount === 9, "the robot without the card gets 9, got " + G.players[1].dealtCount);
    } },

    { name: "Gyroscopic Stabilizer ignores gears but not conveyor curves", run: function () {
      benchGame(bench([["r.", ".."]]), [{ c: 0, r: 0, face: N, options: ["gyroscopicStabilizer"] }]);
      gearPass();
      assert(G.players[0].face === N, "the gear should not have turned it");
      benchGame(bench([["b>", "bv"], ["..", ".."]]), [{ c: 0, r: 0, face: N, options: ["gyroscopicStabilizer"] }]);
      beltPass(1);
      assert(G.players[0].face === E, "a conveyor curve still turns it; facing is " + G.players[0].face);
    } },

    { name: "Ramming Gear hurts the robot you shove", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, options: ["rammingGear"] }, { c: 1, r: 0 }]);
      stepRobot(G.players[0], E, "move");
      assert(G.players[1].c === 2, "the shove should still happen");
      assert(G.players[1].damage === 1, "and cost the shoved robot 1, got " + G.players[1].damage);
      assert(G.players[0].damage === 0, "the rammer takes nothing");
    } },

    { name: "Double-Barreled Laser does 2", run: function () {
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0, face: E, options: ["doubleBarreledLaser"] }, { c: 1, r: 0, face: N }]);
      applyLaserHits(computeLaserHits());
      assert(G.players[1].damage === 2, "expected 2, got " + G.players[1].damage);
    } },

    { name: "Rear-Firing Laser shoots the robot behind you", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: N }, { c: 1, r: 0, face: E, options: ["rearFiringLaser"] }]);
      applyLaserHits(computeLaserHits());
      assert(G.players[0].damage === 1, "the robot behind should be hit, damage " + G.players[0].damage);
    } },

    { name: "High-Power Laser shoots through exactly one wall", run: function () {
      var cells = [["..", "..", "..", ".."]];
      benchGame(bench(cells, ["1,0,E"]), [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: N }]);
      applyLaserHits(computeLaserHits());
      assert(G.players[1].damage === 0, "an ordinary laser is stopped by the wall");
      benchGame(bench(cells, ["1,0,E"]), [{ c: 0, r: 0, face: E, options: ["highPowerLaser"] }, { c: 2, r: 0, face: N }]);
      applyLaserHits(computeLaserHits());
      assert(G.players[1].damage === 1, "the high-power laser goes through it, damage " + G.players[1].damage);
      benchGame(bench(cells, ["1,0,E", "2,0,E"]), [{ c: 0, r: 0, face: E, options: ["highPowerLaser"] }, { c: 3, r: 0, face: N }]);
      applyLaserHits(computeLaserHits());
      assert(G.players[1].damage === 0, "but not through two of them");
    } },

    { name: "Pressor Beam shoves instead of damaging", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E, options: ["pressorBeam"] }, { c: 1, r: 0, face: N }]);
      var hits = computeLaserHits();
      var ctx = fire(G.players[0], "onLaserHit",
        { target: hits[0].target, damage: hits[0].damage, shotDir: hits[0].dir, replaceWith: null });
      assert(ctx.pending, "it should ask first");
      G.optionAnswers[G.pendingChoices[0].key] = 1;
      G.pendingChoices.shift();
      ctx = fire(G.players[0], "onLaserHit",
        { target: hits[0].target, damage: hits[0].damage, shotDir: hits[0].dir, replaceWith: null });
      hits[0].damage = ctx.damage; hits[0].replaceWith = ctx.replaceWith;
      applyLaserHits(hits);
      assert(G.players[1].damage === 0, "no damage when the beam shoves instead");
      assert(G.players[1].c === 2, "the target should have been shoved away, it is at " + G.players[1].c);
    } },

    { name: "Mechanical Arm touches a flag one square away", run: function () {
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0, options: ["mechanicalArm"] }], [{ c: 1, r: 0, n: 1 }]);
      checkpointPass();
      assert(G.players[0].flags === 1, "the arm should have reached the flag, flags " + G.players[0].flags);
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0 }], [{ c: 1, r: 0, n: 1 }]);
      checkpointPass();
      assert(G.players[0].flags === 0, "without the arm it is out of reach");
    } },

    { name: "Superior Archive brings you back with 1 damage", run: function () {
      /* Two cards, because destruction costs you one: the preference
         in destroy() has to spend the other card so the one that acts
         on the respawn survives to act on it. */
      benchGame(bench([["..", ".."]]),
        [{ c: 1, r: 0, archive: { c: 0, r: 0, face: N }, options: ["brakes", "superiorArchive"] }]);
      destroy(G.players[0], "for the test");
      assert(G.players[0].options.length === 1 && G.players[0].options[0].id === "superiorArchive",
        "destruction should have spent the other card, not this one");
      G.phase = "turn"; G.step = "respawn";
      STEP.turn.respawn();
      assert(G.players[0].damage === 1, "expected 1 damage, got " + G.players[0].damage);
    } },

    { name: "Superior Archive is still lost if it is your only card", run: function () {
      /* You must discard one, so a robot holding nothing else spends
         it and comes back on the ordinary 2. Keeping it would be a
         nicer card and a different game. */
      benchGame(bench([["..", ".."]]),
        [{ c: 1, r: 0, archive: { c: 0, r: 0, face: N }, options: ["superiorArchive"] }]);
      destroy(G.players[0], "for the test");
      assert(G.players[0].options.length === 0, "the only card must still be discarded");
      G.phase = "turn"; G.step = "respawn";
      STEP.turn.respawn();
      assert(G.players[0].damage === 2, "back on the ordinary 2, got " + G.players[0].damage);
    } },

    { name: "a wrecked robot loses one option card, not all of them", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0, options: ["brakes", "extraMemory"] }]);
      destroy(G.players[0], "for the test");
      assert(G.players[0].options.length === 1, "one card should survive, " + G.players[0].options.length + " did");
      assert(G.optionDiscard.length === 1, "and exactly one should be discarded");
    } },

    { name: "option cards are conserved across a whole game", run: function () {
      var keepH = UI.headless, keepA = UI.autoHuman;
      UI.headless = true; UI.autoHuman = true;
      UI.wallsChecked = false;
      newGame(11, { startOptions: 2 });
      advance();
      var total = G.optionDeck.length + G.optionDiscard.length;
      for (var i = 0; i < G.players.length; i++) total += G.players[i].options.length;
      UI.headless = keepH; UI.autoHuman = keepA;
      assert(total === OPTION_ROSTER.transcribed,
        "expected " + OPTION_ROSTER.transcribed + " option cards, found " + total);
    } },

    { name: "the table rejects a card bound to a hook that does not exist", run: function () {
      OPTION_DEFS.__bogus = { name: "Bogus", text: "x", hooks: { onNothing: function () {} } };
      OPTION_ROSTER.transcribed++;
      var threw = null;
      try { validateTables(); } catch (e) { threw = e.message; }
      delete OPTION_DEFS.__bogus;
      OPTION_ROSTER.transcribed--;
      assert(threw && /unknown hook/.test(threw), "expected an unknown-hook error, got " + threw);
    } },

    { name: "where two headless belts meet, the join is marked", run: function () {
      /* Heads live on plain straights. Where two headless tiles meet
         there is no head near the join, so the direction across it
         would go unsaid -- and in a run made entirely of turns there
         is no head anywhere at all. */
      function heads(t) {
        return (t.match(/class="pr-mark" d="[^"]*L[^"]*L[^"]*"/g) || []).length;
      }
      function isTurn(g, c, r) {
        var a = beltArt(g, c, r);
        return a.ins.length === 1 && a.ins[0] !== a.exit;
      }

      /* A 2x2 loop: four turns, no straight, no head anywhere. */
      var loop = bench([["b>", "bv"], ["b^", "b<"]]);
      var c, r, marked = 0;
      for (r = 0; r < 2; r++) for (c = 0; c < 2; c++) {
        assert(isTurn(loop, c, r), "the fixture must be all turns; (" + c + "," + r + ") is not");
        if (heads(tileInner(loop, c, r)) === 1) marked++;
      }
      assert(marked === 4, "every join in a headless loop is marked, got " + marked);

      /* Two curves in a row inside an otherwise ordinary run: the
         join between them is marked, and the turn that feeds a plain
         straight is not -- that straight's own head is right there. */
      var esses = bench([["..", "b>", "bv"], ["..", "..", "b<"], ["..", "..", ".."]]);
      assert(isTurn(esses, 2, 0) && isTurn(esses, 2, 1), "fixture needs two curves in a row");
      assert(heads(tileInner(esses, 2, 0)) === 1, "curve into curve marks the join");
      assert(heads(tileInner(esses, 1, 0)) === 1, "a plain straight keeps its own head");

      /* And a turn running into a headed straight adds nothing. */
      var into = bench([["bv", "..", ".."], ["b>", "b>", ".."]]);
      assert(isTurn(into, 0, 1), "fixture needs a turn feeding a straight");
      assert(heads(tileInner(into, 0, 1)) === 0, "no second head beside a straight's own");

      /* Asked directly, because beltSvg only consults marksBoundary on
         tiles it has already found headless -- so the rule's own guard
         against marking a HEADED tile's exit is invisible through the
         rendered output, and an untestable guard is an untested one.
         (1,0) is a plain straight running into a turn. */
      assert(headedRun(beltArt(esses, 1, 0)), "fixture needs a headed straight feeding a turn");
      assert(!headedRun(beltArt(esses, 2, 0)), "and the tile it feeds must be headless");
      assert(!marksBoundary(esses, 1, 0, beltArt(esses, 1, 0)),
        "a headed tile never marks its own exit; its head is already there");
    } },

    { name: "a wall is drawn once, on the line, however many squares own it", run: function () {
      /* wallAt is symmetric, so both neighbours report an interior
         wall. Drawing it per-cell therefore drew it TWICE -- while a
         perimeter wall, having one neighbour, was drawn once, so
         interior walls came out at double the weight of the board's
         own edge. Exactly backwards as a signal. */
      function bars(g) { return (wallSpans(g).match(/class="pr-wall/g) || []).length; }

      var between = bench([["..", ".."]], ["0,0,E"]);
      assert(B.wallAt(between, 0, 0, E) && B.wallAt(between, 1, 0, W),
        "the fixture needs a wall both squares can see");
      assert(bars(between) === 1, "one edge, one bar, got " + bars(between));

      var boxed = bench([[".."]], ["0,0,N", "0,0,E", "0,0,S", "0,0,W"]);
      assert(bars(boxed) === 4, "four edges, four bars, got " + bars(boxed));

      /* And it is emitted against the lattice slot, which for a wall
         between two squares is the FAR square's near edge -- that is
         what puts the bar on the line instead of inside a box. */
      assert(/--c:1;--r:0/.test(wallSpans(between)), "the bar belongs to the edge, not to a square");
    } },

    { name: "a conveyor curve is DRAWN as a curve, and a merge as a merge", run: function () {
      /* A curve rotates the robot on it and a straight belt does not,
         so a curve drawn with a straight arrow hides a rule. It did:
         the painted arrow used to run along the exit axis whatever
         the belt underneath was doing, and the Proving Ground -- five
         curves and a merge on it -- showed not one turn. */
      function art(g, c, r) { return beltSvg(beltArt(g, c, r)); }
      /* Only the PAINTED marks, not the rail and bed underneath them --
         those bend on a curve too, and counting them was how the first
         version of this test failed a board that was drawing correctly. */
      function marks(svgText) {
        var out = [], re = /class="pr-mark" d="([^"]+)"/g, m;
        while ((m = re.exec(svgText))) out.push(m[1]);
        return out;
      }
      function shafts(svgText) {
        return marks(svgText).filter(function (d) { return (d.match(/L/g) || []).length < 2; }).length;
      }
      /* "Curved" means any curve command, not one particular primitive:
         the bed is an arc and the arrow is a quadratic, and which is
         which is a drawing decision the test has no business pinning. */
      function curves(svgText) {
        return marks(svgText).filter(function (d) { return /[QAC]/.test(d); }).length;
      }

      function rails(svgText) { return (svgText.match(/class="pr-rail"/g) || []).length; }

      var straight = bench([["b>", "b>", "b>"]]);
      assert(shafts(art(straight, 1, 0)) === 1, "a straight belt draws one shaft");
      assert(curves(art(straight, 1, 0)) === 0, "and it must not be drawn curved");
      assert(rails(art(straight, 1, 0)) === 2, "a belt has two rails");

      /* Arrives travelling east, leaves north: a left turn. */
      var corner = bench([["..", "b^", ".."], ["b>", "b^", ".."]]);
      assert(curves(art(corner, 1, 1)) === 1, "a curve must be drawn curved");
      /* The rails used to be a fatter stroke of the centreline with the
         bed laid over it, and on a turn the bed's inner edge swallowed
         the inner rail whole -- so a curve had one rail where a
         straight had two, which is what made turns look cramped. */
      assert(rails(art(corner, 1, 1)) === 2, "and it keeps BOTH rails round the bend");

      /* Two feeds, one straight and one turning, one way out. */
      var merge = bench([["..", "bv", ".."], ["b>", "bv", ".."]]);
      var m = art(merge, 1, 1);
      assert(shafts(m) === 2, "a merge draws one shaft per feed, got " + shafts(m));
      assert(curves(m) === 1, "and exactly the side feed bends, got " + curves(m));
      /* Heads belong to plain straights only. A turn already says
         "you rotate" with its curve and a merge already says
         "junction" with its converging lines; an arrowhead on either
         is decoration competing with the thing the tile has to say,
         and the direction is carried by the run it came from. */
      assert(marks(m).length === shafts(m), "a merge carries no arrowhead");
      assert(marks(art(corner, 1, 1)).length === shafts(art(corner, 1, 1)),
        "and neither does a turn");
      assert(marks(art(straight, 1, 0)).length - shafts(art(straight, 1, 0)) === 1,
        "a plain straight belt carries exactly one");

      /* Headless runs are painted edge to edge so consecutive tiles
         join into one line. That continuity is what replaces the
         head, so it is the property worth asserting. */
      var cm = art(corner, 1, 1).match(/class="pr-mark" d="M([\d.]+) ([\d.]+)/);
      assert(cm && (+cm[1] === 0 || +cm[2] === 0 || +cm[1] === 100 || +cm[2] === 100),
        "a headless run starts on the tile edge, so it meets its neighbour");
    } },

    { name: "every custom property the stylesheet uses is defined", run: function () {
      /* An undefined custom property does not fall back to anything --
         it makes the WHOLE declaration invalid at computed-value time.
         So one typo in one var() silently deletes a rule, and the only
         symptom is that something stopped moving.

         That is not hypothetical: --pr-ease was used four times and
         defined never, which removed the robots' movement transition
         and their turn transition together. They teleported for as
         long as the vector renderer has existed, and the bug is
         invisible in the source because every line of it reads
         correctly. */
      var css = CSS;                 // already joined where it is declared
      var used = {}, defined = {}, m, k;
      /* Only uses with NO fallback. var(--x, something) is fine however
         undefined --x is; it is the bare var(--x) that takes the whole
         declaration down with it, which is the thing worth catching. */
      var useRe = /var\(\s*(--pr-[a-z0-9-]+)\s*\)/g;
      while ((m = useRe.exec(css))) used[m[1]] = true;
      var defRe = /(--pr-[a-z0-9-]+)\s*:/g;
      while ((m = defRe.exec(css))) defined[m[1]] = true;
      for (k in TOKENS) {
        defined["--pr-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); })] = true;
      }
      var missing = [];
      for (k in used) if (!defined[k]) missing.push(k);
      assert(missing.length === 0,
        "used with no fallback and never defined, so every rule mentioning them is " +
        "dropped: " + missing.join(", "));
    } },

    { name: "every motion leaves room for the next one to start", run: function () {
      /* The stagger is not an animation: it is the arithmetic between
         two numbers. exec.move waits only GAP before releasing the
         next robot, so a robot is still sliding when its successor
         sets off, and four robots in one register read as an ordered
         cascade rather than a queue of separate little films.

         The moment any gap reaches its own ms, that register silently
         becomes a queue again -- same board, same cards, same log, and
         nothing to see except that priority stopped being legible. The
         deal is the same shape: its gap is what makes the hand arrive
         card after card instead of all at once. The
         settle beat at the end of the step is ms - gap, so a gap ABOVE
         ms would also make it negative and drop the tail of the last
         robot's motion. */
      var k, m, bad = [];
      for (k in MOTION) {
        m = MOTION[k];
        if (!(m.gap < m.ms)) bad.push(k + " (gap " + m.gap + " >= ms " + m.ms + ")");
      }
      assert(bad.length === 0,
        "these cannot overlap, so whatever they animate -- robots, cards -- goes " +
        "strictly one at a time: " + bad.join(", "));
    } },

    { name: "a card's art says what the card does", run: function () {
      /* The art is not decoration: the chevron count IS the distance
         and the arc's direction IS the rotation. A Move 3 drawn with
         two chevrons, or a Rotate L drawn sweeping clockwise, misstates
         the card to anyone reading the picture rather than the label --
         which is the whole reason for putting a picture on it. */
      function chevs(k) { return (cardArt(k).match(/class="pr-cmark"/g) || []).length; }
      /* The tip of the arrowhead, and its wings, so a card can be asked
         which way it actually points rather than which primitive drew
         it -- the shapes have changed three times and the question has
         not. */
      function head(k) {
        var m = /class="pr-cmark" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/.exec(cardArt(k));
        return { wingX: parseFloat(m[1]), wingY: parseFloat(m[2]),
                 tipX: parseFloat(m[3]), tipY: parseFloat(m[4]) };
      }

      var k;
      for (k in CARD_KINDS) {
        assert(cardArt(k).indexOf("<path") >= 0, "card kind " + k + " draws nothing");
      }
      for (k in CARD_KINDS) {
        var d = CARD_KINDS[k];
        if (!d.move) continue;
        assert(chevs(k) === Math.abs(d.move),
          k + " moves " + Math.abs(d.move) + " but draws " + chevs(k) + " chevron(s)");
      }
      /* A rotate card ends pointing the way you will be FACING, so its
         arrowhead goes sideways -- left for Rotate L, right for
         Rotate R. Get that backwards and the card tells the player to
         turn the wrong way. */
      assert(head("left").tipX < head("left").wingX, "Rotate L must point left");
      assert(head("right").tipX > head("right").wingX, "Rotate R must point right");

      /* A move card points up the card; backing up and a U-turn come
         back down, which is the whole content of those two. */
      assert(head("move1").tipY < head("move1").wingY, "a move card points up the card");
      assert(head("uturn").tipY > head("uturn").wingY, "a U-turn comes back down; that is what it does");
      assert(head("back").tipY > head("back").wingY, "and so does backing up");

      /* And the bend clears the arrowhead. Turning the corner inside
         the chevron makes the two read as one smudge at card size. */
      var bend = /Q(\d+) \d+ (\d+) /.exec(cardArt("left"));
      assert(parseFloat(bend[2]) > head("left").wingX + 12,
        "the rotate shaft must run clear of its own arrowhead before it bends");
    } },

    { name: "the table rejects an element nobody drew", run: function () {
      /* A board can transcribe an element the art does not cover, and
         it renders as bare floor: silent, plausible, and wrong in the
         one way a game promising faithful layouts cannot afford. */
      B.ELEMENT_DEFS["\u00a7"] = { name: "undrawn thing", arg: "none", editions: ["classic", "modern"] };
      var threw = null;
      try { validateTables(); } catch (e) { threw = e.message; }
      delete B.ELEMENT_DEFS["\u00a7"];
      assert(threw && /no tile art/.test(threw),
        "expected the missing-art error, got " + threw);
    } },

    { name: "the table rejects a hook that no card uses", run: function () {
      HOOKS.push("onNeverFired");
      var threw = null;
      try { validateTables(); } catch (e) { threw = e.message; }
      HOOKS.pop();
      assert(threw && /no option card uses it/.test(threw),
        "a hook nothing fires is dead code that reads as coverage; expected an error, got " + threw);
    } },

    // ---- multi-board assembly and rotation ---------------------------
    { name: "a quarter turn rotates conveyors, lasers and walls together", run: function () {
      /* Every printed course uses rotated boards, so this is not an
         abstract property -- get it wrong and a transcribed board is
         correct while the course built from it is not. */
      var g = B.parsePic("shuntYard", B.BOARD_SPECS.shuntYard);
      var t = B.rotateGrid(g, 1);
      assert(t.w === g.h && t.h === g.w, "dimensions should swap on an odd quarter turn");

      // (2,2) is an east-running express; a turn clockwise sends it south.
      assert(B.codeAt(g, 2, 2) === "B>", "test fixture moved: (2,2) should be an east express");
      assert(B.codeAt(t, 9, 2) === "Bv", "rotated express should run south at (9,2), found " + B.codeAt(t, 9, 2));

      // The west-facing laser on the east edge becomes a north-facing one on the south edge.
      var L = null;
      for (var i = 0; i < t.lasers.length; i++) if (t.lasers[i].c === 5 && t.lasers[i].r === 11) L = t.lasers[i];
      assert(L, "the laser from (11,6) should land at (5,11) after a clockwise turn");
      assert(L.d === N, "and should face north, faces " + L.d);
      assert(B.wallAt(t, 5, 11, B.opposite(N)), "and must still have a wall behind it to mount on");
    } },

    { name: "two boards assemble side by side without disturbing each other", run: function () {
      var C = B.buildCourse("crossTown");
      var g = B.parsePic("shuntYard", B.BOARD_SPECS.shuntYard);
      assert(C.w === 24, "two 12-wide boards make a 24-wide course, got " + C.w);
      // The right-hand board's contents should appear offset by 12, unchanged.
      for (var r = 0; r < 12; r++) {
        for (var c = 0; c < 12; c++) {
          assert(B.codeAt(C, c + 12, r) === B.codeAt(g, c, r),
            "stamped tile (" + (c + 12) + "," + r + ") does not match the board it came from");
        }
      }
      // And the left-hand board is still itself.
      var p = B.parsePic("provingGround", B.BOARD_SPECS.provingGround);
      assert(B.codeAt(C, 1, 0) === B.codeAt(p, 1, 0), "the left board was disturbed by the stamp");
    } },

    { name: "walls agree across a seam between two boards", run: function () {
      /* A wall is one lattice slot, so a wall on the east edge of the
         left board and the west edge of the right board are the same
         slot. Stamping must not end up with them disagreeing. */
      var C = B.buildCourse("crossTown");
      for (var r = 0; r < C.h; r++) {
        if (B.isVoid(C, 11, r) || B.isVoid(C, 12, r)) continue;
        assert(B.wallAt(C, 11, r, E) === B.wallAt(C, 12, r, W),
          "the seam at row " + r + " disagrees with itself");
      }
    } },

    { name: "every shipped course can actually be played", run: function () {
      /* A course that cannot be finished is indistinguishable from one
         nobody has tried, and adding boards is exactly when that
         happens. */
      var keepH = UI.headless, keepA = UI.autoHuman;
      UI.headless = true; UI.autoHuman = true;
      var bad = [];
      for (var id in B.COURSES) {
        var won = 0;
        for (var seed = 1; seed <= 6; seed++) {
          UI.wallsChecked = false;
          newGame(seed, { course: id });
          advance();
          if (G.winner !== null && G.winner !== undefined) won++;
        }
        if (!won) bad.push(id);
      }
      UI.headless = keepH; UI.autoHuman = keepA;
      assert(!bad.length, "no game was ever won on: " + bad.join(", "));
    } },

    // ---- the editor's export -----------------------------------------
    { name: "a board survives a round trip through the editor's export", run: function () {
      /* The editor's entire value is that its output can be pasted back
         without correction. If parse -> format -> parse is not a fixed
         point, a transcription quietly changes every time it is opened. */
      var id = "provingGround", spec = B.BOARD_SPECS[id];
      var g = B.parsePic(id, spec);
      var pic = B.gridToPic(g);
      assert(JSON.stringify(pic) === JSON.stringify(spec.pic),
        "formatting the picture back did not reproduce the source picture");
      var again = B.parsePic(id, {
        w: g.w, h: g.h, pic: pic,
        lasers: g.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; })
      });
      /* Same metadata to both: the board DATA is what has to be a fixed
         point, and a re-parse of a bare picture legitimately carries no
         name or notes of its own. */
      var meta = { name: spec.name, origin: spec.origin, notes: spec.notes };
      assert(B.formatBoard(id, again, meta) === B.formatBoard(id, g, meta),
        "a second trip through the editor changed the board");
    } },

    { name: "the editor's export names every wall exactly once", run: function () {
      /* A wall lives in one lattice slot, so emitting and re-reading it
         must not duplicate or drop it -- the failure a per-tile wall
         list invites, and the reason the format is a picture. */
      var g = B.parsePic("provingGround", B.BOARD_SPECS.provingGround);
      var again = B.parsePic("x", { w: g.w, h: g.h, pic: B.gridToPic(g), lasers: [] });
      var walls = 0, c, r, d;
      for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) for (d = 0; d < 4; d++) {
        if (B.wallAt(g, c, r, d) !== B.wallAt(again, c, r, d)) {
          assert(false, "wall on side " + d + " of (" + c + "," + r + ") did not survive the export");
        }
        if (B.wallAt(g, c, r, d)) walls++;
      }
      assert(walls > 0, "the test board has no walls, so this proves nothing");
    } },

    // ---- conservation ----------------------------------------------
    { name: "destroying a robot returns all of its cards to the discard", run: function () {
      benchGame(bench([[".."]]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      p.hand = G.deck.splice(0, 5);
      p.registers[0] = G.deck.pop();
      p.registers[1] = G.deck.pop();
      destroy(p, "for the test");
      var total = G.deck.length + G.discard.length + p.hand.length;
      assert(total === 84, "cards leaked when a robot was destroyed: " + total + "/84");
    } }
  ];

  function ruleTests() {
    var keepG = G, keepC = UI.course, keepH = UI.headless;
    UI.headless = true;
    var out = { total: RULE_TESTS.length, passed: 0, failed: [] };
    for (var i = 0; i < RULE_TESTS.length; i++) {
      try { RULE_TESTS[i].run(); out.passed++; }
      catch (e) { out.failed.push({ name: RULE_TESTS[i].name, error: e.message }); }
    }
    G = keepG; UI.course = keepC; UI.headless = keepH; UI.wallsChecked = false;
    return out;
  }

  /* ============================================================
     HEADLESS SIM
     Bot-vs-bot games to completion with the invariants armed. This
     is the gate the rules engine has to pass before anything is
     wired to a screen: crashes and rule violations are far cheaper
     to find at 200 games a second than by playing.
     ============================================================ */
  function runSim(n, opts, seed) {
    n = n || 20; seed = seed === undefined ? 1 : seed;
    opts = opts || {};
    var wasHeadless = UI.headless, wasAuto = UI.autoHuman;
    UI.headless = true; UI.autoHuman = true;
    var out = {
      games: 0, wins: {}, crashes: [], unfinished: 0,
      turns: { min: Infinity, max: 0, total: 0 },
      deaths: 0, flagsTouched: 0
    };
    for (var s = seed; s < seed + n; s++) {
      try {
        UI.wallsChecked = false;
        newGame(s, opts);
        advance();
        out.games++;
        if (G.unfinished) out.unfinished++;
        if (G.winner !== null) out.wins[G.players[G.winner].name] = (out.wins[G.players[G.winner].name] || 0) + 1;
        out.turns.min = Math.min(out.turns.min, G.turn);
        out.turns.max = Math.max(out.turns.max, G.turn);
        out.turns.total += G.turn;
        for (var i = 0; i < G.players.length; i++) {
          out.deaths += START_LIVES - G.players[i].lives;
          out.flagsTouched += G.players[i].flags;
        }
      } catch (e) {
        out.crashes.push({ seed: s, turn: G ? G.turn : -1, at: G ? G.phase + "." + G.step : "?", error: e.message });
      }
    }
    out.turns.avg = out.games ? +(out.turns.total / out.games).toFixed(1) : 0;
    UI.headless = wasHeadless; UI.autoHuman = wasAuto;
    return out;
  }

  /* ============================================================
     STYLE
     Injected rather than shipped in index.html so the shell stays a
     shell and the game is one drop-in script.
     ============================================================ */
  var CSS = [
    ".pr-root{" + Object.keys(TOKENS).map(function (k) {
      return "--pr-" + k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }) + ":" + TOKENS[k];
    }).join(";") + ";",
    /* Not a colour, so it is not in TOKENS, but it is referenced like
       one -- and an undefined custom property does not fall back, it
       voids the whole declaration it appears in. Leaving this out
       silently removed the robots' movement AND turn transitions: they
       teleported, and the winding-rotation fix had nothing to animate. */
    "--pr-ease:cubic-bezier(.25,1,.5,1);",
    "background:var(--pr-bg);color:var(--pr-ink);font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;",
    "display:flex;flex-direction:column;gap:10px;align-items:center;padding:14px;box-sizing:border-box;",
    "overflow-x:auto}",
    ".pr-root *{box-sizing:border-box}",
    /* A class that sets display beats the user agent's [hidden] rule on
       specificity, so .pr-curtain{display:flex} quietly defeats
       curtain.hidden and covers the whole page forever. Anything here
       toggled with .hidden needs this. */
    ".pr-root [hidden]{display:none!important}",
    ".pr-root button{font:inherit;color:inherit;background:var(--pr-panel);border:1px solid var(--pr-border);",
    "padding:4px 10px;cursor:pointer}",
    ".pr-root button:hover:not(:disabled){border-color:var(--pr-accent);color:var(--pr-text)}",
    ".pr-root button:disabled{opacity:.35;cursor:default}",
    ".pr-root button:focus-visible,.pr-cell:focus-visible{outline:2px solid var(--pr-accent);outline-offset:1px}",

    /* ---- hud ---- */
    ".pr-hud{display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center;width:100%}",
    ".pr-title{color:var(--pr-accent);letter-spacing:2px;font-size:15px;margin:0}",
    ".pr-phase{color:var(--pr-warn)}",
    ".pr-hud-spacer{flex:1 1 auto}",

    /* ---- layout ---- */
    /* overflow:hidden is load-bearing. Without it the side column
       spills out of the clamped row, re-inflating the document below
       it -- and "below the row" is exactly what the height budget
       measures, so the budget ends up measuring its own overflow. */
    ".pr-main{display:flex;gap:12px;align-items:flex-start;width:100%;justify-content:center;",
    "overflow:hidden}",
    /* Wide enough for five registers in a row and the hand under them:
       five cards plus gaps is what sets this number, not taste. */
    ".pr-side{width:470px;flex:0 0 470px;display:flex;flex-direction:column;gap:8px;min-height:0}",
    ".pr-side{overflow-y:auto}",
    ".pr-side .pr-panel:last-child{flex:1 1 0;display:flex;flex-direction:column;min-height:0}",
    ".pr-side .pr-program{flex:0 0 auto}",
    ".pr-side .pr-program{width:100%}",
    /* Below this the two columns cannot both have their axis, so the
       board goes back on top and the page scrolls -- which is worse,
       and still better than a board squeezed to nothing. */
    "@media (max-width:1180px){.pr-main{flex-direction:column;align-items:center}",
    ".pr-side{width:100%;max-width:640px;flex:none}}",

    /* ---- the board ----
       Three layers, all DOM. The grid of cells IS the board now: it
       was always there, invisible, carrying the hit targets and the
       ARIA labels, while a canvas underneath drew the same 288 tiles
       a second time. Deleting the canvas deleted the duplication. */
    ".pr-stage{position:relative;border:1px solid var(--pr-border);background:var(--pr-bg);flex:0 0 auto}",
    ".pr-grid{position:absolute;left:0;top:0;display:grid;",
    "grid-template-columns:repeat(var(--cols),var(--tile));grid-auto-rows:var(--tile)}",

    ".pr-cell{position:relative;border:0;padding:0;cursor:default;overflow:hidden;",
    "background:var(--pr-floor);color:var(--pr-ink);",
    "box-shadow:inset 0 0 0 1px var(--pr-line)}",
    ".pr-void{background:var(--pr-bg);box-shadow:none}",

    /* ---- tile art ----
       Solid shapes, not line work. Each element owns a hue and keeps
       it everywhere it appears, so the legend, the board and the help
       agree without anyone maintaining that agreement. */
    ".pr-art{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;fill:none}",
    ".pr-art .pr-num{fill:var(--pr-bg);stroke:none;font:700 34px ui-monospace,Menlo,Consolas,monospace;",
    "text-anchor:middle;dominant-baseline:middle}",

    /* Conveyors: rail, then bed over it so only the rail's edges
       show, then the arrow painted on the bed. */
    ".pr-art .pr-bed{stroke-width:68;stroke-linecap:butt;stroke-linejoin:round}",
    ".pr-art .pr-rail{stroke-width:7;stroke-linecap:butt}",
    ".pr-art .pr-mark{stroke-width:9;stroke-linecap:round;stroke-linejoin:round}",
    ".pr-belt .pr-rail{stroke:var(--pr-rust)}",
    ".pr-belt .pr-bed{stroke:var(--pr-belt-bed)}",
    ".pr-belt .pr-mark{stroke:var(--pr-warn)}",
    ".pr-express .pr-rail{stroke:var(--pr-steel)}",
    ".pr-express .pr-bed{stroke:var(--pr-express-bed)}",
    ".pr-express .pr-mark{stroke:var(--pr-accent)}",

    /* Gears: a filled cog with the direction arrow cut across it. */
    ".pr-gear .pr-cog{fill:var(--pr-steel);opacity:.5}",
    ".pr-gear .pr-hub{fill:var(--pr-plate)}",
    ".pr-gear .pr-turn{stroke:var(--pr-accent);stroke-width:8;fill:none;",
    "stroke-linecap:round;stroke-linejoin:round}",

    /* Pushers: a hazard-striped ram on the wall it is bolted to. */
    /* The ram is the moving part and has to out-weigh the plate it
       comes out of, or the tile reads as a wall with a scratch on it. */
    ".pr-pusher .pr-ram-base{fill:var(--pr-hazard);stroke:var(--pr-hazard-dark);stroke-width:3}",
    ".pr-pusher .pr-ram{stroke:var(--pr-steel);stroke-width:30;stroke-linecap:butt}",
    ".pr-pusher .pr-ram-head{fill:var(--pr-steel);stroke:var(--pr-steel);stroke-width:6;",
    "stroke-linejoin:round}",

    ".pr-repair .pr-plate,.pr-upgrade .pr-plate,.pr-dock .pr-plate{fill:var(--pr-plate)}",
    ".pr-repair .pr-tool{stroke:var(--pr-good);stroke-width:13;stroke-linecap:round}",
    ".pr-upgrade .pr-tool{stroke:var(--pr-violet);stroke-width:13;stroke-linecap:round}",
    ".pr-upgrade .pr-tool-ring{fill:none;stroke:var(--pr-violet);stroke-width:6}",
    ".pr-dock .pr-plate{fill:var(--pr-panel-alt);stroke:var(--pr-border);stroke-width:3}",
    ".pr-dock .pr-num{fill:var(--pr-dim)}",

    ".pr-pit .pr-shaft{fill:#161c2a}",
    ".pr-pit .pr-shaft-2{fill:#20283a}",
    ".pr-pit .pr-void-floor{fill:#000}",
    ".pr-flag .pr-pole{fill:var(--pr-steel)}",
    ".pr-flag .pr-banner{fill:var(--pr-warn);stroke:var(--pr-bg);stroke-width:3}",
    /* The numeral is the point of the tile, so it is sized off the
       banner rather than off the other numbers on the board. */
    ".pr-flag .pr-num{fill:#120c00;font-size:44px;font-weight:700}",
    ".pr-emitter .pr-mount{fill:var(--pr-danger)}",

    /* The hazard stripe, shared by everything that will hurt you: the
       face of a wall, the frame of a pit, the head of a ram. One
       definition, so they cannot drift apart. */
    ".pr-root{--pr-stripe:repeating-linear-gradient(-45deg,var(--pr-hazard) 0 5px,",
    "var(--pr-hazard-dark) 5px 10px)}",
    ".pr-t-express,.pr-t-belt{background:var(--pr-panel-alt)}",
    /* Which registers a pusher fires on is a rule, not decoration, so
       it is stamped on the tile instead of left to the legend. */
    ".pr-oil .pr-oil{fill:#0a0d16;stroke:var(--pr-concrete);stroke-width:1.5;opacity:.95}",
    ".pr-oil .pr-oil-sheen{fill:var(--pr-accent);opacity:.32}",
    ".pr-press .pr-shaft{fill:var(--pr-bg)}",
    ".pr-press .pr-press-ram{fill:var(--pr-concrete);stroke:var(--pr-bg);stroke-width:3}",
    ".pr-press .pr-press-bolt{fill:var(--pr-danger)}",
    ".pr-burner .pr-flame{fill:var(--pr-danger)}",
    ".pr-burner .pr-flame-core{fill:var(--pr-warn)}",
        ".pr-rule-group{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--pr-accent);",
    "font-weight:normal;margin:14px 0 2px;border-top:1px solid var(--pr-border);padding-top:10px}",
        ".pr-pushreg{position:absolute;left:2px;top:1px;font-size:9px;line-height:1;letter-spacing:.5px;",
    "color:var(--pr-hazard);background:var(--pr-bg);padding:1px 2px;pointer-events:none;z-index:2}",

    /* ---- walls ----
       Raised, striped, and casting a shadow onto the square they
       block. A wall you can see standing up is a wall you do not try
       to drive through, which is the whole reason for the depth. */
    ".pr-walls{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;",
    "--wt:calc(var(--tile) * 0.19)}",
    /* Centred on the edge, so half of it lies in each square. The
       striped face is the warning; the concrete edge is the thing the
       warning is painted on, and it is what gives the bar an outside
       rather than just a colour. The shadow falls both ways, because
       the wall is standing on the line rather than against a side. */
    ".pr-wall{position:absolute;background:var(--pr-stripe);pointer-events:none;",
    "box-sizing:border-box;border:2px solid var(--pr-concrete);",
    "box-shadow:0 0 6px 1px rgba(0,0,0,.7);",
    "left:calc(var(--c) * var(--tile));top:calc(var(--r) * var(--tile) - var(--wt) / 2);",
    "width:var(--tile);height:var(--wt)}",
    ".pr-wall.pr-v{left:calc(var(--c) * var(--tile) - var(--wt) / 2);",
    "top:calc(var(--r) * var(--tile));width:var(--wt);height:var(--tile)}",

    /* Beams cross tiles, so they are their own layer. --off is a
       fraction of a tile, which is what lets several parallel beams
       share a square without arithmetic in the markup. */
    ".pr-beams{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}",
    ".pr-beam{position:absolute;background:var(--pr-danger);opacity:.30;",
    "width:2px;height:var(--tile);",
    "left:calc((var(--c) + var(--off)) * var(--tile) - 1px);top:calc(var(--r) * var(--tile))}",
    ".pr-beam.pr-h{width:var(--tile);height:2px;",
    "left:calc(var(--c) * var(--tile));top:calc((var(--r) + var(--off)) * var(--tile) - 1px)}",
    ".pr-beam.pr-live{opacity:1;box-shadow:0 0 6px var(--pr-danger)}",

    /* ---- robots ---- */
    ".pr-pieces{position:absolute;left:0;top:0;pointer-events:none}",
    /* THE SAME SQUARE, TRAVELLED SEVERAL DIFFERENT WAYS.
       A card drives you and eases out, because you chose it. A belt
       carries you at constant speed, because the machinery does not
       accelerate for your benefit. A pusher shoves you, fast and
       abrupt. The distance is identical, so the timing is the only
       thing that can say which of them just happened -- and the
       duration is a property rather than a class so the speed setting
       can scale it. */
    ".pr-piece{position:absolute;width:var(--tile);height:var(--tile);",
    "transition:left var(--pr-move-ms,.22s) var(--pr-move-ease,var(--pr-ease)),",
    "top var(--pr-move-ms,.22s) var(--pr-move-ease,var(--pr-ease)),",
    "opacity .3s,transform .3s}",
    ".pr-piece svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;",
    "transition:transform var(--pr-move-ms,.22s) var(--pr-move-ease,var(--pr-ease))}",
    ".pr-piece .pr-hull{fill:var(--livery-dark,var(--pr-bg));stroke:currentColor;stroke-width:6;",
    "stroke-linejoin:round}",
    ".pr-piece .pr-nose{fill:currentColor;stroke:none}",
    ".pr-piece .pr-eye{fill:currentColor;stroke:none;opacity:.55}",
    /* Going into a pit or over the edge is a fall, not a fade. */
    ".pr-piece.pr-dead{opacity:0;transform:scale(.25) rotate(150deg);",
    "transition:opacity .45s ease-in,transform .45s cubic-bezier(.5,0,1,.6)}",
    ".pr-piece.pr-hit svg{animation:pr-hit .42s steps(1,end) 3}",
    "@keyframes pr-hit{0%{filter:brightness(3.4)}50%{filter:none}}",
    ".pr-piece.pr-down .pr-hull{stroke-dasharray:9 7}",
    ".pr-piece.pr-down svg{opacity:.5}",
    ".pr-archive{position:absolute;width:var(--tile);height:var(--tile);",
    "border:1px dashed currentColor;opacity:.4;pointer-events:none}",

    /* ---- side panels ---- */
    ".pr-panel{background:var(--pr-panel);border:1px solid var(--pr-border);padding:8px}",
    ".pr-panel h2{font-size:11px;letter-spacing:1px;margin:0 0 6px;color:var(--pr-accent);font-weight:normal}",
    ".pr-bot{display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px solid var(--pr-border)}",
    ".pr-bot:first-of-type{border-top:0}",
    ".pr-swatch{width:12px;height:12px;flex:0 0 12px}",
    ".pr-bot-name{flex:1 1 auto;color:var(--pr-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pr-bot.pr-me .pr-bot-name{color:var(--pr-accent)}",
    ".pr-bot.pr-gone{opacity:.4}",
    ".pr-pips{display:flex;gap:1px}",
    ".pr-pip{width:4px;height:10px;background:var(--pr-border)}",
    ".pr-pip.on{background:var(--pr-danger)}",
    ".pr-pip.life{background:var(--pr-accent)}",
        /* No floor on the log. It is the one panel with no natural end, so
       it is the one that should absorb whatever height is left over --
       generous on a tall screen, a few lines on a short one. Give it a
       minimum and it stops being the thing that gives, and the column
       scrolls instead, which hides the cards. */
    ".pr-log{flex:1 1 0;min-height:0;overflow-y:auto;font-size:11px;line-height:1.45}",
    ".pr-log div{padding:1px 0;border-bottom:1px solid rgba(255,255,255,.04)}",
    ".pr-log .reg{color:var(--pr-accent)}",

    /* ---- program bar ---- */
    ".pr-program{display:flex;flex-direction:column;gap:8px;align-items:center;width:100%}",
    ".pr-regs,.pr-hand{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}",
    ".pr-hand{min-height:76px}",
    /* One tinted box per section, the grouping PumaTriage uses for
       staff and tools: set --pr-tint and the hairline, the ground and
       the heading all follow from it. The two rows hold the same
       object -- a card -- and a card moves between them, so the box is
       what says which row you are looking at without having to infer
       it from whatever happens to be sitting in it. */
    ".pr-row{--pr-tint:var(--pr-accent);display:flex;flex-direction:column;align-items:center;",
    "gap:6px;width:100%;box-sizing:border-box;border-radius:6px;padding:6px 10px 8px;",
    "border:1px solid color-mix(in srgb, var(--pr-tint) 28%, transparent);",
    "background:color-mix(in srgb, var(--pr-tint) 6%, var(--pr-bg))}",
    /* Amber for the registers, because amber already means "committed
       to" on this board -- it is the pushers and the flags. Cyan for
       the hand, which is everything still open to you. */
    ".pr-row-regs{--pr-tint:var(--pr-warn)}",
    ".pr-row-hand{--pr-tint:var(--pr-accent)}",
    ".pr-row h2{margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;",
    "color:var(--pr-tint);font-weight:normal}",

    /* ---- program cards ----
       A card is a bordered plate with its kind on the top edge, the
       card-panel language PumaTriage uses. It has two faces and turns
       over: what a register holds is secret once it is committed, and
       the board game says so by putting the card face down. */
    ".pr-card{width:80px;height:72px;perspective:600px;background:none;border:0;padding:0;",
    "position:relative;flex:0 0 auto}",
    ".pr-card .pr-faces{position:absolute;inset:0;transform-style:preserve-3d;",
    "transition:transform .42s var(--pr-ease,cubic-bezier(.25,1,.5,1))}",
    ".pr-card.pr-down .pr-faces{transform:rotateY(180deg)}",
    ".pr-face{position:absolute;inset:0;backface-visibility:hidden;",
    "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;",
    "border:1px solid var(--pr-border);border-top:3px solid var(--pr-kind,var(--pr-border));",
    "background:var(--pr-panel-alt)}",
    ".pr-face.pr-back{transform:rotateY(180deg);border-top-color:var(--pr-border);",
    "background:repeating-linear-gradient(-45deg,var(--pr-panel) 0 6px,var(--pr-panel-alt) 6px 12px)}",
    ".pr-face.pr-back::after{content:\"\";width:22px;height:22px;border:2px solid var(--pr-border);",
    "border-radius:50%;box-shadow:inset 0 0 0 3px var(--pr-panel)}",
    ".pr-card b{color:var(--pr-text);font-weight:normal;font-size:11px;letter-spacing:.5px;",
    "line-height:1.1}",
    ".pr-card span.pr-pri{font-size:9px;color:var(--pr-dim);line-height:1}",
    /* The art carries the card's kind colour, the same way a tile's
       art carries its element's. */
    ".pr-cart{width:34px;height:34px;display:block;color:var(--pr-kind,var(--pr-ink))}",
    ".pr-cart .pr-cshaft{stroke:currentColor;stroke-width:8;stroke-linecap:round;fill:none}",
    ".pr-cart .pr-cmark{stroke:currentColor;stroke-width:8;stroke-linecap:round;",
    "stroke-linejoin:round;fill:none}",
    /* Each kind keeps one hue everywhere it appears. */
    ".pr-k-move1,.pr-k-move2,.pr-k-move3{--pr-kind:var(--pr-accent)}",
    ".pr-k-back{--pr-kind:var(--pr-rust)}",
    ".pr-k-left,.pr-k-right{--pr-kind:var(--pr-violet)}",
    ".pr-k-uturn{--pr-kind:var(--pr-warn)}",
    /* In hand: pickable, and draggable. */
    ".pr-hand .pr-card{cursor:grab}",
    ".pr-hand .pr-card:hover .pr-face{border-color:var(--pr-accent)}",
    ".pr-card.pr-dragging{opacity:.35;cursor:grabbing}",
    /* Dealt cards arrive one after another rather than all at once:
       the stagger is what says WHICH cards are new, because a hand
       that fades in together says only that something changed. The
       index is set per card, so the delay is positional -- card 0
       lands first and the rest follow it across the row. */
    ".pr-card.pr-dealt{animation:pr-deal var(--pr-deal-ms,340ms) var(--pr-ease) both;",
    "animation-delay:calc(var(--pr-deal-i,0) * var(--pr-deal-gap,55ms))}",
    "@keyframes pr-deal{0%{opacity:0;transform:translate(-38px,-18px) rotate(-9deg) scale(.88)}",
    "60%{opacity:1}",
    "100%{opacity:1;transform:none}}",
    /* ---- registers ----
       A slot is a landing place: dashed while empty, solid once it
       holds something, and lit while a card is over it. */
    ".pr-slot{width:80px;height:72px;border:1px dashed var(--pr-border-lit);display:flex;",
    "align-items:center;justify-content:center;background:var(--pr-panel);position:relative;",
    "padding:0;flex:0 0 auto}",
    ".pr-slot.pr-filled{border-color:transparent;background:none}",
    ".pr-slot.pr-over{border-color:var(--pr-accent);border-style:solid;",
    "box-shadow:0 0 10px color-mix(in srgb,var(--pr-accent) 45%,transparent)}",
    ".pr-slot .pr-n{position:absolute;top:-13px;left:0;font-size:9px;color:var(--pr-ink);",
    "letter-spacing:1px;z-index:2}",
    ".pr-slot.pr-next .pr-n{color:var(--pr-accent)}",
    ".pr-slot.pr-locked{border-style:solid;border-color:var(--pr-danger)}",
    ".pr-slot.pr-locked .pr-n{color:var(--pr-danger);opacity:1}",
    ".pr-slot.pr-next{border-color:var(--pr-accent)}",
    ".pr-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}",
    ".pr-controls .on{border-color:var(--pr-warn);color:var(--pr-warn)}",
    ".pr-hint{font-size:11px;opacity:.7;text-align:center;min-height:1.4em}",
    ".pr-choice{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;",
    "border:1px solid var(--pr-warn);background:var(--pr-panel);padding:6px 10px;max-width:640px}",
    ".pr-choice b{color:var(--pr-warn);font-weight:normal}",
    ".pr-choice span{color:var(--pr-text)}",
    ".pr-opts{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;font-size:11px}",
    ".pr-opt{border:1px solid var(--pr-border);background:var(--pr-panel);padding:2px 8px;color:var(--pr-warn);cursor:help}",

    /* ---- banner ---- */
    ".pr-banner{width:100%;text-align:center;padding:10px;border:1px solid var(--pr-warn);",
    "color:var(--pr-warn);background:var(--pr-panel)}",
    ".pr-banner b{color:var(--pr-text);font-weight:normal}",

    ".pr-err{color:var(--pr-danger);white-space:pre-wrap;font-size:12px;max-width:640px}",
    /* The legend's swatches, now in the help table's first column. */
    ".pr-leg-art{position:relative;width:24px;height:24px;display:block;",
    "background:var(--pr-floor);box-shadow:inset 0 0 0 1px var(--pr-line)}",
    ".pr-leg-art .pr-pushreg{display:none}",
    ".pr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    /* modals */
    ".pr-overlay{position:fixed;inset:0;z-index:40;background:rgba(3,5,12,.86);display:flex;",
    "align-items:center;justify-content:center;padding:20px}",
    ".pr-modal{background:var(--pr-panel);border:1px solid var(--pr-accent);padding:16px;",
    "max-width:680px;width:100%;max-height:86vh;overflow-y:auto;",
    "font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;color:var(--pr-ink)}",
    ".pr-modal h2{margin:0 0 10px;font-size:13px;letter-spacing:2px;color:var(--pr-accent);font-weight:normal}",
    ".pr-modal p{margin:0 0 10px}",
    ".pr-modal table{border-collapse:collapse;width:100%;margin:0 0 10px;font-size:12px}",
    ".pr-modal th{text-align:left;color:var(--pr-accent);font-weight:normal;border-bottom:1px solid var(--pr-border);padding:3px 6px 3px 0}",
    ".pr-modal td{padding:3px 6px 3px 0;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}",
    ".pr-modal td:first-child{color:var(--pr-text);white-space:nowrap}",
    ".pr-steps{margin:0;padding-left:20px}.pr-steps li{margin:0 0 7px}",
    ".pr-steps b{color:var(--pr-text);font-weight:normal}",
    ".pr-tabs,.pr-presets{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 10px;align-items:center}",
    ".pr-set-label{font-size:10px;opacity:.6;width:100%;margin-top:4px}",
    ".pr-tabs .on,.pr-presets .on{border-color:var(--pr-accent);color:var(--pr-accent)}",
    ".pr-help-body{min-height:180px}",
    ".pr-modal-foot{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px}",
    ".pr-rule{margin:0 0 10px}",
    ".pr-rule-head{display:flex;justify-content:space-between;align-items:baseline}",
    ".pr-rule-head b{color:var(--pr-text);font-weight:normal}",
    ".pr-rule-val{color:var(--pr-accent)}",
    ".pr-harder{color:var(--pr-danger);font-style:normal;font-size:10px}",
    ".pr-rule-desc{font-size:11px;opacity:.7}",
    ".pr-rule input[type=range]{width:100%;accent-color:var(--pr-accent)}",
    ".pr-about{text-align:center}.pr-about a{color:var(--pr-accent)}",
    /* hot seat */
    ".pr-curtain{position:fixed;inset:0;z-index:50;background:var(--pr-bg);display:flex;",
    "flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px}",
    ".pr-curtain h2{color:var(--pr-accent);letter-spacing:2px;font-size:16px;margin:0}",
    ".pr-curtained .pr-main,.pr-curtained .pr-program{filter:blur(10px)}",
    /* editor */
    ".pr-ed-panel{display:flex;flex-direction:column;gap:6px;width:100%;max-width:1000px}",
    ".pr-ed-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-size:11px}",
    ".pr-ed-row span{opacity:.7}",
    ".pr-ed-row .on{border-color:var(--pr-accent);color:var(--pr-accent)}",
    ".pr-ed-row input[type=text]{background:var(--pr-panel);border:1px solid var(--pr-border);",
    "color:var(--pr-text);font:inherit;padding:3px 6px}",
    ".pr-ed-row input[type=range]{width:90px;accent-color:var(--pr-accent)}",
    ".pr-ed-stage{position:relative;border:1px solid var(--pr-border);flex:0 0 auto}",
    ".pr-ed-stage .pr-grid,.pr-ed-stage .pr-beams,.pr-ed-stage .pr-walls{position:absolute;left:0;top:0}",
    ".pr-ed-under{position:absolute;pointer-events:none;image-rendering:auto;z-index:1}",
    ".pr-ed-grid{position:absolute;left:0;top:0;display:grid;z-index:2}",
    ".pr-ed-cell{border:1px solid rgba(84,242,255,.12);cursor:crosshair}",
    ".pr-ed-cell:hover{background:rgba(84,242,255,.12)}",
    ".pr-ed-ok{color:var(--pr-accent);font-size:11px}",
    ".pr-ed-bad{color:var(--pr-danger);font-size:11px}",
    ".pr-ed-out{width:100%;background:var(--pr-bg);color:var(--pr-ink);border:1px solid var(--pr-border);",
    "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:8px}",
    "@media (prefers-reduced-motion:reduce){.pr-root *{animation:none!important;transition:none!important}}"
  ].join("");

  function injectCSS() {
    if (document.getElementById("pr-style")) return;
    var s = document.createElement("style");
    s.id = "pr-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ============================================================
     SAVE / LOAD
     G is pure JSON, so this is the whole of it. Every localStorage
     touch is guarded: private browsing throws on access rather than
     returning null, and a game that cannot save must still play.
     ============================================================ */
  var SAVE_KEY = "pumarally_save_v1";
  var SPEED_KEY = "pumarally_speed_v1";

  /* Bumped whenever G grows a field the code then assumes is there.
     A save written before option cards existed has players with no
     options array, and resuming it does not produce an older game --
     it produces a broken one, with the first render throwing on a
     field that was never written. Refusing to load is the only
     honest option, since there is nothing to migrate from. */
  var SAVE_VERSION = 2;

  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, G: G })); } catch (e) {}
  }

  function loadGame() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!s || !s.G || s.G.gameOver) return null;
      if (s.v !== SAVE_VERSION) return null;         // a save of a different shape
      return s.G;
    } catch (e) { return null; }
  }

  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  /* ============================================================
     EVENT QUEUE & ANIMATION
     Presentation only: the state is already final when these run.
     A step mutates G, then hands back a list of things to show, and
     the last thing on the list re-enters advance(). That is why a
     five-register turn can animate without the rules engine knowing
     an animation exists -- and why the headless sim, which returns
     NEXT from animate(), runs the identical code path at full speed.
     ============================================================ */
  var SPEEDS = [1.7, 1.0, 0.5];
  var SPEED_NAMES = ["Slow", "Normal", "Fast"];

  function delayFor(ms) { return Math.round(ms * SPEEDS[UI.speed]); }

  function animate(events) {
    if (UI.headless || !UI.mounted) {
      for (var i = 0; i < events.length; i++) if (events[i].type === "log") log(events[i].msg);
      return NEXT;
    }
    UI.queue = UI.queue.concat(events);
    if (!UI.playing) processQueue();
    return ANIM;
  }

  function processQueue() {
    UI.playing = true;
    for (;;) {
      if (!UI.queue.length) {
        UI.playing = false;
        advance();                       // resume the phase machine
        return;
      }
      var ev = UI.queue.shift();
      if (ev.type === "log") { log(ev.msg); updateLog(); continue; }
      /* Set BEFORE the render that moves anything: the class picks the
         transition, and a transition is chosen when the value changes,
         not afterwards. */
      if (ev.type === "motion") { setMotion(ev.kind); continue; }
      if (ev.type === "render") { updateAll(); continue; }
      if (ev.type === "sfx") { sfx(ev.name); continue; }
      if (ev.type === "beams") { UI.beams = ev.beams; drawBeams(); continue; }
      if (ev.type === "wait") {
        var ms = delayFor(ev.delay);
        if (ms <= 0) continue;
        UI.timer = setTimeout(function () { UI.timer = null; processQueue(); }, ms);
        return;
      }
    }
  }

  /* HOW LONG EACH KIND OF MOTION TAKES, and how long before the next
     robot starts its own.

     A move takes the same time whatever its distance, so a Move 3
     crosses three squares in the time a Move 1 crosses one -- it is
     faster, not longer. That is what the card says: the same beat of
     the turn, further.

     `gap` is the interesting number. Robots resolve strictly in
     priority order, so playing them end to end would be honest and
     unreadable -- a queue of separate little films. Making the gap
     SHORTER than the motion overlaps them: the highest priority starts
     first and the lowest starts last, all of them are moving at once
     in the middle, and the order is something you watch rather than
     something you infer. */
  var MOTION = {
    drive: { ms: 620, gap: 260, ease: "var(--pr-ease)" },
    belt:  { ms: 700, gap: 260, ease: "linear" },
    shove: { ms: 260, gap: 160, ease: "cubic-bezier(.35,0,.2,1)" },
    turn:  { ms: 480, gap: 220, ease: "var(--pr-ease)" },
    /* Not a robot: one card's flight, and the gap before the next card
       sets off. Same shape and the same invariant -- a gap at or above
       the duration deals the hand strictly one card at a time, which
       reads as a queue rather than a deal. */
    deal:  { ms: 340, gap: 55, ease: "var(--pr-ease)" }
  };

  function motionOf(kind) { return MOTION[kind || "drive"] || MOTION.drive; }

  function setMotion(kind) {
    if (!UI.els || !UI.els.pieces) return;
    var m = motionOf(kind);
    /* Duration and easing come through custom properties rather than a
       class per kind, so the speed setting scales them: a slow game
       wants slow motion, not the same motion with longer gaps. */
    UI.els.pieces.style.setProperty("--pr-move-ms", delayFor(m.ms) + "ms");
    UI.els.pieces.style.setProperty("--pr-move-ease", m.ease);
    UI.els.pieces.className = "pr-pieces pr-m-" + (kind || "drive");
  }

  /* Same treatment for the deal, and for the same reason: a slow game
     should deal slowly rather than deal at speed and then wait. */
  function setDealTiming() {
    if (!UI.els || !UI.els.hand) return;
    var m = motionOf("deal");
    UI.els.hand.style.setProperty("--pr-deal-ms", delayFor(m.ms) + "ms");
    UI.els.hand.style.setProperty("--pr-deal-gap", delayFor(m.gap) + "ms");
  }

  function stopQueue() {
    if (UI.timer) { clearTimeout(UI.timer); UI.timer = null; }
    UI.queue = [];
    UI.playing = false;
  }

  /* A cheap fingerprint of everything the board can show. Board
     elements that moved nobody should not cost the player a pause,
     and comparing this is how a step knows whether it did anything. */
  function boardSig() {
    var out = [], i, p;
    for (i = 0; i < G.players.length; i++) {
      p = G.players[i];
      out.push(p.c, p.r, p.face, p.damage, p.alive ? 1 : 0, p.flags);
    }
    return out.join(",");
  }

  /* ============================================================
     RENDERING
     One entry point. The static course art is a canvas drawn once
     per course; the robots are DOM precisely so FLIP works on them,
     and an invisible grid of cells carries hit-testing and the
     screen-reader view of the same cells the sighted player sees.
     ============================================================ */
  /* Scroll something into view only when it is actually off screen.
     A 16-row course at 2x is 1024px tall, so the board and your hand
     genuinely cannot share a laptop viewport. Shrinking the board to
     make them fit undoes the thing that was just asked for, so the
     board stays big and the page moves to whichever half matters
     right now: your hand while programming, the board while it runs. */
  function ensureVisible(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return;
    var r = node.getBoundingClientRect();
    var vh = window.innerHeight || 0;
    if (r.top >= 0 && r.bottom <= vh) return;
    var smooth = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    try { node.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" }); }
    catch (e) { node.scrollIntoView(false); }
  }

  function followPhase() {
    var ph = G.phase + "." + G.step;
    if (ph === UI.lastPhase) return;
    UI.lastPhase = ph;
    if (G.phase === "exec") ensureVisible(UI.els.stage);
    else if (inPhase("turn", "program") && actor()) ensureVisible(UI.els.program);
  }

  function updateAll() {
    if (UI.headless || !UI.mounted || !G) return;
    snapshotPieces();
    renderPieces();
    playFlip();
    renderHud();
    renderPlayers();
    renderProgram();
    renderChoice();
    renderOptions();
    renderCurtain();
    updateLog();
    drawBeams();
    followPhase();
  }

  function tilePx() { return UI.tile || TILE; }

  function snapshotPieces() {
    UI.prevRects = {};
    var nodes = UI.els.pieces.children, i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.uid === undefined) continue;
      UI.prevRects[el.dataset.uid] = { x: el.offsetLeft, y: el.offsetTop };
    }
  }

  /* A robot is one <svg>: a hull, a nose that says which way it is
     facing, and a visor. It takes its livery from `color` on the
     wrapper, which is why eight robots cost one drawing rather than
     the eight pre-rendered canvases the sprite sheet needed. */
  var ROBOT_SVG =
    '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
    '<path class="pr-hull" d="M24 30h52a8 8 0 0 1 8 8v38a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/>' +
    '<path class="pr-nose" d="M50 8L66 30H34Z"/>' +
    '<rect class="pr-eye" x="30" y="44" width="40" height="14" rx="4"/>' +
    "</svg>";

  function renderPieces() {
    if (!G) return;                  // mount sizes the stage before the first deal
    var tile = tilePx(), host = UI.els.pieces, i;
    for (i = 0; i < G.players.length; i++) {
      var p = G.players[i], id = "p" + p.id;
      var el = UI.pieceEls[id];
      if (!el) {
        el = document.createElement("div");
        el.className = "pr-piece";
        el.dataset.uid = id;
        el.innerHTML = ROBOT_SVG;
        host.appendChild(el);
        UI.pieceEls[id] = el;
      }
      el.style.color = LIVERIES[p.livery].a;
      el.style.setProperty("--livery-dark", LIVERIES[p.livery].d);
      el.style.left = (p.c * tile) + "px";
      el.style.top = (p.r * tile) + "px";

      /* ROTATION WINDS, it does not snap to a compass point.

         Setting rotate(face * 90) looks right and animates wrong: a
         robot turning right from west to north goes 270deg to 0deg,
         and CSS interpolates that the short way -- backwards, through
         three quarters of a turn, in the opposite direction to the
         card that caused it. The angle has to accumulate, so a right
         turn is always +90 whatever the robot was facing.

         The step from the last rendered facing is what says which way:
         +1 is a right turn, -1 a left, 2 a U-turn, and nothing on this
         board turns a robot further than that in one beat. */
      var deg;
      if (UI.pieceFace[id] === undefined) deg = p.face * 90;
      else {
        var step = ((p.face - UI.pieceFace[id]) % 4 + 4) % 4;
        deg = (UI.pieceDeg[id] || 0) + (step === 3 ? -90 : step * 90);
      }
      UI.pieceFace[id] = p.face;
      UI.pieceDeg[id] = deg;
      el.firstChild.style.transform = "rotate(" + deg + "deg)";

      /* A hit reads as a hit. Damage is a number in the side panel,
         which is fine for counting and useless for noticing, and the
         robot it happened to is the thing you are looking at. */
      if (UI.pieceHurt[id] !== undefined && p.damage > UI.pieceHurt[id]) {
        el.classList.remove("pr-hit");
        void el.offsetWidth;                       // restart the animation
        el.classList.add("pr-hit");
      }
      UI.pieceHurt[id] = p.damage;

      el.classList.toggle("pr-dead", !p.alive);
      el.classList.toggle("pr-down", !!p.poweredDown);
    }
  }

  /* FLIP: the layout has already moved the piece, so put it back
     with a transform and let the transition carry it forward. A
     robot that teleports a square reads as a bug even when the rules
     are right. */
  function playFlip() {
    var nodes = UI.els.pieces.children, i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i], was = UI.prevRects[el.dataset.uid];
      if (!was) continue;
      var dx = was.x - el.offsetLeft, dy = was.y - el.offsetTop;
      if (!dx && !dy) continue;
      el.style.transition = "none";
      el.style.transform = "translate(" + dx + "px," + dy + "px)";
      void el.offsetWidth;                       // force the browser to take it
      el.style.transition = "";
      el.style.transform = "";
    }
  }

  /* The beam elements are already in the DOM -- every square a
     mounted laser can reach got one when the course was built -- so
     firing is a class, not a redraw. */
  function drawBeams() {
    var lit = {}, C = UI.course, i, n;
    for (i = 0; UI.beams && i < UI.beams.length; i++) {
      var b = UI.beams[i], c = b.c, r = b.r;
      for (n = 0; n < 40; n++) {
        lit[c + "," + r] = 1;
        if (b.stopC === c && b.stopR === r) break;
        if (B.wallAt(C, c, r, b.dir)) break;
        var nx = B.step(c, r, b.dir);
        if (B.isVoid(C, nx.c, nx.r)) break;
        c = nx.c; r = nx.r;
      }
    }
    var nodes = UI.els.beams.children;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.classList.toggle("pr-live", !!lit[el.dataset.c + "," + el.dataset.r]);
    }
  }

  function renderHud() {
    var h = UI.els.hud;
    var phase = G.gameOver ? "Game over"
      : G.phase === "turn" && G.step === "program" ? "Program your registers"
      : G.phase === "exec" ? "Register " + (G.register + 1) + " of " + REGISTERS
      : G.phase === "cleanup" ? "End of turn" : "Turn " + G.turn;
    h.querySelector(".pr-phase").textContent = "Turn " + G.turn + " — " + phase;
    h.querySelector("[data-act=speed]").textContent = "Speed: " + SPEED_NAMES[UI.speed];
    h.querySelector("[data-act=mute]").textContent = UI.muted ? "Sound: off" : "Sound: on";
  }

  function renderPlayers() {
    var host = UI.els.players, out = [], i, j;
    for (i = 0; i < G.players.length; i++) {
      var p = G.players[i];
      var dmg = "";
      for (j = 0; j < MAX_DAMAGE; j++) dmg += '<i class="pr-pip' + (j < p.damage ? " on" : "") + '"></i>';
      var lives = "";
      for (j = 0; j < START_LIVES; j++) lives += '<i class="pr-pip' + (j < p.lives ? " life" : "") + '"></i>';
      var state = p.out ? "out" : !p.alive ? "wrecked" : p.poweredDown ? "powered down" : "";
      out.push(
        '<div class="pr-bot' + (isHuman(p) ? " pr-me" : "") + (p.out ? " pr-gone" : "") + '">' +
        '<i class="pr-swatch" style="background:' + LIVERIES[p.livery].a + '"></i>' +
        '<span class="pr-bot-name">' + esc(p.name) + (isHuman(p) ? " (you)" : "") + "</span>" +
        '<span title="flags">' + p.flags + "/" + UI.course.flags.length + "</span>" +
        '<span class="pr-pips" title="lives">' + lives + "</span>" +
        '<span class="pr-pips" title="damage">' + dmg + "</span>" +
        "</div>" +
        (state ? '<div class="pr-bot pr-gone"><span class="pr-bot-name">' + esc(state) + "</span></div>" : "")
      );
    }
    host.innerHTML = out.join("");
  }

  /* Newest first. What just happened is the only part of this anyone
     reads during a turn, so it belongs where the eye already is rather
     than behind a scroll that has to keep chasing the bottom. Older
     entries fall away downward, which is also the order of how much
     they are worth.

     The register markers come out reading as separators BELOW the
     events they introduced rather than above them. That is inherent to
     reversing, and it still groups the register correctly -- it just
     divides from the bottom of the group instead of the top. */
  function updateLog() {
    var host = UI.els.log, out = [], start = Math.max(0, G.log.length - 60), i;
    /* Pin to the newest only if the reader is already up there. During
       execution renders come fast, and yanking the view back to the top
       every time would make older entries unreadable the moment anyone
       scrolled down to read them. */
    var pinned = host.scrollTop < 24;
    for (i = G.log.length - 1; i >= start; i--) {
      var e = G.log[i];
      out.push('<div' + (/^--/.test(e.msg) ? ' class="reg"' : "") + ">" + esc(e.msg) + "</div>");
    }
    host.innerHTML = out.join("");
    if (pinned) host.scrollTop = 0;
  }

  /* CARD ART, in the board's own vocabulary.

     A chevron already means one square of travel out there: an
     ordinary conveyor carries one and paints one, an express carries
     two and paints two. So a Move 2 card carries two chevrons and a
     Move 3 three, and the card is telling you the same thing the
     floor does in the same way. Rotation is the gear's arc, for the
     same reason -- that arc already means "you turn" on this board,
     and inventing a second symbol for it would be a second thing to
     learn for no gain.

     Everything is stroked in currentColor, so a card's kind colour
     drives its art exactly the way an element's does on the board. */
  function cardArt(kind) {
    var d = CARD_KINDS[kind], i, out = [];
    if (d.move) {
      /* Backing up is the same arrow the other way round, because that
         is what the move is: the robot does not turn to do it. */
      var dir = d.move > 0 ? -1 : 1, n = Math.abs(d.move);
      var tip = 50 + dir * 34, tail = 50 - dir * 30;
      out.push('<path class="pr-cshaft" d="M50 ' + tail + "L50 " + (tip - dir * 6) + '"/>');
      for (i = 0; i < n; i++) out.push(chev(50, tip - dir * i * 19, 0, dir, 13, "pr-cmark"));
    } else if (kind === "uturn") {
      /* Up, round, and back the way you came.

         A U-turn IS drawn as a half-circle further down, and as an arc
         it reads as "half a spin" -- true, and not the point. What a
         U-turn does is reverse you, and the shape that says reverse is
         one that leaves going up and returns going down. The rotate
         cards keep the arc; this one keeps the U. */
      out.push('<path class="pr-cshaft" d="M32 80L32 52A18 18 0 0 1 68 52L68 72"/>');
      out.push(chev(68, 80, 0, 1, 13, "pr-cmark"));
    } else {
      /* A ROTATE CARD SHOWS THE HEADING CHANGING, not a spin.

         Up the card is where the robot is pointing now. The line runs
         up, turns the corner, and leaves sideways under an arrowhead
         pointing the way you will be facing -- so the picture is the
         before and the after, in that order.

         The corner turns only once the line is well clear of the
         arrowhead's wings. Bending it earlier puts the curve inside
         the chevron and the two read as one smudge at card size,
         which is the size that matters.

         An arc was tried first and was worse: a quarter circle says
         "ninety degrees of something" without saying of what, and
         both cards came out as the same gesture mirrored rather than
         as two directions. */
      var cw = d.turn > 0;
      var TIP = cw ? 80 : 20, Y = 42;
      var rise = cw ? 32 : 68;                 // the upright, on the far side
      var corner = cw ? 46 : 54;               // where the bend finishes
      var shaftEnd = cw ? 67 : 33;             // the chevron's back
      out.push('<path class="pr-cshaft" d="M' + rise + " 80L" + rise + " 56Q" + rise + " " + Y +
        " " + corner + " " + Y + "L" + shaftEnd + " " + Y + '"/>');
      out.push(chev(TIP, Y, cw ? 1 : -1, 0, 13, "pr-cmark"));
    }
    return '<svg class="pr-cart" viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
           out.join("") + "</svg>";
  }

  function cardFace(cd) {
    var k = CARD_KINDS[cd.kind];
    return '<span class="pr-faces">' +
      '<span class="pr-face pr-front">' + cardArt(cd.kind) +
      "<b>" + esc(k.label.toUpperCase()) + "</b>" +
      '<span class="pr-pri">' + cd.pri + "</span></span>" +
      '<span class="pr-face pr-back"></span></span>';
  }

  function cardEl(cd, tag) {
    var el = document.createElement(tag || "div");
    el.className = "pr-card pr-k" + "-" + cd.kind;
    el.innerHTML = cardFace(cd);
    return el;
  }

  /* WHEN A REGISTER'S CARD IS FACE UP.
     You see your own hand while you are choosing from it. The moment
     you commit, the registers turn over -- that is what committing
     MEANS in this game, and a row that stayed readable would be
     quietly lying about it. They come back one at a time as the
     registers run, and stay up once the turn is over and there is
     nothing left to hide. */
  function registerFaceUp(i, programming) {
    if (programming) return true;
    if (G.gameOver || G.phase === "cleanup") return true;
    if (G.phase === "exec") return i <= G.register;
    return false;
  }

  /* The register row is BUILT ONCE and patched thereafter. Rebuilding
     it from innerHTML each render would replace the card elements, and
     an element that was just created cannot animate a class change --
     the flip would never be seen, only its result. */
  function buildRegisters() {
    var out = [], i;
    for (i = 0; i < REGISTERS; i++) {
      out.push('<button class="pr-slot" data-act="slot" data-i="' + i + '" data-slot="' + i + '">' +
        '<span class="pr-n"></span></button>');
    }
    UI.els.regs.innerHTML = out.join("");
    UI.slotEls = [].slice.call(UI.els.regs.children);
  }

  function renderProgram() {
    var me = G.players[G.actor === undefined ? 0 : G.actor];
    var mine = me && isHuman(me) && me.alive;
    var programming = inPhase("turn", "program") && mine;
    var open = me ? openRegisters(me.damage) : REGISTERS;
    var i;

    if (!UI.slotEls || UI.slotEls.length !== REGISTERS) buildRegisters();

    for (i = 0; i < REGISTERS; i++) {
      var slot = UI.slotEls[i];
      var locked = i >= open;
      var ci = me ? me.registers[i] : null;
      var next = (programming && !locked && ci === null && firstEmpty(me) === i) ||
                 (G.phase === "exec" && G.register === i);

      slot.classList.toggle("pr-locked", locked);
      slot.classList.toggle("pr-next", !!next);
      slot.classList.toggle("pr-filled", ci !== null);
      slot.disabled = !(programming && !locked && ci !== null);
      slot.querySelector(".pr-n").textContent = (i + 1) + (locked ? " LOCK" : "");

      /* Replace the card only when it is a DIFFERENT card. Same card,
         same element -- so a class change flips it instead of
         redrawing it already flipped. */
      var have = slot.querySelector(".pr-card");
      var wantKey = ci === null ? "" : String(ci);
      if ((have ? have.dataset.card : "") !== wantKey) {
        if (have) have.remove();
        if (ci !== null) {
          var el = cardEl(card(ci));
          el.dataset.card = wantKey;
          el.dataset.from = i;
          el.draggable = false;
          slot.appendChild(el);
          have = el;
        }
      }
      if (have) {
        var up = registerFaceUp(i, programming);
        have.classList.toggle("pr-down", !up);
        have.draggable = !!(programming && !locked);
      }
      slot.setAttribute("aria-label", "Register " + (i + 1) +
        (locked ? ", locked" : ci === null ? ", empty"
          : registerFaceUp(i, programming) ? ", " + CARD_KINDS[card(ci).kind].label
          : ", face down"));
    }

    /* The deal animation plays for cards that are NEW to the hand, not
       for every card on every render. The hand is rebuilt wholesale,
       so without this the animation restarts each time anything else
       changes -- and while the queue is running renders come fast
       enough that the cards sit at the animation's first frame, which
       is opacity zero. An invisible hand, from an animation that was
       working perfectly. */
    var out = [], fresh = {}, dealt = 0;
    if (programming) {
      /* Held, not in-hand. A card you pull back out of a register was
         never dealt to you again -- it was yours all along -- so it
         must not fly in as though it were new. Tracking only the hand
         made every un-programmed card re-deal itself, which is exactly
         the signal this animation exists to give and exactly the wrong
         card to give it about. */
      var seen = UI.lastHand || {};
      for (i = 0; i < me.registers.length; i++) {
        if (me.registers[i] !== null) fresh[me.registers[i]] = 1;
      }
      for (i = 0; i < me.hand.length; i++) {
        var cd = card(me.hand[i]);
        var isNew = !seen[me.hand[i]];
        fresh[me.hand[i]] = 1;
        /* Positional, and counted over the new cards only: a single
           card dealt into a hand of eight should land now, not wait
           out the eight delays it would inherit from its index. */
        var di = isNew ? ' style="--pr-deal-i:' + dealt++ + '"' : "";
        out.push('<button class="pr-card pr-k-' + cd.kind + (isNew ? " pr-dealt" : "") + '"' + di + ' draggable="true"' +
          ' data-act="card" data-i="' + i + '" data-hand="' + i + '" aria-label="' +
          esc(CARD_KINDS[cd.kind].label) + ", priority " + cd.pri +
          '. Drag to a register, or press Enter to place it in the next one.">' +
          cardFace(cd) + "</button>");
      }
    }
    UI.els.hand.innerHTML = out.join("");
    if (dealt) setDealTiming();
    UI.lastHand = programming ? fresh : null;

    var ready = programming && firstEmpty(me) === -1;
    UI.els.run.disabled = !ready;
    UI.els.run.textContent = needsCurtain() ? "Lock in" : "Run registers";
    UI.els.clear.disabled = !programming || !me.registers.some(function (x, ix) { return x !== null && ix < open; });
    UI.els.down.disabled = !programming;
    UI.els.down.classList.toggle("on", !!(me && me.announceDown));
    UI.els.hint.textContent = G.gameOver ? ""
      : (G.phase === "exec" && G.step === "optionChoice") ? ""
      : programming ? (ready ? "Registers full. Run, or take a card back from a register."
                             : "Drag a card into a register, or click it to fill register " +
                               (firstEmpty(me) + 1) + " of " + open + ".")
      : inPhase("turn", "program") ? "Waiting for the other robots."
      : "";
  }

  /* The whole option-card interface: one prompt and a row of buttons,
     shared by every "you may" card in the deck. */
  function renderChoice() {
    var host = UI.els.choice;
    var ch = G.pendingChoices[0];
    var waiting = ch && G.phase === "exec" && G.step === "optionChoice" && isHuman(G.players[ch.owner]);
    if (!waiting) {
      if (!host.hidden) { host.hidden = true; host.innerHTML = ""; }
      return;
    }
    /* A board question has no option card behind it, so the heading
       comes from the descriptor. Reading OPTION_DEFS[null].name here
       threw and took the whole render with it. */
    var def = ch.optionId ? OPTION_DEFS[ch.optionId] : null;
    var title = def ? def.name : ch.title;
    var out = "<b>" + esc(title) + "</b> <span>" + esc(ch.prompt) + "</span>";
    for (var i = 0; i < ch.labels.length; i++) {
      out += ' <button data-act="pick" data-i="' + i + '">' + esc(ch.labels[i]) + "</button>";
    }
    if (host.innerHTML !== out) {
      host.innerHTML = out;
      announce(title + ". " + ch.prompt);
    }
    host.hidden = false;
  }

  function humanSeat() {
    for (var i = 0; i < G.players.length; i++) if (isHuman(G.players[i])) return G.players[i];
    return null;
  }

  function renderOptions() {
    var me = humanSeat(), out = [];
    if (me) {
      for (var i = 0; i < me.options.length; i++) {
        var def = OPTION_DEFS[me.options[i].id];
        out.push('<span class="pr-opt" title="' + esc(def.text) + '">' + esc(def.name) + "</span>");
      }
    }
    UI.els.opts.innerHTML = out.join("");
  }

  function firstEmpty(p) {
    var open = openRegisters(p.damage);
    for (var i = 0; i < open; i++) if (p.registers[i] === null) return i;
    return -1;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function announce(msg) {
    if (UI.els && UI.els.sr) UI.els.sr.textContent = msg;
  }

  /* ============================================================
     HUMAN INPUT
     One delegated listener per event, dispatching off data-act.
     Every handler validates the phase first, mutates, then calls
     advance() -- the same shape the bots go through, so there is no
     second definition of what a legal program is.
     ============================================================ */
  function inPhase(ph, st) { return G && !G.gameOver && G.phase === ph && G.step === st; }

  function actor() {
    var p = G.players[G.actor === undefined ? 0 : G.actor];
    return p && isHuman(p) && p.alive ? p : null;
  }

  /* ONE MOVE, TWO WAYS IN.

     Dragging and clicking are the same rules move with different
     gestures, so they share a function rather than each doing the
     splice themselves. Click is not a fallback for drag: it is faster
     when you are filling registers in order, it is the only one a
     keyboard can reach, and drag-and-drop is unreliable on a
     touchscreen. Both stay. */
  function placeCard(handIndex, slotIndex) {
    var p = actor();
    if (!inPhase("turn", "program") || !p || curtainUp()) return false;
    if (handIndex < 0 || handIndex >= p.hand.length) return false;
    if (slotIndex === undefined || slotIndex === null) slotIndex = firstEmpty(p);
    if (slotIndex < 0 || slotIndex >= openRegisters(p.damage)) return false;
    /* Dropping onto an occupied register sends its card back to the
       hand rather than refusing: the gesture plainly means "this one
       instead", and refusing it would make the player undo first. */
    if (p.registers[slotIndex] !== null) p.hand.push(p.registers[slotIndex]);
    p.registers[slotIndex] = p.hand.splice(handIndex, 1)[0];
    sfx("place");
    announce("Register " + (slotIndex + 1) + " set.");
    updateAll();
    return true;
  }

  /* Dragging a card that is already in a register moves it, and swaps
     with whatever is in the way. Reordering a program without taking
     cards back and re-placing them is most of what drag buys here. */
  function moveRegister(from, to) {
    var p = actor();
    if (!inPhase("turn", "program") || !p || curtainUp()) return false;
    var open = openRegisters(p.damage);
    if (from === to || from < 0 || to < 0 || from >= open || to >= open) return false;
    var tmp = p.registers[to];
    p.registers[to] = p.registers[from];
    p.registers[from] = tmp;
    sfx("place");
    announce("Registers " + (from + 1) + " and " + (to + 1) + " swapped.");
    updateAll();
    return true;
  }

  function onCardClick(i) { placeCard(i, undefined); }

  function onSlotClick(i) {
    var p = actor();
    if (!inPhase("turn", "program") || !p) return;
    if (i >= openRegisters(p.damage)) return;        // locked registers are not yours to change
    if (p.registers[i] === null) return;
    p.hand.push(p.registers[i]);
    p.registers[i] = null;
    sfx("clear");
    announce("Register " + (i + 1) + " cleared.");
    updateAll();
  }

  function onClear() {
    var p = actor();
    if (!inPhase("turn", "program") || !p) return;
    var open = openRegisters(p.damage);
    for (var i = 0; i < open; i++) {
      if (p.registers[i] === null) continue;
      p.hand.push(p.registers[i]);
      p.registers[i] = null;
    }
    updateAll();
  }

  function onPowerDown() {
    var p = actor();
    if (!inPhase("turn", "program") || !p) return;
    p.announceDown = !p.announceDown;
    announce(p.announceDown ? "Powering down next turn." : "Power down cancelled.");
    updateAll();
  }

  function onRun() {
    var p = actor();
    if (!inPhase("turn", "program") || !p || firstEmpty(p) !== -1) return;
    announce("Running registers.");
    advance();
  }

  function onSpeed() {
    UI.speed = (UI.speed + 1) % SPEEDS.length;
    try { localStorage.setItem(SPEED_KEY, String(UI.speed)); } catch (e) {}
    renderHud();
  }

  /* The course comes from the mount point; everything else comes from
     the house rules, so the setup screen and a fresh page load agree. */
  /* courseId is passed in rather than re-derived, because mount has
     already built and rendered that course. Working it out twice is
     how the board on screen ends up being a different one from the
     board the rules are running on. */
  function gameOpts(base, courseId) {
    var cfg = resolveConfig(houseRules);
    return {
      course: courseId,
      players: cfg.players, humans: cfg.humans,
      skill: cfg.skill, startOptions: cfg.startOptions,
      flagTouch: cfg.flagTouch
    };
  }

  function chosenCourse(base) {
    if (base && base.course) return base.course;
    if (houseRules && B.COURSES[houseRules.course]) return houseRules.course;
    return "provingRun";
  }

  function onNewGame() {
    stopQueue();
    clearSave();
    UI.wallsChecked = false;
    UI.curtainCleared = null;
    /* A course change means a different board, so the whole mount is
       rebuilt rather than patched. */
    if (UI.course && UI.course.id !== chosenCourse(UI.opts)) { mount(UI.els.host, UI.opts); return; }
    newGame((Math.random() * 1e9) | 0, gameOpts(UI.opts, UI.course.id));
    UI.beams = null;
    hideBanner();
    updateAll();
    advance();
  }

  function onOptionPick(i) {
    var ch = G.pendingChoices[0];
    if (!ch || G.phase !== "exec" || G.step !== "optionChoice") return;
    if (!isHuman(G.players[ch.owner])) return;
    if (!(i >= 0 && i < ch.labels.length)) return;
    G.optionAnswers[ch.key] = i;
    G.pendingChoices.shift();
    announce(ch.labels[i] + ".");
    advance();
  }

  function dispatchAct(el) {
    var a = el.dataset.act, i = parseInt(el.dataset.i, 10);
    if (a === "setup") { showSetup(); return; }
    if (a === "help") { showHelp(); return; }
    if (a === "closemodal") { closeModal(); return; }
    if (a === "helptab") { showHelp(el.dataset.tab); return; }
    if (a === "preset") {
      var pre = DIFFICULTY_PRESETS[el.dataset.name];
      for (var k in pre) houseRules[k] = pre[k];
      saveRules(); showSetup(); return;
    }
    if (a === "course") { houseRules.course = el.dataset.c; saveRules(); showSetup(); return; }
    if (a === "start") { saveRules(); closeModal(); onNewGame(); return; }
    if (a === "tut") { showTutorial(i); return; }
    if (a === "tutskip") { showTutorial(TUTORIAL.length); return; }
    if (a === "mute") { toggleMute(); return; }
    if (a === "ready") { onReady(); return; }
    if (a === "pick") onOptionPick(i);
    else if (a === "card") onCardClick(i);
    else if (a === "slot") onSlotClick(i);
    else if (a === "clear") onClear();
    else if (a === "down") onPowerDown();
    else if (a === "run") onRun();
    else if (a === "speed") onSpeed();
    else if (a === "new") onNewGame();
  }

  function setupInput(root) {
    root.addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]");
      if (el && !el.disabled) dispatchAct(el);
    });

    /* DRAG AND DROP.

       dragstart has to be bound per element, but dragover/drop are
       delegated like everything else. What is being dragged lives on
       UI, not in the dataTransfer payload: Safari will not let you
       READ dataTransfer during dragover, so a drop target that needs
       to know what is coming has to be told some other way. The
       payload is still set, because a drag with an empty one is not a
       drag at all on Firefox. */
    root.addEventListener("dragstart", function (e) {
      var el = e.target.closest(".pr-card[draggable=true]");
      if (!el) { e.preventDefault(); return; }
      UI.drag = el.dataset.hand !== undefined
        ? { from: "hand", i: +el.dataset.hand }
        : { from: "slot", i: +el.dataset.from };
      el.classList.add("pr-dragging");
      try {
        e.dataTransfer.setData("text/plain", "card");
        e.dataTransfer.effectAllowed = "move";
      } catch (err) { /* older engines */ }
    });
    root.addEventListener("dragend", function () {
      UI.drag = null;
      var was = root.querySelectorAll(".pr-dragging,.pr-over");
      for (var i = 0; i < was.length; i++) was[i].classList.remove("pr-dragging", "pr-over");
    });
    root.addEventListener("dragover", function (e) {
      if (!UI.drag) return;
      var slot = e.target.closest(".pr-slot");
      if (!slot) return;
      e.preventDefault();                       // preventDefault here is what ALLOWS the drop
      e.dataTransfer.dropEffect = "move";
      if (!slot.classList.contains("pr-over")) slot.classList.add("pr-over");
    });
    root.addEventListener("dragleave", function (e) {
      var slot = e.target.closest(".pr-slot");
      if (slot) slot.classList.remove("pr-over");
    });
    root.addEventListener("drop", function (e) {
      if (!UI.drag) return;
      var slot = e.target.closest(".pr-slot");
      if (!slot) return;
      e.preventDefault();
      slot.classList.remove("pr-over");
      var to = +slot.dataset.slot;
      if (UI.drag.from === "hand") placeCard(UI.drag.i, to);
      else moveRegister(UI.drag.i, to);
      UI.drag = null;
    });
    root.addEventListener("input", function (e) {
      var el = e.target.closest("[data-act=rule]");
      if (!el) return;
      houseRules[el.dataset.k] = clampRule(el.dataset.k, parseInt(el.value, 10));
      showSetup();
    });
    root.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (modalOpen()) {
        trapFocus(e);
        if (e.key === "Escape" && UI.modalDismissable) { e.preventDefault(); closeModal(); }
        return;
      }

      /* A curtain that only covers the screen is not a curtain: the
         delegated key handler has no idea anything is over it, and
         "3" would still program the previous player's card. */
      if (curtainUp()) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onReady(); }
        return;
      }

      if (e.key === "h" || e.key === "H" || e.key === "?") { e.preventDefault(); showHelp(); return; }
      if (e.key === "m" || e.key === "M") { toggleMute(); return; }

      var p = actor();
      if (e.key >= "1" && e.key <= "9" && inPhase("turn", "program") && p) {
        e.preventDefault();
        onCardClick(parseInt(e.key, 10) - 1);
      } else if ((e.key === "Backspace" || e.key === "Delete") && inPhase("turn", "program") && p) {
        e.preventDefault();
        for (var i = openRegisters(p.damage) - 1; i >= 0; i--) {
          if (p.registers[i] !== null) { onSlotClick(i); break; }
        }
      } else if (e.key === "Enter" && !e.repeat) {
        if (UI.els.run && !UI.els.run.disabled) { e.preventDefault(); onRun(); }
      } else if (e.key === "s" || e.key === "S") {
        onSpeed();
      } else if (e.key === "n" || e.key === "N") {
        onNewGame();
      }
    });
  }

  /* ============================================================
     BANNER
     ============================================================ */
  function showBanner(html) {
    UI.els.banner.innerHTML = html;
    UI.els.banner.hidden = false;
  }
  function hideBanner() { UI.els.banner.hidden = true; }

  /* The banner wants markup and the live region wants words. Passing
     one string to both puts literal <b> tags into what a screen
     reader reads out, which is invisible to anyone checking by eye. */
  function renderGameOver() {
    var html, plain;
    if (G.winner !== null && G.winner !== undefined) {
      var w = G.players[G.winner];
      var tail = " took all " + UI.course.flags.length + " flags" + (isHuman(w) ? " — that was you." : ".");
      html = "<b>" + esc(w.name) + "</b>" + tail;
      plain = w.name + tail;
    } else if (G.unfinished) {
      html = plain = "Called after " + MAX_TURNS + " turns with no winner.";
    } else {
      html = plain = "Every robot is scrap. Nobody wins.";
    }
    showBanner(html + ' <button data-act="new">New game</button>');
    announce(plain);
  }

  /* ============================================================
     HOUSE RULES
     One declarative table. The setup screen renders itself from it,
     the presets are named bundles of the same keys, and resolveConfig
     turns the flat values into what newGame actually reads -- so a
     new rule is one row here and nothing else.
     ============================================================ */
  var SLIDER_DEFS = {
    players: { label: "Robots", min: 2, max: 8, def: 4, desc: "How many robots are in the race." },
    humans: { label: "Humans", min: 1, max: 8, def: 1, desc: "Seats played at this keyboard. More than one turns on pass-and-play." },
    skill: { label: "Rival skill", min: 0, max: 2, def: 1, harder: true,
             labels: ["Scrapyard", "Circuit", "Grand Prix"],
             desc: "How far ahead the bots look when they program." },
    startOptions: { label: "Starting options", min: 0, max: 3, def: 0,
                    desc: "Option cards each robot begins holding, instead of earning them at upgrade sites." },

    /* HOUSE RULES: variants, not game size. Kept in the same table so
       they load, save, clamp and ride in the presets exactly as the
       others do, and separated only by which section draws them.

       flagTouch exists because the books disagree. The English manual
       is explicit that a robot must END a register phase on the flag to
       touch it; the German Crash and Burn rulebook says a robot reaches
       a checkpoint if it crosses it OR stays on it. Rather than pick a
       winner between two printings of the same game, the strict reading
       is the default and the other is offered by name. */
    flagTouch: { label: "Touching a flag", min: 0, max: 1, def: 0, group: "house",
                 labels: ["Must end a register on it", "Crossing it counts"],
                 desc: "The English manual wants you to stop on a flag. The German Crash and Burn book counts crossing it. Euro style is the looser one." }
  };

  var DIFFICULTY_PRESETS = {
    Solo: { players: 4, humans: 1, skill: 0, startOptions: 0 },
    Race: { players: 4, humans: 1, skill: 1, startOptions: 0 },
    "Grand Prix": { players: 6, humans: 1, skill: 2, startOptions: 1 },
    "Pass-and-play": { players: 4, humans: 2, skill: 1, startOptions: 0 }
  };

  var RULES_KEY = "pumarally_rules_v1";
  var houseRules = {};

  function defaultRules() {
    var out = {};
    for (var k in SLIDER_DEFS) out[k] = SLIDER_DEFS[k].def;
    out.course = "provingRun";          // a choice, not a range
    return out;
  }

  function loadRules() {
    var out = defaultRules();
    try {
      var s = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
      for (var k in out) if (s && SLIDER_DEFS[k] && typeof s[k] === "number") out[k] = clampRule(k, s[k]);
      if (s && s.course && B.COURSES[s.course]) out.course = s.course;
    } catch (e) {}
    return out;
  }

  function clampRule(k, v) {
    var d = SLIDER_DEFS[k];
    return Math.max(d.min, Math.min(d.max, Math.round(v)));
  }

  function saveRules() {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(houseRules)); } catch (e) {}
  }

  /* Humans cannot outnumber the seats, and the setup screen should not
     be able to describe a game that cannot be dealt. */
  function resolveConfig(h) {
    var players = clampRule("players", h.players);
    return {
      course: B.COURSES[h.course] ? h.course : "provingRun",
      players: players,
      humans: Math.min(players, clampRule("humans", h.humans)),
      skill: clampRule("skill", h.skill),
      startOptions: clampRule("startOptions", h.startOptions),
      flagTouch: clampRule("flagTouch", h.flagTouch)
    };
  }

  function currentPreset() {
    for (var name in DIFFICULTY_PRESETS) {
      var p = DIFFICULTY_PRESETS[name], match = true;
      for (var k in p) if (houseRules[k] !== p[k]) { match = false; break; }
      if (match) return name;
    }
    return null;
  }

  /* ============================================================
     THE TURN, AS THE HELP DESCRIBES IT
     Each row names a real step in the phase machine, and
     validateTables refuses to load if one of them does not exist.
     That is the whole point: help that drifts from the engine is
     worse than no help, and nothing else would ever catch it.
     ============================================================ */
  var TURN_STEPS = [
    { phase: "turn", step: "respawn", title: "Wrecks return",
      body: "Robots destroyed last turn come back on their archive with 2 damage." },
    { phase: "turn", step: "powerStart", title: "Powered-down robots repair",
      body: "Damage clears at the start of the powered-down turn, not when it was announced." },
    { phase: "turn", step: "deal", title: "Deal",
      body: "You are dealt 9 cards minus your damage. Every point of damage is a card you do not get." },
    { phase: "turn", step: "program", title: "Program five registers",
      body: "Face down, all at once. From 5 damage your registers lock from the right and keep last turn's card." },
    { phase: "turn", step: "announce", title: "Announce power down",
      body: "Declared now, for next turn." },
    { phase: "exec", step: "reveal", title: "Reveal",
      body: "Everyone's card for this register turns over. Highest priority number moves first." },
    { phase: "exec", step: "move", title: "Robots move",
      body: "One at a time, in priority order. A robot moving into another pushes it, and a wall stops the whole chain." },
    { phase: "exec", step: "express", title: "Express conveyors",
      body: "Blue belts move one square." },
    { phase: "exec", step: "belts", title: "All conveyors",
      body: "Blue and rust belts both move one square, so an express moves two in total. A belt will not push a robot that is standing still, and two robots converging on one square means neither moves." },
    { phase: "exec", step: "pushers", title: "Pushers",
      body: "Only the ones whose registers are printed on them." },
    { phase: "exec", step: "gears", title: "Gears",
      body: "A quarter turn, the way the hub points." },
    { phase: "exec", step: "presses", title: "Presses",
      body: "A press flattens whatever is standing on it, in the registers printed on it. Crash and Burn boards only." },
    { phase: "exec", step: "lasers", title: "Lasers",
      body: "Board lasers and robot lasers fire at the same instant, so a robot destroyed this register still gets its shot off. Walls block. A powered-down robot does not fire." },
    { phase: "exec", step: "burners", title: "Burners",
      body: "A burner scorches anything standing on it, in the registers printed on it. It fires after the lasers, not with the other elements. Crash and Burn boards only." },
    { phase: "exec", step: "touch", title: "Flags and repair sites",
      body: "Touching a flag in sequence scores it; touching one out of order still moves your archive." },
    { phase: "cleanup", step: "repair", title: "Repairs",
      body: "One damage off if you end the turn on a wrench or a flag. A two-wrench upgrade site is a choice: two damage off, or an option card." },
    { phase: "cleanup", step: "discard", title: "Discard",
      body: "Everything except the cards held in locked registers." }
  ];

  var KEYS = [
    ["1 - 9", "Place that card in the next open register"],
    ["Backspace", "Take the last card back"],
    ["Enter", "Run the registers, or dismiss a hand-over"],
    ["H or ?", "This help"],
    ["S", "Cycle speed"],
    ["M", "Mute"],
    ["N", "New game"],
    ["Esc", "Close a dialog"]
  ];

  /* ============================================================
     AUDIO
     Synthesised, so there is nothing to download and nothing to
     404. Every call is wrapped: a blocked AudioContext must cost the
     sound, never the game.
     ============================================================ */
  var MUTE_KEY = "pumarally_muted_v1";
  var actx = null;

  function tone(freq, type, dur, gain, delay) {
    try {
      if (!actx) actx = new (root.AudioContext || root.webkitAudioContext)();
      var t = actx.currentTime + (delay || 0);
      var osc = actx.createOscillator(), g = actx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(actx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) {}
  }

  var SFX = {
    place: function () { tone(520, "square", 0.05, 0.05); },
    clear: function () { tone(300, "square", 0.05, 0.04); },
    reveal: function () { tone(380, "triangle", 0.07, 0.05); tone(520, "triangle", 0.07, 0.04, 0.06); },
    move: function () { tone(220, "square", 0.05, 0.035); },
    shove: function () { tone(150, "square", 0.08, 0.06); },
    belt: function () { tone(180, "sawtooth", 0.09, 0.03); },
    gear: function () { tone(300, "sawtooth", 0.08, 0.035); tone(360, "sawtooth", 0.07, 0.03, 0.05); },
    laser: function () { tone(900, "sawtooth", 0.07, 0.05); tone(600, "sawtooth", 0.09, 0.04, 0.05); },
    hurt: function () { tone(200, "square", 0.12, 0.07); },
    wreck: function () { tone(140, "sawtooth", 0.3, 0.1); tone(90, "sawtooth", 0.4, 0.08, 0.14); },
    flag: function () { [660, 880, 1180].forEach(function (f, i) { tone(f, "square", 0.14, 0.06, i * 0.09); }); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, "square", 0.22, 0.08, i * 0.14); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, "sawtooth", 0.26, 0.08, i * 0.18); }); }
  };

  function sfx(name) {
    if (UI.muted || UI.headless || !SFX[name]) return;
    SFX[name]();
  }

  function toggleMute() {
    UI.muted = !UI.muted;
    try { localStorage.setItem(MUTE_KEY, UI.muted ? "1" : "0"); } catch (e) {}
    renderHud();
    announce(UI.muted ? "Muted." : "Sound on.");
  }

  /* ============================================================
     MODALS
     One overlay, one focus trap. Everything that is not the board
     goes through here.
     ============================================================ */
  function openModal(html, dismissable) {
    var ov = UI.els.overlay;
    ov.innerHTML = '<div class="pr-modal" role="dialog" aria-modal="true">' + html + "</div>";
    ov.hidden = false;
    UI.modalDismissable = dismissable !== false;
    UI.prevFocus = document.activeElement;
    var focusable = ov.querySelectorAll("button, [href], input, select, [tabindex]");
    if (focusable.length) focusable[0].focus();
  }

  function closeModal() {
    var ov = UI.els.overlay;
    ov.hidden = true;
    ov.innerHTML = "";
    if (UI.prevFocus && UI.prevFocus.focus) { try { UI.prevFocus.focus(); } catch (e) {} }
    UI.prevFocus = null;
  }

  function modalOpen() { return UI.els && UI.els.overlay && !UI.els.overlay.hidden; }

  function trapFocus(e) {
    if (!modalOpen() || e.key !== "Tab") return;
    var items = UI.els.overlay.querySelectorAll("button, [href], input, select, [tabindex]");
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ============================================================
     SETUP AND HELP
     The help tables are generated from the same tables the engine
     reads. A board element renamed in ELEMENT_DEFS renames itself in
     the help, and a card added to OPTION_DEFS documents itself.
     ============================================================ */
  function showSetup() {
    var out = ['<h2>SET UP A RACE</h2><div class="pr-presets">'];
    var cur = currentPreset();
    for (var name in DIFFICULTY_PRESETS) {
      out.push('<button data-act="preset" data-name="' + esc(name) + '"' +
        (cur === name ? ' class="on"' : "") + ">" + esc(name) + "</button>");
    }
    out.push(cur ? "" : '<button class="on" disabled>Custom</button>');
    out.push("</div>");

    out.push('<div class="pr-rule"><div class="pr-rule-head"><b>Course</b>' +
      '<span class="pr-rule-val">' + esc(B.COURSES[houseRules.course].name) + "</span></div>" +
      '<div class="pr-presets">');
    /* Grouped by box, because "a course from Armed and Dangerous" is
       how anyone with the shelf actually picks one. */
    var bySet = {}, order = [];
    for (var cid in B.COURSES) {
      if (cid.charAt(0) === "_") continue;             // the editor's scratch course
      var setId = B.BOARD_SPECS[B.COURSES[cid].boards[0].id].set || "authored";
      if (!bySet[setId]) { bySet[setId] = []; order.push(setId); }
      bySet[setId].push(cid);
    }
    for (var si = 0; si < order.length; si++) {
      var sid = order[si];
      if (order.length > 1) out.push('<span class="pr-set-label">' + esc(B.SETS[sid].name) + "</span>");
      for (var ci = 0; ci < bySet[sid].length; ci++) {
        var id2 = bySet[sid][ci];
        out.push('<button data-act="course" data-c="' + esc(id2) + '"' +
          (houseRules.course === id2 ? ' class="on"' : "") + ">" + esc(B.COURSES[id2].name) + "</button>");
      }
    }
    out.push("</div><div class='pr-rule-desc'>" +
      esc(B.COURSES[houseRules.course].blurb || "") + "</div></div>");

    var groups = [["setup", null], ["house", "House rules"]];
    for (var gi = 0; gi < groups.length; gi++) {
    var gname = groups[gi][0];
    if (groups[gi][1]) out.push('<h3 class="pr-rule-group">' + esc(groups[gi][1]) + "</h3>");
    for (var k in SLIDER_DEFS) {
      var d = SLIDER_DEFS[k], v = houseRules[k];
      if ((d.group || "setup") !== gname) continue;
      var shown = d.labels ? d.labels[v] : v;
      out.push('<div class="pr-rule"><div class="pr-rule-head"><b>' + esc(d.label) + "</b>" +
        '<span class="pr-rule-val">' + esc(String(shown)) + (d.harder && v > d.def ? ' <i class="pr-harder">harder</i>' : "") + "</span></div>" +
        '<input type="range" data-act="rule" data-k="' + k + '" min="' + d.min + '" max="' + d.max + '" value="' + v + '">' +
        '<div class="pr-rule-desc">' + esc(d.desc) + "</div></div>");
    }
    }
    var cfg = resolveConfig(houseRules);
    out.push('<p class="pr-rule-desc">' + cfg.players + " robots, " + cfg.humans +
      (cfg.humans === 1 ? " played here" : " played here in turn") + ".</p>");
    out.push('<div class="pr-modal-foot"><button data-act="start">Start</button>' +
      '<button data-act="closemodal">Cancel</button></div>');
    openModal(out.join(""));
  }

  function helpTabs() {
    return [
      { id: "turn", label: "The turn", build: buildTurnHelp },
      { id: "board", label: "The board", build: buildBoardHelp },
      { id: "cards", label: "Cards", build: buildCardHelp },
      { id: "options", label: "Options", build: buildOptionHelp },
      { id: "keys", label: "Keys", build: buildKeyHelp },
      { id: "about", label: "About", build: buildAboutHelp }
    ];
  }

  function buildTurnHelp() {
    var out = ["<p>Five registers, revealed one at a time. You do not get to react.</p><ol class='pr-steps'>"];
    for (var i = 0; i < TURN_STEPS.length; i++) {
      out.push("<li><b>" + esc(TURN_STEPS[i].title) + "</b><br>" + esc(TURN_STEPS[i].body) + "</li>");
    }
    return out.join("") + "</ol>";
  }

  /* THE LEGEND LIVES HERE NOW.

     It used to be a strip along the bottom of the screen, where it
     cost the board a row of tiles on every screen in exchange for
     something you read twice and then never again. In the help it
     sits next to the sentence explaining what the tile does, which is
     what you actually wanted when you went looking for it.

     Still rendered rather than written: each swatch is the same
     tileInner the board calls and each name comes from ELEMENT_DEFS,
     so a tile that changes shape changes its own entry. */
  function buildBoardHelp() {
    var C = UI.course, edition = (C && C.edition) || "classic";
    var out = ["<table><tr><th></th><th>Tile</th><th>What it does</th></tr>"];
    var seen = {}, ch;
    for (ch in B.ELEMENT_DEFS) {
      var d = B.ELEMENT_DEFS[ch];
      if (seen[d.name] || d.name === "floor") continue;
      if (d.editions && d.editions.indexOf(edition) < 0) continue;
      seen[d.name] = true;
      out.push("<tr><td>" + legendSwatch(tileInner(probeTile(sampleCode(ch, d)), 0, 0)) +
        "</td><td>" + esc(d.name) + "</td><td>" + esc(elementBlurb(ch, d)) + "</td></tr>");
    }
    /* Flags and lasers are course tokens rather than printed board
       elements, so they are not in ELEMENT_DEFS and are added here. */
    out.push("<tr><td>" + legendSwatch(flagSvg(1)) + "</td><td>flag</td><td>" +
      "Touch them in order. Touching one out of order still moves your archive.</td></tr>");
    out.push("<tr><td>" + legendSwatch(emitterSvg(S)) + "</td><td>board laser</td><td>" +
      "Fires along its line every register, at whatever it reaches first.</td></tr>");
    return out.join("") + "</table>";
  }

  function elementBlurb(ch, d) {
    if (d.belt === 2) return "Moves you two squares. Curves turn you, but only if the belt carried you on.";
    if (d.belt === 1) return "Moves you one square. Will not push a robot that is standing still.";
    if (d.gear) return "Turns you a quarter turn " + (d.gear > 0 ? "clockwise" : "counter-clockwise") + ".";
    if (d.push) return "Shoves you one square, on the registers printed on the tile.";
    if (d.option) return "Repairs 1 damage at the end of the turn and deals you an option card. Sets your archive.";
    if (d.repair) return "Repairs 1 damage at the end of the turn. Sets your archive.";
    if (ch === "o") return "Destroyed. So is walking off the edge of the course.";
    if (ch === "s") return "A starting square in the docking bay.";
    return "Nothing at all, which is rarer than you would like.";
  }

  function buildCardHelp() {
    var out = ["<p>Eighty-four cards. The priority number decides who moves first in a register, and no two cards share one.</p>",
      "<table><tr><th>Card</th><th>Count</th><th>Priority</th><th>Effect</th></tr>"];
    for (var i = 0; i < DECK_RANGES.length; i++) {
      var kind = DECK_RANGES[i][0], lo = DECK_RANGES[i][1], hi = DECK_RANGES[i][2];
      var k = CARD_KINDS[kind];
      var effect = k.turn !== undefined
        ? (k.turn === 2 ? "Turn to face the other way." : "Turn a quarter " + (k.turn > 0 ? "right" : "left") + ".")
        : k.move < 0 ? "Move backwards one square, still facing the same way."
        : "Move " + k.move + " square" + (k.move > 1 ? "s" : "") + " forwards.";
      out.push("<tr><td>" + esc(k.label) + "</td><td>" + DECK_COUNTS[kind] + "</td><td>" + lo + "-" + hi +
        "</td><td>" + esc(effect) + "</td></tr>");
    }
    out.push("</table><p>Damage costs you a card a turn, and from 5 damage it starts locking registers from the right.</p>");
    out.push("<table><tr><th>Damage</th><th>Cards dealt</th><th>Open registers</th></tr>");
    for (var d = 0; d <= MAX_DAMAGE; d++) {
      out.push("<tr><td>" + d + (d === MAX_DAMAGE ? " (wrecked)" : "") + "</td><td>" + cardsDealt(d) +
        "</td><td>" + openRegisters(d) + "</td></tr>");
    }
    return out.join("") + "</table>";
  }

  function buildOptionHelp() {
    var ids = Object.keys(OPTION_DEFS).sort(function (a, b) {
      return OPTION_DEFS[a].name < OPTION_DEFS[b].name ? -1 : 1;
    });
    var out = ["<p>Picked up at upgrade sites. " + OPTION_ROSTER.transcribed + " of the printed " +
      OPTION_ROSTER.printed + " are in this build; the rest are not guessed at, because a card that does " +
      "nearly the right thing is worse than one that is missing.</p><table><tr><th>Card</th><th>Effect</th></tr>"];
    for (var i = 0; i < ids.length; i++) {
      out.push("<tr><td>" + esc(OPTION_DEFS[ids[i]].name) + "</td><td>" + esc(OPTION_DEFS[ids[i]].text) + "</td></tr>");
    }
    return out.join("") + "</table>";
  }

  function buildKeyHelp() {
    var out = ["<table><tr><th>Key</th><th></th></tr>"];
    for (var i = 0; i < KEYS.length; i++) out.push("<tr><td>" + esc(KEYS[i][0]) + "</td><td>" + esc(KEYS[i][1]) + "</td></tr>");
    return out.join("") + "</table>";
  }

  function buildAboutHelp() {
    return "<div class='pr-about'><p><b>PumaRally</b></p>" +
      "<p>A faithful port of the RoboRally rules in original vector art.</p>" +
      "<p>Inspired by <i>RoboRally</i> by Richard Garfield. The rules are reimplemented as code and the " +
      "board layouts as tile data; the artwork here is original and nothing is scanned.</p>" +
      "<p>Built by <a href='https://greykit.com/games/'>greykit.com</a>.</p></div>";
  }

  function showHelp(tabId) {
    var tabs = helpTabs();
    tabId = tabId || UI.helpTab || "turn";
    UI.helpTab = tabId;
    var out = ['<h2>HOW TO PLAY</h2><div class="pr-tabs">'];
    for (var i = 0; i < tabs.length; i++) {
      out.push('<button data-act="helptab" data-tab="' + tabs[i].id + '"' +
        (tabs[i].id === tabId ? ' class="on"' : "") + ">" + esc(tabs[i].label) + "</button>");
    }
    out.push('</div><div class="pr-help-body">');
    for (var j = 0; j < tabs.length; j++) if (tabs[j].id === tabId) out.push(tabs[j].build());
    out.push('</div><div class="pr-modal-foot"><button data-act="closemodal">Close</button></div>');
    openModal(out.join(""));
  }

  /* ============================================================
     TUTORIAL
     Shown once. Its job is to explain the one thing that is not
     obvious from the screen -- that you are committing five moves
     blind -- and then get out of the way.
     ============================================================ */
  var TUTORIAL_KEY = "pumarally_tutorial_v1";
  var TUTORIAL = [
    ["You program, then you watch",
     "Each turn you are dealt program cards and commit five of them, face down, to your five registers. Then all five run, one at a time, and you cannot touch anything until they have."],
    ["The board moves too",
     "After the robots move in a register, the floor takes its turn: conveyors carry, gears turn, pushers shove, lasers fire. Half of what happens to you is the board, not the other robots."],
    ["Damage is the clock",
     "Every point of damage costs you a card next turn. At five, your registers start locking from the right and you are committed to moves you can no longer choose."],
    ["Touch the flags in order",
     "Flag 1, then 2, then 3. Touching one out of order scores nothing, though it does move the archive you respawn on."]
  ];

  function showTutorial(i) {
    i = i || 0;
    if (i >= TUTORIAL.length) {
      try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch (e) {}
      closeModal();
      return;
    }
    openModal("<h2>" + esc(TUTORIAL[i][0]) + "</h2><p>" + esc(TUTORIAL[i][1]) + "</p>" +
      '<div class="pr-modal-foot"><span class="pr-rule-desc">' + (i + 1) + " of " + TUTORIAL.length + "</span>" +
      '<button data-act="tut" data-i="' + (i + 1) + '">' + (i + 1 === TUTORIAL.length ? "Play" : "Next") + "</button>" +
      '<button data-act="tutskip">Skip</button></div>');
  }

  function tutorialSeen() {
    try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch (e) { return true; }
  }

  /* ============================================================
     HOT SEAT
     The curtain is a function of how many humans are SEATED, not of
     whether there are bots. One human against seven robots gets no
     curtain at all, which is the common case and where any friction
     would be pure cost.

     It hides the board as well as the hand: #app goes aria-hidden
     and blurred rather than merely covered, because a screen reader
     happily reads straight through an overlay, and the keyboard
     handler refuses everything but the dismiss -- a delegated
     listener does not know the screen is covered.
     ============================================================ */
  function humanSeats() {
    var n = 0;
    for (var i = 0; i < G.players.length; i++) if (isHuman(G.players[i]) && !G.players[i].out) n++;
    return n;
  }

  function needsCurtain() {
    return !UI.headless && !UI.autoHuman && humanSeats() > 1;
  }

  function curtainUp() {
    if (!G || G.gameOver || !needsCurtain()) return false;
    if (!inPhase("turn", "program")) return false;       // execution is public, as at the table
    var p = actor();
    return !!p && UI.curtainCleared !== p.id;
  }

  function renderCurtain() {
    var on = curtainUp(), el2 = UI.els.curtain;
    if (!on) {
      /* Unconditional: the blur class lives on the host element, which
         outlives a remount, so a cleanup gated on the curtain having
         been visible leaves the whole page blurred forever. */
      el2.hidden = true;
      UI.els.main.removeAttribute("aria-hidden");
      UI.els.program.removeAttribute("aria-hidden");
      UI.els.host.classList.remove("pr-curtained");
      return;
    }
    var p = actor();
    el2.innerHTML = "<h2>Pass to " + esc(p.name) + "</h2>" +
      "<p>Everyone else look away.</p>" +
      '<button data-act="ready">' + esc(p.name) + " is ready</button>";
    el2.hidden = false;
    UI.els.main.setAttribute("aria-hidden", "true");
    UI.els.program.setAttribute("aria-hidden", "true");
    UI.els.host.classList.add("pr-curtained");
  }

  function onReady() {
    var p = actor();
    if (!p) return;
    UI.curtainCleared = p.id;
    announce(p.name + " is programming.");
    updateAll();
  }

  /* ============================================================
     SCREENSHOT STATES
     #shot=setup|midgame|gameover drives the game to a fixed state
     from a fixed seed, so the README images are reproducible rather
     than whatever happened to be on screen.
     ============================================================ */
  function applyShotState(name) {
    UI.headless = true; UI.autoHuman = false;
    UI.wallsChecked = false;
    newGame(7, { players: 4, humans: 1, skill: 2, startOptions: 2 });
    var target = name === "midgame" ? 6 : name === "gameover" ? MAX_TURNS : 1;
    var guard = 0;
    /* Deliberately NOT autoHuman. With every seat botted, one advance()
       plays the entire game before the loop gets to look at the turn
       counter, and "midgame" lands on the final screen. Leaving the
       human seat human makes the machine stop once a turn, which is
       the only place a turn count can be read. */
    while (!G.gameOver && G.turn < target && guard++ < 400) {
      advance();
      if (G.gameOver) break;
      /* There are TWO places the machine waits for a human, and a
         driver that is not autoHuman has to answer both. Handling
         only the programming one leaves this spinning forever on the
         first option card that asks a question. */
      if (inPhase("exec", "optionChoice") && G.pendingChoices.length) {
        var ch = G.pendingChoices[0];
        G.optionAnswers[ch.key] = botPick(G.players[ch.owner], ch);
        G.pendingChoices.shift();
        continue;
      }
      if (inPhase("turn", "program") && G.actor !== undefined) {
        var seat = G.players[G.actor];
        if (seat && seat.alive) applyProgram(seat, botProgram(seat));
      }
    }
    UI.headless = false; UI.autoHuman = false;

    /* The sim drove the human seat too, so its cards are already
       committed and a programming screenshot would show an empty
       hand. Re-deal that seat and half-fill it, which is what the
       screen actually looks like when someone is deciding. */
    if (name !== "gameover") {
      G.phase = "turn"; G.step = "program"; G.actor = 0;
      var me = G.players[0];
      if (!me.alive) { me.alive = true; me.damage = 2; }
      discardCards(me.hand);
      discardCards(me.registers);
      me.registers = [null, null, null, null, null];
      me.dealtCount = cardsDealt(me.damage);
      me.hand = draw(me.dealtCount);
      for (var i = 0; i < 2 && me.hand.length; i++) me.registers[i] = me.hand.shift();
    }
    updateAll();
    if (G.gameOver) renderGameOver();
  }

  /* ============================================================
     BOARD EDITOR

     Reached at #edit, or #edit=<boardId> to open a shipped board.

     It exists because the twelve official boards are ~1,700 tiles
     that have to come off photographs, and describing a board to
     someone in prose is how a plausible, wrong map gets made. So:
     drop a photograph behind the grid, trace it, and paste the
     export straight back into pumarally-boards.js -- formatBoard
     emits the shipped style byte for byte, and CI asserts that.

     The reference image never leaves the machine and is never part
     of the export. URL.createObjectURL, nothing uploaded, and the
     repo keeps original art and transcribed layout data only.
     ============================================================ */
  var ED_KEY = "pumarally_editor_v1";

  var ED_TOOLS = [
    { key: "..", label: "Floor" },
    { key: "b", label: "Conveyor", dir: true },
    { key: "B", label: "Express", dir: true },
    { key: "l", label: "Gear CCW" },
    { key: "r", label: "Gear CW" },
    { key: "p", label: "Pusher 1/3/5", dir: true },
    { key: "P", label: "Pusher 2/4", dir: true },
    { key: "o", label: "Pit" },
    { key: "w", label: "Repair" },
    { key: "W", label: "Upgrade" },
    { key: "s", label: "Docking bay", digit: true }
  ];

  var ED = null;

  function edNew(w, h) {
    var g = B.blankGrid(w, h);
    for (var i = 0; i < w * h; i++) g.cell[i] = "..";
    g.name = "New Board"; g.origin = "transcribed"; g.notes = "";
    g.flags = [];
    return g;
  }

  function edLoadShipped(id) {
    var g = B.parsePic(id, B.BOARD_SPECS[id]);
    g.flags = [];
    return g;
  }

  function edState(grid, id) {
    return {
      id: id || "newBoard",
      grid: grid,
      tool: "b",
      dir: N,
      digit: 1,
      laserN: 1,
      mode: "tile",              // tile | wall | laser
      underlay: null,            // an object URL, never exported
      opacity: 0.5,
      offX: 0, offY: 0, zoom: 2, uScale: 1,
      errors: [],
      warnings: []
    };
  }

  /* Autosave the DATA, never the reference image: a 40-minute
     transcription must survive a reload, and an object URL would not
     be valid after one anyway. */
  function edSave() {
    try {
      localStorage.setItem(ED_KEY, JSON.stringify({
        id: ED.id, w: ED.grid.w, h: ED.grid.h,
        name: ED.grid.name, notes: ED.grid.notes,
        pic: B.gridToPic(ED.grid),
        lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; })
      }));
    } catch (e) {}
  }

  function edRestore() {
    try {
      var s = JSON.parse(localStorage.getItem(ED_KEY) || "null");
      if (!s || !s.pic) return null;
      var g = B.parsePic(s.id, { w: s.w, h: s.h, pic: s.pic, lasers: s.lasers || [] });
      g.name = s.name || "New Board"; g.notes = s.notes || ""; g.origin = "transcribed"; g.flags = [];
      return edState(g, s.id);
    } catch (e) { return null; }
  }

  function edValidate() {
    ED.errors = []; ED.warnings = [];
    try {
      B.validateGrid(ED.id, ED.grid, function (id, m) { ED.warnings.push(m); });
    } catch (e) {
      ED.errors.push(e.message);
    }
  }

  function edSetCell(c, r, code) {
    if (!B.inGrid(ED.grid, c, r)) return;
    ED.grid.cell[r * ED.grid.w + c] = code;
  }

  function edToolCode() {
    var t = null;
    for (var i = 0; i < ED_TOOLS.length; i++) if (ED_TOOLS[i].key === ED.tool) t = ED_TOOLS[i];
    if (!t) return "..";
    if (t.key === "..") return "..";
    if (t.dir) return t.key + B.DIR_CHARS.charAt(ED.dir);
    if (t.digit) return t.key + ED.digit;
    return t.key + ".";
  }

  function edRender() {
    var host = UI.els.edBoard;
    var C = edCourseView();
    var tile = Math.round(TILE * ED.zoom);
    var w = C.w * tile, h = C.h * tile;
    var out = [], c, r;

    host.innerHTML = "";
    host.style.width = w + "px";
    host.style.height = h + "px";
    host.style.setProperty("--tile", tile + "px");
    host.style.setProperty("--cols", C.w);

    /* The board being traced, drawn exactly the way the game draws it
       -- same tileClasses, same tileInner. That is the whole point of
       the workshop being WYSIWYG: there is no second renderer to
       drift from the first. */
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        out.push('<div class="' + tileClasses(C, c, r).join(" ") + '" data-c="' + c + '" data-r="' + r +
          '">' + tileInner(C, c, r) + "</div>");
      }
    }
    var board = el("div", "pr-grid");
    board.style.width = w + "px";
    board.style.height = h + "px";
    board.innerHTML = out.join("");
    host.appendChild(board);

    var beams = el("div", "pr-beams");
    beams.style.width = w + "px";
    beams.style.height = h + "px";
    beams.innerHTML = beamSpans(C);
    host.appendChild(beams);

    var walls = el("div", "pr-walls");
    walls.style.width = w + "px";
    walls.style.height = h + "px";
    walls.innerHTML = wallSpans(C);
    host.appendChild(walls);

    /* The reference photograph sits ABOVE the traced board at an
       adjustable opacity, so you are always comparing your work with
       the thing it is a transcription of. It is never exported. */
    if (ED.underlay) {
      var img = document.createElement("img");
      img.className = "pr-ed-under";
      img.src = ED.underlay;
      img.style.opacity = ED.opacity;
      img.style.left = ED.offX + "px";
      img.style.top = ED.offY + "px";
      img.style.width = (w * ED.uScale) + "px";
      host.appendChild(img);
    }

    var hits = el("div", "pr-ed-grid");
    hits.style.gridTemplateColumns = "repeat(" + C.w + "," + tile + "px)";
    hits.style.gridAutoRows = tile + "px";
    out = [];
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        out.push('<div class="pr-ed-cell" data-c="' + c + '" data-r="' + r +
          '" title="' + c + "," + r + '"></div>');
      }
    }
    hits.innerHTML = out.join("");
    host.appendChild(hits);
    edRenderPanel();
  }

  /* The tile renderer wants something course-shaped. A board being
     edited is one board with no flags, which is exactly that. */
  function edCourseView() {
    ED.grid.flags = ED.grid.flags || [];
    ED.grid.id = ED.id;
    return ED.grid;
  }

  function edRenderPanel() {
    var out = ['<div class="pr-ed-row">'];
    for (var i = 0; i < ED_TOOLS.length; i++) {
      var t = ED_TOOLS[i];
      out.push('<button data-act="edtool" data-k="' + esc(t.key) + '"' +
        (ED.mode === "tile" && ED.tool === t.key ? ' class="on"' : "") + ">" + esc(t.label) + "</button>");
    }
    out.push('<button data-act="edmode" data-m="wall"' + (ED.mode === "wall" ? ' class="on"' : "") + ">Walls</button>");
    out.push('<button data-act="edmode" data-m="laser"' + (ED.mode === "laser" ? ' class="on"' : "") + ">Lasers</button>");
    out.push("</div>");

    out.push('<div class="pr-ed-row"><span>Facing</span>');
    for (var d = 0; d < 4; d++) {
      out.push('<button data-act="eddir" data-d="' + d + '"' + (ED.dir === d ? ' class="on"' : "") + ">" +
        esc(B.dirName(d)) + "</button>");
    }
    out.push('<span>Bay</span>');
    for (var n = 1; n <= 8; n++) {
      out.push('<button data-act="eddigit" data-n="' + n + '"' + (ED.digit === n ? ' class="on"' : "") + ">" + n + "</button>");
    }
    out.push('<span>Laser</span>');
    for (var ln = 1; ln <= 3; ln++) {
      out.push('<button data-act="edlaser" data-n="' + ln + '"' + (ED.laserN === ln ? ' class="on"' : "") + ">" + ln + "</button>");
    }
    out.push("</div>");

    out.push('<div class="pr-ed-row"><span>Reference</span>' +
      '<input type="file" accept="image/*" data-act="edimg">' +
      '<span>Fade</span><input type="range" min="0" max="100" value="' + Math.round(ED.opacity * 100) + '" data-act="edop">' +
      '<span>Size</span><input type="range" min="50" max="200" value="' + Math.round(ED.uScale * 100) + '" data-act="edscale">' +
      '<button data-act="ednudge" data-dx="-4" data-dy="0">&larr;</button>' +
      '<button data-act="ednudge" data-dx="4" data-dy="0">&rarr;</button>' +
      '<button data-act="ednudge" data-dx="0" data-dy="-4">&uarr;</button>' +
      '<button data-act="ednudge" data-dx="0" data-dy="4">&darr;</button>' +
      '<button data-act="edclearimg">Remove</button></div>');

    out.push('<div class="pr-ed-row"><span>Board</span>' +
      '<input type="text" data-act="edid" value="' + esc(ED.id) + '" size="14" aria-label="board id">' +
      '<input type="text" data-act="edname" value="' + esc(ED.grid.name) + '" size="18" aria-label="board name">' +
      '<button data-act="edexport">Export</button>' +
      '<button data-act="edplay">Test play</button>' +
      '<button data-act="edquit">Leave editor</button></div>');

    var msg = "";
    if (ED.errors.length) {
      msg = '<div class="pr-ed-bad"><b>' + ED.errors.length + " problem" + (ED.errors.length > 1 ? "s" : "") + "</b><br>" +
        ED.errors.map(esc).join("<br>") + "</div>";
    } else {
      msg = '<div class="pr-ed-ok">Valid board.' +
        (ED.warnings.length ? " " + ED.warnings.length + " warning: " + esc(ED.warnings[0]) : "") + "</div>";
    }
    out.push(msg);
    UI.els.edPanel.innerHTML = out.join("");
  }

  function edExport() {
    edValidate();
    var text = B.formatBoard(ED.id, ED.grid,
      { name: ED.grid.name, origin: ED.grid.origin || "transcribed", notes: ED.grid.notes });
    openModal("<h2>PASTE INTO pumarally-boards.js</h2>" +
      (ED.errors.length ? '<p class="pr-ed-bad">This board does not validate yet: ' + esc(ED.errors[0]) + "</p>" : "") +
      '<textarea class="pr-ed-out" rows="16" readonly>' + esc(text) + "</textarea>" +
      '<div class="pr-modal-foot"><button data-act="edcopy">Copy</button>' +
      '<button data-act="closemodal">Close</button></div>');
  }

  function edHit(e) {
    var cell = e.target.closest(".pr-ed-cell");
    if (!cell) return null;
    var c = parseInt(cell.dataset.c, 10), r = parseInt(cell.dataset.r, 10);
    var box = cell.getBoundingClientRect();
    var fx = (e.clientX - box.left) / box.width, fy = (e.clientY - box.top) / box.height;
    var edge = null, m = 0.22;
    if (fy < m) edge = N; else if (fy > 1 - m) edge = S;
    else if (fx < m) edge = W; else if (fx > 1 - m) edge = E;
    return { c: c, r: r, edge: edge, fx: fx, fy: fy };
  }

  function edClick(e, erase) {
    var hit = edHit(e);
    if (!hit) return;
    if (ED.mode === "wall") {
      if (hit.edge === null) return;
      B.setWall(ED.grid, hit.c, hit.r, hit.edge, !B.wallAt(ED.grid, hit.c, hit.r, hit.edge));
    } else if (ED.mode === "laser") {
      var found = -1;
      for (var i = 0; i < ED.grid.lasers.length; i++) {
        if (ED.grid.lasers[i].c === hit.c && ED.grid.lasers[i].r === hit.r) found = i;
      }
      if (found >= 0) ED.grid.lasers.splice(found, 1);
      if (!erase && found < 0) ED.grid.lasers.push({ c: hit.c, r: hit.r, d: ED.dir, n: ED.laserN });
    } else {
      edSetCell(hit.c, hit.r, erase ? ".." : edToolCode());
    }
    edValidate();
    edSave();
    edRender();
  }

  function edMount(host, bootId) {
    injectCSS();
    host.classList.add("pr-root", "pr-editing");
    host.innerHTML = "";

    var restored = edRestore();
    if (bootId && B.BOARD_SPECS[bootId]) ED = edState(edLoadShipped(bootId), bootId);
    else if (restored) ED = restored;
    else ED = edState(edNew(12, 12), "newBoard");
    ED.uScale = ED.uScale || 1;

    var hud = el("div", "pr-hud",
      '<h1 class="pr-title">BOARD WORKSHOP</h1>' +
      '<span class="pr-phase">Trace a photograph, export the source.</span>');
    var stage = el("div", "pr-ed-stage");
    var panel = el("div", "pr-ed-panel");
    var overlay = el("div", "pr-overlay");
    overlay.hidden = true;
    var sr = el("div", "pr-sr");
    sr.setAttribute("aria-live", "polite");

    host.appendChild(hud);
    host.appendChild(panel);
    host.appendChild(stage);
    host.appendChild(overlay);
    host.appendChild(sr);

    UI.els = { host: host, edBoard: stage, edPanel: panel, overlay: overlay, sr: sr };
    UI.mounted = false;                 // there is no game here to render

    stage.addEventListener("click", function (e) { edClick(e, false); });
    stage.addEventListener("contextmenu", function (e) { e.preventDefault(); edClick(e, true); });
    host.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (b && !b.disabled) edDispatch(b, e);
    });
    host.addEventListener("input", function (e) {
      var b = e.target.closest("[data-act]");
      if (b) edDispatch(b, e);
    });
    host.addEventListener("change", function (e) {
      var b = e.target.closest("[data-act=edimg]");
      if (b) edLoadImage(b.files && b.files[0]);
    });
    document.addEventListener("keydown", edKey);

    edValidate();
    edRender();
  }

  function edKey(e) {
    if (!ED || modalOpen()) return;
    if (e.key === "r" || e.key === "R") { ED.dir = B.rot(ED.dir, 1); edRenderPanel(); }
    else if (e.key === "w" || e.key === "W") { ED.mode = ED.mode === "wall" ? "tile" : "wall"; edRenderPanel(); }
    else if (e.key === "Escape" && modalOpen()) closeModal();
  }

  function edLoadImage(file) {
    if (!file) return;
    if (ED.underlay) { try { URL.revokeObjectURL(ED.underlay); } catch (e) {} }
    ED.underlay = URL.createObjectURL(file);
    announce("Reference image loaded. It stays on this machine and is never exported.");
    edRender();
  }

  function edDispatch(b, e) {
    var a = b.dataset.act;
    if (a === "edtool") { ED.mode = "tile"; ED.tool = b.dataset.k; edRenderPanel(); }
    else if (a === "edmode") { ED.mode = ED.mode === b.dataset.m ? "tile" : b.dataset.m; edRenderPanel(); }
    else if (a === "eddir") { ED.dir = parseInt(b.dataset.d, 10); edRenderPanel(); }
    else if (a === "eddigit") { ED.digit = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edlaser") { ED.laserN = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edop") { ED.opacity = parseInt(b.value, 10) / 100; edRender(); }
    else if (a === "edscale") { ED.uScale = parseInt(b.value, 10) / 100; edRender(); }
    else if (a === "ednudge") { ED.offX += parseInt(b.dataset.dx, 10); ED.offY += parseInt(b.dataset.dy, 10); edRender(); }
    else if (a === "edclearimg") { ED.underlay = null; edRender(); }
    else if (a === "edid") { ED.id = b.value.replace(/[^A-Za-z0-9_]/g, "") || "newBoard"; edSave(); }
    else if (a === "edname") { ED.grid.name = b.value; edSave(); }
    else if (a === "edexport") edExport();
    else if (a === "edcopy") {
      var ta = UI.els.overlay.querySelector("textarea");
      if (ta) { ta.select(); try { document.execCommand("copy"); announce("Copied."); } catch (err) {} }
    }
    else if (a === "edplay") edTestPlay();
    else if (a === "edquit") { root.location.hash = ""; root.location.reload(); }
    else if (a === "closemodal") closeModal();
  }

  /* Play the board being edited without shipping it: a temporary
     board and course, three flags dropped on legal squares. */
  function edTestPlay() {
    edValidate();
    if (ED.errors.length) { announce("Fix the board first: " + ED.errors[0]); edRenderPanel(); return; }
    var spec = { w: ED.grid.w, h: ED.grid.h, pic: B.gridToPic(ED.grid), name: ED.grid.name, origin: "authored",
                 lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }) };
    B.BOARD_SPECS.__editorTest = spec;
    var spots = [];
    for (var r = 0; r < ED.grid.h && spots.length < 3; r++) {
      for (var c = 0; c < ED.grid.w && spots.length < 3; c++) {
        if (B.isPit(B.codeAt(ED.grid, c, r))) continue;
        if ((c + r) % 4) continue;
        spots.push([c, r]);
      }
    }
    if (spots.length < 3) { announce("Not enough open squares to place flags."); return; }
    B.COURSES.__editorTest = {
      name: ED.grid.name + " (test)",
      boards: [{ id: "__editorTest", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, ED.grid.h] },
      flags: spots, minPlayers: 2, maxPlayers: 8
    };
    try { B.validateCourse("__editorTest", function () {}); }
    catch (err) { announce("Test course will not build: " + err.message); return; }
    root.location.hash = "";
    document.removeEventListener("keydown", edKey);
    ED = null;
    mount(UI.els.host, { course: "__editorTest" });
  }

  /* ============================================================
     BOARD SIZING

     The old rule here was that the board took the largest WHOLE
     multiple of the tile that fit, because pixel art only survives
     integer scaling: at 1.5x some sprite pixels land on two screen
     pixels and their neighbours on one, and a conveyor's slats come
     out unevenly spaced. Vector art has no pixel grid to smear, so
     that constraint is gone and the board simply takes the room it
     is given, between a floor that stays legible and a cap that
     stops a 12-wide course from filling a wide desktop -- at which
     point you are reading a tile instead of the board.
     ============================================================ */
  var TILE_MIN = 20, TILE_MAX = 64;

  /* THE BOARD IS SIZED BY HEIGHT AS WELL AS WIDTH.

     Sizing on width alone is what made the board and the cards
     unable to share a screen: a twelve-wide course in a wide column
     picks a big tile, and the sixteen rows that tile implies then run
     off the bottom. The limit that binds is nearly always the
     vertical one, so it has to be in the sum. */
  function fitTile(C, width, height, opts) {
    if (opts.scale) return opts.scale * TILE;
    var cap = opts.maxScale ? opts.maxScale * TILE : TILE_MAX;
    var byW = Math.floor(width / C.w);
    var byH = height > 0 ? Math.floor(height / C.h) : byW;
    return Math.max(TILE_MIN, Math.min(cap, byW, byH));
  }

  /* EVERYTHING ON THE PAGE ABOVE AND BELOW THE GAME ROW.

     Two earlier attempts at this were circular and both failed the
     same way. Itemising the parts (hud, legend, side) missed the
     shell's own banner and footer, which are not ours to know about.
     Measuring the remainder -- document minus the row -- then fed the
     row's own clamp back into the number that sets the clamp, and the
     tile spiralled down to its minimum.

     Above and below are independent of how tall the row is, so this
     one settles in a single pass and cannot chase itself. */
  function chromeHeight() {
    if (typeof document === "undefined" || !UI.els || !UI.els.main) return 0;
    var m = UI.els.main.getBoundingClientRect();
    var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
    var mainBottom = m.bottom + sy;

    /* The bottom of the real CONTENT, found by asking the elements.
       scrollHeight is no use here: a document is always at least as
       tall as its window, so on a screen taller than the page it grows
       with the window -- and since it is subtracted, the extra room a
       taller window gives is cancelled exactly as fast as it appears.
       That is why the board would not grow past a certain size however
       tall the screen got. */
    var bottom = mainBottom, kids = document.body.children, i, r;
    for (i = 0; i < kids.length; i++) {
      r = kids[i].getBoundingClientRect();
      if (r.height) bottom = Math.max(bottom, r.bottom + sy);
    }
    return Math.max(0, m.top + sy) + Math.max(0, bottom - mainBottom);
  }

  function fitBoard(C, host, opts) {
    var avail = host.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960);
    var cs = (typeof getComputedStyle === "function") ? getComputedStyle(host) : null;
    if (cs) avail -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var sideW = 0, beside = false;
    if (UI.els && UI.els.side) {
      var sr = UI.els.side.getBoundingClientRect();
      /* Only subtract the column when it really is a column. Below the
         breakpoint it wraps under the board and costs height instead. */
      beside = !!(sr.width && sr.width < avail - 100);
      if (beside) sideW = sr.width + 12;
    }
    avail -= sideW;

    /* Measure with any previous clamp lifted: a stale one changes where
       the row ends, and where the row ends is half the measurement. */
    UI.els.main.style.maxHeight = "";
    UI.els.side.style.height = "";
    var vh = (typeof window !== "undefined" ? window.innerHeight : 0);
    var availH = vh ? Math.max(0, vh - chromeHeight() - 10) : 0;

    var tile = fitTile(C, avail, availH, opts);
    var w = C.w * tile, h = C.h * tile;
    UI.tile = tile;
    /* Bound the row and the column, so neither can push the page past
       the window. What overflows inside the column scrolls: the log is
       the thing with no natural end, so the log is what gives. */
    if (availH) {
      UI.els.main.style.maxHeight = availH + "px";
      /* A definite HEIGHT, not a maximum, and only while the side is a
         column. flex:1 1 0 on the log divides whatever is spare, and a
         max-height leaves the column sized to its content -- so there
         is never anything spare and the log collapses to its heading
         however much room the window has. Stacked, it takes its
         natural height like any other block. */
      UI.els.side.style.height = beside ? availH + "px" : "";
    }
    var st = UI.els.stage.style;
    st.width = w + "px"; st.height = h + "px";
    st.setProperty("--tile", tile + "px");
    st.setProperty("--cols", C.w);
    UI.els.grid.style.width = w + "px";
    UI.els.grid.style.height = h + "px";
    UI.els.beams.style.width = w + "px";
    UI.els.beams.style.height = h + "px";
    UI.els.walls.style.width = w + "px";
    UI.els.walls.style.height = h + "px";
    UI.els.pieces.style.width = w + "px";
    UI.els.pieces.style.height = h + "px";
    if (UI.mounted) renderPieces();
  }

  /* ============================================================
     MOUNT
     ============================================================ */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  /* NOTE: do not declare a local named `opts` anywhere in here. A
     `var` declaration hoists over the whole function, so a DOM node
     called opts silently replaces the settings object from the line
     it is declared -- and only for the code AFTER the point where
     UI.opts was already assigned, which is what makes it look fine
     from the outside. That bug shipped once and cost data-scale,
     data-max-scale and the editor's test-play course. */
  function mount(host, opts) {
    opts = opts || {};
    injectCSS();
    host.classList.add("pr-root");
    host.innerHTML = "";
    UI.opts = opts;

    houseRules = loadRules();
    var courseId = chosenCourse(opts);
    var C;
    try {
      validateTables();
      B.validateAll();
      C = B.buildCourse(courseId);
    } catch (e) {
      var pre = el("div", "pr-err");
      pre.textContent = "PumaRally failed to load:\n" + e.message;
      host.appendChild(pre);
      throw e;
    }

    var hud = el("div", "pr-hud",
      '<h1 class="pr-title">PUMARALLY</h1><span class="pr-phase"></span>' +
      '<span class="pr-hud-spacer"></span>' +
      '<button data-act="setup">Set up</button><button data-act="help">Help</button>' +
      '<button data-act="speed">Speed</button><button data-act="mute">Sound</button>' +
      '<button data-act="new">New game</button>');

    var stage = el("div", "pr-stage");
    var grid = el("div", "pr-grid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", describeCourse(C));
    var beams = el("div", "pr-beams");
    beams.setAttribute("aria-hidden", "true");
    var walls = el("div", "pr-walls");
    walls.setAttribute("aria-hidden", "true");
    var pieces = el("div", "pr-pieces");
    pieces.setAttribute("aria-hidden", "true");
    stage.appendChild(grid); stage.appendChild(beams);
    stage.appendChild(walls); stage.appendChild(pieces);

    var side = el("aside", "pr-side");
    var players = el("div", "pr-panel");
    players.innerHTML = "<h2>ROBOTS</h2>";
    var playersBody = el("div");
    players.appendChild(playersBody);
    var logPanel = el("div", "pr-panel");
    logPanel.innerHTML = "<h2>LOG</h2>";
    var logBody = el("div", "pr-log");
    logBody.setAttribute("aria-live", "polite");
    logPanel.appendChild(logBody);
    side.appendChild(players); side.appendChild(logPanel);

    var main = el("div", "pr-main");
    main.appendChild(stage); main.appendChild(side);

    var program = el("div", "pr-program");
    /* Two named rows rather than two anonymous ones: with cards in both
       and a card able to move between them, "which row is which" has to
       be readable without inferring it from what happens to be in
       them. */
    var regsWrap = el("div", "pr-row pr-row-regs", '<h2>Registers</h2>');
    var regs = el("div", "pr-regs");
    regsWrap.appendChild(regs);
    var handWrap = el("div", "pr-row pr-row-hand", '<h2>Your hand</h2>');
    var hand = el("div", "pr-hand");
    handWrap.appendChild(hand);
    var controls = el("div", "pr-controls",
      '<button data-act="run">Run registers</button>' +
      '<button data-act="clear">Clear</button>' +
      '<button data-act="down">Power down</button>');
    var hint = el("div", "pr-hint");
    var choice = el("div", "pr-choice");
    choice.hidden = true;
    var optsRow = el("div", "pr-opts");
    program.appendChild(regsWrap); program.appendChild(handWrap);
    program.appendChild(controls); program.appendChild(choice);
    program.appendChild(optsRow); program.appendChild(hint);

    /* The program goes BESIDE the board, not under it.

       A course is twelve squares wide and sixteen tall counting the
       docking bay, so stacking the cards beneath it puts one or the
       other off a laptop screen whatever size the tiles are -- and a
       player who has to scroll to see the board while choosing cards
       for it is playing two half-games. The board is tall and the card
       rows are wide, so they go side by side and each gets the axis it
       needs.

       It goes in FIRST, above the robots and the log: it is the thing
       you act on, and the two panels below it are reference. */
    side.insertBefore(program, side.firstChild);

    var banner = el("div", "pr-banner");
    banner.hidden = true;
    var overlay = el("div", "pr-overlay");
    overlay.hidden = true;
    var curtain = el("div", "pr-curtain");
    curtain.hidden = true;
    var sr = el("div", "pr-sr");
    sr.setAttribute("aria-live", "assertive");

    host.appendChild(hud); host.appendChild(banner); host.appendChild(main);
    host.appendChild(sr);
    host.appendChild(overlay); host.appendChild(curtain);

    UI.els = { host: host, hud: hud, stage: stage, grid: grid, beams: beams, walls: walls,
      program: program,
               pieces: pieces, side: side, players: playersBody, log: logBody,
               regs: regs, hand: hand, hint: hint, banner: banner, sr: sr,
               choice: choice, opts: optsRow, main: main, overlay: overlay, curtain: curtain,
               run: controls.querySelector("[data-act=run]"),
               clear: controls.querySelector("[data-act=clear]"),
               down: controls.querySelector("[data-act=down]") };
    UI.pieceEls = {};
    UI.pieceFace = {}; UI.pieceDeg = {}; UI.pieceHurt = {};
    /* The register row is cached across renders so the flip can
       animate; a remount throws that DOM away, so the cache has to go
       with it or renderProgram patches elements nothing can see. */
    UI.slotEls = null;
    UI.drag = null;
    UI.course = C;
    UI.mounted = true;
    try { UI.speed = Math.min(2, Math.max(0, parseInt(localStorage.getItem(SPEED_KEY), 10) || 1)); } catch (e) { UI.speed = 1; }
    try { UI.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { UI.muted = false; }

    fitBoard(C, host, opts);
    /* And again once the browser has laid the page out. The first call
       runs while the shell's banner, our legend and the footer are all
       still finding their heights, so "how much room is below the row"
       is not yet a real number -- and that number is half the height
       budget. Measured a frame later it is exact. */
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { if (UI.mounted) fitBoard(C, host, opts); });
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("load", function () { if (UI.mounted) fitBoard(C, host, opts); });
    }
    buildGridCells(C);
    setupInput(host);

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", function () { fitBoard(C, host, opts); });
    }

    var shot = /[#&]shot=([a-z]+)/.exec(root.location ? root.location.hash : "");
    if (shot) { applyShotState(shot[1]); return { course: C, stage: stage }; }

    var resumed = loadGame();
    if (resumed && resumed.courseId === C.id) {
      G = resumed;
      UI.wallsChecked = false;
      log("Resumed from a saved game.");
    } else {
      UI.wallsChecked = false;
      newGame((Math.random() * 1e9) | 0, gameOpts(opts, courseId));
    }
    updateAll();
    advance();
    if (!tutorialSeen()) showTutorial(0);
    return { course: C, stage: stage };
  }

  /* Every square is a real element with a real label, so a screen
     reader gets the board rather than one image with a caption. The
     cells were built for that when the board was a canvas drawn
     underneath them; now they ARE the board, and the label and the
     drawing are generated side by side from the same tile. */
  function buildGridCells(C) {
    var out = [], c, r;
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        out.push('<div class="' + tileClasses(C, c, r).join(" ") + '" role="gridcell" tabindex="-1"' +
          ' data-c="' + c + '" data-r="' + r + '" aria-label="' + esc(describeTile(C, c, r)) + '">' +
          tileInner(C, c, r) + "</div>");
      }
    }
    UI.els.grid.innerHTML = out.join("");
    UI.els.beams.innerHTML = beamSpans(C);
    UI.els.walls.innerHTML = wallSpans(C);
  }

  function describeTile(C, c, r) {
    if (B.isVoid(C, c, r)) return "column " + (c + 1) + " row " + (r + 1) + ", off the course";
    var code = B.codeAt(C, c, r), def = B.elemOf(code), parts = [];
    parts.push("column " + (c + 1) + " row " + (r + 1));
    if (def && def.name !== "floor") {
      parts.push(def.name + (def.arg === "dir" ? " " + B.dirName(B.dirOf(code)) : ""));
    }
    for (var f = 0; f < C.flags.length; f++) if (C.flags[f].c === c && C.flags[f].r === r) parts.push("flag " + C.flags[f].n);
    for (var d = 0; d < 4; d++) if (B.wallAt(C, c, r, d)) parts.push("wall " + B.dirName(d));
    return parts.join(", ");
  }

  function describeCourse(C) {
    var counts = {}, c, r;
    for (r = 0; r < C.h; r++) for (c = 0; c < C.w; c++) {
      if (B.isVoid(C, c, r)) continue;
      var def = B.elemOf(B.codeAt(C, c, r));
      counts[def.name] = (counts[def.name] || 0) + 1;
    }
    var parts = [];
    for (var k in counts) if (k !== "floor") parts.push(counts[k] + " " + k);
    return C.name + ", " + C.w + " by " + C.h + " squares, " + C.flags.length +
      " flags. Contains " + parts.join(", ") + ".";
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-pumarally]");
    var edit = /[#&]edit(?:=([A-Za-z0-9_]+))?/.exec(root.location ? root.location.hash : "");
    if (edit && nodes.length) { edMount(nodes[0], edit[1]); return; }
    for (var i = 0; i < nodes.length; i++) {
      mount(nodes[i], {
        course: nodes[i].getAttribute("data-course") || undefined,
        scale: parseFloat(nodes[i].getAttribute("data-scale")) || undefined,
        maxScale: parseFloat(nodes[i].getAttribute("data-max-scale")) || undefined
      });
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }


  /* ============================================================
     DEBUG HOOKS
     ============================================================ */
  root.__PR = {
    B: B,
    mount: mount,
    TOKENS: TOKENS, ROBOT_SVG: ROBOT_SVG,
    LIVERIES: LIVERIES,
    PROGRAM_DECK: PROGRAM_DECK,
    openRegisters: openRegisters,
    cardsDealt: cardsDealt,
    validateTables: validateTables,
    buildCourse: function (id) { return B.buildCourse(id); },
    tileInner: tileInner, tileClasses: tileClasses, cardArt: cardArt, flagSvg: flagSvg,
    newGame: function (seed, opts) { UI.wallsChecked = false; return newGame(seed, opts); },
    advance: advance,
    runSim: runSim,
    ruleTests: ruleTests,
    OPTION_DEFS: OPTION_DEFS,
    TURN_STEPS: TURN_STEPS,
    SLIDER_DEFS: SLIDER_DEFS,
    DIFFICULTY_PRESETS: DIFFICULTY_PRESETS,
    applyProgram: applyProgram,
    botProgram: botProgram,
    applyShotState: applyShotState,
    edMount: function (host, id) { return edMount(host || document.querySelector("[data-pumarally]"), id); },
    get ED() { return ED; },
    showHelp: function (t) { return showHelp(t); },
    showSetup: function () { return showSetup(); },
    OPTION_ROSTER: OPTION_ROSTER,
    HOOKS: HOOKS,
    RULE_TESTS: RULE_TESTS,
    assertInvariants: assertInvariants,
    get G() { return G; },
    get UI() { return UI; }
  };

  root.PumaRally = { mount: mount };

})(typeof self !== "undefined" ? self : this);
