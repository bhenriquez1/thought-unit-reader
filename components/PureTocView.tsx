"use client";

// components/PureTocView.tsx
// PURE TOC MODE - Only clickable TOC tree
// ❌ No Surgeon View, No PDRM, No NoteLab

import React from 'react';
import TocTreeSidebar, { convertLegacyTocToNodes, buildTocAnchors } from './TocTreeSidebar';
import SmartPDFViewer from './SmartPDFViewer';

interface PureTocViewProps {
  fileUrl: string | null;
  tableOfContents: Array<{ title?: string; text?: string; pageNumber?: number; page?: number; items?: any[] }>;
  currentPage: number;
  pdfPageCount: number;
  onJumpToPage: (page: number) => void;
  onPageCount: (count: number) => void;
}

export default function PureTocView({
  fileUrl,
  tableOfContents,
  currentPage,
  pdfPageCount,
  onJumpToPage,
  onPageCount
}: PureTocViewProps) {
  // Convert legacy TOC format
  const tocNodes = convertLegacyTocToNodes(tableOfContents);
  const tocAnchors = buildTocAnchors(tocNodes);
  
  // No file uploaded
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="pure-toc-empty">
        <div className="text-center">
          <div className="text-6xl mb-4">📑</div>
          <h2 className="text-2xl font-bold mb-2">Table of Contents</h2>
          <p className="text-gray-400">Upload a PDF to view its structure</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex bg-gray-900" data-testid="pure-toc-view">
      {/* TOC Sidebar - Primary focus */}
      <div className="w-96 min-w-80 border-r border-gray-700 flex flex-col">
        <TocTreeSidebar
          toc={tocNodes}
          tocAnchors={tocAnchors}
          warnings={[]}
          currentPage={currentPage}
          onJumpToPage={onJumpToPage}
        />
      </div>
      
      {/* PDF Preview */}
      <div className="flex-1 overflow-auto bg-gray-950">
        <SmartPDFViewer
          fileUrl={fileUrl}
          currentPage={currentPage}
          onPageChange={onJumpToPage}
          onPageCount={onPageCount}
        />
      </div>
    </div>
  );
}
