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

async function refreshTokenIfNeeded() {
  try {
    const { data } = await axios.post(`${BASE_URL}/refresh-token`, null, {
      headers: { Authorization: `Bearer ${config.EASYVEREIN_TOKEN}` },
      timeout: 15000,
    });
    if (data.token) {
      await updateSecret('EASYVEREIN_SECRET', data.token);
      console.log('[EasyVerein] Token refreshed and saved to Secret Manager');
    }
  } catch (err) {
    if (err.response?.status !== 405) {
      console.warn('[EasyVerein] Token refresh failed:', err.message);
    }
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

  history.total_members = history.total_members.slice(-90);
  history.total_revenue = history.total_revenue.slice(-90);
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

  await refreshTokenIfNeeded();

  // Fetch all data sources in parallel
  const [orgRes, members, invoices, inventoryItems, memberGroups, bookings] = await Promise.all([
    api('organization').catch(err => {
      console.warn('[EasyVerein] Organization fetch failed:', err.message);
      return { data: {} };
    }),
    apiAllPages('member', { query: '{id,joinDate,resignationDate,_isApplication}' }).catch(err => {
      console.warn('[EasyVerein] Members fetch failed:', err.message);
      return [];
    }),
    apiAllPages('invoice', { query: '{id,charges,date,dateSent,relatedBookings,isDraft,canceledInvoice,isRequest,totalPrice}' }).catch(err => {
      console.warn('[EasyVerein] Invoices fetch failed:', err.message);
      return [];
    }),
    apiAllPages('inventory-object').catch(err => {
      console.warn('[EasyVerein] Inventory fetch failed:', err.message);
      return [];
    }),
    apiAllPages('member-group', { query: '{id,name,short,linkedItems}' }).catch(err => {
      console.warn('[EasyVerein] Member groups fetch failed:', err.message);
      return [];
    }),
    apiAllPages('booking', { query: '{id,amount,date,description}' }).catch(err => {
      console.warn('[EasyVerein] Bookings fetch failed:', err.message);
      return [];
    }),
  ]);

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

  // ── Bookings analysis ──
  const monthlyIncome = [];
  const monthlyExpenses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    const monthBookings = bookings.filter(b => b.date && b.date.slice(0, 7) === monthKey);
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
    insights,
    lastFetch: new Date().toISOString(),
    source: 'easyverein-api',
  };
}

// ── Refresh ──

async function refreshCache() {
  try {
    cache = await fetchData();
    await saveCacheToDisk();
    console.log(`[EV Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[EV Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, loadHistory };
