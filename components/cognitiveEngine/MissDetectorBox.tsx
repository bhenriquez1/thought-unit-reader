// components/cognitiveEngine/MissDetectorBox.tsx
// Miss Detector - "Why I might miss" + "How to detect next time"

import React, { useState, useEffect } from 'react';
import type { MissDetector } from '@/lib/cognitiveEngine/types';

interface MissDetectorBoxProps {
  missDetector?: MissDetector;
  onUpdate: (missDetector: MissDetector) => void;
  readOnly?: boolean;
}

export const MissDetectorBox: React.FC<MissDetectorBoxProps> = ({
  missDetector,
  onUpdate,
  readOnly = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [whyIMightMiss, setWhyIMightMiss] = useState(missDetector?.whyIMightMiss || '');
  const [howToDetectNextTime, setHowToDetectNextTime] = useState(missDetector?.howToDetectNextTime || '');
  const [closestLookAlike, setClosestLookAlike] = useState(missDetector?.closestLookAlike || '');

  useEffect(() => {
    setWhyIMightMiss(missDetector?.whyIMightMiss || '');
    setHowToDetectNextTime(missDetector?.howToDetectNextTime || '');
    setClosestLookAlike(missDetector?.closestLookAlike || '');
  }, [missDetector]);

  const handleSave = () => {
    onUpdate({
      whyIMightMiss,
      howToDetectNextTime,
      closestLookAlike,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setWhyIMightMiss(missDetector?.whyIMightMiss || '');
    setHowToDetectNextTime(missDetector?.howToDetectNextTime || '');
    setClosestLookAlike(missDetector?.closestLookAlike || '');
    setIsEditing(false);
  };

  const hasContent = missDetector && (
    missDetector.whyIMightMiss ||
    missDetector.howToDetectNextTime ||
    missDetector.closestLookAlike
  );

  // Empty state - prompt to add
  if (!hasContent && !isEditing) {
    if (readOnly) return null;

    return (
      <div
        className="p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-teal-500 transition-colors"
        onClick={() => setIsEditing(true)}
      >
        <div className="text-center text-gray-400">
          <span className="text-2xl block mb-2">🎯</span>
          <p className="text-sm font-medium">Add Miss Detector</p>
          <p className="text-xs mt-1">
            Why might you miss this? How will you catch it next time?
          </p>
        </div>
      </div>
    );
  }

  // Editing state
  if (isEditing) {
    return (
      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🎯</span>
          <h4 className="font-medium text-white">Miss Detector</h4>
        </div>

        <div className="space-y-4">
          {/* Why I might miss */}
          <div>
            <label className="block text-xs font-semibold text-red-400 uppercase mb-1">
              Why I might miss this
            </label>
            <textarea
              value={whyIMightMiss}
              onChange={(e) => setWhyIMightMiss(e.target.value)}
              placeholder="e.g., Similar presentation to X, subtle finding, easy to overlook when..."
              className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded resize-none"
              rows={2}
            />
          </div>

          {/* How to detect next time */}
          <div>
            <label className="block text-xs font-semibold text-green-400 uppercase mb-1">
              How to detect next time
            </label>
            <textarea
              value={howToDetectNextTime}
              onChange={(e) => setHowToDetectNextTime(e.target.value)}
              placeholder="e.g., Always check for X, look for this specific finding, use this mnemonic..."
              className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded resize-none"
              rows={2}
            />
          </div>

          {/* Closest look-alike */}
          <div>
            <label className="block text-xs font-semibold text-amber-400 uppercase mb-1">
              Closest look-alike (what it&apos;s confused with)
            </label>
            <textarea
              value={closestLookAlike}
              onChange={(e) => setClosestLookAlike(e.target.value)}
              placeholder="e.g., Often confused with Y because of similar Z"
              className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded resize-none"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-sm font-medium"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Display state
  return (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h4 className="font-medium text-white">Miss Detector</h4>
        </div>
        {!readOnly && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            Edit
          </button>
        )}
      </div>

      <div className="space-y-3">
        {missDetector?.whyIMightMiss && (
          <div className="p-2 bg-red-900/20 rounded border-l-2 border-red-500">
            <p className="text-xs font-semibold text-red-400 uppercase mb-1">
              Why I might miss
            </p>
            <p className="text-sm text-gray-200">{missDetector.whyIMightMiss}</p>
          </div>
        )}

        {missDetector?.howToDetectNextTime && (
          <div className="p-2 bg-green-900/20 rounded border-l-2 border-green-500">
            <p className="text-xs font-semibold text-green-400 uppercase mb-1">
              How to detect next time
            </p>
            <p className="text-sm text-gray-200">{missDetector.howToDetectNextTime}</p>
          </div>
        )}

        {missDetector?.closestLookAlike && (
          <div className="p-2 bg-amber-900/20 rounded border-l-2 border-amber-500">
            <p className="text-xs font-semibold text-amber-400 uppercase mb-1">
              Closest look-alike
            </p>
            <p className="text-sm text-gray-200">{missDetector.closestLookAlike}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissDetectorBox;
