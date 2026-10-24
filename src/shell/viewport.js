// @ts-check
// Keeps the canvas backing store matched to #game-root and the device pixel ratio (capped at 2).
/** @typedef {import('../contracts').Size} Size */

const MAX_DPR = 2;

/**
 * @param {number} width CSS px
 * @param {number} height CSS px
 * @param {number} devicePixelRatio
 * @returns {Size}
 */
export function measure(width, height, devicePixelRatio) {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DPR);
  return { width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)), dpr };
}

/**
 * Watch root and update `size` in place. Resizing clears the canvas, so onResize lets the
 * caller redraw when nothing else is animating.
 * @param {{ root: HTMLElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D,
 *   size: Size, signal: AbortSignal, onResize?: () => void }} options
 */
export function watchSize({ root, canvas, ctx, size, signal, onResize }) {
  function apply() {
    const box = root.getBoundingClientRect();
    const next = measure(box.width, box.height, globalThis.devicePixelRatio);
    const changed =
      next.width !== size.width || next.height !== size.height || next.dpr !== size.dpr;
    if (!changed) return;
    Object.assign(size, next);
    canvas.width = Math.round(next.width * next.dpr);
    canvas.height = Math.round(next.height * next.dpr);
    ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
    onResize?.();
  }

  apply();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(apply);
    observer.observe(root);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  } else {
    window.addEventListener('resize', apply, { signal, passive: true });
  }
}
