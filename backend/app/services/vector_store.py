import uuid

import chromadb
from chromadb.config import Settings

from app.services.llm_provider import llm_provider

_client = chromadb.PersistentClient(path="storage/chroma", settings=Settings(anonymized_telemetry=False))

# Student submissions are the only RAG-indexed content now (no more
# exam-level reference material) — questions are grounded exclusively in
# the student's own bulk-tagged document. Its own collection (not just a
# metadata filter) means a student's work is unreachable from anywhere
# that isn't explicitly scoped to them.
_submissions_collection = _client.get_or_create_collection("student_submissions")


def index_submission_chunks(
    submission_id: uuid.UUID, exam_id: uuid.UUID, student_key: uuid.UUID | str, chunks: list[str]
) -> None:
    """`student_key` identifies whose submission this is — a user's UUID for
    the legacy self-service upload path, or a plain student_id_number string
    for an instructor's bulk-tagged upload (see bulk_mapping.py). Either way
    it's stored as a string; the two never collide in practice since UUIDs
    and ID numbers don't share a format, and even if they did, each exam's
    retrieval is already scoped to one specific attempt's own key."""
    if not chunks:
        return
    embeddings = llm_provider.embed(chunks, usage_label="submission_indexing")
    ids = [f"{submission_id}:{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "submission_id": str(submission_id),
            "exam_id": str(exam_id),
            "student_id": str(student_key),
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]
    _submissions_collection.upsert(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)


def delete_submission_chunks(submission_id: uuid.UUID) -> None:
    _submissions_collection.delete(where={"submission_id": str(submission_id)})


def search_submissions(
    exam_id: uuid.UUID, student_key: uuid.UUID | str, query_text: str, k: int = 5
) -> list[dict]:
    """Retrieves one specific student's own submission chunks for this exam
    — `student_key` is required (not optional) so this can't be called in a
    way that accidentally omits the privacy boundary. Combined with the
    separate collection, a student's work is unreachable from any query
    that isn't explicitly theirs."""
    query_embedding = llm_provider.embed([query_text], usage_label="submission_query")[0]
    results = _submissions_collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={
            "$and": [
                {"exam_id": str(exam_id)},
                {"student_id": str(student_key)},
            ]
        },
    )
    if not results["ids"] or not results["ids"][0]:
        return []
    return [
        {"id": doc_id, "text": doc, "metadata": meta, "distance": dist}
        for doc_id, doc, meta, dist in zip(
            results["ids"][0], results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]
