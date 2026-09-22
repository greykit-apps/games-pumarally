#!/usr/bin/env node
/* Re-run a race from a Debug dump, and say where it diverges.
 *
 *   node game/tools/replay-dump.js pumarally-debug-<seed>-t<turn>.json [--log] [--until N]
 *
 * The dump's trace holds the game's inputs and every answer in order; the
 * engine is deterministic, so newGame(inputs) driven by those answers is the
 * same race. This replays it to the end of the trace and compares what it
 * reaches with the state the dump carries -- turn, phase, every robot's
 * square, facing, damage, lives -- and prints the log. A dump whose replay
 * does not land on its own state is the interesting kind: it means the race
 * in the browser took a branch the engine no longer takes, and the step at
 * which the answers stop being legal is where to look.
 *
 * --log prints every log line as it is produced; --until N stops after N
 * answers, to inspect the state part-way.
 */
import { readFileSync } from "node:fs";
import { newGame } from "../engine/state.js";
import { step } from "../engine/machine.js";
import { loadLibraryFromDisk } from "../engine/library.js";

const file = process.argv[2];
if (!file) { console.error("usage: node game/tools/replay-dump.js <dump.json> [--log] [--until N]"); process.exit(2); }
const showLog = process.argv.includes("--log");
const until = process.argv.includes("--until") ? parseInt(process.argv[process.argv.indexOf("--until") + 1], 10) : Infinity;
const dump = JSON.parse(readFileSync(file, "utf8"));
const { library } = await loadLibraryFromDisk();

console.log("dump exported " + dump.exported + " from " + (dump.page || "?") + (dump.speed ? " at speed " + dump.speed : ""));
const S = dump.state;
console.log("state: " + S.ruleset + ", seed " + S.seed + ", turn " + S.turn + ", " + S.phase + "." + S.step +
  (S.waiting ? ", waiting on " + S.waiting.kind + " from " + S.players[S.waiting.player].name : "") + (S.over ? ", OVER" : ""));
for (const p of S.players) console.log("  " + p.name.padEnd(10) + p.seat.padEnd(6) + " at (" + p.c + "," + p.r + ") facing " + p.face + ", damage " + p.damage + ", lives " + p.lives + (p.alive ? "" : ", DEAD") + (p.out ? ", OUT" : ""));

if (!dump.trace) { console.log("no trace in this dump (" + (dump.traceNote || "") + "); nothing to replay. The state above is all there is."); process.exit(0); }
const T = dump.trace;
console.log("trace: " + T.answers.length + " answers, " + T.log.length + " log lines, started " + T.started);

let st = newGame(T.opts);
let r = step(st, library);
const say = evs => { if (showLog) for (const e of evs) if (e.type === "log") console.log("  t" + st.turn + " r" + (st.register + 1) + "  " + e.msg); };
say(r.events);
let n = 0, diverged = null;
for (const a of T.answers) {
  if (n >= until) break;
  const w = st.waiting;
  if (!w) { diverged = "answer " + n + " (" + a.kind + " from " + a.player + " on turn " + a.turn + "): the replay had nothing waiting"; break; }
  if (w.kind !== a.kind || w.player !== a.player) { diverged = "answer " + n + ": the trace answered " + a.kind + " from player " + a.player + " but the replay is waiting on " + w.kind + " from player " + w.player + " (turn " + st.turn + ")"; break; }
  r = step(st, library, a.answer);
  if (r.refused) { diverged = "answer " + n + " (" + a.kind + " from " + a.player + " on turn " + a.turn + "): " + JSON.stringify(a.answer) + " was refused on replay"; break; }
  say(r.events);
  n++;
  if (st.over) break;
}
console.log("replayed " + n + " of " + T.answers.length + " answers -> turn " + st.turn + ", " + st.phase + "." + st.step + (st.over ? ", OVER" : ""));
if (diverged) { console.log("DIVERGED: " + diverged); process.exit(1); }

/* the comparison: what the browser had against what the replay reaches */
const diffs = [];
if (until === Infinity) {
  if (st.turn !== S.turn || st.phase !== S.phase || st.step !== S.step) diffs.push("position: replay at turn " + st.turn + " " + st.phase + "." + st.step + ", dump at turn " + S.turn + " " + S.phase + "." + S.step);
  st.players.forEach((p, i) => {
    const q = S.players[i];
    for (const k of ["c", "r", "face", "damage", "lives", "alive", "out"]) if (p[k] !== q[k]) diffs.push(p.name + "." + k + ": replay " + p[k] + ", dump " + q[k]);
  });
  if (st.rng !== S.rng) diffs.push("rng: replay " + st.rng + ", dump " + S.rng);
}
if (diffs.length) { console.log("MISMATCH between the replay and the dumped state:"); for (const d of diffs) console.log("  " + d); process.exit(1); }
console.log(until === Infinity ? "ok: the replay reaches exactly the dumped state" : "stopped early as asked");
