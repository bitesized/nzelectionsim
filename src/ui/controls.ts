import { PARTIES, VERIAN_POLLS, type Bloc } from '../data/polls';
import { pollBase } from '../engine/pollBase';
import { randomSeed } from '../engine/rng';
import { h } from './charts';
import { partyColor } from './format';
import { clamp, cloneElectorates, DEFAULTS, round, type AppState } from './state';

export interface ControlHandlers {
  changed: () => void;
  run: () => void;
  cancel: () => void;
}

const N_PRESETS = [1_000, 10_000, 100_000, 1_000_000];

const openState: Record<string, boolean> = { uncertainty: false, electorates: false };
const collapsible = (key: string, children: (Node | string | null)[]) => {
  const d = h('details', { class: 'card', open: openState[key] }, children);
  d.addEventListener('toggle', () => (openState[key] = d.open));
  return d;
};

export function renderControls(root: HTMLElement, state: AppState, on: ControlHandlers) {
  const s = state.settings;
  root.replaceChildren(
    runCard(state, on),
    pollCard(state, on, () => renderControls(root, state, on)),
    uncertaintyCard(state, on, () => renderControls(root, state, on)),
    electorateCard(state, on, () => renderControls(root, state, on)),
  );

  // Keep the share-total readout live without a full re-render.
  updateTotal(root, s.shares);
}

function runCard(state: AppState, on: ControlHandlers) {
  const s = state.settings;
  const nInput = h('input', {
    type: 'number', min: 100, max: 1_000_000, step: 100, value: s.n, id: 'n-input',
    onchange: (e: Event) => {
      s.n = clamp(Math.round(+(e.target as HTMLInputElement).value), 100, 1_000_000);
      (e.target as HTMLInputElement).value = String(s.n);
      syncPresets();
      on.changed();
    },
  });
  const presets = N_PRESETS.map((n) =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(s.n === n),
      onclick: () => {
        s.n = n;
        nInput.value = String(n);
        syncPresets();
        on.changed();
      },
    }, [n >= 1_000_000 ? '1M' : n >= 1000 ? `${n / 1000}k` : String(n)]),
  );
  function syncPresets() {
    presets.forEach((b, i) => b.setAttribute('aria-pressed', String(N_PRESETS[i] === s.n)));
  }

  const seedInput = h('input', {
    type: 'number', value: s.seed, min: 0, step: 1, id: 'seed-input', disabled: s.randomiseSeed,
    onchange: (e: Event) => {
      s.seed = Math.max(0, Math.floor(+(e.target as HTMLInputElement).value) || 0);
      on.changed();
    },
  });

  return h('section', { class: 'card' }, [
    h('h2', {}, ['Simulations']),
    h('p', { class: 'sub' }, ['Each run draws one possible election day and allocates seats under MMP.']),
    h('div', { class: 'field' }, [
      h('label', { for: 'n-input' }, ['Number of simulations']),
      nInput,
      h('div', { class: 'chips' }, presets),
    ]),
    h('div', { class: 'field' }, [
      h('label', { for: 'seed-input' }, ['Random seed']),
      h('div', { class: 'row' }, [
        seedInput,
        h('button', {
          type: 'button', class: 'btn small', title: 'New random seed',
          onclick: () => {
            s.seed = randomSeed();
            seedInput.value = String(s.seed);
            on.changed();
          },
        }, ['Shuffle']),
      ]),
      h('label', { class: 'help row' }, [
        h('input', {
          type: 'checkbox', checked: s.randomiseSeed,
          onchange: (e: Event) => {
            s.randomiseSeed = (e.target as HTMLInputElement).checked;
            seedInput.disabled = s.randomiseSeed;
          },
        }),
        'New seed every run',
      ]),
      h('label', { class: 'help row' }, [
        h('input', {
          type: 'checkbox', checked: s.autoRun,
          onchange: (e: Event) => (s.autoRun = (e.target as HTMLInputElement).checked),
        }),
        'Re-run when settings change (up to 100k)',
      ]),
    ]),
    h('div', { class: 'run-row' }, [
      h('button', { type: 'button', class: 'btn primary', id: 'run-btn', onclick: on.run }, ['Run simulations']),
      h('button', { type: 'button', class: 'btn', id: 'cancel-btn', disabled: true, onclick: on.cancel }, ['Stop']),
    ]),
    h('div', { class: 'progress', 'aria-hidden': 'true' }, [h('div', { id: 'progress-fill' })]),
  ]);
}

function pollCard(state: AppState, on: ControlHandlers, rerender: () => void) {
  const s = state.settings;
  const applyBase = () => {
    const b = pollBase(VERIAN_POLLS, s.pollCount, s.halfLifeDays);
    s.shares = b.published.map((v) => round(v, 2));
    s.sampleSize = Math.round(b.sampleSize);
    rerender();
    on.changed();
  };

  const basisSelect = h('select', {
    id: 'basis',
    onchange: (e: Event) => {
      s.pollCount = +(e.target as HTMLSelectElement).value;
      applyBase();
    },
  }, [1, 2, 3, 4, 6].map((k) =>
    h('option', { value: k, selected: s.pollCount === k }, [k === 1 ? `Latest poll (${VERIAN_POLLS[0].fieldwork})` : `Weighted average of last ${k} polls`]),
  ));

  const rows = PARTIES.map((p, i) =>
    h('tr', {}, [
      h('td', {}, [h('span', { class: 'party-name' }, [h('span', { class: 'swatch', style: { background: partyColor(p.id) } }), p.name])]),
      h('td', {}, [
        h('input', {
          type: 'number', min: 0, max: 100, step: 0.1, value: s.shares[i], 'aria-label': `${p.name} party vote %`,
          class: 'num',
          oninput: (e: Event) => {
            s.shares[i] = clamp(+(e.target as HTMLInputElement).value, 0, 100);
            updateTotal(document, s.shares);
          },
          onchange: () => on.changed(),
        }),
      ]),
      h('td', {}, [
        p.contests
          ? h('select', {
              'aria-label': `${p.name} bloc`,
              onchange: (e: Event) => {
                s.blocs[i] = (e.target as HTMLSelectElement).value as Bloc;
                on.changed();
              },
            }, (['left', 'cross', 'right'] as Bloc[]).map((b) =>
              h('option', { value: b, selected: s.blocs[i] === b }, [b === 'cross' ? 'Crossbench' : b === 'left' ? 'Left' : 'Right']),
            ))
          : h('span', { class: 'faint small' }, ['No seats']),
      ]),
    ]),
  );

  return h('section', { class: 'card' }, [
    h('h2', {}, ['Party vote']),
    h('p', { class: 'sub' }, [
      'From ',
      h('a', { href: VERIAN_POLLS[0].url, target: '_blank', rel: 'noopener' }, ['1News–Verian']),
      '. Edit any figure to try a scenario. Blocs set the headline outcomes.',
    ]),
    h('div', { class: 'field' }, [h('label', { for: 'basis' }, ['Poll basis']), basisSelect]),
    s.pollCount > 1
      ? h('div', { class: 'field' }, [
          h('label', { for: 'halflife' }, ['Recency half-life (days)']),
          h('input', {
            type: 'number', id: 'halflife', min: 0, max: 720, step: 5, value: s.halfLifeDays,
            onchange: (e: Event) => {
              s.halfLifeDays = clamp(+(e.target as HTMLInputElement).value, 0, 720);
              applyBase();
            },
          }),
          h('span', { class: 'help' }, ['A poll this many days older than the latest gets half the weight. 0 = equal weights.']),
        ])
      : null,
    h('table', { class: 'party-table' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', { class: 'label', style: { textAlign: 'left' } }, ['Party']),
        h('th', { class: 'label', style: { textAlign: 'left', paddingLeft: '6px' } }, ['Vote %']),
        h('th', { class: 'label', style: { textAlign: 'left' } }, ['Bloc']),
      ])]),
      h('tbody', {}, rows),
    ]),
    h('div', { class: 'total-row' }, [h('span', { id: 'share-total' }), h('button', { type: 'button', class: 'btn small', onclick: applyBase }, ['Reset to poll'])]),
  ]);
}

function updateTotal(root: ParentNode, shares: number[]) {
  const el = root.querySelector('#share-total');
  if (!el) return;
  const total = shares.reduce((a, b) => a + b, 0);
  const off = Math.abs(total - 100) > 0.5;
  el.innerHTML = `Total <span class="${off ? 'bad' : ''} num">${total.toFixed(1)}%</span>${off ? ' · will be normalised' : ''}`;
}

function slider(
  label: string, help: string, value: number, min: number, max: number, step: number,
  set: (v: number) => void, on: ControlHandlers, fmt = (v: number) => v.toFixed(1),
) {
  const id = `sl-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const out = h('output', { for: id }, [fmt(value)]);
  return h('div', { class: 'field' }, [
    h('label', { for: id }, [label]),
    h('div', { class: 'slider-row' }, [
      h('input', {
        type: 'range', id, min, max, step, value,
        oninput: (e: Event) => {
          const v = +(e.target as HTMLInputElement).value;
          set(v);
          out.textContent = fmt(v);
        },
        onchange: () => on.changed(),
      }),
      out,
    ]),
    h('span', { class: 'help' }, [help]),
  ]);
}

function uncertaintyCard(state: AppState, on: ControlHandlers, rerender: () => void) {
  const s = state.settings;
  return collapsible('uncertainty', [
    h('summary', {}, ['Uncertainty']),
    h('div', { class: 'field' }, [
      h('label', { for: 'sample' }, ['Poll sample size']),
      h('input', {
        type: 'number', id: 'sample', min: 100, max: 50_000, step: 1, value: s.sampleSize,
        onchange: (e: Event) => {
          s.sampleSize = clamp(Math.round(+(e.target as HTMLInputElement).value), 100, 50_000);
          on.changed();
        },
      }),
      h('span', { class: 'help' }, ['Pooled effective sample when averaging several polls.']),
    ]),
    slider('Design effect', 'Inflates sampling error for weighting and clustering (1 = simple random sample).',
      s.designEffect, 1, 3, 0.1, (v) => (s.designEffect = v), on),
    slider('Polling-industry error (pts)', 'Systematic error shared by the poll, for a party on 50%; scales down for smaller parties.',
      s.systematicError, 0, 6, 0.1, (v) => (s.systematicError = v), on),
    slider('Campaign movement (pts)', 'How far opinion can shift before election day, for a party on 50%.',
      s.campaignDrift, 0, 6, 0.1, (v) => (s.campaignDrift = v), on),
    slider('Left–right swing (pts)', 'SD of a correlated swing that moves votes between the left and right blocs.',
      s.blocSwing, 0, 5, 0.1, (v) => (s.blocSwing = v), on),
    h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        Object.assign(s, {
          designEffect: DEFAULTS.designEffect,
          systematicError: DEFAULTS.systematicError,
          campaignDrift: DEFAULTS.campaignDrift,
          blocSwing: DEFAULTS.blocSwing,
        });
        rerender();
        on.changed();
      },
    }, ['Reset uncertainty']),
  ]);
}

function electorateCard(state: AppState, on: ControlHandlers, rerender: () => void) {
  const s = state.settings;
  return collapsible('electorates', [
    h('summary', {}, ['Key electorates']),
    h('p', { class: 'sub' }, [
      'Seats that can change the allocation: wins by parties under 5% (which bring list seats or overhang) and by independents. ',
      'Any probability left over goes to Labour or National.',
    ]),
    slider('Link to party vote', 'How much a party’s electorate chances rise or fall with its party-vote result in each simulation.',
      s.electorateCorrelation, 0, 2, 0.1, (v) => (s.electorateCorrelation = v), on),
    ...s.electorates.map((e) =>
      h('div', { class: 'elec' }, [
        h('div', { class: 'elec-name' }, [e.name, h('span', { class: 'tag' }, [e.maori ? 'Māori' : 'General'])]),
        h('div', { class: 'elec-note' }, [e.note]),
        ...e.candidates.map((c) =>
          h('div', { class: 'cand' }, [
            h('span', { class: 'party-name' }, [
              h('span', { class: 'swatch', style: { background: c.party === 'IND' ? 'var(--text-3)' : partyColor(c.party) } }),
              c.label,
            ]),
            h('input', {
              type: 'number', min: 0, max: 100, step: 1, value: Math.round(c.p * 100), class: 'num',
              'aria-label': `${c.label} win probability in ${e.name} (%)`,
              onchange: (ev: Event) => {
                c.p = clamp(+(ev.target as HTMLInputElement).value, 0, 100) / 100;
                const total = e.candidates.reduce((a, x) => a + x.p, 0);
                if (total > 1) e.candidates.forEach((x) => (x.p /= total));
                on.changed();
              },
            }),
          ]),
        ),
      ]),
    ),
    h('button', {
      type: 'button', class: 'btn small', style: { marginTop: '8px' },
      onclick: () => {
        s.electorates = cloneElectorates();
        s.electorateCorrelation = DEFAULTS.electorateCorrelation;
        rerender();
        on.changed();
      },
    }, ['Reset electorates']),
  ]);
}
