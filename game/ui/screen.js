/* The race on screen: the board, the pieces on it, the panel, and the
 * animation that replays the engine's events.
 *
 * THE PANEL DRAWS CONTROLS FOR THE PENDING REQUEST AND NOTHING ELSE. If
 * `waiting` is a human's `program`, the hand and the registers are live for
 * that human; if it is a `bay`, the free bays light up; if it is nothing, the
 * panel is read-only. There is no second opinion anywhere on whether a
 * control is live, which is the whole point of the contract.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { courseOf } from "../engine/course.js";
import { card, KINDS, openRegisters, REGISTERS } from "../engine/cards.js";
import { LIVERIES, isHuman } from "../engine/state.js";

const CELL = 100;
const GLYPH = { move1: "1", move2: "2", move3: "3", back: "↩", left: "↰", right: "↱", uturn: "↺" };
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

const ROBOT = '<g class="spin"><path class="pr-hull" d="M24 30h52a8 8 0 0 1 8 8v38a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/>' +
  '<path class="pr-nose" d="M50 8L66 30H34Z"/><rect class="pr-eye" x="30" y="44" width="40" height="14" rx="4"/></g>';

function flagSvg(n, c, r) {
  return '<g class="flag" transform="translate(' + (c * CELL) + " " + (r * CELL) + ')"><rect class="pr-pole" x="17" y="10" width="8" height="82" rx="3"/>' +
    '<path class="pr-banner" d="M25 14H92L79 40L92 66H25Z"/><text x="56" y="41" class="pr-num">' + n + "</text></g>";
}

export function mountScreen(root, ctx) {
  const { library, speedOf } = ctx;
  let st = null, C = null;
  let pick = [];                 // hand indices chosen for the open registers, in order
  let curtainFor = null;         // a human seat that has not yet taken the keyboard
  let lastHuman = null;
  let animating = false;
  let dragging = null;

  root.innerHTML = '<div class="pr"><div class="top"><h1>PumaRally</h1><span class="turn"></span><span class="grow"></span>' +
    '<button data-act="speed"></button><button data-act="setup">Set up</button><button data-act="new">New game</button></div>' +
    '<div class="main"><div class="stage"><div class="board"><div class="art"></div><svg class="overlay"></svg></div></div><aside class="side"></aside></div></div>';
  const els = {
    turn: root.querySelector(".turn"), art: root.querySelector(".art"), overlay: root.querySelector(".overlay"),
    side: root.querySelector(".side"), board: root.querySelector(".board"), speed: root.querySelector('[data-act="speed"]')
  };
  const pieces = new Map();

  /* --- the board ------------------------------------------------------------ */

  function drawBoard() {
    els.art.innerHTML = boardSVG(C.grid, { mode: "art", background: true });
    els.overlay.setAttribute("viewBox", "0 0 " + (C.w * CELL) + " " + (C.h * CELL));
    let html = "";
    for (const F of C.flags) html += flagSvg(F.n, F.c, F.r);
    html += '<g class="bays"></g><g class="pieces"></g><g class="beams"></g>';
    els.overlay.innerHTML = html;
    pieces.clear();
    const layer = els.overlay.querySelector(".pieces");
    for (const p of st.players) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "piece");
      g.dataset.id = p.id;
      g.innerHTML = ROBOT;
      layer.appendChild(g);
      pieces.set(p.id, g);
      placePiece(p, p.c, p.r, p.face, false);
    }
  }

  function placePiece(p, c, r, face, animate) {
    const g = pieces.get(p.id);
    if (!g) return;
    const liv = LIVERIES[p.livery];
    g.style.setProperty("--a", liv.a); g.style.setProperty("--d", liv.d);
    if (!animate) g.style.transition = "none";
    g.style.transform = "translate(" + (c * CELL) + "px," + (r * CELL) + "px)";
    g.querySelector(".spin").style.transform = "rotate(" + (face * 90) + "deg)";
    if (!animate) { void g.getBoundingClientRect(); g.style.transition = ""; }
    g.classList.toggle("gone", !p.alive || !p.placed);
    g.classList.toggle("down", !!p.poweredDown);
  }

  function syncPieces() { for (const p of st.players) placePiece(p, p.c, p.r, p.face, false); }

  /* the board takes the stage: as wide as the column allows, no taller than
   * the window, keeping its own proportions */
  function fitBoard() {
    if (!C) return;
    const stage = els.board.parentElement;
    const availW = stage.clientWidth - 24, availH = window.innerHeight - 70;
    const w = Math.max(200, Math.min(availW, availH * C.w / C.h));
    els.board.style.width = w + "px";
  }
  window.addEventListener("resize", fitBoard);

  function beam(from, to) {
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("class", "beam");
    l.setAttribute("x1", from[0] * CELL + 50); l.setAttribute("y1", from[1] * CELL + 50);
    l.setAttribute("x2", to[0] * CELL + 50); l.setAttribute("y2", to[1] * CELL + 50);
    els.overlay.querySelector(".beams").appendChild(l);
    return l;
  }

  function showBays(options, onPick) {
    const layer = els.overlay.querySelector(".bays");
    layer.innerHTML = "";
    for (const d of C.docks) {
      if (!options.includes(d.n)) continue;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "bay-pick");
      rect.setAttribute("x", d.c * CELL); rect.setAttribute("y", d.r * CELL);
      rect.setAttribute("width", CELL); rect.setAttribute("height", CELL);
      rect.addEventListener("click", () => onPick(d.n));
      layer.appendChild(rect);
    }
  }

  /* --- animation: the events, replayed ---------------------------------------- */

  const wait = ms => new Promise(res => setTimeout(res, ms * speedOf()));

  async function play(events) {
    animating = true;
    renderPanel();
    for (const e of events) {
      const p = e.player !== undefined ? st.players[e.player] : null;
      switch (e.type) {
        case "moved": case "pushed": case "conveyed": case "shoved":
          placePiece(p, e.to[0], e.to[1], pieceFace(p.id), true);
          await wait(e.type === "conveyed" ? 200 : 260);
          break;
        case "turned":
          setFace(p.id, e.face);
          await wait(200);
          break;
        case "shot": {
          const target = st.players[e.target];
          const l = beam(e.from, pieceCell(e.target) || [target.c, target.r]);
          pieces.get(e.target).classList.add("hit");
          await wait(240);
          l.remove();
          pieces.get(e.target).classList.remove("hit");
          break;
        }
        case "destroyed":
          pieces.get(p.id).classList.add("gone");
          await wait(300);
          break;
        case "respawned": case "placed":
          placePiece(p, e.at[0], e.at[1], p.face, false);
          pieces.get(p.id).classList.remove("gone");
          await wait(200);
          break;
        case "flag":
          await wait(300);
          break;
        case "register":
          renderLog();
          await wait(150);
          break;
        case "element":
          break;
        default:
          break;
      }
    }
    animating = false;
    syncPieces();
    render();
  }
  /* where a piece is drawn now, in cells, so a beam ends where the robot is shown */
  function pieceCell(id) {
    const g = pieces.get(id);
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g.style.transform || "");
    return m ? [Math.round(m[1] / CELL), Math.round(m[2] / CELL)] : null;
  }
  const faces = new Map();
  function pieceFace(id) { return faces.has(id) ? faces.get(id) : st.players[id].face; }
  function setFace(id, face) {
    faces.set(id, face);
    pieces.get(id).querySelector(".spin").style.transform = "rotate(" + (face * 90) + "deg)";
  }

  /* --- the panel --------------------------------------------------------------- */

  function cardHtml(ci, extra) {
    const cd = card(st, ci);
    const k = KINDS[cd.kind];
    return '<button class="card ' + (k.turn !== undefined ? "turn" : "move") + '" ' + (extra || "") + '>' +
      '<span class="g">' + GLYPH[cd.kind] + '</span><span class="l">' + esc(k.label) + '</span><span class="p">' + cd.pri + "</span></button>";
  }

  function renderPanel() {
    const w = st.waiting;
    const me = w ? st.players[w.player] : null;
    let html = "";

    if (st.over) {
      html += '<div class="banner"><b>' + (st.winner !== null ? esc(st.players[st.winner].name) + " wins the race." : st.unfinished ? "The race was called with no winner." : "Every robot is scrap. Nobody wins.") + "</b></div>";
    } else if (animating) {
      html += '<div class="ask"><p>The floor is moving&hellip;</p></div>';
    } else if (w && isHuman(me)) {
      html += requestHtml(w, me);
    } else if (w) {
      html += '<div class="ask"><p>' + esc(me.name) + " is thinking.</p></div>";
    }

    html += "<h2>Robots</h2><div class='robots'>";
    for (const p of st.players) {
      const liv = LIVERIES[p.livery];
      html += '<div class="robot' + (p.alive ? "" : " dead") + '"><span class="sw" style="background:' + liv.a + '"></span>' +
        "<span>" + esc(p.name) + (isHuman(p) ? " <span class='tag'>human</span>" : "") + (p.poweredDown ? " <span class='tag'>powered down</span>" : "") +
        (p.out ? " <span class='tag'>out</span>" : !p.alive ? " <span class='tag'>returning</span>" : "") + "</span>" +
        '<span class="tag">' + p.flags + "/" + C.flags.length + " flags &middot; " + p.lives + " lives</span>" +
        '<span class="pips" title="' + p.damage + ' damage">' + Array.from({ length: 10 }, (_, i) => '<span class="pip' + (i < p.damage ? " on" : "") + '"></span>').join("") + "</span></div>";
    }
    html += "</div><div class='log'></div>";
    els.side.innerHTML = html;
    renderLog();
    wirePanel(w, me);
  }

  function requestHtml(w, me) {
    switch (w.kind) {
      case "livery":
        return '<div class="ask"><p>' + esc(me.name) + ", pick your colour.</p><div class='row'>" +
          w.options.map(k => '<button data-livery="' + k + '" style="border-color:' + LIVERIES[k].a + ';color:' + LIVERIES[k].a + '">' + esc(LIVERIES[k].name) + "</button>").join("") + "</div></div>";
      case "bay":
        return '<div class="ask"><p>' + esc(me.name) + ", pick a docking bay. They are lit on the board.</p><div class='row'>" +
          w.options.map(n => '<button data-bay="' + n + '">Bay ' + n + "</button>").join("") + "</div></div>";
      case "program": {
        const open = w.open;
        let html = '<div class="ask"><p>' + esc(me.name) + ", program your registers." +
          (w.count === 0 ? " Every register is locked; there is nothing to arrange." : "") + "</p>";
        html += '<div class="regs">';
        for (let i = 0; i < REGISTERS; i++) {
          const locked = i >= open;
          const held = me.registers[i];
          const picked = !locked && held === null ? pick[i - countHeld(me, i)] : undefined;
          html += '<div class="slot' + (locked ? " locked" : "") + '" data-slot="' + i + '"><span class="n">' + (i + 1) + "</span>";
          if (held !== null) html += cardHtml(held, "disabled");
          else if (picked !== undefined) html += cardHtml(me.hand[picked], 'data-unpick="' + i + '"');
          html += "</div>";
        }
        html += "</div><h2>Your hand</h2><div class='hand'>";
        me.hand.forEach((ci, i) => {
          if (pick.includes(i)) return;
          html += cardHtml(ci, 'data-card="' + i + '" draggable="true"');
        });
        html += "</div><div class='row'><button class='primary' data-act='run'" + (pick.length === w.count ? "" : " disabled") + ">Run</button>" +
          "<button data-act='clear'" + (pick.length ? "" : " disabled") + ">Clear</button>" +
          "<span class='keys'>1&ndash;9 place, Backspace takes back, Enter runs</span></div></div>";
        return html;
      }
      case "powerDown":
        return '<div class="ask"><p>' + esc(me.name) + ", announce a power down for next turn? You will repair fully and do nothing for a turn.</p><div class='row'>" +
          '<button data-answer="false">Stay powered</button><button class="primary" data-answer="true">Power down next turn</button></div></div>';
      case "stayDown":
        return '<div class="ask"><p>' + esc(me.name) + ", stay powered down for another turn?</p><div class='row'>" +
          '<button data-answer="false">Power up</button><button class="primary" data-answer="true">Stay down</button></div></div>';
      default:
        return '<div class="ask"><p>' + esc(w.kind) + "?</p></div>";
    }
  }
  /* registers before `i` that already hold a locked card do not consume a pick */
  function countHeld(me, i) { let n = 0; for (let k = 0; k < i; k++) if (me.registers[k] !== null) n++; return n; }

  function renderLog() {
    const el = els.side.querySelector(".log");
    if (!el) return;
    el.innerHTML = st.log.slice(-14).map(l => '<div class="' + (/^-- register/.test(l.msg) ? "reg" : "") + '">' + esc(l.msg) + "</div>").join("");
    el.scrollTop = el.scrollHeight;
  }

  function wirePanel(w, me) {
    els.overlay.querySelector(".bays").innerHTML = "";
    if (w && w.kind === "bay" && isHuman(me) && !animating) showBays(w.options, n => answer(n));
  }

  /* --- input: one delegated listener, dispatching off the request ------------- */

  function answer(a) {
    if (animating || !st.waiting) return;
    pick = [];
    ctx.submit(a);
  }

  function place(handIndex) {
    const w = st.waiting;
    if (!w || w.kind !== "program" || pick.length >= w.count || pick.includes(handIndex)) return;
    pick.push(handIndex);
    renderPanel();
  }
  function unpick(slot) {
    const me = st.players[st.waiting.player];
    const k = slot - countHeld(me, slot);
    if (k >= 0 && k < pick.length) { pick.splice(k, 1); renderPanel(); }
  }

  els.side.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b || animating || !st.waiting) return;
    const d = b.dataset;
    if (d.livery !== undefined) return answer(+d.livery);
    if (d.bay !== undefined) return answer(+d.bay);
    if (d.answer !== undefined) return answer(d.answer === "true");
    if (d.card !== undefined) return place(+d.card);
    if (d.unpick !== undefined) return unpick(+d.unpick);
    if (d.act === "run" && pick.length === st.waiting.count) return answer(pick.slice());
    if (d.act === "clear") { pick = []; renderPanel(); }
  });

  /* drag a card onto a register: the same move as a click, a different gesture */
  els.side.addEventListener("dragstart", ev => {
    const c = ev.target.closest("[data-card]");
    if (!c) return;
    dragging = +c.dataset.card;
    ev.dataTransfer.setData("text/plain", String(dragging));
  });
  els.side.addEventListener("dragover", ev => {
    const s = ev.target.closest(".slot");
    if (s && !s.classList.contains("locked") && dragging !== null) { ev.preventDefault(); s.classList.add("over"); }
  });
  els.side.addEventListener("dragleave", ev => { const s = ev.target.closest(".slot"); if (s) s.classList.remove("over"); });
  els.side.addEventListener("drop", ev => {
    const s = ev.target.closest(".slot");
    if (!s || dragging === null) return;
    ev.preventDefault();
    const me = st.players[st.waiting.player];
    const k = +s.dataset.slot - countHeld(me, +s.dataset.slot);
    if (k < 0 || k > pick.length || s.classList.contains("locked")) return;
    if (k === pick.length) place(dragging);
    else { pick.splice(k, 0, dragging); if (pick.length > st.waiting.count) pick.pop(); renderPanel(); }
    dragging = null;
  });

  document.addEventListener("keydown", ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (curtainFor !== null) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); liftCurtain(); } return; }
    const w = st && st.waiting;
    if (!w || animating || !isHuman(st.players[w.player])) return;
    if (w.kind === "program") {
      const me = st.players[w.player];
      if (/^[1-9]$/.test(ev.key)) {
        /* the nth card still in hand, counting the ones not yet placed */
        const left = me.hand.map((_, i) => i).filter(i => !pick.includes(i));
        const i = left[+ev.key - 1];
        if (i !== undefined) place(i);
        ev.preventDefault();
      } else if (ev.key === "Backspace" || ev.key === "Delete") { if (pick.length) { pick.pop(); renderPanel(); } ev.preventDefault(); }
      else if (ev.key === "Enter" && pick.length === w.count) { answer(pick.slice()); ev.preventDefault(); }
    } else if (w.kind === "powerDown" || w.kind === "stayDown") {
      if (ev.key === "y") answer(true); else if (ev.key === "n") answer(false);
    }
  });

  root.querySelector(".top").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "speed") { ctx.cycleSpeed(); els.speed.textContent = "Speed: " + ctx.speedName(); }
    if (b.dataset.act === "setup") ctx.toSetup();
    if (b.dataset.act === "new") ctx.newGame();
  });

  /* --- hot seat ------------------------------------------------------------------ */

  function humansSeated() { return st.players.filter(isHuman).length; }
  function needsCurtain(w) {
    if (!w || humansSeated() < 2) return false;
    const me = st.players[w.player];
    if (!isHuman(me)) return false;
    /* the hand is the secret; a colour or a bay is not */
    if (w.kind !== "program") return false;
    return lastHuman !== me.id;
  }
  function showCurtain(id) {
    curtainFor = id;
    if (root.querySelector(".curtain")) return;       // already up; a second render must not stack another
    const p = st.players[id];
    const el = document.createElement("div");
    el.className = "curtain";
    el.innerHTML = "<p>Pass the keyboard to <b style='color:" + LIVERIES[p.livery].a + "'>" + esc(p.name) + "</b>.</p>" +
      '<button class="primary" data-act="ready">I have it</button><span class="keys">Enter</span>';
    el.querySelector("button").addEventListener("click", liftCurtain);
    root.appendChild(el);
  }
  function liftCurtain() {
    for (const el of root.querySelectorAll(".curtain")) el.remove();
    lastHuman = curtainFor;
    curtainFor = null;
    renderPanel();
  }

  /* --- render ---------------------------------------------------------------------- */

  function render() {
    els.turn.textContent = st.over ? "Race over" : "Turn " + st.turn + (st.phase === "exec" ? " · register " + (st.register + 1) : "");
    els.speed.textContent = "Speed: " + ctx.speedName();
    if (needsCurtain(st.waiting)) { showCurtain(st.waiting.player); return; }
    if (st.waiting && isHuman(st.players[st.waiting.player])) lastHuman = st.waiting.player;
    renderPanel();
  }

  return {
    show(state) {
      st = state;
      C = courseOf(st, library);
      pick = []; faces.clear(); lastHuman = null;
      drawBoard();
      fitBoard();
      render();
    },
    async update(state, events) {
      st = state;
      if (events && events.length) await play(events); else render();
    }
  };
}
