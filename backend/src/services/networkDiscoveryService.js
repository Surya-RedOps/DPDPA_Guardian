const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const mysql = require('mysql2/promise');
const { Client: PgClient } = require('pg');
const { MongoClient } = require('mongodb');
const DataSource = require('../models/DataSource');
const { encrypt } = require('./encryptionService');
const logger = require('../config/logger');

const execAsync = promisify(exec);

// Get local network IP range
function getLocalNetworkRange() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }
  return '192.168.1';
}

// Scan network for open database ports
async function scanNetwork(orgId) {
  const baseIP = getLocalNetworkRange();
  const ports = {
    3306: 'mysql',
    5432: 'postgresql',
    27017: 'mongodb',
    1433: 'mssql'
  };
  
  const discovered = [];
  logger.info(`[Network Discovery] Scanning ${baseIP}.0/24 for databases...`);

  // Scan common IPs (1-254)
  for (let i = 1; i <= 254; i++) {
    const ip = `${baseIP}.${i}`;
    
    for (const [port, type] of Object.entries(ports)) {
      try {
        // Quick port check using netcat or telnet
        const isWindows = os.platform() === 'win32';
        let cmd;
        
        if (isWindows) {
          cmd = `powershell -Command "Test-NetConnection -ComputerName ${ip} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`;
        } else {
          cmd = `timeout 1 bash -c "echo > /dev/tcp/${ip}/${port}" 2>/dev/null && echo "open" || echo "closed"`;
        }
        
        const { stdout } = await execAsync(cmd, { timeout: 2000 });
        const isOpen = isWindows ? stdout.trim() === 'True' : stdout.includes('open');
        
        if (isOpen) {
          logger.info(`[Network Discovery] Found ${type} at ${ip}:${port}`);
          discovered.push({ ip, port, type });
        }
      } catch (err) {
        // Port closed or timeout
      }
    }
  }

  // Also check localhost and docker host
  const localHosts = ['localhost', '127.0.0.1', 'host.docker.internal'];
  for (const host of localHosts) {
    for (const [port, type] of Object.entries(ports)) {
      try {
        const isWindows = os.platform() === 'win32';
        let cmd;
        
        if (isWindows) {
          cmd = `powershell -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`;
        } else {
          cmd = `timeout 1 bash -c "echo > /dev/tcp/${host}/${port}" 2>/dev/null && echo "open" || echo "closed"`;
        }
        
        const { stdout } = await execAsync(cmd, { timeout: 2000 });
        const isOpen = isWindows ? stdout.trim() === 'True' : stdout.includes('open');
        
        if (isOpen) {
          logger.info(`[Network Discovery] Found ${type} at ${host}:${port}`);
          discovered.push({ ip: host, port, type });
        }
      } catch (err) {
        // Port closed
      }
    }
  }

  return discovered;
}

// Try to connect with common credentials
async function tryConnect(host, port, type) {
  const commonCreds = [
    { user: 'root', password: 'root' },
    { user: 'root', password: '' },
    { user: 'admin', password: 'admin' },
    { user: 'postgres', password: 'postgres' },
    { user: 'postgres', password: '' },
    { user: '', password: '' }
  ];

  for (const cred of commonCreds) {
    try {
      if (type === 'mysql') {
        const conn = await mysql.createConnection({
          host, port, user: cred.user, password: cred.password,
          connectTimeout: 3000
        });
        const [dbs] = await conn.execute('SHOW DATABASES');
        await conn.end();
        return { success: true, user: cred.user, password: cred.password, databases: dbs.map(d => d.Database) };
      }
      
      if (type === 'postgresql') {
        const client = new PgClient({
          host, port, user: cred.user, password: cred.password,
          database: 'postgres', connectionTimeoutMillis: 3000
        });
        await client.connect();
        const { rows } = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
        await client.end();
        return { success: true, user: cred.user, password: cred.password, databases: rows.map(r => r.datname) };
      }
      
      if (type === 'mongodb') {
        const uri = cred.user
          ? `mongodb://${encodeURIComponent(cred.user)}:${encodeURIComponent(cred.password)}@${host}:${port}`
          : `mongodb://${host}:${port}`;
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
        await client.connect();
        const admin = client.db().admin();
        const { databases } = await admin.listDatabases();
        await client.close();
        return { success: true, user: cred.user, password: cred.password, databases: databases.map(d => d.name) };
      }
    } catch (err) {
      // Try next credential
    }
  }
  
  return { success: false };
}

// Auto-register discovered sources
async function autoRegisterSources(orgId, userId) {
  const discovered = await scanNetwork(orgId);
  const registered = [];

  for (const { ip, port, type } of discovered) {
    const connection = await tryConnect(ip, port, type);
    
    if (connection.success && connection.databases) {
      for (const dbName of connection.databases) {
        // Skip system databases
        if (['information_schema', 'mysql', 'performance_schema', 'sys', 'postgres', 'template0', 'template1', 'admin', 'local', 'config'].includes(dbName)) {
          continue;
        }

        const credentials = {
          host: ip,
          port: parseInt(port),
          username: connection.user,
          password: connection.password,
          database: dbName
        };

        // Check if already exists
        const existing = await DataSource.findOne({
          orgId,
          type,
          name: `${type.toUpperCase()} - ${ip}:${port}/${dbName}`
        });

        if (!existing) {
          const source = await DataSource.create({
            orgId,
            createdBy: userId,
            name: `${type.toUpperCase()} - ${ip}:${port}/${dbName}`,
            type,
            credentials: encrypt(JSON.stringify(credentials)),
            healthStatus: 'healthy',
            autoDiscovered: true
          });
          
          registered.push(source);
          logger.info(`[Auto-Register] Added ${type} source: ${ip}:${port}/${dbName}`);
        }
      }
    }
  }

  // Auto-register S3 bucket if AWS credentials are available
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    const s3Existing = await DataSource.findOne({
      orgId,
      type: 's3',
      name: 'S3 - datasentinel-vulnerable-test-bucket'
    });

    if (!s3Existing) {
      const s3Credentials = {
        bucket: 'datasentinel-vulnerable-test-bucket',
        region: process.env.AWS_REGION || 'ap-south-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        prefix: ''
      };

      const s3Source = await DataSource.create({
        orgId,
        createdBy: userId,
        name: 'S3 - datasentinel-vulnerable-test-bucket',
        type: 's3',
        credentials: encrypt(JSON.stringify(s3Credentials)),
        healthStatus: 'healthy',
        autoDiscovered: true
      });

      registered.push(s3Source);
      logger.info('[Auto-Register] Added S3 bucket: datasentinel-vulnerable-test-bucket');
    }
  }

  return registered;
}

// Scan local file systems (employee laptops)
async function scanLocalFileSystem(orgId, userId) {
  const isWindows = os.platform() === 'win32';
  const sensitivePatterns = [
    '*.env',
    '*.pem',
    '*.key',
    '*credentials*',
    '*password*',
    '*secret*',
    'id_rsa',
    'id_dsa'
  ];

  const searchPaths = isWindows
    ? ['C:\\Users', 'C:\\ProgramData', 'D:\\']
    : ['/home', '/var', '/opt'];

  const foundFiles = [];

  for (const basePath of searchPaths) {
    for (const pattern of sensitivePatterns) {
      try {
        let cmd;
        if (isWindows) {
          cmd = `powershell -Command "Get-ChildItem -Path '${basePath}' -Filter '${pattern}' -Recurse -ErrorAction SilentlyContinue -Depth 3 | Select-Object -First 50 | ForEach-Object { $_.FullName }"`;
        } else {
          cmd = `find ${basePath} -name '${pattern}' -type f 2>/dev/null | head -50`;
        }

        const { stdout } = await execAsync(cmd, { timeout: 30000 });
        const files = stdout.split('\n').filter(f => f.trim());
        foundFiles.push(...files);
      } catch (err) {
        // Path not accessible or timeout
      }
    }
  }

  if (foundFiles.length > 0) {
    // Create a local file source with discovered files
    const existing = await DataSource.findOne({
      orgId,
      type: 'local',
      name: 'Auto-Discovered Local Files'
    });

    if (!existing) {
      const credentials = {
        files: foundFiles.slice(0, 100).map(f => ({
          name: f.split(/[/\\]/).pop(),
          path: f,
          size: 0
        }))
      };

      const source = await DataSource.create({
        orgId,
        createdBy: userId,
        name: 'Auto-Discovered Local Files',
        type: 'local',
        credentials: encrypt(JSON.stringify(credentials)),
        healthStatus: 'healthy',
        autoDiscovered: true
      });

      logger.info(`[Auto-Register] Added ${foundFiles.length} local sensitive files`);
      return source;
    }
  }

  return null;
}

module.exports = {
  scanNetwork,
  autoRegisterSources,
  scanLocalFileSystem
};
