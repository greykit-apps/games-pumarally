# The board workshop, reviewed against what it is for

Written 2026-09-15. Method: drove every tool in the browser and checked the
model after each action rather than trusting the picture; round-tripped an
exported board through parse, serialize, the ASCII picture and four rotations
in Node; read every module under `editor/`; and had a second reader review the
code independently, then re-confirmed its most serious findings in Node.
Everything in `editor/tools/` was green before and after, which is itself a
finding: none of the ten checks exercises the app layer's undo, import or
pointer paths, and that is where every defect below lives.

Your three goals, in the words you used, and where each stands:

| goal | can the format hold it? | can the tool do it today? |
|---|---|---|
| mark potential flag sites so the engine chooses among them | yes: `flagspot` site, `suggestFlags()`, `usableFlagSpots()` | **no** — the edit lands in the model but nothing redraws, undoes, revalidates or autosaves it (bug 1) |
| put classic wrenches and modern batteries on every map | yes: sites stack, one square carries both, `propAt()` merges them | **no** — same bug 1 |
| build complete courses that ship as defaults, and let players build them at play time | yes: `PRCourse` is a list of placements; save, reload, export all work | **partly** — flags drift when boards are added or removed (bug 2); nothing writes into `data/` or hands a course to the game (gap A) |

The **format is right** and the **library layer is sound**: edge rotation is
correct at the rim, arms survive rotation, canon round-trips names with quotes,
and hit-testing holds at any zoom and pan. The defects are in the app layer,
where the model is glued to the UI, plus two validator gaps. Six of them
corrupt or lose transcription data silently. All are small. Nothing here
changes the recommendation to build on this code.

## Bugs, most serious first

**1. A site edit does not redraw, undo, revalidate or autosave.** `same()` in
`app/state.js` compares cells, walls, levels, devices and five meta fields,
and never `board.sites`. `keep()` therefore reports "nothing moved" for any
edit that only touches a marking, and both callers skip `refresh()`. The
wrench, battery or flag location is in the model; the board does not draw it,
the inspector still reads *nothing marked here*, Undo stays disabled, the
diagnostics are stale, and the 400 ms autosave never fires, so a marking laid
as the last action before closing the tab is lost. Reproduced through the
inspector's *Marked* row and through the rail's site tools; a forced refresh
drew all three markings at once. *Fix: compare the sites map in `same()`.*

**2. Course flags migrate to a different board when the grid origin moves.**
Flags are stored in assembled-grid coordinates, whose origin is the top-left
of the stamps' bounding box. `place()` to the left or above, `remove()` of the
leftmost or topmost stamp, and `moveStamp()` all call `normalise()`, which
shifts the stamps and deliberately leaves the flags alone. Reproduced: flag 1
on Exchange at (2,2); take Exchange off; flag 1 now sits on a gear on Island.
The validator only objects if the new square is not floor. *Fix: apply the
shift `normalise()` makes to the flags too.*

**3. Swing doors cannot be edited or removed once laid.** A door has `face:
null`, so `faceCell()` returns null and `wallDevicesAt()` never reports a door
as standing anywhere. Three consequences: the door tool ignores the edge the
ghost highlights and lays on the hand's facing instead; the selected-square
panel lists no door, so there is no take-off button and no register row; and
right-click erase is refused with "Swing door is bolted to that wall. Take it
off first", advice nothing in the UI can follow. Only undo or a re-import
removes one. The wall tool clicked on a door edge overwrites the `D` with `#`
and orphans the device. Crash and Burn boards carry doors. *Fix: treat a door
as a device in every list that walks wall devices, and pass the hovered edge
into `applyDevice`.*

**4. Import silently repairs a broken document into a wrong board.**
`boardFromDocument()` emits diagnostics for a row a token short, a lattice of
the wrong height, or an unknown key such as a `flags` array, and still returns
a board with the bad row filled as floor and the walls blank. Every caller in
`main.js` reads the diagnostics only when the board is null, and the UI's
`checkBoard()` does not re-run the parse checks. Confirmed: a row three tokens
wide plus a `flags` array imports clean and shows no problems. The README's
claim that the closed schema catches a stray `flags` array is true in the
CLI and false in the browser. *Fix: show parse diagnostics on import and
refuse to autosave a board that carried errors.*

**5. Ramp checks are skipped on a flat board.** `checkLevels()` returns as
soon as the board uses one level or fewer, before ramps are examined. A ramp
whose uphill square is level with it, or which points off the board, passes
clean. Reachable: lay a ramp, then lower its uphill square with the Level tool
or erase, or turn the ramp toward the rim with the facing buttons. *Fix: run
`rampsOf()` before the early return.*

**6. Fast drags skip squares.** A stroke paints only the squares the pointer
samples land in. A drag across four squares laid three and skipped (2,1); a
drag down four skipped (4,3). A hole in a belt run is a rules error, not a
cosmetic one. The README's claim that painting a run "writes the corner it
turns" is not implemented either. *Fix: interpolate between successive pointer
positions in `newStroke`.*

**7. Opening a shipped board destroys the transcription in progress.**
`startingBoard()` restores `__working`; `loadShipped()` then replaces the
board and calls `refresh()`, which autosaves the shipped board over
`__working`. *New board…* and *Import…* do the same with no confirmation.
*Fix: one slot per board id, or confirm when `st.dirty`.*

**8. The wall tool toggles on drag.** Re-tracing a printed wall over a
photograph inverts the segments already drawn. *Fix: latch add-or-remove from
the first square of the stroke.*

**9. The course workshop has no autosave and no undo.** *Open*, the shipped
course picker and any hash change reload the page and discard the course
being built; *forget* deletes a saved course with no confirmation.

**10. The view does not refit after the first board is laid.** The empty
course is a 1×1 grid fitted at maximum zoom, so the first board appears at
530% with one corner on screen.

**11. A site's `note` is dropped on read.** The format allows a note on a
site, the parser accepts the key, and the model never stores it, so a
transcriber's note on an uncertain square is lost on the first export with
no diagnostic. Device notes survive. No control writes any note at all.

**12. `unverified` does nothing.** Its tooltip says it keeps the board out
of course assembly; course mode offers every board in the index regardless.

**13. Hovering the board re-renders the inspector**, so nudging the mouse
while typing a name loses the caret. Right-click erase near an edge removes
the wall before the square's content whatever tool is in hand.

**14. Smaller.** *New board…* uses two `window.prompt` calls with no name, set
or origin, and does nothing where `prompt()` is blocked. A door on a rim edge
draws its register stamp off-canvas. The ASCII picture round-trip drops set,
origin, notes and `unverified`. A document whose site `has` is not an array
throws inside `mark()` on the first edit. Ctrl-held photo-solo sticks if the
window loses focus. `check-wiring.js` cannot see valueless attributes such as
`data-flagmode`. `turnHere()` compares a device against a copy of itself, so
turning a laser onto an edge holding a pusher is refused while laying that
combination is allowed. A door in hand with all five registers lit lays
`regs: []`, which the validator then rejects.

**15. The corner rule is not the book's corner rule.** `flagRefusal()`
refuses the geometric corner of a board. The classic rulebook (p.9) says a
checkpoint should not sit "in a corner formed by two or more walls", which
applies anywhere on the board. A flag on Island's top rim at (5,0) passed.
A flag under a crusher or flamer is also accepted; only wall devices are
checked.

## What worked, so it is on the record

- Every element, device and site on the rail lays what it says, with the wall
  it needs, and the validator stayed quiet on a legal board and spoke up on an
  illegal ramp foot, naming the square.
- The exported board re-parsed, re-serialized byte-for-byte, survived the
  ASCII picture and came back identical after four quarter-turns.
- A course with a board, a docking bay and a flag saved to the library,
  reloaded from `#course=testcourse`, and validated clean.
- Keyboard handlers ignore keys typed into inputs. W A S D, Q E, digits, F,
  Escape, Delete and backtick all did what the status line says.
- Rotation, merge arms, rim devices and markup-versus-art parity all check
  out against the geometry.

## Can it transcribe every board in the photographs?

Checked the legend against the element inventory in `maps/MANIFEST.md`:

| box | elements | expressible |
|---|---|---|
| classic base, Armed and Dangerous | belts with curves and merges, express, gears, pits, walls, lasers 1–3, pushers with registers, wrenches, two-wrench sites, docking bays | all |
| Crash and Burn | oil, portals, presses with registers, flame jets reaching two squares, swing doors with registers | all in the format; doors blocked by bug 3 in the tool |
| 2016 core | green and blue belts, push panels, gears, board lasers, batteries, pits, walls | all |
| Wet and Wild | water, drains, ramps, ledges, currents, crushers | all (ledges derived from levels) |
| Chaos and Carnage | teleporters, randomizers, deep pits, crushers | all |
| Thrills and Spills | portals, oil, flamers with register pairs | all |
| Master Builder | 6×6 and 6×2 boards | yes; builder tokens laid over a board have no overlay concept, so a token becomes an authored copy of that board |

Things the format holds that the tool cannot reach: two wall devices of the
same kind in one square (a corner with a laser on two walls) is refused by
the tool and accepted by the model; portal colours 5–9 and levels 4–9 are
offered only through the digit keys; a per-device or per-site note has no
control. A reach-2 flame jet marks its second square with a digit only, so
over a photograph the covered square is not visibly claimed.

Three things are not board data and are modelled as if they were. **Reboot
tokens** and the **priority antenna** are placed at setup, so they belong
with the flags at course level, not as ground elements; as elements they
also cannot share a square with a battery. Cannery Row's numbered discs are
presses and are covered. Nothing a transcriber of these boards needs is
missing from the format.

## Gaps against the third goal

**A. There is no door from the workshop into the game.** The shipped
`data/index.json` and `data/courses/*.json` are written by
`convert-boards.js` from `pumarally-boards.js`; the editor's data is a
derived copy, in the wrong direction for what you want. Export JSON puts a
document in a textarea and stops. The rebuild plan already makes
`editor/data/` the game's source, which closes half of this; the other half
is an `index` tool that rebuilds `index.json` from the files on disk, so a
saved course becomes a default by dropping one file in, and a *save and
play* door that the game's setup screen answers.

**B. No shipped board marks a flag location.** Zero of seventeen. The
suggester is finished and has nothing to choose from. This is transcription
work with the photographs open, five or six squares per board, and it must
wait for bug 1 or every marking will look like it failed.

**C. Batteries exist only on the eight 2016 boards, wrenches only on the
classic ones.** Same job as B, same dependency on bug 1.

**D. Seats are 2, 4, 6 or 8.** Your seating requirement is any count from one
to eight with any mix of humans and bots, including a solo run and
bot-versus-bot. `minPlayers`/`maxPlayers` on the course can already say that;
the four buttons cannot.

## Status, 2026-09-15 (same day)

Fixed, each with a test in `check-app.js` or a case in `validator-selftest.js`
that was watched failing first: bugs 1 to 8, 10, 11 (site notes), 12, the
hover re-render and the blur half of 13, and from 14 the `prompt()` dialog,
the rim door glyph, the non-array `has`, the sticking Ctrl, the wiring regex,
the `turnHere` copy and the empty door register list. Bug 15 is now a warning
under the rulebook's wording. Gap A is closed by `editor/tools/build-index.js`
and a Download button on both export dialogs. Not done: bug 9's *forget*
confirm, the picture round-trip's metadata (documented behaviour), right-click
precedence near an edge, gaps B and D.

Gap C is closed under the **swap rule**, decided the same day for boards with
no better information: `swap-sites.js` added 31 batteries to the classic
boards' wrench squares and 39 one-wrench repair sites to the 2016 boards'
battery squares, each noted on its square as authored, so board design can
revisit them. Gap B, the flag locations, waits for that board-design pass.

## Order of work

1. Fix bugs 1 through 6, each with a test in `check-app.js` that exercises
   `keep()`, `normalise()`, the door paths, import diagnostics, the flat-ramp
   check and stroke interpolation. About a day.
2. Bugs 7 through 10: data-loss guards, wall-drag latch, course autosave and
   undo, refit on first stamp.
3. Add the `index` tool and a *Save to data* path, so a course on disk is a
   default course.
4. Mark flag sites, wrenches and batteries on the seventeen boards, against
   the photographs.
5. Move reboot token and antenna to course level when the modern engine
   needs them; not before.
