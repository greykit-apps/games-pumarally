/* Upgrade cards, the 2016 game's shop: forty transcribed (data/upgrades.js),
 * eleven with behaviour. The other twenty-nine are dealt, bought, installed
 * and shown, and do nothing -- their texts are on the cards and their effects
 * are not built. `built` in the data says which, and check-all holds the
 * roster to it.
 *
 * An installed upgrade fires through the same hooks an option card does
 * (options.js: `fire` walks a robot's option cards and its installed
 * upgrades, each against its own table). Read off the 2016 rulebook, pp.4-5
 * and 20-23 (manual1/IMG_1256, IMG_1264, IMG_1265).
 */
import { opposite, step as stepCell } from "../../editor/lib/dir.js";
import UPGRADES_DATA from "../data/upgrades.js";
import { log } from "./state.js";
import { INSTALL_LIMIT, UPGRADE_DRAW_COST, MAX_ENERGY } from "./cards.js";

const BEHAVIOUR = {
  /* "Move 1 cards in your registers may be treated as Move 0. The decision
   * to brake is made after revealing a Move 1 card, but before you would
   * activate the programming card." */
  brakes: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || ctx.dist !== 1 || ctx.again) return;
        const pick = ctx.pick("brakes", "Treat this Move 1 as a Move 0?", ["Move 1", "Brake"]);
        if (pick === 1) ctx.dist = 0;
      }
    }
  },
  /* "When your robot would take damage from lasers and/or other weapons, you
   * may pay 1 Energy to take no laser/weapon damage during this register."
   * Paid without asking: a robot with the Energy always prefers not to be
   * shot, and the volley is not a place a question can wait. Once per
   * register, whatever the number of beams. */
  deflectorShield: {
    init: () => ({ turn: -1, register: -1 }),
    hooks: {
      onDamage(ctx, cst) {
        if (ctx.amount <= 0 || ctx.source !== "laser") return;
        const p = ctx.player, st = ctx.st;
        if (cst.turn !== st.turn || cst.register !== st.register) {
          if ((p.energy || 0) < 1) return;
          p.energy -= 1;
          cst.turn = st.turn; cst.register = st.register;
          st.events.push({ type: "energy", player: p.id, amount: -1, energy: p.energy, why: "deflector" });
          log(st, p.name + " spends an Energy on its deflector shield");
        }
        ctx.absorbed += ctx.amount; ctx.amount = 0;
      }
    }
  },
  /* "Your robot's main laser deals 1 additional damage to robots." */
  doubleBarrelLaser: {
    hooks: { laserShots(ctx) { for (const s of ctx.shots) if (s.main) s.damage += 1; } }
  },
  /* "Draw 1 additional programming card at the start of each Programming Phase." */
  flashDrive: {
    hooks: { modifyDealt(ctx) { ctx.count += 1; } }
  },
  /* "After performing a U-Turn, your robot fires its main laser in all 4
   * directions during this register's Robot Weapon Activation." */
  laserKata: {
    hooks: {
      laserShots(ctx) {
        if (ctx.cardKind !== "uturn") return;
        for (let d = 0; d < 4; d++) if (d !== ctx.player.face) ctx.shots.push({ main: true, dir: d, damage: 1, pierce: 0 });
      }
    }
  },
  /* "Instead of firing your robot's main laser, you may fire Pressor Beam. If
   * you do, push the target robot 1 space away from your robot." */
  pressorBeam: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0) return;
        const pick = ctx.pick("pressorBeam", "Fire the Pressor Beam and shove " + ctx.targetName + " away instead of the laser?", ["Main laser", "Pressor Beam"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "push", dir: ctx.shotDir };
      }
    }
  },
  /* "Your robot's main laser may shoot through any number of walls and/or
   * robots. Each robot hit this way takes 1 damage." */
  railGun: {
    hooks: { laserShots(ctx) { for (const s of ctx.shots) if (s.main) { s.pierce = 99; s.through = true; } } }
  },
  /* "During your Programming Card Activation, if your robot pushes (or
   * attempts to push) an adjacent robot, that robot takes 1 damage." */
  rammingGear: {
    hooks: { onPush(ctx) { if (ctx.cause === "card") ctx.pushDamage += 1; } }
  },
  /* "Your robot has a rear-firing laser in addition to its main laser. Both
   * fire simultaneously." Not the main laser, so no double barrel and no rail. */
  rearLaser: {
    hooks: { laserShots(ctx) { ctx.shots.push({ main: false, dir: opposite(ctx.player.face), damage: 1, pierce: 0 }); } }
  },
  /* "Instead of firing your robot's main laser, you may fire Scrambler. If you
   * do, replace the target's next register card with the top card from their
   * programming deck. Cannot be used during Register 5." */
  scrambler: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.lastRegister) return;
        const pick = ctx.pick("scrambler", "Fire the Scrambler and replace " + ctx.targetName + "'s next card instead of the laser?", ["Main laser", "Scrambler"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "scramble" };
      }
    }
  },
  /* "Instead of firing your robot's main laser, you may fire Tractor Beam. If
   * you do, pull the target robot 1 space towards your robot. Cannot be used
   * on adjacent robots." */
  tractorBeam: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.distance <= 1) return;
        const pick = ctx.pick("tractorBeam", "Fire the Tractor Beam and pull " + ctx.targetName + " closer instead of the laser?", ["Main laser", "Tractor Beam"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "push", dir: opposite(ctx.shotDir) };
      }
    }
  }
};

/** id -> { id, name, text, cost, type, built, hooks, init?, botPrefers? } for all forty. */
export const UPGRADE_DEFS = {};
for (const c of UPGRADES_DATA.cards) {
  const b = BEHAVIOUR[c.id];
  if (c.built && !b) throw new Error("upgrade " + c.id + " is marked built and has no behaviour");
  if (!c.built && b) throw new Error("upgrade " + c.id + " has behaviour and is not marked built");
  UPGRADE_DEFS[c.id] = { id: c.id, name: c.name, text: c.text, cost: c.cost, type: c.type, built: !!c.built,
    hooks: b ? b.hooks : {}, init: b ? b.init : undefined, botPrefers: b ? b.botPrefers : undefined };
}
export const UPGRADE_IDS = Object.keys(UPGRADE_DEFS);
export const UPGRADE_ROSTER = UPGRADES_DATA.roster;

/** A card as installed: its id and a fresh copy of whatever state it keeps. */
export function newInstalled(id) {
  const def = UPGRADE_DEFS[id];
  return { id, st: def && def.init ? def.init() : {} };
}

/** The top of the upgrade deck, reshuffling the discard when it runs out; null when both are empty. */
export function drawUpgrade(st) {
  if (!st.upgradeDeck.length) {
    st.upgradeDeck = st.upgradeDiscard.slice();
    st.upgradeDiscard = [];
    for (let i = st.upgradeDeck.length - 1; i > 0; i--) {
      st.rng = (Math.imul(st.rng | 0, 1664525) + 1013904223) | 0;
      const j = ((st.rng >>> 8) & 0xffffff) % (i + 1);
      [st.upgradeDeck[i], st.upgradeDeck[j]] = [st.upgradeDeck[j], st.upgradeDeck[i]];
    }
    if (st.upgradeDeck.length) log(st, "the upgrade deck is reshuffled");
  }
  if (!st.upgradeDeck.length) return null;
  return st.upgradeDeck.pop();
}

/** "Once during each Upgrade Phase, you may pay 1 Energy to draw 1 new upgrade card." */
export function buyUpgrade(st, p) {
  if (p.energy < UPGRADE_DRAW_COST) return false;
  const id = drawUpgrade(st);
  if (id === null) return false;
  p.energy -= UPGRADE_DRAW_COST;
  p.shelf.push(id);
  st.events.push({ type: "energy", player: p.id, amount: -UPGRADE_DRAW_COST, energy: p.energy, why: "upgrade" });
  st.events.push({ type: "upgrade", player: p.id, card: id, how: "bought" });
  log(st, p.name + " pays an Energy for an upgrade card");
  return true;
}

export function installedOfType(p, type) {
  return p.installed.filter(u => UPGRADE_DEFS[u.id].type === type).length;
}

/** Could `p` install this shelf card now: on the shelf, affordable, and a slot free for its type? */
export function canInstall(p, id) {
  const def = UPGRADE_DEFS[id];
  if (!def || p.shelf.indexOf(id) < 0) return false;
  if (p.energy < def.cost) return false;
  return installedOfType(p, def.type) < INSTALL_LIMIT[def.type];
}

/** Pay the printed cost and put the card on the mat. */
export function installUpgrade(st, p, id) {
  if (!canInstall(p, id)) return false;
  const def = UPGRADE_DEFS[id];
  p.shelf.splice(p.shelf.indexOf(id), 1);
  p.energy -= def.cost;
  p.installed.push(newInstalled(id));
  st.events.push({ type: "energy", player: p.id, amount: -def.cost, energy: p.energy, why: "install" });
  st.events.push({ type: "upgrade", player: p.id, card: id, how: "installed" });
  log(st, p.name + " installs " + def.name + (def.built ? "" : " (its effect is not built)"));
  return true;
}

/** "Uninstall any number of upgrades and discard them to the upgrade discard pile." Nothing comes back. */
export function uninstallUpgrade(st, p, id, how) {
  const i = p.installed.findIndex(u => u.id === id);
  if (i < 0) return false;
  p.installed.splice(i, 1);
  st.upgradeDiscard.push(id);
  st.events.push({ type: "upgrade", player: p.id, card: id, how: how || "uninstalled" });
  log(st, p.name + " " + (how || "uninstalls") + " " + UPGRADE_DEFS[id].name);
  return true;
}

/** Energy, capped at the track's ten. Returns what was actually gained. */
export function gainEnergy(st, p, n, why) {
  const got = Math.max(0, Math.min(n, MAX_ENERGY - p.energy));
  if (got <= 0) return 0;
  p.energy += got;
  st.events.push({ type: "energy", player: p.id, amount: got, energy: p.energy, why });
  return got;
}

/** The bay's neighbour a step away, for the reboot substitute's shove. */
export { stepCell };
