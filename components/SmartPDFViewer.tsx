// components/SmartPDFViewer.tsx
import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface SmartPDFViewerProps {
  fileUrl: string;
  scale?: number;
  onWordClick?: (word: string) => void;
  showTextOverlay?: boolean;
  textContent?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function SmartPDFViewer({
  fileUrl,
  scale = 1.25,
  onWordClick,
  showTextOverlay = false,
  textContent = '',
  currentPage,
  onPageChange,
}: SmartPDFViewerProps) {
  return (
    <div className="w-full h-full overflow-auto bg-gray-900 flex justify-center items-start p-4">
      {fileUrl ? (
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => {
            if (currentPage > numPages) {
              onPageChange(1);
            }
          }}
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            renderTextLayer={showTextOverlay}
            renderAnnotationLayer={false}
          />
        </Document>
      ) : (
        <div className="text-gray-400 italic">No PDF loaded</div>
      )}

      {/* Optional Text Overlay */}
      {showTextOverlay && textContent && (
        <div className="absolute bottom-0 w-full bg-black bg-opacity-40 p-2 text-white text-sm overflow-y-auto max-h-32">
          {textContent.split(' ').map((word, index) => (
            <span
              key={index}
              className="cursor-pointer hover:bg-yellow-300 hover:text-black px-1 rounded"
              onClick={() => onWordClick && onWordClick(word)}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}