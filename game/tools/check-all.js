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
const TESTS = CLASSIC.concat(OPTIONS, CRASH, MODERN);
import cardsData from "../data/cards.js";
import optionsData from "../data/options.js";
import upgradesData from "../data/upgrades.js";
import liveriesData from "../data/liveries.js";

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
