// Deterministic, seedable RNG so a scenario URL always reproduces the same
// dealt cards, answer choices, and choice ordering.
window.PT = window.PT || {};

PT.rng = (function () {
  const SEED_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const SEED_LENGTH = 8;

  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32 — small, fast, well-distributed PRNG.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fromString(str) {
    return mulberry32(hashString(str));
  }

  function int(random, minInclusive, maxInclusive) {
    return minInclusive + Math.floor(random() * (maxInclusive - minInclusive + 1));
  }

  function pick(random, list) {
    return list[Math.floor(random() * list.length)];
  }

  function shuffle(random, list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function makeSeed() {
    const random = mulberry32((hashString('' + performance.now()) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    let seed = '';
    for (let i = 0; i < SEED_LENGTH; i++) {
      seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)];
    }
    return seed;
  }

  return { hashString, mulberry32, fromString, int, pick, shuffle, makeSeed };
})();
