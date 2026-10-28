import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDebugMeter } from '../../src/shell/debug-meter.js';
import { fakeFrames } from './fixtures/fake-host-env.js';

function setup() {
  const frames = fakeFrames();
  const lines = [];
  const meter = createDebugMeter({ frames, emit: (line) => lines.push(line), describe: () => 'x' });
  return { frames, lines, meter };
}

describe('createDebugMeter', () => {
  it('requests no frames until a run is playing', () => {
    const { frames, meter } = setup();
    assert.equal(frames.pending, 0);
    assert.equal(meter.running, false);
  });

  it('reports fps about once a second while running', () => {
    const { frames, lines, meter } = setup();
    meter.setRunning(true);
    meter.setRunning(true);
    assert.equal(frames.pending, 1, 'one loop, even when started twice');
    for (let t = 0; t <= 1000; t += 100) frames.run(t);
    assert.deepEqual(lines, ['x fps=10']);
  });

  it('cancels its frame when stopped, and stays quiet', () => {
    const { frames, lines, meter } = setup();
    meter.setRunning(true);
    frames.run(0);
    meter.setRunning(false);
    assert.equal(frames.pending, 0);
    assert.equal(meter.running, false);
    frames.run(5000);
    assert.deepEqual(lines, []);
  });

  it('measures from a fresh baseline after a restart', () => {
    const { frames, lines, meter } = setup();
    meter.setRunning(true);
    frames.run(0);
    meter.setRunning(false);
    meter.setRunning(true);
    frames.run(60000);
    assert.deepEqual(lines, [], 'the hidden minute is not counted');
    for (let t = 60100; t <= 61000; t += 100) frames.run(t);
    assert.deepEqual(lines, ['x fps=10']);
  });
});
