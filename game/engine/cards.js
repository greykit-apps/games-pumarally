/* The program cards, from the lifted tables. A card index is a place in the
 * ruleset's card table, so `card(st, i)` needs the state to know which.
 *
 * Classic: one shared deck of 84, each card carrying the printed priority.
 * Modern: every robot owns the same twenty (indices 0..19 of MODERN_CARDS),
 * and the forty damage cards of the table's one damage deck follow them
 * (20..59). One index space, because a SPAM card moves into a robot's own
 * deck and is dealt back into its hand; two tables would mean the same
 * number naming a different card depending on which pile it was in.
 */
import CARDS_DATA from "../data/cards.js";

export const CARDS = CARDS_DATA;
export const KINDS = CARDS.kinds;

/** The classic 84, generated from the printed ranges. Priorities are unique. */
export const CLASSIC_DECK = (() => {
  const out = [];
  for (const [kind, lo, hi, by] of CARDS.classic.ranges) {
    for (let p = lo; p <= hi; p += by) out.push({ kind, pri: p });
  }
  return out;
})();

/* A robot's twenty, in the order the photograph lays them out (IMG_1308),
 * then the damage deck: forty, all SPAM, because the Haywire faces are not
 * photographed and the split between the two is not printed. */
export const MODERN_DECK = (() => {
  const out = [];
  for (const [kind, n] of Object.entries(CARDS.modern.deckCounts)) for (let i = 0; i < n; i++) out.push({ kind });
  return out;
})();
export const MODERN_DAMAGE = (() => {
  const out = [];
  for (let i = 0; i < CARDS.modern.damageCounts.spam; i++) out.push({ kind: "spam", damage: true });
  for (const h of CARDS.modern.haywire) out.push({ kind: "haywire", damage: true, face: h.id, text: h.text });
  if (out.length !== CARDS.modern.damageSize) throw new Error("the damage deck is " + out.length + " cards, not " + CARDS.modern.damageSize);
  return out;
})();
export const HAYWIRE_FACES = CARDS.modern.haywire;
export const MODERN_CARDS = MODERN_DECK.concat(MODERN_DAMAGE);
export const MODERN_DECK_SIZE = CARDS.modern.deckSize;
export const MODERN_DAMAGE_SIZE = CARDS.modern.damageSize;
export const MODERN_DAMAGE_FIRST = MODERN_DECK.length;

export const REGISTERS = CARDS.classic.registers;
export const HAND = CARDS.classic.handSize;
export const MAX_DAMAGE = CARDS.classic.maxDamage;
export const START_ENERGY = CARDS.modern.startEnergy;
export const MAX_ENERGY = CARDS.modern.maxEnergy;
export const UPGRADE_START = CARDS.modern.upgradeStart;
export const UPGRADE_DRAW_COST = CARDS.modern.upgradeDrawCost;
export const INSTALL_LIMIT = CARDS.modern.installLimit;

export function isModern(st) { return st.ruleset === "modern"; }

/** A card by index, for the ruleset in play. */
export function card(st, i) {
  return isModern(st) ? MODERN_CARDS[i] : CLASSIC_DECK[i];
}

/** Is this index a damage card? Only the modern table has any. */
export function isDamage(st, i) {
  return isModern(st) && i >= MODERN_DAMAGE_FIRST;
}

/** Registers still open at this damage: five at four or less, then one fewer each. */
export function openRegisters(damage) { return Math.max(0, Math.min(REGISTERS, HAND - damage)); }
/** Cards dealt at this damage: nine minus damage, none at nine. */
export function cardsDealt(damage) { return Math.max(0, HAND - damage); }

/** What a card does: { turn }, { move }, { energy }, { again } or nothing. */
export function planOf(cd) {
  const k = KINDS[cd.kind];
  if (k.turn !== undefined) return { kind: "turn", turn: k.turn };
  if (k.move !== undefined) return { kind: "move", dist: k.move };
  if (cd.kind === "powerUp") return { kind: "energy", gain: 1 };
  if (cd.kind === "again") return { kind: "again" };
  return { kind: "none" };
}
