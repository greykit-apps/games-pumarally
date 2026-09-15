#!/usr/bin/env node
/* The swap rule: a battery on every wrench, a wrench on every battery.
 *
 *   node editor/tools/swap-sites.js          # apply it to every board in data/
 *   node editor/tools/swap-sites.js --check  # report any board that breaks it
 *
 * THE RULE, decided 2026-09-15 for boards with no better information: the
 * classic printing marks repair sites and the 2016 printing marks energy
 * spaces, in the same kind of place for the same kind of reason -- somewhere
 * worth stopping -- and neither printing has the other's. So that most boards
 * play under either ruleset, every one- or two-wrench square also gets a
 * battery, and every battery square also gets a one-wrench repair site. One
 * wrench, not two: the two-wrench site is the classic game's rarer, richer
 * square, and nothing about a battery says which it would be.
 *
 * AUTHORED, AND SAID SO. A marking this tool adds is not printed on the board,
 * and the board data is otherwise a transcription of what is printed. So each
 * one carries a note naming itself as authored and naming the rule, on the
 * square's site entry, and convert-boards.js strips exactly those before it
 * compares the JSON with the old data. Board design is expected to revisit
 * these; the note is what makes them findable when it does.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoardDocument } from "../validate/index.js";
import { boardJSON } from "../lib/canon.js";
import { siteList, setSites } from "../lib/board.js";
import { authoredNote } from "../rulesets/sites.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "data", "boards");
const check = process.argv.includes("--check");

let changed = 0, broken = 0, boards = 0, added = { battery: 0, repair: 0 };
for (const f of readdirSync(DIR).filter(x => x.endsWith(".json")).sort()) {
  const id = basename(f, ".json");
  const { board, diagnostics } = checkBoardDocument(JSON.parse(readFileSync(join(DIR, f), "utf8")), id);
  if (!board || diagnostics.some(x => x.severity === "error")) {
    console.error("swap-sites: " + id + " does not validate; leaving it alone");
    broken++;
    continue;
  }
  boards++;
  const before = boardJSON(board);
  for (const s of siteList(board)) {
    const has = s.has.slice();
    const key = s.c + "," + s.r;
    const wrench = has.includes("repair") || has.includes("upgrade");
    const battery = has.includes("battery");
    const notes = [];
    if (wrench && !battery) { has.push("battery"); notes.push(authoredNote("battery")); added.battery++; }
    if (battery && !wrench) { has.push("repair"); notes.push(authoredNote("repair")); added.repair++; }
    if (!notes.length) continue;
    setSites(board, s.c, s.r, has);
    const old = board.siteNotes.get(key);
    board.siteNotes.set(key, (old ? old + "; " : "") + notes.join("; "));
  }
  const after = boardJSON(board);
  if (after === before) continue;
  changed++;
  if (check) console.error("swap-sites: " + id + " has a wrench without a battery or a battery without a wrench");
  else writeFileSync(join(DIR, f), after);
}

if (broken) process.exit(1);
if (check) {
  if (changed) { console.error("swap-sites: " + changed + " board(s) break the rule; run without --check"); process.exit(1); }
  console.log("ok " + boards + " boards: every wrench square has a battery and every battery square a wrench");
} else {
  console.log("swap-sites: " + boards + " boards read, " + changed + " changed; added " +
    added.battery + " batteries and " + added.repair + " repair sites, each noted as authored");
}
