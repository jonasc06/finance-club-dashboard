require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 1000,
  APIFY_TOKEN: process.env.APIFY_TOKEN || '',
  IG_USERNAME: process.env.INSTAGRAM_USERNAME || 'finance.club.leipzig',
  LI_COMPANY_URL: process.env.LINKEDIN_COMPANY_URL || '',
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || 'ChangeMe123!',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-me',
  CRON_SECRET: process.env.CRON_SECRET || '',

  // Paths
  DATA_DIR:    path.join(__dirname, '..', 'data'),
  IG_IMAGES:   path.join(__dirname, '..', 'data', 'images', 'ig'),
  LI_IMAGES:   path.join(__dirname, '..', 'data', 'images', 'li'),
  IG_CACHE_FILE:   path.join(__dirname, '..', 'data', 'ig_cache.json'),
  IG_HISTORY_FILE: path.join(__dirname, '..', 'data', 'ig_history.json'),
  LI_CACHE_FILE:   path.join(__dirname, '..', 'data', 'li_cache.json'),
  LI_HISTORY_FILE: path.join(__dirname, '..', 'data', 'li_history.json'),

  // Legacy (migration)
  LEGACY_CACHE_FILE:   path.join(__dirname, '..', 'data', 'cache.json'),
  LEGACY_HISTORY_FILE: path.join(__dirname, '..', 'data', 'history.json'),
  LEGACY_IMAGES_DIR:   path.join(__dirname, '..', 'data', 'images'),
};
