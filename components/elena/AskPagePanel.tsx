// components/elena/AskPagePanel.tsx
// "Ask About This Page" — floating button + chat overlay for the main Reader.
// Loads the active ChildProfile from IndexedDB so it can use the child's
// age range and name without requiring props from the parent page.
// Only rendered when ELENA_MODE_ENABLED and a PDF is open.

import React, { useState, useEffect } from "react";
import { loadChildProfile } from "@/lib/elena/idbStore";
import type { ChildProfile } from "@/lib/elena/types";
import ReadingBuddy from "@/components/elena/ReadingBuddy";

const STORAGE_KEY = "elena-active-profile-id";

interface AskPagePanelProps {
  pageText?:    string;
  bookTitle?:   string;
  currentPage?: number;
}

export default function AskPagePanel({ pageText, bookTitle, currentPage }: AskPagePanelProps) {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    loadChildProfile(id).then(p => setProfile(p)).catch(() => {});
  }, []);

  // Don't render anything until we know a profile exists and there's page content
  if (!profile || !pageText?.trim()) return null;

  return (
    <>
      {/* Floating trigger button — bottom-right of reader area */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 hover:bg-indigo-500/35 transition-colors text-sm font-medium text-indigo-200 shadow-lg backdrop-blur-sm"
          aria-label="Ask about this page"
        >
          <span className="text-xl">🦉</span>
          <span>💬 Ask About This Page</span>
        </button>
      )}

      {/* Expanded chat panel */}
      {open && (
        <div className="w-[360px] h-[480px] rounded-2xl shadow-2xl overflow-hidden border border-indigo-400/20 bg-gradient-to-b from-indigo-950/95 to-violet-950/95 backdrop-blur-sm">
          <ReadingBuddy
            profile={profile}
            pageText={pageText}
            bookTitle={bookTitle}
            currentPage={currentPage}
            defaultOpen
            onRequestClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
