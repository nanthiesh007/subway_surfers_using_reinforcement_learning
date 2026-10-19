import { CONFIG } from './config.js';

/**
 * Single source of truth for player input. Game objects never listen to the
 * keyboard / touch events themselves: they poll `crouchHeld`, `consumeJump()` and
 * `consumeLaneMove()`, or react to semantic events on the bus (start, restart, pause, mute).
 */
export class InputManager {
  /**
   * @param {import('./utils/EventBus.js').EventBus} bus
   * @param {() => string} getState  returns the current game state (used to decide what keys mean)
   */
  constructor(bus, getState) {
    this.bus = bus;
    this.getState = getState;
    this.jumpBufferedAt = -Infinity;
    this.laneQueue = [];
    this.heldKeys = new Set();
    this.touchCrouch = false;
    this.keyCrouch = false;
    this.swipeCrouchUntil = 0;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._clear = this._clear.bind(this);

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._clear);
    document.addEventListener('visibilitychange', () => document.hidden && this._clear());
  }

  get crouchHeld() {
    return this.keyCrouch || this.touchCrouch || performance.now() < this.swipeCrouchUntil;
  }

  /** On-screen buttons. `buttons` = { jump, duck, left, right } elements. */
  bindTouchButtons({ jump, duck, left, right }) {
    const press = (btn, onDown, onUp = () => {}) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('active');
        onDown();
      });
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        onUp();
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    press(jump, () => this.requestJump());
    press(duck, () => { this.touchCrouch = true; }, () => { this.touchCrouch = false; });
    press(left, () => this.requestLane(-1));
    press(right, () => this.requestLane(1));
  }

  /** Swipe gestures on the game area: left/right = change lane, up = jump, down = duck. */
  bindSwipe(element) {
    let start = null;
    const L = CONFIG.lanes;
    element.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const finish = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (this.getState() !== 'playing') return;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < L.swipeThreshold) return;
      if (Math.abs(dx) > Math.abs(dy)) this.requestLane(dx > 0 ? 1 : -1);
      else if (dy < 0) this.requestJump();
      else this.swipeCrouchUntil = performance.now() + L.swipeDuckTime * 1000;
    };
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', () => { start = null; });
  }

  /** Called by gameplay each frame: true once per buffered jump press. */
  consumeJump() {
    if (performance.now() / 1000 - this.jumpBufferedAt <= CONFIG.player.jumpBufferTime) {
      this.jumpBufferedAt = -Infinity;
      return true;
    }
    return false;
  }

  /** Returns -1 (left), 1 (right) or 0; each queued press is consumed once. */
  consumeLaneMove() {
    return this.laneQueue.shift() || 0;
  }

  requestJump() {
    this.jumpBufferedAt = performance.now() / 1000;
  }

  requestLane(dir) {
    if (this.getState() !== 'playing') return;
    if (this.laneQueue.length < CONFIG.lanes.maxQueuedMoves) this.laneQueue.push(dir);
  }

  reset() {
    this.jumpBufferedAt = -Infinity;
    this.laneQueue.length = 0;
    this.swipeCrouchUntil = 0;
    this._clear();
  }

  _clear() {
    this.heldKeys.clear();
    this.keyCrouch = false;
    this.touchCrouch = false;
  }

  _onKeyDown(e) {
    const { keys } = CONFIG;
    const code = e.code;
    const state = this.getState();
    const known = [...keys.jump, ...keys.crouch, ...keys.left, ...keys.right, ...keys.pause, ...keys.restart, ...keys.start];

    // Stop arrows / space from scrolling the page while the game is in use.
    if (state !== 'loading' && known.includes(code)) {
      const tag = e.target?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
    }
    if (e.repeat) return;
    this.heldKeys.add(code);

    if (keys.mute.includes(code)) this.bus.emit('mute');
    if (keys.debugFreeze.includes(code)) this.bus.emit('debugFreeze');

    switch (state) {
      case 'ready':
        if (keys.difficulty[code]) this.bus.emit('difficulty', keys.difficulty[code]);
        else if (keys.start.includes(code)) this.bus.emit('start');
        break;
      case 'playing':
        if (keys.jump.includes(code)) this.requestJump();
        if (keys.crouch.includes(code)) this.keyCrouch = true;
        if (keys.left.includes(code)) this.requestLane(-1);
        if (keys.right.includes(code)) this.requestLane(1);
        if (keys.pause.includes(code)) this.bus.emit('pause');
        break;
      case 'paused':
        if (keys.pause.includes(code) || code === 'Enter') this.bus.emit('resume');
        if (code === 'KeyR') this.bus.emit('restart');
        break;
      case 'gameover':
        if (keys.restart.includes(code)) this.bus.emit('restart');
        break;
      default:
    }
  }

  _onKeyUp(e) {
    this.heldKeys.delete(e.code);
    if (CONFIG.keys.crouch.includes(e.code)) {
      this.keyCrouch = CONFIG.keys.crouch.some((c) => this.heldKeys.has(c));
    }
  }
}
