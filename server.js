const express = require('express');
const path    = require('path');
const config  = require('./config');
const { sessionMiddleware, requireAuth } = require('./middleware/auth');
const { ensureDataDir, migrateDataFiles } = require('./services/cache');
const ig = require('./services/instagram');
const li = require('./services/linkedin');

const app = express();

console.log(`[Config] APIFY  IG_USERNAME=${config.IG_USERNAME}  LI_COMPANY=${config.LI_COMPANY_URL}`);

// ── Global middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware());

// ── Routes ──
app.use(require('./routes/auth'));
app.use(require('./routes/cron'));
app.use(require('./routes/instagram'));
app.use(require('./routes/linkedin'));
app.use(require('./routes/pages'));

// ── Static assets (behind auth) ──
app.use('/data/images/ig', requireAuth, express.static(config.IG_IMAGES));
app.use('/data/images/li', requireAuth, express.static(config.LI_IMAGES));
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ── Start ──
app.listen(config.PORT, async () => {
  console.log(`Finance Club Dashboard running on http://localhost:${config.PORT}`);
  ensureDataDir();
  migrateDataFiles();

  ig.loadCacheFromDisk();
  li.loadCacheFromDisk();

  if (!ig.getCache().lastFetch) {
    console.log('[Startup] No IG cache — running initial scrape...');
    await ig.refreshCache();
  }
  if (!li.getCache().lastFetch) {
    console.log('[Startup] No LI cache — running initial scrape...');
    await li.refreshCache();
  }
});
