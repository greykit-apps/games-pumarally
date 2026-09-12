#!/usr/bin/env node
/*
 * Integrity check for PumaRally's board data.
 *
 *   node tools/check-boards.js
 *
 * Boards are transcribed by hand from reference images, so the failure modes
 * are all data-shaped and silent: a picture row that lost a character, a belt
 * pointing into a wall, a laser with nothing to mount on. Those do not throw
 * on their own -- they render a board that is plausible and wrong.
 *
 * This REQUIRES pumarally-boards.js rather than parsing it, unlike
 * retro-surfer's check-sprites.js. That file had to parse because the game is
 * a browser IIFE that touches window on load; this one is a pure data module
 * that touches neither. Sharing the module means CI runs byte-for-byte the
 * same validator the browser runs, so a board that loads in the game cannot be
 * one CI would have rejected -- which is worth more here than an independent
 * second implementation would be.
 */
const fs = require("fs");
const path = require("path");
const B = require(path.join(__dirname, "..", "pumarally-boards.js"));

let res;
try {
  res = B.validateAll();
} catch (e) {
  console.error("  error:   " + e.message);
  console.error("\n1 error(s)");
  process.exit(1);
}

const boards = Object.keys(res.boards);
const courses = Object.keys(B.COURSES);
console.log(`checked ${boards.length} board(s) and ${courses.length} course(s)`);

res.warnings.forEach(w => console.log(`  warning: ${w}`));

// Coverage: report which element types no board uses. Not an error -- an early
// board legitimately uses a subset -- but it says what the engine is untested on.
const used = new Set();
for (const id of boards) {
  const g = res.boards[id];
  for (const code of g.cell) if (code) used.add(code.charAt(0));
}
const unused = Object.keys(B.ELEMENT_DEFS).filter(k => !used.has(k));
if (unused.length) {
  console.log(`  note:    no board uses ${unused.map(k => `'${k}' (${B.ELEMENT_DEFS[k].name})`).join(", ")}`);
}

/* The editor's whole value is that what it exports can be pasted straight back
 * into pumarally-boards.js. Formatting every shipped board has to reproduce its
 * own source byte for byte, or the export has quietly become something a person
 * has to hand-correct -- which is exactly where transcription errors get in. */
const src = fs.readFileSync(path.join(__dirname, "..", "pumarally-boards.js"), "utf8");
for (const id of boards) {
  const text = B.formatBoard(id, res.boards[id]);
  if (!src.includes(text)) {
    console.error(`  error:   formatting board "${id}" does not reproduce its own source; ` +
      "the editor's export would need hand-correcting");
    const mine = text.split("\n"), theirs = src.split("\n");
    const at = theirs.findIndex(l => l.trim() === mine[0].trim());
    for (let i = 0; i < mine.length && at >= 0; i++) {
      if (theirs[at + i] !== mine[i]) {
        console.error(`             first difference at line ${i}:`);
        console.error(`               source:    ${JSON.stringify(theirs[at + i])}`);
        console.error(`               formatted: ${JSON.stringify(mine[i])}`);
        break;
      }
    }
    process.exitCode = 1;
  }
}
console.log(`  ok -- ${boards.length} board(s) round-trip through formatBoard byte for byte`);

for (const id of courses) {
  const C = B.buildCourse(id);
  console.log(`  ok -- course ${id}: ${C.w}x${C.h}, ${C.flags.length} flags, ${C.docks.length} docking bays, ${C.lasers.length} lasers`);
}
