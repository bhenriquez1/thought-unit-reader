"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// Fix for pdfjs worker error
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewerProps = {
  fileUrl: string;
};

export default function Viewer({ fileUrl }: ViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  return (
    <div className="flex flex-col items-center w-full space-y-4">
      <ScrollArea className="h-[80vh] border rounded p-4 bg-white dark:bg-zinc-900 w-full max-w-4xl">
        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            width={600}
          />
        </Document>
      </ScrollArea>

      <div className="flex items-center gap-4">
        <Button onClick={goToPrevPage} disabled={pageNumber <= 1} variant="outline">
          Previous
        </Button>
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          Page {pageNumber} of {numPages}
        </span>
        <Button onClick={goToNextPage} disabled={pageNumber >= numPages} variant="outline">
          Next
        </Button>
      </div>
    </div>
  );
}