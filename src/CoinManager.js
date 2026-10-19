import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand } from './utils/math.js';

const COIN_COLOR = 0xffc928;

/**
 * Coin lines and jump arcs in the three lanes. One InstancedMesh holds every coin (one draw call);
 * coins travel with the road, spin, and are collected when the player's box touches them.
 * Coins that would sit inside a tank / train are hidden until they have passed it, and jump-arc
 * coins stay visible because they are above the obstacle.
 */
export class CoinManager {
  constructor(scene, bus, difficulty, obstacles, player) {
    this.bus = bus;
    this.difficulty = difficulty;
    this.obstacles = obstacles;
    this.player = player;
    this.timer = 0;

    const n = CONFIG.coins.poolSize;
    const geometry = new THREE.CylinderGeometry(CONFIG.coins.radius, CONFIG.coins.radius, 0.1, 18).rotateX(Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: COIN_COLOR, emissive: 0x7a5200, roughness: 0.25, metalness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geometry, material, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.coins = Array.from({ length: n }, () => ({ active: false, x: 0, y: 0, z: 0, lane: 1, hidden: false }));
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._box = new THREE.Box3();
    this.reset();
  }

  reset() {
    for (const c of this.coins) c.active = false;
    for (let i = 0; i < this.coins.length; i++) this.mesh.setMatrixAt(i, this._zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.timer = 2.2;
    this.spin = 0;
  }

  update(dt, worldSpeed, ctx) {
    this.timer -= dt;
    if (this.timer <= 0) this._spawnLine();

    this.spin += dt * 4;
    const r = CONFIG.coins.radius;
    const pBox = this.player.box;
    this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.spin);

    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      c.z += worldSpeed * dt;
      if (c.z > CONFIG.world.despawnZ) {
        c.active = false;
        this.mesh.setMatrixAt(i, this._zero);
        continue;
      }
      c.hidden = this._insideObstacle(c);
      if (c.hidden) {
        this.mesh.setMatrixAt(i, this._zero);
        continue;
      }
      this._box.min.set(c.x - r, c.y - r, c.z - r);
      this._box.max.set(c.x + r, c.y + r, c.z + r);
      if (this.player.alive && pBox.intersectsBox(this._box)) {
        c.active = false;
        this.mesh.setMatrixAt(i, this._zero);
        this.bus.emit('coin:collect', c);
        ctx?.particles?.burst?.(c.x, c.y, c.z, COIN_COLOR);
        continue;
      }
      this._p.set(c.x, c.y, c.z);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _insideObstacle(c) {
    for (const o of this.obstacles.active) {
      if (o.type === 'jet' || o.lane !== c.lane) continue;
      const col = o.collider;
      const z = o.root.position.z + col.offsetZ;
      if (Math.abs(c.z - z) < col.halfDepth + 0.7 && c.y < col.maxY + 0.3) return true;
    }
    return false;
  }

  _spawnLine() {
    const cfg = CONFIG.coins;
    this.timer = rand(cfg.intervalRange[0], cfg.intervalRange[1]);
    if (Math.random() > this.difficulty.preset.coinChance) return;

    const count = Math.round(rand(cfg.countRange[0], cfg.countRange[1]));
    const lane = Math.floor(Math.random() * CONFIG.lanes.count);
    const arc = Math.random() < cfg.arcChance;
    const x = this.obstacles.laneX(lane);
    const z0 = -CONFIG.world.spawnDistance;

    // Don't stack a new line on top of the previous one still near the spawn point.
    for (const c of this.coins) if (c.active && c.lane === lane && c.z < z0 + count * cfg.spacing + 4) return;

    for (let k = 0; k < count; k++) {
      const c = this.coins.find((q) => !q.active);
      if (!c) return;
      c.active = true;
      c.lane = lane;
      c.x = x;
      c.z = z0 - k * cfg.spacing;
      c.y = cfg.height + (arc ? Math.sin((k / (count - 1)) * Math.PI) * cfg.arcHeight : 0);
    }
  }
}
