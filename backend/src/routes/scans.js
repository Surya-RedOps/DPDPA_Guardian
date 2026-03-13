const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scanController');
const { auth } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');

router.use(auth);
router.get('/', ctrl.getScans);
router.post('/', auditLog('SCAN_STARTED', 'scan'), ctrl.startScan);
router.get('/active', ctrl.getActiveScans);
router.get('/stats', ctrl.getScanStats);
router.get('/:id', ctrl.getScan);
router.get('/:id/results', ctrl.getScanResults);
router.post('/:id/cancel', auditLog('SCAN_CANCELLED', 'scan'), ctrl.cancelScan);

module.exports = router;
