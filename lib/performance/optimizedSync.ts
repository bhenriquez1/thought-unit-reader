// Optimized sync system to prevent loops and improve performance
import { useRef, useCallback, useMemo } from 'react';

// Simple debounce implementation without lodash
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T {
  const { leading = false, trailing = true } = options;
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let hasInvoked = false;

  return ((...args: Parameters<T>) => {
    lastArgs = args;
    
    if (!timeout) {
      if (leading) {
        func(...args);
        hasInvoked = true;
      }
      
      timeout = setTimeout(() => {
        if (trailing && !hasInvoked && lastArgs) {
          func(...lastArgs);
        }
        timeout = null;
        hasInvoked = false;
      }, wait);
    } else {
      hasInvoked = false;
    }
  }) as T;
}

// Lightweight sync state without heavy Zustand operations
interface SyncState {
  page: number;
  unit: number;
  isUpdating: boolean;
}

// Prevent infinite loops with update tracking
class SyncLoopPrevention {
  private lastUpdates = new Map<string, number>();
  private updateCounts = new Map<string, number>();
  private readonly DEBOUNCE_TIME = 100;
  private readonly MAX_UPDATES_PER_SECOND = 5;

  canUpdate(key: string, value: any): boolean {
    const now = Date.now();
    const lastTime = this.lastUpdates.get(key) || 0;
    const count = this.updateCounts.get(key) || 0;
    
    // Reset count every second
    if (now - lastTime > 1000) {
      this.updateCounts.set(key, 0);
    }
    
    // Check if we're updating too frequently
    if (now - lastTime < this.DEBOUNCE_TIME) {
      return false;
    }
    
    // Check if we're hitting the rate limit
    if (count >= this.MAX_UPDATES_PER_SECOND) {
      console.warn(`🚨 Sync rate limit hit for ${key}`);
      return false;
    }
    
    // Update counters
    this.lastUpdates.set(key, now);
    this.updateCounts.set(key, count + 1);
    
    return true;
  }
}

const syncPrevention = new SyncLoopPrevention();

// Lightweight page to unit mapping without heavy calculations
function quickPageToUnit(page: number, totalPages: number, totalUnits: number): number {
  if (totalPages <= 1 || totalUnits <= 1) return 1;
  const ratio = Math.max(0, Math.min(1, (page - 1) / Math.max(1, totalPages - 1)));
  return Math.max(1, Math.min(totalUnits, Math.round(ratio * totalUnits) + 1));
}

function quickUnitToPage(unit: number, totalPages: number, totalUnits: number): number {
  if (totalPages <= 1 || totalUnits <= 1) return 1;
  const ratio = Math.max(0, Math.min(1, (unit - 1) / Math.max(1, totalUnits - 1)));
  return Math.max(1, Math.min(totalPages, Math.round(ratio * totalPages) + 1));
}

// Optimized sync hook that prevents loops
export function useOptimizedSync(
  totalPages: number,
  totalUnits: number,
  initialPage: number = 1,
  initialUnit: number = 1
) {
  const stateRef = useRef<SyncState>({
    page: initialPage,
    unit: initialUnit,
    isUpdating: false
  });

  // Memoized sync functions to prevent recreation
  const syncToPage = useCallback((newPage: number, reason?: string) => {
    if (stateRef.current.isUpdating) return;
    if (!syncPrevention.canUpdate('page', newPage)) return;
    if (stateRef.current.page === newPage) return;

    console.log(`📄 Optimized sync to page ${newPage} (${reason || 'manual'})`);
    
    stateRef.current.isUpdating = true;
    stateRef.current.page = newPage;
    stateRef.current.unit = quickPageToUnit(newPage, totalPages, totalUnits);
    stateRef.current.isUpdating = false;
  }, [totalPages, totalUnits]);

  const syncToUnit = useCallback((newUnit: number, reason?: string) => {
    if (stateRef.current.isUpdating) return;
    if (!syncPrevention.canUpdate('unit', newUnit)) return;
    if (stateRef.current.unit === newUnit) return;

    console.log(`📖 Optimized sync to unit ${newUnit} (${reason || 'manual'})`);
    
    stateRef.current.isUpdating = true;
    stateRef.current.unit = newUnit;
    stateRef.current.page = quickUnitToPage(newUnit, totalPages, totalUnits);
    stateRef.current.isUpdating = false;
  }, [totalPages, totalUnits]);

  // Debounced versions for high-frequency updates
  const debouncedSyncToPage = useMemo(
    () => debounce(syncToPage, 100, { leading: true, trailing: false }),
    [syncToPage]
  );

  const debouncedSyncToUnit = useMemo(
    () => debounce(syncToUnit, 100, { leading: true, trailing: false }),
    [syncToUnit]
  );

  return {
    currentPage: stateRef.current.page,
    currentUnit: stateRef.current.unit,
    isUpdating: stateRef.current.isUpdating,
    syncToPage,
    syncToUnit,
    debouncedSyncToPage,
    debouncedSyncToUnit
  };
}

// Memory-efficient cleanup for PDF resources
export class PDFResourceManager {
  private canvases = new Set<HTMLCanvasElement>();
  private observers = new Set<IntersectionObserver | MutationObserver>();
  private intervals = new Set<number>();
  private timeouts = new Set<number>();

  registerCanvas(canvas: HTMLCanvasElement) {
    this.canvases.add(canvas);
  }

  registerObserver(observer: IntersectionObserver | MutationObserver) {
    this.observers.add(observer);
  }

  registerInterval(id: number) {
    this.intervals.add(id);
  }

  registerTimeout(id: number) {
    this.timeouts.add(id);
  }

  cleanup() {
    // Clean up canvases
    this.canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
    });
    this.canvases.clear();

    // Disconnect observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();

    // Clear intervals
    this.intervals.forEach(id => clearInterval(id));
    this.intervals.clear();

    // Clear timeouts
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts.clear();

    console.log('🧹 PDF resources cleaned up');
  }

  getStats() {
    return {
      canvases: this.canvases.size,
      observers: this.observers.size,
      intervals: this.intervals.size,
      timeouts: this.timeouts.size
    };
  }
}

// Global resource manager instance
let globalResourceManager: PDFResourceManager | null = null;

export function getResourceManager(): PDFResourceManager {
  if (!globalResourceManager) {
    globalResourceManager = new PDFResourceManager();
  }
  return globalResourceManager;
}

// Optimized AI processing with workers
export async function processWithWorkerFallback<T>(
  workerProcess: () => Promise<T>,
  fallbackProcess: () => Promise<T>,
  timeout: number = 5000
): Promise<T> {
  try {
    return await Promise.race([
      workerProcess(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Worker timeout')), timeout)
      )
    ]);
  } catch (error) {
    console.warn('Worker processing failed, using fallback:', error);
    return await fallbackProcess();
  }
}
