import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);

  // PDF states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);

  // Hybrid reader
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [maxChunkSize, setMaxChunkSize] = useState(6);
  const [wpm, setWpm] = useState(200);

  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [highlightPosition, setHighlightPosition] = useState<{ start: number; end: number } | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Table of Contents click
  const goToChapter = (chapterIndex: number) => {
    const chapter = bookStructure.chapters[chapterIndex];
    if (chapter && chapter.units.length) {
      setCurrentChunkIndex(chapter.units[0].globalIndex);
      setCurrentWordIndex(0);
    }
  };

  // Chunking logic (unchanged)...
  const createThoughtUnits = useCallback((text: string) => {
    // ... same chunking as before, but record globalIndex on units
    // For brevity, assume parseBookWithChapters returns units with globalIndex
  }, [maxChunkSize]);

  // Word-click sync
  const handleWordClick = (wordIndex: number) => {
    const chunk = thoughtUnits[currentChunkIndex];
    const chunkStart = inputText.toLowerCase().indexOf(chunk.toLowerCase());
    if (chunkStart === -1) return;
    const words = chunk.split(/\s+/);
    const before = words.slice(0, wordIndex).join(' ');
    const start = chunkStart + (before.length ? before.length + 1 : 0);
    const end = start + words[wordIndex].length;

    setHighlightPosition({ start, end });
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(start, end);
        const textarea = textAreaRef.current;
        const scrollPos = (start / inputText.length) * textarea.scrollHeight;
        textarea.scrollTop = scrollPos - textarea.clientHeight / 2;
      }
    }, 0);
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-100">
      {/* TOC */}
      {bookStructure && (
        <nav className="flex space-x-2 p-2 bg-white shadow">
          {bookStructure.chapters.map((ch: any, i: number) => (
            <button
              key={i}
              className="px-2 py-1 border rounded text-sm"
              onClick={() => goToChapter(i)}
            >
              {ch.title}
            </button>
          ))}
        </nav>
      )}

      <div className="flex">
        {/* PDF Panel */}
        <div className="w-1/2 h-screen flex flex-col bg-white border-r">
          <div className="p-2 flex items-center justify-between">
            <h2 className="font-bold">Original Content</h2>
            {fileType === 'pdf' && (
              <div className="flex items-center space-x-1">
                <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}>-</button>
                <span>{Math.round(pdfScale * 100)}%</span>
                <button onClick={() => setPdfScale(s => Math.min(2, s + 0.1))}>+</button>
              </div>
            )}
          </div>
          <div
            ref={pdfContainerRef}
            className="flex-1 overflow-auto"
            style={{ touchAction: 'pan-x pan-y' }}
          >
            {fileType === 'pdf' && pdfFile && (
              <div style={{ transform: `scale(${pdfScale})`, transformOrigin: '0 0' }}>
                <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                  {Array.from({ length: numPages }).map((_, i) => (
                    <div key={i} className="relative mb-4">
                      <button
                        className="absolute top-2 right-2 bg-blue-500 text-white text-xs p-1 rounded"
                        onClick={() => setCurrentChunkIndex(Math.floor((i / numPages) * thoughtUnits.length))}
                      >
                        📍
                      </button>
                      <Page pageNumber={i + 1} renderAnnotationLayer={false} renderTextLayer={true} />
                    </div>
                  ))}
                </Document>
              </div>
            )}
            {fileType === 'text' && (
              <textarea
                ref={textAreaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                style={{ fontSize: '1.125rem', lineHeight: 1.6 }}
                className="w-full h-full p-4 border-2 border-gray-300 resize-none"
              />
            )}
          </div>
        </div>

        {/* Thought Units Panel */}
        <div className="w-1/2 h-screen flex flex-col bg-white">
          <div className="p-2 flex items-center justify-between">
            <h2 className="font-bold">Thought Units</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-2">
              {thoughtUnits[currentChunkIndex]?.split(/\s+/).map((w, i) => (
                <span
                  key={i}
                  onClick={() => handleWordClick(i)}
                  className={`inline-block px-1 py-0.5 cursor-pointer ${i === currentWordIndex ? 'bg-yellow-200' : ''}`}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}