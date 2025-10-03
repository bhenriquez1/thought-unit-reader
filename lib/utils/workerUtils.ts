// Utility functions for Web Worker management and communication
// Provides a clean interface for using the noteLabWorker

interface WorkerMessage {
  id: string;
  type: string;
  payload: any;
}

interface WorkerResponse {
  id: string;
  type: string;
  success: boolean;
  data?: any;
  error?: string;
  progress?: number;
}

type WorkerResponseCallback = (response: WorkerResponse) => void;

class WorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: number) => void;
  }>();
  private requestCounter = 0;

  constructor(private workerPath: string) {
    this.initWorker();
  }

  private initWorker() {
    try {
      this.worker = new Worker(this.workerPath);
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
    } catch (error) {
      console.error('Failed to initialize worker:', error);
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const response = event.data;
    const request = this.pendingRequests.get(response.id);

    if (!request) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    if (response.progress !== undefined && request.onProgress) {
      request.onProgress(response.progress);
      
      // Don't resolve yet if this is just a progress update
      if (response.progress < 100 && response.data === null) {
        return;
      }
    }

    if (response.success) {
      request.resolve(response.data);
    } else {
      request.reject(new Error(response.error || 'Worker operation failed'));
    }

    this.pendingRequests.delete(response.id);
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error('Worker error:', error);
    
    // Reject all pending requests
    this.pendingRequests.forEach((request) => {
      request.reject(new Error(`Worker error: ${error.message}`));
    });
    this.pendingRequests.clear();

    // Try to restart the worker
    setTimeout(() => {
      this.initWorker();
    }, 1000);
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  public async sendRequest<T>(
    type: string, 
    payload: any, 
    onProgress?: (progress: number) => void
  ): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = this.generateRequestId();

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const message: WorkerMessage = { id, type, payload };
      this.worker!.postMessage(message);

      // Set a timeout to prevent hanging requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }

  public isAvailable(): boolean {
    return this.worker !== null;
  }
}

// Singleton instance for the NoteLab worker
let noteLabWorkerManager: WorkerManager | null = null;

export function getNoteLabWorker(): WorkerManager {
  if (!noteLabWorkerManager) {
    // Create the worker with a blob URL to avoid module loading issues
    const workerCode = `
      // Import the worker code here or embed it
      // For now, we'll create a simple fallback
      self.onmessage = function(event) {
        const { id, type } = event.data;
        
        // Simulate processing delay
        setTimeout(() => {
          self.postMessage({
            id,
            type,
            success: true,
            data: { message: 'Worker not fully implemented yet' }
          });
        }, 100);
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    noteLabWorkerManager = new WorkerManager(workerUrl);
  }
  return noteLabWorkerManager;
}

// Specific functions for NoteLab operations
export async function analyzeNoteWithWorker(content: string): Promise<{
  suggestedPatterns: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  keyTerms: string[];
  studyTips: string[];
}> {
  const worker = getNoteLabWorker();
  return worker.sendRequest('analyzeNote', { content });
}

export async function generateFlashcardsWithWorker(
  content: string, 
  title: string
): Promise<Array<{
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}>> {
  const worker = getNoteLabWorker();
  return worker.sendRequest('generateFlashcards', { content, title });
}

export async function indexNotesWithWorker(notes: Array<{
  id: string;
  title: string;
  content: string;
  patterns?: string[];
  tags?: string[];
}>): Promise<Record<string, string[]>> {
  const worker = getNoteLabWorker();
  return worker.sendRequest('indexNotes', { notes });
}

export async function searchNotesWithWorker(
  query: string,
  index: Record<string, string[]>,
  notes: Array<{ id: string; title: string; content: string; }>
): Promise<Array<{ id: string; score: number; title: string; snippet: string; }>> {
  const worker = getNoteLabWorker();
  return worker.sendRequest('searchNotes', { query, index, notes });
}

export async function batchProcessNotesWithWorker(
  notes: Array<{ id: string; title: string; content: string; }>,
  onProgress?: (progress: number) => void
): Promise<Array<{
  noteId: string;
  analysis: any;
  flashcards: any[];
}>> {
  const worker = getNoteLabWorker();
  return worker.sendRequest('batchProcess', { notes, batchSize: 3 }, onProgress);
}

// Utility for graceful degradation when workers aren't available
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

// Fallback functions for when workers aren't available
export function createFallbackWorkerFunctions() {
  return {
    analyzeNote: async (content: string) => ({
      suggestedPatterns: [],
      complexity: 'basic' as const,
      keyTerms: [],
      studyTips: ['Worker not available - using fallback processing']
    }),
    
    generateFlashcards: async (content: string, title: string) => [],
    
    indexNotes: async (notes: any[]) => ({}),
    
    searchNotes: async (query: string, index: any, notes: any[]) => [],
    
    batchProcess: async (notes: any[], onProgress?: (progress: number) => void) => {
      if (onProgress) onProgress(100);
      return [];
    }
  };
}

// Cleanup function for application shutdown
export function terminateAllWorkers() {
  if (noteLabWorkerManager) {
    noteLabWorkerManager.terminate();
    noteLabWorkerManager = null;
  }
}

// Hook for React components to manage worker lifecycle
export function useWorkerManager(workerPath?: string) {
  const [manager, setManager] = React.useState<WorkerManager | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (!isWorkerSupported()) {
      setIsReady(false);
      return;
    }

    const workerManager = workerPath ? new WorkerManager(workerPath) : getNoteLabWorker();
    setManager(workerManager);
    setIsReady(true);

    return () => {
      if (workerPath && workerManager) {
        // Only terminate if we created our own manager
        workerManager.terminate();
      }
    };
  }, [workerPath]);

  return { manager, isReady, isSupported: isWorkerSupported() };
}

// Import React for the hook
import React from 'react';
