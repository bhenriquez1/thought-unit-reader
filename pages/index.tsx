import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef } from 'react';
import { generateTOC, TOCEntry } from '@/lib/tocParser';
import TOCSidebar from '@/components/TOCSidebar';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import HybridReader from '@/components/HybridReader';
import HighlightPopup from '@/components/HighlightPopup';
import RightBrainNoteEditor from '@/components/RightBrainNoteEditor';
import LinkVideoModal from '@/components/LinkVideoModal';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), { ssr: false });

export default function ThoughtUnitReader() {
  // Reader state
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

  // TOC state
  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  // Popup state
  const [selectedText, setSelectedText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>('default-book');

  // Remember last selection
  const [lastSelection, setLastSelection] = useState<{ text: string; range: Range | null } | null>(null);

  // Track selection range
  const selectionRangeRef = useRef<Range | null>(null);

  /** ===============================
   * 📌 Generate TOC for PDFs
   * =============================== */
  useEffect(() => {
    if (uploadedFile?.type === 'application/pdf' && fileUrl) {
      const uniqueId = `${uploadedFile.name}-${uploadedFile.size}`;
      setBookId(uniqueId);
      generateTOC(fileUrl).then((toc) => setTableOfContents(toc));
    }
  }, [uploadedFile, fileUrl]);

  /** ===============================
   * 📌 Handle highlight selection
   * =============================== */
  const handleTextSelect = (text: string) => {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    selectionRangeRef.current = range;

    // Save last selection for restore later
    setLastSelection({ text, range });

    updatePopupPositionFromRange(range);
    setSelectedText(text);
  };

  /** ===============================
   * 📌 Calculate popup position
   * =============================== */
  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    setPopupPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 40,
    });
  };

  /** ===============================
   * 📌 Keep popup positioned on scroll & resize
   * =============================== */
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

  /** ===============================
   * 📌 Popup actions
   * =============================== */
  const handleCreateNote = () => {
    setViewMode('rightbrain');
    setPopupPosition(null); // hide popup when in note editor
  };

  const handleAttachLink = () => {
    setShowLinkModal(true);
    setPopupPosition(null);
  };

  /** ===============================
   * 📌 Render based on mode
   * =============================== */
  const renderContent = () => {
    if (viewMode === 'rightbrain') {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={selectedText}
          attachments={attachments}
          onDone={() => {
            setViewMode('progressive');
            // Restore last selection and popup
            if (lastSelection?.range) {
              selectionRangeRef.current = lastSelection.range;
              setSelectedText(lastSelection.text);
              updatePopupPositionFromRange(lastSelection.range);
            }
          }}
        />
      );
    }
    if (viewMode === 'progressive') {
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
          fileUrl={fileUrl!}
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
      <SmartPDFViewer
        fileUrl={fileUrl!}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        scale={1.25}
        onTextSelect={handleTextSelect}
      />
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Controls & TOC */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowTOC(!showTOC)} className="px-3 py-1 bg-gray-700 rounded">📑 TOC</button>
        <button onClick={() => setViewMode('original')}>Original</button>
        <button onClick={() => setViewMode('progressive')}>Progressive</button>
        <button onClick={() => setViewMode('hybrid')}>Hybrid</button>
        <button onClick={() => setViewMode('rightbrain')}>Right Brain</button>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-[auto,1fr] h-[80vh]">
        {showTOC && (
          <TOCSidebar
            toc={tableOfContents}
            currentPage={currentPage}
            onJumpToPage={(p) => setCurrentPage(p)}
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          <SmartPDFViewer
            fileUrl={fileUrl!}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={1.25}
            onTextSelect={handleTextSelect}
          />
          {renderContent()}
        </div>
      </div>

      {/* Highlight popup */}
      {popupPosition && (
        <HighlightPopup
          position={popupPosition}
          onCreateNote={handleCreateNote}
          onAddFlashcard={() => console.log('Flashcard:', selectedText)}
          onAttachLink={handleAttachLink}
          onClose={() => setPopupPosition(null)}
        />
      )}

      {/* Link/video modal */}
      {showLinkModal && (
        <LinkVideoModal
          onClose={() => setShowLinkModal(false)}
          onSave={(url) => {
            setAttachments((prev) => [...prev, url]);
            setViewMode('rightbrain');
            setShowLinkModal(false);
          }}
        />
      )}
    </div>
  );
}