/* The editor's tool logic, tested without a DOM.
 *
 * Most of what a tool does is REFUSE, and a refusal that silently does nothing
 * teaches nobody anything -- the status line is where the rules actually get
 * learned. So each refusal is asserted to happen AND to say why.
 */

import {
  blankBoard, setCell, cellAt, levelAt, wallDevicesAt, ceilingAt, deviceCell,
  sitesAt, setSites, flagSpots, propAt
} from "../lib/board.js";
import { wallAt, setWall, edgeOf, edgeCodeAt, EDGE_WALL, EDGE_DOOR, EDGE_NONE } from "../lib/edges.js";
import { N, E, S, W, opposite, DC, DR, dirLetter } from "../lib/dir.js";
import {
  apply, erase, describe, blankToolState, toolsFor, TOOLS, RESERVED, mountEdge, whatNeedsEdge,
  setArms, toggleArm, turnHere, setDeviceRegs, setDeviceField, newStroke
} from "../app/tools.js";
import { ZOOM_MIN, ZOOM_MAX } from "../app/view.js";
import { checkBoard } from "../validate/index.js";
import { ELEMENTS } from "../rulesets/elements.js";
import {
  newCourse, place, turn, remove, moveStamp, stampAt, snapTargets, nearestSnap,
  normalise, addFlag, removeFlag, moveFlag, flagAt, toDocument, flagWouldFit
} from "../app/compose.js";
import {
  assemble, stampFootprint, stampDims, suggestFlags, usableFlagSpots, flagRefusal
} from "../lib/course.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { sink } from "../validate/diagnostic.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoardDocument } from "../validate/index.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { SITES, SITE_ORDER } from "../rulesets/sites.js";

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
      ...Object.keys(DEVICE_KINDS).filter(k => !offered.has("dev:" + k)).map(k => "device " + k),
      ...SITE_ORDER.filter(k => !offered.has("site:" + k)).map(k => "site " + k)
    ];
    eq(stranded, [], "rail: every element and every device is on the rail");
    for (const key of ["el:water", "el:ramp", "site:repair", "site:battery", "site:flagspot",
                       "dev:crusher", "dev:jet"]) {
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

/* --- one press-and-drag paints each square once ------------------------------
 *
 * The regression this exists for: holding the button down emits a stream of
 * pointermove events even when the pointer has not left the square, the editor
 * painted on every one of them, and the SITE tools toggle. So pressing "flag
 * location" on a square set it, and the next dozen pointer events cleared it,
 * set it, cleared it -- and whether a mark survived came down to the parity of
 * a hand tremor. It read as the tool simply not working.
 *
 * The stroke is tested here rather than through the pointer handler because
 * that handler needs a DOM this tree has no dependency for. What is asserted is
 * the property the handler relies on: a square is offered ONCE per stroke. */
{
  const h = (c, r, face = null) => ({ c, r, face, inside: true });

  /* A CELL TOOL IGNORES THE FACE, and this is the case the first version of
   * this test missed by feeding it tidy `face: null` hits throughout. `hit()`
   * hands back a face whenever the pointer is within EDGE_BAND of an edge, so a
   * real drag entering a square near its rim and settling at its centre
   * produces TWO hits on one square with different faces. Keyed on the face
   * that was two keys, the square was painted twice, and a site toggled itself
   * off again -- the very bug this block exists for, reintroduced by its fix
   * and missed by its test. Every stroke assertion here now varies the face. */
  const s1 = newStroke(false);
  ok(s1.wants(h(2, 2, W)), "stroke: the square under the press is painted");
  ok(!s1.wants(h(2, 2)), "stroke: the same square is not painted twice in one stroke");
  ok(!s1.wants(h(2, 2, N)), "stroke: nor when the pointer drifts to another of its edges");
  ok(s1.wants(h(3, 2, W)), "stroke: dragging onto a new square paints it");
  ok(!s1.wants(h(3, 2)), "stroke: and only once, however the pointer crosses it");
  ok(!s1.wants(h(2, 2)), "stroke: dragging back over a square does not toggle it again");
  eq(s1.size, 2, "stroke: two squares painted across the drag");

  /* An edge tool aims at a face, so running along a wall line has to keep
   * marking -- the square repeats and the face does not. */
  const s2 = newStroke(true);
  ok(s2.wants(h(4, 4, N)), "stroke: an edge is painted");
  ok(!s2.wants(h(4, 4, N)), "stroke: the same edge is not painted twice");
  ok(s2.wants(h(4, 4, E)), "stroke: a different face of one square is a different edge");

  ok(!newStroke(false).wants(null), "stroke: a pointer off the board paints nothing");
  ok(!newStroke(false).wants({ c: 1, r: 1, face: null, inside: false }), "stroke: nor one outside it");

  /* And the toggle itself, which is what made the repaint visible. */
  const b = fresh();
  const st = blankToolState();
  st.tool = "site:flagspot";
  apply(b, st, 1, 1);
  eq(sitesAt(b, 1, 1), ["flagspot"], "site: a flag location is laid");
  apply(b, st, 1, 1);
  eq(sitesAt(b, 1, 1), [], "site: laying it again takes it off -- the tool toggles");
}

/* --- refusals that name the square ------------------------------------------ */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "el:pit";
  apply(b, st, 2, 2);
  st.tool = "dev:crusher";
  refused(apply(b, st, 2, 2), "ceiling: a disc over a pit");
  st.tool = "dev:crusher";
  ok(apply(b, st, 3, 3).changed, "ceiling: a disc over floor");
  refused(apply(b, st, 3, 3), "ceiling: two discs on one square");
  st.tool = "el:pit";
  refused(apply(b, st, 3, 3), "ground: digging a pit under a disc");
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

/* --- a flame jet is wall-mounted and reaches one or two squares ---------------
 * All three halves of that matter and each is asserted separately: it needs a
 * wall to bolt to, the flame starts at the NOZZLE'S OWN SQUARE, and it runs
 * FORWARD from there. There is exactly one reach-two jet across all seventeen
 * shipped boards, so the directional case is thin in the real data and has to
 * be pinned down here instead. */
{
  const b = fresh(8, 8);
  const st = blankToolState();
  st.tool = "dev:jet"; st.dir = E; st.reach = 2; st.regs.jet = [2, 4];
  const res = apply(b, st, 3, 3);
  ok(res.ok, "jet: a flame jet goes down");
  eq(wallAt(b, 3, 3, W), EDGE_WALL, "jet: wall-mounted -- it raised the wall behind its nozzle");
  const dev = b.wallDevices.find(d => d.kind === "jet");
  eq(dev.reach, 2, "jet: reach two is carried");
  eq(deviceCell(dev), [3, 3], "jet: the nozzle stands in the square clicked");

  const covers = (c, r) => {
    const cell = deviceCell(dev);
    const reach = dev.reach === undefined ? 1 : dev.reach;
    let [cc, rr] = cell;
    for (let i = 0; i < reach; i++) { if (cc === c && rr === r) return true; cc += DC[dev.face]; rr += DR[dev.face]; }
    return false;
  };
  ok(covers(3, 3), "jet: the flame covers the nozzle's own square");
  ok(covers(4, 3), "jet: and the square in FRONT of it");
  ok(!covers(2, 3), "jet: and not the one behind, which is where the wall is");
  eq(checkBoard(b).ok, true, "jet: a reach-two jet with room in front validates");

  /* reach one is the default and is not written, so a plain jet formats the way
   * it did before reach existed */
  const b1 = fresh(8, 8);
  const st1 = blankToolState();
  st1.tool = "dev:jet"; st1.dir = E; st1.reach = 1;
  apply(b1, st1, 3, 3);
  eq(b1.wallDevices[0].reach, undefined, "jet: reach one is the default and is left unwritten");

  /* the second square has to be there and has to be reachable */
  const edge = fresh(8, 8);
  const st2 = blankToolState();
  st2.tool = "dev:jet"; st2.dir = E; st2.reach = 2;
  apply(edge, st2, 7, 3);                       // the east rim: nothing in front
  ok(!checkBoard(edge).ok, "jet: a reach-two jet at the rim is refused -- its second square is off the board");
  const walled = fresh(8, 8);
  const st3 = blankToolState();
  st3.tool = "dev:jet"; st3.dir = E; st3.reach = 2;
  apply(walled, st3, 3, 3);
  setWall(walled, 3, 3, E, EDGE_WALL);
  ok(!checkBoard(walled).ok, "jet: and one whose flame is stopped by a wall after the first square");
}

/* --- sites: markings a square carries as well as being floor -------------------
 * The reason this layer exists is that more than one can share a square. The
 * same printed floor is a wrench in one game and a battery in the other, and a
 * flag location has to be able to sit on either -- so the tool TOGGLES rather
 * than replaces, and none of these cases may refuse a stack. */
{
  const b = fresh();
  const st = blankToolState();

  st.tool = "site:repair";
  ok(apply(b, st, 2, 2).changed, "site: a repair site goes on plain floor");
  eq(sitesAt(b, 2, 2), ["repair"], "site: and is the only marking there");

  st.tool = "site:battery";
  ok(apply(b, st, 2, 2).changed, "site: a battery goes on the SAME square");
  eq(sitesAt(b, 2, 2), ["repair", "battery"], "site: both, in canonical order");

  st.tool = "site:flagspot";
  ok(apply(b, st, 2, 2).changed, "site: and a flag location on top of both");
  eq(sitesAt(b, 2, 2), ["repair", "battery", "flagspot"], "site: three markings on one square");
  eq(checkBoard(b).ok, true, "site: which is a board the validator accepts");

  /* the engine's question, answered from the square rather than from which of
   * the two spellings happened to be used */
  eq(propAt(b, 2, 2, "repair"), 1, "site: the square repairs");
  eq(propAt(b, 2, 2, "energy"), 1, "site: and gives energy; the ruleset picks which is live");

  st.tool = "site:repair";
  ok(apply(b, st, 2, 2).changed, "site: clicking a marking again takes it off");
  eq(sitesAt(b, 2, 2), ["battery", "flagspot"], "site: and leaves the others alone");

  /* one wrench or two, never both */
  setSites(b, 2, 2, ["repair", "battery", "flagspot"]);
  st.tool = "site:upgrade";
  refused(apply(b, st, 2, 2), "site: an upgrade site on a square already marked with one wrench");
  eq(sitesAt(b, 2, 2), ["repair", "battery", "flagspot"], "site: and the square is untouched by the refusal");

  /* markings sit on plain floor, and the square cannot stop being floor under them */
  st.tool = "el:pit";
  refused(apply(b, st, 2, 2), "site: digging a pit under a marking");
  setCell(b, 4, 4, "o..");
  st.tool = "site:battery";
  refused(apply(b, st, 4, 4), "site: a battery on a pit");

  /* flag locations are countable, which is what the engine chooses from */
  const m = fresh(10, 10);
  for (const [c, r] of [[1, 1], [3, 3], [5, 5], [7, 7], [9, 9]]) setSites(m, c, r, ["flagspot"]);
  eq(flagSpots(m).length, 5, "site: flag locations can be counted off a board");
  setSites(m, 5, 5, ["flagspot", "upgrade", "battery"]);
  eq(flagSpots(m).length, 5, "site: and stacking more onto one does not change the count");
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

/* --- one control, whichever end you are at ------------------------------------
 * The rail's "in hand" panel and the selected-square panel are built from the
 * same rows, so the shape you pick before laying a belt and the shape you fix
 * afterwards are the same seven buttons with the same wording. There used to be
 * two vocabularies -- seven shape characters in one place, three arm toggles in
 * the other -- and which you got depended on whether you were about to lay a
 * belt or repair one.
 *
 * The rows are built in panels.js, which touches the DOM; what is testable here
 * is that the OPERATIONS behind them line up, so the same click means the same
 * thing at both ends. */
{
  const b = fresh();
  const st = blankToolState();

  /* laying with a shape in hand, and fixing to that shape afterwards, must
   * arrive at exactly the same square */
  for (const arm of ["l", "r", "L", "R", "x", "X", "."]) {
    const laid = fresh();
    const hand = blankToolState();
    hand.tool = "el:conveyor"; hand.dir = E; hand.arms = arm;
    apply(laid, hand, 2, 2);

    const fixed = fresh();
    const plain = blankToolState();
    plain.tool = "el:conveyor"; plain.dir = E; plain.arms = ".";
    apply(fixed, plain, 2, 2);
    setArms(fixed, 2, 2, arm);

    eq(cellAt(fixed, 2, 2), cellAt(laid, 2, 2),
       "one control: laying with shape " + JSON.stringify(arm) + " and fixing to it agree");
  }

  /* and the same for facing */
  for (const d of [N, E, S, W]) {
    const laid = fresh();
    const hand = blankToolState();
    hand.tool = "el:conveyor"; hand.dir = d; hand.arms = "l";
    apply(laid, hand, 2, 2);

    const fixed = fresh();
    const plain = blankToolState();
    plain.tool = "el:conveyor"; plain.dir = N; plain.arms = "l";
    apply(fixed, plain, 2, 2);
    const now = "^>v<".indexOf(cellAt(fixed, 2, 2).charAt(1));
    turnHere(fixed, 2, 2, (d - now + 4) % 4);

    eq(cellAt(fixed, 2, 2), cellAt(laid, 2, 2),
       "one control: laying facing " + dirLetter(d) + " and turning to it agree");
  }
}

/* --- editing what is already down ---------------------------------------------
 * The rail decides what goes down; these change what is already there. A belt
 * whose arms are wrong has to be fixable without laying it again, because
 * re-laying it loses the facing, and on a square with a device it loses more. */
{
  const b = fresh();
  const st = blankToolState();
  st.tool = "el:conveyor"; st.dir = E; st.arms = ".";
  apply(b, st, 2, 2);
  eq(cellAt(b, 2, 2), "b>.", "edit: a plain straight went down");

  ok(setArms(b, 2, 2, "l").changed, "edit: its arms can be changed where it stands");
  eq(cellAt(b, 2, 2), "b>l", "edit: and only the arms character moved");

  ok(toggleArm(b, 2, 2, "back").changed, "edit: one arm can be toggled on its own");
  eq(cellAt(b, 2, 2), "b>L", "edit: left plus back is a T-merge");
  toggleArm(b, 2, 2, "back");
  eq(cellAt(b, 2, 2), "b>l", "edit: and off again");

  /* the set can never be emptied: a belt with no arms behaves exactly as a
   * plain straight, so there is no code point for it */
  toggleArm(b, 2, 2, "left");
  eq(cellAt(b, 2, 2), "b>.", "edit: clearing the last arm falls back to the rear one");

  refused(setArms(b, 3, 3, "l"), "edit: arms on a square that is not a belt");
  refused(setArms(b, 2, 2, "Z"), "edit: an arms character that is not one of the seven");

  /* turning what is already there */
  ok(turnHere(b, 2, 2, 1).changed, "edit: a placed belt turns where it stands");
  eq(cellAt(b, 2, 2), "bv.", "edit: east turned once is south");
  eq(turnHere(b, 2, 2, 1).changed && cellAt(b, 2, 2), "b<.", "edit: and again");
  st.tool = "el:pit"; apply(b, st, 4, 4);
  refused(turnHere(b, 4, 4, 1), "edit: turning a pit, which has no facing");
}

{
  /* a device turns WITH ITS MOUNT: the wall follows it round, or the board goes
   * red the moment you turn anything */
  const b = fresh();
  const st = blankToolState();
  st.tool = "dev:laser"; st.dir = S; st.damage = 2;
  apply(b, st, 4, 4);
  const dev = b.wallDevices[0];
  eq(wallAt(b, 4, 4, N), EDGE_WALL, "edit: the laser mounted on its north wall");
  ok(turnHere(b, 4, 4, 1, dev).changed, "edit: and turns");
  eq(dev.face, W, "edit: south turned once is west");
  eq(wallAt(b, 4, 4, E), EDGE_WALL, "edit: its mount moved to the east wall");
  eq(checkBoard(b).ok, true, "edit: and the board is still valid after turning it");

  ok(setDeviceField(dev, "damage", 3).changed, "edit: a laser's damage can be changed");
  eq(dev.damage, 3, "edit: it took");
  refused(setDeviceField(dev, "damage", 9), "edit: damage outside one to three");
  refused(setDeviceField(dev, "reach", 2), "edit: a laser has no reach");

  st.tool = "dev:jet"; st.dir = E; st.reach = 1;
  apply(b, st, 2, 6);
  const jet = b.wallDevices.find(d => d.kind === "jet");
  ok(setDeviceField(jet, "reach", 2).changed, "edit: a jet's reach can be changed");
  eq(jet.reach, 2, "edit: reach two is written");
  setDeviceField(jet, "reach", 1);
  eq(jet.reach, undefined, "edit: and reach one is written by not writing it");

  ok(setDeviceRegs(jet, [1, 3, 5]).changed, "edit: a jet's registers can be changed");
  eq(jet.regs, [1, 3, 5], "edit: they took");
  setDeviceRegs(jet, []);
  eq(jet.regs, undefined, "edit: and every register is spelled by removing the list");
  refused(setDeviceRegs(b.wallDevices.find(d => d.kind === "laser"), [1]), "edit: registers on a laser");
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
  const big = checkBoardDocument(JSON.parse(readFileSync(join(FIX, "provingGround.json"), "utf8")), "provingGround").board;
  big.id = "big";
  const lib = new Map([["big", big]]);

  const dock = blankBoard({ id: "dock6", name: "Dock", w: 6, h: 2, set: "authored", origin: "authored" });
  for (let c = 0; c < 6; c++) setCell(dock, c, 0, "s" + (c + 1) + ".");
  lib.set("dock6", dock);

  const small = blankBoard({ id: "small", name: "Small", w: 6, h: 6, set: "authored", origin: "authored" });
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

  /* --- suggesting flags from what the boards mark ----------------------------
   * A board says where a flag MAY go; a course says where the flags ARE. The
   * marks exist so that when the computer offers a set it picks from squares
   * the board's author was willing to see raced to, rather than from anywhere
   * on the floor. */
  {
    for (const [c, r] of [[2, 2], [9, 2], [5, 6], [2, 9], [9, 9]]) setSites(big, c, r, ["flagspot"]);
    setSites(big, 0, 0, ["flagspot"]);            // deliberately the corner of its board
    setSites(small, 1, 1, ["flagspot"]);
    setSites(small, 4, 4, ["flagspot"]);

    const asm = assemble(course, lib);
    const usable = usableFlagSpots(course, lib, asm);
    ok(usable.length >= 6, "suggest: " + usable.length + " marked squares are usable");
    ok(!usable.some(s2 => s2.c === 0 && s2.r === 0),
       "suggest: a mark in a board's corner is not offered -- the validator would refuse it");
    ok(flagRefusal(course, lib, asm, 0, 0), "suggest: and the refusal says why");

    const three = suggestFlags(course, lib, { count: 3, asm });
    eq(three.length, 3, "suggest: three flags when three are asked for");
    let bad = [];
    for (const [c, r] of three) {
      if (flagRefusal(course, lib, asm, c, r)) bad.push("(" + c + "," + r + ") refused");
      if (!usable.some(s2 => s2.c === c && s2.r === r)) bad.push("(" + c + "," + r + ") not marked");
    }
    eq(bad, [], "suggest: every offered flag is marked by a board AND accepted by the validator");
    eq(new Set(three.map(f => f.join(","))).size, 3, "suggest: no square offered twice");

    const each = suggestFlags(course, lib, { perBoard: true, asm });
    const boards = new Set(each.map(([c, r]) => (usable.find(s2 => s2.c === c && s2.r === r) || {}).board));
    eq(boards.size, each.length, "suggest: one per board means one from each board");
    ok(boards.size >= 2, "suggest: and it reached both boards that mark any");

    const withOffer = JSON.parse(JSON.stringify(toDocument(course)));
    withOffer.flags = three;
    withOffer.maxPlayers = 6;
    const dd = sink();
    const parsed2 = courseFromDocument(withOffer, dd, "beside");
    if (parsed2) validateCourse(parsed2, lib, dd);
    eq(dd.items.filter(x => x.severity === "error").map(x => x.code), [],
       "suggest: a suggested set of flags validates as a course");

    const bare = newCourse("bare");
    const blank = blankBoard({ id: "blank", name: "Blank", w: 8, h: 8, set: "authored", origin: "authored" });
    const bareLib = new Map([["blank", blank]]);
    place(bare, bareLib, "blank", 0, [0, 0]);
    eq(suggestFlags(bare, bareLib), [], "suggest: a board marking nothing offers nothing");
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
