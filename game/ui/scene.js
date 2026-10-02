/* SCENERY: a line-drawn factory at night behind the board, after PumaCity's
 * districts and PumaHeart's field. Low contrast on purpose: it fills the
 * margins the board leaves and never competes with it. The neutrals are
 * PumaCity's scene values; the only game hues it borrows are the floor's own
 * -- belt amber, hazard yellow, the cyan of a lit joint, a laser's red.
 *
 * NOT ONE PICTURE SLICED TO FIT, as the siblings draw it. Their frame is a
 * fixed width in the middle of the window; here the scenery sits behind the
 * board's column only, whose shape changes with the window and the rail, so
 * a 1600x900 picture cropped to it would cut the landmarks off at either
 * side. Instead each side is drawn against its own edge, at a scale set by
 * the height alone, and the floor runs between them at whatever width there
 * is: the chimneys and the gantry hold to the left edge, the robot arm in
 * its lit bay door to the right, and the board covers the middle.
 *
 * Every coordinate below is in a frame 900 high with the ground at G; x runs
 * from the left edge, or from the right edge through R(). Nothing in it
 * moves, and it draws on its own little generator, never the game's RNG. */
import { TOKENS } from "../../editor/render/palette.js";

const G = 820;

function rand(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function stars(r, n, w, ymax) {
  let o = "";
  for (let i = 0; i < n; i++) {
    const x = Math.round(r() * w), y = Math.round(r() * ymax), big = r() < 0.25;
    o += `<circle class="st" cx="${x}" cy="${y}" r="${big ? 1.6 : 1}"/>`;
  }
  return o;
}

function win(r, x, y, w, h, rate) {
  return `<rect class="${r() < rate ? "sw" : "sx"}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

/* A chimney: a tapered stack, two bands, a red warning lamp on the lip and
 * smoke leaning in towards the floor. dir is +1 to lean right, -1 left. */
function chimney(x, top, w, dir) {
  let o = `<path class="sf far" d="M${x - w / 2} ${G} L${x - w * 0.38} ${top} H${x + w * 0.38} L${x + w / 2} ${G} Z"/>`;
  o += `<path class="sd" d="M${x - w * 0.38} ${top + 16} H${x + w * 0.38} M${x - w * 0.4} ${top + 40} H${x + w * 0.4}"/>`;
  o += `<circle class="slamp" cx="${x}" cy="${top - 7}" r="4"/>`;
  for (const [dx, dy, rx, ry] of [[10, -34, 22, 12], [40, -66, 34, 17], [82, -100, 48, 22], [138, -128, 62, 26]]) {
    o += `<ellipse class="ssmoke" cx="${x + dx * dir}" cy="${top + dy}" rx="${rx}" ry="${ry}"/>`;
  }
  return o;
}

/* A shed with a sawtooth roof: each tooth a vertical north-light face,
 * lit faintly from inside, and a slope back down to the eave. */
function sawtooth(r, x0, x1, eave, n) {
  const tw = (x1 - x0) / n, rise = 52;
  let d = `M${x0} ${G} V${eave}`;
  for (let i = 0; i < n; i++) d += ` V${eave - rise} L${x0 + (i + 1) * tw} ${eave}`;
  let o = `<path class="sf far" d="${d} V${G} Z"/>`;
  for (let i = 0; i < n; i++) o += `<path class="swl" d="M${x0 + i * tw + 3} ${eave - rise + 8} V${eave - 6}"/>`;
  for (let x = x0 + 24; x < x1 - 30; x += 38) o += win(r, x, eave + 30, 14, 34, 0.25);
  return o;
}

/* An overhead gantry: an A-frame leg at each end, a hazard-striped beam,
 * and a trolley with a crate on its hook. Only the left half is meant to be
 * seen; the board covers the rest. */
function gantry(x0, x1, y, hookX) {
  let o = "";
  for (const x of [x0 + 34, x1 - 34]) o += `<path class="sl" d="M${x - 30} ${G} L${x} ${y + 20} L${x + 30} ${G} M${x - 20} ${G - 110} H${x + 20}"/>`;
  o += `<rect class="sf" x="${x0}" y="${y}" width="${x1 - x0}" height="26"/>`;
  for (let x = x0 + 4; x < x1 - 20; x += 28) o += `<path class="shaz dim" d="M${x} ${y + 26} l12 0 l14 -26 l-12 0 Z"/>`;
  o += `<rect class="sf" x="${hookX - 22}" y="${y + 26}" width="44" height="22"/>`;
  o += `<path class="sd" d="M${hookX - 8} ${y + 48} V${y + 170} M${hookX + 8} ${y + 48} V${y + 170}"/>`;
  o += `<path class="sl" d="M${hookX - 36} ${y + 196} L${hookX} ${y + 170} L${hookX + 36} ${y + 196}"/>`;
  o += `<rect class="sf" x="${hookX - 40}" y="${y + 196}" width="80" height="64"/>`;
  o += `<path class="sd" d="M${hookX - 40} ${y + 196} L${hookX + 40} ${y + 260} M${hookX + 40} ${y + 196} L${hookX - 40} ${y + 260}"/>`;
  return o;
}

/* A shop lamp hung from the beam, and the cone it throws on the floor. */
function pendant(x, y0, y1) {
  return `<path class="sd" d="M${x} ${y0} V${y1}"/>`
    + `<path class="sglow" d="M${x - 10} ${y1 + 8} L${x - 90} ${G + 40} H${x + 90} L${x + 10} ${y1 + 8} Z"/>`
    + `<path class="sf" d="M${x - 16} ${y1 + 10} L${x - 6} ${y1} H${x + 6} L${x + 16} ${y1 + 10} Z"/>`
    + `<rect class="sw" x="${x - 9}" y="${y1 + 10}" width="18" height="4"/>`;
}

function crate(x, y, s) {
  return `<rect class="sf" x="${x}" y="${y - s}" width="${s}" height="${s}"/>`
    + `<path class="sd" d="M${x + 6} ${y - s + 6} L${x + s - 6} ${y - 6} M${x + s - 6} ${y - s + 6} L${x + 6} ${y - 6}"/>`;
}

function drum(x, w, h) {
  return `<rect class="sf" x="${x}" y="${G - h}" width="${w}" height="${h}" rx="3"/>`
    + `<path class="sd" d="M${x} ${G - h * 0.33} H${x + w} M${x} ${G - h * 0.66} H${x + w}"/>`;
}

/* The industrial arm, raised and reaching in towards the board: a plinth,
 * a turret, two limbs and a gripper. Each limb is drawn as a heavy stroke
 * over a lighter one, so it reads as an outlined bar at any length; the
 * joints carry the cyan of something live. */
function arm(base, shoulder, elbow, wrist) {
  const [bx] = base, [sx, sy] = shoulder, [ex, ey] = elbow, [wx, wy] = wrist;
  let o = `<path class="sf" d="M${bx - 46} ${G} V${G - 22} H${bx + 46} V${G} Z"/>`;
  o += `<path class="sf" d="M${bx - 28} ${G - 22} L${bx - 20} ${sy + 18} H${bx + 20} L${bx + 28} ${G - 22} Z"/>`;
  const limb = (a, b, w) => `<path class="slimb-o" stroke-width="${w + 4}" d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}"/><path class="slimb" stroke-width="${w}" d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}"/>`;
  o += limb([sx, sy], [ex, ey], 30) + limb([ex, ey], [wx, wy], 22);
  const a = Math.atan2(wy - ey, wx - ex), ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  const tip = (side) => {
    const k = side * 16;
    return `M${wx + px * k} ${wy + py * k} L${wx + px * k + ux * 30} ${wy + py * k + uy * 30} L${wx + px * k * 0.5 + ux * 44} ${wy + py * k * 0.5 + uy * 44}`;
  };
  o += `<path class="sl" d="${tip(1)} ${tip(-1)}"/>`;
  for (const [x, y, rr] of [[sx, sy, 15], [ex, ey, 12], [wx, wy, 9]]) {
    o += `<circle class="sf" cx="${x}" cy="${y}" r="${rr}"/><circle class="sad" cx="${x}" cy="${y}" r="${rr * 0.35}"/>`;
  }
  return o;
}

/* The scene for a box W x H pixels. */
export function sceneSVG(W, H) {
  const k = H / 900, L = W / k, R = x => L - x;
  const r = rand(29);
  let o = stars(r, Math.round(L / 16), L, 380);
  o += `<circle class="smoon" cx="${R(84)}" cy="128" r="22"/><circle class="ssky" cx="${R(75)}" cy="121" r="20"/>`;

  /* the far skyline, the whole width: rooftops the board hides the middle of */
  let sky = `M0 ${G} V702`;
  for (let x = 0, i = 0; x < L; i++) {
    const w = 60 + Math.round(r() * 110), h = 690 - Math.round(r() * 70);
    sky += ` H${x} V${h} H${x + w}`;
    x += w;
  }
  o += `<path class="sf far" d="${sky} V${G} H0 Z"/>`;

  /* LEFT: two chimneys behind a sawtooth shed, a gantry over the floor with
   * a lamp and a crate on its hook, and stock stacked by the wall */
  o += chimney(70, 236, 38, 1) + chimney(150, 318, 30, 1);
  o += sawtooth(r, -20, 470, 640, 5);
  o += gantry(-12, 560, 448, 182);
  o += pendant(90, 474, 560);
  o += crate(18, G, 54) + crate(76, G, 46) + crate(30, G - 54, 42) + drum(132, 30, 44) + drum(166, 30, 44);

  /* RIGHT: a water tower over the assembly hall, the hall's bay door lit
   * from inside, and the arm on its plinth in front of it */
  const tx = R(112);
  o += `<path class="sl" d="M${tx - 40} 570 L${tx - 30} 410 M${tx + 40} 570 L${tx + 30} 410 M${tx - 37} 530 L${tx + 34} 470 M${tx + 37} 530 L${tx - 34} 470 M${tx - 34} 470 L${tx + 32} 418 M${tx + 34} 470 L${tx - 32} 418"/>`;
  o += `<path class="sf far" d="M${tx - 52} 410 V350 Q${tx} 314 ${tx + 52} 350 V410 Z"/><path class="sd" d="M${tx - 52} 370 H${tx + 52} M${tx - 52} 390 H${tx + 52}"/>`;
  o += `<circle class="slamp" cx="${tx}" cy="326" r="4"/>`;
  o += `<path class="sf" d="M${R(470)} ${G} V566 H${R(380)} V528 H${R(190)} V566 H${R(-20)} V${G} Z"/>`;
  for (let x = R(360); x < R(200); x += 34) o += win(r, x, 538, 20, 18, 0.45);
  for (let x = R(450); x < R(10); x += 40) if (x < R(250) || x > R(30)) o += win(r, x, 588, 24, 30, 0.3);
  const d0 = R(250), d1 = R(30);
  o += `<path class="sglow" d="M${d0} ${G} L${d0 - 70} 900 H${d1 + 70} L${d1} ${G} Z"/>`;
  o += `<rect class="sdoor" x="${d0}" y="640" width="${d1 - d0}" height="${G - 640}"/>`;
  for (let y = 656; y < G; y += 18) o += `<path class="swl" d="M${d0 + 4} ${y} H${d1 - 4}"/>`;
  o += `<path class="sl" d="M${d0 - 6} ${G} V634 H${d1 + 6} V${G}"/>`;
  o += arm([R(130)], [R(130), 712], [R(84), 560], [R(250), 486]);

  /* THE FLOOR, the whole width: a hazard edge, a belt running in towards
   * the board from either side, and plate seams */
  o += `<rect class="sground" x="0" y="${G}" width="${Math.ceil(L)}" height="${900 - G}"/>`;
  for (let x = 0; x < L; x += 30) o += `<path class="shaz" d="M${x} ${G} h14 l-10 10 h-14 Z"/>`;
  o += `<path class="sl" d="M0 846 H${L} M0 878 H${L}"/>`;
  const mid = L / 2;
  for (let x = 20; x < L; x += 44) {
    const dir = x < mid ? 1 : -1;
    o += `<path class="sbelt" d="M${x - 6 * dir} 853 l${12 * dir} 9 l${-12 * dir} 9"/>`;
  }
  for (let x = 0; x < L; x += 132) o += `<path class="sd" d="M${x} 878 V900"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><g transform="scale(${k.toFixed(5)})">${o}</g></svg>`;
}

/* The CSS for it, folded into the game's stylesheet. */
export const SCENE_CSS = `
.scene .sf{fill:#0a0f1d;stroke:#2a3960;stroke-width:2;stroke-linejoin:round}
.scene .sf.far{fill:#080c18;stroke:#1d2948}
.scene .sground{fill:#070a13}
.scene .sl{fill:none;stroke:#2a3960;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.scene .sd{fill:none;stroke:#1d2948;stroke-width:1.5;stroke-linecap:round}
.scene .sx{fill:#111a30}
.scene .sw{fill:${TOKENS.warn};opacity:.3}
.scene .swl{fill:none;stroke:${TOKENS.warn};stroke-width:2;opacity:.24}
.scene .sdoor{fill:${TOKENS.warn};opacity:.07}
.scene .sglow{fill:${TOKENS.warn};opacity:.035}
.scene .shaz{fill:${TOKENS.hazard};opacity:.16}
.scene .shaz.dim{opacity:.08}
.scene .sbelt{fill:none;stroke:${TOKENS.warn};stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.3}
.scene .sad{fill:${TOKENS.accent};opacity:.45}
.scene .slamp{fill:${TOKENS.danger};opacity:.55}
.scene .slimb-o{fill:none;stroke:#2a3960;stroke-linecap:round}
.scene .slimb{fill:none;stroke:#0a0f1d;stroke-linecap:round}
.scene .ssmoke{fill:${TOKENS.ink};opacity:.05}
.scene .st{fill:${TOKENS.ink};opacity:.45}
.scene .smoon{fill:${TOKENS.text};opacity:.32}
.scene .ssky{fill:${TOKENS.bg}}
`;

/* Draws into el, and again whenever el changes size. */
export function mountScene(el) {
  if (!el) return;
  let last = "";
  const draw = () => {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H || W + "x" + H === last) return;
    last = W + "x" + H;
    el.innerHTML = sceneSVG(W, H);
  };
  draw();
  if (window.ResizeObserver) new ResizeObserver(draw).observe(el);
  else window.addEventListener("resize", draw);
}
