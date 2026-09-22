/* Setting up a race: a course, the seats, the house rules.
 *
 * Seats are any count from one to eight and any mix of humans and bots: a
 * solo human with no opponents, all humans passing the keyboard, bots only,
 * or anything between. The course shelf is the workshop's: every shipped
 * course, and every course saved from the course workshop in this browser.
 * Before the shelf comes the quick game: any one board, laid at a random
 * facing with three flags drawn from the locations it marks, fresh at every
 * start (game/engine/quick.js).
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse, rulesetsFor } from "../engine/library.js";
import { LIVERIES, assignLiveries } from "../engine/state.js";
import { rulesetFor } from "../../editor/rulesets/index.js";
import { boardFromDocument } from "../../editor/lib/board.js";
import { sink } from "../../editor/validate/diagnostic.js";
import { quickCourse, quickSpots, QUICK_FLAGS, DOCK_BOARD } from "../engine/quick.js";

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
    try { out.push({ id, doc: readCourse(all[id].doc, library, id), mine: true }); } catch (e) { /* not raceable */ }
  }
  return out;
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
  if (initialCourse) prefs.course = initialCourse;                // the workshop's Play button names a course
  const shelf = [];
  for (const row of index.courses) {
    const doc = courses.get(row.id);
    if (!doc) continue;
    try { const d = readCourse(doc, library, row.id); shelf.push({ id: row.id, doc: d, kind: row.kind, blurb: row.blurb, reads: rulesetsFor(d, library) }); } catch (e) { /* skip a course that will not build */ }
  }
  for (const c of workshopCourses(library)) shelf.push({ id: c.id, doc: c.doc, kind: "mine", blurb: "Saved from the course workshop.", reads: rulesetsFor(c.doc, library) });
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
  const playable = () => quick.concat(shelf).filter(c => c.reads.includes(prefs.ruleset));
  if (!playable().some(c => c.id === prefs.course)) prefs.course = playable().length ? playable()[0].id : null;

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
    html += "<h2>Quick game</h2><p class='keys'>One board over the docking bay, laid at a random facing, with " + QUICK_FLAGS + " " + flagWord +
      " drawn in a random order from the locations it marks. A fresh draw every start.</p><div class='courses'>";
    for (const q of quick) {
      const ok = q.reads.includes(prefs.ruleset);
      html += '<button class="course" data-course="' + esc(q.id) + '" aria-label="' + esc(q.board.name) + '" aria-pressed="' + (prefs.course === q.id) + '"' +
        (ok ? "" : notRead(q.reads)) + ">" + thumb(q.id, q.board) + '<span class="name">' + esc(q.board.name) + "</span>" +
        '<span class="meta">' + q.board.w + "&times;" + q.board.h + " &middot; " + q.spots + " flag locations" +
        (q.unverified ? " &middot; unverified" : "") + (ok ? "" : onlyRead(q.reads)) + "</span></button>";
    }
    html += "</div>";
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
    /* the swatch is the colour the seat will get: the first human is Coolant, the rest fill in order */
    const liveries = assignLiveries(prefs.seats);
    prefs.seats.forEach((s, i) => {
      const liv = LIVERIES[liveries[i]];
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
    if (d.ruleset) { prefs.ruleset = d.ruleset; if (!playable().some(c => c.id === prefs.course)) prefs.course = playable().length ? playable()[0].id : null; store(SETUP_KEY, prefs); render(); return; }
    if (d.course) { prefs.course = d.course; store(SETUP_KEY, prefs); render(); return; }
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
      const c = q ? null : shelf.find(x => x.id === prefs.course);
      if (!q && !c) return;
      store(SETUP_KEY, prefs);
      /* a quick game is drawn now, and the draw is the course the save carries */
      const course = q ? readCourse(quickCourse(q.board, library), library) : c.doc;
      onStart({ course, seats: prefs.seats.map(s => ({ seat: s.seat, skill: +s.skill })), house: { ...prefs.house }, ruleset: prefs.ruleset });
    }
  };
  root.onchange = ev => {
    const t = ev.target;
    if (t.dataset.seat !== undefined) { prefs.seats[+t.dataset.seat].seat = t.value; store(SETUP_KEY, prefs); render(); }
    else if (t.dataset.skill !== undefined) { prefs.seats[+t.dataset.skill].skill = +t.value; store(SETUP_KEY, prefs); }
    else if (t.dataset.house !== undefined) { prefs.house[t.dataset.house] = t.checked; store(SETUP_KEY, prefs); }
    else if (t.dataset.houseN !== undefined) { prefs.house[t.dataset.houseN] = +t.value; store(SETUP_KEY, prefs); }
  };
  render();
}
