const express = require('express');
const { verifyCron } = require('../middleware/auth');
const ig = require('../services/instagram');
const li = require('../services/linkedin');

const router = express.Router();

// POST /api/cron/refresh-all
// Called by Google Cloud Scheduler or any external cron.
// Auth: either a valid session OR x-cron-secret header / ?secret= query param.
router.post('/api/cron/refresh-all', verifyCron, async (req, res) => {
  console.log('[Cron] Refresh-all triggered');
  const results = {};

  // Instagram
  if (!ig.fetchedToday()) {
    results.instagram = await ig.refreshCache();
  } else {
    results.instagram = { ok: true, skipped: true, reason: 'already fetched today' };
  }

  // LinkedIn
  if (!li.fetchedToday()) {
    results.linkedin = await li.refreshCache();
  } else {
    results.linkedin = { ok: true, skipped: true, reason: 'already fetched today' };
  }

  // ── Add future platforms here ──
  // if (!tw.fetchedToday()) {
  //   results.twitter = await tw.refreshCache();
  // }

  console.log('[Cron] Refresh-all complete:', JSON.stringify(results));
  res.json({ ok: true, results });
});

module.exports = router;
