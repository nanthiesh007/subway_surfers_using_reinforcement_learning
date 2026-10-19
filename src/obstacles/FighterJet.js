import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Obstacle } from './Obstacle.js';
import { rand } from '../utils/math.js';

const mats = {
  body: new THREE.MeshStandardMaterial({ color: 0x7b828a, roughness: 0.45, metalness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c3a52, roughness: 0.1, metalness: 0.9 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffa24a }),
};

// Swept delta wing: shape drawn in (x, -z), extruded for thickness, laid flat.
function makeWingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.3, -1.0); // root leading edge
  s.lineTo(2.9, 1.5); // tip (trailing, swept back)
  s.lineTo(2.9, 1.9);
  s.lineTo(0.3, 1.9); // root trailing edge
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

const geo = {
  fuselage: new THREE.CylinderGeometry(0.42, 0.5, 4.6, 10).rotateX(Math.PI / 2),
  nose: new THREE.ConeGeometry(0.42, 1.5, 10).rotateX(Math.PI / 2),
  wing: makeWingGeometry(),
  fin: new THREE.BoxGeometry(0.07, 1.0, 1.3),
  tailplane: new THREE.BoxGeometry(1.9, 0.06, 0.8),
  canopy: new THREE.SphereGeometry(0.34, 10, 8).scale(0.9, 0.8, 2.2),
  intake: new THREE.BoxGeometry(0.28, 0.3, 1.0),
  nozzle: new THREE.CylinderGeometry(0.26, 0.3, 0.5, 10).rotateX(Math.PI / 2),
  flame: new THREE.ConeGeometry(0.2, 0.9, 8).rotateX(-Math.PI / 2),
};

/** Low-flying airborne obstacle: crouch to pass beneath it. Nose points toward the player (+Z). */
export class FighterJet extends Obstacle {
  constructor() {
    super('jet', CONFIG.jet);
    this.trailTimer = 0;
    this.phase = 0;
  }

  createPlaceholder() {
    const g = new THREE.Group();
    g.name = 'JetPlaceholder';
    const add = (geometry, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    add(geo.fuselage, mats.body, 0, 0, 0);
    add(geo.nose, mats.dark, 0, 0, 3.05);
    add(geo.canopy, mats.glass, 0, 0.38, 1.1);
    add(geo.tailplane, mats.body, 0, 0.0, -2.1);
    for (const side of [-1, 1]) {
      const wing = add(geo.wing, mats.body, 0, -0.05, 0);
      if (side < 0) wing.scale.x = -1;
      add(geo.fin, mats.dark, side * 0.38, 0.62, -1.9).rotation.z = side * -0.25;
      add(geo.intake, mats.dark, side * 0.5, -0.05, 0.9);
      add(geo.nozzle, mats.dark, side * 0.2, 0, -2.45);
      add(geo.flame, mats.glow, side * 0.2, 0, -2.95);
    }
    return g;
  }

  onActivate() {
    this.visual.position.y = CONFIG.jet.altitude;
    this.phase = Math.random() * Math.PI * 2;
    this.trailTimer = 0;
  }

  animate(dt, worldSpeed, ctx) {
    const { swayAmplitude, swayFrequency, bankAmount } = CONFIG.jet;
    const w = this.time * swayFrequency + this.phase;
    // Gentle, predictable weave. Amplitude is far smaller than the collider half-width.
    this.root.position.x = this.baseX + Math.sin(w) * swayAmplitude;
    this.visual.rotation.z = -Math.cos(w) * bankAmount;
    this.visual.position.y = CONFIG.jet.altitude + Math.sin(w * 0.7) * 0.04;

    this.trailTimer -= dt;
    if (ctx?.particles && this.trailTimer <= 0 && this.root.position.z > -110) {
      this.trailTimer = 0.035;
      for (const side of [-1, 1]) {
        ctx.particles.emit({
          x: this.root.position.x + side * 0.2, y: this.visual.position.y, z: this.root.position.z - 3.0,
          vx: rand(-0.2, 0.2), vy: rand(-0.1, 0.2), vz: rand(-3, -1),
          life: rand(0.5, 0.8), size: rand(0.35, 0.6), color: 0xd8d8d8, alpha: 0.25, grow: 1.4,
        });
      }
    }
  }
}
