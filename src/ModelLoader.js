import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from './config.js';

/**
 * Loads and caches GLB/GLTF files. Each URL is downloaded at most once; callers
 * receive independent clones (SkeletonUtils.clone keeps skinned meshes working).
 *
 * Where to put assets (served from /public):
 *   public/models/characters/soldier.glb   - rigged player (animations: Run, Jump, Crouch, Death ...)
 *   public/models/vehicles/tank.glb        - tank obstacle
 *   public/models/vehicles/fighter.glb     - fighter jet obstacle
 *   public/models/environment/*.glb        - optional props
 *
 * Missing files are NOT errors: `load` resolves to null and logs a console warning.
 */
export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map(); // url -> Promise<{scene, animations}|null>
  }

  /** HEAD-check so a Vite dev-server SPA fallback (index.html with 200) isn't mistaken for a model. */
  async exists(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) return false;
      const type = res.headers.get('content-type') || '';
      return !type.includes('text/html');
    } catch {
      return false;
    }
  }

  /**
   * @param {string} path path relative to /public, e.g. 'models/vehicles/tank.glb'
   * @param {(fraction:number)=>void} [onProgress]
   * @returns {Promise<{scene: THREE.Object3D, animations: THREE.AnimationClip[]}|null>}
   */
  load(path, onProgress) {
    if (this.cache.has(path)) return this.cache.get(path);
    const url = assetUrl(path);
    const promise = (async () => {
      if (!(await this.exists(url))) {
        console.warn(`[ModelLoader] ${path} not found - using placeholder geometry.`);
        return null;
      }
      try {
        const gltf = await this.loader.loadAsync(url, (e) => e.lengthComputable && onProgress?.(e.loaded / e.total));
        ModelLoader.prepare(gltf.scene);
        return { scene: gltf.scene, animations: gltf.animations || [] };
      } catch (err) {
        console.warn(`[ModelLoader] Failed to load ${path} - using placeholder geometry.`, err);
        return null;
      }
    })();
    this.cache.set(path, promise);
    return promise;
  }

  /** Independent copy of a loaded entry, safe for skinned meshes. */
  static clone(entry) {
    return { object: cloneSkinned(entry.scene), animations: entry.animations };
  }

  /** Shadows, colour space and frustum-culling safety for every mesh in the model. */
  static prepare(root, { castShadow = true, receiveShadow = true } = {}) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
      if (child.isSkinnedMesh) child.frustumCulled = false; // bounding spheres of skinned meshes are often wrong
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        if (m.transparent) m.depthWrite = false; // keep transparent parts sorting sanely
      }
    });
  }

  /** Apply the config transform (scale / rotation / position) to a container holding an imported model. */
  static applyOffsets(holder, { modelScale = 1, rotationOffset = [0, 0, 0], positionOffset = [0, 0, 0] } = {}) {
    holder.scale.setScalar(modelScale);
    holder.rotation.set(rotationOffset[0], rotationOffset[1], rotationOffset[2]);
    holder.position.set(positionOffset[0], positionOffset[1], positionOffset[2]);
  }
}
