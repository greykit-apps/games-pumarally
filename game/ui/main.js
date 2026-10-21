/* Boot: the boot sequence and the library together, then the title screen,
 * and the loop between the screen and the engine.
 *
 * The loop is three lines long on purpose. The screen collects an answer to
 * the pending request and calls submit(); submit() steps the engine, saves,
 * and hands the events to the screen. Bots answer in the same loop through
 * the same door. Nothing else touches the state.
 */
import { injectCSS } from "./style.js";
import { loadLibraryFromUrl, readCourse } from "../engine/library.js";
import { newGame, isHuman, normaliseSave } from "../engine/state.js";
import { step } from "../engine/machine.js";
import { botAnswer } from "../engine/bots.js";
import { mountSetup, quickStartOpts, forgetEverything } from "./setup.js";
import { mountScreen } from "./screen.js";
import { startIntro, gkBootSound, mountTitle, bootReloadLine, alertSheet, gkIntegrate, gkTable, gktFlick, gktDeal, gktChit } from "./title.js";
import { tableScene } from "./tablescene.js";
import { cardArt } from "./cardart.js";
import { LIVERIES } from "../engine/state.js";
import { HELP, ABOUT } from "./help.js";
import * as sfx from "./sfx.js";

/* the data lives beside the editor whichever page mounted the game: the
 * repo root's index.html and game/index.html both load this module */
const DATA_BASE = new URL("../../editor/data/", import.meta.url).href;
const SAVE_KEY = "pumarally_game_v2";
const SPEED_KEY = "pumarally_speed_v2";
const TRACE_KEY = "pumarally_trace_v1";
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

function saveGame(st) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* no storage */ } }

/* THE TRACE: what it takes to replay this race from nothing. The engine is
 * deterministic -- a seed, a course, the seats, the house rules and the
 * ruleset make the same game every time, and every branch after that is an
 * answer through the one request door -- so the game's inputs plus every
 * answer in order IS the game. The trace records exactly that, plus every
 * log line (the state keeps only the last four hundred) and every request
 * as it was asked. It is written beside the save on every step, and the
 * Debug button bundles it with the current state into a file, so that a race
 * that went wrong can be handed over whole and re-run to the step it broke.
 * game/tools/replay-dump.js does the re-running. */
let trace = null;
function loadTrace() { try { return JSON.parse(localStorage.getItem(TRACE_KEY)); } catch (e) { return null; } }
function saveTrace() { if (!trace) return; try { localStorage.setItem(TRACE_KEY, JSON.stringify(trace)); } catch (e) { /* no storage, or full */ } }
function startTrace(opts, st) {
  trace = { v: 1, started: new Date().toISOString(), seed: st.seed,
    opts: { seed: st.seed, course: opts.course, seats: opts.seats, house: opts.house || {}, ruleset: st.ruleset },
    answers: [], log: [], notes: [] };
  saveTrace();
}
/** One step's worth: the answer that drove it and the log it produced. */
function traceStep(st, answer, req, events) {
  if (!trace || trace.seed !== st.seed) return;
  if (answer !== undefined && req) trace.answers.push({ turn: req.turn, at: req.at, kind: req.kind, player: req.player, answer });
  for (const e of events) if (e.type === "log") trace.log.push({ turn: e.turn === undefined ? st.turn : e.turn, reg: e.reg === undefined ? st.register : e.reg, msg: e.msg });
  saveTrace();
}
/** Everything, as one object: the trace and the state as it stands. */
function debugDump() {
  return {
    v: 1, exported: new Date().toISOString(),
    page: location.href, ua: navigator.userAgent, speed,
    trace: trace && trace.seed === st.seed ? trace : null,
    traceNote: trace && trace.seed === st.seed ? undefined : "no trace for this race: it was started before traces were kept, or on another browser",
    state: st
  };
}
/** The dump, saved as a file: pumarally-debug-<seed>-t<turn>.json */
function downloadDump() {
  const d = debugDump();
  const name = "pumarally-debug-" + (st ? st.seed : "none") + "-t" + (st ? st.turn : 0) + ".json";
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}
function loadGame() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s ? normaliseSave(s) : null; } catch (e) { return null; } }
function clearGame() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ } }

const host = document.querySelector("[data-pumarally-game]");
injectCSS(document);

/* the workshop's Play button arrives as #course=<id>: that course, preselected on the setup screen */
function wantedCourse() {
  const m = /^#course=([A-Za-z0-9_]+)$/.exec(location.hash || "");
  return m ? m[1] : null;
}

/* the boot plays while the boards load, and hands over to the title when
 * both are done; the workshop's Play button goes straight to the setup.
 * The integrated intro (games-meta STANDARD.md §14): canon's boot with the
 * cat's meow on its pulse, in the game's own audio context -- none while
 * the game is muted -- and the hold at its end where the browser wants a
 * press before it will play sound. */
const boot = wantedCourse() ? null : startIntro({
  lines: [bootReloadLine(), "loading the factory floor"],
  audio: () => sfx.context(),
  bootSound: sfx.isMuted() ? false : gkBootSound
});

let library, index, courses;
try {
  const loaded = await loadLibraryFromUrl(DATA_BASE);
  library = loaded.library; index = loaded.index;
  courses = new Map();
  await Promise.all(index.courses.map(async row => {
    try { courses.set(row.id, await (await fetch(DATA_BASE + "courses/" + row.id + ".json")).json()); } catch (e) { /* skipped */ }
  }));
} catch (e) {
  if (boot) boot.cancel();
  host.innerHTML = '<p class="boot">Could not load the boards: ' + e.message + "</p>";
  throw e;
}

let speed = (() => { try { return localStorage.getItem(SPEED_KEY) || "normal"; } catch (e) { return "normal"; } })();
let st = null;
let screen = null;
let busy = false;
/* bumped whenever the screen is torn down, so a loop still replaying the old
 * race stops at its next beat and never touches the new one */
let generation = 0;

/* the course workshop sits beside the game whichever page mounted it */
const workshopHref = new URL("../../editor/index.html#course", import.meta.url).href;
const SPEED_NAMES = [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]];

/** The saved race, if it can be picked up again; one that no longer reads is dropped. */
function resumable() {
  const s = loadGame();
  if (!s || s.over || s.v !== 1) return null;
  try { readCourse(s.course, library); return s; } catch (e) { clearGame(); return null; }
}

/* SOUND (STANDARD.md §8). The browser lets sound start only inside a press
 * or a click, so every one wakes the context; M switches sound on and off on
 * any screen of the game, and whatever shows the switch is told. */
for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, () => sfx.unlock(), true);
function syncSound() {
  const on = !sfx.isMuted();
  for (const b of document.querySelectorAll("[data-sound]")) b.setAttribute("aria-pressed", String(b.dataset.sound === (on ? "on" : "off")));
  if (screen) screen.soundChanged();
  if (switches) switches.refresh();
}
document.addEventListener("keydown", ev => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
  if (ev.target.closest && ev.target.closest("input,select,textarea,[contenteditable]")) return;
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (k === "m") { ev.preventDefault(); sfx.toggleMute(); syncSound(); }
});

/* The table's sounds (games-meta STANDARD.md §15): a card dealt, a counter
 * set down, and a card's edge under a thumb as the menu's tick, all into the
 * game's effects, under the Sound switch. Only once the context is running:
 * a sound scheduled on one the browser is still holding back would play late,
 * all at once, at the first press. */
function tableSound(fn, gain) {
  const ac = sfx.context();
  if (!ac || ac.state !== "running") return;
  fn(ac, sfx.effects(), gain === undefined ? {} : { gain });
}
/* the Sound switch top right; M and Settings move it too (syncSound) */
let switches = null;
const SOUND = { get: () => !sfx.isMuted(), set: on => { sfx.setMuted(!on); syncSound(); } };
let introDone = false;

let title = null;
function leave() {
  generation++;
  if (screen) screen.stop();
  screen = null;
  busy = false;
  if (title) title.unmount();
  title = null;
  /* the setup screen hangs its handlers on the host itself: they go with it */
  host.onclick = host.onkeydown = host.oninput = host.onchange = null;
}

function toTitle() {
  leave();
  const saved = resumable();
  title = mountTitle(host, {
    name: "PumaRally",
    lines: ["Puma", "Rally"],
    sub: "Program \u00b7 Race \u00b7 Touch the flags",
    items: [
      saved && { act: "resume", label: "Resume game", key: "R", meta: saved.course.name + " \u00b7 turn " + saved.turn },
      { act: "new", label: "New quick game", key: "N" },
      { act: "custom", label: "Custom game", key: "C", meta: "boards, seats, rules" },
      { act: "builder", label: "Course builder", key: "B" },
      "gap",
      { act: "settings", label: "Settings", key: "S" },
      { act: "help", label: "Help", key: "?" },
      { act: "about", label: "About", key: "A" }
    ],
    primary: saved ? "resume" : "new",
    scene: tableScene({ library, courses }),
    help: HELP,
    about: ABOUT,
    settings: {
      html: () => "<h3>Sound</h3><div class='gk-row'>" + [["on", "On"], ["off", "Off"]].map(([v, l]) => "<button data-sound='" + v + "' aria-pressed='" + (sfx.isMuted() === (v === "off")) + "'>" + l + "</button>").join("") +
        "</div><p class='gk-note'>The factory floor and the game's signals. M switches it on and off from anywhere.</p>" +
        "<h3>Speed</h3><div class='gk-row'>" + SPEED_NAMES.map(([v, l]) => "<button data-speed='" + v + "' aria-pressed='" + (speed === v) + "'>" + l + "</button>").join("") +
        "</div><p class='gk-note'>How fast the factory floor moves. Speed in the race's top bar changes it too.</p>" +
        "<h3>This browser</h3><div class='gk-row'><button data-act='reset'>Forget everything</button></div>" +
        "<p class='gk-note'>Clears everything PumaRally keeps in this browser: the saved race, your setup, your courses, the workshop's autosave.</p>",
      onClick: async (b, sheet) => {
        if (b.dataset.sound) {
          sfx.setMuted(b.dataset.sound === "off");
          syncSound();
          sheet.refresh();
          if (!sfx.isMuted()) sfx.play("tick");
          return;
        }
        if (b.dataset.speed) {
          speed = b.dataset.speed;
          try { localStorage.setItem(SPEED_KEY, speed); } catch (e) { /* no storage */ }
          sheet.refresh();
          return;
        }
        if (b.dataset.act === "reset") {
          if (!await sheet.confirm("Forget everything PumaRally has saved in this browser: the race in progress, your setup, every course you saved, the workshop's autosave? This cannot be undone.", "Forget everything")) return;
          forgetEverything();
          location.reload();
        }
      }
    },
    onAct: async (act, ui) => {
      if (act === "resume" && saved) { leave(); st = saved; openScreen(); advance(); return; }
      if (act === "custom") { toSetup(); return; }
      if (act === "builder") { location.href = workshopHref; return; }
      if (act === "new") {
        if (saved && !await ui.confirm("Start a new race? The race in progress will be replaced.", "Start a new race")) return;
        let opts;
        try { opts = quickStartOpts({ library, index, courses }); } catch (e) {
          await alertSheet("The quick game could not be drawn: " + e.message, "Quick game");
          return;
        }
        /* a remembered setup that cannot start -- nobody seated, a course since deleted -- is fixed on the setup screen */
        if (opts) start(opts); else toSetup();
      }
    }
  });
  /* The table (games-meta STANDARD.md §15): the name set down like a box's
   * lid, the race behind it lying on the table, and the menu dealt as a hand
   * of program cards. The first title's switches, credit and ticks are laid
   * out by the intro's finish(); every title after it does that here. */
  const t = host.querySelector(".gk-title");
  if (introDone) switches = gkIntegrate(t, { toggles: { sound: SOUND }, tick: () => tableSound(gktFlick, 0.35) });
  gkTable(t, {
    box: ["1\u2013" + LIVERIES.length + " robots", "bots or hot seat", index.boards.length + " boards"],
    tilt: true,
    deal: () => tableSound(gktDeal),
    chit: () => tableSound(gktChit)
  });
  dressCards(t);
  return title;
}

/* The hand is dealt from the game's own deck: each card in the title's hand
 * is a program card from the classic 84, the one that says what its item
 * does -- Resume game turns back to the race you left (a U-turn), a quick
 * game is straight in (Move 3), a custom game one step at a time (Move 1),
 * and the course builder goes off to one side (a right turn). Its move is
 * drawn as the race's hand draws it, in its kind's colour. No priority, and
 * no key in the corners: the card is its move and its item, nothing else.
 * The keys still press their items. The drawing is a picture only: a card's
 * name is its item. */
const MENU_CARDS = { resume: "uturn", new: "move3", custom: "move1", builder: "right" };
function dressCards(t) {
  for (const b of t.querySelectorAll(".gk-menu > button")) {
    const kind = MENU_CARDS[b.dataset.act];
    if (!kind) continue;
    b.classList.add("rc-card", "k-" + kind);
    b.querySelector("kbd").insertAdjacentHTML("afterend", cardArt(kind));
  }
}

function toSetup() {
  leave();
  const saved = loadGame();
  mountSetup(host, {
    library, index, courses,
    onStart: opts => start(opts),
    onResume: saved && !saved.over && saved.v === 1 ? () => { leave(); st = saved; openScreen(); advance(); } : null,
    onBack: () => toTitle().reveal(),
    initialCourse: wantedCourse()
  });
}

function start(opts) {
  leave();
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  st = newGame({ seed, course: opts.course, seats: opts.seats, house: opts.house, ruleset: opts.ruleset, library });
  saveGame(st);
  startTrace(opts, st);
  openScreen();
  advance();
}

function openScreen() {
  screen = mountScreen(host, {
    library,
    submit: a => submit(a),
    speedOf: () => SPEEDS[speed],
    speedName: () => speed,
    cycleSpeed: () => { speed = speed === "slow" ? "normal" : speed === "normal" ? "fast" : "slow"; try { localStorage.setItem(SPEED_KEY, speed); } catch (e) { /* */ } },
    debugDump: () => downloadDump(),
    /* issue #10: one way out of the race, and it does not throw the race
     * away. The title screen offers Resume game while a save stands, and
     * starting another is what replaces it. */
    newGame: () => toTitle().reveal()
  });
  screen.show(st);
}

/** Run the engine until it needs a human, letting the screen replay each step's events. */
async function advance(answer) {
  if (busy) return;
  busy = true;
  const gen = generation;
  let a = answer;
  try {
    for (;;) {
      const req = st.waiting ? { turn: st.turn, at: st.phase + "." + st.step, kind: st.waiting.kind, player: st.waiting.player } : null;
      const r = step(st, library, a);
      traceStep(st, r.refused ? undefined : a, req, r.events);
      a = undefined;
      saveGame(st);
      if (st.over) { clearGame(); await screen.update(st, r.events); break; }
      if (r.refused) { await screen.update(st, []); break; }
      await screen.update(st, r.events);
      if (gen !== generation) break;                 // the race was left while the floor was moving
      const w = st.waiting;
      if (!w) break;
      if (isHuman(st.players[w.player])) {
        /* the mat's standing answers first: shut down or not, pay a card or
         * take the damage, use an optional card or not; only what they
         * cannot settle reaches the player as a question */
        a = screen.autoAnswer(w);
        if (a === undefined) break;
        continue;
      }
      a = botAnswer(st, library, w);
    }
  } catch (e) {
    /* issue #1: a throw anywhere in here used to leave the panel saying "the
     * floor is moving" with nothing to click. The screen says what happened
     * and shows the request that is waiting. */
    if (gen !== generation) return;
    if (screen && screen.fail) screen.fail(e); else throw e;
  } finally {
    /* an exception must not wedge the loop: the next click still steps */
    if (gen === generation) busy = false;
  }
}

function submit(answer) { advance(answer); }

trace = loadTrace();
if (wantedCourse()) toSetup();
else {
  /* the title goes in under the boot, so the boot's fade reveals it; the
   * intro then sets the name down and deals the hand */
  toTitle();
  const saved = resumable();
  const r = await boot.finish({
    more: [
      index.boards.length + " boards &middot; " + courses.size + " courses",
      saved ? "race in progress: " + saved.course.name.replace(/[&<>]/g, "") + ", turn " + saved.turn : "no race in progress"
    ],
    title: host.querySelector(".gk-title"),
    name: "lines",
    /* much quicker than canon's (600, 700, 3000, 4200): the name is down
     * within a second of the boot, and the hand starts landing as its last
     * line does, with no pause between them (as PumaTriage's) */
    timing: { name: 0, step: 220, menu: 380, done: 1400 },
    toggles: { sound: SOUND },
    tick: () => tableSound(gktFlick, 0.35)
  });
  switches = r && r.toggles;
  introDone = true;
}

window.__PR = { get state() { return st; }, library, step: a => advance(a), dump: () => debugDump() };
