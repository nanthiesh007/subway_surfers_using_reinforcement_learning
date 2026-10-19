import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Obstacle } from './Obstacle.js';
import { rand } from '../utils/math.js';

// Geometries / materials are shared by every tank in the pool.
const mats = {
  hull: new THREE.MeshStandardMaterial({ color: 0x59633a, roughness: 0.85, metalness: 0.1 }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x474f2e, roughness: 0.9, metalness: 0.1 }),
  track: new THREE.MeshStandardMaterial({ color: 0x24241f, roughness: 1 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x3a3a33, roughness: 0.8, metalness: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2f332b, roughness: 0.5, metalness: 0.6 }),
};
const geo = {
  track: new THREE.BoxGeometry(0.7, 0.72, 4.3),
  fender: new THREE.BoxGeometry(0.85, 0.07, 4.35),
  lowerHull: new THREE.BoxGeometry(2.0, 0.42, 4.0),
  upperHull: new THREE.BoxGeometry(1.8, 0.28, 3.3),
  nose: new THREE.BoxGeometry(1.7, 0.26, 0.7),
  turret: new THREE.CylinderGeometry(0.72, 0.9, 0.42, 8),
  mantlet: new THREE.BoxGeometry(0.55, 0.3, 0.45),
  barrel: new THREE.CylinderGeometry(0.075, 0.09, 2.0, 8).rotateX(Math.PI / 2),
  muzzle: new THREE.CylinderGeometry(0.13, 0.13, 0.28, 8).rotateX(Math.PI / 2),
  hatch: new THREE.CylinderGeometry(0.22, 0.22, 0.07, 8),
  wheel: new THREE.CylinderGeometry(0.31, 0.31, 0.1, 10).rotateZ(Math.PI / 2),
  antenna: new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4),
};

/** Primary ground obstacle: jump over it. Barrel points toward the player (+Z). */
export class Tank extends Obstacle {
  constructor() {
    super('tank', CONFIG.tank);
    this.dustTimer = 0;
  }

  createPlaceholder() {
    const g = new THREE.Group();
    g.name = 'TankPlaceholder';
    const add = (geometry, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    this.wheels = [];
    for (const side of [-1, 1]) {
      add(geo.track, mats.track, side * 1.1, 0.36, 0);
      add(geo.fender, mats.hullDark, side * 1.1, 0.78, 0);
      for (let i = 0; i < 6; i++) {
        this.wheels.push(add(geo.wheel, mats.wheel, side * 1.46, 0.33, -1.75 + i * 0.7));
      }
    }
    add(geo.lowerHull, mats.hull, 0, 0.55, 0);
    add(geo.upperHull, mats.hull, 0, 0.9, -0.1);
    add(geo.nose, mats.hullDark, 0, 0.78, 1.75);

    // Turret group allows an idle sway without touching the hull.
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.12, -0.2);
    g.add(this.turret);
    add(geo.turret, mats.hull, 0, 0.1, 0, this.turret);
    add(geo.mantlet, mats.hullDark, 0, 0.12, 0.8, this.turret);
    add(geo.barrel, mats.metal, 0, 0.12, 1.85, this.turret);
    add(geo.muzzle, mats.metal, 0, 0.12, 2.75, this.turret);
    add(geo.hatch, mats.hullDark, -0.25, 0.3, -0.2, this.turret);
    add(geo.antenna, mats.metal, 0.5, 0.6, -0.55, this.turret);
    return g;
  }

  onActivate() {
    this.dustTimer = 0;
    this.turret.rotation.y = 0;
  }

  animate(dt, worldSpeed, ctx) {
    // Wheels spin with ground speed (r = 0.31).
    const spin = (worldSpeed * this.speedMultiplier * dt) / 0.31;
    for (const w of this.wheels) w.rotation.x += spin;
    this.turret.rotation.y = Math.sin(this.time * 0.9) * 0.05;
    this.root.position.y = Math.sin(this.time * 17) * 0.008; // engine vibration

    // Dust kicked up behind the tracks while it is on screen.
    this.dustTimer -= dt;
    if (ctx?.particles && this.dustTimer <= 0 && this.root.position.z > -90) {
      this.dustTimer = 0.07;
      const z = this.root.position.z - 2.0;
      for (const side of [-1, 1]) {
        ctx.particles.emit({
          x: this.root.position.x + side * 1.1, y: 0.15, z,
          vx: rand(-0.4, 0.4), vy: rand(0.5, 1.2), vz: rand(-1, 0),
          life: rand(0.6, 1.0), size: rand(0.7, 1.2), color: 0x8c7f66, alpha: 0.35, grow: 1.6,
        });
      }
    }
  }
}
