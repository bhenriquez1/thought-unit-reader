// 🧠 Thought-Unit Reader with Integrated Enhancements
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export default function Reader() {
  const { theme, setTheme } = useTheme();
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfScale, setPdfScale] = useState(1.0);
  const zoomRef = useRef(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [inputText, setInputText] = useState('');
  const textAreaRef = useRef(null);
  const [thoughtUnits, setThoughtUnits] = useState([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleMouseMove = (e) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const zoomToFocus = (newScale) => {
    if (!zoomRef.current) return;
    const container = zoomRef.current;
    const rect = container.getBoundingClientRect();
    const dx = lastMousePos.current.x - rect.left;
    const dy = lastMousePos.current.y - rect.top;
    const scrollXRatio = dx / rect.width;
    const scrollYRatio = dy / rect.height;

    setPdfScale(newScale);

    setTimeout(() => {
      container.scrollLeft = container.scrollWidth * scrollXRatio - rect.width / 2;
      container.scrollTop = container.scrollHeight * scrollYRatio - rect.height / 2;
    }, 100);
  };

  const handleWordClick = useCallback(() => {
    if (!textAreaRef.current || thoughtUnits.length === 0) return;
    const pos = textAreaRef.current.selectionStart;
    const word = inputText.substring(pos).split(/\s+/)[0].toLowerCase();
    const matchIndex = thoughtUnits.findIndex(tu => tu.toLowerCase().includes(word));
    if (matchIndex !== -1 && matchIndex !== currentChunkIndex) {
      setCurrentChunkIndex(matchIndex);
      setCurrentWordIndex(0);
      if (isPlaying) setIsPlaying(false);
    }
  }, [inputText, thoughtUnits, currentChunkIndex, isPlaying]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Header Controls */}
      <div className="flex justify-between items-center p-4 border-b">
        <div className="space-x-2">
          <button onClick={() => zoomToFocus(Math.max(0.5, pdfScale - 0.1))}>-</button>
          <button onClick={() => zoomToFocus(Math.min(2.0, pdfScale + 0.1))}>+</button>
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* PDF Viewer */}
      <div ref={zoomRef} onMouseMove={handleMouseMove} className="flex-1 overflow-auto">
        {pdfFile && (
          <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} scale={pdfScale} />
          </Document>
        )}
      </div>

      {/* Text Area for Navigation */}
      <textarea
        ref={textAreaRef}
        onClick={handleWordClick}
        onMouseUp={handleWordClick}
        className="w-full h-32 border-t p-4 font-mono"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
      />
    </div>
  );
}

// 🧹 Deduplication Example (place in parser logic)
function deduplicateChapters(chapters) {
  const clean = [];
  let lastTitle = '';
  let lastPosition = -1;
  for (const ch of chapters) {
    if (ch.title === lastTitle && Math.abs(ch.startIndex - lastPosition) < 500) continue;
    clean.push(ch);
    lastTitle = ch.title;
    lastPosition = ch.startIndex;
  }
  return clean;
}