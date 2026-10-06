import { KEY_ELECTORATES, PARTIES, VERIAN_POLLS, type Bloc, type Electorate, type PartyId } from '../data/polls';
import { pollBase } from '../engine/pollBase';
import type { Summary } from '../engine/analyze';
import type { SimRaw } from '../engine/simulate';

export interface Settings {
  n: number;
  seed: number;
  /** Draw a fresh seed on each run. */
  randomiseSeed: boolean;
  autoRun: boolean;
  pollCount: number;
  halfLifeDays: number;
  shares: number[];
  sampleSize: number;
  blocs: Bloc[];
  designEffect: number;
  systematicError: number;
  campaignDrift: number;
  blocSwing: number;
  electorateCorrelation: number;
  electorates: Electorate[];
}

export interface Coalition {
  name: string;
  members: PartyId[];
  custom?: boolean;
}

export interface RunInfo {
  n: number;
  seed: number;
  ms: number;
  basis: string;
}

export interface AppState {
  settings: Settings;
  raw: SimRaw | null;
  summary: Summary | null;
  run: RunInfo | null;
  running: boolean;
  progress: number;
  /** Settings changed since the last completed run. */
  stale: boolean;
  /** Which parliament the hemicycle shows: a typical run, or a specific simulation index. */
  parliamentView: 'typical' | number;
  customCoalitions: Coalition[];
  coalitionDraft: PartyId[];
  seatsView: 'chart' | 'table';
  tab: 'forecast' | 'fun';
  /** Simulation shown on the Fun tab, and why it was picked. */
  funPick: { sim: number; reason: string } | null;
}

export const DEFAULTS = {
  n: 10_000,
  pollCount: 1,
  halfLifeDays: 45,
  designEffect: 1.4,
  systematicError: 2,
  campaignDrift: 2,
  blocSwing: 1,
  electorateCorrelation: 0.5,
};

export const PRESET_COALITIONS: Coalition[] = [
  { name: 'Current government', members: ['NAT', 'ACT', 'NZF'] },
  { name: 'National–ACT', members: ['NAT', 'ACT'] },
  { name: 'National–NZ First', members: ['NAT', 'NZF'] },
  { name: 'Right bloc + Opportunity', members: ['NAT', 'ACT', 'NZF', 'OPP'] },
  { name: 'Labour–Green', members: ['LAB', 'GRN'] },
  { name: 'Labour–Green–Opportunity', members: ['LAB', 'GRN', 'OPP'] },
  { name: 'Labour–Green–Te Pāti Māori', members: ['LAB', 'GRN', 'TPM'] },
  { name: 'Left bloc + Opportunity (1News grouping)', members: ['LAB', 'GRN', 'TPM', 'OPP'] },
  { name: 'Grand coalition', members: ['NAT', 'LAB'] },
];

export function cloneElectorates(src: Electorate[] = KEY_ELECTORATES): Electorate[] {
  return src.map((e) => ({ ...e, candidates: e.candidates.map((c) => ({ ...c })) }));
}

export function defaultSettings(): Settings {
  const base = pollBase(VERIAN_POLLS, DEFAULTS.pollCount, DEFAULTS.halfLifeDays);
  return {
    n: DEFAULTS.n,
    seed: 20261107,
    randomiseSeed: false,
    autoRun: true,
    pollCount: DEFAULTS.pollCount,
    halfLifeDays: DEFAULTS.halfLifeDays,
    shares: base.published.map((v) => round(v, 2)),
    sampleSize: Math.round(base.sampleSize),
    blocs: PARTIES.map((p) => p.bloc),
    designEffect: DEFAULTS.designEffect,
    systematicError: DEFAULTS.systematicError,
    campaignDrift: DEFAULTS.campaignDrift,
    blocSwing: DEFAULTS.blocSwing,
    electorateCorrelation: DEFAULTS.electorateCorrelation,
    electorates: cloneElectorates(),
  };
}

export const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

// ---------- Share links (settings encoded in the URL hash) ----------

export function encodeSettings(s: Settings): string {
  const json = JSON.stringify(s);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeSettings(hash: string): Settings | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Settings>;
    const d = defaultSettings();
    const merged = { ...d, ...parsed };
    if (!Array.isArray(merged.shares) || merged.shares.length !== PARTIES.length) merged.shares = d.shares;
    if (!Array.isArray(merged.blocs) || merged.blocs.length !== PARTIES.length) merged.blocs = d.blocs;
    if (!Array.isArray(merged.electorates)) merged.electorates = d.electorates;
    merged.n = clamp(Math.round(merged.n), 100, 1_000_000);
    return merged;
  } catch {
    return null;
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

// ---------- Local preferences (best effort; storage may be unavailable) ----------

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`nzsim:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`nzsim:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
