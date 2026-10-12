import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChefHat, ClipboardList, Minus, Plus, Receipt, Utensils } from 'lucide-react';
import { CafeLogo } from '../components/ui.jsx';
import { useCustomer } from './CustomerLayout.jsx';

export function CustomerHeader({ back, title }) {
  const { cafe, tableNumber, base, profile } = useCustomer();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-coffee-50">
      <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 h-16">
        {back ? (
          <button onClick={() => navigate(back)} className="grid place-items-center h-11 w-11 -ml-2 rounded-full hover:bg-coffee-50" aria-label="Back">
            <ArrowLeft size={24} />
          </button>
        ) : (
          <CafeLogo cafe={cafe} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold leading-tight truncate">{title || cafe.name}</div>
          <div className="text-xs font-bold text-mint-700 truncate">
            Table {tableNumber}{profile?.name && <span className="text-coffee-500"> · Hi, {profile.name.split(' ')[0]} 👋</span>}
          </div>
        </div>
        {profile && (
          <Link to={`${base}/orders`} className="btn-ghost btn-sm !rounded-full" aria-label="My orders">
            <ClipboardList size={18} /> <span className="hidden min-[360px]:inline">My Orders</span>
          </Link>
        )}
      </div>
    </header>
  );
}

export function Stepper({ qty, onChange, size = 'md' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  const w = size === 'sm' ? 'w-9' : 'w-11';
  return (
    <div className={`inline-flex items-center rounded-2xl bg-coral-500 text-white shadow-soft ${h} animate-bounceIn`} key={qty}>
      <button onClick={() => onChange(qty - 1)} className={`grid place-items-center ${h} ${w} active:scale-90 transition`} aria-label="Decrease quantity">
        <Minus size={18} strokeWidth={3} />
      </button>
      <span className="min-w-[24px] text-center font-display font-bold tabular">{qty}</span>
      <button onClick={() => onChange(qty + 1)} disabled={qty >= 50} className={`grid place-items-center ${h} ${w} active:scale-90 transition disabled:opacity-50`} aria-label="Increase quantity">
        <Plus size={18} strokeWidth={3} />
      </button>
    </div>
  );
}

const STEPS = [
  { key: 'received', label: 'Received', icon: Receipt },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'served', label: 'Served', icon: Utensils },
];

export function StatusTracker({ status }) {
  if (status === 'cancelled') {
    return <div className="rounded-2xl bg-gray-100 text-gray-600 font-bold text-center py-3">This order was cancelled by the cafe.</div>;
  }
  const idx = Math.max(0, STEPS.findIndex((s) => s.key === status));
  return (
    <div className="relative flex justify-between">
      <div className="absolute left-[16%] right-[16%] top-6 h-1.5 rounded-full bg-coffee-50" />
      <div
        className="absolute left-[16%] top-6 h-1.5 rounded-full bg-mint-500 transition-all duration-700"
        style={{ width: `${(idx / (STEPS.length - 1)) * 68}%` }}
      />
      {STEPS.map((s, i) => {
        const done = i <= idx;
        const current = i === idx;
        return (
          <div key={s.key} className="relative z-10 flex flex-col items-center w-1/3">
            <div
              className={`grid place-items-center h-[52px] w-[52px] rounded-full border-4 border-cream transition-all duration-500 ${
                done ? 'bg-mint-500 text-white' : 'bg-white text-coffee-300'
              } ${current && status !== 'served' ? 'animate-glow' : ''}`}
            >
              <s.icon size={22} />
            </div>
            <span className={`mt-2 text-sm font-bold ${done ? 'text-coffee-900' : 'text-coffee-300'}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
