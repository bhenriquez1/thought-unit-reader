"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Butler-style medical/educational metaphor system
interface ButlerMetaphor {
  concept: string;
  metaphor: string;
  explanation: string;
  visualCue: string;
  category: "dental" | "medical" | "biological" | "educational";
}

interface TUModalProps {
  isOpen: boolean;
  onClose: () => void;
  thoughtUnitText: string;
  conceptType: "main-idea" | "supporting-concept" | "definition" | "process" | "relationship";
  position: { x: number; y: number };
  confidence: number;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  onSpeak?: (text: string) => void;
}

// Generate David Butler-style metaphors for DAT content
function generateDATMetaphors(text: string): ButlerMetaphor[] {
  const metaphors: ButlerMetaphor[] = [];
  
  const datPatterns = [
    // Dental-specific patterns
    { 
      pattern: /tooth|teeth|dental|enamel|dentin|pulp|cavity|root/gi, 
      metaphor: "fortress architecture", 
      explanation: "Think of a tooth like a medieval fortress - enamel is the outer wall protecting everything inside, dentin is the structural foundation, and pulp is the vital core with all the life-giving supplies",
      visualCue: "🏰",
      category: "dental" as const
    },
    { 
      pattern: /gum|gingiva|periodontal|plaque|bacteria/gi, 
      metaphor: "ecosystem balance", 
      explanation: "Your mouth is like a delicate ecosystem where good bacteria are the forest rangers keeping harmful invaders in check - when the balance tips, disease takes hold",
      visualCue: "🌲",
      category: "dental" as const
    },
    { 
      pattern: /bite|occlusion|jaw|TMJ/gi, 
      metaphor: "precision machinery", 
      explanation: "Your bite works like a Swiss watch - every tooth is a gear that must align perfectly for smooth operation, and when one gear is off, the whole system suffers",
      visualCue: "⚙️",
      category: "dental" as const
    },

    // Medical/anatomical patterns  
    { 
      pattern: /pain|hurt|ache|discomfort/gi, 
      metaphor: "intelligent alarm system", 
      explanation: "Pain is your body's sophisticated security system - like a smoke detector that goes off before you see the fire, it's trying to protect you by getting your attention",
      visualCue: "🚨",
      category: "medical" as const
    },
    { 
      pattern: /nerve|neural|neuron|brain/gi, 
      metaphor: "electrical highway network", 
      explanation: "Your nervous system is like the internet - millions of electrical messages traveling at light speed along biological fiber optic cables, connecting every part of your body",
      visualCue: "⚡",
      category: "medical" as const
    },
    { 
      pattern: /muscle|tissue|fiber|contraction/gi, 
      metaphor: "smart elastic rope system", 
      explanation: "Muscles are like intelligent bungee cords that can adjust their tension in real-time - they know when to be strong like steel cables or flexible like rubber bands",
      visualCue: "💪",
      category: "medical" as const
    },
    { 
      pattern: /bone|skeleton|calcium|fracture/gi, 
      metaphor: "living construction scaffolding", 
      explanation: "Bones are like the ultimate construction material - stronger than concrete but alive and constantly rebuilding themselves, adapting to whatever stress you put on them",
      visualCue: "🏗️",
      category: "medical" as const
    },

    // Biological processes
    { 
      pattern: /enzyme|catalyst|reaction|metabolism/gi, 
      metaphor: "molecular matchmakers", 
      explanation: "Enzymes are like the world's most efficient dating service - they bring the right molecules together at exactly the right time and place to make chemical magic happen",
      visualCue: "💕",
      category: "biological" as const
    },
    { 
      pattern: /cell|membrane|transport|diffusion/gi, 
      metaphor: "smart border control", 
      explanation: "Cell membranes are like intelligent border guards - they have molecular passports that determine what gets in, what stays out, and what gets VIP treatment",
      visualCue: "🚪",
      category: "biological" as const
    },
    { 
      pattern: /hormone|endocrine|signal|communication/gi, 
      metaphor: "chemical postal service", 
      explanation: "Hormones are like a sophisticated mail system - each hormone is a specific message in a chemical envelope, delivered to exactly the right address in your body",
      visualCue: "📨",
      category: "biological" as const
    },

    // Educational/learning patterns
    { 
      pattern: /understand|learn|comprehend|knowledge/gi, 
      metaphor: "building knowledge architecture", 
      explanation: "Learning is like constructing a building - you need a solid foundation of basic concepts before you can add the complex upper floors of advanced understanding",
      visualCue: "🏛️",
      category: "educational" as const
    },
    { 
      pattern: /memory|remember|recall|retention/gi, 
      metaphor: "mental filing system", 
      explanation: "Memory works like a master librarian - the better you organize and connect information when it goes in, the easier it is to find exactly what you need when you need it",
      visualCue: "📚",
      category: "educational" as const
    }
  ];

  // Find matching patterns
  const lowerText = text.toLowerCase();
  datPatterns.forEach(({ pattern, metaphor, explanation, visualCue, category }) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      metaphors.push({
        concept: matches[0],
        metaphor,
        explanation,
        visualCue,
        category
      });
    }
  });

  return metaphors.slice(0, 3); // Limit to top 3 metaphors
}

// Visual concept representation with spatial understanding
function ConceptVisualization({ 
  conceptType, 
  confidence, 
  metaphors 
}: { 
  conceptType: TUModalProps['conceptType'], 
  confidence: number,
  metaphors: ButlerMetaphor[]
}) {
  const getConceptColor = () => {
    switch (conceptType) {
      case "main-idea": return "#FFD700";
      case "supporting-concept": return "#87CEEB"; 
      case "definition": return "#98FB98";
      case "process": return "#DDA0DD";
      case "relationship": return "#F0E68C";
      default: return "#E6E6FA";
    }
  };

  const getConceptIcon = () => {
    switch (conceptType) {
      case "main-idea": return "💡";
      case "supporting-concept": return "📋";
      case "definition": return "📖";
      case "process": return "⚙️";
      case "relationship": return "🔗";
      default: return "💭";
    }
  };

  return (
    <div className="flex items-center justify-center mb-4">
      <div 
        className="relative w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl border-4 border-white"
        style={{ backgroundColor: getConceptColor() }}
      >
        {getConceptIcon()}
        
        {/* Confidence ring */}
        <div 
          className="absolute inset-0 rounded-full border-4"
          style={{ 
            borderColor: `rgba(255, 255, 255, ${confidence})`,
            borderTopColor: "transparent",
            transform: `rotate(${confidence * 360}deg)`,
            transition: "transform 1s ease-out"
          }}
        />
        
        {/* Pulsing effect for high confidence */}
        {confidence > 0.8 && (
          <div className="absolute inset-0 rounded-full animate-ping opacity-30" 
               style={{ backgroundColor: getConceptColor() }} />
        )}
      </div>
      
      {/* Metaphor indicators */}
      {metaphors.length > 0 && (
        <div className="absolute -top-2 -right-2 flex gap-1">
          {metaphors.map((metaphor, idx) => (
            <div
              key={idx}
              className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-200 text-sm"
              title={metaphor.metaphor}
            >
              {metaphor.visualCue}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TUInteractionModal({
  isOpen,
  onClose,
  thoughtUnitText,
  conceptType,
  position,
  confidence,
  onGenerateNote,
  onSpeak
}: TUModalProps) {
  const [showMetaphors, setShowMetaphors] = useState(true);
  const [activeTab, setActiveTab] = useState<"understand" | "explore" | "connect">("understand");
  const [metaphors, setMetaphors] = useState<ButlerMetaphor[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen && thoughtUnitText) {
      const generatedMetaphors = generateDATMetaphors(thoughtUnitText);
      setMetaphors(generatedMetaphors);
    }
  }, [isOpen, thoughtUnitText]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "1":
          setActiveTab("understand");
          break;
        case "2":
          setActiveTab("explore");
          break;
        case "3":
          setActiveTab("connect");
          break;
        case " ":
          e.preventDefault();
          onSpeak?.(thoughtUnitText);
          break;
        case "n":
          e.preventDefault();
          onGenerateNote?.(thoughtUnitText, undefined, "highYield");
          break;
        case "s":
          e.preventDefault();
          onGenerateNote?.(thoughtUnitText, undefined, "sketch");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, thoughtUnitText, onClose, onSpeak, onGenerateNote]);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 transition-all duration-300 transform"
        style={{
          left: Math.min(position.x, window.innerWidth - 400),
          top: Math.min(position.y, window.innerHeight - 500),
          width: "380px",
          maxHeight: "480px"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <ConceptVisualization 
              conceptType={conceptType}
              confidence={confidence}
              metaphors={metaphors}
            />
            <div>
              <h3 className="font-semibold text-gray-800 capitalize">
                {conceptType.replace('-', ' ')} 
              </h3>
              <div className="text-xs text-gray-600">
                Confidence: {Math.round(confidence * 100)}%
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: "understand", icon: "🧠", label: "Understand" },
            { key: "explore", icon: "🔍", label: "Explore" },
            { key: "connect", icon: "🔗", label: "Connect" }
          ].map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                  : "hover:bg-gray-50 text-gray-600"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 max-h-64 overflow-y-auto">
          {activeTab === "understand" && (
            <div className="space-y-4">
              {/* Main Content */}
              <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-400">
                <div className="text-sm font-medium text-gray-800 mb-2">Selected Thought Unit:</div>
                <div className="text-sm text-gray-700 leading-relaxed">
                  {thoughtUnitText}
                </div>
              </div>

              {/* David Butler Metaphors */}
              {metaphors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                    🎭 David Butler Understanding
                  </h4>
                  {metaphors.map((metaphor, idx) => (
                    <div key={idx} className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{metaphor.visualCue}</span>
                        <span className="text-xs font-semibold text-teal-600 uppercase">
                          {metaphor.concept} → {metaphor.metaphor}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 leading-relaxed">
                        {metaphor.explanation}
                      </div>
                      <div className="mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          metaphor.category === 'dental' ? 'bg-blue-100 text-blue-700' :
                          metaphor.category === 'medical' ? 'bg-red-100 text-red-700' :
                          metaphor.category === 'biological' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {metaphor.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "explore" && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-green-700">🔍 Deep Dive Questions</h4>
              
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm font-medium text-green-800 mb-1">What's the big picture?</div>
                  <div className="text-sm text-green-700">
                    How does this concept fit into the larger context of what you're learning?
                  </div>
                </div>
                
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm font-medium text-blue-800 mb-1">Real-world application</div>
                  <div className="text-sm text-blue-700">
                    Where would you encounter this concept in clinical practice or daily life?
                  </div>
                </div>
                
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-sm font-medium text-purple-800 mb-1">Connect the dots</div>
                  <div className="text-sm text-purple-700">
                    What other concepts does this relate to? What would happen without it?
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "connect" && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-orange-700">🔗 Make It Stick</h4>
              
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="text-sm font-medium text-orange-800 mb-2">Memory Palace</div>
                  <div className="text-sm text-orange-700">
                    Create a mental image: Where would you place this concept in your mind?
                  </div>
                </div>
                
                <div className="p-3 bg-pink-50 border border-pink-200 rounded-lg">
                  <div className="text-sm font-medium text-pink-800 mb-2">Personal Connection</div>
                  <div className="text-sm text-pink-700">
                    How does this relate to your own experience or something you care about?
                  </div>
                </div>
                
                {/* Spaced Repetition Suggestion */}
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="text-sm font-medium text-indigo-800 mb-1">📅 Review Schedule</div>
                  <div className="text-sm text-indigo-700">
                    Review this concept: Tomorrow → 3 days → 1 week → 1 month
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => onSpeak?.(thoughtUnitText)}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🔊 Read Aloud
          </button>
          
          <button
            onClick={() => {
              onGenerateNote?.(thoughtUnitText, metaphors[0]?.metaphor, "highYield");
              onClose();
            }}
            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            📝 Study Note
          </button>
          
          <button
            onClick={() => {
              onGenerateNote?.(thoughtUnitText, metaphors[0]?.metaphor, "sketch");
              onClose();
            }}
            className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🎨 Sketch
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-4 pb-2">
          <div className="text-xs text-gray-500 text-center">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded">Space</kbd> Read • 
            <kbd className="px-1 py-0.5 bg-gray-200 rounded ml-1">N</kbd> Note • 
            <kbd className="px-1 py-0.5 bg-gray-200 rounded ml-1">S</kbd> Sketch • 
            <kbd className="px-1 py-0.5 bg-gray-200 rounded ml-1">Esc</kbd> Close
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
