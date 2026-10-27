import { CheckCircle2 } from "lucide-react";

/** Same drawn-mock-up approach as IdCardSample, for the end-of-exam photo —
 * this step needs BOTH the student's face and their ID card visible in one
 * shot (not just the card), so the student can confirm who they are, not
 * just that some ID exists. A different sample from IdCardSample since the
 * composition is genuinely different: face framed above, card held up
 * lower in frame, overlapping the chest. */
export function FaceWithIdSample() {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="160" height="176" viewBox="0 0 160 176" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="158" height="174" rx="10" fill="#fafafa" stroke="#d4d4d8" strokeDasharray="4 4" />

        {/* head + shoulders */}
        <circle cx="80" cy="52" r="30" fill="#e4e4e7" />
        <path
          d="M28 150c3-28 22-44 52-44s49 16 52 44v10H28z"
          fill="#e4e4e7"
        />

        {/* ID card held up in front of the chest */}
        <rect x="42" y="100" width="76" height="48" rx="5" fill="white" stroke="#a1a1aa" strokeWidth="1.5" />
        <rect x="50" y="109" width="17" height="20" rx="2" fill="#d4d4d8" />
        <rect x="71" y="111" width="38" height="5" rx="2.5" fill="#d4d4d8" />
        <rect x="71" y="121" width="30" height="4" rx="2" fill="#e4e4e7" />
        <rect x="50" y="134" width="59" height="6" rx="3" fill="#bae6fd" />
      </svg>
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        Show your face and your ID card together
      </div>
    </div>
  );
}
