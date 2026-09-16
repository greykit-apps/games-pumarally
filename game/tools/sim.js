#!/usr/bin/env node
/* Bot-vs-bot and mixed games on every shipped course, and on a quick game
 * over every board that makes one.
 *
 *   node game/tools/sim.js [games] [courseId]
 *
 * A quick game's id is quick_<boardId>; its facing and flags are drawn from a
 * seed fixed per board, so a run repeats.
 *
 * Half the seats are bots and half are "humans" answered at random through
 * the same request door, so every run exercises the path a person's clicks
 * take. A run in which no game is ever WON fails: a sim reporting only "no
 * crashes" cannot tell a working engine from one whose win condition is
 * unreachable.
 */
import { loadLibraryFromDisk, readCourse, rulesetsFor } from "../engine/library.js";
import { runSim } from "../engine/sim.js";
import { quickCourse, canQuick, seeded } from "../engine/quick.js";

const games = parseInt(process.argv[2], 10) || 20;
const only = process.argv[3] || null;
const { library, courses } = await loadLibraryFromDisk();
/* the quick games: the setup screen offers every board that makes one, and
 * a board nobody has raced on is a board nobody has seen crash */
[...library.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach((b, k) => {
  if (!canQuick(b, library)) return;
  const q = quickCourse(b, library, { rnd: seeded(1000 + k) });
  courses.set(q.id, q);
});
let failed = 0, totalDecided = 0;
const decidedBy = { classic: 0, modern: 0 };
for (const [id, doc] of courses) {
  if (only && id !== only) continue;
  let course;
  try { course = readCourse(doc, library, id); } catch (e) { console.error("  skip " + id + ": " + e.message); continue; }
  const seats = [{ seat: "human" }, { seat: "bot", skill: 1 }, { seat: "human", skill: 2 }, { seat: "bot", skill: 2 }];
  /* every ruleset whose book reads the course's squares plays it */
  for (const ruleset of rulesetsFor(course, library)) {
    const t0 = Date.now();
    /* classic: half the games with three option cards dealt to everyone at
     * the start, so the hooks and their questions are exercised on every
     * course rather than at the printed rate of one card in fifty games.
     * 2016: the upgrade shop is in every game already. */
    const plain = runSim({ course, seats, library, seed: 100, ruleset }, ruleset === "modern" ? games : Math.ceil(games / 2));
    const armed = ruleset === "modern" ? { games: 0, decided: 0, unfinished: 0, crashes: [], turns: 0, requests: {} }
      : runSim({ course, seats, library, seed: 500, ruleset, house: { startOptions: 3 } }, Math.floor(games / 2));
    const ms = Date.now() - t0;
    const req = k => (plain.requests[k] || 0) + (armed.requests[k] || 0);
    const r = { games: plain.games + armed.games, decided: plain.decided + armed.decided, unfinished: plain.unfinished + armed.unfinished,
      crashes: plain.crashes.concat(armed.crashes), avgTurns: +((plain.turns + armed.turns) / (plain.games + armed.games || 1)).toFixed(1),
      asks: ruleset === "modern" ? req("upgrade") + req("shutdown") + req("rebootFacing") + req("cardChoice") : req("cardChoice") + req("siteChoice") + req("dropOption") };
    totalDecided += r.decided;
    decidedBy[ruleset] += r.decided;
    const line = "course " + id + " (" + ruleset + "): " + r.games + " games in " + ms + "ms, avg " + r.avgTurns + " turns, " +
      r.decided + " decided, " + r.unfinished + " unfinished, " + r.crashes.length + " crashes, " + r.asks + (ruleset === "modern" ? " questions" : " card questions");
    if (r.crashes.length) { failed++; console.error(line); for (const c of r.crashes.slice(0, 3)) console.error("    seed " + c.seed + ": " + c.error); }
    else console.log(line);
  }
}
if (!totalDecided) { console.error("sim: no game was ever won"); failed++; }
if (!only && (!decidedBy.classic || !decidedBy.modern)) { console.error("sim: one ruleset never won a game: " + JSON.stringify(decidedBy)); failed++; }
console.log(failed ? "FAILED" : "ok every course plays to a winner under every ruleset that reads it, with the invariants armed");
process.exit(failed ? 1 : 0);
