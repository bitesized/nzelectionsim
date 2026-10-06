// Source data for the simulator.
//
// Party vote figures are the published 1News–Verian results, as tabulated at
// https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_New_Zealand_general_election
// (retrieved 6 October 2026). Verian reports parties at 4% and above to the
// nearest whole number and smaller parties to one decimal place.

export type PartyId = 'NAT' | 'LAB' | 'GRN' | 'ACT' | 'NZF' | 'TPM' | 'OPP' | 'TTT' | 'OTH';
export type Bloc = 'right' | 'left' | 'cross';

export interface Party {
  id: PartyId;
  name: string;
  short: string;
  /** Default bloc membership; editable in the UI. */
  bloc: Bloc;
  color: { light: string; dark: string };
  /** "Other" is never allocated seats; it only soaks up wasted vote. */
  contests: boolean;
}

export const PARTIES: Party[] = [
  { id: 'NAT', name: 'National', short: 'NAT', bloc: 'right', color: { light: '#1d5fb4', dark: '#4f8fe0' }, contests: true },
  { id: 'LAB', name: 'Labour', short: 'LAB', bloc: 'left', color: { light: '#d0312d', dark: '#e8615c' }, contests: true },
  { id: 'GRN', name: 'Green', short: 'GRN', bloc: 'left', color: { light: '#1d8a3c', dark: '#3fb062' }, contests: true },
  { id: 'ACT', name: 'ACT', short: 'ACT', bloc: 'right', color: { light: '#d9a800', dark: '#e8c21c' }, contests: true },
  { id: 'NZF', name: 'NZ First', short: 'NZF', bloc: 'right', color: { light: '#3d3d3d', dark: '#a8a8a8' }, contests: true },
  { id: 'TPM', name: 'Te Pāti Māori', short: 'TPM', bloc: 'left', color: { light: '#8e2140', dark: '#d2678a' }, contests: true },
  { id: 'OPP', name: 'Opportunity', short: 'OPP', bloc: 'cross', color: { light: '#13a194', dark: '#2fc4b5' }, contests: true },
  { id: 'TTT', name: 'Te Tai Tokerau Party', short: 'TTT', bloc: 'left', color: { light: '#7a4fc0', dark: '#a68be6' }, contests: true },
  { id: 'OTH', name: 'Other', short: 'OTH', bloc: 'cross', color: { light: '#9b9a95', dark: '#77766f' }, contests: false },
];

export const PARTY_IDS = PARTIES.map((p) => p.id);
export const partyIndex = (id: PartyId) => PARTY_IDS.indexOf(id);

export interface Poll {
  /** Last day of fieldwork, ISO date. */
  date: string;
  fieldwork: string;
  sample: number;
  url: string;
  /** Party vote percentages. Missing parties are treated as 0. */
  vote: Partial<Record<PartyId, number>>;
}

export const VERIAN_POLLS: Poll[] = [
  {
    date: '2026-10-05', fieldwork: '1–5 Oct 2026', sample: 1001,
    url: 'https://www.1news.co.nz/2026/10/06/poll-opportunity-still-in-kingmaker-seat-as-greens-hold-strong/',
    vote: { NAT: 29, LAB: 28, GRN: 16, ACT: 9, NZF: 10, TPM: 1, OPP: 7, OTH: 1 },
  },
  {
    date: '2026-09-27', fieldwork: '23–27 Sep 2026', sample: 1004,
    url: 'https://www.1news.co.nz/2026/09/28/poll-greens-surge-to-best-result-ever-as-national-labour-slide-further/',
    vote: { NAT: 28, LAB: 28, GRN: 16, ACT: 11, NZF: 9, TPM: 1.2, OPP: 6, OTH: 1 },
  },
  {
    date: '2026-08-11', fieldwork: '8–11 Aug 2026', sample: 847,
    url: 'https://www.scribd.com/document/1073125712/8-11-August-2026-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 29, LAB: 30, GRN: 12, ACT: 9, NZF: 8, TPM: 1.1, OPP: 8, TTT: 0.2, OTH: 2.5 },
  },
  {
    date: '2026-06-17', fieldwork: '13–17 Jun 2026', sample: 1001,
    url: 'https://www.scribd.com/document/1054188547/13-17-June-2026-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 29, LAB: 32, GRN: 13, ACT: 6, NZF: 11, TPM: 1.8, OPP: 4.6, OTH: 1.5 },
  },
  {
    date: '2026-04-15', fieldwork: '11–15 Apr 2026', sample: 1010,
    url: 'https://www.scribd.com/document/1028300076/11-15-April-2026-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 30, LAB: 37, GRN: 11, ACT: 7, NZF: 10, TPM: 1.5, OPP: 3.3, OTH: 1.2 },
  },
  {
    date: '2026-02-11', fieldwork: '7–11 Feb 2026', sample: 1003,
    url: 'https://www.scribd.com/document/998545712/7-11-Feb-2026-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 34, LAB: 32, GRN: 11, ACT: 9, NZF: 10, TPM: 2, OPP: 1, OTH: 1.7 },
  },
  {
    date: '2025-12-03', fieldwork: '29 Nov – 3 Dec 2025', sample: 1007,
    url: 'https://www.scribd.com/document/962599976/29-Nov-3-Dec-2025-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 36, LAB: 35, GRN: 7, ACT: 10, NZF: 9, TPM: 0.6, OPP: 0.4, OTH: 2.4 },
  },
  {
    date: '2025-10-08', fieldwork: '4–8 Oct 2025', sample: 1014,
    url: 'https://www.scribd.com/document/932137523/October-2025-1News-Verian-Poll-Report',
    vote: { NAT: 34, LAB: 32, GRN: 11, ACT: 8, NZF: 9, TPM: 2.8, OPP: 0.8, OTH: 2.4 },
  },
  {
    date: '2025-08-06', fieldwork: '2–6 Aug 2025', sample: 1002,
    url: 'https://www.scribd.com/document/899969344/2-6-Aug-2025-1News-Verian-Poll-Report',
    vote: { NAT: 34, LAB: 33, GRN: 10, ACT: 8, NZF: 9, TPM: 3.7, OPP: 1.3, OTH: 1 },
  },
  {
    date: '2025-05-28', fieldwork: '24–28 May 2025', sample: 1002,
    url: 'https://www.scribd.com/document/871022558/24-28-May-2025-1News-Verian-Poll-Report',
    vote: { NAT: 34, LAB: 29, GRN: 12, ACT: 8, NZF: 8, TPM: 3.7, OPP: 1.3, OTH: 3.9 },
  },
  {
    date: '2025-04-02', fieldwork: '29 Mar – 2 Apr 2025', sample: 1000,
    url: 'https://www.scribd.com/document/846941432/29Mar-2Apr-2025-1-NEWS-Verian-Poll-First-Report',
    vote: { NAT: 36, LAB: 32, GRN: 10, ACT: 9, NZF: 7, TPM: 3.4, OPP: 2.1, OTH: 1.3 },
  },
  {
    date: '2025-02-07', fieldwork: '3–7 Feb 2025', sample: 1002,
    url: 'https://www.scribd.com/document/826079900/3-7-Feb-2025-1-NEWS-Verian-Poll-Report',
    vote: { NAT: 34, LAB: 33, GRN: 10, ACT: 9, NZF: 5, TPM: 3.7, OPP: 1.9, OTH: 3.6 },
  },
  {
    date: '2024-12-04', fieldwork: '30 Nov – 4 Dec 2024', sample: 1006,
    url: 'https://www.scribd.com/document/802497790/30-Nov-4-Dec-2024-1-NEWS-Verian-Poll-Report-Short-Report',
    vote: { NAT: 37, LAB: 29, GRN: 10, ACT: 8, NZF: 6, TPM: 7, OPP: 1.5, OTH: 2 },
  },
  {
    date: '2024-10-09', fieldwork: '5–9 Oct 2024', sample: 1000,
    url: 'https://www.scribd.com/document/779677361/5-9-Oct-2024-1-NEWS-Verian-Poll-Report-Short-Report',
    vote: { NAT: 37, LAB: 29, GRN: 12, ACT: 8, NZF: 5, TPM: 3.8, OPP: 2.6, OTH: 2.3 },
  },
  {
    date: '2024-08-14', fieldwork: '10–14 Aug 2024', sample: 1001,
    url: 'https://www.scribd.com/document/760275508/10-14Aug-2024-1-NEWS-Verian-Poll-Report-Short-Report',
    vote: { NAT: 38, LAB: 30, GRN: 11, ACT: 7, NZF: 6, TPM: 4.2, OPP: 1.1, OTH: 2.8 },
  },
  {
    date: '2024-06-19', fieldwork: '15–19 Jun 2024', sample: 1002,
    url: 'https://www.scribd.com/document/745142232/15-19-Jun-2024-1-NEWS-Verian-Poll-Report-Short-Report',
    vote: { NAT: 38, LAB: 29, GRN: 13, ACT: 7, NZF: 6, TPM: 3.3, OPP: 1.5, OTH: 2.1 },
  },
];

/** The 2023 general election (final count), for reference on the trend chart. */
export const ELECTION_2023 = {
  date: '2023-10-14',
  vote: { NAT: 38.06, LAB: 26.91, GRN: 11.6, ACT: 8.64, NZF: 6.08, TPM: 3.08, OPP: 2.22, OTH: 3.41 } as Partial<Record<PartyId, number>>,
};

export const ELECTION_DATE = '2026-11-07';
export const LIST_SEATS_TOTAL = 120;
export const THRESHOLD = 5;

/**
 * Electorates where the winner can change the seat allocation — i.e. seats a
 * party below 5% could win (giving it list seats / overhang), or seats an
 * independent could win (removing one seat from the 120). Seats won by
 * National or Labour elsewhere don't change the result because each will hold
 * fewer electorates than its party-vote entitlement.
 *
 * Probabilities are judgement calls informed by the 2023 results and the
 * September 2026 Whakaata Māori–Curia electorate polls (Te Tai Hauāuru: TPM 46,
 * LAB 34; Te Tai Tonga: LAB 36, TPM 21, GRN 19, Ferris (IND) 18). They are all
 * editable in the app. Any probability left over goes to "a major party".
 */
export interface ElectorateCandidate {
  party: PartyId | 'IND';
  label: string;
  /** Win probability, 0–1. */
  p: number;
}

export interface Electorate {
  name: string;
  maori: boolean;
  candidates: ElectorateCandidate[];
  note: string;
}

export const KEY_ELECTORATES: Electorate[] = [
  {
    name: 'Waiariki', maori: true,
    candidates: [{ party: 'TPM', label: 'Rawiri Waititi (TPM)', p: 0.85 }],
    note: 'Co-leader’s seat; held comfortably in 2023.',
  },
  {
    name: 'Te Tai Hauāuru', maori: true,
    candidates: [{ party: 'TPM', label: 'Debbie Ngarewa-Packer (TPM)', p: 0.72 }],
    note: 'Sep 2026 Curia poll: TPM 46, LAB 34.',
  },
  {
    name: 'Hauraki-Waikato', maori: true,
    candidates: [{ party: 'TPM', label: 'Hana-Rawhiti Maipi-Clarke (TPM)', p: 0.62 }],
    note: 'Won from Labour in 2023.',
  },
  {
    name: 'Tāmaki Makaurau', maori: true,
    candidates: [{ party: 'TPM', label: 'Oriini Kaipara (TPM)', p: 0.55 }],
    note: 'Held at the 2025 by-election.',
  },
  {
    name: 'Te Tai Tokerau', maori: true,
    candidates: [
      { party: 'TTT', label: 'Mariameno Kapa-Kingi (TTT)', p: 0.38 },
      { party: 'TPM', label: 'Te Pāti Māori candidate', p: 0.17 },
    ],
    note: 'Sitting MP left TPM in May 2026 to found the Te Tai Tokerau Party; three-way contest with Labour.',
  },
  {
    name: 'Te Tai Tonga', maori: true,
    candidates: [
      { party: 'TPM', label: 'Te Pāti Māori candidate', p: 0.14 },
      { party: 'IND', label: 'Tākuta Ferris (Independent)', p: 0.12 },
    ],
    note: 'Sep 2026 Curia poll: LAB 36, TPM 21, GRN 19, Ferris 18.',
  },
  {
    name: 'Ikaroa-Rāwhiti', maori: true,
    candidates: [{ party: 'TPM', label: 'Te Pāti Māori candidate', p: 0.3 }],
    note: 'Labour hold in 2023.',
  },
  {
    name: 'Epsom', maori: false,
    candidates: [{ party: 'ACT', label: 'David Seymour (ACT)', p: 0.92 }],
    note: 'ACT leader’s seat since 2014. Only matters if ACT drops below 5%.',
  },
  {
    name: 'Ilam', maori: false,
    candidates: [{ party: 'OPP', label: 'Raf Manji (OPP)', p: 0.15 }],
    note: 'Opportunity’s best electorate in 2023. Matters if OPP drops below 5%.',
  },
  {
    name: 'Northland', maori: false,
    candidates: [{ party: 'NZF', label: 'Shane Jones (NZF)', p: 0.25 }],
    note: 'NZ First’s strongest electorate. Matters if NZF drops below 5%.',
  },
];
