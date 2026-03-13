"""
Stub transformer service - Hugging Face models removed
"""
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class TransformerNERService:
    def __init__(self, model_name=None):
        logger.info("TransformerNERService disabled (Hugging Face models removed)")
    
    def detect_entities(self, text: str, confidence_threshold: float = 0.75) -> List[Dict[str, Any]]:
        return []
    
    def is_available(self) -> bool:
        return False

transformer_ner = TransformerNERService()

def detect_with_transformer(text: str, confidence_threshold: float = 0.75) -> List[Dict[str, Any]]:
    return []
