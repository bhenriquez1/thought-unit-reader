"use client";

// components/PDFViewer.tsx
import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Loader from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { configurePdfWorker } from "@/lib/pdf-worker-config";

// Dynamically import react-pdf components with proper type handling
const Document = dynamic<any>(
  () => import("react-pdf").then(mod => mod.Document),
  { ssr: false }
);

const Page = dynamic<any>(
  () => import("react-pdf").then(mod => mod.Page),
  { ssr: false }
);

export interface PDFViewerProps {
  fileUrl: string;
  initialScale?: number;
  showControls?: boolean;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ 
  fileUrl, 
  initialScale = 1.0, 
  showControls = true 
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(initialScale);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Configure PDF.js worker on component mount
  useEffect(() => {
    configurePdfWorker().catch(err => {
      console.error("Failed to configure PDF worker:", err);
      setError("Failed to initialize PDF viewer");
    });
  }, []);

  const onDocumentLoadSuccess = (pdf: { numPages: number }) => {
    if (pdf && typeof pdf.numPages === 'number') {
      setNumPages(pdf.numPages);
      setLoading(false);
    } else {
      console.error("Invalid PDF document structure:", pdf);
      setError("Invalid PDF document");
      setLoading(false);
    }
  };

  const onDocumentLoadError = (err: Error) => {
    console.error("Error loading PDF:", err);
    setError(`Failed to load PDF: ${err.message}`);
    setLoading(false);
  };

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPageNumber = prevPageNumber + offset;
      return Math.min(Math.max(1, newPageNumber), numPages || 1);
    });
  };

  const changeScale = (delta: number) => {
    setScale(prevScale => {
      const newScale = prevScale + delta;
      return Math.min(Math.max(0.5, newScale), 3.0);
    });
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('page') as HTMLInputElement;
    if (!input || !input.value) return;
    
    const pageNum = parseInt(input.value, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      setPageNumber(pageNum);
    }
    input.value = '';
  };

  return (
    <div className="flex flex-col items-center">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 w-full">
          {error}
        </div>
      )}
      
      {showControls && (
        <div className="flex flex-wrap gap-2 mb-4 w-full justify-center">
          <Button 
            onClick={() => changePage(-1)} 
            disabled={pageNumber <= 1}
            variant="outline"
            size="sm"
          >
            ◀ Previous
          </Button>
          
          <span className="px-3 py-2 text-sm">
            Page {pageNumber} of {numPages || '?'}
          </span>
          
          <Button 
            onClick={() => changePage(1)} 
            disabled={pageNumber >= numPages}
            variant="outline"
            size="sm"
          >
            Next ▶
          </Button>
          
          <Button 
            onClick={() => changeScale(-0.25)} 
            variant="outline"
            size="sm"
          >
            🔍-
          </Button>
          
          <span className="px-3 py-2 text-sm">
            {Math.round(scale * 100)}%
          </span>
          
          <Button 
            onClick={() => changeScale(0.25)} 
            variant="outline"
            size="sm"
          >
            🔍+
          </Button>
        </div>
      )}
      
      <div className="border rounded overflow-hidden bg-white">
        {fileUrl ? (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="flex justify-center items-center h-[400px]"><Loader label="Loading PDF..." /></div>}
            error={<div className="p-4 text-red-500">Failed to load PDF document</div>}
          >
            {loading ? (
              <div className="flex justify-center items-center h-[400px]">
                <Loader label="Loading PDF..." />
              </div>
            ) : (
              <Page 
                pageNumber={pageNumber} 
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                error={<div className="p-4 text-red-500">Failed to render page</div>}
              />
            )}
          </Document>
        ) : (
          <div className="p-4 text-gray-500">No PDF file provided</div>
        )}
      </div>
      
      {showControls && numPages > 0 && (
        <div className="mt-4">
          <form 
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2"
          >
            <input
              type="number"
              name="page"
              min={1}
              max={numPages}
              placeholder="Go to page"
              className="w-24 px-2 py-1 border rounded text-sm"
            />
            <Button type="submit" size="sm" variant="secondary">Go</Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;