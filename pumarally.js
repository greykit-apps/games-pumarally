/* ============================================================
   PUMARALLY
   A faithful port of the RoboRally rules in original pixel art.

   One script that injects its own CSS and mounts into any
   [data-pumarally] element, so index.html stays a shell. Board
   data and its validator live in pumarally-boards.js, which this
   file consumes and never duplicates.

   No build step, no dependencies, no network at play time.
   ============================================================ */
(function (root) {
  "use strict";

  var B = root.PumaRallyBoards;
  if (!B) throw new Error("PumaRally: pumarally-boards.js must load first");

  var N = B.N, E = B.E, S = B.S, W = B.W;

  /* ============================================================
     TOKENS — pixel-industrial tribe
     Base and accent are byte-identical to Retro Surfer '96, which
     is what makes this a tribe rather than a one-off palette. The
     extensions exist because a RoboRally board asks a dozen
     functional tile types to be told apart at a glance, which two
     hues cannot do: conveyors are rust, express conveyors are the
     accent, pushers are warn, harm is danger, and the floor stays
     out of the way so the pieces read first.
     ============================================================ */
  var TOKENS = {
    bg: "#05070f",
    accent: "#54f2ff",
    ink: "#8b8fa8",
    text: "#e8ecff",
    plate: "#1a2338",
    plateDark: "#151c2e",
    rivet: "#223052",
    rust: "#c25a2b",
    warn: "#ffb000",
    danger: "#ff3333",
    steel: "#8b93b5",
    panel: "#0c1120",
    border: "#1f2a45"
  };

  /* The eight robot liveries. Colour is the only thing that tells
     robots apart, exactly as on the table, so these are chosen for
     separation at 16 pixels rather than for prettiness. */
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

  /* ============================================================
     SPRITES
     Hand-editable character grids with a per-sprite palette, the
     format Retro Surfer uses. Each is pre-rendered once to an
     offscreen canvas and thereafter blitted, and every rotation is
     a canvas transform rather than a fourth copy of the art.

     Robots are ONE sprite with eight palette maps. That is the
     difference between 40 lines of art and 320.
     ============================================================ */
  var SPRITES = {
    floor: {
      palette: { q: TOKENS.plateDark, p: TOKENS.plate, d: TOKENS.rivet },
      rows: [
        "qqqqqqqqqqqqqqqq",
        "qdppppppppppppdq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qppppppppppppppq",
        "qdppppppppppppdq",
        "qqqqqqqqqqqqqqqq"
      ]
    },

    pit: {
      palette: { q: TOKENS.plateDark, m: "#0d1322", k: TOKENS.bg },
      rows: [
        "qqqqqqqqqqqqqqqq",
        "qqmmmmmmmmmmmmqq",
        "qmmkkkkkkkkkkmmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmkkkkkkkkkkkkmq",
        "qmmkkkkkkkkkkmmq",
        "qqmmmmmmmmmmmmqq",
        "qqqqqqqqqqqqqqqq"
      ]
    },

    /* Conveyors are authored pointing NORTH and rotated to suit.
       One chevron for a normal belt, two for an express -- the
       speed has to be readable without reading the colour, because
       the two belts are the commonest thing to misjudge. */
    belt: {
      palette: { v: "#6b4a2e", u: "#3a2a1e", a: TOKENS.rust },
      transparent: "p",
      rows: [
        "ppvvvvvvvvvvvvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuaaaauuuvpp",
        "ppvuuaaaaaauuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvvvvvvvvvvvvpp"
      ]
    },

    express: {
      palette: { v: "#1f4a6b", u: "#17324a", a: TOKENS.accent },
      transparent: "p",
      rows: [
        "ppvvvvvvvvvvvvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuaaaauuuvpp",
        "ppvuuaaaaaauuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuaauuuuvpp",
        "ppvuuuaaaauuuvpp",
        "ppvuuaaaaaauuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvuuuuuuuuuuvpp",
        "ppvvvvvvvvvvvvpp"
      ]
    },

    /* A curve authored as "fed from the west, exits north" -- a
       LEFT turn. The right-turn curve is this mirrored, generated
       at pre-render time, so the corner art is authored once. */
    beltCurve: {
      palette: { v: "#6b4a2e", u: "#3a2a1e", a: TOKENS.rust },
      transparent: "p",
      rows: [
        "ppvvvvvvvvvvvvpp",
        "ppvuuuuuuuuuuvpp",
        "vvvuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuaauuuuvpp",
        "vuuuuuaaaauuuvpp",
        "vuuuuaaaaaauuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vvvvvvvvvvvvvvpp",
        "pppppppppppppppp",
        "pppppppppppppppp"
      ]
    },

    expressCurve: {
      palette: { v: "#1f4a6b", u: "#17324a", a: TOKENS.accent },
      transparent: "p",
      rows: [
        "ppvvvvvvvvvvvvpp",
        "ppvuuuuuuuuuuvpp",
        "vvvuuuuuuuuuuvpp",
        "vuuuuuuaauuuuvpp",
        "vuuuuuaaaauuuvpp",
        "vuuuuaaaaaauuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuaauuuuvpp",
        "vuuuuuaaaauuuvpp",
        "vuuuuaaaaaauuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vuuuuuuuuuuuuvpp",
        "vvvvvvvvvvvvvvpp",
        "pppppppppppppppp",
        "pppppppppppppppp"
      ]
    },

    gearCW: {
      palette: { g: "#4a5578", h: "#6b7aa8", a: TOKENS.warn },
      transparent: "p",
      rows: [
        "ppppppggggpppppp",
        "ppppppggggpppppp",
        "ppppggggggggpppp",
        "pppggggggggggppp",
        "ppggggggggggggpp",
        "ppggggggggggggpp",
        "gggggggaaagggggg",
        "ggggggaaaagggggg",
        "ggggggaaaagggggg",
        "gggggggaaggggggg",
        "ppggggggggggggpp",
        "ppggggggggggggpp",
        "pppggggggggggppp",
        "ppppggggggggpppp",
        "ppppppggggpppppp",
        "ppppppggggpppppp"
      ]
    },

    gearCCW: {
      palette: { g: "#4a5578", h: "#6b7aa8", a: TOKENS.accent },
      transparent: "p",
      rows: [
        "ppppppggggpppppp",
        "ppppppggggpppppp",
        "ppppggggggggpppp",
        "pppggggggggggppp",
        "ppggggggggggggpp",
        "ppggggggggggggpp",
        "ggggggaaaggggggg",
        "ggggggaaaagggggg",
        "ggggggaaaagggggg",
        "gggggggaaggggggg",
        "ppggggggggggggpp",
        "ppggggggggggggpp",
        "pppggggggggggppp",
        "ppppggggggggpppp",
        "ppppppggggpppppp",
        "ppppppggggpppppp"
      ]
    },

    /* Pushers are authored pushing NORTH: the piston housing sits
       on the south edge, where its wall is, and the ram points the
       way it shoves. Odd and even registers differ by colour, and
       the renderer stamps the register numbers on top. */
    pusherOdd: {
      palette: { n: "#a86a28", m: "#7a4a1a", a: TOKENS.warn },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppppppaaaapppppp",
        "pppppaaaaaappppp",
        "ppppaaaaaaaapppp",
        "ppppppaaaapppppp",
        "ppppppaaaapppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppnnnnnnnnnnnnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnnnnnnnnnnnnpp",
        "pppppppppppppppp"
      ]
    },

    pusherEven: {
      palette: { n: "#2c6a7f", m: "#194a5c", a: TOKENS.accent },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppppppaaaapppppp",
        "pppppaaaaaappppp",
        "ppppaaaaaaaapppp",
        "ppppppaaaapppppp",
        "ppppppaaaapppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppnnnnnnnnnnnnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnmmmmmmmmmmnpp",
        "ppnnnnnnnnnnnnpp",
        "pppppppppppppppp"
      ]
    },

    repair: {
      palette: { s: TOKENS.steel, h: "#c9d2f0", a: TOKENS.warn },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppppppsppspppppp",
        "ppppppsppspppppp",
        "ppppppsssspppppp",
        "ppppppshhspppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "ppppppsssspppppp",
        "ppppppsssspppppp",
        "pppppppssppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp"
      ]
    },

    upgrade: {
      palette: { s: TOKENS.warn, h: "#ffd98a", a: TOKENS.warn },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppaaaap",
        "ppppppsppspaaaap",
        "ppppppsppspaaaap",
        "ppppppsssspaaaap",
        "ppppppshhspppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "pppppppssppppppp",
        "ppppppsssspppppp",
        "ppppppsssspppppp",
        "pppppppssppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp"
      ]
    },

    flag: {
      palette: { s: TOKENS.steel, a: TOKENS.warn },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppppppsaaaaaappp",
        "ppppppsaaaaaappp",
        "ppppppsaaaaapppp",
        "ppppppsaaapppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "ppppppsppppppppp",
        "pppppssspppppppp",
        "pppppppppppppppp"
      ]
    },

    dock: {
      palette: { h: TOKENS.accent },
      transparent: "p",
      rows: [
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pphhpppppppphhpp",
        "phpppppppppppphp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "phpppppppppppphp",
        "pphhpppppppphhpp",
        "pppppppppppppppp",
        "pppppppppppppppp"
      ]
    },

    /* One robot, authored facing north. The nose is the facing
       tell: at 16 pixels a rotated body alone is ambiguous, and
       which way a robot points is the single most important fact
       on the board. */
    robot: {
      palette: { a: "#ffb000", d: "#8a5c00", e: TOKENS.accent, h: "#ffffff" },
      transparent: ".",
      rows: [
        ".......dd.......",
        "......daad......",
        ".....ddaadd.....",
        "...dddddddddd...",
        "..ddaaaaaaaadd..",
        "..ddeaaaaaaedd..",
        "..ddaaaaaaaadd..",
        "..ddaaaaaaaadd..",
        "..ddaaaaaaaadd..",
        "..dddddddddddd..",
        ".dddddddddddddd.",
        ".dhdhdhdhdhdhdd.",
        ".dhdhdhdhdhdhdd.",
        ".dddddddddddddd.",
        "................",
        "................"
      ]
    }
  };

  /* A 3x5 numeral font, same shape as Retro Surfer's. Flag numbers,
     docking bay numbers and register pips all come from here, so
     the game never needs a web font to render a digit. */
  var FONT = {
    "0": "111,101,101,101,111", "1": "010,110,010,010,111",
    "2": "111,001,111,100,111", "3": "111,001,111,001,111",
    "4": "101,101,111,001,001", "5": "111,100,111,001,111",
    "6": "111,100,111,101,111", "7": "111,001,001,001,001",
    "8": "111,101,111,101,111", "9": "111,101,111,001,111"
  };

  /* ============================================================
     SPRITE PRE-RENDER
     Character grids become ImageData once, at load. Nothing in the
     draw path parses a string.
     ============================================================ */
  var TILE = 16;
  var baked = {};

  function bakeSprite(spec, paletteOverride) {
    var rows = spec.rows, pal = paletteOverride || spec.palette;
    var trans = spec.transparent || null;
    var cv = makeCanvas(TILE, TILE);
    var ctx = cv.getContext("2d");
    var img = ctx.createImageData(TILE, TILE);
    for (var y = 0; y < TILE; y++) {
      for (var x = 0; x < TILE; x++) {
        var ch = rows[y].charAt(x);
        var o = (y * TILE + x) * 4;
        if (ch === trans) continue;
        var hex = pal[ch];
        if (!hex) continue;
        img.data[o] = parseInt(hex.substr(1, 2), 16);
        img.data[o + 1] = parseInt(hex.substr(3, 2), 16);
        img.data[o + 2] = parseInt(hex.substr(5, 2), 16);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function mirrorCanvas(src) {
    var cv = makeCanvas(TILE, TILE), ctx = cv.getContext("2d");
    ctx.translate(TILE, 0);
    ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
    return cv;
  }

  function makeCanvas(w, h) {
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    return cv;
  }

  function bakeAll() {
    for (var k in SPRITES) baked[k] = bakeSprite(SPRITES[k]);
    // The right-turn curves are the authored left-turn art mirrored.
    baked.beltCurveR = mirrorCanvas(baked.beltCurve);
    baked.expressCurveR = mirrorCanvas(baked.expressCurve);
    baked.robots = LIVERIES.map(function (L) {
      return bakeSprite(SPRITES.robot, {
        a: L.a, d: L.d, e: SPRITES.robot.palette.e, h: SPRITES.robot.palette.h
      });
    });
  }

  /* ============================================================
     BOARD RENDERING
     The course art is static, so it is drawn once per course to an
     offscreen canvas and thereafter blitted. Robots and beams are
     drawn on top every frame; the floor is not.
     ============================================================ */

  /* Which way a conveyor's art bends. Mechanically the engine
     derives rotation from the direction a robot travelled, so the
     in-arrows exist only for art -- they are exactly "which
     adjacent belts of my speed point at me", and are computed here
     rather than stored, which is one fewer thing to transcribe and
     one fewer thing to get wrong. */
  function beltArt(C, c, r) {
    var code = B.codeAt(C, c, r);
    var speed = B.beltSpeed(code);
    if (!speed) return null;
    var exit = B.dirOf(code), feeds = [];
    for (var d = 0; d < 4; d++) {
      if (d === exit) continue;
      var nb = B.step(c, r, d);
      if (B.isVoid(C, nb.c, nb.r)) continue;
      var ncode = B.codeAt(C, nb.c, nb.r);
      if (B.beltSpeed(ncode) !== speed) continue;
      if (B.dirOf(ncode) === B.opposite(d)) feeds.push(B.opposite(d)); // travel direction into this tile
    }
    var turns = [], straight = feeds.length === 0;
    for (var i = 0; i < feeds.length; i++) {
      var t = B.turnBetween(feeds[i], exit);
      if (t) turns.push(t); else straight = true;
    }
    return { speed: speed, exit: exit, turns: turns, straight: straight };
  }

  function drawSprite(ctx, cv, x, y, quarterTurns) {
    if (!quarterTurns) { ctx.drawImage(cv, x, y); return; }
    ctx.save();
    ctx.translate(x + TILE / 2, y + TILE / 2);
    ctx.rotate(quarterTurns * Math.PI / 2);
    ctx.drawImage(cv, -TILE / 2, -TILE / 2);
    ctx.restore();
  }

  function drawDigits(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < text.length; i++) {
      var g = FONT[text.charAt(i)];
      if (!g) continue;
      var lines = g.split(",");
      for (var ry = 0; ry < 5; ry++) {
        for (var rx = 0; rx < 3; rx++) {
          if (lines[ry].charAt(rx) === "1") ctx.fillRect(x + i * 4 + rx, y + ry, 1, 1);
        }
      }
    }
  }

  var WALL_T = 2;

  function drawCourse(C) {
    var cv = makeCanvas(C.w * TILE, C.h * TILE);
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    var c, r, x, y, code, el;

    // ---- floor and tile elements ----
    for (r = 0; r < C.h; r++) for (c = 0; c < C.w; c++) {
      x = c * TILE; y = r * TILE;
      if (B.isVoid(C, c, r)) { ctx.fillStyle = TOKENS.bg; ctx.fillRect(x, y, TILE, TILE); continue; }
      code = B.codeAt(C, c, r);
      el = B.elemOf(code);
      ctx.drawImage(baked.floor, x, y);

      var art = beltArt(C, c, r);
      if (art) {
        /* Curves first, straight band last. Where a belt is fed from
           more than one side the straight band covers the curve's
           centre and leaves only its side arm showing, which is what
           a merge actually looks like -- drawing the curve alone
           would claim the flow comes from the side, and a player
           reading the board would plan the wrong route. */
        var fam = art.speed === 2 ? "express" : "belt";
        for (var t = 0; t < art.turns.length; t++) {
          drawSprite(ctx, baked[fam + (art.turns[t] === -1 ? "Curve" : "CurveR")], x, y, art.exit);
        }
        if (art.straight || !art.turns.length) drawSprite(ctx, baked[fam], x, y, art.exit);
      } else if (el.gear) {
        ctx.drawImage(el.gear > 0 ? baked.gearCW : baked.gearCCW, x, y);
      } else if (el.push) {
        drawSprite(ctx, el.push === "odd" ? baked.pusherOdd : baked.pusherEven, x, y, B.dirOf(code));
        /* Which registers a pusher fires on is a rule, not decoration,
           so it is stamped on the tile rather than left to the legend.
           Upright and in a fixed corner whatever way the ram points,
           on its own dark backing so it reads over any art. */
        var lbl = el.push === "odd" ? "135" : "24";
        ctx.fillStyle = TOKENS.bg;
        ctx.fillRect(x + 1, y + 1, lbl.length * 4 + 1, 7);
        drawDigits(ctx, lbl, x + 2, y + 2, el.push === "odd" ? TOKENS.warn : TOKENS.accent);
      } else if (el.option) {
        ctx.drawImage(baked.upgrade, x, y);
      } else if (el.repair) {
        ctx.drawImage(baked.repair, x, y);
      } else if (code.charAt(0) === "o") {
        ctx.drawImage(baked.pit, x, y);
      } else if (code.charAt(0) === "s") {
        ctx.drawImage(baked.dock, x, y);
        drawDigits(ctx, code.charAt(1), x + 7, y + 6, TOKENS.accent);
      }
    }

    // ---- laser beams, under the walls so a mount reads as solid ----
    for (var li = 0; li < C.lasers.length; li++) {
      var L = C.lasers[li], path = B.laserPath(C, L);
      var horiz = (L.d === E || L.d === W);
      ctx.fillStyle = "rgba(255,51,51,0.22)";
      for (var pi = 0; pi < path.length; pi++) {
        var px = path[pi].c * TILE, py = path[pi].r * TILE;
        for (var n = 0; n < L.n; n++) {
          var off = TILE / 2 - (L.n - 1) * 2 + n * 4 - 1;
          if (horiz) ctx.fillRect(px, py + off, TILE, 2);
          else ctx.fillRect(px + off, py, 2, TILE);
        }
      }
      // the emitter itself
      var ex = L.c * TILE, ey = L.r * TILE;
      ctx.fillStyle = TOKENS.danger;
      var m = B.opposite(L.d);
      if (m === N) ctx.fillRect(ex + 4, ey, 8, 3);
      else if (m === S) ctx.fillRect(ex + 4, ey + TILE - 3, 8, 3);
      else if (m === W) ctx.fillRect(ex, ey + 4, 3, 8);
      else ctx.fillRect(ex + TILE - 3, ey + 4, 3, 8);
    }

    // ---- flags ----
    for (var fi = 0; fi < C.flags.length; fi++) {
      var F = C.flags[fi];
      ctx.drawImage(baked.flag, F.c * TILE, F.r * TILE);
      drawDigits(ctx, String(F.n), F.c * TILE + 8, F.r * TILE + 4, TOKENS.bg);
    }

    // ---- walls last: they sit on top of everything they block ----
    ctx.fillStyle = TOKENS.steel;
    for (r = 0; r < C.h; r++) for (c = 0; c < C.w; c++) {
      if (B.isVoid(C, c, r)) continue;
      x = c * TILE; y = r * TILE;
      if (B.wallAt(C, c, r, N)) ctx.fillRect(x, y, TILE, WALL_T);
      if (B.wallAt(C, c, r, W)) ctx.fillRect(x, y, WALL_T, TILE);
      if (B.wallAt(C, c, r, S)) ctx.fillRect(x, y + TILE - WALL_T, TILE, WALL_T);
      if (B.wallAt(C, c, r, E)) ctx.fillRect(x + TILE - WALL_T, y, WALL_T, TILE);
    }
    return cv;
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

    if (LIVERIES.length !== 8) throw new Error("there are " + LIVERIES.length + " liveries, but the game seats 8");
    var lid = {};
    for (var j = 0; j < LIVERIES.length; j++) {
      if (lid[LIVERIES[j].a]) throw new Error("two robots share the colour " + LIVERIES[j].a);
      lid[LIVERIES[j].a] = true;
    }

    // Sprite grids: the same data-shaped failure as a board picture.
    for (k in SPRITES) {
      var sp = SPRITES[k];
      if (sp.rows.length !== TILE) throw new Error("sprite " + k + " has " + sp.rows.length + " rows, expected " + TILE);
      for (var y = 0; y < sp.rows.length; y++) {
        if (sp.rows[y].length !== TILE) throw new Error("sprite " + k + " row " + y + " is " + sp.rows[y].length + " chars, expected " + TILE);
        for (var x = 0; x < TILE; x++) {
          var ch = sp.rows[y].charAt(x);
          if (ch === sp.transparent) continue;
          if (!sp.palette[ch]) throw new Error("sprite " + k + " row " + y + " uses '" + ch + "', which is not in its palette");
        }
      }
    }
    for (k in SPRITES) {
      var sp2 = SPRITES[k];
      if (sp2.transparent && sp2.palette[sp2.transparent]) {
        throw new Error("sprite " + k + " lists '" + sp2.transparent + "' as both transparent and a palette colour");
      }
    }
    for (k in FONT) {
      var lines = FONT[k].split(",");
      if (lines.length !== 5) throw new Error("font glyph " + k + " has " + lines.length + " rows, expected 5");
      for (var fy = 0; fy < 5; fy++) if (lines[fy].length !== 3) throw new Error("font glyph " + k + " row " + fy + " is not 3 wide");
    }
  }

  /* ============================================================
     STYLE
     Injected rather than shipped in index.html so the shell stays
     a shell and the game is one drop-in script.
     ============================================================ */
  var CSS = [
    ".pr-root{--pr-bg:" + TOKENS.bg + ";--pr-accent:" + TOKENS.accent + ";--pr-ink:" + TOKENS.ink + ";",
    "--pr-text:" + TOKENS.text + ";--pr-panel:" + TOKENS.panel + ";--pr-border:" + TOKENS.border + ";",
    "--pr-warn:" + TOKENS.warn + ";--pr-danger:" + TOKENS.danger + ";",
    "background:var(--pr-bg);color:var(--pr-ink);font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;",
    "display:flex;flex-direction:column;gap:12px;align-items:center;padding:16px;box-sizing:border-box}",
    ".pr-root *{box-sizing:border-box}",
    ".pr-board{image-rendering:pixelated;image-rendering:crisp-edges;display:block;",
    "border:1px solid var(--pr-border);max-width:100%;height:auto}",
    ".pr-title{color:var(--pr-accent);letter-spacing:2px;font-size:16px;margin:0}",
    ".pr-sub{margin:0;font-size:12px;opacity:.8}",
    ".pr-legend{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;max-width:640px;font-size:11px}",
    ".pr-legend b{color:var(--pr-text);font-weight:normal}",
    ".pr-err{color:var(--pr-danger);white-space:pre-wrap;font-size:12px;max-width:640px}",
    "@media (prefers-reduced-motion:reduce){.pr-root *{animation:none!important;transition:none!important}}",
    ".pr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}"
  ].join("");

  function injectCSS() {
    if (document.getElementById("pr-style")) return;
    var s = document.createElement("style");
    s.id = "pr-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ============================================================
     MOUNT
     P0 renders a course and nothing else: no state, no turn, no
     input. The gate for this phase is that the Proving Ground
     draws correctly and the validators throw on bad data.
     ============================================================ */
  function mount(el, opts) {
    opts = opts || {};
    injectCSS();
    el.classList.add("pr-root");
    el.innerHTML = "";

    var courseId = opts.course || "provingRun";
    var C;
    try {
      validateTables();
      B.validateAll();
      C = B.buildCourse(courseId);
    } catch (e) {
      var pre = document.createElement("div");
      pre.className = "pr-err";
      pre.textContent = "PumaRally failed to load:\n" + e.message;
      el.appendChild(pre);
      throw e;
    }

    bakeAll();
    var art = drawCourse(C);

    var h = document.createElement("h1");
    h.className = "pr-title";
    h.textContent = "PUMARALLY";
    var sub = document.createElement("p");
    sub.className = "pr-sub";
    sub.textContent = C.name + " — " + C.w + "x" + C.h + ", " + C.flags.length + " flags, " + C.docks.length + " docking bays";

    var scale = opts.scale || 2;
    art.className = "pr-board";
    art.style.width = (C.w * TILE * scale) + "px";
    art.setAttribute("role", "img");
    art.setAttribute("aria-label", describeCourse(C));

    var legend = document.createElement("div");
    legend.className = "pr-legend";
    legend.innerHTML = [
      "<span><b>rust arrows</b> conveyor (1)</span>",
      "<span><b>cyan arrows</b> express conveyor (2)</span>",
      "<span><b>amber hub</b> gear, clockwise</span>",
      "<span><b>cyan hub</b> gear, counter-clockwise</span>",
      "<span><b>piston</b> pusher, registers shown</span>",
      "<span><b>steel wrench</b> repair</span>",
      "<span><b>amber wrench</b> repair + option</span>",
      "<span><b>red bar</b> laser, thickness = damage</span>"
    ].join("");

    el.appendChild(h);
    el.appendChild(sub);
    el.appendChild(art);
    el.appendChild(legend);
    return { course: C, canvas: art };
  }

  /* A course described in words, for the canvas's aria-label. The
     grid of focusable cells arrives with the playable build in P2;
     until then this is what a screen reader gets. */
  function describeCourse(C) {
    var counts = {};
    for (var r = 0; r < C.h; r++) for (var c = 0; c < C.w; c++) {
      if (B.isVoid(C, c, r)) continue;
      var el = B.elemOf(B.codeAt(C, c, r));
      counts[el.name] = (counts[el.name] || 0) + 1;
    }
    var parts = [];
    for (var k in counts) if (k !== "floor") parts.push(counts[k] + " " + k + (counts[k] > 1 ? " tiles" : " tile"));
    return C.name + ", " + C.w + " by " + C.h + " squares, " + C.flags.length + " flags. Contains " + parts.join(", ") + ".";
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-pumarally]");
    for (var i = 0; i < nodes.length; i++) {
      mount(nodes[i], { course: nodes[i].getAttribute("data-course") || undefined,
                        scale: parseFloat(nodes[i].getAttribute("data-scale")) || undefined });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ============================================================
     DEBUG HOOKS
     ============================================================ */
  root.__PR = {
    B: B,
    mount: mount,
    TOKENS: TOKENS,
    SPRITES: SPRITES,
    LIVERIES: LIVERIES,
    PROGRAM_DECK: PROGRAM_DECK,
    openRegisters: openRegisters,
    cardsDealt: cardsDealt,
    validateTables: validateTables,
    buildCourse: function (id) { return B.buildCourse(id); },
    drawCourse: drawCourse
  };

  root.PumaRally = { mount: mount };

})(typeof self !== "undefined" ? self : this);
