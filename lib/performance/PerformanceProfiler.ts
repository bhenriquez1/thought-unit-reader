// lib/performance/PerformanceProfiler.ts
/**
 * Comprehensive Performance Profiling & Monitoring System
 * Addresses: Chrome Performance profiles, Heap snapshots, Runtime marks
 */

import React from 'react';

interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  memoryUsage: number;
  fps: number;
  jsHeapSize: number;
  domNodes: number;
  timestamp: number;
}

interface ProfileSession {
  id: string;
  startTime: number;
  endTime?: number;
  metrics: PerformanceMetrics[];
  traces: any[];
  view: 'hybrid' | 'pattern' | 'notelab';
  documentSize: number;
}

class PerformanceProfiler {
  private sessions: Map<string, ProfileSession> = new Map();
  private currentSession: ProfileSession | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private fpsCounter: FPSCounter | null = null;
  
  // Runtime performance marks
  startMark(name: string): void {
    performance.mark(`${name}-start`);
  }
  
  endMark(name: string): number {
    const endName = `${name}-end`;
    performance.mark(endName);
    
    try {
      performance.measure(name, `${name}-start`, endName);
      const measure = performance.getEntriesByName(name)[0];
      return measure.duration;
    } catch (error) {
      console.warn(`Performance measure failed for ${name}:`, error);
      return 0;
    }
  }
  
  // Session management
  startSession(view: 'hybrid' | 'pattern' | 'notelab', documentSize: number = 0): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: performance.now(),
      metrics: [],
      traces: [],
      view,
      documentSize
    };
    
    this.sessions.set(sessionId, this.currentSession);
    this.startMetricsCollection();
    this.startFPSMonitoring();
    
    console.log(`📊 Performance session started: ${sessionId} for ${view} view`);
    return sessionId;
  }
  
  endSession(sessionId: string): ProfileSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    session.endTime = performance.now();
    this.stopMetricsCollection();
    this.stopFPSMonitoring();
    this.currentSession = null;
    
    console.log(`📊 Performance session ended: ${sessionId}`, {
      duration: session.endTime - session.startTime,
      metricsCollected: session.metrics.length
    });
    
    return session;
  }
  
  // Memory monitoring
  private collectMetrics(): PerformanceMetrics {
    const memory = (performance as any).memory;
    
    return {
      loadTime: this.getAverageLoadTime(),
      renderTime: this.getAverageRenderTime(),
      memoryUsage: memory ? memory.usedJSHeapSize : 0,
      fps: this.fpsCounter?.currentFPS || 0,
      jsHeapSize: memory ? memory.totalJSHeapSize : 0,
      domNodes: document.querySelectorAll('*').length,
      timestamp: performance.now()
    };
  }
  
  private getAverageLoadTime(): number {
    const navigationEntries = performance.getEntriesByType('navigation');
    if (navigationEntries.length === 0) return 0;
    
    const entry = navigationEntries[0] as PerformanceNavigationTiming;
    return entry.loadEventEnd - entry.loadEventStart;
  }
  
  private getAverageRenderTime(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const firstContentfulPaint = paintEntries.find(entry => 
      entry.name === 'first-contentful-paint'
    );
    return firstContentfulPaint ? firstContentfulPaint.startTime : 0;
  }
  
  private startMetricsCollection(): void {
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    
    this.metricsInterval = setInterval(() => {
      if (this.currentSession) {
        this.currentSession.metrics.push(this.collectMetrics());
      }
    }, 1000); // Collect every second
  }
  
  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
  
  private startFPSMonitoring(): void {
    this.fpsCounter = new FPSCounter();
    this.fpsCounter.start();
  }
  
  private stopFPSMonitoring(): void {
    if (this.fpsCounter) {
      this.fpsCounter.stop();
      this.fpsCounter = null;
    }
  }
  
  // Chrome DevTools integration
  async captureHeapSnapshot(): Promise<any> {
    if (typeof window === 'undefined') return null;
    
    // This requires Chrome DevTools Protocol access
    // In development, users should manually capture heap snapshots
    console.warn('📸 Heap snapshot capture requires manual action in Chrome DevTools');
    console.warn('Go to DevTools > Memory > Take heap snapshot');
    
    return null;
  }
  
  // Export data for analysis
  exportSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    const exportData = {
      session,
      performanceEntries: performance.getEntries(),
      memoryInfo: (performance as any).memory,
      timing: performance.timing,
      navigation: performance.navigation
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  // Generate performance report
  generateReport(sessionId: string): PerformanceReport | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.endTime) return null;
    
    const metrics = session.metrics;
    if (metrics.length === 0) return null;
    
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    const maxMemory = Math.max(...metrics.map(m => m.memoryUsage));
    const minFPS = Math.min(...metrics.map(m => m.fps));
    const avgFPS = metrics.reduce((sum, m) => sum + m.fps, 0) / metrics.length;
    const maxDOMNodes = Math.max(...metrics.map(m => m.domNodes));
    
    return {
      sessionId,
      view: session.view,
      duration: session.endTime - session.startTime,
      documentSize: session.documentSize,
      memory: {
        average: avgMemory,
        peak: maxMemory,
        growth: maxMemory - metrics[0].memoryUsage
      },
      fps: {
        average: avgFPS,
        minimum: minFPS
      },
      dom: {
        maxNodes: maxDOMNodes
      },
      recommendations: this.generateRecommendations(session)
    };
  }
  
  private generateRecommendations(session: ProfileSession): string[] {
    const recommendations: string[] = [];
    const metrics = session.metrics;
    
    if (metrics.length === 0) return recommendations;
    
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    const maxMemory = Math.max(...metrics.map(m => m.memoryUsage));
    const memoryGrowth = maxMemory - metrics[0].memoryUsage;
    const avgFPS = metrics.reduce((sum, m) => sum + m.fps, 0) / metrics.length;
    
    if (memoryGrowth > 50 * 1024 * 1024) { // 50MB growth
      recommendations.push('High memory growth detected. Check for memory leaks in PDF rendering or highlight computation.');
    }
    
    if (avgMemory > 100 * 1024 * 1024) { // 100MB average
      recommendations.push('High average memory usage. Consider implementing page virtualization and canvas cleanup.');
    }
    
    if (avgFPS < 30) {
      recommendations.push('Low FPS detected. Consider debouncing heavy operations and using React.memo.');
    }
    
    const maxDOMNodes = Math.max(...metrics.map(m => m.domNodes));
    if (maxDOMNodes > 5000) {
      recommendations.push('High DOM node count. Consider virtualizing long lists and cleaning up unused elements.');
    }
    
    if (session.view === 'hybrid' && session.documentSize > 10 * 1024 * 1024) { // 10MB+ PDF
      recommendations.push('Large document in hybrid view. Enable "Light Mode" toggle for better performance.');
    }
    
    return recommendations;
  }
  
  // Development overlay
  createDevOverlay(): HTMLElement | null {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
      return null;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'performance-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
    `;
    
    const updateOverlay = () => {
      const memory = (performance as any).memory;
      const fps = this.fpsCounter?.currentFPS || 0;
      
      overlay.innerHTML = `
        <div>FPS: ${fps.toFixed(1)}</div>
        <div>Memory: ${memory ? (memory.usedJSHeapSize / 1024 / 1024).toFixed(1) : '?'}MB</div>
        <div>DOM: ${document.querySelectorAll('*').length}</div>
      `;
    };
    
    setInterval(updateOverlay, 500);
    document.body.appendChild(overlay);
    
    return overlay;
  }
}

interface PerformanceReport {
  sessionId: string;
  view: 'hybrid' | 'pattern' | 'notelab';
  duration: number;
  documentSize: number;
  memory: {
    average: number;
    peak: number;
    growth: number;
  };
  fps: {
    average: number;
    minimum: number;
  };
  dom: {
    maxNodes: number;
  };
  recommendations: string[];
}

// FPS Counter implementation
class FPSCounter {
  public currentFPS: number = 0;
  private frameCount: number = 0;
  private lastTime: number = 0;
  private animationId: number | null = null;
  
  start(): void {
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.tick();
  }
  
  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  private tick = (): void => {
    const currentTime = performance.now();
    this.frameCount++;
    
    if (currentTime >= this.lastTime + 1000) {
      this.currentFPS = (this.frameCount * 1000) / (currentTime - this.lastTime);
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
    
    this.animationId = requestAnimationFrame(this.tick);
  };
}

// Singleton instance
export const performanceProfiler = new PerformanceProfiler();

// React hook for easy integration
export function usePerformanceSession(
  view: 'hybrid' | 'pattern' | 'notelab',
  documentSize?: number
) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<PerformanceReport | null>(null);
  
  React.useEffect(() => {
    const id = performanceProfiler.startSession(view, documentSize);
    setSessionId(id);
    
    return () => {
      if (id) {
        const session = performanceProfiler.endSession(id);
        if (session) {
          const report = performanceProfiler.generateReport(id);
          setReport(report);
        }
      }
    };
  }, [view, documentSize]);
  
  const exportData = React.useCallback(() => {
    if (sessionId) {
      return performanceProfiler.exportSession(sessionId);
    }
    return null;
  }, [sessionId]);
  
  return { sessionId, report, exportData };
}

// Performance marks for specific operations
export const PerformanceMarks = {
  // PDF operations
  PDF_PARSE_START: 'pdf-parse',
  PDF_RENDER_START: 'pdf-render',
  PDF_CANVAS_CLEANUP: 'pdf-canvas-cleanup',
  
  // Highlighting operations
  HIGHLIGHT_COMPUTE_START: 'highlight-compute',
  PATTERN_ANALYSIS_START: 'pattern-analysis',
  TEXT_TOKENIZATION_START: 'text-tokenization',
  
  // React operations
  COMPONENT_RENDER_START: 'component-render',
  CONTEXT_UPDATE_START: 'context-update',
  LIST_VIRTUALIZATION_START: 'list-virtualization',
  
  // Memory operations
  MEMORY_CLEANUP_START: 'memory-cleanup',
  CANVAS_DISPOSAL_START: 'canvas-disposal'
} as const;

export type PerformanceMark = typeof PerformanceMarks[keyof typeof PerformanceMarks];

// Utility functions
export function markStart(operation: PerformanceMark): void {
  performanceProfiler.startMark(operation);
}

export function markEnd(operation: PerformanceMark): number {
  return performanceProfiler.endMark(operation);
}

// Development tools
export function enablePerformanceOverlay(): void {
  if (process.env.NODE_ENV === 'development') {
    performanceProfiler.createDevOverlay();
  }
}

export { PerformanceProfiler, type PerformanceReport, type PerformanceMetrics };
