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

/* THE README'S TEST COUNT IS CHECKED, NOT REMEMBERED.
 *
 * It was stale in two places at once -- "262" beside a suite of 265 and a "58"
 * that had been wrong for months -- and both had been read past by everyone,
 * because a number in prose looks like documentation rather than a claim. This
 * is the same bargain OPTION_ROSTER and UPGRADE_ROSTER already make: a count
 * lives in one place and something refuses when it drifts.
 *
 * Written as a check rather than a generator on purpose. A README that
 * rewrites itself would keep the number right and stop anyone noticing the
 * suite had shrunk, which is the failure worth catching. */
const fs = require("fs");
function checkReadmeCounts(actual) {
  let readme;
  try { readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8"); }
  catch (e) { console.error("  error:   the README could not be read to check its test count"); return 1; }
  const claims = [...readme.matchAll(/(\d+)\s+rule tests/g)].map(m => parseInt(m[1], 10));
  if (!claims.length) {
    console.error("  error:   the README no longer states a rule-test count, so nothing checks it");
    return 1;
  }
  const wrong = claims.filter(n => n !== actual);
  if (wrong.length) {
    console.error(`  error:   the README says ${wrong.join(" and ")} rule tests; there are ${actual}`);
    return 1;
  }
  return 0;
}

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
failed += checkReadmeCounts(rt.total);

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

// THE 2016 GAME, PLAYED. The rule tests set each piece of it up on a bench;
// only a game played to a winner exercises damage cards travelling out of the
// stack of forty, into a robot's deck, back into its hand, and home again --
// with the conservation laws armed the whole way. Two bugs came out of the
// first run of this that no bench test had thought to ask about: the deal
// overwriting the SPAM a robot was still holding, and a robot shutting down
// dropping its hand on the floor. Both are unit-tested now; this is what
// found them.
// ON THE COURSE THE MENU WOULD ACTUALLY OFFER. This used to force the 2016
// ruleset onto a classic course, because no 2016 board was transcribed and a
// forced run was the only run available -- which meant the sim was playing a
// game nobody could start. Energize is a transcribed 2016 board and
// energizeRun is the one course playableEditions returns "modern" for.
const modern = PR.runSim(Math.max(40, games / 4), { ruleset: "modern", course: "energizeRun" }, 900);
const modernWins = Object.values(modern.wins).reduce((a, b) => a + b, 0);
console.log(`sim (2016 rules): ${modern.games} games, avg ${modern.turns.avg} turns, ` +
  `${modernWins} decided, ${modern.unfinished} unfinished, ${modern.crashes.length} crashes, ` +
  `${modern.spamDealt} SPAM dealt, ${modern.reboots} reboots, ${modern.returns} returns, ` +
  `${modern.buys} upgrades bought, ${modern.installs} fitted`);
for (const c of modern.crashes.slice(0, 5)) {
  console.error(`  error:   [2016] seed ${c.seed} crashed at ${c.at} turn ${c.turn} -- ${c.error}`);
  failed++;
}
if (modern.crashes.length > 5) { console.error(`  error:   ...and ${modern.crashes.length - 5} more`); }
if (!modernWins) { console.error("  error:   no 2016 game was ever won"); failed++; }
// A 2016 run in which nobody was ever shot would pass every line above and
// touch none of the damage system, which is the only part of the edition this
// sim is here for.
if (!modern.spamDealt) {
  console.error("  error:   not one SPAM was dealt in the 2016 sim, so nothing above tested it");
  failed++;
}
// Nothing dies in this edition, so `deaths` is 0 whatever happens and cannot
// stand in for either of these. A robot that never comes off the board and one
// that comes off and never gets back on are different bugs; one number cannot
// tell them apart, so there are two.
if (!modern.reboots) {
  console.error("  error:   not one robot rebooted in the 2016 sim");
  failed++;
}
// And the accounting below balances just as well when NOBODY ever comes back
// -- every robot stays stranded and the sum still works out -- so the fact
// that returns happen at all is its own check.
if (!modern.returns) {
  console.error("  error:   robots rebooted in the 2016 sim and not one ever got back on the board");
  failed++;
}
// The shop is the whole point of Energy, and a run where nobody spent any
// would leave every line of it untested while reporting nothing wrong.
if (!modern.installs) {
  console.error("  error:   not one upgrade was fitted in the 2016 sim");
  failed++;
}
if (!modern.buys) {
  console.error("  error:   not one upgrade was bought in the 2016 sim, so Energy buys nothing");
  failed++;
}
// EXACTLY, not within a tolerance. Every robot that came off the board either
// walked back on or was still off it when the race ended; there is no third
// thing that can happen to it, so a fudge factor here would be hiding the one
// failure this is looking for.
const stranded = modern.reboots - modern.returns - modern.stranded;
if (stranded !== 0) {
  console.error(`  error:   ${modern.reboots} reboots, ${modern.returns} returns, ` +
    `${modern.stranded} still off the board at the end -- ${stranded} unaccounted for`);
  failed++;
}
if (modern.unfinished > modern.games * 0.1) {
  console.error(`  error:   ${modern.unfinished} 2016 games hit the turn cap`); failed++;
}

// THE SAME GAME, A SECOND SEED BLOCK. The long-race pass existed because the
// only 2016 sim available ran on a short classic course where a fifty-game
// block sometimes produced no shutdown at all. Energize is long enough on its
// own -- measured across four seed blocks, 69 to 92 shutdowns per fifty games
// -- so this is now a second block of the real course rather than a different
// course borrowed for its length.
const modernLong = PR.runSim(Math.max(40, games / 5), { ruleset: "modern", course: "energizeRun" }, 5000);
console.log(`sim (2016, second block): ${modernLong.games} games, avg ${modernLong.turns.avg} turns, ` +
  `${modernLong.unfinished} unfinished, ${modernLong.crashes.length} crashes, ` +
  `${modernLong.shutdowns} shutdowns scrapping ${modernLong.scrapped} damage`);
for (const c of modernLong.crashes.slice(0, 5)) {
  console.error(`  error:   [2016 long] seed ${c.seed} crashed at ${c.at} turn ${c.turn} -- ${c.error}`);
  failed++;
}
if (!modernLong.shutdowns) {
  console.error("  error:   not one robot shut down in the long 2016 sim, so nothing exercised it");
  failed++;
}
// A shutdown that scrapped nothing is a shutdown that did not do the one thing
// it is for.
if (modernLong.shutdowns && !modernLong.scrapped) {
  console.error("  error:   robots shut down in the 2016 sim and not one damage card was scrapped");
  failed++;
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
