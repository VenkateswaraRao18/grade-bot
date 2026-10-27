import { CheckCircle2 } from "lucide-react";

/** A drawn mock-up, not a real photo — students have never seen this capture
 * flow before and otherwise have no idea what "a photo of your ID" should
 * look like (whole card? just the name? the barcode?). Shows the shape of a
 * good capture (flat card, all corners in frame, text legible) without
 * needing a real ID image as an asset. */
export function IdCardSample() {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="200" height="128" viewBox="0 0 200 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="198" height="126" rx="10" fill="#fafafa" stroke="#d4d4d8" strokeDasharray="4 4" />
        <rect x="24" y="20" width="152" height="88" rx="6" fill="white" stroke="#a1a1aa" strokeWidth="1.5" />
        <rect x="36" y="32" width="34" height="40" rx="3" fill="#e4e4e7" />
        <circle cx="53" cy="47" r="8" fill="#d4d4d8" />
        <path d="M41 68c2-7 7.5-10 12-10s10 3 12 10" stroke="#d4d4d8" strokeWidth="2" strokeLinecap="round" />
        <rect x="80" y="34" width="70" height="6" rx="3" fill="#d4d4d8" />
        <rect x="80" y="46" width="54" height="5" rx="2.5" fill="#e4e4e7" />
        <rect x="80" y="58" width="60" height="5" rx="2.5" fill="#e4e4e7" />
        <rect x="80" y="74" width="62" height="7" rx="3" fill="#bae6fd" />
        <text x="83" y="79.5" fontFamily="monospace" fontSize="7" fill="#0369a1">
          U12345678
        </text>
        <rect x="36" y="88" width="104" height="10" rx="2" fill="#f4f4f5" stroke="#e4e4e7" />
      </svg>
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        Fit the whole card in frame, flat and well-lit
      </div>
    </div>
  );
}
