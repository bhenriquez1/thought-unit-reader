"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { Document, Page } from "react-pdf";
import type { TOCEntry } from "@/lib/tocParser";
import ErrorBoundary from "@/components/ErrorBoundary";

// Surgeon-View PDRM Engine Integration
import surgeonPdrmEngine, { 
  type SurgeonUnit, 
  type ButlerAction, 
  type FusedAnalysisResult,
  type PDRM,
  type Timeline,
  type DecisionNode,
  type SurgeonAction,
  type Axis
} from "@/lib/surgeonPdrmEngine";

// Thought Unit Analysis
import { createThoughtUnits, type ThoughtUnit } from "@/lib/thoughtUnitExtraction";

interface SurgeonViewPdrmReaderProps {
  bookId: string;
  userId: string;
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;
  thoughtUnits: BaseThoughtUnit[];
  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  selectedVoice?: SpeechSynthesisVoice;
  speechRate?: number;
  tableOfContents?: TOCEntry[];
}

// Helper function to convert thought units
function convertToThoughtUnits(thoughtUnits: BaseThoughtUnit[]): ThoughtUnit[] {
  return thoughtUnits.map((unit, index) => {
    const text = typeof unit === 'string' ? unit : 
                 Array.isArray(unit) ? unit.join(' ') : 
                 (unit as any).text || String(unit);
    
    return {
      id: `tu-${index}`,
      text,
      startIndex: 0,
      endIndex: text.length,
      isMainIdea: index === 0,
      isComplete: true,
      confidence: 0.8,
      type: 'supporting-detail' as const,
      relationships: {
        childIds: [],
        relationType: 'supports' as const
      },
      visualCues: {
        color: '#60a5fa',
        intensity: 0.6,
        borderStyle: 'solid' as const
      },
      cognitiveMarkers: {
        complexity: 'moderate' as const,
        processingTime: Math.max(10, text.split(/\s+/).length / 3)
      }
    };
  });
}

export default function SurgeonViewPdrmReader({
  bookId,
  userId,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  thoughtUnits,
  currentThoughtUnit,
  setCurrentThoughtUnit,
  onTextSelect,
  onGenerateNote,
  fontSize,
  fontFamily,
  lineSpacing,
  selectedVoice,
  speechRate = 1.0,
  tableOfContents = [],
}: SurgeonViewPdrmReaderProps) {
  
  // Core State Management
  const [fusedAnalysis, setFusedAnalysis] = useState<FusedAnalysisResult | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Filter States for Surgeon-View
  const [pdrmFilter, setPdrmFilter] = useState<PDRM | 'all'>('all');
  const [timelineFilter, setTimelineFilter] = useState<Timeline | 'all'>('all');
  const [systemFilter, setSystemFilter] = useState<string | 'all'>('all');
  const [organFilter, setOrganFilter] = useState<string | 'all'>('all');
  
  // Butler Action State
  const [activeActions, setActiveActions] = useState<ButlerAction[]>([]);
  const [actionResults, setActionResults] = useState<Record<string, string>>({});
  
  // PDF State
  const [pdfScale, setPdfScale] = useState(1.3);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [scrollingProgrammatically, setScrollingProgrammatically] = useState(false);
  
  // Speech State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  console.log('🔬 SurgeonViewPdrmReader loaded with:', {
    bookId,
    currentPage,
    pdfPageCount,
    thoughtUnitsCount: thoughtUnits.length
  });

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Run Fused Analysis Pipeline when content changes
  useEffect(() => {
    if (thoughtUnits.length > 0 && selectedText.length > 50) {
      runFusedAnalysis();
    }
  }, [selectedText, thoughtUnits, currentPage]);

  // Auto-select current thought unit text
  useEffect(() => {
    if (thoughtUnits.length > 0 && currentThoughtUnit >= 1 && currentThoughtUnit <= thoughtUnits.length) {
      const currentUnit = thoughtUnits[currentThoughtUnit - 1];
      const text = typeof currentUnit === 'string' ? currentUnit : 
                   Array.isArray(currentUnit) ? currentUnit.join(' ') : 
                   (currentUnit as any).text || String(currentUnit);
      
      if (text.length > 20) {
        setSelectedText(text);
      }
    }
  }, [thoughtUnits, currentThoughtUnit]);

  // Run Fused Analysis Pipeline
  const runFusedAnalysis = async () => {
    if (!selectedText || selectedText.length < 50) return;
    
    try {
      setIsAnalyzing(true);
      console.log('🔬 Running Fused Analysis Pipeline...');
      
      // Convert thought units to proper format
      const convertedUnits = convertToThoughtUnits(thoughtUnits.filter(unit => {
        const text = typeof unit === 'string' ? unit : 
                     Array.isArray(unit) ? unit.join(' ') : 
                     (unit as any).text || String(unit);
        return text.includes(selectedText.slice(0, 50));
      }));
      
      // Run the fused pipeline
      const result = await surgeonPdrmEngine.runFusedPipeline(
        selectedText,
        convertedUnits,
        {
          userId,
          bookId,
          page: currentPage
        }
      );
      
      setFusedAnalysis(result);
      setActiveActions(result.actions);
      
      console.log('✅ Fused analysis complete:', {
        units: result.units.length,
        actions: result.actions.length,
        confidence: Math.round(result.confidence * 100) + '%'
      });
      
    } catch (error) {
      console.error('❌ Fused analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle text selection
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    if (selection && selection.length > 20) {
      setSelectedText(selection);
      onTextSelect?.(selection);
    }
  }, [onTextSelect]);

  // Speech synthesis
  const speakText = useCallback((text: string) => {
    if (speechRef.current) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [selectedVoice, speechRate]);

  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Execute Butler Action
  const executeButlerAction = async (action: ButlerAction) => {
    const actionId = `${action.type}-${action.anchors.page}-${Date.now()}`;
    
    try {
      // Simulate action execution with real prompts
      let result = '';
      
      switch (action.type) {
        case 'explain':
          result = `**Surgeon-View Explanation:**\n\n${action.payload.prompt}\n\n*Analysis based on ${Object.entries(action.payload.axis).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')}*`;
          break;
          
        case 'compare':
          result = `**Surgical Comparison Table:**\n\n${action.payload.prompt}\n\n| Aspect | Option A | Option B | Key Difference |\n|--------|----------|----------|----------------|\n| Origin | ... | ... | ... |\n| Function | ... | ... | ... |\n| Pathology | ... | ... | ... |\n\n*Reference: Page ${action.anchors.page}*`;
          break;
          
        case 'quiz':
          result = `**DAT-Style Quiz:**\n\n${action.payload.prompt}\n\n**Q1:** Which of the following is most characteristic of this concept?\nA) Option 1\nB) Option 2\nC) Option 3\nD) Option 4\n\n**Q2:** What is the primary clinical significance?\nA) Option 1\nB) Option 2\nC) Option 3\nD) Option 4\n\n*Answers: 1-B, 2-C*`;
          break;
          
        case 'mnemonic':
          result = `**Memory Aid:**\n\n${action.payload.prompt}\n\n**Suggested Mnemonic:** ${action.payload.cueWords.slice(0, 3).map(w => w.charAt(0).toUpperCase()).join('')} - "${action.payload.cueWords.join(', ')}"`;
          break;
          
        case 'timeline':
          result = `**Surgical Timeline:**\n\n${action.payload.prompt}\n\n**PreOp:** Assessment and preparation\n**IntraOp:** Active intervention\n**PostOp:** Monitoring and follow-up\n\n*Checkpoints: ${action.payload.checkpoints} key decision points*`;
          break;
          
        case 'diagram':
          result = `**Diagram Scaffold:**\n\n${action.payload.prompt}\n\n• Central concept: [${action.payload.cueWords[0] || 'Main topic'}]\n  ├─ Component A\n  ├─ Component B\n  └─ Component C\n\n• Flow: Input → Process → Output\n• Relationships: A ↔ B → C`;
          break;
          
        default:
          result = `**${action.type.toUpperCase()}:**\n\n${JSON.stringify(action.payload, null, 2)}`;
      }
      
      setActionResults(prev => ({
        ...prev,
        [actionId]: result
      }));
      
    } catch (error) {
      console.error('Action execution error:', error);
      setActionResults(prev => ({
        ...prev,
        [actionId]: `Error executing ${action.type}: ${error}`
      }));
    }
  };

  // Export Functions
  const exportToNoteLab = () => {
    if (!fusedAnalysis) return;
    
    const unitExports = surgeonPdrmEngine.exportUnitsToNoteLab(fusedAnalysis.units);
    const actionExports = surgeonPdrmEngine.exportActionsToNoteLab(fusedAnalysis.actions);
    
    const allExports = [...unitExports, ...actionExports];
    
    // Create downloadable JSON
    const blob = new Blob([JSON.stringify(allExports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surgeon-pdrm-notelab-export-${currentPage}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📤 Exported to NoteLab:', allExports.length, 'items');
  };

  const exportToMemoCards = () => {
    if (!fusedAnalysis) return;
    
    const memoCards = surgeonPdrmEngine.exportToMemoCards(fusedAnalysis.units, fusedAnalysis.actions);
    
    // Create downloadable JSON
    const blob = new Blob([JSON.stringify(memoCards, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surgeon-pdrm-memo-cards-${currentPage}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('🎴 Exported to Memo.cards:', memoCards.length, 'cards');
  };

  // Filter surgeon units based on selected filters
  const getFilteredUnits = (): SurgeonUnit[] => {
    if (!fusedAnalysis) return [];
    
    return fusedAnalysis.units.filter(unit => {
      if (pdrmFilter !== 'all' && unit.pdrm !== pdrmFilter) return false;
      if (timelineFilter !== 'all' && unit.surgeon.timeline !== timelineFilter) return false;
      if (systemFilter !== 'all' && unit.surgeon.axis.system !== systemFilter) return false;
      if (organFilter !== 'all' && unit.surgeon.axis.organ !== organFilter) return false;
      return true;
    });
  };

  // Get unique filter options
  const getFilterOptions = () => {
    if (!fusedAnalysis) return { systems: [], organs: [] };
    
    const systems = [...new Set(fusedAnalysis.units.map(u => u.surgeon.axis.system).filter(Boolean))];
    const organs = [...new Set(fusedAnalysis.units.map(u => u.surgeon.axis.organ).filter(Boolean))];
    
    return { systems, organs };
  };

  const filteredUnits = getFilteredUnits();
  const { systems, organs } = getFilterOptions();

  return (
    <ErrorBoundary
      fallback={
        <div className="h-full flex flex-col bg-gray-900 text-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-red-400">⚠️ Surgeon-View PDRM Error</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🩺</div>
              <h3 className="text-xl font-bold text-red-400 mb-2">Surgeon-View PDRM Reader failed to load</h3>
              <p className="text-gray-400 mb-4">There was an issue loading the surgeon-focused reader interface.</p>
            </div>
          </div>
        </div>
      }
      resetKeys={[currentPage, userId, selectedText]}
    >
      <div className="h-full flex bg-gray-50">
        {/* PDF Viewer - Left Pane (60% width) */}
        <div className="w-3/5 bg-white border-r border-gray-200">
          {/* Surgeon Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b border-blue-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🩺</span>
              <div>
                <h3 className="text-lg font-bold text-blue-800">Surgeon-View PDRM Butler</h3>
                <p className="text-xs text-blue-600">
                  Anatomical analysis • Clinical timelines • Butler actions
                </p>
              </div>
            </div>
            
            {/* Navigation Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => {
                  const newPage = Math.max(1, currentPage - 1);
                  onPageChange(newPage);
                }}
                disabled={currentPage <= 1}
                className={`px-2 py-1 rounded text-sm transition-all ${
                  currentPage <= 1 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                ←
              </button>
              
              <div className="flex items-center gap-1">
                <span className="text-sm text-blue-700 font-medium">
                  {currentPage} / {pdfPageCount || '...'}
                </span>
              </div>
              
              <button
                onClick={() => {
                  const newPage = Math.min(pdfPageCount || 999, currentPage + 1);
                  onPageChange(newPage);
                }}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                →
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                  className="px-1 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
                >
                  -
                </button>
                <span className="text-xs text-gray-600 min-w-[2rem] text-center">
                  {Math.round(pdfScale * 100)}%
                </span>
                <button
                  onClick={() => setPdfScale(s => Math.min(3.0, s + 0.1))}
                  className="px-1 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* PDF Content */}
          <div 
            ref={pdfContainerRef}
            className="h-full overflow-auto bg-gray-100 p-4"
            onMouseUp={handleMouseUp}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily,
              lineHeight: lineSpacing
            }}
          >
            <div className="flex justify-center">
              <div className="bg-white shadow-lg">
                <Document 
                  file={pdfUrl}
                  onLoadSuccess={(pdf) => {
                    console.log(`📄 PDF loaded: ${pdf.numPages} pages`);
                  }}
                  onLoadError={(error) => {
                    console.error('📄 PDF load error:', error);
                  }}
                  loading={
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className="animate-spin text-4xl mb-4">🩺</div>
                      <p className="text-gray-600">Loading Surgeon-View PDF reader...</p>
                      <p className="text-xs text-gray-500 mt-2">Anatomical analysis ready</p>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className="text-4xl mb-4 text-red-500">❌</div>
                      <p className="text-red-600 font-semibold">Failed to load PDF</p>
                      <p className="text-gray-600 text-sm">Please try uploading the file again</p>
                    </div>
                  }
                >
                  {pdfPageCount && (
                    <Page 
                      pageNumber={currentPage} 
                      scale={pdfScale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      onLoadSuccess={() => {
                        console.log(`📄 Page ${currentPage} loaded`);
                      }}
                      onLoadError={(error) => {
                        console.error(`📄 Page ${currentPage} load error:`, error);
                      }}
                      loading={
                        <div className="flex items-center justify-center p-12">
                          <div className="animate-pulse text-lg">🎯 Loading page {currentPage}...</div>
                        </div>
                      }
                      error={
                        <div className="flex items-center justify-center p-12">
                          <div className="text-red-500">❌ Failed to load page {currentPage}</div>
                        </div>
                      }
                    />
                  )}
                </Document>
              </div>
            </div>
          </div>
        </div>

        {/* Surgeon Analysis Panel - Right Pane (40% width) */}
        <div className="w-2/5 bg-white flex flex-col">
          {/* Panel Header with Filters */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-blue-700">
                🔬 Surgeon Analysis
              </h4>
              <div className="text-xs text-gray-600">
                {selectedText ? `"${selectedText.slice(0, 30)}..."` : 'Select text to analyze'}
              </div>
            </div>

            {/* Filter Chips */}
            {fusedAnalysis && (
              <div className="space-y-2">
                {/* PDRM Filters */}
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs font-medium text-gray-600">PDRM:</span>
                  {['all', 'P', 'D', 'R', 'M'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setPdrmFilter(filter as PDRM | 'all')}
                      className={`px-2 py-1 rounded text-xs ${
                        pdrmFilter === filter
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                {/* Timeline Filters */}
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs font-medium text-gray-600">Timeline:</span>
                  {['all', 'PreOp', 'IntraOp', 'PostOp'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setTimelineFilter(filter as Timeline | 'all')}
                      className={`px-2 py-1 rounded text-xs ${
                        timelineFilter === filter
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                {/* System/Organ Filters */}
                {systems.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs font-medium text-gray-600">System:</span>
                    <button
                      onClick={() => setSystemFilter('all')}
                      className={`px-2 py-1 rounded text-xs ${
                        systemFilter === 'all'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      all
                    </button>
                    {systems.map(system => (
                      <button
                        key={system}
                        onClick={() => setSystemFilter(system)}
                        className={`px-2 py-1 rounded text-xs ${
                          systemFilter === system
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {system}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Analysis Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current Selection */}
            {selectedText && (
              <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-blue-700">📝 Selected Content</h5>
                  {isAnalyzing && (
                    <div className="animate-spin text-blue-500">🔬</div>
                  )}
                </div>
                <p className="text-sm text-gray-700 italic mb-3">
                  "{selectedText.slice(0, 200)}{selectedText.length > 200 ? '...' : ''}"
                </p>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => speakText(selectedText)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                  >
                    🔊 Read
                  </button>
                  <button
                    onClick={() => onGenerateNote?.(selectedText, undefined, "highYield")}
                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                  >
                    📝 Note
                  </button>
                  <button
                    onClick={exportToNoteLab}
                    disabled={!fusedAnalysis}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-400 text-white rounded text-xs"
                  >
                    📤 NoteLab
                  </button>
                  <button
                    onClick={exportToMemoCards}
                    disabled={!fusedAnalysis}
                    className="px-2 py-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-400 text-white rounded text-xs"
                  >
                    🎴 Memo
                  </button>
                </div>
              </div>
            )}

            {/* Fused Analysis Results */}
            {fusedAnalysis ? (
              <div className="space-y-4">
                {/* Analysis Summary */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <h6 className="font-semibold text-emerald-700 mb-2">🎯 Analysis Summary</h6>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-white rounded p-2 text-center">
                      <div className="text-xs text-gray-600">Units</div>
                      <div className="text-sm font-bold text-emerald-600">
                        {filteredUnits.length} / {fusedAnalysis.units.length}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <div className="text-xs text-gray-600">Confidence</div>
                      <div className="text-sm font-bold text-emerald-600">
                        {Math.round(fusedAnalysis.confidence * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Surgeon Units */}
                {filteredUnits.length > 0 && (
                  <div className="space-y-3">
                    <h6 className="font-semibold text-blue-700">🔬 Surgeon Units</h6>
                    {filteredUnits.map((unit, idx) => (
                      <div key={unit.unit_id} className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
                              {unit.pdrm || 'R'}
                            </span>
                            <span className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">
                              {unit.surgeon.timeline}
                            </span>
                            <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs">
                              {unit.surgeon.decision_node}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {Math.round(unit.evidence_score * 100)}%
                          </span>
                        </div>
                        
                        <div className="mb-2">
                          <span className="text-xs font-medium text-gray-700">Axis: </span>
                          <span className="text-xs text-blue-600">
                            {Object.entries(unit.surgeon.axis)
                              .filter(([_, value]) => value)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(', ') || 'General'}
                          </span>
                        </div>
                        
                        {unit.cue_words.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs font-medium text-gray-700">Cue Words: </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {unit.cue_words.map((word, i) => (
                                <span
                                  key={i}
                                  className="px-1 py-0.5 bg-gray-200 text-gray-700 rounded text-xs"
                                >
                                  {word}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-600 mb-2 italic">
                          "{unit.text.slice(0, 150)}{unit.text.length > 150 ? '...' : ''}"
                        </p>
                        
                        {unit.needs_action.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {unit.needs_action.map((actionType, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  const action = activeActions.find(a => a.type === actionType);
                                  if (action) executeButlerAction(action);
                                }}
                                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                              >
                                {actionType}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Butler Actions */}
                {activeActions.length > 0 && (
                  <div className="space-y-3">
                    <h6 className="font-semibold text-purple-700">🤖 Butler Actions</h6>
                    {activeActions.map((action, idx) => {
                      const actionId = `${action.type}-${action.anchors.page}-${idx}`;
                      const result = actionResults[actionId];
                      
                      return (
                        <div key={actionId} className="border border-purple-200 rounded-lg p-3 bg-purple-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-medium">
                                {action.type.toUpperCase()}
                              </span>
                              <span className="text-xs text-gray-600">
                                {Math.round(action.confidence * 100)}% confidence
                              </span>
                            </div>
                            <button
                              onClick={() => executeButlerAction(action)}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
                            >
                              ▶ Execute
                            </button>
                          </div>
                          
                          <p className="text-xs text-gray-600 mb-2">
                            {action.reasoning}
                          </p>
                          
                          {result && (
                            <div className="bg-white rounded p-2 mt-2">
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                                {result}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🔬</div>
                <p>Select text to run Surgeon-View analysis</p>
                <p className="text-xs mt-2">
                  Anatomical axes • Clinical timelines • Butler actions
                </p>
                
                {selectedText && isAnalyzing && (
                  <div className="mt-4">
                    <div className="animate-spin text-2xl mb-2">🩺</div>
                    <p className="text-sm">Running fused pipeline analysis...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
