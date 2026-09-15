/* All rule randomness goes through here, and its whole state is one integer
 * on the save, so a seed replays a game exactly and a save carries the
 * generator with it. Bots consume none of it: their variety comes from
 * hashing the position, and the simulation asserts the stream did not move
 * while a bot was thinking. */

/** One step of a 32-bit LCG. Returns the next state; the caller stores it. */
export function nextState(s) {
  return (Math.imul(s | 0, 1664525) + 1013904223) | 0;
}

/** A float in [0, 1) from a state, after advancing it. `st.rng` is updated. */
export function rnd(st) {
  st.rng = nextState(st.rng);
  return ((st.rng >>> 8) & 0xffffff) / 0x1000000;
}

/** An integer in [0, n). */
export function rndInt(st, n) {
  return Math.floor(rnd(st) * n);
}

/** Fisher-Yates, in place, from the game's generator. */
export function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rndInt(st, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/** A deterministic 32-bit hash, for bot jitter that must not touch the RNG. */
export function hash32(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}
