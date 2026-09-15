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
  components, dockStamp, dockBox, inBox, boardLocal, inBoardCorner, flagRefusal, wallsAround
} from "../lib/course.js";
import { checkBelts } from "./board.js";
import { inBoard, isVoid, cellAt, elementAt, docksOf, deviceCell, blockedAt, flagSpots } from "../lib/board.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
/* The classic rulebook's guideline on how far apart flags may be. Kept here
 * rather than on a ruleset because the editor has no ruleset in force -- it
 * reports the guideline and lets the designer decide. */
const FLAG_GAP_GUIDE = 12;

/* How many squares a map should MARK as possible flag locations. A race uses
 * about three; marking five or six leaves the engine something to choose
 * between, so the same course does not run identically every time. A guideline,
 * so it is a warning -- and it counts what the assembled boards mark between
 * them, because that is what the engine will be choosing from. */
const FLAG_SPOTS_WANTED = 5;
import { DC, DR, N, E, S, W } from "../lib/dir.js";
import { REGISTERS } from "../lib/registers.js";

const COURSE_KEYS = new Set([
  "format", "version", "id", "name", "kind", "blurb", "stamps", "flags", "minPlayers", "maxPlayers", "notes"
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
    stamps: [], flags: [],
    minPlayers: doc.minPlayers, maxPlayers: doc.maxPlayers
  };

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

  /* overlap */
  const boxes = course.stamps.map(s => ({ s, f: stampFootprint(s, library.get(s.board)) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].f, b = boxes[j].f;
      if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1) {
        d.error("course.overlap", JSON.stringify(boxes[i].s.board) + " and " +
          JSON.stringify(boxes[j].s.board) + " cover the same squares.", null, boxes[j].s._ptr);
      }
    }
  }

  const { grid, from, bounds } = assemble(course, library);

  /* connectivity */
  const parts = components(grid);
  if (parts.length > 1) {
    const sizes = parts.map(p => p.length).sort((a, b) => b - a);
    d.error("course.disconnected", "This course is " + parts.length + " separate areas (" +
      sizes.join(", ") + " squares). Boards that meet only at a corner are not joined: " +
      "nothing can drive between them.", null, "/stamps");
  }

  /* seams: the belt geometry checks, run over the assembled grid so a conveyor
   * running off one board into a wall on the next is caught by the same code
   * that catches it inside a board */
  checkBelts(grid, d);

  /* the dock */
  const docks = course.stamps.filter(s => s.role === "dock");
  if (docks.length > 1) {
    d.error("course.twoDocks", "A course has one docking bay; this one has " + docks.length + ".", null, "/stamps");
  } else if (!docks.length) {
    d.error("course.noDock", "This course has no docking bay, so there is nowhere for robots to start.", null, "/stamps");
  } else {
    checkDock(course, library, grid, bounds, d);
  }

  checkFlags(course, library, grid, from, bounds, d);

  const spots = flagSpots(grid).length;
  if (spots < FLAG_SPOTS_WANTED) {
    d.warn("course.fewFlagSpots", "This course marks " + spots + " flag location" +
      (spots === 1 ? "" : "s") + ". A race uses about three, and marking " + FLAG_SPOTS_WANTED +
      " or six leaves the engine something to choose between so the same course does not " +
      "run identically every time.", null, "/stamps");
  }
  return d;
}

function checkDock(course, library, grid, bounds, d) {
  const box = dockBox(course, library, bounds);
  const bays = docksOf(grid).filter(b => inBox(box, b.c, b.r));
  const seen = bays.map(b => b.n).sort((a, b) => a - b);
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== i + 1) {
      d.error("course.bayNumbering", "The docking bays are numbered " + seen.join(", ") +
        "; they must run 1 to " + seen.length + " with no gaps or repeats.", null, "/stamps");
      break;
    }
  }
  const seats = course.maxPlayers;
  if (Number.isInteger(seats) && seen.length < seats) {
    d.error("course.bayCount", "This course seats " + seats + " but has " + seen.length +
      " docking bay(s).", null, "/maxPlayers");
  }

  /* Every bay must be able to get OUT of the dock. This replaces "the column
   * above the block must be filled" with the thing that rule was trying to say,
   * and it works for a dock on any side, in a notch, or surrounded. A door
   * counts as a way out if it stands open in any register. */
  for (const bay of bays) {
    if (!escapes(grid, box, bay.c, bay.r)) {
      d.error("course.bayTrapped", "Docking bay " + bay.n + " at " + at(bay.c, bay.r) +
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
        d.warn("course.flagGap", "Flag " + n + " at " + at(c, r) + " is " + gap +
          " squares from flag " + (n - 1) + " in one direction. The classic rulebook keeps them " +
          "within " + FLAG_GAP_GUIDE + "; the modern books say nothing either way.", at(c, r), ptr);
      }
    }
    prev = [c, r];
  });
}
