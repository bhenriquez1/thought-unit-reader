// Performance diagnostics and monitoring for TU Reader
// Provides real-time performance metrics, error tracking, and bottleneck identification

interface PerformanceEntry {
  name: string;
  startTime: number;
  duration: number;
  type: 'navigation' | 'resource' | 'measure' | 'mark';
  size?: number;
  transferSize?: number;
}

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

interface NetworkDiagnostics {
  failedRequests: Array<{
    url: string;
    error: string;
    timestamp: number;
    retryCount: number;
  }>;
  slowRequests: Array<{
    url: string;
    duration: number;
    timestamp: number;
    size?: number;
  }>;
  totalRequests: number;
  averageResponseTime: number;
}

interface ConsoleDiagnostics {
  errors: Array<{
    message: string;
    stack?: string;
    timestamp: number;
    component?: string;
    level: 'error' | 'warning' | 'info';
  }>;
  totalErrors: number;
  recentErrors: number; // Last 5 minutes
}

interface ComponentPerformance {
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  mountTime: number;
  updateCount: number;
  slowRenders: Array<{
    duration: number;
    timestamp: number;
    props?: any;
  }>;
}

interface PerformanceMetrics {
  memory: MemoryInfo;
  network: NetworkDiagnostics;
  console: ConsoleDiagnostics;
  components: Map<string, ComponentPerformance>;
  mainThreadBlocking: Array<{
    task: string;
    duration: number;
    timestamp: number;
  }>;
  frameRate: {
    current: number;
    average: number;
    drops: number;
  };
  loadTime: {
    domContentLoaded: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    firstInputDelay: number;
  };
}

class PerformanceDiagnostics {
  private metrics: PerformanceMetrics;
  private observers: Array<PerformanceObserver> = [];
  private memoryInterval: number | null = null;
  private frameRateInterval: number | null = null;
  private originalConsole: {
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  };
  
  private listeners: Array<(metrics: PerformanceMetrics) => void> = [];
  private isRunning = false;

  constructor() {
    this.metrics = {
      memory: {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        timestamp: Date.now()
      },
      network: {
        failedRequests: [],
        slowRequests: [],
        totalRequests: 0,
        averageResponseTime: 0
      },
      console: {
        errors: [],
        totalErrors: 0,
        recentErrors: 0
      },
      components: new Map(),
      mainThreadBlocking: [],
      frameRate: {
        current: 60,
        average: 60,
        drops: 0
      },
      loadTime: {
        domContentLoaded: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        firstInputDelay: 0
      }
    };

    this.originalConsole = {
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    this.initializePerformanceObservers();
    this.interceptConsole();
    this.interceptNetworkRequests();
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔬 Performance diagnostics started');

    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Start frame rate monitoring
    this.startFrameRateMonitoring();
    
    // Collect initial load metrics
    this.collectLoadMetrics();
    
    // Set up periodic cleanup
    setInterval(() => this.cleanupOldMetrics(), 60000); // Every minute
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('🔬 Performance diagnostics stopped');

    // Stop intervals
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
    
    if (this.frameRateInterval) {
      clearInterval(this.frameRateInterval);
      this.frameRateInterval = null;
    }

    // Disconnect observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    // Restore console
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }

  private initializePerformanceObservers() {
    if (!('PerformanceObserver' in window)) {
      console.warn('PerformanceObserver not supported');
      return;
    }

    // Long task observer
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          this.metrics.mainThreadBlocking.push({
            task: entry.name || 'Unknown task',
            duration: entry.duration,
            timestamp: Date.now()
          });

          // Alert for very long tasks (>100ms)
          if (entry.duration > 100) {
            console.warn(`🐌 Long task detected: ${entry.duration.toFixed(2)}ms`);
          }
        });
        this.notifyListeners();
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);
    } catch (error) {
      console.warn('Long task observer not supported:', error);
    }

    // Paint observer
    try {
      const paintObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          switch (entry.name) {
            case 'first-contentful-paint':
              this.metrics.loadTime.firstContentfulPaint = entry.startTime;
              break;
          }
        });
        this.notifyListeners();
      });

      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(paintObserver);
    } catch (error) {
      console.warn('Paint observer not supported:', error);
    }

    // Navigation observer
    try {
      const navigationObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          this.metrics.loadTime.domContentLoaded = entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart;
          this.metrics.loadTime.firstInputDelay = entry.firstInputDelay || 0;
        });
        this.notifyListeners();
      });

      navigationObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navigationObserver);
    } catch (error) {
      console.warn('Navigation observer not supported:', error);
    }
  }

  private interceptConsole() {
    const self = this;

    console.error = function(...args: any[]) {
      self.recordConsoleError('error', args.join(' '));
      self.originalConsole.error.apply(console, args);
    };

    console.warn = function(...args: any[]) {
      self.recordConsoleError('warning', args.join(' '));
      self.originalConsole.warn.apply(console, args);
    };

    // Intercept React errors
    window.addEventListener('error', (event) => {
      self.recordConsoleError('error', event.message, event.error?.stack);
    });

    window.addEventListener('unhandledrejection', (event) => {
      self.recordConsoleError('error', `Unhandled Promise Rejection: ${event.reason}`);
    });
  }

  private interceptNetworkRequests() {
    const self = this;
    const originalFetch = window.fetch;

    window.fetch = async function(...args: any[]) {
      const url = args[0] instanceof Request ? args[0].url : args[0];
      const startTime = Date.now();

      try {
        const response = await originalFetch.apply(window, args);
        const duration = Date.now() - startTime;
        
        self.metrics.network.totalRequests++;
        self.metrics.network.averageResponseTime = 
          (self.metrics.network.averageResponseTime * (self.metrics.network.totalRequests - 1) + duration) / 
          self.metrics.network.totalRequests;

        // Track slow requests (>2 seconds)
        if (duration > 2000) {
          self.metrics.network.slowRequests.push({
            url,
            duration,
            timestamp: Date.now(),
            size: parseInt(response.headers.get('content-length') || '0')
          });
        }

        if (!response.ok) {
          self.metrics.network.failedRequests.push({
            url,
            error: `HTTP ${response.status}: ${response.statusText}`,
            timestamp: Date.now(),
            retryCount: 0
          });
        }

        self.notifyListeners();
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        self.metrics.network.failedRequests.push({
          url,
          error: error instanceof Error ? error.message : 'Network error',
          timestamp: Date.now(),
          retryCount: 0
        });

        self.notifyListeners();
        throw error;
      }
    };
  }

  private recordConsoleError(level: 'error' | 'warning' | 'info', message: string, stack?: string) {
    // Extract component name from stack trace
    let component;
    if (stack) {
      const match = stack.match(/at (\w+)/);
      component = match ? match[1] : undefined;
    }

    this.metrics.console.errors.push({
      message,
      stack,
      timestamp: Date.now(),
      component,
      level
    });

    this.metrics.console.totalErrors++;
    
    // Count recent errors (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.metrics.console.recentErrors = this.metrics.console.errors.filter(
      error => error.timestamp > fiveMinutesAgo
    ).length;

    this.notifyListeners();
  }

  private startMemoryMonitoring() {
    if (!('memory' in performance)) {
      console.warn('Memory API not available');
      return;
    }

    this.memoryInterval = window.setInterval(() => {
      const memory = (performance as any).memory;
      this.metrics.memory = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };

      // Alert for high memory usage (>80% of limit)
      const memoryUsagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      if (memoryUsagePercent > 80) {
        console.warn(`🧠 High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      }

      this.notifyListeners();
    }, 5000); // Every 5 seconds
  }

  private startFrameRateMonitoring() {
    let lastTime = Date.now();
    let frameCount = 0;
    let frameSum = 0;

    const measureFrameRate = () => {
      const currentTime = Date.now();
      const delta = currentTime - lastTime;
      
      if (delta >= 1000) { // Update every second
        const fps = Math.round((frameCount * 1000) / delta);
        
        this.metrics.frameRate.current = fps;
        frameSum += fps;
        frameCount++;
        this.metrics.frameRate.average = Math.round(frameSum / frameCount);
        
        // Count frame drops (below 50fps)
        if (fps < 50) {
          this.metrics.frameRate.drops++;
        }

        lastTime = currentTime;
        frameCount = 0;
        this.notifyListeners();
      }

      if (this.frameRateInterval) {
        requestAnimationFrame(measureFrameRate);
      }
    };

    this.frameRateInterval = 1; // Just a flag
    requestAnimationFrame(measureFrameRate);
  }

  private collectLoadMetrics() {
    // Collect navigation timing
    if ('getEntriesByType' in performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as any;
      if (navigation) {
        this.metrics.loadTime.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
      }
    }

    // Collect paint metrics
    if ('getEntriesByType' in performance) {
      const paintEntries = performance.getEntriesByType('paint');
      paintEntries.forEach(entry => {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.loadTime.firstContentfulPaint = entry.startTime;
        }
      });
    }
  }

  private cleanupOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Clean old console errors
    this.metrics.console.errors = this.metrics.console.errors.filter(
      error => error.timestamp > oneHourAgo
    );

    // Clean old network requests
    this.metrics.network.failedRequests = this.metrics.network.failedRequests.filter(
      request => request.timestamp > oneHourAgo
    );
    this.metrics.network.slowRequests = this.metrics.network.slowRequests.filter(
      request => request.timestamp > oneHourAgo
    );

    // Clean old blocking tasks
    this.metrics.mainThreadBlocking = this.metrics.mainThreadBlocking.filter(
      task => task.timestamp > oneHourAgo
    );

    // Clean old component render data
    this.metrics.components.forEach((perf, componentName) => {
      perf.slowRenders = perf.slowRenders.filter(render => render.timestamp > oneHourAgo);
    });
  }

  // Component performance tracking
  trackComponentRender(componentName: string, renderTime: number, props?: any) {
    if (!this.metrics.components.has(componentName)) {
      this.metrics.components.set(componentName, {
        renderCount: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        mountTime: Date.now(),
        updateCount: 0,
        slowRenders: []
      });
    }

    const perf = this.metrics.components.get(componentName)!;
    perf.renderCount++;
    perf.averageRenderTime = (perf.averageRenderTime * (perf.renderCount - 1) + renderTime) / perf.renderCount;
    perf.lastRenderTime = renderTime;
    perf.updateCount++;

    // Track slow renders (>16ms for 60fps)
    if (renderTime > 16) {
      perf.slowRenders.push({
        duration: renderTime,
        timestamp: Date.now(),
        props: props ? JSON.stringify(props).slice(0, 100) : undefined
      });

      if (renderTime > 50) {
        console.warn(`🐌 Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
    }

    this.notifyListeners();
  }

  // Get current metrics
  getMetrics(): PerformanceMetrics {
    return structuredClone(this.metrics);
  }

  // Subscribe to metrics updates
  subscribe(listener: (metrics: PerformanceMetrics) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.metrics);
      } catch (error) {
        console.error('Error in performance metrics listener:', error);
      }
    });
  }

  // Generate performance report
  generateReport(): string {
    const metrics = this.getMetrics();
    const memoryMB = Math.round(metrics.memory.usedJSHeapSize / 1024 / 1024);
    const memoryPercent = Math.round((metrics.memory.usedJSHeapSize / metrics.memory.jsHeapSizeLimit) * 100);

    let report = `📊 TU Reader Performance Report - ${new Date().toLocaleString()}\n\n`;
    
    // Memory
    report += `🧠 Memory Usage:\n`;
    report += `  Used: ${memoryMB} MB (${memoryPercent}%)\n`;
    report += `  Limit: ${Math.round(metrics.memory.jsHeapSizeLimit / 1024 / 1024)} MB\n\n`;

    // Frame Rate
    report += `🎞️ Frame Rate:\n`;
    report += `  Current: ${metrics.frameRate.current} FPS\n`;
    report += `  Average: ${metrics.frameRate.average} FPS\n`;
    report += `  Frame Drops: ${metrics.frameRate.drops}\n\n`;

    // Load Performance
    report += `⚡ Load Performance:\n`;
    report += `  DOM Content Loaded: ${metrics.loadTime.domContentLoaded.toFixed(2)}ms\n`;
    report += `  First Contentful Paint: ${metrics.loadTime.firstContentfulPaint.toFixed(2)}ms\n`;
    if (metrics.loadTime.firstInputDelay > 0) {
      report += `  First Input Delay: ${metrics.loadTime.firstInputDelay.toFixed(2)}ms\n`;
    }
    report += `\n`;

    // Network
    report += `🌐 Network Performance:\n`;
    report += `  Total Requests: ${metrics.network.totalRequests}\n`;
    report += `  Average Response Time: ${metrics.network.averageResponseTime.toFixed(2)}ms\n`;
    report += `  Failed Requests: ${metrics.network.failedRequests.length}\n`;
    report += `  Slow Requests: ${metrics.network.slowRequests.length}\n\n`;

    // Console Errors
    report += `🚨 Console Issues:\n`;
    report += `  Total Errors: ${metrics.console.totalErrors}\n`;
    report += `  Recent Errors (5min): ${metrics.console.recentErrors}\n\n`;

    // Main Thread Blocking
    if (metrics.mainThreadBlocking.length > 0) {
      report += `⏸️ Main Thread Blocking:\n`;
      report += `  Total Blocking Tasks: ${metrics.mainThreadBlocking.length}\n`;
      const avgBlockTime = metrics.mainThreadBlocking.reduce((sum, task) => sum + task.duration, 0) / metrics.mainThreadBlocking.length;
      report += `  Average Block Time: ${avgBlockTime.toFixed(2)}ms\n\n`;
    }

    // Component Performance
    if (metrics.components.size > 0) {
      report += `⚛️ Component Performance:\n`;
      metrics.components.forEach((perf, name) => {
        if (perf.renderCount > 0) {
          report += `  ${name}:\n`;
          report += `    Renders: ${perf.renderCount}\n`;
          report += `    Avg Render Time: ${perf.averageRenderTime.toFixed(2)}ms\n`;
          report += `    Slow Renders: ${perf.slowRenders.length}\n`;
        }
      });
    }

    return report;
  }

  // Export metrics for analysis
  exportMetrics(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }
}

// Singleton instance
let diagnosticsInstance: PerformanceDiagnostics | null = null;

export function getPerformanceDiagnostics(): PerformanceDiagnostics {
  if (!diagnosticsInstance) {
    diagnosticsInstance = new PerformanceDiagnostics();
  }
  return diagnosticsInstance;
}

// React hook for component performance tracking
export function useComponentPerformance(componentName: string) {
  const [renderCount, setRenderCount] = React.useState(0);
  const diagnostics = getPerformanceDiagnostics();
  
  React.useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const renderTime = performance.now() - startTime;
      diagnostics.trackComponentRender(componentName, renderTime);
      setRenderCount(prev => prev + 1);
    };
  });
  
  return { renderCount };
}

// React hook for performance metrics
export function usePerformanceMetrics() {
  const [metrics, setMetrics] = React.useState<PerformanceMetrics | null>(null);
  
  React.useEffect(() => {
    const diagnostics = getPerformanceDiagnostics();
    diagnostics.start();
    
    const unsubscribe = diagnostics.subscribe(setMetrics);
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  return metrics;
}

import React from 'react';
