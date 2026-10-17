import { isActiveOrder, sumOrders, toDate } from '../lib/format.js';
import { parseDay, periodLabel } from './reportData.js';

// The built-in PDF fonts have no ₹ glyph, so amounts are written as "Rs."
const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n) => `Rs. ${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const dayLabel = (s) => parseDay(s).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

const CORAL = [224, 82, 42];
const COFFEE = [43, 26, 16];
const MUTED = [123, 75, 42];
const LINE = [234, 219, 207];
const CREAM = [255, 243, 224];
const M = 14; // page margin (mm)
const num = { halign: 'right' };

// ---------- Shared building blocks ----------

async function loadPdf(orientation = 'portrait') {
  const [jspdfMod, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const JsPDF = jspdfMod.jsPDF || jspdfMod.default?.jsPDF || jspdfMod.default;
  // The plugin's export shape differs between bundlers; accept all of them.
  const autoTable = [autoTableMod.default, autoTableMod.default?.default, autoTableMod.autoTable].find((f) => typeof f === 'function');
  return { doc: new JsPDF({ unit: 'mm', format: 'a4', orientation }), autoTable };
}

/** Coral title band + address/filter lines. Returns the y position to continue from. */
function drawHeader(doc, { cafe, title, period, filters = {} }) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...CORAL);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.text(cafe.name || 'Cafe', M, 13);
  doc.setFont('helvetica', 'normal').setFontSize(11);
  doc.text(`${title} · ${period}`, M, 21);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, W - M, 13, { align: 'right' });
  if (cafe.gstin) doc.text(`GSTIN: ${cafe.gstin}`, W - M, 18, { align: 'right' });

  let y = 36;
  doc.setTextColor(...MUTED).setFontSize(8.5);
  if (cafe.address) { doc.text(cafe.address, M, y); y += 5; }
  const filterNote = [filters.table && `Table ${filters.table}`, filters.search && `search "${filters.search}"`].filter(Boolean).join(', ');
  if (filterNote) { doc.setTextColor(...CORAL); doc.text(`Filtered: ${filterNote}`, M, y); y += 5; }
  return y + 2;
}

const tableStyle = {
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.2, textColor: COFFEE },
  headStyles: { fillColor: COFFEE, textColor: [255, 255, 255], fontStyle: 'bold' },
  footStyles: { fillColor: CREAM, textColor: COFFEE, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [255, 250, 244] },
  margin: { left: M, right: M, bottom: 16 },
  showFoot: 'lastPage', // the Total row appears once, at the end of the table
  showHead: 'everyPage',
};

/** Right-align heading/total cells of number columns so they line up with the values. */
const alignNumbers = (cols, extra) => ({
  didParseCell: (data) => {
    if (cols.includes(data.column.index)) data.cell.styles.halign = 'right';
    extra?.(data);
  },
});

/** Page footer on every page, then save. */
function finish(doc, { cafe, period, fileLabel }) {
  const W = doc.internal.pageSize.getWidth();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, H - 11, W - M, H - 11);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(`${cafe.name || ''} · ${period}`, M, H - 7);
    doc.text(`Page ${p} of ${pages} · Cafebook`, W - M, H - 7, { align: 'right' });
  }
  // "Café" -> "Cafe" so file names stay readable everywhere
  const safe = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`${safe(cafe.name || 'Cafe')}-${fileLabel}-${safe(period)}.pdf`);
}

const statusText = (o) => (o.status === 'cancelled'
  ? 'Cancelled'
  : `${o.status.charAt(0).toUpperCase()}${o.status.slice(1)}`);
const paymentText = (o) => (o.status === 'cancelled' ? '-' : o.paymentStatus === 'paid' ? `Paid (${(o.paymentMethod || 'cash').toUpperCase()})` : 'Unpaid');

// ---------- Orders list PDF ----------

/** Every order in the period (as filtered on screen), one row each. */
export async function downloadOrdersPdf({ cafe, orders, from, to, filters }) {
  const { doc, autoTable } = await loadPdf('landscape');
  const period = periodLabel(from, to);
  let y = drawHeader(doc, { cafe, title: 'All orders', period, filters });

  const active = orders.filter(isActiveOrder);
  const t = sumOrders(active);
  const cancelled = orders.length - active.length;
  doc.setTextColor(...COFFEE).setFont('helvetica', 'bold').setFontSize(10.5);
  doc.text(
    `${active.length} order${active.length === 1 ? '' : 's'} · Total ${money(t.total)} (GST ${money(t.tax)})${cancelled ? ` · ${cancelled} cancelled` : ''}`,
    M, y + 2,
  );
  y += 6;

  // Oldest first reads naturally on paper
  const rows = [...orders].sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));

  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [['Order', 'Date & time', 'Table', 'Customer', 'Phone', 'Items', 'Subtotal', 'GST', 'Total', 'Status', 'Payment']],
    body: rows.map((o) => {
      const d = toDate(o.createdAt);
      return [
        `#${o.orderNumber}`,
        d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' }) : '',
        o.tableNumber,
        o.customerName,
        o.customerPhone,
        o.items.map((i) => `${i.qty} x ${i.name}${i.note ? ` ("${i.note}")` : ''}`).join('\n'),
        money(o.subtotal),
        money(o.tax),
        money(o.total),
        statusText(o),
        paymentText(o),
      ];
    }),
    foot: [['', '', '', '', '', `Total (excluding ${cancelled} cancelled)`, money(t.subtotal), money(t.tax), money(t.total), '', '']],
    columnStyles: {
      0: { cellWidth: 14, fontStyle: 'bold' },
      1: { cellWidth: 30 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 30 },
      4: { cellWidth: 22 },
      5: { cellWidth: 'auto' },
      6: { ...num, cellWidth: 22 },
      7: { ...num, cellWidth: 18 },
      8: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
      9: { cellWidth: 18 },
      10: { cellWidth: 22 },
    },
    styles: { ...tableStyle.styles, fontSize: 7.5, valign: 'top' },
    ...alignNumbers([6, 7, 8], (data) => {
      // Grey out cancelled orders so they're clearly not part of the total
      if (data.section === 'body' && rows[data.row.index]?.status === 'cancelled') {
        data.cell.styles.textColor = [170, 150, 140];
        data.cell.styles.fontStyle = 'italic';
      }
    }),
  });

  if (!orders.length) {
    doc.setFont('helvetica', 'italic').setFontSize(10).setTextColor(...MUTED);
    doc.text('No orders in this period.', M, y + 20);
  }
  finish(doc, { cafe, period, fileLabel: 'orders' });
}

// ---------- Sales summary report PDF ----------

/** Summary report: tiles, daily chart, payments, day-by-day, best sellers, tables. */
export async function downloadReportPdf({ cafe, report, filters }) {
  const { doc, autoTable } = await loadPdf('portrait');
  const W = doc.internal.pageSize.getWidth();
  const period = periodLabel(report.from, report.to);
  let y = drawHeader(doc, { cafe, title: 'Sales report', period, filters });

  // ---------- Summary tiles ----------
  const tiles = [
    ['Total sales (incl. GST)', money(report.totals.total)],
    ['Orders', String(report.orderCount)],
    ['Average order', money(report.avgOrder)],
    ['GST collected', money(report.totals.tax)],
    ['Net sales (excl. GST)', money(report.totals.subtotal)],
    ['Customers', String(report.customers)],
    ['Days with sales', `${report.openDays} / ${report.daily.length}`],
    ['Best day', report.busiest ? `${dayLabel(report.busiest.date)} · ${short(report.busiest.total)}` : '-'],
  ];
  const tw = (W - 2 * M - 3 * 4) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + (i % 4) * (tw + 4);
    const ty = y + Math.floor(i / 4) * 20;
    doc.setFillColor(...(i === 0 ? CORAL : CREAM));
    doc.roundedRect(x, ty, tw, 17, 2, 2, 'F');
    doc.setTextColor(...(i === 0 ? [255, 255, 255] : MUTED)).setFont('helvetica', 'normal').setFontSize(7.5);
    doc.text(label, x + 3, ty + 5.5);
    doc.setTextColor(...(i === 0 ? [255, 255, 255] : COFFEE)).setFont('helvetica', 'bold').setFontSize(value.length > 18 ? 9 : 11);
    doc.text(value, x + 3, ty + 12.5);
  });
  y += 44;

  // ---------- Daily sales chart (multi-day reports) ----------
  if (report.daily.length > 1) {
    doc.setTextColor(...COFFEE).setFont('helvetica', 'bold').setFontSize(11);
    doc.text('Daily sales (incl. GST)', M, y);
    y += 4;
    const chartH = 42;
    const chartW = W - 2 * M - 14;
    const x0 = M + 14;
    const max = Math.max(...report.daily.map((d) => d.total), 1);
    doc.setDrawColor(...LINE).setLineWidth(0.2).setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED);
    [0, 0.5, 1].forEach((f) => {
      const gy = y + chartH - f * chartH;
      doc.line(x0, gy, x0 + chartW, gy);
      doc.text(short(max * f).replace('Rs. ', ''), x0 - 2, gy + 1, { align: 'right' });
    });
    const slot = chartW / report.daily.length;
    const bw = Math.max(0.8, slot - Math.min(1.2, slot * 0.25)); // small gap between bars
    doc.setFillColor(...CORAL);
    report.daily.forEach((d, i) => {
      const h = (d.total / max) * chartH;
      if (h > 0) doc.roundedRect(x0 + i * slot, y + chartH - h, bw, h, Math.min(0.8, bw / 2), Math.min(0.8, bw / 2), 'F');
    });
    const every = Math.ceil(report.daily.length / 10);
    report.daily.forEach((d, i) => {
      if (i % every === 0 || i === report.daily.length - 1) {
        doc.text(String(parseDay(d.date).getDate()), x0 + i * slot + bw / 2, y + chartH + 4, { align: 'center' });
      }
    });
    y += chartH + 10;
  }

  const heading = (text) => {
    let at = (doc.lastAutoTable?.finalY ?? y) + 9;
    if (at > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); at = 18; }
    doc.setTextColor(...COFFEE).setFont('helvetica', 'bold').setFontSize(11);
    doc.text(text, M, at);
    return at + 3;
  };

  // ---------- Payment methods ----------
  const m = report.methods;
  autoTable(doc, {
    ...tableStyle,
    startY: heading('Payments'),
    head: [['Method', 'Amount', 'Share']],
    body: [['Cash', m.cash], ['UPI', m.upi], ['Card', m.card], ['Not yet paid', m.unpaid]].map(([k, v]) => [
      k, money(v), report.totals.total ? `${Math.round((v / report.totals.total) * 100)}%` : '0%',
    ]),
    foot: [['Total', money(report.totals.total), '100%']],
    columnStyles: { 1: num, 2: num },
    ...alignNumbers([1, 2]),
    tableWidth: 110,
  });

  // ---------- Daily breakdown ----------
  if (report.daily.length > 1) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading('Day-by-day breakdown'),
      head: [['Date', 'Orders', 'Net sales', 'GST', 'Total', 'Cash', 'UPI', 'Card']],
      body: report.daily.map((d) => [dayLabel(d.date), d.orders || '-', money(d.subtotal), money(d.tax), money(d.total), money(d.cash), money(d.upi), money(d.card)]),
      foot: [['Total', report.orderCount, money(report.totals.subtotal), money(report.totals.tax), money(report.totals.total), money(m.cash), money(m.upi), money(m.card)]],
      columnStyles: { 1: num, 2: num, 3: num, 4: { halign: 'right', fontStyle: 'bold' }, 5: num, 6: num, 7: num },
      ...alignNumbers([1, 2, 3, 4, 5, 6, 7]),
      styles: { ...tableStyle.styles, fontSize: 7.3 },
    });
  }

  // ---------- Best sellers ----------
  if (report.bestSellers.length) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading(`Best-selling items${report.bestSellers.length > 25 ? ' (top 25)' : ''}`),
      head: [['#', 'Item', 'Qty sold', 'Revenue (excl. GST)']],
      body: report.bestSellers.slice(0, 25).map((b, i) => [i + 1, b.name, b.qty, money(b.revenue)]),
      columnStyles: { 0: { cellWidth: 10 }, 2: num, 3: num },
      ...alignNumbers([2, 3]),
    });
  }

  // ---------- Sales by table ----------
  if (report.tables.length) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading('Sales by table'),
      head: [['Table', 'Total sales']],
      body: report.tables.map((t) => [`Table ${t.tableNumber}`, money(t.total)]),
      columnStyles: { 1: num },
      ...alignNumbers([1]),
      tableWidth: 90,
    });
  }

  if (report.cancelledCount) {
    const at = (doc.lastAutoTable?.finalY ?? y) + 6;
    doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(`${report.cancelledCount} cancelled order(s) are not included in the figures above.`, M, at);
  }

  finish(doc, { cafe, period, fileLabel: 'sales-report' });
}
