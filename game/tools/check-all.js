#!/usr/bin/env node
/* Every check under game/, in one run.
 *
 *   node game/tools/check-all.js
 *
 * Ordered so the thing that would make the others meaningless runs first: the
 * data the engine is built from, then the scenarios. A check that finds
 * nothing to check says so and FAILS -- a green run over zero tests is the
 * failure this project has met most often.
 */
import { SCENARIOS, tally } from "./scenarios.js";
import { TESTS as CLASSIC } from "./scenarios/classic.js";
import { TESTS as OPTIONS } from "./scenarios/options.js";
import { TESTS as CRASH } from "./scenarios/crashAndBurn.js";
import { TESTS as MODERN } from "./scenarios/modern.js";
import { TESTS as UPGRADES } from "./scenarios/upgrades.js";
import { TESTS as EXPANSIONS } from "./scenarios/expansions.js";
import { TESTS as HAYWIRE } from "./scenarios/haywire.js";
import { TESTS as XUPGRADES } from "./scenarios/expansionUpgrades.js";
import { TESTS as QUICK } from "./scenarios/quick.js";
import { TESTS as FIRE } from "./scenarios/fire.js";
const TESTS = CLASSIC.concat(OPTIONS, CRASH, MODERN, UPGRADES, EXPANSIONS, HAYWIRE, XUPGRADES, QUICK, FIRE);
import cardsData from "../data/cards.js";
import optionsData from "../data/options.js";
import upgradesData from "../data/upgrades.js";
import liveriesData from "../data/liveries.js";
import { board, courseOn, game, drive } from "./scenarios/harness.js";
import { assertInvariants } from "../engine/sim.js";
import { MODERN_CARDS, MODERN_DAMAGE_FIRST, MAX_ENERGY, HAND } from "../engine/cards.js";
import { livesFor } from "../engine/state.js";

const TABLES = { "cards.json": cardsData, "options.json": optionsData, "upgrades.json": upgradesData, "liveries.json": liveriesData };
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error("FAIL " + msg); } };
const json = f => TABLES[f];

/* --- the lifted tables ------------------------------------------------------ */
{
  const cards = json("cards.json");
  const classic = cards.classic;
  let n = 0; const pris = new Set();
  for (const [kind, lo, hi, by] of classic.ranges) {
    let k = 0;
    for (let p = lo; p <= hi; p += by) { n++; k++; ok(!pris.has(p), "classic deck: priority " + p + " is unique"); pris.add(p); }
    ok(k === classic.counts[kind], "classic deck: " + kind + " count " + k + " matches " + classic.counts[kind]);
    ok(cards.kinds[kind], "classic deck: kind " + kind + " is a card kind");
  }
  ok(n === classic.size, "classic deck: " + n + " cards, the printed " + classic.size);
  const m = cards.modern;
  ok(Object.values(m.deckCounts).reduce((a, b) => a + b, 0) === m.deckSize, "modern deck: counts sum to " + m.deckSize);
  ok(Object.values(m.damageCounts).reduce((a, b) => a + b, 0) === m.damageSize, "damage deck: counts sum to " + m.damageSize);
  for (const k of Object.keys(m.deckCounts)) ok(cards.kinds[k], "modern deck: kind " + k + " is a card kind");

  const opt = json("options.json");
  ok(opt.cards.length === opt.transcribed && opt.transcribed <= opt.printed, "option cards: " + opt.cards.length + " of " + opt.printed + " printed, and the roster says so");
  ok(new Set(opt.cards.map(c => c.id)).size === opt.cards.length, "option cards: ids unique");
  for (const c of opt.cards) ok(c.name && c.text, "option card " + c.id + " has a name and its text");

  const up = json("upgrades.json");
  ok(up.cards.length === up.roster.transcribed && up.roster.transcribed === up.roster.printed, "upgrades: all " + up.roster.printed + " transcribed");
  ok(up.cards.filter(c => c.built).length === up.roster.built, "upgrades: the built count is the roster's");
  for (const c of up.cards) ok(c.name && c.text && c.cost >= 0 && /^(permanent|temporary)$/.test(c.type), "upgrade " + c.id + " has name, text, cost and type");

  const liv = json("liveries.json");
  ok(liv.liveries.length === liv.maxSeats, "liveries: one per seat");
  ok(new Set(liv.liveries.map(l => l.id)).size === liv.liveries.length, "liveries: ids unique");
}

/* --- the rule tests ----------------------------------------------------------- */
{
  const names = new Set();
  for (const [name, run] of TESTS) {
    ok(!names.has(name), "rule test names are unique: " + name);
    names.add(name);
    try { run(); passed++; }
    catch (e) { failed++; console.error("FAIL " + name + "\n  " + e.message); }
  }
  /* the list and the tests agree in both directions */
  const ported = new Set(SCENARIOS.filter(s => s.status === "ported").map(s => s.name));
  for (const n of names) ok(ported.has(n), "scenario list: the test \"" + n + "\" is marked ported");
  for (const n of ported) ok(names.has(n), "scenario list: the ported scenario \"" + n + "\" has a test");
  console.log("rule tests: " + names.size + " ran");
}

/* --- the Konami cheat --------------------------------------------------------
 * A new feature, not one of the old suite's rules, so it is tested here rather
 * than in the ported-scenario ledger. Reach a player's programming, enter the
 * code (the { cheat: "konami" } answer the UI sends), and check the effect and
 * that the conservation laws still hold. */
{
  const hasDamage = p => [...p.hand, ...p.deck, ...p.pile, ...p.parked,
    ...p.registers, ...p.crab, ...p.haywire].some(i => i !== null && i >= MODERN_DAMAGE_FIRST);

  /* modern: fills the Energy bar and scraps every damage card */
  {
    const co = courseOn(board());
    const st = game(co, [{ c: 0, r: 7 }], { ruleset: "modern" });
    const p = st.players[0];
    const take = kind => { const k = st.damageDeck.findIndex(i => MODERN_CARDS[i].kind === kind); return st.damageDeck.splice(k, 1)[0]; };
    p.energy = 1;
    p.hand = [p.deck.pop(), take("spam")];
    p.pile = [take("spam")];
    p.haywire[0] = take("haywire");
    assertInvariants(st, co.library);                 // the staged position is legal
    st.phase = "turn"; st.step = "program"; p.ready = false; st.waiting = null;
    const asked = drive(st, co.library);
    ok(asked.waiting && asked.waiting.kind === "program", "cheat: modern reaches programming");
    drive(st, co.library, { cheat: "konami" });
    ok(p.energy === MAX_ENERGY, "cheat: the Konami code fills the Energy bar");
    ok(!hasDamage(p), "cheat: the Konami code scraps every damage card from the robot");
    ok(p.hand.length === HAND + 2, "cheat: and deals a full hand plus two (" + p.hand.length + ")");
    ok(!p.hand.some(i => i >= MODERN_DAMAGE_FIRST), "cheat: none of them damage");
    ok(st.waiting && st.waiting.kind === "program", "cheat: the player goes on programming after the code");
    assertInvariants(st, co.library);                 // conservation survives the purge
  }

  /* classic: restores lives and clears the damage track */
  {
    const co = courseOn(board());
    const st = game(co, [{ c: 0, r: 7, lives: 1, damage: 5 }], { ruleset: "classic" });
    const p = st.players[0];
    p.hand = [st.deck.pop(), st.deck.pop(), st.deck.pop()];
    st.phase = "turn"; st.step = "program"; p.ready = false; st.waiting = null;
    const asked = drive(st, co.library);
    ok(asked.waiting && asked.waiting.kind === "program", "cheat: classic reaches programming");
    drive(st, co.library, { cheat: "konami" });
    ok(p.lives === livesFor(1, 1), "cheat: the Konami code restores a classic robot's lives");
    ok(p.damage === 0, "cheat: the Konami code clears the classic damage track");
    ok(p.hand.length === HAND + 2, "cheat: and deals a full hand plus two (" + p.hand.length + ")");
    assertInvariants(st, co.library);
  }
  console.log("cheat: the Konami code, both rulesets");
}

/* --- the scenarios ----------------------------------------------------------- */
{
  const t = tally();
  ok(SCENARIOS.length > 0, "scenarios: the list is not empty");
  ok(new Set(SCENARIOS.map(s => s.name)).size === SCENARIOS.length, "scenarios: names unique");
  for (const s of SCENARIOS) ok(/^(pending|ported|dropped)$/.test(s.status), "scenario status is one of three: " + s.name);
  for (const s of SCENARIOS) if (s.status === "dropped") ok(s.reason, "a dropped scenario says why: " + s.name);
  console.log("scenarios: " + t.ported + " ported, " + t.pending + " pending, " + t.dropped + " dropped (" +
    t.rules + " rules, " + t.screen + " screen)");
  if (t.pending) console.log("  PENDING: the engine is not yet held to " + t.pending + " of the rules the old game was held to.");
}

console.log((failed ? "FAILED " : "ok ") + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
