import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';

const ProgressiveView = dynamic(() => import('@/components/ProgressiveView'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Progressive View...</div>,
});
const HybridReader = dynamic(() => import('@/components/HybridReader'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Hybrid Reader...</div>,
});

interface ThoughtUnit {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  timeSpent: number;
}

interface ReadingStats {
  wordsRead: number;
  timeElapsed: number;
  currentWPM: number;
  averageWPM: number;
}

export default function ThoughtUnitReader() {
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const totalThoughtUnits = 832767;
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 200,
    averageWPM: 200,
  });
  const [viewMode, setViewMode] = useState<'original' | 'progressive' | 'hybrid' | 'rightbrain'>('progressive');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [highlightedWord, setHighlightedWord] = useState('Use');
  const [currentPage, setCurrentPage] = useState(68);
  const [pdfPageCount] = useState(1423);
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const sampleText = `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com...`;

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);

  useEffect(() => {
    const content = textContent || sampleText;
    const words = content.split(/\s+/);
    const units: ThoughtUnit[] = [];
    for (let i = 0; i < words.length; i += 12) {
      const unitWords = words.slice(i, i + 12);
      units.push({
        id: Math.floor(i / 12) + 1,
        text: unitWords.join(' '),
        wordCount: unitWords.length,
        isCompleted: false,
        timeSpent: 0,
      });
    }
    setThoughtUnits(units);
  }, [textContent]);

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
            averageWPM: Math.round((prev.averageWPM + newCurrentWPM) / 2) || readingSpeed,
          };
        });
      }, 1000);
    } else if (readingTimerRef.current) {
      clearInterval(readingTimerRef.current);
    }
    return () => {
      if (readingTimerRef.current) clearInterval(readingTimerRef.current);
    };
  }, [isReading, isPaused, readingSpeed]);

  const handleStartReading = useCallback(() => {
    setIsReading(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
  }, []);

  const handlePauseReading = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const handleResetReading = useCallback(() => {
    setIsReading(false);
    setIsPaused(false);
    setCurrentThoughtUnit(1);
    setStats({
      wordsRead: 0,
      timeElapsed: 0,
      currentWPM: readingSpeed,
      averageWPM: readingSpeed,
    });
    setThoughtUnits(prev => prev.map(u => ({ ...u, isCompleted: false, timeSpent: 0 })));
  }, [readingSpeed]);

  const advanceThoughtUnit = useCallback(() => {
    if (currentThoughtUnit < thoughtUnits.length) {
      setCurrentThoughtUnit(prev => prev + 1);
      setStats(prev => ({
        ...prev,
        wordsRead: prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0),
      }));
      setThoughtUnits(prev =>
        prev.map(u => (u.id === currentThoughtUnit ? { ...u, isCompleted: true } : u))
      );
    }
  }, [currentThoughtUnit, thoughtUnits]);

  useEffect(() => {
    if (isReading && !isPaused && viewMode === 'progressive') {
      const wordsPerUnit = thoughtUnits[currentThoughtUnit - 1]?.wordCount || 12;
      const timePerUnit = (wordsPerUnit / readingSpeed) * 60 * 1000;
      const timer = setTimeout(advanceThoughtUnit, timePerUnit);
      return () => clearTimeout(timer);
    }
  }, [isReading, isPaused, viewMode, currentThoughtUnit, readingSpeed, advanceThoughtUnit, thoughtUnits]);

  const handleWordClick = useCallback(
    (word: string) => {
      setHighlightedWord(word);
      if (viewMode !== 'progressive') setViewMode('progressive');
    },
    [viewMode]
  );

  const completionPercentage = Math.round((currentThoughtUnit / totalThoughtUnits) * 100);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    if (file.type === 'application/pdf') {
      setFileUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      setTextContent(text);
    }
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="text-center py-6 border-b border-gray-700">
        <h1 className="text-3xl font-bold">Thought-Unit Reader</h1>
        <p className="text-gray-400 mt-2">Read deeper, faster, and smarter.</p>
      </header>
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex gap-4 mb-4">
          <label className="flex items-center space-x-2 bg-pink-500 px-4 py-2 rounded-lg cursor-pointer">
            <Upload size={16} /> <span>Upload Book</span>
            <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.epub" />
          </label>
          <button onClick={() => setViewMode('progressive')} className="px-4 py-2 bg-pink-500 rounded">
            Progressive
          </button>
          <button onClick={() => setViewMode('hybrid')} className="px-4 py-2 bg-pink-500 rounded">
            Hybrid
          </button>
          <button onClick={() => setViewMode('original')} className="px-4 py-2 bg-pink-500 rounded">
            Original
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {viewMode === 'progressive' && (
            <ProgressiveView
              isReading={isReading}
              isPaused={isPaused}
              handleStartReading={handleStartReading}
              handlePauseReading={handlePauseReading}
              handleResetReading={handleResetReading}
              readingSpeed={readingSpeed}
              setReadingSpeed={setReadingSpeed}
              currentThoughtUnit={currentThoughtUnit}
              thoughtUnits={thoughtUnits}
              highlightedWord={highlightedWord}
              handleWordClick={handleWordClick}
              stats={stats}
              completionPercentage={completionPercentage}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              fileUrl={fileUrl}
              sampleText={sampleText}
              onPageChange={setCurrentPage}
            />
          )}
          {viewMode === 'hybrid' && (
            <HybridReader
              isReading={isReading}
              isPaused={isPaused}
              handleStartReading={handleStartReading}
              handlePauseReading={handlePauseReading}
              readingSpeed={readingSpeed}
              currentThoughtUnit={currentThoughtUnit}
              thoughtUnits={thoughtUnits}
              highlightedWord={highlightedWord}
              handleWordClick={handleWordClick}
              stats={stats}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              fileUrl={fileUrl}
              sampleText={sampleText}
              onPageChange={setCurrentPage}
            />
          )}
          {viewMode === 'original' && (
            <div className="p-6">
              <div className="prose prose-invert max-w-none">
                {(textContent || sampleText)
                  .split(/\s+/)
                  .map((word, i) => (
                    <span
                      key={i}
                      className={
                        word === highlightedWord
                          ? 'bg-yellow-400 text-black px-1 rounded'
                          : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                      }
                      onClick={() => handleWordClick(word)}
                    >
                      {word}{' '}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}