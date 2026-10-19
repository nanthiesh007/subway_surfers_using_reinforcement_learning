import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Development-only helpers (enabled with ?debug=1): collider wireframes, FPS, speed/spawn info.
 * Nothing here is instantiated in normal play.
 */
export class DebugOverlay {
  constructor(scene, ui) {
    this.scene = scene;
    this.ui = ui;
    this.helpers = new Map(); // object -> Box3Helper
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.playerHelper = null;
  }

  _helperFor(owner, box, color) {
    let h = this.helpers.get(owner);
    if (!h) {
      h = new THREE.Box3Helper(box, color);
      this.scene.add(h);
      this.helpers.set(owner, h);
    }
    return h;
  }

  update(dt, game) {
    // collider boxes
    this._helperFor(game.player, game.player.box, 0x00ff66).visible = true;
    const seen = new Set([game.player]);
    for (const o of game.obstacles.active) {
      const h = this._helperFor(o, o.collider.box, o.type === 'jet' ? 0xff4444 : 0xffaa00);
      h.visible = true;
      seen.add(o);
    }
    for (const [owner, h] of this.helpers) if (!seen.has(owner)) h.visible = false;

    // text panel
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      const d = game.difficulty;
      const info = game.renderer.info.render;
      this.ui.setDebugText(
        `FPS ${this.fps}   draws ${info.calls}   tris ${info.triangles}\n` +
        `state ${game.state}\n` +
        `speed ${d.speed.toFixed(1)} m/s   difficulty ${d.level.toFixed(2)}${CONFIG.debug.freezeDifficulty ? ' (FROZEN)' : ''}\n` +
        `next spawn ${Math.max(0, game.obstacles.spawnTimer).toFixed(2)}s   active ${game.obstacles.active.length}\n` +
        `player y ${game.player.root.position.y.toFixed(2)}  h ${game.player.height.toFixed(2)}  grounded ${game.player.grounded}\n` +
        `[F] freeze difficulty`,
      );
    }
  }
}
