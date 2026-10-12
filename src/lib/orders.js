import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { inr } from './format.js';

export function istDayKey(date = new Date()) {
  // "2026-10-11" -> "20261011", in Indian time so order numbers reset at IST midnight
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date).replace(/-/g, '');
}

export class OrderError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Places an order in one Firestore transaction:
 *  - re-reads the table token, cafe GST rate and every item from the server
 *  - refuses unavailable items
 *  - takes the next daily order number
 *  - uses `clientOrderId` as the document id, so a retry of the same cart can
 *    never create a second order (the existing one is returned instead).
 * The security rules re-check everything except per-item prices, which the
 * dashboard verifies against the menu (see orderIssues below).
 */
export async function placeOrder(db, { clientOrderId, cafeId, tableToken, tableNumber, uid, customerName, customerPhone, lines }) {
  const orderDay = istDayKey();
  const orderRef = doc(db, 'orders', clientOrderId);
  const accessRef = doc(db, 'tableAccess', tableToken);
  const cafeRef = doc(db, 'cafes', cafeId);
  const counterRef = doc(db, 'counters', `${cafeId}_${orderDay}`);
  const ids = [...new Set(lines.map((l) => l.itemId))];

  return runTransaction(db, async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists()) {
      return { orderId: clientOrderId, orderNumber: existing.data().orderNumber, duplicate: true };
    }

    const [access, cafe, counter, ...itemSnaps] = await Promise.all([
      tx.get(accessRef), tx.get(cafeRef), tx.get(counterRef), ...ids.map((id) => tx.get(doc(db, 'menuItems', id))),
    ]);

    const a = access.data();
    if (!access.exists() || a.cafeId !== cafeId || Number(a.tableNumber) !== tableNumber || a.active === false) {
      throw new OrderError('cafebook/invalid-table', 'This table QR code is no longer valid. Please ask the staff for help.');
    }

    const menu = new Map(itemSnaps.filter((s) => s.exists()).map((s) => [s.id, s.data()]));
    const unavailable = ids
      .filter((id) => { const m = menu.get(id); return !m || m.cafeId !== cafeId || m.isAvailable === false; })
      .map((id) => ({ itemId: id, name: menu.get(id)?.name || 'An item' }));
    if (unavailable.length) {
      throw new OrderError(
        'cafebook/unavailable',
        `${unavailable.map((u) => u.name).join(', ')} ${unavailable.length > 1 ? 'are' : 'is'} no longer available.`,
        { unavailable },
      );
    }

    let subtotalPaise = 0;
    const items = lines.map((l) => {
      const m = menu.get(l.itemId);
      const pricePaise = Math.round(Number(m.price) * 100);
      subtotalPaise += pricePaise * l.qty;
      return { itemId: l.itemId, name: m.name, price: pricePaise / 100, qty: l.qty, note: l.note || '', isVeg: m.isVeg !== false };
    });
    const gstRate = cafe.data()?.gstRate ?? 5;
    const taxPaise = Math.round((subtotalPaise * gstRate) / 100);
    const orderNumber = (counter.exists() ? counter.data().value : 0) + 1;

    tx.set(counterRef, { cafeId, day: orderDay, value: orderNumber, lastOrderId: clientOrderId });
    tx.set(orderRef, {
      cafeId,
      tableId: a.tableId,
      tableNumber: a.tableNumber,
      tableToken,
      sessionId: a.currentSessionId,
      sessionStatus: 'open',
      customerUid: uid,
      customerName,
      customerPhone,
      customerPhoneE164: `+91${customerPhone}`,
      items,
      subtotal: subtotalPaise / 100,
      gstRate,
      tax: taxPaise / 100,
      total: (subtotalPaise + taxPaise) / 100,
      status: 'received',
      paymentStatus: 'unpaid',
      paymentMethod: null,
      orderNumber,
      orderDay,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { orderId: clientOrderId, orderNumber, duplicate: false };
  });
}

/**
 * Checks an order against the live menu. Returns a list of human-readable
 * problems (empty = all good). A price can also differ legitimately if you
 * changed the menu after the order was placed.
 */
export function orderIssues(order, itemsById) {
  const issues = [];
  let sumPaise = 0;
  for (const it of order.items || []) {
    if (!(Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 50) || !(it.price >= 0)) {
      issues.push(`${it.name}: invalid quantity or price`);
      continue;
    }
    sumPaise += Math.round(it.price * 100) * it.qty;
    const m = itemsById[it.itemId];
    if (!m) {
      issues.push(`${it.name}: not on the menu`);
    } else if (Math.abs(Number(m.price) - it.price) > 0.001) {
      issues.push(`${it.name}: charged ${inr(it.price)}, menu price is ${inr(m.price)}`);
    }
  }
  if (Math.abs(sumPaise / 100 - order.subtotal) > 0.01) {
    issues.push(`Items add up to ${inr(sumPaise / 100)} but the order says ${inr(order.subtotal)}`);
  }
  return issues;
}
