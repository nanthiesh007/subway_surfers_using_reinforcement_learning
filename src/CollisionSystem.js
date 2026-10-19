import * as THREE from 'three';

/**
 * Logical collision volume attached to a root object. Completely independent of
 * the visual mesh: gameplay never looks at model bounds.
 *
 * Local space: X/Z are centred on the root, Y ranges are measured from the root's Y.
 */
export class BoxCollider {
  constructor({ halfWidth = 0.5, halfDepth = 0.5, minY = 0, maxY = 1, offsetZ = 0 } = {}) {
    this.halfWidth = halfWidth;
    this.halfDepth = halfDepth;
    this.minY = minY;
    this.maxY = maxY;
    this.offsetZ = offsetZ;
    this.box = new THREE.Box3(); // world-space result, updated by `update`
  }

  /** Recompute the world-space box from the root's current position. */
  update(root) {
    const p = root.position;
    this.box.min.set(p.x - this.halfWidth, p.y + this.minY, p.z + this.offsetZ - this.halfDepth);
    this.box.max.set(p.x + this.halfWidth, p.y + this.maxY, p.z + this.offsetZ + this.halfDepth);
    return this.box;
  }
}

/** Pure AABB overlap tests (X, Y and Z ranges must all overlap). */
export class CollisionSystem {
  /** @returns {object|null} the first obstacle hit, or null */
  check(playerBox, obstacles) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active || !o.collidable) continue;
      if (playerBox.intersectsBox(o.collider.box)) return o;
    }
    return null;
  }
}
