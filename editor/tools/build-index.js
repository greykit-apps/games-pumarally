#!/usr/bin/env node
/* Build data/index.json from what is on disk.
 *
 *   node editor/tools/build-index.js          # rewrite the index
 *   node editor/tools/build-index.js --check  # fail if it would change
 *
 * THE INDEX IS DERIVED, NEVER EDITED. There is no directory listing over
 * HTTP, so the page cannot discover what is in data/; this file is that
 * listing, and it is the whole of what shipping a board or a course takes:
 * drop the JSON the workshop exported into data/boards/ or data/courses/, run
 * this, commit both. A hand-edited index is how a file on disk ends up not
 * being on the shelf, or the other way round, with nothing saying so.
 *
 * Existing entries keep their order and new ones go on the end alphabetically,
 * so adding a board does not reshuffle the palette everyone has learned.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoardDocument } from "../validate/index.js";
import { courseFromDocument } from "../validate/course.js";
import { sink } from "../validate/diagnostic.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data");
const PATH = join(DATA, "index.json");
const check = process.argv.includes("--check");

const problems = [];
const jsonFiles = dir => existsSync(join(DATA, dir))
  ? readdirSync(join(DATA, dir)).filter(f => f.endsWith(".json")).sort()
  : [];

const boards = {};
for (const f of jsonFiles("boards")) {
  const id = basename(f, ".json");
  let doc;
  try { doc = JSON.parse(readFileSync(join(DATA, "boards", f), "utf8")); }
  catch (e) { problems.push("boards/" + f + ": not JSON (" + e.message + ")"); continue; }
  const { board, diagnostics } = checkBoardDocument(doc, id);
  const errors = diagnostics.filter(x => x.severity === "error");
  if (!board || errors.length) {
    problems.push("boards/" + f + ": " + (errors[0] || diagnostics[0] || { message: "unreadable" }).message);
    continue;
  }
  boards[id] = { id, name: board.name, w: board.w, h: board.h, set: board.set,
                 origin: board.origin, unverified: board.unverified || undefined };
}

const courses = {};
for (const f of jsonFiles("courses")) {
  const id = basename(f, ".json");
  let doc;
  try { doc = JSON.parse(readFileSync(join(DATA, "courses", f), "utf8")); }
  catch (e) { problems.push("courses/" + f + ": not JSON (" + e.message + ")"); continue; }
  const d = sink();
  const c = courseFromDocument(doc, d, id);
  const errors = d.items.filter(x => x.severity === "error");
  if (!c || errors.length) {
    problems.push("courses/" + f + ": " + (errors[0] || d.items[0] || { message: "unreadable" }).message);
    continue;
  }
  for (const s of c.stamps) {
    if (!boards[s.board]) problems.push("courses/" + f + ": lays " + JSON.stringify(s.board) + ", which is not in data/boards/");
  }
  courses[id] = { id, name: c.name, kind: c.kind || "track", blurb: c.blurb || "",
                  boards: c.stamps.filter(s => s.role === "board").length, flags: c.flags.length };
}

/* keep the order the shelf already has; new ids go on the end */
let previous = { boards: [], courses: [] };
if (existsSync(PATH)) {
  try { previous = JSON.parse(readFileSync(PATH, "utf8")); } catch (e) { /* rebuilt from scratch */ }
}
const ordered = (have, prior) => {
  const out = [];
  for (const row of prior || []) if (have[row.id]) out.push(have[row.id]);
  for (const id of Object.keys(have).sort()) if (!out.some(r => r.id === id)) out.push(have[id]);
  return out;
};

const index = { format: "PRIndex", version: 1, boards: ordered(boards, previous.boards), courses: ordered(courses, previous.courses) };
const text = JSON.stringify(index, null, 2) + "\n";

if (problems.length) {
  console.error("build-index: " + problems.length + " problem(s)");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
if (check) {
  const have = existsSync(PATH) ? readFileSync(PATH, "utf8") : null;
  if (have !== text) {
    console.error("build-index: data/index.json does not match data/. Run node editor/tools/build-index.js and commit it.");
    process.exit(1);
  }
  console.log("ok data/index.json lists " + index.boards.length + " boards and " + index.courses.length + " courses, every one on disk and readable");
} else {
  writeFileSync(PATH, text);
  console.log("wrote data/index.json: " + index.boards.length + " boards, " + index.courses.length + " courses");
}
