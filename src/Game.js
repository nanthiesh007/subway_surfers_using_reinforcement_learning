import * as THREE from 'three';
import { CONFIG } from './config.js';
import { EventBus } from './utils/EventBus.js';
import { clamp } from './utils/math.js';
import { InputManager } from './InputManager.js';
import { Player } from './Player.js';
import { ObstacleManager } from './ObstacleManager.js';
import { CoinManager } from './CoinManager.js';
import { CollisionSystem } from './CollisionSystem.js';
import { Environment } from './Environment.js';
import { ModelLoader } from './ModelLoader.js';
import { AudioManager } from './AudioManager.js';
import { UIManager } from './UIManager.js';
import { ScoreManager } from './ScoreManager.js';
import { DifficultyManager } from './DifficultyManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { CameraRig } from './CameraRig.js';
import { DebugOverlay } from './DebugOverlay.js';

export const GameState = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
});

const RESTART_LOCKOUT_MS = 350; // avoids an accidental instant restart from a panic key-mash

/**
 * Owns the renderer, scene, camera and all high-level systems, and runs the main loop.
 * Everything that moves uses delta time. The player stays near z = 0; the world scrolls toward +Z.
 */
export class Game {
  constructor(container) {
    this.container = container;
    this.state = GameState.LOADING;
    this.bus = new EventBus();
    this.gameOverAt = 0;
    this.noInput = { crouchHeld: false, consumeJump: () => false, consumeLaneMove: () => 0 };

    this._setupRenderer();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 1100);
    this.cameraRig = new CameraRig(this.camera);

    this.ui = new UIManager(this.bus);
    this.input = new InputManager(this.bus, () => this.state);
    this.input.bindTouchButtons(this.ui.touchButtons);
    this.input.bindSwipe(container);
    this.audio = new AudioManager();
    this.score = new ScoreManager();
    this.difficulty = new DifficultyManager();
    this.collisions = new CollisionSystem();
    this.modelLoader = new ModelLoader();

    this.environment = new Environment(this.scene, this.camera);
    this.particles = new ParticleSystem(this.scene);
    this.player = new Player(this.bus);
    this.scene.add(this.player.root);
    this.player.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.obstacles = new ObstacleManager(this.scene, this.bus, this.difficulty);
    this.coins = new CoinManager(this.scene, this.bus, this.difficulty, this.obstacles, this.player);
    this.debug = CONFIG.debug.enabled ? new DebugOverlay(this.scene, this.ui) : null;

    this._wireEvents();
    this._onResize();
    new ResizeObserver(() => this._onResize()).observe(container);

    this.clock = new THREE.Clock();
    this.setDifficulty(this._loadDifficulty());
    this.ui.setScore(0);
    this.ui.setState(this.state);
  }

  setDifficulty(key) {
    if (!CONFIG.difficulties[key]) key = CONFIG.defaultDifficulty;
    this.difficulty.setPreset(key);
    this.difficulty.reset();
    this.score.setDifficulty(key);
    this.ui.setDifficulty(key);
    this.ui.setHighScore(this.score.highScore);
    try { localStorage.setItem(CONFIG.storage.difficultyKey, key); } catch { /* ignore */ }
  }

  _loadDifficulty() {
    try { return localStorage.getItem(CONFIG.storage.difficultyKey) || CONFIG.defaultDifficulty; } catch { return CONFIG.defaultDifficulty; }
  }

  // ---------- setup ----------

  _setupRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.settings.maxPixelRatio);
    r.setPixelRatio(this.pixelRatio);
    this.container.appendChild(r.domElement);
    this.renderer = r;
  }

  _onResize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.settings.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cameraRig.setAspect(this.camera.aspect);
    this.viewportHeightPx = h * this.pixelRatio;
  }

  _wireEvents() {
    const { bus } = this;
    bus.on('start', () => this.state === GameState.READY && this.startRun());
    bus.on('restart', () => {
      const ok = this.state === GameState.PAUSED || (this.state === GameState.GAMEOVER && performance.now() - this.gameOverAt > RESTART_LOCKOUT_MS);
      if (ok) this.startRun();
    });
    bus.on('difficulty', (key) => this.state === GameState.READY && this.setDifficulty(key));
    bus.on('menu', () => this.state === GameState.GAMEOVER && this.backToMenu());
    bus.on('coin:collect', () => {
      this.score.addCoin();
      this.audio.play('coin', { rate: 1 + Math.min(this.score.coins % 8, 7) * 0.04 });
      this.ui.setCoins(this.score.coins);
    });
    bus.on('pause', () => this.state === GameState.PLAYING && this.pause());
    bus.on('resume', () => this.state === GameState.PAUSED && this.resume());
    bus.on('mute', () => this.audio.toggleMute());
    bus.on('ui:click', () => { this.audio.unlock(); this.audio.play('click'); });
    bus.on('debugFreeze', () => {
      if (CONFIG.debug.enabled) CONFIG.debug.freezeDifficulty = !CONFIG.debug.freezeDifficulty;
    });

    // Browsers only allow audio after a gesture.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    bus.on('player:jump', () => this.audio.play('jump'));
    bus.on('player:land', () => {
      this.audio.play('land');
      this.particles.landingDust(this.player.root.position.x, 0.2);
      this.cameraRig.addTrauma(0.06);
    });
    bus.on('player:footstep', () => {
      if (this.state !== GameState.PLAYING) return;
      this.audio.play('footstep', { rate: 0.9 + Math.random() * 0.2 });
      if (this.player.grounded) this.particles.footDust(this.player.root.position.x, 0);
    });
    bus.on('jet:warning', () => {
      this.audio.play('jetFlyby');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === GameState.PLAYING) this.pause();
    });
  }

  /**
   * Try to replace placeholders with GLB models. Missing files are fine: the loader warns and
   * returns null. Models that arrive late are swapped in live without touching gameplay.
   */
  async loadAssets() {
    const jobs = [
      { label: 'soldier', path: CONFIG.player.model.url, apply: (e) => this.player.setModel(e) },
      { label: 'tank', path: CONFIG.tank.model.url, apply: (e) => this.obstacles.setModel('tank', e) },
      { label: 'fighter', path: CONFIG.jet.model.url, apply: (e) => this.obstacles.setModel('jet', e) },
    ];
    const progress = new Array(jobs.length).fill(0);
    const refresh = () => this.ui.setLoading(progress.reduce((a, b) => a + b, 0) / jobs.length, 'Loading models...');

    const tasks = jobs.map((job, i) =>
      this.modelLoader.load(job.path, (f) => { progress[i] = f; refresh(); }).then((entry) => {
        progress[i] = 1;
        refresh();
        if (entry) job.apply(entry);
      }).catch((err) => console.warn(`[Game] ${job.label} failed to apply`, err)),
    );
    // Don't hold the start screen hostage to a huge download; stragglers still swap in later.
    await Promise.race([Promise.all(tasks), new Promise((res) => setTimeout(res, 8000))]);
  }

  async init() {
    this.ui.setLoading(0, 'Preparing battlefield...');
    await this.loadAssets();
    this.environment.reset();
    this.cameraRig.snap(0);
    this.setState(GameState.READY);
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---------- state ----------

  setState(state) {
    this.state = state;
    this.ui.setState(state);
  }

  startRun() {
    this.audio.unlock();
    this.input.reset();
    this.score.reset();
    this.difficulty.reset();
    this.environment.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.player.reset();
    this.particles.clear();
    this.cameraRig.snap(0);
    this.ui.setScore(0);
    this.ui.setCoins(0);
    this.ui.setMultiplier(1, 0);
    this.ui.setLevel(1);
    this.ui.setHighScore(this.score.highScore);
    this.audio.startMusic();
    this.setState(GameState.PLAYING);
  }

  backToMenu() {
    this.obstacles.reset();
    this.coins.reset();
    this.player.reset();
    this.particles.clear();
    this.environment.reset();
    this.cameraRig.snap(0);
    this.ui.setCoins(0);
    this.ui.setScore(0);
    this.setState(GameState.READY);
  }

  pause() {
    this.input.reset();
    this.audio.setEngineLevel(0);
    this.setState(GameState.PAUSED);
  }

  resume() {
    this.clock.getDelta(); // discard the time spent paused
    this.setState(GameState.PLAYING);
  }

  gameOver() {
    this.gameOverAt = performance.now();
    this.player.die();
    this.score.commit();
    this.ui.setHighScore(this.score.highScore);
    this.ui.showGameOver({
      score: this.score.score, best: this.score.highScore, isNewBest: this.score.isNewBest,
      coins: this.score.coins, distance: this.score.distance, level: this.score.level, difficulty: this.difficulty.preset.label,
    });
    this.particles.explosion(this.player.root.position.x, 1.0, 0.2);
    this.cameraRig.addTrauma(1);
    this.audio.play('collision');
    this.audio.play('explosion');
    this.audio.stopMusic();
    this.audio.setEngineLevel(0);
    this.audio.play('gameover', { volume: 0.8 });
    this.setState(GameState.GAMEOVER);
  }

  // ---------- main loop ----------

  _frame() {
    const dt = Math.min(this.clock.getDelta(), CONFIG.maxDelta);
    this._update(dt);
    this.environment.followCamera();
    this.renderer.render(this.scene, this.camera);
    this.debug?.update(dt, this);
  }

  _update(dt) {
    const d = this.difficulty;
    const ctx = { particles: this.particles, playerLane: this.player.lane };

    switch (this.state) {
      case GameState.READY:
        this.player.updateIdle(dt);
        this.cameraRig.update(dt, 0, 0, 0, false);
        this.particles.update(dt, 0, this.camera, this.viewportHeightPx);
        break;

      case GameState.PLAYING: {
        d.update(dt);
        const speed = d.speed;
        this.score.update(dt, speed);
        this.environment.update(dt, speed);
        this.player.update(dt, this.input, d.level);
        this.obstacles.update(dt, speed, ctx);
        this.coins.update(dt, speed, ctx);
        if (this.score.checkLevelUp()) {
          this.ui.showLevelBanner(this.score.level);
          this.audio.play('levelup');
        }

        if (this.collisions.check(this.player.box, this.obstacles.active)) {
          this.gameOver();
        }

        // Proximity feedback: tank rumble + a whisper of camera shake as one rolls past.
        const tankDist = this.obstacles.nearestDistance('tank');
        this.audio.setEngineLevel(clamp(1 - tankDist / 70, 0, 1) ** 2);
        if (tankDist < 14) this.cameraRig.holdTrauma(CONFIG.camera.tankProximityShake * (1 - tankDist / 14));

        this.cameraRig.update(dt, this.player.root.position.y, d.level, this.player.stepPhase, this.player.grounded, this.player.root.position.x);
        this.particles.update(dt, speed, this.camera, this.viewportHeightPx);
        this.ui.setScore(this.score.score);
        this.ui.setMultiplier(this.score.multiplier, this.score.multiplierProgress);
        this.ui.setLevel(this.score.level);
        this.ui.setWarning(this.obstacles.isJetWarningActive());
        break;
      }

      case GameState.GAMEOVER:
        // World and obstacles stay frozen; the runner falls and the explosion plays out.
        this.player.update(dt, this.noInput, d.level);
        this.cameraRig.update(dt, this.player.root.position.y, d.level, 0, false, this.player.root.position.x);
        this.particles.update(dt, 0, this.camera, this.viewportHeightPx);
        break;

      case GameState.PAUSED:
      case GameState.LOADING:
      default:
        break;
    }
  }
}
