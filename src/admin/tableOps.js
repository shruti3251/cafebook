import { collection, doc, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { randomToken } from '../lib/format.js';

/**
 * Every table always has exactly one OPEN session. Orders are stamped with it.
 * Closing a table closes that session and opens a fresh one, so the next
 * group starts with an empty bill.
 */

export async function createTable(db, cafeId, tableNumber) {
  const tableRef = doc(collection(db, 'tables'));
  const sessionRef = doc(collection(db, 'tableSessions'));
  const token = randomToken();
  const b = writeBatch(db);
  b.set(sessionRef, { cafeId, tableId: tableRef.id, tableNumber, status: 'open', startedAt: serverTimestamp(), closedAt: null });
  b.set(tableRef, { cafeId, tableNumber, secretToken: token, status: 'active', currentSessionId: sessionRef.id, createdAt: serverTimestamp() });
  b.set(doc(db, 'tableAccess', token), { cafeId, tableId: tableRef.id, tableNumber, currentSessionId: sessionRef.id, active: true });
  await b.commit();
}

export async function deleteTable(db, table) {
  const b = writeBatch(db);
  b.delete(doc(db, 'tableAccess', table.secretToken));
  if (table.currentSessionId) {
    b.update(doc(db, 'tableSessions', table.currentSessionId), { status: 'closed', closedAt: serverTimestamp() });
  }
  b.delete(doc(db, 'tables', table.id));
  await b.commit();
}

/** Replaces the secret QR token - old printed QR codes for this table stop working. */
export async function rotateTableToken(db, table) {
  const token = randomToken();
  const b = writeBatch(db);
  b.delete(doc(db, 'tableAccess', table.secretToken));
  b.set(doc(db, 'tableAccess', token), {
    cafeId: table.cafeId, tableId: table.id, tableNumber: table.tableNumber, currentSessionId: table.currentSessionId, active: true,
  });
  b.update(doc(db, 'tables', table.id), { secretToken: token });
  await b.commit();
}

export async function closeTable(db, table, sessionOrders) {
  const newSession = doc(collection(db, 'tableSessions'));
  const b = writeBatch(db);
  b.update(doc(db, 'tableSessions', table.currentSessionId), { status: 'closed', closedAt: serverTimestamp() });
  b.set(newSession, { cafeId: table.cafeId, tableId: table.id, tableNumber: table.tableNumber, status: 'open', startedAt: serverTimestamp(), closedAt: null });
  b.update(doc(db, 'tables', table.id), { currentSessionId: newSession.id });
  b.update(doc(db, 'tableAccess', table.secretToken), { currentSessionId: newSession.id });
  sessionOrders.forEach((o) => b.update(doc(db, 'orders', o.id), { sessionStatus: 'closed', updatedAt: serverTimestamp() }));
  await b.commit();
}

export async function markCustomerPaid(db, orders, method) {
  const b = writeBatch(db);
  orders.forEach((o) => b.update(doc(db, 'orders', o.id), {
    paymentStatus: 'paid', paymentMethod: method, paidAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await b.commit();
}

export async function markCustomerUnpaid(db, orders) {
  const b = writeBatch(db);
  orders.forEach((o) => b.update(doc(db, 'orders', o.id), {
    paymentStatus: 'unpaid', paymentMethod: null, paidAt: null, updatedAt: serverTimestamp(),
  }));
  await b.commit();
}

/** Orders that belong to a table's current bill. */
export function sessionOrdersFor(table, openOrders) {
  return openOrders.filter((o) => o.tableId === table.id && o.sessionId === table.currentSessionId);
}

export function tableStatus(orders) {
  const active = orders.filter((o) => o.status !== 'cancelled');
  if (active.some((o) => o.status === 'received')) return 'new';
  if (orders.length && active.every((o) => o.paymentStatus === 'paid')) return 'paid';
  if (orders.length) return 'occupied';
  return 'free';
}

/** Everyone at the table has paid (cancelled orders don't count). */
export function canCloseTable(orders) {
  return orders.length > 0 && orders.filter((o) => o.status !== 'cancelled').every((o) => o.paymentStatus === 'paid');
}

/** Adds/updates the customer's record when their order reaches the dashboard. */
export async function recordCustomer(db, orderId, order) {
  const ref = doc(db, 'customers', `${order.cafeId}_${order.customerPhone}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    if (prev?.lastOrderIds?.includes(orderId)) return; // another device already counted it
    tx.set(ref, {
      cafeId: order.cafeId,
      phone: order.customerPhone,
      name: order.customerName,
      firstVisit: prev?.firstVisit || order.createdAt || serverTimestamp(),
      lastVisit: order.createdAt || serverTimestamp(),
      lastTableNumber: order.tableNumber,
      orderCount: (prev?.orderCount || 0) + 1,
      lastOrderIds: [...(prev?.lastOrderIds || []), orderId].slice(-20),
    });
  });
}
