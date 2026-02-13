// components/surgeonView2/BottomDrawer.tsx
// Slide-up drawer with Source, Reasoning, Flashcards, Notes, Related tabs

import React from 'react';
import type {
  DrawerTab,
  CoreConceptV2,
  Pearl,
  ReasoningOverlay,
  SourceAnchor,
} from '../../lib/surgeonView2/types';

interface BottomDrawerProps {
  isOpen: boolean;
  activeTab: DrawerTab;
  selectedConcept: CoreConceptV2 | null;
  selectedPearl: Pearl | null;
  reasoning: ReasoningOverlay | null;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onJumpToSource: (anchor: SourceAnchor) => void;
}

const TABS: { value: DrawerTab; label: string; icon: string }[] = [
  { value: 'source', label: 'Source', icon: '📄' },
  { value: 'reasoning', label: 'Reasoning', icon: '🧠' },
  { value: 'flashcards', label: 'Cards', icon: '🃏' },
  { value: 'notes', label: 'Notes', icon: '✏️' },
  { value: 'related', label: 'Related', icon: '🔗' },
];

export const BottomDrawer: React.FC<BottomDrawerProps> = ({
  isOpen,
  activeTab,
  selectedConcept,
  selectedPearl,
  reasoning,
  onTabChange,
  onClose,
  onJumpToSource,
}) => {
  const selectedItem = selectedConcept || selectedPearl;
  const anchor = selectedItem?.anchor;

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-xl
        transition-transform duration-300 ease-out z-50
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
      `}
      style={{ height: '40vh', maxHeight: '400px' }}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              className={`
                flex items-center gap-1 px-3 py-2 text-sm font-medium
                border-b-2 transition-colors
                ${activeTab === tab.value
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="p-4 overflow-y-auto" style={{ height: 'calc(100% - 48px)' }}>
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a concept or pearl to see details
          </div>
        ) : (
          <>
            {/* Source Tab */}
            {activeTab === 'source' && (
              <SourceTabContent
                item={selectedItem}
                onJumpToSource={() => anchor && onJumpToSource(anchor)}
              />
            )}

            {/* Reasoning Tab */}
            {activeTab === 'reasoning' && (
              <ReasoningTabContent
                concept={selectedConcept}
                reasoning={reasoning}
              />
            )}

            {/* Flashcards Tab */}
            {activeTab === 'flashcards' && (
              <FlashcardsTabContent concept={selectedConcept} />
            )}

            {/* Notes Tab */}
            {activeTab === 'notes' && (
              <NotesTabContent concept={selectedConcept} />
            )}

            {/* Related Tab */}
            {activeTab === 'related' && (
              <RelatedTabContent concept={selectedConcept} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Source Tab: Shows original text excerpt
const SourceTabContent: React.FC<{
  item: CoreConceptV2 | Pearl;
  onJumpToSource: () => void;
}> = ({ item, onJumpToSource }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-gray-900">Source Excerpt</h3>
      <button
        onClick={onJumpToSource}
        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
      >
        <span>Jump to PDF</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
    </div>

    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {item.sourceExcerpt}
      </p>
    </div>

    <div className="text-xs text-gray-500 flex items-center gap-4">
      <span>Page {item.anchor.pageIndex + 1}</span>
      <span>Paragraph {item.anchor.paragraphIndex + 1}</span>
      {item.anchor.charStart !== undefined && (
        <span>Chars {item.anchor.charStart}–{item.anchor.charEnd}</span>
      )}
    </div>
  </div>
);

// Reasoning Tab: Shows why this matters, when to use, etc.
const ReasoningTabContent: React.FC<{
  concept: CoreConceptV2 | null;
  reasoning: ReasoningOverlay | null;
}> = ({ concept, reasoning }) => {
  if (!concept) {
    return <p className="text-gray-500">Select a concept to see reasoning</p>;
  }

  if (!reasoning) {
    return (
      <div className="space-y-4">
        <p className="text-gray-500">
          Reasoning overlay not generated yet. This will show:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          <li>What this concept means</li>
          <li>Why it matters</li>
          <li>When to use it</li>
          <li>Common traps to avoid</li>
          <li>Practice question</li>
        </ul>
        <button className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors">
          Generate Reasoning
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">What It Means</h4>
        <p className="text-sm text-gray-800">{reasoning.meaning}</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Why It Matters</h4>
        <p className="text-sm text-gray-800">{reasoning.whyItMatters}</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">When to Use</h4>
        <p className="text-sm text-gray-800">{reasoning.whenToUse}</p>
      </div>

      {reasoning.commonTrap && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-red-600 uppercase mb-1">Common Trap</h4>
          <p className="text-sm text-red-800">{reasoning.commonTrap}</p>
        </div>
      )}

      {reasoning.question && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-blue-600 uppercase mb-1">Practice Question</h4>
          <p className="text-sm text-blue-800 font-medium mb-2">{reasoning.question.q}</p>
          <ul className="space-y-1">
            {reasoning.question.choices.map((choice, idx) => (
              <li key={idx} className="text-sm text-gray-700">
                {String.fromCharCode(65 + idx)}. {choice}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Flashcards Tab: Generate/view flashcards
const FlashcardsTabContent: React.FC<{ concept: CoreConceptV2 | null }> = ({ concept }) => {
  if (!concept) {
    return <p className="text-gray-500">Select a concept to create flashcards</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Auto-generate flashcards from this concept:
      </p>

      {/* Preview card */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
        <div className="text-xs text-blue-600 font-medium mb-2">FRONT</div>
        <p className="text-gray-800 font-medium">{concept.label}</p>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-lg p-4 border border-green-200">
        <div className="text-xs text-green-600 font-medium mb-2">BACK</div>
        <p className="text-gray-800">{concept.oneLiner}</p>
      </div>

      <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
        Add to Flashcard Deck
      </button>
    </div>
  );
};

// Notes Tab: User notes for this concept
const NotesTabContent: React.FC<{ concept: CoreConceptV2 | null }> = ({ concept }) => {
  if (!concept) {
    return <p className="text-gray-500">Select a concept to add notes</p>;
  }

  return (
    <div className="space-y-4">
      <textarea
        placeholder="Add your notes about this concept..."
        className="w-full h-32 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
        Save Note
      </button>
    </div>
  );
};

// Related Tab: Related concepts
const RelatedTabContent: React.FC<{ concept: CoreConceptV2 | null }> = ({ concept }) => {
  if (!concept) {
    return <p className="text-gray-500">Select a concept to see related items</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Related concepts will appear here based on semantic similarity and tags.
      </p>

      <div className="space-y-2">
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500">No related concepts found yet.</p>
        </div>
      </div>
    </div>
  );
};

export default BottomDrawer;
