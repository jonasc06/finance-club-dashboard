const express = require('express');
const path    = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/instagram', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'insta.html'));
});

router.get('/linkedin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'linkedin.html'));
});

module.exports = router;
