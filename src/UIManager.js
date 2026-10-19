import { CONFIG } from './config.js';
import { padScore } from './utils/math.js';

/**
 * All HTML/CSS interface code. Knows nothing about Three.js: it shows/hides panels for a game
 * state, updates text, and emits user intents ('start', 'restart', 'pause', 'resume') on the bus.
 */
export class UIManager {
  constructor(bus) {
    this.bus = bus;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), hudSub: $('hud-sub'), score: $('hud-score'), high: $('hud-high'),
      pauseBtn: $('btn-pause'), warning: $('warning'),
      loading: $('overlay-loading'), loadingBar: $('loading-bar'), loadingText: $('loading-text'),
      start: $('overlay-start'), pause: $('overlay-pause'), gameover: $('overlay-gameover'),
      goScore: $('go-score'), goBest: $('go-best'), goNewBest: $('go-new-best'),
      touch: $('touch-controls'), jumpBtn: $('btn-jump'), duckBtn: $('btn-duck'),
      debug: $('debug-panel'),
      coins: $('hud-coins'), mult: $('hud-mult'), multFill: $('mult-fill'), level: $('hud-level'), banner: $('level-banner'),
      goCoins: $('go-coins'), goDistance: $('go-distance'), goLevel: $('go-level'), goDifficulty: $('go-difficulty'),
      diffButtons: [...document.querySelectorAll('[data-difficulty]')], menuBtn: $('btn-menu'),
      startBtn: $('btn-start'), resumeBtn: $('btn-resume'), pauseRestartBtn: $('btn-pause-restart'), restartBtn: $('btn-restart'),
    };
    this._lastScore = -1;
    this._lastMult = -1;
    this._lastCoins = -1;
    this._lastLevel = -1;
    this._bannerTimer = 0;
    this.panels = [this.el.loading, this.el.start, this.el.pause, this.el.gameover];

    // Buttons ('click' covers mouse, touch and keyboard activation).
    const bind = (btn, event) => btn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.bus.emit('ui:click');
      this.bus.emit(event);
    });
    bind(this.el.startBtn, 'start');
    bind(this.el.resumeBtn, 'resume');
    bind(this.el.pauseRestartBtn, 'restart');
    bind(this.el.restartBtn, 'restart');
    bind(this.el.menuBtn, 'menu');
    for (const btn of this.el.diffButtons) {
      btn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this.bus.emit('ui:click');
        this.bus.emit('difficulty', btn.dataset.difficulty);
      });
    }
    this.el.pauseBtn.addEventListener('click', (e) => { e.currentTarget.blur(); this.bus.emit('pause'); });
    this.el.pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  get touchButtons() {
    return {
      jump: this.el.jumpBtn,
      duck: this.el.duckBtn,
      left: document.getElementById('btn-left'),
      right: document.getElementById('btn-right'),
    };
  }

  setLoading(fraction, text) {
    this.el.loadingBar.style.width = `${Math.round(fraction * 100)}%`;
    if (text) this.el.loadingText.textContent = text;
  }

  setHighScore(v) {
    this.el.high.textContent = padScore(v);
  }

  setScore(v) {
    const floored = Math.floor(v);
    if (floored === this._lastScore) return;
    this._lastScore = floored;
    this.el.score.textContent = padScore(floored);
  }

  setDifficulty(key) {
    for (const btn of this.el.diffButtons) btn.classList.toggle('selected', btn.dataset.difficulty === key);
  }

  setCoins(n) {
    if (n === this._lastCoins) return;
    this._lastCoins = n;
    this.el.coins.textContent = String(n);
  }

  setMultiplier(mult, progress) {
    this.el.multFill.style.width = `${Math.round(progress * 100)}%`;
    if (mult === this._lastMult) return;
    this._lastMult = mult;
    this.el.mult.textContent = `x${mult}`;
  }

  setLevel(level) {
    if (level === this._lastLevel) return;
    this._lastLevel = level;
    this.el.level.textContent = String(level);
  }

  showLevelBanner(level) {
    const b = this.el.banner;
    b.textContent = `LEVEL ${level}`;
    b.classList.remove('hidden');
    b.style.animation = 'none';
    void b.offsetWidth; // restart the CSS animation
    b.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.add('hidden'), 1800);
  }

  setWarning(visible) {
    this.el.warning.classList.toggle('hidden', !visible);
  }

  showGameOver({ score, best, isNewBest, coins, distance, level, difficulty }) {
    this.el.goScore.textContent = padScore(score);
    this.el.goBest.textContent = padScore(best);
    this.el.goCoins.textContent = String(coins);
    this.el.goDistance.textContent = `${Math.floor(distance)} m`;
    this.el.goLevel.textContent = String(level);
    this.el.goDifficulty.textContent = difficulty;
    this.el.goNewBest.classList.toggle('hidden', !isNewBest);
  }

  setDebugText(text) {
    this.el.debug.textContent = text;
  }

  /** Show exactly the panels / HUD that belong to a game state. */
  setState(state) {
    const show = (el, on) => el.classList.toggle('hidden', !on);
    show(this.el.loading, state === 'loading');
    show(this.el.start, state === 'ready');
    show(this.el.pause, state === 'paused');
    show(this.el.gameover, state === 'gameover');
    const inRun = state === 'playing' || state === 'paused' || state === 'gameover';
    show(this.el.hud, inRun || state === 'ready');
    show(this.el.hudSub, inRun);
    show(this.el.pauseBtn, state === 'playing');
    show(this.el.touch, CONFIG.settings.isTouchDevice && (state === 'playing' || state === 'paused'));
    if (state !== 'playing') this.setWarning(false);
    if (state !== 'playing') this.el.banner.classList.add('hidden');
    show(this.el.debug, CONFIG.debug.enabled);
    // Move keyboard focus onto the primary action so Enter / Space behave sensibly.
    if (state === 'ready') this.el.startBtn.focus({ preventScroll: true });
  }
}
