const express = require('express');
const path    = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

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

router.get('/tiktok', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tiktok.html'));
});

router.get('/easyverein', requireRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'easyverein.html'));
});

router.get('/finance', requireRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'finance.html'));
});

router.get('/sponsors', requireRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'sponsors.html'));
});

module.exports = router;
