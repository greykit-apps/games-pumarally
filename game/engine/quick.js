/* A quick game: one board, turned to a random facing, three flags drawn at
 * random from the squares it marks as flag locations.
 *
 * There is no course file for it. The board says where a flag MAY go
 * (editor/rulesets/sites.js), and this makes the course a race actually
 * uses out of that: the document it returns is an ordinary PRCourse, laid
 * over the docking bay, so the save carries it and a resumed game plays
 * the same layout. Every shipped board with three marked locations is a
 * quick game under whichever rulesets read its squares.
 */
import { stampDims, usableFlagSpots } from "../../editor/lib/course.js";
import { docksOf } from "../../editor/lib/board.js";

export const QUICK_FLAGS = 3;
export const DOCK_BOARD = "dockingBay";
export const FACINGS = ["as printed", "a quarter turn clockwise", "upside down", "a quarter turn anticlockwise"];

/** The board over the docking bay, at a facing, with no flags yet. */
function layout(board, rot, dock) {
  const [w, h] = stampDims(board, rot);
  /* the narrower of the two sits centred on the wider; a stamp cannot start
   * left of zero, so it is the wider one that stands at zero */
  const bx = Math.max(0, Math.floor((dock.w - w) / 2)), dx = Math.max(0, Math.floor((w - dock.w) / 2));
  return {
    format: "PRCourse", version: 1,
    id: "quick_" + board.id, name: board.name, kind: "quick",
    blurb: "A quick game on " + board.name + ", laid " + FACINGS[rot] + ", with " + QUICK_FLAGS + " flags drawn from where it marks.",
    stamps: [
      { role: "board", board: board.id, rot, at: [bx, 0] },
      { role: "dock", board: dock.id, rot: 0, at: [dx, h] }
    ],
    flags: [],
    minPlayers: 1, maxPlayers: 8
  };
}

/** The flag locations a quick game on this board could draw from, at its printed facing. */
export function quickSpots(board, library) {
  const dock = library.get(DOCK_BOARD);
  if (!dock || board.id === dock.id || docksOf(board).length) return [];
  return usableFlagSpots(layout(board, 0, dock), library);
}

/** Does the board make a quick game: not a docking bay, and enough marked locations for the flags? */
export function canQuick(board, library) {
  return quickSpots(board, library).length >= QUICK_FLAGS;
}

/**
 * The course for a quick game on `board`. `rnd` is a function returning a
 * float in [0, 1); the setup screen passes none and gets Math.random, the
 * simulator passes a seeded one so a run repeats. `rot` pins the facing.
 */
export function quickCourse(board, library, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const dock = library.get(DOCK_BOARD);
  if (!dock) throw new Error("a quick game needs the " + DOCK_BOARD + " board");
  const rot = opts.rot === undefined ? Math.floor(rnd() * 4) & 3 : opts.rot & 3;
  const doc = layout(board, rot, dock);
  const spots = usableFlagSpots(doc, library);
  if (spots.length < QUICK_FLAGS) throw new Error(board.id + " marks " + spots.length + " usable flag location(s); a quick game draws " + QUICK_FLAGS);
  /* Fisher-Yates, then the first three: a random set in a random order */
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = spots[i]; spots[i] = spots[j]; spots[j] = t;
  }
  doc.flags = spots.slice(0, QUICK_FLAGS).map(s => [s.c, s.r]);
  return doc;
}

/** A seeded generator for the tools, so a quick game in a check is the same quick game every run. */
export function seeded(seed) {
  let s = seed | 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; };
  /* neighbouring seeds start a step apart and their first draws sit within
   * a thousandth of each other; a few steps in they have spread out */
  next(); next(); next();
  return next;
}
