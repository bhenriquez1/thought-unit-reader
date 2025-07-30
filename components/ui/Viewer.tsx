"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewerProps = {
  fileUrl: string;
};

export default function Viewer({ fileUrl }: ViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.3);

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const nextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));
  const prevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const zoomIn = () => setScale((prev) => prev + 0.2);
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-zinc-900 rounded shadow-md">
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={prevPage} disabled={pageNumber <= 1}>
          ← Prev
        </Button>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Page {pageNumber} of {numPages}
        </p>
        <Button onClick={nextPage} disabled={pageNumber >= numPages}>
          Next →
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Button onClick={zoomOut}>– Zoom</Button>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {Math.round(scale * 100)}%
        </span>
        <Button onClick={zoomIn}>+ Zoom</Button>
      </div>

      <div className="border rounded">
        <Document file={fileUrl} onLoadSuccess={handleDocumentLoadSuccess}>
          <Page pageNumber={pageNumber} scale={scale} />
        </Document>
      </div>
    </div>
  );
}