/* Where a card's questions come, shared by the option and upgrade tables
 * (which import each other, so neither can own it).
 *
 * Two kinds of question, and the screen answers them two ways. A card that
 * acts on the programmed card itself -- Brakes turning a Move 1 into a Move
 * 0, Fourth Gear, an Emergency Switch at the reveal, a Power Slide after the
 * move, a temporary used before or after your card -- asks about a register
 * the player already knows the contents of, so it is planned register by
 * register under the slots. A card that reacts to the floor -- a Tractor
 * Beam when somebody is in line, a Turret's aim, Fire Control on a hit --
 * asks about a situation nobody can see while programming, so it is a
 * standing switch: used whenever it can be, or never.
 */

/** The hooks whose questions are about the card in the register: planned under the slots. */
export const PLAN_HOOKS = ["modifyMove", "onReveal", "afterCard"];

/** Where a card's questions come: { plan, switch }, read off which of its hooks pick. */
export function asksWhere(hooks) {
  const where = { plan: false, switch: false };
  for (const [h, fn] of Object.entries(hooks || {})) {
    if (!/\.pick\(/.test(String(fn))) continue;
    if (PLAN_HOOKS.includes(h)) where.plan = true; else where.switch = true;
  }
  return where;
}
