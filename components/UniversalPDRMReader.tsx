"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Document, Page } from "react-pdf";
import type { TOCEntry } from "@/lib/tocParser";
import ErrorBoundary from "@/components/ErrorBoundary";
import { pdfLoadingManager, type PDFLoadState } from "@/lib/pdfLoadingManager";
import { 
  universalPDRMGenerator, 
  type UniversalPDRMDocument, 
  type UniversalPDRMSection, 
  type ButlerInsight,
  type RichTextContent,
  type PDRMTOCEntry
} from "@/lib/universalPdrmGenerator";

interface UniversalPDRMReaderProps {
  bookId: string;
  userId: string;
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;
  onPageCount?: (count: number) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  selectedVoice?: SpeechSynthesisVoice;
  speechRate?: number;
  tableOfContents?: TOCEntry[];
}

interface ButlerInsightRenderer {
  insight: ButlerInsight;
  isVisible: boolean;
  isPersistent: boolean;
}

export default function UniversalPDRMReader({
  bookId,
  userId,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  onPageCount,
  onTextSelect,
  onGenerateNote,
  fontSize,
  fontFamily,
  lineSpacing,
  selectedVoice,
  speechRate = 1.0,
  tableOfContents = [],
}: UniversalPDRMReaderProps) {
  
  // Core State Management
  const [pdrmDocument, setPdrmDocument] = useState<UniversalPDRMDocument | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [visibleInsights, setVisibleInsights] = useState<ButlerInsightRenderer[]>([]);
  
  // PDF State
  const [pdfScale, setPdfScale] = useState(1.3);
  const [selectedText, setSelectedText] = useState("");
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  // Speech State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // File Processing State
  const [extractedText, setExtractedText] = useState("");
  const [isTextReady, setIsTextReady] = useState(false);

  console.log('🔬 UniversalPDRMReader loaded:', {
    bookId,
    currentPage,
    pdfPageCount,
    hasDocument: !!pdrmDocument
  });

  // Extract text from PDF when it loads
  useEffect(() => {
    if (pdfUrl && !isTextReady) {
      extractTextFromPDF();
    }
  }, [pdfUrl, isTextReady]);

  // Generate PDRM document when text is ready
  useEffect(() => {
    if (extractedText && !pdrmDocument && !isGenerating) {
      generatePDRMDocument();
    }
  }, [extractedText, pdrmDocument, isGenerating]);

  // Update Butler insights based on current page and active section
  useEffect(() => {
    if (pdrmDocument && activeSection) {
      updateButlerInsights();
    }
  }, [currentPage, activeSection, pdrmDocument]);

  const extractTextFromPDF = async () => {
    try {
      console.log('📄 Extracting text from PDF...');
      
      // For now, we'll use a placeholder. In a real implementation, 
      // you'd use PDF.js to extract text content
      const mockText = `
        Embryonic Development and Neural Crest Formation
        
        Neural crest cells are a remarkable population of cells that arise during embryonic development in vertebrates. These cells originate from the ectoderm at the border between the neural plate and the non-neural ectoderm. The process of neural crest formation is a complex cascade of molecular events that involves precise spatial and temporal gene expression patterns.
        
        The formation of neural crest cells begins during neurulation, when the neural plate folds to form the neural tube. At the dorsal aspect of the neural tube, a population of cells delaminates and begins to migrate throughout the embryo. This process is regulated by a network of transcription factors including Snail, Slug, FoxD3, and Sox10.
        
        Neural crest cells are pluripotent and give rise to diverse cell types including peripheral neurons, glial cells, melanocytes, and craniofacial cartilage and bone. The migration of these cells follows specific pathways that are guided by environmental cues and cell-cell interactions.
        
        The molecular mechanisms underlying neural crest formation involve several signaling pathways. BMP (Bone Morphogenetic Protein) signaling plays a crucial role in specifying neural crest identity. The gradient of BMP signaling across the dorsal-ventral axis of the neural tube helps establish the neural crest domain.
        
        Wnt signaling also contributes to neural crest specification and maintenance. The canonical Wnt pathway activates transcription factors that promote neural crest gene expression. Additionally, FGF (Fibroblast Growth Factor) signaling provides survival and proliferation signals to neural crest cells.
        
        Understanding neural crest development has important clinical implications. Defects in neural crest formation can lead to a variety of birth defects collectively known as neurocristopathies. These include conditions such as Hirschsprung disease, Waardenburg syndrome, and various craniofacial malformations.
        
        The study of neural crest cells has also provided insights into cancer biology, as many of the pathways involved in neural crest migration and differentiation are dysregulated in cancer metastasis. This connection highlights the fundamental importance of developmental biology in understanding disease processes.
      `;
      
      setExtractedText(mockText);
      setIsTextReady(true);
      
    } catch (error) {
      console.error('❌ Text extraction failed:', error);
    }
  };

  const generatePDRMDocument = async () => {
    if (!extractedText || isGenerating) return;
    
    try {
      setIsGenerating(true);
      setGenerationProgress("🔍 Initializing Universal PDRM analysis...");
      
      console.log('🔬 Starting PDRM document generation...');
      
      const document = await universalPDRMGenerator.generatePDRMDocument(
        extractedText,
        {
          filename: `document-${bookId}.pdf`,
          pageCount: pdfPageCount || 10,
          progressCallback: setGenerationProgress
        }
      );
      
      setPdrmDocument(document);
      
      // Auto-select first section
      const firstSection = document.tocIndex[0];
      if (firstSection) {
        setActiveSection(firstSection.conceptId);
      }
      
      console.log('✅ PDRM document generated:', {
        sections: document.totalSections,
        subject: document.subject,
        confidence: Math.round(document.metadata.avgConfidence * 100) + '%'
      });
      
    } catch (error) {
      console.error('❌ PDRM generation failed:', error);
      setGenerationProgress("❌ Failed to generate PDRM analysis");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateButlerInsights = () => {
    if (!pdrmDocument || !activeSection) return;
    
    const section = pdrmDocument.sections.get(activeSection);
    if (!section) return;
    
    // Collect all Butler insights from the active section
    const allInsights: ButlerInsightRenderer[] = [];
    
    // Add insights from all PDRM subsections
    const subsections: (keyof UniversalPDRMSection)[] = [
      'pattern', 'decisionRule', 'mechanism', 'application', 
      'wrongAnswerMap', 'visualAnchor', 'crossLinks', 'reflection'
    ];
    
    subsections.forEach(subsectionKey => {
      const subsection = section[subsectionKey];
      if (subsection?.butlerInsights) {
        subsection.butlerInsights.forEach(insight => {
          allInsights.push({
            insight,
            isVisible: true,
            isPersistent: insight.persistent
          });
        });
      }
    });
    
    // Get relevant insights from Butler state manager
    const currentConcepts = pdrmDocument.tocIndex
      .filter(entry => entry.conceptId === activeSection)
      .map(entry => entry.title);
    
    const relevantInsights = pdrmDocument.butlerStateManager.getRelevantInsights(
      activeSection, 
      currentConcepts
    );
    
    relevantInsights.forEach(insight => {
      if (!allInsights.some(renderer => renderer.insight.id === insight.id)) {
        allInsights.push({
          insight,
          isVisible: true,
          isPersistent: insight.persistent
        });
      }
    });
    
    // Update page context
    pdrmDocument.butlerStateManager.updatePageContext(currentPage, currentConcepts);
    
    setVisibleInsights(allInsights);
  };

  // Handle text selection
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    if (selection && selection.length > 10) {
      setSelectedText(selection);
      onTextSelect?.(selection);
    }
  }, [onTextSelect]);

  // Speech synthesis
  const speakSection = useCallback((content: RichTextContent) => {
    if (speechRef.current) {
      speechSynthesis.cancel();
    }

    // Create combined text with Butler insights
    let textToSpeak = content.text;
    if (content.butlerInsights.length > 0) {
      textToSpeak += "\n\nButler insight: " + content.butlerInsights[0].content;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
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

  // Export functions
  const exportToNoteLab = () => {
    if (!pdrmDocument) return;
    
    const exportData = {
      document: {
        id: pdrmDocument.id,
        title: pdrmDocument.title,
        subject: pdrmDocument.subject,
        sections: pdrmDocument.totalSections
      },
      sections: Array.from(pdrmDocument.sections.entries()).map(([id, section]) => ({
        id,
        pattern: section.pattern.text,
        decisionRule: section.decisionRule.text,
        mechanism: section.mechanism.text,
        application: section.application.text,
        wrongAnswerMap: section.wrongAnswerMap.text,
        visualAnchor: section.visualAnchor.text,
        crossLinks: section.crossLinks.text,
        reflection: section.reflection.text,
        butlerInsights: [
          ...section.pattern.butlerInsights,
          ...section.decisionRule.butlerInsights,
          ...section.mechanism.butlerInsights,
          ...section.application.butlerInsights,
          ...section.wrongAnswerMap.butlerInsights,
          ...section.visualAnchor.butlerInsights,
          ...section.crossLinks.butlerInsights,
          ...section.reflection.butlerInsights
        ]
      }))
    };
    
    // Create downloadable JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `universal-pdrm-${pdrmDocument.title}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📤 Exported to NoteLab:', exportData.sections.length, 'sections');
  };

  // Render Butler insight component
  const renderButlerInsight = (renderer: ButlerInsightRenderer, index: number) => {
    const { insight } = renderer;
    
    return (
      <div
        key={insight.id}
        className={`p-3 rounded-lg border-l-4 mb-3 ${
          insight.persistent ? 'bg-blue-50 border-blue-400' : 'bg-amber-50 border-amber-400'
        }`}
      >
        <div className="flex items-start gap-2">
          {insight.visualCue && (
            <span className="text-lg flex-shrink-0 mt-0.5">{insight.visualCue}</span>
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-medium capitalize ${
                insight.persistent ? 'text-blue-700' : 'text-amber-700'
              }`}>
                {insight.type.replace('_', ' ')} {insight.persistent && '(Persistent)'}
              </span>
              <span className="text-xs text-gray-500">
                {Math.round(insight.confidence * 100)}%
              </span>
            </div>
            <p className={`text-sm leading-relaxed ${
              insight.persistent ? 'text-blue-800' : 'text-amber-800'
            }`}>
              {insight.content}
            </p>
            {insight.relatedConcepts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {insight.relatedConcepts.slice(0, 3).map((concept, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded text-xs ${
                      insight.persistent 
                        ? 'bg-blue-200 text-blue-800' 
                        : 'bg-amber-200 text-amber-800'
                    }`}
                  >
                    {concept}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render PDRM section component
  const renderPDRMSection = (section: UniversalPDRMSection, sectionId: string) => {
    const sectionTitles = {
      pattern: '🎯 Pattern',
      decisionRule: '🚦 Decision Rule',
      mechanism: '⚙️ Mechanism',
      application: '🛠️ Application',
      wrongAnswerMap: '⚠️ Wrong Answer Map',
      visualAnchor: '🧠 Visual Anchor',
      crossLinks: '🔗 Cross Links',
      reflection: '🤔 Reflection'
    };

    const subsections: (keyof UniversalPDRMSection)[] = [
      'pattern', 'decisionRule', 'mechanism', 'application',
      'wrongAnswerMap', 'visualAnchor', 'crossLinks', 'reflection'
    ];

    return (
      <div className="space-y-4">
        {subsections.map((key) => {
          const content = section[key];
          const title = sectionTitles[key];
          
          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">
                      {Math.round(content.confidence * 100)}% confidence
                    </span>
                    <button
                      onClick={() => speakSection(content)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                    >
                      🔊 Speak
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                {/* Main content */}
                <div className="prose prose-sm max-w-none mb-4">
                  {content.text.split('\n').map((paragraph, i) => (
                    <p key={i} className="mb-2 leading-relaxed text-gray-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
                
                {/* Embedded Butler insights */}
                {content.butlerInsights.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h5 className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                      🤖 Embedded Butler Insights
                    </h5>
                    <div className="space-y-3">
                      {content.butlerInsights.map((insight, i) => (
                        <div key={i} className="bg-indigo-50 border border-indigo-200 rounded p-3">
                          <div className="flex items-start gap-2">
                            {insight.visualCue && (
                              <span className="text-sm flex-shrink-0 mt-0.5">{insight.visualCue}</span>
                            )}
                            <p className="text-sm text-indigo-800 leading-relaxed">
                              {insight.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Metadata */}
                <div className="flex items-center justify-between text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <span>Subject: {content.metadata.subject}</span>
                    <span>Complexity: {content.metadata.complexity}</span>
                    <span>Words: {content.metadata.wordCount}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {content.metadata.keyTerms.slice(0, 3).map((term, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-200 rounded">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="h-full flex flex-col bg-gray-900 text-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-red-400">⚠️ Universal PDRM Reader Error</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🔬</div>
              <h3 className="text-xl font-bold text-red-400 mb-2">Universal PDRM Reader failed to load</h3>
              <p className="text-gray-400 mb-4">There was an issue loading the universal reader interface.</p>
            </div>
          </div>
        </div>
      }
      resetKeys={[currentPage, userId, pdfUrl]}
    >
      <div className="h-full flex bg-gray-50">
        {/* PDF Viewer - Left Pane (60% width) */}
        <div className="w-3/5 bg-white border-r border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-b border-purple-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔬</span>
              <div>
                <h3 className="text-lg font-bold text-purple-800">Universal PDRM Butler</h3>
                <p className="text-xs text-purple-600">
                  {pdrmDocument 
                    ? `${pdrmDocument.subject} • ${pdrmDocument.totalSections} sections • Butler-enhanced` 
                    : 'Universal subject analysis • Embedded Butler insights'
                  }
                </p>
              </div>
            </div>
            
            {/* Navigation Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className={`px-2 py-1 rounded text-sm transition-all ${
                  currentPage <= 1 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                ←
              </button>
              
              <div className="flex items-center gap-1">
                <span className="text-sm text-purple-700 font-medium">
                  {currentPage} / {pdfPageCount || '...'}
                </span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
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
                    onPageCount?.(pdf.numPages);
                  }}
                  onLoadError={(error) => {
                    console.error('📄 PDF load error:', error);
                  }}
                  loading={
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className="animate-spin text-4xl mb-4">🔬</div>
                      <p className="text-gray-600">Loading Universal PDRM reader...</p>
                      <p className="text-xs text-gray-500 mt-2">Preparing Butler-enhanced analysis</p>
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
                    />
                  )}
                </Document>
              </div>
            </div>
          </div>
        </div>

        {/* Universal PDRM Panel - Right Pane (40% width) */}
        <div className="w-2/5 bg-white flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-purple-700">
                🔬 Universal PDRM Analysis
              </h4>
              {pdrmDocument && (
                <div className="flex gap-2">
                  <button
                    onClick={exportToNoteLab}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
                  >
                    📤 Export
                  </button>
                  {isSpeaking && (
                    <button
                      onClick={stopSpeaking}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                    >
                      🛑 Stop
                    </button>
                  )}
                </div>
              )}
            </div>

            {pdrmDocument && (
              <div className="text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Subject: <strong>{pdrmDocument.subject}</strong></span>
                  <span>Confidence: <strong>{Math.round(pdrmDocument.metadata.avgConfidence * 100)}%</strong></span>
                </div>
                <div className="mt-1 text-xs">
                  {pdrmDocument.totalSections} sections • {visibleInsights.filter(i => i.isPersistent).length} persistent insights
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {isGenerating ? (
              <div className="p-6 text-center">
                <div className="animate-spin text-4xl mb-4">🔬</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Generating Universal PDRM Analysis
                </h3>
                <p className="text-sm text-gray-600 mb-4">{generationProgress}</p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: isGenerating ? '60%' : '100%' }}
                  />
                </div>
              </div>
            ) : !pdrmDocument ? (
              <div className="p-6 text-center text-gray-500">
                <div className="text-4xl mb-4">🔬</div>
                <p className="text-lg font-medium mb-2">Universal PDRM Butler Ready</p>
                <p className="text-sm">
                  Upload a PDF to generate comprehensive PDRM analysis with embedded Butler insights
                  across any subject matter.
                </p>
              </div>
            ) : (
              <div className="flex">
                {/* TOC Navigation - Left Side */}
                <div className="w-1/3 border-r border-gray-200 bg-gray-50">
                  <div className="p-3 border-b border-gray-200">
                    <h5 className="text-sm font-semibold text-gray-700">📚 Sections</h5>
                  </div>
                  <div className="p-2">
                    {pdrmDocument.tocIndex.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => setActiveSection(entry.conceptId)}
                        className={`w-full text-left p-2 rounded mb-1 text-sm transition-colors ${
                          activeSection === entry.conceptId
                            ? 'bg-purple-600 text-white'
                            : 'hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="font-medium truncate">{entry.title}</div>
                        <div className="text-xs opacity-75 mt-1">
                          Page {entry.pageNumber} • {entry.hasButlerInsights ? '🤖' : '📄'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PDRM Content - Right Side */}
                <div className="flex-1 p-4">
                  {activeSection && pdrmDocument.sections.has(activeSection) ? (
                    renderPDRMSection(pdrmDocument.sections.get(activeSection)!, activeSection)
                  ) : (
                    <div className="text-center text-gray-500 py-12">
                      <div className="text-3xl mb-2">📄</div>
                      <p>Select a section to view PDRM analysis</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
