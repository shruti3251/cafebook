import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ChevronRight, Wallet } from 'lucide-react';
import { EmptyState, PaymentPill, Spinner, StatusPill } from '../components/ui.jsx';
import { fmtDateTime, inr, isActiveOrder, maskPhone, sumOrders } from '../lib/format.js';
import { useCustomer } from './CustomerLayout.jsx';
import { CustomerHeader } from './parts.jsx';

export default function MyOrders() {
  const { fb, user, profile, table, base, phoneVerified } = useCustomer();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !profile) return undefined;
    // Verified phone -> every order for that number (any device / past visits).
    // Otherwise -> orders placed from this device, for the number saved here.
    const live = fb.auth.currentUser || user;
    const q = phoneVerified
      ? query(collection(fb.db, 'orders'), where('customerPhoneE164', '==', live.phoneNumber), orderBy('createdAt', 'desc'), limit(100))
      : query(collection(fb.db, 'orders'), where('customerUid', '==', live.uid), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.customerPhone === profile.phone));
        setError(null);
      },
      (e) => { setError(e); setOrders([]); },
    );
  }, [fb, user, profile, phoneVerified]);

  const current = useMemo(
    () => (orders || []).filter((o) => o.sessionId === table.currentSessionId && o.tableId === table.tableId && o.paymentStatus !== 'paid' && isActiveOrder(o)),
    [orders, table],
  );
  const bill = sumOrders(current);

  return (
    <div className="pb-10">
      <CustomerHeader back={`${base}/menu`} title="My orders" />
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <div className="rounded-3xl p-5 text-white bg-gradient-to-br from-coral-500 to-coral-700 shadow-lift">
          <div className="text-lg font-display font-bold">{profile.name}</div>
          <div className="text-sm text-coral-50">+91 {maskPhone(profile.phone)}</div>
          <div className="mt-3 flex items-center gap-2 font-bold text-coral-50"><Wallet size={20} /> Your current bill · Table {table.tableNumber}</div>
          <div className="mt-2 font-display text-4xl font-extrabold tabular">{inr(bill.total)}</div>
          <div className="mt-1 text-sm text-coral-50">
            {current.length ? `${current.length} unpaid order${current.length > 1 ? 's' : ''} · incl. GST ${inr(bill.tax)}` : 'Nothing to pay right now'}
          </div>
          {current.length > 0 && <p className="mt-3 text-sm bg-white/15 rounded-2xl px-3 py-2">Pay at the counter or ask the staff — cash, UPI or card.</p>}
        </div>

        {orders === null ? (
          <div className="grid place-items-center py-16"><Spinner size={32} /></div>
        ) : error ? (
          <EmptyState emoji="📶" title="Couldn't load your orders" text="Please check your connection and try again." />
        ) : orders.length === 0 ? (
          <EmptyState emoji="🧾" title="No orders yet" text="Your orders will show up here." action={<Link to={`${base}/menu`} className="btn-primary">Browse menu</Link>} />
        ) : (
          <>
            {!phoneVerified && (
              <p className="text-xs text-coffee-500 px-1">Showing orders placed from this phone for +91 {profile.phone}.</p>
            )}
            {orders.map((o) => (
              <Link key={o.id} to={`${base}/placed/${o.id}`} className="card p-4 block active:scale-[0.99] transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-bold">Order #{o.orderNumber} <span className="text-coffee-300 font-sans font-semibold text-sm">· Table {o.tableNumber}</span></div>
                  <ChevronRight size={20} className="text-coffee-300" />
                </div>
                <div className="text-xs text-coffee-500 mt-0.5">{fmtDateTime(o.createdAt)} · {o.customerName}</div>
                <p className="text-sm text-coffee-700 mt-2 line-clamp-2">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-1.5 flex-wrap">
                    <StatusPill status={o.status} />
                    {o.status !== 'cancelled' && <PaymentPill paid={o.paymentStatus === 'paid'} method={o.paymentMethod} />}
                  </div>
                  <span className={`font-display font-bold text-lg tabular ${o.status === 'cancelled' ? 'line-through text-coffee-300' : ''}`}>{inr(o.total)}</span>
                </div>
              </Link>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
