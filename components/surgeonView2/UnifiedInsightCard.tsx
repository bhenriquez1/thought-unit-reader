// components/surgeonView2/UnifiedInsightCard.tsx
// Unified Insight Card - Single card with confidence, anchor, and action buttons

import React from 'react';
import type { RankedInsight, EvidenceSpan } from '@/lib/relationshipSchema/types';
import { sanitizeRenderText } from '@/lib/page-intelligence/outputSanitizer';

interface UnifiedInsightCardProps {
  insight: RankedInsight;
  onJumpToAnchor: (page: number) => void;
  onExplain: (insight: RankedInsight) => void;
  onMakeCard: (insight: RankedInsight) => void;
  onSendToNoteLab: (insight: RankedInsight) => void;
  isSelected?: boolean;
}

// Format evidence anchor as "p30 ¶4"
function formatAnchor(evidence: EvidenceSpan[]): { label: string; page: number } | null {
  if (!evidence?.[0]) return null;
  const { page, sectionHint } = evidence[0];
  const para = sectionHint?.match(/¶(\d+)/)?.[1];
  return {
    label: `p${page + 1}${para ? ` ¶${para}` : ''}`,
    page,
  };
}

// Get confidence color based on percentage
function getConfidenceColor(confidence: number): string {
  const percent = Math.round(confidence * 100);
  if (percent >= 80) return 'text-green-400 bg-green-500/10';
  if (percent >= 60) return 'text-amber-400 bg-amber-500/10';
  return 'text-red-400 bg-red-500/10';
}

// Get bucket style
const BUCKET_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30' },
  HIGH_YIELD: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
  WORTH_KNOWING: { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-500/30' },
  CONTEXT: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export const UnifiedInsightCard: React.FC<UnifiedInsightCardProps> = ({
  insight,
  onJumpToAnchor,
  onExplain,
  onMakeCard,
  onSendToNoteLab,
  isSelected = false,
}) => {
  const anchor = formatAnchor(insight.evidence);
  const confidencePercent = Math.round(insight.confidence * 100);
  const bucketStyle = BUCKET_STYLES[insight.bucket] || BUCKET_STYLES.CONTEXT;
  const title = sanitizeRenderText(insight.title);
  const claim = sanitizeRenderText(insight.claim);
  const whyItMatters = sanitizeRenderText(insight.whyItMatters);
  const trap = sanitizeRenderText(insight.trap);

  return (
    <div
      className={`
        rounded-lg border p-3 transition-all
        ${isSelected
          ? 'bg-purple-500/10 border-purple-500/40'
          : `${bucketStyle.bg} ${bucketStyle.border} hover:border-gray-500`
        }
      `}
    >
      {/* Header: Title + Confidence + Anchor */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className={`text-sm font-medium ${bucketStyle.text} flex-1`}>
          {title}
        </h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Confidence Badge */}
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getConfidenceColor(insight.confidence)}`}>
            {confidencePercent}%
          </span>
          {/* Anchor Link */}
          {anchor && (
            <button
              onClick={() => onJumpToAnchor(anchor.page)}
              className="px-1.5 py-0.5 text-[10px] text-teal-400 hover:text-teal-300 bg-teal-500/10 rounded hover:bg-teal-500/20 transition-colors"
              title={`Jump to page ${anchor.page + 1}`}
            >
              {anchor.label}
            </button>
          )}
        </div>
      </div>

      {/* Claim/Body */}
      <p className="text-xs text-gray-300 mb-2 line-clamp-2">
        {claim}
      </p>

      {/* Why It Matters (if available) */}
      {whyItMatters && (
        <p className="text-[11px] text-gray-500 mb-2 italic line-clamp-1">
          {whyItMatters}
        </p>
      )}

      {/* Trap Warning (if available) */}
      {trap && (
        <div className="flex items-center gap-1 mb-2 px-2 py-1 bg-red-500/10 rounded text-[10px] text-red-300">
          <span>⚠️</span>
          <span className="line-clamp-1">{trap}</span>
        </div>
      )}

      {/* Tags */}
      {insight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {insight.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
          {insight.tags.length > 3 && (
            <span className="text-[9px] text-gray-500">+{insight.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-1 pt-2 border-t border-gray-700/50">
        <button
          onClick={() => onExplain(insight)}
          className="flex-1 px-2 py-1 text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
          title="Generate explanation"
        >
          Explain
        </button>
        <button
          onClick={() => onMakeCard(insight)}
          className="flex-1 px-2 py-1 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
          title="Create study card"
        >
          Make Card
        </button>
        <button
          onClick={() => onSendToNoteLab(insight)}
          className="flex-1 px-2 py-1 text-[10px] text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors"
          title="Send to NoteLab"
        >
          NoteLab
        </button>
      </div>
    </div>
  );
};

export default UnifiedInsightCard;
