"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis 
} from "@/lib/rightBrainReading";
import { useReaderSync } from "@/lib/readerSync";
import type { TOCEntry } from "@/lib/tocParser";

// Accessibility preferences interface
interface AccessibilitySettings {
  // Dyslexia-friendly features
  dyslexiaFont: boolean;
  fontSize: number;
  lineSpacing: number;
  letterSpacing: number;
  colorOverlay: string;
  readingRuler: boolean;
  textToSpeech: boolean;
  
  // OCD-friendly features
  completionTracking: boolean;
  confirmActions: boolean;
  symmetricLayout: boolean;
  autoSave: boolean;
  showProgress: boolean;
  
  // General accessibility
  highContrast: boolean;
  reducedMotion: boolean;
  focusMode: boolean;
  keyboardNav: boolean;
}

const defaultAccessibilitySettings: AccessibilitySettings = {
  dyslexiaFont: false,
  fontSize: 16,
  lineSpacing: 1.6,
  letterSpacing: 0.05,
  colorOverlay: 'none',
  readingRuler: false,
  textToSpeech: false,
  completionTracking: true,
  confirmActions: false,
  symmetricLayout: true,
  autoSave: true,
  showProgress: true,
  highContrast: false,
  reducedMotion: false,
  focusMode: false,
  keyboardNav: true,
};

type VRBUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface VisualRightBrainReaderProps {
  bookId: string;
  userId: string;
  thoughtUnits: VRBUnit[];
  currentThoughtUnit: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  // New props for TOC and page navigation
  totalPages?: number;
  tableOfContents?: TOCEntry[];
  onPageChange?: (page: number) => void;
}

function unitToText(u: VRBUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Visual Learning Modes
type VisualMode = "mindMap" | "memoryPalace" | "storyboard" | "conceptWeb";

// Memory Palace Room Generator
function generateMemoryPalaceRoom(analysis: RightBrainChunkAnalysis, index: number): {
  roomName: string;
  description: string;
  objects: Array<{name: string, concept: string, position: string}>;
} {
  const roomTypes = [
    "Library", "Kitchen", "Garden", "Workshop", "Observatory", 
    "Art Studio", "Laboratory", "Theater", "Museum", "Cathedral"
  ];
  
  const roomName = roomTypes[index % roomTypes.length];
  
  const objects = analysis.keyTerms.map((term, idx) => ({
    name: `${term} ${["Book", "Tool", "Painting", "Sculpture", "Device"][idx % 5]}`,
    concept: term,
    position: ["center", "left wall", "right wall", "corner", "ceiling"][idx % 5]
  }));

  return {
    roomName,
    description: `Enter the ${roomName}. ${analysis.mindMovieScene}`,
    objects
  };
}

// Concept Web Node
interface ConceptNode {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  connections: string[];
}

// Generate concept web from chunks
function generateConceptWeb(chunks: string[], analyses: RightBrainChunkAnalysis[]): ConceptNode[] {
  const nodes: ConceptNode[] = [];
  const centerX = 400;
  const centerY = 300;
  const radius = 200;
  
  chunks.forEach((chunk, index) => {
    const analysis = analyses[index];
    const angle = (index / chunks.length) * 2 * Math.PI;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    nodes.push({
      id: stableChunkId(chunk),
      text: analysis.coreIdea.slice(0, 30) + "...",
      x,
      y,
      color: analysis.colorCode,
      size: Math.max(60, Math.min(120, chunk.length / 3)),
      connections: [] // We'll add connections based on shared terms
    });
  });
  
  // Add connections based on shared key terms
  nodes.forEach((node, i) => {
    const analysis = analyses[i];
    nodes.forEach((otherNode, j) => {
      if (i !== j) {
        const otherAnalysis = analyses[j];
        const sharedTerms = analysis.keyTerms.filter(term => 
          otherAnalysis.keyTerms.some(otherTerm => 
            term.toLowerCase().includes(otherTerm.toLowerCase()) ||
            otherTerm.toLowerCase().includes(term.toLowerCase())
          )
        );
        if (sharedTerms.length > 0) {
          node.connections.push(otherNode.id);
        }
      }
    });
  });
  
  return nodes;
}

export default function VisualRightBrainReader({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  fontSize: propFontSize,
  fontFamily: propFontFamily,
  lineSpacing: propLineSpacing,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  totalPages = 1,
  tableOfContents = [],
  onPageChange,
}: VisualRightBrainReaderProps) {
  const [visualMode, setVisualMode] = useState<VisualMode>("mindMap");
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [showConnections, setShowConnections] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(2000);
  
  // Accessibility state
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(defaultAccessibilitySettings);
  const [showAccessibilityPanel, setShowAccessibilityPanel] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [completedChunks, setCompletedChunks] = useState<Set<string>>(new Set());
  const [readingRulerPosition, setReadingRulerPosition] = useState(0);
  
  // Refs for accessibility features
  const contentRef = useRef<HTMLDivElement>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // ReaderSync integration with enhanced TOC support
  const { 
    page: currentPage, 
    setPage, 
    syncToChapter, 
    findNearestChapter,
    chapterBoundaries,
    cacheChunkAnchor,
    syncChunkToPDF,
    initializeContent
  } = useReaderSync();

  // Empty state
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        🧠 Please upload a PDF to start Visual Right-Brain Reading
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        ⏳ Preparing your visual learning experience...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Create visual chunks optimized for spatial learning
  const chunks = useMemo(
    () => chunkText(unitText, { mode: "semantic", targetChars: 150 }),
    [unitText]
  );

  // Analyze all chunks for visual processing
  const chunkAnalyses = useMemo(
    () => chunks.map((chunk, index) => 
      analyzeChunkWithRightBrain(chunk, index, chunks.length)
    ),
    [chunks]
  );

  const activeAnalysis = chunkAnalyses[activeChunkIndex] || null;

  // Generate concept web
  const conceptNodes = useMemo(
    () => generateConceptWeb(chunks, chunkAnalyses),
    [chunks, chunkAnalyses]
  );

  // Initialize ReaderSync with content data
  useEffect(() => {
    if (tableOfContents.length > 0 && totalPages && thoughtUnits.length > 0) {
      initializeContent(totalPages, thoughtUnits.length, tableOfContents);
    }
  }, [tableOfContents, totalPages, thoughtUnits.length, initializeContent]);

  // Auto-advance through chunks (paused when user is navigating or in focus mode)
  useEffect(() => {
    if (accessibilitySettings.focusMode || accessibilitySettings.reducedMotion) return;
    
    const timer = setInterval(() => {
      setActiveChunkIndex(prev => {
        const nextIndex = (prev + 1) % chunks.length;
        
        // Update reading ruler position for dyslexia support
        if (accessibilitySettings.readingRuler) {
          setReadingRulerPosition(nextIndex);
        }
        
        return nextIndex;
      });
    }, animationSpeed);
    
    return () => clearInterval(timer);
  }, [chunks.length, animationSpeed, accessibilitySettings.focusMode, accessibilitySettings.reducedMotion, accessibilitySettings.readingRuler]);

  // Auto-save accessibility settings
  useEffect(() => {
    if (accessibilitySettings.autoSave) {
      localStorage.setItem(`rightbrain-accessibility-${userId}`, JSON.stringify(accessibilitySettings));
    }
  }, [accessibilitySettings, userId]);

  // Load saved accessibility settings
  useEffect(() => {
    const saved = localStorage.getItem(`rightbrain-accessibility-${userId}`);
    if (saved) {
      try {
        setAccessibilitySettings(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load accessibility settings:', e);
      }
    }
  }, [userId]);

  // Text-to-speech functionality
  useEffect(() => {
    if (accessibilitySettings.textToSpeech && activeAnalysis) {
      if (speechSynthRef.current) {
        speechSynthesis.cancel();
      }
      
      const utterance = new SpeechSynthesisUtterance(activeAnalysis.coreIdea);
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      speechSynthRef.current = utterance;
      speechSynthesis.speak(utterance);
    }
    
    return () => {
      if (speechSynthRef.current) {
        speechSynthesis.cancel();
      }
    };
  }, [activeChunkIndex, accessibilitySettings.textToSpeech, activeAnalysis]);

  // Cache chunk anchors for PDF sync
  useEffect(() => {
    chunks.forEach((chunk, index) => {
      const chunkId = stableChunkId(chunk);
      cacheChunkAnchor(chunkId, chunk, currentPage);
    });
  }, [chunks, currentPage, cacheChunkAnchor]);

  // Find current chapter info
  const currentChapter = useMemo(() => {
    return findNearestChapter(currentPage);
  }, [currentPage, findNearestChapter]);

  // Memory palace rooms
  const memoryRooms = useMemo(
    () => chunkAnalyses.map((analysis, index) => 
      generateMemoryPalaceRoom(analysis, index)
    ),
    [chunkAnalyses]
  );

  // Navigation handlers
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setPage(newPage, "manual");
      onPageChange?.(newPage);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setPage(newPage, "manual");
      onPageChange?.(newPage);
    }
  };

  const handleJumpToChapter = (tocEntry: TOCEntry) => {
    if (accessibilitySettings.confirmActions) {
      if (!confirm(`Jump to "${tocEntry.title}"?`)) return;
    }
    
    const success = syncToChapter(tocEntry.title);
    if (success) {
      // Find the new page after sync
      const newChapter = findNearestChapter(currentPage);
      if (newChapter) {
        onPageChange?.(newChapter.page);
        setShowTOC(false);
        
        // Mark chapter as visited for OCD completion tracking
        if (accessibilitySettings.completionTracking) {
          setCompletedChunks(prev => new Set([...prev, `chapter-${tocEntry.title}`]));
        }
      }
    }
  };

  const handleChunkComplete = (chunkIndex: number) => {
    if (accessibilitySettings.completionTracking) {
      const chunkId = stableChunkId(chunks[chunkIndex]);
      setCompletedChunks(prev => new Set([...prev, chunkId]));
      
      // Auto-save completion state
      if (accessibilitySettings.autoSave) {
        const completedArray = Array.from(completedChunks);
        completedArray.push(chunkId);
        localStorage.setItem(`rightbrain-completed-${bookId}-${userId}`, JSON.stringify(completedArray));
      }
    }
  };

  // Load completed chunks
  useEffect(() => {
    if (accessibilitySettings.completionTracking) {
      const saved = localStorage.getItem(`rightbrain-completed-${bookId}-${userId}`);
      if (saved) {
        try {
          const completedArray = JSON.parse(saved);
          setCompletedChunks(new Set(completedArray));
        } catch (e) {
          console.warn('Failed to load completion state:', e);
        }
      }
    }
  }, [bookId, userId, accessibilitySettings.completionTracking]);

  const handleVisualElementClick = async (chunkIndex: number, elementText: string) => {
    // Set active chunk
    setActiveChunkIndex(chunkIndex);
    
    // Update reading ruler position
    if (accessibilitySettings.readingRuler) {
      setReadingRulerPosition(chunkIndex);
    }
    
    // Try to sync with PDF if we have a page container
    const chunkId = stableChunkId(chunks[chunkIndex]);
    const pageContainer = document.querySelector(`[data-page-number="${currentPage}"]`) as HTMLElement;
    
    if (pageContainer) {
      await syncChunkToPDF(chunkId, pageContainer);
    }
    
    // Mark chunk as completed for OCD tracking
    handleChunkComplete(chunkIndex);
    
    // Call original click handler
    onWordClick?.(elementText);
  };

  // Accessibility helper functions
  const getDyslexiaFontFamily = () => {
    if (accessibilitySettings.dyslexiaFont) {
      return '"OpenDyslexic", "Comic Sans MS", Arial, sans-serif';
    }
    return propFontFamily;
  };

  const getAccessibleTextStyle = () => ({
    fontFamily: getDyslexiaFontFamily(),
    fontSize: `${accessibilitySettings.fontSize}px`,
    lineHeight: accessibilitySettings.lineSpacing,
    letterSpacing: `${accessibilitySettings.letterSpacing}em`,
    filter: accessibilitySettings.highContrast ? 'contrast(150%)' : 'none',
  });

  const getColorOverlayStyle = () => {
    if (accessibilitySettings.colorOverlay === 'none') return {};
    
    const overlays = {
      yellow: 'rgba(255, 255, 0, 0.1)',
      blue: 'rgba(173, 216, 230, 0.2)',
      green: 'rgba(144, 238, 144, 0.15)',
      pink: 'rgba(255, 192, 203, 0.15)',
    };
    
    return {
      backgroundColor: overlays[accessibilitySettings.colorOverlay as keyof typeof overlays] || 'transparent'
    };
  };

  const renderMindMap = () => (
    <div className="relative w-full h-full bg-gradient-to-br from-purple-900/20 to-blue-900/20 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Central concept */}
        <div className="absolute z-20 bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-4 rounded-full font-bold text-lg shadow-2xl">
          Main Concept
        </div>
        
        {/* Surrounding concept bubbles */}
        {chunkAnalyses.map((analysis, index) => {
          const angle = (index / chunkAnalyses.length) * 2 * Math.PI;
          const radius = 200 + (index % 3) * 50;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isActive = index === activeChunkIndex;
          
          return (
            <div
              key={index}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-500 ${
                isActive ? 'scale-125 z-10' : 'scale-100 z-5'
              }`}
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                backgroundColor: analysis.colorCode + '40',
                borderColor: analysis.colorCode,
              }}
              onClick={() => handleVisualElementClick(index, chunks[index])}
            >
              <div className={`p-4 rounded-lg border-2 max-w-xs ${
                isActive ? 'shadow-2xl ring-4 ring-yellow-400/50' : 'shadow-lg'
              }`}>
                <div className="text-sm font-semibold mb-2 text-white">
                  {analysis.coreIdea.slice(0, 40)}...
                </div>
                <div className="text-xs opacity-80 text-gray-200">
                  {analysis.visualMetaphor.metaphor}
                </div>
                {isActive && (
                  <div className="mt-2 text-xs text-yellow-200">
                    🎬 {analysis.mindMovieScene.slice(0, 60)}...
                  </div>
                )}
              </div>
              
              {/* Connection lines */}
              {showConnections && index > 0 && (
                <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }}>
                  <line
                    x1="50%"
                    y1="50%"
                    x2={`calc(50% - ${x}px)`}
                    y2={`calc(50% - ${y}px)`}
                    stroke={analysis.colorCode}
                    strokeWidth="2"
                    strokeOpacity="0.3"
                    strokeDasharray="5,5"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMemoryPalace = () => {
    const currentRoom = memoryRooms[activeChunkIndex];
    if (!currentRoom) return null;

    return (
      <div className="w-full h-full bg-gradient-to-b from-amber-900/20 to-brown-900/20 relative overflow-hidden">
        {/* Room background */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-800/10 to-orange-800/10" />
        
        {/* Room title */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20">
          <h2 className="text-2xl font-bold text-amber-200 bg-black/50 px-6 py-2 rounded-lg">
            🏛️ {currentRoom.roomName}
          </h2>
        </div>
        
        {/* Room description */}
        <div className="absolute top-20 left-8 right-8 z-10">
          <p className="text-amber-100 bg-black/40 p-4 rounded-lg text-center italic">
            {currentRoom.description}
          </p>
        </div>
        
        {/* Memory objects */}
        <div className="absolute inset-0 pt-32">
          {currentRoom.objects.map((obj, index) => {
            const positions = {
              "center": { left: "50%", top: "50%", transform: "translate(-50%, -50%)" },
              "left wall": { left: "20%", top: "40%", transform: "translate(-50%, -50%)" },
              "right wall": { right: "20%", top: "40%", transform: "translate(50%, -50%)" },
              "corner": { left: "80%", top: "20%", transform: "translate(-50%, -50%)" },
              "ceiling": { left: "50%", top: "20%", transform: "translate(-50%, -50%)" },
            };
            
            return (
              <div
                key={index}
                className="absolute cursor-pointer transition-all duration-300 hover:scale-110"
                style={positions[obj.position as keyof typeof positions]}
                onClick={() => handleVisualElementClick(activeChunkIndex, obj.concept)}
              >
                <div className="bg-gradient-to-br from-yellow-400/80 to-orange-500/80 text-black p-3 rounded-lg shadow-xl border-2 border-yellow-300">
                  <div className="font-bold text-sm">{obj.name}</div>
                  <div className="text-xs opacity-80">{obj.concept}</div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Navigation */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={() => setActiveChunkIndex(Math.max(0, activeChunkIndex - 1))}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
            disabled={activeChunkIndex === 0}
          >
            ← Previous Room
          </button>
          <span className="px-4 py-2 bg-black/50 text-amber-200 rounded-lg">
            Room {activeChunkIndex + 1} of {memoryRooms.length}
          </span>
          <button
            onClick={() => setActiveChunkIndex(Math.min(memoryRooms.length - 1, activeChunkIndex + 1))}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
            disabled={activeChunkIndex === memoryRooms.length - 1}
          >
            Next Room →
          </button>
        </div>
      </div>
    );
  };

  const renderStoryboard = () => {
    if (!activeAnalysis) return null;

    return (
      <div className="w-full h-full bg-gradient-to-br from-indigo-900/20 to-purple-900/20 p-8">
        {/* Storyboard panels */}
        <div className="grid grid-cols-3 gap-6 h-full">
          {/* Scene Setup */}
          <div className="bg-gradient-to-br from-blue-800/30 to-indigo-800/30 rounded-lg p-6 border border-blue-500/30">
            <h3 className="text-lg font-bold text-blue-300 mb-4">🎬 Scene Setup</h3>
            <div className="space-y-4">
              <div className="bg-black/30 p-3 rounded">
                <div className="text-sm font-medium text-blue-200">Setting:</div>
                <div className="text-xs text-gray-300">{activeAnalysis.visualMetaphor.imagery}</div>
              </div>
              <div className="bg-black/30 p-3 rounded">
                <div className="text-sm font-medium text-blue-200">Mood:</div>
                <div className="text-xs text-gray-300 capitalize">{activeAnalysis.emotionalTone}</div>
              </div>
            </div>
          </div>
          
          {/* Main Action */}
          <div className="bg-gradient-to-br from-purple-800/30 to-pink-800/30 rounded-lg p-6 border border-purple-500/30">
            <h3 className="text-lg font-bold text-purple-300 mb-4">⚡ Main Action</h3>
            <div className="bg-black/30 p-4 rounded h-32 flex items-center justify-center">
              <p className="text-sm text-purple-200 text-center italic leading-relaxed">
                {activeAnalysis.mindMovieScene}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeAnalysis.keyTerms.map((term, idx) => (
                <span 
                  key={idx}
                  className="px-2 py-1 bg-purple-500/20 text-purple-200 rounded text-xs cursor-pointer hover:bg-purple-500/30"
                  onClick={() => handleVisualElementClick(activeChunkIndex, term)}
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
          
          {/* Resolution */}
          <div className="bg-gradient-to-br from-green-800/30 to-emerald-800/30 rounded-lg p-6 border border-green-500/30">
            <h3 className="text-lg font-bold text-green-300 mb-4">✨ Resolution</h3>
            <div className="space-y-4">
              <div className="bg-black/30 p-3 rounded">
                <div className="text-sm font-medium text-green-200">Core Insight:</div>
                <div className="text-xs text-gray-300">{activeAnalysis.coreIdea}</div>
              </div>
              <div className="bg-black/30 p-3 rounded">
                <div className="text-sm font-medium text-green-200">Memory Anchor:</div>
                <div className="text-xs text-gray-300">{activeAnalysis.visualMetaphor.metaphor}</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Storyboard navigation */}
        <div className="mt-6 flex justify-center">
          <div className="flex gap-2">
            {chunks.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveChunkIndex(index)}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === activeChunkIndex 
                    ? "bg-yellow-400" 
                    : "bg-gray-600 hover:bg-gray-500"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderConceptWeb = () => (
    <div className="relative w-full h-full bg-gradient-to-br from-teal-900/20 to-cyan-900/20 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full">
        {/* Connection lines */}
        {showConnections && conceptNodes.map(node => 
          node.connections.map(connectionId => {
            const connectedNode = conceptNodes.find(n => n.id === connectionId);
            if (!connectedNode) return null;
            
            return (
              <line
                key={`${node.id}-${connectionId}`}
                x1={node.x}
                y1={node.y}
                x2={connectedNode.x}
                y2={connectedNode.y}
                stroke="rgba(34, 197, 94, 0.3)"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            );
          })
        )}
        
        {/* Concept nodes */}
        {conceptNodes.map((node, index) => {
          const isActive = index === activeChunkIndex;
          
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={isActive ? node.size * 0.8 : node.size * 0.6}
                fill={node.color + '60'}
                stroke={node.color}
                strokeWidth={isActive ? "4" : "2"}
                className="cursor-pointer transition-all duration-300"
                onClick={() => handleVisualElementClick(index, chunks[index])}
              />
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs fill-white pointer-events-none font-medium"
                style={{ fontSize: isActive ? '12px' : '10px' }}
              >
                {node.text.slice(0, 20)}
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Active concept details */}
      {activeAnalysis && (
        <div className="absolute bottom-8 left-8 right-8 bg-black/80 p-4 rounded-lg">
          <h4 className="text-lg font-bold text-cyan-300 mb-2">
            {activeAnalysis.visualMetaphor.metaphor}
          </h4>
          <p className="text-sm text-cyan-100 mb-3">
            {activeAnalysis.coreIdea}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onGenerateNote?.(chunks[activeChunkIndex], activeAnalysis.visualMetaphor.metaphor, "sketch")}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs"
            >
              🎨 Sketch This
            </button>
            <button
              onClick={() => onTextSelect?.(activeAnalysis.mindMovieScene)}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
            >
              🎬 Copy Scene
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Visual Mode Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-purple-400">🧠 Visual Right-Brain Reading</h3>
          <div className="flex gap-2">
            {[
              { mode: "mindMap", icon: "🗺️", label: "Mind Map" },
              { mode: "memoryPalace", icon: "🏛️", label: "Memory Palace" },
              { mode: "storyboard", icon: "🎬", label: "Storyboard" },
              { mode: "conceptWeb", icon: "🕸️", label: "Concept Web" },
            ].map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setVisualMode(mode as VisualMode)}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  visualMode === mode
                    ? "bg-purple-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Speed:</label>
            <input
              type="range"
              min={1000}
              max={5000}
              step={500}
              value={animationSpeed}
              onChange={(e) => setAnimationSpeed(Number(e.target.value))}
              className="w-20 accent-purple-400"
              disabled={accessibilitySettings.focusMode}
            />
            <span className="text-xs text-gray-400">{animationSpeed / 1000}s</span>
          </div>
          
          <button
            onClick={() => setShowConnections(!showConnections)}
            className={`px-3 py-1 rounded text-xs ${
              showConnections
                ? "bg-green-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {showConnections ? "Hide" : "Show"} Connections
          </button>
          
          {/* TOC Toggle - NEW FEATURE */}
          <button
            onClick={() => setShowTOC(!showTOC)}
            className={`px-3 py-1 rounded text-xs relative ${
              showTOC 
                ? "bg-purple-600 text-white" 
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            disabled={!tableOfContents.length}
            title="NEW: Table of Contents with chapter navigation"
          >
            📑 TOC
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          </button>
          
          {/* Accessibility Toggle - NEW FEATURE */}
          <button
            onClick={() => setShowAccessibilityPanel(!showAccessibilityPanel)}
            className={`px-3 py-1 rounded text-xs relative ${
              showAccessibilityPanel 
                ? "bg-blue-600 text-white" 
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            title="NEW: Accessibility settings for dyslexia & OCD support"
          >
            ♿ Access
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          </button>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 text-white rounded text-sm transition-colors"
          >
            ← Previous
          </button>
          
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-300">Page</span>
            <span className="bg-purple-600 text-white px-2 py-1 rounded font-mono">
              {currentPage}
            </span>
            <span className="text-gray-400">of {totalPages}</span>
          </div>
          
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 text-white rounded text-sm transition-colors"
          >
            Next →
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Chapter Info */}
          {currentChapter && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Chapter:</span>
              <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs max-w-48 truncate">
                {currentChapter.title}
              </span>
            </div>
          )}
          
          {/* TOC Quick Jump */}
          {tableOfContents.length > 0 && (
            <select
              onChange={(e) => {
                const selectedIndex = e.target.value;
                if (selectedIndex) {
                  const tocEntry = tableOfContents[parseInt(selectedIndex)];
                  if (tocEntry) {
                    handleJumpToChapter(tocEntry);
                  }
                }
              }}
              className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-purple-500 outline-none"
              value=""
            >
              <option value="">Jump to Chapter...</option>
              {tableOfContents.map((entry, index) => (
                <option key={index} value={index.toString()}>
                  {entry.title} (p.{entry.pageNumber})
                </option>
              ))}
            </select>
          )}
          
          {/* Chunk Progress */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Chunk:</span>
            <span className="bg-gray-700 px-2 py-1 rounded">
              {activeChunkIndex + 1}/{chunks.length}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Content Area */}
      <div 
        ref={contentRef}
        className="flex-1 relative"
        style={{
          ...getColorOverlayStyle(),
          filter: accessibilitySettings.highContrast ? 'contrast(150%)' : 'none',
        }}
      >
        {/* Reading Ruler for Dyslexia Support */}
        {accessibilitySettings.readingRuler && (
          <div 
            className="absolute left-0 right-0 h-1 bg-yellow-400/50 z-30 transition-all duration-300"
            style={{
              top: `${(readingRulerPosition / chunks.length) * 100}%`,
            }}
          />
        )}
        
        {/* Focus Mode Overlay */}
        {accessibilitySettings.focusMode && (
          <div className="absolute inset-0 bg-black/60 z-20 pointer-events-none">
            <div 
              className="absolute bg-transparent border-4 border-yellow-400 rounded-lg pointer-events-none"
              style={{
                left: '25%',
                top: '25%',
                width: '50%',
                height: '50%',
              }}
            />
          </div>
        )}
        
        {/* Visual Content */}
        <div style={getAccessibleTextStyle()}>
          {visualMode === "mindMap" && renderMindMap()}
          {visualMode === "memoryPalace" && renderMemoryPalace()}
          {visualMode === "storyboard" && renderStoryboard()}
          {visualMode === "conceptWeb" && renderConceptWeb()}
        </div>
        
        {/* Completion Progress for OCD Support */}
        {accessibilitySettings.showProgress && accessibilitySettings.completionTracking && (
          <div className="absolute top-4 right-4 bg-black/80 p-3 rounded-lg z-30">
            <div className="text-xs text-gray-300 mb-2">Progress</div>
            <div className="flex gap-1">
              {chunks.map((chunk, index) => {
                const chunkId = stableChunkId(chunk);
                const isCompleted = completedChunks.has(chunkId);
                return (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full ${
                      isCompleted ? 'bg-green-400' : 'bg-gray-600'
                    }`}
                    title={`Chunk ${index + 1}: ${isCompleted ? 'Completed' : 'Pending'}`}
                  />
                );
              })}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {completedChunks.size}/{chunks.length} completed
            </div>
          </div>
        )}
      </div>

      {/* TOC Overlay Panel */}
      {showTOC && tableOfContents.length > 0 && (
        <div className="absolute top-4 left-4 w-80 max-h-96 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-600 shadow-xl z-40">
          <div className="flex items-center justify-between p-3 border-b border-gray-600">
            <h5 className="text-sm font-semibold text-purple-300">📑 Table of Contents</h5>
            <button
              onClick={() => setShowTOC(false)}
              className="text-gray-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {tableOfContents.map((entry, idx) => {
              const isCurrentChapter = currentChapter?.title === entry.title;
              const isVisited = completedChunks.has(`chapter-${entry.title}`);
              
              return (
                <button
                  key={idx}
                  onClick={() => handleJumpToChapter(entry)}
                  className={`w-full text-left p-2 rounded text-sm transition-colors ${
                    isCurrentChapter
                      ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                      : isVisited && accessibilitySettings.completionTracking
                      ? "bg-green-600/20 text-green-200 border border-green-500/30"
                      : "text-gray-300 hover:bg-gray-700/50"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="truncate pr-2">{entry.title}</span>
                    <div className="flex items-center gap-2">
                      {isVisited && accessibilitySettings.completionTracking && (
                        <span className="text-green-400 text-xs">✓</span>
                      )}
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        p.{entry.pageNumber}
                      </span>
                    </div>
                  </div>
                  {entry.subChapters && entry.subChapters.length > 0 && (
                    <div className="ml-3 mt-1 space-y-1">
                      {entry.subChapters.slice(0, 3).map((sub, subIdx) => (
                        <button
                          key={subIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJumpToChapter(sub);
                          }}
                          className="block w-full text-left text-xs text-gray-400 hover:text-gray-200 truncate"
                        >
                          • {sub.title} (p.{sub.pageNumber})
                        </button>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Accessibility Settings Panel */}
      {showAccessibilityPanel && (
        <div className="absolute top-4 right-4 w-96 max-h-[80vh] bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-600 shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-gray-600">
            <h5 className="text-sm font-semibold text-blue-300">♿ Accessibility Settings</h5>
            <button
              onClick={() => setShowAccessibilityPanel(false)}
              className="text-gray-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
          
          <div className="max-h-96 overflow-y-auto p-4 space-y-4">
            {/* Dyslexia-Friendly Features */}
            <div className="space-y-3">
              <h6 className="text-sm font-medium text-yellow-300">📖 Dyslexia Support</h6>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.dyslexiaFont}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    dyslexiaFont: e.target.checked
                  }))}
                  className="accent-yellow-400"
                />
                <span>Use dyslexia-friendly font</span>
              </label>
              
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Font Size: {accessibilitySettings.fontSize}px</label>
                <input
                  type="range"
                  min={12}
                  max={24}
                  value={accessibilitySettings.fontSize}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    fontSize: Number(e.target.value)
                  }))}
                  className="w-full accent-yellow-400"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Line Spacing: {accessibilitySettings.lineSpacing}</label>
                <input
                  type="range"
                  min={1.2}
                  max={2.0}
                  step={0.1}
                  value={accessibilitySettings.lineSpacing}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    lineSpacing: Number(e.target.value)
                  }))}
                  className="w-full accent-yellow-400"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Color Overlay</label>
                <select
                  value={accessibilitySettings.colorOverlay}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    colorOverlay: e.target.value
                  }))}
                  className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                >
                  <option value="none">None</option>
                  <option value="yellow">Yellow Tint</option>
                  <option value="blue">Blue Tint</option>
                  <option value="green">Green Tint</option>
                  <option value="pink">Pink Tint</option>
                </select>
              </div>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.readingRuler}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    readingRuler: e.target.checked
                  }))}
                  className="accent-yellow-400"
                />
                <span>Show reading ruler</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.textToSpeech}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    textToSpeech: e.target.checked
                  }))}
                  className="accent-yellow-400"
                />
                <span>Text-to-speech</span>
              </label>
            </div>

            {/* OCD-Friendly Features */}
            <div className="space-y-3 border-t border-gray-600 pt-4">
              <h6 className="text-sm font-medium text-green-300">✅ OCD Support</h6>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.completionTracking}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    completionTracking: e.target.checked
                  }))}
                  className="accent-green-400"
                />
                <span>Track completion progress</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.confirmActions}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    confirmActions: e.target.checked
                  }))}
                  className="accent-green-400"
                />
                <span>Confirm important actions</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.symmetricLayout}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    symmetricLayout: e.target.checked
                  }))}
                  className="accent-green-400"
                />
                <span>Symmetric layout</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.autoSave}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    autoSave: e.target.checked
                  }))}
                  className="accent-green-400"
                />
                <span>Auto-save preferences</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.showProgress}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    showProgress: e.target.checked
                  }))}
                  className="accent-green-400"
                />
                <span>Show progress indicators</span>
              </label>
            </div>

            {/* General Accessibility */}
            <div className="space-y-3 border-t border-gray-600 pt-4">
              <h6 className="text-sm font-medium text-blue-300">🔧 General</h6>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.highContrast}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    highContrast: e.target.checked
                  }))}
                  className="accent-blue-400"
                />
                <span>High contrast mode</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.reducedMotion}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    reducedMotion: e.target.checked
                  }))}
                  className="accent-blue-400"
                />
                <span>Reduce motion/animations</span>
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessibilitySettings.focusMode}
                  onChange={(e) => setAccessibilitySettings(prev => ({
                    ...prev,
                    focusMode: e.target.checked
                  }))}
                  className="accent-blue-400"
                />
                <span>Focus mode (highlight center)</span>
              </label>
            </div>

            {/* Reset Button */}
            <div className="border-t border-gray-600 pt-4">
              <button
                onClick={() => {
                  if (!accessibilitySettings.confirmActions || confirm('Reset all accessibility settings?')) {
                    setAccessibilitySettings(defaultAccessibilitySettings);
                  }
                }}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
