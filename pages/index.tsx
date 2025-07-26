// pages/index.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  // … all your existing state/hooks …

  // NEW: refs & state for ToC
  const [toc, setToc] = useState<{ title: string; chunkIndex: number }[]>([]);
  
  // AFTER parseBookWithChapters, build ToC
  const parseText = useCallback(() => {
    // … existing checks …
    setLoading(true);
    parseBookWithChapters(inputText, fileName || "Untitled").then(struct => {
      setBookStructure(struct);
      setViewMode("chapters");
      setLoading(false);

      // build a simple TOC from chapters
      setToc(struct.chapters.map(ch => ({
        title: ch.title,
        chunkIndex: ch.units[0].globalIndex
      })));
    });
  }, [inputText, fileName]);

  // NEW: pan container for PDF pages
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // NEW: handle word click sync
  const handleWordClick = (wordIdx: number) => {
    const unit = thoughtUnits[currentChunkIndex];
    const words = unit.split(" ");
    const before = words.slice(0, wordIdx).join(" ");
    const idxInText = inputText
      .toLowerCase()
      .indexOf(unit.toLowerCase());
    const wordStart = inputText
      .toLowerCase()
      .indexOf(words[wordIdx].toLowerCase(), idxInText + before.length);
    if (wordStart >= 0 && textAreaRef.current) {
      textAreaRef.current.focus();
      textAreaRef.current.setSelectionRange(
        wordStart,
        wordStart + words[wordIdx].length
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="sticky top-0 bg-white z-20 p-4 flex items-center justify-between border-b">
        <h1 className="text-2xl font-bold">Thought Unit Reader</h1>
        {/* Table of Contents */}
        {toc.length > 0 && (
          <nav className="space-x-2">
            {toc.map((entry, i) => (
              <button
                key={i}
                onClick={() => {
                  setCurrentChunkIndex(entry.chunkIndex);
                  setViewMode("original");
                }}
                className="text-sm px-2 py-1 border rounded hover:bg-gray-100"
              >
                {entry.title}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 p-4">
        {/* LEFT: PDF or text */}
        <div className="flex flex-col space-y-4">
          {fileType === "pdf" && pdfFile ? (
            <div
              ref={pdfContainerRef}
              className="flex-1 overflow-auto border rounded"
              style={{ touchAction: "pan-x pan-y" }} // enable pan
            >
              <Document
                file={pdfFile}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              >
                {Array.from({ length: numPages }).map((_, i) => (
                  <div
                    key={i}
                    className="relative mb-4"
                    style={{ transform: `scale(${pdfScale})`, transformOrigin: "0 0" }}
                  >
                    <Page pageNumber={i + 1} />
                    <button
                      onClick={() => handlePdfPageClick(i + 1)}
                      className="absolute top-2 right-2 text-xs bg-blue-500 text-white px-1 rounded"
                    >
                      ⬇️
                    </button>
                  </div>
                ))}
              </Document>
            </div>
          ) : (
            <textarea
              ref={textAreaRef}
              value={inputText}
              onChange={e => handleTextChange(e.target.value)}
              className="flex-1 w-full p-4 text-lg leading-relaxed border overflow-auto"
              style={{ fontSize: "1.125rem", lineHeight: 1.6 }}
            />
          )}

          {/* Zoom Controls */}
          {fileType === "pdf" && (
            <div className="flex space-x-2">
              <Button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}>➖</Button>
              <span>{Math.round(pdfScale * 100)}%</span>
              <Button onClick={() => setPdfScale(s => Math.min(3, s + 0.1))}>➕</Button>
            </div>
          )}
        </div>

        {/* RIGHT: Thought Units */}
        <div className="flex flex-col space-y-4">
          {viewMode === "hybrid" && thoughtUnits.length > 0 ? (
            <>
              <div className="flex flex-wrap space-x-2">
                <Button onClick={handlePlayPause}>{isPlaying ? "⏸️" : "▶️"}</Button>
                <Button onClick={handleReset}>🔄 Reset</Button>
                <Button onClick={() => setShowSettings(s => !s)}>⚙️</Button>
              </div>

              <div className="text-center text-xl">
                {currentWords.map((word, idx) => (
                  <span
                    key={idx}
                    onClick={() => handleWordClick(idx)}
                    className={`inline-block m-1 p-1 rounded cursor-pointer ${
                      idx === currentWordIndex
                        ? "bg-yellow-300 font-bold scale-110"
                        : ""
                    }`}
                  >
                    {word}
                  </span>
                ))}
              </div>

              {showSettings && (
                <div className="space-y-2">
                  <Label>WPM: {wpm}</Label>
                  <input
                    type="range"
                    min={100}
                    max={600}
                    value={wpm}
                    onChange={e => setWpm(+e.target.value)}
                  />
                </div>
              )}

              <div className="overflow-y-auto space-y-2">
                {renderUnitsByChapters()}
              </div>
            </>
          ) : (
            <div className="text-gray-500">Click “Create Thought Units” to get started.</div>
          )}
        </div>
      </div>
    </div>
  );
}