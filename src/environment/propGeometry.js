import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly decoration geometry. Each prop is several primitives merged into ONE geometry with
 * vertex colours, so a whole prop kind renders as a single InstancedMesh draw call.
 */

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();

function part(geometry, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return { geometry, color, matrix: m4.clone().compose(new THREE.Vector3(x, y, z), q.clone().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)) };
}

function merge(parts) {
  const geos = parts.map(({ geometry, color, matrix }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // slight per-face shade variation keeps flat low-poly surfaces from looking dead
      const shade = 0.92 + ((i / 3) | 0) % 3 * 0.04;
      arr[i * 3] = c.r * shade;
      arr[i * 3 + 1] = c.g * shade;
      arr[i * 3 + 2] = c.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg);

export const propGeometry = {
  /** Concrete jersey barrier, long axis along Z. */
  barrier: () => merge([
    part(box(0.7, 0.35, 2.4), 0x8e8c85, 0, 0.175, 0),
    part(box(0.45, 0.5, 2.4), 0x9a978f, 0, 0.6, 0),
    part(box(0.47, 0.12, 0.7), 0xb04a38, 0, 0.75, 0.8), // warning stripe
  ]),

  crate: () => merge([
    part(box(1.0, 1.0, 1.0), 0x6d5a3a, 0, 0.5, 0),
    part(box(1.02, 0.12, 1.02), 0x57472d, 0, 0.12, 0),
    part(box(1.02, 0.12, 1.02), 0x57472d, 0, 0.88, 0),
    part(box(0.7, 0.7, 0.7), 0x5e6a3e, 0.15, 1.35, 0.1, 0, 0.5, 0),
  ]),

  rock: () => merge([
    part(new THREE.IcosahedronGeometry(0.8, 0).scale(1.2, 0.7, 1), 0x6b6a63, 0, 0.3, 0),
    part(new THREE.IcosahedronGeometry(0.45, 0), 0x77756c, 0.9, 0.15, 0.3),
  ]),

  /** Pine tree (trunk + two cones). */
  tree: () => merge([
    part(cyl(0.14, 0.2, 2.0, 6), 0x4a3826, 0, 1.0, 0),
    part(cone(1.25, 2.4), 0x2f4a2a, 0, 2.7, 0),
    part(cone(0.95, 1.9), 0x37562f, 0, 3.8, 0),
  ]),

  /** Damaged streetlight; arm points toward +X (the road, for a left-side lamp). */
  lamp: () => merge([
    part(cyl(0.09, 0.14, 5.6, 6), 0x55595a, 0, 2.8, 0),
    part(box(1.6, 0.1, 0.1), 0x55595a, 0.75, 5.55, 0, 0, 0, -0.08),
    part(box(0.5, 0.12, 0.25), 0x2a2c2d, 1.45, 5.45, 0),
    part(box(0.6, 0.45, 0.6), 0x3b3d3e, 0, 0.22, 0),
  ]),

  /** Ruined block of flats with dark window openings on both X faces. */
  building: () => {
    const parts = [
      part(box(8, 10, 9), 0x7b766a, 0, 5, 0),
      part(box(8.4, 0.5, 9.4), 0x5b5850, 0, 10.2, 0),
      part(box(3, 1.5, 3), 0x6a665c, -1.5, 11, 1), // broken rooftop block
    ];
    for (const face of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const lit = (row * 3 + col) % 4 === 0;
          parts.push(part(box(0.1, 1.3, 1.2), lit ? 0x514a3d : 0x24272a, face * 4.02, 2.2 + row * 2.8, -3 + col * 3));
        }
      }
    }
    return merge(parts);
  },

  /** Burnt-out car. */
  wreck: () => merge([
    part(box(1.9, 0.7, 4.2), 0x2f2d29, 0, 0.65, 0),
    part(box(1.6, 0.55, 2.0), 0x3a3732, 0, 1.25, -0.2),
    part(box(1.92, 0.08, 1.3), 0x5c3b25, 0, 1.02, 1.5, -0.25, 0, 0), // rusty bonnet, crumpled
    part(cyl(0.38, 0.38, 0.25, 10), 0x141414, 1.0, 0.38, 1.3, 0, 0, Math.PI / 2),
    part(cyl(0.38, 0.38, 0.25, 10), 0x141414, -1.0, 0.38, -1.3, 0, 0, Math.PI / 2),
    part(cyl(0.38, 0.38, 0.25, 10), 0x141414, 1.0, 0.38, -1.3, 0, 0, Math.PI / 2),
  ]),
};
