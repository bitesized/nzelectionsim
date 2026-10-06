// Seeded random number generation so that any run can be reproduced exactly.

export interface Rng {
  /** Uniform on [0, 1). */
  next(): number;
  normal(): number;
  gamma(shape: number): number;
}

/** sfc32 seeded via splitmix32; fast and statistically solid for simulation work. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split(), b = split(), c = split(), d = split();

  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();

  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0, v = 0, r = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      r = u * u + v * v;
    } while (r >= 1 || r === 0);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = v * f;
    return u * f;
  };

  // Marsaglia–Tsang; boosts shape < 1 with the usual U^(1/a) trick.
  const gamma = (shape: number): number => {
    if (shape <= 0) return 0;
    if (shape < 1) return gamma(shape + 1) * Math.pow(next(), 1 / shape);
    const d3 = shape - 1 / 3;
    const c3 = 1 / Math.sqrt(9 * d3);
    for (;;) {
      let x = 0, v = 0;
      do {
        x = normal();
        v = 1 + c3 * x;
      } while (v <= 0);
      v = v * v * v;
      const u = next();
      if (u < 1 - 0.0331 * x * x * x * x) return d3 * v;
      if (Math.log(u) < 0.5 * x * x + d3 * (1 - v + Math.log(v))) return d3 * v;
    }
  };

  return { next, normal, gamma };
}

/** Draw from Dirichlet(alpha) into `out`. */
export function dirichlet(rng: Rng, alpha: ArrayLike<number>, out: Float64Array): void {
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) {
    const g = rng.gamma(alpha[i]);
    out[i] = g;
    sum += g;
  }
  for (let i = 0; i < alpha.length; i++) out[i] = sum > 0 ? out[i] / sum : 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
