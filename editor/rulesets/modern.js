/* The Modern ruleset, 2016-.
 *
 * NOT THE CLASSIC RULES IN NEW ART. The differences that reach the board are
 * real: a belt does not push, a rotating belt turns a robot only when the belt
 * carried it on FROM A CURVED-ARROW SPACE, double-arrow belts move two and
 * resolve BEFORE single-arrow ones (classic runs express alone, then express
 * and normal together), and there are no repair or upgrade sites at all.
 *
 * THE MODERN SOURCES ARE NOT ALL ONE PRINTING. The 2023 reference card says
 * Priority Token where the Game Guide's box contents list a plastic priority
 * antenna, and the two disagree about the size of the damage deck. Where they
 * disagree, nothing here picks a winner.
 */

export default {
  id: "modern",
  name: "Modern",
  years: "2016-",

  /* The modern books state no equivalent of Northrup's twelve. Checkpoints are
   * placed tokens rather than printed, and nothing photographed here limits how
   * far apart they may go. Null means the check does not run, rather than a
   * number nobody can cite. */
  maxFlagGap: null,

  /* A double-arrow belt moves TWO in its own step and does not run again with
   * the single-arrow ones. Classic reaches two squares the other way round --
   * express once alone, then once more with everything -- which is the same
   * distance by a different route, and matters wherever a robot is in the way
   * for one pass and not the other. */
  expressAlsoRunsWithNormals: false,

  /* The classic counterparts of these two, and the reason both rulesets carry
   * them: see the note in classic.js. Oil and portals are one printed tile each
   * and the editions differ only here.
   *
   * What makes a robot slide. Thrills and Spills (manual1/IMG_1247-1251): a
   * slide is triggered by register movement, by dropping off a belt, and by
   * being pushed -- three triggers where the classic book states one. The
   * slide itself is the same in both books: on until off the oil, a wall, or a
   * robot with grip; a robot that is in oil is shoved and both slide. */
  oilSlideAfter: ["card", "belt", "push"],

  /* When a portal will not fire: "occupied destination means it does not fire
   * and the space is ordinary floor" (Thrills and Spills). The classic book
   * words it as a robot on either end switching the pair off; see classic.js
   * for why the two wordings agree on every reachable position. */
  portalBlockedBy: "destination",

  /* Wet and Wild's fold-out prints a numbered order, and it is the one that
   * integrates the expansion elements into the core sequence. */
  order: [
    { step: "expressConveyor", name: "Blue belts move two", settled: true,
      note: "Double-arrow belts resolve BEFORE single-arrow ones, unlike classic express." },
    { step: "conveyor", name: "Green belts move one", settled: true },
    { step: "current", name: "Currents convey", settled: true },
    { step: "pusher", name: "Push panels shove", settled: true },
    { step: "gear", name: "Gears turn a quarter", settled: true },
    { step: "crusher", name: "Crushers come down", settled: true },
    { step: "boardLaser", name: "Board lasers fire", settled: true },
    { step: "robotLaser", name: "Robots fire", settled: true },
    { step: "flamer", name: "Flamers burn", settled: false,
      note: "Thrills and Spills describes a flamer as active for the WHOLE of its registers " +
            "rather than firing at an instant, so it may not be a step in this list at all. " +
            "Not placed from a source that states it." },
    { step: "checkpoint", name: "Energy is taken and checkpoints are touched", settled: true }
  ],

  flagForbids: ["pit", "belt", "gear", "oil", "portal", "dock", "water", "ramp",
                "randomize", "teleport", "energy", "antenna", "reboot"]
};
