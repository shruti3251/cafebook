/**
 * Seeds one demo cafe: 8 tables, 5 categories, 23 menu items,
 * and creates the owner login.
 *
 * Usage (from the Cafebook folder):
 *   npm run seed -- --email you@example.com --password "YourStrongPass1"
 *
 * Requires scripts/serviceAccount.json (Firebase console > Project settings >
 * Service accounts > Generate new private key). NEVER share or commit that file.
 * Safe to re-run: existing tables (and their printed QR codes) are kept.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const admin = require('firebase-admin');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) args[a.slice(2)] = arr[i + 1];
});

const CAFE_ID = args.cafe || 'demo-cafe';
const EMAIL = args.email;
const PASSWORD = args.password;

if (!EMAIL || !PASSWORD) {
  console.error('Usage: npm run seed -- --email you@example.com --password "YourStrongPass1" [--cafe demo-cafe]');
  process.exit(1);
}
if (!/^[a-z0-9-]{2,40}$/.test(CAFE_ID)) {
  console.error('Cafe ID may only contain lowercase letters, numbers and dashes, e.g. "brew-nest".');
  process.exit(1);
}
if (PASSWORD.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-cafebook';
}

const keyPath = path.join(__dirname, 'serviceAccount.json');
if (process.env.FIRESTORE_EMULATOR_HOST) {
  // Local testing with `firebase emulators:start` - no key needed
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-cafebook' });
} else {
  if (!fs.existsSync(keyPath)) {
    console.error('Missing scripts/serviceAccount.json - see README step "Seed the database".');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
}
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();
const token = () => crypto.randomBytes(18).toString('base64url');

const categories = [
  { id: 'coffee', name: 'Coffee', emoji: '☕' },
  { id: 'tea', name: 'Tea', emoji: '🍵' },
  { id: 'shakes', name: 'Shakes', emoji: '🥤' },
  { id: 'snacks', name: 'Snacks', emoji: '🥪' },
  { id: 'desserts', name: 'Desserts', emoji: '🍰' },
];

// [category, name, description, price (₹), isVeg, isAvailable?]
const items = [
  ['coffee', 'Espresso', 'A bold, rich single shot of house-roasted beans.', 120, true],
  ['coffee', 'Cappuccino', 'Espresso with steamed milk and a thick velvety foam.', 160, true],
  ['coffee', 'Café Latte', 'Smooth espresso with lots of silky steamed milk.', 170, true],
  ['coffee', 'Classic Cold Coffee', 'Chilled, creamy and blended with ice.', 180, true],
  ['coffee', 'Hazelnut Frappé', 'Iced blended coffee with hazelnut and whipped cream.', 210, true],
  ['tea', 'Masala Chai', 'Kadak chai brewed with ginger, cardamom and spices.', 60, true],
  ['tea', 'Ginger Lemon Honey Tea', 'Soothing, zesty and lightly sweet.', 70, true],
  ['tea', 'Green Tea', 'Light and refreshing, served with lemon on the side.', 90, true],
  ['tea', 'Iced Peach Tea', 'Cold brewed tea with juicy peach and mint.', 140, true],
  ['shakes', 'Chocolate Shake', 'Thick shake with Belgian chocolate.', 180, true],
  ['shakes', 'Oreo Shake', 'Cookies and cream blended to perfection.', 190, true],
  ['shakes', 'Mango Shake', 'Made with real Alphonso mango pulp.', 170, true],
  ['shakes', 'Strawberry Shake', 'Creamy strawberry shake with fresh fruit.', 170, true],
  ['snacks', 'Veg Grilled Sandwich', 'Loaded with veggies, cheese and green chutney.', 140, true],
  ['snacks', 'Paneer Tikka Sandwich', 'Smoky paneer tikka with onions and mint mayo.', 170, true],
  ['snacks', 'Chicken Club Sandwich', 'Triple-decker with grilled chicken, egg and lettuce.', 210, false],
  ['snacks', 'Peri Peri Fries', 'Crispy fries tossed in spicy peri peri seasoning.', 130, true],
  ['snacks', 'Chicken Nuggets', '8 golden nuggets served with a dip.', 190, false],
  ['snacks', 'Cheese Garlic Bread', 'Toasted baguette with garlic butter and mozzarella.', 150, true],
  ['desserts', 'Chocolate Brownie', 'Warm fudgy brownie. Add ice cream for extra joy.', 120, true],
  ['desserts', 'Blueberry Cheesecake', 'Baked New York style cheesecake with blueberry.', 220, true, false],
  ['desserts', 'Gulab Jamun with Ice Cream', 'Two warm jamuns with a scoop of vanilla.', 130, true],
  ['desserts', 'Nutella Waffle', 'Crispy Belgian waffle drizzled with Nutella.', 190, true],
];

async function main() {
  const batch = db.batch();

  batch.set(db.collection('cafes').doc(CAFE_ID), {
    name: 'Cafebook Demo Café',
    logoUrl: '',
    address: '12, MG Road, Pune, Maharashtra 411001',
    phone: '',
    gstin: '27ABCDE1234F1Z5',
    gstRate: 5,
    upiId: 'yourcafe@upi',
    otpEnabled: false,
    createdAt: now,
  }, { merge: true });

  categories.forEach((c, i) => {
    batch.set(db.collection('categories').doc(`${CAFE_ID}-${c.id}`), {
      cafeId: CAFE_ID, name: c.name, emoji: c.emoji, sortOrder: i,
    });
  });

  const perCat = {};
  items.forEach(([cat, name, description, price, isVeg, isAvailable = true], i) => {
    perCat[cat] = (perCat[cat] || 0) + 1;
    batch.set(db.collection('menuItems').doc(`${CAFE_ID}-item-${String(i + 1).padStart(2, '0')}`), {
      cafeId: CAFE_ID,
      categoryId: `${CAFE_ID}-${cat}`,
      name, description, price, isVeg, isAvailable,
      imageUrl: '',
      sortOrder: perCat[cat] - 1,
    });
  });
  await batch.commit();

  for (let n = 1; n <= 8; n++) {
    const tableRef = db.collection('tables').doc(`${CAFE_ID}-table-${n}`);
    if ((await tableRef.get()).exists) continue;
    const sessionRef = db.collection('tableSessions').doc();
    const secretToken = token();
    const b = db.batch();
    b.set(sessionRef, { cafeId: CAFE_ID, tableId: tableRef.id, tableNumber: n, status: 'open', startedAt: now, closedAt: null });
    b.set(tableRef, { cafeId: CAFE_ID, tableNumber: n, secretToken, status: 'active', currentSessionId: sessionRef.id, createdAt: now });
    b.set(db.collection('tableAccess').doc(secretToken), {
      cafeId: CAFE_ID, tableId: tableRef.id, tableNumber: n, currentSessionId: sessionRef.id, active: true,
    });
    await b.commit();
  }

  let user;
  try {
    user = await admin.auth().getUserByEmail(EMAIL);
    await admin.auth().updateUser(user.uid, { password: PASSWORD });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await admin.auth().createUser({ email: EMAIL, password: PASSWORD, displayName: 'Owner' });
  }
  await db.collection('staff').doc(user.uid).set({
    cafeId: CAFE_ID, email: EMAIL, name: 'Owner', role: 'owner', createdAt: now,
  }, { merge: true });

  console.log('\nSeed complete');
  console.log(`  Cafe ID : ${CAFE_ID}`);
  console.log(`  Owner   : ${EMAIL}`);
  console.log('  Log in at /admin to see your tables and print QR codes.\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
