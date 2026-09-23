/* Every rule the old suite asserted, as a list to port against.
 *
 * THE NAMES ARE THE SPEC. The old game carried 279 scenario tests inside
 * pumarally.js, written against its own API; the assertions do not transfer,
 * but each name states a rule the book prints or a behaviour the game was
 * held to, and that is worth more than the code that checked it. Each is
 * "pending" until the new engine has a test of that name, at which point it
 * moves to "ported" and the test lives in scenarios/. A rule that the rebuild
 * decides NOT to carry (a screen test for a control that no longer exists, a
 * house rule dropped) is marked "dropped" with a reason, never deleted, so
 * the count of what was promised stays visible.
 *
 * 226 are rules-layer scenarios; the rest were tests of the old screen,
 * set-up wizard or workshop and are tagged "screen" so the rules count is
 * not padded by them.
 */
export const SCENARIOS = [
  {
    "name": "a robot pushes the robot in front of it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a wall stops the whole push chain, pusher included",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "pushing a robot off the edge destroys only it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a wall cancels the rest of a multi-square move",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Back Up moves backwards without turning",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "U-Turn reverses facing",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a conveyor carries a robot one square",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an express conveyor moves on both passes, a normal one only on the second",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a curve rotates a robot the conveyor carried onto it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a curve does NOT rotate a robot that was pushed onto it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "two conveyors converging on one square move neither robot",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a conveyor does not push a robot standing off the belt",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a conveyor carries a robot into a pit and destroys it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "gears turn a robot 90 degrees the printed way",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a pusher fires only on its own registers",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a board laser damages the first robot in the beam only",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a wall blocks a laser",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "robot lasers fire forwards and skip their own square",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a powered-down robot does not fire but is still hit",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a shot is drawn only when it connects with a robot",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a beam stops at the first robot, not the one behind it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a shot absorbed before it lands is not drawn",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the beam is collected before the hits are applied",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a drawn beam never crosses a wall",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the one laser that does cross a wall is the card that says so",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every setting declares a control that can draw it",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "every palette colour clears its contrast floor",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "mounting twice does not bind the input twice",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a composed course builds, validates and plays",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Bench Yard",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "flags land somewhere legal, spread out, and never on the dock",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the same layout composes the same course, every time",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "two composed courses of a size do not share a distance field",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "you get the colour you picked, and no bay until you draft one",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the draft seats everyone, once each, on a real bay",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the fastest priority drafts first",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "human privilege jumps the bots and nothing else",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "no two robots share a colour, whatever you pick",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an expansion tile turns its ruleset on",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the edition check reads every layer, not just the picture",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a house board shadows the shipped one everywhere",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a house board that does not validate is refused",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a board laser is not drawn as a robot shot",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "lasers are simultaneous: a robot destroyed this register still fires",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "ten damage destroys a robot and costs a life",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "registers lock from the right as damage mounts",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a destroyed robot returns to its archive with two damage",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "two robots re-entering on one square are both virtual",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a virtual robot pushes nobody and is pushed by nobody",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a virtual robot is not shot by robots, and shoots none, but a board laser hits it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a virtual robot becomes real at the end of a turn alone on its square",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot returning to an occupied archive comes back virtual, on the square",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "flags must be touched in order",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an out-of-order flag still updates the archive",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a repair site updates the archive",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "touching every flag in order wins the game",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "repairs happen in cleanup, not when the flag is touched",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "power down clears damage at the start of the powered-down turn, not on announcing",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "every option card draws as a card, with its effect on the hover",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the tooltip is styled, floats above everything, and reaches a keyboard",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a powered-down human is asked whether to stay down",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a human with every register locked still reaches the announce",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a powered-down robot does not tag a checkpoint",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a powered-down robot does not update its archive",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a powered-down robot does not acquire an option card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a two-wrench site repairs 2 when the repair is chosen",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a two-wrench site gives a card instead of the repair",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a one-wrench site still repairs exactly 1 and asks nothing",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a parked upgrade question survives a save and does not repair twice",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every mount injects the hazard pattern",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the hand keeps its order when a card comes back from a register",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a course's rulebooks come from its squares, not from its box",
    "layer": "rules",
    "status": "dropped",
    "reason": "issue #14: no board belongs to a book; every board plays under either, and what one book has no rule for takes the other's"
  },
  {
    "name": "Energize is a 2016 board, and the classic rules refuse it by name",
    "layer": "rules",
    "status": "dropped",
    "reason": "a board is not for a game (editor/rulesets/sets.js): Energize prints nothing only one edition prints, and with the swap rule's wrenches it plays under either; readability comes from the squares ('a course's rulebooks come from its squares')"
  },
  {
    "name": "the docking bay belongs to both games, and a real mix is still refused",
    "layer": "rules",
    "status": "dropped",
    "reason": "issue #14: nothing is refused to a book any more"
  },
  {
    "name": "d",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "mix",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a ruleset that is built offers the courses it can read",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every shipped course is readable by a ruleset that exists",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "by default, crossing a flag does not touch it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Euro style: crossing a flag touches it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Euro style still refuses flags out of order",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a robot that never moves behaves the same under either rule",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a swing door blocks when shut and lets you through when open",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a shut door stops a laser, an open one does not",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a door round-trips through the picture byte for byte",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a door survives board rotation",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a door is not a wall, and a wall is not a door",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a portal drops you out of its twin and you carry on",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the pair counts as one square, so a robot cannot bounce back",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a robot standing on a portal switches the colour off",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a lone portal is refused as a transcription error",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "ending a move on oil slides you off it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "starting a move on oil costs a square",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a Move 1 that starts on oil goes nowhere, and does not then skid",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a slide stops against a robot with grip, and shoves one without",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "oil does not touch rotation",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a press is a thing ON a square, and knows which squares it may not be on",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a pusher can fire on an arbitrary set of registers",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a pusher and a conveyor share a square",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a pusher with no wall behind it is refused",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a press flattens what stands on it, but only in its registers",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a press fires on every register it lists, and no others",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a burner scorches for one, in its registers only",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a flame jet burns the floor in front of it, not the wall it is on",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a two-square jet burns both squares",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a jet survives rotation and reaches the same way round",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a course carries every board's jets",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a jet with nothing to mount on, or nothing to reach, is refused",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "burners fire after the lasers, not with the other elements",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "every turn is dealt from a reshuffled deck",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a powered-down robot is dealt no cards",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a 'you may' card parks a choice and applies the answer on the re-run",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "an answered choice fires once, not on every later re-run",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a robot without the card is never asked",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a choice key is stable across a save and reload",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Ablative Coat absorbs three damage and then burns off",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Power Down Shield stops lasers only while powered down",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Extra Memory deals one more card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Gyroscopic Stabilizer ignores gears but not conveyor curves",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Ramming Gear hurts the robot you shove",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Double-Barreled Laser does 2",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Rear-Firing Laser shoots the robot behind you",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "High-Power Laser shoots through exactly one wall",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Pressor Beam shoves instead of damaging",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Mechanical Arm touches a flag one square away",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Superior Archive brings you back with 1 damage",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Superior Archive is still lost if it is your only card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a wrecked robot loses one option card, not all of them",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "option cards are conserved across a whole game",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the table rejects an upgrade deck that has drifted",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Bogus",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the table rejects a card bound to a hook that does not exist",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Bogus (2)",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "where two headless belts meet, the join is marked",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a wall is drawn once, on the line, however many squares own it",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a conveyor curve is DRAWN as a curve, and a merge as a merge",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "every custom property the stylesheet uses is defined",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "nothing repaints a chosen segment's label to match its fill",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every motion leaves room for the next one to start",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a card's art says what the card does",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the table rejects an element nobody drew",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "undrawn thing",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the table rejects a hook that no card uses",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a quarter turn rotates conveyors, lasers and walls together",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "two boards assemble side by side without disturbing each other",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "walls agree across a seam between two boards",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every shipped course can actually be played",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a board survives a round trip through the editor's export",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the editor's export names every wall exactly once",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a board dragged out of the grid is not mistaken for a card",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the palette offers only full boards, never the docking bay",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the first board may go in any slot; the rest go beside one",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "boards join along an edge, never at a corner",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a course stops at three boards by three",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "an L of three boards is a course; two islands are not",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "an empty grid is not a course",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the block sits under a column that has a board over it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a board can be moved without being taken off first",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a board turns both ways, and four of either comes back round",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the stage puts nothing over a board until it is selected",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Test Play runs the board you drew, not a version of it",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a robot's deck is the twenty cards printed for it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Power Up takes a cube, and Again repeats the register before it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the Priority Token decides who acts, and moves one seat a round",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "shutting down scraps the damage you are holding, and not the damage in your deck",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a bot shuts down for the damage it is holding, not the damage in its deck",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the button says which round it is declaring",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a 2016 shutdown is declared for the round you are in, and lasts one round",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a 2016 robot does not die, it reboots",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a rebooting robot is dealt a hand and programs from off the board",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a rebooting robot walks back on at register 1 and then plays it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a checkpoint switches off the belt under it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a course uses the bays it lists, and no others",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "bays are numbered to twelve: 1-9, then a b c",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot placed in a bay faces off the docking bay toward the course",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot reboots on the Reboot Token of the board it fell from",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot with no token on its board reboots at its archive",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot standing on the Reboot Token is moved along its arrow",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a course with tokens keeps the 2016 archive on the docking bay",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Cry Havoc: a reboot draws three damage cards instead of two",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a rebooting player can still work their own controls",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a robot waiting to come back is drawn on the square it comes back to",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the player panel shows the tracks the edition actually has",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the person whose robot is rebooting is the one who picks its facing",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a bot comes back facing the way the flag is",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a robot standing on the reboot square is shoved aside, and that is not a push",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "making room for a returning robot never puts the occupant in a hole",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the 2016 reboot point is a declared substitute, not a silent one",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the upgrade deck is forty cards, all of them written down",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "three upgrades are dealt at setup, and the forty are conserved",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "fitting an upgrade costs its printed Energy and takes a slot",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the mat holds three of each kind and no more",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an installed upgrade fires through the same hooks an option card does",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a stacked side panel costs the board height, not width",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a 2016 player can see everything a player at the table can see",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the shop panel is shut outside the upgrade phase, and in the classic game",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a person shops for themselves, and the phase waits while they do",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a bot fits what it owns before it buys more, and keeps a cube back",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the upgrade deck reshuffles, and runs out honestly",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the damage deck is forty cards, and what is on them is a declared gap",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a 2016 hit hands you cards instead of ticking a track",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the damage deck reshuffles, and when it cannot you take no damage",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "SPAM in a register throws itself away and plays your next card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "SPAM that turns up more SPAM keeps going until it finds a card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "SPAM is the one card you do not discard at the end of programming",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "next round's deal lands on top of the SPAM you are still holding",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the help describes the game you are playing, not both at once",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a SPAM card in the hand names itself and says what it does",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a broken conservation law stops the game out loud, not silently",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a 2016 game played from a human seat, with the invariants armed",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a hand that does not add up to the deal is refused, in both editions",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a recompile throws away the hand, not the damage in it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "shutting down is the other way to be rid of SPAM",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the table's forty are counted apart from each robot's twenty",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a wrecked robot's damage goes back to the table, not into its deck",
    "layer": "rules",
    "status": "dropped",
    "reason": "contradicts the 2016 rulebook p.19 (manual1/IMG_1263): 'SPAM cards in your registers are discarded to your discard pile' -- the robot's own; replaced by 'a rebooting robot's SPAM stays with it, in its own discard'"
  },
  {
    "name": "each robot draws from its own deck and discards to its own pile",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a modern robot starts on three Energy and a classic one on none",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a course keeps the belt arms its boards were printed with",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the 2016 floor acts in its own order, which is not the classic one",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a blue belt conveys twice and a green belt only once",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a robot ending a register on a battery draws an Energy, to a maximum of ten",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the workshop draws a 2016 board, and it survives being put down",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the workshop's autosave carries what is beside the picture",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "art that depends on a stylesheet rule has one",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "no chrome class is a name the board art already answers to",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the right-click menu offers the same three things",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "Escape backs out one layer at a time",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a composed course carries every board it was given",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "layouts saved by either older version still open",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a belt presumes it is a continuation",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a paint stroke is one step of history",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the library offers flags on a course and never on a board",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a square is edited as everything standing on it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every library entry draws itself, turned the way it will go",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a wall-mounted trap brings its wall with it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the square's walls are on the square, and are its own",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the large tile carries everything standing on the square",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the course workshop opens with the flag tool in hand, and every tool answers to a key",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "zoom keeps the point under the pointer where it was, and fit shows the whole map",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a dragged flag keeps its number, and a dragged trap takes its wall with it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the ghost says what a click would do before it lands",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the flag list is the race, and its verbs move it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "delete takes off what is in focus, and escape steps outward",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a quick stroke lays every square it skipped",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a flag on the workshop map is drawn with its number",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the ghost follows the hand, not only the pointer",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the rail's icon says what the tool lays, not which registers it fires in",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the game asks for a colour before it asks anything else",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the set-up is two steps, and the last one opens the workshop",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the library keeps a course and gives it back",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "Mine",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the workshop knows which game the course it is holding belongs to",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the course workshop offers three ways out and no fourth",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "opening the workshop twice does not bind it twice",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the course screen has one door into the workshop, not two",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "every shipped course puts its flags on squares a flag may go on",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the course menu is two shelves: one board each, or several",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "every length the assembler writes into a style carries its unit",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a label in a fixed box outranks the button style and cannot spill out of it",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the board takes its turn in the printed order, presses between the gears and the lasers",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a crusher destroys, and only where and when it is printed",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an option hand is capped at three, and the fourth forces one out",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a jet burns what crosses it, and again what stops in it",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "lives scale with the number of robots and the number of boards",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a portal fires however you arrive: shoved, conveyed or skidding",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a portal pair belongs to its own board",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a slide stops before a wall, and a slide is not a move",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a slide is set off by what the edition says",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a press with no number printed on it comes down every register",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a burner scorches a robot that drives through it, and again when the burners act",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a robot that stays in an active burner is scorched, and one that leaves is not",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a card dealt at the start carries its state, so a coat wears out",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "the Priority Token starts with seat 1, a declared substitute for the youngest player",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a rebooting robot's SPAM stays with it, in its own discard",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "an upgrade a robot has not built does nothing, and says so",
    "layer": "rules",
    "status": "dropped",
    "reason": "every one of the forty is built since the Haywire faces were photographed (manual1/IMG_1345-1348); there is no inert upgrade left to test"
  },
  {
    "name": "every transcribed upgrade is bound: built, or inert and saying why",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Lucky Booster and Rewire are declared inert until Haywire is photographed",
    "layer": "rules",
    "status": "dropped",
    "reason": "the Haywire faces were photographed and both cards act; see the Haywire scenarios"
  },
  {
    "name": "Chaos Theory turns a revealed SPAM into Energy in the first three registers, once",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Crab Legs pairs a Move 1 with a rotate and sidesteps instead of either",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Drifting and Power Slide roll one forward after a rotate, if you say so",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Energy Conversion moves you after a board laser hit, not a robot's",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Firewall spares the pit's two SPAM, not the edge's",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Hover Unit crosses a pit and falls in only where the move ends",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Memory Cards park cards for next round and give them back at the upgrade phase",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Mini Howitzer costs an Energy, hits for two and shoves",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Indirect Fire pays an Energy to hit a robot within three squares, off the laser line",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Mirror sends the first robot damage of a round back to the shooter",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Controlled Chaos moves a face-down Haywire to the register of your choice",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Stun empties the target's next register instead of shooting it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Stun cannot be used in register 5",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Memory Transfer hands a damage card in hand to a neighbour's discard",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Phasing carries a robot through one wall on its own move",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Splash Damage hurts every robot beside the target",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "SPAM-Powered Rocket burns SPAM from the discard for squares",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Diffuser turns every damage after the first of a register into Energy",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Calculated Odds draws two and keeps the SPAM",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Repulsion Field throws the pusher back for an Energy",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Bunny Hop hops over the robot it would have pushed",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Turbo pays an Energy for one more square",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "The Oppositron does the opposite of the card",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Master Builder's Overclocked runs an earlier register's card and takes a SPAM",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Moon Walk runs the belts backwards for the robot",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Top Heavy steps off the belt sideways instead of riding it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Anchor spends an Energy to refuse a push",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a card that costs X is priced by the table",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Modular Chassis trades itself for one of the shoved robot's upgrades",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Self-Diagnostics tears a card out of the game at a new checkpoint",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Spam Filter shows the top of the deck, and nothing else",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Spiky costs the robot that shoves you a card, even when the shove fails",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Ramming Gear bites even when the push fails, during your own card only",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a temporary upgrade is offered at its moment, used once, and gone",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Abort Switch swaps a revealed card for the top of the deck",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "All Aboard rides the belts alone, blue twice then green",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Boink hops to a free neighbour without turning, never through a wall",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Calibration Protocol scraps the SPAM in hand and draws that many",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Displacing Blast sends the target to its reboot point facing the same way",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Magnetic pulls a neighbour along with a card move",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Memory Swap draws three and puts three back on top in order",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Overclocked and Pressure Release are movement, before or after the card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Piercing Drill hurts and spins the robot you shove",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Re-initialize hands the Priority Token to anyone, Recharge takes three",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Switch trades places with a neighbour, Zoop faces any way",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "water costs a space of movement on the way out, once per card, and only on your own card",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "drains are pits, in every way",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a ledge cannot be climbed, and the drop off one costs two damage, or one into water",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "weapons and board lasers cannot hit a target on another level",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a ramp is an extra space on the way up, and is ignored on the way down",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "stopping on the way up a ramp slides you back down, pushing whoever is there",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "currents convey at their own step, and are water",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a randomizer replaces the card you reveal with the top of your deck",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a teleporter throws a Move card two further forward, unless the arrival square is taken",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a flamer burns on the way in and at the end of the register, not at the start",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a board printing the expansion floor is a 2016 board",
    "layer": "rules",
    "status": "dropped",
    "reason": "issue #14: the expansion floor plays under the classic book too; see the scenario of that name"
  },
  {
    "name": "the expansion floor plays under the classic book too, as the 2016 book plays it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a swing door shuts under the 2016 book as it does under the classic",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the damage deck is twenty-three SPAM and seventeen Haywire, every face once and each with its steps",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a Haywire slides face down under the register it was taken in, one per register, the rest to the discard",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "next round the Haywire's register is not programmed, and the card resolves there face up",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a Haywire's moves and turns resolve as printed",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a Haywire's tricks resolve as printed: the token, Energy, the laser, the free upgrade, the discard, the two cards",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Again after a Haywire resolves it again",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Rewire puts the face-down Haywires in the hand, and they must be programmed",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "Lucky Booster digs a Haywire out of the deck and plays it, or bins it",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "shutdown scraps face-down Haywires; a reboot sends them to the table and keeps the first new one under the register",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a trap with no register printed on it fires in every one",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the workshop can put a crusher down, move it, and say when it may not",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the reference photo panel does not shut under your hand",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a belt turns a robot only where the board prints a path in",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a belt's printed arms turn with the board and with the belt",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the workshop writes a belt's arms, and never leaves one behind",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a merge that is not on a conveyor, or points at its own exit, is refused",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the workshop can step back, and not over nothing",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a course the workshop touched is built from its own picture",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "an edited course is read for its ruleset the same way",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a course with a hole in it round-trips through the workshop",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "moving a board lets go of the workshop's picture",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the flags raced are the flags put down in the workshop",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a saved workshop course survives a reload",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "Mine (2)",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "a layout that is a shipped course keeps that course's flags",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "a flag may only sit on plain floor outside the dock",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "the picture says which square holds which flag",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "off, the edge of the course is still a fall",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, a robot cannot be driven off the course",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, the rail stops the whole push chain",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, a belt will not carry a robot over the edge",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, a pit is still a pit",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, the bots know the rail is there",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, the rail is drawn and announced",
    "layer": "screen",
    "status": "pending"
  },
  {
    "name": "the board the player sees is asked to draw the rail",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "on, a beam still leaves the course rather than bouncing",
    "layer": "rules",
    "status": "pending"
  },
  {
    "name": "destroying a robot returns all of its cards to the discard",
    "layer": "rules",
    "status": "ported"
  },
  {
    "name": "a new game starts in the draft, at the colours",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a table of bots stops at nothing before the first program",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a seat is any mix: solo, eight, bots only",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "an illegal answer is refused and the same question stands",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a seed replays identically",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "cards are conserved: 84 across deck, discard, hands and registers",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a locked register keeps its card and re-executes it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the bumpers house rule keeps a robot on the course",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "crossing a flag counts under the flag-touch house rule, and only then",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Tractor Beam pulls instead of damaging",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Scrambler replaces the next register instead of damaging",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "an optional weapon left alone fires the main laser",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a wrecked human is asked which card to lose",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Brakes may turn a Move 1 into standing still",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Crab Legs sidesteps a Move 1 without turning",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Reverse Gear may back up two",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Fourth Gear may move four",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the gears leave every other move alone",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Turbo Blaster hits for one and shoves, and is spent after five shots",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Turbo Blaster's point goes through the target's coat",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Shield stops one point from the front each register, not from the side",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Shield takes one point off a double-barreled shot",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Remote Control runs the controller's program on the target for the rest of the turn",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Remote Control reaches six squares and no further",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Turret aims the laser at a robot beside you",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Turret carries the optional weapons round with it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "two robots with optional weapons both get their choice in one volley",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Fire Control locks a register through the next turn",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Fire Control may destroy an option card instead",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Fire Control lands only with the damage",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Circuit Breaker forces a power down at three damage",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Emergency Switch replaces the register and every one after it from the deck",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Emergency Switch leaves a locked register alone",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Command in Reserve holds a sixth card and swaps it in for a register",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "Flywheel carries a card past the reshuffle into next turn's hand",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a wreck sends the reserve and flywheel cards back to the table",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "losing the option card sends the program card on it back too",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "an option exchange sacrifices a card to absorb a point of damage",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a quick game lays the board at the facing drawn, over the docking bay",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a quick game draws three flags from the marked locations, in the order drawn",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a board without three marked locations is no quick game",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a blank board is told from a board by its floor, not its markings",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a course may place its own starting squares, and a race needs eight of them",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the boards stack as the box does: the column first, then the sides, never beyond three by three",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the route visits every board, board by board where the layout allows",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "every board gets a flag, the extras go one per board in turn, and the knob's range says so",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a quick game on several boards draws, lays and flags a course the validator takes",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the ask is refused when it cannot be met, and says why",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a conveyor carries a robot down a ledge at the drop's cost, not up one, and off the edge of the board",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the race draws the markings its edition reads and no others",
    "layer": "screen",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a flame jet burns under the 2016 rules, on the 2016 timing",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a flamer burns under the classic rules, on the classic timing",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "fire does not decide which book a board belongs to, and nothing else is widened",
    "layer": "rules",
    "status": "dropped",
    "reason": "issue #14: no board belongs to a book; the substitute's declaration is asserted by the scenario that follows"
  },
  {
    "name": "a flame jet and a flamer each stand in for the other, and the table says so",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a one-way wall stops a robot on its red side and lets one through from its green side",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot pushed at a one-way wall's red side is stopped, and so is its pusher",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot on the green side pushes one through a one-way wall",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a one-way wall stops a laser from its red side and lets one through from its green side",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a one-way wall round-trips through the picture and keeps its red side",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "radioactive waste hurts a robot every register it ends there, and hands it an option card",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "waste acts after the fire and before the flags, in both books",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a powered-down robot takes the waste's damage but no option card",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot beside the waste is not touched by it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "2016 waste deals a damage card, then asks: an Energy or the top upgrade free",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "radiation hurts once, at the end of the turn, and not every register",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "radiation reaches a powered-down robot, and 2016 pays it in a damage card",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a square is radiation or waste, never both",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a trap door opens at the end of a register it lists, and a robot still on it falls",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot may step onto a trap door in the register before it opens, and off it in the register it opens",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a robot may cross a trap door in the very register it opens",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a trap door is floor in the registers it does not list",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a conveyor that leaves a robot on an opening trap door drops it",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "the trap doors are the board's last act, before the checkpoints, in both books",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  },
  {
    "name": "a trap door must name the registers it opens in",
    "layer": "rules",
    "status": "ported",
    "origin": "rebuild"
  }
];

export function tally() {
  const t = { pending: 0, ported: 0, dropped: 0, rules: 0, screen: 0 };
  for (const s of SCENARIOS) { t[s.status] = (t[s.status] || 0) + 1; t[s.layer]++; }
  return t;
}
