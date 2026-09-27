/* The editor: boot, layout, and every event that reaches the board.
 *
 * This is the only file that touches the DOM beyond the panels, and the only
 * one that knows about the pointer. Everything it does to a board goes through
 * `apply` / `erase` in tools.js, which are pure and tested without a browser.
 */

import { injectCSS } from "./style.js";
import { newState, mark, keep, undo, redo, revalidate, saveLocal, readAll, readCourses, saveCourse } from "./state.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import {
  apply, erase, toolByKey, toolsFor, blankToolState, STEER_KEYS,
  setArms, toggleArm, turnHere, setDeviceRegs, setDeviceField, describe, newStroke,
  takeOffDoor, cellsBetween
} from "./tools.js";
import { makeView, draw, layout, fit, zoomAbout, hit, showGhost, showMarks, cellRect } from "./view.js";
import { renderRail, renderInspector, renderDiagnostics, libraryHtml } from "./panels.js";
import { blankBoard, cloneBoard, boardFromDocument, levelAt, setLevel, inBoard } from "../lib/board.js";
import { boardJSON } from "../lib/canon.js";
import { toPicture, fromPicture } from "../lib/picture.js";
import { sink } from "../validate/diagnostic.js";
import { rot, N, E, S, W, dirLetter } from "../lib/dir.js";
import { esc } from "../render/theme.js";
import { ELEMENTS } from "../rulesets/elements.js";

const SHELL = `
<div class="ed">
  <nav class="rail" aria-label="Tools"></nav>
  <div class="stage">
    <div class="viewport">
      <div class="world">
        <img class="photo" alt="">
        <div class="board"></div>
      </div>
      <div class="ghost" style="display:none"></div>
    </div>
  </div>
  <aside class="insp" aria-label="Inspector">
    <div class="insp-main"></div>
    <div class="insp-diag"></div>
    <h3>Reference photograph</h3>
    <div class="row"><button data-act="photo">Open&hellip;</button>
      <button data-act="photo-off">Remove</button></div>
    <div class="photo-ctl" style="display:none">
      <div class="row"><label>Fade</label><input type="range" data-ph="opacity" min="0" max="1" step="0.02" value="0.6"></div>
      <div class="row"><label>Size</label><input type="range" data-ph="scale" min="0.5" max="1.5" step="0.002" value="1"></div>
      <div class="row"><label>Across</label><input type="range" data-ph="dx" min="-300" max="300" step="1" value="0"></div>
      <div class="row"><label>Down</label><input type="range" data-ph="dy" min="-300" max="300" step="1" value="0"></div>
      <div class="row"><span class="none">Hold Ctrl to see the photograph alone.</span></div>
    </div>
    <div class="insp-course" style="display:none">
      <h3>This course</h3>
      <div class="row"><button data-act="course-save">Save to course library</button>
        <button data-act="course-play" class="primary">Play &rarr;</button></div>
      <div class="row"><span class="none">The whole course, one board. Flags are set in the <a class="course-link" href="#course" style="color:var(--hot)">course workshop</a>; save there and it comes back here.</span></div>
    </div>
    <h3>This board</h3>
    <div class="row">
      <button data-act="export">Export JSON</button>
      <button data-act="picture">Picture</button>
      <button data-act="import">Import&hellip;</button>
    </div>
    <div class="row"><button data-act="new">New board&hellip;</button>
      <button data-act="recover" style="display:none" title="The board that was open before the last New, Import or shipped-board load">Recover previous</button></div>
    <h3>Board library</h3>
    <div class="insp-lib"></div>
    <div class="row"><span class="none">Every shipped board. Opening one replaces the board you are on, which stays recoverable above.</span></div>
  </aside>
  <footer class="status">
    <span class="st-msg"></span>
    <span class="grow"></span>
    <span class="sep"></span>
    <button data-act="undo" title="Ctrl-Z">Undo</button>
    <button data-act="redo">Redo</button>
    <span class="sep"></span>
    <button data-act="zoomout">&minus;</button>
    <span class="st-zoom"></span>
    <button data-act="zoomin">+</button>
    <button data-act="fit">Fit</button>
  </footer>
</div>
<input type="file" class="filein" accept="image/*" hidden>
<input type="file" class="jsonin" accept=".json,application/json" hidden>
<dialog class="modal"></dialog>
`;

/* one press of W A S D moves the view this many pixels */
const PAN_STEP = 120;

export function mount(root) {
  injectCSS(document);
  root.innerHTML = SHELL;

  const st = newState(startingBoard());
  const view = makeView(root);
  const railEl = root.querySelector(".rail");
  const mainEl = root.querySelector(".insp-main");
  const diagEl = root.querySelector(".insp-diag");
  const msgEl = root.querySelector(".st-msg");
  const zoomEl = root.querySelector(".st-zoom");
  const libEl = root.querySelector(".insp-lib");
  const photoCtl = root.querySelector(".photo-ctl");
  const fileIn = root.querySelector(".filein");
  const jsonIn = root.querySelector(".jsonin");
  const modal = root.querySelector(".modal");

  let hover = null;
  let painting = null;     // { token, erase }
  let panning = null;

  function say(text, kind) {
    msgEl.textContent = text || "";
    msgEl.className = "st-msg " + (kind || "");
  }

  /* THE LIBRARY IS DRAWN ONCE. `refresh` runs on every hover and every edit,
   * and eighteen board drawings is not something to rebuild at that rate --
   * so the markup is built when the library arrives and `refresh` only moves
   * the pressed mark from one button to another. */
  let libRows = null;
  function drawLibrary() {
    libEl.innerHTML = libraryHtml(libRows, st.board.id);
  }
  function markLibrary() {
    for (const b of libEl.querySelectorAll("[data-open-board]")) {
      b.setAttribute("aria-pressed", String(b.dataset.openBoard === st.board.id));
    }
  }
  /** Open a shipped board from the library. A CLONE: editing must not reach the copy the library keeps. */
  function openFromLibrary(id) {
    const row = (libRows || []).find(r => r.id === id);
    if (!row) { say("That board is not in the library.", "bad"); return; }
    replaceBoard(cloneBoard(row.board));
    fit(view, st);
    /* the address bar may still say #board=<something we arrived by>, and a
     * reload would then reopen that one rather than this */
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    say("Opened " + row.name + ". The board you were on is recoverable.", "ok");
  }

  function refresh({ board = true, panels = true } = {}) {
    if (board) draw(view, st);
    revalidate(st);
    if (panels) {
      renderRail(railEl, st, false);
      renderInspector(mainEl, st, hover, false);
      renderDiagnostics(diagEl, st);
    }
    showMarks(view, st);
    zoomEl.textContent = Math.round(st.zoom * 100) + "%";
    root.querySelector('[data-act="undo"]').disabled = !st.undo.length;
    root.querySelector('[data-act="redo"]').disabled = !st.redo.length;
    root.querySelector('[data-act="recover"]').style.display = readAll().__previous ? "" : "none";
    markLibrary();
    autosave();
  }

  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal("__working", st.board), 400);
  }

  /* --- editing ------------------------------------------------------------- */

  /* Every edit to something already down goes through here, so undo, live
   * validation and the status line behave the same as laying a new thing. */
  function change(fn) {
    const token = mark(st);
    const res = fn();
    if (!res || !res.ok) { say(res ? res.why : "Nothing to change.", "bad"); return; }
    if (keep(st, token)) { say(res.note || "", ""); refresh(); }
    else if (res.note) say(res.note, "");
  }

  function selected() {
    return st.sel ? describe(st.board, st.sel.c, st.sel.r) : null;
  }

  function edit(h, isErase) {
    if (!h || !h.inside) return;
    const tool = toolByKey(st.hand.tool);
    if (tool && tool.kind === "select") {
      st.sel = { c: h.c, r: h.r };
      refresh({ board: false });
      const d = describe(st.board, h.c, h.r);
      say(d ? d.element + " at (" + h.c + "," + h.r + ")" +
        (d.arms ? ", " + d.arms : "") + ". Change it on the right." : "", "");
      return;
    }
    if (!tool || tool.kind === "pan") return;
    const token = mark(st);
    const opts = { face: h.face === null ? undefined : h.face, erase: isErase };
    /* the wall tool latches: the first edge of a stroke decides whether the
     * stroke lays or clears, so retracing a run never inverts it */
    if (painting && (tool.kind === "wall" || tool.kind === "ramp") && painting.wallSet) opts.set = painting.wallSet;
    const res = isErase ? erase(st.board, st.hand, h.c, h.r, opts)
                        : apply(st.board, st.hand, h.c, h.r, opts);
    if (!res.ok) { say(res.why, "bad"); showGhost(view, st, h, true); return; }
    if (painting && (tool.kind === "wall" || tool.kind === "ramp") && !painting.wallSet && res.changed) {
      painting.wallSet = /^No (wall|ramp)/.test(res.note || "") ? "none" : tool.kind;
    }
    if (keep(st, token)) {
      say(res.note || "", "");
      refresh();
    } else if (res.note) say(res.note, "");
  }

  /* --- pointer -------------------------------------------------------------- */

  view.viewport.addEventListener("pointerdown", ev => {
    view.viewport.setPointerCapture(ev.pointerId);
    const tool = toolByKey(st.hand.tool);
    /* The right button pans when dragged and erases when clicked. It used to
     * erase on drag too; a right-drag pan is worth more than a right-drag
     * erase, and a click still erases the square under it, so nothing is lost
     * but the erasing sweep. Whether it was a drag is settled on release. */
    const wantsPan = tool.kind === "pan" || ev.button === 1 || ev.button === 2 || ev.shiftKey;
    if (wantsPan) {
      panning = { x: ev.clientX, y: ev.clientY, ox: st.offX, oy: st.offY, moved: false,
                  eraseOnClick: ev.button === 2 && tool.kind !== "pan" ? hit(view, st, ev) : null };
      return;
    }
    const h = hit(view, st, ev);
    painting = { erase: false, stroke: newStroke(isEdgeTool()), last: h, wallSet: null };
    if (painting.stroke.wants(h)) edit(h, painting.erase);
  });

  view.viewport.addEventListener("pointermove", ev => {
    if (panning) {
      if (Math.abs(ev.clientX - panning.x) > 3 || Math.abs(ev.clientY - panning.y) > 3) panning.moved = true;
      if (!panning.moved) return;
      st.offX = panning.ox + (ev.clientX - panning.x);
      st.offY = panning.oy + (ev.clientY - panning.y);
      layout(view, st);
      showMarks(view, st);
      return;
    }
    const h = hit(view, st, ev);
    const changed = !hover || !h || hover.c !== h.c || hover.r !== h.r || hover.face !== h.face;
    hover = h;
    st.edgeTool = isEdgeTool();
    showGhost(view, st, h, false);
    if (changed) {
      /* not while somebody is typing in it: replacing the panel's HTML takes
       * the caret with it, and the pointer drifting over a new square is not a
       * reason to lose a half-typed name */
      if (!mainEl.contains(document.activeElement)) renderInspector(mainEl, st, hover, false);
      if (h && h.inside) say("(" + h.c + "," + h.r + ")" +
        (h.face !== null && st.edgeTool ? " " + dirLetter(h.face) + " edge" : ""), "");
    }
    /* Once per square per stroke. A drag still lays a run, but a tool that
     * TOGGLES -- which is all of the site tools -- is not flipped back and
     * forth by the pointer events a held button emits without moving.
     *
     * EVERY SQUARE THE POINTER CROSSED, not only the ones it was sampled in. A
     * fast drag reports squares with gaps between them, and a belt run with a
     * gap in it is a rules error; so the squares between the last sample and
     * this one are painted first, in order, with the edge carried along only
     * when both samples agree on it. */
    if (painting && h) {
      const last = painting.last;
      if (last && (Math.abs(h.c - last.c) > 1 || Math.abs(h.r - last.r) > 1 ||
                   (h.c !== last.c && h.r !== last.r))) {
        const face = last.face === h.face ? h.face : null;
        for (const [c, r] of cellsBetween(last.c, last.r, h.c, h.r)) {
          if (c === h.c && r === h.r) break;
          const mid = { c, r, face, inside: inBoard(st.board, c, r) };
          if (painting.stroke.wants(mid)) edit(mid, painting.erase);
        }
      }
      painting.last = h;
      if (painting.stroke.wants(h)) edit(h, painting.erase);
    }
  });

  const endPointer = () => { painting = null; panning = null; };
  view.viewport.addEventListener("pointerup", () => {
    /* a right button released where it was pressed is a click: erase there */
    if (panning && !panning.moved && panning.eraseOnClick) {
      const h = panning.eraseOnClick, stroke = newStroke(isEdgeTool());
      if (stroke.wants(h)) edit(h, true);
    }
    endPointer();
  });
  view.viewport.addEventListener("pointercancel", endPointer);
  view.viewport.addEventListener("pointerleave", () => {
    endPointer(); hover = null; showGhost(view, st, null);
  });
  view.viewport.addEventListener("contextmenu", ev => ev.preventDefault());

  view.viewport.addEventListener("wheel", ev => {
    ev.preventDefault();
    const r = view.viewport.getBoundingClientRect();
    zoomAbout(view, st, ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top);
    zoomEl.textContent = Math.round(st.zoom * 100) + "%";
    showMarks(view, st);
  }, { passive: false });

  function isEdgeTool() {
    const t = toolByKey(st.hand.tool);
    return !!t && (t.kind === "wall" || t.kind === "ramp" || (t.kind === "device" && t.device === "door"));
  }

  /* --- keyboard -------------------------------------------------------------- */

  window.addEventListener("keydown", ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();

    if (ev.ctrlKey || ev.metaKey) {
      if (k === "z") { ev.preventDefault(); (ev.shiftKey ? redo : undo)(st) && refresh(); return; }
      if (k === "y") { ev.preventDefault(); redo(st) && refresh(); return; }
      if (st.photo && !st.photo.solo) { st.photo.solo = true; layout(view, st); }
      return;
    }
    if (k === "escape") { st.hand.tool = "select"; st.sel = null; refresh({ board: false }); return; }
    if ((k === "delete" || k === "backspace") && st.sel) {
      change(() => erase(st.board, st.hand, st.sel.c, st.sel.r));
      return;
    }
    if (k === "`") { toggleMode(); return; }
    /* Z and C zoom, as + and - do: a hand on WASD reaches them without moving */
    if (k === "+" || k === "=" || k === "z") { zoomAbout(view, st, 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); return; }
    if (k === "-" || k === "c") { zoomAbout(view, st, 1 / 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); return; }
    if (k === "0") { fit(view, st); refresh({ board: false }); return; }

    /* WASD pan the view (issue #3); the arrow keys face the thing in hand, QE
     * turn it a quarter. WASDQE stay reserved, so no tool may claim them --
     * check-app asserts that. */
    const pan = { w: [0, 1], s: [0, -1], a: [1, 0], d: [-1, 0] }[k];
    if (pan) { st.offX += pan[0] * PAN_STEP; st.offY += pan[1] * PAN_STEP; layout(view, st); showMarks(view, st); ev.preventDefault(); return; }
    const face = { ArrowUp: N, ArrowRight: E, ArrowDown: S, ArrowLeft: W }[ev.key];
    if (face !== undefined) { st.hand.dir = face; refresh({ board: false }); ev.preventDefault(); return; }
    if (k === "q") { st.hand.dir = rot(st.hand.dir, -1); refresh({ board: false }); return; }
    if (k === "e") { st.hand.dir = rot(st.hand.dir, 1); refresh({ board: false }); return; }

    if (/^[1-9]$/.test(k)) {
      const t = toolByKey(st.hand.tool);
      if (t && t.kind === "ground" && t.arg === "digit") st.hand.digit = +k;
      else if (t && t.kind === "ground" && t.arg === "pair") st.hand.pair = +k;
      else if (t && t.kind === "level") st.hand.level = +k;
      refresh({ board: false });
      return;
    }
    /* any other letter picks up the tool that prints it */
    const tools = toolsFor(false).filter(t => t.hot === k);
    if (tools.length) {
      const i = tools.findIndex(t => t.key === st.hand.tool);
      st.hand.tool = tools[(i + 1) % tools.length].key;
      refresh({ board: false });
    }
  });

  window.addEventListener("keyup", ev => {
    if (st.photo && st.photo.solo && !ev.ctrlKey && !ev.metaKey) {
      st.photo.solo = false; layout(view, st);
    }
  });
  /* Cmd-Tab away while holding Ctrl never sends the keyup; the board would
   * stay hidden until the next Ctrl press */
  window.addEventListener("blur", () => {
    if (st.photo && st.photo.solo) { st.photo.solo = false; layout(view, st); }
  });

  /* --- clicks in the panels --------------------------------------------------- */

  function setMode(mode) {
    if (st.mode === mode) return;
    st.mode = mode;
    refresh();
    say(mode === "markup"
      ? "Markup: thin line work, meant to be read over a photograph of the printed board."
      : "Board art, as the board is played.", "");
  }
  function toggleMode() { setMode(st.mode === "art" ? "markup" : "art"); }

  root.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (b && b.dataset.tool) {
      st.hand.tool = b.dataset.tool;
      st.sel = null;                  // picking a tool means laying, not fixing
      refresh({ board: false });
      return;
    }
    if (b) {
      const d = b.dataset;
      /* THE HAND. These only ever appear when nothing is selected. */
      if (d.dir !== undefined) { st.hand.dir = +d.dir; refresh({ board: false }); return; }
      if (d.digit !== undefined) { st.hand.digit = +d.digit; refresh({ board: false }); return; }
      if (d.pair !== undefined) { st.hand.pair = +d.pair; refresh({ board: false }); return; }
      if (d.arms !== undefined) { st.hand.arms = d.arms; refresh({ board: false }); return; }
      if (d.level !== undefined) { st.hand.level = +d.level; refresh({ board: false }); return; }
      if (d.damage !== undefined) { st.hand.damage = +d.damage; refresh({ board: false }); return; }
      if (d.reach !== undefined) { st.hand.reach = +d.reach; refresh({ board: false }); return; }
      if (d.reg !== undefined) { toggleReg(+d.reg); return; }
      if (d.openBoard) { openFromLibrary(d.openBoard); return; }

      /* THE SELECTED SQUARE, on the same rows. Every one of these writes to the
       * board at once -- the drawing is the feedback, so there is no apply step
       * and nothing to confirm. */
      if (d.seldir !== undefined) { change(() => faceTo(+d.seldir)); return; }
      if (d.selarms !== undefined) { change(() => setArms(st.board, st.sel.c, st.sel.r, d.selarms)); return; }
      if (d.seldigit !== undefined) { change(() => setArg(String(d.seldigit))); return; }
      if (d.selpair !== undefined) { change(() => setArg(String(d.selpair))); return; }
      if (d.sellevel !== undefined) { change(() => setLevelHere(+d.sellevel)); return; }
      /* THE VIEW SWITCH. It was drawn from the first day of markup mode and
       * never answered here: only the backtick key reached setMode, so the two
       * buttons sat there doing nothing whenever anyone clicked them. It stands
       * apart from the branches above -- the view is not a fact about the board
       * or about the square, so it is not `change()`d and nothing is marked. */
      if (d.view !== undefined) { setMode(d.view); return; }

      if (d.metaToggle !== undefined) {
        change(() => {
          st.board[d.metaToggle] = !st.board[d.metaToggle];
          return { ok: true, changed: true,
            note: d.metaToggle + (st.board[d.metaToggle] ? " set." : " cleared.") };
        });
        return;
      }
      if (d.selsite !== undefined) {
        change(() => apply(st.board, { ...st.hand, tool: "site:" + d.selsite }, st.sel.c, st.sel.r));
        return;
      }
      if (d.devoff !== undefined) { change(() => takeOff("wall", +d.devoff)); return; }
      if (d.ceiloff !== undefined) { change(() => takeOff("ceiling", +d.ceiloff)); return; }
      if (d.flooroff !== undefined) { change(() => takeOff("floor", +d.flooroff)); return; }
      if (d.dooroff !== undefined) { change(() => takeOff("door", +d.dooroff)); return; }

      /* A placed device's rows, all on one attribute: slot, field and value.
       * Not a style choice -- `data-wd0-face` arrives here as `dataset.wd0Face`
       * because the DOM camel-cases dataset keys and eats the dashes, so a
       * handler matching the dashes never fires and the click falls through in
       * silence. */
      if (d.devrow !== undefined) {
        const m2 = /^(wd|cd|fd|dr)(\d+):([a-z]+):(-?\d+)$/.exec(d.devrow);
        if (m2) { change(() => devRow(m2[1], +m2[2], m2[3], +m2[4])); return; }
      }

      if (d.act) { act(d.act); return; }
    }
    const li = ev.target.closest("li[data-goto]");
    if (li) goTo(li.dataset.goto);
  });

  /* Set a placed element's argument character -- a bay number or a pair colour. */
  function setArg(ch) {
    const tok = st.board.cells[st.sel.r * st.board.w + st.sel.c];
    if (tok.charAt(1) === ch) return { ok: true, changed: false };
    st.board.cells[st.sel.r * st.board.w + st.sel.c] = tok.charAt(0) + ch + tok.charAt(2);
    return { ok: true, changed: true, note: "Set to " + ch + " at (" + st.sel.c + "," + st.sel.r + ")." };
  }

  function setLevelHere(n) {
    if (levelAt(st.board, st.sel.c, st.sel.r) === n) return { ok: true, changed: false };
    setLevel(st.board, st.sel.c, st.sel.r, n);
    return { ok: true, changed: true, note: "Level " + n + " at (" + st.sel.c + "," + st.sel.r + ")." };
  }

  /** One row of a placed device: its facing, a numeric field, or a register. */
  function devRow(layer, i, key, value) {
    const d = selected();
    if (!d) return { ok: false, why: "Nothing selected." };
    const dev = layer === "wd" ? d.wallDevices[i]
      : layer === "dr" ? (d.doorDevices[i] && d.doorDevices[i].dev)
      : layer === "fd" ? d.floor[i]
      : d.ceiling[i];
    if (!dev) return { ok: false, why: "Nothing there." };
    if (key === "face") {
      if (dev.face === +value) return { ok: true, changed: false };
      return turnHere(st.board, st.sel.c, st.sel.r, (+value - dev.face + 4) % 4, dev);
    }
    if (key === "reg") return setDeviceRegs(dev, flip(dev.regs, +value));
    return setDeviceField(dev, key, +value);
  }

  /* Turning a placed element to an absolute facing rather than by quarters:
   * the panel shows four compass buttons, and clicking one should mean that
   * direction rather than "one more turn from wherever it is". */
  function faceTo(want) {
    const d = selected();
    if (!d || !d.dir) return { ok: false, why: "That square has no facing." };
    const now = "^>v<".indexOf(d.dir);
    if (now < 0) return { ok: false, why: "That square's facing is unreadable." };
    if (now === want) return { ok: true, changed: false };
    return turnHere(st.board, st.sel.c, st.sel.r, (want - now + 4) % 4);
  }

  function devAt(spec) {
    const [i] = spec.split(":");
    const d = selected();
    return d ? d.wallDevices[+i] : null;
  }
  function devFace(spec) {
    const [i, want] = spec.split(":");
    const d = selected();
    const dev = d && d.wallDevices[+i];
    if (!dev) return { ok: false, why: "Nothing there to turn." };
    if (dev.face === +want) return { ok: true, changed: false };
    return turnHere(st.board, st.sel.c, st.sel.r, (+want - dev.face + 4) % 4, dev);
  }
  function devField(spec) {
    const [i, key, v] = spec.split(":");
    const dev = devAt(i);
    return dev ? setDeviceField(dev, key, +v) : { ok: false, why: "Nothing there." };
  }
  function devReg(spec) {
    const [i, n] = spec.split(":");
    const dev = devAt(i);
    if (!dev) return { ok: false, why: "Nothing there." };
    return setDeviceRegs(dev, flip(dev.regs, +n));
  }
  function ceilReg(spec) {
    const [i, n] = spec.split(":");
    const d = selected();
    const dev = d && d.ceiling[+i];
    if (!dev) return { ok: false, why: "Nothing there." };
    return setDeviceRegs(dev, flip(dev.regs, +n));
  }
  /* An absent list means EVERY register, so a device with no list showing all
   * five lit is telling the truth -- and clicking one of them has to mean
   * "these four", not "this one". */
  function flip(regs, n) {
    const cur = regs && regs.length ? [...regs] : [1, 2, 3, 4, 5];
    const i = cur.indexOf(n);
    if (i >= 0) cur.splice(i, 1); else cur.push(n);
    return cur.sort((a, b) => a - b);
  }
  function takeOff(layer, i) {
    const d = selected();
    if (!d) return { ok: false, why: "Nothing selected." };
    if (layer === "door") {
      const door = d.doorDevices[i];
      if (!door) return { ok: false, why: "Nothing there." };
      return takeOffDoor(st.board, door.dev, "Swing door taken off the " + dirLetter(door.dir) + " side of (" + st.sel.c + "," + st.sel.r + ").");
    }
    const dev = layer === "wall" ? d.wallDevices[i] : layer === "floor" ? d.floor[i] : d.ceiling[i];
    if (!dev) return { ok: false, why: "Nothing there." };
    const list = layer === "wall" ? st.board.wallDevices : layer === "floor" ? st.board.floorDevices : st.board.ceilingDevices;
    list.splice(list.indexOf(dev), 1);
    return { ok: true, changed: true, note: layer === "wall" ? "Taken off. Its wall is still there." : "Taken off." };
  }

  function toggleReg(n) {
    const t = toolByKey(st.hand.tool);
    if (!t || !t.device) return;
    const cur = st.hand.regs[t.device] ? [...st.hand.regs[t.device]] : [];
    const i = cur.indexOf(n);
    if (i >= 0) cur.splice(i, 1); else cur.push(n);
    cur.sort((a, b2) => a - b2);
    st.hand.regs[t.device] = cur.length === 5 ? [] : cur;
    refresh({ board: false });
  }

  function goTo(where) {
    const m = /^\((\d+),(\d+)\)$/.exec(where);
    if (!m) return;
    const r = view.viewport.getBoundingClientRect();
    const size = 100 * st.zoom;
    st.offX = r.width / 2 - (+m[1] + 0.5) * size;
    st.offY = r.height / 2 - (+m[2] + 0.5) * size;
    layout(view, st);
    showMarks(view, st);
    say("Showing (" + m[1] + "," + m[2] + ")", "");
  }

  root.addEventListener("change", ev => {
    const t = ev.target;
    if (t.tagName !== "SELECT" || !t.dataset.meta) return;
    const token = mark(st);
    st.board[t.dataset.meta] = t.value;
    keep(st, token);
    refresh({ board: false });
  });

  root.addEventListener("input", ev => {
    const t = ev.target;
    if (t.dataset.meta) {
      const v = t.value.trim();
      if (t.tagName === "SELECT") return;          // handled on `change`
      if (t.dataset.meta === "id") { if (/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) st.board.id = v; }
      else if (t.dataset.meta === "notes") st.board.notes = t.value;
      else st.board.name = t.value;
      st.dirty = true;
      revalidate(st);
      renderDiagnostics(diagEl, st);
      autosave();
      return;
    }
    if (t.dataset.ph && st.photo) {
      st.photo[t.dataset.ph] = +t.value;
      layout(view, st);
    }
  });

  /* --- actions ---------------------------------------------------------------- */

  function act(name) {
    switch (name) {
      case "undo": undo(st) && refresh(); break;
      case "redo": redo(st) && refresh(); break;
      case "fit": fit(view, st); refresh({ board: false }); break;
      case "zoomin": zoomAbout(view, st, 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); break;
      case "zoomout": zoomAbout(view, st, 1 / 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); break;
      case "photo": fileIn.click(); break;
      case "photo-off": dropPhoto(); break;
      case "export": showText("Board JSON", boardJSON(st.board), st.board.id + ".json"); break;
      case "picture": showText("The board as a picture", toPicture(st.board)); break;
      case "import": jsonIn.click(); break;
      case "new": newBoard(); break;
      case "recover": recoverPrevious(); break;
      case "deselect": st.sel = null; refresh({ board: false }); break;
      case "course-save": saveAsCourse(); break;
      case "course-play": if (saveAsCourse()) location.href = new URL("../index.html#course=" + st.courseId, location.href).href; break;
    }
  }

  /* --- a whole course, edited as one board --------------------------------------
   * Opened by #edit=<id> from the course workshop's "Edit as one board". The
   * board is the course; saving writes the board back into the course library
   * entry beside a one-stamp course document that keeps the flags and seats,
   * after the course validator has passed it, so the game can read it. */
  function openCourse(id) {
    const saved = readCourses()[id];
    if (!saved || !saved.board) { say("No flattened course called " + id + " in the library.", "bad"); return; }
    const d = sink();
    const b = boardFromDocument(JSON.parse(saved.board), d);
    const errors = d.items.filter(x => x.severity === "error");
    if (!b || errors.length) { say("The course " + id + " did not read cleanly: " + (errors[0] || {}).message, "bad"); return; }
    st.courseId = id;
    st.courseDoc = saved.doc;
    replaceBoard(b);
    fit(view, st);
    const box = root.querySelector(".insp-course");
    box.style.display = "";
    box.querySelector(".course-link").href = "#course=" + id;
    say("The whole course " + (saved.doc.name || id) + " as one board. Save to course library when it is right, or Play.", "");
  }
  function saveAsCourse() {
    if (!st.courseId) return false;
    if (st.diagnostics.some(x => x.severity === "error")) { say("The board still has problems. Fix them and it will save.", "bad"); return false; }
    const doc = JSON.parse(JSON.stringify(st.courseDoc));
    doc.id = st.courseId; doc.name = st.board.name || doc.name;
    doc.stamps = [{ role: "course", board: st.board.id, rot: 0, at: [0, 0] }];
    const lib = new Map([[st.board.id, st.board]]);
    const d = sink();
    const c = courseFromDocument(JSON.parse(JSON.stringify(doc)), d, st.courseId);
    if (c) validateCourse(c, lib, d);
    const bad = d.items.find(x => x.severity === "error");
    if (bad) { say("As a course this does not build: " + bad.message, "bad"); return false; }
    if (!saveCourse(st.courseId, doc, { board: boardJSON(st.board) })) { say("Could not save -- this browser is not keeping local storage.", "bad"); return false; }
    say("Saved " + st.courseId + " to the course library.", "ok");
    return true;
  }

  function dropPhoto() {
    if (st.photo) URL.revokeObjectURL(st.photo.url);
    st.photo = null;
    photoCtl.style.display = "none";
    layout(view, st);
    say("Reference photograph removed.", "");
  }

  /* THE PHOTOGRAPH NEVER LEAVES THE MACHINE. createObjectURL, nothing uploaded,
   * and it is not part of the board -- export writes tile data and nothing
   * else. This repo holds original drawings and transcribed layouts; a scan of
   * somebody's printed board is not one of those. */
  fileIn.addEventListener("change", () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    if (st.photo) URL.revokeObjectURL(st.photo.url);
    st.photo = { url: URL.createObjectURL(f), opacity: 0.6, scale: 1, dx: 0, dy: 0, solo: false };
    photoCtl.style.display = "";
    st.mode = "markup";
    refresh();
    say("Photograph loaded. It stays on this machine and is never exported.", "");
    fileIn.value = "";
  });

  jsonIn.addEventListener("change", () => {
    const f = jsonIn.files && jsonIn.files[0];
    if (!f) return;
    f.text().then(text => {
      let board = null, why = "", problems = [];
      try {
        const doc = JSON.parse(text);
        const d = sink();
        board = boardFromDocument(doc, d);
        /* THE PARSER REPAIRS AS IT READS -- a short row is padded with floor, a
         * lattice of the wrong height is left blank, an unknown key is dropped
         * -- and reports each repair. Reading the report only when the board
         * came back null meant every one of those loaded as a plausible board
         * with the damage hidden, and was then autosaved. A document with
         * errors in it is refused, and the errors are the message. */
        problems = d.items.filter(x => x.severity === "error");
        if (!board) why = d.items.map(x => x.message).join(" ");
      } catch (e) {
        /* a pasted ASCII picture is still an accepted import */
        try { board = fromPicture(text, { id: "imported", name: "Imported" }); }
        catch (e2) { why = e2.message; }
      }
      if (!board) { say("Could not read that: " + why, "bad"); return; }
      if (problems.length) {
        showText("That file has " + problems.length + " problem" + (problems.length === 1 ? "" : "s") +
          ", so it was not loaded",
          problems.map(x => (x.pointer ? x.pointer + ": " : "") + x.message).join("\n"));
        say("Not loaded: " + problems[0].message, "bad");
        return;
      }
      replaceBoard(board);
      fit(view, st);
      say("Loaded " + board.name + ".", "ok");
    });
    jsonIn.value = "";
  });

  function showText(title, text, filename) {
    modal.innerHTML = "<h3>" + esc(title) + "</h3>" +
      '<textarea readonly style="width:min(80vw,760px);height:60vh;background:#11141d;color:#c8d4ea;' +
      'border:1px solid #1e2331;border-radius:3px;font:12px/1.45 ui-monospace,monospace;padding:8px">' +
      esc(text) + "</textarea>" +
      '<div class="row" style="margin-top:8px"><button data-act="copy">Copy</button>' +
      (filename ? '<button data-act="download">Download ' + esc(filename) + "</button>" : "") +
      '<button data-act="close">Close</button></div>';
    modal.showModal();
    modal.onclick = ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "copy") {
        modal.querySelector("textarea").select();
        try { document.execCommand("copy"); } catch (e) { /* the button is a convenience */ }
      }
      /* A FILE, because that is what data/ takes: drop it in data/boards/ and
       * run build-index.js, and the board is shipped. */
      if (b.dataset.act === "download") {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      modal.close();
    };
  }

  /* THE BOARD THAT WAS OPEN IS KEPT. New, Import and a shipped-board load all
   * replace the working board, and the working board is what the autosave
   * holds -- so each of them used to overwrite a transcription in progress
   * with no way back. The outgoing board goes to a second slot and the
   * inspector offers it back until something replaces it in turn. */
  function replaceBoard(board) {
    if (st.board) saveLocal("__previous", st.board);
    st.board = board;
    st.undo.length = 0; st.redo.length = 0;
    st.sel = null;
    refresh();
  }

  function recoverPrevious() {
    const saved = readAll().__previous;
    if (!saved || !saved.json) { say("Nothing to recover.", "bad"); return; }
    const d = sink();
    let b = null;
    try { b = boardFromDocument(JSON.parse(saved.json), d); } catch (e) { b = null; }
    if (!b) { say("The previous board could not be read back.", "bad"); return; }
    const outgoing = st.board;
    st.board = b;
    st.undo.length = 0; st.redo.length = 0; st.sel = null;
    /* swap, so recovering twice gets you back where you were */
    saveLocal("__previous", outgoing);
    refresh(); fit(view, st);
    say("Recovered " + b.name + ". The board you were on is now the previous one.", "ok");
  }

  /* A dialog, not window.prompt: prompt() is blocked outright in some embedded
   * browsers, where the button silently did nothing, and two prompts could not
   * ask for a name or a set anyway. */
  function newBoard() {
    modal.innerHTML = "<h3>New board</h3>" +
      '<div class="row"><label>Name</label><input data-nb="name" type="text" value="Untitled"></div>' +
      '<div class="row"><label>Id</label><input data-nb="id" type="text" value="untitled"></div>' +
      '<div class="row"><label>Across</label><input data-nb="w" type="number" min="1" max="40" value="12">' +
      '<label>Down</label><input data-nb="h" type="number" min="1" max="40" value="12"></div>' +
      '<div class="row"><span class="none">The board that is open now stays recoverable from the inspector.</span></div>' +
      '<div class="row" style="margin-top:8px"><button data-act="ok">Create</button><button data-act="close">Cancel</button></div>';
    modal.showModal();
    modal.onclick = ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "ok") {
        const v = k => modal.querySelector('[data-nb="' + k + '"]').value;
        const w = +v("w"), h = +v("h"), id = v("id").trim(), name = v("name").trim();
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) { say("A board needs whole positive dimensions.", "bad"); return; }
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) { say("An id is letters, digits and underscores, starting with a letter.", "bad"); return; }
        modal.close();
        replaceBoard(blankBoard({ id, name: name || "Untitled", w, h }));
        fit(view, st);
        say("A new " + w + " by " + h + " board.", "");
        return;
      }
      modal.close();
    };
  }

  /* --- boot ------------------------------------------------------------------- */

  window.addEventListener("resize", () => { layout(view, st); showMarks(view, st); });
  drawLibrary();
  refresh();
  fit(view, st);
  say("Pick a tool, click the board. Arrows face it, Q E turn it, W A S D or right-drag pan, Z C or the wheel zoom, ` swaps the drawing.", "");

  /* a small handle for the browser console and for tests */
  window.__ED = { st, view, refresh, act, edit, say, replaceBoard, openCourse, fit: () => fit(view, st), hitAt: ev => hit(view, st, ev),
    /** The board library has arrived (or failed, as []). Draw it. */
    setLibrary(rows) { libRows = rows; drawLibrary(); } };
  return window.__ED;
}

function startingBoard() {
  /* whatever was being worked on last, if it still reads */
  const all = readAll();
  const saved = all.__working;
  if (saved && saved.json) {
    try {
      const d = sink();
      const b = boardFromDocument(JSON.parse(saved.json), d);
      if (b && !d.items.some(x => x.severity === "error")) return b;
    } catch (e) { /* fall through to a blank one */ }
  }
  return blankBoard({ id: "untitled", name: "Untitled", w: 12, h: 12 });
}

/* ROUTING. `#course` opens the course workshop, `#course=longHaul` opens that
 * one, `#board=island` opens a shipped board. Anything else is the board
 * workshop on whatever was being worked on last. */
const host = document.querySelector("[data-pumarally-editor]");
if (host) {
  const hash = location.hash.replace(/^#/, "");
  const course = /^course(?:=([A-Za-z0-9_]+))?$/.exec(hash);
  const board = /^board=([A-Za-z0-9_]+)$/.exec(hash);
  const flat = /^edit=([A-Za-z0-9_]+)$/.exec(hash);
  if (course) {
    import("./coursemode.js").then(m => m.mountCourse(host, course[1]));
  } else {
    const ed = mount(host);
    loadLibrary(ed);
    if (board) loadShipped(ed, board[1]);
    else if (flat) ed.openCourse(flat[1]);
  }
  window.addEventListener("hashchange", () => location.reload());
}

/* The shipped boards, fetched AFTER the editor is up rather than before it.
 * This is the workshop's landing page; blocking it on nineteen requests to
 * draw a list nobody has looked at yet would be paying for the library with
 * the thing the library is attached to. The panel says it is loading, and
 * fills in. A failure leaves the editor working and says so in the panel. */
async function loadLibrary(ed) {
  try {
    const index = await (await fetch("./data/index.json")).json();
    const rows = await Promise.all((index.boards || []).map(async row => {
      try {
        const d = sink();
        const b = boardFromDocument(await (await fetch("./data/boards/" + row.id + ".json")).json(), d, row.id);
        if (!b || d.items.some(x => x.severity === "error")) return null;
        return { id: row.id, name: b.name, w: b.w, h: b.h, unverified: !!b.unverified, board: b };
      } catch (e) { return null; }
    }));
    ed.setLibrary(rows.filter(Boolean));
  } catch (e) {
    ed.setLibrary([]);
  }
}

async function loadShipped(ed, id) {
  try {
    const res = await fetch("./data/boards/" + id + ".json");
    if (!res.ok) { ed.say("No shipped board called " + id + ".", "bad"); return; }
    const d = sink();
    const b = boardFromDocument(await res.json(), d, id);
    const errors = d.items.filter(x => x.severity === "error");
    if (!b || errors.length) {
      ed.say("The shipped board " + id + " did not read cleanly: " + (errors[0] || d.items[0] || {}).message, "bad");
      return;
    }
    ed.replaceBoard(b);
    ed.fit();
  } catch (e) { ed.say("Could not load " + id + ": " + e.message, "bad"); }
}
