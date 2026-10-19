import * as THREE from 'three';
import { BoxCollider } from '../CollisionSystem.js';
import { ModelLoader } from '../ModelLoader.js';

/**
 * Base class for everything that travels toward the player and can end the run.
 *
 *   root      <- Group moved by gameplay (position.z), used for collider placement
 *   └─ visual <- container; subclasses animate it (bank, bob...)
 *      ├─ placeholder   (primitive geometry from createPlaceholder())
 *      └─ modelHolder   (GLB clone with config offsets, added by setModel())
 *   collider  <- BoxCollider with hand-tuned dimensions from config (never model bounds)
 *
 * To add a new obstacle type (missile, drone, tank shell...) extend this class and register
 * it in ObstacleManager. Projectiles can reuse it as-is: they are just obstacles with a
 * different collider height and speed.
 */
export class Obstacle {
  /**
   * @param {string} type  key used by the manager / pool ('tank', 'jet', ...)
   * @param {object} cfg   config block (collider, speedMultiplier, model offsets)
   */
  constructor(type, cfg) {
    this.type = type;
    this.cfg = cfg;
    this.active = false;
    this.collidable = true;
    this.speedMultiplier = cfg.speedMultiplier;
    this.time = 0;

    this.root = new THREE.Group();
    this.root.name = `Obstacle:${type}`;
    this.visual = new THREE.Group();
    this.root.add(this.visual);
    this.collider = new BoxCollider(cfg.collider);

    this.placeholder = this.createPlaceholder();
    this.visual.add(this.placeholder);
    this.modelHolder = null;
    this.root.visible = false;
  }

  /** Subclasses return a Group of primitive meshes. */
  createPlaceholder() {
    return new THREE.Group();
  }

  /** Replace the placeholder with a loaded GLB (cloned, offsets from config). */
  setModel(entry) {
    const { object } = ModelLoader.clone(entry);
    if (this.modelHolder) this.visual.remove(this.modelHolder);
    this.modelHolder = new THREE.Group();
    ModelLoader.applyOffsets(this.modelHolder, this.cfg.model);
    this.modelHolder.add(object);
    this.visual.add(this.modelHolder);
    this.placeholder.visible = false;
  }

  activate(z, x = 0) {
    this.active = true;
    this.collidable = true;
    this.time = 0;
    this.warned = false;
    this.baseX = x; // lane centre; subclasses may add lateral motion on top
    this.root.position.set(x, 0, z);
    this.root.visible = true;
    this.onActivate();
    this.collider.update(this.root);
  }

  deactivate() {
    this.active = false;
    this.root.visible = false;
  }

  onActivate() {}

  /** Seconds until the obstacle reaches the player (z = 0) at the given world speed. */
  timeToPlayer(worldSpeed) {
    return Math.max(0, -this.root.position.z) / (worldSpeed * this.speedMultiplier);
  }

  update(dt, worldSpeed, ctx) {
    this.time += dt;
    this.root.position.z += worldSpeed * this.speedMultiplier * dt;
    this.animate(dt, worldSpeed, ctx);
    this.collider.update(this.root);
  }

  /** Hook for procedural animation / particle emission. */
  animate() {}
}
