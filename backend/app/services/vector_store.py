import uuid

from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.submission_chunk import SubmissionChunk
from app.services.llm_provider import llm_provider

# Student submissions are the only RAG-indexed content (no more exam-level
# reference material) — questions are grounded exclusively in the student's
# own bulk-tagged document. Lives in Postgres via pgvector (see
# models/submission_chunk.py), not a local Chroma store, so the backend has
# nothing on local disk to lose on a redeploy. Each function opens its own
# short-lived session rather than taking `db` as a parameter, keeping this
# module's interface identical to before — callers don't need to change.


def index_submission_chunks(
    submission_id: uuid.UUID, exam_id: uuid.UUID, student_key: uuid.UUID | str, chunks: list[str]
) -> None:
    """`student_key` identifies whose submission this is — a user's UUID for
    the legacy self-service upload path, or a plain student_id_number string
    for an instructor's bulk-tagged upload (see bulk_mapping.py). Always
    stored as text. A resubmission/re-index deletes this submission's prior
    chunks first rather than accumulating stale ones alongside fresh ones."""
    if not chunks:
        return
    embeddings = llm_provider.embed(chunks, usage_label="submission_indexing")
    db = SessionLocal()
    try:
        db.execute(delete(SubmissionChunk).where(SubmissionChunk.submission_id == submission_id))
        for i, (text, embedding) in enumerate(zip(chunks, embeddings)):
            db.add(
                SubmissionChunk(
                    submission_id=submission_id,
                    exam_id=exam_id,
                    student_key=str(student_key),
                    chunk_index=i,
                    chunk_text=text,
                    embedding=embedding,
                )
            )
        db.commit()
    finally:
        db.close()


def delete_submission_chunks(submission_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        db.execute(delete(SubmissionChunk).where(SubmissionChunk.submission_id == submission_id))
        db.commit()
    finally:
        db.close()


def search_submissions(
    exam_id: uuid.UUID, student_key: uuid.UUID | str, query_text: str, k: int = 5
) -> list[dict]:
    """Retrieves one specific student's own submission chunks for this exam
    — `student_key` is required (not optional) so this can't be called in a
    way that accidentally omits the privacy boundary. Combined with the
    exam_id + student_key filter, a student's work is unreachable from any
    query that isn't explicitly theirs."""
    query_embedding = llm_provider.embed([query_text], usage_label="submission_query")[0]
    db = SessionLocal()
    try:
        rows = (
            db.query(SubmissionChunk)
            .filter(
                SubmissionChunk.exam_id == exam_id,
                SubmissionChunk.student_key == str(student_key),
            )
            .order_by(SubmissionChunk.embedding.cosine_distance(query_embedding))
            .limit(k)
            .all()
        )
        return [
            {
                "id": str(row.id),
                "text": row.chunk_text,
                "metadata": {
                    "submission_id": str(row.submission_id),
                    "exam_id": str(row.exam_id),
                    "student_id": row.student_key,
                    "chunk_index": row.chunk_index,
                },
            }
            for row in rows
        ]
    finally:
        db.close()
