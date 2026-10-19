# Iron Sprint

A 3D military endless runner built with **Three.js + Vite**. Jump over tanks, duck under low-flying fighter jets, survive as the world speeds up.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
```

Add `?debug=1` to the URL for collider wireframes, FPS/draw-call panel, speed and spawn info. `F` freezes difficulty in debug mode.

## Controls

| Action | Keys / touch |
| --- | --- |
| Start | Enter, Space, or the Start button |
| Jump | Space, Arrow Up, W, or the JUMP button |
| Duck (hold) | Arrow Down, S, or the DUCK button |
| Pause / resume | P or Esc |
| Restart | R or Enter after game over, or the Restart button |
| Mute | M |

## Folder structure

```
index.html
public/                    static assets (served as-is)
  models/characters/       soldier.glb
  models/vehicles/         tank.glb, fighter.glb
  models/environment/      optional prop GLBs
  textures/ sprites/ icons/
  audio/                   optional sounds (see below)
src/
  main.js                  creates and starts Game
  Game.js                  renderer, scene, camera, state machine, main loop
  config.js                ALL tuning values
  Player.js                root + visual + collider, jump/crouch physics
  player/PlaceholderHuman.js, AnimationController.js
  obstacles/Obstacle.js, Tank.js, FighterJet.js
  ObstacleManager.js       spawning, fair-spawn check, pooling
  CollisionSystem.js       BoxCollider + AABB tests
  Environment.js           endless road, props (InstancedMesh), lights, fog, sky
  environment/             procedural textures and prop geometry
  InputManager.js  UIManager.js  AudioManager.js  ModelLoader.js
  ParticleSystem.js  CameraRig.js  ScoreManager.js  DifficultyManager.js  DebugOverlay.js
  styles/main.css
```

## Tuning gameplay

Everything lives in `src/config.js`: `player.jumpVelocity`, `player.gravity`, collider sizes
(`normalColliderHeight`, `crouchColliderHeight`, `colliderWidth`, `colliderDepth`), `world.baseGameSpeed`,
`maxGameSpeed`, `speedIncreasePerSecond`, `scoreRate`, tank/jet `speedMultiplier`, `spawnWeight`, `collider`,
`spawn.minSpawnInterval` / `maxSpawnInterval` / `minimumReactionTime`, warning timing, camera, audio volumes and
`settings` toggles (jet warning, camera bob/shake, particles, pixel-ratio cap).

Design notes: the player stays near z = 0 while the road, props and obstacles move toward +Z. Visuals
(`visual` container), physics (`root`) and collision (`BoxCollider`) are separate objects. A tank collider tops out at
1.4 m, a jet's lowest dangerous height is 1.1 m, a standing collider is 1.8 m and a crouched one 0.9 m.
Fair spawning compares arrival times at the player, so a faster jet can never be spawned inside a tank's reaction window.

## Replacing placeholders with GLB models

Drop files in `public/` — no code changes needed. Missing files just log a console warning and keep the primitives.

| File | Notes |
| --- | --- |
| `public/models/characters/soldier.glb` | Rigged, origin at the feet, ~1.8 m tall |
| `public/models/vehicles/tank.glb` | Origin at chassis centre on the ground, barrel toward **+Z** |
| `public/models/vehicles/fighter.glb` | Central pivot, nose toward **+Z** |

If a model is the wrong size or orientation, adjust `modelScale`, `rotationOffset` and `positionOffset` in the
matching `model` block in `config.js`. These are applied to a holder inside the visual container, so gameplay is unaffected.
Colliders are hand-tuned in config and never read model bounds.

### Character animation names

Clips are matched by case-insensitive keywords, not exact names:

| State | Keywords |
| --- | --- |
| Run | run, sprint, jog |
| Jump | jump, leap, hop |
| Fall | fall, airborne |
| Land | land |
| Crouch | crouch, duck, squat |
| CrouchRun | crouchrun, crouch_run, crouchwalk, sneak |
| Idle | idle, stand |
| Death | death, die, dead |

Missing clips fall back (Fall → Jump → Run, CrouchRun ↔ Crouch → Run, Death → Idle, otherwise the pose is held).
State changes cross-fade; Jump is stretched across the airtime if there is no Fall clip.

## Audio

Optional files in `public/audio/`: `music.mp3`, `gameover.mp3`, `jump.mp3`, `land.mp3`, `footstep.mp3`,
`tank-engine.mp3`, `jet-flyby.mp3`, `collision.mp3`, `explosion.mp3`, `click.mp3` (names configurable in `config.js`).
Without them the game uses small synthesized sounds (no music). Audio starts only after the first click/tap/key.

## Deployment

`vite.config.js` sets `base: './'`, so `dist/` works on Netlify, Vercel, GitHub Pages (project sites) or any static host.

- **Netlify / Vercel:** build command `npm run build`, publish directory `dist`.
- **GitHub Pages:** publish the contents of `dist/` (e.g. via an Action or the `gh-pages` branch).

## Extending

- New obstacle: extend `Obstacle`, then `obstacleManager.registerType('name', { create, weight, canSpawn })`.
  Projectiles (tank shells, missiles) fit the same pattern.
- Lane switching: the player root is a plain `Group` and the road is 9 m wide, so adding X movement later needs no restructure.
- Power-ups, coins, new maps: add systems that `Game._update` calls, reading speed from `DifficultyManager`.
