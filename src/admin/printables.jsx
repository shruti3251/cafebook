import { fmtDateTime, inr, sumOrders } from '../lib/format.js';

/** Merge identical lines across a customer's orders for a compact receipt. */
export function mergeLines(orders) {
  const map = new Map();
  orders.forEach((o) => o.items.forEach((it) => {
    const key = `${it.itemId}|${it.price}`;
    const cur = map.get(key);
    if (cur) cur.qty += it.qty;
    else map.set(key, { name: it.name, price: it.price, qty: it.qty });
  }));
  return [...map.values()];
}

export function Receipt({ cafe, tableNumber, customerName, customerPhone, orders }) {
  const lines = mergeLines(orders);
  const t = sumOrders(orders);
  const rate = orders[0]?.gstRate ?? cafe.gstRate ?? 5;
  const paid = orders.every((o) => o.paymentStatus === 'paid');
  const method = orders.find((o) => o.paymentMethod)?.paymentMethod;
  const halfTax = t.tax / 2;
  const s = { fontFamily: "'Courier New', ui-monospace, monospace", color: '#000', fontSize: 13 };

  return (
    <div style={{ ...s, width: '76mm', margin: '0 auto', padding: '4mm 0' }}>
      <style>{'@page { margin: 6mm; }'}</style>
      <div style={{ textAlign: 'center' }}>
        {cafe.logoUrl && <img src={cafe.logoUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />}
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{cafe.name}</div>
        {cafe.address && <div>{cafe.address}</div>}
        {cafe.phone && <div>Ph: {cafe.phone}</div>}
        {cafe.gstin && <div>GSTIN: {cafe.gstin}</div>}
        <div style={{ marginTop: 6, fontWeight: 700 }}>TAX INVOICE</div>
      </div>
      <hr style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div>Table: {tableNumber} &nbsp; Orders: {orders.map((o) => `#${o.orderNumber}`).join(', ')}</div>
      <div>Customer: {customerName} ({customerPhone})</div>
      <div>Date: {fmtDateTime(new Date())}</div>
      <hr style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', ...s }}>
        <thead>
          <tr><th style={{ textAlign: 'left' }}>Item</th><th>Qty</th><th style={{ textAlign: 'right' }}>Amt</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ paddingRight: 4 }}>{l.name}<br /><span style={{ fontSize: 11 }}>@ {inr(l.price)}</span></td>
              <td style={{ textAlign: 'center', verticalAlign: 'top' }}>{l.qty}</td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{inr(l.price * l.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <Row k="Subtotal" v={inr(t.subtotal)} />
      <Row k={`CGST @ ${rate / 2}%`} v={inr(halfTax)} />
      <Row k={`SGST @ ${rate / 2}%`} v={inr(halfTax)} />
      <hr style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <Row k={<b style={{ fontSize: 16 }}>TOTAL</b>} v={<b style={{ fontSize: 16 }}>{inr(t.total)}</b>} />
      <div style={{ marginTop: 6 }}>{paid ? `PAID${method ? ` via ${method.toUpperCase()}` : ''}` : 'PAYMENT DUE'}</div>
      <div style={{ textAlign: 'center', marginTop: 10 }}>Thank you! Visit again ☕</div>
      <div style={{ textAlign: 'center', fontSize: 10, marginTop: 4 }}>Powered by Cafebook</div>
    </div>
  );
}

function Row({ k, v }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{v}</span></div>;
}

export function billAsText({ cafe, tableNumber, customerName, orders }) {
  const t = sumOrders(orders);
  const lines = mergeLines(orders).map((l) => `${l.qty} x ${l.name} — ${inr(l.price * l.qty)}`);
  return [
    `🧾 ${cafe.name}`,
    cafe.gstin ? `GSTIN: ${cafe.gstin}` : null,
    `Table ${tableNumber} · ${customerName}`,
    '',
    ...lines,
    '',
    `Subtotal: ${inr(t.subtotal)}`,
    `GST (${orders[0]?.gstRate ?? cafe.gstRate ?? 5}%): ${inr(t.tax)}`,
    `Total: ${inr(t.total)}`,
    '',
    'Thank you for visiting! ☕',
  ].filter((x) => x !== null).join('\n');
}

/** A single table card for printing. Sized so 6 fit on an A4 page (2 x 3). */
export function QrCard({ cafe, tableNumber, qr }) {
  return (
    <div
      style={{
        width: '90mm', height: '88mm', boxSizing: 'border-box', border: '1.5px dashed #c9b4a5', borderRadius: '6mm',
        padding: '5mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'Poppins, Nunito, sans-serif', color: '#2B1A10', background: '#FFF8EE', breakInside: 'avoid',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5mm' }}>
        {cafe.logoUrl ? (
          <img src={cafe.logoUrl} alt="" style={{ width: '9mm', height: '9mm', borderRadius: '2mm', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '9mm', height: '9mm', borderRadius: '2mm', background: '#F4683F', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
            {(cafe.name || 'C').charAt(0)}
          </div>
        )}
        <span style={{ fontWeight: 700, fontSize: '13pt' }}>{cafe.name}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: '26pt', lineHeight: 1, color: '#E0522A' }}>Table {tableNumber}</div>
      <img src={qr} alt={`QR for table ${tableNumber}`} style={{ width: '44mm', height: '44mm' }} />
      <div style={{ fontWeight: 600, fontSize: '10.5pt', background: '#14B08A', color: '#fff', borderRadius: '99px', padding: '1.2mm 4mm' }}>
        Scan to view menu &amp; order
      </div>
    </div>
  );
}

export function QrSheet({ cafe, cards }) {
  const pages = [];
  for (let i = 0; i < cards.length; i += 6) pages.push(cards.slice(i, i + 6));
  return (
    <div>
      <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
      {pages.map((page, p) => (
        <div
          key={p}
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 90mm)', gap: '4mm', justifyContent: 'center',
            pageBreakAfter: p < pages.length - 1 ? 'always' : 'auto',
          }}
        >
          {page.map((c) => <QrCard key={c.tableNumber} cafe={cafe} tableNumber={c.tableNumber} qr={c.qr} />)}
        </div>
      ))}
    </div>
  );
}
