#!/usr/bin/env node
/*
 * Regenerate icon.svg from the robot drawing in pumarally.js.
 *
 *   node tools/make-icon.js
 *   node tools/make-icon.js --check    # fail if icon.svg is stale
 *
 * The favicon is the in-game robot, so it is generated from the same paths the
 * game renders rather than drawn separately. Redraw the robot and the icon
 * follows; hand-edit the icon and it silently stops being the robot.
 *
 * This used to rasterise a 32x32 character grid into 1024 <rect>s. Now that the
 * robot is already vector, the icon is the same markup with the stroke and fill
 * that the stylesheet would have applied -- which is why the classes have to be
 * resolved here: an SVG file has no stylesheet to inherit from.
 */
const fs = require("fs");
const path = require("path");
const PR = require(path.join(__dirname, "..", "pumarally.js")).__PR;

const T = PR.TOKENS;
const livery = PR.LIVERIES[0];

/* The class -> presentation mapping is the icon's one duplication of the
   stylesheet, so it is asserted rather than assumed: a class that appears in
   the robot markup and not here would silently render unpainted. */
const PAINT = {
  "pr-hull": `fill="${T.bg}" stroke="${livery.a}" stroke-width="6" stroke-linejoin="round"`,
  "pr-nose": `fill="${livery.a}"`,
  "pr-eye": `fill="${livery.a}" opacity="0.55"`
};

const body = PR.ROBOT_SVG
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>$/, "")
  .replace(/\s*aria-hidden="true"/g, "")
  .replace(/class="([^"]+)"/g, (_, cls) => {
    if (!PAINT[cls]) throw new Error(`robot markup uses class "${cls}", which tools/make-icon.js cannot paint`);
    return PAINT[cls];
  });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64" role="img" aria-label="PumaRally">
<!-- Generated from the robot drawing in pumarally.js by tools/make-icon.js.
     Do not hand-edit: regenerate so the icon and the robot stay the same shape. -->
<rect width="100" height="100" fill="${T.bg}"/>
${body.trim()}
</svg>
`;

const out = path.join(__dirname, "..", "icon.svg");
if (process.argv.includes("--check")) {
  const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (have !== svg) {
    console.error("  error:   icon.svg is stale -- run node tools/make-icon.js");
    process.exit(1);
  }
  console.log("icon.svg matches the robot drawing");
} else {
  fs.writeFileSync(out, svg);
  console.log("icon.svg written");
}
