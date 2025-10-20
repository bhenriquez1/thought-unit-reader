/**
 * Universal PDRM Generator 2.1
 * Generates comprehensive 8-section PDRM layouts for any PDF content across all subjects
 * Integrates Butler insights directly within sections for persistent understanding
 */

import { enhancedHybridAnalysisEngine, type ComprehensiveAnalysisResult } from './enhancedHybridAnalysis';
import { surgeonPdrmEngine, type SurgeonUnit, type ButlerAction } from './surgeonPdrmEngine';
import { butlerSpeechEngine, type ButlerHighlight } from './butlerSpeechEngine';
import { generateMnemonic } from './mnemonicAI';
import summarizeText from './aiSummary';

// Supporting Types
export interface ConceptCandidate {
  id: string;
  title: string;
  content: string;
  subject: string;
  confidence: number;
  keyTerms: string[];
  startIndex: number;
  endIndex: number;
}

// Core Universal PDRM Types
export interface RichTextContent {
  text: string;
  butlerInsights: ButlerInsight[];
  confidence: number;
  metadata: {
    subject: string;
    complexity: 'basic' | 'intermediate' | 'advanced';
    wordCount: number;
    keyTerms: string[];
  };
}

export interface ButlerInsight {
  id: string;
  type: 'metaphor' | 'explanation' | 'warning' | 'connection' | 'memory_aid';
  content: string;
  confidence: number;
  persistent: boolean; // Should this insight persist across page changes?
  relatedConcepts: string[];
  visualCue?: string; // Optional emoji or icon
}

export interface UniversalPDRMSection {
  pattern: RichTextContent;           // What is happening or being described?
  decisionRule: RichTextContent;      // When/how to apply this knowledge?
  mechanism: RichTextContent;         // Why does it work this way?
  application: RichTextContent;       // How does this answer questions/solve problems?
  wrongAnswerMap: RichTextContent;    // Common mistakes and misconceptions
  visualAnchor: RichTextContent;      // Mnemonic devices and visual metaphors
  crossLinks: RichTextContent;        // Related concepts and systems
  reflection: RichTextContent;        // Self-assessment and understanding checks
}

export interface UniversalPDRMDocument {
  id: string;
  title: string;
  subject: string;
  totalSections: number;
  sections: Map<string, UniversalPDRMSection>; // keyed by concept ID
  butlerStateManager: ButlerStateManager;
  tocIndex: PDRMTOCEntry[];
  metadata: {
    originalFile: string;
    processedAt: Date;
    version: string;
    pageCount: number;
    conceptCount: number;
    avgConfidence: number;
  };
}

export interface PDRMTOCEntry {
  id: string;
  title: string;
  pageNumber: number;
  conceptId: string;
  hasButlerInsights: boolean;
  sections: {
    pattern?: boolean;
    decisionRule?: boolean;
    mechanism?: boolean;
    application?: boolean;
    wrongAnswerMap?: boolean;
    visualAnchor?: boolean;
    crossLinks?: boolean;
    reflection?: boolean;
  };
  level: number;
}

// Universal Knowledge Base - Expanded beyond DAT to all subjects
export class UniversalKnowledgeMapper {
  private static subjectPatterns = new Map<string, RegExp[]>([
    // STEM Fields
    ['Biology', [
      /\b(cell|cellular|organelle|mitochondria|nucleus|dna|rna|protein|enzyme|hormone|receptor|signaling|pathway|evolution|genetics|heredity|mutation|gene|chromosome|meiosis|mitosis|photosynthesis|respiration|metabolism|homeostasis|ecosystem|species|taxonomy|anatomy|physiology)\b/gi,
      /\b(neural|neuron|synapse|brain|nervous system|endocrine|immune|cardiovascular|respiratory|digestive|reproductive|muscular|skeletal)\b/gi
    ]],
    ['Chemistry', [
      /\b(atom|molecule|ion|bond|covalent|ionic|metallic|electron|proton|neutron|orbital|valence|oxidation|reduction|catalyst|reaction|equilibrium|acid|base|ph|buffer|solution|concentration|molarity|stoichiometry|thermodynamics|kinetics)\b/gi,
      /\b(organic|inorganic|polymer|isomer|functional group|alkane|alkene|alkyne|aromatic|benzene|carbonyl|carboxyl|amino|hydroxyl)\b/gi
    ]],
    ['Physics', [
      /\b(force|motion|velocity|acceleration|momentum|energy|kinetic|potential|work|power|wave|frequency|amplitude|electromagnetic|radiation|quantum|relativity|gravity|mass|charge|current|voltage|resistance|magnetic|electric|field)\b/gi,
      /\b(mechanics|thermodynamics|optics|acoustics|nuclear|atomic|particle|photon|electron|proton|neutron|fusion|fission)\b/gi
    ]],
    ['Mathematics', [
      /\b(equation|function|variable|constant|derivative|integral|limit|theorem|proof|matrix|vector|algebra|calculus|geometry|trigonometry|statistics|probability|set|group|field|ring|topology|analysis|number theory)\b/gi,
      /\b(sine|cosine|tangent|logarithm|exponential|polynomial|rational|linear|quadratic|cubic|differential|partial|complex|real|integer|rational|irrational)\b/gi
    ]],
    
    // Business & Economics
    ['Business', [
      /\b(strategy|management|leadership|organization|marketing|finance|accounting|operations|supply chain|logistics|human resources|customer|client|market|competition|revenue|profit|cost|budget|investment|roi|kpi|metrics)\b/gi,
      /\b(stakeholder|shareholder|governance|compliance|risk|audit|brand|product|service|quality|innovation|digital transformation|sustainability)\b/gi
    ]],
    ['Economics', [
      /\b(supply|demand|market|price|cost|benefit|utility|elasticity|gdp|inflation|recession|monetary|fiscal|policy|trade|export|import|currency|exchange rate|interest rate|unemployment|productivity|growth)\b/gi,
      /\b(microeconomics|macroeconomics|keynesian|classical|behavioral|game theory|optimization|externality|public good|market failure)\b/gi
    ]],
    
    // Social Sciences
    ['Psychology', [
      /\b(behavior|cognition|memory|learning|perception|emotion|motivation|personality|development|social|clinical|experimental|cognitive|behavioral|psychotherapy|neuroscience|consciousness|unconscious)\b/gi,
      /\b(conditioning|reinforcement|schema|heuristic|bias|attachment|trauma|anxiety|depression|disorder|therapy|treatment)\b/gi
    ]],
    ['History', [
      /\b(civilization|empire|revolution|war|treaty|constitution|democracy|republic|monarchy|feudalism|colonialism|industrialization|renaissance|enlightenment|reformation|cold war|world war)\b/gi,
      /\b(ancient|medieval|modern|contemporary|political|social|economic|cultural|military|diplomatic|technological)\b/gi
    ]],
    
    // Liberal Arts
    ['Literature', [
      /\b(narrative|plot|character|setting|theme|symbolism|metaphor|imagery|style|genre|poetry|prose|fiction|non-fiction|drama|comedy|tragedy|romance|epic|novel|short story|essay)\b/gi,
      /\b(author|poet|playwright|narrator|protagonist|antagonist|conflict|resolution|climax|exposition|rising action|falling action)\b/gi
    ]],
    ['Philosophy', [
      /\b(ethics|morality|logic|reasoning|argument|premise|conclusion|fallacy|truth|knowledge|belief|reality|existence|consciousness|free will|determinism|utilitarianism|deontology|virtue ethics)\b/gi,
      /\b(metaphysics|epistemology|aesthetics|political philosophy|philosophy of mind|philosophy of science)\b/gi
    ]],
    
    // Applied Fields
    ['Medicine', [
      /\b(diagnosis|treatment|therapy|surgery|medication|drug|pharmaceutical|clinical|patient|symptom|syndrome|disease|disorder|infection|inflammation|immune|antibody|antigen|vaccine|epidemiology)\b/gi,
      /\b(anatomy|physiology|pathology|pharmacology|radiology|cardiology|neurology|oncology|pediatrics|geriatrics|psychiatry)\b/gi
    ]],
    ['Engineering', [
      /\b(design|system|process|optimization|efficiency|performance|safety|reliability|maintenance|quality|testing|manufacturing|construction|material|structure|circuit|algorithm|software|hardware)\b/gi,
      /\b(mechanical|electrical|civil|chemical|computer|aerospace|biomedical|environmental|industrial|nuclear)\b/gi
    ]],
    
    // Generic Academic Terms
    ['General', [
      /\b(concept|theory|principle|method|approach|technique|strategy|analysis|synthesis|evaluation|hypothesis|research|study|experiment|data|result|conclusion|implication|significance|application)\b/gi,
      /\b(definition|explanation|description|classification|comparison|contrast|cause|effect|relationship|correlation|trend|pattern|model|framework|system)\b/gi
    ]]
  ]);

  public static identifySubject(text: string): { subject: string; confidence: number }[] {
    const results: { subject: string; confidence: number }[] = [];
    const lowerText = text.toLowerCase();
    
    for (const [subject, patterns] of this.subjectPatterns.entries()) {
      let matchCount = 0;
      let totalMatches = 0;
      
      for (const pattern of patterns) {
        const matches = text.match(pattern) || [];
        matchCount += matches.length;
        totalMatches += pattern.source.split('|').length; // Count terms in pattern
      }
      
      if (matchCount > 0) {
        const confidence = Math.min(0.95, matchCount / Math.max(1, totalMatches * 0.1));
        results.push({ subject, confidence });
      }
    }
    
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  public static extractKeyTerms(text: string, subject: string): string[] {
    const patterns = this.subjectPatterns.get(subject) || this.subjectPatterns.get('General') || [];
    const allTerms: string[] = [];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      allTerms.push(...matches.map(match => match.toLowerCase()));
    }
    
    // Remove duplicates and sort by frequency
    const termFreq = new Map<string, number>();
    allTerms.forEach(term => {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    });
    
    return Array.from(termFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, _]) => term);
  }
}

// Butler State Manager - Handles persistence across pages
export class ButlerStateManager {
  private currentInsights = new Map<string, ButlerInsight>();
  private pageHistory: string[] = [];
  private conceptConnections = new Map<string, string[]>();

  public addInsight(insight: ButlerInsight): void {
    this.currentInsights.set(insight.id, insight);
  }

  public getRelevantInsights(currentConcept: string, upcomingConcepts: string[] = []): ButlerInsight[] {
    const relevant: ButlerInsight[] = [];
    
    for (const insight of this.currentInsights.values()) {
      // Keep persistent insights
      if (insight.persistent) {
        relevant.push(insight);
        continue;
      }
      
      // Keep insights related to current or upcoming concepts
      const isRelevant = insight.relatedConcepts.some(concept => 
        concept === currentConcept || upcomingConcepts.includes(concept)
      );
      
      if (isRelevant) {
        relevant.push(insight);
      }
    }
    
    return relevant.sort((a, b) => b.confidence - a.confidence);
  }

  public updatePageContext(currentPage: number, concepts: string[]): void {
    this.pageHistory.push(currentPage.toString());
    
    // Update concept connections
    concepts.forEach(concept => {
      const connections = this.conceptConnections.get(concept) || [];
      concepts.forEach(otherConcept => {
        if (concept !== otherConcept && !connections.includes(otherConcept)) {
          connections.push(otherConcept);
        }
      });
      this.conceptConnections.set(concept, connections.slice(-5)); // Keep last 5 connections
    });
    
    // Clean up old insights that are no longer relevant
    this.cleanupObsoleteInsights(concepts);
  }

  private cleanupObsoleteInsights(currentConcepts: string[]): void {
    for (const [id, insight] of this.currentInsights.entries()) {
      if (!insight.persistent) {
        const isStillRelevant = insight.relatedConcepts.some(concept => 
          currentConcepts.includes(concept)
        );
        
        if (!isStillRelevant && this.pageHistory.length > 3) {
          this.currentInsights.delete(id);
        }
      }
    }
  }
}

// Main Universal PDRM Generator Class
export class UniversalPDRMGenerator {
  private knowledgeMapper = UniversalKnowledgeMapper;
  private analysisCache = new Map<string, ComprehensiveAnalysisResult>();

  public async generatePDRMDocument(
    text: string, 
    metadata: { 
      filename: string; 
      pageCount: number; 
      chunkIndex?: number;
      progressCallback?: (progress: string) => void;
    }
  ): Promise<UniversalPDRMDocument> {
    const startTime = Date.now();
    const { filename, pageCount, progressCallback } = metadata;
    
    console.log('🔬 Starting Universal PDRM Generation for:', filename);
    progressCallback?.('🔍 Analyzing document structure and content...');
    
    // Step 1: Subject identification and key concept extraction
    const subjectAnalysis = this.knowledgeMapper.identifySubject(text);
    const primarySubject = subjectAnalysis[0]?.subject || 'General';
    const keyTerms = this.knowledgeMapper.extractKeyTerms(text, primarySubject);
    
    progressCallback?.(`📚 Identified as ${primarySubject} content with ${keyTerms.length} key terms...`);
    
    // Step 2: Break text into meaningful concepts
    const concepts = await this.extractConcepts(text, primarySubject, keyTerms);
    progressCallback?.(`🧠 Extracted ${concepts.length} concepts for PDRM analysis...`);
    
    // Step 3: Generate PDRM sections for each concept
    const sections = new Map<string, UniversalPDRMSection>();
    const butlerStateManager = new ButlerStateManager();
    
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];
      progressCallback?.(`⚙️ Generating PDRM section ${i + 1}/${concepts.length}: ${concept.title}...`);
      
      const section = await this.generatePDRMSection(concept, primarySubject, butlerStateManager);
      sections.set(concept.id, section);
      
      // Brief pause to prevent overwhelming the system
      if (i % 5 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    progressCallback?.('🎯 Finalizing PDRM document structure...');
    
    // Step 4: Generate TOC with Butler insight markers
    const tocIndex = this.generatePDRMTOC(concepts, sections);
    
    // Step 5: Calculate overall metadata
    const avgConfidence = Array.from(sections.values())
      .reduce((sum, section) => sum + section.pattern.confidence, 0) / sections.size;
    
    const document: UniversalPDRMDocument = {
      id: `pdrm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: filename.replace(/\.[^/.]+$/, ''), // Remove file extension
      subject: primarySubject,
      totalSections: sections.size,
      sections,
      butlerStateManager,
      tocIndex,
      metadata: {
        originalFile: filename,
        processedAt: new Date(),
        version: '2.1',
        pageCount,
        conceptCount: concepts.length,
        avgConfidence
      }
    };
    
    const duration = Date.now() - startTime;
    console.log(`✅ Universal PDRM Generation complete in ${duration}ms:`, {
      subject: primarySubject,
      sections: sections.size,
      concepts: concepts.length,
      avgConfidence: Math.round(avgConfidence * 100) + '%'
    });
    
    progressCallback?.(`✅ Generated ${sections.size} PDRM sections with embedded Butler insights!`);
    
    return document;
  }

  private async extractConcepts(text: string, subject: string, keyTerms: string[]): Promise<ConceptCandidate[]> {
    // Split text into semantic chunks
    const chunks = this.chunkTextSemantically(text);
    const concepts: ConceptCandidate[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Skip chunks that are too short or don't contain key terms
      if (chunk.length < 100 || !keyTerms.some(term => chunk.toLowerCase().includes(term))) {
        continue;
      }
      
      // Generate concept candidate
      const concept: ConceptCandidate = {
        id: `concept-${i}`,
        title: this.extractConceptTitle(chunk, keyTerms),
        content: chunk,
        subject,
        confidence: this.calculateConceptConfidence(chunk, keyTerms),
        keyTerms: keyTerms.filter(term => chunk.toLowerCase().includes(term)),
        startIndex: text.indexOf(chunk),
        endIndex: text.indexOf(chunk) + chunk.length
      };
      
      if (concept.confidence > 0.3) { // Only include concepts with reasonable confidence
        concepts.push(concept);
      }
    }
    
    return concepts.sort((a, b) => b.confidence - a.confidence);
  }

  private chunkTextSemantically(text: string): string[] {
    // Split by paragraphs first
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    
    // Group related paragraphs
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      // Start new chunk if current one is getting long or if we detect a topic shift
      if (currentChunk.length > 1000 || this.detectTopicShift(currentChunk, paragraph)) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      } else {
        currentChunk += '\n\n' + paragraph;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  private detectTopicShift(currentChunk: string, newParagraph: string): boolean {
    // Simple topic shift detection based on key terms
    const currentTerms = new Set(currentChunk.toLowerCase().match(/\b\w+\b/g) || []);
    const newTerms = new Set(newParagraph.toLowerCase().match(/\b\w+\b/g) || []);
    
    // Calculate overlap
    const overlap = [...currentTerms].filter(term => newTerms.has(term)).length;
    const totalTerms = Math.max(currentTerms.size, newTerms.size);
    
    return totalTerms > 0 && overlap / totalTerms < 0.3; // Less than 30% overlap suggests topic shift
  }

  private extractConceptTitle(chunk: string, keyTerms: string[]): string {
    // Try to find the most important sentence or phrase
    const sentences = chunk.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    
    // Look for sentences containing key terms
    const keyTermSentences = sentences.filter(sentence => 
      keyTerms.some(term => sentence.toLowerCase().includes(term))
    );
    
    if (keyTermSentences.length > 0) {
      // Use the first sentence with key terms, but limit length
      const title = keyTermSentences[0];
      return title.length > 60 ? title.substring(0, 57) + '...' : title;
    }
    
    // Fallback to first sentence
    const fallbackTitle = sentences[0] || 'Untitled Concept';
    return fallbackTitle.length > 60 ? fallbackTitle.substring(0, 57) + '...' : fallbackTitle;
  }

  private calculateConceptConfidence(chunk: string, keyTerms: string[]): number {
    let confidence = 0.3; // Base confidence
    
    // Higher confidence for chunks with multiple key terms
    const termMatches = keyTerms.filter(term => chunk.toLowerCase().includes(term)).length;
    confidence += termMatches * 0.1;
    
    // Higher confidence for structured text
    if (/^(Chapter|Section|Part|\d+\.)/im.test(chunk)) confidence += 0.2;
    
    // Higher confidence for definition-like content
    if (/\b(is defined as|refers to|means|is|are)\b/i.test(chunk)) confidence += 0.15;
    
    // Higher confidence for explanatory content
    if (/\b(because|therefore|thus|due to|as a result)\b/i.test(chunk)) confidence += 0.1;
    
    // Lower confidence for very short or very long chunks
    if (chunk.length < 200) confidence -= 0.2;
    if (chunk.length > 2000) confidence -= 0.1;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private async generatePDRMSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<UniversalPDRMSection> {
    
    // Generate each PDRM component with embedded Butler insights
    const [pattern, decisionRule, mechanism, application, wrongAnswerMap, visualAnchor, crossLinks, reflection] = await Promise.all([
      this.generatePatternSection(concept, subject, butlerManager),
      this.generateDecisionRuleSection(concept, subject, butlerManager),
      this.generateMechanismSection(concept, subject, butlerManager),
      this.generateApplicationSection(concept, subject, butlerManager),
      this.generateWrongAnswerMapSection(concept, subject, butlerManager),
      this.generateVisualAnchorSection(concept, subject, butlerManager),
      this.generateCrossLinksSection(concept, subject, butlerManager),
      this.generateReflectionSection(concept, subject, butlerManager)
    ]);
    
    return {
      pattern,
      decisionRule,
      mechanism,
      application,
      wrongAnswerMap,
      visualAnchor,
      crossLinks,
      reflection
    };
  }

  private async generatePatternSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Extract the main pattern or phenomenon being described
    const mainPattern = await this.extractMainPattern(concept.content, subject);
    
    // Generate Butler insights for this pattern
    const insights = await this.generateButlerInsights(mainPattern, 'pattern', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: mainPattern,
      butlerInsights: insights,
      confidence: concept.confidence,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: mainPattern.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateDecisionRuleSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate decision criteria for when to apply this knowledge
    const decisionRule = await this.generateDecisionCriteria(concept, subject);
    
    const insights = await this.generateButlerInsights(decisionRule, 'decision', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: decisionRule,
      butlerInsights: insights,
      confidence: concept.confidence * 0.9, // Slightly lower confidence for generated content
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: decisionRule.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateMechanismSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Extract or generate explanation of underlying mechanisms
    const mechanism = await this.extractMechanism(concept.content, subject);
    
    const insights = await this.generateButlerInsights(mechanism, 'mechanism', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: mechanism,
      butlerInsights: insights,
      confidence: concept.confidence,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: mechanism.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateApplicationSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate practical applications
    const application = await this.generatePracticalApplications(concept, subject);
    
    const insights = await this.generateButlerInsights(application, 'application', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: application,
      butlerInsights: insights,
      confidence: concept.confidence * 0.8,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: application.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateWrongAnswerMapSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate common misconceptions and wrong answers
    const wrongAnswers = await this.generateCommonMistakes(concept, subject);
    
    const insights = await this.generateButlerInsights(wrongAnswers, 'warning', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: wrongAnswers,
      butlerInsights: insights,
      confidence: concept.confidence * 0.7,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: wrongAnswers.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateVisualAnchorSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate visual metaphors and memory aids
    const visualAid = await this.createVisualMetaphor(concept, subject);
    const mnemonic = await generateMnemonic(concept.content.substring(0, 500));
    
    const combinedVisual = `**Visual Metaphor:** ${visualAid}\n\n**Memory Aid:** ${mnemonic}`;
    
    const insights = await this.generateButlerInsights(combinedVisual, 'memory_aid', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: combinedVisual,
      butlerInsights: insights,
      confidence: concept.confidence * 0.85,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: combinedVisual.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateCrossLinksSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate connections to related concepts
    const crossLinks = await this.generateConceptConnections(concept, subject);
    
    const insights = await this.generateButlerInsights(crossLinks, 'connection', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: crossLinks,
      butlerInsights: insights,
      confidence: concept.confidence * 0.75,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: crossLinks.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  private async generateReflectionSection(
    concept: ConceptCandidate, 
    subject: string, 
    butlerManager: ButlerStateManager
  ): Promise<RichTextContent> {
    // Generate self-assessment questions and reflection prompts
    const reflection = await this.generateSelfAssessment(concept, subject);
    
    const insights = await this.generateButlerInsights(reflection, 'explanation', concept, subject);
    insights.forEach(insight => butlerManager.addInsight(insight));
    
    return {
      text: reflection,
      butlerInsights: insights,
      confidence: concept.confidence * 0.8,
      metadata: {
        subject,
        complexity: this.assessComplexity(concept.content),
        wordCount: reflection.split(/\s+/).length,
        keyTerms: concept.keyTerms
      }
    };
  }

  // Helper Methods for Content Generation
  private async extractMainPattern(content: string, subject: string): Promise<string> {
    // Extract the core pattern or phenomenon
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyTermPattern = /\b(pattern|process|mechanism|system|structure|function|relationship|principle|theory|concept)\b/gi;
    
    // Find sentences that describe patterns
    const patternSentences = sentences.filter(sentence => 
      keyTermPattern.test(sentence) || sentence.length > 50
    );
    
    if (patternSentences.length > 0) {
      return patternSentences.slice(0, 3).join('. ') + '.';
    }
    
    // Fallback to first few sentences
    return sentences.slice(0, 2).join('. ') + '.';
  }

  private async generateDecisionCriteria(concept: ConceptCandidate, subject: string): Promise<string> {
    const keyTerms = concept.keyTerms.join(', ');
    const subjectSpecific = this.getSubjectSpecificPhrases(subject);
    
    return `**When to apply ${concept.title}:**\n\n` +
           `• Look for these key indicators: ${keyTerms}\n` +
           `• ${subjectSpecific.decisionPhrase}\n` +
           `• Apply when you encounter ${concept.keyTerms[0]} in ${subject.toLowerCase()} contexts\n` +
           `• Use this framework when analyzing ${subjectSpecific.contextPhrase}`;
  }

  private async extractMechanism(content: string, subject: string): Promise<string> {
    // Look for explanatory patterns
    const explanatoryPhrases = [
      /because\s+([^.!?]+)/gi,
      /due to\s+([^.!?]+)/gi,
      /as a result of\s+([^.!?]+)/gi,
      /therefore\s+([^.!?]+)/gi,
      /this occurs when\s+([^.!?]+)/gi,
      /the reason is\s+([^.!?]+)/gi
    ];
    
    let mechanisms: string[] = [];
    
    for (const pattern of explanatoryPhrases) {
      const matches = content.match(pattern);
      if (matches) {
        mechanisms.push(...matches.slice(0, 2));
      }
    }
    
    if (mechanisms.length > 0) {
      return `**How it works:**\n\n${mechanisms.join('\n• ')}\n\n**Underlying mechanism:** ${this.generateMechanismExplanation(content, subject)}`;
    }
    
    return `**Mechanism explanation:** ${this.generateMechanismExplanation(content, subject)}`;
  }

  private async generatePracticalApplications(concept: ConceptCandidate, subject: string): Promise<string> {
    const subjectSpecific = this.getSubjectSpecificPhrases(subject);
    
    return `**Practical Applications:**\n\n` +
           `• ${subjectSpecific.applicationExample1}\n` +
           `• Used in ${subject.toLowerCase()} when ${concept.keyTerms[0]} is involved\n` +
           `• Helps solve problems related to ${concept.keyTerms.slice(0, 2).join(' and ')}\n` +
           `• ${subjectSpecific.applicationExample2}\n\n` +
           `**Real-world relevance:** This concept applies to ${subjectSpecific.realWorldContext}`;
  }

  private async generateCommonMistakes(concept: ConceptCandidate, subject: string): Promise<string> {
    return `**Common Mistakes to Avoid:**\n\n` +
           `⚠️ **Don't confuse** ${concept.keyTerms[0]} with similar concepts\n` +
           `⚠️ **Avoid assuming** that correlation implies causation\n` +
           `⚠️ **Remember** to consider context when applying this concept\n` +
           `⚠️ **Don't oversimplify** the relationship between ${concept.keyTerms.slice(0, 2).join(' and ')}\n\n` +
           `**Key distinctions:** Make sure you understand how this differs from related concepts in ${subject.toLowerCase()}`;
  }

  private async createVisualMetaphor(concept: ConceptCandidate, subject: string): Promise<string> {
    const metaphors = this.getSubjectMetaphors(subject);
    const selectedMetaphor = metaphors[Math.floor(Math.random() * metaphors.length)];
    
    return `Think of ${concept.keyTerms[0]} like ${selectedMetaphor}. Just as ${this.expandMetaphor(selectedMetaphor, concept.keyTerms[0])}, ` +
           `${concept.keyTerms[0]} works by ${this.createMetaphorConnection(concept.content, selectedMetaphor)}.`;
  }

  private async generateConceptConnections(concept: ConceptCandidate, subject: string): Promise<string> {
    const relatedTerms = concept.keyTerms.slice(1, 4);
    
    return `**Related Concepts:**\n\n` +
           `🔗 **Directly connected:** ${relatedTerms.join(', ')}\n` +
           `🔗 **Builds on:** Fundamental ${subject.toLowerCase()} principles\n` +
           `🔗 **Leads to:** Advanced topics in ${subject.toLowerCase()}\n` +
           `🔗 **Seen together with:** ${this.getSiblingConcepts(concept, subject).join(', ')}\n\n` +
           `**Integration note:** Understanding this concept is essential for grasping broader ${subject.toLowerCase()} frameworks.`;
  }

  private async generateSelfAssessment(concept: ConceptCandidate, subject: string): Promise<string> {
    return `**Self-Assessment Questions:**\n\n` +
           `🤔 **Level 1 (Recall):** Can you define ${concept.keyTerms[0]} in your own words?\n` +
           `🤔 **Level 2 (Understanding):** Why is this concept important in ${subject.toLowerCase()}?\n` +
           `🤔 **Level 3 (Application):** How would you apply this in a real scenario?\n` +
           `🤔 **Level 4 (Analysis):** How does this relate to other ${subject.toLowerCase()} concepts?\n\n` +
           `**Understanding check:** Rate your confidence (1-5): ⭐⭐⭐⭐⭐\n` +
           `**Next steps:** If confidence < 4, review the mechanism and applications sections.`;
  }

  private async generateButlerInsights(
    content: string, 
    type: string, 
    concept: ConceptCandidate, 
    subject: string
  ): Promise<ButlerInsight[]> {
    const insights: ButlerInsight[] = [];
    
    // Generate context-appropriate Butler insights
    switch (type) {
      case 'pattern':
        insights.push({
          id: `butler-${Date.now()}-pattern`,
          type: 'metaphor',
          content: `Think of this like ${this.getPatternMetaphor(subject)} - it helps you see the bigger picture of how ${concept.keyTerms[0]} works.`,
          confidence: 0.8,
          persistent: false,
          relatedConcepts: concept.keyTerms,
          visualCue: '🎯'
        });
        break;
        
      case 'decision':
        insights.push({
          id: `butler-${Date.now()}-decision`,
          type: 'explanation',
          content: `Like a traffic light system - these decision criteria tell you when to stop, go, or proceed with caution when applying ${concept.keyTerms[0]}.`,
          confidence: 0.75,
          persistent: false,
          relatedConcepts: concept.keyTerms,
          visualCue: '🚦'
        });
        break;
        
      case 'mechanism':
        insights.push({
          id: `butler-${Date.now()}-mechanism`,
          type: 'explanation',
          content: `Think of this as the engine under the hood - you see the results, but this explains what's actually making it work.`,
          confidence: 0.85,
          persistent: true, // Mechanism insights are often persistent
          relatedConcepts: concept.keyTerms,
          visualCue: '⚙️'
        });
        break;
        
      case 'application':
        insights.push({
          id: `butler-${Date.now()}-application`,
          type: 'connection',
          content: `This is where theory meets reality - like having a toolkit, you now know which tool (${concept.keyTerms[0]}) to use for which job.`,
          confidence: 0.7,
          persistent: false,
          relatedConcepts: concept.keyTerms,
          visualCue: '🛠️'
        });
        break;
        
      case 'warning':
        insights.push({
          id: `butler-${Date.now()}-warning`,
          type: 'warning',
          content: `Like guardrails on a mountain road - these warnings keep you from falling into common conceptual pitfalls with ${concept.keyTerms[0]}.`,
          confidence: 0.8,
          persistent: true, // Warnings should persist
          relatedConcepts: concept.keyTerms,
          visualCue: '⚠️'
        });
        break;
        
      case 'memory_aid':
        insights.push({
          id: `butler-${Date.now()}-memory`,
          type: 'memory_aid',
          content: `Memory works best with vivid images and stories - this visual anchor transforms abstract ${concept.keyTerms[0]} into something concrete your brain can grab onto.`,
          confidence: 0.9,
          persistent: true, // Memory aids should persist
          relatedConcepts: concept.keyTerms,
          visualCue: '🧠'
        });
        break;
    }
    
    return insights;
  }

  // Utility Methods
  private assessComplexity(content: string): 'basic' | 'intermediate' | 'advanced' {
    const wordCount = content.split(/\s+/).length;
    const complexityIndicators = /\b(complex|sophisticated|intricate|multifaceted|comprehensive)\b/gi;
    const technicalTerms = /\b([A-Z]{2,}|[a-z]+tion|[a-z]+ism|[a-z]+ology)\b/g;
    
    const complexityMatches = (content.match(complexityIndicators) || []).length;
    const technicalMatches = (content.match(technicalTerms) || []).length;
    
    if (wordCount > 500 || complexityMatches > 3 || technicalMatches > 10) {
      return 'advanced';
    } else if (wordCount > 200 || complexityMatches > 1 || technicalMatches > 5) {
      return 'intermediate';
    } else {
      return 'basic';
    }
  }

  private generatePDRMTOC(concepts: ConceptCandidate[], sections: Map<string, UniversalPDRMSection>): PDRMTOCEntry[] {
    return concepts.map((concept, index) => ({
      id: concept.id,
      title: concept.title,
      pageNumber: Math.floor(concept.startIndex / 2000) + 1, // Rough page estimation
      conceptId: concept.id,
      hasButlerInsights: true, // All sections have Butler insights
      sections: {
        pattern: true,
        decisionRule: true,
        mechanism: true,
        application: true,
        wrongAnswerMap: true,
        visualAnchor: true,
        crossLinks: true,
        reflection: true
      },
      level: 0 // All concepts at top level for now
    }));
  }

  private getSubjectSpecificPhrases(subject: string) {
    const phrases: Record<string, any> = {
      'Biology': {
        decisionPhrase: 'Consider biological systems and cellular processes',
        contextPhrase: 'living organisms and their interactions',
        applicationExample1: 'Understanding cellular metabolism and energy production',
        applicationExample2: 'Analyzing ecosystem relationships and biodiversity',
        realWorldContext: 'medical research, environmental science, and biotechnology'
      },
      'Chemistry': {
        decisionPhrase: 'Examine molecular structure and chemical reactions',
        contextPhrase: 'chemical bonds and molecular interactions',
        applicationExample1: 'Predicting reaction outcomes and product formation',
        applicationExample2: 'Designing new materials with specific properties',
        realWorldContext: 'pharmaceutical development, materials science, and environmental chemistry'
      },
      'Physics': {
        decisionPhrase: 'Analyze forces, energy, and fundamental interactions',
        contextPhrase: 'physical systems and natural phenomena',
        applicationExample1: 'Calculating motion and predicting system behavior',
        applicationExample2: 'Understanding electromagnetic and quantum effects',
        realWorldContext: 'engineering applications, technology development, and scientific research'
      },
      'Mathematics': {
        decisionPhrase: 'Apply mathematical reasoning and logical analysis',
        contextPhrase: 'numerical relationships and abstract structures',
        applicationExample1: 'Solving complex equations and optimization problems',
        applicationExample2: 'Modeling real-world phenomena with mathematical tools',
        realWorldContext: 'data analysis, engineering design, and financial modeling'
      },
      'Business': {
        decisionPhrase: 'Consider market dynamics and organizational strategy',
        contextPhrase: 'business operations and competitive environments',
        applicationExample1: 'Developing strategic plans and operational improvements',
        applicationExample2: 'Analyzing market opportunities and risk assessment',
        realWorldContext: 'corporate strategy, entrepreneurship, and management consulting'
      }
    };
    
    return phrases[subject] || phrases['Biology']; // Default fallback
  }

  private getSubjectMetaphors(subject: string): string[] {
    const metaphors: Record<string, string[]> = {
      'Biology': ['a well-orchestrated symphony', 'a bustling city', 'an intricate machine', 'a complex ecosystem'],
      'Chemistry': ['a dance of particles', 'building blocks and blueprints', 'a molecular kitchen', 'atomic partnerships'],
      'Physics': ['flowing rivers of energy', 'cosmic clockwork', 'invisible forces at play', 'nature\'s fundamental rules'],
      'Mathematics': ['logical building blocks', 'abstract landscapes', 'numerical relationships', 'patterns in chaos'],
      'Business': ['strategic chess moves', 'market ecosystems', 'organizational machinery', 'competitive battlefields']
    };
    
    return metaphors[subject] || metaphors['Biology'];
  }

  private expandMetaphor(metaphor: string, keyTerm: string): string {
    // Simple metaphor expansion logic
    if (metaphor.includes('symphony')) {
      return 'each instrument must play its part in harmony';
    } else if (metaphor.includes('city')) {
      return 'different districts serve specialized functions';
    } else if (metaphor.includes('machine')) {
      return 'each component has a specific role in the overall function';
    }
    return 'each element contributes to the whole system';
  }

  private createMetaphorConnection(content: string, metaphor: string): string {
    // Generate connection between content and metaphor
    if (content.includes('process') || content.includes('reaction')) {
      return 'coordinating multiple steps in sequence';
    } else if (content.includes('structure') || content.includes('organization')) {
      return 'maintaining organized relationships between parts';
    } else if (content.includes('function') || content.includes('role')) {
      return 'serving a specific purpose in the larger system';
    }
    return 'working together to achieve a common goal';
  }

  private getSiblingConcepts(concept: ConceptCandidate, subject: string): string[] {
    // Generate related concepts based on subject
    const siblingMaps: Record<string, string[]> = {
      'Biology': ['cellular respiration', 'protein synthesis', 'gene expression', 'enzyme kinetics'],
      'Chemistry': ['chemical equilibrium', 'molecular bonding', 'reaction kinetics', 'thermodynamics'],
      'Physics': ['energy conservation', 'wave mechanics', 'electromagnetic fields', 'quantum states'],
      'Mathematics': ['differential equations', 'linear algebra', 'statistical analysis', 'optimization theory'],
      'Business': ['strategic planning', 'market analysis', 'financial modeling', 'operational efficiency']
    };
    
    return siblingMaps[subject] || siblingMaps['Biology'];
  }

  private getPatternMetaphor(subject: string): string {
    const patternMetaphors: Record<string, string> = {
      'Biology': 'watching how different animals behave in their natural habitat',
      'Chemistry': 'observing how different ingredients combine in cooking',
      'Physics': 'watching the gears of a complex clockwork mechanism',
      'Mathematics': 'solving a puzzle where each piece fits perfectly',
      'Business': 'watching strategic moves in a chess game'
    };
    
    return patternMetaphors[subject] || patternMetaphors['Biology'];
  }

  private generateMechanismExplanation(content: string, subject: string): string {
    // Generate a mechanism explanation based on the content and subject
    const subjectSpecific = this.getSubjectSpecificPhrases(subject);
    
    // Extract key action words
    const actionWords = content.match(/\b(causes?|leads? to|results? in|produces?|creates?|generates?|enables?|allows?)\b/gi) || [];
    
    if (actionWords.length > 0 && actionWords[0]) {
      return `This works through a series of interconnected steps that ${subjectSpecific.contextPhrase}. ` +
             `The underlying mechanism involves ${actionWords[0].toLowerCase()} specific changes that ` +
             `ultimately result in the observed outcomes in ${subject.toLowerCase()}.`;
    }
    
    return `The mechanism operates through fundamental ${subject.toLowerCase()} principles, ` +
           `where ${subjectSpecific.contextPhrase} interact in predictable ways to produce the expected results.`;
  }
}

// Export the generator instance
export const universalPDRMGenerator = new UniversalPDRMGenerator();
export default universalPDRMGenerator;
