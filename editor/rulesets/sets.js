/* Editions, and the boxes a board can have come out of.
 *
 * BOTH ARE PROVENANCE. A board records which box it came out of because that is
 * a fact about the board; it does not record which game it is "for", because a
 * board is not for a game. Which elements matter is decided at play time by the
 * ruleset in force, not here.
 *
 * EDITIONS is still real -- it names the two rulesets an engine can play under,
 * and the editor uses it as a LENS (see rulesets/index.js) to say what a robot
 * standing on a square would meet and in what order. A lens is not a filter.
 */

export const EDITIONS = {
  classic: { name: "Classic", years: "1994-2005" },
  modern:  { name: "Modern",  years: "2016-" }
};

export const SETS = {
  authored:          { name: "Authored",     edition: "both",    box: "Not from any box" },

  base:              { name: "Base Game",    edition: "classic", box: "RoboRally (1994-2005)" },
  armedAndDangerous: { name: "Armed and Dangerous", edition: "classic", box: "Armed and Dangerous" },
  crashAndBurn:      { name: "Crash and Burn",      edition: "classic", box: "Crash and Burn" },

  modernBase:        { name: "Base Game",    edition: "modern",  box: "Robo Rally (2023)" },   // the named boards; the 2016 box's are lettered 1A-6B and none is transcribed
  wetAndWild:        { name: "Wet and Wild", edition: "modern",  box: "Wet and Wild" },
  chaosAndCarnage:   { name: "Chaos and Carnage", edition: "modern", box: "Chaos and Carnage" },
  thrillsAndSpills:  { name: "Thrills and Spills", edition: "modern", box: "Thrills and Spills" },
  masterBuilder:     { name: "Master Builder",     edition: "modern", box: "Master Builder" },

  /* Where a board came out of is taken from Gareth's list of the official
   * boards by expansion, https://tartarus.org/gareth/roborally/boards/official
   * (the author's reference for this, 2026-09-23), not inferred from what
   * is printed on it: Chasm and Gear Box carry teleporters but are Armed and
   * Dangerous boards, Coliseum has levels but is not Wet and Wild's. Nothing
   * sits here now; the row stays for a board photographed before its box is
   * looked up. */
  modernUnfiled:     { name: "Modern, box unrecorded", edition: "modern", box: "Not established" }
};

/* "course": a whole course flattened into one board so it can be edited square
 * by square in the board workshop; the only origin that may carry holes */
export const ORIGINS = ["transcribed", "authored", "course"];

export function setOf(id) { return SETS[id]; }
export function editionOf(id) { return EDITIONS[id]; }
