import { Link } from 'react-router-dom';
import { QrCode, ShoppingBag, LayoutDashboard } from 'lucide-react';

export default function Landing() {
  const steps = [
    { icon: QrCode, title: 'Scan', text: 'Scan the QR code on your table.' },
    { icon: ShoppingBag, title: 'Order', text: 'Browse the menu and order from your phone.' },
    { icon: LayoutDashboard, title: 'Relax', text: 'We bring it to your table. Pay when you leave.' },
  ];
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-cream to-coral-50 px-5 py-12">
      <div className="max-w-xl mx-auto text-center">
        <div className="inline-grid place-items-center h-16 w-16 rounded-3xl bg-coral-500 text-white text-3xl shadow-lift">☕</div>
        <h1 className="mt-5 text-4xl font-extrabold">Cafebook</h1>
        <p className="mt-3 text-coffee-500 text-lg">Table ordering made simple. Scan, order, enjoy.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card p-5">
              <s.icon className="mx-auto text-coral-500" size={30} />
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-coffee-500">{s.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-coffee-500">At a cafe? Scan the QR code on your table to start.</p>
        <Link to="/admin" className="btn-ghost mt-4">Cafe owner login</Link>
      </div>
    </div>
  );
}
