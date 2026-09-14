/* The editor: boot, layout, and every event that reaches the board.
 *
 * This is the only file that touches the DOM beyond the panels, and the only
 * one that knows about the pointer. Everything it does to a board goes through
 * `apply` / `erase` in tools.js, which are pure and tested without a browser.
 */

import { injectCSS } from "./style.js";
import { newState, mark, keep, undo, redo, revalidate, saveLocal, readAll } from "./state.js";
import { apply, erase, toolByKey, toolsFor, blankToolState, STEER_KEYS } from "./tools.js";
import { makeView, draw, layout, fit, zoomAbout, hit, showGhost, showMarks, cellRect } from "./view.js";
import { renderRail, renderInspector, renderDiagnostics } from "./panels.js";
import { blankBoard, cloneBoard, boardFromDocument } from "../lib/board.js";
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
    <h3>This board</h3>
    <div class="row">
      <button data-act="export">Export JSON</button>
      <button data-act="picture">Picture</button>
      <button data-act="import">Import&hellip;</button>
    </div>
    <div class="row"><button data-act="new">New board&hellip;</button></div>
  </aside>
  <footer class="status">
    <span class="st-msg"></span>
    <span class="grow"></span>
    <span class="sep"></span>
    <button data-act="mode">Markup</button>
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
    root.querySelector('[data-act="mode"]').textContent = st.mode === "art" ? "Markup" : "Art";
    root.querySelector('[data-act="undo"]').disabled = !st.undo.length;
    root.querySelector('[data-act="redo"]').disabled = !st.redo.length;
    autosave();
  }

  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal("__working", st.board), 400);
  }

  /* --- editing ------------------------------------------------------------- */

  function edit(h, isErase) {
    if (!h || !h.inside) return;
    const tool = toolByKey(st.hand.tool);
    if (!tool || tool.kind === "select" || tool.kind === "pan") return;
    const token = mark(st);
    const opts = { face: h.face === null ? undefined : h.face, erase: isErase };
    const res = isErase ? erase(st.board, st.hand, h.c, h.r, opts)
                        : apply(st.board, st.hand, h.c, h.r, opts);
    if (!res.ok) { say(res.why, "bad"); showGhost(view, st, h, true); return; }
    if (keep(st, token)) {
      say(res.note || "", "");
      refresh();
    } else if (res.note) say(res.note, "");
  }

  /* --- pointer -------------------------------------------------------------- */

  view.viewport.addEventListener("pointerdown", ev => {
    view.viewport.setPointerCapture(ev.pointerId);
    const tool = toolByKey(st.hand.tool);
    const wantsPan = tool.kind === "pan" || ev.button === 1 || ev.shiftKey;
    if (wantsPan) {
      panning = { x: ev.clientX, y: ev.clientY, ox: st.offX, oy: st.offY };
      return;
    }
    const h = hit(view, st, ev);
    painting = { erase: ev.button === 2 };
    edit(h, painting.erase);
  });

  view.viewport.addEventListener("pointermove", ev => {
    if (panning) {
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
      renderInspector(mainEl, st, hover, false);
      if (h && h.inside) say("(" + h.c + "," + h.r + ")" +
        (h.face !== null && st.edgeTool ? " " + dirLetter(h.face) + " edge" : ""), "");
    }
    if (painting && h && h.inside) edit(h, painting.erase);
  });

  const endPointer = () => { painting = null; panning = null; };
  view.viewport.addEventListener("pointerup", endPointer);
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
    return !!t && (t.kind === "wall" || (t.kind === "device" && t.device === "door"));
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
    if (k === "escape") { st.hand.tool = "select"; refresh({ board: false }); return; }
    if (k === "`") { toggleMode(); return; }
    if (k === "+" || k === "=") { zoomAbout(view, st, 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); return; }
    if (k === "-") { zoomAbout(view, st, 1 / 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); return; }
    if (k === "0") { fit(view, st); refresh({ board: false }); return; }

    /* WASD face the thing in hand, QE turn it a quarter. Reserved, so no tool
     * may claim them -- check-app asserts that. */
    const face = { w: N, d: E, s: S, a: W }[k];
    if (face !== undefined) { st.hand.dir = face; refresh({ board: false }); return; }
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
    const tools = toolsFor(st.board.edition, false).filter(t => t.hot === k);
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

  /* --- clicks in the panels --------------------------------------------------- */

  function toggleMode() {
    st.mode = st.mode === "art" ? "markup" : "art";
    refresh();
    say(st.mode === "markup"
      ? "Markup: thin line work, meant to be read over a photograph."
      : "Play art.", "");
  }

  root.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (b && b.dataset.tool) { st.hand.tool = b.dataset.tool; refresh({ board: false }); return; }
    if (b) {
      const d = b.dataset;
      if (d.dir !== undefined) { st.hand.dir = +d.dir; refresh({ board: false }); return; }
      if (d.digit !== undefined) { st.hand.digit = +d.digit; refresh({ board: false }); return; }
      if (d.pair !== undefined) { st.hand.pair = +d.pair; refresh({ board: false }); return; }
      if (d.arms !== undefined) { st.hand.arms = d.arms; refresh({ board: false }); return; }
      if (d.level !== undefined) { st.hand.level = +d.level; refresh({ board: false }); return; }
      if (d.damage !== undefined) { st.hand.damage = +d.damage; refresh({ board: false }); return; }
      if (d.reach !== undefined) { st.hand.reach = +d.reach; refresh({ board: false }); return; }
      if (d.reg !== undefined) { toggleReg(+d.reg); return; }
      if (d.act) { act(d.act); return; }
    }
    const li = ev.target.closest("li[data-goto]");
    if (li) goTo(li.dataset.goto);
  });

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

  root.addEventListener("input", ev => {
    const t = ev.target;
    if (t.dataset.meta) {
      const v = t.value.trim();
      if (t.dataset.meta === "id") { if (/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) st.board.id = v; }
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
      case "mode": toggleMode(); break;
      case "undo": undo(st) && refresh(); break;
      case "redo": redo(st) && refresh(); break;
      case "fit": fit(view, st); refresh({ board: false }); break;
      case "zoomin": zoomAbout(view, st, 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); break;
      case "zoomout": zoomAbout(view, st, 1 / 1.2, view.viewport.clientWidth / 2, view.viewport.clientHeight / 2); refresh({ board: false }); break;
      case "photo": fileIn.click(); break;
      case "photo-off": dropPhoto(); break;
      case "export": showText("Board JSON", boardJSON(st.board)); break;
      case "picture": showText("The board as a picture", toPicture(st.board)); break;
      case "import": jsonIn.click(); break;
      case "new": newBoard(); break;
    }
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
      let board = null, why = "";
      try {
        const doc = JSON.parse(text);
        const d = sink();
        board = boardFromDocument(doc, d);
        if (!board) why = d.items.map(x => x.message).join(" ");
      } catch (e) {
        /* a pasted ASCII picture is still an accepted import */
        try { board = fromPicture(text, { id: "imported", name: "Imported" }); }
        catch (e2) { why = e2.message; }
      }
      if (!board) { say("Could not read that: " + why, "bad"); return; }
      st.board = board;
      st.undo.length = 0; st.redo.length = 0;
      refresh();
      fit(view, st);
      say("Loaded " + board.name + ".", "ok");
    });
    jsonIn.value = "";
  });

  function showText(title, text) {
    modal.innerHTML = "<h3>" + esc(title) + "</h3>" +
      '<textarea readonly style="width:min(80vw,760px);height:60vh;background:#11141d;color:#c8d4ea;' +
      'border:1px solid #1e2331;border-radius:3px;font:12px/1.45 ui-monospace,monospace;padding:8px">' +
      esc(text) + "</textarea>" +
      '<div class="row" style="margin-top:8px"><button data-act="copy">Copy</button>' +
      '<button data-act="close">Close</button></div>';
    modal.showModal();
    modal.onclick = ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "copy") {
        modal.querySelector("textarea").select();
        try { document.execCommand("copy"); } catch (e) { /* the button is a convenience */ }
      }
      modal.close();
    };
  }

  function newBoard() {
    const w = +(prompt("How many squares across?", "12") || 0);
    const h = +(prompt("How many squares down?", "12") || 0);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
      say("A board needs whole positive dimensions.", "bad"); return;
    }
    st.board = blankBoard({ id: "untitled", name: "Untitled", w, h });
    st.undo.length = 0; st.redo.length = 0;
    refresh(); fit(view, st);
    say("A new " + w + " by " + h + " board.", "");
  }

  /* --- boot ------------------------------------------------------------------- */

  window.addEventListener("resize", () => { layout(view, st); showMarks(view, st); });
  refresh();
  fit(view, st);
  say("Pick a tool, click the board. W A S D face it, Q E turn it, ` swaps the drawing.", "");

  /* a small handle for the browser console and for tests */
  window.__ED = { st, view, refresh, act, edit, hitAt: ev => hit(view, st, ev) };
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
      if (b) return b;
    } catch (e) { /* fall through to a blank one */ }
  }
  return blankBoard({ id: "untitled", name: "Untitled", w: 12, h: 12 });
}

const host = document.querySelector("[data-pumarally-editor]");
if (host) mount(host);
