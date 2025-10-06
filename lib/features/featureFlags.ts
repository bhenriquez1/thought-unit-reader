// Feature flags system for TU Reader performance and stability
// Provides runtime control over features to prevent performance issues

interface FeatureConfig {
  enabled: boolean;
  threshold?: number;
  fallback?: any;
  description: string;
  performance?: {
    memoryLimit?: number; // MB
    frameRateThreshold?: number; // FPS
    networkLatencyThreshold?: number; // ms
  };
}

interface FeatureFlags {
  // Performance-related flags
  LIGHT_MODE: FeatureConfig;
  DISABLE_LIVE_PATTERN: FeatureConfig;
  ENABLE_WEB_WORKERS: FeatureConfig;
  LAZY_PDF_LOADING: FeatureConfig;
  DEBOUNCED_INPUT: FeatureConfig;
  VIRTUALIZED_LISTS: FeatureConfig;
  REDUCED_ANIMATIONS: FeatureConfig;
  
  // Stability flags
  ERROR_BOUNDARY_ENABLED: FeatureConfig;
  PERFORMANCE_MONITORING: FeatureConfig;
  AUTOMATIC_DEGRADATION: FeatureConfig;
  
  // Memory management
  AGGRESSIVE_CLEANUP: FeatureConfig;
  PDF_CANVAS_RECYCLING: FeatureConfig;
  HIGHLIGHT_CACHING: FeatureConfig;
  
  // Network optimizations
  REQUEST_BATCHING: FeatureConfig;
  OFFLINE_MODE: FeatureConfig;
  PRELOAD_STRATEGY: FeatureConfig;
  
  // Prototype testing flags
  PROTOTYPE_TESTING_MODE: FeatureConfig;
  DISABLE_CLEAN_HYBRID_READER: FeatureConfig;
  DISABLE_PATTERN_VIEW: FeatureConfig;
  DISABLE_PATTERN_TRAINING_HYBRID: FeatureConfig;
  ENABLE_UNIVERSAL_PATTERN_BUTLER: FeatureConfig;
  ENABLE_READER_TYPE_SELECTOR: FeatureConfig;
  DISABLE_ORIGINAL_PDF_VIEW: FeatureConfig;
}

// Default feature configuration
const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  LIGHT_MODE: {
    enabled: false,
    description: 'Disable live highlighting and heavy UI features',
    performance: {
      memoryLimit: 100, // Enable when memory > 100MB
      frameRateThreshold: 30 // Enable when FPS < 30
    }
  },
  
  DISABLE_LIVE_PATTERN: {
    enabled: false,
    description: 'Load pattern rules on demand instead of live processing',
    performance: {
      memoryLimit: 150,
      networkLatencyThreshold: 2000
    }
  },
  
  ENABLE_WEB_WORKERS: {
    enabled: true,
    description: 'Use web workers for heavy processing tasks',
    fallback: false
  },
  
  LAZY_PDF_LOADING: {
    enabled: true,
    description: 'Load PDF pages on demand (current ±1)',
    threshold: 3 // Number of pages to keep in memory
  },
  
  DEBOUNCED_INPUT: {
    enabled: true,
    description: 'Debounce user inputs to prevent excessive processing',
    threshold: 250 // Debounce delay in ms
  },
  
  VIRTUALIZED_LISTS: {
    enabled: true,
    description: 'Use virtualization for long note lists',
    threshold: 20 // Virtualize when more than 20 items
  },
  
  REDUCED_ANIMATIONS: {
    enabled: false,
    description: 'Reduce or disable animations for better performance',
    performance: {
      frameRateThreshold: 45
    }
  },
  
  ERROR_BOUNDARY_ENABLED: {
    enabled: true,
    description: 'Enable error boundaries for stability'
  },
  
  PERFORMANCE_MONITORING: {
    enabled: process.env.NODE_ENV === 'development',
    description: 'Enable real-time performance monitoring'
  },
  
  AUTOMATIC_DEGRADATION: {
    enabled: true,
    description: 'Automatically enable performance modes when needed',
    performance: {
      memoryLimit: 200,
      frameRateThreshold: 25
    }
  },
  
  AGGRESSIVE_CLEANUP: {
    enabled: false,
    description: 'More frequent cleanup of unused resources',
    performance: {
      memoryLimit: 120
    }
  },
  
  PDF_CANVAS_RECYCLING: {
    enabled: true,
    description: 'Reuse canvas elements for PDF rendering'
  },
  
  HIGHLIGHT_CACHING: {
    enabled: true,
    description: 'Cache highlight computations',
    threshold: 100 // Cache size limit
  },
  
  REQUEST_BATCHING: {
    enabled: true,
    description: 'Batch multiple requests together',
    threshold: 100 // Batch delay in ms
  },
  
  OFFLINE_MODE: {
    enabled: false,
    description: 'Enable offline functionality',
    fallback: 'cache-first'
  },
  
  PRELOAD_STRATEGY: {
    enabled: true,
    description: 'Preload critical resources',
    threshold: 2 // Number of pages to preload
  },
  
  // Prototype testing flags
  PROTOTYPE_TESTING_MODE: {
    enabled: true,
    description: 'Enable prototype testing mode - routes to UniversalPatternButlerReader'
  },
  
  DISABLE_CLEAN_HYBRID_READER: {
    enabled: true,
    description: 'Temporarily disable CleanHybridReader for prototype testing'
  },
  
  DISABLE_PATTERN_VIEW: {
    enabled: true,
    description: 'Temporarily disable PatternView for prototype testing'
  },
  
  DISABLE_PATTERN_TRAINING_HYBRID: {
    enabled: true,
    description: 'Temporarily disable PatternTrainingHybridReader for prototype testing'
  },
  
  ENABLE_UNIVERSAL_PATTERN_BUTLER: {
    enabled: true,
    description: 'Enable UniversalPatternButlerReader prototype component with reader-type selector'
  },
  
  ENABLE_READER_TYPE_SELECTOR: {
    enabled: true,
    description: 'Enable reader-type toggle between Universal and NoteLab modes in UniversalPatternButlerReader'
  },
  
  DISABLE_ORIGINAL_PDF_VIEW: {
    enabled: true,
    description: 'Temporarily disable original PDF view due to loading issues - routes users to working readers'
  }
};

class FeatureFlagManager {
  private flags: FeatureFlags;
  private listeners: Array<(flags: FeatureFlags) => void> = [];
  private performanceMetrics: {
    memoryUsage: number;
    frameRate: number;
    networkLatency: number;
    errorRate: number;
  } = {
    memoryUsage: 0,
    frameRate: 60,
    networkLatency: 0,
    errorRate: 0
  };
  
  private monitoringInterval: number | null = null;

  constructor(initialFlags?: Partial<FeatureFlags>) {
    this.flags = { ...DEFAULT_FEATURE_FLAGS, ...initialFlags };
    
    // Load flags from localStorage if available
    this.loadFromStorage();
    
    // Start performance monitoring for automatic degradation
    if (this.flags.AUTOMATIC_DEGRADATION.enabled) {
      this.startPerformanceMonitoring();
    }
  }

  private loadFromStorage() {
    // Only access localStorage in browser environment
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('tuReader_featureFlags');
      if (stored) {
        const storedFlags = JSON.parse(stored);
        
        // Merge with defaults, preserving structure
        Object.keys(this.flags).forEach(key => {
          const flagKey = key as keyof FeatureFlags;
          if (storedFlags[flagKey]) {
            this.flags[flagKey] = {
              ...this.flags[flagKey],
              enabled: storedFlags[flagKey].enabled !== undefined 
                ? storedFlags[flagKey].enabled 
                : this.flags[flagKey].enabled
            };
          }
        });
        
        console.log('🎛️ Feature flags loaded from storage');
      }
    } catch (error) {
      console.warn('Failed to load feature flags from storage:', error);
    }
  }

  private saveToStorage() {
    // Only access localStorage in browser environment
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem('tuReader_featureFlags', JSON.stringify(this.flags));
    } catch (error) {
      console.warn('Failed to save feature flags to storage:', error);
    }
  }

  private startPerformanceMonitoring() {
    // Only start monitoring in browser environment
    if (typeof window !== 'undefined') {
      this.monitoringInterval = window.setInterval(() => {
        this.updatePerformanceMetrics();
        this.checkAutomaticDegradation();
      }, 5000); // Check every 5 seconds
    }
  }

  private updatePerformanceMetrics() {
    // Update memory usage
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.performanceMetrics.memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    }

    // Estimate frame rate (simplified)
    let frameCount = 0;
    const startTime = Date.now();
    
    const countFrame = () => {
      frameCount++;
      if (Date.now() - startTime < 1000) {
        requestAnimationFrame(countFrame);
      } else {
        this.performanceMetrics.frameRate = frameCount;
      }
    };
    
    requestAnimationFrame(countFrame);
  }

  private checkAutomaticDegradation() {
    const config = this.flags.AUTOMATIC_DEGRADATION;
    if (!config.enabled || !config.performance) return;

    let degradationNeeded = false;
    let reason = '';

    // Check memory usage
    if (config.performance.memoryLimit && 
        this.performanceMetrics.memoryUsage > config.performance.memoryLimit) {
      degradationNeeded = true;
      reason += `High memory usage: ${this.performanceMetrics.memoryUsage}MB; `;
    }

    // Check frame rate
    if (config.performance.frameRateThreshold && 
        this.performanceMetrics.frameRate < config.performance.frameRateThreshold) {
      degradationNeeded = true;
      reason += `Low frame rate: ${this.performanceMetrics.frameRate}FPS; `;
    }

    if (degradationNeeded) {
      console.warn(`⚠️ Automatic degradation triggered: ${reason}`);
      this.enablePerformanceMode();
    }
  }

  private enablePerformanceMode() {
    const changes: Array<keyof FeatureFlags> = [];

    // Enable light mode
    if (!this.flags.LIGHT_MODE.enabled) {
      this.flags.LIGHT_MODE.enabled = true;
      changes.push('LIGHT_MODE');
    }

    // Enable reduced animations
    if (!this.flags.REDUCED_ANIMATIONS.enabled) {
      this.flags.REDUCED_ANIMATIONS.enabled = true;
      changes.push('REDUCED_ANIMATIONS');
    }

    // Enable aggressive cleanup
    if (!this.flags.AGGRESSIVE_CLEANUP.enabled) {
      this.flags.AGGRESSIVE_CLEANUP.enabled = true;
      changes.push('AGGRESSIVE_CLEANUP');
    }

    if (changes.length > 0) {
      console.log(`🎛️ Performance mode activated: ${changes.join(', ')}`);
      this.notifyListeners();
      this.saveToStorage();
    }
  }

  // Public API
  isEnabled(flag: keyof FeatureFlags): boolean {
    return this.flags[flag].enabled;
  }

  getConfig<T = any>(flag: keyof FeatureFlags): T | undefined {
    const config = this.flags[flag];
    return config.threshold !== undefined ? config.threshold as T :
           config.fallback !== undefined ? config.fallback as T :
           undefined;
  }

  enable(flag: keyof FeatureFlags, reason?: string) {
    if (!this.flags[flag].enabled) {
      this.flags[flag].enabled = true;
      console.log(`🎛️ Feature enabled: ${flag}${reason ? ` (${reason})` : ''}`);
      this.notifyListeners();
      this.saveToStorage();
    }
  }

  disable(flag: keyof FeatureFlags, reason?: string) {
    if (this.flags[flag].enabled) {
      this.flags[flag].enabled = false;
      console.log(`🎛️ Feature disabled: ${flag}${reason ? ` (${reason})` : ''}`);
      this.notifyListeners();
      this.saveToStorage();
    }
  }

  toggle(flag: keyof FeatureFlags) {
    this.flags[flag].enabled = !this.flags[flag].enabled;
    console.log(`🎛️ Feature toggled: ${flag} -> ${this.flags[flag].enabled ? 'ON' : 'OFF'}`);
    this.notifyListeners();
    this.saveToStorage();
  }

  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  updateFlags(updates: Partial<FeatureFlags>) {
    Object.keys(updates).forEach(key => {
      const flagKey = key as keyof FeatureFlags;
      if (updates[flagKey]) {
        this.flags[flagKey] = { ...this.flags[flagKey], ...updates[flagKey] };
      }
    });
    
    this.notifyListeners();
    this.saveToStorage();
  }

  // Performance-aware feature checking
  shouldUseFeature(flag: keyof FeatureFlags): boolean {
    const config = this.flags[flag];
    if (!config.enabled) return false;

    // Check performance thresholds
    if (config.performance) {
      const { memoryLimit, frameRateThreshold, networkLatencyThreshold } = config.performance;
      
      if (memoryLimit && this.performanceMetrics.memoryUsage > memoryLimit) {
        return false;
      }
      
      if (frameRateThreshold && this.performanceMetrics.frameRate < frameRateThreshold) {
        return false;
      }
      
      if (networkLatencyThreshold && this.performanceMetrics.networkLatency > networkLatencyThreshold) {
        return false;
      }
    }

    return true;
  }

  // Subscribe to flag changes
  subscribe(listener: (flags: FeatureFlags) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.flags);
      } catch (error) {
        console.error('Error in feature flag listener:', error);
      }
    });
  }

  // Cleanup
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.listeners = [];
  }

  // Debug methods
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  generateReport(): string {
    const enabledFlags = Object.entries(this.flags)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);

    const disabledFlags = Object.entries(this.flags)
      .filter(([_, config]) => !config.enabled)
      .map(([name, _]) => name);

    return `🎛️ Feature Flags Report - ${new Date().toLocaleString()}

📊 Performance Metrics:
  Memory Usage: ${this.performanceMetrics.memoryUsage} MB
  Frame Rate: ${this.performanceMetrics.frameRate} FPS
  Network Latency: ${this.performanceMetrics.networkLatency} ms
  Error Rate: ${this.performanceMetrics.errorRate}%

✅ Enabled Features (${enabledFlags.length}):
${enabledFlags.map(flag => `  • ${flag}: ${this.flags[flag as keyof FeatureFlags].description}`).join('\n')}

❌ Disabled Features (${disabledFlags.length}):
${disabledFlags.map(flag => `  • ${flag}: ${this.flags[flag as keyof FeatureFlags].description}`).join('\n')}`;
  }
}

// Singleton instance
let featureFlagManager: FeatureFlagManager | null = null;

export function getFeatureFlags(): FeatureFlagManager {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager();
  }
  return featureFlagManager;
}

// React hook for feature flags
export function useFeatureFlags() {
  const [flags, setFlags] = React.useState<FeatureFlags>(getFeatureFlags().getAllFlags());
  
  React.useEffect(() => {
    const manager = getFeatureFlags();
    const unsubscribe = manager.subscribe(setFlags);
    return unsubscribe;
  }, []);
  
  return {
    flags,
    isEnabled: (flag: keyof FeatureFlags) => getFeatureFlags().isEnabled(flag),
    shouldUse: (flag: keyof FeatureFlags) => getFeatureFlags().shouldUseFeature(flag),
    enable: (flag: keyof FeatureFlags) => getFeatureFlags().enable(flag),
    disable: (flag: keyof FeatureFlags) => getFeatureFlags().disable(flag),
    toggle: (flag: keyof FeatureFlags) => getFeatureFlags().toggle(flag),
    getConfig: <T = any>(flag: keyof FeatureFlags) => getFeatureFlags().getConfig<T>(flag)
  };
}

// Utility functions
export function withFeatureFlag<P extends object>(
  Component: React.ComponentType<P>,
  flag: keyof FeatureFlags,
  fallback?: React.ComponentType<P>
) {
  const WrappedComponent = (props: P) => {
    const { isEnabled } = useFeatureFlags();
    
    if (isEnabled(flag)) {
      return React.createElement(Component, props);
    }
    
    if (fallback) {
      return React.createElement(fallback, props);
    }
    
    return null;
  };
  
  WrappedComponent.displayName = `withFeatureFlag(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

export type { FeatureFlags, FeatureConfig };

import React from 'react';
