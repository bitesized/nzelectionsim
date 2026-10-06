import { describe, expect, it } from 'vitest';
import { KEY_ELECTORATES, PARTIES, PARTY_IDS, VERIAN_POLLS } from '../src/data/polls';
import { EVENT_KEYS, findOddities, RECORD_KEYS } from '../src/engine/oddities';
import { pollBase } from '../src/engine/pollBase';
import { runSimulations, type SimRaw } from '../src/engine/simulate';

const base = pollBase(VERIAN_POLLS, 1, 0);
const raw = runSimulations({
  n: 4000,
  seed: 7,
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
});
const opts = {
  blocs: PARTIES.map((p) => p.bloc),
  eligible: PARTIES.map((p) => p.contests),
  majors: [PARTY_IDS.indexOf('NAT'), PARTY_IDS.indexOf('LAB')],
};
const odd = findOddities(raw, opts);
const P = raw.parties;

describe('findOddities', () => {
  it('finds records that are true extremes of the runs', () => {
    let maxSeats = 0, maxHouse = 0;
    for (let s = 0; s < raw.n; s++) {
      maxHouse = Math.max(maxHouse, raw.house[s]);
      for (let i = 0; i < P; i++) maxSeats = Math.max(maxSeats, raw.seats[s * P + i]);
    }
    expect(odd.records.landslide.value).toBe(maxSeats);
    expect(raw.seats[odd.records.landslide.sim * P + odd.records.landslide.party]).toBe(maxSeats);
    expect(odd.records.bigHouse.value).toBe(maxHouse);
    expect(odd.records.fragmented.value).toBeLessThanOrEqual(maxSeats);
  });

  it('never credits "Other" with a lifeboat or heartbreak record', () => {
    const oth = PARTY_IDS.indexOf('OTH');
    expect(odd.records.lifeboat.party).not.toBe(oth);
    expect(odd.records.heartbreak.party).not.toBe(oth);
    for (const k of RECORD_KEYS) expect(odd.records[k].sim).toBeLessThan(raw.n);
  });

  it('gives examples that actually match each event', () => {
    for (const k of EVENT_KEYS) {
      const e = odd.events[k];
      expect(e.count).toBeLessThanOrEqual(raw.n);
      expect(e.examples.length).toBe(Math.min(e.count, 200));
    }
    for (const s of odd.events.nearMiss.examples) {
      let found = false;
      for (let i = 0; i < P; i++) if (opts.eligible[i] && raw.seats[s * P + i] === 0 && raw.shares[s * P + i] >= 4.5) found = true;
      expect(found).toBe(true);
    }
  });

  it('flags a single-party majority and a tie', () => {
    // Two parties, one simulation: A 61 seats, B 59 seats.
    const one: SimRaw = {
      n: 2, parties: 2,
      shares: new Float32Array([51, 49, 50, 50]),
      seats: new Int16Array([61, 59, 60, 60]),
      electorates: new Uint8Array(4),
      house: new Int16Array([120, 120]),
      independents: new Uint8Array(2),
    };
    const o = findOddities(one, { blocs: ['right', 'left'], eligible: [true, true], majors: [0, 1] });
    expect(o.events.singleMajority.examples).toEqual([0]);
    expect(o.events.largestTie.examples).toEqual([1]);
    expect(o.events.blocTie.examples).toEqual([1]);
    expect(o.events.knifeEdge.examples).toEqual([0]);
    expect(o.events.minorLargest.count).toBe(0);
  });
});
