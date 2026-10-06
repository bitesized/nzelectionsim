import { PARTY_IDS, type Poll } from '../data/polls';

export interface PollBase {
  /** Percent per party, index-aligned with PARTY_IDS, summing to 100. */
  shares: number[];
  /** The weighted-average figures as published, before normalisation. */
  published: number[];
  /** Effective sample size of the (possibly averaged) estimate. */
  sampleSize: number;
  description: string;
}

/**
 * Exponentially weighted average of the most recent `count` polls. With
 * count = 1 this is just the latest poll. The effective sample size follows
 * from the variance of a weighted mean: n_eff = (Σw)² / Σ(w²/n).
 */
export function pollBase(polls: Poll[], count: number, halfLifeDays: number): PollBase {
  const sorted = [...polls].sort((a, b) => b.date.localeCompare(a.date)).slice(0, Math.max(1, count));
  const latest = Date.parse(sorted[0].date);
  const weights = sorted.map((p) => {
    const ageDays = (latest - Date.parse(p.date)) / 86_400_000;
    return halfLifeDays > 0 ? Math.pow(0.5, ageDays / halfLifeDays) : 1;
  });
  const wSum = weights.reduce((a, b) => a + b, 0);

  const shares = PARTY_IDS.map((id) => {
    let v = 0;
    sorted.forEach((p, k) => (v += weights[k] * (p.vote[id] ?? 0)));
    return v / wSum;
  });
  // Normalise to exactly 100 (published figures are rounded).
  const total = shares.reduce((a, b) => a + b, 0);
  const normalised = shares.map((v) => (v / total) * 100);

  const varTerm = sorted.reduce((acc, p, k) => acc + (weights[k] * weights[k]) / p.sample, 0);
  const sampleSize = (wSum * wSum) / varTerm;

  const description =
    sorted.length === 1
      ? `1News–Verian, ${sorted[0].fieldwork} (n=${sorted[0].sample.toLocaleString()})`
      : `Weighted average of the last ${sorted.length} 1News–Verian polls (${sorted[sorted.length - 1].fieldwork} → ${sorted[0].fieldwork})`;

  return { shares: normalised, published: shares, sampleSize, description };
}
