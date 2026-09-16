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
 * Sites sit ON plain floor. Every one of them is somewhere a robot comes to
 * rest to collect something, and a belt, a gear or a pit is not somewhere a
 * robot rests.
 */

const BOTH = ["classic", "modern"];
const CLASSIC = ["classic"];
const MODERN = ["modern"];

export const SITES = {
  repair: {
    name: "Repair site", short: "one wrench", printedIn: CLASSIC,
    props: { repair: 1 },
    source: "Classic pp.28-29. Removed from the 2016 boards, which print energy here instead."
  },
  upgrade: {
    name: "Upgrade site", short: "two wrenches", printedIn: CLASSIC,
    props: { repair: 2, option: true },
    source: "Classic p.36: repair two, or take an option card."
  },
  battery: {
    name: "Energy space", short: "a battery", printedIn: MODERN,
    props: { energy: 1 },
    source: "Modern Game Guide. Take an energy cube for ending a register on it."
  },
  flagspot: {
    name: "Flag location", short: "a flag may go here", printedIn: BOTH,
    props: { flagspot: true },
    source: "Ours. The board says where a flag MAY stand; the engine picks which ones a race uses."
  }
};

/** Canonical order, so a `has` list has exactly one spelling. */
export const SITE_ORDER = ["repair", "upgrade", "battery", "flagspot"];

/* A square is printed with one wrench or two, never both -- they are the same
 * marking at two strengths. Everything else stacks: a battery may share a
 * square with either wrench, because the two games print different things in
 * the same place, and a flag location may sit on any of them. */
export const EXCLUSIVE = [["repair", "upgrade"]];

export function siteOf(key) { return SITES[key]; }

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

/* --- every marking on a board is transcribed -------------------------------
 *
 * THE SWAP RULE IS GONE, and this note is here so nobody reinvents it. It put
 * a battery on every wrench square and a wrench on every battery square, so
 * that a board printed for one edition would still have something to offer
 * the other, and it wrote "authored <marking>" into the square's note so the
 * invention could be told from the print.
 *
 * It was a reasonable answer to boards that marked only one of the three. It
 * stopped being one when the boards came to mark batteries, repair sites and
 * upgrade sites separately, each read off the photograph: the rule then
 * doubled work that had already been done properly, and a 2016 board whose
 * eight energy spaces were all correctly marked came out with eight repair
 * sites nobody had ever printed. Far too many, and wrong in the specific way
 * this repository cares about -- data that looks transcribed and is not.
 *
 * The 69 markings it had added were stripped from the shipped boards by
 * reading back those same notes, so what is left on every square is what
 * somebody read off a photograph. A board that marks no repair site now has
 * none, and that is the honest answer rather than a generated one.
 */
