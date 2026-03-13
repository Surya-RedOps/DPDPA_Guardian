const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.use(auth);
router.get('/stats', ctrl.getDashboardStats);
router.get('/compliance', ctrl.getComplianceScore);
router.patch('/compliance/:id', ctrl.updateComplianceItem);
router.get('/risk', ctrl.getRiskDashboard);
router.get('/inventory', ctrl.getInventory);
router.patch('/inventory/:id', ctrl.updateFindingStatus);
router.delete('/inventory/clear', ctrl.clearAllInventory);
router.get('/inventory/stats', ctrl.getInventoryStats);
router.get('/breaches', ctrl.getBreaches);
router.post('/breaches', ctrl.createBreach);
router.delete('/breaches/:id', ctrl.deleteBreach);
router.get('/audit', ctrl.getAuditLog);
router.get('/audit/verify', ctrl.verifyAuditChain);

module.exports = router;
