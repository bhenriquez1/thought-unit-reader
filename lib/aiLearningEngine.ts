/**
 * AI Learning Engine for Thought Unit Reader
 * Implements machine learning capabilities to improve thought unit accuracy
 * based on user feedback and interaction patterns
 */

export interface UserFeedback {
  id: string;
  userId: string;
  bookId: string;
  thoughtUnitId: string;
  feedbackType: 'correct' | 'incorrect' | 'partial' | 'missing';
  originalText: string;
  correctedText?: string;
  confidence: number;
  timestamp: number;
  context: {
    pageNumber: number;
    chunkIndex: number;
    surroundingText: string;
    documentType: string;
  };
}

export interface LearningModel {
  userId: string;
  personalizedThresholds: {
    mainIdeaConfidence: number;
    supportingDetailConfidence: number;
    highlightSensitivity: 'minimal' | 'moderate' | 'detailed';
  };
  domainPreferences: {
    [domain: string]: {
      preferredPatterns: string[];
      avoidedPatterns: string[];
      optimalChunkSize: number;
    };
  };
  readingPatterns: {
    averageReadingSpeed: number;
    preferredComplexity: 'simple' | 'moderate' | 'complex';
    focusAreas: string[];
  };
  accuracyMetrics: {
    totalFeedbacks: number;
    correctPredictions: number;
    falsePositives: number;
    falseNegatives: number;
    overallAccuracy: number;
  };
  lastUpdated: number;
}

export interface AdaptiveThresholds {
  mainIdeaConfidence: number;
  supportingDetailConfidence: number;
  transitionConfidence: number;
  maxMainIdeasPerPage: number;
  chunkSizeMultiplier: number;
}

class AILearningEngine {
  private feedbackHistory: Map<string, UserFeedback[]> = new Map();
  private userModels: Map<string, LearningModel> = new Map();
  private adaptiveThresholds: Map<string, AdaptiveThresholds> = new Map();

  constructor() {
    this.loadStoredData();
  }

  // Collect user feedback on thought unit accuracy
  async collectFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp'>): Promise<void> {
    const feedbackWithId: UserFeedback = {
      ...feedback,
      id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    // Store feedback
    const userFeedbacks = this.feedbackHistory.get(feedback.userId) || [];
    userFeedbacks.push(feedbackWithId);
    this.feedbackHistory.set(feedback.userId, userFeedbacks);

    // Update user model
    await this.updateUserModel(feedback.userId, feedbackWithId);

    // Adapt thresholds based on feedback
    await this.adaptThresholds(feedback.userId);

    // Persist data
    await this.persistData();

    console.log(`🧠 AI Learning: Collected feedback for user ${feedback.userId}`);
  }

  // Update user's personalized learning model
  private async updateUserModel(userId: string, feedback: UserFeedback): Promise<void> {
    let model = this.userModels.get(userId);
    
    if (!model) {
      model = this.createInitialUserModel(userId);
    }

    // Update accuracy metrics
    model.accuracyMetrics.totalFeedbacks++;
    
    if (feedback.feedbackType === 'correct') {
      model.accuracyMetrics.correctPredictions++;
    } else if (feedback.feedbackType === 'incorrect') {
      if (feedback.confidence > 0.7) {
        model.accuracyMetrics.falsePositives++;
      } else {
        model.accuracyMetrics.falseNegatives++;
      }
    }

    // Recalculate overall accuracy
    model.accuracyMetrics.overallAccuracy = 
      model.accuracyMetrics.correctPredictions / model.accuracyMetrics.totalFeedbacks;

    // Adapt thresholds based on feedback patterns
    this.adaptPersonalizedThresholds(model, feedback);

    // Update domain preferences
    this.updateDomainPreferences(model, feedback);

    // Update reading patterns
    this.updateReadingPatterns(model, feedback);

    model.lastUpdated = Date.now();
    this.userModels.set(userId, model);
  }

  // Create initial user model with default settings
  private createInitialUserModel(userId: string): LearningModel {
    return {
      userId,
      personalizedThresholds: {
        mainIdeaConfidence: 0.85,
        supportingDetailConfidence: 0.6,
        highlightSensitivity: 'moderate'
      },
      domainPreferences: {},
      readingPatterns: {
        averageReadingSpeed: 200,
        preferredComplexity: 'moderate',
        focusAreas: []
      },
      accuracyMetrics: {
        totalFeedbacks: 0,
        correctPredictions: 0,
        falsePositives: 0,
        falseNegatives: 0,
        overallAccuracy: 0
      },
      lastUpdated: Date.now()
    };
  }

  // Adapt personalized thresholds based on feedback
  private adaptPersonalizedThresholds(model: LearningModel, feedback: UserFeedback): void {
    const adjustmentFactor = 0.05; // Small incremental adjustments

    if (feedback.feedbackType === 'incorrect' && feedback.confidence > 0.8) {
      // False positive - increase threshold to be more selective
      model.personalizedThresholds.mainIdeaConfidence += adjustmentFactor;
      model.personalizedThresholds.mainIdeaConfidence = Math.min(0.95, model.personalizedThresholds.mainIdeaConfidence);
    } else if (feedback.feedbackType === 'missing') {
      // False negative - decrease threshold to be more inclusive
      model.personalizedThresholds.mainIdeaConfidence -= adjustmentFactor;
      model.personalizedThresholds.mainIdeaConfidence = Math.max(0.5, model.personalizedThresholds.mainIdeaConfidence);
    }

    // Adjust sensitivity based on user preferences
    if (model.accuracyMetrics.falsePositives > model.accuracyMetrics.falseNegatives * 2) {
      model.personalizedThresholds.highlightSensitivity = 'minimal';
    } else if (model.accuracyMetrics.falseNegatives > model.accuracyMetrics.falsePositives * 2) {
      model.personalizedThresholds.highlightSensitivity = 'detailed';
    }
  }

  // Update domain-specific preferences
  private updateDomainPreferences(model: LearningModel, feedback: UserFeedback): void {
    const domain = this.inferDomain(feedback.originalText, feedback.context.documentType);
    
    if (!model.domainPreferences[domain]) {
      model.domainPreferences[domain] = {
        preferredPatterns: [],
        avoidedPatterns: [],
        optimalChunkSize: 240
      };
    }

    const domainPref = model.domainPreferences[domain];

    // Extract patterns from feedback
    const patterns = this.extractTextPatterns(feedback.originalText);

    if (feedback.feedbackType === 'correct') {
      // Add successful patterns
      patterns.forEach(pattern => {
        if (!domainPref.preferredPatterns.includes(pattern)) {
          domainPref.preferredPatterns.push(pattern);
        }
      });
    } else if (feedback.feedbackType === 'incorrect') {
      // Add patterns to avoid
      patterns.forEach(pattern => {
        if (!domainPref.avoidedPatterns.includes(pattern)) {
          domainPref.avoidedPatterns.push(pattern);
        }
      });
    }

    // Limit array sizes to prevent memory bloat
    domainPref.preferredPatterns = domainPref.preferredPatterns.slice(-20);
    domainPref.avoidedPatterns = domainPref.avoidedPatterns.slice(-20);
  }

  // Update reading patterns based on user behavior
  private updateReadingPatterns(model: LearningModel, feedback: UserFeedback): void {
    // Infer complexity preference from feedback
    const textComplexity = this.analyzeTextComplexity(feedback.originalText);
    
    if (feedback.feedbackType === 'correct') {
      // User found this complexity level appropriate
      model.readingPatterns.preferredComplexity = textComplexity;
    }

    // Extract focus areas from corrected text
    if (feedback.correctedText) {
      const focusTerms = this.extractFocusTerms(feedback.correctedText);
      focusTerms.forEach(term => {
        if (!model.readingPatterns.focusAreas.includes(term)) {
          model.readingPatterns.focusAreas.push(term);
        }
      });
      
      // Limit focus areas
      model.readingPatterns.focusAreas = model.readingPatterns.focusAreas.slice(-15);
    }
  }

  // Adapt thresholds for specific user
  private async adaptThresholds(userId: string): Promise<void> {
    const model = this.userModels.get(userId);
    if (!model) return;

    const thresholds: AdaptiveThresholds = {
      mainIdeaConfidence: model.personalizedThresholds.mainIdeaConfidence,
      supportingDetailConfidence: model.personalizedThresholds.supportingDetailConfidence,
      transitionConfidence: 0.6,
      maxMainIdeasPerPage: this.calculateOptimalMainIdeasPerPage(model),
      chunkSizeMultiplier: this.calculateOptimalChunkSizeMultiplier(model)
    };

    this.adaptiveThresholds.set(userId, thresholds);
  }

  // Calculate optimal number of main ideas per page based on user feedback
  private calculateOptimalMainIdeasPerPage(model: LearningModel): number {
    const accuracy = model.accuracyMetrics.overallAccuracy;
    
    if (accuracy > 0.8) {
      return 3; // User is satisfied with current detection, allow more
    } else if (accuracy < 0.6) {
      return 1; // User finds too many false positives, be more selective
    }
    
    return 2; // Default balanced approach
  }

  // Calculate optimal chunk size multiplier
  private calculateOptimalChunkSizeMultiplier(model: LearningModel): number {
    const complexity = model.readingPatterns.preferredComplexity;
    
    switch (complexity) {
      case 'simple':
        return 0.8; // Smaller chunks for simple content
      case 'complex':
        return 1.3; // Larger chunks for complex content
      default:
        return 1.0; // Standard size
    }
  }

  // Get adaptive thresholds for a user
  getAdaptiveThresholds(userId: string): AdaptiveThresholds {
    return this.adaptiveThresholds.get(userId) || {
      mainIdeaConfidence: 0.85,
      supportingDetailConfidence: 0.6,
      transitionConfidence: 0.6,
      maxMainIdeasPerPage: 2,
      chunkSizeMultiplier: 1.0
    };
  }

  // Get user's learning model
  getUserModel(userId: string): LearningModel | null {
    return this.userModels.get(userId) || null;
  }

  // Predict optimal settings for new content
  predictOptimalSettings(userId: string, contentSample: string, documentType: string): {
    chunkSize: number;
    sensitivity: 'minimal' | 'moderate' | 'detailed';
    focusMode: string[];
  } {
    const model = this.userModels.get(userId);
    const domain = this.inferDomain(contentSample, documentType);
    
    if (!model) {
      return {
        chunkSize: 240,
        sensitivity: 'moderate',
        focusMode: []
      };
    }

    const domainPref = model.domainPreferences[domain];
    const baseChunkSize = domainPref?.optimalChunkSize || 240;
    const thresholds = this.getAdaptiveThresholds(userId);

    return {
      chunkSize: Math.round(baseChunkSize * thresholds.chunkSizeMultiplier),
      sensitivity: model.personalizedThresholds.highlightSensitivity,
      focusMode: model.readingPatterns.focusAreas.slice(0, 5)
    };
  }

  // Utility methods
  private inferDomain(text: string, documentType: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('research') || lowerText.includes('study') || lowerText.includes('hypothesis')) {
      return 'academic';
    } else if (lowerText.includes('business') || lowerText.includes('market') || lowerText.includes('revenue')) {
      return 'business';
    } else if (lowerText.includes('technical') || lowerText.includes('algorithm') || lowerText.includes('system')) {
      return 'technical';
    } else if (lowerText.includes('history') || lowerText.includes('historical') || lowerText.includes('century')) {
      return 'history';
    } else if (lowerText.includes('science') || lowerText.includes('experiment') || lowerText.includes('theory')) {
      return 'science';
    }
    
    return documentType || 'general';
  }

  private extractTextPatterns(text: string): string[] {
    const patterns: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Common academic patterns
    if (lowerText.includes('research shows')) patterns.push('research-evidence');
    if (lowerText.includes('in conclusion')) patterns.push('conclusion-marker');
    if (lowerText.includes('for example')) patterns.push('example-marker');
    if (lowerText.includes('however')) patterns.push('contrast-marker');
    if (lowerText.includes('therefore')) patterns.push('causation-marker');
    
    // Definition patterns
    if (lowerText.includes(' is defined as ')) patterns.push('definition-pattern');
    if (lowerText.includes(' means that ')) patterns.push('explanation-pattern');
    
    return patterns;
  }

  private analyzeTextComplexity(text: string): 'simple' | 'moderate' | 'complex' {
    const wordCount = text.split(/\s+/).length;
    const avgWordLength = text.replace(/[^\w\s]/g, '').split(/\s+/).reduce((sum, word) => sum + word.length, 0) / wordCount;
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgSentenceLength = wordCount / sentenceCount;
    
    const complexityScore = (avgWordLength * 2) + (avgSentenceLength * 0.5);
    
    if (complexityScore < 12) return 'simple';
    if (complexityScore > 20) return 'complex';
    return 'moderate';
  }

  private extractFocusTerms(text: string): string[] {
    const words = text.split(/\s+/).filter(word => word.length > 4);
    const termFreq = new Map<string, number>();
    
    words.forEach(word => {
      const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
      if (cleaned.length > 4) {
        termFreq.set(cleaned, (termFreq.get(cleaned) || 0) + 1);
      }
    });
    
    return Array.from(termFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term]) => term);
  }

  // Data persistence methods
  private async loadStoredData(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const feedbackData = localStorage.getItem('thoughtunit-feedback-history');
        const modelData = localStorage.getItem('thoughtunit-user-models');
        const thresholdData = localStorage.getItem('thoughtunit-adaptive-thresholds');
        
        if (feedbackData) {
          const parsed = JSON.parse(feedbackData);
          this.feedbackHistory = new Map(Object.entries(parsed));
        }
        
        if (modelData) {
          const parsed = JSON.parse(modelData);
          this.userModels = new Map(Object.entries(parsed));
        }
        
        if (thresholdData) {
          const parsed = JSON.parse(thresholdData);
          this.adaptiveThresholds = new Map(Object.entries(parsed));
        }
      }
    } catch (error) {
      console.warn('Failed to load AI learning data:', error);
    }
  }

  private async persistData(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        // Convert Maps to objects for storage
        const feedbackObj = Object.fromEntries(this.feedbackHistory);
        const modelObj = Object.fromEntries(this.userModels);
        const thresholdObj = Object.fromEntries(this.adaptiveThresholds);
        
        localStorage.setItem('thoughtunit-feedback-history', JSON.stringify(feedbackObj));
        localStorage.setItem('thoughtunit-user-models', JSON.stringify(modelObj));
        localStorage.setItem('thoughtunit-adaptive-thresholds', JSON.stringify(thresholdObj));
      }
    } catch (error) {
      console.warn('Failed to persist AI learning data:', error);
    }
  }

  // Analytics and reporting methods
  getAccuracyReport(userId: string): {
    overallAccuracy: number;
    totalFeedbacks: number;
    recentTrend: 'improving' | 'declining' | 'stable';
    domainBreakdown: { [domain: string]: number };
  } {
    const model = this.userModels.get(userId);
    if (!model) {
      return {
        overallAccuracy: 0,
        totalFeedbacks: 0,
        recentTrend: 'stable',
        domainBreakdown: {}
      };
    }

    // Calculate recent trend (last 10 feedbacks vs previous 10)
    const feedbacks = this.feedbackHistory.get(userId) || [];
    const recentFeedbacks = feedbacks.slice(-10);
    const previousFeedbacks = feedbacks.slice(-20, -10);
    
    const recentAccuracy = recentFeedbacks.length > 0 ? 
      recentFeedbacks.filter(f => f.feedbackType === 'correct').length / recentFeedbacks.length : 0;
    const previousAccuracy = previousFeedbacks.length > 0 ? 
      previousFeedbacks.filter(f => f.feedbackType === 'correct').length / previousFeedbacks.length : 0;
    
    let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (recentAccuracy > previousAccuracy + 0.1) recentTrend = 'improving';
    else if (recentAccuracy < previousAccuracy - 0.1) recentTrend = 'declining';

    // Domain breakdown
    const domainBreakdown: { [domain: string]: number } = {};
    Object.entries(model.domainPreferences).forEach(([domain, prefs]) => {
      const domainFeedbacks = feedbacks.filter(f => 
        this.inferDomain(f.originalText, f.context.documentType) === domain
      );
      domainBreakdown[domain] = domainFeedbacks.length > 0 ? 
        domainFeedbacks.filter(f => f.feedbackType === 'correct').length / domainFeedbacks.length : 0;
    });

    return {
      overallAccuracy: model.accuracyMetrics.overallAccuracy,
      totalFeedbacks: model.accuracyMetrics.totalFeedbacks,
      recentTrend,
      domainBreakdown
    };
  }

  // Reset user model (for testing or user preference)
  resetUserModel(userId: string): void {
    this.userModels.delete(userId);
    this.adaptiveThresholds.delete(userId);
    this.feedbackHistory.delete(userId);
    this.persistData();
    console.log(`🧠 AI Learning: Reset model for user ${userId}`);
  }
}

// Export singleton instance
export const aiLearningEngine = new AILearningEngine();

// Export types and main class
export { AILearningEngine };
