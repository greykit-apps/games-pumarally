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
   * What makes a robot slide. Crash and Burn (AMIGO Spielanleitung p.7,
   * manual1/IMG_1227): a robot that ENDS ITS MOVEMENT on oil slides on in the
   * direction it was going until it reaches a square without oil, or stops
   * before a wall or before a robot that is not itself on oil; a robot on the
   * same slick is shoved along and both slide. "Ein Roboter rutscht nicht,
   * solange er in Bewegung ist" -- the slide happens once, after the card.
   * Starting a move on oil costs one square, so a Move 1 from oil goes nowhere
   * and does not then skid; rotation is unaffected. The book states the slide
   * for a robot's own movement and shows only card moves; it says nothing
   * about a belt dropping a robot on oil or a push ending there, so the
   * classic list carries the stated case only. (An earlier draft of this file
   * said the classic slide stops at ANY robot. The photograph says otherwise,
   * and the editions agree on the shove.) */
  oilSlideAfter: ["card"],

  /* When a portal will not fire. Crash and Burn p.8 (manual1/IMG_1228): "Steht
   * ein Roboter auf einem Portalfeld, dann sind sofort beide Portale der
   * gleichen Farbe ausgeschaltet" -- a robot standing on EITHER end switches
   * the pair off, and a switched-off portal is ordinary floor. The 2016 sheet
   * says only that an occupied DESTINATION refuses. The two wordings pick out
   * the same positions, because a square holds one robot: the only end that
   * can be occupied when a robot enters the other is the far one. The engine
   * therefore has one portal, and this key records the book's own wording. */
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
