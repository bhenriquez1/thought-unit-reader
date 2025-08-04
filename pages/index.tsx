// pages/index.tsx
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef } from 'react';
import { generateTOC, TOCEntry } from '@/lib/tocParser';
import TOCSidebar from '@/components/TOCSidebar';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import HybridReader from '@/components/HybridReader';
import HighlightPopup from '@/components/HighlightPopup';
import RightBrainNoteEditor from '@/components/RightBrainNoteEditor';
import LinkVideoModal from '@/components/LinkVideoModal';

const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), { ssr: false });

export default function ThoughtUnitReader() {
  /** ===== Reader State ===== **/
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<'original' | 'progressive' | 'hybrid' | 'rightbrain'>('progressive');
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({ wordsRead: 0, timeElapsed: 0, currentWPM: 0 });
  const [highlightedWord, setHighlightedWord] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState('');
  const [darkMode, setDarkMode] = useState(true);

  /** ===== TOC State ===== **/
  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  /** ===== Popup & Note State ===== **/
  const [selectedText, setSelectedText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>('default-book');

  /** ===== Selection Tracking ===== **/
  const [lastSelection, setLastSelection] = useState<{ text: string; range: Range | null } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  /** ===== Debug Panel State ===== **/
  const [debugMode, setDebugMode] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const logDebug = (message: string, data?: any) => {
    const log = `${new Date().toLocaleTimeString()} — ${message}`;
    console.log('🛠 DEBUG:', message, data || '');
    setDebugLogs((prev) => [log, ...prev]);
  };

  /** ===== Load TOC on PDF Upload ===== **/
  useEffect(() => {
    if (uploadedFile?.type === 'application/pdf' && fileUrl) {
      const uniqueId = `${uploadedFile.name}-${uploadedFile.size}`;
      setBookId(uniqueId);
      generateTOC(fileUrl).then((toc) => {
        setTableOfContents(toc);
        logDebug('TOC Generated', toc);
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
    logDebug('Text Selected', text);
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
    window.addEventListener('scroll', repositionPopup, { passive: true });
    window.addEventListener('resize', repositionPopup);
    return () => {
      window.removeEventListener('scroll', repositionPopup);
      window.removeEventListener('resize', repositionPopup);
    };
  }, []);

  /** ===== Popup Actions ===== **/
  const handleCreateNote = () => {
    setViewMode('rightbrain');
    setPopupPosition(null);
    logDebug('Switched to Right Brain Mode (Create Note)');
  };

  const handleAttachLink = () => {
    setShowLinkModal(true);
    setPopupPosition(null);
    logDebug('Attach Link Modal Opened');
  };

  /** ===== Render Right Panel Content ===== **/
  const renderContent = () => {
    if (viewMode === 'rightbrain') {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={selectedText}
          attachments={attachments}
          onDone={() => {
            setViewMode('progressive');
            if (lastSelection?.range) {
              selectionRangeRef.current = lastSelection.range;
              setSelectedText(lastSelection.text);
              updatePopupPositionFromRange(lastSelection.range);
            }
            logDebug('Returned to Progressive View from Notes');
          }}
        />
      );
    }
    if (viewMode === 'progressive') {
      if (!thoughtUnits.length) {
        return <div className="p-4">📂 Load a book to start reading.</div>;
      }
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
    if (viewMode === 'hybrid') {
      return (
        <HybridReader
          fileUrl={fileUrl || ''}
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
    return (
      <div>
        {fileUrl ? (
          <SmartPDFViewer
            fileUrl={fileUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={1.25}
            onTextSelect={handleTextSelect}
          />
        ) : (
          <div className="p-4">📂 Please upload a PDF to view it here.</div>
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Slogan */}
      <div className="text-center mt-2 mb-4">
        <h1 className="text-2xl font-bold text-yellow-400 tracking-wide">
          Read Deeper. Think Harder. Learn Smarter.
        </h1>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-[auto,1fr] h-[80vh]">
        {showTOC && (
          <TOCSidebar
            toc={tableOfContents}
            currentPage={currentPage}
            onJumpToPage={(p) => setCurrentPage(p)}
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          {/* PDF Viewer Left */}
          <SmartPDFViewer
            fileUrl={fileUrl || ''}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={1.25}
            onTextSelect={handleTextSelect}
          />
          {/* Right Content */}
          {renderContent()}
        </div>
      </div>

      {/* Highlight Popup */}
      {popupPosition && (
        <HighlightPopup
          position={popupPosition}
          onCreateNote={handleCreateNote}
          onAddFlashcard={() => logDebug('Flashcard Created', selectedText)}
          onAttachLink={handleAttachLink}
          onClose={() => setPopupPosition(null)}
        />
      )}

      {/* Link/Video Modal */}
      {showLinkModal && (
        <LinkVideoModal
          onClose={() => setShowLinkModal(false)}
          onSave={(url) => {
            setAttachments((prev) => [...prev, url]);
            setViewMode('rightbrain');
            setShowLinkModal(false);
            logDebug('Link Attached', url);
          }}
        />
      )}

      {/* Floating Debug Panel */}
      {debugMode && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-yellow-300 p-3 rounded-lg w-80 h-60 overflow-y-auto text-xs shadow-lg border border-yellow-500">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Debug Panel</span>
            <button
              onClick={() => setDebugMode(false)}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
          {debugLogs.length === 0 ? (
            <p>No debug logs yet...</p>
          ) : (
            debugLogs.map((log, i) => <p key={i}>{log}</p>)
          )}
        </div>
      )}
    </div>
  );
}