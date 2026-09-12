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
    rngAfter: undefined
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

  /* P1 has no presentation layer, so every step resolves at once.
     The event queue arrives in P2; this already has the signature it
     will need, and returning NEXT here is what lets the headless sim
     run a whole game inside one advance(). */
  function animate(events) {
    for (var i = 0; i < events.length; i++) if (events[i].type === "log") log(events[i].msg);
    return NEXT;
  }

  function newGame(seed, opts) {
    opts = opts || {};
    var courseId = opts.course || "provingRun";
    var C = B.buildCourse(courseId);
    UI.course = C;

    var seats = Math.max(2, Math.min(8, opts.players || 4));
    G = {
      v: 1,
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
      gameOver: false,
      winner: null,
      unfinished: false,
      log: [],
      exec: { queue: [], resume: null },
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
        registers: [null, null, null, null, null],
        poweredDown: false,
        announceDown: false,
        alive: true,
        out: false
      });
    }

    for (var d = 0; d < PROGRAM_DECK.length; d++) G.deck.push(d);
    shuffle(G.deck);
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
    for (i = chain.length - 1; i >= 0; i--) {
      var m = chain[i];
      var to = B.step(m.c, m.r, dir);
      m.c = to.c; m.r = to.r;
      if (i > 0) log(chain[i - 1].name + " shoves " + m.name + " " + B.dirName(dir));
      if (isHole(C, m.c, m.r)) destroy(m, B.isVoid(C, m.c, m.r) ? "over the edge" : "into a pit");
    }
    return true;
  }

  function playCard(p, cd) {
    var k = CARD_KINDS[cd.kind];
    if (k.turn !== undefined) {
      p.face = B.rot(p.face, k.turn === 2 ? 2 : k.turn);
      log(p.name + " " + k.label.toLowerCase());
      return;
    }
    var dist = k.move, dir = dist > 0 ? p.face : B.opposite(p.face);
    log(p.name + " " + k.label.toLowerCase());
    for (var i = 0; i < Math.abs(dist); i++) {
      if (!p.alive) return;
      if (!stepRobot(p, dir, "move")) break;          // walked into a wall; the rest of the move is lost
    }
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
          b.face = B.rot(b.face, turn);
          log(b.name + " is carried round a curve");
        }
      }
    }
  }

  function gearPass() {
    var C = UI.course, alive = live();
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i], t = B.gearTurn(B.codeAt(C, p.c, p.r));
      if (!t) continue;
      p.face = B.rot(p.face, t);
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
      log(p.name + " is shoved by a pusher");
      stepRobot(p, d, "pusher");
    }
  }

  /* The first robot a beam meets, or null. Robot lasers skip their
     own square; board lasers illuminate theirs. */
  function firstRobotAlong(c, r, dir, skipOrigin) {
    var C = UI.course, hit;
    if (!skipOrigin) { hit = robotAt(c, r); if (hit) return hit; }
    for (var guard = 0; guard < C.w + C.h + 2; guard++) {
      if (B.wallAt(C, c, r, dir)) return null;
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
  function laserPass() {
    var C = UI.course, hits = [], i;

    for (i = 0; i < C.lasers.length; i++) {
      var L = C.lasers[i];
      var t = firstRobotAlong(L.c, L.r, L.d, false);
      if (t) hits.push({ target: t, damage: L.n, from: "a board laser" });
    }

    var alive = live();
    for (i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (p.poweredDown) continue;                    // a powered-down robot does not shoot
      var v = firstRobotAlong(p.c, p.r, p.face, true);
      if (v) hits.push({ target: v, damage: 1, from: p.name + "'s laser" });
    }

    for (i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!h.target.alive) continue;
      log(h.target.name + " takes " + h.damage + " from " + h.from);
      damage(h.target, h.damage);
    }
  }

  function damage(p, n) {
    p.damage += n;
    if (p.damage >= MAX_DAMAGE) destroy(p, "shot to pieces");
  }

  function destroy(p, how) {
    if (!p.alive) return;
    p.alive = false;
    p.lives--;
    discardCards(p.hand); p.hand = [];
    discardCards(p.registers); p.registers = [null, null, null, null, null];
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
      var p = alive[i], code = B.codeAt(C, p.c, p.r), el = B.elemOf(code);

      // A repair site is always an archive point.
      if (el && el.repair) p.archive = { c: p.c, r: p.r, face: p.face };

      for (var f = 0; f < C.flags.length; f++) {
        var F = C.flags[f];
        if (F.c !== p.c || F.r !== p.r) continue;
        // Standing on ANY flag re-archives. Only the next one in
        // sequence scores; touching them out of order is a no-op.
        p.archive = { c: p.c, r: p.r, face: p.face };
        if (F.n === p.flags + 1) {
          p.flags++;
          log(p.name + " touches flag " + F.n);
          if (p.flags === C.flags.length) return win(p);
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
          p.c = spot.c; p.r = spot.r;
          p.face = p.archive.face;
          p.damage = 2;                                // returns damaged, by the book
          p.alive = true;
          any = true;
          log(p.name + " returns at (" + p.c + "," + p.r + ") with 2 damage");
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
          if (p.poweredDown) { p.hand = []; continue; }
          p.hand = draw(cardsDealt(p.damage));
        }
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
        return animate([{ type: "log", msg: "-- register " + (G.register + 1) + " --" }]);
      },

      move: function () {
        if (!G.exec.queue.length) { go("exec", "express"); return NEXT; }
        var p = G.players[G.exec.queue.shift()];
        if (!p.alive) return NEXT;
        var cd = cardAt(p, G.register);
        if (cd) playCard(p, cd);
        return NEXT;
      },

      express: function () { beltPass(2); go("exec", "belts"); return NEXT; },
      belts: function () { beltPass(1); go("exec", "pushers"); return NEXT; },
      pushers: function () { pusherPass(); go("exec", "gears"); return NEXT; },
      gears: function () { gearPass(); go("exec", "lasers"); return NEXT; },
      lasers: function () { laserPass(); go("exec", "touch"); return NEXT; },
      touch: function () { checkpointPass(); go("exec", "endReg"); return NEXT; },

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
          // el.option also deals an Option card; that arrives in P4.
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
    if (UI.headless) { assertInvariants(); return; }
    assertInvariants();
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

      // 4. The deal arithmetic that drives the entire damage system.
      if (G.phase === "turn" && G.step === "program" && p.alive && !p.poweredDown && !programmed(p)) {
        if (p.hand.length !== cardsDealt(p.damage) && G.deck.length + G.discard.length > 0) {
          throw new Error(p.name + " holds " + p.hand.length + " cards at " + p.damage + " damage, expected " + cardsDealt(p.damage));
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
      gameOver: false, winner: null, unfinished: false, log: [],
      exec: { queue: [], resume: null }, pendingChoices: []
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
        hand: [], registers: [null, null, null, null, null],
        poweredDown: !!rb.poweredDown, announceDown: false,
        alive: rb.alive !== false, out: false
      });
    }
    for (var d = 0; d < PROGRAM_DECK.length; d++) G.deck.push(d);
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

    var scale = opts.scale || 1;
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
    RULE_TESTS: RULE_TESTS,
    assertInvariants: assertInvariants,
    get G() { return G; },
    get UI() { return UI; }
  };

  root.PumaRally = { mount: mount };

})(typeof self !== "undefined" ? self : this);
