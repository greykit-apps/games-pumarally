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
     ELEMENT LEGEND
     A cell is exactly two characters: element, then argument. The
     argument is a direction for anything that points, a digit for
     a docking bay, and '.' for anything that takes neither. Fixed
     width is what lets a picture row be checked for a dropped
     character, which is the commonest transcription error.
     ============================================================ */
  var ELEMENT_DEFS = {
    ".": { name: "floor", arg: "none" },
    "o": { name: "pit", arg: "none" },
    "b": { name: "conveyor", arg: "dir", belt: 1 },
    "B": { name: "express conveyor", arg: "dir", belt: 2 },
    "l": { name: "gear (counter-clockwise)", arg: "none", gear: -1 },
    "r": { name: "gear (clockwise)", arg: "none", gear: 1 },
    "p": { name: "pusher (registers 1, 3, 5)", arg: "dir", push: "odd" },
    "P": { name: "pusher (registers 2, 4)", arg: "dir", push: "even" },
    "w": { name: "repair site", arg: "none", repair: 1 },
    "W": { name: "upgrade site", arg: "none", repair: 1, option: true },
    "s": { name: "docking bay", arg: "digit" }
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
    out.push('      name: "' + name + '", w: ' + g.w + ", h: " + g.h + ', origin: "' + origin + '",');
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
      name: "Proving Ground", w: 12, h: 12, origin: "authored",
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

    /* The start area. Robots enter the course from here, so it is
       laid out with position 1 nearest the middle and the numbers
       fanning outward, the way the printed bay does.

       AUTHORED, not transcribed: the real bay's exact belt layout
       is not reproduced here. Replace this with a transcription
       when reference material is available; nothing in the engine
       depends on its contents beyond the eight numbered squares. */
    dockingBay: {
      name: "Docking Bay", w: 12, h: 4, origin: "authored",
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
    ELEMENT_DEFS: ELEMENT_DEFS, elemOf: elemOf, dirOf: dirOf,
    beltSpeed: beltSpeed, gearTurn: gearTurn, isPit: isPit,
    BOARD_SPECS: BOARD_SPECS, COURSES: COURSES,
    parsePic: parsePic, rotateGrid: rotateGrid, laserPath: laserPath,
    gridToPic: gridToPic, formatBoard: formatBoard, blankGrid: blankGrid,
    idx: idx, inGrid: inGrid, codeAt: codeAt, wallAt: wallAt, setWall: setWall,
    buildCourse: buildCourse, isVoid: isVoid,
    validateGrid: validateGrid, validateCourse: validateCourse, validateAll: validateAll
  };
});
