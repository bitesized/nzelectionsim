// Scans every simulation for record-breaking and unusual results — the
// landslides, wipe-outs and MMP quirks that sit far out in the tails.

import type { Bloc } from '../data/polls';
import { majorityOf } from './analyze';
import type { SimRaw } from './simulate';

/** The single simulation that set a record. */
export interface OddRecord {
  sim: number;
  value: number;
  /** Party the record is about, or −1. */
  party: number;
  /** A second party involved (e.g. the one that won more seats on fewer votes), or −1. */
  other: number;
  bloc?: Bloc;
}

/** How often an unusual event happened, with some simulations to show. */
export interface OddEvent {
  count: number;
  /** Indices of up to EXAMPLE_LIMIT matching simulations, in run order. */
  examples: number[];
}

export const RECORD_KEYS = [
  'landslide', 'fragmented', 'heartbreak', 'lifeboat', 'wasted', 'inversion', 'bigHouse', 'blocRout', 'crowded', 'sparse',
] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

export const EVENT_KEYS = [
  'singleMajority', 'minorLargest', 'minorBeatsMajor', 'largestTie', 'blocTie', 'knifeEdge', 'deadlock',
  'bigOverhang', 'independent', 'nearMiss', 'allIn', 'inversion',
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export interface Oddities {
  n: number;
  records: Record<RecordKey, OddRecord>;
  events: Record<EventKey, OddEvent>;
}

export const EXAMPLE_LIMIT = 200;

export interface OddityOptions {
  blocs: Bloc[];
  /** Parties that can win seats ("Other" cannot). */
  eligible: boolean[];
  /** The two traditional major parties (National, Labour). */
  majors: number[];
}

export function findOddities(raw: SimRaw, o: OddityOptions): Oddities {
  const { n, parties: P, shares, seats, house, independents } = raw;
  const rec = (value: number): OddRecord => ({ sim: -1, value, party: -1, other: -1 });
  const records: Record<RecordKey, OddRecord> = {
    landslide: rec(-Infinity),
    fragmented: rec(Infinity),
    heartbreak: rec(-Infinity),
    lifeboat: rec(Infinity),
    wasted: rec(-Infinity),
    inversion: rec(0),
    bigHouse: rec(-Infinity),
    blocRout: rec(-Infinity),
    crowded: rec(-Infinity),
    sparse: rec(Infinity),
  };
  const events = Object.fromEntries(EVENT_KEYS.map((k) => [k, { count: 0, examples: [] as number[] }])) as Record<EventKey, OddEvent>;
  const hit = (k: EventKey, s: number) => {
    const e = events[k];
    e.count++;
    if (e.examples.length < EXAMPLE_LIMIT) e.examples.push(s);
  };
  const isMajor = Array.from({ length: P }, (_, i) => o.majors.includes(i));
  const nEligible = o.eligible.filter(Boolean).length;

  for (let s = 0; s < n; s++) {
    const off = s * P;
    const maj = majorityOf(house[s]);

    let top = -1, topSeats = -1, tied = false, inParl = 0, wasted = 0;
    let right = 0, left = 0, cross = 0;
    let minMajorShare = Infinity, maxMinorShare = -Infinity, minorTopSeats = -1;
    let invFound = false;

    for (let i = 0; i < P; i++) {
      const k = seats[off + i];
      const v = shares[off + i];
      if (k > topSeats) { topSeats = k; top = i; tied = false; }
      else if (k === topSeats) tied = true;
      if (k > 0) inParl++;
      else wasted += v;
      if (o.blocs[i] === 'right') right += k;
      else if (o.blocs[i] === 'left') left += k;
      else cross += k;

      if (!o.eligible[i]) continue;
      if (isMajor[i]) minMajorShare = Math.min(minMajorShare, v);
      else { maxMinorShare = Math.max(maxMinorShare, v); minorTopSeats = Math.max(minorTopSeats, k); }

      if (k === 0 && v > records.heartbreak.value) records.heartbreak = { sim: s, value: v, party: i, other: -1 };
      if (k > 0 && v < records.lifeboat.value) records.lifeboat = { sim: s, value: v, party: i, other: -1 };

      // More party votes but fewer seats than another party.
      for (let j = 0; j < P; j++) {
        if (j === i || !o.eligible[j]) continue;
        const gap = v - shares[off + j];
        if (gap > 0 && k < seats[off + j]) {
          invFound = true;
          if (gap > records.inversion.value) records.inversion = { sim: s, value: gap, party: i, other: j };
        }
      }
    }

    if (topSeats > records.landslide.value) records.landslide = { sim: s, value: topSeats, party: top, other: -1 };
    if (topSeats < records.fragmented.value) records.fragmented = { sim: s, value: topSeats, party: top, other: -1 };
    if (wasted > records.wasted.value) records.wasted = { sim: s, value: wasted, party: -1, other: -1 };
    if (house[s] > records.bigHouse.value) records.bigHouse = { sim: s, value: house[s], party: -1, other: -1 };
    const lead = Math.abs(right - left);
    if (lead > records.blocRout.value) records.blocRout = { sim: s, value: lead, party: -1, other: -1, bloc: right >= left ? 'right' : 'left' };
    if (inParl > records.crowded.value) records.crowded = { sim: s, value: inParl, party: -1, other: -1 };
    if (inParl < records.sparse.value) records.sparse = { sim: s, value: inParl, party: -1, other: -1 };

    if (topSeats >= maj) hit('singleMajority', s);
    if (minorTopSeats === topSeats) hit('minorLargest', s);
    if (maxMinorShare > minMajorShare) hit('minorBeatsMajor', s);
    if (tied) hit('largestTie', s);
    if (right === left) hit('blocTie', s);
    if (right === maj || left === maj) hit('knifeEdge', s);
    if (right < maj && left < maj && right + cross < maj && left + cross < maj) hit('deadlock', s);
    if (house[s] - 120 >= 3) hit('bigOverhang', s);
    if (independents[s] > 0) hit('independent', s);
    for (let i = 0; i < P; i++) {
      if (o.eligible[i] && seats[off + i] === 0 && shares[off + i] >= 4.5) { hit('nearMiss', s); break; }
    }
    if (inParl === nEligible) hit('allIn', s);
    if (invFound) hit('inversion', s);
  }

  return { n, records, events };
}
