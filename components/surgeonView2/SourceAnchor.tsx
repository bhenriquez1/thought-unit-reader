// components/surgeonView2/SourceAnchor.tsx
// SourceAnchor — shows 1–2 line excerpt by default, expands full paragraph,
// highlights exact sentence, and provides "Jump to source" + Page badge.
// Used by PriorityComprehensionPanel, InsightsTab, ExplainTab, RelationsTab.

import React, { useState, useCallback } from 'react';
import type { SourceRef } from '@/lib/page-intelligence';

// ============================================================================
// Props
// ============================================================================

interface SourceAnchorProps {
  sourceRef: SourceRef;
  /** Full paragraph text for the "expand full quote" view */
  paragraphText?: string;
  /** Called when user clicks "Jump to source" */
  onJump?: (ref: SourceRef) => void;
  /** If true, shows the excerpt collapsed (default) */
  collapsed?: boolean;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const PREVIEW_CHARS = 160;

/** Truncate at sentence boundary, max maxChars. */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sub = text.slice(0, maxChars);
  const lastPeriod = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('! '), sub.lastIndexOf('? '));
  return lastPeriod > 40 ? sub.slice(0, lastPeriod + 1) + ' …' : sub + ' …';
}

/** Highlight the matched sentence within the full paragraph. */
function highlightSentence(
  fullText: string,
  quote: string,
  sentenceStart?: number,
  sentenceEnd?: number,
): React.ReactNode {
  // Prefer char offsets for precision
  if (sentenceStart !== undefined && sentenceEnd !== undefined) {
    const before = fullText.slice(0, sentenceStart);
    const highlighted = fullText.slice(sentenceStart, sentenceEnd);
    const after = fullText.slice(sentenceEnd);
    return (
      <>
        {before}
        <mark className="bg-teal-500/30 text-teal-100 rounded px-0.5">{highlighted}</mark>
        {after}
      </>
    );
  }

  // Fallback: fuzzy search for quote in fullText
  if (quote) {
    const idx = fullText.toLowerCase().indexOf(quote.toLowerCase().slice(0, 40));
    if (idx !== -1) {
      const end = idx + quote.length;
      return (
        <>
          {fullText.slice(0, idx)}
          <mark className="bg-teal-500/30 text-teal-100 rounded px-0.5">
            {fullText.slice(idx, end)}
          </mark>
          {fullText.slice(end)}
        </>
      );
    }
  }

  return <>{fullText}</>;
}

// ============================================================================
// Component
// ============================================================================

export const SourceAnchor: React.FC<SourceAnchorProps> = ({
  sourceRef,
  paragraphText,
  onJump,
  collapsed = true,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(!collapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleJump = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onJump?.(sourceRef);
    },
    [onJump, sourceRef],
  );

  const pageLabel = sourceRef.pageNumberLabel
    ? `p. ${sourceRef.pageNumberLabel}`
    : `p. ${sourceRef.pageIndex + 1}`;

  const previewText = sourceRef.quote
    ? truncateAtSentence(sourceRef.quote, PREVIEW_CHARS)
    : paragraphText
    ? truncateAtSentence(paragraphText, PREVIEW_CHARS)
    : '';

  const confidencePct = Math.round(sourceRef.confidence * 100);
  const locationMeta = [
    sourceRef.yPct !== undefined ? `y=${Math.round(sourceRef.yPct)}%` : null,
    sourceRef.column ? `col=${sourceRef.column}` : null,
    sourceRef.block ? `block=${sourceRef.block}` : null,
  ].filter(Boolean).join(' • ');

  const confidenceColor =
    confidencePct >= 80
      ? 'text-green-400'
      : confidencePct >= 50
      ? 'text-amber-400'
      : 'text-red-400';

  return (
    <div
      className={`rounded-md border border-gray-700/60 bg-gray-900/50 overflow-hidden ${className}`}
    >
      {/* Header row: page badge + confidence + jump */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-700/50">
        {/* Page badge */}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-800/50 border border-teal-700/50 text-teal-300 text-[10px] font-semibold select-none">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
            <path d="M2 2h8v8H2z" />
            <path d="M4 5h4M4 7h2" />
          </svg>
          {pageLabel}
        </span>

        {locationMeta && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-300 border border-gray-600/40 select-none">{locationMeta}</span>
        )}

        {/* Origin badge */}
        {sourceRef.textOrigin && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-400 border border-gray-600/40 select-none">
            {sourceRef.textOrigin === 'pdfText' ? 'PDF text' : 'OCR'}
          </span>
        )}

        {/* Confidence */}
        <span className={`text-[10px] ${confidenceColor} ml-auto select-none`}>
          {confidencePct}% match
        </span>

        {/* Jump button */}
        {onJump && (
          <button
            onClick={handleJump}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-700/40 hover:bg-teal-600/50 border border-teal-600/50 text-teal-200 text-[10px] font-medium transition-colors"
            title="Jump to source in PDF"
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
              <path d="M6 2v8M2 6l4-4 4 4" />
            </svg>
            Jump to source
          </button>
        )}
      </div>

      {/* Excerpt */}
      <div className="px-2.5 py-1.5">
        {!expanded ? (
          <p className="text-xs text-gray-300 leading-relaxed font-mono">
            "{previewText}"
          </p>
        ) : (
          <div className="text-xs text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
            "
            {paragraphText
              ? highlightSentence(
                  paragraphText,
                  sourceRef.quote,
                  sourceRef.sentenceStartChar,
                  sourceRef.sentenceEndChar,
                )
              : sourceRef.quote}
            "
          </div>
        )}
      </div>

      {/* Expand / collapse toggle */}
      {(paragraphText || (sourceRef.quote && sourceRef.quote.length > PREVIEW_CHARS)) && (
        <div className="border-t border-gray-700/50 flex">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="flex-1 px-2.5 py-1 text-[10px] text-teal-400 hover:text-teal-300 hover:bg-teal-900/20 text-left transition-colors"
          >
            {expanded ? '▲ Collapse' : '▼ Expand full quote'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }}
            className="px-2.5 py-1 text-[10px] text-indigo-300 hover:text-indigo-200 hover:bg-indigo-900/20 border-l border-gray-700/50 transition-colors"
          >
            Open drawer
          </button>
        </div>
      )}

      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setDrawerOpen(false)}>
          <div className="h-full w-full max-w-xl bg-gray-900 border-l border-gray-700 p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-100">Source Quote</h4>
              <button className="text-xs text-gray-400 hover:text-white" onClick={() => setDrawerOpen(false)}>Close</button>
            </div>
            <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{paragraphText || sourceRef.quote}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Compact inline badge variant (for table rows, etc.)
// ============================================================================

interface SourceBadgeProps {
  sourceRef: SourceRef;
  onJump?: (ref: SourceRef) => void;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ sourceRef, onJump }) => {
  const pageLabel = sourceRef.pageNumberLabel ?? String(sourceRef.pageIndex + 1);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onJump?.(sourceRef); }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-800/40 hover:bg-teal-700/50 border border-teal-700/40 text-teal-300 text-[10px] font-medium transition-colors"
      title={sourceRef.quote || 'Jump to source'}
    >
      p.{pageLabel} ↑
    </button>
  );
};

export default SourceAnchor;
