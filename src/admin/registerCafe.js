import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { createTable } from './tableOps.js';

/** "Brew & Bean Café!" -> "brew-bean-cafe" */
export function slugify(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'cafe';
}

/** Finds a free cafe ID: "brew-bean", or "brew-bean-x7k2" if taken. */
export async function freeCafeId(db, name) {
  const base = slugify(name);
  const candidates = [base, ...Array.from({ length: 4 }, () => `${base}-${Math.random().toString(36).slice(2, 6)}`)];
  for (const id of candidates) {
    if (id.length < 3) continue;
    const snap = await getDoc(doc(db, 'cafes', id));
    if (!snap.exists()) return id;
  }
  throw new Error('Could not pick a cafe ID. Please try a slightly different cafe name.');
}

const SAMPLE_CATEGORIES = [
  { key: 'coffee', name: 'Coffee', emoji: '☕' },
  { key: 'tea', name: 'Tea', emoji: '🍵' },
  { key: 'shakes', name: 'Shakes', emoji: '🥤' },
  { key: 'snacks', name: 'Snacks', emoji: '🥪' },
  { key: 'desserts', name: 'Desserts', emoji: '🍰' },
];

// [category, name, description, price ₹, isVeg]
const SAMPLE_ITEMS = [
  ['coffee', 'Espresso', 'A bold, rich single shot.', 120, true],
  ['coffee', 'Cappuccino', 'Espresso with steamed milk and velvety foam.', 160, true],
  ['coffee', 'Café Latte', 'Smooth espresso with silky steamed milk.', 170, true],
  ['coffee', 'Classic Cold Coffee', 'Chilled, creamy and blended with ice.', 180, true],
  ['tea', 'Masala Chai', 'Kadak chai with ginger and cardamom.', 60, true],
  ['tea', 'Ginger Lemon Honey Tea', 'Soothing, zesty and lightly sweet.', 70, true],
  ['tea', 'Iced Peach Tea', 'Cold brewed tea with peach and mint.', 140, true],
  ['shakes', 'Chocolate Shake', 'Thick shake with rich chocolate.', 180, true],
  ['shakes', 'Oreo Shake', 'Cookies and cream blended to perfection.', 190, true],
  ['shakes', 'Mango Shake', 'Made with Alphonso mango pulp.', 170, true],
  ['snacks', 'Veg Grilled Sandwich', 'Veggies, cheese and green chutney.', 140, true],
  ['snacks', 'Paneer Tikka Sandwich', 'Smoky paneer tikka with mint mayo.', 170, true],
  ['snacks', 'Chicken Club Sandwich', 'Grilled chicken, egg and lettuce.', 210, false],
  ['snacks', 'Peri Peri Fries', 'Crispy fries with peri peri seasoning.', 130, true],
  ['desserts', 'Chocolate Brownie', 'Warm, fudgy and gooey.', 120, true],
  ['desserts', 'Nutella Waffle', 'Crispy waffle drizzled with Nutella.', 190, true],
];

async function addSampleMenu(db, cafeId) {
  const b = writeBatch(db);
  const catIds = {};
  SAMPLE_CATEGORIES.forEach((c, i) => {
    const ref = doc(collection(db, 'categories'));
    catIds[c.key] = ref.id;
    b.set(ref, { cafeId, name: c.name, emoji: c.emoji, sortOrder: i });
  });
  const perCat = {};
  SAMPLE_ITEMS.forEach(([cat, name, description, price, isVeg]) => {
    perCat[cat] = (perCat[cat] || 0) + 1;
    b.set(doc(collection(db, 'menuItems')), {
      cafeId, categoryId: catIds[cat], name, description, price, isVeg, isAvailable: true, imageUrl: '', sortOrder: perCat[cat] - 1,
    });
  });
  await b.commit();
}

/**
 * Creates the cafe + the owner's staff record (one batch, checked by the
 * security rules), then the tables and, optionally, a sample menu.
 * `user` must already be signed in.
 */
export async function registerCafe(db, user, { ownerName, cafeName, address, phone, tableCount, sampleMenu }, onProgress = () => {}) {
  onProgress('Creating your cafe…');
  const cafeId = await freeCafeId(db, cafeName);
  const b = writeBatch(db);
  b.set(doc(db, 'cafes', cafeId), {
    name: cafeName.trim(),
    logoUrl: '',
    address: address.trim(),
    phone: phone.trim(),
    gstin: '',
    gstRate: 5,
    upiId: '',
    otpEnabled: false,
    ownerUid: user.uid,
    createdAt: serverTimestamp(),
  });
  b.set(doc(db, 'staff', user.uid), {
    cafeId,
    email: user.email,
    name: ownerName.trim(),
    role: 'owner',
    createdAt: serverTimestamp(),
  });
  await b.commit();

  const count = Math.max(0, Math.min(50, Math.floor(Number(tableCount) || 0)));
  for (let n = 1; n <= count; n++) {
    onProgress(`Setting up table ${n} of ${count}…`);
    await createTable(db, cafeId, n);
  }
  if (sampleMenu) {
    onProgress('Adding a sample menu…');
    await addSampleMenu(db, cafeId);
  }
  return cafeId;
}
