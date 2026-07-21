// lib/pdfLoadingManager.ts
import { pdfjs } from "react-pdf";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

// Configure PDF.js worker — set on BOTH the react-pdf re-export and the direct
// pdfjs-dist import. Webpack may deduplicate them to one module, but if the
// bundler keeps them as separate instances (different chunk paths) both need the
// workerSrc set so neither falls back to a fake-worker that can't stream blobs.
if (typeof window !== 'undefined') {
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  } catch (error) {
    console.warn("PDF.js worker configuration failed, will use fallback:", error);
  }
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
  } catch {
    // non-fatal
  }
}

export interface PDFLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  progress: number; // 0-100
  pageCount: number | null;
  error: string | null;
  document: PDFDocumentProxy | null;
}

export interface PDFLoadResult {
  success: boolean;
  document?: PDFDocumentProxy;
  pageCount?: number;
  error?: string;
}

export interface PDFLoadOptions {
  timeout?: number; // ms, default 30000
  retryCount?: number; // default 3
  onProgress?: (progress: number) => void;
  onStateChange?: (state: PDFLoadState) => void;
}

export class PDFLoadingManager {
  private loadingTasks = new Map<string, Promise<PDFLoadResult>>();
  private loadingStates = new Map<string, PDFLoadState>();
  private stateCallbacks = new Map<string, ((state: PDFLoadState) => void)[]>();

  private getInitialState(): PDFLoadState {
    return {
      status: 'idle',
      progress: 0,
      pageCount: null,
      error: null,
      document: null
    };
  }

  private updateState(url: string, updates: Partial<PDFLoadState>): void {
    const currentState = this.loadingStates.get(url) || this.getInitialState();
    const newState = { ...currentState, ...updates };
    this.loadingStates.set(url, newState);
    
    // Call all state change callbacks for this URL
    const callbacks = this.stateCallbacks.get(url) || [];
    callbacks.forEach(cb => cb(newState));
  }
  
  public addStateChangeCallback(url: string, callback: (state: PDFLoadState) => void): void {
    const callbacks = this.stateCallbacks.get(url) || [];
    callbacks.push(callback);
    this.stateCallbacks.set(url, callbacks);
  }
  
  public removeStateChangeCallback(url: string, callback: (state: PDFLoadState) => void): void {
    const callbacks = this.stateCallbacks.get(url) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      this.stateCallbacks.set(url, callbacks);
    }
  }

  private async loadWithRetry(
    url: string, 
    options: PDFLoadOptions, 
    attempt: number = 1
  ): Promise<PDFLoadResult> {
    const maxRetries = options.retryCount || 3;
    const timeout = options.timeout || 30000;

    try {
      // Update state to loading
      this.updateState(url, {
        status: 'loading',
        progress: Math.min(attempt * 10, 30), // Initial progress based on attempt
        error: null
      });

      console.log(`📄 PDFLoadingManager: Loading attempt ${attempt}/${maxRetries} for ${url.slice(0, 50)}...`);

      // Blob URLs don't support HTTP range requests — the browser returns status 0
      // for range requests on blob: URLs in some environments, which PDF.js v3
      // interprets as "Unexpected server response (0)". Fix: read the blob into a
      // Uint8Array and pass it as {data} instead of {url}. This bypasses the
      // range-request layer entirely and matches how pdfjs-handler.ts loads files.
      let documentSource: { url: string } | { data: Uint8Array };
      if (url.startsWith('blob:')) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Blob fetch failed: ${resp.status}`);
          const buf = await resp.arrayBuffer();
          documentSource = { data: new Uint8Array(buf) };
          console.log(`📄 PDFLoadingManager: Blob URL converted to ArrayBuffer (${buf.byteLength} bytes)`);
        } catch (fetchErr) {
          throw new Error(`Failed to read blob URL: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
        }
      } else {
        documentSource = { url };
      }

      // Create loading task with timeout
      const loadingTask = pdfjsLib.getDocument({
        ...documentSource,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        disableStream: false,
        disableAutoFetch: false,
        maxImageSize: 4096 * 4096,
        isEvalSupported: false,
        enableXfa: true,
      });

      // Set up progress tracking
      loadingTask.onProgress = (progress) => {
        const progressPercent = Math.round((progress.loaded / progress.total) * 70) + 30; // 30-100%
        this.updateState(url, { progress: progressPercent });
        options.onProgress?.(progressPercent);
      };

      // Race between loading and timeout
      const documentPromise = loadingTask.promise;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`PDF loading timeout after ${timeout}ms`)), timeout);
      });

      const document = await Promise.race([documentPromise, timeoutPromise]);

      // Validate document
      if (!document || typeof document.numPages !== 'number' || document.numPages <= 0) {
        throw new Error(`Invalid PDF document: ${document ? `${document.numPages} pages` : 'null document'}`);
      }

      // Success - update state
      this.updateState(url, {
        status: 'loaded',
        progress: 100,
        pageCount: document.numPages,
        document,
        error: null
      });

      console.log(`✅ PDFLoadingManager: Successfully loaded ${document.numPages} pages`);

      return {
        success: true,
        document,
        pageCount: document.numPages
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ PDFLoadingManager: Attempt ${attempt}/${maxRetries} failed:`, errorMessage);

      // Retry logic
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`🔄 PDFLoadingManager: Retrying in ${delay}ms...`);
        
        this.updateState(url, {
          progress: Math.min(attempt * 15, 45), // Show some progress even on retries
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.loadWithRetry(url, options, attempt + 1);
      }

      // All attempts failed
      const finalError = this.getFriendlyErrorMessage(errorMessage);
      this.updateState(url, {
        status: 'error',
        error: finalError,
        progress: 0
      });

      return {
        success: false,
        error: finalError
      };
    }
  }

  private getFriendlyErrorMessage(error: string): string {
    if (error.includes('timeout')) {
      return 'PDF loading timed out. The file may be too large or your connection is slow.';
    }
    if (error.includes('fetch') || error.includes('NetworkError')) {
      return 'Network error loading PDF. Check your internet connection and try again.';
    }
    if (error.includes('Invalid PDF') || error.includes('PDF') && error.includes('invalid')) {
      return 'Invalid PDF file. The file may be corrupted or not a valid PDF.';
    }
    if (error.includes('cors') || error.includes('CORS')) {
      return 'Access denied. The PDF source does not allow cross-origin requests.';
    }
    if (error.includes('404') || error.includes('not found')) {
      return 'PDF file not found. Please check the URL or re-upload the file.';
    }
    if (error.includes('403') || error.includes('Forbidden')) {
      return 'Access forbidden. You may not have permission to view this PDF.';
    }
    
    return `PDF loading failed: ${error}`;
  }

  public async loadPDF(url: string, options: PDFLoadOptions = {}): Promise<PDFLoadResult> {
    // Check if already loading
    const existingTask = this.loadingTasks.get(url);
    if (existingTask) {
      console.log(`📄 PDFLoadingManager: Using existing loading task for ${url.slice(0, 50)}...`);
      return existingTask;
    }

    // Start new loading task
    const task = this.loadWithRetry(url, {
      timeout: 30000,
      retryCount: 3,
      ...options
    });

    this.loadingTasks.set(url, task);

    // Clean up completed task
    task.finally(() => {
      this.loadingTasks.delete(url);
    });

    return task;
  }

  public getLoadState(url: string): PDFLoadState {
    return this.loadingStates.get(url) || this.getInitialState();
  }

  public clearLoadState(url: string): void {
    this.loadingStates.delete(url);
    this.loadingTasks.delete(url);
  }

  public isLoading(url: string): boolean {
    const state = this.getLoadState(url);
    return state.status === 'loading';
  }

  public isLoaded(url: string): boolean {
    const state = this.getLoadState(url);
    return state.status === 'loaded' && state.document !== null && state.pageCount !== null;
  }

  public hasError(url: string): boolean {
    const state = this.getLoadState(url);
    return state.status === 'error';
  }
}

// Singleton instance
export const pdfLoadingManager = new PDFLoadingManager();

// React hook for using PDF loading manager
export function usePDFLoading(url: string, options: PDFLoadOptions = {}) {
  const [state, setState] = React.useState<PDFLoadState>(() => 
    pdfLoadingManager.getLoadState(url)
  );

  React.useEffect(() => {
    if (!url) return;

    // Set up state change callback
    const onStateChange = (newState: PDFLoadState) => {
      setState(newState);
      options.onStateChange?.(newState);
    };

    // Register callback with the manager
    pdfLoadingManager.addStateChangeCallback(url, onStateChange);

    // Start loading if not already loaded
    const currentState = pdfLoadingManager.getLoadState(url);
    if (currentState.status === 'idle') {
      pdfLoadingManager.loadPDF(url, options);
    } else {
      // If already loaded, immediately update state
      setState(currentState);
    }

    // Cleanup - remove callback on unmount
    return () => {
      pdfLoadingManager.removeStateChangeCallback(url, onStateChange);
    };
  }, [url]);

  const retry = React.useCallback(() => {
    pdfLoadingManager.clearLoadState(url);
    pdfLoadingManager.loadPDF(url, options);
  }, [url, options]);

  return {
    ...state,
    retry,
    isLoading: state.status === 'loading',
    isLoaded: state.status === 'loaded',
    hasError: state.status === 'error',
  };
}

// Import React for the hook
import React from 'react';
