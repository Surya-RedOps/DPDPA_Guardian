const ScanResult = require('../models/ScanResult');
const ScanJob = require('../models/ScanJob');
const DataSource = require('../models/DataSource');
const BreachEvent = require('../models/BreachEvent');
const AuditLog = require('../models/AuditLog');
const { sendSuccess, sendError } = require('../utils/responseUtils');
const crypto = require('crypto');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const scans = await ScanJob.find({ orgId });
    const results = await ScanResult.find({ orgId });
    const sources = await DataSource.find({ orgId });
    const alerts = await require('../models/Alert').find({ orgId }).sort({ createdAt: -1 }).limit(10);

    // Calculate PII stats
    const totalPII = new Set();
    results.forEach(r => {
      if (r.detectedPII && Array.isArray(r.detectedPII)) {
        r.detectedPII.forEach(pii => {
          totalPII.add(`${pii.piiType}:${pii.maskedValue}`);
        });
      }
    });

    // Risk calculations
    const criticalCount = results.filter(r => r.sensitivityLevel === 'sensitive_personal').length;
    const highRiskCount = results.filter(r => r.riskScore >= 80).length;
    const mediumRiskCount = results.filter(r => r.riskScore >= 60 && r.riskScore < 80).length;
    const lowRiskCount = results.filter(r => r.riskScore < 60).length;
    const avgRisk = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.riskScore || 0), 0) / results.length) : 0;

    // Compliance score
    const encryptedCount = results.filter(r => r.isEncrypted).length;
    const consentCount = results.filter(r => r.hasConsentRecord).length;
    const totalResults = results.length;
    const encryptionScore = totalResults > 0 ? Math.round((encryptedCount / totalResults) * 100) : 0;
    const consentScore = totalResults > 0 ? Math.round((consentCount / totalResults) * 100) : 0;
    const complianceScore = Math.round((encryptionScore + consentScore + 50) / 3);

    // Scan trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const scansByDay = {};
    scans.forEach(scan => {
      if (scan.createdAt >= thirtyDaysAgo) {
        const day = scan.createdAt.toISOString().split('T')[0];
        if (!scansByDay[day]) scansByDay[day] = { piiFound: 0, scansRun: 0 };
        scansByDay[day].scansRun += 1;
      }
    });
    results.forEach(result => {
      if (result.createdAt >= thirtyDaysAgo) {
        const day = result.createdAt.toISOString().split('T')[0];
        if (!scansByDay[day]) scansByDay[day] = { piiFound: 0, scansRun: 0 };
        scansByDay[day].piiFound += (result.detectedPII?.length || 0);
      }
    });
    const scanTrend = Object.entries(scansByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, data]) => ({ _id: date, ...data }));

    // Risk breakdown by sensitivity
    const riskBreakdown = [
      { _id: 'sensitive_personal', count: criticalCount },
      { _id: 'personal', count: results.filter(r => r.sensitivityLevel === 'personal').length },
      { _id: 'internal', count: results.filter(r => r.sensitivityLevel === 'internal').length },
      { _id: 'public', count: results.filter(r => r.sensitivityLevel === 'public').length }
    ].filter(r => r.count > 0);

    // Active scans
    const activeScans = scans.filter(s => s.status === 'running' || s.status === 'pending').length;

    // Compliance pillars
    const compliancePillars = [
      { label: 'Consent Management', score: consentScore },
      { label: 'Principal Rights', score: Math.round((100 - (criticalCount / totalResults) * 100) || 0) },
      { label: 'Security Safeguards', score: encryptionScore },
      { label: 'Breach Notification', score: 85 }
    ];

    // Recent alerts
    const recentAlerts = (alerts || []).map(a => ({
      _id: a._id,
      title: a.title,
      severity: a.severity,
      createdAt: a.createdAt,
      isRead: a.isRead
    }));

    sendSuccess(res, {
      totalAssets: results.length,
      totalScans: scans.length,
      totalSources: sources.length,
      totalPIIFound: totalPII.size,
      avgRiskScore: avgRisk,
      complianceScore,
      criticalCount,
      activeScans,
      scanTrend: scanTrend.length > 0 ? scanTrend : [{ _id: 'No data', piiFound: 0, scansRun: 0 }],
      riskBreakdown: riskBreakdown.length > 0 ? riskBreakdown : [{ _id: 'No data', count: 0 }],
      compliancePillars,
      recentAlerts,
      summary: {
        total: results.length,
        critical: criticalCount,
        high: highRiskCount,
        medium: mediumRiskCount,
        low: lowRiskCount
      }
    });
  } catch (err) { next(err); }
};

exports.getComplianceScore = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const results = await ScanResult.find({ orgId });
    
    if (results.length === 0) {
      return sendSuccess(res, {
        score: 50,
        pillars: { consent: 50, rights: 50, obligations: 50, technical: 50 },
        checklist: [
          { _id: '1', section: 'Section 4', requirement: 'Lawful Processing', status: 'non_compliant', evidence: 'No data sources configured' },
          { _id: '2', section: 'Section 5', requirement: 'Notice Requirements', status: 'non_compliant', evidence: 'No consent records found' },
          { _id: '3', section: 'Section 6', requirement: 'Consent Management', status: 'non_compliant', evidence: 'No consent records found' },
          { _id: '4', section: 'Section 8', requirement: 'Security Safeguards', status: 'partial', evidence: 'No encryption detected' },
          { _id: '5', section: 'Section 9', requirement: 'Children Data Protection', status: 'compliant', evidence: 'No children data detected' },
          { _id: '6', section: 'Section 12', requirement: 'Data Subject Rights', status: 'partial', evidence: 'Partial implementation' }
        ]
      });
    }

    // Calculate compliance based on scan findings
    const criticalCount = results.filter(r => r.sensitivityLevel === 'sensitive_personal').length;
    const encryptedCount = results.filter(r => r.isEncrypted).length;
    const consentCount = results.filter(r => r.hasConsentRecord).length;
    const totalResults = results.length;

    // Section 4: Lawful Processing (based on consent records)
    const section4Status = consentCount > 0 ? 'compliant' : consentCount / totalResults > 0.5 ? 'partial' : 'non_compliant';
    const section4Score = (consentCount / totalResults) * 100;

    // Section 5: Notice Requirements (based on consent records)
    const section5Status = consentCount > 0 ? 'compliant' : 'partial';
    const section5Score = (consentCount / totalResults) * 100;

    // Section 6: Consent Management
    const section6Status = consentCount > 0 ? 'compliant' : 'non_compliant';
    const section6Score = (consentCount / totalResults) * 100;

    // Section 8: Security Safeguards (based on encryption)
    const section8Status = encryptedCount > totalResults * 0.8 ? 'compliant' : encryptedCount > 0 ? 'partial' : 'non_compliant';
    const section8Score = (encryptedCount / totalResults) * 100;

    // Section 9: Children Data Protection (assume compliant if no children data)
    const section9Status = 'compliant';
    const section9Score = 100;

    // Section 12: Data Subject Rights (based on critical data)
    const section12Status = criticalCount === 0 ? 'compliant' : criticalCount / totalResults < 0.3 ? 'partial' : 'non_compliant';
    const section12Score = Math.max(0, 100 - (criticalCount / totalResults) * 100);

    const overallScore = Math.round((section4Score + section5Score + section6Score + section8Score + section9Score + section12Score) / 6);

    const checklist = [
      { _id: '1', section: 'Section 4', requirement: 'Lawful Processing', status: section4Status, evidence: `${consentCount}/${totalResults} records with consent` },
      { _id: '2', section: 'Section 5', requirement: 'Notice Requirements', status: section5Status, evidence: `${consentCount}/${totalResults} records notified` },
      { _id: '3', section: 'Section 6', requirement: 'Consent Management', status: section6Status, evidence: `${consentCount}/${totalResults} records with valid consent` },
      { _id: '4', section: 'Section 8', requirement: 'Security Safeguards', status: section8Status, evidence: `${encryptedCount}/${totalResults} records encrypted` },
      { _id: '5', section: 'Section 9', requirement: 'Children Data Protection', status: section9Status, evidence: 'No children data detected' },
      { _id: '6', section: 'Section 12', requirement: 'Data Subject Rights', status: section12Status, evidence: `${criticalCount}/${totalResults} critical records found` }
    ];

    sendSuccess(res, {
      score: overallScore,
      pillars: {
        consent: Math.round((section4Score + section5Score + section6Score) / 3),
        rights: Math.round(section12Score),
        obligations: Math.round((section8Score + section9Score) / 2),
        technical: Math.round(section8Score)
      },
      checklist
    });
  } catch (err) { next(err); }
};

exports.updateComplianceItem = async (req, res, next) => {
  try {
    const { status } = req.body;
    sendSuccess(res, { id: req.params.id, status });
  } catch (err) { next(err); }
};

exports.getRiskDashboard = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const allResults = await ScanResult.find({ orgId });
    
    if (allResults.length === 0) {
      return sendSuccess(res, {
        overallRisk: 0,
        riskByType: [],
        topRiskyAssets: [],
        factors: {
          unencrypted: 0,
          noConsent: 0,
          highRisk: 0,
          criticalFindings: 0,
          mediumRisk: 0,
          lowRisk: 0
        },
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
      });
    }

    const piiTypeMap = {};
    allResults.forEach(result => {
      if (result.detectedPII && Array.isArray(result.detectedPII)) {
        result.detectedPII.forEach(pii => {
          const type = pii.piiType || 'UNKNOWN';
          if (!piiTypeMap[type]) {
            piiTypeMap[type] = { count: 0, totalRisk: 0 };
          }
          piiTypeMap[type].count += 1;
          piiTypeMap[type].totalRisk += result.riskScore || 0;
        });
      }
    });

    const riskByType = Object.entries(piiTypeMap)
      .map(([type, data]) => ({
        _id: type,
        count: data.count,
        avgRisk: Math.round(data.totalRisk / data.count)
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk);

    const topRiskyAssets = allResults
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 10);

    const criticalCount = allResults.filter(r => r.sensitivityLevel === 'sensitive_personal').length;
    const highRiskCount = allResults.filter(r => r.riskScore >= 80).length;
    const mediumRiskCount = allResults.filter(r => r.riskScore >= 60 && r.riskScore < 80).length;
    const lowRiskCount = allResults.filter(r => r.riskScore < 60).length;

    const totalRiskScore = allResults.reduce((sum, r) => sum + (r.riskScore || 0), 0);
    const avgRiskScore = Math.round(totalRiskScore / allResults.length);
    const overallRisk = Math.min(100, avgRiskScore);

    sendSuccess(res, {
      overallRisk,
      riskByType,
      topRiskyAssets,
      factors: {
        unencrypted: allResults.filter(r => !r.isEncrypted).length,
        noConsent: allResults.filter(r => !r.hasConsentRecord).length,
        highRisk: highRiskCount,
        criticalFindings: criticalCount,
        mediumRisk: mediumRiskCount,
        lowRisk: lowRiskCount
      },
      summary: {
        total: allResults.length,
        critical: criticalCount,
        high: highRiskCount,
        medium: mediumRiskCount,
        low: lowRiskCount
      }
    });
  } catch (err) { next(err); }
};

exports.getInventory = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const { sensitivity, skip = 0, limit = 20 } = req.query;
    
    let query = { orgId };
    if (sensitivity) query.sensitivityLevel = sensitivity;

    const findings = await ScanResult.find(query)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await ScanResult.countDocuments(query);

    sendSuccess(res, { findings, total, skip: parseInt(skip), limit: parseInt(limit) });
  } catch (err) { next(err); }
};

exports.updateFindingStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const finding = await ScanResult.findByIdAndUpdate(req.params.id, { remediationStatus: status }, { new: true });
    sendSuccess(res, finding);
  } catch (err) { next(err); }
};

exports.clearAllInventory = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    await ScanResult.deleteMany({ orgId });
    sendSuccess(res, { message: 'All inventory cleared' });
  } catch (err) { next(err); }
};

exports.getInventoryStats = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const results = await ScanResult.find({ orgId });

    const stats = {
      sensitive_personal: results.filter(r => r.sensitivityLevel === 'sensitive_personal').length,
      personal: results.filter(r => r.sensitivityLevel === 'personal').length,
      internal: results.filter(r => r.sensitivityLevel === 'internal').length,
      public: results.filter(r => r.sensitivityLevel === 'public').length
    };

    sendSuccess(res, stats);
  } catch (err) { next(err); }
};

exports.getBreaches = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const breaches = await BreachEvent.find({ orgId }).sort({ detectedAt: -1 });
    const formatted = breaches.map(b => ({
      _id: b._id,
      description: b.description,
      affectedRecords: b.estimatedAffectedCount,
      dataTypes: b.affectedDataTypes,
      reportedAt: b.detectedAt,
      notificationDeadline: b.notifyDeadline,
      status: b.status
    }));
    sendSuccess(res, formatted);
  } catch (err) { next(err); }
};

exports.createBreach = async (req, res, next) => {
  try {
    const { title, description, affectedRecords, dataTypes } = req.body;
    const breach = await BreachEvent.create({
      orgId: req.user.orgId,
      title: title || description,
      description,
      affectedDataTypes: dataTypes ? dataTypes.split(',').map(d => d.trim()) : [],
      estimatedAffectedCount: affectedRecords,
      detectedAt: new Date(),
      notifyDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000)
    });
    sendSuccess(res, breach, 'Breach logged', 201);
  } catch (err) { next(err); }
};

exports.getAuditLog = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const { skip = 0, limit = 50 } = req.query;
    
    const logs = await AuditLog.find({ orgId })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await AuditLog.countDocuments({ orgId });

    sendSuccess(res, { logs, total });
  } catch (err) { next(err); }
};

exports.verifyAuditChain = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const logs = await AuditLog.find({ orgId }).sort({ createdAt: 1 });

    let isValid = true;
    let previousHash = '0';

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(log.details) + previousHash)
        .digest('hex');

      if (log.hash !== expectedHash) {
        isValid = false;
        break;
      }
      previousHash = log.hash;
    }

    sendSuccess(res, { isValid, totalLogs: logs.length });
  } catch (err) { next(err); }
};

exports.deleteBreach = async (req, res, next) => {
  try {
    const breach = await BreachEvent.findByIdAndDelete(req.params.id);
    if (!breach) return sendError(res, 'Breach not found', 404);
    sendSuccess(res, { message: 'Breach deleted' });
  } catch (err) { next(err); }
};
