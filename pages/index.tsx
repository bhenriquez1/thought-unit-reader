// pages/index.tsx
import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, ChangeEvent } from "react";
import { generateTOC, TOCEntry } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import ProgressiveView, { ThoughtUnit, ReadingStats } from "@/components/ProgressiveView";
import HybridReader from "@/components/HybridReader";
import HighlightPopup from "@/components/HighlightPopup";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import LinkVideoModal from "@/components/LinkVideoModal";

import {
  firebaseConnected,
  uploadPDF,
  getPDFLibrary,
  deletePDF,
  listenForAuthChanges
} from "@/lib/firebase";

// ✅ Auto-whiteboard detection + panel
import RightPanel from "@/components/RightPanel";
import {
  parseBookWithChapters,
  detectWhiteboardSections,
  containsDiagramOrFormula
} from "@/lib/parser";

import { truncate } from "@/lib/utils"; // ← NEW: use shared truncate

const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });

type StickyNote = { pageNumber: number; content: string };

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
    currentWPM: 0
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
    { id: string; name: string; url: string; uploadedAt: any }[]
  >([]);

  const [selectedText, setSelectedText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");

  const selectionRangeRef = useRef<Range | null>(null);

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
     🔹 Load PDF Library
  ========================================================================= */
  useEffect(() => {
    if (firebaseConnected && user) {
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    }
  }, [user, showLibrary]);

  /* =========================================================================
     🔹 Upload PDF — includes detectWhiteboardSections() auto-trigger
  ========================================================================= */
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setUploadedFile(file);
    setViewMode("original");

    let url: string;
    if (firebaseConnected && user) {
      url = await uploadPDF(file, USER_ID);
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    } else {
      url = URL.createObjectURL(file);
    }
    setFileUrl(url);
    generateTOC(url).then(setTableOfContents);

    // ✅ Parse + detect diagram/formula sections for auto whiteboard
    try {
      const { parsedUnits, chapters } = await parseBookWithChapters(file);
      const matches = detectWhiteboardSections(parsedUnits);

      if (autoWhiteboard && matches.length > 0) {
        const firstIdx = matches[0];
        const conceptText = (parsedUnits[firstIdx] || []).join(" ").trim();
        lastDetectedUnitRef.current = conceptText;

        const contextTitle =
          chapters?.[Math.min(firstIdx, Math.max(0, chapters.length - 1))]?.title ||
          chapters?.[0]?.title ||
          "Detected diagram/formula";

        setWbConcept(truncate(conceptText, 600));
        setWbContext(contextTitle);
        setWbStickyNotes([]); // (optional) later: load from Firestore
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
    generateTOC(url).then(setTableOfContents);
  };

  /* =========================================================================
     🔹 Delete PDF
  ========================================================================= */
  const handleDeletePDF = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    await deletePDF(USER_ID, id, name);
    getPDFLibrary(USER_ID).then(setPdfLibrary);
  };

  /* =========================================================================
     🔹 Handle Text Selection — optional selection-time detection
  ========================================================================= */
  const handleTextSelect = (text: string) => {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    selectionRangeRef.current = range;
    setSelectedText(text);
    updatePopupPositionFromRange(range);

    // If the selection looks like a diagram/formula, pop the panel
    if (autoWhiteboard && containsDiagramOrFormula(text)) {
      setWbConcept(truncate(text, 600));
      setWbContext(
        uploadedFile?.name ? `From ${uploadedFile.name}, p.${currentPage}` : `From page ${currentPage}`
      );
      setShowWhiteboardPanel(true);
    }
  };

  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    setPopupPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 40
    });
  };

  /* =========================================================================
     🔹 Render Reader Content
  ========================================================================= */
  const renderContent = () => {
    if (viewMode === "rightbrain") {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={selectedText}
          attachments={attachments}
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
          onTextSelect={handleTextSelect}
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
          onTextSelect={handleTextSelect}
        />
      );
    }
    return fileUrl ? (
      <SmartPDFViewer
        fileUrl={fileUrl}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        scale={1.25}
        onTextSelect={handleTextSelect}
      />
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
    <div className={`min-h-screen flex flex-col ${darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      <header className="bg-gradient-to-r from-purple-600 via-pink-500 to-yellow-400 text-white shadow-md">
        <div className="py-4 flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide drop-shadow-lg">
            Thought Unit Reader
          </h1>
          <p className="text-sm md:text-lg italic opacity-90">Read Smarter, Remember Longer</p>
        </div>
      </header>

      <div className="p-2 text-center bg-gray-800 text-white text-sm">🔒 Sign-In Disabled for Now</div>

      {/* Auto-whiteboard toggle */}
      <div className="p-2 text-center text-sm bg-gray-900">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoWhiteboard}
            onChange={(e) => setAutoWhiteboard(e.target.checked)}
          />
          <span>Auto-explain diagrams on Whiteboard</span>
        </label>
        {showWhiteboardPanel && wbConcept && (
          <span className="ml-3 text-yellow-300">✨ Diagram detected — opening explanation…</span>
        )}
      </div>

      {/* Floating Library Button */}
      {user && (
        <button
          onClick={() => setShowLibrary(true)}
          className="fixed top-4 right-4 bg-yellow-500 text-black px-3 py-1 rounded shadow z-50"
        >
          📚 Library
        </button>
      )}

      {/* Library Drawer */}
      {showLibrary && (
        <div className="fixed top-0 right-0 w-80 h-full bg-gray-800 text-white shadow-lg z-50 p-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">My Library</h2>
            <button onClick={() => setShowLibrary(false)}>✖</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {pdfLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">No PDFs uploaded yet.</p>
            ) : (
              pdfLibrary.map((pdf) => (
                <div key={pdf.id} className="flex justify-between items-center mb-2 p-2 hover:bg-gray-700 rounded">
                  <span onClick={() => handleLoadPDF(pdf.url)} className="cursor-pointer">{pdf.name}</span>
                  <button onClick={() => handleDeletePDF(pdf.id, pdf.name)} className="text-red-400 hover:text-red-200">🗑</button>
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

      {/* Reader + RightPanel */}
      <div className="flex flex-1 overflow-hidden px-4 gap-4">
        {showTOC && fileUrl && (
          <TOCSidebar toc={tableOfContents} currentPage={currentPage} onJumpToPage={setCurrentPage} />
        )}

        <div className="flex-1 bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>

        {/* Auto-mounted RightPanel when detection/selection fires */}
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
            <RightPanel
              concept={wbConcept}
              context={wbContext}
              stickyNotes={wbStickyNotes}
              autoTrigger={true}
              lessonTitle={uploadedFile?.name ? `Whiteboard — ${uploadedFile.name}` : "Whiteboard Lesson"}
              /** 🔐 pass-through for persistence-capable Whiteboard */
              lessonId={bookId}
              userId={USER_ID}
            />
          </div>
        )}
      </div>

      {/* Highlight Popup */}
      {popupPosition && (
        <HighlightPopup
          position={popupPosition}
          onCreateNote={() => setViewMode("rightbrain")}
          onAddFlashcard={() => console.log("Flashcard created")}
          onAttachLink={() => setShowLinkModal(true)}
          onClose={() => setPopupPosition(null)}
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