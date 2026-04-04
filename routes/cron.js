const express = require('express');
const { verifyCron } = require('../middleware/auth');
const ig = require('../services/instagram');
const li = require('../services/linkedin');

const router = express.Router();

// ── Helper: check if we should run the bi-daily cron ──
function shouldRunBiDaily(lastFetch) {
  if (!lastFetch) return true;
  const last = new Date(lastFetch);
  const now  = new Date();
  const hoursSince = (now - last) / (1000 * 60 * 60);
  return hoursSince >= 30; // ~2 days with a 4h buffer
}

// ──────────────────────────────────────────────────────
// POST /api/cron/refresh-all
// Called every 2 days by Cloud Scheduler.
// Light refresh: fetches posts, only downloads NEW images.
// ──────────────────────────────────────────────────────
router.post('/api/cron/refresh-all', verifyCron, async (req, res) => {
  console.log('[Cron] Bi-daily refresh triggered');
  const results = {};

  // Instagram
  const igCache = ig.getCache();
  if (shouldRunBiDaily(igCache.lastFetch)) {
    results.instagram = await ig.refreshCache({ fullImageRescrape: false });
  } else {
    results.instagram = { ok: true, skipped: true, reason: 'last fetch too recent' };
  }

  // LinkedIn
  const liCache = li.getCache();
  if (shouldRunBiDaily(liCache.lastFetch)) {
    results.linkedin = await li.refreshCache({ fullImageRescrape: false });
  } else {
    results.linkedin = { ok: true, skipped: true, reason: 'last fetch too recent' };
  }

  console.log('[Cron] Bi-daily refresh complete:', JSON.stringify(results));
  res.json({ ok: true, type: 'bi-daily', results });
});

// ──────────────────────────────────────────────────────
// POST /api/cron/refresh-full
// Called once per month by Cloud Scheduler.
// Full refresh: re-scrapes everything including ALL images.
// ──────────────────────────────────────────────────────
router.post('/api/cron/refresh-full', verifyCron, async (req, res) => {
  console.log('[Cron] Monthly full refresh triggered');
  const results = {};

  results.instagram = await ig.refreshCache({ fullImageRescrape: true });
  results.linkedin  = await li.refreshCache({ fullImageRescrape: true });

  console.log('[Cron] Monthly full refresh complete:', JSON.stringify(results));
  res.json({ ok: true, type: 'monthly-full', results });
});

module.exports = router;
