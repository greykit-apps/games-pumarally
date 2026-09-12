#!/usr/bin/env node
/*
 * Regenerate icon.svg from the robot sprite in pumarally.js.
 *
 *   node tools/make-icon.js
 *
 * The favicon is the in-game robot, so it is generated from the same character
 * grid the game blits rather than drawn separately. Redraw the robot and the
 * icon follows; hand-edit the icon and it silently stops being the robot.
 */
const fs = require("fs");
const path = require("path");
const PR = require(path.join(__dirname, "..", "pumarally.js")).__PR;

const sp = PR.SPRITES.robot;
const pal = Object.assign({}, sp.palette);
const livery = PR.LIVERIES[0];
pal.a = livery.a;
pal.d = livery.d;

const N = sp.rows.length;
const px = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const ch = sp.rows[y][x];
    if (ch === sp.transparent) continue;
    const colour = pal[ch];
    if (!colour) continue;
    px.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="64" height="64" shape-rendering="crispEdges" role="img" aria-label="PumaRally">
<!-- Generated from the robot sprite in pumarally.js by tools/make-icon.js.
     Do not hand-edit: regenerate so the icon and the robot stay the same shape. -->
<rect width="${N}" height="${N}" fill="${PR.TOKENS.bg}"/>
${px.join("\n")}
</svg>
`;

const out = path.join(__dirname, "..", "icon.svg");
if (process.argv.includes("--check")) {
  const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (have !== svg) {
    console.error("  error:   icon.svg is stale -- run node tools/make-icon.js");
    process.exit(1);
  }
  console.log("icon.svg matches the robot sprite");
} else {
  fs.writeFileSync(out, svg);
  console.log(`icon.svg written: ${px.length} pixels`);
}
