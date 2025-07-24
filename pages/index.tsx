// pages/index.tsx - Enhanced with Zoom Pan, Word Navigation, Dark Mode & Fixed Chapter Detection
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState(0);

  // PDF-specific states with pan/zoom
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);
  const [pdfPosition, setPdfPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Dark mode state
  const [darkMode, setDarkMode] = useState(false);

  // Hybrid reader states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [chunkSpeed, setChunkSpeed] = useState(2000);
  const [wordSpeed, setWordSpeed] = useState(300);
  const [maxChunkSize, setMaxChunkSize] = useState(6);
  const [showSettings, setShowSettings] = useState(false);
  const [wpm, setWpm] = useState(200);

  // Navigation states
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [highlightPosition, setHighlightPosition] = useState<{ start: number, end: number } | null>(null);

  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Apply dark mode to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Calculate reading speeds based on WPM
  useEffect(() => {
    const wordMs = (60 / wpm) * 1000;
    setWordSpeed(wordMs);
    setChunkSpeed(wordMs * maxChunkSize * 1.5);
  }, [wpm, maxChunkSize]);

  // Enhanced text chunking with better chapter detection
  const createThoughtUnits = useCallback((inputText: string) => {
    if (!inputText) {
      setThoughtUnits([]);
      return [];
    }

    const cleanText = inputText.replace(/\s+/g, ' ').trim();
    const sentences = cleanText.match(/[^\.\!?]+[\.\!?]+/g) || [cleanText];
    const chunks: string[] = [];

    const breakWords = ['and', 'or', 'but', 'because', 'however', 'therefore', 'meanwhile', 'furthermore', 'moreover', 'consequently'];
    const prepositions = ['in', 'on', 'at', 'by'];

    let currentChunk = "";
    for (let sentence of sentences) {
      currentChunk += sentence.trim() + " ";
      const wordCount = currentChunk.split(" ").length;
      if (wordCount >= maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    setThoughtUnits(chunks);
    return chunks;
  }, [maxChunkSize]);

  // Zoom centered on cursor
  useEffect(() => {
    const container = pdfContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? 1.1 : 0.9;

        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        setPdfScale(prev => {
          const newScale = Math.max(0.5, Math.min(3, prev * zoomFactor));
          setPdfPosition(pos => ({
            x: (pos.x - offsetX) * zoomFactor + offsetX,
            y: (pos.y - offsetY) * zoomFactor + offsetY,
          }));
          return newScale;
        });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // Click a word → highlight its chunk
  const handleWordClick = (word: string) => {
    const index = thoughtUnits.findIndex(unit => unit.includes(word));
    if (index !== -1) {
      setCurrentChunkIndex(index);
      document.getElementById(`thought-unit-${index}`)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <main className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Thought-Unit Reader</h1>
        <Button onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </Button>
      </div>

      <div className="flex">
        <div ref={pdfContainerRef} className="w-1/2 border p-2 overflow-auto" style={{ transform: `scale(${pdfScale}) translate(${pdfPosition.x}px, ${pdfPosition.y}px)` }}>
          {pdfFile && (
            <Document
              file={pdfFile}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              {Array.from(new Array(numPages), (_, index) => (
                <Page key={`page_${index + 1}`} pageNumber={index + 1} />
              ))}
            </Document>
          )}
        </div>

        <div className="w-1/2 pl-4">
          {thoughtUnits.map((unit, i) => (
            <div key={i} id={`thought-unit-${i}`} className={`mb-2 p-2 rounded ${i === currentChunkIndex ? 'bg-yellow-100' : ''}`}>
              {unit}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}