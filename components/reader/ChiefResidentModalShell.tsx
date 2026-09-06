"use client";
// components/reader/ChiefResidentModalShell.tsx
// Reader's Chief Resident entry point. This is chrome only — a backdrop,
// header, and close button — with NO teaching UI or generation behavior of
// its own. It renders the exact same components/notelab/ChiefResidentPanel.tsx
// NoteLab uses, so both entry points share one component, one prompt
// contract (lib/reader/buildChiefResidentContext.ts), and one context
// builder. There used to be a separate components/reader/ChiefResidentModal.tsx
// with its own conversation store, streaming fetch, opening turn, and quick-
// reply chips — deleted, not merely deprecated, so there is exactly one place
// Chief Resident's teaching behavior can live.
//
//   Reader button → ChiefResidentModalShell → NoteLab ChiefResidentPanel
//
// Props are the live, current-page values (studyModel/pageText/pageTruthKey
// etc.) — never a snapshot captured at click time — so there is nothing that
// can go stale between "the button was clicked" and "the panel rendered".

import React from "react";
import { motion } from "framer-motion";
import ChiefResidentPanel from "@/components/notelab/ChiefResidentPanel";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { CurrentPageTruth } from "@/lib/context/currentPageTruth";

interface ChiefResidentModalShellProps {
  onClose: () => void;
  studyModel: CurrentPageStudyModel | null;
  pageTruth: CurrentPageTruth;
  bookTitle?: string;
  /** Reader has no note concept — always null. Disables the panel's "Teach
   *  This Note" mode, the same way it's disabled in NoteLab before a note
   *  is opened. */
  activeNote: UltraNote | null;
  onRecallSaved?: (setId: string) => void;
}

export default function ChiefResidentModalShell({
  onClose,
  studyModel,
  pageTruth,
  bookTitle,
  activeNote,
  onRecallSaved,
}: ChiefResidentModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 350, damping: 28, mass: 0.8 }}
        className="relative bg-[#0b1222] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/60"
        style={{ width: "min(94vw, 760px)", height: "min(88vh, 720px)" }}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700/60 shrink-0">
          <span className="text-[12.5px] font-bold text-white/85 tracking-wide">🩺 Chief Resident</span>
          <div className="ml-auto flex items-center gap-2">
            {bookTitle && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border border-emerald-600/30 bg-emerald-900/20 text-emerald-300">
                <span className="text-[10px]">📖</span>
                {bookTitle.length > 32 ? bookTitle.slice(0, 32) + "…" : bookTitle}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700/60 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChiefResidentPanel
            studyModel={studyModel}
            pageTruth={pageTruth}
            bookTitle={bookTitle}
            activeNote={activeNote}
            onRecallSaved={onRecallSaved}
          />
        </div>
      </motion.div>
    </div>
  );
}
