import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Props {
  fileUrl: string;
}

export default function Viewer({ fileUrl }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
        <Page pageNumber={pageNumber} width={800} />
      </Document>

      {numPages && (
        <div className="mt-4 flex gap-4 items-center">
          <button
            className="bg-gray-200 px-3 py-1 rounded"
            onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
            disabled={pageNumber <= 1}
          >
            ⬅ Prev
          </button>
          <span>
            Page {pageNumber} of {numPages}
          </span>
          <button
            className="bg-gray-200 px-3 py-1 rounded"
            onClick={() =>
              setPageNumber((prev) =>
                numPages ? Math.min(prev + 1, numPages) : prev
              )
            }
            disabled={pageNumber >= (numPages ?? 1)}
          >
            Next ➡
          </button>
        </div>
      )}
    </div>
  );
}