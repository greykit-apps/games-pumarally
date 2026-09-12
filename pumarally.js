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

  /* The rules engine, its 32 rule tests and the headless sim touch no
     DOM, so Node can load this file and run them in CI. Only mount()
     and the sprite bake reach for document, and neither runs until
     something asks for a screen. */
  var B = root.PumaRallyBoards ||
    (typeof require === "function" ? require("./pumarally-boards.js") : null);
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
  /* @gen-sprites-begin */
  var SPRITES = {
    floor: {
      palette: { q: "#151c2e", p: "#1a2338", d: "#223052", h: "#2e4172" },
      rows: [
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqpphdpppppppppppppppppppphdppqq",
        "qqppddppppppppppppppppppppddppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqpphdpppppppppppppppppppphdppqq",
        "qqppddppppppppppppppppppppddppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqppppppppppppppppppppppppppppqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
      ]
    },
    pit: {
      palette: { q: "#151c2e", m: "#0d1322", k: "#05070f", d: "#1d2740" },
      rows: [
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqqqqqqqqqqqmmmmmmmmqqqqqqqqqqqq",
        "qqqqqqqqqqmddddddddddmqqqqqqqqqq",
        "qqqqqqqqmddkkkkkkkkkkddmqqqqqqqq",
        "qqqqqqqmdkkkkkkkkkkkkkkdmqqqqqqq",
        "qqqqqqddkkkkkkkkkkkkkkkkddqqqqqq",
        "qqqqqmdkkkkkkkkkkkkkkkkkkdmqqqqq",
        "qqqqmdkkkkkkkkkkkkkkkkkkkkdmqqqq",
        "qqqqdkkkkkkkkkkkkkkkkkkkkkkdqqqq",
        "qqqmdkkkkkkkkkkkkkkkkkkkkkkdmqqq",
        "qqqdkkkkkkkkkkkkkkkkkkkkkkkkdqqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqmdkkkkkkkkkkkkkkkkkkkkkkkkdmqq",
        "qqqdkkkkkkkkkkkkkkkkkkkkkkkkdqqq",
        "qqqmdkkkkkkkkkkkkkkkkkkkkkkdmqqq",
        "qqqqdkkkkkkkkkkkkkkkkkkkkkkdqqqq",
        "qqqqmdkkkkkkkkkkkkkkkkkkkkdmqqqq",
        "qqqqqmdkkkkkkkkkkkkkkkkkkdmqqqqq",
        "qqqqqqddkkkkkkkkkkkkkkkkddqqqqqq",
        "qqqqqqqmdkkkkkkkkkkkkkkdmqqqqqqq",
        "qqqqqqqqmddkkkkkkkkkkddmqqqqqqqq",
        "qqqqqqqqqqmddddddddddmqqqqqqqqqq",
        "qqqqqqqqqqqqmmmmmmmmqqqqqqqqqqqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
      ]
    },
    /* Conveyors are authored pointing NORTH and rotated to suit. One
       chevron for a conveyor, two for an express -- the speed has to be
       readable without reading the colour, because the two belts are the
       commonest thing to misjudge. The slats sell the direction. */
    belt: {
      palette: { v: "#241a11", u: "#3d2c1c", s: "#70512f", a: "#c25a2b" },
      transparent: ".",
      rows: [
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuauuuuuuuuuuuvv...",
        "...vvsssssssssaaassssssssssvv...",
        "...vvssssssssaaaaasssssssssvv...",
        "...vvuuuuuuuaaaaaaauuuuuuuuvv...",
        "...vvuuuuuuaaaaaaaaauuuuuuuvv...",
        "...vvuuuuuaaaaaaaaaaauuuuuuvv...",
        "...vvuuuuaaaaaaaaaaaaauuuuuvv...",
        "...vvsssaaaaaaaaaaaaaaassssvv...",
        "...vvssaaaaaaaaaaaaaaaaasssvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvsssssssssaaassssssssssvv...",
        "...vvsssssssssaaassssssssssvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv..."
      ]
    },
    express: {
      palette: { v: "#0e2233", u: "#163449", s: "#2b6e93", a: "#54f2ff" },
      transparent: ".",
      rows: [
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvuuuuuuuuuuauuuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuaaaaauuuuuuuuuvv...",
        "...vvuuuuuuuaaaaaaauuuuuuuuvv...",
        "...vvssssssaaaaaaaaasssssssvv...",
        "...vvsssssaaaaaaaaaaassssssvv...",
        "...vvuuuuaaaaaaaaaaaaauuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuauuuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuaaaaauuuuuuuuuvv...",
        "...vvsssssssaaaaaaassssssssvv...",
        "...vvssssssaaaaaaaaasssssssvv...",
        "...vvuuuuuaaaaaaaaaaauuuuuuvv...",
        "...vvuuuuaaaaaaaaaaaaauuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvuuuuuuuuuaaauuuuuuuuuuvv...",
        "...vvsssssssssaaassssssssssvv...",
        "...vvssssssssssssssssssssssvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv..."
      ]
    },
    /* A curve authored as fed-from-the-west, exits-north -- a LEFT turn.
       The right-turn curve is this mirrored at bake time, so the corner
       art is authored once. */
    beltCurve: {
      palette: { v: "#241a11", u: "#3d2c1c", s: "#70512f", a: "#c25a2b" },
      transparent: ".",
      rows: [
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvssssssssssasssssssssssvv...",
        "uuuvvuuuuuuuuuaaauuuuuuuuuuvv...",
        "uuuvvuuuuuuuuaaaaauuuuuuuuuvv...",
        "uuuvvuuuuuuuaaaaaaauuuuuuuuvv...",
        "uuuvvuuuuuuaaaaaaaaauuuuuuuvv...",
        "uuuvvsssssaaaaaaaaaaassssssvv...",
        "uuuvvssssaaaaaaaaaaaaasssssvv...",
        "uuuvvuuuaaaaaaaaaaaaaaauuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "................................",
        "................................",
        "................................"
      ]
    },
    expressCurve: {
      palette: { v: "#0e2233", u: "#163449", s: "#2b6e93", a: "#54f2ff" },
      transparent: ".",
      rows: [
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "...vvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "uuuvvuuuuuuuuuuauuuuuuuuuuuvv...",
        "uuuvvsssssssssaaassssssssssvv...",
        "uuuvvssssssssaaaaasssssssssvv...",
        "uuuvvuuuuuuuaaaaaaauuuuuuuuvv...",
        "uuuvvuuuuuuaaaaaaaaauuuuuuuvv...",
        "uuuvvuuuuuaaaaaaaaaaauuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvssssssssssasssssssssssvv...",
        "uuuvvuuuuuuuuuaaauuuuuuuuuuvv...",
        "uuuvvuuuuuuuuaaaaauuuuuuuuuvv...",
        "uuuvvuuuuuuuaaaaaaauuuuuuuuvv...",
        "uuuvvuuuuuuaaaaaaaaauuuuuuuvv...",
        "uuuvvsssssaaaaaaaaaaassssssvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvssssssssssssssssssssssvv...",
        "uuuvvuuuuuuuuuuuuuuuuuuuuuuvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "vvvvvvvvvvvvvvvvvvvvvvvvvvvvv...",
        "................................",
        "................................",
        "................................"
      ]
    },
    /* Eight teeth, a hub and an offset notch. Colour alone carried the
       turn direction at 16 pixels; at 32 the notch does the work and the
       colour is redundancy rather than the only cue. */
    gearCW: {
      palette: { g: "#4a5578", h: "#6b7aa8", a: "#ffb000" },
      transparent: ".",
      rows: [
        ".............gggggg.............",
        ".............gggggg.............",
        ".............gggggg.............",
        "...ggggg....hhhhhhhh....ggggg...",
        "...gggggg.hhhhhhhhhhhh.gggggg...",
        "...ggggghhhhhgggggaahhhhggggg...",
        "...gggghhhgggggggaaaaghhhgggg...",
        "...ggghhhggggggggaaaagghhhggg...",
        "....ghhhgggggggggaaaaggghhhg....",
        ".....hhgggggggggggaaggggghh.....",
        "....hhgggggggghhhhgggggggghh....",
        "....hhgggggghhhhhhhhgggggghh....",
        "...hhhggggghhhaaaahhhggggghhh...",
        "ggghhgggggghhaaaaaahhgggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhgggggghhaaaaaahhgggggghhggg",
        "...hhhggggghhhaaaahhhggggghhh...",
        "....hhgggggghhhhhhhhgggggghh....",
        "....hhgggggggghhhhgggggggghh....",
        ".....hhgggggggggggggggggghh.....",
        "....ghhhgggggggggggggggghhhg....",
        "...ggghhhgggggggggggggghhhggg...",
        "...gggghhhgggggggggggghhhgggg...",
        "...ggggghhhhhgggggghhhhhggggg...",
        "...gggggg.hhhhhhhhhhhh.gggggg...",
        "...ggggg....hhhhhhhh....ggggg...",
        ".............gggggg.............",
        ".............gggggg.............",
        ".............gggggg............."
      ]
    },
    gearCCW: {
      palette: { g: "#4a5578", h: "#6b7aa8", a: "#54f2ff" },
      transparent: ".",
      rows: [
        ".............gggggg.............",
        ".............gggggg.............",
        ".............gggggg.............",
        "...ggggg....hhhhhhhh....ggggg...",
        "...gggggg.hhhhhhhhhhhh.gggggg...",
        "...ggggghhhhaaggggghhhhhggggg...",
        "...gggghhhgaaaaggggggghhhgggg...",
        "...ggghhhggaaaagggggggghhhggg...",
        "....ghhhgggaaaaggggggggghhhg....",
        ".....hhgggggaaggggggggggghh.....",
        "....hhgggggggghhhhgggggggghh....",
        "....hhgggggghhhhhhhhgggggghh....",
        "...hhhggggghhhaaaahhhggggghhh...",
        "ggghhgggggghhaaaaaahhgggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhggggghhaaaaaaaahhggggghhggg",
        "ggghhgggggghhaaaaaahhgggggghhggg",
        "...hhhggggghhhaaaahhhggggghhh...",
        "....hhgggggghhhhhhhhgggggghh....",
        "....hhgggggggghhhhgggggggghh....",
        ".....hhgggggggggggggggggghh.....",
        "....ghhhgggggggggggggggghhhg....",
        "...ggghhhgggggggggggggghhhggg...",
        "...gggghhhgggggggggggghhhgggg...",
        "...ggggghhhhhgggggghhhhhggggg...",
        "...gggggg.hhhhhhhhhhhh.gggggg...",
        "...ggggg....hhhhhhhh....ggggg...",
        ".............gggggg.............",
        ".............gggggg.............",
        ".............gggggg............."
      ]
    },
    /* Pushers are authored pushing NORTH: the housing sits on the south
       edge, where its wall is, and the ram points the way it shoves. The
       renderer stamps the register numbers on top. */
    pusherOdd: {
      palette: { n: "#a86a28", m: "#7a4a1a", a: "#ffb000" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "................................",
        "...............a................",
        "..............aaa...............",
        ".............aaaaa..............",
        "............aaaaaaa.............",
        "...........aaaaaaaaa............",
        "..........aaaaaaaaaaa...........",
        ".........aaaaaaaaaaaaa..........",
        "........aaaaaaaaaaaaaaa.........",
        "..............aaaa..............",
        ".............naaaan.............",
        ".............nnnnnn.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        "....nnnnnnnnnmmmmmmnnnnnnnnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn....",
        "....nnmmmmmmmmmmmmmmmmmmmmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmmmmmmmmmmmmmmmmmmmmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn...."
      ]
    },
    pusherEven: {
      palette: { n: "#2c6a7f", m: "#194a5c", a: "#54f2ff" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "................................",
        "...............a................",
        "..............aaa...............",
        ".............aaaaa..............",
        "............aaaaaaa.............",
        "...........aaaaaaaaa............",
        "..........aaaaaaaaaaa...........",
        ".........aaaaaaaaaaaaa..........",
        "........aaaaaaaaaaaaaaa.........",
        "..............aaaa..............",
        ".............naaaan.............",
        ".............nnnnnn.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        ".............mmmmmm.............",
        "....nnnnnnnnnmmmmmmnnnnnnnnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn....",
        "....nnmmmmmmmmmmmmmmmmmmmmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmmmmmmmmmmmmmmmmmmmmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnmnnnmmmmmmmmmmmmnnnmnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn....",
        "....nnnnnnnnnnnnnnnnnnnnnnnn...."
      ]
    },
    repair: {
      palette: { s: "#8b93b5", h: "#c9d2f0" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............ssssssss...........",
        ".............sshhhhss...........",
        ".............sshhhhss...........",
        ".............ssssssss...........",
        "...............ssss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............ssss.............",
        "..............ssssss............",
        "..............ssssss............",
        "..............ssssss............",
        "..............ssssss............",
        "................................",
        "................................",
        "................................"
      ]
    },
    upgrade: {
      palette: { s: "#ffb000", h: "#ffd98a", a: "#ffb000", k: "#4a3000" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............sss..sss...........",
        ".............ssssssss...........",
        ".............sshhhhss...........",
        ".............sshhhhss...........",
        ".............ssssssss...........",
        "...............ssss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss.............",
        "...............shss..aaa..aaa...",
        "...............shss..aaaaaaaa...",
        "...............shss..aaaaaaaa...",
        "...............shss..aaaaaaaa...",
        "...............shssaaaaakkaaaaa.",
        "...............sssaaaaakkkkaaaaa",
        "..............ssssaaaaakkkkaaaaa",
        "..............sssssaaaaakkaaaaa.",
        "..............ssssss.aaaaaaaa...",
        "..............ssssss.aaaaaaaa...",
        ".....................aaaaaaaa...",
        ".....................aaa..aaa...",
        "................................"
      ]
    },
    flag: {
      palette: { s: "#8b93b5", a: "#ffb000", h: "#ffd98a" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        ".........sss....................",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssahhhhhhhhhhhaaaa....",
        ".........sssahhhhhhhhhhhaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sssaaaaaaaaaaaaaaaa....",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        ".........sss....................",
        "......sssssssss.................",
        "......sssssssss.................",
        "......sssssssss.................",
        "......sssssssss.................",
        "................................"
      ]
    },
    dock: {
      palette: { h: "#54f2ff" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "..hhhhhhhhh..........hhhhhhhhh..",
        "..hhhhhh................hhhhhh..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..h..........................h..",
        "..h..........................h..",
        "..h..........................h..",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "..h..........................h..",
        "..h..........................h..",
        "..h..........................h..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..hh........................hh..",
        "..hhhhhh................hhhhhh..",
        "..hhhhhhhhh..........hhhhhhhhh..",
        "................................",
        "................................"
      ]
    },
    /* One robot, authored facing north, with eight palette maps. That is
       the difference between 40 lines of art and 320. */
    robot: {
      palette: { a: "#ffb000", d: "#8a5c00", e: "#54f2ff", h: "#e8ecff", t: "#7d86a8", k: "#2a1c00" },
      transparent: ".",
      rows: [
        "................................",
        "................................",
        "...............d................",
        "..............ddd...............",
        ".............ddeed..............",
        "............dddeedd.............",
        "...........ddddeeddd............",
        "..........dddaaaaaadd...........",
        ".............aaaaaa.............",
        ".......ddddddaaaaaadddddd.......",
        ".......dddddddddddddddddd.......",
        "..dddddddhhhhhhhhhhhhhhddddddd..",
        "..dddddddaaaaaaaaaaaaaaddddddd..",
        "..dttttddakkkkkkkkkkkkaddttttd..",
        "..dddddddakeeeeeeeeeekaddddddd..",
        "..dddddddakeeeeeeeeeekaddddddd..",
        "..dddddddakeeeeeeeeeekaddddddd..",
        "..dttttddakkkkkkkkkkkkaddttttd..",
        "..dddddddakkkkkkkkkkkkaddddddd..",
        "..dddddddaaaaaaaaaaaaaaddddddd..",
        "..dddddddaaaaaaaaaaaaaaddddddd..",
        "..dttttddaaddddddddddaaddttttd..",
        "..dddddddaaddddddddddaaddddddd..",
        "..dddddddaaaaaaaaaaaaaaddddddd..",
        "..dddddddaaaaaaaaaaaaaaddddddd..",
        "..dttttddaaaaaaaaaaaaaaddttttd..",
        "..dddddddddddddddddddddddddddd..",
        "..dddddddddddddddddddddddddddd..",
        "..dddddd................dddddd..",
        "..dddddd................dddddd..",
        "................................",
        "................................"
      ]
    }
  };
  /* @gen-sprites-end */

  /* A 5x7 numeral font. Flag numbers,
     docking bay numbers and register pips all come from here, so
     the game never needs a web font to render a digit. */
  var FONT = {
    "0": "01110,10001,10011,10101,11001,10001,01110",
    "1": "00100,01100,00100,00100,00100,00100,01110",
    "2": "01110,10001,00001,00010,00100,01000,11111",
    "3": "11111,00010,00100,00010,00001,10001,01110",
    "4": "00010,00110,01010,10010,11111,00010,00010",
    "5": "11111,10000,11110,00001,00001,10001,01110",
    "6": "00110,01000,10000,11110,10001,10001,01110",
    "7": "11111,00001,00010,00100,01000,01000,01000",
    "8": "01110,10001,10001,01110,10001,10001,01110",
    "9": "01110,10001,10001,01111,00001,00010,01100"
  };

  /* ============================================================
     SPRITE PRE-RENDER
     Character grids become ImageData once, at load. Nothing in the
     draw path parses a string.
     ============================================================ */
  var TILE = 32;
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
    /* A livery overrides only the two body colours. The rest of the
       palette is copied rather than listed, so adding a colour to the
       robot cannot silently drop those pixels from all eight liveries --
       which is exactly what an explicit list did when the treads gained
       their own tone. */
    baked.robots = LIVERIES.map(function (L) {
      var pal = {}, key;
      for (key in SPRITES.robot.palette) pal[key] = SPRITES.robot.palette[key];
      pal.a = L.a;
      pal.d = L.d;
      return bakeSprite(SPRITES.robot, pal);
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

  var GLYPH_W = 5, GLYPH_H = 7, GLYPH_ADV = 6;

  function drawDigits(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < text.length; i++) {
      var g = FONT[text.charAt(i)];
      if (!g) continue;
      var lines = g.split(",");
      for (var ry = 0; ry < GLYPH_H; ry++) {
        for (var rx = 0; rx < GLYPH_W; rx++) {
          if (lines[ry].charAt(rx) === "1") ctx.fillRect(x + i * GLYPH_ADV + rx, y + ry, 1, 1);
        }
      }
    }
  }

  function digitsWidth(text) { return text.length * GLYPH_ADV - 1; }

  var WALL_T = 4;

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
        ctx.fillRect(x + 2, y + 2, digitsWidth(lbl) + 4, GLYPH_H + 4);
        drawDigits(ctx, lbl, x + 4, y + 4, el.push === "odd" ? TOKENS.warn : TOKENS.accent);
      } else if (el.option) {
        ctx.drawImage(baked.upgrade, x, y);
      } else if (el.repair) {
        ctx.drawImage(baked.repair, x, y);
      } else if (code.charAt(0) === "o") {
        ctx.drawImage(baked.pit, x, y);
      } else if (code.charAt(0) === "s") {
        ctx.drawImage(baked.dock, x, y);
        var dn = code.charAt(1);
        drawDigits(ctx, dn, x + (TILE - digitsWidth(dn)) / 2, y + (TILE - GLYPH_H) / 2, TOKENS.accent);
      }
    }

    // ---- laser beams, under the walls so a mount reads as solid ----
    for (var li = 0; li < C.lasers.length; li++) {
      var L = C.lasers[li], path = B.laserPath(C, L);
      var horiz = (L.d === E || L.d === W);
      var bar = 3, gap = 6;
      ctx.fillStyle = "rgba(255,51,51,0.22)";
      for (var pi = 0; pi < path.length; pi++) {
        var px = path[pi].c * TILE, py = path[pi].r * TILE;
        for (var n = 0; n < L.n; n++) {
          var off = Math.round(TILE / 2 - ((L.n - 1) * gap + bar) / 2 + n * gap);
          if (horiz) ctx.fillRect(px, py + off, TILE, bar);
          else ctx.fillRect(px + off, py, bar, TILE);
        }
      }
      // the emitter itself
      var ex = L.c * TILE, ey = L.r * TILE;
      ctx.fillStyle = TOKENS.danger;
      var m = B.opposite(L.d), lw = Math.round(TILE * 0.4), lt = 5, lo = Math.round((TILE - lw) / 2);
      if (m === N) ctx.fillRect(ex + lo, ey, lw, lt);
      else if (m === S) ctx.fillRect(ex + lo, ey + TILE - lt, lw, lt);
      else if (m === W) ctx.fillRect(ex, ey + lo, lt, lw);
      else ctx.fillRect(ex + TILE - lt, ey + lo, lt, lw);
    }

    // ---- flags ----
    for (var fi = 0; fi < C.flags.length; fi++) {
      var F = C.flags[fi];
      ctx.drawImage(baked.flag, F.c * TILE, F.r * TILE);
      drawDigits(ctx, String(F.n), F.c * TILE + 16, F.r * TILE + 7, TOKENS.bg);
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
      if (lines.length !== GLYPH_H) throw new Error("font glyph " + k + " has " + lines.length + " rows, expected " + GLYPH_H);
      for (var fy = 0; fy < GLYPH_H; fy++) {
        if (lines[fy].length !== GLYPH_W) throw new Error("font glyph " + k + " row " + fy + " is " + lines[fy].length + " wide, expected " + GLYPH_W);
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
    prevRects: null,
    queue: [],
    playing: false,
    timer: null,
    beams: null,
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
  function botPick(p, choice) {
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

  function runPlan(p, plan) {
    if (plan.kind === "turn") { p.face = B.rot(p.face, plan.turn); return; }
    var dir = plan.lateral ? B.rot(p.face, plan.lateral)
            : plan.dist > 0 ? p.face : B.opposite(p.face);
    var n = Math.abs(plan.dist);
    for (var i = 0; i < n; i++) {
      if (!p.alive) return;
      if (!stepRobot(p, dir, "move")) break;          // walked into a wall; the rest of the move is lost
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
      var reach = fire(p, "onTouchCheckpoint", { reach: 0 }).reach;
      var spots = [{ c: p.c, r: p.r }];
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
        return NEXT;
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
        if (!G.exec.queue.length) { go("exec", "express"); return NEXT; }
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
        return animate([{ type: "sfx", name: "move" }, { type: "render" }, { type: "wait", delay: 300 }]);
      },

      /* Each board element gets its own beat, but only if it actually
         moved somebody. A pause for a pusher nobody was standing on is
         five wasted seconds a turn, and the player learns to stop
         watching -- which is the opposite of what the beat is for. */
      express: function () { return boardBeat(beltPass, 2, "belts", 300, "belt"); },
      belts: function () { return boardBeat(beltPass, 1, "pushers", 300, "belt"); },
      pushers: function () { return boardBeat(pusherPass, null, "gears", 260, "shove"); },
      gears: function () { return boardBeat(gearPass, null, "lasers", 260, "gear"); },

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
        go("exec", "touch");
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
        go("cleanup", "repair");
        return NEXT;
      }
    },

    cleanup: {
      /* Repairs happen here and only here -- never at the touch step,
         where it is tempting to fold them in. */
      repair: function () {
        var C = UI.course, alive = live();
        for (var i = 0; i < alive.length; i++) {
          var p = alive[i], el = B.elemOf(B.codeAt(C, p.c, p.r)), onFlag = false;
          for (var f = 0; f < C.flags.length; f++) if (C.flags[f].c === p.c && C.flags[f].r === p.r) onFlag = true;
          if ((el && el.repair) || onFlag) {
            if (p.damage > 0) { p.damage--; log(p.name + " repairs 1 damage"); }
          }
          if (el && el.option) drawOption(p);
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
  function boardBeat(fn, arg, nextStep, delay, sound) {
    var before = boardSig();
    if (arg === null) fn(); else fn(arg);
    go("exec", nextStep);
    if (boardSig() === before) return NEXT;
    return animate([{ type: "sfx", name: sound }, { type: "render" }, { type: "wait", delay: delay }]);
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

    { name: "the table rejects a hook that no card uses", run: function () {
      HOOKS.push("onNeverFired");
      var threw = null;
      try { validateTables(); } catch (e) { threw = e.message; }
      HOOKS.pop();
      assert(threw && /no option card uses it/.test(threw),
        "a hook nothing fires is dead code that reads as coverage; expected an error, got " + threw);
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
    ".pr-root{--pr-bg:" + TOKENS.bg + ";--pr-accent:" + TOKENS.accent + ";--pr-ink:" + TOKENS.ink + ";",
    "--pr-text:" + TOKENS.text + ";--pr-panel:" + TOKENS.panel + ";--pr-border:" + TOKENS.border + ";",
    "--pr-warn:" + TOKENS.warn + ";--pr-danger:" + TOKENS.danger + ";--pr-plate:" + TOKENS.plate + ";",
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
    ".pr-main{display:flex;gap:12px;align-items:stretch}",
    ".pr-side{width:250px;flex:0 0 250px;display:flex;flex-direction:column;gap:8px;min-height:0}",
    ".pr-side .pr-panel:last-child{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}",
    "@media (max-width:900px){.pr-main{flex-direction:column;align-items:center}.pr-side{width:100%;flex:none}}",

    /* ---- the three stacked board layers ---- */
    ".pr-stage{position:relative;border:1px solid var(--pr-border);flex:0 0 auto}",
    ".pr-board,.pr-fx{image-rendering:pixelated;image-rendering:crisp-edges;display:block;",
    "position:absolute;left:0;top:0;height:auto}",
    ".pr-fx{pointer-events:none}",
    ".pr-grid{position:absolute;left:0;top:0;display:grid}",
    ".pr-cell{border:0;padding:0;background:transparent;cursor:default}",
    ".pr-pieces{position:absolute;left:0;top:0;pointer-events:none}",
    ".pr-piece{position:absolute;transition:transform .22s var(--pr-ease,cubic-bezier(.25,1,.5,1))}",
    ".pr-piece canvas{image-rendering:pixelated;display:block;width:100%;height:100%;",
    "transition:transform .22s cubic-bezier(.25,1,.5,1)}",
    ".pr-piece.pr-dead{opacity:0;transform:scale(.4)}",
    ".pr-archive{position:absolute;border:2px dashed currentColor;opacity:.5}",

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
    ".pr-log{flex:1 1 auto;min-height:160px;overflow-y:auto;font-size:11px;line-height:1.45}",
    ".pr-log div{padding:1px 0;border-bottom:1px solid rgba(255,255,255,.04)}",
    ".pr-log .reg{color:var(--pr-accent)}",

    /* ---- program bar ---- */
    ".pr-program{display:flex;flex-direction:column;gap:8px;align-items:center;width:100%}",
    ".pr-regs,.pr-hand{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}",
    ".pr-card{width:76px;height:48px;display:flex;flex-direction:column;align-items:center;",
    "justify-content:center;gap:2px;background:var(--pr-plate);border:1px solid var(--pr-border);padding:2px}",
    ".pr-card b{color:var(--pr-text);font-weight:normal;font-size:12px;letter-spacing:.5px}",
    ".pr-card span{font-size:10px;opacity:.65}",
    ".pr-slot{width:76px;height:48px;border:1px dashed var(--pr-border);display:flex;align-items:center;",
    "justify-content:center;background:transparent;position:relative}",
    ".pr-slot .pr-n{position:absolute;top:2px;left:4px;font-size:9px;opacity:.5}",
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
    ".pr-legend{display:flex;flex-wrap:wrap;gap:2px 12px;justify-content:center;max-width:780px;font-size:10px;opacity:.75}",
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
    ".pr-tabs,.pr-presets{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 10px}",
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
    ".pr-ed-stage .pr-board{position:absolute;left:0;top:0}",
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
     screen-reader view of a board that is otherwise pixels.
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

  function pxScale() { return parseFloat(UI.els.board.dataset.scale) || 1; }

  function snapshotPieces() {
    UI.prevRects = {};
    var nodes = UI.els.pieces.children, i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.uid === undefined) continue;
      UI.prevRects[el.dataset.uid] = { x: el.offsetLeft, y: el.offsetTop };
    }
  }

  function renderPieces() {
    if (!G) return;                  // mount sizes the stage before the first deal
    var s = pxScale(), size = TILE * s, host = UI.els.pieces, i;
    for (i = 0; i < G.players.length; i++) {
      var p = G.players[i], id = "p" + p.id;
      var el = UI.pieceEls[id];
      if (!el) {
        el = document.createElement("div");
        el.className = "pr-piece";
        el.dataset.uid = id;
        var art = document.createElement("canvas");
        art.width = TILE; art.height = TILE;
        art.getContext("2d").drawImage(baked.robots[p.livery], 0, 0);
        el.appendChild(art);
        host.appendChild(el);
        UI.pieceEls[id] = el;
      }
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.left = (p.c * size) + "px";
      el.style.top = (p.r * size) + "px";
      el.firstChild.style.transform = "rotate(" + (p.face * 90) + "deg)";
      el.classList.toggle("pr-dead", !p.alive);
      el.setAttribute("aria-hidden", "true");
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

  function drawBeams() {
    var cv = UI.els.fx, ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!UI.beams || !UI.beams.length) return;
    var C = UI.course;
    ctx.fillStyle = "rgba(255,80,80,0.85)";
    for (var i = 0; i < UI.beams.length; i++) {
      var b = UI.beams[i], horiz = (b.dir === E || b.dir === W);
      var c = b.c, r = b.r;
      for (var n = 0; n < 40; n++) {
        var t = 3, off = Math.round(TILE / 2 - t / 2);
        if (horiz) ctx.fillRect(c * TILE, r * TILE + off, TILE, t);
        else ctx.fillRect(c * TILE + off, r * TILE, t, TILE);
        if (b.stopC === c && b.stopR === r) break;
        if (B.wallAt(C, c, r, b.dir)) break;
        var nx = B.step(c, r, b.dir);
        if (B.isVoid(C, nx.c, nx.r)) break;
        c = nx.c; r = nx.r;
      }
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

  function updateLog() {
    var host = UI.els.log, out = [], start = Math.max(0, G.log.length - 60), i;
    for (i = start; i < G.log.length; i++) {
      var e = G.log[i];
      out.push('<div' + (/^--/.test(e.msg) ? ' class="reg"' : "") + ">" + esc(e.msg) + "</div>");
    }
    host.innerHTML = out.join("");
    host.scrollTop = host.scrollHeight;
  }

  function cardFace(cd) {
    var k = CARD_KINDS[cd.kind];
    return "<b>" + esc(k.label.toUpperCase()) + "</b><span>" + cd.pri + "</span>";
  }

  function renderProgram() {
    var me = G.players[G.actor === undefined ? 0 : G.actor];
    var mine = me && isHuman(me) && me.alive;
    var programming = inPhase("turn", "program") && mine;
    var open = me ? openRegisters(me.damage) : REGISTERS;
    var i, out = [];

    for (i = 0; i < REGISTERS; i++) {
      var locked = i >= open;
      var ci = me ? me.registers[i] : null;
      var next = (programming && !locked && ci === null && firstEmpty(me) === i) ||
                 (G.phase === "exec" && G.register === i);
      out.push(
        '<button class="pr-slot' + (locked ? " pr-locked" : "") + (next ? " pr-next" : "") +
        '" data-act="slot" data-i="' + i + '"' + (programming && !locked && ci !== null ? "" : " disabled") +
        ' aria-label="Register ' + (i + 1) + (locked ? ", locked" : ci !== null ? ", " + CARD_KINDS[card(ci).kind].label : ", empty") + '">' +
        '<span class="pr-n">' + (i + 1) + (locked ? " LOCK" : "") + "</span>" +
        (ci === null ? "" : '<span class="pr-card">' + cardFace(card(ci)) + "</span>") +
        "</button>"
      );
    }
    UI.els.regs.innerHTML = out.join("");

    out = [];
    if (programming) {
      for (i = 0; i < me.hand.length; i++) {
        var cd = card(me.hand[i]);
        out.push('<button class="pr-card" data-act="card" data-i="' + i + '" aria-label="' +
          esc(CARD_KINDS[cd.kind].label) + ", priority " + cd.pri + '">' + cardFace(cd) + "</button>");
      }
    }
    UI.els.hand.innerHTML = out.join("");

    var ready = programming && firstEmpty(me) === -1;
    UI.els.run.disabled = !ready;
    UI.els.run.textContent = needsCurtain() ? "Lock in" : "Run registers";
    UI.els.clear.disabled = !programming || !me.registers.some(function (x, ix) { return x !== null && ix < open; });
    UI.els.down.disabled = !programming;
    UI.els.down.classList.toggle("on", !!(me && me.announceDown));
    UI.els.hint.textContent = G.gameOver ? ""
      : (G.phase === "exec" && G.step === "optionChoice") ? ""
      : programming ? (ready ? "Registers full. Run, or click a register to take a card back."
                             : "Click cards to fill registers " + (firstEmpty(me) + 1) + "-" + open + ".")
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
    var def = OPTION_DEFS[ch.optionId], out = "<b>" + esc(def.name) + "</b> <span>" + esc(ch.prompt) + "</span>";
    for (var i = 0; i < ch.labels.length; i++) {
      out += ' <button data-act="pick" data-i="' + i + '">' + esc(ch.labels[i]) + "</button>";
    }
    if (host.innerHTML !== out) {
      host.innerHTML = out;
      announce(def.name + ". " + ch.prompt);
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

  function onCardClick(i) {
    var p = actor();
    if (!inPhase("turn", "program") || !p || curtainUp()) return;
    var slot = firstEmpty(p);
    if (slot < 0 || i < 0 || i >= p.hand.length) return;
    sfx("place");
    p.registers[slot] = p.hand.splice(i, 1)[0];
    announce("Register " + (slot + 1) + " set.");
    updateAll();
  }

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
  function gameOpts(base) {
    var cfg = resolveConfig(houseRules);
    return {
      course: (base && base.course) || undefined,
      players: cfg.players, humans: cfg.humans,
      skill: cfg.skill, startOptions: cfg.startOptions
    };
  }

  function onNewGame() {
    stopQueue();
    clearSave();
    UI.wallsChecked = false;
    UI.curtainCleared = null;
    newGame((Math.random() * 1e9) | 0, gameOpts(UI.opts));
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
                    desc: "Option cards each robot begins holding, instead of earning them at upgrade sites." }
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
    return out;
  }

  function loadRules() {
    var out = defaultRules();
    try {
      var s = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
      for (var k in out) if (s && typeof s[k] === "number") out[k] = clampRule(k, s[k]);
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
      players: players,
      humans: Math.min(players, clampRule("humans", h.humans)),
      skill: clampRule("skill", h.skill),
      startOptions: clampRule("startOptions", h.startOptions)
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
    { phase: "exec", step: "lasers", title: "Lasers",
      body: "Board lasers and robot lasers fire at the same instant, so a robot destroyed this register still gets its shot off. Walls block. A powered-down robot does not fire." },
    { phase: "exec", step: "touch", title: "Flags and repair sites",
      body: "Touching a flag in sequence scores it; touching one out of order still moves your archive." },
    { phase: "cleanup", step: "repair", title: "Repairs",
      body: "One damage off if you end the turn on a wrench or a flag. Upgrade sites also deal an option card." },
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

    for (var k in SLIDER_DEFS) {
      var d = SLIDER_DEFS[k], v = houseRules[k];
      var shown = d.labels ? d.labels[v] : v;
      out.push('<div class="pr-rule"><div class="pr-rule-head"><b>' + esc(d.label) + "</b>" +
        '<span class="pr-rule-val">' + esc(String(shown)) + (d.harder && v > d.def ? ' <i class="pr-harder">harder</i>' : "") + "</span></div>" +
        '<input type="range" data-act="rule" data-k="' + k + '" min="' + d.min + '" max="' + d.max + '" value="' + v + '">' +
        '<div class="pr-rule-desc">' + esc(d.desc) + "</div></div>");
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

  function buildBoardHelp() {
    var out = ["<table><tr><th>Tile</th><th>What it does</th></tr>"];
    var seen = {};
    for (var ch in B.ELEMENT_DEFS) {
      var d = B.ELEMENT_DEFS[ch];
      if (seen[d.name]) continue;
      seen[d.name] = true;
      out.push("<tr><td>" + esc(d.name) + "</td><td>" + esc(elementBlurb(ch, d)) + "</td></tr>");
    }
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
      "<p>A faithful port of the RoboRally rules in original pixel art.</p>" +
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
    var s = ED.zoom;
    var cv = drawCourse(edCourseView());
    cv.className = "pr-board";
    cv.style.width = (ED.grid.w * TILE * s) + "px";
    cv.dataset.scale = s;
    host.innerHTML = "";
    host.style.width = (ED.grid.w * TILE * s) + "px";
    host.style.height = (ED.grid.h * TILE * s) + "px";

    if (ED.underlay) {
      var img = document.createElement("img");
      img.className = "pr-ed-under";
      img.src = ED.underlay;
      img.style.opacity = ED.opacity;
      img.style.left = ED.offX + "px";
      img.style.top = ED.offY + "px";
      img.style.width = (ED.grid.w * TILE * s * ED.uScale) + "px";
      host.appendChild(img);
    }
    host.appendChild(cv);

    var grid = document.createElement("div");
    grid.className = "pr-ed-grid";
    grid.style.gridTemplateColumns = "repeat(" + ED.grid.w + "," + (TILE * s) + "px)";
    grid.style.gridAutoRows = (TILE * s) + "px";
    var out = [], c, r;
    for (r = 0; r < ED.grid.h; r++) {
      for (c = 0; c < ED.grid.w; c++) {
        out.push('<div class="pr-ed-cell" data-c="' + c + '" data-r="' + r + '"' +
          ' title="' + c + "," + r + '"></div>');
      }
    }
    grid.innerHTML = out.join("");
    host.appendChild(grid);
    edRenderPanel();
  }

  /* drawCourse wants something course-shaped. A board being edited is
     one board with no flags, which is exactly that minus the flags. */
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

    bakeAll();

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
     Pixel art only survives INTEGER scaling: at 1.5x some sprite
     pixels land on two screen pixels and their neighbours on one,
     so a conveyor's slats come out unevenly spaced and the whole
     tile looks smeared. So the board takes the largest whole
     multiple that fits the column it is given, and would rather
     scroll a little than take a fractional one.

     The cap exists because the multiple that fits a wide desktop is
     not the one you want -- a 12-wide course at 4x is over 1500px
     and you lose the board reading it.
     ============================================================ */
  var MAX_SCALE = 4;

  function fitScale(C, width, opts) {
    if (opts.scale) return opts.scale;
    var cap = opts.maxScale || 2;
    var whole = Math.floor(width / (C.w * TILE));
    return Math.max(1, Math.min(cap, Math.min(MAX_SCALE, whole)));
  }

  function fitBoard(C, host, opts) {
    var avail = host.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960);
    var cs = (typeof getComputedStyle === "function") ? getComputedStyle(host) : null;
    if (cs) avail -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    if (UI.els && UI.els.side && avail > 900) avail -= 262;    // the side panel's column
    var scale = fitScale(C, avail, opts);
    var w = C.w * TILE * scale, h = C.h * TILE * scale;
    UI.els.stage.style.width = w + "px";
    UI.els.stage.style.height = h + "px";
    UI.els.board.style.width = w + "px";
    UI.els.board.dataset.scale = scale;
    UI.els.fx.style.width = w + "px";
    UI.els.fx.style.height = h + "px";
    UI.els.grid.style.width = w + "px";
    UI.els.grid.style.height = h + "px";
    UI.els.grid.style.gridTemplateColumns = "repeat(" + C.w + "," + (TILE * scale) + "px)";
    UI.els.grid.style.gridAutoRows = (TILE * scale) + "px";
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

    var C;
    try {
      validateTables();
      B.validateAll();
      C = B.buildCourse(opts.course || "provingRun");
    } catch (e) {
      var pre = el("div", "pr-err");
      pre.textContent = "PumaRally failed to load:\n" + e.message;
      host.appendChild(pre);
      throw e;
    }

    bakeAll();

    var hud = el("div", "pr-hud",
      '<h1 class="pr-title">PUMARALLY</h1><span class="pr-phase"></span>' +
      '<span class="pr-hud-spacer"></span>' +
      '<button data-act="setup">Set up</button><button data-act="help">Help</button>' +
      '<button data-act="speed">Speed</button><button data-act="mute">Sound</button>' +
      '<button data-act="new">New game</button>');

    var stage = el("div", "pr-stage");
    var board = drawCourse(C);
    board.className = "pr-board";
    board.setAttribute("aria-hidden", "true");
    var fx = document.createElement("canvas");
    fx.className = "pr-fx";
    fx.width = C.w * TILE; fx.height = C.h * TILE;
    fx.setAttribute("aria-hidden", "true");
    var grid = el("div", "pr-grid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", describeCourse(C));
    var pieces = el("div", "pr-pieces");
    stage.appendChild(board); stage.appendChild(fx);
    stage.appendChild(grid); stage.appendChild(pieces);

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
    var regs = el("div", "pr-regs");
    var hand = el("div", "pr-hand");
    var controls = el("div", "pr-controls",
      '<button data-act="run">Run registers</button>' +
      '<button data-act="clear">Clear</button>' +
      '<button data-act="down">Power down</button>');
    var hint = el("div", "pr-hint");
    var choice = el("div", "pr-choice");
    choice.hidden = true;
    var optsRow = el("div", "pr-opts");
    program.appendChild(regs); program.appendChild(hand);
    program.appendChild(controls); program.appendChild(choice);
    program.appendChild(optsRow); program.appendChild(hint);

    var banner = el("div", "pr-banner");
    banner.hidden = true;
    var overlay = el("div", "pr-overlay");
    overlay.hidden = true;
    var curtain = el("div", "pr-curtain");
    curtain.hidden = true;
    var sr = el("div", "pr-sr");
    sr.setAttribute("aria-live", "assertive");

    var legend = el("div", "pr-legend",
      "<span>rust arrows = conveyor</span><span>cyan arrows = express conveyor</span>" +
      "<span>amber hub = gear CW</span><span>cyan hub = gear CCW</span>" +
      "<span>piston = pusher, registers shown</span><span>wrench = repair</span>" +
      "<span>amber wrench = repair + option</span><span>red bar = laser</span>");

    host.appendChild(hud); host.appendChild(banner); host.appendChild(main);
    host.appendChild(program); host.appendChild(legend); host.appendChild(sr);
    host.appendChild(overlay); host.appendChild(curtain);

    UI.els = { host: host, hud: hud, stage: stage, board: board, fx: fx, grid: grid, program: program,
               pieces: pieces, side: side, players: playersBody, log: logBody,
               regs: regs, hand: hand, hint: hint, banner: banner, sr: sr,
               choice: choice, opts: optsRow, main: main, overlay: overlay, curtain: curtain,
               run: controls.querySelector("[data-act=run]"),
               clear: controls.querySelector("[data-act=clear]"),
               down: controls.querySelector("[data-act=down]") };
    UI.pieceEls = {};
    UI.course = C;
    UI.mounted = true;
    try { UI.speed = Math.min(2, Math.max(0, parseInt(localStorage.getItem(SPEED_KEY), 10) || 1)); } catch (e) { UI.speed = 1; }
    try { UI.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { UI.muted = false; }
    houseRules = loadRules();

    fitBoard(C, host, opts);
    buildGridCells(C);
    setupInput(host);

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", function () { fitBoard(C, host, opts); });
    }

    var shot = /[#&]shot=([a-z]+)/.exec(root.location ? root.location.hash : "");
    if (shot) { applyShotState(shot[1]); return { course: C, canvas: board }; }

    var resumed = loadGame();
    if (resumed && resumed.courseId === C.id) {
      G = resumed;
      UI.wallsChecked = false;
      log("Resumed from a saved game.");
    } else {
      UI.wallsChecked = false;
      newGame((Math.random() * 1e9) | 0, gameOpts(opts));
    }
    updateAll();
    advance();
    if (!tutorialSeen()) showTutorial(0);
    return { course: C, canvas: board };
  }

  /* The board is a canvas, so without this a screen reader sees one
     image and nothing else. These cells carry the per-square reading
     and, from a later wave, keyboard targeting. */
  function buildGridCells(C) {
    var out = [], c, r;
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        out.push('<div class="pr-cell" role="gridcell" tabindex="-1" data-c="' + c + '" data-r="' + r +
          '" aria-label="' + esc(describeTile(C, c, r)) + '"></div>');
      }
    }
    UI.els.grid.innerHTML = out.join("");
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
    TOKENS: TOKENS,
    SPRITES: SPRITES,
    LIVERIES: LIVERIES,
    PROGRAM_DECK: PROGRAM_DECK,
    openRegisters: openRegisters,
    cardsDealt: cardsDealt,
    validateTables: validateTables,
    buildCourse: function (id) { return B.buildCourse(id); },
    drawCourse: drawCourse,
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
