// @ts-check
// Turns keys and touches into this step's intent. Pinball needs both flippers held at once, which
// the host's single pointer cannot say, so this listens to every pointer on the canvas itself:
// a finger on the left half holds the left flipper, one on the right half the right flipper.

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./table.js').Intent} Intent */
/** @typedef {'left' | 'right'} Side */

/** @param {HostContext} host */
export function createControls(host) {
  /** @type {Map<number, Side>} */
  const held = new Map();
  const edge = { left: false, right: false };
  const before = { left: false, right: false };
  const { canvas, signal } = host;

  /** @param {PointerEvent} event */
  function down(event) {
    const box = canvas.getBoundingClientRect();
    /** @type {Side} */
    const side = event.clientX - box.left < box.width / 2 ? 'left' : 'right';
    held.set(event.pointerId, side);
    edge[side] = true;
  }

  /** @param {Event} event */
  const up = (event) => held.delete(/** @type {PointerEvent} */ (event).pointerId);

  if (typeof canvas?.addEventListener === 'function') {
    const options = { signal, passive: true };
    canvas.addEventListener('pointerdown', down, options);
    // A finger can lift off outside the canvas, so watch the whole window for the release.
    for (const type of ['pointerup', 'pointercancel']) {
      globalThis.addEventListener?.(type, up, options);
    }
  }

  /** @param {Side} side */
  const touching = (side) => [...held.values()].includes(side);

  return {
    /** Forget held pointers and keys, so the press that resumed the game does nothing. */
    reset() {
      held.clear();
      edge.left = edge.right = false;
      before.left = before.right = true;
    },

    /**
     * @param {InputState} input
     * @returns {Intent}
     */
    read(input) {
      const left = input.isDown('left') || touching('left');
      const right = input.isDown('right') || touching('right');
      const intent = {
        left,
        right,
        leftPressed: (left && !before.left) || edge.left,
        rightPressed: (right && !before.right) || edge.right,
        // Space or Down pulls the plunger. Up is also 'primary' to the host, so it is left out.
        pull:
          (input.isDown('primary') && !input.isDown('up')) || input.isDown('down') || held.size > 0,
        nudge: input.justPressed('up') || input.swipe === 'up',
      };
      before.left = left;
      before.right = right;
      edge.left = edge.right = false;
      return intent;
    },
  };
}
