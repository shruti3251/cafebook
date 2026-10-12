import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, WifiOff, X, XCircle } from 'lucide-react';
import { STATUS_META } from '../lib/format.js';
import { isStoredImage, loadStoredImage } from '../lib/images.js';

export function Spinner({ size = 22, className = '' }) {
  return (
    <svg className={`animate-spin text-coral-500 ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function VegMark({ isVeg = true, size = 16 }) {
  const color = isVeg ? '#16A34A' : '#B91C1C';
  return (
    <span
      title={isVeg ? 'Veg' : 'Non-veg'}
      aria-label={isVeg ? 'Veg' : 'Non-veg'}
      className="inline-grid place-items-center shrink-0 rounded-[3px] bg-white"
      style={{ width: size, height: size, border: `2px solid ${color}` }}
    >
      {isVeg ? (
        <span className="rounded-full" style={{ width: size * 0.45, height: size * 0.45, background: color }} />
      ) : (
        <span style={{ width: 0, height: 0, borderLeft: `${size * 0.27}px solid transparent`, borderRight: `${size * 0.27}px solid transparent`, borderBottom: `${size * 0.45}px solid ${color}` }} />
      )}
    </span>
  );
}

export function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.received;
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

export function PaymentPill({ paid, method }) {
  return paid ? (
    <span className="chip bg-mint-100 text-mint-700">Paid{method ? ` · ${method.toUpperCase()}` : ''}</span>
  ) : (
    <span className="chip bg-coral-50 text-coral-700 ring-1 ring-coral-100">Unpaid</span>
  );
}

export function CafeLogo({ cafe, size = 56, className = '' }) {
  const [broken, setBroken] = useState(false);
  if (cafe?.logoUrl && !broken) {
    return (
      <img
        src={cafe.logoUrl}
        alt={cafe.name}
        onError={() => setBroken(true)}
        className={`rounded-2xl object-cover bg-white shadow-soft ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br from-coral-400 to-coral-600 grid place-items-center text-white font-display font-bold shadow-soft ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {(cafe?.name || 'C').trim().charAt(0).toUpperCase()}
    </div>
  );
}

/** Lazy-loaded menu image with a colourful emoji placeholder. */
export function ItemImage({ src, alt, emoji = '🍽️', className = '' }) {
  const boxRef = useRef(null);
  const stored = isStoredImage(src);
  const [visible, setVisible] = useState(!stored);
  const [url, setUrl] = useState(stored ? null : src);
  const [state, setState] = useState(src ? 'loading' : 'none');

  // Stored photos are fetched only when the card scrolls near the screen.
  useEffect(() => {
    if (!stored) { setVisible(true); return undefined; }
    const el = boxRef.current;
    if (!el || !('IntersectionObserver' in window)) { setVisible(true); return undefined; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [stored, src]);

  useEffect(() => {
    let alive = true;
    setState(src ? 'loading' : 'none');
    if (!src) { setUrl(null); return undefined; }
    if (!stored) { setUrl(src); return undefined; }
    setUrl(null);
    if (visible) loadStoredImage(src).then((d) => { if (alive) { if (d) setUrl(d); else setState('error'); } });
    return () => { alive = false; };
  }, [src, stored, visible]);

  return (
    <div ref={boxRef} className={`relative overflow-hidden bg-gradient-to-br from-cream-200 to-coral-100 ${className}`}>
      {state !== 'loaded' && (
        <div className={`absolute inset-0 grid place-items-center text-4xl ${state === 'loading' ? 'animate-pulse' : ''}`} aria-hidden>
          {emoji}
        </div>
      )}
      {url && state !== 'error' && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}

export function EmptyState({ emoji = '🫙', title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 animate-fadeIn">
      <div className="text-6xl mb-4">{emoji}</div>
      <h3 className="text-xl font-bold text-coffee-900">{title}</h3>
      {text && <p className="mt-2 text-coffee-500 max-w-xs">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function FullScreenMessage({ emoji, title, text, action }) {
  return (
    <div className="min-h-[100dvh] grid place-items-center px-6 bg-cream">
      <div className="card max-w-md w-full p-8 text-center animate-fadeIn">
        <div className="text-6xl mb-4">{emoji}</div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-coffee-500 leading-relaxed">{text}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

export function OfflineBanner({ online, text = 'No internet — retrying…' }) {
  if (online) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-coffee-900 text-cream text-sm font-bold py-2 px-4 animate-fadeIn" role="status">
      <WifiOff size={16} /> {text}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-coffee-900/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-cream w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-lift animate-slideUp`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-cream/95 backdrop-blur px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid place-items-center h-10 w-10 rounded-full hover:bg-coffee-50" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="px-5 pb-6 pb-safe">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-mint-500' : 'bg-coffee-100'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ---------- Toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((text, type = 'info', ms = 3500) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info;
          const color = t.type === 'success' ? 'text-mint-600' : t.type === 'error' ? 'text-coral-600' : 'text-coffee-500';
          return (
            <div key={t.id} className="pointer-events-auto flex items-center gap-2 bg-white rounded-2xl shadow-lift px-4 py-3 max-w-sm w-full animate-fadeIn">
              <Icon size={20} className={`${color} shrink-0`} />
              <span className="font-semibold text-sm">{t.text}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
