# 🔄 DataSentinel - Complete Product Workflow
## End-to-End Flow Explanation

---

## 📋 TABLE OF CONTENTS
1. [System Architecture Overview](#system-architecture-overview)
2. [User Journey Workflow](#user-journey-workflow)
3. [Technical Data Flow](#technical-data-flow)
4. [Core Workflows](#core-workflows)
5. [Component Interactions](#component-interactions)
6. [Real-time Updates](#real-time-updates)
7. [Security Flow](#security-flow)

---

## 🏗 SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                         │
│                    (React Frontend :5173)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    NGINX Reverse Proxy :80                   │
│              (Routes traffic to services)                    │
└────────┬──────────────────────┬─────────────────────────────┘
         │                      │
         ▼                      ▼
┌────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Backend      │◄──►│   AI Engine     │    │   Socket.io  │
│   Node.js      │    │   Python        │    │   Real-time  │
│   :3000        │    │   :8000         │    │   Updates    │
└────────┬───────┘    └─────────────────┘    └──────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│         Data Layer                     │
│  ┌──────────┐      ┌──────────┐      │
│  │ MongoDB  │      │  Redis   │      │
│  │ :27017   │      │  :6379   │      │
│  │ (Data)   │      │ (Cache)  │      │
│  └──────────┘      └──────────┘      │
└────────────────────────────────────────┘
```

---

## 👤 USER JOURNEY WORKFLOW

### **PHASE 1: ONBOARDING (First-time User)**

```
Step 1: User visits http://localhost:5173
   ↓
Step 2: Lands on Landing Page
   - Sees hero section with value proposition
   - Reads about DPDPA 2023 compliance
   - Views features and benefits
   ↓
Step 3: Clicks "Get Started" button
   ↓
Step 4: Registration Page
   - Enters: Name, Email, Password, Organization Name
   - Frontend validates input
   - Sends POST /api/v1/auth/register
   ↓
Step 5: Backend Processing
   - Validates data
   - Hashes password (bcrypt rounds 12)
   - Creates User document in MongoDB
   - Creates Organization document
   - Links user to organization
   - Generates JWT tokens (access + refresh)
   ↓
Step 6: Auto-login
   - Stores tokens in localStorage
   - Redirects to /app/dashboard
   ↓
Step 7: Dashboard loads with empty state
   - Shows 0 scans, 0 sources, 0 PII found
   - Prompts user to add first data source
```

---

### **PHASE 2: DATA SOURCE SETUP**

```
Step 1: User clicks "Data Sources" in sidebar
   ↓
Step 2: Clicks "Add Source" button
   ↓
Step 3: Modal opens with source type selection
   - Options: MySQL, PostgreSQL, MongoDB, S3, File Upload, etc.
   ↓
Step 4: User selects "File Upload" (simplest)
   - Enters source name: "Employee Data"
   - Uploads CSV file (test_data.csv)
   ↓
Step 5: Frontend sends POST /api/v1/sources
   - Payload: { name, type: "file", file: <binary> }
   ↓
Step 6: Backend Processing
   - Validates file type and size
   - Encrypts any credentials (AES-256-CBC)
   - Stores file in uploads/ directory
   - Creates DataSource document in MongoDB
   - Returns source ID
   ↓
Step 7: Frontend updates
   - Shows success toast
   - Adds source to list
   - Source card displays with "Ready to Scan" status
```

---

### **PHASE 3: RUNNING A SCAN (Core Workflow)**

```
┌─────────────────────────────────────────────────────────────┐
│                    SCAN INITIATION                           │
└─────────────────────────────────────────────────────────────┘

Step 1: User navigates to "Scans" page
   ↓
Step 2: Clicks "Start Scan" button
   ↓
Step 3: Modal opens
   - Select data source: "Employee Data"
   - Select scan type: "Full Scan" or "Quick Scan"
   - Click "Start Scan"
   ↓
Step 4: Frontend sends POST /api/v1/scans
   Payload: {
     sourceId: "abc123",
     scanType: "full"
   }
   ↓
Step 5: Backend receives request
   - Validates user has access to source
   - Creates ScanJob document in MongoDB
     {
       orgId: "org123",
       sourceId: "abc123",
       status: "pending",
       progress: 0,
       createdAt: Date.now()
     }
   - Returns scanJob ID
   ↓
Step 6: Backend adds job to Bull Queue (Redis)
   - Job: { scanJobId: "scan123" }
   - Queue processes asynchronously
   ↓
Step 7: Frontend receives response
   - Shows "Scan started" toast
   - Redirects to /app/scans/:id (scan detail page)
   - Establishes Socket.io connection for real-time updates

┌─────────────────────────────────────────────────────────────┐
│                    SCAN PROCESSING                           │
└─────────────────────────────────────────────────────────────┘

Step 8: Bull Queue Worker picks up job
   ↓
Step 9: scanService.processScan() executes
   - Updates ScanJob status: "running"
   - Emits Socket.io event: { scanId, status: "running", progress: 0 }
   ↓
Step 10: Read data from source
   - If file: Read CSV/Excel/JSON
   - If database: Execute SELECT query
   - If S3: Download and read files
   ↓
Step 11: Process data in batches (100 records at a time)
   For each batch:
     ↓
     Step 11a: Send text to AI Engine
       POST http://ai-engine:8000/detect
       Payload: {
         text: "Rajesh Kumar, 9876543210, 2345 6789 0123, ABCDE1234F",
         source_type: "file"
       }
     ↓
     Step 11b: AI Engine processes
       - Regex matching (Aadhaar, PAN, Mobile, Email, etc.)
       - NLP entity recognition (Names using spaCy)
       - Context extraction (surrounding text)
       - Confidence scoring
     ↓
     Step 11c: AI Engine returns detections
       Response: {
         detections: [
           {
             pii_type: "AADHAAR",
             value: "2345 6789 0123",
             masked_value: "XXXX XXXX 0123",
             confidence: 0.98,
             start: 15,
             end: 29,
             context: "...Kumar, 9876543210, 2345 6789 0123, ABCDE..."
           },
           {
             pii_type: "PAN",
             value: "ABCDE1234F",
             masked_value: "XXXXX1234F",
             confidence: 0.99,
             start: 31,
             end: 41,
             context: "...2345 6789 0123, ABCDE1234F, rajesh@..."
           }
         ],
         total_found: 2
       }
     ↓
     Step 11d: Backend calculates risk score
       - Uses aiService.classifyRisk()
       - Factors:
         * PII type sensitivity (Aadhaar=95, PAN=90, Email=60)
         * Number of PII types found
         * Encryption status (false = higher risk)
         * Consent record (false = higher risk)
       - Returns: { risk_score: 85, sensitivity_level: "sensitive_personal" }
     ↓
     Step 11e: Create ScanResult document
       {
         orgId: "org123",
         scanJobId: "scan123",
         sourceId: "abc123",
         detectedPII: [
           { piiType: "AADHAAR", maskedValue: "XXXX XXXX 0123", confidence: 0.98 },
           { piiType: "PAN", maskedValue: "XXXXX1234F", confidence: 0.99 }
         ],
         riskScore: 85,
         sensitivityLevel: "sensitive_personal",
         isEncrypted: false,
         hasConsentRecord: false,
         location: "row 1, employee_id: EMP001",
         createdAt: Date.now()
       }
     ↓
     Step 11f: Update progress
       - Calculate: (processedRecords / totalRecords) * 100
       - Update ScanJob: { progress: 50 }
       - Emit Socket.io: { scanId, progress: 50, recordsProcessed: 10 }
     ↓
     Step 11g: Frontend receives Socket.io event
       - Updates progress bar: 50%
       - Shows "10/20 records processed"
       - Animates progress smoothly
   ↓
Step 12: All batches processed
   - Update ScanJob: { status: "completed", progress: 100, completedAt: Date.now() }
   - Emit Socket.io: { scanId, status: "completed", progress: 100 }
   ↓
Step 13: Frontend receives completion event
   - Shows "Scan completed" toast
   - Displays summary: "50 PII records found, 15 critical risks"
   - Enables "View Results" button

┌─────────────────────────────────────────────────────────────┐
│                    RESULTS VIEWING                           │
└─────────────────────────────────────────────────────────────┘

Step 14: User clicks "View Results"
   ↓
Step 15: Frontend fetches GET /api/v1/scans/:id/results
   ↓
Step 16: Backend queries ScanResult collection
   - Filter: { scanJobId: "scan123" }
   - Aggregates by PII type
   - Calculates statistics
   ↓
Step 17: Returns results
   Response: {
     findings: [
       { id: "result1", piiTypes: ["AADHAAR", "PAN"], riskScore: 85, ... },
       { id: "result2", piiTypes: ["MOBILE", "EMAIL"], riskScore: 65, ... }
     ],
     summary: {
       totalFindings: 50,
       criticalCount: 15,
       highCount: 20,
       mediumCount: 10,
       lowCount: 5
     }
   }
   ↓
Step 18: Frontend displays results
   - Table with masked PII values
   - Risk scores with color coding
   - Sensitivity badges
   - Filter options (by PII type, risk level)
```

---

### **PHASE 4: DASHBOARD UPDATES (Real-time)**

```
Step 1: User navigates to Dashboard
   ↓
Step 2: Frontend sends GET /api/v1/dashboard/stats
   ↓
Step 3: Backend aggregates data
   - Queries ScanJob collection: count all scans
   - Queries ScanResult collection: count all findings
   - Queries DataSource collection: count all sources
   - Calculates:
     * Total PII assets
     * Critical risk count
     * Compliance score (based on encryption, consent)
     * Active scans (status: "running")
     * Scan trend (last 30 days)
     * Risk breakdown (by sensitivity level)
   ↓
Step 4: Returns dashboard data
   Response: {
     totalAssets: 50,
     criticalCount: 15,
     complianceScore: 65,
     activeScans: 0,
     scanTrend: [
       { _id: "2024-01-15", piiFound: 50, scansRun: 1 }
     ],
     riskBreakdown: [
       { _id: "sensitive_personal", count: 15 },
       { _id: "personal", count: 20 },
       { _id: "internal", count: 10 },
       { _id: "public", count: 5 }
     ],
     compliancePillars: [
       { label: "Consent Management", score: 0 },
       { label: "Principal Rights", score: 70 },
       { label: "Security Safeguards", score: 0 },
       { label: "Breach Notification", score: 85 }
     ]
   }
   ↓
Step 5: Frontend renders dashboard
   - KPI cards with animated numbers
   - Scan activity chart (area chart)
   - Risk breakdown pie chart
   - DPDPA compliance card with progress bars
   - Recent alerts list
   ↓
Step 6: Auto-refresh every 10 seconds
   - React Query refetchInterval: 10000
   - Keeps dashboard live without manual refresh
```

---

### **PHASE 5: COMPLIANCE TRACKING**

```
Step 1: User clicks "DPDPA 2023" in sidebar
   ↓
Step 2: Frontend sends GET /api/v1/dashboard/compliance
   ↓
Step 3: Backend calculates compliance
   - Queries all ScanResults for organization
   - Calculates metrics:
     * Encryption rate: (encrypted records / total records) * 100
     * Consent rate: (records with consent / total records) * 100
     * Critical data rate: (sensitive_personal / total records) * 100
   ↓
Step 4: Maps to DPDPA sections
   - Section 4 (Lawful Processing): Based on consent rate
   - Section 5 (Notice Requirements): Based on consent rate
   - Section 6 (Consent Management): Based on consent rate
   - Section 8 (Security Safeguards): Based on encryption rate
   - Section 9 (Children Data): Compliant (no children data detected)
   - Section 12 (Data Subject Rights): Based on critical data rate
   ↓
Step 5: Calculates overall score
   - Average of all section scores
   - Returns: 65% (needs improvement)
   ↓
Step 6: Returns compliance data
   Response: {
     score: 65,
     pillars: {
       consent: 0,
       rights: 70,
       obligations: 50,
       technical: 0
     },
     checklist: [
       {
         section: "Section 4",
         requirement: "Lawful Processing",
         status: "non_compliant",
         evidence: "0/50 records with consent"
       },
       {
         section: "Section 8",
         requirement: "Security Safeguards",
         status: "non_compliant",
         evidence: "0/50 records encrypted"
       }
     ]
   }
   ↓
Step 7: Frontend displays compliance
   - Large compliance score (65%)
   - 4 pillars with progress bars
   - Checklist with status icons
   - Color-coded by compliance level
```

---

### **PHASE 6: RISK ANALYSIS**

```
Step 1: User clicks "Risk Center" in sidebar
   ↓
Step 2: Frontend sends GET /api/v1/dashboard/risk
   ↓
Step 3: Backend analyzes risk
   - Aggregates ScanResults by PII type
   - Calculates average risk per type
   - Identifies top 10 riskiest assets
   - Counts risk factors:
     * Unencrypted PII
     * No consent records
     * Critical findings
   ↓
Step 4: Returns risk data
   Response: {
     overallRisk: 75,
     riskByType: [
       { _id: "AADHAAR", count: 20, avgRisk: 95 },
       { _id: "PAN", count: 20, avgRisk: 90 },
       { _id: "CREDIT_CARD", count: 20, avgRisk: 95 }
     ],
     topRiskyAssets: [
       { id: "result1", riskScore: 95, piiTypes: ["AADHAAR", "CREDIT_CARD"] }
     ],
     factors: {
       unencrypted: 50,
       noConsent: 50,
       criticalFindings: 15
     }
   }
   ↓
Step 5: Frontend displays risk dashboard
   - Overall risk gauge (circular progress)
   - Risk by PII type (horizontal bar chart with distinct colors)
   - Risk summary cards
   - Risk factors grid
```

---

### **PHASE 7: BREACH MANAGEMENT**

```
Step 1: User clicks "Breaches" in sidebar
   ↓
Step 2: User clicks "Log Breach" button
   ↓
Step 3: Modal opens
   - Enter incident description
   - Enter affected records count
   - Enter data types affected
   ↓
Step 4: Frontend sends POST /api/v1/dashboard/breaches
   Payload: {
     title: "Unauthorized database access",
     description: "Unauthorized access to employee database",
     affectedRecords: 100,
     dataTypes: "Aadhaar, PAN, Email"
   }
   ↓
Step 5: Backend creates BreachEvent
   {
     orgId: "org123",
     title: "Unauthorized database access",
     description: "...",
     estimatedAffectedCount: 100,
     affectedDataTypes: ["Aadhaar", "PAN", "Email"],
     detectedAt: Date.now(),
     notifyDeadline: Date.now() + (72 * 60 * 60 * 1000), // 72 hours
     status: "detected"
   }
   ↓
Step 6: Frontend displays breach
   - Shows breach card
   - 72-hour countdown timer starts
   - Color-coded urgency (red if <12 hours remaining)
   - Shows "URGENT" badge if critical
```

---

### **PHASE 8: AI COPILOT INTERACTION**

```
Step 1: User clicks "DPO Copilot" in sidebar
   ↓
Step 2: Chat interface loads
   ↓
Step 3: User types question: "What are the penalties for breach notification failure?"
   ↓
Step 4: Frontend sends GET /copilot/stream?q=<question>
   ↓
Step 5: AI Engine receives request
   - Checks if Claude API key is configured
   - If yes: Sends to Claude API
   - If no: Falls back to local rule-based logic
   ↓
Step 6: Claude API processes
   - System prompt includes DPDPA context
   - User question: "What are the penalties..."
   - Claude generates response
   ↓
Step 7: AI Engine streams response
   - Server-Sent Events (SSE)
   - Sends tokens one by one
   - Frontend displays typing effect
   ↓
Step 8: Response displayed
   "Under DPDPA 2023 Section 8, failure to notify the Data Protection Board
   within 72 hours of a breach can result in penalties up to ₹200 Crore.
   You must notify both the DPB and affected data principals..."
```

---

### **PHASE 9: REPORT GENERATION**

```
Step 1: User clicks "Reports" in sidebar
   ↓
Step 2: Clicks "Generate Report" button
   ↓
Step 3: Modal opens
   - Select report type: "Compliance Report"
   - Select date range: Last 30 days
   - Click "Generate"
   ↓
Step 4: Frontend sends POST /api/v1/reports
   Payload: {
     type: "compliance",
     dateRange: { start: "2024-01-01", end: "2024-01-31" }
   }
   ↓
Step 5: Backend generates PDF
   - Queries all relevant data
   - Uses reportService.generatePDF()
   - Creates PDF with:
     * Executive summary
     * Compliance score
     * PII inventory
     * Risk analysis
     * Recommendations
   - Saves to uploads/reports/
   ↓
Step 6: Returns report metadata
   Response: {
     id: "report123",
     type: "compliance",
     status: "completed",
     downloadUrl: "/api/v1/reports/report123/download"
   }
   ↓
Step 7: Frontend displays report
   - Shows in reports list
   - "Download" button enabled
   - User clicks to download PDF
```

---

### **PHASE 10: AUDIT LOG**

```
Step 1: Every action is logged automatically
   - User login → Audit log entry
   - Scan started → Audit log entry
   - Breach logged → Audit log entry
   - Report generated → Audit log entry
   ↓
Step 2: Audit log creation (middleware)
   - auditLogger middleware intercepts all requests
   - Creates AuditLog document:
     {
       orgId: "org123",
       userId: "user123",
       action: "SCAN_STARTED",
       details: { scanId: "scan123", sourceId: "abc123" },
       ipAddress: "192.168.1.1",
       userAgent: "Mozilla/5.0...",
       timestamp: Date.now(),
       hash: SHA256(details + previousHash),
       previousHash: "abc123..."
     }
   ↓
Step 3: Hash chain creation
   - Each log links to previous log via hash
   - Creates tamper-proof chain
   - If any log is modified, chain breaks
   ↓
Step 4: User views audit log
   - Clicks "Audit Log" in sidebar
   - Frontend sends GET /api/v1/dashboard/audit
   - Backend returns paginated logs
   ↓
Step 5: User verifies integrity
   - Clicks "Verify Chain Integrity"
   - Frontend sends GET /api/v1/dashboard/audit/verify
   - Backend recalculates all hashes
   - Compares with stored hashes
   - Returns: { isValid: true, totalLogs: 150 }
```

---

## 🔄 TECHNICAL DATA FLOW

### **Request Flow (Frontend → Backend)**

```
1. User Action (Click button)
   ↓
2. React Component Handler
   ↓
3. Axios HTTP Request
   - Headers: { Authorization: "Bearer <JWT>" }
   - Body: JSON payload
   ↓
4. NGINX Reverse Proxy
   - Routes to backend :3000
   ↓
5. Express.js Middleware Chain
   - CORS check
   - Rate limiting (200 req/15min)
   - Body parsing (JSON)
   - Auth middleware (verify JWT)
   - RBAC middleware (check permissions)
   - Audit logger (log action)
   ↓
6. Route Handler
   - Matches route: POST /api/v1/scans
   ↓
7. Controller Function
   - Business logic
   - Validation
   ↓
8. Service Layer
   - Database operations
   - External API calls (AI Engine)
   ↓
9. Database Query
   - MongoDB operations
   - Redis caching
   ↓
10. Response
   - Format: { success: true, data: {...}, message: "..." }
   ↓
11. Send to Frontend
   ↓
12. React Component Updates
   - State update (Zustand)
   - Re-render UI
   - Show toast notification
```

---

### **AI Detection Flow**

```
1. Text Input
   "Rajesh Kumar, 9876543210, rajesh@company.com, 2345 6789 0123"
   ↓
2. Backend sends to AI Engine
   POST http://ai-engine:8000/detect
   ↓
3. AI Engine Preprocessing
   - Normalize text (lowercase, trim)
   - Tokenization
   ↓
4. Regex Matching (Fast Path)
   - Aadhaar: [2-9]\d{3}\s?\d{4}\s?\d{4} → Match: "2345 6789 0123"
   - Mobile: [6-9]\d{9} → Match: "9876543210"
   - Email: standard regex → Match: "rajesh@company.com"
   ↓
5. NLP Processing (spaCy)
   - Named Entity Recognition
   - PERSON entity → Match: "Rajesh Kumar"
   ↓
6. Context Extraction
   - Get 20 chars before and after each match
   - Context: "...Kumar, 9876543210, rajesh@..."
   ↓
7. Masking
   - Aadhaar: "XXXX XXXX 0123"
   - Mobile: "XXXXX43210"
   - Email: "raj***@company.com"
   ↓
8. Confidence Scoring
   - Regex matches: 0.99 confidence
   - NLP matches: 0.85-0.95 confidence
   ↓
9. Return Detections
   {
     detections: [
       { pii_type: "AADHAAR", masked_value: "XXXX XXXX 0123", confidence: 0.99 },
       { pii_type: "MOBILE", masked_value: "XXXXX43210", confidence: 0.99 },
       { pii_type: "EMAIL", masked_value: "raj***@company.com", confidence: 0.99 },
       { pii_type: "NAME", masked_value: "Rajesh K***", confidence: 0.90 }
     ],
     total_found: 4
   }
```

---

## 🔐 SECURITY FLOW

### **Authentication Flow**

```
1. User enters credentials
   ↓
2. Frontend sends POST /api/v1/auth/login
   Payload: { email, password }
   ↓
3. Backend validates
   - Find user by email
   - Compare password hash (bcrypt)
   ↓
4. Generate JWT tokens
   - Access token (15 min expiry)
   - Refresh token (7 day expiry)
   ↓
5. Return tokens
   Response: {
     accessToken: "eyJhbGc...",
     refreshToken: "eyJhbGc...",
     user: { id, name, email, role }
   }
   ↓
6. Frontend stores tokens
   - localStorage.setItem('accessToken', ...)
   - localStorage.setItem('refreshToken', ...)
   ↓
7. All subsequent requests include token
   - Headers: { Authorization: "Bearer <accessToken>" }
   ↓
8. Token expires after 15 minutes
   ↓
9. Frontend detects 401 Unauthorized
   ↓
10. Auto-refresh flow
   - Send POST /api/v1/auth/refresh
   - Include refreshToken
   - Get new accessToken
   - Retry original request
```

---

## 📊 REAL-TIME UPDATES (Socket.io)

```
1. Frontend establishes WebSocket connection
   - socket.io-client connects to backend
   - Connection authenticated with JWT
   ↓
2. User starts scan
   ↓
3. Backend emits events during scan
   - socket.emit('scan:progress', { scanId, progress: 25 })
   - socket.emit('scan:progress', { scanId, progress: 50 })
   - socket.emit('scan:progress', { scanId, progress: 75 })
   - socket.emit('scan:completed', { scanId, progress: 100 })
   ↓
4. Frontend listens for events
   - socket.on('scan:progress', (data) => { updateProgress(data) })
   - socket.on('scan:completed', (data) => { showSuccess(data) })
   ↓
5. UI updates in real-time
   - Progress bar animates
   - Status text updates
   - No page refresh needed
```

---

## 🎯 KEY WORKFLOWS SUMMARY

### **1. Scan Workflow**
User uploads data → Backend creates scan job → Queue processes → AI detects PII → Results stored → Dashboard updates

### **2. Compliance Workflow**
Scan results → Calculate encryption/consent rates → Map to DPDPA sections → Generate compliance score → Display checklist

### **3. Risk Workflow**
Scan results → Aggregate by PII type → Calculate risk scores → Identify top risks → Display risk dashboard

### **4. Breach Workflow**
User logs breach → 72-hour timer starts → Countdown displayed → Alerts triggered → Compliance tracked

### **5. Report Workflow**
User requests report → Backend queries data → Generate PDF → Store file → Provide download link

### **6. Audit Workflow**
Every action → Middleware logs → Hash chain created → Stored in MongoDB → Verifiable integrity

---

## 🔄 CONTINUOUS OPERATIONS

### **Background Jobs (Bull Queue)**
- Scan processing (async)
- Report generation (async)
- Email notifications (async)
- Data cleanup (scheduled)

### **Auto-Refresh (React Query)**
- Dashboard: Every 10 seconds
- Compliance: Every 5 seconds
- Risk: Every 10 seconds
- Scans list: Every 5 seconds

### **Caching Strategy (Redis)**
- Session data (JWT tokens)
- Rate limiting counters
- Temporary scan data
- API response cache (5-10 min TTL)

---

## 📈 SCALABILITY CONSIDERATIONS

### **Horizontal Scaling**
- Backend: Multiple Node.js instances behind Nginx
- AI Engine: Multiple Python instances
- MongoDB: Replica set for read scaling
- Redis: Cluster mode for high availability

### **Vertical Scaling**
- Increase CPU for AI processing
- Increase RAM for large scans
- Increase storage for scan results

### **Performance Optimization**
- Database indexing (orgId, createdAt, sensitivityLevel)
- Batch processing (100 records at a time)
- Async operations (Bull queues)
- Caching (Redis)
- Connection pooling (MongoDB, Redis)

---

## 🎓 SUMMARY

**DataSentinel workflow in 5 steps:**

1. **Setup** - User registers, adds data sources
2. **Scan** - AI detects PII in real-time with progress updates
3. **Analyze** - Dashboard shows risks, compliance, trends
4. **Comply** - DPDPA mapping, breach tracking, reports
5. **Audit** - Immutable logs, tamper-proof chain

**Key Features:**
✅ Real-time updates (Socket.io)
✅ Async processing (Bull queues)
✅ AI-powered detection (98%+ accuracy)
✅ Compliance automation (DPDPA 2023)
✅ Audit trail (SHA-256 hash chain)
✅ Scalable architecture (microservices)

---

**End of Workflow Documentation** 🎉
