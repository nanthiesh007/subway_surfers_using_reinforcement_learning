import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand } from './utils/math.js';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, r) * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * One Points object holding a fixed ring buffer of soft round sprites (dust, smoke, sparks,
 * fire). Particles have finite lives and are recycled in place: no allocations at runtime.
 */
export class ParticleSystem {
  constructor(scene, max = 700) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); // remaining
    this.maxLife = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max).fill(1);
    this.alpha0 = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.sizeAttr = new Float32Array(max);
    this.colorAttr = new Float32Array(max * 4);
    this.pos.fill(0).forEach((_, i) => { this.pos[i] = (i % 3 === 1) ? -100 : 0; });

    const geometry = new THREE.BufferGeometry();
    this.posAttribute = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttribute = new THREE.BufferAttribute(this.sizeAttr, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colorAttr, 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.posAttribute);
    geometry.setAttribute('aSize', this.sizeAttribute);
    geometry.setAttribute('aColor', this.colorAttribute);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /** Spawn one particle. `grow` is the size multiplier reached at end of life. */
  emit({ x, y, z, vx = 0, vy = 0, vz = 0, life = 1, size = 1, color = 0xffffff, alpha = 0.5, grow = 1, gravity = 0 }) {
    if (!CONFIG.settings.particles) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.alpha0[i] = alpha;
    this.gravity[i] = gravity;
    this._c.set(color);
    this.rgb[p] = this._c.r; this.rgb[p + 1] = this._c.g; this.rgb[p + 2] = this._c.b;
  }

  /** @param {number} worldSpeed ground scroll speed; particles drift with the world */
  update(dt, worldSpeed, camera, viewportHeight) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(fov / 2));

    for (let i = 0; i < this.max; i++) {
      const p = i * 3;
      if (this.life[i] <= 0) {
        this.sizeAttr[i] = 0;
        this.colorAttr[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(this.life[i], 0) / this.maxLife[i]; // 0 -> 1 across the lifetime
      this.vel[p + 1] += this.gravity[i] * dt;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] = Math.max(0, this.pos[p + 1] + this.vel[p + 1] * dt);
      this.pos[p + 2] += (this.vel[p + 2] + worldSpeed) * dt;

      this.sizeAttr[i] = this.size0[i] * (1 + (this.grow[i] - 1) * t);
      this.colorAttr[i * 4] = this.rgb[p];
      this.colorAttr[i * 4 + 1] = this.rgb[p + 1];
      this.colorAttr[i * 4 + 2] = this.rgb[p + 2];
      this.colorAttr[i * 4 + 3] = this.alpha0[i] * (1 - t) * Math.min(1, t * 8 + 0.3);
    }
    this.posAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.sizeAttr.fill(0);
    this.colorAttr.fill(0);
    this.sizeAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  // ---------- ready-made effects ----------

  footDust(x, z) {
    this.emit({
      x: x + rand(-0.15, 0.15), y: 0.08, z: z + rand(0.1, 0.3),
      vx: rand(-0.4, 0.4), vy: rand(0.3, 0.8), vz: rand(0, 1.2),
      life: rand(0.35, 0.6), size: rand(0.35, 0.6), color: 0x9a8d73, alpha: 0.35, grow: 2,
    });
  }

  /** Small sparkle when a coin is picked up. */
  burst(x, y, z, color = 0xffc928) {
    for (let i = 0; i < 6; i++) {
      this.emit({
        x, y, z,
        vx: rand(-1.8, 1.8), vy: rand(0.5, 2.5), vz: rand(-1.5, 1.5),
        life: rand(0.25, 0.45), size: rand(0.25, 0.4), color, alpha: 0.9, grow: 0.4,
      });
    }
  }

  landingDust(x, z) {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit({
        x, y: 0.05, z,
        vx: Math.cos(a) * rand(1, 2.8), vy: rand(0.2, 0.9), vz: Math.sin(a) * rand(1, 2.8),
        life: rand(0.4, 0.8), size: rand(0.5, 0.9), color: 0x9a8d73, alpha: 0.45, grow: 2.2,
      });
    }
  }

  explosion(x, y, z) {
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2);
      const e = rand(-0.4, 1);
      const sp = rand(2, 9);
      this.emit({
        x, y, z,
        vx: Math.cos(a) * sp * (1 - Math.abs(e) * 0.3), vy: e * sp + 2, vz: Math.sin(a) * sp * (1 - Math.abs(e) * 0.3),
        life: rand(0.35, 0.8), size: rand(0.8, 1.8), color: Math.random() < 0.5 ? 0xff7a1a : 0xffc04a, alpha: 0.9, grow: 1.6,
      });
    }
    for (let i = 0; i < 24; i++) {
      this.emit({
        x: x + rand(-0.5, 0.5), y: y + rand(0, 0.6), z: z + rand(-0.5, 0.5),
        vx: rand(-2, 2), vy: rand(1.5, 4), vz: rand(-2, 2),
        life: rand(1.0, 1.9), size: rand(1.2, 2.2), color: 0x2b2926, alpha: 0.65, grow: 2.6,
      });
    }
    for (let i = 0; i < 36; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(5, 14);
      this.emit({
        x, y, z,
        vx: Math.cos(a) * sp, vy: rand(2, 9), vz: Math.sin(a) * sp,
        life: rand(0.4, 0.9), size: rand(0.12, 0.25), color: 0xffe08a, alpha: 1, grow: 0.4, gravity: -16,
      });
    }
  }
}
