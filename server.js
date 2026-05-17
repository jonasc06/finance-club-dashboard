const express = require('express');
const path    = require('path');
const fs      = require('fs');

async function start() {
  // ── Load secrets FIRST (before config is read) ──
  const { loadAllSecrets } = require('./config/secrets');
  await loadAllSecrets();

  // ── Now config values will be populated ──
  const config = require('./config');
  const { sessionMiddleware, requireAuth } = require('./middleware/auth');
  const { ensureDataDir, migrateDataFiles } = require('./services/cache');
  const { streamImage } = require('./services/storage');
  const ig = require('./services/instagram');
  const li = require('./services/linkedin');
  const ev = require('./services/easyverein');

  const app = express();
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  console.log(`[Config] IG_USERNAME=${config.IG_USERNAME}  LI_COMPANY=${config.LI_COMPANY_URL}`);

  // ── App Engine sits behind a load balancer ──
  app.set('trust proxy', 1);

  // ── Global middleware ──
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessionMiddleware());

  // ── Routes ──
  app.use(require('./routes/auth'));
  app.use(require('./routes/cron'));
  app.use(require('./routes/instagram'));
  app.use(require('./routes/linkedin'));
  app.use(require('./routes/easyverein'));
  app.use(require('./routes/pages'));

  // ── Image route (serves from GCS in prod, disk locally) ──
  app.get('/data/images/:subdir/:filename', requireAuth, async (req, res) => {
    const { subdir, filename } = req.params;

    // Sanitize to prevent path traversal
    if (!/^(ig|li)$/.test(subdir) || /[\/\\]/.test(filename)) {
      return res.status(400).send('Invalid path');
    }

    if (!IS_PRODUCTION) {
      // Local dev: serve from disk
      const localPath = path.join(__dirname, 'data', 'images', subdir, filename);
      if (fs.existsSync(localPath)) return res.sendFile(localPath);
      return res.status(404).send('Not found');
    }

    // Production: stream from GCS
    const gcsPath = `images/${subdir}/${filename}`;
    const stream = await streamImage(gcsPath);

    if (!stream) return res.status(404).send('Not found');

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  });

  // ── Block direct static access to admin-only pages ──
  app.use((req, res, next) => {
    if (req.path === '/easyverein.html' && req.session?.role && req.session.role !== 'admin') {
      return res.status(403).send('Access denied');
    }
    next();
  });

  // ── Static assets (behind auth) ──
  app.use(requireAuth, express.static(path.join(__dirname, 'public')));

  // ── Start ──
  app.listen(config.PORT, async () => {
    console.log(`Finance Club Dashboard running on port ${config.PORT}`);
    ensureDataDir();
    migrateDataFiles();

    // Load cached data from GCS — no scraping on startup
    await ig.loadCacheFromDisk();
    await li.loadCacheFromDisk();
    await ev.loadCacheFromDisk();

    if (!ig.getCache().lastFetch) {
      console.log('[Startup] No IG cache yet — will be populated on next cron run');
    }
    if (!li.getCache().lastFetch) {
      console.log('[Startup] No LI cache yet — will be populated on next cron run');
    }
    if (!ev.getCache().lastFetch) {
      console.log('[Startup] No EV cache yet — will be populated on next cron run');
    }
  });
}

start().catch(err => {
  console.error('[Fatal] Failed to start:', err);
  process.exit(1);
});
