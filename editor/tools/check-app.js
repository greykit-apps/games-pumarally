/* The editor's tool logic, tested without a DOM.
 *
 * Most of what a tool does is REFUSE, and a refusal that silently does nothing
 * teaches nobody anything -- the status line is where the rules actually get
 * learned. So each refusal is asserted to happen AND to say why.
 */

import { blankBoard, setCell, cellAt, levelAt, wallDevicesAt, ceilingAt } from "../lib/board.js";
import { wallAt, setWall, edgeOf, edgeCodeAt, EDGE_WALL, EDGE_DOOR, EDGE_NONE } from "../lib/edges.js";
import { N, E, S, W, opposite } from "../lib/dir.js";
import { apply, erase, describe, blankToolState, toolsFor, TOOLS, RESERVED, mountEdge, whatNeedsEdge } from "../app/tools.js";
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

const fresh = (w = 8, h = 8) =>
  blankBoard({ id: "t", name: "T", w, h, set: "authored", origin: "authored" });

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
  /* EVERY ELEMENT AND DEVICE MUST BE ON THE RAIL. Having an entry in the
   * registry is not enough -- the rail used to filter by a board's declared
   * edition, and a board started classic, so nine elements and the whole of
   * elevation had no route to a square at all. Water was simply not an option
   * anywhere. The fix was not a better filter: a board is just a board, and
   * which of its squares matter is the engine's business at play time. */
  {
    const offered = new Set(toolsFor(true).map(t => t.key));
    const stranded = [
      ...Object.values(ELEMENTS).filter(d => !offered.has("el:" + d.key)).map(d => "element " + d.key),
      ...Object.keys(DEVICE_KINDS).filter(k => !offered.has("dev:" + k)).map(k => "device " + k)
    ];
    eq(stranded, [], "rail: every element and every device is on the rail");
    for (const key of ["el:water", "el:ramp", "el:repairSite", "dev:crusher", "dev:jet"]) {
      ok(offered.has(key), "rail: " + key + " is offered, whatever printing it comes from");
    }
  }

  ok(!toolsFor(false).some(t => t.courseOnly), "rail: the flag tool is not in a board's rail");
  ok(toolsFor(true).some(t => t.key === "flag"), "rail: the flag tool is in a course's rail");
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
 * would let you draw something it then will not let you save. And since a board
 * no longer declares an edition, THE SAME BOARD carries the whole catalogue --
 * batteries and wrenches at once, which is exactly what the user will build. */
{
  const b = fresh(12, 12);
  const st = blankToolState();
  let laid = 0, c = 0, r = 0;
  for (const tool of toolsFor(false)) {
    if (tool.kind === "select" || tool.kind === "pan" || tool.kind === "flag") continue;
    const times = tool.arg === "pair" ? 2 : 1;
    for (let i = 0; i < times; i++) {
      st.tool = tool.key; st.dir = E;
      const res = apply(b, st, c, r);
      if (res.ok && res.changed) laid++;
      c += 2; if (c >= b.w - 1) { c = 0; r += 2; }
      if (r >= b.h) r = 1;
    }
  }
  ok(laid > 20, "rail: one board took " + laid + " different things, from both printings");
  const { diagnostics } = checkBoard(b);
  eq(diagnostics.filter(x => x.severity === "error").map(x => x.code + " " + x.message).slice(0, 3), [],
     "rail: a board carrying the whole catalogue at once validates");
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
