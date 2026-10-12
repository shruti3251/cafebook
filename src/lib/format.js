export function inr(value) {
  const n = Number(value || 0);
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return '₹' + n.toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(p || '');
export const cleanPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const maskPhone = (p) => (p ? `${p.slice(0, 2)}XXXXXX${p.slice(-2)}` : '');

export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export function fmtTime(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
}

export function fmtDateTime(ts) {
  const d = toDate(ts);
  if (!d) return 'Just now';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** Same maths as the placeOrder function: work in paise to avoid float errors. */
export function calcTotals(lines, gstRate = 5) {
  const subtotalPaise = lines.reduce((s, l) => s + Math.round(Number(l.price) * 100) * l.qty, 0);
  const taxPaise = Math.round((subtotalPaise * Number(gstRate)) / 100);
  return { subtotal: subtotalPaise / 100, tax: taxPaise / 100, total: (subtotalPaise + taxPaise) / 100 };
}

/** Sum stored order totals (already GST-inclusive). */
export function sumOrders(orders) {
  const p = orders.reduce(
    (acc, o) => ({
      subtotal: acc.subtotal + Math.round(o.subtotal * 100),
      tax: acc.tax + Math.round(o.tax * 100),
      total: acc.total + Math.round(o.total * 100),
    }),
    { subtotal: 0, tax: 0, total: 0 },
  );
  return { subtotal: p.subtotal / 100, tax: p.tax / 100, total: p.total / 100 };
}

export const ORDER_STATUSES = ['received', 'preparing', 'served'];

export const STATUS_META = {
  received: { label: 'Received', cls: 'bg-coral-100 text-coral-700' },
  preparing: { label: 'Preparing', cls: 'bg-amber-100 text-amber-800' },
  served: { label: 'Served', cls: 'bg-mint-100 text-mint-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-200 text-gray-600' },
};

export const isActiveOrder = (o) => o.status !== 'cancelled';

export function randomToken(bytes = 18) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function uuid() {
  // randomUUID only exists on https pages; getRandomValues works everywhere.
  if (crypto.randomUUID) return crypto.randomUUID();
  const hex = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function errorMessage(e, fallback = 'Something went wrong. Please try again.') {
  if (!e) return fallback;
  if (e.code === 'unavailable' || e.code === 'functions/unavailable' || e.message === 'Failed to fetch') {
    return 'No internet connection. Please check your network.';
  }
  return e.message?.replace(/^Firebase: /, '').replace(/\s*\(.*\)\.?$/, '') || fallback;
}
