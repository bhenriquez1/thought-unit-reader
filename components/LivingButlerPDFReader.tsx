"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { TOCEntry } from "@/lib/tocParser";
import ErrorBoundary from "@/components/ErrorBoundary";
import { 
  universalPDRMGenerator, 
  type UniversalPDRMDocument, 
  type ButlerInsight
} from "@/lib/universalPdrmGenerator";

// Set up PDF.js worker
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface LivingButlerPDFReaderProps {
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

interface ButlerAnnotation {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  insight: ButlerInsight;
  triggerText: string;
}

interface ChapterInfo {
  title: string;
  pageStart: number;
  pageEnd: number;
  butlerCount: number;
  concepts: string[];
}

interface PDFProcessingState {
  stage: 'idle' | 'extracting' | 'analyzing' | 'annotating' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export default function LivingButlerPDFReader({
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
}: LivingButlerPDFReaderProps) {
  
  // Core State
  const [pdfScale, setPdfScale] = useState(1.3);
  const [pdrmDocument, setPdrmDocument] = useState<UniversalPDRMDocument | null>(null);
  const [butlerAnnotations, setButlerAnnotations] = useState<ButlerAnnotation[]>([]);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  
  // Processing State
  const [processingState, setProcessingState] = useState<PDFProcessingState>({
    stage: 'idle',
    progress: 0,
    message: 'Ready'
  });
  
  // Refs
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const extractedTextRef = useRef<Map<number, string>>(new Map());
  const extractionAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Process PDF when URL changes — cancel any in-flight extraction first
  useEffect(() => {
    if (pdfUrl && pdfPageCount && pdfPageCount > 0) {
      extractionAbortRef.current = { cancelled: false };
      processLivingButlerPDF();
    }
    return () => { extractionAbortRef.current.cancelled = true; };
  }, [pdfUrl, pdfPageCount]);

  // Main processing pipeline
  const processLivingButlerPDF = async () => {
    if (!pdfUrl) return;
    const abort = extractionAbortRef.current;

    try {
      setProcessingState({
        stage: 'extracting',
        progress: 10,
        message: '📄 Extracting text from PDF pages...'
      });

      // Step 1: Extract text from all PDF pages
      const allPageTexts = await extractAllPageTexts(abort);
      if (abort.cancelled) return;

      const combinedText = Array.from(allPageTexts.values()).join('\n\n');

      if (!combinedText.trim()) {
        throw new Error('No readable text found in PDF');
      }

      setProcessingState({
        stage: 'analyzing',
        progress: 40,
        message: '🤖 Generating Universal PDRM and Butler analysis...'
      });

      // Step 2: Generate Universal PDRM Document
      const pdrmDoc = await universalPDRMGenerator.generatePDRMDocument(
        combinedText,
        {
          filename: `living-butler-${bookId}.pdf`,
          pageCount: pdfPageCount || 1,
          progressCallback: (progress) => {
            if (abort.cancelled) return;
            setProcessingState(prev => ({
              ...prev,
              progress: 40 + (progress === '✅ Generated' ? 40 : 20),
              message: `🤖 ${progress}`
            }));
          }
        }
      );

      if (abort.cancelled) return;
      setPdrmDocument(pdrmDoc);

      setProcessingState({
        stage: 'annotating',
        progress: 80,
        message: '🔬 Creating living Butler annotations...'
      });

      // Step 3: Create Butler annotations mapped to PDF pages
      const annotations = await createButlerAnnotations(pdrmDoc, allPageTexts);
      if (abort.cancelled) return;
      setButlerAnnotations(annotations);

      // Step 4: Analyze chapters and Butler coverage
      const chapterInfo = await analyzeChaptersWithButler(pdrmDoc, tableOfContents, annotations);
      if (abort.cancelled) return;
      setChapters(chapterInfo);

      setProcessingState({
        stage: 'complete',
        progress: 100,
        message: `✅ Living Butler analysis complete! ${annotations.length} insights embedded.`
      });

    } catch (error) {
      if (abort.cancelled) return;
      console.error('[LivingButlerPDFReader] processing failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';

      setProcessingState({
        stage: 'error',
        progress: 0,
        message: `❌ ${errorMessage}`,
        error: errorMessage
      });
    }
  };

  // Extract text from all PDF pages using PDF.js getTextContent
  const extractAllPageTexts = async (abort: { cancelled: boolean }): Promise<Map<number, string>> => {
    const pageTexts = new Map<number, string>();

    if (!pdfPageCount || !pdfUrl) {
      throw new Error('PDF page count or URL not available');
    }

    // Load the PDF document via pdfjs-dist directly (same worker already configured above)
    const loadingTask = (pdfjs as any).getDocument(pdfUrl);
    const pdfDoc = await loadingTask.promise;
    if (abort.cancelled) { loadingTask.destroy(); return pageTexts; }

    const totalPages = pdfDoc.numPages;
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (abort.cancelled) { pdfDoc.destroy(); return pageTexts; }

      try {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        pageTexts.set(pageNum, text ? `[PAGE ${pageNum}]\n${text}` : '');
        page.cleanup();
      } catch {
        pageTexts.set(pageNum, '');
      }

      const progress = 10 + (pageNum / totalPages) * 30;
      setProcessingState(prev => ({
        ...prev,
        progress,
        message: `📄 Extracting page ${pageNum}/${totalPages}...`
      }));
    }

    pdfDoc.destroy();
    extractedTextRef.current = pageTexts;
    return pageTexts;
  };

  // Create Butler annotations from PDRM document
  const createButlerAnnotations = async (
    pdrmDoc: UniversalPDRMDocument,
    pageTexts: Map<number, string>
  ): Promise<ButlerAnnotation[]> => {
    const annotations: ButlerAnnotation[] = [];
    let annotationId = 0;

    // Process each PDRM section and create annotations
    for (const [, section] of pdrmDoc.sections.entries()) {

      // Get all Butler insights from this section
      const allInsights: ButlerInsight[] = [
        ...section.pattern.butlerInsights,
        ...section.decisionRule.butlerInsights,
        ...section.mechanism.butlerInsights,
        ...section.application.butlerInsights,
        ...section.wrongAnswerMap.butlerInsights,
        ...section.visualAnchor.butlerInsights,
        ...section.crossLinks.butlerInsights,
        ...section.reflection.butlerInsights
      ];

      // Create annotations for each insight
      for (const insight of allInsights) {
        // Find the best page for this insight based on related concepts
        const targetPage = findBestPageForInsight(insight, pageTexts);
        
        if (targetPage > 0) {
          // Create annotation at a reasonable position
          const annotation: ButlerAnnotation = {
            id: `butler-annotation-${annotationId++}`,
            pageNumber: targetPage,
            x: 50 + (annotationId % 3) * 200, // Distribute horizontally
            y: 100 + (Math.floor(annotationId / 3) % 5) * 100, // Stack vertically
            width: 20,
            height: 20,
            insight,
            triggerText: insight.relatedConcepts[0] || 'concept'
          };

          annotations.push(annotation);
        }
      }
    }

    return annotations;
  };

  // Find the best page for a Butler insight
  const findBestPageForInsight = (
    insight: ButlerInsight,
    pageTexts: Map<number, string>
  ): number => {
    let bestPage = 1;
    let maxRelevance = 0;

    for (const [pageNum, text] of pageTexts.entries()) {
      let relevance = 0;

      // Check if any related concepts appear on this page
      for (const concept of insight.relatedConcepts) {
        const conceptLower = concept.toLowerCase();
        const textLower = text.toLowerCase();
        
        // Count occurrences of this concept
        const occurrences = (textLower.match(new RegExp(conceptLower, 'g')) || []).length;
        relevance += occurrences;
      }

      if (relevance > maxRelevance) {
        maxRelevance = relevance;
        bestPage = pageNum;
      }
    }

    return maxRelevance > 0 ? bestPage : Math.min(3, pageTexts.size); // Default to early page
  };

  // Analyze chapters and Butler coverage
  const analyzeChaptersWithButler = async (
    pdrmDoc: UniversalPDRMDocument,
    toc: TOCEntry[],
    annotations: ButlerAnnotation[]
  ): Promise<ChapterInfo[]> => {
    const chapters: ChapterInfo[] = [];

    if (toc.length === 0) {
      // Create default chapters if no TOC
      const pagesPerChapter = Math.max(1, Math.floor((pdfPageCount || 10) / 3));
      for (let i = 0; i < 3; i++) {
        const startPage = i * pagesPerChapter + 1;
        const endPage = Math.min((i + 1) * pagesPerChapter, pdfPageCount || 10);
        
        const chapterAnnotations = annotations.filter(
          ann => ann.pageNumber >= startPage && ann.pageNumber <= endPage
        );

        chapters.push({
          title: `Chapter ${i + 1}`,
          pageStart: startPage,
          pageEnd: endPage,
          butlerCount: chapterAnnotations.length,
          concepts: [...new Set(chapterAnnotations.flatMap(ann => ann.insight.relatedConcepts))]
        });
      }
    } else {
      // Use actual TOC
      for (let i = 0; i < toc.length; i++) {
        const tocEntry = toc[i];
        const startPage = (tocEntry as any).page || (tocEntry as any).pageNumber || 1;
        const endPage = i < toc.length - 1 
          ? ((toc[i + 1] as any).page || (toc[i + 1] as any).pageNumber || startPage + 5) - 1
          : pdfPageCount || startPage + 5;

        const chapterAnnotations = annotations.filter(
          ann => ann.pageNumber >= startPage && ann.pageNumber <= endPage
        );

        chapters.push({
          title: (tocEntry as any).title || `Chapter ${i + 1}`,
          pageStart: startPage,
          pageEnd: endPage,
          butlerCount: chapterAnnotations.length,
          concepts: [...new Set(chapterAnnotations.flatMap(ann => ann.insight.relatedConcepts))]
        });
      }
    }

    return chapters;
  };

  // Handle text selection
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    if (selection && selection.length > 10) {
      setSelectedText(selection);
      onTextSelect?.(selection);
    }
  }, [onTextSelect]);

  // Render Butler annotation
  const renderButlerAnnotation = (annotation: ButlerAnnotation) => {
    const isHovered = hoveredAnnotation === annotation.id;
    
    return (
      <div
        key={annotation.id}
        className="absolute cursor-pointer"
        style={{
          left: annotation.x,
          top: annotation.y,
          width: annotation.width,
          height: annotation.height
        }}
        onMouseEnter={() => setHoveredAnnotation(annotation.id)}
        onMouseLeave={() => setHoveredAnnotation(null)}
        onClick={(e) => {
          e.stopPropagation();
          // Speak the Butler insight
          if (speechRef.current) {
            speechSynthesis.cancel();
          }
          const utterance = new SpeechSynthesisUtterance(annotation.insight.content);
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.rate = speechRate;
          speechRef.current = utterance;
          speechSynthesis.speak(utterance);
        }}
      >
        {/* Butler Marker */}
        <div className={`w-full h-full rounded-full flex items-center justify-center text-xs font-bold transition-all ${
          annotation.insight.persistent 
            ? 'bg-blue-500 text-white' 
            : 'bg-amber-500 text-white'
        } ${isHovered ? 'scale-110 shadow-lg' : 'scale-100'}`}>
          {annotation.insight.visualCue || '🔬'}
        </div>

        {/* Hover Tooltip */}
        {isHovered && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white p-3 rounded-lg shadow-xl z-50 w-80 max-w-sm">
            <div className="text-xs font-medium text-blue-300 mb-1">
              Butler {annotation.insight.type.replace('_', ' ')} 
              {annotation.insight.persistent && ' (Persistent)'}
            </div>
            <p className="text-sm leading-relaxed mb-2">
              {annotation.insight.content}
            </p>
            <div className="flex items-center justify-between text-xs">
              <div className="flex flex-wrap gap-1">
                {annotation.insight.relatedConcepts.slice(0, 2).map((concept, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-800 rounded text-blue-200">
                    {concept}
                  </span>
                ))}
              </div>
              <span className="text-gray-400">
                {Math.round(annotation.insight.confidence * 100)}%
              </span>
            </div>
            {/* Arrow pointing down */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    );
  };

  // Render Smart TOC
  const renderSmartTOC = () => {
    return (
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* TOC Header */}
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>📚</span>
            Smart Table of Contents
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {pdrmDocument?.subject} • {butlerAnnotations.length} Butler insights
          </p>
        </div>

        {/* Chapter List */}
        <div className="flex-1 overflow-y-auto p-2">
          {chapters.map((chapter, index) => (
            <button
              key={index}
              onClick={() => onPageChange(chapter.pageStart)}
              className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                currentPage >= chapter.pageStart && currentPage <= chapter.pageEnd
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium text-sm">{chapter.title}</h4>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(3, chapter.butlerCount) }, (_, i) => (
                    <span key={i} className="text-xs">🔬</span>
                  ))}
                  {chapter.butlerCount > 3 && (
                    <span className="text-xs text-gray-400">+{chapter.butlerCount - 3}</span>
                  )}
                </div>
              </div>
              
              <div className="text-xs opacity-75">
                Pages {chapter.pageStart}-{chapter.pageEnd} • {chapter.butlerCount} insights
              </div>
              
              {chapter.concepts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {chapter.concepts.slice(0, 3).map((concept, i) => (
                    <span 
                      key={i} 
                      className="px-2 py-0.5 bg-gray-600 text-gray-300 rounded text-xs"
                    >
                      {concept}
                    </span>
                  ))}
                  {chapter.concepts.length > 3 && (
                    <span className="text-xs text-gray-500">+{chapter.concepts.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Butler Stats */}
        <div className="p-3 border-t border-gray-700 bg-gray-900">
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Total Butler Insights:</span>
              <span className="text-blue-400 font-medium">{butlerAnnotations.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Persistent Insights:</span>
              <span className="text-green-400 font-medium">
                {butlerAnnotations.filter(a => a.insight.persistent).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Subject:</span>
              <span className="text-purple-400 font-medium">{pdrmDocument?.subject || 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="h-full flex flex-col bg-gray-900 text-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-red-400">⚠️ Living Butler PDF Reader Error</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🔬</div>
              <h3 className="text-xl font-bold text-red-400 mb-2">Living Butler Reader failed to load</h3>
              <p className="text-gray-400 mb-4">There was an issue loading the living Butler interface.</p>
            </div>
          </div>
        </div>
      }
      resetKeys={[currentPage, userId, pdfUrl]}
    >
      <div className="h-full flex bg-gray-50">
        {/* Smart TOC Sidebar */}
        {pdfPageCount && pdfPageCount > 0 && renderSmartTOC()}

        {/* Main PDF Viewer */}
        <div className="flex-1 bg-white border-r border-gray-200 flex flex-col">
          {/* Header with Processing Status */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-b border-purple-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔬</span>
              <div>
                <h3 className="text-lg font-bold text-purple-800">Living Butler PDF Reader</h3>
                <p className="text-xs text-purple-600">
                  {processingState.stage === 'complete' 
                    ? `${butlerAnnotations.length} Butler insights embedded • ${chapters.length} chapters detected`
                    : processingState.message
                  }
                </p>
              </div>
            </div>
            
            {/* Navigation + Status */}
            <div className="flex items-center gap-2">
              {processingState.stage !== 'idle' && processingState.stage !== 'complete' && (
                <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-purple-700">
                    {processingState.progress}% • {processingState.stage}
                  </span>
                </div>
              )}
              
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
                
                <span className="text-sm text-purple-700 font-medium">
                  {currentPage} / {pdfPageCount || '...'}
                </span>
                
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
          </div>

          {/* PDF Content with Butler Annotations */}
          <div 
            ref={pdfContainerRef}
            className="flex-1 overflow-auto bg-gray-100 p-4 relative"
            onMouseUp={handleMouseUp}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily,
              lineHeight: lineSpacing
            }}
          >
            {processingState.stage === 'error' ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-4xl mb-4 text-red-500">❌</div>
                <h3 className="text-lg font-semibold text-red-600 mb-2">Processing Failed</h3>
                <p className="text-gray-600 text-sm text-center max-w-md">
                  {processingState.error}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500"
                >
                  🔄 Try Again
                </button>
              </div>
            ) : (
              <div className="flex justify-center relative">
                <div className="bg-white shadow-lg relative">
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={(pdf) => {
                      onPageCount?.(pdf.numPages);
                    }}
                    onLoadError={(error) => {
                      console.error('📄 PDF load error:', error);
                      setProcessingState({
                        stage: 'error',
                        progress: 0,
                        message: 'PDF loading failed',
                        error: 'Failed to load PDF file'
                      });
                    }}
                    loading={
                      <div className="flex flex-col items-center justify-center p-8">
                        <div className="animate-spin text-4xl mb-4">🔬</div>
                        <p className="text-gray-600">Loading Living Butler PDF reader...</p>
                        <p className="text-xs text-gray-500 mt-2">Preparing Butler integration</p>
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
                      <div className="relative">
                        <Page 
                          pageNumber={currentPage} 
                          scale={pdfScale}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                        />
                        
                        {/* Butler Annotations Overlay */}
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="relative w-full h-full">
                            {butlerAnnotations
                              .filter(annotation => annotation.pageNumber === currentPage)
                              .map(annotation => (
                                <div
                                  key={annotation.id}
                                  className="pointer-events-auto"
                                  style={{
                                    position: 'absolute',
                                    left: annotation.x * pdfScale,
                                    top: annotation.y * pdfScale,
                                  }}
                                >
                                  {renderButlerAnnotation(annotation)}
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      </div>
                    )}
                  </Document>
                </div>
              </div>
            )}

            {/* Processing Overlay */}
            {processingState.stage !== 'idle' && processingState.stage !== 'complete' && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="text-center max-w-md">
                  <div className="animate-spin text-6xl mb-4">🔬</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    Processing Living Butler Analysis
                  </h3>
                  <p className="text-gray-600 mb-4">{processingState.message}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${processingState.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{processingState.progress}% complete</p>
                </div>
              </div>
            )}
          </div>

          {/* Butler Insights Panel (Mobile/Tablet) */}
          {butlerAnnotations.length > 0 && (
            <div className="md:hidden bg-gray-50 border-t border-gray-200 p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Butler Insights on Page {currentPage}
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {butlerAnnotations
                  .filter(annotation => annotation.pageNumber === currentPage)
                  .map(annotation => (
                    <button
                      key={annotation.id}
                      onClick={() => {
                        if (speechRef.current) {
                          speechSynthesis.cancel();
                        }
                        const utterance = new SpeechSynthesisUtterance(annotation.insight.content);
                        if (selectedVoice) utterance.voice = selectedVoice;
                        utterance.rate = speechRate;
                        speechRef.current = utterance;
                        speechSynthesis.speak(utterance);
                      }}
                      className="w-full text-left p-2 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0">
                          {annotation.insight.visualCue || '🔬'}
                        </span>
                        <div className="flex-1">
                          <p className="text-gray-700 text-xs leading-relaxed">
                            {annotation.insight.content.slice(0, 100)}...
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
