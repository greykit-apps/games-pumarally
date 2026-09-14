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
import { checkBoard } from "../validate/index.js";
import { ELEMENTS } from "../rulesets/elements.js";
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
  const classic = toolsFor("classic", false).map(t => t.key);
  ok(!classic.includes("el:energySpace"), "rail: a classic board is not offered a battery");
  ok(!classic.includes("dev:crusher"), "rail: a classic board is not offered a crusher");
  ok(classic.includes("dev:jet"), "rail: a classic board is offered a flame jet");
  ok(!toolsFor("modern", false).map(t => t.key).includes("el:repairSite"), "rail: a modern board is not offered a repair site");
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

console.log((failed ? "FAILED " : "ok ") + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
