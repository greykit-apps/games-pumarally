/* The quick game (game/engine/quick.js) and what a race draws on its board.
 *
 * A quick game has no course file: one board, a facing drawn at random, and
 * three flags drawn from the locations the board marks. The tests build a
 * small marked board and a docking bay with the workshop's own library, the
 * way the rule tests do, so what they say about a square is what the
 * validator says.
 */
import { blankBoard, setCell, setSites, setLevel } from "../../../editor/lib/board.js";
import { usableFlagSpots, flagRefusal, assemble } from "../../../editor/lib/course.js";
import { boardSVG, sitesShown } from "../../../editor/render/svg.js";
import { readCourse } from "../../engine/library.js";
import { courseFromDocument, validateCourse } from "../../../editor/validate/course.js";
import { sink } from "../../../editor/validate/diagnostic.js";
import { buildCourse } from "../../engine/course.js";
import { quickCourse, quickSpots, canQuick, isBlank, seeded, QUICK_FLAGS, DOCK_BOARD,
  quickMulti, quickCells, routeOf, quickFlagCounts, quickFlagRange, quickDefaultFlags, QUICK_MAX_BOARDS } from "../../engine/quick.js";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); };

/** A 12x4 docking bay with bays 1..8 along its second row, under the shipped one's id. */
function dock() {
  const d = blankBoard({ id: DOCK_BOARD, name: "Docking Bay", w: 12, h: 4, set: "authored", origin: "authored" });
  for (let i = 0; i < 8; i++) setCell(d, i + 2, 1, "s" + (i + 1) + ".");
  return d;
}
/** An 8x8 floor marking `spots` as flag locations, and a library holding it and the dock. */
function marked(spots, id = "m") {
  const b = blankBoard({ id, name: "Marked", w: 8, h: 8, set: "authored", origin: "authored" });
  for (const [c, r] of spots) setSites(b, c, r, ["flagspot"]);
  const library = new Map([[b.id, b], [DOCK_BOARD, dock()]]);
  return { b, library };
}
const FIVE = [[2, 2], [5, 2], [4, 4], [2, 5], [6, 6]];

/* A pool of 12x12 boards for the multi-board draw, each marking six
 * locations spread over the floor so a route can be found at any facing,
 * and a library holding them and the dock. */
function pool12(count) {
  const library = new Map([[DOCK_BOARD, dock()]]);
  const boards = [];
  for (let i = 0; i < count; i++) {
    const b = blankBoard({ id: "p" + i, name: "Pool " + i, w: 12, h: 12, set: "authored", origin: "authored" });
    for (const [c, r] of [[2, 2], [9, 2], [5, 5], [6, 8], [2, 9], [9, 9]]) setSites(b, c, r, ["flagspot"]);
    library.set(b.id, b); boards.push(b);
  }
  return { boards, library };
}
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

export const TESTS = [
  ["a quick game lays the board at the facing drawn, over the docking bay", () => {
    const { b, library } = marked(FIVE);
    for (let rot = 0; rot < 4; rot++) {
      const doc = quickCourse(b, library, { rot, rnd: seeded(1) });
      eq(doc.stamps.map(s => [s.role, s.board, s.rot, s.at]), [["board", "m", rot, [2, 0]], ["dock", DOCK_BOARD, 0, [0, 8]]],
        "facing " + rot + ": the board centred over the wider dock, the dock under it");
      readCourse(doc, library);                                    // the validator reads it without an error
      const C = buildCourse(doc, library);
      eq([C.w, C.h, C.docks.length], [12, 12, 8], "facing " + rot + ": twelve by twelve, eight bays");
    }
    /* a facing not pinned is drawn: over many draws every one comes up */
    const seen = new Set();
    for (let k = 0; k < 40; k++) seen.add(quickCourse(b, library, { rnd: seeded(100 + k) }).stamps[0].rot);
    eq([...seen].sort(), [0, 1, 2, 3], "every facing is drawn");
  }],
  ["a quick game draws three flags from the marked locations, in the order drawn", () => {
    const { b, library } = marked(FIVE);
    const draws = [];
    for (const seed of [1, 2, 3, 4]) {
      const doc = quickCourse(b, library, { rnd: seeded(seed) });
      eq(doc.flags.length, QUICK_FLAGS, "three flags");
      eq(new Set(doc.flags.map(f => f.join(","))).size, QUICK_FLAGS, "three different squares");
      const asm = assemble(doc, library);
      const usable = usableFlagSpots(doc, library, asm).map(s => s.c + "," + s.r);
      for (const [c, r] of doc.flags) {
        assert(usable.includes(c + "," + r), "flag at " + c + "," + r + " is one of the marked locations, where the board now lies (facing " + doc.stamps[0].rot + ")");
        eq(flagRefusal(doc, library, asm, c, r), null, "the validator takes the flag at " + c + "," + r);
      }
      draws.push(JSON.stringify(doc.flags));
    }
    assert(new Set(draws).size > 1, "different seeds draw different flags: " + draws.join(" "));
  }],
  ["a board without three marked locations is no quick game", () => {
    const two = marked([[2, 2], [5, 5]]);
    eq([quickSpots(two.b, two.library).length, canQuick(two.b, two.library)], [2, false], "two marks: no quick game");
    let threw = false;
    try { quickCourse(two.b, two.library, { rnd: seeded(1) }); } catch (e) { threw = true; }
    assert(threw, "and asking for one is refused");
    const three = marked([[2, 2], [5, 5], [3, 6]]);
    assert(canQuick(three.b, three.library), "three marks: a quick game");
    assert(!canQuick(three.library.get(DOCK_BOARD), three.library), "the docking bay is not a quick game");
    /* a board with bays of its own is a course already, and gets no second dock */
    const own = marked(FIVE, "own");
    setCell(own.b, 0, 7, "s1.");
    assert(!canQuick(own.b, own.library), "a board with its own bays is not a quick game");
    /* a mark in an outer corner of the course is not a location a race can
     * use: the board's two top corners are, its two bottom ones stand on the
     * docking bay and are not */
    const corners = marked([[0, 0], [7, 0], [0, 7], [7, 7], [3, 3]]);
    eq(quickSpots(corners.b, corners.library).map(s => [s.c, s.r]), [[5, 3], [2, 7], [9, 7]], "the marks off the course's outer corners, where the board lies");
  }],
  ["a blank board is told from a board by its floor, not its markings", () => {
    /* issue #11: Blueprint and Tabula Rasa are open floor with flag
     * locations (and, on one, two wrenches) printed on them so a course can
     * be built there. The setup screen keeps them off the quick-game shelf;
     * the engine itself still takes a bare marked floor, which is what every
     * fixture in this file is. */
    const blank = marked(FIVE, "blank");
    setSites(blank.b, 1, 1, ["repair", "battery", "flagspot"]);
    assert(isBlank(blank.b), "open floor with markings is blank");
    assert(canQuick(blank.b, blank.library), "and still a quick game to the engine: leaving it out is the offer's rule");
    /* any one thing on the floor and it is a board: a wall, a belt, a device, a level, a ramp */
    const walled = marked(FIVE, "walled"); walled.b.wallH[walled.b.w * 3 + 3] = 1;
    assert(!isBlank(walled.b), "one wall: a board");
    const belted = marked(FIVE, "belted"); setCell(belted.b, 0, 0, "bv.");
    assert(!isBlank(belted.b), "one belt: a board");
    const raised = marked(FIVE, "raised"); setLevel(raised.b, 3, 3, 1);
    assert(!isBlank(raised.b), "one raised square: a board");
    const ramped = marked(FIVE, "ramped"); ramped.b.rampV[5] = 1;
    assert(!isBlank(ramped.b), "one ramp: a board");
    const shot = marked(FIVE, "shot"); shot.b.wallDevices.push({ kind: "laser", edge: "h:2,0", face: "S", damage: 1 });
    assert(!isBlank(shot.b), "one laser: a board");
    const pressed = marked(FIVE, "pressed"); pressed.b.ceilingDevices.push({ kind: "press", at: [2, 2], regs: [1] });
    assert(!isBlank(pressed.b), "one press: a board");
  }],
  ["a course may place its own starting squares, and a race needs eight of them", () => {
    /* the docking bay board is the quick way to eight bays; a course may
     * instead put its starting squares anywhere on the floor, numbered in
     * the order placed, and the engine docks robots on them as on a board's */
    const { b, library } = marked(FIVE, "open");
    const starts = [[0, 0], [7, 0], [0, 7], [7, 7], [3, 0], [0, 3], [7, 3], [3, 7]];
    const doc = { format: "PRCourse", version: 1, id: "ring", name: "Ring", kind: "track",
      stamps: [{ role: "board", board: b.id, rot: 0, at: [0, 0] }], starts, flags: FIVE.slice(0, 3), minPlayers: 1, maxPlayers: 8 };
    /* the workshop's validator is what holds a course to the rule; the engine reads shape only */
    const errors = d => { const s = sink(); const c = courseFromDocument(JSON.parse(JSON.stringify(d)), s, d.id); if (c) validateCourse(c, library, s); return s.items.filter(x => x.severity === "error").map(x => x.message); };
    eq(errors(doc), [], "eight placed starting squares and no docking bay board is a course");
    const C = buildCourse(readCourse(doc, library), library);
    eq(C.docks.map(d => [d.c, d.r, d.n]), starts.map((s, i) => [s[0], s[1], i + 1]), "eight bays where the course put them, numbered in order");
    /* seven is not a course, nor is a docking bay board and one more */
    let e = errors({ ...doc, starts: starts.slice(0, 7) });
    assert(e.some(m => /7 of the 8/.test(m)), "seven starting squares are refused, and the refusal counts them: " + e);
    e = errors({ ...doc, stamps: doc.stamps.concat([{ role: "dock", board: DOCK_BOARD, rot: 0, at: [0, 8] }]), starts: [[3, 3]] });
    assert(e.some(m => /9 starting squares/.test(m)), "a docking bay board and one more is nine, and refused: " + e);
    /* a start on a flag's square is refused from the flag's side: the square is a bay now */
    e = errors({ ...doc, flags: [starts[0]].concat(FIVE.slice(1, 3)) });
    assert(e.some(m => /starting square/.test(m)), "a flag on a starting square is refused: " + e);
    /* and a start in a pit, or on a belt, is not on floor */
    setCell(b, 3, 3, "o..");
    e = errors({ ...doc, starts: starts.slice(0, 7).concat([[3, 3]]) });
    assert(e.some(m => /plain floor/.test(m)), "a start in a pit is refused: " + e);
  }],
  ["the race draws the markings its edition reads and no others", () => {
    const all = ["repair", "battery", "flagspot"];
    eq(sitesShown(all, { sites: "classic" }), ["repair", "flagspot"], "classic: the wrench, not the battery");
    eq(sitesShown(all, { sites: "modern" }), ["battery", "flagspot"], "2016: the battery, not the wrench");
    eq(sitesShown(all, { sites: "all" }), all, "the workshop: everything printed");
    eq(sitesShown(all, { sites: "modern", flagspots: false }), ["battery"], "in play, no flag locations");
    const b = blankBoard({ id: "s", name: "S", w: 3, h: 3, set: "authored", origin: "authored" });
    setSites(b, 1, 1, ["upgrade", "battery", "flagspot"]);
    /* the art's stylesheet travels with the drawing and names every class, so
     * look for the glyph's own group and not for the name anywhere */
    const has = (svg, cls) => svg.indexOf('class="pr-art ' + cls + '"') >= 0;
    const classic = boardSVG(b, { sites: "classic", flagspots: false }), modern = boardSVG(b, { sites: "modern", flagspots: false }), shop = boardSVG(b);
    assert(has(classic, "pr-upgrade") && !has(classic, "pr-batt"), "classic draws the two wrenches and no battery");
    assert(has(modern, "pr-batt") && !has(modern, "pr-upgrade"), "2016 draws the battery and no wrench");
    assert(!has(classic, "pr-flagspot") && !has(modern, "pr-flagspot"), "neither draws the flag location");
    assert(has(shop, "pr-upgrade") && has(shop, "pr-batt") && has(shop, "pr-flagspot"), "the workshop draws all three");
  }]
,
  /* --- a quick game on several boards ------------------------------------------ */
  ["the boards stack as the box does: the column first, then the sides, never beyond three by three", () => {
    for (let n = 1; n <= 3; n++) eq(quickCells(n, seeded(1)), [{ gx: 0, gy: 0 }, { gx: 0, gy: 1 }, { gx: 0, gy: 2 }].slice(0, n), n + " boards: a column");
    for (let n = 4; n <= QUICK_MAX_BOARDS; n++) {
      for (const seed of [1, 2, 3]) {
        const cells = quickCells(n, seeded(seed));
        eq(cells.length, n, n + " boards laid");
        eq(new Set(cells.map(c => c.gx + "," + c.gy)).size, n, n + " boards on " + n + " different cells");
        assert(cells.every(c => c.gx >= -1 && c.gx <= 1 && c.gy >= 0 && c.gy <= 2), n + " boards: all within three by three");
        assert(cells.slice(3).every(c => c.gx !== 0), n + " boards: the fourth on is beside the column");
        /* every board touches one already down: the course is one piece */
        cells.slice(1).forEach((c, i) => assert(cells.slice(0, i + 1).some(o => Math.abs(o.gx - c.gx) + Math.abs(o.gy - c.gy) === 1), n + " boards: board " + (i + 2) + " touches an earlier one"));
      }
    }
    /* the sides fill where a board touches two: after (0,0)..(0,2) and a side at gy 0, the next on that side sits at gy 1, touching two */
    const seen = new Set();
    for (let seed = 0; seed < 20; seed++) { const c = quickCells(5, seeded(seed)); seen.add(Math.abs(c[3].gx - c[4].gx) + Math.abs(c[3].gy - c[4].gy)); }
    eq([...seen], [1], "5 boards: the fifth always touches the fourth as well as the column");
  }],
  ["the route visits every board, board by board where the layout allows", () => {
    for (let n = 1; n <= QUICK_MAX_BOARDS; n++) {
      const cells = quickCells(n, seeded(n));
      const route = routeOf(cells, seeded(n));
      eq([...route.order].sort((a, b) => a - b), [...Array(n).keys()], n + " boards: every board once");
      eq(route.order[0], 0, n + " boards: from board 1");
      eq(route.jumps.length, n - 1, n + " boards: a step between each pair");
      if (n <= 8) eq(route.jumps.filter(j => j).length, 0, n + " boards: no jumps");
    }
    /* nine is the one count with no such route: three by three from the bottom middle cannot be walked, so exactly one jump */
    eq(routeOf(quickCells(9, seeded(1)), seeded(1)).jumps.filter(j => j).length, 1, "9 boards: one jump, unavoidable");
  }],
  ["every board gets a flag, the extras go one per board in turn, and the knob's range says so", () => {
    eq(quickFlagCounts(3, 3, [0, 1, 2]), [1, 1, 1], "3 boards, 3 flags: one each");
    eq(quickFlagCounts(3, 5, [0, 1, 2]), [2, 2, 1], "3 boards, 5 flags: 2-2-1, not 3-1-1");
    eq(quickFlagCounts(3, 5, [0, 2, 1]), [2, 1, 2], "the extras follow the route order");
    eq(quickFlagCounts(2, 6, [0, 1]), [3, 3], "the most a board takes is three");
    eq([quickFlagRange(1), quickFlagRange(4)], [[1, 3], [4, 12]], "the range: one a board at least, three a board at most");
    eq([quickDefaultFlags(1), quickDefaultFlags(2), quickDefaultFlags(4)], [3, 4, 6], "the default: three on one board, two more than the boards otherwise");
  }],
  ["a quick game on several boards draws, lays and flags a course the validator takes", () => {
    const { boards, library } = pool12(6);
    for (const [n, f] of [[1, 3], [2, 2], [2, 6], [3, 5], [4, 6], [5, 15]]) {
      for (const seed of [1, 2]) {
        const doc = quickMulti(boards, n, f, library, { rnd: seeded(seed * 10 + n) });
        readCourse(doc, library);
        const stamps = doc.stamps.filter(s => s.role === "board");
        eq(stamps.length, n, n + " boards laid");
        eq(new Set(stamps.map(s => s.board)).size, n, n + " different boards");
        eq(doc.stamps[doc.stamps.length - 1].role, "dock", "the dock last, under the column");
        eq(doc.flags.length, f, f + " flags");
        eq(new Set(doc.flags.map(x => x.join(","))).size, f, f + " different squares");
        const asm = assemble(doc, library);
        const usable = usableFlagSpots(doc, library, asm);
        const owners = doc.flags.map(([c, r]) => { const u = usable.find(s => s.c === c && s.r === r); assert(u, "flag at " + c + "," + r + " is a usable marked location"); return u.stamp; });
        for (let i = 0; i < n; i++) assert(owners.includes(i), n + " boards, " + f + " flags: board " + i + " has a flag");
        /* a board's flags come in a row: the owner sequence never returns to a board it has left */
        const runs = owners.filter((o, i) => i === 0 || o !== owners[i - 1]);
        eq(new Set(runs).size, runs.length, "a board's flags are consecutive: " + owners.join(" "));
        /* and consecutive flags keep to twelve wherever their boards touch */
        for (let i = 1; i < doc.flags.length; i++) {
          const a = stamps[owners[i - 1]].at, b = stamps[owners[i]].at;
          if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 12) assert(cheb(doc.flags[i - 1], doc.flags[i]) <= 12, "flags " + i + " and " + (i + 1) + " within twelve: " + doc.flags[i - 1] + " to " + doc.flags[i]);
        }
      }
    }
    /* different seeds draw different courses */
    const a = quickMulti(boards, 3, 5, library, { rnd: seeded(1) }), b = quickMulti(boards, 3, 5, library, { rnd: seeded(2) });
    assert(JSON.stringify([a.stamps, a.flags]) !== JSON.stringify([b.stamps, b.flags]), "two seeds, two courses");
  }],
  ["the ask is refused when it cannot be met, and says why", () => {
    const { boards, library } = pool12(3);
    const refuses = (fn, re) => { let msg = null; try { fn(); } catch (e) { msg = e.message; } assert(msg && re.test(msg), "refused with " + JSON.stringify(msg) + ", expected " + re); };
    refuses(() => quickMulti(boards, 4, 4, library, { rnd: seeded(1) }), /only 3 boards/);
    refuses(() => quickMulti(boards, 3, 2, library, { rnd: seeded(1) }), /3 to 9 flags/);
    refuses(() => quickMulti(boards, 2, 7, library, { rnd: seeded(1) }), /2 to 6 flags/);
    refuses(() => quickMulti(boards, 0, 0, library, { rnd: seeded(1) }), /1 to 9 boards/);
    const small = marked(FIVE);
    refuses(() => quickMulti([small.b], 1, 3, small.library, { rnd: seeded(1) }), /8x8/);
    /* a single board asked for fewer or more flags than three */
    const one = quickCourse(small.b, small.library, { rnd: seeded(1), flags: 5 });
    eq(one.flags.length, 5, "a single board draws five when asked");
    refuses(() => quickCourse(small.b, small.library, { rnd: seeded(1), flags: 6 }), /marks 5 usable/);
  }]
];
