// components/elena/ChildProfileSwitcher.tsx
// Lets a parent switch between children sharing this device, or add another
// one — surfaces the multi-child support that already existed in
// lib/elena/idbStore.ts (listChildProfiles) but had no UI calling it.

import React, { useEffect, useState } from "react";
import type { ChildProfile } from "@/lib/elena/types";
import { listChildProfiles } from "@/lib/elena/idbStore";
import { getAvatarEmoji } from "@/lib/elena/avatar";

interface ChildProfileSwitcherProps {
  parentAccountId: string;
  activeProfileId: string;
  onSelect: (profile: ChildProfile) => void;
  onClose: () => void;
  renderAddForm: (onSave: (profile: ChildProfile) => void) => React.ReactNode;
}

export default function ChildProfileSwitcher({
  parentAccountId,
  activeProfileId,
  onSelect,
  onClose,
  renderAddForm,
}: ChildProfileSwitcherProps) {
  const [profiles, setProfiles] = useState<ChildProfile[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    listChildProfiles(parentAccountId)
      .then(list => { if (alive) setProfiles(list); })
      .catch(() => { if (alive) setProfiles([]); });
    return () => { alive = false; };
  }, [parentAccountId]);

  if (adding) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm overflow-y-auto">
        {renderAddForm(onSelect)}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h1 className="text-white font-bold text-lg leading-tight">Switch learner</h1>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors text-lg leading-none p-1.5"
          aria-label="Close switcher"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {profiles === null ? (
          <p className="text-indigo-400 text-sm animate-pulse">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            {profiles.map(p => {
              const isActive = p.id === activeProfileId;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "border-indigo-400/50 bg-indigo-500/15"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                >
                  <span className="text-3xl leading-none flex-shrink-0">{getAvatarEmoji(p.id)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-semibold text-sm">
                      {p.preferredName || p.displayName}
                    </div>
                    {p.ageRange && (
                      <div className="text-indigo-300/70 text-xs mt-0.5">Age {p.ageRange}</div>
                    )}
                  </div>
                  {isActive && <span className="text-indigo-300 text-xs font-semibold flex-shrink-0">Active</span>}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded-2xl border border-dashed border-white/20 px-4 py-3 text-center text-indigo-300 text-sm font-medium hover:bg-white/5 transition-colors"
        >
          + Add another learner
        </button>
      </div>
    </div>
  );
}
