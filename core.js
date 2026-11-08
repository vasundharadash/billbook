'use strict';
/* Pure logic: money formatting, bill totals, UPI link. */

function r2(x) { return Math.round(x * 100 + 1e-7) / 100; }

function money(x) {
  return '₹' + x.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(x) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function fmtNum(x) { return Number.isInteger(x) ? String(x) : String(+x.toFixed(2)); }

function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* bill = { no, t, customer, lines:[{n,p,q}], dv, dp, tx }
   dv = discount value, dp = discount is a percent, tx = tax percent */
function calc(b) {
  const sub = r2(b.lines.reduce((s, l) => s + r2(l.p * l.q), 0));
  const disc = r2(b.dp ? sub * Math.min(b.dv, 100) / 100 : Math.min(b.dv, sub));
  const taxable = r2(sub - disc);
  const tax = r2(taxable * b.tx / 100);
  return { sub, disc, taxable, tax, total: r2(taxable + tax) };
}

function upiLink(shop, b) {
  const total = calc(b).total;
  return 'upi://pay?pa=' + encodeURIComponent(shop.upi.trim()).replace(/%40/g, '@') +
    '&pn=' + encodeURIComponent((shop.name || 'Shop').slice(0, 30)) +
    '&am=' + total.toFixed(2) +
    '&cu=INR' +
    '&tn=' + encodeURIComponent('Bill ' + b.no);
}

if (typeof module !== 'undefined') module.exports = { r2, money, fmtNum, dayKey, calc, upiLink };
