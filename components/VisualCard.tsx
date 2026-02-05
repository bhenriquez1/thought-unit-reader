"use client";

import React from 'react';

interface VisualCardProps {
  description: string;
  figureHint?: string;
  onJumpToFigure?: () => void;
}

export default function VisualCard({ description, figureHint, onJumpToFigure }: VisualCardProps) {
  return (
    <div className="border border-rose-700 rounded-lg p-3 bg-rose-950/20 mb-3">
      <p className="text-xs uppercase text-rose-300 mb-1">Visual cue</p>
      <p className="text-sm text-slate-100">What to look for: {description}</p>
      {figureHint && <p className="text-xs text-slate-300 mt-2">{figureHint}</p>}
      {onJumpToFigure && (
        <button className="text-xs text-rose-200 mt-2 underline" onClick={onJumpToFigure}>
          Jump to figure
        </button>
      )}
    </div>
  );
}
