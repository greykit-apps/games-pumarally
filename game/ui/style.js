/* The game's CSS, injected so there is one fewer asset to cache-bust. The
 * palette is the renderer's, imported rather than retyped, so the panel and
 * the board are the same colours because they come from the same table. */
import { TOKENS } from "../../editor/render/palette.js";
import { SCENE_CSS } from "./scene.js";
import { TITLE_CSS } from "./title.js";

const T = TOKENS;

export const CSS = `
/* @gk-tokens-begin v0.1 -- greykit.games canon (games-meta STANDARD.md §4): the Tactical palette, PumaRally's (editor/render/palette.js). The copy of record is games-meta's canon/gk-tokens.css. */
:root{--bg:#05070f;--panel:#0a0e1a;--panel2:#0d1424;--line:#1b2540;--lit:#47609c;
  --text:#dbe4fb;--ink:#8b96b8;--dim:#7d8aa8;--accent:#54f2ff;--warn:#ffb000;--danger:#ff5266;
  --good:#4ade6a;--violet:#b47dff;--steel:#94a0c4;--blue:#4c8dff}
/* @gk-tokens-end */
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;touch-action:manipulation}
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
.pr{min-height:100dvh;display:flex;flex-direction:column;--rail:460px}
/* the factory behind the board (scene.js): pinned to the window, as tall as
 * it, and as wide as the board's column, so the right-hand landmarks stand
 * at the rail's edge rather than under it. The bar and the rail are opaque
 * over it; only the stage is clear. */
.pr>.scene{position:fixed;top:0;bottom:0;left:0;right:var(--rail);z-index:0;pointer-events:none;overflow:hidden;
  background:linear-gradient(#05070f 0%,#070b17 40%,#0c1020 68%,#181622 88%,#231a17 100%)}
.pr>.scene svg{display:block;width:100%;height:100%}
.pr>.top,.pr>.main{position:relative;z-index:1}
.top{display:flex;align-items:center;gap:14px;padding:8px 14px;border-bottom:1px solid var(--line);background:var(--bg)}
.top .grow{flex:1}
.top .turn{color:var(--dim)}
.main{display:grid;grid-template-columns:minmax(0,1fr) var(--rail);gap:0;flex:1;min-height:0}
.stage{position:relative;overflow:hidden;padding:12px;display:flex;align-items:flex-start;justify-content:center;touch-action:pan-y}
.stage .board{position:relative;max-width:100%;transform-origin:0 0}
.stage .board svg{display:block;width:100%;height:auto}
.stage .board .overlay{position:absolute;inset:0;overflow:visible}
.viewbtns{display:none;position:absolute;top:8px;right:8px;z-index:2;gap:6px}
.viewbtns button{background:rgba(6,10,16,.82)}
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
.side{border-left:1px solid var(--line);background:var(--bg);padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
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
.card,.ucard{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.floater{position:fixed;z-index:30;margin:0;pointer-events:none;opacity:.92;box-shadow:0 10px 26px rgba(0,0,0,.75);transform:scale(1.08)}
.ask .touchhint{display:none;font-size:11px;color:var(--dim);margin:6px 0 0}
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
.setup{display:flex;flex-direction:column;height:100dvh}
.setup .top{padding:8px 16px;min-height:52px}
.gearwrap{position:relative}
.gearwrap>button{font-size:18px;line-height:1;padding:0 9px;min-height:32px}
.gearwrap>button[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}
.pop{position:absolute;right:0;top:40px;width:360px;z-index:9;background:var(--panel);border:1px solid var(--lit);border-radius:5px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.7)}
.pop .row{flex-wrap:nowrap;align-items:flex-start;gap:10px}
.pop .row>button{border-color:var(--danger);color:var(--danger);white-space:nowrap}
.modes{display:flex;align-items:center;padding:8px 16px;min-height:52px;border-bottom:1px solid var(--line);background:var(--panel);position:relative}
.tabs{display:flex;margin:0 auto}
.tabs button{border:1px solid var(--lit);border-radius:0;margin-left:-1px;background:var(--bg);color:var(--text);padding:6px 20px;min-height:34px;letter-spacing:.04em}
.tabs button:first-child{border-radius:5px 0 0 5px;margin-left:0}
.tabs button:last-child{border-radius:0 5px 5px 0}
.tabs button:hover:not([aria-selected=true]){border-color:var(--accent);color:var(--accent);position:relative;z-index:1}
.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#04121a;font-weight:600;position:relative;z-index:2}
.modes .build{position:absolute;right:16px;top:50%;transform:translateY(-50%);border:1px solid var(--warn);color:var(--warn);border-radius:4px;padding:6px 14px;background:var(--panel2);text-decoration:none;white-space:nowrap}
.modes .build:hover{background:#1a1400}
.setup .body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px}
.setup .map{min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px 16px;border-right:1px solid var(--line)}
.setup .map>h2{margin:4px 0 0}
.setup .win{flex:1;min-height:0;overflow-y:auto}
.knobs{display:flex;flex-direction:column;gap:8px}
.setup .side{border-left:0;padding:12px 16px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow-y:auto}
.setup .side h2{margin-top:0}
.setup .start{margin-top:auto;padding-top:14px}
.setup .start button{width:100%;min-height:38px;font-size:14px}
.rulesets{flex-wrap:nowrap}
.rulesets button{flex:1;text-align:left;padding:6px 10px}
.rulesets button .keys{display:block}
.blurb{font-size:12px;color:var(--text);margin:6px 0 0;line-height:1.4}
input[type=range]{accent-color:var(--accent);flex:1;min-width:120px;max-width:320px;margin:0 6px}
input[type=number][data-num]{width:7ch;text-align:center}
.house{display:flex;flex-direction:column;gap:5px}
.hr{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);position:relative}
.hr label{display:flex;align-items:center;gap:8px;cursor:pointer}
.hr input{margin:0;accent-color:var(--accent)}
.hr select{min-height:24px;padding:1px 4px;font-size:12px}
.hr .i{margin-left:auto;color:var(--dim);font-size:11px;border:1px solid var(--line);border-radius:50%;width:17px;height:17px;line-height:15px;text-align:center;cursor:help;flex:none}
.hr .i:hover,.hr .i:focus{color:var(--accent);border-color:var(--accent);outline:0}
.hr .i:hover::after,.hr .i:focus::after{content:attr(data-tip);position:absolute;right:24px;top:-6px;width:260px;z-index:5;border:1px solid var(--accent);border-radius:5px;background:#0a1620;color:var(--text);padding:7px 9px;font-size:11px;line-height:1.4;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.65);white-space:normal}
.courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.courses.small{grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px}
.courses.wide{grid-template-columns:repeat(auto-fill,minmax(225px,1fr));align-items:start}
.course{border:1px solid var(--line);border-radius:4px;padding:5px;background:var(--panel);cursor:pointer;display:flex;flex-direction:column;gap:3px;text-align:left;min-width:0}
.course[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.course .thumb{width:100%;height:auto;display:block;background:var(--bg)}
.course .name{font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.course .meta{font-size:10px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.courses .shelf{grid-column:1/-1;margin:8px 0 0;padding-top:8px;border-top:1px solid var(--line)}
.courses .shelf:first-child{margin-top:0;padding-top:0;border-top:0}
/* the shelves pack into rows: one grid of equal columns across the window,
 * and each shelf spans as many columns as it has boards (packShelves in
 * setup.js sets --cols and each --span), so shelves share a row without
 * gaps and a shelf's boards wrap only when it has more than a row holds */
.courses.shelved{display:grid;grid-template-columns:repeat(var(--cols,6),minmax(0,1fr));gap:26px 10px;align-items:start;padding:8px 4px}
.courses.shelved.small{gap:24px 8px}
/* each shelf is a card: a faint panel behind its heading and boards, drawn
 * out into the gutter so a tile keeps its width, with a clear strip of page
 * between two cards side by side. Inside a card the boards sit as close as
 * they always did (the subgrid's own column gap). */
.shelfbox{grid-column:span var(--span,1);display:grid;grid-template-columns:subgrid;column-gap:8px;row-gap:6px;min-width:0;position:relative;isolation:isolate}
.courses.shelved.small .shelfbox{column-gap:6px}
.shelfbox::before{content:"";position:absolute;inset:-8px -3px;z-index:-1;border:1px solid color-mix(in srgb,var(--lit) 45%,var(--line));border-radius:6px;background:color-mix(in srgb,var(--line) 55%,var(--panel2))}
.courses.shelved.small .shelfbox::before{inset:-7px -2px}
.shelfbox.tinted::before{background:color-mix(in srgb,var(--tint) 17%,var(--panel2));border-color:color-mix(in srgb,var(--tint) 60%,var(--line))}
.shelfbox.tinted .shelf{border-bottom-color:color-mix(in srgb,var(--tint) 45%,var(--line))}
.courses.shelved .shelfbox.tinted .shelf::before{background:var(--tint)}
.courses.shelved .shelf{grid-column:1/-1;margin:0;padding:0 0 5px 7px;border-top:0;border-bottom:1px solid color-mix(in srgb,var(--lit) 35%,var(--line));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;color:var(--text)}
.courses.shelved .shelf::before{content:"";position:absolute;left:0;top:1px;bottom:6px;width:3px;border-radius:1px;background:var(--accent)}
.shelftiles{display:contents}
.courses.shelved .course.any{grid-column:1/-1}
.course.any{grid-column:1/-1;flex-direction:row;justify-content:center;align-items:baseline;gap:10px;min-height:0;padding:8px;border-style:dashed;text-align:center}
.course.any .name{font-size:13px;white-space:normal}
.course.any .meta{white-space:normal}
.course.pool[aria-pressed=false]{opacity:.35}
.course.pool[aria-pressed=false]:hover{opacity:.6}
.course.pool[aria-pressed=true]{border-color:var(--accent);box-shadow:none}
.row>label{color:var(--dim);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-right:4px;min-width:11ch}
.tile{position:relative;display:flex}
.tile>.course{flex:1}
.tile .forget{position:absolute;top:4px;right:4px;min-height:0;padding:0 8px;line-height:22px;font-size:15px;opacity:.7;background:var(--bg)}
.tile .forget:hover{opacity:1;border-color:var(--danger);color:var(--danger)}
.seats{display:flex;flex-direction:column;gap:4px}
.seat{display:grid;grid-template-columns:18px 14px 1fr 1fr;gap:6px;align-items:center;font-size:12px}
.seat select{min-height:26px;padding:2px 6px;font-size:12px}
.seat .sw{width:12px;height:12px;border-radius:3px}
.seat.empty{opacity:.45}
.seat.empty .sw{border:1px dashed var(--lit)}
.seats+.keys{margin:6px 0 0}
.keys{font-size:11px;color:var(--dim)}
/* A touch is present (a tablet, or a touchscreen laptop with its mouse still
 * attached): everything pressable is at least 44px a side, and the view
 * buttons show. Asked of the pointers, never of the window's width -- the
 * widths here are for narrow windows, which a mouse can have too. */
@media (any-pointer:coarse){
  .viewbtns{display:flex}
  .ask .touchhint{display:block}
  button,select,input[type=number]{min-height:44px}
  button{min-width:44px}
  .ctl button,.shopcard button,.plan .arm,.hand .pair,.tabs button,.gearwrap>button,.tile .forget,.hr select,.seat select{min-height:44px}
  .plan .arm{font-size:11px;line-height:1.15;padding:4px;white-space:normal}
  .hand .pair{font-size:12px;padding:4px 12px}
  .ucard{width:84px;height:122px}
  .ucard .tog{position:static;width:100%;margin-top:3px;font-size:11px;line-height:1;border-radius:4px}
  .modes .build{display:inline-flex;align-items:center;min-height:44px}
  .course.any,.setup .start button{min-height:44px}
  select{min-width:44px}
  .hr,.hr label{min-height:44px}
  .hr input[type=checkbox],.hr input[type=radio]{width:24px;height:24px}
  .hr .i{position:relative;width:28px;height:28px;line-height:26px;font-size:13px}
  .hr .i::before{content:"";position:absolute;inset:-9px}
  input[type=range]{min-height:44px}
}
@media (max-width:860px){
  .pr>.scene{display:none}
  .main{grid-template-columns:1fr}
  .main .side{border-left:0;border-top:1px solid var(--line)}
  .setup{height:auto}
  .setup .body{grid-template-columns:1fr}
  .setup .side{order:-1;border-bottom:1px solid var(--line);overflow:visible}
  .setup .map{border-right:0}
  .setup .win{overflow:visible}
  .modes{flex-wrap:wrap;gap:8px}
  .modes .build{position:static;transform:none;margin-left:auto}
  .setup .start{margin-top:0}
}
/* In step with the quicker entrance (main.js, finish()'s timing): each line
 * of the name settles faster than canon's .9s, and the cards and counters
 * come down closer together than canon's 130ms. A card's face and its back
 * share one delay, so both change together; each card's own deal keeps
 * canon's .62s, which gktDeal's snap is timed to. */
[data-pumarally-game] .gk-title.gkt.gki-intro h1>span.gki-on{animation-duration:.45s}
[data-pumarally-game] .gk-title.gkt.gk-rise .gk-menu>.gk-pr,
[data-pumarally-game] .gk-title.gkt.gk-rise .gk-menu>.gk-pr::after{animation-delay:calc(var(--i) * 100ms)}
[data-pumarally-game] .gk-title.gkt.gk-rise .gk-menu .gk-util .gk-pr{animation-delay:calc(var(--i) * 100ms + 100ms)}
/* The title's hand as program cards (main.js, dressCards): the table's own
 * rules place, fan, lift and deal each card; this dresses it as the race's
 * hand does -- a band of the card's kind colour across the top, its move
 * drawn in that colour, and the menu item's words under the drawing. No
 * priority, and none of the table's key-and-pip corners: the keys still
 * press their items. Sized as fractions of the card's width (--rc-k: the
 * table's --k-w, or a phone's own) so every card fits whatever it says. */
[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card{--rc-k:var(--k-w);justify-content:flex-start;
  gap:calc(var(--rc-k) * .05);padding:calc(var(--rc-k) * .2) calc(var(--rc-k) * .1) calc(var(--rc-k) * .16);border-top:4px solid var(--kind)}
[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card:focus,[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card:hover{border-top-color:var(--kind)}
.rc-card.k-move1,.rc-card.k-move2,.rc-card.k-move3{--kind:var(--accent)}
.rc-card.k-back{--kind:var(--warn)}
.rc-card.k-left,.rc-card.k-right,.rc-card.k-uturn{--kind:var(--violet)}
.rc-card .cart{flex:none;display:block;width:calc(var(--rc-k) * .44);height:calc(var(--rc-k) * .44);color:var(--kind)}
.rc-card .cart .cshaft,.rc-card .cart .cmark{stroke:currentColor;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;fill:none}
[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card>kbd,[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card>.gkt-ix{display:none}
[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card .gk-lbl{font-size:calc(var(--rc-k) * .118);line-height:1.15}
[data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card .gk-meta{font-size:calc(var(--rc-k) * .085);line-height:1.25}
/* a phone: two columns of the table's own, the drawing smaller */
@media (max-width:640px){
  [data-pumarally-game] .gk-title.gkt .gk-menu>button.rc-card{--rc-k:128px;padding:22px 10px 14px}
  .rc-card .cart{width:40px;height:40px}
}
` + SCENE_CSS + TITLE_CSS;

export function injectCSS(doc) {
  if (doc.getElementById("pr-game-css")) return;
  const s = doc.createElement("style");
  s.id = "pr-game-css";
  s.textContent = CSS;
  doc.head.appendChild(s);
}
