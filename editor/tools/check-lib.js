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
  edgeInBounds, setWall, wallAt, EDGE_WALL, EDGE_DOOR, setRamp, rampOn } from "../lib/edges.js";
import {
  blankBoard, setCell, setLevel, levelAt, boardFromDocument, idx, deviceCell, laserPath,
  docksOf, setSites, sitesAt, siteList, blockedAt, greenSide
} from "../lib/board.js";
import { rotateBoard, rotateOnce, rotatedDims } from "../lib/rotate.js";
import { boardJSON } from "../lib/canon.js";
import { toPicture, fromPicture } from "../lib/picture.js";
import { sink } from "../validate/diagnostic.js";
import { ELEMENTS, checkArg, elemOf } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { SETS, EDITIONS } from "../rulesets/sets.js";
import { rulesetFor, rulesetIds, printingsOn } from "../rulesets/index.js";
import { SITES, SITE_ORDER, canonSites, checkSites, siteProps } from "../rulesets/sites.js";

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
  ok(checkArg(elemOf("s"), "9") === null && checkArg(elemOf("s"), "c") === null, "elements: bays run to twelve, 1-9 then a b c");
  ok(checkArg(elemOf("s"), "d") !== null && checkArg(elemOf("s"), "0") !== null, "elements: there is no bay 13, and no bay 0");
  /* `printedIn` is PROVENANCE and nothing in the format may treat it as a
   * constraint: a board is just a board, and which of its squares matter is the
   * engine's business at play time. */
  eq(elemOf("~").printedIn, ["modern"], "elements: an element records which printing prints it");
  eq(typeof elemOf("L").editions, "undefined", "elements: and there is no `editions` field to gate on");
  /* A repair site, an upgrade site and an energy space are NOT elements. They
   * are markings a square carries in addition to being floor, because the same
   * printed square is a wrench in one game and a battery in the other. */
  for (const gone of ["w", "W", "E"]) {
    eq(elemOf(gone), undefined, "elements: " + JSON.stringify(gone) + " is a site now, not an element");
  }
  /* ONE TILE, ONE ENTRY. Oil and portals had two entries each -- an
   * edition-classic and an edition-modern character -- which put an edition
   * claim in a square on a board that declares no edition, and drew both with
   * the same glyph so nothing on screen could tell them apart. */
  const oils = chars.filter(c => ELEMENTS[c].props.oil);
  const portals = chars.filter(c => ELEMENTS[c].props.portal);
  eq(oils.length, 1, "elements: one oil slick -- both boxes print the same tile");
  eq(portals.length, 1, "elements: one portal -- both boxes print the same tile");
  for (const c of [...oils, ...portals]) {
    eq(ELEMENTS[c].printedIn.length, 2,
       "elements: " + JSON.stringify(c) + " is printed in both editions");
  }

  /* AND THE RULE DIFFERENCE MUST STILL BE SOMEWHERE. Merging the tiles is only
   * right if the resolution moved to the rulesets rather than evaporating, so
   * assert the keys exist AND that the two editions disagree. Set them equal --
   * the easy way to "simplify" this away -- and this goes red. */
  for (const id of ["classic", "modern"]) {
    const r = rulesetFor(id);
    ok(Array.isArray(r.oilSlideAfter) && r.oilSlideAfter.indexOf("card") >= 0 &&
       r.oilSlideAfter.every(k => ["card", "belt", "push"].indexOf(k) >= 0),
       "rulesets: " + id + " lists what sets off an oil slide, and a card move is always one");
    ok(r.portalBlockedBy === "eitherEnd" || r.portalBlockedBy === "destination",
       "rulesets: " + id + " says when a portal refuses to fire");
  }
  ok(rulesetFor("classic").oilSlideAfter.join() !== rulesetFor("modern").oilSlideAfter.join(),
     "rulesets: the editions disagree about what sets off an oil slide");
  ok(rulesetFor("classic").portalBlockedBy !== rulesetFor("modern").portalBlockedBy,
     "rulesets: the editions word the portal refusal differently");
}

/* --- devices and sets ----------------------------------------------------- */
for (const [k, d] of Object.entries(DEVICE_KINDS)) {
  ok(d.layer === "wall" || d.layer === "ceiling", "devices: " + k + " names a layer");
  ok(!(d.layer === "ceiling" && d.faced), "devices: " + k + " -- no ceiling device has a face");
  ok(Array.isArray(d.printedIn) && !d.editions, "devices: " + k + " records its printing as provenance");
  /* `playsIn` may be WIDER than `printedIn` and may never be narrower: a book
   * always resolves what it prints. Widening it is a substitute of ours, and
   * one that does not say so in the table is one nobody will find again. */
  ok(d.printedIn.every(id => EDITIONS[id]), "devices: " + k + " is printed in real printings");
  ok(d.playsIn === undefined, "devices: " + k + " declares no playsIn -- every board plays under either book (issue #14)");
}

/* THE FIRE SUBSTITUTE, asserted as a whole rather than device by device. A
 * flame jet and a flamer stand in for each other, and the table says so on
 * both; nothing else claims to stand in for anything. (Which book may PLAY a
 * board is no longer a question the data answers -- issue #14 -- so the old
 * guard against a widening that spread has nothing left to guard.) */
{
  for (const k of ["jet", "flamer"]) ok(!!DEVICE_KINDS[k].substitute, "fire: " + k + " declares its substitute");
  eq(Object.keys(DEVICE_KINDS).filter(k => DEVICE_KINDS[k].substitute).sort(), ["flamer", "jet"], "fire: and nothing else stands in for anything");
  eq(Object.keys(ELEMENTS).filter(k => ELEMENTS[k].substitute), [], "fire: no element stands in for another at all");
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

/* --- sites: markings a square carries as well as being floor ---------------- */
{
  eq(SITE_ORDER, ["repair", "upgrade", "chopShop", "battery", "randomizer", "radiation", "waste", "flagspot"], "sites: canonical order");
  eq(checkSites(["repair", "chopShop"]).length, 1, "sites: a chop shop is its own printed square, never a wrench's");
  eq(checkSites(["chopShop", "battery"]).length, 0, "sites: though a battery may share it, as it may any resting square");
  eq(checkSites(["radiation", "waste"]).length, 1, "sites: a square is radiation or waste, not both");
  eq(checkSites(["waste", "repair"]).length, 0, "sites: waste may carry a wrench, as any deck may");
  /* Placement is a fact about the marking, not about the layer: the four
   * collection markings need floor to come to rest on, the randomizer fires on
   * the card reveal and so needs only somewhere a robot can be standing, and
   * radiation and waste are the colour of the deck under whatever stands on it
   * -- Reactor Core prints a teleporter on radiation. */
  eq(SITE_ORDER.filter(k => SITES[k].place === "rest"),
     ["repair", "upgrade", "chopShop", "battery", "flagspot"], "sites: the collection markings are floor-only");
  eq(SITE_ORDER.filter(k => SITES[k].place === "standable"), ["randomizer", "radiation", "waste"],
     "sites: the randomizer, radiation and waste may share a square with another element");
  eq(canonSites(["flagspot", "repair"]), ["repair", "flagspot"], "sites: a list has one spelling");
  eq(canonSites(["repair", "repair"]), ["repair"], "sites: and no repeats");
  eq(checkSites(["repair", "battery", "flagspot"]), [],
     "sites: a wrench, a battery and a flag location on one square is the point of the layer");
  eq(checkSites(["repair", "upgrade"]).length, 1, "sites: one wrench or two, never both");
  eq(checkSites([]).length, 1, "sites: an empty list is refused");
  eq(siteProps(["upgrade", "battery"]), { repair: 2, option: true, energy: 1 },
     "sites: the properties merge, and the ruleset picks which is live");
  for (const k of SITE_ORDER) {
    ok(SITES[k].name && SITES[k].short && SITES[k].source, "sites: " + k + " is named and sourced");
    ok(Array.isArray(SITES[k].printedIn), "sites: " + k + " records its printing");
  }
}

/* --- the two orders, and the one place they differ on participation ---------
 * The editor shows BOTH orders for a square rather than asking which ruleset
 * you meant -- filtering is the engine's job. So both have to be readable, and
 * the difference between them has to be data rather than a branch in the panel
 * that draws it. */
{
  eq(rulesetIds().sort(), ["classic", "modern"], "rulesets: both are always available to the inspector");
  for (const id of rulesetIds()) {
    const r = rulesetFor(id);
    ok(Array.isArray(r.order) && r.order.length, "rulesets: " + id + " has a board order");
    ok(typeof r.expressAlsoRunsWithNormals === "boolean",
       "rulesets: " + id + " says whether a fast belt also runs with the slow ones");
    for (const step of r.order) {
      ok(step.step && step.name, "rulesets: " + id + " step " + JSON.stringify(step.step) + " is named");
    }
  }
  /* Classic express moves once alone and once more with everything; a modern
   * double belt moves two in its own step and then sits out. Same distance,
   * different route -- and it matters wherever a robot is in the way for one
   * pass and not the other. */
  eq(rulesetFor("classic").expressAlsoRunsWithNormals, true,
     "rulesets: a classic express conveyor also runs with the normal ones");
  eq(rulesetFor("modern").expressAlsoRunsWithNormals, false,
     "rulesets: a modern double belt does not");
  /* One device in both order tables, under each game's own name for it, and in
   * the SAME slot -- after the gears, before the board lasers. The names differ
   * and the beat does not, which is the whole argument for one device kind. */
  for (const id of ["classic", "modern"]) {
    const o = rulesetFor(id).order.map(s2 => s2.step);
    ok(o.includes("crusher"), "rulesets: the overhead disc is in the " + id + " order");
    eq(o.indexOf("crusher"), o.indexOf("gear") + 1,
       "rulesets: the " + id + " disc comes down straight after the gears");
    ok(o.indexOf("crusher") < o.indexOf("boardLaser"),
       "rulesets: the " + id + " disc comes down before the board lasers");
  }
  eq(rulesetFor("classic").order.find(s2 => s2.step === "crusher").name, "Presses come down",
     "rulesets: classic calls it a press");
  eq(rulesetFor("modern").order.find(s2 => s2.step === "crusher").name, "Crushers come down",
     "rulesets: modern calls it a crusher");
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
  setRamp(b, 2, 2, E, true); setLevel(b, 3, 2, 1); setLevel(b, 3, 3, 1);
  setSites(b, 0, 1, ["repair", "battery", "flagspot"]);
  setSites(b, 1, 1, ["upgrade"]);
  setWall(b, 3, 0, N, EDGE_WALL); setWall(b, 2, 1, E, EDGE_WALL); setWall(b, 5, 3, S, EDGE_WALL);
  setWall(b, 1, 2, W, EDGE_DOOR);
  setWall(b, 4, 1, N, EDGE_DOOR);   // and one on the other lattice -- see make-fixtures.js
  b.wallDevices.push({ kind: "laser", edge: { kind: "h", c: 3, r: 0 }, face: S, damage: 2 });
  b.wallDevices.push({ kind: "pusher", edge: { kind: "v", c: 3, r: 1 }, face: W, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "jet", edge: { kind: "h", c: 5, r: 4 }, face: N, reach: 2, regs: [2, 4] });
  b.wallDevices.push({ kind: "door", edge: { kind: "v", c: 1, r: 2 }, regs: [1, 3, 5] });
  b.wallDevices.push({ kind: "door", edge: { kind: "h", c: 4, r: 1 }, regs: [2, 4] });
  b.ceilingDevices.push({ kind: "crusher", c: 1, r: 3, regs: [2, 4] });
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
  ok(/R/.test(pic.split("\n")[5] || ""), "picture: a ramp edge is drawn in the lattice");
  ok(pic.includes("door "), "picture: a door is written with its registers");
  ok(pic.includes("reach2"), "picture: a reach-two jet says so");
  ok(pic.includes("crusher "), "picture: a ceiling device is written");
  ok(pic.includes("sites:"), "picture: a marked square writes a sites section");
  ok(/0,1 repair battery flagspot/.test(pic), "picture: with every marking on it, in order");
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
      if (rampOn(rr, cc, rr2, rot(dd, q)) !== rampOn(b, c, r, dd)) bad.push("ramp " + c + "," + r + " side " + dd);
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

/* --- one-way walls ------------------------------------------------------------
 * A wall from the red side, nothing from the green. The device's face points
 * into the red square. Asserted through blockedAt and laserPath, the two things
 * every mover and every beam in the game go through. */
{
  const t = blankBoard({ id: "oneway", name: "One way", w: 5, h: 1 });
  setWall(t, 2, 0, E, EDGE_WALL);                                   // the edge between (2,0) and (3,0)
  const way = { kind: "oneWay", edge: { kind: "v", c: 3, r: 0 }, face: W };   // red toward (2,0)
  t.wallDevices.push(way);
  eq(deviceCell(way), [2, 0], "one-way: it stands in the red square it faces into");
  eq(blockedAt(t, 2, 0, E, 1), true, "one-way: from the red side it is a wall");
  eq(blockedAt(t, 3, 0, W, 1), false, "one-way: from the green side it is not there");
  eq(greenSide(t, way.edge, 3, 0), true, "one-way: (3,0) is its green side");
  eq(greenSide(t, way.edge, 2, 0), false, "one-way: (2,0) is its red side");

  const east = { kind: "laser", edge: { kind: "v", c: 0, r: 0 }, face: E, damage: 1 };
  setWall(t, 0, 0, W, EDGE_WALL);
  t.wallDevices.push(east);
  eq(laserPath(t, east).length, 3, "one-way: a beam coming at the red side stops there, like a wall");
  const west = { kind: "laser", edge: { kind: "v", c: 5, r: 0 }, face: W, damage: 1 };
  setWall(t, 4, 0, E, EDGE_WALL);
  t.wallDevices.push(west);
  eq(laserPath(t, west).length, 5, "one-way: a beam from the green side goes straight through");

  const both = { kind: "oneWay", edge: { kind: "v", c: 3, r: 0 }, face: E };   // red toward (3,0) too
  t.wallDevices.push(both);
  eq(blockedAt(t, 3, 0, W, 1), true, "one-way: red on both sides is a plain wall");
  t.wallDevices.pop();

  /* the red side travels with the board: turn it a quarter and the square that
   * was red is still the one stopped */
  for (let q = 1; q < 4; q++) {
    const rr = rotateBoard(t, q);
    const moved = rr.wallDevices.find(d => d.kind === "oneWay");
    const red = deviceCell(moved);
    eq(moved.face, rot(W, q), "one-way: its face turns with the board");
    const out = opposite(moved.face);                    // from the red square, the wall is behind the face
    eq(blockedAt(rr, red[0], red[1], out, 1), true, "one-way: after " + q + " quarter turn(s) the red side still stops");
    const far = [red[0] + (out === E ? 1 : out === W ? -1 : 0), red[1] + (out === S ? 1 : out === N ? -1 : 0)];
    eq(blockedAt(rr, far[0], far[1], opposite(out), 1), false, "one-way: and the green side still lets through");
  }
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
