/* Setting up a race: how the course comes about, the rules, the seats, the
 * house rules.
 *
 * Two columns under a row of mode tabs. The left column is a window onto
 * the boards or courses the mode offers, and it scrolls on its own; the
 * right column holds the rules, eight seats, the house rules and the Start
 * button, and does not scroll on a desktop. Three modes start a race, as
 * three tabs (issue #12):
 *
 *   Quick game    one board -- picked off the shelf, or drawn -- laid at a
 *                 random facing over the docking bay, three flags drawn from
 *                 the locations it marks (game/engine/quick.js)
 *   Quick course  N boards and F flags, all drawn: 12x12 boards stacked as
 *                 the box stacks them, a route of flags through them
 *                 (quickMulti)
 *   Saved course  the shelf: every shipped course, and every course saved
 *                 from the workshop in this browser, with a delete on yours
 *
 * Building a course is not a mode: the button to the right of the tabs
 * opens the course workshop, and a course saved there comes back here under
 * Saved course. The gear at the top right holds the one setting that is not
 * about a race, the button that forgets everything this browser keeps.
 *
 * Seats are eight rows, each Human, Bot or empty; the empty ones are
 * skipped when the race starts. Everything here is remembered between
 * visits, and the screen is patched in place wherever a change touches one
 * thing, so the map window keeps its scroll.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse } from "../engine/library.js";
import { LIVERIES, assignLiveries } from "../engine/state.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { SETS, setsByYear, setTitle } from "../../editor/rulesets/sets.js";
import { boardFromDocument } from "../../editor/lib/board.js";
import { sink } from "../../editor/validate/diagnostic.js";
import { quickCourse, quickMulti, quickSpots, canQuick, isBlank, quickFlagRange, quickDefaultFlags, QUICK_FLAGS, QUICK_MAX_BOARDS, DOCK_BOARD } from "../engine/quick.js";

const SETUP_KEY = "pumarally_setup_v2";
const WORKSHOP_KEY = "pumarally_courses_v1";

const MODES = [
  ["quick", "Quick game"],
  ["multi", "Quick course"],
  ["saved", "Saved course"]
];
const ANY = "quick:*";
/* the seat rows on the screen; a race takes the ones that are filled */
const SLOTS = 8;
const SEAT_KINDS = ["human", "bot", "empty"];
/* what each book is, in a line, under the buttons that choose it -- the author's words */
const RULESET_BLURB = {
  classic: "The original Rally game. Limited respawns, Option Cards instead of Energy, original deck mechanics. Killing the competition is a valid strategy.",
  modern: "2016+ rules. Unlimited lives, SPAM and Haywire damage, Energy and Upgrades, new deck mechanics. Longer games with more potential for chaotic scrums."
};

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* no storage */ } }
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }

/* "Forget everything" (issue #6): every key PumaRally owns, found by its prefix
   so a key added later is not one this misses -- and only those. Every game on
   greykit.com shares one origin, and so one localStorage; clear() would wipe
   the other games' saves too. */
export function forgetEverything() {
  for (const area of ["localStorage", "sessionStorage"]) {
    try {
      const s = window[area];
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k && k.startsWith("pumarally")) s.removeItem(k);
      }
    } catch (e) { /* no storage */ }
  }
}

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
   * into a mode once, and the board apart from the course. The Build and
   * Settings tabs are gone (a button and a gear now), so a screen left on
   * either opens on a quick game. */
  if (!MODES.some(([m]) => m === prefs.mode)) {
    const c = String(prefs.course || "");
    if (c.startsWith("quick:")) {
      prefs.mode = prefs.quick.boards > 1 ? "multi" : "quick";
      prefs.quick.board = c;
      prefs.course = null;
    } else prefs.mode = prefs.course ? "saved" : "quick";
  }
  if (typeof prefs.quick.board !== "string") prefs.quick.board = ANY;
  /* the boards left out of a quick course's draw, by the player: kept as the
   * ones turned off, so a board that joins the shelf later is in the draw */
  if (!Array.isArray(prefs.quick.off)) prefs.quick.off = [];
  prefs.quick.off = prefs.quick.off.filter(x => typeof x === "string");
  if (prefs.quick.boards < 1) prefs.quick.boards = 1;
  if (prefs.quick.boards > QUICK_MAX_BOARDS) prefs.quick.boards = QUICK_MAX_BOARDS;
  /* eight seat rows, always: the seats saved before there were empty rows
   * were the filled ones, in order, so they take the first rows */
  if (!Array.isArray(prefs.seats)) prefs.seats = [];
  prefs.seats = prefs.seats.slice(0, SLOTS).map(s => ({ seat: SEAT_KINDS.includes(s && s.seat) ? s.seat : "empty", skill: [0, 1, 2].includes(s && +s.skill) ? +s.skill : 1 }));
  while (prefs.seats.length < SLOTS) prefs.seats.push({ seat: "empty", skill: 1 });
  return prefs;
}

/** What a race can be started from, under these settings: the shelf of
 * courses, the boards a quick game may use, and the draw pools. Shared by the
 * setup screen and the title screen's New game, which starts a race from the
 * remembered setup without showing this screen. */
function racePlan(library, index, courses, prefs) {
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
   * building courses on, not racing on bare (issue #11), and less the
   * Master Builder boards, which are for laying custom courses with and
   * are not raced on their own */
  const quick = [];
  for (const row of index.boards) {
    const b = library.get(row.id);
    if (!b || !canQuick(b, library) || isBlank(b) || row.set === "masterBuilder") continue;
    quick.push({ id: "quick:" + row.id, board: b, spots: quickSpots(b, library).length, unverified: !!row.unverified, set: row.set });
  }
  /* the boards a draw may pick: verified. Every board plays under either
   * book (issue #14), so the rules in force filter nothing. A quick course
   * stacks 12x12 boards only; a quick game on one board draws from the
   * whole shelf. A hand-picked board is the player's own choice. */
  const drawn = q => !q.unverified;
  const pool1 = () => quick.filter(drawn).map(q => q.board);
  /* the boards a quick course may draw: every verified 12x12 one, less the
   * ones the player has turned off in the pool (a quick game on one board
   * is always the player's own pick, so the list does not reach it) */
  const stackable = q => q.board.w === 12 && q.board.h === 12 && drawn(q);
  const isOff = q => prefs.quick.off.includes(q.id);
  const poolAll = () => quick.filter(stackable);
  const poolN = () => poolAll().filter(q => !isOff(q)).map(q => q.board);
  /* what is no longer on the shelf is not what is picked */
  function settle() {
    if (prefs.quick.board !== ANY && !quick.some(q => q.id === prefs.quick.board)) prefs.quick.board = ANY;
    prefs.quick.off = prefs.quick.off.filter(id => quick.some(q => q.id === id && stackable(q)));
    if (!shelf.some(c => c.id === prefs.course)) prefs.course = shelf.length ? shelf[0].id : null;
  }
  /** Can the Start button start something, under this tab? */
  function startable() {
    if (!filled().length) return false;
    if (prefs.mode === "quick") return prefs.quick.board === ANY ? pool1().length > 0 : quick.some(q => q.id === prefs.quick.board);
    if (prefs.mode === "multi") return poolN().length >= prefs.quick.boards;
    if (prefs.mode === "saved") return shelf.some(c => c.id === prefs.course);
    return false;
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
  const filled = () => prefs.seats.filter(s => s.seat !== "empty");
  return { shelf, quick, pool1, poolAll, poolN, isOff, stackable, settle, startable, courseToStart, filled };
}

/** The options a race starts with, from the settings as they are saved. */
function raceOpts(prefs, plan, course) {
  return { course, seats: plan.filled().map(s => ({ seat: s.seat, skill: +s.skill })), house: { ...prefs.house }, ruleset: prefs.ruleset };
}

/** New game on the title screen: a race from the remembered setup -- the
 * same tab, board or course, seats and rules the Start button would use.
 * Null when that setup cannot start (nobody seated, a course since deleted),
 * so the caller opens the setup screen instead. Throws when a draw fails. */
export function quickStartOpts({ library, index, courses }) {
  const prefs = loadPrefs();
  const [lo, hi] = quickFlagRange(prefs.quick.boards);
  prefs.quick.flags = Math.min(hi, Math.max(lo, prefs.quick.flags | 0));
  const plan = racePlan(library, index, courses, prefs);
  plan.settle();
  if (!plan.startable()) return null;
  const course = plan.courseToStart();
  return course ? raceOpts(prefs, plan, course) : null;
}

export function mountSetup(root, { library, index, courses, onStart, onResume, onBack, initialCourse }) {
  const prefs = loadPrefs();
  const clampFlags = () => { const [lo, hi] = quickFlagRange(prefs.quick.boards); prefs.quick.flags = Math.min(hi, Math.max(lo, prefs.quick.flags | 0)); };
  clampFlags();
  if (initialCourse) { prefs.mode = "saved"; prefs.course = initialCourse; }   // the workshop's Play button names a course
  const plan = racePlan(library, index, courses, prefs);
  const { shelf, quick, pool1, poolAll, poolN, isOff, stackable, settle, startable, courseToStart, filled } = plan;
  settle();

  /* thumbnails are drawn once per ruleset: the markings shown are the ones that edition reads.
   * Each is shown as an image of the drawing rather than the drawing itself: a board is
   * over a thousand elements with blurred glows, and fifty of them inline made the shelves
   * stutter on every scroll. The drawing carries its own palette and styles, so the image
   * is identical, and the browser rasterizes it once. */
  const thumbs = new Map();
  function thumb(key, grid) {
    const k = key + ":" + prefs.ruleset;
    if (!thumbs.has(k)) {
      const svg = boardSVG(grid, { mode: "art", background: true, sites: prefs.ruleset, flagspots: false });
      /* its own proportions up front, so a tile holds its place before the image loads */
      const vb = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
      thumbs.set(k, { url: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), w: vb ? vb[1] : 1, h: vb ? vb[2] : 1 });
    }
    const t = thumbs.get(k);
    return '<img class="thumb" src="' + t.url + '" width="' + t.w + '" height="' + t.h + '" alt="" loading="lazy" decoding="async">';
  }
  const flagWord = () => prefs.ruleset === "modern" ? "checkpoints" : "flags";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  /* --- the map window, one per mode ---------------------------------------- */

  /* the shelves: boards grouped by the box they came out of, in the order
   * the boxes were released (setsByYear), each under a heading; a box with
   * nothing on the shelf gets no heading */
  /* each shelf is headed by its box and the year it came out, oldest first */
  const shelfName = id => setTitle(id);
  function shelves(list) {
    const order = setsByYear();
    const by = new Map();
    for (const q of list) { const k = order.includes(q.set) ? q.set : "?"; if (!by.has(k)) by.set(k, []); by.get(k).push(q); }
    return order.concat(["?"]).filter(k => by.has(k)).map(k => [shelfName(k), by.get(k), k]);
  }
  /* each shelf is a box of its own -- heading and tiles -- and the boxes pack
   * side by side (style.js, .shelved): a box too wide for what is left of a
   * row starts the next one whole, and its tiles wrap only when it is wider
   * than a row on its own */
  /* a box whose art has a colour washes its card in it (SETS[...].tint) */
  const shelfHTML = (list, tile) => shelves(list).map(([name, qs, id]) => {
    const tint = SETS[id] && SETS[id].tint;
    return "<section class='shelfbox" + (tint ? " tinted' style='--tint:" + tint : "") + "'><h2 class='shelf'>" + esc(name) + "</h2><div class='shelftiles'>" + qs.map(tile).join("") + "</div></section>";
  }).join("");

  function boardTile(q, pressed, pool) {
    /* the shelf is 12x12 boards only, so the size is not worth a tile's one line of meta */
    const meta = q.spots + " flag locations" + (q.unverified ? " &middot; unverified" : "");
    /* a pool tile is a toggle: lit, the board is in the draw; dimmed, it is left out */
    if (pool) return '<button class="course pool" data-pool="' + esc(q.id) + '" aria-pressed="' + pressed + '" aria-label="' + esc(q.board.name) + ' in the draw" title="' + esc(q.board.name) + ': click to ' + (pressed ? "leave out of" : "put back in") + ' the draw">' +
      thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + "</span></button>";
    return '<button class="course" data-board="' + esc(q.id) + '" aria-label="' + esc(q.board.name) + '" aria-pressed="' + pressed + '">' +
      thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + '</span><span class="meta">' + meta + "</span></button>";
  }

  function quickMap() {
    const drawable = pool1().length;
    let html = "<div class='win'><div class='courses shelved'>";
    html += '<button class="course any" data-board="' + ANY + '" aria-label="Any board" aria-pressed="' + (prefs.quick.board === ANY) + '"' + (drawable ? "" : " disabled") + '>' +
      '<span class="name">Any board</span><span class="meta">drawn from ' + drawable + " at random</span></button>";
    html += shelfHTML(quick, q => boardTile(q, prefs.quick.board === q.id, false));
    return html + "</div></div>";
  }

  /** The most boards a quick course can draw under these rules. */
  const mostBoards = () => Math.min(QUICK_MAX_BOARDS, poolN().length);
  /* a slider with the number beside it, and the number can be typed */
  function slider(key, label, lo, hi, value, note) {
    const off = hi < lo;
    return "<div class='row'><label for='slide-" + key + "'>" + label + "</label>" +
      '<input type="range" id="slide-' + key + '" data-slide="' + key + '" min="' + lo + '" max="' + Math.max(lo, hi) + '" value="' + value + '"' + (off ? " disabled" : "") + ">" +
      '<input type="number" data-num="' + key + '" min="' + lo + '" max="' + Math.max(lo, hi) + '" value="' + value + '" aria-label="' + label + '"' + (off ? " disabled" : "") + ">" +
      '<span class="keys" data-note="' + key + '">' + note + "</span></div>";
  }
  const boardsNote = () => { const m = mostBoards(); return m ? "1 to " + m + ": drawn from the " + plural(poolN().length, "12&times;12 board") + " in the pool" : "No board in the pool to draw from."; };
  const poolHeading = () => { const n = poolN().length, all = poolAll().length; return "The draw pool &middot; " + (n === all ? "" : n + " of ") + plural(all, "board"); };
  const flagsNote = () => { const [lo, hi] = quickFlagRange(prefs.quick.boards); return lo + " to " + hi + ": at least one a board, three at most"; };
  function multiMap() {
    const [lo, hi] = quickFlagRange(prefs.quick.boards);
    /* the pool is every board the draw may pick, each a toggle; the player's choices are remembered */
    return "<div class='knobs'>" + slider("boards", "Boards", 1, mostBoards(), prefs.quick.boards, boardsNote()) +
      slider("flags", cap(flagWord()), lo, hi, prefs.quick.flags, flagsNote()) + "</div>" +
      "<h2 data-pool-heading>" + poolHeading() + "</h2>" +
      "<div class='win'><div class='courses shelved small'>" + shelfHTML(poolAll(), q => boardTile(q, !isOff(q), true)) + "</div></div>";
  }

  function savedMap() {
    if (!shelf.length) return "<p class='keys'>Nothing on the shelf yet.</p>";
    let html = "<div class='win'><div class='courses wide'>";
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
    return html + "</div></div>";
  }

  /* --- the right column ---------------------------------------------------- */

  /* the house rules, each on a line with what it does behind the (i). The
   * keys are the engine's (state.js reads them into st.house); the
   * explanations are what the engine actually does with each, not what a
   * book says. */
  const HOUSE = [
    ["bumpers", "Bumpers", "A rail round the whole course. Nothing can be driven, pushed or carried off the edge of the floor: a robot that would leave it stops at the rail instead. Pits are still pits."],
    ["flagTouch", "Crossing a flag counts", "The Euro rule. A robot touches a flag on any square it moves through during a register, not only the one it ends the register on. The English book wants you to end on it."],
    ["humanPrivilege", "Human privilege", "The people at the keyboard pick their docking bays before the bots do, whatever priority everyone drew."]
  ];
  const START_OPTIONS = "Classic rules only. Option cards dealt to everyone before the first turn. The printed route hands one out in about one game in fifty: a two-wrench site, taken instead of two points of repair.";
  const info = what => '<span class="i" tabindex="0" role="note" aria-label="' + esc(what) + '" data-tip="' + esc(what) + '">i</span>';

  function sideHTML() {
    let html = "<div><h2>Rules</h2><div class='row rulesets'>";
    /* every board plays under either book (issue #14): the choice is which rules, never which boards */
    for (const id of ["classic", "modern"]) {
      const r = rulesetFor(id);
      html += '<button data-ruleset="' + id + '" aria-pressed="' + (prefs.ruleset === id) + '">' +
        esc(r.name) + " <span class='keys'>" + esc(r.years) + "</span></button>";
    }
    html += "</div><p class='blurb'>" + esc(RULESET_BLURB[prefs.ruleset]) + "</p></div>";

    html += "<div><h2>Seats</h2><div class='seats'>";
    /* the swatch is the colour the seat will get: the first human is Coolant,
     * the rest fill in order; an empty row has no colour, since it takes no seat */
    const liveries = assignLiveries(filled());
    let k = 0;
    prefs.seats.forEach((s, i) => {
      const empty = s.seat === "empty";
      const liv = empty ? null : LIVERIES[liveries[k++]];
      html += '<div class="seat' + (empty ? " empty" : "") + '"><span>' + (i + 1) + '</span><span class="sw"' + (liv ? ' style="background:' + liv.a + '"' : "") + '></span>' +
        '<select data-seat="' + i + '" aria-label="Seat ' + (i + 1) + '">' +
        [["human", "Human"], ["bot", "Bot"], ["empty", "— empty —"]].map(([v, l]) => '<option value="' + v + '"' + (s.seat === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>";
      html += s.seat === "bot" ? '<select data-skill="' + i + '" aria-label="Seat ' + (i + 1) + ' skill">' +
        [["0", "easy"], ["1", "normal"], ["2", "hard"]].map(([v, l]) => '<option value="' + v + '"' + (String(s.skill) === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" : "<span></span>";
      html += "</div>";
    });
    const humans = filled().filter(s => s.seat === "human").length, bots = filled().length - humans;
    html += "</div><p class='keys'>" + (filled().length ? plural(humans, "human") + ", " + plural(bots, "bot") + "." : "Nobody is seated.") + " Any mix from one to eight.</p></div>";

    html += "<div><h2>House rules</h2><div class='house'>";
    for (const [key, label, what] of HOUSE) {
      html += '<div class="hr"><label><input type="checkbox" data-house="' + key + '"' + (prefs.house[key] ? " checked" : "") + "> " + label + "</label>" + info(what) + "</div>";
    }
    html += '<div class="hr"><label><select data-house-n="startOptions" aria-label="Starting options">' +
      [0, 1, 2, 3].map(n => '<option value="' + n + '"' + ((prefs.house.startOptions | 0) === n ? " selected" : "") + ">" + n + "</option>").join("") +
      "</select> Starting options <span class='keys'>classic only</span></label>" + info(START_OPTIONS) + "</div>";
    html += "</div></div>";

    html += "<div class='start'><button class='primary' data-act='start'" + (startable() ? "" : " disabled") + ">Start the race</button></div>";
    return html;
  }


  /* --- drawing: the frame once, then each part on its own ------------------ */

  /* issue #6: everything this browser remembers, gone in one press. Not a
   * per-key list, because a key added later would be a key this missed:
   * the saved race, these settings, the mats' preferences, the speed, the
   * workshop's autosave and its libraries of courses -- all of it. */
  const POP = "<h2>Settings</h2><div class='row'><button data-act='reset'>Forget everything</button>" +
    "<span class='keys'>Clears everything PumaRally keeps in this browser: the saved race, these settings, your courses, the workshop's autosave.</span></div>";

  function frame() {
    let html = '<div class="setup"><div class="top">' + (onBack ? '<button data-act="back" aria-label="Back to the title screen">&larr;</button>' : "") +
      '<h1>PumaRally</h1><span class="grow"></span>' +
      (onResume ? '<button data-act="resume">Back to the race</button>' : "") +
      '<span class="gearwrap"><button data-act="gear" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false">&#9881;</button>' +
      '<div class="pop" role="dialog" aria-label="Settings" hidden>' + POP + "</div></span></div>";
    html += '<div class="modes"><div class="tabs" role="tablist" aria-label="How the course comes about">';
    for (const [m, label] of MODES) html += '<button role="tab" id="tab-' + m + '" data-mode="' + m + '" aria-controls="panel">' + label + "</button>";
    html += '</div><a class="build" href="' + esc(workshopHref) + '">Build a course &rarr;</a></div>';
    html += '<div class="body"><div class="map" role="tabpanel" id="panel"></div><div class="side"></div></div></div>';
    root.innerHTML = html;
  }
  const el = sel => root.querySelector(sel);

  function renderTabs() {
    for (const t of root.querySelectorAll('[role="tab"]')) {
      const on = t.dataset.mode === prefs.mode;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    }
    el("#panel").setAttribute("aria-labelledby", "tab-" + prefs.mode);
  }
  /* the window keeps its place per mode, so coming back to a tab lands where you left it */
  const scroll = {};
  function renderMap() {
    const map = el(".map");
    const win = map.querySelector(".win");
    if (win) scroll[map.dataset.mode] = win.scrollTop;
    map.dataset.mode = prefs.mode;
    map.innerHTML = prefs.mode === "quick" ? quickMap() : prefs.mode === "multi" ? multiMap() : savedMap();
    packShelves();
    const w = map.querySelector(".win");
    if (w && scroll[prefs.mode]) w.scrollTop = scroll[prefs.mode];
  }
  /* How many columns the window holds, and how many each shelf takes: all of
   * its boards when they fit on one line. Run on every render and whenever
   * the window changes width. */
  function packShelves() {
    for (const c of root.querySelectorAll(".courses.shelved")) {
      const small = c.classList.contains("small");
      /* the minimum widths the grid had before the shelves shared rows, so a tile is the size it always was */
      const min = small ? 72 : 112, gap = small ? 8 : 10;
      const cs = getComputedStyle(c);
      const width = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const cols = Math.max(1, Math.floor((width + gap) / (min + gap)));
      c.style.setProperty("--cols", cols);
      /* a shelf with more boards than a row holds is split evenly over the
       * lines it needs -- six in five columns is three and three, not five and
       * one -- which also leaves room beside it for the next shelf */
      /* and a heading longer than its boards are wide -- "Crash and Burn
       * (1997)" over two small tiles -- takes the columns it needs to be read */
      const colW = (width - gap * (cols - 1)) / cols;
      for (const s of c.querySelectorAll(".shelfbox")) {
        const n = s.querySelectorAll(".course").length;
        /* the text's own width: the heading's box is as wide as the shelf's
         * span, so measuring the box would keep a shelf as wide as it last was */
        const head = s.querySelector(".shelf");
        const range = document.createRange();
        range.selectNodeContents(head);
        const title = Math.ceil(range.getBoundingClientRect().width + parseFloat(getComputedStyle(head).paddingLeft));
        const need = Math.ceil((title + gap) / (colW + gap));
        s.style.setProperty("--span", Math.min(cols, Math.max(Math.ceil(n / Math.ceil(n / cols)), need)));
      }
    }
  }
  function renderSide() { el(".side").innerHTML = sideHTML(); }
  function syncStart() { el("[data-act=start]").disabled = !startable(); }
  function setMode(m) {
    prefs.mode = m;
    store(SETUP_KEY, prefs);
    renderTabs(); renderMap(); syncStart();
  }
  /** Every tile pressed or not, in place: a pick does not redraw the window. */
  function press(attr, value) {
    for (const b of root.querySelectorAll("button[data-" + attr + "]")) b.setAttribute("aria-pressed", b.dataset[attr] === value);
    store(SETUP_KEY, prefs);
    syncStart();
  }
  function openPop(open) {
    el(".pop").hidden = !open;
    el("[data-act=gear]").setAttribute("aria-expanded", open);
  }


  root.onclick = ev => {
    /* the settings pop-over closes on any click outside it */
    if (!el(".pop").hidden && !ev.target.closest(".gearwrap")) openPop(false);
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.mode) { setMode(d.mode); b.focus(); return; }
    if (d.ruleset) { prefs.ruleset = d.ruleset; settle(); store(SETUP_KEY, prefs); renderSide(); renderMap(); return; }
    if (d.board) { prefs.quick.board = d.board; press("board", d.board); return; }
    if (d.course) { prefs.course = d.course; press("course", d.course); return; }
    if (d.pool !== undefined) { togglePool(d.pool, b); return; }
    if (d.act === "gear") { openPop(el(".pop").hidden); return; }
    if (d.act === "resume" && onResume) { onResume(); return; }
    if (d.act === "back" && onBack) { onBack(); return; }
    if (d.forget !== undefined) {
      const c = shelf.find(x => x.id === d.forget && x.kind === "mine");
      if (!c || !window.confirm("Delete " + c.doc.name + " from the library? This cannot be undone.")) return;
      forgetCourse(d.forget);
      shelf.splice(shelf.indexOf(c), 1);
      settle();
      store(SETUP_KEY, prefs);
      renderMap(); syncStart();
      return;
    }
    if (d.act === "reset") {
      if (!window.confirm("Forget everything PumaRally has saved in this browser -- the race in progress, these settings, every course you saved, the workshop's autosave? This cannot be undone.")) return;
      forgetEverything();
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
      onStart(raceOpts(prefs, plan, course));
    }
  };
  /* the tabs take the arrow keys, as a tablist does; Escape closes the settings */
  root.onkeydown = ev => {
    if (ev.key === "Escape" && !el(".pop").hidden) { openPop(false); el("[data-act=gear]").focus(); return; }
    const t = ev.target.closest('[role="tab"]');
    if (!t || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End")) return;
    const i = MODES.findIndex(([m]) => m === prefs.mode);
    const j = ev.key === "Home" ? 0 : ev.key === "End" ? MODES.length - 1 : (i + (ev.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length;
    ev.preventDefault();
    setMode(MODES[j][0]);
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
  /* the knobs are patched in place, never redrawn: redrawing would take the
   * thumb out from under the pointer, and the pool below does not change */
  function patchKnobs() {
    const [lo, hi] = quickFlagRange(prefs.quick.boards);
    for (const e of root.querySelectorAll('[data-slide="flags"], [data-num="flags"]')) { e.min = lo; e.max = hi; e.value = prefs.quick.flags; }
    for (const e of root.querySelectorAll('[data-slide="boards"], [data-num="boards"]')) e.value = prefs.quick.boards;
    el('[data-note="flags"]').textContent = flagsNote();
    syncStart();
  }
  /** One board in or out of the draw: the tile, the heading and the boards knob follow, in place. */
  function togglePool(id, tile) {
    const q = quick.find(x => x.id === id);
    if (!q) return;
    const on = isOff(q);
    prefs.quick.off = on ? prefs.quick.off.filter(x => x !== id) : prefs.quick.off.concat([id]);
    tile.setAttribute("aria-pressed", on);
    tile.title = q.board.name + ": click to " + (on ? "leave out of" : "put back in") + " the draw";
    el("[data-pool-heading]").innerHTML = poolHeading();
    /* a course cannot draw more boards than are in the pool: the knob's ceiling moves, and the knob with it */
    const m = mostBoards();
    if (m && prefs.quick.boards > m) prefs.quick.boards = m;
    clampFlags();
    for (const e of root.querySelectorAll('[data-slide="boards"], [data-num="boards"]')) { e.max = Math.max(1, m); e.disabled = m < 1; }
    for (const e of root.querySelectorAll('[data-slide="flags"], [data-num="flags"]')) e.disabled = m < 1;
    el('[data-note="boards"]').innerHTML = boardsNote();
    store(SETUP_KEY, prefs);
    patchKnobs();
  }
  root.oninput = ev => {
    const t = ev.target;
    if (t.dataset.slide === undefined) return;
    setKnob(t.dataset.slide, t.value);
    patchKnobs();
  };
  root.onchange = ev => {
    const t = ev.target;
    if (t.dataset.slide !== undefined || t.dataset.num !== undefined) { setKnob(t.dataset.slide || t.dataset.num, t.value); patchKnobs(); }
    else if (t.dataset.seat !== undefined) { prefs.seats[+t.dataset.seat].seat = t.value; store(SETUP_KEY, prefs); renderSide(); }
    else if (t.dataset.skill !== undefined) { prefs.seats[+t.dataset.skill].skill = +t.value; store(SETUP_KEY, prefs); }
    else if (t.dataset.house !== undefined) { prefs.house[t.dataset.house] = t.checked; store(SETUP_KEY, prefs); }
    else if (t.dataset.houseN !== undefined) { prefs.house[t.dataset.houseN] = +t.value; store(SETUP_KEY, prefs); }
  };
  frame();
  renderTabs(); renderMap(); renderSide();
  /* the shelves repack whenever the window changes width */
  if (typeof ResizeObserver === "function") new ResizeObserver(packShelves).observe(el(".map"));
  else window.addEventListener("resize", packShelves);
  /* and once the web font is in: a heading measured in the fallback font is
   * wider, and would take columns it does not need */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(packShelves);
}
