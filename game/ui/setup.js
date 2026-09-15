/* Setting up a race: a course, the seats, the house rules.
 *
 * Seats are any count from one to eight and any mix of humans and bots: a
 * solo human with no opponents, all humans passing the keyboard, bots only,
 * or anything between. The course shelf is the workshop's: every shipped
 * course, and every course saved from the course workshop in this browser.
 */
import { boardSVG } from "../../editor/render/svg.js";
import { esc } from "../../editor/render/theme.js";
import { assemble } from "../../editor/lib/course.js";
import { readCourse } from "../engine/library.js";
import { LIVERIES } from "../engine/state.js";

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
    try { out.push({ id, doc: readCourse(all[id].doc, library, id), mine: true }); } catch (e) { /* not raceable */ }
  }
  return out;
}

/* the workshop sits beside the game whichever page mounted it */
const workshopHref = new URL("../../editor/index.html#course", import.meta.url).href;

export function mountSetup(root, { library, index, courses, onStart, onResume }) {
  const prefs = read(SETUP_KEY, { course: null, seats: [{ seat: "human", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }, { seat: "bot", skill: 1 }], house: {} });
  const shelf = [];
  for (const row of index.courses) {
    const doc = courses.get(row.id);
    if (!doc) continue;
    try { shelf.push({ id: row.id, doc: readCourse(doc, library, row.id), kind: row.kind, blurb: row.blurb }); } catch (e) { /* skip a course that will not build */ }
  }
  for (const c of workshopCourses(library)) shelf.push({ id: c.id, doc: c.doc, kind: "mine", blurb: "Saved from the course workshop." });
  if (!shelf.some(c => c.id === prefs.course)) prefs.course = shelf.length ? shelf[0].id : null;

  function thumb(doc) {
    const { grid } = assemble(doc, library);
    return boardSVG(grid, { mode: "art", background: true });
  }

  function render() {
    let html = '<div class="setup"><div class="row"><h1>PumaRally</h1><span class="grow"></span>' +
      (onResume ? '<button data-act="resume">Back to the race</button>' : "") +
      '<a href="' + esc(workshopHref) + '" style="color:var(--accent)">Course workshop &rarr;</a></div>';
    html += "<h2>Course</h2><div class='courses'>";
    for (const c of shelf) {
      html += '<button class="course" data-course="' + esc(c.id) + '" aria-label="' + esc(c.doc.name) + '" aria-pressed="' + (prefs.course === c.id) + '">' +
        thumb(c.doc) + '<span class="name">' + esc(c.doc.name) + "</span>" +
        '<span class="meta">' + esc(c.kind === "mine" ? "yours" : c.kind) + " &middot; " + c.doc.stamps.filter(s => s.role === "board").length +
        " board" + (c.doc.stamps.filter(s => s.role === "board").length === 1 ? "" : "s") + " &middot; " + (c.doc.flags || []).length + " flags</span></button>";
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
    html += '<label title="Option cards dealt to everyone at the start. The printed route, a two-wrench site instead of two points of repair, hands one out in about one game in fifty.">Starting options ' +
      '<select data-house-n="startOptions">' + [0, 1, 2, 3].map(n => '<option value="' + n + '"' + ((prefs.house.startOptions | 0) === n ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>";
    html += "</div><div class='row'><button class='primary' data-act='start'" + (prefs.course ? "" : " disabled") + ">Start the race</button></div></div>";
    root.innerHTML = html;
  }

  root.onclick = ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.course) { prefs.course = d.course; store(SETUP_KEY, prefs); render(); return; }
    if (d.drop !== undefined) { prefs.seats.splice(+d.drop, 1); store(SETUP_KEY, prefs); render(); return; }
    if (d.act === "add" && prefs.seats.length < 8) { prefs.seats.push({ seat: "bot", skill: 1 }); store(SETUP_KEY, prefs); render(); return; }
    if (d.act === "resume" && onResume) { onResume(); return; }
    if (d.act === "start") {
      const c = shelf.find(x => x.id === prefs.course);
      if (!c) return;
      store(SETUP_KEY, prefs);
      onStart({ course: c.doc, seats: prefs.seats.map(s => ({ seat: s.seat, skill: +s.skill })), house: { ...prefs.house } });
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
