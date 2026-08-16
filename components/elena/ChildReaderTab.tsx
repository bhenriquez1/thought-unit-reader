// components/elena/ChildReaderTab.tsx
// Elena's own Reader — mounts the SAME SmartPDFViewer the adult Reader uses
// (pagination/zoom/text-layer chrome included) against a book from the
// child's own library, instead of mirroring whatever the adult tab has open.
// E2 scope: view, navigate, resume. No Professor/Whiteboard/canonical
// Thought Units here — that is E3. ReadingBuddy is pre-existing (not new
// wiring); it now runs against Elena's own document instead of the adult's.

import React from "react";
import dynamic from "next/dynamic";
import ReadingBuddy from "@/components/elena/ReadingBuddy";
import type { ChildProfile, ChildLibraryEntry } from "@/lib/elena/types";

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
  library, uploading, uploadError, onUploadClick, onOpenBook,
}: Pick<ChildReaderTabProps, "library" | "uploading" | "uploadError" | "onUploadClick" | "onOpenBook">) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="rounded-2xl border border-white/10 bg-white/3 p-6 text-center">
        <div className="text-4xl mb-2">📚</div>
        <h3 className="text-white font-bold text-base mb-1">No book open yet</h3>
        <p className="text-slate-400 text-sm mb-4">Upload a PDF to start reading.</p>
        <button
          onClick={onUploadClick}
          disabled={uploading}
          className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {uploading ? "Uploading…" : "📤 Upload a Book"}
        </button>
        {uploadError && <p className="text-red-400 text-xs mt-3">{uploadError}</p>}
      </div>

      {library.length > 0 && (
        <div className="mt-5">
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
    </div>
  );
}

export default function ChildReaderTab({
  profile, activeBook, bookFileUrl, library, uploading, uploadError, pageText,
  onUploadClick, onOpenBook, onPageChange, onPageCount, onPageTextExtracted,
}: ChildReaderTabProps) {
  if (!activeBook || !bookFileUrl) {
    return (
      <EmptyReaderState
        library={library} uploading={uploading} uploadError={uploadError}
        onUploadClick={onUploadClick} onOpenBook={onOpenBook}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <h3 className="text-white font-bold text-sm truncate">{activeBook.title}</h3>
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
