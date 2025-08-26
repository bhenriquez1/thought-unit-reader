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

// David Butler-inspired medical/educational concept extraction
interface MedicalConcept {
  text: string;
  importance: number;
  type: "definition" | "process" | "relationship" | "example" | "principle";
  connections: string[];
}

function extractMedicalConcepts(text: string, sentences: string[]): MedicalConcept[] {
  const concepts: MedicalConcept[] = [];
  
  // Medical/educational keyword patterns (Butler-style)
  const patterns = {
    definitions: /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as|represents)\s+([^.!?]+)/gi,
    processes: /\b(process|mechanism|pathway|system|method|procedure)\s+(?:of|for|that)\s+([^.!?]+)/gi,
    relationships: /\b(causes?|leads? to|results? in|affects?|influences?|connects? to)\s+([^.!?]+)/gi,
    principles: /\b(principle|law|rule|theory|concept)\s+(?:of|that|states?)\s+([^.!?]+)/gi,
    examples: /\b(for example|such as|like|including|e\.g\.)\s+([^.!?]+)/gi
  };
  
  // Extract concepts with importance scoring
  Object.entries(patterns).forEach(([type, pattern]) => {
    let match;
    while ((match = pattern.exec(text)) !== null && concepts.length < 12) {
      const conceptText = match[0].trim();
      const importance = calculateImportance(conceptText, type as keyof typeof patterns);
      
      concepts.push({
        text: conceptText,
        importance,
        type: type as MedicalConcept['type'],
        connections: []
      });
    }
  });
  
  // If no specific patterns found, extract key sentences
  if (concepts.length === 0) {
    sentences.slice(0, 8).forEach((sentence, i) => {
      const importance = Math.max(0.3, 1 - (i * 0.1)); // Decreasing importance
      concepts.push({
        text: sentence.trim(),
        importance,
        type: "principle",
        connections: []
      });
    });
  }
  
  // Sort by importance and limit
  return concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);
}

function calculateImportance(text: string, type: string): number {
  let importance = 0.5; // Base importance
  
  // Type-based importance
  const typeWeights = {
    definitions: 0.9,
    principles: 0.8,
    processes: 0.7,
    relationships: 0.6,
    examples: 0.4
  };
  
  importance = typeWeights[type as keyof typeof typeWeights] || 0.5;
  
  // Content-based adjustments (Butler-style medical focus)
  const highValueTerms = [
    'pain', 'brain', 'nervous system', 'pathway', 'mechanism', 'treatment',
    'diagnosis', 'symptom', 'cause', 'effect', 'function', 'structure',
    'process', 'system', 'response', 'adaptation', 'healing', 'recovery'
  ];
  
  const medicalTerms = [
    'anatomy', 'physiology', 'pathology', 'therapy', 'clinical', 'patient',
    'medical', 'health', 'disease', 'condition', 'syndrome', 'disorder'
  ];
  
  // Boost importance for medical/educational terms
  const lowerText = text.toLowerCase();
  highValueTerms.forEach(term => {
    if (lowerText.includes(term)) importance += 0.1;
  });
  
  medicalTerms.forEach(term => {
    if (lowerText.includes(term)) importance += 0.05;
  });
  
  // Length and complexity adjustments
  if (text.length > 100) importance += 0.1;
  if (text.length < 30) importance -= 0.1;
  
  return Math.min(1.0, Math.max(0.1, importance));
}

// David Butler-inspired visual metaphor generation for medical/educational concepts
function generateVisualMetaphor(text: string, mode: VisualMode): VisualMetaphor {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Enhanced concept extraction with medical/educational focus
  const concepts = extractMedicalConcepts(text, sentences);
  
  const metaphorGenerators = {
    galaxy: () => ({
      type: "galaxy" as const,
      elements: concepts.map((concept, i) => ({
        id: `star-${i}`,
        concept: concept.text,
        visualElement: concept.importance > 0.8 ? "central-star" : 
                      concept.importance > 0.6 ? "planet" : 
                      concept.importance > 0.4 ? "moon" : "asteroid",
        position: {
          x: concept.importance > 0.8 ? 400 : 200 + Math.cos(i * 0.8) * (80 + concept.importance * 150),
          y: concept.importance > 0.8 ? 300 : 200 + Math.sin(i * 0.8) * (80 + concept.importance * 150),
          z: i * 10 + concept.importance * 20
        },
        animation: concept.importance > 0.8 ? "pulse" : "orbit",
        interaction: "gravitational-pull"
      })),
      narrative: "Explore a universe of understanding where core concepts are like stars, with supporting ideas orbiting around them. The brighter the star, the more fundamental the concept.",
      soundscape: "cosmic-ambient"
    }),
    
    forest: () => ({
      type: "forest" as const,
      elements: concepts.map((concept, i) => ({
        id: `tree-${i}`,
        concept: concept.text,
        visualElement: concept.importance > 0.8 ? "ancient-oak" : 
                      concept.importance > 0.6 ? "tall-pine" : "flowering-bush",
        position: {
          x: 100 + (i % 4) * 150,
          y: 500 - (Math.floor(i / 4) * 100) - Math.random() * 50,
          z: Math.random() * 50 + concept.importance * 30
        },
        animation: "sway",
        interaction: "root-connection"
      })),
      narrative: "Explore a living forest of knowledge where ideas grow and interconnect through root systems. Taller trees represent more important concepts.",
      soundscape: "forest-ambient"
    }),
    
    city: () => ({
      type: "city" as const,
      elements: concepts.map((concept, i) => ({
        id: `building-${i}`,
        concept: concept.text,
        visualElement: concept.importance > 0.8 ? "skyscraper" : 
                      concept.importance > 0.6 ? "office-building" : "house",
        position: {
          x: 50 + (i % 5) * 120,
          y: 400 - (concept.importance > 0.6 ? 150 : 50),
          z: i * 5 + concept.importance * 20
        },
        animation: "lights-flicker",
        interaction: "network-connection"
      })),
      narrative: "Navigate a bustling city of ideas where concepts are buildings connected by information highways. Skyscrapers house the most important concepts.",
      soundscape: "urban-ambient"
    }),
    
    ocean: () => ({
      type: "ocean" as const,
      elements: concepts.map((concept, i) => ({
        id: `sea-${i}`,
        concept: concept.text,
        visualElement: concept.importance > 0.8 ? "whale" : 
                      concept.importance > 0.6 ? "dolphin" : "fish",
        position: {
          x: 100 + Math.random() * 600,
          y: 200 + i * 40 + Math.random() * 100,
          z: Math.random() * 100 + concept.importance * 50
        },
        animation: "swim",
        interaction: "current-flow"
      })),
      narrative: "Dive into an ocean of knowledge where concepts flow like sea creatures in underwater currents. Larger creatures represent more fundamental ideas.",
      soundscape: "ocean-ambient"
    }),
    
    mountain: () => ({
      type: "mountain" as const,
      elements: concepts.map((concept, i) => ({
        id: `peak-${i}`,
        concept: concept.text,
        visualElement: concept.importance > 0.8 ? "summit" : 
                      concept.importance > 0.6 ? "cliff" : "boulder",
        position: {
          x: 400 + (i - concepts.length/2) * 80,
          y: 500 - i * 60 - Math.random() * 30 - concept.importance * 100,
          z: i * 15 + concept.importance * 25
        },
        animation: "mist-swirl",
        interaction: "elevation-connection"
      })),
      narrative: "Climb a mountain of understanding where concepts build upon each other toward enlightenment. Higher peaks represent more important principles.",
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
  
  // ✅ Enhanced Error State Management
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parsingStatus, setParsingStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [diagnosticInfo, setDiagnosticInfo] = useState<{
    thoughtUnitsCount: number;
    hasValidContent: boolean;
    contentSample: string;
    errorDetails?: string;
  } | null>(null);
  
  // Audio context for soundscapes
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // ✅ Enhanced Debug Logging with Diagnostic Information
  console.log("🧠 CleanRightBrainReader - Diagnostic Info:", {
    thoughtUnitsLength: thoughtUnits?.length,
    currentThoughtUnit,
    thoughtUnitsType: typeof thoughtUnits,
    firstUnitSample: thoughtUnits?.[0] ? unitToText(thoughtUnits[0]).slice(0, 50) : 'N/A'
  });

  // ✅ Comprehensive Validation and Error Handling
  useEffect(() => {
    const validateContent = () => {
      setIsLoading(true);
      setParsingStatus('parsing');
      
      try {
        // Check if thoughtUnits exists and is an array
        if (!thoughtUnits || !Array.isArray(thoughtUnits)) {
          throw new Error("No thought units provided - the PDF parsing may have failed");
        }
        
        // Check if array is empty
        if (thoughtUnits.length === 0) {
          throw new Error("Empty thought units array - the PDF may be blank or unreadable");
        }
        
        // Check if all units are empty
        const hasValidContent = thoughtUnits.some(unit => {
          const text = unitToText(unit);
          return text && text.trim().length > 5;
        });
        
        if (!hasValidContent) {
          throw new Error("No readable content found - the PDF may be scanned images or corrupted");
        }
        
        // Get content sample for diagnostics
        const contentSample = thoughtUnits
          .slice(0, 3)
          .map(unit => unitToText(unit))
          .filter(text => text.trim().length > 0)
          .join(" ")
          .slice(0, 200);
        
        // Success - update diagnostic info
        setDiagnosticInfo({
          thoughtUnitsCount: thoughtUnits.length,
          hasValidContent: true,
          contentSample: contentSample || "Content available but preview unavailable"
        });
        
        setError(null);
        setParsingStatus('success');
        
      } catch (validationError) {
        const errorMessage = validationError instanceof Error ? validationError.message : String(validationError);
        console.error("🧠 Right-Brain Reader validation error:", errorMessage);
        
        setError(errorMessage);
        setParsingStatus('error');
        setDiagnosticInfo({
          thoughtUnitsCount: thoughtUnits?.length || 0,
          hasValidContent: false,
          contentSample: "",
          errorDetails: errorMessage
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    validateContent();
  }, [thoughtUnits]);

  // ✅ Error State UI - Show user-friendly error messages with retry functionality
  if (error || parsingStatus === 'error') {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-900 via-purple-900 to-indigo-900 text-white">
        <div className="text-center max-w-2xl mx-auto p-8">
          <div className="text-6xl mb-6">⚠️</div>
          <h2 className="text-2xl font-bold mb-4 text-red-400">Right-Brain Reading Unavailable</h2>
          <p className="text-lg mb-6 text-gray-300">
            {error || "Unable to process this PDF for visual learning"}
          </p>
          
          {/* Diagnostic Information */}
          {diagnosticInfo && (
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-semibold mb-3 text-yellow-400">📊 Diagnostic Information</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-400">Thought Units Found:</span> 
                  <span className="ml-2 text-white">{diagnosticInfo.thoughtUnitsCount}</span>
                </div>
                <div>
                  <span className="text-gray-400">Has Valid Content:</span> 
                  <span className="ml-2 text-white">{diagnosticInfo.hasValidContent ? "Yes" : "No"}</span>
                </div>
                {diagnosticInfo.contentSample && (
                  <div>
                    <span className="text-gray-400">Content Sample:</span>
                    <div className="ml-2 text-white text-xs bg-gray-800 p-2 rounded mt-1">
                      {diagnosticInfo.contentSample}
                    </div>
                  </div>
                )}
                {diagnosticInfo.errorDetails && (
                  <div>
                    <span className="text-gray-400">Error Details:</span>
                    <div className="ml-2 text-red-300 text-xs">{diagnosticInfo.errorDetails}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Possible Solutions */}
          <div className="bg-blue-900/30 backdrop-blur-sm rounded-lg p-4 mb-6 text-left">
            <h3 className="text-sm font-semibold mb-3 text-blue-400">💡 Possible Solutions</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Try a different PDF file (text-based PDFs work best)</li>
              <li>• Use <strong>Progressive</strong> or <strong>Hybrid</strong> mode instead</li>
              <li>• Check if the PDF contains readable text (not just images)</li>
              <li>• For scanned PDFs, try converting to text first</li>
              <li>• Reload the page and try uploading again</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-white font-medium transition-colors"
            >
              🔄 Retry with Another Document
            </button>
            <button
              onClick={() => {
                // Try to switch to Progressive mode as fallback
                if (onPageChange) {
                  // This is a workaround to trigger mode switch - in real app you'd have a proper callback
                  console.log("Switching to Progressive mode as fallback");
                }
              }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
            >
              ⚡ Try Progressive Mode
            </button>
          </div>

          {/* Demo Mode Option */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-400 mb-3">Or explore the visual learning experience with demo content:</p>
            <button
              onClick={() => {
                setError(null);
                setParsingStatus('success');
                // This will trigger the demo content fallback below
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium transition-colors"
            >
              🎮 Try Demo Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Loading State UI
  if (isLoading || parsingStatus === 'parsing') {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🌌</div>
          <h2 className="text-2xl font-bold mb-2">Processing for Visual Learning</h2>
          <p className="text-lg opacity-80 mb-4 text-gray-300">
            Analyzing content and generating visual metaphors...
          </p>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Empty State with Upload Prompt
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">🧠</div>
          <h2 className="text-2xl font-bold mb-2">Visual Right-Brain Learning</h2>
          <p className="text-lg opacity-80 mb-4 text-gray-300 max-w-md">
            Experience visual learning with Galaxy, Forest, City, Ocean, and Mountain metaphors
          </p>
          <p className="text-gray-400 text-sm">Upload a PDF to begin your visual journey through knowledge</p>
        </div>
      </div>
    );
  }

  // Use fallback content if current unit is not available
  const rawUnit = thoughtUnits[currentThoughtUnit - 1] || thoughtUnits[0] || "Sample content for visual learning demonstration";
  console.log("CleanRightBrainReader - rawUnit:", rawUnit);
  
  const unitText = unitToText(rawUnit);
  console.log("CleanRightBrainReader - unitText:", unitText?.slice(0, 100));

  // Use fallback text if content is minimal - don't block the visual experience
  const effectiveText = unitText && unitText.trim().length >= 5 
    ? unitText 
    : `Visual Learning Mode: Exploring concepts through spatial understanding and metaphorical thinking. 
       This mode transforms abstract ideas into visual representations that engage your right-brain processing. 
       Key concepts become visual elements in immersive environments like galaxies, forests, cities, oceans, and mountains. 
       Each environment offers unique ways to understand and remember information through spatial relationships and visual metaphors.`;

  console.log("CleanRightBrainReader - effectiveText length:", effectiveText.length);

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
