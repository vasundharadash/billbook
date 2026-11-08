'use strict';
/* Bill Book – UI and storage. All data stays in this browser on this phone. */

// ───────────── storage ─────────────
const KEY = 'billbook.v1';
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function freshDb() {
  return {
    shop: { name: 'My Shop', address: '', upi: '', tax: 0 },
    items: [
      { id: uid(), name: 'Rice 1 kg', price: 60 },
      { id: uid(), name: 'Oil 1 L', price: 165 },
      { id: uid(), name: 'Sugar 1 kg', price: 45 }
    ],
    bills: [], // newest first
    next: 101
  };
}
function loadDb() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.shop && Array.isArray(s.items) && Array.isArray(s.bills)) return s;
  } catch (e) { /* fall through */ }
  return freshDb();
}
let db = loadDb();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { alert('Could not save: browser storage is full or blocked.'); }
}

// ───────────── tiny DOM helpers ─────────────
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

function numClean(v) {
  v = v.replace(/[^\d.]/g, '');
  const i = v.indexOf('.');
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return v.slice(0, 10);
}
function numInput(value, onInput, placeholder) {
  const el = h('input', { type: 'text', inputmode: 'decimal', placeholder: placeholder || '', value: value || '' });
  el.addEventListener('input', () => {
    const c = numClean(el.value);
    if (c !== el.value) el.value = c;
    if (onInput) onInput(c);
  });
  return el;
}
function field(label, el) { return h('label', { class: 'field' }, h('span', {}, label), el); }

function dialog(title, fields, onSave) {
  const inputs = fields.map((f) => (f.num ? numInput(f.value) : h('input', { type: 'text', value: f.value })));
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'dlg' },
      h('h3', {}, title),
      fields.map((f, i) => field(f.label, inputs[i])),
      h('div', { class: 'row end' },
        h('button', { class: 'btn text', onclick: () => ov.remove() }, 'Cancel'),
        h('button', { class: 'btn inline', onclick: () => { if (onSave(inputs.map((i) => i.value)) !== false) ov.remove(); } }, 'Save'))));
  document.body.append(ov);
  inputs[0].focus();
}

// ───────────── navigation ─────────────
let tab = 0;
let screen = { name: 'tabs' };

function nav(s) { history.pushState({ s: s.name }, ''); screen = s; render(); }
window.addEventListener('popstate', () => { screen = { name: 'tabs' }; render(); });

function render() {
  const v = $('view');
  v.innerHTML = '';
  const back = $('back'), tabs = $('tabs'), title = $('title');
  if (screen.name === 'new') {
    tabs.hidden = true; back.hidden = false; title.textContent = 'New bill #' + db.next;
    v.append(newBillView());
  } else if (screen.name === 'detail') {
    const b = db.bills.find((x) => x.no === screen.no);
    if (!b) { screen = { name: 'tabs' }; history.replaceState({ s: 'tabs' }, ''); render(); return; }
    tabs.hidden = true; back.hidden = false; title.textContent = 'Bill #' + b.no;
    v.append(detailView(b));
  } else {
    tabs.hidden = false; back.hidden = true; title.textContent = db.shop.name || 'Bill Book';
    v.append([homeView, itemsView, shopView][tab]());
    renderTabs();
  }
  v.scrollTop = 0;
}
function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  [['🧾', 'Bills'], ['🛒', 'Items'], ['🏪', 'Shop']].forEach(([ic, label], i) => {
    tabs.append(h('button', { class: i === tab ? 'on' : '', onclick: () => { tab = i; render(); } }, h('span', {}, ic), label));
  });
}
$('back').addEventListener('click', () => history.back());

// ───────────── Bills tab: today + history ─────────────
function dayLabel(t) { return new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); }
function timeLabel(t) { return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
function dateTimeLabel(t) { return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + timeLabel(t); }

function homeView() {
  const today = dayKey(Date.now());
  const todays = db.bills.filter((b) => dayKey(b.t) === today);
  const todayTotal = r2(todays.reduce((s, b) => s + calc(b).total, 0));
  const root = h('div', {},
    h('div', { class: 'card hero' },
      h('div', { class: 'small' }, 'Total sales today'),
      h('div', { class: 'big' }, money(todayTotal)),
      h('div', {}, todays.length + ' bill(s)')),
    h('button', { class: 'btn', onclick: () => nav({ name: 'new' }) }, '+ New bill'));
  if (!db.bills.length) root.append(h('p', { class: 'small' }, 'No bills yet. Tap “+ New bill” to make your first one.'));
  let lastDay = null;
  const groups = [];
  db.bills.forEach((b) => {
    const k = dayKey(b.t);
    if (k !== lastDay) { groups.push({ k, t: b.t, list: [] }); lastDay = k; }
    groups[groups.length - 1].list.push(b);
  });
  groups.forEach((g) => {
    const dayTotal = r2(g.list.reduce((s, b) => s + calc(b).total, 0));
    root.append(h('div', { class: 'day' },
      h('span', {}, g.k === today ? 'Today' : dayLabel(g.t)),
      h('span', {}, 'Day total ' + money(dayTotal))));
    g.list.forEach((b) => {
      root.append(h('div', { class: 'card bill row between', onclick: () => nav({ name: 'detail', no: b.no }) },
        h('div', { class: 'grow' },
          h('div', { class: 'bold' }, '#' + b.no),
          h('div', { class: 'small ell' }, timeLabel(b.t) + (b.customer ? ' · ' + b.customer : ''))),
        h('div', { class: 'bold' }, money(calc(b).total))));
    });
  });
  return root;
}

// ───────────── New bill ─────────────
function stepper(initial, onChange) {
  let q = initial;
  const label = h('span', { class: 'q' }, String(q));
  const set = (n) => { q = Math.max(0, n); label.textContent = String(q); onChange(q); };
  return h('div', { class: 'step' },
    h('button', { onclick: () => set(q - 1), 'aria-label': 'less' }, '−'),
    label,
    h('button', { class: 'plus', onclick: () => set(q + 1), 'aria-label': 'more' }, '+'));
}

function newBillView() {
  const st = { customer: '', qty: {}, custom: [], dv: '', dp: true, tx: fmtNum(+db.shop.tax || 0) };
  const no = db.next;
  const lines = () => [
    ...db.items.filter((i) => st.qty[i.id] > 0).map((i) => ({ n: i.name, p: i.price, q: st.qty[i.id] })),
    ...st.custom.map((c) => ({ n: c.n, p: c.p, q: c.q }))
  ];
  const draft = () => ({
    no, t: Date.now(), customer: st.customer.trim(), lines: lines(),
    dv: parseFloat(st.dv) || 0, dp: st.dp, tx: parseFloat(st.tx) || 0
  });

  const summary = h('div', { class: 'card sum' });
  const totalLabel = h('div', { class: 'bold', style: 'font-size:26px' }, '₹0');
  const saveBtn = h('button', { class: 'btn', disabled: true, onclick: () => {
    const b = draft();
    if (!b.lines.length) return;
    b.t = Date.now();
    db.bills.unshift(b);
    db.next = no + 1;
    save();
    history.replaceState({ s: 'detail' }, '');
    screen = { name: 'detail', no };
    render();
  } }, 'Save & show QR');

  function update() {
    const b = draft(), c = calc(b);
    summary.innerHTML = '';
    const row = (l, v, bold) => h('div', { class: 'row between' + (bold ? ' bold' : '') }, h('span', {}, l), h('span', {}, v));
    summary.append(row('Subtotal', money(c.sub)));
    if (c.disc > 0) summary.append(row('Discount', '− ' + money(c.disc)));
    if (c.tax > 0) summary.append(row('Tax (' + fmtNum(b.tx) + '%)', money(c.tax)));
    summary.append(row('Total', money(c.total), true));
    totalLabel.textContent = money(c.total);
    saveBtn.disabled = !b.lines.length;
  }

  const customBox = h('div', {});
  function renderCustom() {
    customBox.innerHTML = '';
    st.custom.forEach((c, idx) => {
      customBox.append(h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'ell' }, c.n), h('div', { class: 'small' }, money(c.p))),
        stepper(c.q, (q) => {
          if (q === 0) { st.custom.splice(idx, 1); renderCustom(); } else c.q = q;
          update();
        })));
    });
  }

  const itemsBox = h('div', { class: 'card' });
  if (!db.items.length) itemsBox.append(h('p', { class: 'small' }, 'No saved items yet. Add them in the Items tab, or use a custom item below.'));
  db.items.forEach((it) => {
    itemsBox.append(h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('div', { class: 'ell' }, it.name), h('div', { class: 'small' }, money(it.price))),
      stepper(0, (q) => { st.qty[it.id] = q; update(); })));
  });

  const cName = h('input', { type: 'text', placeholder: 'Item name' });
  const cPrice = numInput('', null, 'Price');
  const addCustom = () => {
    const p = parseFloat(cPrice.value);
    if (!cName.value.trim() || !(p > 0)) { toast('Enter a name and a price'); return; }
    st.custom.push({ n: cName.value.trim(), p, q: 1 });
    cName.value = ''; cPrice.value = '';
    renderCustom(); update();
  };

  const pctBtn = h('button', { class: 'chip on', onclick: () => setDp(true) }, '%');
  const rsBtn = h('button', { class: 'chip', onclick: () => setDp(false) }, '₹');
  function setDp(v) { st.dp = v; pctBtn.className = 'chip' + (v ? ' on' : ''); rsBtn.className = 'chip' + (v ? '' : ' on'); update(); }

  const custInput = h('input', { type: 'text', placeholder: 'Customer (optional)' });
  custInput.addEventListener('input', () => { st.customer = custInput.value; });

  const root = h('div', {},
    custInput,
    h('h2', {}, 'Items'),
    itemsBox,
    h('h2', {}, 'Custom items'),
    customBox,
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, cName), h('div', { style: 'width:100px' }, cPrice)),
      h('button', { class: 'btn ghost', onclick: addCustom }, '+ Add custom item')),
    h('h2', {}, 'Discount and tax'),
    h('div', { class: 'card' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, field('Discount', numInput('', (v) => { st.dv = v; update(); }))),
        pctBtn, rsBtn),
      field('Tax %', numInput(st.tx, (v) => { st.tx = v; update(); }))),
    summary,
    h('div', { class: 'total-bar' }, h('div', { class: 'grow' }, h('div', { class: 'small' }, 'Total'), totalLabel), saveBtn));
  renderCustom();
  update();
  return root;
}

// ───────────── Bill detail: receipt, QR, share ─────────────
function detailView(b) {
  const c = calc(b), shop = db.shop;
  const hasUpi = shop.upi.trim().length > 0;
  const receipt = h('div', { class: 'card rcpt' },
    h('div', { class: 'bold', style: 'font-size:20px' }, shop.name),
    shop.address ? h('div', { class: 'small' }, shop.address) : null,
    h('div', { class: 'small' }, dateTimeLabel(b.t)),
    b.customer ? h('div', {}, 'Customer: ' + b.customer) : null,
    h('hr'),
    b.lines.map((l) => h('div', { class: 'rcpt-line' }, h('span', {}, l.n + '  ' + l.q + ' × ' + money(l.p)), h('span', {}, money(r2(l.p * l.q))))),
    h('hr'),
    h('div', { class: 'rcpt-line' }, h('span', {}, 'Subtotal'), h('span', {}, money(c.sub))),
    c.disc > 0 ? h('div', { class: 'rcpt-line' }, h('span', {}, 'Discount'), h('span', {}, '− ' + money(c.disc))) : null,
    c.tax > 0 ? h('div', { class: 'rcpt-line' }, h('span', {}, 'Tax (' + fmtNum(b.tx) + '%)'), h('span', {}, money(c.tax))) : null,
    h('div', { class: 'rcpt-line bold', style: 'font-size:18px' }, h('span', {}, 'Total'), h('span', {}, money(c.total))));

  const root = h('div', {}, receipt);
  if (hasUpi) {
    let qr;
    try { qr = drawQR(h('canvas'), upiLink(shop, b), 480); } catch (e) { qr = null; }
    if (qr) root.append(h('div', { class: 'qrbox' }, qr, h('div', { class: 'bold' }, 'Scan to pay ' + money(c.total)), h('div', { class: 'small' }, shop.upi)));
    else root.append(h('p', { class: 'warn' }, 'Could not make a QR code. Check your UPI ID and shop name in the Shop tab.'));
  } else {
    root.append(h('p', { class: 'warn' }, 'Add your UPI ID in the Shop tab to show a payment QR code on bills.'));
  }
  root.append(
    h('button', { class: 'btn green', onclick: () => shareBill(b) }, 'Share bill as image'),
    h('button', { class: 'btn ghost', onclick: () => downloadBill(b) }, 'Save image to phone'),
    h('button', { class: 'btn danger', onclick: () => {
      if (confirm('Delete bill #' + b.no + '? It will also leave the history and daily totals.')) {
        db.bills = db.bills.filter((x) => x.no !== b.no);
        save();
        history.back();
      }
    } }, 'Delete this bill'));
  return root;
}

// ───────────── bill image ─────────────
function billCanvas(b) {
  const c = calc(b), shop = db.shop;
  const W = 720, pad = 40, R = W - pad;
  const INK = '#1b1b1f', GREY = '#6b6b72', ACC = '#c2185b', RULE = '#d9d9de';
  let qr = null;
  if (shop.upi.trim()) { try { qr = drawQR(document.createElement('canvas'), upiLink(shop, b), 340); } catch (e) { qr = null; } }

  function draw(x) {
    const t = (text, px, y, size, color, bold, align) => {
      x.font = (bold ? 'bold ' : '') + size + 'px system-ui, sans-serif';
      x.fillStyle = color; x.textAlign = align || 'left';
      x.fillText(text, px, y);
    };
    const fit = (text, maxW, size, bold) => {
      x.font = (bold ? 'bold ' : '') + size + 'px system-ui, sans-serif';
      if (x.measureText(text).width <= maxW) return text;
      let n = text.length;
      while (n > 1 && x.measureText(text.slice(0, n) + '…').width > maxW) n--;
      return text.slice(0, n) + '…';
    };
    const rule = (y) => { x.strokeStyle = RULE; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, y); x.lineTo(R, y); x.stroke(); };
    let y = 76;
    t(fit(shop.name || 'My Shop', W - 2 * pad - 140, 42, true), pad, y, 42, INK, true);
    t('#' + b.no, R, y, 36, ACC, true, 'right');
    y += 42;
    if (shop.address) { t(fit(shop.address, W - 2 * pad, 26), pad, y, 26, GREY); y += 36; }
    t(dateTimeLabel(b.t), pad, y, 26, GREY); y += 36;
    if (b.customer) { t(fit('Customer: ' + b.customer, W - 2 * pad, 26), pad, y, 26, GREY); y += 36; }
    y += 4; rule(y); y += 40;
    t('ITEM', pad, y, 24, GREY, true);
    t('QTY × PRICE', 540, y, 24, GREY, true, 'right');
    t('AMOUNT', R, y, 24, GREY, true, 'right');
    y += 16; rule(y); y += 44;
    b.lines.forEach((l) => {
      t(fit(l.n, 270, 30), pad, y, 30, INK);
      t(l.q + ' × ' + money(l.p), 540, y, 28, GREY, false, 'right');
      t(money(r2(l.p * l.q)), R, y, 30, INK, true, 'right');
      y += 50;
    });
    y -= 14; rule(y); y += 44;
    t('Subtotal', pad, y, 28, GREY); t(money(c.sub), R, y, 28, INK, false, 'right'); y += 42;
    if (c.disc > 0) {
      t('Discount' + (b.dp ? ' (' + fmtNum(b.dv) + '%)' : ''), pad, y, 28, GREY);
      t('− ' + money(c.disc), R, y, 28, INK, false, 'right'); y += 42;
    }
    if (c.tax > 0) { t('Tax (' + fmtNum(b.tx) + '%)', pad, y, 28, GREY); t(money(c.tax), R, y, 28, INK, false, 'right'); y += 42; }
    y += 12;
    t('TOTAL', pad, y, 40, INK, true);
    t(money(c.total), R, y, 44, ACC, true, 'right');
    y += 40;
    if (qr) {
      y += 10; rule(y); y += 40;
      x.imageSmoothingEnabled = false;
      x.drawImage(qr, Math.round((W - qr.width) / 2), y, qr.width, qr.height);
      y += qr.height + 44;
      t('Scan to pay ' + money(c.total), W / 2, y, 30, INK, true, 'center'); y += 38;
      t(shop.upi, W / 2, y, 24, GREY, false, 'center'); y += 20;
    }
    y += 50;
    t('Thank you! Visit again.', W / 2, y, 26, GREY, false, 'center');
    return y + 50;
  }

  const H = draw(document.createElement('canvas').getContext('2d'));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  draw(ctx);
  return cv;
}
function billBlob(b) {
  return new Promise((res) => billCanvas(b).toBlob(res, 'image/png'));
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function downloadBill(b) {
  downloadBlob(await billBlob(b), 'bill-' + b.no + '.png');
  toast('Image saved');
}
async function shareBill(b) {
  const blob = await billBlob(b);
  const file = new File([blob], 'bill-' + b.no + '.png', { type: 'image/png' });
  const text = db.shop.name + ' – Bill #' + b.no + ': ' + money(calc(b).total);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text, title: 'Bill #' + b.no }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  downloadBlob(blob, file.name);
  toast('Sharing not supported here – image saved instead');
}

// ───────────── Items tab ─────────────
function itemsView() {
  const nameIn = h('input', { type: 'text', placeholder: 'Item name (e.g. Tea 100 g)' });
  const priceIn = numInput('', null, 'Price ₹');
  const root = h('div', {},
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, nameIn), h('div', { style: 'width:100px' }, priceIn)),
      h('button', { class: 'btn', onclick: () => {
        const p = parseFloat(priceIn.value);
        if (!nameIn.value.trim() || !(p > 0)) { toast('Enter a name and a price'); return; }
        db.items.push({ id: uid(), name: nameIn.value.trim(), price: p });
        save(); render();
      } }, '+ Add item')));
  if (!db.items.length) root.append(h('p', { class: 'small' }, 'No items yet.'));
  const list = h('div', { class: 'card' });
  db.items.forEach((it) => {
    list.append(h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('div', { class: 'bold ell' }, it.name), h('div', {}, money(it.price))),
      h('button', { class: 'btn text', onclick: () => dialog('Edit item', [
        { label: 'Item name', value: it.name },
        { label: 'Price (₹)', value: fmtNum(it.price), num: true }
      ], ([n, p]) => {
        const price = parseFloat(p);
        if (!n.trim() || !(price > 0)) { toast('Enter a name and a price'); return false; }
        it.name = n.trim(); it.price = price; save(); render();
      }) }, 'Edit'),
      h('button', { class: 'btn text', style: 'color:var(--red)', onclick: () => {
        if (confirm('Delete “' + it.name + '”? Old bills are not changed.')) { db.items = db.items.filter((x) => x.id !== it.id); save(); render(); }
      } }, 'Delete')));
  });
  if (db.items.length) root.append(list);
  return root;
}

// ───────────── Shop tab ─────────────
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (screen.name === 'tabs' && tab === 2) render(); });

function shopView() {
  const name = h('input', { type: 'text', value: db.shop.name });
  const addr = h('input', { type: 'text', value: db.shop.address });
  const upi = h('input', { type: 'text', value: db.shop.upi, placeholder: 'name@bank', autocapitalize: 'none', autocomplete: 'off' });
  const tax = numInput(fmtNum(+db.shop.tax || 0));
  const root = h('div', {},
    h('div', { class: 'card' },
      field('Shop name', name),
      field('Address / phone (shown on bill)', addr),
      field('Your UPI ID (e.g. name@bank)', upi),
      field('Default tax %', tax),
      h('button', { class: 'btn', onclick: () => {
        db.shop = { name: name.value.trim() || 'My Shop', address: addr.value.trim(), upi: upi.value.trim(), tax: parseFloat(tax.value) || 0 };
        save(); $('title').textContent = db.shop.name; toast('Shop saved');
      } }, 'Save shop')),
    h('p', { class: 'small' }, 'Everything is stored only on this phone and works offline. Clearing Chrome’s site data for this app will erase your bills.'));
  if (installPrompt) {
    root.append(h('button', { class: 'btn ghost', onclick: async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null; render();
    } }, 'Install app on this phone'));
  }
  return root;
}

// ───────────── start ─────────────
history.replaceState({ s: 'tabs' }, '');
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
