from app.models.exam_attempt import ExamAttempt
from app.models.user import User


def attempt_display_name(attempt: ExamAttempt, student: User | None) -> str:
    """A human-readable label for who took this attempt — a logged-in
    student's email (legacy path), or, for the passcode-link flow, the name
    they typed in at ID verification plus the ID number OCR matched them
    to."""
    if student is not None:
        return student.email
    if attempt.candidate_name:
        return f"{attempt.candidate_name} ({attempt.candidate_id_number})"
    return attempt.candidate_id_number or "Unknown"
