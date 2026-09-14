/* The rail, the inspector, the diagnostics list and the status line.
 *
 * THE RAIL'S SWATCHES ARE THE BOARD'S OWN GLYPHS, drawn by the same table the
 * renderer draws from. A hand-typed legend was wrong within one edit the last
 * time this project had one, and read perfectly plausibly while being wrong.
 */

import { TOOLS, GROUPS, toolsFor, toolByKey, describe } from "./tools.js";
import { GLYPHS, DEVICE_GLYPHS, siteSwatch } from "../render/glyphs.js";
import { ELEMENTS, ARG_DIR, ARG_DIGIT, ARG_PAIR } from "../rulesets/elements.js";
import { DEVICE_KINDS, REGS_NONE } from "../rulesets/devices.js";
import { ARM_CHARS, ARM_NAMES, ARM_CODES } from "../lib/token.js";
import { cellAt } from "../lib/board.js";
import { dirLetter, N, E, S, W } from "../lib/dir.js";
import { describeRegs, REGISTERS } from "../lib/registers.js";
import { rulesetFor, rulesetIds, printingsOn, firstPrintedOnlyIn } from "../rulesets/index.js";
import { SETS, EDITIONS, ORIGINS } from "../rulesets/sets.js";
import { SITES, SITE_ORDER } from "../rulesets/sites.js";
import { esc } from "../render/theme.js";

const swatch = body =>
  '<span class="sw"><svg viewBox="-4 -4 108 108" xmlns="http://www.w3.org/2000/svg">' + body + "</svg></span>";

function toolSwatch(tool) {
  const ctx = { arg: "1", arms: ARM_CODES["."], dir: 0, regs: [1, 3], damage: 1, reach: 1 };
  if (tool.kind === "ground") {
    const def = ELEMENTS[tool.element];
    return swatch(GLYPHS[def.key].art(ctx));
  }
  if (tool.kind === "device" || tool.kind === "ceiling") {
    return swatch('<rect x="1" y="1" width="98" height="98" rx="4" fill="#2a2f3d"/>' +
      DEVICE_GLYPHS[tool.device].art(ctx));
  }
  if (tool.kind === "site") return swatch(siteSwatch(tool.site, "art"));
  if (tool.kind === "wall") {
    return swatch('<rect x="1" y="1" width="98" height="98" rx="4" fill="#2a2f3d"/>' +
      '<path d="M 0 96 L 100 96" stroke="#d8a52c" stroke-width="14" stroke-linecap="round"/>');
  }
  if (tool.kind === "level") {
    return swatch('<rect x="1" y="1" width="98" height="98" rx="4" fill="#2a2f3d"/>' +
      '<path d="M 10 70 L 50 70 L 50 30 L 90 30" fill="none" stroke="#ffe14d" stroke-width="9" stroke-linejoin="round"/>');
  }
  if (tool.kind === "flag") {
    return swatch('<path d="M 32 88 L 32 14 L 74 28 L 32 44" fill="#ff5f56" stroke="#ff5f56" stroke-width="6" stroke-linejoin="round"/>');
  }
  const mark = { select: "M 26 18 L 26 76 L 42 60 L 54 84 L 66 78 L 54 54 L 76 54 Z", pan: "M 30 60 L 30 34 M 46 60 L 46 26 M 62 60 L 62 34 M 22 56 q -6 24 18 32 q 26 6 32 -18 L 76 42" };
  return swatch('<path d="' + (mark[tool.kind] || "") + '" fill="none" stroke="#c8d4ea" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>');
}

export function renderRail(el, st, isCourse) {
  const tools = toolsFor(isCourse);
  let html = "";
  for (const group of GROUPS) {
    const list = tools.filter(t => t.group === group);
    if (!list.length) continue;
    html += "<h3>" + group + "</h3>";
    for (const t of list) {
      html += '<button class="tool" data-tool="' + esc(t.key) + '" aria-pressed="' +
        (st.hand.tool === t.key) + '" title="' + esc(t.label) + '">' +
        toolSwatch(t) + "<span>" + esc(t.label) + "</span>" +
        (t.printedIn && t.printedIn.length === 1
          ? '<span class="hot" title="printed in the ' + esc(EDITIONS[t.printedIn[0]].name) +
            ' game">' + esc(EDITIONS[t.printedIn[0]].name.charAt(0)) + "</span>"
          : t.hot ? '<span class="hot">' + esc(t.hot.toUpperCase()) + "</span>" : "") + "</button>";
    }
  }
  el.innerHTML = html;
}

/* ONE CONTROL, WHEREVER IT APPEARS.
 *
 * There used to be two interfaces for the same properties: the rail's "in hand"
 * panel offered a facing picker and seven shape buttons, and selecting a placed
 * belt offered three arm toggles and a differently-worded facing row. Same
 * facts, two vocabularies, and the one you got depended on whether you were
 * about to lay a belt or fix one. These rows are built once and pointed at
 * either target, so learning the control once is enough.
 */
function btnRow(label, opts, attr, isOn) {
  return '<div class="row"><label>' + esc(label) + "</label>" +
    opts.map(o => '<button data-' + attr + '="' + esc(String(o.v)) + '"' +
      ' aria-pressed="' + (isOn(o.v) ? "true" : "false") + '"' +
      (o.title ? ' title="' + esc(o.title) + '"' : "") + ">" + esc(o.label) + "</button>").join("") +
    "</div>";
}

const DIR_OPTS = [N, E, S, W].map(d => ({ v: d, label: dirLetter(d) }));
const ARM_OPTS = ARM_CHARS.map(a => ({ v: a, label: a, title: ARM_NAMES[a] }));
const nOpts = (lo, hi) => { const o = []; for (let v = lo; v <= hi; v++) o.push({ v, label: String(v) }); return o; };

/**
 * The property rows for one thing, whether it is in your hand or already on the
 * board. `t` says what it supports and what it currently is; `p` prefixes the
 * data attributes so the caller knows where a click should land.
 */
function propRows(t, p) {
  let html = "";
  if (t.dir !== undefined) html += btnRow("Facing", DIR_OPTS, p + "dir", v => v === t.dir);
  if (t.arms !== undefined) {
    html += btnRow("Shape", ARM_OPTS, p + "arms", v => v === t.arms);
    html += '<div class="row"><span class="none">' + esc(ARM_NAMES[t.arms] || "") +
      " &mdash; printed data, never guessed from the neighbours</span></div>";
  }
  if (t.digit !== undefined) html += btnRow("Bay", nOpts(1, 8), p + "digit", v => v === t.digit);
  if (t.pair !== undefined) html += btnRow("Colour", nOpts(1, 4), p + "pair", v => v === t.pair);
  if (t.level !== undefined) html += btnRow("Level", nOpts(0, 3), p + "level", v => v === t.level);
  return html;
}

/** The rows for one device, in hand or placed. Same builder, same wording. */
function deviceRows(def, dev, p) {
  let html = "";
  if (def.faced && dev.face !== undefined) {
    html += btnRow("Facing", DIR_OPTS, p + "face", v => v === dev.face);
  }
  for (const [key, spec] of Object.entries(def.fields)) {
    const cur = dev[key] === undefined ? (spec.default === undefined ? spec.min : spec.default) : dev[key];
    html += btnRow(key.charAt(0).toUpperCase() + key.slice(1), nOpts(spec.min, spec.max), p + key, v => v === cur);
  }
  if (def.regs !== REGS_NONE) {
    const regs = dev.regs && dev.regs.length ? dev.regs : null;
    html += btnRow("Registers", REGISTERS.map(v => ({ v, label: String(v) })), p + "reg",
      v => !regs || regs.indexOf(v) >= 0);
    html += '<div class="row"><span class="none">Fires in ' + esc(describeRegs(regs)) +
      (def.regs === "required" ? "." : ". Lighting all five means every register.") + "</span></div>";
  }
  return html;
}

export function renderInspector(el, st, hover, isCourse) {
  const tool = toolByKey(st.hand.tool);

  let html = "<h3>Board</h3>";
  html += '<div class="row"><label>Name</label><input type="text" data-meta="name" value="' +
    esc(st.board.name) + '"></div>';
  html += '<div class="row"><label>Id</label><input type="text" data-meta="id" value="' +
    esc(st.board.id) + '"></div>';
  html += '<div class="row"><label>Size</label><span class="pill">' + st.board.w + " x " + st.board.h +
    "</span></div>";
  html += '<div class="row"><label>Box</label><select data-meta="set">' +
    Object.keys(SETS).map(id => '<option value="' + esc(id) + '"' + (id === st.board.set ? " selected" : "") + ">" +
      esc(SETS[id].name + " \u2014 " + SETS[id].box) + "</option>").join("") + "</select></div>";
  html += '<div class="row"><label>Origin</label><select data-meta="origin">' +
    ORIGINS.map(o => '<option value="' + o + '"' + (o === st.board.origin ? " selected" : "") + ">" + o + "</option>").join("") +
    "</select>" +
    '<button data-meta-toggle="unverified" aria-pressed="' + !!st.board.unverified +
    '" title="Keeps the board out of course assembly until it has been checked square by square">unverified</button></div>';
  html += '<div class="row"><label>Notes</label><input type="text" data-meta="notes" value="' +
    esc(st.board.notes || "") + '" placeholder="where this came from"></div>';

  /* WHICH PRINTINGS THE CONTENTS COME FROM -- provenance, never a verdict. A
   * board carrying both is perfectly ordinary and is what a mixed course is
   * made of; the engine decides at play time which squares matter under the
   * ruleset in force. This line exists so a transcriber notices a square that
   * came out of a different box from the rest, which is usually worth a second
   * look at the photograph. */
  const printings = printingsOn(st.board);
  if (printings.length) {
    html += '<div class="row"><span class="none">Carries elements printed in ' +
      printings.map(e => esc(EDITIONS[e].name)).join(" and ") +
      (printings.length > 1
        ? " \u2014 fine; the engine sorts that out at play time."
        : "") + "</span></div>";
  }

  /* THE VIEW. There used to be a "Read as" switch here, picking which ruleset
   * the register-order panel was written for. That was a FILTER, and filtering
   * is the engine's job -- the editor should show everything it knows. The panel
   * below lists both orders now, and this switch chooses how the board is
   * DRAWN: solid play art, or the thin line work meant to be read over a
   * photograph of the printed board. */
  html += '<div class="row"><label>View</label>' +
    [["art", "Board art"], ["markup", "Markup"]].map(([k, label]) =>
      '<button data-view="' + k + '" aria-pressed="' + (st.mode === k) + '" title="' +
      (k === "markup" ? "thin line work, to be read over a photograph"
                      : "solid art, as the board is played") + '">' + label + "</button>").join("") +
    '<span class="hot">`</span></div>';

  /* The hand and a selection are mutually exclusive: picking a tool means you
   * are about to lay something, selecting a square means you are fixing what is
   * there. One panel at a time, and the same rows in both. */
  if (!st.sel) {
    html += "<h3>In hand</h3>";
    if (!tool) html += '<p class="none">Nothing.</p>';
    else {
      html += '<div class="row"><span class="pill">' + esc(tool.label) + "</span></div>";
      const t = {};
      if (tool.kind === "wall" || tool.kind === "device" ||
          (tool.kind === "ground" && tool.arg === ARG_DIR)) t.dir = st.hand.dir;
      if (tool.kind === "ground" && ELEMENTS[tool.element] && ELEMENTS[tool.element].props.belt) {
        t.arms = st.hand.arms;
      }
      if (tool.kind === "ground" && tool.arg === ARG_DIGIT) t.digit = st.hand.digit;
      if (tool.kind === "ground" && tool.arg === ARG_PAIR) t.pair = st.hand.pair;
      if (tool.kind === "level") t.level = st.hand.level;
      html += propRows(t, "");
      if (tool.kind === "site") {
        html += '<div class="row"><span class="none">' + esc(SITES[tool.site].source) +
          " Click a floor square to add it, click again to take it off; it sits alongside whatever else is marked there.</span></div>";
      }

      if (tool.kind === "device" || tool.kind === "ceiling") {
        const def = DEVICE_KINDS[tool.device];
        const held = { face: undefined, regs: st.hand.regs[tool.device] };
        for (const key of Object.keys(def.fields)) held[key] = st.hand[key];
        html += deviceRows(def, held, "");
      }
    }
  }

  /* --- the selected square, on exactly the same rows -------------------------
   * Everything here is the control the rail offers for laying the same thing.
   * Changing one writes to the board at once, so the drawing is the feedback --
   * there is no apply step and nothing to confirm. */
  if (st.sel) {
    const d = describe(st.board, st.sel.c, st.sel.r);
    if (d) {
      html += "<h3>This square &mdash; (" + d.c + "," + d.r + ")" +
        '<button class="count" data-act="deselect" title="Back to the rail">done</button></h3>';
      html += '<div class="row"><span class="pill">' + esc(d.element) + "</span>" +
        (d.level ? '<span class="pill">level ' + d.level + "</span>" : "") + "</div>";

      const edef = d.key && Object.values(ELEMENTS).find(x => x.key === d.key);
      const t = {};
      if (edef && edef.arg === ARG_DIR) t.dir = "^>v<".indexOf(d.dir);
      if (edef && edef.props.belt) t.arms = cellAt(st.board, d.c, d.r).charAt(2);
      if (edef && edef.arg === ARG_DIGIT) t.digit = +d.dir || +cellAt(st.board, d.c, d.r).charAt(1);
      if (edef && edef.arg === ARG_PAIR) t.pair = +cellAt(st.board, d.c, d.r).charAt(1);
      t.level = d.level;
      html += propRows(t, "sel");

      /* The markings, as toggles rather than a picker: a square can carry more
       * than one, and which of them is live is the engine's business at play
       * time. Only offered on floor, which is the only thing they mark. */
      if (edef && edef.key === "floor") {
        html += btnRow("Marked", SITE_ORDER.map(k => ({ v: k, label: SITES[k].name, title: SITES[k].short })),
          "selsite", k => d.sites.indexOf(k) >= 0);
        html += '<div class="row"><span class="none">' +
          (d.sites.length
            ? esc(d.sites.map(k => SITES[k].short).join(", ")) + " &mdash; the engine picks which is live"
            : "Nothing marked here.") + "</span></div>";
      }

      d.wallDevices.forEach((dev, i) => {
        const def = DEVICE_KINDS[dev.kind];
        html += "<h3>" + esc(def.name) +
          '<button class="count" data-devoff="' + i + '" title="Take it off">&times;</button></h3>';
        html += deviceRows(def, dev, "wd" + i + "-");
      });
      d.ceiling.forEach((dev, i) => {
        const def = DEVICE_KINDS[dev.kind];
        html += "<h3>" + esc(def.name) +
          '<button class="count" data-ceiloff="' + i + '" title="Take it off">&times;</button></h3>';
        html += deviceRows(def, dev, "cd" + i + "-");
      });
    }
  }

  html += "<h3>Under the pointer</h3>";
  if (!hover || !hover.inside) html += '<p class="none">Off the board.</p>';
  else {
    const d = describe(st.board, hover.c, hover.r);
    html += '<dl class="kv">';
    html += "<dt>Square</dt><dd>(" + d.c + "," + d.r + ")</dd>";
    html += "<dt>Ground</dt><dd>" + esc(d.element) + (d.dir ? " " + esc(d.dir) : "") + "</dd>";
    if (d.key) {
      const edef = Object.values(ELEMENTS).find(x => x.key === d.key);
      if (edef && edef.printedIn.length === 1) {
        html += "<dt>Printed in</dt><dd>" + esc(EDITIONS[edef.printedIn[0]].name) + "</dd>";
      }
    }
    if (d.arms) html += "<dt>Shape</dt><dd>" + esc(d.arms) + "</dd>";
    if (d.level) html += "<dt>Level</dt><dd>" + d.level + "</dd>";
    if (d.walls.length) html += "<dt>Walls</dt><dd>" + d.walls.join(" ") + "</dd>";
    if (d.doors.length) html += "<dt>Doors</dt><dd>" + d.doors.join(" ") + "</dd>";
    for (const dev of d.wallDevices) {
      html += "<dt>" + esc(DEVICE_KINDS[dev.kind].name) + "</dt><dd>" +
        (dev.face !== null && dev.face !== undefined ? "facing " + dirLetter(dev.face) + ", " : "") +
        esc(describeRegs(dev.regs)) + "</dd>";
    }
    for (const dev of d.ceiling) {
      html += "<dt>" + esc(DEVICE_KINDS[dev.kind].name) + "</dt><dd>" + esc(describeRegs(dev.regs)) + "</dd>";
    }
    html += "</dl>";

    /* WHAT HAPPENS HERE, AND IN WHAT ORDER -- UNDER BOTH SETS OF RULES.
     * The board's turn runs differently under each, and the editor has no
     * business deciding which you meant; that is the engine's choice at play
     * time. Where the two agree this reads as one answer. Where they differ,
     * the difference is the reason for showing it. */
    const step = o => "<li style='border-left-color:var(--hot);background:#0d1822;cursor:default'>" +
      esc(o) + "</li>";
    const orders = rulesetIds().map(id => ({ id, steps: orderFor(rulesetFor(id), d) }))
      .filter(o => o.steps.length);
    if (orders.length) {
      html += "<h3>At the end of a register</h3>";
      const same = orders.length === 2 && orders[0].steps.join("|") === orders[1].steps.join("|");
      if (same) {
        html += "<ol class='diag'>" + orders[0].steps.map(step).join("") + "</ol>";
        html += '<div class="row"><span class="none">The same under both sets of rules.</span></div>';
      } else {
        for (const o of orders) {
          html += '<div class="row"><span class="pill">' + esc(EDITIONS[o.id].name) + "</span></div>";
          html += "<ol class='diag'>" + o.steps.map(step).join("") + "</ol>";
        }
      }
    }
  }
  el.innerHTML = html;
}

/** The board's turn, filtered to what this square actually carries. */
function orderFor(rules, d) {
  if (!rules) return [];
  const has = {};
  const el = d.key;
  has.expressConveyor = el === "expressConveyor";
  /* Whether a fast belt ALSO runs with the slow ones is the one participation
   * difference between the two orders, and it lives on the ruleset rather than
   * as a branch here: classic express moves once alone and once more with
   * everything; a modern double belt moves two in its own step and then sits
   * out. The same distance by a different route -- and it matters wherever a
   * robot is in the way for one pass and not the other. */
  has.conveyor = el === "conveyor" || el === "current" ||
    (el === "expressConveyor" && rules.expressAlsoRunsWithNormals);
  has.current = el === "current";
  has.gear = el === "gearCW" || el === "gearCCW";
  has.pusher = d.wallDevices.some(x => x.kind === "pusher");
  has.jet = d.wallDevices.some(x => x.kind === "jet");
  has.boardLaser = false;
  has.press = d.ceiling.some(x => x.kind === "press");
  has.crusher = d.ceiling.some(x => x.kind === "crusher");
  has.flamer = d.ceiling.some(x => x.kind === "flamer");
  return rules.order
    .filter(s => has[s.step])
    .map(s => s.name + (s.settled === false ? " (where this falls is not settled by the sources)" : ""));
}

export function renderDiagnostics(el, st) {
  const errs = st.diagnostics.filter(d => d.severity === "error");
  const warns = st.diagnostics.filter(d => d.severity === "warning");
  let html = "<h3>Problems" +
    (errs.length ? ' <span class="bad">' + errs.length + "</span>" : "") +
    (warns.length ? ' <span class="warn">' + warns.length + "</span>" : "") + "</h3>";
  if (!st.diagnostics.length) {
    html += '<p class="none ok">Nothing wrong with this board.</p>';
  } else {
    html += '<ul class="diag">';
    for (const d of st.diagnostics.slice(0, 40)) {
      html += '<li class="' + (d.severity === "warning" ? "warn" : "") + '"' +
        (d.where ? ' data-goto="' + esc(d.where) + '"' : "") + ">" +
        '<span class="code">' + esc(d.code) + "</span>" + esc(d.message) + "</li>";
    }
    html += "</ul>";
    if (st.diagnostics.length > 40) {
      html += '<p class="none">and ' + (st.diagnostics.length - 40) + " more</p>";
    }
  }
  el.innerHTML = html;
}
