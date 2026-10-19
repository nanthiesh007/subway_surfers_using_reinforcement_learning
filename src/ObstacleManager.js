import { CONFIG } from './config.js';
import { Tank } from './obstacles/Tank.js';
import { FighterJet } from './obstacles/FighterJet.js';
import { Train } from './obstacles/Train.js';
import { rand } from './utils/math.js';

/**
 * Owns every obstacle: spawn timing, fair-spawn validation, pooling and recycling.
 *
 * Extending: call `registerType('missile', { create, weight, canSpawn })` and the manager will
 * pool and spawn it like tanks and jets. (Pair gaps for new types default to `minimumReactionTime`.)
 */
export class ObstacleManager {
  constructor(scene, bus, difficulty) {
    this.scene = scene;
    this.bus = bus;
    this.difficulty = difficulty;
    this.types = new Map();
    this.pools = new Map();
    this.models = new Map();
    this.active = [];
    this.spawnTimer = 0;
    this.lastType = null;
    this.streak = 0;

    this.registerType('tank', {
      create: () => new Tank(),
      weight: CONFIG.tank.spawnWeight,
      canSpawn: () => true,
      poolSize: CONFIG.spawn.poolSize.tank,
    });
    this.registerType('jet', {
      create: () => new FighterJet(),
      weight: CONFIG.jet.spawnWeight,
      canSpawn: (elapsed) => elapsed >= CONFIG.jet.firstAppearanceTime,
      poolSize: CONFIG.spawn.poolSize.jet,
    });
    this.registerType('train', {
      create: () => new Train(),
      weight: CONFIG.train.spawnWeight,
      canSpawn: (elapsed) => elapsed >= CONFIG.train.firstAppearanceTime,
      poolSize: CONFIG.spawn.poolSize.train,
    });
  }

  registerType(name, def) {
    this.types.set(name, def);
    this.pools.set(name, []);
    for (let i = 0; i < (def.poolSize ?? 2); i++) this._createPooled(name);
  }

  /** Replace placeholders of one type with a loaded GLB (also used for future pool growth). */
  setModel(type, entry) {
    this.models.set(type, entry);
    for (const o of this.pools.get(type) || []) o.setModel(entry);
  }

  reset() {
    for (const o of this.active) o.deactivate();
    this.active.length = 0;
    this.spawnTimer = 1.3; // short grace period at the start of a run
    this.lastType = null;
    this.streak = 0;
  }

  update(dt, worldSpeed, ctx) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this._trySpawn(worldSpeed, ctx?.playerLane ?? 1);

    const lead = this.difficulty.getWarningLeadTime();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.update(dt, worldSpeed, ctx);

      if (o.type === 'jet' && !o.warned && CONFIG.settings.jetWarning && lead > 0 && o.timeToPlayer(worldSpeed) <= lead) {
        o.warned = true;
        this.bus.emit('jet:warning', o);
      }
      if (o.root.position.z > CONFIG.world.despawnZ) this._release(i);
    }
  }

  /** True while a warned jet has not yet reached the player. */
  isJetWarningActive() {
    return this.active.some((o) => o.type === 'jet' && o.warned && o.root.position.z < -3);
  }

  /** Distance (m) to the nearest approaching obstacle of a type, or Infinity. */
  nearestDistance(type) {
    let best = Infinity;
    for (const o of this.active) {
      if (o.type !== type) continue;
      const d = -o.root.position.z;
      if (d > -4 && d < best) best = Math.max(d, 0);
    }
    return best;
  }

  // ---------- spawning ----------

  laneX(index) {
    return (index - (CONFIG.lanes.count - 1) / 2) * CONFIG.lanes.laneWidth;
  }

  _trySpawn(worldSpeed, playerLane) {
    const elapsed = this.difficulty.elapsed;
    const candidates = [];
    for (const [name, def] of this.types) {
      if (!def.canSpawn(elapsed, this.difficulty)) continue;
      if (this.streak >= CONFIG.spawn.maxSameInRow && name === this.lastType && this.types.size > 1) continue;
      candidates.push(name);
    }

    // Weighted order: try the rolled type first, then the others.
    const ordered = [];
    const pool = [...candidates];
    while (pool.length) {
      const total = pool.reduce((s, n) => s + this.types.get(n).weight, 0);
      let r = Math.random() * total;
      let idx = pool.findIndex((n) => (r -= this.types.get(n).weight) <= 0);
      if (idx < 0) idx = pool.length - 1;
      ordered.push(pool.splice(idx, 1)[0]);
    }

    // Lane order: often the player's own lane (forces a reaction), otherwise random.
    const L = CONFIG.lanes;
    const lanes = Array.from({ length: L.count }, (_, i) => i).sort(() => Math.random() - 0.5);
    if (Math.random() < this.difficulty.preset.targetPlayerLaneChance) {
      lanes.splice(lanes.indexOf(playerLane), 1);
      lanes.unshift(playerLane);
    }

    for (const name of ordered) {
      for (const lane of lanes) {
        if (this._isFair(name, lane, worldSpeed)) {
          this._spawn(name, lane);
          const [min, max] = this.difficulty.getSpawnRange();
          this.spawnTimer = rand(min, max);
          return;
        }
      }
    }
    this.spawnTimer = CONFIG.spawn.retryDelay; // nothing fair right now - check again shortly
  }

  /**
   * Fair-spawn rule: compare arrival times at the player. The newcomer must reach z=0 at least
   * `minimumReactionTime` (+ extra when the required action differs) away from every obstacle
   * still ahead of the player. Because jets are faster, this also stops them overtaking a tank.
   */
  _isFair(type, lane, worldSpeed) {
    const s = CONFIG.spawn;
    const def = CONFIG[type];
    const arrival = CONFIG.world.spawnDistance / (worldSpeed * def.speedMultiplier);
    const lanesNear = new Set([lane]);
    for (const o of this.active) {
      if (o.root.position.z > 3) continue; // already past the player
      const dt = Math.abs(arrival - o.timeToPlayer(worldSpeed));
      if (o.lane === lane) {
        // Same lane: the player must jump/duck, so allow full reaction + recovery time.
        const gap = (s.minimumReactionTime + (o.type !== type ? s.mixedExtraTime : 0)) * s.safetyMargin;
        if (dt < gap) return false;
      } else {
        // Different lane: a smaller gap is enough to lane-switch, but never wall off every lane at once.
        if (dt < CONFIG.lanes.crossLaneGap * s.safetyMargin) return false;
        if (dt < s.minimumReactionTime) lanesNear.add(o.lane);
      }
    }
    return lanesNear.size < CONFIG.lanes.count;
  }

  _spawn(type, lane) {
    const o = this._acquire(type);
    o.lane = lane;
    o.activate(-CONFIG.world.spawnDistance, this.laneX(lane));
    this.active.push(o);
    this.streak = type === this.lastType ? this.streak + 1 : 1;
    this.lastType = type;
    this.bus.emit('obstacle:spawn', o);
  }

  // ---------- pooling ----------

  _createPooled(type) {
    const o = this.types.get(type).create();
    this.scene.add(o.root);
    const model = this.models.get(type);
    if (model) o.setModel(model);
    this.pools.get(type).push(o);
    return o;
  }

  _acquire(type) {
    return this.pools.get(type).find((o) => !o.active) || this._createPooled(type);
  }

  _release(index) {
    const o = this.active[index];
    o.deactivate();
    this.active.splice(index, 1);
  }
}
