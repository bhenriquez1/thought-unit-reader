import React, { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface SmartPDFViewerProps {
  fileUrl: string;
  scale?: number;
  className?: string;
  onWordClick?: (word: string) => void;
  showTextOverlay?: boolean;
  textContent?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

const SmartPDFViewer: React.FC<SmartPDFViewerProps> = ({
  fileUrl,
  scale = 1.25,
  className = '',
  onWordClick,
  showTextOverlay = false,
  textContent = '',
  currentPage = 1,
  onPageChange,
}) => {
  const [zoom, setZoom] = useState(scale);
  const [showTOC, setShowTOC] = useState(false);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

  const pdfViewerUrl = fileUrl ? `${fileUrl}#zoom=${Math.round(zoom * 100)}&view=FitH` : '';

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* PDF Controls */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        {/* Table of Contents Toggle */}
        <button
          onClick={() => setShowTOC(prev => !prev)}
          className="bg-gray-800 bg-opacity-80 text-white px-3 py-2 rounded-lg hover:bg-opacity-90 transition-all flex items-center space-x-2"
        >
          <span>☰</span>
          <span className="hidden sm:inline">Contents</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2 bg-gray-800 bg-opacity-80 rounded-lg p-2">
          <button onClick={handleZoomOut} className="text-white hover:text-gray-300 p-1">
            <ZoomOut size={16} />
          </button>
          <span className="text-white text-sm min-w-[50px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={handleZoomIn} className="text-white hover:text-gray-300 p-1">
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* (Placeholder) TOC - consumer can overlay their own if needed */}
      {showTOC && (
        <div className="absolute top-0 left-0 w-80 h-full bg-gray-900 bg-opacity-95 z-30 overflow-y-auto">
          <div className="p-4">
            <div className="text-white font-semibold mb-4">Contents</div>
            <div className="text-sm text-gray-400">(Table of contents would be injected externally)</div>
            <button
              onClick={() => setShowTOC(false)}
              className="mt-4 text-xs text-gray-300 underline"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Text Overlay for Clickable Words */}
      {showTextOverlay && textContent && (
        <div className="absolute inset-0 z-10 bg-transparent pointer-events-none">
          <div
            className="absolute inset-0 p-8 text-transparent pointer-events-auto"
            style={{ fontSize: '14px', lineHeight: '1.6' }}
          >
            {textContent.split(' ').map((word, index) => (
              <span
                key={index}
                className="hover:bg-yellow-400 hover:bg-opacity-30 cursor-pointer pointer-events-auto"
                onClick={() => onWordClick?.(word)}
                style={{ userSelect: 'none' }}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* PDF iframe or fallback */}
      {fileUrl ? (
        <iframe
          src={pdfViewerUrl}
          className="w-full h-full border-0"
          style={{ minHeight: '70vh' }}
          title="PDF Document"
        />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-400">
          No PDF loaded
        </div>
      )}
    </div>
  );
};

export default SmartPDFViewer;