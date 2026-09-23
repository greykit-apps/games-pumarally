/* Setting up a race: how the course comes about, the rules, the seats, the
 * house rules.
 *
 * Four ways in, as four tabs (issue #12):
 *
 *   Quick game    one board -- picked off the shelf, or drawn -- laid at a
 *                 random facing over the docking bay, three flags drawn from
 *                 the locations it marks (game/engine/quick.js)
 *   Quick course  N boards and F flags, all drawn: 12x12 boards the ruleset
 *                 reads, stacked as the box stacks them, a route of flags
 *                 through them (quickMulti)
 *   Build course  the course workshop, where boards are dragged in, turned,
 *                 flagged, edited square by square, and saved; a saved course
 *                 comes back here under Saved course
 *   Saved course  the shelf: every shipped course, and every course saved
 *                 from the workshop in this browser, with a delete on yours
 *
 * The rules, the seats and the house rules sit under whichever tab is open
 * and do not move when a knob is turned. Seats are any count from one to
 * eight and any mix of humans and bots.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse, rulesetsFor } from "../engine/library.js";
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
  ["saved", "Saved course"]
];
const ANY = "quick:*";

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
  if (!prefs.quick || !Number.isInteger(prefs.quick.boards)) prefs.quick = { boards: 2, flags: quickDefaultFlags(2), unverified: false };
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
    try { const d = readCourse(doc, library, row.id); shelf.push({ id: row.id, doc: d, kind: row.kind, blurb: row.blurb, reads: rulesetsFor(d, library) }); } catch (e) { /* skip a course that will not build */ }
  }
  const mine = workshopCourses(library).map(c => ({ id: c.id, doc: c.doc, kind: "mine", blurb: "Saved from the course workshop.", reads: rulesetsFor(c.doc, library) }));
  shelf.unshift(...mine);
  /* the quick games: every board with enough marked flag locations, in the
   * palette's order -- less the blank template boards, which are for
   * building courses on, not racing on bare (issue #11) */
  const quick = [];
  for (const row of index.boards) {
    const b = library.get(row.id);
    if (!b || !canQuick(b, library) || isBlank(b)) continue;
    quick.push({ id: "quick:" + row.id, board: b, spots: quickSpots(b, library).length, unverified: !!row.unverified,
      reads: rulesetsFor({ stamps: [{ board: row.id }, { board: DOCK_BOARD }] }, library) });
  }
  /* the boards a draw may pick: verified unless asked, and read by the
   * ruleset in force. A quick course stacks 12x12 boards only; a quick game
   * on one board draws from the whole shelf. A hand-picked board is the
   * player's own choice and is not filtered the same way. */
  const drawn = q => (!q.unverified || prefs.quick.unverified) && q.reads.includes(prefs.ruleset);
  const pool1 = () => quick.filter(drawn).map(q => q.board);
  const poolN = () => quick.filter(q => q.board.w === 12 && q.board.h === 12 && drawn(q)).map(q => q.board);
  const readable = () => shelf.filter(c => c.reads.includes(prefs.ruleset));
  /* what the ruleset cannot read is not what is picked */
  function settle() {
    if (prefs.quick.board !== ANY && !quick.some(q => q.id === prefs.quick.board && q.reads.includes(prefs.ruleset))) prefs.quick.board = ANY;
    if (!readable().some(c => c.id === prefs.course)) prefs.course = readable().length ? readable()[0].id : null;
  }
  settle();

  /* thumbnails are drawn once per ruleset: the markings shown are the ones that edition reads */
  const thumbs = new Map();
  function thumb(key, grid) {
    const k = key + ":" + prefs.ruleset;
    if (!thumbs.has(k)) thumbs.set(k, boardSVG(grid, { mode: "art", background: true, sites: prefs.ruleset, flagspots: false }));
    return thumbs.get(k);
  }
  const notRead = reads => ' disabled title="' + esc("Its boards print things only the " + (reads[0] ? rulesetFor(reads[0]).name : "other") + " book reads.") + '"';
  const onlyRead = reads => " &middot; " + esc(reads.length ? rulesetFor(reads[0]).name + " only" : "no book reads it");
  const flagWord = () => prefs.ruleset === "modern" ? "checkpoints" : "flags";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  /* --- the tabs ------------------------------------------------------------- */

  function quickTab() {
    const drawable = pool1().length;
    let html = "<p class='lead'>One board over the docking bay, laid at a random facing, with " + QUICK_FLAGS + " " + flagWord() +
      " drawn from the locations it marks. Pick the board, or let the draw. A fresh draw every start.</p>";
    html += unverifiedBox();
    html += "<div class='courses'>";
    html += '<button class="course any" data-board="' + ANY + '" aria-label="Any board" aria-pressed="' + (prefs.quick.board === ANY) + '"' + (drawable ? "" : " disabled") + '>' +
      '<span class="name">Any board</span><span class="meta">drawn from ' + drawable + " at random</span></button>";
    for (const q of quick) {
      const ok = q.reads.includes(prefs.ruleset);
      html += '<button class="course" data-board="' + esc(q.id) + '" aria-label="' + esc(q.board.name) + '" aria-pressed="' + (prefs.quick.board === q.id) + '"' +
        (ok ? "" : notRead(q.reads)) + ">" + thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + "</span>" +
        '<span class="meta">' + q.board.w + "&times;" + q.board.h + " &middot; " + q.spots + " flag locations" +
        (q.unverified ? " &middot; unverified" : "") + (ok ? "" : onlyRead(q.reads)) + "</span></button>";
    }
    return html + "</div>";
  }

  function multiTab() {
    const n = prefs.quick.boards, [lo, hi] = quickFlagRange(n), drawable = poolN().length;
    let html = "<p class='lead'>" + (n === 1 ? "One board" : n + " boards") + " drawn and " + (n === 1 ? "laid" : "stacked") + " over the docking bay, " +
      (n === 1 ? "at" : "each at") + " a random facing, with " + (n === 1 ? plural(prefs.quick.flags, flagWord().replace(/s$/, "")) + " drawn from where it marks" :
      "a route of " + flagWord() + " through them: at least one a board, the rest handed out in turn") + ". A fresh draw every start.</p>";
    html += "<div class='row'><label>Boards</label>";
    for (let k = 1; k <= QUICK_MAX_BOARDS; k++) {
      html += '<button data-quick-boards="' + k + '" aria-pressed="' + (n === k) + '"' + (k > drawable ? ' disabled title="Only ' + plural(drawable, "board") + ' can be drawn under these rules."' : "") + ">" + k + "</button>";
    }
    html += "</div><div class='row'><label>" + cap(flagWord()) + "</label>" +
      '<button data-quick-flags="-1"' + (prefs.quick.flags <= lo ? " disabled" : "") + ' aria-label="one fewer">&minus;</button>' +
      '<b class="knob">' + prefs.quick.flags + "</b>" +
      '<button data-quick-flags="1"' + (prefs.quick.flags >= hi ? " disabled" : "") + ' aria-label="one more">+</button>' +
      '<span class="keys">' + lo + " to " + hi + ": at least one a board, three at most</span></div>";
    html += unverifiedBox();
    html += "<p class='keys'>Drawn from the " + plural(drawable, "12&times;12 board") + " the " + esc(rulesetFor(prefs.ruleset).name) + " book reads" +
      (prefs.quick.unverified ? "" : ", verified ones only") + ".</p>";
    return html;
  }

  function unverifiedBox() {
    return "<div class='row'><label title=\"A board nobody has checked against its photograph yet. Left out of the draw unless you say so.\"><input type=\"checkbox\" data-quick-unverified" +
      (prefs.quick.unverified ? " checked" : "") + "> Draw unverified boards too</label></div>";
  }

  function buildTab() {
    return "<p class='lead'>The course workshop lays boards out on the floor: drag them in, turn them, put the " + flagWord() + " where you want them, " +
      "and edit any board square by square, or the whole course as one board. Save it and it appears under Saved course, ready to race.</p>" +
      '<div class="row"><a class="primary" href="' + esc(workshopHref) + '" role="button" style="display:inline-block;padding:8px 14px;border:1px solid var(--accent);border-radius:3px;color:var(--accent);text-decoration:none">Open the course workshop &rarr;</a>' +
      "<span class='keys'>Opens in this tab; the workshop's Play button brings you back here.</span></div>";
  }

  function savedTab() {
    let html = "<p class='lead'>Every course the box prints, and every course you saved from the workshop, most recent first.</p>";
    if (!shelf.length) return html + "<p class='keys'>Nothing on the shelf yet.</p>";
    html += "<div class='courses'>";
    for (const c of shelf) {
      const ok = c.reads.includes(prefs.ruleset);
      const boards = c.doc.stamps.filter(s => s.role !== "dock").length;
      /* a course of yours can be taken out of the library; a shipped one cannot, so it gets no button */
      html += (c.kind === "mine" ? '<div class="tile">' : "") +
        '<button class="course" data-course="' + esc(c.id) + '" aria-label="' + esc(c.doc.name) + '" aria-pressed="' + (prefs.course === c.id) + '"' +
        (ok ? "" : notRead(c.reads)) + ">" + thumb(c.id, assemble(c.doc, library).grid) + '<span class="name">' + esc(c.doc.name) + "</span>" +
        '<span class="meta">' + esc(c.kind === "mine" ? "yours" : c.kind) + " &middot; " + plural(boards, "board") +
        " &middot; " + (c.doc.flags || []).length + " " + flagWord() + (ok ? "" : onlyRead(c.reads)) + "</span></button>" +
        (c.kind === "mine" ? '<button class="forget" data-forget="' + esc(c.id) + '" title="Delete this course from the library" aria-label="Delete ' + esc(c.doc.name) + '">&times;</button></div>' : "");
    }
    return html + "</div>";
  }

  /** Can the Start button start something, under this tab? */
  function startable() {
    if (prefs.mode === "quick") return prefs.quick.board === ANY ? pool1().length > 0 : quick.some(q => q.id === prefs.quick.board && q.reads.includes(prefs.ruleset));
    if (prefs.mode === "multi") return poolN().length >= prefs.quick.boards;
    if (prefs.mode === "saved") return readable().some(c => c.id === prefs.course);
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
      (prefs.mode === "quick" ? quickTab() : prefs.mode === "multi" ? multiTab() : prefs.mode === "build" ? buildTab() : savedTab()) + "</div>";

    /* the workshop takes the rules and the seats from the race it comes back to, so the build tab shows neither */
    if (prefs.mode !== "build") {
      html += "<h2>Rules</h2><div class='row'>";
      for (const id of ["classic", "modern"]) {
        const r = rulesetFor(id);
        html += '<button data-ruleset="' + id + '" aria-pressed="' + (prefs.ruleset === id) + '" title="' +
          esc(id === "classic" ? "The 1994 book: 84 priority cards, damage on a track, option cards, lives." : "The 2016 book: your own deck of twenty, SPAM, Energy and upgrades, reboots.") +
          '">' + esc(r.name) + " <span class='keys'>" + esc(r.years) + "</span></button>";
      }
      html += "</div>";

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

      html += "<h2>House rules</h2><div class='row'>";
      for (const [k, label, note] of [["bumpers", "Bumpers", "a rail round the course: nothing can be driven off it"],
        ["flagTouch", "Crossing a flag counts", "the Euro rule; the English book wants you to end a register on it"],
        ["humanPrivilege", "Human privilege", "the people at the keyboard pick their bays before the bots"]]) {
        html += '<label title="' + esc(note) + '"><input type="checkbox" data-house="' + k + '"' + (prefs.house[k] ? " checked" : "") + "> " + label + "</label>";
      }
      if (prefs.ruleset === "classic") {
        html += '<label title="Option cards dealt to everyone at the start. The printed route, a two-wrench site instead of two points of repair, hands one out in about one game in fifty.">Starting options ' +
          '<select data-house-n="startOptions">' + [0, 1, 2, 3].map(n => '<option value="' + n + '"' + ((prefs.house.startOptions | 0) === n ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>";
      } else {
        html += '<span class="keys">2016: every robot starts on 3 Energy with 3 upgrade cards; a robot that falls reboots at its last checkpoint; the Priority Token starts with seat 1.</span>';
      }
      html += "</div><div class='row'><button class='primary' data-act='start'" + (startable() ? "" : " disabled") + ">Start the race</button></div>";
    }

    /* issue #6: everything this browser remembers, gone in one press. Not
     * a per-key list, because a key added later would be a key this missed:
     * the saved race, these settings, the mats' preferences, the speed, the
     * workshop's autosave and its libraries of courses -- all of it. */
    html += "<h2>Storage</h2><div class='row'><button data-act='reset'>Forget everything</button>" +
      "<span class='keys'>Clears everything PumaRally keeps in this browser: the saved race, these settings, your courses, the workshop's autosave.</span></div></div>";
    root.innerHTML = html;
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
    if (d.quickBoards !== undefined) {
      prefs.quick.boards = +d.quickBoards;
      /* the default follows the boards until the knob is turned; the range always does */
      prefs.quick.flags = quickDefaultFlags(prefs.quick.boards);
      clampFlags();
      store(SETUP_KEY, prefs); render(); return;
    }
    if (d.quickFlags !== undefined) { prefs.quick.flags += +d.quickFlags; clampFlags(); store(SETUP_KEY, prefs); render(); return; }
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
  root.onchange = ev => {
    const t = ev.target;
    if (t.dataset.seat !== undefined) { prefs.seats[+t.dataset.seat].seat = t.value; store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.skill !== undefined) { prefs.seats[+t.dataset.skill].skill = +t.value; store(SETUP_KEY, prefs); }
    else if (t.dataset.house !== undefined) { prefs.house[t.dataset.house] = t.checked; store(SETUP_KEY, prefs); }
    else if (t.dataset.quickUnverified !== undefined) { prefs.quick.unverified = t.checked; settle(); store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.houseN !== undefined) { prefs.house[t.dataset.houseN] = +t.value; store(SETUP_KEY, prefs); }
  };
  render();
}
