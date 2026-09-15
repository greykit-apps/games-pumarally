/* Phase activation — which registers a device fires in.
 *
 * ONE SPELLING OF "EVERY REGISTER": omit the key.
 *
 * Not `[]`, not `[1,2,3,4,5]`. Both are refused by the validator with a message
 * saying to omit it instead. The old format accepted the absent form and the
 * empty form as the same thing, which meant two boards could say the same thing
 * two ways and a diff between them showed a change that was not one.
 *
 * Register numbers are 1-5 EVERYWHERE in this codebase, matching the numbers
 * printed on the board. The old engine used 0-based registers internally and
 * 1-based in the data, and the conversion between them was a standing tax. If a
 * future engine wants 0-based indices it converts at its own boundary.
 */

export const REGISTERS = [1, 2, 3, 4, 5];
export const REGISTER_COUNT = 5;

/**
 * Does a device with this register list fire in this register?
 * An absent or null list means every register — see the note above.
 */
export function firesIn(regs, register) {
  return !regs || regs.indexOf(register) >= 0;
}

/**
 * Sort and de-duplicate a register list into canonical form, or return null for
 * the "every register" case so that callers cannot accidentally store `[]`.
 * Anything not in 1-5 is dropped; `checkRegs` is what reports that as an error.
 */
export function canonRegs(regs) {
  if (!regs || !regs.length) return null;
  const seen = new Set();
  for (const n of regs) if (REGISTERS.indexOf(n) >= 0) seen.add(n);
  if (!seen.size || seen.size === REGISTER_COUNT) return null;
  return [...seen].sort((a, b) => a - b);
}

/**
 * Validate a raw register list as it appears in a file. Returns an array of
 * short reasons, empty when the list is acceptable.
 *
 * `required` is true for swing doors: a door open in every register is not a
 * door and one open in none is a wall, so both are spelled as the thing they
 * are and neither may be written as a door.
 */
export function checkRegs(regs, { required = false } = {}) {
  const bad = [];
  if (regs === undefined || regs === null) {
    if (required) bad.push("must list the registers it stands open in");
    return bad;
  }
  if (!Array.isArray(regs)) return ["must be an array of register numbers"];
  if (!regs.length) {
    bad.push(required
      ? "must list the registers it stands open in"
      : "is empty; omit `regs` instead to fire in every register");
    return bad;
  }
  for (const n of regs) {
    if (!Number.isInteger(n) || n < 1 || n > REGISTER_COUNT) {
      bad.push("has " + JSON.stringify(n) + ", which is not a register 1-5");
    }
  }
  if (bad.length) return bad;
  for (let i = 1; i < regs.length; i++) {
    if (regs[i] <= regs[i - 1]) {
      bad.push("must be ascending with no repeats");
      break;
    }
  }
  if (regs.length === REGISTER_COUNT) {
    bad.push(required
      ? "stands open in every register, which is not a door"
      : "lists all five registers; omit `regs` instead");
  }
  return bad;
}

/** "1, 3 and 5" / "every register" — for diagnostics and the inspector. */
export function describeRegs(regs) {
  if (!regs || !regs.length) return "every register";
  if (regs.length === 1) return "register " + regs[0];
  return "registers " + regs.slice(0, -1).join(", ") + " and " + regs[regs.length - 1];
}
