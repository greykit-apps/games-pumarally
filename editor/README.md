# The board workshop, and PRBoard v1

Draw, validate and export factory floors; assemble them into courses and put
the flags on. Vanilla ES modules — no bundler, no dependencies, no build step,
and no network at drawing time.

```
editor/index.html              the board workshop
editor/index.html#course       the course workshop
editor/index.html#board=<id>   open a shipped board
```

```
editor/lib/        the format: parse, serialize, rotate, edges, levels, course assembly
editor/rulesets/   the element, device and site tables, and the two rulesets
editor/validate/   the validator and its diagnostic codes
editor/render/     board art and markup mode, as one self-contained SVG
editor/app/        the workshop UI
editor/data/       every shipped board and course, and the derived index.json
editor/tools/      the checks, the index builder, the fixture maker
```

The game reads boards through this same code, so everything below is also
what the engine sees.

---

## A board is three layers

`ground`, `wall` and `ceiling`, split by one question: **is this thing the
square, or is it standing on the square?**

- a pusher is bolted to a **wall**, and a board may print a conveyor beneath one
- a press comes down from **above**, and may stand over a belt
- a flame jet is bolted to a wall and plays over one or two squares in front
- a crusher and a flamer are one square with no facing, so no ceiling device
  has a `face` field at all
- a trap door pit **is** its square -- plain floor until the registers printed
  on it -- but carries a register list the ground token has no room for, so it
  is a *floor device* in `ground.devices`, on a square that must read `...`

```json
{
  "format": "PRBoard", "version": 1,
  "id": "provingCorner", "name": "Proving Corner", "w": 4, "h": 4,
  "set": "authored", "origin": "authored",
  "ground": {
    "rows": [
      "... b>. bvr ...",
      "... ... ... ...",
      "... ... ... ...",
      "... ... ... o.."
    ]
  },
  "wall": {
    "hRows": ["   #", "    ", "    ", "    ", "    "],
    "vRows": ["     ", "  #  ", "     ", "     "],
    "devices": [
      { "kind": "laser",  "edge": "h:3,0", "face": "S", "damage": 1 },
      { "kind": "pusher", "edge": "v:2,1", "face": "E", "regs": [1, 3, 5] }
    ]
  },
  "ceiling": { "devices": [ { "kind": "crusher", "at": [1, 3], "regs": [2, 5] } ] }
}
```

**The schema is closed.** An unknown key is an error, not something ignored —
which is what catches a `flags` array written into a board. Flags belong to
the *course*.

**A board declares no edition.** It can carry a wrench and a battery at once;
which matter is the engine's business at play time. `set` records which box
the board came out of, which is a fact about the board.

### The ground token: three characters

`[element][argument][arms]`, and a row is `w` tokens joined by single spaces,
so exactly `4w − 1` characters. The validator checks that every index `4k−1`
is a space, so a row that loses a character fails at a **named column**.

`"   "` is a hole: legal on an assembled course, never on a printed board.

The element characters and their arguments are the table in
`rulesets/elements.js`. An element is asked about by its **properties**
(`belt`, `pit`, `gear`, ...), never by its character.

### Conveyor arms, relative to the exit

A belt's printed shape is a rule: **a robot carried onto a curve, or into the
arm of a merge, turns a quarter; one carried onto a plain straight from the
side does not.** The third character says which sides show an incoming path,
relative to the belt's own exit:

| char | arms | printed shape |
|---|---|---|
| `.` | back | plain straight — the default, and its only spelling |
| `l` | left | curve, fed from the left |
| `r` | right | curve, fed from the right |
| `L` | back + left | T-merge, joined from the left |
| `R` | back + right | T-merge, joined from the right |
| `x` | left + right | crossing with no rear feed |
| `X` | back + left + right | full crossing |

The quarter-turn, the drawn arc and the result of rotating the board are all
derived from that character and never stored. Relative arms are
rotation-invariant: the exit turns and the arms follow.

**Arms are printed data, never derived from the neighbours.** A belt at a
board's rim stays as printed whatever board is laid beside it.

### Sites: markings a square carries as well as being floor

A trap door pit sits in the ground layer, beside the sites:

```json
"ground": {
  "rows": [ … ],
  "devices": [ { "kind": "trapDoor", "at": [4, 2], "regs": [2, 4] } ]
}
```

Repair sites, upgrade sites, batteries, flag locations, randomizers,
radiation and waste are **sites**, not ground elements, because a square can
carry several and the ground token holds one element.

```json
"ground": {
  "rows": [ … ],
  "sites": [
    { "at": [4, 3], "has": ["repair"] },
    { "at": [7, 4], "has": ["upgrade", "battery", "flagspot"] }
  ]
}
```

| | |
|---|---|
| stacks freely | battery + either wrench, flag location + anything |
| never both | one wrench and two; radiation and waste |
| sits on | depends on the marking — see `place` below |

Where a marking may stand is a property of the marking (`place` in
`rulesets/sites.js`, decided by `restsOn()`):

- `place: "rest"` — the collection markings (wrenches, upgrade, battery, flag
  location) sit where a robot comes to rest: plain floor or still water.
- `place: "standable"` — randomizers, radiation and waste sit on anything a
  robot can occupy, belts included.

`propAt()` merges an element's properties with its sites', so the engine gets
the same answer however a square's features are spelled. Turning a marked
square into something the marking may not sit on is refused rather than
silently dropping the marking.

The workshop draws every marking. A race does not: the renderer's `sites`
option (`boardSVG(board, { sites: "classic" })`) draws only what that edition
uses, and `flagspots: false` hides flag locations. The default, `sites: "all"`,
is the workshop's.

### Walls: one storage slot per edge

`hRows[r][c]` is the horizontal edge between `(c, r−1)` and `(c, r)`;
`vRows[r][c]` the vertical edge between `(c−1, r)` and `(c, r)`. Glyphs are
`' '`, `'#'` and `'D'`. East-of-(3,4) and west-of-(4,4) are the same slot, so
they cannot disagree. The perimeter has real storage.

A wall device **anchors to an edge and names a face**, which must be one of
that edge's two normals; the square it stands in is derived from the two.

- **A repulsor field** is a `#` with a `repulsor` device on it: a springy wall
  from both sides. The bounce is the engine's (`playCard`).
- **A one-way wall** is a `#` with a `oneWay` device whose face points into the
  red square. From there it is a wall; from the green side it is nothing.
  `blockedAt` is the one place that reads its side.

### Registers: one spelling of "always"

`"regs": [1, 3, 5]`, 1-based, ascending, a proper subset of 1..5. **Every
register is spelled by omitting the key**; `[]` and all five are both refused.

A swing door and a trap door must carry `regs`: open in every register or in
none is not a door.

### Elevation

`ground.levels` is optional and omitted on a flat board. One character per
square, a **signed offset from the board's base floor**:

| | |
|---|---|
| `0` | the base floor — the level you walk in on |
| `1` … `9` | one to nine levels **up** |
| `A` … `I` | one to nine levels **down** |

The base floor is 0 on every board, which is what lets `assemble()` copy each
board's levels straight into a course. There is no contiguity rule.

**Ledges are derived**: any edge whose two squares differ in level is a ledge.
Board lasers stop at a level change.

**A ramp is an edge**, on its own lattice beside the walls': `ground.rampH` and
`ground.rampV`, shaped like `wall.hRows` and `wall.vRows`, glyphs `' '` and
`'R'`, omitted together when there are none. Which way is up is derived from
the levels. The foot is a real square: climbing costs a step onto it and
another across the edge; coming down passes over it. A ramp may stand on a
board's rim, since the square beyond belongs to whatever board is laid next to
it. The validator refuses a ramp under a wall or between two squares at the
same level.

---

## Flags: boards suggest, courses decide

A board's **flag locations** (`flagspot` sites) are the squares its author is
willing to see raced to. A course's **flags** are the ones a particular race
uses. When the workshop or a quick game suggests flags, it picks from the
marked squares.

`flagRefusal()` in `lib/course.js` is the one definition of where a flag may
stand, used by both the validator and the suggester, so the suggester can
never offer what the validator refuses.

## A course is a list of placements

```json
{
  "format": "PRCourse", "version": 1,
  "id": "longHaul", "name": "The Long Haul", "kind": "track",
  "stamps": [
    { "role": "board", "board": "cross",      "rot": 0, "at": [0, 0] },
    { "role": "board", "board": "exchange",   "rot": 1, "at": [12, 0] },
    { "role": "dock",  "board": "dockingBay", "rot": 0, "at": [12, 12] }
  ],
  "flags": [[33, 2], [21, 9], [9, 3]],
  "minPlayers": 2, "maxPlayers": 8
}
```

Never a saved grid: the grid is assembled from the boards every time, so a
board corrected later corrects every course it appears in. Nothing in the
course model assumes 12×12; boards of any size compose.

- **Stamps** are laid in order; **the last is on top**, and a board laid over
  another replaces the squares beneath it. The validator warns on overlap
  (`course.overlap`).
- **The docking bay** is a stamp with `role: "dock"`. A course may also place
  its own starting squares with `starts: [[c, r], …]`; a race needs eight in
  total unless `bays` lists the ones it uses. Bay numbers are one character:
  1–9, then `a`, `b`, `c` for 10–12.
- **Flags** are `[c, r]` in course coordinates; the array index is the flag
  number.
- **`reboots: [[c, r, facing]]`** places 2016 Reboot Tokens (one per board,
  none on the docking bay); **`rebootDamage`** overrides the default two.
- A course with **`role: "course"`** as its single stamp is a flattened course
  — one board of origin `course`, the only origin allowed holes — made by
  *Edit as one board* in the course workshop.

---

## Two rulesets, and neither filters anything

`rulesets/classic.js` (1994–2005) and `rulesets/modern.js` (2016–). The rail
offers every element; the validator refuses nothing for belonging to one
printing; a course may mix boards freely. Filtering is the engine's job at
play time.

In the workshop, the inspector shows what a robot on a square would meet
under **both** rulesets, so where they differ you see it.

Every element and device records **`printedIn`**: which box prints it. That
is provenance, not a constraint — every board plays under either book.

Where one name means two different behaviours on the same printed tile (oil,
portals), there is **one** element and the difference is a field on each
ruleset (`oilSlideAfter`, `portalBlockedBy`), which `check-lib.js` asserts
exist and disagree. Where two different tiles do the same thing (a flame jet
and a flamer), they stay two device kinds and `playsIn` in `devices.js`
declares the shared reading.

## Rendering

`render/svg.js` emits one self-contained SVG per board, with the palette
(`render/palette.js`) and the tile-art stylesheet inside it, so a board looks
the same in the workshop, the game, a snapshot, or anywhere else.

- **Board art** is the game's art. Registers a device fires on are stamped on
  its tile in hazard yellow; no stamp means every register.
- **Markup mode** is a thin line-work glyph set for tracing over a photograph:
  one colour per layer, a dark halo under every stroke, and walls in green,
  since nothing printed on the boards is green. **View** (or backtick) toggles
  between them.

## Using the workshop

- **Board library**, at the bottom of the inspector: every shipped board as a
  thumbnail. Opening one opens a clone; the board you were on goes to
  **Recover previous**.
- **Tracing**: **Open…** drops a photograph behind the grid; fade between
  them, or hold **Ctrl** to see the photograph alone. The photograph is never
  uploaded, stored or exported.
- **Changing a belt's arms in place**: Select tool, click the belt, pick the
  new shape in the selected-square panel. Re-laying it would lose its facing.
- **Keys**: W A S D pan; arrow keys face the thing in hand; Q and E turn it,
  or turn the selected board in the course workshop. In the course workshop,
  **B** places starting squares and **R** places Reboot Tokens.
- **Course workshop**: drag boards off the rail onto the floor and around it;
  the selected board has its own turn and remove buttons. It autosaves, and
  Ctrl-Z undoes. *Edit as one board* flattens the course into a single
  editable board; *Save to course library* and *Play* write it back.

## What the validator refuses

The diagnostic codes live in `validate/`, grouped: document shape, layer
shape, ground legend, ground geometry, the wall lattice, wall devices, lasers,
flame jets, registers, ceiling, floor devices, elevation, provenance, library, course.

- **Nothing is ruleset-specific.** The one edition-specific guideline — the
  classic book keeping flags within twelve squares of each other — is a
  warning that says which book it comes from.
- **Every rule must trace to a rulebook.** A rule nobody can cite is at most a
  warning. A contradiction in the data itself (a ramp under a wall) is an
  error.
- **Every code has a negative test that provokes it**, and
  `validator-selftest.js` asserts the set of codes provoked equals the code
  table, so a check added without a test fails CI.

## Checks

```bash
node editor/tools/check-imports.js          # every specifier resolves; every file is committable
node editor/tools/check-lib.js              # the format library
node editor/tools/check-app.js              # the tool model and the course model
node editor/tools/validator-selftest.js     # every code proven able to fail, plus coverage
node editor/tools/make-fixtures.js --check  # the fixtures carry every element and device
node editor/tools/check-format.js           # validate, round-trip, and the ASCII picture
node editor/tools/render-snapshot.js --check
node editor/tools/check-wiring.js           # no control the inspector draws is dead
node editor/tools/build-index.js --check    # data/index.json lists exactly what is in data/
node editor/tools/check-editor-assets.js    # and the deploy will actually publish it all
```

`render-snapshot.js --emit <dir>` writes every board in both modes as SVG, for
seeing what changed when a snapshot fails.

## Shipping a board or a course

`data/index.json` is **derived, never edited**. Export from the workshop with
**Download**, drop the file into `data/boards/` or `data/courses/`, run
`node editor/tools/build-index.js`, and commit both. The tool refuses a file
that does not validate and a course that lays a board not on disk; CI runs it
with `--check`, so a file on disk that is not in the index fails the pipeline.
Existing entries keep their order; new ones go on the end.

## Adding an element or device

1. A row in `rulesets/elements.js` (ground) or `rulesets/devices.js` (wall,
   floor or ceiling), with its properties and `printedIn`. A marking that stacks with
   floor is a row in `rulesets/sites.js` instead.
2. Its art in `render/` for both board art and markup mode.
3. Any validator code it needs, each with a negative test.
4. `node editor/tools/make-fixtures.js` so the fixtures carry it, then the
   snapshot checks.
5. Its rule in the engine — see `game/README.md`.

## Conventions

- **Derive, don't store**: docking bays from the `s` cells, ledges from the
  level difference, a device's square from its edge and face, the turn from
  the arms.
- **One function per concept**: `rotateBoard`, `firesIn`, `blockedAt`,
  `laserPath` — the drawn beam and the damaging beam are one list.
- **Serialize ∘ parse is byte-exact**, asserted for every shipped board.
- **Watch a check fail before trusting it.**
- **No dead controls.** `check-wiring.js` renders the panels and requires every
  `data-` attribute they emit to be one the handler names.
