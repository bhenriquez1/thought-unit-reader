"use client";

import React, { useState } from 'react';
import type { ConceptOutput } from '@/lib/universalExtractor';

interface ConceptCardProps {
  concept: ConceptOutput;
}

export default function ConceptCard({ concept }: ConceptCardProps) {
  const [showExceptions, setShowExceptions] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="border border-slate-700 rounded-lg p-3 bg-slate-900/40 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">Concept</span>
        <button className="text-xs text-blue-300" onClick={() => setShowRaw(v => !v)}>
          {showRaw ? 'Filtered' : 'Raw'}
        </button>
      </div>
      <p className="text-sm text-slate-100">{concept.core_sentence}</p>
      {showRaw && (
        <p className="text-xs text-slate-400 mt-2">{concept.source_sentences.join(' ')}</p>
      )}
      {!!concept.exceptions.length && (
        <div className="mt-2">
          <button className="text-xs text-amber-300" onClick={() => setShowExceptions(v => !v)}>
            {showExceptions ? 'Hide Exceptions' : 'Show Exceptions'} ({concept.exception_triggers.join(', ')})
          </button>
          {showExceptions && (
            <ul className="text-xs text-slate-300 mt-2 list-disc pl-4">
              {concept.exceptions.map((ex, idx) => (
                <li key={`${concept.id}-ex-${idx}`}>{ex}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
