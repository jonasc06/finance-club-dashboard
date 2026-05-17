const cookieSession = require('cookie-session');
const bcrypt  = require('bcrypt');
const config  = require('../config');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let _passwordHash = null;
function getPasswordHash() {
  if (!_passwordHash) {
    _passwordHash = bcrypt.hashSync(config.DASHBOARD_PASSWORD, 10);
  }
  return _passwordHash;
}

let _marketingHash = null;
function getMarketingHash() {
  if (!_marketingHash && config.MARKETING_PASSWORD) {
    _marketingHash = bcrypt.hashSync(config.MARKETING_PASSWORD, 10);
  }
  return _marketingHash;
}


function sessionMiddleware() {
  return cookieSession({
    name: 'session',
    keys: [config.SESSION_SECRET],
    maxAge: 8 * 60 * 60 * 1000,
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'lax',
  });
}


function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.authenticated) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }
    const userRole = req.session.role || 'admin';
    if (roles.includes(userRole)) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.status(403).send(accessDeniedHTML());
  };
}

function accessDeniedHTML() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Access Denied</title>
<style>
  body{font-family:'Nunito Sans',sans-serif;background:#080b12;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
  .card{background:#111827;border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:48px;max-width:420px}
  h1{font-size:1.4rem;margin-bottom:8px;color:#fb7185}
  p{color:#94a3b8;margin-bottom:24px}
  a{color:#10b981;text-decoration:none;font-weight:600}
  a:hover{text-decoration:underline}
</style></head><body><div class="card"><h1>Access Denied</h1><p>You do not have permission to view this page.</p><a href="/">Back to Dashboard</a></div></body></html>`;
}

function verifyCron(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.headers['x-appengine-cron'] === 'true') return next();
  const token = req.headers['x-cron-secret'] || req.query.secret;
  if (config.CRON_SECRET && token === config.CRON_SECRET) return next();
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

async function verifyPassword(password) {
  if (await bcrypt.compare(password, getPasswordHash())) {
    return 'admin';
  }
  const mktHash = getMarketingHash();
  if (mktHash && await bcrypt.compare(password, mktHash)) {
    return 'marketing';
  }
  return null;
}

module.exports = { sessionMiddleware, requireAuth, requireRole, verifyCron, verifyPassword };
