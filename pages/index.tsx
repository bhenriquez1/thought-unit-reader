// components/ThoughtUnitReader.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import SmartPDFViewer from "./SmartPDFViewer"; // adjust import path if different

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

const defaultSampleText = `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com. Access to the eBook is limited to the first individual who redeems the PIN, located on the inside cover of this book, at expertconsult.inkling.com and may not be transferred to another party by resale, lending, or other means.`;

const generateThoughtUnitsFromText = (text: string, wordsPerUnit = 12): ThoughtUnit[] => {
  const words = text.split(/\s+/);
  const units: ThoughtUnit[] = [];
  for (let i = 0; i < words.length; i += wordsPerUnit) {
    const unitWords = words.slice(i, i + wordsPerUnit);
    units.push({
      id: Math.floor(i / wordsPerUnit) + 1,
      text: unitWords.join(" "),
      wordCount: unitWords.length,
      isCompleted: false,
      timeSpent: 0,
    });
  }
  return units;
};

const ThoughtUnitReader: React.FC = () => {
  // Core reading state
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [readingSpeed, setReadingSpeed] = useState(200); // WPM

  // Stats
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 200,
    averageWPM: 200,
  });

  // UI / modes
  const [aiEnabled, setAiEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("progressive");
  const [clickSwitchesTo, setClickSwitchesTo] = useState<"Progressive View" | "Hybrid View">("Progressive View");

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

  // PDF / text content
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>("");
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [highlightedWord, setHighlightedWord] = useState<string>("Use");

  // PDF metadata
  const [currentPage, setCurrentPage] = useState(68);
  const [pdfPageCount, setPdfPageCount] = useState(1423);

  // Timer refs
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Derived
  const totalThoughtUnits = thoughtUnits.length;
  const completionPercentage = totalThoughtUnits
    ? Math.round((currentThoughtUnit / totalThoughtUnits) * 100)
    : 0;

  // Initialize thought units when textContent changes
  useEffect(() => {
    const content = textContent || defaultSampleText;
    setThoughtUnits(generateThoughtUnitsFromText(content));
  }, [textContent]);

  // Reading timer logic
  useEffect(() => {
    if (isReading && !isPaused) {
      readingTimerRef.current = setInterval(() => {
        setStats((prev) => {
          const newTimeElapsed = prev.timeElapsed + 1;
          const newCurrentWPM = Math.round((prev.wordsRead / newTimeElapsed) * 60) || readingSpeed;
          const newAverage = Math.round((prev.averageWPM + newCurrentWPM) / 2) || readingSpeed;
          return {
            ...prev,
            timeElapsed: newTimeElapsed,
            currentWPM: newCurrentWPM,
            averageWPM: newAverage,
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

  // Auto-advance
  const advanceThoughtUnit = useCallback(() => {
    if (currentThoughtUnit < thoughtUnits.length) {
      setCurrentThoughtUnit((prev) => prev + 1);
      setStats((prev) => ({
        ...prev,
        wordsRead:
          prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0),
      }));
      setThoughtUnits((prev) =>
        prev.map((u) =>
          u.id === currentThoughtUnit ? { ...u, isCompleted: true } : u
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
  }, [
    isReading,
    isPaused,
    viewMode,
    currentThoughtUnit,
    readingSpeed,
    advanceThoughtUnit,
    thoughtUnits,
  ]);

  // Word click logic
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

  // File upload
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

  // Note saving
  const saveNote = () => {
    const newNote = {
      id: Date.now(),
      title: noteTitle || "Untitled",
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

  // Formatting helper
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  // Medical notes panel (simplified)
  const MedicalNotesPanel: React.FC = () => (
    <div className="bg-gray-800 p-4 rounded-lg h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-blue-400">📝 Notes</h3>
        <button
          onClick={() => setShowNotesPanel((v) => !v)}
          className="text-gray-400 hover:text-white"
        >
          {showNotesPanel ? "◐" : "◑"}
        </button>
      </div>
      {showNotesPanel && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Template</label>
            <select
              value={noteTemplate}
              onChange={(e) => setNoteTemplate(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-2 py-1"
            >
              <option value="anatomy">Anatomy</option>
              <option value="pathology">Pathology</option>
              <option value="clinical">Clinical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-2 py-1"
              placeholder="Note title"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Key Points</label>
            <textarea
              value={noteContent.keyPoints}
              onChange={(e) =>
                setNoteContent((p) => ({ ...p, keyPoints: e.target.value }))
              }
              className="w-full bg-gray-700 text-white rounded px-2 py-1 h-20"
              placeholder="High-yield facts"
            />
          </div>
          <button
            onClick={saveNote}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
          >
            Save Note (Page {currentPage})
          </button>
          {savedNotes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm text-gray-300 mb-2">
                Saved Notes ({savedNotes.length})
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {savedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-gray-700 p-2 rounded text-xs text-white"
                  >
                    <div className="font-medium">{note.title}</div>
                    <div className="text-gray-400">
                      Page {note.pageReference} •{" "}
                      {new Date(note.createdAt).toLocaleDateString()}
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

  // Render logic simplified for brevity
  const currentUnit = thoughtUnits[currentThoughtUnit - 1];

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      {/* Header / Controls */}
      <div className="p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2 items-center">
          <button onClick={() => setAiEnabled((v) => !v)} className="px-3 py-1 bg-indigo-500 rounded text-white">
            AI: {aiEnabled ? "On" : "Off"}
          </button>
          <button onClick={() => setDarkMode((v) => !v)} className="px-3 py-1 bg-gray-600 rounded text-white">
            {darkMode ? "Light" : "Dark"}
          </button>
          <div>
            <label className="mr-1 text-sm">Speed</label>
            <input
              type="number"
              value={readingSpeed}
              onChange={(e) => setReadingSpeed(parseInt(e.target.value) || 200)}
              className="w-20 px-2 py-1 bg-gray-700 text-white rounded"
            />
          </div>
          <div>
            <label className="mr-1 text-sm">View</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="px-2 py-1 rounded bg-gray-700 text-white"
            >
              <option value="original">Original</option>
              <option value="progressive">Progressive</option>
              <option value="hybrid">Hybrid</option>
              <option value="rightbrain">Right Brain</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setIsReading(true);
              setIsPaused(false);
            }}
            className="px-3 py-1 bg-green-600 rounded text-white flex items-center gap-1"
          >
            <Play size={14} /> Start
          </button>
          <button
            onClick={() => setIsPaused((v) => !v)}
            className="px-3 py-1 bg-yellow-600 rounded text-white flex items-center gap-1"
          >
            <Pause size={14} /> {isPaused ? "Resume" : "Pause"}
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
                averageWPM: readingSpeed,
              });
              setThoughtUnits((prev) =>
                prev.map((u) => ({ ...u, isCompleted: false, timeSpent: 0 }))
              );
            }}
            className="px-3 py-1 bg-red-600 rounded text-white flex items-center gap-1"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: PDF / original / hybrid */}
        <div className="lg:col-span-2 space-y-4">
          {viewMode === "progressive" && (
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between mb-4">
                <div className="text-yellow-400 font-semibold flex items-center gap-1">
                  <span>⚡</span> Progressive Reading
                </div>
                <div className="text-sm text-gray-400">
                  Thought Unit {currentThoughtUnit} of {totalThoughtUnits}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-600 p-3 rounded text-center">
                  <div className="font-bold text-xl">{completionPercentage}%</div>
                  <div className="text-xs opacity-75">Complete</div>
                </div>
                <div className="bg-green-600 p-3 rounded text-center">
                  <div className="font-bold text-xl">{currentThoughtUnit}</div>
                  <div className="text-xs opacity-75">Current</div>
                </div>
                <div className="bg-purple-600 p-3 rounded text-center">
                  <div className="font-bold text-xl">{stats.currentWPM}</div>
                  <div className="text-xs opacity-75">WPM</div>
                </div>
                <div className="bg-red-900 p-3 rounded text-center">
                  <div className="font-bold text-xl">{formatTime(stats.timeElapsed)}</div>
                  <div className="text-xs opacity-75">Elapsed</div>
                </div>
              </div>

              {currentUnit && (
                <div
                  className="bg-gray-700 p-4 rounded"
                  style={{
                    fontSize: `${fontSize}px`,
                    fontFamily,
                    lineHeight: lineSpacing,
                  }}
                >
                  {currentUnit.text.split(" ").map((word, i) => (
                    <span
                      key={i}
                      className={`${
                        word === highlightedWord
                          ? "bg-yellow-400 text-black px-1 rounded"
                          : "hover:bg-gray-600 cursor-pointer px-1 rounded"
                      } transition-colors`}
                      onClick={() => handleWordClick(word)}
                    >
                      {word}{" "}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {(viewMode === "hybrid" || viewMode === "original") && (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="text-sm text-gray-300 mb-2">
                    {viewMode === "hybrid" ? "Original + Progressive" : "Original Text"}
                  </div>
                  <div
                    className="bg-gray-700 p-4 rounded"
                    style={{
                      fontSize: `${fontSize}px`,
                      fontFamily,
                      lineHeight: lineSpacing,
                    }}
                  >
                    {(textContent || defaultSampleText)
                      .split(" ")
                      .slice(0, 60)
                      .map((word, i) => (
                        <span
                          key={i}
                          className={`${
                            word === highlightedWord
                              ? "bg-yellow-400 text-black px-1 rounded"
                              : "hover:bg-gray-600 cursor-pointer px-1 rounded"
                          } transition-colors`}
                          onClick={() => handleWordClick(word)}
                        >
                          {word}{" "}
                        </span>
                      ))}
                  </div>
                </div>
                {viewMode === "hybrid" && (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-300 mb-2">Progressive Unit</div>
                    {currentUnit && (
                      <div
                        className="bg-gray-700 p-4 rounded"
                        style={{
                          fontSize: `${fontSize}px`,
                          fontFamily,
                          lineHeight: lineSpacing,
                        }}
                      >
                        {currentUnit.text.split(" ").map((word, i) => (
                          <span
                            key={i}
                            className={`${
                              word === highlightedWord
                                ? "bg-yellow-400 text-black px-1 rounded"
                                : "hover:bg-gray-600 cursor-pointer px-1 rounded"
                            } transition-colors`}
                            onClick={() => handleWordClick(word)}
                          >
                            {word}{" "}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === "rightbrain" && (
            <div className="bg-gray-800 p-6 rounded-lg space-y-6">
              <div className="flex justify-between">
                <div className="text-2xl font-semibold text-blue-400 flex items-center gap-2">
                  🧠 Right Brain View
                </div>
                <div className="text-sm text-gray-400">Section: Molecular Geometries</div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MedicalNotesPanel />

                <div className="space-y-4">
                  <div className="bg-gray-800 p-4 rounded">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-2">
                      📖 Current Context
                    </h4>
                    <div className="text-sm text-gray-300">
                      <p>
                        <strong>Page:</strong> {currentPage} / {pdfPageCount}
                      </p>
                      <div className="bg-gray-700 p-3 rounded italic mt-2">
                        {(textContent || defaultSampleText).substring(0, 200)}...
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800 p-4 rounded">
                    <h4 className="text-lg font-semibold text-purple-400 mb-2">
                      🎯 Study Cards
                    </h4>
                    {savedNotes.slice(-3).map((note) => (
                      <div
                        key={note.id}
                        className="bg-gradient-to-r from-purple-900 to-blue-900 p-3 rounded border-l-4 border-purple-400 mb-2"
                      >
                        <div className="font-medium text-white">{note.title}</div>
                        <div className="text-xs text-purple-200 mt-1">
                          {note.content.keyPoints?.substring(0, 100)}...
                        </div>
                      </div>
                    ))}
                    {savedNotes.length === 0 && (
                      <div className="text-gray-400 text-center py-4">
                        Create your first note to see study cards here
                      </div>
                    )}
                  </div>

                  {aiEnabled && (
                    <div className="bg-gradient-to-r from-pink-900 to-purple-900 p-4 rounded border border-pink-500">
                      <h4 className="text-lg font-semibold text-pink-400 mb-2">
                        🤖 AI Insights
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="bg-pink-800 bg-opacity-50 p-2 rounded">
                          <strong>💡 Concept:</strong> Molecular geometry affects chemical
                          properties.
                        </div>
                        <div className="bg-purple-800 bg-opacity-50 p-2 rounded">
                          <strong>🔗 Connection:</strong> Bonding theory ties into hybridization.
                        </div>
                        <div className="bg-blue-800 bg-opacity-50 p-2 rounded">
                          <strong>❓ Question:</strong> How does VSEPR predict 3D shapes?
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-4">
                <div className="flex gap-2">
                  <button className="bg-green-600 px-4 py-2 rounded text-white">
                    📤 Export Notes
                  </button>
                  <button className="bg-blue-600 px-4 py-2 rounded text-white">
                    🎨 Visual Mode
                  </button>
                  <button className="bg-purple-600 px-4 py-2 rounded text-white">
                    🧪 Quiz Mode
                  </button>
                </div>
                <div className="text-sm text-gray-400">
                  {savedNotes.length} notes • {Math.round(Math.random() * 85 + 15)}%
                  comprehension
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: stats / controls summary */}
        <div className="space-y-4">
          <div className="bg-gray-800 p-4 rounded">
            <div className="font-semibold mb-2">Reading Stats</div>
            <div className="text-xs">
              <p>Words Read: {stats.wordsRead}</p>
              <p>Time: {formatTime(stats.timeElapsed)}</p>
              <p>Current WPM: {stats.currentWPM}</p>
              <p>Avg WPM: {stats.averageWPM}</p>
              <p>Highlighted Word: {highlightedWord}</p>
            </div>
          </div>

          {debugMode && (
            <div className="bg-yellow-900 p-3 rounded">
              <div className="font-semibold mb-1">Debug</div>
              <div className="text-xs">
                <p>Thought Unit: {currentThoughtUnit}</p>
                <p>View Mode: {viewMode}</p>
                <p>Speed: {readingSpeed} WPM</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThoughtUnitReader;