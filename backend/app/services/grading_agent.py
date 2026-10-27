import json
import re
from dataclasses import dataclass

from app.services.llm_provider import llm_provider
from app.services.prompts import GRADING_SYSTEM_PROMPT as SYSTEM_PROMPT
from app.services.prompts import REFERENCE_ANSWER_BLOCK


@dataclass
class CriterionGrade:
    name: str
    score: float
    max_score: float
    evidence: str
    reasoning: str


@dataclass
class QuestionGrade:
    sequence: int
    score: float
    max_score: float
    feedback: str
    criterion: str


@dataclass
class GradingResult:
    overall_score: float
    overall_max: float
    confidence: float
    strengths: str
    weaknesses: str
    criteria: list[CriterionGrade]
    questions: list[QuestionGrade]


def _parse_llm_json(raw: str) -> dict | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def grade_transcript(rubric: str, transcript: str, reference_answers: str = "") -> GradingResult:
    reference_block = REFERENCE_ANSWER_BLOCK.format(reference_answers=reference_answers) if reference_answers else ""
    user_prompt = f"{reference_block}Rubric:\n{rubric}\n\nTranscript:\n{transcript}"
    # Per-question feedback means output length scales with question count —
    # 2048 (enough for the old aggregate-only response) truncates mid-JSON
    # on an 8-question exam. Scale generously with transcript size instead
    # of hard-coding a count.
    max_tokens = min(8192, 2048 + len(transcript) // 2)
    raw = llm_provider.generate(user_prompt, system=SYSTEM_PROMPT, max_tokens=max_tokens, usage_label="grading")
    parsed = _parse_llm_json(raw)

    if parsed is None:
        # Fail safe rather than fail hard: a low-confidence draft the
        # instructor must review, never a fabricated high score.
        return GradingResult(
            overall_score=0,
            overall_max=100,
            confidence=0,
            strengths="",
            weaknesses="Automated grading could not parse a response — instructor review required.",
            criteria=[],
            questions=[],
        )

    questions = [
        QuestionGrade(
            sequence=int(q.get("sequence", 0)),
            score=min(max(float(q.get("score", 0)), 0.0), 10.0),
            max_score=10.0,
            feedback=q.get("feedback", ""),
            criterion=q.get("criterion", ""),
        )
        for q in parsed.get("questions", [])
    ]
    exam_average_ratio = (
        sum(q.score for q in questions) / len(questions) / 10 if questions else 0.0
    )

    # A criterion's score is never a number the LLM reports directly — it is
    # the average of the question scores tagged to it, scaled to the
    # criterion's points. This is the one and only scoring chain on this
    # page: question score -> criterion score -> overall score, so every
    # number can be hand-verified from the ones next to it.
    criteria = []
    for c in parsed.get("criteria", []):
        name = c.get("name", "Unnamed criterion")
        max_score = float(c.get("max_score", 100)) or 100.0
        tagged = [q for q in questions if q.criterion == name]
        if tagged:
            ratio = sum(q.score for q in tagged) / len(tagged) / 10
            derivation = ", ".join(f"Q{q.sequence} ({q.score:g}/10)" for q in tagged)
        else:
            ratio = exam_average_ratio
            derivation = "no question was tagged to this criterion — used the exam's overall average instead"
        score = round(ratio * max_score, 1)
        reasoning = c.get("reasoning", "")
        reasoning = f"{reasoning} Derived from {derivation}." if reasoning else f"Derived from {derivation}."
        criteria.append(
            CriterionGrade(
                name=name,
                score=score,
                max_score=max_score,
                evidence=c.get("evidence", ""),
                reasoning=reasoning,
            )
        )

    # overall_score is always the sum of the criteria breakdown, never a
    # separate number the LLM made up — so it can never disagree with the
    # per-criterion scores shown to the instructor. It's reported on
    # whatever scale the rubric's own points add up to (e.g. 10+10+10=30),
    # not forced onto a 0-100 scale, so "24/30" means exactly what it says.
    total_max = sum(c.max_score for c in criteria)
    total_score = sum(c.score for c in criteria)

    return GradingResult(
        overall_score=round(total_score, 1),
        overall_max=total_max if total_max > 0 else 100,
        confidence=float(parsed.get("confidence", 0)),
        strengths=parsed.get("strengths", ""),
        weaknesses=parsed.get("weaknesses", ""),
        criteria=criteria,
        questions=questions,
    )


def build_transcript(qa_pairs: list[tuple[int, str, str | None]]) -> str:
    """qa_pairs: (sequence, question, answer) — sequence is the question's
    real DB sequence number (not its position in this possibly-filtered
    list), so the grading LLM's "sequence" tags map back to the right
    question when callers only pass graded Q&A pairs."""
    lines = []
    for sequence, question, answer in qa_pairs:
        lines.append(f"Q{sequence}: {question}")
        lines.append(f"A{sequence}: {answer or '(no answer recorded)'}")
    return "\n".join(lines)
