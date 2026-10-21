import { KEY_ELECTORATES, PARTIES, PARTY_IDS, VERIAN_POLLS, type Bloc, type Electorate, type PartyId } from '../data/polls';
import { analyze, type Summary } from '../engine/analyze';
import { pollBase } from '../engine/pollBase';
import { filterRaw, type SimRaw } from '../engine/simulate';

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
  /** Force a party out of Parliament regardless of its vote share or electorate wins. */
  excluded: boolean[];
  /** Restrict displayed results to simulations where this party's vote share came in under 5%. */
  conditionParty: PartyId | null;
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
  /** `raw`, or the subset matching `settings.conditionParty`'s under-5% condition if one is set. What results are drawn from. */
  viewRaw: SimRaw | null;
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

/** Parties allowed to receive seats: those that contest the party vote and haven't been toggled out. */
export function eligibleParties(s: Settings): boolean[] {
  return PARTIES.map((p, i) => p.contests && !s.excluded[i]);
}

/**
 * The simulations and summary that results should be drawn from: `raw` as run, or the subset where
 * `settings.conditionParty` came in under 5%, if that condition is set. Cheap to recompute from an
 * existing run, so callers can redo it on any settings change without a full re-simulation.
 */
export function buildView(raw: SimRaw, s: Settings): { viewRaw: SimRaw; summary: Summary | null } {
  let viewRaw = raw;
  if (s.conditionParty) {
    const idx = PARTY_IDS.indexOf(s.conditionParty);
    if (idx >= 0) viewRaw = filterRaw(raw, (sim) => raw.shares[sim * raw.parties + idx] < 5);
  }
  const summary = viewRaw.n > 0
    ? analyze(viewRaw, s.blocs, { NAT: PARTY_IDS.indexOf('NAT'), LAB: PARTY_IDS.indexOf('LAB') })
    : null;
  return { viewRaw, summary };
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
    excluded: PARTIES.map(() => false),
    conditionParty: null,
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
    if (!Array.isArray(merged.excluded) || merged.excluded.length !== PARTIES.length) merged.excluded = d.excluded;
    if (!Array.isArray(merged.electorates)) merged.electorates = d.electorates;
    if (merged.conditionParty != null && !PARTIES.some((p) => p.id === merged.conditionParty)) merged.conditionParty = null;
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
