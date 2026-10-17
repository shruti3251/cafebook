import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { CalendarDays, Download, FileText, RefreshCw, Search } from 'lucide-react';
import { EmptyState, PaymentPill, Spinner, StatusPill, useToast } from '../components/ui.jsx';
import { errorMessage, fmtDateTime, inr, toDate } from '../lib/format.js';
import { downloadCsv } from '../lib/utils.js';
import { useAdmin } from './AdminLayout.jsx';
import { buildReport, dayKey, monthRange, parseDay, periodLabel, presetRange } from './reportData.js';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];
const PAGE = 100;

function Bar({ label, value, max, right, color = 'bg-coral-400' }) {
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold"><span className="truncate pr-2">{label}</span><span className="tabular text-coffee-700">{right}</span></div>
      <div className="mt-1 h-2.5 rounded-full bg-coffee-50 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }) {
  return (
    <div className={`card p-4 ${accent ? 'bg-gradient-to-br from-coral-500 to-coral-700 text-white' : ''}`}>
      <div className={`text-xs font-bold uppercase tracking-wide ${accent ? 'text-coral-50' : 'text-coffee-500'}`}>{label}</div>
      <div className="font-display text-2xl lg:text-3xl font-extrabold tabular mt-1">{value}</div>
      {sub && <div className={`text-xs ${accent ? 'text-coral-50' : 'text-coffee-500'}`}>{sub}</div>}
    </div>
  );
}

/** Daily sales column chart: one series, hover/tap a day for its numbers. */
function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...daily.map((d) => d.total), 0);
  const nice = max <= 0 ? 1 : (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const every = Math.ceil(daily.length / 10);
  const h = hover !== null ? daily[hover] : null;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="font-bold text-lg">Daily sales <span className="text-sm font-semibold text-coffee-500">(incl. GST)</span></h3>
        <div className="text-sm text-coffee-700 min-h-[20px]" aria-live="polite">
          {h ? <><b>{parseDay(h.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b> · {inr(h.total)} · {h.orders} order{h.orders === 1 ? '' : 's'}</> : <span className="text-coffee-300">Hover or tap a day</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-14 shrink-0 flex flex-col justify-between text-[11px] text-coffee-500 tabular text-right h-48 -my-1.5">
          <span>{inr(nice)}</span><span>{inr(nice / 2)}</span><span>₹0</span>
        </div>
        <div className="relative flex-1 h-48">
          {[0, 0.5, 1].map((f) => <div key={f} className="absolute inset-x-0 border-t border-coffee-50" style={{ top: `${(1 - f) * 100}%` }} />)}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {daily.map((d, i) => (
              <button
                type="button"
                key={d.date}
                className="relative flex-1 h-full flex items-end focus:outline-none group"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${d.date}: ${inr(d.total)}, ${d.orders} orders`}
              >
                {hover === i && <span className="absolute inset-0 bg-coffee-50/70 rounded-md" />}
                <span
                  className="relative w-full rounded-t-[4px] bg-coral-600 transition-[height] duration-300"
                  style={{ height: `${(d.total / nice) * 100}%`, minHeight: d.total > 0 ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-[2px] ml-16 mt-1.5 text-[11px] text-coffee-500 tabular">
        {daily.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">{i % every === 0 || i === daily.length - 1 ? parseDay(d.date).getDate() : ''}</span>
        ))}
      </div>
    </div>
  );
}

export default function OrdersReports() {
  const { fb, cafeId, cafe, tables } = useAdmin();
  const toast = useToast();
  const today = dayKey(new Date());
  const [preset, setPreset] = useState('today');
  const [{ from, to }, setRange] = useState(presetRange('today'));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [table, setTable] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [includeOrders, setIncludeOrders] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const choosePreset = (key) => { setPreset(key); setRange(presetRange(key)); };
  const chooseMonth = (ym) => { if (!ym) return; setMonth(ym); setPreset('pickMonth'); setRange(monthRange(ym)); };

  // Live updates while the period includes today; past periods load once (saves free-plan reads).
  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    const end = parseDay(to);
    end.setDate(end.getDate() + 1);
    const q2 = query(
      collection(fb.db, 'orders'),
      where('cafeId', '==', cafeId),
      where('createdAt', '>=', Timestamp.fromDate(parseDay(from))),
      where('createdAt', '<', Timestamp.fromDate(end)),
      orderBy('createdAt', 'desc'),
    );
    setOrders(null);
    setShown(PAGE);
    const ok = (s) => { setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(null); };
    const fail = (e) => { setError(e); setOrders([]); };
    if (to >= today) return onSnapshot(q2, ok, fail);
    let alive = true;
    getDocs(q2).then((s) => alive && ok(s)).catch((e) => alive && fail(e));
    return () => { alive = false; };
  }, [fb.db, cafeId, from, to, today, reloadKey]);

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

  const report = useMemo(() => buildReport(filtered, from, to), [filtered, from, to]);
  const multiDay = report.daily.length > 1;
  const period = periodLabel(from, to);
  const fileTag = period.replace(/[^A-Za-z0-9]+/g, '-');

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
    downloadCsv(`cafebook-orders-${fileTag}.csv`, rows);
  };

  const exportDailyCsv = () => downloadCsv(`cafebook-daily-${fileTag}.csv`, [
    ['Date', 'Orders', 'Net sales', 'GST', 'Total', 'Cash', 'UPI', 'Card', 'Unpaid'],
    ...report.daily.map((d) => [d.date, d.orders, d.subtotal, d.tax, d.total, d.cash, d.upi, d.card, d.unpaid]),
    ['TOTAL', report.orderCount, report.totals.subtotal, report.totals.tax, report.totals.total, report.methods.cash, report.methods.upi, report.methods.card, report.methods.unpaid],
  ]);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { downloadReportPdf } = await import('./reportPdf.js');
      await downloadReportPdf({ cafe, report, orders: filtered, filters: { table, search: q.trim() }, includeOrders });
      toast('PDF downloaded', 'success');
    } catch (e) {
      toast(errorMessage(e, 'Could not create the PDF.'), 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  const maxMethod = Math.max(...Object.values(report.methods), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Orders & reports</h1>
          <p className="text-coffee-500 flex items-center gap-1.5"><CalendarDays size={16} /> {period}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-coffee-700 mr-1 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-coral-500" checked={includeOrders} onChange={(e) => setIncludeOrders(e.target.checked)} />
            Include order list in PDF
          </label>
          <button onClick={downloadPdf} disabled={pdfBusy || orders === null} className="btn-primary">
            {pdfBusy ? <Spinner className="text-white" /> : <FileText size={18} />} Download PDF
          </button>
          <button onClick={exportCsv} disabled={!filtered.length} className="btn-ghost"><Download size={18} /> CSV</button>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => choosePreset(p.key)}
              className={`h-10 px-4 rounded-full font-display font-semibold text-sm transition ${preset === p.key ? 'bg-coral-500 text-white shadow-soft' : 'bg-white text-coffee-700 border border-coffee-100 hover:bg-coffee-50'}`}
            >
              {p.label}
            </button>
          ))}
          <label className={`flex items-center gap-2 h-10 pl-4 pr-2 rounded-full border text-sm font-semibold ${preset === 'pickMonth' ? 'border-coral-400 ring-2 ring-coral-100' : 'border-coffee-100'}`}>
            Month
            <input type="month" className="bg-transparent outline-none font-display" value={month} max={today.slice(0, 7)} onChange={(e) => chooseMonth(e.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">From</label><input type="date" className="input" value={from} max={to} onChange={(e) => { setPreset('custom'); setRange({ from: e.target.value, to }); }} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={to} min={from} max={today} onChange={(e) => { setPreset('custom'); setRange({ from, to: e.target.value }); }} /></div>
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
      </div>

      {orders === null ? (
        <div className="grid place-items-center py-20"><Spinner size={36} /></div>
      ) : error ? (
        <EmptyState
          emoji="⚠️"
          title="Couldn't load orders"
          text={errorMessage(error)}
          action={<button className="btn-ghost" onClick={() => setReloadKey((k) => k + 1)}><RefreshCw size={16} /> Try again</button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile accent label="Total sales" value={inr(report.totals.total)} sub={`incl. GST ${inr(report.totals.tax)}`} />
            <Tile label="Orders" value={report.orderCount} sub={report.cancelledCount ? `${report.cancelledCount} cancelled (not counted)` : multiDay ? `${report.openDays} day${report.openDays === 1 ? '' : 's'} with sales` : null} />
            <Tile label="Avg. order" value={inr(report.avgOrder)} sub={multiDay ? `${inr(report.avgPerDay)} per open day` : null} />
            <Tile
              label={multiDay ? 'Best day' : 'Customers'}
              value={multiDay ? (report.busiest ? parseDay(report.busiest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—') : report.customers}
              sub={multiDay ? (report.busiest ? `${inr(report.busiest.total)} · ${report.customers} customers` : `${report.customers} customers`) : null}
            />
          </div>

          {multiDay && <DailyChart daily={report.daily} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-bold text-lg mb-4">Best-selling items</h3>
              {report.bestSellers.length === 0 ? <p className="text-coffee-500">No sales in this period.</p> : (
                <div className="space-y-3">
                  {report.bestSellers.slice(0, 8).map((b) => <Bar key={b.name} label={b.name} value={b.qty} max={report.bestSellers[0].qty} right={`${b.qty} sold · ${inr(b.revenue)}`} />)}
                </div>
              )}
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-lg mb-4">Payment methods</h3>
              <div className="space-y-3">
                <Bar label="💵 Cash" value={report.methods.cash} max={maxMethod} right={inr(report.methods.cash)} color="bg-mint-500" />
                <Bar label="📱 UPI" value={report.methods.upi} max={maxMethod} right={inr(report.methods.upi)} color="bg-mint-500" />
                <Bar label="💳 Card" value={report.methods.card} max={maxMethod} right={inr(report.methods.card)} color="bg-mint-500" />
                <Bar label="⏳ Unpaid" value={report.methods.unpaid} max={maxMethod} right={inr(report.methods.unpaid)} color="bg-coral-400" />
              </div>
            </div>
          </div>

          {multiDay && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-lg">Day-by-day</h3>
                <button onClick={exportDailyCsv} className="btn-ghost btn-sm"><Download size={16} /> CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-cream-100 text-left text-coffee-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Net sales</th>
                      <th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Cash</th><th className="px-4 py-3 text-right">UPI</th><th className="px-4 py-3 text-right">Card</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50 tabular">
                    {[...report.daily].reverse().map((d) => (
                      <tr key={d.date} className={d.orders ? '' : 'text-coffee-300'}>
                        <td className="px-4 py-2.5 whitespace-nowrap font-semibold">{parseDay(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td className="px-4 py-2.5 text-right">{d.orders || '—'}</td>
                        <td className="px-4 py-2.5 text-right">{inr(d.subtotal)}</td>
                        <td className="px-4 py-2.5 text-right">{inr(d.tax)}</td>
                        <td className="px-4 py-2.5 text-right font-display font-bold text-coffee-900">{inr(d.total)}</td>
                        <td className="px-4 py-2.5 text-right">{inr(d.cash)}</td>
                        <td className="px-4 py-2.5 text-right">{inr(d.upi)}</td>
                        <td className="px-4 py-2.5 text-right">{inr(d.card)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-cream-100 font-bold tabular">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{report.orderCount}</td>
                      <td className="px-4 py-3 text-right">{inr(report.totals.subtotal)}</td>
                      <td className="px-4 py-3 text-right">{inr(report.totals.tax)}</td>
                      <td className="px-4 py-3 text-right font-display">{inr(report.totals.total)}</td>
                      <td className="px-4 py-3 text-right">{inr(report.methods.cash)}</td>
                      <td className="px-4 py-3 text-right">{inr(report.methods.upi)}</td>
                      <td className="px-4 py-3 text-right">{inr(report.methods.card)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">All orders <span className="text-coffee-300">({filtered.length})</span></h3>
              {to >= today && <span className="chip bg-mint-100 text-mint-700">● Live</span>}
            </div>
            {filtered.length === 0 ? (
              <EmptyState emoji="🧾" title="No orders found" text="Try another period or clear the filters." />
            ) : (
              <>
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
                      {filtered.slice(0, shown).map((o) => (
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
                {filtered.length > shown && (
                  <div className="p-4 text-center">
                    <button className="btn-ghost" onClick={() => setShown((s) => s + PAGE)}>Show more ({filtered.length - shown} left)</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
