import re

# Improved patterns with better validation
PATTERNS = {
    "AADHAAR": re.compile(r'\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b'),
    "PAN": re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b'),
    "MOBILE": re.compile(r'(?<!\d)[6-9][0-9]{9}(?!\d)'),
    "EMAIL": re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b'),
    "VOTER_ID": re.compile(r'\b[A-Z]{3}[0-9]{7}\b'),
    "PASSPORT": re.compile(r'\b[A-Z]{1}[0-9]{7}\b'),
    "IFSC": re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b'),
    "GSTIN": re.compile(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b'),
    "UPI": re.compile(r'\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b'),
    "DOB": re.compile(r'\b(0?[1-9]|[12][0-9]|3[01])[\/\-\.](0?[1-9]|1[012])[\/\-\.](19|20)\d\d\b'),
    "DRIVING_LICENSE": re.compile(r'\b[A-Z]{2}[0-9]{2}[- ][0-9]{4}[0-9]{7}\b'),
    "CREDIT_CARD": re.compile(r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b'),
}

# Blacklist patterns - common false positives
BLACKLIST_PATTERNS = [
    r'\b(page|section|chapter|figure|table|appendix)\s*\d+\b',  # Page numbers
    r'\b(version|v|ver)\s*\d+\.\d+\b',  # Version numbers
    r'\b\d{4}[-/]\d{2}[-/]\d{2}\b',  # ISO dates (not DOB format)
    r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{1,2}\b',  # Month dates
    r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',  # IP addresses
    r'\b(http|https|ftp|www)\b',  # URLs
    r'\b\d{10,}\b(?=.*\d{10,})',  # Long number sequences (likely not PII)
]

# Context keywords that increase confidence
CONTEXT_KEYWORDS = {
    "AADHAAR": ["aadhaar", "aadhar", "uid", "uidai", "unique id", "enrollment"],
    "PAN": ["pan", "permanent account", "income tax", "tax id", "pan card"],
    "MOBILE": ["phone", "mobile", "contact", "cell", "whatsapp", "call"],
    "EMAIL": ["email", "e-mail", "mail", "contact", "@"],
    "PASSPORT": ["passport", "travel document", "passport no"],
    "VOTER_ID": ["voter", "epic", "election", "voter id"],
    "DRIVING_LICENSE": ["driving", "license", "dl", "driver"],
    "CREDIT_CARD": ["card", "credit", "debit", "payment", "visa", "mastercard"],
    "UPI": ["upi", "gpay", "phonepe", "paytm", "payment"],
    "IFSC": ["ifsc", "bank code", "branch", "neft", "rtgs"],
}

# Known valid prefixes for better validation
VALID_IFSC_PREFIXES = ['SBIN', 'HDFC', 'ICIC', 'AXIS', 'PUNB', 'UTIB', 'KKBK', 'CNRB', 'UBIN', 'BARB', 'IDIB']
VALID_UPI_SUFFIXES = ['oksbi', 'okaxis', 'okicici', 'okhdfcbank', 'ybl', 'paytm', 'axl', 'ibl']

def luhn_check(card_number: str) -> bool:
    """Validate credit card using Luhn algorithm"""
    def digits_of(n):
        return [int(d) for d in str(n)]
    digits = digits_of(card_number)
    odd_digits = digits[-1::-2]
    even_digits = digits[-2::-2]
    checksum = sum(odd_digits)
    for d in even_digits:
        checksum += sum(digits_of(d * 2))
    return checksum % 10 == 0

def is_valid_aadhaar(value: str) -> bool:
    """Validate Aadhaar number"""
    clean = value.replace(' ', '').replace('-', '')
    if len(clean) != 12:
        return False
    # First digit cannot be 0 or 1
    if clean[0] in ['0', '1']:
        return False
    # Check for repeated patterns (common false positive)
    if len(set(clean)) < 4:  # Too few unique digits
        return False
    return True

def is_valid_pan(value: str) -> bool:
    """Validate PAN format"""
    if len(value) != 10:
        return False
    # 4th char should be P (person), C (company), H (HUF), etc.
    if value[3] not in ['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']:
        return False
    # Check for common false positives (all same letters)
    if len(set(value[:5])) < 3:
        return False
    return True

def is_valid_mobile(value: str) -> bool:
    """Validate Indian mobile number"""
    if len(value) != 10:
        return False
    # Should start with 6, 7, 8, or 9
    if value[0] not in ['6', '7', '8', '9']:
        return False
    # Check for repeated patterns
    if len(set(value)) < 4:  # Too few unique digits
        return False
    # Common false positives
    if value in ['9999999999', '8888888888', '7777777777', '6666666666']:
        return False
    return True

def is_valid_ifsc(value: str) -> bool:
    """Validate IFSC code"""
    if len(value) != 11:
        return False
    # Check if starts with known bank code
    prefix = value[:4]
    if prefix not in VALID_IFSC_PREFIXES:
        return False
    # 5th character should be 0
    if value[4] != '0':
        return False
    return True

def is_valid_upi(value: str) -> bool:
    """Validate UPI ID"""
    if '@' not in value:
        return False
    parts = value.split('@')
    if len(parts) != 2:
        return False
    handle = parts[1].lower()
    # Check if it's a known UPI handle
    if handle not in VALID_UPI_SUFFIXES:
        return False
    return True

def is_valid_credit_card(value: str) -> bool:
    """Validate credit card using Luhn algorithm"""
    clean = value.replace(' ', '').replace('-', '')
    if len(clean) < 13 or len(clean) > 19:
        return False
    return luhn_check(clean)

def is_blacklisted(text: str, start: int, end: int) -> bool:
    """Check if match is in blacklisted context"""
    # Get surrounding context (50 chars before and after)
    context_start = max(0, start - 50)
    context_end = min(len(text), end + 50)
    context = text[context_start:context_end].lower()
    
    for pattern in BLACKLIST_PATTERNS:
        if re.search(pattern, context, re.IGNORECASE):
            return True
    return False

def get_context_confidence(text: str, pii_type: str, start: int, end: int) -> float:
    """Calculate confidence based on surrounding context"""
    # Get surrounding context (100 chars before and after)
    context_start = max(0, start - 100)
    context_end = min(len(text), end + 100)
    context = text[context_start:context_end].lower()
    
    keywords = CONTEXT_KEYWORDS.get(pii_type, [])
    matches = sum(1 for keyword in keywords if keyword in context)
    
    # Base confidence + context boost
    base_confidence = 0.6
    context_boost = min(0.3, matches * 0.1)  # Max 0.3 boost
    
    return min(0.95, base_confidence + context_boost)

def mask_value(value: str, pii_type: str) -> str:
    """Mask PII value for safe display"""
    if pii_type == "EMAIL":
        parts = value.split('@')
        if len(parts) == 2:
            username = parts[0]
            if len(username) <= 3:
                return f"***@{parts[1]}"
            return f"{username[:2]}***@{parts[1]}"
    if pii_type == "AADHAAR":
        val = value.replace(' ', '')
        return f"XXXX XXXX {val[-4:]}"
    if pii_type == "PAN":
        return f"{value[:3]}**{value[-2:]}"
    if pii_type == "MOBILE":
        return f"{value[:2]}*****{value[-3:]}"
    if pii_type == "CREDIT_CARD":
        clean = value.replace(' ', '')
        return f"XXXX XXXX XXXX {clean[-4:]}"
    if pii_type == "UPI":
        parts = value.split('@')
        if len(parts) == 2:
            return f"{parts[0][:2]}***@{parts[1]}"
    if len(value) > 6:
        return f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"
    return "***"

def detect_patterns(text: str):
    """Run all regex patterns with validation and return matches"""
    results = []
    
    for pii_type, pattern in PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group()
            start = match.start()
            end = match.end()
            
            # Skip if in blacklisted context
            if is_blacklisted(text, start, end):
                continue
            
            # Validate based on PII type
            is_valid = True
            if pii_type == "AADHAAR":
                is_valid = is_valid_aadhaar(value)
            elif pii_type == "PAN":
                is_valid = is_valid_pan(value)
            elif pii_type == "MOBILE":
                is_valid = is_valid_mobile(value)
            elif pii_type == "IFSC":
                is_valid = is_valid_ifsc(value)
            elif pii_type == "UPI":
                is_valid = is_valid_upi(value)
            elif pii_type == "CREDIT_CARD":
                is_valid = is_valid_credit_card(value)
            
            if not is_valid:
                continue
            
            # Calculate confidence based on context
            confidence = get_context_confidence(text, pii_type, start, end)
            
            # Get surrounding context
            context_start = max(0, start - 30)
            context_end = min(len(text), end + 30)
            context = text[context_start:context_end].replace(value, f"[{pii_type}]")
            
            results.append({
                "pii_type": pii_type,
                "value": value,
                "masked_value": mask_value(value, pii_type),
                "start": start,
                "end": end,
                "confidence": confidence,
                "context": context
            })
    
    return results
