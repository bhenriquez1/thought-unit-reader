// components/surgeonView2/SmartExtractControl.tsx
// Unified extraction control UI for Expert View - scope-aware (page vs chapter)

import React from 'react';

export type ExtractScope = 'page' | 'chapter';

interface SmartExtractControlProps {
  scope: ExtractScope;
  onScopeChange: (scope: ExtractScope) => void;
  onExtract: () => void;
  autoExtract: boolean;
  onAutoExtractChange: (auto: boolean) => void;
  isExtracting: boolean;
  chapterAvailable: boolean;
  currentPage: number;
  ocrEnabled: boolean;
  onOcrToggle: () => void;
  extractionStatus?: string;
}

export const SmartExtractControl: React.FC<SmartExtractControlProps> = ({
  scope,
  onScopeChange,
  onExtract,
  autoExtract,
  onAutoExtractChange,
  isExtracting,
  chapterAvailable,
  currentPage,
  ocrEnabled,
  onOcrToggle,
  extractionStatus,
}) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 bg-gray-800/60 flex-wrap">
      {/* Scope Toggle */}
      <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
        <button
          onClick={() => onScopeChange('page')}
          className={`px-2.5 py-1 ${
            scope === 'page'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          Page {currentPage}
        </button>
        <button
          onClick={() => onScopeChange('chapter')}
          disabled={!chapterAvailable}
          title={!chapterAvailable ? 'No chapter range available' : 'Extract entire chapter'}
          className={`px-2.5 py-1 ${
            scope === 'chapter'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Chapter
        </button>
      </div>

      {/* Extract Button */}
      <button
        onClick={onExtract}
        disabled={isExtracting}
        className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExtracting ? 'Extracting…' : 'Extract'}
      </button>

      {/* OCR Toggle */}
      <button
        onClick={onOcrToggle}
        className={`px-2 py-1 text-xs rounded border ${
          ocrEnabled
            ? 'border-blue-500 text-blue-400 bg-blue-900/20'
            : 'border-gray-600 text-gray-500 bg-gray-800'
        }`}
        title="Toggle OCR for scanned PDFs"
      >
        OCR
      </button>

      {/* Auto Extract */}
      <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={autoExtract}
          onChange={(e) => onAutoExtractChange(e.target.checked)}
          className="accent-teal-500"
        />
        Auto
      </label>

      {/* Status */}
      {extractionStatus && (
        <span className="text-xs text-gray-400 truncate max-w-[140px]">{extractionStatus}</span>
      )}
    </div>
  );
};

export default SmartExtractControl;
