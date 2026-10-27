"""Seeds demo courses/modules/materials for instructor@demo.com so the
instructor portal isn't empty on first look. Safe to re-run — skips courses
that already exist by name. Does not touch users, grades, or exams (those
tables don't exist yet / aren't seeded to avoid faking unbuilt features)."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.course import Course, CourseMaterial, Module  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.core.config import settings  # noqa: E402

INSTRUCTOR_EMAIL = "instructor@demo.com"

COURSES = [
    {
        "name": "Operating Systems",
        "modules": [
            {
                "title": "Process Scheduling",
                "description": "FCFS, SJF, Round Robin, and priority scheduling.",
                "materials": [
                    (
                        "scheduling_notes.txt",
                        "Process scheduling determines which process runs next on the CPU.\n"
                        "FCFS (First-Come First-Served) runs processes in arrival order and can\n"
                        "cause the convoy effect, where short processes wait behind long ones.\n"
                        "SJF (Shortest Job First) minimizes average waiting time but requires\n"
                        "knowing burst times in advance. Round Robin gives each process a fixed\n"
                        "time quantum and is the basis for most modern time-sharing systems.\n"
                        "Priority scheduling can cause starvation unless aging is used.",
                    )
                ],
            },
            {
                "title": "Memory Management",
                "description": "Paging, segmentation, and virtual memory.",
                "materials": [
                    (
                        "memory_notes.txt",
                        "Paging divides memory into fixed-size frames and pages, eliminating\n"
                        "external fragmentation but introducing internal fragmentation. Virtual\n"
                        "memory lets processes use more memory than physically available via\n"
                        "demand paging, backed by a page replacement policy such as LRU or\n"
                        "Clock. A page fault occurs when a referenced page is not in memory.",
                    )
                ],
            },
        ],
    },
    {
        "name": "Database Systems",
        "modules": [
            {
                "title": "Normalization",
                "description": "Functional dependencies and normal forms (1NF-BCNF).",
                "materials": [
                    (
                        "normalization_notes.txt",
                        "Normalization organizes relational data to reduce redundancy and avoid\n"
                        "update anomalies. First Normal Form (1NF) requires atomic column values.\n"
                        "Second Normal Form (2NF) removes partial dependencies on a composite key.\n"
                        "Third Normal Form (3NF) removes transitive dependencies. BCNF is a\n"
                        "stricter version of 3NF where every determinant is a candidate key.",
                    )
                ],
            },
            {
                "title": "Transactions & Concurrency",
                "description": "ACID properties, isolation levels, and locking.",
                "materials": [
                    (
                        "transactions_notes.txt",
                        "A transaction is a unit of work that is Atomic, Consistent, Isolated,\n"
                        "and Durable (ACID). Isolation levels (Read Uncommitted, Read Committed,\n"
                        "Repeatable Read, Serializable) trade off consistency for concurrency.\n"
                        "Two-phase locking guarantees serializability by separating a growing\n"
                        "phase, where locks are acquired, from a shrinking phase, where they\n"
                        "are released.",
                    )
                ],
            },
        ],
    },
]


def main():
    db = SessionLocal()
    try:
        instructor = db.query(User).filter(User.email == INSTRUCTOR_EMAIL).first()
        if instructor is None:
            instructor = User(
                email=INSTRUCTOR_EMAIL,
                password_hash=hash_password("password123"),
                role=UserRole.instructor,
            )
            db.add(instructor)
            db.commit()
            db.refresh(instructor)
            print(f"Created instructor {INSTRUCTOR_EMAIL}")

        storage_dir = Path(settings.course_material_storage_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)

        for course_data in COURSES:
            course = (
                db.query(Course)
                .filter(Course.name == course_data["name"], Course.instructor_id == instructor.id)
                .first()
            )
            if course is not None:
                print(f"Skipping existing course: {course_data['name']}")
                continue

            course = Course(name=course_data["name"], instructor_id=instructor.id)
            db.add(course)
            db.commit()
            db.refresh(course)
            print(f"Created course: {course.name}")

            for module_data in course_data["modules"]:
                module = Module(
                    course_id=course.id,
                    title=module_data["title"],
                    description=module_data["description"],
                )
                db.add(module)
                db.commit()
                db.refresh(module)
                print(f"  Created module: {module.title}")

                for filename, content in module_data["materials"]:
                    import uuid

                    material_id = uuid.uuid4()
                    dest_path = storage_dir / f"{material_id}.txt"
                    dest_path.write_text(content)

                    material = CourseMaterial(
                        id=material_id,
                        module_id=module.id,
                        file_path=str(dest_path),
                        original_filename=filename,
                        content_type="text/plain",
                    )
                    db.add(material)
                    db.commit()
                    print(f"    Uploaded material: {filename}")

        print("\nSeed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
