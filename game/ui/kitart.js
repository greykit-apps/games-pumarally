/* The picture on an option or upgrade card: not the card's own art (sixty-
 * seven distinct drawings would be a project of their own) but the kind of
 * thing it is, so a mat can be read at a glance: a weapon, armour, a drive,
 * a program trick, a chassis part, or a power gadget. Every glyph is a
 * 100x100 box stroked in currentColor, like the program-card art.
 */

const GLYPHS = {
  /* crosshair */
  weapon: '<circle class="kline" cx="50" cy="50" r="26"/><path class="kline" d="M50 10v18M50 72v18M10 50h18M72 50h18"/><circle class="kfill" cx="50" cy="50" r="5"/>',
  /* shield */
  armour: '<path class="kline" d="M50 10L82 22v26c0 20-14 34-32 42C32 82 18 68 18 48V22z"/><path class="kline" d="M36 48l10 10 20-22"/>',
  /* a wheel with spokes */
  drive: '<circle class="kline" cx="50" cy="50" r="32"/><circle class="kline" cx="50" cy="50" r="9"/><path class="kline" d="M50 18v23M50 59v23M18 50h23M59 50h23"/>',
  /* two cards, fanned */
  program: '<rect class="kline" x="18" y="24" width="40" height="54" rx="5" transform="rotate(-12 38 51)"/><rect class="kline kback" x="42" y="22" width="40" height="54" rx="5" transform="rotate(10 62 49)"/>',
  /* a cog */
  chassis: '<path class="kline" d="M50 14l7 8 10-3 4 10 10 3-2 10 8 7-8 7 2 10-10 3-4 10-10-3-7 8-7-8-10 3-4-10-10-3 2-10-8-7 8-7-2-10 10-3 4-10 10 3z"/><circle class="kline" cx="50" cy="50" r="11"/>',
  /* a bolt */
  power: '<path class="kline" d="M58 8L30 54h20L42 92 70 46H50z"/>'
};

/** The glyph for a category, as an SVG string. */
export function kitArt(category) {
  const g = GLYPHS[category] || GLYPHS.power;
  return '<svg class="kart" viewBox="0 0 100 100" fill="none" aria-hidden="true">' + g + "</svg>";
}

export const KIT_CATEGORIES = Object.keys(GLYPHS);

/** Which kind of thing a card is, read off the hooks it binds and its type. */
export function categoryOf(def) {
  const h = def.hooks || {};
  if (h.laserShots || h.onLaserHit) return "weapon";
  if (h.onDamage || h.onPushed) return "armour";
  if (h.modifyMove || h.afterCard || h.onTouchCheckpoint || h.onNeighbourMoved || h.afterBoardLaser || def.movement) return "drive";
  if (h.onDealt || h.onProgrammed || h.onReveal || h.modifyDealt || h.onSpam || h.onLeftovers || h.onCheckpoint || def.temp) return "program";
  if (h.onPush || h.onBoardElement || h.onRespawn || h.onTurnEnd || h.onReboot) return "chassis";
  return "power";
}
