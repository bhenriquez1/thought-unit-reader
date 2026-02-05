"use client";

/**
 * VisualCard - Figure/diagram reference card
 *
 * Features:
 * - "What to look for" guidance
 * - Jump-to-figure button
 * - Key features callout
 * - Related concepts
 */

import React, { useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface VisualFeature {
  id: string;
  label: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
}

export interface VisualReference {
  id: string;
  figureNumber: string;      // e.g., "Figure 3.2", "Table 1"
  title?: string;
  pageNumber?: number;
  type: 'figure' | 'table' | 'diagram' | 'chart' | 'graph' | 'image';
  whatToLookFor: string[];   // Key things to notice
  features?: VisualFeature[];
  relatedConcepts?: string[];
  caption?: string;
}

interface VisualCardProps {
  visual: VisualReference;
  onJumpToFigure?: (pageNumber: number, figureNumber: string) => void;
  onHighlightSelect?: (text: string) => void;
}

// ============================================================================
// Sub-components
// ============================================================================

function VisualTypeIcon({ type }: { type: VisualReference['type'] }) {
  const icons: Record<string, string> = {
    figure: 'IMG',
    table: 'TBL',
    diagram: 'DIA',
    chart: 'CHT',
    graph: 'GRP',
    image: 'IMG',
  };

  const colors: Record<string, string> = {
    figure: 'bg-purple-600',
    table: 'bg-blue-600',
    diagram: 'bg-green-600',
    chart: 'bg-orange-600',
    graph: 'bg-pink-600',
    image: 'bg-purple-600',
  };

  return (
    <div
      className={`flex-shrink-0 w-10 h-10 rounded-lg ${colors[type]} flex items-center justify-center`}
    >
      <span className="text-xs font-bold text-white">{icons[type]}</span>
    </div>
  );
}

function ImportanceBadge({ importance }: { importance: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-900/30 text-red-400 border-red-700/50',
    medium: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50',
    low: 'bg-gray-700/30 text-gray-400 border-gray-600/50',
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded border ${styles[importance]}`}
    >
      {importance === 'high' ? 'Key' : importance === 'medium' ? 'Important' : 'Note'}
    </span>
  );
}

function FeatureItem({ feature }: { feature: VisualFeature }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <ImportanceBadge importance={feature.importance} />
      <div>
        <span className="text-sm font-medium text-white">{feature.label}</span>
        <p className="text-xs text-gray-400">{feature.description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function VisualCard({
  visual,
  onJumpToFigure,
  onHighlightSelect,
}: VisualCardProps) {
  const handleJump = useCallback(() => {
    if (visual.pageNumber && onJumpToFigure) {
      onJumpToFigure(visual.pageNumber, visual.figureNumber);
    }
  }, [visual.pageNumber, visual.figureNumber, onJumpToFigure]);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString();
    if (selection && onHighlightSelect) {
      onHighlightSelect(selection);
    }
  }, [onHighlightSelect]);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-900/30 to-violet-900/30 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VisualTypeIcon type={visual.type} />
            <div>
              <h3 className="text-white font-semibold">{visual.figureNumber}</h3>
              {visual.title && (
                <p className="text-sm text-gray-400">{visual.title}</p>
              )}
            </div>
          </div>
          {visual.pageNumber && onJumpToFigure && (
            <button
              onClick={handleJump}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded transition-colors flex items-center gap-1"
            >
              <span>Go to</span>
              <span>p.{visual.pageNumber}</span>
            </button>
          )}
        </div>
      </div>

      {/* What to Look For */}
      <div className="px-4 py-3 border-b border-gray-700/50" onMouseUp={handleTextSelect}>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          What to Look For
        </h4>
        <ul className="space-y-1">
          {visual.whatToLookFor.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span className="text-purple-400 mt-0.5">*</span>
              <span className="text-gray-300">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Key Features */}
      {visual.features && visual.features.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700/50" onMouseUp={handleTextSelect}>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Key Features
          </h4>
          <div className="space-y-2">
            {visual.features.map((feature) => (
              <FeatureItem key={feature.id} feature={feature} />
            ))}
          </div>
        </div>
      )}

      {/* Caption */}
      {visual.caption && (
        <div className="px-4 py-2 bg-gray-850">
          <p className="text-xs text-gray-500 italic">{visual.caption}</p>
        </div>
      )}

      {/* Related Concepts */}
      {visual.relatedConcepts && visual.relatedConcepts.length > 0 && (
        <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700/50 flex flex-wrap gap-2">
          <span className="text-xs text-gray-600">Related:</span>
          {visual.relatedConcepts.map((concept, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400"
            >
              {concept}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper: Extract visual reference from text
// ============================================================================

export function extractVisualFromText(text: string): VisualReference | null {
  // Look for figure/table references
  const figureMatch = text.match(
    /\b(figure|fig\.|table|chart|diagram|graph)\s*(\d+(?:\.\d+)?[a-z]?)/i
  );

  if (!figureMatch) return null;

  const typeMap: Record<string, VisualReference['type']> = {
    figure: 'figure',
    'fig.': 'figure',
    table: 'table',
    chart: 'chart',
    diagram: 'diagram',
    graph: 'graph',
  };

  const type = typeMap[figureMatch[1].toLowerCase()] || 'figure';
  const figureNumber = `${figureMatch[1]} ${figureMatch[2]}`;

  // Extract what to look for from surrounding context
  const whatToLookFor: string[] = [];

  // Look for "shows", "demonstrates", "illustrates" patterns
  const showsMatch = text.match(
    /(?:shows?|demonstrates?|illustrates?|displays?|depicts?)\s+(.+?)(?:[.;]|$)/i
  );
  if (showsMatch) {
    whatToLookFor.push(showsMatch[1].trim());
  }

  // Look for "note", "observe", "notice" patterns
  const noteMatch = text.match(
    /(?:note|observe|notice)\s+(?:that\s+)?(.+?)(?:[.;]|$)/i
  );
  if (noteMatch) {
    whatToLookFor.push(noteMatch[1].trim());
  }

  // Default if nothing found
  if (whatToLookFor.length === 0) {
    whatToLookFor.push('Review the main components');
    whatToLookFor.push('Identify key relationships');
  }

  return {
    id: `visual_${Date.now()}`,
    figureNumber,
    type,
    whatToLookFor,
  };
}
