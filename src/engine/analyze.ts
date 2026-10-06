import type { Bloc } from '../data/polls';
import type { SimRaw } from './simulate';

export interface PartySummary {
  shareMean: number;
  shareP05: number;
  shareP50: number;
  shareP95: number;
  /** Probability of ≥5% party vote. */
  pThreshold: number;
  /** Probability of winning any seats. */
  pInParliament: number;
  seatsMean: number;
  seatsP05: number;
  seatsP50: number;
  seatsP95: number;
  /** seatHist[k] = number of simulations with exactly k seats. */
  seatHist: number[];
  /** shareHist[b] counts simulations with share in [b·SHARE_BIN, (b+1)·SHARE_BIN) percent. */
  shareHist: number[];
  /** Distribution of key-electorate wins. */
  elecHist: number[];
}

export interface BlocOutcome {
  rightMajority: number;
  leftMajority: number;
  /** Neither bloc alone, but crossbench parties can make one of them a majority. */
  crossbenchDecides: number;
  /** No bloc + crossbench combination reaches a majority. */
  deadlock: number;
  /** Histograms of (bloc seats − seats needed for a majority), offset by `marginOffset`. */
  rightMargin: number[];
  leftMargin: number[];
  marginOffset: number;
  rightSeatsP50: number;
  leftSeatsP50: number;
  crossSeatsP50: number;
}

export interface Summary {
  n: number;
  parties: PartySummary[];
  houseHist: Map<number, number>;
  pOverhang: number;
  houseP50: number;
  pIndependent: number;
  largest: { NAT: number; LAB: number; tie: number; other: number };
  blocs: BlocOutcome;
  topParliaments: { seats: number[]; count: number }[];
}

export const SHARE_BIN = 0.1;

function histQuantile(hist: number[], n: number, q: number, binWidth = 1): number {
  const target = q * n;
  let acc = 0;
  for (let k = 0; k < hist.length; k++) {
    acc += hist[k];
    if (acc >= target) return k * binWidth;
  }
  return (hist.length - 1) * binWidth;
}

export function majorityOf(house: number): number {
  return Math.floor(house / 2) + 1;
}

export function analyze(raw: SimRaw, blocs: Bloc[], nameIdx: { NAT: number; LAB: number }): Summary {
  const { n, parties: P, shares, seats, electorates, house } = raw;

  const parties: PartySummary[] = [];
  for (let i = 0; i < P; i++) {
    const seatHist: number[] = [];
    const shareHist: number[] = [];
    const elecHist: number[] = [];
    let shareSum = 0, seatSum = 0, thr = 0, inParl = 0;
    for (let s = 0; s < n; s++) {
      const v = shares[s * P + i];
      const k = seats[s * P + i];
      const e = electorates[s * P + i];
      shareSum += v;
      seatSum += k;
      if (v >= 5) thr++;
      if (k > 0) inParl++;
      seatHist[k] = (seatHist[k] ?? 0) + 1;
      const b = Math.floor(v / SHARE_BIN);
      shareHist[b] = (shareHist[b] ?? 0) + 1;
      elecHist[e] = (elecHist[e] ?? 0) + 1;
    }
    for (const h of [seatHist, shareHist, elecHist]) for (let k = 0; k < h.length; k++) h[k] ??= 0;
    parties.push({
      shareMean: shareSum / n,
      shareP05: histQuantile(shareHist, n, 0.05, SHARE_BIN),
      shareP50: histQuantile(shareHist, n, 0.5, SHARE_BIN),
      shareP95: histQuantile(shareHist, n, 0.95, SHARE_BIN) + SHARE_BIN,
      pThreshold: thr / n,
      pInParliament: inParl / n,
      seatsMean: seatSum / n,
      seatsP05: histQuantile(seatHist, n, 0.05),
      seatsP50: histQuantile(seatHist, n, 0.5),
      seatsP95: histQuantile(seatHist, n, 0.95),
      seatHist,
      shareHist,
      elecHist,
    });
  }

  const houseHist = new Map<number, number>();
  let over = 0, indep = 0;
  for (let s = 0; s < n; s++) {
    houseHist.set(house[s], (houseHist.get(house[s]) ?? 0) + 1);
    if (house[s] > 120) over++;
    if (raw.independents[s] > 0) indep++;
  }
  const houseSorted = [...houseHist.entries()].sort((a, b) => a[0] - b[0]);
  let acc = 0, houseP50 = 120;
  for (const [h, c] of houseSorted) {
    acc += c;
    if (acc >= n / 2) { houseP50 = h; break; }
  }

  let nat = 0, lab = 0, tie = 0, other = 0;
  for (let s = 0; s < n; s++) {
    const a = seats[s * P + nameIdx.NAT];
    const b = seats[s * P + nameIdx.LAB];
    let maxOther = 0;
    for (let i = 0; i < P; i++) if (i !== nameIdx.NAT && i !== nameIdx.LAB) maxOther = Math.max(maxOther, seats[s * P + i]);
    if (maxOther > Math.max(a, b)) other++;
    else if (a > b) nat++;
    else if (b > a) lab++;
    else tie++;
  }

  const counts = new Map<string, number>();
  for (let s = 0; s < n; s++) {
    let key = '';
    for (let i = 0; i < P; i++) key += (i ? ',' : '') + seats[s * P + i];
    key += '|' + raw.independents[s];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const topParliaments = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, count]) => ({ seats: k.split('|')[0].split(',').map(Number), count }));

  return {
    n,
    parties,
    houseHist,
    pOverhang: over / n,
    houseP50,
    pIndependent: indep / n,
    largest: { NAT: nat / n, LAB: lab / n, tie: tie / n, other: other / n },
    blocs: analyzeBlocs(raw, blocs),
    topParliaments,
  };
}

export function analyzeBlocs(raw: SimRaw, blocs: Bloc[]): BlocOutcome {
  const { n, parties: P, seats, house } = raw;
  const OFFSET = 70;
  const rightMargin = new Array(141).fill(0);
  const leftMargin = new Array(141).fill(0);
  const rHist: number[] = [], lHist: number[] = [], cHist: number[] = [];
  let rm = 0, lm = 0, cd = 0, dl = 0;
  for (let s = 0; s < n; s++) {
    let r = 0, l = 0, c = 0;
    for (let i = 0; i < P; i++) {
      const k = seats[s * P + i];
      if (blocs[i] === 'right') r += k;
      else if (blocs[i] === 'left') l += k;
      else c += k;
    }
    const maj = majorityOf(house[s]);
    if (r >= maj) rm++;
    else if (l >= maj) lm++;
    else if (r + c >= maj || l + c >= maj) cd++;
    else dl++;
    rightMargin[Math.min(140, Math.max(0, r - maj + OFFSET))]++;
    leftMargin[Math.min(140, Math.max(0, l - maj + OFFSET))]++;
    rHist[r] = (rHist[r] ?? 0) + 1;
    lHist[l] = (lHist[l] ?? 0) + 1;
    cHist[c] = (cHist[c] ?? 0) + 1;
  }
  for (const h of [rHist, lHist, cHist]) for (let k = 0; k < h.length; k++) h[k] ??= 0;
  return {
    rightMajority: rm / n,
    leftMajority: lm / n,
    crossbenchDecides: cd / n,
    deadlock: dl / n,
    rightMargin,
    leftMargin,
    marginOffset: OFFSET,
    rightSeatsP50: histQuantile(rHist, n, 0.5),
    leftSeatsP50: histQuantile(lHist, n, 0.5),
    crossSeatsP50: histQuantile(cHist, n, 0.5),
  };
}

export interface CoalitionResult {
  pMajority: number;
  seatsP05: number;
  seatsP50: number;
  seatsP95: number;
}

/** Probability that the given set of parties holds a majority of the House. */
export function coalitionOdds(raw: SimRaw, members: number[]): CoalitionResult {
  const { n, parties: P, seats, house } = raw;
  const hist: number[] = [];
  let maj = 0;
  for (let s = 0; s < n; s++) {
    let t = 0;
    for (const i of members) t += seats[s * P + i];
    if (t >= majorityOf(house[s])) maj++;
    hist[t] = (hist[t] ?? 0) + 1;
  }
  for (let k = 0; k < hist.length; k++) hist[k] ??= 0;
  return {
    pMajority: maj / n,
    seatsP05: histQuantile(hist, n, 0.05),
    seatsP50: histQuantile(hist, n, 0.5),
    seatsP95: histQuantile(hist, n, 0.95),
  };
}
