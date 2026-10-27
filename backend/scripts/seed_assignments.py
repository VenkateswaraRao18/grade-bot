"""Seeds the real assignments for the Business Analytics course, each
attached to the module the instructor's Canvas lists it under (assignments
are due after the week they cover, so the module pairing is intentionally
offset from the assignment title — this mirrors the real course exactly,
not a mistake to "fix")."""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.assignment import Assignment  # noqa: E402
from app.models.course import Course, Module  # noqa: E402
from app.models.user import User  # noqa: E402

INSTRUCTOR_EMAIL = "instructor@demo.com"
COURSE_NAME = "Business Analytics"

# (assignment title, module title substring to match, due_at, points_possible)
ASSIGNMENTS = [
    (
        "A1. Wages: Summary Statistics",
        "Week 3 (Feb 2): Descriptive Analytics: Graphs & Pivot Tables",
        datetime(2026, 2, 2, 17, 0, tzinfo=timezone.utc),
        5,
    ),
    (
        "A2. Wages: Graphs & Pivot Tables",
        "Week 4 (Feb 9): Probability Distributions",
        datetime(2026, 2, 9, 17, 0, tzinfo=timezone.utc),
        10,
    ),
    (
        "A3. Probability Distributions",
        "Week 5 (Feb 16): Point & Interval Estimates",
        datetime(2026, 2, 16, 17, 0, tzinfo=timezone.utc),
        10,
    ),
    (
        "A4. Sampling Distributions",
        "Week 6 (Feb 23): Hypotheses Testing I",
        datetime(2026, 2, 23, 17, 0, tzinfo=timezone.utc),
        10,
    ),
    (
        "A5. Hypothesis Testing I",
        "Week 7 (Mar 2): Hypotheses Testing II",
        datetime(2026, 3, 2, 17, 0, tzinfo=timezone.utc),
        12,
    ),
    (
        "A6. China Star Delivery",
        "Week 11 (Mar 30): Simple & Multiple Regression",
        datetime(2026, 3, 30, 17, 0, tzinfo=timezone.utc),
        12,
    ),
    (
        "A7. Original Italian Pizza",
        "Week 12 (Apr 6): Multiple Regression Assumptions & Interaction Effects",
        datetime(2026, 4, 6, 19, 45, tzinfo=timezone.utc),
        10,
    ),
    (
        "A8. Auto Insurance Risk Prediction",
        "Week 14 (Apr 20): Time Series Forecasting",
        datetime(2026, 4, 20, 17, 0, tzinfo=timezone.utc),
        15,
    ),
    (
        "A9. Coffee Sales Forecasting & Explanation",
        "Week 15 (Apr 27): No Class",
        datetime(2026, 4, 27, 17, 0, tzinfo=timezone.utc),
        15,
    ),
]


def main():
    db = SessionLocal()
    try:
        instructor = db.query(User).filter(User.email == INSTRUCTOR_EMAIL).first()
        if instructor is None:
            print(f"No instructor {INSTRUCTOR_EMAIL} found — run seed_business_analytics.py first.")
            return

        course = db.query(Course).filter(Course.name == COURSE_NAME, Course.instructor_id == instructor.id).first()
        if course is None:
            print(f"No course '{COURSE_NAME}' found — run seed_business_analytics.py first.")
            return

        modules = {m.title: m for m in db.query(Module).filter(Module.course_id == course.id).all()}

        for title, module_title, due_at, points in ASSIGNMENTS:
            module = modules.get(module_title)
            if module is None:
                print(f"  SKIP '{title}': no module titled '{module_title}' found")
                continue

            existing = db.query(Assignment).filter(
                Assignment.module_id == module.id, Assignment.title == title
            ).first()
            if existing is not None:
                print(f"  Skipping existing assignment: {title}")
                continue

            assignment = Assignment(
                module_id=module.id, title=title, due_at=due_at, points_possible=points
            )
            db.add(assignment)
            db.commit()
            print(f"  Created assignment: {title} -> {module_title}")

        print("\nSeed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
