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
 *
 * Two tables of steps, one per ruleset, sharing what the two games share
 * (the draft, programming, the register loop). The 2016 round is the
 * reference card's (manual1/IMG_1253): upgrade phase, programming phase,
 * activation register by register in Priority Token order, end of round.
 */
import { courseOf, isHole, inGrid, repairAt, optionSiteAt } from "./course.js";
import { card, openRegisters, cardsDealt, isDamage, isModern, REGISTERS, HAND, UPGRADE_DRAW_COST } from "./cards.js";
import { shuffle } from "./rng.js";
import { isHuman, alive, racing, priorityOrder, log, LIVERIES } from "./state.js";
import {
  playCard, planCard, beltPass, gearPass, pusherPass, crusherPass, jetPass, laserPass,
  checkpointPass, batteryPass, freeSpotNear, robotAt, drawOwn, putAway
} from "./rules.js";
import { fire, drawOption, dropOptionAt, OPTION_LIMIT, OPTION_DEFS } from "./options.js";
import { buyUpgrade, installUpgrade, uninstallUpgrade, canInstall } from "./upgrades.js";
import { step as stepCell } from "../../editor/lib/dir.js";

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

/* The 2016 reference card's order (IMG_1252): blue belts, which convey twice,
 * then green belts once, push panels, gears, board lasers and robot weapons
 * (one pass, resolved against one frozen board), then the end of register:
 * batteries, then checkpoints. Crushers sit where the expansion sheets put
 * them, after the gears. No presses, no burners, no doors. */
export const MODERN_ORDER = [
  ["blue1", (st, C) => beltPass(st, C, 2, 2)],
  ["blue2", (st, C) => beltPass(st, C, 2, 2)],
  ["green", (st, C) => beltPass(st, C, 1, 1)],
  ["pushers", pusherPass],
  ["gears", gearPass],
  ["crushers", crusherPass],
  ["lasers", laserPass],
  ["batteries", batteryPass],
  ["touch", checkpointPass]
];

export function orderFor(st) { return isModern(st) ? MODERN_ORDER : CLASSIC_ORDER; }

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
      let k = 0;
      for (let reg = 0; reg < REGISTERS && k < chosen.length; reg++) if (p.registers[reg] === null) p.registers[reg] = chosen[k++];
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
  },

  /* --- the 2016 requests ------------------------------------------------------ */

  /* One answer for the phase: { buy, install, uninstall }. A draw or an
   * uninstall on its own asks again, so the card just drawn can be fitted
   * in the same phase, as the book allows; an install, or an empty answer,
   * is the player's Done. */
  upgrade: {
    legal: (st, req, a) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) return false;
      const o = req.options;
      if (a.buy !== undefined && (typeof a.buy !== "boolean" || !o.buy.includes(a.buy))) return false;
      if (a.install !== undefined && a.install !== null && !o.install.includes(a.install)) return false;
      if (a.uninstall !== undefined && !(Array.isArray(a.uninstall) && a.uninstall.every(id => o.uninstall.includes(id)) && new Set(a.uninstall).size === a.uninstall.length)) return false;
      return true;
    },
    apply: (st, req, a) => {
      const p = st.players[req.player];
      for (const id of a.uninstall || []) uninstallUpgrade(st, p, id);
      if (a.buy) { if (buyUpgrade(st, p)) p.bought = true; }
      if (a.install) { if (installUpgrade(st, p, a.install)) p.fitted = true; }
      /* an install, or an empty answer, is Done; a draw or an uninstall on
       * its own is asked again so the phase can go on */
      const acted = a.buy || (a.uninstall && a.uninstall.length);
      if (a.install || !acted) p.upgradeDone = true;
    }
  },
  shutdown: {
    legal: (st, req, a) => typeof a === "boolean",
    apply: (st, req, a) => { const p = st.players[req.player]; p.shutAsked = true; if (a) shutdown(st, p); }
  },
  rebootFacing: {
    legal: (st, req, a) => Number.isInteger(a) && req.options.includes(a),
    apply: (st, req, a) => { st.answers[req.key] = a; }
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

/**
 * "I am shutting down!" (p.19): declared after programming and before the
 * first reveal, for this round. Every damage card in the registers, the hand
 * and the discard pile goes back to the table; every regular card in the
 * registers and hand goes to the robot's own discard. The deck is untouched.
 * The robot stays on the floor and takes what the floor gives it.
 */
export function shutdown(st, p) {
  p.poweredDown = true;
  let scrapped = 0;
  for (let i = 0; i < REGISTERS; i++) {
    const ci = p.registers[i];
    if (ci === null) continue;
    if (isDamage(st, ci)) { st.damageDiscard.push(ci); scrapped++; } else p.pile.push(ci);
    p.registers[i] = null;
  }
  for (const ci of p.hand) { if (isDamage(st, ci)) { st.damageDiscard.push(ci); scrapped++; } else p.pile.push(ci); }
  p.hand = [];
  const keep = [];
  for (const ci of p.pile) { if (isDamage(st, ci)) { st.damageDiscard.push(ci); scrapped++; } else keep.push(ci); }
  p.pile = keep;
  st.events.push({ type: "poweredDown", player: p.id, shutdown: true, scrapped });
  log(st, p.name + " shuts down for the round and scraps " + scrapped + " damage card" + (scrapped === 1 ? "" : "s"));
}

/**
 * Register 1 of the round after a reboot: the robot lands at its reboot
 * point facing the way its player chose, and an occupant is moved one square
 * along the point's arrow first -- "moving an obstructing robot does not
 * count as your robot pushing that robot", so no push hooks fire. See
 * MODERN_REBOOT_POINT in state.js for the substitute in use.
 */
function landReboot(st, C, p, facing) {
  const at = p.archive || { c: p.c, r: p.r, face: 0 };
  const occ = robotAt(st, at.c, at.r);
  if (occ) {
    const [nc, nr] = stepCell(at.c, at.r, at.face);
    let spot = inGrid(C, nc, nr) && !isHole(C, nc, nr) && !robotAt(st, nc, nr) ? [nc, nr] : null;
    /* never into a hole and never off the edge: the book does not exempt the
     * occupant from the square it lands on, but a re-entry that fed a pit
     * every round once emptied a whole race, so the fallback is the nearest
     * free floor */
    if (!spot) spot = freeSpotNear(st, C, at.c, at.r);
    if (spot) {
      const from = [occ.c, occ.r];
      occ.c = spot[0]; occ.r = spot[1];
      st.events.push({ type: "shoved", player: occ.id, from, to: spot, cause: "reboot" });
      log(st, occ.name + " is moved aside for " + p.name);
    }
  }
  p.c = at.c; p.r = at.r; p.face = facing;
  p.alive = true; p.rebooting = false;
  p.trail = [[p.c, p.r]];
  st.events.push({ type: "rebooted", player: p.id, at: [p.c, p.r], face: facing });
  log(st, p.name + " reboots at (" + p.c + "," + p.r + ") facing " + ["north", "east", "south", "west"][facing]);
}

/**
 * A SPAM card revealed in a register (p.17): straight to the damage discard,
 * and the top card of the robot's own deck is played in its place -- and
 * again if that is SPAM too. An Again in register 1 does the same, into the
 * robot's own discard (p.11). Returns the index now in the register, or null
 * when the robot owns nothing else to play.
 */
function replaceInRegister(st, p, reg, why) {
  for (let guard = 0; guard < 80; guard++) {
    const ci = p.registers[reg];
    if (ci === null) return null;
    const cd = card(st, ci);
    const spam = isDamage(st, ci);
    const dud = !spam && cd.kind === "again" && reg === 0;
    if (!spam && !dud) return ci;
    putAway(st, p, ci, true);
    st.events.push({ type: "spam", player: p.id, register: reg, card: ci, again: dud });
    log(st, p.name + (spam ? " reveals SPAM and throws it away" : "'s Again has nothing to repeat"));
    const next = drawOwn(st, p);
    p.registers[reg] = next === null ? null : next;
    if (next === null) { log(st, p.name + " has no card left to play"); return null; }
    log(st, p.name + " plays the top of its deck instead");
  }
  return null;
}

/** The card an Again repeats: the last register before this one that does not itself hold an Again. */
function againTarget(st, p, reg) {
  for (let k = reg - 1; k >= 0; k--) {
    const ci = p.registers[k];
    if (ci === null) return null;
    if (card(st, ci).kind !== "again") return ci;
  }
  return null;
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
    /* classic: everyone draws one card and the fastest priority picks its bay
     * first. 2016: the Priority Token's seat places first, then round the
     * table (p.3). The human-privilege house rule puts the people first. */
    draw(st) {
      let order;
      if (isModern(st)) {
        order = priorityOrder(st);
      } else {
        order = [];
        for (const p of st.players) {
          const i = st.deck.pop();
          const pri = card(st, i).pri;
          st.discard.push(i);
          st.draft.cards[p.id] = pri;
          order.push(p);
          log(st, p.name + " draws priority " + pri);
        }
        order.sort((a, b) => st.draft.cards[b.id] - st.draft.cards[a.id]);
      }
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
      go(st, "turn", isModern(st) ? "upgrade" : "respawn");
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
      for (const p of (isModern(st) ? racing(st) : alive(st))) {
        if (p.poweredDown || p.dealtAsked) continue;
        const ctx = fire(st, p, "onDealt", { redraw: false });
        if (ctx.pending) { st.waiting = ctx.ask; return; }
        if (ctx.redraw && !isModern(st)) {
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
      for (const p of (isModern(st) ? racing(st) : alive(st))) {
        if (p.poweredDown || p.ready) continue;
        const open = isModern(st) ? REGISTERS : openRegisters(p.damage);
        let count = 0;
        for (let i = 0; i < open; i++) if (p.registers[i] === null) count++;
        count = Math.min(count, p.hand.length);
        ask(st, p, "program", p.hand.map((_, i) => i), { count, open });
        return;
      }
      go(st, "turn", isModern(st) ? "leftovers" : "announce");
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
    },

    /* --- the 2016 turn ---------------------------------------------------------- */

    /* "Once during each Upgrade Phase, you may pay 1 Energy to draw 1 new
     * upgrade card. Once during each Upgrade Phase, you may install 1 new
     * upgrade from your collection of uninstalled upgrades." And uninstall
     * any number. A rebooting robot shops too. */
    upgrade(st) {
      for (const p of racing(st)) {
        if (p.upgradeDone) continue;
        const buy = !p.bought && p.energy >= UPGRADE_DRAW_COST && (st.upgradeDeck.length + st.upgradeDiscard.length) > 0 ? [false, true] : [false];
        const install = [null].concat(p.fitted ? [] : p.shelf.filter(id => canInstall(p, id)));
        const uninstall = p.installed.map(u => u.id);
        if (buy.length === 1 && install.length === 1 && !uninstall.length) { p.upgradeDone = true; continue; }
        ask(st, p, "upgrade", { buy, install, uninstall }, { energy: p.energy });
        return;
      }
      go(st, "turn", "dealModern");
    },
    /* "Draw cards from your own programming deck until you have 9 cards in
     * your hand" -- on top of the SPAM still held from last round. */
    dealModern(st) {
      st.events.push({ type: "turnStart", turn: st.turn });
      for (const p of racing(st)) {
        p.ready = false; p.dealtAsked = false; p.shutAsked = false;
        const target = Math.max(0, fire(st, p, "modifyDealt", { count: HAND }).count);
        let drew = 0;
        while (p.hand.length < target) {
          const i = drawOwn(st, p);
          if (i === null) break;
          p.hand.push(i);
          drew++;
        }
        p.dealtCount = drew;
        st.events.push({ type: "dealt", player: p.id, count: drew });
      }
      go(st, "turn", "postDeal");
    },
    /* "Place any non-damage programming cards still in your hand in the
     * discard pile on your player mat." The damage cards stay. */
    leftovers(st) {
      for (const p of racing(st)) {
        const keep = [];
        for (const i of p.hand) { if (isDamage(st, i)) keep.push(i); else p.pile.push(i); }
        p.hand = keep;
      }
      go(st, "turn", "shutdownAsk");
    },
    /* "After all players have completed the Programming Phase, but before
     * players have revealed their Register 1 cards, you may declare: I am
     * shutting down!" -- a robot on the floor, for this round. */
    shutdownAsk(st) {
      for (const p of alive(st)) {
        if (p.shutAsked) continue;
        ask(st, p, "shutdown", [false, true], { held: heldDamageOf(st, p) });
        return;
      }
      st.register = 0;
      for (const p of st.players) p.trail = p.alive ? [[p.c, p.r]] : [];
      go(st, "exec", "reveal");
    }
  },

  exec: {
    /* the order robots act in this register: classic, highest printed
     * priority first, unique across the deck; 2016, the Priority Token's seat
     * and then round the table, the same for all five registers, with a
     * rebooting robot in its place in register 1 so it has a moment to land */
    reveal(st) {
      let q;
      if (isModern(st)) {
        q = priorityOrder(st).filter(p => (p.alive && !p.poweredDown && p.registers[st.register] !== null) || (p.rebooting && st.register === 0)).map(p => p.id);
      } else {
        const qq = [];
        for (const p of alive(st)) {
          if (p.poweredDown) continue;
          const i = p.registers[st.register];
          if (i === null || i === undefined) continue;
          qq.push({ id: p.id, pri: card(st, i).pri });
        }
        qq.sort((a, b) => b.pri - a.pri);
        q = qq.map(x => x.id);
      }
      st.queue = q;
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
        if (p.rebooting && isModern(st)) {
          /* "Choose your facing (ignore the arrow on the token), then resolve
           * your Register 1 programming card as usual." */
          const key = st.turn + ":reboot:" + p.id;
          const facing = st.answers[key];
          if (facing === undefined) { ask(st, p, "rebootFacing", [0, 1, 2, 3], { key, prompt: p.name + " reboots. Which way should it face?" }); return; }
          landReboot(st, C, p, facing);
        }
        if (!p.alive) { st.queue.shift(); continue; }
        let i = p.registers[st.register];
        if (i === null) { st.queue.shift(); continue; }
        let cd = card(st, i);
        let again = false;
        if (isModern(st)) {
          i = replaceInRegister(st, p, st.register);
          if (i === null) { st.queue.shift(); continue; }
          cd = card(st, i);
          if (cd.kind === "again") {
            /* "Repeat the programming in your previous register, as if that
             * card were in this register." Two in a row repeat the last real card. */
            const ti = againTarget(st, p, st.register);
            if (ti === null) { log(st, p.name + "'s Again repeats nothing"); st.queue.shift(); continue; }
            cd = card(st, ti);
            again = true;
          }
        }
        const plan = planCard(st, p, cd, again);
        if (plan.pending) { st.waiting = plan.ask; return; }
        st.queue.shift();
        playCard(st, C, p, cd, plan);
      }
      go(st, "exec", "board");
    },
    /* one element at a time, so a question in the laser pass parks with the
     * elements before it already done and the ones after still to come */
    board(st, C) {
      const order = orderFor(st);
      while (st.elem < order.length && !st.over) {
        const [name, pass] = order[st.elem];
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
      go(st, "cleanup", isModern(st) ? "endRound" : "repair");
    }
  },

  cleanup: {
    /* "Robots on a repair site or checkpoint may now repair 1 point of damage,
     * and robots on a two-wrench repair site may either repair 2 points of
     * damage or receive an option card." */
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
    },

    /* "When the 5th Register has been fully resolved: the player holding the
     * Priority Token passes it to the player on their left. Place all face-up
     * damage cards in your registers into the damage discard pile. Discard
     * all face-up programming cards in your registers into your own discard
     * pile." A shutdown lasts the round; nobody is asked to stay down. */
    endRound(st) {
      for (const p of st.players) {
        for (let reg = 0; reg < REGISTERS; reg++) {
          const ci = p.registers[reg];
          if (ci === null) continue;
          putAway(st, p, ci, true);
          p.registers[reg] = null;
        }
        p.poweredDown = false; p.announceDown = false;
        p.upgradeDone = false; p.bought = false; p.fitted = false; p.shutAsked = false;
      }
      st.priority = (st.priority + 1) % st.players.length;
      log(st, "the Priority Token passes to " + st.players[st.priority].name);
      st.answers = {};
      st.events.push({ type: "turnEnd", turn: st.turn });
      st.turn++;
      if (st.turn > st.maxTurns) {
        st.over = true; st.unfinished = true;
        log(st, "The race is called after " + st.maxTurns + " rounds with no winner.");
        return;
      }
      go(st, "turn", "upgrade");
    }
  }
};

function heldDamageOf(st, p) {
  let n = 0;
  for (const i of p.hand) if (isDamage(st, i)) n++;
  for (const i of p.pile) if (isDamage(st, i)) n++;
  return n;
}

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
