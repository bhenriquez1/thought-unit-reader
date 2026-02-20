// components/surgeonView2/SmartExtractControl.tsx
// Smart Extract Control - Unified extraction button with scope selector and auto-extract toggle

import React from 'react';

export type ExtractScope = 'page' | 'chapter';

interface SmartExtractControlProps {
  scope: ExtractScope;
  onScopeChange: (scope: ExtractScope) => void;
  onExtract: () => void;
  autoExtract: boolean;
  onAutoExtractChange: (enabled: boolean) => void;
  isExtracting: boolean;
  chapterAvailable: boolean;
  currentPage: number;
  ocrEnabled?: boolean;
  onOcrToggle?: () => void;
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
  ocrEnabled = false,
  onOcrToggle,
  extractionStatus,
}) => {
  const handleScopeChange = (newScope: ExtractScope) => {
    if (newScope === 'chapter' && !chapterAvailable) {
      // Show message but don't change scope
      return;
    }
    onScopeChange(newScope);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800/80 border-b border-gray-700">
      {/* Scope Dropdown + Extract Button */}
      <div className="flex items-center bg-gray-700 rounded-lg overflow-hidden shadow-sm">
        <select
          value={scope}
          onChange={(e) => handleScopeChange(e.target.value as ExtractScope)}
          className="px-3 py-2 bg-transparent text-gray-300 text-sm border-r border-gray-600 focus:outline-none cursor-pointer hover:bg-gray-600/50"
          title={!chapterAvailable && scope === 'page' ? 'Chapter extraction requires syllabus with page ranges' : ''}
        >
          <option value="page">Page {currentPage + 1}</option>
          <option value="chapter" disabled={!chapterAvailable}>
            Chapter {!chapterAvailable ? '(no range)' : ''}
          </option>
        </select>
        <button
          onClick={onExtract}
          disabled={isExtracting}
          className={`
            px-4 py-2 text-sm font-medium transition-all
            ${isExtracting
              ? 'bg-teal-700 text-teal-200 cursor-wait'
              : 'bg-teal-600 hover:bg-teal-500 text-white'
            }
          `}
        >
          {isExtracting ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-teal-300 border-t-transparent rounded-full animate-spin" />
              Extracting...
            </span>
          ) : (
            'Extract'
          )}
        </button>
      </div>

      {/* Auto-extract Toggle (Prominent) */}
      <label className="flex items-center gap-2 cursor-pointer group">
        <button
          onClick={() => onAutoExtractChange(!autoExtract)}
          className={`
            relative w-10 h-5 rounded-full transition-colors
            ${autoExtract ? 'bg-purple-500' : 'bg-gray-600'}
          `}
          role="switch"
          aria-checked={autoExtract}
        >
          <span
            className={`
              absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
              transition-transform duration-200
              ${autoExtract ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
        <span className={`text-xs transition-colors ${autoExtract ? 'text-purple-300' : 'text-gray-400 group-hover:text-gray-300'}`}>
          Auto
        </span>
      </label>

      {/* OCR Toggle */}
      {onOcrToggle && (
        <button
          onClick={onOcrToggle}
          className={`
            px-2 py-1 text-[10px] rounded transition-colors
            ${ocrEnabled
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }
          `}
          title="Enable OCR for scanned PDFs"
        >
          OCR {ocrEnabled ? 'ON' : 'OFF'}
        </button>
      )}

      {/* Status Message */}
      {extractionStatus && (
        <span className="text-xs text-gray-400 ml-auto truncate max-w-[200px]">
          {extractionStatus}
        </span>
      )}

      {/* Chapter Not Available Warning */}
      {scope === 'chapter' && !chapterAvailable && (
        <span className="text-xs text-amber-400 ml-2">
          No chapter range - will extract current page
        </span>
      )}
    </div>
  );
};

export default SmartExtractControl;
