/* The boot sequence and the title screen: the greykit.games Tactical canon,
 * first adopted here (the look was settled in games-meta's
 * prototypes/tactical-title.html).
 *
 * Nothing in this file knows it is PumaRally. Everything game-specific -- the
 * name, the menu, the backdrop, the help, the about, the settings -- arrives
 * in the config, so the next Tactical game can take this file as it stands.
 *
 * BOOT. A page load, drawn: the greykit face fades in whole, slides right out
 * of a fixed frame until only the half face greykit.com wears is left, and
 * pulses twice with a glint, while a load bar crosses the top and a short log
 * says what is loading. The game's own loading runs underneath, and the boot
 * does not hand over until it is done. Any key or click skips the rest;
 * reduced motion skips it all.
 *
 * TITLE. The game's name at the top, its backdrop line art behind, then the
 * menu in a fixed order -- Resume game (only with a save, and then the
 * default), New game, the game's own ways to start, and Settings, Help, About --
 * with the credit (games-meta STANDARD.md §1) at the foot.
 */

/* @gk-title-begin v0.3 -- greykit.games canon (games-meta STANDARD.md §3),
 * byte-identical in every Tactical game. The copy of record is games-meta's
 * canon/gk-title.js: change it there, bump the version, copy it to all, and
 * tools/diff-standard.sh says where it differs. Plain script, no imports or
 * exports, so a single-file game can paste it into a classic <script>. */

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

/* ---- title ---- */
.gk-title{position:relative;min-height:100dvh;display:flex;flex-direction:column;align-items:center;
  padding:56px 16px}
.gk-title>.scene{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  background:linear-gradient(#05070f 0%,#070b17 40%,#0c1020 68%,#181622 88%,#231a17 100%)}
.gk-title>.scene svg{display:block;width:100%;height:100%}
/* a shade at the top for the title and menu, and at the foot for the credit */
.gk-title>.gk-shade{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(rgba(5,7,15,.82) 0%,rgba(5,7,15,.55) 38%,rgba(5,7,15,0) 72%),
    linear-gradient(transparent calc(100% - 90px),rgba(5,7,15,.85))}
.gk-title>main{position:relative;z-index:1}
.gk-title.gk-rise>main{animation:gk-rise .5s cubic-bezier(.22,1,.36,1) both}
@keyframes gk-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
/* the menu sits in the middle of the screen, and the name above it: three
   rows, the outer two sharing what is left over */
.gk-title main{flex:1;width:100%;display:grid;grid-template-rows:1fr auto 1fr;justify-items:center}
.gk-title .gk-name{align-self:end;display:flex;flex-direction:column;align-items:center;width:100%}
.gk-title h1{margin:6px 0 0;font-size:clamp(26px,6vw,42px);font-weight:600;letter-spacing:.24em;padding-left:.24em;text-transform:uppercase;
  text-align:center;color:var(--accent);text-shadow:0 0 22px rgba(84,242,255,.35);min-height:1.2em}
.gk-title .gk-rule{width:min(320px,80vw);height:1px;margin:26px 0 22px;
  background:linear-gradient(90deg,transparent,var(--lit),transparent)}
.gk-menu{display:flex;flex-direction:column;gap:8px;width:min(340px,100%)}
.gk-menu .gk-gap{height:6px}
.gk-menu button{display:flex;align-items:center;gap:12px;width:100%;min-height:42px;padding:0 14px;
  font-family:inherit;font-size:14px;letter-spacing:.08em;text-transform:uppercase;text-align:left;
  color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:2px;
  transition:border-color .15s,background .15s,color .15s}
.gk-menu button:hover:not(:disabled){border-color:var(--lit);background:var(--panel2)}
.gk-menu button:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.gk-menu .gk-lbl{flex:none;white-space:nowrap}
.gk-menu .gk-meta{flex:1;min-width:0;text-align:right;font-size:11px;letter-spacing:0;text-transform:none;
  color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gk-menu kbd,.gk-sheet kbd{font:inherit;font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:2px;
  padding:0 4px;min-width:18px;text-align:center;display:inline-block;letter-spacing:0}
.gk-menu button.gk-primary{color:var(--bg);background:var(--accent);border-color:var(--accent);font-weight:600}
.gk-menu button.gk-primary:hover:not(:disabled){background:#8af6ff;border-color:#8af6ff}
.gk-menu button.gk-primary kbd{color:var(--bg);border-color:rgba(5,7,15,.35)}
.gk-menu button.gk-primary .gk-meta{color:rgba(5,7,15,.7)}
/* pinned to the foot, with the same room kept top and bottom, so the menu's
   middle is the screen's */
.gk-title>footer{position:absolute;z-index:1;left:16px;right:16px;bottom:20px;font-size:12px;color:var(--dim);text-align:center}
.gk-credit a{color:var(--steel)}

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
 * HTML mountTitle puts in. cfg is mountTitle's name, items and primary;
 * scene: true leaves a .scene for the game's backdrop, and a game whose
 * backdrop is already drawn behind its pages leaves it out.
 */
function titleHTML(cfg) {
  const items = cfg.items.filter(Boolean);
  return '<div class="gk-title">' + (cfg.scene ? '<div class="scene" aria-hidden="true"></div>' : "") + '<div class="gk-shade" aria-hidden="true"></div>' +
    '<main><div class="gk-name"><h1 aria-label="' + escHTML(cfg.name) + '">' + escHTML(cfg.name) + '</h1><div class="gk-rule"></div></div><nav class="gk-menu" aria-label="Main menu">' +
    items.map(it => it === "gap" ? '<div class="gk-gap"></div>' :
      '<button data-act="' + it.act + '"' + (it.act === cfg.primary ? ' class="gk-primary"' : "") + "><kbd>" + escHTML(it.key) + '</kbd><span class="gk-lbl">' +
      escHTML(it.label) + "</span>" + (it.meta ? '<span class="gk-meta">' + escHTML(it.meta) + "</span>" : "") + "</button>").join("") +
    '</nav></main><footer><span class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></span></footer></div>';
}

/* the name decodes out of noise once, as the screen arrives -- by the
 * clock, not by ticks, so a throttled background tab still ends on time */
function decodeTitle(h1, text) {
  if (reduced()) return;
  const glyphs = "▚▞▖▗▘▝#/\\<>=+", t0 = performance.now(), ms = 400;
  const t = setInterval(() => {
    const p = (performance.now() - t0) / ms;
    if (!h1.isConnected || p >= 1) { clearInterval(t); h1.textContent = text; return; }
    const done = Math.floor(text.length * p);
    h1.textContent = text.slice(0, done) + [...text.slice(done)].map(c => c === " " ? " " : glyphs[Math.random() * glyphs.length | 0]).join("");
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

/* The entrance: the menu rises, the name decodes, the default is focused.
 * t is the .gk-title (the page's, if left out); the name is read off the h1. */
function revealTitle(t = document.querySelector(".gk-title")) {
  if (!t) return;
  t.classList.add("gk-rise");
  const h1 = t.querySelector("h1");
  decodeTitle(h1, h1.getAttribute("aria-label"));
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

/* ArrowDown / ArrowUp through the menu, wrapping. true when the key was one. */
function titleArrow(menu, ev) {
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return false;
  const bs = [...menu.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
  ev.preventDefault();
  bs[(i + (ev.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus();
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
 *   items     the menu, top to bottom: { act, label, key, meta? }, or "gap"
 *             before Settings / Help / About; anything falsy is left out
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

export { TITLE_CSS, runBoot, titleHTML, decodeTitle, mountTitle, bootReloadLine, confirmSheet, alertSheet };
