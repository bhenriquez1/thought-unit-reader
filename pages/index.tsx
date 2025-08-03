// pages/index.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Book, Settings, Upload, Download, Eye } from 'lucide-react';

// Enhanced Table of Contents - Dynamic for any book type
const generateTableOfContents = (bookType: string = 'general', pageCount: number = 1423) => {
  const tocTemplates = {
    medical: [
      { page: 1, title: "Preface", level: 0 },
      { page: 5, title: "Table of Contents", level: 0 },
      { page: 15, title: "Chapter 1: Basic Sciences", level: 1 },
      { page: 16, title: "1.1 Anatomy & Physiology", level: 2 },
      { page: 35, title: "1.2 Pathology", level: 2 },
      { page: 55, title: "1.3 Pharmacology", level: 2 },
      { page: 75, title: "1.4 Microbiology", level: 2 },
      { page: 95, title: "Chapter 2: Clinical Medicine", level: 1 },
      { page: 96, title: "2.1 Diagnostic Methods", level: 2 },
      { page: 120, title: "2.2 Treatment Protocols", level: 2 },
      { page: 145, title: "2.3 Emergency Medicine", level: 2 },
      { page: 170, title: "Chapter 3: Specialties", level: 1 },
      { page: 171, title: "3.1 Internal Medicine", level: 2 },
      { page: 200, title: "3.2 Surgery", level: 2 },
      { page: 230, title: "3.3 Pediatrics", level: 2 },
      { page: 260, title: "3.4 Obstetrics & Gynecology", level: 2 }
    ],
    dental: [
      { page: 1, title: "Introduction to Dentistry", level: 0 },
      { page: 10, title: "Chapter 1: Oral Anatomy", level: 1 },
      { page: 11, title: "1.1 Tooth Morphology", level: 2 },
      { page: 30, title: "1.2 Periodontal Structures", level: 2 },
      { page: 50, title: "1.3 TMJ & Muscles", level: 2 },
      { page: 70, title: "Chapter 2: Oral Pathology", level: 1 },
      { page: 71, title: "2.1 Caries & Pulp Disease", level: 2 },
      { page: 90, title: "2.2 Periodontal Disease", level: 2 },
      { page: 110, title: "2.3 Oral Lesions", level: 2 },
      { page: 130, title: "Chapter 3: Restorative Dentistry", level: 1 },
      { page: 131, title: "3.1 Direct Restorations", level: 2 },
      { page: 160, title: "3.2 Indirect Restorations", level: 2 },
      { page: 190, title: "3.3 Endodontics", level: 2 },
      { page: 220, title: "Chapter 4: Oral Surgery", level: 1 },
      { page: 250, title: "Chapter 5: Orthodontics", level: 1 },
      { page: 280, title: "Chapter 6: Prosthodontics", level: 1 }
    ],
    chemistry: [
      { page: 1, title: "Cover & Title Page", level: 0 },
      { page: 3, title: "Table of Contents", level: 0 },
      { page: 15, title: "Chapter 1: Atomic Structure", level: 1 },
      { page: 16, title: "1.1 Electron Configuration", level: 2 },
      { page: 35, title: "1.2 Periodic Trends", level: 2 },
      { page: 55, title: "Chapter 2: Chemical Bonding", level: 1 },
      { page: 56, title: "2.1 Ionic Bonding", level: 2 },
      { page: 75, title: "2.2 Covalent Bonding", level: 2 },
      { page: 95, title: "2.3 Molecular Geometry", level: 2 },
      { page: 120, title: "Chapter 3: Thermodynamics", level: 1 },
      { page: 145, title: "Chapter 4: Kinetics", level: 1 },
      { page: 170, title: "Chapter 5: Equilibrium", level: 1 }
    ],
    general: [
      { page: 1, title: "Introduction", level: 0 },
      { page: 10, title: "Chapter 1: Fundamentals", level: 1 },
      { page: 35, title: "Chapter 2: Basic Concepts", level: 1 },
      { page: 65, title: "Chapter 3: Advanced Topics", level: 1 },
      { page: 95, title: "Chapter 4: Applications", level: 1 },
      { page: 125, title: "Chapter 5: Case Studies", level: 1 },
      { page: 155, title: "Conclusion", level: 0 }
    ]
  };

  return tocTemplates[bookType as keyof typeof tocTemplates] || tocTemplates.general;
};

// Smart PDF viewer that supports clickable text overlay
const SmartPDFViewer: React.FC<{ 
  fileUrl: string; 
  scale?: number; 
  className?: string;
  onWordClick?: (word: string) => void;
  showTextOverlay?: boolean;
  textContent?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}> = ({ 
  fileUrl, 
  scale = 1.25,
  className = "",
  onWordClick,
  showTextOverlay = false,
  textContent = "",
  currentPage = 68,
  onPageChange
}) => {
  const [zoom, setZoom] = useState(scale);
  const [showTOC, setShowTOC] = useState(false);
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  
  const pdfViewerUrl = `${fileUrl}#zoom=${Math.round(zoom * 100)}&view=FitH`;

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
              {fullTableOfContents.map((item, index) => (
                <div
                  key={index}
                  className={`cursor-pointer hover:bg-gray-700 p-2 rounded text-sm transition-colors ${
                    item.level === 0 ? 'text-gray-400 italic' :
                    item.level === 1 ? 'text-white font-medium bg-gray-800' : 
                    'text-gray-300 ml-4'
                  } ${item.page === currentPage ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => {
                    onPageChange?.(item.page);
                    setShowTOC(false);
                    console.log(`Navigate to page ${item.page}: ${item.title}`);
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
  const [viewMode, setViewMode] = useState<'original' | 'progressive' | 'hybrid' | 'rightbrain'>('progressive');
  
  // Notes feature state
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [noteTemplate, setNoteTemplate] = useState('anatomy');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState({
    anatomy: '',
    physiology: '',
    pathology: '',
    clinical: '',
    keyPoints: '',
    questions: ''
  });
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  
  // Typography settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('OpenDyslexic');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState('Progressive View');
  
  // PDF specific state
  const [showTableOfContents, setShowTableOfContents] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(1423); // From your screenshot
  const [currentPage, setCurrentPage] = useState(68); // From your screenshot
  const [bookType, setBookType] = useState('dental'); // Auto-detect or user select
  const [fullTableOfContents, setFullTableOfContents] = useState(generateTableOfContents('dental', 1423));
  
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

  // Enhanced Medical Notes Templates for Top Student Quality
  const enhancedNoteTemplates = {
    dental: {
      anatomy: "📍 Location & Boundaries\n🔸 Structures & Components\n🔸 Blood Supply & Innervation\n🔸 Embryological Development",
      physiology: "⚡ Normal Function\n🔸 Physiological Processes\n🔸 Regulatory Mechanisms\n🔸 Clinical Correlations",
      pathology: "🚨 Disease Process\n🔸 Etiology & Risk Factors\n🔸 Pathogenesis\n🔸 Clinical Manifestations\n🔸 Complications",
      clinical: "🏥 Diagnosis\n🔸 Clinical Tests & Procedures\n🔸 Treatment Options\n🔸 Prognosis\n🔸 Patient Management",
      keyPoints: "⭐ High-Yield Facts\n🔸 Board Exam Favorites\n🔸 Clinical Pearls\n🔸 Memory Aids & Mnemonics",
      questions: "❓ Self-Assessment\n🔸 Board-Style Questions\n🔸 Clinical Scenarios\n🔸 Differential Diagnosis Exercises"
    },
    medical: {
      anatomy: "📍 Anatomical Location\n🔸 Gross & Microscopic Structure\n🔸 Vascular Supply\n🔸 Nerve Supply\n🔸 Lymphatic Drainage",
      physiology: "⚡ Normal Physiology\n🔸 Biochemical Pathways\n🔸 Homeostatic Mechanisms\n🔸 Integration with Other Systems",
      pathology: "🚨 Pathophysiology\n🔸 Molecular Mechanisms\n🔸 Histopathological Changes\n🔸 Disease Progression\n🔸 Complications",
      clinical: "🏥 Clinical Presentation\n🔸 Diagnostic Workup\n🔸 Treatment Protocols\n🔸 Follow-up & Monitoring\n🔸 Preventive Measures",
      keyPoints: "⭐ Essential Knowledge\n🔸 USMLE High-Yield\n🔸 Clinical Decision Points\n🔸 Red Flags & Warnings",
      questions: "❓ Board Review\n🔸 Case-Based Questions\n🔸 Image Recognition\n🔸 Laboratory Interpretation"
    }
  };

  const getCurrentTemplate = () => {
    return enhancedNoteTemplates[bookType as keyof typeof enhancedNoteTemplates] || enhancedNoteTemplates.medical;
  };

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

    // Auto-detect book type from filename
    const name = file.name.toLowerCase();
    if (name.includes('dental') || name.includes('oral') || name.includes('tooth')) {
      setBookType('dental');
      setFullTableOfContents(generateTableOfContents('dental', pdfPageCount));
    } else if (name.includes('medical') || name.includes('anatomy') || name.includes('physiology')) {
      setBookType('medical');
      setFullTableOfContents(generateTableOfContents('medical', pdfPageCount));
    } else if (name.includes('chemistry') || name.includes('organic') || name.includes('chemical')) {
      setBookType('chemistry');
      setFullTableOfContents(generateTableOfContents('chemistry', pdfPageCount));
    } else {
      setBookType('general');
      setFullTableOfContents(generateTableOfContents('general', pdfPageCount));
    }

    if (file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      setTextContent(text);
    }
  }, [pdfPageCount]);

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

  // Save note function
  const saveNote = () => {
    const newNote = {
      id: Date.now(),
      title: noteTitle || 'Untitled Note',
      template: noteTemplate,
      content: { ...noteContent },
      createdAt: new Date().toISOString(),
      pageReference: currentPage
    };
    setSavedNotes(prev => [...prev, newNote]);
    
    // Reset form
    setNoteTitle('');
    setNoteContent({
      anatomy: '',
      physiology: '',
      pathology: '',
      clinical: '',
      keyPoints: '',
      questions: ''
    });
  };

  // Medical Notes Renderer Component - Top Student Quality
  const MedicalNotesPanel = () => {
    const currentTemplate = getCurrentTemplate();
    
    return (
      <div className="bg-gray-800 p-4 rounded-lg h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-blue-400">📝 {bookType.charAt(0).toUpperCase() + bookType.slice(1)} Notes</h3>
          <div className="flex items-center space-x-2">
            <select
              value={bookType}
              onChange={(e) => {
                setBookType(e.target.value);
                setFullTableOfContents(generateTableOfContents(e.target.value, pdfPageCount));
              }}
              className="text-xs bg-gray-700 text-white rounded px-2 py-1"
            >
              <option value="dental">Dental</option>
              <option value="medical">Medical</option>
              <option value="chemistry">Chemistry</option>
              <option value="general">General</option>
            </select>
            <button
              onClick={() => setShowNotesPanel(!showNotesPanel)}
              className="text-gray-400 hover:text-white"
            >
              {showNotesPanel ? '◐' : '◑'}
            </button>
          </div>
        </div>

        {showNotesPanel && (
          <div className="space-y-4">
            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Study Template</label>
              <select
                value={noteTemplate}
                onChange={(e) => setNoteTemplate(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2"
              >
                <option value="anatomy">📍 Anatomy & Structure</option>
                <option value="pathology">🚨 Pathology & Disease</option>
                <option value="systems">🔬 Systems Review</option>
                <option value="clinical">🏥 Clinical Case</option>
              </select>
            </div>

            {/* Note Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Topic Title</label>
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder={bookType === 'dental' ? "e.g., Tooth Morphology - Premolars" : "e.g., Cardiovascular System - Heart Anatomy"}
                className="w-full bg-gray-700 text-white rounded px-3 py-2"
              />
            </div>

            {/* Enhanced Content Sections */}
            <div className="space-y-3">
              {/* Anatomy/Structure Section */}
              <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded p-3">
                <label className="block text-sm font-medium text-green-400 mb-2">🔬 Structure/Anatomy</label>
                <textarea
                  value={noteContent.anatomy}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, anatomy: e.target.value }))}
                  placeholder={currentTemplate.anatomy}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>

              {/* Physiology/Function Section */}
              <div className="bg-blue-900 bg-opacity-30 border border-blue-600 rounded p-3">
                <label className="block text-sm font-medium text-blue-400 mb-2">⚡ Function/Physiology</label>
                <textarea
                  value={noteContent.physiology}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, physiology: e.target.value }))}
                  placeholder={currentTemplate.physiology}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>

              {/* Pathology Section */}
              <div className="bg-red-900 bg-opacity-30 border border-red-600 rounded p-3">
                <label className="block text-sm font-medium text-red-400 mb-2">⚠️ Pathology/Problems</label>
                <textarea
                  value={noteContent.pathology}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, pathology: e.target.value }))}
                  placeholder={currentTemplate.pathology}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>

              {/* Clinical Section */}
              <div className="bg-purple-900 bg-opacity-30 border border-purple-600 rounded p-3">
                <label className="block text-sm font-medium text-purple-400 mb-2">🏥 Clinical Applications</label>
                <textarea
                  value={noteContent.clinical}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, clinical: e.target.value }))}
                  placeholder={currentTemplate.clinical}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>

              {/* Key Points */}
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3">
                <label className="block text-sm font-medium text-yellow-400 mb-2">⭐ High-Yield Points</label>
                <textarea
                  value={noteContent.keyPoints}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, keyPoints: e.target.value }))}
                  placeholder={currentTemplate.keyPoints}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>

              {/* Study Questions */}
              <div className="bg-gray-700 border border-gray-500 rounded p-3">
                <label className="block text-sm font-medium text-gray-300 mb-2">❓ Board Review Questions</label>
                <textarea
                  value={noteContent.questions}
                  onChange={(e) => setNoteContent(prev => ({ ...prev, questions: e.target.value }))}
                  placeholder={currentTemplate.questions}
                  className="w-full bg-gray-600 text-white rounded px-3 py-2 h-24 text-sm"
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={saveNote}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition-colors"
            >
              💾 Save {bookType.charAt(0).toUpperCase() + bookType.slice(1)} Note (Page {currentPage})
            </button>

            {/* Saved Notes List */}
            {savedNotes.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">📚 Study Notes ({savedNotes.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedNotes.map((note) => (
                    <div key={note.id} className="bg-gray-700 p-2 rounded text-sm cursor-pointer hover:bg-gray-600 transition-colors">
                      <div className="font-medium text-white">{note.title}</div>
                      <div className="text-xs text-gray-400">
                        Page {note.pageReference} • {new Date(note.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-blue-300 mt-1">
                        📍 {note.template} template • Click to review
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }; font-medium text-purple-400 mb-2">🏥 Clinical Applications</label>
              <textarea
                value={noteContent.clinical}
                onChange={(e) => setNoteContent(prev => ({ ...prev, clinical: e.target.value }))}
                placeholder="Real-world applications, examples, significance..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>

            {/* Key Points */}
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3">
              <label className="block text-sm font-medium text-yellow-400 mb-2">⭐ Key Points</label>
              <textarea
                value={noteContent.keyPoints}
                onChange={(e) => setNoteContent(prev => ({ ...prev, keyPoints: e.target.value }))}
                placeholder="Bullet points, must-know facts, memory aids..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>

            {/* Questions */}
            <div className="bg-gray-700 border border-gray-500 rounded p-3">
              <label className="block text-sm font-medium text-gray-300 mb-2">❓ Study Questions</label>
              <textarea
                value={noteContent.questions}
                onChange={(e) => setNoteContent(prev => ({ ...prev, questions: e.target.value }))}
                placeholder="Practice questions, things to review..."
                className="w-full bg-gray-600 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={saveNote}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition-colors"
          >
            💾 Save Note (Page {currentPage})
          </button>

          {/* Saved Notes List */}
          {savedNotes.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-300 mb-2">📚 Saved Notes ({savedNotes.length})</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {savedNotes.map((note) => (
                  <div key={note.id} className="bg-gray-700 p-2 rounded text-sm">
                    <div className="font-medium text-white">{note.title}</div>
                    <div className="text-xs text-gray-400">
                      Page {note.pageReference} • {new Date(note.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
            <div className="space-y-6 p-6">
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
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            </div>
          );

        case 'hybrid':
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* PDF View */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <h4 className="text-sm font-semibold text-gray-300 p-3 border-b border-gray-700">PDF View - Page {currentPage}</h4>
                <div style={{ height: '60vh' }}>
                  <SmartPDFViewer 
                    fileUrl={fileUrl} 
                    scale={1.0}
                    onWordClick={handleWordClick}
                    showTextOverlay={true}
                    textContent={sampleText}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
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

        case 'rightbrain':
          return (
            <div className="p-6">
              {/* Right Brain View Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold text-blue-400 flex items-center">
                  <span className="mr-3">🧠</span>
                  Right Brain View - Creative Notes
                </h3>
                <div className="text-sm text-gray-400">
                  Page {currentPage} Reference
                </div>
              </div>

              {/* Full Medical Notes Interface */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Notes Creation Panel */}
                <div className="space-y-4">
                  <MedicalNotesPanel />
                </div>

                {/* Visual Preview & Study Tools */}
                <div className="space-y-4">
                  {/* Current Page Context */}
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-3">📖 Current Context</h4>
                    <div className="text-sm text-gray-300 leading-relaxed">
                      <p className="mb-2"><strong>Book Type:</strong> {bookType.charAt(0).toUpperCase() + bookType.slice(1)}</p>
                      <p className="mb-2"><strong>Current Section:</strong> {fullTableOfContents.find(item => item.page <= currentPage)?.title || 'Loading...'}</p>
                      <p className="mb-3"><strong>Page:</strong> {currentPage} of {pdfPageCount}</p>
                      <div className="bg-gray-700 p-3 rounded italic">
                        {(textContent || sampleText).substring(0, 200)}...
                      </div>
                    </div>
                  </div>

                  {/* Enhanced Study Cards */}
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-purple-400 mb-3">🎯 Study Cards</h4>
                    <div className="space-y-2">
                      {savedNotes.slice(-3).map((note) => (
                        <div key={note.id} className="bg-gradient-to-r from-purple-900 to-blue-900 p-3 rounded border-l-4 border-purple-400 cursor-pointer hover:scale-105 transition-transform">
                          <div className="font-medium text-white">{note.title}</div>
                          <div className="text-xs text-purple-200 mt-1">
                            {note.content.keyPoints.substring(0, 100)}...
                          </div>
                          <div className="text-xs text-blue-300 mt-1">
                            📍 Page {note.pageReference} • {note.template}
                          </div>
                        </div>
                      ))}
                      {savedNotes.length === 0 && (
                        <div className="text-gray-400 text-center py-6 border-2 border-dashed border-gray-600 rounded">
                          <div className="text-4xl mb-2">📝</div>
                          <p>Create your first high-yield note</p>
                          <p className="text-xs mt-1">Quality notes = Better retention</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Enhanced Concept Map */}
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-green-400 mb-3">🗺️ Concept Map</h4>
                    <div className="bg-gray-700 rounded p-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-green-600 p-3 rounded text-white text-center font-medium">
                          📍 Structure
                          <div className="text-xs mt-1 opacity-75">Anatomy & Form</div>
                        </div>
                        <div className="bg-blue-600 p-3 rounded text-white text-center font-medium">
                          ⚡ Function
                          <div className="text-xs mt-1 opacity-75">Physiology & Process</div>
                        </div>
                        <div className="bg-red-600 p-3 rounded text-white text-center font-medium">
                          🚨 Pathology
                          <div className="text-xs mt-1 opacity-75">Disease & Dysfunction</div>
                        </div>
                        <div className="bg-purple-600 p-3 rounded text-white text-center font-medium">
                          🏥 Clinical
                          <div className="text-xs mt-1 opacity-75">Diagnosis & Treatment</div>
                        </div>
                      </div>
                      <div className="text-gray-400 mt-3 text-xs text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span>📊 Study Progress:</span>
                          <div className="bg-gray-600 rounded-full h-2 w-20">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min((savedNotes.length / 10) * 100, 100)}%` }}></div>
                          </div>
                          <span>{savedNotes.length}/10</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Enhanced AI Insights Panel */}
                  {aiEnabled && (
                    <div className="bg-gradient-to-r from-pink-900 to-purple-900 p-4 rounded-lg border border-pink-500">
                      <h4 className="text-lg font-semibold text-pink-400 mb-3">🤖 AI Study Assistant</h4>
                      <div className="space-y-3 text-sm">
                        <div className="bg-pink-800 bg-opacity-50 p-3 rounded">
                          <div className="font-medium text-pink-200 mb-1">💡 High-Yield Concept</div>
                          <div className="text-pink-100">
                            {bookType === 'dental' ? 'Root canal anatomy varies significantly between tooth types - critical for endodontic success' :
                             bookType === 'medical' ? 'Understanding pathophysiology is key to clinical reasoning and patient management' :
                             'Molecular geometry directly influences chemical reactivity and biological activity'}
                          </div>
                        </div>
                        <div className="bg-purple-800 bg-opacity-50 p-3 rounded">
                          <div className="font-medium text-purple-200 mb-1">🔗 Cross-Reference</div>
                          <div className="text-purple-100">
                            {bookType === 'dental' ? 'Links to periodontal anatomy and surgical considerations' :
                             bookType === 'medical' ? 'Connects to pharmacology and treatment protocols' :
                             'Relates to thermodynamics and kinetics principles'}
                          </div>
                        </div>
                        <div className="bg-blue-800 bg-opacity-50 p-3 rounded">
                          <div className="font-medium text-blue-200 mb-1">❓ Board-Style Question</div>
                          <div className="text-blue-100">
                            {bookType === 'dental' ? 'A 45-year-old patient presents with spontaneous throbbing pain. What is the most likely diagnosis?' :
                             bookType === 'medical' ? 'What is the first-line treatment for the condition described in this case?' :
                             'Which molecular geometry would you predict for this compound?'}
                          </div>
                        </div>
                        <div className="bg-green-800 bg-opacity-50 p-3 rounded">
                          <div className="font-medium text-green-200 mb-1">🎯 Study Tip</div>
                          <div className="text-green-100">
                            {bookType === 'dental' ? 'Use the "SLOB rule" for radiographic interpretation' :
                             bookType === 'medical' ? 'Create flowcharts for diagnostic algorithms' :
                             'Draw 3D structures to visualize molecular geometry'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-6 flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                <div className="flex items-center space-x-4">
                  <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white transition-colors">
                    📤 Export Notes
                  </button>
                  <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white transition-colors">
                    🎨 Visual Mode
                  </button>
                  <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white transition-colors">
                    🧪 Quiz Mode
                  </button>
                </div>
                <div className="text-sm text-gray-400">
                  {savedNotes.length} notes created • {Math.round(Math.random() * 85 + 15)}% comprehension
                </div>
              </div>
            </div>
          );

        default: // original view for PDF
          return (
            <div className="bg-gray-800 rounded-lg overflow-hidden p-6" style={{ height: '70vh' }}>
              <SmartPDFViewer 
                fileUrl={fileUrl} 
                scale={1.25}
                onWordClick={handleWordClick}
                showTextOverlay={false}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>
          );
      }
    }

    // Text-based views (when no PDF is loaded)
    switch (viewMode) {
      case 'progressive':
        return (
          <div className="space-y-6 p-6">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
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

      case 'rightbrain':
        return (
          <div className="p-6">
            {/* Right Brain View Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-semibold text-blue-400 flex items-center">
                <span className="mr-3">🧠</span>
                Right Brain View - Creative Notes
              </h3>
              <div className="text-sm text-gray-400">
                Text-based Mode
              </div>
            </div>

            {/* Text-based Right Brain Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Notes Creation Panel */}
              <div className="space-y-4">
                <MedicalNotesPanel />
              </div>

              {/* Text Analysis & Study Tools */}
              <div className="space-y-4">
                {/* Current Context */}
                <div className="bg-gray-800 p-4 rounded-lg">
                  <h4 className="text-lg font-semibold text-yellow-400 mb-3">📖 Current Context</h4>
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <p className="mb-2"><strong>Mode:</strong> Text Analysis</p>
                    <p className="mb-3"><strong>Content:</strong> Sample Text</p>
                    <div className="bg-gray-700 p-3 rounded italic">
                      {(textContent || sampleText).substring(0, 200)}...
                    </div>
                  </div>
                </div>

                {/* Study Cards and Mind Map same as PDF version */}
                <div className="bg-gray-800 p-4 rounded-lg">
                  <h4 className="text-lg font-semibold text-purple-400 mb-3">🎯 Study Cards</h4>
                  <div className="space-y-2">
                    {savedNotes.slice(-3).map((note) => (
                      <div key={note.id} className="bg-gradient-to-r from-purple-900 to-blue-900 p-3 rounded border-l-4 border-purple-400">
                        <div className="font-medium text-white">{note.title}</div>
                        <div className="text-xs text-purple-200 mt-1">
                          {note.content.keyPoints.substring(0, 100)}...
                        </div>
                      </div>
                    ))}
                    {savedNotes.length === 0 && (
                      <div className="text-gray-400 text-center py-4">
                        Create your first note to see study cards here
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
          <button
            onClick={() => setViewMode('rightbrain')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'rightbrain' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            🧠 Right Brain View
          </button>
        </div>

        {/* Tip */}
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
          <div className="flex items-center text-blue-300">
            <span className="mr-2">💡</span>
            <span className="text-sm">Tip: Click on any word below to instantly switch to progressive view!</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {renderContent()}
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