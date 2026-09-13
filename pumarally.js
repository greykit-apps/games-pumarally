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
    /* An empty slot: visible without competing. Was #2c3b60 at 1.82:1,
       under the 3:1 floor for a control boundary -- and this boundary
       IS the affordance telling you where a card goes. Same hue,
       raised in value until it clears: 3.14:1 on a panel. */
    borderLit: "#47609c",
    line: "#141d33",          /* the grid hairline, a shade under the border */
    accent: "#54f2ff",        /* express conveyors, headings, focus */
    accentDim: "#2b7f92",
    text: "#dbe4fb",
    ink: "#8b96b8",
    /* Lifted from #5b6884, which measured 3.45:1 on a panel -- under
       the 4.5:1 floor, and used for the smallest text on the screen:
       card priorities, ruleset years, the "needs X" course hints. */
    dim: "#7d8aa8",
    rust: "#d2713f",          /* conveyors */
    warn: "#ffb000",          /* pushers, flags */
    danger: "#ff5266",        /* lasers, pits */
    good: "#4ade6a",          /* repair */
    violet: "#b47dff",        /* upgrade */
    steel: "#94a0c4",         /* gears, walls */
    concrete: "#9aa1ae",      /* the poured edge of a wall, not its face */
    concreteEdge: "#4a5160",  /* the shadowed lip where a slab meets the floor */
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
  /* Eight liveries, eight docking bays, eight seats. One number, so a
     board with a ninth bay would be caught by validateTables rather
     than by a robot with no colour. */
  var MAX_SEATS = 8;

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

  var HAZARD_DEFS =
    '<svg class="pr-defs" width="0" height="0" aria-hidden="true">' +
      '<defs><pattern id="pr-hz" width="14" height="14" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(-45)">' +
        '<rect class="pr-hz-dark" width="14" height="14"/>' +
        '<rect class="pr-hz-lit" width="7" height="14"/>' +
      "</pattern></defs></svg>";

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
  /* A PUSHING PLATFORM, not an arrow.

     The printed board draws a pusher as a barricade-striped plate that
     slides out of the wall it is bolted to, and that is a better sign
     than an arrow for a reason beyond fidelity: every other arrow on
     this board means a conveyor, so an arrow here said "you will be
     carried" when it means "you will be shoved, on these registers and
     not the others".

     Geometry is in the mount's frame -- u runs out from the wall, v
     runs along it -- so one bit of arithmetic serves all four
     orientations instead of four hand-rotated copies. */
  /* A PUSHING PLATE ON A SCISSOR.

     Three parts, and which part carries the stripe is the whole point.
     The broad FACE is the thing that hits you, so the barricade belongs
     there; the linkage behind it is machinery and reads as steel. The
     first version striped the whole deck instead, which made the pusher
     one flat hazard slab with no way to see that it EXTENDS.

     The scissor is what says "this comes out at you". Two arms crossing
     at a centre pivot, hinged to the wall at one end and to the back of
     the face at the other, with the pivots drawn: a lazy-tong at rest.
     An arrow could not say that -- and worse, every other arrow on this
     board means a conveyor, so it said "you will be carried" where it
     means "you will be shoved, on these registers and not the others".

     Geometry lives in the mount's own frame -- u runs out from the
     wall, v along it -- so one piece of arithmetic serves all four
     orientations instead of four hand-rotated copies. */
  function pusherSvg(dir, odd) {
    var mount = B.opposite(dir), m = EDGE[mount];
    var ux = DC[dir], uy = DR[dir];            // out from the wall
    var vx = -uy, vy = ux;                     // along the wall
    var HALF = 33, FACE = 52, PLATE = 13, SPREAD = 17;
    var hinge = 5, cross = (hinge + (FACE - PLATE)) / 2;
    function pt(u, v) {
      return (m[0] + ux * u + vx * v).toFixed(1) + " " +
             (m[1] + uy * u + vy * v).toFixed(1);
    }
    function bar(u0, u1, v) {
      return "M" + pt(u0, -v) + "L" + pt(u0, v) + "L" + pt(u1, v) + "L" + pt(u1, -v) + "Z";
    }
    function pivot(u, v) {
      var xy = pt(u, v).split(" ");
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
  /* A pit is a hole with a barricade painted round its rim, which is
     exactly how the printed board marks one. The frame is DIMMED: at
     full strength the stripe is the loudest thing on the board and a
     course of pits reads as a warning label rather than as a floor. */
  function pitSvg() {
    return svg('<rect class="pr-hazard-frame" x="5" y="5" width="90" height="90" rx="3"/>' +
               '<rect class="pr-shaft" x="16" y="16" width="68" height="68" rx="2"/>' +
               '<path class="pr-shaft-2" d="M16 16L84 16L64 36L36 36Z"/>' +
               '<rect class="pr-void-floor" x="36" y="36" width="28" height="38" rx="1"/>', "pr-pit");
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

  /* A JET, NOT A SQUARE.

     The printed board draws a flamethrower as a nozzle block bolted to a
     wall with the fire thrown across the floor in front of it -- which is
     why the nozzle and the fire are drawn separately here. `nozzle` is
     true on the square the block stands in, false on the second square of
     a two-square jet, where there is fire and no hardware.

     Everything is drawn pointing SOUTH and rotated, so one shape serves
     all four facings and the flame's taper stays correct in each. */
  function burnerSvg(dir, nozzle) {
    var deg = (dir - 2) * 90;
    var art = "";
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
    else if (def.option) cls.push("pr-t-upgrade");
    else if (def.repair) cls.push("pr-t-repair");
    else if (code.charAt(0) === "o") cls.push("pr-t-pit");
    else if (code.charAt(0) === "s") cls.push("pr-t-dock");
    /* Added, never instead-of: a pusher is on the wall, so the square
       under it keeps its own class and can be a conveyor. */
    if (B.burnerAt(C, c, r)) {
      if (cls.indexOf("pr-has") < 0) cls.push("pr-has");
      cls.push("pr-t-burner");
    }
    if (B.pusherAt(C, c, r)) {
      if (cls.indexOf("pr-has") < 0) cls.push("pr-has");
      cls.push("pr-t-pusher");
    }
    return cls;
  }

  function tileInner(C, c, r) {
    if (B.isVoid(C, c, r)) return "";
    var code = B.codeAt(C, c, r), def = B.elemOf(code), out = [];
    var art = beltArt(C, c, r);
    if (art) out.push(beltSvg(art, marksBoundary(C, c, r, art)));
    else if (def.gear) out.push(gearSvg(def.gear));
    else if (def.option) out.push(repairSvg(true));
    else if (def.repair) out.push(repairSvg(false));
    else if (def.oil) out.push(oilSvg());
    else if (def.portal) out.push(portalSvg(code.charAt(1)));
    else if (code.charAt(0) === "o") out.push(pitSvg());
    else if (code.charAt(0) === "s") out.push(dockSvg(code.charAt(1)));

    /* Burners, like pushers, are drawn from the board's list over the
       tile, because the floor a jet plays over is its own thing -- and on
       a two-square jet the far square has fire and no nozzle at all. */
    var fj = B.burnerAt(C, c, r);
    if (fj) {
      var isNozzle = fj.c === c && fj.r === r;
      out.push(burnerSvg(fj.d, isNozzle));
      if (isNozzle) out.push('<span class="pr-pushreg">' + esc(fj.regs.join("")) + "</span>");
    }

    /* Pushers are drawn from the board's list, over the tile, because
       the tile beneath one can be anything -- including a conveyor. */
    var pu = B.pusherAt(C, c, r);
    if (pu) {
      out.push(pusherSvg(pu.d, true));
      out.push('<span class="pr-pushreg">' + esc(pu.regs.join("")) + "</span>");
    }
    /* A press is drawn from the board's list, over the tile, for the
       reason pushers are: on Cannery Row every one of them stands on a
       conveyor. */
    var pr = B.timerAt(C, c, r);
    if (pr) {
      out.push(pressSvg());
      out.push('<span class="pr-pushreg">' + esc(pr.regs.join("")) + "</span>");
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
  function wallSpans(C, rails) {
    var out = [], c, r;
    function bar(c, r, vertical) {
      return '<i class="pr-wall' + (vertical ? " pr-v" : "") + '" style="--c:' + c + ";--r:" + r + '"></i>';
    }
    /* The bumpers rail is drawn, and drawn as ITSELF rather than as a
       printed wall. It stops a robot exactly as a wall does, so it has
       to be visible -- a rule you cannot see is a trap -- but it is a
       house rule laid over the boards, not something printed on them,
       and a player reading the course should be able to tell which is
       which. */
    function rail(c, r, vertical) {
      return '<i class="pr-fence' + (vertical ? " pr-v" : "") + '" style="--c:' + c + ";--r:" + r + '"></i>';
    }
    /* A door is drawn on the same lattice as a wall, in the same place,
       and it has to say two things at once: that the way is barred and
       that it will not always be. So it keeps the wall's bar and its
       concrete stroke but goes hollow and amber, with the registers it
       opens in stamped on it -- a player planning five cards ahead is
       reading the number, not the colour. */
    function doorBar(c, r, vertical, ch) {
      return '<i class="pr-door' + (vertical ? " pr-v" : "") + '" style="--c:' + c + ";--r:" + r +
        '" data-w="' + esc(ch === "o" ? "135" : ch === "e" ? "24" : ch) + '"></i>';
    }
    function edgeOfCourse(c, r) { return !B.inGrid(C, c, r) || B.isVoid(C, c, r); }
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        if (B.isVoid(C, c, r)) continue;
        if (B.wallAt(C, c, r, N)) out.push(bar(c, r, false));
        else if (B.doorAt(C, c, r, N)) out.push(doorBar(c, r, false, B.doorAt(C, c, r, N)));
        if (B.wallAt(C, c, r, W)) out.push(bar(c, r, true));
        else if (B.doorAt(C, c, r, W)) out.push(doorBar(c, r, true, B.doorAt(C, c, r, W)));
        if (edgeOfCourse(c, r + 1) && B.wallAt(C, c, r, S)) out.push(bar(c, r + 1, false));
        if (edgeOfCourse(c + 1, r) && B.wallAt(C, c, r, E)) out.push(bar(c + 1, r, true));
        if (rails) {
          /* Every boundary between a square and the void, including
             the inside of a ragged layout -- "impossible to fall out"
             has to mean the hole in the middle too. Skipped where a
             printed wall is already drawn, so the rail never doubles
             a bar that is there. */
          if (edgeOfCourse(c, r - 1) && !B.wallAt(C, c, r, N)) out.push(rail(c, r, false));
          if (edgeOfCourse(c - 1, r) && !B.wallAt(C, c, r, W)) out.push(rail(c, r, true));
          if (edgeOfCourse(c, r + 1) && !B.wallAt(C, c, r, S)) out.push(rail(c, r + 1, false));
          if (edgeOfCourse(c + 1, r) && !B.wallAt(C, c, r, E)) out.push(rail(c + 1, r, true));
        }
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
    if (LIVERIES.length !== MAX_SEATS) {
      throw new Error("MAX_SEATS is " + MAX_SEATS + " but there are " +
        LIVERIES.length + " liveries; a seat with no colour cannot be told apart");
    }

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
    /* A rulebook nobody can print a board for, and a board nobody can
       read, are the same bug from two ends. Every ruleset must name a
       real edition, and every shipped course must be readable by at
       least one BUILT ruleset -- otherwise it is in the menu and
       unplayable, which is the state this whole screen exists to make
       visible rather than to create. */
    for (k in RULESETS) {
      if (!B.EDITIONS[k]) throw new Error('ruleset "' + k + '" names no edition in the board module');
    }
    for (k in B.EDITIONS) {
      if (!RULESETS[k]) throw new Error('edition "' + k + '" has no ruleset; a board could be printed and unreadable');
    }
    for (k in B.COURSES) {
      if (k.charAt(0) === "_") continue;
      var anyBuilt = false, eds = B.playableEditions(k);
      for (var ei = 0; ei < eds.length; ei++) if (RULESETS[eds[ei]] && RULESETS[eds[ei]].built) anyBuilt = true;
      if (!eds.length) throw new Error('course "' + k + '" is playable under no edition at all');
      if (!anyBuilt) throw new Error('course "' + k + '" needs a ruleset that is not built');
    }

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
    /* THE COURSE RIDES IN THE SAVE, NOT ITS NAME.

       A shipped course can be rebuilt from a key because the table is
       in the file. A course the player composed cannot -- it exists
       only in the game that is using it. So the SPEC goes into G, and
       a key is resolved to one here rather than being carried around
       as a name that may mean nothing later.

       The shipped courses go through the same path, which is what
       stops the composed one being a second kind of game. */
    var courseId = opts.course || "provingRun";
    /* A shipped course is built from its NAME so the built course
       keeps it. Building every course from a spec object looked
       tidier and made C.id "composed" for all of them -- which
       silently collided the distance-field cache, so every bot
       navigated by whichever course had been built first and the
       games stopped finishing. The id is not decoration. */
    var spec = opts.courseSpec || null;
    var C = B.buildCourse(spec || courseId);
    UI.course = C;

    var seats = Math.max(2, Math.min(8, opts.players || 4));
    G = {
      v: SAVE_VERSION,
      seed: seed,
      rngState: seed | 0,
      courseId: spec ? (spec.id || "composed") : courseId,
      /* A deep copy, because G must survive JSON round-tripping and
         must not share structure with the table it may have come
         from -- a composed course that aliased a shipped one would
         edit the shipped one. */
      courseSpec: JSON.parse(JSON.stringify(spec || B.courseSpec(courseId))),
      /* House rules ride in the SAVE, not in localStorage, so a game
         replays under the rules it was started with even if the setup
         screen has been changed since. */
      flagTouch: opts.flagTouch ? 1 : 0,
      bumpers: opts.bumpers ? 1 : 0,
      /* Which rulebook this game is being played under, in the save
         beside the seed for the same reason: a replay must not change
         games because the menu was changed afterwards. */
      ruleset: RULESETS[opts.ruleset] ? opts.ruleset : "classic",
      turn: 1,
      register: 0,
      phase: "draft",
      /* THE COLOUR IS PICKED AT THE TABLE, NOT IN A MENU.

         It used to be a step of the set-up wizard, three screens
         before anything was on the board -- so the one decision that
         is purely about your own robot was asked while the question
         on screen was still which boards to lay out. It is the first
         thing the game itself asks now, and the bays follow straight
         after it: pick a colour, draw for position, take a bay. */
      step: "livery",
      /* The draft: who picks a colour, who picks a bay, in what order,
         and what they drew to earn it. Pure JSON, so it rides in the
         save and a game reloaded mid-draft carries on where it
         stopped. */
      draft: { order: [], at: 0, liveryAt: 0, cards: {}, skipped: false },
      humanPrivilege: opts.humanPrivilege ? 1 : 0,
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

    /* YOUR CHOICE FIRST, EVERYONE ELSE AROUND IT.

       Seat 0 takes the livery and the bay the player picked; the rest
       fill from what is left, in order. Assigning by seat index and
       then swapping would be shorter and would let two robots share a
       colour whenever the pick collided, which is the one thing this
       must not do -- the liveries ARE how you tell them apart, on the
       board and in the log.

       With more than one human seated this still means seat 0. The
       menu says so rather than pretending to offer eight pickers. */
    var wantLivery = Math.max(0, Math.min(LIVERIES.length - 1, opts.livery | 0));
    var wantBay = Math.max(1, Math.min(C.docks.length, opts.bay || 1));

    var liveryOrder = [wantLivery];
    for (var li = 0; li < LIVERIES.length; li++) if (li !== wantLivery) liveryOrder.push(li);

    var bayOrder = [], wantDock = null, di;
    for (di = 0; di < C.docks.length; di++) if (C.docks[di].n === wantBay) wantDock = C.docks[di];
    if (wantDock) bayOrder.push(wantDock);
    for (di = 0; di < C.docks.length; di++) if (C.docks[di] !== wantDock) bayOrder.push(C.docks[di]);

    /* NOBODY IS ON THE BOARD YET.

       The dock is handed out by a draft now, so a robot has no square
       until it picks one. Carrying a provisional position through the
       draft would mean two robots on one bay for as long as it took
       somebody to move, and "one robot per square" is an invariant
       this game checks on every commit -- so instead the position is
       absent and says so. `placed` is what the renderer and the
       invariants read; bayOrder survives as the FALLBACK, used when a
       draft is skipped. */
    for (var i = 0; i < seats; i++) {
      var dock = bayOrder[i];
      var liv = liveryOrder[i];
      G.players.push({
        id: i,
        name: LIVERIES[liv].name,
        livery: liv,
        placed: false,
        /* -1 is not a square. A robot waiting its turn in the draft is
           genuinely nowhere, and saying so is what stops it blocking
           the bay it would otherwise have been sitting on. */
        isBot: opts.humans ? i >= opts.humans : i > 0,
        skill: opts.skill === undefined ? 1 : opts.skill,
        c: -1, r: -1,
        /* Robots start facing the course. The docking bay is stamped
           below the boards, so that is north; when bays move, this
           becomes a per-course field rather than a constant. */
        face: N,
        damage: 0,
        lives: START_LIVES,
        flags: 0,
        archive: { c: dock.c, r: dock.r, face: N },   // replaced by takeBay
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
      if (blockedMove(C, c, r, dir)) return false;
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

  /* What actually stops a robot or a beam right now. A closed swing door
     is as solid as a wall and an open one is not there at all, so every
     LIVE check asks this and not wallAt.

     The bot's distance field and its lookahead deliberately keep asking
     wallAt, which treats a door as passable. That is the right
     approximation for planning: the field is computed once per course
     and cached, so it cannot depend on a register, and a door the bot
     could cross in some register is better modelled as open than as a
     wall it will never try. */
  function blocked(C, c, r, d) { return B.blockedAt(C, c, r, d, G.register); }

  /* THE BUMPERS HOUSE RULE.

     A rail round the play area, so nothing can be driven, shoved or
     carried off it. Deliberately NOT folded into blocked(): that
     function is also what a laser beam asks, and a beam leaving the
     course hits nothing whether or not there is a rail there -- but
     asking through blocked() would spend a piercing shot on the edge.
     So movement asks this one and the beams go on asking the other. */
  function railed(C, c, r, d) {
    if (!G || !G.bumpers) return false;
    var nx = B.step(c, r, d);
    return !B.inGrid(C, nx.c, nx.r) || B.isVoid(C, nx.c, nx.r);
  }

  function blockedMove(C, c, r, d) { return blocked(C, c, r, d) || railed(C, c, r, d); }

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
      if (blockedMove(C, p.c, p.r, dir)) return;
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
      if (blockedMove(C, p.c, p.r, d)) continue;     // the validator rejects these; belt and braces
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
      if (!B.activeNow(C, p.c, p.r, G.register)) continue;
      log(p.name + " is crushed by a press");
      destroy(p, "under a press");
    }
  }

  function burnerPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      /* A jet is bolted to a wall and plays over the floor in front of it,
         so this asks whether the robot is IN the fire, not whether it is
         standing on the nozzle. One jet on board G reaches two squares. */
      if (!B.burnerFires(C, p.c, p.r, G.register)) continue;
      log(p.name + " is scorched by a burner");
      damage(p, 1, "burner");
    }
  }

  function pusherPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i], pu = B.pusherAt(C, p.c, p.r);
      /* A pusher is bolted to a WALL, so the square under it is its own
         business -- on board H a conveyor and a pusher share squares,
         which is ordinary on the printed board and was impossible to
         say while a pusher WAS the square. */
      if (!pu || !B.pusherFires(C, p.c, p.r, G.register)) continue;
      var d = pu.d;
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
      if (blocked(C, c, r, dir)) { if (pierce <= 0) return null; pierce--; }
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
  /* Bays nobody has taken yet. */
  function freeBays() {
    var C = UI.course, out = [], i, j, taken;
    for (i = 0; i < C.docks.length; i++) {
      taken = false;
      for (j = 0; j < G.players.length; j++) {
        var p = G.players[j];
        if (p.placed && p.c === C.docks[i].c && p.r === C.docks[i].r) { taken = true; break; }
      }
      if (!taken) out.push(C.docks[i]);
    }
    return out;
  }

  /* The next human seat still to choose a colour, or null when they
     all have. Walked from a mark in the draft rather than from a flag
     on the player, so a game saved between two people picking comes
     back asking the right one. */
  function nextLiveryPicker() {
    for (var i = G.draft.liveryAt; i < G.players.length; i++) {
      if (isHuman(G.players[i])) return G.players[i];
    }
    return null;
  }

  /* Whether a colour is spoken for by somebody who has already chosen
     it. Those are the only ones the swap must not touch. */
  function liveryLocked(lv) {
    for (var i = 0; i < G.draft.liveryAt && i < G.players.length; i++) {
      if (G.players[i].livery === lv) return true;
    }
    return false;
  }

  /* TAKING A COLOUR IS A SWAP, NOT AN ASSIGNMENT.

     The liveries ARE how the robots are told apart, on the board and
     in the log, so two of them sharing one is the single thing this
     must never do. Whoever was holding the wanted colour takes the
     picker's instead, which keeps them all distinct however many
     seats choose. A colour an earlier seat has already chosen is
     refused rather than swapped away from them. */
  function takeLivery(p, lv) {
    lv = Math.max(0, Math.min(LIVERIES.length - 1, lv | 0));
    if (liveryLocked(lv)) return false;
    for (var i = 0; i < G.players.length; i++) {
      var q = G.players[i];
      if (q === p || q.livery !== lv) continue;
      q.livery = p.livery;
      q.name = LIVERIES[q.livery].name;
    }
    p.livery = lv;
    p.name = LIVERIES[lv].name;
    return true;
  }

  function takeBay(p, dock) {
    p.c = dock.c; p.r = dock.r;
    p.face = N;
    p.archive = { c: dock.c, r: dock.r, face: N };
    p.placed = true;
    log(p.name + " takes bay " + dock.n);
  }

  /* A BOT PICKS THE BAY NEAREST THE FIRST FLAG, and consumes no
     randomness doing it -- a seeded replay must not drift because the
     draft asked the generator a question. distField is the same BFS
     the programmer uses, so the bot values a bay for the same reason
     it will later value a square. */
  function botBay(p, free) {
    var C = UI.course, d = distField(C, 0), best = free[0], bestV = Infinity;
    for (var i = 0; i < free.length; i++) {
      var v = d[free[i].r * C.w + free[i].c];
      if (v === undefined || v === null) v = Infinity;
      /* Ties break on the printed bay number, which is stable. */
      if (v < bestV || (v === bestV && free[i].n < best.n)) { bestV = v; best = free[i]; }
    }
    return best;
  }

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
    /* ============================================================
       THE DRAFT

       Everyone draws one program card and the fastest priority picks
       its bay first. It is a real draw from the real deck -- the cards
       go straight to the discard afterwards, so the 84 stay conserved
       and the reshuffle at the top of turn one puts them back.

       Robots are UNPLACED until they pick. That is what lets the
       board show which bays are still free without a robot standing
       on a square it has not earned.
       ============================================================ */
    draft: {
      /* WHOSE COLOUR, ASKED ONE SEAT AT A TIME.

         Every human seat picks, in seat order, before anybody draws --
         two people at one keyboard are two robots, and a colour is not
         secret, so this needs no curtain. A seat that has picked is
         locked: the swap below may not take a colour back off somebody
         who chose it. Bots never pick; they keep whatever is left. */
      livery: function () {
        var p = nextLiveryPicker();
        if (!p) { go("draft", "draw"); return NEXT; }
        G.actor = p.id;
        return WAIT;
      },

      draw: function () {
        var i, p, order = [];
        for (i = 0; i < G.players.length; i++) {
          p = G.players[i];
          var drawn = draw(1);
          /* A deck that cannot fill the draft is a table error, not a
             game state -- but fall back rather than throw, because a
             draft is not worth losing a game over. */
          var pri = drawn.length ? card(drawn[0]).pri : 0;
          if (drawn.length) G.discard.push(drawn[0]);
          G.draft.cards[p.id] = pri;
          order.push(p.id);
          log(p.name + " draws priority " + pri);
        }
        /* Fastest first. Priorities are unique across the 84, so this
           never needs a tiebreak. */
        order.sort(function (a, z) { return G.draft.cards[z] - G.draft.cards[a]; });
        if (G.humanPrivilege) {
          /* Seats at this keyboard go first, in the order the draw gave
             them -- the privilege is jumping the bots, not jumping each
             other. */
          var mine = [], theirs = [];
          for (i = 0; i < order.length; i++) {
            (isHuman(G.players[order[i]]) ? mine : theirs).push(order[i]);
          }
          order = mine.concat(theirs);
          log("House rule: this keyboard picks first");
        }
        G.draft.order = order;
        G.draft.at = 0;
        go("draft", "pick");
        return animate([{ type: "render" }, { type: "wait", delay: 420 }]);
      },

      pick: function () {
        if (G.draft.at >= G.draft.order.length) { go("turn", "respawn"); return NEXT; }
        var p = G.players[G.draft.order[G.draft.at]];
        if (p.placed) { G.draft.at++; return NEXT; }
        var free = freeBays();
        if (!free.length) { go("turn", "respawn"); return NEXT; }
        if (isHuman(p)) { G.actor = p.id; return WAIT; }
        takeBay(p, botBay(p, free));
        G.draft.at++;
        return animate([{ type: "sfx", name: "place" }, { type: "render" },
                        { type: "wait", delay: 260 }]);
      }
    },

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
          handOrder(p);
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
            handOrder(p);
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
        /* From the RESOLVED hits, and BEFORE any of them is applied:
           a Pressor Beam trades its damage for a shove, so applying
           first moves the target and the beam ends up drawn one square
           past its own impact. */
        var shots = (UI.headless || !UI.mounted) ? null : collectShots(hits);
        applyLaserHits(hits);
        go("exec", "burners");
        if (UI.headless || !UI.mounted) return NEXT;
        var hit = boardSig() !== before;
        if (!beams.length && !shots.length) return NEXT;
        return animate([
          { type: "sfx", name: "laser" },
          { type: "beams", beams: beams },
          /* The beam travels and connects BEFORE the render that puts
             the damage on the board, so the two read as cause and
             effect rather than as two things that happened at once. */
          { type: "shots", shots: shots },
          { type: "wait", delay: 240 },
          { type: "render" },
          { type: "beams", beams: [] },
          { type: "wait", delay: hit ? 200 : 40 },
          { type: "shots", shots: [] }
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
      if (blocked(C, p.c, p.r, p.face)) continue;
      var nx = B.step(p.c, p.r, p.face);
      if (B.isVoid(C, nx.c, nx.r)) continue;
      var v = firstRobotAlong(p.c, p.r, p.face, true);
      out.push({ c: nx.c, r: nx.r, dir: p.face, stopC: v ? v.c : -1, stopR: v ? v.r : -1 });
    }
    return out;
  }

  /* THE SHOT THAT CONNECTED.

     collectBeams above lights the board's own beams, which are printed
     on the cardboard and are there whether or not anybody is standing
     in them. A robot's laser is the opposite: it is fired every
     register by every robot, down whatever line it happens to be
     facing, and almost all of those go nowhere. Drawing them all would
     put five red lines across the board every register -- constant,
     meaningless, and by the third turn invisible, which is the state
     any animation that fires unconditionally ends up in.

     So this draws only the ones that HIT. A beam appearing at all then
     means something happened, and it says who shot whom, which is the
     one fact the damage pips in the side panel cannot tell you.

     Takes the resolved hits rather than recomputing, so what is drawn
     is by construction what was applied -- a beam to a robot that took
     no damage would be a lie told in the most convincing medium
     available. */
  function collectShots(hits) {
    var out = [];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!h.shooter || !h.target) continue;       // a board laser, drawn already
      /* An option card can absorb a shot before it lands, or turn it
         into a shove or a scramble. Absorbed entirely, nothing hit;
         anything else did. */
      if (h.damage <= 0 && !h.replaceWith) continue;
      var len = Math.abs(h.target.c - h.shooter.c) + Math.abs(h.target.r - h.shooter.r);
      if (len < 1) continue;                       // cannot shoot the square you stand on
      out.push({ c: h.shooter.c, r: h.shooter.r, dir: h.dir, len: len,
                 livery: h.shooter.livery, hitC: h.target.c, hitR: h.target.r });
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
      /* A robot that has not drafted its bay is nowhere on purpose --
         it has no square to be off the course, in a pit, or sharing. */
      if (p.placed === false) continue;

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
    /* KEYED ON WHAT THE FIELD IS COMPUTED FROM, not on what the course
       is called. The name was enough while every course was a shipped
       one with a unique key; a composed course is called "composed"
       whatever is in it, so two of the same size shared a field and
       every bot in the second one navigated to the first one's flags.
       Caught when every course built from a spec came out named
       "composed" and the sims stopped finishing.

       Flag positions are the whole input, so they are the whole key. */
    var flagKey = "";
    for (var fk = 0; fk < C.flags.length; fk++) flagKey += C.flags[fk].c + "," + C.flags[fk].r + ";";
    var key = C.id + ":" + C.w + "x" + C.h + ":" + flagIdx + ":" + flagKey;
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
    /* The rail is a rule, not one of this model's simplifications. A
       bot that still read the edge as death under bumpers would refuse
       the outer ring of every course for no reason the player can
       see. */
    if (railed(C, st.c, st.r, dir)) return;
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
    if (railed(C, st.c, st.r, d)) return;
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
    var pu = B.pusherAt(C, st.c, st.r);
    if (pu && B.pusherFires(C, st.c, st.r, register)) ghostMove(C, st, pu.d);
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

  /* A 2x1 board whose only feature is a swing door between the two
     squares, open in register 3. The picture is spelled out in full
     because the door IS a picture character, so parsing it is half of
     what the door tests are testing. */
  function doorBench() {
    return B.parsePic("door", { w: 2, h: 1, pic: ["+  +  +", " ..3.. ", "+  +  +"], lasers: [] });
  }

  function bench(cells, walls, lasers, timers, pushers, burners) {
    var w = cells[0].length, h = cells.length;
    var g = B.parsePic("bench", { w: w, h: h, pic: benchPic(cells, walls),
      lasers: lasers || [], timers: timers || [], pushers: pushers || [],
      burners: burners || [] });
    g.id = "bench"; g.name = "Bench"; g.flags = [];
    return g;
  }

  /* Drive the headless machine until it reaches a phase. The draft
     runs entirely through advance(), so a test that wants a seated
     board asks for one rather than reaching into the steps. */
  /* Run the draft and NOTHING else.

     Not via advance(): advance() runs as many steps as it can before
     something waits, and with autoHuman on nothing ever does -- so one
     call carried the machine through the draft, the first turn, and
     every turn after it, and the test then measured a finished game.
     Stepping the draft's own table is what the rest of the rule tests
     do with beltPass and pusherPass, and it stops where asked.

     autoHuman for the duration so a human seat picks like a bot. */
  function runDraft(guard) {
    var was = UI.autoHuman;
    UI.autoHuman = true;
    try {
      for (var i = 0; i < (guard || 60) && G.phase === "draft"; i++) {
        STEP.draft[G.step]();
      }
      return G.phase !== "draft";
    } finally { UI.autoHuman = was; }
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

  /* EVERY CLASS THE ART DRAWS WITH.

     Swept off a board with one of everything on it plus all nine card
     faces, so a chrome class can be checked against the whole set
     rather than against whichever bit of art somebody thought of. */
  function artClasses() {
    var seen = {}, src = "", c, r, k;
    var g = B.parsePic("provingGround", B.BOARD_SPECS.provingGround);
    g.flags = [{ c: 0, r: 0, n: 1 }];
    for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) src += tileInner(g, c, r);
    /* Printed walls and doors count as art; the bumpers rail does not
       -- it is chrome laid over the boards, and is one of the things
       being checked. */
    src += wallSpans(g, false);
    for (k in CARD_KINDS) src += cardArt(k);
    var m, re = /class="([^"]+)"/g;
    while ((m = re.exec(src))) {
      var parts = m[1].split(/\s+/);
      for (var i = 0; i < parts.length; i++) if (parts[i]) seen[parts[i]] = 1;
    }
    return seen;
  }

  /* Squares on the current UI.layout that a flag may legally sit on,
     and one that it may not. Written out rather than named as
     coordinates because which square is a pit is board data, and a
     test that hard-codes it fails the day the board is re-read. */
  function benchFlagSquares() {
    var spec = B.composeCourse(B.withFlags(layoutNow(), []), 0);
    return B.flagCandidates(B.buildCourse(spec), B.dockBoxOf(spec));
  }

  function benchBadSquare() {
    var spec = B.composeCourse(B.withFlags(layoutNow(), []), 0);
    var C = B.buildCourse(spec), c, r;
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        var el = B.elemOf(B.codeAt(C, c, r));
        if (el && el.name === "pit") return { c: c, r: r, what: "pit" };
        if (el && /conveyor|express/.test(el.name)) return { c: c, r: r, what: el.name };
      }
    }
    return null;
  }
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
      var cells = [["..", "..", ".."], ["..", "..", ".."]];
      var walls = ["0,0,W", "0,1,W"];       // each pusher mounts on the wall behind it
      var pushers = [{ c: 0, r: 0, d: "E", regs: [1, 3, 5] },
                     { c: 0, r: 1, d: "E", regs: [2, 4] }];
      benchGame(bench(cells, walls, [], [], pushers), [{ c: 0, r: 0 }, { c: 0, r: 1 }]);
      G.register = 0;                       // printed register 1: odd pushers only
      pusherPass();
      assert(G.players[0].c === 1, "the 1/3/5 pusher should fire on register 1");
      assert(G.players[1].c === 0, "the 2/4 pusher must not fire on register 1");
      benchGame(bench(cells, walls, [], [], pushers), [{ c: 0, r: 0 }, { c: 0, r: 1 }]);
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

    /* The drawn beam is the one thing in the game a player reads as
       fact without being able to check it, so what gets drawn is
       asserted rather than eyeballed. */
    { name: "a shot is drawn only when it connects with a robot", run: function () {
      // Facing each other across one empty square: one shot each way.
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: W }]);
      var shots = collectShots(computeLaserHits());
      assert(shots.length === 2, "two robots shooting each other is two beams, got " + shots.length);
      assert(shots[0].len === 2 && shots[1].len === 2, "each beam spans the two squares between them");
      assert(shots[0].c === 0 && shots[0].r === 0, "a beam starts at the SHOOTER, not the target");
      assert(shots[0].hitC === 2 && shots[0].hitR === 0, "and ends at the robot it hit");

      // Facing empty floor: fired, hit nothing, drawn as nothing.
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      assert(collectShots(computeLaserHits()).length === 0,
        "a laser that hits nothing must not be drawn; every robot fires every register");

      // A wall between them: no shot, and so no beam through a wall.
      benchGame(bench([["..", "..", ".."]], ["1,0,W"]), [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: W }]);
      assert(collectShots(computeLaserHits()).length === 0, "a walled-off shot must not be drawn");

      // Powered down: does not fire, is still hit, so exactly one beam.
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0, face: E, poweredDown: true }, { c: 1, r: 0, face: W }]);
      var one = collectShots(computeLaserHits());
      assert(one.length === 1, "a powered-down robot fires nothing but is still shot, got " + one.length);
      assert(one[0].c === 1, "the beam must come from the one that is still on");
    } },

    { name: "a beam stops at the first robot, not the one behind it", run: function () {
      benchGame(bench([["..", "..", ".."]]),
        [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      var shots = collectShots(computeLaserHits());
      var from0 = shots.filter(function (s) { return s.c === 0; });
      assert(from0.length === 1, "the back robot fires once, got " + from0.length);
      assert(from0[0].len === 1, "and its beam stops one square along, at the robot in the way");
      assert(from0[0].hitC === 1, "not at the one behind it");
    } },

    { name: "a shot absorbed before it lands is not drawn", run: function () {
      /* No shipped card zeroes a shot in onLaserHit -- Pressor Beam
         trades the damage for a shove, which still connected and still
         draws. The guard is for the next card that does, and it is
         tested with a hand-built hit rather than left to be discovered
         by the card that needs it. */
      benchGame(bench([["..", ".."]]), [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }]);
      var a = G.players[0], b = G.players[1];
      var base = { target: b, shooter: a, dir: E, from: "test" };
      function one(over) {
        var h = {}, k;
        for (k in base) h[k] = base[k];
        for (k in over) h[k] = over[k];
        return collectShots([h]);
      }
      assert(one({ damage: 1, replaceWith: null }).length === 1, "an ordinary hit draws");
      assert(one({ damage: 0, replaceWith: null }).length === 0, "a shot absorbed entirely must not draw");
      assert(one({ damage: 0, replaceWith: { kind: "push", dir: E, n: 1 } }).length === 1,
        "a Pressor Beam shove connected, so it draws");
    } },

    { name: "the beam is collected before the hits are applied", run: function () {
      /* Applying a hit can MOVE the robot it hit: Pressor Beam trades
         the damage for a shove, and stepRobot runs inside
         applyLaserHits. Collect afterwards and the beam is drawn to
         where the target was shoved to rather than to where it was
         standing when it was struck -- a beam that ends one square
         past its own impact. The step does it in the right order;
         this asserts both that the order matters and that it holds. */
      benchGame(bench([["..", "..", "..", ".."]]),
        [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }]);
      var hits = [{ target: G.players[1], shooter: G.players[0], dir: E, from: "test",
                    damage: 0, replaceWith: { kind: "push", dir: E, n: 1 } }];
      var early = collectShots(hits);
      assert(early.length === 1 && early[0].hitC === 1,
        "the beam ends where the target was standing when it was struck");
      applyLaserHits(hits);
      assert(G.players[1].c === 2, "fixture must actually move the target, or the order proves nothing");
      var late = collectShots(hits);
      assert(late.length && late[0].hitC === 2,
        "collecting late reads the shoved position, which is the bug this order avoids");

      /* And the step really is in that order. Reading the source is
         the only way to assert a sequence whose difference is
         invisible without a DOM, and it is the same trick the
         HAZARD_DEFS check uses. */
      var src = String(STEP.exec.lasers).replace(/\/\*[\s\S]*?\*\//g, "");
      var iCollect = src.indexOf("collectShots"), iApply = src.indexOf("applyLaserHits");
      assert(iCollect >= 0 && iApply >= 0, "the lasers step should call both");
      assert(iCollect < iApply, "the lasers step must collect the beams before applying the hits");
    } },

    { name: "a drawn beam never crosses a wall", run: function () {
      /* The general property, swept over a real board, rather than one
         fixture that happens to pass. A beam is the one thing in this
         game a player reads as fact without being able to check it, so
         a beam through a wall is not a cosmetic slip -- it is the game
         telling them a wall is not there.

         For every square and every facing on Proving Ground: put a
         shooter there, put a target on the last square its line can
         actually reach, and walk the drawn beam square by square
         asserting there is nothing solid in the way. Then put a target
         on the first square PAST the wall and assert nothing is drawn
         at all. */
      var C0 = B.buildCourse("provingRun");
      var checked = 0, drawn = 0, refused = 0;
      for (var r0 = 0; r0 < 12; r0++) {
        for (var c0 = 0; c0 < 12; c0++) {
          if (B.isPit(B.codeAt(C0, c0, r0))) continue;
          for (var d = 0; d < 4; d++) {
            /* How far the line actually reaches, and the first square
               beyond the thing that stops it. */
            var c = c0, r = r0, last = null, past = null;
            for (var n = 0; n < 24; n++) {
              if (B.blockedAt(C0, c, r, d, 0)) { past = B.step(c, r, d); break; }
              var nx = B.step(c, r, d);
              if (B.isVoid(C0, nx.c, nx.r)) break;
              c = nx.c; r = nx.r;
              if (B.isPit(B.codeAt(C0, c, r))) continue;   // nothing can stand here
              last = { c: c, r: r };
            }
            if (last) {
              benchGame(B.buildCourse("provingRun"),
                [{ c: c0, r: r0, face: d }, { c: last.c, r: last.r, face: d }]);
              var shots = collectShots(computeLaserHits());
              for (var i = 0; i < shots.length; i++) {
                var s = shots[i], sc = s.c, sr = s.r;
                for (var k = 0; k < s.len; k++) {
                  assert(!blocked(UI.course, sc, sr, s.dir),
                    "beam from (" + s.c + "," + s.r + ") facing " + B.dirName(s.dir) +
                    " crosses a wall leaving (" + sc + "," + sr + ")");
                  var sn = B.step(sc, sr, s.dir); sc = sn.c; sr = sn.r;
                }
                drawn++;
              }
              checked++;
            }
            if (past && !B.isVoid(C0, past.c, past.r) && !B.isPit(B.codeAt(C0, past.c, past.r))) {
              benchGame(B.buildCourse("provingRun"),
                [{ c: c0, r: r0, face: d }, { c: past.c, r: past.r, face: B.opposite(d) }]);
              var blockedShots = collectShots(computeLaserHits()).filter(function (s) {
                return s.c === c0 && s.r === r0;
              });
              assert(blockedShots.length === 0,
                "a shot from (" + c0 + "," + r0 + ") facing " + B.dirName(d) +
                " is walled off and must not be drawn");
              refused++;
            }
          }
        }
      }
      assert(checked > 100, "the sweep should cover most of the board, covered " + checked);
      assert(drawn > 100, "and should actually draw beams, drew " + drawn);
      assert(refused > 10, "and should actually meet walls, met " + refused);
    } },

    { name: "the one laser that does cross a wall is the card that says so", run: function () {
      /* High-Power Laser is printed "your laser shoots through one
         wall", so its beam crossing one is the card working rather
         than the beam lying. It is the ONLY way any beam in this game
         passes something solid, and that is asserted here so the
         exception stays deliberate: if a second one ever appears, this
         goes red rather than the wall quietly becoming a suggestion. */
      var cells = [["..", "..", "..", ".."]];
      benchGame(bench(cells, ["1,0,E"]), [{ c: 0, r: 0, face: E }, { c: 2, r: 0, face: N }]);
      assert(collectShots(computeLaserHits()).length === 0, "an ordinary laser draws nothing through a wall");
      benchGame(bench(cells, ["1,0,E"]),
        [{ c: 0, r: 0, face: E, options: ["highPowerLaser"] }, { c: 2, r: 0, face: N }]);
      var shots = collectShots(computeLaserHits());
      assert(shots.length === 1 && shots[0].len === 2, "the high-power beam is drawn to what it hit");
      benchGame(bench(cells, ["1,0,E", "2,0,E"]),
        [{ c: 0, r: 0, face: E, options: ["highPowerLaser"] }, { c: 3, r: 0, face: N }]);
      assert(collectShots(computeLaserHits()).length === 0, "and not through two walls");
    } },

    { name: "every setting declares a control that can draw it", run: function () {
      /* The control is part of the setting's definition now, so the two
         can disagree: a segment whose labels run out halfway, a toggle
         with five values, a kind nothing knows how to render. Each of
         those draws something plausible and wrong. */
      var KNOWN = { segment: 1, toggle: 1, slider: 1 };
      for (var k in SLIDER_DEFS) {
        var d = SLIDER_DEFS[k];
        assert(d.control, k + " declares no control");
        assert(KNOWN[d.control], k + ' asks for control "' + d.control + '", which nothing draws');
        assert(d.min <= d.def && d.def <= d.max, k + "'s default is outside its own range");
        if (d.labels) {
          assert(d.labels.length === d.max - d.min + 1,
            k + " spans " + (d.max - d.min + 1) + " values but names " + d.labels.length);
          for (var i = 0; i < d.labels.length; i++) {
            assert(d.labels[i], k + " leaves value " + (d.min + i) + " unnamed");
          }
        }
        if (d.control === "toggle") {
          assert(d.min === 0 && d.max === 1, k + " is drawn as a switch but has more than two values");
        }
        if (d.maxFrom) {
          assert(SLIDER_DEFS[d.maxFrom], k + ' is capped by "' + d.maxFrom + '", which is not a setting');
        }
        /* And it must actually render something for every value it
           claims -- the check that would have caught a labels array
           one short. */
        for (var v = d.min; v <= d.max; v++) {
          var html = ruleControl(k, d, v);
          assert(html.indexOf("<") === 0 && html.length > 40, k + " draws nothing at value " + v);
          if (d.control === "segment") {
            assert(html.indexOf('aria-checked="true"') > 0,
              k + " draws no selected option at value " + v);
          }
        }
      }
    } },

    { name: "every palette colour clears its contrast floor", run: function () {
      /* Contrast is arithmetic, so it can be checked rather than
         eyeballed -- and it drifts the moment somebody nudges a colour
         to look better against one background and forgets the other.
         Text needs 4.5:1 (WCAG AA); a control boundary needs 3:1. */
      function lum(hex) {
        var n = parseInt(hex.slice(1), 16);
        var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
      }
      function ratio(a, b) {
        var la = lum(a), lb = lum(b), hi = Math.max(la, lb), lo = Math.min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
      }
      var grounds = [TOKENS.bg, TOKENS.panel];
      var need = { text: 4.5, ink: 4.5, dim: 4.5, accent: 4.5, danger: 4.5,
                   good: 4.5, warn: 4.5, violet: 4.5, steel: 4.5, rust: 4.5,
                   borderLit: 3, accentDim: 3 };
      for (var k in need) {
        assert(TOKENS[k], "no token named " + k);
        for (var g = 0; g < grounds.length; g++) {
          var got = ratio(TOKENS[k], grounds[g]);
          assert(got >= need[k],
            k + " (" + TOKENS[k] + ") is " + got.toFixed(2) + ":1 on " + grounds[g] +
            "; needs " + need[k] + ":1");
        }
      }
    } },

    { name: "mounting twice does not bind the input twice", run: function () {
      /* The bug this guards: mount() clears the host with innerHTML,
         which leaves listeners on the host itself in place, so a second
         mount bound a second set and every click dispatched twice.
         Clicking a card places into firstEmpty, so the repeat filled
         the NEXT register too -- reported twice before it was caught,
         because it only appears after a re-mount and only on click.

         No DOM here, so the guard itself is what is asserted: calling
         setupInput twice on one host must wire it once. */
      var calls = 0;
      var fakeHost = {
        addEventListener: function () { calls++; }
      };
      setupInput(fakeHost);
      var first = calls;
      assert(first > 0, "the first call must wire something, wired " + first);
      setupInput(fakeHost);
      assert(calls === first, "the second call must wire nothing, wired " + (calls - first) + " more");
      assert(fakeHost.__prWired === true, "and the host is marked so a third call is cheap too");
      setupInput(fakeHost);
      assert(calls === first, "nor a third");
    } },

    { name: "a composed course builds, validates and plays", run: function () {
      /* The point of the whole stage: a course the player assembled is
         not a second kind of game. It goes through buildCourse,
         validateCourse and newGame by the same path a shipped one
         does. */
      var layout = { v: 3, dockCol: 0, name: "Bench Yard", cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, { id: "cross", rot: 1 }, null] };
      var spec = B.composeCourse(layout, 3);
      assert(spec.boards.length === 2, "both boards are in the spec");
      assert(spec.boards[1].at[0] === 12 && spec.boards[1].at[1] === 0,
        "the second board snaps to (12,0), landed at " + spec.boards[1].at);
      assert(spec.dock.at[1] === 12, "the dock sits under the boards, at row " + spec.dock.at[1]);
      var C = B.buildCourse(spec);
      assert(C.w === 24 && C.h === 16, "two boards and a dock make 24x16, made " + C.w + "x" + C.h);
      assert(C.docks.length === 8, "the dock brings its eight bays, brought " + C.docks.length);
      B.validateCourse(spec, function () {});
      newGame(5, { courseSpec: spec, players: 4, humans: 0 });
      runDraft();
      assert(G.players.every(function (p) { return p.placed; }), "everyone drafts on a composed course too");
    } },

    { name: "flags land somewhere legal, spread out, and never on the dock", run: function () {
      /* Each of those was a separate way to ruin a course. A flag on a
         conveyor is carried off it; one in a pit cannot be touched;
         three in a corner is a race to a corner; and one in the DOCK
         is a flag somebody starts on top of -- which is what the
         first version produced, because "furthest from the start" had
         been written as "largest row" and the dock is at the bottom. */
      var layout = { v: 3, dockCol: 0, cells: [null, null, null, { id: "island", rot: 0 }, { id: "cross", rot: 1 }, null, { id: "pitMaze", rot: 2 }, { id: "boardG", rot: 3 }, null] };
      var spec = B.composeCourse(layout, 3);
      var C = B.buildCourse(spec);
      assert(C.flags.length === 3, "three flags, got " + C.flags.length);
      for (var i = 0; i < C.flags.length; i++) {
        var f = C.flags[i], code = B.codeAt(C, f.c, f.r), el = B.elemOf(code);
        assert(el && el.name === "floor",
          "flag " + f.n + " sits on " + (el ? el.name : "nothing") + " at (" + f.c + "," + f.r + ")");
        var inDock = f.c >= spec.dock.at[0] && f.c <= spec.dock.at[0] + 11 &&
                     f.r >= spec.dock.at[1] && f.r <= spec.dock.at[1] + 3;
        assert(!inDock, "flag " + f.n + " is in the docking bay at (" + f.c + "," + f.r + ")");
        for (var j = 0; j < i; j++) {
          var d = Math.abs(f.c - C.flags[j].c) + Math.abs(f.r - C.flags[j].r);
          assert(d > 3, "flags " + C.flags[j].n + " and " + f.n + " are " + d + " apart");
        }
      }
    } },

    { name: "the same layout composes the same course, every time", run: function () {
      /* A save carries the SPEC, so the spec has to be the whole
         answer. If composing twice gave two courses, a reload would
         be a different race. */
      var layout = { v: 3, dockCol: 0, cells: [null, null, null, { id: "exchange", rot: 0 }, null, null, { id: "maelstrom", rot: 2 }, null, null] };
      var a = JSON.stringify(B.composeCourse(layout, 3));
      var b = JSON.stringify(B.composeCourse(layout, 3));
      assert(a === b, "two composes of one layout must match");
    } },

    { name: "two composed courses of a size do not share a distance field", run: function () {
      /* Every composed course is called "composed", so a cache keyed
         on the name handed the second one the first one's field and
         its bots raced toward flags that were not there. The sims
         found it as "no game was ever won". */
      function mk(order) {
        return B.composeCourse({ v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: order, rot: 0 }, null, null] }, 3);
      }
      var A = B.buildCourse(mk("island")), Bc = B.buildCourse(mk("cross"));
      assert(A.id === Bc.id, "fixture: both are called " + A.id);
      assert(A.w === Bc.w && A.h === Bc.h, "fixture: and are the same size");
      var fa = distField(A, 0), fb = distField(Bc, 0);
      assert(fa !== fb, "they must not be handed the same field object");
    } },

    { name: "you get the colour you picked, and no bay until you draft one", run: function () {
      newGame(7, { course: "provingRun", players: 4, humans: 1, livery: 5 });
      var me = G.players[0];
      assert(me.livery === 5, "seat 0 wears the chosen livery, wears " + me.livery);
      assert(me.name === LIVERIES[5].name, "and is named for it, is " + me.name);
      /* A robot with no bay is NOWHERE, not parked on a default. The
         difference matters: a default position occupies a bay nobody
         has drafted, and the next robot to take it lands on top. */
      assert(me.placed === false, "nobody is placed before the draft");
      assert(me.c === -1 && me.r === -1, "and has no square, has (" + me.c + "," + me.r + ")");
      assert(G.phase === "draft", "a new game starts in the draft, starts in " + G.phase);
    } },

    { name: "the draft seats everyone, once each, on a real bay", run: function () {
      newGame(11, { course: "provingRun", players: 8, humans: 0 });
      runDraft();
      var C = UI.course, seen = {}, i;
      for (i = 0; i < G.players.length; i++) {
        var p = G.players[i];
        assert(p.placed, p.name + " never drafted a bay");
        var key = p.c + "," + p.r;
        assert(!seen[key], "two robots drafted (" + key + ")");
        seen[key] = 1;
        var onDock = false;
        for (var d = 0; d < C.docks.length; d++) if (C.docks[d].c === p.c && C.docks[d].r === p.r) onDock = true;
        assert(onDock, p.name + " is at (" + key + "), which is not a docking bay");
        assert(p.archive.c === p.c && p.archive.r === p.r,
          p.name + "'s archive must be the bay it drafted, or a respawn moves it somewhere it never was");
      }
    } },

    { name: "the fastest priority drafts first", run: function () {
      newGame(23, { course: "provingRun", players: 6, humans: 0 });
      advance();                                   // stops on the colour pick
      /* Answered the way the screen answers it, keeping what seat 0
         was dealt -- the draw is what this test is about, and the
         colours are in front of it now. */
      onLiveryPick(G.players[0].livery);
      assert(G.draft.order.length === 6, "everyone draws");
      for (var i = 1; i < G.draft.order.length; i++) {
        var a = G.draft.cards[G.draft.order[i - 1]], b = G.draft.cards[G.draft.order[i]];
        assert(a > b, "the order must run fastest first, found " + a + " before " + b);
      }
    } },

    { name: "human privilege jumps the bots and nothing else", run: function () {
      /* Two seats at the keyboard: the privilege puts BOTH ahead of
         the bots, and leaves their order relative to each other as the
         draw made it. Jumping each other would be a different rule. */
      newGame(31, { course: "provingRun", players: 6, humans: 2, humanPrivilege: 1 });
      advance();
      onLiveryPick(G.players[0].livery);           // two seats, two colours to settle
      onLiveryPick(G.players[1].livery);
      var order = G.draft.order;
      assert(isHuman(G.players[order[0]]) && isHuman(G.players[order[1]]),
        "both seats pick before the bots, order was " + order.join(","));
      var pa = G.draft.cards[order[0]], pb = G.draft.cards[order[1]];
      assert(pa > pb, "and between themselves the draw still decides, " + pa + " then " + pb);

      /* Off, the same seed puts them wherever the cards did. */
      newGame(31, { course: "provingRun", players: 6, humans: 2, humanPrivilege: 0 });
      advance();
      onLiveryPick(G.players[0].livery);
      onLiveryPick(G.players[1].livery);
      var plain = G.draft.order;
      for (var j = 1; j < plain.length; j++) {
        assert(G.draft.cards[plain[j - 1]] > G.draft.cards[plain[j]],
          "without the rule it is priority order and nothing else");
      }
    } },

    { name: "no two robots share a colour, whatever you pick", run: function () {
      /* The liveries ARE how you tell robots apart, on the board and in
         the log, so a collision is not a cosmetic problem. Swept over
         every choice rather than spot-checked, because the failure only
         shows for the picks that collide with a default. */
      for (var liv = 0; liv < LIVERIES.length; liv++) {
        newGame(3, { course: "provingRun", players: 8, humans: 0, livery: liv });
        runDraft();
        var seenL = {}, seenB = {}, i;
        for (i = 0; i < G.players.length; i++) {
          var p = G.players[i];
          assert(!seenL[p.livery], "livery " + p.livery + " used twice (picked " + liv + ")");
          assert(!seenB[p.c + "," + p.r], "bay (" + p.c + "," + p.r + ") used twice (picked " + liv + ")");
          seenL[p.livery] = 1; seenB[p.c + "," + p.r] = 1;
        }
        assert(G.players[0].livery === liv, "and seat 0 still gets its pick");
      }
    } },

    { name: "an expansion tile turns its ruleset on", run: function () {
      /* The rule the map editor has to obey: drop a flame jet on a map
         and that map is a Crash and Burn map. Maelstrom is classic-only
         for its tool plates, so strip those first -- otherwise the
         test would pass without the jet doing anything. */
      var f = JSON.parse(JSON.stringify(B.BOARD_SPECS.maelstrom));
      f.pic = f.pic.map(function (r) { return r.replace(/[wW]\./g, ".."); });
      try {
        B.setOverride("maelstrom", f);
        assert(B.playableEditions("maelstromRun").length === 2,
          "with no expansion square left, both rulebooks can read it");
        f.burners = [{ c: 0, r: 2, d: "E", regs: [1] }];   // mounts on the rim wall
        B.setOverride("maelstrom", f);
        assert(B.playableEditions("maelstromRun").join(",") === "classic",
          "one flame jet makes it classic only");
        assert(B.editionBlocker("maelstromRun", "modern") === "flame jet",
          "and the menu can say which square did it");
      } finally { B.clearOverride(); }
      assert(B.playableEditions("maelstromRun").join(",") === "classic",
        "clearing the override puts the shipped board back");
    } },

    { name: "the edition check reads every layer, not just the picture", run: function () {
      /* Burners and presses left the picture when they became
         wall-mounted. For a while after that a board whose only
         expansion element was a jet reported as playable by both
         rulebooks -- the element was still there, the check had simply
         stopped looking where it lived. */
      var names = B.courseElements("boardHRun").map(function (e) { return e.name; });
      assert(names.indexOf("flame jet") >= 0, "board H's jets must be counted, got " + names.join("/"));
      var g = B.parsePic("boardH", B.BOARD_SPECS.boardH);
      assert(B.BOARD_SPECS.boardH.pic.join("").indexOf("F.") < 0,
        "and they are NOT in the picture, which is the point");
      assert(g.burners.length === 16, "sixteen of them");
    } },

    { name: "a house board shadows the shipped one everywhere", run: function () {
      /* Half-applied is the failure to avoid: live in the picture the
         player sees and absent from the course the engine builds. */
      var before = B.buildCourse("islandRun");
      assert(B.codeAt(before, 0, 0) === "..", "fixture: island (0,0) is plain floor");
      var isl = JSON.parse(JSON.stringify(B.BOARD_SPECS.island));
      isl.pic[1] = "|o." + isl.pic[1].slice(3);
      try {
        B.setOverride("island", isl);
        assert(B.isOverridden("island"), "the override is registered");
        var after = B.buildCourse("islandRun");
        assert(B.isPit(B.codeAt(after, 0, 0)), "the course must build from the edited board");
        assert(B.codeAt(B.parsePic("island", B.specOf("island")), 0, 0) === "o.",
          "and specOf must hand back the edit, not the shipped board");
        assert(B.BOARD_SPECS.island.pic[1].slice(0, 3) !== "|o.",
          "while BOARD_SPECS itself is untouched -- that is the photographed data");
      } finally { B.clearOverride(); }
      assert(!B.isPit(B.codeAt(B.buildCourse("islandRun"), 0, 0)), "and clearing restores it");
    } },

    { name: "a house board that does not validate is refused", run: function () {
      var bad = JSON.parse(JSON.stringify(B.BOARD_SPECS.island));
      bad.burners = [{ c: 5, r: 5, d: "E", regs: [1] }];   // a jet bolted to nothing
      var refused = false;
      try { B.setOverride("island", bad); } catch (e) { refused = true; }
      B.clearOverride();
      assert(refused, "an edit that will not build must be refused before it shadows anything");
    } },

    { name: "a board laser is not drawn as a robot shot", run: function () {
      /* Board beams are printed on the cardboard and lit by a separate
         layer that is always there. Drawing them twice would put a
         travelling beam on top of a static one. */
      benchGame(bench([["..", "..", ".."]], ["0,0,W"], [{ c: 0, r: 0, d: "E", n: 1 }]),
        [{ c: 2, r: 0, face: E }]);
      var hits = computeLaserHits();
      assert(hits.length === 1 && !hits[0].shooter, "fixture should be one board-laser hit");
      assert(collectShots(hits).length === 0, "a board laser must not produce a robot beam");
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

    { name: "every mount injects the hazard pattern", run: function () {
      /* The tile art references url(#pr-hz), which is document-scoped.
         mount() injected it and edMount() did not, so in the board
         workshop every striped thing -- pusher decks, pit rims --
         painted empty. It looked like the art was wrong; it was a
         definition missing three thousand lines away, and nothing
         failed. Both mounts are checked against the same source. */
      var src = String(mount) + String(edMount);
      var n = (src.match(/HAZARD_DEFS/g) || []).length;
      assert(n >= 2, "both mount() and edMount() must inject HAZARD_DEFS, found " + n);
      assert(/id="pr-hz"/.test(HAZARD_DEFS), "and the pattern must carry the id the art asks for");
    } },

    { name: "the hand keeps its order when a card comes back from a register", run: function () {
      /* The bug this exists for: cards were pushed back on the END of
         the hand, so taking one card out of a register moved every card
         after it. You looked, clicked where a card had been, and a
         different card went in. Nothing was ever in the wrong place --
         the hand had rearranged itself between the look and the
         click. */
      benchGame(bench([[".."]]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      /* Card ids are indices into PROGRAM_DECK. Deliberately NOT in
         priority order to begin with, so the sort has work to do. */
      p.hand = [40, 3, 77, 12, 55, 8, 61, 29, 70];
      handOrder(p);
      var before = p.hand.slice();
      /* Pull the middle card into a register and put it straight back. */
      p.registers[0] = p.hand.splice(4, 1)[0];
      toHand(p, p.registers[0]);
      p.registers[0] = null;
      assert(p.hand.join(",") === before.join(","),
        "the hand must come back identical, got " + p.hand.join(",") + " from " + before.join(","));
      for (var i = 1; i < p.hand.length; i++) {
        assert(card(p.hand[i - 1]).pri <= card(p.hand[i]).pri,
          "and it must stay sorted by priority");
      }
    } },

    // ---- rulesets and the course menu ---------------------------------
    { name: "a course's rulebooks come from its squares, not from its box", run: function () {
      /* Island is a base-game board, which is a classic product, but
         that is not WHY it is classic-only. It is classic-only because
         it carries a repair square, which the 2016 rules do not print.
         The distinction matters the moment a board from a classic box
         happens to use only shared elements. */
      var eds = B.playableEditions("islandRun");
      assert(eds.indexOf("classic") >= 0, "Island is readable by the classic rules");
      assert(eds.indexOf("modern") < 0, "and not by the modern ones");
      assert(B.editionBlocker("islandRun", "modern") === "repair site",
        "and the menu must be able to say which square shuts it out, got " +
        B.editionBlocker("islandRun", "modern"));
    } },

    { name: "an unbuilt ruleset offers nothing and starts nothing", run: function () {
      assert(RULESETS.modern.built === false, "the modern rules are not implemented");
      var offered = 0;
      for (var cid in B.COURSES) if (cid.charAt(0) !== "_" && courseAllowed(cid, "modern")) offered++;
      assert(offered === 0, "an unbuilt ruleset must offer no course, it offered " + offered);
      assert(!courseAllowed("provingRun", "modern"),
        "and must refuse a course even if that course's squares would suit it");
    } },

    { name: "every shipped course is readable by a ruleset that exists", run: function () {
      for (var cid in B.COURSES) {
        if (cid.charAt(0) === "_") continue;
        var eds = B.playableEditions(cid), ok = false;
        for (var i = 0; i < eds.length; i++) if (RULESETS[eds[i]] && RULESETS[eds[i]].built) ok = true;
        assert(ok, cid + " is in the menu and no built ruleset can read it");
      }
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

    // ---- Crash and Burn: swing doors ---------------------------------
    { name: "a swing door blocks when shut and lets you through when open", run: function () {
      var g = doorBench(); g.id = "bench"; g.name = "Bench"; g.flags = [];
      assert(B.doorAt(g, 0, 0, E) === "3", "the door should parse onto the east edge of (0,0)");
      benchGame(g, [{ c: 0, r: 0, face: E }]);
      var p = G.players[0];
      G.register = 0;
      runPlan(p, { kind: "move", dist: 1 });
      assert(p.c === 0, "register 1: shut, so it behaves as a wall -- got c=" + p.c);
      G.register = 2;
      runPlan(p, { kind: "move", dist: 1 });
      assert(p.c === 1, "register 3: open -- got c=" + p.c);
    } },

    { name: "a shut door stops a laser, an open one does not", run: function () {
      var g = doorBench(); g.id = "bench"; g.name = "Bench"; g.flags = [];
      benchGame(g, [{ c: 0, r: 0, face: E }, { c: 1, r: 0, face: E }]);
      G.register = 0;
      assert(firstRobotAlong(0, 0, E, true) === null, "a shut door should stop the beam");
      G.register = 2;
      assert(firstRobotAlong(0, 0, E, true) === G.players[1],
        "an open door should let it through -- the rulebook says beams use them too");
    } },

    { name: "a door round-trips through the picture byte for byte", run: function () {
      var g = doorBench();
      var rows = B.gridToPic(g);
      assert(rows[1] === " ..3.. ",
        "written back out unchanged, got " + JSON.stringify(rows[1]));
    } },

    { name: "a door survives board rotation", run: function () {
      var n = B.rotateGrid(doorBench(), 1), found = [];
      for (var c = 0; c < n.w; c++) {
        for (var r = 0; r < n.h; r++) {
          for (var d = 0; d < 4; d++) if (B.doorAt(n, c, r, d) === "3") found.push(c + "," + r);
        }
      }
      assert(found.length === 2,
        "one door, reported from both sides, survives a quarter turn -- got " + found.join(" "));
    } },

    { name: "a door is not a wall, and a wall is not a door", run: function () {
      var g = doorBench();
      assert(!B.wallAt(g, 0, 0, E), "a door must not report as a wall -- pushers mount on walls");
      assert(B.blockedAt(g, 0, 0, E, 0), "but it does block in register 1");
      assert(!B.blockedAt(g, 0, 0, E, 2), "and not in register 3");
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
    { name: "a press is a thing ON a square, and knows which squares it may not be on", run: function () {
      /* A PRESS IS NOT A CELL. Cannery Row is the board that settled
         it: every press on it is printed ON A CONVEYOR -- the roller
         beds run under the disc and the belt's arrow shows across it
         -- so the square is a belt AND a press, which no single cell
         could say. It lives in `timers` beside the picture now, the
         way pushers and burners always have.

         What is left to refuse is a press that is nowhere, on a hole,
         or that never fires. Plain floor is FINE -- that is most of
         them on the other boards. */
      var off = false, pit = false, noSet = false, twice = false, bad = false;
      try { bench([[".."]], [], [], [{ c: 3, r: 0, regs: [1] }]); }
      catch (e) { off = /off the board/.test(e.message); }
      assert(off, "a press outside the grid must be refused");
      try { bench([["o."]], [], [], [{ c: 0, r: 0, regs: [1] }]); }
      catch (e) { pit = /over a pit/.test(e.message); }
      assert(pit, "a press over a pit must be refused -- there is no floor to flatten anything against");
      try { bench([[".."]], [], [], [{ c: 0, r: 0, regs: [] }]); }
      catch (e) { noSet = /lists no registers/.test(e.message); }
      assert(noSet, "a press that never fires must be refused");
      try { bench([[".."]], [], [], [{ c: 0, r: 0, regs: [7] }]); }
      catch (e) { bad = /registers run 1-5/.test(e.message); }
      assert(bad, "a press firing in register 7 must be refused");
      try { bench([[".."]], [], [], [{ c: 0, r: 0, regs: [1] }, { c: 0, r: 0, regs: [2] }]); }
      catch (e) { twice = /two presses/.test(e.message); }
      assert(twice, "two presses on one square must be refused");
      /* And the case the whole change exists for: a press on a belt. */
      var g = bench([["b>"]], [], [], [{ c: 0, r: 0, regs: [1, 5] }]);
      assert(B.timerAt(g, 0, 0), "a press on a conveyor was not kept");
      assert(B.beltSpeed(B.codeAt(g, 0, 0)) === 1, "the conveyor under the press was lost");
      var art = tileInner(g, 0, 0) + tileClasses(g, 0, 0).join(" ");
      assert(art.indexOf("pr-t-belt") >= 0, "the belt under the press is not drawn");
      assert(art.indexOf("pr-press") >= 0 || /pressSvg|pr-art/.test(art), "the press over the belt is not drawn");
      assert(/>15</.test(art), "the press on a belt does not print its registers");
    } },

    { name: "a pusher can fire on an arbitrary set of registers", run: function () {
      /* The two printed parities cover most boards, but board H prints
         pushers on 1/2/3/4/5 and 2/3/4/5 among others, which "odd" and
         "even" cannot say at all. Every pusher carries its own set, so
         there is one question here and not three cases. */
      benchGame(bench([["..", ".."]], [], [], [],
        [{ c: 0, r: 0, d: "E", regs: [1, 2, 3, 4, 5] }]), [{ c: 0, r: 0, face: N }]);
      var p = G.players[0];
      for (var reg = 0; reg < 5; reg++) {
        p.c = 0; p.r = 0;
        G.register = reg;
        pusherPass();
        assert(p.c === 1, "a pusher listing every register must fire in register " + (reg + 1));
      }
      /* And one that lists only two must be silent in the others. */
      benchGame(bench([["..", ".."]], [], [], [],
        [{ c: 0, r: 0, d: "E", regs: [2, 5] }]), [{ c: 0, r: 0, face: N }]);
      p = G.players[0];
      G.register = 0; pusherPass();
      assert(p.c === 0, "register 1 is not in {2,5}");
      G.register = 1; pusherPass();
      assert(p.c === 1, "register 2 is");
    } },

    { name: "a pusher and a conveyor share a square", run: function () {
      /* The reason pushers left the picture. Board H prints rams over
         belt squares; while a pusher WAS the square, the two could not
         both be said, and the board came out wrong in whichever way
         the transcriber picked. The belt carries east, then the ram on
         the west wall shoves east again -- two squares in one register,
         which is what the cardboard does. */
      var g = bench([["b>", "..", ".."]], ["0,0,W"], [], [],
        [{ c: 0, r: 0, d: "E", regs: [1] }]);
      benchGame(g, [{ c: 0, r: 0, face: N }]);
      assert(B.beltSpeed(B.codeAt(g, 0, 0)) === 1, "the square under the ram is still a conveyor");
      assert(B.pusherAt(g, 0, 0), "and still carries the ram");
      G.register = 0;
      beltPass();
      assert(G.players[0].c === 1, "the belt carries east first");
      G.players[0].c = 0;
      pusherPass();
      assert(G.players[0].c === 1, "and the ram on the same square shoves east");
    } },

    { name: "a pusher with no wall behind it is refused", run: function () {
      /* A ram is bolted to a wall. One floating in open floor is a
         transcription slip that would otherwise render and play. */
      var refused = false;
      try {
        B.validateGrid("bench", bench([["..", ".."]], [], [], [],
          [{ c: 0, r: 0, d: "E", regs: [1] }]), function () {});
      } catch (e) { refused = /no wall behind it/.test(e.message); }
      assert(refused, "a wall-less pusher must be refused");
    } },

    { name: "a press flattens what stands on it, but only in its registers", run: function () {
      benchGame(bench([[".."]], [], [], [{ c: 0, r: 0, regs: [3] }]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 0;  pressPass();
      assert(p.alive, "register 1 is not register 3 -- it should still be standing");
      G.register = 2;  pressPass();
      assert(!p.alive, "register 3 is printed on it, so this should have flattened it");
    } },

    { name: "a press fires on every register it lists, and no others", run: function () {
      benchGame(bench([[".."]], [], [], [{ c: 0, r: 0, regs: [1, 2, 4] }]), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 2;  pressPass();
      assert(p.alive, "register 3 is not in {1,2,4}");
      G.register = 3;  pressPass();
      assert(!p.alive, "register 4 is -- the printed sets are arbitrary subsets, not odd/even");
    } },

    { name: "a burner scorches for one, in its registers only", run: function () {
      var jet = [{ c: 0, r: 0, d: "E", regs: [2, 3, 5] }];
      benchGame(bench([["..", ".."]], ["0,0,W"], [], [], [], jet), [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 0;  burnerPass();
      assert(p.damage === 0, "register 1 is not one of {2,3,5}");
      G.register = 2;  burnerPass();
      assert(p.damage === 1, "register 3 is, so one point -- got " + p.damage);
    } },

    { name: "a flame jet burns the floor in front of it, not the wall it is on", run: function () {
      /* The whole point of taking burners out of the picture. A jet is
         bolted to a wall; the square it scorches is ordinary floor and
         can be anything, including a conveyor. */
      var jet = [{ c: 0, r: 0, d: "E", regs: [1] }];
      var g = bench([["b>", "..", ".."]], ["0,0,W"], [], [], [], jet);
      assert(B.beltSpeed(B.codeAt(g, 0, 0)) === 1, "the square under the nozzle is still a conveyor");
      assert(B.burnerAt(g, 0, 0), "and is still in the fire");
      assert(!B.burnerAt(g, 1, 0), "a one-square jet does not reach the next square");
      benchGame(g, [{ c: 1, r: 0 }]);
      G.register = 0; burnerPass();
      assert(G.players[0].damage === 0, "a robot one square past a one-square jet is not burned");
    } },

    { name: "a two-square jet burns both squares", run: function () {
      /* Board G prints one: the cones fill the square the nozzle stands
         in and the fire lands in the next. Nothing in a single cell
         could ever have said that, which is why reach is a number. */
      var jet = [{ c: 0, r: 0, d: "E", regs: [1, 4], len: 2 }];
      var g = bench([["..", "..", ".."]], ["0,0,W"], [], [], [], jet);
      assert(B.burnerAt(g, 0, 0) && B.burnerAt(g, 1, 0), "both squares are in the fire");
      assert(!B.burnerAt(g, 2, 0), "the third is not");
      benchGame(g, [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }]);
      G.register = 0; burnerPass();
      assert(G.players[0].damage === 1, "the nozzle square burns");
      assert(G.players[1].damage === 1, "so does the square it reaches");
      assert(G.players[2].damage === 0, "and nothing beyond it");
      G.register = 1; burnerPass();
      assert(G.players[0].damage === 1, "register 2 is not one of {1,4}");
    } },

    { name: "a jet survives rotation and reaches the same way round", run: function () {
      /* Every shipped course uses rot 0, so a rotation that dropped the
         jets -- or turned them without turning their reach -- would play
         correctly on every board we have and wrongly on the first one
         that turns. The two-square jet is the one that proves reach
         rotated with direction rather than staying on an axis. */
      var g = B.parsePic("boardG", B.BOARD_SPECS.boardG);
      var t = B.rotateGrid(g, 1);
      assert(g.burners.length === 7, "test fixture moved: board G should have seven jets");
      assert(t.burners.length === 7, "a quarter turn lost " + (7 - t.burners.length) + " jet(s)");

      // the two-square jet at (3,3) throwing west lands at (8,3) throwing north
      var src = null, dst = null;
      for (var i = 0; i < g.burners.length; i++) if (g.burners[i].len === 2) src = g.burners[i];
      assert(src && src.c === 3 && src.r === 3 && src.d === W, "fixture: the long jet is (3,3) west");
      for (var j = 0; j < t.burners.length; j++) if (t.burners[j].len === 2) dst = t.burners[j];
      assert(dst, "the long jet must survive the turn still two squares long");
      assert(dst.c === 8 && dst.r === 3, "it should land at (8,3), landed at (" + dst.c + "," + dst.r + ")");
      assert(dst.d === N, "and throw north, throws " + dst.d);
      assert(B.wallAt(t, dst.c, dst.r, B.opposite(dst.d)), "and must still have a wall behind it");
      assert(B.burnerAt(t, 8, 2), "and its second square must be the one it now points at");

      var back = B.rotateGrid(g, 4);
      assert(JSON.stringify(back.burners) === JSON.stringify(g.burners),
        "four quarter turns must put every jet back where it started");
    } },

    { name: "a course carries every board's jets", run: function () {
      /* The sparse layers have to be stamped as well as the picture, and
         a course that quietly dropped them would still assemble, still
         validate and still play -- just without the fire. */
      var C = B.buildCourse("boardGRun");
      var g = B.parsePic("boardG", B.BOARD_SPECS.boardG);
      assert(g.burners.length === 7, "test fixture moved");
      assert(C.burners.length === g.burners.length,
        "the course should carry all " + g.burners.length + " jets, has " + C.burners.length);
      for (var i = 0; i < g.burners.length; i++) {
        var F = g.burners[i], at = B.burnerAt(C, F.c, F.r);
        assert(at, "the jet at (" + F.c + "," + F.r + ") is missing from the course");
        assert(at.d === F.d && at.len === F.len && at.regs.join("") === F.regs.join(""),
          "and arrived pointing, reaching or firing differently");
      }
      /* And the long one still reaches two squares once stamped. */
      assert(B.burnerAt(C, 2, 3), "the two-square jet must still cover (2,3) in the course");
    } },

    { name: "a jet with nothing to mount on, or nothing to reach, is refused", run: function () {
      function refused(cells, walls, jet, want) {
        var msg = null;
        try { B.validateGrid("bench", bench(cells, walls, [], [], [], jet), function () {}); }
        catch (e) { msg = e.message; }
        return msg !== null && want.test(msg);
      }
      assert(refused([["..", ".."]], [], [{ c: 0, r: 0, d: "E", regs: [1] }],
        /no wall behind it to mount on/), "a jet in open floor must be refused");
      /* Reach two with a wall in the way: the fire would be painted
         through something solid. */
      assert(refused([["..", ".."]], ["0,0,W", "0,0,E"],
        [{ c: 0, r: 0, d: "E", regs: [1], len: 2 }],
        /a wall stops it at one/), "a walled-off second square must be refused");
      /* Reach two off the edge of the board. */
      assert(refused([[".."]], ["0,0,W"], [{ c: 0, r: 0, d: "E", regs: [1], len: 2 }],
        /the second is off the board/), "a second square off the board must be refused");
      assert(refused([["..", ".."]], ["0,0,W"], [{ c: 0, r: 0, d: "E", regs: [1], len: 3 }],
        /reach 1 or 2/), "a three-square jet must be refused");
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

    { name: "nothing repaints a chosen segment's label to match its fill", run: function () {
      /* The failure this guards is not a bad token -- every token
         cleared its contrast floor while this was broken. It is the
         cascade: a looser rule later in the sheet coloured any `.on`
         it could reach, the chosen segment button among them, and
         painted the label the same accent as its own fill. 1:1, and
         the label was simply gone.

         Six rules in this sheet colour a bare `.on`. Narrowing the one
         that collided fixes today; the pairing below is pinned so the
         next one cannot. */
      var css = CSS;
      var m = css.match(/\.pr-seg-b\.on\{([^}]*)\}/);
      assert(m, "the chosen segment button has no rule of its own");
      var decl = {}, parts = m[1].split(";"), i;
      for (i = 0; i < parts.length; i++) {
        var kv = parts[i].split(":");
        if (kv.length > 1) decl[kv[0].trim()] = kv.slice(1).join(":").trim();
      }
      assert(decl.background && decl.color, "the chosen button must state both its fill and its label");
      assert(decl.background.indexOf(decl.color.replace("!important", "")) < 0 &&
             decl.color.replace("!important", "") !== decl.background.replace("!important", ""),
        "the chosen button paints its label the same colour as its fill");
      assert(/!important$/.test(decl.background) && /!important$/.test(decl.color),
        "unpinned, so any of the sheet's looser `.on` rules can repaint it");

      /* And the rule that actually collided stays narrowed, because a
         pinned colour still leaves the border to fight over. */
      assert(/\.pr-ed-row \.on:not\(\.pr-seg-b\)\{/.test(css),
        "the editor-row rule reaches segment buttons again");
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
      function shafts(k) { return (cardArt(k).match(/class="pr-cshaft"/g) || []).length; }
      /* The x of every arrowhead on a card, in order. */
      function headXs(k) {
        var out = [], re = /class="pr-cmark" d="M[-\d.]+ [-\d.]+L([-\d.]+) /g, m;
        while ((m = re.exec(cardArt(k)))) out.push(parseFloat(m[1]));
        return out;
      }
      for (k in CARD_KINDS) {
        var d = CARD_KINDS[k];
        if (!d.move) continue;
        var n = Math.abs(d.move);
        assert(chevs(k) === n,
          k + " moves " + n + " but draws " + chevs(k) + " chevron(s)");
        /* PARALLEL ARROWS, NOT ONE ARROW WITH BARBS. A Move 3 is three
           arrows side by side, so it needs three shafts as well as
           three heads -- the earlier art stacked the heads on ONE
           shaft and passed the count check above while drawing a
           single heavy arrow. */
        assert(shafts(k) === n,
          k + " draws " + shafts(k) + " shaft(s) for " + n + " square(s); one arrow each");
        var xs = headXs(k);
        for (var xi = 1; xi < xs.length; xi++) {
          assert(Math.abs(xs[xi] - xs[xi - 1]) > 20,
            k + " draws arrows " + Math.abs(xs[xi] - xs[xi - 1]).toFixed(1) +
            " apart; side by side means they must not overlap");
        }
        /* And centred, so a Move 2 does not sit off to one side. */
        var mid = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
        assert(Math.abs(mid - 50) < 0.6, k + " is not centred on the card, sits at " + mid.toFixed(1));
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

      /* Pushers are the third wall-mounted layer, and the one nothing
         else would catch: every shipped course happens to use rot 0,
         so a rotation that dropped them would play correctly on every
         board we have and wrongly on the first one that turns. */
      assert(g.pushers.length === 4, "test fixture moved: shuntYard should have four pushers");
      assert(t.pushers.length === 4, "a quarter turn lost " + (4 - t.pushers.length) + " pusher(s)");
      var U = null;
      for (var u = 0; u < t.pushers.length; u++) if (t.pushers[u].c === 11 && t.pushers[u].r === 0) U = t.pushers[u];
      assert(U, "the east-pushing ram at (0,0) should land at (11,0) after a clockwise turn");
      assert(U.d === S, "and should push south, pushes " + U.d);
      assert(U.regs.join("") === "135", "carrying its own registers, got " + U.regs.join(""));
      assert(B.wallAt(t, 11, 0, B.opposite(S)), "and must still have a wall behind it to mount on");

      /* Four turns is identity, which is the property that actually
         matters: a course may rotate a board by any quarter. */
      var back = B.rotateGrid(g, 4);
      assert(JSON.stringify(back.pushers) === JSON.stringify(g.pushers),
        "four quarter turns must put every pusher back where it started");
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

      /* The sparse layers have to be stamped too, and they are the half
         a tile-by-tile comparison cannot see. A course that quietly
         dropped every pusher would still assemble, still validate and
         still play -- just without the rams. */
      assert(C.pushers.length === p.pushers.length + g.pushers.length,
        "the course should carry every board's pushers, has " + C.pushers.length +
        " of " + (p.pushers.length + g.pushers.length));
      for (var u = 0; u < g.pushers.length; u++) {
        var U = g.pushers[u], at = B.pusherAt(C, U.c + 12, U.r);
        assert(at, "the right board's pusher at (" + U.c + "," + U.r + ") is missing from the course");
        assert(at.d === U.d && at.regs.join("") === U.regs.join(""),
          "and arrived facing or firing differently");
      }
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
        lasers: g.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
        /* Every sparse layer beside the picture has to make the trip.
           This is what caught the pushers when they moved out of the
           cells: the picture round-tripped perfectly and the rams
           vanished, which is the silent half of the failure. */
        pushers: g.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
        timers: g.timers.map(function (T) { return { c: T.c, r: T.r, regs: T.regs.slice() }; })
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
    // ---- the course assembler --------------------------------------
    /* The assembler is UI, but its MODEL is not, and the model is where
       a layout can go quietly wrong -- a grid that grew and dropped the
       boards already in it, an empty grid that races anyway, a dock
       offered as a board to place. Each of these is reachable without
       a DOM. */

    { name: "a board dragged out of the grid is not mistaken for a card", run: function () {
      /* The two drags travel as the same {from, i} pair. While they
         were told apart by shape alone, a placed board could be picked
         up and never dropped -- the dragover gate read it as a program
         card, found no register slot under the pointer and refused the
         drop, silently. */
      assert(DRAG_KINDS.slot === "card", "a card dragged out of a register is a card");
      assert(DRAG_KINDS.lslot === "board", "a board dragged out of the grid is a board");
      assert(DRAG_KINDS.hand === "card" && DRAG_KINDS.palette === "board",
        "the other two drags are misclassified");
      var seen = {}, k, kinds = 0;
      for (k in DRAG_KINDS) {
        assert(DRAG_KINDS[k] === "card" || DRAG_KINDS[k] === "board", k + " carries nothing known");
        if (!seen[DRAG_KINDS[k]]) { seen[DRAG_KINDS[k]] = 1; kinds++; }
      }
      assert(kinds === 2, "every drag was classified the same way, so the gate cannot tell them apart");
      UI.drag = { from: "lslot", i: 0 };
      assert(dragKind() === "board", "the gate would refuse to drop a board it is holding");
      UI.drag = { from: "slot", i: 0 };
      assert(dragKind() === "card", "the gate would drop a program card into the board grid");
      UI.drag = null;
      assert(dragKind() === null, "a drag that is not happening has no kind");
    } },

    { name: "the palette offers only full boards, never the docking bay", run: function () {
      var pal = paletteBoards(), i;
      assert(pal.length > 1, "the palette is empty, so this proves nothing");
      for (i = 0; i < pal.length; i++) {
        var sp = B.BOARD_SPECS[pal[i]];
        assert(sp.w === 12 && sp.h === 12,
          pal[i] + " is " + sp.w + "x" + sp.h + " and must not be placeable in the grid");
      }
      assert(pal.indexOf("dockingBay") < 0, "the docking bay is the start area, not a board to place");
    } },

    { name: "the first board may go in any slot; the rest go beside one", run: function () {
      /* An empty grid offers every slot, because the block follows
         whichever column the board lands in. After that a board has to
         touch one already down, or the course would be in two halves
         with nothing driving between them. */
      var empty = [null, null, null, null, null, null, null, null, null];
      assert(B.laySlots(empty).length === 9, "an empty grid should offer all nine slots");
      var one = empty.slice();
      one[4] = { id: "island", rot: 0 };                 // the middle
      var at = B.laySlots(one), seen = {};
      for (var i = 0; i < at.length; i++) seen[at[i].c + ":" + at[i].r] = 1;
      assert(at.length === 4, "a board in the middle should offer its four sides, offered " + at.length);
      assert(seen["1:0"] && seen["0:1"] && seen["2:1"] && seen["1:2"],
        "the four sides are not the four offered: " + Object.keys(seen).join(" "));
      assert(!seen["0:0"] && !seen["2:2"], "a corner was offered as a place to join");
      assert(!seen["1:1"], "the slot the board is standing in was offered");
    } },

    { name: "boards join along an edge, never at a corner", run: function () {
      var cells = [null, null, null, null, null, null, null, null, null];
      cells[0] = { id: "island", rot: 0 };
      cells[1] = { id: "cross", rot: 0 };
      assert(B.layConnected(cells), "two boards side by side are not being read as joined");
      cells[1] = null;
      cells[3] = { id: "cross", rot: 0 };                // directly below
      assert(B.layConnected(cells), "two boards one above the other are not being read as joined");
      cells[3] = null;
      cells[4] = { id: "cross", rot: 0 };                // corner to corner
      assert(!B.layConnected(cells), "boards touching at a corner read as joined");
      assert(B.layConnected([null, null, null, null, null, null, null, null, null]),
        "an empty grid is not two courses");
      var solo = [null, null, null, null, { id: "island", rot: 0 }, null, null, null, null];
      assert(B.layConnected(solo), "one board on its own is not two courses");
    } },

    { name: "a course stops at three boards by three", run: function () {
      UI.layout = { v: 3, dockCol: 0,
                    cells: [null, null, null, null, null, null, null, null, null] };
      assert(layoutPut(6, "island"), "the first board was refused");
      var put = 1;
      for (var g = 0; g < 12; g++) {
        var slots = B.laySlots(layoutNow().cells);
        if (!slots.length) break;
        var at = slots[0].r * B.LAY_COLS + slots[0].c;
        if (layoutPut(at, "cross")) put++;
      }
      assert(put === 9, "the grid took " + put + " boards, not nine");
      assert(!B.laySlots(layoutNow().cells).length, "a full grid still offers somewhere to put one");
      assert(!layoutPut(0, "pitMaze"), "a tenth board went down on a full grid");
      /* And a slot that is taken is refused whatever else is true. */
      assert(!layoutPut(6, "pitMaze"), "a board went down on top of another");
    } },

    { name: "an L of three boards is a course; two islands are not", run: function () {
      UI.layout = { v: 3, dockCol: 0, cells: [
        null, null, null,
        { id: "island", rot: 0 }, null, null,
        { id: "cross", rot: 0 }, { id: "pitMaze", rot: 0 }, null] };
      flagPick().mode = "arena";
      assert(B.layConnected(UI.layout.cells), "an L shape is not being read as connected");
      assert(!layoutProblem(), "an L of three boards was refused: " + layoutProblem());
      /* Two boards meeting only at a corner are two courses. */
      UI.layout = { v: 3, dockCol: 0, cells: [
        { id: "island", rot: 0 }, null, null,
        null, { id: "cross", rot: 0 }, null,
        null, null, null] };
      assert(!B.layConnected(UI.layout.cells), "boards touching at a corner read as joined");
      assert(/join the others/.test(layoutProblem() || ""),
        "a course in two halves was allowed: " + layoutProblem());
    } },

    { name: "an empty grid is not a course", run: function () {
      UI.layout = { v: 3, dockCol: 0,
                    cells: [null, null, null, null, null, null, null, null, null] };
      /* The MESSAGE and not merely a refusal: with the guard removed an
         empty grid is still refused, by composeCourse, in its own words
         -- so a test that accepts any refusal passes on a build that
         has lost the check it is there to protect. */
      assert(layoutProblem() === "Put a board on the grid.",
        "an empty grid should be refused in its own words, got: " + layoutProblem());
      layoutPut(7, "island");
      assert(!layoutProblem(), "a grid with a board on it was refused: " + layoutProblem());
    } },

    { name: "the block sits under a column that has a board over it", run: function () {
      /* A block under nothing is a row of bays opening onto the void.
         There is no half-covered case any more -- a board is twelve
         wide and so is the block -- so the whole question is which
         columns have something standing in their bottom row. */
      UI.layout = { v: 3, dockCol: 0, cells: [
        null, null, null,
        null, null, null,
        { id: "island", rot: 0 }, null, { id: "cross", rot: 0 }] };
      var ok = B.layDockCols(UI.layout.cells);
      assert(ok.join(",") === "0,2", "the open columns are " + ok.join(",") + ", not 0 and 2");
      assert(B.layDockCol(UI.layout.cells, 1) === 0,
        "the block was left under a column with nothing over it");
      assert(B.layDockCol(UI.layout.cells, 2) === 2, "the block would not stay where it was wanted");
      assert(layoutDockTo(2), "the block could not be moved under a covered column");
      assert(UI.layout.dockCol === 2, "the block did not move");
      assert(!layoutDockTo(1), "the block was moved under a column with nothing over it");
      assert(UI.layout.dockCol === 2, "the refused move happened anyway");
      /* Taking the board out from under it moves it rather than
         leaving it hanging. */
      layoutDrop(8);
      assert(UI.layout.dockCol === 0, "the block stayed under a column it had lost");
      /* And with the grid empty there is nowhere for it at all. */
      layoutDrop(6);
      assert(B.layDockCol(UI.layout.cells, 0) === -1, "an empty grid offered a place for the block");
    } },

    { name: "a board can be moved without being taken off first", run: function () {
      UI.layout = { v: 3, dockCol: 0, cells: [
        null, null, null, null, null, null,
        { id: "island", rot: 2 }, { id: "cross", rot: 1 }, null] };
      assert(!layoutMove(6, 7), "a board was moved on top of another");
      assert(UI.layout.cells[6].id === "island", "the refused move happened anyway");
      assert(layoutMove(7, 4), "a board could not be moved to a free slot");
      assert(!UI.layout.cells[7], "the slot it left is still occupied");
      assert(UI.layout.cells[4] && UI.layout.cells[4].id === "cross",
        "the board did not arrive where it was sent");
      assert(UI.layout.cells[4].rot === 1, "moving a board lost its rotation");
      assert(!layoutMove(4, 4), "a board was moved onto itself");
    } },

    { name: "a board turns both ways, and four of either comes back round", run: function () {
      UI.layout = { v: 3, dockCol: 0,
                    cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      var i, b = function () { return UI.layout.cells[6] || UI.layout.cells[3]; };
      for (i = 0; i < 4; i++) layoutTurn(6, 1);
      assert(b().rot === 0, "four clockwise quarter-turns did not come back round");
      for (i = 0; i < 4; i++) layoutTurn(6, -1);
      assert(b().rot === 0, "four anticlockwise quarter-turns did not come back round");
      layoutTurn(6, 1);
      assert(b().rot === 1, "clockwise went the wrong way, to " + b().rot);
      layoutTurn(6, -1);
      assert(b().rot === 0, "anticlockwise did not undo clockwise");
      layoutTurn(6, -1);
      assert(b().rot === 3, "anticlockwise from square should be three quarters, got " + b().rot);
      /* Turning is a property of the board and not of where it sits,
         so it must survive a move. */
      layoutMove(6, 3);
      assert(UI.layout.cells[3].rot === 3, "turning was lost when the board moved");
    } },

    { name: "the stage puts nothing over a board until it is selected", run: function () {
      /* A bar across every board's foot covered a sixth of every map
         on the stage, permanently, to say what the map says better.
         Nothing is drawn over the art now until a board is picked,
         and then it is three things on that board alone. */
      UI.layout = { v: 3, dockCol: 0, cells: [
        null, null, null, null, null, null,
        { id: "island", rot: 0 }, { id: "cross", rot: 0 }, null] };
      UI.heldBoard = null; UI.heldAt = null; UI.layMenu = null;
      var rest = layoutStage();
      assert(rest.indexOf("pr-lay-tool") < 0, "controls are drawn over a board nobody selected");
      assert(rest.indexOf("pr-lay-menu") < 0, "a menu is drawn with no menu open");
      assert((rest.match(/pr-lboard/g) || []).length === 2, "the stage lost a board");

      UI.heldAt = 7;
      var picked = layoutStage();
      assert((picked.match(/class="pr-lay-tool/g) || []).length === 3,
        "a selected board should carry three controls, carries " +
        (picked.match(/class="pr-lay-tool/g) || []).length);
      assert(/pr-lay-tool tl[^>]*data-act="lrotl" data-i="7"/.test(picked),
        "the left turn is not in the top-left corner of the selected board");
      assert(/pr-lay-tool tr[^>]*data-act="lrotr" data-i="7"/.test(picked),
        "the right turn is not in the top-right corner");
      /* AND THEY ARE THE ROTATE CARDS' OWN DRAWING. A quarter turn is
         a quarter turn wherever it appears, and a loop glyph says
         "ninety degrees of something" without saying of what -- which
         is the objection the cards already settled. Drawn from the
         same function, so the two cannot come to mean different
         things. */
      var leftPath = turnArrow(false), rightPath = turnArrow(true);
      assert(leftPath !== rightPath, "the two turns are the same drawing");
      assert(picked.indexOf(leftPath) >= 0, "the top-left control is not the ROTATE LEFT drawing");
      assert(picked.indexOf(rightPath) >= 0, "the top-right control is not the ROTATE RIGHT drawing");
      assert(cardArt("left").indexOf(leftPath) >= 0, "the ROTATE LEFT card is drawn some other way");
      assert(cardArt("right").indexOf(rightPath) >= 0, "the ROTATE RIGHT card is drawn some other way");
      /* Not a circle: the shape is a line that turns a corner, which
         is what makes it ninety degrees of HEADING rather than a spin. */
      assert(picked.indexOf("&#8634;") < 0 && picked.indexOf("&#8635;") < 0,
        "a loop glyph is still being used to turn a board");
      assert(/pr-lay-tool bin[^>]*data-act="lclear" data-i="7"/.test(picked),
        "the bin is not in the middle");
      /* On THAT board and no other. */
      assert(picked.indexOf('data-act="lrotl" data-i="6"') < 0,
        "the controls were drawn on a board that is not selected");
      assert(/data-i="7"[^>]*aria-pressed="true"/.test(picked) ||
             /aria-pressed="true"[^>]*data-i="7"/.test(picked),
        "the selected board does not say it is selected");
    } },

    { name: "no chrome class is a name the board art already answers to", run: function () {
      /* Twice now a new layer has taken a class the tile art was
         already using. pr-rail was the conveyor's guard rail, so the
         bumpers bar put a block layout and an opacity on every belt on
         the board; pr-turn was the gear's arc, so the course stage's
         turn control restyled every gear. Both were invisible in the
         source -- the two uses are three thousand lines apart -- and
         neither showed up as an error.

         The list is written out rather than derived, because deriving
         it from the chrome would mean deriving it from the same
         function that would be wrong. A new class not on the list is
         not covered; the comment is there so the next one gets added. */
      var art = artClasses();
      var mine = ["pr-fence", "pr-quarter", "pr-trash", "pr-lay-stage", "pr-lay-dock",
                  "pr-lay-board", "pr-lay-slot", "pr-lay-tool", "pr-lay-menu", "pr-lay-painted",
                  "pr-lboard", "pr-thumb", "pr-thumb-grid", "pr-thumb-walls", "pr-thumb-hits",
                  "pr-thumb-hit", "pr-pal", "pr-lay-shelf"];
      var clash = [];
      for (var i = 0; i < mine.length; i++) if (art[mine[i]]) clash.push(mine[i]);
      assert(!clash.length,
        "the board art already draws with " + clash.join(", ") + ", so styling " +
        (clash.length > 1 ? "those" : "that") + " as chrome restyles the board");
      /* And the sweep has to have found the art, or it is asserting
         that an empty set contains nothing. */
      assert(art["pr-rail"] && art["pr-turn"] && art["pr-cshaft"] && art["pr-wall"],
        "the sweep found no board art, so this proves nothing: " +
        Object.keys(art).slice(0, 8).join(" "));
    } },

    { name: "the right-click menu offers the same three things", run: function () {
      /* A duplicate path, not the only one: the corner controls are
         real buttons and Tab reaches those, so the menu is a
         convenience rather than a requirement. */
      UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, { id: "cross", rot: 0 }, null] };
      UI.heldAt = 6;
      UI.layMenu = { i: 6, x: 40, y: 30 };
      var html = layoutStage();
      var menu = html.match(/<div class="pr-lay-menu"[\s\S]*?<\/div>/);
      assert(menu, "no menu was drawn");
      assert(/role="menu"/.test(menu[0]), "the menu does not say it is one");
      assert(/data-act="lrotl"/.test(menu[0]), "the menu cannot turn left");
      assert(/data-act="lrotr"/.test(menu[0]), "the menu cannot turn right");
      assert(menu[0].indexOf(turnArrow(false)) >= 0 && menu[0].indexOf(turnArrow(true)) >= 0,
        "the menu does not use the ROTATE cards' drawing");
      assert(/data-act="lclear"/.test(menu[0]), "the menu cannot take the board off");
      assert((menu[0].match(/role="menuitem"/g) || []).length === 3,
        "the menu offers a different number of things");
      /* One menu, on the board it was opened over. */
      assert((html.match(/pr-lay-menu/g) || []).length === 1, "a menu was drawn on more than one board");
      UI.layMenu = { i: 7, x: 5, y: 5 };
      var other = layoutStage();
      assert(other.indexOf("pr-lay-menu") > other.indexOf('data-i="7"'),
        "the menu did not move to the board it was opened over");
      UI.layMenu = null;
    } },

    { name: "Escape backs out one layer at a time", run: function () {
      /* Closing the whole wizard because a right-click menu was open
         would throw away four screens of decisions. */
      UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      UI.heldBoard = null; UI.heldAt = 0; UI.layMenu = { i: 0, x: 1, y: 1 };
      assert(layEscape(), "Escape did nothing with a menu open");
      assert(!UI.layMenu, "the menu stayed open");
      assert(UI.heldAt === 0, "closing the menu also dropped the selection");
      assert(layEscape(), "Escape did nothing with a board selected");
      assert(UI.heldAt === null, "the selection stayed");
      assert(!layEscape(), "Escape consumed a key with nothing left to back out of");
      /* A board held off the shelf is the same layer as one held off
         the stage. */
      UI.heldBoard = "island";
      assert(layEscape(), "Escape did nothing with a board off the shelf in hand");
      assert(!UI.heldBoard, "the shelf board stayed in hand");
    } },

    { name: "a composed course carries every board it was given", run: function () {
      UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 1 }, { id: "cross", rot: 0 }, null] };
      var spec = layoutCourse(), C = B.buildCourse(spec);
      assert(spec.boards.length === 2, "the course lost a board: " + spec.boards.length);
      assert(C.w === 24 && C.h === 16, "two boards and a dock should be 24 by 16, is " + C.w + " by " + C.h);
      /* The block under whichever column it was put, squarely. */
      assert(spec.dock.at[0] === 0, "the block landed at column " + spec.dock.at[0] + ", not zero");
      assert(spec.dock.at[1] === 12, "the block is not under the bottom row");
      var rots = {};
      for (var k = 0; k < spec.boards.length; k++) rots[spec.boards[k].id] = spec.boards[k].rot;
      assert(rots.island === 1, "the course lost a board's rotation");
      assert(C.docks.length >= 8, "a composed course should carry eight bays, has " + C.docks.length);
      /* The preview carries a nominal flag so the course validates --
         real flags are placed in the workshop -- and even that one is
         never dropped on the start area. */
      assert(C.flags.length === 1, "the preview should carry one flag, has " + C.flags.length);
      for (var i = 0; i < C.flags.length; i++) {
        assert(C.flags[i].r < C.h - 4, "flag " + (i + 1) + " was placed inside the docking bay");
      }
    } },

    { name: "layouts saved by either older version still open", run: function () {
      /* Two shapes have come before this one. The first was a grid of
         any size with the block under a column of it; the second had
         the boards floating on a half-board lattice around the block.
         Somebody's half-built course surviving an update is the
         difference between a tool and a toy, so both are read -- and
         anything that will not fit three by three aligned is refused
         rather than opened crooked. */
      var old1 = { cols: 2, rows: 2, dockCol: 1,
                   cells: [{ id: "island", rot: 1 }, null,
                           { id: "cross", rot: 0 }, { id: "pitMaze", rot: 2 }] };
      var up = migrateLayout(old1);
      assert(up && up.v === 3, "a grid layout did not come across");
      var sp = B.laySpan(up.cells);
      assert(sp && sp.n === 3, "it came across with " + (sp ? sp.n : 0) + " of its three boards");
      /* The old grid's bottom row is the row ON the block, so it lands
         on the bottom row of the new one. */
      assert(B.layAt(up.cells, 0, 2) && B.layAt(up.cells, 0, 2).id === "cross",
        "cross is not on the bottom row");
      assert(B.layAt(up.cells, 1, 2) && B.layAt(up.cells, 1, 2).id === "pitMaze",
        "pitMaze is not beside it");
      assert(B.layAt(up.cells, 0, 1) && B.layAt(up.cells, 0, 1).id === "island",
        "island is not in the row above");
      assert(B.layAt(up.cells, 0, 1).rot === 1, "the migration lost a rotation");
      assert(up.dockCol === 1, "the block came across under column " + up.dockCol + ", not one");

      /* The half-board shape, where every board sat an even number of
         half-columns from the block. */
      var old2 = { v: 2, boards: [{ id: "island", rot: 2, x: 0, row: 0 },
                                  { id: "cross", rot: 0, x: 2, row: 0 },
                                  { id: "pitMaze", rot: 0, x: 0, row: 1 }] };
      var up2 = migrateLayout(old2);
      assert(up2 && up2.v === 3, "a half-board layout did not come across");
      assert(B.layAt(up2.cells, 0, 2) && B.layAt(up2.cells, 0, 2).id === "island",
        "the board on the block is not on the bottom row");
      assert(B.layAt(up2.cells, 1, 2) && B.layAt(up2.cells, 1, 2).id === "cross",
        "the board beside it moved");
      assert(B.layAt(up2.cells, 0, 1) && B.layAt(up2.cells, 0, 1).id === "pitMaze",
        "the board above it moved");
      assert(B.layAt(up2.cells, 0, 2).rot === 2, "the migration lost a rotation");

      /* A course that was standing half over is not an aligned course,
         and is refused rather than squashed onto the lattice. */
      assert(!migrateLayout({ v: 2, boards: [{ id: "island", rot: 0, x: -1, row: 0 },
                                             { id: "cross", rot: 0, x: 1, row: 0 }] }),
        "a half-offset course was squashed onto the grid");
      /* And a grid too big for three by three is dropped rather than
         opened half-broken. */
      assert(!migrateLayout({ cols: 4, rows: 1, dockCol: 0,
        cells: [{ id: "island", rot: 0 }, { id: "cross", rot: 0 },
                { id: "pitMaze", rot: 0 }, { id: "shuntYard", rot: 0 }] }),
        "a four-wide grid was carried into a model three wide");
      assert(!migrateLayout(null), "nothing at all came across as something");
      assert(!migrateLayout({ v: 3, dockCol: 0,
        cells: [null, null, null, null, null, null, { id: "nosuchboard", rot: 0 }, null, null] }),
        "a layout naming a board that does not exist was opened");
      /* Two boards meeting at a corner are two courses, whatever
         version they were saved by. */
      assert(!migrateLayout({ v: 3, dockCol: 0, cells: [
        { id: "island", rot: 0 }, null, null,
        null, { id: "cross", rot: 0 }, null,
        null, null, null] }), "a course in two halves was opened");
    } },

    // ---- the course workshop ---------------------------------------

    { name: "a belt presumes it is a continuation", run: function () {
      /* Laying a long run one square at a time and setting the facing
         for each is the tedious half of transcribing a board. A belt
         dropped next to one that points AT it takes that direction, so
         only the corners need saying. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.pick = "b"; ED.mode = "tile"; ED.tool = "b";
      ED.dir = N;                                   // deliberately NOT the run's direction
      edSetCell(1, 3, "b>");
      assert(edPaintCode(2, 3) === "b>",
        "a belt beside one pointing at it laid " + edPaintCode(2, 3) + " instead of carrying on");
      /* A square nothing feeds takes the facing in hand. */
      assert(edPaintCode(6, 6) === "b^",
        "a belt with nothing feeding it should take the tool's facing, took " + edPaintCode(6, 6));
      /* It is the belt POINTING AT the square that counts, not merely
         a belt beside it -- one running past is not a run to join. */
      edSetCell(5, 0, "b^");
      assert(edPaintCode(6, 0) === "b^",
        "a belt running past was treated as feeding the square beside it");
      /* And speed is part of it: an express run does not continue a
         slow one, because they are different belts. */
      ED.pick = "B"; ED.tool = "B";
      assert(edPaintCode(2, 3) === "B^",
        "an express belt continued a slow one: " + edPaintCode(2, 3));
      ED = keep;
    } },

    { name: "a paint stroke is one step of history", run: function () {
      /* Undoing a twelve-square run twelve times is not undoing it. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.pick = "b"; ED.mode = "tile"; ED.tool = "b"; ED.dir = E;
      ED.undo = [];
      var before = edMark();
      ED.stroke = { before: before, last: { c: 1, r: 1 }, n: 1 };
      edSetCell(1, 1, "b>");
      var c;
      for (c = 2; c <= 5; c++) {
        edSetCell(c - 1, 1, "b>");
        edSetCell(c, 1, "b>");
        ED.stroke.last = { c: c, r: 1 };
        ED.stroke.n++;
      }
      edKeep(before);
      ED.stroke = null;
      assert(ED.undo.length === 1, "a five-square run cost " + ED.undo.length + " steps");
      for (c = 1; c <= 5; c++) {
        assert(B.beltSpeed(B.codeAt(ED.grid, c, 1)) === 1, "square " + c + " is not a belt");
      }
      edRestoreSnap(ED.undo.pop());
      for (c = 1; c <= 5; c++) {
        assert(!B.beltSpeed(B.codeAt(ED.grid, c, 1)), "square " + c + " survived the undo");
      }
      ED = keep;
    } },

    { name: "the library offers flags on a course and never on a board", run: function () {
      /* Flags are placed on a COURSE. They are not printed on a board,
         so a board workshop that offered them would be offering to
         write something into board data that no board carries. */
      var keep = ED;
      ED = edState(edNew(12, 12), "bench");
      ED.isCourse = false;
      var board = edLibrary().map(function (t) { return t.key; });
      assert(board.indexOf("flag") < 0, "the board workshop offers a flag tool");
      assert(board.indexOf("b") >= 0 && board.indexOf("wall") >= 0 && board.indexOf("pusher") >= 0,
        "the board workshop lost its own tools: " + board.join(" "));
      ED.isCourse = true;
      var course = edLibrary().map(function (t) { return t.key; });
      assert(course.indexOf("flag") >= 0, "the course workshop has no flag tool");
      assert(course.length === board.length + 1,
        "the two libraries differ by more than the flag: " + course.length + " against " + board.length);
      /* Every entry says what kind it is, because the mode follows from
         the entry rather than being chosen separately. */
      for (var i = 0; i < ED_TOOLS.length; i++) {
        assert(ED_TOOLS[i].kind, ED_TOOLS[i].key + " has no kind");
        assert(ED_TOOLS[i].label, ED_TOOLS[i].key + " has no name to show");
      }
      ED = keep;
    } },

    { name: "a square is edited as everything standing on it", run: function () {
      /* A square is not one thing. Board H prints a conveyor with a ram
         bolted to the wall beside it, and BOTH of those turn -- so a
         panel that picked the most specific one and called that the
         selection could set one facing and never the other. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      edSetCell(2, 2, "b>");
      var parts = edParts(2, 2);
      assert(parts.length === 1 && parts[0].id === "tile",
        "a bare square should list only itself, listed " + parts.length);
      assert(parts[0].dir, "a conveyor is not being offered a facing");
      assert(parts[0].label === "Conveyor", "the square is called " + parts[0].label);

      ED.grid.pushers.push({ c: 2, r: 2, d: N, regs: [1, 3, 5] });
      ED.grid.lasers.push({ c: 2, r: 2, d: E, n: 2 });
      ED.grid.flags.push({ c: 2, r: 2 });
      parts = edParts(2, 2);
      var ids = parts.map(function (p) { return p.id; });
      assert(ids.join(" ") === "tile laser:0 pusher:0 flag:0",
        "the square lists " + ids.join(" "));
      /* Two facings on one square, and each is its own. */
      ED.sel = { c: 2, r: 2, part: "tile" };
      assert(edPartDir(edPart()) === E, "the belt's facing is not the belt's");
      ED.sel.part = "pusher:0";
      assert(edPartDir(edPart()) === N, "the ram's facing is not the ram's");
      edSelEdit("dir", S, "pusher:0");
      assert(ED.grid.pushers[0].d === S, "turning the ram did not turn the ram");
      assert(B.dirOf(B.codeAt(ED.grid, 2, 2)) === E, "turning the ram turned the belt as well");
      edSelEdit("dir", W, "tile");
      assert(B.dirOf(B.codeAt(ED.grid, 2, 2)) === W, "turning the belt did not turn the belt");
      assert(ED.grid.pushers[0].d === S, "turning the belt turned the ram as well");

      /* The keys steer whichever part is in focus, and only that one. */
      ED.sel.part = "tile";
      edFace(N);
      assert(B.dirOf(B.codeAt(ED.grid, 2, 2)) === N, "W did not face the focused belt north");
      assert(ED.grid.pushers[0].d === S, "W turned a part that was not in focus");
      ED.sel.part = "laser:0";
      edSpin(1);
      assert(ED.grid.lasers[0].d === S, "E did not turn the focused laser");

      /* A focus that is taken off falls back to the square rather than
         pointing at a gap. */
      edSelEdit("remove", 0, "laser:0");
      assert(!ED.grid.lasers.length, "the laser was not taken off");
      assert(edPart().id === "tile", "the focus is still pointing at the laser that is gone");
      ED = keep;
    } },

    { name: "every library entry draws itself, turned the way it will go", run: function () {
      /* A word for a tool makes you hold the direction in your head. A
         picture of it, turned the way the compass is pointing, does
         not -- and a wall-mounted trap draws with its wall, because
         the mount and the wall behind it are one placement. */
      var keep = ED;
      ED = edState(edNew(4, 4), "bench");
      ED.grid.flags = [];
      ED.isCourse = true;
      ED.pushRegs = [1, 3, 5]; ED.burnRegs = [2, 4];
      var lib = edLibrary(), i, seen = {};
      for (i = 0; i < lib.length; i++) {
        var html = edToolThumb(lib[i]);
        assert(html && html.length > 20, lib[i].key + " draws nothing in the library");
        seen[lib[i].key] = html;
      }
      /* The four that turn actually turn. */
      var turners = ["b", "wall", "pusher", "burner", "laser"];
      for (i = 0; i < turners.length; i++) {
        ED.dir = N;
        var north = edToolThumb(edToolByKey(turners[i]));
        ED.dir = S;
        var south = edToolThumb(edToolByKey(turners[i]));
        assert(north !== south, turners[i] + " draws the same picture whichever way it is facing");
      }
      /* And the trap icons carry the wall they bolt to, on the far
         side from the way they fire. */
      ED.dir = N;
      var ram = edToolThumb(edToolByKey("pusher"));
      assert(ram.indexOf("pr-wall") >= 0, "the ram icon has no wall behind it");
      assert(ram.indexOf("pr-t-pusher") >= 0, "the ram icon has no ram on it");
      var jet = edToolThumb(edToolByKey("burner"));
      assert(jet.indexOf("pr-t-burner") >= 0, "the jet icon has no jet on it");
      assert(jet.indexOf("pr-wall") >= 0, "the jet icon has no wall behind it");
      var beam = edToolThumb(edToolByKey("laser"));
      assert(beam.indexOf("pr-beam") >= 0, "the laser icon draws no beam");
      assert(beam.indexOf("pr-wall") >= 0, "the laser icon has no wall behind it");
      /* The plain wall is a wall and nothing else. */
      var wall = edToolThumb(edToolByKey("wall"));
      assert(wall.indexOf("pr-wall") >= 0, "the wall icon has no wall on it");
      assert(wall.indexOf("pr-t-pusher") < 0, "the wall icon brought a ram with it");
      ED = keep;
    } },

    { name: "a wall-mounted trap brings its wall with it", run: function () {
      /* A ram pushing north is bolted to the wall on its south side.
         The validator has always refused a mount without one, so the
         workshop puts the wall up as the mount goes down rather than
         drawing a map that goes red until somebody remembers why. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.pushRegs = [1, 3, 5];
      ED.burnRegs = [2, 4];
      ED.dir = N;
      assert(!B.wallAt(ED.grid, 4, 4, S), "fixture: this square starts unwalled");
      edPut("pusher", 4, 4, {});
      assert(ED.grid.pushers.length === 1, "the ram did not go down");
      assert(B.wallAt(ED.grid, 4, 4, S),
        "a ram pushing north went down with no wall behind it to mount on");

      /* Turning it takes the wall with it, and does not leave the old
         one standing -- that is how a board ends up fenced by walls
         nobody put there. */
      ED.sel = { c: 4, r: 4, part: "pusher:0" };
      edSelEdit("dir", E, "pusher:0");
      assert(B.wallAt(ED.grid, 4, 4, W), "turning the ram east left it nothing to mount on");
      assert(!B.wallAt(ED.grid, 4, 4, S), "turning the ram left its old wall standing");

      /* Two mounts sharing one face keep it between them. */
      ED.dir = E;
      edPut("laser", 4, 4, {});
      assert(ED.grid.lasers.length === 1 && B.wallAt(ED.grid, 4, 4, W),
        "the laser did not share the wall");
      edSelEdit("dir", S, "pusher:0");
      assert(B.wallAt(ED.grid, 4, 4, W),
        "turning the ram took away a wall the laser was still bolted to");
      assert(B.wallAt(ED.grid, 4, 4, N), "the ram has nothing to mount on after turning south");

      /* And the wall cannot be taken down under a mount that needs it. */
      edSelEdit("wall", W);
      assert(B.wallAt(ED.grid, 4, 4, W), "a wall came down under the laser bolted to it");
      edSelEdit("remove", 0, "laser:0");
      edSelEdit("wall", W);
      assert(!B.wallAt(ED.grid, 4, 4, W), "the wall would not come down once nothing needed it");

      /* Which is the rule the validator has always enforced, so a map
         drawn this way is valid rather than merely plausible. */
      B.validateGrid("bench", ED.grid, function () {});
      ED = keep;
    } },

    { name: "the square's walls are on the square, and are its own", run: function () {
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      edSetCell(3, 3, "b>");
      ED.sel = { c: 3, r: 3, part: "tile" };
      var d;
      for (d = 0; d < 4; d++) assert(!B.wallAt(ED.grid, 3, 3, d), "fixture: this square starts walled");
      edSelEdit("wall", N);
      assert(B.wallAt(ED.grid, 3, 3, N), "the wall did not go up");
      assert(!B.wallAt(ED.grid, 3, 3, S), "putting up the north wall put up another");
      /* A wall lives on an edge and an edge has two sides, so the
         square above sees the same wall -- which is the whole reason
         the lattice is stored once. */
      assert(B.wallAt(ED.grid, 3, 2, S), "the square on the other side of the wall cannot see it");
      edSelEdit("wall", N);
      assert(!B.wallAt(ED.grid, 3, 3, N), "the wall did not come down again");
      /* Walls belong to the square rather than to any one thing on it,
         so they survive taking the thing off. */
      edSelEdit("wall", E);
      edSelEdit("clear");
      assert(B.wallAt(ED.grid, 3, 3, E), "clearing the square took its wall with it");
      ED = keep;
    } },

    { name: "the large tile carries everything standing on the square", run: function () {
      /* The panel's picture is a one-square view, and the tile art
         reads the traps out of the grid's sparse LISTS rather than out
         of the cell -- so a view built from the cell alone draws the
         belt and nothing standing on it, which is the one case this
         panel exists for. The square with a conveyor AND a ram on it
         is the case the workshop was asked for by name. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.isCourse = true;
      ED.pushRegs = [1, 3, 5]; ED.burnRegs = [2, 4];
      edSetCell(4, 4, "b>");
      ED.dir = N;
      edPut("pusher", 4, 4, {});
      edPut("laser", 4, 4, {});
      /* Two flags, so the number on the picture has to be looked up
         rather than assumed: the one on this square is the second. */
      ED.grid.flags.push({ c: 1, r: 1 });
      ED.grid.flags.push({ c: 4, r: 4 });
      assert(B.wallAt(ED.grid, 4, 4, S), "fixture: the mounts brought no wall with them");

      var big = edBigTile({ c: 4, r: 4, part: "tile" });
      assert(big.indexOf("pr-t-belt") >= 0, "the large tile lost the conveyor under the traps");
      assert(big.indexOf("pr-t-pusher") >= 0, "the large tile does not draw the ram on the square");
      assert(big.indexOf("pr-emitter") >= 0, "the large tile does not draw the laser on the square");
      assert(big.indexOf("pr-beam") >= 0, "the large tile fires no beam from the laser on it");
      assert(big.indexOf("pr-flag") >= 0, "the large tile does not draw the flag on the square");
      assert(big.indexOf(">2<") >= 0, "the large tile numbered the flag something other than 2");
      assert(big.indexOf('class="pr-wall"') >= 0, "the large tile shows none of the square's walls");
      /* And only THIS square's: the flag next door is not on it. */
      assert(big.indexOf(">1<") < 0, "the large tile brought a flag from another square with it");

      /* A jet reaches past its own square, and the square it scorches
         is not the nozzle -- so the far square draws fire and no
         nozzle, which the view has to carry across as well. */
      ED.dir = N;
      ED.burnLen = 2;
      edPut("burner", 4, 6, {});
      var far = edBigTile({ c: 4, r: 5, part: "tile" });
      assert(far.indexOf("pr-t-burner") >= 0, "the large tile misses the jet playing over the square");
      assert(far.indexOf("pr-jet-mount") < 0, "the large tile put a nozzle on the square the jet only reaches");

      /* A beam crosses squares it is not bolted to, for the same
         reason and with the same consequence: a square drawn without
         it looks safe. */
      var lit = edBigTile({ c: 4, r: 3, part: "tile" });
      assert(lit.indexOf("pr-beam") >= 0, "the large tile misses the beam crossing the square");
      assert(lit.indexOf("pr-emitter") < 0, "the large tile put an emitter on a square the beam only crosses");
      ED = keep;
    } },

    { name: "the course workshop opens with the flag tool in hand, and every tool answers to a key", run: function () {
      /* The one thing every course has to have done to it in the
         workshop is flags, so it opens ready to lay them rather than
         with a conveyor nobody asked for. And the second time you
         want the ram you press M rather than going back to the rail:
         every tool has a letter, printed on it, and none of the
         letters is one of the six that steer. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      edOpenCourse({ boards: [], dock: null });
      assert(ED.pick === "flag", "a course opened with " + ED.pick + " in hand, not the flag");
      assert(ED.isCourse, "opening a course did not make it a course");
      var i, seen = {};
      for (i = 0; i < ED_TOOLS.length; i++) {
        var t = ED_TOOLS[i];
        assert(t.hot && /^[a-z]$/.test(t.hot), t.key + " has no letter to press");
        assert(ED_STEER_KEYS.indexOf(t.hot) < 0, t.key + " answers to " + t.hot + ", which steers");
        assert(t.group, t.key + " sits under no heading in the rail");
        seen[t.hot] = (seen[t.hot] || 0) + 1;
      }
      /* One letter reaches every tool on the course. */
      var lib = edLibrary();
      for (i = 0; i < lib.length; i++) {
        ED.pick = "sel";
        var got = null, n;
        for (n = 0; n < 4 && got !== lib[i].key; n++) { got = edKeyTool(lib[i].hot); ED.pick = got; }
        assert(got === lib[i].key, lib[i].hot + " never reaches " + lib[i].key + ", it stops at " + got);
      }
      /* A shared letter walks between its tools rather than sticking
         on the first. */
      ED.pick = "sel";
      assert(edKeyTool("g") === "l", "G from nowhere picked " + edKeyTool("g"));
      ED.pick = "l";
      assert(edKeyTool("g") === "r", "G on the CCW gear picked " + edKeyTool("g") + " rather than the CW one");
      ED.pick = "r";
      assert(edKeyTool("g") === "l", "G on the CW gear did not come back round");
      /* A letter no tool answers to picks nothing, so the key is left
         alone for whatever else wants it. */
      assert(edKeyTool("y") === null, "Y picked a tool");
      /* And on a board there is no flag to press F for. */
      ED.isCourse = false;
      assert(edKeyTool("f") === null, "F picks a flag on a board, where flags are not a thing");
      ED = keep;
    } },

    { name: "zoom keeps the point under the pointer where it was, and fit shows the whole map", run: function () {
      /* Zooming about the corner is how the thing you were looking at
         leaves the screen. The scroll that keeps a content point under
         the pointer is arithmetic, so it is checked as arithmetic. */
      var cases = [[1, 2, 0, 0, 100, 100], [2.5, 0.7, 300, 900, 17, 420], [0.5, 4, 8, 8, 0, 0]];
      for (var i = 0; i < cases.length; i++) {
        var k = cases[i], to = edZoomScroll(k[0], k[1], k[2], k[3], k[4], k[5]);
        var was = (k[2] + k[4] - ED_PAD) / k[0], now = (to.x + k[4] - ED_PAD) / k[1];
        assert(Math.abs(was - now) < 1e-9, "case " + i + ": the point under the pointer moved from " + was + " to " + now);
        var wasY = (k[3] + k[5] - ED_PAD) / k[0], nowY = (to.y + k[5] - ED_PAD) / k[1];
        assert(Math.abs(wasY - nowY) < 1e-9, "case " + i + ": the point under the pointer moved vertically");
      }
      /* Fit: the whole map, as large as the box allows, with its
         margin -- and it is the SHORT side that decides. */
      var z = edFitZoom(12, 16, 1000, 600);
      assert(16 * TILE * z + ED_PAD * 2 <= 600 + 1e-9, "a fitted 16-row map is taller than the box");
      assert(16 * TILE * z + ED_PAD * 2 > 599, "the fitted map leaves room it could have used");
      assert(12 * TILE * z + ED_PAD * 2 <= 1000, "a fitted map is wider than the box");
      assert(edFitZoom(1, 1, 9000, 9000) === ED_ZOOM_MAX, "fitting one square to a wall zooms past the cap");
      assert(edFitZoom(40, 40, 50, 50) === ED_ZOOM_MIN, "fitting a huge map to a thumbnail zooms under the floor");
      assert(edClampZoom(99) === ED_ZOOM_MAX && edClampZoom(0) === ED_ZOOM_MIN, "the clamp does not clamp");
    } },

    { name: "a dragged flag keeps its number, and a dragged trap takes its wall with it", run: function () {
      /* Moving flag 2 is not taking flag 2 off and putting a new last
         flag down. A trap keeps its facing and its settings, and its
         wall comes with it -- up on the new square, down on the old
         one unless something else there still needs it. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.isCourse = true;
      ED.grid.flags = [{ c: 1, r: 1 }, { c: 2, r: 2 }, { c: 3, r: 3 }];
      ED.dock = { at: [0, 6] };
      edSetCell(5, 5, "o.");
      assert(edMovePart(edPartById2("flag:1"), 4, 4), "flag 2 would not move to an empty floor square");
      assert(ED.grid.flags[1].c === 4 && ED.grid.flags[1].r === 4, "flag 2 did not land where it was dropped");
      assert(ED.grid.flags.length === 3 && ED.grid.flags[0].c === 1 && ED.grid.flags[2].c === 3,
        "moving flag 2 disturbed the others");
      assert(!edMovePart(edPartById2("flag:1"), 5, 5), "a flag was dropped into a pit");
      assert(!edMovePart(edPartById2("flag:1"), 2, 7), "a flag was dropped on the starting block");
      assert(!edMovePart(edPartById2("flag:1"), 3, 3), "a flag was dropped on top of flag 3");
      assert(!edMovePart(edPartById2("flag:1"), 4, 4), "dropping a flag where it already is counted as a move");
      assert(ED.grid.flags[1].c === 4 && ED.grid.flags[1].r === 4, "a refused move moved it anyway");

      /* A ram facing north is bolted to the south wall. */
      ED.grid.pushers.push({ c: 2, r: 2, d: N, regs: [1, 3, 5] });
      B.setWall(ED.grid, 2, 2, S, true);
      assert(edMovePart(edPartById2("pusher:0"), 6, 1), "the ram would not move");
      assert(ED.grid.pushers[0].c === 6 && ED.grid.pushers[0].r === 1, "the ram did not land where it was dropped");
      assert(ED.grid.pushers[0].d === N && ED.grid.pushers[0].regs.join() === "1,3,5",
        "the ram lost its facing or its registers on the way");
      assert(B.wallAt(ED.grid, 6, 1, S), "the moved ram has no wall to be bolted to");
      assert(!B.wallAt(ED.grid, 2, 2, S), "the ram left its wall behind");
      /* Unless something else is still bolted to it. */
      ED.grid.lasers.push({ c: 6, r: 1, d: N, n: 1 });
      assert(edMovePart(edPartById2("pusher:0"), 6, 4), "the ram would not move a second time");
      assert(B.wallAt(ED.grid, 6, 1, S), "the ram took a wall the laser is still bolted to");
      /* Two of a kind cannot share a square. */
      ED.grid.pushers.push({ c: 0, r: 0, d: E, regs: [2, 4] });
      assert(!edMovePart(edPartById2("pusher:1"), 6, 4), "a second ram was dropped on the first");
      ED = keep;

      function edPartById2(id) {
        var g = ED.grid, m = /^(\w+):(\d+)$/.exec(id);
        return { id: id, kind: m[1], i: +m[2] };
      }
    } },

    { name: "the ghost says what a click would do before it lands", run: function () {
      /* A refusal after the click is the workshop being clunky: the
         answer belongs on the pointer, before. The ghost shows what
         would go down, hides when the click would pick something up,
         and greys out when it would be refused. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.isCourse = true;
      ED.grid.flags = [{ c: 1, r: 1 }];
      ED.dock = { at: [0, 6] };
      edSetCell(5, 5, "o.");
      ED.grid.pushers.push({ c: 3, r: 3, d: N, regs: [1, 3, 5] });
      assert(edClickWould("flag", { c: 2, r: 2 }) === "put", "a flag on floor is not a put");
      assert(edClickWould("flag", { c: 1, r: 1 }) === "take", "a flag on a flag is not a take");
      assert(edClickWould("flag", { c: 5, r: 5 }) === "no", "a flag in a pit is not refused");
      assert(edClickWould("flag", { c: 4, r: 7 }) === "no", "a flag on the starting block is not refused");
      assert(edClickWould("pusher", { c: 3, r: 3 }) === "take", "a ram on a ram is not a take");
      assert(edClickWould("pusher", { c: 2, r: 2 }) === "put", "a ram on floor is not a put");
      assert(edClickWould("tile", { c: 5, r: 5 }) === "put", "a tile over a pit is not a put");
      /* Off the course there is nothing to do anything to. */
      ED.grid.cell[7 * 8 + 7] = "";
      assert(edClickWould("tile", { c: 7, r: 7 }) === "no", "a click off the course is not refused");

      /* And the picture is the thing a click would lay: a belt turned
         to join the run beside it, a wall on the edge the pointer is
         nearest, whatever the compass says. */
      ED.dir = N;
      edSetCell(1, 3, "b>");
      var belt = edToolView(edToolByKey("b"), { c: 2, r: 3, edge: null });
      assert(belt.cell[0] === "b>", "the belt ghost shows " + belt.cell[0] + " beside a run heading east");
      var wall = edToolView(edToolByKey("wall"), { c: 2, r: 3, edge: E });
      assert(B.wallAt(wall, 0, 0, E) && !B.wallAt(wall, 0, 0, N), "the wall ghost is not on the edge under the pointer");
      var mid = edToolView(edToolByKey("wall"), { c: 2, r: 3, edge: null });
      assert(B.wallAt(mid, 0, 0, N), "the wall ghost in the middle of a square ignores the compass");
      assert(edToolView(edToolByKey("sel"), { c: 2, r: 3 }) === null, "the select tool has a ghost");
      assert(edToolView(edToolByKey("pan"), { c: 2, r: 3 }) === null, "the hand has a ghost");
      ED = keep;
    } },

    { name: "the flag list is the race, and its verbs move it", run: function () {
      /* Earlier and later are moves in the order, each one step of
         history; taking one off closes the gap. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.isCourse = true;
      ED.grid.flags = [{ c: 1, r: 1 }, { c: 2, r: 2 }, { c: 3, r: 3 }];
      ED.undo = [];
      ED.sel = { c: 2, r: 2, part: "flag:1" };
      edFlagShift(1, 1);
      assert(ED.grid.flags[2].c === 2 && ED.grid.flags[1].c === 3, "flag 2 did not become flag 3");
      assert(ED.sel.part === "flag:2", "the selection did not follow the flag down the order");
      assert(ED.undo.length === 1, "moving a flag in the order cost " + ED.undo.length + " steps");
      edFlagShift(0, -1);
      assert(ED.undo.length === 1 && ED.grid.flags[0].c === 1, "moving the first flag earlier did something");
      edFlagDrop(0);
      assert(ED.grid.flags.length === 2 && ED.grid.flags[0].c === 3, "taking flag 1 off did not close the gap");
      assert(ED.undo.length === 2, "taking a flag off is not a step of history");
      ED.flagNum = 9;
      edFlagDrop(5);
      assert(ED.undo.length === 2, "taking off a flag that is not there cost a step");
      ED = keep;
    } },

    { name: "delete takes off what is in focus, and escape steps outward", run: function () {
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.undo = [];
      edSetCell(2, 2, "b>");
      ED.grid.pushers.push({ c: 2, r: 2, d: N, regs: [1, 3, 5] });
      B.setWall(ED.grid, 2, 2, S, true);
      ED.sel = { c: 2, r: 2, part: "pusher:0" };
      edDeleteFocused();
      assert(!ED.grid.pushers.length, "delete on the ram did not take the ram off");
      assert(B.codeAt(ED.grid, 2, 2) === "b>", "delete on the ram took the belt under it as well");
      assert(edPart().id === "tile", "the focus did not fall back to the square");
      edDeleteFocused();
      assert(B.codeAt(ED.grid, 2, 2) === "..", "delete on the belt did not make it floor");
      var n = ED.undo.length;
      edDeleteFocused();
      assert(ED.undo.length === n, "delete on bare floor cost a step of history");
      /* Escape lets go of the selection first, and only then puts the
         select tool in hand. */
      ED.pick = "b";
      edEscape();
      assert(!ED.sel && ED.pick === "b", "the first escape did not merely deselect");
      edEscape();
      assert(ED.pick === "sel", "the second escape did not reach for the select tool");
      ED = keep;
    } },

    { name: "a quick stroke lays every square it skipped", run: function () {
      /* At a small zoom one pointer move can cross four squares. A
         stroke that only laid the squares it was told about left gaps
         in a run whenever the mouse moved at speed. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.pick = "b"; ED.mode = "tile"; ED.tool = "b"; ED.dir = N;
      ED.undo = [];
      ED.stroke = { before: edMark(), last: { c: 1, r: 1 }, n: 1 };
      edSetCell(1, 1, "b^");
      assert(edStrokeTo(5, 1), "a jump along the row laid nothing");
      var c;
      for (c = 1; c <= 5; c++) {
        assert(B.codeAt(ED.grid, c, 1) === "b>", "square " + c + " in the run is " + B.codeAt(ED.grid, c, 1));
      }
      assert(ED.stroke.last.c === 5 && ED.stroke.last.r === 1, "the stroke did not end where the pointer is");
      /* Down a column, and the corner square turns to follow. */
      edStrokeTo(5, 3);
      assert(B.codeAt(ED.grid, 5, 1) === "bv" && B.codeAt(ED.grid, 5, 2) === "bv" && B.codeAt(ED.grid, 5, 3) === "bv",
        "the run did not turn the corner and carry on down");
      /* A diagonal jump is an L: along the row first, then down. */
      edStrokeTo(2, 5);
      assert(B.codeAt(ED.grid, 4, 3) === "b<" && B.codeAt(ED.grid, 2, 3) === "bv" && B.codeAt(ED.grid, 2, 5) === "bv",
        "a diagonal jump did not lay an L: " + B.codeAt(ED.grid, 4, 3) + " " + B.codeAt(ED.grid, 2, 3) + " " + B.codeAt(ED.grid, 2, 5));
      assert(!edStrokeTo(2, 5), "staying put counted as a step");
      /* Squares off the course are stepped over, not painted into. */
      ED.grid.cell[5 * 8 + 0] = "";
      edStrokeTo(0, 5);
      assert(B.codeAt(ED.grid, 1, 5) === "b<", "the square before the hole was not laid");
      assert(!B.codeAt(ED.grid, 0, 5), "the stroke painted a belt into a hole in the course");
      /* All of it one step of history. */
      edKeep(ED.stroke.before);
      ED.stroke = null;
      assert(ED.undo.length === 1, "one stroke cost " + ED.undo.length + " steps");
      ED = keep;
    } },

    { name: "a flag on the workshop map is drawn with its number", run: function () {
      /* The renderer prints a flag's `n`; the workshop keeps flags as
         a bare list whose order is the race. Every flag on the map
         said "undefined" -- clipped to "eff" by the flag art -- until
         the view numbered them from their place in the list. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.isCourse = true;
      ED.grid.flags = [];
      ED.flagNum = 1;
      edPut("flag", 2, 2, {});
      edPut("flag", 5, 5, {});
      var C = edCourseView();
      var one = tileInner(C, 2, 2), two = tileInner(C, 5, 5);
      assert(one.indexOf("undefined") < 0 && two.indexOf("undefined") < 0, "a flag on the map is numbered undefined");
      assert(one.indexOf(">1<") >= 0, "the first flag is not drawn as 1: " + one.slice(0, 200));
      assert(two.indexOf(">2<") >= 0, "the second flag is not drawn as 2");
      /* Moving one in the order renumbers the map, not just the list. */
      edFlagShift(0, 1);
      C = edCourseView();
      assert(tileInner(C, 2, 2).indexOf(">2<") >= 0 && tileInner(C, 5, 5).indexOf(">1<") >= 0,
        "swapping two flags left the old numbers on the map");
      /* And the number never leaks into what is saved, which is a
         list of positions whose order is the race. */
      assert(edSnapshot().indexOf('"n"') < 0, "the flag number leaked into the snapshot");
      assert(JSON.stringify(edCourseEdit().flags) === "[[5,5],[2,2]]",
        "the course edit carries something other than positions: " + JSON.stringify(edCourseEdit().flags));
      ED = keep;
    } },

    { name: "the ghost follows the hand, not only the pointer", run: function () {
      /* The ghost is a picture of the thing in hand. Hanging it off
         the POINTER meant a ram turned north went on previewing
         itself facing east until the hand moved to another square --
         so the one control whose whole job is to say "this is what
         you are about to place" disagreed with the compass beside it. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.isCourse = true;
      ED.grid.flags = [];
      ED.hover = { c: 3, r: 3, edge: null };

      edPickQuiet("pusher");
      ED.dir = N;
      edRenderPanel();
      var north = ED.ghostHTML;
      assert(north, "a ram over a floor square previews nothing at all");
      edFace(S);
      assert(ED.ghostHTML && ED.ghostHTML !== north, "facing the ram south left the ghost facing north");
      edFace(N);
      assert(ED.ghostHTML === north, "facing it back again did not bring the same picture back");
      edSpin(1);
      assert(ED.ghostHTML !== north, "a quarter turn left the ghost as it was");

      /* A setting that is not a facing. The registers are stamped on
         the square the map draws, so they are on the ghost too. */
      ED.dir = N;
      edRenderPanel();
      var odd = ED.ghostHTML;
      ED.pushRegs = [2, 4];
      edRenderPanel();
      assert(ED.ghostHTML !== odd, "changing which registers the ram fires in left the ghost as it was");

      /* And picking something else up, which is the biggest change of
         all -- it does not go through edRenderPanel, so it says so
         itself. Compared with the ghost as it stands THIS INSTANT:
         against the older one the assertion passes whether or not the
         pick repainted anything, because the registers already moved
         it on. */
      var ram = ED.ghostHTML;
      edPickQuiet("burner");
      assert(ED.ghostHTML && ED.ghostHTML !== ram, "picking up the jet left the ram on the pointer");

      /* The edge under the pointer still decides a wall, and the flag
         still carries the number in hand: neither was broken, and
         both go through the same recompute now. */
      edPickQuiet("wall");
      ED.hover = { c: 3, r: 3, edge: N };
      edRenderPanel();
      var top = ED.ghostHTML;
      ED.hover = { c: 3, r: 3, edge: E };
      edRenderPanel();
      assert(ED.ghostHTML !== top, "the wall ghost is the same picture on two different edges");

      edPickQuiet("flag");
      ED.hover = { c: 3, r: 3, edge: null };
      ED.flagNum = 1;
      edRenderPanel();
      assert(ED.ghostHTML && ED.ghostHTML.indexOf(">1<") >= 0, "the flag ghost is not numbered 1");
      ED.grid.flags = [{ c: 6, r: 6 }];
      ED.flagNum = 2;
      edRenderPanel();
      assert(ED.ghostHTML.indexOf(">2<") >= 0, "the number in hand did not reach the flag ghost");

      /* Nothing is previewed where a click would pick something UP --
         the square already shows what would come off it -- and the
         hand and the select tool preview nothing anywhere. */
      ED.grid.flags.push({ c: 3, r: 3 });
      edRenderPanel();
      assert(ED.ghostHTML === null, "a flag was previewed on top of a flag");
      ED.grid.flags.pop();
      edPickQuiet("sel");
      assert(ED.ghostHTML === null, "the select tool put something on the pointer");
      edPickQuiet("pan");
      assert(ED.ghostHTML === null, "the hand put something on the pointer");
      /* And with the pointer off the map there is nowhere to put one. */
      edPickQuiet("pusher");
      ED.hover = null;
      edRenderPanel();
      assert(ED.ghostHTML === null, "a ghost survived the pointer leaving the map");
      ED = keep;
    } },

    { name: "the rail's icon says what the tool lays, not which registers it fires in", run: function () {
      /* A ram and a jet stamp the registers they fire in across the
         square. At rail size that is three digits over a 20px
         picture: unreadable, and answering a question the rail was
         not asked. The rail says WHAT you are about to put down. */
      var keep = ED;
      ED = edState(edNew(4, 4), "bench");
      ED.grid.flags = [];
      ED.pushRegs = [1, 3, 5];
      ED.burnRegs = [2, 4];
      ED.dir = N;
      var css = CSS, kinds = ["pusher", "burner"], i;
      for (i = 0; i < kinds.length; i++) {
        var btn = edRailButton(edToolByKey(kinds[i]));
        /* The badge IS in the markup -- the rail draws the square with
           the board's own renderer, and the board stamps the registers
           on it. Asserting that first is what stops the rule below
           from being a rule that hides something nobody draws. */
        assert(btn.indexOf("pr-pushreg") >= 0,
          "the rail's " + kinds[i] + " draws no register badge, so hiding one proves nothing");
        assert(/<button class="pr-ed-item[ "]/.test(btn),
          "the rail's " + kinds[i] + " does not wear the class the rule is scoped to");
      }
      assert(/\.pr-ed-item \.pr-pushreg\{display:none\}/.test(css),
        "nothing hides the register badge on the rail's icons");

      /* Scoped to the RAIL. The ghost and the big tile are pictures of
         the square as the map draws it, registers and all, so a rule
         that reached either of them would be taking the badge off the
         board rather than off an icon. */
      var hides = css.match(/[^{};]*\.pr-pushreg\{display:none\}/g) || [];
      assert(hides.length, "the sweep found no rule hiding the badge, so this proves nothing");
      for (i = 0; i < hides.length; i++) {
        assert(!/pr-ed-ghost|pr-ed-big|pr-thumb-grid|^\s*\.pr-pushreg/.test(hides[i]),
          "a rule hides the registers beyond the rail: " + hides[i]);
      }
      /* And the square drawn large still carries them, which is the
         same fact from the other side. */
      ED.grid.pushers.push({ c: 1, r: 1, d: N, regs: [1, 3, 5] });
      B.setWall(ED.grid, 1, 1, S, true);
      var big = edBigTile({ c: 1, r: 1, part: "tile" });
      assert(big.indexOf("pr-ed-big") >= 0 && big.indexOf("pr-pushreg") >= 0,
        "the square drawn large lost the registers the map shows");
      ED = keep;
    } },

    { name: "the game asks for a colour before it asks anything else", run: function () {
      /* The colour used to be picked in the set-up wizard, three
         screens before there was a board to see it on. It is the first
         thing the game itself asks now, and the bays follow straight
         after -- pick a robot, draw for position, take a bay. */
      newGame(23, { course: "provingRun", players: 6 });
      assert(G.phase === "draft" && G.step === "livery",
        "a new game opens at " + G.phase + "." + G.step + " rather than at the colours");
      advance();
      assert(G.phase === "draft" && G.step === "livery", "the machine ran past the colour pick");
      assert(G.actor === 0, "the colour is being asked of seat " + G.actor);
      assert(!G.draft.order.length, "position was drawn for before the colours were settled");

      /* Taking one is a SWAP: whoever held it takes the picker's, so
         the eight stay distinct however many seats choose. */
      var was = G.players[0].livery, holder = null, i;
      var want = (was + 3) % LIVERIES.length;
      for (i = 0; i < G.players.length; i++) if (G.players[i].livery === want) holder = G.players[i];
      assert(holder && holder !== G.players[0], "nothing held the wanted colour, so this proves no swap");
      onLiveryPick(want);
      assert(G.players[0].livery === want, "seat 0 did not get the colour it asked for");
      assert(G.players[0].name === LIVERIES[want].name, "the name did not follow the colour");
      assert(holder.livery === was, "the robot that held it was not handed seat 0's");
      assert(holder.name === LIVERIES[was].name, "the swapped robot kept the wrong name");
      var seen = {};
      for (i = 0; i < G.players.length; i++) {
        assert(!seen[G.players[i].livery], "two robots share a colour after the pick");
        seen[G.players[i].livery] = 1;
      }
      /* And the placement begins the moment it is answered. */
      assert(G.step === "pick", "after the colour the game is at " + G.step + " rather than picking bays");
      assert(G.draft.order.length === 6, "nobody drew for position");

      /* TWO SEATS, TWO PICKS, in seat order -- and the second may not
         take what the first chose. */
      newGame(23, { course: "provingRun", players: 6, humans: 2 });
      advance();
      assert(G.actor === 0, "with two seats the first to be asked is " + G.actor);
      onLiveryPick(1);
      assert(G.step === "livery" && G.actor === 1, "the second seat was not asked");
      assert(liveryLocked(1), "the colour seat 0 chose is not locked");
      assert(!takeLivery(G.players[1], 1), "the second seat took the first seat's colour");
      assert(G.players[0].livery === 1, "and took it away from them");
      onLiveryPick(4);
      assert(G.players[1].livery === 4 && G.players[0].livery === 1, "the two seats did not keep their picks");
      assert(G.step === "pick", "two seats settled and the bays did not start");

      /* Nobody to ask is not a question. Every seat botted goes
         straight through, which is what the sim relies on. */
      var wasAuto = UI.autoHuman;
      UI.autoHuman = true;
      newGame(23, { course: "provingRun", players: 4 });
      assert(!nextLiveryPicker(), "a table of bots was still going to be asked");
      advance();
      assert(G.phase !== "draft" || G.step !== "livery", "a table of bots stopped at the colour pick");
      UI.autoHuman = wasAuto;
    } },

    { name: "the set-up is two steps, and the last one opens the workshop", run: function () {
      /* It was five. A "Flags" screen sat between the boards and the
         race whose only control was a button to the workshop; a
         "Robot" screen asked for a colour with no board to see it on;
         a "Bays" entry named something that was never in the modal. */
      var ids = WIZARD.map(function (w) { return w.id; });
      assert(ids.join(",") === "rules,boards", "the rail is " + ids.join(","));
      assert(wizLast() === WIZARD.length - 1, "the last step is not the last entry in the rail");
      assert(!WIZARD[wizLast()].onBoard, "the last step is one that never renders");
      var i;
      for (i = 0; i < WIZARD.length; i++) {
        assert(WIZARD[i].label && WIZARD[i].title, WIZARD[i].id + " has no label or no title");
      }
      /* Only the course can block, and it blocks on the layout. */
      assert(wizBlocker(0) === null, "the settings step can refuse to be left");
      assert(typeof wizBlocker(1) === "string" || wizBlocker(1) === null,
        "the course step's blocker is neither a reason nor nothing");
      /* Every function the removed screens were made of is gone with
         them, rather than left behind unreachable. */
      assert(typeof flagsBody === "undefined" && typeof robotBody === "undefined",
        "a screen the rail no longer reaches is still in the file");
    } },

    { name: "the library keeps a course and gives it back", run: function () {
      /* A course is an hour of work and there was room for exactly
         one of them: the layout key holds what you are working on, so
         starting a second course threw the first away. */
      var shim = null, glob = null;
      if (typeof localStorage === "undefined") {
        shim = {};
        glob = typeof globalThis !== "undefined" ? globalThis : root;
        glob.localStorage = {
          getItem: function (k) { return shim[k] === undefined ? null : shim[k]; },
          setItem: function (k, v) { shim[k] = String(v); },
          removeItem: function (k) { delete shim[k]; }
        };
      }
      var keepLayout = UI.layout, keepLib = null;
      try { keepLib = localStorage.getItem(LIBRARY_KEY); } catch (e) {}
      try {
        localStorage.removeItem(LIBRARY_KEY);
        assert(libLoad().length === 0, "an empty library is not empty");

        var lay = { v: 3, dockCol: 0,
          cells: [null, null, null, null, null, null, { id: "island", rot: 1 }, null, null] };
        var g = B.buildCourse(B.composeCourse(B.withFlags(lay, []), 0));
        lay.edit = { w: g.w, h: g.h, pic: B.gridToPic(g), voids: true, name: "Mine",
                     flags: [[4, 4], [7, 9]], lasers: [], pushers: [], burners: [], timers: [] };

        var row = libPut("  The  Long   Way  ", lay);
        assert(row, "saving to the library reported nothing");
        assert(row.name === "The Long Way", "the name was stored as \"" + row.name + "\"");
        var items = libLoad();
        assert(items.length === 1, "one save put " + items.length + " courses on the shelf");
        assert(items[0].layout.cells[6].id === "island" && items[0].layout.cells[6].rot === 1,
          "the boards and their rotations did not survive the round trip");
        assert(items[0].layout.edit && items[0].layout.edit.flags.length === 2,
          "the flags did not survive the round trip");

        /* SAVING THE SAME NAME TWICE IS ONE COURSE. A library that
           answers "save" by growing is one nobody keeps using. */
        lay.edit.flags = [[4, 4]];
        libPut("the long way", lay);
        items = libLoad();
        assert(items.length === 1, "saving the same name again made " + items.length + " courses");
        assert(items[0].layout.edit.flags.length === 1, "the second save did not replace the first");
        assert(items[0].name === "the long way", "the name was not taken from the second save");

        /* Taking one off the shelf makes it what is on the table, and
           editing it there must not rewrite the saved one. */
        UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, null, null, null] };
        assert(libOpen(items[0].id), "opening a saved course failed");
        assert(UI.layout.cells[6] && UI.layout.cells[6].id === "island", "the opened course is not on the table");
        UI.layout.edit.flags.push([1, 1]);
        assert(libLoad()[0].layout.edit.flags.length === 1,
          "editing the course on the table rewrote the saved one");
        assert(!libOpen("nosuchid"), "a course that is not there opened anyway");

        /* A stored course whose picture no longer reads is dropped
           from the shelf rather than handed to the workshop, where it
           would come apart on the first render. */
        var bad = libLoad();
        bad[0].layout.cells[6] = { id: "noSuchBoard", rot: 0 };
        libWrite(bad);
        assert(libLoad().length === 0, "a course naming a board that does not exist stayed on the shelf");

        libPut("Keeper", lay);
        libPut("Spare", lay);
        assert(libLoad().length === 2, "two names made one entry");
        libDrop(libLoad()[0].id);
        assert(libLoad().length === 1, "deleting one took " + (2 - libLoad().length) + " off");
        libDrop("nosuchid");
        assert(libLoad().length === 1, "deleting something that is not there took a course with it");
      } finally {
        try {
          if (keepLib === null) localStorage.removeItem(LIBRARY_KEY);
          else localStorage.setItem(LIBRARY_KEY, keepLib);
        } catch (e) {}
        UI.layout = keepLayout;
        if (shim) { try { delete glob.localStorage; } catch (e) { glob.localStorage = undefined; } }
      }
    } },

    { name: "the course workshop offers three ways out and no fourth", run: function () {
      /* Throw it away, keep it, or race it. "Save and go on" used to
         mean the second and went back to a screen that could only send
         you here again. */
      var keep = ED, keepEls = UI.els;
      UI.els = null;                                  // the bar builds as a string
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      edOpenCourse({ boards: [], dock: null });
      ED.grid.name = "Bench course";

      var bar = edTopBar();
      assert(bar.indexOf('data-act="edcdrop"') >= 0, "no way out without saving");
      assert(bar.indexOf('data-act="edclib"') >= 0, "no way to put it on the shelf");
      assert(bar.indexOf('data-act="edcplay"') >= 0, "no way to race it");
      assert(bar.indexOf('data-act="edcsave"') < 0, "the old save-and-go-on is still on the bar");
      /* With no flags the race is refused on the button rather than
         after it. */
      assert(/data-act="edcplay"[^>]*disabled/.test(bar),
        "a course with no flags offers to race anyway");
      ED.grid.flags.push({ c: 2, r: 2 });
      bar = edTopBar();
      assert(!/data-act="edcplay"[^>]*disabled/.test(bar), "a course with a flag on it still cannot race");

      /* A BOARD is not a course and has no shelf to go on. */
      ED.isCourse = false;
      ED.fromSetup = true;
      bar = edTopBar();
      assert(bar.indexOf('data-act="edclib"') < 0, "a board offers to be saved to the course library");
      ED = keep;
      UI.els = keepEls;
    } },

    { name: "opening the workshop twice does not bind it twice", run: function () {
      /* The bug this guards, watched three times over: the third visit
         to the workshop deleted THREE flags for one click on the cross
         and undid three steps for one press of undo. edMount clears
         the host with innerHTML, which leaves the listeners on the
         host itself in place, so every open bound another set.

         The same bug in the same shape as the one mount() was caught
         with. No DOM here, so the guard is what is asserted: wiring
         one host twice must wire it once. */
      var calls = 0, docCalls = 0;
      var fakeHost = { addEventListener: function () { calls++; }, classList: { remove: function () {} } };
      var fakeDoc = { addEventListener: function () { docCalls++; } };
      edWire(fakeHost, fakeDoc);
      var first = calls, firstDoc = docCalls;
      assert(first > 0 && firstDoc > 0,
        "the first call must wire something, wired " + first + " and " + firstDoc);
      edWire(fakeHost, fakeDoc);
      assert(calls === first, "the second call wired " + (calls - first) + " more on the host");
      assert(docCalls === firstDoc, "the second call wired " + (docCalls - firstDoc) + " more on the document");
      assert(fakeHost.__prEdWired === true, "and the host is marked so a third call is cheap too");
      edWire(fakeHost, fakeDoc);
      assert(calls === first && docCalls === firstDoc, "nor a third");

      /* And because they are never taken off, they fire over the GAME
         once the workshop has closed -- where nothing they carry means
         anything and half of it would throw. */
      var keep = ED;
      ED = null;
      edDispatch({ dataset: { act: "edundo" } });
      edDispatch({ dataset: { act: "edpick", k: "b" } });
      edDispatch({ dataset: { act: "edcplay" } });
      ED = keep;
    } },

    { name: "the course screen has one door into the workshop, not two", run: function () {
      /* The screen carried its own "Open in the workshop" from when
         the step after it was a flags screen and the workshop was a
         detour off to the side. It is the only way on now -- the Next
         button at the foot of the screen goes there -- so a button
         saying the same thing is two doors into one room. */
      var keepLayout = UI.layout, keepHeld = UI.heldBoard, keepAt = UI.heldAt;
      UI.layout = { v: 3, dockCol: 0,
        cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      UI.heldBoard = null;
      UI.heldAt = null;
      try {
        var body = layoutBody();
        assert(body && body.length > 100, "the course screen draws nothing to look at");
        assert(body.indexOf("editcourse") < 0, "the course screen still has a workshop button of its own");
        assert(!/workshop\\u2026|workshop&#8230;|workshop…/.test(body),
          "something on the course screen still offers to open the workshop");
        /* The things it IS for are all still on it: the shipped
           courses, the shelf, and the assembler. */
        assert(body.indexOf("lcourse") >= 0, "the printed courses are gone from the course screen");
        assert(body.indexOf("Your library") >= 0, "the library is gone from the course screen");
        assert(body.indexOf("lundo") >= 0 && body.indexOf("lempty") >= 0,
          "the assembler lost undo or clear");

        /* And no dispatch is left answering to a button nobody draws. */
        var before = JSON.stringify(UI.layout);
        dispatchAct({ dataset: { act: "editcourse" } });
        assert(JSON.stringify(UI.layout) === before,
          "a dead action still does something when something sends it");
      } finally {
        UI.layout = keepLayout;
        UI.heldBoard = keepHeld;
        UI.heldAt = keepAt;
      }
    } },

    { name: "every shipped course puts its flags on squares a flag may go on", run: function () {
      /* The rules, as given: a flag goes on a CLEAR square, never in
         the starting block, never in the very corner, and within
         Northrup's twelve of the flag before it. Nothing checked them,
         and three shipped courses were breaking them -- Board H had a
         flag standing on a CONVEYOR, which is not somewhere to stand
         at all because the belt carries the robot off it at the end of
         every register; Cross Town had one on a repair site and a
         third flag sixteen columns from the second. */
      var ids = Object.keys(B.COURSES).filter(function (k) { return k.charAt(0) !== "_"; });
      assert(ids.length > 8, "the sweep found " + ids.length + " courses, so it proves little");
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i], C = B.COURSES[id], g = B.buildCourse(id), dk = C.dock, f;
        assert(C.flags.length >= 2, id + " has " + C.flags.length + " flag(s)");
        for (f = 0; f < C.flags.length; f++) {
          var c = C.flags[f][0], r = C.flags[f][1], where = id + " flag " + (f + 1) + " at (" + c + "," + r + ")";
          var el = B.elemOf(B.codeAt(g, c, r));
          assert(el && el.name === "floor", where + " is on a " + (el ? el.name : "hole in the course"));
          assert(!dk || !(c >= dk.at[0] && c <= dk.at[0] + 11 && r >= dk.at[1] && r <= dk.at[1] + 3),
            where + " is in the starting block, so it is touched before the race begins");
          var k, mounted = false;
          for (k = 0; k < g.lasers.length; k++) if (g.lasers[k].c === c && g.lasers[k].r === r) mounted = true;
          for (k = 0; k < g.pushers.length; k++) if (g.pushers[k].c === c && g.pushers[k].r === r) mounted = true;
          for (k = 0; k < g.burners.length; k++) if (g.burners[k].c === c && g.burners[k].r === r) mounted = true;
          assert(!mounted, where + " has a wall-mounted trap standing on it");
          var cc = c % 12, rr = r % 12;
          assert(!((cc === 0 || cc === 11) && (rr === 0 || rr === 11)), where + " is in the very corner of a board");
          if (f) {
            var p = C.flags[f - 1];
            assert(Math.abs(c - p[0]) <= 12 && Math.abs(r - p[1]) <= 12,
              where + " is outside Northrup's twelve from flag " + f + " at (" + p[0] + "," + p[1] + ")");
          }
          for (k = 0; k < f; k++) {
            assert(!(C.flags[k][0] === c && C.flags[k][1] === r), where + " is where flag " + (k + 1) + " already is");
          }
        }
      }
    } },

    { name: "the course menu is two shelves: one board each, or several", run: function () {
      /* The menu used to group courses by which BOX the first board
         came out of, which told you nothing you could act on -- a
         quick game on an Exchange board and a four-board track
         starting with one sat under the same heading and read as the
         same kind of thing. */
      var ids = Object.keys(B.COURSES).filter(function (k) { return k.charAt(0) !== "_"; });
      var quick = 0, track = 0, byBoard = {}, i;
      for (i = 0; i < ids.length; i++) {
        var id = ids[i], C = B.COURSES[id], kind = C.kind;
        assert(kind === "quick" || kind === "track", id + ' is of kind "' + kind + '"');
        assert(C.name && C.blurb, id + " has no name or no blurb");
        /* A course the assembler cannot express drops off the menu
           silently, which is how a course comes to ship and never be
           seen. */
        assert(B.layoutFromCourse(id), id + " is not a shape the course assembler can hold");
        if (kind === "quick") {
          quick++;
          assert(C.boards.length === 1, id + " is a quick game on " + C.boards.length + " boards");
          byBoard[C.boards[0].id] = (byBoard[C.boards[0].id] || 0) + 1;
        } else {
          track++;
          assert(C.boards.length >= 2, id + " is a race track on one board");
          /* WHERE THE FLAGS GO IS THE TRACK'S OWN BUSINESS. A rule
             saying one per board was asserted here for a while. It is
             not a rule -- tracks are copied from the manuals or built
             by hand, and both put flags where the track puts them.
             What a flag may sit ON is checked; how many land on each
             board is not. */
        }
      }
      assert(quick >= 9 && track >= 3, "the menu offers " + quick + " quick games and " + track + " tracks");

      /* EVERY PLAYABLE BOARD HAS A QUICK GAME. A board nobody can
         reach without laying out a course by hand is a board that
         might as well not be transcribed. */
      for (var bid in B.BOARD_SPECS) {
        var sp = B.BOARD_SPECS[bid];
        if (sp.w !== 12 || sp.h !== 12) continue;              // the block is not a board to race
        /* A board still being transcribed is deliberately unreachable:
           a quick game on a map nobody has checked is a race on a
           plausible-looking wrong board, which is the one failure this
           project cannot survive. */
        if (sp.unverified) {
          assert(!byBoard[bid], bid + " is unverified and is being offered as a game anyway");
          continue;
        }
        assert(byBoard[bid], bid + " has no quick game, so nothing reaches it from the menu");
      }
    } },

    { name: "every length the assembler writes into a style carries its unit", run: function () {
      /* A bare number is not a length: the browser drops the whole
         declaration and says nothing. The starting block's "start
         here" button wrote height:32, lost it, sized itself to its own
         wrapped label at fifty pixels instead, and hung out of the
         stage and over the paragraph underneath.

         Swept over the whole of the stage's markup rather than that
         one button, because every box on it is positioned by hand and
         any of them could lose a unit the same way. */
      var keepL = UI.layout, keepH = UI.heldBoard, keepA = UI.heldAt;
      UI.heldBoard = null;
      UI.heldAt = null;
      try {
        /* Boards under all three columns, so the block is offered a
           choice and the buttons that carry the offer are drawn at
           all -- with one board down there is nowhere else to put it
           and this swept markup that did not contain the bug. */
        UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null,
          { id: "provingGround", rot: 0 }, { id: "island", rot: 0 }, { id: "cross", rot: 0 }] };
        var html = layoutStage();
        assert(html.indexOf("pr-lay-dockslot") >= 0,
          "the sweep found no start-here buttons, so it proves nothing about them");
        assert(html.indexOf("pr-lay-dock\"") >= 0 && html.indexOf("pr-lay-slot") >= 0,
          "the sweep is missing the block or the empty slots");

        var styles = html.match(/style="[^"]*"/g) || [];
        assert(styles.length >= 6, "only " + styles.length + " positioned boxes on the stage");
        for (var i = 0; i < styles.length; i++) {
          var bad = styles[i].match(/(left|top|right|bottom|width|height)\s*:\s*-?\d+(?:\.\d+)?(?![a-z%.\d])/g);
          assert(!bad, "a length with no unit, so the browser drops it: " + bad + " in " + styles[i]);
        }

        /* And the block's row is inside the stage it is drawn on: the
           stage's own height has to allow for it, or a correctly
           sized button still hangs off the bottom. */
        var g = stageGeom();
        assert(g.h >= g.dockTop() + 4 * g.px,
          "the stage is " + g.h + " tall and the block ends at " + (g.dockTop() + 4 * g.px));
      } finally {
        UI.layout = keepL;
        UI.heldBoard = keepH;
        UI.heldAt = keepA;
      }
    } },

    { name: "a label in a fixed box outranks the button style and cannot spill out of it", run: function () {
      /* Two faults, one box. The starting block's "start here" button
         is thirty-two pixels tall by arithmetic, and the label inside
         it stood forty and hung over the paragraph underneath.

         The first fault is specificity: `.pr-root button` is a class
         AND an element, so it beats any bare class in this sheet. The
         font-size, padding and line-height written for this button
         were simply thrown away -- which is why the rule that lost
         them had to shout !important at the two properties somebody
         had already noticed going missing.

         The second is what it lost: the root sets `font:13px/1.5`,
         which computes to a line-height of about twenty PIXELS and
         inherits as that absolute length, so an eight-pixel label got
         twenty-pixel lines. A fixed box with text in it has to say
         what happens to the text. */
      var css = CSS;
      /* The collision is real, or the scoping below guards nothing. */
      var base = css.match(/\.pr-root button\{([^}]*)\}/);
      assert(base, "there is no base button rule, so nothing here is being outranked");
      assert(/font\s*:/.test(base[1]) && /padding\s*:/.test(base[1]),
        "the base button rule sets neither font nor padding: " + base[1]);

      /* EVERY rule that reaches this button, not the first one found:
         the class is named twice in the sheet, and the one that
         matters is the one carrying the box's own type. */
      var rules = css.match(/[^{}]*\.pr-lay-dockslot[^{}]*\{[^}]*\}/g) || [];
      assert(rules.length, "the start-here button has no rule of its own");
      var typed = null, i;
      for (i = 0; i < rules.length; i++) {
        var sel = rules[i].slice(0, rules[i].indexOf("{"));
        var body = rules[i].slice(rules[i].indexOf("{") + 1, -1);
        /* A rule setting something the base button rule also sets is
           in a fight with it, and has to win. One that sets only
           things the base leaves alone -- position, say -- is not. */
        if (/font|padding|min-height|line-height/.test(body)) {
          /* SCOPING, not !important. A rule can shout at one property
             and still quietly lose the other four -- which is exactly
             what the rule this replaces did, and why the box was the
             wrong size while two of its declarations looked defended. */
          assert(sel.indexOf(".pr-root") >= 0,
            'scoped as "' + sel + '", which a class and an element outrank, so it is thrown away');
        }
        if (/line-height/.test(body)) typed = body;
      }
      assert(typed, "no rule gives the label a line-height, so it inherits the root's twenty " +
        "pixels and two lines will not fit the box");
      assert(/overflow\s*:\s*hidden/.test(typed),
        "nothing clips the label, so anything it ever says can reach outside the box");
      assert(/align-items\s*:\s*center/.test(typed) && /display\s*:\s*flex/.test(typed),
        "the label is not centred in the box it is given");
    } },

    { name: "the board takes its turn in the printed order, presses between the gears and the lasers", run: function () {
      /* The order is printed, numbered, in the factory-floor reference:
         express belts, conveyors, pushers, gears, PRESSES, lasers,
         burners, then checkpoints. Nothing checked it, and the press
         was the step most likely to be put in the wrong place -- it
         was the last one added, and where it sits decides whether a
         robot carried onto a crusher by a belt is crushed this
         register or next.

         Read off the machine itself, by walking the chain each step
         hands to, rather than from a list written beside it. */
      var want = ["express", "belts", "pushers", "gears", "presses", "lasers", "burners", "touch"];
      var src = {}, k;
      for (k in STEP.exec) src[k] = STEP.exec[k].toString();
      for (var i = 0; i < want.length; i++) {
        assert(STEP.exec[want[i]], "there is no exec step called " + want[i]);
        if (i + 1 < want.length) {
          assert(src[want[i]].indexOf('"' + want[i + 1] + '"') >= 0,
            want[i] + " does not hand on to " + want[i + 1] + ", so the board's order is not the printed one");
        }
      }
      /* And the step before them all is the robots moving. */
      assert(src.move.indexOf('"express"') >= 0, "movement does not hand on to the express belts");

      /* THE INTERACTION THE ORDER EXISTS FOR: a belt carries a robot
         onto a crusher, and the crusher comes down the same register.
         Every press on Cannery Row stands on a conveyor, so this is
         that board's whole character. */
      var g = bench([["b>", ".."]], [], [], [{ c: 1, r: 0, regs: [1] }]);
      benchGame(g, [{ c: 0, r: 0 }]);
      var p = G.players[0];
      G.register = 0;
      beltPass(1);
      assert(p.c === 1, "the belt did not carry the robot onto the crusher's square");
      pressPass();
      assert(!p.alive, "the belt delivered it under an active crusher and it survived");
    } },

    { name: "a crusher destroys, and only where and when it is printed", run: function () {
      /* Destroyed, not damaged: the glossary lists a crusher beside a
         pit as one of the three ways a robot is destroyed outright. */
      var g = bench([["..", ".."]], [], [], [{ c: 0, r: 0, regs: [2, 4] }]);
      benchGame(g, [{ c: 0, r: 0 }, { c: 1, r: 0 }]);
      var under = G.players[0], beside = G.players[1];
      var lives = under.lives;
      G.register = 0; pressPass();
      assert(under.alive, "register 1 is not in {2,4}");
      G.register = 1; pressPass();
      assert(!under.alive, "register 2 is printed on it");
      assert(under.damage === 0, "a crusher destroys rather than damaging, so no damage should be taken");
      assert(under.lives === lives - 1, "being crushed costs a life");
      assert(beside.alive, "the robot on the next square was crushed by a press that is not there");
    } },

    { name: "the workshop can put a crusher down, move it, and say when it may not", run: function () {
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.pressRegs = [1, 5];
      edSetCell(3, 3, "b>");
      edSetCell(5, 5, "o.");

      /* On a conveyor, which is the case it exists for. */
      assert(edPut("press", 3, 3, {}), "a crusher would not go down on a conveyor");
      assert(B.timerAt(ED.grid, 3, 3), "the crusher is not on the square");
      assert(B.beltSpeed(B.codeAt(ED.grid, 3, 3)) === 1, "putting a crusher down took the conveyor with it");
      assert(B.timerAt(ED.grid, 3, 3).regs.join() === "1,5", "it did not take the registers in hand");
      /* Not in a pit: there is no floor to flatten anything against. */
      assert(!edPut("press", 5, 5, {}), "a crusher went into a pit");
      /* Clicking it again picks it up. */
      assert(edPut("press", 3, 3, {}), "clicking a crusher did not take it off");
      assert(!B.timerAt(ED.grid, 3, 3), "the crusher is still there");

      /* It is a part of the square, with its registers editable, and it
         is the ONLY trap that has no facing. */
      edPut("press", 3, 3, {});
      var parts = edParts(3, 3), press = null, i;
      for (i = 0; i < parts.length; i++) if (parts[i].kind === "press") press = parts[i];
      assert(press, "the square does not list the crusher standing on it: " +
        parts.map(function (q) { return q.id; }).join(" "));
      assert(!press.dir, "a crusher is being offered a facing, and it faces nowhere");
      assert(edPartObj(press) === B.timerAt(ED.grid, 3, 3), "the panel is pointing at the wrong crusher");
      ED.sel = { c: 3, r: 3, part: press.id };
      edSelEdit("reg", 3, press.id);
      assert(B.timerAt(ED.grid, 3, 3).regs.join() === "1,3,5", "adding register 3 did not take");

      /* Carried to another square, keeping its registers. */
      assert(edMovePart(edParts(3, 3).filter(function (q) { return q.kind === "press"; })[0], 6, 1),
        "the crusher would not move");
      assert(!B.timerAt(ED.grid, 3, 3) && B.timerAt(ED.grid, 6, 1), "it did not land where it was dropped");
      assert(B.timerAt(ED.grid, 6, 1).regs.join() === "1,3,5", "it lost its registers on the way");
      assert(B.beltSpeed(B.codeAt(ED.grid, 3, 3)) === 1, "moving it away took the conveyor with it");

      /* The rail draws one, and it is the tool with no compass. */
      ED.pick = "press";
      var view = edToolView(edToolByKey("press"), null);
      assert(view && view.timers.length === 1, "the rail's crusher draws no crusher");
      var t = edToolByKey("press");
      assert(!t.dir, "the crusher tool carries a facing");
      assert(t.regs === "press", "the crusher tool has no register set of its own");
      var set = edToolSettings(t);
      assert(set.indexOf("edpressreg") >= 0, "its registers cannot be set");
      assert(set.indexOf("edcompass") < 0 && set.indexOf("pr-ed-compass") < 0,
        "the crusher is offered a compass");
      ED = keep;
    } },

    { name: "the reference photo panel does not shut under your hand", run: function () {
      /* It was a <details>, and the inspector is rebuilt on every
         render -- so the first touch of Fade, Size or Nudge redrew the
         panel, put a fresh <details> in its place, and the thing shut
         mid-drag. Open or shut is state now, and the three controls
         that only move the photograph do not redraw the panel at all. */
      var keep = ED;
      ED = edState(edNew(8, 8), "bench");
      ED.grid.flags = [];
      ED.underlay = "x";
      ED.refOpen = true;
      var open = edRefPanel();
      assert(open.indexOf("<details") < 0, "still a <details>, which the next render replaces");
      assert(open.indexOf("edop") >= 0 && open.indexOf("edscale") >= 0 && open.indexOf("ednudge") >= 0,
        "the open panel is missing fade, size or nudge");
      ED.refOpen = false;
      var shut = edRefPanel();
      assert(shut.indexOf("edop") < 0, "the shut panel still draws its controls");
      assert(shut.indexOf("edreftoggle") >= 0, "the shut panel cannot be opened again");
      /* And the open state survives a redraw of the inspector, which is
         the whole point. */
      ED.refOpen = true;
      assert(edRefPanel().indexOf("edop") >= 0, "the panel did not stay open across a rebuild");

      /* The three controls move the photograph and nothing else: none
         of them goes through the render that rebuilds them. */
      /* Bounded on purpose. An unbounded match runs past this branch
         into the next one and finds ITS call, which is how the first
         version of this passed against a fade that still redrew
         everything. */
      var src = edDispatch.toString();
      assert(/"edop"[\s\S]{0,80}edUnderlayPaint/.test(src),
        "fade still redraws the whole editor, which is what pulled the slider out from under the pointer");
      assert(/"edscale"[\s\S]{0,80}edUnderlayPaint/.test(src), "size still redraws the whole editor");
      assert(/"ednudge"[\s\S]{0,200}edUnderlayPaint/.test(src), "nudge still redraws the whole editor");

      /* AND WITH NO PHOTOGRAPH LOADED AT ALL, which is most people the
         first time they touch these: there is nothing to move, so
         nothing happens. This fell through to the same redraw and the
         panel shut anyway. */
      ED.underlay = null;
      assert(edUnderlayPaint() === "none", "with no photograph the controls still redraw the editor");
      ED.underlay = "x";
      assert(edUnderlayPaint() !== "none", "with a photograph loaded the controls do nothing at all");
      ED = keep;
    } },

    { name: "the workshop can step back, and not over nothing", run: function () {
      /* Tracing a board is an hour of small mistakes, and before this
         the only way back from one was to draw over it -- which works
         for a tile and does not work at all for a wall you did not
         mean to toggle or a flag you did not mean to renumber.

         Driven through ED directly rather than through the DOM: the
         snapshot and the restore are what have to be right, and both
         are the editor's own serialisation. */
      var keep = ED;
      ED = edState(B.parsePic("provingGround", B.BOARD_SPECS.provingGround), "provingGround");
      ED.grid.flags = [];
      var was = edSnapshot();

      /* A tile. */
      var floor = null, fc, fr;
      for (fr = 0; fr < ED.grid.h && !floor; fr++) {
        for (fc = 0; fc < ED.grid.w && !floor; fc++) {
          var fe = B.elemOf(B.codeAt(ED.grid, fc, fr));
          if (fe && fe.name === "floor") floor = { c: fc, r: fr };
        }
      }
      assert(floor, "no floor square on this board, so this proves nothing");
      var before = edMark();
      edSetCell(floor.c, floor.r, "o.");
      edKeep(before);
      assert(ED.undo.length === 1, "a tile edit left " + ED.undo.length + " steps of history");
      assert(B.isPit(B.codeAt(ED.grid, floor.c, floor.r)), "fixture: the pit did not go down");

      /* A wall, which drawing over cannot undo at all. */
      before = edMark();
      B.setWall(ED.grid, 5, 5, N, !B.wallAt(ED.grid, 5, 5, N));
      edKeep(before);
      assert(ED.undo.length === 2, "a wall edit was not recorded");
      var wall = B.wallAt(ED.grid, 5, 5, N);

      /* A click that changes nothing costs no history. */
      before = edMark();
      edSetCell(floor.c, floor.r, "o.");
      edKeep(before);
      assert(ED.undo.length === 2,
        "painting a square with what was already on it cost a step: " + ED.undo.length);

      /* Back, one at a time, and the wall comes with it. */
      edRestoreSnap(ED.undo.pop());
      assert(B.wallAt(ED.grid, 5, 5, N) !== wall, "the wall did not come back");
      assert(B.isPit(B.codeAt(ED.grid, floor.c, floor.r)), "undoing the wall also undid the tile");
      edRestoreSnap(ED.undo.pop());
      assert(!B.isPit(B.codeAt(ED.grid, floor.c, floor.r)), "the tile did not come back");
      assert(edSnapshot() === was, "two steps back is not where it started");
      assert(!ED.undo.length, "the stack has steps left after unwinding it");

      /* THE SPARSE LAYERS MAKE THE TRIP. Twice in this repo a round
         trip has carried the picture perfectly and dropped the rams,
         which is the silent half of that failure. */
      ED.grid.pushers = [{ c: 2, r: 2, d: N, regs: [1, 3, 5] }];
      ED.grid.lasers = [{ c: 4, r: 0, d: 2, n: 2 }];
      ED.grid.burners = [{ c: 7, r: 7, d: 1, regs: [2, 4], len: 2 }];
      ED.grid.flags = [{ c: 6, r: 6 }, { c: 9, r: 1 }];
      var full = edSnapshot();
      before = edMark();
      ED.grid.pushers = [];
      ED.grid.flags = [];
      edKeep(before);
      edRestoreSnap(ED.undo.pop());
      assert(ED.grid.pushers.length === 1 && ED.grid.pushers[0].c === 2,
        "the rams did not survive the round trip");
      assert(ED.grid.lasers.length === 1 && ED.grid.lasers[0].n === 2, "a laser was lost");
      assert(ED.grid.burners.length === 1 && ED.grid.burners[0].len === 2, "a jet was lost");
      assert(ED.grid.flags.length === 2 && ED.grid.flags[1].c === 9,
        "the flags did not come back, or came back reordered");
      assert(edSnapshot() === full, "the restored grid is not the one that was recorded");

      /* And a course's holes survive it, which a board picture cannot
         even spell. */
      var cs = B.composeCourse({ v: 3, dockCol: 0, cells: [
        null, null, null, null, null, null,
        { id: "island", rot: 0 }, { id: "cross", rot: 0 }, null], flags: [[4, 4]] }, 1);
      ED = edState(B.buildCourse(cs), "course");
      ED.isCourse = true;
      ED.grid.flags = [];
      assert(B.isVoid(ED.grid, 20, 14), "fixture: this course has no hole in it");
      /* A square that is FLOOR, found rather than named: painting a
         pit over a pit changes nothing, and a test whose edit is a
         no-op records no history to undo. */
      var spot = null, sc, sr;
      for (sr = 0; sr < ED.grid.h && !spot; sr++) {
        for (sc = 0; sc < ED.grid.w && !spot; sc++) {
          var sel = B.elemOf(B.codeAt(ED.grid, sc, sr));
          if (sel && sel.name === "floor") spot = { c: sc, r: sr };
        }
      }
      assert(spot, "no floor square on this course, so this proves nothing");
      before = edMark();
      edSetCell(spot.c, spot.r, "o.");
      edKeep(before);
      assert(ED.undo.length === 1, "the course edit recorded no history");
      edRestoreSnap(ED.undo.pop());
      assert(B.isVoid(ED.grid, 20, 14), "the hole did not survive the workshop's undo");
      assert(!B.isPit(B.codeAt(ED.grid, spot.c, spot.r)), "the edit was not undone");
      ED = keep;
    } },

    { name: "a course the workshop touched is built from its own picture", run: function () {
      /* A board is a printed thing and its picture belongs to it. A
         course is an arrangement, and a pit moved on the assembled
         course belongs to the COURSE -- there is no board it could be
         written back to without changing every other course that board
         appears in. So an edited course carries its picture and is
         parsed from that, and stamping the boards again would throw
         the edit away. */
      var L = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      var plain = B.composeCourse(B.withFlags(L, [[4, 4]]), 1);
      var C0 = B.buildCourse(plain);
      /* Find a floor square and drop a pit on it, the way the workshop
         does: by editing the picture the course was built from. */
      var g = B.buildCourse(plain), spot = null, c, r;
      for (r = 0; r < g.h && !spot; r++) {
        for (c = 0; c < g.w && !spot; c++) {
          var el = B.elemOf(B.codeAt(g, c, r));
          if (el && el.name === "floor" && r < g.h - 4) spot = { c: c, r: r };
        }
      }
      assert(spot, "no floor square to edit, so this proves nothing");
      g.cell[spot.r * g.w + spot.c] = "o.";
      var edited = B.composeCourse(B.withFlags(L, [[4, 4]]), 1);
      edited.grid = {
        w: g.w, h: g.h, pic: B.gridToPic(g), voids: true,
        lasers: g.lasers.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), n: x.n }; }),
        pushers: g.pushers.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), regs: x.regs.slice() }; }),
        burners: g.burners.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), regs: x.regs.slice(), len: x.len }; }),
        timers: g.timers.map(function (x) { return { c: x.c, r: x.r, regs: x.regs.slice() }; })
      };
      var C1 = B.buildCourse(edited);
      assert(C1.w === C0.w && C1.h === C0.h, "the edited course changed shape");
      assert(B.isPit(B.codeAt(C1, spot.c, spot.r)),
        "the workshop's pit is not on the course that would be raced");
      assert(!B.isPit(B.codeAt(C0, spot.c, spot.r)), "fixture: it was not a pit before");
      /* The bays and the flags still come through, because a course
         that lost its docking bays would fail somewhere far away from
         here. */
      assert(C1.docks.length === C0.docks.length,
        "the edited course has " + C1.docks.length + " bays against " + C0.docks.length);
      assert(C1.flags.length === 1 && C1.flags[0].n === 1, "the edited course lost its flag");
      B.validateCourse(edited, function () {});
    } },

    { name: "an edited course is read for its ruleset the same way", run: function () {
      /* The ruleset is decided by what is ON the course, and after the
         workshop that is the picture rather than the boards. Read from
         the wrong one, a square the workshop put down would change the
         game silently. So the two paths have to agree on a course
         nobody has edited. */
      var L = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "boardH", rot: 0 }, null, null] };
      var spec = B.composeCourse(B.withFlags(L, [[2, 2]]), 1);
      var byBoards = B.playableEditions(spec).slice().sort().join(",");
      var g = B.buildCourse(spec);
      spec.grid = {
        w: g.w, h: g.h, pic: B.gridToPic(g), voids: true,
        lasers: g.lasers.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), n: x.n }; }),
        pushers: g.pushers.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), regs: x.regs.slice() }; }),
        burners: g.burners.map(function (x) { return { c: x.c, r: x.r, d: "NESW".charAt(x.d), regs: x.regs.slice(), len: x.len }; }),
        timers: g.timers.map(function (x) { return { c: x.c, r: x.r, regs: x.regs.slice() }; })
      };
      var byPicture = B.playableEditions(spec).slice().sort().join(",");
      assert(byPicture === byBoards,
        "the picture says " + (byPicture || "nothing") + " and the boards say " + (byBoards || "nothing"));
      assert(byBoards.length, "fixture: this board is playable under something");
      var fromPic = B.courseElements(spec).length;
      assert(fromPic > 10, "the picture found only " + fromPic + " elements on a whole board");

      /* Agreeing on an UNEDITED course proves nothing about which of
         the two it read -- the boards and the picture are the same
         course. So: blank the picture and keep the boards. If the
         count does not fall, the boards are still being read and every
         square the workshop puts down is invisible to the ruleset. */
      var blank = [], bw = spec.grid.w, bh = spec.grid.h, br, bc;
      for (br = 0; br <= bh; br++) {
        var lattice = "", tiles = "";
        for (bc = 0; bc < bw; bc++) { lattice += "+  "; tiles += " .. "; }
        blank.push(lattice + "+");
        if (br < bh) blank.push(new Array(bw + 1).join(" .. "));
      }
      spec.grid = { w: bw, h: bh, pic: blank, voids: true,
                    lasers: [], pushers: [], burners: [], timers: [] };
      var fromBlank = B.courseElements(spec).length;
      assert(fromBlank < fromPic,
        "a course whose picture is bare still reports " + fromBlank + " elements, so the boards " +
        "are being read instead of the picture");
    } },

    { name: "a course with a hole in it round-trips through the workshop", run: function () {
      /* An L-shaped course is mostly void, and so is any course wider
         than its start area. A board has no void -- every square of
         one is printed -- so two spaces in a BOARD picture is a
         dropped character and stays an error. A course picture says it
         carries holes, and then may have them. Without this the
         workshop crashed on any course that was not a neat rectangle,
         reporting it as a problem with the map. */
      var L = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, { id: "cross", rot: 0 }, null] };
      var spec = B.composeCourse(B.withFlags(L, [[4, 4]]), 1);
      var g = B.buildCourse(spec);
      assert(g.w === 24 && g.h === 16, "fixture: two boards over a one-board block");
      /* The far corner of the base has nothing over it -- that is the
         hole. */
      assert(B.isVoid(g, 20, 14), "fixture: this course has no hole in it");
      var pic = B.gridToPic(g);
      assert(/ {2}/.test(pic[2 * 14 + 1]), "the hole was not written into the picture");
      /* A board still refuses it. */
      var threw = false;
      try { B.parsePic("asBoard", { w: g.w, h: g.h, pic: pic, lasers: [] }); }
      catch (e) { threw = true; }
      assert(threw, "a board picture accepted a hole, so a dropped character now reads as void");
      /* A course reads it back, hole and all. */
      var again = B.parsePic("asCourse", { w: g.w, h: g.h, pic: pic, voids: true, lasers: [] });
      assert(B.isVoid(again, 20, 14), "the hole did not survive the round trip");
      assert(!B.isVoid(again, 0, 14), "the start area came back as a hole");
      for (var r = 0; r < g.h; r++) {
        for (var c = 0; c < g.w; c++) {
          assert(B.isVoid(g, c, r) === B.isVoid(again, c, r),
            "(" + c + "," + r + ") changed from " + (B.isVoid(g, c, r) ? "void" : "floor"));
          if (!B.isVoid(g, c, r)) {
            assert(B.codeAt(g, c, r) === B.codeAt(again, c, r), "(" + c + "," + r + ") came back different");
          }
        }
      }
      /* And it builds and validates as a course. */
      spec.grid = { w: g.w, h: g.h, pic: pic, voids: true,
                    lasers: [], pushers: [], burners: [], timers: [] };
      for (var q = 0; q < g.lasers.length; q++) {
        spec.grid.lasers.push({ c: g.lasers[q].c, r: g.lasers[q].r,
                                d: "NESW".charAt(g.lasers[q].d), n: g.lasers[q].n });
      }
      for (q = 0; q < g.pushers.length; q++) {
        spec.grid.pushers.push({ c: g.pushers[q].c, r: g.pushers[q].r,
                                 d: "NESW".charAt(g.pushers[q].d), regs: g.pushers[q].regs.slice() });
      }
      B.validateCourse(spec, function () {});
      assert(B.buildCourse(spec).docks.length === 8, "the rebuilt course lost its bays");
    } },

    { name: "moving a board lets go of the workshop's picture", run: function () {
      UI.layout = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      flagPick().mode = "arena";
      var pic = function () {
        return { w: 1, h: 1, pic: ["+  +", " .. ", "+  +"], flags: [[0, 0]] };
      };
      UI.layout.edit = pic();
      UI.layout.pick.mode = "manual";
      /* While it stands, the course that would be raced carries it. */
      assert(layoutCourse([[1, 1]]).grid, "the edit is not reaching the course that would be raced");
      layoutTurn(6, 1);
      assert(!UI.layout.edit, "turning a board kept a picture of the old arrangement");
      assert(UI.layout.pick.mode !== "manual",
        "the flags step is still offering flags from a picture that is gone");
      /* Putting one down, moving one and taking one off do the same,
         because they all go through the same mark. */
      UI.layout.edit = pic();
      layoutPut(7, "cross");
      assert(!UI.layout.edit, "putting a board down kept the old picture");
      UI.layout.edit = pic();
      layoutMove(7, 4);
      assert(!UI.layout.edit, "moving a board kept the old picture");
      UI.layout.edit = pic();
      layoutDrop(4);
      assert(!UI.layout.edit, "taking a board off kept the old picture");
      /* And moving the block, which changes the course as surely as
         moving a board does. */
      UI.layout.edit = pic();
      layoutDockTo(0);
      assert(!UI.layout.edit, "moving the block kept the old picture");
    } },

    { name: "the flags raced are the flags put down in the workshop", run: function () {
      /* There is nowhere else they can come from. Two placements used
         to generate them from rules, and both produced courses that
         were legal and dull -- a flag is a decision about a particular
         square, and no rule this game knows how to state gets that
         right. */
      UI.layout = { v: 3, dockCol: 0,
                    cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] };
      UI.layout.edit = { w: 1, h: 1, pic: ["+  +", " .. ", "+  +"],
                         flags: [[3, 3], [7, 7], [2, 9], [8, 1]] };
      var pick = flagPick();
      assert(pick.n === 4, "a four-flag workshop course is a " + pick.n + "-flag race");
      assert(JSON.stringify(flagsResolved()) === JSON.stringify(UI.layout.edit.flags),
        "the race is not run to the flags that were put down: " + JSON.stringify(flagsResolved()));
      /* In the order they were placed, because that is the order they
         are raced in. */
      UI.layout.edit.flags = [[8, 1], [3, 3]];
      assert(JSON.stringify(flagsResolved()) === "[[8,1],[3,3]]", "the order came back changed");
      /* And a course with none is not a course to race -- said in its
         own words, pointing at the room where they are placed. */
      UI.layout.edit.flags = [];
      var why = flagProblem();
      assert(why && /workshop/.test(why), "an empty course was refused without saying why: " + why);
      assert(flagPick().n === 0, "an empty course reports " + flagPick().n + " flags");
      /* Nothing generates them. A course with no workshop edit at all
         has no flags either, rather than inventing some. */
      UI.layout.edit = null;
      assert(flagsResolved().length === 0, "flags appeared from somewhere with no workshop edit");
      assert(flagProblem(), "a course with no flags at all was allowed to race");
    } },

    { name: "a saved workshop course survives a reload", run: function () {
      var g = B.buildCourse(B.composeCourse(
        { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null], flags: [] }, 0));
      var edit = { w: g.w, h: g.h, pic: B.gridToPic(g), voids: true, name: "Mine", flags: [[4, 4]],
                   lasers: [], pushers: [], burners: [], timers: [] };
      var up = migrateLayout({ v: 3, dockCol: 0, edit: edit,
        cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null] });
      assert(up && up.edit, "the workshop's picture did not come back");
      assert(up.edit.pic.length === edit.pic.length, "it came back a different size");
      assert(JSON.stringify(up.edit.flags) === "[[4,4]]", "it came back without its flags");
      /* A stored picture that no longer reads is dropped rather than
         opened: a broken edit would take the wizard down on its first
         render, and having no edit is the honest answer. */
      var broken = migrateLayout({ v: 3, dockCol: 0,
        cells: [null, null, null, null, null, null, { id: "island", rot: 0 }, null, null],
        edit: { w: 4, h: 4, pic: ["nonsense"], flags: [] } });
      assert(broken && !broken.edit, "a picture that will not parse was carried across anyway");
      assert(B.laySpan(broken.cells).n === 1, "and it took the boards with it");
    } },

    // ---- where the flags go ----------------------------------------
    /* Legal squares differ from board to board, so the by-hand tests
       ask the course which ones they are rather than naming
       coordinates that a re-transcription could turn into a pit. */

    { name: "a layout that is a shipped course keeps that course's flags", run: function () {
      /* Proving Run is one board, unturned, dock under column one. A
         layout of exactly that IS Proving Run, so its default flags
         are the ones it ships with rather than whatever the automatic
         placement would invent. */
      var L = { v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "provingGround", rot: 0 }, null, null] };
      var got = B.defaultFlagsFor(L), want = B.COURSES.provingRun.flags;
      assert(got, "the layout matched no shipped course");
      assert(JSON.stringify(got) === JSON.stringify(want),
        "got " + JSON.stringify(got) + ", the course ships " + JSON.stringify(want));
      /* Turned off its printed orientation it is a different course. */
      L.cells[6].rot = 1;
      assert(!B.defaultFlagsFor(L), "a turned board must not claim the printed flags");
      L.cells[6].rot = 0;
      L.cells[7] = { id: "island", rot: 0 };
      assert(!B.defaultFlagsFor(L), "two boards must not claim a one-board course's flags");
    } },

    { name: "a flag may only sit on plain floor outside the dock", run: function () {
      var spec = B.composeCourse({ v: 3, dockCol: 0, cells: [null, null, null, null, null, null, { id: "provingGround", rot: 0 }, null, null], flags: [] }, 0);
      var C = B.buildCourse(spec), box = B.dockBoxOf(spec);
      var cand = B.flagCandidates(C, box), i;
      assert(cand.length > 10, "no square on this course can hold a flag");
      for (i = 0; i < cand.length; i++) {
        var el = B.elemOf(B.codeAt(C, cand[i].c, cand[i].r));
        assert(el && el.name === "floor",
          "(" + cand[i].c + "," + cand[i].r + ") is a " + (el ? el.name : "void"));
        assert(!(cand[i].r >= box.y0 && cand[i].r <= box.y1),
          "(" + cand[i].c + "," + cand[i].r + ") is inside the docking bay");
      }
      /* And the by-hand check agrees with the list, because both ask
         the same function. */
      assert(B.flagLegal(C, cand[0].c, cand[0].r, box), "a listed square was refused by hand");
      assert(!B.flagLegal(C, box.x0, box.y0, box), "a square in the dock was allowed by hand");
    } },

    { name: "the picture says which square holds which flag", run: function () {
      /* The tile art draws a flag faithfully, and at a 22px tile that
         is an 11px banner with a 5px numeral on it, in the same amber
         as every conveyor arrow around it. Placing flags by hand was a
         guessing game until the order was drawn again, large, over the
         square it belongs to. */
      var g = bench([["..", "..", ".."], ["..", "..", ".."]]);
      var plain = gridThumb(g, 20, null);
      var over = gridThumb(g, 20, { act: "fput", legal: [1, 1, 1, 1, 1, 1],
                                    marks: { "1,0": 1, "2,1": 2 } });
      assert(plain.indexOf("pr-thumb-hit") < 0, "a picture with no overlay drew one anyway");
      assert((over.match(/pr-thumb-hit/g) || []).length >= 6, "the overlay is missing squares");
      assert((over.match(/mark/g) || []).length >= 2, "the placed flags are not marked");
      assert(/data-c="1" data-r="0"[^>]*>\s*<b>1<\/b>/.test(over),
        "flag one's number is not drawn on its square");
      assert(/data-c="2" data-r="1"[^>]*>\s*<b>2<\/b>/.test(over),
        "flag two's number is not drawn on its square");
      assert(/aria-label="flag 1, /.test(over), "the marked square does not announce its flag");
      /* A marked square stays clickable even when it is not a legal
         landing square any more, because clicking it is how a flag is
         taken back. */
      var boxed = gridThumb(g, 20, { act: "fput", legal: [0, 0, 0, 0, 0, 0], marks: { "1,0": 1 } });
      assert(!/data-c="1" data-r="0"[^>]*disabled/.test(boxed),
        "a placed flag cannot be clicked to take it back");
      /* And the overlay's rows are pinned to the tile size. Sized to
         their content, one numeral made its row taller than a tile and
         pushed every row below it out of line with the board. */
      var rule = CSS.match(/\.pr-thumb-hits\{[^}]*\}/);
      assert(rule, "the overlay layer has no rule of its own");
      assert(/grid-auto-rows:var\(--tile\)/.test(rule[0]),
        "the overlay's rows are free to size themselves, so a marked row drifts: " + rule[0]);
    } },

    { name: "off, the edge of the course is still a fall", run: function () {
      /* The control case, and it has to be here: a bumpers test suite
         that only ever runs with bumpers ON cannot tell a rail from a
         rule that was always true. */
      benchGame(bench([["..", "..", ".."]]), [{ c: 2, r: 0, face: E }]);
      G.bumpers = 0;
      stepRobot(G.players[0], E, "move");
      assert(!G.players[0].alive, "a robot drove off the edge and lived");
      assert(G.players[0].lives === START_LIVES - 1, "it should have lost exactly one life");
    } },

    { name: "on, a robot cannot be driven off the course", run: function () {
      benchGame(bench([["..", "..", ".."]]), [{ c: 2, r: 0, face: E }]);
      G.bumpers = 1;
      var moved = stepRobot(G.players[0], E, "move");
      assert(!moved, "the move should have been refused, the way a wall refuses it");
      assert(G.players[0].alive, "the rail let a robot over the edge");
      assert(G.players[0].c === 2, "the robot moved anyway, to " + at(G.players[0]));
      assert(G.players[0].lives === START_LIVES, "it lost a life against a rail");
    } },

    { name: "on, the rail stops the whole push chain", run: function () {
      /* A wall anywhere in a chain stops everything including the
         robot that started the push. The rail IS a wall for this
         purpose, and the pusher stopping too is the half that is easy
         to get wrong. */
      benchGame(bench([["..", "..", ".."]]), [{ c: 1, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      G.bumpers = 1;
      var moved = stepRobot(G.players[0], E, "move");
      assert(!moved, "the push should have been refused");
      assert(G.players[0].c === 1 && G.players[1].c === 2, "the chain moved into the rail");
      assert(G.players[0].alive && G.players[1].alive, "the rail scrapped somebody");
      /* And with it off, the same shove is fatal to the front robot
         only -- so the assertion above is about the rail and not about
         push chains in general. */
      benchGame(bench([["..", "..", ".."]]), [{ c: 1, r: 0, face: E }, { c: 2, r: 0, face: E }]);
      G.bumpers = 0;
      stepRobot(G.players[0], E, "move");
      assert(G.players[0].alive && !G.players[1].alive,
        "without the rail the shoved robot should go over and the pusher should not");
    } },

    { name: "on, a belt will not carry a robot over the edge", run: function () {
      benchGame(bench([["..", "b>", "b>"]]), [{ c: 2, r: 0, face: E }]);
      G.bumpers = 1;
      beltPass(1);
      assert(G.players[0].alive, "the belt carried a robot over the rail");
      assert(G.players[0].c === 2, "the robot was moved anyway, to " + at(G.players[0]));
      benchGame(bench([["..", "b>", "b>"]]), [{ c: 2, r: 0, face: E }]);
      G.bumpers = 0;
      beltPass(1);
      assert(!G.players[0].alive, "without the rail the belt should have delivered it to the void");
    } },

    { name: "on, a pit is still a pit", run: function () {
      /* The rail fences the play area. It does not fill in the holes
         inside it, and a house rule that quietly removed every pit
         from the game would be a different game. */
      benchGame(bench([["..", "o.", ".."]]), [{ c: 0, r: 0, face: E }]);
      G.bumpers = 1;
      stepRobot(G.players[0], E, "move");
      assert(!G.players[0].alive, "the rail filled in a pit");
    } },

    { name: "on, the bots know the rail is there", run: function () {
      /* The ghost model the bots search against is a simplification of
         the board, not of the RULES. A bot that still read the edge as
         death under bumpers would refuse the outer ring of every
         course, for a reason no player could see. */
      var g = bench([["..", "..", ".."]]);
      benchGame(g, [{ c: 2, r: 0, face: E }]);
      G.bumpers = 1;
      var st = { c: 2, r: 0, face: E, dead: false, flags: 0 };
      ghostMove(UI.course, st, E);
      assert(!st.dead && st.c === 2, "the bot thinks the rail is a cliff");
      G.bumpers = 0;
      var st2 = { c: 2, r: 0, face: E, dead: false, flags: 0 };
      ghostMove(UI.course, st2, E);
      assert(st2.dead, "without the rail the bot should read the edge as death");
    } },

    { name: "on, the rail is drawn and announced", run: function () {
      /* A rule the player cannot see is a trap. It is drawn as a rail
         rather than as a wall, because it is a house rule laid over
         the boards rather than something printed on one. */
      var g = bench([["..", "..", ".."]]);
      benchGame(g, [{ c: 0, r: 0 }]);
      G.bumpers = 1;
      var withRail = wallSpans(UI.course, true), without = wallSpans(UI.course, false);
      assert(withRail.indexOf("pr-fence") >= 0, "nothing was drawn for the rail");
      assert(without.indexOf("pr-fence") < 0, "a rail was drawn with the rule off");
      assert(withRail.length > without.length, "the rail added no bars to the picture");
      /* pr-rail was already taken -- it is the belt art's guard rail,
         and the bumper bar wearing the same name put a block layout
         and an opacity on every conveyor on the board. The class a new
         layer takes has to be one nothing else answers to. */
      assert(!artClasses()["pr-fence"], "the tile art already answers to pr-fence");
      assert(/bumper rail/.test(describeTile(UI.course, 2, 0)),
        "the square against the rail does not say so: " + describeTile(UI.course, 2, 0));
      G.bumpers = 0;
      assert(!/bumper rail/.test(describeTile(UI.course, 2, 0)),
        "a rail was announced with the rule off");
      assert(/edge east/.test(describeTile(UI.course, 2, 0)),
        "with the rule off the square should say it is on the edge");
    } },

    { name: "the board the player sees is asked to draw the rail", run: function () {
      /* wallSpans can draw a rail; that is one fact. Whether the game
         ASKS it to is another, and the first test cannot see the
         second -- taking the argument back out of the renderer left
         every rail assertion green and the rail invisible on screen.
         Same shape as the hazard-pattern check: read the function that
         fills the wall layer and look at the call it makes. */
      var src = String(paintWalls);
      var m = src.match(/wallSpans\(([^)]*)\)/);
      assert(m, "nothing draws the wall layer any more");
      assert(/want/.test(m[1]),
        "the wall layer is drawn without asking about bumpers: wallSpans(" + m[1] + ")");
      assert(/bumpers/.test(src), "paintWalls no longer reads the bumpers rule");
      /* And it has to be repainted AFTER the game exists. mount()
         builds the grid before it has decided whether this is a new
         game or a resumed one, so a wall layer drawn only there asks
         about a G that is not there yet and never draws a rail --
         which is what happened, with every rail assertion green. */
      assert(/paintWalls\(/.test(String(updateAll)),
        "the wall layer is never repainted once the game is known");
      assert(String(buildGridCells).indexOf("paintWalls") >= 0,
        "the board no longer paints its walls when it is built");
    } },

    { name: "on, a beam still leaves the course rather than bouncing", run: function () {
      /* The rail is deliberately outside blocked(), which is also what
         a beam asks. Folding it in there would spend a piercing shot
         on the edge of the board. */
      benchGame(bench([["..", "..", ".."]]), [{ c: 0, r: 0, face: E }]);
      G.bumpers = 1;
      assert(!blocked(UI.course, 2, 0, E), "the rail is being reported to the beams as a wall");
      assert(railed(UI.course, 2, 0, E), "the rail is not there for movement either");
      assert(firstRobotAlong(0, 0, E, true) === null, "a beam found a robot outside the course");
    } },

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
    /* The assembler tests edit UI.layout in place, and a player may be
       halfway through building a course when the console is opened. */
    var keepL = UI.layout;
    UI.headless = true;
    var out = { total: RULE_TESTS.length, passed: 0, failed: [] };
    for (var i = 0; i < RULE_TESTS.length; i++) {
      try { RULE_TESTS[i].run(); out.passed++; }
      catch (e) { out.failed.push({ name: RULE_TESTS[i].name, error: e.message }); }
    }
    G = keepG; UI.course = keepC; UI.headless = keepH; UI.layout = keepL;
    UI.wallsChecked = false;
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
    /* TOUCH TARGETS, on touch only. Every button was 30px tall, which
       clears the 24px AA floor and misses the 44px that phones and
       the HIGs actually want. Raising it everywhere would loosen a
       desktop UI that is dense on purpose, so it is behind a
       coarse-pointer query: fingers get 44, mice keep 30. */
    "@media (pointer:coarse){",
    ".pr-root button{min-height:44px}",
    ".pr-root input[type=range]{height:44px}",
    "}",

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
    /* Between the side-by-side layout and the stack there was nothing,
       so a tablet got the desktop arrangement squeezed. The side panel
       goes full width and the rows wrap first; the stack comes later. */
    "@media (max-width:1400px){.pr-side{min-width:0}",
    ".pr-controls,.pr-ed-row{flex-wrap:wrap}}",
    "@media (max-width:1180px){.pr-main{flex-direction:column;align-items:center}",
    ".pr-side{width:100%;max-width:640px;flex:none}}",

    /* ---- the board ----
       Three layers, all DOM. The grid of cells IS the board now: it
       was always there, invisible, carrying the hit targets and the
       ARIA labels, while a canvas underneath drew the same 288 tiles
       a second time. Deleting the canvas deleted the duplication. */
    ".pr-stage{position:relative;border:1px solid var(--pr-border);background:var(--pr-bg);flex:0 0 auto}",
    /* The row exists for the accessibility tree only; display:contents
       lifts its children back out so they stay CSS grid items. */
    ".pr-grid-row{display:contents}",
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
    ".pr-pusher .pr-push-slot{fill:var(--pr-bg);opacity:.9}",
    /* The linkage is machinery, so it is steel. The FACE is the thing
       that hits you, so it carries the barricade. */
    ".pr-pusher .pr-push-arm{fill:none;stroke:var(--pr-steel);stroke-width:7;",
    "stroke-linecap:round;stroke-linejoin:round}",
    ".pr-pusher .pr-push-pin{fill:var(--pr-bg);stroke:var(--pr-steel);stroke-width:2.5}",
    ".pr-pusher .pr-push-face{fill:url(#pr-hz);stroke:var(--pr-hazard-dark);stroke-width:2.5}",

    ".pr-repair .pr-plate,.pr-upgrade .pr-plate,.pr-dock .pr-plate{fill:var(--pr-plate)}",
    ".pr-repair .pr-tool{stroke:var(--pr-good);stroke-width:13;stroke-linecap:round}",
    ".pr-upgrade .pr-tool{stroke:var(--pr-violet);stroke-width:13;stroke-linecap:round}",
    ".pr-upgrade .pr-tool-ring{fill:none;stroke:var(--pr-violet);stroke-width:6}",
    ".pr-dock .pr-plate{fill:var(--pr-panel-alt);stroke:var(--pr-border);stroke-width:3}",
    ".pr-dock .pr-num{fill:var(--pr-dim)}",

    /* Dimmed on purpose: at full strength a course of pits reads as a
       warning label rather than as a floor with holes in it. */
    ".pr-pit .pr-hazard-frame{fill:none;stroke:url(#pr-hz);stroke-width:9;opacity:.42}",
    ".pr-pit .pr-shaft{fill:#161c2a}",
    ".pr-pit .pr-shaft-2{fill:#20283a}",
    ".pr-pit .pr-void-floor{fill:#000}",
    ".pr-flag .pr-pole{fill:var(--pr-steel)}",
    ".pr-flag .pr-banner{fill:var(--pr-warn);stroke:var(--pr-bg);stroke-width:3}",
    /* The numeral is the point of the tile, so it is sized off the
       banner rather than off the other numbers on the board. */
    ".pr-flag .pr-num{fill:#120c00;font-size:44px;font-weight:700}",
    ".pr-emitter .pr-mount{fill:var(--pr-danger)}",

    /* The hazard stripe, now meaning "this will move or swallow you" --
       pit rims and pusher decks -- rather than "this is solid". Walls
       are concrete. One definition still, in two forms: a CSS gradient
       for DOM bars and an SVG pattern for tile art, kept at the same
       pitch so a pit rim and a pusher deck are the same stripe. */
    ".pr-root{--pr-stripe:repeating-linear-gradient(-45deg,var(--pr-hazard) 0 5px,",
    "var(--pr-hazard-dark) 5px 10px);",
    /* Concrete: aggregate, grain, and a lit top edge. Two directions so
       a vertical wall is lit down its length rather than across it. */
    "--pr-concrete-h:repeating-linear-gradient(64deg,rgba(255,255,255,.055) 0 1px,transparent 1px 4px),",
    "repeating-linear-gradient(-27deg,rgba(0,0,0,.20) 0 1px,transparent 1px 5px),",
    "linear-gradient(180deg,#99a0ad 0,#7a818e 52%,#5f6674 100%);",
    "--pr-concrete-v:repeating-linear-gradient(64deg,rgba(255,255,255,.055) 0 1px,transparent 1px 4px),",
    "repeating-linear-gradient(-27deg,rgba(0,0,0,.20) 0 1px,transparent 1px 5px),",
    "linear-gradient(90deg,#99a0ad 0,#7a818e 52%,#5f6674 100%)}",
    ".pr-defs{position:absolute;width:0;height:0;overflow:hidden}",
    ".pr-hz-dark{fill:var(--pr-hazard-dark)}",
    ".pr-hz-lit{fill:var(--pr-hazard)}",
    ".pr-t-express,.pr-t-belt{background:var(--pr-panel-alt)}",
    /* Which registers a pusher fires on is a rule, not decoration, so
       it is stamped on the tile instead of left to the legend. */
    ".pr-oil .pr-oil{fill:#0a0d16;stroke:var(--pr-concrete);stroke-width:1.5;opacity:.95}",
    ".pr-oil .pr-oil-sheen{fill:var(--pr-accent);opacity:.32}",
    ".pr-press .pr-shaft{fill:var(--pr-bg)}",
    ".pr-press .pr-press-ram{fill:var(--pr-concrete);stroke:var(--pr-bg);stroke-width:3}",
    ".pr-press .pr-press-bolt{fill:var(--pr-danger)}",
    ".pr-burner .pr-flame{fill:var(--pr-danger);opacity:.92}",
    ".pr-burner .pr-flame-core{fill:var(--pr-warn)}",
    ".pr-burner .pr-jet-mount{fill:var(--pr-steel)}",
    ".pr-burner .pr-jet-neck{fill:var(--pr-steel)}",
        /* A course button is a PICTURE of the board with its name under it.
       The thumbnail reuses the board renderer, so it cannot drift. */
    ".pr-course{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 6px 5px}",
    ".pr-course[disabled]{opacity:.38}",
    ".pr-course .pr-course-name{font-size:11px;letter-spacing:.5px}",
    ".pr-thumb{position:relative;display:block;background:var(--pr-bg);",
    "border:1px solid var(--pr-border);overflow:hidden}",
    ".pr-thumb-grid{position:absolute;inset:0;display:grid}",
    ".pr-thumb-walls{position:absolute;inset:0;pointer-events:none}",
    ".pr-thumb-beams{position:absolute;inset:0;pointer-events:none}",
    ".pr-ed-item-icon{display:inline-block;width:20px;text-align:center;color:var(--pr-accent)}",
    /* The tile art is sized off --tile, so a thumbnail cell needs no
       rules of its own beyond losing the board's hover affordances. */
    ".pr-thumb .pr-cell{cursor:default}",
    /* grid-auto-rows, because the overlay's rows would otherwise size
       to their content: one marked square with a numeral in it made
       that row taller than a tile and pushed every row below it out of
       line with the board underneath. */
    ".pr-thumb-hits{position:absolute;inset:0;display:grid;grid-auto-rows:var(--tile)}",
    ".pr-no-hits{pointer-events:none}",
    ".pr-thumb-hit{padding:0;min-height:0!important;border:0!important;background:none;",
    "border-radius:0;cursor:crosshair;display:flex;align-items:center;justify-content:center;",
    "font:700 calc(var(--tile) * 0.62)/1 ui-monospace,Menlo,Consolas,monospace;color:transparent}",
    ".pr-thumb-hit:disabled{cursor:default}",
    ".pr-thumb-hit:not(:disabled):hover{background:color-mix(in srgb,var(--pr-accent) 35%,transparent)}",
    ".pr-thumb-hit:focus-visible{outline:2px solid var(--pr-accent);outline-offset:-2px}",
    /* A placed flag, drawn over its square at a size the eye can find
       in a field of amber arrows: a dark disc, an accent ring and the
       order in the middle. */
    ".pr-thumb-hit.mark{color:var(--pr-bg);background:var(--pr-accent);",
    "box-shadow:0 0 0 2px var(--pr-bg),0 0 0 3px var(--pr-accent),0 0 8px 2px rgba(0,0,0,.8);",
    "border-radius:50%;z-index:2}",
    ".pr-thumb-hit.mark:not(:disabled):hover{background:var(--pr-warn)}",
    ".pr-thumb-pick{cursor:crosshair}",
    /* THE LIBRARY, as a shelf of cards. Each one is a picture of the
       course with its flags on it, its name, what it is made of, and
       the three things anybody wants to do with it. */
    ".pr-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:4px 0}",
    ".pr-lib-item{border:1px solid var(--pr-border);background:var(--pr-panel);padding:5px;",
    "display:flex;flex-direction:column;gap:3px}",
    ".pr-lib-thumb{display:flex;justify-content:center;align-items:center;min-height:52px;",
    "overflow:hidden;background:var(--pr-bg)}",
    ".pr-lib-name{font-size:11px;color:var(--pr-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pr-lib-note{font-size:9px;color:var(--pr-dim)}",
    ".pr-lib-acts{display:flex;gap:3px;margin-top:auto}",
    ".pr-lib-acts button{padding:2px 6px;min-height:0!important;font-size:10px;flex:1 1 auto}",
    ".pr-lib-acts button:last-child{flex:0 0 auto;color:var(--pr-dim)}",
    ".pr-lib-acts button:last-child:hover:not(:disabled){color:var(--pr-danger);border-color:var(--pr-danger)}",

    /* THE STEP RAIL. An ordered list, because it is one -- a screen
       reader gets "3 of 5" from the markup rather than from a picture
       of a progress bar. Steps already passed are links back; steps
       not yet reachable are plain text, so the rail never offers a
       screen that cannot answer its own question. */
    ".pr-steps{display:flex;flex-wrap:wrap;gap:0;list-style:none;margin:0 0 10px;padding:0;",
    "counter-reset:pr-step;font-size:11px}",
    ".pr-steps li{display:flex;align-items:center}",
    ".pr-steps li+li::before{content:'\\2192';margin:0 6px;color:var(--pr-dim)}",
    ".pr-steps button,.pr-steps span{counter-increment:pr-step;padding:2px 6px;min-height:0!important;",
    "border:0!important;background:none;font:inherit}",
    ".pr-steps button::before,.pr-steps span::before{content:counter(pr-step) ' ';color:var(--pr-dim)}",
    ".pr-steps button{color:var(--pr-ink);text-decoration:underline;cursor:pointer}",
    ".pr-steps button:hover{color:var(--pr-accent)}",
    ".pr-steps .on{color:var(--pr-accent)}",
    ".pr-steps .on::before{color:var(--pr-accent)}",
    ".pr-steps .off{color:var(--pr-dim)}",
    ".pr-course-row{max-height:132px;overflow-y:auto}",
    ".pr-c-both{font-size:9px;letter-spacing:.5px;color:var(--pr-good);font-style:normal}",
    ".pr-c-no{font-size:9px;letter-spacing:.5px;color:var(--pr-dim);font-style:normal}",
    ".pr-c-note{display:block;font-size:9px;font-style:normal;color:var(--pr-dim)}",
    ".pr-rs-years{font-size:9px;color:var(--pr-dim);font-style:normal;margin-left:4px}",
    ".pr-rs-n{font-size:9px;color:var(--pr-good);font-style:normal;margin-left:4px}",
    ".pr-rs-no{font-size:9px;color:var(--pr-danger);font-style:normal;margin-left:4px}",
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
    /* A wall is POURED CONCRETE, not a hazard stripe. The stripe now
       belongs to the things that move or swallow you -- pit rims and
       pusher decks -- and a board where the static walls shouted the
       same warning as the moving parts had no way to say which was
       which. The texture is three cheap layers: fine aggregate one way,
       coarser grain across it, and a vertical shade so the slab has a
       lit top edge and a shadowed foot. */
    ".pr-wall{position:absolute;background:var(--pr-concrete-h);pointer-events:none;",
    "box-sizing:border-box;border:1px solid var(--pr-concrete-edge);",
    "box-shadow:0 0 6px 1px rgba(0,0,0,.72);",
    "left:calc(var(--c) * var(--tile));top:calc(var(--r) * var(--tile) - var(--wt) / 2);",
    "width:var(--tile);height:var(--wt)}",
    ".pr-wall.pr-v{left:calc(var(--c) * var(--tile) - var(--wt) / 2);",
    "top:calc(var(--r) * var(--tile));width:var(--wt);height:var(--tile);",
    "background:var(--pr-concrete-v)}",

    /* The bumpers rail borrows the wall's geometry and says something
       different with it: a thin steel bar rather than a concrete slab,
       because it is a house rule fenced round the play area and not
       part of any board's printing. */
    ".pr-fence{position:absolute;pointer-events:none;box-sizing:border-box;",
    "background:var(--pr-steel);opacity:.85;",
    "left:calc(var(--c) * var(--tile));top:calc(var(--r) * var(--tile) - var(--wt) / 4);",
    "width:var(--tile);height:calc(var(--wt) / 2)}",
    ".pr-fence.pr-v{left:calc(var(--c) * var(--tile) - var(--wt) / 4);",
    "top:calc(var(--r) * var(--tile));width:calc(var(--wt) / 2);height:var(--tile)}",

    /* A swing door sits exactly where a wall would, so it inherits the
       geometry and changes only what it says: hollow rather than solid,
       amber rather than concrete, and stamped with the registers it
       opens in. */
    ".pr-door{position:absolute;pointer-events:none;box-sizing:border-box;",
    "border:2px dashed var(--pr-warn);background:color-mix(in srgb, var(--pr-warn) 14%, transparent);",
    "left:calc(var(--c) * var(--tile));top:calc(var(--r) * var(--tile) - var(--wt) / 2);",
    "width:var(--tile);height:var(--wt)}",
    ".pr-door.pr-v{left:calc(var(--c) * var(--tile) - var(--wt) / 2);",
    "top:calc(var(--r) * var(--tile));width:var(--wt);height:var(--tile)}",
    ".pr-door::after{content:attr(data-w);position:absolute;left:50%;top:50%;",
    "transform:translate(-50%,-50%);font-size:8px;line-height:1;color:var(--pr-warn);",
    "background:var(--pr-bg);padding:0 2px;border-radius:2px;letter-spacing:.5px}",

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

    /* ---- the shot that connected ----
       Above the walls, below the robots: a board laser is drawn under
       its own mount because it comes out of one, but this comes out of
       a robot and stops at a robot, so it should cross the floor and
       strike the hull rather than being painted over it.

       The beam is the SHOOTER'S colour, not danger red, because the
       one thing the damage pips cannot tell you is who fired. It grows
       by WIDTH rather than scaleX: a scaled beam squashes its own
       muzzle flare and its head, and the head is the part that reads
       as travel. */
    ".pr-shots{position:absolute;left:0;top:0;pointer-events:none}",
    /* The beam is drawn at FULL LENGTH and revealed with clip-path
       rather than grown by width. Same picture, same undistorted head,
       but the animated property is one the compositor owns -- and up
       to eight of these run at once. */
    ".pr-shot{position:absolute;height:3px;width:calc(var(--len) * var(--tile));margin-top:-1.5px;",
    "left:calc((var(--c) + .5) * var(--tile));top:calc((var(--r) + .5) * var(--tile));",
    "transform-origin:0 50%;transform:rotate(var(--rot,0deg));",
    "background:currentColor;box-shadow:0 0 8px currentColor;",
    "animation:pr-shot var(--pr-shot-ms,420ms) cubic-bezier(.15,.7,.25,1) forwards}",
    ".pr-shot::after{content:'';position:absolute;right:-3px;top:-3px;width:9px;height:9px;",
    "border-radius:50%;background:#fff;box-shadow:0 0 10px currentColor}",
    "@keyframes pr-shot{0%{clip-path:inset(0 100% 0 0);opacity:1}",
    "30%{clip-path:inset(0 0 0 0);opacity:1}",
    "65%{clip-path:inset(0 0 0 0);opacity:1}",
    "100%{clip-path:inset(0 0 0 0);opacity:0}}",
    /* Held at zero opacity until the beam has actually arrived, so the
       impact is something the shot causes rather than something that
       happens at the same time. */
    ".pr-shot-burst{position:absolute;width:var(--tile);height:var(--tile);",
    "left:calc(var(--c) * var(--tile));top:calc(var(--r) * var(--tile));",
    "border:2px solid currentColor;border-radius:50%;box-sizing:border-box;opacity:0;",
    "animation:pr-burst var(--pr-shot-ms,420ms) ease-out forwards}",
    "@keyframes pr-burst{0%,28%{transform:scale(.15);opacity:0}",
    "42%{transform:scale(.6);opacity:1}",
    "100%{transform:scale(1.2);opacity:0}}",
    /* Nobody should be made ill by a laser they did not ask for. */
    "@media (prefers-reduced-motion:reduce){",
    ".pr-shot{animation:pr-shot-still var(--pr-shot-ms,420ms) steps(1,end) forwards}",
    "@keyframes pr-shot-still{0%,70%{clip-path:inset(0 0 0 0);opacity:1}",
    "100%{opacity:0}}",
    ".pr-shot-burst{animation:none;opacity:0}}",

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
    /* LEFT AND TOP PLACE IT; TRANSFORM MOVES IT.

       The transition used to cover left and top as well, which animates
       two LAYOUT properties -- the browser re-lays-out the piece layer
       every frame of every robot's slide. It was also redundant: FLIP
       already turns each move into a transform and plays it on the
       compositor, so the layout animation was a second, slower copy of
       the same motion running underneath.

       Position now snaps and the transform carries the movement, at
       the duration the speed setting asks for rather than a fixed
       .3s. */
    ".pr-piece{position:absolute;width:var(--tile);height:var(--tile);will-change:transform;",
    "transition:transform var(--pr-move-ms,.22s) var(--pr-move-ease,var(--pr-ease)),opacity .3s}",
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

    /* A SEGMENTED CONTROL, not a row of loose buttons. One outline
       around the set says these are alternatives; the hairlines
       between say where each one ends. */
    /* A bay you may take. The pulse is slow and the outline is the
       accent, so it reads as an invitation rather than an alarm. */
    ".pr-cell.pr-bay-open{cursor:pointer;box-shadow:inset 0 0 0 2px var(--pr-accent)}",
    ".pr-cell.pr-bay-open:hover{background:var(--pr-panel-alt)}",
    /* ---- the course assembler ---- */
    /* THE ASSEMBLER. The stage on the left with the starting block
       along its base, the shelf of boards down the right in two
       columns. The stage is absolutely positioned because what it
       draws is a map: half a board over is six squares over, not "the
       next cell". */
    ".pr-lay{display:flex;gap:10px;align-items:flex-start;margin:4px 0}",
    ".pr-lay-stage{position:relative;flex:0 0 auto;background:var(--pr-bg);",
    "border:1px solid var(--pr-border);padding:0}",
    ".pr-lay-dock,.pr-lay-board,.pr-lay-slot,.pr-lay-dockslot{position:absolute}",
    ".pr-lay-dock{line-height:0;outline:1px solid var(--pr-accent);outline-offset:-1px}",
    ".pr-lay-label{position:absolute;left:2px;top:1px;font-size:8px;line-height:1;",
    "letter-spacing:1px;color:var(--pr-accent);text-transform:uppercase;pointer-events:none}",
    /* The other columns the block could sit under, offered only where
       a board is standing over them. */
    /* A FIXED BOX WITH TEXT IN IT HAS TO SAY WHAT HAPPENS TO THE TEXT.
       The root sets `font:13px/1.5`, which computes to a line-height of
       19.5 PIXELS and inherits as that absolute length -- so an 8px
       label in here got 19.5px lines, wrapped to two, and stood 35px
       tall in a 32px box, hanging over the paragraph below it. Its own
       line-height, centred, and clipped so nothing it ever says can
       reach outside the box again. */
    /* A FIXED BOX WITH TEXT IN IT HAS TO SAY WHAT HAPPENS TO THE TEXT.
       The root sets `font:13px/1.5`, which computes to a line-height of
       about 20 PIXELS and inherits as that absolute length -- so a
       small label in here got 20px lines, wrapped to two, and stood
       taller than the 32px box, hanging over the paragraph below it.
       Its own line-height, centred, and clipped so nothing it ever
       says can reach outside the box again.

       SCOPED UNDER .pr-root ON PURPOSE. `.pr-root button` is a class
       AND an element and so beats any bare class in this sheet: the
       font-size, the padding and the line-height here were all being
       thrown away, which is why the rule it replaces had to shout
       !important at the two properties it cared about. Two classes
       beat one class and an element, so everything below lands. */
    ".pr-root .pr-lay-dockslot{border:1px dashed var(--pr-accent-dim);",
    "background:color-mix(in srgb,var(--pr-accent) 5%,transparent);color:var(--pr-dim);",
    "min-height:0;padding:0 2px;font-size:8px;letter-spacing:1px;text-transform:uppercase;",
    "display:flex;align-items:center;justify-content:center;text-align:center;",
    "line-height:1.2;overflow:hidden}",
    ".pr-root .pr-lay-dockslot:hover{border-color:var(--pr-accent);color:var(--pr-accent);",
    "background:color-mix(in srgb,var(--pr-accent) 22%,transparent)}",
    ".pr-lay-board{line-height:0}",
    ".pr-lay-board .pr-lboard{padding:0;border:0!important;background:none;cursor:grab;",
    "line-height:0;min-height:0!important;display:block}",
    ".pr-lay-board.sel .pr-thumb{border-color:var(--pr-accent);",
    "box-shadow:0 0 0 1px var(--pr-accent),0 0 10px 2px rgba(0,0,0,.7)}",
    /* THE CONTROLS SIT ON THE BOARD, and only on the selected one. A
       bar across every board's foot covered a sixth of every map on
       the stage, permanently, to say what the map says better. The
       turns are in the corners they turn toward; the bin is in the
       middle, where nothing is ever aimed by accident. */
    ".pr-lay-tool{position:absolute;padding:0;min-height:0!important;width:22px;height:22px;",
    "display:flex;align-items:center;justify-content:center;line-height:1;",
    "font:16px ui-monospace,Menlo,Consolas,monospace;color:var(--pr-bg);",
    "background:var(--pr-accent);border:1px solid var(--pr-bg)!important;border-radius:3px;",
    "box-shadow:0 0 6px 1px rgba(0,0,0,.75);z-index:4;cursor:pointer}",
    ".pr-lay-tool:hover{background:var(--pr-warn)}",
    ".pr-lay-tool:focus-visible{outline:2px solid var(--pr-text);outline-offset:1px}",
    ".pr-lay-tool.tl{left:3px;top:3px}",
    ".pr-lay-tool.tr{right:3px;top:3px}",
    ".pr-lay-tool.bin{left:50%;top:50%;transform:translate(-50%,-50%);width:28px;height:28px;",
    "background:var(--pr-danger);color:var(--pr-text)}",
    ".pr-lay-tool.bin:hover{background:var(--pr-warn)}",
    ".pr-trash{width:16px;height:16px;fill:none;stroke:var(--pr-bg);stroke-width:2;",
    "stroke-linecap:round;stroke-linejoin:round}",
    /* The turn controls are the ROTATE cards' own drawing, at button
       size. Same paths, so the card and the control cannot come to
       mean different things. pr-quarter and not pr-turn: pr-turn is
       already the gear art's arc. */
    ".pr-quarter{width:17px;height:17px;display:block;color:currentColor}",
    ".pr-quarter .pr-cshaft,.pr-quarter .pr-cmark{stroke:currentColor;stroke-width:11;",
    "stroke-linecap:round;stroke-linejoin:round;fill:none}",
    ".pr-lay-menu .pr-quarter{width:13px;height:13px;flex:0 0 auto}",
    ".pr-lay-menu{position:absolute;z-index:6;display:flex;flex-direction:column;",
    "background:var(--pr-panel);border:1px solid var(--pr-accent);",
    "box-shadow:0 2px 12px 2px rgba(0,0,0,.8);min-width:110px;line-height:1.4}",
    ".pr-lay-menu button{display:flex;align-items:center;gap:5px;text-align:left;",
    "padding:3px 8px;min-height:0!important;border:0!important;background:none;",
    "font-size:11px;color:var(--pr-ink);white-space:nowrap}",
    ".pr-lay-menu button:hover{background:var(--pr-accent);color:var(--pr-bg)}",
    /* Empty slots are always drawn and light up when something is
       being carried. Drawn only while holding, the one thing this
       screen wants you to know was invisible until you had guessed
       it. */
    ".pr-lay-slot{border:1px dashed var(--pr-accent-dim)!important;",
    "background:color-mix(in srgb,var(--pr-accent) 5%,transparent);",
    "color:var(--pr-dim);min-height:0!important;padding:0;display:flex;align-items:center;",
    "justify-content:center;font:700 18px ui-monospace,Menlo,Consolas,monospace;",
    "cursor:default;z-index:1}",
    ".pr-lay-slot.live{border-color:var(--pr-accent)!important;color:var(--pr-accent);",
    "background:color-mix(in srgb,var(--pr-accent) 12%,transparent);cursor:copy;z-index:3}",
    ".pr-lay-slot.live:hover,.pr-lay-slot.pr-over{",
    "background:color-mix(in srgb,var(--pr-accent) 34%,transparent)}",
    ".pr-lay-slot:focus-visible{outline:2px solid var(--pr-accent);outline-offset:1px}",
    ".pr-lay-painted{display:contents}",
    /* Two columns, down the right, scrolling rather than growing --
       the shelf must never be what decides how tall this screen is. */
    ".pr-lay-shelf{flex:1 1 auto;min-width:0}",
    ".pr-lay-shelf-in{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;",
    "max-height:280px;overflow-y:auto;padding-right:2px}",
    ".pr-pal{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;cursor:grab}",
    ".pr-pal.on{border-color:var(--pr-accent);background:var(--pr-panel-alt)}",
    ".pr-pal.used{border-color:var(--pr-accent-dim)}",
    ".pr-pal:disabled{cursor:default}",
    ".pr-pal-name{font-size:9px;color:var(--pr-ink);text-align:center}",
    ".pr-pal-used{color:var(--pr-accent);font-style:normal}",
    ".pr-lay-note{font-size:10px;color:var(--pr-dim);margin:2px 0}",
    ".pr-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--pr-border);",
    "border-radius:3px;overflow:hidden;margin:2px 0}",
    ".pr-seg-b{border:0!important;border-left:1px solid var(--pr-border)!important;",
    "border-radius:0!important;background:var(--pr-panel);padding:5px 11px;min-width:34px}",
    ".pr-seg-b:first-child{border-left:0!important}",
    /* !important on both halves, like the border above it: a chosen
       segment button is accent-on-dark, and half a dozen looser rules
       in this sheet colour any `.on` they can reach. One of them did
       repaint the label the accent -- the same colour as the fill --
       and the label went to 1:1 while every token still cleared its
       contrast floor. Scoping that one rule fixes today; pinning the
       pair here is what stops the next one. */
    ".pr-seg-b.on{background:var(--pr-accent)!important;color:var(--pr-bg)!important}",
    ".pr-seg-b:disabled{opacity:.3;cursor:default}",
    ".pr-seg-b:not(.on):not(:disabled):hover{background:var(--pr-panel-alt)}",

    /* A switch reads as a state, not as a press: the dot is where the
       setting IS, and it slides rather than blinking. */
    ".pr-switch{display:inline-flex;align-items:center;gap:8px;padding:5px 11px 5px 6px}",
    ".pr-switch .pr-switch-dot{width:26px;height:14px;border-radius:8px;flex:0 0 26px;",
    "background:var(--pr-border-lit);position:relative;transition:background .18s}",
    ".pr-switch .pr-switch-dot::after{content:\'\';position:absolute;top:2px;left:2px;",
    "width:10px;height:10px;border-radius:50%;background:var(--pr-ink);transition:transform .18s,background .18s}",
    ".pr-switch.on .pr-switch-dot{background:var(--pr-accent)}",
    ".pr-switch.on .pr-switch-dot::after{transform:translateX(12px);background:var(--pr-bg)}",
    ".pr-livery{display:inline-flex;align-items:center;gap:5px}",
    ".pr-livery .pr-swatch{width:10px;height:10px;flex:0 0 10px;border:1px solid var(--pr-border)}",
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
    /* ---- the workshop ----
       FIVE REGIONS ON A FULL SCREEN. The map used to sit in a column
       with the library beside it and the exits in a footer under
       both, at a fixed tile size, and on a wide screen it filled a
       corner. Now the page IS the workshop: a bar across the top, a
       rail of tools down the left, the map filling whatever is left,
       the inspector on the right and a status line underneath. */
    ".pr-root.pr-editing{display:grid;height:100vh;height:100dvh;padding:0;gap:0;overflow:hidden;",
    "grid-template-columns:auto minmax(0,1fr) 268px;grid-template-rows:auto minmax(0,1fr) auto;",
    "grid-template-areas:'top top top' 'rail view side' 'status status status';align-items:stretch;",
    "justify-items:stretch}",
    ".pr-ed-top{grid-area:top;display:flex;align-items:center;gap:6px;padding:5px 10px;",
    "border-bottom:1px solid var(--pr-border);background:var(--pr-panel);flex-wrap:wrap;font-size:11px}",
    ".pr-ed-title{color:var(--pr-accent);letter-spacing:2px;font-size:12px;margin-right:4px;white-space:nowrap}",
    ".pr-ed-gap{flex:1 1 auto}",
    ".pr-ed-name{background:var(--pr-bg);border:1px solid var(--pr-border);color:var(--pr-text);",
    "font:inherit;padding:3px 6px;min-width:0}",
    ".pr-ed-zoom{display:inline-flex}",
    ".pr-ed-zoom button{padding:4px 8px;min-width:30px}",
    ".pr-ed-zoom button+button{margin-left:-1px}",
    ".pr-ed-zoom [data-ed=zoom]{min-width:52px}",
    ".pr-ed-go{border-color:var(--pr-accent)!important;color:var(--pr-accent)!important}",
    ".pr-ed-go:hover:not(:disabled){background:var(--pr-panel-alt)}",
    ".pr-ed-rail{grid-area:rail;display:flex;flex-direction:column;gap:2px;padding:6px;width:172px;",
    "border-right:1px solid var(--pr-border);background:var(--pr-panel);overflow-y:auto;overflow-x:hidden}",
    ".pr-ed-gh{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--pr-dim);",
    "margin:6px 0 2px 4px}",
    ".pr-ed-gh:first-child{margin-top:0}",
    ".pr-ed-item{display:flex;align-items:center;gap:6px;padding:3px 5px;min-height:0!important;",
    "font-size:10px;text-align:left;cursor:grab;border-color:transparent;background:none}",
    ".pr-ed-item:hover:not(:disabled){background:var(--pr-panel-alt)}",
    ".pr-ed-item.on{border-color:var(--pr-accent);color:var(--pr-accent);",
    "background:var(--pr-panel-alt)}",
    ".pr-ed-item-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pr-ed-item-icon{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;",
    "color:var(--pr-accent)}",
    ".pr-ed-key{font:9px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--pr-dim);",
    "border:1px solid var(--pr-border);border-radius:3px;padding:1px 3px;min-width:14px;text-align:center}",
    ".pr-ed-item.on .pr-ed-key{color:var(--pr-accent);border-color:var(--pr-accent)}",
    /* A ram and a jet stamp the registers they fire in across the
       square, which at rail size is three digits over a 20px picture
       -- unreadable, and answering a question the rail was not asked.
       The rail says WHAT you are about to put down; which registers it
       fires in is a setting, and settings live in the inspector. Same
       reason .pr-leg-art hides them in the help legend. The ghost and
       the big tile keep theirs, because both are pictures of the
       square as the map draws it. */
    ".pr-ed-item .pr-pushreg{display:none}",
    /* THE MAP is a scroll box, so panning is scrolling and the browser
       does the work; the stage is drawn once at the game's tile size
       and scaled, so zooming rebuilds nothing. The flex-and-margin
       pair centres a map smaller than the box without clipping one
       that is larger, which justify-content:center would. */
    ".pr-ed-view{grid-area:view;position:relative;display:flex;overflow:auto;background:var(--pr-bg);",
    "touch-action:none;cursor:crosshair;overscroll-behavior:contain}",
    ".pr-ed-canvas{position:relative;margin:auto;flex:0 0 auto}",
    ".pr-ed-stage{position:absolute;left:16px;top:16px;transform-origin:0 0;border:1px solid var(--pr-border)}",
    ".pr-ed-stage .pr-grid,.pr-ed-stage .pr-beams,.pr-ed-stage .pr-walls{position:absolute;left:0;top:0}",
    ".pr-ed-under{position:absolute;pointer-events:none;image-rendering:auto;z-index:1}",
    ".pr-ed-grid{position:absolute;left:0;top:0;display:grid;z-index:2}",
    /* Photo-only: the traced layers go, the hit grid stays, so you can
       still click squares while looking at the thing you are copying. */
    ".pr-ed-solo .pr-grid,.pr-ed-solo .pr-beams,.pr-ed-solo .pr-walls{visibility:hidden}",
    ".pr-ed-solo{outline:2px solid var(--pr-accent);outline-offset:2px}",
    ".pr-ed-cell{border:1px solid rgba(84,242,255,.12)}",
    ".pr-ed-cell:hover{background:rgba(84,242,255,.12)}",
    ".pr-ed-cell.pr-over{background:color-mix(in srgb,var(--pr-accent) 35%,transparent)}",
    /* The square being looked at, so the inspector and the map agree
       about which one that is. */
    ".pr-ed-cell.pr-sel{outline:2px solid var(--pr-accent);outline-offset:-2px;",
    "background:color-mix(in srgb,var(--pr-accent) 16%,transparent)}",
    /* THE GHOST of the thing in hand, on the square under the pointer,
       above the hit grid and through it -- it must never catch the
       click it is previewing. */
    ".pr-ed-ghost{position:absolute;z-index:3;pointer-events:none;opacity:.72;",
    "outline:1px solid var(--pr-accent);animation:pr-ghost .9s ease-in-out infinite alternate}",
    ".pr-ed-ghost .pr-thumb{border:0}",
    ".pr-ed-ghost-no{outline-color:var(--pr-danger);filter:grayscale(1);animation:none;opacity:.35}",
    "@keyframes pr-ghost{from{opacity:.55}to{opacity:.85}}",
    ".pr-ed-panning .pr-ed-view,.pr-ed-space .pr-ed-view{cursor:grabbing}",
    ".pr-ed-space:not(.pr-ed-panning) .pr-ed-view{cursor:grab}",
    ".pr-ed-dragging .pr-ed-view{cursor:move}",
    ".pr-ed-dragging .pr-ed-cell:hover{background:color-mix(in srgb,var(--pr-accent) 30%,transparent)}",
    ".pr-ed-side{grid-area:side;overflow-y:auto;padding:8px;border-left:1px solid var(--pr-border);",
    "background:var(--pr-panel);font-size:11px}",
    ".pr-ed-status{grid-area:status;display:flex;gap:14px;align-items:center;padding:4px 10px;",
    "border-top:1px solid var(--pr-border);background:var(--pr-panel);font-size:11px;min-height:26px}",
    ".pr-ed-st-hover{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    "color:var(--pr-ink)}",
    ".pr-ed-ok{color:var(--pr-accent);font-size:11px;white-space:nowrap}",
    ".pr-ed-bad{color:var(--pr-danger);font-size:11px}",
    ".pr-ed-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-size:11px}",
    ".pr-ed-row span{opacity:.7}",
    ".pr-setup-edit{margin-top:6px;flex-wrap:wrap}",
    ".pr-ed-note{font-size:10px;opacity:.55;width:100%}",
    /* :not(.pr-seg-b) because a segmented control paints its chosen
       button accent-on-dark, and this rule -- written for the editor's
       bare toolbar toggles and later in the sheet -- otherwise repaints
       the label the same accent as the fill it sits on. */
    ".pr-ed-row .on:not(.pr-seg-b){border-color:var(--pr-accent);color:var(--pr-accent)}",
    ".pr-ed-row input[type=text]{background:var(--pr-panel);border:1px solid var(--pr-border);",
    "color:var(--pr-text);font:inherit;padding:3px 6px}",
    ".pr-ed-row input[type=range]{width:80px;accent-color:var(--pr-accent)}",
    ".pr-ed-h{margin:0 0 4px;font-size:11px;letter-spacing:1px;color:var(--pr-accent);",
    "font-weight:normal;text-transform:uppercase;display:flex;align-items:center;gap:6px}",
    ".pr-ed-h .pr-ed-x{margin-left:auto;padding:0 6px;min-height:0!important;line-height:1.4}",
    ".pr-ed-side .pr-ed-row{margin-bottom:4px}",
    ".pr-ed-side .pr-ed-note{opacity:.6;margin-bottom:4px}",
    /* THE FLAGS, as the race, on top of everything else. */
    ".pr-ed-flags{border-bottom:1px solid var(--pr-border);padding-bottom:6px;margin-bottom:8px}",
    ".pr-ed-flag{display:flex;gap:2px;align-items:stretch;margin-bottom:2px}",
    ".pr-ed-flag button{padding:2px 6px;min-height:0!important;font-size:10px}",
    ".pr-ed-flag-go{flex:1 1 auto;text-align:left}",
    ".pr-ed-flag-go b{color:var(--pr-accent);margin-right:4px}",
    ".pr-ed-flag.on .pr-ed-flag-go{border-color:var(--pr-accent)}",
    ".pr-ed-ref{margin-top:8px;border-top:1px solid var(--pr-border);padding-top:6px}",
    ".pr-root .pr-ed-ref-head{display:block;width:100%;text-align:left;padding:0;margin:0 0 4px;",
    "min-height:0;border:0;background:none;cursor:pointer}",
    /* THE SQUARE, LARGE, WITH ITS WALLS ON IT. A wall lives on an
       EDGE, and the only place an edge is unambiguous is the picture
       -- four labelled buttons make you translate "north" into "the
       top" every time. */
    ".pr-ed-big{position:relative;margin:0 auto 6px;background:var(--pr-bg);",
    "border:1px solid var(--pr-border);line-height:0}",
    ".pr-ed-void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
    "font-size:10px;line-height:1.4;color:var(--pr-dim);text-align:center}",
    /* The buttons are hit areas over the picture, not a second drawing
       of it: the wall itself is drawn by the board's own renderer
       underneath, and a button that painted its own concrete on top
       would be a copy that could disagree with it. Empty when the wall
       is there, a hint of accent when it is not, and a warning on
       hover when clicking would take one down. */
    ".pr-ed-wall{position:absolute;padding:0;min-height:0!important;border:0!important;",
    "background:color-mix(in srgb,var(--pr-accent) 10%,transparent);cursor:pointer;z-index:3}",
    ".pr-ed-wall:hover{background:color-mix(in srgb,var(--pr-accent) 40%,transparent)}",
    ".pr-ed-wall.on{background:none}",
    ".pr-ed-wall.on:hover{background:color-mix(in srgb,var(--pr-danger) 55%,transparent)}",
    ".pr-ed-wall:focus-visible{outline:2px solid var(--pr-accent);outline-offset:-2px;z-index:4}",
    ".pr-w0{left:0;right:0;top:0;height:var(--wt)}",
    ".pr-w2{left:0;right:0;bottom:0;height:var(--wt)}",
    ".pr-w3{top:var(--wt);bottom:var(--wt);left:0;width:var(--wt)}",
    ".pr-w1{top:var(--wt);bottom:var(--wt);right:0;width:var(--wt)}",
    /* A compass, not a row of words: the four facings arranged the way
       they point, so it is answered by aiming. */
    ".pr-ed-compass{position:relative;display:grid;grid-template-columns:repeat(3,26px);",
    "grid-template-rows:repeat(3,22px);justify-content:center;margin:2px auto 4px}",
    ".pr-ed-cp{padding:0;min-height:0!important;font-size:11px;line-height:1}",
    ".pr-ed-cp.on{border-color:var(--pr-accent)!important;color:var(--pr-bg);",
    "background:var(--pr-accent)}",
    ".pr-ed-cp.pr-n{grid-area:1/2}.pr-ed-cp.pr-w{grid-area:2/1}",
    ".pr-ed-cp.pr-e{grid-area:2/3}.pr-ed-cp.pr-s{grid-area:3/2}",
    ".pr-ed-cp-mid{grid-area:2/2;display:flex;align-items:center;justify-content:center;",
    "font-size:11px;color:var(--pr-accent)}",
    /* One block per thing standing on the square, because a square can
       carry a belt AND a wall-mounted trap and both of them turn. */
    ".pr-ed-part{border:1px solid var(--pr-border);padding:4px;margin-bottom:5px}",
    ".pr-ed-part.on{border-color:var(--pr-accent)}",
    ".pr-ed-part-h{display:block;width:100%;text-align:left;padding:1px 3px;",
    "min-height:0!important;border:0!important;background:none;font-size:10px;",
    "letter-spacing:1px;text-transform:uppercase;color:var(--pr-ink)}",
    ".pr-ed-part.on .pr-ed-part-h{color:var(--pr-accent)}",
    ".pr-ed-out{width:100%;background:var(--pr-bg);color:var(--pr-ink);border:1px solid var(--pr-border);",
    "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:8px}",
    /* Narrow: the rail lies across the top and the inspector becomes a
       drawer under the map, so the map keeps the middle of the screen. */
    "@media (max-width:900px){",
    ".pr-root.pr-editing{grid-template-columns:minmax(0,1fr);",
    "grid-template-rows:auto auto minmax(0,1fr) auto auto;grid-template-areas:'top' 'rail' 'view' 'side' 'status'}",
    ".pr-ed-rail{flex-direction:row;width:auto;overflow-x:auto;overflow-y:hidden;border-right:0;",
    "border-bottom:1px solid var(--pr-border);padding:4px}",
    ".pr-ed-gh{display:none}",
    ".pr-ed-item{flex:0 0 auto}",
    ".pr-ed-item-name{display:none}",
    ".pr-ed-side{max-height:36vh;border-left:0;border-top:1px solid var(--pr-border)}",
    "}",
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
  /* 3: the course spec rides in the save beside its name, so a
     composed course survives a reload. A version 2 save has only the
     name, and a name is all a shipped course ever needed -- but there
     is no way to tell from the outside, so they are refused rather
     than half-read. */
  var SAVE_VERSION = 3;

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
      if (ev.type === "shots") { drawShots(ev.shots); continue; }
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

  /* WHICH BAYS ARE OPEN CHANGES; THE TILES DO NOT.

     The grid is built once per course and patched thereafter, so a
     class added inside tileClasses is a class applied at build time
     and never again -- the first version lit the bays from there and
     lit none of them, because at build time the draft had not reached
     the picking step. Toggled per render instead, over the docks
     only rather than all 192 squares. */
  function paintOpenBays() {
    var C = UI.course;
    if (!C || !UI.els || !UI.els.grid) return;
    var me = actor();
    var choosing = G.phase === "draft" && G.step === "pick" && me && isHuman(me) && !me.placed;
    for (var i = 0; i < C.docks.length; i++) {
      var d = C.docks[i];
      var cell = UI.els.grid.querySelector('[data-c="' + d.c + '"][data-r="' + d.r + '"]');
      if (!cell) continue;
      cell.classList.toggle("pr-bay-open", !!choosing && !robotAt(d.c, d.r));
    }
  }

  function updateAll() {
    if (UI.headless || !UI.mounted || !G) return;
    /* First, because mount() draws the board before it knows whether
       this is a new game or a resumed one -- so the wall layer's first
       honest chance to ask about the bumpers rule is here. */
    paintWalls(UI.course);
    snapshotPieces();
    renderPieces();
    playFlip();
    renderHud();
    renderPlayers();
    renderProgram();
    renderChoice();
    renderOptions();
    renderLiveryPick();
    renderCurtain();
    updateLog();
    drawBeams();
    paintOpenBays();
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
      /* Nothing to draw for a robot that has not picked a bay. */
      el.hidden = p.placed === false;
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
  /* READ EVERYTHING, THEN WRITE EVERYTHING, THEN ONE REFLOW.

     The first version did read-write-reflow per element inside the
     loop, so eight robots cost eight forced synchronous layouts on
     every render -- and a render happens on every queued animation
     beat, which is exactly when the board is meant to be smooth.

     Three passes instead. The browser lays out once, between pass two
     and pass three, because that is the only place anything reads. */
  function playFlip() {
    var nodes = UI.els.pieces.children, i, moves = [];

    // 1. read
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i], was = UI.prevRects[el.dataset.uid];
      if (!was) continue;
      var dx = was.x - el.offsetLeft, dy = was.y - el.offsetTop;
      if (!dx && !dy) continue;
      moves.push([el, dx, dy]);
    }
    if (!moves.length) return;

    // 2. write the offsets back
    for (i = 0; i < moves.length; i++) {
      moves[i][0].style.transition = "none";
      moves[i][0].style.transform =
        "translate(" + moves[i][1] + "px," + moves[i][2] + "px)";
    }

    // 3. one reflow for the whole set, then let them all run home
    void UI.els.pieces.offsetWidth;
    for (i = 0; i < moves.length; i++) {
      moves[i][0].style.transition = "";
      moves[i][0].style.transform = "";
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
        if (blocked(C, c, r, b.dir)) break;
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

  /* Long enough to read as a shot rather than a flicker, short enough
     that five of them at once are still one event. Scaled by the speed
     setting like every other motion. */
  var SHOT_MS = 420;

  function drawShots(shots) {
    var host = UI.els && UI.els.shots;
    if (!host) return;
    host.innerHTML = "";                           // also cancels a shot still fading
    if (!shots || !shots.length) return;
    var ms = delayFor(SHOT_MS), out = [];
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i], hue = LIVERIES[s.livery].a;
      /* Direction becomes a rotation about the muzzle, so one beam
         element serves all four facings and the length is a plain
         width the keyframes can grow. dir 1 (east) is the unrotated
         one, hence the -1. */
      out.push('<i class="pr-shot" style="--c:' + s.c + ";--r:" + s.r +
        ";--len:" + s.len + ";--rot:" + ((s.dir - 1) * 90) + "deg;--pr-shot-ms:" + ms +
        "ms;color:" + hue + '"></i>');
      out.push('<i class="pr-shot-burst" style="--c:' + s.hitC + ";--r:" + s.hitR +
        ";--pr-shot-ms:" + ms + "ms;color:" + hue + '"></i>');
    }
    host.innerHTML = out.join("");
  }

  /* WHICH COLOUR, ASKED ON THE BOARD.

     One seat at a time, over the course it is about to be raced on.
     The colours already spoken for by a seat that has chosen are shown
     and disabled rather than hidden: "taken" is a different answer
     from "not a colour", and a row that changes length between seats
     is a row you have to re-read. */
  function liveryBody(p) {
    var out = ['<h2>' + esc(humanSeats() > 1 ? "SEAT " + (p.id + 1) + ", PICK YOUR ROBOT" : "PICK YOUR ROBOT") + "</h2>"];
    out.push('<div class="pr-presets pr-liveries">');
    for (var lv = 0; lv < LIVERIES.length; lv++) {
      var taken = liveryLocked(lv);
      out.push('<button class="pr-livery' + (p.livery === lv ? " on" : "") +
        '" data-act="livery" data-n="' + lv + '"' + (taken ? " disabled" : "") +
        ' title="' + esc(LIVERIES[lv].name) + (taken ? " \u2014 taken" : "") + '">' +
        '<i class="pr-swatch" style="background:' + LIVERIES[lv].a + '"></i>' +
        esc(LIVERIES[lv].name) + "</button>");
    }
    out.push("</div>");
    out.push('<div class="pr-rule-desc">Your colour is also your name, on the board and in the log. ' +
      "The other racers take the rest. Everyone draws for position as soon as the colours are " +
      "settled, and then picks a starting bay." +
      (G.humanPrivilege ? " House rule: this keyboard picks its bays first." : "") + "</div>");
    return out.join("");
  }

  /* THE MODAL IS A FUNCTION OF THE STEP, and this is the only thing
     that opens or closes it. Closing it from the button that answers
     it would mean two owners and a race: the pick advances the
     machine, the machine settles, and what is on screen follows from
     where it settled -- the next seat, or nothing. */
  function renderLiveryPick() {
    var want = inPhase("draft", "livery") ? actor() : null;
    if (want && !isHuman(want)) want = null;
    if (!want) {
      if (UI.liveryFor !== null && UI.liveryFor !== undefined) {
        UI.liveryFor = null;
        if (modalOpen()) closeModal();
      }
      return;
    }
    if (UI.liveryFor === want.id && modalOpen()) return;
    UI.liveryFor = want.id;
    openModal(liveryBody(want), false);
  }

  function onLiveryPick(lv) {
    if (!inPhase("draft", "livery")) return;
    var p = actor();
    if (!p || !isHuman(p)) return;
    if (!takeLivery(p, lv)) return;
    /* Remembered as the default the NEXT game opens on, and only from
       the first seat -- otherwise a second player at the same keyboard
       quietly rewrites the first one's preference. */
    if (p.id === 0) { houseRules.livery = lv; saveRules(); }
    log(p.name + " takes the wheel");
    G.draft.liveryAt = p.id + 1;
    G.actor = undefined;
    announce("You are " + p.name + ".");
    advance();
  }

  /* What the draft is waiting for, in the one line the HUD has. The
     priority you drew is in it because that is WHY it is your turn --
     without it the order looks arbitrary. */
  function draftHeadline() {
    if (G.step === "livery") return "Picking robots";
    if (G.step === "draw") return "Drawing for position";
    var p = G.players[G.draft.order[G.draft.at]];
    if (!p) return "Taking positions";
    var pri = G.draft.cards[p.id];
    if (isHuman(p) && !p.placed) {
      return "Priority " + pri + " \u2014 click a lit bay to start there";
    }
    return p.name + " is choosing (priority " + pri + ")";
  }

  function renderHud() {
    var h = UI.els.hud;
    var phase = G.gameOver ? "Game over"
      : G.phase === "draft" ? draftHeadline()
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
  /* THE QUARTER TURN, as one drawing used in two places.

     Up the card is where the robot is pointing now. The line runs up,
     turns the corner, and leaves sideways under an arrowhead pointing
     the way you will be facing -- so the picture is the before and the
     after, in that order.

     The corner turns only once the line is well clear of the
     arrowhead's wings. Bending it earlier puts the curve inside the
     chevron and the two read as one smudge at card size, which is the
     size that matters.

     An arc was tried first and was worse: a quarter circle says
     "ninety degrees of something" without saying of what, and both
     cards came out as the same gesture mirrored rather than as two
     directions. The same objection applies to the loop glyphs the
     course stage used to turn boards with, which is why it draws
     this instead -- one shape, so the card and the control cannot
     come to mean different things. */
  function turnArrow(cw) {
    var TIP = cw ? 80 : 20, Y = 42;
    var rise = cw ? 32 : 68;                 // the upright, on the far side
    var corner = cw ? 46 : 54;               // where the bend finishes
    var shaftEnd = cw ? 67 : 33;             // the chevron's back
    return '<path class="pr-cshaft" d="M' + rise + " 80L" + rise + " 56Q" + rise + " " + Y +
      " " + corner + " " + Y + "L" + shaftEnd + " " + Y + '"/>' +
      chev(TIP, Y, cw ? 1 : -1, 0, 13, "pr-cmark");
  }

  function turnIcon(cw) {
    /* pr-quarter and not pr-turn: pr-turn is already the gear art's
       arc, and a chrome class that an SVG path also answers to restyles
       every gear on every board. */
    return '<svg class="pr-quarter" viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
      turnArrow(cw) + "</svg>";
  }

  function cardArt(kind) {
    var d = CARD_KINDS[kind], i, out = [];
    if (d.move) {
      /* ONE ARROW PER SQUARE, SIDE BY SIDE.

         The first version stacked the chevrons along a single shaft,
         which draws a Move 3 as one arrow with three barbs -- a heavier
         arrow, not three of them. Read at card size that says "forward,
         emphatically" and leaves the player counting barbs to find the
         distance, which is the one number on the card that has to be
         read at a glance.

         Backing up is the same arrow the other way round, because that
         is what the move is: the robot does not turn to do it.

         Spacing and head size come from a table rather than a formula.
         Three arrows have to clear each other at a 34px render with an
         8px stroke, and the width that works there is not the width a
         formula built from the count would give. */
      var dir = d.move > 0 ? -1 : 1, n = Math.abs(d.move);
      var LAY = { 1: { gap: 0, head: 15 }, 2: { gap: 32, head: 13 }, 3: { gap: 29, head: 11 } };
      var lay = LAY[n] || LAY[1];
      var tip = 50 + dir * 32, tail = 50 - dir * 30;
      for (i = 0; i < n; i++) {
        var x = 50 + (i - (n - 1) / 2) * lay.gap;
        out.push('<path class="pr-cshaft" d="M' + x.toFixed(1) + " " + tail +
                 "L" + x.toFixed(1) + " " + (tip - dir * 7) + '"/>');
      }
      /* Heads last, so every one of them sits over every shaft rather
         than over its own only -- at three abreast the wings overlap
         the neighbouring shaft and the order is visible. */
      for (i = 0; i < n; i++) {
        out.push(chev(50 + (i - (n - 1) / 2) * lay.gap, tip, 0, dir, lay.head, "pr-cmark"));
      }
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
      out.push(turnArrow(d.turn > 0));
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
    /* No hand exists before the first deal, so the programming row is
       hidden rather than drawn empty -- an empty row of five slots
       during the draft looks like something you failed to fill in. */
    if (UI.els.program) UI.els.program.hidden = G.phase === "draft";
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

    /* THE REGISTERS ON SCREEN ARE THE REGISTERS IN THE SAVE.

       assertInvariants guards the state and says nothing about the
       DOM, so a render that leaves a card behind -- or draws one that
       is not there -- is invisible to every check in the file. That is
       the shape of the bug reports this row keeps producing: "putting
       a card in adds one to the next register". Twice now the state
       has been correct and the complaint has been about what was on
       screen.

       So the row checks itself, every render, in play as well as in
       tests. It cannot fix anything -- by the time it runs the damage
       is done -- but it turns "seems to" into a line in the log naming
       the register and both cards, which is the difference between a
       bug that can be chased and one that cannot. */
    for (i = 0; i < REGISTERS; i++) {
      var wantC = me ? me.registers[i] : null;
      var cards = UI.slotEls[i].querySelectorAll(".pr-card");
      var gotC = cards.length ? cards[0].dataset.card : "";
      if (cards.length > 1 || gotC !== (wantC === null ? "" : String(wantC))) {
        log("RENDER BUG: register " + (i + 1) + " holds " +
            (wantC === null ? "nothing" : "card " + wantC) + " but shows " +
            (cards.length === 0 ? "nothing"
             : cards.length > 1 ? cards.length + " cards"
             : "card " + gotC));
      }
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

  /* A HAND THAT DOES NOT MOVE UNDER YOU.

     Cards used to be dealt in draw order and pushed back on the END
     when they came out of a register, so taking one card back
     reshuffled everything after it. You would pull a card out of
     register 2, click the card you wanted instead, and a different one
     would go in -- because the hand had rearranged itself between the
     look and the click. The cards were never wrong; the positions were.

     Sorting by printed priority fixes it for good: the order is the
     same every time, so a card returned to the hand goes back exactly
     where it came from, and the hand reads the way a player would lay
     it out on the table anyway. */
  function handOrder(p) {
    p.hand.sort(function (a, b) { return card(a).pri - card(b).pri; });
    return p.hand;
  }

  function toHand(p, id) {
    p.hand.push(id);
    handOrder(p);
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
    if (p.registers[slotIndex] !== null) toHand(p, p.registers[slotIndex]);
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

  /* Take the bay under the pointer, if it is one and it is free. A
     click anywhere else on the board is not an error -- it is a
     player looking at the course they are about to race on. */
  function onDraftPick(c, r) {
    var p = actor();
    if (!p || !isHuman(p) || p.placed) return;
    var free = freeBays();
    for (var i = 0; i < free.length; i++) {
      if (free[i].c === c && free[i].r === r) {
        takeBay(p, free[i]);
        G.draft.at++;
        G.actor = undefined;
        sfx("place");
        announce("You start on bay " + free[i].n + ".");
        updateAll();
        advance();
        return;
      }
    }
  }

  function onCardClick(i) { placeCard(i, undefined); }

  function onSlotClick(i) {
    var p = actor();
    if (!inPhase("turn", "program") || !p) return;
    if (i >= openRegisters(p.damage)) return;        // locked registers are not yours to change
    if (p.registers[i] === null) return;
    toHand(p, p.registers[i]);
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
      toHand(p, p.registers[i]);
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
  function gameOpts(base, courseId, spec) {
    var cfg = resolveConfig(houseRules);
    return {
      course: courseId,
      courseSpec: spec || null,
      players: cfg.players, humans: cfg.humans,
      skill: cfg.skill, startOptions: cfg.startOptions,
      flagTouch: cfg.flagTouch, bumpers: cfg.bumpers, ruleset: cfg.ruleset,
      livery: cfg.livery, bay: cfg.bay, humanPrivilege: cfg.humanPrivilege
    };
  }

  function chosenCourse(base) {
    if (base && base.course) return base.course;
    if (houseRules && B.COURSES[houseRules.course]) return houseRules.course;
    return "provingRun";
  }

  /* A composed course is not in COURSES, so the usual "did the course
     change" test has nothing to compare -- the whole mount is rebuilt
     and the game started from the spec. */
  function startComposed(spec) {
    stopQueue();
    clearSave();
    UI.wallsChecked = false;
    UI.curtainCleared = null;
    UI.composed = spec;
    mount(UI.els.host, { courseSpec: spec });
  }

  function onNewGame() {
    stopQueue();
    clearSave();
    UI.wallsChecked = false;
    UI.curtainCleared = null;
    /* "New game" means another race on the course already on the
       table, so a composed one is re-run from the spec it was built
       from rather than resolved by name -- a name a course laid out by
       hand does not have. */
    if (UI.opts && UI.opts.courseSpec) {
      newGame((Math.random() * 1e9) | 0, gameOpts(UI.opts, UI.course.id, UI.opts.courseSpec));
      UI.beams = null;
      hideBanner();
      updateAll();
      advance();
      return;
    }
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
    /* A right-click menu closes on the next thing you do, whatever
       that is -- including the thing you opened it for. */
    if (UI.layMenu) UI.layMenu = null;
    if (a === "setup") { showSetup(); return; }
    if (a === "wstep") { wizGo(+el.dataset.n); return; }
    if (a === "wback") { wizGo((UI.wizStep || 0) - 1); return; }
    if (a === "wnext") {
      var at = UI.wizStep || 0;
      if (wizBlocker(at)) { showWizard(); return; }
      if (at < wizLast()) { saveRules(); saveLayout(); wizGo(at + 1); return; }
      /* THE WAY OUT OF THE SET-UP IS THE WORKSHOP, every time. The
         course is assembled but it has no flags on it and nobody has
         looked at it square by square; both of those live in there,
         and so does the button that starts the race. */
      saveRules(); saveLayout();
      openWorkshop();
      return;
    }
    if (a === "lcourse") {
      /* A shipped course loads INTO the grid rather than bypassing it,
         so every race goes through the same three screens. */
      var lay = B.layoutFromCourse(el.dataset.c);
      if (lay) {
        UI.layout = lay;
        UI.layout.pick = { mode: "default", hand: [] };
        UI.heldBoard = null;
        UI.heldAt = null;
        houseRules.course = el.dataset.c;
        syncRulesetToCourse();
        saveRules(); saveLayout();
      }
      showWizard(); return;
    }
    if (a === "help") { showHelp(); return; }
    if (a === "closemodal") { closeModal(); return; }
    if (a === "helptab") { showHelp(el.dataset.tab); return; }
    if (a === "preset") {
      var pre = DIFFICULTY_PRESETS[el.dataset.name];
      for (var k in pre) houseRules[k] = pre[k];
      saveRules(); showWizard(); return;
    }
    if (a === "ruleset") {
      houseRules.ruleset = el.dataset.r;
      /* Switching rulebook can strand you on a course the new one
         cannot read, so move to the first it can. Leaving the old
         selection in place would let Start run a course the ruleset
         has no squares for. */
      if (!courseAllowed(houseRules.course, houseRules.ruleset)) {
        for (var cid3 in B.COURSES) {
          if (cid3.charAt(0) === "_") continue;
          if (courseAllowed(cid3, houseRules.ruleset)) { houseRules.course = cid3; break; }
        }
      }
      saveRules(); showWizard(); return;
    }
    if (a === "rule" && el.dataset.v !== undefined) {
      houseRules[el.dataset.k] = clampRule(el.dataset.k, +el.dataset.v);
      /* Fewer robots than seats is not a game, so the dependent
         setting follows rather than being silently clamped at start. */
      if (el.dataset.k === "players" && houseRules.humans > houseRules.players) {
        houseRules.humans = houseRules.players;
      }
      saveRules(); showWizard(); return;
    }
    if (a === "livery") { onLiveryPick(+el.dataset.n); return; }
    if (a === "layout") { wizGo(1); return; }
    if (a === "lhold") {
      /* Clicking the held board again puts it down, so the pointer
         user is never stuck holding something. Picking one off the
         shelf also drops whatever was being carried off the stage:
         you have one pair of hands. */
      UI.heldBoard = UI.heldBoard === el.dataset.b ? null : el.dataset.b;
      UI.heldAt = null;
      showWizard(); return;
    }
    if (a === "lgrab") {
      var gi = +el.dataset.i;
      UI.heldAt = UI.heldAt === gi ? null : gi;
      UI.heldBoard = null;
      showWizard(); return;
    }
    if (a === "lmenuclose") { showWizard(); return; }
    if (a === "ldrop") {
      var dat = +el.dataset.at;
      if (UI.heldAt !== null && UI.heldAt !== undefined) {
        layoutMove(UI.heldAt, dat);
        UI.heldAt = null;
      } else if (UI.heldBoard) {
        layoutPut(dat, UI.heldBoard);
        /* The board stays in hand: filling the grid with copies of one
           board should not be nine trips to the shelf. */
        if (!B.laySlots(layoutNow().cells).length) UI.heldBoard = null;
      } else return;
      saveLayout(); showWizard(); return;
    }
    if (a === "ldock") { layoutDockTo(+el.dataset.c); saveLayout(); showWizard(); return; }
    if (a === "lrot" || a === "lrotr") { layoutTurn(+el.dataset.i, 1); saveLayout(); showWizard(); return; }
    if (a === "lrotl") { layoutTurn(+el.dataset.i, -1); saveLayout(); showWizard(); return; }
    if (a === "lundo") { if (layoutUndo()) { saveLayout(); } showWizard(); return; }
    if (a === "ldropedit") { layoutDropEdit(); saveLayout(); showWizard(); return; }
    if (a === "libopen") { if (libOpen(el.dataset.i)) openWorkshop(); return; }
    if (a === "libplay") {
      if (!libOpen(el.dataset.i)) return;
      var libWhy = flagProblem();
      if (libWhy) { announce(libWhy); showWizard(); return; }
      saveRules();
      closeModal();
      startComposed(layoutCourse(flagsResolved()));
      return;
    }
    if (a === "libdrop") { libDrop(el.dataset.i); showWizard(); return; }
    if (a === "lempty") {
      layoutMark();
      for (var ec = 0; ec < B.LAY_BOARDS; ec++) layoutNow().cells[ec] = null;
      UI.heldAt = null;
      saveLayout(); showWizard(); return;
    }
    if (a === "lclear") {
      var ci = +el.dataset.i;
      layoutDrop(ci);
      /* Indices shift when one is taken out, so a board being carried
         is put down rather than left pointing at its neighbour. */
      UI.heldAt = null;
      saveLayout(); showWizard(); return;
    }
    if (a === "editmap") {
      closeModal();
      root.location.hash = "#edit=" + el.dataset.b + "&from=setup";
      edMount(UI.els.host, el.dataset.b, true);
      return;
    }
    if (a === "resetmaps") {
      B.clearOverride();
      saveHouseBoards();
      syncRulesetToCourse();
      saveRules();
      showWizard();
      return;
    }
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

  /* ONCE PER HOST, NOT ONCE PER MOUNT.

     mount() clears the host with innerHTML = "", which destroys the
     children and leaves every listener on the HOST itself exactly
     where it was. So a second mount on the same element used to bind a
     second full set, a third a third, and every click then dispatched
     as many times as the game had been mounted.

     Dragging hid it. A drop nulls UI.drag, so the repeat calls returned
     early and a dragged card landed once. A CLICK places into
     firstEmpty, so the repeat placed the next card into the next
     register -- "putting a card in adds one to the following register",
     reported twice and not reproducible until you re-mounted first.

     Three paths re-mount: changing the course, leaving the map editor,
     and test play. All three are ordinary things to do before your
     first card. */
  function setupInput(root) {
    if (root.__prWired) return;
    root.__prWired = true;

    /* RIGHT-CLICK ON A BOARD. The same three things the corner
       controls offer, put under the pointer, because that is where a
       right-click expects to find them. The position is recorded
       against the STAGE rather than the window, so the menu stays put
       when the render that draws it moves nothing else. */
    root.addEventListener("contextmenu", function (e) {
      var bd = e.target.closest(".pr-lay-board");
      if (!bd || !bd.parentNode) return;
      e.preventDefault();
      var box = bd.parentNode.getBoundingClientRect();
      UI.layMenu = { i: +bd.dataset.i,
                     x: Math.round(e.clientX - box.left),
                     y: Math.round(e.clientY - box.top) };
      UI.heldAt = +bd.dataset.i;
      UI.heldBoard = null;
      showWizard();
    });

    root.addEventListener("click", function (e) {
      /* Anywhere that is not the menu closes it, including a click on
         the board it belongs to. */
      if (UI.layMenu && !e.target.closest(".pr-lay-menu") && !e.target.closest("[data-act]")) {
        UI.layMenu = null;
        showWizard();
        return;
      }
      /* During the draft the BOARD is the control: the bays you may
         take are lit, and you take one by clicking it. A modal listing
         "bay 1, bay 2, bay 3" would be asking you to pick a square
         from a list while the square is right there. */
      var cell = e.target.closest(".pr-cell[data-c]");
      if (cell && G && G.phase === "draft" && G.step === "pick") {
        onDraftPick(+cell.dataset.c, +cell.dataset.r);
        return;
      }
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
      /* The assembler rides the same channel the program cards do:
         what is being dragged lives on UI, because Safari will not let
         a dragover handler read dataTransfer. */
      var pal = e.target.closest(".pr-pal[draggable=true]");
      var lb = e.target.closest(".pr-lboard[draggable=true]");
      if (pal || lb) {
        /* "lslot" and not "slot": a program card dragged out of a
           register is also {from:"slot", i}, and the two drags share
           one dragover handler. Telling them apart by shape alone is
           what left placed boards undraggable. */
        UI.drag = pal ? { from: "palette", board: pal.dataset.b }
                      : { from: "lslot", i: +lb.dataset.i };
        /* The pointer route shows the same landing places the keyboard
           route shows -- one model, two gestures -- but PAINTED IN
           rather than re-rendered: rebuilding the element a drag began
           on cancels the drag. */
        paintSlots();
        (pal || lb).classList.add("pr-dragging");
        try {
          e.dataTransfer.setData("text/plain", "board");
          e.dataTransfer.effectAllowed = "move";
        } catch (err) {}
        return;
      }
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
      /* A drag that ended without a drop takes the landing places
         away again -- the stage must not keep offering them for
         something nobody is holding. */
      if (dragKind() === "board") clearSlots();
      UI.drag = null;
      var was = root.querySelectorAll(".pr-dragging,.pr-over");
      for (var i = 0; i < was.length; i++) was[i].classList.remove("pr-dragging", "pr-over");
    });
    root.addEventListener("dragover", function (e) {
      if (!UI.drag) return;
      if (dragKind() === "board") {
        var ls = e.target.closest(".pr-lay-slot");
        if (!ls) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        ls.classList.add("pr-over");
        return;
      }
      var slot = e.target.closest(".pr-slot");
      if (!slot) return;
      e.preventDefault();                       // preventDefault here is what ALLOWS the drop
      e.dataTransfer.dropEffect = "move";
      if (!slot.classList.contains("pr-over")) slot.classList.add("pr-over");
    });
    root.addEventListener("dragleave", function (e) {
      var slot = e.target.closest(".pr-slot,.pr-lay-slot");
      if (slot) slot.classList.remove("pr-over");
    });
    root.addEventListener("drop", function (e) {
      if (!UI.drag) return;
      var ls = e.target.closest(".pr-lay-slot");
      if (ls && UI.layout && dragKind() === "board") {
        e.preventDefault();
        var dat = +ls.dataset.at;
        if (!isNaN(dat)) {
          if (UI.drag.from === "palette") layoutPut(dat, UI.drag.board);
          else layoutMove(UI.drag.i, dat);
          UI.drag = null;
          UI.heldBoard = null;
          UI.heldAt = null;
          saveLayout();
          showWizard();
          return;
        }
      }
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
      showWizard();
    });
    root.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (modalOpen()) {
        if (segmentKey(e)) return;
        trapFocus(e);
        if (e.key === "Escape") {
          if (layEscape()) { e.preventDefault(); showWizard(); return; }
          if (UI.modalDismissable) { e.preventDefault(); closeModal(); }
        }
        return;
      }

      /* A curtain that only covers the screen is not a curtain: the
         delegated key handler has no idea anything is over it, and
         "3" would still program the previous player's card. */
      if (curtainUp()) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onReady(); }
        return;
      }

      /* Arrows belong to the board whenever the board has focus, and
         to nothing else -- they must not steal from a focused slider. */
      if (document.activeElement && document.activeElement.getAttribute &&
          document.activeElement.getAttribute("role") === "gridcell") {
        var moved = false;
        if (e.key === "ArrowRight") moved = moveGridFocus(1, 0);
        else if (e.key === "ArrowLeft") moved = moveGridFocus(-1, 0);
        else if (e.key === "ArrowDown") moved = moveGridFocus(0, 1);
        else if (e.key === "ArrowUp") moved = moveGridFocus(0, -1);
        else if (e.key === "Home") moved = moveGridFocus(-1, 0, true);
        else if (e.key === "End") moved = moveGridFocus(1, 0, true);
        if (moved || /^(Arrow|Home|End)/.test(e.key)) { e.preventDefault(); return; }
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
  /* A SLIDER IS FOR A RANGE YOU DO NOT NEED TO HIT EXACTLY.

     None of these is that. The widest is seven values and every one of
     them means something specific -- six robots is a decision, not a
     point on a continuum -- so a slider made the player drag for a
     number they could have pressed, and hid the named values behind a
     position. Each def now says which control it wants; `slider`
     remains implemented for the first setting that genuinely has a
     wide range, and nothing currently uses it.

       segment  discrete values, drawn as a radio group. `labels`
                names them; without it they draw as numbers.
       toggle   a boolean, drawn as a switch.
       slider   a range. Unused today, kept working.
  */
  var SLIDER_DEFS = {
    players: { label: "Robots", control: "segment", min: 2, max: 8, def: 4,
               desc: "How many robots are in the race." },
    humans: { label: "Humans", control: "segment", min: 1, max: 8, def: 1, maxFrom: "players",
              desc: "Seats played at this keyboard. More than one turns on pass-and-play." },
    skill: { label: "Rival skill", control: "segment", min: 0, max: 2, def: 1, harder: true,
             labels: ["Scrapyard", "Circuit", "Grand Prix"],
             desc: "How far ahead the bots look when they program." },
    startOptions: { label: "Starting options", control: "segment", min: 0, max: 3, def: 0,
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
    /* The draft is the fair way to hand out the dock and it can hand
       you the worst bay on the board. This is the escape hatch, named
       for what it is rather than dressed up as a rule. */
    humanPrivilege: { label: "Human privilege", control: "toggle", min: 0, max: 1, def: 0, group: "house",
                      labels: ["Priority decides, same as everyone", "You choose your bay first"],
                      desc: "Off, the priority draw decides the order and you take your turn in it. On, the seats at this keyboard pick before the bots whatever they drew." },

    /* Bumpers turn the edge of the play area into a wall. The edge is
       not a wall in the printed game -- it is the commonest way to
       lose a robot, and a good deal of the tension of an express belt
       running toward it -- so this is a house rule and off by default.
       With it on, the void beyond the boards stops a robot the way a
       wall does, which also means it stops the whole push chain. */
    bumpers: { label: "Bumpers", control: "toggle", min: 0, max: 1, def: 0, group: "house",
               labels: ["The edge of the course is a fall", "A rail runs round the play area"],
               desc: "Off, walking off the boards scraps a robot exactly as a pit does. On, the play area is fenced and nothing can be driven, shoved or carried over the edge." },

    flagTouch: { label: "Touching a flag", control: "segment", min: 0, max: 1, def: 0, group: "house",
                 labels: ["Must end a register on it", "Crossing it counts"],
                 desc: "The English manual wants you to stop on a flag. The German Crash and Burn book counts crossing it. Euro style is the looser one." }
  };

  var DIFFICULTY_PRESETS = {
    Solo: { players: 4, humans: 1, skill: 0, startOptions: 0 },
    Race: { players: 4, humans: 1, skill: 1, startOptions: 0 },
    "Grand Prix": { players: 6, humans: 1, skill: 2, startOptions: 1 },
    "Pass-and-play": { players: 4, humans: 2, skill: 1, startOptions: 0 }
  };

  /* THE RULEBOOKS.

     One entry per EDITIONS key in the board module -- validateTables
     asserts that, because a ruleset nobody can print a board for and a
     board nobody can read are the same bug seen from two ends.

     `built` is the honest field. RoboRally was reprinted in 2016 as a
     substantially different game: priority antenna instead of printed
     card priorities, SPAM cards instead of damage tokens, an energy and
     upgrade shop instead of option cards, and no repair or upgrade
     squares at all. None of that is implemented. It appears in the menu
     ANYWAY, greyed with the reason, because a menu that silently omits
     half the game tells you nothing, while one that offers it and then
     plays the wrong rules is worse than either. */
  var RULESETS = {
    classic: { name: "Classic", years: "1994-2005", built: true,
               blurb: "Priorities printed on the cards, damage tokens, option cards, " +
                      "and repair and upgrade squares on the floor." },
    modern: { name: "Modern", years: "2016-", built: false,
              blurb: "Priority antenna, SPAM damage cards, an energy and upgrade shop. " +
                     "Not built: no board here can be read by it yet either." }
  };

  function rulesetOf(h) { return RULESETS[h && h.ruleset] ? h.ruleset : "classic"; }

  /* AN EXPANSION TILE TURNS ITS RULESET ON.

     Drop a flame jet on a map and that map is a Crash and Burn map;
     there is no coherent third option. The alternative -- refusing the
     edit, or letting it sit there inert -- both end with the board
     showing something the rules do not do, which is the one thing the
     edition check exists to prevent.

     Returns the ruleset it moved to, or null if nothing had to change. */
  function syncRulesetToCourse() {
    var cur = rulesetOf(houseRules);
    if (courseAllowed(houseRules.course, cur)) return null;
    var ok = B.playableEditions(houseRules.course);
    for (var i = 0; i < ok.length; i++) {
      if (RULESETS[ok[i]] && RULESETS[ok[i]].built) {
        houseRules.ruleset = ok[i];
        return ok[i];
      }
    }
    return null;
  }

  /* A course is offerable under a ruleset when the ruleset exists, is
     built, and every square on the course is printed by that edition. */
  function courseAllowed(courseId, ruleset) {
    var rs = RULESETS[ruleset];
    if (!rs || !rs.built) return false;
    return B.playableEditions(courseId).indexOf(ruleset) >= 0;
  }

  var RULES_KEY = "pumarally_rules_v1";
  /* Edited boards, kept apart from the rules because they are a
     different kind of thing and a corrupt one must not take the rules
     down with it. */
  var HOUSE_KEY = "pumarally_house_boards_v1";

  function saveHouseBoards() {
    try {
      var out = {}, ids = B.overrideIds();
      for (var i = 0; i < ids.length; i++) out[ids[i]] = B.specOf(ids[i]);
      if (ids.length) localStorage.setItem(HOUSE_KEY, JSON.stringify(out));
      else localStorage.removeItem(HOUSE_KEY);
    } catch (e) {}
  }

  /* A house board that no longer parses -- the shipped board it edits
     was corrected under it, say -- is DROPPED, not repaired and not
     fatal. Refusing to start because of a stale scribble would be the
     wrong trade; playing the shipped board and saying so is right. */
  function loadHouseBoards() {
    var dropped = [];
    try {
      var raw = JSON.parse(localStorage.getItem(HOUSE_KEY) || "null");
      if (!raw) return dropped;
      for (var id in raw) {
        try { B.setOverride(id, raw[id]); }
        catch (e) { dropped.push(id); }
      }
    } catch (e) {}
    if (dropped.length) saveHouseBoards();
    return dropped;
  }
  var houseRules = {};

  function defaultRules() {
    var out = {};
    for (var k in SLIDER_DEFS) out[k] = SLIDER_DEFS[k].def;
    out.course = "provingRun";          // a choice, not a range
    out.ruleset = "classic";            // likewise
    /* YOUR robot: which livery it wears and which bay it launches from.
       Both are indices into things the course decides, so they are
       clamped rather than defaulted when a course has fewer bays. */
    out.livery = 0;
    out.bay = 1;
    return out;
  }

  function loadRules() {
    var out = defaultRules();
    try {
      var s = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
      for (var k in out) if (s && SLIDER_DEFS[k] && typeof s[k] === "number") out[k] = clampRule(k, s[k]);
      if (s && typeof s.livery === "number") out.livery = Math.max(0, Math.min(LIVERIES.length - 1, s.livery | 0));
      if (s && typeof s.bay === "number") out.bay = Math.max(1, Math.min(MAX_SEATS, s.bay | 0));
      if (s && s.course && B.COURSES[s.course]) out.course = s.course;
      if (s && RULESETS[s.ruleset]) out.ruleset = s.ruleset;
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
      ruleset: rulesetOf(h),
      players: players,
      humans: Math.min(players, clampRule("humans", h.humans)),
      skill: clampRule("skill", h.skill),
      startOptions: clampRule("startOptions", h.startOptions),
      flagTouch: clampRule("flagTouch", h.flagTouch),
      bumpers: clampRule("bumpers", h.bumpers),
      livery: Math.max(0, Math.min(LIVERIES.length - 1, (h.livery | 0))),
      bay: Math.max(1, Math.min(MAX_SEATS, h.bay || 1)),
      humanPrivilege: clampRule("humanPrivilege", h.humanPrivilege)
    };
  }

  /* ONE SETTING, DRAWN AS WHATEVER IT ACTUALLY IS.

     A radio group is a group: it needs a role, a label, and arrow keys
     that move between its options rather than out of them. The browser
     gives all three to <input type=radio> and none of them to a row of
     buttons, so a row of buttons has to say so itself. */
  function ruleControl(k, d, v) {
    var ctl = d.control || "slider";
    var shown = d.labels ? d.labels[v] : v;
    var head = '<div class="pr-rule"><div class="pr-rule-head"><b>' + esc(d.label) + "</b>" +
      '<span class="pr-rule-val">' + esc(String(shown)) +
      (d.harder && v > d.def ? ' <i class="pr-harder">harder</i>' : "") + "</span></div>";
    var foot = '<div class="pr-rule-desc">' + esc(d.desc) + "</div></div>";
    var body, i;

    if (ctl === "toggle") {
      body = '<button class="pr-switch' + (v ? " on" : "") + '" data-act="rule" data-k="' + k +
        '" data-v="' + (v ? 0 : 1) + '" role="switch" aria-checked="' + (v ? "true" : "false") +
        '"><i class="pr-switch-dot"></i>' + esc(d.labels ? d.labels[v] : (v ? "On" : "Off")) + "</button>";
      return head + body + foot;
    }

    if (ctl === "segment") {
      /* An option above another setting's value is shown and DISABLED
         rather than hidden: "six humans needs six robots" is a thing
         worth seeing, and a row that changes length as you move a
         different setting is a row you cannot aim at. */
      var cap = d.maxFrom ? Math.min(d.max, houseRules[d.maxFrom]) : d.max;
      body = '<div class="pr-seg" role="radiogroup" aria-label="' + esc(d.label) + '">';
      for (i = d.min; i <= d.max; i++) {
        var on = v === i, off = i > cap;
        body += '<button class="pr-seg-b' + (on ? " on" : "") + '" data-act="rule" data-k="' + k +
          '" data-v="' + i + '" role="radio" aria-checked="' + (on ? "true" : "false") + '"' +
          (off ? " disabled" : "") + ' tabindex="' + (on ? "0" : "-1") + '">' +
          esc(String(d.labels ? d.labels[i] : i)) + "</button>";
      }
      return head + body + "</div>" + foot;
    }

    return head + '<input type="range" data-act="rule" data-k="' + k + '" min="' + d.min +
      '" max="' + d.max + '" value="' + v + '" aria-label="' + esc(d.label) + '">' + foot;
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

  /* The WAI-ARIA radiogroup pattern: arrows move WITHIN the group and
     select as they go, so the group is one tab stop and the options
     are reached with the keys that look like they should reach them.
     Without this, Tab walked through every option of every setting --
     twenty-six stops to cross the setup screen. */
  function segmentKey(e) {
    var cur = document.activeElement;
    if (!cur || !cur.parentNode || cur.getAttribute("role") !== "radio") return false;
    var step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
             : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return false;
    e.preventDefault();
    var opts = [].slice.call(cur.parentNode.querySelectorAll('[role="radio"]'))
                 .filter(function (b) { return !b.disabled; });
    var at = opts.indexOf(cur);
    if (at < 0) return true;
    var next = opts[(at + step + opts.length) % opts.length];
    if (next && next !== cur) {
      /* Re-rendered by the dispatch, so focus is restored by value
         rather than by element -- the element is about to be gone. */
      UI.refocusRule = { k: next.dataset.k, v: next.dataset.v };
      next.click();
    }
    return true;
  }

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
  /* A COURSE THUMBNAIL: the board itself, small.

     It reuses tileClasses, tileInner and wallSpans rather than growing
     a second renderer, so a thumbnail cannot drift from the board it
     previews -- change a pusher's art and the menu changes with it.

     Cached, because the setup modal rebuilds on every click and a
     course is 12x16 tiles of real SVG; building ten of those per
     keystroke is the difference between a menu and a slideshow. The
     cache is keyed by course id and cleared when the art could have
     changed, which in practice is never during a session.

     Multi-board runs need nothing here: buildCourse already lays out
     however many boards a course names, so a joined run will thumbnail
     itself at whatever size it comes out. */
  function courseThumb(id) {
    UI.thumbs = UI.thumbs || {};
    if (UI.thumbs[id]) return UI.thumbs[id];
    var C;
    try { C = B.buildCourse(id); } catch (e) { return ""; }
    var px = C.w > 12 ? 5 : 7;                 // a two-board run gets smaller tiles, not a wider menu
    var cells = [], c, r;
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        cells.push('<i class="' + tileClasses(C, c, r).join(" ") + '">' + tileInner(C, c, r) + "</i>");
      }
    }
    var html =
      '<span class="pr-thumb" style="--tile:' + px + "px;--wt:" + Math.max(2, Math.round(px / 2.5)) +
        "px;width:" + (C.w * px) + "px;height:" + (C.h * px) + 'px">' +
        '<span class="pr-thumb-grid" style="grid-template-columns:repeat(' + C.w + "," + px + 'px)">' +
          cells.join("") + "</span>" +
        '<span class="pr-thumb-walls">' + wallSpans(C) + "</span>" +
      "</span>";
    UI.thumbs[id] = html;
    return html;
  }

  /* A SINGLE BOARD, ROTATED, at thumbnail size. courseThumb draws a
     whole course and cannot show one board turned -- which is most of
     what the assembler needs to show. Cached on id, rotation and
     scale, because nine boards times four rotations is a lot of DOM
     to rebuild on every drag. */
  /* One picture renderer for anything grid-shaped -- a single board in
     the palette, or a whole assembled course on the flag screen. It is
     the game's own tileClasses and tileInner at a smaller tile, so
     there is no second drawing of a board to drift from the first. */
  function gridThumb(g, px, over) {
    /* tileInner walks flags and lasers; a bare grid has lasers and no
       flags, so it is given the empty list the renderer expects. */
    g.flags = g.flags || [];
    var cells = [], c, r;
    for (r = 0; r < g.h; r++) {
      for (c = 0; c < g.w; c++) {
        cells.push('<i class="' + tileClasses(g, c, r).join(" ") + '">' + tileInner(g, c, r) + "</i>");
      }
    }

    /* AN OVERLAY, NOT A SECOND RENDERER.

       The tiles are the game's own drawing of the board and stay
       exactly that. What goes on top of them is two things the picture
       cannot say at this size: which squares can be clicked, and which
       ones hold a flag. The tile art draws a flag faithfully -- at a
       22px tile that is an 11px banner with a 5px numeral on it, in
       the same amber as every conveyor arrow around it, which is how
       "click the squares in order" became a guessing game. So the
       number is drawn again, large, over the square it belongs to. */
    var hits = "";
    if (over) {
      hits = ['<span class="pr-thumb-hits' + (over.act ? "" : " pr-no-hits") +
        '" style="grid-template-columns:repeat(' + g.w + "," + px + 'px)">'];
      for (r = 0; r < g.h; r++) {
        for (c = 0; c < g.w; c++) {
          var mark = over.marks ? over.marks[c + "," + r] : 0;
          var body = mark ? "<b>" + mark + "</b>" : "";
          if (!over.act) {
            hits.push('<span class="pr-thumb-hit' + (mark ? " mark" : "") + '">' + body + "</span>");
            continue;
          }
          var can = over.legal[r * g.w + c] || mark;
          hits.push('<button class="pr-thumb-hit' + (can ? "" : " no") + (mark ? " mark" : "") +
            '" data-act="' + over.act + '" data-c="' + c + '" data-r="' + r + '"' +
            (can ? "" : " disabled") +
            ' aria-label="' + esc((mark ? "flag " + mark + ", " : "") + describeTile(g, c, r)) +
            '">' + body + "</button>");
        }
      }
      hits.push("</span>");
      hits = hits.join("");
    }
    return '<span class="pr-thumb' + (over && over.act ? " pr-thumb-pick" : "") +
        '" style="--tile:' + px + "px;--wt:" + Math.max(2, Math.round(px / 2.5)) +
        "px;width:" + (g.w * px) + "px;height:" + (g.h * px) + 'px">' +
        '<span class="pr-thumb-grid" style="grid-template-columns:repeat(' + g.w + "," + px + 'px)">' +
          cells.join("") + "</span>" +
        '<span class="pr-thumb-walls">' + wallSpans(g) + "</span>" + hits +
      "</span>";
  }

  function boardThumb(id, rot, px) {
    UI.bthumbs = UI.bthumbs || {};
    var key = id + ":" + rot + ":" + px;
    if (UI.bthumbs[key]) return UI.bthumbs[key];
    var g;
    try { g = B.rotateGrid(B.parsePic(id, B.specOf(id)), rot || 0); }
    catch (e) { return ""; }
    UI.bthumbs[key] = gridThumb(g, px, null);
    return UI.bthumbs[key];
  }

  /* ============================================================
     THE COURSE ASSEMBLER

     A layout is a grid of slots plus which column the dock sits
     under. Boards are all 12x12 so a slot IS a board position -- there
     is no free placement to snap, because there is nowhere else a
     board could go. That is why this is a grid of drop targets rather
     than a canvas with collision.

     Every gesture has a pointer form and a keyboard form. Dragging is
     the obvious way to move a board and is unavailable to anyone not
     using a mouse, so a board can also be SELECTED and then placed
     with a second click -- the same two steps, reachable by Tab.
     ============================================================ */
  var LAYOUT_KEY = "pumarally_layout_v1";

  function defaultLayout() {
    var cells = [];
    for (var i = 0; i < B.LAY_BOARDS; i++) cells.push(null);
    /* Bottom-left, with the block under it: the corner every course
       built here grows out of. */
    cells[(B.LAY_ROWS - 1) * B.LAY_COLS] = { id: "provingGround", rot: 0 };
    return { v: 3, cells: cells, dockCol: 0 };
  }

  /* Every reader of the layout goes through this, because the wizard
     asks questions about it before anything has opened the screen that
     builds one -- the step rail has to know whether the boards step is
     answered before it can draw the flags step as reachable. */
  function layoutNow() {
    if (!UI.layout) UI.layout = loadLayout();
    return UI.layout;
  }

  function loadLayout() {
    try {
      var raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      var up = migrateLayout(raw);
      if (up) return up;
    } catch (e) {}
    return defaultLayout();
  }

  /* TWO OLDER SHAPES, BOTH CARRIED ACROSS.

     Before this the boards floated on a half-board lattice around the
     block; before that they sat in a grid of any size with the block
     under a column of it. Somebody's half-built course surviving an
     update is the difference between a tool and a toy, so both are
     read -- and anything that will not fit three by three aligned is
     refused rather than opened crooked. */
  function migrateLayout(raw) {
    if (!raw || typeof raw !== "object") return null;
    var cells = [], i;
    for (i = 0; i < B.LAY_BOARDS; i++) cells.push(null);
    var out = { v: 3, cells: cells, dockCol: 0, pick: raw.pick };

    if (raw.v === 3 && raw.cells) {
      for (i = 0; i < B.LAY_BOARDS; i++) {
        var c3 = raw.cells[i];
        if (!c3) continue;
        if (!B.BOARD_SPECS[c3.id]) return null;
        cells[i] = { id: c3.id, rot: (c3.rot | 0) % 4 };
      }
      out.dockCol = Math.max(0, Math.min(B.LAY_COLS - 1, raw.dockCol | 0));
    } else if (raw.v === 2 && raw.boards && raw.boards.length) {
      /* Half-board columns become whole ones, and anything that was
         standing half over is not an aligned course. */
      var minX = 0;
      for (i = 0; i < raw.boards.length; i++) {
        if (!raw.boards[i] || !B.BOARD_SPECS[raw.boards[i].id]) return null;
        if ((raw.boards[i].x | 0) % 2) return null;
        minX = Math.min(minX, raw.boards[i].x | 0);
      }
      for (i = 0; i < raw.boards.length; i++) {
        var b2 = raw.boards[i];
        /* `row` counted UP from the block, so row zero is the bottom
           row of the grid rather than the top. */
        var col = ((b2.x | 0) - minX) / 2, row = (B.LAY_ROWS - 1) - (b2.row | 0);
        if (col >= B.LAY_COLS || row >= B.LAY_ROWS || col < 0 || row < 0) return null;
        var at2 = row * B.LAY_COLS + col;
        if (cells[at2]) return null;
        cells[at2] = { id: b2.id, rot: (b2.rot | 0) % 4 };
      }
      out.dockCol = Math.max(0, -minX / 2);
    } else if (raw.cells && raw.cols && raw.rows) {
      var cols1 = raw.cols | 0, rows1 = raw.rows | 0;
      if (cols1 > B.LAY_COLS || rows1 > B.LAY_ROWS) return null;
      for (var r1 = 0; r1 < rows1; r1++) {
        for (var c1 = 0; c1 < cols1; c1++) {
          var cell1 = raw.cells[r1 * cols1 + c1];
          if (!cell1 || !cell1.id) continue;
          if (!B.BOARD_SPECS[cell1.id]) return null;
          cells[(r1 + B.LAY_ROWS - rows1) * B.LAY_COLS + c1] = { id: cell1.id, rot: cell1.rot || 0 };
        }
      }
      out.dockCol = Math.max(0, Math.min(B.LAY_COLS - 1, Math.round(raw.dockCol || 0)));
    } else {
      return null;
    }

    if (!B.laySpan(cells) || !B.layConnected(cells)) return null;
    out.dockCol = B.layDockCol(cells, out.dockCol);
    if (out.dockCol < 0) return null;
    /* The workshop's picture comes back too, and is PARSED on the way
       in rather than trusted: a stored picture that no longer reads is
       a course that would take the wizard down on its first render,
       and having no edit is the honest answer to that. */
    if (raw.edit && raw.edit.pic) {
      try {
        B.parsePic("course", raw.edit);
        out.edit = raw.edit;
      } catch (e) { /* dropped */ }
    }
    return out;
  }

  function saveLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(UI.layout)); } catch (e) {}
  }

  /* ============================================================
     THE LIBRARY

     A course is an hour of work -- boards laid out, a map gone over
     square by square, flags placed in the order they will be raced --
     and until now there was exactly one of them. The layout key holds
     what you are working on, so starting a second course was throwing
     the first one away.

     A saved course is the LAYOUT, whole: the boards and their
     rotations, the block, and the workshop's picture with its flags.
     Not the built course, because that is derived and would go stale
     the moment a board's data changed; not the picture alone, because
     then a saved course could not be taken back into the assembler.

     Everything is read back through migrateLayout, which parses the
     picture rather than trusting it -- a stored course that no longer
     reads is dropped from the list rather than taken into the
     workshop, where it would come apart on the first render.
     ============================================================ */
  var LIBRARY_KEY = "pumarally_library_v1";

  function libLoad() {
    var out = [];
    try {
      var raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "null");
      if (!raw || !raw.items || !raw.items.length) return out;
      for (var i = 0; i < raw.items.length; i++) {
        var it = raw.items[i];
        if (!it || !it.name || !it.layout) continue;
        var lay = migrateLayout(it.layout);
        if (!lay) continue;
        out.push({ id: String(it.id || i), name: String(it.name), at: it.at || 0, layout: lay });
      }
    } catch (e) {}
    return out;
  }

  function libWrite(items) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify({ v: 1, items: items })); }
    catch (e) { return false; }
    return true;
  }

  /* SAVING UNDER A NAME REPLACES THAT NAME.

     Pressing save twice on the same course is one course, not two --
     and a library that answers "save" by growing is a library nobody
     keeps using. The name in the workshop's own field is the name. */
  function libPut(name, layout) {
    name = (name || "").replace(/\s+/g, " ").trim() || "Untitled course";
    var items = libLoad(), i, at = -1;
    for (i = 0; i < items.length; i++) if (items[i].name.toLowerCase() === name.toLowerCase()) at = i;
    var row = { id: at >= 0 ? items[at].id : "c" + Date.now().toString(36) + (Math.random() * 1e6 | 0).toString(36),
                name: name, at: Date.now(), layout: JSON.parse(JSON.stringify(layout)) };
    if (at >= 0) items[at] = row; else items.push(row);
    return libWrite(items) ? row : null;
  }

  function libDrop(id) {
    var items = libLoad(), out = [], i;
    for (i = 0; i < items.length; i++) if (items[i].id !== id) out.push(items[i]);
    libWrite(out);
  }

  function libFind(id) {
    var items = libLoad();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  /* Taking one off the shelf: it becomes what the assembler and the
     workshop are looking at. Editing it on the table must not rewrite
     the saved one -- saving is a deliberate act and has its own
     button -- and what actually guarantees that is libLoad parsing the
     stored text afresh on every call, so nothing here shares
     structure with the shelf. The copy is a second lock on the same
     door, for whoever one day gives libLoad a cache. */
  function libOpen(id) {
    var row = libFind(id);
    if (!row) return false;
    UI.layout = JSON.parse(JSON.stringify(row.layout));
    UI.heldBoard = null;
    UI.heldAt = null;
    UI.layUndo = [];
    saveLayout();
    return true;
  }

  /* Boards a player may place. The docking bay is not one of them --
     it is 12x4, it is the start area, and it goes under the grid
     rather than in it. */
  function paletteBoards() {
    var out = [];
    for (var id in B.BOARD_SPECS) {
      var sp = B.BOARD_SPECS[id];
      if (sp.w !== 12 || sp.h !== 12) continue;
      /* Still being transcribed: it opens in the workshop, where it is
         checked against the photograph, and nowhere a race can reach. */
      if (sp.unverified) continue;
      out.push(id);
    }
    return out;
  }

  /* ONE STEP BACK, ALWAYS.

     Arranging boards is trial and error -- put one down, turn it, see
     it, take it off again -- and a screen that cannot undo makes the
     trial expensive. A snapshot is a string, so this costs nothing and
     survives being handed to JSON. */
  function layoutMark() {
    var L = layoutNow();
    UI.layUndo = UI.layUndo || [];
    UI.layUndo.push(JSON.stringify({ cells: L.cells, dockCol: L.dockCol }));
    if (UI.layUndo.length > 24) UI.layUndo.shift();
    /* Marking a change is the one place every board edit passes
       through, so it is the one place the workshop's picture has to be
       let go of: a picture of a different arrangement is not an edit
       of this one. */
    layoutDropEdit();
  }

  function layoutUndo() {
    if (!UI.layUndo || !UI.layUndo.length) return false;
    var was = JSON.parse(UI.layUndo.pop()), L = layoutNow();
    L.cells = was.cells;
    L.dockCol = was.dockCol;
    UI.heldAt = null;
    return true;
  }

  /* WHAT ESCAPE BACKS OUT OF, and in what order: the right-click
     menu, then whatever is being carried, then nothing -- at which
     point the key belongs to the modal. Closing the whole wizard
     because a menu was open would throw away everything behind it, so
     the order is the point and lives in one place. */
  function layEscape() {
    if (UI.layMenu) { UI.layMenu = null; return true; }
    if (UI.heldBoard || (UI.heldAt !== null && UI.heldAt !== undefined)) {
      UI.heldBoard = null;
      UI.heldAt = null;
      return true;
    }
    return false;
  }

  /* The four edits a slot can take. They live here rather than in the
     click handler because the pointer path, the keyboard path and the
     rule tests must all be the same operation -- a move that only the
     drop handler knows how to do is a move nothing can test. */
  function layoutPut(at, id) {
    var L = layoutNow();
    if (at < 0 || at >= B.LAY_BOARDS || L.cells[at]) return false;
    layoutMark();
    L.cells[at] = { id: id, rot: 0 };
    L.dockCol = B.layDockCol(L.cells, L.dockCol);
    return true;
  }

  function layoutMove(from, to) {
    var L = layoutNow();
    if (from === to || !L.cells[from] || L.cells[to]) return false;
    layoutMark();
    L.cells[to] = L.cells[from];
    L.cells[from] = null;
    L.dockCol = B.layDockCol(L.cells, L.dockCol);
    return true;
  }

  function layoutTurn(at, dir) {
    var b = layoutNow().cells[at];
    if (!b) return;
    layoutMark();
    b.rot = (b.rot + (dir < 0 ? 3 : 1)) % 4;
  }

  function layoutDrop(at) {
    var L = layoutNow();
    if (!L.cells[at]) return;
    layoutMark();
    L.cells[at] = null;
    L.dockCol = B.layDockCol(L.cells, L.dockCol);
  }

  function layoutDockTo(col) {
    var L = layoutNow();
    if (B.layDockCols(L.cells).indexOf(col) < 0) return false;
    layoutMark();
    L.dockCol = col;
    return true;
  }

  function layoutCourse(flags) {
    /* Composed fresh each time so the preview is the course that would
       actually be raced, not an approximation of it.

       With no flags given it composes with ONE, which is a placeholder
       rather than a placement: a course with none at all fails
       validateCourse, and the boards step needs a buildable course to
       ask its own questions of long before anybody has opened the
       workshop. The real flags always arrive as the argument. */
    var L = layoutNow();
    var spec = B.composeCourse(B.withFlags(L, flags || null), 1);
    /* A course the workshop has been through is raced from ITS
       picture, not from the boards under it -- otherwise every edit
       would be thrown away the moment the course was rebuilt. */
    if (L.edit) {
      spec.grid = L.edit;
      spec.name = L.edit.name || spec.name;
    }
    return spec;
  }

  /* Any change to the BOARDS makes the workshop's picture a picture of
     a different course, so it goes. Said out loud on the screen rather
     than discovered afterwards. */
  function layoutDropEdit() {
    var L = layoutNow();
    if (!L.edit) return false;
    L.edit = null;
    if (L.pick && L.pick.mode === "manual") { L.pick.mode = "race"; L.pick.chosen = false; }
    return true;
  }

  function layoutProblem() {
    var L = layoutNow();
    if (!B.laySpan(L.cells)) return "Put a board on the grid.";
    if (!B.layConnected(L.cells)) {
      return "Every board has to join the others along an edge. A corner is not a join.";
    }
    try {
      var spec = layoutCourse();
      B.validateCourse(spec, function () {});
      if (!spec.flags.length) return "No square on this course can hold a flag.";
      /* THE RULESET MEETS THE BOARDS HERE, and nowhere else now that a
         course is laid out rather than chosen off a list. A board with
         a square the chosen rulebook has no rules for cannot be raced
         under it, and the step that put the board there is the step
         that has to say so. */
      var rs = rulesetOf(houseRules);
      if (B.playableEditions(spec).indexOf(rs) < 0) {
        var why = B.editionBlocker(spec, rs);
        return RULESETS[rs].name + " has no " + (why || "rules for a square on this course") +
          ", so it cannot race this layout.";
      }
    } catch (e) { return e.message; }
    return null;
  }

  /* Which palette boards the chosen rulebook cannot read, so they are
     greyed with the reason rather than offered and then refused a
     screen later. */
  function boardBlocker(id) {
    var rs = rulesetOf(houseRules);
    var one = { id: "_probe", name: "probe", boards: [{ id: id, rot: 0, at: [0, 0] }],
                flags: [], minPlayers: 2, maxPlayers: 8 };
    try {
      if (B.playableEditions(one).indexOf(rs) >= 0) return null;
      return B.editionBlocker(one, rs);
    } catch (e) { return null; }
  }

  /* What each kind of drag is carrying. Two of these travel as
     {from, i} and are otherwise indistinguishable -- a program card
     pulled out of a register is "slot", a board pulled out of the
     assembler grid is "lslot" -- and they share one dragover handler,
     so the gate reads this table rather than re-deriving the answer
     from the payload's shape. */
  var DRAG_KINDS = { hand: "card", slot: "card", palette: "board", lslot: "board" };

  function dragKind() { return UI.drag ? DRAG_KINDS[UI.drag.from] : null; }

  /* ONE SHELF OF COURSES, of one kind.

     Grouped by what a course IS -- one board with flags on it, or a
     larger track across several -- rather than by which box its first
     board came out of. The box told you nothing you could act on: a
     quick game on an Exchange board and a four-board track starting
     with one sat under the same heading and read as the same kind of
     thing. */
  function courseShelf(kind, title, blurb) {
    var rs = rulesetOf(houseRules), ids = [], cid;
    for (cid in B.COURSES) {
      if (cid.charAt(0) === "_") continue;
      if ((B.COURSES[cid].kind || "quick") !== kind) continue;
      if (!B.layoutFromCourse(cid)) continue;       // not a shape this grid can hold
      ids.push(cid);
    }
    if (!ids.length) return "";
    var out = ['<h3 class="pr-rule-group">' + esc(title) + "</h3>"];
    if (blurb) out.push('<div class="pr-rule-desc">' + blurb + "</div>");
    out.push('<div class="pr-presets pr-course-row">');
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], C = B.COURSES[id];
      var ok = courseAllowed(id, rs), why = ok ? "" : B.editionBlocker(id, rs);
      var g = B.buildCourse(id);
      out.push('<button class="pr-course' + (layoutIsCourse() === id ? " on" : "") +
        '" data-act="lcourse" data-c="' + esc(id) + '"' + (ok ? "" : " disabled") +
        ' title="' + esc(C.blurb || C.name) + '">' +
        courseThumb(id) +
        '<span class="pr-course-name">' + esc(C.name) + "</span>" +
        '<i class="pr-c-note">' + (kind === "track" ? C.boards.length + " boards, " : "") +
          C.flags.length + " flags</i>" +
        (why ? '<i class="pr-c-no">needs ' + esc(why) + "</i>" : "") + "</button>");
    }
    out.push("</div>");
    return out.join("");
  }

  /* YOUR OWN COURSES, on the shelf beside the printed ones.

     Each one is drawn with its flags on it, because "which of these is
     the one I built on Tuesday" is answered by the picture and by
     nothing in the name. Three verbs, in the order they are wanted:
     race it, open it, throw it away. */
  function libraryBody() {
    var items = libLoad(), out = [], i;
    if (!items.length) {
      return '<h3 class="pr-rule-group">Your library</h3>' +
        '<div class="pr-rule-desc">Nothing saved yet. Courses you save in the workshop appear here, ' +
        "ready to race again without building them twice.</div>";
    }
    items.sort(function (a, z) { return z.at - a.at; });
    out.push('<h3 class="pr-rule-group">Your library</h3><div class="pr-lib">');
    for (i = 0; i < items.length; i++) {
      var it = items[i], thumb = "", note = "", flags = (it.layout.edit && it.layout.edit.flags) || [];
      try {
        var spec = B.composeCourse(B.withFlags(it.layout, flags), 0);
        if (it.layout.edit) { spec.grid = it.layout.edit; spec.flags = flags; }
        var C = B.buildCourse(spec);
        var marks = {}, k;
        for (k = 0; k < flags.length; k++) marks[flags[k][0] + "," + flags[k][1]] = k + 1;
        thumb = gridThumb(C, Math.max(3, Math.min(9, Math.floor(190 / C.w))),
          flags.length ? { act: null, legal: null, marks: marks } : null);
        note = C.w + "\u00d7" + C.h + ", " + flags.length + " flag" + (flags.length === 1 ? "" : "s");
      } catch (e) {
        /* A saved course that will not build is shown and refused
           rather than hidden: a course quietly missing from the shelf
           reads as one you never saved. */
        note = "will not build: " + e.message;
      }
      out.push('<div class="pr-lib-item">' +
        '<div class="pr-lib-thumb">' + thumb + "</div>" +
        '<div class="pr-lib-name">' + esc(it.name) + "</div>" +
        '<div class="pr-lib-note">' + esc(note) + "</div>" +
        '<div class="pr-lib-acts">' +
          '<button data-act="libplay" data-i="' + esc(it.id) + '"' + (thumb && flags.length ? "" : " disabled") +
            ' title="' + (flags.length ? "Race this course now" : "This course has no flags on it yet") + '">Race</button>' +
          '<button data-act="libopen" data-i="' + esc(it.id) + '"' + (thumb ? "" : " disabled") +
            ">Open</button>" +
          '<button data-act="libdrop" data-i="' + esc(it.id) + '" title="Delete ' + esc(it.name) +
            '" aria-label="Delete ' + esc(it.name) + '">&times;</button>' +
        "</div></div>");
    }
    out.push("</div>");
    return out.join("");
  }

  function layoutBody() {
    var L = layoutNow(), i, c, r;
    var out = [];

    /* START FROM SOMETHING, or from nothing.

       Picking a course off the menu and building one by hand used to
       be two different flows with two different screens after them.
       They are the same flow now: a course loads into this grid, so
       the workshop opens on it and its flags come with it. */
    out.push(courseShelf("quick", "Quick games",
      "One board with its flags already down. The shortest way to a game."));
    out.push(courseShelf("track", "Race tracks", ""));
    out.push(libraryBody());

    /* THE STAGE AND THE SHELF.

       The starting block is the anchor and is drawn where it will be
       -- along the base, on the left -- with the boards standing over
       it and the shelf of boards to place down the right. Everything
       is positioned from the block, so the picture on this screen is
       the picture of the course, at a smaller tile.

       Every gesture has a pointer form and a keyboard form. Dragging a
       board onto a landing place is the obvious one and is unavailable
       to anyone not using a mouse, so a board can also be picked up
       with a click and put down with a second -- the same two steps,
       reachable by Tab. */
    /* THE STAGE AND THE SHELF.

       A three by three of slots with the starting block under the
       bottom row, and the shelf of boards down the right. Boards are
       aligned: a slot IS a board position and there is nothing to fit.

       Every gesture has a pointer form and a keyboard form. Dragging a
       board into a slot is the obvious one and is unavailable to
       anyone not using a mouse, so a board can also be picked up with
       a click and put down with a second -- the same two steps,
       reachable by Tab. */
    out.push('<h3 class="pr-rule-group">Or lay one out</h3>');
    out.push('<div class="pr-lay">');
    out.push(layoutStage());

    out.push('<div class="pr-lay-shelf">');
    out.push('<div class="pr-lay-shelf-in">');
    var pal = paletteBoards(), used = {}, spn = B.laySpan(L.cells);
    var full = !B.laySlots(L.cells).length;
    for (i = 0; i < B.LAY_BOARDS; i++) if (L.cells[i]) used[L.cells[i].id] = 1;
    for (i = 0; i < pal.length; i++) {
      var held = UI.heldBoard === pal[i], nope = boardBlocker(pal[i]);
      var off = nope || full;
      out.push('<button class="pr-pal' + (held ? " on" : "") + (used[pal[i]] ? " used" : "") + '"' +
        (off ? " disabled" : ' draggable="true"') +
        ' data-act="lhold" data-b="' + esc(pal[i]) + '"' +
        (nope ? ' title="' + esc(RULESETS[rulesetOf(houseRules)].name + " has no " + nope) + '"'
              : full ? ' title="The grid is full \u2014 take a board off first"'
              : ' title="Drag it onto a slot, or click to pick it up"') +
        ' aria-pressed="' + (held ? "true" : "false") + '">' +
        boardThumb(pal[i], 0, 5) +
        '<span class="pr-pal-name">' + esc(B.BOARD_SPECS[pal[i]].name) +
          (used[pal[i]] ? ' <i class="pr-pal-used">on</i>' : "") + "</span>" +
        (nope ? '<i class="pr-c-no">needs ' + esc(nope) + "</i>" : "") + "</button>");
    }
    out.push("</div></div></div>");

    /* ONE LINE THAT SAYS WHAT TO DO NEXT, and it is never the same
       line twice: what this screen wants from you changes completely
       between an empty grid, a board in hand and a finished course. */
    var say;
    if (UI.heldBoard) {
      say = "Holding " + B.BOARD_SPECS[UI.heldBoard].name +
        " \u2014 click one of the lit slots to put it down.";
    } else if (UI.heldAt !== null && UI.heldAt !== undefined && L.cells[UI.heldAt]) {
      say = B.BOARD_SPECS[L.cells[UI.heldAt].id].name + " is selected \u2014 turn it with the " +
        "arrows in its corners, take it off with the bin, or click a lit slot to move it there.";
    } else if (!spn) {
      say = "Drag a board from the right into any slot. The starting block goes under the " +
        "bottom row, in whichever column you put it.";
    } else if (!full) {
      say = "Click a board to select it, then turn it or take it off. Drag it to move it. " +
        "Add another in any slot beside one already down, up to three by three.";
    } else {
      say = "Three by three is as big as a course gets. Click a board to turn it, move it, " +
        "or take it off.";
    }
    out.push('<div class="pr-rule-desc">' + esc(say) + "</div>");

    /* ONE DOOR ONWARD, and it is the Next button at the foot of the
       screen. This row carried a second "Open in the workshop" of its
       own, from when the step after this one was a flags screen and
       the workshop was a detour off to the side. It is the only way
       on now, so a button here saying the same thing is two doors
       into one room. */
    out.push('<div class="pr-ed-row">' +
      '<button data-act="lundo"' + ((UI.layUndo && UI.layUndo.length) ? "" : " disabled") +
        '">Undo</button>' +
      '<button data-act="lempty"' + (spn ? "" : " disabled") +
        '">Clear the course</button>' +
      (L.edit ? '<button data-act="ldropedit">Undo the workshop edits</button>' : "") +
      "</div>");
    if (L.edit) {
      out.push('<div class="pr-lay-note">This course has been adjusted in the workshop' +
        (L.edit.flags && L.edit.flags.length
          ? ", and carries " + L.edit.flags.length + " flag" + (L.edit.flags.length === 1 ? "" : "s") + "."
          : ".") +
        " Moving a board would make that a picture of a different course, so it would be let go.</div>");
    }

    /* What this course IS, when it is one. What is wrong with it is
       the wizard's line to write, beside the button it disables --
       said in both places it was said twice. */
    if (!layoutProblem()) {
      /* No flag count here: flags belong to the next step, and the
         one this composes is a placeholder so the course validates. */
      var prev = layoutCourse([]), pc = B.buildCourse(prev);
      out.push('<div class="pr-ed-ok">' + pc.w + " by " + pc.h + " squares, " +
        prev.boards.length + " board" + (prev.boards.length > 1 ? "s" : "") + ", " +
        pc.docks.length + " bays.</div>");
    }

    return out.join("");
  }

  /* Which shipped course this layout IS, if any -- the same question
     defaultFlagsFor asks, answered by name so the menu above can show
     which one is loaded. */
  /* THE STAGE.

     Absolutely positioned, because the thing being drawn is a map and
     not a list: a board half a board over is six squares over, not
     "the next cell". The window is the layout plus every place a board
     could land, so the landing places do not push the course sideways
     as they appear and disappear. */
  /* ONE FIXED CANVAS, chosen so nothing on it ever moves.

     The window is every place a board could legally be, not every
     place one currently is: two half-boards either side of the block
     and two rows up. A stage that grew as boards went down would slide
     the board out from under the pointer mid-drag, and slide the
     landing places away from the eye that was aiming at them. */
  /* Drawn rather than typed: the bin glyph is outside the monospace
     face this game is set in, and a character that resolves to a box
     is worse than no icon at all. */
  var TRASH_SVG = '<svg viewBox="0 0 24 24" class="pr-trash" aria-hidden="true">' +
    '<path d="M4 6.5h16"/><path d="M9.5 6.5V4h5v2.5"/>' +
    '<path d="M6.5 6.5 7.6 20.5h8.8L17.5 6.5"/>' +
    '<path d="M10 10v7"/><path d="M14 10v7"/></svg>';

  /* ONE FIXED CANVAS: the whole three by three, plus the strip the
     block sits in. A stage that grew as boards went down would slide
     the board out from under the pointer mid-drag and slide the empty
     slots away from the eye aiming at them. */
  function stageGeom() {
    var px = 8;
    return {
      px: px,
      w: B.LAY_COLS * 12 * px, h: (B.LAY_ROWS * 12 + 4) * px,
      left: function (c) { return c * 12 * px; },
      top: function (r) { return r * 12 * px; },
      dockTop: function () { return B.LAY_ROWS * 12 * px; }
    };
  }

  function slotHtml(g, c, r, live) {
    var at = r * B.LAY_COLS + c;
    return '<button class="pr-lay-slot' + (live ? " live" : "") +
      '" data-act="ldrop" data-at="' + at + '"' +
      (live ? "" : " tabindex=\"-1\" aria-hidden=\"true\"") +
      ' style="left:' + g.left(c) + "px;top:" + g.top(r) + "px;width:" + (12 * g.px) +
      "px;height:" + (12 * g.px) + 'px" aria-label="Empty slot, column ' + (c + 1) +
      " row " + (r + 1) + '"><span>+</span></button>';
  }

  /* Landing places painted STRAIGHT INTO the stage rather than by
     re-rendering it. A drag begins on an element; rebuilding that
     element's ancestors under it cancels the drag in every browser, so
     the pointer route appends and removes, and the keyboard route --
     which has no such constraint -- goes through the ordinary render. */
  function paintSlots() {
    var stage = UI.els.overlay && UI.els.overlay.querySelector(".pr-lay-stage");
    if (!stage) return;
    clearSlots();
    var g = stageGeom(), slots = B.laySlots(layoutNow().cells);
    var holder = document.createElement("div");
    holder.className = "pr-lay-painted";
    var html = [];
    for (var i = 0; i < slots.length; i++) html.push(slotHtml(g, slots[i].c, slots[i].r, true));
    holder.innerHTML = html.join("");
    stage.appendChild(holder);
  }

  function clearSlots() {
    var stage = UI.els.overlay && UI.els.overlay.querySelector(".pr-lay-stage");
    if (!stage) return;
    var was = stage.querySelector(".pr-lay-painted");
    if (was) was.parentNode.removeChild(was);
  }

  function layoutStage() {
    var L = layoutNow(), g = stageGeom(), c, r, i;
    var moving = (UI.heldAt !== null && UI.heldAt !== undefined && L.cells[UI.heldAt])
      ? UI.heldAt : -1;
    var carrying = !!UI.heldBoard || moving >= 0;
    /* THE EMPTY SLOTS ARE ALWAYS DRAWN, faintly, and light up when
       something is being carried. Shown only while holding, the one
       thing this screen wants you to know -- that boards go HERE --
       was invisible until after you had guessed it. */
    var slots = B.laySlots(L.cells);

    var out = ['<div class="pr-lay-stage' + (carrying ? " carrying" : "") +
      '" style="width:' + g.w + "px;height:" + g.h + 'px">'];

    for (i = 0; i < slots.length; i++) out.push(slotHtml(g, slots[i].c, slots[i].r, carrying));

    /* THE BLOCK, under the bottom row, in one of the three columns.
       The columns with a board over them are offered; the rest are
       not, because a block under nothing is a row of bays opening onto
       the void. */
    var dockOk = B.layDockCols(L.cells);
    for (c = 0; c < B.LAY_COLS; c++) {
      var here = L.dockCol === c, may = dockOk.indexOf(c) >= 0;
      if (here) {
        out.push('<div class="pr-lay-dock" style="left:' + g.left(c) + "px;top:" + g.dockTop() +
          "px;width:" + (12 * g.px) + "px;height:" + (4 * g.px) + 'px">' +
          boardThumb("dockingBay", 0, g.px) +
          '<span class="pr-lay-label">start</span></div>');
      } else if (may) {
        /* The px on the height is load-bearing. Without it the whole
           declaration is dropped, the button sizes to its own wrapped
           label instead -- fifty pixels rather than thirty-two -- and
           it hangs out of the stage and over the paragraph below. */
        out.push('<button class="pr-lay-dockslot" data-act="ldock" data-c="' + c +
          '" style="left:' + g.left(c) + "px;top:" + g.dockTop() + "px;width:" + (12 * g.px) +
          "px;height:" + (4 * g.px) + 'px" aria-label="Move the starting block under column ' +
          (c + 1) + '"><span>start here</span></button>');
      }
    }

    for (r = 0; r < B.LAY_ROWS; r++) {
      for (c = 0; c < B.LAY_COLS; c++) {
        var at = r * B.LAY_COLS + c, b = L.cells[at];
        if (!b) continue;
        var sel = at === moving, name = B.BOARD_SPECS[b.id].name;
        out.push('<div class="pr-lay-board' + (sel ? " sel" : "") + '" data-i="' + at +
          '" style="left:' + g.left(c) + "px;top:" + g.top(r) + "px;width:" + (12 * g.px) +
          "px;height:" + (12 * g.px) + 'px">' +
          '<button class="pr-lboard" draggable="true" data-act="lgrab" data-i="' + at + '"' +
            ' aria-pressed="' + (sel ? "true" : "false") +
            '" title="Click to select it. Drag to move it. Right-click for turn and remove."' +
            ' aria-label="' + esc(name) + ", turned " + (b.rot * 90) +
            " degrees, column " + (c + 1) + " row " + (r + 1) +
            (sel ? ", selected" : "") + '. Press to select it.">' +
            boardThumb(b.id, b.rot, g.px) + "</button>");
        if (sel) {
          out.push('<button class="pr-lay-tool tl" data-act="lrotl" data-i="' + at +
            '" title="Turn it left a quarter" aria-label="Turn ' + esc(name) +
            ' left a quarter turn">' + turnIcon(false) + "</button>" +
            '<button class="pr-lay-tool tr" data-act="lrotr" data-i="' + at +
            '" title="Turn it right a quarter" aria-label="Turn ' + esc(name) +
            ' right a quarter turn">' + turnIcon(true) + "</button>" +
            '<button class="pr-lay-tool bin" data-act="lclear" data-i="' + at +
            '" title="Take it off the course" aria-label="Take ' + esc(name) + ' off">' +
            TRASH_SVG + "</button>");
        }
        if (UI.layMenu && UI.layMenu.i === at) {
          /* The same three things again, under the pointer, because
             that is where a right-click expects to find them. Not the
             only way to reach them: the corner controls are real
             buttons and Tab reaches those. */
          out.push('<div class="pr-lay-menu" style="left:' + (UI.layMenu.x - g.left(c)) +
            "px;top:" + (UI.layMenu.y - g.top(r)) + 'px" role="menu" aria-label="' + esc(name) + '">' +
            '<button role="menuitem" data-act="lrotl" data-i="' + at + '">' + turnIcon(false) +
              "Turn left</button>" +
            '<button role="menuitem" data-act="lrotr" data-i="' + at + '">' + turnIcon(true) +
              "Turn right</button>" +
            '<button role="menuitem" data-act="lclear" data-i="' + at + '">Take it off</button>' +
            "</div>");
        }
        out.push("</div>");
      }
    }
    out.push("</div>");
    return out.join("");
  }

  function layoutIsCourse() {
    var mine = layoutNow(), sp = B.laySpan(mine.cells);
    if (!sp) return null;
    for (var id in B.COURSES) {
      if (id.charAt(0) === "_") continue;
      var L = B.layoutFromCourse(id);
      if (!L) continue;
      var theirs = B.laySpan(L.cells);
      if (!theirs || theirs.n !== sp.n || theirs.cols !== sp.cols || theirs.rows !== sp.rows) continue;
      if (L.dockCol - theirs.c0 !== mine.dockCol - sp.c0) continue;
      /* Compared by SHAPE rather than by slot: the same two boards in
         the bottom-left and in the top-right are the same course, put
         somewhere else on the grid. */
      var same = true;
      for (var r = 0; r < sp.rows && same; r++) {
        for (var c = 0; c < sp.cols && same; c++) {
          var a = B.layAt(mine.cells, sp.c0 + c, sp.r0 + r);
          var b = B.layAt(L.cells, theirs.c0 + c, theirs.r0 + r);
          if (!a !== !b) same = false;
          else if (a && (a.id !== b.id || (a.rot || 0) !== (b.rot || 0))) same = false;
        }
      }
      if (same) return id;
    }
    return null;
  }

  /* ============================================================
     WHERE THE FLAGS GO

     The last thing between an assembled course and a race. Three ways
     to answer it, because they are three different questions:

       default  what this course is normally raced with -- the printed
                flags when the layout IS a shipped course, and the
                spread-out automatic placement otherwise
       random   anywhere legal, scattered
       by hand  click the squares, in order, with an undo

     A flag may only sit on plain floor outside the docking bay. That
     is one definition in the board module, shared by all three, so
     the by-hand route cannot put a flag somewhere the automatic one
     would have refused.
     ============================================================ */
  /* WHERE THE FLAGS GO IS A DRAWING, NOT A SETTING.

     Two placements used to generate a course from rules -- three to a
     board, or a lap in strides -- and both produced courses that were
     legal and dull. A flag is a decision about a particular square on
     a particular board: which approach it favours, which wall it sits
     behind, whether the belt beside it helps or hurts. No rule this
     game knows how to state gets that right, and the ones it can state
     produce flags that are merely far enough apart.

     So the flags step hands the whole course to the workshop and the
     player puts them where they want them. A course that already
     carries flags -- built earlier, or loaded -- shows them here and
     the workshop is optional. */
  function flagPick() {
    var L = layoutNow();
    if (!L.pick) L.pick = {};
    L.pick.mode = "manual";
    L.pick.n = (L.edit && L.edit.flags) ? L.edit.flags.length : 0;
    return L.pick;
  }

  /* THE ONE DOOR INTO THE WORKSHOP. Two things open it -- the last
     step of the set-up, and a course taken out of the library -- and
     both have to leave the same state behind them, or the workshop
     opens on a layout that was never saved. */
  function openWorkshop() {
    if (layoutProblem()) { showWizard(); return; }
    saveLayout();
    closeModal();
    root.location.hash = "#edit=course&from=setup";
    edMountCourse(UI.els.host);
  }

  function flagsResolved() {
    var L = layoutNow();
    return (L.edit && L.edit.flags ? L.edit.flags : []).slice();
  }

  function flagProblem() {
    var have = flagsResolved();
    if (!have.length) return "No flags on this course yet. Put them down in the workshop.";
    try { B.validateCourse(layoutCourse(have), function () {}); }
    catch (e) { return e.message; }
    return null;
  }

  /* ============================================================
     THE WIZARD

     Setting up a race is five decisions and they were one screen plus
     two pop-ups hanging off it, in an order nobody could see. They are
     steps now, in the order the decisions actually depend on each
     other: the settings decide which rulebook is in play, and the
     rulebook decides which boards may be laid out. Everything after
     that happens somewhere the question can actually be answered.

     IT USED TO BE FIVE. A "Flags" screen sat between the boards and
     the race whose only real control was a button to the workshop --
     a door with a door in front of it, showing a picture of flags it
     could not move. A "Robot" screen asked which colour you wanted
     three screens before there was a board to see it on. A "Bays"
     entry named the priority draw, which is played rather than
     configured and was never in this modal at all. The flags are
     placed in the workshop, the colour is picked when the game
     starts, and the bays are drawn for on the board. */
  var WIZARD = [
    { id: "rules",  label: "Settings", title: "SET UP A RACE" },
    { id: "boards", label: "Course",   title: "SHAPE THE COURSE" }
  ];

  /* The last step in the rail, which is the one whose Next button
     starts the thing rather than turning a page. Written from the
     length rather than as a number, because it has been wrong twice:
     the rail used to carry an entry that never rendered, so "last"
     meant one before the end. */
  function wizLast() { return WIZARD.length - 1; }

  /* What stops you leaving a step, or null. Steps are gated on the
     step BEFORE them, so the rail can grey out what is not reachable
     yet rather than letting somebody arrive at a screen that cannot
     answer its own question. */
  function wizBlocker(step) {
    if (WIZARD[step].id === "boards") return layoutProblem();
    return null;
  }

  function wizReachable(step) {
    for (var i = 0; i < step && i < WIZARD.length; i++) {
      if (WIZARD[i].onBoard) return false;
      if (wizBlocker(i)) return false;
    }
    return true;
  }

  function wizGo(step) {
    step = Math.max(0, Math.min(wizLast(), step));
    while (step > 0 && !wizReachable(step)) step--;
    UI.wizStep = step;
    showWizard();
  }

  function showSetup() { wizGo(0); }

  function showWizard() {
    var step = Math.max(0, Math.min(wizLast(), UI.wizStep || 0));
    UI.wizStep = step;
    var body = null;
    if (WIZARD[step].id === "rules") body = rulesBody();
    else body = layoutBody();
    /* A step that cannot draw itself is a step whose input is gone --
       an empty grid has no flags to place -- so it hands back rather
       than rendering something that cannot be answered. */
    if (body === null) { UI.wizStep = Math.max(0, step - 1); showWizard(); return; }

    var out = ['<h2>' + esc(WIZARD[step].title) + "</h2>"];
    out.push('<ol class="pr-steps">');
    for (var i = 0; i < WIZARD.length; i++) {
      var here = i === step, can = !WIZARD[i].onBoard && wizReachable(i);
      out.push("<li>" + (can && !here
        ? '<button data-act="wstep" data-n="' + i + '">' + esc(WIZARD[i].label) + "</button>"
        : '<span class="' + (here ? "on" : "off") + '"' + (here ? ' aria-current="step"' : "") + ">" +
          esc(WIZARD[i].label) + "</span>") + "</li>");
    }
    out.push("</ol>");
    out.push(body);

    var blocker = wizBlocker(step);
    if (blocker) out.push('<div class="pr-ed-bad">' + esc(blocker) + "</div>");

    /* THE LAST STEP LEADS TO THE WORKSHOP, not to the board. A course
       has no flags until somebody puts them there, and the workshop is
       where that happens -- so the button says where it goes, and the
       race is started from in there. */
    var last = step === wizLast();
    out.push('<div class="pr-modal-foot">' +
      '<button data-act="wnext"' + (blocker ? " disabled" : "") + ">" +
        (last ? "Open the workshop\u2026" : "Next: " + esc(WIZARD[step + 1].label)) + "</button>" +
      (step > 0 ? '<button data-act="wback">Back</button>' : "") +
      '<button data-act="closemodal">Cancel</button></div>');
    openModal(out.join(""));

    /* Arrowing through a radio group re-renders the screen under the
       key, so the focus is put back by VALUE. Restoring by element
       would reach for one that no longer exists. */
    if (UI.refocusRule) {
      var back = UI.els.overlay.querySelector('[data-act="rule"][data-k="' + UI.refocusRule.k +
        '"][data-v="' + UI.refocusRule.v + '"]');
      UI.refocusRule = null;
      if (back) back.focus();
    }
  }

  function rulesBody() {
    var out = ['<div class="pr-presets">'];
    var cur = currentPreset();
    for (var name in DIFFICULTY_PRESETS) {
      out.push('<button data-act="preset" data-name="' + esc(name) + '"' +
        (cur === name ? ' class="on"' : "") + ">" + esc(name) + "</button>");
    }
    out.push(cur ? "" : '<button class="on" disabled>Custom</button>');
    out.push("</div>");

    /* RULESET first, because it decides which boards are even on the
       menu a step from now. An unbuilt one is shown and greyed with
       its reason rather than hidden: hiding it says the game has one
       rulebook, which is not true, and offering it would play the
       wrong one, which is worse. */
    var rsCur = rulesetOf(houseRules);
    out.push('<div class="pr-rule"><div class="pr-rule-head"><b>Ruleset</b>' +
      '<span class="pr-rule-val">' + esc(RULESETS[rsCur].name) + "</span></div>" +
      '<div class="pr-presets">');
    for (var rk in RULESETS) {
      var rs = RULESETS[rk], nCourses = 0;
      for (var cc in B.COURSES) if (cc.charAt(0) !== "_" && courseAllowed(cc, rk)) nCourses++;
      out.push('<button data-act="ruleset" data-r="' + esc(rk) + '"' +
        (rsCur === rk ? ' class="on"' : "") + (rs.built ? "" : " disabled") + ">" +
        esc(rs.name) + ' <i class="pr-rs-years">' + esc(rs.years) + "</i>" +
        (rs.built ? ' <i class="pr-rs-n">' + nCourses + "</i>" : ' <i class="pr-rs-no">not built</i>') +
        "</button>");
    }
    out.push("</div><div class='pr-rule-desc'>" + esc(RULESETS[rsCur].blurb) + "</div></div>");

    var groups = [["setup", null], ["house", "House rules"]];
    for (var gi = 0; gi < groups.length; gi++) {
      var gname = groups[gi][0];
      if (groups[gi][1]) out.push('<h3 class="pr-rule-group">' + esc(groups[gi][1]) + "</h3>");
      for (var k in SLIDER_DEFS) {
        var d = SLIDER_DEFS[k], v = houseRules[k];
        if ((d.group || "setup") !== gname) continue;
        out.push(ruleControl(k, d, v));
      }
    }
    var cfg = resolveConfig(houseRules);
    out.push('<p class="pr-rule-desc">' + cfg.players + " robots, " + cfg.humans +
      (cfg.humans === 1 ? " played here" : " played here in turn") + ".</p>");
    return out.join("");
  }

  /* YOUR ROBOT. Colour only: the bay is drawn for on the board a
     moment later, and a control that quietly does nothing is worse
     than no control. */
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
    /* Three things the legend has to name that are not cells. Flags and
       lasers because they are course tokens rather than printed board
       elements; pushers because they are bolted to a wall, and the
       square under one is a separate thing that can be a conveyor. */
    out.push("<tr><td>" + legendSwatch(pusherSvg(E, true)) + "</td><td>pusher</td><td>" +
      "Shoves you one square, on the registers stamped beside it.</td></tr>");
    out.push("<tr><td>" + legendSwatch(burnerSvg(S, true)) + "</td><td>flame jet</td><td>" +
      "Bolted to a wall and thrown across the floor. 1 damage on the registers " +
      "stamped beside it. Most cover one square; a few reach two.</td></tr>");
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
      /* The game may have been waiting on a modal of its own -- the
         colour pick opens on the first settled step, which is before
         this. Handing the screen back is what puts it up. */
      updateAll();
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

  /* THE LIBRARY, as one list rather than a row of tiles and four
     separate mode buttons beside it.

     A ram and a conveyor are different KINDS of thing -- one is bolted
     to a wall and the other is the square itself, which is why board H
     can print both on one square -- but from the person drawing's side
     they are both "something I pick up and put down". So the library
     is flat and each entry says what kind it is; the editor's mode
     follows from that rather than being chosen separately.

     `paint` marks the ones a drag lays a run of. `dir`, `regs`, `reach`
     and `digit` say which settings that kind has, which is what the
     inspector draws when there is nothing selected. `hot` is the key
     that picks it up, and two entries may share one -- both gears
     answer to G -- so a key is a place in the rail rather than one
     tool. `group` is the heading it sits under. */
  var ED_TOOLS = [
    { key: "sel", label: "Select", kind: "select", solo: true, hot: "v", group: "Hand" },
    { key: "pan", label: "Pan", kind: "pan", hot: "h", group: "Hand" },
    { key: "flag", label: "Flag", kind: "flag", course: true, number: true, drag: true, hot: "f", group: "Flags" },
    { key: "..", label: "Floor", kind: "tile", hot: "x", group: "Floor" },
    { key: "b", label: "Conveyor", kind: "tile", dir: true, paint: true, hot: "c", group: "Floor" },
    { key: "B", label: "Express", kind: "tile", dir: true, paint: true, hot: "t", group: "Floor" },
    { key: "l", label: "Gear CCW", kind: "tile", hot: "g", group: "Floor" },
    { key: "r", label: "Gear CW", kind: "tile", hot: "g", group: "Floor" },
    { key: "o", label: "Pit", kind: "tile", hot: "p", group: "Floor" },
    { key: "w", label: "Repair", kind: "tile", hot: "r", group: "Floor" },
    { key: "W", label: "Upgrade", kind: "tile", hot: "u", group: "Floor" },
    { key: "s", label: "Docking bay", kind: "tile", digit: true, hot: "k", group: "Floor" },
    { key: "wall", label: "Wall", kind: "wall", dir: true, hot: "b", group: "Walls" },
    { key: "laser", label: "Laser", kind: "laser", dir: true, damage: true, drag: true, hot: "l", group: "Walls" },
    { key: "pusher", label: "Ram", kind: "pusher", dir: true, regs: "push", drag: true, hot: "m", group: "Walls" },
    { key: "burner", label: "Flame jet", kind: "burner", dir: true, regs: "burn", reach: true, drag: true, hot: "j", group: "Walls" },
    /* A CRUSHER COMES DOWN FROM ABOVE, which is the whole reason it is
       in a group of its own: it needs no wall to bolt to and it does
       not face anywhere, so it is the one trap that can stand on any
       square at all -- including a conveyor, which is what every one
       of them on Cannery Row does. */
    { key: "press", label: "Crusher", kind: "press", regs: "press", drag: true, hot: "z", group: "Ceiling" }
  ];

  /* The keys that steer rather than pick, which no tool may answer to:
     W A S D are the four facings and Q E the quarter turns. */
  var ED_STEER_KEYS = "wasdqe";

  /* The tool a letter picks up: the first of those answering to it, or
     the one after the one in hand when that already answers, so a key
     shared by two entries walks between them. Null for a letter that
     picks nothing, so the caller can leave the key alone. */
  function edKeyTool(ch) {
    var lib = edLibrary(), hits = [], i;
    for (i = 0; i < lib.length; i++) if (lib[i].hot === ch) hits.push(lib[i].key);
    if (!hits.length) return null;
    return hits[(hits.indexOf(ED.pick) + 1) % hits.length];
  }

  function edToolByKey(k) {
    for (var i = 0; i < ED_TOOLS.length; i++) if (ED_TOOLS[i].key === k) return ED_TOOLS[i];
    return null;
  }

  function edTool() { return edToolByKey(ED.pick) || edToolByKey("b"); }

  /* Which library entries this workshop offers. Flags are placed on a
     COURSE and not printed on a board, so the flag tool exists only
     where a course is being edited. */
  function edLibrary() {
    var out = [];
    for (var i = 0; i < ED_TOOLS.length; i++) {
      if (ED_TOOLS[i].course && !ED.isCourse) continue;
      out.push(ED_TOOLS[i]);
    }
    return out;
  }

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
      pick: "b",                 // the library entry in hand
      sel: null,                 // the placed thing being looked at
      flagNum: 1,                // the number the next flag takes
      dir: N,
      digit: 1,
      laserN: 1,
      /* Which registers a newly placed ram fires in. The classic
         parities are a preset, not a special case -- board H prints
         1/2/3/4/5 and 2/3/4/5, so the tool has to be able to say any
         subset and the parities are just two of them. */
      pushRegs: [1, 3, 5],
      /* A jet's registers and how far it throws. Separate from the
         pusher's set because the two are placed in different passes and
         sharing one would silently carry a pusher's parity onto a
         flamethrower. */
      burnRegs: [2, 4],
      burnLen: 1,
      /* A crusher's registers. The printed ones come in sets like 1/5,
         2/4 and 3 -- Cannery Row runs those five down each of its two
         lanes -- so this is its own set and not a parity. */
      pressRegs: [1, 5],
      mode: "tile",              // tile | wall | laser | pusher | burner
      underlay: null,            // an object URL, never exported
      opacity: 0.5,
      /* Comparing a trace with a photograph through 50% of each turns
         out to be the hardest way to do it: everything is half there
         and the eye averages the two. Flipping between them whole is
         much easier to read, so Control swaps map for photo and the
         button latches it. */
      soloLatch: false,
      soloHold: false,
      offX: 0, offY: 0, zoom: 2, uScale: 1,
      errors: [],
      warnings: []
    };
  }

  /* Autosave the DATA, never the reference image: a 40-minute
     transcription must survive a reload, and an object URL would not
     be valid after one anyway. */
  /* A WALL-MOUNTED TRAP NEEDS ITS WALL, NO MATTER WHAT.

     A ram pushing north is bolted to the wall on its south side; a
     laser firing east is bolted to the wall on its west. The validator
     has always refused a mount without one -- so the workshop puts the
     wall up as the mount goes down, rather than drawing a map that
     goes red until somebody remembers why. */
  function edMountFace(obj) { return B.opposite(obj.d); }

  /* Whether any mount still standing on this square is bolted to this
     face, which is what decides whether the wall may come down. */
  function edWallNeeded(c, r, d, skip) {
    var g = ED.grid, lists = [g.lasers, g.pushers, g.burners], i, k;
    for (k = 0; k < lists.length; k++) {
      for (i = 0; i < lists[k].length; i++) {
        var m = lists[k][i];
        if (m === skip) continue;
        if (m.c === c && m.r === r && edMountFace(m) === d) return true;
      }
    }
    return false;
  }

  function edSave() {
    /* A course is not a board and must not come back as one. The
       workshop's autosave exists so a forty-minute transcription
       survives a reload; a course edit lives in the layout instead,
       and writing it here would hand the next board session a 24x28
       "board" to trace. */
    if (ED.isCourse) return;
    try {
      localStorage.setItem(ED_KEY, JSON.stringify({
        id: ED.id, w: ED.grid.w, h: ED.grid.h,
        name: ED.grid.name, notes: ED.grid.notes,
        pic: B.gridToPic(ED.grid),
        lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
        pushers: ED.grid.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
        burners: ED.grid.burners.map(function (F) { return { c: F.c, r: F.r, d: "NESW".charAt(F.d), regs: F.regs.slice(), len: F.len }; })
      }));
    } catch (e) {}
  }

  function edRestore() {
    try {
      var s = JSON.parse(localStorage.getItem(ED_KEY) || "null");
      if (!s || !s.pic) return null;
      var g = B.parsePic(s.id, { w: s.w, h: s.h, pic: s.pic, lasers: s.lasers || [],
                                 pushers: s.pushers || [], burners: s.burners || [] });
      g.name = s.name || "New Board"; g.notes = s.notes || ""; g.origin = "transcribed"; g.flags = [];
      return edState(g, s.id);
    } catch (e) { return null; }
  }

  function edValidate() {
    ED.errors = []; ED.warnings = [];
    if (ED.isCourse) {
      /* A COURSE, NOT A BOARD. validateGrid is written for a printed
         board, where every square exists; a course with an L in it is
         mostly void, and asking the board validator about it produced
         a crash rather than a verdict. A course is checked the way a
         course is checked: assembled, with its flags on it. */
      try {
        var spec = edCourseSpec();
        if (!spec.flags.length) {
          ED.warnings.push("No flags yet. Put at least one down before racing this.");
          spec.flags = [edFirstFloor()];
        }
        B.validateCourse(spec, function (id, m) { ED.warnings.push(m); });
      } catch (e) {
        ED.errors.push(e.message);
      }
      return;
    }
    try {
      B.validateGrid(ED.id, ED.grid, function (id, m) { ED.warnings.push(m); });
    } catch (e) {
      ED.errors.push(e.message);
    }
  }

  /* The course the workshop is looking at, as a spec. */
  function edCourseSpec() {
    var edit = edCourseEdit();
    return {
      id: "composed", name: ED.grid.name || "Your course", blurb: "",
      boards: ED.boards, dock: ED.dock, grid: edit,
      flags: edit.flags, minPlayers: 2, maxPlayers: 8
    };
  }

  /* Somewhere a flag could go, for the sake of validating a course
     that has none yet. Never shown, never raced. */
  function edFirstFloor() {
    var g = ED.grid, dk = ED.dock;
    for (var r = 0; r < g.h; r++) {
      for (var c = 0; c < g.w; c++) {
        if (dk && c >= dk.at[0] && c <= dk.at[0] + 11 && r >= dk.at[1] && r <= dk.at[1] + 3) continue;
        var el = B.elemOf(B.codeAt(g, c, r));
        if (el && el.name === "floor") return [c, r];
      }
    }
    return [0, 0];
  }

  function edSetCell(c, r, code) {
    if (!B.inGrid(ED.grid, c, r)) return;
    ED.grid.cell[r * ED.grid.w + c] = code;
  }

  /* A BELT PRESUMES IT IS A CONTINUATION.

     Laying a long run one square at a time and setting the facing for
     each is the tedious half of transcribing a board. A belt dropped
     next to one that points AT it takes that direction, so a run
     carries on by itself and only the corners need saying. */
  function edBeltDir(c, r, speed, fallback) {
    var g = ED.grid;
    for (var d = 0; d < 4; d++) {
      var nb = B.step(c, r, B.opposite(d));    // the square that would feed this one
      if (!B.inGrid(g, nb.c, nb.r)) continue;
      var code = B.codeAt(g, nb.c, nb.r);
      if (B.beltSpeed(code) !== speed) continue;
      if (B.dirOf(code) === d) return d;       // it points at us
    }
    return fallback;
  }

  /* Flags are a list and their order is the race, so placing one is an
     insertion rather than an append: the number in hand says where it
     goes, and goes up by one afterward so a run of clicks lays 1, 2,
     3. Q and E move the number instead of a facing, because a flag has
     no facing to rotate. */
  function edFlagSlot() {
    var n = (ED.grid.flags || []).length;
    if (!ED.flagNum || ED.flagNum < 1) ED.flagNum = 1;
    if (ED.flagNum > n + 1) ED.flagNum = n + 1;
    return ED.flagNum;
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

  /* THE MAP IS DRAWN ONCE AND SCALED.

     Zooming used to be a re-render at a bigger tile, which rebuilt the
     thousand-odd cells of a three-by-three course for every notch of
     the wheel. The art is vector, so the stage is drawn at the game's
     own tile size and scaled with a transform: the hit test reads
     getBoundingClientRect, which is post-transform, so nothing that
     aims at a square has to know the zoom at all. */
  var ED_ZOOM_MIN = 0.4, ED_ZOOM_MAX = 4, ED_PAD = 16;

  function edClampZoom(z) { return Math.max(ED_ZOOM_MIN, Math.min(ED_ZOOM_MAX, z)); }

  /* The zoom at which the whole grid fits the viewport with a margin. */
  function edFitZoom(gw, gh, vw, vh) {
    var pad = ED_PAD * 2;
    return edClampZoom(Math.min((vw - pad) / (gw * TILE), (vh - pad) / (gh * TILE)));
  }

  /* Where the viewport has to scroll to so that the point under the
     pointer stays under the pointer as the zoom goes from one value to
     another. The scaled thing sits ED_PAD inside the scrolled content,
     and the pad does not scale, so it is taken out before and put back
     after. */
  function edZoomScroll(from, to, sx, sy, px, py) {
    var k = to / from;
    return { x: (sx + px - ED_PAD) * k + ED_PAD - px,
             y: (sy + py - ED_PAD) * k + ED_PAD - py };
  }

  function edApplyZoom() {
    if (!UI.els || !UI.els.edBoard) return;
    var C = ED.grid, z = ED.zoom;
    UI.els.edBoard.style.transform = "scale(" + z + ")";
    UI.els.edCanvas.style.width = Math.round(C.w * TILE * z + ED_PAD * 2) + "px";
    UI.els.edCanvas.style.height = Math.round(C.h * TILE * z + ED_PAD * 2) + "px";
    var say = UI.els.host.querySelector("[data-ed=zoom]");
    if (say) say.textContent = Math.round(z * 100) + "%";
  }

  /* Zoom to `z` keeping the viewport point (px,py) where it is -- the
     middle of the viewport when no point is given, which is what the
     buttons and the keys mean. */
  function edZoomTo(z, px, py) {
    z = edClampZoom(z);
    if (!UI.els || !UI.els.edView) { ED.zoom = z; return; }
    var view = UI.els.edView, from = ED.zoom;
    if (px === undefined) { px = view.clientWidth / 2; py = view.clientHeight / 2; }
    var to = edZoomScroll(from, z, view.scrollLeft, view.scrollTop, px, py);
    ED.zoom = z;
    edApplyZoom();
    view.scrollLeft = to.x;
    view.scrollTop = to.y;
  }

  function edZoomFit() {
    if (!UI.els || !UI.els.edView) return;
    var view = UI.els.edView;
    ED.zoom = edFitZoom(ED.grid.w, ED.grid.h, view.clientWidth, view.clientHeight);
    edApplyZoom();
    view.scrollLeft = 0;
    view.scrollTop = 0;
  }

  /* Bring a square to the middle of the viewport. */
  function edScrollTo(c, r) {
    if (!UI.els || !UI.els.edView) return;
    var view = UI.els.edView, z = ED.zoom;
    var left = (c + 0.5) * TILE * z + ED_PAD - view.clientWidth / 2;
    var top = (r + 0.5) * TILE * z + ED_PAD - view.clientHeight / 2;
    try { view.scrollTo({ left: left, top: top, behavior: "smooth" }); }
    catch (e) { view.scrollLeft = left; view.scrollTop = top; }
  }

  function edRender() {
    /* The rule tests drive ED directly, with no workshop on screen --
       what has to be right is the grid, not the picture of it. */
    if (!UI.els || !UI.els.edBoard) return;
    var host = UI.els.edBoard;
    var C = edCourseView();
    var tile = TILE;
    var w = C.w * tile, h = C.h * tile;
    var out = [], c, r;

    host.innerHTML = "";
    host.style.width = w + "px";
    host.style.height = h + "px";
    host.style.setProperty("--tile", tile + "px");
    host.style.setProperty("--cols", C.w);

    /* The board being edited, drawn exactly the way the game draws it
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
      img.style.opacity = edSolo() ? 1 : ED.opacity;
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
        var selHere = ED.sel && ED.sel.c === c && ED.sel.r === r;
        out.push('<div class="pr-ed-cell' + (selHere ? " pr-sel" : "") +
          '" data-c="' + c + '" data-r="' + r + '"></div>');
      }
    }
    hits.innerHTML = out.join("");
    host.appendChild(hits);
    /* The ghost went with the old stage. edRenderPanel below puts it
       back, so it survives an edit rather than waiting for the next
       pointer move. */
    host.classList.toggle("pr-ed-solo", edSolo());
    edApplyZoom();
    edRenderPanel();
  }
  /* Map or photo, never a blend. Control flips whichever way you are
     currently looking, so it reads the same held down as latched. */
  function edSolo() { return !!ED && (ED.soloLatch !== ED.soloHold) && !!ED.underlay; }

  /* Called on every keydown repeat while Control is held, so it must
     not rebuild the board -- it moves two classes and one opacity. */
  function edSoloPaint() {
    var host = UI.els && UI.els.host;
    if (!host) return;
    var on = edSolo();
    host.classList.toggle("pr-ed-solo", on);
    var img = host.querySelector(".pr-ed-under");
    if (img) img.style.opacity = on ? 1 : ED.opacity;
    var btn = host.querySelector('[data-act="edsolo"]');
    if (btn) btn.className = ED.soloLatch ? "on" : "";
  }

  /* The tile renderer wants something course-shaped. A board being
     edited is one board with no flags, which is exactly that. */
  function edCourseView() {
    ED.grid.flags = ED.grid.flags || [];
    ED.grid.id = ED.id;
    /* THE ORDER IS THE NUMBER. The renderer prints a flag's `n`, and a
       built course carries one -- but the workshop keeps its flags as
       a bare list whose order is the race, so every flag drawn on the
       map said "undefined" until this numbered them from their place
       in it. Done on every draw, because every edit that moves,
       inserts or removes one renumbers the rest. */
    for (var i = 0; i < ED.grid.flags.length; i++) ED.grid.flags[i].n = i + 1;
    return ED.grid;
  }

  /* THE FIVE REGIONS: the bar across the top, the rail of tools down
     the left, the map in the middle, the inspector on the right and
     the status line underneath. Everything about the SESSION is in
     the bar; everything about a SQUARE, or about the thing in hand,
     is in the inspector; what is under the pointer is on the line. */
  function edRenderPanel() {
    /* THE GHOST IS THE THING IN HAND, so it goes stale exactly when
       this runs -- turning the compass, changing a register, picking
       up something else. Hanging it off the POINTER instead meant a
       ram turned north went on previewing itself facing east until
       the hand moved to another square. Ahead of the guard, because
       what the ghost would show is a fact about ED rather than about
       the screen. */
    edGhostPaint();
    if (!UI.els || !UI.els.edLib) return;
    edRenderTop();
    edRenderLib();
    edRenderDetail();
    edRenderStatus();
  }

  /* THE RAIL: one column of tools, grouped, each with the key that
     picks it up printed on it -- so the second time you want the ram
     you press M rather than going back to the rail for it. */
  function edRenderLib() {
    if (!UI.els || !UI.els.edLib) return;
    var lib = edLibrary(), out = [], i, group = null;
    for (i = 0; i < lib.length; i++) {
      var t = lib[i], on = ED.pick === t.key;
      if (t.group !== group) {
        group = t.group;
        out.push('<div class="pr-ed-gh">' + esc(group) + "</div>");
      }
      out.push(edRailButton(t));
    }
    UI.els.edLib.innerHTML = out.join("");
  }

  /* ONE RAIL BUTTON, as a string. Separate from the loop so what the
     rail actually puts on screen can be asked for without a screen --
     the class it carries is what the sheet's rules are scoped to, and
     a rule scoped to a class nothing wears is a rule that does
     nothing. */
  function edRailButton(t) {
    var on = ED.pick === t.key;
    return '<button class="pr-ed-item' + (on ? " on" : "") + '"' +
      (t.drag ? ' draggable="true"' : "") +
      ' data-act="edpick" data-k="' + esc(t.key) + '"' +
      ' aria-pressed="' + (on ? "true" : "false") + '"' +
      ' title="' + esc(t.label) + (t.hot ? " (" + t.hot.toUpperCase() + ")" : "") + '">' +
      edToolThumb(t) +
      '<span class="pr-ed-item-name">' + esc(t.label) + "</span>" +
      (t.hot ? '<kbd class="pr-ed-key">' + esc(t.hot.toUpperCase()) + "</kbd>" : "") +
      "</button>";
  }

  var ED_SELECT_SVG = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">' +
    '<path d="M5 3l10 8-4 1 3 5-2 1-3-5-4 3z" fill="currentColor"/></svg>';
  var ED_HAND_SVG = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">' +
    '<path d="M8 18c-2-1-4-4-5-7-.3-1 1-1.6 1.6-.6L6 12V5.5a1 1 0 0 1 2 0V10h1V3.5a1 1 0 0 1 2 ' +
    '0V10h1V4.5a1 1 0 0 1 2 0V10h1V6.5a1 1 0 0 1 2 0V13c0 3-2 5-5 5z" fill="currentColor"/></svg>';

  /* ONE SQUARE, DRAWN BY THE BOARD'S OWN RENDERER, at any size. The
     rail's icons, the ghost under the pointer and the big tile in the
     inspector are all this, so none of them can drift from the map. */
  function edThumbHTML(g, px, wt) {
    return '<span class="pr-thumb" style="--tile:' + px + "px;--wt:" + wt + "px;width:" + px +
      "px;height:" + px + 'px"><span class="pr-thumb-grid" style="grid-template-columns:' + px +
      'px"><i class="' + tileClasses(g, 0, 0).join(" ") + '">' + tileInner(g, 0, 0) +
      "</i></span>" +
      (g.lasers.length ? '<span class="pr-thumb-beams">' + beamSpans(g) + "</span>" : "") +
      '<span class="pr-thumb-walls">' + wallSpans(g) + "</span></span>";
  }

  /* THE SQUARE A TOOL WOULD LAY, turned the way it is about to go.

     `hit` says where, for the two that depend on it: a belt joins the
     run it lands beside, and a wall goes on the edge the pointer is
     nearest. Without a hit -- the rail's icon -- both take the facing
     in hand. A wall-mounted trap draws with its wall, because that is
     what goes down: the mount and the wall behind it are one
     placement. Null for a tool that lays nothing. */
  function edToolView(t, hit) {
    var g = B.blankGrid(1, 1);
    g.flags = [];
    g.cell[0] = "..";
    if (t.kind === "tile") {
      g.cell[0] = t.paint && hit ? edPaintCode(hit.c, hit.r)
                : t.dir ? t.key + B.DIR_CHARS.charAt(ED.dir)
                : t.digit ? t.key + ED.digit : t.key + ".";
    } else if (t.kind === "wall") {
      var edge = hit && hit.edge !== null && hit.edge !== undefined ? hit.edge : ED.dir;
      B.setWall(g, 0, 0, edge, true);
    } else if (t.kind === "pusher") {
      g.pushers.push({ c: 0, r: 0, d: ED.dir, regs: ED.pushRegs.slice() });
      B.setWall(g, 0, 0, B.opposite(ED.dir), true);
    } else if (t.kind === "burner") {
      g.burners.push({ c: 0, r: 0, d: ED.dir, regs: ED.burnRegs.slice(), len: 1 });
      B.setWall(g, 0, 0, B.opposite(ED.dir), true);
    } else if (t.kind === "laser") {
      g.lasers.push({ c: 0, r: 0, d: ED.dir, n: ED.laserN });
      B.setWall(g, 0, 0, B.opposite(ED.dir), true);
    } else if (t.kind === "press") {
      g.timers.push({ c: 0, r: 0, regs: ED.pressRegs.slice() });
    } else if (t.kind === "flag") {
      g.flags = [{ c: 0, r: 0, n: edFlagSlot() }];
    } else {
      return null;
    }
    return g;
  }

  /* EVERY RAIL ENTRY IS A PICTURE OF WHAT IT PUTS DOWN, and it turns
     as the compass turns, so the belt, the wall and the trap in hand
     all show the way they are about to go rather than making you read
     a word and hold the direction in your head. */
  function edToolThumb(t) {
    var g = edToolView(t, null);
    if (!g) {
      return '<span class="pr-ed-item-icon">' + (t.kind === "pan" ? ED_HAND_SVG : ED_SELECT_SVG) + "</span>";
    }
    return edThumbHTML(g, 20, 8);
  }

  /* A thing already on the map, as a one-square view -- what the
     ghost shows while it is being carried somewhere else. */
  function edPartView(part) {
    var g = B.blankGrid(1, 1), obj = edPartObj(part);
    g.flags = [];
    g.cell[0] = "..";
    if (!obj) return null;
    if (part.kind === "flag") { g.flags = [{ c: 0, r: 0, n: part.i + 1 }]; return g; }
    var copy = { c: 0, r: 0, d: obj.d };
    if (part.kind === "press") { g.timers.push({ c: 0, r: 0, regs: obj.regs.slice() }); return g; }
    if (part.kind === "laser") { copy.n = obj.n; g.lasers.push(copy); }
    else if (part.kind === "pusher") { copy.regs = obj.regs.slice(); g.pushers.push(copy); }
    else if (part.kind === "burner") { copy.regs = obj.regs.slice(); copy.len = 1; g.burners.push(copy); }
    else return null;
    B.setWall(g, 0, 0, B.opposite(obj.d), true);
    return g;
  }

  /* THE GHOST: the thing in hand, drawn on the square under the
     pointer the way a click would lay it -- the belt already turned
     to join its run, the wall on the edge the pointer is nearest, the
     flag with its number on. What you see is what you are about to
     get, before you have committed to it. While something is being
     dragged it is that thing instead. */
  /* WHAT A CLICK HERE WOULD DO with the thing in hand: put it down,
     take one up, or be refused -- "put", "take" or "no". The ghost
     shows the first, hides for the second and greys out for the
     third, so the answer arrives before the click rather than as a
     refusal after it. `kind` is a tool's or a carried part's. */
  function edClickWould(kind, hit) {
    var g = ED.grid, c = hit.c, r = hit.r, code = B.codeAt(g, c, r), i;
    if (!code) return "no";
    if (kind === "flag") {
      for (i = 0; i < (g.flags || []).length; i++) {
        if (g.flags[i].c === c && g.flags[i].r === r) return "take";
      }
      var el0 = B.elemOf(code);
      return !el0 || el0.name !== "floor" || edInDock(c, r) ? "no" : "put";
    }
    if (kind === "press") {
      for (i = 0; i < (g.timers || []).length; i++) {
        if (g.timers[i].c === c && g.timers[i].r === r) return "take";
      }
      return B.isPit(code) ? "no" : "put";
    }
    var list = kind === "laser" ? g.lasers : kind === "pusher" ? g.pushers
             : kind === "burner" ? g.burners : null;
    if (list) {
      for (i = 0; i < list.length; i++) if (list[i].c === c && list[i].r === r) return "take";
    }
    return "put";
  }

  function edGhostView(hit) {
    if (!hit || ED.pan || ED.pinch) return null;
    if (ED.drag) return ED.drag.moved ? edPartView(ED.drag.part) : null;
    if (ED.stroke) return null;
    if (!B.codeAt(ED.grid, hit.c, hit.r)) return null;
    return edToolView(edTool(), hit);
  }

  /* WHAT THE GHOST SHOWS RIGHT NOW, worked out before anything is
     touched, and kept on ED so it can be compared with what is
     already on screen -- and so the rule tests can ask what the
     pointer would be showing without a pointer or a screen. Null when
     there is nothing to preview. */
  function edGhostPaint() {
    var hit = ED.hover, g = edGhostView(hit);
    var would = g ? edClickWould(ED.drag ? ED.drag.part.kind : edTool().kind, hit) : "take";
    /* A click that picks something UP previews nothing: the square
       already shows the thing that would come off it. */
    var html = g && would !== "take" ? edThumbHTML(g, TILE, Math.round(TILE * 0.19)) : null;
    var was = ED.ghostHTML;
    ED.ghostHTML = html;

    var host = UI.els && UI.els.edBoard;
    if (!host) return;
    var ghost = host.querySelector(".pr-ed-ghost");
    if (!html) { if (ghost) ghost.hidden = true; return; }
    /* A render rebuilds the stage and takes the ghost with it, so a
       ghost that is not there has nothing to have kept. */
    if (!ghost) { ghost = el("div", "pr-ed-ghost"); host.appendChild(ghost); was = null; }
    if (html !== was) ghost.innerHTML = html;
    ghost.classList.toggle("pr-ed-ghost-no", would === "no");
    ghost.style.left = hit.c * TILE + "px";
    ghost.style.top = hit.r * TILE + "px";
    ghost.hidden = false;
  }

  /* Called on every pointer move over the map, so it does the least
     it can: the ghost and the status line move only when the square
     or the edge under the pointer has changed. */
  function edHover(e) {
    var hit = e ? edHit(e) : null, was = ED.hover;
    var same = (!hit && !was) || (hit && was && hit.c === was.c && hit.r === was.r && hit.edge === was.edge);
    ED.hover = hit;
    if (same) return;
    edGhostPaint();
    edRenderStatus();
  }

  /* What is on a square, in a line: "Column 5, row 3 -- Conveyor
     east + Ram north + Flag 2". */
  function edSquareText(c, r) {
    if (!B.inGrid(ED.grid, c, r)) return "";
    var where = "Column " + (c + 1) + ", row " + (r + 1);
    var code = B.codeAt(ED.grid, c, r);
    if (!code) return where + " — off the course";
    var parts = edParts(c, r), bits = [], i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], s = p.label;
      if (p.kind === "tile" && p.dir) s += " " + B.dirName(B.dirOf(code));
      else if (p.kind !== "tile" && p.kind !== "flag") s += " " + B.dirName(edPartObj(p).d);
      bits.push(s);
    }
    return where + " — " + bits.join(" + ");
  }

  /* One line about the tool in hand, for when the pointer is off the
     map. */
  function edHint() {
    var t = edTool();
    if (t.kind === "select") return "Click a square to see what is on it. Drag a flag or a trap to move it.";
    if (t.kind === "pan") return "Drag to move around the map. Ctrl-wheel or pinch to zoom.";
    if (t.kind === "flag") return "Click a floor square to put flag " + edFlagSlot() + " down. Drag a flag to move it; click one to pick it up.";
    if (t.kind === "wall") return "Click near the edge of a square to put a wall up or take one down.";
    if (t.paint) return "Click, or drag to lay a run. Right-click rubs out.";
    if (t.kind === "tile") return "Click a square. Right-click rubs out.";
    return "Click a square to bolt it on, facing " + B.dirName(ED.dir) + ". Click again to take it off.";
  }

  function edRenderStatus() {
    if (!UI.els || !UI.els.edStatus) return;
    var out = [];
    var hov = ED.hover ? edSquareText(ED.hover.c, ED.hover.r) : "";
    out.push('<span class="pr-ed-st-hover">' + esc(hov || edHint()) + "</span>");
    if (ED.errors.length) {
      out.push('<span class="pr-ed-bad" title="' + esc(ED.errors.join("\n")) + '">' + ED.errors.length +
        " problem" + (ED.errors.length > 1 ? "s" : "") + ": " + esc(ED.errors[0]) + "</span>");
    } else {
      out.push('<span class="pr-ed-ok">' + (ED.isCourse ? "Valid course." : "Valid board.") +
        (ED.warnings.length ? " " + esc(ED.warnings[0]) : "") + "</span>");
    }
    UI.els.edStatus.innerHTML = out.join("");
  }

  /* THE BAR: the name, the way back, the zoom and the ways out.
     Everything about the session rather than about a square. */
  function edRenderTop() {
    if (!UI.els || !UI.els.edTop) return;
    var top = UI.els.edTop;
    /* Never redraw under a hand that is typing the name. */
    var ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && top.contains(ae)) return;
    top.innerHTML = edTopBar();
  }

  /* THE BAR, as a string, so the ways out of the workshop can be
     asked for without a workshop on screen. Which three they are is
     the whole shape of what this room is for, and a fourth one
     creeping back would not show up in anything else. */
  function edTopBar() {
    var out = [], nU = (ED.undo && ED.undo.length) || 0, nF = (ED.grid.flags || []).length;
    out.push('<span class="pr-ed-title">' + (ED.isCourse ? "COURSE WORKSHOP" : "BOARD WORKSHOP") + "</span>");
    if (!ED.isCourse && !ED.fromSetup) {
      out.push('<input type="text" class="pr-ed-name" data-act="edid" value="' + esc(ED.id) +
        '" size="12" aria-label="board id" title="Board id">');
    }
    out.push('<input type="text" class="pr-ed-name" data-act="edname" value="' + esc(ED.grid.name) +
      '" size="20" aria-label="' + (ED.isCourse ? "course" : "board") + ' name" title="Name">');
    out.push('<span class="pr-ed-gap"></span>');
    out.push('<button data-act="edundo"' + (nU ? "" : " disabled") + ' title="Undo (Ctrl-Z)">&#8617; Undo' +
      (nU ? " (" + nU + ")" : "") + "</button>");
    out.push('<span class="pr-ed-zoom" role="group" aria-label="Zoom">' +
      '<button data-act="edzoom" data-z="out" title="Zoom out (-)" aria-label="Zoom out">&minus;</button>' +
      '<button data-act="edzoom" data-z="fit" data-ed="zoom" title="Fit the whole map (0)">' +
        Math.round(ED.zoom * 100) + "%</button>" +
      '<button data-act="edzoom" data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button></span>');
    out.push('<span class="pr-ed-gap"></span>');
    if (ED.isCourse) {
      /* THREE WAYS OUT, and they are the three things anybody wants
         at the end of an hour in here: throw it away, keep it, or
         race it. "Save and go on" used to mean the second, and it
         went back to a screen that could only send you here again --
         now keeping it means putting it on the shelf under its name,
         where it can be raced or reopened without being rebuilt. */
      out.push('<button data-act="edcdrop">Exit without saving</button>');
      out.push('<button data-act="edclib">Save to library</button>');
      out.push('<button class="pr-ed-go" data-act="edcplay"' + (nF ? "" : " disabled") +
        ' title="' + (nF ? "Save this course and race it" : "Put at least one flag down first") + '">' +
        "Save and play" + (nF ? " (" + nF + " flag" + (nF === 1 ? "" : "s") + ")" : "") + "</button>");
    } else if (ED.fromSetup) {
      out.push('<button data-act="edrevert">Discard changes</button>' +
        '<button data-act="edexport">Export source</button>' +
        '<button class="pr-ed-go" data-act="edapply">Use this map</button>');
    } else {
      out.push('<button data-act="edquit">Leave editor</button>' +
        '<button data-act="edexport">Export</button>' +
        '<button class="pr-ed-go" data-act="edplay">Test play</button>');
    }
    return out.join("");
  }

  /* THE FLAGS, AS THE RACE: a numbered list in the order they are
     touched, each one a row you can go to, move up or down the order,
     or take off. Always shown on a course, whatever is in hand,
     because the flags are what the course workshop is for. */
  function edFlagPanel() {
    var flags = ED.grid.flags || [], out = [], i;
    out.push('<div class="pr-ed-flags"><h3 class="pr-ed-h">Flags' +
      (flags.length ? " (" + flags.length + ")" : "") + "</h3>");
    if (!flags.length) {
      out.push('<div class="pr-ed-note">None yet. With the flag tool in hand, click a floor square.</div>');
    }
    for (i = 0; i < flags.length; i++) {
      var f = flags[i], on = ED.sel && ED.sel.c === f.c && ED.sel.r === f.r;
      out.push('<div class="pr-ed-flag' + (on ? " on" : "") + '">' +
        '<button class="pr-ed-flag-go" data-act="edflaggo" data-i="' + i +
          '" title="Go to flag ' + (i + 1) + '"><b>' + (i + 1) + "</b> col " + (f.c + 1) + ", row " + (f.r + 1) + "</button>" +
        '<button data-act="edflagshift" data-i="' + i + '" data-w="-1"' + (i ? "" : " disabled") +
          ' title="Earlier in the race" aria-label="Move flag ' + (i + 1) + ' earlier">&#9650;</button>' +
        '<button data-act="edflagshift" data-i="' + i + '" data-w="1"' + (i < flags.length - 1 ? "" : " disabled") +
          ' title="Later in the race" aria-label="Move flag ' + (i + 1) + ' later">&#9660;</button>' +
        '<button data-act="edflagdrop" data-i="' + i + '" title="Take it off" aria-label="Take flag ' +
          (i + 1) + ' off">&times;</button></div>');
    }
    if (ED.pick !== "flag") {
      out.push('<div class="pr-ed-row"><button data-act="edpick" data-k="flag">Place a flag <kbd class="pr-ed-key">F</kbd></button></div>');
    }
    out.push("</div>");
    return out.join("");
  }

  /* THE INSPECTOR.

     One place that answers "what is this and what can I change about
     it". With something selected it edits that thing; with nothing
     selected it sets what the tool in hand will lay down next. The two
     read the same because they are the same questions -- which way it
     faces, which registers it fires on, how far it reaches. On a
     course the flags come first, whatever else is going on. */
  function edRenderDetail() {
    if (!UI.els || !UI.els.edDetail) return;
    var sel = ED.sel;
    var t = edTool(), out = [];
    if (ED.isCourse) out.push(edFlagPanel());
    if (sel) {
      out.push('<h3 class="pr-ed-h">' + esc(edSelName(sel)) +
        '<button class="pr-ed-x" data-act="eddesel" title="Deselect (Esc)" aria-label="Deselect">&times;</button></h3>');
      out.push(edDetailFor(sel));
    } else {
      out.push('<h3 class="pr-ed-h">' + esc(t.label) + "</h3>");
      if (t.kind === "select") {
        out.push('<div class="pr-ed-note">Click anything on the map to see what it is and change it. ' +
          "Drag a flag or a trap to move it. Delete takes the selected thing off.</div>");
      } else if (t.kind === "pan") {
        out.push('<div class="pr-ed-note">Drag the map to move around it. With any tool, hold Space and ' +
          "drag, or drag with the middle button. Ctrl-wheel or pinch to zoom; 0 fits the whole map.</div>");
      } else {
        out.push(edToolSettings(t));
      }
    }
    if (!ED.isCourse) out.push(edRefPanel());
    UI.els.edDetail.innerHTML = out.join("");
  }
  /* WHAT IS ON THIS SQUARE, as a list of things that can be edited.

     A square is not one thing. Board H prints a conveyor with a ram
     bolted to the wall beside it, and BOTH of those have a facing --
     so a panel that showed the most specific one and called that "the
     selection" could set one facing and never the other. The selection
     is the SQUARE now, and the panel lists everything standing on it.

     `part` says which of them the keys are steering, because W A S D
     has to mean one thing at a time. */
  function edParts(c, r) {
    var g = ED.grid, out = [], i;
    var code = B.codeAt(g, c, r), def = B.elemOf(code);
    out.push({ id: "tile", kind: "tile",
               label: def ? def.name.charAt(0).toUpperCase() + def.name.slice(1) : "Off the course",
               dir: !!(def && def.arg === "dir"),
               digit: !!(def && def.arg === "digit") });
    for (i = 0; i < g.lasers.length; i++) {
      if (g.lasers[i].c === c && g.lasers[i].r === r) {
        out.push({ id: "laser:" + i, kind: "laser", i: i, label: "Laser", dir: true });
      }
    }
    for (i = 0; i < g.pushers.length; i++) {
      if (g.pushers[i].c === c && g.pushers[i].r === r) {
        out.push({ id: "pusher:" + i, kind: "pusher", i: i, label: "Ram", dir: true });
      }
    }
    for (i = 0; i < g.burners.length; i++) {
      if (g.burners[i].c === c && g.burners[i].r === r) {
        out.push({ id: "burner:" + i, kind: "burner", i: i, label: "Flame jet", dir: true });
      }
    }
    for (i = 0; i < (g.timers || []).length; i++) {
      if (g.timers[i].c === c && g.timers[i].r === r) {
        out.push({ id: "press:" + i, kind: "press", i: i, label: "Crusher", dir: false });
      }
    }
    for (i = 0; i < (g.flags || []).length; i++) {
      if (g.flags[i].c === c && g.flags[i].r === r) {
        out.push({ id: "flag:" + i, kind: "flag", i: i, label: "Flag " + (i + 1), dir: false });
      }
    }
    return out;
  }

  function edPart() {
    if (!ED.sel) return null;
    var parts = edParts(ED.sel.c, ED.sel.r), i;
    for (i = 0; i < parts.length; i++) if (parts[i].id === ED.sel.part) return parts[i];
    /* Whatever was focused is gone -- taken off, or renumbered out from
       under the focus -- so the keys fall back to the square itself. */
    return parts[0];
  }

  function edPartObj(part) {
    var g = ED.grid;
    if (!part || part.kind === "tile") return null;
    if (part.kind === "laser") return g.lasers[part.i];
    if (part.kind === "pusher") return g.pushers[part.i];
    if (part.kind === "burner") return g.burners[part.i];
    if (part.kind === "press") return (g.timers || [])[part.i];
    if (part.kind === "flag") return (g.flags || [])[part.i];
    return null;
  }

  /* The facing of whichever part the keys are steering, or -1 when
     that part has none to steer. */
  function edPartDir(part) {
    if (!part) return -1;
    if (part.kind === "tile") {
      return part.dir ? B.dirOf(B.codeAt(ED.grid, ED.sel.c, ED.sel.r)) : -1;
    }
    var obj = edPartObj(part);
    return obj && obj.d !== undefined ? obj.d : -1;
  }

  function edSelName(sel) {
    var def = B.elemOf(B.codeAt(ED.grid, sel.c, sel.r));
    return "Column " + (sel.c + 1) + ", row " + (sel.r + 1) +
      (def ? " \u2014 " + def.name : "");
  }

  /* Where a wall-mounted thing that reaches `len` squares would sit in
     a one-square view of `sel`, or null if it never reaches it. The
     answer can be off the view's grid, and is meant to be. */
  function edReachOff(m, len, sel) {
    for (var k = 0; k < len; k++) {
      if (m.c + DC[m.d] * k === sel.c && m.r + DR[m.d] * k === sel.r) {
        return { c: -DC[m.d] * k, r: -DR[m.d] * k };
      }
    }
    return null;
  }

  /* THE SQUARE, LARGE, WITH ITS WALLS ON IT.

     Drawn by the board's own renderer at a size you can aim at, with
     the four edges as buttons. A wall is a thing on an EDGE, and the
     only place an edge is unambiguous is the picture -- a row of four
     labelled buttons makes you translate "north" into "the top" every
     time you use it. */
  function edBigTile(sel) {
    var g = ED.grid, px = 132, wt = 15, d, i;
    /* EVERYTHING ON THE SQUARE, not just the square.

       The tile art reads the mounts out of the grid's sparse lists, so
       a one-square view built from the cell alone draws the belt and
       none of the traps standing on it -- which is exactly the case
       this panel exists for. Copy them across, remapped to the one
       square the view has. */
    var view = B.blankGrid(1, 1);
    view.flags = [];
    view.cell[0] = B.codeAt(g, sel.c, sel.r);
    for (i = 0; i < g.pushers.length; i++) {
      if (g.pushers[i].c === sel.c && g.pushers[i].r === sel.r) {
        view.pushers.push({ c: 0, r: 0, d: g.pushers[i].d, regs: g.pushers[i].regs.slice() });
      }
    }
    /* A jet and a beam both reach PAST the square they are bolted to,
       and the far square is drawn as fire, or as a beam, with no
       nozzle and no emitter on it. So what gets copied across is not
       "the ones standing here" but "the ones that reach here", each
       kept at its own offset -- a nozzle one square south of this one
       lands at (0,1) in a view one square wide, which is off the grid,
       which is exactly right: the art reads the lists rather than the
       bounds, and .pr-thumb clips what hangs over the edge. */
    for (i = 0; i < g.burners.length; i++) {
      var bo = edReachOff(g.burners[i], g.burners[i].len || 1, sel);
      if (bo) {
        view.burners.push({ c: bo.c, r: bo.r, d: g.burners[i].d,
                            regs: g.burners[i].regs.slice(), len: g.burners[i].len });
      }
    }
    for (i = 0; i < g.lasers.length; i++) {
      var path = B.laserPath(g, g.lasers[i]), k;
      for (k = 0; k < path.length; k++) {
        if (path[k].c === sel.c && path[k].r === sel.r) {
          view.lasers.push({ c: -DC[g.lasers[i].d] * k, r: -DR[g.lasers[i].d] * k,
                             d: g.lasers[i].d, n: g.lasers[i].n });
          break;
        }
      }
    }
    for (i = 0; i < (g.timers || []).length; i++) {
      if (g.timers[i].c === sel.c && g.timers[i].r === sel.r) {
        view.timers.push({ c: 0, r: 0, regs: g.timers[i].regs.slice() });
      }
    }
    for (i = 0; i < (g.flags || []).length; i++) {
      if (g.flags[i].c === sel.c && g.flags[i].r === sel.r) {
        view.flags.push({ c: 0, r: 0, n: i + 1 });
      }
    }
    /* And the square's own walls, so the big picture is the square as
       the board draws it rather than the square with its edges stated
       separately. The buttons sit over these. */
    for (d = 0; d < 4; d++) if (B.wallAt(g, sel.c, sel.r, d)) B.setWall(view, 0, 0, d, true);

    var out = ['<div class="pr-ed-big" style="--tile:' + px + "px;--wt:" + wt + 'px;width:' +
      px + "px;height:" + px + 'px">'];
    if (view.cell[0]) {
      out.push('<span class="pr-thumb" style="--tile:' + px + "px;--wt:" + wt + 'px;width:' +
        px + "px;height:" + px + 'px"><span class="pr-thumb-grid" style="grid-template-columns:' +
        px + 'px"><i class="' + tileClasses(view, 0, 0).join(" ") + '">' +
        tileInner(view, 0, 0) + "</i></span>" +
        (view.lasers.length ? '<span class="pr-thumb-beams">' + beamSpans(view) + "</span>" : "") +
        '<span class="pr-thumb-walls">' + wallSpans(view) + "</span></span>");
    } else {
      out.push('<span class="pr-ed-void">off the<br>course</span>');
    }
    for (d = 0; d < 4; d++) {
      var on = B.wallAt(g, sel.c, sel.r, d);
      out.push('<button class="pr-ed-wall pr-w' + d + (on ? " on" : "") +
        '" data-act="edselwall" data-d="' + d + '" aria-pressed="' + (on ? "true" : "false") +
        '" title="' + (on ? "Take down" : "Put up") + " the wall on the " + B.dirName(d) +
        ' side" aria-label="' + (on ? "Take down" : "Put up") + " the wall on the " +
        B.dirName(d) + ' side"></button>');
    }
    out.push("</div>");
    out.push('<div class="pr-ed-note">Click an edge of the square to put a wall up or take one ' +
      "down.</div>");
    return out.join("");
  }

  /* A COMPASS, not a row of words.

     Four facings arranged the way they point, so "which way does it
     go" is answered by aiming rather than by reading. The middle shows
     the one it is on, and W A S D hit the same four. */
  function edCompass(act, cur, extra) {
    var out = ['<div class="pr-ed-compass" role="group" aria-label="Facing">'];
    var at = { 0: "n", 1: "e", 2: "s", 3: "w" };
    for (var d = 0; d < 4; d++) {
      out.push('<button class="pr-ed-cp pr-' + at[d] + (cur === d ? " on" : "") +
        '" data-act="' + act + '" data-d="' + d + (extra || "") +
        '" aria-pressed="' + (cur === d ? "true" : "false") +
        '" title="Face it ' + B.dirName(d) + '" aria-label="Face it ' + B.dirName(d) + '">' +
        ["&#9650;", "&#9654;", "&#9660;", "&#9664;"][d] + "</button>");
    }
    out.push('<span class="pr-ed-cp-mid">' + (cur >= 0 ? esc(B.dirName(cur).charAt(0).toUpperCase()) : "") +
      "</span></div>");
    return out.join("");
  }

  function edDetailFor(sel) {
    var parts = edParts(sel.c, sel.r), focus = edPart(), out = [], i;
    out.push(edBigTile(sel));

    for (i = 0; i < parts.length; i++) {
      var p = parts[i], on = focus && focus.id === p.id;
      out.push('<div class="pr-ed-part' + (on ? " on" : "") + '">');
      out.push('<button class="pr-ed-part-h" data-act="edselpart" data-p="' + esc(p.id) + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '">' + esc(p.label) +
        (p.dir ? " \u2014 " + esc(B.dirName(edPartDir(p))) : "") + "</button>");
      out.push(edPartBody(p));
      out.push("</div>");
    }

    if (parts.length > 1) {
      out.push('<div class="pr-ed-note">A square can carry a belt and a wall-mounted trap at once, ' +
        "and both of them turn. Click one to point the keys at it.</div>");
    }
    out.push('<div class="pr-ed-note">W A S D face it north, west, south and east. Q and E turn it ' +
      "a quarter each way.</div>");
    return out.join("");
  }

  function edPartBody(p) {
    var out = [], obj = edPartObj(p), sel = ED.sel;
    if (p.kind === "tile") {
      if (p.dir) out.push(edCompass("edseldir", edPartDir(p), '" data-p="tile'));
      if (p.digit) {
        out.push(edNumberRow("Bay", "edselnum", parseInt(B.codeAt(ED.grid, sel.c, sel.r).charAt(1), 10),
          1, 8, "tile"));
      }
      out.push('<div class="pr-ed-row"><button data-act="edselclear">Make it floor</button></div>');
      return out.join("");
    }
    if (p.kind === "flag") {
      out.push(edNumberRow("Number", "edselnum", p.i + 1, 1, (ED.grid.flags || []).length, p.id));
      out.push('<div class="pr-ed-note">Changing the number moves it in the order the flags are ' +
        "raced. The others shuffle round it.</div>");
      out.push('<div class="pr-ed-row"><button data-act="edselremove" data-p="' + esc(p.id) +
        '">Take it off</button></div>');
      return out.join("");
    }
    if (p.kind === "press") {
      out.push('<div class="pr-ed-note">A crusher comes down from above, so it needs no wall and ' +
        "faces nowhere. Anything standing under it in one of its registers is destroyed, not " +
        "damaged \u2014 and the square beneath it can be a conveyor.</div>");
      out.push(edRegRow("Comes down in", "edselreg", obj.regs, p.id));
      out.push('<div class="pr-ed-row"><button data-act="edselremove" data-p="' + esc(p.id) +
        '">Take it off</button></div>');
      return out.join("");
    }
    out.push(edCompass("edseldir", edPartDir(p), '" data-p="' + p.id));
    out.push('<div class="pr-ed-note">Bolted to the wall on its ' +
      esc(B.dirName(edMountFace(obj))) + " side. Turning it takes the wall with it.</div>");
    if (p.kind === "laser") out.push(edNumberRow("Damage", "edselnum", obj.n, 1, 3, p.id));
    if (p.kind === "pusher" || p.kind === "burner" || p.kind === "press") {
      out.push(edRegRow(p.kind === "press" ? "Comes down in" : "Fires in", "edselreg", obj.regs, p.id));
    }
    if (p.kind === "burner") out.push(edNumberRow("Reaches", "edselnum", obj.len, 1, 2, p.id));
    out.push('<div class="pr-ed-row"><button data-act="edselremove" data-p="' + esc(p.id) +
      '">Take it off</button></div>');
    return out.join("");
  }

  function edToolSettings(t) {
    var out = [];
    if (t.dir) out.push(edCompass("eddir", ED.dir, ""));
    if (t.digit) out.push(edNumberRow("Bay", "eddigit", ED.digit, 1, 8));
    if (t.damage) out.push(edNumberRow("Damage", "edlaser", ED.laserN, 1, 3));
    if (t.regs === "push") {
      out.push(edRegRow("Fires in", "edpreg", ED.pushRegs));
      out.push('<div class="pr-ed-row"><button data-act="edpreset" data-p="odd">1/3/5</button>' +
        '<button data-act="edpreset" data-p="even">2/4</button></div>');
    }
    if (t.regs === "burn") out.push(edRegRow("Fires in", "edbreg", ED.burnRegs));
    if (t.regs === "press") {
      out.push(edRegRow("Comes down in", "edpressreg", ED.pressRegs));
      out.push('<div class="pr-ed-row"><button data-act="edpresspreset" data-p="15">1/5</button>' +
        '<button data-act="edpresspreset" data-p="24">2/4</button>' +
        '<button data-act="edpresspreset" data-p="3">3</button></div>');
      out.push('<div class="pr-ed-note">Needs no wall and faces nowhere. It destroys what is under ' +
        "it rather than damaging it, and the square beneath it can be a conveyor.</div>");
    }
    if (t.reach) out.push(edNumberRow("Reaches", "edblen", ED.burnLen, 1, 2));
    if (t.number) {
      out.push(edNumberRow("Next flag", "edflagnum", edFlagSlot(), 1, (ED.grid.flags || []).length + 1));
      out.push('<div class="pr-ed-note">Each click lays the next number. Keys 1 to 9, or Q and E, ' +
        "change the number in hand. Clicking a flag already down picks it up.</div>");
    }
    if (t.paint) {
      out.push('<div class="pr-ed-note">Drag to lay a run: each square turns to point at the next. ' +
        "A belt dropped beside one that points at it carries on the same way.</div>");
    }
    if (t.regs || t.damage) {
      out.push('<div class="pr-ed-note">It bolts to the wall behind it, and the wall goes up with it.</div>');
    }
    if (t.dir) {
      out.push('<div class="pr-ed-note">W A S D face it; Q and E turn it a quarter each way.</div>');
    }
    return out.join("");
  }
  function edNumberRow(label, act, cur, lo, hi, part) {
    var pa = part ? '" data-p="' + esc(part) : "";
    var out = ['<div class="pr-ed-row"><span>' + esc(label) + "</span>"];
    for (var n = lo; n <= hi; n++) {
      out.push('<button data-act="' + act + '" data-n="' + n + pa + '"' +
        (cur === n ? ' class="on"' : "") + ">" + n + "</button>");
    }
    out.push("</div>");
    return out.join("");
  }

  function edRegRow(label, act, regs, part) {
    var pa = part ? '" data-p="' + esc(part) : "";
    var out = ['<div class="pr-ed-row"><span>' + esc(label) + "</span>"];
    for (var n = 1; n <= 5; n++) {
      out.push('<button data-act="' + act + '" data-n="' + n + pa + '"' +
        (regs.indexOf(n) >= 0 ? ' class="on"' : "") + ">" + n + "</button>");
    }
    out.push("</div>");
    return out.join("");
  }

  /* THE REFERENCE PHOTOGRAPH, for a board being traced. A course is
     not traced from anything, so a course workshop has none of this. */
  /* OPEN OR SHUT IS STATE, NOT MARKUP.

     This was a <details>, and the inspector is rebuilt on every render
     -- so the first touch of Fade, Size or Nudge redrew the panel, put
     a fresh <details> in its place, and the thing shut under your hand
     mid-drag. A browser's own open/shut lives on the element, and this
     element does not survive. It lives on ED now, where it does. */
  function edRefPanel() {
    var open = ED.refOpen === undefined ? !!ED.underlay : ED.refOpen;
    var head = '<div class="pr-ed-ref"><button class="pr-ed-ref-head pr-ed-h" data-act="edreftoggle"' +
      ' aria-expanded="' + (open ? "true" : "false") + '">' + (open ? "\u25be" : "\u25b8") +
      " Reference photo</button>";
    if (!open) return head + "</div>";
    return head +
      '<div class="pr-ed-note">Drop a photograph behind the grid and trace it. It stays on this ' +
      "machine and is never exported.</div>" +
      '<div class="pr-ed-row"><input type="file" accept="image/*" data-act="edimg"></div>' +
      '<div class="pr-ed-row"><span>Fade</span><input type="range" min="0" max="100" value="' +
        Math.round(ED.opacity * 100) + '" data-act="edop" aria-label="Reference image fade">' +
      '<span>Size</span><input type="range" min="50" max="200" value="' + Math.round(ED.uScale * 100) +
        '" data-act="edscale" aria-label="Reference image size"></div>' +
      '<div class="pr-ed-row"><span>Nudge</span>' +
      '<button data-act="ednudge" data-dx="-4" data-dy="0" aria-label="Nudge left">&larr;</button>' +
      '<button data-act="ednudge" data-dx="4" data-dy="0" aria-label="Nudge right">&rarr;</button>' +
      '<button data-act="ednudge" data-dx="0" data-dy="-4" aria-label="Nudge up">&uarr;</button>' +
      '<button data-act="ednudge" data-dx="0" data-dy="4" aria-label="Nudge down">&darr;</button></div>' +
      '<div class="pr-ed-row"><button data-act="edsolo"' + (ED.soloLatch ? ' class="on"' : "") +
        '>Photo only</button><span>hold Ctrl to flip</span>' +
      '<button data-act="edclearimg"' + (ED.underlay ? "" : " disabled") + ">Remove</button></div>" +
      "</div>";
  }

  /* THE PHOTO MOVES; THE BOARD DOES NOT.

     Fade, Size and Nudge change one image and nothing else, so they
     must not go through edRender -- which rebuilds the stage, the
     panel and the controls you are currently dragging. Sliding the
     fade used to redraw the slider out from under the pointer, which
     ends the drag. */
  function edUnderlayPaint() {
    /* WITH NO PHOTOGRAPH THERE IS NOTHING TO MOVE, and the redraw this
       used to fall through to is the same redraw that pulled the panel
       shut -- so the bug was still there for anybody who touched the
       controls BEFORE loading a photo, which is most people the first
       time. Says what it did, so a test can ask. */
    if (!ED.underlay) return "none";
    var host = UI.els && UI.els.edBoard;
    if (!host) return "noscreen";              // the rule tests, which have none
    var img = host.querySelector(".pr-ed-under");
    if (!img) { edRender(); return "drew"; }   // loaded but not on the stage yet
    img.style.opacity = edSolo() ? 1 : ED.opacity;
    img.style.left = ED.offX + "px";
    img.style.top = ED.offY + "px";
    img.style.width = (ED.grid.w * TILE * ED.uScale) + "px";
    return "painted";
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

  /* WHAT THE WORKSHOP LOOKS LIKE FROM THE OUTSIDE, as a string.

     A grid is a picture, four wall lattices and four sparse lists, and
     carrying them all back by hand is four chances to forget one --
     the rams have vanished from a round trip twice in this repo's
     history. So a snapshot is the same serialisation the editor
     already exports and the same parse it already imports, which
     cannot drift from the grid because it IS how a grid is written
     down. */
  function edSnapshot() {
    var g = ED.grid;
    return JSON.stringify({
      w: g.w, h: g.h, pic: B.gridToPic(g), voids: !!ED.isCourse,
      name: g.name, notes: g.notes,
      lasers: g.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
      pushers: g.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
      burners: g.burners.map(function (F) { return { c: F.c, r: F.r, d: "NESW".charAt(F.d), regs: F.regs.slice(), len: F.len }; }),
      timers: g.timers.map(function (T) { return { c: T.c, r: T.r, regs: T.regs.slice() }; }),
      flags: (g.flags || []).map(function (f) { return [f.c, f.r]; })
    });
  }

  function edRestoreSnap(text) {
    var s = JSON.parse(text), keepOrigin = ED.grid.origin;
    var g = B.parsePic(ED.id, s);
    g.name = s.name; g.notes = s.notes; g.origin = keepOrigin;
    g.flags = (s.flags || []).map(function (f) { return { c: f[0], r: f[1] }; });
    ED.grid = g;
  }

  /* ONE STEP BACK, AS MANY TIMES AS IT TAKES.

     Tracing a board is an hour of small mistakes, and before this the
     only way back from one was to draw over it -- which works for a
     tile and does not work at all for a wall you did not mean to
     toggle or a flag you did not mean to renumber.

     Marked BEFORE the change and dropped again if nothing changed, so
     a click on a square that was already floor does not cost a step of
     history. */
  function edMark() {
    ED.undo = ED.undo || [];
    var snap = edSnapshot();
    ED.undo.push(snap);
    if (ED.undo.length > 60) ED.undo.shift();
    return snap;
  }

  function edKeep(before) {
    if (ED.undo && ED.undo.length && edSnapshot() === before) ED.undo.pop();
  }

  function edUndo() {
    if (!ED.undo || !ED.undo.length) { announce("Nothing to undo."); return; }
    edRestoreSnap(ED.undo.pop());
    edValidate();
    edSave();
    edRender();
    edRenderPanel();
    announce("Undone.");
  }

  /* ONE PLACE THAT PUTS A THING DOWN, whatever asked for it -- a
     click, the end of a paint stroke, or a hazard dragged off the
     library. Three callers, one definition of what placing means. */
  function edPut(kind, c, r, opt) {
    var g = ED.grid, i;
    opt = opt || {};
    if (!B.inGrid(g, c, r)) return false;
    if (kind === "tile") {
      edSetCell(c, r, opt.code || edToolCode());
      return true;
    }
    if (kind === "wall") {
      if (opt.edge === null || opt.edge === undefined) return false;
      if (B.wallAt(g, c, r, opt.edge) && edWallNeeded(c, r, opt.edge)) {
        announce("Something on this square is bolted to that wall. Take it off first.");
        return false;
      }
      B.setWall(g, c, r, opt.edge, !B.wallAt(g, c, r, opt.edge));
      return true;
    }
    if (kind === "laser") {
      for (i = 0; i < g.lasers.length; i++) {
        if (g.lasers[i].c === c && g.lasers[i].r === r) { g.lasers.splice(i, 1); return true; }
      }
      if (opt.erase) return false;
      g.lasers.push({ c: c, r: r, d: opt.dir === undefined ? ED.dir : opt.dir,
                      n: opt.n || ED.laserN });
      B.setWall(g, c, r, edMountFace(g.lasers[g.lasers.length - 1]), true);
      return true;
    }
    if (kind === "pusher") {
      for (i = 0; i < g.pushers.length; i++) {
        if (g.pushers[i].c === c && g.pushers[i].r === r) { g.pushers.splice(i, 1); return true; }
      }
      if (opt.erase) return false;
      if (!ED.pushRegs.length) { announce("Pick at least one register for the ram first."); return false; }
      g.pushers.push({ c: c, r: r, d: opt.dir === undefined ? ED.dir : opt.dir,
                       regs: ED.pushRegs.slice().sort() });
      B.setWall(g, c, r, edMountFace(g.pushers[g.pushers.length - 1]), true);
      return true;
    }
    if (kind === "burner") {
      for (i = 0; i < g.burners.length; i++) {
        if (g.burners[i].c === c && g.burners[i].r === r) { g.burners.splice(i, 1); return true; }
      }
      if (opt.erase) return false;
      if (!ED.burnRegs.length) { announce("Pick at least one register for the jet first."); return false; }
      g.burners.push({ c: c, r: r, d: opt.dir === undefined ? ED.dir : opt.dir,
                       regs: ED.burnRegs.slice().sort(), len: ED.burnLen });
      B.setWall(g, c, r, edMountFace(g.burners[g.burners.length - 1]), true);
      return true;
    }
    if (kind === "press") {
      g.timers = g.timers || [];
      for (i = 0; i < g.timers.length; i++) {
        if (g.timers[i].c === c && g.timers[i].r === r) { g.timers.splice(i, 1); return true; }
      }
      if (opt.erase) return false;
      if (!ED.pressRegs.length) { announce("Pick at least one register for the crusher first."); return false; }
      /* A pit has no floor to flatten anything against, and the
         validator refuses it -- said here instead, where it is about
         the square you just clicked. */
      if (B.isPit(B.codeAt(g, c, r))) { announce("A crusher needs a floor under it, not a pit."); return false; }
      g.timers.push({ c: c, r: r, regs: ED.pressRegs.slice().sort() });
      return true;
    }
    if (kind === "flag") {
      g.flags = g.flags || [];
      for (i = 0; i < g.flags.length; i++) {
        if (g.flags[i].c === c && g.flags[i].r === r) {
          /* Clicking a flag picks it up, and the number it was comes
             back into the hand so putting it down again restores the
             order rather than appending to the end. */
          g.flags.splice(i, 1);
          ED.flagNum = i + 1;
          return true;
        }
      }
      if (opt.erase) return false;
      var el0 = B.elemOf(B.codeAt(g, c, r));
      if (!el0 || el0.name !== "floor") { announce("A flag can only sit on plain floor."); return false; }
      var dk = ED.dock;
      if (dk && c >= dk.at[0] && c <= dk.at[0] + 11 && r >= dk.at[1] && r <= dk.at[1] + 3) {
        announce("That is the starting block. A flag there is touched before the race begins.");
        return false;
      }
      var at = edFlagSlot() - 1;
      g.flags.splice(at, 0, { c: c, r: r });
      ED.flagNum = at + 2;
      return true;
    }
    return false;
  }

  function edClick(e, erase) {
    /* A drag that moved something, or a two-finger gesture, ends in a
       click the browser still delivers. It has been dealt with. */
    if (ED.swallowClick) { ED.swallowClick = false; return; }
    var hit = edHit(e);
    if (!hit) return;
    var kind = edTool().kind;
    if (kind === "pan") return;
    /* A PAINT TOOL BELONGS TO THE POINTER, WHOLE.

       Pressing and releasing without moving is a stroke of one square,
       which the paint path already lays -- so letting the click
       through as well would place it twice, and guarding against that
       with a flag set at the end of a drag leaves the flag standing
       when no click follows. Left button: the pointer owns it. Right
       button rubs out, and never starts a stroke. */
    if (!erase && kind === "tile" && edTool().paint) return;

    /* SELECT looks rather than places. Everything about the thing
       under the pointer then lives in the inspector, which is where
       changing it lives too. */
    if (kind === "select") {
      edSelect(hit.c, hit.r);
      return;
    }

    var before = edMark();
    /* Near an edge, that edge; anywhere else, the way the compass is
       pointing -- so a run of walls can be laid with W A S D and the
       pointer aimed at the middle of each square. */
    var did = kind === "wall"
      ? edPut("wall", hit.c, hit.r, { edge: hit.edge === null ? ED.dir : hit.edge })
      : kind === "tile"
        ? edPut("tile", hit.c, hit.r, { code: erase ? ".." : edPaintCode(hit.c, hit.r) })
        : edPut(kind, hit.c, hit.r, { erase: erase });
    if (!did) { edKeep(before); return; }
    /* What was just put down is what you are looking at, and the panel
       points its keys at it -- EXCEPT a flag. Flags are laid in runs,
       and the thing you want to keep steering between clicks is the
       number in hand, not the one already down. */
    if (kind === "flag") ED.sel = null;
    else edSelect(hit.c, hit.r, kind === "tile" ? "tile" : edLastPart(kind), true);
    edKeep(before);
    edAfterEdit();
  }
  /* The code a tile tool lays HERE, which for a belt is the run it is
     joining rather than the facing in the toolbar. */
  function edPaintCode(c, r) {
    var t = edTool();
    if (!t.paint) return edToolCode();
    var speed = t.key === "B" ? 2 : 1;
    return t.key + B.DIR_CHARS.charAt(edBeltDir(c, r, speed, ED.dir));
  }

  /* Selecting a square points the panel at it, and at whichever part
     of it makes sense to steer: the thing just put down, or the first
     thing on the square that has a facing at all. */
  function edSelect(c, r, part, quiet) {
    var parts = edParts(c, r), want = part, i;
    if (!want) {
      want = parts[0].id;
      for (i = 0; i < parts.length; i++) if (parts[i].dir) { want = parts[i].id; break; }
    }
    ED.sel = { c: c, r: r, part: want };
    if (!quiet) { edRender(); edRenderPanel(); }
  }

  /* The part id of the LAST thing of this kind on the grid, which is
     the one just pushed onto its list. */
  function edLastPart(kind) {
    var list = kind === "laser" ? ED.grid.lasers
             : kind === "pusher" ? ED.grid.pushers
             : kind === "press" ? ED.grid.timers
             : kind === "burner" ? ED.grid.burners : null;
    return list && list.length ? kind + ":" + (list.length - 1) : "tile";
  }

  function edAfterEdit() {
    edValidate();
    edSave();
    edRender();
    edRenderPanel();
  }

  /* PAINTING A RUN.

     Pointer down starts a stroke and pointer-over continues it: each
     square you leave is turned to point at the one you moved to, so a
     drag lays a belt that goes where the hand went. One stroke is one
     step of history, because undoing a twelve-square run twelve times
     is not undoing it. */
  function edPaintStart(e) {
    var t = edTool();
    if (!t.paint || ED.mode !== "tile") return;
    var hit = edHit(e);
    if (!hit || !B.codeAt(ED.grid, hit.c, hit.r)) return;
    ED.stroke = { before: edMark(), last: { c: hit.c, r: hit.r }, n: 1 };
    edPut("tile", hit.c, hit.r, { code: edPaintCode(hit.c, hit.r) });
    ED.sel = null;
    edValidate();
    edRender();
  }

  function edPaintOver(e) {
    if (!ED.stroke) return;
    var hit = edHit(e);
    if (!hit) return;
    if (edStrokeTo(hit.c, hit.r)) { edValidate(); edRender(); }
  }

  /* CARRY THE STROKE ON to a square, laying every square between.

     A quick hand skips squares -- at a small zoom a single pointer
     move can cross four of them -- and a stroke that only laid the
     squares it happened to be told about left gaps in a run whenever
     the mouse was moved at speed. So the gap is walked one step at a
     time, along the row first and then the column: a diagonal jump
     lays an L rather than guessing at a corner nobody drew. Each
     square is turned to point at the next, which is what a run is.
     Squares off the course are stepped over, not painted into. */
  function edStrokeTo(c, r) {
    var st = ED.stroke, at = { c: st.last.c, r: st.last.r }, t = edTool(), did = false;
    if (at.c === c && at.r === r) return false;
    while (at.c !== c || at.r !== r) {
      var d = at.c !== c ? (c > at.c ? E : W) : (r > at.r ? S : N);
      var nx = B.step(at.c, at.r, d), code = t.key + B.DIR_CHARS.charAt(d);
      if (B.codeAt(ED.grid, at.c, at.r)) { edSetCell(at.c, at.r, code); did = true; }
      if (B.codeAt(ED.grid, nx.c, nx.r)) { edSetCell(nx.c, nx.r, code); did = true; }
      at = nx;
      st.n++;
    }
    st.last = { c: c, r: r };
    return did;
  }

  function edPaintEnd() {
    if (!ED.stroke) return;
    var st = ED.stroke;
    ED.stroke = null;
    edKeep(st.before);
    edAfterEdit();
  }

  /* THE WHOLE COURSE, NOT ONE BOARD.

     A board is a printed thing and its picture belongs to it. A course
     is an arrangement, and once somebody has moved a pit on the
     assembled course the change belongs to the COURSE -- there is no
     board it could be written back to without changing every other
     course that board appears in.

     So the workshop opens on the stitched grid and hands back a
     picture of it. Flags are offered here and nowhere else in the
     workshop, because flags are not printed on boards: they are
     placed on a course, which is exactly what this is. */
  function edMountCourse(host) {
    var L = layoutNow();
    /* A layout that IS a shipped course opens with that course's own
       flags already on it. They are transcribed rather than invented,
       so throwing them away and asking somebody to place them again
       would be losing data to make a point about where flags come
       from. Move them, add to them, or take them off. */
    var start = (L.edit && L.edit.flags) || B.defaultFlagsFor(L) || [];
    var spec = B.composeCourse(B.withFlags(L, start), 0);
    var grid;
    if (L.edit) grid = B.parsePic("course", L.edit);   // L.edit carries voids:true
    else grid = B.buildCourse(spec);
    grid.name = (L.edit && L.edit.name) || (layoutIsCourse() ? B.COURSES[layoutIsCourse()].name : "Your course");
    grid.origin = "authored";
    grid.flags = start.map(function (f) { return { c: f[0], r: f[1] }; });
    edMount(host, null, true, { grid: grid, boards: spec.boards, dock: spec.dock });
  }

  /* A course arriving in the workshop: its boards and block kept for
     the validator, the next flag numbered after the ones already on
     it, and THE FLAG TOOL IN HAND -- the one thing every course has
     to have done to it here is flags, so the workshop opens ready to
     lay them rather than with a conveyor nobody asked for. */
  function edOpenCourse(course) {
    ED.isCourse = true;
    ED.boards = course.boards;
    ED.dock = course.dock;
    ED.flagNum = (ED.grid.flags || []).length + 1;
    ED.pick = "flag";
    ED.mode = "flag";
  }

  function edMount(host, bootId, fromSetup, course) {
    injectCSS();
    host.classList.add("pr-root", "pr-editing");
    host.innerHTML = "";
    /* The editor draws the same tiles the board does, so it needs the
       same pattern. Without this, url(#pr-hz) resolves to nothing here
       and every striped thing -- pusher decks, pit rims -- paints empty,
       which reads as "the art is wrong" rather than "a definition is
       missing three thousand lines away". */
    host.insertAdjacentHTML("beforeend", HAZARD_DEFS);

    var restored = edRestore();
    if (course) ED = edState(course.grid, "course");
    else if (bootId && B.BOARD_SPECS[bootId]) ED = edState(edLoadShipped(bootId), bootId);
    else if (restored) ED = restored;
    else ED = edState(edNew(12, 12), "newBoard");
    if (course) edOpenCourse(course);
    /* Opened from the race menu, not from a URL: the edit belongs to
       the game about to start, so it goes back there rather than out
       to a blank page. */
    ED.fromSetup = !!fromSetup;
    ED.uScale = ED.uScale || 1;

    /* FIVE REGIONS ON A FULL SCREEN: the bar, the rail, the map, the
       inspector, the status line. The map is a scroll box with the
       stage inside it, so panning is scrolling and the browser does
       the work. */
    var top = el("div", "pr-ed-top");
    var rail = el("div", "pr-ed-rail");
    rail.setAttribute("role", "toolbar");
    rail.setAttribute("aria-label", "Tools");
    var view = el("div", "pr-ed-view");
    var canvas = el("div", "pr-ed-canvas");
    var stage = el("div", "pr-ed-stage");
    var side = el("div", "pr-ed-side");
    var status = el("div", "pr-ed-status");
    var overlay = el("div", "pr-overlay");
    overlay.hidden = true;
    var sr = el("div", "pr-sr");
    sr.setAttribute("aria-live", "polite");

    canvas.appendChild(stage);
    view.appendChild(canvas);
    host.appendChild(top);
    host.appendChild(rail);
    host.appendChild(view);
    host.appendChild(side);
    host.appendChild(status);
    host.appendChild(overlay);
    host.appendChild(sr);

    UI.els = { host: host, edBoard: stage, edCanvas: canvas, edView: view, edTop: top,
               edLib: rail, edDetail: side, edStatus: status, overlay: overlay, sr: sr };
    UI.mounted = false;                 // there is no game here to render

    document.addEventListener("keydown", edKey);
    document.addEventListener("keyup", edKeyUp);
    root.addEventListener("blur", edBlur);

    stage.addEventListener("click", function (e) { edClick(e, false); });
    stage.addEventListener("contextmenu", function (e) { e.preventDefault(); edClick(e, true); });

    /* EVERY POINTER GESTURE OVER THE MAP starts here and is one of
       four things: a pan, a pinch, a drag of something already down,
       or a stroke of the tool in hand. */
    view.addEventListener("pointerdown", function (e) {
      if (modalOpen()) return;
      if (e.pointerType === "touch" && edTouchDown(e)) return;
      var pan = e.button === 1 || (e.button === 0 && (ED.spaceHeld || edTool().kind === "pan"));
      if (pan) { e.preventDefault(); edPanStart(e); return; }
      if (e.button !== 0) return;
      var hit = edHit(e);
      if (!hit) return;
      var mov = edMovable(hit);
      if (mov) { ED.drag = { part: mov, from: hit, x: e.clientX, y: e.clientY, moved: false }; return; }
      edPaintStart(e);
    });
    view.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" && edTouchMove(e)) return;
      if (ED.pan) { edPanMove(e); return; }
      if (ED.drag) { edDragMove(e); return; }
      if (ED.stroke) { edPaintOver(e); return; }
      edHover(e);
    });
    view.addEventListener("pointerleave", function () { if (ED && !ED.pan && !ED.drag) edHover(null); });
    /* Ctrl-wheel -- which is also what a trackpad pinch arrives as --
       zooms about the pointer. A plain wheel scrolls, as it does in
       every other scroll box. */
    view.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var box = view.getBoundingClientRect();
      var f = Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.01);
      edZoomTo(ED.zoom * f, e.clientX - box.left, e.clientY - box.top);
    }, { passive: false });
    view.addEventListener("dblclick", function (e) {
      if (edTool().kind !== "pan") return;
      var box = view.getBoundingClientRect();
      edZoomTo(ED.zoom * 1.5, e.clientX - box.left, e.clientY - box.top);
    });

    /* Dropping a hazard out of the rail. */
    stage.addEventListener("dragover", function (e) {
      if (!ED || !ED.dragTool) return;
      var cell = e.target.closest(".pr-ed-cell");
      if (!cell) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      cell.classList.add("pr-over");
    });
    stage.addEventListener("dragleave", function (e) {
      var cell = e.target.closest(".pr-ed-cell");
      if (cell) cell.classList.remove("pr-over");
    });
    stage.addEventListener("drop", function (e) {
      if (!ED || !ED.dragTool) return;
      var hit = edHit(e);
      if (!hit) return;
      e.preventDefault();
      var t = edToolByKey(ED.dragTool);
      ED.dragTool = null;
      if (!t) return;
      var before = edMark();
      var did = t.kind === "tile"
        ? edPut("tile", hit.c, hit.r, { code: edPaintCode(hit.c, hit.r) })
        : edPut(t.kind, hit.c, hit.r, {});
      if (!did) { edKeep(before); edRender(); return; }
      if (t.kind !== "flag") edSelect(hit.c, hit.r, t.kind === "tile" ? "tile" : edLastPart(t.kind), true);
      edKeep(before);
      edAfterEdit();
    });
    edWire(host, document);

    edValidate();
    edRender();
    /* Open on the whole map, as large as the screen allows. */
    edZoomFit();
    edRenderPanel();
  }

  /* THE LISTENERS THAT OUTLIVE THE WORKSHOP, bound once.

     The stage and the viewport are built fresh on every open and
     their listeners die with them. These do not: the host element is
     the page, and the document is the document, so binding them per
     open bound another set every time -- and the workshop is reopened
     routinely now, so the third visit deleted three flags for one
     click on the cross and undid three steps for one press of undo.

     The same bug, in the same shape, as the one mount() was caught
     with: innerHTML clears the children and leaves the listeners on
     the parent. Guarded the same way, and every handler checks ED as
     well, because these stay bound over the game once the workshop
     has closed. */
  function edWire(host, doc) {
    if (host.__prEdWired) return;
    host.__prEdWired = true;

    doc.addEventListener("pointerup", function (e) {
      if (!ED) return;
      if (e.pointerType === "touch") edTouchUp(e);
      if (ED.pan) edPanEnd();
      else if (ED.drag) edDragEnd();
      else edPaintEnd();
    });
    doc.addEventListener("pointercancel", function (e) {
      if (!ED) return;
      if (e.pointerType === "touch") edTouchUp(e);
      if (ED.pan) edPanEnd();
      if (ED.drag) { ED.drag = null; host.classList.remove("pr-ed-dragging"); }
      if (ED.stroke) edPaintEnd();
    });
    host.addEventListener("dragstart", function (e) {
      if (!ED) return;
      var item = e.target.closest(".pr-ed-item[draggable=true]");
      if (!item) { e.preventDefault(); return; }
      /* The library entry travels on ED rather than in dataTransfer,
         for the reason the assembler's boards do: Safari will not let
         a dragover handler read the payload. */
      ED.dragTool = item.dataset.k;
      /* The RAIL redraws, the map does not. A drag begins on an
         element and rebuilding the map under the pointer is how the
         board assembler's drags were cancelled; the hit grid the
         pointer is about to travel over must survive the gesture. */
      edPickQuiet(item.dataset.k);
      try { e.dataTransfer.setData("text/plain", "tool"); e.dataTransfer.effectAllowed = "copy"; }
      catch (err) {}
    });
    host.addEventListener("dragend", function () {
      if (!ED) return;
      ED.dragTool = null;
      var over = host.querySelectorAll(".pr-ed-cell.pr-over");
      for (var i = 0; i < over.length; i++) over[i].classList.remove("pr-over");
    });
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
  }

  function edKey(e) {
    if (!ED) return;
    /* The photo flip is checked before the modal guard on purpose --
       it changes nothing in the board, and releasing Control with an
       export dialog open must still put the map back. */
    if (e.key === "Control") {
      if (ED.soloHold) return;               // keydown repeats while held
      ED.soloHold = true;
      edSoloPaint();
      return;
    }
    if (modalOpen()) { if (e.key === "Escape") closeModal(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      edUndo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    /* Typing into the name must not steer the tool; Escape puts the
       keys back on the map. */
    var ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
      if (e.key === "Escape") ae.blur();
      return;
    }
    var k = e.key;
    if (k === " ") {
      /* Space held turns the pointer into the hand, whatever is in it. */
      if (!ED.spaceHeld) { ED.spaceHeld = true; UI.els.host.classList.add("pr-ed-space"); }
      e.preventDefault();
      return;
    }
    if (k === "Escape") { e.preventDefault(); edEscape(); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); edDeleteFocused(); return; }
    if (k === "+" || k === "=") { e.preventDefault(); edZoomTo(ED.zoom * 1.25); return; }
    if (k === "-" || k === "_") { e.preventDefault(); edZoomTo(ED.zoom / 1.25); return; }
    if (k === "0") { e.preventDefault(); edZoomFit(); return; }
    /* A digit with the flag tool in hand is the number the next flag
       takes, clamped to one past the last -- there is no flag 7 on a
       course with three. */
    if (/^[1-9]$/.test(k) && !ED.sel && edTool().number) {
      e.preventDefault();
      ED.flagNum = Math.min(parseInt(k, 10), (ED.grid.flags || []).length + 1);
      edRenderPanel();
      announce("Next flag is number " + ED.flagNum + ".");
      return;
    }

    /* THE HAND STAYS ON THE MOUSE.

       W A S D are the four facings themselves rather than a rotation,
       because "point it north" is what you actually want to say and
       turning three times to get there is three chances to overshoot.
       Q and E are the quarter turns for when the thing in hand is
       nearly right.

       A flag has no facing to turn, so on a flag Q and E count the
       number instead -- the same two keys, the same "one less, one
       more", applied to the only thing a flag has. */
    var face = { w: N, a: W, s: S, d: E }[k.toLowerCase()];
    if (face !== undefined) {
      e.preventDefault();
      edFace(face);
      return;
    }
    if (k === "q" || k === "Q") { e.preventDefault(); edSpin(-1); return; }
    if (k === "e" || k === "E") { e.preventDefault(); edSpin(1); return; }

    /* Any other letter is a tool, if a tool answers to it. */
    if (k.length === 1) {
      var pick = edKeyTool(k.toLowerCase());
      if (pick) {
        e.preventDefault();
        edPickTool(pick);
        announce(edTool().label + " in hand.");
      }
    }
  }
  /* Both keys act on the SELECTION when there is one and on the tool
     in hand when there is not, because those are the same decision
     asked of two different things. */
  function edFace(d) {
    var part = ED.sel && edPart();
    if (part && part.dir) { edSelEdit("dir", d, part.id); return; }
    ED.dir = d;
    edRenderPanel();
    announce("Facing " + B.dirName(d) + ".");
  }

  function edSpin(way) {
    var part = ED.sel && edPart();
    if (part && part.kind === "flag") {
      edSelEdit("num", Math.max(1, Math.min((ED.grid.flags || []).length, part.i + 1 + way)), part.id);
      return;
    }
    if (part && part.dir) {
      edSelEdit("dir", B.rot(edPartDir(part), way), part.id);
      return;
    }
    if (!ED.sel && edTool().number) {
      ED.flagNum = Math.max(1, Math.min((ED.grid.flags || []).length + 1, edFlagSlot() + way));
      edRenderPanel();
      announce("Next flag is number " + ED.flagNum + ".");
      return;
    }
    if (ED.sel) return;                        // nothing on this square turns
    ED.dir = B.rot(ED.dir, way);
    edRenderPanel();
    announce("Facing " + B.dirName(ED.dir) + ".");
  }

  function edKeyUp(e) {
    if (!ED) return;
    if (e.key === " ") {
      ED.spaceHeld = false;
      if (UI.els && UI.els.host) UI.els.host.classList.remove("pr-ed-space");
      return;
    }
    if (e.key !== "Control") return;
    ED.soloHold = false;
    edSoloPaint();
  }

  /* Alt-tabbing away mid-hold never delivers the keyup, which would
     leave the photo stuck over the board -- or the hand stuck on
     Space -- with no way back short of pressing and releasing the key
     again. */
  function edBlur() {
    if (!ED) return;
    if (ED.spaceHeld) {
      ED.spaceHeld = false;
      if (UI.els && UI.els.host) UI.els.host.classList.remove("pr-ed-space");
    }
    if (!ED.soloHold) return;
    ED.soloHold = false;
    edSoloPaint();
  }
  function edLoadImage(file) {
    if (!file) return;
    if (ED.underlay) { try { URL.revokeObjectURL(ED.underlay); } catch (e) {} }
    ED.underlay = URL.createObjectURL(file);
    announce("Reference image loaded. It stays on this machine and is never exported.");
    edRender();
  }

  function edPickQuiet(k) {
    var t = edToolByKey(k);
    if (!t) return;
    ED.pick = k;
    ED.mode = t.kind;
    if (t.kind === "tile") ED.tool = k;
    /* Picking something up puts down whatever was being looked at: the
       panel on the right is about one thing at a time, and that thing
       is the one in hand. */
    ED.sel = null;
    edRenderLib();
    edRenderDetail();
    edGhostPaint();
  }

  function edPickTool(k) {
    var had = ED.sel;
    edPickQuiet(k);
    /* The map only has to redraw to drop the selection highlight. */
    if (had) edRender();
  }

  /* CHANGING THE THING THAT IS ALREADY THERE. Every edit here is one
     step of history and one re-render, whatever kind it was.

     `which` names the part -- "tile", "laser:0" -- because a square
     carrying a belt and a ram has two facings and a control has to say
     which one it is turning. Left out, it means whichever part the
     keys are pointed at. */
  function edSelEdit(what, v, which) {
    var sel = ED.sel;
    if (!sel) return;
    var part = which ? edPartById(which) : edPart();
    if (!part) return;
    var obj = edPartObj(part);
    var before = edMark(), g = ED.grid, i;

    if (what === "wall") {
      if (B.wallAt(g, sel.c, sel.r, v) && edWallNeeded(sel.c, sel.r, v)) {
        announce("Something on this square is bolted to that wall. Take it off first.");
        edKeep(before);
        return;
      }
      B.setWall(g, sel.c, sel.r, v, !B.wallAt(g, sel.c, sel.r, v));
    } else if (what === "remove") {
      if (part.kind === "flag") g.flags.splice(part.i, 1);
      else if (part.kind === "laser") g.lasers.splice(part.i, 1);
      else if (part.kind === "pusher") g.pushers.splice(part.i, 1);
      else if (part.kind === "burner") g.burners.splice(part.i, 1);
      else if (part.kind === "press") g.timers.splice(part.i, 1);
      else { edKeep(before); return; }
      ED.sel.part = "tile";
    } else if (what === "clear") {
      edSetCell(sel.c, sel.r, "..");
      ED.sel.part = "tile";
    } else if (what === "dir") {
      if (part.kind === "tile") {
        var code = B.codeAt(g, sel.c, sel.r);
        if (!code) { edKeep(before); return; }
        edSetCell(sel.c, sel.r, code.charAt(0) + B.DIR_CHARS.charAt(v));
      } else if (obj) {
        /* Turning a mount takes its wall with it: up on the new face,
           and down on the old one unless something else on the square
           is still bolted to it. Leaving the old one standing is how a
           board ends up fenced by walls nobody put there. */
        var wasFace = edMountFace(obj);
        obj.d = v;
        B.setWall(g, sel.c, sel.r, edMountFace(obj), true);
        if (wasFace !== edMountFace(obj) && !edWallNeeded(sel.c, sel.r, wasFace, null)) {
          B.setWall(g, sel.c, sel.r, wasFace, false);
        }
      } else { edKeep(before); return; }
    } else if (what === "num") {
      if (part.kind === "tile") {
        var tc = B.codeAt(g, sel.c, sel.r);
        if (!tc) { edKeep(before); return; }
        edSetCell(sel.c, sel.r, tc.charAt(0) + v);
      } else if (part.kind === "laser") obj.n = v;
      else if (part.kind === "burner") obj.len = v;
      else if (part.kind === "flag") {
        /* Renumbering is moving it in the order, because the order IS
           the race. The others shuffle round it. */
        var was = g.flags.splice(part.i, 1)[0];
        var to = Math.max(0, Math.min(g.flags.length, v - 1));
        g.flags.splice(to, 0, was);
        ED.sel.part = "flag:" + to;
      }
    } else if (what === "reg") {
      if (!obj) { edKeep(before); return; }
      i = obj.regs.indexOf(v);
      if (i >= 0) obj.regs.splice(i, 1); else obj.regs.push(v);
      obj.regs.sort();
      if (!obj.regs.length) { obj.regs.push(v); announce("A hazard has to fire in at least one register."); }
    }
    edKeep(before);
    edAfterEdit();
  }

  function edPartById(id) {
    if (!ED.sel) return null;
    var parts = edParts(ED.sel.c, ED.sel.r);
    for (var i = 0; i < parts.length; i++) if (parts[i].id === id) return parts[i];
    return null;
  }

  /* The starting block is not a place for a flag: a flag there is
     touched before the race begins. */
  function edInDock(c, r) {
    var dk = ED.dock;
    return !!dk && c >= dk.at[0] && c <= dk.at[0] + 11 && r >= dk.at[1] && r <= dk.at[1] + 3;
  }

  /* MOVING A THING THAT IS ALREADY DOWN, by dragging it.

     A flag keeps its number: moving flag 2 is not taking flag 2 off
     and putting a new last flag down. A mount keeps its facing and its
     settings, and its wall comes with it -- up on the new square, and
     down on the old one unless something else there is still bolted
     to it. */
  function edMovePart(part, c, r) {
    var g = ED.grid, obj = edPartObj(part), i;
    if (!obj || !B.inGrid(g, c, r)) return false;
    if (obj.c === c && obj.r === r) return false;
    var code = B.codeAt(g, c, r);
    if (!code) { announce("That square is off the course."); return false; }
    if (part.kind === "flag") {
      var el0 = B.elemOf(code);
      if (!el0 || el0.name !== "floor") { announce("A flag can only sit on plain floor."); return false; }
      if (edInDock(c, r)) { announce("That is the starting block. A flag there is touched before the race begins."); return false; }
      for (i = 0; i < g.flags.length; i++) {
        if (g.flags[i] !== obj && g.flags[i].c === c && g.flags[i].r === r) {
          announce("Flag " + (i + 1) + " is already there."); return false;
        }
      }
      obj.c = c; obj.r = r;
      return true;
    }
    if (part.kind === "press") {
      if (B.isPit(code)) { announce("A crusher needs a floor under it, not a pit."); return false; }
      for (i = 0; i < g.timers.length; i++) {
        if (g.timers[i] !== obj && g.timers[i].c === c && g.timers[i].r === r) {
          announce("There is already a crusher there."); return false;
        }
      }
      obj.c = c; obj.r = r;
      return true;
    }
    var list = part.kind === "laser" ? g.lasers : part.kind === "pusher" ? g.pushers
             : part.kind === "burner" ? g.burners : null;
    if (!list) return false;
    for (i = 0; i < list.length; i++) {
      if (list[i] !== obj && list[i].c === c && list[i].r === r) {
        announce("There is already one of those there."); return false;
      }
    }
    var face = edMountFace(obj), oc = obj.c, or = obj.r;
    obj.c = c; obj.r = r;
    B.setWall(g, c, r, face, true);
    if (!edWallNeeded(oc, or, face)) B.setWall(g, oc, or, face, false);
    return true;
  }

  /* Which thing on this square a press would pick up and carry: a
     flag under the flag tool or the select tool, a trap under the
     select tool. Anything else is a click or a stroke. */
  function edMovable(hit) {
    var kind = edTool().kind, parts = edParts(hit.c, hit.r), i;
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (p.kind === "flag" && (kind === "flag" || kind === "select")) return p;
      if (kind === "select" && (p.kind === "laser" || p.kind === "pusher" ||
          p.kind === "burner" || p.kind === "press")) return p;
    }
    return null;
  }

  function edDragMove(e) {
    var d = ED.drag;
    if (!d.moved) {
      /* A press is a press until the hand has clearly gone somewhere:
         a twitch on the way to a click must not carry a flag off. */
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
      d.moved = true;
      UI.els.host.classList.add("pr-ed-dragging");
      ED.ghostHTML = null;
    }
    edHover(e);
  }

  function edDragEnd() {
    var d = ED.drag;
    ED.drag = null;
    UI.els.host.classList.remove("pr-ed-dragging");
    if (!d.moved) return;                  // a click; the click event does the rest
    ED.swallowClick = true;
    ED.ghostHTML = null;
    var to = ED.hover;
    if (!to) { edGhostPaint(); return; }
    var before = edMark();
    if (!edMovePart(d.part, to.c, to.r)) { edKeep(before); edGhostPaint(); return; }
    edSelect(to.c, to.r, d.part.id, true);
    edKeep(before);
    edAfterEdit();
  }

  /* PANNING: the hand tool, Space held with any tool, or the middle
     button. The viewport is an ordinary scroll box, so panning is
     scrolling it. */
  function edPanStart(e) {
    var view = UI.els.edView;
    ED.pan = { x: e.clientX, y: e.clientY, sx: view.scrollLeft, sy: view.scrollTop, id: e.pointerId };
    UI.els.host.classList.add("pr-ed-panning");
    try { view.setPointerCapture(e.pointerId); } catch (err) {}
    edGhostPaint();
  }

  function edPanMove(e) {
    var view = UI.els.edView, p = ED.pan;
    view.scrollLeft = p.sx - (e.clientX - p.x);
    view.scrollTop = p.sy - (e.clientY - p.y);
  }

  function edPanEnd() {
    var p = ED.pan;
    ED.pan = null;
    UI.els.host.classList.remove("pr-ed-panning");
    if (p) { try { UI.els.edView.releasePointerCapture(p.id); } catch (err) {} }
  }

  /* TWO FINGERS pan and zoom, whatever one finger was doing. */
  function edTouchDown(e) {
    ED.touches = ED.touches || {};
    ED.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ED.touches);
    if (ids.length !== 2) return false;
    if (ED.stroke) edPaintEnd();
    if (ED.drag) { ED.drag = null; UI.els.host.classList.remove("pr-ed-dragging"); }
    var a = ED.touches[ids[0]], b = ED.touches[ids[1]], view = UI.els.edView;
    var dx = a.x - b.x, dy = a.y - b.y;
    ED.pinch = { d0: Math.max(1, Math.sqrt(dx * dx + dy * dy)), z0: ED.zoom,
                 cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sx: view.scrollLeft, sy: view.scrollTop };
    ED.swallowClick = true;
    edGhostPaint();
    return true;
  }

  function edTouchMove(e) {
    if (!ED.touches || !ED.touches[e.pointerId]) return false;
    ED.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!ED.pinch) return false;
    var ids = Object.keys(ED.touches), a = ED.touches[ids[0]], b = ED.touches[ids[1]];
    if (!a || !b) return true;
    var view = UI.els.edView, box = view.getBoundingClientRect(), P = ED.pinch;
    var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    /* Zoom about where the fingers landed, then pan by how far they
       have travelled since. */
    var z = edClampZoom(P.z0 * d / P.d0);
    var to = edZoomScroll(P.z0, z, P.sx, P.sy, P.cx - box.left, P.cy - box.top);
    ED.zoom = z;
    edApplyZoom();
    view.scrollLeft = to.x - (cx - P.cx);
    view.scrollTop = to.y - (cy - P.cy);
    return true;
  }

  function edTouchUp(e) {
    if (!ED.touches) return;
    delete ED.touches[e.pointerId];
    if (Object.keys(ED.touches).length < 2) ED.pinch = null;
  }

  /* THE FLAG LIST'S THREE VERBS. */
  function edFlagGo(i) {
    var f = (ED.grid.flags || [])[i];
    if (!f) return;
    edSelect(f.c, f.r, "flag:" + i);
    edScrollTo(f.c, f.r);
  }

  /* Earlier or later in the race: the list IS the order, so this is
     a move in the list and the others shuffle round it. */
  function edFlagShift(i, way) {
    var flags = ED.grid.flags || [], to = i + way;
    if (!flags[i] || to < 0 || to >= flags.length) return;
    var before = edMark();
    var f = flags.splice(i, 1)[0];
    flags.splice(to, 0, f);
    if (ED.sel && ED.sel.part === "flag:" + i) ED.sel.part = "flag:" + to;
    edKeep(before);
    edAfterEdit();
  }

  function edFlagDrop(i) {
    var flags = ED.grid.flags || [];
    if (!flags[i]) return;
    var before = edMark();
    flags.splice(i, 1);
    if (ED.sel && /^flag:/.test(ED.sel.part)) ED.sel.part = "tile";
    ED.flagNum = Math.min(ED.flagNum, flags.length + 1);
    edKeep(before);
    edAfterEdit();
  }

  /* Escape steps outward: a selection is let go of first, and with
     nothing selected the hand goes back to the select tool. */
  function edEscape() {
    if (ED.sel) { ED.sel = null; edRender(); edRenderPanel(); return; }
    if (ED.pick !== "sel") edPickTool("sel");
  }

  /* Delete takes off whichever part the keys are pointed at: the trap
     or flag in focus, or -- when that is the square itself -- whatever
     the square is, which leaves floor. */
  function edDeleteFocused() {
    var part = ED.sel && edPart();
    if (!part) { announce("Nothing selected."); return; }
    if (part.kind !== "tile") { edSelEdit("remove", 0, part.id); return; }
    var code = B.codeAt(ED.grid, ED.sel.c, ED.sel.r);
    if (!code || code === "..") { announce("Nothing to take off this square."); return; }
    edSelEdit("clear");
  }

  function edDispatch(b, e) {
    /* Bound once and never taken off, so this fires over the GAME too
       once the workshop has closed. Nothing here means anything then,
       and half of it would throw. */
    if (!ED) return;
    var a = b.dataset.act;
    if (a === "edpick") { edPickTool(b.dataset.k); }
    else if (a === "eddir") { ED.dir = parseInt(b.dataset.d, 10); edRenderPanel(); }
    else if (a === "eddigit") { ED.digit = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edlaser") { ED.laserN = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edflagnum") { ED.flagNum = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edpreg") {
      var n = parseInt(b.dataset.n, 10), at = ED.pushRegs.indexOf(n);
      if (at >= 0) ED.pushRegs.splice(at, 1); else ED.pushRegs.push(n);
      ED.pushRegs.sort();
      edRenderPanel();
    }
    else if (a === "edpreset") {
      ED.pushRegs = b.dataset.p === "odd" ? [1, 3, 5] : [2, 4];
      edRenderPanel();
    }
    else if (a === "edbreg") {
      var bn = parseInt(b.dataset.n, 10), bat = ED.burnRegs.indexOf(bn);
      if (bat >= 0) ED.burnRegs.splice(bat, 1); else ED.burnRegs.push(bn);
      ED.burnRegs.sort();
      edRenderPanel();
    }
    else if (a === "edblen") { ED.burnLen = parseInt(b.dataset.n, 10); edRenderPanel(); }
    else if (a === "edpressreg") {
      var pn = parseInt(b.dataset.n, 10), pat = ED.pressRegs.indexOf(pn);
      if (pat >= 0) ED.pressRegs.splice(pat, 1); else ED.pressRegs.push(pn);
      ED.pressRegs.sort();
      edRenderPanel();
    }
    else if (a === "edpresspreset") {
      ED.pressRegs = b.dataset.p === "15" ? [1, 5] : b.dataset.p === "24" ? [2, 4] : [3];
      edRenderPanel();
    }
    /* ---- the inspector, which edits the thing rather than the thing
       about to be placed ---- */
    else if (a === "edseldir") edSelEdit("dir", parseInt(b.dataset.d, 10), b.dataset.p);
    else if (a === "edselnum") edSelEdit("num", parseInt(b.dataset.n, 10), b.dataset.p);
    else if (a === "edselreg") edSelEdit("reg", parseInt(b.dataset.n, 10), b.dataset.p);
    else if (a === "edselwall") edSelEdit("wall", parseInt(b.dataset.d, 10));
    else if (a === "edselremove") edSelEdit("remove", 0, b.dataset.p);
    else if (a === "edselclear") edSelEdit("clear");
    else if (a === "edselpart") { ED.sel.part = b.dataset.p; edRenderDetail(); }
    else if (a === "eddesel") { ED.sel = null; edRender(); edRenderPanel(); }
    /* ---- the flag list ---- */
    else if (a === "edflaggo") edFlagGo(parseInt(b.dataset.i, 10));
    else if (a === "edflagshift") edFlagShift(parseInt(b.dataset.i, 10), parseInt(b.dataset.w, 10));
    else if (a === "edflagdrop") edFlagDrop(parseInt(b.dataset.i, 10));
    /* ---- the map ---- */
    else if (a === "edzoom") {
      if (b.dataset.z === "fit") edZoomFit();
      else edZoomTo(ED.zoom * (b.dataset.z === "in" ? 1.25 : 1 / 1.25));
    }
    /* ---- the reference photograph ---- */
    else if (a === "edsolo") { ED.soloLatch = !ED.soloLatch; edSoloPaint(); edRenderPanel(); }
    else if (a === "edreftoggle") {
      ED.refOpen = !(ED.refOpen === undefined ? !!ED.underlay : ED.refOpen);
      edRenderDetail();
    }
    else if (a === "edop") { ED.opacity = parseInt(b.value, 10) / 100; edUnderlayPaint(); }
    else if (a === "edscale") { ED.uScale = parseInt(b.value, 10) / 100; edUnderlayPaint(); }
    else if (a === "ednudge") {
      ED.offX += parseInt(b.dataset.dx, 10); ED.offY += parseInt(b.dataset.dy, 10);
      edUnderlayPaint();
    }
    else if (a === "edclearimg") { ED.underlay = null; edRender(); }
    /* ---- the session ---- */
    else if (a === "edid") { ED.id = b.value.replace(/[^A-Za-z0-9_]/g, "") || "newBoard"; edSave(); }
    else if (a === "edname") { ED.grid.name = b.value; edSave(); }
    else if (a === "edexport") edExport();
    else if (a === "edcopy") {
      var ta = UI.els.overlay.querySelector("textarea");
      if (ta) { ta.select(); try { document.execCommand("copy"); announce("Copied."); } catch (err) {} }
    }
    else if (a === "edundo") edUndo();
    else if (a === "edplay") edTestPlay();
    else if (a === "edclib") edCourseSave("library");
    else if (a === "edcplay") edCourseSave("race");
    else if (a === "edcdrop") edCourseDrop();
    else if (a === "edapply") edApply();
    else if (a === "edrevert") edLeaveToSetup();
    else if (a === "edquit") { root.location.hash = ""; root.location.reload(); }
    else if (a === "closemodal") closeModal();
  }
  /* Hand the edit to the race that is about to start. The board is
     parsed and validated by setOverride before it shadows anything, so
     an unfinished edit is refused here rather than at buildCourse --
     where the message would be about a belt and not about the thing
     you just drew. */
  /* What the workshop hands back: a picture of the whole course, the
     sparse layers beside it, the flags on it and the boards it was
     made from. Everything JSON, so it rides in the layout, in the save
     and through a reload untouched. */
  function edCourseEdit() {
    return {
      w: ED.grid.w, h: ED.grid.h, pic: B.gridToPic(ED.grid), voids: true,
      name: ED.grid.name,
      lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
      pushers: ED.grid.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
      burners: ED.grid.burners.map(function (F) { return { c: F.c, r: F.r, d: "NESW".charAt(F.d), regs: F.regs.slice(), len: F.len }; }),
      timers: ED.grid.timers.map(function (T) { return { c: T.c, r: T.r, regs: T.regs.slice() }; }),
      flags: (ED.grid.flags || []).map(function (f) { return [f.c, f.r]; })
    };
  }

  /* `how` is "race" or "library": the same save, and then either the
     board or the shelf. Both go through here because what is kept is
     the same thing either way -- a race that saved a different course
     from the one the library got would be two definitions of "this
     course", which is how a saved course comes back subtly wrong. */
  function edCourseSave(how) {
    edValidate();
    if (ED.errors.length) { announce("Fix the course first: " + ED.errors[0]); edRenderPanel(); return; }
    var edit = edCourseEdit();
    var L = layoutNow();
    /* Checked BEFORE it is kept: a picture that will not build is a
       picture that would take the wizard down on its next render, and
       the place to find that out is while the editor is still open. */
    try {
      var probe = edCourseSpec();
      if (!probe.flags.length) probe.flags = [edFirstFloor()];
      B.validateCourse(probe, function () {});
    } catch (e) {
      announce("That course will not build: " + e.message);
      edRenderPanel();
      return;
    }
    L.edit = edit;
    if (edit.flags.length) {
      L.pick = L.pick || {};
      L.pick.mode = "workshop";
      L.pick.n = edit.flags.length;
      L.pick.chosen = true;
    }
    saveLayout();
    if (how === "library") {
      var row = libPut(ED.grid.name, L);
      if (!row) { announce("This browser would not store the course."); edRenderPanel(); return; }
      UI.edCourseSaved = "library";
      UI.edLibName = row.name;
      edLeaveToSetup();
      return;
    }
    UI.edCourseSaved = "race";
    edLeaveToSetup();
  }

  function edCourseDrop() {
    UI.edCourseSaved = null;
    edLeaveToSetup();
  }

  function edApply() {
    edValidate();
    if (ED.errors.length) { announce("Fix the map first: " + ED.errors[0]); edRenderPanel(); return; }
    var spec = edSpec();
    try { B.setOverride(ED.id, spec); }
    catch (e) { announce("That map will not build: " + e.message); return; }
    saveHouseBoards();
    UI.edApplied = ED.id;
    edLeaveToSetup();
  }

  /* The spec the editor exports, in the shape BOARD_SPECS uses. One
     function so applying an edit and exporting the source cannot
     produce two different boards. */
  function edSpec() {
    var ship = B.BOARD_SPECS[ED.id] || {};
    return {
      w: ED.grid.w, h: ED.grid.h, pic: B.gridToPic(ED.grid),
      name: ED.grid.name, edition: ship.edition || "classic",
      set: ship.set || "authored", origin: ED.grid.origin || "transcribed",
      lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
      pushers: ED.grid.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
      burners: ED.grid.burners.map(function (F) { return { c: F.c, r: F.r, d: "NESW".charAt(F.d), regs: F.regs.slice(), len: F.len }; }),
      timers: ED.grid.timers.map(function (T) { return { c: T.c, r: T.r, regs: T.regs.slice() }; })
    };
  }

  function edLeaveToSetup() {
    root.location.hash = "";
    document.removeEventListener("keydown", edKey);
    document.removeEventListener("keyup", edKeyUp);
    root.removeEventListener("blur", edBlur);
    var applied = UI.edApplied, course = UI.edCourseSaved;
    UI.edCourseSaved = null;
    ED = null;
    var host = UI.els.host;
    host.classList.remove("pr-editing");
    host.innerHTML = "";
    UI.mounted = false;
    mount(host, {});
    /* An expansion tile turns its ruleset on. Said out loud, because a
       silently switched rulebook is a different game. */
    var moved = syncRulesetToCourse();
    saveRules();
    /* Back to the step the edit was started from -- which is the flag
       screen, because that is where the boards of this layout are
       listed. Landing on step one would throw away the wizard's place
       for an edit that changed nothing about the settings. */
    if (course === "library") {
      wizGo(1);
      announce("\u201c" + (UI.edLibName || "The course") + "\u201d is in your library.");
      UI.edLibName = null;
      return;
    }
    if (course === "race") {
      /* Straight onto the board: the flags are already on the course
         and the only thing left was to start. Asked as the rule rather
         than as a count -- an unraceable course has to say why, and a
         picture with flags on it can still fail to build. */
      var why = flagProblem();
      if (!why) {
        closeModal();
        startComposed(layoutCourse(flagsResolved()));
        return;
      }
      announce(why);
    }
    /* Back to the course screen, which is where everything about this
       course is: the shelf it may have just been saved to, the boards
       it is made of, and the door back in here. */
    wizGo(wizLast());
    if (applied) {
      announce(moved
        ? "Map updated. It uses " + RULESETS[moved].name + " squares, so that ruleset is now on."
        : "Map updated for this race.");
    }
  }

  /* Play the board being edited without shipping it: a temporary
     board and course, three flags dropped on legal squares. */
  function edTestPlay() {
    edValidate();
    if (ED.errors.length) { announce("Fix the board first: " + ED.errors[0]); edRenderPanel(); return; }
    var spec = { w: ED.grid.w, h: ED.grid.h, pic: B.gridToPic(ED.grid), name: ED.grid.name, origin: "authored",
                 lasers: ED.grid.lasers.map(function (L) { return { c: L.c, r: L.r, d: "NESW".charAt(L.d), n: L.n }; }),
                 pushers: ED.grid.pushers.map(function (U) { return { c: U.c, r: U.r, d: "NESW".charAt(U.d), regs: U.regs.slice() }; }),
                 burners: ED.grid.burners.map(function (F) { return { c: F.c, r: F.r, d: "NESW".charAt(F.d), regs: F.regs.slice(), len: F.len }; }) };
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
    document.removeEventListener("keyup", edKeyUp);
    root.removeEventListener("blur", edBlur);
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
    if (UI.els.shots) {
      UI.els.shots.style.width = w + "px";
      UI.els.shots.style.height = h + "px";
    }
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
    /* The hazard stripe lives in ONE pattern that every tile references,
       rather than being redrawn per tile: a pit frame and a pusher plate
       have to be the same stripe at the same pitch or the board looks
       like two boards. Ids are document-scoped, so this is appended
       once and reached by url(#...) from inside any tile's svg. */
    host.insertAdjacentHTML("beforeend", HAZARD_DEFS);
    UI.opts = opts;

    houseRules = loadRules();
    /* House boards come back before anything builds a course, or the
       first render would draw the shipped board and the edit would
       show only after the next reload. */
    var lostBoards = loadHouseBoards();
    if (lostBoards.length) {
      log("Map edits to " + lostBoards.join(", ") + " no longer fit those boards and were dropped");
    }
    var courseId = chosenCourse(opts);
    var C;
    /* THE SAVE IS READ BEFORE THE BOARD IS BUILT.

       mount used to build from the course NAME and only then look for
       a save, which is fine while every course is in the table and
       throws the moment one is not: a composed course resolves to no
       entry, so a reload of your own course died at startup rather
       than resuming it. The saved spec is what gets built when there
       is one. */
    var resumed = loadGame();
    var wantSpec = opts.courseSpec || null;
    if (!wantSpec && resumed && resumed.courseSpec &&
        (!opts.course || resumed.courseId === courseId)) {
      wantSpec = resumed.courseSpec;
    }
    /* A spec passed in is a fresh course, so an old save of a
       different one must not be resumed on top of it. */
    if (opts.courseSpec) resumed = null;

    try {
      validateTables();
      B.validateAll();
      C = B.buildCourse(wantSpec || courseId);
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
    var shots = el("div", "pr-shots");
    shots.setAttribute("aria-hidden", "true");
    var pieces = el("div", "pr-pieces");
    pieces.setAttribute("aria-hidden", "true");
    stage.appendChild(grid); stage.appendChild(beams);
    stage.appendChild(walls); stage.appendChild(shots); stage.appendChild(pieces);

    var side = el("aside", "pr-side");
    var players = el("div", "pr-panel");
    players.innerHTML = "<h2>ROBOTS</h2>";
    var playersBody = el("div");
    players.appendChild(playersBody);
    var logPanel = el("div", "pr-panel");
    logPanel.innerHTML = "<h2>LOG</h2>";
    var logBody = el("div", "pr-log");
    /* The log is READ, not announced. During execution it gains
       several lines a register, and a live region repeats every one of
       them -- so the useful message (what just happened to YOU) is
       buried in the play-by-play of seven other robots. The status
       region carries what matters; this is here to be scrolled back
       through. */
    logBody.setAttribute("role", "log");
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
    /* POLITE, not assertive. Everything that comes through announce()
       is a confirmation -- "Register 1 set", "Registers 2 and 3
       swapped" -- and assertive INTERRUPTS whatever the screen reader
       is saying. Programming five cards cut the reader off five
       times. Nothing here is urgent enough to earn that. */
    sr.setAttribute("aria-live", "polite");

    host.appendChild(hud); host.appendChild(banner); host.appendChild(main);
    host.appendChild(sr);
    host.appendChild(overlay); host.appendChild(curtain);

    UI.els = { host: host, hud: hud, stage: stage, grid: grid, beams: beams, walls: walls,
      program: program,
               pieces: pieces, shots: shots, side: side, players: playersBody, log: logBody,
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

    if (resumed && resumed.courseId === C.id) {
      G = resumed;
      UI.wallsChecked = false;
      log("Resumed from a saved game.");
    } else {
      UI.wallsChecked = false;
      newGame((Math.random() * 1e9) | 0, gameOpts(opts, courseId, wantSpec));
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
      /* A grid needs ROWS. Without them the accessibility tree is a
         malformed grid -- 192 cells and nothing to group them -- and
         assistive technology either flattens it or reports an error.

         display:contents on the row keeps the cells as CSS grid items
         so the layout is untouched, which is the whole reason the rows
         were not there in the first place. */
      out.push('<div class="pr-grid-row" role="row">');
      for (c = 0; c < C.w; c++) {
        /* ROVING TABINDEX: exactly one cell is a tab stop and the
           arrows move it. Every cell at -1 was half of this pattern --
           the board announced itself as a grid and then could not be
           entered at all, which is worse than not claiming to be one. */
        out.push('<div class="' + tileClasses(C, c, r).join(" ") + '" role="gridcell"' +
          ' tabindex="' + (c === 0 && r === 0 ? "0" : "-1") + '"' +
          ' data-c="' + c + '" data-r="' + r + '" aria-label="' + esc(describeTile(C, c, r)) + '">' +
          tileInner(C, c, r) + "</div>");
      }
      out.push("</div>");
    }
    UI.els.grid.innerHTML = out.join("");
    UI.els.beams.innerHTML = beamSpans(C);
    paintWalls(C);
  }

  /* THE WALL LAYER, REPAINTED WHEN WHAT IT SAYS CHANGES.

     It cannot simply be drawn once with the rest of the board: mount()
     builds the grid BEFORE it has decided whether this is a resumed
     game or a new one, so at that moment there is no G to ask about
     bumpers and the rail was silently never drawn. Nor should it be
     rebuilt every render -- it is a few hundred nodes that almost
     never change. So it remembers what it was drawn for and repaints
     only when that is no longer true. */
  function paintWalls(C) {
    if (!UI.els || !UI.els.walls) return;
    var want = (G && G.bumpers) ? 1 : 0;
    if (UI.wallsFor === want && UI.wallsCourse === C) return;
    UI.wallsFor = want;
    UI.wallsCourse = C;
    UI.els.walls.innerHTML = wallSpans(C, !!want);
  }

  /* Move the single tab stop, and take focus with it. Arrow keys walk
     the board, Home and End run to the ends of a row, and the label
     the cell already carries is what gets announced on arrival. */
  function moveGridFocus(dc, dr, toEnd) {
    var C = UI.course;
    if (!C || !UI.els || !UI.els.grid) return false;
    var cur = UI.els.grid.querySelector('[role="gridcell"][tabindex="0"]');
    if (!cur) cur = UI.els.grid.querySelector('[role="gridcell"]');
    if (!cur) return false;
    var c = +cur.dataset.c, r = +cur.dataset.r;
    if (toEnd) c = dc < 0 ? 0 : C.w - 1;
    else { c += dc; r += dr; }
    if (c < 0 || r < 0 || c >= C.w || r >= C.h) return false;
    var next = UI.els.grid.querySelector('[role="gridcell"][data-c="' + c + '"][data-r="' + r + '"]');
    if (!next) return false;
    cur.setAttribute("tabindex", "-1");
    next.setAttribute("tabindex", "0");
    next.focus();
    return true;
  }

  function describeTile(C, c, r) {
    if (B.isVoid(C, c, r)) return "column " + (c + 1) + " row " + (r + 1) + ", off the course";
    var code = B.codeAt(C, c, r), def = B.elemOf(code), parts = [];
    parts.push("column " + (c + 1) + " row " + (r + 1));
    if (def && def.name !== "floor") {
      parts.push(def.name + (def.arg === "dir" ? " " + B.dirName(B.dirOf(code)) : ""));
    }
    for (var f = 0; f < C.flags.length; f++) if (C.flags[f].c === c && C.flags[f].r === r) parts.push("flag " + C.flags[f].n);
    for (var d = 0; d < 4; d++) {
      if (B.wallAt(C, c, r, d)) parts.push("wall " + B.dirName(d));
      /* The rail stops a robot exactly as a wall does, so a player
         reading the board by ear has to be told it is there -- and
         told that it is the house rule rather than board art. */
      else if (railed(C, c, r, d)) parts.push("bumper rail " + B.dirName(d));
      else if (!B.inGrid(C, B.step(c, r, d).c, B.step(c, r, d).r) ||
               B.isVoid(C, B.step(c, r, d).c, B.step(c, r, d).r)) {
        parts.push("edge " + B.dirName(d));
      }
    }
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
    var hash = root.location ? root.location.hash : "";
    var edit = /[#&]edit(?:=([A-Za-z0-9_]+))?/.exec(hash);
    if (edit && nodes.length) {
      /* A course workshop cannot be reopened from a URL: the course it
         was editing lives in the layout, which this page has not read
         yet. Reloading on that hash lands on the game, which is where
         the wizard can be opened again. */
      if (edit[1] === "course") { root.location.hash = ""; }
      else { edMount(nodes[0], edit[1], /[#&]from=setup/.test(hash)); return; }
    }
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
