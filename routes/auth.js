const express = require('express');
const path    = require('path');
const { verifyPassword } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const role = await verifyPassword(password);
  if (role) {
    req.session.authenticated = true;
    req.session.role = role;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

router.get('/api/me', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ role: req.session.role || 'admin' });
  }
  res.status(401).json({ role: null });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
