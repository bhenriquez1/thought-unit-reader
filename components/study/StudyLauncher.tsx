import React from 'react';

export type StudyMode =
  | 'quick_recall'
  | 'connection_recall'
  | 'application'
  | 'compare_drill'
  | 'formula_drill';

export type StudyScope = 'page' | 'section' | 'chapter' | 'saved' | 'weak';

export type StudyLauncherProps = {
  scope: {
    documentId: string;
    page?: number;
    chapterId?: string | null;
    sectionId?: string | null;
  };
  availableCounts: {
    recall: number;
    relation: number;
    compare: number;
    application: number;
    formula: number;
  };
  onLaunch: (mode: StudyMode, scope: StudyScope) => void;
};

const MODES: Array<{ id: StudyMode; label: string; countKey: keyof StudyLauncherProps['availableCounts'] }> = [
  { id: 'quick_recall', label: 'Quick Recall', countKey: 'recall' },
  { id: 'connection_recall', label: 'Connection Recall', countKey: 'relation' },
  { id: 'application', label: 'Application', countKey: 'application' },
  { id: 'compare_drill', label: 'Compare', countKey: 'compare' },
  { id: 'formula_drill', label: 'Formula Drill', countKey: 'formula' },
];

export default function StudyLauncher({ scope, availableCounts, onLaunch }: StudyLauncherProps) {
  const hasCards = Object.values(availableCounts).some((count) => count > 0);
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800/70 p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Start Study From</h3>
        <p className="text-xs text-gray-400">Document scope ready: {scope.documentId}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['page', 'section', 'chapter', 'saved', 'weak'] as StudyScope[]).map((studyScope) => (
          <button key={studyScope} onClick={() => onLaunch('quick_recall', studyScope)} className="px-3 py-1.5 rounded-lg bg-gray-700 text-sm text-gray-100 hover:bg-gray-600">
            Study {studyScope}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onLaunch(mode.id, 'page')}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-purple-500"
          >
            <span className="text-sm text-gray-200">{mode.label}</span>
            <span className="text-xs text-purple-300">{availableCounts[mode.countKey]}</span>
          </button>
        ))}
      </div>
      {!hasCards && <p className="text-sm text-amber-300">No saved cards yet — build from current page to start your loop.</p>}
    </div>
  );
}
