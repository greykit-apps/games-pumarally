/* Assembling boards into a course.
 *
 * SIZE-AGNOSTIC. The old assembler hardcoded twelve in four places -- boards
 * had to sit on a 12-square lattice, the docking bay had to be the row directly
 * below the lowest board, the palette refused anything but 12x12, and the flag
 * corner rule was `c % 12`. Master Builder ships 6x6 and 6x2 boards and the
 * docking bay is 12x4, so three of those four were already wrong for data in
 * the box. Nothing in here knows the number twelve.
 *
 * THE 3x3 SLOT GRID IS GONE RATHER THAN GENERALISED. Every rule in it -- a slot
 * IS a board position, the block goes under the bottom row, boards two apart
 * meet at a corner -- restates a geometric fact that free integer placement
 * plus a flood fill expresses directly and correctly at any size. Snapping
 * belongs in the editor's pointer handling, not in the model.
 *
 * `assemble` returns a provenance array alongside the grid, naming the stamp
 * that owns each square. It costs one store per cell and it is what makes
 * "not in the very corner of a board" expressible without `% 12`.
 */

import {
  blankBoard, idx, inBoard, isVoid, setCell, levelAt, setLevel, hasLevels, cellAt,
  elementAt, flagSpots, deviceCell
} from "./board.js";
import { rotateBoard, rotatedDims } from "./rotate.js";
import { EDGE_NONE, EDGE_WALL, EDGE_DOOR } from "./edges.js";
import { DC, DR, N, E, S, W } from "./dir.js";

export const COURSE_FORMAT = "PRCourse";
export const COURSE_VERSION = 1;
export const ROLES = ["board", "dock"];

/** The dimensions a stamp occupies once rotated. */
export function stampDims(board, rot) {
  return rotatedDims(board.w, board.h, rot);
}

/** {x0,y0,x1,y1} inclusive, in course squares. */
export function stampFootprint(stamp, board) {
  const [w, h] = stampDims(board, stamp.rot);
  return { x0: stamp.at[0], y0: stamp.at[1], x1: stamp.at[0] + w - 1, y1: stamp.at[1] + h - 1 };
}

/** The bounding box of every stamp. */
export function courseBounds(course, library) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of course.stamps) {
    const b = library.get(s.board);
    if (!b) continue;
    const f = stampFootprint(s, b);
    x0 = Math.min(x0, f.x0); y0 = Math.min(y0, f.y0);
    x1 = Math.max(x1, f.x1); y1 = Math.max(y1, f.y1);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: -1, y1: -1, w: 0, h: 0 };
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A wall and a door meeting at one edge: the wall wins.
 * Edges are UNIONED rather than replaced, because a perimeter wall belongs to
 * the board that prints it and the board laid beside it cannot know about it.
 */
function mergeEdge(a, b) {
  if (a === EDGE_WALL || b === EDGE_WALL) return EDGE_WALL;
  if (a === EDGE_DOOR || b === EDGE_DOOR) return EDGE_DOOR;
  return EDGE_NONE;
}

/**
 * Compose the stamps into one grid.
 * Returns { grid, from, bounds } where `from[r*w+c]` is the index of the stamp
 * that owns that square, or -1 for a hole.
 */
export function assemble(course, library) {
  const bounds = courseBounds(course, library);
  const grid = blankBoard({
    id: course.id || "course", name: course.name || "Course",
    w: Math.max(bounds.w, 1), h: Math.max(bounds.h, 1),
    set: "authored", origin: "authored",
    allowVoid: true
  });
  grid.cells.fill("   ");
  const from = new Int16Array(grid.w * grid.h).fill(-1);

  course.stamps.forEach((stamp, si) => {
    const src = library.get(stamp.board);
    if (!src) return;
    const b = rotateBoard(src, stamp.rot || 0);
    const dx = stamp.at[0] - bounds.x0, dy = stamp.at[1] - bounds.y0;

    for (let r = 0; r < b.h; r++) {
      for (let c = 0; c < b.w; c++) {
        const gc = c + dx, gr = r + dy;
        if (!inBoard(grid, gc, gr)) continue;
        grid.cells[idx(grid, gc, gr)] = b.cells[idx(b, c, r)];
        from[gr * grid.w + gc] = si;
        const lvl = levelAt(b, c, r);
        if (lvl) setLevel(grid, gc, gr, lvl);
        const has = b.sites.get(c + "," + r);
        if (has) grid.sites.set(gc + "," + gr, has.slice());
      }
    }
    for (let r = 0; r <= b.h; r++) {
      for (let c = 0; c < b.w; c++) {
        const code = b.wallH[r * b.w + c];
        if (!code) continue;
        const i = (r + dy) * grid.w + (c + dx);
        if (r + dy >= 0 && r + dy <= grid.h && c + dx >= 0 && c + dx < grid.w) {
          grid.wallH[i] = mergeEdge(grid.wallH[i], code);
        }
      }
    }
    for (let r = 0; r < b.h; r++) {
      for (let c = 0; c <= b.w; c++) {
        const code = b.wallV[r * (b.w + 1) + c];
        if (!code) continue;
        if (r + dy >= 0 && r + dy < grid.h && c + dx >= 0 && c + dx <= grid.w) {
          const i = (r + dy) * (grid.w + 1) + (c + dx);
          grid.wallV[i] = mergeEdge(grid.wallV[i], code);
        }
      }
    }
    for (const dev of b.wallDevices) {
      grid.wallDevices.push({ ...dev, edge: { kind: dev.edge.kind, c: dev.edge.c + dx, r: dev.edge.r + dy } });
    }
    for (const dev of b.ceilingDevices) {
      grid.ceilingDevices.push({ ...dev, c: dev.c + dx, r: dev.r + dy });
    }
  });

  return { grid, from, bounds };
}

/**
 * Board-local coordinates for a course square: which stamp owns it, and where
 * it sits inside that stamp's own rotated dimensions.
 *
 * This is what replaces `c % 12`. That was never a simplification of the corner
 * rule -- for a 12x4 dock or a 6x6 board it computes a different rule entirely.
 */
export function boardLocal(course, library, from, bounds, gridW, c, r) {
  const si = from[r * gridW + c];
  if (si < 0) return null;
  const stamp = course.stamps[si];
  const src = library.get(stamp.board);
  if (!src) return null;
  const [w, h] = stampDims(src, stamp.rot || 0);
  return {
    stamp, index: si, boardId: stamp.board, w, h,
    c: c - (stamp.at[0] - bounds.x0),
    r: r - (stamp.at[1] - bounds.y0)
  };
}

/** Is this square the very corner of the board that wrote it? */
export function inBoardCorner(local) {
  if (!local) return false;
  return (local.c === 0 || local.c === local.w - 1) &&
         (local.r === 0 || local.r === local.h - 1);
}

/**
 * Connected components over non-void squares, 4-adjacency, IGNORING WALLS.
 * Stronger than the old slot adjacency without needing a rule that says so:
 * two boards touching only at a corner are not 4-adjacent, so nothing can drive
 * between them and they come back as two components.
 *
 * Walls are ignored on purpose -- a walled-off pocket is still one course. What
 * a wall decides is whether a docking bay can get out, which is its own check.
 */
export function components(grid) {
  const seen = new Int8Array(grid.w * grid.h);
  const out = [];
  for (let r = 0; r < grid.h; r++) {
    for (let c = 0; c < grid.w; c++) {
      const i = r * grid.w + c;
      if (seen[i] || isVoid(grid, c, r)) continue;
      const stack = [[c, r]];
      const cells = [];
      seen[i] = 1;
      while (stack.length) {
        const [cc, rr] = stack.pop();
        cells.push([cc, rr]);
        for (const d of [N, E, S, W]) {
          const nc = cc + DC[d], nr = rr + DR[d];
          if (!inBoard(grid, nc, nr) || isVoid(grid, nc, nr)) continue;
          const j = nr * grid.w + nc;
          if (seen[j]) continue;
          seen[j] = 1;
          stack.push([nc, nr]);
        }
      }
      out.push(cells);
    }
  }
  return out;
}

/** The one dock stamp, or null. */
export function dockStamp(course) {
  return course.stamps.find(s => s.role === "dock") || null;
}

/** The dock's footprint, derived from its OWN rotated dimensions. */
export function dockBox(course, library, bounds) {
  const s = dockStamp(course);
  if (!s) return null;
  const b = library.get(s.board);
  if (!b) return null;
  const f = stampFootprint(s, b);
  return { x0: f.x0 - bounds.x0, y0: f.y0 - bounds.y0, x1: f.x1 - bounds.x0, y1: f.y1 - bounds.y0 };
}

export function inBox(box, c, r) {
  return !!box && c >= box.x0 && c <= box.x1 && r >= box.y0 && r <= box.y1;
}


/* --- flags ------------------------------------------------------------------
 * A BOARD says where a flag MAY go. A COURSE says where the flags ARE.
 *
 * Those are different jobs and both are real. A board's flag locations are the
 * squares its designer is willing to see raced to -- somewhere a robot can come
 * to rest, not in a corner, not under a ram. A course's flags are the ones this
 * particular race uses, and a premade course sets them by hand.
 *
 * What the marks are FOR is the suggestion: when the computer offers a set, it
 * picks from the marked squares rather than from anywhere on the floor, so an
 * offered course cannot put a flag somewhere the board's author would not have.
 */

/**
 * Why this square cannot take a flag, or null when it can.
 * ONE DEFINITION, used by the validator and by the suggester -- a suggester
 * working to looser rules than the validator would offer sets the validator
 * then refuses, which is the worst of both.
 */
export function flagRefusal(course, library, asm, c, r) {
  const { grid, from, bounds } = asm;
  if (!inBoard(grid, c, r) || isVoid(grid, c, r)) {
    return { code: "course.flagOffCourse", why: "off the course" };
  }
  /* The starting block first: a square inside it is refused whatever else is
   * true of it, and "inside the starting block" is the reason worth reading. */
  if (inBox(dockBox(course, library, bounds), c, r)) {
    return { code: "course.flagInDock", why: "inside the starting block" };
  }
  const def = elementAt(grid, c, r);
  if (!def || def.key !== "floor") {
    return { code: "course.flagNotFloor",
      why: "on " + (def ? def.name.toLowerCase() : "nothing") + ", and a flag stands on plain floor" };
  }
  for (const dev of grid.wallDevices) {
    const cell = deviceCell(dev);
    if (cell && cell[0] === c && cell[1] === r) {
      return { code: "course.flagUnderDevice", why: "sharing its square with something bolted to a wall" };
    }
  }
  const local = boardLocal(course, library, from, bounds, grid.w, c, r);
  if (inBoardCorner(local)) {
    return { code: "course.flagInCorner",
      why: "the very corner of " + (local ? JSON.stringify(local.boardId) : "its board") };
  }
  return null;
}

/** Every marked flag location on the assembled course that a flag could use. */
export function usableFlagSpots(course, library, asm) {
  const a = asm || assemble(course, library);
  return flagSpots(a.grid)
    .filter(s => !flagRefusal(course, library, a, s.c, s.r))
    .map(s => {
      const local = boardLocal(course, library, a.from, a.bounds, a.grid.w, s.c, s.r);
      return { c: s.c, r: s.r, stamp: local ? local.index : -1, board: local ? local.boardId : null };
    });
}

const dist = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

/** The square a race starts from: the middle of the docking bay, or the course. */
function startPoint(course, library, asm) {
  const box = dockBox(course, library, asm.bounds);
  if (box) return { c: (box.x0 + box.x1) / 2, r: (box.y0 + box.y1) / 2 };
  return { c: (asm.grid.w - 1) / 2, r: (asm.grid.h - 1) / 2 };
}

/**
 * Offer a set of flags, CHOSEN FROM WHAT THE BOARDS MARK.
 *
 * `perBoard` takes one from each board that marks any, which is the shape a
 * multi-board race usually wants. Otherwise it takes `count`, spread as far
 * apart as the marks allow -- greedily maximising the distance to whatever is
 * already chosen, which is how you get a race that crosses the course rather
 * than three flags in one corner.
 *
 * The ORDER is then a route: nearest-unvisited from the starting block onward.
 * Choosing the spread and ordering it are different questions, and doing them
 * in one pass gives you a set that is either badly spread or badly ordered.
 */
export function suggestFlags(course, library, opts = {}) {
  const asm = opts.asm || assemble(course, library);
  const spots = usableFlagSpots(course, library, asm);
  if (!spots.length) return [];

  const count = Math.max(1, opts.count === undefined ? 3 : opts.count);
  let chosen = [];

  if (opts.perBoard) {
    /* one from each board that marks any, taking the spot furthest from the
     * start on each so the race is not decided by which square was listed first */
    const start = startPoint(course, library, asm);
    const byStamp = new Map();
    for (const s of spots) {
      const cur = byStamp.get(s.stamp);
      if (!cur || dist(s, start) > dist(cur, start)) byStamp.set(s.stamp, s);
    }
    chosen = [...byStamp.values()];
  } else {
    const start = startPoint(course, library, asm);
    /* first the one furthest from the start, then each one maximising the
     * distance to the nearest already chosen */
    let best = spots[0];
    for (const s of spots) if (dist(s, start) > dist(best, start)) best = s;
    chosen = [best];
    while (chosen.length < count && chosen.length < spots.length) {
      let pick = null, pickD = -1;
      for (const s of spots) {
        if (chosen.some(x => x.c === s.c && x.r === s.r)) continue;
        const d = Math.min(...chosen.map(x => dist(x, s)));
        if (d > pickD) { pickD = d; pick = s; }
      }
      if (!pick) break;
      chosen.push(pick);
    }
  }

  /* order them into a route from the starting block */
  const start = startPoint(course, library, asm);
  const left = chosen.slice();
  const order = [];
  let at2 = start;
  while (left.length) {
    let i = 0;
    for (let k = 1; k < left.length; k++) if (dist(left[k], at2) < dist(left[i], at2)) i = k;
    at2 = left[i];
    order.push(left.splice(i, 1)[0]);
  }
  return order.map(s => [s.c, s.r]);
}
