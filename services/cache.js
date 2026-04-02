const fs   = require('fs');
const path = require('path');
const config = require('../config');

function ensureDataDir() {
  [config.DATA_DIR, config.IG_IMAGES, config.LI_IMAGES].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function migrateDataFiles() {
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

// Generic JSON read/write helpers
function readJSON(filepath, fallback) {
  try {
    if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {}
  return fallback;
}

function writeJSON(filepath, data) {
  ensureDataDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

module.exports = { ensureDataDir, migrateDataFiles, readJSON, writeJSON };
