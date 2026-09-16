/* The editor's CSS, injected rather than shipped as a file.
 *
 * One fewer asset to cache-bust, and the styles live next to the markup that
 * uses them. The palette is the renderer's, imported rather than re-typed --
 * the rail swatch and the board are the same colours because they come from
 * the same table.
 */

import { ART, MARK } from "../render/theme.js";

export const CSS = `
:root{
  --bg:#05070f; --panel:#0e1119; --line:#1e2331; --ink:#c8d4ea; --dim:#8b8fa8;
  --hot:#35e0ff; --warn:#f2b632; --bad:#ff5f56; --ok:#39ff88;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;overflow:hidden}
button{font:inherit;color:inherit;background:none;border:1px solid var(--line);
  border-radius:3px;padding:3px 7px;cursor:pointer}
button:hover{border-color:var(--dim)}
button[aria-pressed=true]{border-color:var(--hot);color:var(--hot);background:#0d2028}
button:disabled{opacity:.4;cursor:default}

.ed{display:grid;height:100dvh;
  grid-template-columns:186px minmax(0,1fr) 260px;
  grid-template-rows:minmax(0,1fr) auto;
  grid-template-areas:"rail stage insp" "status status status"}
.rail{grid-area:rail;border-right:1px solid var(--line);overflow-y:auto;padding:8px}
.stage{grid-area:stage;position:relative;overflow:hidden;background:#000}
.insp{grid-area:insp;border-left:1px solid var(--line);overflow-y:auto;padding:8px}
.status{grid-area:status;border-top:1px solid var(--line);padding:5px 10px;
  display:flex;gap:14px;align-items:center;color:var(--dim);min-height:28px}

.rail h3{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);
  margin:12px 0 5px;font-weight:600}
.rail h3:first-child{margin-top:0}
.tool{display:flex;align-items:center;gap:7px;width:100%;padding:3px 5px;margin-bottom:2px;
  border:1px solid transparent;border-radius:3px;cursor:pointer;text-align:left;
  background:none;color:var(--ink);font:inherit}
.tool:hover{background:#141824}
.tool[aria-pressed=true]{background:#0d2028;border-color:var(--hot);color:var(--hot)}
.tool .sw{width:22px;height:22px;flex:0 0 22px;border-radius:2px;background:#11141d;
  border:1px solid var(--line);overflow:hidden}
.tool .sw svg{width:100%;height:100%;display:block}
.tool .hot{margin-left:auto;color:var(--dim);font-size:10px}

.viewport{position:absolute;inset:0;cursor:crosshair;touch-action:none}
.pan .viewport{cursor:grab}
.world{position:absolute;transform-origin:0 0;will-change:transform}
.photo{position:absolute;left:0;top:0;pointer-events:none;image-rendering:auto}
.board{position:absolute;left:0;top:0}
.board svg{display:block;width:100%;height:100%}
.ghost{position:absolute;pointer-events:none;border:1px solid var(--hot);
  background:rgba(53,224,255,.09);border-radius:2px}
.ghost.bad{border-color:var(--bad);background:rgba(255,95,86,.12)}
.ghost.edge{background:var(--hot);border:none;border-radius:1px;opacity:.85}
.mark{position:absolute;pointer-events:none;border:2px solid var(--bad);border-radius:2px}
.mark.warn{border-color:var(--warn)}

.insp h3{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);
  margin:12px 0 6px;font-weight:600}
.insp h3:first-child{margin-top:0}
.row{display:flex;gap:5px;align-items:center;margin-bottom:5px;flex-wrap:wrap}
.row label{color:var(--dim);min-width:52px}
.pill{border:1px solid var(--line);border-radius:3px;padding:1px 6px;font-size:11px;color:var(--dim)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:12px}
.kv dt{color:var(--dim)} .kv dd{margin:0}
input[type=range]{width:100%;accent-color:var(--hot)}
input[type=text],input[type=number],select{background:#11141d;color:var(--ink);
  border:1px solid var(--line);border-radius:3px;padding:2px 5px;font:inherit;min-width:0;width:100%}
.diag{margin:0;padding:0;list-style:none;font-size:12px}
.diag li{padding:4px 6px;border-left:2px solid var(--bad);margin-bottom:4px;
  background:#170f12;border-radius:0 3px 3px 0;cursor:pointer}
.diag li.warn{border-left-color:var(--warn);background:#191509}
.diag li .code{color:var(--dim);font-size:10px;display:block}
.lib{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px}
.lb{border:1px solid var(--line);border-radius:3px;padding:3px;cursor:pointer;background:none;
  display:flex;flex-direction:column;gap:3px;color:var(--ink);text-align:center}
.lb:hover{border-color:var(--hot)}
.lb[aria-pressed=true]{border-color:var(--hot)}
.lb-thumb{display:block;line-height:0}
.lb-thumb svg{width:100%;height:auto;display:block;background:var(--bg)}
.lb-name{font-size:10px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.none{color:var(--dim);font-style:italic}
.count{margin-left:auto}
.bad{color:var(--bad)} .warn{color:var(--warn)} .ok{color:var(--ok)}
.sep{width:1px;height:14px;background:var(--line)}
.grow{flex:1}
@media (max-width:900px){
  .ed{grid-template-columns:150px minmax(0,1fr);
    grid-template-areas:"rail stage" "insp insp" "status status"}
  .insp{border-left:none;border-top:1px solid var(--line);max-height:34vh}
}
`;

export function injectCSS(doc) {
  const el = doc.createElement("style");
  el.textContent = CSS;
  doc.head.appendChild(el);
}
