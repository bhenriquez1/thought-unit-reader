// components/DebugStatusBar.tsx
// Debug Status Bar - Shows CourseContext state for development
// Shows: syllabus topics, current page, paragraphs extracted, insights, timestamp

"use client";

import React from 'react';
import { useCourseContextStore } from '@/lib/stores/courseContextStore';

interface DebugStatusBarProps {
  documentId?: string;
}

export default function DebugStatusBar({ documentId }: DebugStatusBarProps) {
  const courseContext = useCourseContextStore();
  const status = courseContext.getDebugStatus();

  // Only show if we have a document context
  if (!status.activeDocumentId && !documentId) {
    return null;
  }

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm text-[10px] text-gray-400 px-4 py-1.5 border-t border-gray-700 flex items-center gap-4 z-50 font-mono">
      <span className="text-gray-500">CourseContext:</span>

      <span className="flex items-center gap-1">
        <span className="text-purple-400">Topics:</span>
        <span className={status.syllabusTopicsCount > 0 ? 'text-green-400' : 'text-gray-500'}>
          {status.syllabusTopicsCount}
        </span>
      </span>

      <span className="text-gray-600">|</span>

      <span className="flex items-center gap-1">
        <span className="text-blue-400">Page:</span>
        <span className="text-white">{status.currentPage + 1}</span>
      </span>

      <span className="text-gray-600">|</span>

      <span className="flex items-center gap-1">
        <span className="text-yellow-400">Paragraphs:</span>
        <span className={status.paragraphsExtracted > 0 ? 'text-green-400' : 'text-gray-500'}>
          {status.paragraphsExtracted}
        </span>
      </span>

      <span className="text-gray-600">|</span>

      <span className="flex items-center gap-1">
        <span className="text-orange-400">Insights:</span>
        <span className={status.insightsGenerated > 0 ? 'text-green-400' : 'text-gray-500'}>
          {status.insightsGenerated}
        </span>
      </span>

      <span className="text-gray-600">|</span>

      <span className="flex items-center gap-1">
        <span className="text-teal-400">Cards:</span>
        <span className={status.cardsGenerated > 0 ? 'text-green-400' : 'text-gray-500'}>
          {status.cardsGenerated}
        </span>
      </span>

      <span className="text-gray-600">|</span>

      <span className="flex items-center gap-1">
        <span className="text-pink-400">Last:</span>
        <span className="text-gray-300">{formatTimestamp(status.lastRunTimestamp)}</span>
      </span>

      {/* Extraction status indicator */}
      {courseContext.isExtracting && (
        <>
          <span className="text-gray-600">|</span>
          <span className="flex items-center gap-1 animate-pulse">
            <span className="text-yellow-400">Extracting...</span>
          </span>
        </>
      )}

      {/* Error indicator */}
      {courseContext.extractionError && (
        <>
          <span className="text-gray-600">|</span>
          <span className="flex items-center gap-1">
            <span className="text-red-400">Error: {courseContext.extractionError}</span>
          </span>
        </>
      )}
    </div>
  );
}
