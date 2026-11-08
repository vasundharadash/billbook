# Bill Book (Project 7) – installable offline app (PWA)

Billing app for a small shop. Runs offline, installs on a phone, no account, no server.

## Features
- Shop profile (name, address, your UPI ID, default tax %) and an item list with prices
- Bills with quantity, discount (% or ₹) and tax
- UPI QR code for the exact total (made on the phone, no internet needed)
- Share a bill as an image (WhatsApp etc.) or save the image to the phone
- Bill history grouped by day, with a daily total
- Data is stored on the phone only

## Put it online once, so Chrome can install it (free, HTTPS)
Chrome only offers "Install app" for sites served over HTTPS. GitHub Pages is free and does this.

1. Make a free account at github.com and create a new **public** repository (e.g. `billbook`).
2. Upload **all the files in this folder** (not the folder itself): `index.html`, `app.js`, `core.js`,
   `qr.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.
   (Repository → Add file → Upload files. On a phone, use Chrome menu → "Desktop site".)
3. Repository → Settings → Pages → Source: "Deploy from a branch" → Branch `main` / `(root)` → Save.
4. After about a minute your app is at `https://<your-username>.github.io/billbook/`.

## Install on the phone
1. Open that link in **Chrome on the Android phone** and wait a few seconds on the first load
   (this lets the app save itself for offline use).
2. Chrome menu (⋮) → **Install app** (or "Add to Home screen"). You can also use the
   "Install app on this phone" button on the Shop tab when it appears.
3. Open **Bill Book** from the home screen. It now opens like a normal app, even in flight mode.

## How to test ("Done when")
1. Shop tab: enter your own UPI ID, save.
2. Make 5 bills (with quantity, discount and tax) and compare each total with your hand calculation.
3. Scan the QR with GPay/PhonePe. The right amount should show. **Do not pay.**
4. Turn on flight mode, close the app and open it again. Old bills must still be there.
5. Open a bill → "Share bill as image" → pick WhatsApp.

## Files
- `index.html`, `style.css` – page and look
- `app.js` – screens and storage
- `core.js` – totals, money format, UPI link
- `qr.js` – QR code generator (written from scratch, works offline)
- `sw.js` – service worker (offline cache)
- `manifest.webmanifest`, `icon-*.png` – install info and icon

## Notes
- If you change any file and re-upload, change `CACHE = 'billbook-v1'` in `sw.js` to `v2` so phones fetch the new version.
- Clearing Chrome's site data for the app deletes saved bills.
