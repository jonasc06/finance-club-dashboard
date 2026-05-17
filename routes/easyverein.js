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

module.exports = router;
