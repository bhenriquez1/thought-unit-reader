// components/surgeonView2/PriorityWorkspacePanel.tsx
// Priority Workspace Panel - Unified grouped insights display for Expert View

import React, { useState, useMemo } from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';
import type { PageIntelligence } from '@/lib/page-intelligence/types';
import type { InsightsResult, ReasoningFlow } from '@/lib/engines';
import { UnifiedInsightCard } from './UnifiedInsightCard';

// ============================================================================
// Types
// ============================================================================

type InsightCategory = 'high_yield' | 'mechanism' | 'trap' | 'threshold' | 'clinical';

interface CategoryConfig {
  icon: string;
  label: string;
  description: string;
  color: string;
  defaultExpanded: boolean;
}

interface PriorityWorkspacePanelProps {
  insights: RankedInsight[];
  pageIntelligence?: PageIntelligence | null;
  pageInsights?: InsightsResult | null;
  pageReasoning?: ReasoningFlow | null;
  selectedCardId?: string;
  onJumpToPage: (page: number) => void;
  onExplain: (insight: RankedInsight) => void;
  onMakeCard: (insight: RankedInsight) => void;
  onSendToNoteLab: (insight: RankedInsight) => void;
  isExtracting?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_CONFIG: Record<InsightCategory, CategoryConfig> = {
  high_yield: {
    icon: '🔥',
    label: 'High-Yield Statements',
    description: 'Core concepts and definitions',
    color: 'amber',
    defaultExpanded: true,
  },
  mechanism: {
    icon: '🧠',
    label: 'Key Mechanisms',
    description: 'Pathways and causal chains',
    color: 'blue',
    defaultExpanded: true,
  },
  trap: {
    icon: '⚠️',
    label: 'DAT Traps',
    description: 'Common confusions and pitfalls',
    color: 'red',
    defaultExpanded: true,
  },
  threshold: {
    icon: '📊',
    label: 'Numbers & Thresholds',
    description: 'Critical values and cutoffs',
    color: 'purple',
    defaultExpanded: false,
  },
  clinical: {
    icon: '🧬',
    label: 'Clinical Relevance',
    description: 'Why this matters in practice',
    color: 'green',
    defaultExpanded: false,
  },
};

const CATEGORY_ORDER: InsightCategory[] = ['high_yield', 'trap', 'mechanism', 'clinical', 'threshold'];

// ============================================================================
// Helpers
// ============================================================================

function determineCategory(insight: RankedInsight): InsightCategory {
  const tags = insight.tags.map(t => t.toLowerCase());
  const type = insight.type.toLowerCase();
  const claim = (insight.claim || '').toLowerCase();

  // Check for trap indicators
  if (insight.trap || tags.some(t => t.includes('trap') || t.includes('confusion') || t.includes('pitfall'))) {
    return 'trap';
  }

  // Check for mechanism indicators
  if (type.includes('mechanism') || type.includes('causal') ||
      tags.some(t => t.includes('pathway') || t.includes('mechanism')) ||
      claim.includes('leads to') || claim.includes('causes') || claim.includes('results in')) {
    return 'mechanism';
  }

  // Check for clinical relevance
  if (type.includes('clinical') || tags.some(t =>
    t.includes('clinical') || t.includes('treatment') || t.includes('diagnosis') || t.includes('management')
  )) {
    return 'clinical';
  }

  // Check for thresholds/numbers
  if (type.includes('threshold') || tags.some(t => t.includes('threshold') || t.includes('cutoff')) ||
      /\d+\s*(mg|ml|%|mm|cm|g\/dl)/i.test(claim)) {
    return 'threshold';
  }

  // Default to high yield for CRITICAL/HIGH_YIELD buckets
  return 'high_yield';
}

function categorizeInsights(insights: RankedInsight[]): Map<InsightCategory, RankedInsight[]> {
  const categories = new Map<InsightCategory, RankedInsight[]>();

  // Initialize all categories
  for (const cat of CATEGORY_ORDER) {
    categories.set(cat, []);
  }

  // Categorize each insight
  for (const insight of insights) {
    const category = determineCategory(insight);
    categories.get(category)?.push(insight);
  }

  // Sort within each category by score
  for (const [cat, items] of categories) {
    items.sort((a, b) => b.score - a.score);
  }

  return categories;
}

// ============================================================================
// Component
// ============================================================================

export const PriorityWorkspacePanel: React.FC<PriorityWorkspacePanelProps> = ({
  insights,
  pageIntelligence,
  pageInsights,
  pageReasoning,
  selectedCardId,
  onJumpToPage,
  onExplain,
  onMakeCard,
  onSendToNoteLab,
  isExtracting = false,
}) => {
  // Track expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<InsightCategory>>(() => {
    const initial = new Set<InsightCategory>();
    for (const [cat, config] of Object.entries(CATEGORY_CONFIG)) {
      if (config.defaultExpanded) {
        initial.add(cat as InsightCategory);
      }
    }
    return initial;
  });

  // Categorize insights
  const categorizedInsights = useMemo(() => {
    return categorizeInsights(insights);
  }, [insights]);

  // Get active categories (non-empty)
  const activeCategories = useMemo(() => {
    return CATEGORY_ORDER.filter(cat => {
      const items = categorizedInsights.get(cat);
      return items && items.length > 0;
    });
  }, [categorizedInsights]);

  // Total count
  const totalItems = insights.length;

  // Toggle category expansion
  const toggleCategory = (category: InsightCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Loading state
  if (isExtracting) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Extracting Page Intelligence
          </h3>
          <p className="text-xs text-gray-500">
            Analyzing content for high-yield insights...
          </p>
        </div>
      </div>
    );
  }

  // Empty state - prompt to extract
  if (totalItems === 0) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center">
        <div className="text-center max-w-[280px]">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="text-base font-medium text-gray-300 mb-2">
            What matters on this page
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Click <span className="text-teal-400 font-medium">Extract</span> to discover:
          </p>
          <ul className="text-xs text-gray-400 space-y-1.5 text-left">
            <li className="flex items-center gap-2">
              <span>🔥</span> High-yield statements
            </li>
            <li className="flex items-center gap-2">
              <span>🧠</span> Key mechanisms
            </li>
            <li className="flex items-center gap-2">
              <span>⚠️</span> DAT traps & confusions
            </li>
            <li className="flex items-center gap-2">
              <span>🧬</span> Clinical relevance
            </li>
          </ul>
          <p className="text-[10px] text-gray-600 mt-4">
            Or toggle <span className="text-purple-400">Auto</span> to extract on every page
          </p>
        </div>
      </div>
    );
  }

  // Content view
  return (
    <div className="p-3 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700/50">
        <h2 className="text-sm font-semibold text-gray-300">
          What matters on this page
        </h2>
        <span className="text-xs text-gray-500">
          {totalItems} insights
        </span>
      </div>

      {/* Category Sections */}
      <div className="space-y-4">
        {activeCategories.map(category => {
          const config = CATEGORY_CONFIG[category];
          const items = categorizedInsights.get(category) || [];
          const isExpanded = expandedCategories.has(category);

          return (
            <section key={category}>
              {/* Category Header (clickable to expand/collapse) */}
              <button
                onClick={() => toggleCategory(category)}
                className="flex items-center gap-2 w-full py-2 text-left hover:bg-gray-800/30 rounded transition-colors"
              >
                <span className="text-base">{config.icon}</span>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                  {config.label}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-400 rounded">
                  {items.length}
                </span>
                <span className="ml-auto text-gray-500 text-xs">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </button>

              {/* Items (collapsible) */}
              {isExpanded && (
                <div className="space-y-2 mt-2 pl-6">
                  {items.slice(0, 12).map(insight => (
                    <UnifiedInsightCard
                      key={insight.id}
                      insight={insight}
                      isSelected={selectedCardId === insight.id}
                      onJumpToAnchor={onJumpToPage}
                      onExplain={onExplain}
                      onMakeCard={onMakeCard}
                      onSendToNoteLab={onSendToNoteLab}
                    />
                  ))}

                  {/* Show more indicator */}
                  {items.length > 12 && (
                    <p className="text-[10px] text-gray-500 text-center py-1">
                      +{items.length - 12} more items
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Page Intelligence Summary (if available) */}
      {pageIntelligence && (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <div className="text-[10px] text-gray-500 flex items-center gap-3">
            <span>Source: {pageIntelligence.source === 'ocr' ? 'OCR' : 'Native'}</span>
            {pageIntelligence.confidence !== undefined && (
              <span>Confidence: {Math.round((pageIntelligence.confidence || 0) * 100)}%</span>
            )}
            <span>{pageIntelligence.segments?.length || 0} paragraphs</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriorityWorkspacePanel;
