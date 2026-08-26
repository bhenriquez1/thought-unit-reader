// components/elena/ChildReaderTab.tsx
// Elena's own Reader — mounts the SAME SmartPDFViewer the adult Reader uses
// (pagination/zoom/text-layer chrome included) against a book from the
// child's own library, instead of mirroring whatever the adult tab has open.
// E2 scope: view, navigate, resume. No Professor/Whiteboard/canonical
// Thought Units here — that is E3. ReadingBuddy is pre-existing (not new
// wiring); it now runs against Elena's own document instead of the adult's.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReadingBuddy from "@/components/elena/ReadingBuddy";
import type { ChildProfile, ChildLibraryEntry } from "@/lib/elena/types";
import { detectContentProfile } from "@/lib/content/contentProfile";
import { buildChildReadAloudText } from "@/lib/elena/storyReading";

const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });

interface ChildReaderTabProps {
  profile: ChildProfile;
  activeBook: ChildLibraryEntry | null;
  bookFileUrl: string | null;
  library: ChildLibraryEntry[];
  uploading: boolean;
  uploadError: string | null;
  pageText?: string;
  onUploadClick: () => void;
  onOpenBook: (entry: ChildLibraryEntry) => void;
  onPageChange: (page: number) => void;
  onPageCount: (n: number) => void;
  onPageTextExtracted: (page: number, text: string) => void;
}

function EmptyReaderState({
  profile, library, uploading, uploadError, onUploadClick, onOpenBook,
}: Pick<ChildReaderTabProps, "profile" | "library" | "uploading" | "uploadError" | "onUploadClick" | "onOpenBook">) {
  const learnerName = profile.preferredName || profile.displayName;
  return (
    <div className="min-h-full overflow-auto p-5 sm:p-8">
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-3xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/15 to-violet-500/5 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">{learnerName}&apos;s Reader</div>
          <h2 className="mt-3 text-3xl font-bold text-white">Choose a book and begin.</h2>
          <p className="mt-3 text-sm leading-relaxed text-indigo-100/65">Books, vocabulary, practice, and progress all stay connected to this learning space.</p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-slate-300">
            <div className="font-semibold text-white">What happens next?</div>
            <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-400">
              <li>1. Upload or choose a PDF.</li>
              <li>2. Read with page controls and Reading Buddy.</li>
              <li>3. Practice words and track real reading progress.</li>
            </ol>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/35 p-6">
          <div className="text-4xl mb-2">📚</div>
          <h3 className="text-white font-bold text-lg mb-1">{library.length ? "Continue from your bookshelf" : "Add the first book"}</h3>
          <p className="text-slate-400 text-sm mb-4">Upload a PDF here. Elena Mode keeps its own library and reading position.</p>
        <button
          onClick={onUploadClick}
          disabled={uploading}
          className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {uploading ? "Uploading…" : "📤 Upload a Book"}
        </button>
        {uploadError && <p className="text-red-400 text-xs mt-3">{uploadError}</p>}
          {library.length > 0 && (
            <div className="mt-6">
          <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-2.5">My Books</h4>
          <div className="space-y-2">
            {library.map(entry => (
              <button
                key={entry.id}
                onClick={() => onOpenBook(entry)}
                className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 px-3.5 py-2.5 text-left transition-colors"
              >
                <span className="text-xl flex-shrink-0">📘</span>
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm font-medium truncate">{entry.title}</div>
                  {entry.totalPages > 0 && (
                    <div className="text-slate-500 text-[11px]">Page {entry.currentPage} of {entry.totalPages}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ChildReaderTab({
  profile, activeBook, bookFileUrl, library, uploading, uploadError, pageText,
  onUploadClick, onOpenBook, onPageChange, onPageCount, onPageTextExtracted,
}: ChildReaderTabProps) {
  const contentProfile = useMemo(
    () => detectContentProfile({ bookTitle: activeBook?.title, pageText, childMode: true }),
    [activeBook?.title, pageText],
  );
  const readAloudText = useMemo(() => buildChildReadAloudText(pageText ?? ""), [pageText]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [reading, setReading] = useState(false);
  const [spokenWord, setSpokenWord] = useState("");

  const stopReadAloud = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setReading(false);
    setSpokenWord("");
  }, []);

  function startReadAloud() {
    if (!readAloudText || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    stopReadAloud();
    const utterance = new SpeechSynthesisUtterance(readAloudText);
    utterance.rate = profile.ageRange === "3-4" || profile.ageRange === "5-6" ? 0.82 : 0.92;
    utterance.pitch = 1.08;
    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      setSpokenWord(readAloudText.slice(event.charIndex, event.charIndex + (event.charLength || 24)).split(/\s/)[0] ?? "");
    };
    utterance.onend = stopReadAloud;
    utterance.onerror = stopReadAloud;
    utteranceRef.current = utterance;
    setReading(true);
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => stopReadAloud, [activeBook?.documentId, activeBook?.currentPage, stopReadAloud]);

  if (!activeBook || !bookFileUrl) {
    return (
      <EmptyReaderState
        profile={profile} library={library} uploading={uploading} uploadError={uploadError}
        onUploadClick={onUploadClick} onOpenBook={onOpenBook}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-white font-bold text-sm truncate">{activeBook.title}</h3>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-300/70">
            {contentProfile.id === "child-comic" ? "Comic reading coach" : "Story reading coach"}
          </div>
        </div>
        <button
          onClick={onUploadClick}
          disabled={uploading}
          className="flex-shrink-0 text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-50 transition-colors"
        >
          {uploading ? "Uploading…" : "+ Upload another"}
        </button>
      </div>
      {uploadError && (
        <p className="flex-shrink-0 text-red-400 text-xs px-4 pb-2">{uploadError}</p>
      )}

      <div className="mx-4 mb-3 flex flex-shrink-0 items-center gap-2 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/8 px-3 py-2">
        <button
          type="button"
          onClick={reading ? stopReadAloud : startReadAloud}
          disabled={!readAloudText}
          className="rounded-xl bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {reading ? "■ Stop reading" : "▶ Read this page"}
        </button>
        <div className="min-w-0 flex-1 truncate text-xs text-fuchsia-100/60">
          {reading ? <>Reading in page order · <mark className="rounded bg-yellow-300/70 px-1 text-slate-950">{spokenWord || "…"}</mark></> : "Dialogue and story text stay in source order."}
        </div>
      </div>

      {library.length > 1 && (
        <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-4 pb-3">
          {library.map(entry => (
            <button
              key={entry.id}
              onClick={() => entry.id !== activeBook.id && onOpenBook(entry)}
              className={`flex-none flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                entry.id === activeBook.id
                  ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/8"
              }`}
            >
              <span>📘</span>
              <span className="max-w-[120px] truncate">{entry.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-shrink-0 mx-4 mb-3 h-[52vh] min-h-[320px] rounded-2xl overflow-hidden border border-white/10">
        <SmartPDFViewer
          fileUrl={bookFileUrl}
          docId={activeBook.documentId}
          pageTruthKey={`${activeBook.documentId}::${activeBook.currentPage}::t`}
          currentPage={activeBook.currentPage}
          onPageChange={onPageChange}
          onPageCount={onPageCount}
          onPageTextExtracted={onPageTextExtracted}
        />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        <ReadingBuddy
          profile={profile}
          pageText={pageText}
          bookTitle={activeBook.title}
          currentPage={activeBook.currentPage}
          documentId={activeBook.documentId}
        />
      </div>
    </div>
  );
}
