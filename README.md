# PumaRally

**Program five registers, hand control to the factory floor, and hope you
guessed right.** A faithful port of the RoboRally rules, drawn in original
vector art.

Inspired by *RoboRally* (Richard Garfield, Wizards of the Coast). Rules and
board layouts are reimplemented as functional data; the name, artwork and
printed boards remain theirs. Nothing here is scanned — the tiles are original
drawings and the layouts are hand-transcribed tile data.

> **Status: in development, and playable.** Program five registers and race up
> to seven robots across seven transcribed factory floors, alone or
> pass-and-play. Cannery Row is a first pass and not yet raceable, the modern
> edition is part-built (no upgrade shop, and the damage deck is all SPAM),
> and the option deck is 16 of its 26 cards — see
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
| Headless simulation + 239 rule tests | done |
| Playable UI — programming, register execution, animation, save/resume | done |
| Option cards — hook system | done |
| Option cards — roster | **16 of 26** — see [Option cards](#option-cards) |
| Modern round order, Energy, Priority Token, personal decks | done |
| Modern damage — SPAM | done |
| Modern damage — Haywire | **not built** — the card faces are not transcribed |
| Modern upgrade phase, shop, reboots | not yet |
| Hot-seat pass-and-play | done |
| Difficulty tiers, setup, help, tutorial, sound | done |
| Board editor | done |
| The twelve official boards | not yet — see [Board provenance](#board-provenance) |

## How it works

Each turn you are dealt `9 − damage` program cards and commit five of them,
face down, to your registers. Then all five registers execute one at a time:
every robot reveals that register's card, the highest card priority moves
first, and then the board takes its turn in the printed order — express
conveyors, conveyors, pushers, gears, **crushers**, lasers, flame jets,
checkpoints. You do not get to react. The whole game is in the guess you made
ninety seconds ago.

Where the crusher sits in that order is load-bearing and is asserted: a robot
carried onto one by a conveyor is crushed in the *same* register, which is what
Cannery Row is built around.

Damage is the pressure. Each point costs you a card next turn, and from five
damage your registers start locking from the right, so a wounded robot is
committed to moves it can no longer choose.

## Playing with other people

Set the **Humans** slider above one and the game becomes pass-and-play. The
curtain between players is a function of how many humans are *seated*, not of
whether there are bots — one human against seven robots gets no curtain at all,
which is the common case and the one where any friction would be pure cost.

It hides the board as well as the hand, and does it three ways, because covering
the screen is not the same as hiding it: the board goes `aria-hidden` (a screen
reader reads straight through an overlay), it is blurred rather than merely
occluded, and the keyboard handler refuses everything except the dismiss — a
delegated key listener has no idea anything is on top of it, and `3` would
otherwise still program the previous player's card.

## Help that cannot drift

The help is generated from the tables the engine reads. Board elements come
from `ELEMENT_DEFS`, the card table and the damage/lock table from the deck
definition, the option list from `OPTION_DEFS` — so renaming a tile renames it
in the help, and adding an option card documents it.

The turn-order page is the exception, since prose cannot be derived. So each
row names a real step in the phase machine and `validateTables()` **refuses to
load** if one of them does not exist. Rename a step and that is the only thing
that will notice the help now lies.

## The board workshop

`#edit` opens the editor; `#edit=provingGround` opens a shipped board in it.

It exists because the twelve official boards are roughly 1,700 tiles that have
to come off photographs, and describing a board to someone in prose is exactly
how a plausible, wrong map gets made. So: **drop a photograph behind the grid,
trace it, and paste the export straight back** into `pumarally-boards.js`.

- `formatBoard()` emits the shipped style **byte for byte**, and CI asserts
  that formatting every shipped board reproduces its own source. If that ever
  stopped being true, the export would have quietly become something a person
  has to hand-correct — which is where transcription errors get in.
- The board **validates live** as you draw, naming the offending square.
- **Test play** drops three flags on the board and starts a game on it, without
  it being shipped.
- The reference image **never leaves the machine and is never exported**:
  `URL.createObjectURL`, nothing uploaded. The repo holds original art and
  transcribed layout data, nothing scanned.

The workshop takes the whole screen: a rail of tools down the left, each with
the letter that picks it up printed on it, the map in the middle, an inspector
on the right and a status line underneath that names whatever is under the
pointer. A ghost of the tool in hand follows the pointer, already turned the way
it will be laid, and greys out where a click would be refused. Left-click lays,
right-click rubs out, dragging a conveyor tool lays a run; `W A S D` face the
thing in hand (or the thing selected) and `Q E` turn it a quarter. Ctrl-wheel or
pinch zooms about the pointer, `+ - 0` zoom and fit, and the map pans with the
hand tool, Space-drag, the middle button or two fingers. `Delete` takes the
selected thing off and `Esc` steps back to the select tool. Work autosaves, so a
long transcription survives a reload.

The **course workshop** is the same editor opened on an assembled course, and
it is where every race now begins. It opens with the flag tool in hand: click a
floor square for flag 1, again for flag 2, and so on; keys `1`–`9` pick the
number in hand. The inspector keeps the flags as a numbered list in race order,
each with go-to, earlier, later and take-off, and a placed flag or trap can be
dragged to a new square without losing its number, facing or wall. Three ways
out: **exit without saving**, **save to library**, or **save and play**.

## Setting up a race

Two screens and then the workshop. **Settings** picks the ruleset, the number of
robots and the house rules; **Course** is where a course is picked, one is laid
out three-by-three by hand, or one is taken off your **library**; and `Next`
opens the whole thing in the workshop, where the flags go on and the race is
started.

The course shelf holds two kinds, grouped by what a course *is* rather than by
which box its first board came out of:

- **Quick games** — one board with its flags already down, one per transcribed
  board, named after the board. The shortest distance between wanting a game
  and having one.
- **Race tracks** — two boards or more, on the configurations the rulebook
  builds its own on: 1×2, 2×2 and 1×3. Where the flags go is each track's own
  business; tracks are copied from the manuals or built by hand, and both put
  flags where the track puts them.

**The book's own sample race tracks are not among them, and cannot be yet.**
Every one of them lays down two to four boards, five of the twelve classic
boards are transcribed, and identifying an untranscribed board from a halftone
reproduction and then counting flag squares off it is exactly the eyeballed
guess this project does not ship. They land when their boards do.

Every flag on every shipped course is checked against the placement rules —
plain floor, never the starting block, nothing wall-mounted standing on it,
never the very corner, within Northrup's twelve of the flag before it, and no
two on one square. That check found three real defects when it was first run:
Board H had a flag standing on a **conveyor**, which is not somewhere to stand
at all because the belt carries the robot off it at the end of every register,
and a since-removed course had one on a repair site and a third flag sixteen
columns from the second, outside Northrup's twelve.

The library is `localStorage`, one entry per named course, holding the boards
and their rotations together with the workshop's picture and its flags. Saving
under a name you have used replaces it, so a course is edited rather than
duplicated; each card shows the course drawn with its flags on it and offers
**Race**, **Open** and delete. A stored course whose picture no longer reads is
dropped from the shelf rather than handed to the workshop.

Two decisions that used to be set-up screens now happen where they can actually
be answered. **Your colour** is the first thing the game asks, as a pop-up over
the course you are about to race, one human seat at a time — taking a colour
swaps it with whoever held it, so the eight stay distinct however many seats
choose. **Your starting bay** follows immediately: everybody draws a program
card for priority, fastest first, and picks a lit bay in that order. The
*Human privilege* house rule puts the seats at this keyboard ahead of the bots.

## Option cards

Twenty-six special cases would be twenty-six `if`s buried in the rules engine.
Instead each card is a data row bound to one of ten hooks, and **nothing
outside that table may intercept the rules** — a card needing a new moment gets
a new hook, not a branch inside `playCard`.

Three properties hold it together. Hooks mutate a request object, never the
game state, so the engine stays in charge of applying it. Hooks never prompt: a
*you may* card calls `ctx.pick()`, which parks a plain-JSON descriptor on a
queue that **one** phase step drains — so twenty-six optional cards cost one
interface, and a save written mid-question reloads, because there are no
closures in the queue. And hooks never touch the DOM, because the headless
simulation runs them too.

The validator asserts the binding **both ways**: no card may name a hook that
does not exist, and no hook may be declared that no card uses. A hook nothing
fires is dead code that reads as coverage.

### The roster is 16 of 26, on purpose

The printed base deck is 26 cards. Sixteen are transcribed — the ones whose
effect is unambiguous. The rest are **not guessed at**: an option card that
does nearly the right thing is worse than one that is missing, because a player
cannot tell which they are holding. They land the way boards do, from the
physical cards, against a hook system that is already finished. The gap is a
number in the source (`OPTION_ROSTER`) that the validator checks, not something
anyone has to remember.

Two deliberate simplifications, marked here because no check can see them:

- **Losing a card when wrecked** is the player's choice at the table. Here it is
  a fixed preference, because destruction happens deep inside a move where no
  question can be parked. Cards that act on the respawn are kept until nothing
  else is left — otherwise a robot holding only Superior Archive would discard
  the one card whose purpose is the respawn about to happen, and it could never
  once work.
- **Bots answer instantly** and consume no shared randomness, same contract as
  their programming: a seeded replay must not drift because a bot was offered a
  different number of choices.

## Two editions

RoboRally has been printed as two substantially different games, and this
project carries both.

| | Classic (1994–2005) | Modern (2016–) |
|---|---|---|
| Move order | Priority number on each card | Priority Token — seating order, fixed for the round |
| Damage | Tokens; each costs a dealt card and locks registers | SPAM cards shuffled into a personal deck |
| Upgrades | Option cards, from upgrade sites | Energy cubes spent in a shop |
| Repair sites | Repair 1 damage | Removed from the boards entirely |
| Deck | One shared 84-card deck | A personal deck per player |

The boards look similar and are **not** interchangeable. So a board declares
which game it is printed for, a course may not mix them, and the validator
refuses an element that edition never printed — a repair site on a 2016 board
is a transcription error, not a variant. Without that, a modern board
transcribed against the classic engine would validate, play, and quietly be
the wrong game.

**The classic ruleset is complete. The modern one is partly built**, and the
pieces are listed in [What works today](#what-works-today) rather than summed
into a single word. What is built runs: the modern round order, Energy, the
Priority Token, a personal twenty-card deck each, and SPAM damage, all
simulated to a winner on every course with the conservation laws armed.

What is not built is the **upgrade phase and shop**, **reboots**, and the
**Haywire half of the damage deck**. That last one is a transcription gap
rather than an engineering one: the rules say the deck is forty cards of two
types, but no page photographed here gives the split, and each Haywire carries
its own programme on its own face. The deck therefore ships as forty SPAM, and
a rule test asserts that it does — so the gap is a check that will go red when
the faces arrive, not a silence.

Boards also declare which **box** they came from — base game, Armed and
Dangerous, Wet and Wild, and so on — because picking a course by expansion is
how anyone with the shelf actually picks one. A set belongs to exactly one
edition, and a board whose set disagrees with its own edition is a
transcription error rather than a variant: there is no Armed and Dangerous
board in the 2016 game.

## Board provenance

Faithfulness is a claim about data, so the data says where it came from.

| Board | Origin | Notes |
|---|---|---|
| Exchange, Island, Maelstrom, Pit Maze, Cross | **Transcribed** | The classic base game, read off photographs of the printed boards. |
| Board G, Board H | **Transcribed** | Crash and Burn. Board E is Island and board F is Maelstrom, both reprints, so neither is transcribed twice. |
| Cannery Row | **First pass** | Marked `unverified`, which keeps it out of the course assembler and the quick games until it has been checked square by square against the photograph. |
| Docking Bay | **Authored placeholder** | Eight numbered start squares, no printed conveyors. To be replaced with a transcription. |

**Two authored boards used to be in here** — a Proving Ground carrying one of
every element, and a Shunt Yard for exercising assembly and rotation — and both
are gone. They were scaffolding: written so the engine could be tested before
any real board existed, and kept long after real boards arrived. What they were
holding up is held up properly now. The art sweep runs over *every* board
rather than over one built to contain everything; the rotation test derives its
own fixtures from whatever board it is given instead of naming squares on a
particular one; and the validator's self-test owns its fixture outright, in its
own file, where nothing in the shipped set can move it.

Ten courses ship: seven quick games, one per verified board, and three race
tracks — *Crosscut* at 1×2, *The Long Haul* at 1×3 with the starting block
under the middle board, and *Four Quarters* at 2×2. The seam between boards and
the rotation are both under test by a course that is actually played.

A board is never reconstructed from memory: a plausible-looking wrong map is
the one failure a game promising faithful layouts cannot survive.

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
| `s3` docking bay 3 | | | |

Flags are **not** in here. They are tokens the *course* places, exactly as in
the box, which is why one board serves many courses.

Neither is **the shape of a conveyor**. A belt is not only a direction: the
board prints whether a square is a plain straight, a corner or a merge, and
that is a *rule* — a robot carried onto a corner, or into the arm of a merge,
turns a quarter, and one carried onto a plain straight from the side does not
turn at all. So the arms are data, in a `merges` list naming the sides that
show a path coming in:

    merges: [{ c: 4, r: 2, in: "WS" }]

A belt with no entry has one arm at its rear — a plain straight. A corner is
one side and no rear; a T is a rear and one side; a crossing is a rear and both.

**This used to be derived** by asking which neighbours pointed at the square,
which is wrong wherever the answer is not local. A belt at the rim of a board is
printed straight, or printed as a merge, and stays that way whatever board is
laid beside it — the printing cannot know. Derivation made a square's shape
depend on the course, so the same board turned a robot on one course and not on
another. In the workshop a belt now carries three toggles, **Behind**, **From
the left** and **From the right**, and painting a run writes the corner it turns.

Neither are **pushers, flame jets, lasers or crushers**. Each is a thing standing
*on* a square rather than the square itself, so each lives in a sparse list
beside the picture. A pusher is bolted to a wall and the square beneath it can
be a conveyor; a flame jet plays over the floor in front of its nozzle and one
on board G reaches two squares; and a **crusher** comes down from above, which
is why it needs no wall and faces nowhere — every one of the ten on Cannery Row
stands on a conveyor, the roller bed running straight under the disc. No single
cell could ever say any of that.

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
| `M` | mute |
| `H` or `?` | help |
| `N` | new game |
| click | answer an option card's question when one is asked |
| `N` | new game |

The game autosaves every settled step and resumes where you left off. A 16-row
course at 2× is taller than a laptop viewport, so the page follows the phase:
your hand while you program, the board while it runs.

## Development

```bash
node tools/check-boards.js        # board + course data
node tools/validator-selftest.js  # prove each validator check can fail
node tools/check-rules.js 200     # 58 rule tests + 200 bot-vs-bot games
node tools/check-assets.js        # every file index.html points at exists
node tools/make-icon.js           # regenerate icon.svg from the robot drawing
node tools/stamp-assets.js        # content-hash the assets index.html loads
```

`make-icon.js` and `stamp-assets.js` both take `--check`, which fails when the
shipped output no longer matches its source.

`stamp-assets.js` exists because the host serves `index.html` with
`max-age=60, must-revalidate` but the `.js` files with `max-age=2592000` —
thirty days, no revalidation. A returning visitor would pick up a fresh
`index.html` and keep running a month-old engine, silently. The single-file
games in this portfolio are immune by accident, since their whole game *is*
the HTML; this is the first one split across files, so the split is ours to
compensate for. Hashing content rather than counting versions means the URL
changes exactly when the bytes do.

All of these run in CI ahead of deploy. `check-rules.js` fails when no simulated
game is ever *won* — a run reporting only "no crashes" cannot distinguish a
working engine from one whose win condition is unreachable, and that
distinction has already mattered here once.

In the browser console:

```js
__PR.runSim(200)        // bot-vs-bot games with the invariants armed
__PR.ruleTests()        // the 58 scenario tests
__PR.newGame(42)        // a seeded game; the same seed replays exactly
__PR.assertInvariants() // conservation laws, right now
__PR.G                  // live state
```

## Tech

- Three files: a shell, the engine, and the board data. No bundler, no
  dependencies, no build step, no network at play time.
- The rules engine touches no DOM, so the human, the bots and the simulations
  share one definition of legal — and Node loads the same file CI tests.
- **No canvas anywhere.** The board is the grid of cells that used to sit
  invisible on top of one, carrying the hit targets and the per-square screen
  reader labels while a canvas underneath drew the same 288 tiles a second
  time. Deleting the canvas deleted the duplication: the label and the drawing
  are now generated side by side from the same tile.
- Tile art is stroked and filled SVG in a 100×100 box, coloured from the
  palette rather than having the palette baked into it — which is why eight
  robot liveries cost one drawing and a `color`, not eight sprite sheets. It is
  also why the board scales to whatever fraction of the column it is given:
  the old integer-scale rule existed only because pixel art smears at 1.5×.
- The art is deliberately solid rather than line work. A conveyor is a belt bed
  with rails down both sides and an arrow painted on it; a wall is a raised,
  hazard-striped bar casting a shadow onto the square it blocks. Outlines read
  as a diagram — a player picking a route is reading depth as much as symbol.
- **The legend is rendered, not written.** Each swatch calls the same
  `tileInner()` the board calls, and takes its wording from `ELEMENT_DEFS`, so
  a tile that changes shape changes its own legend entry in the same edit. It
  used to be a hand-typed string, and the first time the art changed every word
  of it was wrong while still reading perfectly plausibly.
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
