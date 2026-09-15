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
import { card, KINDS, openRegisters, REGISTERS, isDamage, isModern, MAX_ENERGY } from "../engine/cards.js";
import { LIVERIES, isHuman } from "../engine/state.js";
import { OPTION_DEFS } from "../engine/options.js";
import { UPGRADE_DEFS } from "../engine/upgrades.js";

const CELL = 100;
const GLYPH = { move1: "1", move2: "2", move3: "3", back: "↩", left: "↰", right: "↱", uturn: "↺", powerUp: "⚡", again: "⟲", spam: "✉" };
const DIRS = ["North", "East", "South", "West"];
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

const ROBOT = '<g class="spin"><path class="pr-hull" d="M24 30h52a8 8 0 0 1 8 8v38a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/>' +
  '<path class="pr-nose" d="M50 8L66 30H34Z"/><rect class="pr-eye" x="30" y="44" width="40" height="14" rx="4"/></g>';

function flagSvg(n, c, r) {
  return '<g class="flag" transform="translate(' + (c * CELL) + " " + (r * CELL) + ')"><rect class="pr-pole" x="17" y="10" width="8" height="82" rx="3"/>' +
    '<path class="pr-banner" d="M25 14H92L79 40L92 66H25Z"/><text x="56" y="41" class="pr-num">' + n + "</text></g>";
}

let current = null;
let keysBound = false;

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
  window.addEventListener("resize", () => { if (current && current.fitBoard === fitBoard) fitBoard(); });

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
        case "portal":
          /* in one end and out of the other: no glide across the floor between */
          pieces.get(p.id).classList.add("gone");
          await wait(120);
          placePiece(p, e.to[0], e.to[1], pieceFace(p.id), false);
          pieces.get(p.id).classList.remove("gone");
          await wait(160);
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
        case "respawned": case "placed": case "rebooted":
          placePiece(p, e.at[0], e.at[1], e.face === undefined ? p.face : e.face, false);
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
    const cls = isDamage(st, ci) ? "spam" : k.turn !== undefined ? "turn" : "move";
    return '<button class="card ' + cls + '" ' + (extra || "") + (k.note ? ' title="' + esc(k.note) + '"' : "") + '>' +
      '<span class="g">' + GLYPH[cd.kind] + '</span><span class="l">' + esc(k.label) + '</span>' + (cd.pri ? '<span class="p">' + cd.pri + "</span>" : "") + "</button>";
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
    const modern = isModern(st);
    for (const p of st.players) {
      const liv = LIVERIES[p.livery];
      const spamHeld = modern ? p.hand.filter(i => isDamage(st, i)).length + p.pile.filter(i => isDamage(st, i)).length + p.deck.filter(i => isDamage(st, i)).length : 0;
      html += '<div class="robot' + (p.alive ? "" : " dead") + '"><span class="sw" style="background:' + liv.a + '"></span>' +
        "<span>" + esc(p.name) + (isHuman(p) ? " <span class='tag'>human</span>" : "") + (p.poweredDown ? " <span class='tag'>" + (modern ? "shut down" : "powered down") + "</span>" : "") +
        (p.out ? " <span class='tag'>out</span>" : !p.alive ? " <span class='tag'>" + (modern ? "rebooting" : "returning") + "</span>" : "") +
        (st.priority === p.id && modern ? " <span class='tag' title='holds the Priority Token'>&#9733; priority</span>" : "") + "</span>" +
        (modern
          ? '<span class="tag">' + p.flags + "/" + C.flags.length + " checkpoints &middot; " + p.energy + "/" + MAX_ENERGY + " &#9889;</span>" +
            '<span class="tag" title="damage cards this robot carries: in hand, discard and deck">' + spamHeld + " SPAM</span>"
          : '<span class="tag">' + p.flags + "/" + C.flags.length + " flags &middot; " + p.lives + " lives</span>" +
            '<span class="pips" title="' + p.damage + ' damage">' + Array.from({ length: 10 }, (_, i) => '<span class="pip' + (i < p.damage ? " on" : "") + '"></span>').join("") + "</span>") + "</div>";
      /* held option cards and fitted upgrades, as chips with the printed text on hover */
      const chips = p.options.map(o => '<span class="chip" title="' + esc(OPTION_DEFS[o.id].text) + '">' + esc(OPTION_DEFS[o.id].name) +
          (o.st && o.st.charges !== undefined ? " \u00b7 " + o.st.charges : "") + "</span>")
        .concat((p.installed || []).map(u => '<span class="chip up' + (UPGRADE_DEFS[u.id].built ? "" : " inert") + '" title="' + esc(UPGRADE_DEFS[u.id].text + (UPGRADE_DEFS[u.id].built ? "" : " (its effect is not built)")) + '">' + esc(UPGRADE_DEFS[u.id].name) + "</span>"));
      if (chips.length) html += '<div class="chips">' + chips.join("") + "</div>";
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
          else if (Array.isArray(picked)) html += cardHtml(me.hand[picked[0]], 'data-unpick="' + i + '"') + '<span class="crab">&#8646; ' + esc(KINDS[card(st, me.hand[picked[1]]).kind].label) + "</span>";
          else if (picked !== undefined) html += cardHtml(me.hand[picked], 'data-unpick="' + i + '"');
          html += "</div>";
        }
        /* Crab Legs: the last placed card is a rotate and a Move 1 is in hand */
        const lastPick = pick.length ? pick[pick.length - 1] : null;
        const lastKind = lastPick === null ? null : Array.isArray(lastPick) ? null : card(st, me.hand[lastPick]).kind;
        const canPair = w.crab && (lastKind === "left" || lastKind === "right");
        html += "</div><h2>Your hand</h2><div class='hand'>";
        me.hand.forEach((ci, i) => {
          if (pickHas(i)) return;
          const pairable = canPair && card(st, ci).kind === "move1";
          html += cardHtml(ci, 'data-card="' + i + '" draggable="true"') + (pairable ? '<button class="pair" data-pair="' + i + '" title="Crab Legs: pair this Move 1 with the rotate you just placed, and sidestep instead">&#8646; pair</button>' : "");
        });
        if (isModern(st) && me.installed.some(u => u.id === "spamFilter") && me.deck.length) {
          html += "</div><h2>Top of your deck</h2><div class='hand'>" + cardHtml(me.deck[me.deck.length - 1], "disabled");
        }
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
      /* a card's own question, or the option exchange: the labels are the card's words */
      case "cardChoice":
        return '<div class="ask"><p>' + (w.card ? "<b>" + esc(OPTION_DEFS[w.card].name) + "</b>: " : "") + esc(w.prompt) + "</p><div class='row'>" +
          w.options.map((o, i) => '<button data-pick="' + o + '"' + (i === 0 ? "" : ' class="primary"') + ">" + esc(w.labels[i]) + "</button>").join("") + "</div></div>";
      case "siteChoice":
        return '<div class="ask"><p>' + esc(w.prompt) + "</p><div class='row'>" +
          '<button data-site="repair">Repair 2 damage</button><button class="primary" data-site="card">Take an option card</button></div></div>';
      case "dropOption":
        return '<div class="ask"><p>' + esc(w.prompt) + "</p><div class='row'>" +
          w.options.map(o => '<button data-pick="' + o + '" title="' + esc(OPTION_DEFS[me.options[o].id].text) + '">' + esc(w.labels[o]) + "</button>").join("") + "</div></div>";
      /* the 2016 shop: the shelf, the mat, a draw, and Done */
      case "upgrade": {
        const o = w.options;
        let html = '<div class="ask"><p>' + esc(me.name) + ", the upgrade phase. You have <b>" + me.energy + " Energy</b>.</p>";
        if (me.shelf.length) {
          html += "<h2>Your shelf</h2><div class='row'>" + me.shelf.map(id => {
            const d = UPGRADE_DEFS[id];
            const can = o.install.includes(id);
            return '<button data-install="' + esc(id) + '"' + (can ? "" : " disabled") + ' title="' + esc(d.text + (d.built ? "" : " (its effect is not built)")) + '">Install ' + esc(d.name) +
              " <span class='keys'>" + d.cost + "&#9889; " + d.type + "</span></button>";
          }).join("") + "</div>";
        }
        if (me.installed.length) {
          html += "<h2>On your mat</h2><div class='row'>" + me.installed.map(u => '<button data-uninstall="' + esc(u.id) + '" title="' + esc(UPGRADE_DEFS[u.id].text) + '">Uninstall ' + esc(UPGRADE_DEFS[u.id].name) + "</button>").join("") + "</div>";
        }
        html += "<div class='row'>" + (o.buy.includes(true) ? '<button data-buy="1">Draw an upgrade card (1 &#9889;)</button>' : "") +
          '<button class="primary" data-act="done">Done</button></div></div>';
        return html;
      }
      case "shutdown":
        return '<div class="ask"><p>' + esc(me.name) + ", shut down for this round? Your robot resolves no cards and stays on the floor, and every damage card you are holding (" + w.held +
          " in hand and discard) goes back to the table.</p><div class='row'>" +
          '<button data-answer="false">Keep running</button><button class="primary" data-answer="true">Shut down this round</button></div></div>';
      case "rebootFacing":
        return '<div class="ask"><p>' + esc(w.prompt) + "</p><div class='row'>" +
          w.options.map(d => '<button data-pick="' + d + '">' + DIRS[d] + "</button>").join("") + "</div></div>";
      /* a temporary upgrade at this moment: each legal use is a button, and "none" */
      case "useTemp":
        return '<div class="ask"><p>' + esc(w.prompt) + "</p><div class='row'>" +
          '<button class="primary" data-temp="none">Not now</button>' +
          w.options.slice(1).map((o, i) => '<button data-temp="' + (i + 1) + '" title="' + esc(UPGRADE_DEFS[o.id].text) + '">' + esc(w.labels[i]) + "</button>").join("") + "</div></div>";
      /* cards from the hand, in order: Memory Swap's three back, or any number parked on Memory Cards */
      case "stack": {
        const exact = w.count !== null && w.count !== undefined;
        let html = '<div class="ask"><p>' + esc(w.prompt) + (exact ? " Pick " + w.count + " in order." : " Pick any, then Done.") + "</p><div class='hand'>";
        w.options.forEach(i => { const at = pick.indexOf(i); html += cardHtml(me.hand[i], 'data-stack="' + i + '"' + (at >= 0 ? ' aria-pressed="true"' : "")) + (at >= 0 ? "<span class='keys'>" + (at + 1) + "</span>" : ""); });
        html += "</div><div class='row'><button class='primary' data-act='stackDone'" + (exact && pick.length !== w.count ? " disabled" : "") + ">Done</button>" +
          "<button data-act='clear'" + (pick.length ? "" : " disabled") + ">Clear</button></div></div>";
        return html;
      }
      default:
        return '<div class="ask"><p>' + esc(w.kind) + "?</p></div>";
    }
  }
  /* registers before `i` that already hold a locked card do not consume a pick */
  function countHeld(me, i) { let n = 0; for (let k = 0; k < i; k++) if (me.registers[k] !== null) n++; return n; }
  /* a hand index already placed, alone or as half of a Crab Legs pair */
  function pickHas(i) { return pick.some(e => Array.isArray(e) ? e.includes(i) : e === i); }

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
    if (!w || w.kind !== "program" || pick.length >= w.count || pickHas(handIndex)) return;
    pick.push(handIndex);
    renderPanel();
  }
  /* Crab Legs: the Move 1 joins the rotate just placed */
  function pair(handIndex) {
    const w = st.waiting;
    if (!w || w.kind !== "program" || !w.crab || !pick.length || pickHas(handIndex)) return;
    const last = pick[pick.length - 1];
    if (Array.isArray(last)) return;
    pick[pick.length - 1] = [last, handIndex];
    renderPanel();
  }
  function stackToggle(i) {
    const w = st.waiting;
    if (!w || w.kind !== "stack") return;
    const at = pick.indexOf(i);
    if (at >= 0) pick.splice(at, 1);
    else if (w.count === null || w.count === undefined || pick.length < w.count) pick.push(i);
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
    if (d.pick !== undefined) return answer(+d.pick);
    if (d.site !== undefined) return answer(d.site);
    if (d.card !== undefined) return place(+d.card);
    if (d.pair !== undefined) return pair(+d.pair);
    if (d.unpick !== undefined) return unpick(+d.unpick);
    if (d.act === "run" && pick.length === st.waiting.count) return answer(pick.slice());
    if (d.act === "clear") { pick = []; renderPanel(); }
    if (d.temp !== undefined) return answer(d.temp === "none" ? null : st.waiting.options[+d.temp]);
    if (d.stack !== undefined) return stackToggle(+d.stack);
    if (d.act === "stackDone") return answer(pick.slice());
    /* the shop: one action per press, the engine asks again while there is more to do */
    if (d.install !== undefined) return answer({ buy: false, install: d.install, uninstall: [] });
    if (d.uninstall !== undefined) return answer({ buy: false, install: null, uninstall: [d.uninstall] });
    if (d.buy !== undefined) return answer({ buy: true, install: null, uninstall: [] });
    if (d.act === "done") return answer({ buy: false, install: null, uninstall: [] });
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

  /* ONE keyboard listener per document, dispatching to whichever screen is
   * current. Each mount used to add its own, and after New game the previous
   * screen's listener was still firing on a state that no longer existed. */
  function onKey(ev) {
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
    } else if (w.kind === "powerDown" || w.kind === "stayDown" || w.kind === "shutdown") {
      if (ev.key === "y") answer(true); else if (ev.key === "n") answer(false);
    } else if (w.kind === "upgrade" && ev.key === "Enter") { answer({ buy: false, install: null, uninstall: [] }); ev.preventDefault(); }
    else if (w.kind === "useTemp" && ev.key === "Enter") { answer(null); ev.preventDefault(); }
    else if (w.kind === "stack" && ev.key === "Enter") { const exact = w.count !== null && w.count !== undefined; if (!exact || pick.length === w.count) answer(pick.slice()); ev.preventDefault(); }
  }
  current = { onKey, fitBoard };
  if (!keysBound) { document.addEventListener("keydown", ev => { if (current) current.onKey(ev); }); keysBound = true; }

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
    els.turn.textContent = (isModern(st) ? "2016 rules · " : "Classic rules · ") + (st.over ? "Race over" : (isModern(st) ? "Round " : "Turn ") + st.turn + (st.phase === "exec" ? " · register " + (st.register + 1) : ""));
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
