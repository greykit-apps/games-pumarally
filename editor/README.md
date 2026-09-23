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
which is what catches a `flags` array written into a board. Flags are placed by
the *course*, exactly as in the box, which is what lets one board serve many.

**A board does not declare an edition, and must not.** A board is just a board.
It can carry a wrench and a battery at once, and deciding which of its squares
matter is the *engine's* business at play time, under whichever ruleset the game
is being played by. `set` stays, because which box a board came out of is a fact
about the board; which game it is "for" is not, because it isn't for one.

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
draws, and what happens under rotation.

**Each arm is drawn as its own run**, arcing from its entry edge to the shared
exit edge, so a corner visibly bends and a merge visibly converges. The painted
arrow follows the *run*, not the exit axis — and that distinction is the whole
point: a curve rotates the robot on it and a straight one does not, so a board
that drew both with a straight arrow would be hiding a rule. A plain straight
carries an arrowhead; a turn or a merge does not, because the curve already says
rotation and a head there would compete with it. `render-snapshot.js` asserts the
seven shapes draw seven different things in both modes, and that a curve never
draws the same path as a straight.

**Arms can be changed where the belt stands**, on the same seven buttons you
picked the shape with before laying it. Select tool, click a belt, click a shape
— the board redraws on the click and the validator runs on it. Re-laying the belt
instead would lose the facing, and on a square with something on it, more than
that.

The rail's *in hand* panel and the selected-square panel are built from the same
rows, so learning the control once is enough. The hand and a selection are
mutually exclusive: picking a tool means you are about to lay something,
selecting a square means you are fixing what is there. Relative arms are rotation-invariant —
the exit turns and the arms follow — where the old absolute spelling had to be
remapped on every quarter-turn.

**Arms are printed data and are never derived from the neighbours.** A belt at a
board's rim is printed straight, or printed as a merge, and stays that way
whatever board is laid beside it; the printing cannot know. Deriving it made the
same board turn a robot on one course and not on another.

### Sites: markings a square carries as well as being floor

A repair site, an upgrade site and an energy space used to be ground elements,
one to a square. **They are not one to a square.** The same printed square is a
wrench in the classic game and a battery in the 2016 one, and which of them is
live is decided at play time by the ruleset in force. Making them elements
forced a choice the board does not make.

```json
"ground": {
  "rows": [ … ],
  "sites": [
    { "at": [4, 3], "has": ["repair"] },
    { "at": [7, 4], "has": ["upgrade", "battery", "flagspot"] }
  ]
}
```

**A flag location is the same kind of thing, and the reason the layer exists.**
The board marks where a flag *may* go — five or six on a map is the shape to aim
for — and the engine picks the three or so a given race uses, so the same course
does not run identically every time. A flag location therefore has to sit on a
wrench, an upgrade or a battery, because those are exactly the squares worth
racing to.

| | |
|---|---|
| stacks freely | battery + either wrench, flag location + anything |
| never both | one wrench and two — a square is printed with one or the other |
| sits on | see below — it depends on the marking |

**Where a marking may be printed is a fact about the marking, not about this
layer.** Four of them are *collection* markings — a robot comes to rest on one
and picks something up — so they sit where a robot comes to rest: plain floor,
or still water. Not a belt, a gear, a current or a pit. They carry `place:
"rest"`, and `restsOn()` in `rulesets/sites.js` is the one place that decides.

**A randomizer is not a collection marking.** It fires when you *reveal* a card
while standing on it, at the top of a register, and a robot is perfectly able to
be standing on a conveyor at that moment — **Pushy prints randomizers directly on
belt squares**. It carries `place: "standable"`: any square a robot can occupy,
which is everything except a pit and a hole.

It was the ground element `z` until 2026-09-17, and one ground token holds one
element, so the belt and the randomizer could not both be on the square. Keeping
`z` as well would give one thing two spellings, and `propAt()` merges both
layers, so nothing could tell which the board meant.

A marking never decides which book plays the board. The 2016 game meets a
printed wrench and has no use for it; the classic game does the same with a
battery; the randomizer works under either, drawing from the shared deck when
there is no deck of one's own. Which markings are *drawn* is asked per ruleset
(`sitesShown`), so a race under one book sees only what that book uses.
Turning a marked square into anything but floor is refused rather than silently
dropping the marking, which is how a board ends up carrying data nothing can see.

`propAt()` merges the element's properties with its sites', so an engine asking
*does this square repair* gets the same answer whichever way the wrench is
spelled.

The workshop draws every marking a square carries. A race does not: the
renderer's `sites` option (`boardSVG(board, { sites: "classic" })`) draws only
the markings that edition prints, so a classic race sees the wrench and no
battery and a 2016 race the battery and no wrench, and `flagspots: false`
leaves the flag *locations* off, since the course has by then said where the
flags *are*. The default, `sites: "all"`, is the workshop's.

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

`ground.levels` is an optional block, omitted entirely when the board is flat —
so a flat board is byte-identical to one written before levels existed.

**A level is a signed offset from the board's base floor, not a height.** One
character per square, so a level row is `w` characters exactly as a ground row
is `4w − 1`:

| | |
|---|---|
| `0` | the base floor — the level you walk in on |
| `1` … `9` | one to nine levels **up** |
| `A` … `I` | one to nine levels **down** |

Uppercase rather than the `a b c` a docking bay uses for bays 10–12, where the
letters go on counting *up*; one alphabet meaning two opposite things in one
format is how a transcription goes quietly wrong.

**There is no contiguity rule, and the one that used to be here was invented.**
"Levels count up from 0 with no gaps" is in no rulebook. A printed ledge says
only that two squares are on *different* levels — never how far apart, and never
which of them is the ground. The rule refused Water Park, whose floor drops
below the level you walk in on, and could only be satisfied by re-describing the
board: call the channel 0 and lift everything else to 1.

**The base floor is 0 on every board, and that is what makes boards compose.**
`assemble()` copies each board's levels straight into the shared course grid, so
the zeros have to mean the same height on all of them. A signed offset makes
that true by construction.

**Ledges are derived, not stored.** Any edge whose two squares differ in level
*is* a ledge. Board lasers stop at a level change.

**A ramp is an edge, not a square.** Wet and Wild calls it "an extra space of
floor" on the way up and the board prints it on the lower square, but what it
*is* is a way across one level change: the boundary between a square and the
square uphill of it. It lives on its own lattice beside the walls' —
`ground.rampH` and `ground.rampV`, shaped exactly like `wall.hRows` and
`wall.vRows`, glyphs `' '` and `'R'`, omitted together when the board has no
ramp — so `h:3,0` names the same edge whichever lattice is asked, and a square
with ramps on two sides (which the printed boards have) is two marked edges and
nothing more. It was a ground element once, `R` with an uphill arrow, and that
could not spell that square at all.

**Which way is up is derived from the levels**, exactly as a ledge is. The
higher of the two squares is the top, the lower is the foot — the square the
board prints the ramp on — and a ramp cannot disagree with the elevation under
it because it does not say. The foot stays a real square: climbing costs a step
onto it and another across the edge; coming down, the engine passes over it, as
the sheet says the ramp "does not act as an extra space". In the ASCII picture a
ramp takes the lattice slot a wall would, `RRR` or `R`, since an edge is a wall,
a door, a ramp or nothing.

The validator refuses a ramp under a wall and one between two squares at the
same level: each is the data contradicting itself, not a claim about the game.
**A ramp may stand on the board's rim.** Boards compose, and a ramp at the edge
climbs onto — or down from — whatever board is laid beside it, which this board
cannot know, exactly as a belt at the rim runs onto the next board; what it does
is settled on the assembled course, where both squares exist. On the board alone
it is drawn on its one square, climbing off the edge. Two rules about ramps that *look* right —
that a ramp climbs exactly one level, and that its foot is level with the square
it is approached from — are **warnings**, because no rulebook sentence has been
found that states either; see `no-invented-validator-rules` in the project
memory for why an uncited rule enforced as an error is worse than none.

The **Ramp** tool is an edge tool like the wall: click an edge to lay one, click
again to take it off. Between two squares at one level it raises the far square
a level as the ramp goes down, since a ramp joins levels and laying one flat is
always half an edit; between squares that already differ it touches nothing.

---

## Boards mark where a flag *may* go; courses say where the flags *are*

Those are different jobs and both are real.

A board's **flag locations** are the squares its designer is willing to see raced
to — somewhere a robot can come to rest, not in a corner, not under a ram. They
are a `flagspot` site, so they stack with a wrench, an upgrade or a battery,
because those are exactly the squares worth racing to.

A course's **flags** are the ones this particular race uses. Premade courses set
them by hand, and so can you.

What the marks are *for* is the **suggestion**. When the computer offers a set it
picks from the marked squares rather than from anywhere on the floor, so an
offered course cannot put a flag somewhere the board's author would not have.
The course workshop offers three, four or five, or one per board — one from each
board that marks any, and it says which boards marked none rather than quietly
coming back short.

**One definition of where a flag may stand**, `flagRefusal()` in `lib/course.js`,
used by the validator *and* the suggester. A suggester working to looser rules
than the validator would offer sets the validator then refuses; a stricter one
would refuse squares a person is allowed to use by hand. `check-app` asserts every
offered flag is both marked by a board and accepted by the validator.

A course **warns** when the boards it lays mark fewer than five between them: a
race uses about three, and five or six leaves the engine something to choose
between so the same course does not run identically every time. A guideline, so
a warning — and every shipped course trips it today, because no board is marked
yet.

## A course is a list of placements

A course may also carry `reboots: [[c, r, facing], ...]`, the 2016 game's
Reboot Tokens, placed like the flags (one per board, none on the docking bay,
anywhere but a pit -- a flag or a token switches off whatever board element
is under it, as the 2016 book says, walls and the lasers on them excepted;
the facing is the arrow a robot standing on the token is moved along when
somebody reboots onto it), `rebootDamage`, the damage a reboot draws when
the course says something other than two, and `bays`, the numbers of the
docking bays the course uses when the book covers the rest with Energy
cubes. A docking bay's number is one character: 1-9, then a, b, c for 10
to 12, since the 2016 Docking Bay prints twelve. The workshop's
**Place tokens** tool (R) lays them; clicking a token turns it, right-click
takes it off; Q and E set the arrow for the next one.

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

**Boards may overlap**, and the order of the stamp list is the stacking order:
the last laid is on top, and the squares under it are out of play — replaced
by what it prints: the square, its markings, its level, the devices standing
in it, and the walls between two covered squares. An edge between a covered
square and one outside the footprint is a seam, and a seam is a union, as
between two boards laid side by side. Master Builder lays its small boards
over the big ones this way; with arbitrary placement a full-size board may do
the same. A board moved is laid again, so it comes to the top. The validator
says where one board lies over another (`course.overlap`, a warning).

A race needs **eight starting squares**, and the docking bay board is only the
quick way to them. A course may instead, or as well, place its own with
`starts: [[c, r], …]` — one square at a time, anywhere on plain floor, numbered
after whatever the boards print (Master Builder's 6×2 dock prints six, so a
course laying it places two more). `assemble` paints them into the grid as bay
squares, so the engine, the renderer and the bay checks see them exactly as
they see a printed one; the validator holds the total to eight
(`course.bayCount`) unless the course names the bays it uses with `bays`. In
the workshop the tool is **B**; a start the validator refuses (a pit, a belt,
the docking bay board's own footprint) says why at the square.

| the old rule | what it was trying to say |
|---|---|
| boards sit on a 12-square lattice | snapping, in the pointer handling only |
| the block is the row below the lowest board | every bay has an unblocked way out of the dock |
| `c % 12` for "in a board's corner" | board-local coordinates, via the provenance array |
| Northrup's twelve, in the geometry | `ruleset.maxFlagGap` — a Chebyshev distance, not a Manhattan one |

---

## Two rulesets, and neither of them filters anything

Classic (1994–2005) and Modern (2016–). The rail offers every element there is;
the validator refuses nothing for belonging to one printing or the other; a
course may mix boards freely. **Filtering is the engine's job at play time. The
editor's job is to show everything it knows.**

The only thing a ruleset does here is answer *what would a robot standing on this
square meet, and in what order* — and the inspector shows **both** answers rather
than asking which you meant. Where the two agree it reads as one answer; where
they differ, that difference is the reason for showing it. Hover an express
conveyor and you get it plainly:

| | |
|---|---|
| Classic | Express conveyors move one → All conveyors move one |
| Modern | Blue belts move two |

Same distance, different route — and it matters wherever a robot is in the way
for one pass and not the other. That participation rule is data on the ruleset
(`expressAlsoRunsWithNormals`), not a branch in the panel that draws it.

**Where a name means two different elements, there are two entries** — and this
survives the above, because it is about the *rules*, not about which board may
carry them. Classic oil stops a sliding robot at the first robot it meets; modern
oil pushes that robot and both slide on. Classic portals switch off while a robot
stands on one; modern portals refuse only when the destination is occupied. Same
word, different element, different character. Not theoretical: `oRing` is a
transcribed 2016 board with an oil slick printed on it, and under one shared
entry it carried the classic rules.

Conveyors are deliberately **not** split that way. The difference there is one of
resolution *order*, which belongs entirely to the ruleset reading the board, so
splitting them would double the legend and record no extra fact.

### What is printed, and who plays it: `printedIn`

Every element and device records `printedIn` — which box prints the thing. That
is **provenance and never moves**, because it is transcription. It is not a
verdict on who may play it: **every board plays under either book** (issue #14).
An element the other box printed works as its own book says it does — water
costs a space of movement under the classic rules too, a swing door shuts in
its printed registers under the 2016 rules too, currents convey in a step of
their own after the belts under both — and what a book has no use for simply
does not show: a wrench under 2016, a battery under classic. There was once a
second field, `playsIn`, read by a `playableIn(board)` that decided which books
the setup screen offered a board to; both are gone, and the inspector line
"Carries a *thing*, which only *Classic* prints" is now provenance and nothing
more.

One reading is shared, **declared in `devices.js` and ours rather than either
book's**: a Crash and Burn flame jet and a Thrills and Spills flamer stand in
for each other. Both are fire over a square doing one point of damage, and
neither rulebook says a word about the other's. They stay **two device kinds**,
because the pictures differ in a way a transcriber has to record — a jet is
bolted to a wall, faces, and reaches one square or two; a flamer hangs over a
single square and faces nowhere — and only the *reading* is shared. **The
timing is not.** Each edition burns by its own book: classic on the way
through, again for not leaving, and again at the burner's own step after the
lasers; 2016 on the way in, and once more at the end of the register. That is
the press and the crusher's conclusion one step further on: there, two names
turned out to be one device and merged; here, two devices turn out to be one
thing *happening*, which is a weaker claim, so it is declared instead of
merged, and `check-lib.js` asserts that the two declare it and nothing else does.

**View** switches how the board is *drawn* — board art, or markup line work — and
is the only view control there is. Backtick does the same.

---

## The board art is the game's

Not re-derived — ported, with the class names and the reasoning intact. The art
is class-based and the palette drives it, so `render/palette.js` carries the
game's tokens and its tile-art stylesheet across with the shapes; re-typing every
colour into every drawing would have been a transcription job with nothing
checking it.

The drawings carry rules, and that is why fidelity matters:

- a pusher is a striped plate on a scissor, not an arrow, *"because every other
  arrow on this board means a conveyor, so an arrow here said 'you will be
  carried' when it means 'you will be shoved, on these registers and not the
  others'"*
- a pit's hazard frame is dimmed, because *"at full strength a course of pits
  reads as a warning label rather than as a floor with holes in it"*
- a gear's arrow sweeps 250°, because a short one made clockwise and
  anticlockwise indistinguishable at tile size — *"a rules bug wearing an art
  bug's clothes"*
- a conveyor's arrow follows the **run**, so a curve looks like a curve

**Which registers a thing fires on is stamped on the tile.** It is a rule, not
decoration, so it goes on the board rather than into a legend — hazard yellow on
the dark ground, in the corner. Here the stamp **turns with its device**, so it
lies along the wall the thing is bolted to and reads as part of the machine; the
game keeps it upright instead. A chosen difference, not a slip. An empty register
list means *every* register and the board prints nothing, so neither does this.

Two things had to change for an editor that emits one self-contained SVG rather
than positioned DOM. **Walls** are drawn as bars of the same width (0.19 of a
tile, centred on the edge) filled from a gradient of the game's concrete stops,
with the shadow as a filter — concrete and *not* hazard-striped, because in this
art language stripes mean "this will move or swallow you" and a wall is the one
thing that will not. And the **stamp** is SVG text rather than an HTML span.

The palette and the stylesheet travel *inside* the SVG, so a board renders
identically in the editor, in a snapshot, and anywhere else the string is
dropped.

## Markup mode

The play art is solid, because a player picking a route reads depth as much as
symbol. That is exactly wrong for tracing: over a photograph it hides the thing
you are checking against.

Markup mode is a **separate, simpler glyph set** — thin bright line work with a
dark halo under every stroke, so one colour stays legible over printed yellow
*and* over shadow, and non-scaling strokes so lines stay hairline across the
whole zoom range instead of thickening back into blocks. One hue per layer.

**A gear's arrow is one path.** Which way a gear turns is a rule the player reads
off the board, so the arrow is the loudest thing on the tile: a 250° sweep, far
enough that the eye follows it round, with the head sitting *exactly on the arc's
end* and pointing along the tangent there. Computing the head's position
separately lands it near the end rather than on it, and the arrow reads as two
disconnected marks — which is what was wrong with the first version, two units
adrift and written as a separate subpath. `render-snapshot.js` parses the emitted
path and checks the join, the sweep, and that the two directions differ.

**Walls are green.** They were yellow, and a printed board is yellow hazard
striping wall to wall — the mark vanished into the thing it was marking, and a
wall is what you most want to be sure you have transcribed. Nothing on these
boards is green.

### The board library, and the way in

The inspector ends with **Board library**: every shipped board as a thumbnail,
and a click opens it. Clicking one replaces the board you are on, which goes to
the **Recover previous** slot rather than into the bin, and it opens a *clone* —
editing what you opened must not reach the copy the library is drawing.

**This did not exist, and its absence looked like a broken site.** The workshop
opened whatever board was last in hand, which is kept in that browser's own
storage, and the only route to any other shipped board was typing `#board=<id>`
in the address bar. So a browser that had last been used on one board showed
that board and no other, with nothing on screen suggesting there were seventeen
more — and because the storage is per-origin, the live site and a local server
would sit on different boards, which reads as a deploy that only published one
map. The course workshop had a rail of every board the whole time, but it
*stamps* them into a course rather than opening them to edit, so it was no way
in either.

The thumbnails are memoised by id and the markup is built once, when the library
arrives: the inspector redraws on every hover, and eighteen board drawings is not
something to rebuild at that rate. `refresh` only moves the pressed mark. The
library is fetched **after** the editor is up, because this is the landing page
and blocking it on nineteen requests would pay for the library with the thing the
library is attached to; the panel says it is loading, and a failure says *that*
rather than rendering an empty shelf, which would read as "there are no boards" —
the same wrong conclusion the panel exists to prevent.

Drop a photograph behind the grid with **Open…**, fade between them, and hold
**Ctrl** to see the photograph alone — a flip rather than a fade, because a 50/50
blend is the hardest way to compare two pictures. The photograph goes through
`createObjectURL`, is never uploaded, never stored, and is never part of an
export.

---

## What the validator refuses

79 diagnostic codes, grouped: document shape, layer shape, ground legend, ground
geometry, the wall lattice, wall devices, lasers, flame jets, registers, ceiling,
elevation, provenance, library, course.

**Nothing in that list is ruleset-specific**, and that is a rule about what
belongs here. There is no code for "an element this edition never printed",
because whether a board suits a given game is not this editor's question. The one
guideline that *is* ruleset-specific — the classic rulebook keeping flags within
twelve of each other — is a **warning**, worded to say which book it comes from
and that the other says nothing either way.

**Every one of them has a negative test that provokes it, and the self-test
asserts that the set of codes it provokes equals the code table** — so adding a
check without a test for it fails CI rather than quietly reading as coverage.

Five checks were removed rather than left implying coverage they could not have.
Two of them because a board has no edition to be wrong about (`ground.wrongEdition`,
`device.wrongEdition`), one because a set cannot disagree with an edition that
does not exist (`meta.setEdition`), one because a course cannot mix editions when
nothing has one (`course.mixedEditions`), and three that could never fire: a runaway laser beam (a beam leaves a
rectangular board within `max(w,h)` steps), a beam that lights no square (the
path always contains the square the laser stands in), and "an element spanning a
level change" (an element occupies one square and cannot span an edge). Two more
went later for being invented rather than read: `belt.headOn` (two conveyors
facing each other are rare and legal) and `belt.acrossLedge` — a conveyor may
run across a level change, carrying a robot down off a ledge at the drop's cost,
up one over a ramp, or off the board's edge, and the engine resolves each at
play time.

---

## Working on it

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

### The swap rule: retired as a process, kept as data

There was a rule, from 2026-09-15, for every board with no better information:
**a battery on every wrench square and a one-wrench repair site on every
battery square**, so that a board printed for one edition still had something
to offer the other. A tool applied it, and because neither printing carries the
other's marking, each one it added was **authored, not transcribed** — recorded
as such in the square's site note, in a fixed form `authoredOf()` in
`rulesets/sites.js` still reads back.

**The tool was deleted on 2026-09-16 and nothing re-applies the rule.** Marking
squares is map work now, done by hand in the workshop, where a transcriber can
see the photograph. That is the only thing that changed.

**The markings stay exactly as they are.** A square marked both a wrench and a
battery is a square marked both, and there is nothing to resolve: the two are
different properties of the same piece of floor, and each edition reads its own
— `repair` under the classic rules, `energy` under the 2016 ones, merged by
`siteProps()` and read through `propAt()`. *The engine converts nothing.* It
never did; the conversion was only ever the tool, writing into the JSON.

The distinction is worth holding on to, because "too many repair sites" sounds
like an engine problem and is not one. If a board offers more repair than it
should, the square list is where to look and the workshop is where to fix it.

### Shipping a board or a course

`data/index.json` is **derived, never edited**. Export from the workshop with
**Download**, drop the file into `data/boards/` or `data/courses/`, run
`node editor/tools/build-index.js`, and commit both. The tool refuses a file
that does not validate and a course that lays a board not on disk, and CI runs
it with `--check`, so a file on disk that is not on the shelf fails the
pipeline rather than going unnoticed. Existing entries keep their order; new
ones go on the end.

### What the first real use found, and what changed

The workshop was reviewed hands-on on 2026-09-15 (`EDITOR-REVIEW.md` at the
repo root). The format and the library layer held. The app layer did not, and
these are the rules that came out of it:

- **A site edit is a change.** The undo comparison ignored the markings, so a
  wrench, a battery or a flag location laid on a square was "nothing moved":
  no redraw, no undo, no revalidation, no autosave. `check-app` now asserts
  `keep()` sees a site edit.
- **A flag is a square of a board, not a place in the grid.** Laying a board
  to the left, taking the leftmost off, moving or turning a board all moved
  the grid under the flags and left the numbers alone. `keepFlags()` in
  `compose.js` tracks each flag by its stamp and board-local offset through
  every such edit, rotation included.
- **A door is a device.** It had no face and so no square, and nothing that
  walked wall devices ever found one: the inspector did not list it, erase
  could not remove it, the wall tool painted over it. Doors now lay on the
  edge under the pointer, list on both squares beside them with their register
  row, come off with their glyph, and refuse the wall tool.
- **A stroke visits every square it crosses.** `cellsBetween()` fills the
  squares between two pointer samples, so a fast drag lays an unbroken run.
  The wall tool latches on its first edge, so retracing a run never inverts it.
- **Import refuses a document that needed repair.** The parser pads a short
  row and blanks a wrong-height lattice and says so; the workshop used to read
  the report only when nothing came back at all. Now the errors are the
  message and the board is not loaded.
- **Ramps are checked on flat boards.** `checkLevels` returned before looking
  at ramps whenever the board used one level.
- **The board that was open is kept.** New, Import and `#board=` used to
  overwrite the autosaved transcription in progress. The outgoing board goes
  to a *previous* slot and the inspector offers **Recover previous**.
- **The course workshop autosaves and undoes.** Plain `#course` reopens what
  was being built; Ctrl-Z steps back; the view refits when the first board is
  laid instead of showing one corner at 530%.
- **A course can be edited as one board.** *Edit as one board* in the course
  workshop lays the assembled grid out as a single board of origin `course`
  (the one origin allowed holes) and opens it in the board workshop under
  `#edit=<id>`, where every square, wall and device is editable. *Save to
  course library* writes the board back beside a one-stamp course document
  (role `course`: a whole course with its docking bays inside it; the
  starting block is the box the bays span) after the course validator has
  passed it, and *Play* does that and opens the game on it. The placement
  list is given up in the copy, which is saved as `<id>_edit` so the
  original keeps its placements; a course already flat keeps its id. Flags
  stay with the course: the course workshop opens a flat course as one
  stamp with the flag tool, and the game's shelf reads the board out of the
  library entry.
- **W A S D pan the view** in both workshops (issue #3); in the board workshop
  the arrow keys face the thing in hand and Q and E turn it. WASDQE stay
  reserved from the tools.
- **Boards are dragged.** Off the rail onto the floor, or from where they lie
  to where they should be, as a ghost snapped to the squares and drawn red
  where it would overlap. Edges need not line up with another board's,
  because Master Builder's 6x6 and 6x2 boards do not; the validator still
  says when boards leave a gap nothing can drive across. A click on a rail
  board still puts it in hand, riding the pointer until the next click. The
  selected board carries its own turn and take-off buttons; Q and E turn a
  board in hand or on the floor.
- **The corner rule is the book's.** A flag in a corner formed by two or more
  walls warns (`course.flagWallCorner`), anywhere on the floor. A board's
  geometric corner is refused only when it is an OUTER corner of the course,
  with the drop on two sides; a board corner another board lies against is
  floor like any other, since the book's rule is about walls and not about
  where the cardboard ends. A course laying an `unverified` board warns too,
  which is what that flag now does instead of nothing.
- **Site notes round-trip**, and a `has` that is not a list is reported rather
  than crashing the first edit.

`convert-boards.js` is gone, with the old board file it converted from: the
proof that the JSON meant what the old data meant was kept green until the
old data was deleted, and the JSON is the source now.

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
- **A dead control looks exactly like a live one.** An unrecognised click falls
  through the handler chain and raises nothing, so `check-wiring.js` renders the
  panels for real and requires every `data-` attribute they emit to be one the
  handler names. It found two on its first run.
