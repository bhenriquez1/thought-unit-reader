import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, ChangeEvent } from "react";
import { generateTOC, TOCEntry } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import ProgressiveView, { ThoughtUnit, ReadingStats } from "@/components/ProgressiveView";
import HybridReader from "@/components/HybridReader";
import HighlightPopup from "@/components/HighlightPopup";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import LinkVideoModal from "@/components/LinkVideoModal";
import { firebaseConnected, uploadPDF, fetchLastPDF } from "@/lib/firebase";

const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });

export default function ThoughtUnitReader() {
  /** ===== Reader State ===== **/
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<"original" | "progressive" | "hybrid" | "rightbrain">("original");
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({ wordsRead: 0, timeElapsed: 0, currentWPM: 0 });
  const [highlightedWord, setHighlightedWord] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState("");
  const [darkMode, setDarkMode] = useState(true);

  /** ===== TOC State ===== **/
  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  /** ===== Popup & Note State ===== **/
  const [selectedText, setSelectedText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");

  /** ===== Selection Tracking ===== **/
  const [lastSelection, setLastSelection] = useState<{ text: string; range: Range | null } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  /** ===== Debug Panel State ===== **/
  const [debugMode, setDebugMode] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [firebaseStatus, setFirebaseStatus] = useState(firebaseConnected);

  const USER_ID = "demo-user"; // 🔹 Replace with Firebase Auth later

  const logDebug = (message: string, data?: any) => {
    const log = `${new Date().toLocaleTimeString()} — ${message}`;
    console.log("🛠 DEBUG:", message, data || "");
    setDebugLogs((prev) => [log, ...prev]);
  };

  /** ===== Firebase Connection Check ===== **/
  useEffect(() => {
    setFirebaseStatus(firebaseConnected);
    logDebug(firebaseConnected ? "✅ Firebase Connected" : "❌ Firebase Not Connected - Check environment variables");
  }, []);

  /** ===== Load Last Uploaded PDF from Firebase ===== **/
  useEffect(() => {
    if (!fileUrl && firebaseConnected) {
      fetchLastPDF(USER_ID).then((url) => {
        if (url) {
          setFileUrl(url);
          logDebug("📄 Loaded last uploaded PDF from Firebase", url);
        }
      });
    }
  }, [fileUrl]);

  /** ===== Cleanup Object URLs ===== **/
  useEffect(() => {
    return () => {
      if (fileUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  /** ===== Load TOC on PDF Upload ===== **/
  useEffect(() => {
    if (uploadedFile && fileUrl) {
      const uniqueId = `${uploadedFile.name}-${uploadedFile.size}`;
      setBookId(uniqueId);
      generateTOC(fileUrl).then((toc) => {
        setTableOfContents(toc);
        logDebug("TOC Generated", toc);
      });
    }
  }, [uploadedFile, fileUrl]);

  /** ===== Handle Text Selection ===== **/
  const handleTextSelect = (text: string) => {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    selectionRangeRef.current = range;
    setLastSelection({ text, range });
    updatePopupPositionFromRange(range);
    setSelectedText(text);
    logDebug("Text Selected", text);
  };

  /** ===== Popup Position ===== **/
  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    setPopupPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 40,
    });
  };

  /** ===== Keep Popup Positioned ===== **/
  useEffect(() => {
    const repositionPopup = () => {
      if (selectionRangeRef.current) {
        updatePopupPositionFromRange(selectionRangeRef.current);
      }
    };
    window.addEventListener("scroll", repositionPopup, { passive: true });
    window.addEventListener("resize", repositionPopup);
    return () => {
      window.removeEventListener("scroll", repositionPopup);
      window.removeEventListener("resize", repositionPopup);
    };
  }, []);

  /** ===== Safe view switcher (guards) ===== **/
  const safeSetViewMode = (mode: typeof viewMode) => {
    if (!fileUrl && mode !== "original") {
      alert("📂 Please upload a PDF first.");
      logDebug(`❌ Blocked switching to ${mode} — no PDF uploaded`);
      return;
    }
    if (!firebaseStatus && mode === "rightbrain") {
      alert("⚠️ Firebase is not connected. Notes may not persist.");
      logDebug(`⚠ Warning: switching to ${mode} — Firebase not connected`);
    }
    setViewMode(mode);
    logDebug(`Switched to ${mode} mode`);
  };

  /** ===== File upload handler with Firebase ===== **/
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    setUploadedFile(file);
    setViewMode("original");

    if (firebaseConnected) {
      logDebug("📤 Uploading PDF to Firebase...");
      const url = await uploadPDF(file, USER_ID);
      setFileUrl(url);
      logDebug("✅ Uploaded & loaded from Firebase:", url);
    } else {
      const localUrl = URL.createObjectURL(file);
      setFileUrl(localUrl);
      logDebug("⚠ Firebase not connected, using local file URL");
    }
  };

  /** ===== Popup Actions ===== **/
  const handleCreateNote = () => {
    safeSetViewMode("rightbrain");
    setPopupPosition(null);
  };
  const handleAttachLink = () => {
    setShowLinkModal(true);
    setPopupPosition(null);
    logDebug("Attach Link Modal Opened");
  };

  /** ===== Render Right Content ===== **/
  const renderContent = () => {
    if (viewMode === "rightbrain") {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={selectedText}
          attachments={attachments}
          onDone={() => {
            safeSetViewMode("progressive");
            if (lastSelection?.range) {
              selectionRangeRef.current = lastSelection.range;
              setSelectedText(lastSelection.text);
              updatePopupPositionFromRange(lastSelection.range);
            }
            logDebug("Returned to Progressive View from Notes");
          }}
        />
      );
    }
    if (viewMode === "progressive") {
      return (
        <ProgressiveView
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
          onStart={() => setIsReading(true)}
          onPause={() => setIsPaused(true)}
          onReset={() => {
            setIsReading(false);
            setIsPaused(false);
            setCurrentThoughtUnit(1);
          }}
          setReadingSpeed={setReadingSpeed}
          onTextSelect={handleTextSelect}
        />
      );
    }
    if (viewMode === "hybrid") {
      return (
        <HybridReader
          fileUrl={fileUrl || ""}
          sampleText={sampleText}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          currentThoughtUnit={currentThoughtUnit}
          thoughtUnits={thoughtUnits}
          highlightedWord={highlightedWord}
          stats={stats}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineSpacing={lineSpacing}
          clickSwitchesTo={clickSwitchesTo}
          onWordClick={(w) => setHighlightedWord(w)}
          onStartReading={() => setIsReading(true)}
          onPauseReading={() => setIsPaused(true)}
          onResetReading={() => {
            setIsReading(false);
            setIsPaused(false);
            setCurrentThoughtUnit(1);
          }}
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
        <p className="text-lg">📂 Upload a PDF to begin reading.</p>
        <label className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded-lg cursor-pointer font-bold">
          📁 Upload PDF
          <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
        </label>
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      {!firebaseStatus && (
        <div className="bg-red-600 text-white text-center py-2 font-bold">
          ⚠️ Firebase is not connected — check your environment variables!
        </div>
      )}

      <div className="text-center mt-4 px-4">
        <h1 className="text-3xl font-bold">Thought Unit Reader</h1>
        <p className="text-yellow-400 italic mt-1">Read Deeper. Think Harder. Learn Smarter.</p>
      </div>

      {!fileUrl && (
        <div className="flex justify-center my-6 px-4">
          <label className="w-full max-w-md flex justify-center bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-4 rounded-lg cursor-pointer font-bold text-center">
            📂 Upload PDF
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}

      <div className="flex gap-2 mb-4 justify-center flex-wrap px-4">
        <button onClick={() => setShowTOC((s) => !s)} className="px-3 py-1 bg-gray-700 rounded text-sm">📑 TOC</button>
        <button onClick={() => safeSetViewMode("original")} className="px-3 py-1 bg-gray-700 rounded text-sm" disabled={!fileUrl}>Original</button>
        <button onClick={() => safeSetViewMode("progressive")} className="px-3 py-1 bg-gray-700 rounded text-sm" disabled={!fileUrl}>Progressive</button>
        <button onClick={() => safeSetViewMode("hybrid")} className="px-3 py-1 bg-gray-700 rounded text-sm" disabled={!fileUrl}>Hybrid</button>
        <button onClick={() => safeSetViewMode("rightbrain")} className="px-3 py-1 bg-gray-700 rounded text-sm" disabled={!fileUrl}>Right Brain</button>
      </div>

      <div className="flex flex-1 overflow-hidden px-4">
        {showTOC && fileUrl && (
          <div className="flex-shrink-0">
            <TOCSidebar toc={tableOfContents} currentPage={currentPage} onJumpToPage={(p) => setCurrentPage(p)} />
          </div>
        )}
        <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {fileUrl ? (
              <SmartPDFViewer fileUrl={fileUrl} currentPage={currentPage} onPageChange={setCurrentPage} scale={1.25} onTextSelect={handleTextSelect} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
                <p className="text-lg">📂 No PDF loaded.</p>
                <label className="bg-yellow-500 hover:bg-yellow-600 text-black px-5 py-3 rounded-lg cursor-pointer font-bold">
                  Upload PDF
                  <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
                </label>
              </div>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>
        </div>
      </div>

      {popupPosition && (
        <HighlightPopup position={popupPosition} onCreateNote={handleCreateNote} onAddFlashcard={() => logDebug("Flashcard Created", selectedText)} onAttachLink={handleAttachLink} onClose={() => setPopupPosition(null)} />
      )}
      {showLinkModal && (
        <LinkVideoModal onClose={() => setShowLinkModal(false)} onSave={(url) => { setAttachments((prev) => [...prev, url]); safeSetViewMode("rightbrain"); setShowLinkModal(false); logDebug("Link Attached", url); }} />
      )}
      {debugMode && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-yellow-300 p-3 rounded-lg w-80 h-60 overflow-y-auto text-xs shadow-lg border border-yellow-500">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Debug Panel</span>
            <button onClick={() => setDebugMode(false)} className="text-red-400 hover:text-red-300">✕</button>
          </div>
          {debugLogs.length === 0 ? <p>No debug logs yet...</p> : debugLogs.map((log, i) => <p key={i}>{log}</p>)}
        </div>
      )}
    </div>
  );
}