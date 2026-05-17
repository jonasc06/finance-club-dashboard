const express = require('express');
const { requireRole } = require('../middleware/auth');
const ev = require('../services/easyverein');

const router = express.Router();

router.get('/api/easyverein/kpis', requireRole('admin'), async (req, res) => {
  const cache = ev.getCache();
  if (!cache.lastFetch) {
    await ev.loadCacheFromDisk();
  }
  res.json(ev.getCache());
});

router.get('/api/easyverein/history', requireRole('admin'), async (req, res) => {
  res.json(await ev.loadHistory());
});

router.get('/api/easyverein/finance-kpis', requireRole('admin'), async (req, res) => {
  const cache = ev.getCache();
  if (!cache.lastFetch) {
    await ev.loadCacheFromDisk();
  }
  const data = ev.getCache();
  if (data._raw_bookings && data._raw_members) {
    const yearParam = parseInt(req.query.year) || null;
    return res.json(ev.computeFinanceKpis(data._raw_bookings, data._raw_members, yearParam));
  }
  res.json(data.finance_kpis || {});
});

module.exports = router;
