// pages/index.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Upload } from "lucide-react";

// Dynamic / externalized components (must exist)
const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading PDF viewer...</div>,
});
const ProgressiveView = dynamic(() => import("@/components/ProgressiveView"), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Progressive View...</div>,
});
const HybridReader = dynamic(() => import("@/components/HybridReader"), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Hybrid Reader...</div>,
});

// Enhanced Table of Contents (as before)
const fullTableOfContents = [
  { page: 1, title: "Cover & Title Page", level: 0 },
  { page: 3, title: "Table of Contents", level: 0 },
  { page: 15, title: "Chapter 1: Introduction to Molecular Geometry", level: 1 },
  { page: 16, title: "1.1 Basic Concepts", level: 2 },
  { page: 25, title: "1.2 VSEPR Theory", level: 2 },
  { page: 35, title: "1.3 Hybridization", level: 2 },
  { page: 45, title: "1.4 Molecular Shapes", level: 2 },
  { page: 55, title: "1.5 Polarity and Intermolecular Forces", level: 2 },
  { page: 68, title: "1.9 Molecular Geometries", level: 2 },
  { page: 78, title: "Chapter 2: Chemical Bonding", level: 1 },
  { page: 89, title: "2.1 Ionic Bonding", level: 2 },
  { page: 105, title: "2.2 Covalent Bonding", level: 2 },
  { page: 125, title: "2.3 Metallic Bonding", level: 2 },
  { page: 145, title: "2.4 Bond Properties", level: 2 },
  { page: 165, title: "Chapter 3: Thermodynamics", level: 1 },
  { page: 178, title: "3.1 First Law of Thermodynamics", level: 2 },
  { page: 195, title: "3.2 Enthalpy", level: 2 },
  { page: 215, title: "3.3 Entropy", level: 2 },
  { page: 235, title: "3.4 Gibbs Free Energy", level: 2 },
  { page: 255, title: "Chapter 4: Kinetics", level: 1 },
  { page: 275, title: "4.1 Reaction Rates", level: 2 },
  { page: 295, title: "4.2 Rate Laws", level: 2 },
  { page: 315, title: "4.3 Reaction Mechanisms", level: 2 },
  { page: 335, title: "4.4 Catalysis", level: 2 },
  { page: 355, title: "Chapter 5: Equilibrium", level: 1 },
  { page: 375, title: "5.1 Chemical Equilibrium", level: 2 },
  { page: 395, title: "5.2 Le Chatelier's Principle", level: 2 },
  { page: 415, title: "5.3 Acid-Base Equilibria", level: 2 },
  { page: 435, title: "5.4 Solubility Equilibria", level: 2 },
  { page: 455, title: "Appendix A: Mathematical Review", level: 1 },
  { page: 475, title: "Appendix B: Reference Tables", level: 1 },
  { page: 495, title: "Index", level: 1 },
];

interface ReadingStats {
  wordsRead: number;
  timeElapsed: number; // seconds
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

type ViewMode = "original" | "progressive" | "hybrid" | "rightbrain";

export default function ThoughtUnitReader() {
  // Core reading state
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [totalThoughtUnits] = useState(832767);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 200,
    averageWPM: 200,
  });

  // UI and modes
  const [aiEnabled, setAiEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("progressive");
  const [clickSwitchesTo, setClickSwitchesTo] = useState("Progressive View");

  // Notes
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [noteTemplate, setNoteTemplate] = useState("anatomy");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState({
    anatomy: "",
    physiology: "",
    pathology: "",
    clinical: "",
    keyPoints: "",
    questions: "",
  });
  const [savedNotes, setSavedNotes] = useState<any[]>([]);

  // Typography
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("OpenDyslexic");
  const [lineSpacing, setLineSpacing] = useState(1.5);

  // PDF & File
  const [pdfPageCount, setPdfPageCount] = useState(1423);
  const [currentPage, setCurrentPage] = useState(68);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>("");

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [highlightedWord, setHighlightedWord] = useState<string>("Use");

  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const sampleText = `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com. Access to the eBook is limited to the first individual who redeems the PIN...`;

  // Effects
  useEffect(() => {
    if (textContent || sampleText) {
      const content = textContent || sampleText;
      const words = content.trim().split(/\s+/);
      const units: ThoughtUnit[] = [];
      for (let i = 0; i < words.length; i += 12) {
        const unitWords = words.slice(i, i + 12);
        units.push({
          id: Math.floor(i / 12) + 1,
          text: unitWords.join(" "),
          wordCount: unitWords.length,
          isCompleted: false,
          timeSpent: 0,
        });
      }
      setThoughtUnits(units);
    }
  }, [textContent]);

  useEffect(() => {
    if (isReading && !isPaused) {
      readingTimerRef.current = setInterval(() => {
        setStats((prev) => {
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

  // Handlers
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    if (file.type === "application/pdf") {
      setFileUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith("text/")) {
      const txt = await file.text();
      setTextContent(txt);
    }
  }, []);

  const handleStartReading = useCallback(() => {
    setIsReading(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
  }, []);

  const handlePauseReading = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  const handleResetReading = useCallback(() => {
    setIsReading(false);
    setIsPaused(false);
    setCurrentThoughtUnit(1);
    setStats((s) => ({
      ...s,
      wordsRead: 0,
      timeElapsed: 0,
      currentWPM: readingSpeed,
      averageWPM: readingSpeed,
    }));
    setThoughtUnits((prev) => prev.map((u) => ({ ...u, isCompleted: false, timeSpent: 0 })));
  }, [readingSpeed]);

  const advanceThoughtUnit = useCallback(() => {
    if (currentThoughtUnit < thoughtUnits.length) {
      setCurrentThoughtUnit((c) => c + 1);
      setStats((prev) => ({
        ...prev,
        wordsRead: prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0),
      }));
      setThoughtUnits((prev) =>
        prev.map((unit) =>
          unit.id === currentThoughtUnit ? { ...unit, isCompleted: true } : unit
        )
      );
    }
  }, [currentThoughtUnit, thoughtUnits]);

  useEffect(() => {
    if (isReading && !isPaused && viewMode === "progressive") {
      const wordsPerUnit = thoughtUnits[currentThoughtUnit - 1]?.wordCount || 12;
      const timePerUnit = (wordsPerUnit / readingSpeed) * 60 * 1000;
      const timer = setTimeout(advanceThoughtUnit, timePerUnit);
      return () => clearTimeout(timer);
    }
  }, [isReading, isPaused, viewMode, currentThoughtUnit, readingSpeed, advanceThoughtUnit, thoughtUnits]);

  const handleWordClick = useCallback(
    (word: string) => {
      setHighlightedWord(word);
      if (clickSwitchesTo === "Progressive View" && viewMode !== "progressive") {
        setViewMode("progressive");
      } else if (clickSwitchesTo === "Hybrid View" && viewMode !== "hybrid") {
        setViewMode("hybrid");
      }
    },
    [clickSwitchesTo, viewMode]
  );

  const saveNote = () => {
    const newNote = {
      id: Date.now(),
      title: noteTitle || "Untitled Note",
      template: noteTemplate,
      content: { ...noteContent },
      createdAt: new Date().toISOString(),
      pageReference: currentPage,
    };
    setSavedNotes((prev) => [...prev, newNote]);
    setNoteTitle("");
    setNoteContent({
      anatomy: "",
      physiology: "",
      pathology: "",
      clinical: "",
      keyPoints: "",
      questions: "",
    });
  };

  const completionPercentage = Math.round((currentThoughtUnit / totalThoughtUnits) * 100);
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Simplified MedicalNotesPanel (could be pulled out)
  const MedicalNotesPanel = () => (
    <div className="bg-gray-800 p-4 rounded-lg h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-blue-400">📝 Medical Notes</h3>
        <button onClick={() => setShowNotesPanel((s) => !s)} className="text-gray-400 hover:text-white">
          {showNotesPanel ? "◐" : "◑"}
        </button>
      </div>
      {showNotesPanel && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Template</label>
            <select
              value={noteTemplate}
              onChange={(e) => setNoteTemplate(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            >
              <option value="anatomy">Anatomy</option>
              <option value="pathology">Pathology</option>
              <option value="systems">Systems Review</option>
              <option value="clinical">Clinical Case</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="e.g., Molecular Geometries - Chapter 1.9"
              className="w-full bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          <div className="space-y-3">
            <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded p-3">
              <label className="block text-sm font-medium text-green-400 mb-2">🔬 Structure/Anatomy</label>
              <textarea
                value={noteContent.anatomy}
                onChange={(e) => setNoteContent((p) => ({ ...p, anatomy: e.target.value }))}
                placeholder="Describe the structure..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
            <div className="bg-blue-900 bg-opacity-30 border border-blue-600 rounded p-3">
              <label className="block text-sm font-medium text-blue-400 mb-2">⚡ Function/Mechanism</label>
              <textarea
                value={noteContent.physiology}
                onChange={(e) => setNoteContent((p) => ({ ...p, physiology: e.target.value }))}
                placeholder="How it works..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
            <div className="bg-red-900 bg-opacity-30 border border-red-600 rounded p-3">
              <label className="block text-sm font-medium text-red-400 mb-2">⚠️ Problems/Pathology</label>
              <textarea
                value={noteContent.pathology}
                onChange={(e) => setNoteContent((p) => ({ ...p, pathology: e.target.value }))}
                placeholder="What goes wrong..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
            <div className="bg-purple-900 bg-opacity-30 border border-purple-600 rounded p-3">
              <label className="block text-sm font-medium text-purple-400 mb-2">🏥 Clinical Applications</label>
              <textarea
                value={noteContent.clinical}
                onChange={(e) => setNoteContent((p) => ({ ...p, clinical: e.target.value }))}
                placeholder="Real-world applications..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3">
              <label className="block text-sm font-medium text-yellow-400 mb-2">⭐ Key Points</label>
              <textarea
                value={noteContent.keyPoints}
                onChange={(e) => setNoteContent((p) => ({ ...p, keyPoints: e.target.value }))}
                placeholder="High-yield facts..."
                className="w-full bg-gray-700 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
            <div className="bg-gray-700 border border-gray-500 rounded p-3">
              <label className="block text-sm font-medium text-gray-300 mb-2">❓ Study Questions</label>
              <textarea
                value={noteContent.questions}
                onChange={(e) => setNoteContent((p) => ({ ...p, questions: e.target.value }))}
                placeholder="Practice questions..."
                className="w-full bg-gray-600 text-white rounded px-3 py-2 h-20 text-sm"
              />
            </div>
          </div>
          <button
            onClick={saveNote}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition-colors"
          >
            💾 Save Note (Page {currentPage})
          </button>
          {savedNotes.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                📚 Saved Notes ({savedNotes.length})
              </h4>
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

  // Render main content based on viewMode
  const renderContent = () => {
    const currentUnit = thoughtUnits[currentThoughtUnit - 1];

    // PDF loaded
    if (fileUrl && uploadedFile?.type === "application/pdf") {
      if (viewMode === "progressive") {
        return (
          <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
                <span className="mr-2">⚡</span> Progressive Reading
              </h3>
              <div className="text-sm text-gray-400">
                Page {currentPage} of {pdfPageCount}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={isReading ? handlePauseReading : handleStartReading}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                  isReading ? "bg-yellow-600" : "bg-green-600"
                } text-white`}
              >
                {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
                <span>{isReading && !isPaused ? "Pause" : "Start"}</span>
              </button>
              <button
                onClick={handleResetReading}
                className="px-4 py-2 bg-gray-600 rounded-lg flex items-center space-x-2 text-white"
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
                  min={50}
                  max={1000}
                />
                <span className="text-sm text-gray-300">WPM</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-600 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">
                  {Math.round((currentPage / pdfPageCount) * 100)}%
                </div>
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

            <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: "60vh" }}>
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
      }

      if (viewMode === "hybrid") {
        return <HybridReader inputText={textContent || sampleText} />;
      }

      if (viewMode === "rightbrain") {
        return (
          <div className="p-6">
            {/* right brain layout omitted here for brevity; you can keep previous implementation */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MedicalNotesPanel />
              <div>
                {/* context, study cards, concept map, AI insights, etc. */}
              </div>
            </div>
          </div>
        );
      }

      // original
      return (
        <div className="bg-gray-800 rounded-lg overflow-hidden p-6" style={{ height: "70vh" }}>
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

    // Text-only modes
    if (viewMode === "progressive") {
      return (
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
              <span className="mr-2">⚡</span> Progressive Reading
            </h3>
            <div className="text-sm text-gray-400">
              Thought Unit {currentThoughtUnit} of {totalThoughtUnits.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={isReading ? handlePauseReading : handleStartReading}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                isReading ? "bg-yellow-600" : "bg-green-600"
              } text-white`}
            >
              {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
              <span>{isReading && !isPaused ? "Pause" : "Start"}</span>
            </button>
            <button
              onClick={handleResetReading}
              className="px-4 py-2 bg-gray-600 rounded-lg flex items-center space-x-2 text-white"
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>
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
          {currentUnit && (
            <div className="bg-gray-800 p-6 rounded-lg">
              <div
                className="text-lg leading-relaxed"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: fontFamily,
                  lineHeight: lineSpacing,
                }}
              >
                {currentUnit.text.split(" ").map((word, i) => (
                  <span
                    key={i}
                    className={`${
                      word === highlightedWord
                        ? "bg-yellow-400 text-black px-1 rounded"
                        : "hover:bg-gray-700 cursor-pointer px-1 rounded"
                    } transition-colors`}
                    onClick={() => handleWordClick(word)}
                  >
                    {word}{" "}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (viewMode === "original") {
      return (
        <div className="bg-gray-800 p-6 rounded-lg">
          <div
            className="prose prose-invert max-w-none"
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily,
              lineHeight: lineSpacing,
            }}
          >
            {(textContent || sampleText)
              .split(" ")
              .map((word, i) => (
                <span
                  key={i}
                  className={`${
                    word === highlightedWord
                      ? "bg-yellow-400 text-black px-1 rounded"
                      : "hover:bg-gray-700 cursor-pointer px-1 rounded"
                  } transition-colors`}
                  onClick={() => handleWordClick(word)}
                >
                  {word}{" "}
                </span>
              ))}
          </div>
        </div>
      );
    }

    if (viewMode === "hybrid") {
      return <HybridReader inputText={textContent || sampleText} />;
    }

    return null;
  };

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      <header className="text-center py-6 border-b border-gray-700">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-600 bg-clip-text text-transparent">
          Thought-Unit Reader
        </h1>
        <p className="text-gray-400 mt-2">Read deeper, faster, and smarter.</p>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Enable AI Mode</span>
              <button
                onClick={() => setAiEnabled((a) => !a)}
                className={`w-12 h-6 rounded-full transition-colors ${aiEnabled ? "bg-blue-500" : "bg-gray-600"} relative`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                    aiEnabled ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <label className="flex items-center space-x-2 bg-pink-500 hover:bg-pink-600 px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <Upload size={16} />
              <span>Upload Book</span>
              <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.epub" />
            </label>

            <button
              onClick={() => setDebugMode((d) => !d)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Debug
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm">Dark Mode</span>
            <button
              onClick={() => setDarkMode((d) => !d)}
              className={`w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-blue-500" : "bg-gray-600"} relative`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  darkMode ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Typography & view controls */}
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
            <button onClick={() => setFontSize((f) => Math.max(f - 2, 10))} className="w-6 h-6 bg-gray-700 rounded">
              -
            </button>
            <span className="min-w-[3rem] text-center">{fontSize}px</span>
            <button onClick={() => setFontSize((f) => Math.min(f + 2, 32))} className="w-6 h-6 bg-gray-700 rounded">
              +
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <span>Line Spacing:</span>
            <button onClick={() => setLineSpacing((l) => Math.max(l - 0.1, 1.0))} className="w-6 h-6 bg-gray-700 rounded">
              -
            </button>
            <span className="min-w-[3rem] text-center">{lineSpacing.toFixed(1)}x</span>
            <button onClick={() => setLineSpacing((l) => Math.min(l + 0.1, 3.0))} className="w-6 h-6 bg-gray-700 rounded">
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

        {/* View mode buttons */}
        <div className="flex space-x-2">
          {(["original", "progressive", "hybrid", "rightbrain"] as ViewMode[]).map((vm) => (
            <button
              key={vm}
              onClick={() => setViewMode(vm)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === vm ? "bg-pink-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {vm === "rightbrain" ? "🧠 Right Brain View" : `${vm.charAt(0).toUpperCase() + vm.slice(1)} View`}
            </button>
          ))}
        </div>

        <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
          <div className="flex items-center text-blue-300">
            <span className="mr-2">💡</span>
            <span className="text-sm">Tip: Click on any word below to instantly switch to progressive view!</span>
          </div>
        </div>

        {/* Main content */}
        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">{renderContent()}</div>

        {/* Debug panel */}
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