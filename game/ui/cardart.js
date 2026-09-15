/* The picture on a program card: what the card does, drawn, so a hand can be
 * read at a glance without reading the labels. Ported from the old game's
 * card art and changed where the eye said so:
 *
 *   - a Move is one, two or three arrows side by side, pointing forward (up
 *     the card), never a numeral: the distance is counted, not read;
 *   - Back Up is the same arrow the other way round, because that is what the
 *     move is, and it is yellow so it cannot be mistaken for a Move 1;
 *   - a U-turn goes up, round, and comes back DOWN under an arrowhead pointing
 *     down: the shape that says "you will be facing the way you came";
 *   - a rotate shows the heading changing: up, round the corner, out sideways;
 *   - Again is the repeat loop, drawn large; Power Up is the bolt; SPAM is a
 *     burst of interference where an arrow should be, pointing nowhere.
 *
 * Every drawing is a 100x100 box stroked in two classes, so the card's kind
 * colour drives it through currentColor. Tests assert the counts.
 */

function chev(x, y, hx, hy, size, cls) {
  const bx = x - hx * size, by = y - hy * size;
  const px = -hy * size * 0.78, py = hx * size * 0.78;
  return '<path class="' + (cls || "cmark") + '" d="M' + (bx + px).toFixed(1) + " " + (by + py).toFixed(1) +
    "L" + x.toFixed(1) + " " + y.toFixed(1) +
    "L" + (bx - px).toFixed(1) + " " + (by - py).toFixed(1) + '"/>';
}

function turnArrow(cw) {
  const TIP = cw ? 82 : 18, Y = 40;
  const rise = cw ? 32 : 68;                 // the upright, on the far side
  const corner = cw ? 46 : 54;               // where the bend finishes
  const shaftEnd = cw ? 69 : 31;             // the chevron's back
  return '<path class="cshaft" d="M' + rise + " 84L" + rise + " 56Q" + rise + " " + Y +
    " " + corner + " " + Y + "L" + shaftEnd + " " + Y + '"/>' +
    chev(TIP, Y, cw ? 1 : -1, 0, 14, "cmark");
}

/** The art for a card kind, as an SVG string. Throws for a kind it has no drawing for. */
export function cardArt(kind) {
  const out = [];
  if (kind === "powerUp") {
    out.push('<path class="cshaft" d="M62 10L32 54h20L40 90"/>');
  } else if (kind === "again") {
    /* the loop, large: the whole card is a repeat of the one before it */
    out.push('<path class="cshaft" d="M80 50a30 30 0 1 1-11-23.2"/>');
    out.push('<path class="cmark" d="M56 14l19 8-8 18"/>');
  } else if (kind === "spam") {
    out.push('<path class="cshaft" d="M12 62L28 34L42 60L54 30L66 58L78 36L90 54"/>');
    out.push('<path class="cmark" d="M28 80h44"/>');
  } else if (kind === "haywire") {
    /* a jolt: the bolt with sparks off it */
    out.push('<path class="cshaft" d="M58 8L30 50h20L38 92"/>');
    out.push('<path class="cmark" d="M70 34l12-8M72 52l14 2M18 44l-10-6M20 62l-12 4"/>');
  } else if (/^move[123]$/.test(kind) || kind === "back") {
    const n = kind === "back" ? 1 : +kind.charAt(4);
    const dir = kind === "back" ? 1 : -1;      // -1 is up the card: forward
    const LAY = { 1: { gap: 0, head: 16 }, 2: { gap: 32, head: 14 }, 3: { gap: 29, head: 12 } };
    const lay = LAY[n];
    const tip = 50 + dir * 34, tail = 50 - dir * 32;
    for (let i = 0; i < n; i++) {
      const x = 50 + (i - (n - 1) / 2) * lay.gap;
      out.push('<path class="cshaft" d="M' + x.toFixed(1) + " " + tail + "L" + x.toFixed(1) + " " + (tip - dir * 7) + '"/>');
    }
    /* heads last, so every one sits over every shaft */
    for (let i = 0; i < n; i++) out.push(chev(50 + (i - (n - 1) / 2) * lay.gap, tip, 0, dir, lay.head, "cmark"));
  } else if (kind === "uturn") {
    out.push('<path class="cshaft" d="M32 84L32 50A18 18 0 0 1 68 50L68 74"/>');
    out.push(chev(68, 84, 0, 1, 14, "cmark"));
  } else if (kind === "left" || kind === "right") {
    out.push(turnArrow(kind === "right"));
  } else {
    throw new Error("no drawing for card kind " + kind);
  }
  return '<svg class="cart" viewBox="0 0 100 100" fill="none" aria-hidden="true">' + out.join("") + "</svg>";
}

/** Every kind this module draws, for the check that walks the deck. */
export const DRAWN_KINDS = ["move1", "move2", "move3", "back", "left", "right", "uturn", "powerUp", "again", "spam", "haywire"];
