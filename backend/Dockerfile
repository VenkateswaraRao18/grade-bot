FROM python:3.12-slim

WORKDIR /app

# tesseract-ocr: pytesseract is a wrapper — it shells out to the tesseract
# binary at runtime (used for ID-photo OCR), not part of the slim base image.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No local storage/volume needed — uploaded photos, student submission
# text, and the pgvector embeddings all live in Postgres, so the backend
# is fully stateless and safe to redeploy without losing anything.

EXPOSE 8000

# Migrations run on every boot (idempotent — alembic no-ops if already at
# head) rather than as a separate deploy step, so a fresh Railway Postgres
# gets its schema created automatically on first deploy.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
