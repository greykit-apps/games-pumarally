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
import { renderInspector, renderRail, renderDiagnostics, libraryHtml } from "../app/panels.js";
import { newState } from "../app/state.js";
import { apply, blankToolState, toolsFor, describe } from "../app/tools.js";
import { blankBoard, setCell, setSites } from "../lib/board.js";
import { E, N } from "../lib/dir.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "app");
const problems = [];
let courseAttrs = 0;

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
                                   ["dev:crusher", 5, 6, 0]]) {
    st.tool = tool; st.dir = dir;
    apply(b, st, c, r);
  }
  return b;
}

/* AN SVG IS A DRAWING, NOT A CONTROL. `boardSVG` stamps `data-board` and
 * `data-mode` on the root of every board it draws, and a scan that took those
 * for buttons accused the handler of ignoring two controls that do not exist
 * -- while the library panel that introduced them was wired correctly. A
 * drawing has no click handler to be missing, so drawings come out first. */
const controls = html => html.replace(/<svg\b[\s\S]*?<\/svg>/g, "");

const board = loadedBoard();
const handled = readFileSync(join(APP, "main.js"), "utf8");
const drawnAttrs = new Set();

/* Every tool in hand, and every interesting square selected. */
for (const tool of toolsFor(false)) {
  const st = newState(board);
  st.hand.tool = tool.key;
  const el = stub();
  renderInspector(el, st, null, false);
  for (const m of controls(el.html).matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
}
for (let r = 0; r < board.h; r++) {
  for (let c = 0; c < board.w; c++) {
    const st = newState(board);
    st.hand.tool = "select";
    st.sel = { c, r };
    const el = stub();
    try { renderInspector(el, st, { c, r, inside: true }, false); }
    catch (e) { problems.push("renderInspector threw on (" + c + "," + r + "): " + e.message); continue; }
    for (const m of controls(el.html).matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
  }
}
{
  const st = newState(board);
  const el = stub();
  renderRail(el, st, false);
  for (const m of controls(el.html).matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
}

/* The board library is drawn into the shell rather than into a panel, so it
 * would sit outside this check entirely -- and it is a panel of buttons like
 * any other. */
{
  const el = stub();
  el.innerHTML = libraryHtml([{ id: "island", name: "Island", w: 12, h: 12, unverified: false, board }], "island");
  for (const m of controls(el.html).matchAll(/\bdata-([a-z][a-z0-9-]*)=/g)) drawnAttrs.add("data-" + m[1]);
}

if (drawnAttrs.size < 8) {
  problems.push("only " + drawnAttrs.size + " control attributes were rendered; this check is " +
    "passing vacuously rather than covering the panels.");
}

/* THE HANDLER MUST READ THE KEY OFF A DATASET, not merely contain the word.
 *
 * This check used to ask whether main.js mentioned the key ANYWHERE in its
 * source, and that let a dead control through for as long as markup mode has
 * existed. `data-view` becomes `dataset.view`; main.js is full of `view` --
 * `makeView`, `const view`, `view.boardEl`, `layout(view, st)` -- so the word
 * was always there and the two View buttons were never wired to anything. Only
 * the backtick key reached setMode. Clicking Markup did nothing, in silence,
 * which is the exact failure this file was written to catch and the exact way
 * it failed to: a test that cannot tell the thing it is looking for from a
 * common identifier is not testing for it.
 *
 * `d.view` and `dataset.view` are how a handler actually reads one, so those
 * are what is required. It is still a source scan and still weaker than
 * dispatching a real click -- which needs a DOM this tree deliberately has no
 * dependency for -- but it can no longer be satisfied by a coincidence of
 * spelling. Every one of the 22 attributes passes it; exactly one passed the
 * old one without being handled. */
for (const attr of [...drawnAttrs].sort()) {
  const key = datasetKey(attr);
  if (!new RegExp("(?:\\bd|\\bdataset)\\." + key + "\\b").test(handled)) {
    const loose = new RegExp("\\b" + key + "\\b").test(handled);
    problems.push("the inspector draws " + attr + " and main.js never reads d." + key +
      " or dataset." + key + " -- clicking it does nothing, silently." +
      (loose ? " (The word " + key + " does appear in main.js, which is how this hid.)" : ""));
  }
}

/* COURSE MODE, the other half of the app, which this file did not look at at
 * all until the View buttons turned out to be dead in the board workshop.
 *
 * It is checked a weaker way, and the comment is what says so: coursemode.js
 * builds its own markup and handles its own clicks in one file, and every
 * `data-` attribute it draws appears as a LITERAL in that source, so scanning
 * for them finds them all. It could not see an attribute assembled from pieces
 * the way panels.js does with its shared row helpers -- which is exactly why
 * the board half is rendered for real instead. If course mode ever grows a
 * computed attribute name this stops covering it, and the count assertion is
 * the only thing that would say so. */
{
  const src = readFileSync(join(APP, "coursemode.js"), "utf8");
  const drawn = new Set();
  /* `=` optional: data-flagmode, data-shipped and data-close are valueless and
   * were invisible to a regex that demanded one */
  for (const m of src.matchAll(/\bdata-([a-z][a-z0-9-]*)(?=[=\s>])/g)) drawn.add("data-" + m[1]);
  if (drawn.size < 10) {
    problems.push("only " + drawn.size + " control attributes found in coursemode.js; " +
      "this half of the check is passing vacuously.");
  }
  for (const attr of [...drawn].sort()) {
    const key = datasetKey(attr);
    if (!new RegExp("(?:\\bd|\\bdataset)\\." + key + "\\b").test(src)) {
      problems.push("course mode draws " + attr + " and never reads d." + key +
        " or dataset." + key + " -- clicking it does nothing, silently.");
    }
  }
  courseAttrs = drawn.size;
}

if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("check-wiring: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("ok " + drawnAttrs.size + " control attributes rendered and " + courseAttrs +
  " found in course mode, every one read off a dataset by its handler");
