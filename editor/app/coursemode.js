/* The course workshop: the same viewport, a different thing being edited.
 *
 * What you are editing here is a LIST OF PLACEMENTS, not a grid. The grid is
 * assembled from the boards on every change, so a board corrected later
 * corrects every course it appears in -- which is the whole reason one board
 * serves many courses, and how it works in the box.
 */

import { injectCSS } from "./style.js";
import { makeView, draw, layout, fit, zoomAbout, hit, cellRect } from "./view.js";
import {
  assemble, stampFootprint, stampDims, dockStamp, dockBox, courseBounds,
  suggestFlags, usableFlagSpots
} from "../lib/course.js";
import {
  newCourse, place, turn, remove, moveStamp, stampAt, nearestSnap, normalise,
  addFlag, removeFlag, moveFlag, flagAt, toDocument, flagWouldFit
} from "./compose.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { boardFromDocument } from "../lib/board.js";
import { sink } from "../validate/diagnostic.js";
import { boardSVG } from "../render/svg.js";
import { renderDiagnostics } from "./panels.js";
import { saveCourse, readCourses, removeCourse } from "./state.js";
import { esc } from "../render/theme.js";
import { rotateBoard } from "../lib/rotate.js";

const SHELL = `
<div class="ed">
  <nav class="rail" aria-label="Boards"></nav>
  <div class="stage">
    <div class="viewport">
      <div class="world">
        <img class="photo" alt="" style="display:none">
        <div class="board"></div>
        <div class="overlay"></div>
      </div>
      <div class="ghost" style="display:none"></div>
    </div>
  </div>
  <aside class="insp" aria-label="Inspector">
    <div class="insp-main"></div>
    <div class="insp-diag"></div>
  </aside>
  <footer class="status">
    <span class="st-msg"></span>
    <span class="grow"></span>
    <span class="sep"></span>
    <button data-act="undo" title="Ctrl-Z">Undo</button>
    <span class="sep"></span>
    <button data-act="zoomout">&minus;</button>
    <span class="st-zoom"></span>
    <button data-act="zoomin">+</button>
    <button data-act="fit">Fit</button>
  </footer>
</div>
<dialog class="modal"></dialog>
`;

/* The autosave slot and the undo depth. Board mode autosaves every edit; the
 * course workshop saved only on the button, and every route out of it -- Open,
 * the shipped picker, a hash change -- reloads the page, so a course being
 * built was gone unless it had been saved by name. */
const WORKING = "__working";
const UNDO_DEPTH = 60;

const EXTRA_CSS = `
.overlay{position:absolute;left:0;top:0;pointer-events:none}
.stampbox{position:absolute;border:1px dashed rgba(200,212,234,.28);border-radius:2px}
.stampbox.sel{border:2px solid var(--hot);background:rgba(53,224,255,.06)}
.stampbox.dock{border-color:rgba(57,255,136,.45)}
.stamplabel{position:absolute;font-size:11px;color:var(--dim);background:rgba(5,7,15,.75);
  padding:0 4px;border-radius:2px;white-space:nowrap}
.flag{position:absolute;display:grid;place-items:center;border-radius:50%;
  background:#ff5f56;color:#0b0d14;font-weight:700;border:2px solid #0b0d14;
  box-shadow:0 0 0 2px rgba(255,95,86,.35)}
.palette{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.pb{border:1px solid var(--line);border-radius:3px;padding:3px;cursor:pointer;background:none;
  color:var(--ink);font:inherit;text-align:center}
.pb:hover{border-color:var(--dim)}
.pb[aria-pressed=true]{border-color:var(--hot);background:#0d2028}
.pb svg{width:100%;height:auto;display:block;border-radius:2px}
.pb span{display:block;font-size:10px;color:var(--dim);margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flaglist{list-style:none;margin:0;padding:0}
.flaglist li{display:flex;gap:5px;align-items:center;margin-bottom:3px;font-size:12px}
.flaglist .n{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;
  background:#ff5f56;color:#0b0d14;font-weight:700;font-size:11px;flex:0 0 20px}
`;

export async function mountCourse(root, wanted) {
  injectCSS(document);
  const extra = document.createElement("style");
  extra.textContent = EXTRA_CSS;
  document.head.appendChild(extra);
  root.innerHTML = SHELL;

  const view = makeView(root);
  const overlay = root.querySelector(".overlay");
  const railEl = root.querySelector(".rail");
  const mainEl = root.querySelector(".insp-main");
  const diagEl = root.querySelector(".insp-diag");
  const msgEl = root.querySelector(".st-msg");
  const zoomEl = root.querySelector(".st-zoom");

  const library = new Map();
  let index = { boards: [], courses: [] };
  try {
    index = await (await fetch("./data/index.json")).json();
    await Promise.all(index.boards.map(async row => {
      const d = sink();
      const b = boardFromDocument(await (await fetch("./data/boards/" + row.id + ".json")).json(), d, row.id);
      if (b) library.set(row.id, b);
    }));
  } catch (e) {
    msgEl.textContent = "Could not load the board library: " + e.message;
    msgEl.className = "st-msg bad";
    return null;
  }

  const st = {
    course: newCourse("untitled"),
    mode: "art",
    hand: null,          // a board id waiting to be placed
    handRot: 0,
    sel: -1,             // a placed stamp
    flagMode: false,
    zoom: 1, offX: 0, offY: 0,
    board: null,         // the assembled grid, for the shared view helpers
    photo: null,
    diagnostics: []
  };

  if (wanted && wanted !== "new") {
    const saved = readCourses()[wanted];
    try {
      const doc = saved ? saved.doc
        : await (await fetch("./data/courses/" + wanted + ".json")).json();
      const d = sink();
      const c = courseFromDocument(doc, d, wanted);
      if (c) st.course = c;
    } catch (e) { /* a new course then */ }
  } else if (!wanted) {
    /* plain #course: whatever was being built last, if it still reads */
    const saved = readCourses()[WORKING];
    if (saved && saved.doc) {
      const d = sink();
      const c = courseFromDocument(saved.doc, d);
      if (c && !d.items.some(x => x.severity === "error")) st.course = c;
    }
  }

  /* --- undo ---------------------------------------------------------------- */
  const history = [];
  function snap() {
    history.push(JSON.stringify(toDocument(st.course)));
    if (history.length > UNDO_DEPTH) history.shift();
  }
  function undo() {
    if (!history.length) { say("Nothing to undo.", ""); return; }
    const d = sink();
    const c = courseFromDocument(JSON.parse(history.pop()), d, st.course.id);
    if (!c) return;
    st.course = c; st.sel = -1; st.hand = null;
    refresh();
    say("Undone.", "");
  }

  function say(text, kind) {
    msgEl.textContent = text || "";
    msgEl.className = "st-msg " + (kind || "");
  }

  let asm = null;
  function refresh({ keepView = true } = {}) {
    normalise(st.course, library);
    asm = assemble(st.course, library);
    st.board = asm.grid;

    const d = sink();
    const doc = toDocument(st.course);
    const parsed = courseFromDocument(JSON.parse(JSON.stringify(doc)), d, st.course.id);
    if (parsed) validateCourse(parsed, library, d);
    st.diagnostics = d.items;
    saveCourse(WORKING, doc);

    draw(view, st);
    drawOverlay();
    renderRail();
    renderInspector();
    renderDiagnostics(diagEl, st);
    zoomEl.textContent = Math.round(st.zoom * 100) + "%";
    root.querySelector('[data-act="undo"]').disabled = !history.length;
    if (!keepView) fit(view, st);
  }

  function drawOverlay() {
    let html = "";
    const b = asm.bounds;
    st.course.stamps.forEach((s, i) => {
      const src = library.get(s.board);
      if (!src) return;
      const [w, h] = stampDims(src, s.rot);
      const x = (s.at[0] - b.x0) * 100, y = (s.at[1] - b.y0) * 100;
      html += '<div class="stampbox' + (i === st.sel ? " sel" : "") + (s.role === "dock" ? " dock" : "") +
        '" style="left:' + x + "px;top:" + y + "px;width:" + w * 100 + "px;height:" + h * 100 + 'px"></div>';
      html += '<div class="stamplabel" style="left:' + (x + 6) + "px;top:" + (y + 6) + 'px;font-size:26px">' +
        esc(src.name) + (s.rot ? " ↻" + (s.rot * 90) + "°" : "") + (s.role === "dock" ? " • start" : "") + "</div>";
    });
    st.course.flags.forEach(([c, r], i) => {
      html += '<div class="flag" style="left:' + (c * 100 + 18) + "px;top:" + (r * 100 + 18) +
        'px;width:64px;height:64px;font-size:38px">' + (i + 1) + "</div>";
    });
    overlay.style.width = (st.board.w * 100) + "px";
    overlay.style.height = (st.board.h * 100) + "px";
    overlay.innerHTML = html;
  }

  function renderRail() {
    let html = "<h3>Flags</h3>";
    html += '<button class="tool" data-flagmode aria-pressed="' + st.flagMode + '">' +
      '<span class="sw"><svg viewBox="0 0 100 100"><path d="M 32 88 L 32 14 L 74 28 L 32 44" fill="#ff5f56" stroke="#ff5f56" stroke-width="6" stroke-linejoin="round"/></svg></span>' +
      "<span>Place flags</span><span class='hot'>F</span></button>";
    html += "<h3>Boards</h3><div class='palette'>";
    for (const row of index.boards) {
      const b = library.get(row.id);
      if (!b) continue;
      /* the docking bay is offered under Start, not here: a course has one and
       * it is not interchangeable with a floor */
      if (isDock(b)) continue;
      html += paletteButton(row, b);
    }
    html += "</div><h3>Start</h3><div class='palette'>";
    for (const row of index.boards) {
      const b = library.get(row.id);
      if (b && isDock(b)) html += paletteButton(row, b, "dock");
    }
    html += "</div>";
    railEl.innerHTML = html;
  }

  function isDock(b) {
    return b.cells.some(t => t.charAt(0) === "s");
  }

  function paletteButton(row, b, role) {
    const rotated = st.handRot ? rotateBoard(b, st.handRot) : b;
    return '<button class="pb" data-place="' + esc(row.id) + '" data-role="' + (role || "board") +
      '" aria-pressed="' + (st.hand === row.id) + '" title="' + esc(row.name) + " " + b.w + "x" + b.h + '">' +
      boardSVG(rotated, { mode: "art", background: true }) +
      "<span>" + esc(row.name) + (b.unverified ? " &middot; unverified" : "") + "</span></button>";
  }

  function renderInspector() {
    const dock = dockStamp(st.course);
    let html = "<h3>Course</h3>";
    html += '<div class="row"><label>Name</label><input type="text" data-cmeta="name" value="' + esc(st.course.name) + '"></div>';
    html += '<div class="row"><label>Id</label><input type="text" data-cmeta="id" value="' + esc(st.course.id) + '"></div>';
    html += '<div class="row"><span class="pill">' + st.course.stamps.length + " board(s)</span>" +
      '<span class="pill">' + st.board.w + " x " + st.board.h + "</span>" +
      '<span class="pill">' + (dock ? "start block" : "no start block") + "</span></div>";
    html += '<div class="row"><label>View</label>' +
      [["art", "Board art"], ["markup", "Markup"]].map(([k, label]) =>
        '<button data-view="' + k + '" aria-pressed="' + (st.mode === k) + '">' + label + "</button>").join("") +
      '<span class="hot">`</span></div>';
    html += '<div class="row"><label>Seats</label>' +
      [2, 4, 6, 8].map(n => '<button data-seats="' + n + '" aria-pressed="' + (st.course.maxPlayers === n) + '">' + n + "</button>").join("") +
      "</div>";

    if (st.hand) {
      const b = library.get(st.hand);
      html += "<h3>In hand</h3>";
      html += '<div class="row"><span class="pill">' + esc(b.name) + "</span>" +
        '<span class="pill">' + b.w + " x " + b.h + "</span></div>";
      html += '<div class="row"><label>Turn</label>' +
        [0, 1, 2, 3].map(q => '<button data-handrot="' + q + '" aria-pressed="' + (st.handRot === q) + '">' + (q * 90) + "&deg;</button>").join("") +
        "</div>";
      html += '<div class="row"><span class="none">Click where it should go. It snaps against what is already down.</span></div>';
    }

    if (st.sel >= 0 && st.course.stamps[st.sel]) {
      const s = st.course.stamps[st.sel];
      const src = library.get(s.board);
      html += "<h3>Selected board</h3>";
      html += '<div class="row"><span class="pill">' + esc(src.name) + "</span>" +
        '<span class="pill">at ' + s.at[0] + "," + s.at[1] + "</span></div>";
      html += '<div class="row"><button data-act="turn-left">&#8630; Turn</button>' +
        '<button data-act="turn-right">Turn &#8631;</button>' +
        '<button data-act="drop">Take off</button></div>';
    }

    /* WHAT THE BOARDS MARK, and what this race uses. A board says where a flag
     * MAY go; a course says where the flags ARE. Premade courses set them by
     * hand and so can you -- the marks are what the computer chooses from when
     * you ask it to offer a set, so an offer cannot put a flag somewhere the
     * board's author would not have. */
    const spots = asm ? usableFlagSpots(st.course, library, asm) : [];
    html += "<h3>Flags, in race order</h3>";
    html += '<div class="row"><span class="none">' +
      (spots.length
        ? spots.length + " square" + (spots.length === 1 ? " is" : "s are") + " marked as possible flag locations."
        : "No board here marks a flag location, so there is nothing to choose from.") +
      "</span></div>";
    html += '<div class="row"><label>Suggest</label>' +
      [3, 4, 5].map(n => '<button data-suggest="' + n + '"' + (spots.length ? "" : " disabled") +
        '>' + n + "</button>").join("") +
      '<button data-suggest="each"' + (spots.length ? "" : " disabled") +
      '" title="one from each board that marks any">one per board</button></div>';
    if (!st.course.flags.length) html += '<p class="none">None yet. Pick the flag tool and click a floor square, or ask for a suggestion.</p>';
    else {
      html += '<ul class="flaglist">';
      st.course.flags.forEach(([c, r], i) => {
        html += '<li><span class="n">' + (i + 1) + "</span><span>(" + c + "," + r + ")</span>" +
          '<span class="grow"></span>' +
          '<button data-flagup="' + i + '" title="Earlier"' + (i === 0 ? " disabled" : "") + ">&uarr;</button>" +
          '<button data-flagdown="' + i + '" title="Later"' + (i === st.course.flags.length - 1 ? " disabled" : "") + ">&darr;</button>" +
          '<button data-flagoff="' + i + '" title="Take off">&times;</button></li>';
      });
      html += "</ul>";
    }

    html += "<h3>This course</h3>";
    const broken = st.diagnostics.some(x => x.severity === "error");
    html += '<div class="row"><button data-act="save"' + (broken ? " disabled" : "") +
      '>Save to library</button><button data-act="export">Export JSON</button></div>';
    if (broken) {
      html += '<div class="row"><span class="none bad">Fix the problems below before saving. ' +
        'A course that will not build is one the wizard would fall over on.</span></div>';
    }
    html += '<div class="row"><button data-act="clear">Start again</button></div>';

    const mine = readCourses();
    const ids = Object.keys(mine).filter(k => k.charAt(0) !== "_").sort();
    html += "<h3>Library</h3>";
    if (!ids.length) html += '<p class="none">Nothing saved yet.</p>';
    else {
      html += '<ul class="flaglist">';
      for (const id of ids) {
        html += "<li><span>" + esc(mine[id].doc.name || id) + "</span><span class='grow'></span>" +
          '<button data-open="' + esc(id) + '">Open</button>' +
          '<button data-forget="' + esc(id) + '" title="Delete">&times;</button></li>';
      }
      html += "</ul>";
    }

    html += "<h3>Shipped courses</h3>";
    html += '<div class="row"><select data-shipped><option value="">Open one&hellip;</option>' +
      index.courses.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") +
      "</select></div>";
    html += '<div class="row"><a href="./" style="color:var(--hot)">&larr; Board workshop</a></div>';
    mainEl.innerHTML = html;
  }

  /* --- pointer ----------------------------------------------------------- */

  let panning = null;
  view.viewport.addEventListener("pointerdown", ev => {
    view.viewport.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || ev.shiftKey) {
      panning = { x: ev.clientX, y: ev.clientY, ox: st.offX, oy: st.offY };
      return;
    }
    const h = hit(view, st, ev);
    if (!h) return;
    const abs = { c: h.c + asm.bounds.x0, r: h.r + asm.bounds.y0 };

    if (st.hand) {
      const role = st.handRole || "board";
      const target = nearestSnap(st.course, library, st.hand, st.handRot, abs.c, abs.r);
      const at = target ? target.at : [abs.c, abs.r];
      snap();
      const i = place(st.course, library, st.hand, st.handRot, at, role);
      if (i < 0) { history.pop(); say("That would sit on top of a board already down.", "bad"); return; }
      st.sel = i;
      st.hand = null;
      /* the first board decides the scale: an empty course is a 1x1 grid
       * fitted at maximum zoom, and keeping that view put one corner of a
       * 12x12 on screen at 530% */
      refresh({ keepView: st.course.stamps.length > 1 });
      say(library.get(st.course.stamps[i].board).name + " laid at " + at[0] + "," + at[1] + ".", "");
      return;
    }

    if (st.flagMode) {
      if (ev.button === 2) {
        const i = flagAt(st.course, h.c, h.r);
        if (i >= 0) { snap(); removeFlag(st.course, i); refresh(); say("Flag " + (i + 1) + " taken off; the rest moved up.", ""); }
        return;
      }
      if (!flagWouldFit(st.board, h.c, h.r)) {
        say("A flag stands on plain floor. Nothing else can be reliably stood on.", "bad");
        return;
      }
      snap();
      if (addFlag(st.course, h.c, h.r)) {
        refresh();
        say("Flag " + st.course.flags.length + " at (" + h.c + "," + h.r + ").", "");
      } else { history.pop(); say("There is already a flag there.", "bad"); }
      return;
    }

    st.sel = stampAt(st.course, library, abs.c, abs.r);
    refresh();
    if (st.sel >= 0) {
      const s = st.course.stamps[st.sel];
      say(library.get(s.board).name + " selected. Q and E turn it, Delete takes it off.", "");
    }
  });

  view.viewport.addEventListener("pointermove", ev => {
    if (!panning) return;
    st.offX = panning.ox + (ev.clientX - panning.x);
    st.offY = panning.oy + (ev.clientY - panning.y);
    layout(view, st);
  });
  const end = () => { panning = null; };
  view.viewport.addEventListener("pointerup", end);
  view.viewport.addEventListener("pointercancel", end);
  view.viewport.addEventListener("contextmenu", ev => ev.preventDefault());
  view.viewport.addEventListener("wheel", ev => {
    ev.preventDefault();
    const r = view.viewport.getBoundingClientRect();
    zoomAbout(view, st, ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top);
    zoomEl.textContent = Math.round(st.zoom * 100) + "%";
  }, { passive: false });

  /* --- clicks and keys ----------------------------------------------------- */

  root.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) {
      const li = ev.target.closest("li[data-goto]");
      if (li) goTo(li.dataset.goto);
      return;
    }
    const d = b.dataset;
    if (d.place !== undefined) {
      st.hand = st.hand === d.place ? null : d.place;
      st.handRole = d.role;
      st.flagMode = false;
      st.sel = -1;
      refresh();
      return;
    }
    if (d.flagmode !== undefined) { st.flagMode = !st.flagMode; st.hand = null; refresh(); return; }
    if (d.handrot !== undefined) { st.handRot = +d.handrot; refresh(); return; }
    if (d.view !== undefined) { st.mode = d.view; refresh(); return; }
    if (d.suggest !== undefined) {
      const opts = d.suggest === "each" ? { perBoard: true } : { count: +d.suggest };
      const offer = suggestFlags(st.course, library, { ...opts, asm });
      if (!offer.length) { say("Nothing here is marked as a flag location.", "bad"); return; }
      snap();
      st.course.flags = offer;
      refresh();
      /* One per board means one from each board that MARKS any, so the count
       * can come back lower than the number of boards down -- and when it does,
       * saying which boards had nothing to offer is the actionable half. */
      const boards = st.course.stamps.filter(x => x.role === "board");
      const marked = new Set(usableFlagSpots(st.course, library, asm).map(x => x.board));
      const bare = boards.filter(x => !marked.has(x.board));
      say("Offered " + offer.length + " flag" + (offer.length === 1 ? "" : "s") +
        ", chosen from what the boards mark." +
        (bare.length
          ? " " + bare.map(x => library.get(x.board).name).join(" and ") +
            " mark" + (bare.length === 1 ? "s" : "") + " none, so nothing was taken from " +
            (bare.length === 1 ? "it" : "them") + "."
          : "") +
        " Move or replace any of them.", "ok");
      return;
    }
    if (d.seats !== undefined) { snap(); st.course.maxPlayers = +d.seats; refresh(); return; }
    if (d.flagup !== undefined) { snap(); moveFlag(st.course, +d.flagup, +d.flagup - 1); refresh(); return; }
    if (d.flagdown !== undefined) { snap(); moveFlag(st.course, +d.flagdown, +d.flagdown + 1); refresh(); return; }
    if (d.flagoff !== undefined) { snap(); removeFlag(st.course, +d.flagoff); refresh(); return; }
    if (d.open !== undefined) { location.hash = "#course=" + d.open; location.reload(); return; }
    if (d.forget !== undefined) {
      removeCourse(d.forget);
      refresh();
      say("Taken out of the library.", "");
      return;
    }
    if (d.act) act(d.act);
  });

  root.addEventListener("change", ev => {
    const sel = ev.target;
    if (sel.dataset.shipped !== undefined && sel.value) { location.hash = "#course=" + sel.value; location.reload(); }
  });

  root.addEventListener("input", ev => {
    const t = ev.target;
    if (!t.dataset.cmeta) return;
    if (t.dataset.cmeta === "id") {
      if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t.value.trim())) st.course.id = t.value.trim();
    } else st.course.name = t.value;
  });

  window.addEventListener("keydown", ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === "z") { ev.preventDefault(); undo(); return; }
    if (ev.ctrlKey || ev.metaKey) return;
    if (k === "f") { st.flagMode = !st.flagMode; st.hand = null; refresh(); return; }
    if (k === "escape") { st.hand = null; st.sel = -1; st.flagMode = false; refresh(); return; }
    if (k === "q" && st.sel >= 0) { act("turn-left"); return; }
    if (k === "e" && st.sel >= 0) { act("turn-right"); return; }
    if (k === "q" && st.hand) { st.handRot = (st.handRot + 3) % 4; refresh(); return; }
    if (k === "e" && st.hand) { st.handRot = (st.handRot + 1) % 4; refresh(); return; }
    if ((k === "delete" || k === "backspace") && st.sel >= 0) { act("drop"); return; }
    if (k === "`") { st.mode = st.mode === "art" ? "markup" : "art"; refresh(); return; }
    if (k === "0") { fit(view, st); zoomEl.textContent = Math.round(st.zoom * 100) + "%"; return; }
  });

  function goTo(where) {
    const m = /^\((\d+),(\d+)\)$/.exec(where);
    if (!m) return;
    const r = view.viewport.getBoundingClientRect();
    const size = 100 * st.zoom;
    st.offX = r.width / 2 - (+m[1] + 0.5) * size;
    st.offY = r.height / 2 - (+m[2] + 0.5) * size;
    layout(view, st);
  }

  function act(name) {
    switch (name) {
      case "fit": fit(view, st); zoomEl.textContent = Math.round(st.zoom * 100) + "%"; break;
      case "zoomin": zoomAbout(view, st, 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); zoomEl.textContent = Math.round(st.zoom * 100) + "%"; break;
      case "zoomout": zoomAbout(view, st, 1 / 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); zoomEl.textContent = Math.round(st.zoom * 100) + "%"; break;
      case "undo": undo(); break;
      case "turn-left": snap(); if (turn(st.course, library, st.sel, -1)) refresh(); else { history.pop(); say("Turning it there would run into another board.", "bad"); } break;
      case "turn-right": snap(); if (turn(st.course, library, st.sel, 1)) refresh(); else { history.pop(); say("Turning it there would run into another board.", "bad"); } break;
      case "drop": snap(); remove(st.course, library, st.sel); st.sel = -1; refresh(); say("Board taken off.", ""); break;
      case "clear": snap(); st.course = newCourse(st.course.id); st.sel = -1; st.hand = null; refresh({ keepView: false }); break;
      case "export": showText("Course JSON", JSON.stringify(toDocument(st.course), null, 2) + "\n", st.course.id + ".json"); break;
      case "save": {
        /* A COURSE THAT WILL NOT BUILD IS NEVER SAVED. The library is read back
         * without a validator in front of it in places, and a stored course
         * that throws on assembly is one somebody has to find by hand. */
        if (st.diagnostics.some(x => x.severity === "error")) {
          say("This course still has problems. Fix them and it will save.", "bad");
          break;
        }
        if (saveCourse(st.course.id, toDocument(st.course))) {
          refresh();
          say("Saved as " + st.course.id + ". Open it again from the library below.", "ok");
        } else say("Could not save -- this browser is not keeping local storage.", "bad");
        break;
      }
    }
  }

  function showText(title, text, filename) {
    const modal = root.querySelector(".modal");
    modal.innerHTML = "<h3>" + esc(title) + "</h3>" +
      '<textarea readonly style="width:min(80vw,760px);height:60vh;background:#11141d;color:#c8d4ea;' +
      'border:1px solid #1e2331;border-radius:3px;font:12px/1.45 ui-monospace,monospace;padding:8px">' +
      esc(text) + "</textarea>" +
      '<div class="row" style="margin-top:8px">' +
      (filename ? '<button data-download>Download ' + esc(filename) + "</button>" : "") +
      '<button data-close>Close</button></div>';
    modal.showModal();
    modal.onclick = ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      /* a file is what data/courses/ takes; drop it in and run build-index.js */
      if (b.dataset.download !== undefined) {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      if (b.dataset.close !== undefined) modal.close();
    };
  }

  window.addEventListener("resize", () => layout(view, st));
  refresh({ keepView: false });
  say("Pick a board, click where it goes. F for flags, Q E turn, ` swaps the drawing.", "");
  window.__EDC = { st, view, refresh, act, library, undo };
  return window.__EDC;
}
