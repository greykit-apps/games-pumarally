/* Upgrade cards, the 2016 game's shop: forty transcribed (data/upgrades.js),
 * eleven with behaviour. The other twenty-nine are dealt, bought, installed
 * and shown, and do nothing -- their texts are on the cards and their effects
 * are not built. `built` in the data says which, and check-all holds the
 * roster to it.
 *
 * An installed upgrade fires through the same hooks an option card does
 * (options.js: `fire` walks a robot's option cards and its installed
 * upgrades, each against its own table). Read off the 2016 rulebook, pp.4-5
 * and 20-23.
 */
import { opposite, step as stepCell, rot } from "../../editor/lib/dir.js";
import UPGRADES_DATA from "../data/upgrades.js";
import { log, alive } from "./state.js";
import { asksWhere } from "./asks.js";
import { INSTALL_LIMIT, UPGRADE_DRAW_COST, MAX_ENERGY, card, isDamage } from "./cards.js";
import { inGrid, isHole, wallBlocks, teleporterAt } from "./course.js";

const DIRS = ["North", "East", "South", "West"];

const BEHAVIOUR = {
  /* --- permanent, pp.21-22 -------------------------------------------------- */

  /* "When you reveal SPAM in Register 1, 2, or 3, gain 1 Energy. The card that
   * replaces the SPAM enters your register face up, so drawing another SPAM
   * does not trigger this effect again." */
  chaosTheory: {
    hooks: { onSpam(ctx) { if (ctx.register <= 2 && ctx.first) ctx.energy += 1; } }
  },
  /* "You may place a Move 1 card in the same register as a Rotate Left or
   * Rotate Right card, and during that register your robot will move 1 space
   * to the left or right, respectively, without rotating." The pairing is the
   * programming request's (an entry of two cards); this is the movement. */
  crabLegs: {
    hooks: { modifyMove(ctx) { if (ctx.kind === "crab") ctx.allowed = true; } }
  },
  /* "After resolving a Rotate Left card, you may move 1 space forward." */
  drifting: {
    on: ["left"],
    botPrefers: 0,
    hooks: {
      afterCard(ctx) {
        if (ctx.cardKind !== "left") return;
        if (ctx.pick("drifting", "Drift one square forward after the rotate?", ["Stay", "Drift forward"]) === 1) ctx.forward += 1;
      }
    }
  },
  /* "After your robot takes damage from a board laser, you may move 1 space forward or backward." */
  energyConversion: {
    botPrefers: 0,
    hooks: {
      afterBoardLaser(ctx) {
        const pick = ctx.pick("energyConversion", "Convert the board laser's hit into a move?", ["Stay", "Forward one", "Back one"]);
        if (pick === 1) ctx.move = 1; else if (pick === 2) ctx.move = -1;
      }
    }
  },
  /* "You do not draw any damage cards when Rebooting after falling into a pit." Not the edge. */
  firewall: {
    hooks: { onReboot(ctx) { if (ctx.how === "into a pit") ctx.cards = 0; } }
  },
  /* "Your robot can pass over pits during your Programming Card Activation,
   * but falls in if it ends its move on one. Board edges are not pits." */
  hoverUnit: {
    hooks: { modifyMove(ctx) { if (ctx.kind === "hover") ctx.hover = true; } }
  },
  /* "At the end of the Programming Phase, you may place any number of
   * non-damage cards from your hand onto this card. At the start of the
   * Upgrade Phase, add all cards on this card to your hand." The parking is
   * the machine's `stack` request; the cards live in `p.parked`. */
  memoryCards: {
    hooks: { onLeftovers(ctx) { ctx.park = true; } }
  },
  /* "Instead of firing your robot's main laser, you may pay 1 Energy to fire
   * Mini Howitzer. If you do, deal 2 damage to the target robot, then push it
   * 1 space in the direction of fire. If you have no Energy, you cannot." */
  miniHowitzer: {
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.player.energy < 1) return;
        const pick = ctx.pick("miniHowitzer", "Pay an Energy to fire the Mini Howitzer at " + ctx.targetName + " instead of the laser?", ["Main laser", "Mini Howitzer (1 Energy)"]);
        if (pick !== 1) return;
        const p = ctx.player, st = ctx.st;
        p.energy -= 1;
        st.events.push({ type: "energy", player: p.id, amount: -1, energy: p.energy, why: "howitzer" });
        ctx.damage = 0; ctx.replaceWith = { kind: "blast", dir: ctx.shotDir, damage: 2 };
      }
    }
  },
  /* "After your robot pushes another robot during your Programming Card
   * Activation, you may give that player this card, and take one of their
   * installed upgrades. Both are immediately installed and active." */
  modularChassis: {
    botPrefers: 0,
    hooks: {
      afterCard(ctx) {
        const st = ctx.st, p = ctx.player;
        for (const id of ctx.pushed) {
          const q = st.players[id];
          const theirs = q.installed.filter(u => u.id !== "modularChassis");
          if (!theirs.length) continue;
          const labels = ["Keep it"].concat(theirs.map(u => "Take " + UPGRADE_DEFS[u.id].name));
          const pick = ctx.pick("modularChassis", "Give " + q.name + " the Modular Chassis and take one of its upgrades?", labels, String(id));
          if (pick === null || pick === 0) continue;
          const taken = theirs[pick - 1];
          const mine = p.installed.findIndex(u => u.id === "modularChassis");
          if (mine < 0) return;
          q.installed.splice(q.installed.indexOf(taken), 1);
          const chassis = p.installed.splice(mine, 1)[0];
          q.installed.push(chassis);
          p.installed.push(taken);
          st.events.push({ type: "upgrade", player: p.id, card: taken.id, how: "taken", from: q.id });
          log(st, p.name + " hands " + q.name + " the Modular Chassis and takes " + UPGRADE_DEFS[taken.id].name);
          return;
        }
      }
    }
  },
  /* "After resolving a Rotate Right card, you may move 1 space forward." */
  powerSlide: {
    on: ["right"],
    botPrefers: 0,
    hooks: {
      afterCard(ctx) {
        if (ctx.cardKind !== "right") return;
        if (ctx.pick("powerSlide", "Slide one square forward after the rotate?", ["Stay", "Slide forward"]) === 1) ctx.forward += 1;
      }
    }
  },
  /* "When your robot reaches a new Checkpoint, you may remove a card in your
   * hand or discard pile from the game." */
  selfDiagnostics: {
    hooks: {
      onCheckpoint(ctx) {
        const st = ctx.st;
        if (!ctx.cards.length) return;
        const labels = ["Keep them all"].concat(ctx.cards.map(x => (isDamage(st, x.i) ? "SPAM" : card(st, x.i).kind) + " (" + x.from + ")"));
        const pick = ctx.pick("selfDiagnostics", "Remove a card from the game?", labels);
        if (pick !== null && pick > 0) ctx.remove = pick - 1;
      }
    }
  },
  /* "After refilling your hand at the start of the Programming Phase, flip the
   * top card of your programming deck face up." Information: the screen shows
   * the top of the deck to the holder. */
  spamFilter: {
    hooks: { onDealt(ctx) { ctx.peek = true; } }
  },
  /* "When an adjacent robot moves into your robot's space or is pushed into
   * your robot's space, that robot takes 1 damage. A push occurs whether or
   * not the adjacent robot actually moves your robot." */
  spiky: {
    hooks: { onPushed(ctx) { ctx.pusherDamage += 1; } }
  },

  /* --- temporary, p.23: one use, then the discard. `use` performs it; `offers`
   * lists the legal ways to use it at a moment, or nothing ------------------ */

  /* "Replace a register card you just revealed with the top card from your
   * programming deck." Offered before the card resolves. */
  abortSwitch: {
    temp: true,
    offers: (st, C, p, moment) => moment === "before" && p.registers[st.register] !== null ? [{}] : [],
    use(st, C, p) {
      const reg = st.register, old = p.registers[reg];
      const next = drawOwnCard(st, p);
      if (old !== null) putAwayCard(st, p, old);
      p.registers[reg] = next;
      log(st, p.name + " hits the Abort Switch and replaces its card");
    }
  },
  /* "Movement Upgrade. Activate all conveyor belts, but only for your robot. Blue conveyors first, then green." */
  allAboard: {
    temp: true, movement: true,
    offers: (st, C, p, moment) => (moment === "before" || moment === "after") ? [{}] : [],
    use(st, C, p) { log(st, p.name + " rides the belts alone"); RULE_HOOKS.beltsFor(st, C, p); }
  },
  /* "Movement Upgrade. Move to an unoccupied adjacent space without changing facing." Adjacent: not through a wall. */
  boink: {
    temp: true, movement: true,
    offers(st, C, p, moment) {
      if (moment !== "before" && moment !== "after") return [];
      const out = [];
      for (let d = 0; d < 4; d++) {
        if (wallBlocks(C, p.c, p.r, d, st.register)) continue;
        const [nc, nr] = stepCell(p.c, p.r, d);
        if (!inGrid(C, nc, nr) || isHole(C, nc, nr) || RULE_HOOKS.robotAt(st, nc, nr)) continue;
        out.push({ dir: d });
      }
      return out;
    },
    use(st, C, p, arg) {
      const [nc, nr] = stepCell(p.c, p.r, arg.dir);
      const from = [p.c, p.r];
      p.c = nc; p.r = nr;
      st.events.push({ type: "moved", player: p.id, from, to: [nc, nr], dir: arg.dir, cause: "upgrade" });
      log(st, p.name + " boinks " + DIRS[arg.dir].toLowerCase());
      RULE_HOOKS.arrived(st, C, p);
    }
  },
  /* "Return all damage cards in your hand to the damage discard pile, then draw that many cards from your programming deck." */
  calibrationProtocol: {
    temp: true,
    offers: (st, C, p, moment) => (moment === "dealt" || moment === "before") && p.hand.some(i => isDamage(st, i)) ? [{}] : [],
    use(st, C, p) {
      const keep = [];
      let n = 0;
      for (const i of p.hand) { if (isDamage(st, i)) { st.damageDiscard.push(i); n++; } else keep.push(i); }
      p.hand = keep;
      for (let k = 0; k < n; k++) { const i = drawOwnCard(st, p); if (i === null) break; p.hand.push(i); }
      log(st, p.name + " runs the Calibration Protocol and scraps " + n + " SPAM");
    }
  },
  /* "Instead of firing your robot's main laser, you may fire Displacing Blast.
   * If you do, relocate the target robot to the Reboot token on the board they
   * occupy, without changing facing." A weapon: the beam hook, not a moment. */
  displacingBlast: {
    temp: true,
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0) return;
        const pick = ctx.pick("displacingBlast", "Fire the Displacing Blast and send " + ctx.targetName + " back to its reboot point instead of the laser?", ["Main laser", "Displacing Blast"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "displace" };
        ctx.discard();
      }
    }
  },
  /* "Reveal and discard cards from the damage deck until you reveal Haywire.
   * You may replace a register card you just revealed with that card or
   * discard it to the damage discard pile." Offered before the card, in both
   * readings: the choice is made before the dig, which the book lets you make
   * after -- declared. */
  luckyBooster: {
    temp: true,
    offers: (st, C, p, moment) => moment === "before" && p.registers[st.register] !== null && (st.damageDeck.length + st.damageDiscard.length) > 0 ? [{ take: true }, { take: false }] : [],
    use(st, C, p, arg) {
      let found = null;
      for (let guard = 0; guard < 80 && found === null; guard++) {
        const i = RULE_HOOKS.drawDamage(st);
        if (i === null) break;
        if (card(st, i).kind === "haywire") found = i; else st.damageDiscard.push(i);
      }
      if (found === null) { log(st, p.name + " digs through the damage deck and finds no Haywire"); return; }
      if (arg.take) {
        const old = p.registers[st.register];
        if (old !== null) putAwayCard(st, p, old);
        p.registers[st.register] = found;
        log(st, p.name + " digs up a Haywire and plays it: " + card(st, found).text);
      } else { st.damageDiscard.push(found); log(st, p.name + " digs up a Haywire and bins it"); }
    }
  },
  /* "When an adjacent robot moves via a register card, you may move with them." Asked after the neighbour's card. */
  magnetic: {
    temp: true,
    botPrefers: 0,
    hooks: {
      onNeighbourMoved(ctx) {
        const pick = ctx.pick("magnetic", "Move with " + ctx.moverName + "?", ["Stay", "Move with it"], String(ctx.mover.id) + ":" + ctx.register);
        if (pick === 1) { ctx.follow = true; ctx.discard(); }
      }
    }
  },
  /* "Draw 3 cards from your programming deck. Then choose 3 cards from your hand to put on top of your deck in any order." */
  memorySwap: {
    temp: true,
    offers: (st, C, p, moment) => moment === "dealt" ? [{}] : [],
    use(st, C, p) {
      for (let k = 0; k < 3; k++) { const i = drawOwnCard(st, p); if (i === null) break; p.hand.push(i); }
      p.stackBack = Math.min(3, p.hand.length);        // the machine asks which three go back
      log(st, p.name + " draws three for a Memory Swap");
    }
  },
  /* "Movement Upgrade. Move 2." */
  overclocked: {
    temp: true, movement: true,
    offers: (st, C, p, moment) => (moment === "before" || moment === "after") ? [{}] : [],
    use(st, C, p) { log(st, p.name + " overclocks: move 2"); for (let k = 0; k < 2; k++) if (p.alive && !RULE_HOOKS.stepRobot(st, C, p, p.face, "upgrade")) break; }
  },
  /* "When your robot pushes another robot during your Programming Card
   * Activation, they take 1 damage and you may rotate them to any facing." */
  piercingDrill: {
    temp: true,
    botPrefers: 0,
    hooks: {
      onPush(ctx) { if (ctx.cause === "card" && !ctx.failed) { ctx.pushDamage += 1; ctx.why = "piercing drill"; ctx.player.drilled = ctx.pushed.id; } },
      afterCard(ctx) {
        const st = ctx.st, p = ctx.player;
        if (p.drilled === undefined || p.drilled === null) return;
        const q = st.players[p.drilled];
        const pick = ctx.pick("piercingDrill", "Spin " + q.name + " to face which way?", ["Leave it"].concat(DIRS));
        if (pick === null) return;
        if (pick > 0) { q.face = pick - 1; st.events.push({ type: "turned", player: q.id, face: q.face, cause: "drill" }); log(st, q.name + " is spun to face " + DIRS[q.face].toLowerCase()); }
        p.drilled = null;
        ctx.discard();
      }
    }
  },
  /* "Movement Upgrade. Move Back 5 spaces, but stop if your robot would push
   * another robot. Your robot will also stop if it hits a wall, or falls into a pit." */
  pressureRelease: {
    temp: true, movement: true,
    offers: (st, C, p, moment) => (moment === "before" || moment === "after") ? [{}] : [],
    use(st, C, p) {
      const dir = opposite(p.face);
      log(st, p.name + " releases the pressure and reverses");
      for (let k = 0; k < 5 && p.alive; k++) {
        const [nc, nr] = stepCell(p.c, p.r, dir);
        if (inGrid(C, nc, nr) && RULE_HOOKS.robotAt(st, nc, nr)) break;
        if (!RULE_HOOKS.stepRobot(st, C, p, dir, "upgrade")) break;
      }
    }
  },
  /* "Give the Priority Token to any player at the table (including yourself)." */
  reInitialize: {
    temp: true,
    offers: (st, C, p, moment) => (moment === "dealt" || moment === "before" || moment === "after") ? st.players.map(q => ({ seat: q.id })) : [],
    use(st, C, p, arg) { st.priority = arg.seat; log(st, p.name + " re-initializes: the Priority Token goes to " + st.players[arg.seat].name); }
  },
  /* "Gain 3 Energy." */
  recharge: {
    temp: true,
    offers: (st, C, p, moment) => (moment === "dealt" || moment === "before" || moment === "after") && p.energy < MAX_ENERGY ? [{}] : [],
    use(st, C, p) { gainEnergy(st, p, 3, "recharge"); log(st, p.name + " recharges"); }
  },
  /* "Play only during the Upgrade Phase. Add all face-down Haywire cards in
   * your registers to your hand. You must program all these Haywires this
   * round, but you may place them where you wish." Offered before programming,
   * which is where the effect lands. */
  rewire: {
    temp: true,
    offers: (st, C, p, moment) => moment === "dealt" && p.haywire.some(h => h !== null) ? [{}] : [],
    use(st, C, p) {
      let n = 0;
      for (let reg = 0; reg < p.haywire.length; reg++) if (p.haywire[reg] !== null) { p.hand.push(p.haywire[reg]); p.haywire[reg] = null; n++; }
      log(st, p.name + " rewires: " + n + " Haywire" + (n === 1 ? "" : "s") + " into the hand, to be programmed anywhere");
    }
  },
  /* "Movement Upgrade. Swap places with an adjacent robot, without changing facing." */
  switchPlaces: {
    temp: true, movement: true,
    offers(st, C, p, moment) {
      if (moment !== "before" && moment !== "after") return [];
      const out = [];
      for (let d = 0; d < 4; d++) {
        if (wallBlocks(C, p.c, p.r, d, st.register)) continue;
        const [nc, nr] = stepCell(p.c, p.r, d);
        const q = inGrid(C, nc, nr) ? RULE_HOOKS.robotAt(st, nc, nr) : null;
        if (q) out.push({ dir: d, with: q.id });
      }
      return out;
    },
    use(st, C, p, arg) {
      const q = st.players[arg.with];
      const a = [p.c, p.r], b = [q.c, q.r];
      p.c = b[0]; p.r = b[1]; q.c = a[0]; q.r = a[1];
      st.events.push({ type: "moved", player: p.id, from: a, to: b, dir: arg.dir, cause: "upgrade" });
      st.events.push({ type: "moved", player: q.id, from: b, to: a, dir: opposite(arg.dir), cause: "upgrade" });
      log(st, p.name + " switches places with " + q.name);
      RULE_HOOKS.arrived(st, C, p); RULE_HOOKS.arrived(st, C, q);
    }
  },
  /* "Movement Upgrade. Rotate to face any direction." */
  /* --- the expansions' cards and Master Builder's ---
   *
   * Three of them decide something the book leaves to the player at a moment
   * this engine cannot ask -- deep inside a move, where a question cannot
   * park. Each is declared on its row: Repulsion Field pays 1 (the smallest
   * X), Anchor pays whenever it can, Bunny Hop hops whenever it can, and
   * Calculated Odds keeps the SPAM when the two cards differ. */

  /* "Instead of firing your robot's main laser, you may pay 1 Energy to fire
   * Indirect Fire. If you do, hit any robot within 3 spaces of your robot in
   * any direction (orthogonally, ignoring board elements)." */
  indirectFire: {
    botPrefers: 0,
    hooks: {
      laserShots(ctx) {
        const p = ctx.player, st = ctx.st;
        if (p.energy < 1 || !ctx.sees) return;
        const main = ctx.shots.find(s => s.main);
        if (!main) return;
        const targets = [];
        for (const q of alive(st)) {
          if (q.id === p.id) continue;
          const dc = q.c - p.c, dr = q.r - p.r;
          if ((dc === 0) === (dr === 0)) continue;                 // the same square, or not in line
          if (Math.abs(dc) + Math.abs(dr) > 3) continue;
          targets.push({ q, dir: dc > 0 ? 1 : dc < 0 ? 3 : dr > 0 ? 2 : 0 });
        }
        if (!targets.length) return;
        const pick = ctx.pick("indirectFire", "Pay 1 Energy to fire Indirect Fire instead of the laser?", ["Main laser"].concat(targets.map(t => "Indirect Fire at " + t.q.name)));
        if (!pick) return;
        const t = targets[pick - 1];
        p.energy -= 1;
        st.events.push({ type: "energy", player: p.id, amount: -1, energy: p.energy, why: "indirectFire" });
        main.dir = t.dir; main.target = t.q.id; main.damage = 1;
      }
    }
  },
  /* "The first time your robot takes damage from another robot each round,
   * that robot also takes the same amount of damage." */
  mirror: {
    init: () => ({ round: -1 }),
    hooks: {
      onDamage(ctx, cst) {
        if (ctx.amount <= 0 || !ctx.by || cst.round === ctx.st.turn) return;
        cst.round = ctx.st.turn;
        ctx.reflect = ctx.amount;
      }
    }
  },
  /* "When you draw Haywire damage, you may place it face down under any card
   * in your registers where there is not already a face-down Haywire card."
   * The card is placed as usual and moved when the robot next programs, which
   * is the first moment a question can be asked and before the register
   * would be programmed anyway; the machine asks. */
  controlledChaos: { ruled: true, hooks: {} },
  /* "Instead of firing your robot's main laser, the target discards all
   * face-down cards in their next register. Cannot be used during Register 5." */
  stun: {
    temp: true,
    botPrefers: 0,
    hooks: {
      onLaserHit(ctx) {
        if (ctx.damage <= 0 || ctx.replaceWith || ctx.lastRegister) return;
        const pick = ctx.pick("stun", "Stun " + ctx.targetName + " instead of shooting it? Its next register is emptied.", ["Main laser", "Stun"]);
        if (pick !== 1) return;
        ctx.damage = 0; ctx.replaceWith = { kind: "stun" };
        ctx.discard();
      }
    }
  },
  /* "At the end of each round, you may transfer 1 damage card in your hand to
   * an adjacent robot's discard pile." The machine asks at the round's end. */
  memoryTransfer: { ruled: true, hooks: {} },
  /* "Play after revealing a programming card. During your movement this
   * register, you may pass through exactly 1 wall." */
  phasing: {
    temp: true,
    offers: (st, C, p, moment) => moment === "before" && p.registers[st.register] !== null ? [{}] : [],
    use(st, C, p) { p.phasing = 1; log(st, p.name + " phases: one wall will not stop it this register"); }
  },
  /* "(X = number of foes in the game; max 4.) When your robot's main laser
   * damages the target robot, you also deal 1 damage to each robot adjacent
   * to the target." */
  splashDamage: {
    hooks: { onLaserHit(ctx) { if (ctx.damage > 0 && !ctx.replaceWith) ctx.splash = true; } }
  },
  /* "Movement Upgrade. Put any number of SPAM cards from your discard pile
   * into the damage discard pile. For each you discarded, move forward 1 space." */
  spamRocket: {
    temp: true, movement: true,
    offers: (st, C, p, moment) => {
      if (moment !== "before" && moment !== "after") return [];
      const n = p.pile.filter(i => isDamage(st, i) && card(st, i).kind === "spam").length;
      return Array.from({ length: n }, (_, k) => ({ n: k + 1 }));
    },
    use(st, C, p, a) {
      let burnt = 0;
      p.pile = p.pile.filter(i => { if (burnt < a.n && isDamage(st, i) && card(st, i).kind === "spam") { st.damageDiscard.push(i); burnt++; return false; } return true; });
      log(st, p.name + " burns " + burnt + " SPAM in the rocket");
      for (let k = 0; k < burnt; k++) if (p.alive && !RULE_HOOKS.stepRobot(st, C, p, p.face, "upgrade")) break;
    }
  },
  /* "After you have drawn damage during a register, for each additional damage
   * you would draw for the rest of that register, you gain 1 Energy instead."
   * Read by the damage draw itself. */
  diffuser: { ruled: true, hooks: {} },
  /* "Each time you draw damage, draw 2 damage cards at the same time. Keep 1
   * and discard the other to the damage discard pile." Read by the damage
   * draw; when the two differ the robot keeps the SPAM -- declared. */
  calculatedOdds: { ruled: true, hooks: {} },
  /* "Pay X Energy when a robot would push your robot: Push them X spaces away
   * from your robot instead. (Your robot is not pushed. X cannot be 0.)"
   * X is 1 -- declared: the push happens where no question can be asked. */
  repulsionField: { ruled: true, hooks: {} },
  /* "When your robot would push another robot during your Programming Card
   * Activation, you may hop over it to the next adjacent empty space if
   * possible instead." Hops whenever it can -- declared. */
  bunnyHop: { ruled: true, hooks: {} },
  /* "When you resolve a Move Card, you may pay 1 Energy to move 1 additional
   * space in the same direction." */
  turbo: {
    botPrefers: 0,
    hooks: {
      modifyMove(ctx) {
        if (ctx.kind !== "move" || !ctx.dist || ctx.player.energy < 1) return;
        const pick = ctx.pick("turbo", "Pay 1 Energy for one more square?", ["No", "Turbo: 1 Energy, one more"]);
        if (pick !== 1) return;
        const p = ctx.player, st = ctx.st;
        p.energy -= 1;
        st.events.push({ type: "energy", player: p.id, amount: -1, energy: p.energy, why: "turbo" });
        ctx.dist += ctx.dist > 0 ? 1 : -1;
        ctx.turbo = true;                                 // named in the log as Turbo, not as a gear
      }
    }
  },
  /* Master Builder. "Play after revealing a non-Haywire programming card. Do
   * the opposite of what your programming card says. (U-Turn = no Turn, Move
   * Back = Move 1, etc.)" A Move n backs up n, Back Up moves 1, a rotate turns
   * the other way, a U-Turn does nothing; Again and Power Up have no opposite. */
  oppositron: {
    temp: true,
    offers: (st, C, p, moment) => moment === "before" && p.registers[st.register] !== null && !isDamage(st, p.registers[st.register]) ? [{}] : [],
    use(st, C, p) { p.opposite = st.register; log(st, p.name + " runs its card through the Oppositron"); }
  },
  /* Master Builder. "Gain 1 SPAM and put it into your discard pile. Ignore your
   * programming cards this register. Instead, resolve one of your previous
   * registers' programming cards." */
  overclockedMB: {
    temp: true,
    offers: (st, C, p, moment) => {
      if (moment !== "before") return [];
      const out = [];
      for (let k = 0; k < st.register; k++) if (p.registers[k] !== null && !isDamage(st, p.registers[k])) out.push({ reg: k });
      return out;
    },
    use(st, C, p, a) {
      const i = RULE_HOOKS.drawSpam(st);
      if (i !== null) p.pile.push(i);
      p.substitute = { register: st.register, card: p.registers[a.reg] };
      log(st, p.name + " overclocks: a SPAM taken, and register " + (a.reg + 1) + "'s card runs again");
    }
  },
  /* Master Builder. "Conveyor belts and currents move your robot in the
   * opposite direction this round. Use only if this would not stop/push
   * another robot." */
  moonWalk: {
    temp: true,
    offers: (st, C, p, moment) => moment === "dealt" || moment === "before" ? [{}] : [],
    use(st, C, p) { p.moonwalk = st.turn; log(st, p.name + " moonwalks: the belts run backwards for it this round"); }
  },
  /* Master Builder. "If your robot is about to be moved by a conveyor belt, it
   * may ignore all conveyor belts this register and move 1 space to the left
   * or right without changing facing." */
  topHeavy: {
    botPrefers: 0,
    hooks: {
      onBoardElement(ctx) {
        if (ctx.kind !== "belt") return;
        const pick = ctx.pick("topHeavy", "The belt is about to carry you. Ride it, or step off it sideways?", ["Ride the belt", "Step left", "Step right"]);
        if (!pick) return;
        ctx.veto = true; ctx.side = pick === 1 ? -1 : 1;
      }
    }
  },
  /* Master Builder. "Spend 1 Energy when your robot would be pushed: Your robot
   * is not pushed." Spent whenever it can be -- declared. */
  anchor: { ruled: true, hooks: {} },
  /* --- Turn & Burn ----------------------------------- */

  /* Installed onto any robot and taking no slot: that robot moves one square
   * fewer on a Move 2 or a Move 3, and the card comes off when it reboots,
   * reaches a checkpoint or shuts down. Read by the card's move (rules.js)
   * and shed by those three (`shed` below). The robot carrying it cannot
   * uninstall it at will -- ours: the card names the three ways it comes
   * off, and a victim who could simply discard it would make it nothing. */
  slowProcessor: { ruled: true, asks: false, hooks: {} },
  /* The card: you MAY add or subtract 1 from the distance a repulsor field
   * moves your robot. The throw happens inside a move, where no question can
   * be asked, so it always takes the shorter throw -- declared, as for
   * Anchor. A thrown robot is losing ground; one square less is the choice
   * that loses least. Read by `repulse` (rules.js). */
  fieldStabilizer: { ruled: true, asks: false, hooks: {} },
  /* The first time each round the robot ends a register on a checkpoint or
   * a chop shop, it may pay 1 Energy to make any robot draw a damage card.
   * Asked at the checkpoint step (rules.js), where a question can wait. */
  fireworks: { ruled: true, asks: true, hooks: {} },
  /* Installed onto any robot and taking no slot: the next checkpoint that
   * robot would reach, it does not reach that register, and the card comes
   * off. Read by the checkpoint step. Never the holder's to use: it has no
   * offer. */
  badScanner: { temp: true, ruled: true, asks: false, hooks: {} },
  /* "Discard this upgrade at any time during a register": used the moment it
   * matters -- when the robot would fall into a pit or an active trap door
   * pit during a register -- and from then on it falls into none for the rest
   * of that register (`dances`, rules.js). Declared: a fall is never the
   * better outcome, and the fall comes where no question can be asked. The
   * board's edge is not a pit, as Hover Unit's card says of it. */
  pitTrapDance: { temp: true, ruled: true, asks: false, hooks: {} },

  zoop: {
    temp: true, movement: true,
    offers: (st, C, p, moment) => (moment === "before" || moment === "after") ? [0, 1, 2, 3].filter(d => d !== p.face).map(d => ({ face: d })) : [],
    use(st, C, p, arg) { p.face = arg.face; st.events.push({ type: "turned", player: p.id, face: p.face, cause: "upgrade" }); log(st, p.name + " zoops to face " + DIRS[arg.face].toLowerCase()); }
  },

  /* --- the eleven that were built first, pp.21-22 ------------------------- */
  /* "Move 1 cards in your registers may be treated as Move 0." Not an Again
   * played after a Move 1, and not a Haywire with a Move 1 effect. */
  brakes: {
    botPrefers: 0, on: ["move1"],
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

/* Three cross-module doors, set by rules.js at load so a temporary upgrade
 * can move a robot without this module importing the rules (which import
 * this one). rules.js registers them; check-all asserts they are set. */
export const RULE_HOOKS = {};

function drawOwnCard(st, p) { return RULE_HOOKS.drawOwn(st, p); }
function putAwayCard(st, p, i) { return RULE_HOOKS.putAway(st, p, i, true); }

/** id -> { id, name, text, cost, type, built, inert?, temp, movement, hooks, init?, botPrefers?, offers?, use? } for all forty. */
export const UPGRADE_DEFS = {};
for (const c of UPGRADES_DATA.cards) {
  const b = BEHAVIOUR[c.id];
  if (!b) throw new Error("upgrade " + c.id + " has no behaviour: every transcribed card is bound here, built or declared inert");
  if ((c.type === "temporary") !== !!b.temp) throw new Error("upgrade " + c.id + " is " + c.type + " in the data and " + (b.temp ? "temporary" : "permanent") + " here");
  /* `asks`: the card puts a question to its holder (a hook that picks, or a
   * temporary's offer), which is what the screen gives a toggle to */
  const asks = b.asks !== undefined ? b.asks : !!b.temp || c.id === "memoryCards" || c.id === "controlledChaos" || c.id === "memoryTransfer" || Object.values(b.hooks || {}).some(fn => /\.pick\(/.test(String(fn)));
  /* and where: a temporary offered before or after the robot's card is
   * planned under the register; one offered after the deal is a switch */
  const asksIn = asksWhere(b.hooks);
  if (b.temp && b.offers) {
    const src = String(b.offers);
    if (/"before"|"after"/.test(src) || !/"dealt"/.test(src)) asksIn.plan = true;
    if (/"dealt"/.test(src)) asksIn.switch = true;
  }
  if (c.id === "memoryCards" || c.id === "controlledChaos" || c.id === "memoryTransfer" || (b.asks && !b.temp)) asksIn.switch = true;
  UPGRADE_DEFS[c.id] = { id: c.id, name: c.name, text: c.text, cost: c.cost, costX: !!c.costX, set: c.set || "base", type: c.type, onto: c.onto || null, noSlot: !!c.noSlot, needs: c.needs || null, built: !b.inert, inert: b.inert || null, asks, asksIn, single: !!b.temp, on: b.on || null, ruled: !!b.ruled,
    temp: !!b.temp, movement: !!b.movement, hooks: b.hooks || {}, init: b.init, botPrefers: b.botPrefers, offers: b.offers, use: b.use };
}
export const UPGRADE_IDS = Object.keys(UPGRADE_DEFS);
export const UPGRADE_ROSTER = UPGRADES_DATA.roster;

/**
 * The ways a robot may use a temporary upgrade at this moment: one entry per
 * legal use, each naming the card and its argument. `moment` is "dealt"
 * (after the deal, before programming), "before" or "after" (its own card).
 */
export function temporaryOffers(st, C, p, moment) {
  const out = [];
  const onTeleporter = p.alive && teleporterAt(C, p.c, p.r);
  for (const u of p.installed) {
    const def = UPGRADE_DEFS[u.id];
    if (!def.temp || !def.offers) continue;
    if (def.movement && onTeleporter && moment === "before") continue;   // "Movement upgrades will not function on a teleporter"

    for (const arg of def.offers(st, C, p, moment)) out.push({ id: u.id, ...arg });
  }
  return out;
}

/** Use a temporary upgrade: its effect, then the card to the upgrade discard. */
export function useTemporary(st, C, p, action) {
  const def = UPGRADE_DEFS[action.id];
  const held = p.installed.find(u => u.id === action.id);
  if (!def || !def.use || !held) return false;
  def.use(st, C, p, action);
  uninstallUpgrade(st, p, action.id, "uses up");
  return true;
}

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

/** How many of a type fill the robot's slots: a card installed onto it that takes no slot fills none. */
export function installedOfType(p, type) {
  return p.installed.filter(u => UPGRADE_DEFS[u.id].type === type && !UPGRADE_DEFS[u.id].noSlot).length;
}

/** The installed cards a robot may take off at will: not one another robot put on it. */
export function removable(p) {
  return p.installed.filter(u => !(u.st && u.st.from !== undefined && u.st.from !== p.id)).map(u => u.id);
}

/** Take a card off because it says so (Slow Processor on a reboot, a checkpoint, a shutdown). */
export function shed(st, p, id, why) {
  if (!p.installed.some(u => u.id === id)) return false;
  uninstallUpgrade(st, p, id, "sheds");
  log(st, UPGRADE_DEFS[id].name + " comes off " + p.name + " as it " + why);
  return true;
}

/** What a card costs at this table: its printed cost, or X, the number of foes, at most 4 (Splash Damage). */
export function costOf(def, players) {
  return def.costX ? Math.min(4, Math.max(1, (players || 2) - 1)) : def.cost;
}

/** Could `p` install this shelf card now: on the shelf, affordable, and a slot free for its type? `players` prices a card that costs X. */
export function canInstall(p, id, players) {
  const def = UPGRADE_DEFS[id];
  if (!def || p.shelf.indexOf(id) < 0) return false;
  if (p.energy < costOf(def, players)) return false;
  return def.noSlot || installedOfType(p, def.type) < INSTALL_LIMIT[def.type];
}

/** Pay the printed cost and put the card on the mat -- or, for a card installed onto any robot, on `onto`'s. */
export function installUpgrade(st, p, id, onto) {
  if (!canInstall(p, id, st.players.length)) return false;
  const def = UPGRADE_DEFS[id];
  const to = def.onto && Number.isInteger(onto) && st.players[onto] ? st.players[onto] : p;
  if (def.onto && to.installed.some(u => u.id === id)) return false;
  const cost = costOf(def, st.players.length);
  p.shelf.splice(p.shelf.indexOf(id), 1);
  p.energy -= cost;
  const held = newInstalled(id);
  if (def.onto) held.st.from = p.id;
  to.installed.push(held);
  st.events.push({ type: "energy", player: p.id, amount: -cost, energy: p.energy, why: "install" });
  st.events.push({ type: "upgrade", player: to.id, card: id, how: "installed", by: to === p ? undefined : p.id });
  log(st, p.name + " installs " + def.name + (to === p ? "" : " onto " + to.name) + (def.built ? "" : " (its effect is not built)"));
  return true;
}

/** "Uninstall any number of upgrades and discard them to the upgrade discard pile." Nothing comes back. */
export function uninstallUpgrade(st, p, id, how) {
  const i = p.installed.findIndex(u => u.id === id);
  if (i < 0) return false;
  p.installed.splice(i, 1);
  /* Memory Cards: "If this upgrade is lost while cards are on it, discard those cards into your discard pile." */
  if (id === "memoryCards" && p.parked && p.parked.length) { for (const ci of p.parked) p.pile.push(ci); p.parked = []; }
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


/* the doors rules.js opens for the temporary upgrades; `st.hooks` is the same
 * table reached through the state for the behaviours above */
export function bindRuleHooks(h) { Object.assign(RULE_HOOKS, h); }
