// pages/index.tsx
import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, ChangeEvent } from "react";

import { generateTOC, type TOCEntry, outlineToTOC } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import ProgressiveView from "@/components/ProgressiveView";
import type { ThoughtUnit, ReadingStats } from "@/types/reading";
import HybridReader from "@/components/HybridReader";
import HighlightPopup from "@/components/HighlightPopup";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import LinkVideoModal from "@/components/LinkVideoModal";

import {
  firebaseConnected,
  uploadPDF,
  getPDFLibrary,
  deletePDF,
  listenForAuthChanges,
} from "@/lib/firebase";

// ✅ Auto-whiteboard detection + panel
import WhiteboardPanel from "@/components/WhiteboardPanel";

import {
  parseBookWithChapters,
  detectWhiteboardSections,
  containsDiagramOrFormula,
} from "@/lib/parser";

import { usePdfSelection } from "@/hooks/usePdfSelection";

// Lazy-load to keep SSR clean
const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), {
  ssr: false,
});

type StickyNote = { pageNumber: number; content: string };

/* ----------------------- helpers ----------------------- */
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Convert whatever the parser returns → { text: string }[] */
function normalizeParsedUnits(raw: unknown): ThoughtUnit[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((u) => {
    if (typeof u === "string") return { text: u } as ThoughtUnit;
    if (Array.isArray(u)) return { text: (u as any[]).filter(Boolean).join(" ") } as ThoughtUnit;
    if (u && typeof (u as any).text === "string") return u as ThoughtUnit;
    return { text: String(u ?? "") } as ThoughtUnit;
  });
}

/** Safely pluck a human string from mixed unit shapes */
function unitToString(u: any): string {
  if (!u) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.filter(Boolean).join(" ");
  if (typeof u.text === "string") return u.text;
  return String(u);
}

export default function ThoughtUnitReader() {
  /* =========================================================================
     🔹 State
  ========================================================================= */
  const [user, setUser] = useState<any>(null);
  const USER_ID = user?.uid || "guest-user";

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [viewMode, setViewMode] =
    useState<"original" | "progressive" | "hybrid" | "rightbrain">("original");

  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);

  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 0,
  });

  const [highlightedWord, setHighlightedWord] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState("");
  const [darkMode, setDarkMode] = useState(true);

  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  const [showLibrary, setShowLibrary] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<
    { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean }[]
  >([]);

  // Attachments + modal
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");

  // ✅ Auto-whiteboard control + data
  const [autoWhiteboard, setAutoWhiteboard] = useState<boolean>(true);
  const [showWhiteboardPanel, setShowWhiteboardPanel] = useState<boolean>(false);
  const [wbConcept, setWbConcept] = useState<string>("");
  const [wbContext, setWbContext] = useState<string>("");
  const [wbStickyNotes, setWbStickyNotes] = useState<StickyNote[]>([]);
  const lastDetectedUnitRef = useRef<string | null>(null);

  /* =========================================================================
     🔹 Auth Listener
  ========================================================================= */
  useEffect(() => {
    listenForAuthChanges((u) => setUser(u));
  }, []);

  /* =========================================================================
     🔹 Load PDF Library (Firebase) or keep session list (guest)
  ========================================================================= */
  useEffect(() => {
    if (firebaseConnected && user) {
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    }
  }, [user, showLibrary]);

  /* =========================================================================
     🔹 Unified selection hook
  ========================================================================= */
  const sel = usePdfSelection({
    minChars: 2,
    onSelect: () => {},
    autoWhiteboard,
    containsDiagramOrFormula,
    onDiagramDetected: (concept, ctx) => {
      setWbConcept(truncate(concept, 600));
      setWbContext(ctx);
      setShowWhiteboardPanel(true);
    },
    pageProvider: () => currentPage,
    contextLabel: uploadedFile?.name ? `From ${uploadedFile.name}` : undefined,
    debounceMs: 0,
  });

  /* =========================================================================
     🔹 Upload PDF — also parse into thoughtUnits + detect diagrams
  ========================================================================= */
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setUploadedFile(file);
    setViewMode("original");
    setBookId(file.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book");

    let url: string;
    let libEntry: { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean };

    if (firebaseConnected && user) {
      url = await uploadPDF(file, USER_ID);
      getPDFLibrary(USER_ID).then(setPdfLibrary);
      libEntry = {
        id: String(Date.now()),
        name: file.name,
        url,
        uploadedAt: new Date().toISOString(),
      };
    } else {
      // Guest mode: blob URL + session library
      url = URL.createObjectURL(file);
      libEntry = {
        id: String(Date.now()),
        name: file.name,
        url,
        uploadedAt: new Date().toISOString(),
        isLocal: true,
      };
      setPdfLibrary((prev) => [libEntry, ...prev]);
    }

    setFileUrl(url);

    // Heuristic TOC (viewer outline will override later)
    generateTOC(url).then(setTableOfContents).catch(() => {});

    // Parse → normalize → store
    try {
      const { parsedUnits, chapters } = await parseBookWithChapters(file);

      const normalized = normalizeParsedUnits(parsedUnits);
      setThoughtUnits(normalized);
      setSampleText(normalized[0]?.text ?? "");

      // Whiteboard auto-detect
      const matches = detectWhiteboardSections(parsedUnits);
      if (autoWhiteboard && matches.length > 0) {
        const firstIdx = matches[0];

        const conceptText =
          unitToString((parsedUnits as any[])[firstIdx]) ||
          normalized[firstIdx]?.text ||
          "";

        lastDetectedUnitRef.current = conceptText;

        const contextTitle =
          chapters?.[Math.min(firstIdx, Math.max(0, chapters.length - 1))]?.title ||
          chapters?.[0]?.title ||
          "Detected diagram/formula";

        setWbConcept(truncate(conceptText, 600));
        setWbContext(contextTitle);
        setWbStickyNotes([]);
        setShowWhiteboardPanel(true);
      } else {
        setShowWhiteboardPanel(false);
      }
    } catch (err) {
      console.warn("Whiteboard auto-detect skipped (parse failed):", err);
    }
  };

  /* =========================================================================
     🔹 Load PDF from Library (no auto-detect here since we lack the File)
  ========================================================================= */
  const handleLoadPDF = (url: string) => {
    setFileUrl(url);
    setShowLibrary(false);
    setViewMode("original");
    generateTOC(url).then(setTableOfContents).catch(() => {});
  };

  /* =========================================================================
     🔹 Delete PDF (disabled for guest session items)
  ========================================================================= */
  const handleDeletePDF = async (id: string, name: string, isLocal?: boolean) => {
    if (!confirm(`Delete ${name}?`)) return;

    if (firebaseConnected && user && !isLocal) {
      await deletePDF(USER_ID, id, name);
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    } else {
      // guest: remove from session list
      setPdfLibrary((prev) => prev.filter((p) => p.id !== id));
    }
  };

  /* =========================================================================
     🔹 Render Reader Content
  ========================================================================= */
  const renderContent = () => {
    if (viewMode === "rightbrain") {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={sel.selectionText}
          attachments={attachments}
          currentPage={currentPage}
          onDone={() => setViewMode("progressive")}
        />
      );
    }

    if (viewMode === "progressive") {
      return (
        <ProgressiveView
          bookId={bookId}
          userId={USER_ID}
          thoughtUnits={thoughtUnits}
          currentThoughtUnit={currentThoughtUnit}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          stats={stats}
          highlightedWord={highlightedWord}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineSpacing={lineSpacing}
          onWordClick={(w) => setHighlightedWord(w)}
          setReadingSpeed={setReadingSpeed}
          onTextSelect={(t) => sel.setSelectionText(t)}
          selBind={sel.bind}
          externalSelectionText={sel.selectionText}
        />
      );
    }

    if (viewMode === "hybrid") {
      return (
        <HybridReader
          fileUrl={fileUrl || ""}
          pdfId={bookId}
          userId={USER_ID}
          sampleText={sampleText}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          currentThoughtUnit={currentThoughtUnit}
          setCurrentThoughtUnit={setCurrentThoughtUnit}
          thoughtUnits={thoughtUnits}
          highlightedWord={highlightedWord}
          setHighlightedWord={setHighlightedWord}
          stats={stats}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineSpacing={lineSpacing}
          clickSwitchesTo={clickSwitchesTo}
          onWordClick={(w) => setHighlightedWord(w)}
          setReadingSpeed={setReadingSpeed}
          setCurrentPage={setCurrentPage}
          onTextSelect={(t) => sel.setSelectionText(t)}
          selBind={sel.bind}
          externalSelectionText={sel.selectionText}
        />
      );
    }

    // Original view (PDF)
    return fileUrl ? (
      <div className="h-full" onMouseUp={sel.bind.onMouseUp}>
        <SmartPDFViewer
          fileUrl={fileUrl}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          scale={1.25}
          onTextSelect={(t) => sel.setSelectionText(t)}
          onPageCount={(n) => setPdfPageCount(n)}
          onOutline={(items) => {
            const normalized = outlineToTOC(items as any);
            if (normalized && normalized.length) {
              setTableOfContents(normalized);
            }
          }}
        />
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p>📂 Upload a PDF to begin</p>
        <label className="bg-yellow-500 text-black px-4 py-2 rounded cursor-pointer">
          Upload PDF
          <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
        </label>
      </div>
    );
  };

  /* =========================================================================
     🔹 Main Layout
  ========================================================================= */
  return (
    <div
      className={`min-h-screen flex flex-col ${
        darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      }`}
    >
      <header className="bg-gradient-to-r from-purple-600 via-pink-500 to-yellow-400 text-white shadow-md">
        <div className="py-4 flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide drop-shadow-lg">
            Thought Unit Reader
          </h1>
          <p className="text-sm md:text-lg italic opacity-90">Read Smarter, Remember Longer</p>
        </div>
      </header>

      {/* Quick controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-80 mr-1">View:</span>
          {(["original", "progressive", "hybrid", "rightbrain"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`text-xs px-2 py-1 rounded ${
                viewMode === m ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Auto-whiteboard toggle */}
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoWhiteboard}
            onChange={(e) => setAutoWhiteboard(e.target.checked)}
          />
          <span>Auto-explain diagrams on Whiteboard</span>
          {showWhiteboardPanel && wbConcept && (
            <span className="ml-2 text-yellow-300">✨ Detected — opening explanation…</span>
          )}
        </label>

        {/* Dark mode */}
        <button
          onClick={() => setDarkMode((d) => !d)}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
        >
          {darkMode ? "🌙 Dark" : "☀️ Light"}
        </button>

        {/* Library is always available; guest = session only */}
        <button
          onClick={() => setShowLibrary(true)}
          className="text-xs px-3 py-1 rounded bg-yellow-500 text-black shadow"
        >
          📚 Library
        </button>
      </div>

      {/* Reader + WhiteboardPanel */}
      <div className="flex flex-1 overflow-hidden px-4 gap-4">
        {showTOC && fileUrl && (
          <TOCSidebar toc={tableOfContents} currentPage={currentPage} onJumpToPage={setCurrentPage} />
        )}

        <div className="flex-1 bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>

        {showWhiteboardPanel && wbConcept && (
          <div className="w-full md:w-[420px] lg:w-[480px] shrink-0 bg-gray-900 text-white rounded-lg p-3 overflow-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Whiteboard Explanation</h3>
              <button
                onClick={() => setShowWhiteboardPanel(false)}
                className="text-sm bg-gray-700 hover:bg-gray-600 rounded px-2 py-1"
              >
                ✖ Close
              </button>
            </div>
            <WhiteboardPanel
              concept={wbConcept}
              context={wbContext}
              stickyNotes={wbStickyNotes}
              autoTrigger={true}
              lessonTitle={uploadedFile?.name ? `Whiteboard — ${uploadedFile.name}` : "Whiteboard Lesson"}
              lessonId={bookId}
              userId={USER_ID}
            />
          </div>
        )}
      </div>

      {/* Library Drawer (guest + auth) */}
      {showLibrary && (
        <div className="fixed top-0 right-0 w-80 h-full bg-gray-800 text-white shadow-lg z-50 p-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">My Library</h2>
            <button onClick={() => setShowLibrary(false)}>✖</button>
          </div>

          {!user && (
            <div className="mb-3 text-xs text-yellow-300">
              Guest mode: uploads are stored locally for this session only.
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {pdfLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">No PDFs yet.</p>
            ) : (
              pdfLibrary.map((pdf) => (
                <div
                  key={pdf.id}
                  className="flex justify-between items-center mb-2 p-2 hover:bg-gray-700 rounded"
                >
                  <span onClick={() => handleLoadPDF(pdf.url)} className="cursor-pointer">
                    {pdf.name}
                  </span>
                  <button
                    onClick={() => handleDeletePDF(pdf.id, pdf.name, pdf.isLocal)}
                    className={`${
                      pdf.isLocal || (firebaseConnected && user)
                        ? "text-red-400 hover:text-red-200"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                    disabled={!pdf.isLocal && !(firebaseConnected && user)}
                    title={
                      !pdf.isLocal && !(firebaseConnected && user)
                        ? "Delete requires sign-in"
                        : "Delete"
                    }
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>

          <label className="mt-4 block bg-yellow-500 text-black text-center py-2 rounded cursor-pointer">
            ➕ Upload PDF
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}

      {/* Highlight Popup (unified selection) */}
      {sel.popupPosition && sel.selectionText && (
        <HighlightPopup
          position={sel.popupPosition}
          selectionText={sel.selectionText}
          onCreateNote={() => setViewMode("rightbrain")}
          onCreateDetailedNote={async () => {
            const note = await sel.createDetailedNote({
              discipline: "dentistry",
              style: "detailed",
            });
            if (note) sel.setSelectionText(note);
            setViewMode("rightbrain");
          }}
          onAddFlashcard={() => console.log("Flashcard created")}
          onAttachLink={() => setShowLinkModal(true)}
          onClose={() => sel.clearSelection()}
        />
      )}

      {showLinkModal && (
        <LinkVideoModal
          onClose={() => setShowLinkModal(false)}
          onSave={(url) => {
            setAttachments((prev) => [...prev, url]);
            setViewMode("rightbrain");
            setShowLinkModal(false);
          }}
        />
      )}
    </div>
  );
}