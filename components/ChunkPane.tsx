"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChunkRail from "./ChunkRail";
import ProgressRing from "./ProgressRing";
import { useReaderSync, stableChunkId } from "@/lib/readerSync";

interface ChunkPaneProps {
  // Chunk data
  chunks: string[];
  activeIdx: number;
  setActiveIdx: (idx: number) => void;
  onChunkPick?: (chunk: string, idx: number) => void;
  
  // Voice settings
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  autoSpeak?: boolean;
  onAutoSpeakChange?: (enabled: boolean) => void;
  
  // Right-brain focus
  currentPhase?: "gist" | "pattern" | "detail";
  onPhaseChange?: (phase: "gist" | "pattern" | "detail") => void;
  keyTerms?: string[];
  
  // Reading progress
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  readingProgress?: number;
  
  // Understanding tracking
  understoodMap?: Record<string, boolean>;
  onToggleUnderstood?: (chunkId: string) => void;
  
  // Speech functions
  onSpeakChunk?: (text: string) => void;
  onStopSpeaking?: () => void;
  isSpeaking?: boolean;
  
  // Additional props
  className?: string;
}

export default function ChunkPane({
  chunks,
  activeIdx,
  setActiveIdx,
  onChunkPick,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  autoSpeak = false,
  onAutoSpeakChange,
  currentPhase = "gist",
  onPhaseChange,
  keyTerms = [],
  currentPage,
  totalPages,
  onPageChange,
  readingProgress = 0,
  understoodMap = {},
  onToggleUnderstood,
  onSpeakChunk,
  onStopSpeaking,
  isSpeaking = false,
  className = "",
}: ChunkPaneProps) {
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const { setActiveChunkId, syncChunkToPDF } = useReaderSync();
  
  // Define variables first
  const activeChunk = chunks[activeIdx] || "";
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = understoodMap[activeChunkId] || false;
  
  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
      setAvailableVoices(englishVoices);
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const handleChunkPick = (idx: number) => {
    setActiveIdx(idx);
    const chunk = chunks[idx];
    if (chunk) {
      // Update global sync state
      setActiveChunkId(stableChunkId(chunk), "progressive");
      
      // Call parent callback
      onChunkPick?.(chunk, idx);
      
      // Auto-speak with enhanced natural speech if enabled
      if (autoSpeak && onSpeakChunk) {
        // Use enhanced speech service for natural processing
        import('@/lib/enhancedSpeech').then(({ EnhancedSpeechService }) => {
          const speechService = EnhancedSpeechService.getInstance();
          // Map phase to speech mode
          const speechMode = currentPhase === 'detail' ? 'explanation' : 
                           currentPhase === 'pattern' ? 'study' : 'reading';
          const processedText = speechService.preprocessText(chunk, { mode: speechMode });
          onSpeakChunk(processedText);
        }).catch(() => {
          // Fallback to original text if enhanced speech fails
          onSpeakChunk(chunk);
        });
      }
    }
  };

  const handleToggleUnderstood = () => {
    if (onToggleUnderstood) {
      onToggleUnderstood(activeChunkId);
    }
  };
  
  // Enhanced keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'k':
          e.preventDefault();
          if (activeIdx > 0) {
            handleChunkPick(activeIdx - 1);
          }
          break;
          
        case 'arrowdown':
        case 'j':
          e.preventDefault();
          if (activeIdx < chunks.length - 1) {
            handleChunkPick(activeIdx + 1);
          }
          break;
          
        case 'enter':
          e.preventDefault();
          // Open High-Yield note (simulate right-brain focus detail view)
          onPhaseChange?.("detail");
          break;
          
        case 'g':
          e.preventDefault();
          // Toggle "Got it" status
          handleToggleUnderstood();
          break;
          
        case ' ':
          e.preventDefault();
          // Space bar to speak/stop
          if (isSpeaking) {
            onStopSpeaking?.();
          } else {
            onSpeakChunk?.(activeChunk);
          }
          break;
          
        case '1':
        case '2':
        case '3':
          e.preventDefault();
          // Quick phase switching
          const phases = ["gist", "pattern", "detail"] as const;
          const phaseIdx = parseInt(e.key) - 1;
          if (phaseIdx >= 0 && phaseIdx < phases.length) {
            onPhaseChange?.(phases[phaseIdx]);
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIdx, chunks.length, isSpeaking, activeChunk, onPhaseChange, onSpeakChunk, onStopSpeaking, handleChunkPick, handleToggleUnderstood]);
  
  const understoodCount = chunks.reduce((count, chunk) => {
    return count + (understoodMap[stableChunkId(chunk)] ? 1 : 0);
  }, 0);
  const understoodPct = chunks.length ? Math.round((understoodCount / chunks.length) * 100) : 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Voice Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-blue-300">🎵 Voice</span>
          <div className="flex-1"></div>
          <button
            onClick={() => onAutoSpeakChange?.(!autoSpeak)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              autoSpeak ? "bg-green-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            Auto {autoSpeak ? "✓" : "○"}
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-75 w-16">Voice:</span>
            <select
              className="text-xs bg-gray-700 rounded px-2 py-1 flex-1"
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = availableVoices.find(v => v.name === e.target.value);
                if (voice && onVoiceChange) onVoiceChange(voice);
              }}
            >
              <option value="">System Default</option>
              {availableVoices
                .sort((a, b) => {
                  // Prioritize neural/premium voices
                  const aScore = (a.name.toLowerCase().includes('neural') ? 2 : 0) + 
                                (a.name.toLowerCase().includes('premium') ? 1 : 0);
                  const bScore = (b.name.toLowerCase().includes('neural') ? 2 : 0) + 
                                (b.name.toLowerCase().includes('premium') ? 1 : 0);
                  return bScore - aScore;
                })
                .map(voice => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name.split(' ')[0]} 
                    {voice.name.toLowerCase().includes('neural') && ' ⚡'}
                    {voice.name.toLowerCase().includes('premium') && ' ✨'}
                  </option>
                ))
              }
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-75 w-16">Speed:</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speechRate}
              onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
              className="flex-1 accent-blue-400"
            />
            <span className="text-xs w-8 text-center">{speechRate}x</span>
          </div>
          
          <button
            onClick={() => isSpeaking ? onStopSpeaking?.() : onSpeakChunk?.(activeChunk)}
            disabled={!activeChunk}
            className={`w-full text-sm px-4 py-2 rounded font-medium transition-colors ${
              isSpeaking 
                ? "bg-red-600 hover:bg-red-500 text-white" 
                : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            }`}
          >
            {isSpeaking ? "⏹️ Stop" : "🎵 Speak Chunk"}
          </button>
        </div>
      </motion.div>

      {/* Right-Brain Focus Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-4 bg-gradient-to-br from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/30 rounded-lg"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-yellow-400">🧠 Right-Brain Focus</span>
          <div className="flex gap-1">
            {(["gist", "pattern", "detail"] as const).map((phase) => (
              <button
                key={phase}
                onClick={() => onPhaseChange?.(phase)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  currentPhase === phase 
                    ? "bg-yellow-500 text-black font-medium" 
                    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                }`}
              >
                {phase === "gist" ? "💡" : phase === "pattern" ? "🔗" : "🔍"} {phase}
              </button>
            ))}
          </div>
        </div>
        
        {/* Key Terms */}
        {keyTerms.length > 0 && (
          <div className="mb-3">
            <span className="text-xs opacity-75 block mb-2">🎯 Key Terms:</span>
            <div className="flex gap-2 flex-wrap">
              {keyTerms.map((term, i) => (
                <span 
                  key={i} 
                  className="text-xs bg-yellow-500/20 px-2 py-1 rounded cursor-pointer hover:bg-yellow-500/30 transition-colors"
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Current chunk analysis based on phase */}
        <div className="text-sm">
          {currentPhase === "gist" && (
            <div>
              <p className="font-medium text-yellow-300 mb-2">Core Idea:</p>
              <p className="text-gray-300 leading-relaxed">
                {activeChunk.split(/[.!?]/)[0] || activeChunk}
              </p>
            </div>
          )}
          
          {currentPhase === "pattern" && (
            <div>
              <p className="font-medium text-orange-300 mb-2">Patterns & Relations:</p>
              <div className="text-xs space-y-1 text-gray-300">
                <p>Look for:</p>
                <ul className="list-disc pl-4 space-y-0.5 opacity-90">
                  <li>Cause → effect? <span className="opacity-70">(because, therefore)</span></li>
                  <li>Compare/contrast? <span className="opacity-70">(however, whereas)</span></li>
                  <li>Sequence? <span className="opacity-70">(first, next, then)</span></li>
                </ul>
              </div>
            </div>
          )}
          
          {currentPhase === "detail" && (
            <div>
              <p className="font-medium text-red-300 mb-2">Detailed Analysis:</p>
              <p className="text-xs text-gray-300 leading-relaxed">
                {activeChunk}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Chunk Rail */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">💭 Chunks</span>
          <button
            onClick={handleToggleUnderstood}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isUnderstood ? "bg-green-500 text-black font-medium" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            {isUnderstood ? "✓ Got it" : "Got it?"}
          </button>
        </div>
        
        <ChunkRail
          chunks={chunks}
          activeIdx={activeIdx}
          setActiveIdx={handleChunkPick}
          onPick={(text) => {
            const idx = chunks.indexOf(text);
            if (idx !== -1) handleChunkPick(idx);
          }}
        />
        
        {/* Enhanced keyboard navigation hint */}
        <motion.div 
          className="text-xs text-gray-500 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          ↑↓ or J/K: Navigate • Enter: Detail view • G: Got it • Space: Speak • 1/2/3: Focus mode
        </motion.div>
      </motion.div>

      {/* Reading Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-4 bg-gray-800/50 rounded-lg border border-gray-700"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">📊 Reading Progress</span>
          <div className="flex items-center gap-2">
            <ProgressRing value={understoodPct / 100} size={24} label={`${understoodPct}%`} />
            <span className="text-xs opacity-75">{understoodCount}/{chunks.length}</span>
          </div>
        </div>
        
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            ◀
          </button>
          
          <div className="flex-1 text-center">
            <span className="text-sm font-mono">
              Page {currentPage} / {totalPages}
            </span>
            {readingProgress > 0 && (
              <div className="w-full bg-gray-700 h-1 rounded mt-1">
                <div 
                  className="bg-yellow-400 h-1 rounded transition-all duration-300"
                  style={{ width: `${readingProgress}%` }}
                />
              </div>
            )}
          </div>
          
          <button
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            ▶
          </button>
        </div>
      </motion.div>
    </div>
  );
}
