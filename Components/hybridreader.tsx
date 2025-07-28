"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateProgressiveReadingHTML } from "@/lib/parser";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

interface HybridReaderProps {
  file: File;
  originalText?: string;
  parsedChapters?: string[];
  viewMode: ViewMode;
}

export default function HybridReader({
  file,
  originalText,
  parsedChapters,
  viewMode,
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

  useEffect(() => {
    if (
      (viewMode === "progressive" || viewMode === "hybrid") &&
      originalText
    ) {
      const html = generateProgressiveReadingHTML(originalText);
      setHtmlContent(html);
    }
  }, [originalText, parsedChapters, viewMode]);

  return (
    <div className="flex flex-col lg:flex-row w-full h-full gap-4">
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
            className="w-28"
          />
          <Button onClick={handleZoom}>
            {zoomLevel === 1.0 ? "Zoom 150%" : "Reset Zoom"}
          </Button>
        </div>
        <div ref={canvasWrapperRef} style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}>
          <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} width={600} />
          </Document>
        </div>
      </div>

      <div className="w-full lg:w-1/2 h-full overflow-y-auto border rounded-xl p-4 bg-gray-100 dark:bg-zinc-800 shadow text-[17px] leading-7">
        {viewMode === "original" && (
          <pre className="whitespace-pre-wrap">{originalText}</pre>
        )}
        {viewMode === "chapters" && parsedChapters && (
          <div>
            {parsedChapters.map((chapter, idx) => (
              <div key={idx} className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Chapter {idx + 1}</h2>
                <p>{chapter}</p>
              </div>
            ))}
          </div>
        )}
        {viewMode === "progressive" && (
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        )}
        {viewMode === "hybrid" && (
          <div>
            <h2 className="text-lg font-bold mb-2">Chapter View</h2>
            {parsedChapters?.map((chapter, i) => (
              <details key={i} className="mb-4">
                <summary className="cursor-pointer text-blue-500 dark:text-blue-300 font-medium">Chapter {i + 1}</summary>
                <p className="mt-2">{chapter}</p>
              </details>
            ))}
            <hr className="my-6" />
            <h2 className="text-lg font-bold mb-2">Right Brain View</h2>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        )}
      </div>
    </div>
  );
}