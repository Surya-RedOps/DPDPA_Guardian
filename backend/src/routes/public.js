const express = require('express');
const router = express.Router();
const { publicDetectLimiter } = require('../middleware/rateLimiter');

router.post('/detect', publicDetectLimiter, (req, res) => {
  res.json({ success: true, message: 'Demo detection available' });
});

router.post('/waitlist', (req, res) => {
  res.json({ success: true, message: 'Added to waitlist!' });
});

router.post('/contact', (req, res) => {
  res.json({ success: true, message: 'Message received. We will be in touch.' });
});

module.exports = router;
