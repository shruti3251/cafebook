import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Check, Lock, Mail, Store, User } from 'lucide-react';
import { staffFirebase } from '../lib/firebase.js';
import { cleanPhone } from '../lib/format.js';
import { Spinner } from '../components/ui.jsx';
import { registerCafe } from './registerCafe.js';

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'This email already has an account. Log in instead, or use another email.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
  'auth/network-request-failed': 'No internet connection.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
  'auth/invalid-credential': 'Wrong email or password.',
};

const PERKS = [
  'QR code ordering for every table',
  'Live orders, bills, UPI QR and GST receipts',
  'Menu, kitchen stock and monthly PDF reports',
  'Free to start — no card needed',
];

export default function Signup() {
  const { auth, db } = staffFirebase();
  const navigate = useNavigate();
  // undefined = checking; null = logged out; object = logged in
  const [user, setUser] = useState(undefined);
  const [hasCafe, setHasCafe] = useState(false);
  const [f, setF] = useState({ ownerName: '', email: '', password: '', cafeName: '', address: '', phone: '', tableCount: '6', sampleMenu: true });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // If someone is already logged in: owners go to their dashboard; a login
  // without a cafe (e.g. registration interrupted) can finish setting one up.
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setUser(null); setHasCafe(false); return; }
    const staff = await getDoc(doc(db, 'staff', u.uid)).catch(() => null);
    setHasCafe(Boolean(staff?.exists()));
    setUser(u);
  }), [auth, db]);

  useEffect(() => { if (user && hasCafe && !busy) navigate('/admin', { replace: true }); }, [user, hasCafe, busy, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (f.ownerName.trim().length < 2) return setError('Please enter your name.');
    if (f.cafeName.trim().length < 2) return setError('Please enter your cafe name.');
    if (!user && f.password.length < 8) return setError('Password must be at least 8 characters.');
    if (f.phone && cleanPhone(f.phone).length !== 10) return setError('Enter a 10-digit phone number, or leave it empty.');
    setBusy(true);
    try {
      let u = user;
      if (!u) {
        setProgress('Creating your account…');
        try {
          u = (await createUserWithEmailAndPassword(auth, f.email.trim(), f.password)).user;
        } catch (err) {
          // Account exists from an earlier, unfinished sign-up? Use it if the password matches.
          if (err.code !== 'auth/email-already-in-use') throw err;
          u = (await signInWithEmailAndPassword(auth, f.email.trim(), f.password).catch(() => { throw err; })).user;
          const staff = await getDoc(doc(db, 'staff', u.uid));
          if (staff.exists()) { navigate('/admin', { replace: true }); return; }
        }
        sendEmailVerification(u).catch(() => {});
      }
      await registerCafe(db, u, { ...f, phone: f.phone ? cleanPhone(f.phone) : '' }, setProgress);
      setProgress('All set! Opening your dashboard…');
      navigate('/admin', { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || (err.code === 'permission-denied'
        ? 'This login is already linked to a cafe. Log in to open its dashboard.'
        : err.message || 'Something went wrong. Please try again.'));
      setBusy(false);
      setProgress('');
    }
  }

  if (user === undefined) return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={36} /></div>;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-coffee-900 via-coffee-700 to-coral-700 px-4 py-10">
      <div className="mx-auto max-w-4xl grid gap-8 lg:grid-cols-[1fr_1.1fr] items-start">
        <div className="text-cream lg:pt-10">
          <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-coral-500 text-white text-2xl shadow-soft">☕</div>
          <h1 className="mt-4 text-3xl lg:text-4xl font-extrabold">Bring your cafe to Cafebook</h1>
          <p className="mt-2 text-coffee-100">Set up QR table ordering in 2 minutes. Customers scan, order and pay — you see everything live.</p>
          <ul className="mt-6 space-y-3">
            {PERKS.map((p) => (
              <li key={p} className="flex items-start gap-3"><span className="mt-0.5 grid place-items-center h-6 w-6 rounded-full bg-mint-500 shrink-0"><Check size={15} /></span>{p}</li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="card p-6 lg:p-7 space-y-4 animate-fadeIn">
          <div>
            <h2 className="text-2xl font-extrabold">{user ? 'Set up your cafe' : 'Register your cafe'}</h2>
            <p className="text-sm text-coffee-500">
              {user ? <>Logged in as <b>{user.email}</b> · <button type="button" className="underline" onClick={() => signOut(auth)}>use another account</button></> : <>Already registered? <Link to="/admin/login" className="font-bold text-coral-600 underline">Log in</Link></>}
            </p>
          </div>

          <fieldset disabled={busy} className="space-y-4">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
              <input className="input pl-12" placeholder="Your name" autoComplete="name" value={f.ownerName} onChange={set('ownerName')} maxLength={60} required />
            </div>
            {!user && (
              <>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
                  <input className="input pl-12" type="email" placeholder="Email (your login)" autoComplete="username" value={f.email} onChange={set('email')} required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
                  <input className="input pl-12" type="password" placeholder="Password (min 8 characters)" autoComplete="new-password" value={f.password} onChange={set('password')} minLength={8} required />
                </div>
              </>
            )}
            <div className="relative">
              <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
              <input className="input pl-12" placeholder="Cafe name" value={f.cafeName} onChange={set('cafeName')} maxLength={50} required />
            </div>
            <input className="input" placeholder="Address (shown on bills) — optional" value={f.address} onChange={set('address')} maxLength={160} />
            <div className="grid grid-cols-2 gap-3">
              <input className="input" placeholder="Phone — optional" inputMode="numeric" value={f.phone} onChange={set('phone')} />
              <div className="flex items-center gap-2">
                <input className="input" type="number" min="0" max="50" value={f.tableCount} onChange={set('tableCount')} aria-label="Number of tables" />
                <span className="text-sm font-semibold text-coffee-500 shrink-0">tables</span>
              </div>
            </div>
            <label className="flex items-center gap-3 font-semibold text-coffee-700 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 accent-coral-500" checked={f.sampleMenu} onChange={set('sampleMenu')} />
              Start with a sample menu (you can edit or delete it)
            </label>
          </fieldset>

          {error && <p className="rounded-2xl bg-coral-50 text-coral-700 px-4 py-3 text-sm font-semibold">{error}</p>}
          <button className="btn-primary w-full h-14 text-lg" disabled={busy}>
            {busy ? <><Spinner className="text-white" /> {progress || 'Please wait…'}</> : user ? 'Create my cafe' : 'Create account & cafe'}
          </button>
          <p className="text-xs text-center text-coffee-500">You can add your logo, GSTIN, UPI ID and staff later in Settings.</p>
        </form>
      </div>
    </div>
  );
}
