/* The phase machine, and the one way in.
 *
 *   step(state, library, answer?) -> { state, events, waiting }
 *
 * Each step function moves the machine on and may ASK: it sets `state.waiting`
 * to one request and returns. The machine then stops advancing. On the next
 * call the answer is checked against the request's enumerated options,
 * applied by the request's own handler, and the step that asked is run again
 * -- so every step that can ask must be safe to re-run, which is what the
 * per-player flags (`liveryPicked`, `placed`, `ready`, `stayAsked`) are for.
 *
 * Whether a player may act is exactly whether `waiting.player` is them. No
 * other predicate exists.
 */
import { courseOf, isHole, inGrid, repairAt, optionSiteAt } from "./course.js";
import { card, openRegisters, cardsDealt, REGISTERS } from "./cards.js";
import { shuffle } from "./rng.js";
import { isHuman, alive, racing, log, LIVERIES } from "./state.js";
import {
  playCard, planCard, beltPass, gearPass, pusherPass, crusherPass, jetPass, laserPass,
  checkpointPass, freeSpotNear, robotAt
} from "./rules.js";
import { fire, drawOption, dropOptionAt, OPTION_LIMIT, OPTION_DEFS } from "./options.js";

/* The board's turn, in the classic printed order. Each name is a pass in
 * rules.js; the table is the order, so the sequence can be read rather than
 * traced through eight functions that each name the next. */
export const CLASSIC_ORDER = [
  ["express", (st, C) => beltPass(st, C, 2, 2)],
  ["belts", (st, C) => beltPass(st, C, 1, 2)],
  ["pushers", pusherPass],
  ["gears", gearPass],
  ["presses", crusherPass],
  ["lasers", laserPass],
  ["burners", jetPass],
  ["touch", checkpointPass]
];

function go(st, phase, step) { st.phase = phase; st.step = step; }

function ask(st, player, kind, options, extra) {
  st.waiting = { player: player.id, kind, options, ...(extra || {}) };
}

/* --- requests: what is legal, and how an answer lands ------------------------ */

const REQUESTS = {
  livery: {
    legal: (st, req, a) => Number.isInteger(a) && req.options.includes(a),
    apply: (st, req, a) => {
      const p = st.players[req.player];
      const holder = st.players.find(q => q.livery === a && q.id !== p.id);
      if (holder) { holder.livery = p.livery; holder.name = LIVERIES[holder.livery].name; }
      p.livery = a; p.name = LIVERIES[a].name;
      p.liveryPicked = true;
      log(st, p.name + " takes the wheel");
    }
  },
  bay: {
    legal: (st, req, a) => Number.isInteger(a) && req.options.includes(a),
    apply: (st, req, a) => {
      const p = st.players[req.player];
      const C = req._course;
      const dock = C.docks.find(d => d.n === a);
      takeBay(st, p, dock);
    }
  },
  program: {
    legal: (st, req, a) => {
      if (!Array.isArray(a) || a.length !== req.count) return false;
      const seen = new Set();
      for (const i of a) { if (!Number.isInteger(i) || !req.options.includes(i) || seen.has(i)) return false; seen.add(i); }
      return true;
    },
    apply: (st, req, a) => {
      const p = st.players[req.player];
      const chosen = a.map(i => p.hand[i]);
      p.hand = p.hand.filter((_, i) => !a.includes(i));
      for (let k = 0; k < chosen.length; k++) p.registers[k] = chosen[k];
      p.ready = true;
      st.events.push({ type: "programmed", player: p.id });
    }
  },
  powerDown: {
    legal: (st, req, a) => typeof a === "boolean",
    apply: (st, req, a) => { const p = st.players[req.player]; p.announceDown = a; p.downAsked = true; if (a) log(st, p.name + " announces a power down"); }
  },
  stayDown: {
    legal: (st, req, a) => typeof a === "boolean",
    apply: (st, req, a) => { const p = st.players[req.player]; p.announceDown = a; p.stayAsked = true; }
  },
  /* a card's own question, or the option exchange: the answer is filed under
   * the request's key and the step that asked re-runs to find it */
  cardChoice: {
    legal: (st, req, a) => Number.isInteger(a) && req.options.includes(a),
    apply: (st, req, a) => { st.answers[req.key] = a; }
  },
  siteChoice: {
    legal: (st, req, a) => req.options.includes(a),
    apply: (st, req, a) => { const p = st.players[req.player]; p.siteChoice = a; p.siteAsked = true; }
  },
  dropOption: {
    legal: (st, req, a) => Number.isInteger(a) && req.options.includes(a),
    apply: (st, req, a) => {
      const p = st.players[req.player];
      dropOptionAt(st, p, a, req.why === "wrecked" ? "loses" : "gives up");
      if (req.why === "wrecked") p.mustDrop = false;
    }
  }
};

export const REQUEST_KINDS = Object.keys(REQUESTS);

/** Is `answer` a legal reply to `req`? */
export function isLegal(st, req, answer) {
  const R = REQUESTS[req.kind];
  return !!R && R.legal(st, req, answer);
}

/* --- the steps ----------------------------------------------------------------- */

function takeBay(st, p, dock) {
  p.c = dock.c; p.r = dock.r;
  p.face = 0;                                       // the dock is stamped below the boards, so north is the course
  p.archive = { c: dock.c, r: dock.r, face: 0 };
  p.placed = true;
  st.events.push({ type: "placed", player: p.id, at: [p.c, p.r], bay: dock.n });
  log(st, p.name + " takes bay " + dock.n);
}

const STEPS = {
  draft: {
    /* every human seat picks a colour, in seat order; bots keep what is left */
    livery(st) {
      for (const p of st.players) {
        if (!isHuman(p) || p.liveryPicked) continue;
        const taken = new Set(st.players.filter(q => q.liveryPicked && q.id !== p.id).map(q => q.livery));
        const options = [];
        for (let k = 0; k < LIVERIES.length; k++) if (!taken.has(k)) options.push(k);
        ask(st, p, "livery", options);
        return;
      }
      go(st, "draft", "draw");
    },
    /* everyone draws one card and the fastest priority picks its bay first */
    draw(st) {
      const order = [];
      for (const p of st.players) {
        const i = st.deck.pop();
        const pri = card(st, i).pri;
        st.discard.push(i);
        st.draft.cards[p.id] = pri;
        order.push(p);
        log(st, p.name + " draws priority " + pri);
      }
      order.sort((a, b) => st.draft.cards[b.id] - st.draft.cards[a.id]);
      if (st.house.humanPrivilege) order.sort((a, b) => (isHuman(b) ? 1 : 0) - (isHuman(a) ? 1 : 0));
      st.draft.order = order.map(p => p.id);
      st.draft.at = 0;
      go(st, "draft", "pick");
    },
    pick(st, C) {
      while (st.draft.at < st.draft.order.length) {
        const p = st.players[st.draft.order[st.draft.at]];
        if (p.placed) { st.draft.at++; continue; }
        const free = C.docks.filter(d => !robotAt(st, d.c, d.r)).map(d => d.n);
        if (!free.length) throw new Error("no docking bay left for " + p.name);
        ask(st, p, "bay", free);
        st.waiting._course = C;
        return;
      }
      go(st, "turn", "respawn");
    }
  },

  turn: {
    /* a destroyed robot with lives left returns to its archive with two damage */
    respawn(st, C) {
      for (const p of st.players) {
        if (p.alive || p.out) continue;
        const spot = freeSpotNear(st, C, p.archive.c, p.archive.r);
        if (!spot) { p.out = true; log(st, p.name + " has nowhere to return to and is out"); continue; }
        const rctx = fire(st, p, "onRespawn", { damage: 2, facing: p.archive.face });
        p.c = spot[0]; p.r = spot[1];
        p.face = rctx.facing;
        p.damage = rctx.damage;
        p.alive = true;
        st.events.push({ type: "respawned", player: p.id, at: spot, damage: p.damage });
        log(st, p.name + " returns at (" + p.c + "," + p.r + ") with " + p.damage + " damage");
      }
      if (!racing(st).length) { st.over = true; log(st, "Every robot is scrap. Nobody wins."); return; }
      go(st, "turn", "powerStart");
    },
    /* damage clears at the START of a powered-down turn, not when it was announced */
    powerStart(st) {
      for (const p of alive(st)) {
        if (!p.poweredDown) continue;
        p.damage = 0;
        st.events.push({ type: "poweredDown", player: p.id });
        log(st, p.name + " is powered down and fully repaired");
      }
      go(st, "turn", "deal");
    },
    /* each turn begins by reshuffling the previous turn's cards, then dealing nine minus damage */
    deal(st) {
      st.deck = shuffle(st, st.deck.concat(st.discard));
      st.discard = [];
      st.events.push({ type: "turnStart", turn: st.turn });
      for (const p of alive(st)) {
        p.ready = false; p.downAsked = false; p.stayAsked = false; p.dealtAsked = false;
        if (p.poweredDown) { p.hand = []; p.dealtCount = 0; continue; }
        const n = Math.max(0, fire(st, p, "modifyDealt", { count: cardsDealt(p.damage) }).count);
        p.dealtCount = n;
        p.hand = st.deck.splice(st.deck.length - n, n);
        st.events.push({ type: "dealt", player: p.id, count: n });
      }
      go(st, "turn", "postDeal");
    },
    /* cards that act on the hand you were dealt get their own step, because a
     * step that can ask has to be safe to re-run and the deal itself is not */
    postDeal(st) {
      for (const p of alive(st)) {
        if (p.poweredDown || p.dealtAsked) continue;
        const ctx = fire(st, p, "onDealt", { redraw: false });
        if (ctx.pending) { st.waiting = ctx.ask; return; }
        if (ctx.redraw) {
          for (const i of p.hand) st.discard.push(i);
          if (st.deck.length < p.dealtCount) { st.deck = shuffle(st, st.deck.concat(st.discard)); st.discard = []; }
          p.hand = st.deck.splice(st.deck.length - p.dealtCount, p.dealtCount);
          st.events.push({ type: "dealt", player: p.id, count: p.dealtCount, redraw: true });
          log(st, p.name + " recompiles");
        }
        p.dealtAsked = true;
      }
      go(st, "turn", "program");
    },
    /* a person is asked even with nothing to arrange, because the announce follows */
    program(st, C, policy) {
      for (const p of alive(st)) {
        if (p.poweredDown || p.ready) continue;
        const open = openRegisters(p.damage);
        let count = 0;
        for (let i = 0; i < open; i++) if (p.registers[i] === null) count++;
        count = Math.min(count, p.hand.length);
        ask(st, p, "program", p.hand.map((_, i) => i), { count, open });
        return;
      }
      go(st, "turn", "announce");
    },
    /* "Only damaged robots may choose to power down." Decided after programming, for next turn. */
    announce(st) {
      for (const p of alive(st)) {
        if (p.poweredDown || p.downAsked) continue;
        if (p.damage <= 0) { p.downAsked = true; continue; }
        ask(st, p, "powerDown", [false, true]);
        return;
      }
      st.register = 0;
      for (const p of st.players) p.trail = p.alive ? [[p.c, p.r]] : [];
      go(st, "exec", "reveal");
    }
  },

  exec: {
    /* the order robots act in this register: highest printed priority first, unique across the deck */
    reveal(st) {
      const q = [];
      for (const p of alive(st)) {
        if (p.poweredDown) continue;
        const i = p.registers[st.register];
        if (i === null || i === undefined) continue;
        q.push({ id: p.id, pri: card(st, i).pri });
      }
      q.sort((a, b) => b.pri - a.pri);
      st.queue = q.map(x => x.id);
      for (const p of st.players) p.trail = p.alive ? [[p.c, p.r]] : [];
      st.elem = 0;
      st.events.push({ type: "register", register: st.register });
      log(st, "-- register " + (st.register + 1) + " --");
      go(st, "exec", "move");
    },
    /* peek rather than shift: a card can ask a question before its robot
     * moves, and a shifted queue would lose the robot on the re-run */
    move(st, C) {
      while (st.queue.length) {
        const p = st.players[st.queue[0]];
        if (!p.alive) { st.queue.shift(); continue; }
        const i = p.registers[st.register];
        if (i === null) { st.queue.shift(); continue; }
        const cd = card(st, i);
        const plan = planCard(st, p, cd);
        if (plan.pending) { st.waiting = plan.ask; return; }
        st.queue.shift();
        playCard(st, C, p, cd, plan);
      }
      go(st, "exec", "board");
    },
    /* one element at a time, so a question in the laser pass parks with the
     * elements before it already done and the ones after still to come */
    board(st, C) {
      while (st.elem < CLASSIC_ORDER.length && !st.over) {
        const [name, pass] = CLASSIC_ORDER[st.elem];
        st.events.push({ type: "element", name });
        const ask = pass(st, C);
        if (ask) { st.waiting = ask; return; }
        st.elem++;
      }
      st.elem = 0;
      go(st, "exec", "losses");
    },
    /* a wrecked robot loses an option card of the player's choice, asked here
     * because destruction happened deep inside a move */
    losses(st) {
      for (const p of st.players) {
        if (!p.mustDrop) continue;
        if (!p.options.length) { p.mustDrop = false; continue; }
        if (p.options.length === 1) { dropOptionAt(st, p, 0, "loses"); p.mustDrop = false; continue; }
        ask(st, p, "dropOption", p.options.map((_, i) => i), { why: "wrecked", labels: p.options.map(o => OPTION_DEFS[o.id].name),
          prompt: p.name + " was destroyed and loses an option card. Which one?" });
        return;
      }
      go(st, "exec", "endReg");
    },
    endReg(st) {
      if (st.over) return;
      st.register++;
      if (st.register < REGISTERS) { go(st, "exec", "reveal"); return; }
      go(st, "cleanup", "repair");
    }
  },

  cleanup: {
    /* "Robots on a repair site or checkpoint may now repair 1 point of damage,
     * and robots on a two-wrench repair site may either repair 2 points of
     * damage or receive an option card." Option cards are not built yet, so a
     * two-wrench site repairs two. */
    /* asking is its own pass over the players, before any repair happens, so
     * the step can re-run for a second question without repairing twice */
    repair(st, C) {
      for (const p of alive(st)) {
        if (p.poweredDown || p.siteAsked || !optionSiteAt(C, p.c, p.r)) continue;
        if (p.damage <= 0) { p.siteChoice = "card"; p.siteAsked = true; continue; }   // nothing to repair: the card is the only thing on offer
        ask(st, p, "siteChoice", ["repair", "card"], { prompt: p.name + " ends the turn on a two-wrench site. Repair 2 damage, or take an option card?" });
        return;
      }
      for (const p of alive(st)) {
        if (p.poweredDown) continue;
        const onFlag = !!C.flags.find(f => f.c === p.c && f.r === p.r);
        const site = repairAt(C, p.c, p.r);
        if (optionSiteAt(C, p.c, p.r)) {
          if (p.siteChoice === "card") { drawOption(st, p); continue; }
          const got = Math.min(2, p.damage);
          if (got > 0) { p.damage -= got; st.events.push({ type: "repaired", player: p.id, amount: got, damage: p.damage }); log(st, p.name + " repairs " + got + " damage"); }
          continue;
        }
        const got = Math.min((site || onFlag) ? 1 : 0, p.damage);
        if (got > 0) {
          p.damage -= got;
          st.events.push({ type: "repaired", player: p.id, amount: got, damage: p.damage });
          log(st, p.name + " repairs " + got + " damage");
        }
      }
      go(st, "cleanup", "trim");
    },
    /* three in hand, and the fourth forces one out */
    trim(st) {
      for (const p of alive(st)) {
        if (p.options.length <= OPTION_LIMIT) continue;
        ask(st, p, "dropOption", p.options.map((_, i) => i), { why: "limit", labels: p.options.map(o => OPTION_DEFS[o.id].name),
          prompt: p.name + " may keep " + OPTION_LIMIT + " option cards. Which one goes?" });
        return;
      }
      go(st, "cleanup", "stayDown");
    },
    /* a robot already powered down decides whether to stay down another turn */
    stayDown(st) {
      for (const p of alive(st)) {
        if (!p.poweredDown || p.stayAsked) continue;
        ask(st, p, "stayDown", [false, true]);
        return;
      }
      go(st, "cleanup", "discard");
    },
    discard(st) {
      for (const p of alive(st)) {
        for (const i of p.hand) st.discard.push(i);
        p.hand = [];
        const open = openRegisters(p.damage);
        for (let reg = 0; reg < REGISTERS; reg++) {
          if (reg >= open) continue;                  // locked: the card stays put and re-executes
          if (p.registers[reg] !== null) { st.discard.push(p.registers[reg]); p.registers[reg] = null; }
        }
      }
      go(st, "cleanup", "endTurn");
    },
    endTurn(st) {
      for (const p of st.players) {
        p.poweredDown = p.announceDown;
        p.announceDown = false;
        p.siteAsked = false; p.siteChoice = null;
      }
      st.answers = {};
      st.events.push({ type: "turnEnd", turn: st.turn });
      st.turn++;
      if (st.turn > st.maxTurns) {
        st.over = true; st.unfinished = true;
        log(st, "The race is called after " + st.maxTurns + " turns with no winner.");
        return;
      }
      go(st, "turn", "respawn");
    }
  }
};

/** Run exactly one step function. For tests that want to stop between steps. */
export function tick(st, library) {
  const C = courseOf(st, library);
  const fn = STEPS[st.phase] && STEPS[st.phase][st.step];
  if (!fn) throw new Error("unknown step " + st.phase + "." + st.step);
  fn(st, C);
}

/**
 * Advance the game until it needs an answer or is over.
 * @param st       the state; mutated in place and returned
 * @param library  Map of board id -> board, for assembling the course
 * @param answer   the reply to `st.waiting`, when there is one
 */
export function step(st, library, answer) {
  st.events = [];
  if (st.waiting) {
    const req = st.waiting;
    if (answer === undefined) return { state: st, events: st.events, waiting: req, refused: false };
    if (!isLegal(st, req, answer)) {
      return { state: st, events: st.events, waiting: req, refused: true };
    }
    delete req._course;
    st.waiting = null;
    REQUESTS[req.kind].apply(st, { ...req, _course: courseOf(st, library) }, answer);
  }
  const C = courseOf(st, library);
  let guard = 0;
  while (!st.over && !st.waiting) {
    if (++guard > 20000) throw new Error("machine runaway at " + st.phase + "." + st.step + " turn " + st.turn);
    const fn = STEPS[st.phase] && STEPS[st.phase][st.step];
    if (!fn) throw new Error("unknown step " + st.phase + "." + st.step);
    fn(st, C);
  }
  if (st.waiting) delete st.waiting._course;
  return { state: st, events: st.events, waiting: st.waiting, refused: false };
}
