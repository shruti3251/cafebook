import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, WifiOff } from 'lucide-react';
import { EmptyState, ItemImage, Spinner, VegMark, useToast } from '../components/ui.jsx';
import { errorMessage, inr, maskPhone } from '../lib/format.js';
import { useCustomer } from './CustomerLayout.jsx';
import { CustomerHeader, Stepper } from './parts.jsx';

export default function Cart() {
  const {
    base, cafe, tableNumber, profile, menu, cartLines, availableLines, unavailableLines,
    cartCount, cartTotals, setQty, setNote, submitOrder, submitting, retrying, online, otpRequired,
  } = useCustomer();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState(null);

  const removeUnavailable = () => unavailableLines.forEach((l) => setQty(l.itemId, 0));

  async function place() {
    setError(null);
    if (unavailableLines.length) return;
    try {
      const res = await submitOrder();
      if (res) navigate(`${base}/placed/${res.orderId}`, { replace: true, state: { fresh: true } });
    } catch (e) {
      if (e.code === 'cafebook/unavailable') {
        setError(`${e.message} Please remove ${e.unavailable?.length > 1 ? 'them' : 'it'} to continue.`);
      } else if (e.code === 'cafebook/invalid-table') {
        setError(e.message);
      } else if (e.code === 'permission-denied') {
        if (otpRequired) {
          toast('Please verify your phone number again.', 'error');
          navigate(base);
        } else {
          setError('Could not place the order. Please scan the QR code on your table again, or ask the staff.');
        }
      } else {
        setError(errorMessage(e, 'Could not place your order. Please try again.'));
      }
    }
  }

  if (!menu.loading && cartLines.length === 0) {
    return (
      <div>
        <CustomerHeader back={`${base}/menu`} title="Your cart" />
        <EmptyState
          emoji="🛒"
          title="Your cart is empty"
          text="Looks like you haven't added anything yet. The coffee is waiting!"
          action={<Link to={`${base}/menu`} className="btn-primary">Browse menu</Link>}
        />
      </div>
    );
  }

  return (
    <div className="pb-44">
      <CustomerHeader back={`${base}/menu`} title="Your cart" />
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {unavailableLines.length > 0 && (
          <div className="rounded-3xl bg-amber-50 border-2 border-amber-200 p-4 animate-fadeIn">
            <div className="flex gap-2 font-bold text-amber-900">
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <span>
                {unavailableLines.map((l) => l.item.name).join(', ')} {unavailableLines.length > 1 ? 'are' : 'is'} no longer available.
              </span>
            </div>
            <button onClick={removeUnavailable} className="btn-dark btn-sm mt-3">Remove unavailable items</button>
          </div>
        )}

        <div className="card divide-y divide-coffee-50">
          {cartLines.map((l) => {
            if (!l.item) return null;
            const off = l.item.isAvailable === false;
            return (
              <div key={l.itemId} className={`p-4 flex gap-3 ${off ? 'opacity-60' : ''}`}>
                <ItemImage src={l.item.imageUrl} alt={l.item.name} emoji={menu.categoriesById[l.item.categoryId]?.emoji} className="h-16 w-16 shrink-0 rounded-2xl" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="mt-1"><VegMark isVeg={l.item.isVeg !== false} size={13} /></span>
                    <span className="font-display font-semibold leading-snug">{l.item.name}</span>
                  </div>
                  <div className="text-sm text-coffee-500 mt-0.5">{inr(l.item.price)} each</div>
                  {off ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="chip bg-gray-100 text-gray-600">Not available</span>
                      <button onClick={() => setQty(l.itemId, 0)} className="text-coral-600 font-bold text-sm flex items-center gap-1 min-h-[36px]"><Trash2 size={15} /> Remove</button>
                    </div>
                  ) : (
                    <input
                      className="input mt-2 !min-h-[40px] text-sm"
                      placeholder='Add a note, e.g. "less sugar"'
                      maxLength={120}
                      value={l.note}
                      onChange={(e) => setNote(l.itemId, e.target.value)}
                    />
                  )}
                </div>
                {!off && (
                  <div className="flex flex-col items-end justify-between gap-2">
                    <span className="font-display font-bold tabular">{inr(l.item.price * l.qty)}</span>
                    <Stepper qty={l.qty} onChange={(q) => setQty(l.itemId, q)} size="sm" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Link to={`${base}/menu`} className="btn-ghost w-full">+ Add more items</Link>

        <div className="card p-5 space-y-2">
          <h3 className="font-bold text-lg mb-1">Bill details</h3>
          <Row label={`Item total (${cartCount})`} value={inr(cartTotals.subtotal)} />
          <Row label={`GST (${cafe.gstRate ?? 5}%)`} value={inr(cartTotals.tax)} />
          <div className="border-t border-dashed border-coffee-100 pt-3 mt-2">
            <Row label={<span className="font-display font-bold text-lg">To pay</span>} value={<span className="font-display font-extrabold text-xl">{inr(cartTotals.total)}</span>} />
          </div>
          <p className="text-xs text-coffee-500">Pay at the end of your visit — cash, UPI or card.</p>
        </div>

        <div className="rounded-2xl bg-mint-50 text-mint-700 px-4 py-3 text-sm font-semibold">
          Ordering as <b>{profile?.name}</b> · +91 {maskPhone(profile?.phone)} · Table {tableNumber}
        </div>

        {error && <div className="rounded-2xl bg-coral-50 text-coral-700 border border-coral-100 px-4 py-3 font-semibold animate-fadeIn">{error}</div>}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur border-t border-coffee-50 px-4 pt-3 pb-safe">
        <div className="max-w-2xl mx-auto">
          {(retrying || !online) && (
            <div className="flex items-center justify-center gap-2 text-sm font-bold text-coffee-700 mb-2">
              <WifiOff size={16} /> {submitting ? 'No internet — retrying…' : 'You are offline. Your cart is saved.'}
            </div>
          )}
          <button
            onClick={place}
            disabled={submitting || availableLines.length === 0 || unavailableLines.length > 0}
            className="btn-primary w-full h-14 text-lg"
          >
            {submitting ? (
              <><Spinner className="text-white" /> {retrying ? 'Retrying…' : 'Placing order…'}</>
            ) : (
              <>Place order · {inr(cartTotals.total)}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 text-coffee-700">
      <span>{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}
