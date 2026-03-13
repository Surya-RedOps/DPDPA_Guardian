from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import asyncio
import json
import os
from anthropic import Anthropic

router = APIRouter()

# Configure Claude (Anthropic)
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
client = None
if CLAUDE_API_KEY:
    client = Anthropic(api_key=CLAUDE_API_KEY)

# Robust DPDPA 2023 knowledge base for the Co-Pilot
DPDPA_CONTEXT = {
    "section 4": "Applicability & Lawfulness: Personal data can only be processed for a lawful purpose with consent or for certain legitimate uses as per Section 7.",
    "section 5": "Notice: Before requesting consent, a Data Fiduciary must give the Data Principal a notice explaining what data is being collected and the purpose of processing. Must be available in English or any language specified in the 8th Schedule of the Constitution.",
    "section 6": "Consent: Must be free, specific, informed, unconditional, and unambiguous with a clear affirmative action. Principals have the right to withdraw consent at any time.",
    "section 8": "General Obligations: Data Fiduciaries must ensure data accuracy, implement technical and organizational measures (Security Safeguards), and notify the Board and affected individuals of any personal data breach within 72 hours.",
    "section 9": "Children's Data: Prohibits processing of personal data that causes detrimental effect on children. Requires verifiable parental consent. No tracking or behavioral monitoring for targeted advertising.",
    "section 10": "Significant Data Fiduciary (SDF): Central Govt labels entities based on data volume, sensitivity, and risk. SDFs must appoint a DPO based in India, an independent data auditor, and conduct DPIAs.",
    "section 11": "Right to Information: Principals can request a summary of data processed, identities of all fiduciaries/processors data was shared with, and any other info as prescribed.",
    "section 12": "Correction & Erasure: Principals have the right to correct inaccurate data, update information, and request erasure of data that is no longer necessary for the purpose it was collected.",
    "section 13": "Grievance Redressal: Data Fiduciary must have a mechanism to resolve principal grievances within a prescribed time. Exhausting this is a prerequisite to approaching the Board.",
    "section 17": "Exemptions: Research, statistical or historical purposes, enforcement of legal rights, or state security purposes may have limited exemptions from certain provisions.",
    "penalty": "Schedule of Penalties: Failure to take reasonable security safeguards to prevent data breach: up to ₹250 Crore. Failure to notify breach: up to ₹200 Crore. Violation of duties by Data Principal: up to ₹10,000.",
    "retention": "Storage Limitation: Data Fiduciary must delete personal data as soon as the purpose of processing is fulfilled or the principal withdraws consent."
}

PRODUCT_CONTEXT = """
DataSentinel is India's first native DPDPA 2023 Personal Data Intelligence Platform.

Key Features:
- PII Discovery: Scans databases (MySQL, PostgreSQL, MongoDB), cloud storage (S3), and files to detect Indian PII (Aadhaar, PAN, mobile, email, etc.)
- Risk Scoring: Assigns risk scores (0-100) based on sensitivity, encryption status, and exposure
- DPDPA 2023 Compliance: Maps findings to specific DPDPA sections and tracks compliance score
- Data Inventory: Maintains catalog of all discovered PII assets with sensitivity classification
- Breach Management: 72-hour countdown timer for DPB notification obligations
- Reports: Generate PDF compliance reports for audits
- Audit Log: Immutable SHA-256 hash chain for tamper-proof audit trail

How to Use:
1. Add Data Sources: Connect MySQL, PostgreSQL, MongoDB, S3, or upload files
2. Run Scans: Start PII detection scans on your data sources
3. Review Inventory: Check discovered PII assets and their risk scores
4. Monitor Compliance: Track DPDPA 2023 compliance score and remediation status
5. Generate Reports: Create audit-ready PDF reports

Supported PII Types: Aadhaar, PAN, Mobile, Email, Passport, Voter ID, Credit Card, UPI ID, IFSC, GSTIN, Driving License, DOB, Names
"""

def is_relevant_query(query: str) -> bool:
    """Check if query is related to DataSentinel, DPDPA, or data protection"""
    query_lower = query.lower()
    
    relevant_keywords = [
        'datasentinel', 'dpdpa', 'data protection', 'pii', 'personal data', 'privacy',
        'compliance', 'scan', 'breach', 'aadhaar', 'pan', 'gdpr', 'consent',
        'security', 'risk', 'inventory', 'report', 'audit', 'dpo', 'fiduciary',
        'how to', 'what is', 'explain', 'help', 'guide', 'usage', 'feature',
        'finding', 'detection', 'database', 'mysql', 'mongodb', 'source', 'penalty',
        'notification', 'breach', 'erasure', 'correction', 'rights', 'children'
    ]
    
    if any(keyword in query_lower for keyword in relevant_keywords):
        return True
    
    irrelevant_patterns = [
        'weather', 'recipe', 'movie', 'song', 'game', 'sport', 'celebrity',
        'joke', 'story', 'poem', 'math problem', 'homework', 'translate',
        'write code for', 'create app', 'build website'
    ]
    
    if any(pattern in query_lower for pattern in irrelevant_patterns):
        return False
    
    return True

async def assistant_stream(query: str):
    # Check if query is relevant
    if not is_relevant_query(query):
        error_msg = "⚠️ I'm the DataSentinel DPO Copilot, specialized in DPDPA 2023 compliance and data protection. I can only help with:\n\n" \
                   "• DataSentinel product usage and features\n" \
                   "• DPDPA 2023 compliance questions\n" \
                   "• Data protection best practices\n" \
                   "• PII detection and risk management\n" \
                   "• Breach notification procedures\n\n" \
                   "Please ask a question related to data protection or DataSentinel."
        for char in error_msg:
            yield f"data: {json.dumps({'token': char})}\n\n"
            await asyncio.sleep(0.01)
        yield "data: [DONE]\n\n"
        return
    
    # Try Claude API first
    if CLAUDE_API_KEY and client:
        try:
            system_prompt = f"""You are DataSentinel's DPO Copilot - an expert AI assistant specialized in:
1. India's Digital Personal Data Protection Act (DPDPA) 2023
2. DataSentinel product features and usage
3. Data protection and privacy compliance
4. PII detection and risk management

DPDPA 2023 Knowledge Base:
{json.dumps(DPDPA_CONTEXT, indent=2)}

DataSentinel Product Information:
{PRODUCT_CONTEXT}

IMPORTANT RULES:
- ONLY answer questions related to DPDPA 2023, data protection, privacy, or DataSentinel product
- Provide actionable, practical advice
- Reference specific DPDPA sections when applicable
- If asked about scan findings, suggest reviewing the Inventory page for detailed PII information
- Be concise and professional
- Use Indian context and examples
- For compliance questions, always cite the relevant DPDPA section
- For penalties, provide exact amounts in Indian Rupees"""
            
            # Stream response from Claude
            with client.messages.stream(
                model="claude-3-5-sonnet-20241022",
                max_tokens=800,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": query}
                ]
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'token': text})}\n\n"
                    await asyncio.sleep(0.01)
            
            yield "data: [DONE]\n\n"
            return
            
        except Exception as e:
            error_msg = f"⚠️ Claude API Error: {str(e)}. Falling back to local analysis...\n\n"
            yield f"data: {json.dumps({'token': error_msg})}\n\n"
            await asyncio.sleep(0.5)

    # Fallback to Local Rule-Based Logic
    response_intro = f"📊 DataSentinel Local Analysis for: '{query}'\n\n"
    for char in response_intro:
        yield f"data: {json.dumps({'token': char})}\n\n"
        await asyncio.sleep(0.01)

    query_lower = query.lower()
    
    keywords = {
        "consent": ["section 6", "section 5", "retention"],
        "breach": ["section 8", "penalty"],
        "security": ["section 8", "penalty"],
        "children": ["section 9"],
        "rights": ["section 11", "section 12", "section 13"],
        "erase": ["section 12", "retention"],
        "delete": ["section 12", "retention"],
        "dpo": ["section 10"],
        "penalty": ["penalty"],
        "fine": ["penalty"],
        "notice": ["section 5"],
        "scan": ["product_usage"],
        "finding": ["product_usage"],
        "inventory": ["product_usage"],
        "how to": ["product_usage"],
        "notification": ["section 8", "penalty"],
        "72 hours": ["section 8", "penalty"],
        "correction": ["section 12"],
        "erasure": ["section 12"]
    }

    relevant_keys = []
    for k, sections in keywords.items():
        if k in query_lower:
            relevant_keys.extend(sections)
    
    for sec in DPDPA_CONTEXT.keys():
        if sec in query_lower:
            relevant_keys.append(sec)

    unique_keys = list(set(relevant_keys))
    
    if "product_usage" in unique_keys:
        content = "**DataSentinel Usage Guide:**\n\n"
        content += PRODUCT_CONTEXT
        content += "\n\n💡 **Tip:** Check the Inventory page to see detailed PII findings including masked values, context snippets, and confidence scores for each detection."
    elif unique_keys:
        content = "Based on the Digital Personal Data Protection Act, 2023, here are the relevant provisions:\n\n"
        for key in unique_keys:
            if key in DPDPA_CONTEXT and key != "product_usage":
                content += f"### {key.upper()}\n{DPDPA_CONTEXT[key]}\n\n"
        
        content += "\n**Action Recommendation:** Review your current data processing activities and ensure compliance with these provisions. Use DataSentinel's Inventory page to identify all PII assets and their risk scores."
    else:
        content = "Under DPDPA 2023, your organization must maintain a 'Record of Processing Activities' (ROPA) and ensure all personal data is discovered. DataSentinel helps you:\n\n"
        content += "• Discover PII across databases and files\n"
        content += "• Classify data by sensitivity level\n"
        content += "• Track compliance with DPDPA 2023\n"
        content += "• Generate audit-ready reports\n\n"
        content += "Start by adding a data source and running a scan to discover PII in your systems."

    for word in content.split(' '):
        yield f"data: {json.dumps({'token': word + ' '})}\n\n"
        await asyncio.sleep(0.03)
    
    yield "data: [DONE]\n\n"

@router.get("/copilot/stream")
async def copilot_stream(q: str = Query(..., min_length=1)):
    return StreamingResponse(assistant_stream(q), media_type="text/event-stream")
