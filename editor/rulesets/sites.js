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

/* --- authored markings ---------------------------------------------------
 * A board's markings are transcribed from the print, with one exception: the
 * swap rule (editor/tools/swap-sites.js) adds a battery to every wrench square
 * and a wrench to every battery square so most boards play under either
 * ruleset. Such a marking is NOT printed, and the square's site note says so
 * in a form these two functions write and read, so a tool comparing the data
 * with the print can strip exactly the authored part. */
export const SWAP_RULE = "the swap rule: a battery on every wrench, a wrench on every battery; not printed";

/** The note fragment declaring one marking authored. */
export function authoredNote(key) { return "authored " + key + " -- " + SWAP_RULE; }

/** The markings a site note declares as authored, e.g. ["battery"]. */
export function authoredOf(note) {
  const out = [];
  for (const m of String(note || "").matchAll(/\bauthored (repair|upgrade|battery|flagspot)\b/g)) out.push(m[1]);
  return out;
}
