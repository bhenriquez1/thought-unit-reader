// Mistake Logging System with Spaced Repetition for DAT Apex
// Tracks incorrect answers and schedules review sessions using spaced repetition algorithm

import type { DATQuestion, ExamAttempt } from '@/types/apex-exam';

export interface MistakeEntry {
  id: string;
  userId: string;
  questionId: string;
  question: DATQuestion;
  incorrectAnswer: string;
  correctAnswer: string;
  attemptId: string;
  timestamp: string;
  reviewCount: number;
  lastReviewed?: string;
  nextReviewDate: string;
  difficulty: 'easy' | 'medium' | 'hard';
  masteryLevel: number; // 0-100, increases with correct reviews
  tags: string[];
  notes?: string;
  spacedRepetitionData: {
    interval: number; // days until next review
    easeFactor: number; // SM-2 algorithm ease factor
    repetitions: number; // number of successful repetitions
  };
}

export interface ReviewSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  mistakeIds: string[];
  results: {
    mistakeId: string;
    wasCorrect: boolean;
    timeSpent: number;
    confidence: 1 | 2 | 3 | 4 | 5; // self-reported confidence
  }[];
  totalCorrect: number;
  totalReviewed: number;
  averageConfidence: number;
}

export interface MistakeStats {
  totalMistakes: number;
  reviewedMistakes: number;
  masteredMistakes: number; // mastery level >= 80
  averageMasteryLevel: number;
  streakDays: number;
  nextReviewDate: string | null;
  mistakesByTopic: Record<string, number>;
  mistakesByDifficulty: Record<string, number>;
  recentActivity: {
    date: string;
    reviewedCount: number;
    correctCount: number;
  }[];
}

class MistakeLogger {
  private storageKey = 'dat-apex-mistakes';
  private sessionsKey = 'dat-apex-review-sessions';
  private statsKey = 'dat-apex-mistake-stats';

  // SM-2 Spaced Repetition Algorithm constants
  private readonly MIN_EASE_FACTOR = 1.3;
  private readonly INITIAL_EASE_FACTOR = 2.5;
  private readonly INITIAL_INTERVAL = 1;

  /**
   * Log a mistake from an exam attempt
   */
  logMistake(
    userId: string,
    question: DATQuestion,
    incorrectAnswer: string,
    attemptId: string
  ): MistakeEntry {
    const mistakes = this.getMistakes(userId);
    
    // Check if this mistake already exists (same question, same user)
    const existingMistake = mistakes.find(m => 
      m.questionId === question.id && m.userId === userId
    );

    if (existingMistake) {
      // Update existing mistake with new attempt data
      existingMistake.incorrectAnswer = incorrectAnswer;
      existingMistake.attemptId = attemptId;
      existingMistake.timestamp = new Date().toISOString();
      existingMistake.reviewCount = 0; // Reset review count for new mistake
      existingMistake.masteryLevel = Math.max(0, existingMistake.masteryLevel - 20); // Decrease mastery
      existingMistake.nextReviewDate = this.calculateNextReviewDate(1); // Review tomorrow
      existingMistake.spacedRepetitionData = {
        interval: 1,
        easeFactor: this.INITIAL_EASE_FACTOR,
        repetitions: 0
      };
      
      this.saveMistakes(userId, mistakes);
      return existingMistake;
    }

    // Create new mistake entry
    const mistake: MistakeEntry = {
      id: `mistake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      questionId: question.id,
      question,
      incorrectAnswer,
      correctAnswer: question.correctAnswer,
      attemptId,
      timestamp: new Date().toISOString(),
      reviewCount: 0,
      nextReviewDate: this.calculateNextReviewDate(1), // Review tomorrow
      difficulty: question.difficulty,
      masteryLevel: 0,
      tags: this.generateTags(question),
      spacedRepetitionData: {
        interval: this.INITIAL_INTERVAL,
        easeFactor: this.INITIAL_EASE_FACTOR,
        repetitions: 0
      }
    };

    mistakes.push(mistake);
    this.saveMistakes(userId, mistakes);
    this.updateStats(userId);
    
    return mistake;
  }

  /**
   * Log multiple mistakes from an exam attempt
   */
  logMistakesFromAttempt(userId: string, attempt: ExamAttempt, questions: DATQuestion[]): MistakeEntry[] {
    const mistakes: MistakeEntry[] = [];
    
    attempt.responses.forEach(response => {
      const question = questions.find(q => q.id === response.questionId);
      if (question && response.selectedAnswer !== question.correctAnswer && response.selectedAnswer) {
        const mistake = this.logMistake(userId, question, response.selectedAnswer, attempt.id);
        mistakes.push(mistake);
      }
    });

    return mistakes;
  }

  /**
   * Get mistakes due for review
   */
  getMistakesDueForReview(userId: string): MistakeEntry[] {
    const mistakes = this.getMistakes(userId);
    const now = new Date();
    
    return mistakes.filter(mistake => {
      const reviewDate = new Date(mistake.nextReviewDate);
      return reviewDate <= now && mistake.masteryLevel < 80; // Not yet mastered
    }).sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
  }

  /**
   * Start a review session
   */
  startReviewSession(userId: string, mistakeIds?: string[]): ReviewSession {
    const dueMistakes = this.getMistakesDueForReview(userId);
    const selectedMistakes = mistakeIds 
      ? dueMistakes.filter(m => mistakeIds.includes(m.id))
      : dueMistakes.slice(0, 10); // Limit to 10 questions per session

    const session: ReviewSession = {
      id: `session-${Date.now()}`,
      userId,
      startTime: new Date().toISOString(),
      mistakeIds: selectedMistakes.map(m => m.id),
      results: [],
      totalCorrect: 0,
      totalReviewed: 0,
      averageConfidence: 0
    };

    return session;
  }

  /**
   * Record a review result and update spaced repetition data
   */
  recordReviewResult(
    userId: string,
    sessionId: string,
    mistakeId: string,
    wasCorrect: boolean,
    timeSpent: number,
    confidence: 1 | 2 | 3 | 4 | 5
  ): void {
    const mistakes = this.getMistakes(userId);
    const mistake = mistakes.find(m => m.id === mistakeId);
    
    if (!mistake) return;

    // Update mistake data
    mistake.reviewCount++;
    mistake.lastReviewed = new Date().toISOString();

    if (wasCorrect) {
      // Increase mastery level
      mistake.masteryLevel = Math.min(100, mistake.masteryLevel + (confidence * 5));
      
      // Update spaced repetition data using SM-2 algorithm
      const sr = mistake.spacedRepetitionData;
      sr.repetitions++;
      
      if (confidence >= 3) {
        // Successful review
        if (sr.repetitions === 1) {
          sr.interval = 1;
        } else if (sr.repetitions === 2) {
          sr.interval = 6;
        } else {
          sr.interval = Math.round(sr.interval * sr.easeFactor);
        }
        
        sr.easeFactor = sr.easeFactor + (0.1 - (5 - confidence) * (0.08 + (5 - confidence) * 0.02));
        sr.easeFactor = Math.max(this.MIN_EASE_FACTOR, sr.easeFactor);
      } else {
        // Failed review - reset
        sr.repetitions = 0;
        sr.interval = 1;
        mistake.masteryLevel = Math.max(0, mistake.masteryLevel - 10);
      }
    } else {
      // Incorrect answer - decrease mastery and reset spaced repetition
      mistake.masteryLevel = Math.max(0, mistake.masteryLevel - 15);
      mistake.spacedRepetitionData.repetitions = 0;
      mistake.spacedRepetitionData.interval = 1;
    }

    // Calculate next review date
    mistake.nextReviewDate = this.calculateNextReviewDate(mistake.spacedRepetitionData.interval);

    this.saveMistakes(userId, mistakes);
    this.updateReviewSession(sessionId, mistakeId, wasCorrect, timeSpent, confidence);
    this.updateStats(userId);
  }

  /**
   * Complete a review session
   */
  completeReviewSession(sessionId: string): ReviewSession {
    const sessions = this.getReviewSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) throw new Error('Session not found');

    session.endTime = new Date().toISOString();
    session.totalReviewed = session.results.length;
    session.totalCorrect = session.results.filter(r => r.wasCorrect).length;
    session.averageConfidence = session.results.length > 0 
      ? session.results.reduce((sum, r) => sum + r.confidence, 0) / session.results.length
      : 0;

    this.saveReviewSessions(sessions);
    return session;
  }

  /**
   * Get mistake statistics for a user
   */
  getMistakeStats(userId: string): MistakeStats {
    const mistakes = this.getMistakes(userId);
    const userMistakes = mistakes.filter(m => m.userId === userId);
    
    const stats: MistakeStats = {
      totalMistakes: userMistakes.length,
      reviewedMistakes: userMistakes.filter(m => m.reviewCount > 0).length,
      masteredMistakes: userMistakes.filter(m => m.masteryLevel >= 80).length,
      averageMasteryLevel: userMistakes.length > 0 
        ? userMistakes.reduce((sum, m) => sum + m.masteryLevel, 0) / userMistakes.length
        : 0,
      streakDays: this.calculateStreakDays(userId),
      nextReviewDate: this.getNextReviewDate(userId),
      mistakesByTopic: this.groupMistakesByTopic(userMistakes),
      mistakesByDifficulty: this.groupMistakesByDifficulty(userMistakes),
      recentActivity: this.getRecentActivity(userId)
    };

    return stats;
  }

  /**
   * Get all mistakes for a user
   */
  getMistakes(userId?: string): MistakeEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const allMistakes: MistakeEntry[] = stored ? JSON.parse(stored) : [];
      return userId ? allMistakes.filter(m => m.userId === userId) : allMistakes;
    } catch (error) {
      console.error('Error loading mistakes:', error);
      return [];
    }
  }

  /**
   * Get mistakes by topic for focused study
   */
  getMistakesByTopic(userId: string, topic: string): MistakeEntry[] {
    return this.getMistakes(userId).filter(m => 
      m.question.topic.toLowerCase().includes(topic.toLowerCase())
    );
  }

  /**
   * Get mistakes by difficulty level
   */
  getMistakesByDifficulty(userId: string, difficulty: 'easy' | 'medium' | 'hard'): MistakeEntry[] {
    return this.getMistakes(userId).filter(m => m.difficulty === difficulty);
  }

  /**
   * Delete a mistake (when mastered or no longer relevant)
   */
  deleteMistake(userId: string, mistakeId: string): void {
    const mistakes = this.getMistakes();
    const filtered = mistakes.filter(m => !(m.id === mistakeId && m.userId === userId));
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
    this.updateStats(userId);
  }

  /**
   * Add notes to a mistake
   */
  addMistakeNotes(userId: string, mistakeId: string, notes: string): void {
    const mistakes = this.getMistakes();
    const mistake = mistakes.find(m => m.id === mistakeId && m.userId === userId);
    if (mistake) {
      mistake.notes = notes;
      localStorage.setItem(this.storageKey, JSON.stringify(mistakes));
    }
  }

  // Private helper methods

  private saveMistakes(userId: string, userMistakes: MistakeEntry[]): void {
    const allMistakes = this.getMistakes();
    const otherUserMistakes = allMistakes.filter(m => m.userId !== userId);
    const updatedMistakes = [...otherUserMistakes, ...userMistakes];
    localStorage.setItem(this.storageKey, JSON.stringify(updatedMistakes));
  }

  private calculateNextReviewDate(intervalDays: number): string {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);
    return nextDate.toISOString();
  }

  private generateTags(question: DATQuestion): string[] {
    const tags = [question.topic, question.difficulty, question.sectionId];
    
    // Add additional tags based on question content
    const stem = question.stem.toLowerCase();
    if (stem.includes('calculate') || stem.includes('solve')) tags.push('calculation');
    if (stem.includes('identify') || stem.includes('recognize')) tags.push('identification');
    if (stem.includes('compare') || stem.includes('contrast')) tags.push('comparison');
    if (stem.includes('explain') || stem.includes('describe')) tags.push('explanation');
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private getReviewSessions(): ReviewSession[] {
    try {
      const stored = localStorage.getItem(this.sessionsKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading review sessions:', error);
      return [];
    }
  }

  private saveReviewSessions(sessions: ReviewSession[]): void {
    localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
  }

  private updateReviewSession(
    sessionId: string,
    mistakeId: string,
    wasCorrect: boolean,
    timeSpent: number,
    confidence: 1 | 2 | 3 | 4 | 5
  ): void {
    const sessions = this.getReviewSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (session) {
      session.results.push({
        mistakeId,
        wasCorrect,
        timeSpent,
        confidence
      });
      this.saveReviewSessions(sessions);
    }
  }

  private updateStats(userId: string): void {
    const stats = this.getMistakeStats(userId);
    const allStats = this.getAllStats();
    allStats[userId] = stats;
    localStorage.setItem(this.statsKey, JSON.stringify(allStats));
  }

  private getAllStats(): Record<string, MistakeStats> {
    try {
      const stored = localStorage.getItem(this.statsKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error loading stats:', error);
      return {};
    }
  }

  private calculateStreakDays(userId: string): number {
    const sessions = this.getReviewSessions()
      .filter(s => s.userId === userId && s.endTime)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const session of sessions) {
      const sessionDate = new Date(session.startTime);
      sessionDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === streak) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (daysDiff > streak) {
        break;
      }
    }

    return streak;
  }

  private getNextReviewDate(userId: string): string | null {
    const dueMistakes = this.getMistakesDueForReview(userId);
    if (dueMistakes.length === 0) return null;
    
    return dueMistakes[0].nextReviewDate;
  }

  private groupMistakesByTopic(mistakes: MistakeEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    mistakes.forEach(mistake => {
      const topic = mistake.question.topic;
      grouped[topic] = (grouped[topic] || 0) + 1;
    });
    return grouped;
  }

  private groupMistakesByDifficulty(mistakes: MistakeEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    mistakes.forEach(mistake => {
      const difficulty = mistake.difficulty;
      grouped[difficulty] = (grouped[difficulty] || 0) + 1;
    });
    return grouped;
  }

  private getRecentActivity(userId: string): { date: string; reviewedCount: number; correctCount: number; }[] {
    const sessions = this.getReviewSessions()
      .filter(s => s.userId === userId && s.endTime)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 7); // Last 7 sessions

    return sessions.map(session => ({
      date: session.startTime.split('T')[0],
      reviewedCount: session.totalReviewed,
      correctCount: session.totalCorrect
    }));
  }
}

// Export singleton instance
export const mistakeLogger = new MistakeLogger();
export default mistakeLogger;
