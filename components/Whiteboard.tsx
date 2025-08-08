// components/Whiteboard.tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";

type StickyNoteLite = { pageNumber: number; content: string };

interface WhiteboardProps {
  steps: WhiteboardStep[];
  audioBlob?: Blob | null;
  /** If true, play provided audioBlob; if false, use browser TTS on narrationScript */
  useAIVoice?: boolean;
  /** Used when useAIVoice === false */
  narrationScript?: string;
  /** Base ms per step at 1.0x (fallback when no AI audio duration) */
  baseStepDurationMs?: number;
  /** Optional: include sticky notes in exported lesson */
  stickyNotes?: StickyNoteLite[];
  /** Optional: title for exports */
  lessonTitle?: string;
  /** Optional parent-controlled playback speed (overrides internal control if provided) */
  playbackSpeed?: number;
}

export default function Whiteboard({
  steps,
  audioBlob = null,
  useAIVoice = false,
  narrationScript = "",
  baseStepDurationMs = 4000,
  stickyNotes = [],
  lessonTitle = "Whiteboard Lesson",
  playbackSpeed, // ← parent can control speed
}: WhiteboardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Internal speed UI (used when parent doesn't provide playbackSpeed)
  const [localSpeed, setLocalSpeed] = useState<number>(1.0);
  const effectiveSpeed = playbackSpeed ?? localSpeed;

  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  /** Build object URL for AI audio */
  useEffect(() => {
    if (!audioBlob || !useAIVoice) {
      setAudioURL(null);
      setAudioDurationSec(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioURL(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob, useAIVoice]);

  /** Load audio duration for step timing when using AI audio */
  useEffect(() => {
    if (!useAIVoice || !audioRef.current) return;
    const el = audioRef.current;

    const handleLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setAudioDurationSec(el.duration);
      }
    };
    el.addEventListener("loadedmetadata", handleLoaded);
    el.addEventListener("durationchange", handleLoaded);
    return () => {
      el.removeEventListener("loadedmetadata", handleLoaded);
      el.removeEventListener("durationchange", handleLoaded);
    };
  }, [useAIVoice, audioURL]);

  /** Choose interval per step: use audio duration if available, else baseStepDurationMs */
  const stepIntervalMs = useMemo(() => {
    if (useAIVoice && audioDurationSec && steps.length > 0) {
      const totalMs = audioDurationSec * 1000;
      return Math.max(600, (totalMs / steps.length) / Math.max(0.5, Math.min(2, effectiveSpeed)));
    }
    // Fallback: baseStepDurationMs scaled by speed
    return Math.max(800, baseStepDurationMs / Math.max(0.5, Math.min(2, effectiveSpeed)));
  }, [useAIVoice, audioDurationSec, steps.length, baseStepDurationMs, effectiveSpeed]);

  /** Draw current step */
  useEffect(() => {
    if (!canvasRef.current || steps.length === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // whiteboard background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const current = steps[currentStepIndex];

    // Title
    ctx.fillStyle = "#111827";
    ctx.font = "bold 22px Arial";
    ctx.fillText(current.title || `Step ${currentStepIndex + 1}`, 24, 40);

    // Description
    ctx.font = "18px Arial";
    ctx.fillStyle = "#1f2937";
    const lines = wrapText(ctx, current.description || "", canvas.width - 48);
    const lineHeight = 26;
    lines.forEach((line, i) => ctx.fillText(line, 24, 80 + i * lineHeight));

    // Visual prompt hint
    if (current.visualPrompt) {
      ctx.font = "italic 16px Arial";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(`(Draw: ${current.visualPrompt})`, 24, canvas.height - 24);
    }
  }, [currentStepIndex, steps]);

  /** Cleanup timer on unmount */
  useEffect(() => {
    return () => clearTimer();
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      setCurrentStepIndex((prev) => {
        const next = prev + 1;
        if (next >= steps.length) {
          stop();
          return prev;
        }
        return next;
      });
    }, stepIntervalMs) as unknown as number;
  };

  const play = () => {
    // reset if at end
    if (currentStepIndex >= steps.length - 1) setCurrentStepIndex(0);

    if (useAIVoice) {
      if (audioRef.current && audioURL) {
        audioRef.current.playbackRate = clampRate(effectiveSpeed);
        audioRef.current.play().catch(() => {});
      }
    } else {
      // Browser TTS fallback
      if ("speechSynthesis" in window && narrationScript.trim()) {
        const u = new SpeechSynthesisUtterance(narrationScript);
        u.lang = "en-US";
        u.rate = clampRate(effectiveSpeed);
        u.pitch = 1.0;
        u.onend = () => stop(); // stop animation when speech ends
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    }

    setIsPlaying(true);
    startTimer();
  };

  const pause = () => {
    if (useAIVoice && audioRef.current) audioRef.current.pause();
    if (!useAIVoice && "speechSynthesis" in window) window.speechSynthesis.pause?.();
    setIsPlaying(false);
    clearTimer();
  };

  const resume = () => {
    if (useAIVoice && audioRef.current) {
      audioRef.current.playbackRate = clampRate(effectiveSpeed);
      audioRef.current.play().catch(() => {});
    }
    if (!useAIVoice && "speechSynthesis" in window) window.speechSynthesis.resume?.();
    setIsPlaying(true);
    startTimer();
  };

  const stop = () => {
    pause();
    setCurrentStepIndex(0);
    if (useAIVoice && audioRef.current) audioRef.current.currentTime = 0;
    if (!useAIVoice && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  /** Respond to parent speed changes live */
  useEffect(() => {
    if (!isPlaying) return;
    // Re-apply playback rate and restart timer to re-sync interval
    if (useAIVoice && audioRef.current) {
      audioRef.current.playbackRate = clampRate(effectiveSpeed);
    }
    startTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSpeed, stepIntervalMs]);

  const onLocalSpeedChange = (val: number) => {
    setLocalSpeed(val);
    // If the parent is controlling speed, ignore local UI
    if (typeof playbackSpeed !== "number") {
      if (useAIVoice && audioRef.current) audioRef.current.playbackRate = clampRate(val);
      if (isPlaying) startTimer(); // re-sync step interval
    }
  };

  /** Export: Markdown */
  const exportMarkdown = () => {
    const md = buildLessonMarkdown({
      title: lessonTitle,
      narrationScript,
      steps,
      stickyNotes,
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${slugify(lessonTitle)}.md`);
  };

  /** Export: PDF (lazy load jsPDF) */
  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf"); // ensure jspdf is installed
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      let y = 40;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(lessonTitle, 40, y);
      y += 24;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      // Narration
      doc.text("Narration Script:", 40, y);
      y += 16;
      y = addWrappedText(doc, narrationScript || "—", 40, y, 520, 14);
      y += 10;

      // Steps
      steps.forEach((s, i) => {
        if (y > 740) {
          doc.addPage();
          y = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`Step ${i + 1}: ${s.title}`, 40, y);
        y += 16;

        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, s.description, 40, y, 520, 14);
        if (s.visualPrompt) {
          y = addWrappedText(doc, `(Draw: ${s.visualPrompt})`, 40, y + 6, 520, 14, "#555");
        }
        y += 12;
      });

      // Sticky notes
      if (stickyNotes.length) {
        if (y > 700) {
          doc.addPage();
          y = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.text("Sticky Notes:", 40, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        stickyNotes.forEach((n) => {
          if (y > 740) {
            doc.addPage();
            y = 40;
          }
          y = addWrappedText(doc, `• [p.${n.pageNumber}] ${n.content}`, 48, y, 512, 14);
        });
      }

      doc.save(`${slugify(lessonTitle)}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("Could not export PDF. Did you install 'jspdf'?");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={900}
        height={460}
        className="border rounded bg-white shadow-sm"
      />

      {/* Optional native audio (hidden UI; we drive via buttons) */}
      {useAIVoice && (
        <audio
          ref={audioRef}
          src={audioURL ?? undefined}
          onEnded={stop}
          className="hidden"
          controls
        />
      )}

      {/* Transport */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isPlaying ? (
          <button
            onClick={currentStepIndex === 0 ? play : resume}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            ▶️ {currentStepIndex === 0 ? "Play" : "Resume"}
          </button>
        ) : (
          <button
            onClick={pause}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded"
          >
            ⏸️ Pause
          </button>
        )}

        <button
          onClick={stop}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          ⏹️ Stop
        </button>

        {/* Speed (hidden if parent controls it) */}
        {typeof playbackSpeed !== "number" && (
          <>
            <label className="ml-2 text-sm opacity-80">Speed</label>
            <select
              value={localSpeed}
              onChange={(e) => onLocalSpeedChange(Number(e.target.value))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value={0.75}>0.75×</option>
              <option value={1}>1.0×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2.0×</option>
            </select>
          </>
        )}

        <span className="text-sm opacity-80">
          Step {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}
        </span>
      </div>

      {/* Exports */}
      <div className="flex items-center gap-2">
        <button
          onClick={exportMarkdown}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded"
        >
          📄 Export Markdown
        </button>
        <button
          onClick={exportPDF}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded"
        >
          🧾 Export PDF
        </button>
      </div>
    </div>
  );
}

/* -------------------- helpers -------------------- */

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    const width = ctx.measureText(test).width;

    if (width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildLessonMarkdown({
  title,
  narrationScript,
  steps,
  stickyNotes,
}: {
  title: string;
  narrationScript: string;
  steps: WhiteboardStep[];
  stickyNotes: StickyNoteLite[];
}) {
  return `# ${title}

## Narration Script
${narrationScript ? narrationScript : "_(none)_"}

## Whiteboard Steps
${steps
  .map(
    (s, i) =>
      `### Step ${i + 1}: ${s.title}
${s.description}
${s.visualPrompt ? `> Draw: ${s.visualPrompt}` : ""}`
  )
  .join("\n\n")}

${
  stickyNotes.length
    ? `## Sticky Notes
${stickyNotes.map((n) => `- [p.${n.pageNumber}] ${n.content}`).join("\n")}`
    : ""
}
`;
}

/** jsPDF word wrap */
function addWrappedText(
  doc: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color: string = "#000"
) {
  if (!text) return y;
  doc.setTextColor(color);
  const split = doc.splitTextToSize(text, maxWidth);
  split.forEach((line: string) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  doc.setTextColor("#000");
  return y;
}

function clampRate(v: number) {
  return Math.min(2, Math.max(0.5, v || 1));
}