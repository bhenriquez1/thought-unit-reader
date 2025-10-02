// components/performance/LightModeToggle.tsx
/**
 * Light Mode Toggle System
 * Addresses: Performance toggles, Light mode, Progressive enhancement
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { optimizedPDFHandler } from '@/lib/performance/OptimizedPDFHandler';
import { optimizedHighlightEngine } from '@/lib/performance/OptimizedHighlightEngine';
import { performanceProfiler } from '@/lib/performance/PerformanceProfiler';

interface LightModeConfig {
  disableLiveHighlighting: boolean;
  disablePatternScoring: boolean;
  limitInitialPages: boolean;
  reduceAnimations: boolean;
  simplifyRendering: boolean;
  maxInitialPages: number;
  highlightDebounceMs: number;
  preloadDistance: number;
}

interface PerformanceMetrics {
  memoryUsage: number;
  fps: number;
  renderTime: number;
  isSlowDevice: boolean;
}

const DEFAULT_LIGHT_CONFIG: LightModeConfig = {
  disableLiveHighlighting: true,
  disablePatternScoring: true,
  limitInitialPages: true,
  reduceAnimations: true,
  simplifyRendering: true,
  maxInitialPages: 5,
  highlightDebounceMs: 1000,
  preloadDistance: 0,
};

const DEFAULT_FULL_CONFIG: LightModeConfig = {
  disableLiveHighlighting: false,
  disablePatternScoring: false,
  limitInitialPages: false,
  reduceAnimations: false,
  simplifyRendering: false,
  maxInitialPages: 50,
  highlightDebounceMs: 250,
  preloadDistance: 2,
};

export interface LightModeState {
  enabled: boolean;
  autoEnabled: boolean;
  config: LightModeConfig;
  metrics: PerformanceMetrics | null;
  reason?: string;
}

// Hook for light mode management
export function useLightMode(documentSize: number = 0) {
  const [state, setState] = useState<LightModeState>({
    enabled: false,
    autoEnabled: false,
    config: DEFAULT_FULL_CONFIG,
    metrics: null,
  });

  // Enable light mode
  const enableLightMode = useCallback((reason?: string, auto = false) => {
    console.log(`🌟 Enabling Light Mode: ${reason || 'Manual'}`);
    
    const config = { ...DEFAULT_LIGHT_CONFIG };
    
    // Apply optimizations
    optimizedPDFHandler.dispose();
    optimizedHighlightEngine.setLightMode(true);
    
    // Update CSS for reduced animations
    if (config.reduceAnimations) {
      document.documentElement.style.setProperty('--animation-duration', '0s');
      document.documentElement.style.setProperty('--transition-duration', '0s');
    }
    
    setState(prev => ({
      ...prev,
      enabled: true,
      autoEnabled: auto,
      config,
      reason,
    }));
  }, []);

  // Disable light mode
  const disableLightMode = useCallback(() => {
    console.log('💫 Disabling Light Mode');
    
    const config = { ...DEFAULT_FULL_CONFIG };
    
    // Restore optimizations
    optimizedHighlightEngine.setLightMode(false);
    
    // Restore CSS animations
    document.documentElement.style.removeProperty('--animation-duration');
    document.documentElement.style.removeProperty('--transition-duration');
    
    setState(prev => ({
      ...prev,
      enabled: false,
      autoEnabled: false,
      config,
      reason: undefined,
    }));
  }, []);

  // Monitor performance metrics
  const updateMetrics = useCallback(() => {
    const memory = (performance as any).memory;
    const metrics: PerformanceMetrics = {
      memoryUsage: memory?.usedJSHeapSize || 0,
      fps: 60, // Will be updated by FPS counter
      renderTime: 0, // Will be updated by render monitoring
      isSlowDevice: false,
    };

    // Detect slow device
    const isSlowDevice = (
      memory && memory.usedJSHeapSize > 150 * 1024 * 1024 || // 150MB+ usage
      navigator.hardwareConcurrency < 4 || // Less than 4 cores
      documentSize > 20 * 1024 * 1024 // 20MB+ document
    );

    metrics.isSlowDevice = isSlowDevice;

    setState(prev => ({ ...prev, metrics }));

    // Auto-enable light mode if performance is poor
    if (isSlowDevice && !state.enabled && !state.autoEnabled) {
      enableLightMode('Auto-enabled due to performance constraints', true);
    }
  }, [documentSize, state.enabled, state.autoEnabled, enableLightMode]);

  // Toggle light mode
  const toggleLightMode = useCallback(() => {
    if (state.enabled) {
      disableLightMode();
    } else {
      enableLightMode('Manual toggle');
    }
  }, [state.enabled, enableLightMode, disableLightMode]);

  // Monitor performance periodically
  useEffect(() => {
    updateMetrics();
    const interval = setInterval(updateMetrics, 5000); // Every 5 seconds
    return () => clearInterval(interval);
  }, [updateMetrics]);

  // Auto-enable for large documents
  useEffect(() => {
    if (documentSize > 15 * 1024 * 1024 && !state.enabled) { // 15MB+
      enableLightMode('Large document detected', true);
    }
  }, [documentSize, state.enabled, enableLightMode]);

  return {
    ...state,
    enableLightMode,
    disableLightMode,
    toggleLightMode,
    updateMetrics,
  };
}

// Light Mode Toggle Component
interface LightModeToggleProps {
  documentSize?: number;
  className?: string;
  showMetrics?: boolean;
}

export const LightModeToggle: React.FC<LightModeToggleProps> = React.memo(({
  documentSize = 0,
  className = '',
  showMetrics = false,
}) => {
  const lightMode = useLightMode(documentSize);

  const statusColor = useMemo(() => {
    if (lightMode.enabled) {
      return lightMode.autoEnabled ? 'text-yellow-400' : 'text-green-400';
    }
    return 'text-gray-400';
  }, [lightMode.enabled, lightMode.autoEnabled]);

  const statusIcon = useMemo(() => {
    if (lightMode.enabled) {
      return lightMode.autoEnabled ? '⚡' : '🌟';
    }
    return '💫';
  }, [lightMode.enabled, lightMode.autoEnabled]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Toggle Button */}
      <button
        onClick={lightMode.toggleLightMode}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
          ${lightMode.enabled 
            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }
        `}
        title={lightMode.enabled ? 'Disable Light Mode' : 'Enable Light Mode'}
      >
        <span className="text-lg">{statusIcon}</span>
        <span>Light Mode</span>
        {lightMode.autoEnabled && (
          <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded">
            AUTO
          </span>
        )}
      </button>

      {/* Status Indicator */}
      <div className={`text-xs ${statusColor}`}>
        {lightMode.enabled ? (
          <div className="flex flex-col">
            <span>ON</span>
            {lightMode.reason && (
              <span className="text-gray-500 text-xs">
                {lightMode.reason}
              </span>
            )}
          </div>
        ) : (
          <span>OFF</span>
        )}
      </div>

      {/* Performance Metrics */}
      {showMetrics && lightMode.metrics && (
        <div className="text-xs text-gray-500 border-l pl-2 ml-2">
          <div>Memory: {(lightMode.metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</div>
          <div>FPS: {lightMode.metrics.fps}</div>
          {lightMode.metrics.isSlowDevice && (
            <div className="text-orange-500">⚠️ Slow Device</div>
          )}
        </div>
      )}
    </div>
  );
});

// Performance Warning Component
interface PerformanceWarningProps {
  show: boolean;
  onEnableLightMode: () => void;
  onDismiss: () => void;
  metrics?: PerformanceMetrics;
}

export const PerformanceWarning: React.FC<PerformanceWarningProps> = React.memo(({
  show,
  onEnableLightMode,
  onDismiss,
  metrics,
}) => {
  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 max-w-md bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-lg z-50">
      <div className="flex items-start gap-3">
        <div className="text-orange-500 text-xl">⚠️</div>
        <div className="flex-1">
          <h4 className="font-semibold text-orange-800 mb-2">
            Performance Issues Detected
          </h4>
          <p className="text-sm text-orange-700 mb-3">
            Your device may be struggling with this large PDF. We recommend enabling Light Mode for better performance.
          </p>
          
          {metrics && (
            <div className="text-xs text-orange-600 mb-3 space-y-1">
              {metrics.memoryUsage > 100 * 1024 * 1024 && (
                <div>• High memory usage: {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</div>
              )}
              {metrics.isSlowDevice && (
                <div>• Device constraints detected</div>
              )}
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={onEnableLightMode}
              className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
            >
              Enable Light Mode
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Progressive Loading Component
interface ProgressiveLoaderProps {
  totalPages: number;
  loadedPages: number;
  lightModeEnabled: boolean;
  maxInitialPages: number;
}

export const ProgressiveLoader: React.FC<ProgressiveLoaderProps> = React.memo(({
  totalPages,
  loadedPages,
  lightModeEnabled,
  maxInitialPages,
}) => {
  const shouldShow = lightModeEnabled && loadedPages < totalPages;
  
  if (!shouldShow) return null;

  const progress = (loadedPages / Math.min(totalPages, maxInitialPages)) * 100;
  const remainingPages = totalPages - loadedPages;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-50 border border-blue-200 rounded-lg p-3 shadow-lg z-40">
      <div className="flex items-center gap-3">
        <div className="text-blue-500">📄</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-blue-800">
            Loading pages... ({loadedPages}/{totalPages})
          </div>
          <div className="w-48 bg-blue-100 rounded-full h-2 mt-1">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {remainingPages > 0 && (
            <div className="text-xs text-blue-600 mt-1">
              {remainingPages} pages will load on demand
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Configuration Panel Component
interface LightModeConfigProps {
  config: LightModeConfig;
  onChange: (config: LightModeConfig) => void;
  className?: string;
}

export const LightModeConfig: React.FC<LightModeConfigProps> = React.memo(({
  config,
  onChange,
  className = '',
}) => {
  const handleChange = useCallback((key: keyof LightModeConfig, value: any) => {
    onChange({ ...config, [key]: value });
  }, [config, onChange]);

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-semibold text-gray-800">Light Mode Configuration</h3>
      
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.disableLiveHighlighting}
            onChange={(e) => handleChange('disableLiveHighlighting', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Disable live highlighting</span>
        </label>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.disablePatternScoring}
            onChange={(e) => handleChange('disablePatternScoring', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Disable pattern scoring</span>
        </label>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.limitInitialPages}
            onChange={(e) => handleChange('limitInitialPages', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Limit initial pages</span>
        </label>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.reduceAnimations}
            onChange={(e) => handleChange('reduceAnimations', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Reduce animations</span>
        </label>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Max initial pages: {config.maxInitialPages}
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={config.maxInitialPages}
            onChange={(e) => handleChange('maxInitialPages', parseInt(e.target.value))}
            className="w-full"
          />
        </div>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Highlight debounce: {config.highlightDebounceMs}ms
          </label>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={config.highlightDebounceMs}
            onChange={(e) => handleChange('highlightDebounceMs', parseInt(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
});

// Export utilities
export { DEFAULT_LIGHT_CONFIG, DEFAULT_FULL_CONFIG };
export type { PerformanceMetrics };
