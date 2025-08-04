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
  signInWithGoogle,
  signOutUser,
  listenForAuthChanges,
  connectWallet // ✅ added wallet connect
} from "@/lib/firebase";

const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });

export default function ThoughtUnitReader() {
  /** ===== Auth State ===== **/
  const [user, setUser] = useState<any>(null);
  const USER_ID = user?.uid || "guest-user";
  const [walletAddress, setWalletAddress] = useState<string | null>(null); // ✅ track wallet address

  /** ===== Reader State ===== **/
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

  /** ===== TOC State ===== **/
  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  /** ===== Library State ===== **/
  const [showLibrary, setShowLibrary] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<
    { id: string; name: string; url: string; uploadedAt: any }[]
  >([]);

  /** ===== Popup & Note State ===== **/
  const [selectedText, setSelectedText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");

  /** ===== Debug ===== **/
  const selectionRangeRef = useRef<Range | null>(null);
  const [firebaseStatus] = useState(firebaseConnected);

  /* =========================================================================
     🔹 AUTH LISTENER
  ========================================================================= */
  useEffect(() => {
    listenForAuthChanges((u) => {
      setUser(u);
    });
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
     🔹 Handle File Upload
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
  };

  /* =========================================================================
     🔹 Load PDF from Library
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
     🔹 Handle Text Selection
  ========================================================================= */
  const handleTextSelect = (text: string) => {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    selectionRangeRef.current = range;
    setSelectedText(text);
    updatePopupPositionFromRange(range);
  };

  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    setPopupPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 40
    });
  };

  /* =========================================================================
     🔹 Render Main Content
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
        <p>📂 Upload a PDF to begin</p>
        <label className="bg-yellow-500 text-black px-4 py-2 rounded cursor-pointer">
          Upload PDF
          <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
        </label>
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      {/* Auth Bar */}
      <div className="p-2 flex justify-between items-center bg-gray-800 text-white">
        <div className="flex gap-3 items-center">
          {user ? (
            <>
              <span>👋 {user.displayName}</span>
              <button onClick={signOutUser} className="bg-red-500 px-3 py-1 rounded">
                Sign Out
              </button>
            </>
          ) : (
            <button onClick={signInWithGoogle} className="bg-green-500 px-3 py-1 rounded">
              Sign In with Google
            </button>
          )}

          {/* Wallet Connect */}
          <button
            onClick={async () => {
              const address = await connectWallet();
              if (address) setWalletAddress(address);
            }}
            className="bg-purple-500 px-3 py-1 rounded"
          >
            {walletAddress ? `Wallet: ${walletAddress}` : "Connect Wallet"}
          </button>
        </div>
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

      {/* Slide-in Library Drawer */}
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

      {/* Main Reader */}
      <div className="flex flex-1 overflow-hidden px-4">
        {showTOC && fileUrl && <TOCSidebar toc={tableOfContents} currentPage={currentPage} onJumpToPage={setCurrentPage} />}
        <div className="flex-1 bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>
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