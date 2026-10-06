import { ELECTION_2023, PARTIES, PARTY_IDS, VERIAN_POLLS, type Bloc, type PartyId } from '../data/polls';
import { coalitionOdds, majorityOf, SHARE_BIN, type CoalitionResult } from '../engine/analyze';
import type { SimRaw } from '../engine/simulate';
import { h, hemicycle, histogram, intervalChart, lineChart, ttRow, type HemiGroup, type IntervalRow } from './charts';
import { fmtInt, fmtProb, fmtProb1, oneIn, partyColor, partyName } from './format';
import { funTab } from './fun';
import { encodeSettings, PRESET_COALITIONS, savePref, type AppState, type Coalition } from './state';

const SPECTRUM: PartyId[] = ['GRN', 'TPM', 'TTT', 'LAB', 'OPP', 'NZF', 'NAT', 'ACT', 'OTH'];
const BLOC_ORDER: Record<Bloc, number> = { left: 0, cross: 1, right: 2 };
const BLOC_NAME: Record<Bloc, string> = { left: 'Left bloc', cross: 'Crossbench', right: 'Right bloc' };
const SEAT_PARTIES = PARTIES.filter((p) => p.contests);

export interface ResultHandlers {
  refresh: () => void;
}

export function renderResults(root: HTMLElement, state: AppState, on: ResultHandlers) {
  const sections: (HTMLElement | null)[] = [statusBar(state), tabBar(state, on)];
  if (state.tab === 'fun') {
    sections.push(...funTab(state, on));
  } else if (state.raw && state.summary) {
    sections.push(
      outcomeHero(state),
      sectionTitle('The new Parliament', 'Seats each party wins across every simulated election.'),
      h('div', { class: 'grid-2' }, [parliamentCard(state, on), seatsCard(state, on)]),
      sectionTitle('Who can govern', 'How often each bloc or coalition reaches a majority.'),
      coalitionCard(state, on),
      blocMarginCard(state),
      sectionTitle('In detail', 'Full distributions, the 5% threshold, overhang and the most common results.'),
      seatDistCard(state),
      thresholdCard(state),
      h('div', { class: 'grid-2' }, [structureCard(state), topParliamentsCard(state)]),
    );
  } else {
    sections.push(h('section', { class: 'card empty' }, [state.running ? 'Running simulations…' : 'Press “Run simulations” to start.']));
  }
  if (state.tab === 'forecast') {
    sections.push(sectionTitle('Background', 'The polls behind the model and how it works.'), pollHistoryCard(), methodologyCard(state));
  }
  sections.push(h('p', { class: 'footer-note' }, [
    'Poll data: 1News–Verian via Wikipedia. Not affiliated with 1News, Verian or the Electoral Commission. Simulations are a model, not a prediction.',
  ]));
  root.replaceChildren(...sections.filter((x): x is HTMLElement => !!x));
  // Charts size themselves from their container, so draw them after insertion.
  for (const fn of pendingDraws.splice(0)) fn();
}

function tabBar(state: AppState, on: ResultHandlers) {
  const tabs = [['forecast', 'Forecast'], ['fun', 'Fun']] as const;
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Results view' }, tabs.map(([id, label]) =>
    h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(state.tab === id),
      onclick: () => { state.tab = id; savePref('tab', id); on.refresh(); },
    }, [label]),
  ));
}

function sectionTitle(title: string, sub: string) {
  return h('header', { class: 'section-title' }, [h('h2', {}, [title]), h('p', {}, [sub])]);
}

const pendingDraws: (() => void)[] = [];
function chart(draw: (el: HTMLElement) => void, cls = 'chart') {
  const el = h('div', { class: cls });
  pendingDraws.push(() => draw(el));
  return el;
}

// ---------- Status & export ----------

function statusBar(state: AppState) {
  const r = state.run;
  const raw = state.raw;
  return h('div', { class: 'status-bar' }, [
    r
      ? h('span', {}, [
          h('strong', { class: 'num' }, [fmtInt(r.n)]), ' simulations · seed ', h('span', { class: 'num' }, [String(r.seed)]),
          ` · ${(r.ms / 1000).toFixed(2)}s · ${r.basis}`,
        ])
      : h('span', {}, ['No simulations yet']),
    state.running ? h('span', { class: 'stale' }, [`Running… ${Math.round(state.progress * 100)}%`]) : null,
    !state.running && state.stale && r ? h('span', { class: 'stale' }, ['Settings changed — run again to update']) : null,
    h('span', { class: 'actions' }, [
      h('button', { type: 'button', class: 'btn small', onclick: () => copyLink(state) }, ['Copy share link']),
      raw ? h('button', { type: 'button', class: 'btn small', onclick: () => exportJson(state) }, ['Summary JSON']) : null,
      raw ? h('button', { type: 'button', class: 'btn small', onclick: () => exportCsv(raw) }, ['All runs CSV']) : null,
    ]),
  ]);
}

function download(name: string, parts: BlobPart[], type: string) {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(raw: SimRaw) {
  const P = raw.parties;
  const header = ['sim', ...PARTY_IDS.map((id) => `${id}_vote`), ...PARTY_IDS.map((id) => `${id}_seats`), 'house', 'independent_seats'].join(',') + '\n';
  const parts: string[] = [header];
  let chunk = '';
  for (let s = 0; s < raw.n; s++) {
    let line = String(s + 1);
    for (let i = 0; i < P; i++) line += ',' + raw.shares[s * P + i].toFixed(2);
    for (let i = 0; i < P; i++) line += ',' + raw.seats[s * P + i];
    chunk += `${line},${raw.house[s]},${raw.independents[s]}\n`;
    if (chunk.length > 1 << 20) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk);
  download(`nz-election-sims-${raw.n}.csv`, parts, 'text/csv');
}

function exportJson(state: AppState) {
  const s = state.summary!;
  const out = {
    generated: new Date().toISOString(),
    run: state.run,
    settings: state.settings,
    outcomes: {
      rightMajority: s.blocs.rightMajority,
      leftMajority: s.blocs.leftMajority,
      crossbenchDecides: s.blocs.crossbenchDecides,
      deadlock: s.blocs.deadlock,
    },
    parties: Object.fromEntries(PARTY_IDS.map((id, i) => {
      const { seatHist, shareHist, elecHist, ...rest } = s.parties[i];
      return [id, { ...rest, seatDistribution: seatHist }];
    })),
    coalitions: allCoalitions(state).map((c) => ({ ...c, ...coalition(state, c.members) })),
    pOverhang: s.pOverhang,
    largestParty: s.largest,
  };
  download('nz-election-summary.json', [JSON.stringify(out, null, 2)], 'application/json');
}

function copyLink(state: AppState) {
  const url = `${location.origin}${location.pathname}#s=${encodeSettings(state.settings)}`;
  history.replaceState(null, '', url);
  navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast('Link added to the address bar'));
}

function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status' }, [msg]);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- Headline outcomes ----------

function blocMembers(state: AppState, bloc: Bloc) {
  return SEAT_PARTIES.filter((_, i) => state.settings.blocs[i] === bloc).map((p) => p.short);
}

function outcomeHero(state: AppState) {
  const { blocs: b, n } = state.summary!;
  const members = (bloc: Bloc) => blocMembers(state, bloc).join(' + ') || 'none';
  // Spectrum order, so the bar reads left to right.
  const outcomes = [
    { label: 'Left bloc majority', p: b.leftMajority, d: members('left'), color: 'var(--left)' },
    { label: 'Crossbench decides', p: b.crossbenchDecides, d: `${members('cross')} hold the balance`, color: 'var(--cross)' },
    { label: 'Right bloc majority', p: b.rightMajority, d: members('right'), color: 'var(--right)' },
    { label: 'No majority possible', p: b.deadlock, d: 'Not even with the crossbench', color: 'var(--text-3)' },
  ];
  const top = outcomes.reduce((a, o) => (o.p > a.p ? o : a));
  const runs = `${fmtProb(top.p)} of ${fmtInt(n)} simulated elections`;
  const [headline, sentence] =
    top === outcomes[0] ? ['The left bloc governs alone', `${members('left')} win a majority in ${runs}.`]
    : top === outcomes[1] ? ['The crossbench holds the balance', `Neither bloc can govern alone in ${runs}, leaving ${members('cross')} as kingmaker.`]
    : top === outcomes[2] ? ['The right bloc governs alone', `${members('right')} win a majority in ${runs}.`]
    : ['Nobody can form a majority', `No bloc reaches a majority, even with the crossbench, in ${runs}.`];

  return h('section', { class: 'card hero' }, [
    h('div', { class: 'eyebrow' }, ['Most likely outcome']),
    h('h2', { class: 'hero-title' }, [headline]),
    h('p', { class: 'hero-sub' }, [sentence]),
    h('div', { class: 'outcome-bar', role: 'img', 'aria-label': outcomes.map((o) => `${o.label} ${fmtProb(o.p)}`).join(', ') },
      outcomes.filter((o) => o.p > 0).map((o) => h('div', { style: { flex: `${o.p} 1 0`, background: o.color }, title: `${o.label}: ${fmtProb1(o.p)}` }))),
    h('div', { class: 'outcomes' }, outcomes.map((o) => {
      const el = h('div', { class: 'outcome' + (o === top ? ' top' : '') }, [
        h('div', { class: 'k' }, [h('i', {}), o.label]),
        h('div', { class: 'v' }, [fmtProb(o.p)]),
        h('div', { class: 'd' }, [o.d]),
      ]);
      el.style.setProperty('--tile-color', o.color);
      return el;
    })),
  ]);
}

// ---------- Parliament ----------

function typicalSim(state: AppState): number {
  const raw = state.raw!;
  const med = state.summary!.parties.map((p) => p.seatsP50);
  let best = 0, bestD = Infinity;
  for (let s = 0; s < raw.n; s++) {
    let d = 0;
    for (let i = 0; i < raw.parties; i++) d += Math.abs(raw.seats[s * raw.parties + i] - med[i]);
    if (d < bestD) { bestD = d; best = s; if (d === 0) break; }
  }
  return best;
}

/** Hemicycle seat groups and bloc totals for one simulated election. */
export function parliamentOf(state: AppState, idx: number) {
  const raw = state.raw!;
  const P = raw.parties;
  const blocs = state.settings.blocs;

  const order = PARTY_IDS.map((id, i) => ({ id, i }))
    .filter(({ id }) => id !== 'OTH')
    .sort((a, b) => BLOC_ORDER[blocs[a.i]] - BLOC_ORDER[blocs[b.i]] || SPECTRUM.indexOf(a.id) - SPECTRUM.indexOf(b.id));
  const groups: HemiGroup[] = order.map(({ id, i }) => ({ label: partyName(id), color: partyColor(id), seats: raw.seats[idx * P + i] }));
  const ind = raw.independents[idx];
  if (ind) {
    // Seat independents with the crossbench, just before the right bloc.
    const firstRight = order.findIndex(({ i }) => blocs[i] === 'right');
    groups.splice(firstRight < 0 ? groups.length : firstRight, 0, { label: 'Independent', color: 'var(--text-3)', seats: ind });
  }
  const house = raw.house[idx];
  const maj = majorityOf(house);

  const sums: Record<Bloc, number> = { left: 0, cross: 0, right: 0 };
  order.forEach(({ i }) => (sums[blocs[i]] += raw.seats[idx * P + i]));
  const verdict = sums.right >= maj ? 'Right bloc majority' : sums.left >= maj ? 'Left bloc majority'
    : sums.right + sums.cross >= maj || sums.left + sums.cross >= maj ? 'Crossbench decides' : 'No majority';

  const legend = h('div', { class: 'legend' }, groups.filter((g) => g.seats > 0).map((g) =>
    h('span', {}, [h('i', { style: { background: g.color } }), `${g.label} ${g.seats}`]),
  ));
  const hemi = chart((el) => hemicycle(el, groups, `${house} seats`, `${maj} for a majority${house > 120 ? ` · ${house - 120} overhang` : ''}`));
  const shareLine = h('p', { class: 'small muted' }, [
    'Party vote in this run: ',
    PARTY_IDS.filter((id) => id !== 'OTH')
      .map((id) => `${id} ${raw.shares[idx * P + PARTY_IDS.indexOf(id)].toFixed(1)}%`).join(' · '),
  ]);
  const summary = `${verdict}: ${sums.right} right · ${sums.left} left · ${sums.cross + ind} crossbench.`;
  return { hemi, legend, shareLine, summary };
}

function parliamentCard(state: AppState, on: ResultHandlers) {
  const raw = state.raw!;
  const idx = state.parliamentView === 'typical' ? typicalSim(state) : state.parliamentView;
  const { hemi, legend, shareLine, summary } = parliamentOf(state, idx);

  return h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [
      h('h2', {}, [state.parliamentView === 'typical' ? 'Typical Parliament' : `Simulation #${fmtInt(idx + 1)}`]),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Parliament view' }, [
        h('button', {
          type: 'button', 'aria-pressed': String(state.parliamentView === 'typical'),
          onclick: () => { state.parliamentView = 'typical'; on.refresh(); },
        }, ['Typical']),
        h('button', {
          type: 'button', 'aria-pressed': String(state.parliamentView !== 'typical'),
          onclick: () => { state.parliamentView = Math.floor(Math.random() * raw.n); on.refresh(); },
        }, ['Roll one election']),
      ]),
    ]),
    h('p', { class: 'sub' }, [
      state.parliamentView === 'typical'
        ? 'Closest to every party’s median seat count. '
        : 'One random simulated election. Roll again to see the spread. ',
      summary,
    ]),
    hemi,
    legend,
    state.parliamentView === 'typical' ? null : shareLine,
  ]);
}

// ---------- Seats by party ----------

function seatQuantile(hist: number[], n: number, q: number) {
  let acc = 0;
  for (let k = 0; k < hist.length; k++) { acc += hist[k]; if (acc >= q * n) return k; }
  return hist.length - 1;
}

function seatsCard(state: AppState, on: ResultHandlers) {
  const sum = state.summary!;
  const rows = SEAT_PARTIES.map((p) => {
    const i = PARTY_IDS.indexOf(p.id);
    const s = sum.parties[i];
    return { p, i, s };
  }).sort((a, b) => b.s.seatsMean - a.s.seatsMean);

  const view = state.seatsView;
  const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'Seats view' }, (['chart', 'table'] as const).map((v) =>
    h('button', { type: 'button', 'aria-pressed': String(view === v), onclick: () => { state.seatsView = v; on.refresh(); } }, [v === 'chart' ? 'Chart' : 'Table']),
  ));

  let body: HTMLElement;
  if (view === 'chart') {
    const ivRows: IntervalRow[] = rows.map(({ p, s }) => ({
      label: p.name,
      shortLabel: p.short,
      color: partyColor(p.id),
      p05: s.seatsP05,
      p25: seatQuantile(s.seatHist, sum.n, 0.25),
      p50: s.seatsP50,
      p75: seatQuantile(s.seatHist, sum.n, 0.75),
      p95: s.seatsP95,
      right: `${s.seatsP50}  (${s.seatsP05}–${s.seatsP95})`,
      tip: `<div class="tt-title">${p.name}</div>` +
        ttRow('Median seats', String(s.seatsP50), partyColor(p.id)) +
        ttRow('Mean seats', s.seatsMean.toFixed(1)) +
        ttRow('90% range', `${s.seatsP05}–${s.seatsP95}`) +
        ttRow('Party vote (median)', `${s.shareP50.toFixed(1)}%`) +
        ttRow('In Parliament', fmtProb1(s.pInParliament)),
    }));
    const maxX = Math.max(10, ...rows.map((r) => r.s.seatsP95)) + 2;
    body = chart((el) => intervalChart(el, ivRows, maxX));
  } else {
    body = h('div', { class: 'table-wrap' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, ['Party', 'Vote (median)', 'Vote 90%', 'Seats (median)', 'Seats 90%', 'P(≥5%)', 'In Parliament']
        .map((t, k) => h('th', { class: k ? 'r' : '' }, [t])))]),
      h('tbody', {}, rows.map(({ p, s }) => h('tr', {}, [
        h('td', {}, [h('span', { class: 'party-pill' }, [h('i', { style: { background: partyColor(p.id) } }), p.name])]),
        h('td', { class: 'r num' }, [`${s.shareP50.toFixed(1)}%`]),
        h('td', { class: 'r num' }, [`${s.shareP05.toFixed(1)}–${s.shareP95.toFixed(1)}`]),
        h('td', { class: 'r num' }, [String(s.seatsP50)]),
        h('td', { class: 'r num' }, [`${s.seatsP05}–${s.seatsP95}`]),
        h('td', { class: 'r num' }, [fmtProb1(s.pThreshold)]),
        h('td', { class: 'r num' }, [fmtProb1(s.pInParliament)]),
      ]))),
    ])]);
  }

  return h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [h('h2', {}, ['Seats by party']), toggle]),
    h('p', { class: 'sub' }, ['Median seats, with the middle 50% and 90% of simulations.']),
    body,
  ]);
}

// ---------- Coalitions ----------

const coalitionCache = new WeakMap<SimRaw, Map<string, CoalitionResult>>();
function coalition(state: AppState, members: PartyId[]): CoalitionResult {
  const raw = state.raw!;
  let cache = coalitionCache.get(raw);
  if (!cache) coalitionCache.set(raw, (cache = new Map()));
  const key = [...members].sort().join('+');
  let r = cache.get(key);
  if (!r) {
    r = coalitionOdds(raw, members.map((m) => PARTY_IDS.indexOf(m)));
    cache.set(key, r);
  }
  return r;
}

function allCoalitions(state: AppState): Coalition[] {
  return [...PRESET_COALITIONS, ...state.customCoalitions];
}

function coalitionCard(state: AppState, on: ResultHandlers) {
  const rows = allCoalitions(state)
    .map((c) => ({ c, r: coalition(state, c.members) }))
    .sort((a, b) => b.r.pMajority - a.r.pMajority);

  const builder = h('div', { class: 'coalition-builder' }, [
    h('span', { class: 'label' }, ['Build your own:']),
    ...SEAT_PARTIES.map((p) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(state.coalitionDraft.includes(p.id)),
      onclick: () => {
        const d = state.coalitionDraft;
        state.coalitionDraft = d.includes(p.id) ? d.filter((x) => x !== p.id) : [...d, p.id];
        on.refresh();
      },
    }, [h('span', { class: 'sw', style: { background: partyColor(p.id) } }), p.short])),
    state.coalitionDraft.length
      ? h('span', { class: 'small muted num' }, [(() => {
          const r = coalition(state, state.coalitionDraft);
          return `→ ${fmtProb1(r.pMajority)} majority · median ${r.seatsP50} seats`;
        })()])
      : null,
    h('button', {
      type: 'button', class: 'btn small', disabled: state.coalitionDraft.length === 0,
      onclick: () => {
        const members = SEAT_PARTIES.map((p) => p.id).filter((id) => state.coalitionDraft.includes(id));
        state.customCoalitions.push({ name: members.map(partyName).join('–'), members, custom: true });
        state.coalitionDraft = [];
        savePref('coalitions', state.customCoalitions);
        on.refresh();
      },
    }, ['Save to table']),
  ]);

  return h('section', { class: 'card' }, [
    h('h2', {}, ['Coalition odds']),
    h('p', { class: 'sub' }, ['Chance each grouping holds a majority of the House, overhang included. Groupings overlap, so these don’t add to 100%.']),
    h('div', { class: 'table-wrap' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Coalition']), h('th', {}, ['Parties']), h('th', {}, ['Majority']),
        h('th', { class: 'r' }, ['Median seats']), h('th', { class: 'r' }, ['90% range']), h('th', {}, ['']),
      ])]),
      h('tbody', {}, rows.map(({ c, r }) => h('tr', {}, [
        h('td', {}, [c.name]),
        h('td', {}, c.members.map((m) => h('span', { class: 'party-pill' }, [h('i', { style: { background: partyColor(m) } }), m]))),
        h('td', {}, [h('div', { class: 'prob-cell' }, [
          h('div', { class: 'bar' }, [h('div', { style: { width: `${r.pMajority * 100}%` } })]),
          h('span', { class: 'num' }, [fmtProb(r.pMajority)]),
        ])]),
        h('td', { class: 'r num' }, [String(r.seatsP50)]),
        h('td', { class: 'r num' }, [`${r.seatsP05}–${r.seatsP95}`]),
        h('td', { class: 'r' }, [c.custom ? h('button', {
          type: 'button', class: 'remove', 'aria-label': `Remove ${c.name}`, title: 'Remove',
          onclick: () => {
            state.customCoalitions = state.customCoalitions.filter((x) => x !== c);
            savePref('coalitions', state.customCoalitions);
            on.refresh();
          },
        }, ['×']) : null]),
      ]))),
    ])]),
    builder,
  ]);
}

// ---------- Bloc margins ----------

function blocMarginCard(state: AppState) {
  const b = state.summary!.blocs;
  const n = state.summary!.n;
  const panel = (bloc: 'right' | 'left', counts: number[], p: number, color: string) => {
    const members = blocMembers(state, bloc).join(' + ');
    return h('div', {}, [
      h('div', { class: 'sm-title' }, [h('span', {}, [`${BLOC_NAME[bloc]} (${members})`]), h('span', { class: 'num' }, [`majority in ${fmtProb(p)}`])]),
      chart((el) => histogram(el, {
        counts, xStart: -b.marginOffset, total: n, height: 150,
        color: (x) => (x >= 0 ? color : 'var(--text-3)'),
        vline: { x: 0, label: 'Majority' },
        xFormat: (x) => (x > 0 ? `+${x}` : String(x)),
        tip: (x, c) => `<div class="tt-title">${x >= 0 ? `${x} seat${x === 1 ? '' : 's'} spare` : `${-x} seat${x === -1 ? '' : 's'} short`}</div>${ttRow('Simulations', fmtProb1(c / n))}`,
      })),
    ]);
  };
  return h('section', { class: 'card' }, [
    h('h2', {}, ['Distance from a majority']),
    h('p', { class: 'sub' }, ['Seats above or below the line needed to govern alone. Coloured bars are majorities.']),
    h('div', { class: 'grid-2' }, [
      panel('right', b.rightMargin, b.rightMajority, 'var(--right)'),
      panel('left', b.leftMargin, b.leftMajority, 'var(--left)'),
    ]),
  ]);
}

// ---------- Seat distributions ----------

function seatDistCard(state: AppState) {
  const sum = state.summary!;
  const items = SEAT_PARTIES.map((p) => ({ p, s: sum.parties[PARTY_IDS.indexOf(p.id)] }))
    .filter(({ s }) => s.pInParliament > 0)
    .sort((a, b) => b.s.seatsMean - a.s.seatsMean);
  return h('section', { class: 'card' }, [
    h('h2', {}, ['Seat distributions']),
    h('p', { class: 'sub' }, ['How often each party wins each number of seats.']),
    h('div', { class: 'small-multiples' }, items.map(({ p, s }) => h('div', {}, [
      h('div', { class: 'sm-title' }, [h('span', {}, [p.name]), h('span', { class: 'num' }, [`median ${s.seatsP50}`])]),
      chart((el) => histogram(el, {
        counts: s.seatHist, total: sum.n, color: partyColor(p.id), height: 110,
        tip: (x, c) => `<div class="tt-title">${p.name}: ${x} seat${x === 1 ? '' : 's'}</div>${ttRow('Probability', fmtProb1(c / sum.n), partyColor(p.id))}`,
      })),
    ]))),
  ]);
}

// ---------- Threshold watch ----------

function thresholdCard(state: AppState) {
  const sum = state.summary!;
  const watch = SEAT_PARTIES.map((p) => ({ p, i: PARTY_IDS.indexOf(p.id), s: sum.parties[PARTY_IDS.indexOf(p.id)] }))
    .filter(({ s }) => s.shareP05 < 7 && s.shareP95 > 3);
  if (!watch.length) return null;

  return h('section', { class: 'card' }, [
    h('h2', {}, ['5% threshold watch']),
    h('p', { class: 'sub' }, ['Parties near the line. Under 5%, a party still gets list seats if it wins an electorate.']),
    h('div', { class: 'small-multiples' }, watch.map(({ p, s }) => {
      // Re-bin to 0.5-point bars for legibility.
      const per = Math.round(0.5 / SHARE_BIN);
      const counts: number[] = [];
      s.shareHist.forEach((c, k) => { const b = Math.floor(k / per); counts[b] = (counts[b] ?? 0) + c; });
      for (let k = 0; k < counts.length; k++) counts[k] ??= 0;
      const elec = 1 - (s.elecHist[0] ?? 0) / sum.n;
      return h('div', {}, [
        h('div', { class: 'sm-title' }, [h('span', {}, [p.name]), h('span', { class: 'num' }, [`≥5% in ${fmtProb(s.pThreshold)}`])]),
        chart((el) => histogram(el, {
          counts, binWidth: 0.5, total: sum.n, height: 110,
          color: (x) => (x >= 5 ? partyColor(p.id) : 'var(--text-3)'),
          vline: { x: 5, label: '5%' },
          xFormat: (x) => `${x}%`,
          tip: (x, c) => `<div class="tt-title">${p.name}: ${x.toFixed(1)}–${(x + 0.5).toFixed(1)}%</div>${ttRow('Simulations', fmtProb1(c / sum.n))}`,
        })),
        h('div', { class: 'small muted' }, [
          `In Parliament ${fmtProb1(s.pInParliament)}`,
          elec > 0 ? ` · wins a key electorate ${fmtProb(elec)}` : '',
        ]),
      ]);
    })),
  ]);
}

// ---------- Structure: largest party, overhang, Māori seats ----------

function structureCard(state: AppState) {
  const sum = state.summary!;
  const L = sum.largest;
  const houseEntries = [...sum.houseHist.entries()].sort((a, b) => a[0] - b[0]);
  const houseCounts: number[] = [];
  const h0 = houseEntries[0][0];
  for (const [k, c] of houseEntries) houseCounts[k - h0] = c;
  for (let k = 0; k < houseCounts.length; k++) houseCounts[k] ??= 0;

  const tpm = sum.parties[PARTY_IDS.indexOf('TPM')];

  const stat = (k: string, v: string, d: string) => h('div', { class: 'tile', style: { boxShadow: 'none' } }, [
    h('div', { class: 'k' }, [k]), h('div', { class: 'v', style: { fontSize: '24px' } }, [v]), h('div', { class: 'd' }, [d]),
  ]);

  return h('section', { class: 'card' }, [
    h('h2', {}, ['Largest party & House size']),
    h('p', { class: 'sub' }, ['Who wins the most seats, and how often overhang enlarges the House.']),
    h('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: '12px' } }, [
      stat('National largest', fmtProb(L.NAT), `Labour ${fmtProb(L.LAB)} · tied ${fmtProb(L.tie)}`),
      stat('Overhang', fmtProb(sum.pOverhang), `Median House: ${sum.houseP50} seats`),
      stat('Independent elected', fmtProb(sum.pIndependent), oneIn(sum.pIndependent)),
    ]),
    h('div', { class: 'sm-title' }, [h('span', {}, ['House size'])]),
    chart((el) => histogram(el, {
      counts: houseCounts, xStart: h0, total: sum.n, color: 'var(--accent)', height: 100,
      tip: (x, c) => `<div class="tt-title">${x} seats</div>${ttRow('Simulations', fmtProb1(c / sum.n))}`,
    })),
    h('div', { class: 'sm-title', style: { marginTop: '12px' } }, [h('span', {}, ['Te Pāti Māori electorates won'])]),
    chart((el) => histogram(el, {
      counts: tpm.elecHist, total: sum.n, color: partyColor('TPM'), height: 100, xDomain: [0, Math.max(tpm.elecHist.length, 3)],
      tip: (x, c) => `<div class="tt-title">${x} electorate${x === 1 ? '' : 's'}</div>${ttRow('Simulations', fmtProb1(c / sum.n), partyColor('TPM'))}`,
    })),
  ]);
}

function topParliamentsCard(state: AppState) {
  const sum = state.summary!;
  const shown = PARTY_IDS.map((id, i) => ({ id, i })).filter(({ id }) => id !== 'OTH' && sum.parties[PARTY_IDS.indexOf(id)].pInParliament > 0.01);
  return h('section', { class: 'card' }, [
    h('h2', {}, ['Most common Parliaments']),
    h('p', { class: 'sub' }, ['Exact seat splits that came up most often. Even the top one is rare.']),
    h('div', { class: 'table-wrap' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, [
        ...shown.map(({ id }) => h('th', { class: 'r' }, [h('span', { class: 'party-pill' }, [h('i', { style: { background: partyColor(id) } }), id])])),
        h('th', { class: 'r' }, ['Share']),
      ])]),
      h('tbody', {}, sum.topParliaments.map((t) => h('tr', {}, [
        ...shown.map(({ i }) => h('td', { class: 'r num' }, [String(t.seats[i])])),
        h('td', { class: 'r num' }, [fmtProb1(t.count / sum.n)]),
      ]))),
    ])]),
  ]);
}

// ---------- Poll history ----------

function pollHistoryCard() {
  const polls = [...VERIAN_POLLS].sort((a, b) => a.date.localeCompare(b.date));
  const ids: PartyId[] = ['NAT', 'LAB', 'GRN', 'ACT', 'NZF', 'OPP', 'TPM'];
  const pts = (id: PartyId) => [
    { t: Date.parse(ELECTION_2023.date), v: +(ELECTION_2023.vote[id] ?? 0).toFixed(1) },
    ...polls.map((p) => ({ t: Date.parse(p.date), v: p.vote[id] ?? 0 })),
  ];
  const series = ids.map((id) => ({ label: id, color: partyColor(id), points: pts(id) }));
  const byT = new Map<number, string>();
  byT.set(Date.parse(ELECTION_2023.date), '2023 election result');
  polls.forEach((p) => byT.set(Date.parse(p.date), `1News–Verian ${p.fieldwork} · n=${fmtInt(p.sample)}`));

  return h('section', { class: 'card' }, [
    h('h2', {}, ['1News–Verian poll history']),
    h('p', { class: 'sub' }, ['Party vote in every 1News–Verian poll, starting from the 2023 result.']),
    h('div', { class: 'legend' }, ids.map((id) => h('span', {}, [h('i', { style: { background: partyColor(id) } }), partyName(id)]))),
    chart((el) => lineChart(el, series, {
      yMax: 40,
      tip: (t) => {
        const rows = series
          .map((s) => ({ s, v: s.points.find((p) => p.t === t)?.v ?? 0 }))
          .sort((a, b) => b.v - a.v)
          .map(({ s, v }) => ttRow(partyName(s.label as PartyId), `${v}%`, s.color)).join('');
        return `<div class="tt-title">${byT.get(t) ?? ''}</div>${rows}`;
      },
    })),
  ]);
}

// ---------- Methodology ----------

function methodologyCard(state: AppState) {
  const s = state.settings;
  return h('details', { class: 'card method' }, [
    h('summary', {}, ['How the simulation works']),
    h('div', { html: `
      <p>Each simulation is one possible election night. The steps are:</p>
      <ol>
        <li><strong>Sampling error.</strong> Party shares are drawn from a Dirichlet distribution centred on the poll, with
          concentration equal to the poll's sample size divided by the design effect (currently
          <code>${fmtInt(s.sampleSize)} ÷ ${s.designEffect.toFixed(1)}</code>). This reproduces the poll's stated margin of error.</li>
        <li><strong>Polling-industry error and campaign movement.</strong> Each party gets an additional independent normal shock with
          standard deviation <code>√(industry² + campaign²) × 2√(p(1−p))</code> points, so a party on 50% moves by about
          ${Math.hypot(s.systematicError, s.campaignDrift).toFixed(1)} points and smaller parties proportionally less.</li>
        <li><strong>Left–right swing.</strong> A single correlated swing (SD ${s.blocSwing.toFixed(1)} points) moves votes from one bloc to the
          other, shared among each bloc's parties in proportion to their size. Without it, errors would cancel out and the model would be overconfident.</li>
        <li><strong>Key electorates.</strong> Each electorate in the list is decided by a random draw using the probabilities you set,
          nudged up or down (on the log-odds scale) by how well that party is doing on the party vote in the same simulation.</li>
        <li><strong>MMP allocation.</strong> Seats are allocated exactly as the Electoral Commission does: parties with ≥5% or an electorate
          qualify; seats won by independents come off the 120; the rest are shared by Sainte-Laguë; parties keep any electorates beyond
          their entitlement as overhang. The engine reproduces the official 2023 result (122 seats, 2 overhang) exactly.</li>
      </ol>
      <h3>Outcomes</h3>
      <p>A bloc has a majority when its seats reach half the House plus one, where the House includes overhang. "Crossbench decides" means
      neither bloc can govern alone but one can with the crossbench parties (Opportunity by default). Bloc membership is editable.</p>
      <h3>Limitations</h3>
      <ul>
        <li>Built from a single pollster. Verian's house effects aren't corrected for; try averaging several of its polls for a steadier base.</li>
        <li>National and Labour electorate wins are not modelled; they don't change the outcome because each wins fewer electorates than its list entitlement.</li>
        <li>Electorate probabilities are judgement calls informed by the 2023 results and recent electorate polling — adjust them to taste.</li>
        <li>Coalition outcomes assume parties vote with their bloc. Real negotiations involve policy, personalities and confidence-and-supply deals.</li>
      </ul>` }),
  ]);
}
