// @ts-check
// Idle backdrop: drifting particles, a slow ring of dots that reads as the globe, and Benjo.
// One fillRect per particle, no shadows or gradients, so it stays cheap on phones.
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {import('../contracts').ParticleSettings} ParticleSettings */
/** @typedef {import('../contracts').Size} Size */
/** @typedef {{ x: number, y: number, size: number, speed: number, phase: number, alt: boolean }} Particle */

import { drawSprite } from './sprite.js';

const REFERENCE_AREA = 1440 * 900;
const MOBILE_WIDTH = 480;
const RING_DOTS = 72;
const RING_RADIUS_VMIN = 0.36;
const RING_DEGREES_PER_SECOND = 2;
const BENJO_PX = 48;
const BENJO_ALPHA = 0.7;
const ALT_SHARE = 0.1;
const MAX_DT = 0.1;

/**
 * Particle count for a viewport: scaled by area and halved on narrow screens.
 * @param {number} base
 * @param {Size} size
 */
export function particleCount(base, size) {
  const scale = Math.min(Math.max((size.width * size.height) / REFERENCE_AREA, 0.35), 1.5);
  const count = Math.round(base * scale);
  return size.width < MOBILE_WIDTH ? Math.round(count / 2) : count;
}

/**
 * @param {ParticleSettings} settings
 * @param {Size} size
 * @param {() => number} random
 * @param {boolean} withAlt some particles use the hazard color on holiday packs
 * @returns {Particle[]}
 */
export function createParticles(settings, size, random, withAlt) {
  const between = (/** @type {[number, number]} */ [min, max]) => min + random() * (max - min);
  return Array.from({ length: particleCount(settings.count, size) }, () => ({
    x: random() * size.width,
    y: random() * size.height,
    size: between(settings.size),
    speed: between(settings.speed),
    phase: random() * Math.PI * 2,
    alt: withAlt && random() < ALT_SHARE,
  }));
}

/**
 * Move particles in place (the array is reused every frame) and wrap at the edges.
 * @param {Particle[]} particles
 * @param {ParticleSettings['drift']} drift
 * @param {Size} size
 * @param {number} dt seconds
 */
export function stepParticles(particles, drift, size, dt) {
  if (drift === 'none') return;
  const dx = drift === 'left' ? -1 : drift === 'right' ? 1 : 0;
  const dy = drift === 'up' ? -1 : drift === 'down' ? 1 : 0;
  for (const p of particles) {
    p.x += dx * p.speed * dt;
    p.y += dy * p.speed * dt;
    if (p.x < -4) p.x += size.width + 8;
    else if (p.x > size.width + 4) p.x -= size.width + 8;
    if (p.y < -4) p.y += size.height + 8;
    else if (p.y > size.height + 4) p.y -= size.height + 8;
  }
}

/**
 * @param {{ ctx: CanvasRenderingContext2D, size: Size, theme: ThemePack, reducedMotion: boolean,
 *   random: () => number,
 *   frames: { request(cb: (t: number) => void): number, cancel(id: number): void } }} options
 */
export function createAttract({ ctx, size, theme, reducedMotion, random, frames }) {
  const { particles: settings, palette } = theme;
  const withAlt = theme.holiday !== 'default';
  /** @type {Particle[]} */
  let particles = [];
  let builtFor = '';
  /** @type {number | null} */
  let frameId = null;
  /** @type {number | null} */
  let last = null;
  let clock = 0;

  function ensureParticles() {
    const key = `${size.width}x${size.height}`;
    if (key === builtFor) return;
    builtFor = key;
    particles = createParticles(settings, size, random, withAlt);
  }

  /** @param {number} t seconds */
  function drawRing(t) {
    const radius = Math.min(size.width, size.height) * RING_RADIUS_VMIN;
    const cx = size.width / 2;
    const cy = size.height * 0.45;
    const turn = reducedMotion ? 0 : (t * RING_DEGREES_PER_SECOND * Math.PI) / 180;
    ctx.fillStyle = settings.color;
    for (let i = 0; i < RING_DOTS; i++) {
      const angle = turn + (i / RING_DOTS) * Math.PI * 2;
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(angle * 3));
      ctx.fillRect(
        cx + Math.cos(angle) * radius - 1,
        cy + Math.sin(angle) * radius * 0.92 - 1,
        2,
        2,
      );
    }
  }

  /** @param {number} t seconds */
  function drawParticles(t) {
    for (const p of particles) {
      const twinkle =
        settings.twinkle && !reducedMotion ? 0.55 + 0.45 * Math.sin(t * 2 + p.phase) : 0.8;
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = p.alt ? palette.hazard : settings.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  /** @param {number} t seconds */
  function drawBenjo(t) {
    const span = size.width + BENJO_PX * 4;
    const x = reducedMotion ? size.width * 0.78 : ((t * 22) % span) - BENJO_PX * 2;
    const y = size.height * 0.16 + (reducedMotion ? 0 : Math.sin(t * 0.6) * size.height * 0.04);
    drawSprite(ctx, palette, theme.sprites.benjo, x, y, BENJO_PX, {
      alpha: BENJO_ALPHA,
      tint: palette.ink,
    });
  }

  function draw() {
    ensureParticles();
    ctx.save();
    ctx.clearRect(0, 0, size.width, size.height);
    drawParticles(clock);
    drawRing(clock);
    ctx.globalAlpha = 1;
    drawBenjo(clock);
    ctx.restore();
  }

  /** @param {number} time ms */
  function frame(time) {
    frameId = null;
    const dt = last === null ? 0 : Math.min((time - last) / 1000, MAX_DT);
    last = time;
    clock += dt;
    ensureParticles();
    stepParticles(particles, settings.drift, size, dt);
    draw();
    frameId = frames.request(frame);
  }

  return {
    start() {
      if (reducedMotion) {
        draw();
        return;
      }
      if (frameId !== null) return;
      last = null;
      frameId = frames.request(frame);
    },
    stop() {
      if (frameId !== null) frames.cancel(frameId);
      frameId = null;
    },
    /** Redraw once, for resizes while idle under reduced motion. */
    redraw: draw,
    get running() {
      return frameId !== null;
    },
  };
}
