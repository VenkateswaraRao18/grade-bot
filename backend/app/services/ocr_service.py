import re

import pytesseract
from PIL import Image


def extract_text(image: Image.Image) -> str:
    return pytesseract.image_to_string(image)


def normalize(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value).upper()


def id_number_found_in_text(student_id_number: str, ocr_text: str) -> bool:
    """Checks whether the student's on-file ID number appears in the OCR'd
    text of their ID photo, ignoring case and non-alphanumeric characters
    (spacing/OCR noise varies a lot across phone cameras)."""
    needle = normalize(student_id_number)
    haystack = normalize(ocr_text)
    return bool(needle) and needle in haystack
