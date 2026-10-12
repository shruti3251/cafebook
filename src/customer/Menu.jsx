import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquarePlus, Search, ShoppingBag, X } from 'lucide-react';
import { EmptyState, ItemImage, VegMark } from '../components/ui.jsx';
import { inr } from '../lib/format.js';
import { useCustomer } from './CustomerLayout.jsx';
import { CustomerHeader, Stepper } from './parts.jsx';

function ItemCard({ item, emoji, line, setQty, setNote }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const unavailable = item.isAvailable === false;
  return (
    <div className={`card p-3 flex gap-3 animate-fadeIn ${unavailable ? 'opacity-60' : ''}`}>
      <ItemImage src={item.imageUrl} alt={item.name} emoji={emoji} className={`h-24 w-24 shrink-0 rounded-2xl ${unavailable ? 'grayscale' : ''}`} />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <span className="mt-1"><VegMark isVeg={item.isVeg !== false} size={14} /></span>
          <h3 className="font-display font-semibold leading-snug">{item.name}</h3>
        </div>
        {item.description && <p className="mt-0.5 text-sm text-coffee-500 line-clamp-2">{item.description}</p>}
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="font-display font-bold text-lg">{inr(item.price)}</span>
          {unavailable ? (
            <span className="chip bg-gray-100 text-gray-600 py-1.5">Not available</span>
          ) : line ? (
            <Stepper qty={line.qty} onChange={(q) => setQty(item.id, q)} size="sm" />
          ) : (
            <button
              onClick={() => setQty(item.id, 1)}
              className="h-10 px-6 rounded-2xl border-2 border-coral-500 text-coral-600 font-display font-bold bg-coral-50 active:scale-95 transition hover:bg-coral-100"
            >
              ADD
            </button>
          )}
        </div>
        {line && !unavailable && (
          noteOpen ? (
            <input
              autoFocus
              className="input mt-2 !min-h-[42px] text-sm"
              placeholder='e.g. "less sugar"'
              maxLength={120}
              value={line.note}
              onChange={(e) => setNote(item.id, e.target.value)}
              onBlur={() => setNoteOpen(false)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <button onClick={() => setNoteOpen(true)} className="mt-1 self-start flex items-center gap-1 text-sm font-semibold text-mint-700 min-h-[36px]">
              <MessageSquarePlus size={16} /> {line.note ? <span className="italic truncate max-w-[180px]">“{line.note}”</span> : 'Add note'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function CartBar() {
  const { cartCount, cartTotals, base } = useCustomer();
  if (!cartCount) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-safe pt-2 pointer-events-none">
      <Link
        to={`${base}/cart`}
        className="pointer-events-auto max-w-2xl mx-auto flex items-center gap-3 rounded-3xl bg-coffee-700 text-white px-5 h-16 shadow-lift animate-slideUp"
      >
        <span key={cartCount} className="grid place-items-center h-9 w-9 rounded-full bg-coral-500 animate-bounceIn">
          <ShoppingBag size={18} />
        </span>
        <span className="font-display font-bold tabular">
          {cartCount} item{cartCount > 1 ? 's' : ''} · {inr(cartTotals.subtotal)}
          <span className="block text-xs font-sans font-semibold text-coffee-100">+ GST</span>
        </span>
        <span className="ml-auto flex items-center gap-1 font-display font-bold">View cart <ChevronRight size={20} /></span>
      </Link>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="card p-3 flex gap-3 animate-pulse">
          <div className="h-24 w-24 rounded-2xl bg-coffee-50" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 rounded bg-coffee-50" />
            <div className="h-3 w-full rounded bg-coffee-50" />
            <div className="h-5 w-16 rounded bg-coffee-50 mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Menu() {
  const { menu, cart, setQty, setNote } = useCustomer();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null);
  const tabRefs = useRef({});

  const sections = useMemo(() => {
    const known = new Set(menu.categories.map((c) => c.id));
    const list = menu.categories.map((c) => ({ ...c, items: menu.items.filter((i) => i.categoryId === c.id) }));
    const others = menu.items.filter((i) => !known.has(i.categoryId));
    if (others.length) list.push({ id: '_others', name: 'Others', emoji: '🍽️', items: others });
    return list
      .map((s) => ({ ...s, items: [...s.items].sort((a, b) => (a.isAvailable === false) - (b.isAvailable === false)) }))
      .filter((s) => s.items.length);
  }, [menu.categories, menu.items]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => (query
    ? menu.items.filter((i) => `${i.name} ${i.description || ''}`.toLowerCase().includes(query))
    : []), [query, menu.items]);

  // Highlight the tab of the section currently on screen
  useEffect(() => {
    if (query || !sections.length) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.dataset.cat);
      },
      { rootMargin: '-150px 0px -55% 0px' },
    );
    sections.forEach((s) => { const el = document.getElementById(`cat-${s.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections, query]);

  useEffect(() => {
    tabRefs.current[active]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const goTo = (id) => {
    setQ('');
    setActive(id);
    requestAnimationFrame(() => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const emojiFor = (item) => menu.categoriesById[item.categoryId]?.emoji || '🍽️';

  return (
    <div className="pb-32">
      <CustomerHeader />
      <div className="sticky top-16 z-20 bg-cream/95 backdrop-blur pt-3 pb-2 shadow-[0_6px_12px_-10px_rgba(78,46,26,0.25)]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
            <input
              className="input pl-12 pr-12 !min-h-[48px]"
              placeholder="Search coffee, sandwiches…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              enterKeyHint="search"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10" aria-label="Clear search">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        {!query && (
          <div className="max-w-2xl mx-auto mt-3 flex gap-2 overflow-x-auto no-scrollbar px-4">
            {sections.map((s) => (
              <button
                key={s.id}
                ref={(el) => { tabRefs.current[s.id] = el; }}
                onClick={() => goTo(s.id)}
                className={`shrink-0 h-10 px-4 rounded-full font-display font-semibold text-sm transition ${
                  active === s.id ? 'bg-coral-500 text-white shadow-soft' : 'bg-white text-coffee-700 border border-coffee-100'
                }`}
              >
                {s.emoji ? `${s.emoji} ` : ''}{s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-2xl mx-auto">
        {menu.loading ? (
          <MenuSkeleton />
        ) : menu.error ? (
          <EmptyState emoji="📶" title="Couldn't load the menu" text="Please check your internet connection." action={<button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>} />
        ) : query ? (
          <div className="px-4 pt-4 space-y-3">
            <p className="text-sm font-semibold text-coffee-500">{results.length} result{results.length === 1 ? '' : 's'} for “{q.trim()}”</p>
            {results.length === 0 ? (
              <EmptyState emoji="🔍" title="Nothing found" text="Try a different word, like “coffee” or “sandwich”." />
            ) : results.map((item) => (
              <ItemCard key={item.id} item={item} emoji={emojiFor(item)} line={cart[item.id]} setQty={setQty} setNote={setNote} />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <EmptyState emoji="📋" title="Menu coming soon" text="The cafe hasn't added any items yet. Please ask the staff." />
        ) : (
          sections.map((s) => (
            <section key={s.id} id={`cat-${s.id}`} data-cat={s.id} className="px-4 pt-6 scroll-mt-[150px]">
              <h2 className="text-xl font-bold mb-3">{s.emoji} {s.name}</h2>
              <div className="space-y-3">
                {s.items.map((item) => (
                  <ItemCard key={item.id} item={item} emoji={s.emoji || '🍽️'} line={cart[item.id]} setQty={setQty} setNote={setNote} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
      <CartBar />
    </div>
  );
}
