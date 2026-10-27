FROM python:3.12-slim

WORKDIR /app

# tesseract-ocr: pytesseract is a wrapper — it shells out to the tesseract
# binary at runtime (used for ID-photo OCR), not part of the slim base image.
# build-essential: chromadb's dependency tree (hnswlib in particular) can
# need a C++ compiler to build from source if no prebuilt wheel matches.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway: mount a persistent volume at /app/storage so uploaded files and
# Chroma's local vector DB survive redeploys — without it, every deploy
# wipes course materials, submissions, and the RAG index.
RUN mkdir -p storage/id_photos storage/exam_end_photos storage/course_materials \
    storage/submissions storage/ground_truth storage/chroma

EXPOSE 8000

# Migrations run on every boot (idempotent — alembic no-ops if already at
# head) rather than as a separate deploy step, so a fresh Railway Postgres
# gets its schema created automatically on first deploy.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
