/* Option cards: all twenty-seven of the two printings (sixteen English,
 * eleven more from the AMIGO box), each a data row bound to one of the hooks
 * below. Nothing outside this table may intercept the rules; a card that
 * needs a new moment gets a new hook here, not a branch in the register loop.
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
import { card, KINDS, openRegisters } from "./cards.js";
import { log } from "./state.js";
import { UPGRADE_DEFS, uninstallUpgrade } from "./upgrades.js";

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
  "onRespawn",          // you are coming back from the scrap heap
  "onProgrammed",       // your registers are set and the rest of the hand is in front of you
  "onReveal",           // a register's card is about to be turned over
  "onTurnEnd"           // the turn is over and the damage is counted
];

const DIR_NAMES = ["north", "east", "south", "west"];

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
  },

  /* --- the AMIGO box's eleven (manual1/IMG_1334-1342) ------------------------ */

  /* "Du kannst wählen, ob dein Roboter ein oder zwei Felder rückwärts geht,
   * wenn du den Befehl 'gehe ein Feld zurück' programmiert hast." */
  reverseGear: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || ctx.dist !== -1) return;
        const pick = ctx.pick("reverseGear", "Back up 1, or throw the reverse gear and back up 2?", ["Back up 1", "Back up 2"]);
        if (pick === 1) ctx.dist = -2;
      }
    }
  },
  /* "... drei oder vier Felder vorwärts ... 'gehe drei Felder vorwärts'" */
  fourthGear: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || ctx.dist !== 3) return;
        const pick = ctx.pick("fourthGear", "Move 3, or shift into fourth and move 4?", ["Move 3", "Move 4"]);
        if (pick === 1) ctx.dist = 4;
      }
    }
  },
  /* "Die Fernsteuerung überträgt das Programm deines Roboters auf einen
   * anderen Roboter, wenn er maximal 6 Felder in gerader Richtung vor deinem
   * Roboter steht." An optional weapon (p.36-37: used when the main laser
   * could fire, instead of it; the Turret names it among them), so it is
   * offered on a main-laser hit within six squares. The transmitted program
   * is read as the rest of this turn: from the next register on, the target
   * runs the card in the controller's register instead of its own. */
  remoteControl: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.replaceWith || ctx.distance > 6) return;
        const pick = ctx.pick("remoteControl", "Transmit your program to " + ctx.targetName + " instead of shooting it? It runs your cards for the rest of the turn.", ["Main laser", "Remote control"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "radio" };
      }
    }
  },
  /* "... der ihn in jedem Programmschritt vor einem Schaden aus einer
   * bestimmten Richtung schützt." The card names a direction without saying
   * which; read as the front, the way the robot faces, so a shot travelling
   * against its facing loses a point. Once a register. */
  shield: {
    init: () => ({ turn: -1, register: -1 }),
    hooks: {
      onDamage(ctx, cst) {
        if (ctx.amount <= 0 || ctx.source !== "laser" || ctx.dir === undefined || ctx.dir === null) return;
        if (ctx.dir !== opposite(ctx.player.face)) return;
        const st = ctx.st;
        if (cst.turn === st.turn && cst.register === st.register) return;
        cst.turn = st.turn; cst.register = st.register;
        ctx.amount -= 1; ctx.absorbed += 1;
      }
    }
  },
  /* "Der Turbo-Blaster fügt dem getroffenen Roboter einen Schaden zu und
   * schiebt ihn zusätzlich ein Feld in Schussrichtung weiter. Der Turbo-
   * Blaster kann nur fünf Mal benutzt werden." An optional weapon. */
  turboBlaster: {
    init: () => ({ charges: 5 }),
    botPrefers: 1,
    hooks: {
      onLaserHit(ctx, cst) {
        if (ctx.damage <= 0 || ctx.replaceWith || cst.charges <= 0) return;
        const pick = ctx.pick("turboBlaster", "Fire the Turbo Blaster at " + ctx.targetName + " instead of the laser? One damage and a shove; " + cst.charges + (cst.charges === 1 ? " shot" : " shots") + " left.", ["Main laser", "Turbo Blaster"]);
        if (pick !== 1) return;
        cst.charges -= 1;
        ctx.damage = 0; ctx.replaceWith = { kind: "blast", dir: ctx.shotDir, damage: 1, absorb: true };
        if (cst.charges <= 0) ctx.discard();
      }
    }
  },
  /* "Nachdem die Befehlsfolge des Programms programmiert wurde, kann ein 6.
   * Befehl auf diese Karte abgelegt werden und bei Bedarf einen Befehl aus
   * dem laufenden Programm ersetzen." The swap is offered as each register's
   * card is about to be revealed, so the card swapped in sets the priority.
   * A locked register keeps its card; the reserve is discarded unused at the
   * end of the turn. */
  commandInReserve: {
    botPrefers: 0,
    hooks: {
      onProgrammed(ctx) {
        if (!ctx.hand.length || ctx.player.reserve !== null) return;
        const pick = ctx.pick("commandInReserve", "Put a card in reserve? It can replace any register's card as it comes up.", ["None"].concat(ctx.hand));
        if (pick > 0) ctx.reserve = pick - 1;
      },
      onReveal(ctx) {
        if (ctx.player.reserve === null || ctx.locked || ctx.card === null || ctx.abort) return;
        const pick = ctx.pick("commandInReserve", "Register " + (ctx.register + 1) + ": reveal your " + ctx.label + ", or swap in the " + ctx.reserveLabel + " in reserve?", ["Reveal " + ctx.label, "Swap in " + ctx.reserveLabel]);
        if (pick === 1) ctx.swap = true;
      }
    }
  },
  /* "Jedes Mal wenn du am Ende einer Runde drei oder mehr Schadenspunkte
   * besitzt, musst du deinen Roboter sofort für die folgende Runde
   * abschalten." */
  circuitBreaker: {
    hooks: { onTurnEnd(ctx) { if (ctx.player.damage >= 3) ctx.powerDown = true; } }
  },
  /* "Statt eine Karte aus dem Programm aufzudecken, kannst du sie durch die
   * oberste Karte vom Programmierkartenstapel ersetzen. Ist der Notschalter
   * aktiviert, werden weitere Karten ersetzt." Locked registers keep their
   * cards; the switch lasts the turn. */
  emergencySwitch: {
    botPrefers: 0,
    hooks: {
      onReveal(ctx) {
        if (ctx.player.aborted) { ctx.abort = true; return; }
        if (ctx.locked || ctx.card === null) return;
        const pick = ctx.pick("emergencySwitch", "Register " + (ctx.register + 1) + ": reveal your " + ctx.label + ", or hit the emergency switch and replace it, and every card after it this turn, with the top of the deck?", ["Reveal " + ctx.label, "Emergency switch"]);
        if (pick === 1) ctx.abort = true;
      }
    }
  },
  /* "Wenn du einem Roboter einen Schaden zufügst, musst du bestimmen, ob du
   * dessen Besitzer eine bestimmte Programmierkarte blockierst, oder eine
   * Optionskarte aus dessen Besitz zerstörst." p.36 lists it with the extra
   * weapons that fire alongside the main laser, so it rides on a main-laser
   * hit and lands with the damage. A blocked card stays in its register
   * through the next turn, as a damage lock would hold it. */
  fireControl: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.replaceWith) return;
        const t = ctx.target, st = ctx.st;
        const choices = [], labels = [];
        const open = openRegisters(t.damage);
        for (let reg = 0; reg < open; reg++) {
          if (t.registers[reg] === null || (t.locks && t.locks[reg] === st.turn)) continue;
          choices.push({ lock: reg }); labels.push("Lock its register " + (reg + 1));
        }
        for (const o of t.options) { choices.push({ destroy: o.id }); labels.push("Destroy its " + OPTION_DEFS[o.id].name); }
        if (!choices.length) return;
        const pick = ctx.pick("fireControl", "Fire Control: your shot at " + ctx.targetName + " also locks one of its registers for next turn, or destroys one of its option cards. Which?", labels);
        if (pick === null) return;
        ctx.fireControl = choices[pick];
      }
    }
  },
  /* "Nach der Programmierung kannst du von den nicht benutzen Karten eine auf
   * das Schwungrad legen. Sie kann in der nächsten Runde zusätzlich zur
   * Programmierung verwendet werden." It skips the reshuffle and joins the
   * hand dealt next turn. */
  flywheel: {
      botPrefers: 1,
    hooks: {
      onProgrammed(ctx) {
        if (!ctx.hand.length || ctx.player.flywheel !== null) return;
        const pick = ctx.pick("flywheel", "Spin a card onto the flywheel for next turn's hand?", ["None"].concat(ctx.hand));
        if (pick > 0) ctx.flywheel = pick - 1;
      }
    }
  },
  /* "Die Drehscheibe erlaubt es deinem Roboter, Laser, Turbo-Blaster,
   * Hochdruckstrahl, Fernsteuerung, Zufallsgenerator oder Traktorstrahl in
   * alle vier Richtungen zu benutzen." The main shot, and so every optional
   * weapon that rides on it, may be aimed any way: asked only when a robot is
   * in line somewhere other than straight ahead. */
  turret: {
    botPrefers: 0,
    hooks: {
      laserShots(ctx) {
        const main = ctx.shots.find(s => s.main);
        if (!main || !ctx.sees) return;
        const p = ctx.player;
        const dirs = [0, 1, 2, 3].filter(d => d !== p.face && ctx.sees(d));
        if (!dirs.length) return;
        const opts = dirs.concat([p.face]);
        const labels = opts.map(d => (d === p.face ? "Straight ahead" : "Turn " + DIR_NAMES[d]) + (ctx.sees(d) ? " at " + ctx.sees(d).name : ", at nothing"));
        const pick = ctx.pick("turret", "Where does the turret aim this register?", labels);
        if (pick === null) return;
        main.dir = opts[pick];
      }
    }
  }
};

/** id -> { id, name, text, hooks, init?, botPrefers? }, the data joined to the behaviour. */
export const OPTION_DEFS = {};
for (const c of OPTIONS_DATA.cards) {
  const b = BEHAVIOUR[c.id];
  if (!b) throw new Error("option card " + c.id + " is transcribed but has no behaviour");
  OPTION_DEFS[c.id] = { id: c.id, name: c.name, text: c.text, de: c.de || null, cat: c.cat || null, asks: !!c.asks, hooks: b.hooks, init: b.init, botPrefers: b.botPrefers };
}
for (const id of Object.keys(BEHAVIOUR)) if (!OPTION_DEFS[id]) throw new Error("option behaviour " + id + " has no card");
export const OPTION_IDS = Object.keys(OPTION_DEFS);
export const OPTION_ROSTER = { printed: OPTIONS_DATA.printed, transcribed: OPTIONS_DATA.transcribed };

/** The key an answer is filed under: this turn, this register, this hook, this card, this player. */
export function choiceKey(st, player, hook, optionId, tag) {
  return st.turn + ":" + st.register + ":" + hook + ":" + optionId + ":" + player.id + ":" + (tag || "");
}

/**
 * Fire one hook for every option card the player holds and every upgrade on
 * its mat, each against its own table. Returns the ctx; `ctx.pending` is
 * true when a card asked something nobody has answered yet, and `ctx.ask`
 * then holds the request for the step to raise.
 */
export function fire(st, player, hook, ctx) {
  ctx = ctx || {};
  ctx.player = player;
  ctx.st = st;
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
  ctx.discard = () => {
    if (!current) return;
    if (current.table === OPTION_DEFS) discardOption(st, player, current.held.id, "burns out");
    else uninstallUpgrade(st, player, current.held.id, "burns out");
  };

  /* a snapshot of each list: a hook may discard its own card mid-loop */
  const lists = [[player.options, OPTION_DEFS], [player.installed || [], UPGRADE_DEFS]];
  for (const [list, table] of lists) {
    for (const h of list.slice()) {
      if (list.indexOf(h) < 0) continue;
      const def = table[h.id];
      if (!def || !def.hooks[hook]) continue;
      if (!h.st) h.st = def.init ? def.init() : {};
      current = { held: h, table };
      def.hooks[hook](ctx, h.st, h);
      current = null;
    }
  }
  return ctx;
}

/** A card as held: its id and a fresh copy of whatever state it keeps. The ONLY way a hand gets a card. */
export function newHeld(id) {
  const def = OPTION_DEFS[id];
  return { id, st: def && def.init ? def.init() : {} };
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
  p.options.push(newHeld(id));
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
  /* a program card lying on the option card goes back to the table with it */
  if (gone.id === "commandInReserve" && Number.isInteger(p.reserve)) { st.discard.push(p.reserve); p.reserve = null; }
  if (gone.id === "flywheel" && Number.isInteger(p.flywheel)) { st.discard.push(p.flywheel); p.flywheel = null; }
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
  const def = OPTION_DEFS[req.card] || UPGRADE_DEFS[req.card];
  let prefer = def && def.botPrefers !== undefined ? def.botPrefers : 0;
  if (prefer >= req.options.length) prefer = req.options.length - 1;
  return prefer;
}
