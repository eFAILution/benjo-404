// @ts-check
// The only file that touches localStorage. Every call is guarded; after the first failure the
// rest of the session uses memory, so private mode, quota errors, and blocked storage never throw.
/** @typedef {import('../contracts').GameStorage} GameStorage */

const PREFIX = 'benjo404';
const MAX_VALUE_LENGTH = 256;
const MAX_NUMBER = 1e9;

/**
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} Backing
 */

/** @returns {Backing | null} */
function defaultBacking() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} gameId
 * @param {Backing | null} [backing] defaults to localStorage; pass a fake in tests
 * @returns {GameStorage & { readonly dead: boolean }}
 */
export function createStorage(gameId, backing = defaultBacking()) {
  /** @type {Map<string, string>} */
  const memory = new Map();
  let dead = backing === null;

  /** @param {string} key */
  const fullKey = (key) => `${PREFIX}:${gameId}:${key}`;

  /** @param {string} key */
  function get(key) {
    const name = fullKey(key);
    if (dead || !backing) return memory.get(name) ?? null;
    try {
      return backing.getItem(name);
    } catch {
      dead = true;
      return memory.get(name) ?? null;
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  function set(key, value) {
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) return false;
    const name = fullKey(key);
    memory.set(name, value);
    if (dead || !backing) return false;
    try {
      backing.setItem(name, value);
      return true;
    } catch {
      dead = true;
      return false;
    }
  }

  /**
   * @param {string} key
   * @param {number} fallback
   */
  function getNumber(key, fallback) {
    const raw = get(key);
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0 || value > MAX_NUMBER) return fallback;
    return value;
  }

  /**
   * @param {string} key
   * @param {number} value
   */
  function setNumber(key, value) {
    if (!Number.isFinite(value)) return false;
    return set(key, String(value));
  }

  return {
    get,
    set,
    getNumber,
    setNumber,
    get dead() {
      return dead;
    },
  };
}
