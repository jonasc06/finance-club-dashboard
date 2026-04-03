const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ig = require('../services/instagram');

const router = express.Router();

router.get('/api/kpis', requireAuth, async (req, res) => {
  const cache = ig.getCache();
  if (!cache.lastFetch) {
    // Try loading from GCS, but never scrape
    await ig.loadCacheFromDisk();
  }
  res.json(ig.getCache());
});

router.get('/api/history', requireAuth, async (req, res) => {
  res.json(await ig.loadHistory());
});

module.exports = router;
