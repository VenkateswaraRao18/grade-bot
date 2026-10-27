# CLAUDE.md

This file guides Claude Code when working in this repository. Read it fully before making changes. When scope, architecture, or priorities are unclear, prefer the MVP boundary defined here over the original full-vision spec.

---

## 1. Project Overview

**AI-Powered Oral Examination Platform** — a system that lets instructors run voice-based oral exams for a course, with AI conducting the exam and producing a preliminary grade for instructor review.

This is a **student/independent research + engineering project**, not a production SaaS. Optimize for: working end-to-end demo, clean architecture that supports later expansion, and code that's easy to explain to a professor — not for handling scale or edge cases beyond what's listed below.

The long-term vision (multi-LLM grading councils, continuous proctoring, Canvas LTI integration, research experiment framework) is documented in `docs/full-vision.md` (paste the original spec there) for reference. **Do not build those parts unless explicitly asked.** This file describes what to build *now*.

---

## 2. MVP Scope — What We're Building

### In scope
- **Standalone auth**: email/password login + role (`student` / `instructor`). Lightweight identity check: student captures/uploads a photo of their ID, OCR extracts a student ID number (U-number), system matches it against the enrolled roster. No liveness detection, no continuous re-verification, no device/environment sweep.
- **Course setup**: instructor creates course → modules → uploads course materials (PDFs, notes, assignment descriptions).
- **RAG pipeline**: uploaded materials are chunked, embedded, and stored in a vector DB. Question generation retrieves from this store, scoped to the exam's assigned modules. Every generated question must be traceable to its source chunk(s).
- **Exam configuration**: instructor sets exam name, module/assignment scope, duration, difficulty, question count range, adaptive on/off, thinking time.
- **Voice oral exam**: student goes through pre-exam checks (mic/camera permission + ID photo match) → clicks "Start Exam" → server starts an authoritative timer → adaptive voice Q&A within scope → exam ends on time expiry or examiner determination.
- **Adaptive examiner agent**: analyzes each answer, decides follow-up vs. new topic vs. difficulty change, stays within instructor-defined scope (hard constraint, not just prompt instruction — see §6).
- **Transcript storage**: full Q&A transcript with timestamps stored per attempt.
- **Single-LLM grading**: one LLM grades the transcript against an instructor-defined rubric. Produces overall score, criterion-level scores, evidence excerpts, strengths/weaknesses, confidence.
- **Grade lifecycle** (full state machine): `DRAFT → AI_GRADED → INSTRUCTOR_REVIEW → FINALIZED → PUBLISHED`. Student sees nothing until `PUBLISHED`. Any instructor edit to a grade is audit-logged (who, when, old value, new value, reason if given).
- **Two portals, one backend**: instructor portal (course/exam management, review/override/finalize/publish) and student portal (available exams, take exam, view published grades/feedback only), both role-gated on the same FastAPI backend + Postgres DB.

### Explicitly deferred (do not build in MVP)
- Continuous proctoring agent (camera/mic monitoring during exam, frame-leaving detection, multi-voice detection, environment sweep)
- Multi-LLM grading council (multiple providers, disagreement resolution, chair model) — MVP uses **one** grader
- Canvas LTI integration and Canvas API content sync — MVP is fully standalone; design auth and content-ingestion as swappable modules so Canvas can plug in later without a rewrite (see §9)
- Research experiment framework, metrics dashboards (A/B testing infra, inter-rater reliability tooling, scalability load testing)
- Advanced device/environment checks beyond basic browser permission prompts

If a task description implies building any of the deferred items, stop and flag it rather than implementing it.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React / Next.js |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| Vector store | Chroma or FAISS (local, MVP-appropriate; pgvector is a fine later migration, not needed now) |
| LLM | Single provider for MVP grading + examiner (pick one — e.g. Anthropic or OpenAI — and keep the call behind an interface so it's swappable) |
| STT/TTS | Provider TBD (e.g. ElevenLabs or equivalent) — wrap behind an interface, don't hard-couple |
| Auth | Custom (email/password, JWT session), not Canvas SSO for MVP |
| File/object storage | Local disk or S3-compatible storage for audio + uploaded materials |

**Principle**: every external AI/voice provider call goes through a thin internal interface (e.g. `LLMProvider`, `STTProvider`, `TTSProvider`) so providers can be swapped or multiplied later (multi-LLM council, Canvas auth) without touching business logic.

---

## 4. Core Entities (Database)

Minimum tables for MVP — implement these before anything fancier:

- `users` (id, email, password_hash, role, student_id_number, created_at)
- `courses` (id, name, instructor_id)
- `modules` (id, course_id, title, description)
- `course_materials` (id, module_id, file_path, content_type, ingested_at) — source docs for RAG
- `material_chunks` (id, material_id, chunk_text, embedding, metadata) — or external vector store with a foreign reference back to `material_id`
- `assignments` (id, module_id, title, description)
- `exams` (id, course_id, name, duration_minutes, difficulty, min_questions, max_questions, adaptive_enabled, thinking_time_seconds, status)
- `exam_scope` (exam_id, module_id) — many-to-many, defines what's in/out of bounds for question generation
- `exam_attempts` (id, exam_id, student_id, status, started_at, server_start_time, ended_at)
- `questions` (id, attempt_id, sequence, text, source_chunk_ids, difficulty, is_followup, parent_question_id)
- `responses` (id, question_id, transcript_text, audio_ref, answered_at)
- `transcripts` (id, attempt_id, full_text, created_at) — or derive from `questions` + `responses`; pick one, don't duplicate
- `grades` (id, attempt_id, status [DRAFT/AI_GRADED/INSTRUCTOR_REVIEW/FINALIZED/PUBLISHED], ai_score, instructor_score, published_at)
- `grading_details` (id, grade_id, criterion, score, evidence_text, reasoning)
- `audit_log` (id, actor_id, action, entity_type, entity_id, old_value, new_value, timestamp)

Keep IDs as UUIDs. Index foreign keys and any field used in student/instructor dashboard filtering (`exam_attempts.student_id`, `exam_attempts.exam_id`, `grades.status`).

---

## 5. Agent Architecture (MVP)

Only these two agents for MVP — do not build the Authentication Agent or Proctoring Agent as described in the original spec; their MVP-equivalent logic is plain application code (see §2).

- **Examiner Agent**: drives the live exam. Given exam scope + retrieved course content + conversation history, decides next question or follow-up. Must enforce scope programmatically (filter retrieval to `exam_scope` modules; validate generated question's source chunks belong to allowed modules before asking it — reject/regenerate if not).
- **Grading Agent**: given the full transcript + rubric, produces structured grade output (overall score, per-criterion scores, evidence, strengths/weaknesses, confidence). Single LLM call/session for MVP — but structure its output and prompt so a second/third grader could be added later without redesigning the schema (`grading_details` already supports multiple entries per grade if you later add a `grader_id` column).

---

## 6. Timing Rules

- Timer is **server-authoritative**. `exam_attempts.server_start_time` is set when the backend receives the "Start Exam" confirmation — not when the client claims it started.
- Client sends periodic heartbeats; backend is the source of truth for "time remaining" and for ending the attempt when time expires, even if the client disconnects.
- No timer activity during auth, permission checks, or rules acknowledgment — only after explicit "Start Exam" confirmation reaches the backend.

---

## 7. Grade Visibility Rule

Hard rule, enforce at the API layer, not just the UI: any endpoint returning grade data to a student-role user must filter to `status = PUBLISHED` only. Do not rely on the frontend to hide unpublished grades — a student hitting the API directly must not be able to see `DRAFT`/`AI_GRADED`/`INSTRUCTOR_REVIEW`/`FINALIZED` grades or scores.

---

## 8. Security Baseline for MVP

- Role-based access control at the API layer (student / instructor), checked per-endpoint, not assumed from frontend routing.
- Students can only access their own attempts/grades/transcripts.
- Instructors can only access courses/exams they own (no cross-instructor data leakage) — admin role can be deferred unless needed for the demo.
- Exam questions are not exposed to the student ahead of time; question generation happens server-side during the live session.
- Audit-log every instructor grade change (§4, `audit_log`).

---

## 9. Design-for-Future (don't build, but don't block)

Keep these seams open since they're the near-term roadmap after the demo:

- Auth: keep it behind a service boundary so LTI 1.3 launch can later replace/augment the login flow without rewriting course/exam logic.
- Content ingestion: keep material upload as its own service/module so a future Canvas API sync job can feed the same `course_materials` → chunking pipeline instead of manual upload.
- Grading: `grading_details` schema should tolerate multiple graders per `grade_id` later without migration pain.
- Proctoring: leave a place in `exam_attempts` (or a future `proctoring_events` table) conceptually reserved, but do not implement event generation now.

---

## 10. Working Method

- Work milestone by milestone. Do not implement multiple unrelated features in one pass.
- Before writing code for a milestone: confirm scope, propose folder structure/approach briefly, then implement.
- Do not claim a feature works until it's actually been run/tested.
- Prefer boring, explainable solutions over clever ones — this needs to be defensible to a professor, not impressive to engineers.
- If a request would pull in a deferred feature (§2), flag it explicitly rather than quietly building it.