/* Every control the inspector draws must be one the click handler answers.
 *
 * A control nobody handles DOES NOTHING WHEN CLICKED, in silence: an
 * unrecognised click falls through the handler chain and raises nothing, so a
 * whole panel of buttons can be inert while everything still looks right.
 *
 * Two of them were. `data-wd0-face` arrives in JavaScript as `dataset.wd0Face`
 * -- the DOM camel-cases dataset keys and eats the dashes -- and the handler
 * matched the dashes, so every facing, damage, reach and register control on a
 * placed device was dead. And the `unverified` toggle lost its handler in an
 * unrelated edit and nobody noticed, because a dead button looks exactly like a
 * live one.
 *
 * THE PANELS ARE RENDERED FOR REAL HERE, not scanned. panels.js touches no DOM
 * beyond assigning `innerHTML` at the end, so a stub with one setter is enough
 * to get the actual markup -- which is the only thing that settles what
 * attribute names reach the browser, since most of them are built by a shared
 * row helper and never appear as literals in the source.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInspector, renderRail, renderDiagnostics } from "../app/panels.js";
import { newState } from "../app/state.js";
import { apply, blankToolState, toolsFor, describe } from "../app/tools.js";
import { blankBoard, setCell, setSites } from "../lib/board.js";
import { E, N } from "../lib/dir.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "app");
const problems = [];

/** `data-meta-toggle` -> `metaToggle`, the way `element.dataset` spells it. */
const datasetKey = attr => attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

function stub() {
  let html = "";
  return { set innerHTML(v) { html = v; }, get html() { return html; } };
}

/* A board with something of every kind on it, so every panel branch renders. */
function loadedBoard() {
  const b = blankBoard({ id: "wiring", name: "Wiring", w: 8, h: 8, set: "authored", origin: "authored" });
  const st = blankToolState();
  setCell(b, 1, 1, "b>l");
  setSites(b, 2, 2, ["repair", "battery", "flagspot"]);
  setCell(b, 3, 3, "s1.");
  setCell(b, 4, 4, "t1."); setCell(b, 5, 4, "t1.");
  for (const [tool, c, r, dir] of [["dev:laser", 6, 1, 2], ["dev:pusher", 6, 3, 1],
                                   ["dev:jet", 6, 5, 1], ["dev:door", 2, 6, 0],
                                   ["dev:press", 4, 6, 0], ["dev:crusher", 5, 6, 0]]) {
    st.tool = tool; st.dir = dir;
    apply(b, st, c, r);
  }
  return b;
}

const board = loadedBoard();
const handled = readFileSync(join(APP, "main.js"), "utf8");
const drawnAttrs = new Set();

/* Every tool in hand, and every interesting square selected. */
for (const tool of toolsFor(false)) {
  const st = newState(board);
  st.hand.tool = tool.key;
  const el = stub();
  renderInspector(el, st, null, false);
  for (const m of el.html.matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
}
for (let r = 0; r < board.h; r++) {
  for (let c = 0; c < board.w; c++) {
    const st = newState(board);
    st.hand.tool = "select";
    st.sel = { c, r };
    const el = stub();
    try { renderInspector(el, st, { c, r, inside: true }, false); }
    catch (e) { problems.push("renderInspector threw on (" + c + "," + r + "): " + e.message); continue; }
    for (const m of el.html.matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
  }
}
{
  const st = newState(board);
  const el = stub();
  renderRail(el, st, false);
  for (const m of el.html.matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
}

if (drawnAttrs.size < 8) {
  problems.push("only " + drawnAttrs.size + " control attributes were rendered; this check is " +
    "passing vacuously rather than covering the panels.");
}

for (const attr of [...drawnAttrs].sort()) {
  const key = datasetKey(attr);
  if (!new RegExp("\\b" + key + "\\b").test(handled)) {
    problems.push("the inspector draws " + attr + " (dataset." + key +
      ") and main.js never mentions " + key + " -- clicking it does nothing, silently.");
  }
}

if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("check-wiring: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("ok " + drawnAttrs.size + " control attributes rendered, every one answered by its handler");
