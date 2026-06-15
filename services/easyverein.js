const axios  = require('axios');
const config = require('../config');
const { readJSON, writeJSON } = require('./cache');
const { updateSecret } = require('../config/secrets');

const BASE_URL = 'https://easyverein.com/api/v2.0';

let cache = {
  organization: null,
  members: null,
  invoices: null,
  inventory: null,
  calculated_metrics: null,
  insights: null,
  lastFetch: null,
};

// ── API helper ──

function api(endpoint, params = {}) {
  return axios.get(`${BASE_URL}/${endpoint}`, {
    headers: { Authorization: `Bearer ${config.EASYVEREIN_TOKEN}` },
    params: { limit: 100, ...params },
    timeout: 30000,
  });
}

async function apiAllPages(endpoint, params = {}) {
  const items = [];
  let url = `${BASE_URL}/${endpoint}`;
  const headers = { Authorization: `Bearer ${config.EASYVEREIN_TOKEN}` };

  while (url) {
    const { data } = await axios.get(url, {
      headers,
      params: items.length === 0 ? { limit: 100, ...params } : undefined,
      timeout: 30000,
    });
    items.push(...(data.results || []));
    url = data.next || null;
  }
  return items;
}

// ── Token refresh ──
//
// EasyVerein API v2.0 replaced non-expiring keys with tokens that expire after 30 days.
// The API signals an upcoming expiry via a response header *while the token is still
// valid*; we rotate then. An already-expired token returns 401 and CANNOT refresh itself,
// so this must run proactively (the bi-daily cron runs well inside the 30-day window).
async function refreshTokenIfSignaled(headers = {}) {
  // Log token-related headers so the exact signal name can be confirmed from prod logs.
  const related = Object.keys(headers).filter(k => /token|refresh/i.test(k));
  if (related.length) {
    console.log('[EasyVerein] token-related response headers:', related.map(k => `${k}=${headers[k]}`).join(', '));
  }

  const isTruthy = v => v !== undefined && v !== null && v !== '' &&
    !['false', '0', 'no'].includes(String(v).toLowerCase());
  const needsRefresh = ['tokenrefreshneeded', 'token-refresh-needed', 'x-token-refresh-needed']
    .some(k => isTruthy(headers[k]));
  if (!needsRefresh) return;

  try {
    const { data } = await axios.get(`${BASE_URL}/refresh-token`, {
      headers: { Authorization: `Bearer ${config.EASYVEREIN_TOKEN}` },
      timeout: 15000,
    });
    const newToken = data?.token || data?.access_token || data?.bearer || data?.key;
    if (newToken) {
      await updateSecret('EASYVEREIN_SECRET', newToken);
      console.log('[EasyVerein] Token refreshed and saved to Secret Manager');
    } else {
      console.warn('[EasyVerein] Refresh returned no recognizable token field; keys:', Object.keys(data || {}).join(','));
    }
  } catch (err) {
    console.warn('[EasyVerein] Token refresh failed:', err.response?.status || err.message);
  }
}

// ── History ──

async function loadHistory() {
  return await readJSON(config.EV_HISTORY_FILE, {
    total_members: [],
    total_revenue: [],
    open_invoices: [],
  });
}

async function saveHistory(history) {
  await writeJSON(config.EV_HISTORY_FILE, history);
}

async function appendSnapshot(totalMembers, totalRevenue, openInvoices) {
  const history = await loadHistory();
  const today = new Date().toISOString().slice(0, 10);

  if (!history.total_members.some(e => e.date === today)) {
    history.total_members.push({ date: today, value: totalMembers });
  }
  if (totalRevenue != null && !history.total_revenue.some(e => e.date === today)) {
    history.total_revenue.push({ date: today, value: totalRevenue });
  }
  if (openInvoices != null && !history.open_invoices.some(e => e.date === today)) {
    history.open_invoices.push({ date: today, value: openInvoices });
  }

  history.total_members = history.total_members.slice(-400);
  history.total_revenue = history.total_revenue.slice(-400);
  history.open_invoices = history.open_invoices.slice(-90);

  await saveHistory(history);
  return history;
}

// ── Cache ──

async function loadCacheFromDisk() {
  try {
    const data = await readJSON(config.EV_CACHE_FILE, null);
    if (!data) return;
    cache = data;
    console.log(`[EV Cache] Loaded from disk — last fetch: ${cache.lastFetch}`);
  } catch {}
}

async function saveCacheToDisk() {
  await writeJSON(config.EV_CACHE_FILE, cache);
}

function getCache() { return cache; }

// ── Data fetching ──

async function fetchData() {
  console.log('[EasyVerein] Fetching data from API...');

  // Track auth failures so we never overwrite good data with zeros (see refreshCache).
  let authFailed = false;
  const onFail = (label, fallback) => (err) => {
    const status = err.response?.status;
    if (status === 401 || status === 403) authFailed = true;
    console.warn(`[EasyVerein] ${label} fetch failed:`, err.message);
    return fallback;
  };

  // Fetch all data sources in parallel
  const [orgRes, members, invoices, inventoryItems, memberGroups, bookings, billingAccounts] = await Promise.all([
    api('organization').catch(onFail('Organization', { data: {} })),
    apiAllPages('member', { query: '{id,joinDate,resignationDate,_isApplication}' }).catch(onFail('Members', [])),
    apiAllPages('invoice', { query: '{id,description,charges,date,dateSent,relatedBookings,isDraft,canceledInvoice,isRequest,totalPrice}' }).catch(onFail('Invoices', [])),
    apiAllPages('inventory-object').catch(onFail('Inventory', [])),
    apiAllPages('member-group', { query: '{id,name,short,linkedItems}' }).catch(onFail('Member groups', [])),
    // Pull EasyVerein's native accounting fields so we can classify from them
    // (billingAccount = Sachkonto, bookingProject, receiver) instead of guessing
    // from the free-text description alone.
    apiAllPages('booking', { query: '{id,amount,date,description,receiver,bookingProject,sphere,billingAccount,relatedInvoice}' }).catch(onFail('Bookings', [])),
    apiAllPages('billing-account', { query: '{id,name,number}' }).catch(onFail('Billing accounts', [])),
  ]);

  // Abort on auth failure — do NOT compute zeros, pollute history, or overwrite the cache.
  // (This is what turned an expired token into a silent all-zero dashboard.)
  if (authFailed) {
    const err = new Error('EasyVerein authentication failed (HTTP 401/403) — token expired or invalid');
    err.isAuthError = true;
    throw err;
  }

  // Token still valid here — rotate it now if the API signaled an upcoming expiry.
  await refreshTokenIfSignaled(orgRes?.headers);

  // ── Organization ──
  const org = orgRes.data?.results?.[0] || orgRes.data || {};

  // ── Members analysis ──
  const activeMembers = members.filter(m => !m.resignationDate && !m._isApplication);
  const applicationMembers = members.filter(m => m._isApplication);
  const resignedMembers = members.filter(m => m.resignationDate);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const newMembersLast30 = activeMembers.filter(m => {
    if (!m.joinDate) return false;
    return new Date(m.joinDate) >= thirtyDaysAgo;
  });

  const memberGroupsData = memberGroups.map(g => ({
    id: g.id,
    name: g.name,
    memberCount: g.linkedItems || 0,
  })).sort((a, b) => b.memberCount - a.memberCount);

  // ── Invoices analysis ──
  function invoiceTotal(i) {
    if (i.charges && typeof i.charges.total === 'number') return i.charges.total;
    return parseFloat(i.totalPrice) || 0;
  }

  const validInvoices = invoices.filter(i => !i.isDraft && !i.canceledInvoice && !i.isRequest);
  const paidInvoices = validInvoices.filter(i => (i.relatedBookings || []).length > 0);
  const openInvoicesList = validInvoices.filter(i => (i.relatedBookings || []).length === 0);
  const overdueInvoices = openInvoicesList.filter(i => {
    if (!i.date) return false;
    const invoiceDate = new Date(i.date);
    const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    return dueDate < now;
  });

  const totalRevenue = paidInvoices.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const openAmount = openInvoicesList.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + invoiceTotal(i), 0);

  // Categorize: member fee = amount <= 36 and divisible by 3
  function isMemberFee(amount) {
    return amount > 0 && amount <= 36 && Math.round(amount * 100) % 300 === 0;
  }

  const paidMemberFees = paidInvoices.filter(i => isMemberFee(invoiceTotal(i)));
  const paidCooperation = paidInvoices.filter(i => !isMemberFee(invoiceTotal(i)));
  const memberFeeRevenue = paidMemberFees.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const cooperationRevenue = paidCooperation.reduce((sum, i) => sum + invoiceTotal(i), 0);

  // Monthly revenue for last 12 months
  const monthlyRevenue = [];
  const monthlyMemberFees = [];
  const monthlyCooperation = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    const monthTotal = paidInvoices
      .filter(inv => inv.date && inv.date.startsWith(monthKey))
      .reduce((sum, inv) => sum + invoiceTotal(inv), 0);
    const monthMemberFee = paidMemberFees
      .filter(inv => inv.date && inv.date.startsWith(monthKey))
      .reduce((sum, inv) => sum + invoiceTotal(inv), 0);
    const monthCoop = paidCooperation
      .filter(inv => inv.date && inv.date.startsWith(monthKey))
      .reduce((sum, inv) => sum + invoiceTotal(inv), 0);
    monthlyRevenue.push({ month: monthKey, label: monthLabel, value: Math.round(monthTotal * 100) / 100 });
    monthlyMemberFees.push({ month: monthKey, label: monthLabel, value: Math.round(monthMemberFee * 100) / 100 });
    monthlyCooperation.push({ month: monthKey, label: monthLabel, value: Math.round(monthCoop * 100) / 100 });
  }

  // ── Enrich bookings with native accounting fields (Tier 0/1/4) ──
  // billing-account id → name (the Sachkonto / ledger account)
  const billingAccountMap = {};
  (billingAccounts || []).forEach(a => { if (a && a.id != null) billingAccountMap[a.id] = a.name || ''; });
  const extractId = (ref) => {
    if (ref == null) return null;
    if (typeof ref === 'object') return ref.id != null ? String(ref.id) : null;
    const m = String(ref).match(/(\d+)\/?$/);
    return m ? m[1] : String(ref);
  };
  const resolveAccountName = (ref) => {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.name) return ref.name;
    const id = extractId(ref);
    return (id != null && billingAccountMap[id]) ? billingAccountMap[id] : '';
  };

  // Tier 4: derive a category from each invoice, then attach to its related bookings.
  const invoiceCatByBookingId = {};
  (invoices || []).forEach(inv => {
    const cat = deriveInvoiceCategory(inv);
    if (!cat) return;
    (inv.relatedBookings || []).forEach(rb => {
      const id = extractId(rb);
      if (id != null) invoiceCatByBookingId[id] = cat;
    });
  });

  // Flatten each booking to exactly the fields classification needs, so the
  // route can re-run computeFinanceKpis on _raw_bookings without re-fetching.
  const enrichedBookings = (bookings || []).map(b => ({
    amount: b.amount,
    date: b.date,
    description: b.description || '',
    receiver: b.receiver || '',
    bookingProject: typeof b.bookingProject === 'string' ? b.bookingProject : '',
    sphere: b.sphere || null,
    account: resolveAccountName(b.billingAccount),
    invoiceCat: invoiceCatByBookingId[extractId(b.id)] || null,
  }));

  const accountCoverage = enrichedBookings.filter(b => b.account).length;
  console.log(`[EasyVerein] bookings=${enrichedBookings.length}, billing-accounts=${(billingAccounts || []).length}, bookings w/ account name=${accountCoverage} (${enrichedBookings.length ? Math.round(accountCoverage / enrichedBookings.length * 100) : 0}%)`);

  // ── Bookings analysis ──
  const monthlyIncome = [];
  const monthlyExpenses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    const monthBookings = enrichedBookings.filter(b => b.date && b.date.slice(0, 7) === monthKey);
    const income = monthBookings.filter(b => parseFloat(b.amount) > 0).reduce((s, b) => s + parseFloat(b.amount), 0);
    const expenses = monthBookings.filter(b => parseFloat(b.amount) < 0).reduce((s, b) => s + Math.abs(parseFloat(b.amount)), 0);
    monthlyIncome.push({ month: monthKey, label: monthLabel, value: Math.round(income * 100) / 100 });
    monthlyExpenses.push({ month: monthKey, label: monthLabel, value: Math.round(expenses * 100) / 100 });
  }

  // ── Inventory summary ──
  const inventorySummary = inventoryItems.map(item => ({
    id: item.id,
    name: item.name,
    currentStock: item.currentStock || 0,
    totalStock: item.totalStock || 0,
  }));

  // ── Finance KPIs (default to latest year with data) ──
  const financeKpis = computeFinanceKpis(enrichedBookings, members, null);

  // ── History snapshots ──
  const history = await appendSnapshot(activeMembers.length, totalRevenue, openInvoicesList.length);

  const insights = [
    {
      name: 'total_members', period: 'day', title: 'Total Members',
      values: history.total_members.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'total_revenue', period: 'day', title: 'Total Revenue',
      values: history.total_revenue.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'open_invoices', period: 'day', title: 'Open Invoices',
      values: history.open_invoices.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
  ];

  return {
    organization: {
      name: org.name || org.short || 'EasyVerein',
      logo: org._logo || org.logo || null,
      memberCount: activeMembers.length,
    },
    members: {
      total: activeMembers.length,
      applications: applicationMembers.length,
      resigned: resignedMembers.length,
      new_last_30_days: newMembersLast30.length,
      groups: memberGroupsData,
    },
    invoices: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      member_fee_revenue: Math.round(memberFeeRevenue * 100) / 100,
      cooperation_revenue: Math.round(cooperationRevenue * 100) / 100,
      member_fee_count: paidMemberFees.length,
      cooperation_count: paidCooperation.length,
      open_count: openInvoicesList.length,
      open_amount: Math.round(openAmount * 100) / 100,
      overdue_count: overdueInvoices.length,
      overdue_amount: Math.round(overdueAmount * 100) / 100,
      paid_count: paidInvoices.length,
      monthly_revenue: monthlyRevenue,
      monthly_member_fees: monthlyMemberFees,
      monthly_cooperation: monthlyCooperation,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
    },
    inventory: inventorySummary,
    calculated_metrics: {
      active_members: activeMembers.length,
      new_members_30d: newMembersLast30.length,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      open_invoices: openInvoicesList.length,
    },
    finance_kpis: financeKpis,
    _raw_bookings: enrichedBookings,
    _raw_members: members.map(m => ({ joinDate: m.joinDate, resignationDate: m.resignationDate, _isApplication: m._isApplication })),
    insights,
    lastFetch: new Date().toISOString(),
    source: 'easyverein-api',
  };
}

// ── Booking classification ──
//
// Priority (most authoritative first):
//   1. Reconciliation guard  — reversals/refunds/failed debits are NOT operational
//   2. billingAccount (Sachkonto) — EasyVerein's own ledger account
//   3. bookingProject — project tag (e.g. "Münchenfahrt 2025")
//   4. relatedInvoice-derived category (invoices carry the real purpose)
//   5. keyword match on receiver + description (receiver holds the merchant the
//      bank card-slip description usually omits)
//   6. amount heuristics (member-fee multiples, SumUp bulk)
// Anything left over → 'other'.

// Tier 2 — transactions that are not real income/expense (reversed/refunded/failed).
// Guard: "Auslage(nerstattung)" is a genuine member reimbursement, not a reversal.
function isReconciliation(b) {
  const t = ((b.receiver || '') + ' ' + (b.description || '')).toLowerCase();
  if (/auslage/.test(t)) return false;
  return /rücklastschrift|ruecklastschrift|lastschriftr|lastschrift zurück|storno|retoure|chargeback|rückbuchung|rueckbuchung|zurückgebucht|zurueckgebucht|\breject\b|konto.*(aufgel|erlosch)|erloschen|ungültige? iban|ungueltige? iban|fehlerhaft|rückerstattung|rueckerstattung|rücküberweisung|rueckueberweisung|\berstattung\b/.test(t);
}

// Tier 1 — map a billing-account (Sachkonto) name to our category, per side.
const ACCOUNT_RULES = [
  { re: /mitglied|beitrag/i,                                              income: 'member_fees',     expense: null },
  { re: /sponsor|kooperation|partner|werbeein|spende|förder|foerder|zuschuss/i, income: 'sponsoring', expense: null },
  { re: /kaution|pfand/i,                                                 income: 'travel_deposits', expense: 'travel' },
  { re: /reise|fahrt|übernacht|uebernacht|hotel|öpnv|oepnv|\bbahn\b|flug/i, income: 'travel_deposits', expense: 'travel' },
  { re: /veranstalt|event|fest|feier|seminar|workshop|tagung|exkursion/i, income: 'other',           expense: 'events' },
  { re: /bewirt|verpfleg|lebensmittel|getränk|getraenk|gastro|essen|stammtisch|restaurant/i, income: 'other', expense: 'stammtisch' },
  { re: /software|edv|lizenz|\babo\b|saas|hosting|it-?kost|cloud|internet|telefon|domain/i, income: 'other', expense: 'subscriptions' },
  { re: /merch|kleidung|textil|beklei|werbemittel|werbeartikel/i,         income: 'merch',           expense: 'merch' },
  { re: /büro|buero|material|porto|versand|geschäftsbedarf|geschaeftsbedarf|bürobedarf|buerobedarf/i, income: 'other', expense: 'supplies' },
];
function accountToCategory(name, type) {
  if (!name) return null;
  for (const r of ACCOUNT_RULES) {
    if (r.re.test(name)) { const c = type === 'income' ? r.income : r.expense; if (c) return c; }
  }
  return null;
}

// Tier 1 — map a free-text project tag to a category.
function projectToCategory(project, type) {
  if (!project) return null;
  const p = project.toLowerCase();
  if (/fahrt|reise|trip|exkursion|konferenz|conference|münchen|muenchen|wien|frankfurt|berlin|hamburg|köln|koeln/.test(p)) {
    return type === 'income' ? 'travel_deposits' : 'travel';
  }
  if (/fest|event|feier|camp|jubiläum|jubilaeum|weihnacht|sommer|party|grill/.test(p)) {
    return type === 'income' ? null : 'events';
  }
  if (/merch|kleidung|hoodie|polo|shirt/.test(p)) return 'merch';
  return null;
}

// Tier 4 — derive a category from an invoice's own text (invoices are mostly income).
function deriveInvoiceCategory(inv) {
  const t = (inv && inv.description ? inv.description : '').toLowerCase();
  if (!t) return null;
  if (/mitglied|beitrag/.test(t)) return 'member_fees';
  if (/sponsor|kooperation|partner|werbung|anzeige/.test(t)) return 'sponsoring';
  if (/polo|hoodie|shirt|merch|pullover|jacke/.test(t)) return 'merch';
  if (/fahrt|reise|kaution|münchen|muenchen|wien|frankfurt/.test(t)) return 'travel_deposits';
  return null;
}

// Tier 3 — keyword match (expanded) on the combined receiver + description text.
function keywordIncome(text, amount) {
  if (/mitgliedsbeitrag/i.test(text)) return 'member_fees';
  if (amount >= 200 && /rech|refnr|sponsoring|\/inv\/|re\.nr|re-nr|\+re:|rnr|\d{4}-\d{2}\/|pro\s*forma/i.test(text)) return 'sponsoring';
  if (/polo|hoodie|t-shirt|quarter\s*zip|pullover|jacke|pulli|kapuzenjacke|merch|spreadshirt/i.test(text)) return 'merch';
  if (/münchen|muenchen|munich|wien|frankfurt|ffm|kaution|pfand|börsenfahrt|borsenfahrt|muenchenfahrt|münchenfahrt|öpnv|oepnv|ticket|bvh.*konferenz|konferenz.*bvh/i.test(text)) return 'travel_deposits';
  return null;
}
function keywordExpense(text) {
  if (/stammtisch|flaschenpost|pizzeria|lieferando|dominos|\baldi\b|\brewe\b|\blidl\b|edeka|netto|kaufland|penny|getränke|getraenke|bäckerei|baeckerei|restaurant|mensa|metro|gastro/i.test(text)) return 'stammtisch';
  if (/fahrt|reise|zugfahrt|anreise|fahrtkost|münchen|muenchen|munich|wien|frankfurt|ffm|hotel|booking\.com|airbnb|unterkunft|öpnv|oepnv|ticket|kaution|pfand|deutsche bahn|\bdb\b|db vertrieb|flixbus|\bflix\b|\bmvg\b|\blvb\b|uber|bolt|nextbike/i.test(text)) return 'travel';
  if (/event|sommerfest|konferenz|strategieevent|jubiläum|jubilaeum|uni\s*camp|paintball|padel|bowling|klettern|laser|escape|grillen|weihnachtsfeier/i.test(text)) return 'events';
  if (/alleaktien|easyverein|canva|zoom|notion|stripe|spotify|bvh|openai|claude|anthropic|ionos|github|adobe|figma|microsoft|google|telekom|vodafone|\baws\b|hetzner|mailchimp|slack/i.test(text)) return 'subscriptions';
  if (/polo|hoodie|t-shirt|quarter\s*zip|pullover|jacke|pulli|merch|sticker|stick(?:er)?.*datum|banner|spreadshirt|stickerapp/i.test(text)) return 'merch';
  if (/amazon|amzn|vistaprint|druck|flyer|\bprint\b|büro|buero|porto|stationery|office|saturn|mediamarkt|conrad/i.test(text)) return 'supplies';
  return null;
}

function classifyBooking(b, type) {
  const amount = parseFloat(b.amount);
  const text = ((b.receiver || '') + ' ' + (b.description || '')).trim();

  if (isReconciliation(b)) return 'reconciliation';

  if (type === 'income') {
    // Strong amount signal for member fees (kept early — robust to missing text).
    if (amount > 0 && amount <= 36 && Math.round(amount * 100) % 300 === 0) return 'member_fees';
    if (/mitgliedsbeitrag/i.test(text)) return 'member_fees';
    const sumup = text.match(/ANZAHL\s*(\d+)/i);
    if (sumup) { const c = parseInt(sumup[1]); if (c > 0 && amount / c <= 36) return 'member_fees'; }
    return accountToCategory(b.account, 'income')
        || projectToCategory(b.bookingProject, 'income')
        || b.invoiceCat
        || keywordIncome(text, amount)
        || 'other';
  }

  return accountToCategory(b.account, 'expense')
      || projectToCategory(b.bookingProject, 'expense')
      || keywordExpense(text)
      || 'other';
}

function computeSplit(bookings, type) {
  const isIncome = type === 'income';
  const filtered = bookings.filter(b => isIncome ? parseFloat(b.amount) > 0 : parseFloat(b.amount) < 0);
  const buckets = isIncome
    ? { member_fees: 0, sponsoring: 0, travel_deposits: 0, merch: 0, other: 0 }
    : { stammtisch: 0, travel: 0, events: 0, subscriptions: 0, merch: 0, supplies: 0, other: 0 };

  // Reconciliation (reversals/refunds/failed) is tracked separately so it never
  // inflates the operational totals or category percentages.
  let reconciliation = 0;
  for (const b of filtered) {
    const amt = Math.abs(parseFloat(b.amount));
    const cat = classifyBooking(b, type);
    if (cat === 'reconciliation') { reconciliation += amt; continue; }
    buckets[cat] = (buckets[cat] || 0) + amt;
  }

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  const split = {};
  for (const [key, val] of Object.entries(buckets)) {
    split[key] = {
      total: Math.round(val * 100) / 100,
      percentage: total > 0 ? Math.round((val / total) * 10000) / 100 : 0,
    };
  }
  split.reconciliation = {
    total: Math.round(reconciliation * 100) / 100,
    percentage: total > 0 ? Math.round((reconciliation / total) * 10000) / 100 : 0,
  };
  return { split, total: Math.round(total * 100) / 100, reconciliation: Math.round(reconciliation * 100) / 100 };
}

function computeFinanceKpis(bookings, members, selectedYear) {
  const now = new Date();

  // Determine available years from bookings
  const years = [...new Set(bookings.filter(b => b.date).map(b => parseInt(b.date.slice(0, 4))))].sort();

  const currentYear = selectedYear || (years.length > 0 ? years[years.length - 1] : now.getFullYear());
  const yearStart = new Date(currentYear, 0, 1).toISOString();
  const oneYearAgo = new Date(currentYear - 1, now.getMonth(), now.getDate());

  // Split bookings into selected year vs all-time
  const currentYearBookings = bookings.filter(b => b.date && b.date >= yearStart);

  // All-time splits
  const allTimeRevenue = computeSplit(bookings, 'income');
  const allTimeExpenses = computeSplit(bookings, 'expense');

  // Current year splits
  const currentRevenue = computeSplit(currentYearBookings, 'income');
  const currentExpenses = computeSplit(currentYearBookings, 'expense');

  // Monthly income/expenses for selected year
  const monthlyIncome = [];
  const monthlyExpenses = [];
  const lastMonth = currentYear < now.getFullYear() ? 11 : now.getMonth();
  for (let m = 0; m <= lastMonth; m++) {
    const d = new Date(currentYear, m, 1);
    const monthKey = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleDateString('de-DE', { month: 'short' });
    const monthBookings = currentYearBookings.filter(b => b.date && b.date.slice(0, 7) === monthKey);
    const income = monthBookings.filter(b => parseFloat(b.amount) > 0).reduce((s, b) => s + parseFloat(b.amount), 0);
    const expenses = monthBookings.filter(b => parseFloat(b.amount) < 0).reduce((s, b) => s + Math.abs(parseFloat(b.amount)), 0);
    monthlyIncome.push({ month: monthKey, label: monthLabel, value: Math.round(income * 100) / 100 });
    monthlyExpenses.push({ month: monthKey, label: monthLabel, value: Math.round(expenses * 100) / 100 });
  }

  // Members YoY comparison
  const activeMembers = members.filter(m => !m.resignationDate && !m._isApplication);
  const activeYearAgo = members.filter(m => {
    if (m._isApplication) return false;
    const joined = new Date(m.joinDate);
    if (joined > oneYearAgo) return false;
    if (m.resignationDate && new Date(m.resignationDate) <= oneYearAgo) return false;
    return true;
  });
  const currentCount = activeMembers.length;
  const yearAgoCount = activeYearAgo.length;
  const members_yoy = {
    current: currentCount,
    year_ago: yearAgoCount,
    absolute_change: currentCount - yearAgoCount,
    percentage_change: yearAgoCount > 0 ? Math.round(((currentCount - yearAgoCount) / yearAgoCount) * 10000) / 100 : 0,
  };

  // Average membership duration
  const resignedMembers = members.filter(m => m.resignationDate && !m._isApplication);
  const resignedDurations = resignedMembers
    .filter(m => m.joinDate)
    .map(m => (new Date(m.resignationDate) - new Date(m.joinDate)) / (1000 * 60 * 60 * 24));
  const activeDurations = activeMembers
    .filter(m => m.joinDate)
    .map(m => (now - new Date(m.joinDate)) / (1000 * 60 * 60 * 24));

  const avgResigned = resignedDurations.length > 0
    ? resignedDurations.reduce((s, d) => s + d, 0) / resignedDurations.length : 0;
  const avgActive = activeDurations.length > 0
    ? activeDurations.reduce((s, d) => s + d, 0) / activeDurations.length : 0;
  const allDurations = [...resignedDurations, ...activeDurations];
  const avgOverall = allDurations.length > 0
    ? allDurations.reduce((s, d) => s + d, 0) / allDurations.length : 0;

  const avg_membership_duration = {
    overall_days: Math.round(avgOverall),
    overall_months: Math.round(avgOverall / 30.44 * 10) / 10,
    resigned_avg_days: Math.round(avgResigned),
    resigned_avg_months: Math.round(avgResigned / 30.44 * 10) / 10,
    active_avg_days: Math.round(avgActive),
    active_avg_months: Math.round(avgActive / 30.44 * 10) / 10,
  };

  return {
    current_year: currentYear,
    available_years: years,
    current: {
      revenue_split: currentRevenue.split,
      expense_split: currentExpenses.split,
      total_income: currentRevenue.total,
      total_expenses: currentExpenses.total,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
    },
    all_time: {
      revenue_split: allTimeRevenue.split,
      expense_split: allTimeExpenses.split,
      total_income: allTimeRevenue.total,
      total_expenses: allTimeExpenses.total,
    },
    members_yoy,
    avg_membership_duration,
  };
}

// ── Refresh ──

async function refreshCache() {
  try {
    // fetchData throws on auth failure, so neither the in-memory cache nor the GCS/disk
    // copy is touched — the last good snapshot is preserved instead of zeroed out.
    cache = await fetchData();
    await saveCacheToDisk();
    console.log(`[EV Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[EV Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message, authError: !!err.isAuthError };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, loadHistory, computeFinanceKpis };
