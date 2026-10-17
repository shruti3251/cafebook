import { isActiveOrder, toDate } from '../lib/format.js';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const r2 = (paise) => Math.round(paise) / 100;

/** Quick period choices for the Reports page. Returns { from, to } as YYYY-MM-DD. */
export function presetRange(key, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (key) {
    case 'yesterday': { const y = add(t, -1); return { from: dayKey(y), to: dayKey(y) }; }
    case 'week': { const mon = add(t, -((t.getDay() + 6) % 7)); return { from: dayKey(mon), to: dayKey(t) }; }
    case 'month': return { from: dayKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: dayKey(t) };
    case 'lastMonth': return {
      from: dayKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
      to: dayKey(new Date(t.getFullYear(), t.getMonth(), 0)),
    };
    default: return { from: dayKey(t), to: dayKey(t) };
  }
}

/** "2026-10" -> whole calendar month (capped at today for the current month). */
export function monthRange(ym, today = new Date()) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  let last = new Date(y, m, 0);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (last > t) last = t;
  return { from: dayKey(first), to: dayKey(last < first ? first : last) };
}

export function periodLabel(from, to) {
  const f = parseDay(from);
  const t = parseDay(to);
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (from === to) return f.toLocaleDateString('en-IN', { weekday: 'short', ...opts });
  const lastOfMonth = new Date(f.getFullYear(), f.getMonth() + 1, 0);
  if (f.getDate() === 1 && f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear()
      && t.getDate() === lastOfMonth.getDate()) {
    return f.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  return `${f.toLocaleDateString('en-IN', opts)} – ${t.toLocaleDateString('en-IN', opts)}`;
}

/**
 * Everything the Reports page and the PDF show, computed from a list of orders.
 * Cancelled orders are excluded from all money figures. Amounts are in rupees.
 */
export function buildReport(orders, from, to) {
  const active = orders.filter(isActiveOrder);
  const P = (v) => Math.round(Number(v || 0) * 100); // work in paise

  // One row per calendar day in the range (days with no orders show zero)
  const days = new Map();
  for (let d = parseDay(from); d <= parseDay(to); d.setDate(d.getDate() + 1)) {
    days.set(dayKey(d), { date: dayKey(d), orders: 0, subtotal: 0, tax: 0, total: 0, cash: 0, upi: 0, card: 0, unpaid: 0 });
  }

  const totals = { subtotal: 0, tax: 0, total: 0 };
  const methods = { cash: 0, upi: 0, card: 0, unpaid: 0 };
  const items = new Map();
  const customers = new Set();
  const tables = new Map();

  active.forEach((o) => {
    const d = toDate(o.createdAt);
    const row = d && days.get(dayKey(d));
    const method = o.paymentStatus === 'paid' ? (o.paymentMethod || 'cash') : 'unpaid';
    totals.subtotal += P(o.subtotal); totals.tax += P(o.tax); totals.total += P(o.total);
    methods[method] = (methods[method] || 0) + P(o.total);
    customers.add(o.customerPhone);
    tables.set(o.tableNumber, (tables.get(o.tableNumber) || 0) + P(o.total));
    if (row) {
      row.orders += 1; row.subtotal += P(o.subtotal); row.tax += P(o.tax); row.total += P(o.total);
      row[method] = (row[method] || 0) + P(o.total);
    }
    (o.items || []).forEach((it) => {
      const cur = items.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += P(it.price) * it.qty;
      items.set(it.name, cur);
    });
  });

  const daily = [...days.values()].map((r) => ({
    ...r, subtotal: r2(r.subtotal), tax: r2(r.tax), total: r2(r.total),
    cash: r2(r.cash), upi: r2(r.upi), card: r2(r.card), unpaid: r2(r.unpaid),
  }));
  const busiest = daily.reduce((best, r) => (r.total > (best?.total ?? -1) ? r : best), null);
  const openDays = daily.filter((r) => r.orders > 0).length;

  return {
    from, to,
    orderCount: active.length,
    cancelledCount: orders.length - active.length,
    customers: customers.size,
    totals: { subtotal: r2(totals.subtotal), tax: r2(totals.tax), total: r2(totals.total) },
    avgOrder: active.length ? r2(totals.total / active.length) : 0,
    avgPerDay: openDays ? r2(totals.total / openDays) : 0,
    openDays,
    busiest: busiest && busiest.total > 0 ? busiest : null,
    methods: { cash: r2(methods.cash), upi: r2(methods.upi), card: r2(methods.card), unpaid: r2(methods.unpaid) },
    bestSellers: [...items.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .map((i) => ({ ...i, revenue: r2(i.revenue) })),
    tables: [...tables.entries()].map(([tableNumber, t]) => ({ tableNumber, total: r2(t) })).sort((a, b) => b.total - a.total),
    daily,
  };
}
