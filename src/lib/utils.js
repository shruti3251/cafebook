import QRCode from 'qrcode';

export function qrDataUrl(text, size = 512) {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#2B1A10', light: '#FFFFFF' },
  });
}

export function publicBaseUrl() {
  const env = (import.meta.env.VITE_PUBLIC_URL || '').trim().replace(/\/$/, '');
  return env || window.location.origin;
}

export function tableUrl(cafeId, tableNumber, token) {
  return `${publicBaseUrl()}/order/${encodeURIComponent(cafeId)}/table/${tableNumber}?t=${encodeURIComponent(token)}`;
}

export function upiLink({ upiId, payeeName, amount, note }) {
  const p = new URLSearchParams({
    pa: upiId,
    pn: payeeName || 'Cafe',
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: (note || '').slice(0, 60),
  });
  return `upi://pay?${p.toString().replace(/\+/g, '%20')}`;
}

/** Short pleasant two-tone chime using Web Audio (no sound file needed). */
let audioCtx;
export function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.35, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.55);
    });
  } catch {
    /* audio not supported */
  }
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  // BOM so Excel shows ₹ and Indian names correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
