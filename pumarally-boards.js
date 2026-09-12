/* ============================================================
   PUMARALLY — BOARD DATA

   Printed board elements only. Flags and docking-bay assignments
   belong to the COURSE, not the board, exactly as in the box: a
   board is the cardboard, a course is the setup card that tells
   you which boards to lay out and where the flags go. That split
   is why one board serves half a dozen courses and why a new
   board is a data-only change.

   This file is pure data plus the code that proves the data is
   well-formed. It touches no DOM and no globals, so the browser
   and tools/check-boards.js run the SAME validator over the SAME
   bytes — a board that loads in the game cannot be a board CI
   would have rejected.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PumaRallyBoards = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ============================================================
     DIRECTION MATH
     N/E/S/W are 0/1/2/3 so a right turn is +1 and a left turn is
     -1, both mod 4. Every rotation in the engine — gears, curves,
     U-turns, whole-board rotation — is that one operation, which
     is the only reason board rotation is 20 lines instead of 200.
     ============================================================ */
  var N = 0, E = 1, S = 2, W = 3;
  var DIR_CHARS = "^>v<";
  var DIR_NAMES = ["north", "east", "south", "west"];
  var DIR_OF = { N: N, E: E, S: S, W: W };
  var DC = [0, 1, 0, -1];   // column delta per direction
  var DR = [-1, 0, 1, 0];   // row delta per direction

  function rot(d, turn) { return (d + turn + 4) % 4; }
  function opposite(d) { return (d + 2) % 4; }
  function dirName(d) { return DIR_NAMES[d]; }

  /* Signed quarter-turns from direction a to direction b:
     0 straight, +1 right, -1 left, 2 reverse. Curve rotation is
     exactly this applied to (travelled direction, belt exit). */
  function turnBetween(a, b) {
    var t = (b - a + 4) % 4;
    return t === 3 ? -1 : t;
  }

  /* ============================================================
     EDITIONS

     RoboRally has been printed as two substantially different games,
     and this project now carries both. The boards look similar and
     are not interchangeable: the 2016 edition replaced card priority
     numbers with a priority antenna, damage tokens with SPAM cards
     shuffled into a personal deck, and option cards with energy
     spent in an upgrade shop -- and it dropped repair and upgrade
     squares from the boards entirely.

     So a board declares which game it is printed for, a course may
     not mix them, and the validator refuses an element that does not
     exist in that edition. Without that, a 2016 board transcribed
     against the classic engine would validate and play and be quietly
     the wrong game.
     ============================================================ */
  var EDITIONS = {
    classic: { name: "Classic", years: "1994-2005" },
    modern: { name: "Modern", years: "2016-" }
  };

  var BOTH = ["classic", "modern"];

  /* ------------------------------------------------------------
     SETS

     Which box a board came out of. Boards are picked by set as much
     as by name -- "give me a course from Armed and Dangerous" is the
     ordinary way to choose one -- so the box is data rather than a
     note in the name, and a set belongs to exactly one edition.

     A board whose set disagrees with its own edition is a
     transcription error: there is no Armed and Dangerous board in
     the 2016 game, and saying so here is cheaper than finding out
     when the rules do not fit.
     ------------------------------------------------------------ */
  var SETS = {
    authored:         { name: "Authored",            edition: "classic", box: "Not from any box" },
    base:             { name: "Base Game",           edition: "classic", box: "RoboRally (1994-2005)" },
    armedAndDangerous:{ name: "Armed and Dangerous", edition: "classic", box: "Armed and Dangerous (1995)" },
    crashAndBurn:     { name: "Crash and Burn",      edition: "classic", box: "Crash and Burn (1997)" },
    modernBase:       { name: "Base Game",           edition: "modern",  box: "Robo Rally (2016)" },
    wetAndWild:       { name: "Wet and Wild",        edition: "modern",  box: "Wet and Wild" },
    chaosAndCarnage:  { name: "Chaos and Carnage",   edition: "modern",  box: "Chaos and Carnage" }
  };

  /* ============================================================
     ELEMENT LEGEND
     A cell is exactly two characters: element, then argument. The
     argument is a direction for anything that points, a digit for
     a docking bay, and '.' for anything that takes neither. Fixed
     width is what lets a picture row be checked for a dropped
     character, which is the commonest transcription error.
     ============================================================ */
  var ELEMENT_DEFS = {
    ".": { name: "floor", arg: "none", editions: BOTH },
    "o": { name: "pit", arg: "none", editions: BOTH },
    "b": { name: "conveyor", arg: "dir", belt: 1, editions: BOTH },
    "B": { name: "express conveyor", arg: "dir", belt: 2, editions: BOTH },
    "l": { name: "gear (counter-clockwise)", arg: "none", gear: -1, editions: BOTH },
    "r": { name: "gear (clockwise)", arg: "none", gear: 1, editions: BOTH },
    "p": { name: "pusher (registers 1, 3, 5)", arg: "dir", push: "odd", editions: BOTH },
    "P": { name: "pusher (registers 2, 4)", arg: "dir", push: "even", editions: BOTH },
    /* The 2016 edition removed repair and upgrade squares from the
       boards, so these two are classic-only and a modern board
       carrying one is a transcription error rather than a variant. */
    "w": { name: "repair site", arg: "none", repair: 1, editions: ["classic"] },
    "W": { name: "upgrade site", arg: "none", repair: 1, option: true, editions: ["classic"] },
    "s": { name: "docking bay", arg: "digit", editions: BOTH }
  };

  function elemOf(code) { return ELEMENT_DEFS[code.charAt(0)]; }
  function dirOf(code) { return DIR_CHARS.indexOf(code.charAt(1)); }
  function beltSpeed(code) { var e = elemOf(code); return e && e.belt || 0; }
  function gearTurn(code) { var e = elemOf(code); return e && e.gear || 0; }
  function isPit(code) { return code.charAt(0) === "o"; }

  /* ============================================================
     THE PICTURE FORMAT

     A w x h board is (2h + 1) rows of exactly (3w + 1) characters.

       odd  rows (2r+1) are tile rows:   [wall][cell][wall][cell]...[wall]
       even rows (2r)   are the horizontal wall lattice between them

     Walls therefore live in ONE place in the source and cannot
     disagree with themselves — the failure a per-tile wall list
     invites, where "east wall of (3,4)" and "west wall of (4,4)"
     drift apart. It also diffs visually against a photograph of
     the real board, which a sparse JSON wall list does not, and
     transcription-by-eye is the whole workflow here.

       ..  floor          b>  conveyor, exits east
       o.  pit            B^  express conveyor, exits north
       l.  gear ccw       p<  pusher, registers 1/3/5, pushes west
       r.  gear cw        Pv  pusher, registers 2/4,   pushes south
       w.  repair (1 damage)
       W.  upgrade (1 damage + an option card)
       s3  docking bay position 3

     Wall characters: '|' vertical, '--' horizontal, '+' corner.
     ============================================================ */

  /* Walls are stored on a lattice with one slot per edge — wallN
     has (h+1) rows and wallW has (w+1) columns — so the perimeter
     has real storage and wallAt() is symmetric by construction
     rather than by discipline. There is no "which side owns this
     wall" question to get wrong. */
  function blankGrid(w, h) {
    return {
      w: w, h: h,
      cell: new Array(w * h),
      wallN: new Uint8Array(w * (h + 1)),
      wallW: new Uint8Array((w + 1) * h),
      lasers: [],
      docks: []
    };
  }

  function idx(g, c, r) { return r * g.w + c; }
  function inGrid(g, c, r) { return c >= 0 && r >= 0 && c < g.w && r < g.h; }
  function codeAt(g, c, r) { return inGrid(g, c, r) ? (g.cell[idx(g, c, r)] || "") : ""; }

  function wallAt(g, c, r, d) {
    if (d === N) return !!g.wallN[r * g.w + c];
    if (d === S) return !!g.wallN[(r + 1) * g.w + c];
    if (d === W) return !!g.wallW[r * (g.w + 1) + c];
    return !!g.wallW[r * (g.w + 1) + c + 1];           // E
  }

  function setWall(g, c, r, d, on) {
    var v = on ? 1 : 0;
    if (d === N) g.wallN[r * g.w + c] = v;
    else if (d === S) g.wallN[(r + 1) * g.w + c] = v;
    else if (d === W) g.wallW[r * (g.w + 1) + c] = v;
    else g.wallW[r * (g.w + 1) + c + 1] = v;
  }

  function step(c, r, d) { return { c: c + DC[d], r: r + DR[d] }; }

  /* Parse a picture into the lattice. Throws on any shape error —
     these are the errors that otherwise render a plausible, wrong
     board, so they must be fatal rather than best-effort. */
  function parsePic(id, spec) {
    var w = spec.w, h = spec.h, pic = spec.pic;
    var E_ = function (m) { throw new Error("board " + id + ": " + m); };
    var wantRows = 2 * h + 1, wantCols = 3 * w + 1;

    /* Checked first: every per-element check below reads this, so a
       bogus edition would surface as a crash inside the legend rather
       than as the mistyped field it is. */
    var edition = spec.edition || "classic";
    if (!EDITIONS[edition]) E_('declares edition "' + edition + '", which is not a thing');

    var set = spec.set || "authored";
    if (!SETS[set]) E_('declares set "' + set + '", which is not a box that exists');
    if (SETS[set].edition !== edition) {
      E_('is in the ' + SETS[set].name + " set, which is " + EDITIONS[SETS[set].edition].name +
         ", but declares itself " + EDITIONS[edition].name);
    }

    if (!Array.isArray(pic)) E_("has no picture");
    if (pic.length !== wantRows) E_("has " + pic.length + " picture rows, expected " + wantRows + " for a " + w + "x" + h + " board");

    var g = blankGrid(w, h);
    for (var y = 0; y < pic.length; y++) {
      var row = pic[y];
      if (typeof row !== "string") E_("picture row " + y + " is not a string");
      if (row.length !== wantCols) E_("picture row " + y + " is " + row.length + " chars, expected " + wantCols);
      var r = y >> 1, c;
      if (y % 2 === 0) {
        for (c = 0; c <= w; c++) {
          if (row.charAt(3 * c) !== "+") E_("picture row " + y + " col " + (3 * c) + ": lattice corner must be '+', got '" + row.charAt(3 * c) + "'");
        }
        for (c = 0; c < w; c++) {
          var seg = row.substr(3 * c + 1, 2);
          if (seg === "--") g.wallN[r * w + c] = 1;
          else if (seg !== "  ") E_("picture row " + y + " tile " + c + ": horizontal wall must be '--' or two spaces, got '" + seg + "'");
        }
      } else {
        for (c = 0; c <= w; c++) {
          var vc = row.charAt(3 * c);
          if (vc === "|") g.wallW[r * (w + 1) + c] = 1;
          else if (vc !== " ") E_("picture row " + y + " col " + (3 * c) + ": vertical wall must be '|' or a space, got '" + vc + "'");
        }
        for (c = 0; c < w; c++) {
          var code = row.substr(3 * c + 1, 2);
          var def = ELEMENT_DEFS[code.charAt(0)];
          if (!def) E_("(" + c + "," + r + ") uses element '" + code.charAt(0) + "', which is not in the legend");
          var a = code.charAt(1);
          if (def.arg === "dir" && DIR_CHARS.indexOf(a) < 0) E_("(" + c + "," + r + ") " + def.name + " needs a direction (^ > v <), got '" + a + "'");
          if (def.arg === "none" && a !== ".") E_("(" + c + "," + r + ") " + def.name + " takes no argument, got '" + a + "'");
          if (def.arg === "digit" && !/[1-8]/.test(a)) E_("(" + c + "," + r + ") " + def.name + " needs a position 1-8, got '" + a + "'");
          if (def.editions && def.editions.indexOf(edition) < 0) {
            E_("(" + c + "," + r + ") is a " + def.name + ", which the " +
               EDITIONS[edition].name + " edition does not print");
          }
          g.cell[r * w + c] = code;
          if (def.arg === "digit") g.docks.push({ c: c, r: r, n: parseInt(a, 10) });
        }
      }
    }
    for (var i = 0; i < (spec.lasers || []).length; i++) {
      var L = spec.lasers[i];
      g.lasers.push({ c: L.c, r: L.r, d: DIR_OF[L.d], n: L.n });
    }
    g.name = spec.name;
    g.edition = edition;
    g.set = set;
    g.origin = spec.origin || "authored";
    g.notes = spec.notes || "";
    return g;
  }

  /* ============================================================
     FORMATTING
     The inverse of parsePic, and the reason the editor is worth
     having: it emits source text byte-identical to the shipped
     literals, so a board traced over a photograph can be pasted
     straight back into this file with nothing to tidy up.

     check-boards.js asserts that formatting every shipped board
     reproduces its own source exactly. If that ever stops being
     true, the editor's export has quietly become a thing someone
     has to hand-correct, which is how transcription errors get in.
     ============================================================ */
  function gridToPic(g) {
    var rows = [], y, c, r;
    for (y = 0; y <= 2 * g.h; y++) {
      r = y >> 1;
      var out = "";
      if (y % 2 === 0) {
        for (c = 0; c < g.w; c++) out += "+" + (g.wallN[r * g.w + c] ? "--" : "  ");
        out += "+";
      } else {
        for (c = 0; c < g.w; c++) {
          out += (g.wallW[r * (g.w + 1) + c] ? "|" : " ") + g.cell[r * g.w + c];
        }
        out += g.wallW[r * (g.w + 1) + g.w] ? "|" : " ";
      }
      rows.push(out);
    }
    return rows;
  }

  var DIR_LETTER = ["N", "E", "S", "W"];

  function formatBoard(id, g, meta) {
    meta = meta || {};
    var name = meta.name || g.name || id;
    var origin = meta.origin || g.origin || "authored";
    var notes = meta.notes !== undefined ? meta.notes : (g.notes || "");
    var pic = gridToPic(g), i;
    var out = [];
    out.push("    " + id + ": {");
    var edition = meta.edition || g.edition || "classic";
    var set = meta.set || g.set || "authored";
    out.push('      name: "' + name + '", w: ' + g.w + ", h: " + g.h +
             ', edition: "' + edition + '", set: "' + set + '", origin: "' + origin + '",');
    if (notes) out.push('      notes: "' + notes + '",');
    out.push("      pic: [");
    for (i = 0; i < pic.length; i++) out.push('        "' + pic[i] + '"' + (i === pic.length - 1 ? "" : ","));
    out.push("      ],");
    if (!g.lasers.length) {
      out.push("      lasers: []");
    } else {
      out.push("      lasers: [");
      for (i = 0; i < g.lasers.length; i++) {
        var L = g.lasers[i];
        out.push("        { c: " + L.c + ", r: " + L.r + ', d: "' + DIR_LETTER[L.d] + '", n: ' + L.n + " }" +
          (i === g.lasers.length - 1 ? "" : ","));
      }
      out.push("      ]");
    }
    out.push("    }");
    return out.join("\n");
  }

  /* ============================================================
     ROTATION
     One pure function, never four hand-rotated copies of a board.
     Quarter-turns clockwise: a tile at (c,r) lands at (h-1-r, c)
     and every direction — cell arguments, walls, laser facings —
     advances by one. Because walls are read and written through
     wallAt/setWall, perimeter walls rotate correctly for free.
     ============================================================ */
  function rotateGrid(g, q) {
    q = ((q % 4) + 4) % 4;
    if (!q) return g;
    var out = g;
    for (var t = 0; t < q; t++) out = rotateOnce(out);
    return out;
  }

  function rotateOnce(g) {
    var n = blankGrid(g.h, g.w);
    n.name = g.name; n.origin = g.origin; n.notes = g.notes;
    for (var r = 0; r < g.h; r++) {
      for (var c = 0; c < g.w; c++) {
        var nc = g.h - 1 - r, nr = c;
        var code = g.cell[idx(g, c, r)];
        var def = ELEMENT_DEFS[code.charAt(0)];
        if (def.arg === "dir") code = code.charAt(0) + DIR_CHARS.charAt(rot(dirOf(code), 1));
        n.cell[idx(n, nc, nr)] = code;
        for (var d = 0; d < 4; d++) if (wallAt(g, c, r, d)) setWall(n, nc, nr, rot(d, 1), true);
      }
    }
    for (var i = 0; i < g.lasers.length; i++) {
      var L = g.lasers[i];
      n.lasers.push({ c: g.h - 1 - L.r, r: L.c, d: rot(L.d, 1), n: L.n });
    }
    for (var j = 0; j < g.docks.length; j++) {
      var D = g.docks[j];
      n.docks.push({ c: g.h - 1 - D.r, r: D.c, n: D.n });
    }
    return n;
  }

  /* ============================================================
     BOARD SELF-CHECK — runs at load and THROWS.

     Boards are transcribed by hand from reference images, so every
     failure mode here is data-shaped and silent: a belt pointing
     into a wall, a laser with nothing to mount on, a pusher with
     no piston housing. None of those throw on their own. They
     render a board that is plausible and wrong, which is the one
     outcome a game promising faithful maps cannot survive.

     Each check below has been deliberately broken once and watched
     go red. A check nobody has watched fail is indistinguishable
     from one that cannot fail.
     ============================================================ */
  function validateGrid(id, g, warn) {
    var E_ = function (m) { throw new Error("board " + id + ": " + m); };
    var c, r, code;

    for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) {
      code = g.cell[idx(g, c, r)];
      if (!code) E_("(" + c + "," + r + ") has no cell");

      // ---- conveyors ----
      var sp = beltSpeed(code);
      if (sp) {
        var d = dirOf(code);
        if (wallAt(g, c, r, d)) E_("(" + c + "," + r + ") conveyor exits " + dirName(d) + " into a wall — nothing on it could ever move");
        var nx = step(c, r, d);
        if (inGrid(g, nx.c, nx.r)) {
          var nc2 = g.cell[idx(g, nx.c, nx.r)];
          var nsp = beltSpeed(nc2);
          if (nsp) {
            // A belt pointing back at its feeder is the same condition as a
            // 180-degree curve -- turnBetween(d, nd) === 2 iff nd === opposite(d) --
            // so this one check covers both, and a separate curve check would be
            // unreachable. The validator self-test is what surfaced that.
            if (dirOf(nc2) === opposite(d)) E_("(" + c + "," + r + ") and (" + nx.c + "," + nx.r + ") are conveyors pointing head-on");
            if (sp === 2 && nsp === 1) warn(id, "(" + c + "," + r + ") express conveyor feeds a normal conveyor at (" + nx.c + "," + nx.r + ")");
          }
        }
      }

      // ---- pushers: the tile says which way, the wall must agree ----
      var el = ELEMENT_DEFS[code.charAt(0)];
      if (el.push) {
        var pd = dirOf(code);
        if (!wallAt(g, c, r, opposite(pd))) {
          E_("(" + c + "," + r + ") pusher pushes " + dirName(pd) + " but has no wall behind it to mount on");
        }
      }
    }

    // ---- lasers: mount, damage, termination ----
    for (var i = 0; i < g.lasers.length; i++) {
      var L = g.lasers[i];
      var where = "laser at (" + L.c + "," + L.r + ")";
      if (!inGrid(g, L.c, L.r)) E_(where + " is off the board");
      if (!(L.n >= 1 && L.n <= 3)) E_(where + " does " + L.n + " damage; the box prints 1, 2 and 3");
      if (!wallAt(g, L.c, L.r, opposite(L.d))) E_(where + " firing " + dirName(L.d) + " has no wall behind it to mount on");
      var len = laserPath(g, L).length;
      if (len < 1) E_(where + " illuminates nothing");
      if (len > g.w + g.h) E_(where + " beam did not terminate");
    }

    // ---- docking bays ----
    var seen = {};
    for (var k = 0; k < g.docks.length; k++) {
      var D = g.docks[k];
      if (seen[D.n]) E_("has two docking bays numbered " + D.n);
      seen[D.n] = true;
    }
  }

  /* The tiles a laser illuminates, starting with its own tile and
     running until a wall or the board edge. Shared with the engine
     so the drawn beam and the damaging beam are the same list. */
  function laserPath(g, L) {
    var out = [], c = L.c, r = L.r;
    for (var guard = 0; guard < g.w + g.h + 2; guard++) {
      out.push({ c: c, r: r });
      if (wallAt(g, c, r, L.d)) break;
      var nx = step(c, r, L.d);
      if (!inGrid(g, nx.c, nx.r)) break;
      c = nx.c; r = nx.r;
    }
    return out;
  }

  /* ============================================================
     BOARDS
     ============================================================ */
  var BOARD_SPECS = {

    /* Not in any box. One of every element — a closed conveyor
       loop that turns right four times, a merge whose side feed
       turns left, a full-width express run, both gear directions,
       both pusher parities, a pit cluster, a walled pocket, 1/2/3
       damage lasers and both repair types.

       It exists so the engine can be finished and proved before a
       single official tile is transcribed, and it is correct by
       construction in a way no transcribed board is on day one.
       It doubles as the tutorial course. */
    provingGround: {
      name: "Proving Ground", w: 12, h: 12, edition: "classic", set: "authored", origin: "authored",
      notes: "Authored for PumaRally. Every element type appears at least once.",
      pic: [
        "+  +  +  +--+  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> bv .. .. .. o. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b^ .. .. .. bv .. l. .. o. .. w. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b^ .. r. .. bv .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +--+  +  +  +",
        " .. b^ b< b< b< b< .. .. Pv .. .. .. ",
        "+  +  +  +--+  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. ..|.. .. .. ..|.. W. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " B> B> B> B> B> B> B> B> B> B> B> Bv ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. bv .. .. .. .. Bv ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. o. .. .. .. bv b< .. .. .. Bv ",
        "+  +  +  +  +  +  +  +  +  +  +--+  +",
        "|.. .. o. o. ..|.. .. .. .. .. ..|Bv ",
        "+  +  +  +  +  +  +  +  +  +  +--+  +",
        " .. .. .. o.|p> .. .. .. .. .. .. Bv ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " w. .. .. .. .. .. .. .. .. .. .. Bv ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +"
      ],
      lasers: [
        { c: 3, r: 0, d: "S", n: 1 },
        { c: 9, r: 4, d: "W", n: 2 },
        { c: 0, r: 8, d: "E", n: 3 }
      ]
    },

    /* A second authored board, and the reason it exists is coverage
       rather than content: every official course lays out two to four
       boards, at least one of them rotated, and until now nothing
       assembled more than one at rot 0. A seam is where a conveyor
       runs off one board onto another and where two walls have to
       agree across the join, and none of that had ever been built.

       Clockwise express loop, gears and repair sites inside it,
       pushers of both parities in the corners, 1/2/3-damage lasers on
       three different edges. */
    shuntYard: {
      name: "Shunt Yard", w: 12, h: 12, edition: "classic", set: "authored", origin: "authored",
      notes: "Authored for PumaRally, to exercise multi-board assembly and rotation.",
      pic: [
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        "|p> .. .. .. .. .. .. .. .. .. .. p<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        " .. .. B> B> B> B> B> B> B> Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ .. .. .. .. .. .. Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ .. o. .. .. .. .. Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. ..|B^ .. .. r. W. .. .. Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ .. .. w. l. .. .. Bv|.. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ .. .. .. .. o. .. Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ .. .. .. .. .. .. Bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. B^ B< B< B< B< B< B< B< .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|P> .. .. .. .. .. .. .. .. .. .. P<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +"
      ],
      lasers: [
        { c: 0, r: 5, d: "E", n: 2 },
        { c: 11, r: 6, d: "W", n: 1 },
        { c: 6, r: 0, d: "S", n: 3 }
      ]
    },

    /* THE FIRST TRANSCRIBED OFFICIAL BOARD, from a photograph of the
       printed 1994 base-game board.

       Two express spines run north and south through the middle and
       four conveyor bands cross them, which is the whole board: almost
       every square is moving, and the only still ground is the pockets
       the walls make. Five gears -- the two at the top turn clockwise,
       the three below counter-clockwise. One 1-damage laser, mounted on
       the wall at the top of column 3 and stopped by the wall three
       squares down.

       The walls were the hard part and were got wrong twice before
       this. Twenty-eight of them: sixteen round the frame, at columns
       3/5/8/10 top and bottom and rows 3/5/8/10 left and right, and
       twelve inside. Note that the frame is symmetric but the board is
       not -- (11,10)N and (10,2)W have no opposite number, and checking
       by symmetry rather than by looking is how they went missing.

       The transcription is the picture below; it is not derived from
       anything and cannot be regenerated, so correcting it means going
       back to the photograph. */
    exchange: {
      name: "Exchange", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      notes: "Transcribed from the printed board.",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " .. bv .. B^ .. bv B^ .. bv .. b^ w. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< r. .. B^ .. bv B^ .. bv|.. r. b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. .. B^ .. bv B^ .. bv .. .. ..|",
        "+  +  +--+  +  +  +  +  +  +  +  +  +",
        " b> b> b> b> .. bv B^ .. l. b> b> b> ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. .. .. ..|bv B^|W. .. .. .. ..|",
        "+  +  +  +  +--+  +  +--+  +  +  +  +",
        " b< b< b< b< b< .. .. b< b< b< b< .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b> b> b> b> b> .. .. B> B> B> B> B> ",
        "+  +  +  +  +--+  +  +--+  +  +  +  +",
        "|.. .. .. .. ..|bv b^|.. .. .. .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< b< b< l. .. bv b^ .. l. b< b< b< ",
        "+  +  +  +  +  +  +  +  +  +  +--+  +",
        "|.. o. .. b^ .. bv b^ .. bv .. .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. b^ .. bv b^ .. bv .. ..|.. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " w. bv .. b^ .. bv .. .. bv .. o. .. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 2, r: 0, d: "S", n: 1 }
      ]
    },

    /* THE SECOND TRANSCRIBED OFFICIAL BOARD.

       A square conveyor ring with a second ring inside it running the
       other way, and almost nothing else: the outer two columns and
       rows are bare floor, so the whole board is a racetrack with a
       hole in the middle you have to cross or go round.

       Six gears, and the arrow colour is the tell -- green arrows
       turn clockwise, white counter-clockwise, read off the arrow
       geometry here rather than carried over from Exchange, though it
       agrees with Exchange. No lasers.

       Eighteen pit squares in six L-shaped holes. The printed art
       draws each L as one hole spanning three squares, which is worth
       knowing before you count them: it is three pits, not one.

       Twenty walls, sixteen of them the frame -- columns 3/5/8/10 top
       and bottom, rows 3/5/8/10 left and right, the same frame
       Exchange has. Note that the printed perimeter wall straddles
       the board's rim and is drawn mostly OUTSIDE the playing grid,
       so a scan that looks only inside the squares finds the bottom
       row's walls and misses the top row's entirely. */
    island: {
      name: "Island", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      notes: "Transcribed from the printed board.",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. w. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. o. o. .. .. .. .. .. .. o. o. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. o. r. b> b> b> b> b> b> r. o. ..|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " .. .. b^ l. b< b< b< b< l. bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. b^ bv .. .. o. o. b^ bv .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. b^|bv b< b< W. o. b^ bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. b^ bv o. .. b> b> b^|bv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. b^ bv o. o. .. .. b^ bv .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. b^ l. b> b> b> b> l. bv .. .. ",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        "|w. o. b< b< b< b< b< b< b< bv o. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. o. o. .. .. .. .. .. .. o. o. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: []
    },

    /* THE THIRD TRANSCRIBED OFFICIAL BOARD, and the densest so far:
       106 of its 144 squares are conveyor.

       A spiral. Nested rectangular runs work inward, alternating
       ordinary conveyor and express, and everything ends at a 2x2 pit
       in the middle. Sixteen pushers, four to an edge. Four
       wall-mounted lasers firing into the centre, two of them double.

       TELLING THE TWO BELT SPEEDS APART is the whole difficulty of
       this board, and the tell is the ARROW: an ordinary conveyor's is
       solid, an express conveyor's is a hollow outline. Rail colour --
       copper for ordinary, bare metal for express -- looks like the
       easier test and is a trap, because a tile's two rails can belong
       to two different belts and shadow desaturates copper until it
       measures the same as bare metal. Two classifiers built on rail
       colour disagreed with each other and with the board.

       Pusher facing is the other trap. The hazard bar marks the wall
       the ram is bolted to, so a pusher on row 1 shoves SOUTH and one
       on row 12 shoves NORTH. The first draft had row 12 backwards.

       Each pusher needs the wall it is mounted on, which is what the
       sixteen perimeter walls are: not a decorative frame like
       Exchange's and Island's, but structural. */
    maelstrom: {
      name: "Maelstrom", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " w. bv Pv .. pv bv b^ pv .. Pv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> b> b> b> b> b> bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|P> B> B> B> B> B> B> B> B> Bv bv P<|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " .. B^ b> b> b> b> b> b> bv Bv bv .. ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        "|p> B^ b^ B> B> B> B> Bv bv Bv bv p<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< B^ b^ B^|b> o. o. Bv bv|Bv bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " B> B^ b^|B^ b^ o. o. B<|bv Bv bv .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|p> B^ b^ B^ b^ b< b< b< b< Bv bv p<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " W. B^ b^ B^ B< B< B< B< B< B< bv .. ",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        "|P> B^ b^ b< b< b< b< b< b< b< b< P<|",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        " B> B^ B< B< B< B< B< B< B< B< B< .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. P^ .. p^ .. B^ p^ .. P^ B^ w. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 4, r: 5, d: "E", n: 1 },
        { c: 3, r: 6, d: "E", n: 2 },
        { c: 5, r: 8, d: "N", n: 1 },
        { c: 6, r: 9, d: "N", n: 2 }
      ]
    },

    /* THE THIRD TRANSCRIBED OFFICIAL BOARD, and the densest so far:
       106 of its 144 squares are conveyor.

       A spiral. Nested rectangular runs work inward, alternating
       ordinary conveyor and express, and everything ends at a 2x2 pit
       in the middle. Sixteen pushers, four to an edge. Four
       wall-mounted lasers firing into the centre, all single.

       TELLING THE TWO BELT SPEEDS APART is the whole difficulty of
       this board, and the tell is the ARROW: an ordinary conveyor's is
       solid, an express conveyor's is a hollow outline. Rail colour --
       copper for ordinary, bare metal for express -- looks like the
       easier test and is a trap, because a tile's two rails can belong
       to two different belts and shadow desaturates copper until it
       measures the same as bare metal. Two classifiers built on rail
       colour disagreed with each other and with the board.

       Pusher facing is the other trap. The hazard bar marks the wall
       the ram is bolted to, so a pusher on row 1 shoves SOUTH and one
       on row 12 shoves NORTH. The first draft had row 12 backwards.

       Each pusher needs the wall it is mounted on, which is what the
       sixteen perimeter walls are: not a decorative frame like
       Exchange's and Island's, but structural. */
    maelstrom: {
      name: "Maelstrom", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " w. bv Pv .. pv bv b^ pv .. Pv .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> b> b> b> b> b> bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|P> B> B> B> B> B> B> B> B> Bv bv P<|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " .. B^ b> b> b> b> b> b> bv Bv bv .. ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        "|p> B^ b^ B> B> B> B> Bv bv Bv bv p<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< B^ b^ B^|b> o. o. Bv bv|Bv bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " B> B^ b^|B^ b^ o. o. B<|bv Bv bv .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|p> B^ b^ B^ b^ b< b< b< b< Bv bv p<|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " W. B^ b^ B^ B< B< B< B< B< B< bv .. ",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        "|P> B^ b^ b< b< b< b< b< b< b< b< P<|",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        " B> B^ B< B< B< B< B< B< B< B< B< .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. P^ .. p^ .. B^ p^ .. P^ B^ w. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 4, r: 5, d: "E", n: 1 },
        { c: 3, r: 6, d: "E", n: 1 },
        { c: 5, r: 8, d: "N", n: 1 },
        { c: 6, r: 9, d: "N", n: 1 }
      ]
    },

    /* THE FOURTH TRANSCRIBED OFFICIAL BOARD.

       Twenty-six pit squares, and the belts thread between them: the
       board is named for the holes and almost every conveyor run on
       it ends at one, at a wall, or at the board edge.

       As on Island, the printed art draws some holes as ONE opening
       spanning two squares -- (7,7)+(8,7) and (3,11)+(4,11) side by
       side, (10,6)+(10,7) one above the other -- which is worth
       knowing before counting them. Each is two pits, not one.

       EVERY ARROW ON THIS BOARD IS SOLID, so there is not a single
       express conveyor here and every belt is speed 1. Read at 4x
       per the method in maps/MANIFEST.md: the rails are no use for
       this and the arrow is the only reliable tell.

       No gears and no pushers -- the board has neither printed on it.

       Forty-eight walls. Sixteen are the same frame Exchange and
       Island carry (columns 3/5/8/10 top and bottom, rows 3/5/8/10
       left and right); the other thirty-two are interior. The wall
       bars sit ten to twenty pixels INSIDE the tile edge rather than
       straddling the seam, and every pit carries a yellow-and-black
       hazard border of its own, so a scan that samples only at the
       seam misses real walls and a scan that samples wider calls
       every pit a walled box. What separates them is that a wall bar
       is a solid unbroken band of yellow while a pit border is yellow
       parallelograms on grit, about half coverage -- the two
       populations here are 0.89-1.00 against 0.00-0.53, with nothing
       in between. The detector was fitted against Island, whose walls
       were already transcribed and accepted, before it was pointed at
       this board, and every hit was then confirmed by eye.

       One laser: a single beam, mounted on the north wall of (7,4),
       firing south down column 7 and stopping at the wall under
       (7,9). Single beam checked at fourteen points across the full
       cell width, not one -- per the note above `maelstrom`, probing
       a beam at a single point reads JPEG noise as a gap and turns a
       1-damage laser into a 2. */
    pitMaze: {
      name: "Pit Maze", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      notes: "Transcribed from the printed board.",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " o. .. .. .. .. bv b^ b< .. .. b^ o. ",
        "+  +  +  +  +  +  +  +  +  +--+  +  +",
        " .. ..|.. o. .. bv o. b^ .. o. b^ b< ",
        "+  +  +  +--+  +  +  +  +  +  +  +  +",
        "|.. .. w. .. bv b< .. b^|.. b> b^ ..|",
        "+  +  +  +--+  +  +--+  +--+  +  +  +",
        " ..|o. ..|o. bv o. .. b^ W. b^ o.|.. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. .. bv b< .. .. b^ o.|b^ b< ..|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " b< b< b< b< o.|W. .. b^ b<|o. b^ b< ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        " .. .. o. .. .. ..|o. o. b^ o. .. b> ",
        "+  +--+  +--+  +--+  +--+  +--+  +  +",
        "|..|.. .. .. .. .. .. .. b^ b< .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. o. .. o. W. o. .. o. b^ o. .. ",
        "+  +--+--+  +--+  +--+  +  +  +  +  +",
        "|..|.. .. .. bv b< b< .. .. b^ .. ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b> bv o. o.|bv o. b^|o.|.. b^ b< .. ",
        "+  +  +  +--+  +  +  +  +  +--+  +  +",
        " o. bv .. .. b> bv b^ .. .. .. b^ w. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 6, r: 3, d: "S", n: 1 }
      ]
    },

    /* The start area. Robots enter the course from here, so it is
       laid out with position 1 nearest the middle and the numbers
       fanning outward, the way the printed bay does.

       AUTHORED, not transcribed: the real bay's exact belt layout
       is not reproduced here. Replace this with a transcription
       when reference material is available; nothing in the engine
       depends on its contents beyond the eight numbered squares. */
    dockingBay: {
      name: "Docking Bay", w: 12, h: 4, edition: "classic", set: "authored", origin: "authored",
      notes: "Authored placeholder. Eight start positions; no printed belts.",
      pic: [
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. s3 .. s1 s2 .. s4 .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " s7 s5 .. .. .. .. .. .. .. .. s6 s8 ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +"
      ],
      lasers: []
    }
  };

  /* ============================================================
     COURSES
     A course is which boards, rotated how, laid out where, and
     where the flags go. Flags are tokens, not printed elements —
     keeping them here is what lets one board serve many courses.
     ============================================================ */
  var COURSES = {
    provingRun: {
      name: "Proving Run",
      blurb: "One of everything, and nothing to be ashamed of losing to.",
      intro: true,
      boards: [{ id: "provingGround", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[9, 2], [1, 10], [8, 6]],
      minPlayers: 2, maxPlayers: 8
    },

    shuntRun: {
      name: "Shunt Run",
      blurb: "One express loop, and everything you own is on it.",
      boards: [{ id: "shuntYard", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[5, 1], [10, 10], [3, 6]],
      minPlayers: 2, maxPlayers: 8
    },

    /* The first official board, under a course of our own.

       The printed courses that use Exchange -- Risky Exchange and the
       rest -- place their flags at positions printed on the course
       cards, and those have not been photographed. Inventing them and
       calling them by their printed names would be the one failure a
       game promising faithful layouts cannot survive, so this is an
       authored layout over a transcribed board, and says so. The
       official courses land when the cards do. */
    exchangeRun: {
      name: "Exchange Run",
      blurb: "Everything moves. The walls are the only place to stand.",
      boards: [{ id: "exchange", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[9, 2], [2, 9], [7, 7]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course -- same reason as Exchange:
       the course cards have not been photographed. */
    islandRun: {
      name: "Island Run",
      blurb: "Two rings turning against each other, and a hole in the middle.",
      boards: [{ id: "island", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[4, 4], [0, 5], [6, 7]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course. Only fifteen squares on this
       board are plain floor, so they go on three of those rather than
       on a belt that would carry the robot straight off them. */
    maelstromRun: {
      name: "Maelstrom Run",
      blurb: "Everything spirals inward, and the middle is a hole.",
      boards: [{ id: "maelstrom", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[3, 0], [11, 6], [5, 11]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course. Only fifteen squares on this
       board are plain floor, so they go on three of those rather than
       on a belt that would carry the robot straight off them. */
    maelstromRun: {
      name: "Maelstrom Run",
      blurb: "Everything spirals inward, and the middle is a hole.",
      boards: [{ id: "maelstrom", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[3, 0], [11, 6], [5, 11]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course -- same reason as Exchange
       and Island: the course cards have not been photographed. All
       three sit on plain floor, which on this board is the scarce
       thing. */
    pitMazeRun: {
      name: "Pit Maze Run",
      blurb: "Twenty-six holes and the belts that run between them.",
      boards: [{ id: "pitMaze", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[8, 2], [2, 7], [11, 10]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Two boards side by side. The seam down the middle is the thing
       under test: walls have to agree across it and a conveyor running
       off one board has to meet whatever is on the other. */
    crossTown: {
      name: "Cross Town",
      blurb: "Two factory floors and the gap between them.",
      boards: [
        { id: "provingGround", rot: 0, at: [0, 0] },
        { id: "shuntYard", rot: 0, at: [12, 0] }
      ],
      dock: { id: "dockingBay", rot: 0, at: [6, 12] },
      flags: [[9, 2], [17, 6], [1, 10]],
      minPlayers: 2, maxPlayers: 8
    },

    /* The same board a quarter-turn over, which is how the printed
       courses use them and the only thing that exercises rotateGrid
       against a real course rather than a unit test. */
    sidelong: {
      name: "Sidelong",
      blurb: "The Shunt Yard, turned on its side.",
      boards: [{ id: "shuntYard", rot: 1, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[10, 5], [1, 1], [6, 8]],
      minPlayers: 2, maxPlayers: 8
    }
  };

  /* ============================================================
     COURSE ASSEMBLY
     Derived, never stored in game state. A save holds a course id
     and nothing else; storing the built grid is how saves go stale
     the first time a board is corrected.
     ============================================================ */
  function courseBounds(spec) {
    var w = 0, h = 0;
    var parts = spec.boards.concat(spec.dock ? [spec.dock] : []);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], g = rotateGrid(parsePic(p.id, BOARD_SPECS[p.id]), p.rot);
      w = Math.max(w, p.at[0] + g.w);
      h = Math.max(h, p.at[1] + g.h);
    }
    return { w: w, h: h };
  }

  function stamp(C, g, at) {
    var ox = at[0], oy = at[1], c, r, d;
    for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) {
      C.cell[idx(C, ox + c, oy + r)] = g.cell[idx(g, c, r)];
      for (d = 0; d < 4; d++) if (wallAt(g, c, r, d)) setWall(C, ox + c, oy + r, d, true);
    }
    for (var i = 0; i < g.lasers.length; i++) {
      var L = g.lasers[i];
      C.lasers.push({ c: L.c + ox, r: L.r + oy, d: L.d, n: L.n });
    }
    for (var j = 0; j < g.docks.length; j++) {
      var D = g.docks[j];
      C.docks.push({ c: D.c + ox, r: D.r + oy, n: D.n });
    }
  }

  function buildCourse(id) {
    var spec = COURSES[id];
    if (!spec) throw new Error("no such course: " + id);
    var b = courseBounds(spec);
    var C = blankGrid(b.w, b.h);
    C.id = id;
    C.name = spec.name;
    C.flags = [];
    for (var i = 0; i < spec.boards.length; i++) {
      var p = spec.boards[i];
      stamp(C, rotateGrid(parsePic(p.id, BOARD_SPECS[p.id]), p.rot), p.at);
    }
    if (spec.dock) stamp(C, rotateGrid(parsePic(spec.dock.id, BOARD_SPECS[spec.dock.id]), spec.dock.rot), spec.dock.at);
    C.edition = BOARD_SPECS[spec.boards[0].id].edition || "classic";
    for (var f = 0; f < spec.flags.length; f++) {
      C.flags.push({ c: spec.flags[f][0], r: spec.flags[f][1], n: f + 1 });
    }
    C.docks.sort(function (a, z) { return a.n - z.n; });
    return C;
  }

  /* A tile outside every stamped board is void — the same effect
     as a pit, and the reason inGrid() alone is not enough. */
  function isVoid(C, c, r) { return !inGrid(C, c, r) || !C.cell[idx(C, c, r)]; }

  function validateCourse(id, warn) {
    var spec = COURSES[id];
    var E_ = function (m) { throw new Error("course " + id + ": " + m); };
    var i;
    for (i = 0; i < spec.boards.length; i++) {
      if (!BOARD_SPECS[spec.boards[i].id]) E_('references board "' + spec.boards[i].id + '", which is not defined');
    }
    if (spec.dock && !BOARD_SPECS[spec.dock.id]) E_('references docking bay "' + spec.dock.id + '", which is not defined');

    var C = buildCourse(id);

    /* One course, one game. A classic board and a 2016 board laid out
       together would validate tile by tile and be unplayable under
       either rulebook. */
    var edition = null;
    var parts = spec.boards.concat(spec.dock ? [spec.dock] : []);
    for (i = 0; i < parts.length; i++) {
      var be = BOARD_SPECS[parts[i].id].edition || "classic";
      if (edition === null) edition = be;
      else if (be !== edition) {
        E_('mixes the ' + EDITIONS[edition].name + " and " + EDITIONS[be].name +
           " editions; a course is one game or the other");
      }
    }
    C.edition = edition;

    if (!spec.flags.length) E_("has no flags, so it can never be won");

    var seen = {};
    for (i = 0; i < spec.flags.length; i++) {
      var c = spec.flags[i][0], r = spec.flags[i][1], key = c + "," + r;
      if (seen[key]) E_("has two flags on (" + key + ")");
      seen[key] = true;
      if (isVoid(C, c, r)) E_("flag " + (i + 1) + " at (" + key + ") is off the course");
      if (isPit(codeAt(C, c, r))) E_("flag " + (i + 1) + " at (" + key + ") sits in a pit");
    }

    if (C.docks.length < spec.maxPlayers) E_("has " + C.docks.length + " docking bays but seats " + spec.maxPlayers);
    for (i = 0; i < C.docks.length; i++) {
      if (C.docks[i].n !== i + 1) E_("docking bays are numbered " + C.docks.map(function (d) { return d.n; }).join(",") + ", expected 1.." + C.docks.length);
    }

    // A conveyor running off one board should meet a conveyor on the next.
    for (var r2 = 0; r2 < C.h; r2++) for (var c2 = 0; c2 < C.w; c2++) {
      var code = codeAt(C, c2, r2);
      if (!beltSpeed(code)) continue;
      var nx = step(c2, r2, dirOf(code));
      if (isVoid(C, nx.c, nx.r)) continue;
      if (!beltSpeed(codeAt(C, nx.c, nx.r))) continue;
      if (dirOf(codeAt(C, nx.c, nx.r)) === opposite(dirOf(code))) {
        E_("conveyors at (" + c2 + "," + r2 + ") and (" + nx.c + "," + nx.r + ") meet head-on across a seam");
      }
    }
    return C;
  }

  /* ============================================================
     THE ENTRY POINT BOTH THE GAME AND CI CALL
     ============================================================ */
  function validateAll() {
    var warnings = [];
    var warn = function (id, m) { warnings.push(id + ": " + m); };
    var boards = {}, id;
    for (id in BOARD_SPECS) {
      var g = parsePic(id, BOARD_SPECS[id]);
      validateGrid(id, g, warn);
      boards[id] = g;
    }
    for (id in COURSES) validateCourse(id, warn);
    return { boards: boards, warnings: warnings };
  }

  return {
    N: N, E: E, S: S, W: W, DC: DC, DR: DR, DIR_CHARS: DIR_CHARS, DIR_OF: DIR_OF,
    rot: rot, opposite: opposite, dirName: dirName, turnBetween: turnBetween, step: step,
    ELEMENT_DEFS: ELEMENT_DEFS, elemOf: elemOf, dirOf: dirOf, EDITIONS: EDITIONS, SETS: SETS,
    beltSpeed: beltSpeed, gearTurn: gearTurn, isPit: isPit,
    BOARD_SPECS: BOARD_SPECS, COURSES: COURSES,
    parsePic: parsePic, rotateGrid: rotateGrid, laserPath: laserPath,
    gridToPic: gridToPic, formatBoard: formatBoard, blankGrid: blankGrid,
    idx: idx, inGrid: inGrid, codeAt: codeAt, wallAt: wallAt, setWall: setWall,
    buildCourse: buildCourse, isVoid: isVoid,
    validateGrid: validateGrid, validateCourse: validateCourse, validateAll: validateAll
  };
});
