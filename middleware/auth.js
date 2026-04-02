const session = require('express-session');
const bcrypt  = require('bcrypt');
const config  = require('../config');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Lazy hash — computed on first use (after secrets are loaded)
let _passwordHash = null;
function getPasswordHash() {
  if (!_passwordHash) {
    _passwordHash = bcrypt.hashSync(config.DASHBOARD_PASSWORD, 10);
  }
  return _passwordHash;
}

function sessionMiddleware() {
  return session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000,
      secure: IS_PRODUCTION,
      httpOnly: true,
      sameSite: 'lax',
    },
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

function verifyCron(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.headers['x-appengine-cron'] === 'true') return next();
  const token = req.headers['x-cron-secret'] || req.query.secret;
  if (config.CRON_SECRET && token === config.CRON_SECRET) return next();
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

async function verifyPassword(password) {
  return bcrypt.compare(password, getPasswordHash());
}

module.exports = { sessionMiddleware, requireAuth, verifyCron, verifyPassword };
