/* Migrating the old board data into PRBoard v1.
 *
 * THIS FILE HAS A LIFESPAN. It runs in CI for exactly as long as
 * pumarally-boards.js is in the tree, because it is the proof that the checked-
 * in JSON still means what the old data meant. When the old engine goes, this
 * goes with it, and check-format.js carries on alone. Written down here so it
 * does not become a file nobody dares remove.
 *
 *     node editor/tools/convert-boards.js           # write the JSON
 *     node editor/tools/convert-boards.js --check   # convert in memory and compare
 *
 * Conversion goes through the OLD PARSER rather than re-reading the ASCII,
 * because the old parser is the definition of what the old data means. And the
 * equivalence check compares BEHAVIOUR, in the old vocabulary, through the old
 * module's own predicates -- a structural comparison would be comparing the new
 * code to itself at exactly the three points where the conversion is
 * interesting: relative arms, edge anchoring, and door register expansion.
 */

import { createRequire } from "node:module";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { blankBoard, setCell, idx, deviceCell, laserPath, propAt, blockedAt as newBlocked } from "../lib/board.js";
import { setWall, EDGE_WALL, EDGE_DOOR, edgeOf, wallAt as newWallAt } from "../lib/edges.js";
import { boardJSON } from "../lib/canon.js";
import { rotateBoard } from "../lib/rotate.js";
import { armsFromAbsolute, absoluteArms, tokenBeltSpeed } from "../lib/token.js";
import { opposite, dirLetter, N, E, S, W } from "../lib/dir.js";
import { firesIn } from "../lib/registers.js";
import { checkBoardDocument } from "../validate/index.js";
import { assemble, courseBounds } from "../lib/course.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { sink } from "../validate/diagnostic.js";
import { cellAt, isVoid } from "../lib/board.js";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = join(HERE, "..", "data", "boards");
const OUT_C = join(HERE, "..", "data", "courses");
const B = require(join(REPO, "pumarally-boards.js"));

const DIRS = [N, E, S, W];
const REGS = [1, 2, 3, 4, 5];

/* Three old legend characters are not elements any more. A repair site, an
 * upgrade site and an energy space are SITES -- markings a square carries in
 * addition to being floor -- because the same printed square is a wrench in one
 * game and a battery in the other, and a flag location has to be able to sit on
 * either. The square underneath becomes plain floor and the marking moves to
 * `ground.sites`. */
const AS_SITE = { w: "repair", W: "upgrade", E: "battery" };

/* --- the one place a legend character changes meaning ----------------------
 * The old legend had ONE oil slick and ONE portal marked as printed by both
 * editions. They are not the same element: classic oil stops a sliding robot at
 * the first robot it meets, modern oil pushes that robot and both slide on;
 * classic portals switch off while a robot stands on one, modern ones refuse
 * only when the destination is occupied. So the new legend has two of each.
 *
 * THE OLD BOARD'S DECLARED EDITION IS USED EXACTLY HERE, ONCE, to decide which
 * of the two an old shared character meant -- and is then thrown away. A new
 * board declares no edition: it is just a board, and which of its squares
 * matter is the engine's business at play time. The edition was never a fact
 * about the board; it was the only thing that could disambiguate this
 * character, and once the characters are distinct it has no further job.
 *
 * This is not theoretical. `oRing` is a transcribed 2016 board with an oil
 * slick printed on it, and under the old legend it carried the classic rules. */
const BY_EDITION = {
  L: { classic: "L", modern: "%" },
  t: { classic: "t", modern: "P" }
};

function mapChar(ch, edition) {
  const split = BY_EDITION[ch];
  if (!split) return ch;
  const out = split[edition];
  if (!out) {
    throw new Error("cannot place " + JSON.stringify(ch) + " on an edition-" +
      JSON.stringify(edition) + " board: it means a different element in each game");
  }
  return out;
}

/** Old door character to the register list it stands open in. */
function doorRegs(ch) {
  if (ch === "o") return [1, 3, 5];
  if (ch === "e") return [2, 4];
  const n = +ch;
  if (n >= 1 && n <= 5) return [n];
  throw new Error("unknown door character " + JSON.stringify(ch));
}

/* --- old grid -> new board ------------------------------------------------- */

/* `meta` is passed in rather than read off `g`, because THE OLD rotateGrid
 * DROPS `edition` AND `set`: a rotated grid does not remember which game it was
 * printed for. That is a latent defect in the old module -- harmless there only
 * because nothing asks a rotated grid what edition it is -- and it is not fixed
 * here, because the old file is frozen. The converter carries the metadata
 * across itself, from the unrotated parse. */
function convert(g, id, meta) {
  const edition = meta.edition;
  const board = blankBoard({
    id, name: meta.name, w: g.w, h: g.h,
    set: meta.set, origin: meta.origin || "transcribed",
    unverified: !!meta.unverified, notes: meta.notes || ""
  });

  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      const code = B.codeAt(g, c, r);
      if (!code) { setCell(board, c, r, "   "); continue; }
      const asSite = AS_SITE[code.charAt(0)];
      if (asSite) {
        setCell(board, c, r, "...");
        board.sites.set(c + "," + r, [asSite]);
        continue;
      }
      const ch = mapChar(code.charAt(0), edition);
      let arms = ".";
      if (B.beltSpeed(code)) {
        /* beltArms returns the ABSOLUTE sides showing an incoming path; the new
         * format stores them relative to the belt's own exit. */
        arms = armsFromAbsolute(B.dirOf(code), B.beltArms(g, c, r));
        if (arms === null) throw new Error("no arms code for " + id + " (" + c + "," + r + ")");
      }
      setCell(board, c, r, ch + code.charAt(1) + arms);
    }
  }

  for (let r = 0; r <= g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      const i = r * g.w + c;
      if (g.doorN[i]) {
        board.wallH[i] = EDGE_DOOR;
        board.wallDevices.push({ kind: "door", edge: { kind: "h", c, r }, face: null, regs: doorRegs(g.doorN[i]) });
      } else if (g.wallN[i]) board.wallH[i] = EDGE_WALL;
    }
  }
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c <= g.w; c++) {
      const i = r * (g.w + 1) + c;
      if (g.doorW[i]) {
        board.wallV[i] = EDGE_DOOR;
        board.wallDevices.push({ kind: "door", edge: { kind: "v", c, r }, face: null, regs: doorRegs(g.doorW[i]) });
      } else if (g.wallW[i]) board.wallV[i] = EDGE_WALL;
    }
  }

  /* A wall-mounted device is anchored to the wall BEHIND it and faces away from
   * it, so the edge is the one on the opposite side to the way it points. */
  const mount = (c, r, d) => edgeOf(c, r, opposite(d));

  for (const L of g.lasers || []) {
    board.wallDevices.push({ kind: "laser", edge: mount(L.c, L.r, B.DIR_OF[L.d] ?? L.d), face: B.DIR_OF[L.d] ?? L.d, damage: L.n });
  }
  for (const p of g.pushers || []) {
    const d = B.DIR_OF[p.d] ?? p.d;
    board.wallDevices.push({ kind: "pusher", edge: mount(p.c, p.r, d), face: d, regs: p.regs && p.regs.length ? p.regs : undefined });
  }
  for (const j of g.burners || []) {
    const d = B.DIR_OF[j.d] ?? j.d;
    const dev = { kind: "jet", edge: mount(j.c, j.r, d), face: d, regs: j.regs && j.regs.length ? j.regs : undefined };
    if (j.len && j.len !== 1) dev.reach = j.len;
    board.wallDevices.push(dev);
  }
  for (const t of g.timers || []) {
    board.ceilingDevices.push({ kind: "press", c: t.c, r: t.r, regs: t.regs && t.regs.length ? t.regs : undefined });
  }
  for (const t of g.crushers || []) {
    board.ceilingDevices.push({ kind: "crusher", c: t.c, r: t.r, regs: t.regs && t.regs.length ? t.regs : undefined });
  }
  for (const t of g.flamers || []) {
    board.ceilingDevices.push({ kind: "flamer", c: t.c, r: t.r, regs: t.regs && t.regs.length ? t.regs : undefined });
  }
  return board;
}

/* --- the equivalence battery ------------------------------------------------ */

const problems = [];
const note = (id, q, msg) => problems.push(id + (q ? " rot" + q : "") + ": " + msg);

/** Old direction values are integers already once parsed. */
function oldLaserDamage(g) {
  const map = new Map();
  for (const L of g.lasers || []) {
    /* the old laserPath yields {c, r} objects, not pairs */
    for (const { c, r } of B.laserPath(g, L)) {
      const k = c + "," + r;
      map.set(k, (map.get(k) || 0) + L.n);
    }
  }
  return map;
}

function newLaserDamage(board) {
  const map = new Map();
  for (const dev of board.wallDevices) {
    if (dev.kind !== "laser") continue;
    for (const [c, r] of laserPath(board, dev)) {
      const k = c + "," + r;
      map.set(k, (map.get(k) || 0) + dev.damage);
    }
  }
  return map;
}

function compare(id, g, board, q, meta) {
  if (g.w !== board.w || g.h !== board.h) { note(id, q, "dimensions " + g.w + "x" + g.h + " vs " + board.w + "x" + board.h); return; }

  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      const oldCode = B.codeAt(g, c, r);
      const tok = board.cells[idx(board, c, r)];
      if (!oldCode) { if (tok !== "   ") note(id, q, "(" + c + "," + r + ") should be a hole"); continue; }

      /* A square the old data spelled as an element and the new data spells as
       * a marking on floor. Compared by the PROPERTIES it gives a robot, which
       * is the only thing either spelling was ever for. */
      const asSite = AS_SITE[oldCode.charAt(0)];
      if (asSite) {
        if (tok !== "...") note(id, q, "(" + c + "," + r + ") should be floor under a site, not " + JSON.stringify(tok));
        /* the old defs carry their behaviour flags at the top level, not under
         * a `props` key -- the new ones nest them, and this is the seam */
        const oldProps = B.ELEMENT_DEFS[oldCode.charAt(0)];
        for (const key of ["repair", "option", "energy"]) {
          const want = oldProps[key], got = propAt(board, c, r, key);
          if ((want === undefined ? undefined : want) !== (got === undefined ? undefined : got)) {
            note(id, q, "(" + c + "," + r + ") " + key + " " + JSON.stringify(want) + " vs " + JSON.stringify(got));
          }
        }
        continue;
      }
      if (tok.charAt(0) !== mapChar(oldCode.charAt(0), meta.edition) || tok.charAt(1) !== oldCode.charAt(1)) {
        note(id, q, "(" + c + "," + r + ") element " + JSON.stringify(oldCode) + " vs " + JSON.stringify(tok));
        continue;
      }
      /* arms, converted back to absolute and compared against the old answer */
      if (B.beltSpeed(oldCode)) {
        const want = [...B.beltArms(g, c, r)].sort((a, b) => a - b).join(",");
        const got = (absoluteArms(tok, B.dirOf(oldCode)) || []).join(",");
        if (want !== got) note(id, q, "(" + c + "," + r + ") arms [" + want + "] vs [" + got + "]");
      }
      /* all four sides of every cell: each edge is asked twice, from opposite
       * owners, so any off-by-one in the h:/v: addressing shows up here */
      for (const d of DIRS) {
        if (!!B.wallAt(g, c, r, d) !== (newWallAt(board, c, r, d) === EDGE_WALL)) {
          note(id, q, "(" + c + "," + r + ") wall " + dirLetter(d));
        }
        for (const reg of REGS) {
          if (B.blockedAt(g, c, r, d, reg - 1) !== newBlocked(board, c, r, d, reg)) {
            note(id, q, "(" + c + "," + r + ") blocked " + dirLetter(d) + " register " + reg);
          }
        }
      }
    }
  }

  /* devices, by the predicate each one exists to answer */
  const cellKey = dev => { const p = deviceCell(dev); return p ? p.join(",") : "?"; };
  for (const [layer, kind, oldList, fires] of [
    ["wall", "pusher", g.pushers || [], B.pusherFires],
    ["wall", "jet", g.burners || [], B.burnerFires],
    ["ceiling", "press", g.timers || [], B.activeNow],
    ["ceiling", "crusher", g.crushers || [], B.crusherFires],
    ["ceiling", "flamer", g.flamers || [], B.flamerFires]
  ]) {
    const news = layer === "wall"
      ? board.wallDevices.filter(x => x.kind === kind)
      : board.ceilingDevices.filter(x => x.kind === kind);
    if (news.length !== oldList.length) { note(id, q, kind + " count " + oldList.length + " vs " + news.length); continue; }
    for (const o of oldList) {
      const match = news.find(n => (layer === "wall" ? cellKey(n) : n.c + "," + n.r) === o.c + "," + o.r);
      if (!match) { note(id, q, kind + " missing at (" + o.c + "," + o.r + ")"); continue; }
      if (layer === "wall" && match.face !== (B.DIR_OF[o.d] ?? o.d)) {
        note(id, q, kind + " at (" + o.c + "," + o.r + ") faces " + dirLetter(match.face) + " not " + o.d);
      }
      /* the old predicates take (grid, c, r, register) with a ZERO-BASED
       * register; the new format is 1-based throughout, matching the number
       * printed on the board. The conversion is here and nowhere else. */
      for (const reg of REGS) {
        if (fires(g, o.c, o.r, reg - 1) !== firesIn(match.regs, reg)) {
          note(id, q, kind + " at (" + o.c + "," + o.r + ") register " + reg);
        }
      }
      if (kind === "jet") {
        const want = o.len || 1, got = match.reach === undefined ? 1 : match.reach;
        if (want !== got) note(id, q, "jet at (" + o.c + "," + o.r + ") reach " + want + " vs " + got);
      }
    }
  }

  /* the laser damage map: a laser whose face put it on the wrong side of its
   * mount would fire the other way, and only a per-square map shows that */
  const wantDmg = oldLaserDamage(g), gotDmg = newLaserDamage(board);
  const keys = new Set([...wantDmg.keys(), ...gotDmg.keys()]);
  for (const k of keys) {
    if ((wantDmg.get(k) || 0) !== (gotDmg.get(k) || 0)) {
      note(id, q, "laser damage at (" + k + ") " + (wantDmg.get(k) || 0) + " vs " + (gotDmg.get(k) || 0));
    }
  }

  for (const key of ["name", "set", "origin"]) {
    if ((meta[key] || "") !== (board[key] || "")) note(id, q, key + " " + JSON.stringify(meta[key]) + " vs " + JSON.stringify(board[key]));
  }
  if (!!meta.unverified !== !!board.unverified) note(id, q, "unverified flag");
}

/* --- run -------------------------------------------------------------------- */

const check = process.argv.includes("--check");
if (!check && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!check && !existsSync(OUT_C)) mkdirSync(OUT_C, { recursive: true });

const ids = Object.keys(B.BOARD_SPECS);
const converted = {};
let wrote = 0, drift = 0;

for (const id of ids) {
  const g = B.parsePic(id, B.BOARD_SPECS[id]);
  const meta = {
    name: g.name, edition: g.edition, set: g.set,
    origin: g.origin, unverified: g.unverified, notes: g.notes
  };
  const board = convert(g, id, meta);
  converted[id] = board;

  compare(id, g, board, 0, meta);

  /* THE STRONGEST SINGLE ASSERTION IN THIS FILE.
   * Rotating the old grid then converting must give byte-for-byte what
   * converting then rotating gives. It proves the new rotateBoard and the old
   * rotateGrid are the same function seen through the converter, which retires
   * any remaining doubt about relative arms and closed-form edge rotation at
   * once -- both of which are the kind of thing that is either exactly right or
   * wrong on three quarters of the boards. */
  for (let q = 1; q <= 3; q++) {
    const oldRot = B.rotateGrid(B.parsePic(id, B.BOARD_SPECS[id]), q);
    const viaOld = boardJSON(convert(oldRot, id, meta));
    const viaNew = boardJSON(rotateBoard(board, q));
    if (viaOld !== viaNew) {
      const a = viaOld.split("\n"), bb = viaNew.split("\n");
      const line = a.findIndex((x, i) => x !== bb[i]);
      note(id, q, "rotate-then-convert differs from convert-then-rotate at line " + line +
        "\n      old: " + JSON.stringify(a[line]) + "\n      new: " + JSON.stringify(bb[line]));
    }
    compare(id, oldRot, rotateBoard(board, q), q, meta);
  }

  /* the converted board must also pass the new validator on its own terms */
  const text = boardJSON(board);
  const { diagnostics } = checkBoardDocument(JSON.parse(text), id);
  for (const x of diagnostics) {
    if (x.severity === "error") note(id, 0, "validator: " + x.code + " " + x.message);
  }

  const path = join(OUT, id + ".json");
  if (check) {
    const have = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (have === null) { note(id, 0, "no checked-in JSON at " + path); drift++; }
    else if (have !== text) { note(id, 0, "checked-in JSON differs from a fresh conversion"); drift++; }
  } else {
    writeFileSync(path, text);
    wrote++;
  }
}

/* --- courses ---------------------------------------------------------------
 * `boards` + `dock` become one ordered `stamps` list with a role on each. That
 * one change is what kills the hardcoded dock footprint: the old dockBoxOf
 * computed x1 = at[0]+11, y1 = at[1]+3, so the docking bay had to be exactly
 * twelve by four. A dock's box is now derived from its own rotated dimensions.
 */
const library = new Map(Object.entries(converted));
const courseIds = Object.keys(B.COURSES);
let wroteC = 0;

for (const id of courseIds) {
  const spec = B.COURSES[id];
  const stamps = spec.boards.map(b => ({ role: "board", board: b.id, rot: b.rot | 0, at: [b.at[0], b.at[1]] }));
  if (spec.dock) stamps.push({ role: "dock", board: spec.dock.id, rot: spec.dock.rot | 0, at: [spec.dock.at[0], spec.dock.at[1]] });

  const doc = {
    format: "PRCourse", version: 1, id,
    name: spec.name, kind: spec.kind || "track",
    blurb: spec.blurb || "",
    stamps,
    flags: (spec.flags || []).map(f => [f[0], f[1]]),
    minPlayers: spec.minPlayers, maxPlayers: spec.maxPlayers
  };
  const text = JSON.stringify(doc, null, 2) + "\n";

  /* equivalence: the assembled grid, square for square, against buildCourse */
  const d = sink();
  const course = courseFromDocument(JSON.parse(text), d, id);
  if (!course) { note(id, 0, "course will not read back"); continue; }
  validateCourse(course, library, d);
  for (const x of d.items) {
    if (x.severity === "error") note(id, 0, "course validator: " + x.code + " " + x.message);
  }

  const old = B.buildCourse(id);
  const { grid } = assemble(course, library);
  if (old.w !== grid.w || old.h !== grid.h) {
    note(id, 0, "assembled " + old.w + "x" + old.h + " vs " + grid.w + "x" + grid.h);
  } else {
    for (let r = 0; r < old.h; r++) {
      for (let c = 0; c < old.w; c++) {
        const oc = B.codeAt(old, c, r);
        const nt = cellAt(grid, c, r);
        if (!oc) { if (!isVoid(grid, c, r)) note(id, 0, "(" + c + "," + r + ") should be a hole"); continue; }
        if (isVoid(grid, c, r)) { note(id, 0, "(" + c + "," + r + ") is a hole and should not be"); continue; }
        if (nt.charAt(1) !== oc.charAt(1)) note(id, 0, "(" + c + "," + r + ") argument " + JSON.stringify(oc) + " vs " + JSON.stringify(nt));
        for (const dd of DIRS) {
          if (!!B.wallAt(old, c, r, dd) !== (newWallAt(grid, c, r, dd) === EDGE_WALL)) {
            note(id, 0, "(" + c + "," + r + ") wall " + dirLetter(dd));
          }
        }
      }
    }
    const oldFlags = (old.flags || []).map(f => f.c + "," + f.r).join(" ");
    const newFlags = course.flags.map(f => f[0] + "," + f[1]).join(" ");
    if (oldFlags !== newFlags) note(id, 0, "flags [" + oldFlags + "] vs [" + newFlags + "]");
  }

  const path = join(OUT_C, id + ".json");
  if (check) {
    const have = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (have === null) { note(id, 0, "no checked-in course JSON"); }
    else if (have !== text) { note(id, 0, "checked-in course JSON differs from a fresh conversion"); }
  } else { writeFileSync(path, text); wroteC++; }
}

/* --- the index -------------------------------------------------------------
 * There is no directory listing over HTTP, so the page cannot discover what is
 * in data/. This is that listing, and it carries enough per entry -- name,
 * size, edition, set, origin -- for the palette to be drawn and sorted without
 * fetching every board first. */
{
  const index = {
    format: "PRIndex", version: 1,
    boards: ids.map(id => {
      const b = converted[id];
      return { id, name: b.name, w: b.w, h: b.h, set: b.set,
               origin: b.origin, unverified: b.unverified || undefined };
    }),
    courses: Object.keys(B.COURSES).map(id => ({
      id, name: B.COURSES[id].name, kind: B.COURSES[id].kind || "track",
      blurb: B.COURSES[id].blurb || "",
      boards: B.COURSES[id].boards.length,
      flags: (B.COURSES[id].flags || []).length
    }))
  };
  const text = JSON.stringify(index, null, 2) + "\n";
  const path = join(HERE, "..", "data", "index.json");
  if (check) {
    const have = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (have !== text) note("index", 0, "data/index.json differs from a fresh conversion");
  } else writeFileSync(path, text);
}

if (problems.length) {
  console.error("convert-boards: " + problems.length + " problem(s)");
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  if (problems.length > 40) console.error("  ... and " + (problems.length - 40) + " more");
  process.exit(1);
}

/* warnings are reported but do not fail: they are observations about the
 * printed board, not about the conversion */
let warned = 0;
for (const id of ids) {
  const { diagnostics } = checkBoardDocument(JSON.parse(boardJSON(converted[id])), id);
  for (const x of diagnostics) if (x.severity === "warning") { warned++; console.log("  warn " + id + ": " + x.code + " -- " + x.message); }
}

console.log("ok " + ids.length + " boards" + (check ? " match the checked-in JSON" : ", " + wrote + " written") +
  "; every one identical in behaviour to the old data under all four rotations" +
  (warned ? " (" + warned + " warning(s) above)" : ""));
console.log("ok " + courseIds.length + " courses" + (check ? " match" : ", " + wroteC + " written") +
  "; every assembled grid identical to buildCourse, square for square");
