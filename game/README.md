# The game, rebuilt on the workshop's foundation

This directory is the rebuild described in `PLAN.md`. It is ES modules, no
bundler, no dependencies, and it reads the boards and courses the workshop
writes under `editor/data/`. Nothing in here touches `pumarally.js`, which is
the old game and goes when this one is playable.

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
| `rebootFacing` | a rebooting racer re-entering (modern) | a direction |
| `upgrade` | each racer, at the upgrade phase (modern) | `{ buy: bool, install: id or null }` |
| `shutdown` | each racer, at programming (modern) | `true` to shut down for the round |

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
               lives, flags, archive, hand, registers, ... } ],
  deck, discard,                classic: one shared pile of 84
  options, ...                  the option-card piles
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
bots ported, and the bumpers and flag-touch house rules. Not yet: option cards
(the two-wrench site repairs two until they are), oil and portals, and
anything modern.

## Open, and recorded here rather than solved in passing

- **Deploy caching.** The host serves `.js` for thirty days without
  revalidation, and this is thirty modules. The editor has the same exposure
  today. A hashed directory per release, or an import map stamped into
  `index.html`, before the first public deploy of this game.
- **Reboot tokens and the priority antenna** are placed at setup, so they are
  course-level data like flags, and the modern engine will want them on the
  `PRCourse` document. Not before M4.
