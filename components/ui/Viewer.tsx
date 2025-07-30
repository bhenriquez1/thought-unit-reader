// components/ui/Viewer.tsx

"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

// PDF worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewerProps = {
  fileUrl: string;
};

export default function Viewer({ fileUrl }: ViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const goToPage = (direction: "next" | "prev") => {
    setPageNumber((prev) => {
      if (direction === "next" && numPages && prev < numPages) return prev + 1;
      if (direction === "prev" && prev > 1) return prev - 1;
      return prev;
    });
  };

  const zoom = (type: "in" | "out" | "reset") => {
    if (type === "in") setScale((prev) => Math.min(prev + 0.25, 3));
    else if (type === "out") setScale((prev) => Math.max(prev - 0.25, 0.5));
    else setScale(1.0);
  };

  useEffect(() => {
    setPageNumber(1); // Reset to first page when file changes
  }, [fileUrl]);

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center gap-2">
        <div className="space-x-2">
          <Button variant="outline" onClick={() => goToPage("prev")} disabled={pageNumber === 1}>
            Prev
          </Button>
          <Button variant="outline" onClick={() => goToPage("next")} disabled={pageNumber === numPages}>
            Next
          </Button>
        </div>
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          Page {pageNumber} of {numPages}
        </span>
        <div className="space-x-2">
          <Button variant="ghost" onClick={() => zoom("out")}>−</Button>
          <Button variant="ghost" onClick={() => zoom("reset")}>100%</Button>
          <Button variant="ghost" onClick={() => zoom("in")}>+</Button>
        </div>
      </div>

      <div className="flex justify-center border rounded shadow">
        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
          <Page pageNumber={pageNumber} scale={scale} />
        </Document>
      </div>
    </div>
  );
}