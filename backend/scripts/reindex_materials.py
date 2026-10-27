"""One-off backfill: indexes any course_materials uploaded before the RAG
pipeline existed (indexed=False). New uploads index automatically."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.course import CourseMaterial  # noqa: E402
from app.services.chunking import chunk_text  # noqa: E402
from app.services.text_extraction import extract_text_from_material  # noqa: E402
from app.services.vector_store import index_material_chunks  # noqa: E402


def main():
    db = SessionLocal()
    try:
        materials = db.query(CourseMaterial).filter(CourseMaterial.indexed.is_(False)).all()
        print(f"Found {len(materials)} unindexed materials")
        for material in materials:
            text = extract_text_from_material(material.file_path, material.content_type)
            chunks = chunk_text(text)
            index_material_chunks(material.id, material.module_id, chunks)
            material.indexed = True
            db.commit()
            print(f"Indexed {material.original_filename} ({len(chunks)} chunks)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
