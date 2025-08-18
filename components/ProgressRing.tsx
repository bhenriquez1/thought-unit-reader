"use client";

import React, { useMemo } from "react";

type Props = {
  /** Either pass 0–100 in `percent` OR 0–1 in `value` (both supported). */
  percent?: number;
  value?: number;

  size?: number;               // px
  stroke?: number;             // px
  trackOpacity?: number;       // 0–1
  /** Uses currentColor by default; override if desired */
  color?: string;
  trackColor?: string;

  label?: string | React.ReactNode;
  className?: string;
  title?: string;              // a11y title
};

export default function ProgressRing({
  percent,
  value,
  size = 56,
  stroke = 6,
  trackOpacity = 0.18,
  color,          // default = currentColor
  trackColor,     // default = currentColor
  label,
  className = "",
  title = "Progress",
}: Props) {
  // Normalize to 0..1
  const frac = (() => {
    if (typeof percent === "number") return clamp01(percent / 100);
    if (typeof value === "number") return clamp01(value);
    return 0;
  })();

  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;

  const dash = useMemo(
    () => ({
      dasharray: `${circ.toFixed(1)} ${circ.toFixed(1)}`,
      dashoffset: `${((1 - frac) * circ).toFixed(1)}`,
    }),
    [circ, frac]
  );

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${title}: ${Math.round(frac * 100)}%`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? "currentColor"}
          strokeOpacity={trackOpacity}
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color ?? "currentColor"}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            strokeDasharray: dash.dasharray,
            strokeDashoffset: dash.dashoffset,
            transition: "stroke-dashoffset 420ms ease",
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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}