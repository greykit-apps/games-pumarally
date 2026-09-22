/* Setting up a race: a course, the seats, the house rules.
 *
 * Seats are any count from one to eight and any mix of humans and bots: a
 * solo human with no opponents, all humans passing the keyboard, bots only,
 * or anything between. The course shelf is the workshop's: every shipped
 * course, and every course saved from the course workshop in this browser.
 * Before the shelf comes the quick game: N boards and F flags, drawn fresh
 * at every start (game/engine/quick.js) -- on one board, any board from the
 * palette or one drawn; on more, boards drawn from the verified 12x12 ones
 * and stacked as the box stacks them, with a route of flags through them.
 * The two knobs are the whole of the setup: there are no race types, since
 * anything else is a custom course, and the workshop makes those easy.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse, rulesetsFor } from "../engine/library.js";
import { LIVERIES } from "../engine/state.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { boardFromDocument } from "../../editor/lib/board.js";
import { sink } from "../../editor/validate/diagnostic.js";
import { quickCourse, quickMulti, quickSpots, canQuick, quickFlagRange, quickDefaultFlags, QUICK_FLAGS, QUICK_MAX_BOARDS, DOCK_BOARD } from "../engine/quick.js";

const SETUP_KEY = "pumarally_setup_v2";
const WORKSHOP_KEY = "pumarally_courses_v1";

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

export function mountSetup(root, { library, index, courses, onStart, onResume, initialCourse }) {
  const prefs = read(SETUP_KEY, { course: null, ruleset: "classic", seats: [{ seat: "human", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }], house: {} });
  if (prefs.ruleset !== "modern") prefs.ruleset = "classic";
  /* the quick game's knobs: how many boards, how many flags, whether an unverified board may be drawn */
  if (!prefs.quick || !Number.isInteger(prefs.quick.boards)) prefs.quick = { boards: 1, flags: QUICK_FLAGS, unverified: false };
  const clampFlags = () => { const [lo, hi] = quickFlagRange(prefs.quick.boards); prefs.quick.flags = Math.min(hi, Math.max(lo, prefs.quick.flags | 0)); };
  clampFlags();
  if (initialCourse) prefs.course = initialCourse;                // the workshop's Play button names a course
  const shelf = [];
  for (const row of index.courses) {
    const doc = courses.get(row.id);
    if (!doc) continue;
    try { const d = readCourse(doc, library, row.id); shelf.push({ id: row.id, doc: d, kind: row.kind, blurb: row.blurb, reads: rulesetsFor(d, library) }); } catch (e) { /* skip a course that will not build */ }
  }
  const mine = workshopCourses(library).map(c => ({ id: c.id, doc: c.doc, kind: "mine", blurb: "Saved from the course workshop.", reads: rulesetsFor(c.doc, library) }));
  shelf.unshift(...mine);
  /* the quick games: every board with enough marked flag locations, in the palette's order */
  const quick = [];
  for (const row of index.boards) {
    const b = library.get(row.id);
    if (!b) continue;
    const spots = quickSpots(b, library).length;
    if (spots < QUICK_FLAGS) continue;
    quick.push({ id: "quick:" + row.id, board: b, spots, unverified: !!row.unverified,
      reads: rulesetsFor({ stamps: [{ board: row.id }, { board: DOCK_BOARD }] }, library) });
  }
  /* the boards a random draw may pick: 12x12 so they stack, verified unless
   * asked, and read by the ruleset in force. A hand-picked board from the
   * palette is the player's own choice and is not filtered the same way. */
  const pool = () => quick.filter(q => q.board.w === 12 && q.board.h === 12 && (!q.unverified || prefs.quick.unverified) && q.reads.includes(prefs.ruleset)).map(q => q.board);
  const ANY = "quick:*";
  const playable = () => [{ id: ANY, reads: ["classic", "modern"] }].concat(quick, shelf).filter(c => c.reads.includes(prefs.ruleset));
  if (!playable().some(c => c.id === prefs.course)) prefs.course = ANY;
  if (prefs.quick.boards > 1) prefs.course = ANY;

  /* thumbnails are drawn once per ruleset: the markings shown are the ones that edition reads */
  const thumbs = new Map();
  function thumb(key, grid) {
    const k = key + ":" + prefs.ruleset;
    if (!thumbs.has(k)) thumbs.set(k, boardSVG(grid, { mode: "art", background: true, sites: prefs.ruleset, flagspots: false }));
    return thumbs.get(k);
  }
  const notRead = reads => ' disabled title="' + esc("Its boards print things only the " + (reads[0] ? rulesetFor(reads[0]).name : "other") + " book reads.") + '"';
  const onlyRead = reads => " &middot; " + esc(reads.length ? rulesetFor(reads[0]).name + " only" : "no book reads it");

  function render() {
    let html = '<div class="setup"><div class="row"><h1>PumaRally</h1><span class="grow"></span>' +
      (onResume ? '<button data-act="resume">Back to the race</button>' : "") +
      '<a href="' + esc(workshopHref) + '" style="color:var(--accent)">Course workshop &rarr;</a></div>';
    html += "<h2>Rules</h2><div class='row'>";
    for (const id of ["classic", "modern"]) {
      const r = rulesetFor(id);
      html += '<button data-ruleset="' + id + '" aria-pressed="' + (prefs.ruleset === id) + '" title="' +
        esc(id === "classic" ? "The 1994 book: 84 priority cards, damage on a track, option cards, lives." : "The 2016 book: your own deck of twenty, SPAM, Energy and upgrades, reboots.") +
        '">' + esc(r.name) + " <span class='keys'>" + esc(r.years) + "</span></button>";
    }
    html += "</div>";
    const flagWord = prefs.ruleset === "modern" ? "checkpoints" : "flags";
    const n = prefs.quick.boards, [lo, hi] = quickFlagRange(n), drawable = pool().length;
    html += "<h2>Quick game</h2><p class='keys'>" + (n === 1
      ? "One board over the docking bay, laid at a random facing, with the " + flagWord + " drawn from the locations it marks. A fresh draw every start."
      : n + " boards drawn and stacked over the docking bay, each at a random facing, with a route of " + flagWord + " through them: at least one a board, the rest handed out in turn. A fresh draw every start.") + "</p>";
    html += "<div class='row'><label>Boards</label>";
    for (let k = 1; k <= QUICK_MAX_BOARDS; k++) {
      html += '<button data-quick-boards="' + k + '" aria-pressed="' + (n === k) + '"' + (k > 1 && k > drawable ? ' disabled title="Only ' + drawable + ' board' + (drawable === 1 ? "" : "s") + ' can be drawn under these rules."' : "") + ">" + k + "</button>";
    }
    html += "</div><div class='row'><label>" + (flagWord.charAt(0).toUpperCase() + flagWord.slice(1)) + "</label>" +
      '<button data-quick-flags="-1"' + (prefs.quick.flags <= lo ? " disabled" : "") + ' aria-label="one fewer">&minus;</button>' +
      '<b class="knob">' + prefs.quick.flags + "</b>" +
      '<button data-quick-flags="1"' + (prefs.quick.flags >= hi ? " disabled" : "") + ' aria-label="one more">+</button>' +
      '<span class="keys">' + lo + " to " + hi + ": at least one a board, three at most</span>" +
      '<label title="A board nobody has checked against its photograph yet. Left out of the draw unless you say so."><input type="checkbox" data-quick-unverified' + (prefs.quick.unverified ? " checked" : "") + "> Draw unverified boards too</label></div>";
    /* the palette: only when one board is being played, since that is the one
     * case where picking it is a choice worth making. The first tile draws one. */
    if (n === 1) {
      html += "<div class='courses'>";
      html += '<button class="course any" data-course="' + ANY + '" aria-label="Any board" aria-pressed="' + (prefs.course === ANY) + '">' +
        '<span class="name">Any board</span><span class="meta">drawn from ' + drawable + " at random</span></button>";
      for (const q of quick) {
        const ok = q.reads.includes(prefs.ruleset);
        html += '<button class="course" data-course="' + esc(q.id) + '" aria-label="' + esc(q.board.name) + '" aria-pressed="' + (prefs.course === q.id) + '"' +
          (ok ? "" : notRead(q.reads)) + ">" + thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + "</span>" +
          '<span class="meta">' + q.board.w + "&times;" + q.board.h + " &middot; " + q.spots + " flag locations" +
          (q.unverified ? " &middot; unverified" : "") + (ok ? "" : onlyRead(q.reads)) + "</span></button>";
      }
      html += "</div>";
    }
    html += "<h2>Course</h2><div class='courses'>";
    for (const c of shelf) {
      const ok = c.reads.includes(prefs.ruleset);
      const boards = c.doc.stamps.filter(s => s.role !== "dock").length;
      /* a course of yours can be taken out of the library; a shipped one cannot, so it gets no button */
      html += (c.kind === "mine" ? '<div class="tile">' : "") +
        '<button class="course" data-course="' + esc(c.id) + '" aria-label="' + esc(c.doc.name) + '" aria-pressed="' + (prefs.course === c.id) + '"' +
        (ok ? "" : notRead(c.reads)) + ">" + thumb(c.id, assemble(c.doc, library).grid) + '<span class="name">' + esc(c.doc.name) + "</span>" +
        '<span class="meta">' + esc(c.kind === "mine" ? "yours" : c.kind) + " &middot; " + boards + " board" + (boards === 1 ? "" : "s") +
        " &middot; " + (c.doc.flags || []).length + " " + flagWord + (ok ? "" : onlyRead(c.reads)) + "</span></button>" +
        (c.kind === "mine" ? '<button class="forget" data-forget="' + esc(c.id) + '" title="Delete this course from the library" aria-label="Delete ' + esc(c.doc.name) + '">&times;</button></div>' : "");
    }
    html += "</div>";

    html += "<h2>Seats</h2><div class='seats'>";
    prefs.seats.forEach((s, i) => {
      const liv = LIVERIES[i];
      html += '<div class="seat"><span>' + (i + 1) + '</span><span class="sw" style="background:' + liv.a + '"></span>' +
        '<select data-seat="' + i + '"><option value="human"' + (s.seat === "human" ? " selected" : "") + '>Human</option>' +
        '<option value="bot"' + (s.seat === "bot" ? " selected" : "") + '>Bot</option></select>' +
        '<select data-skill="' + i + '"' + (s.seat === "bot" ? "" : " disabled") + '>' +
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
    html += "</div><div class='row'><button class='primary' data-act='start'" + (prefs.course ? "" : " disabled") + ">Start the race</button></div>";

    /* issue #6: everything this browser remembers, gone in one press. Not
     * a per-key list, because a key added later would be a key this missed:
     * the saved race, these settings, the mats' preferences, the speed, the
     * workshop's autosave and its libraries of courses -- all of it. */
    html += "<h2>Storage</h2><div class='row'><button data-act='reset'>Forget everything</button>" +
      "<span class='keys'>Clears everything PumaRally keeps in this browser: the saved race, these settings, your courses, the workshop's autosave.</span></div></div>";
    root.innerHTML = html;
  }

  root.onclick = ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.ruleset) { prefs.ruleset = d.ruleset; if (!playable().some(c => c.id === prefs.course)) prefs.course = ANY; store(SETUP_KEY, prefs); render(); return; }
    if (d.course) { prefs.course = d.course; if (d.course !== ANY && !d.course.startsWith("quick:")) { /* a track is what it is */ } store(SETUP_KEY, prefs); render(); return; }
    if (d.quickBoards !== undefined) {
      prefs.quick.boards = +d.quickBoards;
      /* the default follows the boards until the knob is turned; the range always does */
      prefs.quick.flags = quickDefaultFlags(prefs.quick.boards);
      clampFlags();
      if (prefs.quick.boards > 1 || !String(prefs.course).startsWith("quick:")) prefs.course = ANY;
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
      if (prefs.course === d.forget) prefs.course = playable().length ? playable()[0].id : null;
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
      const q = quick.find(x => x.id === prefs.course);
      const c = q || prefs.course === ANY ? null : shelf.find(x => x.id === prefs.course);
      if (!q && !c && prefs.course !== ANY) return;
      store(SETUP_KEY, prefs);
      /* a quick game is drawn now, and the draw is the course the save carries */
      let course;
      try {
        course = c ? c.doc
          : q ? readCourse(quickCourse(q.board, library, { flags: Math.min(prefs.quick.flags, q.spots) }), library)
          : readCourse(quickMulti(pool(), prefs.quick.boards, prefs.quick.flags, library), library);
      } catch (e) {
        window.alert("The quick game could not be drawn: " + e.message);
        return;
      }
      onStart({ course, seats: prefs.seats.map(s => ({ seat: s.seat, skill: +s.skill })), house: { ...prefs.house }, ruleset: prefs.ruleset });
    }
  };
  root.onchange = ev => {
    const t = ev.target;
    if (t.dataset.seat !== undefined) { prefs.seats[+t.dataset.seat].seat = t.value; store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.skill !== undefined) { prefs.seats[+t.dataset.skill].skill = +t.value; store(SETUP_KEY, prefs); }
    else if (t.dataset.house !== undefined) { prefs.house[t.dataset.house] = t.checked; store(SETUP_KEY, prefs); }
    else if (t.dataset.quickUnverified !== undefined) { prefs.quick.unverified = t.checked; store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.houseN !== undefined) { prefs.house[t.dataset.houseN] = +t.value; store(SETUP_KEY, prefs); }
  };
  render();
}
