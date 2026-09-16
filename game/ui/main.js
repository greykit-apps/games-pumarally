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
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.35 };

function saveGame(st) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* no storage */ } }
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

/* the workshop's Play button arrives as #course=<id>: that course, preselected on the setup screen */
function wantedCourse() {
  const m = /^#course=([A-Za-z0-9_]+)$/.exec(location.hash || "");
  return m ? m[1] : null;
}

function toSetup() {
  screen = null;
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
  st = newGame({ seed, course: opts.course, seats: opts.seats, house: opts.house, ruleset: opts.ruleset });
  saveGame(st);
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
    toSetup: () => toSetup(),
    newGame: () => { clearGame(); toSetup(); }
  });
  screen.show(st);
}

/** Run the engine until it needs a human, letting the screen replay each step's events. */
async function advance(answer) {
  if (busy) return;
  busy = true;
  let a = answer;
  try {
    for (;;) {
      const r = step(st, library, a);
      a = undefined;
      saveGame(st);
      if (st.over) { clearGame(); await screen.update(st, r.events); break; }
      if (r.refused) { await screen.update(st, []); break; }
      await screen.update(st, r.events);
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
    if (screen && screen.fail) screen.fail(e); else throw e;
  } finally {
    /* an exception must not wedge the loop: the next click still steps */
    busy = false;
  }
}

function submit(answer) { advance(answer); }

const saved = loadGame();
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

window.__PR = { get state() { return st; }, library, step: a => advance(a) };
