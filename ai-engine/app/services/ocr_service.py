import pytesseract
from PIL import Image
import io
import logging
import pdfplumber

logger = logging.getLogger(__name__)

class OCRService:
    def __init__(self):
        # Tesseract usually works out of the box if installed on the system
        pass

    def extract_text_from_image(self, image_bytes):
        try:
            img = Image.open(io.BytesIO(image_bytes))
            # Support Hindi and Tamil as requested in DPDPA context
            text = pytesseract.image_to_string(img, lang='eng+hin+tam')
            return text
        except Exception as e:
            logger.error(f"OCR Image extraction error: {e}")
            return ""

    def extract_text_from_pdf(self, pdf_bytes):
        try:
            text = ""
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    # Try text extraction first
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
                    else:
                        # If no text, try OCR on page image
                        img = page.to_image().original
                        text += pytesseract.image_to_string(img, lang='eng+hin+tam') + "\n"
            return text
        except Exception as e:
            logger.error(f"OCR PDF extraction error: {e}")
            return ""

ocr_service = OCRService()
