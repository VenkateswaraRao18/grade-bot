"""One-off cleanup: strip all test/dummy data so the app is ready for a real
assignment + real student-submission validation pass. Deletes every exam (and
everything under it: scope, attempts, questions, responses, grades, grading
details, audit log), the one fabricated submission, its vector-store chunks
and file, and every stray test user account — keeping only the real course,
its 9 real assignments, and the two demo accounts (instructor@demo.com,
student@demo.com). Run once; not meant to be re-run or scheduled."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models.exam import Exam, ExamScope
from app.models.exam_attempt import ExamAttempt, Question, Response
from app.models.grade import AuditLog, Grade, GradingDetail
from app.models.submission import AssignmentSubmission
from app.models.user import User
from app.services.vector_store import delete_submission_chunks

KEEP_EMAILS = {"instructor@demo.com", "student@demo.com"}

db = SessionLocal()

attempt_ids = [row[0] for row in db.execute(select(ExamAttempt.id))]
question_ids = [row[0] for row in db.execute(select(Question.id))]
grade_ids = [row[0] for row in db.execute(select(Grade.id))]

print(f"Deleting {len(grade_ids)} grades, {len(question_ids)} questions, {len(attempt_ids)} attempts...")
db.execute(delete(AuditLog).where(AuditLog.entity_type == "grade", AuditLog.entity_id.in_(grade_ids)))
db.execute(delete(GradingDetail).where(GradingDetail.grade_id.in_(grade_ids)))
db.execute(delete(Grade).where(Grade.id.in_(grade_ids)))
db.execute(delete(Response).where(Response.question_id.in_(question_ids)))
db.execute(delete(Question).where(Question.id.in_(question_ids)))
db.execute(delete(ExamAttempt).where(ExamAttempt.id.in_(attempt_ids)))
db.execute(delete(ExamScope))
exam_ids = [row[0] for row in db.execute(select(Exam.id))]
db.execute(delete(Exam).where(Exam.id.in_(exam_ids)))
print(f"Deleted {len(exam_ids)} exams and their scope.")

submissions = db.execute(select(AssignmentSubmission)).scalars().all()
for s in submissions:
    delete_submission_chunks(s.id)
    if os.path.exists(s.file_path):
        os.remove(s.file_path)
    print(f"Removed submission {s.id} (vector chunks + file) for assignment {s.assignment_id}")
db.execute(delete(AssignmentSubmission))

stray_users = db.execute(select(User).where(User.email.notin_(KEEP_EMAILS))).scalars().all()
for u in stray_users:
    print(f"Deleting stray user: {u.email} ({u.role.value})")
db.execute(delete(User).where(User.email.notin_(KEEP_EMAILS)))

db.commit()
db.close()
print("Cleanup complete.")
