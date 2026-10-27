import logging
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.submission import ExamSubmission
from app.models.user import User, UserRole
from app.routers.exams import get_owned_exam
from app.schemas.submission import BulkSubmissionResult, SubmissionWithStudentOut
from app.services.bulk_mapping import parse_mapping_file, validate_bulk_mapping
from app.services.chunking import chunk_text
from app.services.text_extraction import extract_text_from_material, resolve_upload_type
from app.services.vector_store import index_submission_chunks

logger = logging.getLogger(__name__)
router = APIRouter(tags=["submissions"])

MAX_SUBMISSION_BYTES = 25 * 1024 * 1024
MAX_BULK_FILES = 300


@router.get("/exams/{exam_id}/submissions", response_model=list[SubmissionWithStudentOut])
def list_exam_submissions(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_exam(exam_id, db, current_user)

    # Outer join: bulk-tagged rows have no student_id, so an inner join
    # would silently drop every one of them from an instructor's view.
    rows = (
        db.query(ExamSubmission, User.email)
        .outerjoin(User, ExamSubmission.student_id == User.id)
        .filter(ExamSubmission.exam_id == exam_id)
        .order_by(ExamSubmission.submitted_at.desc())
        .all()
    )
    return [
        SubmissionWithStudentOut(
            id=s.id,
            exam_id=s.exam_id,
            original_filename=s.original_filename,
            content_type=s.content_type,
            indexed=s.indexed,
            submitted_at=s.submitted_at,
            student_email=email,
            student_id_number=s.student_id_number,
        )
        for s, email in rows
    ]


@router.post(
    "/exams/{exam_id}/bulk-submissions",
    response_model=BulkSubmissionResult,
    status_code=status.HTTP_201_CREATED,
)
def bulk_upload_submissions(
    exam_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    mapping_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Instructor bulk-upload for the passcode exam-link flow: every
    student's document for this exam in one request, tagged to a
    student_id_number via a mapping spreadsheet instead of one-by-one
    selection — the only way this is practical at ~160 students. All-or-
    nothing: if the mapping doesn't cleanly account for every uploaded file
    (and vice versa), nothing is written, so a typo can't silently attach
    one student's exam material to another student's ID number."""
    get_owned_exam(exam_id, db, current_user)

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")
    if len(files) > MAX_BULK_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Too many files (max {MAX_BULK_FILES} per batch)"
        )

    try:
        mapping_rows = parse_mapping_file(mapping_file.file.read(), mapping_file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not mapping_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mapping file has no usable rows")

    file_contents: dict[str, bytes] = {}
    uploaded_filenames: list[str] = []
    for f in files:
        fname = f.filename or ""
        uploaded_filenames.append(fname)
        contents = f.file.read()
        if len(contents) > MAX_SUBMISSION_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"{fname}: file too large (max 25MB)"
            )
        file_contents[fname] = contents

    errors = validate_bulk_mapping(mapping_rows, uploaded_filenames)

    resolved_types: dict[str, tuple[str, str]] = {}
    unsupported: list[str] = []
    for fname in uploaded_filenames:
        matching_file = next(f for f in files if (f.filename or "") == fname)
        resolved = resolve_upload_type(matching_file.content_type, fname)
        if resolved is None:
            unsupported.append(fname)
        else:
            resolved_types[fname] = resolved
    if unsupported:
        errors["unsupported_file_type"] = sorted(unsupported)

    if errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"errors": errors})

    norm_to_sid = {fname.strip().lower(): sid for sid, fname in mapping_rows}
    created = 0
    updated = 0
    failed_indexing: list[str] = []

    for fname, contents in file_contents.items():
        student_id_number = norm_to_sid[fname.strip().lower()]
        content_type, extension = resolved_types[fname]

        submission = (
            db.query(ExamSubmission)
            .filter(
                ExamSubmission.exam_id == exam_id,
                ExamSubmission.student_id_number == student_id_number,
            )
            .first()
        )
        is_update = submission is not None
        submission_id = submission.id if submission else uuid.uuid4()

        if is_update:
            submission.original_filename = fname
            submission.content_type = content_type
            submission.indexed = False
            updated += 1
        else:
            submission = ExamSubmission(
                id=submission_id,
                exam_id=exam_id,
                student_id_number=student_id_number,
                original_filename=fname,
                content_type=content_type,
            )
            db.add(submission)
            created += 1
        db.commit()
        db.refresh(submission)

        try:
            # Extracted once from a temp file (auto-deleted on exit) and
            # never persisted — only the resulting indexed text is kept
            # (as embedded chunks in pgvector), not the original document.
            with tempfile.NamedTemporaryFile(suffix=extension) as tmp:
                tmp.write(contents)
                tmp.flush()
                text = extract_text_from_material(tmp.name, content_type)
            chunks = chunk_text(text)
            index_submission_chunks(submission.id, exam_id, student_id_number, chunks)
            submission.indexed = True
            db.commit()
        except Exception:
            logger.exception("Failed to index bulk submission %s (%s) for RAG retrieval", submission.id, fname)
            failed_indexing.append(fname)

    return BulkSubmissionResult(
        total=len(file_contents), created=created, updated=updated, failed_indexing=failed_indexing
    )
