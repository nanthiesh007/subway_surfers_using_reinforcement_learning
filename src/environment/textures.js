import * as THREE from 'three';
import { rand } from '../utils/math.js';

/** Procedural canvas textures so the game needs no image assets to look decent. */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Draw `fn` at (x, y) and at the wrapped offsets so tiles are seamless. */
function wrapDraw(size, x, y, fn) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(x + dx, y + dy);
}

/** 6 m x 6 m tile of dry, trampled grass and dirt. */
export function createGroundTexture() {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#5a5a38';
  ctx.fillRect(0, 0, size, size);
  const palette = ['#4d4f31', '#666238', '#6f6746', '#43472c', '#7a6e4c', '#585a36'];
  for (let i = 0; i < 1400; i++) {
    const x = rand(0, size);
    const y = rand(0, size);
    const r = rand(1.5, 7);
    ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
    ctx.globalAlpha = rand(0.2, 0.6);
    wrapDraw(size, x, y, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * rand(0.5, 1), rand(0, 3), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#3a3d24';
  for (let i = 0; i < 260; i++) {
    const x = rand(0, size);
    const y = rand(0, size);
    ctx.lineWidth = 1;
    wrapDraw(size, x, y, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + rand(-3, 3), py - rand(3, 9)); // grass blades
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, { repeat: true });
}

/**
 * Road texture for one segment. Canvas is 12 m wide (9 m asphalt + 1.5 m gravel shoulders)
 * by 36 m long at 32 px/m, painted so the pattern repeats exactly along the length.
 */
export function createRoadTexture({ widthM = 12, lengthM = 36, roadWidthM = 9 } = {}) {
  const ppm = 32;
  const W = widthM * ppm;
  const H = lengthM * ppm;
  const [canvas, ctx] = makeCanvas(W, H);
  const roadX0 = ((widthM - roadWidthM) / 2) * ppm;
  const roadX1 = roadX0 + roadWidthM * ppm;

  // gravel shoulders
  ctx.fillStyle = '#6a5f4b';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#7d725c' : '#564d3b';
    ctx.globalAlpha = rand(0.3, 0.7);
    ctx.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3));
  }
  ctx.globalAlpha = 1;

  // asphalt
  ctx.fillStyle = '#2d2f31';
  ctx.fillRect(roadX0, 0, roadX1 - roadX0, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#3b3d40' : '#222426';
    ctx.globalAlpha = rand(0.25, 0.7);
    ctx.fillRect(rand(roadX0, roadX1), rand(0, H), rand(1, 2.5), rand(1, 2.5));
  }
  // patched repairs
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = Math.random() < 0.5 ? '#26282a' : '#383a3d';
    ctx.fillRect(rand(roadX0, roadX1 - 90), rand(0, H - 160), rand(40, 120), rand(60, 200));
  }
  // tyre wear in the wheel paths
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#17181a';
  const cx = W / 2;
  for (const lane of [-3 * ppm, 0, 3 * ppm]) {
    ctx.fillRect(cx + lane - 30, 0, 22, H);
    ctx.fillRect(cx + lane + 8, 0, 22, H);
  }
  ctx.globalAlpha = 1;

  // cracks
  ctx.strokeStyle = '#141516';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 16; i++) {
    let x = rand(roadX0 + 10, roadX1 - 10);
    let y = rand(20, H - 120);
    ctx.globalAlpha = rand(0.5, 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      x += rand(-14, 14);
      y += rand(6, 24);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // edge lines (worn)
  ctx.fillStyle = '#d9d6c4';
  for (const lx of [roadX0 + 12, roadX1 - 18]) {
    for (let y = 0; y < H; y += 48) {
      ctx.globalAlpha = Math.random() < 0.12 ? 0.25 : rand(0.7, 0.95);
      ctx.fillRect(lx, y, 6, 48);
    }
  }
  // centre dashes: 3 m dash / 3 m gap, symmetric about the tile ends
  ctx.fillStyle = '#e4d9a0';
  // two lane dividers (3 lanes of 3 m): at +/- 1.5 m from the centre
  for (const lx of [cx - 1.5 * ppm, cx + 1.5 * ppm]) {
    for (let y = 48; y < H; y += 192) {
      ctx.globalAlpha = rand(0.75, 0.95);
      ctx.fillRect(lx - 3, y, 6, 96);
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}
