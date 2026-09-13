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
    /* Pushers are NOT here. A pusher is bolted to a wall, and the
       square it overhangs is its own separate thing -- on board H a
       conveyor and a pusher share squares, which is ordinary on the
       printed board and impossible to say while a pusher WAS the
       square. They live in `pushers`, beside the picture, the way
       lasers do -- lasers are wall-mounted for exactly the same
       reason and were never cells. */
    /* The 2016 edition removed repair and upgrade squares from the
       boards, so these two are classic-only and a modern board
       carrying one is a transcription error rather than a variant. */
    /* CRASH AND BURN (1997). Both act on a register timer, which is
       printed on the square as a number -- so the argument slot, which
       these do not need for a direction, carries WHEN instead. */
    "L": { name: "oil slick", arg: "none", oil: true, editions: ["classic"] },
    /* The argument is the COLOUR, and colours come in pairs -- the
       validator refuses a portal without its twin, because a lone
       portal is a transcription error that would otherwise render and
       play as a square that swallows robots. */
    "t": { name: "portal", arg: "pair", portal: true, editions: ["classic"] },
    /* Presses are NOT here either, and Cannery Row is the board that
       proves it. Every press on it is printed ON A CONVEYOR -- the
       roller beds run straight through under the disc and the belt's
       own arrow shows across it -- so the square is a belt AND a
       press, which no single cell could ever say. They live in
       `timers`, beside the picture, with the registers each is active
       in. The same argument as the pushers above, reached the same
       way: by a board that could not be written down. */
    /* Burners are NOT here either, and for the pushers' reason twice over.
       A flame jet is bolted to a wall and plays over the floor in front of
       it, so the square it scorches is not the jet -- and board G has one
       that reaches TWO squares, which no single cell could ever say. They
       live in `burners`, beside the picture. */
    "w": { name: "repair site", arg: "none", repair: 1, editions: ["classic"] },
    "W": { name: "upgrade site", arg: "none", repair: 2, option: true, editions: ["classic"] },
    "s": { name: "docking bay", arg: "digit", editions: BOTH }
  };

  function elemOf(code) { return ELEMENT_DEFS[code.charAt(0)]; }
  function dirOf(code) { return DIR_CHARS.indexOf(code.charAt(1)); }
  function beltSpeed(code) { var e = elemOf(code); return e && e.belt || 0; }

  /* ============================================================
     WHICH SIDES OF A BELT SHOW AN INCOMING PATH

     A conveyor is not only a direction. The board PRINTS whether the
     square is a plain straight, a corner, or a merge -- and that is a
     rule, not decoration: a robot carried onto a corner or into the
     arm of a merge is turned a quarter, and a robot carried onto a
     plain straight from the side is not turned at all.

     This used to be DERIVED, by asking which neighbours pointed at the
     square. That is wrong wherever the answer is not local. A belt at
     the rim of a board is printed straight or printed as a merge and
     STAYS THAT WAY whatever board is laid next to it -- the printing
     cannot know, and half the boards in the box have belts running off
     their edges. Derivation made the shape depend on the course, so
     the same board turned a robot on one course and not on another.

     So the arms are data. `merges` lists the squares whose arms are
     not the default, each naming ALL of its arms as absolute sides:

         merges: [{ c: 4, r: 2, in: "WS" }]

     The default, for every belt with no entry, is a single arm at its
     REAR -- a plain straight. A corner is one side arm and no rear; a
     T-merge is a rear and one side; a crossing is a rear and both.
     ============================================================ */
  function mergeAt(g, c, r) {
    for (var i = 0; i < (g.merges || []).length; i++) {
      if (g.merges[i].c === c && g.merges[i].r === r) return g.merges[i];
    }
    return null;
  }

  /* The sides a belt accepts a turning path from, as absolute
     directions. Empty for a square that is not a belt. */
  function beltArms(g, c, r) {
    var code = codeAt(g, c, r);
    if (!beltSpeed(code)) return [];
    var m = mergeAt(g, c, r);
    if (!m) return [opposite(dirOf(code))];
    var out = [], i;
    for (i = 0; i < m.in.length; i++) out.push(DIR_OF[m.in.charAt(i)]);
    return out;
  }

  /* Whether a robot arriving from `side` is turned by the printing.
     The rear arm is an arm too, and turns nobody, because arriving by
     it means already facing the way the belt runs. */
  function beltTurnsFrom(g, c, r, side) {
    return beltArms(g, c, r).indexOf(side) >= 0;
  }
  function gearTurn(code) { var e = elemOf(code); return e && e.gear || 0; }
  function isPit(code) { return code.charAt(0) === "o"; }
  function isOil(code) { var e = elemOf(code); return !!(e && e.oil); }
  /* '.' always, '1'-'5' one printed register, 'o' the odd ones and 'e'
     the even ones -- the same 1/3/5 and 2/4 split the pushers use, and
     for the same reason: the board prints a set of numbers, not one. */
  function timerAt(g, c, r) {
    for (var i = 0; i < (g.timers || []).length; i++) {
      if (g.timers[i].c === c && g.timers[i].r === r) return g.timers[i];
    }
    return null;
  }

  /* NO NUMBER MEANS EVERY REGISTER.

     A trap that fires in all five is printed without any number on it,
     because there is nothing to distinguish; only a trap that sits out
     some registers needs to say which. So an empty list is not a
     missing list, it is the commonest case written the short way, and
     the three traps ask the same question through here rather than
     each spelling out the same indexOf.

     register is 0-based; the board prints 1-5. */
  function firesIn(regs, register) {
    return !regs || !regs.length || regs.indexOf(register + 1) >= 0;
  }

  function activeNow(g, c, r, register) {
    var t = timerAt(g, c, r);
    return !!t && firesIn(t.regs, register);
  }

  /* The jet playing over this square, or null. A jet covers its mount
     square and, when it reaches two, the next one along -- so this asks
     "am I in the fire", not "am I the nozzle". */
  function burnerAt(g, c, r) {
    for (var i = 0; i < (g.burners || []).length; i++) {
      var f = g.burners[i];
      for (var k = 0; k < (f.len || 1); k++) {
        if (f.c + DC[f.d] * k === c && f.r + DR[f.d] * k === r) return f;
      }
    }
    return null;
  }

  function burnerFires(g, c, r, register) {
    var f = burnerAt(g, c, r);
    return !!f && firesIn(f.regs, register);
  }

  /* The pusher overhanging this square, or null. There is at most one:
     the validator refuses a second, because two rams on one square is a
     transcription error that would otherwise shove a robot twice. */
  function pusherAt(g, c, r) {
    for (var i = 0; i < (g.pushers || []).length; i++) {
      if (g.pushers[i].c === c && g.pushers[i].r === r) return g.pushers[i];
    }
    return null;
  }

  /* Does the pusher on this square fire in this register? Every pusher
     carries its own set, so the classic 1/3/5 and 2/4 parities and
     board H's 1/2/3/4/5 are one question with one answer rather than
     three cases. register is 0-based, the board prints 1-5. */
  function pusherFires(g, c, r, register) {
    var pu = pusherAt(g, c, r);
    return !!pu && firesIn(pu.regs, register);
  }

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
       l.  gear ccw       r.  gear cw
       w.  repair (1 damage)
       W.  upgrade (2 damage OR an option card -- the player chooses)
       L.  oil slick                        (Crash and Burn)
       t1  portal, colour 1 (exactly two)   (Crash and Burn)
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
      /* Swing doors live on the lattice beside the walls rather than on
         the squares, because that is where they are: a closed one IS a
         wall. The value is the register in which the door stands OPEN,
         so an absent door and a permanently shut one are the same thing
         -- which is just a wall, and is spelled that way. */
      doorN: new Array(w * (h + 1)),
      doorW: new Array((w + 1) * h),
      lasers: [],
      /* Which sides of a belt show an incoming path, for the belts
         whose arms are not just a rear one: { c, r, in: "WS" }. Beside
         the picture because a two-character cell has no room for three
         more bits -- and because the printing is what it is regardless
         of what is laid next to the board, which is exactly what
         deriving it from the neighbours got wrong. */
      merges: [],
      /* Registers a press or burner acts in. A SPARSE LIST beside the
         picture, the way lasers already are, rather than a character in
         the cell -- the printed sets are arbitrary subsets of 1-5 (2 3 5
         and 1 3 5 and 2 4 all appear on board G), and a two-character
         cell has exactly one character to spare. A bitmask would fit but
         would make the picture unreadable, and the picture is readable
         on purpose: the transcription workflow is comparing it to a
         photograph. The validator pairs the two layers 1:1 so they
         cannot drift. */
      timers: [],
      /* Pushers, wall-mounted, one entry per ram: { c, r, d, regs }.
         Beside the picture rather than in it because the square a
         pusher overhangs is not the pusher -- board H has conveyors
         under several of them, and a two-character cell cannot say
         "conveyor east AND a ram on the north wall firing 2 and 5".
         The wall it mounts on is checked, so this list cannot drift
         from the picture without the validator saying so. */
      pushers: [],
      /* Flame jets, wall-mounted: { c, r, d, regs, len }. (c,r) is the
         square the nozzle stands in, d the way it throws, len how many
         squares the fire covers -- 1 for nearly all of them, 2 for the
         one on board G that reaches across into (2,3). Measured off the
         photographs, where a two-square jet is unmistakable: the narrow
         cones fill the mount square and the bright ball lands in the
         next, brighter than the square it came from. */
      burners: [],
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

  function doorAt(g, c, r, d) {
    if (d === N) return g.doorN[r * g.w + c] || "";
    if (d === S) return g.doorN[(r + 1) * g.w + c] || "";
    if (d === W) return g.doorW[r * (g.w + 1) + c] || "";
    return g.doorW[r * (g.w + 1) + c + 1] || "";       // E
  }

  function setDoor(g, c, r, d, ch) {
    if (d === N) g.doorN[r * g.w + c] = ch;
    else if (d === S) g.doorN[(r + 1) * g.w + c] = ch;
    else if (d === W) g.doorW[r * (g.w + 1) + c] = ch;
    else g.doorW[r * (g.w + 1) + c + 1] = ch;
  }

  /* Open only in the registers printed on it. Same vocabulary the
     presses and burners use, minus '.': a door that is always open is
     not a door. */
  function doorOpen(ch, register) {
    if (!ch) return true;
    if (ch === "o") return register % 2 === 0;
    if (ch === "e") return register % 2 === 1;
    return parseInt(ch, 10) === register + 1;
  }

  /* The question every mover and every laser actually wants to ask.
     wallAt alone is not it any more: a shut door stops you just as
     dead, and asking wallAt is how a robot walks through one. */
  function blockedAt(g, c, r, d, register) {
    if (wallAt(g, c, r, d)) return true;
    var ch = doorAt(g, c, r, d);
    return !!ch && !doorOpen(ch, register);
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
          else if (/^([1-5oe])\1$/.test(seg)) g.doorN[r * w + c] = seg.charAt(0);
          else if (seg !== "  ") E_("picture row " + y + " tile " + c + ": horizontal wall must be '--', a doubled door register (11-55, oo, ee) or two spaces, got '" + seg + "'");
        }
      } else {
        for (c = 0; c <= w; c++) {
          var vc = row.charAt(3 * c);
          if (vc === "|") g.wallW[r * (w + 1) + c] = 1;
          else if (/[1-5oe]/.test(vc)) g.doorW[r * (w + 1) + c] = vc;
          else if (vc !== " ") E_("picture row " + y + " col " + (3 * c) + ": vertical wall must be '|', a door register (1-5, o, e) or a space, got '" + vc + "'");
        }
        for (c = 0; c < w; c++) {
          var code = row.substr(3 * c + 1, 2);
          /* A HOLE IN THE PICTURE, and only where holes are possible.

             A board has no void: every square of it is printed, so two
             spaces there is a dropped character and stays an error --
             that strictness is the whole reason the format is a
             picture. A COURSE is a different shape: two boards over a
             one-board start area leave a corner with nothing in it, and
             an L-shaped course is mostly nothing. So a picture that
             says it carries voids may leave a square empty, and the
             cell is left undefined, which is exactly what isVoid
             already means by "off the course". */
          if (spec.voids && code === "  ") continue;
          var def = ELEMENT_DEFS[code.charAt(0)];
          if (!def) E_("(" + c + "," + r + ") uses element '" + code.charAt(0) + "', which is not in the legend");
          var a = code.charAt(1);
          if (def.arg === "dir" && DIR_CHARS.indexOf(a) < 0) E_("(" + c + "," + r + ") " + def.name + " needs a direction (^ > v <), got '" + a + "'");
          if (def.arg === "none" && a !== ".") E_("(" + c + "," + r + ") " + def.name + " takes no argument, got '" + a + "'");
          if (def.arg === "digit" && !/[1-8]/.test(a)) E_("(" + c + "," + r + ") " + def.name + " needs a position 1-8, got '" + a + "'");
          if (def.arg === "pair" && !/[1-9]/.test(a)) E_("(" + c + "," + r + ") " + def.name + " needs a colour 1-9, got '" + a + "'");
          if (def.arg === "when" && !/[.oe1-5]/.test(a)) {
            E_("(" + c + "," + r + ") " + def.name + " needs a register: '.' always, " +
               "1-5 for one, 'o' for 1/3/5 or 'e' for 2/4, got '" + a + "'");
          }
          if (def.editions && def.editions.indexOf(edition) < 0) {
            E_("(" + c + "," + r + ") is a " + def.name + ", which the " +
               EDITIONS[edition].name + " edition does not print");
          }
          g.cell[r * w + c] = code;
          if (def.arg === "digit") g.docks.push({ c: c, r: r, n: parseInt(a, 10) });
        }
      }
    }
    /* Portals come in twos. One is a dropped character; three is a
       colour used twice by mistake. Either reads as a plausible board. */
    var portals = {};
    for (var pr = 0; pr < h; pr++) {
      for (var pc = 0; pc < w; pc++) {
        var pcode = g.cell[pr * w + pc];
        if (!pcode || pcode.charAt(0) !== "t") continue;
        var col = pcode.charAt(1);
        (portals[col] = portals[col] || []).push(pc + "," + pr);
      }
    }
    for (var col2 in portals) {
      if (portals[col2].length !== 2) {
        E_("portal colour " + col2 + " appears " + portals[col2].length +
           " time(s) at " + portals[col2].join(" and ") + "; portals come in pairs");
      }
    }

    var timed = {}, ti;
    for (ti = 0; ti < (spec.timers || []).length; ti++) {
      var T = spec.timers[ti];
      if (!inGrid(g, T.c, T.r) || !g.cell[T.r * w + T.c]) {
        E_("press at (" + T.c + "," + T.r + ") is off the board");
      }
      if (isPit(g.cell[T.r * w + T.c])) E_("press at (" + T.c + "," + T.r + ") is over a pit");
      T.regs = T.regs || [];
      if (T.regs.length === 5) E_("press at (" + T.c + "," + T.r + ") lists all five registers; leave the list empty instead");
      for (var ri = 0; ri < T.regs.length; ri++) {
        if (!(T.regs[ri] >= 1 && T.regs[ri] <= 5)) {
          E_("press at (" + T.c + "," + T.r + ") lists register " + T.regs[ri] + "; registers run 1-5");
        }
      }
      if (timed[T.c + "," + T.r]) E_("two presses at (" + T.c + "," + T.r + ")");
      timed[T.c + "," + T.r] = 1;
      g.timers.push({ c: T.c, r: T.r, regs: T.regs.slice().sort() });
    }

    var merged = {};
    for (var mi = 0; mi < (spec.merges || []).length; mi++) {
      var MG = spec.merges[mi];
      var mcode = (inGrid(g, MG.c, MG.r) && g.cell[MG.r * w + MG.c]) || "";
      if (!beltSpeed(mcode)) E_("merge at (" + MG.c + "," + MG.r + ") is not on a conveyor");
      if (merged[MG.c + "," + MG.r]) E_("two merges at (" + MG.c + "," + MG.r + ")");
      merged[MG.c + "," + MG.r] = 1;
      if (typeof MG.in !== "string" || !MG.in.length) {
        E_("merge at (" + MG.c + "," + MG.r + ") names no sides; a belt with no arm at all " +
           "can never be entered, and a plain straight needs no entry");
      }
      var seenSide = {}, si;
      for (si = 0; si < MG.in.length; si++) {
        var ch = MG.in.charAt(si), sd = DIR_OF[ch];
        if (sd === undefined) E_('merge at (' + MG.c + "," + MG.r + ') names side "' + ch + '", which is not a direction');
        if (seenSide[ch]) E_("merge at (" + MG.c + "," + MG.r + ") names " + dirName(sd) + " twice");
        seenSide[ch] = 1;
        /* The side a belt RUNS OUT OF is where it delivers, not
           somewhere it can be entered from. */
        if (sd === dirOf(mcode)) {
          E_("merge at (" + MG.c + "," + MG.r + ") takes an arm from the " + dirName(sd) +
             ", which is the side it runs out of");
        }
      }
      g.merges.push({ c: MG.c, r: MG.r, in: MG.in });
    }

    for (var i = 0; i < (spec.lasers || []).length; i++) {
      var L = spec.lasers[i];
      g.lasers.push({ c: L.c, r: L.r, d: DIR_OF[L.d], n: L.n });
    }
    var pushed = {};
    for (var pi = 0; pi < (spec.pushers || []).length; pi++) {
      var U = spec.pushers[pi], uw = "pusher at (" + U.c + "," + U.r + ")";
      if (!inGrid(g, U.c, U.r)) E_(uw + " is off the board");
      if (DIR_OF[U.d] === undefined) E_(uw + ' pushes "' + U.d + '", which is not a direction');
      U.regs = U.regs || [];
      if (U.regs.length === 5) E_(uw + " lists all five registers; leave the list empty instead");
      for (var ui = 0; ui < U.regs.length; ui++) {
        if (!(U.regs[ui] >= 1 && U.regs[ui] <= 5)) {
          E_(uw + " lists register " + U.regs[ui] + "; registers run 1-5");
        }
      }
      if (pushed[U.c + "," + U.r]) E_("two pushers at (" + U.c + "," + U.r + ")");
      pushed[U.c + "," + U.r] = 1;
      g.pushers.push({ c: U.c, r: U.r, d: DIR_OF[U.d], regs: U.regs.slice().sort() });
    }
    var burnt = {};
    for (var fi = 0; fi < (spec.burners || []).length; fi++) {
      var F = spec.burners[fi], fw = "burner at (" + F.c + "," + F.r + ")";
      if (!inGrid(g, F.c, F.r)) E_(fw + " is off the board");
      if (DIR_OF[F.d] === undefined) E_(fw + ' throws "' + F.d + '", which is not a direction');
      F.regs = F.regs || [];
      if (F.regs.length === 5) E_(fw + " lists all five registers; leave the list empty instead");
      for (var fr = 0; fr < F.regs.length; fr++) {
        if (!(F.regs[fr] >= 1 && F.regs[fr] <= 5)) {
          E_(fw + " lists register " + F.regs[fr] + "; registers run 1-5");
        }
      }
      var flen = F.len === undefined ? 1 : F.len;
      if (flen !== 1 && flen !== 2) E_(fw + " reaches " + flen + " squares; the printed ones reach 1 or 2");
      var fd = DIR_OF[F.d];
      for (var fk = 0; fk < flen; fk++) {
        var fc = F.c + DC[fd] * fk, frr = F.r + DR[fd] * fk;
        if (burnt[fc + "," + frr]) E_("two burners cover (" + fc + "," + frr + ")");
        burnt[fc + "," + frr] = 1;
      }
      g.burners.push({ c: F.c, r: F.r, d: fd, regs: F.regs.slice().sort(), len: flen });
    }
    g.name = spec.name;
    g.edition = edition;
    g.set = set;
    g.origin = spec.origin || "authored";
    g.notes = spec.notes || "";
    /* Carried onto the grid so the exporter and the menus both see it
       without reaching back for the spec. */
    if (spec.unverified) g.unverified = true;
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
        for (c = 0; c < g.w; c++) {
          var dn = g.doorN[r * g.w + c];
          out += "+" + (g.wallN[r * g.w + c] ? "--" : dn ? dn + dn : "  ");
        }
        out += "+";
      } else {
        for (c = 0; c < g.w; c++) {
          out += (g.wallW[r * (g.w + 1) + c] ? "|" : (g.doorW[r * (g.w + 1) + c] || " ")) +
                 (g.cell[r * g.w + c] || "  ");
        }
        out += g.wallW[r * (g.w + 1) + g.w] ? "|" : (g.doorW[r * (g.w + 1) + g.w] || " ");
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
    /* A board still being checked against its photograph says so in its
       own data, and the exporter has to carry that across or the round
       trip drops the one field that keeps it out of a race. */
    if (meta.unverified !== undefined ? meta.unverified : g.unverified) out.push("      unverified: true,");
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
    /* Emitted only when there are any, so a board without one formats
       exactly as it did before these existed and the byte-for-byte
       round-trip keeps its meaning. */
    if (g.merges && g.merges.length) {
      out.push("      ,");
      out.push("      merges: [");
      for (var mf = 0; mf < g.merges.length; mf++) {
        var MF = g.merges[mf];
        out.push("        { c: " + MF.c + ", r: " + MF.r + ', in: "' + MF.in + '" }' +
          (mf === g.merges.length - 1 ? "" : ","));
      }
      out.push("      ]");
    }
    if (g.pushers && g.pushers.length) {
      out.push("      ,");
      out.push("      pushers: [");
      for (var ui = 0; ui < g.pushers.length; ui++) {
        var U = g.pushers[ui];
        out.push("        { c: " + U.c + ", r: " + U.r + ', d: "' + DIR_LETTER[U.d] +
          '", regs: [' + U.regs.join(", ") + "] }" + (ui === g.pushers.length - 1 ? "" : ","));
      }
      out.push("      ]");
    }
    if (g.burners && g.burners.length) {
      out.push("      ,");
      out.push("      burners: [");
      for (var fi = 0; fi < g.burners.length; fi++) {
        var F = g.burners[fi];
        out.push("        { c: " + F.c + ", r: " + F.r + ', d: "' + DIR_LETTER[F.d] +
          '", regs: [' + F.regs.join(", ") + "]" + (F.len === 2 ? ", len: 2" : "") + " }" +
          (fi === g.burners.length - 1 ? "" : ","));
      }
      out.push("      ]");
    }
    if (g.timers && g.timers.length) {
      out.push("      ,");
      out.push("      timers: [");
      for (var ti = 0; ti < g.timers.length; ti++) {
        var T = g.timers[ti];
        out.push("        { c: " + T.c + ", r: " + T.r + ", regs: [" + T.regs.join(", ") + "] }" +
          (ti === g.timers.length - 1 ? "" : ","));
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
        for (var d = 0; d < 4; d++) {
          if (wallAt(g, c, r, d)) setWall(n, nc, nr, rot(d, 1), true);
          var dch = doorAt(g, c, r, d);
          if (dch) setDoor(n, nc, nr, rot(d, 1), dch);
        }
      }
    }
    for (var i = 0; i < g.lasers.length; i++) {
      var L = g.lasers[i];
      n.lasers.push({ c: g.h - 1 - L.r, r: L.c, d: rot(L.d, 1), n: L.n });
    }
    for (var uq = 0; uq < g.pushers.length; uq++) {
      var U2 = g.pushers[uq];
      n.pushers.push({ c: g.h - 1 - U2.r, r: U2.c, d: rot(U2.d, 1), regs: U2.regs.slice() });
    }
    for (var fq = 0; fq < g.burners.length; fq++) {
      var F2 = g.burners[fq];
      n.burners.push({ c: g.h - 1 - F2.r, r: F2.c, d: rot(F2.d, 1),
                       regs: F2.regs.slice(), len: F2.len });
    }
    for (var mq = 0; mq < (g.merges || []).length; mq++) {
      var M2 = g.merges[mq], sides = "";
      for (var ms = 0; ms < M2.in.length; ms++) sides += DIR_LETTER[rot(DIR_OF[M2.in.charAt(ms)], 1)];
      n.merges.push({ c: g.h - 1 - M2.r, r: M2.c, in: sides });
    }
    for (var tq = 0; tq < g.timers.length; tq++) {
      var T2 = g.timers[tq];
      n.timers.push({ c: g.h - 1 - T2.r, r: T2.c, regs: T2.regs.slice() });
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

    }

    // ---- pushers: a ram needs a wall to be bolted to ----
    for (var ui = 0; ui < g.pushers.length; ui++) {
      var U = g.pushers[ui];
      if (!wallAt(g, U.c, U.r, opposite(U.d))) {
        E_("(" + U.c + "," + U.r + ") pusher pushes " + dirName(U.d) +
           " but has no wall behind it to mount on");
      }
    }

    // ---- burners: a jet needs a wall to be bolted to, and somewhere to reach ----
    for (var fi = 0; fi < g.burners.length; fi++) {
      var F = g.burners[fi];
      if (!wallAt(g, F.c, F.r, opposite(F.d))) {
        E_("(" + F.c + "," + F.r + ") burner throws " + dirName(F.d) +
           " but has no wall behind it to mount on");
      }
      /* A WARNING, not a refusal. Every jet on both printed boards sits
         against exactly one wall, and the extra ones that showed up on
         first transcription were all the same mistake: a flame's orange
         passes the wall-yellow test, so the scan counted the fire as a
         second wall. A corner-mounted jet is perfectly possible on a
         board we have not seen yet, so this says "look at this" rather
         than refusing it. */
      var sides = 0;
      for (var fd2 = 0; fd2 < 4; fd2++) if (wallAt(g, F.c, F.r, fd2)) sides++;
      if (sides > 1) {
        warn(id, "(" + F.c + "," + F.r + ") burner has walls on " + sides +
             " sides; a flame read as wall yellow is how that usually happens");
      }

      /* A two-square jet whose second square is off the board, or behind a
         wall, is a misread reach -- the fire would be painted onto nothing
         or through something solid. */
      if (F.len === 2) {
        if (wallAt(g, F.c, F.r, F.d)) {
          E_("(" + F.c + "," + F.r + ") burner reaches two squares but a wall stops it at one");
        }
        var nx2 = step(F.c, F.r, F.d);
        if (!inGrid(g, nx2.c, nx2.r)) {
          E_("(" + F.c + "," + F.r + ") burner reaches two squares but the second is off the board");
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
      ,
      merges: [
        { c: 3, r: 5, in: "NE" },
        { c: 8, r: 6, in: "SW" }
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
        " w. bv .. .. .. bv b^ .. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> b> b> b> b> b> bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. B> B> B> B> B> B> B> B> Bv bv ..|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " .. B^ b> b> b> b> b> b> bv Bv bv .. ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        "|.. B^ b^ B> B> B> B> Bv bv Bv bv ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< B^ b^ B^|b> o. o. Bv bv|Bv bv b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " B> B^ b^|B^ b^ o. o. B<|bv Bv bv .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. B^ b^ B^ b^ b< b< b< b< Bv bv ..|",
        "+  +  +  +  +  +--+  +  +  +  +  +  +",
        " W. B^ b^ B^ B< B< B< B< B< B< bv .. ",
        "+  +  +  +  +  +  +--+  +  +  +  +  +",
        "|.. B^ b^ b< b< b< b< b< b< b< b< ..|",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " B> B^ B< B< B< B< B< B< B< B< B< .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. B^ .. .. .. B^ w. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 4, r: 5, d: "E", n: 1 },
        { c: 3, r: 6, d: "E", n: 1 },
        { c: 5, r: 7, d: "N", n: 1 },
        { c: 6, r: 8, d: "N", n: 1 }
      ]
      ,
      merges: [
        { c: 1, r: 1, in: "N" },
        { c: 5, r: 1, in: "NW" },
        { c: 10, r: 1, in: "EW" },
        { c: 1, r: 2, in: "S" },
        { c: 9, r: 2, in: "W" },
        { c: 2, r: 3, in: "S" },
        { c: 8, r: 3, in: "W" },
        { c: 3, r: 4, in: "S" },
        { c: 7, r: 4, in: "W" },
        { c: 4, r: 5, in: "S" },
        { c: 10, r: 5, in: "NE" },
        { c: 1, r: 6, in: "SW" },
        { c: 7, r: 6, in: "N" },
        { c: 4, r: 7, in: "E" },
        { c: 8, r: 7, in: "N" },
        { c: 3, r: 8, in: "E" },
        { c: 9, r: 8, in: "N" },
        { c: 2, r: 9, in: "E" },
        { c: 10, r: 9, in: "N" },
        { c: 1, r: 10, in: "EW" },
        { c: 6, r: 10, in: "ES" },
        { c: 10, r: 10, in: "S" }
      ]
      ,
      pushers: [
        { c: 2, r: 0, d: "S", regs: [2, 4] },
        { c: 4, r: 0, d: "S", regs: [1, 3, 5] },
        { c: 7, r: 0, d: "S", regs: [1, 3, 5] },
        { c: 9, r: 0, d: "S", regs: [2, 4] },
        { c: 0, r: 2, d: "E", regs: [2, 4] },
        { c: 11, r: 2, d: "W", regs: [2, 4] },
        { c: 0, r: 4, d: "E", regs: [1, 3, 5] },
        { c: 11, r: 4, d: "W", regs: [1, 3, 5] },
        { c: 0, r: 7, d: "E", regs: [1, 3, 5] },
        { c: 11, r: 7, d: "W", regs: [1, 3, 5] },
        { c: 0, r: 9, d: "E", regs: [2, 4] },
        { c: 11, r: 9, d: "W", regs: [2, 4] },
        { c: 2, r: 11, d: "N", regs: [2, 4] },
        { c: 4, r: 11, d: "N", regs: [1, 3, 5] },
        { c: 7, r: 11, d: "N", regs: [1, 3, 5] },
        { c: 9, r: 11, d: "N", regs: [2, 4] }
      ]
    },

    /* THE THIRD CRASH AND BURN BOARD, and the one the expansion was
       really built for: every element the 1997 box added is on it.

       Two pairs of portals -- violet and green -- eight flamethrowers
       on register sets of their own, four oil spills of nineteen
       squares between them, four pits and four tool plates. Unlike E
       and F -- both reprints, of Island and Maelstrom -- it carries NO
       perimeter wall at all; every wall on it is
       interior, and six of those are the bars the flamethrowers are
       bolted to.

       Read by measurement and then verified square by square in the
       board workshop against the rectified photograph. Three things
       nearly escaped the automated pass and are worth knowing about if
       G ever needs re-reading. The violet portals are small enough
       against their tile that the tile's MEAN colour is not violet at
       all -- only a per-pixel test finds them. Two of the pits were
       swallowed by the oil filter, because a pit is dark too; what
       separates them is the hazard border on the rim. And all four
       tool plates were missed outright, and were found by rendering a
       labelled grid and reading it.

       The 2/3/5 flame spans two squares -- nozzle in one, blob in the
       next -- so both are burner squares here, each with the same
       register set. */
    boardG: {
      name: "Board G", w: 12, h: 12, edition: "classic", set: "crashAndBurn", origin: "transcribed",
      notes: "Transcribed from the printed board; verified by hand against the photograph.",
      pic: [
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. bv .. .. .. b> b^ .. .. .. b^ w. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< o. .. .. L. .. .. .. .. t2 L. b< ",
        "+  +  +--+--+  +  +  +  +--+  +  +  +",
        " .. t1|.. .. L. .. o. .. .. .. L. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. ..|L. .. .. .. .. ..|.. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. .. L. bv b< b< L. L. W. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b< b< .. .. L. bv .. b^ b< .. .. bv ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b> b^ .. W. .. b> b> b> b^ .. .. b> ",
        "+  +  +  +  +  +  +  +  +--+  +  +  +",
        " .. .. .. .. L. L. L. L. .. .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. w.|.. .. .. .. .. .. .. ..|t1 .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. t2 .. .. o. .. L. .. ..|.. .. ",
        "+  +  +  +--+  +  +  +  +--+  +  +  +",
        " b> .. L. L. L. .. .. L. .. .. o. b> ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. bv .. .. .. bv b< L. .. .. b^ .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +"
      ],
      lasers: []
      ,
      merges: [
        { c: 5, r: 0, in: "N" },
        { c: 6, r: 0, in: "W" },
        { c: 5, r: 4, in: "E" },
        { c: 7, r: 4, in: "S" },
        { c: 1, r: 5, in: "S" },
        { c: 7, r: 5, in: "E" },
        { c: 8, r: 5, in: "S" },
        { c: 11, r: 5, in: "E" },
        { c: 1, r: 6, in: "W" },
        { c: 5, r: 6, in: "N" },
        { c: 8, r: 6, in: "W" },
        { c: 11, r: 6, in: "N" },
        { c: 5, r: 11, in: "E" },
        { c: 6, r: 11, in: "S" }
      ]
      ,
      burners: [
        { c: 8, r: 2, d: "S", regs: [1, 3, 5] },
        { c: 3, r: 3, d: "W", regs: [2, 3, 5], len: 2 },
        { c: 9, r: 3, d: "W", regs: [2, 4] },
        { c: 8, r: 7, d: "S", regs: [2, 3, 4] },
        { c: 2, r: 8, d: "E", regs: [2, 3] },
        { c: 9, r: 8, d: "W", regs: [1, 5] },
        { c: 3, r: 9, d: "N", regs: [1, 3, 5] }
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
        { c: 6, r: 3, d: "S", n: 1 },
        { c: 6, r: 6, d: "S", n: 1 }
      ]
      ,
      merges: [
        { c: 6, r: 0, in: "E" },
        { c: 7, r: 0, in: "S" },
        { c: 10, r: 1, in: "ES" },
        { c: 4, r: 2, in: "E" },
        { c: 5, r: 2, in: "N" },
        { c: 9, r: 2, in: "S" },
        { c: 10, r: 2, in: "W" },
        { c: 3, r: 4, in: "E" },
        { c: 4, r: 4, in: "N" },
        { c: 9, r: 4, in: "E" },
        { c: 10, r: 4, in: "S" },
        { c: 3, r: 5, in: "N" },
        { c: 7, r: 5, in: "E" },
        { c: 8, r: 5, in: "S" },
        { c: 10, r: 5, in: "E" },
        { c: 8, r: 7, in: "E" },
        { c: 9, r: 7, in: "S" },
        { c: 4, r: 9, in: "E" },
        { c: 6, r: 9, in: "S" },
        { c: 1, r: 10, in: "W" },
        { c: 9, r: 10, in: "E" },
        { c: 10, r: 10, in: "S" },
        { c: 4, r: 11, in: "N" },
        { c: 5, r: 11, in: "W" }
      ]
    },

    /* THE FIFTH TRANSCRIBED OFFICIAL BOARD.

       Named for the hole in the middle: five pit squares in a plus --
       (6,5), (5,6), (6,6), (7,6), (6,7) -- printed as ONE cross-shaped
       opening. Count it as five pits, not one, the same care Island's
       L-shaped holes need. Eleven pits in all.

       Two full-width belt lanes run west then east across the middle
       (rows 6 and 7) and two full-height lanes run down and up the
       middle (columns 6 and 7), so the board is a crossroads with the
       hole sitting in the junction.

       Every arrow is SOLID: no express conveyors, every belt speed 1.
       No gears and no pushers.

       Forty-five walls -- the same sixteen-wall frame Exchange, Island
       and Pit Maze carry (columns 3/5/8/10 top and bottom, rows 3/5/8/10
       left and right) plus twenty-nine interior.

       THE FRAME WALL AT (1,10)W IS PRINTED ALMOST ENTIRELY OUTSIDE THE
       PLAYING GRID. Clipped to the squares it scores 0.48 where the
       other three west-frame walls score 0.97-1.00, which reads exactly
       like "no wall". It is the same thing the note above `island`
       records about that board's top row, and it is not resolvable by
       arguing from the frame's symmetry -- Exchange has two frame walls
       that are not where symmetry would put them. It was settled by
       rectifying again with a margin OUTSIDE the grid and measuring the
       rim: rows 3/5/8/10 carry 15-17% yellow there and every other row
       carries 0-3%.

       FOUR lasers, and the one on column 9 does TWO damage -- two
       barrels on one wall mount throwing two parallel beams, which is
       how the printed board draws a 2-damage laser. Both of its beams
       are off the cell centre line, so a scan that samples only the
       middle of each square finds the other three lasers and misses
       this one completely. Sample the full cell width. */
    cross: {
      name: "Cross", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      notes: "Transcribed from the printed board.",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " .. bv .. .. .. bv b^ .. .. .. b^ w. ",
        "+  +  +  +  +  +  +  +  +--+--+  +  +",
        " .. b> b> b> b> bv b^ .. .. ..|b^ b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|.. .. .. .. .. bv b^|.. .. o. .. ..|",
        "+  +  +  +  +--+  +  +  +  +  +  +  +",
        " .. ..|.. W.|bv b< b^|.. .. .. .. .. ",
        "+  +--+  +--+  +  +  +--+--+  +--+  +",
        "|.. o. o.|bv b< o. b^ b< .. .. .. ..|",
        "+  +  +  +  +  +  +  +  +  +--+  +  +",
        " b< b< b< b< o. o. o. b^ b< b< b< b< ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b> b> b> b> bv o. b> b> b> b> b> b> ",
        "+  +  +--+  +  +  +  +--+  +  +  +  +",
        "|.. .. .. .. b> bv b^|.. .. .. .. ..|",
        "+  +--+  +--+--+  +  +  +  +  +--+  +",
        " .. ..|.. ..|.. bv b^|.. ..|o. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        "|w. .. .. .. .. bv b^ ..|.. .. .. ..|",
        "+  +  +--+  +  +  +  +  +  +  +  +  +",
        " b> bv o. .. .. bv b^ b< b< b< b< .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " o. bv .. .. .. bv b^ ..|.. .. b^ .. ",
        "+  +  +--+  +--+  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 4, r: 2, d: "N", n: 1 },
        { c: 8, r: 3, d: "N", n: 2 },
        { c: 2, r: 8, d: "E", n: 1 },
        { c: 7, r: 8, d: "E", n: 1 }
      ]
      ,
      merges: [
        { c: 1, r: 1, in: "N" },
        { c: 5, r: 1, in: "NW" },
        { c: 10, r: 1, in: "E" },
        { c: 4, r: 3, in: "E" },
        { c: 5, r: 3, in: "N" },
        { c: 3, r: 4, in: "E" },
        { c: 4, r: 4, in: "N" },
        { c: 6, r: 4, in: "E" },
        { c: 7, r: 4, in: "S" },
        { c: 3, r: 5, in: "N" },
        { c: 7, r: 5, in: "E" },
        { c: 4, r: 6, in: "W" },
        { c: 6, r: 6, in: "S" },
        { c: 4, r: 7, in: "N" },
        { c: 5, r: 7, in: "W" },
        { c: 1, r: 10, in: "W" },
        { c: 6, r: 10, in: "ES" },
        { c: 10, r: 10, in: "S" }
      ]
    },

    /* The start area. Robots enter the course from here, so it is
       laid out with position 1 nearest the middle and the numbers
       fanning outward, the way the printed bay does.

       AUTHORED, not transcribed: the real bay's exact belt layout
       is not reproduced here. Replace this with a transcription
       when reference material is available; nothing in the engine
       depends on its contents beyond the eight numbered squares. */

    /* BOARD H, the flamethrower board -- sixteen burners, more than the rest
       of the expansion put together. Transcribed from a photograph.

       IT IS THE BOARD THAT MOVED PUSHERS OUT OF THE PICTURE. Nine of its
       thirteen rams stand on a conveyor: the belt carries you along and the
       ram on the wall shoves you across it, both in the same register. While
       a pusher WAS the square, the transcriber had to choose which of the two
       the square was, and the board came out wrong either way.

       The draft made before that change lost all nine of those conveyors, and
       lost two rams outright -- at (7,3) and (4,11). Both were found by
       reading the photograph at magnification, and both are corroborated by
       the draft's own wall lattice, which already carried a mount at each of
       those edges with nothing standing on it. A wall in open floor holding
       up nothing is the anomaly that says a ram was missed.

       Four register sets are the least certain readings on the board and are
       marked in maps/MANIFEST.md rather than here, because a note in the
       source would outlive the doubt. */
    boardH: {
      name: "Board H", w: 12, h: 12, edition: "classic", set: "crashAndBurn", origin: "transcribed",
      pic: [
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. bv .. W. .. ..|b^ .. bv .. .. .. ",
        "+  +  +  +--+  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> b> b^ .. bv ..|bv b< ",
        "+  +--+  +  +--+  +--+  +  +  +  +  +",
        " .. .. .. .. .. .. .. .. bv .. bv .. ",
        "+  +  +  +--+  +  +  +--+  +  +  +  +",
        " b> b> b> b> b> b> b> b> bv|.. bv|W. ",
        "+  +  +  +  +--+  +  +  +  +  +  +  +",
        " .. .. .. .. .. .. .. ..|bv ..|bv .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. b> b> b> b> bv w. .. bv .. bv .. ",
        "+--+  +  +  +  +  +  +  +  +  +  +--+",
        " b> b^ .. .. .. bv o. o. bv .. b> b> ",
        "+  +  +--+  +  +  +  +  +  +  +  +  +",
        " .. .. .. W. .. b> b> b> bv|.. .. o. ",
        "+  +  +  +  +  +  +  +--+  +  +  +  +",
        " b< b< b< b< .. .. .. .. bv b< b< b< ",
        "+  +  +--+  +  +  +  +  +  +--+  +  +",
        " .. .. .. b^|.. .. .. .. bv .. .. .. ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " b> b> b> b^ ..|.. o. .. bv .. w. b> ",
        "+  +  +  +  +  +  +  +  +  +  +  +  +",
        " .. .. .. b^ .. .. b^ .. bv .. b^ .. ",
        "+--+  +  +  +--+  +  +  +  +  +  +  +"
      ],
      lasers: []
      ,
      merges: [
        { c: 1, r: 1, in: "N" },
        { c: 6, r: 1, in: "W" },
        { c: 10, r: 1, in: "E" },
        { c: 8, r: 3, in: "NW" },
        { c: 1, r: 5, in: "S" },
        { c: 5, r: 5, in: "W" },
        { c: 1, r: 6, in: "W" },
        { c: 10, r: 6, in: "N" },
        { c: 5, r: 7, in: "N" },
        { c: 8, r: 7, in: "NW" },
        { c: 3, r: 8, in: "S" },
        { c: 8, r: 8, in: "NE" },
        { c: 3, r: 10, in: "SW" }
      ]
      ,
      pushers: [
        { c: 3, r: 1, d: "S", regs: [1, 2, 3, 4] },
        { c: 9, r: 1, d: "W", regs: [] },
        { c: 1, r: 2, d: "S", regs: [] },
        { c: 6, r: 2, d: "S", regs: [2, 3, 5] },
        { c: 4, r: 3, d: "N", regs: [1, 2, 3, 4] },
        { c: 7, r: 3, d: "S", regs: [1, 2, 3, 5] },
        { c: 10, r: 3, d: "W", regs: [2, 3, 4, 5] },
        { c: 8, r: 4, d: "E", regs: [2, 3, 4, 5] },
        { c: 7, r: 7, d: "N", regs: [1, 2, 3, 4] },
        { c: 2, r: 8, d: "N", regs: [1, 3, 5] },
        { c: 9, r: 8, d: "N", regs: [2, 5] },
        { c: 3, r: 9, d: "W", regs: [2, 3, 4, 5] },
        { c: 4, r: 11, d: "N", regs: [1, 3, 5] }
      ]
      ,
      burners: [
        { c: 5, r: 0, d: "W", regs: [1, 2, 3, 4] },
        { c: 3, r: 2, d: "N", regs: [2, 3, 5] },
        { c: 4, r: 2, d: "S", regs: [2, 3, 5] },
        { c: 9, r: 3, d: "E", regs: [1, 2, 4] },
        { c: 4, r: 4, d: "S", regs: [1, 3, 5] },
        { c: 7, r: 4, d: "W", regs: [2, 4] },
        { c: 9, r: 4, d: "W", regs: [1, 2, 4] },
        { c: 0, r: 5, d: "N", regs: [2, 5] },
        { c: 11, r: 5, d: "N", regs: [2, 5] },
        { c: 2, r: 7, d: "S", regs: [2, 4] },
        { c: 9, r: 7, d: "E", regs: [2, 4] },
        { c: 7, r: 8, d: "S", regs: [2, 3, 4] },
        { c: 2, r: 9, d: "S", regs: [1, 5] },
        { c: 4, r: 9, d: "E", regs: [1, 5] },
        { c: 4, r: 10, d: "W", regs: [2, 4] },
        { c: 0, r: 11, d: "N", regs: [2, 5] }
      ]
    },

    /* CANNERY ROW -- FIRST PASS, NOT YET VERIFIED.

       Transcribed from IMG_1169, rectified with the corners recorded in
       maps/MANIFEST.md. The cells are read by eye off the rectified
       photograph; the walls are wallscan.py at its calibrated cut; the
       presses are the numbered discs, which is what this board was
       blocked on for so long -- they are PRESSES, identified from the
       Crash and Burn factory-floor reference, active in the registers
       printed on them.

       EVERY PRESS HERE STANDS ON A CONVEYOR, which is why presses
       stopped being cell elements: the roller beds run straight under
       the disc and the belt's own arrow shows across it.

       The seven lasers are from laserscan.py, which finds beams by
       their colour -- red is the one colour nothing else on a classic
       board uses -- and every mount's wall was confirmed against the
       wall scan independently.

       The two pushers on the north wall of row 5 are read off their
       plates -- 2/4 at (8,5) and 1/3/5 at (9,5).

       ONE WALL WAS HIDDEN BY A PIT. (9,8) is a pit, and a pit's hazard
       rim sits on the same lattice edge as the wall below it, so the
       wall scan read 0.43 on the north edge of (9,9) -- inside the band
       this project already records for a rim rather than for a bar. At
       magnification the photograph shows two separate bars, and the
       two-beam laser under it stops dead there, which it could not do
       without a wall.

       WHAT IS NOT IN HERE, and is known to be missing rather than
       absent from the board: THREE MORE PUSHERS, at (8,9) on its west
       wall, (10,9) on its east wall and (5,10) on its west wall. All
       three are plainly on the photograph, all three have their mount
       wall confirmed by the wall scan, and the direction each faces is
       clear. What cannot be read is their REGISTER SETS: at 120 pixels
       to a square the plates give up about fifteen pixels of digit.
       (8,9) shows a 2 and (5,10) a 3; (10,9) gives nothing. A set half
       read is worse than one absent, so they wait for a close-up.

       Express against normal conveyor is read from the roller colour --
       silver for express, copper for normal -- and is the likeliest
       thing to be wrong on this pass. */
    /* `unverified` is load-bearing: it keeps this board out of the course
       assembler and out of the quick games, so nobody can race a map that
       has not been checked against the photograph. It opens in the
       workshop, which is where checking it happens. Drop the marker when
       the second pass lands. */
    canneryRow: {
      name: "Cannery Row", w: 12, h: 12, edition: "classic", set: "base", origin: "transcribed",
      notes: "Checked square by square against the photograph and confirmed. The five rams, their facings and their registers were read off the board itself.",
      pic: [
        "+  +  +--+  +--+  +  +--+  +--+  +  +",
        " B> B> B> B> bv b< o. .. .. .. ..|Bv ",
        "+  +  +--+  +  +  +  +  +  +--+  +  +",
        " .. .. .. .. bv bv b< .. .. ..|w. Bv ",
        "+  +--+  +  +  +  +  +  +  +  +  +  +",
        "|.. ..|..|.. bv o. b^ ..|..|.. .. Bv|",
        "+  +  +  +  +  +--+  +  +  +--+  +  +",
        " ..|.. .. ..|bv .. b^ .. .. .. .. Bv ",
        "+  +  +--+  +  +--+  +  +--+  +--+  +",
        "|.. .. .. .. bv b> b^ .. .. .. ..|Bv|",
        "+  +--+  +--+  +  +  +  +--+--+  +  +",
        " .. .. .. W. bv b< b^ B< B< B< B< B< ",
        "+  +  +--+  +  +  +  +  +  +  +  +  +",
        " B> B> B> B> bv b> b^ .. B> Bv .. b> ",
        "+  +--+  +--+  +  +  +  +  +  +  +  +",
        "|B^|.. .. .. bv b< b^ .. .. Bv .. b^|",
        "+  +  +--+  +  +  +  +  +  +  +--+  +",
        " B^ .. ..|..|bv W. b^ .. .. o. .. b^ ",
        "+  +--+  +  +  +--+  +--+  +--+  +  +",
        "|B^ ..|.. .. bv .. b^ ..|.. .. ..|b^|",
        "+  +  +  +--+  +  +  +  +  +--+  +  +",
        " B^ w. .. ..|bv|.. b^ .. .. W.|.. b^ ",
        "+  +  +--+  +  +  +  +  +--+  +--+  +",
        " B^ .. .. .. b> bv b^ B< B< B< B< B< ",
        "+  +  +--+  +  +  +  +--+  +--+  +  +"
      ],
      lasers: [
        { c: 9, r: 0, d: "N", n: 3 },
        { c: 2, r: 2, d: "W", n: 2 },
        { c: 8, r: 2, d: "W", n: 1 },
        { c: 5, r: 3, d: "N", n: 1 },
        { c: 9, r: 3, d: "S", n: 1 },
        { c: 2, r: 4, d: "S", n: 1 },
        { c: 1, r: 5, d: "S", n: 1 },
        { c: 3, r: 8, d: "E", n: 1 },
        { c: 9, r: 9, d: "N", n: 2 },
        { c: 4, r: 10, d: "E", n: 1 }
      ]
      ,
      merges: [
        { c: 1, r: 0, in: "NW" },
        { c: 4, r: 0, in: "EW" },
        { c: 5, r: 0, in: "N" },
        { c: 5, r: 1, in: "E" },
        { c: 6, r: 1, in: "S" },
        { c: 11, r: 1, in: "NE" },
        { c: 6, r: 4, in: "SW" },
        { c: 4, r: 5, in: "NE" },
        { c: 6, r: 5, in: "SE" },
        { c: 11, r: 5, in: "NE" },
        { c: 0, r: 6, in: "SW" },
        { c: 4, r: 6, in: "NW" },
        { c: 6, r: 6, in: "SW" },
        { c: 9, r: 6, in: "W" },
        { c: 11, r: 6, in: "S" },
        { c: 4, r: 7, in: "NE" },
        { c: 11, r: 8, in: "SE" },
        { c: 0, r: 10, in: "SW" },
        { c: 4, r: 11, in: "N" },
        { c: 5, r: 11, in: "W" },
        { c: 6, r: 11, in: "SE" },
        { c: 10, r: 11, in: "SE" }
      ]
      ,
      pushers: [
        { c: 8, r: 5, d: "S", regs: [2, 4] },
        { c: 9, r: 5, d: "S", regs: [1, 3, 5] },
        { c: 10, r: 9, d: "W", regs: [1] },
        { c: 5, r: 10, d: "E", regs: [3] },
        { c: 8, r: 9, d: "E", regs: [2] }
      ]
      ,
      timers: [
        { c: 4, r: 1, regs: [1, 5] },
        { c: 4, r: 3, regs: [2, 4] },
        { c: 4, r: 5, regs: [3] },
        { c: 4, r: 7, regs: [2, 4] },
        { c: 4, r: 9, regs: [1, 5] },
        { c: 6, r: 2, regs: [1, 5] },
        { c: 6, r: 4, regs: [2, 4] },
        { c: 6, r: 6, regs: [3] },
        { c: 6, r: 8, regs: [2, 4] },
        { c: 6, r: 10, regs: [1, 5] }
      ]
    },

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
     where the flags go. Flags are tokens, not printed elements --
     keeping them here is what lets one board serve many courses.

     TWO KINDS, and the menu is grouped by them rather than by which
     box the boards came out of.

     `quick` is ONE BOARD with its flags already down: the shortest
     distance between wanting a game and having one. There is exactly
     one per transcribed board, named after the board, because that is
     what it is -- the menu used to dress these up as named courses,
     which implied a provenance they do not have.

     `track` is the larger thing: two, three or four boards. The
     rulebook's own Sample Race Tracks section (pp.44-47) is where the
     idea comes from, and its standard configurations -- 1x2, 2x2,
     1x3 -- are what these are built on.

     WHERE THE FLAGS GO IS EACH TRACK'S OWN BUSINESS. A track is
     copied from a manual or built by hand, and both put flags where
     the track puts them; nothing here says how many land on each
     board. What a flag may sit ON is a different question and is
     checked: see below.

     THE PRINTED SAMPLE TRACKS THEMSELVES ARE NOT HERE, and cannot be
     until the boards they use are. Five of the twelve classic boards
     are transcribed; every sample track in the book lays down two to
     four, and identifying an untranscribed board from a halftone
     reproduction and then counting flag squares off it is exactly the
     eyeballed guess this project does not ship. These layouts are
     ours, over transcribed boards, and say so -- the same standing as
     exchangeRun. The printed ones land when their boards do.

     Every flag below was CHOSEN FROM THE DATA rather than off a
     picture: plain floor, never the starting block, never the outer
     ring of a board, nothing wall-mounted standing on it, seven
     squares clear of every other flag, and within Northrup's twelve
     of the flag before it.
     ============================================================ */
  var COURSES = {
    exchangeRun: {
      name: "Exchange",
      kind: "quick",
      blurb: "Everything moves. The walls are the only place to stand.",
      boards: [{ id: "exchange", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[9, 2], [2, 9], [7, 7]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course -- same reason as Exchange:
       the course cards have not been photographed. Flag 2 used to
       stand on column zero and all three sat within four squares of
       each other, which is a lap of the middle rather than a race. */
    islandRun: {
      name: "Island",
      kind: "quick",
      blurb: "Two rings turning against each other, and a hole in the middle.",
      boards: [{ id: "island", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[4, 4], [10, 3], [3, 10]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course. Every flag here is on the
       board's outer ring, against the usual preference, because this
       board has NO plain floor anywhere else: thirty-one floor squares
       and all thirty-one are on the rim. The alternative is a flag on
       a belt that carries the robot straight off it. */
    maelstromRun: {
      name: "Maelstrom",
      kind: "quick",
      blurb: "Everything spirals inward, and the middle is a hole.",
      boards: [{ id: "maelstrom", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[3, 0], [11, 6], [5, 11]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course. All three on plain floor and
       clear of the spills, so reaching one is not a matter of luck with
       an oil slide. */
    canneryRowRun: {
      name: "Cannery Row",
      kind: "quick",
      blurb: "Two belt lanes run the whole length of it, with a crusher on every other square.",
      boards: [{ id: "canneryRow", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[2, 9], [8, 3], [7, 7]],
      minPlayers: 2, maxPlayers: 8
    },
    boardGRun: {
      name: "Board G",
      kind: "quick",
      blurb: "Portals, flamethrowers and four spills of oil.",
      boards: [{ id: "boardG", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[2, 1], [10, 5], [6, 10]],
      minPlayers: 2, maxPlayers: 8
    },

    pitMazeRun: {
      name: "Pit Maze",
      kind: "quick",
      blurb: "Twenty-six holes and the belts that run between them.",
      boards: [{ id: "pitMaze", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      /* Flag 3 was on column eleven with a clear inner square beside it. */
      flags: [[8, 2], [2, 7], [10, 9]],
      minPlayers: 2, maxPlayers: 8
    },

    /* Flags ours, not the printed course -- same reason as the others:
       the course cards have not been photographed. All three are on
       plain floor, clear of the belt lanes and the central hole. */

    /* Flags ours, not the printed course -- the course cards have not been
       photographed. All three on plain floor and clear of a burner's square,
       because on this board "somewhere safe to stand" is the scarce thing.

       Flag 2 used to stand on a CONVEYOR, which is not somewhere to
       stand at all -- the belt moves the robot off it at the end of
       every register. Flag 1 was on the top rim. */
    boardHRun: {
      name: "Board H",
      kind: "quick",
      blurb: "Sixteen flamethrowers and a conveyor under half the rams.",
      boards: [{ id: "boardH", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[2, 2], [10, 7], [5, 9]],
      minPlayers: 2, maxPlayers: 8
    },

    crossRun: {
      name: "Cross",
      kind: "quick",
      blurb: "Four belt lanes meet, and the junction is a hole.",
      boards: [{ id: "cross", rot: 0, at: [0, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[1, 2], [10, 7], [3, 10]],
      minPlayers: 2, maxPlayers: 8
    },

    bigCross: {
      name: "Crosscut",
      kind: "track",
      blurb: "Four belt lanes on one side, twenty-six holes on the other.",
      boards: [{ id: "cross", rot: 0, at: [0, 0] }, { id: "pitMaze", rot: 2, at: [12, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 12] },
      flags: [[3, 2], [15, 2], [3, 9]],
      minPlayers: 2, maxPlayers: 8
    },

    /* 1x3, the long one: out along the top, across the middle, and
       back down the far end. The block sits under the MIDDLE board, so
       the first flag is a genuine choice of direction rather than a
       queue. Pit Maze comes in upside down, so its belts run into the
       Exchange's rather than alongside them. */
    longHaul: {
      name: "The Long Haul",
      kind: "track",
      blurb: "Three floors end to end, and the starting block in the middle of them.",
      boards: [{ id: "cross", rot: 0, at: [0, 0] },
               { id: "exchange", rot: 1, at: [12, 0] },
               { id: "pitMaze", rot: 2, at: [24, 0] }],
      dock: { id: "dockingBay", rot: 0, at: [12, 12] },
      flags: [[33, 2], [21, 9], [9, 3]],
      minPlayers: 2, maxPlayers: 8
    },

    /* 2x2, and the flags go round it in an order that crosses the
       middle twice. */
    fourQuarters: {
      name: "Four Quarters",
      kind: "track",
      blurb: "Two by two, and the crossing is the hard part.",
      boards: [{ id: "exchange", rot: 0, at: [0, 0] }, { id: "cross", rot: 1, at: [12, 0] },
               { id: "pitMaze", rot: 0, at: [0, 12] }, { id: "island", rot: 3, at: [12, 12] }],
      dock: { id: "dockingBay", rot: 0, at: [0, 24] },
      flags: [[8, 4], [19, 16], [7, 21], [19, 9]],
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
      var p = parts[i], g = rotateGrid(parsePic(p.id, specOf(p.id)), p.rot);
      w = Math.max(w, p.at[0] + g.w);
      h = Math.max(h, p.at[1] + g.h);
    }
    return { w: w, h: h };
  }

  function stamp(C, g, at) {
    var ox = at[0], oy = at[1], c, r, d;
    for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) {
      C.cell[idx(C, ox + c, oy + r)] = g.cell[idx(g, c, r)];
      for (d = 0; d < 4; d++) {
        if (wallAt(g, c, r, d)) setWall(C, ox + c, oy + r, d, true);
        var dch2 = doorAt(g, c, r, d);
        if (dch2) setDoor(C, ox + c, oy + r, d, dch2);
      }
    }
    for (var i = 0; i < g.lasers.length; i++) {
      var L = g.lasers[i];
      C.lasers.push({ c: L.c + ox, r: L.r + oy, d: L.d, n: L.n });
    }
    for (var uu = 0; uu < (g.pushers || []).length; uu++) {
      var U3 = g.pushers[uu];
      C.pushers.push({ c: U3.c + ox, r: U3.r + oy, d: U3.d, regs: U3.regs.slice() });
    }
    for (var ff = 0; ff < (g.burners || []).length; ff++) {
      var F3 = g.burners[ff];
      C.burners.push({ c: F3.c + ox, r: F3.r + oy, d: F3.d, regs: F3.regs.slice(), len: F3.len });
    }
    for (var tt = 0; tt < (g.timers || []).length; tt++) {
      var T3 = g.timers[tt];
      C.timers.push({ c: T3.c + ox, r: T3.r + oy, regs: T3.regs.slice() });
    }
    for (var j = 0; j < g.docks.length; j++) {
      var D = g.docks[j];
      C.docks.push({ c: D.c + ox, r: D.r + oy, n: D.n });
    }
  }

  /* A COURSE IS A SPEC, NOT A NAME.

     Everything here took a key into COURSES, which is fine while every
     course ships with the game and impossible the moment a player
     builds one. A composed course has no key -- it has boards,
     rotations, offsets and flags, and that object IS the course. So
     every entry point takes either: a string is looked up, an object
     is used as it stands.

     The shipped table is untouched by this. It is still the list of
     courses the box prints; it is simply no longer the only place a
     course can come from. */
  function courseSpec(x) {
    if (x && typeof x === "object") return x;
    var spec = COURSES[x];
    if (!spec) throw new Error("no such course: " + x);
    return spec;
  }

  function buildCourse(id) {
    var spec = courseSpec(id);
    var C, i;
    /* A COURSE EDITED AS A WHOLE.

       Ordinarily a course is boards stamped onto an empty grid, and
       the boards are the truth. Once somebody has moved a pit on the
       assembled course that stops being so: the edit belongs to the
       course and to no board on it, and stamping the boards again
       would throw it away. So an edited course carries its own
       picture and is parsed straight from that. The board list stays
       beside it, because "what was this made of" is still worth
       knowing and the editions are read from the picture either way. */
    if (spec.grid) {
      C = parsePic(spec.id || "composed", spec.grid);
      C.id = typeof id === "string" ? id : (spec.id || "composed");
      C.name = spec.name;
      C.flags = [];
      for (i = 0; i < spec.flags.length; i++) {
        C.flags.push({ c: spec.flags[i][0], r: spec.flags[i][1], n: i + 1 });
      }
      C.docks.sort(function (a, z) { return a.n - z.n; });
      return C;
    }
    var b = courseBounds(spec);
    C = blankGrid(b.w, b.h);
    C.id = typeof id === "string" ? id : (spec.id || "composed");
    C.name = spec.name;
    C.flags = [];
    for (i = 0; i < spec.boards.length; i++) {
      var p = spec.boards[i];
      stamp(C, rotateGrid(parsePic(p.id, specOf(p.id)), p.rot), p.at);
    }
    if (spec.dock) stamp(C, rotateGrid(parsePic(spec.dock.id, specOf(spec.dock.id)), spec.dock.rot), spec.dock.at);
    C.edition = specOf(spec.boards[0].id).edition || "classic";
    for (var f = 0; f < spec.flags.length; f++) {
      C.flags.push({ c: spec.flags[f][0], r: spec.flags[f][1], n: f + 1 });
    }
    C.docks.sort(function (a, z) { return a.n - z.n; });
    return C;
  }

  /* ============================================================
     COMPOSING A COURSE FROM A LAYOUT

     A layout is a set of boards placed around the STARTING BLOCK.
     The block is the anchor and never moves: everything else is
     described relative to it, so "where does this board sit" has one
     answer rather than one per screen.

     Two units, and they are not the same unit, which is the whole
     point of the model. A board is 12x12 and the dock is 12x4, so
     VERTICALLY a board can only sit whole rows above the block --
     `row` counts up from it, row 0 resting on it. HORIZONTALLY a board
     may sit half a board over, because a start area under the seam
     between two boards is a real course and one of the shipped ones
     does it. So `x` is in HALF boards: a board at x covers half-board
     columns x and x+1, and the block covers 0 and 1.

     Everything else falls out of those two numbers. Two boards in the
     same row overlap unless they are two half-boards apart. Two boards
     in adjacent rows never overlap, and touch along 12 squares if they
     are aligned and 6 if one is half over. Boards two apart in
     different rows meet at a corner, which is not a join -- nothing
     can drive across it.

     Flags cannot be chosen until the course exists, because "a legal
     square" is a question about the assembled board. So this builds a
     scratch course with no flags, picks on that, and returns a spec
     that carries them -- one object, reproducible, and safe to put in
     a save.
     ============================================================ */

  /* A THREE BY THREE OF SLOTS, AND THE BLOCK UNDER ONE COLUMN.

     Boards are aligned. Every board is 12x12 and sits squarely in a
     slot, so a slot IS a board position and there is nothing to fit --
     which is the point of going back to a grid after trying free
     placement: half a board over reads as a mistake far more often
     than it reads as a course, and every rule about it (what touches
     what, what covers the block, what a corner means) existed only to
     describe arrangements nobody wanted.

     The block goes under the bottom row, in one of the three columns.
     It is 12 wide and so is a board, so the column above it is either
     filled or it is not -- there is no half-covered start area any
     more, and no rule about one.

     The grid is cropped to the boards actually in it, so a course made
     of the two bottom-left slots is 24 by 12 and not 36 by 36 with
     holes. */
  var LAY_COLS = 3, LAY_ROWS = 3, LAY_BOARDS = LAY_COLS * LAY_ROWS;

  function layCells(layout) {
    var cells = (layout && layout.cells) || [];
    var out = [];
    for (var i = 0; i < LAY_BOARDS; i++) out.push(cells[i] || null);
    return out;
  }

  function layAt(cells, c, r) {
    if (c < 0 || r < 0 || c >= LAY_COLS || r >= LAY_ROWS) return null;
    return cells[r * LAY_COLS + c] || null;
  }

  /* The box the boards actually occupy, or null for an empty grid. */
  function laySpan(cells) {
    var c0 = LAY_COLS, c1 = -1, r0 = LAY_ROWS, r1 = -1, n = 0, c, r;
    for (r = 0; r < LAY_ROWS; r++) {
      for (c = 0; c < LAY_COLS; c++) {
        if (!layAt(cells, c, r)) continue;
        n++;
        if (c < c0) c0 = c;
        if (c > c1) c1 = c;
        if (r < r0) r0 = r;
        if (r > r1) r1 = r;
      }
    }
    return n ? { c0: c0, c1: c1, r0: r0, r1: r1, n: n,
                 cols: c1 - c0 + 1, rows: r1 - r0 + 1 } : null;
  }

  /* Every board reachable from the first along an edge, so a layout is
     one course rather than two courses in the same picture. Corners do
     not join: nothing can drive across one. */
  function layConnected(cells) {
    var sp = laySpan(cells);
    if (!sp || sp.n < 2) return true;
    var start = -1, i;
    for (i = 0; i < LAY_BOARDS; i++) if (cells[i]) { start = i; break; }
    var seen = {}, queue = [start];
    seen[start] = 1;
    while (queue.length) {
      var at = queue.pop(), c = at % LAY_COLS, r = (at - c) / LAY_COLS;
      var around = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
      for (i = 0; i < around.length; i++) {
        var nc = around[i][0], nr = around[i][1];
        if (!layAt(cells, nc, nr)) continue;
        var k = nr * LAY_COLS + nc;
        if (seen[k]) continue;
        seen[k] = 1;
        queue.push(k);
      }
    }
    var count = 0;
    for (i in seen) count++;
    return count === sp.n;
  }

  /* Which columns the block may sit under: the filled ones along the
     bottom row of the boards actually placed. */
  function layDockCols(cells) {
    var sp = laySpan(cells), out = [];
    if (!sp) return out;
    for (var c = sp.c0; c <= sp.c1; c++) if (layAt(cells, c, sp.r1)) out.push(c);
    return out;
  }

  /* The column the block WILL sit under, given where it is wanted. A
     block under a column with nothing over it is a row of bays opening
     onto the void, so it moves rather than being left there. */
  function layDockCol(cells, want) {
    var ok = layDockCols(cells);
    if (!ok.length) return -1;
    for (var i = 0; i < ok.length; i++) if (ok[i] === want) return want;
    return ok[0];
  }

  /* Where a board may be put: any empty slot touching one already
     placed, or -- with an empty grid -- any slot at all. */
  function laySlots(cells) {
    var out = [], c, r;
    var sp = laySpan(cells);
    for (r = 0; r < LAY_ROWS; r++) {
      for (c = 0; c < LAY_COLS; c++) {
        if (layAt(cells, c, r)) continue;
        if (!sp) { out.push({ c: c, r: r }); continue; }
        if (layAt(cells, c - 1, r) || layAt(cells, c + 1, r) ||
            layAt(cells, c, r - 1) || layAt(cells, c, r + 1)) out.push({ c: c, r: r });
      }
    }
    return out;
  }

  function composeCourse(layout, flagCount, rnd) {
    var cells = layCells(layout), sp = laySpan(cells);
    if (!sp) throw new Error("a course needs at least one board");
    var boards = [], c, r;
    for (r = sp.r0; r <= sp.r1; r++) {
      for (c = sp.c0; c <= sp.c1; c++) {
        var cell = layAt(cells, c, r);
        if (!cell) continue;
        boards.push({ id: cell.id, rot: cell.rot || 0,
                      at: [(c - sp.c0) * 12, (r - sp.r0) * 12] });
      }
    }
    var dc = layDockCol(cells, layout.dockCol || 0);
    var spec = {
      id: layout.id || "composed",
      name: layout.name || "Your course",
      blurb: layout.blurb || "",
      boards: boards,
      dock: { id: layout.dockId || "dockingBay", rot: 0,
              at: [(dc - sp.c0) * 12, sp.rows * 12] },
      flags: [],
      minPlayers: 2, maxPlayers: 8
    };
    if (layout.flags) {
      spec.flags = layout.flags;
    } else {
      var scratch = buildCourse(spec);
      spec.flags = autoFlags(scratch, flagCount || 3, rnd, dockBoxOf(spec));
    }
    return spec;
  }

  /* SOMEWHERE LEGAL, AND SPREAD OUT, AND NOT IN THE DOCK.

     A flag on a conveyor is carried off it, a flag in a pit cannot be
     touched, three flags in one corner is a race to one corner -- and
     a flag on the DOCK is one somebody starts on top of. The first
     version had no dock rule and duly put flag one at the bottom of
     the docking bay, because "furthest from the start" had been
     written as "largest row" and the dock is at the bottom.

     Distance is measured from the dock itself now, so the first flag
     is the furthest square from where the robots come in, whichever
     edge that happens to be. Each flag after it goes as far as
     possible from the ones already placed.

     `rnd` is accepted and used only to break a tie, so a caller that
     wants variety can have it without the default being unstable.  */
  /* THE PRINTED FLAGS, WHEN THERE ARE ANY.

     A layout that is exactly one shipped course's boards, turned the
     same way, with the dock in the same place, IS that course -- so
     its default flags are the ones that course ships with rather than
     whatever autoFlags would invent. Anything else falls through to
     autoFlags, which is every multi-board layout and every board
     turned off its printed orientation. */
  /* A layout with a different flag list, without touching the one the
     caller passed in -- the layout is the player's live state and a
     question about it must not edit it. */
  function withFlags(layout, flags) {
    var out = { v: layout.v, cells: layout.cells, dockCol: layout.dockCol, flags: flags };
    if (layout.id) out.id = layout.id;
    if (layout.name) out.name = layout.name;
    if (layout.dockId) out.dockId = layout.dockId;
    return out;
  }

  /* THE OTHER DIRECTION.

     composeCourse turns a layout into a course. This turns a shipped
     course back into a layout, so that picking "Exchange Run" off the
     menu and building something by hand are the same flow with the
     same screens after it -- and so the flag screen can then recognise
     the layout as that course and offer its printed flags.

     Returns null for anything that is not a grid of whole boards with
     the dock along the base, which is what the assembler can express.
     A course that cannot be expressed is not forced into a shape it
     does not have; it is simply not editable this way. */
  function layoutFromCourse(id) {
    var spec = COURSES[id];
    if (!spec || !spec.dock) return null;
    var i, b, maxC = 0, maxR = 0;
    for (i = 0; i < spec.boards.length; i++) {
      b = spec.boards[i];
      var g = specOf(b.id);
      if (!g || g.w !== 12 || g.h !== 12) return null;
      /* Aligned, and nothing else: a board off the twelve-square
         lattice is not a shape this grid can hold. */
      if (b.at[0] % 12 || b.at[1] % 12 || b.at[0] < 0 || b.at[1] < 0) return null;
      maxC = Math.max(maxC, b.at[0] / 12);
      maxR = Math.max(maxR, b.at[1] / 12);
    }
    if (maxC >= LAY_COLS || maxR >= LAY_ROWS) return null;
    if (spec.dock.at[0] % 12 || spec.dock.at[1] !== (maxR + 1) * 12) return null;
    var dockCol = spec.dock.at[0] / 12;
    if (dockCol < 0 || dockCol >= LAY_COLS) return null;
    var cells = [];
    for (i = 0; i < LAY_BOARDS; i++) cells.push(null);
    for (i = 0; i < spec.boards.length; i++) {
      b = spec.boards[i];
      var at = (b.at[1] / 12) * LAY_COLS + (b.at[0] / 12);
      if (cells[at]) return null;                    // two boards in one slot
      cells[at] = { id: b.id, rot: b.rot || 0 };
    }
    if (!layConnected(cells) || layDockCol(cells, dockCol) !== dockCol) return null;
    return { v: 3, cells: cells, dockCol: dockCol };
  }

  function defaultFlagsFor(layout) {
    var spec;
    try { spec = composeCourse(withFlags(layout, []), 0); }
    catch (e) { return null; }
    for (var id in COURSES) {
      if (id.charAt(0) === "_") continue;
      var C = COURSES[id];
      if (C.boards.length !== spec.boards.length) continue;
      var same = true, i;
      for (i = 0; i < C.boards.length && same; i++) {
        var a = C.boards[i], found = false;
        for (var j = 0; j < spec.boards.length; j++) {
          var b = spec.boards[j];
          if (a.id === b.id && (a.rot || 0) === (b.rot || 0) &&
              a.at[0] === b.at[0] && a.at[1] === b.at[1]) { found = true; break; }
        }
        if (!found) same = false;
      }
      if (!same) continue;
      if (!C.dock !== !spec.dock) continue;
      if (C.dock && (C.dock.at[0] !== spec.dock.at[0] || C.dock.at[1] !== spec.dock.at[1])) continue;
      return C.flags.map(function (f) { return [f[0], f[1]]; });
    }
    return null;
  }

  /* One definition of "a square a flag may sit on", so autoFlags,
     every placement mode and the by-hand check cannot disagree about
     it. */
  function flagCandidates(C, dockBox, box) {
    var cand = [], c, r;
    for (r = 0; r < C.h; r++) {
      for (c = 0; c < C.w; c++) {
        if (dockBox && c >= dockBox.x0 && c <= dockBox.x1 &&
            r >= dockBox.y0 && r <= dockBox.y1) continue;
        if (box && (c < box.x0 || c > box.x1 || r < box.y0 || r > box.y1)) continue;
        var code = codeAt(C, c, r);
        if (!code || isVoid(C, c, r)) continue;
        var el = elemOf(code);
        if (!el || el.name !== "floor") continue;      // not a belt, pit, gear or bay
        cand.push({ c: c, r: r });
      }
    }
    return cand;
  }

  function flagLegal(C, c, r, dockBox) {
    var cand = flagCandidates(C, dockBox);

    for (var i = 0; i < cand.length; i++) if (cand[i].c === c && cand[i].r === r) return true;
    return false;
  }

  /* Where the dock sits, as a box, for every caller that has to keep
     flags out of it. */
  function dockBoxOf(spec) {
    var dk = spec && spec.dock;
    if (!dk) return null;
    return { x0: dk.at[0], x1: dk.at[0] + 11, y0: dk.at[1], y1: dk.at[1] + 3 };
  }

  function autoFlags(C, n, rnd, dockBox) {
    var cand = flagCandidates(C, dockBox);
    if (!cand.length) return [];
    var dc = dockBox ? (dockBox.x0 + dockBox.x1) / 2 : C.w / 2;
    var dr = dockBox ? (dockBox.y0 + dockBox.y1) / 2 : C.h;
    var out = [];
    while (out.length < n && cand.length) {
      var best = 0, bestD = -1;
      for (var i = 0; i < cand.length; i++) {
        var d;
        if (!out.length) {
          d = Math.abs(cand[i].c - dc) + Math.abs(cand[i].r - dr);
        } else {
          d = Infinity;
          for (var j = 0; j < out.length; j++) {
            var dd = Math.abs(cand[i].c - out[j][0]) + Math.abs(cand[i].r - out[j][1]);
            if (dd < d) d = dd;
          }
        }
        if (d > bestD || (d === bestD && rnd && rnd() < 0.5)) { bestD = d; best = i; }
      }
      out.push([cand[best].c, cand[best].r]);
      cand.splice(best, 1);
    }
    return out;
  }

  /* A tile outside every stamped board is void — the same effect
     as a pit, and the reason inGrid() alone is not enough. */
  function isVoid(C, c, r) { return !inGrid(C, c, r) || !C.cell[idx(C, c, r)]; }

  /* WHICH RULEBOOKS CAN READ THIS COURSE.

     Derived from the elements actually printed on it, not from the box
     it came out of. The two are different questions: a board's `set`
     and `edition` say which game published it, and that is history.
     What a rulebook can READ is decided square by square -- a repair
     site means nothing to the 2016 rules, which dropped them, so a
     board carrying one is classic and no argument. A board built only
     out of elements both editions print can be played either way, and
     the menu is allowed to offer it twice. */
  /* ============================================================
     HOUSE BOARDS

     A board the player has edited for this session. It shadows the
     shipped one everywhere -- courses build from it, thumbnails draw
     it, the ruleset test reads it -- because a half-applied edit, live
     in the picture and absent from the edition check, is the kind of
     wrong that plays for twenty minutes before it shows.

     Overrides are never written into BOARD_SPECS. The shipped data is
     the thing the photographs were checked against, and losing the
     ability to say "this is what the cardboard does" would cost more
     than the convenience is worth.
     ============================================================ */
  var OVERRIDES = {};

  function specOf(id) { return OVERRIDES[id] || BOARD_SPECS[id]; }

  function setOverride(id, spec) {
    if (!BOARD_SPECS[id]) throw new Error("no such board to override: " + id);
    /* Parsed and validated before it is allowed to shadow anything, so
       a bad edit is refused at the door rather than at buildCourse. */
    var g = parsePic(id, spec);
    validateGrid(id, g, function () {});
    OVERRIDES[id] = spec;
  }

  function clearOverride(id) {
    if (id === undefined) OVERRIDES = {};
    else delete OVERRIDES[id];
  }

  function overrideIds() { var out = []; for (var k in OVERRIDES) out.push(k); return out; }
  function isOverridden(id) { return !!OVERRIDES[id]; }

  /* ============================================================
     WHICH RULEBOOK CAN READ THIS COURSE

     Every layer counts, not just the picture. Burners and presses left
     the picture when they became wall-mounted, and for a while after
     that a board whose only expansion element was a flame jet reported
     as playable by both rulebooks -- the element was still there, the
     check had simply stopped looking where it lived.
     ============================================================ */
  /* Which editions print each sparse layer. Pushers and lasers are in
     both boxes; fire, presses and swing doors are Crash and Burn. */
  var LAYER_EDITIONS = {
    burners: ["classic"],
    timers: ["classic"],
    doors: ["classic"],
    pushers: ["classic", "modern"],
    lasers: ["classic", "modern"]
  };
  var LAYER_NAMES = { burners: "flame jet", timers: "press", doors: "swing door" };

  /* Every element a course carries, as {name, editions} -- one list so
     the two questions below cannot disagree about where to look.

     Reads the PARSED grid rather than the picture text. The first
     version scanned the source strings and reported a swing door on
     every board with a docking bay, because "s1" carries a digit and
     so does a door. Parsing costs a millisecond in a menu and cannot
     make that mistake. */
  function courseElements(id) {
    var spec = courseSpec(id), out = [];
    /* An edited course is read from the picture it carries, because
       that picture is what will be raced -- a square the workshop put
       there decides the ruleset exactly as a printed one does. */
    if (spec.grid) {
      var eg;
      try { eg = parsePic(spec.id || "composed", spec.grid); } catch (e) { return out; }
      return gridElements(eg, out);
    }
    var parts = spec.boards.concat(spec.dock ? [spec.dock] : []);
    for (var i = 0; i < parts.length; i++) {
      var bs = specOf(parts[i].id);
      if (!bs) continue;
      var g;
      try { g = parsePic(parts[i].id, bs); } catch (e) { continue; }
      gridElements(g, out);
    }
    return out;
  }

  /* Which edition-bearing things a PARSED grid carries. Shared, so a
     course read from its boards and one read from its own picture
     cannot disagree about what is on it. */
  function gridElements(g, out) {
    for (var r = 0; r < g.h; r++) {
      for (var c = 0; c < g.w; c++) {
        var def = elemOf(codeAt(g, c, r));
        if (def && def.editions) out.push({ name: def.name, editions: def.editions });
      }
    }
    var k;
    for (k = 0; k < g.doorN.length; k++) {
      if (g.doorN[k]) { out.push({ name: LAYER_NAMES.doors, editions: LAYER_EDITIONS.doors }); break; }
    }
    for (k = 0; k < g.doorW.length; k++) {
      if (g.doorW[k]) { out.push({ name: LAYER_NAMES.doors, editions: LAYER_EDITIONS.doors }); break; }
    }
    for (var layer in LAYER_EDITIONS) {
      if (layer === "doors") continue;
      if (g[layer] && g[layer].length) {
        out.push({ name: LAYER_NAMES[layer] || layer, editions: LAYER_EDITIONS[layer] });
      }
    }
    return out;
  }

  function playableEditionsNew(id) {
    var out = [], e;
    for (e in EDITIONS) out.push(e);
    var els = courseElements(id);
    for (var i = 0; i < els.length; i++) {
      var ed = els[i].editions;
      out = out.filter(function (x) { return ed.indexOf(x) >= 0; });
    }
    return out;
  }

  function editionBlockerNew(id, edition) {
    var els = courseElements(id);
    for (var i = 0; i < els.length; i++) {
      if (els[i].editions.indexOf(edition) < 0) return els[i].name;
    }
    return null;
  }

  function playableEditionsOld(id) {
    var spec = COURSES[id];
    var parts = spec.boards.concat(spec.dock ? [spec.dock] : []);
    var out = [];
    for (var e in EDITIONS) out.push(e);
    for (var i = 0; i < parts.length; i++) {
      var bs = BOARD_SPECS[parts[i].id];
      if (!bs) continue;
      for (var r = 0; r < bs.h; r++) {
        var row = bs.pic[2 * r + 1];
        for (var c = 0; c < bs.w; c++) {
          var def = ELEMENT_DEFS[row.charAt(3 * c + 1)];
          if (!def || !def.editions) continue;
          out = out.filter(function (ed) { return def.editions.indexOf(ed) >= 0; });
        }
      }
    }
    return out;
  }

  function editionBlockerOld(id, edition) {
    var spec = COURSES[id];
    var parts = spec.boards.concat(spec.dock ? [spec.dock] : []);
    for (var i = 0; i < parts.length; i++) {
      var bs = BOARD_SPECS[parts[i].id];
      if (!bs) continue;
      for (var r = 0; r < bs.h; r++) {
        var row = bs.pic[2 * r + 1];
        for (var c = 0; c < bs.w; c++) {
          var def = ELEMENT_DEFS[row.charAt(3 * c + 1)];
          if (def && def.editions && def.editions.indexOf(edition) < 0) return def.name;
        }
      }
    }
    return null;
  }

  function validateCourse(id, warn) {
    var spec = courseSpec(id);
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
      var be = specOf(parts[i].id).edition || "classic";
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
    /* NO TWO BOARDS MAY BE THE SAME BOARD.

       Crash and Burn's "board E" turned out to be a reprint of the base
       game's Island -- same 144 squares, same walls, different word
       printed along the bottom edge. Transcribed in good faith from its
       own photograph, it validated perfectly, played perfectly, and put
       the same board in the menu twice. Nothing caught it: every check
       here asks whether a board is INTERNALLY sound, and a duplicate is.

       It surfaced by accident, when a belt reader was run across two
       boards and returned identical results. That is luck, not a
       method, so it gets a check. */
    var byPic = {};
    for (id in BOARD_SPECS) {
      var key = BOARD_SPECS[id].pic.join("\n");
      if (byPic[key]) {
        throw new Error("board " + id + " is square-for-square identical to " + byPic[key] +
          "; the same board cannot ship under two names");
      }
      byPic[key] = id;
    }

    for (id in COURSES) validateCourse(id, warn);
    return { boards: boards, warnings: warnings };
  }

  return {
    N: N, E: E, S: S, W: W, DC: DC, DR: DR, DIR_CHARS: DIR_CHARS, DIR_OF: DIR_OF,
    rot: rot, opposite: opposite, dirName: dirName, turnBetween: turnBetween, step: step,
    ELEMENT_DEFS: ELEMENT_DEFS, elemOf: elemOf, dirOf: dirOf, activeNow: activeNow, timerAt: timerAt, pusherAt: pusherAt, pusherFires: pusherFires, burnerAt: burnerAt, burnerFires: burnerFires, isOil: isOil, EDITIONS: EDITIONS, SETS: SETS,
    beltSpeed: beltSpeed, gearTurn: gearTurn, isPit: isPit,
    mergeAt: mergeAt, beltArms: beltArms, beltTurnsFrom: beltTurnsFrom,
    BOARD_SPECS: BOARD_SPECS, COURSES: COURSES,
    parsePic: parsePic, rotateGrid: rotateGrid, laserPath: laserPath,
    gridToPic: gridToPic, formatBoard: formatBoard, blankGrid: blankGrid,
    idx: idx, inGrid: inGrid, codeAt: codeAt, wallAt: wallAt, setWall: setWall, doorAt: doorAt, setDoor: setDoor,
    doorOpen: doorOpen, blockedAt: blockedAt,
    buildCourse: buildCourse, isVoid: isVoid,
    validateGrid: validateGrid, validateCourse: validateCourse,
    playableEditions: playableEditionsNew, editionBlocker: editionBlockerNew,
    courseSpec: courseSpec, composeCourse: composeCourse, autoFlags: autoFlags,
    defaultFlagsFor: defaultFlagsFor,

    flagCandidates: flagCandidates, flagLegal: flagLegal, dockBoxOf: dockBoxOf,
    withFlags: withFlags,
    layoutFromCourse: layoutFromCourse,
    LAY_BOARDS: LAY_BOARDS, LAY_COLS: LAY_COLS, LAY_ROWS: LAY_ROWS,
    layCells: layCells, layAt: layAt, laySpan: laySpan, layConnected: layConnected,
    layDockCols: layDockCols, layDockCol: layDockCol, laySlots: laySlots,
    courseElements: courseElements, validateAll: validateAll,
    specOf: specOf, setOverride: setOverride, clearOverride: clearOverride,
    overrideIds: overrideIds, isOverridden: isOverridden
  };
});
