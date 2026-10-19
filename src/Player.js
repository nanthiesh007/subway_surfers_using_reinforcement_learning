import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BoxCollider } from './CollisionSystem.js';
import { ModelLoader } from './ModelLoader.js';
import { PlaceholderHuman } from './player/PlaceholderHuman.js';
import { AnimationController } from './player/AnimationController.js';
import { damp } from './utils/math.js';

/**
 * Hierarchy (physics, visuals and collision are deliberately separate):
 *
 *   root            <- position / physics (Y), what gameplay moves
 *   └─ visual       <- container for whatever is drawn
 *      ├─ placeholder (procedural box soldier)
 *      └─ modelHolder (config offsets: scale / rotation / position) └─ GLB clone
 *
 *   collider        <- BoxCollider, never derived from meshes; height shrinks when crouching
 */
export class Player {
  constructor(bus) {
    this.bus = bus;
    const cfg = CONFIG.player;

    this.root = new THREE.Group();
    this.root.name = 'PlayerRoot';
    this.visual = new THREE.Group();
    this.visual.name = 'PlayerVisual';
    this.root.add(this.visual);

    this.placeholder = new PlaceholderHuman();
    this.visual.add(this.placeholder.root);
    this.modelHolder = null;

    this.collider = new BoxCollider({
      halfWidth: cfg.colliderWidth / 2,
      halfDepth: cfg.colliderDepth / 2,
      minY: 0,
      maxY: cfg.normalColliderHeight,
    });

    this.animation = new AnimationController({ jumpDuration: (2 * cfg.jumpVelocity) / cfg.gravity });
    this.animation.usePlaceholder(this.placeholder);

    this.reset();
  }

  reset() {
    const cfg = CONFIG.player;
    this.alive = true;
    this.grounded = true;
    this.velocityY = 0;
    this.height = cfg.normalColliderHeight; // current collider height
    this.crouching = false;
    this.landTimer = 0;
    this.stepPhase = 0;
    this.lastStepIndex = 0;
    this.lane = Math.floor(CONFIG.lanes.count / 2); // start in the centre lane
    this.root.position.set(this.laneX(this.lane), cfg.groundY, 0);
    this.root.rotation.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    this.collider.maxY = this.height;
    this.collider.update(this.root);
    this.animation.setState('run');
    this.animation.frozen = false;
    // force a state refresh when a mixer is in use
    this.animation.state = null;
    this.animation.setState('run');
  }

  /** Swap the placeholder for a loaded GLB (see ModelLoader). Gameplay code is unaffected. */
  setModel(entry) {
    const { object, animations } = ModelLoader.clone(entry);
    if (this.modelHolder) this.visual.remove(this.modelHolder);
    this.modelHolder = new THREE.Group();
    this.modelHolder.name = 'PlayerModel';
    ModelLoader.applyOffsets(this.modelHolder, CONFIG.player.model);
    this.modelHolder.add(object);
    this.visual.add(this.modelHolder);
    this.placeholder.root.visible = false;
    this.animation.useMixer(object, animations);
    this.animation.state = null;
    this.animation.setState(this._desiredState());
  }

  /** Run-phase with idle -> alive-state used both for animation and footsteps. */
  _desiredState() {
    if (!this.alive) return 'death';
    if (!this.grounded) return this.velocityY > 0 ? 'jump' : 'fall';
    if (this.landTimer > 0) return 'land';
    return this.crouching ? 'crouchRun' : 'run';
  }

  /**
   * @param {number} dt
   * @param {{crouchHeld:boolean, consumeJump:()=>boolean}} input
   * @param {number} difficultyLevel 0..1, speeds up the run cycle
   */
  update(dt, input, difficultyLevel) {
    const cfg = CONFIG.player;

    if (this.alive) {
      // ---- Lane change: logical lane index, root X eases toward the lane centre
      const move = input.consumeLaneMove();
      if (move) {
        const next = Math.min(Math.max(this.lane + move, 0), CONFIG.lanes.count - 1);
        if (next !== this.lane) {
          this.lane = next;
          this.bus.emit('player:lane');
        }
      }
      const targetX = this.laneX(this.lane);
      const dx = targetX - this.root.position.x;
      this.root.position.x += dx * damp(CONFIG.lanes.switchSmoothing, dt);
      if (Math.abs(dx) < 0.002) this.root.position.x = targetX;
      this.visual.rotation.y = Math.min(0.5, Math.max(-0.5, -dx * 0.3)); // turn into the move

      // ---- Jump: positive velocity, gravity pulls it back down (sub-stepped for frame-rate independence)
      if (this.grounded && input.consumeJump()) {
        this.velocityY = cfg.jumpVelocity;
        this.grounded = false;
        this.crouching = false;
        this.bus.emit('player:jump');
      }
      if (!this.grounded) {
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.velocityY -= cfg.gravity * h;
          this.root.position.y += this.velocityY * h;
          if (this.root.position.y <= cfg.groundY) {
            this.root.position.y = cfg.groundY;
            this.velocityY = 0;
            this.grounded = true;
            this.landTimer = cfg.landingTime;
            this.bus.emit('player:land');
            break;
          }
        }
      }

      // ---- Crouch: only valid on the ground; collider height eases between standing and crouched
      this.crouching = this.grounded && input.crouchHeld;
      const targetHeight = this.crouching ? cfg.crouchColliderHeight : cfg.normalColliderHeight;
      this.height += (targetHeight - this.height) * damp(cfg.crouchSmoothing, dt);
      if (Math.abs(this.height - targetHeight) < 0.005) this.height = targetHeight;
      this.collider.maxY = this.height;

      if (this.landTimer > 0) this.landTimer -= dt;

      // ---- Run cycle phase (drives procedural animation and footstep sounds)
      const speedFactor = 1 + difficultyLevel * 0.55;
      if (this.grounded) {
        this.stepPhase += dt * cfg.stepFrequency * speedFactor * (this.crouching ? 0.85 : 1);
        const stepIndex = Math.floor(this.stepPhase / Math.PI);
        if (stepIndex !== this.lastStepIndex) {
          this.lastStepIndex = stepIndex;
          this.bus.emit('player:footstep');
        }
      }
    }

    else if (!this.grounded) {
      // Knocked out mid-air: keep falling until the ground.
      this.velocityY -= cfg.gravity * dt;
      this.root.position.y = Math.max(cfg.groundY, this.root.position.y + this.velocityY * dt);
      if (this.root.position.y <= cfg.groundY) {
        this.velocityY = 0;
        this.grounded = true;
      }
    }

    this.collider.update(this.root);
    this.animation.setState(this._desiredState());
    this.animation.update(dt, { phase: this.stepPhase, runScale: 1 + difficultyLevel * 0.5 });
  }

  /** World X of a lane centre (shared by obstacle spawning). */
  laneX(index) {
    return (index - (CONFIG.lanes.count - 1) / 2) * CONFIG.lanes.laneWidth;
  }

  /** Idle pose on the start screen. */
  updateIdle(dt) {
    this.animation.setState('idle');
    this.animation.update(dt, { phase: 0, runScale: 1 });
  }

  die() {
    this.alive = false;
    this.crouching = false;
    this.velocityY = Math.max(this.velocityY, 0);
    this.bus.emit('player:death');
  }

  get box() {
    return this.collider.box;
  }
}
