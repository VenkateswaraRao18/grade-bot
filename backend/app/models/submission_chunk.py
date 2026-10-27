import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Fixed so a single column works across embedding providers: Ollama's
# nomic-embed-text always outputs 768 dims, and Gemini's embed call
# explicitly requests 768 (see llm_provider._gemini_embed) to match —
# otherwise dev (Ollama) and prod (Gemini) would write incompatible vector
# widths into the same column.
EMBEDDING_DIM = 768


class SubmissionChunk(Base):
    """One chunk of a student's submitted work, embedded for RAG retrieval
    during the live exam (see services/examiner_agent.py). Lives in
    Postgres via pgvector instead of a local Chroma store, so the backend
    stays fully stateless — nothing on local disk to lose on a redeploy."""

    __tablename__ = "submission_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_submissions.id"), nullable=False, index=True
    )
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False, index=True
    )
    # The student's identity key for this chunk — a user UUID (legacy
    # self-service path) or a student_id_number string (bulk-tagged
    # passcode-link path), always stored as text either way (see
    # _submission_owner_key in examiner_agent.py).
    student_key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
