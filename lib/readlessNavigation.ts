/**
 * Readless Mode Sequential Navigation
 * Enables concept-by-concept book understanding via Smart TOC and Butler
 * Provides automatic progress tracking and sequential navigation
 */

import { type SmartTOCEntry, type ButlerInsightSummary, findSmartTOCEntry } from './tocParser';
import { type EmbeddedButlerOverlay } from './embeddedButlerOverlay';

export interface ReadlessConfig {
  autoAdvanceDelay: number;      // ms to wait before auto-advancing
  enableAutoAdvance: boolean;
  showProgressIndicators: boolean;
  enableQuizMode: boolean;       // Pause on quiz insights for interaction
  enableSpeechSynthesis: boolean;
  summaryDisplayDuration: number; // ms to show each summary
  enableKeyboardNavigation: boolean;
}

export interface ReadlessProgress {
  currentChapter: string;
  currentSection?: string;
  chapterIndex: number;
  totalChapters: number;
  completedChapters: Set<string>;
  completedSections: Set<string>;
  timeSpent: number;           // Total time in ms
  conceptsLearned: number;
  sessionStartTime: number;
}

export interface ReadlessNavigationState {
  isActive: boolean;
  isPaused: boolean;
  currentChapterId: string | null;
  currentSectionType: string | null;
  navigationQueue: ReadlessQueueItem[];
  progress: ReadlessProgress;
  autoAdvanceTimer?: NodeJS.Timeout;
}

export interface ReadlessQueueItem {
  id: string;
  type: 'chapter' | 'section' | 'insight';
  chapterId: string;
  sectionType?: string;
  insightId?: string;
  title: string;
  content: string;
  pageNumber: number;
  duration: number;           // Estimated reading/processing time in ms
  isCompleted: boolean;
}

export interface NavigationCallbacks {
  onChapterEnter?: (chapter: SmartTOCEntry) => void;
  onSectionEnter?: (chapterId: string, sectionType: string, content: string) => void;
  onInsightShow?: (insight: ButlerInsightSummary) => void;
  onProgressUpdate?: (progress: ReadlessProgress) => void;
  onNavigationComplete?: (progress: ReadlessProgress) => void;
  onPageJump?: (pageNumber: number, title: string) => void;
}

/**
 * Readless Navigation Manager
 * Orchestrates sequential navigation through Smart TOC with Butler integration
 */
export class ReadlessNavigation {
  private config: ReadlessConfig;
  private state: ReadlessNavigationState;
  private callbacks: NavigationCallbacks;
  private smartTOC: SmartTOCEntry[] = [];
  private butlerOverlay?: EmbeddedButlerOverlay;
  private progressSaveTimer?: NodeJS.Timeout;

  constructor(config: Partial<ReadlessConfig> = {}, callbacks: NavigationCallbacks = {}) {
    this.config = {
      autoAdvanceDelay: 8000,      // 8 seconds per concept
      enableAutoAdvance: false,     // Start manual by default
      showProgressIndicators: true,
      enableQuizMode: true,
      enableSpeechSynthesis: false, // Disabled by default for privacy
      summaryDisplayDuration: 6000, // 6 seconds per summary
      enableKeyboardNavigation: true,
      ...config
    };

    this.callbacks = callbacks;

    this.state = {
      isActive: false,
      isPaused: false,
      currentChapterId: null,
      currentSectionType: null,
      navigationQueue: [],
      progress: {
        currentChapter: '',
        chapterIndex: 0,
        totalChapters: 0,
        completedChapters: new Set(),
        completedSections: new Set(),
        timeSpent: 0,
        conceptsLearned: 0,
        sessionStartTime: Date.now()
      },
      autoAdvanceTimer: undefined
    };

    console.log('🧠 Readless Navigation initialized:', this.config);
    this.setupKeyboardNavigation();
  }

  /**
   * Initialize readless navigation with Smart TOC and Butler overlay
   */
  public initialize(smartTOC: SmartTOCEntry[], butlerOverlay?: EmbeddedButlerOverlay): void {
    console.log('🧠 Initializing readless navigation with', smartTOC.length, 'chapters');
    
    this.smartTOC = smartTOC;
    this.butlerOverlay = butlerOverlay;
    
    // Build navigation queue from Smart TOC
    this.buildNavigationQueue();
    
    // Update progress totals
    this.state.progress.totalChapters = smartTOC.length;
    this.state.progress.sessionStartTime = Date.now();
    
    // Load saved progress
    this.loadProgress();
  }

  /**
   * Start readless navigation from beginning or resume
   */
  public start(fromBeginning: boolean = false): void {
    console.log('🧠 Starting readless navigation, from beginning:', fromBeginning);
    
    if (fromBeginning) {
      this.resetProgress();
      this.buildNavigationQueue();
    }
    
    this.state.isActive = true;
    this.state.isPaused = false;
    this.state.progress.sessionStartTime = Date.now();
    
    // Start navigation from current position or beginning
    const startIndex = fromBeginning ? 0 : this.findCurrentQueueIndex();
    this.navigateToIndex(startIndex);
    
    this.scheduleProgressSave();
  }

  /**
   * Pause readless navigation
   */
  public pause(): void {
    console.log('🧠 Pausing readless navigation');
    
    this.state.isPaused = true;
    this.clearAutoAdvanceTimer();
    this.saveProgress();
  }

  /**
   * Resume readless navigation
   */
  public resume(): void {
    console.log('🧠 Resuming readless navigation');
    
    this.state.isPaused = false;
    this.continueCurrentNavigation();
  }

  /**
   * Stop readless navigation
   */
  public stop(): void {
    console.log('🧠 Stopping readless navigation');
    
    this.state.isActive = false;
    this.state.isPaused = false;
    this.clearAutoAdvanceTimer();
    
    // Update time spent
    this.updateTimeSpent();
    this.saveProgress();
    
    // Notify completion if we finished
    if (this.isNavigationComplete()) {
      this.callbacks.onNavigationComplete?.(this.state.progress);
    }
  }

  /**
   * Navigate to next concept
   */
  public next(): void {
    if (!this.state.isActive) return;
    
    const currentIndex = this.findCurrentQueueIndex();
    const nextIndex = Math.min(currentIndex + 1, this.state.navigationQueue.length - 1);
    
    this.navigateToIndex(nextIndex);
  }

  /**
   * Navigate to previous concept
   */
  public previous(): void {
    if (!this.state.isActive) return;
    
    const currentIndex = this.findCurrentQueueIndex();
    const prevIndex = Math.max(currentIndex - 1, 0);
    
    this.navigateToIndex(prevIndex);
  }

  /**
   * Jump to specific chapter
   */
  public jumpToChapter(chapterId: string): void {
    console.log('🧠 Jumping to chapter:', chapterId);
    
    const queueIndex = this.state.navigationQueue.findIndex(item => 
      item.chapterId === chapterId && item.type === 'chapter'
    );
    
    if (queueIndex >= 0) {
      this.navigateToIndex(queueIndex);
    }
  }

  /**
   * Enable/disable auto-advance
   */
  public toggleAutoAdvance(): void {
    this.config.enableAutoAdvance = !this.config.enableAutoAdvance;
    console.log('🧠 Auto-advance:', this.config.enableAutoAdvance ? 'enabled' : 'disabled');
    
    if (this.state.isActive && !this.state.isPaused) {
      if (this.config.enableAutoAdvance) {
        this.scheduleAutoAdvance();
      } else {
        this.clearAutoAdvanceTimer();
      }
    }
  }

  /**
   * Get current navigation state
   */
  public getState(): ReadlessNavigationState {
    return { ...this.state };
  }

  /**
   * Get progress statistics
   */
  public getProgressStats(): {
    completionPercentage: number;
    timeSpentMinutes: number;
    conceptsPerMinute: number;
    estimatedTimeRemaining: number;
    currentChapterTitle: string;
  } {
    this.updateTimeSpent();
    
    const completionPercentage = this.state.progress.totalChapters > 0 
      ? (this.state.progress.completedChapters.size / this.state.progress.totalChapters) * 100
      : 0;
    
    const timeSpentMinutes = this.state.progress.timeSpent / (1000 * 60);
    const conceptsPerMinute = timeSpentMinutes > 0 
      ? this.state.progress.conceptsLearned / timeSpentMinutes 
      : 0;
    
    const remainingConcepts = this.state.navigationQueue.length - 
      this.state.navigationQueue.filter(item => item.isCompleted).length;
    
    const estimatedTimeRemaining = conceptsPerMinute > 0 
      ? (remainingConcepts / conceptsPerMinute) * 60 * 1000 // Convert to ms
      : remainingConcepts * this.config.summaryDisplayDuration;
    
    const currentChapter = this.state.currentChapterId 
      ? findSmartTOCEntry(this.smartTOC, this.state.currentChapterId)
      : null;
    
    return {
      completionPercentage,
      timeSpentMinutes,
      conceptsPerMinute,
      estimatedTimeRemaining,
      currentChapterTitle: currentChapter?.title || 'Not started'
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ReadlessConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🧠 Readless navigation config updated:', this.config);
    
    // Restart auto-advance timer with new delay if active
    if (this.state.isActive && !this.state.isPaused && this.config.enableAutoAdvance) {
      this.scheduleAutoAdvance();
    }
  }

  // Private methods

  private buildNavigationQueue(): void {
    console.log('🧠 Building readless navigation queue');
    
    const queue: ReadlessQueueItem[] = [];
    
    this.smartTOC.forEach((chapter, chapterIndex) => {
      // Add chapter overview
      queue.push({
        id: `${chapter.id}-overview`,
        type: 'chapter',
        chapterId: chapter.id,
        title: chapter.title,
        content: chapter.chapterText || `Chapter ${chapterIndex + 1}: ${chapter.title}`,
        pageNumber: chapter.pageNumber,
        duration: this.config.summaryDisplayDuration,
        isCompleted: this.state.progress.completedChapters.has(chapter.id)
      });
      
      // Add PDRM sections
      Object.entries(chapter.pdrmSections).forEach(([sectionType, sectionData]) => {
        if (sectionData) {
          queue.push({
            id: `${chapter.id}-${sectionType}`,
            type: 'section',
            chapterId: chapter.id,
            sectionType,
            title: `${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}: ${chapter.title}`,
            content: sectionData.content,
            pageNumber: chapter.pageNumber,
            duration: this.config.summaryDisplayDuration,
            isCompleted: this.state.progress.completedSections.has(`${chapter.id}-${sectionType}`)
          });
        }
      });
      
      // Add Butler insights
      chapter.butlerInsights.forEach((insight, index) => {
        queue.push({
          id: `${chapter.id}-insight-${index}`,
          type: 'insight',
          chapterId: chapter.id,
          insightId: insight.id,
          title: `${insight.icon} ${insight.title}`,
          content: insight.content,
          pageNumber: insight.anchors.page,
          duration: insight.type === 'quiz' && this.config.enableQuizMode 
            ? this.config.autoAdvanceDelay * 2 // More time for quizzes
            : this.config.summaryDisplayDuration,
          isCompleted: false // Insights are always shown fresh
        });
      });
    });
    
    this.state.navigationQueue = queue;
    console.log('🧠 Built navigation queue with', queue.length, 'items');
  }

  private navigateToIndex(index: number): void {
    if (index < 0 || index >= this.state.navigationQueue.length) return;
    
    const item = this.state.navigationQueue[index];
    console.log('🧠 Navigating to queue item:', item.title);
    
    // Update current state
    this.state.currentChapterId = item.chapterId;
    this.state.currentSectionType = item.sectionType || null;
    
    // Execute navigation based on item type
    switch (item.type) {
      case 'chapter':
        this.enterChapter(item);
        break;
      case 'section':
        this.enterSection(item);
        break;
      case 'insight':
        this.showInsight(item);
        break;
    }
    
    // Mark as completed and update progress
    this.markItemCompleted(item);
    this.updateProgress();
    
    // Schedule next navigation if auto-advance enabled
    if (this.config.enableAutoAdvance && !this.state.isPaused) {
      this.scheduleAutoAdvance();
    }
    
    // Jump to page
    this.callbacks.onPageJump?.(item.pageNumber, item.title);
  }

  private enterChapter(item: ReadlessQueueItem): void {
    const chapter = findSmartTOCEntry(this.smartTOC, item.chapterId);
    if (!chapter) return;
    
    console.log('🧠 Entering chapter:', chapter.title);
    
    this.state.progress.currentChapter = chapter.title;
    this.state.progress.chapterIndex = this.smartTOC.findIndex(c => c.id === chapter.id);
    
    this.callbacks.onChapterEnter?.(chapter);
    
    // Clear old Butler overlays and show new ones for this chapter
    this.butlerOverlay?.clearOverlays(true); // Preserve pinned overlays
    if (chapter.butlerInsights.length > 0) {
      this.butlerOverlay?.addButlerInsights(chapter.butlerInsights, chapter.pageNumber);
    }
  }

  private enterSection(item: ReadlessQueueItem): void {
    if (!item.sectionType) return;
    
    console.log('🧠 Entering section:', item.sectionType, 'for chapter', item.chapterId);
    
    this.callbacks.onSectionEnter?.(item.chapterId, item.sectionType, item.content);
    
    // Speak content if enabled
    if (this.config.enableSpeechSynthesis) {
      this.speakContent(item.content);
    }
  }

  private showInsight(item: ReadlessQueueItem): void {
    if (!item.insightId) return;
    
    const chapter = findSmartTOCEntry(this.smartTOC, item.chapterId);
    const insight = chapter?.butlerInsights.find(i => i.id === item.insightId);
    
    if (!insight) return;
    
    console.log('🧠 Showing Butler insight:', insight.title);
    
    this.callbacks.onInsightShow?.(insight);
    
    // Show specific overlay for this insight
    const anchorId = `butler-${insight.anchors.page}-${insight.id}`;
    this.butlerOverlay?.showOverlay(anchorId);
    
    // Pause on quiz mode
    if (insight.type === 'quiz' && this.config.enableQuizMode) {
      this.pause();
    }
  }

  private markItemCompleted(item: ReadlessQueueItem): void {
    item.isCompleted = true;
    
    switch (item.type) {
      case 'chapter':
        this.state.progress.completedChapters.add(item.chapterId);
        break;
      case 'section':
        if (item.sectionType) {
          this.state.progress.completedSections.add(`${item.chapterId}-${item.sectionType}`);
        }
        break;
      case 'insight':
        this.state.progress.conceptsLearned++;
        break;
    }
  }

  private updateProgress(): void {
    this.updateTimeSpent();
    this.callbacks.onProgressUpdate?.(this.state.progress);
  }

  private updateTimeSpent(): void {
    const now = Date.now();
    this.state.progress.timeSpent = now - this.state.progress.sessionStartTime;
  }

  private scheduleAutoAdvance(): void {
    this.clearAutoAdvanceTimer();
    
    const currentIndex = this.findCurrentQueueIndex();
    const currentItem = this.state.navigationQueue[currentIndex];
    const delay = currentItem?.duration || this.config.autoAdvanceDelay;
    
    this.state.autoAdvanceTimer = setTimeout(() => {
      if (this.state.isActive && !this.state.isPaused) {
        this.next();
      }
    }, delay);
  }

  private clearAutoAdvanceTimer(): void {
    if (this.state.autoAdvanceTimer) {
      clearTimeout(this.state.autoAdvanceTimer);
      this.state.autoAdvanceTimer = undefined;
    }
  }

  private continueCurrentNavigation(): void {
    if (this.config.enableAutoAdvance) {
      this.scheduleAutoAdvance();
    }
  }

  private findCurrentQueueIndex(): number {
    if (!this.state.currentChapterId) return 0;
    
    // Find the last completed item or current item
    for (let i = this.state.navigationQueue.length - 1; i >= 0; i--) {
      const item = this.state.navigationQueue[i];
      if (item.isCompleted || 
          (item.chapterId === this.state.currentChapterId && 
           item.sectionType === this.state.currentSectionType)) {
        return i;
      }
    }
    
    return 0;
  }

  private isNavigationComplete(): boolean {
    return this.state.navigationQueue.every(item => item.isCompleted);
  }

  private resetProgress(): void {
    this.state.progress = {
      currentChapter: '',
      chapterIndex: 0,
      totalChapters: this.smartTOC.length,
      completedChapters: new Set(),
      completedSections: new Set(),
      timeSpent: 0,
      conceptsLearned: 0,
      sessionStartTime: Date.now()
    };
    
    // Reset queue completion status
    this.state.navigationQueue.forEach(item => {
      item.isCompleted = false;
    });
  }

  private setupKeyboardNavigation(): void {
    if (!this.config.enableKeyboardNavigation) return;
    
    document.addEventListener('keydown', (event) => {
      if (!this.state.isActive) return;
      
      // Only handle if no input elements are focused
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).contentEditable === 'true'
      )) {
        return;
      }
      
      switch (event.key) {
        case 'ArrowRight':
        case ' ': // Spacebar
          event.preventDefault();
          this.next();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.previous();
          break;
        case 'p':
        case 'P':
          event.preventDefault();
          if (this.state.isPaused) {
            this.resume();
          } else {
            this.pause();
          }
          break;
        case 'a':
        case 'A':
          event.preventDefault();
          this.toggleAutoAdvance();
          break;
        case 'Escape':
          event.preventDefault();
          this.stop();
          break;
      }
    });
  }

  private speakContent(content: string): void {
    if (!this.config.enableSpeechSynthesis || !window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.rate = 0.9; // Slightly slower for better comprehension
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    window.speechSynthesis.speak(utterance);
  }

  private saveProgress(): void {
    try {
      const progressData = {
        currentChapterId: this.state.currentChapterId,
        currentSectionType: this.state.currentSectionType,
        completedChapters: Array.from(this.state.progress.completedChapters),
        completedSections: Array.from(this.state.progress.completedSections),
        timeSpent: this.state.progress.timeSpent,
        conceptsLearned: this.state.progress.conceptsLearned,
        sessionStartTime: this.state.progress.sessionStartTime
      };
      
      localStorage.setItem('readless-navigation-progress', JSON.stringify(progressData));
    } catch (error) {
      console.warn('Failed to save readless navigation progress:', error);
    }
  }

  private loadProgress(): void {
    try {
      const saved = localStorage.getItem('readless-navigation-progress');
      if (!saved) return;
      
      const progressData = JSON.parse(saved);
      
      this.state.currentChapterId = progressData.currentChapterId;
      this.state.currentSectionType = progressData.currentSectionType;
      this.state.progress.completedChapters = new Set(progressData.completedChapters || []);
      this.state.progress.completedSections = new Set(progressData.completedSections || []);
      this.state.progress.timeSpent = progressData.timeSpent || 0;
      this.state.progress.conceptsLearned = progressData.conceptsLearned || 0;
      this.state.progress.sessionStartTime = progressData.sessionStartTime || Date.now();
      
      // Update queue completion status
      this.state.navigationQueue.forEach(item => {
        switch (item.type) {
          case 'chapter':
            item.isCompleted = this.state.progress.completedChapters.has(item.chapterId);
            break;
          case 'section':
            item.isCompleted = this.state.progress.completedSections.has(`${item.chapterId}-${item.sectionType}`);
            break;
        }
      });
      
      console.log('🧠 Loaded readless navigation progress:', this.state.progress);
    } catch (error) {
      console.warn('Failed to load readless navigation progress:', error);
    }
  }

  private scheduleProgressSave(): void {
    // Save progress periodically
    this.progressSaveTimer = setInterval(() => {
      if (this.state.isActive) {
        this.saveProgress();
      }
    }, 30000); // Save every 30 seconds
  }

  /**
   * Cleanup navigation system
   */
  public destroy(): void {
    console.log('🧠 Destroying readless navigation');
    
    this.stop();
    
    if (this.progressSaveTimer) {
      clearInterval(this.progressSaveTimer);
    }
    
    this.saveProgress();
  }
}

/**
 * Factory function to create readless navigation
 */
export function createReadlessNavigation(
  config?: Partial<ReadlessConfig>,
  callbacks?: NavigationCallbacks
): ReadlessNavigation {
  return new ReadlessNavigation(config, callbacks);
}

/**
 * Default export
 */
export default ReadlessNavigation;
