require('dotenv').config();
const path = require('path');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BASE_DIR = IS_PRODUCTION ? '/tmp' : __dirname + '/..';

module.exports = {
  get PORT()               { return process.env.PORT || 8080; },
  get APIFY_TOKEN()        { return process.env.APIFY_TOKEN || ''; },
  get IG_USERNAME()        { return process.env.INSTAGRAM_USERNAME || ''; },
  get LI_COMPANY_URL()     { return process.env.LINKEDIN_COMPANY_URL || ''; },
  get DASHBOARD_PASSWORD() { return process.env.DASHBOARD_PASSWORD || ''; },
  get MARKETING_PASSWORD() { return process.env.MARKETING_PASSWORD || ''; },
  get SESSION_SECRET()     { return process.env.SESSION_SECRET || ''; },
  get CRON_SECRET()        { return process.env.CRON_SECRET || ''; },
  get EASYVEREIN_TOKEN()   { return process.env.EASYVEREIN_SECRET || ''; },

  DATA_DIR:    path.join(BASE_DIR, 'data'),
  IG_IMAGES:   path.join(BASE_DIR, 'data', 'images', 'ig'),
  LI_IMAGES:   path.join(BASE_DIR, 'data', 'images', 'li'),
  IG_CACHE_FILE:   path.join(BASE_DIR, 'data', 'ig_cache.json'),
  IG_HISTORY_FILE: path.join(BASE_DIR, 'data', 'ig_history.json'),
  LI_CACHE_FILE:   path.join(BASE_DIR, 'data', 'li_cache.json'),
  LI_HISTORY_FILE: path.join(BASE_DIR, 'data', 'li_history.json'),
  EV_CACHE_FILE:   path.join(BASE_DIR, 'data', 'ev_cache.json'),
  EV_HISTORY_FILE: path.join(BASE_DIR, 'data', 'ev_history.json'),

  LEGACY_CACHE_FILE:   path.join(BASE_DIR, 'data', 'cache.json'),
  LEGACY_HISTORY_FILE: path.join(BASE_DIR, 'data', 'history.json'),
  LEGACY_IMAGES_DIR:   path.join(BASE_DIR, 'data', 'images'),
};
