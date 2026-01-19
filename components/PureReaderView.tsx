"use client";

// components/PureReaderView.tsx
// PURE READER MODE - Only PDF + thought-unit view
// ❌ No TOC, No Surgeon View, No NoteLab panels

import React, { useState, useCallback } from 'react';
import SmartPDFViewer from './SmartPDFViewer';

interface PureReaderViewProps {
  fileUrl: string | null;
  currentPage: number;
  pdfPageCount: number;
  thoughtUnits: Array<{ text: string }>;
  currentThoughtUnit: number;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onTextSelect?: (text: string) => void;
  onThoughtUnitChange?: (index: number) => void;
  fontSize?: number;
  fontFamily?: string;
}

export default function PureReaderView({
  fileUrl,
  currentPage,
  pdfPageCount,
  thoughtUnits,
  currentThoughtUnit,
  onPageChange,
  onPageCount,
  onTextSelect,
  onThoughtUnitChange,
  fontSize = 16,
  fontFamily = 'sans-serif'
}: PureReaderViewProps) {
  // Local state for zoom
  const [zoom, setZoom] = useState(1);
  const [showThoughtUnits, setShowThoughtUnits] = useState(true);
  
  // Handlers
  const handleZoomIn = () => setZoom(z => Math.min(2, z + 0.1));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.1));
  const handleResetZoom = () => setZoom(1);
  
  const handleNextPage = () => {
    if (currentPage < pdfPageCount) {
      onPageChange(currentPage + 1);
    }
  };
  
  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };
  
  // No file uploaded
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="pure-reader-empty">
        <div className="text-center">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-2xl font-bold mb-2">Pure Reading Mode</h2>
          <p className="text-gray-400">Upload a PDF to start reading</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-reader-view">
      {/* Minimal Toolbar - Only essential controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            data-testid="prev-page-btn"
          >
            ←
          </button>
          <span className="text-sm text-gray-300">
            Page {currentPage} of {pdfPageCount}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= pdfPageCount}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            data-testid="next-page-btn"
          >
            →
          </button>
        </div>
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={handleResetZoom}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            title="Zoom in"
          >
            +
          </button>
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThoughtUnits(!showThoughtUnits)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              showThoughtUnits ? 'bg-yellow-600 text-black' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Toggle thought units panel"
          >
            {showThoughtUnits ? '📝 Text On' : '📝 Text Off'}
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className={`${showThoughtUnits ? 'w-1/2' : 'w-full'} overflow-auto bg-gray-950`}>
          <SmartPDFViewer
            fileUrl={fileUrl}
            currentPage={currentPage}
            onPageChange={onPageChange}
            onPageCount={onPageCount}
            onTextSelect={onTextSelect}
          />
        </div>
        
        {/* Thought Units Panel */}
        {showThoughtUnits && (
          <div className="w-1/2 border-l border-gray-700 overflow-auto bg-gray-900 p-4">
            <div className="space-y-4">
              {thoughtUnits.length > 0 ? (
                thoughtUnits.map((unit, idx) => {
                  const isCurrent = idx === currentThoughtUnit - 1;
                  return (
                    <div
                      key={idx}
                      onClick={() => onThoughtUnitChange?.(idx + 1)}
                      className={`p-4 rounded-lg cursor-pointer transition-all ${
                        isCurrent 
                          ? 'bg-yellow-900/30 border-2 border-yellow-500' 
                          : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                      }`}
                      style={{ fontSize: `${fontSize}px`, fontFamily }}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          isCurrent ? 'bg-yellow-600 text-black' : 'bg-gray-700 text-gray-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <p className="text-gray-200 leading-relaxed flex-1">
                          {unit.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No thought units detected</p>
                  <p className="text-sm mt-2">Processing document...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
