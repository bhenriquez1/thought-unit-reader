"use client";

import React, { useState, useMemo, useCallback, memo } from 'react';
import type { Syllabus, SyllabusUnit, AssessmentItem } from '../lib/syllabusEngine';
import type { SmartTOCEntry } from '../lib/smartTocGenerator';
import {
  parseSyllabusText,
  generateSyllabusFromTOC,
  linkSyllabusToBlueprint,
  calculateExamImportance,
  applySyllabusLinks,
} from '../lib/syllabusEngine';

// ============================================================================
// Types
// ============================================================================

interface ExamMapProps {
  /** Book TOC entries (Blueprint) */
  tocEntries: SmartTOCEntry[];
  /** Book title */
  bookTitle: string;
  /** Existing syllabus (if any) */
  existingSyllabus?: Syllabus | null;
  /** Navigate to page */
  onNavigate: (page: number) => void;
  /** Start study session for unit */
  onStudyUnit: (unit: SyllabusUnit) => void;
  /** Save syllabus */
  onSaveSyllabus?: (syllabus: Syllabus) => void;
}

type ViewMode = 'units' | 'assessments' | 'outcomes';

// ============================================================================
// Unit Card Component
// ============================================================================

interface UnitCardProps {
  unit: SyllabusUnit;
  onNavigate: (page: number) => void;
  onStudy: () => void;
}

const UnitCard = memo(function UnitCard({ unit, onNavigate, onStudy }: UnitCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Color based on exam importance
  const importanceColor =
    unit.examImportance >= 70
      ? 'border-red-500/50 bg-red-900/20'
      : unit.examImportance >= 50
      ? 'border-yellow-500/50 bg-yellow-900/20'
      : 'border-gray-700/50 bg-gray-800/30';

  const importanceLabel =
    unit.examImportance >= 70 ? 'High' : unit.examImportance >= 50 ? 'Medium' : 'Low';

  return (
    <div className={`p-4 rounded-lg border ${importanceColor} transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-white mb-1">{unit.title}</h4>
          <div className="flex flex-wrap gap-1">
            {unit.tags.map((tag, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[10px] bg-gray-700/50 text-gray-400 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Importance Badge */}
        <div className="text-right">
          <div
            className={`text-lg font-bold ${
              unit.examImportance >= 70
                ? 'text-red-400'
                : unit.examImportance >= 50
                ? 'text-yellow-400'
                : 'text-gray-400'
            }`}
          >
            {unit.examImportance}%
          </div>
          <div className="text-[10px] text-gray-500">{importanceLabel} Priority</div>
        </div>
      </div>

      {/* Exam Weight Bar */}
      <div className="mt-3">
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              unit.examImportance >= 70
                ? 'bg-red-500'
                : unit.examImportance >= 50
                ? 'bg-yellow-500'
                : 'bg-gray-500'
            }`}
            style={{ width: `${unit.examImportance}%` }}
          />
        </div>
      </div>

      {/* Linked Pages */}
      {unit.linkedPages && (
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => onNavigate(unit.linkedPages!.startPage)}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Pages {unit.linkedPages.startPage}-{unit.linkedPages.endPage} →
          </button>
          <button
            onClick={onStudy}
            className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
          >
            Study
          </button>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/30 space-y-2">
          {unit.description && (
            <p className="text-xs text-gray-400">{unit.description}</p>
          )}
          {unit.topics.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Topics:</p>
              <div className="flex flex-wrap gap-1">
                {unit.topics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 text-[10px] bg-purple-600/20 text-purple-300 rounded"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
          {unit.weekNumber && (
            <p className="text-xs text-gray-500">Week {unit.weekNumber}</p>
          )}
        </div>
      )}

      {/* Expand Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-[10px] text-gray-500 hover:text-gray-300"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
});

// ============================================================================
// Assessment Card Component
// ============================================================================

const AssessmentCard = memo(function AssessmentCard({
  assessment,
}: {
  assessment: AssessmentItem;
}) {
  const typeColors: Record<AssessmentItem['type'], string> = {
    exam: 'bg-red-600/30 text-red-300',
    quiz: 'bg-orange-600/30 text-orange-300',
    assignment: 'bg-blue-600/30 text-blue-300',
    project: 'bg-green-600/30 text-green-300',
    participation: 'bg-gray-600/30 text-gray-300',
  };

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs rounded ${typeColors[assessment.type]}`}>
            {assessment.type}
          </span>
          <span className="text-sm text-white">{assessment.name}</span>
        </div>
        <span className="text-lg font-bold text-purple-400">{assessment.weight}%</span>
      </div>
      {assessment.date && (
        <p className="mt-1 text-xs text-gray-500">{assessment.date}</p>
      )}
    </div>
  );
});

// ============================================================================
// Syllabus Upload Component
// ============================================================================

interface SyllabusUploadProps {
  onParse: (syllabus: Partial<Syllabus>) => void;
}

const SyllabusUpload = memo(function SyllabusUpload({ onParse }: SyllabusUploadProps) {
  const [text, setText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      setText(content);
      const parsed = parseSyllabusText(content);
      onParse(parsed);
    },
    [onParse]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="p-4 space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p className="text-sm text-gray-400 mb-2">
          Drop syllabus file here (PDF, TXT, MD)
        </p>
        <p className="text-xs text-gray-500">or</p>
        <label className="mt-2 inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded cursor-pointer transition-colors">
          Choose File
          <input
            type="file"
            accept=".pdf,.txt,.md,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-2">Or paste syllabus text:</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your syllabus content here..."
          className="w-full h-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
        />
        {text.trim() && (
          <button
            onClick={() => {
              const parsed = parseSyllabusText(text);
              onParse(parsed);
            }}
            className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded transition-colors"
          >
            Parse Syllabus
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Main Exam Map Component
// ============================================================================

export const ExamMap = memo(function ExamMap({
  tocEntries,
  bookTitle,
  existingSyllabus,
  onNavigate,
  onStudyUnit,
  onSaveSyllabus,
}: ExamMapProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('units');
  const [showUpload, setShowUpload] = useState(false);
  const [parsedSyllabus, setParsedSyllabus] = useState<Partial<Syllabus> | null>(null);

  // Generate or use existing syllabus
  const syllabus = useMemo(() => {
    // Priority 1: Existing syllabus
    if (existingSyllabus) {
      return calculateExamImportance(existingSyllabus);
    }

    // Priority 2: Parsed from upload
    if (parsedSyllabus && parsedSyllabus.units && parsedSyllabus.units.length > 0) {
      const full: Syllabus = {
        id: `syllabus-${Date.now()}`,
        courseTitle: parsedSyllabus.courseTitle || bookTitle,
        outcomes: parsedSyllabus.outcomes || [],
        assessments: parsedSyllabus.assessments || [],
        units: parsedSyllabus.units || [],
        source: 'uploaded',
        createdAt: Date.now(),
      };

      // Link to blueprint and calculate importance
      const links = linkSyllabusToBlueprint(full, tocEntries);
      const linked = applySyllabusLinks(full, links, tocEntries);
      return calculateExamImportance(linked);
    }

    // Priority 3: Auto-generate from TOC
    if (tocEntries.length > 0) {
      const auto = generateSyllabusFromTOC(tocEntries, bookTitle);
      return calculateExamImportance(auto);
    }

    return null;
  }, [existingSyllabus, parsedSyllabus, tocEntries, bookTitle]);

  // Sort units by exam importance
  const sortedUnits = useMemo(() => {
    if (!syllabus) return [];
    return [...syllabus.units].sort((a, b) => b.examImportance - a.examImportance);
  }, [syllabus]);

  // Handle parsed syllabus
  const handleParsedSyllabus = useCallback(
    (parsed: Partial<Syllabus>) => {
      setParsedSyllabus(parsed);
      setShowUpload(false);
    },
    []
  );

  if (!syllabus && tocEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm text-gray-400">No content available</p>
        <p className="text-xs text-gray-500 mt-1">
          Upload a PDF to generate Exam Map
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h2 className="text-sm font-semibold text-white">Exam Map</h2>
            {syllabus?.source && (
              <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-400 rounded">
                {syllabus.source}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {showUpload ? 'Cancel' : '+ Upload Syllabus'}
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-1">
          {(['units', 'assessments', 'outcomes'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs rounded transition-colors capitalize ${
                viewMode === mode
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Panel */}
      {showUpload && <SyllabusUpload onParse={handleParsedSyllabus} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'units' && syllabus && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="p-3 bg-gray-800/30 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">
                {sortedUnits.length} units · Sorted by exam importance
              </p>
              <div className="flex gap-2">
                <span className="text-xs text-red-400">
                  High: {sortedUnits.filter((u) => u.examImportance >= 70).length}
                </span>
                <span className="text-xs text-yellow-400">
                  Medium: {sortedUnits.filter((u) => u.examImportance >= 50 && u.examImportance < 70).length}
                </span>
                <span className="text-xs text-gray-400">
                  Low: {sortedUnits.filter((u) => u.examImportance < 50).length}
                </span>
              </div>
            </div>

            {/* Unit Cards */}
            {sortedUnits.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                onNavigate={onNavigate}
                onStudy={() => onStudyUnit(unit)}
              />
            ))}
          </div>
        )}

        {viewMode === 'assessments' && syllabus && (
          <div className="space-y-3">
            {syllabus.assessments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No assessments defined
              </p>
            ) : (
              syllabus.assessments.map((assessment) => (
                <AssessmentCard key={assessment.id} assessment={assessment} />
              ))
            )}
          </div>
        )}

        {viewMode === 'outcomes' && syllabus && (
          <div className="space-y-3">
            {syllabus.outcomes.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No learning outcomes defined
              </p>
            ) : (
              syllabus.outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
                >
                  <p className="text-sm text-white">{outcome.description}</p>
                  {outcome.verbs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {outcome.verbs.map((verb, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 text-[10px] bg-blue-600/20 text-blue-300 rounded"
                        >
                          {verb}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {syllabus && onSaveSyllabus && (
        <div className="px-4 py-2 border-t border-gray-700/30">
          <button
            onClick={() => onSaveSyllabus(syllabus)}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            Save Syllabus
          </button>
        </div>
      )}
    </div>
  );
});

export default ExamMap;
