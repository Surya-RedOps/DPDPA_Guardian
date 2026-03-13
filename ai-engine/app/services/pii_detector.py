import time
import logging
from typing import List, Dict, Any
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider
from .indian_pii_regex import PATTERNS, mask_value
from .ner_service import ner_service
from .transformer_ner import transformer_ner

logger = logging.getLogger(__name__)

class PIIAnalyzer:
    def __init__(self):
        self.registry = RecognizerRegistry()
        self.registry.load_predefined_recognizers()
        
        # Add custom Indian PII recognizers
        self._add_indian_recognizers()
        
        # Initialize NLP engine for Presidio
        try:
            provider = NlpEngineProvider(nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]
            })
            self.nlp_engine = provider.create_engine()
            self.analyzer = AnalyzerEngine(nlp_engine=self.nlp_engine, registry=self.registry)
            logger.info("Presidio AnalyzerEngine initialized successfully with spaCy + Indian recognizers")
        except Exception as e:
            logger.error(f"Failed to initialize Presidio NLP engine: {e}")
            self.analyzer = None

    def _add_indian_recognizers(self):
        """Register custom recognizers based on regex patterns from indian_pii_regex.py"""
        scores = {
            "AADHAAR": 0.95, "PAN": 0.90, "MOBILE": 0.75, "EMAIL": 0.85,
            "VOTER_ID": 0.85, "PASSPORT": 0.90, "IFSC": 0.85, "GSTIN": 0.90,
            "UPI": 0.80, "BANK_ACCOUNT": 0.80, "PIN_CODE": 0.60, "DOB": 0.65,
            "DRIVING_LICENSE": 0.85, "CIN": 0.85, "TAN": 0.85
        }
        
        context_words = {
            "AADHAAR": ["aadhaar", "aadhar", "uid", "uidai", "unique id"],
            "PAN": ["pan", "permanent account number", "income tax", "tax id"],
            "UPI": ["upi", "gpay", "phonepe", "vpa", "payment"],
            "IFSC": ["ifsc", "bank code", "neft", "branch"],
            "MOBILE": ["phone", "mobile", "whatsapp", "contact", "cell"],
            "GSTIN": ["gst", "gstin", "tax number", "registration"]
        }

        for name, pattern_obj in PATTERNS.items():
            pattern = Pattern(
                name=f"{name}_pattern",
                regex=pattern_obj.pattern,
                score=scores.get(name, 0.7)
            )
            
            recognizer = PatternRecognizer(
                supported_entity=name,
                patterns=[pattern],
                context=context_words.get(name, [])
            )
            
            self.registry.add_recognizer(recognizer)

    def analyze(self, text: str, source_type: str = "file") -> Dict[str, Any]:
        start_time = time.time()
        
        if not text or not text.strip():
            return {"detections": [], "total_found": 0, "processing_time_ms": 0}

        all_detections = []
        seen_spans = set()

        # Step 1: Use Presidio with higher threshold
        if self.analyzer:
            try:
                # Entities to detect
                entities = list(PATTERNS.keys()) + ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"]
                results = self.analyzer.analyze(text=text, entities=entities, language="en", score_threshold=0.6)
                
                # Normalize types to backend enums/readable names
                type_map = {
                    "PERSON": "NAME", "EMAIL_ADDRESS": "EMAIL", "PHONE_NUMBER": "MOBILE"
                }

                for r in results:
                    span_key = (r.start, r.end)
                    if span_key not in seen_spans:
                        seen_spans.add(span_key)
                        pii_type = type_map.get(r.entity_type, r.entity_type)
                        value = text[r.start:r.end]
                        
                        # Additional validation for names
                        if pii_type == "NAME":
                            # Skip if too short or looks like common word
                            if len(value) < 3 or value.lower() in ['page', 'section', 'table', 'figure']:
                                continue
                            # Skip PDF metadata patterns
                            if value.startswith('/') or 'obj' in value.lower() or 'endobj' in value.lower():
                                continue
                            # Skip if mostly non-alphabetic
                            alpha_count = sum(c.isalpha() for c in value)
                            if alpha_count < len(value) * 0.5:
                                continue
                        
                        all_detections.append({
                            "pii_type": pii_type,
                            "masked_value": mask_value(value, pii_type),
                            "confidence": round(r.score, 2),
                            "start": r.start,
                            "end": r.end,
                            "language": "en",
                            "context": text[max(0, r.start-50):min(len(text), r.end+50)]
                        })
            except Exception as e:
                logger.error(f"Presidio analysis error: {e}")

        # Step 2: Transformer-based NER (Hugging Face BERT) - Optional enhancement
        try:
            if transformer_ner.is_available():
                logger.info("Using transformer model for enhanced name detection")
                transformer_results = transformer_ner.detect_entities(text, confidence_threshold=0.80)
                
                for ent in transformer_results:
                    span_key = (ent["start"], ent["end"])
                    if span_key not in seen_spans:
                        seen_spans.add(span_key)
                        all_detections.append({
                            "pii_type": ent["pii_type"],
                            "masked_value": mask_value(ent['text'], ent['pii_type']),
                            "confidence": ent["confidence"],
                            "start": ent["start"],
                            "end": ent["end"],
                            "language": "en",
                            "context": text[max(0, ent["start"]-50):min(len(text), ent["end"]+50)],
                            "model": "transformer"
                        })
                logger.info(f"Transformer added {len(transformer_results)} high-confidence detections")
            else:
                logger.info("Transformer model not available, using Presidio + spaCy only")
        except Exception as e:
            logger.warning(f"Transformer NER error (non-critical): {e}")

        # Step 3: spaCy Fallback (only if transformer not available or for additional coverage)
        try:
            ner_results = ner_service.detect_entities(text)
            for ent in ner_results:
                # Only add if confidence is high enough
                if ent["confidence"] < 0.75:
                    continue
                    
                span_key = (ent["start"], ent["end"])
                if span_key not in seen_spans:
                    seen_spans.add(span_key)
                    all_detections.append({
                        "pii_type": ent["pii_type"],
                        "masked_value": mask_value(ent['text'], ent['pii_type']),
                        "confidence": ent["confidence"],
                        "start": ent["start"],
                        "end": ent["end"],
                        "language": "en",
                        "context": text[max(0, ent["start"]-50):min(len(text), ent["end"]+50)],
                        "model": "spacy"
                    })
        except Exception as e:
            logger.error(f"Fallback NER error: {e}")

        # Filter out low-confidence detections
        all_detections = [d for d in all_detections if d.get("confidence", 0) >= 0.6]

        elapsed_ms = int((time.time() - start_time) * 1000)
        
        # Log detection summary
        model_counts = {}
        for d in all_detections:
            model = d.get("model", "presidio")
            model_counts[model] = model_counts.get(model, 0) + 1
        logger.info(f"Detection summary: {model_counts}")
        
        return {
            "detections": all_detections,
            "total_found": len(all_detections),
            "processing_time_ms": elapsed_ms,
            "models_used": list(model_counts.keys())
        }

# Singleton
analyzer = PIIAnalyzer()

def detect(text: str, source_type: str = "file") -> Dict[str, Any]:
    return analyzer.analyze(text, source_type)
