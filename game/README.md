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
| `program` | each racer with an open register, at programming | the card indices for the open registers, in order |
| `powerDown` | each racer, after programming (classic) | `true` to announce a power down |
| `stayDown` | a powered-down racer, at cleanup (classic) | `true` to stay down |
| `siteChoice` | a racer ending the turn on a two-wrench site (classic) | `"repair"` or `"card"` |
| `cardChoice` | the holder of an option or upgrade card whose text says *may* | an index into `options` |
| `rebootFacing` | a rebooting racer re-entering in register 1 (modern) | a direction, 0 to 3 |
| `upgrade` | each racer, at the upgrade phase (modern) | `{ buy: bool, install: id or null, uninstall: [ids] }`; `options` lists each part; a draw or an uninstall alone is asked again so the new card can be fitted, an install or an empty answer is Done |
| `shutdown` | each racer on the floor, after programming and before the first reveal (modern) | `true` to shut down for the round |

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

## What is lifted from the old game, verbatim

`data/cards.json`, `data/options.json`, `data/upgrades.json`,
`data/liveries.json`. Card text, deck compositions and prices are
transcriptions of the physical cards and are copied, not retyped. The gaps
travel with them: sixteen option cards of twenty-six, forty upgrades of which
eleven had effects, a damage deck with no Haywire.

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

Three substitutes, declared in `engine/state.js` and each with a scenario:
a rebooting robot re-enters at its archive (the book's Reboot Tokens are
placed per course and none is transcribed); the Priority Token starts with
seat 1 (the book says the youngest player); the damage deck is all SPAM (the
Haywire faces are not photographed). Not built: the temporary upgrades'
effects, Haywire, currents (no shipped board prints one, and the scenario
says so), the Cry Havoc course's three-card reboot.

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

Option cards are built under the classic rules: the sixteen transcribed
cards, each a data row bound to one of ten hooks in `engine/options.js`,
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

M1, the classic engine headless, is built: draft, deal, programming, the five
registers in the printed order, damage and locking, destruction and return,
power down as three moments, repair at cleanup, checkpoints and the win, the
bots ported, and the bumpers and flag-touch house rules. Not yet: anything modern.

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
