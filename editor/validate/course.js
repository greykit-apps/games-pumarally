/* What a course must be.
 *
 * Everything geometric in here is derived from the stamps' OWN rotated
 * dimensions, so a 12x12 board, a 12x4 docking bay, a 6x6 Master Builder board
 * and a 6x2 dock all work. The old rules that encoded twelve are each replaced
 * by the thing they were trying to say:
 *
 *   slot adjacency          -> one 4-connected component over non-void squares
 *   "the block goes under"  -> every bay has an unblocked way out of the dock
 *   `c % 12` for corners    -> board-local coordinates, via the provenance array
 *   Northrup's twelve       -> ruleset.maxFlagGap, because it is a rulebook
 *                              heuristic about race length that merely happens
 *                              to equal a classic board's width
 */

import {
  COURSE_FORMAT, COURSE_VERSION, ROLES, assemble, courseBounds, stampFootprint,
  components, dockStamp, dockBox, inBox, boardLocal, flagRefusal, wallsAround,
  startRefusal, STARTS_WANTED
} from "../lib/course.js";
import { inBoard, isVoid, cellAt, elementAt, docksOf, deviceCell, blockedAt } from "../lib/board.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
/* The classic rulebook's guideline on how far apart flags may be. Kept here
 * rather than on a ruleset because the editor has no ruleset in force -- it
 * reports the guideline and lets the designer decide. */
const FLAG_GAP_GUIDE = 12;

import { DC, DR, N, E, S, W } from "../lib/dir.js";
import { REGISTERS } from "../lib/registers.js";

const COURSE_KEYS = new Set([
  "format", "version", "id", "name", "kind", "blurb", "stamps", "flags", "minPlayers", "maxPlayers", "notes",
  /* the 2016 game's Reboot Tokens, placed per course like the flags ([c, r, facing]),
   * and a course's own reboot cost (Cry Havoc draws 3 damage instead of 2) */
  "reboots", "rebootDamage",
  /* the bays a course uses ("Robots should not start in the spaces covered by Energy cubes") */
  "bays",
  /* the course's own starting squares, placed like flags: [c, r] each, numbered after the printed bays */
  "starts"
]);
const STAMP_KEYS = new Set(["role", "board", "rot", "at", "note"]);
const at = (c, r) => "(" + c + "," + r + ")";
const DIRS = [N, E, S, W];

/** Read a course document. Emits shape diagnostics; returns null if unreadable. */
export function courseFromDocument(doc, d, expectId) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    d.error("doc.notObject", "The file is not a JSON object."); return null;
  }
  if (doc.format !== COURSE_FORMAT) {
    d.error("doc.format", "`format` is " + JSON.stringify(doc.format) + ", expected " +
      JSON.stringify(COURSE_FORMAT) + ".", null, "/format"); return null;
  }
  if (doc.version !== COURSE_VERSION) {
    d.error("doc.version", "`version` is " + JSON.stringify(doc.version) + ".", null, "/version"); return null;
  }
  for (const k of Object.keys(doc)) {
    if (!COURSE_KEYS.has(k)) d.error("doc.unknownKey", "`" + k + "` is not part of a course.", null, "/" + k);
  }
  if (typeof doc.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(doc.id)) {
    d.error("doc.id", "`id` must be a bare identifier.", null, "/id"); return null;
  }
  if (expectId && doc.id !== expectId) {
    d.error("doc.id", "`id` is " + JSON.stringify(doc.id) + " but the file is named " +
      JSON.stringify(expectId) + ".", null, "/id");
  }
  if (typeof doc.name !== "string" || !doc.name) d.error("doc.meta", "`name` must be a non-empty string.", null, "/name");
  if (!Array.isArray(doc.stamps) || !doc.stamps.length) {
    d.error("course.badPlacement", "A course needs at least one board.", null, "/stamps"); return null;
  }

  const course = {
    format: COURSE_FORMAT, version: COURSE_VERSION,
    id: doc.id, name: doc.name || "", kind: doc.kind || "track", blurb: doc.blurb || "",
    stamps: [], flags: [], reboots: [], starts: [], rebootDamage: doc.rebootDamage === undefined ? null : doc.rebootDamage,
    bays: doc.bays === undefined ? null : doc.bays,
    minPlayers: doc.minPlayers, maxPlayers: doc.maxPlayers
  };
  if (doc.rebootDamage !== undefined && (!Number.isInteger(doc.rebootDamage) || doc.rebootDamage < 0 || doc.rebootDamage > 9)) {
    d.error("doc.meta", "`rebootDamage` is the damage a reboot draws: a small whole number.", null, "/rebootDamage");
  }
  if (doc.bays !== undefined && (!Array.isArray(doc.bays) || !doc.bays.length || doc.bays.some(n => !Number.isInteger(n) || n < 1))) {
    d.error("course.bayCount", "`bays` lists the numbers of the docking bays this course uses.", null, "/bays");
    course.bays = null;
  }
  if (doc.reboots !== undefined) {
    if (!Array.isArray(doc.reboots)) d.error("course.rebootOffCourse", "`reboots` must be an array.", null, "/reboots");
    else doc.reboots.forEach((t, i) => {
      if (!Array.isArray(t) || t.length !== 3 || !Number.isInteger(t[0]) || !Number.isInteger(t[1]) || !Number.isInteger(t[2]) || t[2] < 0 || t[2] > 3) {
        d.error("course.rebootOffCourse", "Reboot token " + (i + 1) + " is not a [c, r, facing] triple.", null, "/reboots/" + i);
      } else course.reboots.push([t[0], t[1], t[2]]);
    });
  }

  doc.stamps.forEach((raw, i) => {
    const ptr = "/stamps/" + i;
    if (!raw || typeof raw !== "object") { d.error("course.badRole", "Stamp " + i + " is not an object.", null, ptr); return; }
    for (const k of Object.keys(raw)) {
      if (!STAMP_KEYS.has(k)) d.error("doc.unknownKey", "`" + k + "` is not part of a stamp.", null, ptr + "/" + k);
    }
    if (ROLES.indexOf(raw.role) < 0) {
      d.error("course.badRole", "Stamp " + i + " has role " + JSON.stringify(raw.role) +
        "; it must be " + ROLES.map(r => JSON.stringify(r)).join(" or ") + ".", null, ptr);
    }
    if (typeof raw.board !== "string") {
      d.error("course.unknownBoard", "Stamp " + i + " names no board.", null, ptr); return;
    }
    const rot = raw.rot === undefined ? 0 : raw.rot;
    if (!Number.isInteger(rot) || rot < 0 || rot > 3) {
      d.error("course.badRotation", "Stamp " + i + " has rotation " + JSON.stringify(raw.rot) +
        "; quarter-turns are 0 to 3.", null, ptr);
    }
    if (!Array.isArray(raw.at) || raw.at.length !== 2 ||
        !Number.isInteger(raw.at[0]) || !Number.isInteger(raw.at[1]) ||
        raw.at[0] < 0 || raw.at[1] < 0) {
      d.error("course.badPlacement", "Stamp " + i + " has no `at: [c, r]` with non-negative integers.", null, ptr);
      return;
    }
    course.stamps.push({ role: raw.role, board: raw.board, rot: rot | 0, at: [raw.at[0], raw.at[1]], _ptr: ptr });
  });

  if (doc.starts !== undefined) {
    if (!Array.isArray(doc.starts)) d.error("course.startOffCourse", "`starts` must be an array.", null, "/starts");
    else doc.starts.forEach((s, i) => {
      if (!Array.isArray(s) || s.length !== 2 || !Number.isInteger(s[0]) || !Number.isInteger(s[1])) {
        d.error("course.startOffCourse", "Starting square " + (i + 1) + " is not a [c, r] pair.", null, "/starts/" + i);
      } else course.starts.push([s[0], s[1]]);
    });
  }
  if (doc.flags !== undefined) {
    if (!Array.isArray(doc.flags)) d.error("course.noFlags", "`flags` must be an array.", null, "/flags");
    else doc.flags.forEach((f, i) => {
      if (!Array.isArray(f) || f.length !== 2 || !Number.isInteger(f[0]) || !Number.isInteger(f[1])) {
        d.error("course.flagOffCourse", "Flag " + (i + 1) + " is not a [c, r] pair.", null, "/flags/" + i);
      } else course.flags.push([f[0], f[1]]);
    });
  }
  return course;
}

/** `library` is a Map of board id -> board. */
export function validateCourse(course, library, d) {
  for (const s of course.stamps) {
    if (!library.has(s.board)) {
      d.error("course.unknownBoard", "No board called " + JSON.stringify(s.board) + ".", null, s._ptr);
    }
  }
  if (course.stamps.some(s => !library.has(s.board))) return d;

  /* `unverified` is a claim about the board: nobody has checked it square by
   * square against the photograph. It used to be a flag nothing read, under a
   * tooltip saying it kept the board out of courses. It does not; it warns. */
  for (const s of course.stamps) {
    if (library.get(s.board).unverified) {
      d.warn("course.unverifiedBoard", JSON.stringify(s.board) + " is marked unverified: it has " +
        "not been checked square by square against its photograph, so this course may be " +
        "faithful to a transcription error.", null, s._ptr);
    }
  }

  /* overlap: allowed, the later stamp on top (issue #13), and said, since a
   * board wholly under another is a board somebody may have forgotten */
  const boxes = course.stamps.map(s => ({ s, f: stampFootprint(s, library.get(s.board)) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].f, b = boxes[j].f;
      if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1) {
        const n = (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1) * (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1);
        const all = n === (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1);
        d.warn("course.overlap", JSON.stringify(boxes[j].s.board) + " lies over " + (all ? "the whole of " : n + " square" + (n === 1 ? "" : "s") + " of ") +
          JSON.stringify(boxes[i].s.board) + "; the squares underneath are out of play.", null, boxes[j].s._ptr);
      }
    }
  }

  const { grid, from, bounds, painted } = assemble(course, library);

  /* connectivity: worth saying, not refusing -- an area nothing can drive to
   * is odd, and no book forbids it (a warning since 2026-09-23) */
  const parts = components(grid);
  if (parts.length > 1) {
    const sizes = parts.map(p => p.length).sort((a, b) => b - a);
    d.warn("course.disconnected", "This course is " + parts.length + " separate areas (" +
      sizes.join(", ") + " squares). Boards that meet only at a corner are not joined: " +
      "nothing can drive between them.", null, "/stamps");
  }

  /* where the robots start: a docking bay board, the course's own squares, or both */
  const docks = course.stamps.filter(s => s.role === "dock" || s.role === "course");
  if (docks.length > 1) {
    d.error("course.twoDocks", "A course has one docking bay board; this one has " + docks.length + ".", null, "/stamps");
  } else if (!docks.length && !course.starts.length) {
    d.error("course.noDock", "This course has nowhere for robots to start: lay a docking bay board, or place " + STARTS_WANTED + " starting squares.", null, "/stamps");
  } else {
    checkStarts(course, library, { grid, from, bounds, painted }, d);
    checkDock(course, library, grid, bounds, d);
  }

  checkFlags(course, library, grid, from, bounds, d);
  checkReboots(course, library, grid, from, bounds, d);

  /* `course.fewFlagSpots` -- fewer than five marked flag locations -- was a
   * guideline of ours, and is gone (2026-09-23): the marks are suggestions. */
  return d;
}

/* The starting squares as one set, however they were made: the docking bay
 * board's, a whole-course board's, and the ones the course placed itself
 * (painted into the grid by assemble, numbered after the printed ones). */
function checkDock(course, library, grid, bounds, d) {
  const box = dockBox(course, library, bounds);
  const bays = docksOf(grid);
  const seen = bays.map(b => b.n).sort((a, b) => a - b);
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== i + 1) {
      d.error("course.bayNumbering", "The docking bays are numbered " + seen.join(", ") +
        "; they must run 1 to " + seen.length + " with no gaps or repeats.", null, "/stamps");
      break;
    }
  }
  /* a course may use fewer bays than the board prints: the rest are covered by Energy cubes */
  let usable = seen.length;
  if (course.bays) {
    const missing = course.bays.filter(n => !seen.includes(n));
    if (missing.length) d.error("course.bayCount", "This course uses bay" + (missing.length === 1 ? " " : "s ") + missing.join(", ") + ", which the docking bay does not have.", null, "/bays");
    usable = course.bays.filter(n => seen.includes(n)).length;
  }
  /* A RACE NEEDS EIGHT STARTING SQUARES, however they are made up: the docking
   * bay board's eight, Master Builder's six and two placed, or eight placed
   * round the floor. A course that names the bays it uses (the 2023 books,
   * where Energy cubes cover the rest) is held to its seats instead. */
  const seats = course.maxPlayers;
  if (course.bays) {
    if (Number.isInteger(seats) && usable < seats) {
      d.error("course.bayCount", "This course seats " + seats + " but has " + usable + " docking bay(s) in use.", null, "/maxPlayers");
    }
  } else if (usable < STARTS_WANTED) {
    d.error("course.bayCount", "This course has " + usable + " of the " + STARTS_WANTED + " starting squares a race needs. " +
      "Lay a docking bay board, or place the rest square by square.", null, "/stamps");
  } else if (usable > STARTS_WANTED) {
    d.error("course.bayCount", "This course has " + usable + " starting squares; a race has " + STARTS_WANTED + ".", null, "/starts");
  }

  /* A bay that cannot get OUT of the dock is worth saying. This replaced "the
   * column above the block must be filled", which was never cited, so it is a
   * warning (since 2026-09-23): it works for a dock on any side, in a notch,
   * or surrounded, a door counts as a way out if it stands open in any
   * register, and a placed start stands in no block, so has nothing to get
   * out of. */
  for (const bay of bays) {
    if (!inBox(box, bay.c, bay.r)) continue;
    if (!escapes(grid, box, bay.c, bay.r)) {
      d.warn("course.bayTrapped", "Docking bay " + bay.n + " at " + at(bay.c, bay.r) +
        " has no unblocked way out of the block.", at(bay.c, bay.r), "/stamps");
    }
  }
}

function escapes(grid, box, c0, r0) {
  const seen = new Set([c0 + "," + r0]);
  const stack = [[c0, r0]];
  while (stack.length) {
    const [c, r] = stack.pop();
    for (const dir of DIRS) {
      let open = false;
      for (const reg of REGISTERS) if (!blockedAt(grid, c, r, dir, reg)) { open = true; break; }
      if (!open) continue;
      const nc = c + DC[dir], nr = r + DR[dir];
      if (!inBoard(grid, nc, nr) || isVoid(grid, nc, nr)) continue;
      if (!inBox(box, nc, nr)) return true;          // out of the block
      const key = nc + "," + nr;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nc, nr]);
    }
  }
  return false;
}

/* "Each board, other than the Docking Bay, must have 1 and only 1 Reboot token
 * on it" (2016 book p.30), on floor; a laser passing over one is live and every
 * other element under it is not, so the token wants plain floor. A course with
 * no tokens is one the engine plays under the archive substitute, so a
 * missing token is a warning only once the course has any. */
function checkReboots(course, library, grid, from, bounds, d) {
  const perStamp = new Map();
  course.reboots.forEach(([c, r, face], i) => {
    const n = i + 1, ptr = "/reboots/" + i;
    if (!inBoard(grid, c, r) || isVoid(grid, c, r)) {
      d.error("course.rebootOffCourse", "Reboot token " + n + " at " + at(c, r) + " is off the course.", at(c, r), ptr);
      return;
    }
    const def = elementAt(grid, c, r);
    if (!def || def.props.pit) {
      d.error("course.rebootNotFloor", "Reboot token " + n + " at " + at(c, r) + " is on " + (def ? def.name.toLowerCase() : "nothing") +
        "; a token cannot stand in a pit. (Anything else under it is switched off, as the book says.)", at(c, r), ptr);
    }
    if (inBox(dockBox(course, library, bounds), c, r)) {
      d.error("course.rebootInDock", "Reboot token " + n + " at " + at(c, r) + " is on the docking bay, which has none: a robot that falls off the bay reboots at its own archive.", at(c, r), ptr);
    }
    const local = boardLocal(course, library, from, bounds, grid.w, c, r);
    if (local) {
      if (perStamp.has(local.index)) {
        d.error("course.rebootTwice", "Reboot tokens " + perStamp.get(local.index) + " and " + n + " are both on " + JSON.stringify(local.boardId) + "; a board has one.", at(c, r), ptr);
      } else perStamp.set(local.index, n);
    }
    const [nc, nr] = [c + DC[face], r + DR[face]];
    if (!inBoard(grid, nc, nr) || isVoid(grid, nc, nr) || (elementAt(grid, nc, nr) && elementAt(grid, nc, nr).key === "pit")) {
      d.warn("course.rebootArrow", "Reboot token " + n + " at " + at(c, r) + " points its arrow " + ["north", "east", "south", "west"][face] +
        " into " + (inBoard(grid, nc, nr) && !isVoid(grid, nc, nr) ? "a pit" : "the void") + ": a robot moved aside for a reboot goes that way.", at(c, r), ptr);
    }
  });
  if (course.reboots.length) {
    course.stamps.forEach((s, i) => {
      if (s.role === "dock" || perStamp.has(i)) return;
      d.warn("course.rebootMissing", JSON.stringify(s.board) + " has no Reboot token; the 2016 book wants one on every board but the docking bay. A robot that falls from it reboots at its archive.", null, s._ptr);
    });
  }
}

/* The course's own starting squares: on the floor, not on the docking bay
 * board, one to a square. ONE DEFINITION of where one may stand, shared with
 * the workshop in lib/course.js. */
function checkStarts(course, library, asm, d) {
  const seen = new Map();
  course.starts.forEach(([c, r], i) => {
    const n = i + 1, ptr = "/starts/" + i;
    const key = c + "," + r;
    if (seen.has(key)) {
      d.error("course.startDuplicate", "Starting squares " + seen.get(key) + " and " + n + " are both on " + at(c, r) + ".", at(c, r), ptr);
      return;
    }
    seen.set(key, n);
    const bad = startRefusal(course, library, asm, c, r);
    if (bad) d.error(bad.code, "Starting square " + n + " at " + at(c, r) + " is " + bad.why + ".", at(c, r), ptr);
  });
}

function checkFlags(course, library, grid, from, bounds, d) {
  if (!course.flags.length) {
    d.error("course.noFlags", "A race needs at least one flag.", null, "/flags");
    return;
  }
  const box = dockBox(course, library, bounds);
  const seen = new Map();
  let prev = null;

  course.flags.forEach(([c, r], i) => {
    const n = i + 1, ptr = "/flags/" + i;
    if (!inBoard(grid, c, r) || isVoid(grid, c, r)) {
      d.error("course.flagOffCourse", "Flag " + n + " at " + at(c, r) + " is off the course.", at(c, r), ptr);
      return;
    }
    const key = c + "," + r;
    if (seen.has(key)) {
      d.error("course.flagDuplicate", "Flags " + seen.get(key) + " and " + n + " are both on " + at(c, r) + ".",
        at(c, r), ptr);
    }
    seen.set(key, n);

    /* ONE DEFINITION of where a flag may stand, shared with the suggester in
     * lib/course.js. A suggester working to looser rules than the validator
     * would offer sets the validator then refuses, which is the worst of both;
     * a stricter one would refuse squares a person is allowed to use. */
    const bad = flagRefusal(course, library, { grid, from, bounds }, c, r);
    if (bad) d.error(bad.code, "Flag " + n + " at " + at(c, r) + " is " + bad.why + ".", at(c, r), ptr);
    else {
      const walls = wallsAround(grid, c, r);
      if (walls >= 2) {
        d.warn("course.flagWallCorner", "Flag " + n + " at " + at(c, r) + " is in a corner formed by " +
          walls + " walls. The classic rulebook says checkpoints should not be placed in one; " +
          "a robot has fewer ways to arrive and fewer to leave.", at(c, r), ptr);
      }
    }

    if (prev && FLAG_GAP_GUIDE !== null) {
      const gap = Math.max(Math.abs(c - prev[0]), Math.abs(r - prev[1]));
      if (gap > FLAG_GAP_GUIDE) {
        /* informational: the classic book keeps flags within twelve, the modern books say nothing */
        d.warn("course.flagGap", "Flag " + (n - 1) + " to flag " + n + " is " + gap + " steps.", at(c, r), ptr);
      }
    }
    prev = [c, r];
  });
}
