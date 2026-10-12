import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { Download, Search } from 'lucide-react';
import { EmptyState, PaymentPill, Spinner, StatusPill } from '../components/ui.jsx';
import { fmtDateTime, inr, isActiveOrder, sumOrders, toDate } from '../lib/format.js';
import { downloadCsv } from '../lib/utils.js';
import { useAdmin } from './AdminLayout.jsx';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function Bar({ label, value, max, right, color = 'bg-coral-400' }) {
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold"><span className="truncate pr-2">{label}</span><span className="tabular text-coffee-700">{right}</span></div>
      <div className="mt-1 h-2.5 rounded-full bg-coffee-50 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

export default function OrdersReports() {
  const { fb, cafeId, tables } = useAdmin();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [table, setTable] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!from || !to) return undefined;
    const start = startOf(from);
    const end = startOf(to);
    end.setDate(end.getDate() + 1);
    setOrders(null);
    return onSnapshot(
      query(
        collection(fb.db, 'orders'),
        where('cafeId', '==', cafeId),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<', Timestamp.fromDate(end)),
        orderBy('createdAt', 'desc'),
      ),
      (s) => { setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(null); },
      (e) => { setError(e); setOrders([]); },
    );
  }, [fb.db, cafeId, from, to]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (orders || []).filter((o) => {
      if (table && String(o.tableNumber) !== table) return false;
      if (!needle) return true;
      return o.customerName.toLowerCase().includes(needle)
        || (digits && o.customerPhone.includes(digits))
        || `#${o.orderNumber}` === needle || String(o.orderNumber) === needle;
    });
  }, [orders, table, q]);

  const stats = useMemo(() => {
    const active = filtered.filter(isActiveOrder);
    const totals = sumOrders(active);
    const items = {};
    active.forEach((o) => o.items.forEach((it) => {
      const k = it.name;
      items[k] = items[k] || { name: it.name, qty: 0, revenue: 0 };
      items[k].qty += it.qty;
      items[k].revenue += it.qty * it.price;
    }));
    const best = Object.values(items).sort((a, b) => b.qty - a.qty).slice(0, 8);
    const methods = { cash: 0, upi: 0, card: 0, unpaid: 0 };
    active.forEach((o) => {
      const k = o.paymentStatus === 'paid' ? (o.paymentMethod || 'cash') : 'unpaid';
      methods[k] = (methods[k] || 0) + o.total;
    });
    return { active, totals, best, methods, customers: new Set(active.map((o) => o.customerPhone)).size };
  }, [filtered]);

  const exportCsv = () => {
    const rows = [['Order #', 'Date', 'Time', 'Table', 'Customer', 'Phone', 'Items', 'Subtotal', 'GST', 'Total', 'Status', 'Payment', 'Method']];
    filtered.forEach((o) => {
      const d = toDate(o.createdAt);
      rows.push([
        o.orderNumber, d?.toLocaleDateString('en-IN'), d?.toLocaleTimeString('en-IN'), o.tableNumber, o.customerName, o.customerPhone,
        o.items.map((i) => `${i.qty}x ${i.name}${i.note ? ` (${i.note})` : ''}`).join('; '),
        o.subtotal, o.tax, o.total, o.status, o.paymentStatus, o.paymentMethod || '',
      ]);
    });
    downloadCsv(`cafebook-orders-${from}${to !== from ? `-to-${to}` : ''}.csv`, rows);
  };

  const maxMethod = Math.max(...Object.values(stats.methods), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Orders & reports</h1>
          <p className="text-coffee-500">Sales summary and full order history.</p>
        </div>
        <button onClick={exportCsv} disabled={!filtered.length} className="btn-dark"><Download size={18} /> Export CSV (Excel)</button>
      </div>

      <div className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="label">From</label><input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="label">Table</label>
          <select className="input" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">All tables</option>
            {tables.map((t) => <option key={t.id} value={String(t.tableNumber)}>Table {t.tableNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Search</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={18} />
            <input className="input pl-11" placeholder="Name, phone or order #" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {orders === null ? (
        <div className="grid place-items-center py-20"><Spinner size={36} /></div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Couldn't load orders" text={error.message} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4 bg-gradient-to-br from-coral-500 to-coral-700 text-white">
              <div className="text-xs font-bold uppercase tracking-wide text-coral-50">Total sales</div>
              <div className="font-display text-3xl font-extrabold tabular mt-1">{inr(stats.totals.total)}</div>
              <div className="text-xs text-coral-50">incl. GST {inr(stats.totals.tax)}</div>
            </div>
            <div className="card p-4"><div className="text-xs font-bold uppercase tracking-wide text-coffee-500">Orders</div><div className="font-display text-3xl font-extrabold tabular mt-1">{stats.active.length}</div></div>
            <div className="card p-4"><div className="text-xs font-bold uppercase tracking-wide text-coffee-500">Avg. order</div><div className="font-display text-3xl font-extrabold tabular mt-1">{inr(stats.active.length ? Math.round(stats.totals.total / stats.active.length) : 0)}</div></div>
            <div className="card p-4"><div className="text-xs font-bold uppercase tracking-wide text-coffee-500">Customers</div><div className="font-display text-3xl font-extrabold tabular mt-1">{stats.customers}</div></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-bold text-lg mb-4">Best-selling items</h3>
              {stats.best.length === 0 ? <p className="text-coffee-500">No sales in this period.</p> : (
                <div className="space-y-3">
                  {stats.best.map((b) => <Bar key={b.name} label={b.name} value={b.qty} max={stats.best[0].qty} right={`${b.qty} sold · ${inr(b.revenue)}`} />)}
                </div>
              )}
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-lg mb-4">Payment methods</h3>
              <div className="space-y-3">
                <Bar label="💵 Cash" value={stats.methods.cash} max={maxMethod} right={inr(stats.methods.cash)} color="bg-mint-500" />
                <Bar label="📱 UPI" value={stats.methods.upi} max={maxMethod} right={inr(stats.methods.upi)} color="bg-mint-500" />
                <Bar label="💳 Card" value={stats.methods.card} max={maxMethod} right={inr(stats.methods.card)} color="bg-mint-500" />
                <Bar label="⏳ Unpaid" value={stats.methods.unpaid} max={maxMethod} right={inr(stats.methods.unpaid)} color="bg-coral-400" />
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">All orders <span className="text-coffee-300">({filtered.length})</span></h3>
            </div>
            {filtered.length === 0 ? (
              <EmptyState emoji="🧾" title="No orders found" text="Try another date or clear the filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-cream-100 text-left text-coffee-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Order</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Table</th>
                      <th className="px-4 py-3">Customer</th><th className="px-4 py-3 min-w-[220px]">Items</th>
                      <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                    {filtered.map((o) => (
                      <tr key={o.id} className={o.status === 'cancelled' ? 'opacity-50' : ''}>
                        <td className="px-4 py-3 font-display font-bold">#{o.orderNumber}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(o.createdAt)}</td>
                        <td className="px-4 py-3">{o.tableNumber}</td>
                        <td className="px-4 py-3"><div className="font-semibold">{o.customerName}</div><div className="text-coffee-500">{o.customerPhone}</div></td>
                        <td className="px-4 py-3 text-coffee-700">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                        <td className="px-4 py-3 text-right font-display font-bold tabular">{inr(o.total)}</td>
                        <td className="px-4 py-3"><div className="flex flex-col gap-1 items-start"><StatusPill status={o.status} />{o.status !== 'cancelled' && <PaymentPill paid={o.paymentStatus === 'paid'} method={o.paymentMethod} />}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
