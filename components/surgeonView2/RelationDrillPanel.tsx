// components/surgeonView2/RelationDrillPanel.tsx
// Study Tab: Drill Relation Triples (not definitions)
// Drill modes: Subject→Object, Subject→Predicate, Cluster→Members

import React, { useState, useMemo, useCallback, memo } from 'react';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import type { Relation, Concept, PatternCluster, PatternClusterKind } from '@/lib/relationshipSchema/types';

// ============================================================================
// Types
// ============================================================================

type DrillMode = 'queue' | 'active' | 'results';
type DrillType = 'object' | 'predicate' | 'cluster';

interface DrillCard {
  id: string;
  type: DrillType;
  // For relation drills
  relation?: Relation;
  subject?: Concept;
  object?: Concept;
  predicate?: string;
  // For cluster drills
  cluster?: PatternCluster;
  clusterRelations?: Relation[];
  // Drill presentation
  prompt: string;
  answer: string;
  hints?: string[];
  // Tracking
  attempts: number;
  correctCount: number;
  lastAttempt?: 'correct' | 'incorrect';
  pageIndex?: number;
}

interface DrillSession {
  startedAt: number;
  cards: DrillCard[];
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
}

interface RelationDrillPanelProps {
  onJumpToPage?: (page: number) => void;
}

// ============================================================================
// Drill Card Generators
// ============================================================================

function generateObjectDrill(
  relation: Relation,
  concepts: Record<string, Concept>
): DrillCard | null {
  const subject = concepts[relation.subjId];
  const object = concepts[relation.objId];
  if (!subject || !object) return null;

  return {
    id: `drill_obj_${relation.id}`,
    type: 'object',
    relation,
    subject,
    object,
    predicate: relation.predicate,
    prompt: `"${subject.label}" ${relation.predicate} ___?`,
    answer: object.label,
    hints: object.aliases?.slice(0, 2) || [],
    attempts: 0,
    correctCount: 0,
    pageIndex: relation.evidence?.[0]?.page,
  };
}

function generatePredicateDrill(
  relation: Relation,
  concepts: Record<string, Concept>
): DrillCard | null {
  const subject = concepts[relation.subjId];
  const object = concepts[relation.objId];
  if (!subject || !object) return null;

  return {
    id: `drill_pred_${relation.id}`,
    type: 'predicate',
    relation,
    subject,
    object,
    predicate: relation.predicate,
    prompt: `"${subject.label}" ___ "${object.label}"`,
    answer: relation.predicate.replace(/_/g, ' '),
    hints: [],
    attempts: 0,
    correctCount: 0,
    pageIndex: relation.evidence?.[0]?.page,
  };
}

function generateClusterDrill(
  cluster: PatternCluster,
  relations: Record<string, Relation>,
  concepts: Record<string, Concept>
): DrillCard | null {
  const clusterRelations = cluster.relationIds
    .map(id => relations[id])
    .filter(Boolean);

  if (clusterRelations.length === 0) return null;

  const answerParts = clusterRelations.slice(0, 3).map(r => {
    const subj = concepts[r.subjId]?.label || '?';
    const obj = concepts[r.objId]?.label || '?';
    return `${subj} ${r.predicate.replace(/_/g, ' ')} ${obj}`;
  });

  return {
    id: `drill_cluster_${cluster.id}`,
    type: 'cluster',
    cluster,
    clusterRelations,
    prompt: `List relationships in "${cluster.title}" (${cluster.kind}):`,
    answer: answerParts.join('\n'),
    hints: [`Contains ${clusterRelations.length} relationships`],
    attempts: 0,
    correctCount: 0,
  };
}

// ============================================================================
// Drill Queue Component
// ============================================================================

const DrillQueue = memo(function DrillQueue({
  relationCount,
  clusterCount,
  dueCount,
  onStartDrill,
  filterByKind,
  onFilterByKind,
}: {
  relationCount: number;
  clusterCount: number;
  dueCount: number;
  onStartDrill: (type: 'all' | 'relations' | 'clusters') => void;
  filterByKind?: PatternClusterKind;
  onFilterByKind: (kind: PatternClusterKind | undefined) => void;
}) {
  return (
    <div className="flex flex-col h-full p-4">
      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 bg-gray-800/60 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-400">{relationCount}</div>
          <div className="text-xs text-gray-400">Relations</div>
        </div>
        <div className="p-3 bg-gray-800/60 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-400">{clusterCount}</div>
          <div className="text-xs text-gray-400">Clusters</div>
        </div>
        <div className="p-3 bg-gray-800/60 rounded-lg text-center">
          <div className="text-2xl font-bold text-yellow-400">{dueCount}</div>
          <div className="text-xs text-gray-400">Due</div>
        </div>
      </div>

      {/* Cluster Kind Filter */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">Filter by pattern type:</div>
        <div className="flex flex-wrap gap-1">
          {(['process', 'causal', 'diagnostic', 'risk', 'exception'] as PatternClusterKind[]).map(kind => (
            <button
              key={kind}
              onClick={() => onFilterByKind(filterByKind === kind ? undefined : kind)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filterByKind === kind
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>

      {/* Drill Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => onStartDrill('all')}
          disabled={relationCount + clusterCount === 0}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          Start Drill ({relationCount + clusterCount} items)
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onStartDrill('relations')}
            disabled={relationCount === 0}
            className="py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
          >
            Relations Only
          </button>
          <button
            onClick={() => onStartDrill('clusters')}
            disabled={clusterCount === 0}
            className="py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
          >
            Clusters Only
          </button>
        </div>
      </div>

      {/* Empty State */}
      {relationCount + clusterCount === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-4xl mb-3">🔬</div>
          <p className="text-sm text-gray-400">
            No relations extracted yet.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Go to Expert View and extract relations first.
          </p>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Active Drill Component
// ============================================================================

const ActiveDrill = memo(function ActiveDrill({
  session,
  onAnswer,
  onSkip,
  onEnd,
  onJumpToPage,
}: {
  session: DrillSession;
  onAnswer: (isCorrect: boolean) => void;
  onSkip: () => void;
  onEnd: () => void;
  onJumpToPage?: (page: number) => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [userInput, setUserInput] = useState('');

  const currentCard = session.cards[session.currentIndex];
  const progress = ((session.currentIndex + 1) / session.cards.length) * 100;

  const handleReveal = useCallback(() => {
    setShowAnswer(true);
  }, []);

  const handleGrade = useCallback((correct: boolean) => {
    onAnswer(correct);
    setShowAnswer(false);
    setUserInput('');
  }, [onAnswer]);

  const handleJump = useCallback(() => {
    if (currentCard?.pageIndex !== undefined && onJumpToPage) {
      onJumpToPage(currentCard.pageIndex);
    }
  }, [currentCard, onJumpToPage]);

  if (!currentCard) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-gray-400">Session complete!</p>
        <button
          onClick={onEnd}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
        >
          View Results
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs rounded ${
              currentCard.type === 'cluster'
                ? 'bg-blue-600/30 text-blue-300'
                : currentCard.type === 'predicate'
                ? 'bg-green-600/30 text-green-300'
                : 'bg-purple-600/30 text-purple-300'
            }`}>
              {currentCard.type === 'cluster' ? 'Cluster' : currentCard.type === 'predicate' ? 'Predicate' : 'Object'}
            </span>
            <span className="text-xs text-gray-400">
              {session.currentIndex + 1} / {session.cards.length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">{session.correctCount}✓</span>
            <span className="text-red-400">{session.incorrectCount}✗</span>
          </div>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Drill Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Prompt */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 mb-4">
            <p className="text-lg text-center whitespace-pre-wrap">{currentCard.prompt}</p>

            {/* Hints */}
            {currentCard.hints && currentCard.hints.length > 0 && !showAnswer && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-500 mb-1">Hints:</p>
                <div className="flex flex-wrap gap-1">
                  {currentCard.hints.map((hint, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded">
                      {hint}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input / Answer */}
          {!showAnswer ? (
            <div className="space-y-3">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReveal();
                }}
                placeholder="Type your answer..."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                autoFocus
              />
              <button
                onClick={handleReveal}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Show Answer
              </button>
            </div>
          ) : (
            <>
              {/* Answer */}
              <div className="p-6 bg-green-900/20 rounded-xl border border-green-600/30 mb-4">
                <p className="text-xs text-green-400 mb-2">Answer:</p>
                <p className="whitespace-pre-wrap">{currentCard.answer}</p>

                {/* Jump to page */}
                {currentCard.pageIndex !== undefined && onJumpToPage && (
                  <button
                    onClick={handleJump}
                    className="mt-3 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Jump to page {currentCard.pageIndex + 1} →
                  </button>
                )}
              </div>

              {/* Grade Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleGrade(false)}
                  className="py-3 bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  Incorrect
                </button>
                <button
                  onClick={() => handleGrade(true)}
                  className="py-3 bg-green-600/80 hover:bg-green-500 text-white rounded-lg transition-colors"
                >
                  Correct
                </button>
              </div>
            </>
          )}

          {/* Skip */}
          <button
            onClick={onSkip}
            className="w-full mt-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            Skip →
          </button>
        </div>
      </div>

      {/* End Session */}
      <div className="px-4 py-3 border-t border-gray-700/50">
        <button
          onClick={onEnd}
          className="w-full py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          End Session Early
        </button>
      </div>
    </div>
  );
});

// ============================================================================
// Results Component
// ============================================================================

const DrillResults = memo(function DrillResults({
  session,
  onRetry,
  onClose,
}: {
  session: DrillSession;
  onRetry: () => void;
  onClose: () => void;
}) {
  const total = session.cards.length;
  const score = total > 0 ? Math.round((session.correctCount / total) * 100) : 0;
  const duration = Math.round((Date.now() - session.startedAt) / 1000 / 60);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="w-full max-w-sm text-center">
        {/* Score Circle */}
        <div className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl font-bold ${
          score >= 80 ? 'bg-green-600/30 text-green-400' :
          score >= 60 ? 'bg-yellow-600/30 text-yellow-400' :
          'bg-red-600/30 text-red-400'
        }`}>
          {score}%
        </div>

        <h3 className="text-lg font-medium text-white mb-2">
          {score >= 80 ? 'Excellent!' : score >= 60 ? 'Good job!' : 'Keep practicing!'}
        </h3>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-gray-800/60 rounded-lg">
            <div className="text-lg font-bold text-green-400">{session.correctCount}</div>
            <div className="text-xs text-gray-400">Correct</div>
          </div>
          <div className="p-3 bg-gray-800/60 rounded-lg">
            <div className="text-lg font-bold text-red-400">{session.incorrectCount}</div>
            <div className="text-xs text-gray-400">Incorrect</div>
          </div>
          <div className="p-3 bg-gray-800/60 rounded-lg">
            <div className="text-lg font-bold text-blue-400">{duration}m</div>
            <div className="text-xs text-gray-400">Time</div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {score < 80 && (
            <button
              onClick={onRetry}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
            >
              Retry Weak Items
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Back to Queue
          </button>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Main Relation Drill Panel
// ============================================================================

export const RelationDrillPanel = memo(function RelationDrillPanel({
  onJumpToPage,
}: RelationDrillPanelProps) {
  const {
    concepts,
    relations,
    clusters,
    filterByKind,
    filterByConfidence,
    setFilterByKind,
  } = useRelationshipStore();

  const [mode, setMode] = useState<DrillMode>('queue');
  const [session, setSession] = useState<DrillSession | null>(null);

  // Filter relations and clusters
  const filteredRelations = useMemo(() => {
    return Object.values(relations).filter(r => r.confidence >= filterByConfidence);
  }, [relations, filterByConfidence]);

  const filteredClusters = useMemo(() => {
    return Object.values(clusters)
      .filter(c => c.confidence >= filterByConfidence)
      .filter(c => !filterByKind || c.kind === filterByKind);
  }, [clusters, filterByConfidence, filterByKind]);

  // Build drill cards
  const buildDrillCards = useCallback((type: 'all' | 'relations' | 'clusters'): DrillCard[] => {
    const cards: DrillCard[] = [];

    if (type !== 'clusters') {
      // Add relation drills (mix of object and predicate)
      for (const rel of filteredRelations) {
        const objectDrill = generateObjectDrill(rel, concepts);
        if (objectDrill) cards.push(objectDrill);

        // Add predicate drill for high-confidence relations
        if (rel.confidence >= 0.7) {
          const predDrill = generatePredicateDrill(rel, concepts);
          if (predDrill) cards.push(predDrill);
        }
      }
    }

    if (type !== 'relations') {
      // Add cluster drills
      for (const cluster of filteredClusters) {
        const clusterDrill = generateClusterDrill(cluster, relations, concepts);
        if (clusterDrill) cards.push(clusterDrill);
      }
    }

    // Shuffle cards
    return cards.sort(() => Math.random() - 0.5);
  }, [filteredRelations, filteredClusters, concepts, relations]);

  // Start drill session
  const handleStartDrill = useCallback((type: 'all' | 'relations' | 'clusters') => {
    const cards = buildDrillCards(type);
    if (cards.length === 0) return;

    setSession({
      startedAt: Date.now(),
      cards,
      currentIndex: 0,
      correctCount: 0,
      incorrectCount: 0,
    });
    setMode('active');
  }, [buildDrillCards]);

  // Handle answer
  const handleAnswer = useCallback((isCorrect: boolean) => {
    if (!session) return;

    const newSession = {
      ...session,
      currentIndex: session.currentIndex + 1,
      correctCount: isCorrect ? session.correctCount + 1 : session.correctCount,
      incorrectCount: isCorrect ? session.incorrectCount : session.incorrectCount + 1,
    };

    // Update card tracking
    newSession.cards = [...session.cards];
    newSession.cards[session.currentIndex] = {
      ...newSession.cards[session.currentIndex],
      attempts: newSession.cards[session.currentIndex].attempts + 1,
      correctCount: isCorrect
        ? newSession.cards[session.currentIndex].correctCount + 1
        : newSession.cards[session.currentIndex].correctCount,
      lastAttempt: isCorrect ? 'correct' : 'incorrect',
    };

    setSession(newSession);

    // Check if complete
    if (newSession.currentIndex >= newSession.cards.length) {
      setMode('results');
    }
  }, [session]);

  // Skip card
  const handleSkip = useCallback(() => {
    if (!session) return;

    setSession({
      ...session,
      currentIndex: session.currentIndex + 1,
    });

    if (session.currentIndex + 1 >= session.cards.length) {
      setMode('results');
    }
  }, [session]);

  // End session
  const handleEnd = useCallback(() => {
    setMode('results');
  }, []);

  // Retry weak items
  const handleRetry = useCallback(() => {
    if (!session) return;

    const weakCards = session.cards.filter(c => c.lastAttempt === 'incorrect');
    if (weakCards.length === 0) {
      setMode('queue');
      return;
    }

    setSession({
      startedAt: Date.now(),
      cards: weakCards.sort(() => Math.random() - 0.5),
      currentIndex: 0,
      correctCount: 0,
      incorrectCount: 0,
    });
    setMode('active');
  }, [session]);

  // Close results
  const handleClose = useCallback(() => {
    setSession(null);
    setMode('queue');
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔬</span>
          <h2 className="text-sm font-semibold text-white">Relation Drills</h2>
        </div>
        <span className="text-xs text-gray-400">
          {filteredRelations.length} relations • {filteredClusters.length} clusters
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'queue' && (
          <DrillQueue
            relationCount={filteredRelations.length}
            clusterCount={filteredClusters.length}
            dueCount={filteredRelations.length + filteredClusters.length}
            onStartDrill={handleStartDrill}
            filterByKind={filterByKind}
            onFilterByKind={setFilterByKind}
          />
        )}
        {mode === 'active' && session && (
          <ActiveDrill
            session={session}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
            onEnd={handleEnd}
            onJumpToPage={onJumpToPage}
          />
        )}
        {mode === 'results' && session && (
          <DrillResults
            session={session}
            onRetry={handleRetry}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
});

export default RelationDrillPanel;
