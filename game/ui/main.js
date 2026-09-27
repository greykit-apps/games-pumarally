/* Boot: the library, a saved game if there is one, and the loop between the
 * screen and the engine.
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
import { mountSetup } from "./setup.js";
import { mountScreen } from "./screen.js";

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

let library, index, courses;
try {
  const loaded = await loadLibraryFromUrl(DATA_BASE);
  library = loaded.library; index = loaded.index;
  courses = new Map();
  await Promise.all(index.courses.map(async row => {
    try { courses.set(row.id, await (await fetch(DATA_BASE + "courses/" + row.id + ".json")).json()); } catch (e) { /* skipped */ }
  }));
} catch (e) {
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

/* the workshop's Play button arrives as #course=<id>: that course, preselected on the setup screen */
function wantedCourse() {
  const m = /^#course=([A-Za-z0-9_]+)$/.exec(location.hash || "");
  return m ? m[1] : null;
}

function toSetup() {
  generation++;
  if (screen) screen.stop();
  screen = null;
  busy = false;
  const saved = loadGame();
  mountSetup(host, {
    library, index, courses,
    onStart: opts => start(opts),
    onResume: saved && !saved.over && saved.v === 1 ? () => { st = saved; openScreen(); advance(); } : null,
    initialCourse: wantedCourse()
  });
}

function start(opts) {
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
     * away. The setup screen offers "Back to the race" while a save stands,
     * and starting another is what replaces it. */
    newGame: () => toSetup()
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

const saved = loadGame();
trace = loadTrace();
if (wantedCourse()) toSetup();
else if (saved && !saved.over && saved.v === 1) {
  try {
    readCourse(saved.course, library);
    st = saved;
    openScreen();
    advance();
  } catch (e) {
    clearGame();
    toSetup();
  }
} else toSetup();

window.__PR = { get state() { return st; }, library, step: a => advance(a), dump: () => debugDump() };
