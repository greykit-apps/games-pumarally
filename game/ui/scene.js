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
 * from the left edge, or from the right edge through R(). It draws on its
 * own little generator, never the game's RNG.
 *
 * IT MOVES, BARELY. The night is lit -- a sky that lightens to a sodium haze
 * over the rooftops, a halo round the moon, a far row of towers with red
 * lights on their masts -- and a few things in it are alive: smoke flowing
 * off the chimneys, the warning lamps pulsing, a handful of stars, the belt
 * on the floor creeping in towards the board, the crate swaying on its hook,
 * the arm slowly working, a window or two flickering. Every one is a CSS
 * animation of opacity or a transform, slow and dim, so the eye is never
 * drawn off the board; reduced motion stops them all where they stand. */
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
    /* one big star in three twinkles, each on its own clock */
    const tw = big && r() < 0.34 ? ` tw" style="animation-duration:${(3 + r() * 4).toFixed(1)}s;animation-delay:-${(r() * 6).toFixed(1)}s` : "";
    o += `<circle class="st${tw}" cx="${x}" cy="${y}" r="${big ? 1.6 : 1}"/>`;
  }
  return o;
}

function win(r, x, y, w, h, rate) {
  const lit = r() < rate, fl = lit && r() < 0.12;
  return `<rect class="${lit ? "sw" : "sx"}${fl ? " fl" : ""}"${fl ? ` style="animation-delay:-${(r() * 11).toFixed(1)}s"` : ""} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

/* A chimney: a tapered stack, two bands, a red warning lamp on the lip and
 * smoke leaning in towards the floor. dir is +1 to lean right, -1 left. */
function chimney(x, top, w, dir) {
  let o = `<path class="sf far" d="M${x - w / 2} ${G} L${x - w * 0.38} ${top} H${x + w * 0.38} L${x + w / 2} ${G} Z"/>`;
  o += `<path class="sd" d="M${x - w * 0.38} ${top + 16} H${x + w * 0.38} M${x - w * 0.4} ${top + 40} H${x + w * 0.4}"/>`;
  o += `<circle class="slamp" style="animation-delay:-${(x % 7) * 0.4}s" cx="${x}" cy="${top - 7}" r="4"/>`;
  /* the plume as it stands, and puffs flowing along it: each leaves the lip
     small and goes out along the plume, swelling and fading */
  for (const [dx, dy, rx, ry] of [[10, -34, 22, 12], [40, -66, 34, 17], [82, -100, 48, 22], [138, -128, 62, 26]]) {
    o += `<ellipse class="ssmoke" cx="${x + dx * dir}" cy="${top + dy}" rx="${rx}" ry="${ry}"/>`;
  }
  const PUFFS = 5, LIFE = 14;
  for (let i = 0; i < PUFFS; i++) {
    o += `<ellipse class="spuff" style="--tx:${150 * dir}px;--ty:-140px;animation-delay:-${(i * LIFE / PUFFS + (x % 5)).toFixed(1)}s" cx="${x}" cy="${top - 18}" rx="16" ry="9"/>`;
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
  /* the load hangs from the trolley and sways on it, very slightly */
  o += `<g class="ssway" style="transform-origin:${hookX}px ${y + 48}px">`;
  o += `<path class="sd" d="M${hookX - 8} ${y + 48} V${y + 170} M${hookX + 8} ${y + 48} V${y + 170}"/>`;
  o += `<path class="sl" d="M${hookX - 36} ${y + 196} L${hookX} ${y + 170} L${hookX + 36} ${y + 196}"/>`;
  o += `<rect class="sf" x="${hookX - 40}" y="${y + 196}" width="80" height="64"/>`;
  o += `<path class="sd" d="M${hookX - 40} ${y + 196} L${hookX + 40} ${y + 260} M${hookX + 40} ${y + 196} L${hookX - 40} ${y + 260}"/>`;
  o += `</g>`;
  return o;
}

/* A shop lamp hung from the beam, and the cone it throws on the floor. */
function pendant(x, y0, y1) {
  return `<path class="sd" d="M${x} ${y0} V${y1}"/>`
    + `<path class="sglow sbreathe" d="M${x - 10} ${y1 + 8} L${x - 90} ${G + 40} H${x + 90} L${x + 10} ${y1 + 8} Z"/>`
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
  const a = Math.atan2(wy - ey, wx - ex), ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  const tip = (side) => {
    const k = side * 16;
    return `M${wx + px * k} ${wy + py * k} L${wx + px * k + ux * 30} ${wy + py * k + uy * 30} L${wx + px * k * 0.5 + ux * 44} ${wy + py * k * 0.5 + uy * 44}`;
  };
  const joint = (x, y, rr) => `<circle class="sf" cx="${x}" cy="${y}" r="${rr}"/><circle class="sad" cx="${x}" cy="${y}" r="${rr * 0.35}"/>`;
  /* the arm at work, slowly: the upper limb nods about the shoulder, the
     forearm swings about the elbow on a longer clock, and the gripper opens
     and closes at the wrist, so the three never line up the same way twice */
  o += `<g class="sarm-up" style="transform-origin:${sx}px ${sy}px">` + limb([sx, sy], [ex, ey], 30);
  o += `<g class="sarm-fore" style="transform-origin:${ex}px ${ey}px">` + limb([ex, ey], [wx, wy], 22);
  o += `<g class="sarm-grip" style="transform-origin:${wx}px ${wy}px"><path class="sl" d="${tip(1)} ${tip(-1)}"/></g>` + joint(wx, wy, 9) + `</g>`;
  o += joint(ex, ey, 12) + `</g>` + joint(sx, sy, 15);
  return o;
}

/* The scene for a box W x H pixels. */
export function sceneSVG(W, H) {
  const k = H / 900, L = W / k, R = x => L - x;
  const r = rand(29);
  /* the night: darkest overhead, lightening to a sodium haze where the
     factory's lights catch the air over the rooftops. The sky's gradient is
     in the frame's own units, so the moon's shadowed limb, filled with it,
     matches the sky behind exactly */
  let o = `<defs><linearGradient id="sc-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${G}">` +
    `<stop offset="0" stop-color="#04060d"/><stop offset=".62" stop-color="#080d1d"/><stop offset="1" stop-color="#0e1630"/></linearGradient>` +
    `<linearGradient id="sc-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TOKENS.warn}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${TOKENS.warn}" stop-opacity=".07"/></linearGradient>` +
    `<radialGradient id="sc-halo"><stop offset="0" stop-color="${TOKENS.text}" stop-opacity=".1"/><stop offset="1" stop-color="${TOKENS.text}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="sc-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TOKENS.warn}" stop-opacity=".05"/>` +
    `<stop offset="1" stop-color="${TOKENS.warn}" stop-opacity="0"/></linearGradient></defs>`;
  o += `<rect class="ssky" x="0" y="0" width="${Math.ceil(L)}" height="${G}"/>`;
  o += `<rect fill="url(#sc-haze)" x="0" y="430" width="${Math.ceil(L)}" height="${G - 430}"/>`;
  o += stars(r, Math.round(L / 16), L, 380);
  /* the halo over the moon, not behind it: behind, the shadowed limb cut a dark hole in it */
  o += `<circle class="smoon" cx="${R(84)}" cy="128" r="22"/><circle class="ssky" cx="${R(75)}" cy="121" r="20"/>`;
  o += `<circle cx="${R(84)}" cy="128" r="74" fill="url(#sc-halo)"/>`;

  /* the city beyond the works, the whole width: a row of towers, taller and
     dimmer than the rooftops, a window lit here and there and a red light
     on every mast, the masts not in step */
  for (let x = -10; x < L;) {
    const w = 34 + Math.round(r() * 46), top = 520 + Math.round(r() * 110);
    o += `<rect class="sfar2" x="${x}" y="${top}" width="${w}" height="${G - top}"/>`;
    for (let wy = top + 12; wy < 680; wy += 16) for (let wx = x + 7; wx < x + w - 8; wx += 12) {
      if (r() < 0.07) o += `<rect class="sdot${r() < 0.2 ? " fl" : ""}" style="animation-delay:-${(r() * 11).toFixed(1)}s" x="${wx}" y="${wy}" width="4" height="5"/>`;
    }
    if (r() < 0.35) {
      const mx = x + w / 2, mh = 26 + Math.round(r() * 30);
      o += `<path class="sd" d="M${mx} ${top} V${top - mh}"/><circle class="slamp small" style="animation-delay:-${(r() * 3).toFixed(1)}s" cx="${mx}" cy="${top - mh - 3}" r="2.6"/>`;
    }
    x += w + 6 + Math.round(r() * 30);
  }

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
  o += `<rect class="sdoor sbreathe" x="${d0}" y="640" width="${d1 - d0}" height="${G - 640}"/>`;
  for (let y = 656; y < G; y += 18) o += `<path class="swl" d="M${d0 + 4} ${y} H${d1 - 4}"/>`;
  o += `<path class="sl" d="M${d0 - 6} ${G} V634 H${d1 + 6} V${G}"/>`;
  o += arm([R(130)], [R(130), 712], [R(84), 560], [R(250), 486]);

  /* THE FLOOR, the whole width: a hazard edge, a belt running in towards
   * the board from either side, and plate seams */
  o += `<rect class="sground" x="0" y="${G}" width="${Math.ceil(L)}" height="${900 - G}"/>`;
  o += `<rect fill="url(#sc-sheen)" x="0" y="${G}" width="${Math.ceil(L)}" height="${900 - G}"/>`;
  for (let x = 0; x < L; x += 30) o += `<path class="shaz" d="M${x} ${G} h14 l-10 10 h-14 Z"/>`;
  o += `<path class="sl" d="M0 846 H${L} M0 878 H${L}"/>`;
  /* the belt's chevrons creep in towards the board from either side: each
     half moves one pitch and starts again, so the loop never shows. The
     board covers the middle, where the two halves meet */
  const mid = L / 2, PITCH = 44;
  for (const dir of [1, -1]) {
    o += `<g class="sbeltrun" style="--run:${PITCH * dir}px">`;
    for (let x = 20 - PITCH; x < L + PITCH; x += PITCH) {
      if ((x < mid) !== (dir === 1)) continue;
      o += `<path class="sbelt" d="M${x - 6 * dir} 853 l${12 * dir} 9 l${-12 * dir} 9"/>`;
    }
    o += `</g>`;
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
.scene .sw{fill:${TOKENS.warn};--o:.3;opacity:var(--o)}
.scene .swl{fill:none;stroke:${TOKENS.warn};stroke-width:2;opacity:.24}
.scene .sdoor{fill:${TOKENS.warn};--o:.07;opacity:var(--o)}
.scene .sglow{fill:${TOKENS.warn};--o:.035;opacity:var(--o)}
.scene .shaz{fill:${TOKENS.hazard};opacity:.16}
.scene .shaz.dim{opacity:.08}
.scene .sbelt{fill:none;stroke:${TOKENS.warn};stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.3}
.scene .sad{fill:${TOKENS.accent};opacity:.45}
.scene .slamp{fill:${TOKENS.danger};--o:.55;opacity:var(--o)}
.scene .slimb-o{fill:none;stroke:#2a3960;stroke-linecap:round}
.scene .slimb{fill:none;stroke:#0a0f1d;stroke-linecap:round}
.scene .ssmoke{fill:${TOKENS.ink};opacity:.05}
.scene .st{fill:${TOKENS.ink};opacity:.45}
.scene .smoon{fill:${TOKENS.text};opacity:.32}
.scene .ssky{fill:url(#sc-sky)}
.scene .sfar2{fill:#060913;stroke:#141c33;stroke-width:1.5}
.scene .sdot{fill:${TOKENS.warn};--o:.22;opacity:var(--o)}
.scene .slamp.small{--o:.5}
.scene .spuff{fill:${TOKENS.ink};opacity:0;transform-box:fill-box;transform-origin:50% 50%;animation:sc-puff 14s linear infinite}

/* the life in it: slow, dim, and only opacity and transforms */
.scene .slamp{animation:sc-lamp 2.8s ease-in-out infinite}
.scene .st.tw{animation:sc-twinkle 5s ease-in-out infinite}
.scene .fl{animation:sc-flicker 11s steps(1) infinite}
.scene .sbreathe{animation:sc-breathe 7s ease-in-out infinite alternate}
.scene .sbeltrun{animation:sc-belt 3.2s linear infinite}
.scene .ssway{animation:sc-sway 7s ease-in-out infinite alternate}
.scene .sarm-up{animation:sc-arm-up 11s ease-in-out infinite alternate}
.scene .sarm-fore{animation:sc-arm-fore 7s ease-in-out infinite alternate}
.scene .sarm-grip{animation:sc-arm-grip 4.5s ease-in-out infinite alternate}
@keyframes sc-puff{0%{opacity:0;transform:translate(0,0) scale(.5)}15%{opacity:.045}
  100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(2.6)}}
@keyframes sc-lamp{0%,100%{opacity:var(--o)}50%{opacity:calc(var(--o) * .25)}}
@keyframes sc-twinkle{0%,100%{opacity:.45}50%{opacity:.12}}
@keyframes sc-flicker{0%,100%{opacity:var(--o)}91%{opacity:calc(var(--o) * .25)}92%{opacity:var(--o)}93.5%{opacity:calc(var(--o) * .3)}94.5%{opacity:var(--o)}}
@keyframes sc-breathe{from{opacity:calc(var(--o) * .7)}to{opacity:calc(var(--o) * 1.3)}}
@keyframes sc-belt{from{transform:translateX(0)}to{transform:translateX(var(--run))}}
@keyframes sc-sway{from{transform:rotate(-1.4deg)}to{transform:rotate(1.4deg)}}
@keyframes sc-arm-up{from{transform:rotate(-2deg)}to{transform:rotate(2.5deg)}}
@keyframes sc-arm-fore{from{transform:rotate(-5deg)}to{transform:rotate(4deg)}}
@keyframes sc-arm-grip{from{transform:rotate(-4deg)}to{transform:rotate(5deg)}}
@media (prefers-reduced-motion:reduce){.scene *{animation:none!important}}
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
