import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { Lock, Mail } from 'lucide-react';
import { staffFirebase } from '../lib/firebase.js';
import { Spinner, useToast } from '../components/ui.jsx';

const MESSAGES = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/user-disabled': 'This login has been disabled by the owner.',
};

export default function Login() {
  const { auth } = staffFirebase();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dest = location.state?.from || '/admin';
  useEffect(() => onAuthStateChanged(auth, (u) => { if (u) navigate(dest, { replace: true }); }), [auth, dest, navigate]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(MESSAGES[err.code] || 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email.trim()) { setError('Enter your email above first.'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast('Password reset email sent.', 'success');
    } catch (err) {
      setError(MESSAGES[err.code] || 'Could not send reset email.');
    }
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center px-5 bg-gradient-to-br from-coffee-900 via-coffee-700 to-coral-700">
      <form onSubmit={submit} className="card w-full max-w-sm p-7 animate-fadeIn">
        <div className="text-center">
          <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-coral-500 text-white text-2xl shadow-soft">☕</div>
          <h1 className="mt-3 text-2xl font-extrabold">Cafebook</h1>
          <p className="text-coffee-500 text-sm">Owner & staff dashboard</p>
        </div>
        <div className="mt-6 space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
            <input className="input pl-12" type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
            <input className="input pl-12" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm font-semibold text-coral-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Sign in'}</button>
          <button type="button" onClick={reset} className="w-full text-sm font-semibold text-coffee-500 min-h-[40px]">Forgot password?</button>
          <div className="border-t border-coffee-50 pt-4 text-center text-sm text-coffee-500">
            New to Cafebook?{' '}
            <Link to="/admin/signup" className="font-bold text-coral-600 underline underline-offset-2">Register your cafe</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
