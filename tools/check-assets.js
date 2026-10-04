#!/usr/bin/env node
/*
 * Every local file index.html points at must exist -- and every icon its
 * web manifest names.
 *
 *   node tools/check-assets.js
 *
 * greykit.games canon (games-meta STANDARD.md §10): byte-identical in every
 * Tactical game's tools/; the copy of record is games-meta's
 * canon/check-assets.js, and tools/diff-standard.sh there says where a copy
 * differs. Run by each game's CI in its validate stage, ahead of deploy.
 *
 * A missing favicon, manifest or social image does not break a build, fail a
 * pipeline, or throw in a console -- it 404s quietly in production while
 * everything reports green. A sibling game shipped exactly that way: four
 * assets referenced in its <head>, none of them in the repo. Absolute URLs
 * under the game's own address (its og:url) are checked too, since those are
 * the same files named the long way round.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/);
const SITE = ogUrl ? ogUrl[1].replace(/\/?$/, "/") : null;

/** A reference as a path in the repo, or null when it is not a local file. */
function local(ref, base) {
  let rel = null;
  if (SITE && ref.startsWith(SITE)) rel = ref.slice(SITE.length);
  else if (!/^([a-z]+:)?\/\//i.test(ref) && !/^(#|data:|mailto:|javascript:)/i.test(ref)) rel = path.join(base, ref);
  if (rel === null) return null;
  rel = rel.split(/[?#]/)[0];
  return rel || null;
}

const refs = [];
for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)) refs.push(["index.html", m[1], "."]);
for (const m of html.matchAll(/<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"/g)) refs.push(["index.html", m[1], "."]);

/* the manifest's icons, relative to the manifest */
const man = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/);
const manRel = man && local(man[1], ".");
if (manRel && fs.existsSync(path.join(root, manRel))) {
  let icons = [];
  try { icons = JSON.parse(fs.readFileSync(path.join(root, manRel), "utf8")).icons || []; }
  catch (e) { console.error(`  error:   ${manRel} is not valid JSON: ${e.message}`); process.exit(1); }
  for (const ic of icons) if (ic && ic.src) refs.push([manRel, ic.src, path.dirname(manRel)]);
}

const missing = [];
const seen = new Set();
for (const [from, ref, base] of refs) {
  const rel = local(ref, base);
  if (!rel || seen.has(from + " " + rel)) continue;
  seen.add(from + " " + rel);
  if (!fs.existsSync(path.join(root, rel))) missing.push(`${from} references ${rel}, which is not in the repo`);
}

/* A check that checks nothing must never read as a pass. */
if (seen.size === 0) {
  console.error("asset check: index.html references no local files -- refusing to pass vacuously");
  process.exit(1);
}
console.log(`checked ${seen.size} local asset reference(s) in index.html${manRel ? " and " + manRel : ""}`);
if (missing.length) {
  for (const m of missing) console.error(`  error:   ${m}`);
  console.error(`\n${missing.length} missing asset(s)`);
  process.exit(1);
}
