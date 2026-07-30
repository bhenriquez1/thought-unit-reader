"use client";

// components/reader/ConfidenceDiagnostics.tsx
// DEV-ONLY panel surfacing semantic confidence metadata.
// Hidden in production (process.env.NODE_ENV !== "development").
//
// Shows: semanticConfidence, domainConfidence (classificationConfidence),
//        groundingState, canonicalType, and canonicalHash (if present).
// Never rendered in production builds.

import React from "react";

export interface ConfidenceDiagnosticsProps {
  semanticConfidence?: number;
  domainConfidence?: number;
  groundingState?: string;
  canonicalType?: string;
  canonicalHash?: string;
  scoringVersion?: number;
}

export default function ConfidenceDiagnostics(props: ConfidenceDiagnosticsProps) {
  if (process.env.NODE_ENV !== "development") return null;

  const {
    semanticConfidence,
    domainConfidence,
    groundingState,
    canonicalType,
    canonicalHash,
    scoringVersion,
  } = props;

  function pct(n?: number) {
    return typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
  }

  const rows: [string, string][] = [
    ["canonicalType",      canonicalType ?? "—"],
    ["semanticConf",       pct(semanticConfidence)],
    ["domainConf",         pct(domainConfidence)],
    ["groundingState",     groundingState ?? "—"],
    ["scoringVersion",     scoringVersion != null ? String(scoringVersion) : "—"],
    ["canonicalHash",      canonicalHash ? canonicalHash.slice(0, 12) + "…" : "—"],
  ];

  return (
    <div
      className="rounded border border-yellow-500/30 bg-yellow-500/5 px-2 py-1.5 font-mono text-[8.5px] text-yellow-300/70"
      data-testid="confidence-diagnostics"
      title="Dev-only: semantic confidence metadata"
    >
      <div className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-yellow-500/50">
        DEV · Confidence
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([key, val]) => (
            <tr key={key}>
              <td className="pr-2 text-yellow-300/40">{key}</td>
              <td className="text-yellow-200/70 tabular-nums">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
