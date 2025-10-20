/**
 * PDRM Chapter Absorption Pipeline
 * Automatically extracts, analyzes, and generates PDRM content for entire books
 * Integrates with Smart TOC system for readless mode functionality
 */

import { universalPDRMGenerator, type UniversalPDRMDocument } from './universalPdrmGenerator';
import { 
  type SmartTOCEntry, 
  type PDRMSectionData, 
  type ButlerInsightSummary,
  updateSmartTOCWithPDRM,
  findSmartTOCEntry
} from './tocParser';
import { surgeonPdrmEngine } from './surgeonPdrmEngine';

export interface ChapterAbsorptionConfig {
  maxConcurrentProcessing: number;
  chunkSize: number;              // Characters per processing chunk
  overlapSize: number;            // Character overlap between chunks
  cacheResults: boolean;
  enableButlerGeneration: boolean;
  pdrmSections: {
    pattern: boolean;
    decision: boolean;
    mechanism: boolean;
    application: boolean;
    wrongAnswers: boolean;
    visualAnchor: boolean;
    crossLinks: boolean;
    reflection: boolean;
  };
}

export interface ChapterExtractionResult {
  chapterId: string;
  title: string;
  pageNumber: number;
  text: string;
  wordCount: number;
  extractionTime: number;
  confidence: number;
}

export interface ProcessingProgress {
  chapterId: string;
  title: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'generating' | 'complete' | 'error';
  progress: number; // 0-1
  currentStep: string;
  startTime: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

export interface AbsorptionResult {
  chapterId: string;
  success: boolean;
  pdrmDocument?: UniversalPDRMDocument;
  smartTOCEntry?: SmartTOCEntry;
  processingTime: number;
  error?: string;
  stats: {
    textLength: number;
    pdrmSections: number;
    butlerInsights: number;
    confidence: number;
  };
}

/**
 * Main Chapter Absorption Pipeline Class
 */
export class ChapterAbsorptionPipeline {
  private config: ChapterAbsorptionConfig;
  private processingQueue: Map<string, ProcessingProgress> = new Map();
  private resultCache: Map<string, AbsorptionResult> = new Map();
  private progressCallbacks: Set<(progress: ProcessingProgress) => void> = new Set();
  private abortController?: AbortController;

  constructor(config: Partial<ChapterAbsorptionConfig> = {}) {
    this.config = {
      maxConcurrentProcessing: 2, // Conservative for performance
      chunkSize: 5000,           // 5KB chunks for manageable processing
      overlapSize: 500,          // 500 char overlap to preserve context
      cacheResults: true,
      enableButlerGeneration: true,
      pdrmSections: {
        pattern: true,
        decision: true,
        mechanism: true,
        application: true,
        wrongAnswers: true,
        visualAnchor: true,
        crossLinks: false,    // Disabled by default for performance
        reflection: false     // Disabled by default for performance
      },
      ...config
    };

    console.log('🧠 Chapter Absorption Pipeline initialized:', this.config);
  }

  /**
   * Process entire Smart TOC for PDRM absorption
   */
  public async processSmartTOC(
    smartTOC: SmartTOCEntry[],
    extractChapterText: (entry: SmartTOCEntry) => Promise<string>,
    onProgress?: (overall: { processed: number; total: number; currentChapter: string }) => void
  ): Promise<SmartTOCEntry[]> {
    console.log('🧠 Starting Smart TOC processing:', smartTOC.length, 'chapters');
    
    this.abortController = new AbortController();
    const processedTOC = [...smartTOC];
    
    // Get all chapters (including nested ones)
    const allChapters = this.flattenSmartTOC(smartTOC);
    let processedCount = 0;

    try {
      // Process chapters in batches to manage memory and performance
      const batchSize = this.config.maxConcurrentProcessing;
      
      for (let i = 0; i < allChapters.length; i += batchSize) {
        if (this.abortController.signal.aborted) break;
        
        const batch = allChapters.slice(i, i + batchSize);
        console.log(`🧠 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allChapters.length/batchSize)}:`, 
          batch.map(c => c.title));
        
        // Process batch concurrently
        const batchPromises = batch.map(async (chapter) => {
          if (this.abortController?.signal.aborted) return null;
          
          try {
            // Update progress
            onProgress?.({
              processed: processedCount,
              total: allChapters.length,
              currentChapter: chapter.title
            });

            const result = await this.processChapter(chapter, extractChapterText);
            processedCount++;
            
            // Update the Smart TOC entry in place
            if (result.success && result.smartTOCEntry) {
              this.updateSmartTOCInTree(processedTOC, result.smartTOCEntry);
            }
            
            return result;
          } catch (error) {
            console.error(`🧠 Error processing chapter ${chapter.title}:`, error);
            processedCount++;
            return null;
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches to prevent system overload
        if (i + batchSize < allChapters.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log('🧠 Smart TOC processing complete:', processedCount, '/', allChapters.length);
      return processedTOC;
      
    } catch (error) {
      console.error('🧠 Smart TOC processing failed:', error);
      throw error;
    }
  }

  /**
   * Process a single chapter for PDRM absorption
   */
  public async processChapter(
    chapter: SmartTOCEntry,
    extractChapterText: (entry: SmartTOCEntry) => Promise<string>
  ): Promise<AbsorptionResult> {
    const startTime = Date.now();
    
    // Check cache first
    if (this.config.cacheResults && this.resultCache.has(chapter.id)) {
      console.log('🧠 Using cached result for chapter:', chapter.title);
      return this.resultCache.get(chapter.id)!;
    }
    
    // Initialize progress tracking
    const progress: ProcessingProgress = {
      chapterId: chapter.id,
      title: chapter.title,
      status: 'extracting',
      progress: 0,
      currentStep: 'Extracting chapter text',
      startTime
    };
    
    this.processingQueue.set(chapter.id, progress);
    this.notifyProgressCallbacks(progress);
    
    try {
      // Step 1: Extract chapter text
      console.log('🧠 Extracting text for chapter:', chapter.title);
      const chapterText = await extractChapterText(chapter);
      
      if (!chapterText || chapterText.length < 100) {
        throw new Error(`Insufficient chapter content: ${chapterText?.length || 0} characters`);
      }
      
      progress.progress = 0.2;
      progress.status = 'analyzing';
      progress.currentStep = 'Running PDRM analysis';
      this.notifyProgressCallbacks(progress);
      
      // Step 2: Run PDRM analysis
      console.log('🧠 Running PDRM analysis for chapter:', chapter.title);
      const pdrmDocument = await universalPDRMGenerator.generatePDRMDocument(chapterText, {
        filename: `${chapter.title}.chapter`,
        pageCount: 1,
        chunkIndex: 0,
        progressCallback: (progressText) => {
          progress.currentStep = progressText;
          this.notifyProgressCallbacks(progress);
        }
      });
      
      progress.progress = 0.7;
      progress.status = 'generating';
      progress.currentStep = 'Generating Butler insights';
      this.notifyProgressCallbacks(progress);
      
      // Step 3: Generate Butler insights (if enabled)
      let surgeonAnalysis = null;
      if (this.config.enableButlerGeneration) {
        console.log('🧠 Generating Butler insights for chapter:', chapter.title);
        
        try {
          // Use first concept from PDRM analysis for Butler generation
          const firstConcept = Array.from(pdrmDocument.sections.values())[0];
          if (firstConcept) {
            surgeonAnalysis = await surgeonPdrmEngine.runFusedPipeline(
              firstConcept.pattern.text,
              [], // No thought units for now
              {
                userId: 'chapter-processor',
                bookId: 'smart-toc',
                page: chapter.pageNumber
              }
            );
          }
        } catch (error) {
          console.warn('🧠 Butler generation failed, continuing without:', error);
        }
      }
      
      progress.progress = 0.9;
      progress.currentStep = 'Finalizing Smart TOC entry';
      this.notifyProgressCallbacks(progress);
      
      // Step 4: Create updated Smart TOC entry
      const updatedSmartEntry = this.createUpdatedSmartTOCEntry(
        chapter,
        pdrmDocument,
        surgeonAnalysis,
        chapterText
      );
      
      // Step 5: Build result
      const processingTime = Date.now() - startTime;
      const result: AbsorptionResult = {
        chapterId: chapter.id,
        success: true,
        pdrmDocument,
        smartTOCEntry: updatedSmartEntry,
        processingTime,
        stats: {
          textLength: chapterText.length,
          pdrmSections: Array.from(pdrmDocument.sections.values()).length,
          butlerInsights: updatedSmartEntry.butlerInsights.length,
          confidence: pdrmDocument.metadata.avgConfidence
        }
      };
      
      // Cache result
      if (this.config.cacheResults) {
        this.resultCache.set(chapter.id, result);
      }
      
      // Update progress to complete
      progress.status = 'complete';
      progress.progress = 1.0;
      progress.currentStep = 'Complete';
      this.notifyProgressCallbacks(progress);
      
      console.log('🧠 Chapter processing complete:', chapter.title, `(${processingTime}ms)`);
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('🧠 Chapter processing failed:', chapter.title, error);
      
      const errorResult: AbsorptionResult = {
        chapterId: chapter.id,
        success: false,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
        stats: {
          textLength: 0,
          pdrmSections: 0,
          butlerInsights: 0,
          confidence: 0
        }
      };
      
      // Update progress to error
      progress.status = 'error';
      progress.error = errorResult.error;
      this.notifyProgressCallbacks(progress);
      
      return errorResult;
    } finally {
      // Clean up progress tracking
      setTimeout(() => {
        this.processingQueue.delete(chapter.id);
      }, 5000); // Keep progress visible for 5 seconds
    }
  }

  /**
   * Create updated Smart TOC entry from PDRM analysis results
   */
  private createUpdatedSmartTOCEntry(
    originalEntry: SmartTOCEntry,
    pdrmDocument: UniversalPDRMDocument,
    surgeonAnalysis: any,
    chapterText: string
  ): SmartTOCEntry {
    // Extract PDRM sections
    const pdrmSections: SmartTOCEntry['pdrmSections'] = {};
    const allSections = Array.from(pdrmDocument.sections.values());
    
    if (allSections.length > 0) {
      const section = allSections[0]; // Use first section for now
      
      // Map Universal PDRM sections to Smart TOC structure
      if (this.config.pdrmSections.pattern && section.pattern) {
        pdrmSections.pattern = this.createPDRMSectionData(section.pattern, 'pattern');
      }
      if (this.config.pdrmSections.decision && section.decisionRule) {
        pdrmSections.decision = this.createPDRMSectionData(section.decisionRule, 'decision');
      }
      if (this.config.pdrmSections.mechanism && section.mechanism) {
        pdrmSections.mechanism = this.createPDRMSectionData(section.mechanism, 'mechanism');
      }
      if (this.config.pdrmSections.application && section.application) {
        pdrmSections.application = this.createPDRMSectionData(section.application, 'application');
      }
      if (this.config.pdrmSections.wrongAnswers && section.wrongAnswerMap) {
        pdrmSections.wrongAnswers = this.createPDRMSectionData(section.wrongAnswerMap, 'wrongAnswers');
      }
      if (this.config.pdrmSections.visualAnchor && section.visualAnchor) {
        pdrmSections.visualAnchor = this.createPDRMSectionData(section.visualAnchor, 'visualAnchor');
      }
      if (this.config.pdrmSections.crossLinks && section.crossLinks) {
        pdrmSections.crossLinks = this.createPDRMSectionData(section.crossLinks, 'crossLinks');
      }
      if (this.config.pdrmSections.reflection && section.reflection) {
        pdrmSections.reflection = this.createPDRMSectionData(section.reflection, 'reflection');
      }
    }
    
    // Extract Butler insights
    const butlerInsights: ButlerInsightSummary[] = [];
    if (surgeonAnalysis?.actions) {
      surgeonAnalysis.actions.forEach((action: any, index: number) => {
        butlerInsights.push({
          id: `butler-${originalEntry.id}-${index}`,
          type: action.type,
          title: this.getButlerTitle(action.type),
          content: action.payload?.prompt || action.reasoning || '',
          confidence: action.confidence || 0.7,
          anchors: {
            page: originalEntry.pageNumber,
            sectionType: 'butler-generated'
          },
          icon: this.getButlerIcon(action.type)
        });
      });
    }
    
    return {
      ...originalEntry,
      chapterText,
      pdrmSections,
      butlerInsights,
      isProcessed: true,
      processingStatus: 'complete'
    };
  }

  /**
   * Create PDRM section data from Universal PDRM content
   */
  private createPDRMSectionData(
    universalContent: any, 
    sectionType: string
  ): PDRMSectionData {
    return {
      content: universalContent.text || '',
      confidence: universalContent.confidence || 0.7,
      insights: universalContent.butlerInsights?.map((insight: any, index: number) => ({
        id: `insight-${sectionType}-${index}`,
        type: insight.type || 'explain',
        title: insight.content || 'Butler Insight',
        content: insight.content || '',
        confidence: insight.confidence || 0.7,
        anchors: {
          page: 1,
          sectionType
        },
        icon: this.getButlerIcon(insight.type || 'explain')
      })) || [],
      processingTime: Date.now()
    };
  }

  /**
   * Utility functions
   */
  private flattenSmartTOC(smartTOC: SmartTOCEntry[]): SmartTOCEntry[] {
    const flattened: SmartTOCEntry[] = [];
    
    const flatten = (entries: SmartTOCEntry[]) => {
      entries.forEach(entry => {
        flattened.push(entry);
        if (entry.subChapters) {
          flatten(entry.subChapters);
        }
      });
    };
    
    flatten(smartTOC);
    return flattened;
  }

  private updateSmartTOCInTree(tree: SmartTOCEntry[], updatedEntry: SmartTOCEntry): void {
    const updateInArray = (entries: SmartTOCEntry[]): boolean => {
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].id === updatedEntry.id) {
          entries[i] = updatedEntry;
          return true;
        }
        if (entries[i].subChapters && updateInArray(entries[i].subChapters!)) {
          return true;
        }
      }
      return false;
    };
    
    updateInArray(tree);
  }

  private getButlerTitle(actionType: string): string {
    const titles: Record<string, string> = {
      'explain': '🧠 Butler Explanation',
      'compare': '⚖️ Comparative Analysis',
      'quiz': '❓ Knowledge Check', 
      'mnemonic': '🎯 Memory Aid',
      'timeline': '⏱️ Process Timeline',
      'diagram': '📊 Visual Diagram'
    };
    return titles[actionType] || 'Butler Insight';
  }

  private getButlerIcon(actionType: string): string {
    const icons: Record<string, string> = {
      'explain': '🧠',
      'compare': '⚖️',
      'quiz': '❓',
      'mnemonic': '🎯', 
      'timeline': '⏱️',
      'diagram': '📊'
    };
    return icons[actionType] || '💡';
  }

  private notifyProgressCallbacks(progress: ProcessingProgress): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }

  /**
   * Public API methods for external control
   */
  
  /**
   * Add progress callback
   */
  public onProgress(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallbacks.add(callback);
  }

  /**
   * Remove progress callback
   */
  public offProgress(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallbacks.delete(callback);
  }

  /**
   * Get current processing queue status
   */
  public getProcessingQueue(): ProcessingProgress[] {
    return Array.from(this.processingQueue.values());
  }

  /**
   * Get cached results
   */
  public getCachedResults(): AbsorptionResult[] {
    return Array.from(this.resultCache.values());
  }

  /**
   * Clear result cache
   */
  public clearCache(): void {
    this.resultCache.clear();
    console.log('🧠 Chapter absorption cache cleared');
  }

  /**
   * Abort current processing
   */
  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      console.log('🧠 Chapter absorption processing aborted');
    }
  }

  /**
   * Update processing configuration
   */
  public updateConfig(newConfig: Partial<ChapterAbsorptionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🧠 Chapter absorption config updated:', this.config);
  }

  /**
   * Get processing statistics
   */
  public getProcessingStats(): {
    totalProcessed: number;
    cacheHitRate: number;
    avgProcessingTime: number;
    successRate: number;
  } {
    const results = Array.from(this.resultCache.values());
    const successful = results.filter(r => r.success);
    
    return {
      totalProcessed: results.length,
      cacheHitRate: results.length > 0 ? 1 : 0, // Simple cache hit calculation
      avgProcessingTime: results.length > 0 
        ? results.reduce((sum, r) => sum + r.processingTime, 0) / results.length 
        : 0,
      successRate: results.length > 0 ? successful.length / results.length : 0
    };
  }
}

/**
 * Factory function to create chapter absorption pipeline
 */
export function createChapterAbsorptionPipeline(
  config?: Partial<ChapterAbsorptionConfig>
): ChapterAbsorptionPipeline {
  return new ChapterAbsorptionPipeline(config);
}

/**
 * Utility function to extract chapter text from PDF pages
 * This is a placeholder implementation - should be customized based on PDF structure
 */
export async function extractChapterTextFromPDFPages(
  chapter: SmartTOCEntry,
  getPageText: (pageNum: number) => Promise<string>
): Promise<string> {
  console.log('🧠 Extracting chapter text:', chapter.title, 'starting at page', chapter.pageNumber);
  
  try {
    let chapterText = '';
    let currentPage = chapter.pageNumber;
    let pageCount = 0;
    const maxPages = 20; // Limit to prevent runaway extraction
    
    // Extract text from consecutive pages until we hit another chapter or max pages
    while (pageCount < maxPages) {
      try {
        const pageText = await getPageText(currentPage);
        
        if (!pageText || pageText.trim().length === 0) {
          break; // No more content
        }
        
        chapterText += pageText + '\n\n';
        pageCount++;
        currentPage++;
        
        // Simple heuristic: stop if we hit what looks like a new chapter
        if (pageCount > 1 && /^(Chapter|CHAPTER|Section|SECTION)\s+\d+/m.test(pageText)) {
          break;
        }
        
      } catch (error) {
        console.warn(`Failed to get text for page ${currentPage}:`, error);
        break;
      }
    }
    
    console.log('🧠 Extracted chapter text:', chapterText.length, 'characters from', pageCount, 'pages');
    return chapterText.trim();
    
  } catch (error) {
    console.error('🧠 Chapter text extraction failed:', error);
    throw new Error(`Failed to extract chapter text: ${error}`);
  }
}

/**
 * Default export
 */
export default ChapterAbsorptionPipeline;
