#!/usr/bin/env node
// Read-only Striven probe for the Customer Statements design (docs/statement-design.md §4).
// Zero dependencies, Node 18+.
//
// Usage:
//   STRIVEN_CLIENT_ID=... STRIVEN_CLIENT_SECRET=... node probe/statement-probe.js <customerId> [customerId ...]
//   node probe/statement-probe.js --dry-run 52933
//
// Output: probe/out/<customerId>.json (raw records) + a reconciliation summary on stdout.
// Only GET and *search* POST calls are made; nothing is written to Striven.

'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.env.STRIVEN_API_BASE || 'https://api.striven.com';
const PAGE_SIZE = 100;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const customerIds = args.filter((a) => /^\d+$/.test(a)).map(Number);

if (!customerIds.length) {
  console.log('Usage: node probe/statement-probe.js [--dry-run] <customerId> [customerId ...]');
  process.exit(1);
}

let token = null;
async function getToken() {
  if (token) return token;
  const id = process.env.STRIVEN_CLIENT_ID;
  const secret = process.env.STRIVEN_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Set STRIVEN_CLIENT_ID and STRIVEN_CLIENT_SECRET');
  const res = await fetch(`${BASE}/accesstoken`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&ClientId=${encodeURIComponent(id)}`,
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  token = (await res.json()).access_token;
  return token;
}

async function api(method, p, body) {
  if (DRY) {
    console.log(`[dry-run] ${method} ${BASE}${p}${body ? ' ' + JSON.stringify(body) : ''}`);
    return null;
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(`${method} ${p} -> ${res.status} ${await res.text()}`);
  }
  throw new Error(`${method} ${p} failed after retries`);
}

// Page through a search endpoint. PageIndex base (0 vs 1) is unconfirmed, so dedupe by Id.
async function searchAll(p, filters) {
  const seen = new Map();
  for (let page = 0; page < 200; page++) {
    const r = await api('POST', p, { ...filters, PageIndex: page, PageSize: PAGE_SIZE });
    if (!r) return [];
    const data = r.Data || r.data || [];
    const before = seen.size;
    data.forEach((x) => seen.set(x.Id ?? x.id, x));
    const total = r.TotalCount ?? r.totalCount ?? 0;
    if (!data.length || seen.size >= total || seen.size === before) break;
  }
  return [...seen.values()];
}

async function details(kind, rows) {
  const out = [];
  for (const row of rows) out.push(await api('GET', `/v1/${kind}/${row.Id ?? row.id}`));
  return out.filter(Boolean);
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (arr, f) => money(arr.reduce((a, x) => a + (Number(f(x)) || 0), 0));
const statusName = (x) => (x && x.Status && (x.Status.Name || x.Status.name)) || String(x?.Status ?? '');

async function probeCustomer(customerId) {
  const customer = await api('GET', `/v1/customers/${customerId}`);
  const filters = { CustomerId: customerId };
  const [invS, pmtS, cmS, soS] = [
    await searchAll('/v1/invoices/search', filters),
    await searchAll('/v1/payments/search', filters),
    await searchAll('/v1/credit-memos/search', filters),
    await searchAll('/v1/sales-orders/search', filters),
  ];
  if (DRY) return;

  const invoices = await details('invoices', invS);
  const payments = await details('payments', pmtS);
  const creditMemos = await details('credit-memos', cmS);
  const salesOrders = await details('sales-orders', soS);

  // Gap 3: rebuild each invoice's open balance from applications.
  const applied = new Map();
  for (const src of [...payments, ...creditMemos]) {
    for (const a of src.AppliedToInvoices || []) {
      applied.set(a.TxnId, money((applied.get(a.TxnId) || 0) + a.Amount));
    }
  }
  const searchTotals = new Map(invS.map((s) => [s.Id, s.InvoiceTotal]));
  const invoiceMismatches = invoices
    .map((inv) => {
      const total = searchTotals.get(inv.Id);
      const rebuilt = money((total ?? 0) - (applied.get(inv.Id) || 0));
      return { id: inv.Id, number: inv.TxnNumber, status: statusName(inv), total, applied: applied.get(inv.Id) || 0, rebuilt, striven: money(inv.OpenBalance) };
    })
    .filter((r) => r.total !== undefined && Math.abs(r.rebuilt - r.striven) >= 0.01);

  const openInvoices = sum(invoices, (i) => i.OpenBalance);
  const unappliedPayments = sum(payments, (p) => p.UnappliedAmount);
  const openCredits = sum(creditMemos, (c) => c.OpenBalance);

  const summary = {
    customer: { id: customerId, name: customer?.Name, number: customer?.Number },
    counts: { invoices: invoices.length, payments: payments.length, creditMemos: creditMemos.length, salesOrders: salesOrders.length },
    statusValues: {
      invoices: [...new Set(invoices.map(statusName))],
      payments: [...new Set(payments.map(statusName))],
      creditMemos: [...new Set(creditMemos.map(statusName))],
      salesOrders: [...new Set(salesOrders.map(statusName))],
    },
    totals: { openInvoices, unappliedPayments, openCredits, totalDue: money(openInvoices - unappliedPayments - openCredits) },
    gap3_invoiceMismatches: invoiceMismatches, // non-empty => refunds/journal entries/other adjustments exist
    gap4_possibleDeposits: payments
      .filter((p) => p.UnappliedAmount > 0)
      .map((p) => ({ id: p.Id, date: p.TxnDate, ref: p.ReferenceNumber, unapplied: p.UnappliedAmount, memo: p.Memo, notes: p.Notes })),
    jobLinks: {
      invoicesWithOrder: invoices.filter((i) => i.Order && (i.Order.Id || i.Order.id)).length,
      creditMemosWithOrder: creditMemos.filter((c) => c.Order && (c.Order.Id || c.Order.id)).length,
      changeOrders: salesOrders.filter((s) => s.IsChangeOrder).length,
    },
    historicalNonposting: [...invoices, ...payments, ...creditMemos].filter((x) => x.IsHistoricalNonposting).length,
  };

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${customerId}.json`),
    JSON.stringify({ summary, customer, invoices, payments, creditMemos, salesOrders }, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
}

(async () => {
  for (const id of customerIds) {
    console.log(`\n=== Customer ${id} ===`);
    try {
      await probeCustomer(id);
    } catch (e) {
      console.error(`Customer ${id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
})();
