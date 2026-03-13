from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from app.routers import detect, classify, ocr, scan, copilot, retrain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DataSentinel AI Engine",
    description="PII Detection and Classification Engine for DPDPA Compliance",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router, tags=["Detection"])
app.include_router(classify.router, tags=["Classification"])
app.include_router(ocr.router, tags=["OCR"])
app.include_router(scan.router, tags=["Scan"])
app.include_router(copilot.router, tags=["AI Assistant"])
app.include_router(retrain.router, tags=["Model Training"])

@app.get("/health")
async def health():
    from app.services.pii_detector import analyzer
    from app.services.ner_service import ner_service
    
    status = {
        "status": "ok",
        "service": "datasentinel-ai-engine",
        "presidio_ready": analyzer.analyzer is not None,
        "spacy_ready": ner_service.nlp is not None,
        "tesseract_ready": True,
    }
    
    if not status["presidio_ready"] and not status["spacy_ready"]:
        status["status"] = "error"
    elif not status["presidio_ready"] or not status["spacy_ready"]:
        status["status"] = "degraded"
        
    return status

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", 8000)))
