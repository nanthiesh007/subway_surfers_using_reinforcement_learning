import { CONFIG } from './config.js';
import { clamp, lerp } from './utils/math.js';

/**
 * Smooth difficulty curve: world speed rises linearly to a cap, `level` is that progress in 0..1.
 * The starting speed, cap, ramp and spawn density come from the chosen preset (CONFIG.difficulties).
 */
export class DifficultyManager {
  constructor() {
    this.setPreset(CONFIG.defaultDifficulty);
    this.reset();
  }

  setPreset(key) {
    this.presetKey = CONFIG.difficulties[key] ? key : CONFIG.defaultDifficulty;
    this.preset = CONFIG.difficulties[this.presetKey];
  }

  reset() {
    this.elapsed = 0;
    this.speed = this.preset.baseGameSpeed;
    this.level = 0;
    this.frozen = false;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.frozen || CONFIG.debug.freezeDifficulty) return;
    const { baseGameSpeed, maxGameSpeed, speedIncreasePerSecond } = this.preset;
    this.speed = clamp(this.speed + speedIncreasePerSecond * dt, baseGameSpeed, maxGameSpeed);
    this.level = (this.speed - baseGameSpeed) / (maxGameSpeed - baseGameSpeed);
  }

  /** [min, max] seconds for the next spawn timer. */
  getSpawnRange() {
    const { minSpawnInterval, maxSpawnInterval } = CONFIG.spawn;
    const k = this.preset.spawnScale;
    return [lerp(minSpawnInterval[0], minSpawnInterval[1], this.level) * k, lerp(maxSpawnInterval[0], maxSpawnInterval[1], this.level) * k];
  }

  /** Seconds of jet-warning lead time; 0 means no warning. */
  getWarningLeadTime() {
    const w = CONFIG.warning;
    if (this.level >= w.disableAboveDifficulty) return 0;
    return lerp(w.leadTimeEasy, w.leadTimeHard, this.level / w.disableAboveDifficulty) * this.preset.warningScale;
  }
}
