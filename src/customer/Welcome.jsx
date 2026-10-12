import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  signInAnonymously,
  signInWithCredential,
  signInWithPhoneNumber,
  signOut,
} from 'firebase/auth';
import { ArrowRight, ShieldCheck, User } from 'lucide-react';
import { CafeLogo, Spinner, useToast } from '../components/ui.jsx';
import { cleanPhone, errorMessage, isValidPhone, maskPhone } from '../lib/format.js';
import { useCustomer } from './CustomerLayout.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Welcome() {
  const { cafe, tableNumber, base, profile, setProfile, otpRequired, user, fb, clearCart } = useCustomer();
  const navigate = useNavigate();
  const toast = useToast();

  const [editing, setEditing] = useState(!profile);
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [touched, setTouched] = useState(false);
  const [otpStage, setOtpStage] = useState(null); // null | 'sending' | 'code' | 'verifying'
  const [code, setCode] = useState('');
  const confirmation = useRef(null);
  const verifier = useRef(null);

  useEffect(() => () => { verifier.current?.clear(); }, []);

  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPhone(phone);
  const isVerified = (p) => (fb.auth.currentUser || user)?.phoneNumber === `+91${p}`;

  const proceed = (p) => {
    setProfile(p);
    navigate(`${base}/menu`);
  };

  async function sendOtp(p) {
    setOtpStage('sending');
    try {
      if (!verifier.current) {
        verifier.current = new RecaptchaVerifier(fb.auth, 'recaptcha-box', { size: 'invisible' });
      }
      const e164 = `+91${p.phone}`;
      const current = fb.auth.currentUser;
      confirmation.current = current && current.isAnonymous
        ? await linkWithPhoneNumber(current, e164, verifier.current)
        : await signInWithPhoneNumber(fb.auth, e164, verifier.current);
      setOtpStage('code');
      toast(`OTP sent to ${maskPhone(p.phone)}`, 'success');
    } catch (e) {
      verifier.current?.clear();
      verifier.current = null;
      setOtpStage(null);
      toast(e.code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.' : errorMessage(e, 'Could not send OTP.'), 'error');
    }
  }

  async function verifyOtp() {
    setOtpStage('verifying');
    try {
      await confirmation.current.confirm(code);
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use') {
        // This phone was verified before (e.g. on another visit) - sign into that account instead.
        const cred = PhoneAuthProvider.credentialFromError(e);
        await signInWithCredential(fb.auth, cred);
      } else {
        setOtpStage('code');
        toast(e.code === 'auth/invalid-verification-code' ? 'Wrong OTP. Please check and try again.' : errorMessage(e), 'error');
        return;
      }
    }
    toast('Phone verified!', 'success');
    proceed({ name: name.trim(), phone });
  }

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (!nameOk || !phoneOk) return;
    const p = { name: name.trim(), phone };
    if (otpRequired && !isVerified(phone)) {
      setProfile(null);
      sendOtp(p);
      return;
    }
    proceed(p);
  }

  async function notYou() {
    // Start fresh: new anonymous identity so the previous person's orders aren't visible.
    setProfile(null);
    clearCart();
    setName('');
    setPhone('');
    setEditing(true);
    await signOut(fb.auth);
    await signInAnonymously(fb.auth).catch(() => {});
  }

  function continueSaved() {
    if (otpRequired && !isVerified(profile.phone)) {
      setEditing(true);
      sendOtp(profile);
      return;
    }
    navigate(`${base}/menu`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-coral-50 via-cream to-cream">
      <div className="flex-1 max-w-md w-full mx-auto px-5 pt-10 pb-8 flex flex-col">
        <div className="text-center animate-fadeIn">
          <CafeLogo cafe={cafe} size={84} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-extrabold">{cafe.name}</h1>
          <p className="mt-1 text-coffee-500">{greeting()}! Lovely to have you here ☕</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-mint-500 text-white px-5 py-2 font-display font-bold shadow-soft">
            🪑 You're at Table {tableNumber}
          </div>
        </div>

        {!editing && profile ? (
          <div className="card mt-8 p-6 text-center animate-fadeIn">
            <div className="text-4xl">👋</div>
            <h2 className="mt-2 text-2xl font-bold">Welcome back, {profile.name.split(' ')[0]}!</h2>
            <p className="text-coffee-500 mt-1">+91 {maskPhone(profile.phone)}</p>
            <button onClick={continueSaved} className="btn-primary w-full mt-6 text-lg">
              Continue as {profile.name.split(' ')[0]} <ArrowRight size={20} />
            </button>
            <button onClick={notYou} className="mt-4 text-coral-600 font-bold underline underline-offset-4 min-h-[44px]">
              Not you? Change
            </button>
          </div>
        ) : otpStage === 'code' || otpStage === 'verifying' ? (
          <div className="card mt-8 p-6 animate-fadeIn">
            <div className="flex items-center gap-2 text-mint-700 font-bold"><ShieldCheck size={20} /> Verify your number</div>
            <p className="text-coffee-500 mt-1 text-sm">Enter the 6-digit code sent to +91 {maskPhone(phone)}</p>
            <input
              className="input mt-4 text-center text-2xl tracking-[0.5em] font-bold"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <button onClick={verifyOtp} disabled={code.length !== 6 || otpStage === 'verifying'} className="btn-primary w-full mt-4">
              {otpStage === 'verifying' ? <Spinner className="text-white" /> : 'Verify & continue'}
            </button>
            <button onClick={() => { setOtpStage(null); setCode(''); }} className="w-full mt-3 text-coffee-500 font-semibold min-h-[44px]">
              Change number
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="card mt-8 p-6 space-y-4 animate-fadeIn" noValidate>
            <div>
              <h2 className="text-xl font-bold">Let's get you started</h2>
              <p className="text-sm text-coffee-500">So we know whose order is whose.</p>
            </div>
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
                <input
                  id="name"
                  className="input pl-12"
                  placeholder="e.g. Rahul"
                  autoComplete="given-name"
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {touched && !nameOk && <p className="mt-1 text-sm text-coral-600 font-semibold">Please enter your name.</p>}
            </div>
            <div>
              <label className="label" htmlFor="phone">Mobile number</label>
              <div className="flex gap-2">
                <span className="input !w-auto grid place-items-center font-bold text-coffee-500">+91</span>
                <input
                  id="phone"
                  className="input"
                  placeholder="98765 43210"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(cleanPhone(e.target.value))}
                />
              </div>
              {touched && !phoneOk && <p className="mt-1 text-sm text-coral-600 font-semibold">Enter a valid 10-digit mobile number.</p>}
            </div>
            <button type="submit" disabled={otpStage === 'sending'} className="btn-primary w-full text-lg">
              {otpStage === 'sending' ? <Spinner className="text-white" /> : <>View menu <ArrowRight size={20} /></>}
            </button>
            {otpRequired && <p className="text-xs text-center text-coffee-500">We'll send a one-time code to verify your number.</p>}
          </form>
        )}

        <div id="recaptcha-box" />
        <p className="mt-auto pt-8 text-center text-xs text-coffee-300">Your number is only used for your orders at this cafe.</p>
      </div>
    </div>
  );
}
