const express = require('express');
const { requireAuth } = require('../middleware/auth');
const tt = require('../services/tiktok');

const router = express.Router();

router.get('/api/tiktok/kpis', requireAuth, async (req, res) => {
  const cache = tt.getCache();
  if (!cache.lastFetch) {
    // Try loading from GCS, but never scrape
    await tt.loadCacheFromDisk();
  }
  res.json(tt.getCache());
});

router.get('/api/tiktok/history', requireAuth, async (req, res) => {
  res.json(await tt.loadHistory());
});

module.exports = router;
