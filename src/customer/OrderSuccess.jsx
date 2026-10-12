import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { EmptyState, PaymentPill, Spinner, VegMark } from '../components/ui.jsx';
import { useDocData } from '../lib/hooks.js';
import { fmtDateTime, inr, maskPhone } from '../lib/format.js';
import { useCustomer } from './CustomerLayout.jsx';
import { CustomerHeader, StatusTracker } from './parts.jsx';

function AnimatedTick() {
  return (
    <div className="mx-auto grid place-items-center h-24 w-24 rounded-full bg-mint-500 shadow-lift animate-pop">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" strokeDashoffset="48" className="animate-draw" />
      </svg>
    </div>
  );
}

export default function OrderSuccess() {
  const { orderId } = useParams();
  const { fb, base } = useCustomer();
  const location = useLocation();
  const fresh = location.state?.fresh;
  const { data: order, loading } = useDocData(fb.db, `orders/${orderId}`);

  useEffect(() => {
    if (!fresh) return;
    import('canvas-confetti').then(({ default: confetti }) => {
      const colors = ['#F4683F', '#14B08A', '#FFB74D', '#7B4B2A', '#FFF3E0'];
      confetti({ particleCount: 110, spread: 75, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
      setTimeout(() => confetti({ particleCount: 60, spread: 110, origin: { y: 0.3 }, colors, disableForReducedMotion: true }), 300);
    }).catch(() => {});
  }, [fresh]);

  return (
    <div className="pb-10">
      <CustomerHeader back={`${base}/menu`} title={fresh ? 'Order placed' : 'Order details'} />
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {loading ? (
          <div className="grid place-items-center py-20"><Spinner size={36} /></div>
        ) : !order ? (
          <EmptyState emoji="🤔" title="Order not found" text="We couldn't find this order on this device." action={<Link to={`${base}/menu`} className="btn-primary">Back to menu</Link>} />
        ) : (
          <>
            <div className="text-center">
              {fresh && <AnimatedTick />}
              <h1 className={`text-2xl font-extrabold ${fresh ? 'mt-4' : ''}`}>{fresh ? 'Order placed! 🎉' : `Order #${order.orderNumber}`}</h1>
              {fresh && <p className="text-coffee-500 mt-1">Thank you, {order.customerName.split(' ')[0]}! We've sent it to the kitchen.</p>}
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white shadow-soft px-4 py-1.5 font-display font-bold">
                Order #{order.orderNumber} <span className="text-coffee-300">•</span> Table {order.tableNumber}
              </div>
            </div>

            <div className="card p-5">
              <StatusTracker status={order.status} />
              <p className="text-center text-sm text-coffee-500 mt-4">This updates live — no need to refresh.</p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg">Items</h3>
                <PaymentPill paid={order.paymentStatus === 'paid'} method={order.paymentMethod} />
              </div>
              <ul className="space-y-2">
                {order.items.map((it, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1"><VegMark isVeg={it.isVeg !== false} size={13} /></span>
                    <div className="flex-1">
                      <span className="font-semibold">{it.qty} × {it.name}</span>
                      {it.note && <div className="text-sm italic text-coffee-500">“{it.note}”</div>}
                    </div>
                    <span className="tabular font-semibold">{inr(it.price * it.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-dashed border-coffee-100 mt-4 pt-3 space-y-1 text-coffee-700">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{inr(order.subtotal)}</span></div>
                <div className="flex justify-between"><span>GST ({order.gstRate}%)</span><span className="tabular">{inr(order.tax)}</span></div>
                <div className="flex justify-between font-display font-extrabold text-lg text-coffee-900 pt-1"><span>Total</span><span className="tabular">{inr(order.total)}</span></div>
              </div>
              <div className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-coffee-500">Ordered by</span><span className="font-bold text-right">{order.customerName}</span></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-coffee-500">Phone</span><span className="font-semibold tabular">+91 {maskPhone(order.customerPhone)}</span></div>
                <div className="flex justify-between gap-3 mt-1"><span className="text-coffee-500">Placed</span><span className="font-semibold">{fmtDateTime(order.createdAt)}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link to={`${base}/menu`} className="btn-primary"><Plus size={20} /> Order more</Link>
              <Link to={`${base}/orders`} className="btn-ghost"><ClipboardList size={20} /> My orders</Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
