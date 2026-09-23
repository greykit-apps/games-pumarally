/* The game's CSS, injected so there is one fewer asset to cache-bust. The
 * palette is the renderer's, imported rather than retyped, so the panel and
 * the board are the same colours because they come from the same table. */
import { TOKENS } from "../../editor/render/palette.js";

const T = TOKENS;

export const CSS = `
:root{--bg:${T.bg};--panel:${T.panel};--panel2:${T.panelAlt};--line:${T.border};--lit:${T.borderLit};
  --text:${T.text};--ink:${T.ink};--dim:${T.dim};--accent:${T.accent};--warn:${T.warn};--danger:${T.danger};
  --good:${T.good};--violet:${T.violet};--steel:${T.steel};--blue:#4c8dff}
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
.stage{position:relative;overflow:hidden;padding:12px;display:flex;align-items:flex-start;justify-content:center;touch-action:none}
.stage .board{position:relative;max-width:100%;transform-origin:0 0}
.stage .board svg{display:block;width:100%;height:auto}
.stage .board .overlay{position:absolute;inset:0;overflow:visible}
.stage .caption{position:absolute;top:8px;left:8px;padding:5px 10px;background:rgba(6,10,16,.82);border:1px solid var(--line);border-radius:4px;pointer-events:none;line-height:1.3}
.stage .caption b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.stage .caption span{display:block;font-size:11px;color:var(--dim)}
.stage .caption span:empty{display:none}
.overlay .piece{transition:transform calc(.26s * var(--anim,1)) cubic-bezier(.3,.7,.3,1)}
.overlay .spin{transition:transform calc(.2s * var(--anim,1)) ease;transform-origin:50px 50px}
.overlay .pr-hull{stroke:var(--a);stroke-width:4;stroke-linejoin:round;fill:var(--d)}
.overlay .pr-nose{fill:#fff6dc}
.overlay .pr-eye{fill:var(--bg);opacity:.85}
.overlay .pr-bot-visor{fill:var(--a)}
.overlay .pr-bot-lamp{fill:#fff;opacity:.55}
.overlay .pr-bot-tread{fill:#05070f;opacity:.6}
.overlay .pr-bot-cab{fill:url(#pr-steel-g);stroke:#0b0d14;stroke-width:1.5}
.overlay .pr-bot-lip{fill:none;stroke:#fff;stroke-opacity:.22;stroke-width:2;stroke-linecap:round}
.overlay .piece.down{opacity:.55}
.overlay .piece.virtual{opacity:.5}
.overlay .piece.virtual .pr-hull{stroke-dasharray:8 6}
.overlay .piece.gone{opacity:0}
.overlay .piece.ghost{opacity:.45}
.overlay .piece.ghost .pr-hull{fill:none;stroke-dasharray:10 7}
.overlay .piece.ghost .pr-nose,.overlay .piece.ghost .pr-bot-visor,.overlay .piece.ghost .pr-bot-cab,.overlay .piece.ghost .pr-bot-tread,.overlay .piece.ghost .pr-bot-lamp,.overlay .piece.ghost .pr-bot-lip{opacity:.3}
.overlay .piece.hit .pr-hull{fill:var(--danger)}
.overlay .piece .tag{font:600 26px ui-monospace,Menlo,Consolas,monospace;fill:var(--text);stroke:var(--bg);stroke-width:5;paint-order:stroke;letter-spacing:.04em;pointer-events:none}
.overlay .piece.gone .tag,.overlay .piece.ghost .tag{display:none}
.overlay .flag.hit .pr-banner{fill:var(--good)}
.overlay .beam{stroke:var(--danger);stroke-width:6;stroke-linecap:round;opacity:.9;filter:drop-shadow(0 0 6px var(--danger))}
.overlay .bay-pick{fill:var(--accent);opacity:.18;cursor:pointer}
.overlay .bay-pick:hover{opacity:.45}
.overlay .reboot .pr-tok{fill:var(--good);opacity:.85;stroke:var(--bg);stroke-width:3}
.overlay .reboot .pr-tok-arrow{fill:none;stroke:var(--bg);stroke-width:9;stroke-linecap:round;stroke-linejoin:round}
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
.card.k-haywire{--kind:var(--violet);border-color:var(--violet);background:linear-gradient(180deg,#150c26,#0d0818)}
.card.k-haywire .cart{width:34px;height:34px}
.card .hw{font-size:8px;line-height:1.15;color:var(--text);text-align:center;padding:0 4px;max-height:44px;overflow:hidden}
.card.k-haywire.back{background:repeating-linear-gradient(-45deg,#150c26 0 6px,#1d1236 6px 12px);opacity:.85}
.hand .pair{font-size:10px;padding:2px 6px;min-height:0;align-self:center;border-color:var(--warn);color:var(--warn)}
.slot .crab{position:absolute;bottom:2px;font-size:9px;color:var(--warn)}
.card[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
button[data-ruleset]{padding:8px 14px}
.card.k{position:absolute;top:2px;right:4px}
.card .hot{position:absolute;top:2px;right:5px;font-size:9px;color:var(--dim)}
.slot .card{cursor:pointer;width:100%;height:100%;border:0;border-top:4px solid var(--kind);box-shadow:none}
.slot .card .cart{width:70%;height:auto}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ask{border:1px solid var(--accent);border-radius:4px;padding:10px;background:#0a1620}
.ask p{margin:0 0 8px}
.ask .away{margin:6px 0 0;color:var(--text);font-size:12px}
.robots{display:flex;flex-direction:column}
.robot{display:flex;flex-direction:column;gap:5px;font-size:12px;padding:7px 0;border-top:1px solid var(--line)}
.robot:first-child{border-top:0;padding-top:0}
.robot .head{display:flex;align-items:center;gap:8px}
.robot .head .name{color:var(--text)}
.robot .sw{width:12px;height:12px;border-radius:2px;flex:none}
.robot.dead{opacity:.5}
.robot .tag{font-size:10px;color:var(--dim)}
.bars{display:flex;flex-wrap:wrap;gap:4px 12px;margin-left:20px}
.bar{display:inline-flex;gap:2px;align-items:center;cursor:default}
.bar i{display:block;width:6px;height:10px;border-radius:1px;background:var(--line)}
.bar b{font-size:9px;color:var(--dim);font-weight:400;margin-left:2px}
.bar.lives i.on{background:var(--blue)}
.bar.flags i.on{background:var(--warn)}
.bar.energy i.on{background:var(--good)}
.bar.damage i.on{background:var(--danger)}
.kit{display:flex;flex-wrap:wrap;gap:6px;margin-left:20px}
.ucard{--k:var(--violet);position:relative;width:64px;height:86px;border:1px solid var(--lit);border-top:3px solid var(--k);border-radius:5px;
  background:linear-gradient(180deg,var(--panel2),var(--panel));display:flex;flex-direction:column;align-items:center;padding:5px 3px 3px;gap:2px;color:var(--k);cursor:grab;user-select:none}
.ucard[draggable=false]{cursor:default}
.ucard.up{--k:var(--warn)}
.ucard.temp{--k:var(--accent)}
.ucard.inert{opacity:.6;border-style:dashed}
.ucard.over{outline:2px solid var(--accent);outline-offset:1px}
.ucard .kart{width:30px;height:30px;display:block;flex:none}
.ucard .kart .kline{stroke:currentColor;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;fill:none}
.ucard .kart .kfill{fill:currentColor}
.ucard .kart .kback{fill:var(--panel)}
.ucard .n{font-size:8.5px;line-height:1.15;text-align:center;color:var(--text);max-height:21px;overflow:hidden}
.ucard .m{font-size:8px;color:var(--dim);text-align:center;line-height:1.1;margin-top:auto}
.ucard .tog{position:absolute;top:-3px;right:-1px;min-height:0;padding:0 5px;font-size:8px;line-height:15px;border-radius:0 4px 0 4px;border-color:var(--line);color:var(--dim);background:var(--panel)}
.ucard .tog[aria-pressed=true]{color:var(--good);border-color:var(--good)}
.ctl{display:flex;flex-wrap:wrap;gap:6px;margin-left:20px}
.ask .ctl{margin:8px 0 0}
.plan{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:4px 0 0}
.live{border-top:1px solid var(--line);padding-top:6px;margin-top:6px}
.live .who{font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.live .ctl{margin:6px 0 0}
.plan .col{display:flex;flex-direction:column;gap:3px;min-width:0}
.plan .arm{font-size:9px;min-height:0;padding:1px 3px;line-height:15px;border-color:var(--line);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plan .arm[aria-pressed=true]{color:var(--good);border-color:var(--good)}
.ctl button{font-size:11px;min-height:26px;padding:2px 8px}
.ctl button[aria-pressed=true]{border-color:var(--warn);color:var(--warn)}
.shop{margin-left:0}
.shopcard{display:flex;flex-direction:column;align-items:center;gap:4px}
.shopcard button{font-size:10px;min-height:24px;padding:2px 8px}
.tip{position:fixed;z-index:20;width:280px;pointer-events:none;border:1px solid var(--accent);border-radius:5px;background:#0a1620;color:var(--text);
  padding:8px 10px;font-size:11px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.65)}
.tip b{color:var(--accent);font-size:12px}
.tip .tt{display:block;font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase}
.tip p{margin:5px 0 0}
.tip .de{color:var(--dim);font-style:italic}
.tip .st{color:var(--warn)}
.log{font-size:11px;color:var(--dim);max-height:180px;overflow-y:auto;border-top:1px solid var(--line);padding-top:6px}
.log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log .reg{color:var(--accent)}
.banner{border:1px solid var(--warn);border-radius:4px;padding:10px;background:#1a1400;color:var(--warn)}
.curtain{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10;flex-direction:column;gap:14px}
.curtain p{font-size:18px;color:var(--text)}
.setup{max-width:900px;margin:0 auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tabs button{border:1px solid transparent;border-bottom:0;border-radius:4px 4px 0 0;background:none;color:var(--dim);padding:8px 14px;margin-bottom:-1px}
.tabs button:hover:not(:disabled){border-color:var(--line);color:var(--text)}
.tabs button[aria-selected=true]{color:var(--accent);border-color:var(--line);background:var(--bg);box-shadow:0 1px 0 var(--bg)}
.tab{display:flex;flex-direction:column;gap:12px}
.tab>p{margin:0}
.tab .lead{font-size:14px;color:var(--text);max-width:64ch}
.blurb{font-size:13px;color:var(--text);max-width:64ch;margin:6px 0 0}
input[type=range]{accent-color:var(--accent);flex:1;min-width:120px;max-width:320px;margin:0 6px}
input[type=number][data-num]{width:5ch;text-align:center}
.rules{display:flex;flex-direction:column;gap:10px}
.rule{display:grid;grid-template-columns:auto auto 1fr;gap:4px 10px;align-items:baseline;cursor:pointer}
.rule input,.rule select{grid-row:span 2;align-self:start}
.rule b{color:var(--text);font-weight:600}
.rule .keys{grid-column:2/4;max-width:72ch}
.courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.course{border:1px solid var(--line);border-radius:4px;padding:6px;background:var(--panel);cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:left}
.course[aria-pressed=true]{border-color:var(--accent)}
.course svg{width:100%;height:auto;display:block;background:var(--bg)}
.course .name{font-size:12px;color:var(--text)}
.course .meta{font-size:10px;color:var(--dim)}
.course.any{justify-content:center;align-items:center;min-height:120px;border-style:dashed}
.course.any .name{font-size:14px}
.knob{min-width:2ch;text-align:center;font-size:16px;color:var(--text)}
.row>label{color:var(--dim);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-right:4px}
.row>label:has(input){color:var(--text);font-size:14px;letter-spacing:0;text-transform:none;margin-left:12px}
.tile{position:relative;display:flex}
.tile>.course{flex:1}
.tile .forget{position:absolute;top:4px;right:4px;min-height:0;padding:0 8px;line-height:22px;font-size:15px;opacity:.7;background:var(--bg)}
.tile .forget:hover{opacity:1;border-color:var(--danger);color:var(--danger)}
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
