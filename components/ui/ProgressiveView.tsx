// components/ProgressiveView.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SmartPDFViewer from '@/components/SmartPDFViewer';
import { Play, Pause, RotateCcw } from 'lucide-react';

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number; // seconds
  currentWPM: number;
  averageWPM: number;
  comprehensionScore?: number;
}

export interface ThoughtUnit {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  timeSpent: number;
}

interface ProgressiveViewProps {
  fileUrl?: string | null;
  textContent?: string;
  initialReadingSpeed?: number;
}

const ProgressiveView: React.FC<ProgressiveViewProps> = ({
  fileUrl = null,
  textContent = '',
  initialReadingSpeed = 200
}) => {
  const sampleText = textContent || `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com. Access to the eBook is limited to the first individual who redeems the PIN, located on the inside cover of this book, at expertconsult.inkling.com and may not be transferred to another party by resale, lending, or other means.`;

  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(initialReadingSpeed);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [highlightedWord, setHighlightedWord] = useState<string>('Use');
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: initialReadingSpeed,
    averageWPM: initialReadingSpeed
  });

  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const words = sampleText.split(/\s+/);
    const units: ThoughtUnit[] = [];
    for (let i = 0; i < words.length; i += 12) {
      const unitWords = words.slice(i, i + 12);
      units.push({
        id: Math.floor(i / 12) + 1,
        text: unitWords.join(' '),
        wordCount: unitWords.length,
        isCompleted: false,
        timeSpent: 0
      });
    }
    setThoughtUnits(units);
  }, [sampleText]);

  useEffect(() => {
    if (isReading && !isPaused) {
      readingTimerRef.current = setInterval(() => {
        setStats(prev => {
          const newTimeElapsed = prev.timeElapsed + 1;
          const newCurrentWPM = Math.round((prev.wordsRead / newTimeElapsed) * 60) || readingSpeed;
          return {
            ...prev,
            timeElapsed: newTimeElapsed,
            currentWPM: newCurrentWPM,
            averageWPM: Math.round((prev.averageWPM + newCurrentWPM) / 2) || readingSpeed
          };
        });
      }, 1000);
    } else {
      if (readingTimerRef.current) clearInterval(readingTimerRef.current);
    }
    return () => {
      if (readingTimerRef.current) clearInterval(readingTimerRef.current);
    };
  }, [isReading, isPaused, readingSpeed]);

  const advanceThoughtUnit = useCallback(() => {
    if (currentThoughtUnit < thoughtUnits.length) {
      setCurrentThoughtUnit(prev => prev + 1);
      setStats(prev => ({
        ...prev,
        wordsRead: prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0)
      }));
      setThoughtUnits(prev => prev.map(unit =>
        unit.id === currentThoughtUnit ? { ...unit, isCompleted: true } : unit
      ));
    }
  }, [currentThoughtUnit, thoughtUnits]);

  useEffect(() => {
    if (isReading && !isPaused) {
      const wordsPerUnit = thoughtUnits[currentThoughtUnit - 1]?.wordCount || 12;
      const timePerUnit = (wordsPerUnit / readingSpeed) * 60 * 1000;
      const timer = setTimeout(advanceThoughtUnit, timePerUnit);
      return () => clearTimeout(timer);
    }
  }, [isReading, isPaused, currentThoughtUnit, readingSpeed, advanceThoughtUnit, thoughtUnits]);

  const handleWordClick = useCallback((word: string) => {
    setHighlightedWord(word);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const currentUnit = thoughtUnits[currentThoughtUnit - 1];
  const completion = Math.round((currentThoughtUnit / (thoughtUnits.length || 1)) * 100);

  return (
    <div className="space-y-6 p-6 bg-gray-800 rounded-lg text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setIsReading(prev => !prev); setIsPaused(false); }}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              isReading && !isPaused ? 'bg-yellow-600' : 'bg-green-600'
            }`}
          >
            {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
            <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
          </button>
          <button
            onClick={() => {
              setIsReading(false);
              setIsPaused(false);
              setCurrentThoughtUnit(1);
              setStats({
                wordsRead: 0,
                timeElapsed: 0,
                currentWPM: readingSpeed,
                averageWPM: readingSpeed
              });
              setThoughtUnits(prev => prev.map(u => ({ ...u, isCompleted: false, timeSpent: 0 })));
            }}
            className="px-4 py-2 bg-gray-600 rounded-lg flex items-center space-x-2"
          >
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        </div>
        <div className="text-sm">
          Completion: {completion}% • WPM: {stats.currentWPM} • Elapsed: {formatTime(stats.timeElapsed)}
        </div>
      </div>

      {currentUnit && (
        <div className="bg-gray-700 p-4 rounded">
          <div className="text-lg leading-relaxed">
            {currentUnit.text.split(' ').map((word, i) => (
              <span
                key={i}
                className={`${
                  word === highlightedWord
                    ? 'bg-yellow-400 text-black px-1 rounded'
                    : 'hover:bg-gray-600 cursor-pointer px-1 rounded'
                } transition-colors`}
                onClick={() => handleWordClick(word)}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {fileUrl && (
        <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '50vh' }}>
          <SmartPDFViewer
            fileUrl={fileUrl}
            scale={1.25}
            onWordClick={handleWordClick}
            showTextOverlay={true}
            textContent={sampleText}
            currentPage={1}
            onPageChange={() => {}}
          />
        </div>
      )}
    </div>
  );
};

export default ProgressiveView;