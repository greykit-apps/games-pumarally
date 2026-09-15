/* Lifted from the old game verbatim; see game/README.md. A module rather than JSON so the browser and Node load it the same way. */
export default {
  "format": "PRCards",
  "version": 1,
  "kind": "classic-option",
  "source": "Sixteen transcribed from the English cards; eleven more read off the AMIGO (German) printing, manual1/IMG_1333 to IMG_1342, all 26 of that box laid out. The AMIGO box does not have Crab Legs, so the two printings together are 27 cards, every one here. Each AMIGO card carries its printed German text and catalogue number; the English name is the English rulebook's where p.36 names it (Fire Control, Shield, Fourth Gear) and a plain translation otherwise.",
  "printed": 27,
  "transcribed": 27,
  "cards": [
    {
      "id": "ablativeCoat",
      "name": "Ablative Coat",
      "text": "Absorbs the next 3 damage, then burns off.",
      "hooks": [
        "onDamage"
      ],
      "asks": false
    },
    {
      "id": "brakes",
      "name": "Brakes",
      "text": "You may treat a Move 1 as a Move 0.",
      "hooks": [
        "modifyMove"
      ],
      "asks": true
    },
    {
      "id": "crabLegs",
      "name": "Crab Legs",
      "text": "You may take a Move 1 sideways, without turning.",
      "hooks": [
        "modifyMove"
      ],
      "asks": true
    },
    {
      "id": "doubleBarreledLaser",
      "name": "Double-Barreled Laser",
      "text": "Your robot's laser does 2 damage.",
      "hooks": [
        "laserShots"
      ],
      "asks": false
    },
    {
      "id": "extraMemory",
      "name": "Extra Memory",
      "text": "You are dealt one extra program card each turn.",
      "hooks": [
        "modifyDealt"
      ],
      "asks": false
    },
    {
      "id": "gyroscopicStabilizer",
      "name": "Gyroscopic Stabilizer",
      "text": "Gears do not rotate your robot.",
      "hooks": [
        "onBoardElement"
      ],
      "asks": false
    },
    {
      "id": "highPowerLaser",
      "name": "High-Power Laser",
      "text": "Your laser shoots through one wall.",
      "hooks": [
        "laserShots"
      ],
      "asks": false
    },
    {
      "id": "mechanicalArm",
      "name": "Mechanical Arm",
      "text": "You may touch a flag or repair site one square away.",
      "hooks": [
        "onTouchCheckpoint"
      ],
      "asks": false
    },
    {
      "id": "powerDownShield",
      "name": "Power Down Shield",
      "text": "While powered down, lasers do not damage you.",
      "hooks": [
        "onDamage"
      ],
      "asks": false
    },
    {
      "id": "pressorBeam",
      "name": "Pressor Beam",
      "text": "Instead of damaging a target, you may push it one square away.",
      "hooks": [
        "onLaserHit"
      ],
      "asks": true
    },
    {
      "id": "rammingGear",
      "name": "Ramming Gear",
      "text": "A robot you push takes 1 damage.",
      "hooks": [
        "onPush"
      ],
      "asks": false
    },
    {
      "id": "rearFiringLaser",
      "name": "Rear-Firing Laser",
      "text": "Your robot also fires a laser backwards.",
      "hooks": [
        "laserShots"
      ],
      "asks": false
    },
    {
      "id": "recompile",
      "name": "Recompile",
      "text": "You may discard your hand and be dealt a new one.",
      "hooks": [
        "onDealt"
      ],
      "asks": true
    },
    {
      "id": "scrambler",
      "name": "Scrambler",
      "text": "Instead of damaging a target, you may replace its next register card with the top of the deck.",
      "hooks": [
        "onLaserHit"
      ],
      "asks": true
    },
    {
      "id": "superiorArchive",
      "name": "Superior Archive",
      "text": "You return from the scrap heap with 1 damage instead of 2.",
      "hooks": [
        "onRespawn"
      ],
      "asks": false
    },
    {
      "id": "tractorBeam",
      "name": "Tractor Beam",
      "text": "Instead of damaging a target, you may pull it one square toward you.",
      "hooks": [
        "onLaserHit"
      ],
      "asks": true
    },
    {
      "id": "reverseGear",
      "name": "Reverse Gear",
      "text": "You may treat a Back Up as a move of 2 backwards.",
      "de": "R\u00fcckw\u00e4rtsbeschleunigung. Du kannst w\u00e4hlen, ob dein Roboter ein oder zwei Felder r\u00fcckw\u00e4rts geht, wenn du den Befehl \"gehe ein Feld zur\u00fcck\" programmiert hast.",
      "cat": "RVG-010141",
      "hooks": ["modifyMove"],
      "asks": true
    },
    {
      "id": "fourthGear",
      "name": "Fourth Gear",
      "text": "You may treat a Move 3 as a Move 4.",
      "de": "Vierter Gang. Du kannst w\u00e4hlen, ob dein Roboter drei oder vier Felder vorw\u00e4rts geht, wenn du den Befehl \"gehe drei Felder vorw\u00e4rts\" programmiert hast.",
      "cat": "FGR-010130",
      "hooks": ["modifyMove"],
      "asks": true
    },
    {
      "id": "remoteControl",
      "name": "Remote Control",
      "text": "Instead of shooting a robot up to 6 squares straight ahead, you may transmit your program to it: it runs your cards for the rest of the turn.",
      "de": "Fernsteuerung. Die Fernsteuerung \u00fcbertr\u00e4gt das Programm deines Roboters auf einen anderen Roboter, wenn er maximal 6 Felder in gerader Richtung vor deinem Roboter steht.",
      "cat": "RCL-010137",
      "hooks": ["onLaserHit"],
      "asks": true
    },
    {
      "id": "shield",
      "name": "Shield",
      "text": "Once per register, a laser shot from the front does 1 less damage.",
      "de": "Schutzschirm. Dein Roboter ist mit einem Schutzschirm ausgestattet, der ihn in jedem Programmschritt vor einem Schaden aus einer bestimmten Richtung sch\u00fctzt.",
      "cat": "SHD-010143",
      "hooks": ["onDamage"],
      "asks": false
    },
    {
      "id": "turboBlaster",
      "name": "Turbo Blaster",
      "text": "Instead of the laser, you may fire the blaster: 1 damage and a shove of one square along the shot. Five shots, then it is spent.",
      "de": "Turbo-Blaster. Der Turbo-Blaster f\u00fcgt dem getroffenen Roboter einen Schaden zu und schiebt ihn zus\u00e4tzlich ein Feld in Schussrichtung weiter. Der Turbo-Blaster kann nur f\u00fcnf Mal benutzt werden.",
      "cat": "MHO-010134",
      "hooks": ["onLaserHit"],
      "asks": true
    },
    {
      "id": "commandInReserve",
      "name": "Command in Reserve",
      "text": "After programming, you may put a sixth card on this one; at any register you may swap it in for the card about to be revealed.",
      "de": "Befehl in Reserve. Nachdem die Befehlsfolge des Programms programmiert wurde, kann ein 6. Befehl auf diese Karte abgelegt werden und bei Bedarf einen Befehl aus dem laufenden Programm ersetzen.",
      "cat": "CND-010125",
      "hooks": ["onProgrammed", "onReveal"],
      "asks": true
    },
    {
      "id": "circuitBreaker",
      "name": "Circuit Breaker",
      "text": "Whenever you end a turn with 3 or more damage, you power down next turn.",
      "de": "Stromkreisunterbrecher. Jedes Mal wenn du am Ende einer Runde drei oder mehr Schadenspunkte besitzt, musst du deinen Roboter sofort f\u00fcr die folgende Runde abschalten.",
      "cat": "CBR-010124",
      "hooks": ["onTurnEnd"],
      "asks": false
    },
    {
      "id": "emergencySwitch",
      "name": "Emergency Switch",
      "text": "Instead of revealing a register's card you may replace it with the top card of the deck; once thrown, every later card this turn is replaced too.",
      "de": "Notschalter. Statt eine Karte aus dem Programm aufzudecken, kannst du sie durch die oberste Karte vom Programmierkartenstapel ersetzen. Ist der Notschalter aktiviert, werden weitere Karten ersetzt.",
      "cat": "ABS-010122",
      "hooks": ["onReveal"],
      "asks": true
    },
    {
      "id": "fireControl",
      "name": "Fire Control",
      "text": "When your laser damages a robot, you must also lock one of its registers for next turn or destroy one of its option cards.",
      "de": "Zielkontrolle. Wenn du einem Roboter einen Schaden zuf\u00fcgst, musst du bestimmen, ob du dessen Besitzer eine bestimmte Programmierkarte blockierst, oder eine Optionskarte aus dessen Besitz zerst\u00f6rst.",
      "cat": "FCN-010128",
      "hooks": ["onLaserHit"],
      "asks": true
    },
    {
      "id": "flywheel",
      "name": "Flywheel",
      "text": "After programming, you may put an unused card on this one; it joins your hand next turn.",
      "de": "Schwungrad. Nach der Programmierung kannst du von den nicht benutzen Karten eine auf das Schwungrad legen. Sie kann in der n\u00e4chsten Runde zus\u00e4tzlich zur Programmierung verwendet werden.",
      "cat": "FLY-010129",
      "hooks": ["onProgrammed"],
      "asks": true
    },
    {
      "id": "turret",
      "name": "Turret",
      "text": "Your laser, Turbo Blaster, Pressor Beam, Remote Control, Scrambler and Tractor Beam may fire in any of the four directions.",
      "de": "Drehscheibe. Die Drehscheibe erlaubt es deinem Roboter, Laser, Turbo-Blaster, Hochdruckstrahl, Fernsteuerung, Zufallsgenerator oder Traktorstrahl in alle vier Richtungen zu benutzen.",
      "cat": "TUR-010146",
      "hooks": ["laserShots"],
      "asks": true
    }
  ]
};
