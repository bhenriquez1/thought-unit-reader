// components/Whiteboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";

/**
 * Whiteboard renderer with:
 * • slide-in mount animation
 * • zoom slider
 * • timeline that auto-plays steps (respects delayMs + playbackSpeed)
 * • hand-drawn stroke animation for draw/erase
 * • gentle fade/slide for text and images
 * • simple play/pause/prev/next controls
 *
 * Supported payloads:
 *  draw:  { d?: string } (SVG path)
 *         or { shape: "rect"|"circle"|"arrow", x,y,w,h,r,cx,cy,x2,y2 }
 *         + { color?, strokeWidth?, fill? }
 *  text:  { text, x?, y?, size? }
 *  image: { href|url, x?, y?, w?, h?, alt? }
 *  erase: same as draw but defaults to board color + fat stroke
 */

type Props = {
  steps: WhiteboardStep[];
  narrationScript: string;
  playbackSpeed?: number;
  audioBlob?: Blob;
  useAIVoice?: boolean;
  stickyNotes?: { pageNumber: number; content: string }[];
  lessonTitle?: string;

  /** baseline duration for a step when delayMs is not provided */
  baseStepDurationMs?: number;

  // optional persistence passthroughs
  lessonId?: string;
  userId?: string;
};

type DrawPayload = {
  d?: string; // SVG path data
  shape?: "rect" | "circle" | "arrow";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  cx?: number;
  cy?: number;
  x2?: number;
  y2?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

type TextPayload = {
  text: string;
  x?: number;
  y?: number;
  size?: number;
};

type ImagePayload = {
  href?: string;
  url?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  alt?: string;
};

export default function Whiteboard({
  steps,
  narrationScript,
  playbackSpeed = 1.0,
  audioBlob,
  useAIVoice,
  stickyNotes,
  lessonTitle,
  baseStepDurationMs = 4000,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // slide-in on mount
  useEffect(() => setMounted(true), []);

  // reset timeline when steps change
  useEffect(() => {
    setActiveIndex(0);
    setPlaying(true);
  }, [steps]);

  // voice (optional AI audio)
  useEffect(() => {
    if (!audioBlob || !useAIVoice) return;
    const url = URL.createObjectURL(audioBlob);
    const a = new Audio(url);
    a.playbackRate = playbackSpeed;
    audioRef.current = a;
    a.play().catch(() => {});
    return () => {
      a.pause();
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [audioBlob, useAIVoice]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // timeline auto-advance
  useEffect(() => {
    if (!playing) return;
    const current = steps[activeIndex];
    if (!current) return;

    const base = typeof current.delayMs === "number" ? current.delayMs : baseStepDurationMs;
    const duration = Math.max(500, base / Math.max(0.25, playbackSpeed));

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setActiveIndex((i) => Math.min(i + 1, steps.length - 1));
    }, duration) as unknown as number;

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [playing, activeIndex, steps, baseStepDurationMs, playbackSpeed]);

  const visibleSteps = useMemo(() => steps.slice(0, activeIndex + 1), [steps, activeIndex]);

  const goPrev = () => {
    setPlaying(false);
    setActiveIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    setPlaying(false);
    setActiveIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  const togglePlay = () => setPlaying((p) => !p);

  return (
    <div
      className={`relative transition-all duration-500 ${
        mounted ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      {/* Top controls */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs"
            onClick={goPrev}
            disabled={activeIndex === 0}
          >
            ◀ Prev
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs"
            onClick={togglePlay}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs"
            onClick={goNext}
            disabled={activeIndex >= steps.length - 1}
          >
            Next ▶
          </button>
        </div>

        <div className="ml-4 flex items-center gap-2">
          <span className="text-xs opacity-70">Zoom</span>
          <input
            type="range"
            min={0.75}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
          <span className="text-xs opacity-70 w-10 text-right">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="ml-auto text-xs opacity-70">
          {lessonTitle ? `Lesson: ${lessonTitle}` : null}
        </div>
      </div>

      {/* Board */}
      <div
        className="border rounded bg-gray-800/80 shadow-inner p-3 overflow-hidden"
        style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}
      >
        <svg
          viewBox="0 0 960 540"
          width="100%"
          height="100%"
          className="block"
          aria-label="whiteboard"
        >
          {/* Render each step up to activeIndex */}
          {visibleSteps.map((s, i) => {
            const isActive = i === activeIndex;
            const key = `step-${i}`;

            // TEXT
            if (s.type === "text") {
              const p = (s.payload || {}) as TextPayload;
              const x = p.x ?? 40;
              const y = p.y ?? 80 + i * 26; // stagger if no coords
              const size = p.size ?? 18;
              return (
                <g key={key} className={`fade-in ${isActive ? "fresh" : ""}`}>
                  <text
                    x={x}
                    y={y}
                    fontSize={size}
                    fill="#fef3c7"
                    style={{ paintOrder: "stroke" }}
                  >
                    {p.text ?? String(s.description || "")}
                  </text>
                </g>
              );
            }

            // IMAGE
            if (s.type === "image") {
              const p = (s.payload || {}) as ImagePayload;
              const href = p.href || p.url;
              if (!href) return null;
              const x = p.x ?? 520;
              const y = p.y ?? 80;
              const w = p.w ?? 360;
              const h = p.h ?? 240;
              return (
                <g key={key} className={`pop-in ${isActive ? "fresh" : ""}`}>
                  {/* @ts-ignore — href is valid on <image> in SVG */}
                  <image x={x} y={y} width={w} height={h} href={href} preserveAspectRatio="xMidYMid meet" />
                  {p.alt ? (
                    <text x={x} y={y + h + 18} fill="#cbd5e1" fontSize={14}>
                      {p.alt}
                    </text>
                  ) : null}
                </g>
              );
            }

            // DRAW / ERASE
            if (s.type === "draw" || s.type === "erase") {
              const p = (s.payload || {}) as DrawPayload;
              const color = p.color || (s.type === "erase" ? "#0f172a" : "#fde68a");
              const strokeWidth = Math.max(2, p.strokeWidth ?? (s.type === "erase" ? 16 : 4));
              const fill = p.fill || "none";

              // Free path
              if (p.d) {
                const pathId = `p-${i}`;
                const dur = Math.max(
                  0.3,
                  ((s.delayMs ?? baseStepDurationMs) / 1000) / Math.max(0.25, playbackSpeed)
                );
                return (
                  <g key={key} className="draw-stroke">
                    <path
                      id={pathId}
                      d={p.d}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      fill={fill}
                      pathLength={1}
                      style={{
                        strokeDasharray: 1,
                        strokeDashoffset: isActive ? 1 : 0,
                        animation: isActive ? `dash-draw ${dur}s ease-out forwards` : undefined,
                      }}
                    />
                    {/* little "pen" dot that follows the path (SMIL; ignored if unsupported) */}
                    <circle r={3.5} fill={color} className={isActive ? "pen" : "hidden"}>
                      <animateMotion dur={`${dur}s`} begin="indefinite">
                        <mpath href={`#${pathId}`} />
                      </animateMotion>
                    </circle>
                  </g>
                );
              }

              // Rect
              if (p.shape === "rect") {
                const x = p.x ?? 60,
                  y = p.y ?? 120,
                  w = p.w ?? 180,
                  h = p.h ?? 100,
                  r = p.r ?? 8;
                return (
                  <rect
                    key={key}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={r}
                    ry={r}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill={fill}
                    pathLength={1}
                    className={`shape-stroke ${isActive ? "fresh" : ""}`}
                  />
                );
              }

              // Circle
              if (p.shape === "circle") {
                const cx = p.cx ?? 180,
                  cy = p.cy ?? 200,
                  r = p.r ?? 60;
                return (
                  <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={r}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill={fill}
                    pathLength={1}
                    className={`shape-stroke ${isActive ? "fresh" : ""}`}
                  />
                );
              }

              // Arrow
              if (p.shape === "arrow") {
                const x1 = p.x ?? 260,
                  y1 = p.y ?? 160,
                  x2 = p.x2 ?? x1 + 100,
                  y2 = p.y2 ?? y1;
                return (
                  <g key={key} className={`shape-stroke ${isActive ? "fresh" : ""}`}>
                    <defs>
                      <marker
                        id={`arrow-${i}`}
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L0,6 L9,3 z" fill={color} />
                      </marker>
                    </defs>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      markerEnd={`url(#arrow-${i})`}
                      pathLength={1}
                    />
                  </g>
                );
              }

              return null;
            }

            // Fallback: show text label
            return (
              <g key={key} className={`fade-in ${isActive ? "fresh" : ""}`}>
                <text x={40} y={80 + i * 26} fontSize={18} fill="#fef3c7">
                  {s.title || s.description || "Step"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* (Optional) Narration panel while iterating */}
      {narrationScript ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">Narration</summary>
          <pre className="text-xs whitespace-pre-wrap opacity-80 mt-1">{narrationScript}</pre>
        </details>
      ) : null}

      {/* Local styles */}
      <style jsx>{`
        @keyframes dash-draw {
          from { stroke-dashoffset: 1; }
          to { stroke-dashoffset: 0; }
        }
        .shape-stroke {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
        }
        .shape-stroke.fresh {
          animation: dash-draw 0.9s ease-out forwards;
        }

        .fade-in {
          opacity: 0;
          transform: translateY(4px);
        }
        .fade-in.fresh {
          animation: fadeInUp 300ms ease-out forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .pop-in {
          opacity: 0;
          transform: scale(0.98);
        }
        .pop-in.fresh {
          animation: popIn 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}