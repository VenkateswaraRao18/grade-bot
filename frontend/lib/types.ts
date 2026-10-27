export interface Exam {
  id: string;
  instructor_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  difficulty: "easy" | "medium" | "hard";
  min_questions: number;
  max_questions: number;
  adaptive_enabled: boolean;
  thinking_time_seconds: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  rubric: string;
  sample_questions: string | null;
  instructor_answer: string | null;
}

export interface ExamSubmission {
  id: string;
  exam_id: string;
  original_filename: string;
  content_type: string;
  indexed: boolean;
  submitted_at: string;
  // Exactly one is set — the legacy self-service path sets student_email,
  // the instructor bulk-tagged path sets student_id_number.
  student_email: string | null;
  student_id_number: string | null;
}

export interface BulkSubmissionResult {
  total: number;
  created: number;
  updated: number;
  failed_indexing: string[];
}

export interface ExamLink {
  exam_id: string;
  link_token: string;
}

export interface ExamLinkCreate extends ExamLink {
  passcode: string;
}

export interface AttemptRow {
  attempt_id: string;
  student_email: string;
  candidate_name: string | null;
  candidate_id_number: string | null;
  account_email: string | null;
  status: string;
  ended_at: string | null;
  ended_reason: string | null;
  grade_id: string | null;
  grade_status: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
  instructor_score: number | null;
  share_token: string | null;
}

export interface PendingReview {
  attempt_id: string;
  student_email: string;
  exam_name: string;
  ended_at: string;
  ended_reason: string | null;
  grade_status: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
}

export interface InstructorStats {
  exam_count: number;
  completed_attempt_count: number;
  published_grade_count: number;
}

export interface ClaudeUsageByCallType {
  call_type: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
}

export interface GeminiUsageByCallType {
  call_type: string;
  call_count: number;
  input_tokens: number;
  estimated_cost_usd: number | null;
}

export interface ApiUsage {
  claude: {
    model: string;
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_estimated_cost_usd: number;
    has_unpriced_calls: boolean;
    by_call_type: ClaudeUsageByCallType[];
    note: string;
  };
  gemini: {
    model: string;
    total_calls: number;
    total_input_tokens: number;
    total_estimated_cost_usd: number;
    has_unpriced_calls: boolean;
    by_call_type: GeminiUsageByCallType[];
    note: string;
  } | null;
  elevenlabs: {
    characters_used: number;
    characters_limit: number;
    characters_remaining: number | null;
    tier: string | null;
    next_reset_unix: number | null;
  } | null;
  elevenlabs_error: string | null;
}

export interface GradingDetail {
  id: string;
  criterion: string;
  score: number;
  max_score: number;
  evidence_text: string | null;
  reasoning: string | null;
}

export interface Grade {
  id: string;
  attempt_id: string;
  status: string;
  ai_score: number | null;
  ai_max_score: number | null;
  instructor_score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  instructor_feedback: string | null;
  confidence: number | null;
  details: GradingDetail[];
}

export interface TranscriptEntry {
  sequence: number;
  question: string;
  is_followup: boolean;
  is_generalization: boolean;
  is_graded: boolean;
  difficulty: string;
  answer: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
  ai_feedback: string | null;
  ai_criterion: string | null;
  source_excerpt: string | null;
  highlight_terms: string[] | null;
}

export interface GradeReview {
  grade: Grade;
  transcript: TranscriptEntry[];
  student_email: string;
  exam_name: string;
}

export interface PublicResults {
  exam_name: string;
  candidate_name: string | null;
  score: number | null;
  max_score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  instructor_feedback: string | null;
  published_at: string | null;
  details: GradingDetail[];
  transcript: TranscriptEntry[];
}

export interface AttemptContext {
  student_email: string;
  exam_name: string;
  status: string;
  ended_reason: string | null;
  has_end_photo: boolean;
  has_id_photo: boolean;
}

export interface AuditLogEntry {
  id: string;
  actor_email: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  timestamp: string;
}
