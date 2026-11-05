import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.exam_link import ExamLink
from app.models.user import User, UserRole
from app.routers.exams import get_owned_exam
from app.schemas.exam_link import ExamLinkCreateOut, ExamLinkOut

router = APIRouter(tags=["exam-links"])

# Unambiguous alphabet (no 0/O, 1/I/L confusion) — this gets typed by hand
# off a Canvas page or a shared screen, not pasted.
PASSCODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
PASSCODE_LENGTH = 6


def _generate_passcode() -> str:
    return "".join(secrets.choice(PASSCODE_ALPHABET) for _ in range(PASSCODE_LENGTH))


@router.post("/exams/{exam_id}/link", response_model=ExamLinkCreateOut, status_code=status.HTTP_201_CREATED)
def generate_exam_link(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Creates this exam's public passcode link, or rotates it in place if
    one already exists — one shared link + passcode per exam (CLAUDE.md
    pivot: no student accounts; instructor pastes this into Canvas
    manually). Rotating invalidates the old passcode immediately, since the
    old link_token is overwritten rather than kept alive alongside a new
    one."""
    exam = get_owned_exam(exam_id, db, current_user)

    link = db.query(ExamLink).filter(ExamLink.exam_id == exam_id).first()
    passcode = _generate_passcode()
    link_token = secrets.token_urlsafe(12)

    if link is None:
        link = ExamLink(exam_id=exam.id, link_token=link_token, passcode=passcode)
        db.add(link)
    else:
        link.link_token = link_token
        link.passcode = passcode
    db.commit()
    db.refresh(link)

    return ExamLinkCreateOut(exam_id=exam.id, link_token=link.link_token, passcode=passcode)


@router.get("/exams/{exam_id}/link", response_model=ExamLinkOut)
def get_exam_link(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Returns the passcode too, not just the link token — it's stored in
    plaintext (see models.ExamLink) specifically so the instructor can look
    it up any time, not just once at generation."""
    exam = get_owned_exam(exam_id, db, current_user)
    link = db.query(ExamLink).filter(ExamLink.exam_id == exam_id).first()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No link generated yet")
    return ExamLinkOut(exam_id=exam.id, link_token=link.link_token, passcode=link.passcode)
