import { enhancedSemanticAnalyzer, SemanticVector, CoherenceGraph } from './enhancedSemanticAnalysis';
import { supportClassificationEngine, SupportType } from './supportClassification';
import { hierarchicalArchitectureEngine, DocumentOutline } from './hierarchicalArchitecture';

// Core interfaces for contextual main idea extraction
export interface ContextualWindow {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  sentences: string[];
  coherenceScore: number;
  mainIdeaCandidate?: MainIdeaCandidate;
  contextualRelevance: number;
}

export interface MainIdeaCandidate {
  text: string;
  confidence: number;
  contextualSupport: ContextualSupport[];
  semanticCentrality: number;
  structuralImportance: number;
  refinementLevel: number;
  position: {
    sentenceIndex: number;
    windowId: string;
  };
}

export interface ContextualSupport {
  supportText: string;
  supportType: SupportType;
  relevanceScore: number;
  semanticDistance: number;
  contextualWeight: number;
}

export interface ParagraphCoherence {
  paragraphId: string;
  text: string;
  coherenceScore: number;
  mainIdeaStrength: number;
  supportingElements: string[];
  contextualConnections: ContextualConnection[];
  refinementHistory: RefinementStep[];
}

export interface ContextualConnection {
  targetParagraphId: string;
  connectionType: 'elaboration' | 'contrast' | 'causation' | 'exemplification' | 'summary';
  strength: number;
  semanticBridge: string[];
}

export interface RefinementStep {
  stepNumber: number;
  previousMainIdea: string;
  refinedMainIdea: string;
  refinementReason: string;
  confidenceImprovement: number;
  contextualEvidence: string[];
}

export interface SectionMainIdea {
  sectionId: string;
  primaryMainIdea: string;
  secondaryMainIdeas: string[];
  hierarchicalLevel: number;
  contextualScope: 'local' | 'section' | 'document';
  supportingParagraphs: string[];
  confidence: number;
}

export interface ProgressiveRefinementResult {
  initialMainIdea: string;
  refinedMainIdea: string;
  refinementSteps: RefinementStep[];
  finalConfidence: number;
  contextualEvidence: ContextualSupport[];
  hierarchicalPosition: {
    level: number;
    parentIdea?: string;
    childIdeas: string[];
  };
}

// Main contextual extraction engine
export class ContextualMainIdeaExtractionEngine {
  private windowSize = 5; // Number of sentences per sliding window
  private overlapSize = 2; // Overlap between windows
  private coherenceThreshold = 0.6;
  private refinementIterations = 3;

  // Main extraction method with sliding window analysis
  async extractContextualMainIdeas(text: string): Promise<ProgressiveRefinementResult[]> {
    // Step 1: Create sliding windows
    const windows = this.createSlidingWindows(text);
    
    // Step 2: Analyze each window for coherence and main idea candidates
    const analyzedWindows = await this.analyzeWindows(windows);
    
    // Step 3: Calculate paragraph-level coherence
    const paragraphCoherence = await this.calculateParagraphCoherence(text, analyzedWindows);
    
    // Step 4: Extract section-level main ideas
    const sectionMainIdeas = await this.extractSectionMainIdeas(text, paragraphCoherence);
    
    // Step 5: Progressive refinement
    const refinedResults = await this.performProgressiveRefinement(sectionMainIdeas, paragraphCoherence);
    
    return refinedResults;
  }

  // Create sliding windows with overlap
  private createSlidingWindows(text: string): ContextualWindow[] {
    const sentences = this.splitIntoSentences(text);
    const windows: ContextualWindow[] = [];
    
    for (let i = 0; i < sentences.length; i += (this.windowSize - this.overlapSize)) {
      const endIndex = Math.min(i + this.windowSize, sentences.length);
      const windowSentences = sentences.slice(i, endIndex);
      
      if (windowSentences.length >= 2) { // Minimum window size
        const window: ContextualWindow = {
          id: `window_${windows.length}`,
          text: windowSentences.join(' '),
          startIndex: i,
          endIndex: endIndex - 1,
          sentences: windowSentences,
          coherenceScore: 0,
          contextualRelevance: 0
        };
        
        windows.push(window);
      }
    }
    
    return windows;
  }

  // Analyze windows for coherence and main idea candidates
  private async analyzeWindows(windows: ContextualWindow[]): Promise<ContextualWindow[]> {
    const analyzedWindows: ContextualWindow[] = [];
    
    for (const window of windows) {
      // Calculate coherence score for the window
      const coherenceScore = await this.calculateWindowCoherence(window);
      
      // Find main idea candidate within the window
      const mainIdeaCandidate = await this.findMainIdeaCandidate(window);
      
      // Calculate contextual relevance
      const contextualRelevance = await this.calculateContextualRelevance(window, windows);
      
      analyzedWindows.push({
        ...window,
        coherenceScore,
        mainIdeaCandidate,
        contextualRelevance
      });
    }
    
    return analyzedWindows;
  }

  // Calculate coherence within a window
  private async calculateWindowCoherence(window: ContextualWindow): Promise<number> {
    if (window.sentences.length <= 1) return 1.0;
    
    let totalCoherence = 0;
    let pairCount = 0;
    
    // Calculate pairwise semantic similarity between sentences
    for (let i = 0; i < window.sentences.length; i++) {
      for (let j = i + 1; j < window.sentences.length; j++) {
        const vec1 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(window.sentences[i]);
        const vec2 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(window.sentences[j]);
        const similarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(vec1, vec2);
        
        totalCoherence += similarity;
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalCoherence / pairCount : 0;
  }

  // Find the best main idea candidate within a window
  private async findMainIdeaCandidate(window: ContextualWindow): Promise<MainIdeaCandidate | undefined> {
    const candidates: MainIdeaCandidate[] = [];
    
    for (let i = 0; i < window.sentences.length; i++) {
      const sentence = window.sentences[i];
      
      // Analyze semantic properties
      const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(sentence);
      
      // Calculate structural importance
      const structuralImportance = this.calculateStructuralImportance(sentence, i, window);
      
      // Calculate semantic centrality within the window
      const semanticCentrality = await this.calculateSemanticCentrality(sentence, window);
      
      // Find contextual support
      const contextualSupport = await this.findContextualSupport(sentence, window);
      
      // Calculate overall confidence
      const confidence = this.calculateCandidateConfidence(
        semantics,
        structuralImportance,
        semanticCentrality,
        contextualSupport
      );
      
      if (confidence > 0.5) { // Threshold for viable candidates
        candidates.push({
          text: sentence,
          confidence,
          contextualSupport,
          semanticCentrality,
          structuralImportance,
          refinementLevel: 0,
          position: {
            sentenceIndex: window.startIndex + i,
            windowId: window.id
          }
        });
      }
    }
    
    // Return the best candidate
    return candidates.sort((a, b) => b.confidence - a.confidence)[0];
  }

  // Calculate contextual relevance of a window
  private async calculateContextualRelevance(
    window: ContextualWindow, 
    allWindows: ContextualWindow[]
  ): Promise<number> {
    if (allWindows.length <= 1) return 1.0;
    
    let totalRelevance = 0;
    let comparisonCount = 0;
    
    // Compare with adjacent windows
    const windowIndex = allWindows.findIndex(w => w.id === window.id);
    const adjacentWindows = allWindows.filter((_, index) => 
      Math.abs(index - windowIndex) <= 2 && index !== windowIndex
    );
    
    for (const adjacentWindow of adjacentWindows) {
      const windowVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(window.text);
      const adjacentVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(adjacentWindow.text);
      const similarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(windowVec, adjacentVec);
      
      totalRelevance += similarity;
      comparisonCount++;
    }
    
    return comparisonCount > 0 ? totalRelevance / comparisonCount : 0.5;
  }

  // Calculate paragraph-level coherence
  private async calculateParagraphCoherence(
    text: string, 
    windows: ContextualWindow[]
  ): Promise<ParagraphCoherence[]> {
    const paragraphs = this.groupIntoParagraphs(text);
    const paragraphCoherence: ParagraphCoherence[] = [];
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const paragraphId = `paragraph_${i}`;
      
      // Find overlapping windows
      const overlappingWindows = this.findOverlappingWindows(paragraph, windows);
      
      // Calculate coherence score
      const coherenceScore = await this.calculateParagraphCoherenceScore(paragraph, overlappingWindows);
      
      // Calculate main idea strength
      const mainIdeaStrength = this.calculateMainIdeaStrength(paragraph, overlappingWindows);
      
      // Find supporting elements
      const supportingElements = await this.findSupportingElements(paragraph);
      
      // Find contextual connections
      const contextualConnections = await this.findContextualConnections(
        paragraphId, 
        paragraph, 
        paragraphs
      );
      
      paragraphCoherence.push({
        paragraphId,
        text: paragraph,
        coherenceScore,
        mainIdeaStrength,
        supportingElements,
        contextualConnections,
        refinementHistory: []
      });
    }
    
    return paragraphCoherence;
  }

  // Extract section-level main ideas
  private async extractSectionMainIdeas(
    text: string, 
    paragraphCoherence: ParagraphCoherence[]
  ): Promise<SectionMainIdea[]> {
    // Use hierarchical architecture to get document outline
    const outline = await hierarchicalArchitectureEngine.generateDocumentOutline(text);
    const sectionMainIdeas: SectionMainIdea[] = [];
    
    for (const section of outline.sections) {
      // Find paragraphs that belong to this section
      const sectionParagraphs = paragraphCoherence.filter(p => 
        this.paragraphBelongsToSection(p, section, outline)
      );
      
      // Extract primary main idea from section
      const primaryMainIdea = this.extractPrimaryMainIdea(section, sectionParagraphs);
      
      // Extract secondary main ideas
      const secondaryMainIdeas = this.extractSecondaryMainIdeas(sectionParagraphs);
      
      // Calculate confidence
      const confidence = this.calculateSectionConfidence(sectionParagraphs);
      
      sectionMainIdeas.push({
        sectionId: section.id,
        primaryMainIdea,
        secondaryMainIdeas,
        hierarchicalLevel: section.level,
        contextualScope: this.determineContextualScope(section, outline),
        supportingParagraphs: sectionParagraphs.map(p => p.paragraphId),
        confidence
      });
    }
    
    return sectionMainIdeas;
  }

  // Perform progressive refinement
  private async performProgressiveRefinement(
    sectionMainIdeas: SectionMainIdea[],
    paragraphCoherence: ParagraphCoherence[]
  ): Promise<ProgressiveRefinementResult[]> {
    const results: ProgressiveRefinementResult[] = [];
    
    for (const sectionIdea of sectionMainIdeas) {
      let currentMainIdea = sectionIdea.primaryMainIdea;
      const refinementSteps: RefinementStep[] = [];
      let currentConfidence = sectionIdea.confidence;
      
      // Perform iterative refinement
      for (let iteration = 0; iteration < this.refinementIterations; iteration++) {
        const refinementResult = await this.refineMainIdea(
          currentMainIdea,
          sectionIdea,
          paragraphCoherence,
          iteration
        );
        
        if (refinementResult.confidenceImprovement > 0.05) { // Significant improvement
          refinementSteps.push({
            stepNumber: iteration + 1,
            previousMainIdea: currentMainIdea,
            refinedMainIdea: refinementResult.refinedIdea,
            refinementReason: refinementResult.reason,
            confidenceImprovement: refinementResult.confidenceImprovement,
            contextualEvidence: refinementResult.evidence
          });
          
          currentMainIdea = refinementResult.refinedIdea;
          currentConfidence += refinementResult.confidenceImprovement;
        } else {
          break; // No significant improvement, stop refining
        }
      }
      
      // Build contextual evidence
      const contextualEvidence = await this.buildContextualEvidence(
        currentMainIdea,
        sectionIdea,
        paragraphCoherence
      );
      
      // Determine hierarchical position
      const hierarchicalPosition = this.determineHierarchicalPosition(
        sectionIdea,
        sectionMainIdeas
      );
      
      results.push({
        initialMainIdea: sectionIdea.primaryMainIdea,
        refinedMainIdea: currentMainIdea,
        refinementSteps,
        finalConfidence: Math.min(currentConfidence, 1.0),
        contextualEvidence,
        hierarchicalPosition
      });
    }
    
    return results;
  }

  // Helper methods
  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  private groupIntoParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 20);
  }

  private calculateStructuralImportance(
    sentence: string, 
    index: number, 
    window: ContextualWindow
  ): number {
    let importance = 0.5;
    
    // Position within window
    if (index === 0) importance += 0.2; // First sentence
    if (index === window.sentences.length - 1) importance += 0.1; // Last sentence
    
    // Linguistic markers
    const lowerSentence = sentence.toLowerCase();
    const importanceMarkers = ['main', 'key', 'important', 'primary', 'central'];
    const markerCount = importanceMarkers.filter(marker => lowerSentence.includes(marker)).length;
    importance += markerCount * 0.1;
    
    // Length (optimal range)
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 25) importance += 0.1;
    
    return Math.min(importance, 1.0);
  }

  private async calculateSemanticCentrality(
    sentence: string, 
    window: ContextualWindow
  ): Promise<number> {
    const sentenceVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(sentence);
    let totalSimilarity = 0;
    let comparisonCount = 0;
    
    for (const otherSentence of window.sentences) {
      if (otherSentence !== sentence) {
        const otherVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(otherSentence);
        const similarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(sentenceVec, otherVec);
        totalSimilarity += similarity;
        comparisonCount++;
      }
    }
    
    return comparisonCount > 0 ? totalSimilarity / comparisonCount : 0;
  }

  private async findContextualSupport(
    sentence: string, 
    window: ContextualWindow
  ): Promise<ContextualSupport[]> {
    const support: ContextualSupport[] = [];
    const sentenceVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(sentence);
    
    for (const otherSentence of window.sentences) {
      if (otherSentence !== sentence) {
        const supportInfo = await supportClassificationEngine.analyzeSupportingInformation([otherSentence], sentence);
        
        if (supportInfo.classifications.length > 0) {
          const otherVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(otherSentence);
          const semanticDistance = 1 - enhancedSemanticAnalyzer.calculateSemanticSimilarity(sentenceVec, otherVec);
          
          if (semanticDistance < 0.7) { // Related to main sentence
            const classification = supportInfo.classifications[0];
            support.push({
              supportText: otherSentence,
              supportType: classification.type,
              relevanceScore: classification.relevanceScore,
              semanticDistance,
              contextualWeight: 1 - semanticDistance
            });
          }
        }
      }
    }
    
    return support.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private calculateCandidateConfidence(
    semantics: SemanticVector,
    structuralImportance: number,
    semanticCentrality: number,
    contextualSupport: ContextualSupport[]
  ): number {
    const semanticScore = semantics.conceptualDensity;
    const supportScore = contextualSupport.length > 0 ? 
      contextualSupport.reduce((sum, s) => sum + s.relevanceScore, 0) / contextualSupport.length : 0;
    
    return (semanticScore * 0.3) + 
           (structuralImportance * 0.25) + 
           (semanticCentrality * 0.25) + 
           (supportScore * 0.2);
  }

  private findOverlappingWindows(
    paragraph: string, 
    windows: ContextualWindow[]
  ): ContextualWindow[] {
    return windows.filter(window => 
      window.text.includes(paragraph.substring(0, 50)) ||
      paragraph.includes(window.text.substring(0, 50))
    );
  }

  private async calculateParagraphCoherenceScore(
    paragraph: string, 
    overlappingWindows: ContextualWindow[]
  ): Promise<number> {
    if (overlappingWindows.length === 0) return 0.5;
    
    const avgWindowCoherence = overlappingWindows.reduce((sum, w) => sum + w.coherenceScore, 0) / overlappingWindows.length;
    return avgWindowCoherence;
  }

  private calculateMainIdeaStrength(
    paragraph: string, 
    overlappingWindows: ContextualWindow[]
  ): number {
    const windowsWithMainIdeas = overlappingWindows.filter(w => w.mainIdeaCandidate);
    if (windowsWithMainIdeas.length === 0) return 0.3;
    
    const avgConfidence = windowsWithMainIdeas.reduce((sum, w) => 
      sum + (w.mainIdeaCandidate?.confidence || 0), 0
    ) / windowsWithMainIdeas.length;
    
    return avgConfidence;
  }

  private async findSupportingElements(paragraph: string): Promise<string[]> {
    const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const supportingElements: string[] = [];
    
    for (const sentence of sentences) {
      const supportInfo = await supportClassificationEngine.analyzeSupportingInformation([sentence], paragraph);
      if (supportInfo.classifications.length > 0) {
        supportingElements.push(sentence.trim());
      }
    }
    
    return supportingElements;
  }

  private async findContextualConnections(
    paragraphId: string,
    paragraph: string,
    allParagraphs: string[]
  ): Promise<ContextualConnection[]> {
    const connections: ContextualConnection[] = [];
    const paragraphVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(paragraph);
    
    for (let i = 0; i < allParagraphs.length; i++) {
      const otherParagraph = allParagraphs[i];
      const otherParagraphId = `paragraph_${i}`;
      
      if (otherParagraphId !== paragraphId) {
        const otherVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(otherParagraph);
        const similarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(paragraphVec, otherVec);
        
        if (similarity > 0.4) { // Threshold for meaningful connection
          const connectionType = this.determineConnectionType(paragraph, otherParagraph);
          const semanticBridge = this.findSemanticBridge(paragraph, otherParagraph);
          
          connections.push({
            targetParagraphId: otherParagraphId,
            connectionType,
            strength: similarity,
            semanticBridge
          });
        }
      }
    }
    
    return connections.sort((a, b) => b.strength - a.strength).slice(0, 3);
  }

  private paragraphBelongsToSection(
    paragraph: ParagraphCoherence,
    section: any,
    outline: DocumentOutline
  ): boolean {
    // Simple heuristic - could be enhanced
    return section.mainIdeas.some((idea: string) => 
      paragraph.text.includes(idea.substring(0, 30))
    );
  }

  private extractPrimaryMainIdea(section: any, paragraphs: ParagraphCoherence[]): string {
    if (section.mainIdeas.length > 0) return section.mainIdeas[0];
    
    // Fallback: find paragraph with highest main idea strength
    const bestParagraph = paragraphs.reduce((best, current) => 
      current.mainIdeaStrength > best.mainIdeaStrength ? current : best
    );
    
    return bestParagraph?.text.split('.')[0] + '.' || 'Main idea not clearly identified';
  }

  private extractSecondaryMainIdeas(paragraphs: ParagraphCoherence[]): string[] {
    return paragraphs
      .filter(p => p.mainIdeaStrength > 0.6)
      .map(p => p.text.split('.')[0] + '.')
      .slice(0, 3);
  }

  private calculateSectionConfidence(paragraphs: ParagraphCoherence[]): number {
    if (paragraphs.length === 0) return 0.3;
    
    const avgCoherence = paragraphs.reduce((sum, p) => sum + p.coherenceScore, 0) / paragraphs.length;
    const avgMainIdeaStrength = paragraphs.reduce((sum, p) => sum + p.mainIdeaStrength, 0) / paragraphs.length;
    
    return (avgCoherence * 0.6) + (avgMainIdeaStrength * 0.4);
  }

  private determineContextualScope(section: any, outline: DocumentOutline): 'local' | 'section' | 'document' {
    if (section.level === 1) return 'document';
    if (section.children.length > 0) return 'section';
    return 'local';
  }

  private async refineMainIdea(
    currentMainIdea: string,
    sectionIdea: SectionMainIdea,
    paragraphCoherence: ParagraphCoherence[],
    iteration: number
  ): Promise<{
    refinedIdea: string;
    reason: string;
    confidenceImprovement: number;
    evidence: string[];
  }> {
    // Simple refinement logic - could be enhanced with ML
    const relevantParagraphs = paragraphCoherence.filter(p => 
      sectionIdea.supportingParagraphs.includes(p.paragraphId)
    );
    
    // Look for more specific or general concepts
    const keyTerms = this.extractKeyTerms(currentMainIdea);
    const contextualTerms = this.extractContextualTerms(relevantParagraphs);
    
    // Simple refinement: add contextual terms if they improve specificity
    const refinedTerms = [...keyTerms, ...contextualTerms.slice(0, 2)];
    const refinedIdea = this.constructRefinedIdea(currentMainIdea, refinedTerms);
    
    const confidenceImprovement = refinedIdea !== currentMainIdea ? 0.1 : 0;
    
    return {
      refinedIdea: refinedIdea !== currentMainIdea ? refinedIdea : currentMainIdea,
      reason: refinedIdea !== currentMainIdea ? 'Added contextual specificity' : 'No improvement found',
      confidenceImprovement,
      evidence: contextualTerms
    };
  }

  private async buildContextualEvidence(
    mainIdea: string,
    sectionIdea: SectionMainIdea,
    paragraphCoherence: ParagraphCoherence[]
  ): Promise<ContextualSupport[]> {
    const evidence: ContextualSupport[] = [];
    const mainIdeaVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(mainIdea);
    
    const relevantParagraphs = paragraphCoherence.filter(p => 
      sectionIdea.supportingParagraphs.includes(p.paragraphId)
    );
    
    for (const paragraph of relevantParagraphs) {
      for (const supportElement of paragraph.supportingElements) {
        const supportInfo = await supportClassificationEngine.analyzeSupportingInformation([supportElement], mainIdea);
        const supportVec = enhancedSemanticAnalyzer.analyzeSentenceSemantics(supportElement);
        const semanticDistance = 1 - enhancedSemanticAnalyzer.calculateSemanticSimilarity(mainIdeaVec, supportVec);
        
        if (semanticDistance < 0.8) {
          const classification = supportInfo.classifications[0];
          evidence.push({
            supportText: supportElement,
            supportType: classification?.type || SupportType.EXPLANATION,
            relevanceScore: classification?.relevanceScore || 0.5,
            semanticDistance,
            contextualWeight: 1 - semanticDistance
          });
        }
      }
    }
    
    return evidence.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
  }

  private determineHierarchicalPosition(
    sectionIdea: SectionMainIdea,
    allSectionIdeas: SectionMainIdea[]
  ): { level: number; parentIdea?: string; childIdeas: string[] } {
    const childIdeas = allSectionIdeas
      .filter(idea => idea.hierarchicalLevel > sectionIdea.hierarchicalLevel)
      .map(idea => idea.primaryMainIdea);
    
    const parentIdea = allSectionIdeas
      .find(idea => idea.hierarchicalLevel < sectionIdea.hierarchicalLevel)
      ?.primaryMainIdea;
    
    return {
      level: sectionIdea.hierarchicalLevel,
      parentIdea,
      childIdeas
    };
  }

  private determineConnectionType(
    paragraph1: string, 
    paragraph2: string
  ): ContextualConnection['connectionType'] {
    const p1Lower = paragraph1.toLowerCase();
    const p2Lower = paragraph2.toLowerCase();
    
    if (p2Lower.includes('however') || p2Lower.includes('but') || p2Lower.includes('contrast')) {
      return 'contrast';
    }
    if (p2Lower.includes('therefore') || p2Lower.includes('thus') || p2Lower.includes('because')) {
      return 'causation';
    }
    if (p2Lower.includes('for example') || p2Lower.includes('such as')) {
      return 'exemplification';
    }
    if (p2Lower.includes('in summary') || p2Lower.includes('to conclude')) {
      return 'summary';
    }
    
    return 'elaboration';
  }

  private findSemanticBridge(paragraph1: string, paragraph2: string): string[] {
    const words1 = new Set(paragraph1.toLowerCase().split(/\s+/));
    const words2 = new Set(paragraph2.toLowerCase().split(/\s+/));
    
    const commonWords = [...words1].filter(word => 
      words2.has(word) && word.length > 4
    );
    
    return commonWords.slice(0, 3);
  }

  private extractKeyTerms(text: string): string[] {
    const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(text);
    return semantics.keyTerms.slice(0, 3).map(t => t.term);
  }

  private extractContextualTerms(paragraphs: ParagraphCoherence[]): string[] {
    const allText = paragraphs.map(p => p.text).join(' ');
    const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(allText);
    return semantics.keyTerms.slice(0, 5).map(t => t.term);
  }

  private constructRefinedIdea(originalIdea: string, terms: string[]): string {
    // Simple refinement - could be enhanced
    const newTerms = terms.filter(term => !originalIdea.toLowerCase().includes(term.toLowerCase()));
    if (newTerms.length > 0) {
      return `${originalIdea} (specifically regarding ${newTerms.slice(0, 2).join(' and ')})`;
    }
    return originalIdea;
  }
}

// Export singleton instance
export const contextualMainIdeaExtractionEngine = new ContextualMainIdeaExtractionEngine();
