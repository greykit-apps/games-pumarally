/* The Classic ruleset, 1994-2005.
 *
 * What the EDITOR needs from a ruleset is narrower than what an engine will:
 * which elements and devices may appear, in what order the board takes its
 * turn (so the inspector can say "this fires in register 3, after the gears and
 * before the lasers"), and the flag placement rules.
 *
 * `settled: false` on an order entry means the source photographs do not state
 * where that step falls. It is shown to the reader as unsettled rather than
 * being guessed into a number, because an order that is merely plausible is
 * indistinguishable from one that is right.
 */

export default {
  id: "classic",
  name: "Classic",
  years: "1994-2005",

  /* Flags must be within this many squares of the one before, measured as a
   * CHEBYSHEV distance -- the larger of the two axis differences, so "twelve"
   * is a reach of one board's span in any direction rather than twelve steps of
   * travel. A rulebook heuristic about race length that happens to equal a
   * classic board's width, which is exactly why it used to be written as `% 12`
   * in the geometry and read as the same twelve. It is not the same twelve. */
  maxFlagGap: 12,

  /* The board's turn, in printed order. */
  order: [
    { step: "expressConveyor", name: "Express conveyors move one", settled: true },
    { step: "conveyor", name: "All conveyors move one", settled: true },
    { step: "pusher", name: "Pushers shove", settled: true },
    { step: "gear", name: "Gears turn a quarter", settled: true },
    { step: "press", name: "Presses come down", settled: true },
    { step: "boardLaser", name: "Board lasers fire", settled: true },
    { step: "robotLaser", name: "Robots fire", settled: true },
    { step: "jet", name: "Flame jets fire", settled: true,
      note: "After the lasers, alone among elements -- Crash and Burn states this outright." },
    { step: "checkpoint", name: "Flags and repair sites are touched", settled: true }
  ],

  /* A flag may only stand on plain floor, and never on any of these. Each is a
   * square a robot cannot simply stand still on, so a flag there could not be
   * reliably touched. */
  flagForbids: ["pit", "belt", "gear", "repair", "oil", "portal", "dock", "water", "ramp"]
};
