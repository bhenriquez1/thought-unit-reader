// pages/index.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Book, Settings, Upload, Download, Eye } from 'lucide-react';

// Smart PDF viewer that supports clickable text overlay
const SmartPDFViewer: React.FC<{ 
  fileUrl: string; 
  scale?: number; 
  className?: string;
  onWordClick?: (word: string) => void;
  showTextOverlay?: boolean;
  textContent?: string;
}> = ({ 
  fileUrl, 
  scale = 1.25,
  className = "",
  onWordClick,
  showTextOverlay = false,
  textContent = ""
}) => {
  const [zoom, setZoom] = useState(scale);
  const [showTOC, setShowTOC] = useState(false);
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  
  const pdfViewerUrl = `${fileUrl}#zoom=${Math.round(zoom * 100)}&view=FitH`;

  // Table of Contents items (example structure)
  const tocItems = [
    { page: 1, title: "Introduction", level: 1 },
    { page: 15, title: "Chapter 1: Basic Concepts", level: 1 },
    { page: 45, title: "1.1 Fundamental Principles", level: 2 },
    { page: 68, title: "1.9 Molecular Geometries", level: 2 },
    { page: 89, title: "Chapter 2: Advanced Topics", level: 1 },
    { page: 156, title: "2.1 Chemical Bonding", level: 2 },
    { page: 234, title: "Chapter 3: Applications", level: 1 }
  ];

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* PDF Controls */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        {/* Table of Contents Button */}
        <button
          onClick={() => setShowTOC(!showTOC)}
          className="bg-gray-800 bg-opacity-80 text-white px-3 py-2 rounded-lg hover:bg-opacity-90 transition-all flex items-center space-x-2"
        >
          <span>☰</span>
          <span className="hidden sm:inline">Contents</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2 bg-gray-800 bg-opacity-80 rounded-lg p-2">
          <button onClick={handleZoomOut} className="text-white hover:text-gray-300 p-1">
            <ZoomOut size={16} />
          </button>
          <span className="text-white text-sm min-w-[50px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={handleZoomIn} className="text-white hover:text-gray-300 p-1">
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Table of Contents Sidebar */}
      {showTOC && (
        <div className="absolute top-0 left-0 w-80 h-full bg-gray-900 bg-opacity-95 z-30 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Table of Contents</h3>
              <button
                onClick={() => setShowTOC(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {tocItems.map((item, index) => (
                <div
                  key={index}
                  className={`cursor-pointer hover:bg-gray-700 p-2 rounded text-sm ${
                    item.level === 1 ? 'text-white font-medium' : 'text-gray-300 ml-4'
                  }`}
                  onClick={() => {
                    // Navigate to page functionality
                    console.log(`Navigate to page ${item.page}`);
                  }}
                >
                  <div className="flex justify-between">
                    <span>{item.title}</span>
                    <span className="text-gray-500">{item.page}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text Overlay for Clickable Words (when in hybrid/progressive mode) */}
      {showTextOverlay && textContent && (
        <div className="absolute inset-0 z-10 bg-transparent pointer-events-none">
          <div 
            className="absolute inset-0 p-8 text-transparent pointer-events-auto"
            style={{ fontSize: '14px', lineHeight: '1.6' }}
          >
            {textContent.split(' ').map((word, index) => (
              <span
                key={index}
                className="hover:bg-yellow-400 hover:bg-opacity-30 cursor-pointer pointer-events-auto"
                onClick={() => onWordClick?.(word)}
                style={{ userSelect: 'none' }}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      <iframe
        src={pdfViewerUrl}
        className="w-full h-full border-0"
        style={{ minHeight: '70vh' }}
        title="PDF Document"
      />
    </div>
  );
};

interface ReadingStats {
  wordsRead: number;
  timeElapsed: number; // in seconds
  currentWPM: number;
  averageWPM: number;
  comprehensionScore?: number;
}

interface ThoughtUnit {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  timeSpent: number;
}

export default function ThoughtUnitReader() {
  // Core reading state
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [totalThoughtUnits] = useState(832767); // From your screenshot
  const [readingSpeed, setReadingSpeed] = useState(200); // WPM
  
  // Reading statistics
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 200,
    averageWPM: 200
  });
  
  // UI State
  const [aiEnabled, setAiEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'progressive' | 'hybrid'>('progressive');
  
  // Typography settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('OpenDyslexic');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState('Progressive View');
  
  // PDF specific state
  const [showTableOfContents, setShowTableOfContents] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(1423); // From your screenshot
  const [currentPage, setCurrentPage] = useState(68); // From your screenshot
  
  // File handling
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  
  // Reading content and thought units
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [highlightedWord, setHighlightedWord] = useState<string>('Use'); // From your screenshot
  
  // Refs for reading functionality
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Sample text content (replace with your actual content)
  const sampleText = `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com. Access to the eBook is limited to the first individual who redeems the PIN, located on the inside cover of this book, at expertconsult.inkling.com and may not be transferred to another party by resale, lending, or other means.`;

  // Initialize thought units from text
  useEffect(() => {
    if (textContent || sampleText) {
      const content = textContent || sampleText;
      const words = content.split(/\s+/);
      const units: ThoughtUnit[] = [];
      
      // Create thought units (approximately 10-15 words each)
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
    }
  }, [textContent]);

  // Reading timer logic
  useEffect(() => {
    if (isReading && !isPaused) {
      readingTimerRef.current = setInterval(() => {
        setStats(prev => {
          const newTimeElapsed = prev.timeElapsed + 1;
          const newCurrentWPM = Math.round((prev.wordsRead / newTimeElapsed) * 60);
          
          return {
            ...prev,
            timeElapsed: newTimeElapsed,
            currentWPM: newCurrentWPM || readingSpeed,
            averageWPM: Math.round((prev.averageWPM + newCurrentWPM) / 2) || readingSpeed
          };
        });
      }, 1000);
    } else {
      if (readingTimerRef.current) {
        clearInterval(readingTimerRef.current);
      }
    }

    return () => {
      if (readingTimerRef.current) {
        clearInterval(readingTimerRef.current);
      }
    };
  }, [isReading, isPaused, readingSpeed]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);

    if (file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      setTextContent(text);
    }
  }, []);

  // Reading control functions
  const handleStartReading = useCallback(() => {
    setIsReading(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
  }, []);

  const handlePauseReading = useCallback(() => {
    setIsPaused(!isPaused);
  }, [isPaused]);

  const handleResetReading = useCallback(() => {
    setIsReading(false);
    setIsPaused(false);
    setCurrentThoughtUnit(1);
    setStats({
      wordsRead: 0,
      timeElapsed: 0,
      currentWPM: readingSpeed,
      averageWPM: readingSpeed
    });
    
    setThoughtUnits(prev => prev.map(unit => ({
      ...unit,
      isCompleted: false,
      timeSpent: 0
    })));
  }, [readingSpeed]);

  // Progressive reading advancement
  const advanceThoughtUnit = useCallback(() => {
    if (currentThoughtUnit < thoughtUnits.length) {
      setCurrentThoughtUnit(prev => prev + 1);
      setStats(prev => ({
        ...prev,
        wordsRead: prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0)
      }));
      
      // Mark current unit as completed
      setThoughtUnits(prev => prev.map(unit => 
        unit.id === currentThoughtUnit 
          ? { ...unit, isCompleted: true }
          : unit
      ));
    }
  }, [currentThoughtUnit, thoughtUnits]);

  // Auto-advance in progressive reading mode
  useEffect(() => {
    if (isReading && !isPaused && viewMode === 'progressive') {
      const wordsPerUnit = thoughtUnits[currentThoughtUnit - 1]?.wordCount || 12;
      const timePerUnit = (wordsPerUnit / readingSpeed) * 60 * 1000; // Convert to milliseconds
      
      const timer = setTimeout(advanceThoughtUnit, timePerUnit);
      return () => clearTimeout(timer);
    }
  }, [isReading, isPaused, viewMode, currentThoughtUnit, readingSpeed, advanceThoughtUnit, thoughtUnits]);

  // Handle word clicks for progressive view switching
  const handleWordClick = useCallback((word: string) => {
    setHighlightedWord(word);
    
    // Only switch to Progressive or Hybrid View based on setting
    if (clickSwitchesTo === 'Progressive View' && viewMode !== 'progressive') {
      setViewMode('progressive');
    } else if (clickSwitchesTo === 'Hybrid View' && viewMode !== 'hybrid') {
      setViewMode('hybrid');
    }
  }, [clickSwitchesTo, viewMode]);

  // Calculate completion percentage
  const completionPercentage = Math.round((currentThoughtUnit / totalThoughtUnits) * 100);

  // Format time display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  // Render content based on view mode
  const renderContent = () => {
    const currentUnit = thoughtUnits[currentThoughtUnit - 1];
    
    // If PDF is loaded, show PDF-based views
    if (fileUrl && uploadedFile?.type === 'application/pdf') {
      switch (viewMode) {
        case 'progressive':
          return (
            <div className="space-y-6">
              {/* Progressive Reading Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
                  <span className="mr-2">⚡</span>
                  Progressive Reading
                </h3>
                <div className="text-sm text-gray-400">
                  Page {currentPage} of {pdfPageCount}
                </div>
              </div>

              {/* Reading Controls */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={isReading ? handlePauseReading : handleStartReading}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                    isReading ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                  } text-white transition-colors`}
                >
                  {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
                  <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
                </button>

                <button
                  onClick={handleResetReading}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <RotateCcw size={16} />
                  <span>Reset</span>
                </button>

                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-300">Speed:</label>
                  <input
                    type="number"
                    value={readingSpeed}
                    onChange={(e) => setReadingSpeed(parseInt(e.target.value) || 200)}
                    className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-center"
                    min="50"
                    max="1000"
                  />
                  <span className="text-sm text-gray-300">WPM</span>
                  <button
                    onClick={() => setReadingSpeed(prev => Math.min(prev + 50, 1000))}
                    className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-600 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{Math.round((currentPage / pdfPageCount) * 100)}%</div>
                  <div className="text-sm opacity-75">Complete</div>
                </div>
                <div className="bg-green-600 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{currentPage}</div>
                  <div className="text-sm opacity-75">Current</div>
                </div>
                <div className="bg-purple-600 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.currentWPM}</div>
                  <div className="text-sm opacity-75">WPM</div>
                </div>
                <div className="bg-red-900 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{formatTime(stats.timeElapsed)}</div>
                  <div className="text-sm opacity-75">Left</div>
                </div>
              </div>

              {/* PDF with Text Overlay for Clicking */}
              <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
                <SmartPDFViewer 
                  fileUrl={fileUrl} 
                  scale={1.25}
                  onWordClick={handleWordClick}
                  showTextOverlay={true}
                  textContent={sampleText}
                />
              </div>
            </div>
          );

        case 'hybrid':
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PDF View */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <h4 className="text-sm font-semibold text-gray-300 p-3 border-b border-gray-700">PDF View</h4>
                <div style={{ height: '50vh' }}>
                  <SmartPDFViewer 
                    fileUrl={fileUrl} 
                    scale={1.0}
                    onWordClick={handleWordClick}
                    showTextOverlay={true}
                    textContent={sampleText}
                  />
                </div>
              </div>

              {/* Progressive Reading View */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive Reading</h4>
                
                {/* Mini Reading Controls */}
                <div className="flex items-center space-x-2 mb-4">
                  <button
                    onClick={isReading ? handlePauseReading : handleStartReading}
                    className={`px-3 py-1 rounded text-sm flex items-center space-x-1 ${
                      isReading ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                    } text-white transition-colors`}
                  >
                    {isReading && !isPaused ? <Pause size={12} /> : <Play size={12} />}
                    <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
                  </button>
                  <span className="text-xs text-gray-400">{readingSpeed} WPM</span>
                </div>

                {/* Current Thought Unit */}
                {currentUnit && (
                  <div className="text-lg leading-relaxed">
                    {currentUnit.text.split(' ').map((word, index) => (
                      <span
                        key={index}
                        className={`${
                          word === highlightedWord 
                            ? 'bg-yellow-400 text-black px-1 rounded' 
                            : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                        } transition-colors`}
                        onClick={() => handleWordClick(word)}
                      >
                        {word}{' '}
                      </span>
                    ))}
                  </div>
                )}

                {/* Progress Info */}
                <div className="mt-4 text-sm text-gray-400">
                  <p>Thought Unit {currentThoughtUnit} of {thoughtUnits.length}</p>
                  <p>Page {currentPage} of {pdfPageCount}</p>
                </div>
              </div>
            </div>
          );

        default: // original view for PDF
          return (
            <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '70vh' }}>
              <SmartPDFViewer 
                fileUrl={fileUrl} 
                scale={1.25}
                onWordClick={handleWordClick}
                showTextOverlay={false}
              />
            </div>
          );
      }
    }

    // Text-based views (when no PDF is loaded)
    switch (viewMode) {
      case 'progressive':
        return (
          <div className="space-y-6">
            {/* Progressive Reading Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
                <span className="mr-2">⚡</span>
                Progressive Reading
              </h3>
              <div className="text-sm text-gray-400">
                Thought Unit {currentThoughtUnit} of {totalThoughtUnits.toLocaleString()}
              </div>
            </div>

            {/* Reading Controls */}
            <div className="flex items-center space-x-4">
              <button
                onClick={isReading ? handlePauseReading : handleStartReading}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                  isReading ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                } text-white transition-colors`}
              >
                {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
                <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
              </button>

              <button
                onClick={handleResetReading}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
              >
                <RotateCcw size={16} />
                <span>Reset</span>
              </button>

              <button
                onClick={() => {/* Add bookmark functionality */}}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Bookmark
              </button>

              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-300">Speed:</label>
                <input
                  type="number"
                  value={readingSpeed}
                  onChange={(e) => setReadingSpeed(parseInt(e.target.value) || 200)}
                  className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-center"
                  min="50"
                  max="1000"
                />
                <span className="text-sm text-gray-300">WPM</span>
                <button
                  onClick={() => setReadingSpeed(prev => Math.min(prev + 50, 1000))}
                  className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                >
                  +
                </button>
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-600 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{completionPercentage}%</div>
                <div className="text-sm opacity-75">Complete</div>
              </div>
              <div className="bg-green-600 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{currentThoughtUnit}</div>
                <div className="text-sm opacity-75">Current</div>
              </div>
              <div className="bg-purple-600 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{stats.currentWPM}</div>
                <div className="text-sm opacity-75">WPM</div>
              </div>
              <div className="bg-red-900 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{formatTime(stats.timeElapsed)}</div>
                <div className="text-sm opacity-75">Left</div>
              </div>
            </div>

            {/* Current Thought Unit Display */}
            {currentUnit && (
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="text-lg leading-relaxed" style={{ 
                  fontSize: `${fontSize}px`, 
                  fontFamily: fontFamily,
                  lineHeight: lineSpacing 
                }}>
                  {currentUnit.text.split(' ').map((word, index) => (
                    <span
                      key={index}
                      className={`${
                        word === highlightedWord 
                          ? 'bg-yellow-400 text-black px-1 rounded' 
                          : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                      } transition-colors`}
                      onClick={() => handleWordClick(word)}
                    >
                      {word}{' '}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'original':
        return (
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="prose prose-invert max-w-none" style={{ 
              fontSize: `${fontSize}px`, 
              fontFamily: fontFamily,
              lineHeight: lineSpacing 
            }}>
              {(textContent || sampleText).split(' ').map((word, index) => (
                <span
                  key={index}
                  className={`${
                    word === highlightedWord 
                      ? 'bg-yellow-400 text-black px-1 rounded' 
                      : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                  } transition-colors`}
                  onClick={() => handleWordClick(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>
          </div>
        );

      case 'hybrid':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Text */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Original View</h4>
              <div className="text-sm leading-relaxed">
                {(textContent || sampleText).split(' ').map((word, index) => (
                  <span
                    key={index}
                    className={`${
                      word === highlightedWord 
                        ? 'bg-yellow-400 text-black px-1 rounded' 
                        : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                    } transition-colors`}
                    onClick={() => handleWordClick(word)}
                  >
                    {word}{' '}
                  </span>
                ))}
              </div>
            </div>

            {/* Progressive View */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive View</h4>
              {currentUnit && (
                <div className="text-lg leading-relaxed">
                  {currentUnit.text.split(' ').map((word, index) => (
                    <span
                      key={index}
                      className={`${
                        word === highlightedWord 
                          ? 'bg-yellow-400 text-black px-1 rounded' 
                          : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                      } transition-colors`}
                      onClick={() => handleWordClick(word)}
                    >
                      {word}{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Header */}
      <header className="text-center py-6 border-b border-gray-700">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-600 bg-clip-text text-transparent">
          Thought-Unit Reader
        </h1>
        <p className="text-gray-400 mt-2">Read deeper, faster, and smarter.</p>
      </header>

      {/* Controls */}
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Top Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Enable AI Mode</span>
              <button
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  aiEnabled ? 'bg-blue-500' : 'bg-gray-600'
                } relative`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  aiEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            <label className="flex items-center space-x-2 bg-pink-500 hover:bg-pink-600 px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <Upload size={16} />
              <span>Upload Book</span>
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.txt,.epub"
              />
            </label>

            <button
              onClick={() => setDebugMode(!debugMode)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Debug
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm">Dark Mode</span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-12 h-6 rounded-full transition-colors ${
                darkMode ? 'bg-blue-500' : 'bg-gray-600'
              } relative`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                darkMode ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Typography Controls */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span>Font:</span>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="bg-gray-700 text-white px-3 py-1 rounded"
            >
              <option value="OpenDyslexic">OpenDyslexic</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Times New Roman, serif">Times New Roman</option>
              <option value="Georgia, serif">Georgia</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span>Size:</span>
            <button
              onClick={() => setFontSize(prev => Math.max(prev - 2, 10))}
              className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-center"
            >
              -
            </button>
            <span className="min-w-[3rem] text-center">{fontSize}px</span>
            <button
              onClick={() => setFontSize(prev => Math.min(prev + 2, 32))}
              className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-center"
            >
              +
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span>Line Spacing:</span>
            <button
              onClick={() => setLineSpacing(prev => Math.max(prev - 0.1, 1.0))}
              className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-center"
            >
              -
            </button>
            <span className="min-w-[3rem] text-center">{lineSpacing.toFixed(1)}x</span>
            <button
              onClick={() => setLineSpacing(prev => Math.min(prev + 0.1, 3.0))}
              className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-center"
            >
              +
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span>Click switches to:</span>
            <select
              value={clickSwitchesTo}
              onChange={(e) => setClickSwitchesTo(e.target.value)}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              <option value="Progressive View">Progressive View</option>
              <option value="Hybrid View">Hybrid View</option>
            </select>
          </div>
        </div>

        {/* View Mode Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('original')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'original' 
                ? 'bg-pink-500 text-white' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            Original View
          </button>
          <button
            onClick={() => setViewMode('progressive')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'progressive' 
                ? 'bg-pink-500 text-white' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            Progressive View
          </button>
          <button
            onClick={() => setViewMode('hybrid')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'hybrid' 
                ? 'bg-pink-500 text-white' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            Hybrid View
          </button>
        </div>

        {/* Tip */}
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
          <div className="flex items-center text-blue-300">
            <span className="mr-2">💡</span>
            <span className="text-sm">Tip: Click on any word below to instantly switch to progressive view!</span>
          </div>
        </div>

        {/* PDF Viewer Controls (if PDF uploaded) */}
        {fileUrl && uploadedFile?.type === 'application/pdf' && (
          <div className="flex items-center justify-center space-x-4 bg-gray-800 p-3 rounded-lg">
            <button
              onClick={() => {/* Implement zoom out */}}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              - Zoom Out
            </button>
            <span className="text-sm">125%</span>
            <button
              onClick={() => {/* Implement zoom in */}}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              + Zoom In
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="bg-gray-800 rounded-lg p-6 min-h-[60vh]">
          {fileUrl && uploadedFile?.type === 'application/pdf' ? (
            <SimplePDFViewer fileUrl={fileUrl} scale={1.25} />
          ) : (
            renderContent()
          )}
        </div>

        {/* Debug Info */}
        {debugMode && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-300 mb-2">Debug Information</h4>
            <div className="text-sm text-yellow-200 grid grid-cols-2 gap-4">
              <div>
                <p>Current Thought Unit: {currentThoughtUnit}</p>
                <p>Total Units: {thoughtUnits.length}</p>
                <p>Reading Speed: {readingSpeed} WPM</p>
                <p>View Mode: {viewMode}</p>
              </div>
              <div>
                <p>Words Read: {stats.wordsRead}</p>
                <p>Time Elapsed: {formatTime(stats.timeElapsed)}</p>
                <p>Current WPM: {stats.currentWPM}</p>
                <p>Highlighted Word: {highlightedWord}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}