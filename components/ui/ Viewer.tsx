"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Set the workerSrc for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface ViewerProps {
  fileUrl: string;
}

export default function Viewer({ fileUrl }: ViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleChangePage = (offset: number) => {
    setPageNumber((prev) => Math.min(Math.max(prev + offset, 1), numPages));
  };

  const handleJumpToPage = () => {
    const val = parseInt(inputRef.current?.value || "1", 10);
    if (!isNaN(val)) setPageNumber(Math.min(Math.max(val, 1), numPages));
  };

  return (
    <div className="flex flex-col w-full items-center p-4">
      <div className="flex items-center justify-between gap-4 mb-4 w-full">
        <div className="flex items-center gap-2">
          <Button onClick={() => handleChangePage(-1)} disabled={pageNumber <= 1}>
            Prev
          </Button>
          <Button onClick={() => handleChangePage(1)} disabled={pageNumber >= numPages}>
            Next
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="number"
            placeholder="Go to page..."
            min={1}
            max={numPages}
            className="w-24"
          />
          <Button onClick={handleJumpToPage}>Go</Button>
        </div>
        <p className="text-gray-600">
          Page {pageNumber} of {numPages}
        </p>
      </div>

      <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} className="border shadow rounded">
        <Page pageNumber={pageNumber} scale={1.5} className="mx-auto" />
      </Document>
    </div>
  );
}
