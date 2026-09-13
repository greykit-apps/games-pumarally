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

/* The load-time table self-check, run against the SHIPPED tables.
 *
 * It is called from mount(), so until now nothing outside a browser ever ran
 * it on data nobody had deliberately broken -- two rule tests called it, but
 * each injected its own fault and asserted its own message, so a real fault
 * elsewhere in the tables passed straight through them. Deleting a tile's art
 * and watching the suite stay green is how that was found: the check worked
 * perfectly and nothing in CI was asking it. */
try {
  PR.validateTables();
  console.log("table self-check: shipped tables validate");
} catch (e) {
  console.error(`  error:   table self-check -- ${e.message}`);
  failed++;
}

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

// Again with option cards in play. The plain run barely fires a hook: nobody
// reaches an upgrade site in a twelve-turn game, so without this the whole
// option system would be covered by unit tests and nothing else.
const opt = PR.runSim(games, { startOptions: 3 });
const optWins = Object.values(opt.wins).reduce((a, b) => a + b, 0);
console.log(`sim (3 options each): ${opt.games} games, avg ${opt.turns.avg} turns, ` +
  `${optWins} decided, ${opt.unfinished} unfinished, ${opt.flagsTouched} flags touched`);
for (const c of opt.crashes.slice(0, 10)) {
  console.error(`  error:   [options] seed ${c.seed} crashed at ${c.at} turn ${c.turn} -- ${c.error}`);
  failed++;
}
if (optWins === 0) { console.error("  error:   no game with options was ever won"); failed++; }
if (opt.unfinished > games * 0.1) {
  console.error(`  error:   ${opt.unfinished} option games hit the turn cap`); failed++;
}

// And with the bumpers house rule on. It changes what movement means at
// every edge of the board, which is where a good deal of the game happens, so
// a sim that only ever runs with it off has never executed the rule at all.
// The assertion is not "it works" -- it is that the rail actually saves
// robots, because a rule that changes no outcome is a rule nothing implements.
const bmp = PR.runSim(games, { bumpers: 1 }, 11);
const plain = PR.runSim(games, {}, 11);
const bmpWins = Object.values(bmp.wins).reduce((a, b) => a + b, 0);
console.log(`sim (bumpers): ${bmp.games} games, avg ${bmp.turns.avg} turns, ${bmpWins} decided, ` +
  `${bmp.deaths} robots scrapped against ${plain.deaths} without the rail`);
for (const c of bmp.crashes.slice(0, 10)) {
  console.error(`  error:   [bumpers] seed ${c.seed} crashed at ${c.at} turn ${c.turn} -- ${c.error}`);
  failed++;
}
if (bmpWins === 0) { console.error("  error:   no game with bumpers was ever won"); failed++; }
if (!(bmp.deaths < plain.deaths)) {
  console.error(`  error:   bumpers scrapped ${bmp.deaths} robots against ${plain.deaths} without ` +
    "them -- the rail is saving nobody, so nothing is implementing it");
  failed++;
}

// Every course, not just the default one. Adding a board is exactly when a
// course stops being finishable, and a course nobody has simulated is
// indistinguishable from one that cannot be won.
for (const id of Object.keys(PR.B.COURSES)) {
  if (id.startsWith("_")) continue;
  const r = PR.runSim(Math.max(40, games / 4), { course: id }, 900);
  const won = Object.values(r.wins).reduce((a, b) => a + b, 0);
  console.log(`course ${id}: ${r.games} games, avg ${r.turns.avg} turns, ${won} decided, ` +
    `${r.unfinished} unfinished, ${r.crashes.length} crashes`);
  for (const c of r.crashes.slice(0, 3)) {
    console.error(`  error:   [${id}] seed ${c.seed} crashed at ${c.at} -- ${c.error}`);
    failed++;
  }
  if (!won) { console.error(`  error:   no game on course "${id}" was ever won`); failed++; }
  if (r.unfinished > r.games * 0.25) {
    console.error(`  error:   ${r.unfinished}/${r.games} games on "${id}" hit the turn cap`); failed++;
  }
}

// The difficulty slider has to mean something. Nothing else would notice if the
// tiers collapsed into each other -- every game would still finish, every test
// would still pass, and the setting would quietly be decoration.
const tiers = [0, 2].map(skill => PR.runSim(Math.max(60, games / 2), { skill }, 300));
console.log(`tiers: scrapyard ${tiers[0].turns.avg} turns/game, grand prix ${tiers[1].turns.avg}`);
if (!(tiers[1].turns.avg < tiers[0].turns.avg)) {
  console.error(`  error:   the best bots (${tiers[1].turns.avg} turns) are no faster than the worst ` +
    `(${tiers[0].turns.avg}) -- the difficulty tiers are not doing anything`);
  failed++;
}

// A seed must replay a game exactly, or saves and replays are worthless.
const fp = s => { PR.newGame(s); PR.advance();
  return JSON.stringify([PR.G.turn, PR.G.winner, PR.G.players.map(p => [p.c, p.r, p.face, p.damage, p.lives, p.flags])]); };
PR.UI.headless = true; PR.UI.autoHuman = true;
if (fp(42) !== fp(42)) { console.error("  error:   the same seed did not replay identically"); failed++; }
else console.log("determinism: seed 42 replays identically");

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
