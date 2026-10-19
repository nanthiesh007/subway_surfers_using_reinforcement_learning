export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

/** Frame-rate independent smoothing factor: use as lerp(a, b, damp(k, dt)). */
export const damp = (k, dt) => 1 - Math.exp(-k * dt);

export const padScore = (n, digits = 5) => String(Math.max(0, Math.floor(n))).padStart(digits, '0');
