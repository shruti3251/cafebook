import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { customerFirebase } from '../lib/firebase.js';
import { useDocData, useMenu, useOnline } from '../lib/hooks.js';
import { calcTotals, uuid } from '../lib/format.js';
import { placeOrder } from '../lib/orders.js';
import { keys, load, save } from '../lib/local.js';
import { FullScreenMessage, OfflineBanner, Spinner } from '../components/ui.jsx';

const Ctx = createContext(null);
export const useCustomer = () => useContext(Ctx);

// Network-type failures worth retrying (same order id, so no duplicates)
const RETRYABLE = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'unknown']);

function waitForOnline() {
  return new Promise((resolve) => {
    if (navigator.onLine) return resolve();
    const on = () => { window.removeEventListener('online', on); resolve(); };
    window.addEventListener('online', on);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function CustomerLayout() {
  const { cafeId, tableNumber: tableParam } = useParams();
  const tableNumber = Number(tableParam);
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const fb = customerFirebase();

  // ---- Secret table token: from the QR (?t=) or remembered from a previous scan ----
  const [token] = useState(() => search.get('t') || load(keys.token(cafeId, tableNumber)) || '');
  useEffect(() => {
    if (search.get('t')) {
      save(keys.token(cafeId, tableNumber), search.get('t'));
      search.delete('t');
      setSearch(search, { replace: true }); // keep the token out of shared screenshots/links
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Silent anonymous sign-in (needed to read "my orders" securely) ----
  const [user, setUser] = useState(undefined);
  const [authError, setAuthError] = useState(null);
  useEffect(() => onAuthStateChanged(fb.auth, async (u) => {
    if (u) { setUser(u); return; }
    try { await signInAnonymously(fb.auth); } catch (e) { setAuthError(e); setUser(null); }
  }), [fb.auth]);

  const cafe = useDocData(fb.db, `cafes/${cafeId}`);
  const access = useDocData(fb.db, token ? `tableAccess/${token}` : null);
  const menu = useMenu(fb.db, cafeId);

  const itemsById = useMemo(() => Object.fromEntries(menu.items.map((i) => [i.id, i])), [menu.items]);
  const categoriesById = useMemo(() => Object.fromEntries(menu.categories.map((c) => [c.id, c])), [menu.categories]);

  // ---- Customer profile remembered on this device ----
  const [profile, setProfileState] = useState(() => load(keys.profile(cafeId)));
  const setProfile = useCallback((p) => { save(keys.profile(cafeId), p); setProfileState(p); }, [cafeId]);

  // ---- Cart persisted per table so a refresh / lost connection never loses it ----
  const [cart, setCart] = useState(() => load(keys.cart(cafeId, tableNumber), {}));
  useEffect(() => save(keys.cart(cafeId, tableNumber), cart), [cart, cafeId, tableNumber]);

  const setQty = useCallback((itemId, qty) => setCart((c) => {
    const next = { ...c };
    if (qty <= 0) delete next[itemId];
    else next[itemId] = { note: c[itemId]?.note || '', qty: Math.min(qty, 50) };
    return next;
  }), []);
  const setNote = useCallback((itemId, note) => setCart((c) => (c[itemId] ? { ...c, [itemId]: { ...c[itemId], note: note.slice(0, 120) } } : c)), []);
  const clearCart = useCallback(() => setCart({}), []);

  const cartLines = useMemo(() => Object.entries(cart)
    .map(([itemId, l]) => ({ itemId, ...l, item: itemsById[itemId] }))
    .filter((l) => menu.loading || l.item), [cart, itemsById, menu.loading]);
  const unavailableLines = cartLines.filter((l) => l.item && l.item.isAvailable === false);
  const availableLines = cartLines.filter((l) => l.item && l.item.isAvailable !== false);
  const cartCount = availableLines.reduce((s, l) => s + l.qty, 0);
  const cartTotals = calcTotals(availableLines.map((l) => ({ price: l.item.price, qty: l.qty })), cafe.data?.gstRate ?? 5);

  // Drop cart lines for items that were deleted from the menu
  useEffect(() => {
    if (menu.loading) return;
    const stale = Object.keys(cart).filter((id) => !itemsById[id]);
    if (stale.length) setCart((c) => { const n = { ...c }; stale.forEach((id) => delete n[id]); return n; });
  }, [menu.loading, itemsById]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Place order with duplicate protection + automatic retry ----
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const submittingRef = useRef(false);

  const submitOrder = useCallback(async () => {
    if (submittingRef.current) return null; // double-tap guard
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const items = availableLines.map((l) => ({ itemId: l.itemId, qty: l.qty, note: (l.note || '').trim() }));
      const signature = JSON.stringify(items);
      // Reuse the same order id for retries of the same cart -> the server never creates duplicates.
      let pending = load(keys.pending(cafeId, tableNumber));
      if (!pending || pending.signature !== signature) {
        pending = { clientOrderId: uuid(), signature };
        save(keys.pending(cafeId, tableNumber), pending);
      }
      const payload = {
        clientOrderId: pending.clientOrderId,
        cafeId,
        tableToken: token,
        tableNumber,
        customerName: profile.name,
        customerPhone: profile.phone,
        lines: items,
      };

      for (let attempt = 0; ; attempt++) {
        try {
          if (!navigator.onLine) { setRetrying(true); await waitForOnline(); }
          const uid = (fb.auth.currentUser || user)?.uid;
          const res = await placeOrder(fb.db, { ...payload, uid });
          save(keys.pending(cafeId, tableNumber), null);
          setCart({});
          return res;
        } catch (e) {
          const retryable = !navigator.onLine || RETRYABLE.has(e.code);
          if (!retryable || attempt >= 5) throw e;
          setRetrying(true);
          await sleep(Math.min(1000 * 2 ** attempt, 10000));
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setRetrying(false);
    }
  }, [availableLines, cafeId, tableNumber, token, profile, fb, user]);

  const base = `/order/${cafeId}/table/${tableNumber}`;
  const otpRequired = Boolean(cafe.data?.otpEnabled);
  // auth.currentUser updates synchronously after OTP sign-in; React state may lag a tick
  const liveUser = fb.auth.currentUser || user;
  const phoneVerified = Boolean(profile && liveUser?.phoneNumber === `+91${profile.phone}`);
  const ready = profile && (!otpRequired || phoneVerified);

  // Pages other than Welcome need a known (and, if required, verified) customer
  const onWelcome = location.pathname.replace(/\/$/, '') === base;
  useEffect(() => {
    if (!onWelcome && user !== undefined && !cafe.loading && !ready) navigate(base, { replace: true });
  }, [onWelcome, ready, user, cafe.loading, base, navigate]);

  // ---------- Gatekeeping screens ----------
  if (!token) {
    return <FullScreenMessage emoji="📷" title="Scan the table QR code" text="Please scan the QR code placed on your table to view the menu and order." />;
  }
  if (user === undefined || cafe.loading || access.loading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center">
        <div className="text-center"><Spinner size={40} /><p className="mt-3 text-coffee-500 font-semibold">Brewing the menu…</p></div>
      </div>
    );
  }
  if (authError && !user) {
    return <FullScreenMessage emoji="📶" title="Couldn't connect" text="Please check your internet connection and try again." action={<button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>} />;
  }
  if ((!cafe.exists && cafe.fromCache) || (!access.exists && access.fromCache && !online)) {
    return <FullScreenMessage emoji="📶" title="No internet connection" text="We'll load the menu as soon as you're back online." action={<button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>} />;
  }
  if (!cafe.exists) {
    return <FullScreenMessage emoji="🏚️" title="Cafe not found" text="This QR code doesn't belong to a cafe on Cafebook." />;
  }
  const a = access.data;
  if (!a || a.cafeId !== cafeId || Number(a.tableNumber) !== tableNumber || a.active === false) {
    return (
      <FullScreenMessage
        emoji="🪑"
        title="This table isn't available"
        text="This QR code is no longer valid — the table may have been removed or its code replaced. Please ask the staff for help or scan another table's code."
      />
    );
  }

  const value = {
    fb, user, cafeId, tableNumber, token, base, online,
    cafe: cafe.data, table: a,
    menu: { ...menu, itemsById, categoriesById },
    profile, setProfile, otpRequired, phoneVerified,
    cart, setQty, setNote, clearCart, cartLines, availableLines, unavailableLines, cartCount, cartTotals,
    submitOrder, submitting, retrying,
  };

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-[100dvh] bg-cream">
        <OfflineBanner online={online} text="No internet — your cart is saved. Retrying…" />
        <Outlet />
      </div>
    </Ctx.Provider>
  );
}
