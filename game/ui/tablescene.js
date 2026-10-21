/* THE RACE BEHIND THE TITLE (games-meta STANDARD.md §15, the table): a
 * course lying on the table, and four bots racing it.
 *
 * A REAL RACE, NEVER SAVED. The engine runs a game of its own here -- the
 * same newGame, step and botAnswer a race in progress uses -- on a state
 * nothing else holds, so the race behind the title and the one in the save
 * never touch. Nothing is saved, traced or heard: the floor's sounds belong
 * to a race someone is playing.
 *
 * WHICH COURSE. One of the shipped courses, or a quick game on one verified
 * board the setup screen would offer, drawn afresh each time the title is
 * mounted, and again when a race is won or runs long.
 *
 * DRAWN AS THE GAME DRAWS IT. The board is the race screen's own art, as an
 * image drawn once: the table lays the whole drawing down in perspective and
 * turns it slowly, and a board of a thousand elements with blurred glows,
 * redrawn every frame of that, stutters. The robots and flags are the
 * screen's own (ROBOT, flagSvg), live on top, with the defs their filters
 * point at, and move by the engine's events as the screen replays them --
 * one at a time, a board pass all at once.
 *
 * Under reduced motion the race is run a few turns without being shown, and
 * the table is that one still moment of it. */
import { boardSVG } from "../../editor/render/svg.js";
import { ART_DEFS } from "../../editor/render/palette.js";
import { readCourse } from "../engine/library.js";
import { courseOf } from "../engine/course.js";
import { canQuick, isBlank, quickCourse } from "../engine/quick.js";
import { newGame, LIVERIES } from "../engine/state.js";
import { step } from "../engine/machine.js";
import { botAnswer } from "../engine/bots.js";
import { ROBOT, flagSvg } from "./screen.js";
import { reduced } from "./title.js";

const CELL = 100;
const SEATS = 4;
const MAX_TURNS = 24;           // a race the bots cannot finish is dealt again
const T = { register: 380, slide: 300, turn: 240, hit: 260, flag: 420, land: 200, between: 500, done: 2200 };

/** The courses the title may lay out: the shipped ones, and a quick game on any verified board. */
function pickCourse(library, courses) {
  const shipped = [...courses.entries()];
  const boards = [...library.values()].filter(b => !b.unverified && canQuick(b, library) && !isBlank(b));
  const tries = [];
  if (boards.length && (!shipped.length || Math.random() < 0.6)) {
    const b = boards[Math.random() * boards.length | 0];
    tries.push(() => { const q = quickCourse(b, library); return readCourse(q, library, q.id); });
  }
  for (const [id, doc] of shipped.sort(() => Math.random() - 0.5)) tries.push(() => readCourse(doc, library, id));
  for (const t of tries) { try { return t(); } catch (e) { /* the next */ } }
  return null;
}

/**
 * The title's scene: mountTitle calls it with the .scene element.
 *   library, courses   as main.js loaded them
 */
export function tableScene({ library, courses }) {
  return el => {
    if (!el) return;
    const still = reduced();
    let urls = [];
    const gone = () => !el.isConnected;
    const wait = ms => new Promise(r => setTimeout(r, ms));

    /* one race: the board drawn, the pieces on it, then the engine run and replayed */
    async function race() {
      const course = pickCourse(library, courses);
      if (!course) return false;
      const st = newGame({ seed: (Math.random() * 0x7fffffff) | 0, course, seats: Array.from({ length: SEATS }, () => ({ seat: "bot", skill: 2 })), ruleset: "classic", library });
      const C = courseOf(st, library);
      /* room round the board, so it lies on the table with cloth all round
         it rather than filling the window: more above and below, where the
         tilt foreshortens it least */
      const W = C.w * CELL, H = C.h * CELL, mx = Math.max(W, H) * 0.14, my = Math.max(W, H) * 0.24;
      const art = boardSVG(C.grid, { mode: "art", background: true, sites: st.ruleset, flagspots: false });
      for (const u of urls) URL.revokeObjectURL(u);
      urls = [URL.createObjectURL(new Blob([art], { type: "image/svg+xml" }))];
      /* the board's own drawing has a margin round it: lay it so its squares fall on CELL */
      const vb = /viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/.exec(art);
      const [bx, by, bw, bh] = vb ? vb.slice(1).map(Number) : [0, 0, W, H];
      el.innerHTML = '<svg class="overlay pr-tscene" viewBox="' + (-mx) + " " + (-my) + " " + (W + 2 * mx) + " " + (H + 2 * my) +
        '" preserveAspectRatio="xMidYMid meet">' + ART_DEFS +
        '<image href="' + urls[0] + '" x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '"/>' +
        C.flags.map(F => flagSvg(F.n, F.c, F.r)).join("") + '<g class="pieces"></g></svg>';
      const layer = el.querySelector(".pieces"), flags = el.querySelector("svg");
      const pieces = new Map(), at = new Map();
      for (const p of st.players) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "piece gone");
        g.innerHTML = ROBOT;
        layer.appendChild(g);
        pieces.set(p.id, g);
      }
      const paint = p => {
        const g = pieces.get(p.id), liv = LIVERIES[p.livery];
        if (liv) { g.style.setProperty("--a", liv.a); g.style.setProperty("--d", liv.d); }
      };
      const put = (id, c, r, face, show) => {
        const g = pieces.get(id);
        if (!g) return;
        g.style.transform = "translate(" + (c * CELL) + "px," + (r * CELL) + "px)";
        g.querySelector(".spin").style.transform = "rotate(" + (face * 90) + "deg)";
        g.classList.toggle("gone", show === "gone");
        at.set(id, { c, r, face, show });
      };
      const where = id => at.get(id) || { c: 0, r: 0, face: 0, show: "gone" };
      const settle = () => { for (const p of st.players) { paint(p); put(p.id, p.c, p.r, p.face, p.alive && p.placed ? "on" : "gone"); } };
      const flash = (node, cls, ms) => { if (!node) return; node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };

      /* one event as the screen shows it, and how long it holds the floor */
      const show = e => {
        const id = e.player;
        switch (e.type) {
          case "register": return T.register;
          case "moved": case "pushed": case "conveyed": case "shoved": { const d = where(id); put(id, e.to[0], e.to[1], d.face, d.show); return T.slide; }
          case "turned": { const d = where(id); put(id, d.c, d.r, e.face, d.show); return T.turn; }
          case "portal": case "teleported": { const g = pieces.get(id); if (g) g.style.transition = "none"; const d = where(id); put(id, e.to[0], e.to[1], d.face, d.show); if (g) { void g.getBoundingClientRect(); g.style.transition = ""; } return T.land; }
          case "shot": flash(pieces.get(e.target), "hit", T.hit); return T.hit;
          case "destroyed": { const d = where(id); put(id, d.c, d.r, d.face, "gone"); return T.slide; }
          case "respawned": case "placed": case "rebooted": {
            const g = pieces.get(id); if (g) g.style.transition = "none";
            paint(st.players[id]); put(id, e.at[0], e.at[1], e.face === undefined ? where(id).face : e.face, "on");
            if (g) { void g.getBoundingClientRect(); g.style.transition = ""; }
            return T.land;
          }
          case "flag": flash(flags.querySelector('.flag[data-n="' + e.flag + '"]'), "hit", T.flag); return T.flag;
          default: return 0;
        }
      };
      /* a robot's activation one event after another; a board pass all at once */
      async function replay(events) {
        let pass = false, held = 0;
        for (const e of events) {
          if (gone()) return;
          if (e.type === "element" || e.type === "register" || e.type === "revealed" || e.type === "turnStart") {
            if (held) { await wait(held); held = 0; }
            pass = e.type === "element";
          }
          const ms = show(e);
          if (pass) held = Math.max(held, ms);
          else if (ms) await wait(ms);
        }
        if (held && !gone()) await wait(held);
      }

      let res = step(st, library), refusals = 0;
      if (still) {
        /* a few turns, unseen, and the table is that moment */
        for (let n = 0; n < 4000 && !st.over && st.turn < 4 && res.waiting; n++) res = step(st, library, botAnswer(st, library, res.waiting));
        settle();
        return false;
      }
      while (!gone()) {
        await replay(res.events);
        if (gone()) return false;
        if (st.over || st.turn > MAX_TURNS || !res.waiting) { await wait(T.done); return true; }
        if (res.waiting.kind === "program") await wait(T.between);
        res = step(st, library, botAnswer(st, library, res.waiting));
        if (res.refused && ++refusals > 5) return true;
        if (!res.refused) refusals = 0;
      }
      return false;
    }

    (async () => {
      /* races one after another while the title is up; one that throws is put
         down for another, and three in a row put the table away */
      let fails = 0;
      while (!gone() && fails < 3) {
        try { if (!await race()) break; fails = 0; } catch (e) { fails++; }
      }
      if (gone()) for (const u of urls) URL.revokeObjectURL(u);
    })();
  };
}
