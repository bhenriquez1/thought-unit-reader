"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis 
} from "@/lib/rightBrainReading";

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
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  onGenerateNote,
}: VisualRightBrainReaderProps) {
  const [visualMode, setVisualMode] = useState<VisualMode>("mindMap");
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [showConnections, setShowConnections] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(2000);

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

  // Auto-advance through chunks
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveChunkIndex(prev => (prev + 1) % chunks.length);
    }, animationSpeed);
    
    return () => clearInterval(timer);
  }, [chunks.length, animationSpeed]);

  // Memory palace rooms
  const memoryRooms = useMemo(
    () => chunkAnalyses.map((analysis, index) => 
      generateMemoryPalaceRoom(analysis, index)
    ),
    [chunkAnalyses]
  );

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
              onClick={() => {
                setActiveChunkIndex(index);
                onWordClick?.(chunks[index]);
              }}
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
                onClick={() => onWordClick?.(obj.concept)}
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
                  onClick={() => onWordClick?.(term)}
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
                onClick={() => {
                  setActiveChunkIndex(index);
                  onWordClick?.(chunks[index]);
                }}
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
        </div>
      </div>

      {/* Visual Content Area */}
      <div className="flex-1 relative">
        {visualMode === "mindMap" && renderMindMap()}
        {visualMode === "memoryPalace" && renderMemoryPalace()}
        {visualMode === "storyboard" && renderStoryboard()}
        {visualMode === "conceptWeb" && renderConceptWeb()}
      </div>
    </div>
  );
}
