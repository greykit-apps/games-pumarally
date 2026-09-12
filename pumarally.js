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
    lastPhase: null
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
        return animate([{ type: "render" }, { type: "wait", delay: 300 }]);
      },

      /* Each board element gets its own beat, but only if it actually
         moved somebody. A pause for a pusher nobody was standing on is
         five wasted seconds a turn, and the player learns to stop
         watching -- which is the opposite of what the beat is for. */
      express: function () { return boardBeat(beltPass, 2, "belts", 300); },
      belts: function () { return boardBeat(beltPass, 1, "pushers", 300); },
      pushers: function () { return boardBeat(pusherPass, null, "gears", 260); },
      gears: function () { return boardBeat(gearPass, null, "lasers", 260); },

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
        return animate([{ type: "render" }, { type: "wait", delay: 300 }]);
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
  function boardBeat(fn, arg, nextStep, delay) {
    var before = boardSig();
    if (arg === null) fn(); else fn(arg);
    go("exec", nextStep);
    if (boardSig() === before) return NEXT;
    return animate([{ type: "render" }, { type: "wait", delay: delay }]);
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
    if (G.gameOver) { clearSave(); renderGameOver(); }
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
    if (!inPhase("turn", "program") || !p) return;
    var slot = firstEmpty(p);
    if (slot < 0 || i < 0 || i >= p.hand.length) return;
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

  function onNewGame() {
    stopQueue();
    clearSave();
    UI.wallsChecked = false;
    newGame((Math.random() * 1e9) | 0, UI.opts);
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
    root.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      '<button data-act="speed">Speed</button><button data-act="new">New game</button>');

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
    var opts = el("div", "pr-opts");
    program.appendChild(regs); program.appendChild(hand);
    program.appendChild(controls); program.appendChild(choice);
    program.appendChild(opts); program.appendChild(hint);

    var banner = el("div", "pr-banner");
    banner.hidden = true;
    var sr = el("div", "pr-sr");
    sr.setAttribute("aria-live", "assertive");

    var legend = el("div", "pr-legend",
      "<span>rust arrows = conveyor</span><span>cyan arrows = express conveyor</span>" +
      "<span>amber hub = gear CW</span><span>cyan hub = gear CCW</span>" +
      "<span>piston = pusher, registers shown</span><span>wrench = repair</span>" +
      "<span>amber wrench = repair + option</span><span>red bar = laser</span>");

    host.appendChild(hud); host.appendChild(banner); host.appendChild(main);
    host.appendChild(program); host.appendChild(legend); host.appendChild(sr);

    UI.els = { host: host, hud: hud, stage: stage, board: board, fx: fx, grid: grid, program: program,
               pieces: pieces, side: side, players: playersBody, log: logBody,
               regs: regs, hand: hand, hint: hint, banner: banner, sr: sr,
               choice: choice, opts: opts,
               run: controls.querySelector("[data-act=run]"),
               clear: controls.querySelector("[data-act=clear]"),
               down: controls.querySelector("[data-act=down]") };
    UI.pieceEls = {};
    UI.course = C;
    UI.mounted = true;
    try { UI.speed = Math.min(2, Math.max(0, parseInt(localStorage.getItem(SPEED_KEY), 10) || 1)); } catch (e) { UI.speed = 1; }

    fitBoard(C, host, opts);
    buildGridCells(C);
    setupInput(host);

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", function () { fitBoard(C, host, opts); });
    }

    var resumed = loadGame();
    if (resumed && resumed.courseId === C.id) {
      G = resumed;
      UI.wallsChecked = false;
      log("Resumed from a saved game.");
    } else {
      UI.wallsChecked = false;
      newGame((Math.random() * 1e9) | 0, opts);
    }
    updateAll();
    advance();
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
    OPTION_ROSTER: OPTION_ROSTER,
    HOOKS: HOOKS,
    RULE_TESTS: RULE_TESTS,
    assertInvariants: assertInvariants,
    get G() { return G; },
    get UI() { return UI; }
  };

  root.PumaRally = { mount: mount };

})(typeof self !== "undefined" ? self : this);
