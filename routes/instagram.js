const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ig = require('../services/instagram');

const router = express.Router();

router.get('/api/kpis', requireAuth, async (req, res) => {
  const cache = ig.getCache();
  if (!cache.lastFetch) ig.loadCacheFromDisk();
  if (!ig.getCache().lastFetch) await ig.refreshCache();
  res.json(ig.getCache());
});

router.post('/api/refresh', requireAuth, async (req, res) => {
  if (ig.fetchedToday()) {
    return res.status(429).json({
      ok: false,
      error: 'Already fetched Instagram today. Next refresh available tomorrow.',
      lastFetch: ig.getCache().lastFetch,
    });
  }
  const result = await ig.refreshCache();
  res.json(result);
});

router.get('/api/history', requireAuth, (req, res) => {
  res.json(ig.loadHistory());
});

module.exports = router;
