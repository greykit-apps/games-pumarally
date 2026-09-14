/* The one entry point the browser and CI both call. */

import { sink } from "./diagnostic.js";
import { boardFromDocument } from "../lib/board.js";
import { validateBoard } from "./board.js";

/**
 * Read and check one board document. Returns {board, diagnostics}; `board` is
 * null only when the document could not be read at all.
 */
export function checkBoardDocument(doc, expectId) {
  const d = sink();
  const board = boardFromDocument(doc, d, expectId);
  if (board) validateBoard(board, d);
  return { board, diagnostics: d.items, ok: d.ok };
}

/** Check an already-parsed board. What the editor calls on every edit. */
export function checkBoard(board) {
  const d = sink();
  validateBoard(board, d);
  return { diagnostics: d.items, ok: d.ok };
}
