#!/usr/bin/env node
/*
 * Rule tests and a headless sim for PumaRally, run in CI.
 *
 *   node tools/check-rules.js [games]
 *
 * The rules engine touches no DOM, so it loads in Node unchanged. Two things
 * are checked, and they catch different failures:
 *
 *   RULE_TESTS  -- each printed rule set up on a purpose-built board and
 *                  asserted. Catches a rule implemented wrongly.
 *   runSim      -- bot-vs-bot games to completion with the conservation
 *                  invariants armed. Catches the states no test thought of.
 *
 * A sim that never produces a winner is a FAILURE here, not a curiosity: it
 * is indistinguishable from a game that cannot be won, which is exactly the
 * bug a green "no crashes" run would otherwise hide.
 */
const path = require("path");
const PR = require(path.join(__dirname, "..", "pumarally.js")).__PR;

const games = parseInt(process.argv[2], 10) || 200;
let failed = 0;

const rt = PR.ruleTests();
console.log(`rule tests: ${rt.passed}/${rt.total} passed`);
for (const f of rt.failed) { console.error(`  error:   ${f.name} -- ${f.error}`); failed++; }

const t0 = Date.now();
const sim = PR.runSim(games);
const ms = Date.now() - t0;
const wins = Object.values(sim.wins).reduce((a, b) => a + b, 0);

console.log(`sim: ${sim.games} games in ${ms}ms, avg ${sim.turns.avg} turns ` +
  `(${sim.turns.min}-${sim.turns.max}), ${wins} decided, ${sim.unfinished} unfinished, ` +
  `${sim.flagsTouched} flags touched, ${sim.deaths} robots scrapped`);

for (const c of sim.crashes.slice(0, 10)) {
  console.error(`  error:   seed ${c.seed} crashed at ${c.at} turn ${c.turn} -- ${c.error}`);
  failed++;
}
if (sim.crashes.length > 10) { console.error(`  error:   ...and ${sim.crashes.length - 10} more`); }

if (sim.games !== games) { console.error(`  error:   only ${sim.games} of ${games} games ran`); failed++; }
if (wins === 0) { console.error("  error:   no game was ever won -- the win condition may be unreachable"); failed++; }
if (sim.flagsTouched === 0) { console.error("  error:   no flag was ever touched"); failed++; }
if (sim.unfinished > games * 0.1) {
  console.error(`  error:   ${sim.unfinished} games hit the turn cap without finishing`); failed++;
}

// A seed must replay a game exactly, or saves and replays are worthless.
const fp = s => { PR.newGame(s); PR.advance();
  return JSON.stringify([PR.G.turn, PR.G.winner, PR.G.players.map(p => [p.c, p.r, p.face, p.damage, p.lives, p.flags])]); };
PR.UI.headless = true; PR.UI.autoHuman = true;
if (fp(42) !== fp(42)) { console.error("  error:   the same seed did not replay identically"); failed++; }
else console.log("determinism: seed 42 replays identically");

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
