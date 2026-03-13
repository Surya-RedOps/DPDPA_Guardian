const cron = require('node-cron');
const ScanJob = require('../models/ScanJob');
const DataSource = require('../models/DataSource');
const Organisation = require('../models/Organization');
const { runScan } = require('./scanService');
const { autoRegisterSources, scanLocalFileSystem } = require('./networkDiscoveryService');
const logger = require('../config/logger');

// Network discovery - every 6 hours
cron.schedule('0 */6 * * *', async () => {
  logger.info('[Scheduler] Running network discovery...');
  
  try {
    const orgs = await Organisation.find({ isActive: true });
    
    for (const org of orgs) {
      const admin = org.createdBy || org._id;
      
      // Discover network databases
      const sources = await autoRegisterSources(org._id, admin);
      logger.info(`[Scheduler] Discovered ${sources.length} new sources for org ${org.name}`);
      
      // Discover local sensitive files
      await scanLocalFileSystem(org._id, admin);
    }
  } catch (err) {
    logger.error('[Scheduler] Network discovery failed:', err);
  }
});

// Automated scans - every 2 hours for all sources
cron.schedule('0 */2 * * *', async () => {
  logger.info('[Scheduler] Running automated scans...');
  
  try {
    const sources = await DataSource.find({ healthStatus: { $ne: 'error' } });
    
    for (const source of sources) {
      // Check if there's already a running scan for this source
      const existingScan = await ScanJob.findOne({
        connectorId: source._id,
        status: { $in: ['queued', 'running'] }
      });
      
      if (existingScan) {
        logger.info(`[Scheduler] Skipping ${source.name} - scan already running`);
        continue;
      }
      
      // Create and run scan
      const job = await ScanJob.create({
        orgId: source.orgId,
        connectorId: source._id,
        name: `Auto-Scan: ${source.name}`,
        scanType: 'full',
        status: 'queued',
        progress: 0,
        totalFilesScanned: 0,
        totalPIIFound: 0,
        criticalFindings: 0,
        highFindings: 0,
        mediumFindings: 0,
        lowFindings: 0,
        scheduledScan: true
      });
      
      logger.info(`[Scheduler] Starting scan for ${source.name}`);
      
      // Run scan asynchronously
      runScan(job._id.toString()).catch(err => {
        logger.error(`[Scheduler] Scan failed for ${source.name}:`, err);
      });
      
      // Add delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (err) {
    logger.error('[Scheduler] Automated scan failed:', err);
  }
});

// Deep scan - daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('[Scheduler] Running daily deep scan...');
  
  try {
    const sources = await DataSource.find({ healthStatus: { $ne: 'error' } });
    
    for (const source of sources) {
      const job = await ScanJob.create({
        orgId: source.orgId,
        connectorId: source._id,
        name: `Deep Scan: ${source.name}`,
        scanType: 'deep',
        status: 'queued',
        progress: 0,
        totalFilesScanned: 0,
        totalPIIFound: 0,
        criticalFindings: 0,
        highFindings: 0,
        mediumFindings: 0,
        lowFindings: 0,
        scheduledScan: true
      });
      
      logger.info(`[Scheduler] Starting deep scan for ${source.name}`);
      runScan(job._id.toString()).catch(err => {
        logger.error(`[Scheduler] Deep scan failed for ${source.name}:`, err);
      });
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } catch (err) {
    logger.error('[Scheduler] Deep scan failed:', err);
  }
});

// Cleanup old scans - weekly on Sunday at 3 AM
cron.schedule('0 3 * * 0', async () => {
  logger.info('[Scheduler] Cleaning up old scan jobs...');
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await ScanJob.deleteMany({
      status: { $in: ['completed', 'failed'] },
      completedAt: { $lt: thirtyDaysAgo }
    });
    
    logger.info(`[Scheduler] Deleted ${result.deletedCount} old scan jobs`);
  } catch (err) {
    logger.error('[Scheduler] Cleanup failed:', err);
  }
});

logger.info('[Scheduler] Automated tasks initialized:');
logger.info('  - Network discovery: Every 6 hours');
logger.info('  - Auto scans: Every 2 hours');
logger.info('  - Deep scans: Daily at 2 AM');
logger.info('  - Cleanup: Weekly on Sunday at 3 AM');

module.exports = {};
