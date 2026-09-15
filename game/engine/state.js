/* A new game, as plain JSON.
 *
 * Everything in here is the save. There is no course object, no UI object and
 * no closure holding anything the machine needs: the course is a document
 * and is assembled on demand, the RNG is one integer, and a player is a
 * record. `seats` is any mix of humans and bots, one to eight.
 */
import { CLASSIC_DECK, REGISTERS } from "./cards.js";
import { shuffle } from "./rng.js";
import LIVERY_DATA from "../data/liveries.js";
import OPTIONS_DATA from "../data/options.js";

export const LIVERIES = LIVERY_DATA.liveries;
export const SAVE_VERSION = 1;
export const MAX_TURNS = 200;
const START_LIVES = 3;

/** Lives scale with the size of the race: one more at five seats, one more at five boards. */
export function livesFor(seats, boards) {
  return START_LIVES + (seats >= 5 ? 1 : 0) + (boards >= 5 ? 1 : 0);
}

/**
 * @param {object} opts
 *   seed      integer
 *   course    a PRCourse document (validated by the caller)
 *   seats     [{ seat: "human"|"bot", skill?: 0|1|2, livery?: index }] -- 1 to 8
 *   house     { bumpers, flagTouch, humanPrivilege }
 */
export function newGame(opts) {
  const seats = opts.seats && opts.seats.length ? opts.seats : [{ seat: "human" }, { seat: "bot" }];
  if (seats.length < 1 || seats.length > LIVERIES.length) throw new Error("a race seats one to " + LIVERIES.length);
  const boards = (opts.course.stamps || []).filter(s => s.role === "board").length;
  const st = {
    v: SAVE_VERSION,
    seed: opts.seed | 0,
    rng: opts.seed | 0,
    ruleset: "classic",
    course: JSON.parse(JSON.stringify(opts.course)),
    house: {
      bumpers: !!(opts.house && opts.house.bumpers),
      flagTouch: !!(opts.house && opts.house.flagTouch),
      humanPrivilege: !!(opts.house && opts.house.humanPrivilege),
      /* option cards dealt to everyone at the start: a house rule, because the
       * printed route -- a two-wrench site, instead of two points of repair --
       * hands one out in about one game in fifty */
      startOptions: Math.max(0, Math.min(3, (opts.house && opts.house.startOptions) | 0))
    },
    turn: 1, register: 0,
    phase: "draft", step: "livery",
    draft: { order: [], at: 0, cards: {} },
    players: [],
    deck: [], discard: [],
    optionDeck: [], optionDiscard: [],
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
      alive: true,
      out: false,
      trail: []
    });
  });

  for (let i = 0; i < CLASSIC_DECK.length; i++) st.deck.push(i);
  shuffle(st, st.deck);
  st.optionDeck = OPTIONS_DATA.cards.map(c => c.id);
  shuffle(st, st.optionDeck);
  for (let q = 0; q < st.house.startOptions; q++) {
    for (const p of st.players) {
      const id = st.optionDeck.pop();
      if (id !== undefined) p.options.push({ id, st: {} });
    }
  }
  return st;
}

export function isHuman(p) { return p.seat === "human"; }
export function alive(st) { return st.players.filter(p => p.alive); }
/** Still in the race: on the board, or off it with lives left. */
export function racing(st) { return st.players.filter(p => !p.out); }

export function log(st, msg) {
  st.log.push({ turn: st.turn, reg: st.register, msg });
  if (st.log.length > 400) st.log.shift();
  st.events.push({ type: "log", msg });
}
