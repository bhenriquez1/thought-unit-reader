"use client";

// components/reader/DomainModeSelector.tsx
//
// Level 4 of the LeftPanel evolution: lets the reader see which domain
// preset (lib/insights/domainPresets) is driving the Thought Unit
// Navigator's labels, and override the auto-detected one. Detection still
// runs every render — picking "Auto" here just stops ignoring it.

import React, { useState } from "react";
import { listDomainPresetOptions } from "@/lib/insights/domainPresets";

export default function DomainModeSelector({
  detectedPresetLabel,
  overridePresetId,
  onChange,
}: {
  detectedPresetLabel: string;
  overridePresetId: string | null;
  onChange: (presetId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = listDomainPresetOptions();
  const effectiveLabel = overridePresetId
    ? options.find((o) => o.id === overridePresetId)?.label ?? detectedPresetLabel
    : `Auto (${detectedPresetLabel})`;

  return (
    <div className="relative px-1" data-testid="domain-mode-selector">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full text-left hover:opacity-80 transition-opacity"
      >
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Mode</span>
        <span className="text-[10px] text-white/55 truncate ml-1">{effectiveLabel}</span>
        <span className="text-[9px] text-white/30 ml-auto">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 mt-1.5 rounded-md border border-white/10 bg-[#161b22] p-1">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="text-left text-[10.5px] rounded px-2 py-1 hover:bg-white/10 transition-colors"
            style={{ color: overridePresetId === null ? "#fde047" : "rgba(255,255,255,0.7)" }}
            data-testid="domain-mode-option-auto"
          >
            Auto (currently {detectedPresetLabel})
          </button>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className="text-left text-[10.5px] rounded px-2 py-1 hover:bg-white/10 transition-colors"
              style={{ color: overridePresetId === opt.id ? "#fde047" : "rgba(255,255,255,0.7)" }}
              data-testid="domain-mode-option"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
