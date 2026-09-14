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

  /* An express conveyor moves once in its OWN step and then again with the
   * normal ones, which is how it covers two squares. The modern game does not
   * work that way -- see modern.js -- and this is the flag that says so rather
   * than a branch in the inspector. */
  expressAlsoRunsWithNormals: true,

  /* OIL AND PORTALS ARE ONE TILE EACH, printed the same in both boxes, and
   * these two keys are the whole of what the editions do differently with them.
   * They live here because they are resolution, not printing -- and they are
   * here rather than nowhere because the legend used to carry the difference as
   * two element characters, and merging those must not become forgetting this.
   * check-lib.js asserts both rulesets define both keys and that they disagree.
   *
   * A slide meeting a robot: the classic slide STOPS there. AMIGO's Crash and
   * Burn Spielanleitung -- a robot ending its move on oil slides on until it is
   * off the oil, is stopped by a wall, or would slide into a robot. */
  oilSlidePushes: false,

  /* When a portal will not fire: while a robot stands on EITHER end of the
   * pair, which switches the whole pair off rather than only the far side. */
  portalBlockedBy: "eitherEnd",

  /* The board's turn, in printed order. */
  order: [
    { step: "expressConveyor", name: "Express conveyors move one", settled: true },
    { step: "conveyor", name: "All conveyors move one", settled: true },
    { step: "pusher", name: "Pushers shove", settled: true },
    { step: "gear", name: "Gears turn a quarter", settled: true },
    /* The same device the modern order calls a crusher, in the same slot. The
     * NAME is the classic book's; the tile is one tile. See devices.js. */
    { step: "crusher", name: "Presses come down", settled: true },
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
