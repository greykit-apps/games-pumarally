# Design notes and build log

Narrative that used to live in the READMEs: why things are the way they are,
what each milestone built, and what was found along the way. Kept for the
record; the READMEs describe the code as it stands, and where the two
disagree the READMEs and the code win. Dates and counts here are as of
writing and are not maintained.

See also `rebuild-plan.md` (the 2026-09-15 plan, milestones M0–M5) and
`editor-review.md` (the workshop review that preceded the rebuild).

---

## From the top-level README

> **Status: rebuilt, and playable under the classic and 2016 rules.** The game was
> rebuilt from the ground up on 2026-09-15 on the board workshop's
> foundation, after the first version stopped being fixable; `PLAN.md` says
> why and how, `EDITOR-REVIEW.md` records what the workshop needed first, and
> the tag `classic-monolith` holds the old game. What plays today is the
> classic game and the 2016 game, chosen at set-up: any mix of one to eight
> human and bot seats, fifty-two transcribed boards from the classic and 2016
> boxes (thirty-four of them on the quick-game shelf: a random facing, three
> flags drawn from where it marks), three multi-board courses, hot seat,
> autosave.


### What works today

| | |
|---|---|
| Board format, validator, renderer and workshop (`editor/`) | done |
| Classic rules engine: movement, pushing, conveyors, gears, pushers, presses, lasers, burners, damage and locking, destruction and return, power down, repair, checkpoints | done, 48 scenarios by name |
| Bots: distance fields and beam search, three skill levels | done |
| Headless simulation with conservation laws, on every course, mixed seats | done, in CI |
| The game on screen: set-up, draft, programming by click, keys and drag, animated floor, hot seat, autosave and resume | done |
| Option cards: all twenty-seven of the two printings, with their questions, the two-wrench site, the hand limit, the loss on destruction and the option exchange | done, 51 scenarios by name; the AMIGO eleven carry their German text and the reading each needed |
| Oil, portals, swing doors, unnumbered presses, burners on the way through, lives by game size (Crash and Burn, from the AMIGO book) | done, 29 scenarios by name |
| Fire under either book: a flame jet and a flamer stand in for each other, each resolved on its own edition's timing | done, 3 scenarios by name; a declared substitute, ours not the books' |
| The 2016 expansions' floor: water, drains, ledges and ramps, currents, randomizers, teleporters, flamers (from the three Factory Floor Guides) | done, 11 scenarios by name |
| The 2016 rules: own decks, Priority Token, SPAM and Haywire, Energy, the upgrade shop with all forty cards' effects, shutdown, reboot, the reference card's floor order | done, 76 scenarios by name; two declared substitutes (reboot point, first priority) |
| Flag locations marked on the boards, for the engine to choose among | done |
| One-way walls (Radioactive, and its 2016 reprint Contamination) | done, 5 scenarios by name; the rule is from the Ultimate RoboRally Collection, a fan compilation, as no publisher's rulebook is in the archive |
| Trap doors (Grand Prix; Turn & Burn; the 30th Anniversary boards) | done, 7 scenarios by name; a pit in the registers printed on it, opening at the END of the register -- the author's reading, so a robot may cross it or step off it in the register it opens |
| Repulsor fields (Grand Prix; Turn & Burn; the 30th Anniversary boards) | done, 8 scenarios by name; a springy wall, always on and from both sides (the author's ruling): a robot's own card throws it back as far as the card moves, a pushed robot goes back as far as its pusher's card, and a belt or a pusher meets a plain wall (ours) |
| Chop shops (Grand Prix; Turn & Burn; the 30th Anniversary boards) | marked and drawn so the boards can be transcribed; no effect in play yet, by the author's decision, until the Armed and Dangerous ammunition cards its refill needs are built |

---

## From game/README.md

### What is lifted from the old game, verbatim

`data/cards.json`, `data/options.json`, `data/upgrades.json`,
`data/liveries.json`. Card text, deck compositions and prices are
transcriptions of the physical cards and are copied, not retyped. The gaps
travelled with them: sixteen option cards of twenty-six, forty upgrades of
which eleven had effects, a damage deck with no Haywire. All three gaps are
closed now from photographs: the eleven AMIGO option cards (with their German
text alongside the English), the forty upgrade effects, and Haywire.

### Sequence

`PLAN.md` M1 onward. Classic first: engine headless, then the UI, then
cutover, then modern. `tools/scenarios.js` carries every rule the old suite
asserted, as pending until the new engine passes it, so the count that
matters is visible from the first commit.

### Status

Haywire is built (M5, third part), from the rule on p.18 of the rulebook
(`manual1/IMG_1263`) and the deck laid out and photographed face by face
(`IMG_1343` to `IMG_1348`): twenty-three SPAM and seventeen Haywire, every
face once. A Haywire taken during a register slides face down under that
register, one per register and the rest to the damage discard; at the end
of the round it stays; next round that register is not programmed, and when
it comes up the card is revealed and its text resolved, one step at a time
through the same request door as everything else (`cardChoice`, card
`haywire`, with a `tag` naming the question: facing, rotate, pay, install,
remove, order, side). Its text takes precedence: a Move 5 that hits a wall
costs a card, the token it takes stays at the end of the round, the upgrade
it installs is free and goes back at the end of the round, the laser it
charges deals two, the two cards it reveals resolve in the order chosen. A
shutdown scraps face-down Haywires; a reboot sends them to the table and
slides the first new one under the register the robot fell in. Rewire and
Lucky Booster act now, so all forty upgrades do. The random policy and the
bots programme a Rewired Haywire, as the card requires. Nine scenarios.
Found on the way: a hovering robot whose move a wall cut short over a pit
was left standing in it; it falls now, as the card says.

The three 2016 expansions' floor is built (M5, second part), read off the
Factory Floor Guides in `manual1/` (Wet and Wild `IMG_1236` to `IMG_1239`,
Chaos and Carnage `IMG_1243`, Thrills and Spills `IMG_1248` to `IMG_1251`):
water that costs a space on the way out of it, once per card and only on the
robot's own card; drains as pits; ledges, which cannot be climbed and cost
two damage on the way down, one into water, and which no weapon or board
laser fires across; ramps, an extra space on the way up that slides a robot
back down if it stops there, and no space at all on the way down; currents,
green belts that run at the board's third step and are water; randomizers,
which swap the card a robot reveals for the top of its deck; teleporters,
which throw a Move card two squares further forward, ignoring everything
between, and do nothing when the arrival square is taken; and flamers,
active for the whole of their registers, one damage on the way in or through
and one for ending the register in them. Eleven scenarios on authored
boards, since no shipped board prints any of it yet: the readers see these
elements (`editor/rulesets/elements.js`) and a course laying one is a 2016
course. Two readings are declared where the sheets are silent: a ramp's
slide-back is for the robot's own card, and a teleporter whose arrival
square is off the course does not operate.

All forty upgrade cards have their effect (M5, first part), read off the
rulebook pp.21-23 (`manual1/IMG_1264`, `IMG_1265`): the twenty-nine that
were installable and inert now act, through the same hooks as option cards
where they are passive and through two new moments where they are not. A
2016 robot's activation is three moments -- before its card, the card, after
it -- and a temporary upgrade is offered at the moment the book gives it
(movement upgrades "immediately before or after", the rest "at any time",
read as before programming and at either side of the card), used once, and
discarded as the answer lands. Two stay inert and say so: Lucky Booster and
Rewire need Haywire cards, which are not photographed. Thirty-nine scenarios
cover them. Also on this pass: a push a wall stops is still a push for
Ramming Gear and Spiky, and older saves are normalised on load.

The 2016 rules are built (M4), read off the 2023-printing rulebook and its
reference card (`manual1/IMG_1252` to `IMG_1269`), and chosen at set-up:
every robot its own deck of twenty (counted off `IMG_1308`), a hand of nine
drawn from it, leftovers to its own discard; the Priority Token deciding the
order within a register and passing left each round; Power Up and Again; the
upgrade phase with the forty transcribed cards, eleven of them with effects
fired through the same hooks as option cards and the other twenty-nine
installable and inert, saying so; damage as forty SPAM cards drawn one at a
time into the robot's own discard, and a SPAM revealed in a register thrown
away for the top of the deck; shutdown for the round, scrapping the damage a
robot holds and not what is in its deck; reboot instead of death, off the
board until register 1 of the next round, two SPAM and the programme
cancelled; Energy from batteries at the end of a register, capped at ten;
the floor in the reference card's order, blue belts twice then green once.
Forty-two 2016 scenarios pass by name. Every course is simulated under both
rulesets -- every board plays under either book (issue #14) -- with the
table's conservation laws armed: each robot's twenty, the forty damage cards
and the forty upgrades counted apart.

Reboot Tokens are built (pp.15, 20, 30; IMG_1261, IMG_1264, IMG_1269): a
course places them like flags (`reboots: [[c, r, facing]]` on the document,
one per board, none on the docking bay; or the token element on a flattened
floor), and a rebooting robot re-enters on the token of the board it fell
from, a robot standing there moved one square along the token's arrow; a
robot that fell off the docking bay re-enters at its archive, which under
these rules stays on the bay. A course's `rebootDamage` is what a reboot
draws: Cry Havoc's "3 damage cards instead of the normal 2". One substitute
remains, declared in `engine/state.js`: a course that places no tokens
re-enters the robot at its archive, which then follows the checkpoints; and
the Priority Token starts with seat 1 (the book says the youngest player).

Crash and Burn's floor is built, read off the AMIGO Spielanleitung
photographed into `manual1/` (pp.6-9 and the two reference cards): swing
doors that are walls except in their printed registers, for beams as well as
robots; portals that drop a robot out of the same-coloured twin on the same
board and carry on with the move, off while anyone stands on either end;
oil that costs a square at the start of a card and skids a robot on at its
end until it finds dry floor, a wall or a robot with grip, shoving one on the
same slick; unnumbered presses that come down every register; burners that
scorch a robot on the way in and again when they act, and a robot that does
not leave one; and lives that scale with seats and boards. What the two
editions do differently with the same printed tile is read from the ruleset
tables (`oilSlideAfter`, `portalBlockedBy` in `editor/rulesets/`), so the
2016 game is a change of table. Twenty-nine scenarios by name; simulated
games on board G, O-Ring, Cannery Row and board H hop, skid, sit in flames
and get crushed with the invariants armed.

Option cards are built under the classic rules: all twenty-seven of the two
printings (sixteen English, eleven more from the AMIGO box, which lacks Crab
Legs), each a data row bound to one of thirteen hooks in `engine/options.js`,
fired through one dispatcher. A card's *you may* asks through the same
request door as everything else (`cardChoice`), keyed so the step that asked
re-runs and finds the answer; a two-wrench site asks repair-or-card
(`siteChoice`); a wrecked robot chooses the card it loses at the end of the
register (`dropOption`), and so does a robot holding a fourth. The option
exchange, a card sacrificed to absorb a point of damage as it lands, is
offered on laser damage after the automatic absorbers have acted. Not on
burner or ramming damage: those land mid-move where nothing can ask, and the
book's "at the time the damage is received" is not met there yet. Twenty-nine
option scenarios pass by name; half the simulated games deal three cards to
everyone at the start so every hook and every question runs on every course.
The starting hand is dealt through the same door as a drawn card, so a coat
dealt at the start has its three charges; the invariants now refuse a held
card without its state and a damage total that is not an integer.

The expansion upgrades are built from IMG_1350-1353 and Master Builder's
five from IMG_1446-1447: eighteen more cards on the same table, in the deck
with the forty (`set` on each row says which box). Four of them decide
something where this engine cannot ask, deep inside a move, and each says
so on its row: Repulsion Field pays 1 Energy (the smallest X) and throws the
pusher back one, Anchor pays whenever it can, Bunny Hop hops whenever it
can, Calculated Odds keeps the SPAM when its two cards differ. Controlled
Chaos moves the Haywire when the robot next programs, the first moment a
question can be asked; Memory Transfer asks at the round's end; Top Heavy is
asked before the belts move anything; Splash Damage costs X, the number of
foes, at most four. Leaching, Chaos and Carnage's fifth card, is legible in
no photograph and is not built. Twenty scenarios by name.

The AMIGO eleven (manual1/IMG_1334-1342, German text kept on each data row)
brought three new moments and a few readings, each stated on the card's row
in `engine/options.js`. Reverse Gear and Fourth Gear are Brakes' shape. Turbo
Blaster is an optional weapon with five charges: one damage through the
target's absorbers, then a shove. Remote Control is an optional weapon too
(p.36-37: used when the main laser could fire, instead of it; the Turret
names it among them), range six, and "the program" is read as the rest of
this turn: the target runs the controller's card in each later register.
Shield names a direction without saying which; read as the front, one point
a register. Turret lets the main shot, and the optional weapons riding on
it, aim any way, asked only when a robot is in line off the bow. Fire
Control rides on a main-laser hit (p.36 files it with the extra weapons) and
lands with the damage: the shooter must lock a register, which holds its
card through the next turn as a damage lock would, or destroy an option
card. Command in Reserve parks a sixth card after programming and offers it
as each register's card is about to be revealed, so the card swapped in sets
the priority; Emergency Switch is offered at the same moment and, once
thrown, replaces every later card that turn from the deck; both leave a
locked register alone. Flywheel parks a card past the reshuffle into next
turn's hand. Circuit Breaker trips at the end of a turn on three damage. The
program cards lying on the option cards are counted by the conservation law
and go back to the table with the option card, or with the wreck. Building
Turret found that a laser pass asking two questions re-ran the first
robot's hook and lost its choice (a Pressor Beam next to a Tractor Beam
shot instead of shoving); the pass now keeps each shooter's decision as it
is made. Twenty-two more scenarios by name.

M3, the cutover, is done: the repository root's `index.html` is this game,
and `pumarally.js`, `pumarally-boards.js` and the tools that read them are
deleted. The tree has one engine, one format, one renderer and one editor.
The tag `classic-monolith` marks the last commit before the rebuild.

M2, the classic game on screen, is built at `game/index.html`: set-up with
the workshop's course shelf (shipped courses and any saved from the course
workshop in this browser), any mix of one to eight human and bot seats, the
three house rules; the draft with colours and lit bays; programming by click,
keys and drag; the floor animated from the engine's events; the panel drawn
from the pending request and nothing else; a hot-seat curtain between human
seats; autosave and resume. Verified in the browser through the draft, two
full turns, a two-human hand-over and a reload mid-game.

The replay is a schedule, register by register (issue #5). The events of a
batch are cut into phases -- the register mark, the cards, then each
board-element pass -- and each phase starts when the one before it has
ended, so the register's structure is on screen: a caption over the board
names the register and then each pass as it plays, and the card a robot
reveals floats over the piece. Within the card phase the robots overlap,
staggered across half a second in priority order, and a board pass plays
every event at once, because every belt does move at once; a group waits
only for a robot an earlier group is still moving, so a push and a card
played from a pushed square keep the engine's order. The card phase is a
fixed slot, the stagger plus a Move 3, so a register of Move 3s and a
register of rotates take the same time. The pieces are drawn from a record
of where they were drawn last, never from the state mid-replay: the state
is already at the end of the batch, which is how a Move followed by a Rotate
used to play as a turn and then a move, and a robot wrecked in register 5
vanished in register 1. Leaving a race stops its replay at the next beat,
so the loop cannot go on holding the new race's turn.

The replay keeps time with its own transitions (issue #2): a slide and a
turn are CSS transitions whose durations scale with the speed setting, and
the wait after each event outlasts the transition it started, so a belt's
curve turns the robot after it has arrived. And the replay cannot wedge the
game (issue #1): whatever throws inside it, or inside the engine loop, is
caught, the pieces are put where the state says, and the panel comes back
with the request that is waiting and a line saying what happened.

A robot that is off the board is drawn as a ghost on the square it comes
back to (the 2016 Reboot Token or archive, the classic archive), and the
programming panel says so, so its player programs from the right square
before the facing is chosen at register 1.

The panel's robot rows are mats. Each carries pip bars (lives in blue under
the classic rules, flags in yellow, Energy in green under the 2016 rules,
damage in red: the track, or the damage cards a robot carries), then the
robot's option cards and fitted upgrades as card faces (`ui/kitart.js` draws
the kind of thing each is: weapon, armour, drive, program, chassis, power)
with a themed hover box giving the printed text, the German where there is
one, charges, and the card's switch. A human's mat is live at every moment,
the floor moving or not, and answers the routine questions so the player is
not asked at every phase: a Shutdown button under the registers (Power down
under the classic rules, waiting for a point of damage as the book requires)
declares the shutdown for this turn and is otherwise taken as no; a damage
button says whether the option exchange pays a card or takes the point.
A card's questions are answered two ways, by where they come from
(`engine/asks.js`): a card that acts on the programmed card itself (Brakes,
Fourth Gear, an Emergency Switch at the reveal, a Power Slide after the
move, a temporary used before or after your card) asks about a register
whose contents the player already knows, so it has a button under each
register slot, armed per register, a single-use card in one register only;
a card that reacts to the floor (a Tractor Beam when somebody is in line,
the Turret's aim, Fire Control on a hit, a temporary used after the deal)
asks about a situation nobody can see while programming, so it has only the
switch. Every card that asks has the on/off switch on its face: off takes
its first option without asking, on asks the player each time the card
could be used, so two Move 3s can be run with Fourth Gear engaged for one of
them. An armed register is a standing yes and asks nothing, unless the
question has more than two answers (which register to lock, which way to
aim), which is always put to the player. The cards on a mat
can be dragged into an order, and the first card is the one paid for damage
or lost to a wreck or the hand limit. The preferences live in the screen and
localStorage, never in the state: `autoAnswer` is consulted by the loop
before a human sees a request, and answers through the same door a click
does. A robot already down is still asked whether to stay down.

M1, the classic engine headless, is built: draft, deal, programming, the five
registers in the printed order, damage and locking, destruction and return,
power down as three moments, repair at cleanup, checkpoints and the win, the
bots ported, and the bumpers and flag-touch house rules.

The 2016 docking rules (pp.3, 15, 24) are built ahead of the courses that
need them: a course may list the `bays` it uses (the rest are covered by
Energy cubes and nobody starts there), a robot placed in a bay faces off the
docking bay toward the course, a bay is numbered to twelve, and a checkpoint
or Reboot Token switches off the board element under it, walls and lasers
excepted, so it may stand on a belt as the printed courses have it.

Virtual robots (classic pp.8 and 15, IMG_1199 and IMG_1202) are built: a
robot returning to its archive square while another robot stands there
comes back on the square, virtual. It meets no robot: it pushes none and is
pushed by none, shoots none and is shot by none, while walls, pits, belts,
gears and board lasers act on it as on anything. Alone on its square at the
end of a turn, it becomes real. Every robot-to-robot question in the rules
goes through one function, `solidAt`, which is where the exception lives.
The start of the race stays on the docking bays, one robot to a bay.

The fire substitute is the one place a board plays outside the box that printed
it. Crash and Burn's flame jet and Thrills and Spills' flamer are fire over a
square, one point of damage, and neither rulebook mentions the other's; rather
than refuse Board G, Board H and The "O" Ring to the edition that did not print
their fire, each edition resolves whatever fire the board carries. The engine
asks one question, `fireAt`, and the callers gate on the BOOK rather than on the
device, so the timings stay apart: classic burns a robot passing through, again
for not leaving the flame, and again at the burner's step after the lasers; 2016
burns it on the way in and once more at the end of the register, with no point
at all for standing still. Declared in `editor/rulesets/devices.js` as `playsIn`
against `printedIn`, and held by three scenarios, one of which is only there to
fail if the widening ever spreads past fire.

### Open, and recorded here rather than solved in passing

- **Deploy caching — verified, with one trap left behind.** The host serves
  `.js` for thirty days without revalidation, and this is thirty modules. The
  repo root's `.htaccess` sets every script and data file to revalidate like
  the page, and the host **does** honour it: every `.js`, `.json` and `.svg`
  under `games/pumarally/` came back `Cache-Control: max-age=60,
  must-revalidate` on 2026-09-16, the page and the modules and the board data
  alike. The hashed-directory fallback is not needed.

  **But it only protects caches filled after the `.htaccess` landed**, which
  was the cutover on 2026-09-15. A browser that visited before that stored
  the modules under the host's old default — thirty days, no revalidation —
  and will go on running them from disk into mid-October **without ever asking
  the server**, so no amount of deploying reaches it and an ordinary reload
  does not either. It needs a hard reload, or a private window to prove it.
  This is not hypothetical: it is what "the site only shows one board" turned
  out to be, and the tell is that a brand-new file (a board added since) loads
  correctly while everything older is a month stale — which reads exactly like
  a broken deploy, and is not one.
- **Reboot tokens and the priority antenna** are placed at setup, so they are
  course-level data like flags, and the modern engine will want them on the
  `PRCourse` document. Not before M4.

---

## From editor/README.md

### The board art is the game's

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

### Markup mode

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

### Why the board library exists

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

### Validator checks that were removed

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
- **The corner rule is the book's, and only the book's.** A flag in a corner
  formed by two or more walls warns (`course.flagWallCorner`), anywhere on the
  floor. A board's geometric corner is floor like any other: the outer-corner
  refusal that used to sit beside it was ours and is gone, with the other
  invented checks (2026-09-23: a flag under a wall device, two pushers or two
  jets on a square, a press over a pit, a ramp's gradient, the flag-location
  count; a disconnected course and a walled-in bay now warn instead of
  refusing). A course laying an `unverified` board warns too.
- **Site notes round-trip**, and a `has` that is not a list is reported rather
  than crashing the first edit.

`convert-boards.js` is gone, with the old board file it converted from: the
proof that the JSON meant what the old data meant was kept green until the
old data was deleted, and the JSON is the source now.

`--emit <dir>` on `render-snapshot.js` dumps every board in both modes as SVG,
for when a snapshot changes and you need to see what changed.
