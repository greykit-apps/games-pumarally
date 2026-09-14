/* The rail, the inspector, the diagnostics list and the status line.
 *
 * THE RAIL'S SWATCHES ARE THE BOARD'S OWN GLYPHS, drawn by the same table the
 * renderer draws from. A hand-typed legend was wrong within one edit the last
 * time this project had one, and read perfectly plausibly while being wrong.
 */

import { TOOLS, GROUPS, toolsFor, toolByKey, describe, EDITION_CHOICES } from "./tools.js";
import { GLYPHS, DEVICE_GLYPHS } from "../render/glyphs.js";
import { ELEMENTS, ARG_DIR, ARG_DIGIT, ARG_PAIR } from "../rulesets/elements.js";
import { DEVICE_KINDS, REGS_NONE } from "../rulesets/devices.js";
import { ARM_CHARS, ARM_NAMES, ARM_CODES } from "../lib/token.js";
import { dirLetter, N, E, S, W } from "../lib/dir.js";
import { describeRegs, REGISTERS } from "../lib/registers.js";
import { rulesetFor, playableEditions, editionBlocker } from "../rulesets/index.js";
import { SETS, EDITIONS, ORIGINS } from "../rulesets/sets.js";
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
  const tools = toolsFor(st.board.edition, isCourse);
  let html = "";
  for (const group of GROUPS) {
    const list = tools.filter(t => t.group === group);
    if (!list.length) continue;
    html += "<h3>" + group + "</h3>";
    for (const t of list) {
      html += '<button class="tool" data-tool="' + esc(t.key) + '" aria-pressed="' +
        (st.hand.tool === t.key) + '" title="' + esc(t.label) + '">' +
        toolSwatch(t) + "<span>" + esc(t.label) + "</span>" +
        (t.hot ? '<span class="hot">' + esc(t.hot.toUpperCase()) + "</span>" : "") + "</button>";
    }
  }
  el.innerHTML = html;
}

export function renderInspector(el, st, hover, isCourse) {
  const tool = toolByKey(st.hand.tool);
  const rules = rulesetFor(st.board.edition);
  let html = "<h3>Board</h3>";
  html += '<div class="row"><label>Name</label><input type="text" data-meta="name" value="' +
    esc(st.board.name) + '"></div>';
  html += '<div class="row"><label>Id</label><input type="text" data-meta="id" value="' +
    esc(st.board.id) + '"></div>';
  html += '<div class="row"><label>Size</label><span class="pill">' + st.board.w + " x " + st.board.h +
    "</span></div>";

  /* WHICH GAME THIS BOARD WAS PRINTED FOR, and it has to be changeable here.
   * The rail offers only what the declared edition printed, and a new board
   * starts classic -- so while this was a read-only pill, nine elements
   * (water, drains, ramps, currents, energy, randomizers, teleporters, the
   * antenna and the reboot token) could not be reached at all, and elevation
   * along with them, since a ramp is modern-only. */
  html += '<div class="row"><label>Edition</label>' +
    EDITION_CHOICES.map(k =>
      '<button data-edition="' + k + '" aria-pressed="' + (st.board.edition === k) + '" title="' +
      (EDITIONS[k] ? esc(EDITIONS[k].years) : "every element legal in both games") + '">' +
      esc(EDITIONS[k] ? EDITIONS[k].name : "Both") + "</button>").join("") + "</div>";

  /* What switching would cost, counted before it is clicked rather than
   * discovered as a screen of diagnostics afterwards. */
  for (const k of EDITION_CHOICES) {
    if (k === st.board.edition) continue;
    const n = countIllegal(st.board, k);
    if (n) {
      html += '<div class="row"><span class="none">' + esc(EDITIONS[k] ? EDITIONS[k].name : "Both") +
        ": " + n + " square" + (n === 1 ? "" : "s") + " would be illegal.</span></div>";
    }
  }

  const sets = Object.keys(SETS).filter(id => SETS[id].edition === "both" || SETS[id].edition === st.board.edition);
  if (!sets.includes(st.board.set)) sets.unshift(st.board.set);
  html += '<div class="row"><label>Box</label><select data-meta="set">' +
    sets.map(id => '<option value="' + esc(id) + '"' + (id === st.board.set ? " selected" : "") + ">" +
      esc(SETS[id] ? SETS[id].name + " \u2014 " + SETS[id].box : id + " (not a known box)") +
      "</option>").join("") + "</select></div>";
  html += '<div class="row"><label>Origin</label><select data-meta="origin">' +
    ORIGINS.map(o => '<option value="' + o + '"' + (o === st.board.origin ? " selected" : "") + ">" + o + "</option>").join("") +
    "</select>" +
    '<button data-meta-toggle="unverified" aria-pressed="' + !!st.board.unverified +
    '" title="Keeps the board out of course assembly until it has been checked square by square">unverified</button></div>';
  html += '<div class="row"><label>Notes</label><input type="text" data-meta="notes" value="' +
    esc(st.board.notes || "") + '" placeholder="where this came from"></div>';

  html += "<h3>In hand</h3>";
  if (!tool) html += '<p class="none">Nothing.</p>';
  else {
    html += '<div class="row"><span class="pill">' + esc(tool.label) + "</span></div>";
    const needsDir = tool.kind === "wall" || tool.kind === "device" ||
      (tool.kind === "ground" && tool.arg === ARG_DIR);
    if (needsDir) {
      html += '<div class="row"><label>Facing</label>' +
        [N, E, S, W].map(d => '<button data-dir="' + d + '" aria-pressed="' + (st.hand.dir === d) +
          '">' + dirLetter(d) + "</button>").join("") + "</div>";
    }
    if (tool.kind === "ground" && tool.arg === ARG_DIGIT) {
      html += '<div class="row"><label>Bay</label>' +
        [1, 2, 3, 4, 5, 6, 7, 8].map(n => '<button data-digit="' + n + '" aria-pressed="' +
          (st.hand.digit === n) + '">' + n + "</button>").join("") + "</div>";
    }
    if (tool.kind === "ground" && tool.arg === ARG_PAIR) {
      html += '<div class="row"><label>Colour</label>' +
        [1, 2, 3, 4].map(n => '<button data-pair="' + n + '" aria-pressed="' +
          (st.hand.pair === n) + '">' + n + "</button>").join("") + "</div>";
    }
    if (tool.kind === "ground" && ELEMENTS[tool.element] && ELEMENTS[tool.element].props.belt) {
      html += '<div class="row"><label>Shape</label>' +
        ARM_CHARS.map(a => '<button data-arms="' + a + '" aria-pressed="' + (st.hand.arms === a) +
          '" title="' + esc(ARM_NAMES[a]) + '">' + a + "</button>").join("") + "</div>";
      html += '<div class="row"><span class="none">' + esc(ARM_NAMES[st.hand.arms]) +
        ' &mdash; printed data, never guessed from the neighbours</span></div>';
    }
    if (tool.kind === "level") {
      html += '<div class="row"><label>Level</label>' +
        [1, 2, 3].map(n => '<button data-level="' + n + '" aria-pressed="' + (st.hand.level === n) +
          '">' + n + "</button>").join("") + "</div>";
    }
    if (tool.kind === "device" || tool.kind === "ceiling") {
      const def = DEVICE_KINDS[tool.device];
      if ("damage" in def.fields) {
        html += '<div class="row"><label>Damage</label>' +
          [1, 2, 3].map(n => '<button data-damage="' + n + '" aria-pressed="' + (st.hand.damage === n) +
            '">' + n + "</button>").join("") + "</div>";
      }
      if ("reach" in def.fields) {
        html += '<div class="row"><label>Reach</label>' +
          [1, 2].map(n => '<button data-reach="' + n + '" aria-pressed="' + (st.hand.reach === n) +
            '">' + n + "</button>").join("") + "</div>";
      }
      if (def.regs !== REGS_NONE) {
        const regs = st.hand.regs[tool.device] || [];
        html += '<div class="row"><label>Registers</label>' +
          REGISTERS.map(n => '<button data-reg="' + n + '" aria-pressed="' + (regs.indexOf(n) >= 0) +
            '">' + n + "</button>").join("") + "</div>";
        html += '<div class="row"><span class="none">Fires in ' + esc(describeRegs(regs)) +
          (def.regs === "required" ? "" : ". None chosen means every register.") + "</span></div>";
      }
    }
  }

  html += "<h3>Under the pointer</h3>";
  if (!hover || !hover.inside) html += '<p class="none">Off the board.</p>';
  else {
    const d = describe(st.board, hover.c, hover.r);
    html += '<dl class="kv">';
    html += "<dt>Square</dt><dd>(" + d.c + "," + d.r + ")</dd>";
    html += "<dt>Ground</dt><dd>" + esc(d.element) + (d.dir ? " " + esc(d.dir) : "") + "</dd>";
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

    /* WHAT HAPPENS HERE, AND IN WHAT ORDER. The editor knows the rules, so it
     * can say what a robot standing here meets and when -- taken from the
     * ruleset's own order table rather than written out again. */
    const steps = orderFor(st.board, rules, d);
    if (steps.length) {
      html += "<h3>At the end of a register</h3><ol class='diag'>";
      for (const s of steps) html += "<li style='border-left-color:var(--hot);background:#0d1822;cursor:default'>" + esc(s) + "</li>";
      html += "</ol>";
    }
  }
  el.innerHTML = html;
}

/** How many squares carry something the given edition never printed. */
function countIllegal(board, edition) {
  let n = 0;
  for (const tok of board.cells) {
    const def = ELEMENTS[tok.charAt(0)];
    if (!def) continue;
    const okHere = edition === "both" ? def.editions.length === 2 : def.editions.indexOf(edition) >= 0;
    if (!okHere) n++;
  }
  for (const dev of [...board.wallDevices, ...board.ceilingDevices]) {
    const def = DEVICE_KINDS[dev.kind];
    if (!def) continue;
    const okHere = edition === "both" ? def.editions.length === 2 : def.editions.indexOf(edition) >= 0;
    if (!okHere) n++;
  }
  return n;
}

/** The board's turn, filtered to what this square actually carries. */
function orderFor(board, rules, d) {
  if (!rules) return [];
  const has = {};
  const el = d.key;
  has.expressConveyor = el === "expressConveyor";
  has.conveyor = el === "conveyor" || el === "current" || el === "expressConveyor";
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
