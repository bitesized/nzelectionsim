// Minimal SVG chart primitives. Every chart is redrawn from data on each
// render, sized to its container, and carries a hover tooltip.

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined | null>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, children: (SVGElement | string)[] = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k in node && typeof v !== 'string') (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

// ---------- Tooltip ----------

const tip = () => document.getElementById('tooltip') as HTMLDivElement;

export function showTip(html: string, ev: MouseEvent | PointerEvent) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14;
  const { innerWidth: vw, innerHeight: vh } = window;
  const r = t.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + r.width > vw - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > vh - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() {
  tip().hidden = true;
}

export function bindTip(node: Element, html: () => string) {
  node.addEventListener('pointermove', (e) => showTip(html(), e as PointerEvent));
  node.addEventListener('pointerleave', hideTip);
}

export const ttRow = (label: string, value: string, color?: string) =>
  `<div class="tt-row"><span>${color ? `<i style="background:${color}"></i>` : ''}${label}</span><strong>${value}</strong></div>`;

// ---------- Scales & helpers ----------

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Path for a bar with rounded top corners only (data-end rounding, baseline square). */
function barPath(x: number, y: number, w: number, hgt: number, r: number) {
  if (hgt <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hgt}Z`;
}

function width(container: HTMLElement, fallback = 600) {
  return Math.max(240, Math.floor(container.clientWidth || fallback));
}

// ---------- Histogram ----------

export interface HistogramOpts {
  /** counts[k] is the frequency of x = xStart + k·binWidth. */
  counts: number[];
  xStart?: number;
  binWidth?: number;
  total: number;
  color: string | ((x: number) => string);
  height?: number;
  xDomain?: [number, number];
  vline?: { x: number; label: string };
  xFormat?: (x: number) => string;
  tip: (x: number, count: number) => string;
  xTicks?: number;
}

export function histogram(container: HTMLElement, o: HistogramOpts) {
  container.replaceChildren();
  const W = width(container);
  const H = o.height ?? 120;
  const m = { t: 14, r: 6, b: 22, l: 6 };
  const bw = o.binWidth ?? 1;
  const xs = o.xStart ?? 0;

  let lo = 0, hi = o.counts.length - 1;
  while (lo < hi && !o.counts[lo]) lo++;
  while (hi > lo && !o.counts[hi]) hi--;
  let d0 = o.xDomain ? o.xDomain[0] : xs + lo * bw;
  let d1 = o.xDomain ? o.xDomain[1] : xs + (hi + 1) * bw;
  // Keep bars from becoming slabs when there are only a few bins.
  const minBins = Math.ceil((W - m.l - m.r) / 36);
  const bins = Math.round((d1 - d0) / bw);
  if (bins < minBins) {
    const extra = minBins - bins;
    const left = Math.min(Math.floor(extra / 2), Math.round((d0 - xs) / bw));
    d0 -= left * bw;
    d1 += (extra - left) * bw;
  }

  const x = linear(d0, d1, m.l, W - m.r);
  const maxC = Math.max(1, ...o.counts.slice(lo, hi + 1));
  const y = linear(0, maxC, H - m.b, m.t);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const bars = svg('g');
  const pxPerBin = x(d0 + bw) - x(d0);
  const gap = pxPerBin > 6 ? 2 : pxPerBin > 3 ? 1 : 0;

  for (let k = 0; k < o.counts.length; k++) {
    const c = o.counts[k];
    const xv = xs + k * bw;
    if (xv < d0 - 1e-9 || xv + bw > d1 + 1e-9) continue;
    const x0 = x(xv) + gap / 2;
    const w = Math.max(0.5, pxPerBin - gap);
    const color = typeof o.color === 'function' ? o.color(xv) : o.color;
    if (c > 0) {
      bars.append(svg('path', { d: barPath(x0, y(c), w, H - m.b - y(c), Math.min(4, w / 2)), fill: color }));
    }
    const hit = svg('rect', { x: x0 - gap / 2, y: m.t, width: pxPerBin, height: H - m.t - m.b, class: 'hit' });
    bindTip(hit, () => o.tip(xv, c));
    bars.append(hit);
  }
  root.append(svg('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'baseline' }));
  root.append(bars);

  const ticks = niceTicks(d0, d1 - bw, o.xTicks ?? Math.max(3, Math.floor(W / 70)))
    .filter((t) => bw !== 1 || Number.isInteger(t));
  const fmt = o.xFormat ?? ((v: number) => String(v));
  for (const t of ticks) {
    root.append(svg('text', { x: x(t + bw / 2), y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, [fmt(t)]));
  }
  if (o.vline && o.vline.x >= d0 && o.vline.x <= d1) {
    const vx = x(o.vline.x);
    root.append(svg('line', { x1: vx, x2: vx, y1: m.t - 6, y2: H - m.b, stroke: 'var(--text)', 'stroke-width': 1.5 }));
    root.append(svg('text', { x: vx + 4, y: m.t - 2, class: 'value-label', 'font-size': 11 }, [o.vline.label]));
  }
  container.append(root);
}

// ---------- Interval (dot + range) chart ----------

export interface IntervalRow {
  label: string;
  /** Used instead of `label` when the chart is narrow. */
  shortLabel: string;
  color: string;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  right: string;
  tip: string;
}

export function intervalChart(container: HTMLElement, rows: IntervalRow[], maxX: number, unit = 'seats') {
  container.replaceChildren();
  const W = width(container);
  const rowH = 30;
  const narrow = W < 520;
  const m = narrow ? { t: 8, r: 84, b: 24, l: 44 } : { t: 8, r: 120, b: 24, l: 136 };
  const H = m.t + m.b + rows.length * rowH;
  const x = linear(0, maxX, m.l, W - m.r);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Projected ${unit} by party` });

  const grid = svg('g', { class: 'grid' });
  for (const t of niceTicks(0, maxX, Math.max(3, Math.floor((W - m.l - m.r) / 70)))) {
    grid.append(svg('line', { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }));
    root.append(svg('text', { x: x(t), y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, [String(t)]));
  }
  root.prepend(grid);

  rows.forEach((r, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    const g = svg('g', { class: 'hover-target' });
    g.append(svg('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit' }));
    g.append(svg('text', { x: m.l - 12, y: cy + 4, 'text-anchor': 'end', class: 'value-label', 'font-weight': 500 }, [narrow ? r.shortLabel : r.label]));
    g.append(svg('line', { x1: x(r.p05), x2: x(r.p95), y1: cy, y2: cy, stroke: r.color, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55 }));
    const w50 = Math.max(4, x(r.p75) - x(r.p25));
    g.append(svg('rect', { x: x(r.p25) - (w50 === 4 ? 2 : 0), y: cy - 5, width: w50, height: 10, rx: 4, fill: r.color, opacity: 0.35 }));
    g.append(svg('circle', { cx: x(r.p50), cy, r: 6, fill: r.color, stroke: 'var(--surface)', 'stroke-width': 2 }));
    g.append(svg('text', { x: W - m.r + 12, y: cy + 4, class: 'num' }, [r.right]));
    bindTip(g, () => r.tip);
    root.append(g);
  });
  container.append(root);
}

// ---------- Poll trend line chart ----------

export interface LineSeries {
  label: string;
  color: string;
  points: { t: number; v: number }[];
}

export function lineChart(
  container: HTMLElement,
  series: LineSeries[],
  opts: { events?: { t: number; label: string }[]; tip: (t: number) => string; yMax?: number; height?: number },
) {
  container.replaceChildren();
  const W = width(container);
  const H = opts.height ?? 300;
  const m = { t: 16, r: 92, b: 26, l: 34 };
  const allT = series.flatMap((s) => s.points.map((p) => p.t));
  const t0 = Math.min(...allT), t1 = Math.max(...allT);
  const yMax = opts.yMax ?? Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p.v))) / 5) * 5;
  const x = linear(t0, t1, m.l, W - m.r);
  const y = linear(0, yMax, H - m.b, m.t);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Party vote in 1News–Verian polls over time' });

  const grid = svg('g', { class: 'grid' });
  for (const v of niceTicks(0, yMax, 5)) {
    grid.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    root.append(svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis-label' }, [`${v}%`]));
  }
  root.append(grid);

  // Year ticks
  const startYear = new Date(t0).getUTCFullYear();
  const endYear = new Date(t1).getUTCFullYear();
  for (let yr = startYear; yr <= endYear; yr++) {
    for (const mo of [0, 6]) {
      const t = Date.UTC(yr, mo, 1);
      if (t < t0 || t > t1) continue;
      const label = mo === 0 ? String(yr) : `Jul ${String(yr).slice(2)}`;
      root.append(svg('text', { x: x(t), y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, [label]));
    }
  }

  // 5% threshold reference
  root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(5), y2: y(5), stroke: 'var(--text-3)', 'stroke-width': 1 }));
  root.append(svg('text', { x: m.l + 4, y: y(5) - 4, class: 'axis-label' }, ['5% threshold']));

  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    root.append(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }
  for (const s of series) {
    for (const p of s.points) {
      root.append(svg('circle', { cx: x(p.t), cy: y(p.v), r: 3, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    }
  }

  // Direct end labels with simple collision avoidance.
  const ends = series
    .map((s) => ({ s, y: y(s.points[s.points.length - 1].v) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const overflow = ends.length ? ends[ends.length - 1].y - (H - m.b) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;
  for (const e of ends) {
    const last = e.s.points[e.s.points.length - 1];
    root.append(svg('text', { x: W - m.r + 10, y: e.y + 4, class: 'value-label', 'font-weight': 500 }, [`${e.s.label} ${last.v}%`]));
  }

  // Crosshair + tooltip snapping to the nearest poll date.
  const dates = [...new Set(allT)].sort((a, b) => a - b);
  const cross = svg('line', { y1: m.t, y2: H - m.b, stroke: 'var(--text-3)', 'stroke-width': 1, visibility: 'hidden' });
  root.append(cross);
  const overlay = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'hit' });
  overlay.addEventListener('pointermove', (ev) => {
    const pe = ev as PointerEvent;
    const rect = root.getBoundingClientRect();
    const px = ((pe.clientX - rect.left) / rect.width) * W;
    let best = dates[0];
    for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    cross.setAttribute('x1', String(x(best)));
    cross.setAttribute('x2', String(x(best)));
    cross.setAttribute('visibility', 'visible');
    showTip(opts.tip(best), pe);
  });
  overlay.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hideTip();
  });
  root.append(overlay);
  container.append(root);
}

// ---------- Hemicycle ----------

export interface HemiGroup {
  label: string;
  color: string;
  seats: number;
}

/** Parliament arc: seats are laid out in concentric rows and filled by angle, left to right. */
export function hemicycle(container: HTMLElement, groups: HemiGroup[], centerLabel: string, subLabel: string) {
  container.replaceChildren();
  const total = groups.reduce((a, g) => a + g.seats, 0);
  const W = Math.min(width(container), 560);
  const R = W / 2 - 8;
  const H = R + 34;
  const rows = total > 150 ? 8 : total > 100 ? 7 : 6;
  const r0 = R * 0.42;
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((R - r0) * i) / (rows - 1));
  const radSum = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((total * r) / radSum));
  let diff = total - perRow.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) {
    perRow[i] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  const spacing = (R - r0) / (rows - 1 || 1);
  const dot = Math.min(spacing * 0.42, (Math.PI * radii[0]) / Math.max(1, perRow[0]) / 2.3);

  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    const n = perRow[i];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (n - 1);
      pts.push({ x: W / 2 + r * Math.cos(a), y: R + 8 - r * Math.sin(a), a });
    }
  });
  pts.sort((p, q) => q.a - p.a);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Parliament of ${total} seats` });
  let idx = 0;
  for (const g of groups) {
    const gEl = svg('g', { class: 'hover-target' });
    for (let k = 0; k < g.seats && idx < pts.length; k++, idx++) {
      gEl.append(svg('circle', { cx: pts[idx].x.toFixed(1), cy: pts[idx].y.toFixed(1), r: dot.toFixed(2), fill: g.color }));
    }
    bindTip(gEl, () => `<div class="tt-title">${g.label}</div>${ttRow('Seats', String(g.seats), g.color)}`);
    root.append(gEl);
  }
  root.append(svg('text', { x: W / 2, y: R + 2, 'text-anchor': 'middle', class: 'value-label', 'font-size': Math.max(16, Math.min(26, r0 / 3.4)) }, [centerLabel]));
  root.append(svg('text', { x: W / 2, y: H - 4, 'text-anchor': 'middle', class: 'axis-label', 'font-size': 12 }, [subLabel]));
  container.append(root);
}
