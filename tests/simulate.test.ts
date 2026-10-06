import { describe, expect, it } from 'vitest';
import { KEY_ELECTORATES, PARTIES, PARTY_IDS, VERIAN_POLLS } from '../src/data/polls';
import { analyze, coalitionOdds } from '../src/engine/analyze';
import { pollBase } from '../src/engine/pollBase';
import { runSimulations, type SimConfig } from '../src/engine/simulate';

const base = pollBase(VERIAN_POLLS, 1, 0);
const config = (over: Partial<SimConfig> = {}): SimConfig => ({
  n: 4000,
  seed: 42,
  partyIds: PARTY_IDS,
  base: base.shares,
  eligible: PARTIES.map((p) => p.contests),
  blocs: PARTIES.map((p) => p.bloc),
  sampleSize: base.sampleSize,
  designEffect: 1.4,
  systematicError: 2,
  campaignDrift: 2,
  blocSwing: 1,
  electorates: KEY_ELECTORATES,
  electorateCorrelation: 0.5,
  ...over,
});
const idx = { NAT: PARTY_IDS.indexOf('NAT'), LAB: PARTY_IDS.indexOf('LAB') };

describe('pollBase', () => {
  it('uses the latest poll when count is 1', () => {
    expect(base.sampleSize).toBeCloseTo(1001);
    expect(base.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(base.shares[PARTY_IDS.indexOf('GRN')]).toBeCloseTo((16 / 100.4) * 100, 5);
  });

  it('pools sample size across polls', () => {
    const avg = pollBase(VERIAN_POLLS, 3, 0);
    expect(avg.sampleSize).toBeGreaterThan(2500);
  });
});

describe('runSimulations', () => {
  it('is reproducible for a given seed', () => {
    const a = runSimulations(config());
    const b = runSimulations(config());
    expect(Array.from(a.seats.slice(0, 200))).toEqual(Array.from(b.seats.slice(0, 200)));
  });

  it('keeps every simulated House consistent', () => {
    const raw = runSimulations(config());
    for (let s = 0; s < raw.n; s++) {
      let total = raw.independents[s];
      let shareSum = 0;
      for (let i = 0; i < raw.parties; i++) {
        total += raw.seats[s * raw.parties + i];
        shareSum += raw.shares[s * raw.parties + i];
      }
      expect(total).toBe(raw.house[s]);
      expect(shareSum).toBeCloseTo(100, 2);
    }
  });

  it('centres on the poll with no extra error', () => {
    const raw = runSimulations(config({ systematicError: 0, campaignDrift: 0, blocSwing: 0, n: 3000 }));
    const sum = analyze(raw, PARTIES.map((p) => p.bloc), idx);
    const g = PARTY_IDS.indexOf('GRN');
    expect(sum.parties[g].shareMean).toBeGreaterThan(15.2);
    expect(sum.parties[g].shareMean).toBeLessThan(16.7);
    expect(sum.parties[g].seatsP50).toBeGreaterThanOrEqual(19);
    expect(sum.parties[g].seatsP50).toBeLessThanOrEqual(21);
  });

  it('produces outcome probabilities that sum to 1', () => {
    const raw = runSimulations(config());
    const sum = analyze(raw, PARTIES.map((p) => p.bloc), idx);
    const b = sum.blocs;
    expect(b.rightMajority + b.leftMajority + b.crossbenchDecides + b.deadlock).toBeCloseTo(1, 10);
    const all = coalitionOdds(raw, PARTY_IDS.map((_, i) => i));
    expect(all.pMajority).toBe(1);
  });
});
