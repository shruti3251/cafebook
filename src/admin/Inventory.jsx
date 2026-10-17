import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Download, History, Minus, MoreVertical, Package, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { EmptyState, Modal, Spinner, useToast } from '../components/ui.jsx';
import { errorMessage, fmtDateTime, toDate } from '../lib/format.js';
import { downloadCsv } from '../lib/utils.js';
import { useAdmin } from './AdminLayout.jsx';
import {
  REASON_LABEL, REASONS, STOCK_META, UNITS,
  addStarterItems, adjustStock, deleteStockItem, fmtQty, roundQty, saveStockItem, stockStatus,
} from './inventoryOps.js';

function timeAgo(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return fmtDateTime(d);
}

// ---------- Add / remove / set stock ----------
const MODES = {
  add: { title: 'Stock received', verb: 'Add', icon: Plus, btn: 'btn-mint' },
  remove: { title: 'Stock used', verb: 'Remove', icon: Minus, btn: 'btn-primary' },
  set: { title: 'Set exact count', verb: 'Save count', icon: SlidersHorizontal, btn: 'btn-dark' },
};

function AdjustModal({ item, mode, onClose }) {
  const { fb, cafeId, user, staff } = useAdmin();
  const toast = useToast();
  const [amount, setAmount] = useState(mode === 'set' ? String(roundQty(item.quantity)) : '');
  const [reason, setReason] = useState(REASONS[mode][0].key);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const m = MODES[mode];

  const value = Number(amount);
  const valid = amount !== '' && value >= 0 && (mode === 'set' || value > 0);
  const after = !valid ? null : mode === 'add' ? item.quantity + value : mode === 'remove' ? item.quantity - value : value;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await adjustStock(fb.db, { cafeId, item, mode, amount: value, reason, note, user, staff });
      toast(`${item.name}: now ${fmtQty(result, item.unit)}`, 'success');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${m.title} · ${item.name}`}>
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-2xl bg-white px-4 py-3 flex justify-between items-center">
          <span className="text-coffee-500 font-semibold">Currently</span>
          <span className="font-display text-xl font-extrabold tabular">{fmtQty(item.quantity, item.unit)}</span>
        </div>
        <div>
          <label className="label">{mode === 'set' ? 'Counted quantity' : mode === 'add' ? 'Quantity received' : 'Quantity used'}</label>
          <div className="flex gap-2 items-center">
            <input
              className="input text-2xl font-bold tabular"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
            <span className="font-bold text-coffee-500 min-w-[60px]">{item.unit}</span>
          </div>
        </div>
        {REASONS[mode].length > 1 && (
          <div>
            <label className="label">Reason</label>
            <div className="flex flex-wrap gap-2">
              {REASONS[mode].map((r) => (
                <button
                  type="button"
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  className={`btn-sm btn ${reason === r.key ? 'bg-coffee-700 text-white' : 'bg-white border border-coffee-100 text-coffee-700'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={mode === 'add' ? 'e.g. Supplier: Amul, bill #2231' : 'e.g. evening shift'} />
        </div>
        {after !== null && (
          <div className={`rounded-2xl px-4 py-3 text-center font-bold ${after < 0 ? 'bg-coral-50 text-coral-700' : 'bg-mint-50 text-mint-700'}`}>
            {after < 0
              ? `Only ${fmtQty(item.quantity, item.unit)} left`
              : <>{fmtQty(item.quantity, item.unit)} → <span className="text-lg">{fmtQty(after, item.unit)}</span></>}
          </div>
        )}
        <button className={`${m.btn} w-full`} disabled={busy || !valid || after < 0}>
          {busy ? <Spinner className="text-white" /> : <><m.icon size={18} /> {m.verb}</>}
        </button>
      </form>
    </Modal>
  );
}

// ---------- Create / edit item ----------
function ItemModal({ initial, categories, onClose }) {
  const { fb, cafeId, user, staff } = useAdmin();
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name || '',
    unit: initial?.unit || 'kg',
    category: initial?.category || '',
    minLevel: initial ? String(initial.minLevel ?? 0) : '',
    quantity: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveStockItem(fb.db, { cafeId, initial, form: f, user, staff });
      toast(initial ? 'Item updated' : `${f.name.trim()} added`, 'success');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : 'New raw material'}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={f.name} onChange={set('name')} maxLength={60} placeholder="e.g. Milk" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Unit</label>
            <select className="input" value={f.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" list="stock-categories" value={f.category} onChange={set('category')} maxLength={30} placeholder="e.g. Dairy" />
            <datalist id="stock-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!initial && (
            <div>
              <label className="label">Quantity now</label>
              <input className="input" type="number" inputMode="decimal" min="0" step="any" value={f.quantity} onChange={set('quantity')} placeholder="0" />
            </div>
          )}
          <div className={initial ? 'col-span-2' : ''}>
            <label className="label">Alert when at or below</label>
            <input className="input" type="number" inputMode="decimal" min="0" step="any" value={f.minLevel} onChange={set('minLevel')} placeholder="e.g. 2" />
          </div>
        </div>
        <p className="text-xs text-coffee-500">
          You'll see a <b>Running low</b> alert when the quantity drops to this level. Leave it 0 for no alert.
          {initial && ' To change the quantity, use Received / Used / Set count.'}
        </p>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Save'}</button>
      </form>
    </Modal>
  );
}

// ---------- History ----------
function HistoryModal({ item, onClose }) {
  const { fb, cafeId } = useAdmin();
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const base = [collection(fb.db, 'inventoryLogs'), where('cafeId', '==', cafeId)];
    if (item) base.push(where('itemId', '==', item.id));
    return onSnapshot(
      query(...base, orderBy('at', 'desc'), limit(100)),
      (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { setError(e); setLogs([]); },
    );
  }, [fb.db, cafeId, item]);

  const exportLogs = () => downloadCsv(`stock-history${item ? `-${item.name}` : ''}.csv`, [
    ['Date', 'Time', 'Item', 'Change', 'Unit', 'Before', 'After', 'Reason', 'Note', 'By'],
    ...(logs || []).map((l) => {
      const d = toDate(l.at);
      return [d?.toLocaleDateString('en-IN'), d?.toLocaleTimeString('en-IN'), l.itemName, l.change, l.unit, l.before, l.after, REASON_LABEL[l.reason] || l.reason, l.note, l.by];
    }),
  ]);

  return (
    <Modal open onClose={onClose} title={item ? `History · ${item.name}` : 'Stock history (latest 100)'} wide>
      {logs === null ? (
        <div className="grid place-items-center py-12"><Spinner size={30} /></div>
      ) : error ? (
        <p className="text-coffee-500">Couldn't load history. If you just set this up, the database index may still be building — try again in a few minutes.</p>
      ) : logs.length === 0 ? (
        <p className="text-coffee-500">No changes yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-coffee-50 bg-white rounded-2xl">
            {logs.map((l) => (
              <li key={l.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 w-20 text-right font-display font-bold tabular ${l.change > 0 ? 'text-mint-700' : l.change < 0 ? 'text-coral-600' : 'text-coffee-500'}`}>
                  {l.change > 0 ? '+' : ''}{roundQty(l.change)} {l.unit}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {!item && <>{l.itemName} · </>}{REASON_LABEL[l.reason] || l.reason}
                    <span className="text-coffee-500 font-normal"> → {fmtQty(l.after, l.unit)}</span>
                  </div>
                  {l.note && <div className="text-sm italic text-coffee-500 truncate">“{l.note}”</div>}
                  <div className="text-xs text-coffee-300">{fmtDateTime(l.at)} · {l.by}</div>
                </div>
              </li>
            ))}
          </ul>
          <button onClick={exportLogs} className="btn-ghost btn-sm mt-4"><Download size={16} /> Export CSV</button>
        </>
      )}
    </Modal>
  );
}

// ---------- Page ----------
function StockRow({ item, onAdjust, onEdit, onHistory, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const fill = item.minLevel > 0 ? Math.min(1, item.quantity / (item.minLevel * 3)) : item.quantity > 0 ? 1 : 0;

  return (
    <li className={`px-4 py-3 ${status === 'out' ? 'bg-coral-50/60' : status === 'low' ? 'bg-amber-50/60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[160px] flex-1">
          <div className="font-semibold">{item.name}</div>
          <div className="text-xs text-coffee-500">
            {item.minLevel > 0 ? `Alert at ${fmtQty(item.minLevel, item.unit)}` : 'No alert set'}
            {item.updatedAt && <> · updated {timeAgo(item.updatedAt)}{item.updatedBy ? ` by ${item.updatedBy}` : ''}</>}
          </div>
        </div>
        <div className="w-36">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-xl font-extrabold tabular whitespace-nowrap">{fmtQty(item.quantity, item.unit)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-coffee-50 overflow-hidden"><div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${fill * 100}%` }} /></div>
        </div>
        <span className={`chip ${meta.cls}`}>{meta.label}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => onAdjust(item, 'add')} className="btn-mint btn-sm" title="Stock received"><Plus size={16} /> Received</button>
          <button onClick={() => onAdjust(item, 'remove')} className="btn-ghost btn-sm" title="Stock used"><Minus size={16} /> Used</button>
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className="grid place-items-center h-[38px] w-9 rounded-xl hover:bg-coffee-50" aria-label="More options">
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-20 w-48 card py-2 animate-fadeIn">
                  {[
                    { icon: SlidersHorizontal, label: 'Set exact count', run: () => onAdjust(item, 'set') },
                    { icon: History, label: 'History', run: () => onHistory(item) },
                    { icon: Pencil, label: 'Edit details', run: () => onEdit(item) },
                    { icon: Trash2, label: 'Delete', run: () => onDelete(item), danger: true },
                  ].map((a) => (
                    <button key={a.label} onClick={() => { setMenuOpen(false); a.run(); }} className={`w-full flex items-center gap-3 px-4 h-10 text-left font-semibold hover:bg-coffee-50 ${a.danger ? 'text-coral-600' : ''}`}>
                      <a.icon size={16} /> {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function Inventory() {
  const { fb, cafeId, user, staff, inventory, inventoryLoaded } = useAdmin();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null); // { item, mode }
  const [editing, setEditing] = useState(null); // { initial? }
  const [history, setHistory] = useState(null); // { item? }
  const [loadingStarter, setLoadingStarter] = useState(false);

  const counts = useMemo(() => {
    const c = { all: inventory.length, low: 0, out: 0 };
    inventory.forEach((i) => { const s = stockStatus(i); if (s !== 'ok') c[s] += 1; });
    return c;
  }, [inventory]);

  const categories = useMemo(() => [...new Set(inventory.map((i) => i.category).filter(Boolean))].sort(), [inventory]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = inventory.filter((i) => {
      const s = stockStatus(i);
      if (filter === 'low' && s !== 'low') return false;
      if (filter === 'out' && s !== 'out') return false;
      return !needle || `${i.name} ${i.category || ''}`.toLowerCase().includes(needle);
    });
    const map = new Map();
    list.forEach((i) => {
      const k = i.category || 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    });
    return [...map.entries()].sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
  }, [inventory, filter, q]);

  // Live updates: keep an open adjust dialog in sync with the latest quantity
  const liveAdjustItem = adjust && inventory.find((i) => i.id === adjust.item.id);

  async function loadStarter() {
    setLoadingStarter(true);
    try {
      await addStarterItems(fb.db, { cafeId, user, staff });
      toast('Sample list added. Update the quantities to match your kitchen.', 'success');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setLoadingStarter(false); }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}" from stock? Its history stays saved.`)) return;
    try { await deleteStockItem(fb.db, item); toast('Deleted', 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
  }

  const exportCsv = () => downloadCsv(`stock-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Item', 'Category', 'Quantity', 'Unit', 'Alert level', 'Status', 'Last updated', 'Updated by'],
    ...inventory.map((i) => [i.name, i.category || '', roundQty(i.quantity), i.unit, roundQty(i.minLevel), STOCK_META[stockStatus(i)].label, fmtDateTime(i.updatedAt), i.updatedBy || '']),
  ]);

  const FILTERS = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'low', label: 'Running low', count: counts.low },
    { key: 'out', label: 'Out of stock', count: counts.out },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Kitchen stock</h1>
          <p className="text-coffee-500">Raw materials left in the kitchen. Update when deliveries arrive and at closing time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setHistory({})} className="btn-ghost" disabled={!inventory.length}><History size={18} /> History</button>
          <button onClick={exportCsv} className="btn-ghost" disabled={!inventory.length}><Download size={18} /> CSV</button>
          <button onClick={() => setEditing({})} className="btn-primary"><Plus size={18} /> Add item</button>
        </div>
      </div>

      {!inventoryLoaded ? (
        <div className="grid place-items-center py-20"><Spinner size={36} /></div>
      ) : inventory.length === 0 ? (
        <EmptyState
          emoji="📦"
          title="No raw materials yet"
          text="Add what you keep in the kitchen — coffee beans, milk, sugar, bread… — or start from a sample list and edit it."
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={loadStarter} disabled={loadingStarter} className="btn-dark">{loadingStarter ? <Spinner className="text-white" /> : <Package size={18} />} Load sample list</button>
              <button onClick={() => setEditing({})} className="btn-primary"><Plus size={18} /> Add item</button>
            </div>
          )}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`card p-4 text-left transition ${filter === f.key ? 'ring-2 ring-coral-400' : ''}`}
              >
                <div className="text-xs font-bold uppercase tracking-wide text-coffee-500">{f.label}</div>
                <div className={`mt-1 font-display text-3xl font-extrabold tabular ${f.key === 'out' && f.count ? 'text-coral-600' : f.key === 'low' && f.count ? 'text-amber-600' : ''}`}>{f.count}</div>
              </button>
            ))}
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
            <input className="input pl-12" placeholder="Search stock" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {groups.length === 0 ? (
            <EmptyState emoji={filter === 'all' ? '🔍' : '✅'} title={filter === 'all' ? 'Nothing found' : 'All good here'} text={filter === 'all' ? 'Try another word.' : 'No items in this list right now.'} />
          ) : (
            groups.map(([cat, items]) => (
              <section key={cat} className="card overflow-visible">
                <h2 className="px-5 py-3 bg-cream-100 rounded-t-3xl font-display text-lg font-bold">{cat} <span className="text-coffee-300 text-sm">({items.length})</span></h2>
                <ul className="divide-y divide-coffee-50">
                  {items.map((item) => (
                    <StockRow
                      key={item.id}
                      item={item}
                      onAdjust={(it, mode) => setAdjust({ item: it, mode })}
                      onEdit={(it) => setEditing({ initial: it })}
                      onHistory={(it) => setHistory({ item: it })}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      {adjust && liveAdjustItem && <AdjustModal item={liveAdjustItem} mode={adjust.mode} onClose={() => setAdjust(null)} />}
      {editing && <ItemModal initial={editing.initial} categories={categories} onClose={() => setEditing(null)} />}
      {history && <HistoryModal item={history.item} onClose={() => setHistory(null)} />}
    </div>
  );
}
