/* The board library, checked on its own terms.
 *
 * Unlike convert-boards.js this has no dependency on the old module, so it is
 * what carries on once that file is deleted. Three things:
 *
 *   1. every board validates
 *   2. serialize . parse . serialize is BYTE-EXACT for every one of them --
 *      if that ever stops being true the editor's export has quietly become
 *      something a person has to hand-correct, and hand-correcting an export
 *      is where transcription errors get in
 *   3. the library-level checks, which need every board in view at once
 *
 * It also prints, without failing: which elements and device kinds no shipped
 * board uses, and every warning. A gap that is a printed number is a gap
 * somebody can close; a gap that is a silence is one nobody knows about.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoardDocument } from "../validate/index.js";
import { validateLibrary } from "../validate/library.js";
import { sink } from "../validate/diagnostic.js";
import { boardJSON } from "../lib/canon.js";
import { toPicture, fromPicture } from "../lib/picture.js";
import { ELEMENTS } from "../rulesets/elements.js";
import { DEVICE_KINDS } from "../rulesets/devices.js";
import { printingsOn } from "../rulesets/index.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "data", "boards");
const DIR_C = join(HERE, "..", "data", "courses");

const files = readdirSync(DIR).filter(f => f.endsWith(".json")).sort();
if (!files.length) {
  /* A suite that checks nothing must never read as a pass. */
  console.error("check-format: there are no boards in " + DIR + ". " +
    "Run convert-boards.js, or this check is passing vacuously.");
  process.exit(1);
}

let errors = 0;
const warnings = [];
const entries = [];
const usedElements = new Set();
const usedDevices = new Set();

for (const file of files) {
  const id = basename(file, ".json");
  const text = readFileSync(join(DIR, file), "utf8");
  let doc;
  try { doc = JSON.parse(text); }
  catch (e) { console.error("  " + file + ": not valid JSON -- " + e.message); errors++; continue; }

  const { board, diagnostics } = checkBoardDocument(doc, id);
  for (const x of diagnostics) {
    if (x.severity === "error") { console.error("  " + id + ": " + x.code + " " + x.message); errors++; }
    else warnings.push("  " + id + ": " + x.code + " -- " + x.message);
  }
  if (!board) continue;
  entries.push({ id, board });

  const again = boardJSON(board);
  if (again !== text) {
    const a = text.split("\n"), b = again.split("\n");
    const line = a.findIndex((x, i) => x !== b[i]);
    console.error("  " + id + ": does not round-trip. First difference at line " + (line + 1) +
      "\n      on disk: " + JSON.stringify(a[line]) +
      "\n      rewrite: " + JSON.stringify(b[line]));
    errors++;
  }

  /* The ASCII picture is a LOSSLESS second spelling, not a lossy report -- it
   * is the recovery hatch for the eyeball-diff that three JSON layers cost us,
   * and a transcriber must be able to paste one back in. So it round-trips
   * too, and through the canonical writer so the comparison is byte-exact. */
  try {
    const back = fromPicture(toPicture(board), {
      id: board.id, name: board.name, set: board.set,
      origin: board.origin, unverified: board.unverified, notes: board.notes
    });
    const rewritten = boardJSON(back);
    if (rewritten !== text) {
      const a = text.split("\n"), b2 = rewritten.split("\n");
      const line = a.findIndex((x, i) => x !== b2[i]);
      console.error("  " + id + ": does not survive the ASCII picture. First difference at line " +
        (line + 1) + "\n      board:   " + JSON.stringify(a[line]) +
        "\n      picture: " + JSON.stringify(b2[line]));
      errors++;
    }
  } catch (e) {
    console.error("  " + id + ": the ASCII picture will not read back -- " + e.message);
    errors++;
  }

  for (const tok of board.cells) usedElements.add(tok.charAt(0));
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) usedDevices.add(dev.kind);
}

/* --- courses ---------------------------------------------------------------
 * A course is checked against the boards it actually names, so a board edit
 * that breaks a course -- a flag square turned into a conveyor, a docking bay
 * walled in -- is caught here rather than at play time. */
const library = new Map(entries.map(e => [e.id, e.board]));
let courseCount = 0;
if (existsSync(DIR_C)) {
  for (const file of readdirSync(DIR_C).filter(f => f.endsWith(".json")).sort()) {
    const id = basename(file, ".json");
    const cd = sink();
    let doc;
    try { doc = JSON.parse(readFileSync(join(DIR_C, file), "utf8")); }
    catch (e) { console.error("  " + file + ": not valid JSON -- " + e.message); errors++; continue; }
    const course = courseFromDocument(doc, cd, id);
    if (course) validateCourse(course, library, cd);
    for (const x of cd.items) {
      if (x.severity === "error") { console.error("  " + id + ": " + x.code + " " + x.message); errors++; }
      else warnings.push("  " + id + ": " + x.code + " -- " + x.message);
    }
    courseCount++;
  }
}
if (!courseCount) {
  console.error("check-format: there are no courses in " + DIR_C + ".");
  errors++;
}

const d = sink();
validateLibrary(entries, d);
for (const x of d.items) {
  if (x.severity === "error") { console.error("  library: " + x.code + " " + x.message); errors++; }
  else warnings.push("  library: " + x.code + " -- " + x.message);
}

if (warnings.length) {
  console.log(warnings.length + " warning(s):");
  for (const w of warnings) console.log(w);
}

const unusedE = Object.keys(ELEMENTS).filter(ch => !usedElements.has(ch));
const unusedD = Object.keys(DEVICE_KINDS).filter(k => !usedDevices.has(k));
if (unusedE.length) {
  console.log("note: no shipped board uses " + unusedE.length + " element(s): " +
    unusedE.map(ch => JSON.stringify(ch) + " " + ELEMENTS[ch].name).join(", "));
}
if (unusedD.length) {
  console.log("note: no shipped board uses " + unusedD.length + " device kind(s): " + unusedD.join(", "));
}

/* Provenance, printed as a note and never as a verdict: a board carrying
 * elements from both printings is perfectly ordinary. */
const byPrinting = {};
for (const e of entries) {
  const from = printingsOn(e.board).join("+") || "either";
  byPrinting[from] = (byPrinting[from] || 0) + 1;
}
console.log("note: elements printed in -- " + Object.entries(byPrinting).map(([k, v]) => k + ": " + v).join(", "));

if (errors) {
  console.error("check-format: " + errors + " error(s)");
  process.exit(1);
}
console.log("ok " + entries.length + " boards validate, round-trip byte for byte and survive the ASCII picture; " +
  courseCount + " courses assemble and validate against them");
