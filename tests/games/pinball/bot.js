// A simple pinball autopilot for tests: it launches at a set pull and flips a flipper while a
// falling ball is close above it, then lets go so it never cradles forever.
import { DECKS } from '../../../src/games/pinball/decks.js';
import { ballOnPlunger } from '../../../src/games/pinball/table.js';

/** @returns {(w: object, dt: number) => object} intent for the next step */
export function createBot({ pull = 0.75 } = {}) {
  let held = 0;
  return (w, dt) => {
    const intent = {
      left: false,
      right: false,
      pull: false,
      nudge: false,
      leftPressed: false,
      rightPressed: false,
    };
    if (ballOnPlunger(w) && w.autoT < 0) {
      held += dt;
      intent.pull = held < pull * 0.9;
    } else held = 0;
    const deck = DECKS[w.deck];
    for (const b of w.balls) {
      if (b.state !== 'play' || b.vy < 40 || b.y < 470) continue;
      for (const f of deck.flippers) {
        if (Math.abs(b.x - (f.x + f.side * 34)) > 40) continue;
        if (f.side === 1) intent.left = true;
        else intent.right = true;
      }
    }
    return intent;
  };
}
