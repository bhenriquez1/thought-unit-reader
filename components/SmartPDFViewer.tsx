import React, { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// ✅ PDF.js worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface SmartPDFViewerProps {
  fileUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void;
}

export default function SmartPDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect,
}: SmartPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState(scale);
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [showToolbar, setShowToolbar] = useState(true);
  const viewerRef = useRef<HTMLDivElement>(null);

  const logDebug = (message: string, data?: any) => {
    console.log(`🛠 [SmartPDFViewer] ${message}`, data || "");
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    logDebug("PDF Loaded", { numPages });
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z + 0.25, 3));
    logDebug("Zoom In");
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z - 0.25, 0.5));
    logDebug("Zoom Out");
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
      setPageInput(String(currentPage - 1));
      logDebug("Previous Page");
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      onPageChange(currentPage + 1);
      setPageInput(String(currentPage + 1));
      logDebug("Next Page");
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      onPageChange(pageNum);
      logDebug("Jump to Page", pageNum);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
      logDebug("Text Selected", selection);
    }
  };

  return (
    <div
      className="relative h-full w-full bg-gray-900"
      ref={viewerRef}
      onMouseUp={handleMouseUp}
    >
      {showToolbar && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white rounded-lg px-3 py-2 flex gap-2 items-center shadow-lg z-50">
          <button onClick={handleZoomOut} className="hover:text-yellow-400">
            ➖
          </button>
          <button onClick={handleZoomIn} className="hover:text-yellow-400">
            ➕
          </button>
          <button onClick={handlePrevPage} disabled={currentPage <= 1}>
            ◀
          </button>
          <form onSubmit={handlePageInputSubmit} className="flex items-center">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-10 text-center text-black rounded"
            />
            <span className="ml-1 text-sm">/ {numPages}</span>
          </form>
          <button onClick={handleNextPage} disabled={currentPage >= numPages}>
            ▶
          </button>
          <button
            onClick={() => setShowToolbar(false)}
            className="ml-2 text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {!showToolbar && (
        <button
          onClick={() => setShowToolbar(true)}
          className="absolute top-4 right-4 bg-yellow-500 text-black px-2 py-1 rounded-lg shadow-lg z-50"
        >
          ⚙
        </button>
      )}

      <div className="flex justify-center items-start h-full overflow-auto p-4 transition-all duration-300">
        {fileUrl ? (
          <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page
              pageNumber={currentPage}
              scale={zoom}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        ) : (
          <p className="text-gray-400">📂 No PDF loaded.</p>
        )}
      </div>
    </div>
  );
}