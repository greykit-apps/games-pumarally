/* Lifted from the old game verbatim; see game/README.md. A module rather than JSON so the browser and Node load it the same way. */
export default {
  "format": "PRCards",
  "version": 1,
  "kind": "classic-option",
  "source": "Transcribed from the physical cards; 16 of the 26 printed. The other ten are not guessed at.",
  "printed": 26,
  "transcribed": 16,
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
    }
  ]
};
