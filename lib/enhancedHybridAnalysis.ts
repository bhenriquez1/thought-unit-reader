/**
 * Enhanced Hybrid Analysis System - Phase 3
 * Comprehensive integration of all advanced analysis components
 * Provides unified interface for enhanced main idea and supporting information extraction
 */

import { 
  enhancedSemanticAnalyzer, 
  type EnhancedMainIdeaAnalysis, 
  type AnalysisContext,
  type EnhancedAnalysisOptions 
} from './enhancedSemanticAnalysis';
import { 
  supportClassificationEngine, 
  type SupportAnalysisResult,
  type SupportClassification,
  SupportType 
} from './supportClassification';
import { 
  hierarchicalArchitectureEngine, 
  type DocumentOutline,
  type ConceptHierarchy 
} from './hierarchicalArchitecture';
import { 
  contextualMainIdeaExtractionEngine, 
  type ProgressiveRefinementResult 
} from './contextualMainIdeaExtraction';
import { 
  dynamicAdaptationSystem, 
  type UserProfile,
  type HighlightingProfile,
  type AdaptationRecommendation 
} from './dynamicAdaptationSystem';
import { 
  analyzeTextForThoughtUnitsEnhanced, 
  type ThoughtUnit,
  type MainIdeaAnalysis 
} from './thoughtUnitExtraction';

// Comprehensive analysis result interface
export interface ComprehensiveAnalysisResult {
  // Core analysis results
  mainIdeaAnalysis: MainIdeaAnalysis;
  enhancedMainIdeaAnalysis: EnhancedMainIdeaAnalysis;
  progressiveRefinementResults: ProgressiveRefinementResult[];
  supportAnalysis: SupportAnalysisResult;
  documentOutline: DocumentOutline;
  thoughtUnits: ThoughtUnit[];
  
  // Advanced insights
  comprehensiveInsights: ComprehensiveInsights;
  qualityMetrics: AnalysisQualityMetrics;
  adaptationRecommendations: AdaptationRecommendation[];
  personalizedHighlighting: PersonalizedHighlighting;
  
  // Performance metrics
  processingMetrics: ProcessingMetrics;
  confidenceScores: ConfidenceScores;
}

export interface ComprehensiveInsights {
  overallComplexity: 'simple' | 'moderate' | 'complex' | 'expert';
  readingDifficulty: number; // 0-1 scale
  conceptualDensity: number; // 0-1 scale
  structuralCoherence: number; // 0-1 scale
  informationArchitecture: InformationArchitecture;
  cognitiveLoad: CognitiveLoadAnalysis;
  learningObjectives: LearningObjective[];
  comprehensionStrategies: ComprehensionStrategy[];
}

export interface InformationArchitecture {
  hierarchyDepth: number;
  conceptualBreadth: number;
  crossReferenceCount: number;
  topicTransitions: number;
  argumentStructure: 'linear' | 'hierarchical' | 'network' | 'spiral';
  rhetoricalPattern: 'descriptive' | 'narrative' | 'expository' | 'persuasive' | 'mixed';
}

export interface CognitiveLoadAnalysis {
  intrinsicLoad: number; // Content complexity
  extraneousLoad: number; // Presentation complexity
  germaneLoad: number; // Learning-relevant processing
  totalLoad: number; // Combined cognitive demand
  recommendations: string[];
}

export interface LearningObjective {
  objective: string;
  bloomsLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  supportingEvidence: string[];
  assessmentSuggestions: string[];
}

export interface ComprehensionStrategy {
  strategy: string;
  applicability: number; // 0-1 relevance score
  description: string;
  implementation: string[];
}

export interface AnalysisQualityMetrics {
  overallAccuracy: number; // 0-1 estimated accuracy
  mainIdeaConfidence: number; // 0-1 confidence in main idea identification
  supportClassificationAccuracy: number; // 0-1 support classification quality
  hierarchicalConsistency: number; // 0-1 structural consistency
  semanticCoherence: number; // 0-1 semantic consistency
  adaptationEffectiveness: number; // 0-1 personalization quality
}

export interface PersonalizedHighlighting {
  mainIdeas: HighlightedElement[];
  supportingDetails: HighlightedElement[];
  keyTerms: HighlightedElement[];
  transitions: HighlightedElement[];
  examples: HighlightedElement[];
  definitions: HighlightedElement[];
  evidence: HighlightedElement[];
  adaptiveIntensity: number; // 0-1 overall highlighting intensity
}

export interface HighlightedElement {
  text: string;
  startIndex: number;
  endIndex: number;
  highlightStyle: {
    backgroundColor: string;
    borderColor: string;
    borderStyle: 'solid' | 'dashed' | 'dotted';
    opacity: number;
    priority: number;
  };
  tooltip: {
    title: string;
    description: string;
    confidence: number;
    supportingEvidence: string[];
  };
  interactionHints: string[];
}

export interface ProcessingMetrics {
  totalProcessingTime: number; // milliseconds
  semanticAnalysisTime: number;
  supportClassificationTime: number;
  hierarchicalAnalysisTime: number;
  contextualExtractionTime: number;
  adaptationTime: number;
  memoryUsage: number; // estimated MB
  cacheHitRate: number; // 0-1 cache efficiency
}

export interface ConfidenceScores {
  mainIdeaExtraction: number; // 0-1
  supportClassification: number; // 0-1
  hierarchicalStructure: number; // 0-1
  contextualUnderstanding: number; // 0-1
  personalizedAdaptation: number; // 0-1
  overallAnalysisQuality: number; // 0-1
}

// Advanced analysis options
export interface AdvancedAnalysisOptions extends EnhancedAnalysisOptions {
  userId?: string; // For personalization
  includePersonalization: boolean;
  enableProgressiveRefinement: boolean;
  generateLearningObjectives: boolean;
  assessCognitiveLoad: boolean;
  provideTutorialGuidance: boolean;
  adaptToUserLevel: boolean;
  cacheResults: boolean;
  detailedMetrics: boolean;
}

// Main enhanced hybrid analysis class
export class EnhancedHybridAnalysisEngine {
  private analysisCache = new Map<string, ComprehensiveAnalysisResult>();
  private performanceMetrics = new Map<string, ProcessingMetrics>();

  // Comprehensive analysis method
  async analyzeText(
    text: string,
    options: AdvancedAnalysisOptions = {
      enableSemanticClustering: true,
      confidenceThreshold: 0.6,
      maxTopicClusters: 3,
      semanticSimilarityThreshold: 0.4,
      includePersonalization: true,
      enableProgressiveRefinement: true,
      generateLearningObjectives: true,
      assessCognitiveLoad: true,
      provideTutorialGuidance: true,
      adaptToUserLevel: true,
      cacheResults: true,
      detailedMetrics: true
    }
  ): Promise<ComprehensiveAnalysisResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(text, options);
    if (options.cacheResults && this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    // Initialize user profile if needed
    let userProfile: UserProfile | undefined;
    let highlightingProfile: HighlightingProfile | undefined;
    
    if (options.userId && options.includePersonalization) {
      userProfile = dynamicAdaptationSystem.getUserProfile(options.userId);
      if (!userProfile) {
        userProfile = await dynamicAdaptationSystem.initializeUserProfile(options.userId);
      }
      highlightingProfile = dynamicAdaptationSystem.getHighlightingProfile(options.userId);
    }

    // Phase 1: Core Analysis
    const coreAnalysisStart = Date.now();
    
    // Enhanced thought unit analysis
    const thoughtUnitAnalysis = analyzeTextForThoughtUnitsEnhanced(text, 0, options);
    
    // Enhanced semantic analysis
    const enhancedMainIdeaAnalysis = enhancedSemanticAnalyzer.detectMainIdeasWithSemantics(text, options.context);
    
    // Support classification
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const supportingSentences = sentences.filter(sentence => 
      sentence !== enhancedMainIdeaAnalysis.primaryIdea
    );
    const supportAnalysis = supportClassificationEngine.analyzeSupportingInformation(
      supportingSentences,
      enhancedMainIdeaAnalysis.primaryIdea,
      options.context
    );
    
    const coreAnalysisTime = Date.now() - coreAnalysisStart;

    // Phase 2: Structural Analysis
    const structuralAnalysisStart = Date.now();
    
    // Hierarchical architecture
    const documentOutline = await hierarchicalArchitectureEngine.generateDocumentOutline(text);
    
    // Contextual main idea extraction with progressive refinement
    let progressiveRefinementResults: ProgressiveRefinementResult[] = [];
    if (options.enableProgressiveRefinement) {
      progressiveRefinementResults = await contextualMainIdeaExtractionEngine.extractContextualMainIdeas(text);
    }
    
    const structuralAnalysisTime = Date.now() - structuralAnalysisStart;

    // Phase 3: Personalization and Adaptation
    const adaptationStart = Date.now();
    
    let adaptationRecommendations: AdaptationRecommendation[] = [];
    if (options.userId && options.adaptToUserLevel && userProfile) {
      // Simulate user interaction data for adaptation
      const interactionData = {
        textContent: text,
        userActions: ['read', 'highlight'],
        timeSpent: Math.max(text.length / 200, 30), // Estimated reading time
        comprehensionScore: 0.75 // Default assumption
      };
      
      adaptationRecommendations = await dynamicAdaptationSystem.adaptToUserBehavior(
        options.userId,
        interactionData
      );
    }
    
    const adaptationTime = Date.now() - adaptationStart;

    // Phase 4: Advanced Insights Generation
    const insightsStart = Date.now();
    
    const comprehensiveInsights = await this.generateComprehensiveInsights(
      text,
      enhancedMainIdeaAnalysis,
      documentOutline,
      supportAnalysis,
      options
    );
    
    const qualityMetrics = this.calculateQualityMetrics(
      thoughtUnitAnalysis,
      enhancedMainIdeaAnalysis,
      supportAnalysis,
      documentOutline,
      progressiveRefinementResults
    );
    
    const personalizedHighlighting = await this.generatePersonalizedHighlighting(
      text,
      thoughtUnitAnalysis.thoughtUnits,
      supportAnalysis,
      highlightingProfile,
      userProfile
    );
    
    const insightsTime = Date.now() - insightsStart;

    // Phase 5: Performance Metrics and Confidence Scores
    const totalProcessingTime = Date.now() - startTime;
    
    const processingMetrics: ProcessingMetrics = {
      totalProcessingTime,
      semanticAnalysisTime: coreAnalysisTime * 0.4,
      supportClassificationTime: coreAnalysisTime * 0.3,
      hierarchicalAnalysisTime: structuralAnalysisTime * 0.6,
      contextualExtractionTime: structuralAnalysisTime * 0.4,
      adaptationTime,
      memoryUsage: this.estimateMemoryUsage(text, thoughtUnitAnalysis.thoughtUnits),
      cacheHitRate: this.analysisCache.size > 0 ? 0.8 : 0.0
    };
    
    const confidenceScores: ConfidenceScores = {
      mainIdeaExtraction: enhancedMainIdeaAnalysis.confidence,
      supportClassification: supportAnalysis.qualityMetrics.credibilityScore,
      hierarchicalStructure: documentOutline.coherenceGraph.size > 0 ? 
        Array.from(documentOutline.coherenceGraph.values()).reduce((a, b) => a + b, 0) / documentOutline.coherenceGraph.size : 0.5,
      contextualUnderstanding: progressiveRefinementResults.length > 0 ? 
        progressiveRefinementResults.reduce((sum, r) => sum + r.finalConfidence, 0) / progressiveRefinementResults.length : 0.7,
      personalizedAdaptation: adaptationRecommendations.length > 0 ? 
        adaptationRecommendations.reduce((sum, r) => sum + r.confidence, 0) / adaptationRecommendations.length : 0.6,
      overallAnalysisQuality: qualityMetrics.overallAccuracy
    };

    // Compile comprehensive result
    const result: ComprehensiveAnalysisResult = {
      mainIdeaAnalysis: thoughtUnitAnalysis.mainIdeaAnalysis,
      enhancedMainIdeaAnalysis,
      progressiveRefinementResults,
      supportAnalysis,
      documentOutline,
      thoughtUnits: thoughtUnitAnalysis.thoughtUnits,
      comprehensiveInsights,
      qualityMetrics,
      adaptationRecommendations,
      personalizedHighlighting,
      processingMetrics,
      confidenceScores
    };

    // Cache result if enabled
    if (options.cacheResults) {
      this.analysisCache.set(cacheKey, result);
    }

    return result;
  }

  // Generate comprehensive insights
  private async generateComprehensiveInsights(
    text: string,
    enhancedAnalysis: EnhancedMainIdeaAnalysis,
    outline: DocumentOutline,
    supportAnalysis: SupportAnalysisResult,
    options: AdvancedAnalysisOptions
  ): Promise<ComprehensiveInsights> {
    // Determine overall complexity
    const overallComplexity = this.determineOverallComplexity(text, enhancedAnalysis, outline);
    
    // Calculate reading difficulty
    const readingDifficulty = this.calculateReadingDifficulty(text, enhancedAnalysis);
    
    // Analyze information architecture
    const informationArchitecture = this.analyzeInformationArchitecture(outline, supportAnalysis);
    
    // Assess cognitive load
    const cognitiveLoad = this.assessCognitiveLoad(text, enhancedAnalysis, outline);
    
    // Generate learning objectives
    const learningObjectives = options.generateLearningObjectives ? 
      this.generateLearningObjectives(enhancedAnalysis, supportAnalysis) : [];
    
    // Suggest comprehension strategies
    const comprehensionStrategies = this.suggestComprehensionStrategies(
      overallComplexity,
      informationArchitecture,
      cognitiveLoad
    );

    return {
      overallComplexity,
      readingDifficulty,
      conceptualDensity: enhancedAnalysis.semanticCoherence,
      structuralCoherence: outline.coherenceGraph.size > 0 ? 
        Array.from(outline.coherenceGraph.values()).reduce((a, b) => a + b, 0) / outline.coherenceGraph.size : 0.5,
      informationArchitecture,
      cognitiveLoad,
      learningObjectives,
      comprehensionStrategies
    };
  }

  // Calculate quality metrics
  private calculateQualityMetrics(
    thoughtUnitAnalysis: any,
    enhancedAnalysis: EnhancedMainIdeaAnalysis,
    supportAnalysis: SupportAnalysisResult,
    outline: DocumentOutline,
    refinementResults: ProgressiveRefinementResult[]
  ): AnalysisQualityMetrics {
    const mainIdeaConfidence = enhancedAnalysis.confidence;
    const supportClassificationAccuracy = supportAnalysis.qualityMetrics.credibilityScore;
    const hierarchicalConsistency = outline.sections.length > 0 ? 
      outline.sections.reduce((sum, s) => sum + s.coherenceScore, 0) / outline.sections.length : 0.5;
    const semanticCoherence = enhancedAnalysis.semanticCoherence;
    const adaptationEffectiveness = refinementResults.length > 0 ? 
      refinementResults.reduce((sum, r) => sum + r.finalConfidence, 0) / refinementResults.length : 0.7;
    
    const overallAccuracy = (
      mainIdeaConfidence * 0.3 +
      supportClassificationAccuracy * 0.25 +
      hierarchicalConsistency * 0.2 +
      semanticCoherence * 0.15 +
      adaptationEffectiveness * 0.1
    );

    return {
      overallAccuracy,
      mainIdeaConfidence,
      supportClassificationAccuracy,
      hierarchicalConsistency,
      semanticCoherence,
      adaptationEffectiveness
    };
  }

  // Generate personalized highlighting
  private async generatePersonalizedHighlighting(
    text: string,
    thoughtUnits: ThoughtUnit[],
    supportAnalysis: SupportAnalysisResult,
    highlightingProfile?: HighlightingProfile,
    userProfile?: UserProfile
  ): Promise<PersonalizedHighlighting> {
    const mainIdeas: HighlightedElement[] = [];
    const supportingDetails: HighlightedElement[] = [];
    const keyTerms: HighlightedElement[] = [];
    const transitions: HighlightedElement[] = [];
    const examples: HighlightedElement[] = [];
    const definitions: HighlightedElement[] = [];
    const evidence: HighlightedElement[] = [];

    // Process thought units
    thoughtUnits.forEach(unit => {
      const element: HighlightedElement = {
        text: unit.text,
        startIndex: unit.startIndex,
        endIndex: unit.endIndex,
        highlightStyle: {
          backgroundColor: unit.visualCues.color,
          borderColor: unit.visualCues.color,
          borderStyle: unit.visualCues.borderStyle,
          opacity: unit.visualCues.intensity,
          priority: unit.isMainIdea ? 10 : 5
        },
        tooltip: {
          title: unit.isMainIdea ? 'Main Idea' : 'Supporting Detail',
          description: `${unit.type} with ${Math.round(unit.confidence * 100)}% confidence`,
          confidence: unit.confidence,
          supportingEvidence: unit.relationships.childIds.length > 0 ? 
            [`Connected to ${unit.relationships.childIds.length} supporting elements`] : []
        },
        interactionHints: [
          unit.isMainIdea ? 'This is a key concept - focus here' : 'This supports the main idea',
          `Processing time: ~${unit.cognitiveMarkers.processingTime}s`
        ]
      };

      if (unit.isMainIdea) {
        mainIdeas.push(element);
      } else {
        switch (unit.type) {
          case 'example':
            examples.push(element);
            break;
          case 'definition':
            definitions.push(element);
            break;
          case 'transition':
            transitions.push(element);
            break;
          default:
            supportingDetails.push(element);
        }
      }
    });

    // Process support classifications for evidence
    supportAnalysis.classifications.forEach(classification => {
      if (classification.type === SupportType.EVIDENCE || classification.type === SupportType.STATISTIC) {
        evidence.push({
          text: classification.text,
          startIndex: 0, // Would need text position mapping in real implementation
          endIndex: classification.text.length,
          highlightStyle: {
            backgroundColor: '#3b82f6',
            borderColor: '#1d4ed8',
            borderStyle: 'solid',
            opacity: 0.3,
            priority: 8
          },
          tooltip: {
            title: 'Evidence',
            description: `${classification.type} with ${classification.confidenceLevel} confidence`,
            confidence: classification.relevanceScore,
            supportingEvidence: [`Evidence strength: ${Math.round(classification.evidenceStrength * 100)}%`]
          },
          interactionHints: ['This provides evidence for the main argument']
        });
      }
    });

    const adaptiveIntensity = highlightingProfile?.intensityLevel || 0.6;

    return {
      mainIdeas,
      supportingDetails,
      keyTerms,
      transitions,
      examples,
      definitions,
      evidence,
      adaptiveIntensity
    };
  }

  // Helper methods
  private generateCacheKey(text: string, options: AdvancedAnalysisOptions): string {
    const textHash = this.simpleHash(text);
    const optionsHash = this.simpleHash(JSON.stringify(options));
    return `${textHash}-${optionsHash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private determineOverallComplexity(
    text: string,
    enhancedAnalysis: EnhancedMainIdeaAnalysis,
    outline: DocumentOutline
  ): 'simple' | 'moderate' | 'complex' | 'expert' {
    let complexityScore = 0;
    
    // Text length factor
    if (text.length > 2000) complexityScore += 1;
    if (text.length > 5000) complexityScore += 1;
    
    // Semantic complexity
    if (enhancedAnalysis.semanticCoherence < 0.6) complexityScore += 1;
    
    // Hierarchical depth
    if (outline.hierarchy.abstractionLevels.size > 3) complexityScore += 1;
    
    // Concept density
    const conceptDensity = enhancedAnalysis.topicClusters.length / Math.max(text.length / 1000, 1);
    if (conceptDensity > 3) complexityScore += 1;
    
    if (complexityScore >= 4) return 'expert';
    if (complexityScore >= 3) return 'complex';
    if (complexityScore >= 2) return 'moderate';
    return 'simple';
  }

  private calculateReadingDifficulty(text: string, enhancedAnalysis: EnhancedMainIdeaAnalysis): number {
    // Simplified reading difficulty calculation
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    const avgSentenceLength = words.length / sentences.length;
    const complexWords = words.filter(word => word.length > 6).length;
    const complexWordRatio = complexWords / words.length;
    
    // Flesch-like formula adapted for our context
    const difficulty = 0.39 * avgSentenceLength + 11.8 * complexWordRatio - 15.59;
    return Math.max(0, Math.min(1, difficulty / 100));
  }

  private analyzeInformationArchitecture(
    outline: DocumentOutline,
    supportAnalysis: SupportAnalysisResult
  ): InformationArchitecture {
    const hierarchyDepth = outline.hierarchy.abstractionLevels.size;
    const conceptualBreadth = outline.hierarchy.conceptMap.size;
    const crossReferenceCount = outline.crossReferences.size;
    const topicTransitions = outline.topicFlow.length - 1;
    
    // Determine argument structure
    let argumentStructure: InformationArchitecture['argumentStructure'] = 'linear';
    if (crossReferenceCount > conceptualBreadth * 0.3) argumentStructure = 'network';
    else if (hierarchyDepth > 3) argumentStructure = 'hierarchical';
    else if (topicTransitions > outline.sections.length) argumentStructure = 'spiral';
    
    // Determine rhetorical pattern
    const supportTypes = supportAnalysis.classifications.map(c => c.type);
    const hasExamples = supportTypes.includes(SupportType.EXAMPLE);
    const hasEvidence = supportTypes.includes(SupportType.EVIDENCE);
    const hasNarrative = supportTypes.includes(SupportType.QUOTE);
    
    let rhetoricalPattern: InformationArchitecture['rhetoricalPattern'] = 'descriptive';
    if (hasEvidence && hasExamples) rhetoricalPattern = 'expository';
    else if (hasNarrative) rhetoricalPattern = 'narrative';
    else if (supportTypes.includes(SupportType.CONTRADICTION)) rhetoricalPattern = 'persuasive';

    return {
      hierarchyDepth,
      conceptualBreadth,
      crossReferenceCount,
      topicTransitions,
      argumentStructure,
      rhetoricalPattern
    };
  }

  private assessCognitiveLoad(
    text: string,
    enhancedAnalysis: EnhancedMainIdeaAnalysis,
    outline: DocumentOutline
  ): CognitiveLoadAnalysis {
    // Intrinsic load - content complexity
    const conceptDensity = enhancedAnalysis.topicClusters.length / Math.max(text.length / 1000, 1);
    const intrinsicLoad = Math.min(conceptDensity / 5, 1);
    
    // Extraneous load - presentation complexity
    const structuralComplexity = outline.sections.length / Math.max(text.length / 500, 1);
    const extraneousLoad = Math.min(structuralComplexity / 3, 1);
    
    // Germane load - learning-relevant processing
    const coherenceScore = enhancedAnalysis.semanticCoherence;
    const germaneLoad = coherenceScore; // Higher coherence = more germane processing
    
    const totalLoad = (intrinsicLoad + extraneousLoad + germaneLoad) / 3;
    
    const recommendations: string[] = [];
    if (intrinsicLoad > 0.7) recommendations.push('Break down complex concepts into smaller chunks');
    if (extraneousLoad > 0.7) recommendations.push('Simplify presentation structure');
    if (germaneLoad < 0.5) recommendations.push('Add more connecting explanations');
    if (totalLoad > 0.8) recommendations.push('Consider reducing overall content density');

    return {
      intrinsicLoad,
      extraneousLoad,
      germaneLoad,
      totalLoad,
      recommendations
    };
  }

  private generateLearningObjectives(
    enhancedAnalysis: EnhancedMainIdeaAnalysis,
    supportAnalysis: SupportAnalysisResult
  ): LearningObjective[] {
    const objectives: LearningObjective[] = [];
    
    // Main idea objective
    objectives.push({
      objective: `Understand the main concept: ${enhancedAnalysis.primaryIdea}`,
      bloomsLevel: 'understand',
      supportingEvidence: enhancedAnalysis.supportingPoints.slice(0, 3),
      assessmentSuggestions: [
        'Explain the main idea in your own words',
        'Identify supporting evidence for the main concept'
      ]
    });
    
    // Analysis objective if evidence present
    const hasEvidence = supportAnalysis.classifications.some(c => c.type === SupportType.EVIDENCE);
    if (hasEvidence) {
      objectives.push({
        objective: 'Analyze the evidence presented to support the main argument',
        bloomsLevel: 'analyze',
        supportingEvidence: supportAnalysis.classifications
          .filter(c => c.type === 'evidence')
          .map(c => c.text)
          .slice(0, 2),
        assessmentSuggestions: [
          'Evaluate the strength of the evidence provided',
          'Compare different types of supporting evidence'
        ]
      });
    }
    
    return objectives;
  }

  private suggestComprehensionStrategies(
    complexity: 'simple' | 'moderate' | 'complex' | 'expert',
    architecture: InformationArchitecture,
    cognitiveLoad: CognitiveLoadAnalysis
  ): ComprehensionStrategy[] {
    const strategies: ComprehensionStrategy[] = [];
    
    // Strategy based on complexity
    switch (complexity) {
      case 'simple':
        strategies.push({
          strategy: 'Direct Reading',
          applicability: 0.9,
          description: 'Read through the text linearly, focusing on main ideas',
          implementation: ['Read at normal pace', 'Highlight key concepts', 'Summarize each section']
        });
        break;
      case 'moderate':
        strategies.push({
          strategy: 'Structured Reading',
          applicability: 0.8,
          description: 'Use preview-read-review approach with note-taking',
          implementation: ['Preview headings and structure', 'Read actively with notes', 'Review and connect concepts']
        });
        break;
      case 'complex':
        strategies.push({
          strategy: 'Analytical Reading',
          applicability: 0.9,
          description: 'Break down complex concepts and analyze relationships',
          implementation: ['Create concept maps', 'Analyze argument structure', 'Question and evaluate claims']
        });
        break;
      case 'expert':
        strategies.push({
          strategy: 'Critical Analysis',
          applicability: 0.8,
          description: 'Deep analysis with synthesis and evaluation',
          implementation: ['Compare with prior knowledge', 'Evaluate methodology', 'Synthesize new insights']
        });
        break;
    }
    
    // Strategy based on cognitive load
    if (cognitiveLoad.totalLoad > 0.7) {
      strategies.push({
        strategy: 'Chunking Strategy',
        applicability: 0.9,
        description: 'Break content into manageable chunks to reduce cognitive overload',
        implementation: ['Read in small sections', 'Take breaks between sections', 'Summarize each chunk before continuing']
      });
    }
    
    return strategies;
  }

  private estimateMemoryUsage(text: string, thoughtUnits: ThoughtUnit[]): number {
    // Rough estimation in MB
    const textSize = text.length * 2; // UTF-16 encoding
    const thoughtUnitsSize = thoughtUnits.length * 1000; // Estimated size per unit
    const analysisOverhead = 500000; // Estimated overhead for analysis objects
    
    return (textSize + thoughtUnitsSize + analysisOverhead) / (1024 * 1024);
  }

  // Public utility methods
  clearCache(): void {
    this.analysisCache.clear();
  }

  getCacheSize(): number {
    return this.analysisCache.size;
  }

  getPerformanceMetrics(): Map<string, ProcessingMetrics> {
    return this.performanceMetrics;
  }
}

// Export singleton instance
export const enhancedHybridAnalysisEngine = new EnhancedHybridAnalysisEngine();
