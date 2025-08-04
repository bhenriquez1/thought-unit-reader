import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef } from 'react';
import { generateTOC, TOCEntry } from '@/lib/tocParser';
import TOCSidebar from '@/components/TOCSidebar';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import HybridReader from '@/components/HybridReader';
import HighlightPopup from '@/components/HighlightPopup'; // motion version
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
  const [textContent, setTextContent] = useState('');
  const [darkMode, setDarkMode] = useState(true);

  // TOC state
  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  // Popup state
  const [selectedText, setSelectedText] = useState('');
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // Attachments & notes
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>('default-book');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

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

    updatePopupPositionFromRange(range);
    setSelectedText(text);
  };

  /** ===============================
   * 📌 Calculate popup position
   * =============================== */
  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    const popupX = rect.left + rect.width / 2 + window.scrollX;
    const popupY = rect.top + window.scrollY - 40;
    setPopupPosition({ x: popupX, y: popupY });
  };

  /** ===============================
   * 📌 Smoothly reposition popup on scroll & resize
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
    if (selectedText) setViewMode('rightbrain');
    setPopupPosition(null);
  };

  const handleAttachLink = () => {
    setShowLinkModal(true);
    setPopupPosition(null);
  };

  /** ===============================
   * 📌 Render based on mode
   * =============================== */
  const renderContent = () => {
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
    if (viewMode === 'rightbrain') {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={selectedText}
          attachments={attachments}
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
      <div className="max-w-full mx-auto p-4 space-y-4">
        {/* Controls */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setShowTOC(!showTOC)} className="px-3 py-1 bg-gray-700 rounded">📑 TOC</button>
          <button onClick={() => setViewMode('original')}>Original</button>
          <button onClick={() => setViewMode('progressive')}>Progressive</button>
          <button onClick={() => setViewMode('hybrid')}>Hybrid</button>
          <button onClick={() => setViewMode('rightbrain')}>Right Brain</button>
        </div>

        {/* Layout */}
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

        {/* Popup */}
        {popupPosition && (
          <HighlightPopup
            position={popupPosition}
            onCreateNote={handleCreateNote}
            onAddFlashcard={() => console.log('Flashcard:', selectedText)}
            onAttachLink={handleAttachLink}
            onClose={() => setPopupPosition(null)}
          />
        )}

        {/* Link modal */}
        {showLinkModal && (
          <LinkVideoModal
            onClose={() => setShowLinkModal(false)}
            onSave={async (url) => {
              if (selectedNoteId) {
                const noteRef = doc(db, 'notes', selectedNoteId);
                await updateDoc(noteRef, { attachments: arrayUnion(url) });
              } else {
                setAttachments((prev) => [...prev, url]);
              }
              setViewMode('rightbrain');
              setShowLinkModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}