// components/apex/ApexBadge.tsx
// DAT Apex Badge - Shows exam pattern info on hover

import React, { useState } from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';

// ============================================================================
// Types
// ============================================================================

interface ApexBadgeProps {
  badge: NonNullable<RankedInsight['apexBadge']>;
  patternId?: string;
  onDrillClick?: () => void;
  size?: 'small' | 'medium';
}

// ============================================================================
// Component
// ============================================================================

export const ApexBadge: React.FC<ApexBadgeProps> = ({
  badge,
  patternId,
  onDrillClick,
  size = 'small',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const sizeClasses = size === 'small'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-1 text-sm';

  return (
    <div className="relative inline-block">
      {/* Badge Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          ${sizeClasses}
          bg-purple-600 hover:bg-purple-500 text-white rounded
          font-semibold flex items-center gap-1 transition-colors
        `}
        title="DAT High-Yield Pattern"
      >
        <span>🎯</span>
        <span>DAT</span>
      </button>

      {/* Expanded Tooltip */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />

          {/* Tooltip Card */}
          <div className="absolute z-50 top-full left-0 mt-2 w-80 bg-gray-800 border border-purple-600/50 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-purple-900/50 border-b border-purple-600/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <div>
                  <h3 className="font-semibold text-white">{badge.patternName}</h3>
                  <p className="text-xs text-purple-300">DAT High-Yield Pattern</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* What They Test */}
              <div>
                <h4 className="text-xs font-semibold text-purple-400 uppercase mb-1">
                  What They Test
                </h4>
                <p className="text-sm text-gray-200">{badge.whatTheyTest}</p>
              </div>

              {/* Common Trap */}
              <div className="p-2 bg-red-900/30 rounded border-l-2 border-red-500">
                <h4 className="text-xs font-semibold text-red-400 uppercase mb-1">
                  Common Trap
                </h4>
                <p className="text-sm text-red-100">{badge.commonTrap}</p>
              </div>

              {/* Decision Rule */}
              <div className="p-2 bg-teal-900/30 rounded border-l-2 border-teal-500">
                <h4 className="text-xs font-semibold text-teal-400 uppercase mb-1">
                  Decision Rule
                </h4>
                <p className="text-sm text-teal-100">{badge.decisionRule}</p>
              </div>

              {/* Quick Mnemonic */}
              {badge.quickMnemonic && (
                <div className="p-2 bg-amber-900/30 rounded border-l-2 border-amber-500">
                  <h4 className="text-xs font-semibold text-amber-400 uppercase mb-1">
                    Quick Mnemonic
                  </h4>
                  <p className="text-sm text-amber-100 font-medium">{badge.quickMnemonic}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-700 flex gap-2">
              {onDrillClick && (
                <button
                  onClick={() => {
                    setIsExpanded(false);
                    onDrillClick();
                  }}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium"
                >
                  🎮 Drill This Pattern
                </button>
              )}
              <button
                onClick={() => setIsExpanded(false)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Inline Badge (for use inside cards)
// ============================================================================

interface ApexBadgeInlineProps {
  badge: NonNullable<RankedInsight['apexBadge']>;
  expanded?: boolean;
}

export const ApexBadgeInline: React.FC<ApexBadgeInlineProps> = ({
  badge,
  expanded = true,
}) => {
  if (!expanded) {
    return (
      <span className="px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded font-semibold">
        🎯 DAT
      </span>
    );
  }

  return (
    <div className="mt-2 p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🎯</span>
        <span className="text-xs font-semibold text-purple-300">
          DAT Pattern: {badge.patternName}
        </span>
      </div>

      <div className="text-xs text-gray-300 space-y-2">
        <p>
          <span className="text-purple-400 font-medium">Tests:</span>{' '}
          {badge.whatTheyTest}
        </p>
        <p>
          <span className="text-red-400 font-medium">Trap:</span>{' '}
          {badge.commonTrap}
        </p>
        <p>
          <span className="text-teal-400 font-medium">Rule:</span>{' '}
          {badge.decisionRule}
        </p>
        {badge.quickMnemonic && (
          <p>
            <span className="text-amber-400 font-medium">Mnemonic:</span>{' '}
            {badge.quickMnemonic}
          </p>
        )}
      </div>
    </div>
  );
};

export default ApexBadge;
