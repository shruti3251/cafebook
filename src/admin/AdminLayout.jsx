import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { BarChart3, Bell, BellOff, LayoutGrid, LogOut, Package, Settings as SettingsIcon, UtensilsCrossed } from 'lucide-react';
import { stockStatus } from './inventoryOps.js';
import { staffFirebase } from '../lib/firebase.js';
import { useDocData, useMenu, useOnline } from '../lib/hooks.js';
import { recordCustomer } from './tableOps.js';
import { keys, load, save } from '../lib/local.js';
import { playChime } from '../lib/utils.js';
import { CafeLogo, FullScreenMessage, OfflineBanner, Spinner, useToast } from '../components/ui.jsx';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

const NAV = [
  { to: '/admin', label: 'Tables', icon: LayoutGrid, end: true },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/admin/inventory', label: 'Stock', icon: Package },
  { to: '/admin/orders', label: 'Reports', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

export default function AdminLayout() {
  const fb = staffFirebase();
  const toast = useToast();
  const online = useOnline();
  const location = useLocation();
  const [user, setUser] = useState(undefined);

  useEffect(() => onAuthStateChanged(fb.auth, (u) => setUser(u || null)), [fb.auth]);

  const staff = useDocData(fb.db, user ? `staff/${user.uid}` : null);
  const cafeId = staff.data?.cafeId;
  const cafe = useDocData(fb.db, cafeId ? `cafes/${cafeId}` : null);

  // ---- Live kitchen stock (for low-stock alerts) ----
  const [inventory, setInventory] = useState(null);
  useEffect(() => {
    if (!cafeId) return undefined;
    return onSnapshot(
      query(collection(fb.db, 'inventory'), where('cafeId', '==', cafeId)),
      (s) => setInventory(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))),
      () => setInventory([]),
    );
  }, [fb.db, cafeId]);
  const lowStock = useMemo(() => (inventory || []).filter((i) => stockStatus(i) !== 'ok'), [inventory]);

  // ---- Live tables ----
  const [tables, setTables] = useState(null);
  useEffect(() => {
    if (!cafeId) return undefined;
    return onSnapshot(
      query(collection(fb.db, 'tables'), where('cafeId', '==', cafeId)),
      (s) => setTables(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.tableNumber - b.tableNumber)),
      () => setTables([]),
    );
  }, [fb.db, cafeId]);

  // ---- Live orders for all open table sessions + new-order alerts ----
  const [openOrders, setOpenOrders] = useState(null);
  const [newTables, setNewTables] = useState({}); // tableId -> true while unseen
  const [soundOn, setSoundOnState] = useState(() => load(keys.sound, true));
  const soundRef = useRef(soundOn);
  const setSoundOn = (v) => { soundRef.current = v; save(keys.sound, v); setSoundOnState(v); if (v) playChime(); };

  useEffect(() => {
    if (!cafeId) return undefined;
    // Only alert for orders that arrive after we've synced with the server,
    // not for orders already sitting in the offline cache when the page opens.
    let primed = false;
    return onSnapshot(
      query(collection(fb.db, 'orders'), where('cafeId', '==', cafeId), where('sessionStatus', '==', 'open'), orderBy('createdAt', 'asc')),
      { includeMetadataChanges: true },
      (snap) => {
        setOpenOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        if (!primed) { primed = !snap.metadata.fromCache; return; }
        const addedDocs = snap.docChanges().filter((c) => c.type === 'added' && !c.doc.metadata.hasPendingWrites).map((c) => c.doc);
        const added = addedDocs.map((d) => d.data());
        // Keep the customers list (name, visits, last seen) up to date
        addedDocs.forEach((d) => recordCustomer(fb.db, d.id, d.data()).catch(() => {}));
        if (!added.length) return;
        setNewTables((n) => ({ ...n, ...Object.fromEntries(added.map((o) => [o.tableId, true])) }));
        if (soundRef.current) playChime();
        added.forEach((o) => {
          const text = `New order · Table ${o.tableNumber} · ${o.customerName}`;
          toast(text, 'success', 6000);
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification('Cafebook', { body: text, icon: '/favicon.svg', tag: o.tableId }); } catch { /* ignore */ }
          }
        });
      },
      (e) => { console.error(e); setOpenOrders([]); },
    );
  }, [fb.db, cafeId, toast]);

  // Ask once for desktop notifications (shown when the tab is in the background)
  useEffect(() => {
    if (cafeId && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [cafeId]);

  // Live menu, used to double-check the prices on every order
  const menu = useMenu(fb.db, cafeId);
  const itemsById = useMemo(() => Object.fromEntries(menu.items.map((i) => [i.id, i])), [menu.items]);

  const markSeen = useCallback((tableId) => setNewTables((n) => {
    if (!n[tableId]) return n;
    const c = { ...n }; delete c[tableId]; return c;
  }), []);

  const pendingCount = (openOrders || []).filter((o) => o.status === 'received').length;
  useEffect(() => {
    document.title = pendingCount ? `(${pendingCount}) New orders · Cafebook` : 'Cafebook Dashboard';
    return () => { document.title = 'Cafebook'; };
  }, [pendingCount]);

  const value = useMemo(() => ({
    fb, user, staff: staff.data, isOwner: staff.data?.role === 'owner', cafeId, cafe: cafe.data,
    tables: tables || [], openOrders: openOrders || [], newTables, markSeen, soundOn, setSoundOn,
    itemsById, menuLoaded: !menu.loading,
    inventory: inventory || [], inventoryLoaded: inventory !== null, lowStock,
  }), [fb, user, staff.data, cafeId, cafe.data, tables, openOrders, newTables, markSeen, soundOn, itemsById, menu.loading, inventory, lowStock]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user === null) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (user === undefined || staff.loading || (cafeId && (cafe.loading || tables === null || openOrders === null))) {
    return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={40} /></div>;
  }
  if (!staff.data) {
    return (
      <FullScreenMessage
        emoji="🔒"
        title="No dashboard access"
        text={`${user.email} isn't linked to a cafe yet. If you own a cafe, set it up now. If you work at one, ask the owner to add you in Settings → Staff.`}
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/admin/signup" className="btn-primary">Set up my cafe</Link>
            <button className="btn-dark" onClick={() => signOut(fb.auth)}>Sign out</button>
          </div>
        )}
      />
    );
  }

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-[100dvh] bg-cream md:pl-60">
        {/* Sidebar (tablet/laptop) */}
        <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-coffee-900 text-cream p-4">
          <div className="flex items-center gap-3 px-2 py-3">
            <CafeLogo cafe={cafe.data} size={42} />
            <div className="min-w-0">
              <div className="font-display font-bold truncate">{cafe.data?.name}</div>
              <div className="text-xs text-coffee-300 capitalize">{staff.data.role}</div>
            </div>
          </div>
          <nav className="mt-6 space-y-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 h-12 font-display font-semibold transition ${isActive ? 'bg-coral-500 text-white' : 'text-coffee-100 hover:bg-white/10'}`}
              >
                <n.icon size={20} /> {n.label}
                {n.end && pendingCount > 0 && <span className="ml-auto chip bg-white text-coral-600">{pendingCount}</span>}
                {n.label === 'Stock' && lowStock.length > 0 && <span className="ml-auto chip bg-amber-400 text-coffee-900" title="Items running low">{lowStock.length}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-1">
            <button onClick={() => setSoundOn(!soundOn)} className="w-full flex items-center gap-3 rounded-2xl px-4 h-11 text-coffee-100 hover:bg-white/10 font-semibold">
              {soundOn ? <Bell size={18} /> : <BellOff size={18} />} Sound {soundOn ? 'on' : 'off'}
            </button>
            <button onClick={() => signOut(fb.auth)} className="w-full flex items-center gap-3 rounded-2xl px-4 h-11 text-coffee-100 hover:bg-white/10 font-semibold">
              <LogOut size={18} /> Sign out
            </button>
          </div>
        </aside>

        {/* Top bar (phone) */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-coffee-900 text-cream px-4 h-14">
          <CafeLogo cafe={cafe.data} size={32} />
          <span className="font-display font-bold truncate flex-1">{cafe.data?.name}</span>
          <button onClick={() => setSoundOn(!soundOn)} className="grid place-items-center h-10 w-10" aria-label="Toggle sound">
            {soundOn ? <Bell size={20} /> : <BellOff size={20} />}
          </button>
        </header>

        <OfflineBanner online={online} text="No internet — showing last known data. Reconnecting…" />
        <main className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px]">
          <Outlet />
        </main>

        {/* Bottom nav (phone) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 bg-white border-t border-coffee-50 pb-safe pt-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-1.5 text-xs font-bold ${isActive ? 'text-coral-600' : 'text-coffee-500'}`}>
              <n.icon size={22} /> {n.label}
              {n.end && pendingCount > 0 && <span className="absolute top-0 right-1/4 h-5 min-w-[20px] px-1 rounded-full bg-coral-500 text-white text-[11px] grid place-items-center">{pendingCount}</span>}
              {n.label === 'Stock' && lowStock.length > 0 && <span className="absolute top-0 right-1/4 h-5 min-w-[20px] px-1 rounded-full bg-amber-400 text-coffee-900 text-[11px] grid place-items-center">{lowStock.length}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
