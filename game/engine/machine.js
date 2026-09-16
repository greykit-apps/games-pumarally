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
import { card, KINDS, openRegisters, cardsDealt, isDamage, isModern, REGISTERS, HAND, MAX_ENERGY, UPGRADE_DRAW_COST } from "./cards.js";
import { shuffle } from "./rng.js";
import { isHuman, alive, racing, priorityOrder, log, livesFor, LIVERIES } from "./state.js";
import {
  playCard, planCard, beltPass, gearPass, pusherPass, crusherPass, jetPass, laserPass,
  checkpointPass, batteryPass, flamerPass, freeSpotNear, robotAt, drawOwn, putAway, stepRobot, arrived, rebootPoint } from "./rules.js";
import { currentAt, randomizerAt, teleporterAt, inGrid as inCourse } from "./course.js";
import { resolveHaywire, isHaywire } from "./haywire.js";
import { fire, drawOption, dropOptionAt, OPTION_LIMIT, OPTION_DEFS } from "./options.js";
import { buyUpgrade, installUpgrade, uninstallUpgrade, canInstall, temporaryOffers, useTemporary, UPGRADE_DEFS, gainEnergy } from "./upgrades.js";
import { step as stepCell, rot } from "../../editor/lib/dir.js";

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
  ["green", (st, C) => beltPass(st, C, 1, 1, null, (C2, c, r) => !currentAt(C2, c, r))],
  /* Wet and Wild: "Currents act just like green conveyor belts, but convey robots on their spaces during Board Element Activation Step #3." */
  ["currents", (st, C) => beltPass(st, C, 1, 1, null, currentAt)],
  ["pushers", pusherPass],
  ["gears", gearPass],
  ["crushers", crusherPass],
  ["lasers", laserPass],
  ["flamers", flamerPass],
  ["batteries", batteryPass],
  ["touch", checkpointPass]
];

export function orderFor(st) { return isModern(st) ? MODERN_ORDER : CLASSIC_ORDER; }

function go(st, phase, step) { st.phase = phase; st.step = step; }

function ask(st, player, kind, options, extra) {
  st.waiting = { player: player.id, kind, options, ...(extra || {}) };
}

/* The Konami code, entered at the keyboard during a player's own programming.
 * A cheat, applied here as a pure function of the state so a save reproduces it
 * and the conservation laws hold:
 *   - classic: a full stock of lives back, and the damage track wiped;
 *   - modern: the Energy bar filled, and every damage card -- SPAM and Haywire
 *     alike -- scrapped out of the robot's hand, deck, discard, parked cards
 *     and registers, onto the damage discard where the count still finds them.
 * Modern never touches lives (the 2016 game keeps them all equal); classic has
 * no damage cards to scrap. The program step is re-run after, so the player
 * goes on programming with the cleaned-up hand. */
function konamiCheat(st, p) {
  if (isModern(st)) {
    gainEnergy(st, p, MAX_ENERGY, "konami");
    let scrapped = 0;
    const bin = i => { st.damageDiscard.push(i); scrapped++; };
    for (const key of ["hand", "deck", "pile", "parked"]) {
      p[key] = p[key].filter(i => { if (isDamage(st, i)) { bin(i); return false; } return true; });
    }
    for (const key of ["registers", "crab", "haywire"]) {
      for (let k = 0; k < p[key].length; k++) {
        const i = p[key][k];
        if (i !== null && isDamage(st, i)) { bin(i); p[key][k] = null; }
      }
    }
    log(st, p.name + " enters the code -- Energy filled, " + scrapped + " damage card(s) scrapped");
  } else {
    const boards = (st.course.stamps || []).filter(s => s.role === "board").length;
    p.lives = livesFor(st.players.length, boards);
    p.damage = 0;
    log(st, p.name + " enters the code -- lives and health restored");
  }
  st.events.push({ type: "cheat", player: p.id, code: "konami" });
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
      takeBay(st, p, dock, C);
    }
  },
  program: {
    /* an entry is a hand index, or -- with Crab Legs fitted -- a pair
     * [rotate, move1] of hand indices for one register */
    legal: (st, req, a) => {
      /* the Konami code, entered mid-plan: a cheat, always allowed here */
      if (a && typeof a === "object" && !Array.isArray(a) && a.cheat === "konami") return true;
      if (!Array.isArray(a) || a.length !== req.count) return false;
      const p = st.players[req.player];
      const seen = new Set();
      const one = i => { if (!Number.isInteger(i) || !req.options.includes(i) || seen.has(i)) return false; seen.add(i); return true; };
      for (const e of a) {
        if (Array.isArray(e)) {
          if (!req.crab || e.length !== 2 || !one(e[0]) || !one(e[1])) return false;
          const k0 = card(st, p.hand[e[0]]).kind, k1 = card(st, p.hand[e[1]]).kind;
          if (!((k0 === "left" || k0 === "right") && k1 === "move1")) return false;
        } else if (!one(e)) return false;
      }
      /* Rewire: "You must program all these Haywires this round" */
      for (const i of req.must || []) if (!seen.has(i)) return false;
      return true;
    },
    apply: (st, req, a) => {
      const p = st.players[req.player];
      /* the cheat: apply it and leave the player un-ready, so the program step
       * re-runs and asks again with the tidied hand */
      if (a && a.cheat === "konami") { konamiCheat(st, p); return; }
      const flat = [];
      for (const e of a) { if (Array.isArray(e)) flat.push(e[0], e[1]); else flat.push(e); }
      const chosen = a.map(e => Array.isArray(e) ? [p.hand[e[0]], p.hand[e[1]]] : p.hand[e]);
      p.hand = p.hand.filter((_, i) => !flat.includes(i));
      let k = 0;
      for (let reg = 0; reg < REGISTERS && k < chosen.length; reg++) {
        if (p.registers[reg] !== null || (p.haywire && p.haywire[reg] !== null)) continue;
        const e = chosen[k++];
        if (Array.isArray(e)) { p.registers[reg] = e[0]; p.crab[reg] = e[1]; } else p.registers[reg] = e;
      }
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
  },
  /* a temporary upgrade at this moment: null for none, or one of the listed
   * uses. The use happens here, once, when the answer lands; the step that
   * asked re-runs and asks again until the answer is none. */
  useTemp: {
    legal: (st, req, a) => a === null || (a && typeof a === "object" && req.options.some(o => o !== null && JSON.stringify(o) === JSON.stringify(a))),
    apply: (st, req, a) => {
      st.answers[req.key] = a === null ? null : 1;
      if (a) useTemporary(st, req._course, st.players[req.player], a);
    }
  },
  /* cards chosen from the hand in order: exactly `count`, or any number when count is null */
  stack: {
    legal: (st, req, a) => {
      if (!Array.isArray(a)) return false;
      if (req.count !== null && req.count !== undefined && a.length !== req.count) return false;
      const seen = new Set();
      for (const i of a) { if (!Number.isInteger(i) || !req.options.includes(i) || seen.has(i)) return false; seen.add(i); }
      return true;
    },
    apply: (st, req, a) => {
      const p = st.players[req.player];
      const picked = a.map(i => p.hand[i]);
      p.hand = p.hand.filter((_, i) => !a.includes(i));
      if (req.why === "memorySwap") { for (const ci of picked.slice().reverse()) p.deck.push(ci); p.stackBack = 0; log(st, p.name + " stacks " + picked.length + " cards back on its deck"); }
      else if (req.why === "memoryCards") { p.parked = p.parked.concat(picked); p.parkAsked = true; if (picked.length) log(st, p.name + " parks " + picked.length + " cards on its Memory Cards"); }
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

/** "Players place their robots with the arrow on their base pointing toward the adjacent board" (2016 p.3): the way off the docking bay onto the course. */
function facingOff(C, dock) {
  const own = C.from[dock.r * C.w + dock.c];
  for (const d of [0, 1, 2, 3]) {
    let c = dock.c, r = dock.r;
    for (let k = 0; k < 16; k++) {
      c += [0, 1, 0, -1][d]; r += [-1, 0, 1, 0][d];
      if (!inGrid(C, c, r)) break;
      if (C.from[r * C.w + c] !== own) return d;
    }
  }
  return 0;
}

function takeBay(st, p, dock, C) {
  const face = C ? facingOff(C, dock) : 0;
  p.c = dock.c; p.r = dock.r;
  p.face = face;
  p.archive = { c: dock.c, r: dock.r, face };
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
    if (ci !== null) { if (isDamage(st, ci)) { st.damageDiscard.push(ci); scrapped++; } else p.pile.push(ci); p.registers[i] = null; }
    if (p.haywire[i] !== null) { st.damageDiscard.push(p.haywire[i]); p.haywire[i] = null; scrapped++; }
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
  const at = rebootPoint(C, p);
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
  p.fellFrom = -1;
  st.events.push({ type: "rebooted", player: p.id, at: [p.c, p.r], face: facing });
  log(st, p.name + " reboots " + (at.token ? "on the Reboot Token" : "at its archive") + " (" + p.c + "," + p.r + ") facing " + ["north", "east", "south", "west"][facing]);
}

/**
 * Offer the temporary upgrades usable at this moment, one use at a time,
 * until the player says none. Returns a request to raise, or null when
 * the player is done (or has nothing to use).
 */
function askTemps(st, C, p, moment) {
  for (let k = 0; k < 8; k++) {
    const key = st.turn + ":" + st.register + ":temp:" + moment + ":" + p.id + ":" + k;
    const have = st.answers[key];
    if (have === null) return null;
    if (have !== undefined) continue;                  // used one; there may be another
    const offers = temporaryOffers(st, C, p, moment);
    if (!offers.length) { st.answers[key] = null; return null; }
    return { player: p.id, kind: "useTemp", key, moment, options: [null].concat(offers),
      labels: offers.map(o => tempLabel(st, o)),
      prompt: p.name + ", use a temporary upgrade " + (moment === "dealt" ? "before programming" : moment === "before" ? "before your card" : "after your card") + "?" };
  }
  return null;
}
const DIR_WORDS = ["north", "east", "south", "west"];
function tempLabel(st, o) {
  const d = UPGRADE_DEFS[o.id];
  if (o.dir !== undefined && o.with !== undefined) return d.name + " with " + st.players[o.with].name;
  if (o.dir !== undefined) return d.name + " " + DIR_WORDS[o.dir];
  if (o.face !== undefined) return d.name + " to face " + DIR_WORDS[o.face];
  if (o.seat !== undefined) return d.name + ": " + st.players[o.seat].name;
  return d.name;
}

/**
 * A SPAM card revealed in a register (p.17): straight to the damage discard,
 * and the top card of the robot's own deck is played in its place -- and
 * again if that is SPAM too. An Again in register 1 does the same, into the
 * robot's own discard (p.11). Returns the index now in the register, or null
 * when the robot owns nothing else to play.
 */
function replaceInRegister(st, p, reg, why) {
  let first = true;
  for (let guard = 0; guard < 80; guard++) {
    const ci = p.registers[reg];
    if (ci === null) return null;
    const cd = card(st, ci);
    const spam = cd.kind === "spam";                   // a Haywire is damage too, and is resolved, not replaced
    const dud = !spam && cd.kind === "again" && reg === 0;
    if (!spam && !dud) return ci;
    putAway(st, p, ci, true);
    st.events.push({ type: "spam", player: p.id, register: reg, card: ci, again: dud });
    log(st, p.name + (spam ? " reveals SPAM and throws it away" : "'s Again has nothing to repeat"));
    /* Chaos Theory: the SPAM programmed, not the one the replacement turned up */
    if (spam) { const sctx = fire(st, p, "onSpam", { register: reg, first, energy: 0 }); if (sctx.energy) { gainEnergy(st, p, sctx.energy, "chaosTheory"); log(st, p.name + " turns the SPAM into Energy"); } }
    first = false;
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
        /* back onto the archive square itself; sharing it with anybody makes the robot virtual (p.8, p.15) */
        const spot = [p.archive.c, p.archive.r];
        const rctx = fire(st, p, "onRespawn", { damage: 2, facing: p.archive.face });
        p.virtual = !!robotAt(st, spot[0], spot[1]);
        p.c = spot[0]; p.r = spot[1];
        p.face = rctx.facing;
        p.damage = rctx.damage;
        p.alive = true;
        st.events.push({ type: "respawned", player: p.id, at: spot, damage: p.damage, virtual: p.virtual });
        log(st, p.name + " returns at (" + p.c + "," + p.r + ") with " + p.damage + " damage" + (p.virtual ? ", virtual" : ""));
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
        p.ready = false; p.downAsked = false; p.stayAsked = false; p.dealtAsked = false; p.reserveAsked = false; p.revealed = -1;
        if (p.poweredDown) { p.hand = []; p.dealtCount = 0; continue; }
        const n = Math.max(0, fire(st, p, "modifyDealt", { count: cardsDealt(p.damage) }).count);
        p.dealtCount = n;
        p.hand = st.deck.splice(st.deck.length - n, n);
        /* Flywheel: the card spun on last turn joins this hand, on top of the deal */
        if (Number.isInteger(p.flywheel)) { p.hand.push(p.flywheel); p.flywheel = null; log(st, p.name + " takes the card off its flywheel"); }
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
        /* 2016: the temporary upgrades with a use before programming (Memory
         * Swap, Calibration Protocol, Recharge, Re-initialize), then the three
         * cards a Memory Swap puts back */
        if (isModern(st)) {
          if (p.stackBack > 0) {
            ask(st, p, "stack", p.hand.map((_, i) => i), { count: Math.min(p.stackBack, p.hand.length), why: "memorySwap", prompt: p.name + ", put three cards back on top of your deck. The first goes on top." });
            return;
          }
          /* Controlled Chaos: "you may place it face down under any card in your registers where
           * there is not already a face-down Haywire card" -- the Haywire lands where it was drawn
           * and is moved now, the first moment a question can be asked, before the registers are set */
          if (!p.chaosAsked && p.installed.some(u => u.id === "controlledChaos")) {
            for (let reg = 0; reg < REGISTERS; reg++) {
              if (p.haywire[reg] === null) continue;
              const free = p.haywire.map((h, i) => h === null ? i : -1).filter(i => i >= 0);
              if (!free.length) continue;
              const key = st.turn + ":chaos:" + p.id + ":" + reg;
              const a = st.answers[key];
              if (a === undefined) {
                ask(st, p, "cardChoice", free.map((_, k) => k).concat([free.length]).map((_, k) => k), { key, card: "controlledChaos", tag: String(reg),
                  prompt: p.name + ", the Haywire under register " + (reg + 1) + " may go under another register.",
                  labels: ["Leave it under register " + (reg + 1)].concat(free.map(i => "Under register " + (i + 1))) });
                return;
              }
              if (a > 0 && free[a - 1] !== undefined) { p.haywire[free[a - 1]] = p.haywire[reg]; p.haywire[reg] = null; log(st, p.name + " moves a Haywire to register " + (free[a - 1] + 1)); }
            }
            p.chaosAsked = true;
          }
          const t = askTemps(st, C, p, "dealt");
          if (t) { st.waiting = t; st.waiting._course = C; return; }
        }
        const open = isModern(st) ? REGISTERS : openRegisters(p.damage);
        let count = 0;
        for (let i = 0; i < open; i++) if (p.registers[i] === null && !(isModern(st) && p.haywire[i] !== null)) count++;
        count = Math.min(count, p.hand.length);
        const crab = isModern(st) && p.installed.some(u => u.id === "crabLegs");
        /* the registers a face-down Haywire holds, and the Haywires a Rewire put in the hand */
        const held = isModern(st) ? p.haywire.map((h, i) => h === null ? -1 : i).filter(i => i >= 0) : [];
        const must = isModern(st) ? p.hand.map((ci, i) => isHaywire(st, ci) ? i : -1).filter(i => i >= 0) : [];
        ask(st, p, "program", p.hand.map((_, i) => i), { count, open, crab, held, must });
        return;
      }
      go(st, "turn", isModern(st) ? "leftovers" : "reserve");
    },
    /* the cards that take a program card off the rest of the hand once the
     * registers are set: Command in Reserve and Flywheel, asked in one go */
    reserve(st) {
      for (const p of alive(st)) {
        if (p.poweredDown || p.reserveAsked || !p.options.length) continue;
        const hand = p.hand.map(ci => KINDS[card(st, ci).kind].label);
        const ctx = fire(st, p, "onProgrammed", { hand, reserve: null, flywheel: null });
        if (ctx.pending) { st.waiting = ctx.ask; return; }
        let r = ctx.reserve, f = ctx.flywheel;
        if (r !== null && f === r) f = null;                 // one card cannot lie on both
        const take = [];
        if (r !== null && p.hand[r] !== undefined) { p.reserve = p.hand[r]; take.push(r); st.events.push({ type: "reserved", player: p.id, card: p.reserve }); log(st, p.name + " keeps a " + hand[r] + " in reserve"); }
        if (f !== null && p.hand[f] !== undefined) { p.flywheel = p.hand[f]; take.push(f); st.events.push({ type: "flywheel", player: p.id, card: p.flywheel }); log(st, p.name + " spins a " + hand[f] + " onto its flywheel"); }
        p.hand = p.hand.filter((_, i) => !take.includes(i));
        p.reserveAsked = true;
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
    },

    /* --- the 2016 turn ---------------------------------------------------------- */

    /* "Once during each Upgrade Phase, you may pay 1 Energy to draw 1 new
     * upgrade card. Once during each Upgrade Phase, you may install 1 new
     * upgrade from your collection of uninstalled upgrades." And uninstall
     * any number. A rebooting robot shops too. */
    upgrade(st) {
      for (const p of racing(st)) {
        if (p.upgradeDone) continue;
        /* Memory Cards: "At the start of the Upgrade Phase, add all cards on this card to your hand." */
        if (p.parked.length) { p.hand = p.hand.concat(p.parked); log(st, p.name + " takes " + p.parked.length + " cards back from its Memory Cards"); p.parked = []; }
        const buy = !p.bought && p.energy >= UPGRADE_DRAW_COST && (st.upgradeDeck.length + st.upgradeDiscard.length) > 0 ? [false, true] : [false];
        const install = [null].concat(p.fitted ? [] : p.shelf.filter(id => canInstall(p, id, st.players.length)));
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
        p.ready = false; p.dealtAsked = false; p.shutAsked = false; p.parkAsked = false; p.stackBack = 0; p.chaosAsked = false;
        for (let reg = 0; reg < REGISTERS; reg++) p.crab[reg] = null;
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
      /* Memory Cards first: the parked cards are the ones that would otherwise go */
      for (const p of racing(st)) {
        if (p.parkAsked || !p.installed.some(u => u.id === "memoryCards")) continue;
        const opts = p.hand.map((i, k) => isDamage(st, i) ? -1 : k).filter(k => k >= 0);
        if (!opts.length) { p.parkAsked = true; continue; }
        ask(st, p, "stack", opts, { count: null, why: "memoryCards", prompt: p.name + ", park any cards on your Memory Cards for next round?" });
        return;
      }
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
        q = priorityOrder(st).filter(p => (p.alive && !p.poweredDown && (p.registers[st.register] !== null || p.haywire[st.register] !== null)) || (p.rebooting && st.register === 0)).map(p => p.id);
      } else {
        /* the cards that change what is in the register before it is turned
         * over -- an Emergency Switch, a Command in Reserve -- act now, so
         * the card that ends up there is the one that sets the priority */
        for (const p of alive(st)) {
          if (p.poweredDown || p.revealed === st.register || !p.options.length) continue;
          const reg = st.register, ci = p.registers[reg];
          const locked = reg >= openRegisters(p.damage) || p.locks[reg] === st.turn;
          const ctx = fire(st, p, "onReveal", { register: reg, card: ci, locked, abort: false, swap: false,
            label: ci === null ? null : KINDS[card(st, ci).kind].label, reserveLabel: Number.isInteger(p.reserve) ? KINDS[card(st, p.reserve).kind].label : null });
          if (ctx.pending) { st.waiting = ctx.ask; return; }
          if (ctx.abort && !locked && ci !== null) {
            if (!p.aborted) { p.aborted = true; log(st, p.name + " hits the emergency switch"); }
            if (!st.deck.length) { st.deck = shuffle(st, st.discard); st.discard = []; }
            if (st.deck.length) {
              st.discard.push(ci);
              p.registers[reg] = st.deck.pop();
              st.events.push({ type: "replaced", player: p.id, register: reg, why: "emergencySwitch" });
              log(st, p.name + "'s register " + (reg + 1) + " is replaced from the deck");
            }
          } else if (ctx.swap && !locked && ci !== null && Number.isInteger(p.reserve)) {
            st.discard.push(ci);
            p.registers[reg] = p.reserve; p.reserve = null;
            st.events.push({ type: "replaced", player: p.id, register: reg, why: "reserve" });
            log(st, p.name + " swaps in the card from reserve");
          }
          p.revealed = reg;
        }
        const qq = [];
        for (const p of alive(st)) {
          if (p.poweredDown) continue;
          const i = programCardOf(st, p, st.register);
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
        if (!isModern(st)) {
          const i = programCardOf(st, p, st.register);
          if (i === null) { st.queue.shift(); continue; }
          const cd = card(st, i);
          const plan = planCard(st, p, cd, false);
          if (plan.pending) { st.waiting = plan.ask; return; }
          st.queue.shift();
          if (i !== p.registers[st.register]) log(st, p.name + " runs " + st.players[p.controlledBy].name + "'s card by remote control");
          playCard(st, C, p, cd, plan);
          continue;
        }
        /* 2016: a robot's activation is three moments. Before its card, the
         * temporary upgrades usable then (p.23: movement upgrades "immediately
         * before or after", the rest "at any time") and the Abort Switch; the
         * card; then the upgrades that act on what the card did. Each moment
         * is safe to re-run: its questions are keyed, the card is played once. */
        if (!st.act || st.act.player !== p.id) st.act = { player: p.id, stage: "before" };
        if (st.act.stage === "before") {
          const t = askTemps(st, C, p, "before");
          if (t) { st.waiting = t; st.waiting._course = C; return; }
          st.act.stage = "card";
        }
        if (st.act.stage === "card") {
          /* Chaos and Carnage: "If your robot is on a randomizer when you would
           * reveal a programming card, discard all cards in the current register
           * and replace them with the top card of your programming deck." */
          /* "When your turn comes, reveal the Haywire" -- the face-down card comes up into the register */
          if (p.haywire[st.register] !== null && st.act.hw === undefined && !st.act.flipped) {
            if (p.registers[st.register] !== null) putAway(st, p, p.registers[st.register], true);   // nothing should be here; a Rewire could not put one on top
            p.registers[st.register] = p.haywire[st.register];
            p.haywire[st.register] = null;
            st.act.flipped = true;
          }
          if (randomizerAt(C, p.c, p.r) && p.registers[st.register] !== null && st.act.hw === undefined) {
            putAway(st, p, p.registers[st.register], true);
            if (p.crab[st.register] !== null) { putAway(st, p, p.crab[st.register], true); p.crab[st.register] = null; }
            p.registers[st.register] = drawOwn(st, p);
            st.events.push({ type: "randomized", player: p.id, register: st.register });
            log(st, p.name + "'s card is randomized");
          }
          /* Master Builder's Overclocked: this register's card is ignored, an earlier register's runs instead */
          let i = p.substitute && p.substitute.register === st.register && st.act.hw === undefined ? p.substitute.card
            : st.act.hw !== undefined ? p.registers[st.register] : replaceInRegister(st, p, st.register);
          if (i !== null && card(st, i).kind === "haywire") {
            const hask = resolveHaywire(st, C, p, i);
            if (hask) { st.waiting = hask; return; }
            st.act.cardKind = "haywire";
            i = null;
          }
          if (i !== null) {
            let cd = card(st, i), again = false;
            if (cd.kind === "again") {
              /* "Repeat the programming in your previous register, as if that
               * card were in this register." A Haywire there is resolved again. */
              const ti = againTarget(st, p, st.register);
              if (ti === null) { log(st, p.name + "'s Again repeats nothing"); i = null; }
              else if (card(st, ti).kind === "haywire") {
                const hask = resolveHaywire(st, C, p, ti);
                if (hask) { st.waiting = hask; return; }
                st.act.cardKind = "haywire"; i = null;
              }
              else { cd = card(st, ti); again = true; }
            }
            /* Chaos and Carnage: a teleporter under a robot revealing a Move card
             * (Move 1-3 and Back Up) throws it 2 further forward than the card,
             * "ignoring all intervening board elements and robots", and does not
             * operate at all when the arrival square is occupied. Off the course
             * is read as an arrival square it cannot reach: the card plays normally. */
            const jumps = { move1: 3, move2: 4, move3: 5, back: 2 };
            if (i !== null && !again && jumps[cd.kind] && teleporterAt(C, p.c, p.r) && p.crab[st.register] === null) {
              const n = jumps[cd.kind];
              const to = [p.c + [0, 1, 0, -1][p.face] * n, p.r + [-1, 0, 1, 0][p.face] * n];
              if (inCourse(C, to[0], to[1]) && !robotAt(st, to[0], to[1])) {
                st.act.cardKind = cd.kind;
                p.pushed = []; p.lastMove = null;
                st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register });
                const from = [p.c, p.r];
                p.c = to[0]; p.r = to[1];
                p.trail = [[p.c, p.r]];
                st.events.push({ type: "teleported", player: p.id, from, to: [p.c, p.r], n });
                log(st, p.name + " teleports " + n + " forward");
                arrived(st, C, p);
                st.act.stage = "after";
              }
            }
            if (i !== null && st.act.stage === "card" && p.crab[st.register] !== null && (cd.kind === "left" || cd.kind === "right") && !again) {
              /* Crab Legs: the Move 1 paired with the rotate becomes a sidestep, and neither card's own effect happens */
              st.act.cardKind = cd.kind;
              p.pushed = []; p.lastMove = null;
              const dir = rot(p.face, cd.kind === "left" ? -1 : 1);
              log(st, p.name + " crab-walks " + DIR_WORDS[dir]);
              st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register });
              if (stepRobot(st, C, p, dir, "card")) p.lastMove = { dir, n: 1 };
            } else if (st.act.stage === "card" && i !== null) {
              const plan = planCard(st, p, cd, again);
              if (plan.pending) { st.waiting = plan.ask; return; }
              st.act.cardKind = again ? null : cd.kind;
              playCard(st, C, p, cd, plan);
            }
          }
          st.act.stage = "after";
        }
        if (st.act.stage === "after" && p.alive) {
          /* the hooks that act on the card just played: Drifting, Power Slide,
           * Piercing Drill's spin, the Modular Chassis swap */
          const actx = fire(st, p, "afterCard", { cardKind: st.act.cardKind || null, pushed: p.pushed || [], forward: 0 });
          if (actx.pending) { st.waiting = actx.ask; return; }
          if (actx.forward > 0 && !st.act.rolled) { st.act.rolled = true; stepRobot(st, C, p, p.face, "upgrade"); }
          /* Magnetic: a neighbour of the square the robot moved from may move with it */
          if (p.lastMove && !st.act.magnets) {
            const mv = p.lastMove;
            const from = [p.c, p.r];
            for (let k = 0; k < mv.n; k++) { const b = stepCell(from[0], from[1], (mv.dir + 2) % 4); from[0] = b[0]; from[1] = b[1]; }
            for (const q of alive(st)) {
              if (q.id === p.id || !q.installed.some(u => u.id === "magnetic")) continue;
              if (Math.abs(q.c - from[0]) + Math.abs(q.r - from[1]) !== 1) continue;
              const mctx = fire(st, q, "onNeighbourMoved", { mover: p, moverName: p.name, register: st.register, follow: false });
              if (mctx.pending) { st.waiting = mctx.ask; return; }
              if (mctx.follow) { log(st, q.name + " is drawn along magnetically"); for (let k = 0; k < mv.n && q.alive; k++) if (!stepRobot(st, C, q, mv.dir, "upgrade")) break; }
            }
            st.act.magnets = true;
          }
          const t = askTemps(st, C, p, "after");
          if (t) { st.waiting = t; st.waiting._course = C; return; }
        }
        st.act = null;
        st.queue.shift();
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
      /* what a card granted for this register alone */
      for (const p of st.players) { p.phasing = 0; p.opposite = null; p.substitute = null; }
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
          if (p.locks[reg] === st.turn) { log(st, p.name + "'s register " + (reg + 1) + " stays locked"); continue; }   // Fire Control's lock holds one turn
          p.locks[reg] = null;
          if (p.registers[reg] !== null) { st.discard.push(p.registers[reg]); p.registers[reg] = null; }
        }
        /* a Command in Reserve not called on goes back with the hand */
        if (Number.isInteger(p.reserve)) { st.discard.push(p.reserve); p.reserve = null; }
      }
      go(st, "cleanup", "endTurn");
    },
    endTurn(st) {
      /* "At the end of a turn, if a virtual robot is on a square all by itself, it then becomes a real robot." */
      for (const p of st.players) {
        if (!p.alive || !p.virtual) continue;
        if (st.players.some(q => q.alive && q.id !== p.id && q.c === p.c && q.r === p.r)) continue;
        p.virtual = false;
        st.events.push({ type: "real", player: p.id });
        log(st, p.name + " is alone on its square and becomes real");
      }
      for (const p of st.players) {
        /* Circuit Breaker: three or more damage at the end of the turn is a forced power down */
        if (p.alive && !p.announceDown && fire(st, p, "onTurnEnd", { powerDown: false }).powerDown) {
          p.announceDown = true;
          log(st, p.name + "'s circuit breaker trips: it powers down next turn");
        }
        p.poweredDown = p.announceDown;
        p.announceDown = false;
        p.siteAsked = false; p.siteChoice = null;
        p.controlledBy = null; p.aborted = false;
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
      /* Memory Transfer: "At the end of each round, you may transfer 1 damage card in your hand to
       * an adjacent robot's discard pile" -- asked first, so the step is safe to re-run */
      for (const p of racing(st)) {
        if (p.transferAsked || !p.alive || !p.installed.some(u => u.id === "memoryTransfer")) continue;
        const dmg = p.hand.filter(i => isDamage(st, i));
        const near = alive(st).filter(q => q.id !== p.id && Math.abs(q.c - p.c) + Math.abs(q.r - p.r) === 1);
        if (!dmg.length || !near.length) { p.transferAsked = true; continue; }
        const key = st.turn + ":memoryTransfer:" + p.id;
        const a = st.answers[key];
        if (a === undefined) {
          ask(st, p, "cardChoice", [0].concat(near.map((_, k) => k + 1)), { key, card: "memoryTransfer",
            prompt: p.name + ", hand a damage card to a neighbour?", labels: ["Keep it"].concat(near.map(q => "Give one to " + q.name)) });
          return;
        }
        if (a > 0 && near[a - 1]) {
          const i = dmg[0];
          p.hand.splice(p.hand.indexOf(i), 1);
          near[a - 1].pile.push(i);
          log(st, p.name + " transfers a damage card to " + near[a - 1].name);
        }
        p.transferAsked = true;
      }
      for (const p of st.players) {
        p.transferAsked = false;
        for (let reg = 0; reg < REGISTERS; reg++) {
          const ci = p.registers[reg];
          if (ci !== null) { putAway(st, p, ci, true); p.registers[reg] = null; }
          if (p.crab[reg] !== null) { putAway(st, p, p.crab[reg], true); p.crab[reg] = null; }
        }
        p.drilled = null; p.pushed = []; p.lastMove = null;
        p.poweredDown = false; p.announceDown = false;
        p.upgradeDone = false; p.bought = false; p.fitted = false; p.shutAsked = false;
        p.laserBonus = -1;
        /* the Haywire's free upgrade: "At end of round, place that card into the upgrade discard pile" */
        if (p.hwInstalled) { uninstallUpgrade(st, p, p.hwInstalled, "loses the round's free"); p.hwInstalled = null; }
      }
      /* face-down Haywires stay where they are; the token passes unless a Haywire held it */
      if (st.priorityHeld) { st.priorityHeld = false; log(st, "the Priority Token stays with " + st.players[st.priority].name); }
      else { st.priority = (st.priority + 1) % st.players.length; log(st, "the Priority Token passes to " + st.players[st.priority].name); }
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

/** The card a robot runs this register: its own, or its controller's under a Remote Control. */
function programCardOf(st, p, reg) {
  if (Number.isInteger(p.controlledBy)) {
    const q = st.players[p.controlledBy];
    if (q && q.registers[reg] !== null && q.registers[reg] !== undefined) return q.registers[reg];
  }
  return p.registers[reg];
}

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

/** Apply an answer to the pending request without advancing; false when refused. For tests that drive step by step. */
export function applyAnswer(st, library, answer) {
  const req = st.waiting;
  if (!req || !isLegal(st, req, answer)) return false;
  delete req._course;
  st.waiting = null;
  REQUESTS[req.kind].apply(st, { ...req, _course: courseOf(st, library) }, answer);
  return true;
}

/**
 * Advance the game until it needs an answer or is over.
 * @param st       the state; mutated in place and returned
 * @param library  Map of board id -> board, for assembling the course
 * @param answer   the reply to `st.waiting`, when there is one
 */
export function step(st, library, answer) {
  st.act = st.act || null;
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
