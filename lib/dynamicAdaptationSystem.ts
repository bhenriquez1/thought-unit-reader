import { enhancedSemanticAnalyzer, AnalysisContext } from './enhancedSemanticAnalysis';
import { supportClassificationEngine } from './supportClassification';
import { contextualMainIdeaExtractionEngine, ProgressiveRefinementResult } from './contextualMainIdeaExtraction';

// Core interfaces for dynamic adaptation
export interface UserProfile {
  userId: string;
  readingLevel: ReadingLevel;
  domainExpertise: DomainExpertise[];
  learningStyle: LearningStyle;
  cognitivePreferences: CognitivePreferences;
  performanceMetrics: PerformanceMetrics;
  adaptationHistory: AdaptationEvent[];
  personalizedThresholds: PersonalizedThresholds;
  lastUpdated: Date;
}

export interface ReadingLevel {
  overall: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  vocabulary: number; // 0-1 scale
  comprehension: number; // 0-1 scale
  processingSpeed: number; // 0-1 scale
  criticalThinking: number; // 0-1 scale
}

export interface DomainExpertise {
  domain: string;
  level: number; // 0-1 scale
  confidence: number; // 0-1 scale
  lastAssessed: Date;
  keyTermsFamiliarity: string[];
}

export interface LearningStyle {
  visual: number; // 0-1 preference
  auditory: number; // 0-1 preference
  kinesthetic: number; // 0-1 preference
  readingWriting: number; // 0-1 preference
  sequential: number; // 0-1 preference (vs. global)
  analytical: number; // 0-1 preference (vs. intuitive)
}

export interface CognitivePreferences {
  detailOriented: number; // 0-1 scale
  bigPictureOriented: number; // 0-1 scale
  examplePreference: number; // 0-1 scale
  abstractionTolerance: number; // 0-1 scale
  multitaskingAbility: number; // 0-1 scale
  attentionSpan: number; // minutes
  preferredChunkSize: number; // sentences per chunk
}

export interface PerformanceMetrics {
  comprehensionAccuracy: number; // 0-1 scale
  readingSpeed: number; // words per minute
  retentionRate: number; // 0-1 scale
  engagementLevel: number; // 0-1 scale
  difficultyHandling: number; // 0-1 scale
  improvementRate: number; // change over time
  sessionCount: number;
  totalReadingTime: number; // minutes
}

export interface AdaptationEvent {
  timestamp: Date;
  eventType: AdaptationEventType;
  context: string;
  previousValue: any;
  newValue: any;
  confidence: number;
  userFeedback?: UserFeedback;
}

export enum AdaptationEventType {
  THRESHOLD_ADJUSTMENT = 'threshold_adjustment',
  HIGHLIGHTING_PREFERENCE = 'highlighting_preference',
  DIFFICULTY_ADAPTATION = 'difficulty_adaptation',
  LEARNING_STYLE_UPDATE = 'learning_style_update',
  DOMAIN_EXPERTISE_UPDATE = 'domain_expertise_update',
  COGNITIVE_PREFERENCE_UPDATE = 'cognitive_preference_update'
}

export interface UserFeedback {
  rating: number; // 1-5 scale
  comment?: string;
  helpfulness: number; // 1-5 scale
  accuracy: number; // 1-5 scale
  relevance: number; // 1-5 scale
}

export interface PersonalizedThresholds {
  mainIdeaConfidence: number;
  supportRelevance: number;
  semanticSimilarity: number;
  coherenceScore: number;
  importanceLevel: number;
  difficultyThreshold: number;
  highlightingIntensity: number;
}

export interface HighlightingProfile {
  userId: string;
  mainIdeaStyle: HighlightStyle;
  supportingInfoStyle: HighlightStyle;
  keyTermsStyle: HighlightStyle;
  definitionsStyle: HighlightStyle;
  examplesStyle: HighlightStyle;
  transitionsStyle: HighlightStyle;
  intensityLevel: number; // 0-1 scale
  colorScheme: ColorScheme;
  animationPreferences: AnimationPreferences;
}

export interface HighlightStyle {
  color: string;
  opacity: number;
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  borderWidth: number;
  backgroundColor: string;
  textDecoration: 'underline' | 'bold' | 'italic' | 'none';
  priority: number; // 1-10 scale
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  scheme: 'light' | 'dark' | 'high-contrast' | 'custom';
}

export interface AnimationPreferences {
  enabled: boolean;
  speed: 'slow' | 'medium' | 'fast';
  type: 'fade' | 'slide' | 'pulse' | 'none';
  duration: number; // milliseconds
}

export interface ReinforcementLearningState {
  userId: string;
  stateVector: number[];
  actionHistory: ReinforcementAction[];
  rewardHistory: number[];
  qTable: Map<string, Map<string, number>>;
  explorationRate: number;
  learningRate: number;
  discountFactor: number;
  lastUpdate: Date;
}

export interface ReinforcementAction {
  actionType: string;
  parameters: any;
  timestamp: Date;
  context: string;
  reward: number;
}

export interface AdaptationRecommendation {
  type: AdaptationEventType;
  description: string;
  confidence: number;
  expectedImprovement: number;
  parameters: any;
  reasoning: string;
}

export interface ReadingDifficultyAssessment {
  overallDifficulty: number; // 0-1 scale
  vocabularyDifficulty: number;
  syntacticComplexity: number;
  conceptualDensity: number;
  abstractionLevel: number;
  domainSpecificity: number;
  recommendedAdjustments: string[];
}

// Main dynamic adaptation engine
export class DynamicAdaptationSystem {
  private userProfiles = new Map<string, UserProfile>();
  private highlightingProfiles = new Map<string, HighlightingProfile>();
  private reinforcementStates = new Map<string, ReinforcementLearningState>();
  private adaptationThreshold = 0.1; // Minimum change to trigger adaptation
  private learningRate = 0.1;
  private explorationRate = 0.1;
  private discountFactor = 0.9;

  // Initialize user profile
  async initializeUserProfile(userId: string, initialData?: Partial<UserProfile>): Promise<UserProfile> {
    const defaultProfile: UserProfile = {
      userId,
      readingLevel: {
        overall: 'intermediate',
        vocabulary: 0.6,
        comprehension: 0.6,
        processingSpeed: 0.6,
        criticalThinking: 0.6
      },
      domainExpertise: [],
      learningStyle: {
        visual: 0.5,
        auditory: 0.3,
        kinesthetic: 0.2,
        readingWriting: 0.7,
        sequential: 0.6,
        analytical: 0.5
      },
      cognitivePreferences: {
        detailOriented: 0.5,
        bigPictureOriented: 0.5,
        examplePreference: 0.6,
        abstractionTolerance: 0.5,
        multitaskingAbility: 0.4,
        attentionSpan: 15,
        preferredChunkSize: 3
      },
      performanceMetrics: {
        comprehensionAccuracy: 0.7,
        readingSpeed: 200,
        retentionRate: 0.6,
        engagementLevel: 0.7,
        difficultyHandling: 0.6,
        improvementRate: 0.0,
        sessionCount: 0,
        totalReadingTime: 0
      },
      adaptationHistory: [],
      personalizedThresholds: {
        mainIdeaConfidence: 0.7,
        supportRelevance: 0.6,
        semanticSimilarity: 0.5,
        coherenceScore: 0.6,
        importanceLevel: 0.5,
        difficultyThreshold: 0.7,
        highlightingIntensity: 0.6
      },
      lastUpdated: new Date()
    };

    const profile = { ...defaultProfile, ...initialData };
    this.userProfiles.set(userId, profile);
    
    // Initialize highlighting profile
    await this.initializeHighlightingProfile(userId);
    
    // Initialize reinforcement learning state
    await this.initializeReinforcementLearning(userId);
    
    return profile;
  }

  // Real-time adaptation based on user interaction
  async adaptToUserBehavior(
    userId: string,
    interactionData: {
      textContent: string;
      userActions: string[];
      timeSpent: number;
      comprehensionScore?: number;
      userFeedback?: UserFeedback;
    }
  ): Promise<AdaptationRecommendation[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error(`User profile not found for userId: ${userId}`);
    }

    const recommendations: AdaptationRecommendation[] = [];
    
    // Assess reading difficulty
    const difficultyAssessment = await this.assessReadingDifficulty(
      interactionData.textContent,
      profile
    );
    
    // Update performance metrics
    await this.updatePerformanceMetrics(userId, interactionData, difficultyAssessment);
    
    // Analyze user behavior patterns
    const behaviorAnalysis = this.analyzeBehaviorPatterns(interactionData, profile);
    
    // Generate adaptation recommendations
    if (behaviorAnalysis.needsThresholdAdjustment) {
      const thresholdRec = await this.recommendThresholdAdjustment(userId, behaviorAnalysis);
      recommendations.push(thresholdRec);
    }
    
    if (behaviorAnalysis.needsHighlightingAdjustment) {
      const highlightingRec = await this.recommendHighlightingAdjustment(userId, behaviorAnalysis);
      recommendations.push(highlightingRec);
    }
    
    if (behaviorAnalysis.needsDifficultyAdjustment) {
      const difficultyRec = await this.recommendDifficultyAdjustment(userId, difficultyAssessment);
      recommendations.push(difficultyRec);
    }
    
    // Apply reinforcement learning
    await this.updateReinforcementLearning(userId, interactionData, recommendations);
    
    // Apply high-confidence recommendations automatically
    for (const rec of recommendations) {
      if (rec.confidence > 0.8) {
        await this.applyRecommendation(userId, rec);
      }
    }
    
    return recommendations;
  }

  // Get personalized highlighting for text
  async getPersonalizedHighlighting(
    userId: string,
    text: string,
    context?: AnalysisContext
  ): Promise<any> {
    const profile = this.userProfiles.get(userId);
    const highlightingProfile = this.highlightingProfiles.get(userId);
    
    if (!profile || !highlightingProfile) {
      throw new Error(`Profile not found for userId: ${userId}`);
    }

    // Extract main ideas with personalized thresholds
    const mainIdeas = await contextualMainIdeaExtractionEngine.extractContextualMainIdeas(text);
    
    // Apply personalized highlighting based on user preferences
    const highlighting = {
      mainIdeas: mainIdeas.map(idea => ({
        text: idea.refinedMainIdea,
        style: highlightingProfile.mainIdeaStyle,
        confidence: idea.finalConfidence
      })),
      supportingInfo: [],
      keyTerms: [],
      personalizedIntensity: highlightingProfile.intensityLevel
    };

    return highlighting;
  }

  // Initialize highlighting profile
  private async initializeHighlightingProfile(userId: string): Promise<void> {
    const defaultProfile: HighlightingProfile = {
      userId,
      mainIdeaStyle: {
        color: '#FFD700',
        opacity: 0.3,
        borderStyle: 'solid',
        borderWidth: 2,
        backgroundColor: '#FFFACD',
        textDecoration: 'bold',
        priority: 10
      },
      supportingInfoStyle: {
        color: '#87CEEB',
        opacity: 0.2,
        borderStyle: 'dashed',
        borderWidth: 1,
        backgroundColor: '#F0F8FF',
        textDecoration: 'none',
        priority: 5
      },
      keyTermsStyle: {
        color: '#98FB98',
        opacity: 0.25,
        borderStyle: 'dotted',
        borderWidth: 1,
        backgroundColor: '#F0FFF0',
        textDecoration: 'underline',
        priority: 7
      },
      definitionsStyle: {
        color: '#DDA0DD',
        opacity: 0.2,
        borderStyle: 'solid',
        borderWidth: 1,
        backgroundColor: '#F8F0FF',
        textDecoration: 'italic',
        priority: 6
      },
      examplesStyle: {
        color: '#F0E68C',
        opacity: 0.2,
        borderStyle: 'dashed',
        borderWidth: 1,
        backgroundColor: '#FFFEF0',
        textDecoration: 'none',
        priority: 4
      },
      transitionsStyle: {
        color: '#FFA07A',
        opacity: 0.15,
        borderStyle: 'dotted',
        borderWidth: 1,
        backgroundColor: '#FFF8F0',
        textDecoration: 'none',
        priority: 3
      },
      intensityLevel: 0.6,
      colorScheme: {
        primary: '#4A90E2',
        secondary: '#7ED321',
        accent: '#F5A623',
        background: '#FFFFFF',
        text: '#333333',
        scheme: 'light'
      },
      animationPreferences: {
        enabled: true,
        speed: 'medium',
        type: 'fade',
        duration: 300
      }
    };

    this.highlightingProfiles.set(userId, defaultProfile);
  }

  // Initialize reinforcement learning
  private async initializeReinforcementLearning(userId: string): Promise<void> {
    const initialState: ReinforcementLearningState = {
      userId,
      stateVector: [0.5, 0.5, 0.5, 0.5, 0.5], // Initial neutral state
      actionHistory: [],
      rewardHistory: [],
      qTable: new Map(),
      explorationRate: this.explorationRate,
      learningRate: this.learningRate,
      discountFactor: this.discountFactor,
      lastUpdate: new Date()
    };

    this.reinforcementStates.set(userId, initialState);
  }

  // Assess reading difficulty
  private async assessReadingDifficulty(
    text: string,
    profile: UserProfile
  ): Promise<ReadingDifficultyAssessment> {
    const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(text);
    
    // Calculate various difficulty metrics
    const vocabularyDifficulty = this.calculateVocabularyDifficulty(text, profile);
    const syntacticComplexity = this.calculateSyntacticComplexity(text);
    const conceptualDensity = semantics.conceptualDensity;
    const abstractionLevel = semantics.abstractionLevel === 'abstract' ? 0.8 : 
                            semantics.abstractionLevel === 'mixed' ? 0.5 : 0.2;
    const domainSpecificity = this.calculateDomainSpecificity(text, profile);
    
    const overallDifficulty = (
      vocabularyDifficulty * 0.25 +
      syntacticComplexity * 0.2 +
      conceptualDensity * 0.2 +
      abstractionLevel * 0.2 +
      domainSpecificity * 0.15
    );

    const recommendedAdjustments: string[] = [];
    if (vocabularyDifficulty > 0.7) recommendedAdjustments.push('Provide vocabulary support');
    if (syntacticComplexity > 0.7) recommendedAdjustments.push('Break down complex sentences');
    if (conceptualDensity > 0.8) recommendedAdjustments.push('Add conceptual scaffolding');
    if (abstractionLevel > 0.7) recommendedAdjustments.push('Provide concrete examples');

    return {
      overallDifficulty,
      vocabularyDifficulty,
      syntacticComplexity,
      conceptualDensity,
      abstractionLevel,
      domainSpecificity,
      recommendedAdjustments
    };
  }

  // Update performance metrics
  private async updatePerformanceMetrics(
    userId: string,
    interactionData: any,
    difficultyAssessment: ReadingDifficultyAssessment
  ): Promise<void> {
    const profile = this.userProfiles.get(userId)!;
    const metrics = profile.performanceMetrics;
    
    // Update session count and reading time
    metrics.sessionCount++;
    metrics.totalReadingTime += interactionData.timeSpent;
    
    // Update reading speed (words per minute)
    const wordCount = interactionData.textContent.split(/\s+/).length;
    const currentSpeed = wordCount / (interactionData.timeSpent / 60);
    metrics.readingSpeed = (metrics.readingSpeed * 0.8) + (currentSpeed * 0.2);
    
    // Update comprehension accuracy if available
    if (interactionData.comprehensionScore !== undefined) {
      metrics.comprehensionAccuracy = (metrics.comprehensionAccuracy * 0.8) + 
                                     (interactionData.comprehensionScore * 0.2);
    }
    
    // Update difficulty handling
    const expectedDifficulty = difficultyAssessment.overallDifficulty;
    const actualPerformance = interactionData.comprehensionScore || 0.7;
    const difficultyHandling = actualPerformance / Math.max(expectedDifficulty, 0.1);
    metrics.difficultyHandling = (metrics.difficultyHandling * 0.8) + (difficultyHandling * 0.2);
    
    profile.lastUpdated = new Date();
  }

  // Analyze behavior patterns
  private analyzeBehaviorPatterns(interactionData: any, profile: UserProfile): any {
    const analysis = {
      needsThresholdAdjustment: false,
      needsHighlightingAdjustment: false,
      needsDifficultyAdjustment: false,
      patterns: {}
    };

    // Check if user is struggling (low comprehension, high time spent)
    if (interactionData.comprehensionScore && interactionData.comprehensionScore < 0.6) {
      analysis.needsThresholdAdjustment = true;
      analysis.needsDifficultyAdjustment = true;
    }

    // Check if user feedback indicates issues
    if (interactionData.userFeedback) {
      if (interactionData.userFeedback.helpfulness < 3) {
        analysis.needsHighlightingAdjustment = true;
      }
      if (interactionData.userFeedback.accuracy < 3) {
        analysis.needsThresholdAdjustment = true;
      }
    }

    return analysis;
  }

  // Recommend threshold adjustment
  private async recommendThresholdAdjustment(
    userId: string,
    behaviorAnalysis: any
  ): Promise<AdaptationRecommendation> {
    return {
      type: AdaptationEventType.THRESHOLD_ADJUSTMENT,
      description: 'Adjust confidence thresholds based on user performance',
      confidence: 0.7,
      expectedImprovement: 0.15,
      parameters: {
        mainIdeaConfidence: -0.1,
        supportRelevance: -0.05
      },
      reasoning: 'User showing difficulty with current thresholds'
    };
  }

  // Recommend highlighting adjustment
  private async recommendHighlightingAdjustment(
    userId: string,
    behaviorAnalysis: any
  ): Promise<AdaptationRecommendation> {
    return {
      type: AdaptationEventType.HIGHLIGHTING_PREFERENCE,
      description: 'Adjust highlighting intensity and style',
      confidence: 0.6,
      expectedImprovement: 0.1,
      parameters: {
        intensityLevel: 0.1,
        mainIdeaOpacity: 0.05
      },
      reasoning: 'User feedback suggests highlighting needs adjustment'
    };
  }

  // Recommend difficulty adjustment
  private async recommendDifficultyAdjustment(
    userId: string,
    difficultyAssessment: ReadingDifficultyAssessment
  ): Promise<AdaptationRecommendation> {
    return {
      type: AdaptationEventType.DIFFICULTY_ADAPTATION,
      description: 'Adjust content difficulty presentation',
      confidence: 0.8,
      expectedImprovement: 0.2,
      parameters: {
        difficultyThreshold: -0.1,
        scaffoldingLevel: 0.2
      },
      reasoning: 'Content difficulty exceeds user comfort level'
    };
  }

  // Update reinforcement learning
  private async updateReinforcementLearning(
    userId: string,
    interactionData: any,
    recommendations: AdaptationRecommendation[]
  ): Promise<void> {
    const rlState = this.reinforcementStates.get(userId)!;
    
    // Calculate reward based on user performance and feedback
    let reward = 0;
    if (interactionData.comprehensionScore) {
      reward += interactionData.comprehensionScore * 0.5;
    }
    if (interactionData.userFeedback) {
      reward += (interactionData.userFeedback.rating / 5) * 0.5;
    }
    
    rlState.rewardHistory.push(reward);
    rlState.lastUpdate = new Date();
    
    // Update Q-table (simplified implementation)
    for (const rec of recommendations) {
      const stateKey = this.encodeState(rlState.stateVector);
      const actionKey = rec.type;
      
      if (!rlState.qTable.has(stateKey)) {
        rlState.qTable.set(stateKey, new Map());
      }
      
      const actionMap = rlState.qTable.get(stateKey)!;
      const currentQ = actionMap.get(actionKey) || 0;
      const newQ = currentQ + this.learningRate * (reward - currentQ);
      actionMap.set(actionKey, newQ);
    }
  }

  // Apply recommendation
  private async applyRecommendation(
    userId: string,
    recommendation: AdaptationRecommendation
  ): Promise<void> {
    const profile = this.userProfiles.get(userId)!;
    
    switch (recommendation.type) {
      case AdaptationEventType.THRESHOLD_ADJUSTMENT:
        if (recommendation.parameters.mainIdeaConfidence) {
          profile.personalizedThresholds.mainIdeaConfidence += 
            recommendation.parameters.mainIdeaConfidence;
        }
        if (recommendation.parameters.supportRelevance) {
          profile.personalizedThresholds.supportRelevance += 
            recommendation.parameters.supportRelevance;
        }
        break;
        
      case AdaptationEventType.HIGHLIGHTING_PREFERENCE:
        const highlightingProfile = this.highlightingProfiles.get(userId)!;
        if (recommendation.parameters.intensityLevel) {
          highlightingProfile.intensityLevel += recommendation.parameters.intensityLevel;
        }
        break;
        
      case AdaptationEventType.DIFFICULTY_ADAPTATION:
        if (recommendation.parameters.difficultyThreshold) {
          profile.personalizedThresholds.difficultyThreshold += 
            recommendation.parameters.difficultyThreshold;
        }
        break;
    }
    
    // Record adaptation event
    profile.adaptationHistory.push({
      timestamp: new Date(),
      eventType: recommendation.type,
      context: recommendation.description,
      previousValue: null, // Would store previous value in real implementation
      newValue: recommendation.parameters,
      confidence: recommendation.confidence
    });
    
    profile.lastUpdated = new Date();
  }

  // Helper methods
  private calculateVocabularyDifficulty(text: string, profile: UserProfile): number {
    const words = text.toLowerCase().split(/\s+/);
    const complexWords = words.filter(word => word.length > 7).length;
    const baseComplexity = complexWords / words.length;
    
    // Adjust based on user's vocabulary level
    return Math.max(0, Math.min(1, baseComplexity / profile.readingLevel.vocabulary));
  }

  private calculateSyntacticComplexity(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = text.split(/\s+/).length / sentences.length;
    
    // Simple heuristic: longer sentences are more complex
    return Math.min(1, avgWordsPerSentence / 25);
  }

  private calculateDomainSpecificity(text: string, profile: UserProfile): number {
    // Simple implementation - would be enhanced with domain-specific dictionaries
    const technicalTerms = text.match(/\b[A-Z][a-z]*[A-Z][a-z]*\b/g) || [];
    return Math.min(1, technicalTerms.length / 100);
  }

  private encodeState(stateVector: number[]): string {
    return stateVector.map(v => Math.round(v * 10)).join(',');
  }

  // Public methods for getting user data
  getUserProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  getHighlightingProfile(userId: string): HighlightingProfile | undefined {
    return this.highlightingProfiles.get(userId);
  }

  // Update user profile manually
  updateUserProfile(userId: string, updates: Partial<UserProfile>): void {
    const profile = this.userProfiles.get(userId);
    if (profile) {
      Object.assign(profile, updates);
      profile.lastUpdated = new Date();
    }
  }
}

// Export singleton instance
export const dynamicAdaptationSystem = new DynamicAdaptationSystem();
