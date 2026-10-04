/* What the title screen's Help and About say. Taken from the player README
 * (How a turn works, Setting up a race, On the floor, Controls, Building your
 * own courses, Credits), so the two say the same thing: change one, change
 * the other. */

export const HELP = [
  ["How to play", `
<ol>
  <li><b>Program.</b> You are dealt a hand of movement cards: moves, back-ups,
    turns and U-turns. Put five of them into your registers, in the order you
    want them to happen, and press <b>Run</b>.</li>
  <li><b>Watch it go.</b> Every robot plays register 1, then the factory floor
    moves: belts carry, gears turn, pushers shove, lasers fire. Then register
    2, and so on to 5. Robots shove each other out of the way, and anything
    driven or carried off the edge or into a pit is out for the rest of the
    turn.</li>
  <li><b>Touch the flags in order.</b> The first robot to reach the last flag wins.</li>
</ol>
<p>You only ever see your own cards, so the plan you lock in is a guess about
where everyone else will be.</p>`],

  ["Setting up", `
<p><b>New quick game</b> starts a race straight away with the setup you used last:
the first time, one human against three bots on a board drawn at random.
<b>Custom game</b> opens the setup screen, where a race comes about one of three ways:</p>
<ul>
  <li><b>Quick game</b> &mdash; one board, with flags placed for you.</li>
  <li><b>Quick course</b> &mdash; several boards laid together, with a route of flags through them.</li>
  <li><b>Saved course</b> &mdash; a course you built yourself in the course builder.</li>
</ul>
<p>Then choose the rules, fill up to eight seats with any mix of humans and
bots (easy, normal or hard), and press <b>Start the race</b>. Humans share one
screen and take turns at the keyboard; a curtain hides each player's hand from
the others until they're ready.</p>`],

  ["On the floor", `
<p>Belts (green move one square, blue move two), gears, pushers, crushers,
board lasers, pits, walls and doors are on almost every board. Further in
you'll meet oil slicks, water and currents, portals and teleporters, flame
jets, trap doors, radiation, ramps and raised floors, and more. Repair sites,
upgrade sites and energy spaces are where you patch up and power up.</p>`],

  ["Controls", `
<table>
  <tr><td><kbd>1</kbd>&ndash;<kbd>9</kbd></td><td>place that card in the next open register</td></tr>
  <tr><td><kbd>Backspace</kbd></td><td>take the last card back</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>run your registers, or lift the hot-seat curtain</td></tr>
  <tr><td><kbd>y</kbd> / <kbd>n</kbd></td><td>answer a power-down or shutdown question</td></tr>
  <tr><td><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>pan the board</td></tr>
  <tr><td><kbd>Z</kbd> / <kbd>C</kbd> (or <kbd>+</kbd> / <kbd>-</kbd>)</td><td>zoom in / out</td></tr>
  <tr><td><kbd>0</kbd></td><td>reset the view</td></tr>
</table>
<p>Cards can also be clicked or dragged onto a register. Questions a card or a
site asks appear in the panel as buttons, and the cards each robot holds show
under it, with the full text on hover.</p>
<p><b>Speed</b> in the top bar changes how fast the floor moves. <b>Menu</b>
goes back to the title screen; your race stays saved until you start another,
and <b>Resume game</b> picks it up again.</p>`],

  ["Courses", `
<p><b>Course builder</b> on the title screen opens the workshop.</p>
<ul>
  <li>Drag boards from the rail onto the floor and arrange them; <kbd>Q</kbd> and <kbd>E</kbd> turn the selected board.</li>
  <li><kbd>F</kbd> picks the flag tool: click squares in race order, or ask for a suggestion. Right-click a flag to take it off.</li>
  <li><kbd>B</kbd> places starting squares and <kbd>R</kbd> places reboot points (for the Modern rules), if you want your own instead of the docking bay's.</li>
  <li>The workshop saves as you go, and <kbd>Ctrl</kbd>-<kbd>Z</kbd> undoes. Anything wrong with the course is listed under <b>Problems</b>.</li>
  <li><b>Save to library</b> puts it under <b>Saved course</b> in Custom game.</li>
</ul>
<p>Your courses are kept in your browser, so they stay on the device you built them on.</p>`]
];

export const ABOUT = `
<p><b>PumaRally.</b> Program five registers, hand control to the factory
floor, and hope you guessed right. A port of RoboRally (Richard Garfield,
1994) under both the classic and the 2016 rules, in original vector art, for
one to eight players.</p>
<p>By shandower, with AI assistance from Claude. MIT licensed.</p>
<p>Other Puma games:
<a href="https://greykit.com/games/pumatriage/" target="_blank" rel="noopener">PumaTriage</a> &middot;
<a href="https://greykit.com/games/pumasoc/" target="_blank" rel="noopener">PumaSOC</a> &middot;
<a href="https://greykit.com/games/pumasecure/" target="_blank" rel="noopener">PumaSecure</a> &middot;
<a href="https://greykit.com/games/pumatower/" target="_blank" rel="noopener">PumaTower</a> &middot;
<a href="https://greykit.com/games/retrosurfer96/" target="_blank" rel="noopener">Retro Surfer '96</a> &middot;
<a href="https://greykit.com/games/" target="_blank" rel="noopener">more</a></p>
<p class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></p>`;
