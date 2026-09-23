/* Setting up a race: how the course comes about, the rules, the seats, the
 * house rules.
 *
 * Four ways in, as four tabs (issue #12):
 *
 *   Quick game    one board -- picked off the shelf, or drawn -- laid at a
 *                 random facing over the docking bay, three flags drawn from
 *                 the locations it marks (game/engine/quick.js)
 *   Quick course  N boards and F flags, all drawn: 12x12 boards stacked as
 *                 the box stacks them, a route of flags through them
 *                 (quickMulti)
 *   Build course  the course workshop, where boards are dragged in, turned,
 *                 flagged, edited square by square, and saved; a saved course
 *                 comes back here under Saved course
 *   Saved course  the shelf: every shipped course, and every course saved
 *                 from the workshop in this browser, with a delete on yours
 *   Settings      the house rules, each with what it does, and the button
 *                 that forgets everything this browser keeps
 *
 * The rules and the seats sit under whichever of the first four tabs is
 * open and do not move when a knob is turned. Seats are any count from one
 * to eight and any mix of humans and bots. Everything here is remembered
 * between visits.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse } from "../engine/library.js";
import { LIVERIES, assignLiveries } from "../engine/state.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { boardFromDocument } from "../../editor/lib/board.js";
import { sink } from "../../editor/validate/diagnostic.js";
import { quickCourse, quickMulti, quickSpots, canQuick, isBlank, quickFlagRange, quickDefaultFlags, QUICK_FLAGS, QUICK_MAX_BOARDS, DOCK_BOARD } from "../engine/quick.js";

const SETUP_KEY = "pumarally_setup_v2";
const WORKSHOP_KEY = "pumarally_courses_v1";

const MODES = [
  ["quick", "Quick game"],
  ["multi", "Quick course"],
  ["build", "Build course"],
  ["saved", "Saved course"],
  ["settings", "Settings"]
];
/* the tabs that start a race, and so carry the rules, the seats and the button */
const RACING = ["quick", "multi", "saved"];
const ANY = "quick:*";
/* what each book is, in a line, under the buttons that choose it -- the author's words */
const RULESET_BLURB = {
  classic: "The original Rally game. Limited respawns, Option Cards instead of Energy, original deck mechanics. Killing the competition is a valid strategy.",
  modern: "2016+ rules. Unlimited lives, SPAM and Haywire damage, Energy and Upgrades, new deck mechanics. Longer games with more potential for chaotic scrums."
};

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* no storage */ } }
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }

/** Courses saved from the workshop in this browser, as validated documents. */
function workshopCourses(library) {
  const out = [];
  const all = read(WORKSHOP_KEY, {});
  for (const id of Object.keys(all).sort()) {
    if (id.charAt(0) === "_" || !all[id].doc) continue;
    /* a course flattened in the workshop carries its one board along: it joins the library so the course reads */
    if (all[id].board) {
      try {
        const d = sink();
        const b = boardFromDocument(JSON.parse(all[id].board), d);
        if (b && !d.items.some(x => x.severity === "error")) library.set(b.id, b);
      } catch (e) { /* the course will not read, and is skipped below */ }
    }
    try { out.push({ id, doc: readCourse(all[id].doc, library, id), mine: true, saved: all[id].saved || 0 }); } catch (e) { /* not raceable */ }
  }
  /* yours first and the most recent first: the course you just made is the one you are here to race */
  return out.sort((a, b) => b.saved - a.saved);
}

/** Take a course saved from the workshop out of this browser's library. */
function forgetCourse(id) {
  const all = read(WORKSHOP_KEY, {});
  delete all[id];
  store(WORKSHOP_KEY, all);
}

/* the workshop sits beside the game whichever page mounted it */
const workshopHref = new URL("../../editor/index.html#course", import.meta.url).href;

/** The settings as saved, brought up to this screen's shape. */
function loadPrefs() {
  const prefs = read(SETUP_KEY, { course: null, ruleset: "classic", seats: [{ seat: "human", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }], house: {} });
  if (prefs.ruleset !== "modern") prefs.ruleset = "classic";
  if (!prefs.quick || !Number.isInteger(prefs.quick.boards)) prefs.quick = { boards: 2, flags: quickDefaultFlags(2) };
  delete prefs.quick.unverified;                                   // the knob that let unverified boards into the draw; there are none
  /* before the tabs, one `course` field held a quick game, a draw or a saved
   * course, and the boards knob decided which kind of quick game; read it
   * into a mode once, and the board apart from the course */
  if (!MODES.some(([m]) => m === prefs.mode)) {
    const c = String(prefs.course || "");
    if (c.startsWith("quick:")) {
      prefs.mode = prefs.quick.boards > 1 ? "multi" : "quick";
      prefs.quick.board = c;
      prefs.course = null;
    } else prefs.mode = prefs.course ? "saved" : "quick";
  }
  if (typeof prefs.quick.board !== "string") prefs.quick.board = ANY;
  if (prefs.quick.boards < 1) prefs.quick.boards = 1;
  if (prefs.quick.boards > QUICK_MAX_BOARDS) prefs.quick.boards = QUICK_MAX_BOARDS;
  return prefs;
}

export function mountSetup(root, { library, index, courses, onStart, onResume, initialCourse }) {
  const prefs = loadPrefs();
  const clampFlags = () => { const [lo, hi] = quickFlagRange(prefs.quick.boards); prefs.quick.flags = Math.min(hi, Math.max(lo, prefs.quick.flags | 0)); };
  clampFlags();
  if (initialCourse) { prefs.mode = "saved"; prefs.course = initialCourse; }   // the workshop's Play button names a course
  const shelf = [];
  for (const row of index.courses) {
    const doc = courses.get(row.id);
    if (!doc) continue;
    try { const d = readCourse(doc, library, row.id); shelf.push({ id: row.id, doc: d, kind: row.kind, blurb: row.blurb }); } catch (e) { /* skip a course that will not build */ }
  }
  const mine = workshopCourses(library).map(c => ({ id: c.id, doc: c.doc, kind: "mine", blurb: "Saved from the course workshop." }));
  shelf.unshift(...mine);
  /* the quick games: every board with enough marked flag locations, in the
   * palette's order -- less the blank template boards, which are for
   * building courses on, not racing on bare (issue #11) */
  const quick = [];
  for (const row of index.boards) {
    const b = library.get(row.id);
    if (!b || !canQuick(b, library) || isBlank(b)) continue;
    quick.push({ id: "quick:" + row.id, board: b, spots: quickSpots(b, library).length, unverified: !!row.unverified });
  }
  /* the boards a draw may pick: verified. Every board plays under either
   * book (issue #14), so the rules in force filter nothing. A quick course
   * stacks 12x12 boards only; a quick game on one board draws from the
   * whole shelf. A hand-picked board is the player's own choice. */
  const drawn = q => !q.unverified;
  const pool1 = () => quick.filter(drawn).map(q => q.board);
  const poolN = () => quick.filter(q => q.board.w === 12 && q.board.h === 12 && drawn(q)).map(q => q.board);
  /* what is no longer on the shelf is not what is picked */
  function settle() {
    if (prefs.quick.board !== ANY && !quick.some(q => q.id === prefs.quick.board)) prefs.quick.board = ANY;
    if (!shelf.some(c => c.id === prefs.course)) prefs.course = shelf.length ? shelf[0].id : null;
  }
  settle();

  /* thumbnails are drawn once per ruleset: the markings shown are the ones that edition reads */
  const thumbs = new Map();
  function thumb(key, grid) {
    const k = key + ":" + prefs.ruleset;
    if (!thumbs.has(k)) thumbs.set(k, boardSVG(grid, { mode: "art", background: true, sites: prefs.ruleset, flagspots: false }));
    return thumbs.get(k);
  }
  const flagWord = () => prefs.ruleset === "modern" ? "checkpoints" : "flags";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  /* --- the tabs ------------------------------------------------------------- */

  function quickTab() {
    const drawable = pool1().length;
    let html = "<p class='lead'>One board over the docking bay, laid at a random facing, with " + QUICK_FLAGS + " " + flagWord() +
      " drawn from the locations it marks. Pick the board, or let the draw. A fresh draw every start.</p>";
    html += "<div class='courses'>";
    html += '<button class="course any" data-board="' + ANY + '" aria-label="Any board" aria-pressed="' + (prefs.quick.board === ANY) + '"' + (drawable ? "" : " disabled") + '>' +
      '<span class="name">Any board</span><span class="meta">drawn from ' + drawable + " at random</span></button>";
    for (const q of quick) {
      html += '<button class="course" data-board="' + esc(q.id) + '" aria-label="' + esc(q.board.name) + '" aria-pressed="' + (prefs.quick.board === q.id) + '">' +
        thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + "</span>" +
        '<span class="meta">' + q.board.w + "&times;" + q.board.h + " &middot; " + q.spots + " flag locations" +
        (q.unverified ? " &middot; unverified" : "") + "</span></button>";
    }
    return html + "</div>";
  }

  /** The most boards a quick course can draw under these rules. */
  const mostBoards = () => Math.min(QUICK_MAX_BOARDS, poolN().length);
  function multiLead() {
    const n = prefs.quick.boards;
    return (n === 1 ? "One board" : n + " boards") + " drawn and " + (n === 1 ? "laid" : "stacked") + " over the docking bay, " +
      (n === 1 ? "at" : "each at") + " a random facing, with " + (n === 1 ? plural(prefs.quick.flags, flagWord().replace(/s$/, "")) + " drawn from where it marks" :
      "a route of " + flagWord() + " through them: at least one a board, the rest handed out in turn") + ". A fresh draw every start.";
  }
  /* a slider with the number beside it, and the number can be typed */
  function slider(key, label, lo, hi, value, note) {
    const off = hi < lo;
    return "<div class='row'><label for='slide-" + key + "'>" + label + "</label>" +
      '<input type="range" id="slide-' + key + '" data-slide="' + key + '" min="' + lo + '" max="' + Math.max(lo, hi) + '" value="' + value + '"' + (off ? " disabled" : "") + ">" +
      '<input type="number" data-num="' + key + '" min="' + lo + '" max="' + Math.max(lo, hi) + '" value="' + value + '" aria-label="' + label + '"' + (off ? " disabled" : "") + ">" +
      '<span class="keys" data-note="' + key + '">' + note + "</span></div>";
  }
  const boardsNote = () => { const m = mostBoards(); return m ? "1 to " + m + ": drawn from the " + plural(poolN().length, "12&times;12 board") + " on the shelf" : "No 12&times;12 board to draw from."; };
  const flagsNote = () => { const [lo, hi] = quickFlagRange(prefs.quick.boards); return lo + " to " + hi + ": at least one a board, three at most"; };
  function multiTab() {
    const [lo, hi] = quickFlagRange(prefs.quick.boards);
    return "<p class='lead'>" + multiLead() + "</p>" +
      slider("boards", "Boards", 1, mostBoards(), prefs.quick.boards, boardsNote()) +
      slider("flags", cap(flagWord()), lo, hi, prefs.quick.flags, flagsNote());
  }

  function buildTab() {
    return "<p class='lead'>The course workshop lays boards out on the floor: drag them in, turn them, put the " + flagWord() + " where you want them, " +
      "and edit any board square by square, or the whole course as one board. Save it and it appears under Saved course, ready to race.</p>" +
      '<div class="row"><a class="primary" href="' + esc(workshopHref) + '" role="button" style="display:inline-block;padding:8px 14px;border:1px solid var(--accent);border-radius:3px;color:var(--accent);text-decoration:none">Open the course workshop &rarr;</a>' +
      "<span class='keys'>Opens in this tab. Save the course there, come back here, and it is under Saved course.</span></div>";
  }

  function savedTab() {
    let html = "<p class='lead'>Every course the box prints, and every course you saved from the workshop, most recent first.</p>";
    if (!shelf.length) return html + "<p class='keys'>Nothing on the shelf yet.</p>";
    html += "<div class='courses'>";
    for (const c of shelf) {
      const boards = c.doc.stamps.filter(s => s.role !== "dock").length;
      /* a course of yours can be taken out of the library; a shipped one cannot, so it gets no button */
      html += (c.kind === "mine" ? '<div class="tile">' : "") +
        '<button class="course" data-course="' + esc(c.id) + '" aria-label="' + esc(c.doc.name) + '" aria-pressed="' + (prefs.course === c.id) + '">' +
        thumb(c.id, assemble(c.doc, library).grid) + '<span class="name">' + esc(c.doc.name) + "</span>" +
        '<span class="meta">' + esc(c.kind === "mine" ? "yours" : c.kind) + " &middot; " + plural(boards, "board") +
        " &middot; " + (c.doc.flags || []).length + " " + flagWord() + "</span></button>" +
        (c.kind === "mine" ? '<button class="forget" data-forget="' + esc(c.id) + '" title="Delete this course from the library" aria-label="Delete ' + esc(c.doc.name) + '">&times;</button></div>' : "");
    }
    return html + "</div>";
  }

  /* the house rules, each on a line with what it does. The keys are the
   * engine's (state.js reads them into st.house); the explanations are
   * what the engine actually does with each, not what a book says. */
  const HOUSE = [
    ["bumpers", "Bumpers", "A rail round the whole course. Nothing can be driven, pushed or carried off the edge of the floor: a robot that would leave it stops at the rail instead. Pits are still pits."],
    ["flagTouch", "Crossing a flag counts", "The Euro rule. A robot touches a flag on any square it moves through during a register, not only the one it ends the register on. The English book wants you to end on it."],
    ["humanPrivilege", "Human privilege", "The people at the keyboard pick their docking bays before the bots do, whatever priority everyone drew."]
  ];
  function settingsTab() {
    let html = "<p class='lead'>House rules, remembered between visits along with everything else on this screen.</p>";
    html += "<h2>House rules</h2><div class='rules'>";
    for (const [k, label, what] of HOUSE) {
      html += '<label class="rule"><input type="checkbox" data-house="' + k + '"' + (prefs.house[k] ? " checked" : "") + "><b>" + label + "</b><span class='keys'>" + esc(what) + "</span></label>";
    }
    html += '<label class="rule"><select data-house-n="startOptions" aria-label="Starting options">' +
      [0, 1, 2, 3].map(n => '<option value="' + n + '"' + ((prefs.house.startOptions | 0) === n ? " selected" : "") + ">" + n + "</option>").join("") +
      "</select><b>Starting options</b><span class='keys'>Classic rules only. Option cards dealt to everyone before the first turn. The printed route hands one out in about one game in fifty: a two-wrench site, taken instead of two points of repair.</span></label>";
    html += "</div><p class='keys'>Under the 2016 rules every robot starts on 3 Energy with 3 upgrade cards, a robot that falls reboots at its last checkpoint, and the Priority Token starts with seat 1; none of that is a setting.</p>";
    /* issue #6: everything this browser remembers, gone in one press. Not
     * a per-key list, because a key added later would be a key this missed:
     * the saved race, these settings, the mats' preferences, the speed, the
     * workshop's autosave and its libraries of courses -- all of it. */
    html += "<h2>Storage</h2><div class='row'><button data-act='reset'>Forget everything</button>" +
      "<span class='keys'>Clears everything PumaRally keeps in this browser: the saved race, these settings, your courses, the workshop's autosave.</span></div>";
    return html;
  }

  /** Can the Start button start something, under this tab? */
  function startable() {
    if (prefs.mode === "quick") return prefs.quick.board === ANY ? pool1().length > 0 : quick.some(q => q.id === prefs.quick.board);
    if (prefs.mode === "multi") return poolN().length >= prefs.quick.boards;
    if (prefs.mode === "saved") return shelf.some(c => c.id === prefs.course);
    return false;
  }

  function render() {
    let html = '<div class="setup"><div class="row"><h1>PumaRally</h1><span class="grow"></span>' +
      (onResume ? '<button data-act="resume">Back to the race</button>' : "") + "</div>";

    html += '<div class="tabs" role="tablist" aria-label="How the course comes about">';
    for (const [m, label] of MODES) {
      html += '<button role="tab" id="tab-' + m + '" data-mode="' + m + '" aria-selected="' + (prefs.mode === m) + '" aria-controls="panel-' + m + '" tabindex="' + (prefs.mode === m ? 0 : -1) + '">' + label + "</button>";
    }
    html += "</div>";
    html += '<div class="tab" role="tabpanel" id="panel-' + prefs.mode + '" aria-labelledby="tab-' + prefs.mode + '">' +
      (prefs.mode === "quick" ? quickTab() : prefs.mode === "multi" ? multiTab() : prefs.mode === "build" ? buildTab() : prefs.mode === "saved" ? savedTab() : settingsTab()) + "</div>";

    /* the tabs that start a race carry the rules and the seats; the workshop
     * takes both from the race it comes back to, and the settings are not a race */
    if (RACING.includes(prefs.mode)) {
      html += "<h2>Rules</h2><div class='row'>";
      /* every board plays under either book (issue #14): the choice is which rules, never which boards */
      for (const id of ["classic", "modern"]) {
        const r = rulesetFor(id);
        html += '<button data-ruleset="' + id + '" aria-pressed="' + (prefs.ruleset === id) + '">' +
          esc(r.name) + " <span class='keys'>" + esc(r.years) + "</span></button>";
      }
      html += "</div><p class='lead blurb'>" + esc(RULESET_BLURB[prefs.ruleset]) + "</p>";

      html += "<h2>Seats</h2><div class='seats'>";
      /* the swatch is the colour the seat will get: the first human is Coolant, the rest fill in order */
      const liveries = assignLiveries(prefs.seats);
      prefs.seats.forEach((s, i) => {
        const liv = LIVERIES[liveries[i]];
        html += '<div class="seat"><span>' + (i + 1) + '</span><span class="sw" style="background:' + liv.a + '"></span>' +
          '<select data-seat="' + i + '" aria-label="Seat ' + (i + 1) + '"><option value="human"' + (s.seat === "human" ? " selected" : "") + '>Human</option>' +
          '<option value="bot"' + (s.seat === "bot" ? " selected" : "") + '>Bot</option></select>' +
          '<select data-skill="' + i + '" aria-label="Seat ' + (i + 1) + ' skill"' + (s.seat === "bot" ? "" : " disabled") + '>' +
          [["0", "easy"], ["1", "normal"], ["2", "hard"]].map(([v, l]) => '<option value="' + v + '"' + (String(s.skill) === v ? " selected" : "") + ">" + l + "</option>").join("") +
          '</select><button data-drop="' + i + '"' + (prefs.seats.length > 1 ? "" : " disabled") + '>Remove</button></div>';
      });
      html += "</div><div class='row'><button data-act='add'" + (prefs.seats.length >= 8 ? " disabled" : "") + ">Add a seat</button>" +
        '<span class="keys">' + prefs.seats.filter(s => s.seat === "human").length + " human, " + prefs.seats.filter(s => s.seat === "bot").length + " bots. Any mix from one to eight.</span></div>";

      html += "<div class='row'><button class='primary' data-act='start'" + (startable() ? "" : " disabled") + ">Start the race</button></div>";
    }
    root.innerHTML = html + "</div>";
  }

  /** The course this tab starts: a saved document, or a fresh draw. Throws when the draw cannot be met. */
  function courseToStart() {
    if (prefs.mode === "saved") {
      const c = shelf.find(x => x.id === prefs.course);
      return c ? c.doc : null;
    }
    if (prefs.mode === "quick") {
      const q = quick.find(x => x.id === prefs.quick.board);
      const board = q ? q.board : pool1()[Math.floor(Math.random() * pool1().length)];
      if (!board) return null;
      return readCourse(quickCourse(board, library), library);
    }
    if (prefs.mode === "multi") return readCourse(quickMulti(poolN(), prefs.quick.boards, prefs.quick.flags, library), library);
    return null;
  }

  root.onclick = ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.mode) { prefs.mode = d.mode; store(SETUP_KEY, prefs); render(); root.querySelector('[role="tab"][aria-selected="true"]').focus(); return; }
    if (d.ruleset) { prefs.ruleset = d.ruleset; settle(); store(SETUP_KEY, prefs); render(); return; }
    if (d.board) { prefs.quick.board = d.board; store(SETUP_KEY, prefs); render(); return; }
    if (d.course) { prefs.course = d.course; store(SETUP_KEY, prefs); render(); return; }
    if (d.drop !== undefined) { prefs.seats.splice(+d.drop, 1); store(SETUP_KEY, prefs); render(); return; }
    if (d.act === "add" && prefs.seats.length < 8) { prefs.seats.push({ seat: "bot", skill: 1 }); store(SETUP_KEY, prefs); render(); return; }
    if (d.act === "resume" && onResume) { onResume(); return; }
    if (d.forget !== undefined) {
      const c = shelf.find(x => x.id === d.forget && x.kind === "mine");
      if (!c || !window.confirm("Delete " + c.doc.name + " from the library? This cannot be undone.")) return;
      forgetCourse(d.forget);
      shelf.splice(shelf.indexOf(c), 1);
      settle();
      store(SETUP_KEY, prefs);
      render();
      return;
    }
    if (d.act === "reset") {
      if (!window.confirm("Forget everything PumaRally has saved in this browser -- the race in progress, these settings, every course you saved, the workshop's autosave? This cannot be undone.")) return;
      try { localStorage.clear(); } catch (e) { /* no storage */ }
      try { sessionStorage.clear(); } catch (e) { /* no storage */ }
      location.reload();
      return;
    }
    if (d.act === "start") {
      if (!startable()) return;
      store(SETUP_KEY, prefs);
      /* a quick game is drawn now, and the draw is the course the save carries */
      let course;
      try { course = courseToStart(); } catch (e) {
        window.alert("The quick game could not be drawn: " + e.message);
        return;
      }
      if (!course) return;
      onStart({ course, seats: prefs.seats.map(s => ({ seat: s.seat, skill: +s.skill })), house: { ...prefs.house }, ruleset: prefs.ruleset });
    }
  };
  /* the tabs take the arrow keys, as a tablist does */
  root.onkeydown = ev => {
    const t = ev.target.closest('[role="tab"]');
    if (!t || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End")) return;
    const i = MODES.findIndex(([m]) => m === prefs.mode);
    const j = ev.key === "Home" ? 0 : ev.key === "End" ? MODES.length - 1 : (i + (ev.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length;
    ev.preventDefault();
    prefs.mode = MODES[j][0];
    store(SETUP_KEY, prefs); render();
    root.querySelector('[role="tab"][aria-selected="true"]').focus();
  };
  /* a slider or its number sets the knob; the flags' range follows the
   * boards (one a board to three a board) and the count is clamped into it */
  function setKnob(key, value) {
    const [lo, hi] = key === "boards" ? [1, mostBoards()] : quickFlagRange(prefs.quick.boards);
    prefs.quick[key] = Math.min(Math.max(lo, hi), Math.max(lo, Math.round(+value) || lo));
    clampFlags();
    store(SETUP_KEY, prefs);
  }
  /* while a slider is dragged the screen is patched in place, not redrawn:
   * redrawing would take the thumb out from under the pointer */
  root.oninput = ev => {
    const t = ev.target;
    if (t.dataset.slide === undefined) return;
    setKnob(t.dataset.slide, t.value);
    const [lo, hi] = quickFlagRange(prefs.quick.boards);
    for (const el of root.querySelectorAll('[data-slide="flags"], [data-num="flags"]')) { el.min = lo; el.max = hi; el.value = prefs.quick.flags; }
    for (const el of root.querySelectorAll('[data-slide="boards"], [data-num="boards"]')) el.value = prefs.quick.boards;
    root.querySelector('[data-note="flags"]').textContent = flagsNote();
    root.querySelector(".lead").textContent = multiLead();
  };
  root.onchange = ev => {
    const t = ev.target;
    if (t.dataset.slide !== undefined || t.dataset.num !== undefined) { setKnob(t.dataset.slide || t.dataset.num, t.value); render(); }
    else if (t.dataset.seat !== undefined) { prefs.seats[+t.dataset.seat].seat = t.value; store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.skill !== undefined) { prefs.seats[+t.dataset.skill].skill = +t.value; store(SETUP_KEY, prefs); }
    else if (t.dataset.house !== undefined) { prefs.house[t.dataset.house] = t.checked; store(SETUP_KEY, prefs); }
    else if (t.dataset.houseN !== undefined) { prefs.house[t.dataset.houseN] = +t.value; store(SETUP_KEY, prefs); }
  };
  render();
}
