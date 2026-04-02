const express = require('express');
const { requireAuth } = require('../middleware/auth');
const li = require('../services/linkedin');

const router = express.Router();

router.get('/api/linkedin/kpis', requireAuth, async (req, res) => {
  const cache = li.getCache();
  if (!cache.lastFetch) li.loadCacheFromDisk();
  if (!li.getCache().lastFetch) await li.refreshCache();
  res.json(li.getCache());
});

router.post('/api/linkedin/refresh', requireAuth, async (req, res) => {
  if (li.fetchedToday()) {
    return res.status(429).json({
      ok: false,
      error: 'Already fetched LinkedIn today. Next refresh available tomorrow.',
      lastFetch: li.getCache().lastFetch,
    });
  }
  const result = await li.refreshCache();
  res.json(result);
});

router.get('/api/linkedin/history', requireAuth, (req, res) => {
  res.json(li.loadHistory());
});

module.exports = router;
