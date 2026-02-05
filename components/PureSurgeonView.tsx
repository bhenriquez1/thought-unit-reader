"use client";

import React, { useEffect, useMemo } from 'react';
import SmartPDFViewer from './SmartPDFViewer';
import ConceptCard from './ConceptCard';
import ProcedureCard from './ProcedureCard';
import ExampleCard from './ExampleCard';
import VisualCard from './VisualCard';
import { useConceptStore } from '@/lib/stores/conceptStore';
import type { PageClassification } from '@/lib/universalExtractor';

interface PureSurgeonViewProps {
  fileUrl: string | null;
  documentId: string;
  userId: string;
  currentPage: number;
  pdfPageCount: number;
  thoughtUnits: Array<{ text: string; id?: string }>;
  currentThoughtUnit: number;
  chapterId?: string;
  headings: string[];
  pageText?: string;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onThoughtUnitChange?: (index: number) => void;
  onRecommendedAction?: (action: 'study' | 'next_chapter') => void;
}

const orderByType: Record<PageClassification, Array<'concept' | 'procedure' | 'example' | 'visual'>> = {
  DEFINITION: ['concept', 'example', 'visual', 'procedure'],
  EXAMPLE: ['example', 'concept', 'procedure', 'visual'],
  PROCEDURE: ['procedure', 'concept', 'example', 'visual'],
  FIGURE: ['visual', 'concept', 'example', 'procedure'],
  EXERCISES: ['example', 'procedure', 'concept', 'visual'],
  NARRATIVE: ['concept', 'example', 'visual', 'procedure']
};

export default function PureSurgeonView({
  fileUrl,
  currentPage,
  pageText = '',
  headings,
  thoughtUnits,
  onPageChange,
  onPageCount
}: PureSurgeonViewProps) {
  const { extractForPage, conceptsByPage, classificationByPage } = useConceptStore();

  useEffect(() => {
    const fallbackText = thoughtUnits.map(t => t.text).join(' ');
    const text = pageText || fallbackText;
    if (text.trim().length > 0) {
      extractForPage(currentPage, text);
    }
  }, [currentPage, pageText, thoughtUnits, extractForPage]);

  const concepts = conceptsByPage[currentPage] || [];
  const classification = classificationByPage[currentPage] || 'NARRATIVE';

  const steps = useMemo(
    () => concepts.flatMap(c => c.source_sentences).filter(s => /\b(first|next|then|finally|step)\b/i.test(s)).slice(0, 7),
    [concepts]
  );

  const cards = useMemo(() => {
    const order = orderByType[classification];
    return order.map((type) => {
      if (type === 'concept') {
        return (
          <div key="concept-group">
            {concepts.length === 0 ? (
              <p className="text-xs text-slate-400">No concepts extracted for this page yet.</p>
            ) : (
              concepts.map((concept) => <ConceptCard key={concept.id} concept={concept} />)
            )}
          </div>
        );
      }

      if (type === 'procedure' && steps.length >= 3) {
        return <ProcedureCard key="procedure" title="Procedure Flow" steps={steps} />;
      }

      if (type === 'example' && concepts[0]) {
        return (
          <ExampleCard
            key="example"
            problem={concepts[0].core_sentence}
            steps={concepts[0].exceptions.length ? concepts[0].exceptions : concepts[0].source_sentences.slice(1, 4)}
            result={concepts[0].stop_reason}
          />
        );
      }

      if (type === 'visual' && concepts.length) {
        return (
          <VisualCard
            key="visual"
            description={concepts[0].core_sentence}
            figureHint={concepts[0].attachment_triggers.includes('V') ? 'Figure-related signal detected (V).' : undefined}
          />
        );
      }

      return null;
    });
  }, [classification, concepts, steps]);

  if (!fileUrl) {
    return <div className="h-full flex items-center justify-center text-slate-300">Load a PDF to start.</div>;
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
      <div className="h-full min-h-0 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
        <SmartPDFViewer
          fileUrl={fileUrl}
          currentPage={currentPage}
          onPageChange={onPageChange}
          onPageCount={onPageCount}
          scale={1.2}
        />
      </div>
      <aside className="h-full min-h-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3">
        <h2 className="text-sm font-semibold text-slate-100">Universal Thought-Unit Reader</h2>
        <p className="text-xs text-slate-400 mt-1">Page type: {classification} · Heading: {headings[0] || 'N/A'}</p>
        <div className="mt-3">{cards}</div>
      </aside>
    </div>
  );
}
