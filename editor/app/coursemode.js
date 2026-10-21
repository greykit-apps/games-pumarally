/* The course workshop: the same viewport, a different thing being edited.
 *
 * What you are editing here is a LIST OF PLACEMENTS, not a grid. The grid is
 * assembled from the boards on every change, so a board corrected later
 * corrects every course it appears in -- which is the whole reason one board
 * serves many courses, and how it works in the box.
 */

import { injectCSS } from "./style.js";
import { makeView, draw, layout, fit, zoomAbout, bindPinch, hit, cellRect } from "./view.js";
import {
  assemble, stampFootprint, stampDims, dockStamp, dockBox, courseBounds,
  suggestFlags, usableFlagSpots, startRefusal, STARTS_WANTED
} from "../lib/course.js";
import {
  newCourse, place, turn, remove, moveStamp, stampAt, normalise, overlapsAny,
  addFlag, removeFlag, moveFlag, flagAt, toDocument, flagWouldFit,
  addReboot, removeReboot, rebootAt, turnReboot,
  addStart, removeStart, moveStart, startAt
} from "./compose.js";
import { docksOf } from "../lib/board.js";
import { courseFromDocument, validateCourse } from "../validate/course.js";
import { boardFromDocument } from "../lib/board.js";
import { sink } from "../validate/diagnostic.js";
import { boardSVG } from "../render/svg.js";
import { renderDiagnostics } from "./panels.js";
import { saveCourse, readCourses, removeCourse } from "./state.js";
import { esc } from "../render/theme.js";
import { rotateBoard } from "../lib/rotate.js";
import { boardJSON } from "../lib/canon.js";
import { cloneBoard } from "../lib/board.js";

/** A saved course that was flattened carries its one board along; put it in the library so the course reads. */
function adoptBoard(saved, library) {
  if (!saved || !saved.board) return;
  try {
    const d = sink();
    const b = boardFromDocument(JSON.parse(saved.board), d);
    if (b && !d.items.some(x => x.severity === "error")) library.set(b.id, b);
  } catch (e) { /* the course will report the missing board */ }
}

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
      <div class="empty" hidden>Drag a board off the rail onto the floor, or click one and click here.<br>Then the docking bay under it, or eight starting squares on it, and the flags.</div>
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

/* Pixels per cell for the palette thumbnails. A board button is this many pixels
 * wide per column of the board (plus 8px of padding and border, since the box is
 * border-box), so every board in the rail is drawn at the same scale: a 12x12 is
 * twice the width of a 6x6. Kept in step with the 216px rail in EXTRA_CSS -- the
 * widest board (12 cells) is 12*PALETTE_PC+8 = 164px, inside the ~200px the rail
 * gives after its padding. */
const PALETTE_PC = 13;

const EXTRA_CSS = `
.overlay{position:absolute;left:0;top:0;pointer-events:none}
.empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(60%,420px);text-align:center;
  color:var(--dim);font-size:13px;line-height:1.6;pointer-events:none}
.stampbox{position:absolute;border:1px dashed rgba(200,212,234,.28);border-radius:2px}
.stampbox.sel{border:2px solid var(--hot);background:rgba(53,224,255,.06)}
.stampbox.dock{border-color:rgba(57,255,136,.45)}
.stamplabel{position:absolute;font-size:11px;color:var(--dim);background:rgba(5,7,15,.75);
  padding:0 4px;border-radius:2px;white-space:nowrap}
.flag{position:absolute;display:grid;place-items:center;border-radius:50%;
  background:#ff5f56;color:#0b0d14;font-weight:700;border:2px solid #0b0d14;
  box-shadow:0 0 0 2px rgba(255,95,86,.35)}
.reboot{position:absolute;display:grid;place-items:center;border-radius:12px;
  background:rgba(57,255,136,.85);color:#0b0d14;border:2px solid #0b0d14;box-shadow:0 0 0 2px rgba(57,255,136,.35)}
.reboot svg{width:70%;height:70%}
/* a starting square the course placed itself: the bay is painted into the art; the ring says it is the course's, not a board's */
.start{position:absolute;border:3px dashed rgba(57,255,136,.8);border-radius:50%;box-shadow:0 0 0 2px rgba(5,7,15,.6)}
.startlist .n{background:#39ff88}
.save{width:100%;font-size:14px;font-weight:700;letter-spacing:.04em;padding:10px 12px;margin:4px 0;
  background:var(--hot);color:#05070f;border:1px solid var(--hot);border-radius:4px}
.save:hover:not(:disabled){background:#7deeff;border-color:#7deeff}
.save:disabled{background:none;color:var(--dim);border-style:dashed}
/* The board rail is wider in course mode than in the board workshop: its palette
 * shows whole boards, not tool icons, and a 12x12 wants the room. Every board is
 * drawn at ONE scale -- PALETTE_PC pixels a cell -- so a 6x6 shows at half the
 * size of a 12x12 instead of being blown up to match it. The buttons are sized
 * to their board and flow with wrap, and the rail never scrolls sideways. */
.ed{grid-template-columns:216px minmax(0,1fr) 260px}
@media (max-width:900px){ .ed{grid-template-columns:216px minmax(0,1fr)} }
.rail{overflow-x:hidden}
.palette{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
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
.dragbox{position:absolute;opacity:.75;pointer-events:none;outline:3px solid var(--hot);outline-offset:-3px;background:#05070f}
.dragbox.bad{outline-color:#ff5f56;opacity:.55}
.dragbox svg{width:100%;height:100%;display:block}
.stamptools{position:absolute;display:flex;gap:6px;pointer-events:auto}
.stamptools button{font-size:30px;line-height:1;padding:6px 14px;min-height:0;background:rgba(5,7,15,.85);border:2px solid var(--hot);color:var(--hot);border-radius:6px;cursor:pointer}
.stamptools button:hover{background:#0d2028}
.pb{touch-action:none;user-select:none}
.dragging .viewport{cursor:grabbing}
.dragging .pb{cursor:grabbing}
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
    startMode: false,    // placing the course's own starting squares
    rebootMode: false,   // placing the 2016 Reboot Tokens
    tokenFace: 0,        // the arrow on the next token placed
    zoom: 1, offX: 0, offY: 0,
    board: null,         // the assembled grid, for the shared view helpers
    photo: null,
    diagnostics: []
  };

  if (wanted && wanted !== "new") {
    const saved = readCourses()[wanted];
    adoptBoard(saved, library);
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
    adoptBoard(saved, library);
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
    renderDiagnostics(diagEl, st, "course");
    zoomEl.textContent = Math.round(st.zoom * 100) + "%";
    root.querySelector('[data-act="undo"]').disabled = !history.length;
    if (!keepView) fit(view, st);
  }

  function drawOverlay() {
    let html = "";
    const b = asm.bounds;
    /* an empty course says what to do, in the viewport rather than the world, so it is not scaled with the one empty square */
    root.querySelector(".empty").hidden = st.course.stamps.length > 0;
    st.course.stamps.forEach((s, i) => {
      const src = library.get(s.board);
      if (!src) return;
      const [w, h] = stampDims(src, s.rot);
      const x = (s.at[0] - b.x0) * 100, y = (s.at[1] - b.y0) * 100;
      html += '<div class="stampbox' + (i === st.sel ? " sel" : "") + (s.role === "dock" ? " dock" : "") +
        '" style="left:' + x + "px;top:" + y + "px;width:" + w * 100 + "px;height:" + h * 100 + 'px"></div>';
      /* the label sits on the first square the board still shows; a board wholly under another gets none, and its dashed box is what remains of it */
      let lc = -1, lr = -1;
      for (let r = 0; r < h && lc < 0; r++) for (let c = 0; c < w; c++) {
        if (asm.from[(s.at[1] - b.y0 + r) * asm.grid.w + (s.at[0] - b.x0 + c)] === i) { lc = c; lr = r; break; }
      }
      if (lc >= 0) html += '<div class="stamplabel" style="left:' + (x + lc * 100 + 6) + "px;top:" + (y + lr * 100 + 6) + 'px;font-size:26px">' +
        esc(src.name) + (s.rot ? " ↻" + (s.rot * 90) + "°" : "") + (s.role === "dock" ? " • start" : s.role === "course" ? " • whole course" : "") + "</div>";
      /* the selected board carries its own buttons: turn either way, take off */
      if (i === st.sel) {
        html += '<div class="stamptools" style="left:' + (x + 8) + "px;top:" + (y + h * 100 - 62) + 'px">' +
          '<button data-act="turn-left" title="Turn anticlockwise (Q)">&#8630;</button>' +
          '<button data-act="turn-right" title="Turn clockwise (E)">&#8631;</button>' +
          '<button data-act="drop" title="Take off (Delete)">&times;</button></div>';
      }
    });
    st.course.flags.forEach(([c, r], i) => {
      html += '<div class="flag" style="left:' + (c * 100 + 18) + "px;top:" + (r * 100 + 18) +
        'px;width:64px;height:64px;font-size:38px">' + (i + 1) + "</div>";
    });
    (st.course.starts || []).forEach(([c, r]) => {
      html += '<div class="start" style="left:' + (c * 100 + 10) + "px;top:" + (r * 100 + 10) + 'px;width:80px;height:80px"></div>';
    });
    /* the reboot tokens: a green tile with the arrow a moved-aside robot goes along */
    (st.course.reboots || []).forEach(([c, r, face]) => {
      html += '<div class="reboot" style="left:' + (c * 100 + 14) + "px;top:" + (r * 100 + 14) + 'px;width:72px;height:72px">' +
        '<svg viewBox="0 0 100 100" style="transform:rotate(' + (face * 90) + 'deg)"><path d="M50 82V22M30 40L50 22L70 40" fill="none" stroke="#0b0d14" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    });
    overlay.style.width = (st.board.w * 100) + "px";
    overlay.style.height = (st.board.h * 100) + "px";
    overlay.innerHTML = html;
  }

  function renderRail() {
    /* The docking bay FIRST. It used to sit under "Start" at the foot of a
     * rail fifty boards long, where nobody scrolling for a floor ever found
     * it -- and a course without one cannot be saved. A course has one dock
     * and it is not interchangeable with a floor, so it is not in the palette. */
    let html = "<h3>Docking bay</h3><div class='palette'>";
    for (const row of index.boards) {
      const b = library.get(row.id);
      if (b && isDock(b)) html += paletteButton(row, b, "dock");
    }
    html += "</div>";
    html += "<h3>Flags</h3>";
    html += '<button class="tool" data-flagmode aria-pressed="' + st.flagMode + '">' +
      '<span class="sw"><svg viewBox="0 0 100 100"><path d="M 32 88 L 32 14 L 74 28 L 32 44" fill="#ff5f56" stroke="#ff5f56" stroke-width="6" stroke-linejoin="round"/></svg></span>' +
      "<span>Place flags</span><span class='hot'>F</span></button>";
    html += "<h3>Starting squares</h3>";
    html += '<button class="tool" data-startmode aria-pressed="' + st.startMode + '" title="Where the robots start, one square at a time, anywhere on the floor: a race needs ' + STARTS_WANTED + '. The docking bay board above is the quick way to all eight; these go round the course. Click a floor square to place the next one; right-click one to take it off.">' +
      '<span class="sw"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#39ff88" stroke-width="8"/><text x="50" y="62" text-anchor="middle" font-size="36" font-weight="700" fill="#39ff88" font-family="ui-monospace,monospace">1</text></svg></span>' +
      "<span>Place starts</span><span class='hot'>B</span></button>";
    html += "<h3>Reboot tokens</h3>";
    html += '<button class="tool" data-rebootmode aria-pressed="' + st.rebootMode + '" title="The 2016 game\'s Reboot Tokens, one per board: where a robot that fell returns. Click to place one facing the arrow chosen below; click a token to turn it; right-click to take it off.">' +
      '<span class="sw"><svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="14" fill="#39ff88"/><path d="M50 78V26M32 42L50 26L68 42" fill="none" stroke="#0b0d14" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      "<span>Place tokens</span><span class='hot'>R</span></button>";
    html += "<h3>Boards</h3><div class='palette'>";
    /* Full-size boards first, the smaller ones grouped together below. Sort by
     * cell count, descending; the sort is stable, so boards of one size keep
     * their library order. The docking bay is offered above, not here. */
    const boards = index.boards
      .map(row => ({ row, b: library.get(row.id) }))
      .filter(({ b }) => b && b.origin !== "course" && !isDock(b))
      .sort((a, z) => (z.b.w * z.b.h) - (a.b.w * a.b.h));
    for (const { row, b } of boards) html += paletteButton(row, b);
    html += "</div>";
    railEl.innerHTML = html;
  }

  function isDock(b) {
    return b.cells.some(t => t.charAt(0) === "s");
  }

  function paletteButton(row, b, role) {
    const rotated = st.handRot ? rotateBoard(b, st.handRot) : b;
    const width = rotated.w * PALETTE_PC + 8;   // +8: 3px padding + 1px border each side
    return '<button class="pb" style="width:' + width + 'px" data-place="' + esc(row.id) + '" data-role="' + (role || "board") +
      '" aria-pressed="' + (st.hand === row.id) + '" title="' + esc(row.name) + " " + b.w + "x" + b.h + '">' +
      boardSVG(rotated, { mode: "art", background: true }) +
      "<span>" + esc(row.name) + (b.unverified ? " &middot; unverified" : "") + "</span></button>";
  }

  function renderInspector() {
    const dock = dockStamp(st.course);
    let html = "<h3>Course</h3>";
    html += '<div class="row"><label>Name</label><input type="text" data-cmeta="name" value="' + esc(st.course.name) + '"></div>';
    html += '<div class="row"><label>Id</label><input type="text" data-cmeta="id" value="' + esc(st.course.id) + '"></div>';
    /* THE SAVE BUTTON, first and unmissable: saving is what the workshop is
     * for, and the button used to sit two screens down among the exports */
    const broken = st.diagnostics.some(x => x.severity === "error");
    html += '<div class="row"><button class="save" data-act="save"' + (broken ? " disabled" : "") +
      ' title="' + esc(broken ? "Fix the problems listed under Problems first." : "Save this course to the library. It appears on the new-game screen under Saved course.") + '">Save to library</button></div>';
    if (broken) html += '<div class="row"><span class="none bad">Fix the problems below before saving. A course that will not build is one the game cannot lay.</span></div>';
    html += '<div class="row"><span class="pill">' + st.course.stamps.length + " board(s)</span>" +
      '<span class="pill">' + st.board.w + " x " + st.board.h + "</span>" +
      '<span class="pill">' + (dock ? "docking bay board" : "no docking bay board") + "</span></div>";
    html += '<div class="row"><label>View</label>' +
      [["art", "Board art"], ["markup", "Markup"]].map(([k, label]) =>
        '<button data-view="' + k + '" aria-pressed="' + (st.mode === k) + '">' + label + "</button>").join("") +
      '<span class="hot">`</span></div>';
    html += '<div class="row"><label>Seats</label>' +
      [2, 4, 6, 8].map(n => '<button data-seats="' + n + '" aria-pressed="' + (st.course.maxPlayers === n) + '">' + n + "</button>").join("") +
      "</div>";

    if (st.rebootMode) {
      html += "<h3>Reboot tokens</h3>";
      html += '<div class="row"><label>Arrow</label>' +
        [0, 1, 2, 3].map(q => '<button data-tokenface="' + q + '" aria-pressed="' + (st.tokenFace === q) + '">' + ["N", "E", "S", "W"][q] + "</button>").join("") +
        '<span class="hot">Q E</span></div>';
      html += '<div class="row"><span class="none">One per board, none on the docking bay, on plain floor. The arrow is where a robot standing on the token is moved when somebody reboots onto it.</span></div>';
      html += '<div class="row"><label>Reboot draws</label>' +
        [2, 3].map(n => '<button data-rebootdamage="' + n + '" aria-pressed="' + ((st.course.rebootDamage || 2) === n) + '">' + n + "</button>").join("") +
        '<span class="none">damage cards (Cry Havoc: 3)</span></div>';
    }

    if (st.hand) {
      const b = library.get(st.hand);
      html += "<h3>In hand</h3>";
      html += '<div class="row"><span class="pill">' + esc(b.name) + "</span>" +
        '<span class="pill">' + b.w + " x " + b.h + "</span></div>";
      html += '<div class="row"><label>Turn</label>' +
        [0, 1, 2, 3].map(q => '<button data-handrot="' + q + '" aria-pressed="' + (st.handRot === q) + '">' + (q * 90) + "&deg;</button>").join("") +
        "</div>";
      html += '<div class="row"><span class="none">Move over the floor and click where it should go; it snaps to the squares. Or drag a board straight off the rail.</span></div>';
    }

    if (st.sel >= 0 && st.course.stamps[st.sel]) {
      const s = st.course.stamps[st.sel];
      const src = library.get(s.board);
      html += "<h3>Selected board</h3>";
      html += '<div class="row"><span class="pill">' + esc(src.name) + "</span>" +
        '<span class="pill">at ' + s.at[0] + "," + s.at[1] + "</span>" +
        (under(st.sel) ? '<span class="pill">over ' + esc(under(st.sel)) + "</span>" : "") + "</div>";
      if (under(st.sel) && st.sel < st.course.stamps.length - 1) {
        html += '<div class="row"><span class="none">A later board lies on this one where they overlap. Drag it to lay it again on top.</span></div>';
      }
      html += '<div class="row"><button data-act="turn-left">&#8630; Turn</button>' +
        '<button data-act="turn-right">Turn &#8631;</button>' +
        '<button data-act="drop">Take off</button></div>';
    }

    /* WHERE THE ROBOTS START. The boards' printed bays and the course's own
     * squares make one set of eight; the printed ones are counted, the placed
     * ones are listed, since only those can be changed here. */
    const printed = asm ? docksOf(asm.grid).length - (st.course.starts || []).length : 0;
    const placed = (st.course.starts || []).length;
    html += "<h3>Starting squares</h3>";
    html += '<div class="row"><span class="pill' + (printed + placed === STARTS_WANTED ? "" : " bad") + '">' + (printed + placed) + " of " + STARTS_WANTED + "</span>" +
      '<span class="none">' + printed + " on the boards" + (placed ? ", " + placed + " placed" : "") + ".</span></div>";
    if (printed + placed < STARTS_WANTED) {
      html += '<div class="row"><span class="none">A race needs ' + STARTS_WANTED + ". Lay the docking bay board for all eight at once, or pick the start tool (B) and click floor squares for the rest, in bay order.</span></div>";
    }
    if (placed) {
      html += '<ul class="flaglist startlist">';
      st.course.starts.forEach(([c, r], i) => {
        html += '<li><span class="n">' + (printed + i + 1) + "</span><span>(" + c + "," + r + ")</span>" +
          '<span class="grow"></span>' +
          '<button data-startup="' + i + '" title="Earlier"' + (i === 0 ? " disabled" : "") + ">&uarr;</button>" +
          '<button data-startdown="' + i + '" title="Later"' + (i === placed - 1 ? " disabled" : "") + ">&darr;</button>" +
          '<button data-startoff="' + i + '" title="Take off">&times;</button></li>';
      });
      html += "</ul>";
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
        ? spots.length + " square" + (spots.length === 1 ? " is" : "s are") + " marked as possible flag locations. The marks are the boards' suggestions, and what Suggest picks from; a flag you place yourself may stand on any floor square outside the docking bay."
        : "No board here marks a flag location, so there is nothing for Suggest to choose from; a flag you place yourself may stand on any floor square outside the docking bay.") +
      "</span></div>";
    html += '<div class="row"><label>Suggest</label>' +
      [3, 4, 5].map(n => '<button data-suggest="' + n + '"' + (spots.length ? "" : " disabled") +
        '>' + n + "</button>").join("") +
      '<button data-suggest="each"' + (spots.length ? "" : " disabled") +
      '" title="one from each board that marks any">one per board</button></div>';
    if (!st.course.flags.length) html += '<p class="none">None yet. Pick the flag tool (F) and click a floor square, in race order; right-click a flag to take it off. Or ask for a suggestion.</p>';
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
    html += '<div class="row"><button data-act="export">Export JSON</button></div>';
    /* the whole course as one board, square by square, in the board workshop */
    html += '<div class="row"><button data-act="flatten"' + (st.course.stamps.length ? "" : " disabled") +
      ' title="Lay the whole course out as one board and open it in the board workshop, to edit square by square. It comes back to this library as a single board, and it can be played from there.">Edit as one board &rarr;</button></div>';
    if (st.course.stamps.some(s => s.role === "course")) {
      html += '<div class="row"><span class="none">This course is one flattened board. Flags are set here; the floor is edited in the board workshop.</span></div>';
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
    html += '<div class="row"><a href="./" style="color:var(--hot)">&larr; Board workshop</a>' +
      '<a href="../index.html" style="color:var(--hot);margin-left:12px">New-game screen &rarr;</a></div>';
    mainEl.innerHTML = html;
  }

  /* --- pointer: boards are dragged ----------------------------------------
   *
   * A board comes off the rail, or off the floor, under the pointer and
   * follows it as a ghost snapped to the squares; it goes down where it is
   * let go, anywhere that is free -- the edges need not line up with another
   * board's, because Master Builder's small boards do not. A board picked
   * from the rail by a click rides the pointer the same way and goes down on
   * the next click. The ghost is drawn once and moved, not re-rendered. */

  let panning = null;
  let drag = null;       // { kind: "new"|"move", board, rot, role, index, grab: [c, r], at, over, el }
  let pending = null;    // a press that may become a drag once the pointer has travelled
  let suppressClick = false;

  /* course coordinates, fractional, under a pointer event; and whether it is over the floor at all */
  function worldPoint(ev) {
    const r = view.viewport.getBoundingClientRect();
    const size = 100 * st.zoom;
    return {
      fx: (ev.clientX - r.left - st.offX) / size + asm.bounds.x0,
      fy: (ev.clientY - r.top - st.offY) / size + asm.bounds.y0,
      over: ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
    };
  }
  function ghostSvg(boardId, rot) {
    const b = library.get(boardId);
    return boardSVG(rot ? rotateBoard(b, rot) : b, { mode: st.mode, background: true });
  }
  function startDrag(d) {
    drag = d;
    drag.el = document.createElement("div");
    drag.el.className = "dragbox";
    drag.el.style.display = "none";
    drag.el.innerHTML = ghostSvg(d.board, d.rot);
    overlay.appendChild(drag.el);
    root.classList.add("dragging");
  }
  function dragTo(ev) {
    if (!drag) return;
    const p = worldPoint(ev);
    const [w, h] = stampDims(library.get(drag.board), drag.rot);
    drag.at = [Math.round(p.fx - drag.grab[0]), Math.round(p.fy - drag.grab[1])];
    drag.over = p.over;
    /* the one thing a board cannot be laid on is a second docking bay board; over another board it goes on top */
    const bad = drag.role === "dock" && drag.kind === "new" && dockStamp(st.course);
    drag.bad = !!bad;
    const el = drag.el;
    el.className = "dragbox" + (bad ? " bad" : "");
    el.style.display = p.over ? "" : "none";
    el.style.left = ((drag.at[0] - asm.bounds.x0) * 100) + "px";
    el.style.top = ((drag.at[1] - asm.bounds.y0) * 100) + "px";
    el.style.width = (w * 100) + "px";
    el.style.height = (h * 100) + "px";
  }
  function turnDrag(quarters) {
    if (!drag) return;
    drag.rot = (((drag.rot + quarters) % 4) + 4) % 4;
    const [w, h] = stampDims(library.get(drag.board), drag.rot);
    drag.grab = [w / 2, h / 2];
    drag.el.innerHTML = ghostSvg(drag.board, drag.rot);
    if (drag.last) dragTo(drag.last);
    if (drag.kind === "new") st.handRot = drag.rot;
  }
  function cancelDrag() {
    if (drag && drag.el) drag.el.remove();
    drag = null; pending = null;
    root.classList.remove("dragging");
  }
  /* let go: the board goes down where the ghost is, if that is free */
  function dropDrag() {
    if (!drag) return;
    const d = drag;
    cancelDrag();
    if (!d.over || !d.at) { if (d.kind === "new") { st.hand = null; refresh(); } return; }
    if (d.bad) { say("A course has one docking bay board.", "bad"); if (d.kind === "new") { st.hand = null; refresh(); } return; }
    snap();
    if (d.kind === "new") {
      const i = place(st.course, library, d.board, d.rot, d.at, d.role);
      if (i < 0) { history.pop(); say("A course has one docking bay board.", "bad"); return; }
      st.sel = i;
      st.hand = null;
      /* the first board decides the scale: an empty course is a 1x1 grid
       * fitted at maximum zoom, and keeping that view put one corner of a
       * 12x12 on screen at 530% */
      refresh({ keepView: st.course.stamps.length > 1 });
      say(library.get(d.board).name + " laid at " + st.course.stamps[i].at[0] + "," + st.course.stamps[i].at[1] + (under(i) ? ", over " + under(i) : "") + ".", "");
    } else {
      const i = moveStamp(st.course, library, d.index, d.at);
      if (i < 0) { history.pop(); return; }
      st.sel = i;
      refresh();
      say(library.get(d.board).name + " moved to " + st.course.stamps[i].at[0] + "," + st.course.stamps[i].at[1] + (under(i) ? ", over " + under(i) : "") + ".", "");
    }
  }

  /** The names of the boards stamp `i` lies over, or "" when it covers nothing. */
  function under(i) {
    const s = st.course.stamps[i];
    const f = stampFootprint(s, library.get(s.board));
    const names = [];
    st.course.stamps.forEach((o, j) => {
      if (j === i) return;
      const g = stampFootprint(o, library.get(o.board));
      if (f.x0 <= g.x1 && g.x0 <= f.x1 && f.y0 <= g.y1 && g.y0 <= f.y1) names.push(library.get(o.board).name);
    });
    return names.join(" and ");
  }

  /* off the rail: a press that travels is a drag, a press that does not is the click below */
  railEl.addEventListener("pointerdown", ev => {
    const b = ev.target.closest("button[data-place]");
    if (!b || ev.button !== 0) return;
    b.setPointerCapture(ev.pointerId);
    pending = { kind: "new", board: b.dataset.place, role: b.dataset.role || "board", x: ev.clientX, y: ev.clientY };
  });
  railEl.addEventListener("pointermove", ev => {
    if (drag) { drag.last = ev; dragTo(ev); return; }
    if (!pending || pending.kind !== "new") return;
    if (Math.abs(ev.clientX - pending.x) + Math.abs(ev.clientY - pending.y) < 6) return;
    const [w, h] = stampDims(library.get(pending.board), st.handRot);
    startDrag({ kind: "new", board: pending.board, rot: st.handRot, role: pending.role, grab: [w / 2, h / 2], last: ev });
    pending = null;
    suppressClick = true;
    dragTo(ev);
  });
  const railUp = ev => {
    if (drag && drag.kind === "new") { drag.last = ev; dragTo(ev); dropDrag(); return; }
    pending = null;
  };
  railEl.addEventListener("pointerup", railUp);
  railEl.addEventListener("pointercancel", () => { cancelDrag(); });

  /* two fingers pinch and pan the view (view.js); what the first of them did is taken back */
  let touchDepth = 0, touchSel = -1;
  bindPinch(view, st, {
    begin() {
      cancelDrag(); panning = null;
      if (history.length > touchDepth) { while (history.length > touchDepth + 1) history.pop(); undo(); }
      st.sel = touchSel;
      refresh();
      say("", "");
    },
    changed() { zoomEl.textContent = Math.round(st.zoom * 100) + "%"; }
  });

  view.viewport.addEventListener("pointerdown", ev => {
    if (ev.target.closest(".stamptools")) return;       // the selected board's own buttons
    touchDepth = history.length; touchSel = st.sel;
    view.viewport.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || ev.button === 2 || ev.shiftKey) {
      panning = { x: ev.clientX, y: ev.clientY, ox: st.offX, oy: st.offY };
      return;
    }

    /* a board in hand rides the pointer; this click puts it down */
    if (st.hand) {
      if (!drag) {
        const [w, h] = stampDims(library.get(st.hand), st.handRot);
        startDrag({ kind: "new", board: st.hand, rot: st.handRot, role: st.handRole || "board", grab: [w / 2, h / 2], last: ev });
      }
      dragTo(ev);
      dropDrag();
      return;
    }

    const h = hit(view, st, ev);
    if (!h) return;
    const abs = { c: h.c + asm.bounds.x0, r: h.r + asm.bounds.y0 };

    if (st.rebootMode) {
      const i = rebootAt(st.course, h.c, h.r);
      if (ev.button === 2) {
        if (i >= 0) { snap(); removeReboot(st.course, i); refresh(); say("Reboot token taken off.", ""); }
        return;
      }
      if (i >= 0) { snap(); turnReboot(st.course, i, 1); refresh(); say("Token turned to face " + ["north", "east", "south", "west"][st.course.reboots[i][2]] + ".", ""); return; }
      if (!flagWouldFit(st.board, h.c, h.r)) { say("A reboot token cannot stand in a pit.", "bad"); return; }
      snap();
      if (addReboot(st.course, h.c, h.r, st.tokenFace)) { refresh(); say("Reboot token at (" + h.c + "," + h.r + ") facing " + ["north", "east", "south", "west"][st.tokenFace] + ".", ""); }
      else { history.pop(); say("There is already a token there.", "bad"); }
      return;
    }

    if (st.startMode) {
      const i = startAt(st.course, h.c, h.r);
      if (ev.button === 2) {
        if (i >= 0) { snap(); removeStart(st.course, i); refresh(); say("Starting square taken off; the rest renumbered.", ""); }
        return;
      }
      if (i >= 0) { say("There is already a starting square there. Right-click takes it off.", "bad"); return; }
      const bad = startRefusal(st.course, library, asm, h.c, h.r);
      if (bad) { say("A robot cannot start there: " + bad.why + ".", "bad"); return; }
      snap();
      addStart(st.course, h.c, h.r);
      refresh();
      const n = docksOf(asm.grid).length;
      say("Starting square " + n + " at (" + h.c + "," + h.r + ")." + (n < STARTS_WANTED ? " " + (STARTS_WANTED - n) + " more to place." : n === STARTS_WANTED ? " That is all eight." : " That is more than a race has."), n > STARTS_WANTED ? "bad" : "");
      return;
    }

    if (st.flagMode) {
      if (ev.button === 2) {
        const i = flagAt(st.course, h.c, h.r);
        if (i >= 0) { snap(); removeFlag(st.course, i); refresh(); say("Flag " + (i + 1) + " taken off; the rest moved up.", ""); }
        return;
      }
      if (!flagWouldFit(st.board, h.c, h.r)) {
        say("A flag cannot stand in a pit.", "bad");
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
      const p = worldPoint(ev);
      /* held by the square it was grabbed at, so it does not jump under the pointer */
      pending = { kind: "move", index: st.sel, board: s.board, rot: s.rot, role: s.role, grab: [p.fx - s.at[0], p.fy - s.at[1]], x: ev.clientX, y: ev.clientY };
      say(library.get(s.board).name + " selected. Drag it to move it; Q and E turn it, Delete takes it off.", "");
    }
  });

  view.viewport.addEventListener("pointermove", ev => {
    if (panning) {
      st.offX = panning.ox + (ev.clientX - panning.x);
      st.offY = panning.oy + (ev.clientY - panning.y);
      layout(view, st);
      return;
    }
    if (drag) { drag.last = ev; dragTo(ev); return; }
    if (pending && pending.kind === "move") {
      if (Math.abs(ev.clientX - pending.x) + Math.abs(ev.clientY - pending.y) < 6) return;
      startDrag({ ...pending, last: ev });
      pending = null;
      dragTo(ev);
      return;
    }
    /* a board picked from the rail by a click: the ghost follows the pointer until the next click */
    if (st.hand) {
      const [w, h] = stampDims(library.get(st.hand), st.handRot);
      startDrag({ kind: "new", board: st.hand, rot: st.handRot, role: st.handRole || "board", grab: [w / 2, h / 2], last: ev });
      dragTo(ev);
    }
  });
  const end = ev => {
    panning = null;
    if (drag && drag.kind === "move") { drag.last = ev; dragTo(ev); dropDrag(); return; }
    pending = null;
  };
  view.viewport.addEventListener("pointerup", end);
  view.viewport.addEventListener("pointercancel", () => { panning = null; if (drag && drag.kind === "move") cancelDrag(); });
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
      if (suppressClick) { suppressClick = false; return; }
      cancelDrag();
      st.hand = st.hand === d.place ? null : d.place;
      st.handRole = d.role;
      st.flagMode = false; st.rebootMode = false; st.startMode = false;
      st.sel = -1;
      refresh();
      return;
    }
    if (d.flagmode !== undefined) { st.flagMode = !st.flagMode; st.rebootMode = false; st.startMode = false; st.hand = null; refresh(); return; }
    if (d.startmode !== undefined) { st.startMode = !st.startMode; st.flagMode = false; st.rebootMode = false; st.hand = null; refresh(); return; }
    if (d.rebootmode !== undefined) { st.rebootMode = !st.rebootMode; st.flagMode = false; st.startMode = false; st.hand = null; refresh(); return; }
    if (d.startup !== undefined) { snap(); moveStart(st.course, +d.startup, +d.startup - 1); refresh(); return; }
    if (d.startdown !== undefined) { snap(); moveStart(st.course, +d.startdown, +d.startdown + 1); refresh(); return; }
    if (d.startoff !== undefined) { snap(); removeStart(st.course, +d.startoff); refresh(); return; }
    if (d.tokenface !== undefined) { st.tokenFace = +d.tokenface; refresh(); return; }
    if (d.rebootdamage !== undefined) { snap(); st.course.rebootDamage = +d.rebootdamage === 2 ? null : +d.rebootdamage; refresh(); return; }
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

  /* THE ID FOLLOWS THE NAME until it is typed by hand. Every new course used
   * to be saved as "untitled", so the second one built overwrote the first
   * unless somebody thought to edit a field that looks like bookkeeping. */
  const slug = name => {
    const words = String(name).replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    const id = words.map((w, i) => i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join("");
    return /^[A-Za-z]/.test(id) ? id : id ? "c" + id : "";
  };
  root.addEventListener("input", ev => {
    const t = ev.target;
    if (!t.dataset.cmeta) return;
    if (t.dataset.cmeta === "id") {
      st.idTyped = true;
      if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t.value.trim())) st.course.id = t.value.trim();
    } else {
      st.course.name = t.value;
      if (!st.idTyped && (st.course.id === "untitled" || st.course.id === st.idFromName)) {
        const id = slug(t.value) || "untitled";
        st.course.id = id; st.idFromName = id;
        const idEl = mainEl.querySelector('[data-cmeta="id"]');
        if (idEl) idEl.value = id;
      }
    }
  });

  window.addEventListener("keydown", ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === "z") { ev.preventDefault(); undo(); return; }
    if (ev.ctrlKey || ev.metaKey) return;
    if (k === "escape") { cancelDrag(); st.hand = null; st.sel = -1; st.flagMode = false; st.rebootMode = false; st.startMode = false; refresh(); return; }
    if (drag && k === "q") { turnDrag(-1); return; }
    if (drag && k === "e") { turnDrag(1); return; }
    if (k === "f") { cancelDrag(); st.flagMode = !st.flagMode; st.rebootMode = false; st.startMode = false; st.hand = null; refresh(); return; }
    if (k === "b") { cancelDrag(); st.startMode = !st.startMode; st.flagMode = false; st.rebootMode = false; st.hand = null; refresh(); return; }
    if (k === "r") { cancelDrag(); st.rebootMode = !st.rebootMode; st.flagMode = false; st.startMode = false; st.hand = null; refresh(); return; }
    if (st.rebootMode && k === "q") { st.tokenFace = (st.tokenFace + 3) % 4; refresh(); return; }
    if (st.rebootMode && k === "e") { st.tokenFace = (st.tokenFace + 1) % 4; refresh(); return; }
    if (k === "q" && st.sel >= 0) { act("turn-left"); return; }
    if (k === "e" && st.sel >= 0) { act("turn-right"); return; }
    if (k === "q" && st.hand) { st.handRot = (st.handRot + 3) % 4; refresh(); return; }
    if (k === "e" && st.hand) { st.handRot = (st.handRot + 1) % 4; refresh(); return; }
    if ((k === "delete" || k === "backspace") && st.sel >= 0) { act("drop"); return; }
    if (k === "`") { st.mode = st.mode === "art" ? "markup" : "art"; refresh(); return; }
    if (k === "0") { fit(view, st); zoomEl.textContent = Math.round(st.zoom * 100) + "%"; return; }
    if (k === "z" || k === "+" || k === "=") { act("zoomin"); return; }
    if (k === "c" || k === "-") { act("zoomout"); return; }
    /* WASD pan the view (issue #3) */
    const pan = { w: [0, 1], s: [0, -1], a: [1, 0], d: [-1, 0] }[k];
    if (pan) { st.offX += pan[0] * 120; st.offY += pan[1] * 120; layout(view, st); if (drag && drag.last) dragTo(drag.last); ev.preventDefault(); return; }
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
      case "flatten": flatten(); break;
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
          say("Saved as " + st.course.id + ". It is on the new-game screen under Saved course, and in the library below.", "ok");
        } else say("Could not save -- this browser is not keeping local storage.", "bad");
        break;
      }
    }
  }

  /* THE WHOLE COURSE AS ONE BOARD. The assembled grid becomes a board of
   * origin "course" (holes allowed) with the course's name and id, and the
   * course becomes a single stamp of it, keeping its flags and seats. Both
   * go into the course library under one entry -- the placement list is
   * given up, which is the point: from here the floor is edited square by
   * square -- and the board workshop opens on it. A course already flat keeps
   * its id; one built from placements gets "_edit" so the placements stay. */
  function flatten() {
    if (!st.course.stamps.length) return;
    const flat = st.course.stamps.length === 1 && st.course.stamps[0].role === "course";
    const id = flat ? st.course.id : st.course.id + "_edit";
    const board = cloneBoard(asm.grid);
    board.id = id; board.name = st.course.name || id;
    board.set = "authored"; board.origin = "course"; board.allowVoid = true; board.unverified = false;
    board.notes = flat ? board.notes : "Flattened from the course " + st.course.id + ".";
    const doc = {
      format: st.course.format, version: st.course.version, id, name: st.course.name, kind: st.course.kind,
      stamps: [{ role: "course", board: id, rot: 0, at: [0, 0] }],
      /* the placed starting squares are painted into the flattened board, so the course no longer lists them */
      flags: st.course.flags.map(f => [f[0], f[1]]),
      minPlayers: st.course.minPlayers, maxPlayers: st.course.maxPlayers
    };
    if (st.course.blurb) doc.blurb = st.course.blurb;
    if (!saveCourse(id, doc, { board: boardJSON(board) })) { say("Could not save -- this browser is not keeping local storage.", "bad"); return; }
    location.hash = "#edit=" + id;
    location.reload();
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
  say("Drag a board off the rail onto the floor, or click one and click where it goes; over another board it goes on top. Drag a laid board to move it. Q E turn, F flags, B starts, R tokens, W A S D pan, ` swaps the drawing.", "");
  window.__EDC = { st, view, refresh, act, library, undo };
  return window.__EDC;
}
