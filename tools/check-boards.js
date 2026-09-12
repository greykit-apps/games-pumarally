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

for (const id of courses) {
  const C = B.buildCourse(id);
  console.log(`  ok -- course ${id}: ${C.w}x${C.h}, ${C.flags.length} flags, ${C.docks.length} docking bays, ${C.lasers.length} lasers`);
}
