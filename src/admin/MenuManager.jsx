import { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { EmptyState, ItemImage, Modal, Spinner, Toggle, VegMark, useToast } from '../components/ui.jsx';
import { useMenu } from '../lib/hooks.js';
import { errorMessage, inr } from '../lib/format.js';
import { deleteMenuImage, saveMenuImage } from './imageOps.js';
import { useAdmin } from './AdminLayout.jsx';

const EMOJIS = ['☕', '🍵', '🥤', '🧋', '🥪', '🍟', '🍕', '🍔', '🥗', '🍰', '🍩', '🍪', '🧁', '🍨', '🥞', '🍳', '🍜', '🍽️'];

async function reorder(db, list, index, dir, coll) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  const b = writeBatch(db);
  next.forEach((x, i) => { if (x.sortOrder !== i) b.update(doc(db, coll, x.id), { sortOrder: i }); });
  await b.commit();
}

function CategoryModal({ open, onClose, initial, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [emoji, setEmoji] = useState(initial?.emoji || '☕');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit category' : 'New category'}>
      <form
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ name: name.trim(), emoji }); setBusy(false); }}
        className="space-y-4"
      >
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee" maxLength={30} required autoFocus />
        </div>
        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button type="button" key={em} onClick={() => setEmoji(em)} className={`h-11 w-11 rounded-xl text-2xl ${emoji === em ? 'bg-coral-100 ring-2 ring-coral-400' : 'bg-white'}`}>{em}</button>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? <Spinner className="text-white" /> : 'Save'}</button>
      </form>
    </Modal>
  );
}

function ItemModal({ open, onClose, initial, categories, cafeId, fb, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    name: initial?.name || '',
    description: initial?.description || '',
    price: initial?.price ?? '',
    categoryId: initial?.categoryId || categories[0]?.id || '',
    isVeg: initial?.isVeg ?? true,
    isAvailable: initial?.isAvailable ?? true,
    imageUrl: initial?.imageUrl || '',
  }));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initial?.imageUrl || '');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const pick = (e) => {
    const fl = e.target.files?.[0];
    if (!fl) return;
    if (!fl.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return; }
    setFile(fl);
    setPreview(URL.createObjectURL(fl));
  };

  async function save(e) {
    e.preventDefault();
    const price = Number(f.price);
    if (!f.name.trim() || !(price >= 0) || !f.categoryId) { toast('Name, price and category are required.', 'error'); return; }
    setBusy(true);
    try {
      let imageUrl = preview ? f.imageUrl : '';
      if (file) imageUrl = await saveMenuImage(fb.db, cafeId, file);
      const data = {
        name: f.name.trim(),
        description: f.description.trim(),
        price: Math.round(price * 100) / 100,
        categoryId: f.categoryId,
        isVeg: f.isVeg,
        isAvailable: f.isAvailable,
        imageUrl,
        cafeId,
      };
      if (initial) await updateDoc(doc(fb.db, 'menuItems', initial.id), data);
      else await addDoc(collection(fb.db, 'menuItems'), { ...data, sortOrder: Date.now() });
      // Clean up the old photo if it was replaced or removed
      if (initial?.imageUrl && initial.imageUrl !== imageUrl) await deleteMenuImage(fb.db, initial.imageUrl);
      toast(initial ? 'Item updated' : 'Item added', 'success');
      onSaved();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit item' : 'New item'} wide>
      <form onSubmit={save} className="grid sm:grid-cols-[180px_1fr] gap-5">
        <div>
          <label className="block cursor-pointer">
            <ItemImage src={preview} alt="" emoji="📷" className="h-44 w-full sm:w-44 rounded-3xl" />
            <span className="btn-ghost btn-sm w-full mt-2"><ImagePlus size={16} /> {preview ? 'Change photo' : 'Add photo'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={pick} />
          </label>
          {preview && <button type="button" onClick={() => { setPreview(''); setFile(null); }} className="w-full mt-1 text-sm font-semibold text-coral-600 min-h-[36px]">Remove photo</button>}
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={f.name} onChange={set('name')} maxLength={60} required />
          </div>
          <div>
            <label className="label">Short description</label>
            <textarea className="input py-3 min-h-[80px]" value={f.description} onChange={set('description')} maxLength={140} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price (₹)</label>
              <input className="input" type="number" inputMode="decimal" min="0" step="1" value={f.price} onChange={set('price')} required />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={f.categoryId} onChange={set('categoryId')} required>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => set('isVeg')(true)} className={`btn-sm btn ${f.isVeg ? 'bg-green-50 ring-2 ring-green-600 text-green-800' : 'bg-white border border-coffee-100'}`}><VegMark isVeg /> Veg</button>
            <button type="button" onClick={() => set('isVeg')(false)} className={`btn-sm btn ${!f.isVeg ? 'bg-red-50 ring-2 ring-red-700 text-red-800' : 'bg-white border border-coffee-100'}`}><VegMark isVeg={false} /> Non-veg</button>
            <label className="flex items-center gap-2 font-semibold ml-auto">Available <Toggle checked={f.isAvailable} onChange={set('isAvailable')} label="Available" /></label>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <><Spinner className="text-white" /> Saving…</> : 'Save item'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MenuManager() {
  const { fb, cafeId } = useAdmin();
  const toast = useToast();
  const { categories, items, loading } = useMenu(fb.db, cafeId);
  const [catModal, setCatModal] = useState(null); // {initial?}
  const [itemModal, setItemModal] = useState(null);
  const [q, setQ] = useState('');

  const byCat = useMemo(() => {
    const m = {};
    items.forEach((i) => { (m[i.categoryId] = m[i.categoryId] || []).push(i); });
    return m;
  }, [items]);

  const run = async (fn, ok) => {
    try { await fn(); if (ok) toast(ok, 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const saveCategory = async ({ name, emoji }) => {
    const initial = catModal?.initial;
    await run(async () => {
      if (initial) await updateDoc(doc(fb.db, 'categories', initial.id), { name, emoji });
      else await addDoc(collection(fb.db, 'categories'), { cafeId, name, emoji, sortOrder: categories.length });
    }, initial ? 'Category updated' : 'Category added');
    setCatModal(null);
  };

  const deleteCategory = (c) => {
    if (byCat[c.id]?.length) { toast('Move or delete the items in this category first.', 'error'); return; }
    if (window.confirm(`Delete category "${c.name}"?`)) run(() => deleteDoc(doc(fb.db, 'categories', c.id)), 'Category deleted');
  };

  const deleteItem = (i) => {
    if (window.confirm(`Delete "${i.name}"? Past bills keep their copy.`)) run(async () => {
      await deleteDoc(doc(fb.db, 'menuItems', i.id));
      await deleteMenuImage(fb.db, i.imageUrl);
    }, 'Item deleted');
  };

  const query = q.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">Menu</h1>
          <p className="text-coffee-500">{items.length} items · {items.filter((i) => i.isAvailable === false).length} unavailable</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal({})} className="btn-ghost"><Plus size={18} /> Category</button>
          <button onClick={() => (categories.length ? setItemModal({}) : toast('Add a category first.', 'error'))} className="btn-primary"><Plus size={18} /> Item</button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee-300" size={20} />
        <input className="input pl-12" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Spinner size={36} /></div>
      ) : categories.length === 0 ? (
        <EmptyState emoji="📋" title="Your menu is empty" text="Start by adding a category like Coffee or Snacks." action={<button className="btn-primary" onClick={() => setCatModal({})}><Plus size={18} /> Add category</button>} />
      ) : (
        categories.map((c, ci) => {
          const list = (byCat[c.id] || []).filter((i) => !query || i.name.toLowerCase().includes(query));
          if (query && !list.length) return null;
          return (
            <section key={c.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-cream-100">
                <h2 className="font-display text-lg font-bold flex-1">{c.emoji} {c.name} <span className="text-coffee-300 text-sm">({byCat[c.id]?.length || 0})</span></h2>
                <button disabled={ci === 0} onClick={() => run(() => reorder(fb.db, categories, ci, -1, 'categories'))} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-white disabled:opacity-30" aria-label="Move category up"><ChevronUp size={18} /></button>
                <button disabled={ci === categories.length - 1} onClick={() => run(() => reorder(fb.db, categories, ci, 1, 'categories'))} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-white disabled:opacity-30" aria-label="Move category down"><ChevronDown size={18} /></button>
                <button onClick={() => setCatModal({ initial: c })} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-white" aria-label="Edit category"><Pencil size={16} /></button>
                <button onClick={() => deleteCategory(c)} className="grid place-items-center h-9 w-9 rounded-lg hover:bg-white text-coral-600" aria-label="Delete category"><Trash2 size={16} /></button>
              </div>
              {list.length === 0 ? (
                <p className="px-5 py-4 text-coffee-500 text-sm">No items yet.</p>
              ) : (
                <ul className="divide-y divide-coffee-50">
                  {list.map((i) => {
                    const full = byCat[c.id];
                    const idx = full.indexOf(i);
                    return (
                      <li key={i.id} className={`flex items-center gap-3 px-4 py-3 ${i.isAvailable === false ? 'bg-gray-50' : ''}`}>
                        <ItemImage src={i.imageUrl} alt="" emoji={c.emoji} className={`h-14 w-14 rounded-2xl shrink-0 ${i.isAvailable === false ? 'grayscale opacity-60' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><VegMark isVeg={i.isVeg !== false} size={13} /><span className="font-semibold truncate">{i.name}</span></div>
                          <div className="text-sm font-bold text-coffee-700">{inr(i.price)}</div>
                        </div>
                        <div className="flex flex-col items-center">
                          <Toggle
                            checked={i.isAvailable !== false}
                            onChange={(v) => run(() => updateDoc(doc(fb.db, 'menuItems', i.id), { isAvailable: v }), v ? `${i.name} is available` : `${i.name} marked unavailable`)}
                            label={`${i.name} available`}
                          />
                          <span className="text-[11px] font-bold text-coffee-500 mt-0.5">{i.isAvailable === false ? 'Off' : 'On'}</span>
                        </div>
                        {!query && (
                          <div className="hidden sm:flex flex-col">
                            <button disabled={idx === 0} onClick={() => run(() => reorder(fb.db, full, idx, -1, 'menuItems'))} className="h-7 w-8 grid place-items-center disabled:opacity-30" aria-label="Move up"><ChevronUp size={16} /></button>
                            <button disabled={idx === full.length - 1} onClick={() => run(() => reorder(fb.db, full, idx, 1, 'menuItems'))} className="h-7 w-8 grid place-items-center disabled:opacity-30" aria-label="Move down"><ChevronDown size={16} /></button>
                          </div>
                        )}
                        <button onClick={() => setItemModal({ initial: i })} className="grid place-items-center h-10 w-10 rounded-xl hover:bg-coffee-50" aria-label="Edit"><Pencil size={17} /></button>
                        <button onClick={() => deleteItem(i)} className="grid place-items-center h-10 w-10 rounded-xl hover:bg-coral-50 text-coral-600" aria-label="Delete"><Trash2 size={17} /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}

      {catModal && <CategoryModal open onClose={() => setCatModal(null)} initial={catModal.initial} onSave={saveCategory} />}
      {itemModal && (
        <ItemModal
          open
          onClose={() => setItemModal(null)}
          initial={itemModal.initial}
          categories={categories}
          cafeId={cafeId}
          fb={fb}
          onSaved={() => setItemModal(null)}
        />
      )}
    </div>
  );
}
