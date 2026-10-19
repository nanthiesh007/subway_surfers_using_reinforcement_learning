import * as THREE from 'three';
import { CONFIG } from './config.js';
import { damp, lerp } from './utils/math.js';

/**
 * Third-person chase camera: smoothly follows behind/above the player, dampens vertical
 * motion during jumps, adds a subtle run bob, speed-based FOV and trauma-style camera shake.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.cfg = CONFIG.camera;
    this.base = new THREE.Vector3(...this.cfg.offset);
    this.lookBase = new THREE.Vector3(...this.cfg.lookAt);
    this.position = this.base.clone();
    this.lookTarget = this.lookBase.clone();
    this.trauma = 0;
    this.time = 0;
    this.snap(0);
  }

  /** Jump straight to the resting pose (used on reset / start). */
  snap(playerY) {
    this.position.set(this.base.x, this.base.y + playerY * this.cfg.verticalFollow, this.base.z);
    this.lookTarget.set(this.lookBase.x, this.lookBase.y + playerY * 0.1, this.lookBase.z);
    this.trauma = 0;
    this.camera.fov = this.cfg.fov;
    this.camera.updateProjectionMatrix();
    this._apply(0, 0);
  }

  /** Portrait screens: pull the camera back/up so the lane and obstacles stay in frame. */
  setAspect(aspect) {
    const pull = Math.max(0, 1 - aspect);
    this.base.set(...this.cfg.offset);
    this.base.z += pull * 7;
    this.base.y += pull * 2.5;
    this.base.x *= 1 - pull;
    this.position.x = this.base.x;
    this.position.z = this.base.z;
  }

  /** Keep shake at least at `amount` (continuous rumble such as a nearby tank). */
  holdTrauma(amount) {
    if (CONFIG.settings.cameraShake) this.trauma = Math.max(this.trauma, amount);
  }

  addTrauma(amount) {
    if (!CONFIG.settings.cameraShake) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * @param {number} dt
   * @param {number} playerY      player height above the ground
   * @param {number} difficulty   0..1, widens the FOV slightly for a sense of speed
   * @param {number} bobPhase     run-cycle phase; 0 disables bob while stopped
   * @param {boolean} running
   */
  update(dt, playerY, difficulty, bobPhase, running, playerX = 0) {
    const c = this.cfg;
    this.time += dt;
    const k = damp(c.followSmoothing, dt);

    // Follow lane changes partially so the player stays framed without the road swinging wildly.
    this.position.x = lerp(this.position.x, this.base.x + playerX * 0.7, k);
    this.lookTarget.x = lerp(this.lookTarget.x, this.lookBase.x + playerX * 0.85, k);

    const targetY = this.base.y + playerY * c.verticalFollow;
    this.position.y = lerp(this.position.y, targetY, k);
    this.lookTarget.y = lerp(this.lookTarget.y, this.lookBase.y + playerY * 0.1, k);

    const fov = lerp(c.fov, c.fovAtMaxSpeed, difficulty);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, fov, damp(2, dt));
      this.camera.updateProjectionMatrix();
    }

    let bobY = 0;
    let bobX = 0;
    if (CONFIG.settings.cameraBob && running) {
      bobY = Math.abs(Math.sin(bobPhase)) * c.bobAmplitude;
      bobX = Math.sin(bobPhase) * c.bobAmplitude * 0.5;
    }

    this.trauma = Math.max(0, this.trauma - c.shakeDecay * dt);
    this._apply(bobX, bobY);
  }

  _apply(bobX, bobY) {
    const shake = this.trauma * this.trauma * this.cfg.shakeMaxOffset;
    const t = this.time * 38;
    this.camera.position.set(
      this.position.x + bobX + Math.sin(t * 1.3) * shake,
      this.position.y + bobY + Math.sin(t * 1.7 + 1) * shake,
      this.position.z,
    );
    this.camera.lookAt(this.lookTarget);
  }
}
