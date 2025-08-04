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

  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC, setShowTOC] = useState(true);

  const [selectedText, setSelectedText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>('default-book');

  const [lastSelection, setLastSelection] = useState<{ text: string; range: Range | null } | null>(null);

  const selectionRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (uploadedFile?.type === 'application/pdf' && fileUrl) {
      const uniqueId = `${uploadedFile.name}-${uploadedFile.size}`;
      setBookId(uniqueId);
      generateTOC(fileUrl).then((toc) => setTableOfContents(toc));
    }
  }, [uploadedFile, fileUrl]);

  const handleTextSelect = (text: string) => {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    selectionRangeRef.current = range;
    setLastSelection({ text, range });
    updatePopupPositionFromRange(range);
    setSelectedText(text);
  };

  const updatePopupPositionFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    setPopupPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 40,
    });
  };

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

  const handleCreateNote = () => {
    setViewMode('rightbrain');
    setPopupPosition(null);
  };

  const handleAttachLink = () => {
    setShowLinkModal(true);
    setPopupPosition(null);
  };

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
      
      {/* Slogan */}
      <div className="text-center mt-2 mb-4">
        <h1 className="text-2xl font-bold text-yellow-400 tracking-wide">
          Read Deeper. Think Harder. Learn Smarter.
        </h1>
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-4 justify-center">
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