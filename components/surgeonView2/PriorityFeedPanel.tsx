// components/surgeonView2/PriorityFeedPanel.tsx
// Priority Feed: Ranked insights sorted by importance score

import React from 'react';
import type {
  RankedInsight,
  ImportanceBucket,
  InsightType,
} from '@/lib/relationshipSchema/types';
import { sanitizeRenderText } from '@/lib/page-intelligence/outputSanitizer';

// ============================================================================
// Types
// ============================================================================

interface PriorityFeedPanelProps {
  insights: RankedInsight[];
  selectedInsightId?: string;
  onInsightClick: (insight: RankedInsight) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onMarkMastered?: (insight: RankedInsight) => void;
  onExplainOnWhiteboard?: (insight: RankedInsight) => void;
  onReadThisCard?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

const BUCKET_STYLES: Record<ImportanceBucket, { bg: string; border: string; badge: string; label: string }> = {
  CRITICAL: {
    bg: 'bg-red-900/30',
    border: 'border-red-500',
    badge: 'bg-red-600 text-white',
    label: 'CRITICAL',
  },
  HIGH_YIELD: {
    bg: 'bg-amber-900/30',
    border: 'border-amber-500',
    badge: 'bg-amber-600 text-white',
    label: 'HIGH-YIELD',
  },
  IMPORTANT: {
    bg: 'bg-blue-900/30',
    border: 'border-blue-500',
    badge: 'bg-blue-600 text-white',
    label: 'IMPORTANT',
  },
  CONTEXT: {
    bg: 'bg-gray-800/50',
    border: 'border-gray-600',
    badge: 'bg-gray-600 text-gray-200',
    label: 'CONTEXT',
  },
};

const TYPE_ICONS: Record<InsightType, string> = {
  DIAGNOSTIC_SIGNAL: '🔍',
  HIGH_YIELD_ASSOCIATION: '⚡',
  RED_FLAG: '🚨',
  CLINICAL_PEARL: '💎',
  EXAM_TRAP: '⚠️',
  DECISION_RULE: '🔀',
  DIFFERENTIAL: '⚖️',
};

// ============================================================================
// Main Component
// ============================================================================

export const PriorityFeedPanel: React.FC<PriorityFeedPanelProps> = ({
  insights,
  selectedInsightId,
  onInsightClick,
  onSaveToNoteLab,
  onMarkConfusing,
  onMarkMastered,
  onExplainOnWhiteboard,
  onReadThisCard,
  onJumpToPage,
}) => {
  // Show minimal prompt when no content - not a developer error state
  if (insights.length === 0) {
    return (
      <div className="p-4 h-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Priority Feed
          </h2>
        </div>
        <p className="text-xs text-gray-500 italic">
          Extract a page to see ranked insights.
        </p>
      </div>
    );
  }

  // Group by bucket for visual hierarchy
  const buckets: ImportanceBucket[] = ['CRITICAL', 'HIGH_YIELD', 'IMPORTANT', 'CONTEXT'];
  const groupedInsights = buckets.map(bucket => ({
    bucket,
    insights: insights.filter(i => i.bucket === bucket),
  })).filter(g => g.insights.length > 0);

  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Priority Feed
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {insights.length} insight{insights.length !== 1 ? 's' : ''} ranked by importance
          </p>
        </div>
      </div>

      {/* Bucket Groups */}
      <div className="space-y-6">
        {groupedInsights.map(({ bucket, insights: bucketInsights }) => (
          <div key={bucket}>
            {/* Bucket Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${BUCKET_STYLES[bucket].badge}`}>
                {BUCKET_STYLES[bucket].label}
              </span>
              <span className="text-xs text-gray-500">
                {bucketInsights.length} item{bucketInsights.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Insight Cards */}
            <div className="space-y-2">
              {bucketInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  isSelected={selectedInsightId === insight.id}
                  onClick={() => onInsightClick(insight)}
                  onSaveToNoteLab={onSaveToNoteLab}
                  onMarkConfusing={onMarkConfusing}
                  onMarkMastered={onMarkMastered}
                  onExplainOnWhiteboard={onExplainOnWhiteboard}
                  onReadThisCard={onReadThisCard}
                  onJumpToPage={onJumpToPage}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Insight Card
// ============================================================================

interface InsightCardProps {
  insight: RankedInsight;
  isSelected: boolean;
  onClick: () => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onMarkMastered?: (insight: RankedInsight) => void;
  onExplainOnWhiteboard?: (insight: RankedInsight) => void;
  onReadThisCard?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  isSelected,
  onClick,
  onSaveToNoteLab,
  onMarkConfusing,
  onMarkMastered,
  onExplainOnWhiteboard,
  onReadThisCard,
  onJumpToPage,
}) => {
  const style = BUCKET_STYLES[insight.bucket];
  const icon = TYPE_ICONS[insight.type];
  const page = insight.evidence[0]?.page;
  const title = sanitizeRenderText(insight.title);
  const claim = sanitizeRenderText(insight.claim);
  const whyItMatters = sanitizeRenderText(insight.whyItMatters);
  const keyCue = sanitizeRenderText(insight.keyCue);
  const trap = sanitizeRenderText(insight.trap);

  return (
    <div
      className={`
        p-3 rounded-lg cursor-pointer transition-all border
        ${isSelected ? `${style.bg} ${style.border}` : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'}
      `}
      onClick={onClick}
    >
      {/* Header Row: Type Icon + Title + Score */}
      <div className="flex items-start gap-2">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{insight.type.replace(/_/g, ' ')}</p>
        </div>
        <ScoreBadge score={insight.score} bucket={insight.bucket} />
      </div>

      {/* Claim */}
      <p className="text-sm text-gray-200 mt-2 line-clamp-2">{claim}</p>

      {/* Why It Matters */}
      <p className="text-xs text-gray-400 mt-2 italic">{whyItMatters}</p>

      {/* Key Cue / Trap (if present) */}
      {keyCue && (
        <div className="mt-2 px-2 py-1 bg-teal-900/30 rounded text-xs text-teal-300">
          <span className="font-semibold">Key Cue:</span> {keyCue}
        </div>
      )}
      {trap && (
        <div className="mt-2 px-2 py-1 bg-red-900/30 rounded text-xs text-red-300">
          <span className="font-semibold">Trap:</span> {trap}
        </div>
      )}

      {/* DAT Apex Badge (if matched) */}
      {insight.apexBadge && (
        <ApexBadgeInline badge={insight.apexBadge} />
      )}

      {/* Footer: Page + Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-700">
        {/* Page Link */}
        {page !== undefined && onJumpToPage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(page);
            }}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            p.{page}
          </button>
        )}

        {/* Action Buttons */}
        <div className="flex-1 flex items-center justify-end gap-1">
          {onReadThisCard && (
            <ActionButton
              icon="🔊"
              title="Read This Card"
              onClick={(e) => {
                e.stopPropagation();
                onReadThisCard(insight);
              }}
            />
          )}
          {onExplainOnWhiteboard && (
            <ActionButton
              icon="📝"
              title="Explain on Whiteboard"
              onClick={(e) => {
                e.stopPropagation();
                onExplainOnWhiteboard(insight);
              }}
            />
          )}
          {onSaveToNoteLab && (
            <ActionButton
              icon="💾"
              title="Save to NoteLab"
              onClick={(e) => {
                e.stopPropagation();
                onSaveToNoteLab(insight);
              }}
            />
          )}
          {onMarkConfusing && (
            <ActionButton
              icon="❓"
              title="Mark Confusing"
              onClick={(e) => {
                e.stopPropagation();
                onMarkConfusing(insight);
              }}
            />
          )}
          {onMarkMastered && (
            <ActionButton
              icon="✅"
              title="Mark Mastered"
              onClick={(e) => {
                e.stopPropagation();
                onMarkMastered(insight);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

const ScoreBadge: React.FC<{ score: number; bucket: ImportanceBucket }> = ({ score, bucket }) => {
  const style = BUCKET_STYLES[bucket];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${style.badge}`}>
      {score}
    </span>
  );
};

const ActionButton: React.FC<{
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}> = ({ icon, title, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-1 text-sm hover:bg-gray-700 rounded transition-colors"
  >
    {icon}
  </button>
);

const ApexBadgeInline: React.FC<{
  badge: NonNullable<RankedInsight['apexBadge']>;
}> = ({ badge }) => (
  <div className="mt-2 p-2 bg-purple-900/30 border border-purple-700/50 rounded">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-sm">🎯</span>
      <span className="text-xs font-semibold text-purple-300">DAT Pattern: {badge.patternName}</span>
    </div>
    <div className="text-xs text-gray-300 space-y-1">
      <p><span className="text-purple-400">Tests:</span> {badge.whatTheyTest}</p>
      <p><span className="text-red-400">Trap:</span> {badge.commonTrap}</p>
      {badge.quickMnemonic && (
        <p><span className="text-teal-400">Mnemonic:</span> {badge.quickMnemonic}</p>
      )}
    </div>
  </div>
);

export default PriorityFeedPanel;
