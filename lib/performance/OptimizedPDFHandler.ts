// lib/performance/OptimizedPDFHandler.ts
/**
 * Optimized PDF Handling System
 * Addresses: Lazy loading, Web Workers, Canvas cleanup, Memory management
 */

import { markStart, markEnd, PerformanceMarks } from './PerformanceProfiler';

// PDF.js imports with performance considerations
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure PDF.js worker for better performance
if (typeof window !== 'undefined') {
  try {
    GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch (error) {
    console.warn('PDF.js worker setup failed:', error);
  }
}

interface PDFRenderOptions {
  scale: number;
  viewport?: any;
  canvasContext?: CanvasRenderingContext2D;
  background?: string;
}

interface PDFPageCache {
  pageProxy: PDFPageProxy;
  canvas: HTMLCanvasElement;
  imageData: ImageData | null;
  lastAccessed: number;
  renderPromise: Promise<void> | null;
}

interface PDFTileCache {
  [key: string]: {
    canvas: HTMLCanvasElement;
    lastAccessed: number;
    scale: number;
  };
}

// Configuration for performance optimization
const PDF_CONFIG = {
  MAX_CACHED_PAGES: 5, // Keep current ±2 pages
  MAX_CONCURRENT_RENDERS: 2, // Limit parallel rendering
  CACHE_CLEANUP_INTERVAL: 30000, // 30 seconds
  TILE_SIZE: 512, // Tile size for large pages
  PRELOAD_DISTANCE: 1, // Pages to preload around current
  MEMORY_PRESSURE_THRESHOLD: 100 * 1024 * 1024, // 100MB
};

class OptimizedPDFHandler {
  private pdfDocument: PDFDocumentProxy | null = null;
  private pageCache: Map<number, PDFPageCache> = new Map();
  private tileCache: PDFTileCache = {};
  private renderQueue: Set<number> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private memoryMonitor: NodeJS.Timeout | null = null;
  private isLightMode: boolean = false;
  
  // Worker for background processing
  private pdfWorker: Worker | null = null;
  
  constructor() {
    this.startCleanupCycle();
    this.startMemoryMonitoring();
  }
  
  async loadDocument(url: string, lightMode: boolean = false): Promise<PDFDocumentProxy> {
    markStart(PerformanceMarks.PDF_PARSE_START);
    
    // Cancel any existing operations
    this.abortController?.abort();
    this.abortController = new AbortController();
    
    this.isLightMode = lightMode;
    
    try {
      const loadingTask = getDocument({
        url,
        maxImageSize: 4096 * 4096, // Limit image size for memory
        disableFontFace: lightMode, // Disable custom fonts in light mode
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,
        cMapPacked: true,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
      });
      
      // Progress tracking
      loadingTask.onProgress = (progress: any) => {
        const percent = progress.loaded / progress.total * 100;
        this.notifyProgress(`Loading PDF... ${percent.toFixed(0)}%`, percent);
      };
      
      this.pdfDocument = await loadingTask.promise;
      
      markEnd(PerformanceMarks.PDF_PARSE_START);
      
      console.log(`📄 PDF loaded: ${this.pdfDocument.numPages} pages (Light Mode: ${lightMode})`);
      
      return this.pdfDocument;
    } catch (error) {
      markEnd(PerformanceMarks.PDF_PARSE_START);
      console.error('PDF loading failed:', error);
      throw error;
    }
  }
  
  async renderPage(
    pageNumber: number,
    options: PDFRenderOptions,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<HTMLCanvasElement> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }
    
    markStart(PerformanceMarks.PDF_RENDER_START);
    
    try {
      // Check cache first
      const cached = this.pageCache.get(pageNumber);
      if (cached && cached.canvas && this.isCacheValid(cached, options)) {
        cached.lastAccessed = Date.now();
        markEnd(PerformanceMarks.PDF_RENDER_START);
        return cached.canvas;
      }
      
      // Limit concurrent renders to prevent blocking
      if (this.renderQueue.size >= PDF_CONFIG.MAX_CONCURRENT_RENDERS && priority !== 'high') {
        await this.waitForRenderSlot();
      }
      
      this.renderQueue.add(pageNumber);
      
      // Get page proxy
      const page = await this.pdfDocument.getPage(pageNumber);
      
      // Calculate optimal viewport
      const viewport = page.getViewport({ scale: options.scale });
      
      // Create or reuse canvas
      const canvas = cached?.canvas || document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Failed to get canvas context');
      }
      
      // Set canvas dimensions
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set background if specified
      if (options.background) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // Render options
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        enableWebGL: false, // Disable WebGL for stability
        renderInteractiveForms: !this.isLightMode,
        ...(this.isLightMode ? {} : { optionalContentConfigPromise: undefined }),
      };
      
      // Render page
      const renderTask = page.render(renderContext);
      
      // Handle cancellation
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          renderTask.cancel();
        });
      }
      
      await renderTask.promise;
      
      // Cache the result
      const cacheEntry: PDFPageCache = {
        pageProxy: page,
        canvas,
        imageData: this.isLightMode ? null : context.getImageData(0, 0, canvas.width, canvas.height),
        lastAccessed: Date.now(),
        renderPromise: null,
      };
      
      this.pageCache.set(pageNumber, cacheEntry);
      this.renderQueue.delete(pageNumber);
      
      // Cleanup old cache entries
      this.cleanupPageCache();
      
      markEnd(PerformanceMarks.PDF_RENDER_START);
      
      console.log(`📄 Page ${pageNumber} rendered (${viewport.width}x${viewport.height})`);
      
      return canvas;
      
    } catch (error) {
      this.renderQueue.delete(pageNumber);
      markEnd(PerformanceMarks.PDF_RENDER_START);
      console.error(`Failed to render page ${pageNumber}:`, error);
      throw error;
    }
  }
  
  // Preload adjacent pages for smooth navigation
  preloadPages(currentPage: number): void {
    if (!this.pdfDocument || this.isLightMode) return;
    
    const { numPages } = this.pdfDocument;
    const preloadRange = PDF_CONFIG.PRELOAD_DISTANCE;
    
    // Preload previous and next pages
    for (let i = -preloadRange; i <= preloadRange; i++) {
      const pageNum = currentPage + i;
      if (pageNum >= 1 && pageNum <= numPages && pageNum !== currentPage) {
        if (!this.pageCache.has(pageNum)) {
          // Low priority background preload
          this.renderPage(pageNum, { scale: 1.0 }, 'low').catch((error) => {
            // Ignore preload errors
            console.debug(`Preload failed for page ${pageNum}:`, error);
          });
        }
      }
    }
  }
  
  // Render large pages as tiles for better performance
  async renderTiled(
    pageNumber: number,
    options: PDFRenderOptions,
    tileSize: number = PDF_CONFIG.TILE_SIZE
  ): Promise<HTMLCanvasElement[]> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }
    
    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: options.scale });
    
    const tiles: HTMLCanvasElement[] = [];
    const tilesX = Math.ceil(viewport.width / tileSize);
    const tilesY = Math.ceil(viewport.height / tileSize);
    
    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = Math.min(tileSize, viewport.width - x * tileSize);
        tileCanvas.height = Math.min(tileSize, viewport.height - y * tileSize);
        
        const context = tileCanvas.getContext('2d')!;
        
        // Create clipped viewport for this tile
        const tileViewport = page.getViewport({
          scale: options.scale,
          offsetX: -x * tileSize,
          offsetY: -y * tileSize,
        });
        
        await page.render({
          canvasContext: context,
          viewport: tileViewport,
        }).promise;
        
        tiles.push(tileCanvas);
      }
    }
    
    return tiles;
  }
  
  // Get text content for highlighting without rendering
  async getTextContent(pageNumber: number): Promise<any> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }
    
    markStart(PerformanceMarks.TEXT_TOKENIZATION_START);
    
    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      
      markEnd(PerformanceMarks.TEXT_TOKENIZATION_START);
      
      return textContent;
    } catch (error) {
      markEnd(PerformanceMarks.TEXT_TOKENIZATION_START);
      throw error;
    }
  }
  
  // Memory management
  private cleanupPageCache(): void {
    const entries = Array.from(this.pageCache.entries());
    
    // Sort by last accessed time (oldest first)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    // Remove excess entries
    while (entries.length > PDF_CONFIG.MAX_CACHED_PAGES) {
      const [pageNumber, entry] = entries.shift()!;
      this.disposePage(entry);
      this.pageCache.delete(pageNumber);
      console.log(`🗑️ Cleaned up cached page ${pageNumber}`);
    }
  }
  
  private disposePage(entry: PDFPageCache): void {
    markStart(PerformanceMarks.CANVAS_DISPOSAL_START);
    
    try {
      // Clear canvas
      if (entry.canvas) {
        const context = entry.canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
        }
        entry.canvas.width = 1;
        entry.canvas.height = 1;
      }
      
      // Dispose page proxy
      if (entry.pageProxy && typeof entry.pageProxy.cleanup === 'function') {
        entry.pageProxy.cleanup();
      }
      
      // Clear image data
      entry.imageData = null;
      
    } catch (error) {
      console.warn('Error disposing page:', error);
    } finally {
      markEnd(PerformanceMarks.CANVAS_DISPOSAL_START);
    }
  }
  
  private isCacheValid(cached: PDFPageCache, options: PDFRenderOptions): boolean {
    if (!cached.canvas) return false;
    
    // Check if scale matches (within tolerance)
    const currentViewport = cached.pageProxy.getViewport({ scale: options.scale });
    const scaleDiff = Math.abs(cached.canvas.width - currentViewport.width);
    
    return scaleDiff < 10; // 10px tolerance
  }
  
  private async waitForRenderSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.renderQueue.size < PDF_CONFIG.MAX_CONCURRENT_RENDERS) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }
  
  private startCleanupCycle(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupPageCache();
      this.cleanupTileCache();
    }, PDF_CONFIG.CACHE_CLEANUP_INTERVAL);
  }
  
  private cleanupTileCache(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    Object.keys(this.tileCache).forEach(key => {
      const tile = this.tileCache[key];
      if (now - tile.lastAccessed > maxAge) {
        // Clear tile canvas
        const context = tile.canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
        }
        tile.canvas.width = 1;
        tile.canvas.height = 1;
        delete this.tileCache[key];
      }
    });
  }
  
  private startMemoryMonitoring(): void {
    if (this.memoryMonitor) clearInterval(this.memoryMonitor);
    
    this.memoryMonitor = setInterval(() => {
      if (typeof window !== 'undefined' && (performance as any).memory) {
        const memory = (performance as any).memory;
        
        if (memory.usedJSHeapSize > PDF_CONFIG.MEMORY_PRESSURE_THRESHOLD) {
          console.warn('🔥 Memory pressure detected, forcing cleanup');
          this.forceCleanup();
        }
      }
    }, 10000); // Check every 10 seconds
  }
  
  private forceCleanup(): void {
    markStart(PerformanceMarks.MEMORY_CLEANUP_START);
    
    try {
      // Clear all but current page cache
      const entries = Array.from(this.pageCache.entries());
      entries.slice(1).forEach(([pageNumber, entry]) => {
        this.disposePage(entry);
        this.pageCache.delete(pageNumber);
      });
      
      // Clear tile cache
      Object.keys(this.tileCache).forEach(key => {
        const tile = this.tileCache[key];
        const context = tile.canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
        }
        delete this.tileCache[key];
      });
      
      // Force garbage collection if available
      if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
      }
      
      console.log('🧹 Forced memory cleanup completed');
      
    } catch (error) {
      console.error('Error during force cleanup:', error);
    } finally {
      markEnd(PerformanceMarks.MEMORY_CLEANUP_START);
    }
  }
  
  // Progress notification
  private notifyProgress(message: string, percent: number): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdf-progress', {
        detail: { message, percent }
      }));
    }
  }
  
  // Public cleanup method
  dispose(): void {
    console.log('🗑️ Disposing OptimizedPDFHandler');
    
    // Cancel operations
    this.abortController?.abort();
    
    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }
    
    // Dispose all cached pages
    this.pageCache.forEach(entry => this.disposePage(entry));
    this.pageCache.clear();
    
    // Clear tile cache
    Object.values(this.tileCache).forEach(tile => {
      const context = tile.canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
      }
    });
    this.tileCache = {};
    
    // Dispose PDF document
    if (this.pdfDocument) {
      try {
        this.pdfDocument.destroy();
      } catch (error) {
        console.warn('Error disposing PDF document:', error);
      }
      this.pdfDocument = null;
    }
    
    // Dispose worker
    if (this.pdfWorker) {
      this.pdfWorker.terminate();
      this.pdfWorker = null;
    }
  }
  
  // Get memory usage statistics
  getMemoryStats(): any {
    const pagesCached = this.pageCache.size;
    const tilesCount = Object.keys(this.tileCache).length;
    const renderQueueSize = this.renderQueue.size;
    
    let totalCanvasMemory = 0;
    this.pageCache.forEach(entry => {
      if (entry.canvas) {
        totalCanvasMemory += entry.canvas.width * entry.canvas.height * 4; // RGBA
      }
    });
    
    return {
      pagesCached,
      tilesCount,
      renderQueueSize,
      totalCanvasMemory,
      isLightMode: this.isLightMode,
    };
  }
}

// Export singleton instance
export const optimizedPDFHandler = new OptimizedPDFHandler();

// Export types and configuration
export type { PDFRenderOptions, PDFPageCache };
export { PDF_CONFIG, OptimizedPDFHandler };
