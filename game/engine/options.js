/* Option cards: sixteen of the twenty-six printed, each a data row bound to
 * one of ten hooks. Nothing outside this table may intercept the rules; a
 * card that needs a new moment gets a new hook here, not a branch in the
 * register loop.
 *
 * Three rules keep it honest, carried over from the old engine because they
 * were right there:
 *
 *   - Hooks mutate a ctx request object, never the state. The rule that fired
 *     the hook applies the ctx, so determinism and replay survive.
 *   - Hooks never prompt. A "you may" card calls ctx.pick(); if the answer is
 *     not in st.answers yet the ctx is marked pending and the STEP that fired
 *     it asks through the same request door as everything else, then re-runs
 *     and finds the answer waiting. That is why sixteen optional cards cost
 *     one request kind, and why a save written mid-question reloads.
 *   - Hooks never touch the screen, because the simulations run them.
 *
 * check-all asserts the binding both ways: no card names a hook that does
 * not exist, and no hook is declared that no card uses.
 */
import { opposite } from "../../editor/lib/dir.js";
import OPTIONS_DATA from "../data/options.js";
import { log } from "./state.js";

export const HOOKS = [
  "modifyDealt",        // how many program cards you are dealt
  "onDealt",            // after the deal, before programming
  "modifyMove",         // a card's movement, before it happens
  "onPush",             // you shoved somebody
  "onBoardElement",     // a gear or a curve is about to turn you
  "laserShots",         // what your robot fires this register
  "onLaserHit",         // a shot of yours connected
  "onDamage",           // damage is about to land on you
  "onTouchCheckpoint",  // how far you can reach for a flag or wrench
  "onRespawn"           // you are coming back from the scrap heap
];

/* Crash and Burn caps the option hand at three: draw a fourth and one goes
 * face up on the discard immediately. */
export const OPTION_LIMIT = 3;

/* The hooks, keyed by card id. Text and names live in data/options.js; this is
 * only what each card DOES, ported from the old engine's implementations. */
const BEHAVIOUR = {
  ablativeCoat: {
    init: () => ({ charges: 3 }),
    hooks: {
      onDamage(ctx, cst) {
        if (cst.charges <= 0 || ctx.amount <= 0) return;
        const take = Math.min(cst.charges, ctx.amount);
        cst.charges -= take; ctx.amount -= take; ctx.absorbed += take;
        if (cst.charges <= 0) ctx.discard();
      }
    }
  },
  brakes: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || ctx.dist !== 1) return;
        const pick = ctx.pick("brakes", "Hold still instead of moving 1?", ["Move 1", "Brake"]);
        if (pick === 1) ctx.dist = 0;
      }
    }
  },
  crabLegs: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || ctx.dist !== 1) return;
        const pick = ctx.pick("crabLegs", "Sidestep instead of moving forward?", ["Forward", "Sidestep left", "Sidestep right"]);
        if (pick === 1) ctx.lateral = -1;
        else if (pick === 2) ctx.lateral = 1;
      }
    }
  },
  doubleBarreledLaser: {
    hooks: { laserShots(ctx) { for (const s of ctx.shots) if (s.main) s.damage += 1; } }
  },
  extraMemory: {
    hooks: { modifyDealt(ctx) { ctx.count += 1; } }
  },
  gyroscopicStabilizer: {
    hooks: { onBoardElement(ctx) { if (ctx.kind === "gear") ctx.veto = true; } }
  },
  highPowerLaser: {
    hooks: { laserShots(ctx) { for (const s of ctx.shots) if (s.main) s.pierce = 1; } }
  },
  mechanicalArm: {
    hooks: { onTouchCheckpoint(ctx) { ctx.reach = Math.max(ctx.reach, 1); } }
  },
  powerDownShield: {
    hooks: {
      onDamage(ctx) {
        if (ctx.source !== "laser" || !ctx.player.poweredDown) return;
        ctx.absorbed += ctx.amount; ctx.amount = 0;
      }
    }
  },
  pressorBeam: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0) return;
        const pick = ctx.pick("pressorBeam", "Shove " + ctx.targetName + " away instead of damaging it?", ["Damage", "Shove away"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "push", dir: ctx.shotDir };
      }
    }
  },
  rammingGear: {
    hooks: { onPush(ctx) { ctx.pushDamage += 1; } }
  },
  rearFiringLaser: {
    hooks: { laserShots(ctx) { ctx.shots.push({ main: false, dir: opposite(ctx.player.face), damage: 1, pierce: 0 }); } }
  },
  recompile: {
    botPrefers: 0,
    hooks: {
      onDealt(ctx) {
        const pick = ctx.pick("recompile", "Throw this hand away and draw a fresh one?", ["Keep", "Recompile"]);
        if (pick === 1) ctx.redraw = true;
      }
    }
  },
  scrambler: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0) return;
        const pick = ctx.pick("scrambler", "Scramble " + ctx.targetName + "'s next register instead of damaging it?", ["Damage", "Scramble"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "scramble" };
      }
    }
  },
  superiorArchive: {
    hooks: { onRespawn(ctx) { ctx.damage = 1; } }
  },
  tractorBeam: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0) return;
        const pick = ctx.pick("tractorBeam", "Pull " + ctx.targetName + " toward you instead of damaging it?", ["Damage", "Pull closer"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "push", dir: opposite(ctx.shotDir) };
      }
    }
  }
};

/** id -> { id, name, text, hooks, init?, botPrefers? }, the data joined to the behaviour. */
export const OPTION_DEFS = {};
for (const c of OPTIONS_DATA.cards) {
  const b = BEHAVIOUR[c.id];
  if (!b) throw new Error("option card " + c.id + " is transcribed but has no behaviour");
  OPTION_DEFS[c.id] = { id: c.id, name: c.name, text: c.text, hooks: b.hooks, init: b.init, botPrefers: b.botPrefers };
}
for (const id of Object.keys(BEHAVIOUR)) if (!OPTION_DEFS[id]) throw new Error("option behaviour " + id + " has no card");
export const OPTION_IDS = Object.keys(OPTION_DEFS);
export const OPTION_ROSTER = { printed: OPTIONS_DATA.printed, transcribed: OPTIONS_DATA.transcribed };

/** The key an answer is filed under: this turn, this register, this hook, this card, this player. */
export function choiceKey(st, player, hook, optionId, tag) {
  return st.turn + ":" + st.register + ":" + hook + ":" + optionId + ":" + player.id + ":" + (tag || "");
}

/**
 * Fire one hook for every option card the player holds. Returns the ctx;
 * `ctx.pending` is true when a card asked something nobody has answered yet,
 * and `ctx.ask` then holds the request for the step to raise.
 */
export function fire(st, player, hook, ctx) {
  ctx = ctx || {};
  ctx.player = player;
  ctx.pending = false;
  ctx.ask = null;
  let current = null;

  ctx.pick = (optionId, prompt, labels, tag) => {
    const key = choiceKey(st, player, hook, optionId, tag);
    const have = st.answers[key];
    if (have === undefined) {
      if (!ctx.pending) {
        ctx.pending = true;
        ctx.ask = { player: player.id, kind: "cardChoice", key, card: optionId, prompt, labels, options: labels.map((_, i) => i) };
      }
      return null;
    }
    if (have === "used") return 0;             // applied on an earlier run; never twice
    st.answers[key] = "used";
    return have;
  };
  ctx.discard = () => { if (current) discardOption(st, player, current.id, "burns out"); };

  /* a snapshot: a hook may discard its own card mid-loop */
  for (const h of player.options.slice()) {
    if (player.options.indexOf(h) < 0) continue;
    const def = OPTION_DEFS[h.id];
    if (!def || !def.hooks[hook]) continue;
    if (!h.st) h.st = def.init ? def.init() : {};
    current = h;
    def.hooks[hook](ctx, h.st, h);
    current = null;
  }
  return ctx;
}

export function drawOption(st, p) {
  if (!st.optionDeck.length) {
    st.optionDeck = st.optionDiscard.slice();
    st.optionDiscard = [];
    /* reshuffled from the discard by the game's generator, so replays hold */
    for (let i = st.optionDeck.length - 1; i > 0; i--) {
      st.rng = (Math.imul(st.rng | 0, 1664525) + 1013904223) | 0;
      const j = ((st.rng >>> 8) & 0xffffff) % (i + 1);
      [st.optionDeck[i], st.optionDeck[j]] = [st.optionDeck[j], st.optionDeck[i]];
    }
  }
  if (!st.optionDeck.length) return null;
  const id = st.optionDeck.pop();
  const def = OPTION_DEFS[id];
  p.options.push({ id, st: def.init ? def.init() : {} });
  st.events.push({ type: "option", player: p.id, card: id, how: "gained" });
  log(st, p.name + " picks up " + def.name);
  return id;
}

export function discardOption(st, p, id, how) {
  const i = p.options.findIndex(o => o.id === id);
  if (i < 0) return false;
  dropOptionAt(st, p, i, how);
  return true;
}

export function dropOptionAt(st, p, i, how) {
  if (i < 0 || i >= p.options.length) i = p.options.length - 1;
  const gone = p.options.splice(i, 1)[0];
  st.optionDiscard.push(gone.id);
  st.events.push({ type: "option", player: p.id, card: gone.id, how: how || "lost" });
  log(st, p.name + " " + (how || "gives up") + " " + OPTION_DEFS[gone.id].name);
}

/** Which card a bot gives up: anything that acts on coming back is kept until nothing else is left. */
export function botTrimPick(p) {
  for (let i = p.options.length - 1; i >= 0; i--) {
    const def = OPTION_DEFS[p.options[i].id];
    if (def && def.hooks.onRespawn) continue;
    return i;
  }
  return p.options.length - 1;
}

/** A bot's answer to a card's question: the card's own preference, else the first option. */
export function botCardPick(req) {
  const def = OPTION_DEFS[req.card];
  let prefer = def && def.botPrefers !== undefined ? def.botPrefers : 0;
  if (prefer >= req.options.length) prefer = req.options.length - 1;
  return prefer;
}
