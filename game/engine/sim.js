/* Whole games, headless, with the conservation laws armed.
 *
 * Every seat is driven through step()'s request door by a policy. Bots use
 * the bot policy; "human" seats use whatever the caller passes, which in the
 * suite is a random legal answer -- so the path a person's clicks take is the
 * path every simulated game takes, and a request nobody can answer is a
 * failure reported by name rather than a screen that quietly stops.
 */
import { newGame } from "./state.js";
import { step } from "./machine.js";
import { botAnswer, randomAnswer } from "./bots.js";
import { courseOf, isHole, inGrid } from "./course.js";
import { CLASSIC_DECK, REGISTERS, MAX_DAMAGE } from "./cards.js";
import { OPTION_IDS, OPTION_DEFS } from "./options.js";
import { UPGRADE_IDS } from "./upgrades.js";
import { MODERN_DECK_SIZE, MODERN_DAMAGE_SIZE, MODERN_DAMAGE_FIRST, isModern, MAX_ENERGY } from "./cards.js";

/** The conservation laws. Throws with the law that broke. */
export function assertInvariants(st, library) {
  const C = courseOf(st, library);
  if (isModern(st)) modernInvariants(st);
  else {
    let n = st.deck.length + st.discard.length;
    for (const p of st.players) {
      n += p.hand.length;
      for (const r of p.registers) if (r !== null) n++;
      if (Number.isInteger(p.reserve)) n++;              // on the Command in Reserve
      if (Number.isInteger(p.flywheel)) n++;             // on the Flywheel
    }
    if (n !== CLASSIC_DECK.length) throw new Error("program card conservation broken: " + n + "/" + CLASSIC_DECK.length + " at " + st.phase + "." + st.step + " turn " + st.turn);
  }
  /* option cards are conserved too: every id once, across the deck, the
   * discard and every hand */
  const opt = st.optionDeck.concat(st.optionDiscard);
  for (const p of st.players) for (const o of p.options) opt.push(o.id);
  if (opt.length !== OPTION_IDS.length || new Set(opt).size !== OPTION_IDS.length) {
    throw new Error("option card conservation broken: " + opt.length + " cards, " + new Set(opt).size + " distinct, of " + OPTION_IDS.length + " at " + st.phase + "." + st.step + " turn " + st.turn);
  }
  /* a held card carries the state its definition starts it with, however it
   * was handed out; a coat with no charges absorbs forever */
  for (const p of st.players) for (const o of p.options) {
    const def = OPTION_DEFS[o.id];
    if (!def || !def.init) continue;
    for (const k of Object.keys(def.init())) {
      if (!o.st || !Number.isInteger(o.st[k])) throw new Error(p.name + " holds " + def.name + " with " + k + " = " + (o.st && o.st[k]));
    }
  }
  const seen = new Set();
  for (const p of st.players) {
    if (!p.alive) continue;
    if (!p.placed && st.phase !== "draft") throw new Error(p.name + " is alive and unplaced at " + st.phase + "." + st.step);
    if (!p.placed) continue;
    const key = p.c + "," + p.r;
    if (seen.has(key)) throw new Error("two robots on " + key + " at " + st.phase + "." + st.step + " turn " + st.turn);
    seen.add(key);
    if (!inGrid(C, p.c, p.r)) throw new Error(p.name + " is off the course at " + key);
    if (isHole(C, p.c, p.r)) throw new Error(p.name + " is standing in a hole at " + key);
    /* an integer, not merely in range: NaN passes every comparison */
    if (!Number.isInteger(p.damage) || p.damage < 0 || p.damage >= MAX_DAMAGE) throw new Error(p.name + " has " + p.damage + " damage and is alive");
    if (p.lives < 1) throw new Error(p.name + " is alive with no lives");
    if (p.registers.length !== REGISTERS) throw new Error(p.name + " has " + p.registers.length + " registers");
    if (p.hand.some(i => !Number.isInteger(i))) throw new Error(p.name + " holds a non-card");
  }
  if (st.waiting && !st.players[st.waiting.player]) throw new Error("waiting on a player that does not exist");
}

/**
 * The 2016 table's laws, counted apart: each robot's twenty are its own and
 * are conserved as twenty; the forty damage cards are the table's and are
 * conserved as forty across the deck, the discard and every robot's piles;
 * so are the forty upgrades. Two laws, because summed together they cannot
 * see a SPAM quietly becoming a Move 1.
 */
function modernInvariants(st) {
  const where = " at " + st.phase + "." + st.step + " turn " + st.turn;
  const dmg = st.damageDeck.concat(st.damageDiscard);
  const ups = st.upgradeDeck.concat(st.upgradeDiscard);
  for (const p of st.players) {
    const own = [];
    const all = p.deck.concat(p.pile, p.hand, p.registers.filter(i => i !== null), (p.crab || []).filter(i => i !== null), p.parked || [], p.removed || [], (p.haywire || []).filter(i => i !== null));
    for (const i of all) {
      if (!Number.isInteger(i)) throw new Error(p.name + " holds a non-card" + where);
      if (i >= MODERN_DAMAGE_FIRST) dmg.push(i); else own.push(i);
    }
    if (own.length !== MODERN_DECK_SIZE || new Set(own).size !== MODERN_DECK_SIZE) {
      throw new Error(p.name + "'s own deck is " + own.length + " cards, " + new Set(own).size + " distinct, of " + MODERN_DECK_SIZE + where);
    }
    for (const i of p.deck) if (i >= MODERN_DAMAGE_FIRST && st.damageDiscard.includes(i)) throw new Error("a damage card is in two places" + where);
    if (!Number.isInteger(p.energy) || p.energy < 0 || p.energy > MAX_ENERGY) throw new Error(p.name + " has " + p.energy + " Energy" + where);
    for (const id of p.shelf) ups.push(id);
    for (const u of p.installed) ups.push(u.id);
    /* nine dealt (ten with a modifyDealt card) plus the five Haywires a
     * Rewire can pull off the registers into the hand: found at 13 by a
     * seed on Big Cross, four Haywires held and rewired after a full deal */
    if (p.hand.length > 15) throw new Error(p.name + " holds " + p.hand.length + " cards" + where);
    if (p.alive && p.rebooting) throw new Error(p.name + " is on the board and rebooting" + where);
    if (p.lives !== st.players[0].lives) throw new Error(p.name + " spent a life, and the 2016 game has none" + where);
  }
  if (dmg.length !== MODERN_DAMAGE_SIZE || new Set(dmg).size !== MODERN_DAMAGE_SIZE) {
    throw new Error("damage card conservation broken: " + dmg.length + " cards, " + new Set(dmg).size + " distinct, of " + MODERN_DAMAGE_SIZE + where);
  }
  for (const i of dmg) if (i < MODERN_DAMAGE_FIRST) throw new Error("a programming card is in a damage pile" + where);
  if (ups.length !== UPGRADE_IDS.length || new Set(ups).size !== UPGRADE_IDS.length) {
    throw new Error("upgrade conservation broken: " + ups.length + " cards, " + new Set(ups).size + " distinct, of " + UPGRADE_IDS.length + where);
  }
  if (!Number.isInteger(st.priority) || st.priority < 0 || st.priority >= st.players.length) throw new Error("the Priority Token is with nobody" + where);
}

/**
 * Play one game to the end.
 * @param opts { seed, course, seats, house, library, human?: policy, maxSteps? }
 *   a policy is (st, library, req) -> answer
 * @returns { state, turns, winner, steps, requests: {kind: count} }
 */
export function runGame(opts) {
  const library = opts.library;
  const st = newGame(opts);
  const human = opts.human || randomAnswer;
  const requests = {};
  let res = step(st, library);
  let steps = 0, refusals = 0;
  const limit = opts.maxSteps || 20000;
  while (!st.over) {
    if (++steps > limit) throw new Error("game did not end in " + limit + " steps at " + st.phase + "." + st.step + " turn " + st.turn);
    if (!res.waiting) throw new Error("machine stopped with nothing pending at " + st.phase + "." + st.step);
    const req = res.waiting;
    requests[req.kind] = (requests[req.kind] || 0) + 1;
    const p = st.players[req.player];
    const rngBefore = st.rng;
    const answer = p.seat === "bot" ? botAnswer(st, library, req) : human(st, library, req, refusals);
    if (st.rng !== rngBefore) throw new Error("a policy moved the shared RNG while answering " + req.kind);
    res = step(st, library, answer);
    if (res.refused) {
      if (++refusals > 5) throw new Error("no legal answer found for " + req.kind + " by " + p.name + ": " + JSON.stringify(answer));
      continue;
    }
    refusals = 0;
    assertInvariants(st, library);
  }
  return { state: st, turns: st.turn, winner: st.winner, unfinished: st.unfinished, steps, requests };
}

/** Many games on one course, summarised. */
export function runSim(opts, games = 20) {
  const out = { games, decided: 0, unfinished: 0, turns: 0, wins: {}, requests: {}, crashes: [] };
  for (let g = 0; g < games; g++) {
    try {
      const r = runGame({ ...opts, seed: (opts.seed || 1) + g });
      out.turns += r.turns;
      if (r.winner !== null && r.winner !== undefined) { out.decided++; out.wins[r.winner] = (out.wins[r.winner] || 0) + 1; }
      if (r.unfinished) out.unfinished++;
      for (const k of Object.keys(r.requests)) out.requests[k] = (out.requests[k] || 0) + r.requests[k];
    } catch (e) {
      out.crashes.push({ seed: (opts.seed || 1) + g, error: e.message });
    }
  }
  out.avgTurns = out.games ? +(out.turns / out.games).toFixed(1) : 0;
  return out;
}
