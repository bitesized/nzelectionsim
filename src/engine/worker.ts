import { runSimulations, type SimConfig } from './simulate';

export type WorkerRequest = { type: 'run'; config: SimConfig };
export type WorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; raw: import('./simulate').SimRaw; ms: number }
  | { type: 'error'; message: string };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  if (ev.data.type !== 'run') return;
  const { config } = ev.data;
  const t0 = performance.now();
  try {
    const every = Math.max(1000, Math.floor(config.n / 100));
    const raw = runSimulations(config, (done) => post({ type: 'progress', done, total: config.n }), every);
    post({ type: 'done', raw, ms: performance.now() - t0 }, [
      raw.shares.buffer, raw.seats.buffer, raw.electorates.buffer, raw.house.buffer, raw.independents.buffer,
    ]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
