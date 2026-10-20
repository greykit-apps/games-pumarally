# PumaRally

**Program five registers, hand control to the factory floor, and hope you guessed right.** A race of programmable robots across a factory floor full of conveyor belts, gears, lasers and pits, for one to eight players.

**Play:** [greykit.com/games/pumarally](https://greykit.com/games/pumarally/)

![Turn 4 of a six-robot race: a laser fires up the left edge and each robot's option cards sit in the panel](screenshots/classic-laser.png)

## How it plays

Each turn you are dealt a hand of movement cards and put five of them into your registers, in the order you want them to happen. Every robot plays register 1, then the floor moves: belts carry, gears turn, pushers shove, lasers fire. Then register 2, and so on to 5. Anything driven or carried off the edge or into a pit is out for the rest of the turn. Touch the flags in order; the first robot to reach the last flag wins. You only ever see your own cards, so the plan you lock in is a guess about where everyone else will be.

A race is one board, several boards laid together, or a course made in the **Course builder**. Up to eight seats take any mix of humans and bots; humans share one screen, with a curtain hiding each hand. **Classic** rules have limited lives, option cards and powering down to repair. **Modern** rules have unlimited reboots, your own deck, damage cards that clog it, and energy to spend on upgrades.

![Programming registers under the Classic rules: four cards placed, three left in hand](screenshots/classic-program.png)

## Keys

| Key | |
|---|---|
| `1`–`9` | place that card in the next open register |
| `Backspace` | take the last card back |
| `Enter` | run your registers, or lift the hot-seat curtain |
| `W` `A` `S` `D` | pan the board |
| `Z` / `C` | zoom in / out |
| `M` | sound on / off |

Cards can also be clicked or dragged onto a register.

## Saves

Kept in the browser's `localStorage` under keys starting `pumarally_`, courses included. **Settings → Forget everything** clears them.

## Credits

By Matthew "Shan" Romanek, with Claude. Built by [greykit.com](https://greykit.com/).

Made for my own play. Nothing here is offered: no support, no updates, no licence.
