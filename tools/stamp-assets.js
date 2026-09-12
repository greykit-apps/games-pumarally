#!/usr/bin/env node
/*
 * Stamp a content hash onto the assets index.html loads.
 *
 *   node tools/stamp-assets.js          # rewrite the query strings
 *   node tools/stamp-assets.js --check  # fail if they are stale
 *
 * The host serves index.html with `max-age=60, must-revalidate` but the .js
 * files with `max-age=2592000` -- thirty days, no revalidation. A returning
 * visitor therefore picks up a fresh index.html and keeps running a month-old
 * engine, silently, with no error anywhere.
 *
 * The single-file games in this portfolio are immune by accident: their whole
 * game IS the HTML, so the short max-age covers it. PumaRally is the first one
 * here split across files, so it is the first exposed to that rule, and the
 * split is ours rather than the host's to compensate for.
 *
 * Hashing the content rather than counting a version means the URL changes
 * exactly when the bytes do -- no cache miss on a no-op deploy, and no stale
 * engine on a real one.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const STAMPED = ["pumarally.js", "pumarally-boards.js", "icon.svg"];

const htmlPath = path.join(root, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
const before = html;
const missing = [];

for (const file of STAMPED) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) { missing.push(file); continue; }
  const hash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 10);
  const esc = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp('((?:src|href)=")' + esc + '(?:\\?v=[0-9a-f]+)?(")', "g");
  let hit = false;
  html = html.replace(re, (_m, a, b) => { hit = true; return a + file + "?v=" + hash + b; });
  if (!hit) missing.push(file + " (not referenced by index.html)");
}

if (missing.length) {
  for (const m of missing) console.error(`  error:   cannot stamp ${m}`);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  if (html !== before) {
    console.error("  error:   asset hashes in index.html are stale -- run node tools/stamp-assets.js");
    process.exit(1);
  }
  console.log(`asset hashes current (${STAMPED.length} files)`);
} else {
  fs.writeFileSync(htmlPath, html);
  console.log(`stamped ${STAMPED.length} asset reference(s) in index.html`);
}
