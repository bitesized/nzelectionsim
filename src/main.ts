import './styles.css';
import { ELECTION_DATE, PARTIES, PARTY_IDS, VERIAN_POLLS } from './data/polls';
import { analyze, analyzeBlocs } from './engine/analyze';
import { pollBase } from './engine/pollBase';
import { randomSeed } from './engine/rng';
import type { SimConfig } from './engine/simulate';
import type { WorkerRequest, WorkerResponse } from './engine/worker';
import { hideTip } from './ui/charts';
import { renderControls } from './ui/controls';
import { renderResults } from './ui/results';
import { decodeSettings, defaultSettings, loadPref, savePref, type AppState, type Coalition } from './ui/state';

const AUTO_RUN_LIMIT = 100_000;

const fromHash = location.hash.startsWith('#s=') ? decodeSettings(location.hash.slice(3)) : null;

const state: AppState = {
  settings: fromHash ?? defaultSettings(),
  raw: null,
  summary: null,
  run: null,
  running: false,
  progress: 0,
  stale: false,
  parliamentView: 'typical',
  customCoalitions: loadPref<Coalition[]>('coalitions', []),
  coalitionDraft: [],
  seatsView: 'chart',
  tab: loadPref<AppState['tab']>('tab', 'forecast') === 'fun' ? 'fun' : 'forecast',
  funPick: null,
};

const controlsEl = document.getElementById('controls')!;
const resultsEl = document.getElementById('results')!;

// ---------- Theme ----------

const savedTheme = loadPref<string | null>('theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  savePref('theme', next);
  renderAll();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);

// ---------- Countdown ----------

function renderCountdown() {
  const el = document.getElementById('countdown')!;
  const nz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
  const days = Math.round((Date.parse(ELECTION_DATE) - Date.parse(nz)) / 86_400_000);
  el.innerHTML = days > 0
    ? `<strong class="num">${days} day${days === 1 ? '' : 's'}</strong>to election day · Sat 7 Nov`
    : days === 0 ? '<strong>Election day</strong>Saturday 7 November' : '<strong>Election held</strong>7 November 2026';
}

// ---------- Simulation ----------

let worker: Worker | null = null;

function buildConfig(): SimConfig {
  const s = state.settings;
  if (s.randomiseSeed) s.seed = randomSeed();
  return {
    n: s.n,
    seed: s.seed,
    partyIds: PARTY_IDS,
    base: s.shares,
    eligible: PARTIES.map((p) => p.contests),
    blocs: s.blocs,
    sampleSize: s.sampleSize,
    designEffect: s.designEffect,
    systematicError: s.systematicError,
    campaignDrift: s.campaignDrift,
    blocSwing: s.blocSwing,
    electorates: s.electorates,
    electorateCorrelation: s.electorateCorrelation,
  };
}

function describeBasis(): string {
  const s = state.settings;
  const base = pollBase(VERIAN_POLLS, s.pollCount, s.halfLifeDays);
  const edited = base.published.some((v, i) => Math.abs(v - s.shares[i]) > 0.01);
  return edited ? `custom scenario (edited from ${base.description})` : base.description;
}

function run() {
  if (state.settings.shares.reduce((a, b) => a + b, 0) <= 0) return;
  worker?.terminate();
  worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
  const config = buildConfig();
  const basis = describeBasis();
  state.running = true;
  state.progress = 0;
  setRunning(true);
  updateStatus();

  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      state.progress = msg.done / msg.total;
      setProgress(state.progress);
    } else if (msg.type === 'done') {
      state.raw = msg.raw;
      state.summary = analyze(msg.raw, state.settings.blocs, { NAT: PARTY_IDS.indexOf('NAT'), LAB: PARTY_IDS.indexOf('LAB') });
      state.run = { n: config.n, seed: config.seed, ms: msg.ms, basis };
      state.running = false;
      state.stale = false;
      if (typeof state.parliamentView === 'number' && state.parliamentView >= msg.raw.n) state.parliamentView = 'typical';
      state.funPick = null;
      worker?.terminate();
      worker = null;
      setRunning(false);
      // The seed input may have changed if seeds are randomised.
      const seedInput = document.getElementById('seed-input') as HTMLInputElement | null;
      if (seedInput) seedInput.value = String(config.seed);
      renderResultsNow();
    } else {
      state.running = false;
      setRunning(false);
      alert(`Simulation failed: ${msg.message}`);
    }
  };
  worker.postMessage({ type: 'run', config } satisfies WorkerRequest);
}

function cancel() {
  worker?.terminate();
  worker = null;
  state.running = false;
  setRunning(false);
  setProgress(0);
  renderResultsNow();
}

function setRunning(running: boolean) {
  const runBtn = document.getElementById('run-btn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement | null;
  if (runBtn) runBtn.textContent = running ? 'Running…' : 'Run simulations';
  if (cancelBtn) cancelBtn.disabled = !running;
  if (!running) setProgress(state.raw ? 1 : 0);
}

function setProgress(p: number) {
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  const status = resultsEl.querySelector('.status-bar .stale');
  if (status && state.running) status.textContent = `Running… ${Math.round(p * 100)}%`;
}

function updateStatus() {
  if (!state.raw) renderResultsNow();
  else {
    const bar = resultsEl.querySelector('.status-bar');
    if (bar && !bar.querySelector('.stale')) bar.insertBefore(Object.assign(document.createElement('span'), { className: 'stale', textContent: 'Running… 0%' }), bar.children[1] ?? null);
  }
}

// ---------- Change handling ----------

let autoTimer: number | undefined;

function onSettingsChanged() {
  state.stale = true;
  if (history.replaceState && location.hash) history.replaceState(null, '', location.pathname);
  // Bloc outcomes can be re-read from the existing runs immediately.
  if (state.raw && state.summary) state.summary.blocs = analyzeBlocs(state.raw, state.settings.blocs);
  if (state.settings.autoRun && state.settings.n <= AUTO_RUN_LIMIT) {
    clearTimeout(autoTimer);
    autoTimer = window.setTimeout(run, 250);
  } else {
    renderResultsNow();
  }
}

function renderResultsNow() {
  hideTip();
  const scrollY = window.scrollY;
  renderResults(resultsEl, state, { refresh: renderResultsNow });
  window.scrollTo({ top: scrollY });
}

function renderAll() {
  renderControls(controlsEl, state, { changed: onSettingsChanged, run, cancel });
  renderResultsNow();
  setRunning(state.running);
}

let resizeTimer: number | undefined;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(renderResultsNow, 150);
});

renderCountdown();
renderAll();
run();
