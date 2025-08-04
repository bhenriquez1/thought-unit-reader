import React, { useRef, useEffect } from 'react';

interface SmartPDFViewerProps {
  fileUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void; // ✅ New prop
}

export default function SmartPDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect
}: SmartPDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = (e: MouseEvent) => {
    if (!containerRef.current?.contains(e.target as Node)) return; // only inside PDF viewer
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="pdf-viewer-container bg-gray-900 rounded-lg overflow-hidden">
      {/* PDF.js or @react-pdf-viewer/core rendering here */}
      <p className="text-gray-500 text-center p-4">
        PDF Viewer Placeholder (Page {currentPage})
      </p>
    </div>
  );
}