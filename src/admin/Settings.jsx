import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { createLoginWithoutSwitching } from '../lib/firebase.js';
import { compressImage } from './imageOps.js';
import { Copy, Download, ImagePlus, LogOut, Plus, Printer, QrCode, RefreshCw, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { CafeLogo, Modal, Spinner, Toggle, useToast } from '../components/ui.jsx';
import { errorMessage } from '../lib/format.js';
import { printNode } from '../lib/print.js';
import { qrDataUrl, tableUrl } from '../lib/utils.js';
import { useAdmin } from './AdminLayout.jsx';
import { QrCard, QrSheet } from './printables.jsx';
import { createTable, deleteTable, rotateTableToken, sessionOrdersFor } from './tableOps.js';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UPI_RE = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;

function Section({ title, subtitle, children, action }) {
  return (
    <section className="card p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-coffee-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CafeProfile() {
  const { fb, cafeId, cafe, isOwner } = useAdmin();
  const toast = useToast();
  const [f, setF] = useState({
    name: cafe.name || '', address: cafe.address || '', phone: cafe.phone || '',
    gstin: cafe.gstin || '', gstRate: cafe.gstRate ?? 5, upiId: cafe.upiId || '',
  });
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const gstRate = Number(f.gstRate);
    const gstin = f.gstin.trim().toUpperCase();
    const upiId = f.upiId.trim();
    if (!f.name.trim()) return toast('Cafe name is required.', 'error');
    if (!(gstRate >= 0 && gstRate <= 28)) return toast('GST rate must be between 0 and 28.', 'error');
    if (gstin && !GSTIN_RE.test(gstin)) return toast('That GSTIN doesn\'t look right (15 characters).', 'error');
    if (upiId && !UPI_RE.test(upiId)) return toast('Enter a valid UPI ID, e.g. mycafe@okhdfcbank', 'error');
    setBusy(true);
    try {
      await updateDoc(doc(fb.db, 'cafes', cafeId), {
        name: f.name.trim(), address: f.address.trim(), phone: f.phone.trim(), gstin, gstRate, upiId,
      });
      toast('Settings saved', 'success');
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    try {
      // Small logo stored right in the cafe profile (no Cloud Storage needed)
      const logoUrl = await compressImage(file, 256, 0.85);
      await updateDoc(doc(fb.db, 'cafes', cafeId), { logoUrl });
      toast('Logo updated', 'success');
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setLogoBusy(false); e.target.value = ''; }
  }

  return (
    <Section title="Cafe profile" subtitle={isOwner ? 'Shown to customers and on bills.' : 'Only the owner can change these.'}>
      <form onSubmit={save}>
        <fieldset disabled={!isOwner} className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="flex md:flex-col items-center gap-3">
            <CafeLogo cafe={cafe} size={96} />
            {isOwner && (
              <label className="btn-ghost btn-sm cursor-pointer">
                {logoBusy ? <Spinner size={16} /> : <ImagePlus size={16} />} Logo
                <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Cafe name</label><input className="input" value={f.name} onChange={set('name')} maxLength={50} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={f.address} onChange={set('address')} maxLength={160} /></div>
            <div><label className="label">Phone (on bills)</label><input className="input" value={f.phone} onChange={set('phone')} maxLength={20} /></div>
            <div><label className="label">GSTIN</label><input className="input uppercase" value={f.gstin} onChange={set('gstin')} maxLength={15} placeholder="27ABCDE1234F1Z5" /></div>
            <div><label className="label">GST rate (%)</label><input className="input" type="number" min="0" max="28" step="0.5" value={f.gstRate} onChange={set('gstRate')} /></div>
            <div><label className="label">UPI ID (for payment QR)</label><input className="input" value={f.upiId} onChange={set('upiId')} placeholder="mycafe@okhdfcbank" /></div>
            {isOwner && <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : <Save size={18} />} Save changes</button></div>}
          </div>
        </fieldset>
      </form>
    </Section>
  );
}

function OtpSetting() {
  const { fb, cafeId, cafe, isOwner } = useAdmin();
  const toast = useToast();
  const toggle = async (v) => {
    try {
      await updateDoc(doc(fb.db, 'cafes', cafeId), { otpEnabled: v });
      toast(v ? 'OTP verification is ON' : 'OTP verification is OFF', 'success');
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <Section title="Customer phone verification">
      <div className="flex items-start gap-4">
        <ShieldCheck className="text-mint-600 shrink-0 mt-1" size={28} />
        <div className="flex-1">
          <div className="font-bold">Verify phone with OTP</div>
          <p className="text-sm text-coffee-500 mt-1">
            When ON, customers confirm their number with an SMS code before ordering, and can see their order history on any device.
            When OFF, customers only see orders placed from their own phone.
            <b> Note:</b> sending SMS needs Firebase's paid Blaze plan, so keep this OFF on the free plan.
          </p>
        </div>
        <Toggle checked={Boolean(cafe.otpEnabled)} onChange={toggle} disabled={!isOwner} label="OTP verification" />
      </div>
    </Section>
  );
}

function QrPreview({ table, onClose }) {
  const { cafe, cafeId } = useAdmin();
  const toast = useToast();
  const [qr, setQr] = useState(null);
  const url = tableUrl(cafeId, table.tableNumber, table.secretToken);
  useEffect(() => { qrDataUrl(url, 800).then(setQr); }, [url]);

  const download = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = `table-${table.tableNumber}-qr.png`;
    a.click();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied', 'success'); } catch { toast('Could not copy', 'error'); }
  };

  return (
    <Modal open onClose={onClose} title={`Table ${table.tableNumber} QR code`}>
      <div className="flex justify-center overflow-hidden">
        {qr ? <div className="origin-top scale-[0.85] sm:scale-100 -mb-8 sm:mb-0"><QrCard cafe={cafe} tableNumber={table.tableNumber} qr={qr} /></div> : <Spinner size={32} />}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="btn-primary btn-sm" disabled={!qr} onClick={() => printNode(<QrSheet cafe={cafe} cards={[{ tableNumber: table.tableNumber, qr }]} />)}><Printer size={16} /> Print</button>
        <button className="btn-ghost btn-sm" disabled={!qr} onClick={download}><Download size={16} /> PNG</button>
        <button className="btn-ghost btn-sm" onClick={copy}><Copy size={16} /> Link</button>
      </div>
      <p className="mt-3 text-xs text-coffee-500 break-all">{url}</p>
    </Modal>
  );
}

function TablesSettings() {
  const { fb, cafeId, cafe, tables, openOrders } = useAdmin();
  const toast = useToast();
  const [newNumber, setNewNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [printing, setPrinting] = useState(false);

  const nextNumber = tables.reduce((m, t) => Math.max(m, t.tableNumber), 0) + 1;

  async function add(e) {
    e.preventDefault();
    const n = Number(newNumber || nextNumber);
    if (!Number.isInteger(n) || n < 1 || n > 999) return toast('Enter a table number between 1 and 999.', 'error');
    if (tables.some((t) => t.tableNumber === n)) return toast(`Table ${n} already exists.`, 'error');
    setBusy(true);
    try { await createTable(fb.db, cafeId, n); setNewNumber(''); toast(`Table ${n} added`, 'success'); } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  }

  async function remove(t) {
    const open = sessionOrdersFor(t, openOrders).filter((o) => o.status !== 'cancelled');
    if (open.length) return toast(`Table ${t.tableNumber} has an open bill. Close the table first.`, 'error');
    if (!window.confirm(`Delete Table ${t.tableNumber}? Its QR code will stop working.`)) return;
    try { await deleteTable(fb.db, t); toast(`Table ${t.tableNumber} deleted`, 'success'); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function rotate(t) {
    if (!window.confirm(`Generate a new QR code for Table ${t.tableNumber}? The old printed code will stop working, so you'll need to print a new one.`)) return;
    try { await rotateTableToken(fb.db, t); toast('New QR code generated. Print it now.', 'success'); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function printAll() {
    setPrinting(true);
    try {
      const cards = await Promise.all(tables.map(async (t) => ({
        tableNumber: t.tableNumber,
        qr: await qrDataUrl(tableUrl(cafeId, t.tableNumber, t.secretToken), 600),
      })));
      printNode(<QrSheet cafe={cafe} cards={cards} />);
    } finally { setPrinting(false); }
  }

  return (
    <Section
      title="Tables & QR codes"
      subtitle="Each table has its own secret QR code. Print and stick them on the tables."
      action={<button className="btn-dark" onClick={printAll} disabled={!tables.length || printing}>{printing ? <Spinner className="text-white" /> : <Printer size={18} />} Print all QR codes</button>}
    >
      <form onSubmit={add} className="flex gap-2 max-w-sm mb-5">
        <input className="input" type="number" min="1" max="999" placeholder={`Table number (next: ${nextNumber})`} value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={busy}>{busy ? <Spinner className="text-white" /> : <Plus size={18} />} Add</button>
      </form>
      {tables.length === 0 ? (
        <p className="text-coffee-500">No tables yet. Add your first table above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-coffee-100 bg-white px-4 py-3">
              <div className="font-display text-2xl font-extrabold w-12">{t.tableNumber}</div>
              <div className="flex-1" />
              <button onClick={() => setPreview(t)} className="btn-ghost btn-sm"><QrCode size={16} /> QR</button>
              <button onClick={() => rotate(t)} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-coffee-50" title="Generate new QR code" aria-label="Generate new QR code"><RefreshCw size={16} /></button>
              <button onClick={() => remove(t)} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-coral-50 text-coral-600" title="Delete table" aria-label="Delete table"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {preview && <QrPreview table={tables.find((t) => t.id === preview.id) || preview} onClose={() => setPreview(null)} />}
    </Section>
  );
}

function StaffSettings() {
  const { fb, cafeId, user } = useAdmin();
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(fb.db, 'staff'), where('cafeId', '==', cafeId)),
    (s) => setStaff(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setStaff([]),
  ), [fb.db, cafeId]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const email = f.email.trim().toLowerCase();
      if (f.password.length < 8) throw new Error('Password must be at least 8 characters.');
      let uid;
      try {
        uid = await createLoginWithoutSwitching(email, f.password);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') throw new Error('A login with this email already exists.');
        if (err.code === 'auth/invalid-email') throw new Error('Enter a valid email.');
        throw err;
      }
      await setDoc(doc(fb.db, 'staff', uid), { cafeId, email, name: f.name.trim(), role: f.role, createdAt: serverTimestamp() });
      toast(`${f.email} can now log in`, 'success');
      setOpen(false);
      setF({ name: '', email: '', password: '', role: 'staff' });
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  }

  async function remove(s) {
    if (!window.confirm(`Remove ${s.email}? They will lose access to the dashboard immediately.`)) return;
    try { await deleteDoc(doc(fb.db, 'staff', s.id)); toast('Removed', 'success'); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Section title="Staff logins" subtitle="People who can use this dashboard." action={<button className="btn-ghost" onClick={() => setOpen(true)}><UserPlus size={18} /> Add staff</button>}>
      <ul className="divide-y divide-coffee-50">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <div className="h-10 w-10 rounded-full bg-mint-100 text-mint-700 grid place-items-center font-bold">{(s.name || s.email).charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{s.name || s.email}{s.id === user.uid && ' (you)'}</div>
              <div className="text-sm text-coffee-500 truncate">{s.email} · <span className="capitalize">{s.role}</span></div>
            </div>
            {s.id !== user.uid && <button onClick={() => remove(s)} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-coral-50 text-coral-600" aria-label="Remove"><Trash2 size={16} /></button>}
          </li>
        ))}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="Add staff login">
        <form onSubmit={add} className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">Password (min 8 characters)</label><input className="input" type="text" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="staff">Staff — orders, tables & menu</option>
              <option value="owner">Owner — everything incl. settings & staff</option>
            </select>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Create login'}</button>
        </form>
      </Modal>
    </Section>
  );
}

export default function Settings() {
  const { fb, isOwner, user } = useAdmin();
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Settings</h1>
          <p className="text-coffee-500">Signed in as {user.email}</p>
        </div>
        <button onClick={() => signOut(fb.auth)} className="btn-ghost md:hidden"><LogOut size={18} /> Sign out</button>
      </div>
      <CafeProfile />
      <OtpSetting />
      <TablesSettings />
      {isOwner && <StaffSettings />}
    </div>
  );
}
