// A stand-in Web Audio engine for Node. It records every node, every source it starts, and every
// gain change, and a test moves its clock by setting `currentTime` on the context.

/** An AudioParam that remembers its events; setTargetAtTime also sets `value` to the target. */
function param(value) {
  const events = [];
  return {
    value,
    events,
    setValueAtTime: (v, t) => events.push(['set', v, t]),
    linearRampToValueAtTime: (v, t) => events.push(['linear', v, t]),
    exponentialRampToValueAtTime: (v, t) => events.push(['exp', v, t]),
    setTargetAtTime(v, t, c) {
      events.push(['target', v, t, c]);
      this.value = v;
    },
  };
}

function node(context, fields) {
  return {
    context,
    ...fields,
    connected: [],
    connect(next) {
      this.connected.push(next);
      return next;
    },
    disconnect() {
      this.connected = [];
    },
  };
}

/**
 * @param {string} [state] the state a new context starts in
 * @returns {{ Context: typeof globalThis.AudioContext, contexts: any[], sources: any[] }}
 */
export function fakeAudio(state = 'running') {
  const contexts = [];
  const sources = [];
  const source = (context, fields) => ({
    ...node(context, fields),
    start(at) {
      this.at = at;
      sources.push(this);
    },
    stop(end) {
      this.end = end;
    },
  });
  class FakeContext {
    state = state;
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return node(this, { gain: param(1) });
    }
    createOscillator() {
      return source(this, { type: 'sine', frequency: param(440) });
    }
    createBufferSource() {
      return source(this, { type: 'noise', buffer: null });
    }
    createBiquadFilter() {
      return node(this, { type: 'lowpass', frequency: param(350) });
    }
    createBuffer(_channels, length) {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  }
  return { Context: /** @type {any} */ (FakeContext), contexts, sources };
}
