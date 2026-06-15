const fs   = require('fs');
const path = require('path');
const config = require('../config');
const storage = require('./storage');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function ensureDataDir() {
  if (!IS_PRODUCTION) {
    [config.DATA_DIR, config.IG_IMAGES, config.LI_IMAGES, config.TT_IMAGES].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
  }
  // In production: no local dirs needed — everything goes to GCS
}

function migrateDataFiles() {
  // Migration only makes sense locally (no legacy files on App Engine)
  if (IS_PRODUCTION) return;

  ensureDataDir();

  // Migrate cache.json → ig_cache.json
  if (fs.existsSync(config.LEGACY_CACHE_FILE) && !fs.existsSync(config.IG_CACHE_FILE)) {
    console.log('[Migration] Renaming cache.json → ig_cache.json');
    fs.renameSync(config.LEGACY_CACHE_FILE, config.IG_CACHE_FILE);
  }

  // Migrate history.json → ig_history.json
  if (fs.existsSync(config.LEGACY_HISTORY_FILE) && !fs.existsSync(config.IG_HISTORY_FILE)) {
    console.log('[Migration] Renaming history.json → ig_history.json');
    fs.renameSync(config.LEGACY_HISTORY_FILE, config.IG_HISTORY_FILE);
  }

  // Move images from data/images/*.jpg → data/images/ig/*.jpg
  if (fs.existsSync(config.LEGACY_IMAGES_DIR)) {
    const files = fs.readdirSync(config.LEGACY_IMAGES_DIR);
    files.forEach(f => {
      const full = path.join(config.LEGACY_IMAGES_DIR, f);
      if (fs.statSync(full).isFile()) {
        const dest = path.join(config.IG_IMAGES, f);
        if (!fs.existsSync(dest)) {
          console.log(`[Migration] Moving image ${f} → images/ig/`);
          fs.renameSync(full, dest);
        }
      }
    });
  }

  // Patch old image paths in ig_cache.json
  if (fs.existsSync(config.IG_CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(config.IG_CACHE_FILE, 'utf8');
      if (raw.includes('/data/images/') && !raw.includes('/data/images/ig/')) {
        console.log('[Migration] Patching image paths in ig_cache.json...');
        const patched = raw.replace(/\/data\/images\/(?!ig\/|li\/)/g, '/data/images/ig/');
        fs.writeFileSync(config.IG_CACHE_FILE, patched);
      }
    } catch (e) {
      console.error('[Migration] Failed to patch ig_cache.json paths:', e.message);
    }
  }
}

// ── JSON read/write — delegates to GCS in production, disk locally ──

async function readJSON(filepath, fallback) {
  return storage.readJSON(filepath, fallback);
}

async function writeJSON(filepath, data) {
  return storage.writeJSON(filepath, data);
}

module.exports = { ensureDataDir, migrateDataFiles, readJSON, writeJSON };
