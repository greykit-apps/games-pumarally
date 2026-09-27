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

/* `year` IS WHEN THE BOX CAME OUT, so the setup screen can shelve the boxes
 * in the order they were released and tell the two modern base games apart.
 * Taken from Wikipedia's RoboRally article (retrieved 2026-09-27), which
 * lists the Wizards of the Coast boxes and each Renegade release with its
 * year. Crash and Burn is the English release's 1997; the German AMIGO print
 * photographed for this library came later. A row with no box has no year
 * and shelves last. */
/* `tint` IS THE BOX ART'S COLOUR, which the setup screen washes its card in.
 * Two sources. The author's own word (2026-09-27): the original game a
 * medium-dark red, Crash and Burn a deep green, Radioactive a bright green,
 * the 2016 base game and the 30th Anniversary silver -- each kept at the
 * shade described, so the two
 * greens and the two reds stay apart. And, read by eye off the author's
 * photographs as a hue at one shared saturation and brightness, the boxes of
 * Wet and Wild (manual1/IMG_1235), Chaos and Carnage (IMG_1240), Thrills and
 * Spills (IMG_1247) and Turn & Burn (IMG_1463). A box with neither has no
 * tint and keeps the plain card. */
export const SETS = {
  authored:          { name: "Authored",     edition: "both",    box: "Not from any box" },

  base:              { name: "Base Game",    edition: "classic", box: "RoboRally (1994-2005)", year: 1994, tint: "#a8302a" },
  armedAndDangerous: { name: "Armed and Dangerous", edition: "classic", box: "Armed and Dangerous", year: 1995 },
  crashAndBurn:      { name: "Crash and Burn",      edition: "classic", box: "Crash and Burn", year: 1997, tint: "#237a3c" },
  /* The rest of Gareth's list, 2026-09-23. Each row is named as that page
   * names the board's source. Grand Prix and Radioactive are boxes; 2005 is
   * the boards first printed in the 2005 edition; Origins '99 is one board,
   * the final of that year's tournament, known from a scan. */
  /* Grand Prix's three boards -- Back Stretch, Canyon, Pit Row -- are filed
   * under Turn & Burn, which reprints them, by the author's decision of
   * 2026-09-27 with that box in hand. The row stays because Gareth's list
   * names the box. */
  grandPrix:         { name: "Grand Prix",   edition: "classic", box: "Grand Prix", year: 1997 },
  radioactive:       { name: "Radioactive",  edition: "classic", box: "Radioactive", year: 1998, tint: "#5ee04a" },
  classic2005:       { name: "2005",         edition: "classic", box: "RoboRally (2005)", year: 2005 },
  origins99:         { name: "Origins '99",  edition: "classic", box: "Not from any box: the Origins '99 tournament final", year: 1999 },

  modernBase:        { name: "Base Game",    edition: "modern",  box: "Robo Rally (2023)", year: 2023 },   // the named boards; the 2016 box's are lettered 1A-6B, filed below
  modern2016:        { name: "Base Game",    edition: "modern",  box: "Robo Rally (2016)", year: 2016, tint: "#b4bfcc" },   // the lettered boards 1A-6B, 10x10
  thirtieth:         { name: "30th Anniversary", edition: "modern", box: "Robo Rally 30th Anniversary", year: 2024, tint: "#b4bfcc" },
  wetAndWild:        { name: "Wet and Wild", edition: "modern",  box: "Wet and Wild", year: 2023, tint: "#4880e0" },
  chaosAndCarnage:   { name: "Chaos and Carnage", edition: "modern", box: "Chaos and Carnage", year: 2023, tint: "#9948e0" },
  thrillsAndSpills:  { name: "Thrills and Spills", edition: "modern", box: "Thrills and Spills", year: 2024, tint: "#e048a8" },
  masterBuilder:     { name: "Master Builder",     edition: "modern", box: "Master Builder", year: 2024 },
  /* Renegade's Turn & Burn: three double-sided boards, the three Grand Prix
   * boards turned a quarter and reprinted with batteries for wrenches, and
   * three new ones (Bounce House, Open Circuit, Check In). Photographed by
   * the author, manual1/IMG_1463-1477. */
  turnAndBurn:       { name: "Turn & Burn",        edition: "modern", box: "Turn & Burn", year: 2024, tint: "#e04d48" },

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

/** Every set id, oldest box first; a tie keeps the table's order, and a set with no year goes last. */
export function setsByYear() {
  const ids = Object.keys(SETS);
  return ids.map((id, i) => ({ id, i, y: SETS[id].year === undefined ? Infinity : SETS[id].year }))
    .sort((a, b) => a.y - b.y || a.i - b.i).map(x => x.id);
}

/** A set's heading: its name, "Classic base game" or "Modern base game" for a base box, and the year when the name does not already say it ("2005", "Origins '99"). */
export function setTitle(id) {
  const s = SETS[id];
  if (!s) return "Unfiled";
  const name = s.name === "Base Game" ? EDITIONS[s.edition].name + " base game" : s.name;
  const says = y => name.includes(String(y)) || name.includes("'" + String(y).slice(2));
  return s.year === undefined || says(s.year) ? name : name + " (" + s.year + ")";
}
export function editionOf(id) { return EDITIONS[id]; }
