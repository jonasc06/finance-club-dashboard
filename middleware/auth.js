const session = require('express-session');
const bcrypt  = require('bcrypt');
const config  = require('../config');

const PASSWORD_HASH = bcrypt.hashSync(config.DASHBOARD_PASSWORD, 10);

function sessionMiddleware() {
  return session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 },
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

function verifyCron(req, res, next) {
  // Allow if authenticated session (manual trigger from browser)
  if (req.session && req.session.authenticated) return next();

  // Allow if valid CRON_SECRET is provided
  const token = req.headers['x-cron-secret'] || req.query.secret;
  if (config.CRON_SECRET && token === config.CRON_SECRET) return next();

  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

async function verifyPassword(password) {
  return bcrypt.compare(password, PASSWORD_HASH);
}

module.exports = { sessionMiddleware, requireAuth, verifyCron, verifyPassword };
