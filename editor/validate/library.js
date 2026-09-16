/* Checks that need more than one board in view.
 *
 * The duplicate-board check is the direct descendant of the one that found
 * Crash and Burn's "board E" to be a reprint of Island, and its "board F" a
 * reprint of Maelstrom. Two ids for one layout is not a second board; it is the
 * same board transcribed twice, with two chances to be transcribed differently.
 *
 * A board's layout is its ground, its walls AND its sites. Two boards that are
 * bare floor with no walls -- a Master Builder "Blueprint" and "Tabula Rasa" --
 * are different boards when they mark different flag spots and repair/battery
 * squares, so the sites are part of the key. A true reprint still matches: the
 * same board transcribed twice carries the same sites too.
 */

import { groundRows, latticeRows } from "../lib/canon.js";
import { siteList } from "../lib/board.js";
import { canonSites } from "../rulesets/sites.js";

/** The bytes that decide whether two boards are the same board. */
function layoutKey(board) {
  return [
    groundRows(board).join("\n"),
    latticeRows(board, "h").join("\n"),
    latticeRows(board, "v").join("\n"),
    siteList(board).map(s => s.c + "," + s.r + ":" + canonSites(s.has).join("+")).join(";")
  ].join("\n--\n");
}

/** `entries` is [{id, board}]. */
export function validateLibrary(entries, d) {
  const byId = new Map();
  for (const e of entries) {
    if (byId.has(e.id)) {
      d.error("library.duplicateId", "Two boards are called " + JSON.stringify(e.id) + ".", e.id, "/id");
    }
    byId.set(e.id, e);
  }
  const byLayout = new Map();
  for (const e of entries) {
    if (!e.board) continue;
    const key = layoutKey(e.board);
    const first = byLayout.get(key);
    if (first) {
      d.error("library.duplicateBoard", JSON.stringify(e.id) + " is square for square the same board as " +
        JSON.stringify(first) + ". A reprint is one board with two names, not two boards.", e.id, null);
    } else byLayout.set(key, e.id);
  }
  return d;
}
