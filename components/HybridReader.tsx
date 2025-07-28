"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateProgressiveReadingHTML } from "@/lib/parser";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewMode = "original" | "chapters" | "progressive" | "hybrid" | "rightbrain";

interface HybridReaderProps {
  file: File;
  originalText?: string;
  parsedChapters?: string[];
  viewMode: ViewMode;
  chapters?: { title: string; page: number }[];
  currentPage?: number;
  onJumpToPage?: (page: number) => void;
}

export default function HybridReader({
  file,
  originalText,
  parsedChapters,
  viewMode,
  chapters,
  currentPage,
  onJumpToPage,
}: HybridReaderProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState("");

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleZoom = () => {
    setZoomLevel((prev) => (prev === 1.0 ? 1.5 : 1.0));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val > 0 && numPages && val <= numPages) {
      setPageNumber(val);
    }
  };

  const handleChapterClick = (idx: number) => {
    const chapterId = `chapter-${idx}`;
    const chapterEl = document.getElementById(chapterId);
    if (chapterEl) {
      chapterEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    if (
      (viewMode === "progressive" || viewMode === "hybrid" || viewMode === "rightbrain") &&
      originalText
    ) {
      const parsedUnits = originalText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const html = generateProgressiveReadingHTML(parsedUnits);
      setHtmlContent(html);
    }
  }, [originalText, parsedChapters, viewMode]);

  return (
    <div className="flex flex-col lg:flex-row w-full h-full gap-4">
      {/* Left Panel */}
      <div className="w-full lg:w-1/2 h-full overflow-auto border rounded-xl p-4 bg-white dark:bg-zinc-900 shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <Button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}>
              ← Prev
            </Button>
            <Button onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}>
              Next →
            </Button>
          </div>
          <Input
            type="number"
            min={1}
            max={numPages || 1}
            placeholder="Go to page"
            onChange={handlePageInput}
            className="w-28 text-black dark:text-white bg-white dark:bg-zinc-800"
          />
          <Button onClick={handleZoom}>
            {zoomLevel === 1.0 ? "Zoom 150%" : "Reset Zoom"}
          </Button>
        </div>

        <div
          ref={canvasWrapperRef}
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}
        >
          <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} width={600} />
          </Document>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 h-full overflow-y-auto border rounded-xl p-4 bg-gray-100 dark:bg-zinc-800 shadow text-[17px] leading-7 text-black dark:text-white">
        {viewMode === "original" && (
          <pre className="whitespace-pre-wrap">{originalText}</pre>
        )}

        {viewMode === "chapters" && parsedChapters && (
          <div>
            <div className="flex flex-col gap-2 mb-4">
              {parsedChapters.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChapterClick(idx)}
                  className="text-left text-blue-600 hover:underline dark:text-blue-400"
                >
                  Go to Chapter {idx + 1}
                </button>
              ))}
            </div>
            <hr className="my-2" />
            <div>
              {parsedChapters.map((chapter, idx) => (
                <div key={idx} id={`chapter-${idx}`} className="mb-6 scroll-mt-20">
                  <h2 className="text-lg font-semibold mb-2">Chapter {idx + 1}</h2>
                  <p>{chapter}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === "progressive" && (
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        )}

        {viewMode === "hybrid" && (
          <div>
            <h2 className="text-lg font-bold mb-2">Chapter View</h2>
            {parsedChapters?.map((chapter, i) => (
              <details key={i} className="mb-4" id={`chapter-${i}`}>
                <summary className="cursor-pointer text-blue-500 dark:text-blue-300 font-medium">
                  Chapter {i + 1}
                </summary>
                <p className="mt-2">{chapter}</p>
              </details>
            ))}
            <hr className="my-6" />
            <h2 className="text-lg font-bold mb-2">Right Brain View</h2>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        )}

        {viewMode === "rightbrain" && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-pink-600 dark:text-pink-400">
              Right Brain View (Coming Soon…)
            </h2>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        )}
      </div>
    </div>
  );
}