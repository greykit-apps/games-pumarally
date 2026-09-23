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
import { bayNumberOf } from "../lib/token.js";
import { dirLetter, N, E, S, W } from "../lib/dir.js";
import { describeRegs, REGISTERS } from "../lib/registers.js";
import { rulesetFor, rulesetIds, printingsOn, firstPrintedOnlyIn, playableIn } from "../rulesets/index.js";
import { SETS, EDITIONS, ORIGINS } from "../rulesets/sets.js";
import { SITES, SITE_ORDER } from "../rulesets/sites.js";
import { esc } from "../render/theme.js";
import { ART_DEFS } from "../render/palette.js";
import { boardSVG } from "../render/svg.js";

const swatch = body =>
  '<span class="sw"><svg viewBox="-4 -4 108 108" xmlns="http://www.w3.org/2000/svg">' + body + "</svg></span>";

function toolSwatch(tool) {
  const ctx = { arg: "1", arms: ARM_CODES["."], dir: 0, level: 0, regs: [1, 3], damage: 1, reach: 1 };
  if (tool.kind === "ground") {
    const def = ELEMENTS[tool.element];
    return swatch(GLYPHS[def.key].art(ctx));
  }
  if (tool.kind === "device" || tool.kind === "ceiling") {
    return swatch(GLYPHS.floor.art(ctx) + DEVICE_GLYPHS[tool.device].art(ctx));
  }
  if (tool.kind === "site") return swatch(siteSwatch(tool.site, "art"));
  if (tool.kind === "wall") {
    /* the board's wall, in miniature: lit lip, mid body, shadowed foot */
    return swatch(GLYPHS.floor.art(ctx) +
      '<g filter="url(#pr-wallshadow)"><rect x="0" y="84" width="100" height="19" fill="#5f6674"/>' +
      '<rect x="0" y="84" width="100" height="17" fill="#7a818e"/>' +
      '<rect x="0" y="84" width="100" height="2.4" fill="#99a0ad"/></g>');
  }
  if (tool.kind === "level") {
    return swatch('<rect x="1" y="1" width="98" height="98" rx="4" fill="#2a2f3d"/>' +
      '<path d="M 10 70 L 50 70 L 50 30 L 90 30" fill="none" stroke="#ffe14d" stroke-width="9" stroke-linejoin="round"/>');
  }
  if (tool.kind === "ramp") {
    return swatch('<rect x="1" y="1" width="98" height="98" rx="4" fill="#2a2f3d"/>' +
      '<path d="M 4 26 L 96 26 L 70 52 L 30 52 Z" fill="#ffe14d" opacity=".9"/>' +
      '<path d="M 16 34 L 84 34 M 24 43 L 76 43" stroke="#2a2f3d" stroke-width="5"/>');
  }
  if (tool.kind === "flag") {
    return swatch('<path d="M 32 88 L 32 14 L 74 28 L 32 44" fill="#ff5f56" stroke="#ff5f56" stroke-width="6" stroke-linejoin="round"/>');
  }
  const mark = { select: "M 26 18 L 26 76 L 42 60 L 54 84 L 66 78 L 54 54 L 76 54 Z", pan: "M 30 60 L 30 34 M 46 60 L 46 26 M 62 60 L 62 34 M 22 56 q -6 24 18 32 q 26 6 32 -18 L 76 42" };
  return swatch('<path d="' + (mark[tool.kind] || "") + '" fill="none" stroke="#c8d4ea" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>');
}

/* THE RAIL'S GRADIENTS AND SYMBOLS, once.
 *
 * A swatch is a bare <svg> with no defs of its own, and the art's shared
 * pieces -- the hazard stripe, the steel gradient, the floor deck -- are
 * addressed by id. Until now those resolved only because the BOARD's SVG was
 * in the same document and its ids leaked; the floor plate became a <use> of
 * one of those symbols, and a <use> whose target is not there draws nothing at
 * all, silently. One hidden copy in the rail is what makes the swatches stand
 * on their own instead of on an accident. */
const RAIL_DEFS =
  '<svg class="pr-defs" aria-hidden="true" width="0" height="0" ' +
  'style="position:absolute" xmlns="http://www.w3.org/2000/svg">' + ART_DEFS + "</svg>";

export function renderRail(el, st, isCourse) {
  const tools = toolsFor(isCourse);
  let html = RAIL_DEFS;
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
const LEVEL_OPTS = [-3, -2, -1, 0, 1, 2, 3].map(n => ({ v: n, label: n > 0 ? "+" + n : String(n),
  title: n === 0 ? "the base floor" : Math.abs(n) + (n > 0 ? " up" : " down") }));

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
  if (t.digit !== undefined) html += btnRow("Bay", nOpts(1, 12), p + "digit", v => v === t.digit);
  if (t.pair !== undefined) html += btnRow("Colour", nOpts(1, 4), p + "pair", v => v === t.pair);
  /* signed: the base floor, up to three up, down to three down -- a channel
   * below the floor you walk in on is the ordinary case (Water Park) */
  if (t.level !== undefined) html += btnRow("Level", LEVEL_OPTS, p + "level", v => v === t.level);
  return html;
}

/**
 * The rows for one device, in hand or placed. Same builder, same wording.
 *
 * `slot` is null for the thing in your hand and "wd0"/"cd1" for one already on
 * the board. A PLACED device's rows go on ONE attribute carrying slot, field
 * and value together, and that is not a style choice: `data-wd0-face` arrives
 * in JavaScript as `dataset.wd0Face`, because the DOM camel-cases dataset keys
 * and eats the dashes. The first version of this matched the dashes, so no
 * click on a placed device's facing, damage, reach or registers did anything at
 * all -- silently, because an unrecognised click just falls through.
 */
function deviceRows(def, dev, slot) {
  const attr = (key, v) => slot
    ? { name: "devrow", value: slot + ":" + key + ":" + v }
    : { name: key, value: v };
  const row = (label, opts, key, isOn) => slot
    ? '<div class="row"><label>' + esc(label) + "</label>" +
      opts.map(o => '<button data-devrow="' + esc(slot + ":" + key + ":" + o.v) + '"' +
        ' aria-pressed="' + (isOn(o.v) ? "true" : "false") + '">' + esc(o.label) + "</button>").join("") +
      "</div>"
    : btnRow(label, opts, key, isOn);

  let html = "";
  if (def.faced && dev.face !== undefined) html += row("Facing", DIR_OPTS, "face", v => v === dev.face);
  for (const [key, spec] of Object.entries(def.fields)) {
    const cur = dev[key] === undefined ? (spec.default === undefined ? spec.min : spec.default) : dev[key];
    html += row(key.charAt(0).toUpperCase() + key.slice(1), nOpts(spec.min, spec.max), key, v => v === cur);
  }
  if (def.regs !== REGS_NONE) {
    const regs = dev.regs && dev.regs.length ? dev.regs : null;
    html += row("Registers", REGISTERS.map(v => ({ v, label: String(v) })), "reg",
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
    '" title="Not yet checked square by square against its photograph; a course that lays it says so">unverified</button></div>';
  html += '<div class="row"><label>Notes</label><input type="text" data-meta="notes" value="' +
    esc(st.board.notes || "") + '" placeholder="where this came from"></div>';

  /* WHICH PRINTINGS THE CONTENTS COME FROM -- provenance, never a verdict. A
   * board carrying both is perfectly ordinary and is what a mixed course is
   * made of; the engine decides at play time which squares matter under the
   * ruleset in force. This line exists so a transcriber notices a square that
   * came out of a different box from the rest, which is usually worth a second
   * look at the photograph. */
  /* It NAMES THE THING rather than calling it an element, because it is often
   * not one -- `printingsOn` counts devices too, and since oil and portals
   * merged there is no single-printing element on any shipped board at all, so
   * every board this line fires on fires for a flame jet or a flamer. "Carries
   * elements printed in Classic" was then simply untrue, and a transcriber
   * checking the photograph for the offending SQUARE would have found nothing
   * on it. `firstPrintedOnlyIn` was already written and already handles
   * devices; it just had no caller. */
  const printings = printingsOn(st.board);
  if (printings.length === 1) {
    const one = firstPrintedOnlyIn(st.board, printings[0]);
    html += '<div class="row"><span class="none">Carries ' +
      (one ? "a " + esc(one.what.toLowerCase()) + (one.where ? " at " + esc(one.where) : "") : "something") +
      ", which only " + esc(EDITIONS[printings[0]].name) + " prints." +
      /* and provenance is not playability: fire is printed in one box and
       * played by both, so a board saying only "Classic prints this" would
       * read as a board the 2016 game cannot race, which it is not */
      (playableIn(st.board).length > 1 ? " Both books play it." : "") + "</span></div>";
  } else if (printings.length > 1) {
    html += '<div class="row"><span class="none">Carries things only ' +
      printings.map(e => esc(EDITIONS[e].name)).join(" and only ") +
      " print \u2014 fine; the engine sorts that out at play time.</span></div>";
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
      if (tool.kind === "ramp") {
        html += '<div class="row"><span class="none">Click an edge to lay a ramp across it; click again to take it off. ' +
          "The higher square is the top, read off the levels. Between two squares at one level, the far square is raised a level as the ramp goes down.</span></div>";
      }
      if (tool.kind === "site") {
        html += '<div class="row"><span class="none">' + esc(SITES[tool.site].source) +
          " Click a floor square to add it, click again to take it off; it sits alongside whatever else is marked there.</span></div>";
      }

      if (tool.kind === "device" || tool.kind === "ceiling") {
        const def = DEVICE_KINDS[tool.device];
        const held = { face: undefined, regs: st.hand.regs[tool.device] };
        for (const key of Object.keys(def.fields)) held[key] = st.hand[key];
        html += deviceRows(def, held, null);
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
        (d.level ? '<span class="pill">level ' + (d.level > 0 ? "+" : "") + d.level + "</span>" : "") +
        d.ramps.map(rp => '<span class="pill">ramp ' + dirLetter(rp.dir) + (rp.step > 0 ? " up" : rp.step < 0 ? " down" : ", level") + "</span>").join("") + "</div>";

      const edef = d.key && Object.values(ELEMENTS).find(x => x.key === d.key);
      const t = {};
      if (edef && edef.arg === ARG_DIR) t.dir = "^>v<".indexOf(d.dir);
      if (edef && edef.props.belt) t.arms = cellAt(st.board, d.c, d.r).charAt(2);
      if (edef && edef.arg === ARG_DIGIT) t.digit = +d.dir || bayNumberOf(cellAt(st.board, d.c, d.r).charAt(1));
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
        html += deviceRows(def, dev, "wd" + i);
      });
      d.ceiling.forEach((dev, i) => {
        const def = DEVICE_KINDS[dev.kind];
        html += "<h3>" + esc(def.name) +
          '<button class="count" data-ceiloff="' + i + '" title="Take it off">&times;</button></h3>';
        html += deviceRows(def, dev, "cd" + i);
      });
      /* a door stands on an edge, not in the square, so it is listed by the
       * side it is on; both squares beside it list it */
      (d.doorDevices || []).forEach(({ dev, dir }, i) => {
        const def = DEVICE_KINDS[dev.kind];
        html += "<h3>" + esc(def.name) + ", " + dirLetter(dir) + " side" +
          '<button class="count" data-dooroff="' + i + '" title="Take it off">&times;</button></h3>';
        html += deviceRows(def, dev, "dr" + i);
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
    if (d.level) html += "<dt>Level</dt><dd>" + (d.level > 0 ? "+" : "") + d.level + "</dd>";
    if (d.ramps.length) html += "<dt>Ramps</dt><dd>" + d.ramps.map(rp => dirLetter(rp.dir) + (rp.step > 0 ? " (up)" : rp.step < 0 ? " (down)" : " (level)")).join(", ") + "</dd>";
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
  has.crusher = d.ceiling.some(x => x.kind === "crusher");
  has.flamer = d.ceiling.some(x => x.kind === "flamer");
  return rules.order
    .filter(s => has[s.step])
    .map(s => s.name + (s.settled === false ? " (where this falls is not settled by the sources)" : ""));
}

/* --- the board library -------------------------------------------------------
 *
 * THE WORKSHOP HAD NO WAY IN. It opened whatever board was last in hand, kept
 * in this browser's own storage, and the only route to any other shipped board
 * was typing `#board=<id>` in the address bar. From the outside that looks like
 * a site serving one map: whatever you last had open is the whole world. The
 * course workshop had a rail of every board all along, but it stamps them into
 * a course rather than opening them to edit, so it was no way in either.
 *
 * The thumbnails are memoised by id. This markup is rebuilt whenever the
 * library loads, and drawing eighteen boards is not something to do twice.
 */
const thumbs = new Map();

/**
 * Every shipped board as a thumbnail that opens it.
 * `rows` is null while the library is still loading and empty when it could
 * not be loaded -- two different things, and a reader has to be told which.
 */
export function libraryHtml(rows, currentId) {
  if (!rows) return '<p class="none">Loading the shipped boards\u2026</p>';
  if (!rows.length) return '<p class="none bad">The shipped boards could not be loaded.</p>';
  let html = '<div class="lib">';
  for (const row of rows) {
    if (!thumbs.has(row.id)) thumbs.set(row.id, boardSVG(row.board, { mode: "art", background: true }));
    html += '<button class="lb" data-open-board="' + esc(row.id) + '" aria-pressed="' + (row.id === currentId) +
      '" title="' + esc(row.name) + " " + row.w + "\u00d7" + row.h + (row.unverified ? ", unverified" : "") + '">' +
      '<span class="lb-thumb">' + thumbs.get(row.id) + "</span>" +
      '<span class="lb-name">' + esc(row.name) + "</span></button>";
  }
  return html + "</div>";
}

/** `what` names the thing checked: a board in the board workshop, a course in the course workshop. */
export function renderDiagnostics(el, st, what = "board") {
  const errs = st.diagnostics.filter(d => d.severity === "error");
  const warns = st.diagnostics.filter(d => d.severity === "warning");
  let html = "<h3>Problems" +
    (errs.length ? ' <span class="bad">' + errs.length + "</span>" : "") +
    (warns.length ? ' <span class="warn">' + warns.length + "</span>" : "") + "</h3>";
  if (!st.diagnostics.length) {
    html += '<p class="none ok">Nothing wrong with this ' + what + '.</p>';
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
