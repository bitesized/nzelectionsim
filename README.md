# NZ Election Simulator 2026

A browser app that runs Monte Carlo simulations of the 7 November 2026 New Zealand general election. It starts from the latest 1News–Verian poll and allocates seats using the MMP rules in the Electoral Act.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including an exact replay of the 2023 seat allocation
npm run build    # static site in dist/ (works from any path)
```

## What it does

- Runs **100 to 1,000,000 simulations** in a Web Worker with a progress bar and a Stop button. You can set a seed so results are reproducible.
- Uses the **latest 1News–Verian poll** (23–27 Sep 2026) or a recency-weighted average of the last 2–6 Verian polls. You can edit any party's vote share to try your own scenario.
- Models uncertainty in four parts: sampling error (Dirichlet, scaled by sample size and design effect), polling-industry error, movement during the campaign, and a correlated left–right swing.
- Simulates **key electorates** that can change the result: Te Pāti Māori and Te Tai Tokerau Party in the Māori seats, Epsom, Ilam, Northland, and an independent in Te Tai Tonga. Each probability can be edited and moves with the party's vote in that simulation.
- **MMP allocation**: a party needs 5% or one electorate to get list seats, seats won by independents come off the 120, the rest are shared by Sainte-Laguë, and overhang is kept.

Results include:
- the chance of a right-bloc or left-bloc majority, a hung Parliament where the crossbench decides, or no possible majority (bloc membership can be edited)
- a hemicycle of a typical simulated Parliament, or of one election picked at random
- a median seat count and 50%/90% range for each party, plus each party's full seat distribution
- coalition odds for preset coalitions, plus a builder for your own (saved in your browser)
- each bloc's distance from a majority
- the chance of clearing the 5% threshold for parties near it
- which party is largest, how often overhang happens and the House size, and how many electorates Te Pāti Māori wins
- the most common exact seat splits
- the history of 1News–Verian polls since the 2023 election
- a **Fun** tab: a record book of the most extreme runs (biggest landslide, most votes for no seats, biggest House…), how often strange things happen (a minor party winning the most seats, a dead-level Parliament, an independent getting in…), and a hemicycle of any of those elections
- exports: a summary JSON, a CSV of every simulation, and a share link that stores all settings in the URL

## Updating the polls

All poll data and electorate assumptions are in `src/data/polls.ts`. To add a new poll, put a new entry at the top of `VERIAN_POLLS` and the app will use it by default.

## Layout

```
src/data/polls.ts        poll history, parties, key electorates
src/engine/allocate.ts   MMP / Sainte-Laguë seat allocation
src/engine/simulate.ts   Monte Carlo core
src/engine/analyze.ts    summaries, bloc outcomes, coalition odds
src/engine/oddities.ts   records and rare events for the Fun tab
src/engine/pollBase.ts   poll averaging and effective sample size
src/engine/worker.ts     Web Worker wrapper
src/ui/                  controls, results, SVG charts
tests/                   Vitest tests for the engine
```
