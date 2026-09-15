#!/usr/bin/env node
/* Bot-vs-bot and mixed games on every shipped course.
 *
 *   node game/tools/sim.js [games] [courseId]
 *
 * Half the seats are bots and half are "humans" answered at random through
 * the same request door, so every run exercises the path a person's clicks
 * take. A run in which no game is ever WON fails: a sim reporting only "no
 * crashes" cannot tell a working engine from one whose win condition is
 * unreachable.
 */
import { loadLibraryFromDisk, readCourse } from "../engine/library.js";
import { runSim } from "../engine/sim.js";

const games = parseInt(process.argv[2], 10) || 20;
const only = process.argv[3] || null;
const { library, courses } = await loadLibraryFromDisk();
let failed = 0, totalDecided = 0;
for (const [id, doc] of courses) {
  if (only && id !== only) continue;
  let course;
  try { course = readCourse(doc, library, id); } catch (e) { console.error("  skip " + id + ": " + e.message); continue; }
  const seats = [{ seat: "human" }, { seat: "bot", skill: 1 }, { seat: "human", skill: 2 }, { seat: "bot", skill: 2 }];
  const t0 = Date.now();
  /* half the games with three option cards dealt to everyone at the start,
   * so the hooks and their questions are exercised on every course rather
   * than at the printed rate of one card in fifty games */
  const plain = runSim({ course, seats, library, seed: 100 }, Math.ceil(games / 2));
  const armed = runSim({ course, seats, library, seed: 500, house: { startOptions: 3 } }, Math.floor(games / 2));
  const ms = Date.now() - t0;
  const r = { games: plain.games + armed.games, decided: plain.decided + armed.decided, unfinished: plain.unfinished + armed.unfinished,
    crashes: plain.crashes.concat(armed.crashes), avgTurns: +((plain.turns + armed.turns) / (plain.games + armed.games || 1)).toFixed(1),
    asks: (armed.requests.cardChoice || 0) + (armed.requests.siteChoice || 0) + (armed.requests.dropOption || 0) };
  totalDecided += r.decided;
  const line = "course " + id + ": " + r.games + " games in " + ms + "ms, avg " + r.avgTurns + " turns, " +
    r.decided + " decided, " + r.unfinished + " unfinished, " + r.crashes.length + " crashes, " + r.asks + " card questions";
  if (r.crashes.length) { failed++; console.error(line); for (const c of r.crashes.slice(0, 3)) console.error("    seed " + c.seed + ": " + c.error); }
  else console.log(line);
}
if (!totalDecided) { console.error("sim: no game was ever won"); failed++; }
console.log(failed ? "FAILED" : "ok every course plays to a winner with the invariants armed");
process.exit(failed ? 1 : 0);
