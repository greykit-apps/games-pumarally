#!/usr/bin/env node
/*
 * Refuse to ship a photograph.
 *
 *   node tools/check-no-photos.js
 *
 * maps/, manual* and rules/ hold photographs of printed board art and
 * rulebook pages. This repo is PUBLIC. The layouts are reproduced as
 * functional tile data and the rules as engine behaviour; the photographs
 * themselves must never leave the machine they were taken on.
 *
 * WHY THIS IS A TOOL AND NOT A LINE IN .gitignore.
 *
 * It was a line in .gitignore, and the photographs were public anyway --
 * "Untrack the board photographs, which have been public this whole time",
 * 2026-09-12. They were caught, untracked and the branches carrying them
 * deleted, and origin is clean today. But the only thing that had been
 * standing between a public repo and someone else's board art was a pattern
 * plus discipline, and a pattern nobody tests is a pattern nobody knows the
 * holes in.
 *
 * Here is one, found while a second session was setting up a worktree.
 * `maps/` is 800MB, so a worktree links to the one copy rather than
 * duplicating it -- and a gitignore pattern ending in a slash matches a
 * DIRECTORY, which a symlink is not:
 *
 *     .gitignore contains  manual* plus a slash
 *     $ ln -s ../real/manual1 manual1
 *     $ git status --short
 *     ?? manual1                     <- not ignored
 *     $ git add -A                   <- stages it, no force, no warning
 *
 * Reproduced in a scratch repo before this was written. So the ignore is
 * still there and is still right, and this checks the thing that actually
 * matters instead of the mechanism that is supposed to achieve it: nothing
 * under those paths is tracked, staged, or sitting in the tree unignored.
 *
 * Checked in CI, where it runs against a fresh clone -- which is exactly the
 * question anyone would ask, since a fresh clone is what the public gets.
 */
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
/* Matches the .gitignore entries, and a bare name as well as a path under it:
 * the symlink case appears as the bare name with nothing after it. */
const SECRET = /^(maps|manual[^/]*|rules)(\/|$)/;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return null;                       // not a git checkout: nothing to check
  }
}

let failed = 0;
function refuse(what, paths) {
  console.error(`  error:   ${what}:`);
  for (const p of paths.slice(0, 10)) console.error(`             ${p}`);
  if (paths.length > 10) console.error(`             ...and ${paths.length - 10} more`);
  failed++;
}

const tracked = git(["ls-files"]);
if (tracked === null) {
  console.log("no-photo check: not a git checkout, nothing to check");
  process.exit(0);
}

const bad = tracked.split("\n").filter(Boolean).filter(p => SECRET.test(p));
if (bad.length) refuse("photographs are TRACKED in this repo, which is public", bad);

/* The index as well as HEAD: a staged photograph has not been committed yet
 * and is exactly the state a stale worktree was found sitting in. */
const staged = git(["diff", "--cached", "--name-only"]);
if (staged) {
  const s = staged.split("\n").filter(Boolean).filter(p => SECRET.test(p));
  if (s.length) refuse("photographs are STAGED for commit", s);
}

/* And anything under those names that git can still see -- which is the
 * symlink hole, and anything else the ignore might miss next. */
const status = git(["status", "--porcelain", "--untracked-files=normal"]);
if (status) {
  const vis = status.split("\n").filter(Boolean)
    .map(l => l.slice(3).replace(/^"|"$/g, ""))
    .filter(p => SECRET.test(p));
  if (vis.length) {
    refuse("photograph paths are visible to git despite .gitignore " +
           "(a pattern ending in / does not match a symlink)", vis);
  }
}

if (failed) {
  console.error(`\n${failed} problem(s). Nothing under maps/, manual*/ or rules/ may enter this repo.`);
  process.exit(1);
}
console.log("no-photo check: nothing under maps/, manual*/ or rules/ is tracked, staged or visible");
