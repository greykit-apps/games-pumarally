# The game, rebuilt on the workshop's foundation

This directory is the rebuild described in `PLAN.md`. It is ES modules, no
bundler, no dependencies, and it reads the boards and courses the workshop
writes under `editor/data/`. The old single-file game it replaces is gone;
the tag `classic-monolith` holds it.

**This file is the contract, written before the code.** Every handler in
`engine/` is held to it, and the shape below is what the UI, the bots and the
simulations all see. If the code and this file disagree, the file is the
one that was reviewed.

## One function

```
step(state, answer?) -> { state, events, waiting }
```

- `state` is plain JSON and is the whole save. No `UI` object, no globals, no
  DOM, no timers, no course object hiding in a closure: the course is
  assembled from `state.course` (a `PRCourse` document) every time it is
  needed, through `editor/lib/course.js#assemble`, exactly as the workshop
  does.
- `events` is an ordered list of what happened during this step, for the
  screen to replay at its own pace, or to ignore. The engine never knows
  whether anything is animating.
- `waiting` is `null`, or **one** request:

```
{ player, kind, options }
```

The engine advances on its own until it needs an answer, then returns with
`waiting` set. The caller supplies `answer` on the next call. **There is no
other way in.** Whether a player may press something is exactly whether
`waiting.player` is them and `waiting.kind` is the thing the control does.
No second predicate exists anywhere, and this is what kills the class of bug
that stopped the old game three times in one day: a control drawn live that
answered nothing.

A bot is a function from a request to an answer. A human is the same function
with a person inside it. A simulation seats any mix of the two and drives
every seat through the same door, so the human path is tested by every sim,
not by none of them.

### Request kinds

| kind | asked of | answer |
|---|---|---|
| `livery` | each human seat, in seat order, before the draft | a livery index not already taken |
| `bay` | each racer in draft order | a free docking-bay number |
| `program` | each racer with an open register, at programming | the card indices for the open registers, in order; with Crab Legs fitted (`crab` on the request) an entry may be a pair `[rotate, move1]` |
| `powerDown` | each racer, after programming (classic) | `true` to announce a power down |
| `stayDown` | a powered-down racer, at cleanup (classic) | `true` to stay down |
| `siteChoice` | a racer ending the turn on a two-wrench site (classic) | `"repair"` or `"card"` |
| `cardChoice` | the holder of an option or upgrade card whose text says *may* | an index into `options` |
| `rebootFacing` | a rebooting racer re-entering in register 1 (modern) | a direction, 0 to 3 |
| `upgrade` | each racer, at the upgrade phase (modern) | `{ buy: bool, install: id or null, uninstall: [ids] }`; `options` lists each part; a draw or an uninstall alone is asked again so the new card can be fitted, an install or an empty answer is Done |
| `shutdown` | each racer on the floor, after programming and before the first reveal (modern) | `true` to shut down for the round |
| `useTemp` | a racer holding a usable temporary upgrade, at a moment (`dealt`: before programming; `before` and `after` its own card) | `null` for none, or one of the listed uses `{ id, ... }`; the use happens as the answer lands, and the moment asks again until none |
| `stack` | a racer with cards to choose from the hand: Memory Swap's three back on the deck, Memory Cards' parking | hand indices in order, exactly `count` or any number when `count` is null |

A request always carries `options`: the legal answers, enumerated. An answer
not in `options` is refused with the same request returned again. A bot that
cannot answer a request is a failure the sims report by name.

### Events

`moved`, `pushed`, `turned`, `conveyed`, `shoved`, `shot`, `damaged`,
`repaired`, `fell`, `destroyed`, `respawned`, `rebooted`, `flag`, `dealt`,
`programmed`, `revealed`, `register`, `turnStart`, `turnEnd`, `poweredDown`,
`won`, `log`. Each names the player it concerns and the squares it involves.
The old game diffed a board signature to decide whether to animate; here the
events are the record and the screen draws from them.

### State

```
{
  v, seed, rng,                 the save version and the whole RNG state
  ruleset: "classic" | "modern",
  course: <PRCourse document>,  never a built grid
  house: { ... },               house rules, in the save so a replay holds
  turn, register, phase, step,  where the machine is
  players: [ { id, seat: "human" | "bot", skill, livery, c, r, face, damage,
               lives, flags, archive, hand, registers,
               energy, deck, pile, shelf, installed, rebooting, ... } ],
  deck, discard,                classic: one shared pile of 84
  options, ...                  the option-card piles
  priority, damageDeck, damageDiscard, upgradeDeck, upgradeDiscard
                                the 2016 table: the Priority Token's seat and the two shared decks
  log: [ ... ],                 the last few hundred lines, for the panel
  winner, over
}
```

Everything the screen needs beyond this is derived, on every render, from
`state` and the assembled course. Nothing derived is stored.

## Rulesets are data

`editor/rulesets/classic.js` and `modern.js` already carry the activation
order as a table and the resolution flags as fields. The engine walks
`ruleset.order` and dispatches each step to a handler keyed by the square's
**properties** (`belt`, `gear`, `pit`, `laser`, `repair`, `energy`), read
through `propAt()`, which is how the workshop's inspector already answers
"what would a robot standing here meet". Adding an element is a handler and a
row, never an edit to the register loop.

## Quick games, and what a race draws on a board

A **quick game** is any shipped board with three marked flag locations
(`editor/rulesets/sites.js`: the board says where a flag *may* go). The setup
screen offers every such board; pressing Start draws the race
(`game/engine/quick.js`): the board at a random facing over the docking bay,
and three flags drawn at random, in a random order, from its marks. The draw
is an ordinary PRCourse document and it is what the save carries, so a resumed
game plays the layout it started on. There is no course file for a quick
game; the shipped course files are the multi-board tracks. The simulator
plays a seeded quick game on every board as well as every track.

A race draws only the markings its edition reads: under the classic rules a
square shows its wrench and not its battery, under the 2016 rules its
battery and not its wrench, and neither draws the flag *locations*, since
the course has already said where the flags *are*. That is the renderer's
`sites` and `flagspots` options (`editor/render/svg.js`); the workshop passes
neither and shows everything printed.

## What is lifted from the old game, verbatim

`data/cards.json`, `data/options.json`, `data/upgrades.json`,
`data/liveries.json`. Card text, deck compositions and prices are
transcriptions of the physical cards and are copied, not retyped. The gaps
travelled with them: sixteen option cards of twenty-six, forty upgrades of
which eleven had effects, a damage deck with no Haywire. All three gaps are
closed now from photographs: the eleven AMIGO option cards (with their German
text alongside the English), the forty upgrade effects, and Haywire.

## Sequence

`PLAN.md` M1 onward. Classic first: engine headless, then the UI, then
cutover, then modern. `tools/scenarios.js` carries every rule the old suite
asserted, as pending until the new engine passes it, so the count that
matters is visible from the first commit.

## Checks

```
node game/tools/check-all.js      # the tables, the rule tests, the scenario ledger
node game/tools/sim.js 20         # twenty mixed games on every shipped course
```

`check-all` prints the pending scenario count on every run, so the number
lives in the output and never only in a README. `sim` seats two bots and two
randomly-answered "humans" on every course and fails if any game crashes, a
conservation law breaks, a request goes unanswerable, or no game is ever won.
CI runs both after the editor's checks.

## Status

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
Forty-two 2016 scenarios pass by name. Every course is simulated under every
ruleset its squares are readable by (`rulesetsFor`), with the table's
conservation laws armed: each robot's twenty, the forty damage cards and the
forty upgrades counted apart.

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

## Open, and recorded here rather than solved in passing

- **Deploy caching.** The host serves `.js` for thirty days without
  revalidation, and this is thirty modules. The repo root's `.htaccess` sets
  every script and data file to revalidate like the page. Not yet verified
  against the live host: after the first deploy, `curl -I` a module under
  `game/` and check the `Cache-Control` header. If the host ignores it, the
  fallback is a hashed directory per release.
- **Reboot tokens and the priority antenna** are placed at setup, so they are
  course-level data like flags, and the modern engine will want them on the
  `PRCourse` document. Not before M4.
