// components/ProgressRing.tsx
"use client";

import React, { useMemo } from "react";

type Props = {
  /** 0..1 */
  value: number;
  size?: number;      // px
  stroke?: number;    // px
  trackOpacity?: number;
  label?: string | React.ReactNode;
  className?: string;
  title?: string;     // a11y title
};

export default function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  trackOpacity = 0.18,
  label,
  className = "",
  title = "Progress"
}: Props) {
  const clamped = Math.max(0, Math.min(1, value ?? 0));
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = useMemo(() => ({
    dasharray: `${circ.toFixed(1)} ${circ.toFixed(1)}`,
    dashoffset: `${((1 - clamped) * circ).toFixed(1)}`
  }), [circ, clamped]);

  return (
    <div className={`inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${title}: ${Math.round(clamped * 100)}%`}
      >
        {/* Track */}
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={trackOpacity}
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{
            strokeDasharray: dash.dasharray,
            strokeDashoffset: dash.dashoffset,
            transition: "stroke-dashoffset 420ms ease"
          }}
        />
      </svg>
      {label != null && (
        <div className="pointer-events-none absolute text-xs font-semibold select-none">
          {label}
        </div>
      )}
    </div>
  );
}