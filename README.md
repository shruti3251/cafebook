# ☕ Cafebook — QR table ordering for your cafe

Customers scan the QR code on their table, enter their name and phone number, and order from their phone.
You see every order live on the dashboard, grouped by table and by customer, so you can tell each person their own total and collect payment.

- **Customer app:** mobile-first menu, cart, live order status, "My Orders", and a running bill
- **Owner dashboard:** live tables, per-customer bills, UPI QR, receipts, menu editor, reports, CSV export, and printable QR cards
- **Built with:** React + Vite + Tailwind CSS, and Firebase on the **free Spark plan** (Firestore + Auth). No card needed.
- **Hosting:** Netlify (free) or Firebase Hosting (free)

---

## Contents
- [👀 Quick preview on your computer](#-quick-preview-on-your-computer-no-firebase-account-needed)
- [How it works](#how-it-works)
- [Part 1 — Create your free Firebase project](#part-1--create-your-free-firebase-project)
- [Part 2 — Set up the code](#part-2--set-up-the-code)
- [Part 3 — Upload the security rules](#part-3--upload-the-security-rules)
- [Part 4 — Add your cafe, menu and owner login](#part-4--add-your-cafe-menu-and-owner-login)
- [Part 5 — Put the website online with Netlify](#part-5--put-the-website-online-with-netlify)
- [Part 6 — Print your table QR codes](#part-6--print-your-table-qr-codes)
- [Later — Connect your own domain](#later--connect-your-own-domain-eg-cafebookin)
- [Day-to-day use](#day-to-day-use)
- [Free plan limits](#free-plan-limits)
- [Security: what's protected](#security-whats-protected)
- [Project structure & data model](#project-structure--data-model)
- [Troubleshooting](#troubleshooting)

---

## 👀 Quick preview on your computer (no Firebase account needed)

This runs a pretend Firebase on your own computer with demo data. You need **Node.js 20+** (https://nodejs.org, the "LTS" version) and **Java** (for the pretend database: https://adoptium.net).

In a terminal in the Cafebook folder, run once:
```bash
npm install
cd scripts
npm install
cd ..
```

Then open **two terminals** in the Cafebook folder:

| Terminal 1 (leave it running) | Terminal 2 |
|---|---|
| `npm run emulators` | wait for "All emulators ready", then `npm run seed:local`, then `npm run dev:local` |

- Dashboard: **http://localhost:5173/admin** (login `owner@test.com` / `testpass123`). If port 5173 is busy, the terminal shows the actual address.
- Customer view: Dashboard → **Settings → Tables & QR codes → QR** → scan it with your phone, or click **Link**.
- On your phone (same Wi-Fi), open the **Network** address that `npm run dev:local` prints. If Windows Firewall asks about Node or Java, click **Allow**.
- Demo data is wiped when you stop the emulators. Run `npm run seed:local` again after restarting them.

---

## How it works

```
Customer phone ──scan QR──► your-site/order/{cafeId}/table/5?t={secret code}
     │
     │ name + phone → menu → cart → "Place order"
     ▼
 One Firestore transaction: re-reads the table code, GST rate, item prices and availability,
 takes the next order number, and saves the order. The security rules double-check it.
     │ (real-time)
     ▼
 Owner dashboard: 🔔 chime + glowing table card → status → payment → close table
```

- Every table always has an **open bill** (a "session"). **Close table** ends it and starts a fresh one for the next group.
- Each order saves its own copy of item names and prices, so later menu price changes never alter old bills.
- Every record has a `cafeId`, so more cafes can be added later without changing the structure.

---

## Part 1 — Create your free Firebase project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project** → name it e.g. `cafebook` → you can turn off Google Analytics → **Create**.
   It stays on the free **Spark** plan. If Firebase ever suggests upgrading, you can skip it.
3. **Add a web app:** on the project home page, click the **`</>`** (Web) icon → nickname `cafebook-web` → **Register app**.
   Firebase shows a block called `firebaseConfig`. Keep this tab open — you need these values in Part 2.
4. **Turn on logins:** left menu **Build → Authentication → Get started → Sign-in method**, then enable:
   - **Email/Password** (for you and your staff)
   - **Anonymous** (customers are signed in silently, so each person can see only their own orders)
5. **Create the database:** **Build → Firestore Database → Create database** → location **`asia-south1 (Mumbai)`** → **Start in production mode** → **Create**.
   ⚠️ The location can't be changed later. Mumbai is fastest for customers in India.

> You do **not** need Storage, Functions or the Blaze plan. Photos are stored in the database, and orders are checked by the security rules.

---

## Part 2 — Set up the code

In a terminal **in the Cafebook folder**:

```bash
npm install
cd scripts
npm install
cd ..
```

Then add your Firebase keys:
1. Make a copy of **`.env.example`** and name it **`.env`**.
2. Open `.env` and paste the values from the `firebaseConfig` block (Part 1, step 3):

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=cafebook-xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=cafebook-xxxx
VITE_FIREBASE_STORAGE_BUCKET=cafebook-xxxx.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
VITE_PUBLIC_URL=
```

Leave `VITE_PUBLIC_URL=` empty for now.

> These web keys are **not secret** — every Firebase website contains them. Your data is protected by the security rules.

---

## Part 3 — Upload the security rules

The rules decide who can read and write what. **Without them, nobody can place orders.**

```bash
npx firebase login
npx firebase use --add
npx firebase deploy --only firestore
```

- `login` opens your browser. Sign in with the same Google account.
- `use --add`: pick your project with the arrow keys, then type `default` as the alias.
- `deploy` uploads `firestore.rules` and `firestore.indexes.json`. The indexes take **5–10 minutes** to build. Until then, "My Orders" and Reports may show an error. Just wait.

---

## Part 4 — Add your cafe, menu and owner login

This adds **1 cafe, 8 tables, 5 categories and 23 menu items** (Indian cafe prices), and creates **your owner login**. You can change all of it later in the dashboard.

1. Firebase console → ⚙️ **Project settings** → **Service accounts** tab → **Generate new private key** → **Generate key**.
2. Rename the downloaded file to **`serviceAccount.json`** and put it inside the **`scripts`** folder.
   ⚠️ This file is a master key to your project. Never share it, email it, or upload it anywhere.
3. Run (use your real email and a strong password of 8+ characters):

```bash
npm run seed -- --email you@example.com --password "ChooseAStrongPass1"
```

**Optional — your own cafe ID in the QR links** (for example `.../order/brew-nest/table/1`): add `--cafe brew-nest` at the end. Use lowercase letters, numbers and dashes only, and decide **before** printing QR codes.

4. When you see **"Seed complete"**, **delete `scripts/serviceAccount.json`**. (You can generate a new key any time.)

Check it on your computer:
```bash
npm run dev
```
Open **http://localhost:5173/admin** and log in with the email and password from step 3.

---

## Part 5 — Put the website online with Netlify

Netlify hosts the website for free at an address like `cafebook-demo.netlify.app`.

1. Build the website:
   ```bash
   npm run build
   ```
   This creates a **`dist`** folder.
2. Go to **https://app.netlify.com/drop**, sign up (free), and **drag the `dist` folder** onto the page. In about 20 seconds you'll get a link like `https://random-name-123.netlify.app`.
3. Give it a nicer name: **Site configuration → Change site name** → e.g. `cafebook-demo`. Your address becomes **`https://cafebook-demo.netlify.app`**.
4. **Important — allow logins on that address:** Firebase console → **Authentication → Settings → Authorized domains → Add domain** → `cafebook-demo.netlify.app`.
5. Open **`https://cafebook-demo.netlify.app/admin`** and log in. 🎉

**To update the site later** (after code or `.env` changes): run `npm run build` again, then Netlify → your site → **Deploys** → drag the new `dist` folder onto the "Drag and drop" box.

> **Alternative — Firebase Hosting (also free):** `npm run deploy` builds and publishes to `https://YOUR-PROJECT.web.app`. That address is already allowed for logins.

---

## Part 6 — Print your table QR codes

Dashboard → **Settings → Tables & QR codes**:

- **Print all QR codes** creates A4 pages with 6 cards each (logo, cafe name, **Table X**, QR code, "Scan to view menu & order"). In the print dialog, turn on **Background graphics**.
- **QR** next to a table: preview, print one card, download a PNG, or copy the link.
- **🔄 New QR code:** if someone misuses a photo of a table's code, generate a new one. The old printed code stops working immediately, so reprint that card.
- **Add / delete tables** here as well.

> Upload your logo first (Settings → Cafe profile → Logo) so it appears on the cards.
> Always print from the **live** site, so the codes contain the live address, not `localhost`.

---

## Later — Connect your own domain (e.g. cafebook.in)

1. Buy the domain from any registrar (GoDaddy, Hostinger, Namecheap…).
2. Netlify → your site → **Domain management → Add a domain** → type `cafebook.in` and follow the DNS records Netlify shows. Add them in your registrar's **DNS settings**, and delete any old "parked" A records for `@`.
   It can take from a few minutes to 24 hours. Netlify adds the free SSL padlock automatically.
3. Firebase console → **Authentication → Settings → Authorized domains** → add `cafebook.in`.
4. In `.env`, set `VITE_PUBLIC_URL=https://cafebook.in`, run `npm run build`, and drag the new `dist` folder to Netlify.
5. **Reprint all QR codes.** The old ones point to the netlify.app address. (That address keeps working too, so nothing breaks in between.)

---

## Day-to-day use

**When customers order:** the dashboard chimes 🔔, the table card glows orange ("Has new order"), and a pop-up appears. If the tab is in the background, you also get a desktop notification (allow notifications when the browser asks). Tap the dashboard once after opening it, because browsers only allow sounds after you interact with the page.

**Table cards**

| Card | Meaning |
|---|---|
| **Has new order** (orange) | An order is still in *Received*, so the kitchen hasn't started it |
| **Occupied** | Orders are being prepared or served, and payment is due |
| **Paid · ready to close** (green) | Everyone has paid. A **Close table** button appears on the card |
| **Free** | Empty table, fresh bill |
| **⚠️ Check prices** | An order's prices don't match your menu (see below) |

**At the table** (tap a card):
- Orders are grouped by customer, showing their name and full phone number. **Tap the number to call them.** Their **To pay** amount is shown in large text.
- Change each order's status: **Received → Preparing → Served**. The customer's phone updates instantly. Use ✕ to cancel a mistaken order.
- **Mark paid** → Cash / UPI / Card. **UPI QR** shows a QR for the exact amount (set your UPI ID in Settings first).
- **Print** gives a GST receipt (works on A4 and 80 mm thermal printers). **Share** sends the bill via WhatsApp or the share menu.
- **Close table** unlocks once everyone has paid. Orders stay saved in Reports.

**⚠️ Price warnings:** on the free plan, orders are put together on the customer's phone. A tech-savvy person could edit the request to send fake prices. The dashboard compares every order with your menu and shows **⚠️ Check this order before billing** if anything doesn't match. If you didn't just change that item's price, cancel the order and re-enter it.

**Menu:** flip **On/Off** when something runs out. Customers see it greyed out immediately, and anyone with it in their cart is warned. Use ✏️ to edit items and photos (photos are compressed automatically), and ⬆⬇ to reorder.

**Reports:** pick a date or range to see sales, number of orders, best sellers, and the payment method breakdown. Search by name, phone or order number. **Export CSV** opens in Excel.

**Staff** (owner only): Settings → **Staff logins → Add staff**. Staff handle orders, tables and the menu; only owners change settings and staff. Removing someone blocks their dashboard access immediately.

**OTP phone verification** (Settings): Firebase only sends SMS on the paid Blaze plan, so **keep this OFF on the free plan**. Customers then see orders placed from their own phone.

---

## Free plan limits

The Spark plan is free forever, with daily limits that reset at midnight US Pacific time (around 12:30–1:30 pm IST):

| Limit per day | What uses it | Roughly enough for |
|---|---|---|
| 50,000 database reads | A customer opening the menu ≈ 40–70 reads (more with photos); the dashboard's live view | ~400–600 customer visits a day |
| 20,000 database writes | ~3 per order, plus status and payment updates | thousands of orders |
| 1 GB stored | Orders and photos (~30 KB each) | years of orders |

If you ever hit a limit, the app stops working until the daily reset, and Firebase emails you. A busy cafe can upgrade to Blaze at any time. It keeps the same free allowance and only charges above it, and no code changes are needed.

---

## Security: what's protected

Checked by the **security rules** on every order:
- the secret table code must be valid and match the table number and its current bill; codes for deleted tables and old QR codes stop working
- new orders must start as *Received / Unpaid*, use your cafe's GST rate, and the GST and total maths must add up
- the phone number must be a valid 10-digit Indian mobile number
- order numbers can only go up by one, and each order ID can be used once, so double taps and retries never create duplicate orders
- customers can read **only their own orders**, and can't change orders, the menu, tables or settings
- only logged-in staff can see all orders; staff can change status and payment but never items or amounts; only owners change settings and staff

**What the free plan can't check:** each item's price. The rules can't loop through the list of items, and that would need paid Cloud Functions. The app always sends the correct menu prices, and the dashboard flags any order that doesn't match (see *Price warnings* above).

---

## Project structure & data model

```
Cafebook/
├── src/
│   ├── App.jsx                Routes (customer pages + dashboard, loaded separately)
│   ├── lib/                   Firebase setup, ordering (orders.js), formatting, QR/UPI/CSV/print helpers
│   ├── components/ui.jsx      Buttons, modals, toasts, veg mark, lazy images, loaders…
│   ├── customer/              Welcome, Menu, Cart, OrderSuccess (live tracker), MyOrders
│   ├── admin/                 Dashboard: tables, table detail, menu, reports, settings, printing
│   └── pages/                 Landing + 404
├── scripts/seed.js            Adds the demo cafe, menu, tables and owner login
├── firestore.rules            Security rules (the "backend")
├── firestore.indexes.json     Database indexes
├── firebase.json              Firebase Hosting + local emulator settings
├── netlify.toml, public/_redirects   Netlify settings
└── .env.example               Template for your Firebase keys
```

| Collection | Fields |
|---|---|
| `cafes` | name, logoUrl, address, phone, gstin, gstRate, upiId, otpEnabled |
| `staff/{uid}` | cafeId, email, name, role (`owner` / `staff`) |
| `tables` | cafeId, tableNumber, secretToken, status, currentSessionId |
| `tableAccess/{secretToken}` | cafeId, tableId, tableNumber, currentSessionId, active — what a QR code looks up |
| `tableSessions` | cafeId, tableId, tableNumber, startedAt, closedAt, status (`open` / `closed`) |
| `categories` | cafeId, name, emoji, sortOrder |
| `menuItems` | cafeId, categoryId, name, description, price, imageUrl, isVeg, isAvailable, sortOrder |
| `menuImages` | cafeId, data (compressed photo) — `imageUrl` is `fs:<id>` or a normal https link |
| `customers` | cafeId, phone, name, firstVisit, lastVisit, lastTableNumber, orderCount (updated by the dashboard) |
| `orders` | cafeId, tableId, tableNumber, sessionId, sessionStatus, customerUid, customerName, customerPhone, items [{itemId, name, price, qty, note, isVeg}], subtotal, gstRate, tax, total, status, paymentStatus, paymentMethod, paidAt, orderNumber, orderDay, createdAt |
| `counters` | daily order-number counter per cafe (resets at midnight IST) |

**Adding a second cafe later:** `npm run seed -- --cafe another-cafe --email owner2@example.com --password "..."`. Each owner only sees their own cafe.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Almost there! Firebase isn't configured"** | `.env` is missing or incomplete. Fill it in, then restart `npm run dev`, or rebuild and re-upload to Netlify. |
| Login fails on the Netlify site but works locally | Add your `xxx.netlify.app` address to Firebase **Authentication → Settings → Authorized domains**. |
| **"No dashboard access"** after login | That email isn't registered as staff. Run the seed with that email, or have the owner add it in Settings → Staff. |
| Customers can't place orders ("Could not place the order") | Run `npx firebase deploy --only firestore` (Part 3). Make sure the QR code came from the live site. |
| **"This table isn't available"** | The table was deleted or its QR code replaced. Print a fresh card from Settings. |
| **My Orders / Reports show an error** right after setup | The indexes are still building. Wait 5–10 minutes (Firestore → Indexes). |
| Opening a link like `/admin` on Netlify shows "Page not found" | Upload the whole `dist` folder, including the `_redirects` file inside it. |
| No chime on new orders | Tap the dashboard once, check that Sound is **on**, and make sure the device isn't muted. |
| QR codes point to the wrong address | Print from the live site, or set `VITE_PUBLIC_URL`, rebuild, upload and reprint. |

---

Made with ☕ for cafes. Enjoy!
