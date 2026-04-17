const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ev = require('../services/easyverein');

const router = express.Router();

router.get('/api/easyverein/kpis', requireAuth, async (req, res) => {
  const cache = ev.getCache();
  if (!cache.lastFetch) {
    await ev.loadCacheFromDisk();
  }
  res.json(ev.getCache());
});

router.get('/api/easyverein/history', requireAuth, async (req, res) => {
  res.json(await ev.loadHistory());
});

module.exports = router;
