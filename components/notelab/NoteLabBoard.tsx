import React, { useMemo, useState } from 'react';
import type { CardRelationType, LearningCard } from '@/lib/learning/model';

export type NoteLabBoardProps = {
  cards: LearningCard[];
  activeCardId?: string | null;
  onSelectCard: (id: string) => void;
  onAddToStudy: (id: string) => void;
  onOpenSource: (id: string) => void;
  onCreateLink: (sourceId: string, targetId: string, relation: CardRelationType) => void;
  viewMode: 'board' | 'recall' | 'hooks';
};

const relationOptions: CardRelationType[] = ['depends_on', 'causes', 'contrasts_with', 'implies', 'example_of', 'applies_to', 'defines'];

export default function NoteLabBoard({ cards, activeCardId, onSelectCard, onAddToStudy, onOpenSource, onCreateLink, viewMode }: NoteLabBoardProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const sortedCards = useMemo(() => {
    const pinned = cards.filter((card) => pinnedIds.has(card.id));
    const regular = cards.filter((card) => !pinnedIds.has(card.id));
    return [...pinned, ...regular];
  }, [cards, pinnedIds]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {sortedCards.map((card) => {
        const expanded = expandedIds.has(card.id);
        const body = viewMode === 'recall'
          ? `${card.body}\n\nWhy it matters: ${card.whyItMatters || 'Key idea for this section.'}\nRecall: ${card.recallPrompt || ''}`
          : viewMode === 'hooks'
            ? `${card.memoryHook || 'Add a mnemonic or analogy for this card.'}\n\nTrap: ${card.tags.includes('trap') ? 'Potential confusion point' : 'No trap tagged yet.'}`
            : card.body;

        return (
          <div
            key={card.id}
            className={`rounded-xl border p-3 transition-colors ${activeCardId === card.id ? 'border-purple-500 bg-purple-950/20' : 'border-gray-700 bg-gray-800/70'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <button className="text-left" onClick={() => onSelectCard(card.id)}>
                <p className="text-xs text-gray-400 uppercase">{card.type}</p>
                <h4 className="text-sm font-semibold text-white">{card.title}</h4>
              </button>
              <span className="text-[11px] text-gray-500">p.{card.page}</span>
            </div>

            <p className={`mt-2 text-sm text-gray-200 whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>{body}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button onClick={() => setExpandedIds((prev) => new Set(prev.has(card.id) ? [...prev].filter((id) => id !== card.id) : [...prev, card.id]))} className="px-2 py-1 rounded bg-gray-700 text-gray-200">{expanded ? 'Collapse' : 'Expand'}</button>
              <button onClick={() => setPinnedIds((prev) => new Set(prev.has(card.id) ? [...prev].filter((id) => id !== card.id) : [...prev, card.id]))} className="px-2 py-1 rounded bg-gray-700 text-gray-200">{pinnedIds.has(card.id) ? 'Unpin' : 'Pin'}</button>
              <button onClick={() => onAddToStudy(card.id)} className="px-2 py-1 rounded bg-teal-700 text-white">Add to Study</button>
              <button onClick={() => onOpenSource(card.id)} className="px-2 py-1 rounded bg-blue-700 text-white">Open Source</button>
              {cards.length > 1 && (
                <select
                  className="px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-200"
                  onChange={(e) => {
                    const [targetId, rel] = e.target.value.split('|') as [string, CardRelationType];
                    if (targetId && rel) onCreateLink(card.id, targetId, rel);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Connect card…</option>
                  {cards.filter((target) => target.id !== card.id).map((target) => (
                    relationOptions.map((rel) => (
                      <option key={`${target.id}_${rel}`} value={`${target.id}|${rel}`}>{rel} → {target.title.slice(0, 20)}</option>
                    ))
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
