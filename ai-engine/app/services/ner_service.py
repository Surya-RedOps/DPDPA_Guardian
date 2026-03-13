import spacy
import logging

logger = logging.getLogger(__name__)

# Common words that are NOT names (reduce false positives)
COMMON_WORDS = {
    'page', 'section', 'chapter', 'figure', 'table', 'appendix', 'document', 'file',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday', 'sunday', 'total', 'amount', 'date', 'time',
    'name', 'address', 'phone', 'email', 'company', 'organization', 'department',
    'title', 'description', 'summary', 'notes', 'remarks', 'status', 'type',
    'category', 'version', 'number', 'code', 'id', 'reference', 'subject'
}

class NERService:
    def __init__(self, model_name="en_core_web_sm"):
        try:
            self.nlp = spacy.load(model_name)
            logger.info(f"spaCy model {model_name} loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load spaCy model {model_name}: {e}. PII detection will be limited.")
            self.nlp = None

    def is_valid_name(self, text: str) -> bool:
        """Validate if detected entity is actually a name"""
        text_lower = text.lower().strip()
        
        # Filter out common false positives
        if text_lower in COMMON_WORDS:
            return False
        
        # Must be at least 2 characters
        if len(text) < 2:
            return False
        
        # Should not be all uppercase (likely acronym)
        if text.isupper() and len(text) < 4:
            return False
        
        # Should not be all numbers
        if text.isdigit():
            return False
        
        # Should not contain special characters (except space, hyphen, apostrophe)
        if any(char in text for char in ['@', '#', '$', '%', '&', '*', '(', ')', '[', ']', '{', '}']):
            return False
        
        # Should have at least one letter
        if not any(c.isalpha() for c in text):
            return False
        
        # For single word names, should be capitalized
        words = text.split()
        if len(words) == 1:
            # Single word should be capitalized and at least 3 chars
            if len(text) < 3 or not text[0].isupper():
                return False
        
        # For multi-word names, at least one word should be capitalized
        if len(words) > 1:
            if not any(word[0].isupper() for word in words if len(word) > 0):
                return False
        
        return True

    def detect_entities(self, text):
        if not self.nlp or not text:
            return []
        
        # Process text in chunks if too large
        doc = self.nlp(text[:100000])
        entities = []
        
        # Only detect PERSON entities (names) - be more conservative
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                # Validate if it's actually a name
                if not self.is_valid_name(ent.text):
                    continue
                
                # Calculate confidence based on context
                confidence = 0.7  # Base confidence
                
                # Increase confidence if surrounded by name-related keywords
                context_start = max(0, ent.start_char - 50)
                context_end = min(len(text), ent.end_char + 50)
                context = text[context_start:context_end].lower()
                
                name_keywords = ['name', 'mr', 'mrs', 'ms', 'dr', 'prof', 'employee', 'customer', 'user', 'person']
                if any(keyword in context for keyword in name_keywords):
                    confidence = 0.85
                
                entities.append({
                    "pii_type": "NAME",
                    "text": ent.text,
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "label": ent.label_,
                    "confidence": confidence
                })
                
        return entities

ner_service = NERService()
