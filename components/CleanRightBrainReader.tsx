"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis 
} from "@/lib/rightBrainReading";

type VRBUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface CleanRightBrainReaderProps {
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
  tableOfContents?: any[];
  onPageChange?: (page: number) => void;
}

function unitToText(u: VRBUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Visual Learning Modes - completely different from text-based approaches
type VisualMode = "galaxy" | "forest" | "city" | "ocean" | "mountain";

// Concept Node for 3D-like visualization
interface ConceptNode {
  id: string;
  concept: string;
  x: number;
  y: number;
  z: number; // Depth for 3D effect
  size: number;
  color: string;
  connections: string[];
  importance: number;
  category: "main" | "supporting" | "detail" | "example";
}

// Visual Metaphor System
interface VisualMetaphor {
  type: "galaxy" | "forest" | "city" | "ocean" | "mountain";
  elements: Array<{
    id: string;
    concept: string;
    visualElement: string;
    position: { x: number; y: number; z: number };
    animation: string;
    interaction: string;
  }>;
  narrative: string;
  soundscape?: string;
}

// Generate visual metaphor from text
function generateVisualMetaphor(text: string, mode: VisualMode): VisualMetaphor {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const concepts = sentences.map(s => s.trim().slice(0, 50));
  
  const metaphorGenerators = {
    galaxy: () => ({
      type: "galaxy" as const,
      elements: concepts.map((concept, i) => ({
        id: `star-${i}`,
        concept,
        visualElement: i === 0 ? "central-star" : i < 3 ? "planet" : "asteroid",
        position: {
          x: i === 0 ? 400 : 200 + Math.cos(i * 0.8) * (100 + i * 30),
          y: i === 0 ? 300 : 200 + Math.sin(i * 0.8) * (100 + i * 30),
          z: i * 10
        },
        animation: i === 0 ? "pulse" : "orbit",
        interaction: "gravitational-pull"
      })),
      narrative: "Navigate through a cosmic knowledge system where concepts orbit around central ideas like planets around stars.",
      soundscape: "cosmic-ambient"
    }),
    
    forest: () => ({
      type: "forest" as const,
      elements: concepts.map((concept, i) => ({
        id: `tree-${i}`,
        concept,
        visualElement: i === 0 ? "ancient-oak" : i < 3 ? "tall-pine" : "flowering-bush",
        position: {
          x: 100 + (i % 4) * 150,
          y: 500 - (Math.floor(i / 4) * 100) - Math.random() * 50,
          z: Math.random() * 50
        },
        animation: "sway",
        interaction: "root-connection"
      })),
      narrative: "Explore a living forest of knowledge where ideas grow and interconnect through root systems.",
      soundscape: "forest-ambient"
    }),
    
    city: () => ({
      type: "city" as const,
      elements: concepts.map((concept, i) => ({
        id: `building-${i}`,
        concept,
        visualElement: i === 0 ? "skyscraper" : i < 3 ? "office-building" : "house",
        position: {
          x: 50 + (i % 5) * 120,
          y: 400 - (i < 3 ? 150 : 50),
          z: i * 5
        },
        animation: "lights-flicker",
        interaction: "network-connection"
      })),
      narrative: "Navigate a bustling city of ideas where concepts are buildings connected by information highways.",
      soundscape: "urban-ambient"
    }),
    
    ocean: () => ({
      type: "ocean" as const,
      elements: concepts.map((concept, i) => ({
        id: `sea-${i}`,
        concept,
        visualElement: i === 0 ? "whale" : i < 3 ? "dolphin" : "fish",
        position: {
          x: 100 + Math.random() * 600,
          y: 200 + i * 40 + Math.random() * 100,
          z: Math.random() * 100
        },
        animation: "swim",
        interaction: "current-flow"
      })),
      narrative: "Dive into an ocean of knowledge where concepts flow like sea creatures in underwater currents.",
      soundscape: "ocean-ambient"
    }),
    
    mountain: () => ({
      type: "mountain" as const,
      elements: concepts.map((concept, i) => ({
        id: `peak-${i}`,
        concept,
        visualElement: i === 0 ? "summit" : i < 3 ? "cliff" : "boulder",
        position: {
          x: 400 + (i - concepts.length/2) * 80,
          y: 500 - i * 60 - Math.random() * 30,
          z: i * 15
        },
        animation: "mist-swirl",
        interaction: "elevation-connection"
      })),
      narrative: "Climb a mountain of understanding where concepts build upon each other toward enlightenment.",
      soundscape: "mountain-ambient"
    })
  };
  
  return metaphorGenerators[mode]();
}

// 3D-like visual effects
function Visual3DElement({ 
  element, 
  isActive, 
  onClick,
  mode 
}: { 
  element: any, 
  isActive: boolean, 
  onClick: () => void,
  mode: VisualMode 
}) {
  const getElementStyle = () => {
    const baseStyle = {
      position: "absolute" as const,
      left: element.position.x,
      top: element.position.y,
      transform: `translateZ(${element.position.z}px) scale(${isActive ? 1.2 : 1})`,
      transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      cursor: "pointer",
      zIndex: Math.round(element.position.z / 10) + 10,
    };
    
    return baseStyle;
  };

  const getElementContent = () => {
    const colors = {
      galaxy: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"],
      forest: ["#228B22", "#32CD32", "#90EE90", "#8FBC8F", "#98FB98"],
      city: ["#708090", "#4682B4", "#5F9EA0", "#6495ED", "#87CEEB"],
      ocean: ["#0077BE", "#00CED1", "#20B2AA", "#48D1CC", "#40E0D0"],
      mountain: ["#8B4513", "#A0522D", "#CD853F", "#D2B48C", "#F4A460"]
    };
    
    const color = colors[mode][Math.floor(Math.random() * colors[mode].length)];
    
    switch (element.visualElement) {
      case "central-star":
      case "summit":
        return (
          <div className="relative">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-2xl"
              style={{ 
                background: `radial-gradient(circle, ${color}, ${color}80)`,
                boxShadow: `0 0 30px ${color}60`
              }}
            >
              💫
            </div>
            {isActive && (
              <div className="absolute -inset-4 border-2 border-yellow-400 rounded-full animate-pulse" />
            )}
          </div>
        );
        
      case "planet":
      case "tall-pine":
      case "office-building":
      case "dolphin":
      case "cliff":
        return (
          <div className="relative">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-lg"
              style={{ backgroundColor: color }}
            >
              {mode === "galaxy" ? "🪐" : 
               mode === "forest" ? "🌲" : 
               mode === "city" ? "🏢" : 
               mode === "ocean" ? "🐬" : "⛰️"}
            </div>
            {isActive && (
              <div className="absolute -inset-2 border border-yellow-400 rounded-full animate-pulse" />
            )}
          </div>
        );
        
      default:
        return (
          <div className="relative">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs shadow-md"
              style={{ backgroundColor: color }}
            >
              {mode === "galaxy" ? "✨" : 
               mode === "forest" ? "🌿" : 
               mode === "city" ? "🏠" : 
               mode === "ocean" ? "🐟" : "🗿"}
            </div>
            {isActive && (
              <div className="absolute -inset-1 border border-yellow-400 rounded-full animate-pulse" />
            )}
          </div>
        );
    }
  };

  return (
    <div style={getElementStyle()} onClick={onClick}>
      {getElementContent()}
      
      {/* Concept label */}
      <div 
        className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 ${
          isActive 
            ? "bg-yellow-400 text-black shadow-lg scale-110" 
            : "bg-black/70 text-white"
        }`}
        style={{ 
          maxWidth: "120px",
          fontSize: isActive ? "11px" : "9px"
        }}
      >
        {element.concept.slice(0, 30)}...
      </div>
      
      {/* Animation effects */}
      {element.animation === "pulse" && (
        <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: element.color }} />
      )}
      
      {element.animation === "orbit" && isActive && (
        <div className="absolute inset-0 border border-dashed border-yellow-400 rounded-full animate-spin" style={{ animationDuration: "10s" }} />
      )}
    </div>
  );
}

// Connection lines between concepts
function ConnectionLines({ elements, activeId, mode }: { elements: any[], activeId: string | null, mode: VisualMode }) {
  if (!activeId) return null;
  
  const activeElement = elements.find(el => el.id === activeId);
  if (!activeElement) return null;
  
  // Find related elements (simple proximity-based for demo)
  const relatedElements = elements.filter(el => 
    el.id !== activeId && 
    Math.abs(el.position.x - activeElement.position.x) < 200 &&
    Math.abs(el.position.y - activeElement.position.y) < 200
  );
  
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {relatedElements.map(related => (
        <line
          key={`${activeId}-${related.id}`}
          x1={activeElement.position.x + 32} // Center of element
          y1={activeElement.position.y + 32}
          x2={related.position.x + 32}
          y2={related.position.y + 32}
          stroke="rgba(255, 215, 0, 0.6)"
          strokeWidth="2"
          strokeDasharray="5,5"
          className="animate-pulse"
        />
      ))}
    </svg>
  );
}

export default function CleanRightBrainReader({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  totalPages = 1,
  tableOfContents = [],
  onPageChange,
}: CleanRightBrainReaderProps) {
  const [visualMode, setVisualMode] = useState<VisualMode>("galaxy");
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const [showNarrative, setShowNarrative] = useState(true);
  const [autoExplore, setAutoExplore] = useState(false);
  const [explorationSpeed, setExplorationSpeed] = useState(3000);
  const [immersiveMode, setImmersiveMode] = useState(false);
  
  // Audio context for soundscapes
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Debug logging
  console.log("CleanRightBrainReader - thoughtUnits:", thoughtUnits?.length, "currentThoughtUnit:", currentThoughtUnit);

  // Empty state
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">🧠</div>
          <h2 className="text-2xl font-bold mb-2">Visual Right-Brain Learning</h2>
          <p className="text-gray-300">Upload a PDF to begin your visual journey through knowledge</p>
        </div>
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  console.log("CleanRightBrainReader - rawUnit:", rawUnit);
  
  if (!rawUnit) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">🌌</div>
          <p className="text-gray-300">Generating your visual learning experience...</p>
          <p className="text-xs text-gray-400 mt-2">
            Unit {currentThoughtUnit} of {thoughtUnits.length}
          </p>
        </div>
      </div>
    );
  }

  const unitText = unitToText(rawUnit);
  console.log("CleanRightBrainReader - unitText:", unitText?.slice(0, 100));

  // If unitText is empty or too short, show a helpful message
  if (!unitText || unitText.trim().length < 10) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">📖</div>
          <h2 className="text-xl font-bold mb-2">Content Processing</h2>
          <p className="text-gray-300 mb-4">
            This section appears to have minimal text content. Try navigating to a different section with more substantial content.
          </p>
          <div className="text-sm text-gray-400">
            <p>Current unit: {currentThoughtUnit} of {thoughtUnits.length}</p>
            <p>Text length: {unitText?.length || 0} characters</p>
          </div>
        </div>
      </div>
    );
  }

  // Generate visual metaphor
  const visualMetaphor = useMemo(() => 
    generateVisualMetaphor(unitText, visualMode),
    [unitText, visualMode]
  );

  // Auto-exploration
  useEffect(() => {
    if (!autoExplore || !visualMetaphor.elements.length) return;
    
    let currentIndex = 0;
    const interval = setInterval(() => {
      setActiveElementId(visualMetaphor.elements[currentIndex].id);
      currentIndex = (currentIndex + 1) % visualMetaphor.elements.length;
    }, explorationSpeed);
    
    return () => clearInterval(interval);
  }, [autoExplore, explorationSpeed, visualMetaphor.elements]);

  // Background generation based on mode
  const getBackgroundStyle = () => {
    const backgrounds = {
      galaxy: "bg-gradient-to-br from-indigo-900 via-purple-900 to-black",
      forest: "bg-gradient-to-br from-green-900 via-emerald-800 to-green-700",
      city: "bg-gradient-to-br from-gray-900 via-slate-800 to-gray-700",
      ocean: "bg-gradient-to-br from-blue-900 via-cyan-800 to-teal-700",
      mountain: "bg-gradient-to-br from-orange-900 via-amber-800 to-yellow-700"
    };
    
    return backgrounds[visualMode];
  };

  // Handle element interaction
  const handleElementClick = (element: any) => {
    setActiveElementId(element.id);
    onWordClick?.(element.concept);
    onTextSelect?.(element.concept);
    
    // Generate note based on concept
    if (onGenerateNote) {
      const noteText = `Visual Concept: ${element.concept}\n\nMetaphor: ${element.visualElement} in ${visualMode}\n\nContext: ${visualMetaphor.narrative}`;
      onGenerateNote(noteText, element.concept, "sketch");
    }
  };

  const activeElement = visualMetaphor.elements.find(el => el.id === activeElementId);

  return (
    <div className={`h-full relative overflow-hidden ${getBackgroundStyle()}`}>
      {/* Immersive Mode Overlay */}
      {immersiveMode && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="text-8xl mb-4">🧘‍♂️</div>
            <h2 className="text-3xl font-bold mb-4">Immersive Learning Mode</h2>
            <p className="text-xl mb-8">Focus on the visual journey</p>
            <button
              onClick={() => setImmersiveMode(false)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-medium"
            >
              Exit Immersion
            </button>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute top-4 left-4 right-4 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-bold text-white">🧠 Visual Learning Journey</h3>
            
            {/* Mode Selection */}
            <div className="flex gap-2">
              {[
                { mode: "galaxy", icon: "🌌", label: "Galaxy" },
                { mode: "forest", icon: "🌲", label: "Forest" },
                { mode: "city", icon: "🏙️", label: "City" },
                { mode: "ocean", icon: "🌊", label: "Ocean" },
                { mode: "mountain", icon: "⛰️", label: "Mountain" },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setVisualMode(mode as VisualMode);
                    setActiveElementId(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    visualMode === mode
                      ? "bg-white text-black shadow-lg scale-105"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto Explore */}
            <button
              onClick={() => setAutoExplore(!autoExplore)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                autoExplore
                  ? "bg-green-600 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {autoExplore ? "⏸️ Pause" : "▶️ Auto Explore"}
            </button>

            {/* Speed Control */}
            {autoExplore && (
              <div className="flex items-center gap-2">
                <span className="text-white text-xs">Speed:</span>
                <input
                  type="range"
                  min={1000}
                  max={5000}
                  step={500}
                  value={explorationSpeed}
                  onChange={(e) => setExplorationSpeed(Number(e.target.value))}
                  className="w-20 accent-purple-400"
                />
              </div>
            )}

            {/* Immersive Mode */}
            <button
              onClick={() => setImmersiveMode(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white"
            >
              🧘‍♂️ Immerse
            </button>
          </div>
        </div>
      </div>

      {/* Main Visual Area */}
      <div className="absolute inset-0 pt-20" style={{ perspective: "1000px" }}>
        {/* Connection Lines */}
        <ConnectionLines 
          elements={visualMetaphor.elements} 
          activeId={activeElementId} 
          mode={visualMode}
        />
        
        {/* Visual Elements */}
        {visualMetaphor.elements.map((element) => (
          <Visual3DElement
            key={element.id}
            element={element}
            isActive={element.id === activeElementId}
            onClick={() => handleElementClick(element)}
            mode={visualMode}
          />
        ))}
        
        {/* Ambient Particles */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Narrative Panel */}
      {showNarrative && (
        <div className="absolute bottom-4 left-4 right-4 z-30">
          <div className="bg-black/80 backdrop-blur-sm rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">🎭 Learning Narrative</h4>
              <button
                onClick={() => setShowNarrative(false)}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <p className="text-sm leading-relaxed mb-4 opacity-90">
              {visualMetaphor.narrative}
            </p>
            
            {/* Active Element Details */}
            {activeElement && (
              <div className="border-t border-white/20 pt-4">
                <h5 className="text-sm font-semibold mb-2 text-yellow-400">
                  🎯 Current Focus: {activeElement.visualElement}
                </h5>
                <p className="text-sm opacity-80">
                  {activeElement.concept}
                </p>
                
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onGenerateNote?.(activeElement.concept, activeElement.visualElement, "sketch")}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs"
                  >
                    🎨 Sketch This
                  </button>
                  <button
                    onClick={() => onGenerateNote?.(activeElement.concept, activeElement.visualElement, "highYield")}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs"
                  >
                    📝 Study Note
                  </button>
                  <button
                    onClick={() => onTextSelect?.(activeElement.concept)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                  >
                    💭 Explore More
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mini Navigation */}
      <div className="absolute top-20 right-4 z-30">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3 text-white">
          <div className="text-xs opacity-75 mb-2">Navigation</div>
          <div className="space-y-2">
            <div className="text-xs">
              Unit: {currentThoughtUnit} / {thoughtUnits.length}
            </div>
            <div className="text-xs">
              Concepts: {visualMetaphor.elements.length}
            </div>
            <div className="text-xs">
              Mode: {visualMode}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Narrative Toggle */}
      {!showNarrative && (
        <button
          onClick={() => setShowNarrative(true)}
          className="absolute bottom-4 right-4 z-30 w-12 h-12 bg-purple-600 hover:bg-purple-500 rounded-full flex items-center justify-center text-white shadow-lg"
        >
          🎭
        </button>
      )}

      {/* Keyboard Shortcuts Help */}
      <div className="absolute bottom-4 left-4 z-20 bg-black/40 backdrop-blur-sm rounded p-2 text-white text-xs opacity-50 hover:opacity-100 transition-opacity">
        <div className="font-medium mb-1">Shortcuts:</div>
        <div>Click: Focus concept</div>
        <div>Space: Toggle auto-explore</div>
        <div>1-5: Switch modes</div>
      </div>

      {/* Keyboard Controls */}
      <div className="sr-only">
        <button
          onKeyDown={(e) => {
            switch (e.key) {
              case " ":
                e.preventDefault();
                setAutoExplore(!autoExplore);
                break;
              case "1":
                setVisualMode("galaxy");
                break;
              case "2":
                setVisualMode("forest");
                break;
              case "3":
                setVisualMode("city");
                break;
              case "4":
                setVisualMode("ocean");
                break;
              case "5":
                setVisualMode("mountain");
                break;
            }
          }}
        />
      </div>
    </div>
  );
}
