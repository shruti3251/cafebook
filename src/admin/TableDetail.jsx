import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, DoorClosed, Phone, Printer, QrCode, Share2, Smartphone, Undo2, XCircle } from 'lucide-react';
import { EmptyState, Modal, PaymentPill, Spinner, StatusPill, VegMark, useToast } from '../components/ui.jsx';
import { errorMessage, fmtTime, inr, isActiveOrder, ORDER_STATUSES, STATUS_META, sumOrders } from '../lib/format.js';
import { printNode } from '../lib/print.js';
import { qrDataUrl, upiLink } from '../lib/utils.js';
import { useAdmin } from './AdminLayout.jsx';
import { billAsText, Receipt } from './printables.jsx';
import { closeTable, markCustomerPaid, markCustomerUnpaid, sessionOrdersFor, tableStatus } from './tableOps.js';
import { orderIssues } from '../lib/orders.js';

const METHODS = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'upi', label: 'UPI', icon: Smartphone },
  { key: 'card', label: 'Card', icon: CreditCard },
];

function UpiModal({ open, onClose, cafe, amount, label }) {
  const [qr, setQr] = useState(null);
  const link = cafe.upiId ? upiLink({ upiId: cafe.upiId, payeeName: cafe.name, amount, note: label }) : null;
  useEffect(() => {
    if (open && link) qrDataUrl(link, 600).then(setQr);
    else setQr(null);
  }, [open, link]);
  return (
    <Modal open={open} onClose={onClose} title="Pay with UPI">
      {!cafe.upiId ? (
        <p className="text-coffee-700">Add your UPI ID in <Link to="/admin/settings" className="font-bold text-coral-600 underline">Settings</Link> to show a payment QR.</p>
      ) : (
        <div className="text-center">
          <div className="font-display text-5xl font-extrabold tabular text-coffee-900">{inr(amount)}</div>
          <div className="text-coffee-500 mt-1">{label}</div>
          <div className="mt-4 mx-auto w-64 h-64 bg-white rounded-3xl p-3 shadow-soft grid place-items-center">
            {qr ? <img src={qr} alt="UPI QR" className="w-full h-full" /> : <Spinner size={32} />}
          </div>
          <p className="mt-3 text-sm text-coffee-500">Scan with GPay, PhonePe, Paytm or any UPI app</p>
          <p className="font-bold text-coffee-700">{cafe.upiId}</p>
        </div>
      )}
    </Modal>
  );
}

function CustomerCard({ group, tableNumber, cafe, db, itemsById, menuLoaded }) {
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [upiOpen, setUpiOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = group.orders.filter(isActiveOrder);
  const unpaid = active.filter((o) => o.paymentStatus !== 'paid');
  const paidOrders = active.filter((o) => o.paymentStatus === 'paid');
  const due = sumOrders(unpaid);
  const all = sumOrders(active);
  const allPaid = active.length > 0 && unpaid.length === 0;
  const method = paidOrders[paidOrders.length - 1]?.paymentMethod;

  const setStatus = async (order, status) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { status, updatedAt: serverTimestamp() });
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const cancel = (order) => {
    if (window.confirm(`Cancel order #${order.orderNumber}? It will be removed from the bill.`)) setStatus(order, 'cancelled');
  };

  const pay = async (m) => {
    setBusy(true);
    try {
      await markCustomerPaid(db, unpaid, m);
      toast(`${group.name} marked as paid (${m.toUpperCase()})`, 'success');
      setPayOpen(false);
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  const undoPaid = async () => {
    if (!window.confirm(`Mark ${group.name}'s orders as unpaid again?`)) return;
    try { await markCustomerUnpaid(db, paidOrders); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const billOrders = active.length ? active : group.orders;
  const print = () => printNode(
    <Receipt cafe={cafe} tableNumber={tableNumber} customerName={group.name} customerPhone={group.phone} orders={billOrders} />,
  );
  const share = async () => {
    const text = billAsText({ cafe, tableNumber, customerName: group.name, orders: billOrders });
    if (navigator.share) {
      try { await navigator.share({ title: `${cafe.name} bill`, text }); } catch { /* cancelled */ }
    } else {
      window.open(`https://wa.me/91${group.phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
  };

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className={`px-5 py-4 flex items-center justify-between gap-3 ${allPaid ? 'bg-mint-50' : 'bg-cream-100'}`}>
        <div className="min-w-0">
          <div className="font-display text-xl font-bold truncate">{group.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-coffee-500">
            <a
              href={`tel:+91${group.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-base font-bold text-mint-700 ring-1 ring-mint-100 hover:bg-mint-50 tabular"
              title={`Call ${group.name}`}
            >
              <Phone size={15} /> {group.phone.slice(0, 5)} {group.phone.slice(5)}
            </a>
            <span>{active.length} order{active.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        {active.length > 0 && <PaymentPill paid={allPaid} method={allPaid ? method : null} />}
      </div>

      <div className="divide-y divide-coffee-50 flex-1">
        {group.orders.map((o) => (
          <div key={o.id} className={`px-5 py-4 ${o.status === 'cancelled' ? 'opacity-50' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-display font-bold">
                #{o.orderNumber} <span className="text-coffee-300 font-sans text-sm font-semibold">· {fmtTime(o.createdAt)}</span>
                {o.paymentStatus === 'paid' && o.status !== 'cancelled' && <span className="ml-2 chip bg-mint-100 text-mint-700">Paid</span>}
              </div>
              {o.status === 'cancelled' ? (
                <StatusPill status="cancelled" />
              ) : (
                <div className="flex items-center gap-1">
                  <div className="inline-flex rounded-xl bg-coffee-50 p-1">
                    {ORDER_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(o, s)}
                        className={`px-2.5 h-8 rounded-lg text-xs font-bold transition ${o.status === s ? `${STATUS_META[s].cls} shadow` : 'text-coffee-500 hover:text-coffee-900'}`}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                  {o.paymentStatus !== 'paid' && (
                    <button onClick={() => cancel(o)} className="grid place-items-center h-8 w-8 rounded-lg text-coffee-300 hover:text-coral-600" title="Cancel order" aria-label="Cancel order">
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {menuLoaded && o.status !== 'cancelled' && (() => {
              const issues = orderIssues(o, itemsById);
              return issues.length > 0 && (
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-900">
                  <div className="font-bold">⚠️ Check this order before billing</div>
                  <ul className="list-disc pl-5">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
                  <div className="text-xs mt-1">If you changed the menu after this order, this is expected. Otherwise cancel it and re-enter the order.</div>
                </div>
              );
            })()}
            <ul className="mt-2 space-y-1">
              {o.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5"><VegMark isVeg={it.isVeg !== false} size={12} /></span>
                  <span className="flex-1">
                    <b className="tabular">{it.qty} ×</b> {it.name}
                    {it.note && <span className="ml-2 inline-block rounded-md bg-amber-100 text-amber-900 text-sm font-semibold px-1.5">“{it.note}”</span>}
                  </span>
                  <span className="tabular text-coffee-500">{inr(it.price * it.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-coffee-50 bg-white">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-coffee-500">{allPaid ? 'Paid' : 'To pay'}</div>
            <div className={`font-display text-4xl font-extrabold tabular ${allPaid ? 'text-mint-700' : 'text-coffee-900'}`}>
              {inr(allPaid ? all.total : due.total)}
            </div>
            <div className="text-xs text-coffee-500">
              {inr(allPaid ? all.subtotal : due.subtotal)} + GST {inr(allPaid ? all.tax : due.tax)}
              {!allPaid && paidOrders.length > 0 && ` · ${inr(sumOrders(paidOrders).total)} already paid`}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {allPaid ? (
            <button onClick={undoPaid} className="btn-ghost btn-sm"><Undo2 size={16} /> Undo paid</button>
          ) : (
            <button onClick={() => setPayOpen(true)} disabled={!unpaid.length} className="btn-mint btn-sm"><CheckCircle2 size={16} /> Mark paid</button>
          )}
          <button onClick={() => setUpiOpen(true)} disabled={allPaid || !unpaid.length} className="btn-ghost btn-sm"><QrCode size={16} /> UPI QR</button>
          <button onClick={print} disabled={!active.length} className="btn-ghost btn-sm"><Printer size={16} /> Print</button>
          <button onClick={share} disabled={!active.length} className="btn-ghost btn-sm"><Share2 size={16} /> Share</button>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Mark ${group.name} as paid`}>
        <div className="text-center mb-5">
          <div className="text-coffee-500">Amount received</div>
          <div className="font-display text-5xl font-extrabold tabular">{inr(due.total)}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {METHODS.map((m) => (
            <button key={m.key} disabled={busy} onClick={() => pay(m.key)} className="card p-4 flex flex-col items-center gap-2 font-display font-bold hover:ring-2 hover:ring-mint-400 active:scale-95 transition disabled:opacity-50">
              <m.icon size={28} className="text-mint-600" /> {m.label}
            </button>
          ))}
        </div>
      </Modal>
      <UpiModal open={upiOpen} onClose={() => setUpiOpen(false)} cafe={cafe} amount={due.total} label={`Table ${tableNumber} · ${group.name}`} />
    </div>
  );
}

export default function TableDetail() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { fb, tables, openOrders, cafe, markSeen, itemsById, menuLoaded } = useAdmin();
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const table = tables.find((t) => t.id === tableId);
  const orders = useMemo(() => (table ? sessionOrdersFor(table, openOrders) : []), [table, openOrders]);

  useEffect(() => { markSeen(tableId); }, [tableId, orders.length, markSeen]);

  const groups = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const g = map.get(o.customerPhone) || { phone: o.customerPhone, name: o.customerName, orders: [] };
      g.name = o.customerName; // latest name wins
      g.orders.push(o);
      map.set(o.customerPhone, g);
    });
    return [...map.values()];
  }, [orders]);

  if (!table) {
    return <EmptyState emoji="🪑" title="Table not found" text="It may have been deleted." action={<Link to="/admin" className="btn-primary">Back to tables</Link>} />;
  }

  const active = orders.filter(isActiveOrder);
  const total = sumOrders(active);
  const unpaid = sumOrders(active.filter((o) => o.paymentStatus !== 'paid'));
  const canClose = orders.length > 0 && active.every((o) => o.paymentStatus === 'paid');
  const status = tableStatus(orders);

  async function doClose() {
    setClosing(true);
    try {
      await closeTable(fb.db, table, orders);
      toast(`Table ${table.tableNumber} closed. Ready for the next guests!`, 'success');
      navigate('/admin');
    } catch (e) {
      toast(errorMessage(e), 'error');
      setClosing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/admin" className="grid place-items-center h-11 w-11 rounded-full bg-white shadow-soft" aria-label="Back"><ArrowLeft size={22} /></Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-extrabold">Table {table.tableNumber}</h1>
          <p className="text-coffee-500 font-semibold">
            {status === 'free' ? 'Free' : `${groups.length} customer${groups.length === 1 ? '' : 's'} · ${active.length} order${active.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="card px-5 py-3 text-right">
          <div className="text-xs font-bold uppercase tracking-wide text-coffee-500">Table total</div>
          <div className="font-display text-4xl font-extrabold tabular">{inr(total.total)}</div>
          {unpaid.total > 0 && <div className="text-sm font-bold text-coral-600">{inr(unpaid.total)} unpaid</div>}
        </div>
        <div className="w-full sm:w-auto">
          <button onClick={() => setConfirmClose(true)} disabled={!canClose} className="btn-dark w-full sm:w-auto">
            <DoorClosed size={20} /> Close table
          </button>
          {!canClose && orders.length > 0 && <p className="text-xs text-coffee-500 mt-1 text-center">Enabled once everyone has paid</p>}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState emoji="☕" title="No orders yet" text="Orders placed from this table's QR code will appear here instantly." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3 items-start">
          {groups.map((g) => <CustomerCard key={g.phone} group={g} tableNumber={table.tableNumber} cafe={cafe} db={fb.db} itemsById={itemsById} menuLoaded={menuLoaded} />)}
        </div>
      )}

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title={`Close Table ${table.tableNumber}?`}>
        <p className="text-coffee-700">This ends the current visit. The next group at this table will start with a fresh bill. All orders stay saved in Reports.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={() => setConfirmClose(false)}>Not yet</button>
          <button className="btn-dark" onClick={doClose} disabled={closing}>{closing ? <Spinner className="text-white" /> : 'Close table'}</button>
        </div>
      </Modal>
    </div>
  );
}
