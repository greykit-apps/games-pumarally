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
import { PASS_LABELS } from "../engine/machine.js";
import { rebootPoint } from "../engine/rules.js";
import { card, KINDS, openRegisters, REGISTERS, isDamage, isModern, MAX_ENERGY } from "../engine/cards.js";
import { LIVERIES, isHuman, livesFor } from "../engine/state.js";
import { OPTION_DEFS, PLAN_HOOKS } from "../engine/options.js";
import { UPGRADE_DEFS } from "../engine/upgrades.js";
import { cardArt } from "./cardart.js";
import { kitArt, categoryOf } from "./kitart.js";
import { mountScene } from "./scene.js";
import * as sfx from "./sfx.js";

const PREFS_KEY = "pumarally_prefs_v1";
/* what a program card does, for the hover box; the deck's own notes cover SPAM and Haywire */
const KIND_NOTES = { move1: "Move forward 1.", move2: "Move forward 2.", move3: "Move forward 3.", back: "Move back 1 without turning.",
  left: "Rotate 90\u00b0 left.", right: "Rotate 90\u00b0 right.", uturn: "Turn round.", powerUp: "Gain 1 Energy.", again: "Repeat the previous register's card." };

const CELL = 100;
const DIRS = ["North", "East", "South", "West"];
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

/* THE ROBOT IS A WEDGE, so the whole body says which way it faces. The old
 * piece was a rounded square with a small triangle on one side, and at the
 * size a square is drawn during play the triangle was the only cue -- which
 * way a robot faces decides what every Move card does to it, and that has to
 * be readable from across the table. So: a hull that tapers to a prow, a
 * chevron visor across the face that points the same way again, a headlamp
 * lit at the prow, dark treads at the rear, and a cast shadow so it sits ON
 * the deck rather than being printed on it. The hull, nose and eye keep the
 * names the ghost, virtual and hit states style; the new parts are named so
 * as not to answer to anything the board art already draws. */
export const ROBOT = '<g class="spin" filter="url(#pr-wallshadow)">' +
  '<path class="pr-hull" d="M50 8L80 32q3 3 3 7v38q0 9-9 9H26q-9 0-9-9V39q0-4 3-7Z"/>' +
  '<path class="pr-bot-tread" d="M21 58h10v22H21zM69 58h10v22H69z"/>' +
  '<rect class="pr-bot-cab" x="36" y="54" width="28" height="20" rx="4"/>' +
  '<path class="pr-bot-visor" d="M27 40L50 20L73 40V48H27Z"/>' +
  '<rect class="pr-eye" x="34" y="40" width="32" height="6" rx="3"/>' +
  '<path class="pr-nose" d="M50 8L59 17H41Z"/>' +
  '<ellipse class="pr-bot-lamp" cx="50" cy="14" rx="8" ry="4.5" filter="url(#pr-beamglow)"/>' +
  '<path class="pr-bot-lip" d="M20 76V40q0-4 3-7L50 9"/></g>' +
  '<text class="tag" x="50" y="-6" text-anchor="middle"></text>';

function rebootSvg(t) {
  return '<g class="reboot" transform="translate(' + (t.c * CELL) + " " + (t.r * CELL) + ')"><rect class="pr-tok" x="14" y="14" width="72" height="72" rx="12"/>' +
    '<path class="pr-tok-arrow" transform="rotate(' + (t.face * 90) + ' 50 50)" d="M50 80V26M32 42L50 26L68 42"/></g>';
}

export function flagSvg(n, c, r) {
  return '<g class="flag" data-n="' + n + '" transform="translate(' + (c * CELL) + " " + (r * CELL) + ')"><rect class="pr-pole" x="17" y="10" width="8" height="82" rx="3"/>' +
    '<path class="pr-banner" d="M25 14H92L79 40L92 66H25Z"/><text x="56" y="41" class="pr-num">' + n + "</text></g>";
}

let current = null;
let keysBound = false;

/* up up down down left right left right B A: entered during your own
 * programming, it triggers the cheat handled by the program request. */
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function mountScreen(root, ctx) {
  const { library, speedOf } = ctx;
  let st = null, C = null;
  let pick = [];                 // hand indices chosen for the open registers, in order
  let konami = [];               // the last few keys, for the cheat code
  let curtainFor = null;         // a human seat that has not yet taken the keyboard
  let lastHuman = null;
  let animating = false;
  let stopped = false;           // the race was left: the replay ends at its next beat
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
  /* a card by id, whichever table it is in: an option card, an upgrade, or
   * the Haywire a 2016 damage card asks as. A request's `card` can be any of
   * them, and a lookup in one table alone is how Turbo's question, an
   * upgrade's, threw on its name and wedged the panel. */
  function defOf(id) { return OPTION_DEFS[id] || UPGRADE_DEFS[id] || (id === "haywire" ? { name: "Haywire", text: "" } : null); }
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
        const def = w.card && w.card !== "haywire" ? defOf(w.card) : null;
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

  root.innerHTML = '<div class="pr"><div class="scene" aria-hidden="true"></div><div class="top"><h1>PumaRally</h1><span class="turn"></span><span class="grow"></span>' +
    '<button data-act="speed"></button><button data-act="sound" aria-label="Sound" aria-pressed="true"></button><button data-act="debug" title="Save this race -- its course, every card dealt and played, and the state as it stands -- as a file, for when something goes wrong">Debug</button>' +
    '<button data-act="new" title="Back to the title screen. This race stays saved until another is started.">Menu</button></div>' +
    '<div class="main"><div class="stage"><div class="board"><div class="art"></div><svg class="overlay"></svg>' +
    '<div class="caption" hidden><b></b><span></span></div></div>' +
    /* the view buttons a touchscreen has no keys for; shown only when a coarse pointer is present */
    '<div class="viewbtns"><button data-view="out" aria-label="Zoom out" title="Zoom out">&minus;</button>' +
    '<button data-view="reset" aria-label="Reset the view" title="Reset the view">Fit</button>' +
    '<button data-view="in" aria-label="Zoom in" title="Zoom in">+</button></div></div><aside class="side"></aside></div></div>';
  const els = {
    turn: root.querySelector(".turn"), art: root.querySelector(".art"), overlay: root.querySelector(".overlay"),
    side: root.querySelector(".side"), board: root.querySelector(".board"), speed: root.querySelector('[data-act="speed"]'),
    sound: root.querySelector('[data-act="sound"]'),
    caption: root.querySelector(".caption")
  };
  const pieces = new Map();
  mountScene(root.querySelector(".scene"));

  /* --- the board ------------------------------------------------------------ */

  function drawBoard() {
    /* the markings this edition reads, and not the other's: a classic race
     * sees wrenches and no batteries, a 2016 one batteries and no wrenches;
     * the flag LOCATIONS stay in the workshop, the flags themselves are drawn below */
    els.art.innerHTML = boardSVG(C.grid, { mode: "art", background: true, sites: st.ruleset, flagspots: false });
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
      syncPiece(p);
    }
  }

  /* where a robot that is off the board comes back: the 2016 Reboot Token or
   * archive, or the classic archive. Drawn as a ghost so its player programs
   * from the right square, not from wherever the wreck happened. */
  function returnPoint(p) {
    if (p.alive || p.out || !p.placed) return null;
    if (isModern(st)) { if (!p.rebooting) return null; const at = rebootPoint(C, p); return { c: at.c, r: at.r, face: p.face, token: at.token }; }
    return p.archive ? { c: p.archive.c, r: p.archive.r, face: p.archive.face, token: false } : null;
  }

  /* --- the pieces: what is DRAWN, kept apart from what the state says -------- */

  /* Where each piece is drawn: square, facing, and whether it is shown, a
   * ghost, or gone. Kept here rather than read back off the state, because
   * during a replay the state is already at the END of the batch -- every
   * robot on its final square with its final facing, alive or not -- and a
   * replay that reads it draws the ending before the events have happened.
   * That was issue #5's "turn-then-move": a Move card slid the robot along
   * with its facing already set to what the Rotate AFTER it would set, so the
   * turn was on screen before the move. A robot wrecked later in the batch
   * was worse: it was drawn as gone from the batch's first event. So the
   * state places the pieces only when nothing is moving (syncPieces), and a
   * replay moves them by event, from where they were drawn last. */
  const drawn = new Map();       // id -> { c, r, face, show }; show is "on", "ghost" or "gone"

  function drawPiece(id, c, r, face, show, animate) {
    const g = pieces.get(id);
    if (!g) return;
    const spin = g.querySelector(".spin");
    if (!animate) { g.style.transition = "none"; spin.style.transition = "none"; }
    g.style.transform = "translate(" + (c * CELL) + "px," + (r * CELL) + "px)";
    spin.style.transform = "rotate(" + (face * 90) + "deg)";
    if (!animate) { void g.getBoundingClientRect(); g.style.transition = ""; spin.style.transition = ""; }
    g.classList.toggle("gone", show === "gone");
    g.classList.toggle("ghost", show === "ghost");
    drawn.set(id, { c, r, face, show });
  }
  function drawnAt(id) { return drawn.get(id) || { c: st.players[id].c, r: st.players[id].r, face: st.players[id].face, show: "on" }; }
  /* the card a robot has just revealed, floated over the piece; "" clears it */
  function tagPiece(id, text) {
    const g = pieces.get(id);
    if (g) g.querySelector(".tag").textContent = text;
  }

  /* the piece as the state has it: on its square; or a ghost where it comes
   * back, so its player programs from the right square; or gone */
  function syncPiece(p) {
    const g = pieces.get(p.id);
    if (!g) return;
    const liv = LIVERIES[p.livery];
    g.style.setProperty("--a", liv.a); g.style.setProperty("--d", liv.d);
    const back = returnPoint(p);
    const show = back ? "ghost" : (!p.alive || !p.placed) ? "gone" : "on";
    drawPiece(p.id, back ? back.c : p.c, back ? back.r : p.r, back ? back.face : p.face, show, false);
    g.classList.toggle("down", !!p.poweredDown);
    g.classList.toggle("virtual", !!p.virtual);
    tagPiece(p.id, "");
  }
  function syncPieces() { for (const p of st.players) syncPiece(p); }
  /* the square a returning robot comes back on, in words */
  function returnText(p) {
    const back = returnPoint(p);
    if (!back) return "";
    return " Your robot is off the board and comes back at (" + back.c + "," + back.r + ")" + (back.token ? " on the Reboot Token" : " at its archive") +
      (isModern(st) ? ", facing the way you choose when register 1 comes up; it is shown there as a ghost." : ".");
  }

  /* the board takes the stage: as wide as the column allows, no taller than
   * the window, keeping its own proportions */
  function fitBoard() {
    if (!C) return;
    const stage = els.board.parentElement;
    const availW = stage.clientWidth - 24, availH = window.innerHeight - 70;
    const w = Math.max(200, Math.min(availW, availH * C.w / C.h));
    els.board.style.width = w + "px";
    resetLook();
  }

  /* ZOOM AND PAN, the same three ways the workshops have them: the wheel
   * zooms about the pointer, Z and C zoom about the middle, W A S D pan, and
   * the right or middle button drags. A touch has its own: one finger drags
   * the board, two pinch it about their midpoint (and pan with it), and the
   * buttons at the corner do what Z, C and 0 do. The board is laid out at its
   * fitted size and then CSS-transformed, so nothing else on the screen moves;
   * 0 puts it back. Mouse and touch share the one view and neither replaces
   * the other: it is the pointer's type that is asked, never the window's
   * width, so a touchscreen laptop keeps its mouse. */
  const look = { zoom: 1, offX: 0, offY: 0 };
  const LOOK_MIN = 0.5, LOOK_MAX = 6, LOOK_STEP = 1.2, LOOK_PAN = 120, TAP_SLOP = 8;
  function applyLook() {
    els.board.style.transformOrigin = "0 0";
    els.board.style.transform = "translate(" + look.offX + "px," + look.offY + "px) scale(" + look.zoom + ")";
    /* A board shown whole has nothing to drag, so a finger on it scrolls the
     * page (below a stacked layout the panel is a scroll away); once it is
     * zoomed in the finger belongs to the board. Pinching is ours either way. */
    els.board.parentElement.style.touchAction = look.zoom > 1.001 ? "none" : "pan-y";
  }
  function resetLook() { look.zoom = 1; look.offX = 0; look.offY = 0; applyLook(); }
  function zoomLook(factor, clientX, clientY) {
    const next = Math.max(LOOK_MIN, Math.min(LOOK_MAX, look.zoom * factor));
    if (next === look.zoom) return;
    const r = els.board.getBoundingClientRect();
    const px = clientX === undefined ? r.width / 2 : clientX - r.left;
    const py = clientY === undefined ? r.height / 2 : clientY - r.top;
    look.offX += px * (1 - next / look.zoom);
    look.offY += py * (1 - next / look.zoom);
    look.zoom = next;
    applyLook();
  }
  {
    const stage = els.board.parentElement;
    let drag = null;
    const fingers = new Map();     // the touch or pen pointers down on the stage: id -> { x, y }
    let hand = null;               // what the fingers are doing: { pan | pinch, ... }
    let swallow = 0;               // until when a click is the end of a drag, not a tap
    const capture = id => { try { stage.setPointerCapture(id); } catch (e) { /* a synthetic pointer has no capture */ } };
    /* the board's top-left with no view applied, so a gesture can say where in the board a finger is */
    const origin = () => { const r = els.board.getBoundingClientRect(); return { x: r.left - look.offX, y: r.top - look.offY }; };
    const pair = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    function pinchFrom() {
      const o = origin(), m = pair();
      hand = { kind: "pinch", d0: m.d, z0: look.zoom, bx: (m.x - o.x - look.offX) / look.zoom, by: (m.y - o.y - look.offY) / look.zoom, o };
    }
    function panFrom(id) {
      const f = fingers.get(id);
      hand = { kind: "pan", id, x: f.x, y: f.y, ox: look.offX, oy: look.offY, moved: true };
    }

    stage.addEventListener("wheel", ev => {
      ev.preventDefault();
      zoomLook(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
    }, { passive: false });
    stage.addEventListener("contextmenu", ev => ev.preventDefault());
    stage.addEventListener("pointerdown", ev => {
      if (ev.target.closest(".viewbtns")) return;
      if (ev.pointerType !== "mouse") {
        fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (fingers.size === 1) hand = { kind: "pan", id: ev.pointerId, x: ev.clientX, y: ev.clientY, ox: look.offX, oy: look.offY, moved: false };
        else if (fingers.size === 2) { for (const id of fingers.keys()) capture(id); pinchFrom(); }
        return;
      }
      if (ev.button !== 1 && ev.button !== 2) return;
      capture(ev.pointerId);
      drag = { x: ev.clientX, y: ev.clientY, ox: look.offX, oy: look.offY };
      stage.style.cursor = "grabbing";
    });
    stage.addEventListener("pointermove", ev => {
      if (fingers.has(ev.pointerId)) {
        fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (!hand) return;
        if (hand.kind === "pinch" && fingers.size >= 2) {
          const m = pair();
          const z = Math.max(LOOK_MIN, Math.min(LOOK_MAX, hand.z0 * m.d / hand.d0));
          look.zoom = z;
          look.offX = m.x - hand.o.x - z * hand.bx;
          look.offY = m.y - hand.o.y - z * hand.by;
          applyLook();
        } else if (hand.kind === "pan" && hand.id === ev.pointerId) {
          const dx = ev.clientX - hand.x, dy = ev.clientY - hand.y;
          /* a tap wobbles; only a finger that has travelled is a drag, and only then does the stage take it (a tap on a bay must still reach the bay) */
          if (!hand.moved) {
            /* a board shown whole is not dragged: that finger is the page's, to scroll with (see applyLook) */
            if (Math.hypot(dx, dy) < TAP_SLOP || look.zoom <= 1.001) return;
            hand.moved = true; capture(ev.pointerId);
          }
          look.offX = hand.ox + dx;
          look.offY = hand.oy + dy;
          applyLook();
        }
        return;
      }
      if (!drag) return;
      look.offX = drag.ox + (ev.clientX - drag.x);
      look.offY = drag.oy + (ev.clientY - drag.y);
      applyLook();
    });
    const endFinger = ev => {
      if (!fingers.delete(ev.pointerId)) return;
      if (hand && (hand.moved || hand.kind === "pinch")) swallow = Date.now() + 350;
      if (!fingers.size) hand = null;
      else if (fingers.size === 1) panFrom(fingers.keys().next().value);      // a pinch let go of with one finger carries on as a drag
      else pinchFrom();
    };
    const endDrag = ev => { endFinger(ev); drag = null; stage.style.cursor = ""; };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    /* the click that ends a drag or a pinch is not a tap on whatever was under the finger */
    stage.addEventListener("click", ev => { if (Date.now() < swallow && !ev.target.closest(".viewbtns")) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    root.querySelector(".viewbtns").addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.view === "in") zoomLook(LOOK_STEP);
      else if (b.dataset.view === "out") zoomLook(1 / LOOK_STEP);
      else resetLook();
    });
  }
  /** The view keys; true when one was taken. Consulted before the game's own keys. */
  function lookKey(ev) {
    const k = ev.key.toLowerCase();
    if (k === "z" || k === "+" || k === "=") { zoomLook(LOOK_STEP); return true; }
    if (k === "c" || k === "-") { zoomLook(1 / LOOK_STEP); return true; }
    if (k === "0") { resetLook(); return true; }
    const pan = { w: [0, 1], s: [0, -1], a: [1, 0], d: [-1, 0] }[k];
    if (pan) { look.offX += pan[0] * LOOK_PAN; look.offY += pan[1] * LOOK_PAN; applyLook(); return true; }
    return false;
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

  /* --- animation: the events, replayed register by register ------------------ */

  const wait = ms => new Promise(res => setTimeout(res, ms * speedOf()));

  /* THE REPLAY IS A SCHEDULE, NOT A LOOP (issue #5). The engine's events for a
   * batch are cut into PHASES -- the register mark, the cards, then each
   * board-element pass -- and within a phase into GROUPS: in the card phase a
   * robot's whole activation (its reveal, its move or turn, whatever it
   * pushed), in a board pass every event on its own. Each phase starts when
   * the one before it has ended, so the register's structure is on screen:
   * the mark, the robots in priority order, then the belts, the pushers, the
   * gears, the lasers, each announced. Within a phase the groups OVERLAP:
   * the card phase staggers the robots across half a second in priority
   * order, so the first mover leads and the last trails, and a board pass
   * plays every event at once, because every belt does move at once. One
   * rule keeps that honest: a group waits for any robot in it that an
   * earlier group is still moving, so a push, a chain of pushes and a card
   * played from a pushed square keep the engine's order and never overlap.
   *
   * THE CARD PHASE IS A FIXED SLOT -- the stagger window plus the longest
   * card, a Move 3 -- so a register of Move 3s and a register of rotates take
   * the same time, and the run reads as five beats rather than as a queue
   * whose length depends on the hands. Every duration scales with the speed
   * setting, and the CSS transitions scale with it too (--anim), so the wait
   * after a slide always outlasts the slide. */
  const T = { mark: 420, reveal: 220, slide: 300, turn: 240, beam: 260, vanish: 120, appear: 160, land: 200, flag: 320, stagger: 500 };
  const CARD_SLOT = T.stagger + T.reveal + 3 * T.slide;

  /* THE SOUNDS RIDE THE SAME ACTIONS AS THE PIECES (sfx.js): each is played
   * from the timed action that moves its robot, so it is heard as the robot
   * moves, at any speed. A damage moves nothing and makes its sound in an
   * action of its own, which lands after whatever the robot was doing,
   * because a group waits for the robots it touches. The pass under way is
   * remembered from its mark, which plays first, so a belt knows whether it
   * is an express.
   *
   * FOUR THINGS SOUND DURING A TURN, AND NOTHING ELSE: robots moving, the
   * register marks, damage, and a flag touched. A player cannot watch every
   * robot at once, and a sound whose cause you did not see is only noise --
   * the first cut played a reveal, a beam, a respawn, energy and upgrades
   * too, and on the table it was busy and confusing. Each of those is still
   * on screen and in the log. The flag came back on the owner's word: it is
   * the race's score, whoever touches it. The winner's fanfare, after the
   * last turn, is the one other signal kept. */
  let pass = null;
  const voice = p => ({ pitch: p ? sfx.voiceOf(p.id) : 1 });
  const FALLS = /pit|edge|trap door/;
  function moveSound(e, p) {
    if (e.type === "conveyed") return sfx.play(pass === "express" ? "express" : "belt");
    if (e.type === "pushed" || e.type === "shoved" || e.cause === "pusher" || e.cause === "displace") return sfx.play("bump");
    sfx.play("step", voice(p));
  }
  function turnSound(e, p) {
    if (e.cause === "gear") return sfx.play("gear", { arg: e.turn < 0 ? -1 : 1 });
    if (e.cause === "belt") return sfx.play("beltTurn");
    sfx.play("turn", voice(p));
  }
  function damageSound(e) {
    const src = String(e.source || "");
    sfx.play(/flame|flamer|burn/.test(src) ? "burn" : /waste|radiation/.test(src) ? "geiger" : "clank");
  }
  /* the events that make a sound and move nothing, by type */
  const QUIET = { damaged: damageSound, won: () => sfx.play("win") };

  /* the robots an event touches, so groups sharing one are kept in order */
  const who = e => [e.player, e.target, e.shooter, e.by].filter(x => x !== undefined && x !== null);

  /* the batch cut into phases and groups; each phase carries the event that opened it, if one did */
  function phasesOf(events) {
    const phases = [];
    let ph = null, grp = null;
    const open = (kind, mark) => { ph = { kind, mark: mark || null, groups: [] }; phases.push(ph); grp = null; };
    for (const e of events) {
      if (e.type === "register") { open("mark", e); open("cards"); continue; }
      if (e.type === "element") { open("board", e); continue; }
      if (e.type === "turnStart" || e.type === "turnEnd") { open("other"); continue; }
      if (!ph) open(e.type === "revealed" ? "cards" : "other");   // a batch resuming after a question, mid-register
      if (ph.kind === "cards") {
        /* an activation begins at the reveal; a reboot lands before its register 1 card is revealed */
        if (!grp || e.type === "revealed" || e.type === "rebooted" || e.cause === "reboot") { grp = []; ph.groups.push(grp); }
        grp.push(e);
      } else ph.groups.push([e]);
    }
    return phases;
  }

  /* one event as timed actions: `acts` are [offset ms, fn] from the event's
   * start, `dur` is how long it holds the robots it touches */
  function compile(e) {
    const p = e.player !== undefined ? st.players[e.player] : null;
    switch (e.type) {
      case "register":
        return { dur: T.mark, acts: [[0, () => {
          sfx.play("register", { arg: e.register });
          caption((isModern(st) ? "Round " : "Turn ") + e.turn + " · Register " + (e.register + 1), "");
          els.turn.textContent = turnText(e.register, e.turn);
          for (const id of pieces.keys()) tagPiece(id, "");
          renderLog(e.turn, e.register);
        }]] };
      case "element":
        return { dur: 0, acts: [[0, () => { pass = e.name; caption(null, PASS_LABELS[e.name] || e.name); }]] };
      case "revealed":
        return { dur: T.reveal, acts: [[0, () => tagPiece(p.id, KINDS[e.card.kind] ? KINDS[e.card.kind].label : "")]] };
      case "moved": case "pushed": case "conveyed": case "shoved":
        return { dur: T.slide, acts: [[0, () => { moveSound(e, p); const d = drawnAt(p.id); drawPiece(p.id, e.to[0], e.to[1], d.face, d.show, true); }]] };
      case "turned":
        return { dur: T.turn, acts: [[0, () => { turnSound(e, p); const d = drawnAt(p.id); drawPiece(p.id, d.c, d.r, e.face, d.show, true); }]] };
      /* the bounce is ordinary moves and pushes; this only says why */
      case "repulsed":
        return { dur: 0, acts: [[0, () => tagPiece(p.id, "Repulsed")]] };
      case "portal": case "teleported":
        /* in one end and out of the other: no glide across the floor between */
        return { dur: T.vanish + T.appear, acts: [
          [0, () => { sfx.play("teleport"); const d = drawnAt(p.id); drawPiece(p.id, d.c, d.r, d.face, "gone", false); }],
          [T.vanish, () => { const d = drawnAt(p.id); drawPiece(p.id, e.to[0], e.to[1], d.face, "on", false); }]] };
      case "shot": {
        const g = pieces.get(e.target);
        let l = null;
        return { dur: T.beam, acts: [
          [0, () => { const d = drawnAt(e.target); l = beam(e.from, [d.c, d.r]); if (g) g.classList.add("hit"); }],
          [T.beam, () => { if (l) l.remove(); if (g) g.classList.remove("hit"); }]] };
      }
      case "destroyed":
        return { dur: T.slide + T.appear, acts: [
          /* the panel is told at once: a wreck is the moment a player starts
             wondering whether the game has forgotten them */
          [0, () => { sfx.play(FALLS.test(e.how || "") ? "fall" : "boom"); const d = drawnAt(p.id); drawPiece(p.id, d.c, d.r, d.face, "gone", false); tagPiece(p.id, ""); if (isHuman(p)) safely(renderPanel); }],
          /* then the ghost, where it will come back */
          [T.slide, () => { const back = returnPoint(p); if (back) drawPiece(p.id, back.c, back.r, back.face, "ghost", false); }]] };
      case "respawned": case "placed": case "rebooted":
        return { dur: T.land, acts: [[0, () => { drawPiece(p.id, e.at[0], e.at[1], e.face === undefined ? drawnAt(p.id).face : e.face, "on", false); if (isHuman(p)) safely(renderPanel); }]] };
      case "flag": {
        const f = els.overlay.querySelector('.flag[data-n="' + e.flag + '"]');
        return { dur: T.flag, acts: [[0, () => { sfx.play("flag"); if (f) f.classList.add("hit"); }], [T.flag, () => { if (f) f.classList.remove("hit"); }]] };
      }
      default:
        return { dur: 0, acts: QUIET[e.type] ? [[0, () => QUIET[e.type](e)]] : [] };
    }
  }

  /* the batch as actions on one clock, in ms at normal speed */
  function schedule(events) {
    const acts = [];
    let clock = 0;
    for (const ph of phasesOf(events)) {
      const free = new Map();            // robot -> when the last group touching it ends
      let lead = 0;
      if (ph.mark) {
        /* a board pass is announced only when something happens in it */
        if (ph.kind !== "board" || ph.groups.some(g => g.some(e => compile(e).dur > 0))) {
          const m = compile(ph.mark);
          for (const [dt, fn] of m.acts) acts.push({ at: clock + dt, fn });
          lead = m.dur;
        }
      }
      const base = clock + lead;
      let end = base;
      const n = ph.groups.length;
      ph.groups.forEach((evs, k) => {
        let at = base + (ph.kind === "cards" && n > 1 ? Math.round(T.stagger * k / (n - 1)) : 0);
        const ids = new Set();
        for (const e of evs) for (const id of who(e)) ids.add(id);
        for (const id of ids) at = Math.max(at, free.get(id) || 0);
        let cursor = at;
        for (const e of evs) {
          const c = compile(e);
          for (const [dt, fn] of c.acts) acts.push({ at: cursor + dt, fn });
          cursor += c.dur;
        }
        for (const id of ids) free.set(id, cursor);
        end = Math.max(end, cursor);
      });
      if (ph.kind === "cards" && n) end = Math.max(end, base + CARD_SLOT);
      clock = end;
    }
    acts.sort((a, b) => a.at - b.at);
    return { acts, end: clock };
  }

  async function replay(events) {
    const { acts, end } = schedule(events);
    let now = 0;
    for (const a of acts) {
      if (stopped) return;
      if (a.at > now) { await wait(a.at - now); now = a.at; }
      a.fn();
    }
    if (end > now && !stopped) await wait(end - now);
  }

  /* the caption over the board: the register, and the pass under way */
  function caption(head, sub) {
    if (head !== null) els.caption.querySelector("b").textContent = head;
    els.caption.querySelector("span").textContent = sub || "";
    els.caption.hidden = !els.caption.querySelector("b").textContent;
  }
  function turnText(register, turn = st.turn) {
    return (isModern(st) ? "2016 rules · " : "Classic rules · ") + (st.over ? "Race over" : (isModern(st) ? "Round " : "Turn ") + turn +
      (register !== undefined ? " · register " + (register + 1) : ""));
  }

  /* The replay cannot wedge the game (issue #1): whatever throws inside it is
   * caught, the pieces are put where the state says, and the panel comes
   * back with the request that is waiting. */
  async function play(events) {
    animating = true;
    lastError = null;
    els.overlay.style.setProperty("--anim", String(speedOf()));
    safely(renderPanel);
    try {
      await replay(events);
    } catch (e) {
      console.error("the replay stopped:", e);
      lastError = "The replay stopped early (" + (e && e.message ? e.message : String(e)) + "). The race itself is fine; the pieces are shown where they stand.";
    } finally {
      animating = false;
      caption("", "");
      for (const l of els.overlay.querySelectorAll(".beam")) l.remove();
      syncPieces();
      safely(render);
    }
  }
  /* Draw, and if the drawing itself throws, say so and still hand the player
   * a way to answer. The panel is the only thing on the page with buttons in
   * it, so a renderer that throws half-way leaves whatever it drew last --
   * "the floor is moving", a bot "thinking" -- with nothing to click, which
   * is the wedge issue #1 was about, arriving by another road. */
  function safely(draw) {
    try { draw(); return true; }
    catch (e) {
      console.error("the panel failed to draw:", e);
      const w = st.waiting;
      let html = '<div class="banner"><b>The panel could not be drawn.</b> ' + esc(e && e.message ? e.message : String(e)) +
        (w ? " The " + esc(w.kind) + " request from " + esc(st.players[w.player].name) + " is still waiting." : "") + "</div>";
      if (w && Array.isArray(w.options) && w.options.every(o => Number.isInteger(o) || typeof o === "boolean")) {
        html += "<div class='ask'><div class='row'>" + w.options.map((o, i) =>
          '<button data-' + (typeof o === "boolean" ? "answer" : "pick") + '="' + o + '">' + esc(w.labels && w.labels[i] !== undefined ? w.labels[i] : String(o)) + "</button>").join("") + "</div></div>";
      }
      els.side.innerHTML = html;
      return false;
    }
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
      /* A HUMAN WHOSE ROBOT IS OFF THE BOARD IS TOLD SO, HERE. Until now the
       * panel said only "the floor is moving" for the rest of the turn after a
       * wreck, while the other robots finished their registers -- which reads
       * as the game having forgotten you. It has not: you are back next turn,
       * and the panel now says so, with the lives left and where. */
      /* While the replay runs the engine's state is already the FUTURE -- the
       * robot may have respawned in it -- so what is off the board is read
       * from what the replay has drawn, not from the state. */
      const isAway = p => animating ? drawnAt(p.id).show !== "on" : (p.out || !p.alive || p.rebooting);
      const away = st.players.filter(p => isHuman(p) && isAway(p)).map(p => {
        if (p.out) return '<p class="away"><b style="color:' + LIVERIES[p.livery].a + '">' + esc(p.name) + "</b> is out of the race. The others race on.</p>";
        const back = returnPoint(p) || (p.archive ? { c: p.archive.c, r: p.archive.r } : null);
        const where = back ? " at (" + back.c + "," + back.r + ")" + (back.token ? " on the Reboot Token" : "") : "";
        return '<p class="away"><b style="color:' + LIVERIES[p.livery].a + '">' + esc(p.name) + "</b> " +
          (isModern(st) ? "is rebooting and comes back" + where + " in register 1 of the next round." :
           "is destroyed, with " + p.lives + (p.lives === 1 ? " life" : " lives") + " left, and comes back" + where + " next turn.") +
          " The other robots are finishing the turn.</p>";
      }).join("");
      html += '<div class="ask"><p>' + (animating ? "The floor is moving&hellip;" : esc(me.name) + " is thinking.") + "</p>" + away +
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
        /* the seat's own colour is offered first and lit: one click keeps it */
        return '<div class="ask"><p>' + esc(me.name) + ", you are <b style='color:" + LIVERIES[me.livery].a + "'>" + esc(LIVERIES[me.livery].name) + "</b>. Keep it, or pick another colour.</p><div class='row'>" +
          [...w.options].sort((a, b) => (a === me.livery ? 0 : 1) - (b === me.livery ? 0 : 1))
            .map(k => '<button data-livery="' + k + '" aria-pressed="' + (k === me.livery) + '" style="border-color:' + LIVERIES[k].a + ';color:' + LIVERIES[k].a + '">' + esc(LIVERIES[k].name) + "</button>").join("") + "</div></div>";
      case "bay":
        return '<div class="ask"><p>' + esc(me.name) + ", pick a docking bay. They are lit on the board.</p><div class='row'>" +
          w.options.map(n => '<button data-bay="' + n + '">Bay ' + n + "</button>").join("") + "</div></div>";
      case "program": {
        const open = w.open;
        let html = '<div class="ask"><p>' + esc(me.name) + ", program your registers." +
          (w.count === 0 ? " Every register is locked; there is nothing to arrange." : "") + esc(returnText(me)) + "</p>";
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
        html += "</div>" + planHtml(me, true) + "<h2>Your hand</h2><p class='touchhint'>Tap a card to place it. Hold, then drag, to choose its register; hold to read it.</p><div class='hand'>";
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
        return '<div class="ask"><p>' + (w.card && defOf(w.card) ? "<b>" + esc(defOf(w.card).name) + "</b>: " : "") + esc(w.prompt) + "</p><div class='row'>" +
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
            /* a card installed onto any robot: a button for each robot it can go on */
            const onto = d.onto ? st.players.filter(q => !q.installed.some(u => u.id === id)) : null;
            return '<div class="shopcard">' + kitCardHtml({ kind: "upgrade", id, held: null, def: d }, me, false) +
              (onto ? onto.map(q => '<button data-install="' + esc(id) + '" data-onto="' + q.id + '"' + (can ? "" : " disabled") + ">Onto " + esc(q.id === me.id ? "yourself" : q.name) + "</button>").join("")
                : '<button data-install="' + esc(id) + '"' + (can ? "" : " disabled") + ">Install</button>") + "</div>";
          }).join("") + "</div>";
        }
        if (me.installed.length) {
          html += "<h2>On your mat</h2><div class='kit shop'>" + me.installed.map(u => '<div class="shopcard">' + kitCardHtml({ kind: "upgrade", id: u.id, held: u, def: UPGRADE_DEFS[u.id] }, me, false) +
            (o.uninstall.includes(u.id) ? '<button data-uninstall="' + esc(u.id) + '">Uninstall</button>'
              : '<button disabled title="Another robot put it on you; it comes off only as the card says">Stuck on</button>') + '</div>').join("") + "</div>";
        }
        html += "<div class='row'>" + (o.buy.includes(true) ? '<button data-buy="1">Draw an upgrade card (1 &#9889;)</button>' : "") +
          '<button class="primary" data-act="done">Done</button></div></div>';
        return html;
      }
      case "shutdown":
        return '<div class="ask"><p>' + esc(me.name) + ", shut down for this round? Your robot resolves no cards and stays on the floor, and every damage card you are holding (" + w.held +
          " in hand and discard) goes back to the table.</p><div class='row'>" +
          '<button data-answer="false">Keep running</button><button class="primary" data-answer="true">Shut down this round</button></div></div>';
      case "rebootFacing": {
        const back = returnPoint(me);
        return '<div class="ask"><p>' + esc(w.prompt) + (back ? " It comes back at (" + back.c + "," + back.r + ")" + (back.token ? " on the Reboot Token" : " at its archive") + ", where its ghost stands." : "") + "</p><div class='row'>" +
          w.options.map(d => '<button data-pick="' + d + '">' + DIRS[d] + "</button>").join("") + "</div></div>";
      }
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

  /* the whole log, or during a replay the log as it stood at (turn, register):
   * the state's log is already at the end of the batch, and every line
   * carries the turn and register it was written in */
  function renderLog(turn, register) {
    const el = els.side.querySelector(".log");
    if (!el) return;
    const lines = turn === undefined ? st.log : st.log.filter(l => l.turn < turn || (l.turn === turn && l.reg <= register));
    el.innerHTML = lines.slice(-14).map(l => '<div class="' + (/^-- register/.test(l.msg) ? "reg" : "") + '">' + esc(l.msg) + "</div>").join("");
    el.scrollTop = el.scrollHeight;
  }

  function wirePanel(w, me) {
    els.overlay.querySelector(".bays").innerHTML = "";
    if (w && w.kind === "bay" && isHuman(me) && !animating) showBays(w.options, n => answer(n));
  }

  /* --- input: one delegated listener, dispatching off the request ------------- */

  function answer(a) {
    if (animating || !st.waiting) return;
    if (st.waiting.kind === "program" && Array.isArray(a)) sfx.play("lock");
    pick = [];
    ctx.submit(a);
  }

  function place(handIndex) {
    const w = st.waiting;
    if (!w || w.kind !== "program" || pick.length >= w.count || pickHas(handIndex)) return;
    pick.push(handIndex);
    sfx.play("card");
    renderPanel();
  }
  /* Crab Legs: the Move 1 joins the rotate just placed */
  function pair(handIndex) {
    const w = st.waiting;
    if (!w || w.kind !== "program" || !w.crab || !pick.length || pickHas(handIndex)) return;
    const last = pick[pick.length - 1];
    if (Array.isArray(last)) return;
    pick[pick.length - 1] = [last, handIndex];
    sfx.play("card");
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
    if (k >= 0 && k < pick.length) { pick.splice(k, 1); sfx.play("uncard"); renderPanel(); }
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
    if (d.install !== undefined) return answer(d.onto !== undefined ? { buy: false, install: d.install, onto: +d.onto, uninstall: [] } : { buy: false, install: d.install, uninstall: [] });
    if (d.uninstall !== undefined) return answer({ buy: false, install: null, uninstall: [d.uninstall] });
    if (d.buy !== undefined) return answer({ buy: true, install: null, uninstall: [] });
    if (d.act === "done") return answer({ buy: false, install: null, uninstall: [] });
  });

  /* drag a card onto a register: the same move as a click, a different gesture.
   * The drops are functions of their own because a touch drag (below) lands
   * the same two things by another road. */
  function dropCardOn(s, from) {
    const me = st.players[st.waiting.player];
    const k = +s.dataset.slot - countHeld(me, +s.dataset.slot);
    if (k < 0 || k > pick.length || s.classList.contains("locked")) return;
    if (k === pick.length) place(from);
    else { pick.splice(k, 0, from); if (pick.length > st.waiting.count) pick.pop(); sfx.play("card"); renderPanel(); }
  }
  /* a kit card put before another, or at the end of its own mat; false when it is not that robot's */
  function kitTarget(k, mat, pid) { return (k && +k.dataset.player === pid) || (mat && +mat.dataset.kitof === pid); }
  function dropKitOn(k, kit) {
    if (k && k.dataset.kit === kit.id) return;          // let go where it was picked up: nothing moves
    reorderKit(kit.pid, kit.id, k ? k.dataset.kit : null);
  }
  els.side.addEventListener("dragstart", ev => {
    /* a finger on a card is the touch drag's (below); the browser's own drag is unreliable there */
    if (touch.live()) { ev.preventDefault(); return; }
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
      if (kitTarget(k, mat, draggingKit.pid)) { ev.preventDefault(); if (k) k.classList.add("over"); }
      return;
    }
    const s = ev.target.closest(".slot");
    if (s && !s.classList.contains("locked") && dragging !== null) { ev.preventDefault(); s.classList.add("over"); }
  });
  els.side.addEventListener("dragleave", ev => { const s = ev.target.closest(".slot,[data-kit]"); if (s) s.classList.remove("over"); });
  els.side.addEventListener("drop", ev => {
    if (draggingKit) {
      const k = ev.target.closest("[data-kit]"), mat = ev.target.closest("[data-kitof]");
      if (kitTarget(k, mat, draggingKit.pid)) { ev.preventDefault(); dropKitOn(k, draggingKit); }
      draggingKit = null;
      return;
    }
    const s = ev.target.closest(".slot");
    if (!s || dragging === null) return;
    ev.preventDefault();
    dropCardOn(s, dragging);
    dragging = null;
  });

  /* ONE keyboard listener per document, dispatching to whichever screen is
   * current. Each mount used to add its own, and after New game the previous
   * screen's listener was still firing on a state that no longer existed. */
  function onKey(ev) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    /* the view keys are taken first, but NOT returned on: the Konami code
       below wants to see every key, and "a" is one of its own */
    if (lookKey(ev)) ev.preventDefault();
    if (curtainFor !== null) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); liftCurtain(); } return; }
    const w = st && st.waiting;
    if (!w || animating || !isHuman(st.players[w.player])) return;
    if (w.kind === "program") {
      const me = st.players[w.player];
      /* the Konami code: gather the last few keys and, on a match, fire the
       * cheat. Arrow keys are otherwise unused here, so swallow them while the
       * code is being entered rather than let the page scroll. */
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      konami.push(k);
      if (konami.length > KONAMI.length) konami = konami.slice(-KONAMI.length);
      if (/^Arrow/.test(ev.key)) ev.preventDefault();
      if (konami.length === KONAMI.length && konami.every((x, i) => x === KONAMI[i])) {
        konami = []; answer({ cheat: "konami" }); ev.preventDefault(); return;
      }
      if (/^[1-9]$/.test(ev.key)) {
        /* the nth card still in hand, counting the ones not yet placed */
        const left = me.hand.map((_, i) => i).filter(i => !pick.includes(i));
        const i = left[+ev.key - 1];
        if (i !== undefined) place(i);
        ev.preventDefault();
      } else if (ev.key === "Backspace" || ev.key === "Delete") { if (pick.length) { pick.pop(); sfx.play("uncard"); renderPanel(); } ev.preventDefault(); }
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
  function placeTipAt(x, y) {
    const W = 280, H = tip.offsetHeight;
    if (x + W > window.innerWidth - 8) x = x - W - 32;
    if (y + H > window.innerHeight - 8) y = Math.max(8, window.innerHeight - H - 8);
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = y + "px";
  }
  function placeTip(ev) { placeTipAt(ev.clientX + 16, ev.clientY + 16); }
  /* a touch has no hover: the box is shown beside the thing touched, and stays until the next touch */
  let tipTimer = null;
  function pinTip(t) {
    tip.innerHTML = tipHtml(t.dataset.tip);
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const H = tip.offsetHeight;
    placeTipAt(r.left, r.bottom + H + 8 > window.innerHeight ? Math.max(8, r.top - H - 8) : r.bottom + 8);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 8000);
  }
  function unpinTip() { clearTimeout(tipTimer); tip.hidden = true; }
  els.side.addEventListener("mouseover", ev => {
    if (touch.recent()) return;                    // the mouse events a touch makes up are not a hover
    const t = ev.target.closest("[data-tip]");
    if (!t) return;
    tip.innerHTML = tipHtml(t.dataset.tip);
    tip.hidden = false;
    placeTip(ev);
  });
  els.side.addEventListener("mousemove", ev => { if (!tip.hidden && !touch.recent()) placeTip(ev); });
  els.side.addEventListener("mouseout", ev => {
    if (touch.recent()) return;
    const t = ev.target.closest("[data-tip]");
    if (t && !(ev.relatedTarget && t.contains(ev.relatedTarget))) tip.hidden = true;
  });
  els.side.addEventListener("dragstart", () => { tip.hidden = true; });

  /* TOUCH IN THE PANEL. Three things a mouse does that a finger cannot, and
   * what the finger does instead:
   *   read a hover box   -- touch and hold (or, on anything that is not a
   *                         button, just tap); the box stays until the next touch
   *   drag a card        -- keep holding and move: the card comes up under the
   *                         finger and lands on the register, or the mat slot,
   *                         it is let go over
   *   place a card       -- tap, which is the click and has always worked
   * Holding to read and holding to drag are one gesture, so reading a card
   * never places it and a drag never has to start with a jump. A finger that
   * moves before the hold is up is a scroll, and is left alone. Only touch and
   * pen pointers come through here; the mouse keeps the browser's own drag. */
  const HOLD_MS = 350, HOLD_SLOP = 10, LIFT = 56;
  const touch = {
    down: false, at: 0, mute: 0, hold: null,
    recent() { return Date.now() - this.at < 800; },
    live() { return this.down && Date.now() - this.at < 3000; }       // a lost pointerup must not leave the mouse without its drag
  };
  const holdKit = el => el.closest(".ucard[draggable=true]");
  function endHold() {
    const h = touch.hold;
    if (!h) return;
    clearTimeout(h.timer);
    if (h.float) h.float.remove();
    for (const el of els.side.querySelectorAll(".over")) el.classList.remove("over");
    touch.hold = null;
  }
  /* what the lifted card is over: a register for a program card, a mat slot (or the mat's end) for a kit card */
  function dropAt(h, x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under || !els.side.contains(under)) return null;
    if (h.kit) {
      const k = under.closest("[data-kit]"), mat = under.closest("[data-kitof]");
      return kitTarget(k, mat, h.kit.pid) ? { k, mat } : null;
    }
    const s = under.closest(".slot");
    return s && !s.classList.contains("locked") ? { s } : null;
  }
  function liftHold(h, ev) {
    unpinTip();
    h.dragging = true;
    h.float = h.src.cloneNode(true);
    h.float.classList.add("floater");
    h.float.style.width = h.src.offsetWidth + "px"; h.float.style.height = h.src.offsetHeight + "px";
    root.appendChild(h.float);
    moveHold(h, ev);
  }
  function moveHold(h, ev) {
    h.float.style.left = (ev.clientX - h.float.offsetWidth / 2) + "px";
    h.float.style.top = (ev.clientY - LIFT - h.float.offsetHeight / 2) + "px";
    for (const el of els.side.querySelectorAll(".over")) el.classList.remove("over");
    const to = dropAt(h, ev.clientX, ev.clientY - LIFT);
    if (to) (to.s || to.k || to.mat).classList.add("over");
  }
  els.side.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "mouse") return;
    touch.down = true; touch.at = Date.now();
    endHold();
    unpinTip();
    const t = ev.target.closest("[data-tip]");
    const card = ev.target.closest("[data-card]:not(:disabled)");
    const kit = holdKit(ev.target);
    const src = card || kit;
    if (!t && !src) return;
    const h = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t, src, dragging: false, held: false,
      kit: kit && !card ? { pid: +kit.dataset.player, id: kit.dataset.kit } : null };
    h.timer = setTimeout(() => {
      h.held = true;
      if (h.t) pinTip(h.t);
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* no haptics */ } }
    }, HOLD_MS);
    touch.hold = h;
  });
  els.side.addEventListener("pointermove", ev => {
    const h = touch.hold;
    if (!h || h.id !== ev.pointerId) return;
    touch.at = Date.now();
    if (h.dragging) return moveHold(h, ev);
    if (Math.hypot(ev.clientX - h.x, ev.clientY - h.y) < HOLD_SLOP) return;
    if (h.held && h.src) liftHold(h, ev);
    else endHold();                                // moved before the hold was up: a scroll
  });
  /* once a card is lifted the page must not scroll under it */
  document.addEventListener("touchmove", ev => { if (touch.hold && touch.hold.dragging) ev.preventDefault(); }, { passive: false });
  const letGo = ev => {
    if (ev.pointerType === "mouse") return;
    touch.down = false; touch.at = Date.now();
    const h = touch.hold;
    if (!h || h.id !== ev.pointerId) return;
    if (h.dragging && ev.type === "pointerup") {
      const to = dropAt(h, ev.clientX, ev.clientY - LIFT);
      if (to) { if (h.kit) dropKitOn(to.k, h.kit); else dropCardOn(to.s, +h.src.dataset.card); }
    }
    /* a hold or a drag is not a click: the one that follows is dropped */
    if (h.held || h.dragging) touch.mute = Date.now() + 400;
    else if (h.t && ev.type === "pointerup" && !ev.target.closest("button")) pinTip(h.t);       // a tap on something that is only information
    endHold();
  };
  els.side.addEventListener("pointerup", letGo);
  els.side.addEventListener("pointercancel", letGo);
  els.side.addEventListener("click", ev => { if (Date.now() < touch.mute) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  els.side.addEventListener("contextmenu", ev => { if (touch.recent() || touch.live()) ev.preventDefault(); });

  root.querySelector(".top").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "sound") { sfx.toggleMute(); showSound(); }
    if (b.dataset.act === "speed") { ctx.cycleSpeed(); els.speed.textContent = "Speed: " + ctx.speedName(); els.overlay.style.setProperty("--anim", String(speedOf())); }
    if (b.dataset.act === "debug" && ctx.debugDump) { const name = ctx.debugDump(); b.textContent = "Saved " + name; setTimeout(() => { b.textContent = "Debug"; }, 2500); }
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
    sfx.play("curtain");
    for (const el of root.querySelectorAll(".curtain")) el.remove();
    lastHuman = curtainFor;
    curtainFor = null;
    renderPanel();
  }

  /* --- render ---------------------------------------------------------------------- */

  /* named "Sound" whatever it shows, pressed while sound is on (STANDARD.md §8) */
  function showSound() {
    const on = !sfx.isMuted();
    els.sound.textContent = "Sound: " + (on ? "on" : "off");
    els.sound.setAttribute("aria-pressed", String(on));
    els.sound.title = "Sound on or off (M)";
  }

  function render() {
    els.turn.textContent = turnText(st.phase === "exec" ? st.register : undefined);
    els.speed.textContent = "Speed: " + ctx.speedName();
    showSound();
    if (!animating) syncPieces();                       // a state change with no events still moves a ghost
    if (needsCurtain(st.waiting)) { showCurtain(st.waiting.player); return; }
    if (st.waiting && isHuman(st.players[st.waiting.player])) lastHuman = st.waiting.player;
    renderPanel();
  }

  return {
    show(state) {
      st = state;
      C = courseOf(st, library);
      pick = []; drawn.clear(); lastHuman = null; stopped = false;
      loadPrefs();
      drawBoard();
      fitBoard();
      render();
    },
    /** M was pressed, or Settings changed: the top bar says so. */
    soundChanged() { showSound(); },
    /** The screen is being torn down: a replay in progress ends at its next beat. */
    stop() { stopped = true; },
    /** The mat's answer to a human's pending request, or undefined to ask. */
    autoAnswer(w) { return autoAnswer(w); },
    /** The loop hit an error: say so in the panel and hand the controls back. */
    fail(e) {
      console.error("the step failed:", e);
      lastError = "The engine refused a step (" + (e && e.message ? e.message : String(e)) + "). Try the request again, or start a new game.";
      animating = false;
      syncPieces();
      safely(render);
    },
    async update(state, events) {
      st = state;
      if (events && events.length) await play(events); else render();
    }
  };
}
