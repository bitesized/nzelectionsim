import { PARTIES, PARTY_IDS, type Bloc } from '../data/polls';
import { EVENT_KEYS, findOddities, RECORD_KEYS, type EventKey, type OddityOptions, type Oddities, type OddRecord, type RecordKey } from '../engine/oddities';
import type { SimRaw } from '../engine/simulate';
import { h } from './charts';
import { fmtInt, fmtProb1, oneIn, partyColor, partyName } from './format';
import { parliamentOf, type ResultHandlers } from './results';
import type { AppState } from './state';

const BLOC_LABEL: Record<Bloc, string> = { left: 'Left', right: 'Right', cross: 'Crossbench' };

const EVENTS: Record<EventKey, { title: string; desc: string }> = {
  singleMajority: { title: 'One party governs alone', desc: 'A single party wins a majority, which has happened only once under MMP: Labour won 65 of 120 seats in 2020.' },
  minorLargest: { title: 'A minor party is largest', desc: 'A party other than National or Labour wins (or ties for) the most seats.' },
  minorBeatsMajor: { title: 'Minor party out-polls a major', desc: 'Say, the Greens beat Labour or ACT beats National on the party vote.' },
  largestTie: { title: 'Dead heat for largest party', desc: 'Two parties tie for the most seats.' },
  blocTie: { title: 'Blocs dead level', desc: 'Left and right finish with exactly the same number of seats.' },
  knifeEdge: { title: 'Majority of one', desc: 'A bloc has exactly the seats it needs to govern, with none to spare.' },
  deadlock: { title: 'Nobody can govern', desc: 'Neither bloc reaches a majority, even with the crossbench.' },
  bigOverhang: { title: 'Overhang of three or more', desc: 'Electorate wins push the House to 123 seats or more.' },
  independent: { title: 'An independent gets in', desc: 'An independent candidate wins an electorate.' },
  nearMiss: { title: 'So close: 4.5% and nothing', desc: 'A party wins at least 4.5% of the vote but no electorate, so it gets no seats.' },
  allIn: { title: 'Everyone makes it', desc: 'Every party in the model wins at least one seat.' },
  inversion: { title: 'More votes, fewer seats', desc: 'A party out-polls another but ends up with fewer seats.' },
};

const pName = (i: number) => partyName(PARTY_IDS[i]);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function options(state: AppState): OddityOptions {
  return {
    blocs: state.settings.blocs,
    eligible: PARTIES.map((p) => p.contests),
    majors: [PARTY_IDS.indexOf('NAT'), PARTY_IDS.indexOf('LAB')],
  };
}

const cache = new WeakMap<SimRaw, { key: string; odd: Oddities }>();
function oddities(state: AppState): Oddities {
  const raw = state.raw!;
  const key = state.settings.blocs.join();
  const hit = cache.get(raw);
  if (hit?.key === key) return hit.odd;
  const odd = findOddities(raw, options(state));
  cache.set(raw, { key, odd });
  return odd;
}

/** The unusual events a single simulation matches. */
function tagsFor(state: AppState, sim: number): EventKey[] {
  const raw = state.raw!;
  const P = raw.parties;
  const one: SimRaw = {
    n: 1,
    parties: P,
    shares: raw.shares.subarray(sim * P, sim * P + P),
    seats: raw.seats.subarray(sim * P, sim * P + P),
    electorates: raw.electorates.subarray(sim * P, sim * P + P),
    house: raw.house.subarray(sim, sim + 1),
    independents: raw.independents.subarray(sim, sim + 1),
  };
  const odd = findOddities(one, options(state));
  return EVENT_KEYS.filter((k) => odd.events[k].count > 0);
}

function describeRecord(state: AppState, key: RecordKey, r: OddRecord): { title: string; value: string; detail: string } {
  const raw = state.raw!;
  const P = raw.parties;
  const share = (i: number) => raw.shares[r.sim * P + i];
  const seats = (i: number) => raw.seats[r.sim * P + i];
  switch (key) {
    case 'landslide':
      return { title: 'Biggest landslide', value: plural(r.value, 'seat'), detail: `${pName(r.party)} on ${share(r.party).toFixed(1)}% of the party vote.` };
    case 'fragmented':
      return { title: 'Most fragmented House', value: plural(r.value, 'seat'), detail: `The largest party, ${pName(r.party)}, won only ${r.value}.` };
    case 'heartbreak':
      // Round down so a near-miss on 4.996% doesn't read as 5.0%.
      return { title: 'Most votes for nothing', value: `${(Math.floor(r.value * 100) / 100).toFixed(2)}%`, detail: `${pName(r.party)} missed the threshold and won no electorate, so got no seats.` };
    case 'lifeboat': {
      const e = raw.electorates[r.sim * P + r.party];
      return {
        title: 'Fewest votes to get in', value: `${r.value.toFixed(1)}%`,
        detail: `${pName(r.party)} won ${plural(seats(r.party), 'seat')} on the back of ${plural(e, 'electorate')}.`,
      };
    }
    case 'wasted':
      return { title: 'Most wasted vote', value: `${r.value.toFixed(1)}%`, detail: 'of party votes went to parties that won no seats.' };
    case 'inversion':
      return r.sim < 0
        ? { title: 'More votes, fewer seats', value: '—', detail: 'Never happened in these runs.' }
        : {
            title: 'More votes, fewer seats', value: `+${r.value.toFixed(1)} pts`,
            detail: `${pName(r.party)} out-polled ${pName(r.other)} but won ${seats(r.party)} seats to their ${seats(r.other)}.`,
          };
    case 'bigHouse':
      return { title: 'Biggest House', value: plural(r.value, 'seat'), detail: r.value > 120 ? `${plural(r.value - 120, 'overhang seat')}.` : 'No overhang in any run.' };
    case 'blocRout': {
      const blocs = state.settings.blocs;
      let right = 0, left = 0;
      for (let i = 0; i < P; i++) {
        if (blocs[i] === 'right') right += seats(i);
        else if (blocs[i] === 'left') left += seats(i);
      }
      return { title: 'Biggest bloc rout', value: `+${r.value}`, detail: `${BLOC_LABEL[r.bloc ?? 'right']} bloc wins ${Math.max(right, left)} seats to ${Math.min(right, left)}.` };
    }
    case 'crowded':
    case 'sparse': {
      const inParl = PARTY_IDS.filter((_, i) => seats(i) > 0).join(', ');
      return { title: key === 'crowded' ? 'Most crowded House' : 'Emptiest House', value: plural(r.value, 'party', 'parties'), detail: inParl };
    }
  }
}

const randomOf = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function exhibitCard(state: AppState, on: ResultHandlers, odd: Oddities) {
  const pick = state.funPick ?? { sim: odd.records.landslide.sim, reason: 'Biggest landslide' };
  const { hemi, legend, shareLine, summary } = parliamentOf(state, pick.sim);
  const tags = tagsFor(state, pick.sim);
  const happened = EVENT_KEYS.filter((k) => odd.events[k].count > 0);

  return h('section', { class: 'card', id: 'fun-exhibit' }, [
    h('div', { class: 'card-head' }, [
      h('div', {}, [
        h('div', { class: 'eyebrow' }, [`Simulation #${fmtInt(pick.sim + 1)}`]),
        h('h2', { class: 'exhibit-title' }, [pick.reason]),
      ]),
      h('button', {
        type: 'button', class: 'btn', disabled: happened.length === 0,
        onclick: () => {
          const k = randomOf(happened);
          state.funPick = { sim: randomOf(odd.events[k].examples), reason: EVENTS[k].title };
          on.refresh();
        },
      }, ['Surprise me']),
    ]),
    h('div', { class: 'exhibit' }, [
      h('div', {}, [hemi, legend]),
      h('div', { class: 'exhibit-side' }, [
        h('p', { class: 'exhibit-summary' }, [summary]),
        tags.length
          ? h('div', { class: 'chips' }, tags.map((k) => h('span', { class: 'chip', title: EVENTS[k].desc }, [EVENTS[k].title])))
          : null,
        shareLine,
      ]),
    ]),
  ]);
}

function show(state: AppState, on: ResultHandlers, sim: number, reason: string) {
  state.funPick = { sim, reason };
  on.refresh();
  document.getElementById('fun-exhibit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function recordsCard(state: AppState, on: ResultHandlers, odd: Oddities) {
  return h('section', { class: 'card' }, [
    h('h2', {}, ['Record book']),
    h('p', { class: 'sub' }, [`The most extreme results in ${fmtInt(odd.n)} simulations. Choose one to see that Parliament.`]),
    h('div', { class: 'record-grid' }, RECORD_KEYS.map((key) => {
      const r = odd.records[key];
      const d = describeRecord(state, key, r);
      const color = r.party >= 0 ? partyColor(PARTY_IDS[r.party]) : r.bloc ? `var(--${r.bloc})` : 'var(--accent)';
      const tile = h('button', {
        type: 'button', class: 'tile record', disabled: r.sim < 0,
        onclick: () => show(state, on, r.sim, d.title),
      }, [
        h('div', { class: 'k' }, [d.title]),
        h('div', { class: 'v' }, [d.value]),
        h('div', { class: 'd' }, [d.detail]),
      ]);
      tile.style.setProperty('--tile-color', color);
      return tile;
    })),
  ]);
}

function eventsCard(state: AppState, on: ResultHandlers, odd: Oddities) {
  const happened = EVENT_KEYS.filter((k) => odd.events[k].count > 0).sort((a, b) => odd.events[a].count - odd.events[b].count);
  const never = EVENT_KEYS.filter((k) => odd.events[k].count === 0);
  return h('section', { class: 'card' }, [
    h('h2', {}, ['Strange things that happened']),
    h('p', { class: 'sub' }, ['Unusual outcomes, rarest first. Choose one to see an example.']),
    h('ul', { class: 'events' }, happened.map((k) => {
      const e = odd.events[k];
      const p = e.count / odd.n;
      return h('li', {}, [h('button', {
        type: 'button', class: 'event', title: EVENTS[k].desc,
        onclick: () => show(state, on, randomOf(e.examples), EVENTS[k].title),
      }, [
        h('span', { class: 'event-name' }, [h('strong', {}, [EVENTS[k].title]), h('span', { class: 'small faint' }, [EVENTS[k].desc])]),
        // Square-root scale so rare events still show a visible sliver.
        h('span', { class: 'event-bar', 'aria-hidden': 'true' }, [h('span', { style: { width: `${Math.sqrt(p) * 100}%` } })]),
        h('span', { class: 'event-odds num' }, [h('strong', {}, [fmtProb1(p)]), h('span', { class: 'small faint' }, [oneIn(p)])]),
      ])]);
    })),
    never.length
      ? h('p', { class: 'small muted never' }, [
          h('strong', {}, ['Never happened: ']),
          ...never.flatMap((k, i) => [i ? ' · ' : '', h('span', { title: EVENTS[k].desc }, [EVENTS[k].title])]),
        ])
      : null,
  ]);
}

export function funTab(state: AppState, on: ResultHandlers): HTMLElement[] {
  if (!state.raw) {
    return [h('section', { class: 'card empty' }, [state.running ? 'Running simulations…' : 'Run some simulations to find the strangest results.'])];
  }
  const odd = oddities(state);
  return [exhibitCard(state, on, odd), recordsCard(state, on, odd), eventsCard(state, on, odd)];
}
