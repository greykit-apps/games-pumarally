# PumaRally: the rebuild plan

Written 2026-09-15 after reading the rulebook photographs, both codebases, the
CI suite, the last three days of commits, and playing a turn in the browser.

**Status, 2026-09-15 (same day):** M0 to M3 are done and merged. The editor
branch is on `main`, the tag `classic-monolith` marks the last commit before
the rebuild, `game/` holds the classic engine, bots, simulation and screen,
the repository root's `index.html` is the new game, and the old game and its
tools are deleted. Option cards followed the same day: the sixteen
transcribed, with their questions through the request door, and the AMIGO
box's eleven once it was photographed. Crash and Burn's
floor followed: doors, portals, oil, unnumbered presses, burners on the way
through, lives by game size, all read off the AMIGO book. A hundred and six
of the old suite's scenarios are ported by name; the runner prints the rest
as pending. M4, the 2016 rules, followed: own decks, the Priority Token,
SPAM, Energy, the shop, shutdown and reboot, with three declared
substitutes (`game/engine/state.js`). A hundred and fifty-two scenarios are
ported. M5 began with the twenty-nine upgrade effects the rulebook's pages
21-23 give in full; two stay inert for want of Haywire. The expansion floor
followed from the three Factory Floor Guides: water, drains, ledges and
ramps, currents, randomizers, teleporters, flamers, each with a scenario on
an authored board. The photographs arrived: Haywire is built from the
deck laid out face by face. Still to transcribe from the same batch: the
AMIGO option cards the English roster lacks, the fifteen expansion upgrade
cards, the thirteen 2023 courses with their Reboot Tokens, the 2016 Docking
Bay, and the Avalon Hill printing's own rules and courses.

## The verdict

**Rebuild the game on the editor's foundation. Do not patch `pumarally.js`,
and do not start from a blank directory either.**

"Start over" and "fix the existing work" are both the wrong frame, because the
repo holds two very different kinds of work:

| | | keep? |
|---|---|---|
| 17 transcribed boards, 19 courses, as PRBoard/PRCourse JSON | weeks of photograph work, verified square by square | **keep, untouched** |
| `editor/` (format, validator, renderer, course assembly, rulesets-as-data) | 47 clean ES modules, 87 diagnostic codes each proven to fail, every check green | **keep, and build on** |
| `rules/MANIFEST.md`, `maps/MANIFEST.md` | the rulebook audit and every transcription trap found so far | **keep** |
| Transcribed card text: 16 option cards, 40 upgrade cards, the modern deck counts | data read off the physical cards; never to be re-derived | **keep, as data files** |
| The 271 rule-test *scenarios* | a written spec of every rule the book states | **keep the scenarios, rewrite the assertions** |
| `pumarally.js`: engine, phase machine, UI, bots, wizard, library, a second board editor, tests, all in one 20,733-line IIFE | three days old, and the thing that keeps breaking | **replace** |

The editor README already says this is the direction: *"Both are true at once
until the engine moves across"*, and `convert-boards.js` *"goes when that file
does."* This plan is the engine moving across.

## What is actually wrong

Every automated check is green: 271 rule tests, 200 bot games per course,
conservation invariants, the editor's ten checks. Yet the game freezes on real
players. Those two facts are not in tension. They are the diagnosis.

**The sims never take a human's path.** `runSim` sets `autoHuman`, so no test
has ever pressed a button, placed a card by hand, answered a two-wrench prompt,
or clicked Done in the upgrade phase. Every freeze in the commit log lives
exactly there:

- `actor()` gated on `p.alive` while the phase machine gated on `inPlay(p)`;
  a rebooting human's buttons rendered live and answered nothing. Game stuck
  for good.
- `renderProgram` asked the same question a third way (`isHuman && alive`),
  so fixing `actor()` moved the deadlock one step down.
- A robot with all five registers locked was skipped past the PowerDown
  announce, because `programmed()` was vacuously true.
- A powered-down human could never choose to stay down: nothing on screen
  could set the flag.
- A rebooting human's robot was drawn at opacity 0. "Where is my robot?"
- Observed today: the number-key shortcuts the README documents are dead
  whenever focus is on the page body, because the `keydown` listener is on the
  mount element rather than the document. The hand also re-centres after every
  placement, so the card under the pointer moves between clicks.

None of these is a rules bug. They are the same structural bug five times:
**whether to draw a control, whether to obey it, and whether the machine is
waiting for it are three separate predicates written in three places**, and
each new feature (reboots, shutdown, upgrades) adds a case to one of them and
not the others.

Three more things make each fix breed the next:

1. **One 20k-line file with one mutable global** (`G`) and one presentation
   global (`UI`). The phase machine's steps call `animate()`, `collectBeams()`
   and `boardSig()` directly, so rules code and animation code are one code
   path with a `UI.headless` branch in the middle. The rule tests are 7,544
   lines of that same file, shipped to the browser.
2. **Scope taken all at once, in three days.** Classic, modern, three
   expansions, 26 option cards, 40 upgrades, hot seat, a wizard, a course
   library, a course workshop, and a full board editor, then a second board
   editor. 272 commits. Nothing had time to settle before the next layer went
   on top of it.
3. **Two editors, two renderers, two board formats.** The old one lives in
   `pumarally.js` (2,774 lines) and reads the ASCII format; the new one is
   `editor/` and reads PRBoard v1. The game still plays the old format via a
   conversion, so a board fix has to be proved twice.

## Two things to do before any code

**Merge `work/editor-format`.** The whole of `editor/` exists on this branch
only: 26 commits, 91 files, nothing of it on `main` or `origin/main`. Every
step below builds on it. Land it first so it cannot be lost and so the rebuild
branches from a `main` that has it.

**Tag the old game.** `git tag classic-monolith` on the merge commit. The
rebuild deletes files; the tag is how anything transcribed into
`pumarally.js` and not yet lifted out gets recovered.

## The architecture, and the rule each part enforces

The point is not tidiness. Each of these exists to make one class of the
observed bugs unrepresentable.

### 1. The engine is a pure function of state and an answer

```
step(state, answer?) -> { state, events, waiting }
```

No `UI` object, no globals, no DOM, no timers. `state` is plain JSON and is the
whole save. `waiting` is either null or **one** request:

```
{ player, kind: "program" | "bay" | "livery" | "upgrade" | "powerDown" |
  "choice" | "rebootFacing" | ..., options }
```

The UI draws controls for the pending request and nothing else. A bot is a
function from a request to an answer. A human is the same function with a
person inside it. **There is no second predicate anywhere** for "may this
player press this": if `waiting.player` is you and `waiting.kind` is
`program`, you may program. This is what kills the `actor()` family of bugs at
the root rather than one case at a time.

The old code half has this (`pendingChoices`, `askBoard`) alongside four other
mechanisms (`ready`, `upgradeDone`, `announceDown`, the livery/bay draft).
Unify to one.

### 2. Animation reads events; it never diffs the board

Each step returns an ordered event list: `moved`, `pushed`, `turned`,
`conveyed`, `shot`, `damaged`, `fell`, `rebooted`, `flag`, `dealt`. The UI
replays them at its own pace and can be turned off. The engine does not know
whether anything is animating, which is what lets the same engine run 200
games in ten seconds and one game on screen.

### 3. Rulesets are data the engine executes, not branches it contains

`editor/rulesets/classic.js` and `modern.js` already carry the board's
activation order as a table (`order: [expressConveyor, conveyor, pusher,
gear, crusher, boardLaser, robotLaser, ...]`) and the resolution flags
(`expressAlsoRunsWithNormals`, `oilSlideAfter`, `portalBlockedBy`). The
engine walks `ruleset.order` and dispatches each step to an element handler
keyed by **property** (`belt`, `gear`, `pit`, `laser`) read through
`propAt()`, exactly as the editor's inspector already does. Adding an element
means adding a handler and a row, not editing the register loop.

Checked against the book today: the classic sequence on pp.14-15 (reveal, move,
board elements, lasers, end-of-register) and the 2023 reference card (blue
belts, green belts, push panels, gears, board lasers, robot weapons, batteries,
checkpoints) are both expressible as that table with no special cases.

### 4. One board format, one renderer, one editor

The game reads PRBoard/PRCourse JSON from `editor/data/` through
`editor/lib/course.js#assemble`. It draws the board with
`editor/render/svg.js#boardSVG`, which already carries the game's art. The
course workshop at `editor/index.html#course` is the setup screen's "lay out
a race"; the game has no editor of its own. `pumarally-boards.js`, the old
in-game editor, the old library, the old wizard, and `convert-boards.js` are
all deleted at cutover.

### 5. Tests drive humans through the same door as bots

- **Rule tests** stay as scenarios (the 271 names are a spec worth keeping)
  but assert on `step()` output.
- **Human-path sims**: every sim game seats at least one "human" whose answers
  come from a random or bot policy fed through the request/answer interface
  — the exact path a person's clicks take. A request no policy can answer, or
  a game that stops with `waiting` set and no legal answer, is a failure.
- **A wiring check** like the editor's `check-wiring.js`: render every UI
  panel for every request kind and assert each control maps to an answer the
  engine accepts. This is the check whose absence let "buttons rendered live
  and answered nothing" ship three times.
- **One browser-driven game** in CI or pre-merge: a scripted driver plays a
  whole game through the DOM. Slow, and the only thing that would have caught
  the dead keyboard shortcuts and the clipped board.

### 6. Scope is sequenced, and each stage ships before the next opens

The old code carried every feature at once. The rebuild carries one at a time
and each stage must be **playable end to end by a person** before the next
starts. The order below is by what the book states most plainly and what has
the most transcribed data behind it.

## Milestones

Each has an acceptance line. Nothing is done until its line is true.

**M0. Foundation** — merge the editor branch, tag, create `game/` as ES
modules beside `editor/`, wire CI. Fix the four workshop bugs in
`EDITOR-REVIEW.md` (sites invisible to undo and redraw, flag drift on
normalise, dropped squares on fast drags, no refit after the first stamp)
and add the `index` tool, because M2's setup screen is the course workshop
and the flag-site marking depends on the first fix. The deploy question is settled here: the
host serves `.js` with a 30-day cache and the game will be ~30 modules, so the
existing two-file stamp does not scale. Use a hashed directory per release
(`game/<hash>/…`) or an import map stamped into `index.html`; the editor has
the same exposure today and gets the same fix.
*Acceptance: `node game/tools/check-all.js` exists and runs, green, with zero
tests. CI runs it.*

**M1. Classic engine, headless** — state model; course from PRCourse; the
request/answer loop; deck, deal, damage and register locking (p.26 table);
movement and push chains; belts with arms (the printed-shape rule); gears;
pushers; board and robot lasers, simultaneous; pits and the edge; checkpoints,
archive, respawn, lives; repair sites; power down as three moments; the
cleanup order the manifest audited. Bots ported from the distance-field code
(326 lines, worth keeping). Rule-test scenarios ported.
*Acceptance: 200 bot games on every classic course to a winner; every ported
scenario green; a human-path sim green; seed replays identical.*

**M2. Classic UI** — setup (course from `editor/data/index.json`, seats,
house rules), the draft, programming by click, keyboard and drag, execution
animated from events, side panel, log, save and resume. Layout that does not
clip: the board scrolls, the panel does not steal its height.
*Acceptance: a scripted browser game from New game to a winner with no
console errors; a person plays one and reports nothing stuck. Then deploy
this as the site, replacing the monolith.*

**M3. Cutover** — delete `pumarally.js`, `pumarally-boards.js`,
`convert-boards.js`, the old tools. Lift the transcribed card tables out
first, into `game/data/` as JSON. README rewritten to describe what exists.
*Acceptance: the tree has one engine, one format, one renderer, one editor.*

**M4. Modern core** — per-player 20-card decks, SPAM as cards in the deck,
Priority Token order (the 2023 printing; do not blend with the antenna
printing), Again and Power Up, energy and batteries, reboot with the declared
`MODERN_REBOOT_POINT` substitute, shutdown, the upgrade phase with the 11
built cards and the other 29 as purchasable-but-inert, exactly as now.
*Acceptance: the same four checks as M1 on Energize, Steps and the six other
2016 boards.*

**M5. Everything gated on transcription** — the eleven AMIGO option cards
(done), Haywire (done), the 29 upgrade effects (done), Crash and Burn's four rule gaps,
Wet and Wild levels, Chaos and Carnage, Thrills and Spills. Each lands as
data plus a handler plus a scenario, one at a time, only when its source is
photographed. This is the existing rule and it stays.

## Decisions that are yours

1. **Go with the rebuild, or keep patching?** Patching works — each fix in
   the log is correct — but each one was found by you hitting it, and the
   suite cannot see the class. The rebuild's whole cost is M1 and M2; I put
   that at roughly the same effort as the last three days produced, for an
   engine a quarter the size.
2. **Classic first, modern second.** The 2016 rules have more unsettled
   sources (two printings that disagree on the damage deck and priority) and
   more substitutes (reboot points). Classic is fully settled in the
   photographs. If you would rather lead with modern, M1 and M4 swap and the
   plan otherwise holds.
3. **Which of the old UI survives.** Decided 2026-09-15: **hot seat stays.**
   Seating is any count from one to eight with any mix of humans and bots,
   which includes a solo human with no opponents, all humans, and
   bot-versus-bot. That is a requirement on M2's setup screen and on the
   engine's request loop (a seat is a policy, human or bot, and the curtain
   is a function of how many human policies are seated). The wizard, the
   in-game library and the tutorial are dropped from M2; the course workshop
   in `editor/` replaces the first two. See `EDITOR-REVIEW.md` for what the
   workshop needs first.

## The first day

1. Merge `work/editor-format` into `main`; tag `classic-monolith`.
2. `mkdir game/{engine,ui,data,tools}`; write the `step()` signature, the
   state shape and the request kinds as a short `game/README.md` before any
   handler exists, so the contract is reviewed before it is implemented.
3. Lift `OPTION_DEFS` text, `UPGRADE_DEFS` text and the modern deck and damage
   counts out of `pumarally.js` into `game/data/*.json`, verbatim.
4. Port the classic rule-test *names* into `game/tools/scenarios.js` as
   pending tests, so the count that matters is visible from the first commit.
