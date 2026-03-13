const ScanJob = require('../models/ScanJob');
const ScanResult = require('../models/ScanResult');
const DataSource = require('../models/DataSource');
const Organization = require('../models/Organization');
const { detectPII } = require('./aiService');
const { decrypt } = require('./encryptionService');
const { emitToOrg } = require('./socketService');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const { google } = require('googleapis');

async function runScan(jobId) {
  let job = await ScanJob.findById(jobId).populate('connectorId');
  if (!job) return;

  try {
    job.status = 'running';
    job.startedAt = new Date();
    await job.save();
    emitToOrg(job.orgId.toString(), 'scan:progress', { scanId: jobId.toString(), status: 'running', progress: 0 });

    const source = job.connectorId;
    const credentials = JSON.parse(decrypt(source.credentials));
    
    let records = [];
    
    switch (source.type) {
      case 'mysql':
      case 'postgresql':
        records = await scanDatabase(source, credentials);
        break;
      case 'mongodb':
        records = await scanMongoDB(source, credentials);
        break;
      case 's3':
        records = await scanS3(source, credentials);
        break;
      case 'google_drive':
        records = await scanGoogleDrive(source, credentials);
        break;
      case 'local':
      case 'file_system':
        records = await scanLocalFileSystem(source, credentials);
        break;
      default:
        throw new Error(`Unsupported source type: ${source.type}`);
    }
    
    let totalPII = 0;
    let totalRecords = records.length;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      const detected = await detectPII(record.content);
      
      const findings = detected.detections || [];
      
      if (findings.length > 0) {
        totalPII += findings.length;
        
        await ScanResult.create({
          orgId: job.orgId,
          scanJobId: job._id,
          dataSourceId: source._id,
          assetPath: record.path,
          fileName: record.name,
          detectedPII: findings.map(f => ({
            piiType: f.pii_type,
            maskedValue: f.masked_value,
            confidence: f.confidence,
            contextSnippet: f.context
          })),
          sensitivityLevel: calculateSensitivity(findings),
          riskScore: calculateRiskScore(findings)
        });
      }
      
      const progress = Math.round(((i + 1) / totalRecords) * 100);
      job.progress = progress;
      await job.save();
      emitToOrg(job.orgId.toString(), 'scan:progress', { scanId: jobId.toString(), status: 'running', progress });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    job.totalFilesScanned = totalRecords;
    job.totalPIIFound = totalPII;
    job.progress = 100;
    await job.save();

    await Organization.findByIdAndUpdate(job.orgId, {
      $inc: { totalScans: 1, totalPIIFound: totalPII }
    });

    emitToOrg(job.orgId.toString(), 'scan:progress', { 
      scanId: jobId.toString(),
      status: 'completed', 
      progress: 100,
      totalRecords,
      totalPII
    });

    logger.info(`Scan ${jobId} completed: ${totalPII} PII found in ${totalRecords} records`);
  } catch (error) {
    logger.error(`Scan ${jobId} failed:`, error);
    job.status = 'failed';
    job.error = error.message;
    await job.save();
    emitToOrg(job.orgId.toString(), 'scan:progress', { scanId: jobId.toString(), status: 'failed', error: error.message });
  }
}

async function scanDatabase(source, credentials) {
  const records = [];
  
  try {
    if (source.type === 'mysql') {
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: credentials.host,
        port: credentials.port || 3306,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database
      });
      
      const [tables] = await connection.query('SHOW TABLES');
      
      for (const tableRow of tables.slice(0, 10)) {
        const tableName = Object.values(tableRow)[0];
        const [rows] = await connection.query(`SELECT * FROM ${tableName} LIMIT 100`);
        
        for (const row of rows) {
          records.push({
            name: tableName,
            path: `/${credentials.database}/${tableName}`,
            content: JSON.stringify(row)
          });
        }
      }
      
      await connection.end();
    } else if (source.type === 'postgresql') {
      const { Client } = require('pg');
      const client = new Client({
        host: credentials.host,
        port: credentials.port || 5432,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database
      });
      
      await client.connect();
      
      const tablesResult = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' LIMIT 10
      `);
      
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.tablename;
        const result = await client.query(`SELECT * FROM ${tableName} LIMIT 100`);
        
        for (const row of result.rows) {
          records.push({
            name: tableName,
            path: `/${credentials.database}/${tableName}`,
            content: JSON.stringify(row)
          });
        }
      }
      
      await client.end();
    }
  } catch (error) {
    logger.error('Database scan error:', error);
    throw error;
  }
  
  return records;
}

async function scanMongoDB(source, credentials) {
  const records = [];
  
  try {
    let uri;
    
    if (credentials.connectionString) {
      uri = credentials.connectionString;
    } else if (credentials.username && credentials.password) {
      uri = `mongodb://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port || 27017}/${credentials.database}`;
    } else {
      // No authentication
      uri = `mongodb://${credentials.host}:${credentials.port || 27017}/${credentials.database}`;
    }
    
    logger.info(`Connecting to MongoDB: ${uri.replace(/:[^:@]+@/, ':***@')}`);
    
    const client = await mongoose.createConnection(uri).asPromise();
    const db = client.db;
    
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in ${credentials.database}`);
    
    for (const collInfo of collections.slice(0, 10)) {
      const collection = db.collection(collInfo.name);
      const docs = await collection.find().limit(100).toArray();
      
      logger.info(`Scanning collection ${collInfo.name}: ${docs.length} documents`);
      
      for (const doc of docs) {
        records.push({
          name: collInfo.name,
          path: `/${credentials.database}/${collInfo.name}/${doc._id}`,
          content: JSON.stringify(doc)
        });
      }
    }
    
    await client.close();
    logger.info(`MongoDB scan completed: ${records.length} documents found`);
  } catch (error) {
    logger.error('MongoDB scan error:', error);
    throw error;
  }
  
  return records;
}

async function scanS3(source, credentials) {
  const records = [];
  
  try {
    const s3 = new AWS.S3({
      accessKeyId: credentials.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      region: credentials.region || process.env.AWS_REGION || 'us-east-1'
    });
    
    const bucketName = credentials.bucket;
    const listResult = await s3.listObjectsV2({ Bucket: bucketName, MaxKeys: 50 }).promise();
    
    for (const obj of listResult.Contents || []) {
      if (obj.Size > 10 * 1024 * 1024) continue; // Skip files > 10MB
      
      try {
        const data = await s3.getObject({ Bucket: bucketName, Key: obj.Key }).promise();
        const content = data.Body.toString('utf-8');
        
        records.push({
          name: obj.Key.split('/').pop(),
          path: `/${bucketName}/${obj.Key}`,
          content: content.substring(0, 50000) // Limit to 50KB
        });
      } catch (err) {
        logger.warn(`Failed to read S3 object ${obj.Key}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('S3 scan error:', error);
    throw error;
  }
  
  return records;
}

async function scanGoogleDrive(source, credentials) {
  const records = [];
  
  try {
    const auth = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret
    );
    
    auth.setCredentials({
      refresh_token: credentials.refreshToken
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const response = await drive.files.list({
      pageSize: 50,
      fields: 'files(id, name, mimeType)',
      q: "mimeType='text/plain' or mimeType='text/csv' or mimeType contains 'document' or mimeType contains 'spreadsheet'"
    });
    
    for (const file of response.data.files || []) {
      try {
        const fileData = await drive.files.get({
          fileId: file.id,
          alt: 'media'
        }, { responseType: 'text' });
        
        records.push({
          name: file.name,
          path: `/drive/${file.name}`,
          content: String(fileData.data).substring(0, 50000)
        });
      } catch (err) {
        logger.warn(`Failed to read Drive file ${file.name}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('Google Drive scan error:', error);
    throw error;
  }
  
  return records;
}

async function scanLocalFileSystem(source, credentials) {
  const records = [];
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const basePath = credentials.path || '/app';
    logger.info(`Scanning local file system at: ${basePath}`);
    
    async function scanDirectory(dirPath, depth = 0) {
      if (depth > 3) return;
      
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        logger.info(`Found ${entries.length} entries in ${dirPath}`);
        
        for (const entry of entries.slice(0, 50)) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              if (stats.size > 10 * 1024 * 1024) continue;
              
              const content = await fs.readFile(fullPath, 'utf-8');
              records.push({
                name: entry.name,
                path: fullPath,
                content: content.substring(0, 50000)
              });
              logger.info(`Added file: ${fullPath}`);
            } catch (err) {
              logger.warn(`Cannot read file ${fullPath}: ${err.message}`);
            }
          } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath, depth + 1);
          }
          
          if (records.length >= 100) break;
        }
      } catch (err) {
        logger.warn(`Cannot read directory ${dirPath}: ${err.message}`);
      }
    }
    
    await scanDirectory(basePath);
    logger.info(`Local scan completed: ${records.length} files found`);
  } catch (error) {
    logger.error('Local file system scan error:', error);
    throw error;
  }
  
  return records;
}

function calculateSensitivity(findings) {
  const sensitivePII = ['AADHAAR', 'PAN', 'PASSPORT', 'CREDIT_CARD', 'DRIVING_LICENSE'];
  const hasSensitive = findings.some(f => sensitivePII.includes(f.pii_type));
  return hasSensitive ? 'sensitive_personal' : 'personal';
}

function calculateRiskScore(findings) {
  const weights = {
    AADHAAR: 10, PAN: 9, PASSPORT: 9, CREDIT_CARD: 10, DRIVING_LICENSE: 8,
    MOBILE: 6, EMAIL: 5, NAME: 4, DOB: 7, VOTER_ID: 7,
    GSTIN: 6, UPI: 6, IFSC: 5
  };
  
  let score = 0;
  findings.forEach(f => {
    score += weights[f.pii_type] || 3;
  });
  
  return Math.min(Math.round(score / findings.length * 10), 100);
}

module.exports = { runScan };
