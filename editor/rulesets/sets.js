/* Editions, and the boxes a board can have come out of.
 *
 * A set belongs to exactly ONE edition, and a board whose set disagrees with
 * its own edition is a transcription error rather than a variant: there is no
 * Armed and Dangerous board in the 2016 game. The validator says so.
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

  modernBase:        { name: "Base Game",    edition: "modern",  box: "Robo Rally (2016)" },
  wetAndWild:        { name: "Wet and Wild", edition: "modern",  box: "Wet and Wild" },
  chaosAndCarnage:   { name: "Chaos and Carnage", edition: "modern", box: "Chaos and Carnage" },
  thrillsAndSpills:  { name: "Thrills and Spills", edition: "modern", box: "Thrills and Spills" },
  masterBuilder:     { name: "Master Builder",     edition: "modern", box: "Master Builder" },

  /* Twenty-six 2016 boards are photographed and named but nothing records which
   * box each came out of. A guess there would be indistinguishable from a fact,
   * so they sit here until something settles it. */
  modernUnfiled:     { name: "Modern, box unrecorded", edition: "modern", box: "Not established" }
};

export const ORIGINS = ["transcribed", "authored"];

export function setOf(id) { return SETS[id]; }
export function editionOf(id) { return EDITIONS[id]; }
