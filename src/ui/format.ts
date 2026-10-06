import { PARTIES, type PartyId } from '../data/polls';

export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export function partyColor(id: PartyId): string {
  const p = PARTIES.find((x) => x.id === id);
  if (!p) return '#888';
  return isDark() ? p.color.dark : p.color.light;
}

export const partyName = (id: PartyId) => PARTIES.find((p) => p.id === id)?.name ?? id;

/** Probability as a percentage, avoiding false certainty at the extremes. */
export function fmtProb(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.005) return '<1%';
  if (p > 0.995) return '>99%';
  return `${Math.round(p * 100)}%`;
}

/** Probability with one decimal, for tables. */
export function fmtProb1(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.0005) return '<0.1%';
  if (p > 0.9995) return '>99.9%';
  return `${(p * 100).toFixed(1)}%`;
}

export const fmtInt = (n: number) => n.toLocaleString('en-NZ');

/** "1 in N" odds phrasing for small probabilities. */
export function oneIn(p: number): string {
  if (p <= 0) return 'never in these runs';
  if (p >= 0.5) return `${fmtProb(p)} of runs`;
  return `about 1 in ${Math.round(1 / p).toLocaleString('en-NZ')}`;
}
