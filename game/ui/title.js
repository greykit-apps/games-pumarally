/* The boot, the intro and the title: the greykit.games Tactical canon, and the
 * table, the board games' title (games-meta STANDARD.md §3, §14 and §15).
 * Each block between its sentinels is games-meta's canon/ copy, taken whole:
 * @gk-title v0.4 (the boot byte for byte, as every game's), then @gk-intro and
 * @gk-table, which drive it from outside and change nothing in it. They are
 * plain script, so they share this module's scope; the exports are below the
 * last block.
 *
 * Nothing in this file knows it is PumaRally. The name, the menu, the hand's
 * dress, the help, the about and the settings arrive from main.js; the race
 * behind the title is tablescene.js. */

/* @gk-title-begin v0.4 -- greykit.games canon (games-meta STANDARD.md §3),
 * in every Tactical game. The copy of record is games-meta's
 * canon/gk-title.js: change it there and bump the version, never in one game.
 * The boot is the rule -- every game's matches canon's, and
 * tools/diff-standard.sh says where one differs. The title is the default:
 * a game keeps the version it took. Plain script, no imports or exports, so
 * a single-file game can paste it into a classic <script>. */

/* greykit.com's mark: the right half of the face, flat cut on the left
 * (greykitweb/assets/greykit-mark.png at 240px). */
const MARK = "data:image/png;base64,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";

const TITLE_CSS = `
/* ---- scrollbars, page-wide: a thin steel thumb on whatever ground it
   crosses, lit on hover. scrollbar-color covers Firefox and current
   Chromium; the -webkit- rules are for Safari, which ignores it. ---- */
*{scrollbar-width:thin;scrollbar-color:#2a3a5e transparent}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:#2a3a5e;border:2px solid transparent;background-clip:padding-box;border-radius:5px}
::-webkit-scrollbar-thumb:hover{background:#47609c;background-clip:padding-box}

/* ---- boot ---- */
/* above anything a game layers its own screens with */
.gk-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--bg);
  --S:120px;--d:calc(var(--S) * .275);transition:opacity .35s ease}
.gk-boot.gk-out{opacity:0;pointer-events:none}
.gk-boot .gk-bar{position:absolute;top:0;left:0;height:2px;width:100%;background:var(--accent);
  box-shadow:0 0 12px var(--accent);transform-origin:0 50%;transform:scaleX(0);
  animation:gk-bar 1.8s cubic-bezier(.22,1,.36,1) .1s forwards}
.gk-boot.gk-ready .gk-bar{animation:gk-bar-end .3s ease-out forwards}
/* the whole face is the mark beside its mirror; the frame edge cuts the
   right half away as the face slides, and the left half -- the mark flipped,
   as greykit.com shows it -- is what stays, centred */
.gk-boot .gk-face{position:relative;width:calc(var(--S) * 2);height:var(--S);opacity:0;
  clip-path:inset(-40% 36.25% -40% -40%);animation:gk-show .2s ease-out .05s forwards}
.gk-boot .gk-slide{position:absolute;inset:0;transform:translateX(calc(var(--d) * -1));
  animation:gk-slide .6s cubic-bezier(.65,0,.35,1) .5s forwards}
.gk-boot .gk-lh,.gk-boot .gk-rh{position:absolute;top:0;width:var(--S);height:var(--S)}
/* the halves overlap by 2px, the left on top: two images laid edge to edge
   are anti-aliased edge by edge, and some browsers (Brave) leave a hairline
   of background between them */
.gk-boot .gk-lh{left:0;z-index:1}
.gk-boot .gk-rh{left:calc(var(--S) - 2px)}
.gk-boot .gk-pulse{width:100%;height:100%;position:relative;transform-origin:100% 50%;animation:gk-pulse .7s ease-in-out 1.15s}
.gk-boot .gk-face img{display:block;width:100%;height:100%;filter:invert(1) brightness(.72)}
.gk-boot .gk-pulse img{animation:gk-glow .7s ease-in-out 1.15s}
.gk-boot .gk-lh img,.gk-boot .gk-glint{transform:scaleX(-1)}
.gk-boot .gk-glint{position:absolute;inset:0;opacity:0;
  background:linear-gradient(110deg,transparent 38%,rgba(255,255,255,.95) 50%,transparent 62%) no-repeat;
  background-size:300% 100%;background-position:120% 0;
  -webkit-mask:url(${MARK}) center/100% 100% no-repeat;mask:url(${MARK}) center/100% 100% no-repeat;
  animation:gk-glint .65s ease-in-out 1.2s}
.gk-boot.gk-done .gk-face{animation:gk-out .3s ease-in forwards}
.gk-boot .gk-log{position:absolute;left:24px;bottom:22px;font-size:12px;color:var(--dim);line-height:1.7}
.gk-boot .gk-log div{white-space:nowrap}
.gk-boot .gk-log b{color:var(--accent);font-weight:400}
.gk-boot .gk-log .gk-ok{color:var(--good)}
.gk-boot .gk-skip{position:absolute;right:24px;bottom:22px;font-size:11px;color:var(--dim);opacity:0;animation:gk-show .3s .4s forwards}
.gk-boot .gk-scan{position:absolute;left:0;right:0;top:0;height:1px;background:var(--accent);
  box-shadow:0 0 16px 2px rgba(84,242,255,.6);opacity:0}
.gk-boot.gk-ready .gk-scan{animation:gk-scan .5s cubic-bezier(.5,0,.6,1) forwards}
@keyframes gk-bar{0%{transform:scaleX(0)}55%{transform:scaleX(.72)}100%{transform:scaleX(.92)}}
@keyframes gk-bar-end{from{transform:scaleX(.92)}to{transform:scaleX(1);opacity:0}}
@keyframes gk-show{to{opacity:1}}
@keyframes gk-out{from{opacity:1}to{opacity:0}}
@keyframes gk-slide{to{transform:translateX(var(--d))}}
@keyframes gk-pulse{0%,50%,100%{transform:scale(1)}25%{transform:scale(1.07)}75%{transform:scale(1.04)}}
@keyframes gk-glow{0%,50%,100%{filter:invert(1) brightness(.72)}
  25%{filter:invert(1) brightness(.95) drop-shadow(0 0 14px rgba(84,242,255,.55))}
  75%{filter:invert(1) brightness(.85) drop-shadow(0 0 8px rgba(84,242,255,.4))}}
@keyframes gk-glint{0%{opacity:1;background-position:120% 0}100%{opacity:1;background-position:-20% 0}}
@keyframes gk-scan{0%{top:0;opacity:1}100%{top:100%;opacity:.2}}

/* ---- title: the game's picture behind; down the left, the name, a line
   under it, and the menu in a panel of its own -- a key, the item, what it
   says about itself, and Settings, Help and About on one row under the rest.
   Airborne Puma's and Raid on Puma Bay's title, made the default.
   A game colours it with these, set on .gk-title or anywhere above it; each
   falls back to the palette: --gk-title-ink (the name, a lit row),
   --gk-title-hi (the name's second line), --gk-title-focus (the row with
   the focus; --gk-title-hi if left out), --gk-title-dim,
   --gk-title-panel, --gk-title-line, and --gk-title-font. ---- */
.gk-title{--t-ink:var(--gk-title-ink,var(--text));--t-hi:var(--gk-title-hi,var(--accent));--t-focus:var(--gk-title-focus,var(--t-hi));--t-dim:var(--gk-title-dim,var(--dim));
  --t-panel:var(--gk-title-panel,color-mix(in srgb,var(--panel) 92%,transparent));--t-line:var(--gk-title-line,var(--line));
  --t-x:clamp(16px,7vw,120px);
  position:relative;min-height:100dvh;display:flex;flex-direction:column;font-family:var(--gk-title-font,inherit)}
.gk-title>.scene{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  background:linear-gradient(#05070f 0%,#070b17 40%,#0c1020 68%,#181622 88%,#231a17 100%)}
.gk-title>.scene>svg,.gk-title>.scene>canvas{display:block;width:100%;height:100%}
/* a shade down the left for the name and menu, and at the foot for the credit */
.gk-title>.gk-shade{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 86%,transparent) 0%,color-mix(in srgb,var(--bg) 62%,transparent) 32%,
    color-mix(in srgb,var(--bg) 10%,transparent) 60%,transparent 72%),
    linear-gradient(transparent calc(100% - 90px),color-mix(in srgb,var(--bg) 60%,transparent))}
.gk-title>main{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;
  box-sizing:border-box;width:min(560px,100%);padding:32px 16px 72px var(--t-x)}
.gk-title h1{margin:0;font-size:clamp(44px,6.4vw,92px);line-height:.9;font-weight:700;letter-spacing:.005em;text-transform:uppercase;
  color:var(--t-ink);text-shadow:0 4px 28px rgba(0,0,0,.45)}
.gk-title h1 span{display:block}
.gk-title h1 span+span{color:var(--t-hi)}
.gk-title .gk-sub{margin:16px 0 0;font-size:14px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--t-dim)}
.gk-menu{display:flex;flex-direction:column;box-sizing:border-box;width:min(460px,100%);margin-top:30px;padding:8px 0;
  background:var(--t-panel);border:1px solid var(--t-line);border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.gk-menu button{position:relative;display:flex;align-items:center;gap:14px;width:100%;height:50px;padding:0 22px;
  font:inherit;font-size:20px;font-weight:500;text-align:left;color:color-mix(in srgb,var(--t-ink) 86%,transparent);
  background:transparent;border:0;border-radius:0;cursor:pointer}
.gk-menu .gk-lbl{flex:none;white-space:nowrap}
.gk-menu .gk-meta{margin-left:auto;min-width:0;font-size:15px;color:color-mix(in srgb,var(--t-dim) 80%,transparent);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gk-menu kbd{flex:none;font:inherit;font-size:15px;min-width:26px;padding:1px 5px;text-align:center;color:var(--t-dim);
  border:1px solid var(--t-line);border-radius:3px}
.gk-menu .gk-primary{color:var(--t-ink);font-weight:600}
.gk-menu button:hover{color:var(--t-ink);background:color-mix(in srgb,var(--t-focus) 8%,transparent)}
/* the row with the focus: a pointer at its left edge and a wash fading out
   across it; :focus and not :focus-visible, so the default shows it too */
.gk-menu button:focus{outline:none;color:var(--t-ink);font-weight:600;
  background:linear-gradient(90deg,color-mix(in srgb,var(--t-focus) 26%,transparent),color-mix(in srgb,var(--t-focus) 6%,transparent) 75%,transparent)}
.gk-menu button:focus::before{content:"";position:absolute;left:7px;top:50%;margin-top:-6px;
  border-left:7px solid var(--t-focus);border-top:6px solid transparent;border-bottom:6px solid transparent}
.gk-menu button:focus kbd{color:var(--t-ink);border-color:var(--t-focus)}
.gk-menu button:focus .gk-meta{color:var(--t-dim)}
.gk-menu .gk-util{display:flex;margin-top:6px;padding-top:6px;border-top:1px solid color-mix(in srgb,var(--t-line) 60%,transparent)}
.gk-menu .gk-util button{flex:1 1 auto;width:auto;min-width:0;height:44px;font-size:16px;gap:10px;padding:0 14px}
.gk-menu .gk-util button:first-child{padding-left:22px}
.gk-menu .gk-util kbd{font-size:13px;min-width:22px}
/* the menu arriving, a line at a time; the name decodes as it does */
.gk-title.gk-rise .gk-sub{animation:gk-rise .5s cubic-bezier(.22,1,.36,1) both}
.gk-title.gk-rise .gk-pr{animation:gk-pr .32s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 45ms) both}
@keyframes gk-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes gk-pr{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gk-title.gk-rise .gk-sub,.gk-title.gk-rise .gk-pr{animation:none}}
.gk-title>footer{position:absolute;z-index:1;left:var(--t-x);right:16px;bottom:24px;font-size:13px;color:var(--t-dim)}
.gk-credit a{color:var(--steel)}
/* a phone: the shade covers the whole picture, and the row of three keeps
   its words and drops its keys, which a phone has none of */
@media (max-width:640px){
  .gk-title>.gk-shade{background:color-mix(in srgb,var(--bg) 66%,transparent)}
  .gk-menu .gk-util button,.gk-menu .gk-util button:first-child{justify-content:center;padding:0 6px}
  .gk-menu .gk-util kbd{display:none}
}

/* ---- settings, help and about, over the title ---- */
.gk-sheet{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(3,5,10,.9);padding:16px}
.gk-sheet .gk-box{width:min(640px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--lit);border-radius:2px}
.gk-sheet .gk-head{display:flex;align-items:center;gap:12px;padding:14px 18px 0}
.gk-sheet .gk-head h2{margin:0;flex:1;font-size:14px;letter-spacing:.2em;color:var(--accent)}
.gk-sheet .gk-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:12px 18px 0}
.gk-sheet .gk-body{padding:14px 18px 18px;overflow-y:auto;color:var(--ink);line-height:1.6}
.gk-sheet .gk-body p{margin:0 0 10px}
.gk-sheet .gk-body b{color:var(--text);font-weight:600}
.gk-sheet .gk-body h3{margin:16px 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600}
.gk-sheet .gk-body h3:first-child{margin-top:0}
.gk-sheet .gk-body ol,.gk-sheet .gk-body ul{margin:0 0 10px;padding-left:20px}
.gk-sheet kbd{font:inherit;font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:2px;
  padding:0 4px;min-width:18px;text-align:center;display:inline-block;letter-spacing:0}
.gk-sheet .gk-body table{border-collapse:collapse;margin:0 0 10px}
.gk-sheet .gk-body td{padding:3px 12px 3px 0;vertical-align:top}
.gk-sheet .gk-body a{color:var(--steel)}
.gk-sheet .gk-row{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}
.gk-sheet .gk-note{color:var(--dim);font-size:12px}
`;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const escHTML = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Run the boot over the page while the game loads.
 *   lines: what the log says straight away (strings), one every ~0.55s
 * Returns { finish(lines), cancel() }. finish() takes the lines to add once
 * loading is done, plays out the boot's minimum run, and resolves when the
 * boot starts to fade -- mount the title before calling it, so the fade
 * reveals it.
 */
function runBoot({ lines = [] } = {}) {
  if (reduced()) return { finish: async () => {}, cancel() {} };
  const el = document.createElement("div");
  el.className = "gk-boot";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="gk-bar"></div><div class="gk-face"><div class="gk-slide">' +
    '<div class="gk-lh"><div class="gk-pulse"><img alt=""><div class="gk-glint"></div></div></div>' +
    '<div class="gk-rh"><img alt=""></div></div></div>' +
    '<div class="gk-log"></div><div class="gk-scan"></div><div class="gk-skip">any key to skip</div>';
  /* set, not written into the markup: asset checkers read every src attribute as a file path */
  el.querySelectorAll("img").forEach(img => { img.src = MARK; });
  document.body.appendChild(el);
  const log = el.querySelector(".gk-log");
  const t0 = performance.now();
  const timers = [];
  const say = html => { const d = document.createElement("div"); d.innerHTML = "&gt; " + html; log.appendChild(d); };
  lines.forEach((l, i) => timers.push(setTimeout(() => say(l), 150 + i * 550)));
  /* a key that skips the boot is spent on it: it never reaches the title underneath */
  let skipped = false, skip = () => {};
  const onSkip = ev => { ev.preventDefault(); ev.stopPropagation(); skipped = true; skip(); };
  window.addEventListener("keydown", onSkip, true);
  el.addEventListener("pointerdown", onSkip);
  const wait = ms => new Promise(r => { const t = setTimeout(r, ms); timers.push(t); skip = () => { clearTimeout(t); r(); }; });
  const off = () => { timers.forEach(clearTimeout); window.removeEventListener("keydown", onSkip, true); };
  return {
    async finish(more = []) {
      /* the rest of the log, then ready: never before the face has pulsed */
      const at = Math.max(150 + lines.length * 550, performance.now() - t0);
      for (const [i, l] of more.entries()) timers.push(setTimeout(() => say(l), Math.max(0, at + i * 300 - (performance.now() - t0))));
      const readyAt = Math.max(1850, at + more.length * 300);
      if (!skipped) await wait(readyAt - (performance.now() - t0));
      say('<span class="gk-ok">ready</span>');
      el.classList.add("gk-ready");
      el.classList.add("gk-done");
      if (!skipped) await wait(550);
      off();
      el.classList.add("gk-out");
      setTimeout(() => el.remove(), 400);
    },
    cancel() { off(); el.remove(); }
  };
}

/**
 * The title screen's markup, for a game that draws its own screens: the same
 * HTML mountTitle puts in. cfg is mountTitle's name, lines, sub, items and
 * primary; scene: true leaves a .scene for the game's backdrop, and a game
 * whose backdrop is already drawn behind its pages leaves it out. The items
 * before the "gap" are the menu's rows, with their meta; the ones after it
 * share the row under them, without.
 */
function titleHTML(cfg) {
  const items = cfg.items.filter(Boolean), gap = items.indexOf("gap");
  const rows = gap < 0 ? items : items.slice(0, gap), util = gap < 0 ? [] : items.slice(gap + 1);
  let i = 0;
  const btn = (it, meta) => '<button data-act="' + it.act + '" class="gk-pr' + (it.act === cfg.primary ? " gk-primary" : "") + '" style="--i:' + i++ +
    '"><kbd>' + escHTML(it.key) + '</kbd><span class="gk-lbl">' + escHTML(it.label) + "</span>" +
    (meta && it.meta ? '<span class="gk-meta">' + escHTML(it.meta) + "</span>" : "") + "</button>";
  return '<div class="gk-title">' + (cfg.scene ? '<div class="scene" aria-hidden="true"></div>' : "") + '<div class="gk-shade" aria-hidden="true"></div>' +
    '<main><h1 aria-label="' + escHTML(cfg.name) + '">' + titleLines(cfg).map(l => '<span data-t="' + escHTML(l) + '">' + escHTML(l) + "</span>").join("") + "</h1>" +
    (cfg.sub ? '<p class="gk-sub">' + escHTML(cfg.sub) + "</p>" : "") +
    '<nav class="gk-menu" aria-label="Main menu">' + rows.map(it => btn(it, true)).join("") +
    (util.length ? '<div class="gk-util">' + util.map(it => btn(it, false)).join("") + "</div>" : "") +
    '</nav></main><footer><span class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></span></footer></div>';
}

/* The name's lines: the game's own, or the name broken once, at the space
 * nearest its middle -- "Raid on / Puma Bay", "Airborne / Puma". */
function titleLines(cfg) {
  if (cfg.lines) return cfg.lines;
  const n = cfg.name, mid = n.length / 2;
  let at = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === " " && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i;
  return at < 0 ? [n] : [n.slice(0, at), n.slice(at + 1)];
}

/* the name decodes out of noise once, as the screen arrives -- by the
 * clock, not by ticks, so a throttled background tab still ends on time.
 * Each line decodes in its own span; an h1 without them, as itself. */
function decodeTitle(h1) {
  if (reduced()) return;
  const spans = [...h1.querySelectorAll("span[data-t]")];
  const parts = spans.length ? spans.map(s => [s, s.dataset.t]) : [[h1, h1.getAttribute("aria-label")]];
  const glyphs = "▚▞▖▗▘▝#/\\<>=+", t0 = performance.now(), ms = 400;
  const t = setInterval(() => {
    const p = (performance.now() - t0) / ms;
    if (!h1.isConnected || p >= 1) { clearInterval(t); for (const [el, text] of parts) el.textContent = text; return; }
    for (const [el, text] of parts) {
      const done = Math.floor(text.length * p);
      el.textContent = text.slice(0, done) + [...text.slice(done)].map(c => c === " " ? " " : glyphs[Math.random() * glyphs.length | 0]).join("");
    }
  }, 28);
}

/* The title's stylesheet, once, for a game that does not build its own CSS
 * around TITLE_CSS. */
function injectTitleCSS() {
  if (!document.getElementById("gk-title-css")) document.head.insertAdjacentHTML("beforeend", '<style id="gk-title-css">' + TITLE_CSS + "</style>");
}

/* The boot log's first line: the page being reloaded, escaped. */
function bootReloadLine() {
  return "reload <b>" + escHTML(location.pathname.replace(/index\.html$/, "")) + "</b>";
}

/* The entrance: the menu prints in, the name decodes, the default is focused.
 * t is the .gk-title (the page's, if left out); the name is read off the h1. */
function revealTitle(t = document.querySelector(".gk-title")) {
  if (!t) return;
  t.classList.add("gk-rise");
  decodeTitle(t.querySelector("h1"));
  const b = t.querySelector(".gk-primary") || t.querySelector(".gk-menu button");
  if (b) b.focus({ preventScroll: true });
}

/* The menu button a key presses: the one whose <kbd> shows that key, and the
 * ? item for h and / as well. Read off the menu itself, so a key and its
 * label cannot disagree. null when the key is not the menu's. */
function titleKeyButton(menu, key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const bs = [...menu.querySelectorAll("button")], kbd = b => (b.querySelector("kbd") || {}).textContent || "";
  return bs.find(b => kbd(b).toLowerCase() === k) || ((k === "h" || k === "/") && bs.find(b => kbd(b) === "?")) || null;
}

/* ArrowDown / ArrowUp through the menu, wrapping, a row of several buttons
 * taken as one step; ArrowLeft / ArrowRight along that row. true when the
 * key was one. */
function titleArrow(menu, ev) {
  const a = document.activeElement, row = a && menu.contains(a) && a.parentElement !== menu ? [...a.parentElement.querySelectorAll("button")] : [];
  if (row.length > 1 && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
    ev.preventDefault();
    row[(row.indexOf(a) + (ev.key === "ArrowRight" ? 1 : -1) + row.length) % row.length].focus();
    return true;
  }
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return false;
  const bs = [...menu.querySelectorAll("button")], down = ev.key === "ArrowDown";
  const i = row.length > 1 ? bs.indexOf(down ? row[row.length - 1] : row[0]) : bs.indexOf(a);
  ev.preventDefault();
  bs[(i + (down ? 1 : -1) + bs.length) % bs.length].focus();
  return true;
}

/* A question or a notice in the title's sheet, from any screen of the game,
 * in place of window.confirm and window.alert (STANDARD.md §11): those are
 * silently answered "no", or never shown, where a page is embedded, and a
 * button that does nothing reads as broken. confirmSheet resolves true only
 * on the yes button; Cancel, Escape and the backdrop resolve false.
 * alertSheet resolves when it is dismissed. While one is up it has the keys:
 * Tab stays inside it and nothing reaches the game behind. Focus goes back
 * to whatever had it. */
function confirmSheet(question, yes, title = "Are you sure?") { return dialogSheet(title, question, yes, "Cancel"); }
function alertSheet(message, title = "Notice") { return dialogSheet(title, message, "OK", null); }
function dialogSheet(title, text, yes, no) {
  return new Promise(resolve => {
    const back = document.activeElement;
    const el = document.createElement("div");
    el.className = "gk-sheet";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", title);
    el.innerHTML = '<div class="gk-box"><div class="gk-head"><h2>' + escHTML(title) + '</h2></div><div class="gk-body"><p>' + escHTML(text) +
      "</p><div class='gk-row'><button data-yes>" + escHTML(yes) + "</button>" + (no ? "<button data-no>" + escHTML(no) + "</button>" : "") + "</div></div></div>";
    const done = v => {
      document.removeEventListener("keydown", onKey, true);
      el.remove();
      if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
      resolve(v);
    };
    const onKey = ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(false); return; }
      if (ev.key === "Tab") {
        const bs = [...el.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
        ev.preventDefault();
        bs[(i + (ev.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
      }
      /* nothing reaches the game behind; Enter and Space still press the
         focused button, which is their default, not a listener's */
      ev.stopPropagation();
    };
    el.addEventListener("click", ev => {
      if (ev.target === el) return done(false);
      const b = ev.target.closest("button");
      if (b) done(b.hasAttribute("data-yes"));
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(el);
    el.querySelector("[data-yes]").focus();
  });
}

/**
 * The title screen, into host.
 *   name      the game's name
 *   lines     optional: the name's lines, as ["Raid on", "Puma Bay"]; the
 *             second wears --gk-title-hi. Left out, the name breaks itself.
 *   sub       optional: a line under the name, as "Behind Enemy Lines"
 *   items     the menu, top to bottom: { act, label, key, meta? }, or "gap"
 *             before Settings / Help / About, which share one row; anything
 *             falsy is left out
 *   primary   the act that is the default (lit, and focused)
 *   scene(el) draws the game's backdrop into el
 *   help      [[tab, html], ...]   about: html
 *   settings  { html(), onClick(button, sheet) }; sheet.confirm() as below
 *   onAct(act, ui) every other item; ui.confirm(question, yes) resolves true
 *             or false, asked in a sheet of this screen's own: window.confirm
 *             is silently answered "no" where a page is embedded, and a
 *             button that does nothing reads as broken
 * Returns { reveal(), unmount() }. reveal() runs the title's entrance; call it
 * as the boot fades (or at once, coming back from a game).
 */
function mountTitle(host, cfg) {
  const ctl = new AbortController();
  const sig = { signal: ctl.signal };
  host.innerHTML = titleHTML(cfg);
  const root = host.firstChild, menu = root.querySelector(".gk-menu");
  if (cfg.scene) cfg.scene(root.querySelector(".scene"));
  const focusPrimary = () => { const b = menu.querySelector(".gk-primary") || menu.querySelector("button"); if (b) b.focus({ preventScroll: true }); };

  let sheet = null;
  function openSheet(title, { tabs, html, onClick, refresh }) {
    closeSheet();
    const el = document.createElement("div");
    el.className = "gk-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", title);
    let tab = 0;
    const draw = () => {
      el.innerHTML = '<div class="gk-box"><div class="gk-head"><h2>' + escHTML(title) + '</h2><button data-x aria-label="Close">&times;</button></div>' +
        (tabs ? '<div class="gk-tabs" role="tablist">' + tabs.map(([t], i) => '<button role="tab" data-tab="' + i + '" aria-selected="' + (i === tab) +
          '" aria-pressed="' + (i === tab) + '">' + escHTML(t) + "</button>").join("") + "</div>" : "") +
        '<div class="gk-body">' + (tabs ? tabs[tab][1] : html()) + "</div></div>";
    };
    draw();
    const api = { refresh: () => { draw(); }, close: () => closeSheet(), confirm: (q, yes) => ask(q, yes) };
    el.addEventListener("click", ev => {
      if (ev.target === el) return closeSheet();
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-x")) return closeSheet();
      if (b.dataset.tab !== undefined) { tab = +b.dataset.tab; draw(); el.querySelector('[data-tab="' + tab + '"]').focus(); return; }
      if (onClick) onClick(b, api);
    });
    document.body.appendChild(el);
    sheet = el;
    (el.querySelector('[role="tab"][aria-selected="true"]') || el.querySelector("[data-x]")).focus();
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    const f = onSheetClose; onSheetClose = null;
    if (f) f();
    focusPrimary();
  }

  /** A yes-or-no question in a sheet; resolves true only on the yes button. */
  function ask(question, yes) {
    return new Promise(resolve => {
      let answered = false;
      const done = v => { if (answered) return; answered = true; resolve(v); };
      openSheet("Are you sure?", {
        html: () => "<p>" + escHTML(question) + "</p><div class='gk-row'><button data-yes>" + escHTML(yes) + "</button><button data-no>Cancel</button></div>",
        onClick: (b, s) => { if (b.hasAttribute("data-yes")) { done(true); s.close(); } else if (b.hasAttribute("data-no")) s.close(); }
      });
      sheet.querySelector("[data-yes]").focus();
      onSheetClose = () => done(false);
    });
  }
  let onSheetClose = null;

  function act(a) {
    if (a === "help" && cfg.help) return openSheet("Help", { tabs: cfg.help });
    if (a === "about" && cfg.about) return openSheet("About", { html: () => cfg.about });
    if (a === "settings" && cfg.settings) return openSheet("Settings", cfg.settings);
    cfg.onAct(a, { confirm: ask });
  }
  menu.addEventListener("click", ev => { const b = ev.target.closest("button"); if (b) act(b.dataset.act); }, sig);
  document.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (sheet) { if (ev.key === "Escape") { ev.preventDefault(); closeSheet(); } return; }
    if (ev.target.closest && ev.target.closest("input,select,textarea")) return;
    const hit = titleKeyButton(menu, ev.key);
    if (hit) { ev.preventDefault(); act(hit.dataset.act); return; }
    titleArrow(menu, ev);
  }, sig);

  return {
    reveal() { revealTitle(root); },
    unmount() { ctl.abort(); closeSheet(); }
  };
}
/* @gk-title-end */

/* @gk-intro-begin v0.3 -- greykit.games shared code (games-meta STANDARD.md §14),
 * the integrated intro. A guideline, not a rule: nothing checks it, and a game
 * may take it, change its copy, or leave it. The copy of record is games-meta's
 * canon/gk-intro.js; a game that takes a newer version takes it whole.
 * Needs the @gk-title block loaded first (runBoot, reduced, escHTML,
 * decodeTitle, revealTitle) and changes nothing in it: the boot stays canon's
 * byte for byte, and this drives it from outside. Plain script, no imports or
 * exports, so a single-file game can paste it into a classic <script>.
 *
 * The integrated intro, in order:
 *   1. canon's boot, with a boot sound of the game's (silent on a cold load:
 *      the browser holds audio back until the page has been touched);
 *   2. the boot holds at its end on "Click or press a key to continue" --
 *      that press is what lets the title's music play;
 *   3. the boot fades quickly and the title fades in over the game's own
 *      live or drawn scene, the title music starting;
 *   4. the name arrives on a timer; then the menu prints in as the shade
 *      comes up behind it, with the Sound and Music switches top right and
 *      the greykit.com credit centred under the menu.
 * A key or a click during 3-4 skips to the end of it. */

const INTRO_CSS = `
/* ---- the hold at the end of the boot ---- */
.gk-boot.gki-hold{cursor:pointer}
.gk-boot.gki-hold .gk-skip{display:none}
.gk-boot .gki-prompt{position:absolute;left:16px;right:16px;top:calc(50% + var(--S) / 2 + 84px);text-align:center;
  font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--text);opacity:0;
  animation:gki-in .5s ease-out forwards,gki-breathe 2.6s ease-in-out .5s infinite}
.gk-boot .gki-prompt::before,.gk-boot .gki-prompt::after{content:"";display:inline-block;width:6px;height:6px;margin:0 14px 2px;
  border:1px solid var(--accent);transform:rotate(45deg)}
@keyframes gki-in{to{opacity:1}}
/* the cat blinks while it waits, as greykit.com's mark does (greykitweb
   consulting/index.html, .hero-mark .lid): an eyelid in the face's silver --
   the mark is drawn inverted at brightness .72 -- closing over the eye, every
   eight seconds, the first soon after the hold. The boot shows the mark
   flipped, so the lid sits mirrored from the site's, at +6deg, a little larger
   so it covers the whole eye (71-90% across, 45-60% down the flipped mark). */
.gk-boot .gki-lid{position:absolute;left:66.5%;top:41%;width:29%;height:24%;background:#b8b8b8;border-radius:50%;
  transform:rotate(6deg) scaleY(0);transform-origin:50% 10%;pointer-events:none}
.gk-boot.gki-hold .gki-lid{animation:gki-blink 8s ease-in-out -6s infinite}
@keyframes gki-blink{0%,92.5%{transform:rotate(6deg) scaleY(0)}94%,95.2%{transform:rotate(6deg) scaleY(1)}96.7%,100%{transform:rotate(6deg) scaleY(0)}}
@keyframes gki-breathe{0%,100%{opacity:1}50%{opacity:.42}}

/* ---- the integrated title: the credit centred under the menu (gkIntegrate
   moves the footer there), the switches top right ---- */
.gk-title.gki main>footer{width:min(460px,100%);margin-top:18px;text-align:center;font-size:16px;letter-spacing:.02em;color:var(--t-dim)}
/* the credit: the words lower-cased on screen (the page keeps §1's string
   byte for byte), the name lit in the title's highlight */
.gk-title.gki .gk-credit{text-transform:lowercase}
.gk-title.gki .gk-credit a{color:var(--t-hi,var(--accent));text-decoration:none}
.gk-title.gki .gk-credit a:hover,.gk-title.gki .gk-credit a:focus-visible{text-decoration:underline;text-underline-offset:3px}
.gki-toggles{position:absolute;z-index:2;top:20px;right:24px;display:flex;gap:10px}
.gki-tg{display:flex;align-items:center;gap:9px;height:36px;padding:0 10px 0 11px;font:inherit;color:var(--t-ink,var(--text));cursor:pointer;
  background:var(--t-panel,var(--panel));border:1px solid var(--t-line,var(--line));border-radius:18px}
.gki-tg:hover{border-color:var(--t-focus,var(--accent))}
.gki-tg:focus-visible{outline:2px solid var(--t-focus,var(--accent));outline-offset:2px}
.gki-tg svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gki-tg .gki-sw{position:relative;width:32px;height:18px;border-radius:9px;box-sizing:border-box;
  border:1px solid var(--t-line,var(--line));background:color-mix(in srgb,var(--bg) 70%,transparent);transition:background .18s,border-color .18s}
.gki-tg .gki-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
  background:var(--t-dim,var(--dim));transition:transform .18s cubic-bezier(.3,.7,.4,1),background .18s}
.gki-tg[aria-pressed="true"] .gki-sw{background:color-mix(in srgb,var(--t-focus,var(--accent)) 30%,transparent);border-color:var(--t-focus,var(--accent))}
.gki-tg[aria-pressed="true"] .gki-sw::after{transform:translateX(14px);background:var(--t-focus,var(--accent))}
.gki-tg[aria-pressed="false"]{color:var(--t-dim,var(--dim))}
/* music the master Sound switch has silenced: still its own switch, dimmed */
.gki-tg.gki-held{opacity:.5}
@media (max-width:640px){.gki-toggles{top:12px;right:12px;gap:6px}.gki-tg{height:32px;padding:0 8px;gap:7px}}

/* ---- the entrance: everything but the scene waits; the name on its timer,
   then the menu, the shade (the tint), the switches and the credit together ---- */
.gk-title.gki-intro>.gk-shade,.gk-title.gki-intro h1>span,.gk-title.gki-intro .gk-sub,.gk-title.gki-intro .gk-menu,
.gk-title.gki-intro main>footer,.gk-title.gki-intro .gki-toggles,.gk-title.gki-intro h1 .gki-w{opacity:0}
.gk-title.gki-intro h1>span.gki-on{opacity:1;transition:opacity 1.4s ease-in-out}
.gk-title.gki-intro h1 .gki-w.gki-on{opacity:1;transition:opacity 1.4s ease-in-out}
.gk-title.gki-intro.gki-menu>.gk-shade,.gk-title.gki-intro.gki-menu .gk-sub,.gk-title.gki-intro.gki-menu .gk-menu,
.gk-title.gki-intro.gki-menu main>footer,.gk-title.gki-intro.gki-menu .gki-toggles{opacity:1;transition:opacity 1s ease-out}
.gk-title h1 .gki-w{display:inline;color:inherit}
/* the title fading up from the boot's ground */
.gk-title.gki-fade{animation:gki-in .6s ease-out both}
@media (prefers-reduced-motion:reduce){.gk-title.gki-fade{animation:none}}
`;

function injectIntroCSS() {
  if (!document.getElementById("gk-intro-css")) document.head.insertAdjacentHTML("beforeend", '<style id="gk-intro-css">' + INTRO_CSS + "</style>");
}

/* @gk-meow-begin -- the cat on the pulse: a recording, trimmed, levelled and
   encoded as MP3 by games-meta's tools/build-meow.sh, which rewrites this
   block. Empty, the boot sound falls back to the arcade's coin. */
const GK_MEOW = "data:audio/mpeg;base64,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q6KCQlGntfT/3OySKNXH72WiYkg8QGYGvCax6yIQCx7K3CJiiJp/ovWyADiqf6lSBiTUWbM/6kkzyiuKABFJkkSjEUBcOBkWD1pDWv/7UsRcgApobU0mGG7BTIxq9MSYoEdSvUnKe/QtlOsSzEwQsCOqKNcrUN/Qf7dRigsQNFloY8DlnhQHBRwjAgBHryLli67KU1fud/6P49XzVobpkD5506+V0JLMxTAcRgFOBMOgoBbJMUmARCYITTaTiUiCgJO99YHZhVKH6S4M6lSYfFnOHCMUmpN5UgePTK62JMve7pQMAh8fHcmhPjG33XO7/6KBOup273SAHyNIhnA7gKQko5j+dkNQ2EyhY5yJAsG5kp6iPoaVjcjIACZo//tSxGcAClhrSweww8FKC+twxIx86l6BdBFgmiA4REyGvKWIrsIjg0AGF0vY1THU/YXGfobtW+9r1F8tmS/FxQROsxgDN1ULCoGiQfNOEoGNjBWlxKHmm+BhxhdN1PGMZu5pTZUvERMcmYSkzeBTh8PgIkCDhCNA50mxwwCsNHkeYOJY7U7vZeLL/3L9+70VCXjbQALfNgMhSoGsnh4Qh+fKR+JVzsprSwkHgb0aOV/K0qCiVyggJaZnLVrN1u51tq14lNHoWcpRklHuLIFj6BD/+1LEcgAKaFVZZhhsoTyM6rDWGDAIkxUIi08ZbV05r/qHXfqR0MXnNXWgBngAkAACoMAaPGQdCiEUBMyieNiyIoGtTUUmLYoUfuFIkFupUyx8yIub5GfxmEMKHU6FgmMBJp5jxUUJF0XW7CJqI1HdVTq+99oDLDEF6itG0AACMtJg9A6gAdBqnsFQbCgjGkTdGCF6hMqpAPsmJw6zspirnpPIgU8RB4Ho8rHDyxuba4sWe0FDYKw7266ehX66xkkszrutppil+9i3MpUMsUmAB//7UsR+gApkqVOGDFJBS5IqcJMNzPXgqTXJqYLkZjC3KRXNLC6U4BCBP5qLnJJ4V5gWqUspxIGo+z1Ky7O0rOhXuVmuJMs8kPFbsK1jY8Y/JS3NWZ5gszJVtZvRTO+y+pR5XSoAuOUACrSCyjGBe0NMSn61Rxok/1C5NFm7spis5RIsJhc7lVrHJejTB0nJPNbPokl6kpcwYVa/UBI4FREPDZUBPAQwSgIClgalRoV8RRK5Qd/LAA0BBhylAXM2ixHKil9dhA5Gpo0xkVB8kEwV//tSxImACkRTSYYkxwFNEmfs8xWgDxsyysdQNuaQkRxGw+INgIVMgsLC5EBCwsI3eaCoq32OqIu//60UqaZb///8BC9MQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+1LElIAKRJEvjBhPQScKX4jzJRBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=="; /* from DJI_0017.MP4, cleaned 8 dB, 87.24-88.02 s */
/* @gk-meow-end */

/* the meow, decoded once per context; null when there is none or it will not decode */
const gkMeowCache = new WeakMap();
function gkMeowBuffer(ac) {
  if (!GK_MEOW || !ac) return Promise.resolve(null);
  if (!gkMeowCache.has(ac)) {
    const bin = atob(GK_MEOW.slice(GK_MEOW.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    gkMeowCache.set(ac, new Promise(res => ac.decodeAudioData(bytes.buffer, res, () => res(null))).catch(() => null));
  }
  return gkMeowCache.get(ac);
}

/* when canon's logo finishes: the face pulses and glints from 1.15 s for 0.7 s */
const GK_LOGO_END = 1.85;

/**
 * The default boot sound: the cat's meow, and nothing else, placed so it ends
 * as the logo's animation does (GK_LOGO_END). Where there is no recording,
 * greykit.com/arcade's coin, ending there too.
 *   ac, out   the AudioContext and the node to play into
 *   since     seconds since the boot started (startIntro passes it: the sound
 *             starts only once the browser has said it may play, a moment in)
 *   rate      the meow's playback rate: below 1 a bigger, lower cat, above 1 a
 *             kitten (default 1); it still ends with the logo
 *   meow      false plays the coin even with a recording
 *   gain      the meow's level (default 0.6: 4.4 dB under the recording as
 *             levelled to -16 LUFS, so it sits under the title music that follows)
 */
function gkBootSound(ac, out, { since = 0, rate = 1, meow = true, gain = 0.6 } = {}) {
  const now = ac.currentTime, end = now + Math.max(0, GK_LOGO_END - since);
  /* greykit.com/arcade's coin, the sound a game is launched with there
     (greykitweb arcade/index.html, TUNES.coin and blip): B5 then E6 on a
     square wave, each falling away, at the arcade's own level */
  const coin = () => {
    const notes = [[988, 0.07], [1319, 0.24]];
    let at = Math.max(ac.currentTime + 0.01, end - notes.reduce((n, [, len]) => n + len, 0));
    for (const [f, len] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.035, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + len + 0.02);
      at += len;
    }
  };
  if (!meow || !GK_MEOW) return coin();
  gkMeowBuffer(ac).then(buf => {
    if (!buf) return coin();
    const len = buf.duration / rate, at = end - len;
    /* decoded too late to end on time: start it at once rather than lose
       it -- unless the logo has already finished */
    if (ac.currentTime > end) return;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.value = gain;
    s.connect(g);
    g.connect(out);
    s.start(Math.max(ac.currentTime + 0.01, at));
  });
}

/**
 * The menu's tick: a dry click with a little pitch in it, for a row coming
 * under the pointer or the arrow keys. Short and quiet, so a run of them down
 * the menu reads as one gesture. It is an effect, not music: play it into the
 * game's effects, under the Sound switch, so it is what you hear with the
 * music off.
 *   ac, out   the AudioContext and the node to play into
 *   freq      the blip's pitch in Hz (default 2400)
 *   gain      level (default 0.12)
 */
function gkTick(ac, out, { freq = 2400, gain = 0.12 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, bus = ac.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  /* the click: 12ms of noise through a bandpass, falling fast */
  const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 0.015 | 0, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  n.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 1.6;
  bp.Q.value = 2;
  n.connect(bp);
  bp.connect(bus);
  n.start(t);
  /* the pitch: a 30ms sine blip under it */
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.03);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + 0.04);
}

/**
 * Ticks for a title's menu and switches: one when a row comes under the
 * pointer, and one when the keys move the focus to it. Not when the game
 * focuses a row itself (the default, as the menu lands), and not twice for
 * one row. Listens on the .gk-title, so a title mounted again needs it again.
 *   tick()   plays the tick -- the game's, into its effects
 */
function gkMenuTicks(title, tick) {
  let last = null;
  const rows = ".gk-menu button, .gki-tg";
  const hit = b => { if (b === last) return; last = b; try { tick(); } catch (e) { /* no sound */ } };
  title.addEventListener("pointerover", ev => {
    const b = ev.target.closest(rows);
    if (b && title.contains(b)) hit(b);
    else if (!b) last = null;
  });
  if (!gkMenuTicks.keys) { gkMenuTicks.keys = -1e9; window.addEventListener("keydown", () => { gkMenuTicks.keys = performance.now(); }, true); }
  title.addEventListener("focusin", ev => {
    const b = ev.target.closest(rows);
    if (b && performance.now() - gkMenuTicks.keys < 250) hit(b);
  });
}

/**
 * Whether this page may play sound now, without waiting for a press: after a
 * launcher's click (greykit.com/arcade goes to the game in the same tab), or on
 * a site the browser trusts. Firefox says so outright (getAutoplayPolicy);
 * elsewhere, a context the browser allows starts running within a moment of
 * resume(), and one it holds back does not start until the page is touched.
 * Resolves true or false within ms.
 *   ac   an AudioContext (the game's, or the intro's own)
 */
function gkSoundAllowed(ac, ms = 250) {
  return new Promise(resolve => {
    if (!ac) return resolve(false);
    try {
      if (navigator.getAutoplayPolicy) {
        const p = navigator.getAutoplayPolicy(ac);
        if (p === "allowed") return resolve(true);
        if (p === "disallowed") return resolve(false);
      }
    } catch (e) { /* not this browser's; ask the context */ }
    if (ac.state === "running") return resolve(true);
    let done = false;
    const end = ok => { if (!done) { done = true; resolve(ok); } };
    setTimeout(() => end(ac.state === "running"), ms);
    ac.resume().then(() => end(ac.state === "running"), () => end(false));
  });
}

/**
 * Start the integrated intro: canon's boot, and the boot sound with it.
 *   lines      the boot log's first lines, as runBoot takes them
 *   audio()    optional: the game's AudioContext, made or found. Its sound
 *              plays there, and the continue press resumes it. Left out, the
 *              intro keeps a small context of its own for the boot sound.
 *   bootSound  (ac, out, { since }) => void, the game's own -- since is the
 *              seconds the boot has run; gkBootSound is the default, and false
 *              plays none
 * Returns { finish(opts), cancel() }. Mount the title under the boot while
 * it runs, then call finish() once the game is ready.
 */
function startIntro({ lines = [], audio = null, bootSound = gkBootSound } = {}) {
  injectIntroCSS();
  const t0 = performance.now();
  const boot = runBoot({ lines });
  const el = document.body.lastElementChild && document.body.lastElementChild.classList.contains("gk-boot") ? document.body.lastElementChild : null;
  /* the eyelid, shut away until the hold */
  const face = el && el.querySelector(".gk-lh .gk-pulse");
  if (face) face.insertAdjacentHTML("beforeend", '<div class="gki-lid"></div>');
  let ac = null;
  try { ac = audio ? audio() : null; } catch (e) { ac = null; }
  if (!ac && el && bootSound) {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ac = AC ? new AC() : null; } catch (e) { ac = null; }
  }
  /* may this page play sound already -- a launcher's click before it, or a
     site the browser trusts? The boot sound plays only then: a context the
     browser is holding back would play it later, late, over the title's music.
     The same answer lets finish() skip the hold. */
  const allowed = ac ? gkSoundAllowed(ac) : Promise.resolve(false);
  /* decode the meow now, so it is ready by the pulse */
  if (ac && bootSound === gkBootSound) gkMeowBuffer(ac);
  if (ac && el && bootSound) allowed.then(ok => { if (ok) try { bootSound(ac, ac.destination, { since: (performance.now() - t0) / 1000 }); } catch (e) { /* no sound */ } });

  /* the press that continues: any key but Escape and a lone modifier (the
     browser does not count those as a touch of the page), or any click.
     It resumes the audio there and then, inside the gesture, which some
     browsers insist on. */
  let pressed = false, onPress = null;
  const press = ev => {
    if (ev.type === "keydown" && (ev.key === "Escape" || ["Shift", "Control", "Alt", "Meta"].includes(ev.key))) return;
    if (ac && ac.state !== "running") ac.resume().catch(() => {});
    pressed = true;
    if (onPress) onPress();
  };
  window.addEventListener("keydown", press, true);
  window.addEventListener("pointerdown", press, true);
  const unhook = () => { window.removeEventListener("keydown", press, true); window.removeEventListener("pointerdown", press, true); };
  const say = html => {
    const log = el && el.querySelector(".gk-log");
    if (!log) return;
    const d = document.createElement("div");
    d.innerHTML = "&gt; " + html;
    log.appendChild(d);
  };

  return {
    /**
     * Finish the boot, hold for the press, and bring the title in.
     *   more        lines for the log now the game has loaded
     *   title       the mounted .gk-title (the page's, if left out)
     *   name        how the name arrives: "lines" (each line fades in on its
     *               turn), "words" (a word at a time), "decode" (canon's decode)
     *   timing      { name, step, menu, done } in ms after the title starts:
     *               the name's first line, the gap between lines or words, the
     *               menu, and the end of the fades
     *   prompt      the hold's words; "Click or press a key to continue", or
     *               "Tap to continue" on a touchscreen
     *   hold        "auto" (the default): hold only when the browser will not
     *               play sound yet -- coming from a launcher's click (the
     *               arcade), or on a site the browser already trusts, the boot
     *               goes straight into the title; "always": hold every time;
     *               "never": a silent game's, which has no sound to let play
     *   toggles     { sound: { get, set }, music: { get, set } } for the
     *               switches top right (gkToggles); left out, none
     *   tick        plays the menu's tick into the game's effects (gkTick is the
     *               sound to play); left out, the menu is silent
     *   onContinue  the press: resume the game's audio here (inside the gesture)
     *   onTitle     the title starts: start the title music here
     *   onDone      the menu is in and focused
     * Resolves when the menu is in, or the entrance was skipped.
     */
    async finish({ more = [], title = document.querySelector(".gk-title"), name = "lines", timing = {}, prompt = null, hold = "auto",
      toggles = null, tick = null, onContinue = () => {}, onTitle = () => {}, onDone = () => {} } = {}) {
      const T = Object.assign({ name: 600, step: 700, menu: 3000, done: 4200 }, timing);
      /* a touchscreen has no keys to press */
      if (!prompt) prompt = matchMedia("(hover: none) and (pointer: coarse)").matches ? "Tap to continue" : "Click or press a key to continue";
      const sw = title ? gkIntegrate(title, { toggles, tick }) : null;
      const focus = () => { const b = title && (title.querySelector(".gk-primary") || title.querySelector(".gk-menu button")); if (b) b.focus({ preventScroll: true }); };

      /* no boot (reduced motion, or a game that skipped it): the title at
         once, still; the music starts now if the page may play, else at the
         first touch of the page, and that touch still does what it was for */
      if (!el && !pressed && await allowed) pressed = true;
      if (!el) {
        unhook();
        const first = ev => {
          if (ev.type === "keydown" && (ev.key === "Escape" || ["Shift", "Control", "Alt", "Meta"].includes(ev.key))) return;
          window.removeEventListener("keydown", first, true);
          window.removeEventListener("pointerdown", first, true);
          if (ac && ac.state !== "running") ac.resume().catch(() => {});
          onContinue();
          onTitle();
        };
        if (pressed) { onContinue(); onTitle(); }
        else { window.addEventListener("keydown", first, true); window.addEventListener("pointerdown", first, true); }
        boot.cancel();
        focus();
        onDone();
        return { toggles: sw };
      }

      /* the title waits behind the boot, everything but its scene hidden */
      const later = title ? [...title.querySelectorAll(".gk-menu, footer, .gki-toggles")] : [];
      if (title) { title.classList.add("gki-intro"); for (const n of later) n.inert = true; }

      /* the rest of the log, then -- unless a press already came -- the hold */
      /* after the boot's own lines, as runBoot's finish would place them */
      const at = Math.max(150 + lines.length * 550, performance.now() - t0);
      for (const [i, l] of more.entries()) setTimeout(() => say(l), pressed ? 0 : Math.max(0, at + i * 300 - (performance.now() - t0)));
      /* never before the face has pulsed, nor before the log has had its say */
      const readyAt = Math.max(1850, at + more.length * 300 + 200);
      await new Promise(resolve => {
        if (pressed) return resolve();
        onPress = resolve;
        setTimeout(() => allowed.then(ok => {
          if (pressed) return;
          /* sound may already play, so the press would be for nothing: the
             boot ends as it always did, straight into the title */
          if ((ok && hold !== "always") || hold === "never") { onPress = null; return resolve(); }
          el.classList.add("gk-ready", "gki-hold");
          const p = document.createElement("div");
          p.className = "gki-prompt";
          p.textContent = prompt;
          el.appendChild(p);
        }), Math.max(0, readyAt - (performance.now() - t0)));
      });
      onPress = null;
      unhook();
      onContinue();

      /* the boot goes quickly -- the press was a skip to it, so it does not
         wait -- and the title fades up from under it */
      if (title) title.classList.add("gki-fade");
      /* a press while the boot fades is a skip of the entrance, not lost */
      let early = false;
      const earlyHit = ev => {
        if (ev.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        early = true;
      };
      window.addEventListener("keydown", earlyHit, true);
      window.addEventListener("pointerdown", earlyHit, true);
      await boot.finish([]);
      window.removeEventListener("keydown", earlyHit, true);
      window.removeEventListener("pointerdown", earlyHit, true);
      onTitle();
      if (!title) { onDone(); return { toggles: sw }; }

      return new Promise(resolve => {
        const timers = [], ctl = new AbortController();
        const lines = [...title.querySelectorAll("h1 span[data-t]")];
        let steps = lines;
        if (name === "words") {
          steps = [];
          for (const l of lines) {
            l.innerHTML = l.dataset.t.split(" ").map(w => '<span class="gki-w">' + escHTML(w) + "</span>").join(" ");
            l.classList.add("gki-on");
            steps.push(...l.querySelectorAll(".gki-w"));
          }
        }
        steps.forEach((s, i) => timers.push(setTimeout(() => {
          s.classList.add("gki-on");
          if (name === "decode") decodeLine(s);
        }, T.name + i * T.step)));
        const end = () => {
          timers.forEach(clearTimeout);
          ctl.abort();
          for (const n of later) n.inert = false;
          focus();
          onDone();
          resolve({ toggles: sw });
        };
        timers.push(setTimeout(() => {
          title.classList.add("gki-menu", "gk-rise");
          end();
          setTimeout(() => title.classList.remove("gki-intro", "gki-menu", "gki-fade"), T.done - T.menu);
        }, T.menu));
        /* a key or a click during the entrance only ends it; it reaches nothing else */
        const skip = ev => {
          if (ev.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          for (const l of lines) if (name !== "words") l.textContent = l.dataset.t;
          title.classList.remove("gki-intro", "gki-menu", "gki-fade");
          end();
        };
        window.addEventListener("keydown", skip, { capture: true, signal: ctl.signal });
        window.addEventListener("pointerdown", skip, { capture: true, signal: ctl.signal });
        if (early) skip({ type: "early", preventDefault() {}, stopImmediatePropagation() {} });
      });
    },
    cancel() { unhook(); boot.cancel(); }
  };
}

/* one line of the name decoding out of noise, by the clock, as canon's
   decodeTitle does the whole name */
function decodeLine(el) {
  const text = el.dataset.t, glyphs = "▚▞▖▗▘▝#/\\<>=+", t0 = performance.now(), ms = 700;
  const t = setInterval(() => {
    const p = (performance.now() - t0) / ms;
    if (!el.isConnected || p >= 1) { clearInterval(t); el.textContent = text; return; }
    const done = Math.floor(text.length * p);
    el.textContent = text.slice(0, done) + [...text.slice(done)].map(c => c === " " ? " " : glyphs[Math.random() * glyphs.length | 0]).join("");
  }, 28);
}

/**
 * The integrated title's layout, on a mounted .gk-title: the credit moved
 * under the menu, the switches top right, and the menu's ticks. finish()
 * calls it; a game that mounts its title again later (back from a game)
 * calls it again on the new one.
 *   toggles   { sound, music } as gkToggles takes them; left out, none
 *   tick()    the menu's tick, as gkMenuTicks takes it; left out, silent
 * Returns gkToggles' { refresh() }, or null with no toggles.
 */
function gkIntegrate(title, { toggles = null, tick = null } = {}) {
  title.classList.add("gki");
  const main = title.querySelector("main"), foot = title.querySelector(":scope > footer");
  if (main && foot) main.appendChild(foot);
  if (tick) gkMenuTicks(title, tick);
  return toggles ? gkToggles(title, toggles) : null;
}

/**
 * The Sound and Music switches, top right of a .gk-title. Each is a button
 * named for what it switches, pressed while that is on (STANDARD.md §8):
 * Sound is the master -- everything, music too, as M is -- and Music is the
 * music alone. A game with no music passes sound only.
 *   sound, music   { get() -> bool, set(on) }
 * Returns { refresh() }: call it when the game changes either another way
 * (M, Settings), so the switches show it.
 */
function gkToggles(title, { sound = null, music = null } = {}) {
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>'
  };
  const wrap = document.createElement("div");
  wrap.className = "gki-toggles";
  const made = [];
  /* Music first, Sound -- the master -- in the corner */
  for (const [k, label, keyHint, ctl] of [["music", "Music", "", music], ["sound", "Sound", " (M)", sound]]) {
    if (!ctl) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gki-tg";
    b.setAttribute("aria-label", label);
    b.title = label + keyHint;
    b.innerHTML = ICON[k] + '<span class="gki-sw"></span>';
    b.addEventListener("click", ev => { ev.stopPropagation(); ctl.set(!ctl.get()); refresh(); });
    wrap.appendChild(b);
    made.push([b, k, ctl]);
  }
  const refresh = () => {
    for (const [b, k, ctl] of made) {
      b.setAttribute("aria-pressed", ctl.get() ? "true" : "false");
      if (k === "music") b.classList.toggle("gki-held", !!sound && !sound.get());
    }
  };
  refresh();
  title.appendChild(wrap);
  return { refresh };
}
/* @gk-intro-end */

/* @gk-table-begin v0.2 -- greykit.games shared code (games-meta STANDARD.md §15),
 * the table: the board games' title. A guideline, not a rule: nothing checks
 * it, and a game may take it, change its copy, or leave it. The copy of record
 * is games-meta's canon/gk-table.js; a game that takes a newer version takes
 * it whole.
 * Needs the @gk-title block (escHTML, and the title mountTitle puts in) and
 * the @gk-intro block (the boot, the hold, the switches) loaded first, and
 * changes nothing in either. It lays a mounted .gk-title out as a table: the
 * board under a lamp, the name set down like a box lid, §6's items as a hand
 * of cards dealt face up -- or, for a game with no cards in its box, as
 * pieces set down in a rank -- and Settings, Help and About as counters
 * under them.
 * Plain script, no imports or exports, so a single-file game can paste it
 * into a classic <script>.
 *
 * In order: startIntro(), mountTitle(), gkTable(title), then finish() with
 * name: "lines" and tick: the hand's flick. Mounting the title again later
 * (back from a game) takes gkIntegrate() and gkTable() again. */

const TABLE_CSS = `
/* ---- the table: a game colours it with --gk-table-card (a card's face) and
   --gk-table-back (the pattern on its back; --gk-title-hi if left out), on
   top of §3's --gk-title-* ---- */
.gk-title.gkt{--k-card:var(--gk-table-card,color-mix(in srgb,var(--panel2) 97%,transparent));--k-back:var(--gk-table-back,var(--t-hi));
  --k-w:clamp(104px,min(13.5vw,19vh),156px);
  /* the board sits right of centre, off the column the name and the menu
     stand in down the left: over the board's middle they were lost in it.
     Nothing on a phone, where the menu covers the table anyway */
  --k-board-x:clamp(0px,calc((100vw - 640px) * .42),18vw);
  /* a card mid-deal swings wide of the page, and the lid's shadow spills
     past it: neither may make the page scroll sideways */
  overflow-x:clip}
/* the cloth, and a lamp over the board; a shade down the left, behind the
   name and the menu, as §3's title has */
.gk-title.gkt>.scene{background:radial-gradient(110% 90% at calc(50% + var(--k-board-x)) 42%,#0e1730 0%,#090e1c 52%,#04060c 100%)}
.gk-title.gkt>.gk-shade{background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 84%,transparent) 0%,color-mix(in srgb,var(--bg) 74%,transparent) 30%,
    color-mix(in srgb,var(--bg) 34%,transparent) 50%,transparent 64%),
    radial-gradient(62% 72% at calc(50% + var(--k-board-x)) 50%,transparent 0%,color-mix(in srgb,var(--bg) 40%,transparent) 70%,
    color-mix(in srgb,var(--bg) 82%,transparent) 100%)}
/* the board laid down on it in perspective, drifting a little, as if the
   table were being walked round (gkTable's tilt). The cloth is the scene's
   own ground, so a game draws its board on a clear canvas and the table
   shows round it */
.gk-title.gkt>.scene.gkt-tilt{perspective:1200px;perspective-origin:calc(50% + var(--k-board-x)) 30%}
.gk-title.gkt>.scene.gkt-tilt>canvas,.gk-title.gkt>.scene.gkt-tilt>svg{transform-origin:50% 50%;
  transform:translateX(var(--k-board-x)) rotateX(34deg) rotateZ(-3deg);animation:gkt-drift 50s ease-in-out infinite alternate}
@keyframes gkt-drift{to{transform:translateX(var(--k-board-x)) rotateX(31deg) rotateZ(3deg) scale(1.04)}}

/* ---- the lid: the name centred in the left-hand column, the line under it
   between two rules, and the box's small print (gkTable's box). A game whose
   scene is not tilted draws its board right of centre by --k-board-x ---- */
.gk-title.gkt>main{width:min(720px,100%);align-items:center;text-align:center;padding:clamp(24px,7vh,72px) 16px 28px clamp(16px,5vw,80px)}
/* the lid holds the name, its line and the small print, over a pool of
   shadow of its own: the board under it is busy and lit, and the name has to
   read on it from its first frame, before the shade comes up */
.gk-title.gkt .gkt-lid{position:relative;display:flex;flex-direction:column;align-items:center;max-width:100%}
.gk-title.gkt .gkt-lid::before{content:"";position:absolute;z-index:-1;inset:-18% -22%;pointer-events:none;
  background:radial-gradient(closest-side,color-mix(in srgb,var(--bg) 88%,transparent) 0%,color-mix(in srgb,var(--bg) 78%,transparent) 55%,
    color-mix(in srgb,var(--bg) 40%,transparent) 80%,transparent 100%)}
.gk-title.gkt h1{font-size:clamp(40px,min(7.4vw,11vh),100px);letter-spacing:.04em;text-shadow:0 2px 3px rgba(0,0,0,.6),0 4px 28px rgba(0,0,0,.6)}
.gk-title.gkt .gk-sub{text-shadow:0 1px 3px rgba(0,0,0,.8)}
.gk-title.gkt .gk-sub{display:flex;align-items:center;justify-content:center;gap:16px}
.gk-title.gkt .gk-sub::before,.gk-title.gkt .gk-sub::after{content:"";flex:none;width:clamp(20px,6vw,64px);height:1px;background:currentColor;opacity:.45}
.gk-title.gkt .gkt-box{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:14px 0 0;padding:0;list-style:none}
.gk-title.gkt .gkt-box li{padding:3px 11px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--t-dim);
  border:1px solid var(--t-line);border-radius:999px;background:color-mix(in srgb,var(--bg) 55%,transparent)}
/* in the entrance the lid's pool of shadow comes up with the name's first
   line, not before it: alone on the board it reads as a smudge */
.gk-title.gkt.gki-intro .gkt-lid::before{opacity:0}
.gk-title.gkt.gki-intro .gkt-lid:has(h1>span.gki-on)::before{opacity:1;transition:opacity 1.4s ease-in-out}
/* in the entrance the small print comes with the line under the name */
.gk-title.gki-intro .gkt-box{opacity:0}
.gk-title.gki-intro.gki-menu .gkt-box{opacity:1;transition:opacity 1s ease-out}
/* each line of the name is set down: a little large and loose, then in place */
.gk-title.gkt.gki-intro h1>span.gki-on{animation:gkt-set .9s cubic-bezier(.2,.8,.3,1) both}
@keyframes gkt-set{from{opacity:0;transform:scale(1.14);letter-spacing:.14em}to{opacity:1;transform:none;letter-spacing:.04em}}

/* the credit on a backing of its own, under the counters */
.gk-title.gkt.gki main>footer{width:auto;max-width:100%;box-sizing:border-box;margin-top:clamp(14px,3vh,22px);padding:6px 18px;
  border-radius:999px;background:color-mix(in srgb,var(--bg) 80%,transparent);box-shadow:0 0 24px 8px color-mix(in srgb,var(--bg) 45%,transparent)}

/* ---- the hand: §6's items before the gap, each a card, fanned (gkTable
   sets --a and --y on each) ---- */
.gk-title.gkt .gk-menu{flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:flex-end;width:min(920px,100%);
  margin-top:clamp(28px,8vh,84px);padding:0;background:none;border:0;border-radius:0;box-shadow:none}
.gk-title.gkt.gki-intro.gki-menu .gk-menu{transition-duration:.15s}
.gk-title.gkt .gk-menu>button{flex:none;flex-direction:column;justify-content:center;gap:9px;box-sizing:border-box;
  width:var(--k-w);height:calc(var(--k-w) * 1.4);margin:0 calc(var(--k-w) * -.05);padding:26px 12px;
  font-size:clamp(16px,1.45vw,19px);font-weight:600;line-height:1.15;text-align:center;color:var(--t-ink);
  background:var(--k-card);border:1px solid var(--t-line);border-radius:10px;
  box-shadow:inset 0 0 0 5px var(--k-card),inset 0 0 0 6px color-mix(in srgb,var(--t-line) 85%,transparent),0 10px 26px rgba(0,0,0,.5);
  translate:0 var(--y,0px);rotate:var(--a,0deg);transform-origin:50% 100%;
  transition:translate .2s cubic-bezier(.3,.7,.4,1),rotate .2s cubic-bezier(.3,.7,.4,1),box-shadow .2s,border-color .2s}
.gk-title.gkt .gk-menu>button .gk-lbl{white-space:normal}
.gk-title.gkt .gk-menu>button .gk-meta{margin:0;max-width:100%;font-size:13px;font-weight:400;line-height:1.3;color:var(--t-dim);
  white-space:normal;overflow:visible}
/* the key in the corner as a card's rank, a diamond under it, and again
   upside down in the opposite corner */
.gk-title.gkt .gk-menu>button>kbd,.gk-title.gkt .gkt-ix{position:absolute;top:10px;left:10px;min-width:0;padding:0;
  font:inherit;font-size:15px;font-weight:700;line-height:1;color:var(--t-dim);border:0}
.gk-title.gkt .gkt-ix{top:auto;left:auto;bottom:10px;right:10px;rotate:180deg}
.gk-title.gkt .gk-menu>button>kbd::after,.gk-title.gkt .gkt-ix::after{content:"";display:block;width:5px;height:5px;margin:5px auto 0;
  border:1px solid currentColor;transform:rotate(45deg)}
.gk-title.gkt .gk-menu>.gk-primary>kbd,.gk-title.gkt .gk-menu>.gk-primary>.gkt-ix{color:var(--t-hi)}
.gk-title.gkt .gk-menu>button:hover{z-index:1;translate:0 calc(var(--y,0px) - 10px);color:var(--t-ink);background:var(--k-card)}
/* the card with the focus is taken out of the hand: lifted, straight, lit */
.gk-title.gkt .gk-menu>button:focus{z-index:2;translate:0 -26px;rotate:0deg;background:var(--k-card);border-color:var(--t-focus);
  box-shadow:inset 0 0 0 5px var(--k-card),inset 0 0 0 6px color-mix(in srgb,var(--t-focus) 45%,transparent),
    0 20px 44px rgba(0,0,0,.6),0 0 26px color-mix(in srgb,var(--t-focus) 22%,transparent)}
.gk-title.gkt .gk-menu>button:focus::before{content:none}
.gk-title.gkt .gk-menu>button:focus>kbd,.gk-title.gkt .gk-menu>button:focus>.gkt-ix{color:var(--t-focus)}
/* a card's back, shown while it is being dealt */
.gk-title.gkt .gk-menu>button::after{content:"";position:absolute;inset:-1px;border-radius:inherit;opacity:0;pointer-events:none;
  border:1px solid var(--t-line);
  background:radial-gradient(circle,color-mix(in srgb,var(--k-back) 34%,transparent) 0 8%,transparent 9%),
    repeating-linear-gradient(45deg,color-mix(in srgb,var(--k-back) 13%,transparent) 0 2px,transparent 2px 9px),
    repeating-linear-gradient(-45deg,color-mix(in srgb,var(--k-back) 13%,transparent) 0 2px,transparent 2px 9px),var(--panel);
  box-shadow:inset 0 0 0 6px var(--panel),inset 0 0 0 7px color-mix(in srgb,var(--k-back) 35%,transparent)}

/* ---- the counters: Settings, Help and About, on their own line ---- */
.gk-title.gkt .gk-menu .gk-util{flex:1 0 100%;justify-content:center;gap:10px;margin-top:clamp(20px,4.5vh,38px);padding:0;border:0}
.gk-title.gkt .gk-menu .gk-util button,.gk-title.gkt .gk-menu .gk-util button:first-child{flex:none;width:auto;height:40px;padding:0 16px 0 10px;
  font-size:15px;color:color-mix(in srgb,var(--t-ink) 86%,transparent);background:var(--t-panel);
  border:1px solid var(--t-line);border-radius:20px;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.gk-title.gkt .gk-menu .gk-util kbd{min-width:22px;height:22px;padding:0;line-height:20px;border-radius:50%;font-size:12px}
.gk-title.gkt .gk-menu .gk-util button:hover{background:color-mix(in srgb,var(--t-focus) 8%,var(--t-panel))}
.gk-title.gkt .gk-menu .gk-util button:focus{color:var(--t-ink);background:color-mix(in srgb,var(--t-focus) 16%,var(--t-panel));border-color:var(--t-focus)}
.gk-title.gkt .gk-menu .gk-util button:focus::before{content:none}

/* ---- the deal: each card comes face down across the table and turns face
   up as it lands, one after another; then the counters drop. The landing is
   at 62% of .62s, which gktDeal's snap is timed to ---- */
.gk-title.gkt.gk-rise .gk-menu>.gk-pr{animation:gkt-deal .62s calc(var(--i) * 130ms) both}
.gk-title.gkt.gk-rise .gk-menu>.gk-pr::after{animation:gkt-back .62s linear calc(var(--i) * 130ms) both}
.gk-title.gkt.gk-rise .gk-menu .gk-util .gk-pr{animation:gkt-drop .42s cubic-bezier(.3,1.4,.5,1) calc(var(--i) * 130ms + 160ms) both}
@keyframes gkt-deal{
  0%{opacity:0;transform:translateY(62vh) rotate(-16deg) scale(.86);animation-timing-function:cubic-bezier(.15,.6,.3,1)}
  10%{opacity:1}
  62%{transform:none;animation-timing-function:ease-in}
  76%{transform:scaleX(0);animation-timing-function:ease-out}
  100%{opacity:1;transform:none}}
@keyframes gkt-back{0%,75.9%{opacity:1}76%,100%{opacity:0}}
@keyframes gkt-drop{from{opacity:0;transform:translateY(-16px) scale(1.18)}to{opacity:1;transform:none}}

/* ---- tiles, for a game with no cards in its box (gkTable's pieces:
   "tiles"): §6's items are pieces set down in a rank on the table, in the
   game's own shape. --gk-table-shape is that shape as a clip-path (gkTable's
   shape; a square with its corners cut, if left out), --gk-table-edge its
   outline (the panel's line, if left out), --gk-table-ratio its height
   over its width (1.06), and --gk-table-head how far down it the shape
   comes to its full width (.1): the words sit in the middle of the wide
   part under that, the key in the head above. The outline and the face are two layers cut to the
   shape, so the shadow under a piece follows its outline ---- */
.gk-title.gkt.gkt-tiles{--k-shape:var(--gk-table-shape,polygon(10% 0,90% 0,100% 10%,100% 90%,90% 100%,10% 100%,0 90%,0 10%))}
.gk-title.gkt.gkt-tiles .gk-menu{gap:16px}
.gk-title.gkt.gkt-tiles .gk-menu>button{--k-edge:var(--gk-table-edge,var(--t-line));
  --k-th:calc(var(--k-w) * 1.08 * var(--gk-table-ratio,1.06));
  width:calc(var(--k-w) * 1.08);height:var(--k-th);margin:0;
  padding:calc(var(--k-th) * var(--gk-table-head,.1)) 12px 8px;justify-content:center;gap:7px;
  background:none;border:0;border-radius:0;box-shadow:none;isolation:isolate;translate:none;rotate:none;
  filter:drop-shadow(0 10px 12px rgba(0,0,0,.55));transition:translate .2s cubic-bezier(.3,.7,.4,1),filter .2s}
.gk-title.gkt.gkt-tiles .gk-menu>button::before,.gk-title.gkt.gkt-tiles .gk-menu>button::after{content:"";position:absolute;z-index:-1;
  inset:0;margin:0;border:0;border-radius:0;box-shadow:none;opacity:1;clip-path:var(--k-shape);pointer-events:none}
.gk-title.gkt.gkt-tiles .gk-menu>button::before{background:var(--k-edge)}
.gk-title.gkt.gkt-tiles .gk-menu>button::after{inset:2px;background:linear-gradient(color-mix(in srgb,var(--k-edge) 14%,var(--k-card)),var(--k-card) 60%)}
.gk-title.gkt.gkt-tiles .gk-menu>.gk-primary{--k-edge:var(--gk-table-edge,var(--t-hi))}
.gk-title.gkt.gkt-tiles .gk-menu>button>kbd{top:calc(var(--k-w) * .13);left:50%;translate:-50% 0}
.gk-title.gkt.gkt-tiles .gkt-ix{display:none}
.gk-title.gkt.gkt-tiles .gk-menu>button:hover{translate:0 -4px;background:none}
/* the piece with the focus is picked up: lifted, ringed and lit */
.gk-title.gkt.gkt-tiles .gk-menu>button:focus{translate:0 -10px;background:none;box-shadow:none;
  filter:drop-shadow(0 20px 16px rgba(0,0,0,.6)) drop-shadow(0 0 10px color-mix(in srgb,var(--t-focus) 35%,transparent))}
.gk-title.gkt.gkt-tiles .gk-menu>button:focus::before{content:"";background:var(--t-focus)}
.gk-title.gkt.gkt-tiles .gk-menu>button:focus::after{inset:3px}
/* set down: each piece comes down onto the cloth in turn, and settles; the
   landing is at 70% of .5s, which gktPlace's knock is timed to */
.gk-title.gkt.gkt-tiles.gk-rise .gk-menu>.gk-pr{animation:gkt-place .5s cubic-bezier(.3,.6,.4,1) calc(var(--i) * 140ms) both}
.gk-title.gkt.gkt-tiles.gk-rise .gk-menu>.gk-pr::after{animation:none}
@keyframes gkt-place{0%{opacity:0;transform:translateY(-36px) scale(1.14)}30%{opacity:1}70%{transform:none}84%{transform:scale(.985)}100%{opacity:1;transform:none}}

/* ---- a phone: two columns of cards, no corners (a phone has no keys), no fan ---- */
@media (max-width:640px){
  .gk-title.gkt>.gk-shade{background:color-mix(in srgb,var(--bg) 62%,transparent)}
  .gk-title.gkt>main{padding:64px 16px 28px}
  .gk-title.gkt .gk-menu{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:min(420px,100%)}
  .gk-title.gkt .gk-menu>button,.gk-title.gkt .gk-menu>button:hover,.gk-title.gkt .gk-menu>button:focus{
    width:auto;height:auto;min-height:96px;margin:0;padding:14px 10px;translate:none;rotate:none}
  .gk-title.gkt .gk-menu>button>kbd,.gk-title.gkt .gkt-ix{display:none}
  .gk-title.gkt .gk-menu .gk-util{grid-column:1/-1;margin-top:6px;gap:6px}
  .gk-title.gkt .gk-menu .gk-util button,.gk-title.gkt .gk-menu .gk-util button:first-child{flex:1 1 0;justify-content:center;padding:0 6px}
  .gk-title.gkt.gkt-tiles .gk-menu>button,.gk-title.gkt.gkt-tiles .gk-menu>button:hover,.gk-title.gkt.gkt-tiles .gk-menu>button:focus{
    width:auto;height:auto;min-height:112px;padding:max(26px,calc(112px * var(--gk-table-head,.1))) 10px 8px;justify-content:center;translate:none}
}
@media (prefers-reduced-motion:reduce){
  .gk-title.gkt.gk-rise .gk-menu .gk-pr,.gk-title.gkt.gk-rise .gk-menu>.gk-pr::after,.gk-title.gkt>.scene.gkt-tilt>*,
  .gk-title.gkt.gkt-tiles.gk-rise .gk-menu>.gk-pr{animation:none}
  .gk-title.gkt .gk-menu>button,.gk-title.gkt.gkt-tiles .gk-menu>button{transition:none}
}
`;

function injectTableCSS() {
  if (!document.getElementById("gk-table-css")) document.head.insertAdjacentHTML("beforeend", '<style id="gk-table-css">' + TABLE_CSS + "</style>");
}

/**
 * Lay a mounted .gk-title out as the table. Call it after mountTitle and
 * before finish(); a title mounted again later takes it again.
 *   box     optional: the box's small print under the name, as
 *           ["2–5 players", "bots", "60 minutes"]
 *   tilt    true lays the game's scene (its canvas or svg) down on the table
 *           in perspective; leave it out for a scene already drawn that way
 *   pieces  "cards" (the default): a hand, fanned and dealt. "tiles", for a
 *           game with no cards in its box: pieces set down in a rank
 *   shape   with tiles, the piece's outline as a clip-path, as PumaHeart's
 *           base: "polygon(36% 0,64% 0,100% 42%,100% 100%,0 100%,0 42%)"
 *   deal()  optional: plays as each card is dealt (gktDeal) or each piece is
 *           set down (gktPlace), into the game's effects; left out, silent
 *   chit()  optional: plays as each counter drops (gktChit)
 * Arrow keys: left and right along the hand or the rank, down to the counters, up from
 * them to the card last held. §6's letter keys are mountTitle's, unchanged.
 */
function gkTable(title, { box = null, tilt = false, pieces = "cards", shape = null, deal = null, chit = null } = {}) {
  if (!title || title.classList.contains("gkt")) return;
  injectTableCSS();
  title.classList.add("gkt");
  const tiles = pieces === "tiles";
  if (tiles) title.classList.add("gkt-tiles");
  if (tiles && shape) title.style.setProperty("--gk-table-shape", shape);
  const menu = title.querySelector(".gk-menu");
  if (!menu) return;
  const cards = [...menu.children].filter(b => b.tagName === "BUTTON"), util = menu.querySelector(".gk-util");
  /* the fan: each card turned about its foot, and dropped along an arc; a
     rank of pieces stands straight */
  const mid = (cards.length - 1) / 2;
  cards.forEach((b, k) => {
    const d = tiles ? 0 : k - mid;
    b.style.setProperty("--a", (d * 4.5).toFixed(2) + "deg");
    b.style.setProperty("--y", (d * d * 5).toFixed(1) + "px");
    const kb = b.querySelector("kbd");
    if (kb) b.insertAdjacentHTML("beforeend", '<span class="gkt-ix" aria-hidden="true">' + escHTML(kb.textContent) + "</span>");
  });
  /* the lid: the name, the line under it and the box's small print, together */
  const h1 = title.querySelector("main > h1");
  if (h1) {
    const lid = document.createElement("div");
    lid.className = "gkt-lid";
    h1.before(lid);
    lid.append(h1, ...title.querySelectorAll("main > .gk-sub"));
    if (box && box.length) lid.insertAdjacentHTML("beforeend", '<ul class="gkt-box">' + box.map(s => "<li>" + escHTML(s) + "</li>").join("") + "</ul>");
  }
  const scene = title.querySelector(":scope > .scene");
  if (tilt && scene) scene.classList.add("gkt-tilt");

  /* the deal's sounds, as each card's animation and each counter's begins:
     a skipped entrance runs none, so it makes no sound */
  title.addEventListener("animationstart", ev => {
    const f = ev.animationName === "gkt-deal" || ev.animationName === "gkt-place" ? deal : ev.animationName === "gkt-drop" ? chit : null;
    if (f && !ev.pseudoElement) try { f(); } catch (e) { /* no sound */ }
  });

  /* the hand's arrows, ahead of mountTitle's, which walk a column */
  let held = null;
  menu.addEventListener("focusin", ev => { if (cards.includes(ev.target)) held = ev.target; });
  const ctl = new AbortController();
  window.addEventListener("keydown", ev => {
    if (!title.isConnected) return ctl.abort();
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const a = document.activeElement, k = cards.indexOf(a);
    const to = b => { if (!b) return; ev.preventDefault(); ev.stopPropagation(); b.focus(); };
    if (k >= 0) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") to(cards[(k + (ev.key === "ArrowRight" ? 1 : -1) + cards.length) % cards.length]);
      else if (ev.key === "ArrowDown") to(util && util.querySelector("button"));
      else if (ev.key === "ArrowUp") { ev.preventDefault(); ev.stopPropagation(); }
    } else if (ev.key === "ArrowUp" && util && util.contains(a)) {
      to(held || menu.querySelector(":scope > .gk-primary") || cards[0]);
    }
  }, { capture: true, signal: ctl.signal });
}

/* a short noise burst, shaped by env(p) for p from 0 to 1, as a buffer */
function gktNoise(ac, secs, env) {
  const buf = ac.createBuffer(1, Math.max(1, ac.sampleRate * secs | 0), ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * env(i / d.length);
  const s = ac.createBufferSource();
  s.buffer = buf;
  return s;
}

/**
 * The hand's tick: a thumb running over a card's edge -- a short dry flick of
 * paper, for finish()'s tick. An effect, under the Sound switch.
 *   ac, out   the AudioContext and the node to play into
 *   gain      level (default 0.5)
 */
function gktFlick(ac, out, { gain = 0.5 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, n = gktNoise(ac, 0.028, p => Math.min(1, p * 14) * Math.pow(1 - p, 2.5));
  const hp = ac.createBiquadFilter(), pk = ac.createBiquadFilter(), g = ac.createGain();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  pk.type = "peaking";
  pk.frequency.value = 4300;
  pk.Q.value = 1.4;
  pk.gain.value = 8;
  g.gain.value = gain;
  n.connect(hp);
  hp.connect(pk);
  pk.connect(g);
  g.connect(out);
  n.start(t);
}

/**
 * A card dealt: the swish of it crossing the cloth, then the snap as it lands,
 * timed to the deal's landing (.38 s after the card starts). For gkTable's deal.
 *   ac, out   the AudioContext and the node to play into
 *   gain      level (default 0.5)
 */
function gktDeal(ac, out, { gain = 0.5 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, land = t + 0.38, bus = ac.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  /* the swish: noise rising and falling through a band that slides down */
  const sw = gktNoise(ac, 0.26, p => Math.pow(Math.sin(Math.PI * Math.pow(p, 0.7)), 2));
  const bp = ac.createBiquadFilter(), sg = ac.createGain();
  bp.type = "bandpass";
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(5200, land - 0.26);
  bp.frequency.exponentialRampToValueAtTime(1600, land);
  sg.gain.value = 0.32;
  sw.connect(bp);
  bp.connect(sg);
  sg.connect(bus);
  sw.start(land - 0.26);
  /* the snap: a bright crack of paper on the cloth, and a soft thump under it */
  const sn = gktNoise(ac, 0.022, p => Math.pow(1 - p, 3)), hp = ac.createBiquadFilter(), ng = ac.createGain();
  hp.type = "highpass";
  hp.frequency.value = 1400;
  ng.gain.value = 0.7;
  sn.connect(hp);
  hp.connect(ng);
  ng.connect(bus);
  sn.start(land);
  const o = ac.createOscillator(), og = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(170, land);
  o.frequency.exponentialRampToValueAtTime(70, land + 0.06);
  og.gain.setValueAtTime(0.5, land);
  og.gain.exponentialRampToValueAtTime(0.0001, land + 0.07);
  o.connect(og);
  og.connect(bus);
  o.start(land);
  o.stop(land + 0.08);
}

/**
 * A piece set down on the cloth: a soft wooden knock, timed to the piece's
 * landing (.35 s after it starts). For gkTable's deal, with tiles.
 *   ac, out   the AudioContext and the node to play into
 *   gain      level (default 0.5)
 */
function gktPlace(ac, out, { gain = 0.5 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime + 0.35, bus = ac.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  const o = ac.createOscillator(), og = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(230, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.07);
  og.gain.setValueAtTime(0.7, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(og);
  og.connect(bus);
  o.start(t);
  o.stop(t + 0.1);
  /* the edge of it meeting the cloth: a dull tap of noise */
  const n = gktNoise(ac, 0.03, p => Math.pow(1 - p, 2.5)), lp = ac.createBiquadFilter(), ng = ac.createGain();
  lp.type = "lowpass";
  lp.frequency.value = 1900;
  ng.gain.value = 0.55;
  n.connect(lp);
  lp.connect(ng);
  ng.connect(bus);
  n.start(t);
}

/**
 * A counter set down: a hard little clack, and a smaller one as it settles.
 * For gkTable's chit.
 *   ac, out   the AudioContext and the node to play into
 *   gain      level (default 0.4)
 */
function gktChit(ac, out, { gain = 0.4 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t0 = ac.currentTime + 0.12, bus = ac.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  for (const [at, lvl] of [[0, 1], [0.055, 0.35]]) {
    const t = t0 + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1350, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.03);
    g.gain.setValueAtTime(0.6 * lvl, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.045);
    const n = gktNoise(ac, 0.01, p => Math.pow(1 - p, 2)), bp = ac.createBiquadFilter(), ng = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 1.2;
    ng.gain.value = 0.8 * lvl;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.start(t);
  }
}
/* @gk-table-end */

export { TITLE_CSS, runBoot, titleHTML, decodeTitle, mountTitle, bootReloadLine, confirmSheet, alertSheet,
  startIntro, gkBootSound, gkIntegrate, gkTable, gktFlick, gktDeal, gktChit, reduced };
