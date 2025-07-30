"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { ChevronLeft, ChevronRight, Settings, ZoomIn, ZoomOut } from "lucide-react";
import HybridReader from "../components/HybridReader";
import Loader from "../components/ui/loader";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"hybrid" | "chapters" | "progressive" | "original">("hybrid");
  const [wpm, setWpm] = useState(110);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thoughtUnits, setThoughtUnits] = useState<string[][]>([]);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    setError(null);
    setLoading(true);

    try {
      setFile(uploaded);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        try {
          const result = await parseBookWithChapters(content);
          setInputText(content);
          setOutput(result.output || null);
          setThoughtUnits(result.parsedUnits || []);
        } catch (err) {
          console.error("Error parsing:", err);
        }
      };
      reader.readAsText(uploaded);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to load file.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStart = () => {
    if (!thoughtUnits.length) return;
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setCurrentWordIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= thoughtUnits.length) {
          clearInterval(intervalRef.current!);
          return prev;
        }
        return nextIndex;
      });
    }, 60000 / wpm);
  };

  const handleReset = () => {
    setIsPlaying(false);
    clearInterval(intervalRef.current!);
    setCurrentWordIndex(0);
  };

  const renderContent = () => {
    if (viewMode === "original") {
      return <pre className="whitespace-pre-wrap text-sm p-4">{inputText}</pre>;
    } else if (viewMode === "chapters") {
      return <pre className="whitespace-pre-wrap text-sm p-4">{output}</pre>;
    } else if (viewMode === "progressive") {
      return <div className="p-4">{generateProgressiveReadingHTML(inputText)}</div>;
    } else if (viewMode === "hybrid") {
      return (
        <div className="text-center mt-8">
          <h2 className="text-lg font-semibold text-gray-400 mb-2">
            Thought Unit {currentWordIndex + 1} of {thoughtUnits.length || 0}
          </h2>
          <div className="text-2xl font-bold text-yellow-300 bg-gray-900 px-6 py-4 rounded">
            {thoughtUnits[currentWordIndex]?.map((word, idx) => (
              <span
                key={idx}
                className={cn("mx-1 cursor-pointer", {
                  'text-yellow-400': idx === 0,
                  'text-white': idx !== 0
                })}
                onClick={() => {
                  if (!isPlaying) setCurrentWordIndex(idx);
                }}
              >
                {word}
              </span>
            ))}
          </div>
          <div className="flex justify-center mt-6 space-x-4">
            <Button onClick={() => setCurrentWordIndex((i) => Math.max(i - 1, 0))}><ChevronLeft /></Button>
            <Button onClick={() => setCurrentWordIndex((i) => Math.min(i + 1, thoughtUnits.length - 1))}><ChevronRight /></Button>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Word {thoughtUnits[currentWordIndex]?.length ? `1 of ${thoughtUnits[currentWordIndex].length}` : '1 of 0'}
          </p>
        </div>
      );
    }
  };

  return (
    <div className="flex min-h-screen bg-black text-white">
      <aside className="w-64 p-4 border-r border-gray-700">
        <h1 className="text-2xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300 mb-4">Read deeper, faster, and smarter.</p>
        <input
          type="file"
          accept=".txt,.pdf,.docx"
          onChange={handleFileUpload}
          ref={fileInputRef}
          className="mb-4"
        />
        <Label htmlFor="mode">Reading Mode</Label>
        <select
          id="mode"
          className="w-full mb-4 p-2 rounded bg-gray-900 text-white"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as any)}
        >
          <option value="original">Original</option>
          <option value="chapters">Chapters</option>
          <option value="progressive">Progressive</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <div className="space-y-2">
          <Button onClick={() => setEnabled((prev) => !prev)}>Toggle Light Mode</Button>
          <div className="flex gap-2">
            <Button onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
            <Button onClick={() => setScale((s) => Math.min(3, s + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
          </div>
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
            className="w-full p-1 bg-gray-800 text-white text-center rounded"
          />
        </div>
      </aside>
      <main className="flex-1 p-8">
        {error && <p className="text-red-500">{error}</p>}
        {loading && <Loader label="Processing document..." />}

        <div className="flex items-center space-x-4 mb-4">
          <Button onClick={handleStart} disabled={isPlaying}>▶ Start</Button>
          <Button onClick={handleReset}>⟳ Reset</Button>
          <Button variant="outline"><Settings className="w-4 h-4" /></Button>
          <span className="text-sm text-yellow-400">
            {thoughtUnits.length ? `${Math.floor((currentWordIndex / thoughtUnits.length) * 100)}% Complete` : '0% Complete'}
          </span>
          <span className="text-sm">{currentWordIndex + 1} Current</span>
          <span className="text-purple-400">{wpm} WPM</span>
        </div>

        <div className="mt-8 bg-white p-4 rounded">
          {file && (
            <Document
              file={file}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              className="mx-auto"
            >
              <Page pageNumber={pageNumber} scale={scale} />
            </Document>
          )}
        </div>

        <div className="mt-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}