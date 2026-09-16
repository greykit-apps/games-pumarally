/* The quick game (game/engine/quick.js) and what a race draws on its board.
 *
 * A quick game has no course file: one board, a facing drawn at random, and
 * three flags drawn from the locations the board marks. The tests build a
 * small marked board and a docking bay with the workshop's own library, the
 * way the rule tests do, so what they say about a square is what the
 * validator says.
 */
import { blankBoard, setCell, setSites } from "../../../editor/lib/board.js";
import { usableFlagSpots, flagRefusal, assemble } from "../../../editor/lib/course.js";
import { boardSVG, sitesShown } from "../../../editor/render/svg.js";
import { readCourse } from "../../engine/library.js";
import { buildCourse } from "../../engine/course.js";
import { quickCourse, quickSpots, canQuick, seeded, QUICK_FLAGS, DOCK_BOARD } from "../../engine/quick.js";

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
];
