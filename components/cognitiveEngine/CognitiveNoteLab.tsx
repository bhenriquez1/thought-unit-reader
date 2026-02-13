// components/cognitiveEngine/CognitiveNoteLab.tsx
// NoteLab 2.0 - Cognitive Reasoning Workspace
// User cognition capture: personal understanding, concept connections, reasoning, decision rules

import React, { useState, useCallback, useMemo } from 'react';
import type {
  CognitiveNote,
  LinkedConcept,
  ReasoningBlock,
  DecisionRule,
  DetectedInsight,
  ClinicalInsight,
} from '../../lib/cognitiveEngine/types';

interface CognitiveNoteLabProps {
  note: CognitiveNote;
  availableConcepts: ClinicalInsight[];
  onNoteUpdate: (note: CognitiveNote) => void;
  onDecisionRuleSave: (rule: DecisionRule) => void;
  onSendToStudyMode: (conceptIds: string[]) => void;
}

export const CognitiveNoteLab: React.FC<CognitiveNoteLabProps> = ({
  note,
  availableConcepts,
  onNoteUpdate,
  onDecisionRuleSave,
  onSendToStudyMode,
}) => {
  const [activeTab, setActiveTab] = useState<'note' | 'links' | 'reasoning' | 'rules'>('note');
  const [showConceptSuggestions, setShowConceptSuggestions] = useState(false);

  // Suggested concepts based on note content
  const suggestedConcepts = useMemo(() => {
    const noteText = note.content.toLowerCase();
    return availableConcepts.filter((concept) =>
      noteText.includes(concept.concept.toLowerCase().slice(0, 10))
    ).slice(0, 5);
  }, [note.content, availableConcepts]);

  const handleContentChange = useCallback((content: string) => {
    onNoteUpdate({ ...note, content, updatedAt: Date.now() });
  }, [note, onNoteUpdate]);

  const handleLinkConcept = useCallback((concept: ClinicalInsight) => {
    const newLink: LinkedConcept = {
      conceptId: concept.id,
      conceptLabel: concept.concept,
      linkType: 'supports',
      backlinks: [],
    };
    onNoteUpdate({
      ...note,
      linkedConcepts: [...note.linkedConcepts, newLink],
      updatedAt: Date.now(),
    });
  }, [note, onNoteUpdate]);

  const handleAddReasoningBlock = useCallback((type: ReasoningBlock['type']) => {
    const newBlock: ReasoningBlock = {
      id: `rb_${Date.now()}`,
      type,
      content: '',
    };
    onNoteUpdate({
      ...note,
      reasoningBlocks: [...note.reasoningBlocks, newBlock],
      updatedAt: Date.now(),
    });
  }, [note, onNoteUpdate]);

  const handleUpdateReasoningBlock = useCallback((blockId: string, content: string) => {
    onNoteUpdate({
      ...note,
      reasoningBlocks: note.reasoningBlocks.map((b) =>
        b.id === blockId ? { ...b, content } : b
      ),
      updatedAt: Date.now(),
    });
  }, [note, onNoteUpdate]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📝</span>
          <div>
            <h2 className="font-bold text-gray-900">NoteLab 2.0</h2>
            <p className="text-xs text-gray-500">Cognitive Reasoning Workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {note.linkedConcepts.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              {note.linkedConcepts.length} linked
            </span>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'note', label: 'Note', icon: '✏️' },
          { key: 'links', label: 'Concept Links', icon: '🔗' },
          { key: 'reasoning', label: 'Reasoning Blocks', icon: '🧠' },
          { key: 'rules', label: 'Decision Rules', icon: '⚡' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`
              flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium
              border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-purple-500 text-purple-700 bg-purple-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Note Tab */}
        {activeTab === 'note' && (
          <div className="p-4">
            <textarea
              value={note.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Capture your understanding, make connections, reason through concepts..."
              className="w-full h-64 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            {/* Concept Suggestions */}
            {suggestedConcepts.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <span>💡</span> Suggested concept links:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedConcepts.map((concept) => (
                    <button
                      key={concept.id}
                      onClick={() => handleLinkConcept(concept)}
                      disabled={note.linkedConcepts.some((l) => l.conceptId === concept.id)}
                      className={`
                        px-3 py-1 rounded-full text-sm transition-colors
                        ${note.linkedConcepts.some((l) => l.conceptId === concept.id)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        }
                      `}
                    >
                      {note.linkedConcepts.some((l) => l.conceptId === concept.id) ? '✓ ' : '+ '}
                      {concept.concept.slice(0, 30)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Detected Insights */}
            {note.detectedInsights.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-500">🔍 Detected patterns:</p>
                {note.detectedInsights.map((insight, idx) => (
                  <InsightAlert key={idx} insight={insight} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Concept Links Tab */}
        {activeTab === 'links' && (
          <div className="p-4">
            <ConceptLinkPanel
              linkedConcepts={note.linkedConcepts}
              availableConcepts={availableConcepts}
              onLinkConcept={handleLinkConcept}
              onUnlinkConcept={(conceptId) => {
                onNoteUpdate({
                  ...note,
                  linkedConcepts: note.linkedConcepts.filter((l) => l.conceptId !== conceptId),
                  updatedAt: Date.now(),
                });
              }}
              onUpdateLinkType={(conceptId, linkType) => {
                onNoteUpdate({
                  ...note,
                  linkedConcepts: note.linkedConcepts.map((l) =>
                    l.conceptId === conceptId ? { ...l, linkType } : l
                  ),
                  updatedAt: Date.now(),
                });
              }}
            />
          </div>
        )}

        {/* Reasoning Blocks Tab */}
        {activeTab === 'reasoning' && (
          <div className="p-4">
            <ReasoningBlocksPanel
              blocks={note.reasoningBlocks}
              onAddBlock={handleAddReasoningBlock}
              onUpdateBlock={handleUpdateReasoningBlock}
              onRemoveBlock={(blockId) => {
                onNoteUpdate({
                  ...note,
                  reasoningBlocks: note.reasoningBlocks.filter((b) => b.id !== blockId),
                  updatedAt: Date.now(),
                });
              }}
            />
          </div>
        )}

        {/* Decision Rules Tab */}
        {activeTab === 'rules' && (
          <div className="p-4">
            <DecisionRuleBuilder
              existingRules={note.decisionRules}
              linkedConcepts={note.linkedConcepts}
              onSaveRule={(rule) => {
                onNoteUpdate({
                  ...note,
                  decisionRules: [...note.decisionRules, rule],
                  updatedAt: Date.now(),
                });
                onDecisionRuleSave(rule);
              }}
              onSendToStudyMode={onSendToStudyMode}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <button
            onClick={() => onSendToStudyMode(note.linkedConcepts.map((l) => l.conceptId))}
            disabled={note.linkedConcepts.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors disabled:opacity-50"
          >
            <span>🎯</span> Train Linked Concepts
          </button>
        </div>
      </div>
    </div>
  );
};

// Concept Link Panel
const ConceptLinkPanel: React.FC<{
  linkedConcepts: LinkedConcept[];
  availableConcepts: ClinicalInsight[];
  onLinkConcept: (concept: ClinicalInsight) => void;
  onUnlinkConcept: (conceptId: string) => void;
  onUpdateLinkType: (conceptId: string, linkType: LinkedConcept['linkType']) => void;
}> = ({ linkedConcepts, availableConcepts, onLinkConcept, onUnlinkConcept, onUpdateLinkType }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConcepts = availableConcepts.filter(
    (c) =>
      c.concept.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !linkedConcepts.some((l) => l.conceptId === c.id)
  );

  const linkTypeColors: Record<LinkedConcept['linkType'], string> = {
    supports: 'bg-green-100 text-green-700',
    contradicts: 'bg-red-100 text-red-700',
    extends: 'bg-blue-100 text-blue-700',
    example_of: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-4">
      {/* Linked Concepts */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Linked Concepts</h3>
        {linkedConcepts.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No concepts linked yet.</p>
        ) : (
          <div className="space-y-2">
            {linkedConcepts.map((link) => (
              <div
                key={link.conceptId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={link.linkType}
                    onChange={(e) => onUpdateLinkType(link.conceptId, e.target.value as LinkedConcept['linkType'])}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${linkTypeColors[link.linkType]}`}
                  >
                    <option value="supports">Supports</option>
                    <option value="contradicts">Contradicts</option>
                    <option value="extends">Extends</option>
                    <option value="example_of">Example of</option>
                  </select>
                  <span className="text-sm text-gray-800">{link.conceptLabel}</span>
                </div>
                <button
                  onClick={() => onUnlinkConcept(link.conceptId)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search & Add */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Add Concept Link</h3>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search concepts..."
          className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {searchTerm && filteredConcepts.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
            {filteredConcepts.slice(0, 10).map((concept) => (
              <button
                key={concept.id}
                onClick={() => {
                  onLinkConcept(concept);
                  setSearchTerm('');
                }}
                className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm transition-colors"
              >
                {concept.concept}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Reasoning Blocks Panel
const ReasoningBlocksPanel: React.FC<{
  blocks: ReasoningBlock[];
  onAddBlock: (type: ReasoningBlock['type']) => void;
  onUpdateBlock: (blockId: string, content: string) => void;
  onRemoveBlock: (blockId: string) => void;
}> = ({ blocks, onAddBlock, onUpdateBlock, onRemoveBlock }) => {
  const blockConfig: Record<ReasoningBlock['type'], { label: string; icon: string; placeholder: string }> = {
    why_it_matters: {
      label: 'Why It Matters',
      icon: '💡',
      placeholder: 'Explain why this concept is important...',
    },
    when_used: {
      label: 'When Used',
      icon: '⏰',
      placeholder: 'Describe when you would apply this...',
    },
    my_example: {
      label: 'My Example',
      icon: '📝',
      placeholder: 'Write your own example...',
    },
    my_mistake: {
      label: 'My Mistake',
      icon: '❌',
      placeholder: 'Document a mistake you made or could make...',
    },
  };

  return (
    <div className="space-y-4">
      {/* Existing Blocks */}
      {blocks.map((block) => {
        const config = blockConfig[block.type];
        return (
          <div key={block.id} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span>{config.icon}</span> {config.label}
              </span>
              <button
                onClick={() => onRemoveBlock(block.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                ×
              </button>
            </div>
            <textarea
              value={block.content}
              onChange={(e) => onUpdateBlock(block.id, e.target.value)}
              placeholder={config.placeholder}
              className="w-full p-3 text-sm resize-none focus:outline-none min-h-[80px]"
            />
          </div>
        );
      })}

      {/* Add Block Buttons */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Add reasoning block:</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(blockConfig) as ReasoningBlock['type'][]).map((type) => {
            const config = blockConfig[type];
            return (
              <button
                key={type}
                onClick={() => onAddBlock(type)}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm hover:bg-purple-100 transition-colors"
              >
                <span>{config.icon}</span> {config.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Decision Rule Builder
const DecisionRuleBuilder: React.FC<{
  existingRules: DecisionRule[];
  linkedConcepts: LinkedConcept[];
  onSaveRule: (rule: DecisionRule) => void;
  onSendToStudyMode: (conceptIds: string[]) => void;
}> = ({ existingRules, linkedConcepts, onSaveRule, onSendToStudyMode }) => {
  const [ifCondition, setIfCondition] = useState('');
  const [thenAction, setThenAction] = useState('');
  const [confirmWith, setConfirmWith] = useState('');
  const [selectedConcept, setSelectedConcept] = useState('');

  const handleSaveRule = () => {
    if (!ifCondition.trim() || !thenAction.trim()) return;

    const rule: DecisionRule = {
      id: `rule_${Date.now()}`,
      ifCondition: ifCondition.trim(),
      thenAction: thenAction.trim(),
      confirmWith: confirmWith.trim() || undefined,
      conceptId: selectedConcept,
      timesApplied: 0,
      successRate: 0,
      isActive: true,
    };

    onSaveRule(rule);
    setIfCondition('');
    setThenAction('');
    setConfirmWith('');
  };

  return (
    <div className="space-y-4">
      {/* Existing Rules */}
      {existingRules.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Your Decision Rules</h3>
          <div className="space-y-2">
            {existingRules.map((rule) => (
              <div
                key={rule.id}
                className="p-3 bg-green-50 rounded-lg border border-green-200"
              >
                <div className="text-sm space-y-1">
                  <div className="flex gap-2">
                    <span className="font-semibold text-green-700">IF:</span>
                    <span>{rule.ifCondition}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold text-green-700">THEN:</span>
                    <span>{rule.thenAction}</span>
                  </div>
                  {rule.confirmWith && (
                    <div className="flex gap-2">
                      <span className="font-semibold text-green-700">CONFIRM:</span>
                      <span>{rule.confirmWith}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule Builder */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Build New Decision Rule</h3>

        <div className="space-y-3">
          {linkedConcepts.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Link to concept:</label>
              <select
                value={selectedConcept}
                onChange={(e) => setSelectedConcept(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">No link</option>
                {linkedConcepts.map((link) => (
                  <option key={link.conceptId} value={link.conceptId}>
                    {link.conceptLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              <span className="font-semibold text-green-700">IF</span> (condition):
            </label>
            <input
              type="text"
              value={ifCondition}
              onChange={(e) => setIfCondition(e.target.value)}
              placeholder="Patient presents with..."
              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              <span className="font-semibold text-green-700">THEN</span> (action):
            </label>
            <input
              type="text"
              value={thenAction}
              onChange={(e) => setThenAction(e.target.value)}
              placeholder="Consider diagnosis of..."
              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              <span className="font-semibold text-green-700">CONFIRM</span> (optional):
            </label>
            <input
              type="text"
              value={confirmWith}
              onChange={(e) => setConfirmWith(e.target.value)}
              placeholder="Verify by ordering..."
              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <button
            onClick={handleSaveRule}
            disabled={!ifCondition.trim() || !thenAction.trim()}
            className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Decision Rule
          </button>
        </div>
      </div>
    </div>
  );
};

// Insight Alert Component
const InsightAlert: React.FC<{ insight: DetectedInsight }> = ({ insight }) => {
  const colors = {
    misconception: 'bg-red-50 border-red-200 text-red-700',
    repeated_error: 'bg-orange-50 border-orange-200 text-orange-700',
    breakthrough: 'bg-green-50 border-green-200 text-green-700',
    connection: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  const icons = {
    misconception: '⚠️',
    repeated_error: '🔄',
    breakthrough: '💡',
    connection: '🔗',
  };

  return (
    <div className={`p-3 rounded-lg border ${colors[insight.type]}`}>
      <div className="flex items-start gap-2">
        <span>{icons[insight.type]}</span>
        <div>
          <p className="text-sm font-medium">{insight.description}</p>
          {insight.suggestion && (
            <p className="text-xs mt-1 opacity-80">{insight.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CognitiveNoteLab;
