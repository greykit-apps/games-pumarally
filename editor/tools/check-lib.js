/* Unit tests for the format library: dir, registers, token, edges, rotate, canon.
 *
 * Every assertion in here has been WATCHED FAIL against a deliberately broken
 * copy of the thing it tests. That is not a figure of speech: the device-facing
 * assertion below exists because the first version of this file passed with
 * rotation leaving every laser and pusher pointing the wrong way. Four turns is
 * still the identity when a face never turns at all, and the serialized bytes
 * still match, so nothing else in the file could see it.
 */

import { rot, opposite, turnBetween, dirOfChar, dirLetter, N, E, S, W } from "../lib/dir.js";
import { firesIn, canonRegs, checkRegs, describeRegs } from "../lib/registers.js";
import {
  readToken, writeToken, armsOf, absoluteArms, armsFromAbsolute, beltTurn,
  relativeSide, ARM_CHARS
} from "../lib/token.js";
import {
  edgeOf, edgeId, parseEdge, faceCell, isNormalOf, rotateEdge, rotateFace,
  edgeInBounds, setWall, wallAt, EDGE_WALL, EDGE_DOOR
} from "../lib/edges.js";
import {
  blankBoard, setCell, setLevel, levelAt, boardFromDocument, idx, deviceCell, laserPath, docksOf
} from "../lib/board.js";
import { rotateBoard, rotateOnce, rotatedDims } from "../lib/rotate.js";
import { boardJSON } from "../lib/canon.js";
import { toPicture, fromPicture } from "../lib/picture.js";
import { sink } from "../validate/diagnostic.js";
import { ELEMENTS, checkArg, elemOf } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { SETS, EDITIONS } from "../rulesets/sets.js";

let passed = 0, failed = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; return; }
  failed++;
  console.error("FAIL " + m + "\n  got      " + JSON.stringify(a) + "\n  expected " + JSON.stringify(b));
};
const ok = (v, m) => eq(!!v, true, m);

/* --- dir ------------------------------------------------------------------ */
eq(rot(N, 1), E, "dir: a right turn is +1");
eq(rot(W, 1), N, "dir: a right turn wraps");
eq(rot(N, -1), W, "dir: a left turn is -1");
eq(opposite(N), S, "dir: opposite");
eq(turnBetween(N, E), 1, "dir: turnBetween is +1 for a right turn");
eq(turnBetween(N, W), -1, "dir: turnBetween is -1 rather than 3 for a left turn");
eq(turnBetween(N, S), 2, "dir: turnBetween is 2 for an about face");
eq(dirOfChar("x"), undefined, "dir: a character that is not an arrow");

/* --- registers ------------------------------------------------------------ */
eq(firesIn(null, 3), true, "regs: an absent list fires in every register");
eq(firesIn([1, 3, 5], 2), false, "regs: a listed device does not fire off its list");
eq(canonRegs([5, 1, 3, 1]), [1, 3, 5], "regs: canon sorts and de-duplicates");
eq(canonRegs([1, 2, 3, 4, 5]), null, "regs: all five collapses to the absent spelling");
eq(checkRegs([]).length, 1, "regs: an empty list is refused");
eq(checkRegs([1, 2, 3, 4, 5]).length, 1, "regs: all five is refused");
eq(checkRegs([3, 1]).length, 1, "regs: a descending list is refused");
eq(checkRegs([0]).length, 1, "regs: register 0 is refused");
eq(checkRegs(undefined, { required: true }).length, 1, "regs: a door must name its registers");
eq(describeRegs([1, 3, 5]), "registers 1, 3 and 5", "regs: prose");

/* --- elements ------------------------------------------------------------- */
{
  const chars = Object.keys(ELEMENTS);
  const keys = chars.map(c => ELEMENTS[c].key);
  eq(new Set(keys).size, keys.length, "elements: keys are unique");
  eq(chars.every(c => c.length === 1), true, "elements: every legend entry is one character");
  eq(checkArg(elemOf("b"), "."), "takes no argument, so it needs a '.'".slice(0, 0) || checkArg(elemOf("b"), "."),
     "elements: a conveyor needs a direction");
  ok(checkArg(elemOf("b"), "^") === null, "elements: a conveyor accepts an arrow");
  ok(checkArg(elemOf("."), "^") !== null, "elements: floor takes no argument");
  ok(checkArg(elemOf("s"), "9") !== null, "elements: there is no bay 9");
  /* `printedIn` is PROVENANCE and nothing in the format may treat it as a
   * constraint: a board is just a board, and which of its squares matter is the
   * engine's business at play time. */
  eq(elemOf("w").printedIn, ["classic"], "elements: a repair site records which printing prints it");
  eq(typeof elemOf("w").editions, "undefined", "elements: and there is no `editions` field to gate on");
  // the two elements that share a name across printings must be separate entries
  const oils = chars.filter(c => ELEMENTS[c].props.oil);
  const portals = chars.filter(c => ELEMENTS[c].props.portal);
  eq(oils.length, 2, "elements: classic and modern oil are separate entries -- different rules, not a variant");
  eq(portals.length, 2, "elements: classic and modern portals are separate entries");
}

/* --- devices and sets ----------------------------------------------------- */
for (const [k, d] of Object.entries(DEVICE_KINDS)) {
  ok(d.layer === "wall" || d.layer === "ceiling", "devices: " + k + " names a layer");
  ok(!(d.layer === "ceiling" && d.faced), "devices: " + k + " -- no ceiling device has a face");
  ok(Array.isArray(d.printedIn) && !d.editions, "devices: " + k + " records its printing as provenance");
}
for (const [id, s] of Object.entries(SETS)) {
  ok(s.edition === "both" || EDITIONS[s.edition], "sets: " + id + " names a real printing");
}

/* Facts about a flame jet, off the Crash and Burn sheet and board G. Each is a
 * number or a flag somebody could widen without noticing, and the range is the
 * rule rather than a convenience: a jet reaches one square or two, never three. */
{
  const jet = DEVICE_KINDS.jet;
  eq(jet.layer, "wall", "jet: a flame jet is wall-mounted");
  eq(jet.needsWall, true, "jet: and needs a wall behind it to bolt to");
  eq(jet.faced, true, "jet: it faces the way the flame plays");
  eq([jet.fields.reach.min, jet.fields.reach.max], [1, 2],
     "jet: it reaches one or two squares, and never three");
  eq(jet.fields.reach.default, 1, "jet: one is the default, so a plain jet writes no reach at all");
}

/* --- token and arms -------------------------------------------------------- */
eq(readToken("b>"), null, "token: a short token is refused rather than read short");
eq(writeToken("b", ">", "r"), "b>r", "token: write");
eq(absoluteArms("b>l", E), [N], "arms: an east belt's left arm is north");
eq(absoluteArms("b>r", E), [S], "arms: an east belt's right arm is south");
eq(absoluteArms("b>.", E), [W], "arms: a plain straight's one arm is at its rear");
eq(armsOf("..."), null, "arms: floor has no arms");
eq(relativeSide(E, E), null, "arms: the exit side has no relative slot");
eq(armsFromAbsolute(E, [E]), ".", "arms: an arm on the exit side has no code point");
for (const ch of ARM_CHARS) {
  for (const d of [N, E, S, W]) {
    const tok = "b" + "^>v<".charAt(d) + ch;
    eq(armsFromAbsolute(d, absoluteArms(tok, d)), ch, "arms: " + ch + " round-trips through absolute at dir " + d);
  }
}
eq(beltTurn("b>l", E, N), -1, "arms: an arm on the left turns the robot left");
eq(beltTurn("b>r", E, S), 1, "arms: an arm on the right turns the robot right");
eq(beltTurn("b>.", E, W), 0, "arms: the rear arm turns nobody");
eq(beltTurn("b>.", E, N), null, "arms: no arm on that side is not a turn of zero");

/* --- edges ---------------------------------------------------------------- */
eq(edgeOf(3, 4, E), edgeOf(4, 4, W), "edges: one storage slot per edge");
eq(parseEdge("q:1,1"), null, "edges: a bad edge kind is refused");
eq(faceCell({ kind: "v", c: 2, r: 1 }, W), [1, 1], "edges: the cell a west-facing device stands in");
ok(!isNormalOf("h", E), "edges: east is not a normal of a horizontal edge");
{
  // the closed-form rotation, checked against the cell mapping derived separately
  const W0 = 12, H0 = 7;
  let bad = 0;
  for (let c = 0; c < W0; c++) for (let r = 0; r < H0; r++) for (const d of [N, E, S, W]) {
    const got = rotateEdge(edgeOf(c, r, d), W0, H0);
    const want = edgeOf(H0 - 1 - r, c, rot(d, 1));
    if (JSON.stringify(got) !== JSON.stringify(want)) bad++;
    if (!edgeInBounds(got, H0, W0)) bad++;
  }
  eq(bad, 0, "edges: rotation agrees with the cell mapping and stays on the lattice");
}

/* --- a fixture board ------------------------------------------------------- */
function fixture() {
  // NON-SQUARE on purpose, so a w/h swap cannot hide inside a symmetry.
  const b = blankBoard({ id: "fixture", name: "Fixture", w: 6, h: 4, notes: 'A "quoted" name and a \\ backslash.' });
  setCell(b, 1, 0, "b>."); setCell(b, 2, 0, "bvr"); setCell(b, 3, 1, "B<L");
  setCell(b, 4, 2, "bvX"); setCell(b, 5, 3, "o.."); setCell(b, 0, 3, "s1.");
  setCell(b, 2, 2, "R^."); setLevel(b, 3, 2, 1); setLevel(b, 3, 3, 1);
  setWall(b, 3, 0, N, EDGE_WALL); setWall(b, 2, 1, E, EDGE_WALL); setWall(b, 5, 3, S, EDGE_WALL);
  setWall(b, 1, 2, W, EDGE_DOOR);
  setWall(b, 4, 1, N, EDGE_DOOR);   // and one on the other lattice -- see make-fixtures.js
  b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 3, r: 0 }, face: S, damage: 2 });
  b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 3, r: 1 }, face: W, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 5, r: 4 }, face: N, reach: 2, regs: [2, 4] });
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: 1, r: 2 }, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "door", edge: { kind: "h", c: 4, r: 1 }, regs: [2, 4] });
  b.ceilingDevices.push({ kind: "press", c: 1, r: 3, regs: [2, 4] });
  return b;
}

const b = fixture();
const text1 = boardJSON(b);

/* --- canonical round trip -------------------------------------------------- */
{
  const d = sink();
  const back = boardFromDocument(JSON.parse(text1), d, "fixture");
  eq(d.items, [], "canon: a canonically written board reads back with no diagnostics");
  eq(boardJSON(back), text1, "canon: serialize . parse . serialize is byte-exact");
}
eq(boardJSON(rotateBoard(b, 4)), text1, "rotate: four quarter-turns is the identity");
ok(boardJSON(rotateOnce(b)) !== text1, "rotate: one quarter-turn changes something");
eq(rotatedDims(6, 4, 1), [4, 6], "rotate: an odd turn swaps the dimensions");

/* --- the ASCII picture, on the one board that has everything ---------------
 * The shipped boards carry no door, no level and no ceiling crusher between
 * them, so a round-trip over those alone would prove the picture handles a
 * board without the three things a 2h+1 x 3w+1 grid has nowhere to put. This
 * fixture has all of them. */
{
  const meta = {
    id: b.id, name: b.name, set: b.set,
    origin: b.origin, unverified: b.unverified, notes: b.notes
  };
  const pic = toPicture(b);
  ok(/\n +[0-9]{6}/.test(pic) || pic.includes("levels:"), "picture: a board with levels writes a levels section");
  ok(pic.includes("door "), "picture: a door is written with its registers");
  ok(pic.includes("reach2"), "picture: a reach-two jet says so");
  ok(pic.includes("press "), "picture: a ceiling device is written");
  let back = null;
  try { back = fromPicture(pic, meta); }
  catch (e) { eq("threw: " + e.message, "read back", "picture: round trip"); }
  if (back) eq(boardJSON(back), text1, "picture: fromPicture(toPicture(b)) is byte-exact");
}

/* --- rotation, checked cell by cell against the mapping -------------------- */
for (let q = 1; q <= 3; q++) {
  const rr = rotateBoard(b, q);
  let bad = [];
  for (let r = 0; r < b.h; r++) for (let c = 0; c < b.w; c++) {
    let cc = c, rr2 = r, w = b.w, h = b.h;
    for (let i = 0; i < q; i++) { const t = h - 1 - rr2; rr2 = cc; cc = t; const s = w; w = h; h = s; }
    const a = b.cells[idx(b, c, r)], z = rr.cells[idx(rr, cc, rr2)];
    if (z.charAt(0) !== a.charAt(0) || z.charAt(2) !== a.charAt(2)) bad.push("cell " + c + "," + r);
    const d0 = dirOfChar(a.charAt(1));
    if (d0 !== undefined && dirOfChar(z.charAt(1)) !== rot(d0, q)) bad.push("facing " + c + "," + r);
    if (levelAt(rr, cc, rr2) !== levelAt(b, c, r)) bad.push("level " + c + "," + r);
    for (const dd of [N, E, S, W]) {
      if (wallAt(rr, cc, rr2, rot(dd, q)) !== wallAt(b, c, r, dd)) bad.push("wall " + c + "," + r + " side " + dd);
    }
  }
  eq(bad.slice(0, 3), [], "rotate q" + q + ": cells, facings, levels and walls land where the mapping says");
}

/* --- DEVICES UNDER ROTATION ------------------------------------------------
 * This block exists because without it, rotation that never turns a device's
 * face passes every other test in this file: four turns is still the identity,
 * the bytes still match, and every laser on every rotated board points the
 * wrong way. */
for (let q = 1; q <= 3; q++) {
  const rr = rotateBoard(b, q);
  const mapCell = (c, r) => {
    let cc = c, rr2 = r, w = b.w, h = b.h;
    for (let i = 0; i < q; i++) { const t = h - 1 - rr2; rr2 = cc; cc = t; const s = w; w = h; h = s; }
    return [cc, rr2];
  };
  let bad = [];
  b.wallDevices.forEach((dev, i) => {
    const moved = rr.wallDevices[i];
    if (dev.face !== null && dev.face !== undefined) {
      if (moved.face !== rot(dev.face, q)) bad.push(dev.kind + " face");
    }
    const was = deviceCell(dev), now = deviceCell(moved);
    if (was && JSON.stringify(now) !== JSON.stringify(mapCell(was[0], was[1]))) bad.push(dev.kind + " cell");
  });
  b.ceilingDevices.forEach((dev, i) => {
    const moved = rr.ceilingDevices[i];
    if (JSON.stringify([moved.c, moved.r]) !== JSON.stringify(mapCell(dev.c, dev.r))) bad.push(dev.kind + " cell");
  });
  eq(bad, [], "rotate q" + q + ": every device keeps its square and turns with the board");

  // and the beam itself: same squares, mapped
  const l0 = b.wallDevices.find(d => d.kind === "laser");
  const l1 = rr.wallDevices.find(d => d.kind === "laser");
  eq(laserPath(rr, l1).map(p => p.join(",")),
     laserPath(b, l0).map(p => mapCell(p[0], p[1]).join(",")),
     "rotate q" + q + ": a laser lights the same squares, moved");
}

/* --- derived, not stored ---------------------------------------------------- */
eq(docksOf(b), [{ c: 0, r: 3, n: 1 }], "board: docks are derived from the s cells");
{
  // the beam stops at a level change: weapons cannot hit across levels
  const t = blankBoard({ id: "beam", name: "Beam", w: 5, h: 1 });
  setWall(t, 0, 0, W, EDGE_WALL);
  const laser = { kind: "laser", edge: { kind: "v", c: 0, r: 0 }, face: E, damage: 1 };
  t.wallDevices.push(laser);
  eq(laserPath(t, laser).length, 5, "laser: a clear beam reaches the far edge");
  setLevel(t, 3, 0, 1);
  eq(laserPath(t, laser).length, 3, "laser: a beam stops at a level change");
  setLevel(t, 3, 0, 0);
  setWall(t, 2, 0, E, EDGE_WALL);
  eq(laserPath(t, laser).length, 3, "laser: a beam stops at a wall");
}

/* --- the closed schema ------------------------------------------------------ */
{
  /* The schema is closed, so the key a board used to carry is now refused like
   * any other stray -- which is what stops a stale file loading as if nothing
   * had changed. */
  const doc = JSON.parse(text1);
  doc.edition = "classic";
  const d = sink();
  boardFromDocument(doc, d, "fixture");
  ok(d.items.some(x => x.code === "doc.unknownKey"),
     "schema: a board declaring an edition is refused -- a board is not for a game");
}
{
  const doc = JSON.parse(text1);
  doc.flags = [[1, 1]];
  const d = sink();
  boardFromDocument(doc, d, "fixture");
  ok(d.items.some(x => x.code === "doc.unknownKey"), "schema: a flags array written into a board is refused");
}
{
  const doc = JSON.parse(text1);
  doc.ceiling.devices[0].face = "N";
  const d = sink();
  boardFromDocument(doc, d, "fixture");
  ok(d.items.some(x => x.code === "device.unknownKey"), "schema: a ceiling device may not carry a face");
}
{
  const doc = JSON.parse(text1);
  doc.ground.rows[1] = doc.ground.rows[1].slice(0, 5) + doc.ground.rows[1].slice(6);
  const d = sink();
  boardFromDocument(doc, d, "fixture");
  const hit = d.items.find(x => x.code === "shape.groundWidth" || x.code === "shape.groundSeparator");
  ok(hit, "schema: a ground row that lost a character is refused");
}

console.log((failed ? "FAILED " : "ok ") + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
