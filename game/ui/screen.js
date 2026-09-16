/* The race on screen: the board, the pieces on it, the panel, and the
 * animation that replays the engine's events.
 *
 * THE PANEL DRAWS CONTROLS FOR THE PENDING REQUEST AND NOTHING ELSE. If
 * `waiting` is a human's `program`, the hand and the registers are live for
 * that human; if it is a `bay`, the free bays light up; if it is nothing, the
 * panel is read-only. There is no second opinion anywhere on whether a
 * control is live, which is the whole point of the contract.
 *
 * THE MAT IS THE ONE EXCEPTION, AND IT NEVER TOUCHES THE STATE. Each human
 * robot's row carries standing preferences -- shut down this round, sacrifice
 * a card rather than take damage, each optional card switched on or off, and
 * the order the cards are kept in -- which can be flipped at any moment,
 * mid-animation included. They live in this module (and localStorage, keyed
 * by the game), and they answer the engine's routine questions through the
 * same door a click would: autoAnswer() is consulted before a human is shown
 * a request. A question a preference cannot settle (which register to lock,
 * which way to aim) is still asked.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { courseOf } from "../engine/course.js";
import { card, KINDS, openRegisters, REGISTERS, isDamage, isModern, MAX_ENERGY } from "../engine/cards.js";
import { LIVERIES, isHuman, livesFor } from "../engine/state.js";
import { OPTION_DEFS, PLAN_HOOKS } from "../engine/options.js";
import { UPGRADE_DEFS } from "../engine/upgrades.js";
import { cardArt } from "./cardart.js";
import { kitArt, categoryOf } from "./kitart.js";

const PREFS_KEY = "pumarally_prefs_v1";
/* what a program card does, for the hover box; the deck's own notes cover SPAM and Haywire */
const KIND_NOTES = { move1: "Move forward 1.", move2: "Move forward 2.", move3: "Move forward 3.", back: "Move back 1 without turning.",
  left: "Rotate 90\u00b0 left.", right: "Rotate 90\u00b0 right.", uturn: "Turn round.", powerUp: "Gain 1 Energy.", again: "Repeat the previous register's card." };

const CELL = 100;
const DIRS = ["North", "East", "South", "West"];
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

const ROBOT = '<g class="spin"><path class="pr-hull" d="M24 30h52a8 8 0 0 1 8 8v38a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/>' +
  '<path class="pr-nose" d="M50 8L66 30H34Z"/><rect class="pr-eye" x="30" y="44" width="40" height="14" rx="4"/></g>';

function rebootSvg(t) {
  return '<g class="reboot" transform="translate(' + (t.c * CELL) + " " + (t.r * CELL) + ')"><rect class="pr-tok" x="14" y="14" width="72" height="72" rx="12"/>' +
    '<path class="pr-tok-arrow" transform="rotate(' + (t.face * 90) + ' 50 50)" d="M50 80V26M32 42L50 26L68 42"/></g>';
}

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
  let lastError = null;          // what stopped the last replay or step, shown once in the panel
  let dragging = null;
  let draggingKit = null;        // an option or upgrade card being reordered on its mat
  let prefs = {};                // per robot: the standing answers, see the header

  /* --- the mat's standing preferences ---------------------------------------- */

  function loadPrefs() {
    try { const all = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; prefs = all[String(st.seed)] || {}; } catch (e) { prefs = {}; }
  }
  function savePrefs() {
    try {
      const all = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
      all[String(st.seed)] = prefs;
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete all[k];    // the last eight games
      localStorage.setItem(PREFS_KEY, JSON.stringify(all));
    } catch (e) { /* no storage */ }
  }
  function prefsFor(pid) {
    if (!prefs[pid]) prefs[pid] = { shutdownTurn: -1, sacrifice: false, on: {}, order: [], plan: {} };
    if (!prefs[pid].plan) prefs[pid].plan = {};
    return prefs[pid];
  }
  /* the register plan: a card that asks about a register is armed for the
   * registers its player picked under the slots; a single-use card for one */
  function armed(pid, id, reg) { const pl = prefsFor(pid).plan[id]; return !!(pl && pl[reg]); }
  function toggleArm(pid, id, reg) {
    const pf = prefsFor(pid);
    const def = OPTION_DEFS[id] || UPGRADE_DEFS[id];
    const was = armed(pid, id, reg);
    if (def && def.single) pf.plan[id] = [false, false, false, false, false];
    else if (!pf.plan[id]) pf.plan[id] = [false, false, false, false, false];
    pf.plan[id][reg] = !was;
    savePrefs();
    renderPanel();
  }
  function togglePref(pid, key) {
    const pf = prefsFor(pid);
    if (key === "shutdown") pf.shutdownTurn = pf.shutdownTurn === st.turn ? -1 : st.turn;
    else if (key === "sacrifice") pf.sacrifice = !pf.sacrifice;
    savePrefs();
    renderPanel();
  }
  function toggleCard(pid, id) {
    const pf = prefsFor(pid);
    pf.on[id] = !pf.on[id];
    savePrefs();
    renderPanel();
  }
  /* a robot's mat: its option cards and fitted upgrades, in the order its player keeps them */
  function kitOf(p) {
    const pf = prefsFor(p.id);
    const items = p.options.map(o => ({ kind: "option", id: o.id, held: o, def: OPTION_DEFS[o.id] }))
      .concat((p.installed || []).map(u => ({ kind: "upgrade", id: u.id, held: u, def: UPGRADE_DEFS[u.id] })));
    const rank = id => { const i = pf.order.indexOf(id); return i < 0 ? 1e6 : i; };
    return items.map((it, i) => ({ ...it, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i);
  }
  function reorderKit(pid, movedId, beforeId) {
    const p = st.players[pid];
    const ids = kitOf(p).map(it => it.id).filter(id => id !== movedId);
    const at = beforeId === null ? ids.length : ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, movedId);
    prefsFor(pid).order = ids;
    savePrefs();
    renderPanel();
  }
  /* of these indices into p.options, the one whose card comes first on the mat: the first to be given up */
  function firstOnMat(p, indices) {
    const order = kitOf(p).map(it => it.id);
    let best = null, bestRank = Infinity;
    for (const i of indices) { const r = order.indexOf(p.options[i].id); if (r < bestRank) { bestRank = r; best = i; } }
    return best;
  }

  /**
   * The mat's answer to a routine question, or undefined when the player has
   * to be asked. Consulted by the loop before a human sees a request.
   */
  function autoAnswer(w) {
    const me = st.players[w.player];
    if (!isHuman(me)) return undefined;
    const pf = prefsFor(me.id);
    switch (w.kind) {
      /* the Shutdown button under the registers; off unless pressed this turn */
      case "shutdown": case "powerDown": {
        const a = pf.shutdownTurn === st.turn;
        pf.shutdownTurn = -1; savePrefs();
        return a;
      }
      /* a card lost to a wreck or the hand limit: the first on the mat goes */
      case "dropOption": { const i = firstOnMat(me, w.options); return i === null ? w.options[0] : i; }
      case "cardChoice": {
        /* the option exchange: the damage button says whether a card is paid */
        if (w.exchange) {
          if (!pf.sacrifice) return 0;
          const i = firstOnMat(me, w.options.slice(1).map(o => o - 1));
          return i === null ? 0 : i + 1;
        }
        /* a card's own question. A register armed under the slots is a
         * standing yes (the key names the hook that asked, so the screen
         * knows the question is about the programmed card). Otherwise the
         * card's switch: on, the player is asked each time it comes up; off,
         * its first option is taken without asking. */
        const def = w.card && w.card !== "haywire" ? OPTION_DEFS[w.card] || UPGRADE_DEFS[w.card] : null;
        if (def) {
          const hook = (w.key || "").split(":")[2];
          if (PLAN_HOOKS.includes(hook) && armed(me.id, w.card, st.register)) return w.options.length === 2 ? w.options[1] : undefined;
          return pf.on[w.card] ? undefined : w.options[0];
        }
        return undefined;
      }
      /* a temporary upgrade at this moment: one armed for this register is
       * used (asked only when it needs an argument); else one switched on is
       * asked about; else none is used */
      case "useTemp": {
        const offers = w.options.slice(1);
        if (w.moment !== "dealt") {
          for (const o of offers) if (armed(me.id, o.id, st.register)) return offers.filter(x => x.id === o.id).length === 1 ? o : undefined;
        }
        return offers.some(o => pf.on[o.id]) ? undefined : null;
      }
      /* Memory Cards: nothing is parked unless the card is switched on, and then it is asked */
      case "stack": return w.why === "memoryCards" && !pf.on.memoryCards ? [] : undefined;
      default: return undefined;
    }
  }

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
    for (const T of C.reboots || []) html += rebootSvg(T);
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
    g.classList.toggle("virtual", !!p.virtual);
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

  /* THE REPLAY KEEPS TIME WITH ITS OWN TRANSITIONS (issue #2). A slide is a
   * CSS transition and a turn another; the wait after each event is longer
   * than the transition it started, and both scale with the speed setting,
   * so a belt's curve turns the robot AFTER it has arrived rather than while
   * it is still sliding, which read as a robot moving sideways. And the
   * replay cannot wedge the game (issue #1): whatever throws inside it is
   * caught, the pieces are put where the state says, and the panel comes
   * back with the request that is waiting. */
  async function play(events) {
    animating = true;
    lastError = null;
    els.overlay.style.setProperty("--anim", String(speedOf()));
    renderPanel();
    try {
      await replay(events);
    } catch (e) {
      console.error("the replay stopped:", e);
      lastError = "The replay stopped early (" + (e && e.message ? e.message : String(e)) + "). The race itself is fine; the pieces are shown where they stand.";
    } finally {
      animating = false;
      syncPieces();
      render();
    }
  }

  async function replay(events) {
    for (const e of events) {
      const p = e.player !== undefined ? st.players[e.player] : null;
      switch (e.type) {
        case "moved": case "pushed": case "conveyed": case "shoved":
          placePiece(p, e.to[0], e.to[1], pieceFace(p.id), true);
          await wait(300);
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
          await wait(240);
          break;
        case "shot": {
          const target = st.players[e.target];
          const g = pieces.get(e.target);
          const l = beam(e.from, pieceCell(e.target) || [target.c, target.r]);
          if (g) g.classList.add("hit");
          await wait(240);
          l.remove();
          if (g) g.classList.remove("hit");
          break;
        }
        case "destroyed":
          if (pieces.get(p.id)) pieces.get(p.id).classList.add("gone");
          await wait(300);
          break;
        case "respawned": case "placed": case "rebooted":
          placePiece(p, e.at[0], e.at[1], e.face === undefined ? p.face : e.face, false);
          if (pieces.get(p.id)) pieces.get(p.id).classList.remove("gone");
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
    const g = pieces.get(id);
    if (g) g.querySelector(".spin").style.transform = "rotate(" + (face * 90) + "deg)";
  }

  /* --- the panel --------------------------------------------------------------- */

  /* a card: its art, its name, and its priority in the corner where the classic deck prints one */
  function cardHtml(ci, extra) {
    const cd = card(st, ci);
    const k = KINDS[cd.kind];
    return '<button class="card k-' + esc(cd.kind) + '" ' + (extra || "") + ' data-tip="card:' + ci + '">' +
      cardArt(cd.kind) + '<span class="l">' + esc(k.label) + '</span>' + (cd.pri ? '<span class="p">' + cd.pri + "</span>" : "") +
      (cd.kind === "haywire" ? '<span class="hw">' + esc(cd.text) + "</span>" : "") + "</button>";
  }
  /* a Haywire face down under a register: yours to look at, nobody else's */
  function haywireBackHtml() {
    return '<button class="card k-haywire back" disabled data-tip="hwback"><span class="l">Haywire</span><span class="hw">face down</span></button>';
  }

  /* an option card or an upgrade as a card face: its kind of thing drawn,
   * its name, what it costs or has left, and -- on a human's mat -- its switch */
  function kitCardHtml(it, p, live) {
    const d = it.def, cat = categoryOf(d);
    const human = live && isHuman(p);
    let meta = it.kind === "upgrade" ? (d.costX ? "X" : d.cost) + "&#9889; " + (d.temp ? "temporary" : "permanent") : "option";
    if (it.held && it.held.st && it.held.st.charges !== undefined) meta = it.held.st.charges + " left";
    if (it.id === "commandInReserve" && Number.isInteger(p.reserve)) meta = "holds " + esc(KINDS[card(st, p.reserve).kind].label);
    if (it.id === "flywheel" && Number.isInteger(p.flywheel)) meta = "holds " + esc(KINDS[card(st, p.flywheel).kind].label);
    const on = !!prefsFor(p.id).on[it.id];
    return '<div class="ucard' + (it.kind === "upgrade" ? " up" : "") + (d.temp ? " temp" : "") + (d.built === false ? " inert" : "") +
      '" draggable="' + (human ? "true" : "false") + '" data-kit="' + esc(it.id) + '" data-player="' + p.id + '" data-tip="' + it.kind + ":" + esc(it.id) + ":" + p.id + '">' +
      kitArt(cat) + '<span class="n">' + esc(d.name) + '</span><span class="m">' + meta + "</span>" +
      (d.asks && human ? '<button class="tog" data-tog="' + esc(it.id) + '" data-player="' + p.id + '" aria-pressed="' + on + '">' + (on ? "on" : "off") + "</button>" : "") +
      "</div>";
  }
  /* the mat's buttons: shut down, and (classic) pay a card rather than take damage */
  function ctlHtml(p) {
    if (!isHuman(p) || p.out) return "";
    const pf = prefsFor(p.id), modern = isModern(st);
    const down = pf.shutdownTurn === st.turn;
    /* "Only damaged robots may choose to power down": the classic button waits for a point */
    const may = modern || p.damage > 0 || p.poweredDown;
    let html = '<button data-pref="shutdown" data-player="' + p.id + '" aria-pressed="' + (down && may) + '"' + (may ? "" : " disabled") + ' data-tip="pref:shutdown:' + p.id + '">' +
      (modern ? (down ? "Shutting down this round" : "Shutdown") : (down && may ? "Powering down next turn" : "Power down")) + "</button>";
    if (!modern) html += '<button data-pref="sacrifice" data-player="' + p.id + '" aria-pressed="' + pf.sacrifice + '" data-tip="pref:sacrifice:' + p.id + '">' +
      (pf.sacrifice ? "Sacrificing a card for damage" : "Taking damage") + "</button>";
    return html;
  }
  /* under each register, a button per card that asks about a register:
   * pressed, the card is used there if it can be; a single-use card in one */
  function planHtml(p, programming) {
    if (!isHuman(p) || p.out) return "";
    const cards = kitOf(p).filter(it => it.def.asks && it.def.asksIn.plan);
    if (!cards.length) return "";
    const open = isModern(st) ? REGISTERS : openRegisters(p.damage);
    let html = '<div class="plan">';
    for (let reg = 0; reg < REGISTERS; reg++) {
      /* the card in this register, or the one being placed there: a button
       * appears only under a card it can act on, and the Emergency Switch or
       * a reserve swap only under a card that is not locked in */
      const kind = slotKind(p, reg, programming);
      const locked = reg >= open || p.locks[reg] === st.turn;
      html += '<div class="col">' + cards.filter(it => kind && (it.def.on ? it.def.on.includes(kind) : !(locked && it.def.hooks.onReveal)))
        .map(it => '<button class="arm" data-arm="' + esc(it.id) + '" data-reg="' + reg + '" data-player="' + p.id +
        '" aria-pressed="' + armed(p.id, it.id, reg) + '" data-tip="arm:' + esc(it.id) + ":" + p.id + ":" + reg + '">' + esc(it.def.name) + "</button>").join("") + "</div>";
    }
    return html + "</div>";
  }
  /* what is, or is about to be, in a register: its card's kind, or null for nothing (or a face-down Haywire) */
  function slotKind(p, reg, programming) {
    const held = p.registers[reg];
    if (held !== null && held !== undefined) return card(st, held).kind;
    if (isModern(st) && p.haywire[reg] !== null) return null;
    if (!programming) return null;
    const e = pick[reg - countHeld(p, reg)];
    if (e === undefined) return null;
    return card(st, p.hand[Array.isArray(e) ? e[0] : e]).kind;
  }
  function pips(n, total, cls, title) {
    let s = '<span class="bar ' + cls + '" data-tip="text:' + esc(title) + '">';
    for (let i = 0; i < total; i++) s += '<i class="' + (i < n ? "on" : "") + '"></i>';
    if (n > total) s += "<b>+" + (n - total) + "</b>";
    return s + "</span>";
  }
  /* the hover box's contents, from the key on the element under the pointer */
  function tipHtml(key) {
    const at = key.indexOf(":");
    const kind = at < 0 ? key : key.slice(0, at), rest = at < 0 ? "" : key.slice(at + 1);
    if (kind === "text") return "<p>" + esc(rest) + "</p>";
    if (kind === "hwback") return "<b>Haywire</b><span class='tt'>damage card, face down</span><p>It resolves in this register instead of a programmed card, and only its holder may look at it.</p>";
    if (kind === "card") {
      const cd = card(st, +rest), k = KINDS[cd.kind];
      return "<b>" + esc(k.label) + "</b>" + (cd.pri ? "<span class='tt'>priority " + cd.pri + "</span>" : "") +
        "<p>" + esc(cd.kind === "haywire" ? cd.text : k.note || KIND_NOTES[cd.kind] || "") + "</p>";
    }
    if (kind === "arm") {
      const [id, pid, reg] = rest.split(":");
      const def = OPTION_DEFS[id] || UPGRADE_DEFS[id];
      const on = armed(+pid, id, +reg);
      return "<b>" + esc(def.name) + "</b><span class='tt'>register " + (+reg + 1) + "</span><p>" + esc(def.text) + "</p><p class='st'>" +
        (on ? "Armed for this register: used here if it can be, without asking. A question with more than two answers is still put to you." : "Not armed for this register: the card's switch decides, asking you if it is on.") +
        (def.single ? " One use: arming another register moves it." : "") + "</p>";
    }
    if (kind === "pref") {
      const [what, pid] = rest.split(":");
      const modern = isModern(st);
      if (what === "shutdown") return "<b>" + (modern ? "Shutdown" : "Power down") + "</b><p>" + (modern
        ? "Press it before the registers run and your robot shuts down for this round: no cards, no moving, and every damage card you hold goes back to the table. Otherwise you keep running; nobody asks."
        : "Press it while programming and your robot powers down next turn: it repairs fully and does nothing for a turn. Otherwise you stay powered; nobody asks. Only a damaged robot may power down, so the button waits for a point of damage. A robot already down is asked whether to stay down.") + "</p>";
      return "<b>Damage</b><p>Taking damage, or paying an option card to absorb each point as it lands. The first card on your mat is the one paid; drag the cards to change the order. It can be flipped while the registers run.</p>";
    }
    const [id, pid] = rest.split(":");
    const def = kind === "option" ? OPTION_DEFS[id] : UPGRADE_DEFS[id];
    const p = st.players[+pid];
    const held = p && (kind === "option" ? p.options.find(o => o.id === id) : (p.installed || []).find(u => u.id === id));
    let h = "<b>" + esc(def.name) + "</b><span class='tt'>" + (kind === "option" ? "option card" + (def.cat ? " \u00b7 " + esc(def.cat) : "") :
      (def.temp ? "temporary" : "permanent") + " upgrade \u00b7 " + (def.costX ? "X" : def.cost) + " Energy" + (def.set && def.set !== "base" ? " \u00b7 " + esc(def.set) : "")) + "</span><p>" + esc(def.text) + "</p>";
    if (def.de) h += "<p class='de'>" + esc(def.de) + "</p>";
    if (held && held.st && held.st.charges !== undefined) h += "<p class='st'>" + held.st.charges + (held.st.charges === 1 ? " charge" : " charges") + " left.</p>";
    if (def.built === false) h += "<p class='st'>Its effect is not built: it can be bought and fitted, and does nothing.</p>";
    if (def.asks && p && isHuman(p)) {
      h += "<p class='st'>" + (prefsFor(p.id).on[id]
        ? "Switched on: you are asked each time it could be used."
        : "Switched off: not used, and you are not asked.") + "</p>";
      if (def.asksIn.plan) h += "<p class='st'>Or arm it under a register slot to use it there without being asked: " +
        ((prefsFor(p.id).plan[id] || []).map((v, i) => v ? i + 1 : 0).filter(Boolean).join(", ") || "none") + ".</p>";
    }
    return h;
  }

  function renderPanel() {
    const w = st.waiting;
    const me = w ? st.players[w.player] : null;
    let html = "";

    if (lastError) html += '<div class="banner"><b>Something went wrong.</b> ' + esc(lastError) + "</div>";
    if (st.over) {
      html += '<div class="banner"><b>' + (st.winner !== null ? esc(st.players[st.winner].name) + " wins the race." : st.unfinished ? "The race was called with no winner." : "Every robot is scrap. Nobody wins.") + "</b></div>";
    } else if (animating || (w && !isHuman(me))) {
      /* the floor is moving, or a bot is thinking: the humans' register
       * plans and buttons stay up here, live, so a card can be armed or the
       * damage button flipped while the registers run */
      html += '<div class="ask"><p>' + (animating ? "The floor is moving&hellip;" : esc(me.name) + " is thinking.") + "</p>" +
        st.players.filter(p => isHuman(p) && !p.out).map(p => { const ctl = ctlHtml(p), plan = planHtml(p); return ctl || plan ? '<div class="live"><span class="who" style="color:' + LIVERIES[p.livery].a + '">' + esc(p.name) + "</span>" + plan + '<div class="ctl">' + ctl + "</div></div>" : ""; }).join("") + "</div>";
    } else if (w && isHuman(me)) {
      html += requestHtml(w, me);
    }

    html += "<h2>Robots</h2><div class='robots'>";
    const modern = isModern(st);
    const startLives = livesFor(st.players.length, (st.course.stamps || []).filter(s => s.role === "board").length);
    for (const p of st.players) {
      const liv = LIVERIES[p.livery];
      /* 2016 damage is the cards a robot carries: in hand, discard, deck and face down under its registers */
      const dmg = modern ? p.hand.filter(i => isDamage(st, i)).length + p.pile.filter(i => isDamage(st, i)).length + p.deck.filter(i => isDamage(st, i)).length + (p.haywire || []).filter(i => i !== null).length : p.damage;
      html += '<div class="robot' + (p.alive ? "" : " dead") + '"><div class="head"><span class="sw" style="background:' + liv.a + '"></span>' +
        '<span class="name">' + esc(p.name) + (isHuman(p) ? " <span class='tag'>human</span>" : "") + (p.poweredDown ? " <span class='tag'>" + (modern ? "shut down" : "powered down") + "</span>" : "") +
        (p.out ? " <span class='tag'>out</span>" : !p.alive ? " <span class='tag'>" + (modern ? "rebooting" : "returning") + "</span>" : "") +
        (p.virtual ? " <span class='tag' data-tip='text:Virtual: it came back onto a square another robot was on. It meets no robot -- no pushing, no shooting either way -- until it ends a turn alone on its square.'>virtual</span>" : "") +
        (st.priority === p.id && modern ? " <span class='tag' data-tip='text:holds the Priority Token'>&#9733; priority</span>" : "") + "</span></div>" +
        /* the bars: lives (classic), flags, Energy (2016), damage */
        '<div class="bars">' + (modern ? "" : pips(p.lives, Math.max(startLives, p.lives), "lives", p.lives + (p.lives === 1 ? " life" : " lives"))) +
        pips(p.flags, C.flags.length, "flags", p.flags + " of " + C.flags.length + (modern ? " checkpoints" : " flags")) +
        (modern ? pips(p.energy, MAX_ENERGY, "energy", p.energy + " of " + MAX_ENERGY + " Energy") : "") +
        pips(dmg, 10, "damage", modern ? dmg + " damage card" + (dmg === 1 ? "" : "s") + " carried" : dmg + " damage") + "</div>";
      /* the mat: option cards and fitted upgrades as card faces, in the player's order, with their switches */
      const kit = kitOf(p);
      if (kit.length) html += '<div class="kit" data-kitof="' + p.id + '">' + kit.map(it => kitCardHtml(it, p, true)).join("") + "</div>";
      html += "</div>";
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
          const hw = isModern(st) && me.haywire[i] !== null;
          const picked = !locked && held === null && !hw ? pick[i - countHeld(me, i)] : undefined;
          html += '<div class="slot' + (locked || hw ? " locked" : "") + '" data-slot="' + i + '"><span class="n">' + (i + 1) + "</span>";
          if (hw) html += haywireBackHtml();
          else if (held !== null) html += cardHtml(held, "disabled");
          else if (Array.isArray(picked)) html += cardHtml(me.hand[picked[0]], 'data-unpick="' + i + '"') + '<span class="crab">&#8646; ' + esc(KINDS[card(st, me.hand[picked[1]]).kind].label) + "</span>";
          else if (picked !== undefined) html += cardHtml(me.hand[picked], 'data-unpick="' + i + '"');
          html += "</div>";
        }
        /* Crab Legs: the last placed card is a rotate and a Move 1 is in hand */
        const lastPick = pick.length ? pick[pick.length - 1] : null;
        const lastKind = lastPick === null ? null : Array.isArray(lastPick) ? null : card(st, me.hand[lastPick]).kind;
        const canPair = w.crab && (lastKind === "left" || lastKind === "right");
        html += "</div>" + planHtml(me, true) + "<h2>Your hand</h2><div class='hand'>";
        me.hand.forEach((ci, i) => {
          if (pickHas(i)) return;
          const pairable = canPair && card(st, ci).kind === "move1";
          html += cardHtml(ci, 'data-card="' + i + '" draggable="true"') + (pairable ? '<button class="pair" data-pair="' + i + '" title="Crab Legs: pair this Move 1 with the rotate you just placed, and sidestep instead">&#8646; pair</button>' : "");
        });
        if (isModern(st) && me.installed.some(u => u.id === "spamFilter") && me.deck.length) {
          html += "</div><h2>Top of your deck</h2><div class='hand'>" + cardHtml(me.deck[me.deck.length - 1], "disabled");
        }
        html += "</div><div class='row ctl'><button class='primary' data-act='run'" + (pick.length === w.count ? "" : " disabled") + ">Run</button>" +
          "<button data-act='clear'" + (pick.length ? "" : " disabled") + ">Clear</button>" + ctlHtml(me) + "</div></div>";
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
          w.options.map(o => '<button data-pick="' + o + '" data-tip="option:' + esc(me.options[o].id) + ":" + me.id + '">' + esc(w.labels[o]) + "</button>").join("") + "</div></div>";
      /* the 2016 shop: the shelf, the mat, a draw, and Done */
      case "upgrade": {
        const o = w.options;
        let html = '<div class="ask"><p>' + esc(me.name) + ", the upgrade phase. You have <b>" + me.energy + " Energy</b>.</p>";
        if (me.shelf.length) {
          html += "<h2>Your shelf</h2><div class='kit shop'>" + me.shelf.map(id => {
            const d = UPGRADE_DEFS[id];
            const can = o.install.includes(id);
            return '<div class="shopcard">' + kitCardHtml({ kind: "upgrade", id, held: null, def: d }, me, false) +
              '<button data-install="' + esc(id) + '"' + (can ? "" : " disabled") + ">Install</button></div>";
          }).join("") + "</div>";
        }
        if (me.installed.length) {
          html += "<h2>On your mat</h2><div class='kit shop'>" + me.installed.map(u => '<div class="shopcard">' + kitCardHtml({ kind: "upgrade", id: u.id, held: u, def: UPGRADE_DEFS[u.id] }, me, false) +
            '<button data-uninstall="' + esc(u.id) + '">Uninstall</button></div>').join("") + "</div>";
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
          w.options.slice(1).map((o, i) => '<button data-temp="' + (i + 1) + '" data-tip="upgrade:' + esc(o.id) + ":" + me.id + '">' + esc(w.labels[i]) + "</button>").join("") + "</div></div>";
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
  function countHeld(me, i) { let n = 0; for (let k = 0; k < i; k++) if (me.registers[k] !== null || (isModern(st) && me.haywire[k] !== null)) n++; return n; }
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
    if (!b) return;
    const d = b.dataset;
    /* the mat's switches are live at every moment, the floor moving or not */
    if (d.pref !== undefined) return togglePref(+d.player, d.pref);
    if (d.tog !== undefined) return toggleCard(+d.player, d.tog);
    if (d.arm !== undefined) return toggleArm(+d.player, d.arm, +d.reg);
    if (animating || !st.waiting) return;
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
    const k = ev.target.closest("[data-kit]");
    if (k && k.getAttribute("draggable") === "true") {
      draggingKit = { pid: +k.dataset.player, id: k.dataset.kit };
      ev.dataTransfer.setData("text/plain", k.dataset.kit);
      return;
    }
    const c = ev.target.closest("[data-card]");
    if (!c) return;
    dragging = +c.dataset.card;
    ev.dataTransfer.setData("text/plain", String(dragging));
  });
  els.side.addEventListener("dragend", () => { dragging = null; draggingKit = null; for (const el of els.side.querySelectorAll(".over")) el.classList.remove("over"); });
  els.side.addEventListener("dragover", ev => {
    if (draggingKit) {
      const k = ev.target.closest("[data-kit]"), mat = ev.target.closest("[data-kitof]");
      if ((k && +k.dataset.player === draggingKit.pid) || (mat && +mat.dataset.kitof === draggingKit.pid)) { ev.preventDefault(); if (k) k.classList.add("over"); }
      return;
    }
    const s = ev.target.closest(".slot");
    if (s && !s.classList.contains("locked") && dragging !== null) { ev.preventDefault(); s.classList.add("over"); }
  });
  els.side.addEventListener("dragleave", ev => { const s = ev.target.closest(".slot,[data-kit]"); if (s) s.classList.remove("over"); });
  els.side.addEventListener("drop", ev => {
    if (draggingKit) {
      const k = ev.target.closest("[data-kit]"), mat = ev.target.closest("[data-kitof]");
      const pid = draggingKit.pid;
      if ((k && +k.dataset.player === pid) || (mat && +mat.dataset.kitof === pid)) {
        ev.preventDefault();
        reorderKit(pid, draggingKit.id, k && k.dataset.kit !== draggingKit.id ? k.dataset.kit : null);
      }
      draggingKit = null;
      return;
    }
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

  /* the hover box: one element, filled from the key on whatever is under the pointer */
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  root.appendChild(tip);
  function placeTip(ev) {
    const W = 280, H = tip.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + W > window.innerWidth - 8) x = ev.clientX - W - 16;
    if (y + H > window.innerHeight - 8) y = Math.max(8, window.innerHeight - H - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  els.side.addEventListener("mouseover", ev => {
    const t = ev.target.closest("[data-tip]");
    if (!t) return;
    tip.innerHTML = tipHtml(t.dataset.tip);
    tip.hidden = false;
    placeTip(ev);
  });
  els.side.addEventListener("mousemove", ev => { if (!tip.hidden) placeTip(ev); });
  els.side.addEventListener("mouseout", ev => {
    const t = ev.target.closest("[data-tip]");
    if (t && !(ev.relatedTarget && t.contains(ev.relatedTarget))) tip.hidden = true;
  });
  els.side.addEventListener("dragstart", () => { tip.hidden = true; });

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
      loadPrefs();
      drawBoard();
      fitBoard();
      render();
    },
    /** The mat's answer to a human's pending request, or undefined to ask. */
    autoAnswer(w) { return autoAnswer(w); },
    /** The loop hit an error: say so in the panel and hand the controls back. */
    fail(e) {
      console.error("the step failed:", e);
      lastError = "The engine refused a step (" + (e && e.message ? e.message : String(e)) + "). Try the request again, or start a new game.";
      animating = false;
      syncPieces();
      render();
    },
    async update(state, events) {
      st = state;
      if (events && events.length) await play(events); else render();
    }
  };
}
