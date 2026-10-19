import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Obstacle } from './Obstacle.js';

const mats = {
  body: new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.55, metalness: 0.3 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, metalness: 0.2 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.6, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c2f45, roughness: 0.15, metalness: 0.8 }),
  under: new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.9 }),
  light: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
};
const geo = {
  body: new THREE.BoxGeometry(2.3, 2.7, 6.2),
  stripe: new THREE.BoxGeometry(2.34, 0.28, 6.24),
  roof: new THREE.BoxGeometry(2.0, 0.25, 6.0),
  window: new THREE.BoxGeometry(2.36, 0.7, 0.9),
  windscreen: new THREE.BoxGeometry(1.7, 0.9, 0.06),
  under: new THREE.BoxGeometry(2.0, 0.5, 5.8),
  light: new THREE.BoxGeometry(0.28, 0.2, 0.06),
};

/** Tall subway car: cannot be jumped or ducked, so the player has to change lanes. */
export class Train extends Obstacle {
  constructor() {
    super('train', CONFIG.train);
  }

  createPlaceholder() {
    const g = new THREE.Group();
    g.name = 'TrainPlaceholder';
    const add = (geometry, mat, x, y, z) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    add(geo.under, mats.under, 0, 0.25, 0);
    add(geo.body, mats.body, 0, 1.85, 0);
    add(geo.stripe, mats.stripe, 0, 1.0, 0);
    add(geo.roof, mats.roof, 0, 3.3, 0);
    for (let i = 0; i < 3; i++) add(geo.window, mats.glass, 0, 2.35, -2.0 + i * 2.0);
    // Front (+Z, toward the player): windscreen and headlights.
    add(geo.windscreen, mats.glass, 0, 2.4, 3.11);
    add(geo.light, mats.light, -0.7, 1.3, 3.12);
    add(geo.light, mats.light, 0.7, 1.3, 3.12);
    return g;
  }
}
