/* The board library: every board under editor/data/boards, parsed once.
 *
 * Node reads the directory; the browser fetches the index and then each
 * board. Both produce the same Map of id -> board that the workshop's own
 * course mode builds, because it is the same parser -- there is one reader
 * of a PRBoard document in this repository and the game is not a second one.
 */
import { boardFromDocument } from "../../editor/lib/board.js";
import { courseFromDocument } from "../../editor/validate/course.js";
import { sink } from "../../editor/validate/diagnostic.js";

/** Node only: the library from disk, with the course index. Throws on a bad board. */
export async function loadLibraryFromDisk() {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "editor", "data");
  const library = new Map();
  for (const f of readdirSync(join(DATA, "boards")).filter(x => x.endsWith(".json")).sort()) {
    const id = f.replace(/\.json$/, "");
    const d = sink();
    const b = boardFromDocument(JSON.parse(readFileSync(join(DATA, "boards", f), "utf8")), d, id);
    const errors = d.items.filter(x => x.severity === "error");
    if (!b || errors.length) throw new Error("board " + id + ": " + (errors[0] || {}).message);
    library.set(id, b);
  }
  const courses = new Map();
  for (const f of readdirSync(join(DATA, "courses")).filter(x => x.endsWith(".json")).sort()) {
    const id = f.replace(/\.json$/, "");
    courses.set(id, JSON.parse(readFileSync(join(DATA, "courses", f), "utf8")));
  }
  return { library, courses };
}

/** Browser: the library over fetch, from the editor's data directory. */
export async function loadLibraryFromUrl(base = "./editor/data/") {
  const index = await (await fetch(base + "index.json")).json();
  const library = new Map();
  await Promise.all(index.boards.map(async row => {
    const d = sink();
    const b = boardFromDocument(await (await fetch(base + "boards/" + row.id + ".json")).json(), d, row.id);
    if (b && !d.items.some(x => x.severity === "error")) library.set(row.id, b);
  }));
  return { library, index };
}

/** A course document, read and validated; throws with the first error. */
export function readCourse(doc, library, expectId) {
  const d = sink();
  const c = courseFromDocument(JSON.parse(JSON.stringify(doc)), d, expectId);
  const errors = d.items.filter(x => x.severity === "error");
  if (!c || errors.length) throw new Error("course " + (doc && doc.id) + ": " + (errors[0] || {}).message);
  for (const s of c.stamps) if (!library.has(s.board)) throw new Error("course " + doc.id + " lays " + s.board + ", which is not in the library");
  return c;
}
