import * as THREE from 'three';
import { CONFIG } from './config.js';
import { propGeometry } from './environment/propGeometry.js';
import { createGroundTexture, createRoadTexture } from './environment/textures.js';
import { rand, randSign } from './utils/math.js';

const GROUND_WIDTH = 222; // 37 tiles of 6 m, keeps the ground texture seamless
const GROUND_TILE = 6;
const SHOULDER_WIDTH = 12; // road mesh width: 9 m asphalt + 2 x 1.5 m gravel

/**
 * Per-kind placement rules. `perSegment` instances of each kind exist for every road segment;
 * `place` returns local data (or null to hide the instance for variety).
 */
function buildPropKinds(roadHalf) {
  const L = CONFIG.environment.segmentLength;
  const z = () => rand(-L / 2, L / 2);
  const side = (min, max) => randSign() * rand(min, max);
  return {
    barrier: { perSegment: 4, place: () => (Math.random() < 0.55 ? { x: side(roadHalf + 0.7, roadHalf + 1.0), z: z(), ry: rand(-0.06, 0.06), s: 1 } : null) },
    crate: { perSegment: 2, place: () => (Math.random() < 0.6 ? { x: side(roadHalf + 1.1, roadHalf + 5), z: z(), ry: rand(0, 6.28), s: rand(0.8, 1.3) } : null) },
    rock: { perSegment: 4, place: () => ({ x: side(roadHalf + 1.5, 16), z: z(), ry: rand(0, 6.28), s: rand(0.6, 2.2) }) },
    tree: { perSegment: 9, place: () => ({ x: side(roadHalf + 3.5, 42), z: z(), ry: rand(0, 6.28), s: rand(0.8, 1.7) }) },
    lamp: {
      perSegment: 1,
      place: () => {
        if (Math.random() < 0.3) return null;
        const sx = randSign();
        // arm points toward the road; some lamps are bent over
        return { x: sx * (roadHalf + 1.2), z: z(), ry: sx > 0 ? Math.PI : 0, s: 1, tilt: rand(-0.22, 0.22) };
      },
    },
    building: { perSegment: 2, place: () => ({ x: side(26, 44), z: z(), ry: rand(-0.1, 0.1), s: rand(0.8, 1.4), sy: rand(0.6, 2.1) }) },
    wreck: { perSegment: 1, place: () => (Math.random() < 0.5 ? { x: side(roadHalf + 1.6, roadHalf + 6), z: z(), ry: rand(0, 6.28), s: 1 } : null) },
  };
}

/**
 * Endless scenery: road/ground segments that scroll toward the camera and are recycled,
 * plus InstancedMesh props (one draw call per prop kind). Also owns lights, fog and sky.
 */
export class Environment {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    const env = CONFIG.environment;
    this.segmentLength = env.segmentLength;
    this.segmentCount = env.segmentCount;
    this.roadHalf = env.roadWidth / 2;

    this._setupAtmosphere();
    this._setupSegments();
    this._setupProps();
    this.reset();
  }

  // ---------- atmosphere ----------

  _setupAtmosphere() {
    const { scene } = this;
    const env = CONFIG.environment;
    const fogColor = new THREE.Color(env.fogColor);
    scene.fog = new THREE.Fog(fogColor, env.fogNear, env.fogFar);
    scene.background = fogColor.clone();

    // Gradient sky dome (replace with a skybox / HDR later: scene.background = cubeTexture).
    const skyGeo = new THREE.SphereGeometry(500, 24, 14);
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x5f84ad);
    const mid = new THREE.Color(0x9fb0b8);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 500);
      if (t < 0.35) c.copy(fogColor).lerp(mid, t / 0.35);
      else c.copy(mid).lerp(top, Math.min(1, (t - 0.35) / 0.65));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Lighting: soft sky/ground fill + a warm low sun that casts the shadows.
    scene.add(new THREE.HemisphereLight(0xcfdcee, 0x5a4e3a, 1.35));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.8);
    sun.position.set(-14, 24, 6);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    const size = CONFIG.settings.shadowMapSize;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -22; cam.right = 22; cam.top = 30; cam.bottom = -30; cam.near = 1; cam.far = 80;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
  }

  // ---------- road + ground ----------

  _setupSegments() {
    const L = this.segmentLength;
    const groundTex = createGroundTexture();
    groundTex.repeat.set(GROUND_WIDTH / GROUND_TILE, L / GROUND_TILE);
    const roadTex = createRoadTexture({ widthM: SHOULDER_WIDTH, lengthM: L, roadWidthM: CONFIG.environment.roadWidth });

    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0 });
    const groundGeo = new THREE.PlaneGeometry(GROUND_WIDTH, L).rotateX(-Math.PI / 2);
    const roadGeo = new THREE.PlaneGeometry(SHOULDER_WIDTH, L).rotateX(-Math.PI / 2);

    this.segments = [];
    for (let i = 0; i < this.segmentCount; i++) {
      const group = new THREE.Group();
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.receiveShadow = true;
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.y = 0.02;
      road.receiveShadow = true;
      group.add(ground, road);
      this.scene.add(group);
      this.segments.push({ group, z: 0 });
    }
  }

  // ---------- props ----------

  _setupProps() {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true });
    this.propKinds = buildPropKinds(this.roadHalf);
    this.props = [];
    for (const [name, kind] of Object.entries(this.propKinds)) {
      const count = kind.perSegment * this.segmentCount;
      const mesh = new THREE.InstancedMesh(propGeometry[name](), material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances span the whole scrolling world
      mesh.castShadow = name === 'barrier' || name === 'crate' || name === 'wreck';
      mesh.name = `props:${name}`;
      this.scene.add(mesh);
      kind.mesh = mesh;
      kind.data = new Array(count).fill(null);
    }
    this._dummy = new THREE.Object3D();
  }

  _randomizeSegmentProps(segIndex) {
    for (const kind of Object.values(this.propKinds)) {
      for (let i = 0; i < kind.perSegment; i++) kind.data[segIndex * kind.perSegment + i] = kind.place();
    }
  }

  _writeInstances() {
    const d = this._dummy;
    for (const kind of Object.values(this.propKinds)) {
      const { mesh, perSegment, data } = kind;
      for (let s = 0; s < this.segmentCount; s++) {
        const segZ = this.segments[s].z;
        for (let i = 0; i < perSegment; i++) {
          const idx = s * perSegment + i;
          const p = data[idx];
          if (!p) {
            d.position.set(0, -50, 0);
            d.scale.setScalar(0.0001);
          } else {
            d.position.set(p.x, 0, segZ + p.z);
            d.rotation.set(0, p.ry, p.tilt || 0);
            d.scale.set(p.s, p.sy ?? p.s, p.s);
          }
          d.updateMatrix();
          mesh.setMatrixAt(idx, d.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- lifecycle ----------

  reset() {
    const L = this.segmentLength;
    this.segments.forEach((seg, i) => {
      seg.z = L - i * L; // first segment centred just behind the camera
      seg.group.position.z = seg.z;
      this._randomizeSegmentProps(i);
    });
    this._writeInstances();
  }

  update(dt, worldSpeed) {
    const L = this.segmentLength;
    const recycleZ = L * 1.1; // rear edge safely behind the camera
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.z += worldSpeed * dt;
      if (seg.z > recycleZ) {
        seg.z -= this.segmentCount * L;
        this._randomizeSegmentProps(i);
      }
      seg.group.position.z = seg.z;
    }
    this._writeInstances();
  }

  /** Keep the sky centred on the camera so the horizon never moves. */
  followCamera() {
    this.sky.position.copy(this.camera.position);
  }
}
