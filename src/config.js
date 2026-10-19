/**
 * Central tuning file. Every gameplay / feel constant lives here so the systems
 * contain no magic numbers. World units are metres; +Z points toward the camera,
 * obstacles spawn at negative Z and travel toward the player (at Z = 0).
 */

const params = new URLSearchParams(window.location.search);
const isTouchDevice =
  'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0 || window.matchMedia?.('(pointer: coarse)').matches;

/** Base URL for static assets that live in /public (works with any Vite `base`). */
const ASSET_BASE = import.meta.env.BASE_URL;
export const assetUrl = (path) => `${ASSET_BASE}${path}`;

export const CONFIG = {
  /** Debug visuals are off in production unless ?debug=1 is in the URL. */
  debug: {
    enabled: params.get('debug') === '1' || params.get('debug') === 'true',
    freezeDifficulty: false, // toggle at runtime with the F key while debugging
  },

  /** Player-facing options (hook these up to a settings menu later). */
  settings: {
    jetWarning: true,
    cameraBob: true,
    cameraShake: true,
    particles: true,
    maxPixelRatio: 2,
    shadowMapSize: isTouchDevice ? 1024 : 2048,
    isTouchDevice,
  },

  keys: {
    jump: ['Space', 'ArrowUp', 'KeyW'], // (W kept for jump; S/ArrowDown crouch)
    crouch: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    pause: ['KeyP', 'Escape'],
    restart: ['KeyR', 'Enter'],
    start: ['Enter', 'Space'],
    mute: ['KeyM'],
    difficulty: { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard', Numpad1: 'easy', Numpad2: 'normal', Numpad3: 'hard' },
    debugFreeze: ['KeyF'],
  },

  /** Longest frame we will simulate (seconds). Prevents huge jumps after tab switches. */
  maxDelta: 0.05,

  world: {
    baseGameSpeed: 18, // m/s at the start of a run
    maxGameSpeed: 42, // m/s hard ceiling
    speedIncreasePerSecond: 0.3,
    scoreRate: 0.5, // score points per metre travelled
    spawnDistance: 150, // obstacles appear this far ahead (beyond the fog)
    despawnZ: 10, // obstacles are recycled once their centre passes this Z
  },

  /**
   * Difficulty presets picked on the start screen. They override the matching `world` / `spawn`
   * values: speed range, spawn spacing (spawnScale < 1 = denser), how much the score is worth and
   * how likely obstacles are to target the lane the player is standing in.
   */
  difficulties: {
    easy: {
      label: 'EASY', baseGameSpeed: 14, maxGameSpeed: 32, speedIncreasePerSecond: 0.2,
      spawnScale: 1.3, scoreMultiplier: 1, targetPlayerLaneChance: 0.3, warningScale: 1.3, coinChance: 0.9,
    },
    normal: {
      label: 'NORMAL', baseGameSpeed: 18, maxGameSpeed: 42, speedIncreasePerSecond: 0.3,
      spawnScale: 1, scoreMultiplier: 1.5, targetPlayerLaneChance: 0.45, warningScale: 1, coinChance: 0.75,
    },
    hard: {
      label: 'HARD', baseGameSpeed: 23, maxGameSpeed: 52, speedIncreasePerSecond: 0.45,
      spawnScale: 0.8, scoreMultiplier: 2.5, targetPlayerLaneChance: 0.6, warningScale: 0.5, coinChance: 0.6,
    },
  },
  defaultDifficulty: 'normal',

  /** Level N starts after (N-1) * distancePerLevel metres; each level-up shows a banner and a bonus. */
  levels: {
    distancePerLevel: 400,
    bonusPoints: 100,
  },

  /** Subway-style lanes: lane index 0 = left, 1 = centre, 2 = right. Road is 3 x laneWidth wide. */
  lanes: {
    count: 3,
    laneWidth: 3,
    switchSmoothing: 16, // higher = snappier lane change
    maxQueuedMoves: 2,
    swipeThreshold: 28, // px
    swipeDuckTime: 0.55, // seconds a swipe-down keeps the runner crouched
    /** Obstacles in different lanes still need this much arrival-time gap (s), so lane + action changes stay possible. */
    crossLaneGap: 0.5,
    /** Probability of spawning an obstacle in the lane the player currently occupies. */
    targetPlayerLaneChance: 0.45,
  },

  player: {
    jumpVelocity: 13,
    gravity: 32,
    groundY: 0,
    normalColliderHeight: 1.8,
    crouchColliderHeight: 0.9,
    colliderWidth: 0.7, // full width (X)
    colliderDepth: 0.6, // full depth (Z)
    crouchSmoothing: 22, // higher = faster collider transition
    jumpBufferTime: 0.12, // an early jump press is remembered for this long
    landingTime: 0.14, // seconds the Landing state lasts
    stepFrequency: 9.5, // run-cycle radians/second at base speed
    /** Offsets applied to a loaded GLB (soldier.glb). Tweak per model. */
    model: {
      url: 'models/characters/soldier.glb',
      modelScale: 1,
      rotationOffset: [0, Math.PI, 0], // many glTF characters face +Z; the game runs toward -Z
      positionOffset: [0, 0, 0], // origin should be at the feet
    },
  },

  tank: {
    speedMultiplier: 1.1,
    spawnWeight: 1.0,
    // Covers hull + barrel (visual spans z -2.1..+2.5, height 1.4); jump apex clears maxY with ~0.55 s to spare.
    collider: { halfWidth: 1.3, halfDepth: 2.3, minY: 0, maxY: 1.4, offsetZ: 0.2 },
    model: {
      url: 'models/vehicles/tank.glb',
      modelScale: 1,
      rotationOffset: [0, 0, 0],
      positionOffset: [0, 0, 0],
    },
  },

  jet: {
    speedMultiplier: 1.6,
    spawnWeight: 0.7,
    firstAppearanceTime: 8, // seconds into a run before jets can appear
    altitude: 1.75, // visual centre height (belly sits ~1.3 m above the road)
    // Lower fuselage only: a standing runner (1.8 m) is hit, a crouched one (0.9 m) passes under.
    collider: { halfWidth: 1.4, halfDepth: 2.9, minY: 1.1, maxY: 2.3, offsetZ: 0.7 },
    swayAmplitude: 0.35,
    swayFrequency: 1.4,
    bankAmount: 0.22,
    model: {
      url: 'models/vehicles/fighter.glb',
      modelScale: 1,
      rotationOffset: [0, 0, 0], // nose should point toward +Z (toward the player)
      positionOffset: [0, 0, 0],
    },
  },

  /** Coins: collected by touching them. Points = value * coin multiplier. */
  coins: {
    value: 10,
    radius: 0.45,
    height: 1.0, // centre height of a ground-level coin
    spacing: 2.2, // metres between coins in a line
    countRange: [5, 9],
    intervalRange: [1.2, 2.6], // seconds between coin lines
    arcHeight: 2.0, // extra height at the peak of a jump arc
    arcChance: 0.3,
    poolSize: 48,
    coinsPerMultiplier: 15, // multiplier steps up every N coins collected in a run
    maxMultiplier: 5,
  },

  train: {
    speedMultiplier: 1.0, // stands still relative to the road, like a subway car
    spawnWeight: 0.55,
    firstAppearanceTime: 5,
    // Too tall to jump, too wide to duck: switch lanes.
    collider: { halfWidth: 1.2, halfDepth: 3.2, minY: 0, maxY: 3.6, offsetZ: 0 },
    model: { url: 'models/vehicles/train.glb', modelScale: 1, rotationOffset: [0, 0, 0], positionOffset: [0, 0, 0] },
  },

  spawn: {
    // Random interval range (seconds) interpolated from "easy" to "hard" as difficulty rises.
    minSpawnInterval: [1.5, 0.8], // [at difficulty 0, at difficulty 1]
    maxSpawnInterval: [3.0, 1.7],
    /** Minimum gap between two obstacles reaching the player (seconds). Must exceed jump air time + margin. */
    minimumReactionTime: 1.15,
    mixedExtraTime: 0.4, // extra gap when the obstacle types differ (jump -> duck switch)
    safetyMargin: 1.1, // speeds rise during approach; widen gaps by 10 %
    maxSameInRow: 3,
    retryDelay: 0.1,
    poolSize: { tank: 4, jet: 3, train: 3 },
  },

  warning: {
    // Seconds before arrival that the "JET INCOMING" notice shows; fades to 0 at high difficulty.
    leadTimeEasy: 2.2,
    leadTimeHard: 0.0,
    disableAboveDifficulty: 0.75,
  },

  environment: {
    roadWidth: 9,
    segmentLength: 36,
    segmentCount: 8,
    fogColor: 0xb7ab94,
    fogNear: 55,
    fogFar: 150,
  },

  camera: {
    fov: 62,
    fovAtMaxSpeed: 72,
    offset: [1.1, 3.1, 6.8], // behind-right-above the player
    lookAt: [0, 1.3, -9],
    followSmoothing: 7,
    verticalFollow: 0.22, // fraction of the player's jump height the camera follows
    bobAmplitude: 0.035,
    shakeMaxOffset: 0.35,
    shakeDecay: 1.8,
    tankProximityShake: 0.1,
  },

  audio: {
    masterVolume: 0.7,
    musicVolume: 0.35,
    sfxVolume: 0.8,
    muteStorageKey: 'ironsprint.muted',
    /** Optional files in /public/audio. Missing ones fall back to synthesized sounds (or silence for music). */
    files: {
      music: 'audio/music.mp3',
      gameover: 'audio/gameover.mp3',
      jump: 'audio/jump.mp3',
      land: 'audio/land.mp3',
      footstep: 'audio/footstep.mp3',
      tankEngine: 'audio/tank-engine.mp3',
      jetFlyby: 'audio/jet-flyby.mp3',
      collision: 'audio/collision.mp3',
      explosion: 'audio/explosion.mp3',
      click: 'audio/click.mp3',
      coin: 'audio/coin.mp3',
      levelup: 'audio/levelup.mp3',
    },
  },

  storage: {
    highScoreKey: 'ironsprint.highscore',
    difficultyKey: 'ironsprint.difficulty',
  },
};
