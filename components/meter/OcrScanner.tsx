"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import { Camera, CircleAlert, ScanLine } from "lucide-react";

import type { OcrScannerProps } from "@/lib/types";
import { cn } from "@/lib/utils";

type CameraState = "idle" | "starting" | "live" | "denied" | "unsupported";

const STATE_LABEL: Record<CameraState, string> = {
  idle: "Camera off",
  starting: "Starting camera…",
  live: "Camera live",
  denied: "Camera unavailable",
  unsupported: "Camera unsupported",
};

export default function OcrScanner({
  isActive,
  onCapture,
  className,
}: OcrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Releases every MediaStreamTrack immediately so the browser's webcam
   * indicator turns off (no lingering hardware access after closing).
   */
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    /* Not visible (modal closed or another tab active): never hold the cam. */
    if (!isActive) {
      stopStream();
      setCameraState("idle");
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    async function startCamera(): Promise<void> {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!cancelled) {
          setCameraState("unsupported");
          setErrorMessage(
            "Camera API unavailable — open the app over HTTPS or upload a photo instead.",
          );
        }
        return;
      }

      try {
        setCameraState("starting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        /* The scanner closed while the permission prompt was still open —
           stop the freshly granted stream instead of leaking it. */
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraState("live");
      } catch (error) {
        if (cancelled) return;

        const name = error instanceof DOMException ? error.name : "";
        setCameraState("denied");
        if (name === "NotAllowedError" || name === "SecurityError") {
          setErrorMessage(
            "Camera permission denied. Allow access in your browser or upload a photo instead.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setErrorMessage("No camera found on this device. Upload a photo instead.");
        } else {
          setErrorMessage("Camera could not start. Upload a photo instead.");
        }
      }
    }

    void startCamera();

    /* Explicit cleanup: modal close, tab switch and unmount all land here. */
    return () => {
      cancelled = true;
      stopStream();
      setCameraState("idle");
    };
  }, [isActive, stopStream]);

  /** Snapshots the current frame into a File for the OCR pipeline. */
  function handleCapture(): void {
    const video = videoRef.current;
    if (!video || cameraState !== "live" || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `meter-scan-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onCapture?.(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-dashed border-slate-600 bg-slate-900/70",
        className,
      )}
    >
      {/* Viewfinder corner brackets */}
      <span
        className="absolute left-3 top-3 h-6 w-6 rounded-tl-md border-l-2 border-t-2 border-emerald-400"
        aria-hidden="true"
      />
      <span
        className="absolute right-3 top-3 h-6 w-6 rounded-tr-md border-r-2 border-t-2 border-emerald-400"
        aria-hidden="true"
      />
      <span
        className="absolute bottom-3 left-3 h-6 w-6 rounded-bl-md border-b-2 border-l-2 border-emerald-400"
        aria-hidden="true"
      />
      <span
        className="absolute bottom-3 right-3 h-6 w-6 rounded-br-md border-b-2 border-r-2 border-emerald-400"
        aria-hidden="true"
      />

      {/* Live feed (with proper teardown) or a graceful fallback panel */}
      {cameraState === "live" ? (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Live meter camera preview"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800">
            {cameraState === "denied" || cameraState === "unsupported" ? (
              <CircleAlert className="h-6 w-6 text-red-400" aria-hidden="true" />
            ) : (
              <Camera className="h-6 w-6 text-emerald-400" aria-hidden="true" />
            )}
          </span>
          <p className="text-sm font-semibold text-white">
            {cameraState === "idle"
              ? "Camera is off"
              : cameraState === "starting"
                ? "Starting camera…"
                : "Camera unavailable"}
          </p>
          <p className="text-xs leading-relaxed text-slate-400">
            {errorMessage ??
              "Open the camera to align the meter inside the frame."}
          </p>
        </div>
      )}

      {/* Sweeping scan beam while the feed is live */}
      {cameraState === "live" && (
        <motion.span
          className="pointer-events-none absolute inset-x-6 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
          initial={{ top: "18%" }}
          animate={{ top: ["18%", "82%", "18%"] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />
      )}

      {/* Hardware status chip */}
      <span
        className={cn(
          "absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur",
          cameraState === "live"
            ? "border-emerald-600/40 bg-emerald-600/15 text-emerald-400"
            : cameraState === "starting"
              ? "border-amber-600/40 bg-amber-600/15 text-amber-400"
              : "border-slate-600 bg-slate-800/90 text-slate-400",
        )}
      >
        {STATE_LABEL[cameraState]}
      </span>

      {/* Alignment hint + snapshot capture (centered between brackets) */}
      {cameraState === "live" && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent px-4 pb-4 pt-8">
          <p className="text-xs font-medium text-slate-300">
            Align the digits inside the frame
          </p>
          <button
            type="button"
            onClick={handleCapture}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95"
          >
            <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            Capture Frame
          </button>
        </div>
      )}
    </div>
  );
}

