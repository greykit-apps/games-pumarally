/* A new game, as plain JSON.
 *
 * Everything in here is the save. There is no course object, no UI object and
 * no closure holding anything the machine needs: the course is a document
 * and is assembled on demand, the RNG is one integer, and a player is a
 * record. `seats` is any mix of humans and bots, one to eight.
 */
import { CLASSIC_DECK, MODERN_DECK, MODERN_DAMAGE, MODERN_DAMAGE_FIRST, REGISTERS, START_ENERGY, UPGRADE_START } from "./cards.js";
import { shuffle } from "./rng.js";
import LIVERY_DATA from "../data/liveries.js";
import OPTIONS_DATA from "../data/options.js";
import UPGRADES_DATA from "../data/upgrades.js";
import { newHeld } from "./options.js";

export const LIVERIES = LIVERY_DATA.liveries;
export const SAVE_VERSION = 1;
export const MAX_TURNS = 200;
const START_LIVES = 3;

/* THE 2016 SUBSTITUTES, declared rather than silent. Each is a place the
 * engine departs from the book because the book's thing is not in the
 * photographs, and each has a scenario on it so that closing the gap means
 * changing the line and being told about everything that assumed it.
 *
 * - The reboot point, ON A COURSE THAT PLACES NO REBOOT TOKENS. The book puts
 *   a Reboot Token on every board at setup (pp.15, 20, 30) and re-enters the
 *   robot on the token of the board it fell from, shoving an occupant along
 *   the token's arrow; a robot that fell off the docking bay re-enters at its
 *   archive there. A course with tokens (`reboots` on the document, or the
 *   token element on a flattened floor) plays exactly that. A course with
 *   none re-enters the robot at its ARCHIVE -- its last checkpoint, or its
 *   bay -- and an occupant is shoved along the facing it archived with.
 * - The Priority Token starts with "the youngest player" (p.3). Seat 1 here.
 *   (The damage deck was a third substitute, forty SPAM, until the Haywire
 *   faces were photographed; it is the printed forty now.) */
export const MODERN_REBOOT_POINT = "archive";
export const MODERN_FIRST_PRIORITY = "seat 1";

/** Lives scale with the size of the race: one more at five seats, one more at five boards. */
export function livesFor(seats, boards) {
  return START_LIVES + (seats >= 5 ? 1 : 0) + (boards >= 5 ? 1 : 0);
}

/**
 * @param {object} opts
 *   seed      integer
 *   course    a PRCourse document (validated by the caller)
 *   seats     [{ seat: "human"|"bot", skill?: 0|1|2, livery?: index }] -- 1 to 8
 *   house     { bumpers, flagTouch, humanPrivilege, startOptions }
 *   ruleset   "classic" (default) or "modern"
 */
export function newGame(opts) {
  const seats = opts.seats && opts.seats.length ? opts.seats : [{ seat: "human" }, { seat: "bot" }];
  if (seats.length < 1 || seats.length > LIVERIES.length) throw new Error("a race seats one to " + LIVERIES.length);
  const boards = (opts.course.stamps || []).filter(s => s.role === "board").length;
  const modern = opts.ruleset === "modern";
  const st = {
    v: SAVE_VERSION,
    seed: opts.seed | 0,
    rng: opts.seed | 0,
    ruleset: modern ? "modern" : "classic",
    course: JSON.parse(JSON.stringify(opts.course)),
    house: {
      bumpers: !!(opts.house && opts.house.bumpers),
      flagTouch: !!(opts.house && opts.house.flagTouch),
      humanPrivilege: !!(opts.house && opts.house.humanPrivilege),
      /* option cards dealt to everyone at the start: a house rule, because the
       * printed route -- a two-wrench site, instead of two points of repair --
       * hands one out in about one game in fifty. Classic only: the 2016
       * game has upgrades instead. */
      startOptions: modern ? 0 : Math.max(0, Math.min(3, (opts.house && opts.house.startOptions) | 0))
    },
    turn: 1, register: 0,
    phase: "draft", step: "livery",
    draft: { order: [], at: 0, cards: {} },
    players: [],
    deck: [], discard: [],
    optionDeck: [], optionDiscard: [],
    /* the 2016 table: the Priority Token's seat, the damage deck and the
     * upgrade deck, each with its discard */
    priority: 0, priorityHeld: false,
    damageDeck: [], damageDiscard: [],
    upgradeDeck: [], upgradeDiscard: [],
    /* answers to card and board questions, keyed by turn, register, hook,
     * card and player; cleared at the end of every turn */
    answers: {},
    elem: 0,
    laser: null,
    log: [],
    events: [],
    waiting: null,
    over: false, winner: null, unfinished: false,
    maxTurns: opts.maxTurns || MAX_TURNS
  };

  /* liveries: a seat that asked for one gets it if nobody earlier did; the
   * rest fill in order, so no two robots share a colour before anyone picks */
  const taken = new Set();
  seats.forEach((s, i) => {
    let liv = Number.isInteger(s.livery) && !taken.has(s.livery) ? s.livery : -1;
    if (liv < 0) for (let k = 0; k < LIVERIES.length; k++) if (!taken.has(k)) { liv = k; break; }
    taken.add(liv);
    st.players.push({
      id: i,
      seat: s.seat === "bot" ? "bot" : "human",
      skill: s.skill === undefined ? 1 : s.skill,
      name: LIVERIES[liv].name,
      livery: liv,
      liveryPicked: false,
      placed: false,
      c: -1, r: -1, face: 0,
      damage: 0,
      lives: livesFor(seats.length, boards),
      flags: 0,
      archive: null,
      hand: [],
      registers: new Array(REGISTERS).fill(null),
      ready: false,
      poweredDown: false,
      announceDown: false,
      stayAsked: false,
      options: [],
      mustDrop: false,
      /* the AMIGO option cards' baggage: a program card on the Command in
       * Reserve, one on the Flywheel, an Emergency Switch thrown this turn, a
       * Remote Control running this robot, and registers Fire Control locked
       * (the turn each lock was set: it holds through that turn's cleanup) */
      reserve: null, flywheel: null, aborted: false, controlledBy: null, locks: new Array(REGISTERS).fill(null),
      reserveAsked: false, revealed: -1,
      alive: true,
      virtual: false,      // classic: re-entered onto an occupied square, and interacting with no robot until alone
      out: false,
      trail: [],
      /* the 2016 robot: its own deck and discard, the Energy track, the
       * upgrades it owns (`shelf`, uninstalled) and has fitted (`installed`),
       * and whether it is off the board waiting to reboot */
      energy: modern ? START_ENERGY : 0,
      deck: [], pile: [],
      shelf: [], installed: [],
      rebooting: false, fellFrom: -1,                 // the stamp it fell from: its Reboot Token is that board's
      upgradeDone: false, bought: false, fitted: false,
      /* Crab Legs' second card per register, Memory Cards' parked cards,
       * Self-Diagnostics' cards taken out of the game, and what this card
       * pushed and moved for the hooks that ask afterwards */
      crab: new Array(REGISTERS).fill(null), parked: [], removed: [],
      pushed: [], lastMove: null, hoverSteps: 0, drilled: null, newCheckpoint: false, stackBack: 0,
      /* Haywire: one face-down card per register, the register whose card
       * charged the main laser, and an upgrade installed free for the round */
      haywire: new Array(REGISTERS).fill(null), laserBonus: -1, hwInstalled: null
    });
  });

  if (modern) {
    /* every robot its own shuffled twenty; the table's forty damage cards
     * and forty upgrades, three of the latter dealt face down to each */
    for (const p of st.players) {
      for (let i = 0; i < MODERN_DECK.length; i++) p.deck.push(i);
      shuffle(st, p.deck);
    }
    for (let i = 0; i < MODERN_DAMAGE.length; i++) st.damageDeck.push(MODERN_DAMAGE_FIRST + i);
    shuffle(st, st.damageDeck);
    st.upgradeDeck = UPGRADES_DATA.cards.map(c => c.id);
    shuffle(st, st.upgradeDeck);
    for (let q = 0; q < UPGRADE_START; q++) for (const p of st.players) { const id = st.upgradeDeck.pop(); if (id !== undefined) p.shelf.push(id); }
  } else {
    for (let i = 0; i < CLASSIC_DECK.length; i++) st.deck.push(i);
    shuffle(st, st.deck);
  }
  st.optionDeck = OPTIONS_DATA.cards.map(c => c.id);
  shuffle(st, st.optionDeck);
  for (let q = 0; q < st.house.startOptions; q++) {
    for (const p of st.players) {
      const id = st.optionDeck.pop();
      if (id !== undefined) p.options.push(newHeld(id));
    }
  }
  return st;
}

export function isHuman(p) { return p.seat === "human"; }
export function alive(st) { return st.players.filter(p => p.alive); }
/** Still in the race: on the board, or off it with lives left (or, in 2016, waiting to reboot). */
export function racing(st) { return st.players.filter(p => !p.out); }
/** The 2016 seat order from the Priority Token round the table. */
export function priorityOrder(st) {
  const n = st.players.length, out = [];
  for (let k = 0; k < n; k++) out.push(st.players[(st.priority + k) % n]);
  return out;
}

export function log(st, msg) {
  st.log.push({ turn: st.turn, reg: st.register, msg });
  if (st.log.length > 400) st.log.shift();
  st.events.push({ type: "log", msg });
}

/**
 * A save written by an earlier build may lack fields a later one reads.
 * Fill them with their defaults, once, on load. Every field added to a
 * player after the first release is listed here with the value a new game
 * gives it, so a resumed race is the same shape as a fresh one.
 */
export function normaliseSave(st) {
  const P = { energy: 0, deck: [], pile: [], shelf: [], installed: [], rebooting: false, upgradeDone: false, bought: false, fitted: false,
    parked: [], removed: [], pushed: [], lastMove: null, hoverSteps: 0, drilled: null, newCheckpoint: false, stackBack: 0 };
  for (const p of st.players || []) {
    for (const k of Object.keys(P)) if (p[k] === undefined) p[k] = Array.isArray(P[k]) ? [] : P[k];
    if (!p.crab) p.crab = new Array(REGISTERS).fill(null);
    if (!p.haywire) p.haywire = new Array(REGISTERS).fill(null);
    if (p.laserBonus === undefined) p.laserBonus = -1;
    if (p.hwInstalled === undefined) p.hwInstalled = null;
    if (p.reserve === undefined) p.reserve = null;
    if (p.flywheel === undefined) p.flywheel = null;
    if (p.aborted === undefined) p.aborted = false;
    if (p.controlledBy === undefined) p.controlledBy = null;
    if (!p.locks) p.locks = new Array(REGISTERS).fill(null);
    if (p.reserveAsked === undefined) p.reserveAsked = false;
    if (p.fellFrom === undefined) p.fellFrom = -1;
    if (p.virtual === undefined) p.virtual = false;
    if (p.revealed === undefined) p.revealed = -1;
  }
  const S = { priority: 0, priorityHeld: false, damageDeck: [], damageDiscard: [], upgradeDeck: [], upgradeDiscard: [], laserAfter: null, act: null };
  for (const k of Object.keys(S)) if (st[k] === undefined) st[k] = Array.isArray(S[k]) ? [] : S[k];
  if (!st.ruleset) st.ruleset = "classic";
  return st;
}
