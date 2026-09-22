/* Sites: markings a square carries IN ADDITION to what it is.
 *
 * A repair site, an upgrade site and an energy space were ground elements, one
 * to a square, because that is how the old data spelled them. They are not one
 * to a square. THE SAME PRINTED SQUARE CARRIES MORE THAN ONE, and which of them
 * is live is decided at play time by the ruleset in force -- a wrench for the
 * classic game, a battery for the 2016 one, on the same piece of floor. Making
 * them elements forced a choice the board does not make.
 *
 * A FLAG LOCATION is the same kind of thing and the reason this layer exists.
 * The board marks where a flag MAY go -- five or six of them on a map is the
 * shape to aim for -- and the engine picks the three or so a given race
 * actually uses. So a flag spot has to be able to sit on a wrench, an upgrade
 * or a battery, because those are exactly the squares worth racing to.
 *
 * WHERE A MARKING MAY BE PRINTED IS A FACT ABOUT THE MARKING, not about this
 * layer, and treating it as the latter was wrong. Four of these are collection
 * markings -- a robot comes to rest on them and picks something up -- so they
 * sit on plain floor and nothing else, because a belt, a gear or a pit is not
 * somewhere a robot rests. `place: "floor"` says so.
 *
 * A RANDOMIZER IS NOT A COLLECTION MARKING. It fires when you REVEAL a card
 * while standing on it, at the top of a register, and a robot is perfectly able
 * to be standing on a conveyor at that moment. Pushy prints randomizers
 * directly on belt squares. So it is `place: "standable"` -- any square a robot
 * can occupy, which is everything except a pit and a hole.
 *
 * It was a ground element (`z`) until 2026-09-17, and one ground token holds one
 * element, so the belt and the randomizer could not both be on the square. It is
 * a marking, and this is the layer for markings.
 */

const BOTH = ["classic", "modern"];
const CLASSIC = ["classic"];
const MODERN = ["modern"];

export const SITES = {
  repair: {
    name: "Repair site", short: "one wrench", printedIn: CLASSIC,
    place: "floor", playsIn: BOTH, props: { repair: 1 },
    source: "Classic pp.28-29. Removed from the 2016 boards, which print energy here instead."
  },
  upgrade: {
    name: "Upgrade site", short: "two wrenches", printedIn: CLASSIC,
    place: "floor", playsIn: BOTH, props: { repair: 2, option: true },
    source: "Classic p.36: repair two, or take an option card."
  },
  battery: {
    name: "Energy space", short: "a battery", printedIn: MODERN,
    place: "floor", playsIn: BOTH, props: { energy: 1 },
    source: "Modern Game Guide. Take an energy cube for ending a register on it."
  },
  flagspot: {
    name: "Flag location", short: "a flag may go here", printedIn: BOTH,
    place: "floor", playsIn: BOTH, props: { flagspot: true },
    source: "Ours. The board says where a flag MAY stand; the engine picks which ones a race uses."
  },
  randomizer: {
    name: "Randomizer", short: "a randomizer", printedIn: MODERN,
    place: "standable", props: { randomize: true },
    source: "Chaos and Carnage. Reveal a card in a register while standing on one and that " +
            "register is discarded and replaced with the top card of your own deck. It fires on " +
            "the reveal rather than on coming to rest, which is why it may be printed on a belt."
  }
};

/* `playsIn` is which books can RESOLVE the marking, and it is wider than
 * `printedIn` for the four collection markings: a 2016 game meets a printed
 * wrench and simply has no use for it, and a classic game does the same with a
 * battery, so neither narrows the board to one book. That is what the swap rule
 * relies on. THE RANDOMIZER IS DIFFERENT and declares no `playsIn`, so it falls
 * back to printedIn: the classic book has no rule for it at all, and a board
 * carrying one is a 2016 board. Same shape as a device's `playsIn` in
 * devices.js, and read the same way by playableIn(). */

/** Canonical order, so a `has` list has exactly one spelling. */
export const SITE_ORDER = ["repair", "upgrade", "battery", "randomizer", "flagspot"];

/* A square is printed with one wrench or two, never both -- they are the same
 * marking at two strengths. Everything else stacks: a battery may share a
 * square with either wrench, because the two games print different things in
 * the same place, and a flag location may sit on any of them. */
export const EXCLUSIVE = [["repair", "upgrade"]];

export function siteOf(key) { return SITES[key]; }

/** Where this marking may be printed: "floor" (plain floor only) or "standable". */
export function sitePlace(key) { return SITES[key] ? SITES[key].place : undefined; }

export function siteKeys() { return SITE_ORDER.slice(); }

/** Sort a `has` list into canonical order, dropping duplicates and unknowns. */
export function canonSites(has) {
  if (!Array.isArray(has)) return [];
  const seen = new Set(has.filter(k => SITES[k]));
  return SITE_ORDER.filter(k => seen.has(k));
}

/** Short reasons a `has` list is not acceptable; empty when it is. */
export function checkSites(has) {
  const bad = [];
  if (!Array.isArray(has)) return ["must be an array of site names"];
  if (!has.length) return ["is empty; leave the square out instead"];
  const seen = new Set();
  for (const k of has) {
    if (!SITES[k]) bad.push(JSON.stringify(k) + " is not a site");
    else if (seen.has(k)) bad.push(JSON.stringify(k) + " is listed twice");
    seen.add(k);
  }
  for (const pair of EXCLUSIVE) {
    if (pair.every(k => seen.has(k))) {
      bad.push("has both " + pair.map(k => SITES[k].name.toLowerCase()).join(" and ") +
        ", and a square is printed with one or the other");
    }
  }
  return bad;
}

/** The behaviour properties a square's sites give it, merged. */
export function siteProps(has) {
  const out = {};
  for (const k of canonSites(has)) Object.assign(out, SITES[k].props);
  return out;
}

/* --- authored markings ---------------------------------------------------
 *
 * A board's markings are transcribed from the print, with one exception, and
 * the exception is now HISTORY RATHER THAN A PROCESS. The swap rule put a
 * battery on every wrench square and a wrench on every battery square, so that
 * a board printed for one edition still had something to offer the other, and
 * it wrote "authored <marking>" into the square's note to say which of the two
 * it had invented.
 *
 * THE TOOL THAT APPLIED IT IS GONE (2026-09-16) and nothing re-applies it. A
 * square marked both is a square marked both, and that is fine: the engine
 * takes whichever the ruleset in force reads, a wrench under the classic
 * rules and a battery under the 2016 ones, because a marking is a property of
 * the square and not a conversion anybody performs. Marking squares is done on
 * the map now, by hand, in the workshop.
 *
 * What stays is the READER below, because the notes are still in the data and
 * they are still the record of which markings were invented rather than read
 * off a photograph. The writer went with the tool: nothing should be minting
 * these notes any more. */
export const SWAP_RULE = "the swap rule: a battery on every wrench, a wrench on every battery; not printed";

/** The markings a site note declares as authored, e.g. ["battery"]. */
export function authoredOf(note) {
  const out = [];
  for (const m of String(note || "").matchAll(/\bauthored (repair|upgrade|battery|flagspot)\b/g)) out.push(m[1]);
  return out;
}
