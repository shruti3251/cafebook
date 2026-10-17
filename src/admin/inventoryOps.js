import { addDoc, collection, deleteDoc, doc, runTransaction, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';

export const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'packets', 'bottles', 'boxes', 'dozen'];

export const REASONS = {
  add: [
    { key: 'purchase', label: 'Delivery / purchase' },
    { key: 'return', label: 'Returned to stock' },
    { key: 'correction', label: 'Correction' },
  ],
  remove: [
    { key: 'used', label: 'Used in kitchen' },
    { key: 'wastage', label: 'Wasted / spoiled' },
    { key: 'correction', label: 'Correction' },
  ],
  set: [{ key: 'count', label: 'Stock count' }],
};

export const REASON_LABEL = {
  purchase: 'Received', return: 'Returned', used: 'Used', wastage: 'Wasted',
  correction: 'Correction', count: 'Stock count', created: 'Added item',
};

/** Avoids floating point noise like 2.3000000000000003 */
export const roundQty = (n) => Math.round(Number(n) * 1000) / 1000;

export function fmtQty(n, unit) {
  const v = roundQty(n);
  return `${v.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

/** 'out' when nothing left, 'low' at or below the minimum level, else 'ok'. */
export function stockStatus(item) {
  if (item.quantity <= 0) return 'out';
  if (item.minLevel > 0 && item.quantity <= item.minLevel) return 'low';
  return 'ok';
}

export const STOCK_META = {
  ok: { label: 'In stock', cls: 'bg-mint-100 text-mint-700', bar: 'bg-mint-500' },
  low: { label: 'Running low', cls: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400' },
  out: { label: 'Out of stock', cls: 'bg-coral-500 text-white', bar: 'bg-coral-500' },
};

const byName = (user, staff) => staff?.name || user?.email || 'Staff';

function logEntry({ cafeId, item, change, before, after, reason, note, user, staff }) {
  return {
    cafeId,
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    change: roundQty(change),
    before: roundQty(before),
    after: roundQty(after),
    reason,
    note: (note || '').trim().slice(0, 120),
    by: byName(user, staff),
    byUid: user.uid,
    at: serverTimestamp(),
  };
}

/**
 * Changes a stock level and records it in the history, in one transaction
 * (so two staff updating at the same time can't overwrite each other).
 * mode: 'add' | 'remove' | 'set'
 */
export async function adjustStock(db, { cafeId, item, mode, amount, reason, note, user, staff }) {
  const value = roundQty(amount);
  if (!(value >= 0) || (mode !== 'set' && value === 0)) throw new Error('Enter a quantity greater than 0.');
  const ref = doc(db, 'inventory', item.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This item was deleted.');
    const before = Number(snap.data().quantity) || 0;
    let after = mode === 'add' ? before + value : mode === 'remove' ? before - value : value;
    after = roundQty(after);
    if (after < 0) throw new Error(`Only ${fmtQty(before, item.unit)} left — you can't remove ${fmtQty(value, item.unit)}.`);
    tx.update(ref, { quantity: after, updatedAt: serverTimestamp(), updatedBy: byName(user, staff) });
    tx.set(doc(collection(db, 'inventoryLogs')), logEntry({
      cafeId, item: { ...item, ...snap.data(), id: item.id }, change: after - before, before, after, reason, note, user, staff,
    }));
    return after;
  });
}

export async function saveStockItem(db, { cafeId, initial, form, user, staff }) {
  const data = {
    name: form.name.trim(),
    unit: form.unit,
    category: (form.category || '').trim().slice(0, 30),
    minLevel: roundQty(form.minLevel || 0),
    cafeId,
    updatedAt: serverTimestamp(),
    updatedBy: byName(user, staff),
  };
  if (!data.name) throw new Error('Enter a name.');
  if (!(data.minLevel >= 0)) throw new Error('Minimum level must be 0 or more.');
  if (initial) {
    await updateDoc(doc(db, 'inventory', initial.id), data);
    return;
  }
  const quantity = roundQty(form.quantity || 0);
  if (!(quantity >= 0)) throw new Error('Quantity must be 0 or more.');
  const ref = await addDoc(collection(db, 'inventory'), { ...data, quantity, createdAt: serverTimestamp() });
  await addDoc(collection(db, 'inventoryLogs'), logEntry({
    cafeId, item: { id: ref.id, ...data }, change: quantity, before: 0, after: quantity, reason: 'created', note: '', user, staff,
  }));
}

export const deleteStockItem = (db, item) => deleteDoc(doc(db, 'inventory', item.id));

/** A typical Indian cafe starter list. Quantities are examples; edit them after loading. */
export const STARTER_ITEMS = [
  ['Coffee beans', 'kg', 'Coffee & tea', 3, 1],
  ['Tea leaves', 'kg', 'Coffee & tea', 1.5, 0.5],
  ['Milk', 'L', 'Dairy', 20, 8],
  ['Butter', 'kg', 'Dairy', 2, 0.5],
  ['Cheese slices', 'packets', 'Dairy', 6, 2],
  ['Paneer', 'kg', 'Dairy', 2, 1],
  ['Vanilla ice cream', 'L', 'Dairy', 5, 2],
  ['Sugar', 'kg', 'Dry goods', 5, 2],
  ['Chocolate syrup', 'bottles', 'Dry goods', 4, 1],
  ['Hazelnut syrup', 'bottles', 'Dry goods', 2, 1],
  ['Oreo biscuits', 'packets', 'Dry goods', 10, 4],
  ['Mango pulp', 'L', 'Dry goods', 3, 1],
  ['Bread loaves', 'pcs', 'Bakery', 12, 4],
  ['Burger / club buns', 'pcs', 'Bakery', 20, 6],
  ['Chicken', 'kg', 'Meat & veg', 3, 1],
  ['Frozen fries', 'kg', 'Meat & veg', 5, 2],
  ['Vegetables (mixed)', 'kg', 'Meat & veg', 4, 1.5],
  ['Paper cups', 'pcs', 'Packaging', 300, 100],
  ['Takeaway boxes', 'pcs', 'Packaging', 100, 30],
];

export async function addStarterItems(db, { cafeId, user, staff }) {
  const b = writeBatch(db);
  STARTER_ITEMS.forEach(([name, unit, category, quantity, minLevel]) => {
    const ref = doc(collection(db, 'inventory'));
    const data = { cafeId, name, unit, category, quantity, minLevel, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: byName(user, staff) };
    b.set(ref, data);
    b.set(doc(collection(db, 'inventoryLogs')), logEntry({
      cafeId, item: { id: ref.id, ...data }, change: quantity, before: 0, after: quantity, reason: 'created', note: 'Sample list', user, staff,
    }));
  });
  await b.commit();
}
