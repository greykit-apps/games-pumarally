#!/usr/bin/env node
/*
 * Fails when the page loads a local file the deploy doesn't ship.
 *
 *   node tools/check-ship.js            check (CI, validate stage)
 *   node tools/check-ship.js --list     also print every file it followed
 *
 * The deploy rsyncs the repo to greykit.com: an explicit file list, or the
 * whole directory minus --exclude patterns. Either way a file the page loads
 * can miss the trip and 404 while the pipeline goes green -- left off the
 * list (Retro Surfer '96, 2026-10-20: gk-intro.js and music.js, a black
 * screen on every device), caught by an exclude, or never committed (it works
 * on the desk and isn't in the CI checkout).
 *
 * Starts at every .html at the repo root that ships and follows the static
 * references: src= / href= in HTML, import / export-from / import() /
 * new Worker() / new URL() in JS, url() and @import in CSS. Every local
 * target must exist in the checkout and be shipped by the `- puma_rsync` line
 * in .gitlab-ci.yml; with an explicit list, the deploy job's
 * `artifacts: paths:` must carry it too. References built at run time aren't
 * seen. Reads .gitlab-ci.yml as text, so no dependencies.
 *
 * Shared by the split games (the ones whose page loads files of its own); the
 * copy of record is games-meta's canon/check-ship.js. Not in STANDARD.md, so
 * nothing compares the copies: change the canon file and copy it out.
 * check-assets.js (§10) asks whether index.html's own references exist; this
 * asks whether everything the page reaches, however deep, reaches the site.
 */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const listing = argv.includes("--list");
const root = path.resolve(argv.find((a) => !a.startsWith("--")) || path.join(__dirname, ".."));
const ci = fs.readFileSync(path.join(root, ".gitlab-ci.yml"), "utf8");
const GENERATED = new Set(["version.json"]); // written by the deploy job itself
const errors = [];
const fail = (msg) => { console.error(`  error: ${msg}`); process.exit(1); };

// --- what the deploy ships ------------------------------------------------
const line = ci.split("\n").find((l) => /^\s*- puma_rsync\b/.test(l));
if (!line) fail("no `- puma_rsync` line in .gitlab-ci.yml -- refusing to pass vacuously");
// Shell words: runs of unquoted characters and quoted strings, quotes removed.
const args = (line.replace(/^\s*- puma_rsync\s+/, "").match(/(?:[^\s'"]|"[^"]*"|'[^']*')+/g) || [])
  .map((t) => t.replace(/"([^"]*)"|'([^']*)'/g, "$1$2"));
const excludes = [];
const listed = new Set();
let wholeDir = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--exclude=")) excludes.push(a.slice(10));
  else if (a === "--exclude") excludes.push(args[++i]);
  else if (a.startsWith("--include")) fail(`--include in the rsync line isn't understood here: ${a}`);
  else if (a.startsWith("-") || a.includes("$") || a.includes("@")) continue;
  else if (a === "./" || a === ".") wholeDir = true;
  else listed.add(a.replace(/^\.\//, ""));
}
if (!wholeDir && listed.size === 0) fail("the `- puma_rsync` line names no source files -- refusing to pass vacuously");

// rsync's exclude rules, enough for the patterns these jobs use: a pattern
// with no slash matches any one path component; a leading slash anchors it at
// the root; a trailing slash matches only directories.
const glob = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\0/g, ".*") + "$");
const excludedBy = (rel) => {
  const parts = rel.split("/");
  for (const raw of excludes) {
    const dirOnly = raw.endsWith("/");
    const pat = raw.replace(/\/$/, "");
    if (pat.startsWith("/") || pat.includes("/")) {
      const re = glob(pat.replace(/^\//, ""));
      for (let n = 1; n <= parts.length; n++) {
        if ((!dirOnly || n < parts.length) && re.test(parts.slice(0, n).join("/"))) return raw;
        if (!pat.startsWith("/") && n > 1 && re.test(parts.slice(-n).join("/"))) return raw;
      }
    } else {
      const re = glob(pat);
      for (let n = 0; n < parts.length; n++) if ((!dirOnly || n < parts.length - 1) && re.test(parts[n])) return raw;
    }
  }
  return null;
};
const shipped = (rel) => (wholeDir ? !excludedBy(rel) : listed.has(rel) || [...listed].some((d) => rel.startsWith(d.replace(/\/?$/, "/"))));
const why = (rel) => (wholeDir ? `the rsync exclude '${excludedBy(rel)}' keeps it off the site` : "the rsync list doesn't ship it");

// --- what the page loads --------------------------------------------------
const local = (ref) => ref && !/^[a-z][a-z0-9+.-]*:|^\/\/|^#|^%23|^\$\{|^\//i.test(ref);
const scan = {
  ".html": [/\b(?:src|href)\s*=\s*["']([^"']+)["']/g, /<script[^>]*>([\s\S]*?)<\/script>/g],
  ".js": [/\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g, /\bexport\s*[\w*{}\s,$]+\s*from\s*["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g, /\bnew\s+(?:Shared)?Worker\(\s*["']([^"']+)["']/g, /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g],
  ".mjs": null,
  ".css": [/url\(\s*["']?([^"')]+)["']?\s*\)/g, /@import\s+["']([^"']+)["']/g],
};
scan[".mjs"] = scan[".js"];
const jsRes = scan[".js"];

const pages = wholeDir
  ? fs.readdirSync(root).filter((f) => f.endsWith(".html") && shipped(f))
  : [...listed].filter((f) => f.endsWith(".html"));
if (pages.length === 0) fail("no .html page ships -- refusing to pass vacuously");

const seen = new Set();
const queue = pages.map((p) => ({ rel: p, from: null }));
let refs = 0;
while (queue.length) {
  const { rel, from } = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  if (from) {
    refs++;
    if (listing) console.log(`  ${rel}`);
    if (!fs.existsSync(path.join(root, rel)) && !GENERATED.has(rel)) { errors.push(`${from} loads ${rel}, which is not in the repo`); continue; }
    if (!shipped(rel)) { errors.push(`${from} loads ${rel}, but ${why(rel)}`); continue; }
  }
  const ext = path.extname(rel);
  if (!scan[ext] || !fs.existsSync(path.join(root, rel)) || fs.statSync(path.join(root, rel)).isDirectory()) continue;
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  const found = [];
  if (ext === ".html") {
    const noComments = text.replace(/<!--[\s\S]*?-->/g, "");
    for (const m of noComments.replace(/<script[^>]*>[\s\S]*?<\/script>/g, (s) => s.replace(/>[\s\S]*<\//, "></")).matchAll(scan[".html"][0])) found.push(m[1]);
    for (const m of noComments.matchAll(scan[".html"][1])) for (const re of jsRes) for (const n of m[1].matchAll(re)) found.push(n[1]);
  } else {
    for (const re of scan[ext]) for (const m of text.matchAll(re)) found.push(m[1]);
  }
  for (const raw of found) {
    const ref = raw.replace(/[?#].*$/, "");
    if (!local(raw) || !ref || /^\s*$/.test(ref)) continue;
    if (ext === ".js" || ext === ".mjs") { if (!/^\.\.?\//.test(ref)) continue; } // bare specifiers aren't files
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), ref));
    if (target.startsWith("..")) continue;
    queue.push({ rel: target.replace(/\/$/, ""), from: rel });
  }
}

// With an explicit list, the job's artifacts are the record of what shipped.
const art = /\n {2}artifacts:\n {4}paths:\n((?: {6}- .*\n)+)/.exec(ci);
if (!wholeDir && art) {
  const artifacts = new Set([...art[1].matchAll(/- (\S+)/g)].map((m) => m[1]));
  for (const f of listed) if (!artifacts.has(f)) errors.push(`the rsync list ships ${f}, which artifacts: paths: leaves out`);
}
if (!wholeDir) for (const f of listed) if (!GENERATED.has(f) && !fs.existsSync(path.join(root, f))) errors.push(`the rsync list ships ${f}, which is not in the repo`);

if (refs === 0) errors.push(`${pages.join(", ")} load no local files -- refusing to pass vacuously`);
if (errors.length) {
  for (const e of errors) console.error(`  error: ${e}`);
  process.exit(1);
}
console.log(`deploy ships all ${refs} local file(s) reachable from ${pages.join(", ")}`);
