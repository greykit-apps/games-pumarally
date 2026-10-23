/* Lifted from the old game verbatim. A module rather than JSON so the browser and Node load it the same way. */
export default {
  "format": "PRCards",
  "version": 1,
  "kind": "decks",
  "kinds": {
    "uturn": {
      "label": "U-Turn",
      "turn": 2
    },
    "left": {
      "label": "Rotate L",
      "turn": -1
    },
    "right": {
      "label": "Rotate R",
      "turn": 1
    },
    "back": {
      "label": "Back Up",
      "move": -1
    },
    "move1": {
      "label": "Move 1",
      "move": 1
    },
    "move2": {
      "label": "Move 2",
      "move": 2
    },
    "move3": {
      "label": "Move 3",
      "move": 3
    },
    "powerUp": {
      "label": "Power Up"
    },
    "again": {
      "label": "Again"
    },
    "spam": {
      "label": "SPAM",
      "damage": true,
      "note": "Damage. Programme it and it is thrown away, and the top card of your deck is played instead."
    },
    "haywire": {
      "label": "Haywire",
      "damage": true,
      "note": "Damage. It slides face down under the register you took it in; next round that register is not programmed, and when it comes up the card is revealed and its text resolved, taking precedence over the rulebook."
    }
  },
  "classic": {
    "source": "The 84 program cards, generated from the printed priority ranges. Priorities are unique across the deck.",
    "ranges": [
      [
        "uturn",
        10,
        60,
        10
      ],
      [
        "left",
        70,
        410,
        20
      ],
      [
        "right",
        80,
        420,
        20
      ],
      [
        "back",
        430,
        480,
        10
      ],
      [
        "move1",
        490,
        660,
        10
      ],
      [
        "move2",
        670,
        780,
        10
      ],
      [
        "move3",
        790,
        840,
        10
      ]
    ],
    "counts": {
      "uturn": 6,
      "left": 18,
      "right": 18,
      "back": 6,
      "move1": 18,
      "move2": 12,
      "move3": 6
    },
    "size": 84,
    "handSize": 9,
    "registers": 5,
    "maxDamage": 10,
    "startLives": 3
  },
  "modern": {
    "source": "A robot's own deck of twenty, counted off a photograph of one laid out; the damage deck of forty counted off the deck laid out -- twenty-three SPAM and seventeen Haywire, every Haywire face once -- with the faces read off the same photographs.",
    "deckCounts": {
      "move1": 4,
      "move2": 3,
      "move3": 1,
      "back": 1,
      "left": 4,
      "right": 4,
      "uturn": 1,
      "powerUp": 1,
      "again": 1
    },
    "deckSize": 20,
    "damageCounts": {
      "spam": 23,
      "haywire": 17
    },
    "damageSize": 40,
    "haywire": [
      { "id": "hwMove2Left", "text": "Move 2, rotate left." },
      { "id": "hwBack3", "text": "Move back 3." },
      { "id": "hwMove1Token", "text": "Move 1, then take the Priority Token. Do not move the Priority Token at the end of this round." },
      { "id": "hwMove5Wall", "text": "Move 5. If you hit a wall this register, take 1 damage." },
      { "id": "hwMove3Uturn", "text": "Move 3, U-turn." },
      { "id": "hwMove1RightMove1", "text": "Move 1, rotate right, move 1." },
      { "id": "hwMove1LeftMove1", "text": "Move 1, rotate left, move 1." },
      { "id": "hwMove2Right", "text": "Move 2, rotate right." },
      { "id": "hwAnyFacingMove1", "text": "Rotate to any facing. Move 1." },
      { "id": "hwPayEnergy", "text": "Pay 0-8 Energy, then move 2 spaces for each Energy you paid." },
      { "id": "hwInstall", "text": "Install a permanent upgrade from your collection of uninstalled upgrades. At end of round, place that card into the upgrade discard pile." },
      { "id": "hwBack1Remove", "text": "Move back 1. Remove a card in your discard pile from the game." },
      { "id": "hwMove1Laser", "text": "Move 1. Your robot's main laser deals 1 additional damage this register." },
      { "id": "hwRotateEither", "text": "Rotate right or rotate left." },
      { "id": "hwDrawTwo", "text": "Draw and reveal the top 2 cards of your programming deck. Resolve both in the order of your choosing." },
      { "id": "hwSidestep2", "text": "Move 2 left or right, without changing facing." },
      { "id": "hwBack1Uturn", "text": "Move back 1. U-turn." }
    ],
    "handSize": 9,
    "registers": 5,
    "startEnergy": 3,
    "maxEnergy": 10,
    "upgradeStart": 3,
    "upgradeDrawCost": 1,
    "installLimit": {
      "permanent": 3,
      "temporary": 3
    },
    "rebootPoint": "archive"
  }
};
