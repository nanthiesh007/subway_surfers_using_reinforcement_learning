import { CONFIG, assetUrl } from './config.js';

/**
 * Web Audio wrapper.
 *  - The AudioContext is only created/resumed after the first user gesture (browser autoplay rules).
 *  - Sound files in /public/audio are optional. Any file that is missing falls back to a small
 *    synthesized sound (or silence for music), so the game never crashes over audio.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.loading = null;
    this.music = null;
    this.engine = null;
    this.muted = this._loadMuted();
    this.volume = { master: CONFIG.audio.masterVolume, music: CONFIG.audio.musicVolume, sfx: CONFIG.audio.sfxVolume };
  }

  // ---------- setup ----------

  /** Call from any click / tap / key handler. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this._applyVolumes();
        this.noise = this._makeNoise();
        this.loading = this._loadFiles();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('[Audio] unavailable:', err);
    }
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : this.volume.master;
    this.sfxBus.gain.value = this.volume.sfx;
    this.musicBus.gain.value = this.volume.music;
  }

  setMasterVolume(v) {
    this.volume.master = v;
    this._applyVolumes();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(CONFIG.audio.muteStorageKey, this.muted ? '1' : '0'); } catch { /* ignore */ }
    this._applyVolumes();
    return this.muted;
  }

  _loadMuted() {
    try { return localStorage.getItem(CONFIG.audio.muteStorageKey) === '1'; } catch { return false; }
  }

  async _loadFiles() {
    await Promise.all(
      Object.entries(CONFIG.audio.files).map(async ([name, path]) => {
        try {
          const res = await fetch(assetUrl(path));
          if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return;
          const data = await res.arrayBuffer();
          this.buffers[name] = await this.ctx.decodeAudioData(data);
        } catch {
          /* missing / undecodable: synthesized fallback is used */
        }
      }),
    );
    if (this.wantMusic) this.startMusic();
  }

  _makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- playback ----------

  /** Play a named sound: file if loaded, otherwise the synth fallback. */
  play(name, { volume = 1, rate = 1 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const buffer = this.buffers[name];
    try {
      if (buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = rate;
        const g = this.ctx.createGain();
        g.gain.value = volume;
        src.connect(g).connect(this.sfxBus);
        src.start();
      } else {
        this[`_synth_${name}`]?.(volume, rate);
      }
    } catch (err) {
      console.warn(`[Audio] failed to play ${name}`, err);
    }
  }

  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.music || !this.buffers.music) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.music;
    src.loop = true;
    src.connect(this.musicBus);
    src.start();
    this.music = src;
  }

  stopMusic() {
    this.wantMusic = false;
    try { this.music?.stop(); } catch { /* already stopped */ }
    this.music = null;
  }

  /** 0..1 loudness of the approaching tank rumble. */
  setEngineLevel(level) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.engine) this._createEngine();
    const target = this.muted ? 0 : level;
    this.engine.gain.gain.setTargetAtTime(target * 0.5, this.ctx.currentTime, 0.1);
  }

  _createEngine() {
    const { ctx } = this;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.sfxBus);
    if (this.buffers.tankEngine) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffers.tankEngine;
      src.loop = true;
      src.connect(gain);
      src.start();
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 52;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const trem = ctx.createGain();
      trem.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(trem.gain);
      osc.connect(filter).connect(trem).connect(gain);
      osc.start();
      lfo.start();
    }
    this.engine = { gain };
  }

  // ---------- synthesized fallbacks ----------

  _env(gainNode, t0, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _tone(type, f0, f1, dur, vol, delay = 0) {
    const { ctx } = this;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this._env(g, t, vol, 0.01, dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise(filterType, f0, f1, dur, vol, attack = 0.005) {
    const { ctx } = this;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g, t, vol, attack, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + attack + 0.05);
  }

  _synth_jump(v) { this._tone('triangle', 260, 560, 0.16, 0.25 * v); }
  _synth_land(v) { this._noise('lowpass', 500, 120, 0.14, 0.5 * v); this._tone('sine', 110, 50, 0.14, 0.4 * v); }
  _synth_footstep(v, rate) { this._noise('bandpass', 700 * rate, 400, 0.05, 0.12 * v); }
  _synth_coin(v, rate) {
    this._tone('square', 988 * rate, 988 * rate, 0.07, 0.12 * v);
    this._tone('square', 1319 * rate, 1319 * rate, 0.18, 0.12 * v, 0.07);
  }
  _synth_levelup(v) {
    [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.18, 0.25 * v, i * 0.09));
  }
  _synth_click(v) { this._tone('square', 720, 540, 0.05, 0.12 * v); }
  _synth_collision(v) { this._noise('lowpass', 2500, 150, 0.35, 0.8 * v); this._tone('sine', 90, 35, 0.3, 0.7 * v); }
  _synth_explosion(v) { this._noise('lowpass', 1800, 60, 1.1, 0.9 * v, 0.01); this._tone('sawtooth', 70, 28, 0.8, 0.35 * v); }
  _synth_jetFlyby(v) { this._noise('bandpass', 250, 1400, 1.6, 0.35 * v, 0.9); }
  _synth_gameover(v) {
    this._tone('triangle', 330, 320, 0.3, 0.3 * v, 0);
    this._tone('triangle', 262, 255, 0.3, 0.3 * v, 0.3);
    this._tone('triangle', 196, 150, 0.7, 0.3 * v, 0.6);
  }
}
