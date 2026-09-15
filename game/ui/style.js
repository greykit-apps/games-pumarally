/* The game's CSS, injected so there is one fewer asset to cache-bust. The
 * palette is the renderer's, imported rather than retyped, so the panel and
 * the board are the same colours because they come from the same table. */
import { TOKENS } from "../../editor/render/palette.js";

const T = TOKENS;

export const CSS = `
:root{--bg:${T.bg};--panel:${T.panel};--panel2:${T.panelAlt};--line:${T.border};--lit:${T.borderLit};
  --text:${T.text};--ink:${T.ink};--dim:${T.dim};--accent:${T.accent};--warn:${T.warn};--danger:${T.danger};
  --good:${T.good};--violet:${T.violet};--steel:${T.steel}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}
button{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:3px;
  padding:5px 10px;cursor:pointer;min-height:32px}
button:hover:not(:disabled){border-color:var(--lit)}
button:disabled{opacity:.4;cursor:default}
button.primary{border-color:var(--accent);color:var(--accent)}
button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
select,input[type=number]{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:3px;padding:4px 6px}
h1{font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin:0;font-weight:600}
h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:14px 0 6px;font-weight:600}
h2:first-child{margin-top:0}
.pr{min-height:100dvh;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:14px;padding:8px 14px;border-bottom:1px solid var(--line)}
.top .grow{flex:1}
.top .turn{color:var(--dim)}
.main{display:grid;grid-template-columns:minmax(0,1fr) 460px;gap:0;flex:1;min-height:0}
.stage{position:relative;overflow:auto;padding:12px;display:flex;align-items:flex-start;justify-content:center}
.stage .board{position:relative;max-width:100%}
.stage .board svg{display:block;width:100%;height:auto}
.stage .board .overlay{position:absolute;inset:0}
.overlay .piece{transition:transform .28s cubic-bezier(.3,.7,.3,1)}
.overlay .spin{transition:transform .22s ease;transform-origin:50px 50px}
.overlay .pr-hull{stroke:var(--a);stroke-width:5;fill:var(--d)}
.overlay .pr-nose{fill:var(--a)}
.overlay .pr-eye{fill:var(--bg);stroke:var(--a);stroke-width:3}
.overlay .piece.down{opacity:.55}
.overlay .piece.gone{opacity:0}
.overlay .piece.hit .pr-hull{fill:var(--danger)}
.overlay .beam{stroke:var(--danger);stroke-width:6;stroke-linecap:round;opacity:.9;filter:drop-shadow(0 0 6px var(--danger))}
.overlay .bay-pick{fill:var(--accent);opacity:.18;cursor:pointer}
.overlay .bay-pick:hover{opacity:.45}
.overlay .flag .pr-pole{fill:var(--steel)}
.overlay .flag .pr-banner{fill:var(--warn);stroke:var(--bg);stroke-width:3}
.overlay .flag .pr-num{fill:#120c00;font:700 44px ui-monospace,Menlo,Consolas,monospace;text-anchor:middle;dominant-baseline:middle}
.side{border-left:1px solid var(--line);padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.regs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.slot{aspect-ratio:3/4;border:1px dashed var(--lit);border-radius:4px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:2px;position:relative;background:var(--panel);cursor:pointer;min-width:0;padding:0}
.slot .n{position:absolute;top:2px;left:5px;font-size:10px;color:var(--dim)}
.slot.locked{border-style:solid;border-color:var(--danger);cursor:default}
.slot.locked::after{content:"locked";position:absolute;bottom:2px;font-size:9px;color:var(--danger)}
.slot.over{border-color:var(--accent);background:#0d2028}
.hand{display:flex;flex-wrap:wrap;gap:8px;min-height:64px}
.card{--kind:var(--accent);width:78px;height:106px;border:1px solid var(--lit);border-top:4px solid var(--kind);border-radius:6px;
  background:linear-gradient(180deg,var(--panel2),var(--panel));display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:4px;cursor:grab;padding:4px 0 6px;position:relative;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.card:hover:not(:disabled){border-color:var(--accent)}
.card .cart{width:58px;height:58px;display:block;color:var(--kind)}
.card .cart .cshaft{stroke:currentColor;stroke-width:8;stroke-linecap:round;fill:none}
.card .cart .cmark{stroke:currentColor;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;fill:none}
.card .l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--text);text-align:center;line-height:1.1}
.card .p{position:absolute;top:4px;right:6px;font-size:10px;color:var(--dim)}
.card.k-move1,.card.k-move2,.card.k-move3{--kind:var(--accent)}
.card.k-back{--kind:var(--warn)}
.card.k-left,.card.k-right{--kind:var(--violet)}
.card.k-uturn{--kind:var(--violet)}
.card.k-powerUp{--kind:var(--good)}
.card.k-again{--kind:var(--steel)}
.card.k-spam{--kind:var(--danger);border-color:var(--danger);background:linear-gradient(180deg,#1a0b0b,#120808)}
.chip.up{border-color:var(--warn);color:var(--warn)}
.hand .pair{font-size:10px;padding:2px 6px;min-height:0;align-self:center;border-color:var(--warn);color:var(--warn)}
.slot .crab{position:absolute;bottom:2px;font-size:9px;color:var(--warn)}
.card[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.chip.inert{opacity:.6;border-style:dashed}
button[data-ruleset]{padding:8px 14px}
.card.k{position:absolute;top:2px;right:4px}
.card .hot{position:absolute;top:2px;right:5px;font-size:9px;color:var(--dim)}
.slot .card{cursor:pointer;width:100%;height:100%;border:0;border-top:4px solid var(--kind);box-shadow:none}
.slot .card .cart{width:70%;height:auto}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ask{border:1px solid var(--accent);border-radius:4px;padding:10px;background:#0a1620}
.ask p{margin:0 0 8px}
.robots{display:flex;flex-direction:column;gap:4px}
.robot{display:grid;grid-template-columns:14px 1fr auto auto;gap:8px;align-items:center;font-size:12px}
.robot .sw{width:12px;height:12px;border-radius:2px}
.robot.dead{opacity:.5}
.robot .pips{display:inline-flex;gap:2px}
.robot .pip{width:6px;height:10px;background:var(--line);border-radius:1px}
.robot .pip.on{background:var(--danger)}
.robot .tag{font-size:10px;color:var(--dim)}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 4px 22px}
.chip{font-size:10px;border:1px solid var(--violet);color:var(--violet);border-radius:3px;padding:1px 6px;cursor:help}
.log{font-size:11px;color:var(--dim);max-height:180px;overflow-y:auto;border-top:1px solid var(--line);padding-top:6px}
.log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log .reg{color:var(--accent)}
.banner{border:1px solid var(--warn);border-radius:4px;padding:10px;background:#1a1400;color:var(--warn)}
.curtain{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10;flex-direction:column;gap:14px}
.curtain p{font-size:18px;color:var(--text)}
.setup{max-width:900px;margin:0 auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px}
.courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.course{border:1px solid var(--line);border-radius:4px;padding:6px;background:var(--panel);cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:left}
.course[aria-pressed=true]{border-color:var(--accent)}
.course svg{width:100%;height:auto;display:block;background:var(--bg)}
.course .name{font-size:12px;color:var(--text)}
.course .meta{font-size:10px;color:var(--dim)}
.seats{display:flex;flex-direction:column;gap:6px}
.seat{display:grid;grid-template-columns:24px 16px 1fr 1fr 1fr;gap:8px;align-items:center}
.seat .sw{width:14px;height:14px;border-radius:3px}
.keys{font-size:11px;color:var(--dim)}
@media (max-width:860px){
  .main{grid-template-columns:1fr}
  .side{border-left:0;border-top:1px solid var(--line)}
}
`;

export function injectCSS(doc) {
  if (doc.getElementById("pr-game-css")) return;
  const s = doc.createElement("style");
  s.id = "pr-game-css";
  s.textContent = CSS;
  doc.head.appendChild(s);
}
