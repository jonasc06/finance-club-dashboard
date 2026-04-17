const express = require('express');
const path    = require('path');
const { verifyPassword } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const match = await verifyPassword(password);
  if (match) { req.session.authenticated = true; return res.redirect('/'); }
  res.redirect('/login?error=1');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
