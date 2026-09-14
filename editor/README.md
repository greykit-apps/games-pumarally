# The board workshop, and PRBoard v1

Draw, validate and export factory floors; assemble them into courses and put
the flags on. Three static files' worth of vanilla ES modules — no bundler, no
dependencies, no build step, and no network at drawing time.

```
editor/index.html          the workshop
editor/index.html#course   the course workshop
editor/index.html#board=island
```

---

## A board is three layers

`ground`, `wall` and `ceiling`, and the split is not a filing decision. It is
the answer to a question the old format kept having to re-answer: **is this
thing the square, or is it standing on the square?**

- a pusher is bolted to a **wall**, and board H prints a conveyor beneath one
- a press comes down from **above**, and every one on Cannery Row stands on a belt
- a flame jet plays over the floor in front of its nozzle and can reach two squares
- a crusher comes down from above and **faces nowhere** — so no ceiling device
  has a `face` field at all, and a transcriber cannot fill one in wrongly

```json
{
  "format": "PRBoard", "version": 1,
  "id": "provingCorner", "name": "Proving Corner", "w": 4, "h": 4,
  "edition": "classic", "set": "authored", "origin": "authored",
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
which is what catches a `flags` array written into a board. Flags are placed by
the *course*, exactly as in the box, which is what lets one board serve many.

### The ground token: three characters

`[element][argument][arms]`, and a row is `w` tokens joined by single spaces, so
exactly `4w − 1` characters. The separator carries weight: the validator checks
that every index `4k−1` is a space, so a row that loses a character fails at a
**named column** rather than only "this row is the wrong length".

`"   "` is a hole. Legal on an assembled course, never on a printed board.

### Conveyor arms, and why they are relative

A belt is not only a direction. The board *prints* whether a square is a plain
straight, a curve, a T-merge or a crossing, and that is a rule: **a robot
carried onto a curve, or into the arm of a merge, turns a quarter; one carried
onto a plain straight from the side does not turn at all.**

The third character says which sides show an incoming path, **relative to the
belt's own exit**:

| char | arms | printed shape |
|---|---|---|
| `.` | back | plain straight — the default, and its only spelling |
| `l` | left | curve, fed from the left |
| `r` | right | curve, fed from the right |
| `L` | back + left | T-merge, joined from the left |
| `R` | back + right | T-merge, joined from the right |
| `x` | left + right | crossing with no rear feed |
| `X` | back + left + right | full crossing |

Three things are **derived** from that character and never stored, so they
cannot disagree with it: the quarter-turn a robot makes, the arc the renderer
draws, and what happens under rotation. Relative arms are rotation-invariant —
the exit turns and the arms follow — where the old absolute spelling had to be
remapped on every quarter-turn.

**Arms are printed data and are never derived from the neighbours.** A belt at a
board's rim is printed straight, or printed as a merge, and stays that way
whatever board is laid beside it; the printing cannot know. Deriving it made the
same board turn a robot on one course and not on another.

### Walls: one storage slot per edge

`hRows[r][c]` is the horizontal edge between `(c, r−1)` and `(c, r)`; `vRows[r][c]`
the vertical edge between `(c−1, r)` and `(c, r)`. Glyphs are `' '`, `'#'` and
`'D'`. There is no "east wall of (3,4)" to drift from "west wall of (4,4)",
because both name the same slot and there is only one. The perimeter has real
storage, so a board's rim is data rather than an absence every reader has to
remember.

A wall device **anchors to an edge and names a face**, which must be one of that
edge's two normals. The square it stands in is *derived* from the two — the old
format stored the square as well, so a device could name one whose wall was on
the wrong side of it. That is now unrepresentable.

### Registers: one spelling of "always"

`"regs": [1, 3, 5]`, 1-based, ascending, a proper subset of 1..5. **Every
register is spelled by omitting the key** — not `[]`, not all five; both are
refused, saying so.

A swing door is the exception and must carry `regs`: a door open in every
register is not a door, and one open in none is a wall.

### Elevation

`ground.levels` is an optional block of digits, omitted entirely when the board
is flat — so a flat board is byte-identical to one written before levels
existed.

**Ledges are derived, not stored.** Any edge whose two squares differ in level
*is* a ledge. A **ramp** is the only element that spans one; its own square is
the lower level and its arrow points uphill. Board lasers stop at a level
change.

---

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

Never a saved grid. The grid is assembled from the boards every time, so a board
corrected later corrects every course it appears in.

The docking bay is a stamp with `role: "dock"`, not a field of its own — which is
what lets its footprint come from its own rotated dimensions. **Nothing in the
course model knows the number twelve.** Boards of any size compose: 12×12, the
12×4 docking bay, Master Builder's 6×6 and 6×2. The flag array index *is* the
flag number, so inserting one renumbers everything after it.

| the old rule | what it was trying to say |
|---|---|
| boards sit on a 12-square lattice | snapping, in the pointer handling only |
| the block is the row below the lowest board | every bay has an unblocked way out of the dock |
| `c % 12` for "in a board's corner" | board-local coordinates, via the provenance array |
| Northrup's twelve, in the geometry | `ruleset.maxFlagGap` — a Chebyshev distance, not a Manhattan one |

---

## Two rulesets

Classic (1994–2005) and Modern (2016–). A board declares which game it was
printed for, a course may not mix them, and the validator refuses an element that
edition never printed — a repair site on a 2016 board is a transcription error,
not a variant.

**Where a name means two different elements, there are two entries.** Classic oil
stops a sliding robot at the first robot it meets; modern oil pushes that robot
and both slide on. Classic portals switch off while a robot stands on one; modern
portals refuse only when the destination is occupied. Same word, different
element, different character. This is not theoretical: `oRing` is a transcribed
2016 board with an oil slick printed on it, and under one shared entry it carried
the classic rules.

Conveyors are deliberately **not** split that way. The difference there is one of
resolution *order*, which belongs to the ruleset reading the board, and a board
declares exactly one edition — so splitting them would double the legend and
record no extra fact.

---

## Markup mode

The play art is solid, because a player picking a route reads depth as much as
symbol. That is exactly wrong for tracing: over a photograph it hides the thing
you are checking against.

Markup mode is a **separate, simpler glyph set** — thin bright line work with a
dark halo under every stroke, so one colour stays legible over printed yellow
*and* over shadow, and non-scaling strokes so lines stay hairline across the
whole zoom range instead of thickening back into blocks. One hue per layer.

**Walls are green.** They were yellow, and a printed board is yellow hazard
striping wall to wall — the mark vanished into the thing it was marking, and a
wall is what you most want to be sure you have transcribed. Nothing on these
boards is green.

Drop a photograph behind the grid with **Open…**, fade between them, and hold
**Ctrl** to see the photograph alone — a flip rather than a fade, because a 50/50
blend is the hardest way to compare two pictures. The photograph goes through
`createObjectURL`, is never uploaded, never stored, and is never part of an
export.

---

## What the validator refuses

84 diagnostic codes, grouped: document shape, layer shape, ground legend, ground
geometry, the wall lattice, wall devices, lasers, flame jets, registers, ceiling,
elevation, provenance, library, course.

**Every one of them has a negative test that provokes it, and the self-test
asserts that the set of codes it provokes equals the code table** — so adding a
check without a test for it fails CI rather than quietly reading as coverage.

Three checks were removed before they were ever written, rather than left
implying coverage they could not have: a runaway laser beam (a beam leaves a
rectangular board within `max(w,h)` steps), a beam that lights no square (the
path always contains the square the laser stands in), and "an element spanning a
level change" (an element occupies one square and cannot span an edge).

---

## Working on it

```bash
node editor/tools/check-imports.js          # every specifier resolves; every file is committable
node editor/tools/check-lib.js              # the format library
node editor/tools/check-app.js              # the tool model and the course model
node editor/tools/validator-selftest.js     # every code proven able to fail, plus coverage
node editor/tools/make-fixtures.js --check  # the fixtures carry every element and device
node editor/tools/convert-boards.js --check # the JSON still means what the old data meant
node editor/tools/check-format.js           # validate, round-trip, and the ASCII picture
node editor/tools/render-snapshot.js --check
node editor/tools/check-editor-assets.js    # and the deploy will actually publish it all
```

`convert-boards.js` **has a lifespan.** It runs for as long as
`pumarally-boards.js` is in the tree, because it is the proof that the
checked-in JSON still means what the old data meant, and it goes when that file
does. `check-format.js` carries on alone.

`--emit <dir>` on `render-snapshot.js` dumps every board in both modes as SVG,
for when a snapshot changes and you need to see what changed.

### Conventions worth keeping

- **Derive, don't store**: docking bays from the `s` cells, ledges from the level
  difference, a device's square from its edge and face, the turn from the arms.
- **One function per concept**: `rotateBoard`, `firesIn`, `blockedAt`,
  `laserPath` — the drawn beam and the damaging beam are one list.
- **Serialize ∘ parse is byte-exact**, asserted for every shipped board. If that
  stops being true, an export needs hand-correcting, and hand-correcting an
  export is where transcription errors get in.
- **Watch a check fail before trusting it.** Every vacuous pass this project has
  found was found that way, never by reading.
