# PumaRally

**Program five registers, hand control to the factory floor, and hope you
guessed right.** A faithful port of the RoboRally rules, drawn in original
vector art, with the boards transcribed from photographs of the printed ones.

Inspired by *RoboRally* (Richard Garfield, Wizards of the Coast). Rules and
board layouts are reimplemented as functional data; the name, artwork and
printed boards remain theirs. Nothing here is scanned: the tiles are original
drawings and the layouts are hand-transcribed tile data.

## Play

<https://greykit.com/games/pumarally/>

No install. Vanilla ES modules, no build step, no dependencies, and no network
at play time beyond fetching the boards.

![Turn 4 of a six-robot race under the classic rules: a laser fires up the left edge and each robot's option cards sit in the panel](screenshots/classic-laser.png)

| | |
|---|---|
| ![Programming registers under the classic rules: four cards placed, three left in hand](screenshots/classic-program.png) | ![Programming under the 2016 rules: SPAM damage cards in the hand and upgrades bought with energy](screenshots/modern-program.png) |
| *Programming, classic.* | *The same screen under the 2016 rules.* |

![The new-game screen: boards grouped by the box they came from on the left, rules, seats and house rules on the right](screenshots/setup.png)

### What it plays

- **Two rulebooks**, chosen at set-up: the classic game (option cards, lives,
  power down) and the 2016 game (own decks, Priority Token, SPAM and Haywire,
  Energy and the upgrade shop, shutdown and reboot).
- **Every board plays under either book.** An element the other box printed
  works as its own book says; only the markings the chosen book uses are
  shown (wrenches under classic, batteries under 2016).
- **The expansions' floors**: Crash and Burn, Grand Prix, Radioactive, and the
  2016 Wet and Wild, Chaos and Carnage, and Thrills and Spills.
- **One to eight seats**, any mix of humans and bots (three skill levels), hot
  seat between humans, autosave and resume.
- **Three ways to set up a race**: a quick game on one board, a quick course
  drawn from several, or a saved course built in the workshop.

Where a rulebook is silent and the game has had to decide, the decision is
declared in the code beside the rule and held by a named scenario test.

### Controls

Each turn you are dealt `9 − damage` cards; put five into your registers and
press Run.

| Key | |
|---|---|
| `1`–`9` | place that card in the next open register |
| `Backspace` | take the last card back |
| `Enter` | run the registers, or lift the hot-seat curtain |
| `y` / `n` | answer a power-down question |

Cards can also be clicked or dragged onto a register. Questions a card or a
repair site asks appear on the panel as buttons; held cards show under each
robot, with the printed text on hover.

## The repository

```
index.html            the game
game/                 rules engine, bots, simulation and screen   → game/README.md
editor/               board format, validator, renderer, workshop → editor/README.md
  data/boards/        every board, as PRBoard JSON
  data/courses/       every shipped course, as PRCourse JSON
tools/                repo-level checks (photos, assets)
screenshots/          the pictures in this file
icon.svg              the icon; og.png, the favicons and apple-touch-icon.png are rendered from it
docs/history/         the rebuild plan, the workshop review, and the design log
```

The game and the workshop share one board library: the game assembles its
courses from the same documents, through the same code, that the workshop
draws and validates. A board fixed in the workshop is fixed in every course
and every saved game that lays it.

## Running locally

ES modules and `fetch` need an HTTP server; opening the file directly will not
work. From the repository root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/> for the game and
<http://localhost:8000/editor/> for the workshop.

## Checks

```bash
node tools/check-no-photos.js          # no reference photograph is tracked or staged
node tools/check-assets.js             # every file index.html points at exists
node editor/tools/check-lib.js         # the workshop's checks; full list in editor/README.md
node game/tools/check-all.js           # the tables, the rule tests, the scenario ledger
node game/tools/sim.js 20              # twenty mixed games on every shipped course
```

All of them run in CI (`.gitlab-ci.yml`, stage `validate`) and gate the
deploy. Node 20, no `npm install`.

**Reference photographs never enter the repo.** `maps/`, `manual*/` and
`rules/` hold photographs of printed boards and rulebook pages for
transcription. They are gitignored, and `check-no-photos.js` runs first in CI
against the fresh clone to refuse any route by which they could ship.

## Extending

- **A board or a course**: build it in the workshop, **Download** it, drop
  the file into `editor/data/boards/` or `editor/data/courses/`, run
  `node editor/tools/build-index.js`, and commit both. See
  [editor/README.md](editor/README.md#shipping-a-board-or-a-course).
- **A board element or device**: a row in the element or device table, a
  glyph, and a pass in the engine. See
  [editor/README.md](editor/README.md) for the format side and
  [game/README.md](game/README.md#extending-the-rules) for the rules side.
- **An option card or upgrade**: a data row and a hook. See
  [game/README.md](game/README.md#extending-the-rules).

## Deploying

Merging to `main` deploys. The CI `deploy` job rsyncs the repository to
DreamHost at `greykit.com/games/pumarally/` with `--delete-excluded`,
leaving out `.git`, `.claude`, `tools`, and the photograph directories.
Credentials are protected group variables, so only `main` can deploy.

Work reaches `main` by merge request. `glab mr merge` does not work on this
project; merge through the API with the full 40-character SHA:

```bash
glab api --method PUT "projects/86391698/merge_requests/<N>/merge?sha=<full 40-char sha>"
```

**Caching.** `.htaccess` makes every `.js`, `.json` and `.svg` revalidate
after a minute, so a returning visitor never runs an old engine against new
boards. A browser that cached the modules before that rule existed
(2026-09-15) keeps them until mid-October 2026 without asking the server; a
report that "the site shows old boards" from such a browser needs a hard
reload, not a redeploy.

## Other Puma games

[PumaTriage](https://greykit.com/games/pumatriage/) ·
[PumaSOC](https://greykit.com/games/pumasoc/) ·
[PumaSecure](https://greykit.com/games/pumasecure/) ·
[PumaTower](https://greykit.com/games/pumatower/) ·
[Retro Surfer '96](https://greykit.com/games/retrosurfer96/) ·
[more](https://greykit.com/games/)

## Credits

Game design and code by shandower, with AI assistance from Claude.
Original game by Richard Garfield. MIT licensed.
