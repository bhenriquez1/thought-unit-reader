// components/surgeonView2/PriorityComprehensionPanel.tsx
// Priority Comprehension Panel - ONE intelligent panel that surfaces priority understanding
// Shows what matters without reading the entire page - clinical cognition engine

import React, { useMemo, useRef, useEffect } from 'react';
import type { RankedInsight, ImportanceBucket } from '@/lib/relationshipSchema/types';
import type { InsightsResult, PageExtractionResult } from '@/lib/engines/types';
import type { PageIntelligence } from '@/lib/page-intelligence';
import type { ReasoningFlow } from '@/lib/engines';

// ============================================================================
// Types
// ============================================================================

export type PriorityScore = 'MUST_KNOW' | 'HIGH_YIELD' | 'SUPPORTING';

interface PriorityItem {
  id: string;
  title: string;
  content: string;
  priority: PriorityScore;
  category: 'high_yield' | 'mechanism' | 'trap' | 'threshold' | 'clinical';
  evidence?: { page: number; text: string }[];
  tags?: string[];
}

interface PriorityComprehensionPanelProps {
  // Primary data sources
  rankedInsights: RankedInsight[];
  pageIntelligence?: PageIntelligence | null;
  pageInsights?: InsightsResult | null;
  pageReasoning?: ReasoningFlow | null;
  pageExtraction?: PageExtractionResult | null;

  // Actions
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;

  // Panel zoom & sync
  /** CSS font-size multiplier (e.g. 0.9, 1.0, 1.25). Applied via --insightScale variable. */
  insightScale?: number;
  /**
   * ID of the currently active insight item.
   * When syncEnabled is true, the panel scrolls this item into view (block: nearest).
   */
  activeItemId?: string | null;
  /** Whether sync-scroll is enabled. Default: true */
  syncEnabled?: boolean;
}

// ============================================================================
// Priority Score Styling
// ============================================================================

const PRIORITY_STYLES: Record<PriorityScore, { icon: string; bg: string; text: string; badge: string }> = {
  MUST_KNOW: {
    icon: '🔥',
    bg: 'bg-red-900/30',
    text: 'text-red-300',
    badge: 'bg-red-600 text-white',
  },
  HIGH_YIELD: {
    icon: '⭐',
    bg: 'bg-amber-900/30',
    text: 'text-amber-300',
    badge: 'bg-amber-600 text-white',
  },
  SUPPORTING: {
    icon: '○',
    bg: 'bg-gray-800/50',
    text: 'text-gray-300',
    badge: 'bg-gray-600 text-gray-200',
  },
};

const CATEGORY_HEADERS: Record<PriorityItem['category'], { icon: string; label: string; description: string }> = {
  high_yield: {
    icon: '🔥',
    label: 'High-Yield Statements',
    description: 'Core concepts, definitions, clinical implications',
  },
  mechanism: {
    icon: '🧠',
    label: 'Key Mechanisms',
    description: 'Pathways and causal chains',
  },
  trap: {
    icon: '⚠️',
    label: 'Exam Traps',
    description: 'Common confusions and pitfalls',
  },
  threshold: {
    icon: '📊',
    label: 'Numbers & Thresholds',
    description: 'Critical values and cutoffs',
  },
  clinical: {
    icon: '🧬',
    label: 'Clinical Relevance',
    description: 'Why this matters in practice',
  },
};

// ============================================================================
// Categorization Logic
// ============================================================================

function categorizePriorityItems(
  insights: RankedInsight[],
  pageIntelligence?: PageIntelligence | null,
  pageInsights?: InsightsResult | null,
  pageReasoning?: ReasoningFlow | null
): Map<PriorityItem['category'], PriorityItem[]> {
  const categories = new Map<PriorityItem['category'], PriorityItem[]>();

  // Initialize all categories
  categories.set('high_yield', []);
  categories.set('mechanism', []);
  categories.set('trap', []);
  categories.set('threshold', []);
  categories.set('clinical', []);

  // Process ranked insights
  for (const insight of insights) {
    const priority = bucketToPriority(insight.bucket);
    const category = determineCategory(insight);

    const item: PriorityItem = {
      id: insight.id,
      title: insight.title,
      content: insight.claim || insight.whyItMatters,
      priority,
      category,
      evidence: insight.evidence?.map(e => ({ page: e.page, text: e.text })),
      tags: insight.tags,
    };

    categories.get(category)?.push(item);
  }

  // Add Page Intelligence insights
  if (pageIntelligence?.insights) {
    for (const pi of pageIntelligence.insights) {
      // Determine priority from PI score
      const priority: PriorityScore =
        pi.score >= 85 ? 'MUST_KNOW' :
        pi.score >= 70 ? 'HIGH_YIELD' : 'SUPPORTING';

      // Determine category from tags
      const category = determineCategoryFromTags(pi.tags);

      const item: PriorityItem = {
        id: pi.id,
        title: pi.title,
        content: pi.body,
        priority,
        category,
        tags: pi.tags,
      };

      // Avoid duplicates
      const existing = categories.get(category);
      if (existing && !existing.some(e => e.title === item.title)) {
        existing.push(item);
      }
    }
  }

  // Add mechanisms from reasoning flow
  if (pageReasoning?.edges) {
    const mechanismItems = pageReasoning.edges
      .filter(e => e.type === 'CAUSES' || e.type === 'LEADS_TO')
      .slice(0, 5)
      .map((edge, idx) => {
        const fromNode = pageReasoning.nodes.find(n => n.id === edge.from);
        const toNode = pageReasoning.nodes.find(n => n.id === edge.to);
        return {
          id: `mech_${idx}`,
          title: `${fromNode?.label || 'Unknown'} → ${toNode?.label || 'Unknown'}`,
          content: `${fromNode?.label} leads to ${toNode?.label}`,
          priority: 'HIGH_YIELD' as PriorityScore,
          category: 'mechanism' as const,
        };
      });

    const existing = categories.get('mechanism') || [];
    categories.set('mechanism', [...existing, ...mechanismItems]);
  }

  // Add thresholds from page insights
  if (pageInsights?.whatMatters) {
    for (const item of pageInsights.whatMatters) {
      // Look for numeric patterns
      if (/\d+(?:\.\d+)?(?:\s*(?:mg|ml|mm|%|mmHg|mEq|IU|mcg|g\/dL))/i.test(item.summary)) {
        const thresholds = categories.get('threshold') || [];
        if (!thresholds.some(t => t.title === item.title)) {
          thresholds.push({
            id: item.id,
            title: item.title,
            content: item.summary,
            priority: 'HIGH_YIELD',
            category: 'threshold',
            tags: item.tags,
          });
        }
      }
    }
  }

  // Sort each category by priority
  for (const [key, items] of categories) {
    categories.set(key, items.sort((a, b) => {
      const priorityOrder: PriorityScore[] = ['MUST_KNOW', 'HIGH_YIELD', 'SUPPORTING'];
      return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    }));
  }

  return categories;
}

function bucketToPriority(bucket: ImportanceBucket): PriorityScore {
  switch (bucket) {
    case 'CRITICAL': return 'MUST_KNOW';
    case 'HIGH_YIELD': return 'HIGH_YIELD';
    default: return 'SUPPORTING';
  }
}

function determineCategory(insight: RankedInsight): PriorityItem['category'] {
  // Check for traps
  if (insight.type === 'EXAM_TRAP' || insight.trap) {
    return 'trap';
  }

  // Check for clinical pearls
  if (insight.type === 'CLINICAL_PEARL' || insight.clinicalPearl) {
    return 'clinical';
  }

  // Check for diagnostic/decision rules
  if (insight.type === 'DECISION_RULE' || insight.type === 'DIAGNOSTIC_SIGNAL') {
    return 'mechanism';
  }

  // Check for numeric content (thresholds)
  const text = (insight.claim || '') + (insight.whyItMatters || '');
  if (/\d+(?:\.\d+)?(?:\s*(?:mg|ml|mm|%|mmHg|mEq|IU|mcg|g\/dL))/i.test(text)) {
    return 'threshold';
  }

  // Check for causal patterns (mechanisms)
  if (/(?:causes?|leads? to|results? in|→|triggers?)/i.test(text)) {
    return 'mechanism';
  }

  // Default to high-yield
  return 'high_yield';
}

function determineCategoryFromTags(tags: string[]): PriorityItem['category'] {
  const tagStr = tags.join(' ').toLowerCase();

  if (tagStr.includes('trap') || tagStr.includes('pitfall') || tagStr.includes('confusion')) {
    return 'trap';
  }
  if (tagStr.includes('clinical') || tagStr.includes('practice') || tagStr.includes('treatment')) {
    return 'clinical';
  }
  if (tagStr.includes('mechanism') || tagStr.includes('pathway') || tagStr.includes('process')) {
    return 'mechanism';
  }
  if (tagStr.includes('threshold') || tagStr.includes('value') || tagStr.includes('number')) {
    return 'threshold';
  }

  return 'high_yield';
}

// ============================================================================
// Main Component
// ============================================================================

export const PriorityComprehensionPanel: React.FC<PriorityComprehensionPanelProps> = ({
  rankedInsights,
  pageIntelligence,
  pageInsights,
  pageReasoning,
  pageExtraction,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
  insightScale = 1.0,
  activeItemId,
  syncEnabled = true,
}) => {
  // Ref map: insight item ID → DOM element for scroll-into-view
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Scroll active item into view when sync is on and activeItemId changes
  useEffect(() => {
    if (!syncEnabled || !activeItemId) return;
    const el = itemRefs.current.get(activeItemId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeItemId, syncEnabled]);

  // Categorize all priority items
  const categorizedItems = useMemo(() => {
    return categorizePriorityItems(rankedInsights, pageIntelligence, pageInsights, pageReasoning);
  }, [rankedInsights, pageIntelligence, pageInsights, pageReasoning]);

  // Filter to only non-empty categories
  const activeCategories = useMemo(() => {
    const result: Array<{ category: PriorityItem['category']; items: PriorityItem[] }> = [];
    const order: PriorityItem['category'][] = ['high_yield', 'mechanism', 'trap', 'threshold', 'clinical'];

    for (const cat of order) {
      const items = categorizedItems.get(cat) || [];
      if (items.length > 0) {
        result.push({ category: cat, items });
      }
    }

    return result;
  }, [categorizedItems]);

  // Total count for header
  const totalItems = activeCategories.reduce((sum, c) => sum + c.items.length, 0);

  // If no content at all, show a helpful prompt (not an empty state error)
  if (totalItems === 0) {
    return (
      <div className="p-4 h-full flex flex-col items-center justify-center">
        <div className="text-center max-w-[240px]">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Ready to Extract
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Click "Extract Page" to discover what matters most on this page.
          </p>
          <div className="text-[10px] text-gray-600 space-y-1">
            <p>• High-yield statements</p>
            <p>• Key mechanisms</p>
            <p>• Exam traps</p>
            <p>• Clinical relevance</p>
          </div>
        </div>
      </div>
    );
  }

  // CSS variable scale applied to root; child text elements use calc(… * var(--insightScale))
  const panelStyle = {
    '--insightScale': String(insightScale),
  } as React.CSSProperties;

  return (
    <div className="p-3 overflow-y-auto h-full" style={panelStyle}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-teal-400 flex items-center gap-2">
            <span>🎯</span>
            Priority Comprehension
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            What you must know from this page
          </p>
        </div>
        <span className="px-2 py-0.5 text-[10px] bg-teal-500/20 text-teal-400 rounded">
          {totalItems} items
        </span>
      </div>

      {/* Priority Score Legend */}
      <div className="flex gap-2 mb-4 pb-3 border-b border-gray-700">
        {(['MUST_KNOW', 'HIGH_YIELD', 'SUPPORTING'] as PriorityScore[]).map(priority => {
          const style = PRIORITY_STYLES[priority];
          const count = activeCategories.reduce((sum, c) =>
            sum + c.items.filter(i => i.priority === priority).length, 0
          );
          if (count === 0) return null;
          return (
            <div key={priority} className="flex items-center gap-1 text-[10px]">
              <span>{style.icon}</span>
              <span className={style.text}>
                {priority.replace('_', ' ')}
              </span>
              <span className="text-gray-500">({count})</span>
            </div>
          );
        })}
      </div>

      {/* Category Sections */}
      <div className="space-y-5">
        {activeCategories.map(({ category, items }) => (
          <CategorySection
            key={category}
            category={category}
            items={items}
            rankedInsights={rankedInsights}
            activeItemId={activeItemId}
            itemRefs={itemRefs.current}
            onInsightClick={onInsightClick}
            onJumpToPage={onJumpToPage}
            onSaveToNoteLab={onSaveToNoteLab}
            onMarkConfusing={onMarkConfusing}
            onHighlightParagraph={onHighlightParagraph}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Category Section
// ============================================================================

interface CategorySectionProps {
  category: PriorityItem['category'];
  items: PriorityItem[];
  rankedInsights: RankedInsight[];
  activeItemId?: string | null;
  itemRefs: Map<string, HTMLElement>;
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  items,
  rankedInsights,
  activeItemId,
  itemRefs,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
}) => {
  const header = CATEGORY_HEADERS[category];

  return (
    <section>
      {/* Category Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{header.icon}</span>
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {header.label}
        </h3>
        <span className="text-[10px] text-gray-500">
          ({items.length})
        </span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.slice(0, 8).map(item => (
          <PriorityItemCard
            key={item.id}
            item={item}
            rankedInsights={rankedInsights}
            isActive={activeItemId === item.id}
            itemRefs={itemRefs}
            onInsightClick={onInsightClick}
            onJumpToPage={onJumpToPage}
            onSaveToNoteLab={onSaveToNoteLab}
            onMarkConfusing={onMarkConfusing}
            onHighlightParagraph={onHighlightParagraph}
          />
        ))}

        {/* Show more indicator */}
        {items.length > 8 && (
          <div className="text-[10px] text-gray-500 italic pl-2">
            +{items.length - 8} more items
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// Priority Item Card
// ============================================================================

interface PriorityItemCardProps {
  item: PriorityItem;
  rankedInsights: RankedInsight[];
  isActive?: boolean;
  itemRefs: Map<string, HTMLElement>;
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;
}

const PriorityItemCard: React.FC<PriorityItemCardProps> = ({
  item,
  rankedInsights,
  isActive = false,
  itemRefs,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
}) => {
  const style = PRIORITY_STYLES[item.priority];
  const linkedInsight = rankedInsights.find(r => r.id === item.id);
  const page = item.evidence?.[0]?.page;

  const handleClick = () => {
    // Zoom to paragraph in the PDF viewer
    if (onHighlightParagraph && item.content) {
      onHighlightParagraph(item.content);
    }
    if (linkedInsight && onInsightClick) {
      onInsightClick(linkedInsight);
    }
  };

  // Base font sizes scaled by --insightScale CSS variable (set by parent panel)
  const titleStyle: React.CSSProperties = { fontSize: 'calc(0.75rem * var(--insightScale, 1))' };
  const bodyStyle: React.CSSProperties = {
    fontSize: 'calc(0.6875rem * var(--insightScale, 1))',
    lineHeight: 'calc(1.4 * var(--insightScale, 1))',
  };
  const metaStyle: React.CSSProperties = { fontSize: 'calc(0.625rem * var(--insightScale, 1))' };

  return (
    <div
      ref={(el) => {
        if (el) itemRefs.set(item.id, el);
        else itemRefs.delete(item.id);
      }}
      onClick={handleClick}
      className={`
        p-2.5 rounded-lg border transition-all cursor-pointer
        ${style.bg} hover:border-gray-600
        ${isActive ? 'border-teal-500 ring-1 ring-teal-500/50' : 'border-gray-700'}
      `}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm flex-shrink-0">{style.icon}</span>
          <span className={`font-medium ${style.text} truncate`} style={titleStyle}>
            {item.title}
          </span>
        </div>

        {/* Page link */}
        {page !== undefined && onJumpToPage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(page);
            }}
            className="text-teal-400 hover:text-teal-300 flex-shrink-0"
            style={metaStyle}
          >
            p.{page + 1}
          </button>
        )}
      </div>

      {/* Content */}
      <p className="text-gray-300 line-clamp-2 pl-5" style={bodyStyle}>
        {item.content}
      </p>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex gap-1 mt-1.5 pl-5 flex-wrap">
          {item.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded"
              style={metaStyle}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions (only if linked to an insight) */}
      {linkedInsight && (onSaveToNoteLab || onMarkConfusing) && (
        <div className="flex gap-1 mt-2 pl-5">
          {onSaveToNoteLab && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveToNoteLab(linkedInsight);
              }}
              className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              style={metaStyle}
            >
              💾 Save
            </button>
          )}
          {onMarkConfusing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkConfusing(linkedInsight);
              }}
              className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              style={metaStyle}
            >
              ❓ Confusing
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriorityComprehensionPanel;
