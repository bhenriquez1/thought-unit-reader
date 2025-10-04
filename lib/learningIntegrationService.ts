/**
 * Learning Integration Service
 * Manages cross-platform learning data and AI insights for DAT preparation
 */

import { protocolHandler } from './protocolHandler';
import { saveBootcampProgress, loadBootcampProgress } from './firebase';
import { aiLearningEngine } from './aiLearningEngine';

export interface ExternalLearningSession {
  id: string;
  source: 'datbootcamp' | 'thought-unit' | 'patterns' | 'external';
  userId: string;
  startTime: string;
  endTime?: string;
  duration: number; // minutes
  section: string;
  topic?: string;
  resourceId?: string;
  completed: boolean;
  score?: number;
  progress?: number;
  interactions: {
    type: 'view' | 'practice' | 'review' | 'mistake' | 'mastery';
    timestamp: string;
    data?: any;
  }[];
  aiInsights?: string[];
  nextRecommendations?: string[];
}

export interface LearningAnalytics {
  userId: string;
  totalStudyTime: number;
  patternsLearned: number;
  bootcampSessions: number;
  thoughtUnitSessions: number;
  weeklyProgress: number;
  currentStreak: number;
  strongAreas: string[];
  focusAreas: string[];
  aiInsights: string[];
  learningVelocity: number; // patterns per hour
  retentionRate: number; // percentage
  recommendedActions: {
    type: 'review' | 'practice' | 'learn' | 'bootcamp';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedTime: number;
  }[];
}

class LearningIntegrationService {
  private currentSession: ExternalLearningSession | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private analyticsCache: LearningAnalytics | null = null;
  private cacheExpiry: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize() {
    // Listen for protocol returns from external resources
    window.addEventListener('message', (event) => {
      if (event.data.type === 'EXTERNAL_LEARNING_DATA') {
        this.handleExternalLearningData(event.data.payload);
      }
    });

    // Resume any incomplete sessions
    this.resumeIncompleteSession();
  }

  /**
   * Start tracking a new learning session
   */
  public startLearningSession(
    source: ExternalLearningSession['source'],
    section: string,
    options: {
      topic?: string;
      resourceId?: string;
      userId?: string;
    } = {}
  ): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      source,
      userId: options.userId || 'current-user',
      startTime: new Date().toISOString(),
      duration: 0,
      section,
      topic: options.topic,
      resourceId: options.resourceId,
      completed: false,
      interactions: [],
      aiInsights: [],
      nextRecommendations: []
    };

    // Start session timer
    this.sessionTimer = setInterval(() => {
      if (this.currentSession) {
        this.currentSession.duration += 1; // Increment by minute
        this.saveLearningSession(this.currentSession, false); // Auto-save
      }
    }, 60000); // Every minute

    // Store in localStorage for persistence
    this.saveLearningSession(this.currentSession, false);

    console.log('🎓 Learning session started:', sessionId, { source, section });
    return sessionId;
  }

  /**
   * Add an interaction to the current session
   */
  public trackInteraction(
    type: ExternalLearningSession['interactions'][0]['type'],
    data?: any
  ) {
    if (!this.currentSession) return;

    this.currentSession.interactions.push({
      type,
      timestamp: new Date().toISOString(),
      data
    });

    // Trigger AI analysis for significant interactions
    if (['mistake', 'mastery', 'review'].includes(type)) {
      this.triggerAIAnalysis();
    }
  }

  /**
   * Trigger AI analysis for current session
   */
  private triggerAIAnalysis() {
    if (!this.currentSession) return;

    // Debounced AI analysis to avoid excessive calls
    setTimeout(() => {
      this.generateSessionInsights(this.currentSession!).catch(error => {
        console.warn('AI analysis failed:', error);
      });
    }, 1000);
  }

  /**
   * End the current learning session
   */
  public async endLearningSession(
    completed: boolean = true,
    score?: number,
    progress?: number
  ): Promise<ExternalLearningSession | null> {
    if (!this.currentSession) return null;

    // Stop timer
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }

    // Finalize session
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.completed = completed;
    if (score !== undefined) this.currentSession.score = score;
    if (progress !== undefined) this.currentSession.progress = progress;

    // Generate AI insights
    await this.generateSessionInsights(this.currentSession);

    // Save final session
    await this.saveLearningSession(this.currentSession, true);

    // Update analytics
    this.invalidateAnalyticsCache();

    const completedSession = { ...this.currentSession };
    this.currentSession = null;

    console.log('✅ Learning session completed:', completedSession.id);
    return completedSession;
  }

  /**
   * Handle external learning data from DAT Bootcamp or other sources
   */
  public async handleExternalLearningData(data: any) {
    try {
      const externalSession: ExternalLearningSession = {
        id: `external_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        source: data.source || 'external',
        userId: data.userId || 'current-user',
        startTime: data.startTime || new Date().toISOString(),
        endTime: data.endTime || new Date().toISOString(),
        duration: data.duration || 0,
        section: data.section || 'unknown',
        topic: data.topic,
        resourceId: data.resourceId,
        completed: data.completed || false,
        score: data.score,
        progress: data.progress,
        interactions: data.interactions || [],
        aiInsights: [],
        nextRecommendations: []
      };

      // Generate AI insights
      await this.generateSessionInsights(externalSession);

      // Save session
      await this.saveLearningSession(externalSession, true);

      // Invalidate cache
      this.invalidateAnalyticsCache();

      console.log('🔗 External learning data processed:', externalSession.id);
      return externalSession;
    } catch (error) {
      console.error('❌ Failed to handle external learning data:', error);
      return null;
    }
  }

  /**
   * Generate AI insights for a learning session
   */
  private async generateSessionInsights(session: ExternalLearningSession) {
    try {
      const insights: string[] = [];

      // Duration-based insights
      if (session.duration < 15) {
        insights.push('Consider longer study sessions for better retention');
      } else if (session.duration > 120) {
        insights.push('Great dedication! Remember to take breaks for optimal learning');
      }

      // Score-based insights
      if (session.score !== undefined) {
        if (session.score >= 90) {
          insights.push(`Excellent work on ${session.section}! Consider advancing to harder material`);
        } else if (session.score < 70) {
          insights.push(`Focus more practice needed in ${session.section}`);
        }
      }

      // Interaction-based insights
      const mistakes = session.interactions.filter(i => i.type === 'mistake').length;
      const reviews = session.interactions.filter(i => i.type === 'review').length;
      
      if (mistakes > reviews) {
        insights.push('Consider reviewing mistakes more thoroughly before moving on');
      }

      // Source-specific insights
      if (session.source === 'datbootcamp') {
        insights.push('Great use of DAT Bootcamp resources! Sync with Thought Unit Reader for enhanced comprehension');
      }

      session.aiInsights = insights;

      // Generate next recommendations using AI engine
      try {
        const recommendations = await this.generateRecommendations(session);
        session.nextRecommendations = recommendations;
      } catch (error) {
        console.warn('Failed to generate AI recommendations:', error);
      }
    } catch (error) {
      console.error('Failed to generate session insights:', error);
    }
  }

  /**
   * Generate learning recommendations using AI
   */
  private async generateRecommendations(session: ExternalLearningSession): Promise<string[]> {
    try {
      // Use AI learning engine if available
      if (aiLearningEngine && typeof (aiLearningEngine as any).generateRecommendations === 'function') {
        const recommendations = await (aiLearningEngine as any).generateRecommendations({
          section: session.section,
          score: session.score,
          duration: session.duration,
          interactions: session.interactions,
          weakAreas: [] // TODO: Calculate from historical data
        });

        return recommendations.map((r: any) => r.description || r);
      }
    } catch (error) {
      console.warn('AI recommendations not available:', error);
    }

    // Fallback recommendations
    const fallbackRecommendations = [
      'Continue practicing current section',
      'Review any mistakes thoroughly',
      'Consider spaced repetition for better retention'
    ];

    // Add section-specific recommendations
    if (session.section === 'PAT') {
      fallbackRecommendations.push('Practice spatial visualization exercises');
    } else if (session.section === 'Organic Chemistry') {
      fallbackRecommendations.push('Review reaction mechanisms and CARDIO method');
    }

    return fallbackRecommendations.slice(0, 3);
  }

  /**
   * Save learning session to storage
   */
  private async saveLearningSession(session: ExternalLearningSession, final: boolean) {
    try {
      // Save to localStorage
      const storageKey = final ? 'completed_learning_sessions' : 'current_learning_session';
      
      if (final) {
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        existing.push(session);
        
        // Keep only last 100 sessions
        if (existing.length > 100) {
          existing.splice(0, existing.length - 100);
        }
        
        localStorage.setItem(storageKey, JSON.stringify(existing));
        
        // Remove current session
        localStorage.removeItem('current_learning_session');
      } else {
        localStorage.setItem(storageKey, JSON.stringify(session));
      }

      // Save to Firebase if available and session is complete
      if (final && session.source === 'datbootcamp') {
        try {
          await saveBootcampProgress(session.userId, session);
        } catch (error) {
          console.warn('Failed to save to Firebase:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save learning session:', error);
    }
  }

  /**
   * Resume incomplete session from localStorage
   */
  private resumeIncompleteSession() {
    try {
      const currentSession = localStorage.getItem('current_learning_session');
      if (currentSession) {
        this.currentSession = JSON.parse(currentSession);
        
        // Restart timer
        this.sessionTimer = setInterval(() => {
          if (this.currentSession) {
            this.currentSession.duration += 1;
            this.saveLearningSession(this.currentSession, false);
          }
        }, 60000);

        console.log('🔄 Resumed learning session:', this.currentSession?.id);
      }
    } catch (error) {
      console.warn('Failed to resume session:', error);
    }
  }

  /**
   * Get comprehensive learning analytics
   */
  public async getLearningAnalytics(userId: string = 'current-user'): Promise<LearningAnalytics> {
    // Check cache
    if (this.analyticsCache && Date.now() < this.cacheExpiry) {
      return this.analyticsCache;
    }

    try {
      // Load all sessions
      const completedSessions = JSON.parse(localStorage.getItem('completed_learning_sessions') || '[]');
      const bootcampSessions = await loadBootcampProgress(userId);

      const allSessions = [...completedSessions, ...bootcampSessions];
      
      // Calculate analytics
      const totalStudyTime = allSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const bootcampSessionCount = allSessions.filter(s => s.source === 'datbootcamp').length;
      const thoughtUnitSessionCount = allSessions.filter(s => s.source === 'thought-unit').length;
      
      // Calculate patterns learned (mock calculation)
      const uniqueSections = new Set(allSessions.map(s => s.section));
      const patternsLearned = uniqueSections.size * 2; // Rough estimate

      // Calculate weekly progress
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentSessions = allSessions.filter(s => new Date(s.startTime) > oneWeekAgo);
      const weeklyProgress = recentSessions.length > 0 ? 
        (recentSessions.length / allSessions.length) * 100 : 0;

      // Calculate streak
      const currentStreak = this.calculateLearningStreak(allSessions);

      // Identify strong and focus areas
      const sectionPerformance = this.analyzeSectionPerformance(allSessions);
      const strongAreas = sectionPerformance
        .filter(s => s.averageScore >= 80)
        .map(s => s.section);
      const focusAreas = sectionPerformance
        .filter(s => s.averageScore < 70)
        .map(s => s.section);

      // Generate AI insights
      const aiInsights = this.generateAnalyticsInsights(allSessions, {
        totalStudyTime,
        patternsLearned,
        weeklyProgress,
        strongAreas,
        focusAreas
      });

      // Generate recommended actions
      const recommendedActions = this.generateRecommendedActions(allSessions, focusAreas);

      const analytics: LearningAnalytics = {
        userId,
        totalStudyTime,
        patternsLearned,
        bootcampSessions: bootcampSessionCount,
        thoughtUnitSessions: thoughtUnitSessionCount,
        weeklyProgress,
        currentStreak,
        strongAreas,
        focusAreas,
        aiInsights,
        learningVelocity: totalStudyTime > 0 ? (patternsLearned / (totalStudyTime / 60)) : 0,
        retentionRate: this.calculateRetentionRate(allSessions),
        recommendedActions
      };

      // Cache for 5 minutes
      this.analyticsCache = analytics;
      this.cacheExpiry = Date.now() + 5 * 60 * 1000;

      return analytics;
    } catch (error) {
      console.error('Failed to calculate learning analytics:', error);
      
      // Return default analytics
      return {
        userId,
        totalStudyTime: 0,
        patternsLearned: 0,
        bootcampSessions: 0,
        thoughtUnitSessions: 0,
        weeklyProgress: 0,
        currentStreak: 0,
        strongAreas: [],
        focusAreas: [],
        aiInsights: [],
        learningVelocity: 0,
        retentionRate: 0,
        recommendedActions: []
      };
    }
  }

  private calculateLearningStreak(sessions: ExternalLearningSession[]): number {
    // Calculate consecutive days with learning activity
    const today = new Date();
    let streak = 0;
    let checkDate = new Date(today);

    while (true) {
      const dayStart = new Date(checkDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(checkDate);
      dayEnd.setHours(23, 59, 59, 999);

      const hasSessions = sessions.some(session => {
        const sessionDate = new Date(session.startTime);
        return sessionDate >= dayStart && sessionDate <= dayEnd;
      });

      if (hasSessions) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  private analyzeSectionPerformance(sessions: ExternalLearningSession[]): Array<{
    section: string;
    averageScore: number;
    sessionCount: number;
  }> {
    const sectionMap = new Map<string, { scores: number[]; count: number }>();

    sessions.forEach(session => {
      if (!sectionMap.has(session.section)) {
        sectionMap.set(session.section, { scores: [], count: 0 });
      }

      const sectionData = sectionMap.get(session.section)!;
      sectionData.count++;
      if (session.score !== undefined) {
        sectionData.scores.push(session.score);
      }
    });

    return Array.from(sectionMap.entries()).map(([section, data]) => ({
      section,
      averageScore: data.scores.length > 0 ? 
        data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length : 0,
      sessionCount: data.count
    }));
  }

  private generateAnalyticsInsights(
    sessions: ExternalLearningSession[],
    metrics: any
  ): string[] {
    const insights: string[] = [];

    if (metrics.totalStudyTime > 1000) {
      insights.push('Excellent dedication! You\'ve put in serious study time');
    }

    if (metrics.weeklyProgress > 50) {
      insights.push('Great momentum this week! Keep up the excellent work');
    }

    if (metrics.strongAreas.length > metrics.focusAreas.length) {
      insights.push('You have more strengths than weaknesses - great foundation!');
    }

    if (sessions.filter(s => s.source === 'datbootcamp').length > 10) {
      insights.push('Excellent use of DAT Bootcamp! Consider integrating more with Thought Unit Reader');
    }

    return insights;
  }

  private generateRecommendedActions(
    sessions: ExternalLearningSession[],
    focusAreas: string[]
  ): LearningAnalytics['recommendedActions'] {
    const actions: LearningAnalytics['recommendedActions'] = [];

    // Focus area recommendations
    focusAreas.forEach(area => {
      actions.push({
        type: 'practice',
        priority: 'high',
        description: `Intensive practice in ${area}`,
        estimatedTime: 60
      });
    });

    // Review recommendations
    const recentMistakes = sessions
      .filter(s => s.interactions.some(i => i.type === 'mistake'))
      .slice(-5);

    if (recentMistakes.length > 0) {
      actions.push({
        type: 'review',
        priority: 'high',
        description: 'Review recent mistakes with TU explanations',
        estimatedTime: 30
      });
    }

    // Bootcamp integration
    const bootcampSessions = sessions.filter(s => s.source === 'datbootcamp').length;
    const thoughtUnitSessions = sessions.filter(s => s.source === 'thought-unit').length;

    if (bootcampSessions > thoughtUnitSessions * 2) {
      actions.push({
        type: 'learn',
        priority: 'medium',
        description: 'Use Thought Unit Reader for deeper comprehension',
        estimatedTime: 45
      });
    }

    return actions.slice(0, 5); // Limit to top 5 actions
  }

  private calculateRetentionRate(sessions: ExternalLearningSession[]): number {
    // Simple retention calculation based on review vs new content ratio
    const reviewSessions = sessions.filter(s => 
      s.interactions.some(i => i.type === 'review')
    ).length;
    
    return sessions.length > 0 ? (reviewSessions / sessions.length) * 100 : 0;
  }

  private invalidateAnalyticsCache() {
    this.analyticsCache = null;
    this.cacheExpiry = 0;
  }

  // Public API methods
  public getCurrentSession(): ExternalLearningSession | null {
    return this.currentSession;
  }

  public isSessionActive(): boolean {
    return this.currentSession !== null;
  }
}

// Export singleton instance
export const learningIntegrationService = new LearningIntegrationService();

// Export utility functions
export const startLearningTracking = (
  source: ExternalLearningSession['source'],
  section: string,
  options?: Parameters<typeof learningIntegrationService.startLearningSession>[2]
) => {
  return learningIntegrationService.startLearningSession(source, section, options);
};

export const trackLearningInteraction = (
  type: ExternalLearningSession['interactions'][0]['type'],
  data?: any
) => {
  learningIntegrationService.trackInteraction(type, data);
};

export const endLearningTracking = (
  completed?: boolean,
  score?: number,
  progress?: number
) => {
  return learningIntegrationService.endLearningSession(completed, score, progress);
};

export const getLearningAnalytics = (userId?: string) => {
  return learningIntegrationService.getLearningAnalytics(userId);
};
