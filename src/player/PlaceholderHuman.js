import * as THREE from 'three';
import { damp } from '../utils/math.js';

/**
 * Procedural low-poly soldier built from boxes. Limb pivots sit at the joints so
 * sinusoidal rotations look like a real run cycle.
 *
 * Convention: the character faces -Z. Positive rotation.x on a limb swings it
 * forward (toward -Z); a knee/elbow bend is a negative (knee) / positive (elbow) value.
 */

const POSES = {
  idle: (t, phase) => ({ hipsY: 0.9, lean: 0.03 + Math.sin(t * 2) * 0.01, lThigh: 0, lShin: 0, rThigh: 0, rShin: 0, lArm: 0.05, rArm: 0.05, lFore: 0.3, rFore: 0.3, pitch: 0, rate: 12 }),
  run: (t, phase) => {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    return {
      hipsY: 0.84 + 0.06 * Math.abs(c),
      lean: 0.22,
      lThigh: s * 0.95 + 0.1,
      rThigh: -s * 0.95 + 0.1,
      lShin: -(0.3 + 0.9 * Math.max(0, c)),
      rShin: -(0.3 + 0.9 * Math.max(0, -c)),
      lArm: -s * 0.95,
      rArm: s * 0.95,
      lFore: 1.3,
      rFore: 1.3,
      pitch: 0,
      rate: 28,
    };
  },
  jump: () => ({ hipsY: 0.9, lean: 0.1, lThigh: 1.1, lShin: -1.3, rThigh: -0.35, rShin: -0.9, lArm: 2.3, rArm: 2.3, lFore: 0.3, rFore: 0.3, pitch: 0, rate: 16 }),
  fall: () => ({ hipsY: 0.9, lean: 0.05, lThigh: 0.55, lShin: -0.5, rThigh: 0.15, rShin: -0.45, lArm: 1.5, rArm: 1.2, lFore: 0.4, rFore: 0.4, pitch: 0, rate: 12 }),
  land: () => ({ hipsY: 0.68, lean: 0.45, lThigh: 0.85, rThigh: 0.85, lShin: -1.5, rShin: -1.5, lArm: 0.5, rArm: 0.5, lFore: 0.9, rFore: 0.9, pitch: 0, rate: 22 }),
  crouch: () => ({ hipsY: 0.6, lean: 0.6, lThigh: 1.0, rThigh: 1.0, lShin: -1.8, rShin: -1.8, lArm: 0.6, rArm: 0.6, lFore: 1.2, rFore: 1.2, pitch: 0, rate: 20 }),
  crouchRun: (t, phase) => {
    const s = Math.sin(phase);
    return {
      hipsY: 0.6 + 0.02 * Math.abs(Math.cos(phase)),
      lean: 0.6,
      lThigh: 1.0 + s * 0.3,
      rThigh: 1.0 - s * 0.3,
      lShin: -1.8 - s * 0.2,
      rShin: -1.8 + s * 0.2,
      lArm: 0.6 - s * 0.5,
      rArm: 0.6 + s * 0.5,
      lFore: 1.2,
      rFore: 1.2,
      pitch: 0,
      rate: 24,
    };
  },
  death: () => ({ hipsY: 0.55, lean: 0, lThigh: 0.3, rThigh: -0.1, lShin: -0.6, rShin: -0.2, lArm: 1.2, rArm: 0.7, lFore: 0.2, rFore: 0.3, pitch: 1.5, rate: 9 }),
};

const FIELDS = ['hipsY', 'lean', 'lThigh', 'lShin', 'rThigh', 'rShin', 'lArm', 'rArm', 'lFore', 'rFore', 'pitch'];

export class PlaceholderHuman {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'PlaceholderHuman';
    this.current = { ...POSES.idle(0, 0) };
    this._build();
    this.apply();
  }

  _build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2a07a, roughness: 0.8 });
    const fatigue = new THREE.MeshStandardMaterial({ color: 0x4f5a34, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2e3523, roughness: 0.9 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.8 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0x3d4727, roughness: 0.6 });
    const pack = new THREE.MeshStandardMaterial({ color: 0x6b5a3c, roughness: 0.9 });

    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    this.hips = new THREE.Group();
    this.root.add(this.hips);
    this.hips.add(box(0.36, 0.2, 0.22, dark, 0, 0.02, 0)); // pelvis

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.torso.add(box(0.44, 0.55, 0.26, fatigue, 0, 0.3, 0));
    this.torso.add(box(0.4, 0.4, 0.14, pack, 0, 0.35, 0.2)); // backpack (character faces -Z)
    this.torso.add(box(0.2, 0.08, 0.2, skin, 0, 0.62, 0)); // neck
    this.torso.add(box(0.24, 0.26, 0.24, skin, 0, 0.78, 0)); // head
    this.torso.add(box(0.28, 0.12, 0.28, helmet, 0, 0.9, 0)); // helmet
    this.torso.add(box(0.3, 0.04, 0.34, helmet, 0, 0.85, -0.03)); // helmet brim

    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.52, 0);
      shoulder.add(box(0.14, 0.32, 0.15, fatigue, 0, -0.14, 0));
      const forearm = new THREE.Group();
      forearm.position.set(0, -0.3, 0);
      forearm.add(box(0.12, 0.28, 0.13, skin, 0, -0.13, 0));
      forearm.add(box(0.1, 0.1, 0.1, dark, 0, -0.3, 0)); // glove
      shoulder.add(forearm);
      this.torso.add(shoulder);
      return { shoulder, forearm };
    });

    this.legs = [-1, 1].map((side) => {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.12, -0.04, 0);
      thigh.add(box(0.18, 0.46, 0.2, dark, 0, -0.22, 0));
      const shin = new THREE.Group();
      shin.position.set(0, -0.45, 0);
      shin.add(box(0.15, 0.44, 0.17, dark, 0, -0.21, 0));
      shin.add(box(0.17, 0.12, 0.3, boot, 0, -0.44, -0.06)); // boot
      thigh.add(shin);
      this.hips.add(thigh);
      return { thigh, shin };
    });
  }

  /**
   * @param {string} state animation state name
   * @param {number} time  total elapsed seconds
   * @param {number} phase run-cycle phase in radians
   */
  update(state, time, phase, dt) {
    const target = (POSES[state] || POSES.run)(time, phase);
    const k = damp(target.rate, dt);
    for (const f of FIELDS) this.current[f] += (target[f] - this.current[f]) * k;
    this.apply();
  }

  apply() {
    const p = this.current;
    this.hips.position.y = p.hipsY;
    this.torso.rotation.x = p.lean;
    this.root.rotation.x = p.pitch;
    this.legs[0].thigh.rotation.x = p.lThigh;
    this.legs[0].shin.rotation.x = p.lShin;
    this.legs[1].thigh.rotation.x = p.rThigh;
    this.legs[1].shin.rotation.x = p.rShin;
    this.arms[0].shoulder.rotation.x = p.lArm;
    this.arms[0].forearm.rotation.x = p.lFore;
    this.arms[1].shoulder.rotation.x = p.rArm;
    this.arms[1].forearm.rotation.x = p.rFore;
  }
}
