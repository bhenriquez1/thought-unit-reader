/**
 * Adaptive Learning System for Universal Pattern Butler Reader
 * Provides intelligent user modeling, personalized recommendations, and learning optimization
 */

export type UserExperienceLevel = 'beginner' | 'intermediate' | 'expert';
export type LearningStyle = 'visual' | 'analytical' | 'applied' | 'integrated';
export type ReaderMode = 'exploration' | 'training' | 'butler';

// Learning event tracking
export interface LearningEvent {
  timestamp: number;
  userId: string;
  sessionId: string;
  action: 'pattern_selected' | 'training_completed' | 'butler_feedback' | 'mode_switched' | 'page_turned' | 'text_selected';
  patternId?: string;
  successScore?: number; // 0-100
  timeSpent?: number; // seconds
  contextData: {
    contentType: string;
    domain: string;
    difficulty: number;
    pageNumber: number;
    thoughtUnitIndex: number;
  };
  metadata?: Record<string, any>;
}

// User engagement metrics
export interface EngagementData {
  timestamp: number;
  mode: ReaderMode;
  duration: number; // seconds
  actionsPerMinute: number;
  completionRate: number; // 0-1
  satisfactionScore?: number; // 0-5, optional user rating
}

// Speech and interaction preferences
export interface SpeechPreferences {
  preferredVoice: string;
  speechRate: number;
  autoReadEnabled: boolean;
  metaphorComplexity: 'simple' | 'moderate' | 'complex';
}

// Comprehensive user intelligence model
export interface IntelligentUserModel {
  userId: string;
  sessionId: string;
  
  // Core Learning Profile
  experienceLevel: UserExperienceLevel;
  preferredMode: ReaderMode;
  learningStyle: LearningStyle;
  
  // Pattern Mastery Tracking
  patternStrengthScores: Record<string, number>; // Pattern ID -> mastery score (0-100)
  recentSuccessRate: number; // Rolling average of last 10 attempts
  preferredPatterns: string[]; // Top 5 patterns user excels at
  strugglingPatterns: string[]; // Patterns needing more work
  
  // Content Adaptation
  contentDomains: string[]; // ['science', 'math', 'literature', etc.]
  optimalComplexityLevel: number; // 1-10 scale
  attentionSpan: number; // Optimal session length in minutes
  
  // Personalization
  metaphorPreferences: Record<string, number>; // Metaphor type -> effectiveness rating
  speechPreferences: SpeechPreferences;
  visualPreferences: {
    preferredColors: string[];
    animationSpeed: 'slow' | 'normal' | 'fast';
    densityPreference: 'minimal' | 'moderate' | 'detailed';
  };
  
  // Learning Analytics
  engagementTrends: EngagementData[];
  learningVelocity: number; // Rate of improvement over time
  totalTimeSpent: number; // Lifetime learning time in minutes
  streakData: {
    currentStreak: number; // Days of consecutive use
    longestStreak: number;
    lastActiveDate: string;
  };
  
  // Adaptive Metrics
  lastUpdated: number;
  confidence: number; // How confident we are in our model (0-1)
  adaptationHistory: AdaptationEvent[];
}

// Track model adaptations
export interface AdaptationEvent {
  timestamp: number;
  type: 'level_adjustment' | 'mode_recommendation' | 'complexity_change' | 'pattern_priority';
  previousValue: any;
  newValue: any;
  reason: string;
  confidence: number;
}

// Mode transition recommendations
export interface ModeRecommendation {
  recommendedMode: ReaderMode;
  confidence: number;
  reasons: string[];
  expectedEngagement: number;
  learningBenefit: number;
}

// Page navigation intelligence
export interface PageRecommendation {
  targetPage: number;
  reason: 'pattern_examples' | 'difficulty_progression' | 'review_needed' | 'new_content';
  confidence: number;
  expectedValue: number;
}

// Performance prediction
export interface LearningPrediction {
  patternId: string;
  predictedSuccessRate: number;
  recommendedApproach: 'direct_practice' | 'scaffolding' | 'review_first';
  estimatedTimeToMastery: number; // minutes
}

/**
 * Core Adaptive Learning Engine
 */
export class AdaptiveLearningEngine {
  private userModel: IntelligentUserModel;
  private events: LearningEvent[] = [];
  private readonly STORAGE_KEY = 'tuReader_adaptiveLearning';

  constructor(userId: string) {
    this.userModel = this.initializeUserModel(userId);
    this.loadFromStorage();
  }

  private initializeUserModel(userId: string): IntelligentUserModel {
    return {
      userId,
      sessionId: this.generateSessionId(),
      
      // Smart defaults
      experienceLevel: 'beginner',
      preferredMode: 'training', // Start with active learning
      learningStyle: 'integrated', // Assume comprehensive approach initially
      
      patternStrengthScores: {},
      recentSuccessRate: 0.5, // Neutral starting point
      preferredPatterns: [],
      strugglingPatterns: [],
      
      contentDomains: [],
      optimalComplexityLevel: 3, // Start moderate
      attentionSpan: 15, // Conservative 15 minutes
      
      metaphorPreferences: {},
      speechPreferences: {
        preferredVoice: 'default',
        speechRate: 1.0,
        autoReadEnabled: false,
        metaphorComplexity: 'moderate'
      },
      visualPreferences: {
        preferredColors: ['#3b82f6', '#10b981', '#f59e0b'],
        animationSpeed: 'normal',
        densityPreference: 'moderate'
      },
      
      engagementTrends: [],
      learningVelocity: 0,
      totalTimeSpent: 0,
      streakData: {
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date().toISOString().split('T')[0]
      },
      
      lastUpdated: Date.now(),
      confidence: 0.1, // Very low confidence initially
      adaptationHistory: []
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record a learning event and update the user model
   */
  recordEvent(event: Omit<LearningEvent, 'userId' | 'sessionId'>): void {
    const fullEvent: LearningEvent = {
      ...event,
      userId: this.userModel.userId,
      sessionId: this.userModel.sessionId
    };

    this.events.push(fullEvent);
    this.updateUserModel(fullEvent);
    this.saveToStorage();

    console.log('📊 Learning event recorded:', fullEvent.action, {
      pattern: fullEvent.patternId,
      success: fullEvent.successScore,
      confidence: this.userModel.confidence
    });
  }

  /**
   * Update user model based on learning event
   */
  private updateUserModel(event: LearningEvent): void {
    const now = Date.now();
    
    // Update experience level based on pattern mastery
    this.updateExperienceLevel();
    
    // Update pattern-specific scores
    if (event.patternId && event.successScore !== undefined) {
      this.updatePatternMastery(event.patternId, event.successScore);
    }
    
    // Update engagement tracking
    if (event.timeSpent) {
      this.updateEngagement(event);
    }
    
    // Update learning velocity
    this.updateLearningVelocity();
    
    // Update content domain preferences
    this.updateContentPreferences(event.contextData);
    
    // Increase model confidence gradually
    this.userModel.confidence = Math.min(1.0, this.userModel.confidence + 0.01);
    this.userModel.lastUpdated = now;
  }

  private updateExperienceLevel(): void {
    const avgMastery = this.getAveragePatternMastery();
    const totalPatterns = Object.keys(this.userModel.patternStrengthScores).length;
    
    let newLevel: UserExperienceLevel;
    
    if (totalPatterns < 3 || avgMastery < 40) {
      newLevel = 'beginner';
    } else if (totalPatterns < 8 || avgMastery < 70) {
      newLevel = 'intermediate';
    } else {
      newLevel = 'expert';
    }

    if (newLevel !== this.userModel.experienceLevel) {
      this.recordAdaptation('level_adjustment', this.userModel.experienceLevel, newLevel, 
        `Pattern mastery progression: ${avgMastery.toFixed(1)}% across ${totalPatterns} patterns`);
      this.userModel.experienceLevel = newLevel;
    }
  }

  private updatePatternMastery(patternId: string, successScore: number): void {
    const currentScore = this.userModel.patternStrengthScores[patternId] || 50;
    
    // Weighted update: recent performance has more impact
    const newScore = currentScore * 0.7 + successScore * 0.3;
    this.userModel.patternStrengthScores[patternId] = Math.round(newScore);
    
    // Update preferred/struggling pattern lists
    this.updatePatternPreferences();
    
    // Update recent success rate
    const recentEvents = this.events.slice(-10).filter(e => e.successScore !== undefined);
    if (recentEvents.length > 0) {
      this.userModel.recentSuccessRate = 
        recentEvents.reduce((sum, e) => sum + (e.successScore || 0), 0) / (recentEvents.length * 100);
    }
  }

  private updatePatternPreferences(): void {
    const patterns = Object.entries(this.userModel.patternStrengthScores)
      .sort(([,a], [,b]) => b - a);
    
    this.userModel.preferredPatterns = patterns.slice(0, 5).map(([id]) => id);
    this.userModel.strugglingPatterns = patterns.slice(-3).filter(([,score]) => score < 60).map(([id]) => id);
  }

  private updateEngagement(event: LearningEvent): void {
    const engagement: EngagementData = {
      timestamp: event.timestamp,
      mode: 'training', // Inferred from context
      duration: event.timeSpent || 0,
      actionsPerMinute: 60 / (event.timeSpent || 60), // Rough estimate
      completionRate: (event.successScore || 0) / 100
    };

    this.userModel.engagementTrends.push(engagement);
    
    // Keep only last 50 engagement records
    if (this.userModel.engagementTrends.length > 50) {
      this.userModel.engagementTrends = this.userModel.engagementTrends.slice(-50);
    }
    
    this.userModel.totalTimeSpent += event.timeSpent || 0;
  }

  private updateLearningVelocity(): void {
    if (this.events.length < 5) return;
    
    const recentEvents = this.events.slice(-10);
    const timeSpan = recentEvents[recentEvents.length - 1].timestamp - recentEvents[0].timestamp;
    
    if (timeSpan > 0) {
      const improvementEvents = recentEvents.filter(e => e.successScore && e.successScore > 70);
      this.userModel.learningVelocity = (improvementEvents.length / recentEvents.length) * 
                                       (3600000 / timeSpan); // Events per hour
    }
  }

  private updateContentPreferences(contextData: LearningEvent['contextData']): void {
    if (contextData.domain && !this.userModel.contentDomains.includes(contextData.domain)) {
      this.userModel.contentDomains.push(contextData.domain);
    }
  }

  private recordAdaptation(type: AdaptationEvent['type'], previousValue: any, 
                          newValue: any, reason: string): void {
    const adaptation: AdaptationEvent = {
      timestamp: Date.now(),
      type,
      previousValue,
      newValue,
      reason,
      confidence: this.userModel.confidence
    };
    
    this.userModel.adaptationHistory.push(adaptation);
    
    // Keep only last 20 adaptations
    if (this.userModel.adaptationHistory.length > 20) {
      this.userModel.adaptationHistory = this.userModel.adaptationHistory.slice(-20);
    }
  }

  /**
   * Get intelligent recommendations
   */
  recommendNextMode(currentMode: ReaderMode, contextData: any): ModeRecommendation {
    const { experienceLevel, recentSuccessRate, engagementTrends } = this.userModel;
    
    // Calculate mode scores based on user state
    const modeScores = {
      exploration: this.calculateExplorationScore(currentMode, contextData),
      training: this.calculateTrainingScore(currentMode, contextData),
      butler: this.calculateButlerScore(currentMode, contextData)
    };
    
    const bestMode = Object.entries(modeScores)
      .sort(([,a], [,b]) => b - a)[0][0] as ReaderMode;
    
    return {
      recommendedMode: bestMode,
      confidence: this.userModel.confidence * modeScores[bestMode],
      reasons: this.generateModeReasons(bestMode, currentMode),
      expectedEngagement: modeScores[bestMode] * 0.8,
      learningBenefit: modeScores[bestMode] * 0.9
    };
  }

  private calculateExplorationScore(currentMode: ReaderMode, contextData: any): number {
    let score = 0.5; // Base score
    
    // Boost for beginners
    if (this.userModel.experienceLevel === 'beginner') score += 0.3;
    
    // Boost if struggling with patterns
    if (this.userModel.strugglingPatterns.length > 2) score += 0.2;
    
    // Reduce if already in exploration
    if (currentMode === 'exploration') score -= 0.3;
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateTrainingScore(currentMode: ReaderMode, contextData: any): number {
    let score = 0.7; // Generally preferred
    
    // Boost for intermediate users
    if (this.userModel.experienceLevel === 'intermediate') score += 0.2;
    
    // Boost if recent success rate is moderate (room for improvement)
    if (this.userModel.recentSuccessRate > 0.3 && this.userModel.recentSuccessRate < 0.8) {
      score += 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateButlerScore(currentMode: ReaderMode, contextData: any): number {
    let score = 0.4; // Lower base score, more specialized
    
    // Boost for experts or users with high mastery
    if (this.userModel.experienceLevel === 'expert') score += 0.3;
    
    // Boost for visual learners
    if (this.userModel.learningStyle === 'visual') score += 0.2;
    
    // Boost if user has shown preference for metaphors
    const avgMetaphorRating = Object.values(this.userModel.metaphorPreferences)
      .reduce((sum, rating) => sum + rating, 0) / Object.keys(this.userModel.metaphorPreferences).length;
    if (avgMetaphorRating > 3.5) score += 0.3;
    
    return Math.max(0, Math.min(1, score));
  }

  private generateModeReasons(recommendedMode: ReaderMode, currentMode: ReaderMode): string[] {
    const reasons: string[] = [];
    
    switch (recommendedMode) {
      case 'exploration':
        if (this.userModel.experienceLevel === 'beginner') {
          reasons.push('Perfect for building foundational pattern recognition');
        }
        if (this.userModel.strugglingPatterns.length > 0) {
          reasons.push('Explore patterns you\'re still mastering');
        }
        break;
        
      case 'training':
        reasons.push('Active practice will improve your pattern mastery');
        if (this.userModel.recentSuccessRate < 0.7) {
          reasons.push('Focused training will boost your success rate');
        }
        break;
        
      case 'butler':
        if (this.userModel.experienceLevel === 'expert') {
          reasons.push('Advanced analysis perfect for your skill level');
        }
        reasons.push('Butler metaphors will deepen your understanding');
        break;
    }
    
    return reasons;
  }

  /**
   * Predict learning outcomes
   */
  predictPatternSuccess(patternId: string, contextData: any): LearningPrediction {
    const currentMastery = this.userModel.patternStrengthScores[patternId] || 50;
    const avgMastery = this.getAveragePatternMastery();
    
    // Predict success based on current mastery and overall performance
    let predictedSuccess = (currentMastery + avgMastery) / 200;
    
    // Adjust based on recent performance
    predictedSuccess = predictedSuccess * 0.7 + this.userModel.recentSuccessRate * 0.3;
    
    // Determine recommended approach
    let recommendedApproach: LearningPrediction['recommendedApproach'];
    if (currentMastery < 40) {
      recommendedApproach = 'scaffolding';
    } else if (currentMastery < 70) {
      recommendedApproach = 'direct_practice';
    } else {
      recommendedApproach = 'review_first';
    }
    
    // Estimate time to mastery
    const timeToMastery = Math.max(5, (100 - currentMastery) * 0.5);
    
    return {
      patternId,
      predictedSuccessRate: Math.max(0, Math.min(1, predictedSuccess)),
      recommendedApproach,
      estimatedTimeToMastery: timeToMastery
    };
  }

  /**
   * Utility methods
   */
  getUserModel(): IntelligentUserModel {
    return { ...this.userModel };
  }

  getAveragePatternMastery(): number {
    const scores = Object.values(this.userModel.patternStrengthScores);
    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 50;
  }

  getEngagementTrend(): 'improving' | 'stable' | 'declining' {
    const recent = this.userModel.engagementTrends.slice(-5);
    if (recent.length < 3) return 'stable';
    
    const avgEarly = recent.slice(0, Math.floor(recent.length / 2))
      .reduce((sum, e) => sum + e.completionRate, 0) / Math.floor(recent.length / 2);
    const avgLate = recent.slice(Math.floor(recent.length / 2))
      .reduce((sum, e) => sum + e.completionRate, 0) / Math.ceil(recent.length / 2);
    
    const improvement = avgLate - avgEarly;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Storage management
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const data = {
        userModel: this.userModel,
        events: this.events.slice(-100) // Keep last 100 events
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save adaptive learning data:', error);
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.userModel && data.userModel.userId === this.userModel.userId) {
          this.userModel = { ...this.userModel, ...data.userModel };
          this.events = data.events || [];
          console.log('📊 Adaptive learning data loaded:', {
            confidence: this.userModel.confidence,
            experienceLevel: this.userModel.experienceLevel,
            totalEvents: this.events.length
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load adaptive learning data:', error);
    }
  }

  /**
   * Reset user model (for testing or new users)
   */
  reset(): void {
    this.userModel = this.initializeUserModel(this.userModel.userId);
    this.events = [];
    this.saveToStorage();
  }
}

// Singleton instance for the app
let adaptiveLearningEngineInstance: AdaptiveLearningEngine | null = null;

export function getAdaptiveLearningEngine(userId: string): AdaptiveLearningEngine {
  if (!adaptiveLearningEngineInstance || adaptiveLearningEngineInstance.getUserModel().userId !== userId) {
    adaptiveLearningEngineInstance = new AdaptiveLearningEngine(userId);
  }
  return adaptiveLearningEngineInstance;
}
