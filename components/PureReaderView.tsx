"use client";

// components/PureReaderView.tsx
// PURE READER MODE - PDF ONLY, no thought units, no annotations, no TOC
// ❌ No Surgeon View elements
// ❌ No TOC sidebar
// ❌ No NoteLab
// ❌ No Thought Units (those belong in Surgeon View)
// ✅ Uses global zoom store for shared zoom across views

import React, { useCallback } from 'react';
import SmartPDFViewer from './SmartPDFViewer';
import { useZoomStore } from '@/lib/stores/zoomStore';

interface PureReaderViewProps {
  fileUrl: string | null;
  currentPage: number;
  pdfPageCount: number;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onTextSelect?: (text: string) => void;
  fontSize?: number;
  fontFamily?: string;
}

export default function PureReaderView({
  fileUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  onPageCount,
  onTextSelect,
  fontSize = 16,
  fontFamily = 'Georgia'
}: PureReaderViewProps) {
  // Global zoom store
  const { zoom, zoomIn, zoomOut, resetZoom, getZoomPercent, canZoomIn, canZoomOut } = useZoomStore();
  
  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);
  
  const handleNextPage = useCallback(() => {
    if (currentPage < pdfPageCount) onPageChange(currentPage + 1);
  }, [currentPage, pdfPageCount, onPageChange]);
  
  // No file uploaded
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="pure-reader-empty">
        <div className="text-center max-w-lg">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-2xl font-bold mb-2">Pure Reader Mode</h2>
          <p className="text-gray-400 mb-6">Distraction-free PDF reading experience</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>• Clean PDF viewing without annotations</p>
            <p>• Use Surgeon View for highlighting & notes</p>
            <p>• Use TOC tab for navigation</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-reader-view">
      {/* Minimal Toolbar - Only essential reading controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Page Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
            data-testid="prev-page-btn"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-300 font-medium">
            Page {currentPage} of {pdfPageCount || '...'}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= pdfPageCount}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
            data-testid="next-page-btn"
          >
            Next →
          </button>
        </div>
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={!canZoomOut()}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm min-w-[60px]"
            title="Reset zoom"
          >
            {getZoomPercent()}%
          </button>
          <button
            onClick={zoomIn}
            disabled={!canZoomIn()}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            title="Zoom in"
          >
            +
          </button>
        </div>
        
        {/* Mode indicator */}
        <div className="text-xs text-gray-500">
          📖 Reader Mode
        </div>
      </div>
      
      {/* PDF Viewer - FULL WIDTH, no split */}
      <div className="flex-1 overflow-auto bg-gray-950">
        <SmartPDFViewer
          fileUrl={fileUrl}
          currentPage={currentPage}
          scale={zoom}
          onPageChange={onPageChange}
          onPageCount={onPageCount}
          onTextSelect={onTextSelect}
        />
      </div>
    </div>
  );
}
