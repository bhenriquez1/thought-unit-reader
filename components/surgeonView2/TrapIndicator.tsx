// components/surgeonView2/TrapIndicator.tsx
// Trap icon + tooltip for DAT Trap Detection
// Shows warning icon with "what students confuse + how to separate"

import React, { useState } from 'react';
import type { TrapTag, TrapType } from '@/lib/surgeonEngine/types';

// ============================================================================
// Constants
// ============================================================================

const TRAP_TYPE_CONFIG: Record<TrapType, { icon: string; color: string; label: string }> = {
  LOOK_ALIKE: { icon: '👀', color: 'text-amber-400', label: 'Look-Alike' },
  REVERSAL: { icon: '🔄', color: 'text-orange-400', label: 'Reversal' },
  THRESHOLD: { icon: '📏', color: 'text-blue-400', label: 'Threshold' },
  EXCEPTION: { icon: '❗', color: 'text-red-400', label: 'Exception' },
  NEGATION: { icon: '🚫', color: 'text-rose-400', label: 'Negation' },
  WORDING_TRICK: { icon: '🔤', color: 'text-purple-400', label: 'Wording' },
};

// ============================================================================
// TrapIcon: Small inline indicator
// ============================================================================

interface TrapIconProps {
  traps: TrapTag[];
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export const TrapIcon: React.FC<TrapIconProps> = ({ traps, size = 'sm', onClick }) => {
  if (traps.length === 0) return null;

  const primaryTrap = traps[0];
  const config = TRAP_TYPE_CONFIG[primaryTrap.type];
  const sizeClass = size === 'sm' ? 'text-xs p-0.5' : 'text-sm p-1';

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`inline-flex items-center gap-0.5 ${sizeClass} ${config.color} bg-amber-900/30 border border-amber-700/50 rounded hover:bg-amber-900/50 transition-colors`}
      title={primaryTrap.trapPrompt}
    >
      <span>⚠️</span>
      {traps.length > 1 && <span className="text-[10px] font-bold">{traps.length}</span>}
    </button>
  );
};

// ============================================================================
// TrapTooltip: Expanded trap details panel
// ============================================================================

interface TrapTooltipProps {
  traps: TrapTag[];
  onClose?: () => void;
}

export const TrapTooltip: React.FC<TrapTooltipProps> = ({ traps, onClose }) => {
  if (traps.length === 0) return null;

  return (
    <div className="bg-gray-800 border border-amber-600/50 rounded-lg p-3 shadow-xl max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">⚠️</span>
          <span className="text-sm font-semibold text-amber-300">
            {traps.length === 1 ? 'Trap Detected' : `${traps.length} Traps Detected`}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Trap Cards */}
      <div className="space-y-2">
        {traps.map((trap) => {
          const config = TRAP_TYPE_CONFIG[trap.type];
          return (
            <div
              key={trap.trapId}
              className="bg-gray-900/50 rounded p-2 border-l-2"
              style={{ borderColor: `var(--${config.color.replace('text-', '')}, #f59e0b)` }}
            >
              {/* Type Badge */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">{config.icon}</span>
                <span className={`text-xs font-semibold ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-[10px] text-gray-500">
                  {Math.round(trap.confidence * 100)}%
                </span>
              </div>

              {/* What students confuse */}
              <p className="text-xs text-gray-200 mb-1">
                {trap.trapPrompt}
              </p>

              {/* How to separate */}
              {trap.separatorHint && (
                <div className="mt-1 pt-1 border-t border-gray-700">
                  <p className="text-[11px] text-teal-400">
                    <span className="font-semibold">How to separate:</span>{' '}
                    {trap.separatorHint}
                  </p>
                </div>
              )}

              {/* Cue */}
              {trap.cue && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                  cue: "{trap.cue}"
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// TrapBadge: Inline badge for Priority Feed
// ============================================================================

interface TrapBadgeProps {
  trap: TrapTag;
}

export const TrapBadge: React.FC<TrapBadgeProps> = ({ trap }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = TRAP_TYPE_CONFIG[trap.type];

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => { e.stopPropagation(); setShowTooltip(!showTooltip); }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${config.color} bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/40 transition-colors`}
      >
        <span>⚠️</span>
        <span>{config.label}</span>
      </button>

      {showTooltip && (
        <div className="absolute z-50 bottom-full left-0 mb-1">
          <TrapTooltip traps={[trap]} onClose={() => setShowTooltip(false)} />
        </div>
      )}
    </div>
  );
};

export default TrapIcon;
