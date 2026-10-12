import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, DoorClosed, Plus, Users } from 'lucide-react';
import { EmptyState, Modal, Spinner, useToast } from '../components/ui.jsx';
import { errorMessage, inr, isActiveOrder, sumOrders } from '../lib/format.js';
import { useAdmin } from './AdminLayout.jsx';
import { orderIssues } from '../lib/orders.js';
import { canCloseTable, closeTable, sessionOrdersFor, tableStatus } from './tableOps.js';

const STATUS_UI = {
  free: { label: 'Free', card: 'bg-white', badge: 'bg-mint-100 text-mint-700' },
  occupied: { label: 'Occupied', card: 'bg-white ring-2 ring-coffee-100', badge: 'bg-amber-100 text-amber-800' },
  new: { label: 'Has new order', card: 'bg-coral-50 ring-2 ring-coral-400', badge: 'bg-coral-500 text-white' },
  paid: { label: 'Paid · ready to close', card: 'bg-mint-50 ring-2 ring-mint-400', badge: 'bg-mint-500 text-white' },
};

function Stat({ label, value, accent }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-coffee-500">{label}</div>
      <div className={`mt-1 font-display text-2xl lg:text-3xl font-extrabold tabular ${accent || ''}`}>{value}</div>
    </div>
  );
}

export default function TablesView() {
  const { fb, tables, openOrders, newTables, itemsById, menuLoaded } = useAdmin();
  const toast = useToast();
  const [closing, setClosing] = useState(null); // row being confirmed
  const [busy, setBusy] = useState(false);

  async function doClose() {
    setBusy(true);
    try {
      await closeTable(fb.db, closing.table, closing.orders);
      toast(`Table ${closing.table.tableNumber} is free for the next guests`, 'success');
      setClosing(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const rows = tables.map((t) => {
    const orders = sessionOrdersFor(t, openOrders);
    const active = orders.filter(isActiveOrder);
    return {
      table: t,
      orders,
      status: tableStatus(orders),
      canClose: canCloseTable(orders),
      waiting: active.filter((o) => o.status === 'received').length,
      flagged: menuLoaded ? active.filter((o) => orderIssues(o, itemsById).length > 0).length : 0,
      customers: new Set(active.map((o) => o.customerPhone)).size,
      orderCount: active.length,
      total: sumOrders(active).total,
      unpaid: sumOrders(active.filter((o) => o.paymentStatus !== 'paid')).total,
      isNew: Boolean(newTables[t.id]),
    };
  });

  const occupied = rows.filter((r) => r.status !== 'free').length;
  const newCount = openOrders.filter((o) => o.status === 'received').length;
  const openBills = rows.reduce((s, r) => s + r.unpaid, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Live tables</h1>
          <p className="text-coffee-500">Updates in real time. Tap a table to see orders and bills.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Occupied tables" value={`${occupied}/${tables.length}`} />
        <Stat label="New orders" value={newCount} accent={newCount ? 'text-coral-600' : ''} />
        <Stat label="Active orders" value={openOrders.filter(isActiveOrder).length} />
        <Stat label="Open bills" value={inr(openBills)} accent="text-mint-700" />
      </div>

      {tables.length === 0 ? (
        <EmptyState
          emoji="🪑"
          title="No tables yet"
          text="Add your tables in Settings, then print their QR codes."
          action={<Link to="/admin/settings" className="btn-primary"><Plus size={18} /> Add tables</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {rows.map((r) => {
            const ui = STATUS_UI[r.status];
            return (
              <div
                key={r.table.id}
                className={`relative flex flex-col rounded-3xl shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift ${ui.card} ${r.isNew ? 'animate-glow' : ''}`}
              >
                <Link to={`/admin/table/${r.table.id}`} className="block flex-1 p-4">
                  {r.isNew && <BellRing size={20} className="absolute top-4 right-4 text-coral-600 animate-bounce" />}
                  <div className="text-xs font-bold uppercase tracking-wide text-coffee-500">Table</div>
                  <div className="font-display text-4xl font-extrabold leading-none mt-1">{r.table.tableNumber}</div>
                  <span className={`chip mt-3 ${ui.badge}`}>{ui.label}</span>
                  {r.flagged > 0 && <span className="chip mt-1 ml-1 bg-amber-100 text-amber-900">⚠️ Check prices</span>}
                  {r.status !== 'free' ? (
                    <>
                      <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-coffee-700">
                        <span className="flex items-center gap-1"><Users size={15} /> {r.customers}</span>
                        <span>{r.orderCount} order{r.orderCount === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1 font-display text-2xl font-extrabold tabular">{inr(r.total)}</div>
                      {r.unpaid > 0 && r.unpaid < r.total && <div className="text-xs font-bold text-coral-600">{inr(r.unpaid)} unpaid</div>}
                      {r.unpaid === 0 && r.total > 0 && <div className="text-xs font-bold text-mint-700">All paid ✓</div>}
                      {r.waiting > 0 && r.unpaid === 0 && (
                        <div className="text-xs font-bold text-coral-600">{r.waiting} order{r.waiting > 1 ? 's' : ''} not started yet</div>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 text-sm text-coffee-300 font-semibold">Ready for guests</div>
                  )}
                </Link>
                {r.canClose && (
                  <div className="px-4 pb-4 -mt-1">
                    <button onClick={() => setClosing(r)} className="btn-dark btn-sm w-full">
                      <DoorClosed size={16} /> Close table
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Modal open={Boolean(closing)} onClose={() => setClosing(null)} title={closing ? `Close Table ${closing.table.tableNumber}?` : ''}>
        {closing && (
          <>
            <p className="text-coffee-700">Everyone has paid. Closing frees the table so the next guests start with a fresh bill. All orders stay saved in Reports.</p>
            {closing.waiting > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-900">
                ⚠️ {closing.waiting} order{closing.waiting > 1 ? 's are' : ' is'} still marked “Received” (not started). Make sure it was served before closing.
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setClosing(null)}>Not yet</button>
              <button className="btn-dark" onClick={doClose} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Close table'}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
