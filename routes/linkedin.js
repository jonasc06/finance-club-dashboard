const express = require('express');
const { requireAuth } = require('../middleware/auth');
const li = require('../services/linkedin');

const router = express.Router();

router.get('/api/linkedin/kpis', requireAuth, async (req, res) => {
  const cache = li.getCache();
  if (!cache.lastFetch) {
    // Try loading from GCS, but never scrape
    await li.loadCacheFromDisk();
  }
  res.json(li.getCache());
});

router.get('/api/linkedin/history', requireAuth, async (req, res) => {
  res.json(await li.loadHistory());
});

module.exports = router;
