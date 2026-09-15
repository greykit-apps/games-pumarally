/* Haywire, the other damage card (2016 rulebook p.18, manual1/IMG_1263; the
 * seventeen faces off IMG_1343 to IMG_1348).
 *
 * "When you receive a Haywire damage card, do not show it to your fellow
 * players or discard it. Instead, place it face down under the programming
 * card in the current register of your player mat. Your robot has received an
 * electrical jolt that will create a wild effect during the following round.
 * Each register can have a maximum of 1 face-down Haywire. If you draw
 * additional Haywire cards during that same register, place them face up in
 * the damage discard pile." At the end of the round the face-down card stays;
 * next round that register is not programmed, and when it comes up the card
 * is revealed and its text resolved, taking precedence over the rulebook.
 *
 * The faces are data (data/cards.js); what each does is the step table here,
 * walked by resolveHaywire one step at a time so a step that asks a question
 * can park and the re-run picks up where it left off.
 */
import { rot, opposite, step as stepCell } from "../../editor/lib/dir.js";
import { card, isDamage, MODERN_CARDS, KINDS } from "./cards.js";
import { log } from "./state.js";
import { stepRobot, planCard, playCard, drawOwn, putAway, damage, destroy, robotAt, oilAtCourse, waterAtCourse } from "./rules.js";
import { fire } from "./options.js";
import { UPGRADE_DEFS, newInstalled } from "./upgrades.js";
import { inGrid, isHole } from "./course.js";
const RULE_HOLE = isHole, RULE_DESTROY = destroy;

const DIRS = ["North", "East", "South", "West"];

/** What each face does, by its id in data/cards.js. */
export const HAYWIRE_STEPS = {
  hwMove2Left: [{ move: 2 }, { turn: -1 }],
  hwBack3: [{ move: -3 }],
  hwMove1Token: [{ move: 1 }, { takeToken: true }],
  hwMove5Wall: [{ move: 5, wallDamage: true }],
  hwMove3Uturn: [{ move: 3 }, { turn: 2 }],
  hwMove1RightMove1: [{ move: 1 }, { turn: 1 }, { move: 1 }],
  hwMove1LeftMove1: [{ move: 1 }, { turn: -1 }, { move: 1 }],
  hwMove2Right: [{ move: 2 }, { turn: 1 }],
  hwAnyFacingMove1: [{ anyFacing: true }, { move: 1 }],
  hwPayEnergy: [{ payMove: true }],
  hwInstall: [{ installFree: true }],
  hwBack1Remove: [{ move: -1 }, { removeFromDiscard: true }],
  hwMove1Laser: [{ move: 1 }, { laserBonus: true }],
  hwRotateEither: [{ rotateChoice: true }],
  hwDrawTwo: [{ drawTwo: true }],
  hwSidestep2: [{ sidestep: 2 }],
  hwBack1Uturn: [{ move: -1 }, { turn: 2 }]
};

export function isHaywire(st, i) { return isDamage(st, i) && card(st, i).kind === "haywire"; }

/**
 * A Haywire's move: the card's own movement, with the discounts a Move card
 * pays (oil, water) and Hover Unit's pass over pits. Returns true when a wall
 * (or a blocked shove) cut it short.
 */
function hwMove(st, C, p, n) {
  const dir = n > 0 ? p.face : opposite(p.face);
  let dist = Math.abs(n);
  if (dist > 0 && oilAtCourse(C, p.c, p.r)) dist--;
  if (dist > 0 && waterAtCourse(C, p.c, p.r)) dist--;
  const hover = fire(st, p, "modifyMove", { kind: "hover", hover: false }).hover;
  let moved = 0, hitWall = false;
  p.pushed = [];
  for (let i = 0; i < dist; i++) {
    if (!p.alive) break;
    p.hoverSteps = hover ? dist - i - 1 : 0;
    if (!stepRobot(st, C, p, dir, "card")) { hitWall = true; break; }
    moved++;
  }
  p.hoverSteps = 0;
  if (hover && p.alive && inGrid(C, p.c, p.r) && RULE_HOLE(C, p.c, p.r)) RULE_DESTROY(st, C, p, "into a pit");
  p.lastMove = moved > 0 ? { dir, n: moved } : null;
  return hitWall;
}

function turnRobot(st, p, t) {
  p.face = rot(p.face, t);
  st.events.push({ type: "turned", player: p.id, turn: t, face: p.face, cause: "card" });
}

/**
 * Resolve the Haywire in the robot's current register, one step at a time.
 * `st.act.hw` is the step reached; a step that asks returns the request and
 * is re-run when the answer is filed. Returns null when the card is done.
 */
export function resolveHaywire(st, C, p, i) {
  const cd = card(st, i);
  const steps = HAYWIRE_STEPS[cd.face];
  if (!steps) throw new Error("no steps for Haywire face " + cd.face);
  if (st.act.hw === undefined) { st.act.hw = 0; log(st, p.name + " goes haywire: " + cd.text); st.events.push({ type: "revealed", player: p.id, card: cd, register: st.register }); }
  const key = tag => st.turn + ":" + st.register + ":haywire:" + p.id + ":" + st.act.hw + ":" + tag;
  const ask = (tag, prompt, labels) => ({ player: p.id, kind: "cardChoice", key: key(tag), card: "haywire", tag, prompt, labels, options: labels.map((_, k) => k) });
  const answer = tag => st.answers[key(tag)];

  while (st.act.hw < steps.length && p.alive) {
    const s = steps[st.act.hw];
    if (s.move !== undefined) {
      const hit = hwMove(st, C, p, s.move);
      if (s.wallDamage && hit) { log(st, p.name + " hits a wall and takes 1"); damage(st, C, p, 1, "haywire"); }
    } else if (s.turn !== undefined) {
      turnRobot(st, p, s.turn);
    } else if (s.anyFacing) {
      const a = answer("facing");
      if (a === undefined) return ask("facing", p.name + ", the Haywire lets you rotate to any facing. Which way?", DIRS);
      if (a !== p.face) { p.face = a; st.events.push({ type: "turned", player: p.id, face: p.face, cause: "card" }); }
    } else if (s.rotateChoice) {
      const a = answer("rotate");
      if (a === undefined) return ask("rotate", p.name + ", the Haywire rotates you. Which way?", ["Rotate right", "Rotate left"]);
      turnRobot(st, p, a === 0 ? 1 : -1);
    } else if (s.payMove) {
      const max = Math.min(8, p.energy);
      const a = answer("pay");
      if (a === undefined) return ask("pay", p.name + ", pay Energy to move two squares for each?", Array.from({ length: max + 1 }, (_, k) => k === 0 ? "Pay nothing" : "Pay " + k + " (move " + (2 * k) + ")"));
      if (a > 0) {
        p.energy -= a;
        st.events.push({ type: "energy", player: p.id, amount: -a, energy: p.energy, why: "haywire" });
        log(st, p.name + " pays " + a + " Energy");
        hwMove(st, C, p, 2 * a);
      }
    } else if (s.takeToken) {
      st.priority = p.id;
      st.priorityHeld = true;
      log(st, p.name + " takes the Priority Token, and it stays this round");
    } else if (s.installFree) {
      /* "If you do not have an uninstalled permanent upgrade when this card is
       * revealed, ignore this effect. If you do, install it at no Energy cost,
       * even if it causes you to have more than 3 permanent upgrades." */
      const perms = p.shelf.filter(id => UPGRADE_DEFS[id].type === "permanent");
      if (perms.length) {
        const a = answer("install");
        if (a === undefined) return ask("install", p.name + ", the Haywire installs a permanent upgrade for free until the end of the round. Which?", perms.map(id => UPGRADE_DEFS[id].name));
        const id = perms[a];
        p.shelf.splice(p.shelf.indexOf(id), 1);
        p.installed.push(newInstalled(id));
        p.hwInstalled = id;
        st.events.push({ type: "upgrade", player: p.id, card: id, how: "installed" });
        log(st, p.name + " installs " + UPGRADE_DEFS[id].name + " for the round");
      } else log(st, p.name + " has no permanent upgrade to install");
    } else if (s.removeFromDiscard) {
      if (p.pile.length) {
        const a = answer("remove");
        if (a === undefined) return ask("remove", p.name + ", remove a card in your discard pile from the game. Which?", p.pile.map(ci => isDamage(st, ci) ? (card(st, ci).kind === "haywire" ? "Haywire" : "SPAM") : KINDS[card(st, ci).kind].label));
        const ci = p.pile.splice(a, 1)[0];
        p.removed.push(ci);
        st.events.push({ type: "removed", player: p.id, card: ci });
        log(st, p.name + " removes a card from the game");
      }
    } else if (s.laserBonus) {
      p.laserBonus = st.register;
      log(st, p.name + "'s main laser is charged for this register");
    } else if (s.drawTwo) {
      /* "Draw and reveal the top 2 cards of your programming deck. Resolve both
       * in the order of your choosing." A SPAM or Haywire among them is thrown
       * to the damage discard and does nothing: the card names programming. */
      if (!st.act.drawn) {
        /* the two go to the discard as they are revealed, so a robot that
         * falls into a pit halfway through resolving them keeps its twenty */
        const drawn = [];
        for (let k = 0; k < 2; k++) { const ci = drawOwn(st, p); if (ci !== null) { drawn.push(ci); if (isDamage(st, ci)) st.damageDiscard.push(ci); else p.pile.push(ci); } }
        st.act.drawn = drawn;
        log(st, p.name + " draws and reveals " + drawn.map(ci => isDamage(st, ci) ? "damage" : KINDS[card(st, ci).kind].label).join(" and "));
      }
      const drawn = st.act.drawn;
      if (drawn.length === 2) {
        const a = answer("order");
        if (a === undefined) return ask("order", p.name + ", resolve the two in which order?", [labelOf(st, drawn[0]) + " then " + labelOf(st, drawn[1]), labelOf(st, drawn[1]) + " then " + labelOf(st, drawn[0])]);
        if (a === 1) drawn.reverse();
      }
      for (const ci of drawn) {
        if (isDamage(st, ci) || !p.alive) continue;
        const dc = card(st, ci);
        const plan = planCard(st, p, dc, true);
        playCard(st, C, p, dc, plan);
      }
      st.act.drawn = null;
    } else if (s.sidestep) {
      const a = answer("side");
      if (a === undefined) return ask("side", p.name + ", the Haywire moves you two sideways. Which way?", ["Left", "Right"]);
      const dir = rot(p.face, a === 0 ? -1 : 1);
      log(st, p.name + " slides " + (a === 0 ? "left" : "right"));
      let moved = 0;
      for (let k = 0; k < s.sidestep && p.alive; k++) { if (!stepRobot(st, C, p, dir, "card")) break; moved++; }
      p.lastMove = moved > 0 ? { dir, n: moved } : null;
    }
    st.act.hw++;
  }
  return null;
}

function labelOf(st, ci) {
  if (isDamage(st, ci)) return card(st, ci).kind === "haywire" ? "Haywire" : "SPAM";
  return KINDS[card(st, ci).kind].label;
}

/** A face-down Haywire lands under the current register, or on the damage discard if that slot has one already. */
export function receiveHaywire(st, p, i) {
  const reg = st.register;
  if (st.phase === "exec" && reg >= 0 && p.haywire[reg] === null && p.alive !== undefined) {
    p.haywire[reg] = i;
    st.events.push({ type: "haywire", player: p.id, register: reg });
    log(st, p.name + " goes haywire: a card slides face down under register " + (reg + 1));
    return true;
  }
  st.damageDiscard.push(i);
  log(st, p.name + " draws a Haywire it cannot hold, face up to the discard");
  return false;
}
