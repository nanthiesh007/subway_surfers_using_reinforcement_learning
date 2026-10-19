import * as THREE from 'three';

/**
 * Animation state machine shared by the placeholder rig and GLB characters.
 *
 * States: idle, run, jump, fall, land, crouch, crouchRun, death.
 * - Placeholder mode: the procedural rig poses itself every frame.
 * - Mixer mode: clips are found by (case-insensitive) name keywords, so the GLB does not
 *   need exact names like "Run". Missing clips fall back along FALLBACKS and finally to
 *   "do nothing" - the controller never throws because a clip is absent.
 */

const KEYWORDS = {
  idle: ['idle', 'stand'],
  run: ['run', 'sprint', 'jog'],
  jump: ['jump', 'leap', 'hop'],
  fall: ['fall', 'airborne', 'inair'],
  land: ['land'],
  crouch: ['crouch', 'duck', 'squat', 'slide'],
  crouchRun: ['crouchrun', 'crouch_run', 'crouch run', 'crouchwalk', 'crouch_walk', 'sneak', 'crawl'],
  death: ['death', 'die', 'dead', 'knockout'],
};

const FALLBACKS = {
  idle: ['run'],
  run: ['idle'],
  jump: ['run'],
  fall: ['jump', 'run'],
  land: ['run'],
  crouch: ['crouchRun', 'run'],
  crouchRun: ['crouch', 'run'],
  death: ['idle'],
};

const ONE_SHOT = new Set(['jump', 'land', 'death']);

/** Find a clip whose name contains one of the keywords. */
export function findClip(clips, state) {
  const words = KEYWORDS[state] || [];
  const isCrouchState = state === 'crouch' || state === 'crouchRun';
  // "CrouchRun" must never be mistaken for the plain Run clip (and vice versa for Idle etc.).
  const lowered = clips
    .map((c) => ({ clip: c, name: c.name.toLowerCase() }))
    .filter((c) => isCrouchState || !/crouch|duck|squat/.test(c.name));
  for (const word of words) {
    let hit = lowered.find((c) => c.name.includes(word));
    // plain "crouch" should not grab "CrouchRun" if a dedicated crouch clip exists
    if (state === 'crouch') hit = lowered.find((c) => c.name.includes(word) && !c.name.includes('run') && !c.name.includes('walk')) || hit;
    if (hit) return hit.clip;
  }
  return null;
}

export class AnimationController {
  constructor({ fadeTime = 0.15, jumpDuration = 0.75 } = {}) {
    this.fadeTime = fadeTime;
    this.jumpDuration = jumpDuration;
    this.state = null;
    this.mode = 'none'; // 'placeholder' | 'mixer'
    this.rig = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.frozen = false;
    this.time = 0;
  }

  usePlaceholder(rig) {
    this.rig = rig;
    this.mixer = null;
    this.mode = 'placeholder';
    this.state = null;
  }

  useMixer(root, clips) {
    this.mixer?.stopAllAction();
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.current = null;
    this.frozen = false;
    this.mode = 'mixer';
    this.state = null;

    const byClip = new Map();
    const actionFor = (clip, state) => {
      if (!byClip.has(clip)) {
        const a = this.mixer.clipAction(clip);
        if (ONE_SHOT.has(state)) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        byClip.set(clip, a);
      }
      return byClip.get(clip);
    };

    for (const state of Object.keys(KEYWORDS)) {
      const clip = this._resolveClip(clips, state, new Set());
      if (clip) this.actions[state] = actionFor(clip, state);
    }
    if (!Object.keys(this.actions).length) console.warn('[Animation] GLB has no recognizable clips; character will be static.');
  }

  _resolveClip(clips, state, seen) {
    if (seen.has(state)) return null;
    seen.add(state);
    const direct = findClip(clips, state);
    if (direct) return direct;
    for (const alt of FALLBACKS[state] || []) {
      const c = this._resolveClip(clips, alt, seen);
      if (c) return c;
    }
    return null;
  }

  setState(state) {
    if (state === this.state) return;
    const previous = this.state;
    this.state = state;
    if (this.mode !== 'mixer') return;

    const next = this.actions[state];
    if (!next) {
      if (state === 'death') this.frozen = true; // no death clip: hold the last pose
      return;
    }
    this.frozen = false;
    if (next === this.current) return;

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.timeScale = 1;
    // With no dedicated Fall clip, stretch Jump over the whole airtime.
    if (state === 'jump' && this.actions.fall === next) next.timeScale = next.getClip().duration / this.jumpDuration;
    next.play();
    if (this.current) this.current.crossFadeTo(next, previous === 'death' ? 0.05 : this.fadeTime, false);
    else next.fadeIn(this.fadeTime);
    this.current = next;
  }

  /** @param {{phase:number, runScale:number}} ctx */
  update(dt, ctx) {
    this.time += dt;
    if (this.mode === 'placeholder') {
      this.rig.update(this.state || 'idle', this.time, ctx.phase, dt);
    } else if (this.mode === 'mixer' && !this.frozen) {
      const run = this.actions.run;
      if (run && this.current === run) run.timeScale = ctx.runScale;
      this.mixer.update(dt);
    }
  }
}
