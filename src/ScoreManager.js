import { CONFIG } from './config.js';

/**
 * Score, distance, coins, multiplier, level and the persisted high score (one per difficulty).
 *
 * score = (metres * scoreRate + coins * coinValue + level bonuses) * coinMultiplier * difficultyMultiplier,
 * where each term is multiplied at the moment it is earned.
 */
export class ScoreManager {
  constructor() {
    this.setDifficulty(CONFIG.defaultDifficulty);
    this.reset();
  }

  setDifficulty(key) {
    this.difficultyKey = key;
    this.difficultyMultiplier = CONFIG.difficulties[key].scoreMultiplier;
    this.highScore = this._load();
  }

  reset() {
    this.score = 0;
    this.distance = 0;
    this.coins = 0;
    this.level = 1;
    this.isNewBest = false;
  }

  get multiplier() {
    const c = CONFIG.coins;
    return Math.min(c.maxMultiplier, 1 + Math.floor(this.coins / c.coinsPerMultiplier));
  }

  /** Fraction (0..1) of the way to the next multiplier step; 1 when maxed. */
  get multiplierProgress() {
    const c = CONFIG.coins;
    if (this.multiplier >= c.maxMultiplier) return 1;
    return (this.coins % c.coinsPerMultiplier) / c.coinsPerMultiplier;
  }

  update(dt, speed) {
    const metres = speed * dt;
    this.distance += metres;
    this.score += metres * CONFIG.world.scoreRate * this.multiplier * this.difficultyMultiplier;
  }

  addCoin() {
    this.score += CONFIG.coins.value * this.multiplier * this.difficultyMultiplier;
    this.coins++;
  }

  /** @returns {boolean} true when a new level was just reached */
  checkLevelUp() {
    const level = 1 + Math.floor(this.distance / CONFIG.levels.distancePerLevel);
    if (level <= this.level) return false;
    this.level = level;
    this.score += CONFIG.levels.bonusPoints * this.difficultyMultiplier;
    return true;
  }

  /** Called on game over. Persists a new best. */
  commit() {
    const final = Math.floor(this.score);
    if (final > this.highScore) {
      this.highScore = final;
      this.isNewBest = true;
      this._save(final);
    }
  }

  get _key() {
    return `${CONFIG.storage.highScoreKey}.${this.difficultyKey}`;
  }

  _load() {
    try {
      return parseInt(localStorage.getItem(this._key) || '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  _save(value) {
    try {
      localStorage.setItem(this._key, String(value));
    } catch {
      /* storage may be blocked (private mode) - the run still works */
    }
  }
}
