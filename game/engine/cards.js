/* The program cards, from the lifted tables. A card index is a place in the
 * ruleset's deck table, so `card(st, i)` needs the state to know which. */
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

export const REGISTERS = CARDS.classic.registers;
export const HAND = CARDS.classic.handSize;
export const MAX_DAMAGE = CARDS.classic.maxDamage;

/** A card by index, for the ruleset in play. */
export function card(st, i) {
  return CLASSIC_DECK[i];
}

/** Registers still open at this damage: five at four or less, then one fewer each. */
export function openRegisters(damage) { return Math.max(0, Math.min(REGISTERS, HAND - damage)); }
/** Cards dealt at this damage: nine minus damage, none at nine. */
export function cardsDealt(damage) { return Math.max(0, HAND - damage); }

/** What a card does: { turn } or { move }. */
export function planOf(cd) {
  const k = KINDS[cd.kind];
  if (k.turn !== undefined) return { kind: "turn", turn: k.turn };
  if (k.move !== undefined) return { kind: "move", dist: k.move };
  return { kind: "none" };
}
