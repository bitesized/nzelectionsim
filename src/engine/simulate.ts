import type { Bloc, Electorate, PartyId } from '../data/polls';
import { allocateSeats } from './allocate';
import { createRng, dirichlet } from './rng';

export interface SimConfig {
  n: number;
  seed: number;
  partyIds: PartyId[];
  /** Party vote shares (percent) to centre the simulation on. */
  base: number[];
  /** Whether each party can be allocated seats ("Other" cannot). */
  eligible: boolean[];
  blocs: Bloc[];
  /** Effective poll sample size before the design effect. */
  sampleSize: number;
  designEffect: number;
  /** Polling-industry error, in points, for a party on 50%. Scales with √(p(1−p)). */
  systematicError: number;
  /** Movement between the poll and election day, in points, for a party on 50%. */
  campaignDrift: number;
  /** SD (points) of a uniform swing between the left and right blocs. */
  blocSwing: number;
  electorates: Electorate[];
  /** How strongly a party's electorate chances follow its party-vote over/under-performance (logit units per SD). */
  electorateCorrelation: number;
}

export interface SimRaw {
  n: number;
  parties: number;
  /** n × parties party-vote shares (percent). */
  shares: Float32Array;
  /** n × parties total seats. */
  seats: Int16Array;
  /** n × parties electorates won among the key electorates. */
  electorates: Uint8Array;
  house: Int16Array;
  independents: Uint8Array;
}

export type ProgressFn = (done: number) => void;

export function runSimulations(cfg: SimConfig, onProgress?: ProgressFn, progressEvery = 2000): SimRaw {
  const P = cfg.partyIds.length;
  const N = cfg.n;
  const rng = createRng(cfg.seed);

  const totalBase = cfg.base.reduce((a, b) => a + b, 0);
  const p = cfg.base.map((v) => v / totalBase);
  const nEff = Math.max(10, cfg.sampleSize / Math.max(1, cfg.designEffect));
  const alpha = p.map((v) => Math.max(v * nEff, 1e-3));

  const extraSd = Math.hypot(cfg.systematicError, cfg.campaignDrift) / 100;
  // Per-party SD of the non-sampling error, and of the total error (used to
  // standardise each party's over/under-performance for electorate correlation).
  const noiseSd = p.map((v) => extraSd * 2 * Math.sqrt(v * (1 - v)));
  const totalSd = p.map((v, i) => Math.hypot(noiseSd[i], Math.sqrt((v * (1 - v)) / nEff)) || 1);

  const isRight = cfg.blocs.map((b) => b === 'right');
  const isLeft = cfg.blocs.map((b) => b === 'left');

  const elecParty = cfg.electorates.map((e) =>
    e.candidates.map((c) => (c.party === 'IND' ? -1 : cfg.partyIds.indexOf(c.party))),
  );

  const shares = new Float32Array(N * P);
  const seats = new Int16Array(N * P);
  const elecWins = new Uint8Array(N * P);
  const house = new Int16Array(N);
  const independents = new Uint8Array(N);

  const draw = new Float64Array(P);
  const dev = new Float64Array(P);
  const won = new Int32Array(P);
  const probs: number[] = [];

  for (let s = 0; s < N; s++) {
    // 1. Sampling error around the poll.
    dirichlet(rng, alpha, draw);

    // 2. Party-specific polling error and campaign movement.
    for (let i = 0; i < P; i++) {
      draw[i] += noiseSd[i] * rng.normal();
      if (draw[i] < 0) draw[i] = 0;
    }

    // 3. Correlated swing between blocs, shared proportionally within each bloc.
    if (cfg.blocSwing > 0) {
      let r = 0, l = 0;
      for (let i = 0; i < P; i++) {
        if (isRight[i]) r += draw[i];
        else if (isLeft[i]) l += draw[i];
      }
      const swing = (cfg.blocSwing / 100) * rng.normal();
      for (let i = 0; i < P; i++) {
        if (isRight[i] && r > 0) draw[i] += (swing * draw[i]) / r;
        else if (isLeft[i] && l > 0) draw[i] -= (swing * draw[i]) / l;
        if (draw[i] < 0) draw[i] = 0;
      }
    }

    let sum = 0;
    for (let i = 0; i < P; i++) sum += draw[i];
    for (let i = 0; i < P; i++) {
      draw[i] /= sum;
      dev[i] = (draw[i] - p[i]) / totalSd[i];
    }

    // 4. Key electorates, nudged by how each party is doing on the party vote.
    won.fill(0);
    let ind = 0;
    for (let e = 0; e < cfg.electorates.length; e++) {
      const cands = cfg.electorates[e].candidates;
      let total = 0;
      probs.length = 0;
      for (let c = 0; c < cands.length; c++) {
        let pr = Math.min(Math.max(cands[c].p, 0), 1);
        const pi = elecParty[e][c];
        if (pi >= 0 && cfg.electorateCorrelation !== 0 && pr > 0 && pr < 1) {
          const logit = Math.log(pr / (1 - pr)) + cfg.electorateCorrelation * dev[pi];
          pr = 1 / (1 + Math.exp(-logit));
        }
        probs.push(pr);
        total += pr;
      }
      const u = rng.next() * Math.max(1, total);
      let acc = 0;
      for (let c = 0; c < cands.length; c++) {
        acc += probs[c];
        if (u < acc) {
          const pi = elecParty[e][c];
          if (pi >= 0) won[pi]++;
          else ind++;
          break;
        }
      }
    }

    // 5. MMP allocation.
    const res = allocateSeats(draw, won, cfg.eligible, ind);
    const o = s * P;
    for (let i = 0; i < P; i++) {
      shares[o + i] = draw[i] * 100;
      seats[o + i] = res.seats[i];
      elecWins[o + i] = won[i];
    }
    house[s] = res.houseSize;
    independents[s] = ind;

    if (onProgress && (s + 1) % progressEvery === 0) onProgress(s + 1);
  }
  onProgress?.(N);

  return { n: N, parties: P, shares, seats, electorates: elecWins, house, independents };
}
