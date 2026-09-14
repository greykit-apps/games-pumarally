/* The editor's tool logic, tested without a DOM.
 *
 * Most of what a tool does is REFUSE, and a refusal that silently does nothing
 * teaches nobody anything -- the status line is where the rules actually get
 * learned. So each refusal is asserted to happen AND to say why.
 */

import { blankBoard, setCell, cellAt, levelAt, wallDevicesAt, ceilingAt } from "../lib/board.js";
import { wallAt, setWall, edgeOf, edgeCodeAt, EDGE_WALL, EDGE_DOOR, EDGE_NONE } from "../lib/edges.js";
import { N, E, S, W, opposite } from "../lib/dir.js";
import { apply, erase, describe, blankToolState, toolsFor, TOOLS, RESERVED, mountEdge, whatNeedsEdge, EDITION_CHOICES } from "../app/tools.js";
import { ZOOM_MIN, ZOOM_MAX } from "../app/view.js";
import { checkBoard } from "../validate/index.js";
import { ELEMENTS } from "../rulesets/elements.js";
import {
  newCourse, place, turn, remove, moveStamp, stampAt, snapTargets, nearestSnap,
  normalise, addFlag, removeFlag, moveFlag, flagAt, toDocument, flagWouldFit
} from "../app/compose.js";
import { assemble, stampFootprint, stampDims } from "../lib/course.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { sink } from "../validate/diagnostic.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoardDocument } from "../validate/index.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";

let passed = 0, failed = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; return; }
  failed++;
  console.error("FAIL " + m + "\n  got      " + JSON.stringify(a) + "\n  expected " + JSON.stringify(b));
};
const ok = (v, m) => eq(!!v, true, m);
const refused = (res, m) => {
  if (res.ok) { failed++; console.error("FAIL " + m + ": it was allowed"); return; }
  if (!res.why || res.why.length < 12) { failed++; console.error("FAIL " + m + ": refused with no reason worth reading: " + JSON.stringify(res.why)); return; }
  passed++;
};

const fresh = (w = 8, h = 8, edition = "classic") =>
  blankBoard({ id: "t", name: "T", w, h, edition, set: "authored", origin: "authored" });

/* --- the rail --------------------------------------------------------------- */
{
  const keys = TOOLS.map(t => t.key);
  eq(new Set(keys).size, keys.length, "rail: tool keys are unique");
  const hots = TOOLS.filter(t => t.hot).map(t => t.hot);
  eq(new Set(hots).size, hots.length, "rail: no two tools claim one hotkey");
  for (const h of hots) {
    ok(RESERVED.indexOf(h) < 0, "rail: hotkey " + JSON.stringify(h) + " does not collide with steering or numbers");
  }
  /* every element and device is reachable from the rail, or it is in the format
   * and cannot be drawn */
  for (const def of Object.values(ELEMENTS)) {
    ok(TOOLS.some(t => t.key === "el:" + def.key), "rail: " + def.key + " has a tool");
  }
  for (const k of Object.keys(DEVICE_KINDS)) {
    ok(TOOLS.some(t => t.key === "dev:" + k), "rail: " + k + " has a tool");
  }
  /* EVERY ELEMENT AND DEVICE MUST BE REACHABLE FROM SOME EDITION THE EDITOR CAN
   * SELECT. Having a tool in the list is not enough -- the rail filters by the
   * board's declared edition, and while that was read-only and a new board
   * started classic, nine elements and the whole of elevation had no route to a
   * board at all. Water was simply not an option anywhere. */
  {
    const reachable = new Set();
    for (const e of EDITION_CHOICES) for (const t of toolsFor(e, true)) reachable.add(t.key);
    const stranded = [
      ...Object.values(ELEMENTS).filter(d => !reachable.has("el:" + d.key)).map(d => "element " + d.key),
      ...Object.keys(DEVICE_KINDS).filter(k => !reachable.has("dev:" + k)).map(k => "device " + k)
    ];
    eq(stranded, [], "rail: every element and device is reachable from an edition the editor offers");
    for (const e of EDITION_CHOICES) {
      ok(toolsFor(e, false).some(t => t.kind === "ground"),
         "rail: the " + e + " rail offers something to draw");
    }
  }

  const classic = toolsFor("classic", false).map(t => t.key);
  ok(!classic.includes("el:energySpace"), "rail: a classic board is not offered a battery");
  ok(!classic.includes("dev:crusher"), "rail: a classic board is not offered a crusher");
  ok(classic.includes("dev:jet"), "rail: a classic board is offered a flame jet");
  ok(!toolsFor("modern", false).map(t => t.key).includes("el:repairSite"), "rail: a modern board is not offered a repair site");
  ok(toolsFor("modern", false).map(t => t.key).includes("el:water"), "rail: a modern board IS offered water");
  ok(toolsFor("modern", false).map(t => t.key).includes("el:ramp"), "rail: and a ramp, so elevation can be drawn");
  ok(!toolsFor("classic", false).some(t => t.courseOnly), "rail: the flag tool is not in a board's rail");
  ok(toolsFor("classic", true).some(t => t.key === "flag"), "rail: the flag tool is in a course's rail");
}

/* --- laying ground ---------------------------------------------------------- */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "el:conveyor"; st.dir = E; st.arms = "l";
  ok(apply(b, st, 2, 2).changed, "ground: a belt goes down");
  eq(cellAt(b, 2, 2), "b>l", "ground: element, facing and arms all land in the cell");
  eq(apply(b, st, 2, 2).changed, false, "ground: laying the same thing twice changes nothing");
  st.tool = "el:pit";
  ok(apply(b, st, 3, 3).changed, "ground: a pit goes down");
  eq(cellAt(b, 3, 3), "o..", "ground: a pit takes no argument and no arms");
}

/* --- a mount puts its own wall up ------------------------------------------- */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:laser"; st.dir = S; st.damage = 2;
  const res = apply(b, st, 4, 4);
  ok(res.changed, "device: a laser goes down");
  eq(wallAt(b, 4, 4, N), EDGE_WALL, "device: the mount put its own wall up behind it");
  eq(wallDevicesAt(b, 4, 4, "laser").length, 1, "device: and stands in the square clicked");
  eq(checkBoard(b).ok, true, "device: a laser laid this way validates immediately");
}

/* --- a wall refuses to come off under a mount ------------------------------- */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:pusher"; st.dir = E;
  apply(b, st, 4, 4);
  eq(wallAt(b, 4, 4, W), EDGE_WALL, "wall: the pusher mounted on its west wall");
  st.tool = "wall";
  refused(apply(b, st, 4, 4, { face: W }), "wall: taking the wall out from under a pusher");
  refused(apply(b, st, 3, 4, { face: E }), "wall: the same edge, asked from the other side");
  eq(wallAt(b, 4, 4, W), EDGE_WALL, "wall: and the wall is still there");
}

/* --- refusals that name the square ------------------------------------------ */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "el:pit";
  apply(b, st, 2, 2);
  st.tool = "dev:press";
  refused(apply(b, st, 2, 2), "ceiling: a press over a pit");
  st.tool = "dev:press";
  ok(apply(b, st, 3, 3).changed, "ceiling: a press over floor");
  refused(apply(b, st, 3, 3), "ceiling: two presses on one square");
  st.tool = "el:pit";
  refused(apply(b, st, 3, 3), "ground: digging a pit under a press");
}

{
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:pusher"; st.dir = E;
  apply(b, st, 4, 4);
  st.dir = N;
  refused(apply(b, st, 4, 4), "device: a second pusher in one square");
}

{
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:door"; st.dir = N;
  ok(apply(b, st, 4, 4).changed, "device: a swing door goes on the edge");
  eq(wallAt(b, 4, 4, N), EDGE_DOOR, "device: and the lattice says door, not wall");
  st.tool = "dev:laser"; st.dir = S;
  refused(apply(b, st, 4, 4), "device: bolting a laser to a swing door");
}

/* --- erasing ----------------------------------------------------------------- */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:laser"; st.dir = S;
  apply(b, st, 4, 4);
  const res = erase(b, st, 4, 4);
  ok(res.changed, "erase: the laser comes off");
  eq(wallDevicesAt(b, 4, 4).length, 0, "erase: and is gone");
  eq(wallAt(b, 4, 4, N), EDGE_WALL, "erase: its wall stays -- it may be printed too, and guessing loses data");
  ok(/wall is still there/i.test(res.note), "erase: and it says so");
}

/* --- levels ------------------------------------------------------------------ */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "level"; st.level = 1;
  ok(apply(b, st, 2, 2).changed, "level: raising a square");
  eq(levelAt(b, 2, 2), 1, "level: it took");
  ok(erase(b, st, 2, 2).changed, "level: erasing lowers it");
  eq(levelAt(b, 2, 2), 0, "level: back to zero");
}

/* --- describe ----------------------------------------------------------------- */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "el:conveyor"; st.dir = E; st.arms = "L";
  apply(b, st, 2, 2);
  st.tool = "dev:jet"; st.dir = N; st.reach = 2;
  apply(b, st, 2, 2);
  const d = describe(b, 2, 2);
  eq(d.element, "Conveyor", "describe: the square itself");
  eq(d.arms, "T-merge, joined from the left", "describe: the belt's printed shape in words");
  eq(d.walls, ["S"], "describe: the wall the jet mounted on");
  eq(d.wallDevices.length, 1, "describe: what stands on it");
}

/* --- everything a tool lays must validate ------------------------------------
 * A tool that produces a board the validator refuses is a trap: the editor
 * would let you draw something it then will not let you save. */
{
  for (const edition of ["classic", "modern"]) {
    const b = fresh(10, 10, edition);
    const st = blankToolState();
    let laid = 0, c = 0, r = 0;
    for (const tool of toolsFor(edition, false)) {
      if (tool.kind === "select" || tool.kind === "pan" || tool.kind === "flag") continue;
      /* pairs need two, so lay each paired element twice */
      const times = tool.arg === "pair" ? 2 : 1;
      for (let i = 0; i < times; i++) {
        st.tool = tool.key; st.dir = E;
        const res = apply(b, st, c, r);
        if (res.ok && res.changed) laid++;
        c += 2; if (c >= b.w - 1) { c = 0; r += 2; }
        if (r >= b.h) { r = 0; }
      }
    }
    ok(laid > 10, edition + ": the rail laid " + laid + " things");
    const { diagnostics } = checkBoard(b);
    const errs = diagnostics.filter(x => x.severity === "error");
    eq(errs.map(x => x.code + " " + x.message).slice(0, 3), [],
       edition + ": everything the rail can lay produces a board the validator accepts");
  }
}

/* --- the course workshop ------------------------------------------------------
 * The layout is chosen so two rules that AGREE on a tidy 3x3 of twelve-square
 * boards disagree here:
 *
 *   big   12x12 at (0,0)
 *   dock   6x2  at (6,12)      -- BESIDE and below, and not twelve by four
 *   small  6x6  at (12,12)
 *
 * The dock's real footprint is (6..11, 12..13). A hardcoded twelve-by-four box
 * from the same origin would be (6..17, 12..15), which swallows part of the 6x6
 * -- so a flag at (13,13) is legal under the derived rule and "inside the
 * starting block" under the old one. That is the only kind of layout that can
 * tell them apart, and the old assembler could not express it at all.
 */
{
  const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures");
  const big = checkBoardDocument(JSON.parse(readFileSync(join(FIX, "provingGroundClassic.json"), "utf8")), "provingGroundClassic").board;
  big.id = "big";
  const lib = new Map([["big", big]]);

  const dock = blankBoard({ id: "dock6", name: "Dock", w: 6, h: 2, edition: "classic", set: "authored", origin: "authored" });
  for (let c = 0; c < 6; c++) setCell(dock, c, 0, "s" + (c + 1) + ".");
  lib.set("dock6", dock);

  const small = blankBoard({ id: "small", name: "Small", w: 6, h: 6, edition: "classic", set: "authored", origin: "authored" });
  lib.set("small", small);

  const course = newCourse("beside");
  eq(place(course, lib, "big", 0, [0, 0]), 0, "compose: the first board goes down at the origin");
  eq(place(course, lib, "big", 0, [6, 6]), -1, "compose: an overlapping placement is refused");
  ok(place(course, lib, "dock6", 0, [6, 12], "dock") > 0, "compose: a 6x2 dock goes BESIDE the boards, not under them");
  ok(place(course, lib, "small", 0, [12, 12]) > 0, "compose: a 6x6 joins on beyond the dock");
  eq(place(course, lib, "dock6", 0, [0, 20], "dock"), -1, "compose: a second dock is refused");

  const snaps = snapTargets(course, lib, "small", 0);
  ok(snaps.length > 3, "compose: snapping offers " + snaps.length + " edge-adjacent positions");
  ok(snaps.every(t => {
    const [w, h] = stampDims(lib.get("small"), 0);
    return !course.stamps.some(st2 => {
      const f = stampFootprint(st2, lib.get(st2.board));
      return t.at[0] <= f.x1 && f.x0 <= t.at[0] + w - 1 && t.at[1] <= f.y1 && f.y0 <= t.at[1] + h - 1;
    });
  }), "compose: no snap target overlaps something already down");

  const smallIdx = stampAt(course, lib, 13, 13);
  ok(smallIdx >= 0, "compose: stampAt finds the board under a square");
  ok(turn(course, lib, smallIdx, 1), "compose: a placed board turns in place");

  /* flags: the array index IS the number, so inserting renumbers */
  const { grid } = assemble(course, lib);
  ok(flagWouldFit(grid, 4, 6), "compose: (4,6) is plain floor and would take a flag");
  addFlag(course, 4, 6);
  addFlag(course, 5, 6);
  addFlag(course, 13, 13);
  addFlag(course, 6, 6, 0);
  eq(course.flags[0], [6, 6], "compose: a flag inserted at 0 becomes flag 1 and renumbers the rest");
  eq(flagAt(course, 4, 6), 1, "compose: and the one that was first is now second");
  ok(!addFlag(course, 4, 6), "compose: two flags on one square is refused");
  removeFlag(course, 0);
  eq(course.flags, [[4, 6], [5, 6], [13, 13]], "compose: and taken off again");
  moveFlag(course, 2, 0);
  eq(course.flags[0], [13, 13], "compose: a flag can be moved earlier in the race");
  moveFlag(course, 0, 2);
  eq(course.flags, [[4, 6], [5, 6], [13, 13]], "compose: and back");

  /* Shifting EVERY stamp by the same amount must leave the assembled grid and
   * the flag coordinates untouched -- the grid's origin moved with them.
   * Shifting ONE board is a different thing: that is a move, and it is allowed
   * to strand a flag, which the validator then reports. */
  {
    const before = assemble(course, lib);
    const flagsBefore = JSON.stringify(course.flags);
    for (const st2 of course.stamps) { st2.at[0] -= 4; st2.at[1] -= 4; }
    normalise(course, lib);
    ok(course.stamps.every(st2 => st2.at[0] >= 0 && st2.at[1] >= 0),
       "compose: normalise puts the course back at the origin");
    eq(assemble(course, lib).grid.cells.join("|"), before.grid.cells.join("|"),
       "compose: and the assembled grid is unchanged");
    eq(JSON.stringify(course.flags), flagsBefore,
       "compose: and the flags did NOT move -- the origin moved under them");
  }

  course.maxPlayers = 6;
  const d = sink();
  const parsed = courseFromDocument(JSON.parse(JSON.stringify(toDocument(course))), d, "beside");
  if (parsed) validateCourse(parsed, lib, d);
  eq(d.items.filter(x => x.severity === "error").map(x => x.code + " " + x.message), [],
     "compose: a 6x2 dock beside a 12x12, with a flag where a 12x4 box would have swallowed it");
}

/* --- the zoom floor must clear the biggest course --------------------------
 * Fit clamps to ZOOM_MIN, so a floor above what the largest course needs makes
 * Fit silently do nothing on exactly the courses that most need it. Measured
 * against the assembled size of every shipped course rather than a guess. */
{
  const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  const idx = JSON.parse(readFileSync(join(DATA, "index.json"), "utf8"));
  const lib = new Map();
  for (const row of idx.boards) {
    lib.set(row.id, checkBoardDocument(JSON.parse(readFileSync(join(DATA, "boards", row.id + ".json"), "utf8")), row.id).board);
  }
  let biggest = { id: null, w: 0, h: 0 };
  for (const row of idx.courses) {
    const d2 = sink();
    const c = courseFromDocument(JSON.parse(readFileSync(join(DATA, "courses", row.id + ".json"), "utf8")), d2, row.id);
    if (!c) continue;
    const { grid } = assemble(c, lib);
    if (grid.w * grid.h > biggest.w * biggest.h) biggest = { id: row.id, w: grid.w, h: grid.h };
  }
  /* a 900x600 stage is a modest laptop window with both panels open */
  const need = Math.min((900 - 48) / (biggest.w * 100), (600 - 48) / (biggest.h * 100));
  ok(ZOOM_MIN <= need, "view: the zoom floor " + ZOOM_MIN + " clears the biggest course (" +
     biggest.id + ", " + biggest.w + "x" + biggest.h + ", needs " + need.toFixed(3) + ")");
  /* and a three-by-three of twelve-square boards, which nothing ships yet */
  const need33 = Math.min((900 - 48) / 3600, (600 - 48) / 3600);
  ok(ZOOM_MIN <= need33, "view: and a 3x3 of twelve-square boards (needs " + need33.toFixed(3) + ")");
}

console.log((failed ? "FAILED " : "ok ") + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
