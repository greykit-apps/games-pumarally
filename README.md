# PumaRally

**Program five registers, hand control to the factory floor, and hope you
guessed right.** A faithful port of the RoboRally rules, drawn in original
pixel art.

Inspired by *RoboRally* (Richard Garfield, Wizards of the Coast). Rules and
board layouts are reimplemented as functional data; the name, artwork and
printed boards remain theirs. Nothing here is scanned — the tiles are original
sprites and the layouts are hand-transcribed tile data.

> **Status: in development, and playable.** Program five registers and race
> three AI robots round the Proving Ground. The twelve official boards, the
> option cards and hot-seat are still to come — see
> [What works today](#what-works-today).

## Play

<https://greykit.com/games/pumarally/>

No install. Three static files, no build step, no dependencies, and no network
at play time.

## What works today

| | |
|---|---|
| Board format, validator and renderer | done |
| Rules engine — movement, pushing, conveyors, gears, pushers, lasers, damage, checkpoints, respawn | done |
| AI opponents | done (distance-field beam search) |
| Headless simulation + 32 rule tests | done |
| Playable UI — programming, register execution, animation, save/resume | done |
| Option cards | not yet |
| Hot-seat | not yet |
| Board editor | not yet |
| The twelve official boards | not yet — see [Board provenance](#board-provenance) |

## How it works

Each turn you are dealt `9 − damage` program cards and commit five of them,
face down, to your registers. Then all five registers execute one at a time:
every robot reveals that register's card, the highest card priority moves
first, and then the board takes its turn — express conveyors, conveyors,
pushers, gears, lasers, checkpoints. You do not get to react. The whole game is
in the guess you made ninety seconds ago.

Damage is the pressure. Each point costs you a card next turn, and from five
damage your registers start locking from the right, so a wounded robot is
committed to moves it can no longer choose.

## Board provenance

Faithfulness is a claim about data, so the data says where it came from.

| Board | Origin | Notes |
|---|---|---|
| Proving Ground | **Authored** | Not from any box. Contains one of every element so the engine is exercised end to end. Also the tutorial course. |
| Docking Bay | **Authored placeholder** | Eight numbered start squares, no printed conveyors. To be replaced with a transcription. |

The twelve original boards are transcribed from reference images, one merge
request each, against a frozen engine. None have landed yet. A board is never
reconstructed from memory: a plausible-looking wrong map is the one failure a
game promising faithful layouts cannot survive.

## The board format

A board is one maze-style ASCII picture, tiles and walls interleaved — `2h+1`
rows of `3w+1` characters, odd rows tiles and even rows the horizontal wall
lattice.

```
+  +  +  +--+  +  +  +
 .. b> b> b> b> bv .. 
+  +  +  +  +  +  +  +
 .. b^ .. .. .. bv l. 
```

Two reasons it looks like this rather than a JSON wall list. A wall lives in
exactly one place in the source, so it cannot disagree with itself — the
failure a per-tile list invites, where "east wall of (3,4)" and "west wall of
(4,4)" drift apart. And a picture diffs against a photograph by eye, which is
the entire transcription workflow.

| | | | |
|---|---|---|---|
| `..` floor | `o.` pit | `w.` repair | `W.` repair + option |
| `b>` conveyor east | `B^` express conveyor north | `l.` gear ccw | `r.` gear cw |
| `p<` pusher, registers 1/3/5 | `Pv` pusher, registers 2/4 | `s3` docking bay 3 | |

Flags are **not** in here. They are tokens the *course* places, exactly as in
the box, which is why one board serves many courses.

## What the validator refuses

Board data is typed by hand, so its failure modes are silent: a picture row
that lost a character, a conveyor pointing into a wall, a laser with nothing to
mount on. None of those throw on their own — they render a board that is
plausible and wrong. So they are fatal at load:

- picture geometry — row count, row width, lattice characters in their columns
- an element not in the legend, or a direction on something that takes none
- a conveyor exiting into a wall, or two conveyors pointing head-on
- a pusher with no wall behind it to mount on
- a laser with no mount, damage outside 1–3, or a beam that never terminates
- flags numbered with gaps or duplicates, in a pit, or off the course
- fewer docking bays than the course seats

`tools/validator-selftest.js` breaks each of those deliberately and asserts it
goes red. That is how the 180-degree-curve check was found to be unreachable —
it was the same condition as the head-on check — and removed rather than left
implying coverage it did not have. A check nobody has watched fail is
indistinguishable from one that cannot fail.

## Rules this port gets right on purpose

Each has a test, because each is easy to implement plausibly and wrongly.

- **Lasers are simultaneous.** Every shot resolves against one frozen board
  before any damage lands, so a robot taking its tenth damage token from a
  board laser still fires its own laser that register.
- **A powered-down robot does not shoot**, but is still hit and still pushed.
- **Power down is three separate moments**: announced while programming, damage
  cleared at the *start* of the powered-down turn, and re-decided in cleanup.
  Folding them together hands out a free repair.
- **A curve turns a robot only if a conveyor carried it on** — not if it was
  already standing there, and not if it was pushed on.
- **Conveyors move simultaneously with a vacancy test.** Two robots converging
  on one square: neither moves. Conveyors never push.
- **A wall stops an entire push chain**, including the robot that started it.
- **An out-of-order flag scores nothing but still moves your archive**, and
  repairs happen in cleanup, never at the moment of touching.

## Playing

Each turn you are dealt `9 − damage` cards. Click five into your registers (or
press `1`–`9`), then **Run**. You do not get to react once they are running.

| Key | |
|---|---|
| `1`–`9` | place that card in the next open register |
| `Backspace` | take the last card back |
| `Enter` | run the registers |
| `S` | cycle speed — slow, normal, fast |
| `N` | new game |

The game autosaves every settled step and resumes where you left off. A 16-row
course at 2× is taller than a laptop viewport, so the page follows the phase:
your hand while you program, the board while it runs.

## Development

```bash
node tools/check-boards.js        # board + course data
node tools/validator-selftest.js  # prove each validator check can fail
node tools/check-rules.js 200     # 32 rule tests + 200 bot-vs-bot games
node tools/check-assets.js        # every file index.html points at exists
node tools/gen-sprites.js         # redraw the 32x32 tile art
node tools/make-icon.js           # regenerate icon.svg from the robot sprite
node tools/stamp-assets.js        # content-hash the assets index.html loads
```

`gen-sprites.js`, `make-icon.js` and `stamp-assets.js` all take `--check`,
which fails when the shipped output no longer matches its source.

`stamp-assets.js` exists because the host serves `index.html` with
`max-age=60, must-revalidate` but the `.js` files with `max-age=2592000` —
thirty days, no revalidation. A returning visitor would pick up a fresh
`index.html` and keep running a month-old engine, silently. The single-file
games in this portfolio are immune by accident, since their whole game *is*
the HTML; this is the first one split across files, so the split is ours to
compensate for. Hashing content rather than counting versions means the URL
changes exactly when the bytes do. Resolution is one constant in
`gen-sprites.js` — though raising it does not by itself buy detail, since each
sprite is drawn at real proportions rather than scaled up.

All of these run in CI ahead of deploy. `check-rules.js` fails when no simulated
game is ever *won* — a run reporting only "no crashes" cannot distinguish a
working engine from one whose win condition is unreachable, and that
distinction has already mattered here once.

In the browser console:

```js
__PR.runSim(200)        // bot-vs-bot games with the invariants armed
__PR.ruleTests()        // the 32 scenario tests
__PR.newGame(42)        // a seeded game; the same seed replays exactly
__PR.assertInvariants() // conservation laws, right now
__PR.G                  // live state
```

## Tech

- Three files: a shell, the engine, and the board data. No bundler, no
  dependencies, no build step, no network at play time.
- The rules engine touches no DOM, so the human, the bots and the simulations
  share one definition of legal — and Node loads the same file CI tests.
- Tiles are 32x32 and the board takes the largest **whole** multiple that fits
  its column, up to 2x by default (`data-max-scale` on the mount point raises
  it). Pixel art only survives integer scaling — at 1.5x some sprite pixels
  land on two screen pixels and their neighbours on one, so a conveyor's slats
  come out unevenly spaced. The board would rather scroll than smear.
- Sprites ship as character grids with per-sprite palettes,
  pre-rendered once to offscreen canvases, but at 1,024 characters each they
  are *drawn* by `tools/gen-sprites.js` rather than typed. Rotations are canvas
  transforms, and the eight robots are one sprite with eight palette maps.
- All rule randomness goes through one seeded generator whose entire state is a
  single integer in the save, so a seed replays a game exactly. Bots consume
  none of it — their variety comes from hashing the position, and an invariant
  checks the stream did not move.

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
