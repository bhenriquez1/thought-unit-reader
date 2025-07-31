"use client";

import { Document, Page, pdfjs } from "react-pdf";
import { useEffect, useState } from "react";

// Required for PDF.js to function correctly
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface ViewerProps {
  file: File | string;
}

export default function Viewer({ file }: ViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);

  useEffect(() => {
    setPageNumber(1);
  }, [file]);

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className="w-full max-h-[80vh] overflow-y-auto border rounded">
      <Document file={file} onLoadSuccess={handleLoadSuccess}>
        {Array.from(new Array(numPages || 0), (el, index) => (
          <Page
            key={`page_${index + 1}`}
            pageNumber={index + 1}
            width={800}
            renderAnnotationLayer={false}
            renderTextLayer={true}
          />
        ))}
      </Document>
    </div>
  );
}