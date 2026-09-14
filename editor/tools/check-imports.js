/* Imports must resolve in the tree the public actually gets.
 *
 * Three failure modes, all of which work perfectly on this machine and break
 * only once deployed, which is the worst shape a failure can have.
 *
 * 1. A BARE OR EXTENSIONLESS SPECIFIER. `import x from "./dir"` is fine under a
 *    bundler and is refused by both Node ESM and every browser. There is no
 *    bundler here, so it must be `"./dir.js"`, spelled in full.
 *
 * 2. A FILE THAT GIT WILL NOT TAKE. This check exists because it already
 *    happened: `editor/rules/` was invisible to `git add -A` and to
 *    `git status`, because the repo ignores `rules/` to keep photographs of the
 *    rulebook out, and a gitignore pattern with no leading slash matches at
 *    every depth. The commit went through, the tests passed, and a fresh clone
 *    would have had no element registry. The directory is now `rulesets/`; this
 *    check is what would have said so at the time.
 *
 * 3. A .mjs FILE. `<script type="module">` enforces strict MIME checking with no
 *    sniffing fallback, and the host serves unknown extensions as
 *    application/octet-stream. It would work under `python3 -m http.server`,
 *    which knows .mjs, and CI would stay green because CI never fetches over
 *    HTTP. Use .js, which every server has mapped.
 */

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR = resolve(HERE, "..");
const REPO = resolve(EDITOR, "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];
const files = walk(EDITOR);
const scripts = files.filter(f => f.endsWith(".js") || f.endsWith(".mjs"));

/* 3. no .mjs */
for (const f of files) {
  if (extname(f) === ".mjs") {
    problems.push(relative(REPO, f) + ": use .js -- the host serves .mjs as octet-stream " +
      "and a module script is refused with no fallback.");
  }
}

/* 2. nothing git will not take */
let ignored = [];
try {
  const args = files.map(f => relative(REPO, f));
  const out = execFileSync("git", ["check-ignore", "--no-index", "--", ...args],
    { cwd: REPO, encoding: "utf8" });
  ignored = out.split("\n").filter(Boolean);
} catch (e) {
  /* git check-ignore exits 1 when nothing matches, which is the good case. */
  if (e.status !== 1) throw e;
}
for (const p of ignored) {
  problems.push(p + ": is gitignored, so a fresh clone would not have it. " +
    "The ignore is almost certainly one of the photograph patterns matching at depth.");
}

/* 1. specifiers */
const SPEC = /(?:^|[\s;{(])(?:import|export)\s[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
for (const f of scripts) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    if (spec.startsWith("node:")) continue;                    // tools may use the platform
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      problems.push(relative(REPO, f) + ": bare specifier " + JSON.stringify(spec) +
        " -- there is no bundler and no node_modules here.");
      continue;
    }
    if (!spec.endsWith(".js") && !spec.endsWith(".json") && !spec.endsWith(".css")) {
      problems.push(relative(REPO, f) + ": " + JSON.stringify(spec) +
        " has no extension; both Node ESM and the browser need one.");
      continue;
    }
    const target = resolve(dirname(f), spec);
    if (!existsSync(target)) {
      problems.push(relative(REPO, f) + ": " + JSON.stringify(spec) + " does not exist.");
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error("  " + p);
  console.error("check-imports: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("ok " + scripts.length + " modules; every specifier resolves and every file is committable");
