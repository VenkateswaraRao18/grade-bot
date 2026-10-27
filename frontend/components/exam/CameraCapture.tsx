"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  /** "large" fills most of the viewport for a dedicated full-page capture step; "compact" (default) is the small inline size. */
  size?: "compact" | "large";
}

/** Live in-browser camera capture via getUserMedia only — not a bare
 * `<input type="file" capture>`, which only opens a real camera on mobile;
 * on desktop browsers it silently falls back to a plain file picker, which
 * reads as "the camera isn't opening" since nothing camera-like appears.
 * Deliberately no file-upload fallback: this is used for identity photos
 * (start-of-exam ID check, end-of-exam recheck), where letting someone
 * upload an arbitrary existing image file instead of capturing one live
 * would defeat the point of the check. */
export function CameraCapture({ onCapture, size = "compact" }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function openCamera() {
    setError(null);
    try {
      // A soft preference, not a hard constraint — a hard { facingMode:
      // "environment" } fails outright on laptops with only a front camera.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError("Could not access your camera. Check your browser's camera permission and try again.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], "id-photo.jpg", { type: "image/jpeg" }));
        closeCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  const large = size === "large";

  if (active) {
    return (
      <div className="flex flex-col items-center gap-4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "w-full rounded-lg bg-black object-cover",
            large ? "aspect-video max-h-[65vh]" : "max-h-64"
          )}
        />
        <div className="flex gap-2">
          <Button type="button" size={large ? "md" : "sm"} onClick={capturePhoto}>
            <Camera className="h-4 w-4" strokeWidth={2} />
            Capture photo
          </Button>
          <Button type="button" variant="secondary" size={large ? "md" : "sm"} onClick={closeCamera}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", large ? "py-10" : "py-2")}>
      <Button type="button" variant="secondary" size={large ? "md" : "sm"} onClick={openCamera}>
        <Camera className="h-4 w-4" strokeWidth={2} />
        Open camera
      </Button>
      {error && <p className="max-w-xs text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
