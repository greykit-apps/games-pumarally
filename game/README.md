# The game

The rules engine, the bots, the headless simulation and the screen. ES
modules, no bundler, no dependencies. It reads the boards and courses the
workshop writes under `editor/data/` and assembles them through the
workshop's own library (`editor/lib/course.js`).

```
game/index.html       the game page (the repo root's index.html is the same game)
game/engine/          pure rules over plain-JSON state
  machine.js          step(), the request kinds, the floor order tables
  rules.js            movement, pushing and every floor pass
  state.js            new-game state, house rules, declared substitutes
  options.js          classic option cards: behaviour rows and hooks
  upgrades.js         2016 upgrade cards: behaviour rows
  haywire.js          2016 Haywire damage cards
  bots.js             bot answers to every request kind
  quick.js            quick games and quick courses
game/ui/              the screen, drawn from the pending request and nothing else
game/data/            card tables transcribed from the physical cards
game/tools/           check-all.js, sim.js, replay-dump.js, the scenario tests
```

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
No second predicate exists anywhere, so a control can never be drawn live
while answering nothing.

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
The events are the record, and the screen animates from them.

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

## The floor order

The board's turn is a table, not a chain of calls: `CLASSIC_ORDER` and
`MODERN_ORDER` in `engine/machine.js` list each pass by name in the order the
book resolves it, and each name is a function in `engine/rules.js`.
`PASS_LABELS` beside them is what the screen captions each pass as while it
replays. A pass finds its squares by **property** (`belt`, `gear`, `pit`,
`laser`, `repair`, `energy`, ...), read through `propAt()`, never by the
character a board uses to spell the element.

Where the two editions resolve the same printed tile differently, the
difference is a field on the ruleset in `editor/rulesets/classic.js` and
`modern.js` (`oilSlideAfter`, `portalBlockedBy`, ...) rather than a branch in
the engine.

## Quick games

`engine/quick.js` turns *N boards, F flags* into an ordinary `PRCourse`
document, which is what the save carries, so a resumed game plays the layout
it started on.

- **One board**: any shipped board that marks at least three flag locations,
  at a random facing over the docking bay, with F flags drawn from its marks.
- **Several boards**: drawn from the verified 12×12 boards, stacked as the box
  stacks them (docking bay at the bottom, boards up the column, extras to
  either side, never beyond three by three), then one route of flags through
  them: every board gets at least one, extras go one per board in turn, and
  consecutive flags keep to the classic book's twelve squares where boards
  touch.

A race draws only the markings its edition reads: the renderer's `sites` and
`flagspots` options (`editor/render/svg.js`) hide the other book's markings
and the flag *locations*, since the course has already placed the flags.

## Declared substitutes

Where the book's material is missing or silent, the engine decides, and says
so in a named constant with a scenario on it, so changing the decision flags
everything that assumed it:

- `MODERN_REBOOT_POINT` (`engine/state.js`): a 2016 course that places no
  Reboot Tokens re-enters a rebooting robot at its archive.
- `MODERN_FIRST_PRIORITY`: the Priority Token starts with seat 1 (the book
  says the youngest player).
- Fire: a Crash and Burn flame jet and a Thrills and Spills flamer stand in
  for each other, each on its own book's timing (`playsIn` in
  `editor/rulesets/devices.js`).

Individual card readings are stated on the card's row in `engine/options.js`
and `engine/upgrades.js`.

## Extending the rules

Everything goes through data rows and named hooks; nothing new gets a branch
in the register loop.

**A floor element or device.** Add it to the format first (see
`editor/README.md`: a row in `editor/rulesets/elements.js` or `devices.js`,
its art, its validator coverage). Then, in the engine, either give it a
property an existing pass already reads, or write a pass in `engine/rules.js`
and add it to `CLASSIC_ORDER` and/or `MODERN_ORDER` (and `PASS_LABELS`) at the
point the book resolves it.

**An option card or upgrade.** Transcribe the card into `data/options.js` or
`data/upgrades.js`, then add its behaviour to the `BEHAVIOUR` table in
`engine/options.js` or `engine/upgrades.js`, bound to one of the `HOOKS`.
Hooks mutate the context they are given, never the state; a *you may* card
calls `ctx.pick()` and the step that fired it asks through the request door.
A card that needs a moment no hook covers gets a new hook. `check-all`
asserts every card names a real hook and every hook has a card.

**A new question for the player.** Add a request kind in `engine/machine.js`,
an answer for it in `engine/bots.js` (the sims fail on a request a bot cannot
answer), and a control in `ui/`. Add the row to the table above.

**Tests.** Rule tests live in `tools/scenarios/<area>.js` as
`[name, fn]` pairs built on `tools/scenarios/harness.js` (`board`, `courseOn`,
`game`, `give`, `runRegister`, `drive`). Every name must also appear in
`tools/scenarios.js` marked `ported`, and a new file must be imported in
`tools/check-all.js`; the runner holds the two lists to each other.

## Debug dumps, and replaying one

The **Debug** button in the top bar saves the race as a file,
`pumarally-debug-<seed>-t<turn>.json`. It carries two things: the **trace** --
the game's inputs (seed, course, seats, house rules, ruleset) and every answer
given through the request door, bots' included, plus every log line with the
turn and register it happened in -- and the **state** as it stands. The engine
is deterministic, so the inputs plus the answers *are* the game; the state is
there to compare against.

    node game/tools/replay-dump.js pumarally-debug-<seed>-t<turn>.json [--log] [--until N]

re-runs the trace headlessly and checks it lands on the dumped state: turn,
phase, every robot's square, facing, damage and lives, and the RNG. A dump
whose replay does not land on its own state is the interesting kind -- the
browser took a branch the engine no longer takes, and the answer at which the
replay first diverges is where to look. `--log` prints the race as it goes;
`--until N` stops after N answers to inspect the state part-way.

The trace is kept in `localStorage` beside the save (`pumarally_trace_v1`) and
written on every step, so a dump taken after something has gone wrong still
holds the whole race. A race started before traces were kept dumps its state
alone and says so.

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
