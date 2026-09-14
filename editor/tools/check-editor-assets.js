/* Every file the workshop's page points at exists, and nothing it needs is
 * excluded from the deploy.
 *
 * The second half is the part with a history. The deploy rsyncs the tree with
 * `--exclude='tools'`, and an rsync exclude with no slash in it matches a
 * directory of that name AT ANY DEPTH -- so `editor/tools/` is excluded too.
 * That is right and wanted; CI tools have no business on the site. But it means
 * an app module that ever moved into a directory called `tools` would work
 * locally, pass every check here, and 404 in production. So the deploy's own
 * exclude list is read and checked against what the page actually loads.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR = resolve(HERE, "..");
const REPO = resolve(EDITOR, "..");
const problems = [];

const html = readFileSync(join(EDITOR, "index.html"), "utf8");

/* 1. the page has an entry point, and it is a module */
if (!/<script\s+type="module"\s+src="([^"]+)"/.test(html)) {
  problems.push("editor/index.html has no <script type=\"module\" src=…>");
}
if (!html.includes("data-pumarally-editor")) {
  problems.push("editor/index.html has no mount point");
}

/* 2. every local href/src the page names exists */
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1];
  if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
  const path = resolve(EDITOR, url.split("?")[0]);
  if (!existsSync(path)) problems.push("editor/index.html points at " + url + ", which does not exist");
}

/* 3. walk the module graph from the entry point and require every file to be
 *    something the deploy will actually publish */
const excludes = [];
const ci = readFileSync(join(REPO, ".gitlab-ci.yml"), "utf8");
for (const m of ci.matchAll(/--exclude='([^']+)'/g)) excludes.push(m[1]);

function excluded(relPath) {
  for (const pat of excludes) {
    if (pat.includes("/")) {
      if (relPath === pat || relPath.startsWith(pat.replace(/\/$/, "") + "/")) return pat;
    } else {
      /* no slash: rsync matches the name at any depth */
      const re = new RegExp("(^|/)" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "(/|$)");
      if (re.test(relPath)) return pat;
    }
  }
  return null;
}

const seen = new Set();
const queue = [];
for (const m of html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)) {
  queue.push(resolve(EDITOR, m[1]));
}
const SPEC = /^[ \t]*(?:import|export)\b[^\n]*?\bfrom\s*["']([^"']+)["']/gm;
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsSync(file)) { problems.push("missing module: " + relative(REPO, file)); continue; }
  const rel = relative(REPO, file);
  const hit = excluded(rel);
  if (hit) {
    problems.push(rel + " is loaded by the page but the deploy excludes it (--exclude='" + hit +
      "'). It would 404 in production and work everywhere else.");
  }
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(SPEC)) {
    if (m[1].startsWith(".")) queue.push(resolve(dirname(file), m[1]));
  }
}

if (!seen.size) {
  problems.push("the module graph is empty; this check would pass vacuously");
}

if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("check-editor-assets: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("ok editor/index.html loads " + seen.size + " modules, all present and all deployable");
